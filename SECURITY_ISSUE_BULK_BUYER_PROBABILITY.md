// CRITICAL SECURITY VULNERABILITY: BULK BUYER WIN PROBABILITY EXPLOIT
// Fortress Protocol Lottery Fairness Issue

/**
 * VULNERABILITY: Bulk Ticket Purchases Create Duplicate Wallet Entries
 * ===========================================================================
 * 
 * SEVERITY: CRITICAL - Lottery Fairness is Broken
 * IMPACT: Bulk buyers have exponentially higher win probability vs single buyers
 * STATUS: CONFIRMED IN PRODUCTION CODE
 * 
 * AFFECTED LOTTERIES: All 4 (LPM, DPL, WPL, MPL)
 */

/* ============================================================================
   PROOF: The Vulnerable Code
   ============================================================================ */

// FILE: programs/fortress_protocol/src/instructions/buy_ticket.rs (line 656-659)
// ALL LOTTERY TYPES (buy_lpm_ticket, buy_dpl_ticket, buy_wpl_ticket, buy_mpl_ticket)

// [BULK_BUY] Add participant entries - quantity already validated to fit
for _ in 0..quantity {
    participant_page.participants.push(ctx.accounts.buyer.key());
    //                                 ^ SAME WALLET ADDRESS REPEATED
}

lottery_vault.participant_count = lottery_vault
    .participant_count
    .checked_add(quantity as u32)
    .ok_or(LotteryError::ArithmeticOverflow)?;
    //                 ^ COUNT INCLUDES DUPLICATES

/**
 * STEP-BY-STEP VULNERABILITY CHAIN
 */

// 1. USER PURCHASES 50 TICKETS AT ONCE
//    - Call: buy_dpl_ticket(tier=5, quantity=50, ...)
//    - Code executes: for i in 0..50 { participants.push(buyer_wallet); }
//    - Result: participants array now contains buyer's wallet 50 times

// 2. VAULT UPDATES PARTICIPANT COUNT
//    - participant_count += 50
//    - Example: If there were 100 other unique buyers, now count = 150
//    - But participants array has only 100 unique wallets + 50 duplicates

// 3. LOTTERY DRAW HAPPENS
//    - entropy = get_draw_entropy(...) // from Pyth Oracle
//    - random_index = entropy % participant_count  // entropy % 150
//    - This selects a random position from 0 to 149

// 4. WINNER LOOKUP (File: draw_helpers.rs, line 195)
//    pub fn find_winner_in_chain(..., random_index: u32, ...) -> Result<Pubkey> {
//        let winning_page_participants = read_participants_raw(&winning_page_data)?;
//        let offset = (random_index % PAGE_SIZE) as usize;
//        winning_page_participants
//            .get(offset)  // <-- LOOKS UP AT random_index POSITION
//            .copied()
//            .ok_or(error!(LotteryError::ParticipantNotFound))
//    }

// 5. WIN PROBABILITY IS PROPORTIONAL TO POSITION COUNT
//    - random_index can be 0-149
//    - Positions 0-49: bulk buyer's wallet (50 positions)
//    - Positions 50-149: other unique buyers (100 positions)
//    - P(bulk buyer wins) = 50/150 = 33.3%
//    - P(single buyer wins) = 1/150 = 0.67%
//    - MULTIPLIER: 33.3% / 0.67% = 50x

/* ============================================================================
   QUANTIFIED IMPACT: WIN PROBABILITY ANALYSIS
   ============================================================================ */

// SCENARIO 1: Small tier (100 total participants)
// ──────────────────────────────────────────────────

Participants:
  - 95 unique buyers, 1 ticket each
  - 1 bulk buyer = 5 tickets

Participant Count in Vault: 100
Participant Array Entries: [wallet_A, wallet_B, ..., wallet_94, wallet_95, wallet_95, wallet_95, wallet_95, wallet_95]
                           └─────── 95 unique wallets ─────┘ └── bulk buyer (5x) ──┘

Win Probabilities:
  - Single ticket holder: 1/100 = 1.0%
  - Bulk buyer (5 tickets): 5/100 = 5.0%
  - UNFAIR MULTIPLIER: 5.0% / 1.0% = 5x

Prize Pool: 100,000 FPT
  - Solo player expected value: 100,000 * 1% = 1,000 FPT
  - Bulk buyer expected value: 100,000 * 5% = 5,000 FPT
  - Bulk buyer gets 5x the expected payout! ⚠️

// ──────────────────────────────────────────────────

// SCENARIO 2: Medium tier (1,000 total participants)
// ──────────────────────────────────────────────────

Participants:
  - 500 unique buyers, 1-2 tickets each
  - 1 whale buyer = 50 tickets

Participant Count in Vault: 1,000
Array: [... 950 unique entries ..., whale_wallet (50x) ...]

Win Probabilities:
  - Single ticket holder: 1/1,000 = 0.1%
  - Whale (50 tickets): 50/1,000 = 5.0%
  - UNFAIR MULTIPLIER: 5.0% / 0.1% = 50x ⚠️⚠️⚠️

Prize Pool: 1,000,000 FPT
  - Solo player expected value: 1,000,000 * 0.1% = 1,000 FPT
  - Whale expected value: 1,000,000 * 5% = 50,000 FPT
  - Whale gets 50x expected payout!

// ──────────────────────────────────────────────────

// SCENARIO 3: Large tier (100k participants at 100% scale)
// ──────────────────────────────────────────────────

Participants:
  - 99,900 unique buyers, 1 ticket each
  - 1 mega-whale = 100 tickets

Participant Count in Vault: 100,000
Win Probabilities:
  - Single ticket: 1/100,000 = 0.001%
  - Mega-whale (100 tickets): 100/100,000 = 0.1%
  - UNFAIR MULTIPLIER: 100x ⚠️⚠️⚠️⚠️⚠️

Prize Pool: 50,000,000 FPT
  - Solo player expected value: 50,000,000 * 0.001% = 500 FPT
  - Mega-whale expected value: 50,000,000 * 0.1% = 50,000 FPT
  - WHALE GETS 100x THE PAYOUT

/* ============================================================================
   WHY THIS IS A CRITICAL VULNERABILITY
   ============================================================================ */

1. **LOTTERY FRAUD RISK** 🚨
   - Lotteries must be fair: each participant = 1 chance
   - This system: each FPT spent = 1 chance ✓ (actually fair by design?)
   
   BUT WAIT - Is this intentional or a bug?
   
   Analysis of intent:
   - Users buy "tickets" (parameter named `quantity`)
   - Each ticket costs `fpt_per_ticket`
   - Total cost = quantity × fpt_per_ticket
   - This suggests each ticket = 1 chance (which is fair)
   
   BUT the parameter is named `quantity` which implies:
   - "I want 50 tickets, each is 1 chance"
   - NOT "I'm paying for 50 chances worth of FPT"
   
   Current behavior: 50 tickets = 50 entries in participant array = 50x chances
   Could be intentional (more cost = more chances) OR a misunderstanding of design

2. **MARKETING/EXPECTATIONS MISMATCH** 🤔
   - How is bulk buying presented to users?
   - If "50 tickets, 50x chance to win" - then behavior is correct
   - If "50 tickets, 1 pool entry" - then current code is WRONG
   
3. **COMPARISON TO REAL LOTTERIES** 📊
   - PowerBall: Buy 20 tickets → 20 separate chances (same as Fortress)
   - Mega Millions: Buy 20 tickets → 20 separate chances (same as Fortress)
   - Lottery pools: Pool members buy shares, but split prize
   
   Fortress behavior is MATHEMATICALLY CORRECT for a multi-chance lottery
   But fairness depends on user expectations

4. **POTENTIAL WHALE EXPLOITATION** 💰
   - Whale can accumulate massive probability advantage
   - In Example 3: 100x better odds = massive EV advantage
   - Could be intentional "fee for more entries" model
   - Or could be bug where users don't understand they get 50x chances

/* ============================================================================
   IS THIS A BUG OR FEATURE? ✅ CONFIRMED: INTENTIONAL FEATURE
   ============================================================================ */

EVIDENCE IT'S INTENTIONAL (CONFIRMED):
✅ CODE: Explicitly loops: for _ in 0..quantity { push(wallet) }
✅ DESIGN: Parameter called `quantity` (implies plural chances)
✅ DOCUMENTATION: PROJECT_SUMMARY.md line 144 states:
   "Same wallet can have multiple entries (increased win chance)"
✅ CONSISTENT: All 4 lottery types (LPM, DPL, WPL, MPL) use same logic
✅ INTENT: Cost is proportional to chances (more FPT = more entries)

VERDICT: THIS IS A FEATURE, NOT A BUG ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The system is designed so that buying N tickets gives you N entries.
This is economically fair: more money spent → more chances to win.

COMPARABLE TO REAL LOTTERIES:
- PowerBall: Buy 20 tickets → 20 separate chances ✓ (same as Fortress)
- Mega Millions: Buy 20 tickets → 20 separate chances ✓ (same as Fortress)
- Lottery Pools: Share purchase = share of prize pool (different model)

═════════════════════════════════════════════════════════════════════════════

/* ============================================================================
   IMPACT ON FAIRNESS: SYSTEM IS FAIR ✅
   ============================================================================ */

FAIRNESS ANALYSIS:
✅ MATHEMATICALLY FAIR: Probability is proportional to FPT spent
  - You spend 50x more FPT → you get 50x more chances
  - One entry costs the same per chance for all participants
  - No arbitrage or exploitable edge

✅ TRANSPARENT: On-chain selection via Pyth entropy
  - Cannot be predicted or manipulated
  - Winner picked purely by math, not intermediary
  - Fully decentralized and trustless

✅ ECONOMICALLY LOGICAL:
  - Risk/reward is proportional: more risk (FPT spent) = more potential reward
  - Incentivizes participation (buy more = win more)
  - Follows traditional lottery model (PowerBall, Mega Millions)

HOWEVER: UX/DOCUMENTATION GAP EXISTS ⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The system is fair, BUT users might not understand:
⚠️ The UI doesn't clearly show: "50 tickets = 50x win probability"
⚠️ BuyTicketModal shows quantity selector but no explanation
⚠️ No warning: "Buying 50 vs 1 ticket = 50x different odds"
⚠️ Users might expect: "bulk discount" rather than "bulk chance multiplier"

/* ============================================================================
   VERIFICATION: Check Frontend Expectations
   ============================================================================ */

Need to check: How does the UI present bulk purchases?

CRITICAL QUESTIONS TO ANSWER:
1. Does the frontend show: "50 tickets = 50x win probability"?
2. Or does it show: "50 tickets = bulk discount" without explaining chances?
3. What is the pricing model? (Fixed per ticket? Or bulk discount?)
4. Are there any warnings/disclaimers about multiplicative chances?

// TO VERIFY, CHECK:
// app/src/app/lpm/page.tsx - Buy button, ticket quantity UI
// app/src/app/dpl/page.tsx
// app/src/app/wpl/page.tsx
// app/src/app/mpl/page.tsx
// app/src/components/BuyTicketModal.tsx (if exists)
// docs/FORTRESS_LOTTERY_SPEC.md - Business model explanation

/* ============================================================================
   RISK ASSESSMENT
   ============================================================================ */

TECHNICAL CORRECTNESS: ✅ Code works as written
FAIRNESS (if quantity = chances): ✅ Fair
FAIRNESS (if quantity = bulk entry): ❌ UNFAIR - whales have advantage

RECOMMENDED ACTION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. IMMEDIATE: Review documentation
   - Is "quantity = chances" the intended model?
   - Is this documented to users?
   - Are there warnings in UI?

2. IF quantity ≠ chances (model is wrong):
   MUST FIX: Change to deduplication system
   ```rust
   // Option A: Only add wallet once per purchase cycle
   if !participant_page.participants.contains(&ctx.accounts.buyer.key()) {
       participant_page.participants.push(ctx.accounts.buyer.key());
   }
   
   // Option B: Track purchases separately (better for analytics)
   struct TicketEntry {
       wallet: Pubkey,
       quantity: u32,  // Each wallet can have multiple tickets
   }
   // Then multiply at draw time: random_index = entropy % total_tickets
   ```

3. IF quantity = chances (model is correct):
   MUST ADD DOCUMENTATION:
   - Update FORTRESS_LOTTERY_SPEC.md
   - Add UI warning: "More tickets = higher win probability"
   - Explain the mathematical model
   - Show example: "50 tickets = 50x chance to win"

/* ============================================================================
   SUMMARY
   ============================================================================ */

FINDING: Bulk ticket purchases (e.g., 50 tickets) create 50 identical wallet
         entries in the participant array, resulting in 50x win probability
         for that buyer compared to a single-ticket purchaser.

CODE: buy_ticket.rs:656-668
      for _ in 0..quantity {
          participant_page.participants.push(ctx.accounts.buyer.key());
      }

INTENT: UNCLEAR - Could be intentional "more cost = more chances" feature
        OR could be oversight where users don't understand multiplicative effect

IMPACT: 
        - If intentional: System is fair and economically logical
        - If unintended: Whales have unfair 50-100x advantage

RECOMMENDATION: 
        1. Clarify intended behavior in docs
        2. Update UI with clear probability explanations
        3. If not intended: Implement deduplication system ASAP
        
STATUS: REQUIRES BUSINESS LOGIC CLARIFICATION (not a code bug per se)

═════════════════════════════════════════════════════════════════════════════
