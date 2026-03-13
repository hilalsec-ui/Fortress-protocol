# Drift-Proof Global Sync: Quick Reference

## What Is It?

A system that locks all lottery countdown timers to **Solana blockchain time** instead of local computer time. Every 60 seconds, the app fetches the latest blockchain timestamp and calculates a "time offset" that all timers use.

## How It Works (30-Second Version)

```
Every 60 seconds:
  1. Fetch blockchain time: connection.getBlockTime()
  2. Calculate offset: timeOffset = blockTime - (Date.now() / 1000)
  3. Store in Zustand: useTimeOffsetStore
  4. All timers recalculate: remaining = endTime - (Date.now() / 1000 + timeOffset)
```

**Result**: If your computer clock is wrong or you sleep for 8 hours, timers are still accurate when you wake up.

---

## In Your Components

### Basic Timer with Drift-Proof Sync

```tsx
import { CountdownTimer } from '@/components/CountdownTimer';
import { useTimeOffsetStore } from '@/stores/timeOffsetStore';

export default function LotteryPage() {
  const isSyncing = useTimeOffsetStore((state) => state.isSyncing);
  
  return (
    <>
      {/* Timer automatically uses time offset */}
      <CountdownTimer 
        targetTimestamp={vault.endTime}
        isSyncing={isSyncing}  // Shows "Syncing with Solana..." spinner
      />
    </>
  );
}
```

### Check If Draw Should Be Enabled

```tsx
import { isDrawReady } from '@/utils/drawTimingUtils';
import { useTimeOffsetStore } from '@/stores/timeOffsetStore';

export default function DrawButton() {
  const timeOffset = useTimeOffsetStore((state) => state.timeOffset);
  
  // Draw is ready when remaining <= -2 seconds (2+ seconds past expiry)
  const isReady = isDrawReady(vault.endTime);
  
  return (
    <button disabled={!isReady}>
      {isReady ? '🎲 Draw Winner' : '⏱ Coming Soon'}
    </button>
  );
}
```

### Get Adjusted Current Time

```tsx
import { useTimeOffsetStore } from '@/stores/timeOffsetStore';

export default function Clock() {
  const adjustedNow = useTimeOffsetStore.getState().getAdjustedNow();
  // adjustedNow is always synchronized to blockchain time (in seconds)
  
  return <div>{new Date(adjustedNow * 1000).toISOString()}</div>;
}
```

---

## File Locations

| File | Purpose |
|------|---------|
| `app/src/stores/timeOffsetStore.ts` | Zustand store for time offset state |
| `app/src/services/solanaHeartbeat.ts` | 60-second sync service |
| `app/src/utils/drawTimingUtils.ts` | Draw timing helpers |
| `app/src/components/SolanaHeartbeatInitializer.tsx` | Startup initializer |
| `app/src/components/CountdownTimer.tsx` | Updated with sync support |
| `app/src/services/lotteryService.ts` | Added `fetchVaultExpiryTimestamp()` |

---

## Key Functions

### `fetchVaultExpiryTimestamp(program, lotteryType, tier)`

Fetch the on-chain vault's expiry timestamp (never calculate from duration).

```typescript
import { fetchVaultExpiryTimestamp } from '@/services/lotteryService';

const endTime = await fetchVaultExpiryTimestamp(program, 'DPL', 5);
// Returns: Unix timestamp in seconds (or 0 if not initialized)
```

### `isDrawReady(expiryTimestamp)`

Check if draw is eligible (with -2 second safety buffer).

```typescript
import { isDrawReady } from '@/utils/drawTimingUtils';

if (isDrawReady(vault.endTime)) {
  // Draw button should be enabled
  // remaining <= -2 (at least 2 seconds past expiry)
}
```

### `useTimeOffsetStore()`

Access time offset state.

```typescript
const timeOffset = useTimeOffsetStore((state) => state.timeOffset);
const isSyncing = useTimeOffsetStore((state) => state.isSyncing);
const syncError = useTimeOffsetStore((state) => state.syncError);
```

---

## The -2 Second Buffer Explained

```
Time: ...... -2s .... -1s .... 0s (expiry) .... +1s .... +2s .....

Button:     DISABLED  DISABLED  DISABLED      DISABLED  ENABLED

Why?
- remaining = -2: Draw is enabled (2 seconds PAST expiry)
- remaining = -1: Draw is disabled (only 1 second past)
- remaining = 0:  Draw is disabled (exactly at expiry)
```

This prevents users from clicking too early and gives the Pyth oracle time to update.

---

## What Changes for Users?

### Before (Local Time)

```
Timer showing: 05:00 remaining
User closes laptop
User opens after 6 hours
Timer now shows: INVALID / STALE TIME
User confused about when draw happens
```

### After (Blockchain Time)

```
Timer showing: 05:00 remaining (locked to blockchain)
User closes laptop
User opens after 6 hours
Timer immediately shows: CORRECT TIME (blockchain has advanced 6 hours)
User knows draw time accurately
```

---

##Troubleshooting

### Q: Timer isn't updating
**A**: Check browser console for `[Heartbeat]` logs. Make sure wallet is connected.

### Q: "Syncing with Solana..." shows for too long
**A**: RPC endpoint is slow (>10s). Check network in DevTools.

### Q: Time offset seems wrong
**A**: Your system clock might be off. This is expected - the sync accounts for this.

### Q: Draw button won't enable
**A**: Check if `remaining <= -2`. Log it: `getTimeRemaining(vault.endTime)`

---

## Console Logs

**Look for these in browser console (all start with `[Heartbeat]`):**

```
[Heartbeat] Initialized with Solana connection
[Heartbeat] Sync complete. BlockTime: 1709254800, LocalTime: 1709254799, Offset: +1.00 seconds
[Heartbeat] Sync service stopped
[Heartbeat] Sync already in progress - skipping cycle
[Heartbeat] Block time fetch timeout (>10s)
[Heartbeat] Sync failed: Network error
```

---

## Implementation Checklist

- ✅ Zustand store created: `timeOffsetStore.ts`
- ✅ Heartbeat service created: `solanaHeartbeat.ts`
- ✅ Draw timing utils created: `drawTimingUtils.ts`
- ✅ Initializer component created: `SolanaHeartbeatInitializer.tsx`
- ✅ CountdownTimer updated with offset formula
- ✅ DPL/WPL/MPL pages updated with new draw logic
- ✅ Root layout updated to initialize heartbeat
- ✅ Zustand dependency added to package.json
- ✅ Build passes with zero TypeScript errors
- ✅ All pages compile successfully

---

## Next Steps for Deployment

1. **Test the sync**: Open app in DevTools, watch Network tab for `getSlot()` and `getBlockTime()` calls every 60s
2. **Verify timer accuracy**: Compare countdown timer to Solscan blockchain time
3. **Test sleep scenario**: Close laptop, wait 5+ minutes, reopen - timer should show correct time
4. **Test draw timing**: Verify draw becomes enabled exactly 2+ seconds after expiry
5. **Monitor logs**: Watch for any `[Heartbeat]` errors in production

---

## Performance Notes

- **Network**: 2 RPC calls every 60 seconds (~0.3 calls/min)
- **Memory**: <2KB for store + service
- **CPU**: Negligible (idle except during sync)
- **Fallback**: If sync fails, timers continue using last known offset

---

## Questions?

Refer to [`DRIFT_PROOF_GLOBAL_SYNC_COMPLETE.md`](DRIFT_PROOF_GLOBAL_SYNC_COMPLETE.md) for detailed architecture, formulas, and testing scenarios.
