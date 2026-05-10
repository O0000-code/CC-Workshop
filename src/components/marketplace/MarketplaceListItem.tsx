import React, { useMemo } from 'react';
import { Sparkles, Check, Plug } from 'lucide-react';
import Badge from '@/components/common/Badge';
import Button from '@/components/common/Button';
import { Tooltip } from '@/components/common/Tooltip';
import { ICON_MAP } from '@/components/common';
import { truncateToFirstSentence } from '@/utils/text';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import type { MarketplaceMcpItem, MarketplaceSkillItem } from '@/types/marketplace';

// ============================================================================
// Animation Constants — mirror SkillListItem.tsx:19-23 verbatim (R2 §3.1).
// Required by design-language Rule §Constraints (compact / SlidePanel use the
// Material-standard cubic-bezier(0.4, 0, 0.2, 1)). Sharing the same 250 ms /
// curve / 150 ms delay keeps the row's right-section animation synced with
// the page-level `mr-[800px]` SlidePanel transition (R2 §3.3).
// ============================================================================

const TRANSITION_DURATION = '250ms';
const TRANSITION_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';
const TRANSITION_BASE = `${TRANSITION_DURATION} ${TRANSITION_EASING}`;
// Delay for right section to appear when expanding (closing detail panel) —
// matches the 150 ms used by SkillListItem / McpListItem.
const RIGHT_SECTION_DELAY = '150ms';

// ============================================================================
// Icon helpers — mirrors the resolution rules used by the local list items.
// Skill default falls back to `Sparkles`; MCP default falls back to `Plug`.
// ============================================================================

const getSkillIconComponent = (item: MarketplaceSkillItem): React.ElementType => {
  // Marketplace items don't carry a custom icon — frontmatter doesn't expose
  // one. The default is `Sparkles` to match SkillListItem (skills.tsx:33).
  // Reserved for future use if the catalog is extended with an `icon` hint.
  void item;
  return Sparkles;
};

const getMcpIconComponent = (item: MarketplaceMcpItem): React.ElementType => {
  void item;
  return ICON_MAP['plug'] ?? Plug;
};

// ============================================================================
// Public props
// ============================================================================

export interface MarketplaceListItemProps {
  item: MarketplaceSkillItem | MarketplaceMcpItem;
  itemType: 'skill' | 'mcp';
  /** Whether this row is the currently-selected item (drives compact = true
   * on its peers and font-weight bump on this row). */
  selected: boolean;
  /** Whether the parent page is in compact mode (a SlidePanel detail is
   * open). Drives the right-section maxWidth/opacity transition. */
  compact: boolean;
  /** Derived from useSkillsStore / useMcpsStore via marketplaceStore's SSoT
   * selector. Controls whether the right section shows the "Installed" badge
   * vs the Install button. */
  isInstalled: boolean;
  /** Row click handler. Fires `onSelect(item.id)` to open the detail panel. */
  onSelect: (itemId: string) => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Marketplace list item. Container shell mirrors `SkillListItem.tsx:126-145`
 * exactly so visual density matches the Skills page (D-Imp / R2 §2.1). Key
 * deviations from SkillListItem:
 *
 * 1. No plugin badge on the icon container — D-9 / R-11 forbids stacking a
 *    second corner-badge here. Marketplace provenance lives in the detail
 *    panel's "Source" row instead (C7).
 * 2. Right section content swaps Category + Tags for popularity + (optional
 *    MCP type badge) + Install/Installed/Retry control.
 * 3. No "More" menu — uninstall is not surfaced from the marketplace list
 *    (R-19). Users uninstall from the Skills / MCP Servers pages.
 * 4. Right-section `maxWidth: 240px` (vs Skill's 400 / MCP's 300) — the
 *    marketplace right segment is narrower because popularity + button +
 *    optional small badge fits in less horizontal real estate (R2 §3.2).
 *
 * The whole row is wrapped in a Tooltip so hovering anywhere on the row
 * surfaces the README's first sentence (PRD §5.5 / task card item 8). The
 * Install button stops click propagation so its click does not also fire
 * `onSelect`.
 */
export const MarketplaceListItem: React.FC<MarketplaceListItemProps> = ({
  item,
  itemType,
  selected,
  compact,
  isInstalled,
  onSelect,
}) => {
  // Per-item progress + failure state from the marketplace store. We
  // subscribe to slices so the row re-renders only when its own id appears
  // in / leaves these collections.
  const isInstalling = useMarketplaceStore((s) => s.installingItemIds.has(item.id));
  const installFailure = useMarketplaceStore((s) => s.installFailedItems[item.id]);

  const installSkill = useMarketplaceStore((s) => s.installSkill);
  const installMcp = useMarketplaceStore((s) => s.installMcp);

  const IconComponent = useMemo(
    () =>
      itemType === 'skill'
        ? getSkillIconComponent(item as MarketplaceSkillItem)
        : getMcpIconComponent(item as MarketplaceMcpItem),
    [item, itemType],
  );

  const popularity = item.stars ?? 0;
  const mcpType = itemType === 'mcp' ? (item as MarketplaceMcpItem).mcpType : undefined;

  // README first-sentence (≤ ~200 chars) for the hover tooltip. Falls back
  // to the description when the README is empty so the hover still surfaces
  // useful copy (PRD §5.5 R-P2-1).
  const tooltipPreview = useMemo(() => {
    const readme = item.readmeMarkdown?.trim();
    const source = readme && readme.length > 0 ? readme : item.description;
    return truncateToFirstSentence(source ?? '', 200);
  }, [item.readmeMarkdown, item.description]);

  // Right-section container transition: collapse immediately, expand with
  // 150 ms delay so the SlidePanel can finish its slide-in first (otherwise
  // the right segment overlaps the panel during the first frames). Matches
  // SkillListItem.tsx:117-124 / McpListItem.tsx:128-136 verbatim except for
  // the narrower 240 px target (D-Imp / R2 §3.2).
  const rightSectionStyle: React.CSSProperties = {
    opacity: compact ? 0 : 1,
    maxWidth: compact ? 0 : '240px',
    overflow: 'hidden',
    transition: compact
      ? `opacity ${TRANSITION_BASE}, max-width ${TRANSITION_BASE}`
      : `opacity ${TRANSITION_BASE} ${RIGHT_SECTION_DELAY}, max-width ${TRANSITION_BASE} ${RIGHT_SECTION_DELAY}`,
  };

  const handleRowClick = () => {
    onSelect(item.id);
  };

  const handleInstallClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Stop the click bubbling to the row so installing does not also open
    // the detail panel (the user's intent is to install, not browse).
    e.stopPropagation();
    if (itemType === 'skill') {
      void installSkill(item as MarketplaceSkillItem);
    } else {
      void installMcp(item as MarketplaceMcpItem);
    }
  };

  // ----- Right section trailing control: Installed / Installing / Retry / Install -----
  // Order of precedence:
  //   1. Installed (terminal — derived from SSoT, ignores transient failure).
  //   2. Failure flag → Retry button (with error tooltip).
  //   3. Otherwise → Install button (loading prop drives the spinner state).
  let trailingControl: React.ReactNode;
  if (isInstalled) {
    trailingControl = (
      <Badge variant="neutral" showDot={false}>
        <Check className="h-3 w-3" />
        Installed
      </Badge>
    );
  } else if (installFailure) {
    // The failed-state button keeps the primary variant — design-language
    // forbids inventing a new "red button" treatment (R3-P0-3 / PRD §5.5).
    // The error itself surfaces via the hover tooltip on the button.
    trailingControl = (
      <Tooltip content={installFailure.error} maxWidth={320}>
        <span>
          <Button
            variant="primary"
            size="small"
            onClick={handleInstallClick}
            disabled={isInstalling}
            loading={isInstalling}
          >
            Retry
          </Button>
        </span>
      </Tooltip>
    );
  } else {
    trailingControl = (
      <Button
        variant="primary"
        size="small"
        onClick={handleInstallClick}
        disabled={isInstalling}
        loading={isInstalling}
      >
        {isInstalling ? 'Installing...' : 'Install'}
      </Button>
    );
  }

  // The row body. Wrapped in a Tooltip below so the README preview surfaces
  // on hover. The Tooltip clones the trigger and forwards a ref to the
  // outer div, so the click handler / styling on this div remain authoritative.
  const row = (
    <div
      data-marketplace-list-item
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleRowClick();
        }
      }}
      className={`
        flex
        w-full
        items-center
        justify-between
        rounded-lg
        border
        border-[#E5E5E5]
        px-5
        py-4
        cursor-pointer
        ${selected ? 'bg-[#FAFAFA]' : 'bg-white hover:bg-[#FAFAFA]'}
      `}
      style={{
        transition: `background-color ${TRANSITION_BASE}`,
      }}
    >
      {/* Left section — icon + name + description */}
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        {/* Icon container — mirrors SkillListItem icon container exactly,
            without the plugin badge corner indicator (D-9 / R-11). */}
        <div className="relative shrink-0">
          <div
            className={`
              flex h-10 w-10 items-center justify-center rounded-lg
              ${selected ? 'bg-[#F4F4F5]' : 'bg-[#FAFAFA]'}
            `}
            style={{
              transition: `background-color ${TRANSITION_BASE}, box-shadow ${TRANSITION_BASE}`,
            }}
          >
            <IconComponent
              className={`h-5 w-5 ${selected ? 'text-[#18181B]' : 'text-[#52525B]'}`}
              style={{ transition: `color ${TRANSITION_BASE}` }}
            />
          </div>
        </div>

        {/* Info — name + description. Description truncates to its first
            sentence (≤ 100 chars) so the row keeps a single visual rhythm. */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            className={`text-[13px] text-[#18181B] truncate ${selected ? 'font-semibold' : 'font-medium'}`}
            style={{ transition: `font-weight ${TRANSITION_BASE}` }}
          >
            {item.name}
          </span>
          <span className="text-xs font-normal text-[#71717A] truncate max-w-[600px]">
            {truncateToFirstSentence(item.description ?? '', 100)}
          </span>
        </div>
      </div>

      {/* Right section — popularity + (MCP type) + Install/Installed/Retry */}
      <div className="flex items-center gap-2.5 shrink-0" style={rightSectionStyle}>
        {/* Popularity (star count) — neutral grey numeric. */}
        <span className="text-[11px] font-normal text-[#A1A1AA] tabular-nums">
          {popularity.toLocaleString()}
        </span>

        {/* MCP type badge — only present for itemType === 'mcp'. Sits between
            popularity and the install control so the install action stays
            the rightmost / most-prominent affordance. */}
        {mcpType && (
          <Badge variant="neutral" showDot={false}>
            {mcpType === 'stdio' ? 'stdio' : 'HTTP'}
          </Badge>
        )}

        {trailingControl}
      </div>
    </div>
  );

  // Hover tooltip — README first sentence. Skip wrapping when the preview
  // text is empty so the Tooltip's portal doesn't render an empty bubble.
  if (!tooltipPreview) return row;

  return (
    <Tooltip content={tooltipPreview} maxWidth={320}>
      {row}
    </Tooltip>
  );
};

export default MarketplaceListItem;
