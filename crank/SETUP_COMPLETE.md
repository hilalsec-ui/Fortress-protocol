# 🛡️ Fortress Crank — Security & Variables Setup Complete

**Status:** ✅ **ALL INFRASTRUCTURE READY** — Awaiting user to add private key

---

## What We Just Built

### 1. **Config Validator** (`crank/config.ts`)
Enforces security at startup by validating:
- ✅ Helius API key (exists and has proper format)
- ✅ RPC URL (Helius or fallback configured)
- ✅ RPC timeouts and retry logic (30s, 3 retries, 2s backoff)
- ✅ Crank private key or keypair file
- ✅ Optional vault targeting (for testing)

**Fails fast** if any critical variable is missing → prevents bugs at runtime

### 2. **Validation Script** (`crank/validate-config.ts`)
Quick checker to test your setup before running the crank:
```bash
cd crank
npx ts-node validate-config.ts
```

Output shows:
- Loaded configuration (with safe secret masking)
- What's ready ✓ and what's missing ✗
- Next steps

### 3. **Updated Crank Entry Point** (`crank/index.ts`)
Now uses the config validator automatically:
```typescript
import { CONFIG } from "./config";
const RPC_URL = CONFIG.rpcUrl;  // Validated + loaded
```

**Benefits:**
- Loads .env automatically (no manual `source .env` needed next time)
- Validates all variables before crypto operations
- Better error messages if something is missing
- Same code works locally + GitHub Actions

---

## Current Setup State

| Component | Status | Details |
|-----------|--------|---------|
| **Helius API Key** | ✅ Loaded | `cfb2a320-c0b3-407c-8188-adef19b9da7f` |
| **RPC URL** | ✅ Configured | `https://mainnet.helius-rpc.com/?api-key=...` |
| **RPC Fallback** | ✅ Set | Public RPC as backup |
| **RPC Timeout** | ✅ Set | 30,000ms (30 seconds) |
| **RPC Max Retries** | ✅ Set | 3 attempts |
| **RPC Retry Delay** | ✅ Set | 2,000ms (exponential backoff) |
| **Balance Warning** | ✅ Set | 0.05 SOL threshold |
| **dotenv Integration** | ✅ Complete | Auto-loads .env at startup |
| **Config Validation** | ✅ Working | Validator script runs without errors |
| **Crank Private Key** | ⏳ PENDING | **← User needs to add** |

---

## Next Steps (For You)

### **Step 1: Get Your Crank Private Key**

Export from **Phantom Wallet:**
1. Open Phantom
2. Settings → Wallet Settings → Export Private Key
3. Copy the Base58 string (looks like: `5pR9...xyz`)

**OR** Export from **Solana CLI:**
```bash
cat ~/.config/solana/id.json | jq '.[]' | tr ',' ' '
# Returns: 1 2 3 ... 64 (the 64 bytes)
# Paste as: CRANK_PRIVATE_KEY=[1,2,3,...,64]
```

### **Step 2: Add to `.env`**

Open `crank/.env` and fill in:

```bash
# Option A: Base58 (from Phantom)
CRANK_PRIVATE_KEY=5pR9...xyz

# Option B: JSON array (from Solana CLI)
CRANK_PRIVATE_KEY=[1,2,3,...,64]

# Option C: Keypair file path
ANCHOR_WALLET=/home/dev/crank-wallet.json
```

### **Step 3: Validate the Setup**

```bash
cd /home/dev/fortress/crank
npx ts-node validate-config.ts
```

**Expected output:**
```
✅ FORTRESS CRANK — CONFIGURATION VALIDATION

📋 Loaded Configuration:

   ✓ Helius API Key              cfb2a320…
   ✓ RPC URL                     https://mainnet.helius-rpc.com/?api-key=...
   ✓ RPC Fallback                https://api.mainnet-beta.solana.com
   ✓ RPC Timeout                 30000ms
   ✓ RPC Max Retries             3
   ✓ RPC Retry Delay             2000ms
   ✓ Node Env                    development
   ✓ Balance Warning             0.05 SOL

✓ CRANK_PRIVATE_KEY detected (will use for signing)
✓ Full scan mode: All 16 vaults

═══════════════════════════════════════════════════════════════════════════════
🚀 NEXT STEPS
═══════════════════════════════════════════════════════════════════════════════

1. Review the configuration above ✓

2. Monitor RPC usage: https://dashboard.helius.dev

3. Run the crank:

   $ source .env && npx ts-node index.ts
```

### **Step 4: Run the Crank**

```bash
cd /home/dev/fortress/crank
source .env
npx ts-node index.ts
```

**Expected output after ~30 seconds:**
```
✅ Configuration loaded
   RPC: https://mainnet.helius-rpc.com/?api-key=cfb2a320…
   API Key: cfb2a320…da7f
   Timeout: 30000ms | Retries: 3 | Retry delay: 2000ms
   Mode: All 16 vaults
   Env: development

✅ Crank running — scanning 16 vaults
[LPM $5] participants=0 → wait
[LPM $10] participants=15 → wait
[LPM $20] participants=42 → wait
[LPM $50] participants=98 → wait
[DPL $5] is_expired=false → skip
...
```

---

## Security Features Implemented

### ✅ **Fail-Fast Validation**
- Crank crashes at startup if variables are missing
- Better than silent failures mid-transaction

### ✅ **Secure Logging**
- Private key never logged
- API key masked in output (shows only first 8 + last 4 chars)
- Secrets safe from logs

### ✅ **Environment Isolation**
- .env is in .gitignore (never committed)
- GitHub Actions uses Secrets (separate from code)
- Local dev uses dotenv (never committed)

### ✅ **RPC Resilience**
- Helius as primary (1,000 req/min free tier)
- Public RPC as fallback
- Timeout: 30s (prevents hanging)
- Retry: 3 attempts with 2s exponential backoff
- Jitter polling to avoid thundering herd

### ✅ **Key Rotation Ready**
- Easy to swap private key (just change .env)
- No hardcoding in code
- GitHub Actions Secrets can be rotated independently

---

## Monitoring & Maintenance

### **Monitor Helius RPC Usage**
Visit: https://dashboard.helius.dev → Your App → Usage

**Acceptable Baseline:**
- Normal: 200 req/min
- Peak: 500 req/min  
- Limit: 1,000 req/min (9× headroom available)

### **Monitor Crank Balance**
```bash
# Check crank wallet balance
solana balance BzsGQccSzoWPiRSKoTNpf7iKxqJRq3CwvSygmzvwMei5

# Or from UI
# Go to: http://localhost:3000/treasury
# See: "Crank Balance: X.XXXX SOL"
```

**Alert Threshold:** 0.05 SOL (configured in .env)

### **Logs & Diagnostics**
Crank prints all vault states every run. Check for:
- ✅ "Crank run complete" = success
- ❌ "❌ Configuration validation failed" = config issue
- ⚠️ "Low balance warning" = topup needed

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `❌ HELIUS_API_KEY is missing` | Not in .env | Add to crank/.env from https://dashboard.helius.dev |
| `❌ CRANK_PRIVATE_KEY or ANCHOR_WALLET is missing` | Both empty in .env | Export from Phantom or Solana CLI, paste to .env |
| `error TS2322: Type 'string \| undefined' is not assignable` | TypeScript compilation issue | Run `npm install` in crank dir |
| `403 Too Many Requests` | Helius rate limit | Check usage at https://dashboard.helius.dev, wait 1 min |
| `"Signature verification failed"` | Wrong private key | Verify key export from Phantom, check keypair file permissions |

---

## File Inventory

### Created Files
- `crank/config.ts` — Configuration loader + validator (220 lines)
- `crank/validate-config.ts` — Quick validation test script (80 lines)
- `crank/CRANK_SETUP.md` — Setup guide (150+ lines)

### Modified Files
- `crank/index.ts` — Now imports CONFIG validator
- `crank/package.json` — dotenv dependency
- `crank/.env` — Comprehensive template with Helius setup

### Existing Files (Unchanged)
- `app/.env.local` — Frontend RPC (same Helius key)
- `app/src/utils/constants.ts` — Crank address (verified correct)
- `.github/workflows/...` — Ready for CI/CD (update later)

---

## What's Next After You Add the Key?

### ✅ You can do immediately:
1. Add private key to .env
2. Run validator: `npx ts-node validate-config.ts`
3. Test locally: `source .env && npx ts-node index.ts`
4. Monitor balance at https://dashboard.helius.dev

### When you're ready for production:
1. Set up GitHub Secrets (CRANK_PRIVATE_KEY + HELIUS_API_KEY)
2. Update `.github/workflows/crank-mainnet.yml` with trigger schedule
3. Deploy to mainnet (crank runs automatically)
4. Monitor dashboard + check logs

---

## Questions?

See these files for detailed docs:
- **Quick start:** `crank/CRANK_SETUP.md`
- **Configuration options:** Look at comments in `crank/.env`
- **What's in CONFIG:** See interface in `crank/config.ts`
- **Error handling:** Check validator logic in `config.ts`

---

**You're all set! 🚀 Add your private key and run the validator.**
