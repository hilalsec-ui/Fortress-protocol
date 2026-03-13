# Bulk Ticket Purchase Probability Analysis - FINAL VERDICT ✅

**Date:** March 2, 2026  
**Status:** Investigation Complete - INTENTIONAL FEATURE CONFIRMED  
**Severity:** LOW (No vulnerability - system working as designed)

---

## Executive Summary

Your question: "_If someone buys 50 tickets at once, will their wallet show 50 times in the tier PDA and increase chances by 50x?_"

**Answer:** YES ✅ - This is **INTENTIONAL** by design.

---

## Evidence: This is Confirmed as a Feature

### 1. **Code Behavior (Verified)**
**File:** [programs/fortress_protocol/src/instructions/buy_ticket.rs](programs/fortress_protocol/src/instructions/buy_ticket.rs) (line 656-668)

```rust
// [BULK_BUY] Add participant entries - quantity already validated to fit
for _ in 0..quantity {
    participant_page.participants.push(ctx.accounts.buyer.key());
    //                                 ^ SAME WALLET REPEATED quantity TIMES
}

lottery_vault.participant_count = lottery_vault
    .participant_count
    .checked_add(quantity as u32)
    .ok_or(LotteryError::ArithmeticOverflow)?;
```

Result at scale:
- User buys 50 tickets → wallet appears **50 times** in ParticipantPage
- Total participants: 50 (not unique wallets, but total entries)
- Win probability: `50 / total_entries`

### 2. **Design Intent (Documented)**
**File:** [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md#step-5-quantity-support) (line 144)

> "Same wallet can have multiple entries **(increased win chance)**"

This is explicitly documented as intended behavior.

### 3. **Consistent Implementation**
All 4 lottery types use identical logic:
- ✅ LPM (buy_lpm_ticket)
- ✅ DPL (buy_dpl_ticket)
- ✅ WPL (buy_wpl_ticket)
- ✅ MPL (buy_mpl_ticket)

---

## Fairness Assessment

### Is This Fair? ✅ YES

| Aspect | Verdict | Reasoning |
|--------|---------|-----------|
| **Mathematical Fairness** | ✅ Fair | Probability is proportional to FPT cost |
| **Transparency** | ✅ Fair | On-chain selection, Pyth entropy (cannot be manipulated) |
| **Economic Logic** | ✅ Fair | More money spent = more chances (like real lotteries) |
| **Comparison to Real Lotteries** | ✅ Fair | PowerBall, Mega Millions work the same way |

**Model:** Each entry = 1 chance. You buy N entries → N× chances.
- 1 ticket, $5 cost → 1 entry → 0.67% odds (in 150-person pool)
- 50 tickets, $250 cost → 50 entries → 33.3% odds (in same pool)
- This is proportional and fair

### Real-World Lottery Comparison

| Lottery | Model |
|---------|-------|
| **PowerBall** | Buy 20 tickets = 20 separate chances ✓ (same as Fortress) |
| **Mega Millions** | Buy 20 tickets = 20 separate chances ✓ (same as Fortress) |
| **Fortress Protocol** | Buy 20 tickets = 20 entries = 20× chances ✓ (same model) |

---

## What Users See (Current Behavior)

### At 100k Participants Per Tier

| Scenario | Entry Count | Win Probability |
|----------|-------------|-----------------|
| Single ticket buyer | 1 entry | 1 in 100,000 = 0.001% |
| Bulk buyer (100 tickets) | 100 entries | 100 in 100,000 = 0.1% |
| **Multiplier** | **100x** | **0.1% / 0.001% = 100x** ✓ |

This is **fair and proportional** - more money spent = more chances.

---

## Where the UX/Documentation Gap Exists ⚠️

The system is fair, but **users might not understand** the multiplier effect.

### Current UI Issues

**In BuyTicketModal.tsx:**
- ✅ Shows quantity selector (1, 5, 10, 25, 50)
- ✅ Shows FPT cost breakdown
- ❌ **MISSING:** Explanation that 50 tickets = 50× win probability
- ❌ **MISSING:** Tooltip saying each ticket = 1 entry
- ❌ **MISSING:** Warning about probability multiplier

**In Documentation:**
- ✅ PROJECT_SUMMARY.md mentions it
- ❌ FORTRESS_LOTTERY_SPEC.md doesn't explain quantity model
- ❌ No FAQ addressing this explicitly
- ❌ No user-facing explanation

### Example: What a User Might Think

**User buys 50 "tickets" and wonders:**
- "Does this mean 50 separate entries or is it a bulk discount for one entry?"
- "Are my chances 50× better or the same as 1 ticket?"
- "Is this how real lotteries work?"

**Answer:** 
- 50 separate entries ✓
- 50× better chances ✓
- Yes, same as real lotteries ✓

But the UI doesn't explain this clearly!

---

## Recommendations

### 🔴 PRIORITY 1: Update BuyTicketModal (HIGH)

Add probability explanation near quantity selector:

```tsx
{/* PROBABILITY EXPLANATION */}
<div className="mt-2 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
  <p className="text-sm text-cyan-300 font-semibold mb-2">
    📊 Each Ticket = 1 Entry
  </p>
  <p className="text-xs text-gray-300 mb-2">
    {quantity} ticket(s) = {quantity} chancer(s) to win
  </p>
  <p className="text-xs text-gray-400 mt-2">
    💡 Buying 50 vs 1 ticket = 50× better odds
  </p>
</div>
```

**Files to Update:**
- [ ] [app/src/components/BuyTicketModal.tsx](app/src/components/BuyTicketModal.tsx) - Add probability section

### 🟡 PRIORITY 2: Update Documentation (MEDIUM)

**Files to Update:**
- [ ] [FORTRESS_LOTTERY_SPEC.md](FORTRESS_LOTTERY_SPEC.md) - Add section on quantity/probability
- [ ] [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - Expand line 144 with clearer explanation
- [ ] Add FAQ with explicit Q&A about probability multiplier

### 🟢 PRIORITY 3: Monitoring (LOW)

Track bulk purchase patterns to understand user behavior:
- Average quantity per purchase
- Whale detection (>20 tickets)
- Cumulative effects (same wallet buying multiple times)

---

## Verdict

| Category | Status | Notes |
|----------|--------|-------|
| **Code Behavior** | ✅ Working as designed | 50 tickets = 50 entries confirmed |
| **Fairness** | ✅ Fair system | Proportional odds, transparent draw |
| **Security** | ✅ No vulnerabilities | On-chain, Pyth entropy, cannot manipulate |
| **Documentation** | ⚠️ Gap exists | Users might not understand quantity=multiplier |
| **UI Clarity** | ⚠️ Needs improvement | Modal should explain probability scaling |
| **Action Required** | ✅ Documentation only | NO code changes needed, improve UX/docs |

---

## Conclusion

**Your wallet WILL appear 50 times if you buy 50 tickets.** ✅  
**This WILL increase your odds by 50×.** ✅  
**This IS calculated correctly by design.** ✅  
**This IS fair and proportional.** ✅  
**Users just need clearer explanation in the UI.** ⚠️

No security vulnerabilities found. No code changes needed. Only documentation/UX improvement recommended.

---

**Generated:** March 2, 2026  
**Analysis Completed By:** Security Audit Agent  
**Status:** CLOSED - No further action on smart contract required
