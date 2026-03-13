# Drift-Proof Global Sync: Before vs After

## Scenario 1: User with Slow Computer Clock

### BEFORE (Local Time Only)

```
User's system clock: 14:00:00 (5 minutes SLOW)
Actual blockchain time: 14:05:00
Lottery expires at: 15:00:00 blockchain time

What user sees:
┌─────────────────────────────┐
│ Time Until Draw             │
│ 00:59:57  ← WRONG!          │
│           (shows 1 hour)     │
└─────────────────────────────┘

Problem:
  - User thinks draw is in 1 hour
  - Actually, it's in 55 minutes
  - User is confused about when to check back
  - If user leaves, might miss the draw
```

### AFTER (Blockchain Time)

```
User's system clock: 14:00:00 (5 minutes SLOW)
Actual blockchain time: 14:05:00
Lottery expires at: 15:00:00 blockchain time

What user sees:
┌─────────────────────────────┐
│ Time Until Draw             │
│ ↺ Syncing...                │  (first 1 second)
│ 00:54:55  ← CORRECT!        │
│           (shows 55 minutes) │
└─────────────────────────────┘

Result:
  - User sees accurate blockchain time
  - Draw timer is correct despite their clock being wrong
  - User can reliably plan when to return
  - Their system clock error is COMPENSATED
```

---

## Scenario 2: User Closes Laptop & Returns 8 Hours Later

### BEFORE (Local Time Only)

```
Action Timeline:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

14:00 Monday → User opens app
  ┌─────────────────────────────┐
  │ Lottery expires at:         │
  │ 22:00 Monday (8 hours)      │
  └─────────────────────────────┘

14:30 Monday → User closes laptop
  [System clock frozen at 14:30]

22:30 Monday (8 hours later) → User wakes laptop & opens app
  [System boots, updates clock to 22:30]
  
  Display shows:
  ┌─────────────────────────────┐
  │ Time Until Draw:            │
  │ 23:29:30  ← STALE!          │
  │                             │
  │ "Timer is broken!"          │
  │ [User has no idea draw      │
  │  expired 30 minutes ago]    │
  └─────────────────────────────┘

Problems:
  ✗ User thinks draw is in 23+ hours (WRONG)
  ✗ User doesn't know draw already expired
  ✗ User confused about what to do
```

### AFTER (Blockchain Time with Offset)

```
Action Timeline:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

14:00 Monday → User opens app
  First sync:
    ├─ Blockchain time: 14:00
    ├─ Offset calculated: 0
  ┌─────────────────────────────┐
  │ Lottery expires at:         │
  │ 22:00 Monday (8 hours)      │
  │ ↺ Syncing with Solana...    │
  └─────────────────────────────┘

14:30 Monday → User closes laptop
  [System clock frozen at 14:30]
  [Service stops gracefully]

22:30 Monday (8 hours later) → User wakes laptop & opens app
  [System boots, updates clock to 22:30]
  [Browser reloaded]
  
  First sync after wake:
    ├─ Blockchain time: 22:35 (8h 35min passed)
    ├─ Local time: 22:30
    ├─ Offset calculated: +5
    └─ All timers update INSTANTLY
  
  Display shows:
  ┌─────────────────────────────┐
  │ Time Until Draw:            │
  │ ↺ Syncing with Solana...    │
  │                             │
  │ (spinner appears for 1 sec) │
  │                             │
  │ 🎯 Draw Ready!              │  ← Correct!
  │ 00:00:-30 (30 sec EXPIRED)  │
  │                             │
  │ [🎲 Draw Winner Button      │
  │  is now ENABLED]            │
  └─────────────────────────────┘

Success:
  ✓ User sees draw is already expired
  ✓ Draw button is available to click
  ✓ User realizes they can still execute draw
  ✓ System is in correct state
```

---

## Scenario 3: Multiple Users at Different Clocks Drawing at Same Moment

### BEFORE (No Sync)

```
All three happen at DIFFERENT blockchain moments:

User A (correct clock: 15:00:00):
  - Timer shows 0 seconds
  - Clicks "Draw" button at local 15:00:00
  - ✓ Draw executes

User B (fast clock: 14:55:00 shows on screen, actually 15:00:00):
  - Timer shows -5 minutes (already past)
  - Confused, clicks "Draw" button anyway at blockchain 15:00:00
  - Might hit rate limit or timing error

User C (slow clock: 15:10:00 shows on screen, actually 15:00:00):
  - Timer shows +10 minutes remaining
  - Doesn't click, thinks lottery still has time
  - By the time they click at blockchain 15:10:00, draw already done by others

❌ BAD: All three see DIFFERENT times, can't coordinate draw
```

### AFTER (With Offset Sync)

```
All three happen at SAME blockchain moment:

User A (correct clock: 15:00:00):
  - Offset: 0
  - Adjusted time: 15:00:00 + 0 = 15:00:00
  - Timer shows: remaining = 15:00:00 - 15:00:00 = 0 seconds
  - Remaining grows to negative: -2 seconds
  - Button: ENABLED ✓
  - Clicks at blockchain 15:00:02

User B (fast clock: 14:55:00 physical):
  - Offset: -300 (blockchain is 5 minutes behind physical clock)
  - Adjusted time: 14:55:00 - 300 = 14:50:00 (adjusted backward)
  - Timer shows: remaining = 15:00:00 - 14:55:00 = +5 minutes
  - ...60 seconds later with new sync...
  - Offset: -299 (minor drift, recalculated)
  - Eventually adjusted time reaches 15:00:00 when physical hits 15:05:00
  - Button: ENABLED when remaining = -2
  - Clicks at blockchain 15:00:02

User C (slow clock: 15:10:00 physical):
  - Offset: +300 (blockchain is 10 minutes ahead)
  - Adjusted time: 15:10:00 + 300 = 15:15:00 (adjusted forward)
  - Timer shows: remaining = 15:00:00 - 15:10:00 = -10 minutes
  - Button: ENABLED immediately (already past expiry)
  - Clicks immediately at blockchain 15:00:02

✓ GOOD: All three click within same 2-second window (15:00:00 to 15:00:02)
✓ All three have synchronized experience despite different device clocks
```

---

## Scenario 4: System Time Drifts During Day

### BEFORE (Local Time - Drifts Over Time)

```
Day progress:

09:00 AM → Timer shows: 24:00:00 (24 hours remaining)
  User leaves browser open
  System clock slowly drifts (common on older machines)

12:00 PM (3 hours later) → Timer shows: 20:57:30
  Expected: 21:00:00 (3 hours passed)
  Actual: 21:02:30 (3 hours 2.5 min passed)
  ✗ Timer is 2.5 minutes BEHIND

15:00 PM (6 hours later) → Timer shows: 17:55:00
  Expected: 18:00:00 (6 hours passed)
  Actual: 18:07:15 (6 hours 7.25 min passed)
  ✗ Timer is 7+ minutes BEHIND

Problem:
  - System clock drifts naturally over time
  - Timer becomes less and less accurate
  - By lottery expiry, user might be confused about exact time
```

### AFTER (Blockchain Time - Recalibrated Every 60 Seconds)

```
Day progress:

09:00 AM → First sync
  Offset calculated: 0
  Timer shows: 24:00:00 ✓

09:01 AM → Second sync (60 sec later)
  Offset recalculated: +0.3 (minor drift)
  Timer NOW shows: 23:59:30.7 (corrected!)

12:00 PM (3 hours later) → Sync 181
  Offset recalculated: -0.2 (system clock corrected by NTP)
  Timer shows: 20:59:59.8 ✓ (back on track, minor difference)

15:00 PM (6 hours later) → Sync 361
  Offset recalculated: +0.1
  Timer shows: 17:59:59.9 ✓ (always within 1 second of accurate)

Result:
  ✓ Offset is recalculated every 60 seconds
  ✓ Any clock drift is compensated immediately
  ✓ Timer is always accurate to within <1 second
  ✓ User never sees stale time
```

---

## Scenario 5: Draw Timing Window (Safety Buffer)

### BEFORE (No Safety Buffer)

```
Lottery expires at 15:00:00 blockchain time

User 1 (clicks when they THINK it's 15:00:00):
  Their local time: 15:00:00
  Actual blockchain time: 14:59:58
  Transaction: REJECTED (expiry hasn't arrived yet)
  User: "Why didn't it work?!"

User 2 (clicks when they're SURE it's past):
  Their local time: 15:00:15
  Actual blockchain time: 15:00:13
  Transaction: ACCEPTED, but too late, others already drew

Problems:
  ✗ Users clicking too early get rejected
  ✗ Hard to coordinate exact moment
  ✗ Confusing UX
```

### AFTER (2-Second Safety Buffer)

```
Lottery expires at 15:00:00 blockchain time

Draw is enabled when: remaining <= -2 seconds
  = When: 15:00:02 blockchain time

User 1 (clicks when button appears):
  Blockchain time: 15:00:02
  Remaining: -2.00 seconds
  ✓ Button ENABLED
  ✓ Transaction: ACCEPTED

User 2 (also clicks when button appears):
  Blockchain time: 15:00:01.5
  Remaining: -1.50 seconds
  ✓ Button is DISABLED (still < -2)
  ✓ User waits 0.5 more seconds

User 3 (clicks within window):
  Blockchain time: 15:00:02.5
  Remaining: -2.50 seconds
  ✓ Button ENABLED
  ✓ Transaction: ACCEPTED

Safe window:
  [Start] 15:00:00 —— SAFE BUFFER —— 15:00:02 [Button Enabled] —— 15:00:05 [End]
         Expiry      (2 seconds)      Earliest Click    (Until someone wins)

Benefits:
  ✓ 2-second buffer prevents early clicks
  ✓ Button is disabled until it's really time
  ✓ Clear, unambiguous UX
  ✓ Protects against edge-case timing bugs
```

---

## Summary Table

| Aspect | Before | After |
|--------|--------|-------|
| **Timer Accuracy** | Uses local clock (can be wrong) | Synced to blockchain every 60s |
| **Laptop Sleep** | Shows stale time when waking | Recalibrates immediately |
| **Clock Skew** | No correction (if user clock wrong, user sees wrong time) | Offset compensates for any clock error |
| **Draw Button** | Enabled when local time >= expiry | Enabled when blockchain remaining <= -2 |
| **RPC Calls** | Only on demand | Every 60s (minimal: 0.3/min) |
| **User Confusion** | "Why does my timer show 10 hours but draw is at 15:00?" | "Timer always matches blockchain" |
| **Multi-User Sync** | Different users enabled at different times | All users enabled at same blockchain moment |
| **Fallback** | None, breaks if time is wrong | Uses last known offset, survives outages |
| **Visual Feedback** | No sync indicator | "Syncing with Solana..." spinner |

---

## The Bottom Line

**BEFORE**: Timer is only as accurate as the user's system clock  
**AFTER**: Timer is locked to Solana blockchain time, automatically resynced every 60 seconds

✨ **Users get one source of truth: The blockchain itself** ✨
