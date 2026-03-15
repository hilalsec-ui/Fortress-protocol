# Fortress Lottery Architectural Upgrade - Implementation Summary

## Date: February 3, 2026

## Status: **PHASE 1 COMPLETE** ✅

---

## Overview

This upgrade transforms the Fortress Lottery into a "self-driving" system with automated operations, YPL tier removal, and enhanced draw mechanisms. The implementation focuses on foundation work for priority tips, Pyth Oracle integration, and state management.

---

## ✅ COMPLETED WORK

### 1. **YPL Tier Complete Removal**

**Files Modified:**
- [state.rs](programs/fortress_lottery/src/state.rs) - Removed `YPL` from `LotteryType` enum
- [global_registry.rs](programs/fortress_lottery/src/state/global_registry.rs) - Removed `ypl_rounds` field
- [lottery_configs.rs](programs/fortress_lottery/src/state/lottery_configs.rs) - Removed `YplLottery` struct
- [initialize.rs](programs/fortress_lottery/src/instructions/initialize.rs) - Removed `initialize_ypl_lottery` and `initialize_ypl_tier`
- [buy_ticket.rs](programs/fortress_lottery/src/instructions/buy_ticket.rs) - Removed `buy_ypl_ticket`
- [draw_winner.rs](programs/fortress_lottery/src/instructions/draw_winner.rs) - Removed `draw_ypl_winner`
- [lib.rs](programs/fortress_lottery/src/lib.rs) - Removed all YPL instruction exports

**Impact:**
- Reduced from 20 tiers to 16 tiers (4 LPM + 4 DPL + 4 WPL + 4 MPL)
- GlobalRegistry size reduced by 16 bytes (removed `[u32; 4]`)
- Program binary size reduced

### 2. **Admin Close YPL Accounts Instruction**

**New Instruction:** `close_ypl_account`

**Location:** [admin.rs:679-805](programs/fortress_lottery/src/instructions/admin.rs#L679-L805)

**Functionality:**
```rust
pub fn close_ypl_account(ctx: Context<CloseYplAccount>, tier: u8) -> Result<()>
```

**Process:**
1. **Validation:** Checks `ypl_vault.participant_count == 0` (safety)
2. **FPT Transfer:** Moves all FPT from YPL vault ATA to admin ATA
3. **Close ATA:** Closes YPL vault's token account → reclaims ~0.00204 SOL rent to admin
4. **Close Vault:** Closes YPL vault account → reclaims vault rent lamports to admin

**PDA Seeds (YPL Vault):**
```rust
[b"lottery_vault", &[4], &[tier], &[round_number_bytes], &[bump]]
```

**Security:**
- Admin-only: `EANi5dM5CUbtoiJAN72JgKMSNM6bMWsSWMX1w1t2yWcv`
- Participant count must be 0 before closing

### 3. **VaultState Enum Implementation**

**File:** [lottery_vault.rs](programs/fortress_lottery/src/state/lottery_vault.rs)

**New State Machine:**
```rust
pub enum VaultState {
    Active,           // Normal operation - accepting tickets
    ReadyToWithdraw,  // Draw triggered but failed - prize claimable
    Claimed,          // Prize claimed, resetting to Active
}
```

**Added to LotteryVault:**
```rust
pub struct LotteryVault {
    // ... existing fields
    pub state: VaultState,  // NEW
    pub bump: u8,
}
```

**Size Impact:** +1 byte per vault (85 → 86 bytes)

### 4. **Treasury Priority Tips Tracking**

**File:** [treasury.rs](programs/fortress_lottery/src/state/treasury.rs)

**New Field:**
```rust
pub struct Treasury {
    // ... existing fields
    pub total_priority_tips: u64,  // NEW: Tracks validator tip spending
    pub bump: u8,
}
```

**Size Impact:** +8 bytes (Treasury account)

**Updated LEN:** `8 + 32 + 8*5 + 1 = 81 bytes`

### 5. **Draw Helpers Module (Foundation)**

**New File:** [draw_helpers.rs](programs/fortress_lottery/src/draw_helpers.rs)

**Exported Functions:**

#### `get_draw_entropy()`
```rust
pub fn get_draw_entropy(
    pyth_price_feed: Option<&AccountInfo>,
    vault_seed: u64,
) -> Result<u64>
```
- Attempts Pyth Oracle first
- Falls back to Clock-based entropy
- Returns random seed for winner selection

#### `pay_priority_tip()`
```rust
pub fn pay_priority_tip<'info>(
    treasury_vault: &AccountInfo<'info>,
    treasury: &mut Account<'info, Treasury>,
    validator_identity: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    treasury_vault_bump: u8,
) -> Result<()>
```
- Transfers 0.05 SOL from Treasury Vault to validator
- Uses `invoke_signed` with PDA seeds
- Tracks spending in `treasury.total_priority_tips`

#### `verify_and_create_winner_ata()`
```rust
pub fn verify_and_create_winner_ata<'info>(...) -> Result<Pubkey>
```
- Idempotent ATA creation
- Deterministic verification
- Creates if missing, succeeds if exists

#### `reset_vault_after_draw()`
```rust
pub fn reset_vault_after_draw(
    vault: &mut LotteryVault,
    winner_pubkey: Pubkey,
    winner_prize: u64,
    duration_seconds: i64,
) -> Result<()>
```
- Resets vault state to `Active`
- Updates `end_time` for time-based lotteries
- Increments `round_number`

**Duration Constants:**
```rust
pub const DPL_DURATION: i64 = 86_400;      // 1 day
pub const WPL_DURATION: i64 = 604_800;     // 7 days
pub const MPL_DURATION: i64 = 2_592_000;   // 30 days
```

### 6. **Pyth Entropy Helper Functions**

**File:** [oracle.rs](programs/fortress_lottery/src/oracle.rs)

**New Functions:**

#### `get_entropy_from_pyth()`
```rust
pub fn get_entropy_from_pyth(
    _pyth_price_feed: &AccountInfo,
    vault_seed: u64,
) -> Result<u64>
```
- Placeholder for Pyth Entropy integration
- Returns error → triggers Clock fallback
- **TODO:** Implement when Pyth SDK supports Solana 2.0

#### `get_entropy_from_clock()`
```rust
pub fn get_entropy_from_clock() -> Result<u64>
```
- Uses `Clock::get()?.slot` as randomness source
- **⚠️ WARNING:** Predictable by validators
- For MVP/testnet only - NOT production ready

**Security Model:**
```
Try Pyth → Success? Use it
         ↓ Fail
      Fallback to Clock (logged warning)
```

### 7. **Error Codes**

**File:** [errors.rs](programs/fortress_lottery/src/errors.rs)

**New Errors:**
```rust
#[msg("Invalid vault state - operation not allowed in current state")]
InvalidVaultState,

#[msg("Validator identity account required for priority tip")]
MissingValidatorIdentity,

#[msg("Insufficient treasury balance for priority tip")]
InsufficientTreasuryBalance,
```

### 8. **Build Status**

**Compilation:** ✅ **SUCCESS**

```bash
Finished `release` profile [optimized] target(s) in 15.62s
Finished `test` profile [unoptimized + debuginfo] target(s) in 10.13s
```

**Program Size:** TBD (run `anchor build --verifiable` for exact size)

**No Warnings:** Clean build

---

## 📋 REMAINING WORK (PHASE 2 & 3)

### Phase 2: Update Draw Instructions

**Priority:** HIGH  
**Complexity:** MEDIUM-HIGH

#### Tasks:
1. **Update `draw_lpm_winner`** - Add:
   - Pyth entropy integration (with Clock fallback)
   - Priority tip payment to validator
   - Idempotent ATA creation
   - State machine error handling (set `ReadyToWithdraw` on failure)

2. **Update `draw_dpl_winner`** - Add same + perpetual time reset:
   - `vault.end_time = current_time + DPL_DURATION`
   - Check `current_time > vault.end_time` before allowing draw

3. **Update `draw_wpl_winner`** - Same as DPL with `WPL_DURATION`

4. **Update `draw_mpl_winner`** - Same as DPL with `MPL_DURATION`

**Pattern (Pseudo-code):**
```rust
pub fn draw_XXX_winner(ctx: Context<DrawXxxWinner>, tier: u8) -> Result<()> {
    // Wrap main logic in error handler
    match execute_draw(ctx, tier) {
        Ok(_) => Ok(()),
        Err(e) => {
            // Set vault state to ReadyToWithdraw, preserve other tiers
            ctx.accounts.lottery_state.state = VaultState::ReadyToWithdraw;
            msg!("[ERROR] Draw failed - vault set to ReadyToWithdraw");
            Err(e)
        }
    }
}

fn execute_draw(ctx: Context<DrawXxxWinner>, tier: u8) -> Result<()> {
    // 1. Validation
    require!(...);
    
    // 2. Get entropy (Pyth → Clock fallback)
    let vault_seed = (lottery_type as u64) << 56 | (tier as u64) << 48 | round_number as u64;
    let entropy = get_draw_entropy(ctx.accounts.pyth_feed.as_ref(), vault_seed)?;
    let random_index = (entropy % participant_count as u64) as u32;
    
    // 3. Find winner
    let winner_pubkey = find_winner_in_chain(...)?;
    
    // 4. Verify and create ATA (idempotent)
    verify_and_create_winner_ata(...)?;
    
    // 5. Distribute prize (95% winner, 5% admin)
    transfer_checked(..., winner_prize, 6)?;
    transfer_checked(..., admin_fee, 6)?;
    
    // 6. Pay priority tip to validator
    pay_priority_tip(
        &ctx.accounts.treasury_vault,
        &mut ctx.accounts.treasury,
        &ctx.accounts.validator_identity,
        &ctx.accounts.system_program,
        treasury_vault_bump,
    )?;
    
    // 7. Reset vault state
    reset_vault_after_draw(vault, winner_pubkey, winner_prize, DURATION)?;
    
    Ok(())
}
```

### Phase 3: Implement `claim_prize` Instruction

**Priority:** HIGH  
**Complexity:** MEDIUM

#### Tasks:
1. Create new instruction: `claim_prize(lottery_type: u8, tier: u8)`
2. Verify `vault.state == VaultState::ReadyToWithdraw`
3. Reuse draw logic for prize distribution
4. Pay priority tip (0.05 SOL)
5. Reset vault state to `Active`
6. Update `end_time` for time-based lotteries

**Accounts Structure:**
```rust
#[derive(Accounts)]
pub struct ClaimPrize<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,  // Can be anyone, not just winner
    
    #[account(
        mut,
        constraint = vault.state == VaultState::ReadyToWithdraw @ LotteryError::InvalidVaultState
    )]
    pub vault: Account<'info, LotteryVault>,
    
    // ... same accounts as draw_winner
    
    /// NEW: Validator identity for priority tip
    /// CHECK: Verified as validator in instruction
    pub validator_identity: AccountInfo<'info>,
}
```

---

## 🔧 DEPLOYMENT CONSIDERATIONS

### 1. **Program Upgrade Path**

**Current Program:** `HerDfQLbrXk8CFPcCGW8sDvaegk1qYawSa82Wuzov4Lb`

**Account Size Changes:**
- ✅ **LotteryVault:** 85 → 86 bytes (+1 byte for `state`)
- ✅ **Treasury:** 73 → 81 bytes (+8 bytes for `total_priority_tips`)
- ✅ **GlobalRegistry:** 138 → 122 bytes (-16 bytes, removed `ypl_rounds`)

**Migration Strategy:**
1. **Deploy upgraded program** (Anchor upgrade mechanism)
2. **Existing accounts remain compatible** (Anchor handles discriminator)
3. **New fields default to zero** (`state` = 0 = `Active`, `total_priority_tips` = 0)
4. **No data migration needed** for LotteryVault/Treasury
5. **GlobalRegistry:** May need realloc or ignore old `ypl_rounds` offset

### 2. **YPL Account Cleanup Process**

**Prerequisites:**
- All YPL vaults must have `participant_count == 0`
- No active draws in progress
- Treasury Vault has sufficient SOL for transactions

**Steps:**
```bash
# For each YPL tier (5, 10, 15, 20):
anchor run close-ypl --provider.cluster devnet -- --tier 5
anchor run close-ypl --provider.cluster devnet -- --tier 10
anchor run close-ypl --provider.cluster devnet -- --tier 15
anchor run close-ypl --provider.cluster devnet -- --tier 20
```

**Expected Reclamation:**
- Per Tier: ~0.00204 SOL (ATA rent) + ~0.0013 SOL (vault rent) = ~0.00334 SOL
- Total (4 tiers): ~0.01336 SOL + any FPT balances

### 3. **Treasury Vault Balance Requirements**

**Minimum Balance Calculation:**
- Priority tips: `0.05 SOL/draw × 16 tiers × draws/day`
- Estimated daily burn: `~0.8 SOL` (if all tiers draw daily)
- **Recommended minimum:** 1-2 SOL in Treasury Vault

**Low Balance Alert:**
- When `treasury_vault.lamports() < 10 * PRIORITY_TIP_AMOUNT` (0.5 SOL)
- Frontend should display warning
- Admin should top up Treasury Vault

### 4. **Validator Identity Source**

**Challenge:** Solana doesn't expose validator identity directly to programs.

**Current Options:**

**Option A: Trusted Caller Model**
```rust
/// CHECK: Validator identity passed by caller (trusted frontend)
pub validator_identity: UncheckedAccount<'info>,
```
- Frontend/backend passes validator identity
- Program trusts the caller
- **Risk:** Tip could go to wrong account if frontend malicious

**Option B: Jito Bundle RPC**
- Use Jito tip accounts (known addresses)
- Requires Jito-enabled RPC endpoint
- Guaranteed tip goes to block producer
- **Recommended for production**

**Option C: Omit Validator Tip (Simplest)**
- Remove validator tip logic entirely
- Use Solana's standard priority fees (client-side)
- **Fallback if technical issues**

**Recommendation:** Start with **Option A** for MVP, migrate to **Option B** (Jito) for mainnet.

---

## 🚨 SECURITY CONSIDERATIONS

### 1. **Randomness (CRITICAL)**

**Current State:** Clock-based entropy (TEMPORARY)

**Security Level:** ⚠️ **VULNERABLE** - Validators can predict/manipulate

**Production Requirement:**
```rust
// BEFORE MAINNET:
- [ ] Integrate Pyth Entropy (when SDK available Q2 2026)
- [ ] OR use Switchboard VRF as interim
- [ ] OR use Chainlink VRF
```

**Fallback Strategy:**
```
Pyth Entropy (preferred)
    ↓ If unavailable
Switchboard VRF
    ↓ If unavailable
Clock (logged warning)
```

### 2. **State Transitions**

**State Machine:**
```
Active → ReadyToWithdraw (on draw error)
ReadyToWithdraw → Active (on claim_prize success)
Active → Active (on draw success)
```

**Invariants:**
- Only `Active` vaults can sell tickets
- Only `ReadyToWithdraw` vaults can call `claim_prize`
- `Claimed` is transient state (immediately resets to `Active`)

### 3. **Priority Tip Validation**

**Attack Vector:** Caller passes fake validator_identity

**Mitigation (Phase 2):**
```rust
// Validate validator is in current leader schedule
let clock = Clock::get()?;
let slot = clock.slot;
// TODO: Query leader schedule sysvar or use Jito
```

### 4. **Treasury Depletion**

**Attack Vector:** Excessive draws drain Treasury Vault

**Mitigation:**
```rust
// In pay_priority_tip():
require!(
    treasury_vault.lamports() >= PRIORITY_TIP_AMOUNT,
    LotteryError::InsufficientTreasuryBalance
);

// Frontend should display alert when treasury_vault < 0.5 SOL
```

**Auto-Refill Logic (Future):**
- Transfer 5% of admin fees back to Treasury Vault
- Maintain min 1 SOL balance autonomously

---

## 📊 METRICS & MONITORING

### Key Metrics to Track:

1. **Treasury Vault Balance**
   - Alert when < 0.5 SOL
   - Monitor daily burn rate

2. **Priority Tips Paid**
   - Track `treasury.total_priority_tips`
   - Compare to draw count

3. **Vault State Distribution**
   - Count vaults in each state: `Active`, `ReadyToWithdraw`
   - Alert if any vault stuck in `ReadyToWithdraw` > 24h

4. **Randomness Source Usage**
   - Log Pyth success rate vs Clock fallback rate
   - Aim for >99% Pyth usage in production

5. **YPL Cleanup Progress**
   - Track FPT + SOL reclaimed from YPL accounts
   - Verify all 4 YPL tiers closed

---

## 🎯 SUCCESS CRITERIA

### Phase 1 (COMPLETE ✅)
- [x] YPL tier completely removed from code
- [x] `close_ypl_account` admin instruction implemented
- [x] `VaultState` enum added to LotteryVault
- [x] `total_priority_tips` field added to Treasury
- [x] Draw helper functions module created
- [x] Pyth entropy stubs implemented
- [x] Error codes updated
- [x] Clean compilation (no errors/warnings)

### Phase 2 (PENDING)
- [ ] All draw instructions use Pyth entropy (with fallback)
- [ ] Priority tips paid on every draw
- [ ] Idempotent ATA creation in all draws
- [ ] Time-based perpetual reset (DPL/WPL/MPL)
- [ ] Error handling sets `ReadyToWithdraw` state

### Phase 3 (PENDING)
- [ ] `claim_prize` instruction implemented
- [ ] Frontend displays "Ready to Withdraw" button
- [ ] Manual prize claiming works
- [ ] State machine tested end-to-end

### Production Readiness
- [ ] Pyth Entropy fully integrated (no Clock fallback)
- [ ] Jito tip accounts used for validator tips
- [ ] Treasury auto-refill from admin fees
- [ ] Multi-sig admin control (Squads Protocol)
- [ ] Emergency pause mechanism

---

## 📝 NEXT STEPS

### Immediate (This Week)
1. **Test Phase 1 compilation** - ✅ DONE
2. **Write TypeScript client for `close_ypl_account`**
3. **Test YPL cleanup on devnet** (close all 4 YPL tiers)
4. **Start Phase 2 implementation** (update draw instructions)

### Short-Term (Next 2 Weeks)
1. Implement Phase 2 (draw instruction upgrades)
2. Test priority tip payments
3. Implement `claim_prize` instruction (Phase 3)
4. Frontend integration for "Ready to Withdraw" button

### Medium-Term (Q2 2026)
1. Integrate Pyth Entropy (when SDK available)
2. Replace Clock-based randomness
3. Implement Jito tip logic
4. Add treasury auto-refill

### Long-Term (Q3 2026 - Mainnet)
1. Security audit by Sec3/OtterSec
2. Multi-sig admin setup
3. Emergency pause mechanism
4. Mainnet deployment

---

## 🔗 REFERENCES

### Modified Files
1. [state.rs](programs/fortress_lottery/src/state.rs)
2. [lottery_vault.rs](programs/fortress_lottery/src/state/lottery_vault.rs)
3. [treasury.rs](programs/fortress_lottery/src/state/treasury.rs)
4. [global_registry.rs](programs/fortress_lottery/src/state/global_registry.rs)
5. [lottery_configs.rs](programs/fortress_lottery/src/state/lottery_configs.rs)
6. [errors.rs](programs/fortress_lottery/src/errors.rs)
7. [oracle.rs](programs/fortress_lottery/src/oracle.rs)
8. [admin.rs](programs/fortress_lottery/src/instructions/admin.rs)
9. [initialize.rs](programs/fortress_lottery/src/instructions/initialize.rs)
10. [buy_ticket.rs](programs/fortress_lottery/src/instructions/buy_ticket.rs)
11. [draw_winner.rs](programs/fortress_lottery/src/instructions/draw_winner.rs)
12. [lib.rs](programs/fortress_lottery/src/lib.rs)

### New Files
1. [draw_helpers.rs](programs/fortress_lottery/src/draw_helpers.rs)

### External Dependencies
- **Pyth Oracle:** Awaiting Solana 2.0 SDK support (Q2 2026)
- **Jito MEV:** For production validator tips
- **Anchor:** v0.30.1 (current)
- **Solana:** v2.0+ (devnet)

---

## ✅ SIGN-OFF

**Implementation By:** GitHub Copilot Agent  
**Date:** February 3, 2026  
**Status:** Phase 1 Complete, Build Verified  

**Next Reviewer:** Project maintainer should:
1. Review this document
2. Test `close_ypl_account` on devnet
3. Approve Phase 2 implementation plan
4. Assign frontend integration tasks

---

**Build Verification:**
```bash
$ anchor build
Finished `release` profile [optimized] target(s) in 15.62s
Finished `test` profile [unoptimized + debuginfo] target(s) in 10.13s
✅ SUCCESS
```

**Program ID:** `HerDfQLbrXk8CFPcCGW8sDvaegk1qYawSa82Wuzov4Lb`  
**Network:** Solana Devnet  
**Compilation:** Clean (0 errors, 0 warnings)

---

