# Bug Fix: Scenes Page Ellipsis Button Visibility & Position

## Problem Description
1. The "..." (MoreHorizontal) button on scene list items is **position misaligned**
2. Only the **clicked/selected item** shows the "..." button — other items' buttons are invisible

## Root Cause Analysis

### Structural Comparison

**SkillListItem / McpListItem (WORKING)** — 3 direct children of outer flex:
```tsx
<div className="flex w-full items-center justify-between ...">
  {/* Child 1 */}
  <div className="flex items-center gap-3.5 min-w-0 flex-1">  ← Left Section
  {/* Child 2 */}
  <div className="flex items-center shrink-0" style={rightSectionStyle}>  ← Collapsible Right Section
  {/* Child 3 */}
  <div className="shrink-0 ml-4 relative">  ← More Button (DIRECT child, always visible)
</div>
```

**SceneListItem (BROKEN)** — 2 direct children, more button NESTED:
```tsx
<div className="flex w-full items-center justify-between ...">
  {/* Child 1 */}
  <div className="flex gap-3.5 ...">  ← Left Section (MISSING min-w-0 and flex-1)
  {/* Child 2 */}
  <div className="flex items-center">  ← Right Wrapper (MISSING shrink-0)
    <div style={{ maxWidth: compact ? 0 : '400px', ... }}>  ← Stats Section
    <div className="relative shrink-0 ml-4">  ← More Button (nested inside shrinkable wrapper)
  </div>
</div>
```

### Three Key Issues

1. **Left Section missing `min-w-0 flex-1`**: Without these classes, the left section takes its natural width (icon + text + description max-width 400px), which can push the right wrapper off-screen when the content area narrows (detail panel open with `mr-[800px]`).

2. **Right Section Wrapper missing `shrink-0`**: Without `shrink-0`, the wrapper CAN be shrunk by the flex algorithm when the left section is too wide, causing the nested more button to be pushed out of view.

3. **Stats Section `overflow: 'visible'` in full mode**: In full mode, stats content can visually overflow beyond the stats section boundary, potentially covering the more button. The working implementations always use `overflow: 'hidden'`.

## Fix (Conservative, Minimal Changes)

Three targeted class/style changes:

### Change 1: Left Section — add `min-w-0 flex-1`
```tsx
// Before (line 137):
<div className={`flex gap-3.5 ${compact ? 'items-start' : 'items-center'}`}>

// After:
<div className={`flex min-w-0 flex-1 gap-3.5 ${compact ? 'items-start' : 'items-center'}`}>
```

### Change 2: Right Section Wrapper — add `shrink-0`
```tsx
// Before (line 200):
<div className="flex items-center">

// After:
<div className="flex items-center shrink-0">
```

### Change 3: Stats Section overflow — always hidden
```tsx
// Before (line 208):
overflow: compact ? 'hidden' : 'visible',

// After:
overflow: 'hidden' as const,
```

## Why This Fix Is Safe

1. `min-w-0 flex-1` on left section: Matches the working SkillListItem/McpListItem pattern. The description span already has `truncate` (text-overflow: ellipsis), so truncation handles gracefully.
2. `shrink-0` on right wrapper: Prevents the wrapper from shrinking, guaranteeing the more button stays visible. In compact mode the wrapper is only ~44px (collapsed stats + button), in full mode up to ~444px — both fit within normal content widths.
3. `overflow: 'hidden'`: The dropdown menu is absolutely positioned relative to the more button container (which has `position: relative`), NOT inside the stats section, so it won't be clipped. The stats content (skills count + MCPs count + optional CLAUDE.md count + optional Active badge) totals ~384px max, well within the 400px maxWidth.

## Files Modified
- `src/components/scenes/SceneListItem.tsx` — 3 line-level changes
