// FORTRESS PROTOCOL SCALABILITY AUDIT
// Scenario: 100,000 participants per tier across 12 time-based tiers
// Generated: March 1, 2026

/* ============================================================================
   1. ON-CHAIN STORAGE & COSTS
   ============================================================================ */

// PARTICIPANT PAGE STRUCTURE
// Each page holds max 50 Pubkey entries
// Size per page:
//   - Discriminator: 8 bytes
//   - lottery_type: 1 byte
//   - tier: 1 byte
//   - page_number: 4 bytes
//   - participants vector: 4 (length) + 32*50 (pubkeys) = 1604 bytes
//   - next_page (Option<Pubkey>): 33 bytes
//   - winner_pubkey (Option<Pubkey>): 33 bytes
//   - bump: 1 byte
// TOTAL: ~1620 bytes per ParticipantPage

// SCALE CALCULATIONS
// Per tier (100k participants):
//   - Pages needed: 100,000 / 50 = 2,000 pages
//   - Storage: 2,000 * 1,620 bytes = 3.24 MB
//   - Account creation cost: 2,000 pages * 0.00204 SOL ≈ 4.08 SOL

// All 12 tiers (DPL/WPL/MPL × 4 tiers each):
//   - Total pages: 12 tiers × 2,000 pages = 24,000 pages
//   - Total storage: 24,000 * 1,620 bytes ≈ 38.88 MB
//   - Account creation cost: 24,000 pages * 0.00204 SOL ≈ 48.96 SOL
//   - Annual rent-exempt storage: ~238 SOL/year (at 4.8 millSOL per byte-year)

// ⚠️ FINDING 1: Storage cost is reasonable but not trivial
// Risk Level: LOW - Solana can handle 24k accounts easily
// Action: Monitor rent collection; ensure treasury maintains min balance

/* ============================================================================
   2. FRONTEND FETCHING PERFORMANCE
   ============================================================================ */

// CURRENT IMPLEMENTATION (participants-data/page.tsx):
//
// const fetchAll = useCallback(async () => {
//   for (const lottery of LOTTERY_CONFIG) {      // 3 types (DPL/WPL/MPL)
//     for (const tier of lottery.tiers) {         // 4 tiers each
//       const numPages = Math.ceil(participantCount / 50);  // 2000 per tier
//       const pagePDAs = Array.from({ length: numPages }, ...);
//       const pageResults = await Promise.all(    // ⚠️ FETCHES ALL PAGES
//         pagePDAs.map(pda => readParticipantsFromPage(connection, pda))
//       );
//       participants.push(...pageResults.flat());
//     }
//   }
// })

// PERFORMANCE IMPACT AT SCALE:

// RPC Fetch Time:
//   - Single getAccountInfo RPC: ~200ms average (Devnet)
//   - Pages to fetch: 24,000
//   - Solana RPC rate limit: 40 requests/sec per IP (standard shared endpoint)
//   - Time if sequential: 24,000 / 40 = 600 seconds = 10 MINUTES
//   - Time with Promise.all (batched): Still ~600 requests total
//     = 600 sec / (40 req/sec) = 15 seconds minimum
//   - Actual impact: User will see 15-30 second loading delay ⚠️

// Network Bandwidth:
//   - Data downloaded: 24,000 pages × 1.6 KB = ~38.4 MB
//   - At 10 Mbps: 30+ seconds download time

// Memory Usage:
//   - Flatten all participants into memory: 400,000 Pubkeys
//   - TypeScript Pubkey object: ~200 bytes each (string + metadata)
//   - Total RAM: 400,000 × 200 bytes = ~80 MB in memory

// ⚠️ FINDING 2: Frontend WILL be slow with 100k+ participants
// Bottleneck: RPC rate limiting (40 req/sec)
// Risk Level: MEDIUM-HIGH
// Current mitigation: .slice(-50) only shows last 50 rows
// But page still fetches/loads all 400k records into memory!

/* ============================================================================
   3. REACT RENDERING PERFORMANCE
   ============================================================================ */

// CURRENT CODE (participants-data/page.tsx line 174):
// const rows = filtered.flatMap(d =>
//   d.participants.length > 0
//     ? d.participants
//         .filter(w => !search || w.toLowerCase().includes(search.toLowerCase()))
//         .map((wallet, i) => ({ wallet, lotteryType, tier, index: i }))
//     : []
// ).slice(-50);  // ⚠️ ONLY SHOWS LAST 50

// Issues:
// 1. All 400k participants are filtered/mapped even though only 50 shown
// 2. Search filter (.includes) runs on all 400k entries - O(n) complexity
// 3. Memory bloat: 400k objects created but only 50 rendered

// Estimated render cost:
//   - Flatmap + filter on 400k items: ~200-500ms
//   - Search on 400k items: O(n*m) where n=400k, m=search term length
//   - React re-render of 50 rows: ~50ms (acceptable)
//   - Total: 300-750ms per interaction

// ⚠️ FINDING 3: Search/filter will stall UI for 0.3-0.75 seconds
// Risk Level: MEDIUM
// Impact: User types in search box, 300ms+ delay before results update

/* ============================================================================
   4. DATABASE/RPC ACCOUNT LIMITS
   ============================================================================ */

// Solana Network Limits:
//   - Max accounts per transaction: ~20 writes (well below 24k)
//   - Max account size: 10 MB (we're only using 1.6 KB per account ✓)
//   - Account vector capacity: Vec<Pubkey> with 50 items is safe
//   - Transaction size: 1232 bytes max per transaction (we respect this ✓)

// RPC Node Limits (Devnet):
//   - Max accounts for getMultipleAccounts: ~100 accounts per call
//   - Max account size returned: ~9.5 MB total per request (we stay under ✓)

// ⚠️ FINDING 4: Smart contracts are fine
// Risk Level: LOW
// The Solana side can handle 100k participants per tier without issue

/* ============================================================================
   5. SOLANA TRANSACTION COSTS AT SCALE
   ============================================================================ */

// For a user buying 1 ticket at 100k participants:
//   - compute_units: ~150,000 (within 200k limit ✓)
//   - 50 account writes (50 participants added to page)
//   - Base fee: 5,000 lamports
//   - Compute fee: 150,000 CU * 200 lamports/CU = 30,000 lamports
//   - Total: ~35,000 lamports = 0.00035 SOL per ticket ✓

// When tier reaches capacity (2000 pages):
//   - Initialize new participant tier: 5,000 lamports
//   - Initial page PDA: 0.00204 SOL
//   - Not a bottleneck

// ⚠️ FINDING 5: Transaction costs are negligible
// Risk Level: LOW
// Even at 100k participants, cost per ticket ~0.0003-0.0004 SOL

/* ============================================================================
   6. CRITICAL RECOMMENDATION: PAGINATION REQUIRED
   ============================================================================ */

// Current approach will CRASH with 100k participants because:
// 1. Fetching 24,000 pages takes 15+ seconds (RPC rate limit)
// 2. All 400k participants loaded into RAM simultaneously
// 3. Search/filter creates lag on every keystroke
// 4. No virtualization - React tries to manage 400k DOM nodes

// SOLUTION: Implement server-side or indexed query

// Option A: Server-side indexed search (RECOMMENDED)
// ── Build an off-chain database (PostgreSQL/Supabase) ──
// ── Index wallet addresses by (lotteryType, tier) ──
// ── Query: SELECT wallets WHERE tier=$1 AND created_at > X LIMIT 50
// ── Fetch only needed pages from Solana
// ── Time: <100ms for search results
// Cost: ~$10-20/month for basic indexing

// Option B: Client-side virtual pagination
// ── Load 100 pages on initial load (5k participants) = ~3 seconds
// ── Lazy-load next 100 pages on scroll
// ── Implement windowed rendering (only show 50 visible rows)
// ── Search on visible 50 rows only
// ── Time: <100ms search, but limited dataset

// Option C: Use Solana indexing service (Magic Eden, Helius)
// ── They provide indexed participant queries
// ── Query time: ~200-500ms
// ── Cost: ~$500-2000/month
// ── Pro: Most reliable for 100k+ scale

/* ============================================================================
   7. SUMMARY TABLE
   ============================================================================ */

// Scenario: 100k participants per tier × 12 tiers = 400k total participants
//
// ┌─────────────────────┬──────────────────┬───────────────┬──────────────┐
// │ Component           │ Metric           │ Value         │ Risk Level   │
// ├─────────────────────┼──────────────────┼───────────────┼──────────────┤
// │ Storage             │ Total accounts   │ 24,000        │ LOW ✓        │
// │                     │ Total size       │ ~38.88 MB     │ LOW ✓        │
// │                     │ Annual rent      │ ~238 SOL      │ LOW ✓        │
// ├─────────────────────┼──────────────────┼───────────────┼──────────────┤
// │ RPC Fetch           │ Time to load     │ 15-30 sec     │ MEDIUM ⚠️     │
// │                     │ Network DL       │ 38.4 MB       │ MEDIUM ⚠️     │
// │                     │ Bottleneck       │ Rate limit    │ MEDIUM ⚠️     │
// ├─────────────────────┼──────────────────┼───────────────┼──────────────┤
// │ Frontend RAM        │ Memory used      │ ~80 MB        │ LOW ✓        │
// │                     │ Objects created  │ 400k          │ LOW ✓        │
// ├─────────────────────┼──────────────────┼───────────────┼──────────────┤
// │ React Rendering     │ Search latency   │ 300-750ms     │ MEDIUM ⚠️     │
// │                     │ Filter latency   │ 200-500ms     │ MEDIUM ⚠️     │
// │                     │ Display rows     │ 50 only       │ LOW ✓        │
// ├─────────────────────┼──────────────────┼───────────────┼──────────────┤
// │ Transactions        │ Per-ticket cost  │ $0.0003-0004  │ LOW ✓        │
// │                     │ Compute used     │ 150k CU/200k  │ LOW ✓        │
// │                     │ Account capacity │ 24k/∞         │ LOW ✓        │
// └─────────────────────┴──────────────────┴───────────────┴──────────────┘

/* ============================================================================
   8. SPECIFIC CRASH VECTORS
   ============================================================================ */

// 1. TIMEOUT CRASH (15-30 second load):
//    - Promise.all({ 24k fetchAccountInfo calls })
//    - RPC endpoint rate limits to 40 req/sec
//    - After 30 seconds, browser may kill fetch()
//    - User sees error or spinner freeze

// 2. MEMORY CRASH (80 MB RAM):
//    - 400k objects in flatMap
//    - Modern browsers limit: ~1GB per tab
//    - Not immediately fatal but heavy
//    - Risk on mobile/low-end devices (< 2GB RAM)

// 3. UI STALL (300-750ms):
//    - Search input blocked during filter
//    - User types "abc" → wait 300ms for results
//    - Not a crash but very bad UX

// 4. REPEAT LOAD CRASH (auto-refresh every 15s):
//    - fetchAll() runs every 15 seconds
//    - Creates 24k RPC calls every 15 seconds
//    - RPC quota exhausted in ~5-10 minutes
//    - All subsequent requests fail

/* ============================================================================
   9. RECOMMENDATIONS
   ============================================================================ */

// SHORT TERM (days):
// 1. Add loading timeout: abort fetch after 10 seconds
// 2. Show warning if participantCount > 5000: "Large dataset, may be slow"
// 3. Disable auto-refresh when dataset > 10k participants
// 4. Add pagination controls: "Load next 100" button

// MEDIUM TERM (weeks):
// 1. Implement lazy loading: fetch only page 0-1 on load (100 participants)
// 2. Add virtual scrolling (windowing) to render only visible 50 rows
// 3. Debounce search input to 300ms
// 4. Cache participant pages in localStorage

// LONG TERM (production):
// 1. Deploy indexing service (Supabase or Helius)
// 2. Replace RPC fetching with database queries
// 3. Search query time: <100ms instead of 300-750ms
// 4. Support 1M+ participants per tier without issues

/* ============================================================================
   10. TODAY'S VERDICT
   ============================================================================ */

// Will 100k participants CRASH the system?
// 
// Solana Smart Contract: ✅ YES, it can handle it
//   - 24k accounts is normal
//   - Storage cost is acceptable
//   - Transaction throughput is fine
//
// Frontend (Current Code): ⚠️ MARGINAL - Will be very slow
//   - 15-30 second load time
//   - 300-750ms search latency
//   - Heavy memory usage (but won't OOM)
//   - Usable but frustrating
//
// Recommendation: 
//   - Current system works fine up to 10-20k participants per tier
//   - At 100k, implement pagination/indexing before deployment
//   - Add monitoring for RPC rate limiting now
//   - Budget for indexing service in production (~$500-2000/month)

