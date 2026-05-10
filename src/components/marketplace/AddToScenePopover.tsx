import { useState, useEffect, useMemo, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import Button from '@/components/common/Button';
import { Checkbox } from '@/components/common/Checkbox';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { useScenesStore } from '@/stores/scenesStore';

// ============================================================================
// AddToScenePopover — task card C8 (D-Imp-6)
// ============================================================================
//
// Detail-grain Scene assignment. Activated by either the
// MarketplaceShortcutBanner's "Add to Scene..." button or the detail panel's
// `AddToSceneTriggerButton`. Both call
// `useMarketplaceStore.openAddToScenePopover(itemId, itemType, triggerRect)`,
// which captures the trigger's bounding rect for popover anchoring and
// preselects every Scene that already contains this resource.
//
// The popover diff-saves: the user toggles checkboxes locally; on Save we
// compute (toAdd ∪ toRemove) against the snapshotted `initialSelectedSceneIds`
// and call `marketplaceStore.saveSceneAssignments(...)` which serializes the
// updates through `useScenesStore.updateScene`. Cancel discards the local
// selection. Esc / outside-click is treated as Cancel.
//
// Anchoring policy:
//   - Open below + right-aligned to the trigger by default (popover's right
//     edge aligns with the trigger's right edge).
//   - Clamp inside the viewport with 8px margins.
//   - When the popover would overflow the bottom edge, flip above the trigger.
//
// Design language compliance:
//   - Tokens only — `var(--shadow-dropdown)` for elevation, the documented
//     zinc palette for text/borders, no self-invented hex.
//   - No staggered or springy entrance animation; if the user prefers
//     reduced motion, the wildcard rule in src/index.css line 709-728 covers
//     `[data-marketplace-shortcut-banner]` (the banner). The popover is a
//     dropdown-class surface and intentionally does not animate at all
//     beyond the inline `transition-colors` on hover.
// ============================================================================

const POPOVER_WIDTH = 320; // 80 * 4 = w-80 in tailwind units, matched explicitly
const POPOVER_GAP = 6;
const VIEWPORT_MARGIN = 8;
// Approximate max height — actual content max-height clamps the body
// independently. Used to detect bottom-overflow and flip above when needed.
const POPOVER_HEIGHT_ESTIMATE = 360;

interface PopoverPosition {
  /** Absolute viewport coordinate (px). */
  top: number;
  /** Absolute viewport coordinate (px). */
  left: number;
  /** True when popover is rendered above the trigger (bottom-overflow flip). */
  flipped: boolean;
}

const DEFAULT_POSITION: PopoverPosition = {
  top: 0,
  left: 0,
  flipped: false,
};

function computePosition(triggerRect: DOMRect): PopoverPosition {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Right-aligned: popover's right edge sits at the trigger's right edge.
  let left = triggerRect.right - POPOVER_WIDTH;
  if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
  if (left + POPOVER_WIDTH > viewportWidth - VIEWPORT_MARGIN) {
    left = Math.max(VIEWPORT_MARGIN, viewportWidth - POPOVER_WIDTH - VIEWPORT_MARGIN);
  }

  // Open below by default; flip above when bottom overflow exceeds top space.
  const spaceBelow = viewportHeight - triggerRect.bottom - POPOVER_GAP - VIEWPORT_MARGIN;
  const spaceAbove = triggerRect.top - POPOVER_GAP - VIEWPORT_MARGIN;
  const flipped = spaceBelow < POPOVER_HEIGHT_ESTIMATE && spaceAbove > spaceBelow;

  let top: number;
  if (flipped) {
    // top edge of popover is at most `spaceAbove` above the trigger.
    top = Math.max(VIEWPORT_MARGIN, triggerRect.top - POPOVER_GAP - POPOVER_HEIGHT_ESTIMATE);
  } else {
    top = triggerRect.bottom + POPOVER_GAP;
  }

  return { top, left, flipped };
}

export function AddToScenePopover() {
  const navigate = useNavigate();

  const popoverState = useMarketplaceStore((s) => s.addToScenePopoverState);
  const closeAddToScenePopover = useMarketplaceStore((s) => s.closeAddToScenePopover);
  const saveSceneAssignments = useMarketplaceStore((s) => s.saveSceneAssignments);

  const scenes = useScenesStore((s) => s.scenes);

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const headerId = useId();

  // Local checkbox state — initialized from the store's snapshotted
  // `initialSelectedSceneIds` whenever the popover opens. Held in a Set for
  // O(1) toggle.
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // Track viewport-anchored position so scrolling / resizing during open
  // re-clamps the popover. Initialized from the trigger rect on open.
  const [position, setPosition] = useState<PopoverPosition>(DEFAULT_POSITION);

  const { open, targetItemId, itemType, initialSelectedSceneIds, triggerRect } = popoverState;

  // ----- Effects -------------------------------------------------------

  // Initialize selection set when opening.
  useEffect(() => {
    if (open) {
      setSelectedSet(new Set(initialSelectedSceneIds));
      setIsSaving(false);
    }
  }, [open, initialSelectedSceneIds]);

  // Initial position + reposition on scroll/resize so the popover stays
  // glued to the trigger even if the page scrolls under it.
  useEffect(() => {
    if (!open || !triggerRect) return;
    setPosition(computePosition(triggerRect));

    // We can't recompute against a fresh DOMRect without a ref to the
    // original trigger element, but the rect captured at open-time stays
    // valid as long as the trigger doesn't move. For scroll/resize we keep
    // the popover anchored to its initial absolute coordinate — a reasonable
    // V1 trade-off matching the Dropdown pattern's behavior.
    const handle = () => setPosition(computePosition(triggerRect));
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('resize', handle);
    };
  }, [open, triggerRect]);

  // Esc to close (mirrors Modal behavior). Outside-click is wired below via
  // a separate listener so it can read the latest popoverRef.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeAddToScenePopover();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, closeAddToScenePopover]);

  // Outside click: if the click target is not inside the popover, close.
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (!popoverRef.current) return;
      if (popoverRef.current.contains(e.target as Node)) return;
      closeAddToScenePopover();
    };
    // Defer one tick — otherwise the very click that triggered open closes
    // the popover immediately.
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [open, closeAddToScenePopover]);

  // ----- Derived data --------------------------------------------------

  // Scenes that already contain this resource (drives the secondary check
  // icon next to the Scene name as the spec calls out, regardless of
  // whether the user has flipped the local checkbox).
  const initialSet = useMemo(() => new Set(initialSelectedSceneIds), [initialSelectedSceneIds]);

  // Memoize handlers so React doesn't re-evaluate on each render.
  const toggleScene = (sceneId: string) => {
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(sceneId)) next.delete(sceneId);
      else next.add(sceneId);
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveSceneAssignments(Array.from(selectedSet));
      // saveSceneAssignments dismisses the banner + closes the popover via
      // the store. No further cleanup needed here.
    } catch (err) {
      // Non-fatal — keep the popover open so the user can retry. We don't
      // surface a separate inline error UI here (V1 trade-off; SubAgent's
      // installFailedItems mechanism is for installs, not Scene mutations).
      console.error('saveSceneAssignments failed:', err);
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    closeAddToScenePopover();
  };

  const handleCreateFirstScene = () => {
    closeAddToScenePopover();
    navigate('/scenes');
  };

  // ----- Render --------------------------------------------------------

  if (!open || !targetItemId || !itemType) return null;

  const isEmpty = scenes.length === 0;

  const popover = (
    <div
      ref={popoverRef}
      data-marketplace-popover
      role="dialog"
      aria-modal="false"
      aria-labelledby={headerId}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: POPOVER_WIDTH,
        boxShadow: 'var(--shadow-dropdown)',
        zIndex: 70,
      }}
      className="rounded-md bg-white border border-[#E5E5E5] flex flex-col"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#E5E5E5]">
        <h3 id={headerId} className="text-sm font-semibold text-[#18181B]">
          Add to Scenes
        </h3>
      </div>

      {/* Body */}
      <div className="max-h-80 overflow-y-auto py-1">
        {isEmpty ? (
          <div className="text-xs text-center py-6 px-4 text-[#71717A]">
            <span className="block">No scenes yet.</span>
            <button
              type="button"
              onClick={handleCreateFirstScene}
              className="mt-2 text-[13px] font-medium text-[#18181B] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#18181B] rounded-sm cursor-pointer"
            >
              Create your first Scene →
            </button>
          </div>
        ) : (
          scenes.map((scene) => {
            const checked = selectedSet.has(scene.id);
            const alreadyContains = initialSet.has(scene.id);
            return (
              <label
                key={scene.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-[#FAFAFA] cursor-pointer transition-colors"
              >
                <Checkbox checked={checked} onChange={() => toggleScene(scene.id)} />
                <span className="text-[13px] text-[#18181B] flex-1 truncate">{scene.name}</span>
                {alreadyContains && (
                  <Check
                    className="h-3 w-3 text-[#16A34A] shrink-0"
                    aria-label="Already contains this resource"
                  />
                )}
              </label>
            );
          })
        )}
      </div>

      {/* Footer — hidden when empty (the only meaningful CTA is the inline
          Create-first-Scene link). */}
      {!isEmpty && (
        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-[#E5E5E5]">
          <Button variant="secondary" size="small" onClick={handleCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="small"
            onClick={handleSave}
            disabled={isSaving}
            loading={isSaving}
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );

  return createPortal(popover, document.body);
}

export default AddToScenePopover;
