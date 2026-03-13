# 🎯 PRICING CONFIGURATION QUICK REFERENCE

## Phase 1 & 2 Implementation Complete ✅

### Files Created/Modified

**New State Account:**
- `programs/fortress_lottery/src/state/pricing_config.rs` - PricingConfig state

**New Oracle Module:**
- `programs/fortress_lottery/src/oracle.rs` - Price calculation logic

**New Admin Instructions:**
- `programs/fortress_lottery/src/instructions/admin.rs` - 4 admin instructions

**Updated Files:**
- `programs/fortress_lottery/src/state.rs` - Added `get_tier_usdc_price()` method
- `programs/fortress_lottery/src/errors.rs` - Added 8 new error codes
- `programs/fortress_lottery/src/lib.rs` - Added admin instruction exports
- `programs/fortress_lottery/src/instructions/mod.rs` - Added admin module

**Test Script:**
- `tests/pricing-config.test.ts` - TypeScript test suite

---

## 🔑 Admin Instructions

### 1. Initialize Pricing Config
```typescript
await program.methods
  .initializePricingConfig(new anchor.BN(500_000)) // 0.5 FPT per USDC
  .accounts({
    admin: adminWallet.publicKey,
    pricingConfig: pricingConfigPDA,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

**PDA Derivation:**
```typescript
const [pricingConfigPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("pricing_config")],
  programId
);
```

### 2. Update Exchange Rate
```typescript
await program.methods
  .updateRate(new anchor.BN(3_000_000)) // 3.0 FPT per USDC
  .accounts({
    admin: adminWallet.publicKey,
    pricingConfig: pricingConfigPDA,
  })
  .rpc();
```

### 3. Toggle Oracle Mode
```typescript
await program.methods
  .toggleOracle(false) // false = manual, true = Pyth oracle
  .accounts({
    admin: adminWallet.publicKey,
    pricingConfig: pricingConfigPDA,
  })
  .rpc();
```

### 4. Update Staleness Threshold
```typescript
await program.methods
  .updateStalenessThreshold(new anchor.BN(120)) // 120 seconds
  .accounts({
    admin: adminWallet.publicKey,
    pricingConfig: pricingConfigPDA,
  })
  .rpc();
```

---

## 💰 Pricing Matrix (20 Tiers)

### Current Rate: **0.5 FPT per 1 USDC**

| Pool | Tier | USDC Price | FPT Required @ 0.5 | FPT Required @ 3.0 |
|------|------|------------|-------------------|-------------------|
| LPM  | 5    | 5 USDC     | 2.5 FPT          | 15 FPT           |
| LPM  | 10   | 10 USDC    | 5 FPT            | 30 FPT           |
| LPM  | 20   | 20 USDC    | 10 FPT           | 60 FPT           |
| LPM  | 50   | 50 USDC    | 25 FPT           | 150 FPT          |
| DPL  | 5    | 5 USDC     | 2.5 FPT          | 15 FPT           |
| DPL  | 10   | 10 USDC    | 5 FPT            | 30 FPT           |
| DPL  | 15   | 15 USDC    | 7.5 FPT          | 45 FPT           |
| DPL  | 20   | 20 USDC    | 10 FPT           | 60 FPT           |
| WPL  | 5-20 | Same as DPL | Same as DPL     | Same as DPL      |
| MPL  | 5-20 | Same as DPL | Same as DPL     | Same as DPL      |
| YPL  | 5-20 | Same as DPL | Same as DPL     | Same as DPL      |

---

## 🧮 Price Calculation Formula

**Manual Rate Mode (Current):**
```
required_fpt = (tier_price_usdc * dpt_to_usdc_rate) / 10^6

Example:
- Tier: 5 USDC = 5_000_000 (6 decimals)
- Rate: 0.5 FPT = 500_000 (6 decimals)
- Result: (5_000_000 * 500_000) / 1_000_000 = 2_500_000 (2.5 FPT)
```

**Oracle Mode (Future):**
```
required_fpt = tier_price_usdc / pyth_dpt_usd_price
```

---

## 🔒 Security Features

### Admin Verification
- Hardcoded admin wallet: `EzrUKQPTj7iEAvaJj9rnv4HKUhRGjj4bDLRsAEQfyaYg`
- All admin instructions validate via `constraint` checks
- Non-admin transactions will fail with `InvalidAdminWallet`

### Math Safety
- All calculations use `checked_mul` and `checked_div`
- Zero rate validation prevents division by zero
- Overflow protection on all arithmetic operations

### Slippage Protection
- `validate_slippage()` function available
- User can specify `max_dpt_amount` when buying tickets
- Transaction reverts if calculated FPT > max allowed

---

## 🧪 Testing

Run the pricing config tests:
```bash
cd /home/dev/fortress
anchor test --skip-local-validator -- --grep "Fortress Pricing Configuration"
```

Or run individual test files:
```bash
anchor test tests/pricing-config.test.ts
```

---

## 📝 Next Steps (Phase 3)

### Update Buy Ticket Instructions

Modify all 5 buy_ticket handlers to use the new pricing system:

1. **Add PricingConfig account** to context structs
2. **Add `max_dpt_amount` parameter** for slippage protection
3. **Replace hardcoded price** with `calculate_required_fpt()`
4. **Validate slippage** before transfer

Example pattern:
```rust
// OLD (hardcoded):
let ticket_price = (tier as u64) * 3 * 1_000_000;

// NEW (dynamic):
let tier_usdc_price = LotteryType::LPM.get_tier_usdc_price(tier)?;
let required_fpt = calculate_required_fpt(
    &ctx.accounts.pricing_config,
    tier_usdc_price,
    None // No oracle feed yet
)?;
validate_slippage(required_fpt, max_dpt_amount)?;
```

---

## 🚀 Deployment Checklist (DO NOT DEPLOY YET)

- [x] Phase 1: Foundation (State + Oracle + Errors)
- [x] Phase 2: Admin Instructions
- [ ] Phase 3: Update Buy Ticket Instructions
- [ ] Phase 4: Local Testing (all 20 tiers)
- [ ] Phase 5: Devnet Testing
- [ ] Phase 6: Security Audit Review
- [ ] Phase 7: Mainnet Deployment

---

## 📞 Support Constants

```rust
ADMIN_WALLET: "EzrUKQPTj7iEAvaJj9rnv4HKUhRGjj4bDLRsAEQfyaYg"
FPT_MINT: "7vZbJ3WN4eGF6rGikB4MBLs4kiJwaRzNSX3smQRJJNw2"
PROGRAM_ID: "HerDfQLbrXk8CFPcCGW8sDvaegk1qYawSa82Wuzov4Lb"
DPT_DECIMALS: 6
USDC_DECIMALS: 6
```
