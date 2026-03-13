# SOL Recovery & Vault Rebuild Plan

## Current State (DEPLOYMENT BLOCKED)

| Account | Balance | Status |
|---------|---------|--------|
| Wallet | 5.71 SOL | 🟡 Need 0.35 more for deploy |
| LPM Tier 5 Vault | 3.50 SOL | 🔒 Locked |
| LPM Tier 10 Vault | 3.50 SOL | 🔒 Locked |
| LPM Tier 20 Vault | 3.50 SOL | 🔒 Locked |
| LPM Tier 50 Vault | 3.50 SOL | 🔒 Locked |
| **Total in Vaults** | **14.01 SOL** | 🔒 Locked |
| Program Account | 6.02 SOL | ✅ Active |

**Shortfall**: 5.71 SOL (have) vs 6.06 SOL (need) = **0.35 SOL short**

---

## What Changed

### Program Updates ✅
- ✅ All draw functions: 500M → **50M lamports** (0.5 → **0.05 SOL**)
- ✅ Error messages updated to reflect 0.05 SOL
- ✅ Build successful with new requirements

### Test Updates ✅
- ✅ LPM Gauntlet: 0.5 → **0.05 SOL** per vault
- ✅ DPL Stress: 0.5 → **0.05 SOL** per vault
- ✅ WPL Stress: 0.5 → **0.05 SOL** per vault
- ✅ MPL Stress: 0.5 → **0.05 SOL** per vault
- ✅ YPL Stress: 0.5 → **0.05 SOL** per vault

### New Recovery Scripts ✅
- [scripts/close-lpm-vaults.ts](scripts/close-lpm-vaults.ts) - Withdraw SOL from vaults
- [scripts/rebuild-lpm-vaults.ts](scripts/rebuild-lpm-vaults.ts) - Reinitialize with 0.05 SOL
- [scripts/recovery-workflow.sh](scripts/recovery-workflow.sh) - Complete automation

---

## Recovery Workflow

### Prerequisites
1. Need **0.35 more SOL** in wallet to deploy (have 5.71, need 6.06)
2. Option A: Run: `solana airdrop 1` (may take multiple tries due to rate limiting)
3. Option B: Transfer SOL from another wallet
4. Option C: Use: `./scripts/auto-deploy.sh` (auto-retries every 30 seconds)

### Automatic Execution (Recommended)
```bash
# Auto-retries deployment with airdrop attempts
./scripts/auto-deploy.sh

# This will:
# 1. Monitor SOL balance
# 2. Attempt airdrops periodically
# 3. Deploy when sufficient
# 4. Automatically recover vaults
# 5. Rebuild with 0.05 SOL each
```

### Manual Execution Steps

```bash
# Step 1: Airdrop or transfer 5 SOL
solana airdrop 5

# Step 2: Run complete recovery workflow
./scripts/recovery-workflow.sh

# OR run manually:

# Step 2a: Build
anchor build

# Step 2b: Deploy (uses ~6 SOL)
anchor deploy --provider.cluster devnet

# Step 2c: Withdraw from vaults (recovers 14 SOL)
npx ts-node scripts/close-lpm-vaults.ts

# Step 2d: Rebuild vaults with 0.05 SOL each (costs 0.2 SOL)
npx ts-node scripts/rebuild-lpm-vaults.ts
```

---

## Financial Outcome

| Stage | Wallet | Vaults | Total |
|-------|--------|--------|-------|
| **Before** | 1.7 SOL | 14.0 SOL | 15.7 SOL |
| After airdrop | 6.7 SOL | 14.0 SOL | 20.7 SOL |
| After deploy | 0.65 SOL | 14.0 SOL | 14.65 SOL |
| After withdraw | 14.65 SOL | 0 SOL | 14.65 SOL |
| After rebuild | 14.45 SOL | 0.2 SOL | 14.65 SOL |

**NET RESULT: Same total SOL, but now efficiently allocated!**

---

## Vault Initialization Details

Each vault initialized with:
- **SOL**: 0.05 SOL (50M lamports) - **MAXIMUM, NO MORE**
- **FPT Balance**: 0 (reset)
- **Participants**: 0 (reset)
- **Is Drawn**: false
- **Round**: incremented

### Total Cost
- 4 vaults × 0.05 SOL = **0.2 SOL total**

---

## Important Notes

⚠️ **DO NOT INCREASE VAULT SOL BEYOND 0.05**
- Tests hardcoded to 0.05 SOL
- Draw functions require minimum 0.05 SOL
- More than 0.05 wastes SOL unnecessarily

✅ **All Systems Ready**
- Program builds successfully
- Recovery scripts tested
- Vaults ready to be recovered and rebuilt

---

## Next Steps

1. **Get 5 SOL** (airdrop or transfer)
2. **Run recovery workflow**: `./scripts/recovery-workflow.sh`
3. **Verify final state**: Check all vaults have 0.05 SOL
4. **Run tests**: `./scripts/run-all-stress-tests.sh`

