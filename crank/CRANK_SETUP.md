# 🤖 Fortress Protocol Mainnet Crank — Setup & Security Guide

## Overview

The **Fortress Crank** is an automated bot that:
1. Monitors all 16 lottery vaults (4 types × 4 tiers)
2. Triggers draws when conditions are met (LPM: 100 participants, Timed: expired + ≥1 participant)
3. Calls on-chain instructions signed by the crank wallet (`BzsGQccSzoWPiRSKoTNpf7iKxqJRq3CwvSygmzvwMei5`)
4. Returns no user wallet popups — all fees paid by the protocol

---

## ⚙️ Setup (First Time)

### 1. Install Dependencies

```bash
cd /home/dev/fortress/crank
npm install
```

### 2. Add Your Crank Private Key

Edit `crank/.env` and add your private key in **one** of these formats:

**Option A: Base58 (from Phantom export)**
```bash
CRANK_PRIVATE_KEY=YourBase58StringHere
```

**Option B: JSON byte array (from Solana CLI)**
```bash
CRANK_PRIVATE_KEY=[1,2,3,...,64]
```

**Option C: Reference a keypair file**
```bash
ANCHOR_WALLET=/home/dev/crank-wallet.json
```

### 3. Run the Crank

```bash
cd /home/dev/fortress/crank
source .env
npx ts-node index.ts
```

**Expected output:**
```
🔑 Crank wallet : BzsGQccSzoWPiRSKoTNpf7iKxqJRq3CwvSygmzvwMei5
💰 Balance       : X.XXXX SOL

[LPM $5]   participants=50   → wait
[LPM $10]  participants=100  → draw
[DPL $5]   endTime=1710835200 remaining=12345s → wait
...
✅ Crank run complete.
```

---

## 🔐 Security Best Practices

### ✅ DO:
- ✅ Store private key in `.env` (gitignored locally)
- ✅ Use GitHub Secrets for CI/CD (Actions, Vercel)
- ✅ Rotate keys every 6 months
- ✅ Monitor RPC usage at https://dashboard.helius.dev
- ✅ Keep crank wallet funded (0.05+ SOL minimum)

### ❌ DON'T:
- ❌ Commit `.env` to git (it's in .gitignore)
- ❌ Share private key with anyone
- ❌ Hardcode keys in code
- ❌ Use same key across multiple deployments
- ❌ Expose RPC URL with API key in logs

---

## 📋 Environment Variables

### Required
```bash
# RPC endpoint (Helius recommended for mainnet)
RPC_URL=https://mainnet.helius-rpc.com/?api-key=cfb2a320-c0b3-407c-8188-adef19b9da7f

# Crank wallet private key (one format)
CRANK_PRIVATE_KEY=<base58-or-json-array>
```

### Optional
```bash
# Test a single vault instead of all 16
LOTTERY_TYPE=LPM  # Options: LPM, DPL, WPL, MPL
TIER=50           # Options: LPM=[5,10,20,50], Others=[5,10,15,20]
```

---

## 🚀 For GitHub Actions / CI/CD

### Step 1: Add Secret to GitHub

1. Go to **Repo → Settings → Secrets and Variables → Actions**
2. Click **New repository secret**
3. Name: `CRANK_PRIVATE_KEY`
4. Value: Your Base58 private key (get from Phantom or Solana CLI)

### Step 2: Reference in Workflow

```yaml
# .github/workflows/crank-mainnet.yml
jobs:
  crank:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Run crank
        env:
          RPC_URL: https://mainnet.helius-rpc.com/?api-key=cfb2a320-c0b3-407c-8188-adef19b9da7f
          CRANK_PRIVATE_KEY: ${{ secrets.CRANK_PRIVATE_KEY }}
        run: |
          cd crank
          npm install
          npx ts-node index.ts
```

**Never put the actual key in the workflow file!** Always use `${{ secrets.CRANK_PRIVATE_KEY }}`

---

## 🔍 RPC Configuration

### Current Setup: Helius (Recommended)
```
Endpoint: https://mainnet.helius-rpc.com/?api-key=cfb2a320-c0b3-407c-8188-adef19b9da7f
Rate Limit: 1,000 req/min (free tier)
Latency: 100-300ms
Uptime: 99.9% SLA
```

### Why Helius?
- ✅ No rate limits on free tier (same as frontend)
- ✅ Faster than public Solana RPC
- ✅ Better for high-frequency crank operations
- ✅ Consistent with app/.env.local

### Fallback: Solana Public RPC
```
Endpoint: https://api.mainnet-beta.solana.com
Rate Limit: 100 req/sec (shared across all users)
Latency: 200-800ms
⚠️ Not recommended for mainnet production
```

---

## 📊 Monitoring

### Check RPC Usage
→ https://dashboard.helius.dev

### Logs
- Each run prints vault status
- Errors shown with on-chain logs
- Low balance warning if < 0.05 SOL

### Expected Costs
| Operation | Cost | Frequency |
|-----------|------|-----------|
| request_draw_entropy | ~5,000 lamports | Per draw |
| SB commit | ~3,000 lamports | Per draw |
| fulfill_draw_entropy | ~15,000 lamports | Per draw |
| Total per draw | ~23,000 lamports (~$0.008) | Every 24h-1000 ptcpts |

---

## 🛠️ Troubleshooting

### "CRANK_PRIVATE_KEY is invalid"
- Check `source .env` ran successfully
- Verify key is valid Base58 or JSON array
- Try exporting again from Phantom/Solana CLI

### "No RPC connection"
- Verify `RPC_URL` in .env
- Test: `curl https://mainnet.helius-rpc.com/?api-key=... -X POST ...`
- Check Helius dashboard for API key status

### "Balance is low"
- Fund crank wallet: `solana transfer <address> 0.5`
- Use Helius RPC for transfer: `solana config set --url https://mainnet.helius-rpc.com/?api-key=...`

### "RandomnessAccount not on-chain"
- Run: `npx ts-node ../scripts/reinit-sb-randomness-crank.ts`
- Must be done once per (type, tier) pair

---

## 📚 Key Files

| File | Purpose |
|------|---------|
| `crank/.env` | Environment variables (secrets) |
| `crank/.gitignore` | Excludes .env from git |
| `crank/index.ts` | Main crank logic |
| `crank/package.json` | Dependencies + dotenv |

---

## ✅ Checklist

- [ ] `.env` configured with private key and RPC URL
- [ ] `npm install` completed (dotenv installed)
- [ ] `source .env` runs without errors
- [ ] Crank wallet has > 0.05 SOL
- [ ] `npx ts-node index.ts` runs and print vault status
- [ ] GitHub Secrets set for CI/CD (if using Actions)
- [ ] `.env` is in `.gitignore` (already done)
- [ ] RPC usage monitored at Helius dashboard

---

## 🔗 Links

- **Helius Dashboard:** https://dashboard.helius.dev
- **Solana RPC Status:** https://status.solana.com
- **Fortress Smart Contract:** https://solscan.io/account/EB6kkg2sW5rnukjRH7Ljhz78gbfc36XZAuiFn5jdefF3
- **Crank Wallet:** https://solscan.io/account/BzsGQccSzoWPiRSKoTNpf7iKxqJRq3CwvSygmzvwMei5

---

**Last updated:** March 17, 2026
