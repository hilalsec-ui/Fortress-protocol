# 🎯 QUICK REFERENCE - Fortress Lottery Devnet

## Essential Information

**Program ID:** `G9Txe8edHEeR1zjC7VvS9fQja43z7ww3V7r7R8yjC7Ca`  
**Network:** Devnet  
**Date:** February 4, 2026  
**Status:** ✅ OPERATIONAL

---

## Run Tests

```bash
# Test all 16 vaults
cd /home/dev/fortress
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=/home/dev/my-wallet.json \
npx ts-node scripts/test-all-vaults.ts
```

---

## Check Balances

```bash
# Wallet balance
solana balance /home/dev/my-wallet.json --url devnet

# Treasury vault balance
solana balance FLvbZWgmj8tJ4Gj8wuZfbKFPTViFdJ2UYV1DKZvdEvtW --url devnet
```

---

## Fund Treasury Vault

```bash
# Transfer SOL to treasury vault for operations
solana transfer FLvbZWgmj8tJ4Gj8wuZfbKFPTViFdJ2UYV1DKZvdEvtW 1.5 \
  --url devnet \
  --from /home/dev/my-wallet.json
```

---

## Re-Initialize Vaults (if needed)

```bash
# If any vault fails, re-run initialization
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=/home/dev/my-wallet.json \
npx ts-node scripts/init-all-vaults.ts
```

---

## Key PDAs

| Component | Address |
|-----------|---------|
| Pricing Config | `5BLPKRyJJomAkiF9sguVQTGRgxuerjzB7tEppAevPGon` |
| Treasury | `HuudKwarLqLycaFh9u6vfLXm8q17pgUi8namsHuspC1Q` |
| Treasury Vault | `FLvbZWgmj8tJ4Gj8wuZfbKFPTViFdJ2UYV1DKZvdEvtW` |
| FPT Token | `3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj` |

---

## All 16 Vault Addresses

### LPM (Lightning Pool)
- Bronze: `ABMjWyd245F4D9JA7nwPfe3PkDfyokSFrBCr3xMbV4Qe`
- Silver: `AXo2nPtR1ayVQDhPvYhfYm3LkXWsJyop2HxxfB11VTVw`
- Gold: `6RXHrJW4oovd67T1pWZi35FMzBNcLvaQdcVBCmjMFLuD`
- Diamond: `22nSytD52ixNnPvGN51Q9PgKd8CpFGUSksujDsuHxZgm`

### DPL (Daily Pool)
- Bronze: `9HiVeZoZYbLGKzUce634DWB8wtcxsdSckJ2XQPj7Xpzz`
- Silver: `CcTkQq4YtUr5Xc6yyCUnPgwUSJMjvd2jRBZ7LG4cAm3C`
- Gold: `6Qt3RoHS9XYMV7MQ7Q23k9ixTD89TdK8tezKFQfxuhBV`
- Diamond: `gcnNSSp9DY8G7KQtvXMYY5yswgS8HSHSHGTP1JRogmZ`

### WPL (Weekly Pool)
- Bronze: `3ANsgxBMJborbGW9fPfb9poKy3aNrBfLmMyYmonakFDP`
- Silver: `GqyxpyTjQApES6uMcCKsN1KpK7TtPVxJ447aVajMMUQc`
- Gold: `HLsuJrBAWdoaqb2xw196Mx5FsK3WmTQY6WsjMyTnGmPB`
- Diamond: `ED8a13yYYx8ZFTDszTRNeGJ4vRCdsUDe9qCgDiGNy3qW`

### MPL (Monthly Pool)
- Bronze: `HCfKHHeUqM8M73hrLz3DorPDQ8za1jtwTd5v5aT6dWFn`
- Silver: `7M3Wf6yNrb3vx1mHRivKRRDF6XnwdZfDMuYiKh7MN7xv`
- Gold: `319oPSuSMbhcaA2aJsXT6oSQZfHKdxxrydiSWmPootVx`
- Diamond: `AZryKGa1v44V2rVeqLEYJuFhVBGHkVjPsDGxvXFMJAvh`

---

## Troubleshooting

### Issue: "Account not found"
**Solution:** Run initialization script again

### Issue: "Insufficient lamports"
**Solution:** Fund treasury vault with SOL

### Issue: "Account deserialization failed"
**Solution:** This was fixed in fresh deployment! ✅

---

## Build & Deploy Commands

```bash
# Build
anchor build

# Deploy
anchor deploy --provider.cluster devnet

# Deploy with specific keypair
solana program deploy target/deploy/fortress_lottery.so \
  --program-id target/deploy/fortress_lottery-keypair.json \
  --url devnet
```

---

## Important Notes

⚠️ **Treasury Vault needs funding before operations**
- Priority tips: 0.05 SOL per draw
- Recommend keeping 1-2 SOL minimum

✅ **All vaults initialized and tested**
- 16/16 vaults ready
- 100% test success rate

✅ **Pricing configured correctly**
- 0.5 FPT per 1 USDC
- Rate: 500,000 (with 6 decimals)

---

**Last Updated:** February 4, 2026
