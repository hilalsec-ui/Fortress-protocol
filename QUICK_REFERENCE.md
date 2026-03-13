# 🚀 FORTRESS LOTTERY - QUICK REFERENCE

## 📌 Essential Information

**Program ID**: `HerDfQLbrXk8CFPcCGW8sDvaegk1qYawSa82Wuzov4Lb`  
**Admin Wallet**: `EzrUKQPTj7iEAvaJj9rnv4HKUhRGjj4bDLRsAEQfyaYg`  
**FPT Mint**: `7vZbJ3WN4eGF6rGikB4MBLs4kiJwaRzNSX3smQRJJNw2`  
**Network**: Solana Devnet (`https://api.devnet.solana.com`)  
**Current Rate**: 0.5 FPT per 1 USDC (500,000 in 6-decimal format)

---

## 🎫 Buy Ticket Function Signature

```rust
// ALL 5 functions now have this signature:
pub fn buy_lpm_ticket(
    ctx: Context<BuyLpmTicket>,
    tier: u8,              // Tier value: 5, 10, 15, 20, or 50 USDC
    quantity: u32,         // Number of tickets (1-50)
    max_dpt_amount: u64    // ⚠️ NEW: Slippage protection
) -> Result<()>

// Replicate for: buy_dpl_ticket, buy_wpl_ticket, buy_mpl_ticket, buy_ypl_ticket
```

**Slippage Calculation**:
```typescript
const tierUsdcPrice = tier * 1_000_000;
const rate = 500_000; // 0.5 FPT per USDC
const expectedDpt = (tierUsdcPrice * rate) / 1_000_000;
const maxDptAmount = Math.floor(expectedDpt * 1.1); // 10% tolerance
```

---

## 💰 Pricing Cheat Sheet

| Tier (USDC) | FPT at 0.5 rate | 10% Slippage Buffer |
|-------------|-----------------|---------------------|
| 5           | 2,500,000       | 2,750,000           |
| 10          | 5,000,000       | 5,500,000           |
| 15          | 7,500,000       | 8,250,000           |
| 20          | 10,000,000      | 11,000,000          |
| 50          | 25,000,000      | 27,500,000          |

**Formula**: `required_fpt = (tier × 1_000_000 × 500_000) / 1_000_000`

---

## 📦 PDAs

```rust
// Global Registry
[b"registry"] → GlobalRegistry (tracks all rounds)

// Pricing Config
[b"pricing_config"] → PricingConfig (exchange rate)

// Vault PDAs (all 20 tiers)
[b"vault_lpm", &[tier]] → LotteryVault (LPM tiers: 5,10,20,50)
[b"vault_dpl", &[tier]] → LotteryVault (DPL tiers: 5,10,15,20)
[b"vault_wpl", &[tier]] → LotteryVault (WPL tiers: 5,10,15,20)
[b"vault_mpl", &[tier]] → LotteryVault (MPL tiers: 5,10,15,20)
[b"vault_ypl", &[tier]] → LotteryVault (YPL tiers: 5,10,15,20)

// Participant Pages
[b"page", lottery_type_le, tier_le, page_number_le] → ParticipantPage
```

---

## 🔄 Round Tracking

**GlobalRegistry Fields**:
```rust
pub lpm_rounds: [u32; 4],  // [tier5_round, tier10_round, tier20_round, tier50_round]
pub dpl_rounds: [u32; 4],  // [tier5_round, tier10_round, tier15_round, tier20_round]
pub wpl_rounds: [u32; 4],  // [tier5_round, tier10_round, tier15_round, tier20_round]
pub mpl_rounds: [u32; 4],  // [tier5_round, tier10_round, tier15_round, tier20_round]
pub ypl_rounds: [u32; 4],  // [tier5_round, tier10_round, tier15_round, tier20_round]
```

**Tier Index Mapping**:
```rust
// LPM: {5→0, 10→1, 20→2, 50→3}
// DPL/WPL/MPL/YPL: {5→0, 10→1, 15→2, 20→3}

let tier_index = GlobalRegistry::get_tier_index(lottery_type, tier)?;
let current_round = registry.lpm_rounds[tier_index]; // Example for LPM
```

---

## 🔧 Admin Commands

```bash
# Initialize pricing config (run once)
anchor run initialize-pricing --provider.cluster devnet
# Creates PricingConfig with rate=500,000, use_oracle=false

# Update exchange rate
anchor run update-rate --args <new_rate_u64>
# Example: 600_000 = 0.6 FPT per USDC

# Toggle oracle mode
anchor run toggle-oracle --args <true|false>
# Currently false (manual rate mode)

# Update staleness threshold
anchor run update-staleness-threshold --args <seconds>
# Default: 60 seconds
```

---

## 🧪 Test Commands

```bash
# Run all tests
anchor test --skip-local-validator

# Run specific test file
anchor test --skip-local-validator tests/buy-ticket-pricing.test.ts

# Check compilation
cargo check

# Build program
anchor build
```

---

## 📊 Verification Commands

```bash
# Check deployment status
solana program show HerDfQLbrXk8CFPcCGW8sDvaegk1qYawSa82Wuzov4Lb

# Check admin wallet balance
solana balance EzrUKQPTj7iEAvaJj9rnv4HKUhRGjj4bDLRsAEQfyaYg

# Check FPT mint
solana account 7vZbJ3WN4eGF6rGikB4MBLs4kiJwaRzNSX3smQRJJNw2

# Verify cluster configuration
solana config get
# Should show: https://api.devnet.solana.com

# Run verification script
./verify-deployment-ready.sh
```

---

## 🎯 Deployment Sequence

```bash
# 1. Deploy program
anchor deploy --provider.cluster devnet

# 2. Initialize global registry
anchor run initialize-registry

# 3. Initialize pricing config
anchor run initialize-pricing

# 4. Initialize all 20 tiers (LPM: 5,10,20,50 | DPL/WPL/MPL/YPL: 5,10,15,20)
anchor run initialize-lpm-5
anchor run initialize-lpm-10
anchor run initialize-lpm-20
anchor run initialize-lpm-50
# ... repeat for DPL, WPL, MPL, YPL

# 5. Verify deployment
anchor run verify-deployment
```

---

## ⚠️ Common Issues

**Issue**: Transaction fails with "SlippageExceeded"  
**Fix**: Increase `max_dpt_amount` parameter (add 10-20% buffer)

**Issue**: "InvalidTier" error  
**Fix**: Verify tier value matches lottery type (LPM: 5,10,20,50 | Others: 5,10,15,20)

**Issue**: "InsufficientBalance"  
**Fix**: Ensure buyer has enough FPT tokens in their ATA

**Issue**: "LotteryAlreadyDrawn"  
**Fix**: Wait for admin to draw winner and reset vault

**Issue**: "LpmCapacityExceeded"  
**Fix**: LPM has 100-ticket hard cap, wait for draw

---

## 🔐 Security Checklist

- ✅ RPC API key removed (using official devnet)
- ✅ Admin wallet enforced on all pricing functions
- ✅ Checked arithmetic prevents overflow
- ✅ Slippage protection on all purchases
- ✅ Round tracking prevents fund contamination
- ⚠️ Clock-based randomness (Pyth pending)
- ⚠️ PDA seeds don't include round_number (state-only)

---

## 📝 Key Files

```
programs/fortress_lottery/src/
├── state/
│   ├── lottery_vault.rs          # Vault state + round_number
│   ├── global_registry.rs        # Round tracking arrays
│   └── pricing_config.rs         # Exchange rate config
├── instructions/
│   ├── buy_ticket.rs             # 5 buy functions with pricing
│   ├── draw_winner.rs            # 5 draw functions with round increment
│   ├── initialize.rs             # Round initialization
│   └── admin.rs                  # 4 pricing admin functions
├── oracle.rs                     # Price calculation + slippage
├── errors.rs                     # 8 new error codes
└── lib.rs                        # Entry point

tests/
├── buy-ticket-pricing.test.ts    # Dynamic pricing tests
└── pricing-config.test.ts        # Admin function tests

DEPLOYMENT_READINESS_FINAL.md     # Full deployment guide
IMPLEMENTATION_COMPLETE_FINAL.md  # Complete code changes
verify-deployment-ready.sh        # Automated verification
```

---

## 🚦 Status

**Build**: ✅ PASSED (755K program)  
**Tests**: ⏸️ READY (not executed - DO NOT DEPLOY)  
**Deployment**: ⏸️ PAUSED (user authorization required)  
**Documentation**: ✅ COMPLETE

---

**Last Updated**: 2025  
**Prepared By**: GitHub Copilot (Claude Sonnet 4.5)
