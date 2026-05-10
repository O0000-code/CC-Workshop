import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Plus, X } from 'lucide-react';
import Button from '@/components/common/Button';
import { useMarketplaceStore } from '@/stores/marketplaceStore';

// ============================================================================
// MarketplaceShortcutBanner — task card C6 + C8
// ============================================================================
//
// Renders the install short-cut banner described in PRD §5.5.1 / §7.0:
// after a Marketplace install completes, the banner surfaces at the top of
// the page so the user can navigate to the freshly-installed resource or
// add it to a Scene without leaving Marketplace context. Two visual modes:
//
//   1. Active Scene present (`activeSceneId !== null`):
//        ✓ Installed in your library.
//        [View in Skills →] [Add to active Scene: <name> →] [Add to Scene...]
//   2. No active Scene (user has never created/edited a Scene, or just
//      deleted the last Scene):
//        ✓ Installed in your library.
//        [View in Skills →] [Create your first Scene →]
//
// `activeSceneId` / `activeSceneName` are SNAPSHOTS captured the moment
// `showShortcutBanner` was called (marketplaceStore.ts:702-713). Reading the
// snapshot here — instead of `useScenesStore.getActiveScene()` — keeps the
// banner stable if the user edits an unrelated Scene while the banner is
// visible. Phase B implementation note in 04_implementation_log.md
// explicitly calls this out.
//
// Reduced motion: `[data-marketplace-shortcut-banner]` selector in
// `src/index.css` disables every transition/animation when the user prefers
// reduced motion (spec §10.3). Decorative/long animations are not used here
// in the first place — the design language forbids ornamental gradients on
// banners — so the rule is mostly a safety net for the inline color
// transition on the close button.
// ============================================================================

const navTargetForItem = (itemType: 'skill' | 'mcp', targetItemId: string): string =>
  itemType === 'skill'
    ? `/skills?selected=${encodeURIComponent(targetItemId)}`
    : `/mcp-servers?selected=${encodeURIComponent(targetItemId)}`;

/**
 * Compact text-link rendered inside the banner. Visually a button (semantic
 * <button>) but styled as a link to keep the banner reading like prose.
 * Uses the design-language secondary palette — no new tokens.
 */
function BannerLink({
  children,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="text-[13px] font-medium text-[#18181B] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#18181B] rounded-sm cursor-pointer"
    >
      {children}
    </button>
  );
}

export function MarketplaceShortcutBanner() {
  const navigate = useNavigate();

  // Subscribe to the whole banner state so the component re-renders when
  // visibility / target-item / active-scene snapshot flip. Object identity is
  // refreshed by the store on every transition (`set({ shortcutBannerState: ... })`),
  // which keeps zustand's shallow comparison correct.
  const bannerState = useMarketplaceStore((s) => s.shortcutBannerState);

  const dismissShortcutBanner = useMarketplaceStore((s) => s.dismissShortcutBanner);
  const addToActiveScene = useMarketplaceStore((s) => s.addToActiveScene);
  const openAddToScenePopover = useMarketplaceStore((s) => s.openAddToScenePopover);

  const { visible, itemType, targetItemId, activeSceneId, activeSceneName } = bannerState;

  if (!visible || !itemType || !targetItemId) {
    return null;
  }

  const handleViewInList = () => {
    navigate(navTargetForItem(itemType, targetItemId));
    // Dismissing on navigation is intentional — once the user crosses the
    // boundary out of Marketplace, the banner has done its job (a one-shot
    // affordance per PRD §5.5.1).
    dismissShortcutBanner();
  };

  const handleAddToActiveScene = () => {
    void addToActiveScene();
    // `addToActiveScene` itself dismisses the banner on success. We don't
    // pre-dismiss here so that on transient backend failure the banner
    // remains visible and the user can retry.
  };

  const handleOpenPopover = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    openAddToScenePopover(targetItemId, itemType, rect);
  };

  const handleCreateFirstScene = () => {
    navigate('/scenes');
    dismissShortcutBanner();
  };

  const handleDismiss = () => {
    dismissShortcutBanner();
  };

  // Resource-type wording for the "View in Skills / View in MCP Servers"
  // link — keeps the user's destination unambiguous when the same banner
  // can fire for both Skill and MCP installs.
  const viewInLabel = itemType === 'skill' ? 'View in Skills' : 'View in MCP Servers';

  const hasActiveScene = !!activeSceneId && !!activeSceneName;

  return (
    <div
      data-marketplace-shortcut-banner
      role="status"
      aria-live="polite"
      className="bg-[#FAFAFA] border border-[#E5E5E5] rounded-lg px-4 py-3 flex items-center gap-3"
    >
      {/* Left segment — confirmation text. */}
      <div className="flex items-center gap-2 min-w-0">
        <Check className="h-4 w-4 text-[#16A34A] shrink-0" aria-hidden="true" />
        <span className="text-[13px] text-[#52525B]">Installed in your library.</span>
      </div>

      {/* Middle segment — navigation links + popover trigger. */}
      <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
        <BannerLink onClick={handleViewInList}>{viewInLabel} →</BannerLink>

        {hasActiveScene ? (
          <>
            <BannerLink
              onClick={handleAddToActiveScene}
              ariaLabel={`Add to active Scene: ${activeSceneName}`}
            >
              Add to active Scene: {activeSceneName} →
            </BannerLink>

            {/* "Add to Scene..." trigger — opens the multi-Scene popover.
                Uses the secondary Button variant to differentiate from the
                inline text links above without inventing a new style. */}
            <Button variant="secondary" size="small" icon={<Plus />} onClick={handleOpenPopover}>
              Add to Scene...
            </Button>
          </>
        ) : (
          <BannerLink onClick={handleCreateFirstScene}>Create your first Scene →</BannerLink>
        )}
      </div>

      {/* Right segment — dismiss. */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss installation banner"
        className="h-7 w-7 flex items-center justify-center rounded-md text-[#71717A] hover:text-[#18181B] hover:bg-[#F4F4F5] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#18181B] cursor-pointer shrink-0"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

// ============================================================================
// AddToSceneTriggerButton — exported helper for detail-panel SlidePanel
// ============================================================================
//
// Used by C2/C3 detail panels (SkillMarketplacePage / McpMarketplacePage) in
// their `headerRight` slot. Opens the same `AddToScenePopover` as the banner
// trigger above, anchored to this button's bounding rect.
//
// `Button` is not forwardRef-wrapped, so we capture the rect via the click
// event's `currentTarget` instead of a React ref — same pattern used by
// MarketplaceCollisionModal (`data-collision-action`) for similar reasons.

export interface AddToSceneTriggerButtonProps {
  itemId: string;
  itemType: 'skill' | 'mcp';
  /** Optional disabled state — useful when the resource hasn't finished
   * installing yet so the popover would have nothing to assign. */
  disabled?: boolean;
}

export function AddToSceneTriggerButton({
  itemId,
  itemType,
  disabled = false,
}: AddToSceneTriggerButtonProps) {
  const openAddToScenePopover = useMarketplaceStore((s) => s.openAddToScenePopover);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    openAddToScenePopover(itemId, itemType, rect);
  };

  return (
    <Button
      variant="secondary"
      size="small"
      icon={<Plus />}
      onClick={handleClick}
      disabled={disabled}
    >
      Add to Scene...
    </Button>
  );
}

export default MarketplaceShortcutBanner;
