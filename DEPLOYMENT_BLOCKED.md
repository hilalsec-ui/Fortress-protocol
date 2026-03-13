# Deployment Blocked: SOL Shortfall

## Current Status
- ✅ Build: SUCCESS
- ❌ Deploy: BLOCKED
  - Have: 5.707 SOL
  - Need: 6.052 SOL
  - **Shortfall: 0.345 SOL**

## Why Blocked
The program upgrade requires:
- 6.052 SOL (data storage)
- 0.004545 SOL (transaction fees)
- Total: **6.056 SOL**

We have: **5.707 SOL**

## Solutions (in order of preference)

### Option 1: Wait for Airdrop (Free)
Devnet airdrop is currently rate-limited. Try again later:
```bash
solana airdrop 1 --url devnet
# Wait 15-30 minutes and retry
```

### Option 2: Transfer SOL (Fast if you have another account)
If you have SOL in another wallet:
```bash
solana transfer <from-wallet> <amount> --allow-unfunded-recipient
# Then try deploy
```

### Option 3: Use Localnet (Development Only)
Deploy to local Solana cluster instead:
```bash
# Terminal 1
solana-test-validator

# Terminal 2
anchor deploy --provider.cluster localnet
```

### Option 4: Manual Program Close and Redeploy
Close unused program data to free rent:
```bash
# Close old program versions (if any)
solana program close <old-program-id> --recipient <wallet>
```

---

## Once You Get 0.35 More SOL

### Full Automation
```bash
./scripts/recovery-workflow.sh
```

### Manual Steps
```bash
# 1. Deploy (needs ~6.05 SOL)
anchor deploy --provider.cluster devnet

# 2. Withdraw all SOL from vaults (recovers ~14 SOL)
npx ts-node scripts/close-lpm-vaults.ts

# 3. Rebuild with 0.05 SOL per vault (costs 0.2 SOL)
npx ts-node scripts/rebuild-lpm-vaults.ts
```

---

## Recommended Next Steps

1. **Try airdrop in 15 minutes**: `solana airdrop 1`
2. **If still rate-limited**: Check devnet status or use localnet
3. **Once you have 6.05 SOL**: Run recovery workflow

## Checkpoint Status
- ✅ Program code: Updated to 0.05 SOL minimum
- ✅ Tests: Updated to use 0.05 SOL
- ✅ Recovery scripts: Ready to execute
- ✅ Build: Successful
- ❌ Deploy: Waiting for 0.35 more SOL

**All systems ready - just need SOL!**

