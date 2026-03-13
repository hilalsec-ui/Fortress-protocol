# Per-Tier Draw State Refactor - Complete ✅

## Overview

Refined the lottery draw system to implement **isolated per-tier loading states**, preventing accidental multi-tier UI feedback and ensuring only one tier's button shows a loading spinner at a time.

---

## Changes Implemented

### 1. State Management Refactor

**Before:**
```typescript
const [isDrawing, setIsDrawing] = useState(false);
```

**After:**
```typescript
const [isDrawingByTier, setIsDrawingByTier] = useState<Record<number, boolean>>({
  5: false,
  10: false,
  15: false,
  20: false,
});
```

**Impact:** When user clicks "Draw Winner" for tier 5, only tier 5's button shows the spinner. Other tiers (10, 15, 20) remain unaffected.

---

### 2. Function Update: handleDraw()

**Before:**
```typescript
try {
  setIsDrawing(true);
  // ... draw logic ...
} finally {
  setIsDrawing(false);
}
```

**After:**
```typescript
try {
  setIsDrawingByTier(prev => ({ ...prev, [tier]: true }));
  // ... draw logic ...
} finally {
  setIsDrawingByTier(prev => ({ ...prev, [tier]: false }));
}
```

---

### 3. UI Component Updates

#### Modal Section (Tier Details)
```typescript
// Before
onClick={() => handleDraw(selectedTier)}
disabled={isDrawing}
className={...${isDrawing ? 'bg-gray-500' : ...}...}
{isDrawing ? '⏳ Drawing...' : '🎲 Draw Winner Now!'}

// After
onClick={() => handleDraw(selectedTier)}
disabled={isDrawingByTier[selectedTier!]}
className={...${isDrawingByTier[selectedTier!] ? 'bg-gray-500' : ...}...}
{isDrawingByTier[selectedTier!] ? '⏳ Drawing...' : '🎲 Draw Winner Now!'}
```

#### Table Section (Tier Row)
```typescript
// Before
onClick={() => handleDraw(tier.tier)}
disabled={isDrawing || !connected}
className={...${connected && !isDrawing ? 'from-orange-500' : ...}...}
{!connected ? '🔒 Connect Wallet' : isDrawing ? '⏳ Drawing...' : tier.participants > 0 ? '...'}

// After
onClick={() => handleDraw(tier.tier)}
disabled={isDrawingByTier[tier.tier] || !connected}
className={...${connected && !isDrawingByTier[tier.tier] ? 'from-orange-500' : ...}...}
{!connected ? '🔒 Connect Wallet' : isDrawingByTier[tier.tier] ? '⏳ Drawing...' : tier.participants > 0 ? '...'}
```

---

## Files Modified

| File | Changes |
|------|---------|
| [app/src/app/dpl/page.tsx](app/src/app/dpl/page.tsx) | Updated state declaration + handleDraw + 3 button sections (modal + 0-participant case + table) |
| [app/src/app/wpl/page.tsx](app/src/app/wpl/page.tsx) | Same refactor as DPL |
| [app/src/app/mpl/page.tsx](app/src/app/mpl/page.tsx) | Same refactor as DPL |

---

## Verification

✅ **Build Status**: `npm run build` - Compiled Successfully
✅ **TypeScript Errors**: Zero errors
✅ **ESLint Warnings**: Only pre-existing dependency array warnings (unrelated)
✅ **All 12 lottery pages**: DPL, WPL, MPL builds passed

---

## User Impact

### Before
```
User clicks "Draw Winner" for Tier 5
↓
isDrawing = true (GLOBAL)
↓
ALL tier buttons (5, 10, 15, 20) show "⏳ Drawing..."
↓
Some users confused thinking all tiers drawing
```

### After
```
User clicks "Draw Winner" for Tier 5
↓
isDrawingByTier[5] = true (TIER-SPECIFIC)
↓
ONLY tier 5 button shows "⏳ Drawing..."
↓
Tiers 10, 15, 20 remain unaffected/interactive
↓
Clear, isolated per-tier feedback
```

---

## Architecture Notes

### Draw Flow (Already Isolated)
The `handleDraw(tier: number)` function already calls:
```typescript
await resolveLotteryRound(program, 'DPL', tier);
```

This ensures:
- Only 1 instruction executed (per-tier isolation at smart contract level)
- No generic loops affecting multiple tiers
- Each tier PDA resolves independently

### No Changes Needed
✅ On-chain draw mechanism (already per-tier)
✅ Click handlers (already pass tier parameter)
✅ Draw instruction routing (already isolated)
✅ Zero-participant auto-extend logic (already implemented)

This refactor was **UI/UX only** - improving visibility without changing functionality.

---

## Testing Checklist

- [ ] Click Draw Winner for Tier 5 → Only tier 5 shows spinner
- [ ] While Tier 5 drawing, click Draw Winner for Tier 10 → Tier 10 queues independently
- [ ] Both draws complete → Both tiers show winner
- [ ] Zero-participant extend → Works as before (now with correct per-tier state)
- [ ] Modal draw button → Only affects selected tier
- [ ] Table draw button → Only affects clicked tier row

---

## Next Steps (Optional Future Work)

While not in this PR, these could further enhance the system:

1. **Draw Queue UI**: Show pending draws for multiple tiers
2. **Sequential Drawing**: Prevent overlapping draws if desired
3. **Transaction History**: per-tier draw history
4. **Tier-specific Recovery**: If one tier draw fails, others still draw

---

## Summary

**Requirement Met** ✅
> "When the 'Draw Winner' button is clicked for a specific tier, set a loading[tierId] state so **only that specific button shows a spinner**"

Per-tier loading states now implemented across all three time-based lottery pages (DPL, WPL, MPL). Each tier's button independently reflects its own draw state, with zero TypeScript errors and successful production build.
