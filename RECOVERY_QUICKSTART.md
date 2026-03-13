# 🚀 Quick Start: SOL Recovery & Rebuild

## Current Problem
- ❌ 14 SOL locked in 4 LPM vaults (3.5 SOL each)
- ❌ Wallets only has 1.7 SOL
- ❌ Can't deploy (need ~6 SOL)

## Solution Phases

### Phase 1️⃣ - Prepare (5 min)
```bash
# Get 5 SOL (choose one):
solana airdrop 5                    # Fast if available
# OR transfer from another wallet
```

### Phase 2️⃣ - Deploy (3 min)
```bash
anchor build
anchor deploy --provider.cluster devnet
```

### Phase 3️⃣ - Recover (2 min)
```bash
npx ts-node scripts/close-lpm-vaults.ts
```
**Result: 14 SOL back in wallet + 0.2 SOL in vaults**

### Phase 4️⃣ - Rebuild (1 min)
```bash
npx ts-node scripts/rebuild-lpm-vaults.ts
```
**Result: All 4 vaults initialized with 0.05 SOL each**

---

## One-Command Full Recovery
```bash
./scripts/recovery-workflow.sh
```
Runs all phases automatically (requires ~5 SOL available first)

---

## Vault Funding Changes

| Before | After | Savings |
|--------|-------|---------|
| 3.5 SOL × 4 = 14 SOL | 0.05 SOL × 4 = 0.2 SOL | **13.8 SOL saved** |

---

## Verification

After rebuild, verify each vault:
```bash
solana balance <vault_address>
# Should show ~0.05 SOL
```

---

## Key Points
✅ Program updated to work with 0.05 SOL
✅ All tests updated to use 0.05 SOL
✅ Recovery scripts ready
✅ Build successful
❌ Waiting for 5 SOL to proceed

**Next: Get 5 SOL, then run recovery workflow!**

