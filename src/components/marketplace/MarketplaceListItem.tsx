import React, { useMemo } from 'react';
import { Check, BadgeCheck } from 'lucide-react';
import Badge from '@/components/common/Badge';
import Button from '@/components/common/Button';
import { Tooltip } from '@/components/common/Tooltip';
import { getMarketplaceItemIcon } from '@/utils/marketplaceIcon';
import { truncateToFirstSentence } from '@/utils/text';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import type { MarketplaceMcpItem, MarketplaceSkillItem } from '@/types/marketplace';
import { getSkillItemKey } from '@/types/marketplace';

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

// Icon resolution is delegated to `utils/marketplaceIcon.ts` — a pure
// function with a 4-stage cascade (skills.sh topic map → brand exact match
// → narrow domain keyword → default). The store's `skillsTopicMap` slice
// powers Stage 0; for MCP items the map argument is ignored.

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
 * Row hover preview tooltip was removed (user feedback): users found it
 * intrusive on lists with hundreds of items. The detail panel surfaces
 * the README on demand instead. The Install button stops click propagation
 * so its click does not also fire `onSelect`.
 */
export const MarketplaceListItem: React.FC<MarketplaceListItemProps> = ({
  item,
  itemType,
  selected,
  compact,
  isInstalled,
  onSelect,
}) => {
  // Stable key for cross-call lookup. Skills V2 internal-API items don't carry
  // an `id`; we derive `${source}/${skillId}`. MCPs still use their `id`.
  const itemKey =
    itemType === 'skill'
      ? getSkillItemKey(item as MarketplaceSkillItem)
      : (item as MarketplaceMcpItem).id;

  // Per-item progress + failure state from the marketplace store. We
  // subscribe to slices so the row re-renders only when its own id appears
  // in / leaves these collections.
  const isInstalling = useMarketplaceStore((s) => s.installingItemIds.has(itemKey));
  const installFailure = useMarketplaceStore((s) => s.installFailedItems[itemKey]);

  const installSkill = useMarketplaceStore((s) => s.installSkill);
  const installMcp = useMarketplaceStore((s) => s.installMcp);

  // Stage 0 (skills.sh topic map) is wired in once the store action loads
  // it; until then the resolver still runs Stages 1-3 (brand / domain /
  // default), so list rows already show meaningful icons.
  const skillsTopicMap = useMarketplaceStore((s) => s.skillsTopicMap);
  const IconComponent = useMemo(
    () => getMarketplaceItemIcon(item, itemType, skillsTopicMap),
    [item, itemType, skillsTopicMap],
  );

  // V2 catalogue: Skill items expose `installs` (skills.sh primary metric).
  // V1 fallback: legacy GitHub-derived `stars` count when the catalogue
  // entry has no `installs`. MCPs continue to use `stars`.
  const popularity = useMemo(() => {
    if (itemType === 'skill') {
      const skillItem = item as MarketplaceSkillItem;
      return skillItem.installs ?? skillItem.stars ?? 0;
    }
    return (item as MarketplaceMcpItem).stars ?? 0;
  }, [item, itemType]);
  const mcpType = itemType === 'mcp' ? (item as MarketplaceMcpItem).mcpType : undefined;
  const isOfficialSkill =
    itemType === 'skill' && (item as MarketplaceSkillItem).isOfficial === true;

  // Secondary line under the name.
  //   - Skill V2 internal-API items: upstream description is empty, fall back
  //     to upstream `source` (`anthropics/skills`) so the row always carries
  //     one piece of secondary identifying info.
  //   - MCP items: prepend `author` (GitHub owner) + middle dot to the
  //     description so users can tell first-party (`modelcontextprotocol`)
  //     from third-party publishers at a glance. The dot uses #D4D4D8 (one
  //     zinc step lighter than the surrounding #71717A) so it reads as a
  //     separator, not a glyph. Returned as a ReactNode (not a string) so
  //     the dot's color override can live in its own span.
  const secondaryContent = useMemo<React.ReactNode>(() => {
    if (itemType === 'skill') {
      const skillItem = item as MarketplaceSkillItem;
      const desc = skillItem.description?.trim();
      if (desc) return truncateToFirstSentence(desc, 100);
      return skillItem.source ?? '';
    }
    const mcpItem = item as MarketplaceMcpItem;
    const desc = truncateToFirstSentence(mcpItem.description?.trim() ?? '', 100);
    const author = mcpItem.author?.trim() ?? '';
    if (!author && !desc) return '';
    if (!author) return desc;
    if (!desc) return author;
    return (
      <>
        {author}
        <span className="mx-1.5 text-[#D4D4D8]" aria-hidden="true">
          ·
        </span>
        {desc}
      </>
    );
  }, [item, itemType]);

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
    onSelect(itemKey);
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

  // Format installs / stars: 1.2K / 3.4M for compactness in the row.
  const formatPopularity = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
    return n.toLocaleString();
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

  // The row body. Renders unwrapped — hover preview tooltip removed per
  // user feedback (Apple/Linear style: rely on the detail panel for full
  // info, don't surface a tooltip the moment the cursor is anywhere over
  // the row).
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

        {/* Info — name + secondary line. Secondary truncates to first sentence
            for V1 / MCP items, or shows the upstream `source` repo for V2
            skill items (which have no description). */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            className={`text-[13px] text-[#18181B] truncate flex items-center gap-2 ${selected ? 'font-semibold' : 'font-medium'}`}
            style={{ transition: `font-weight ${TRANSITION_BASE}` }}
          >
            <span className="truncate">{item.name}</span>
            {isOfficialSkill && (
              <Badge variant="neutral" showDot={false} className="gap-1">
                {/* Inline 1px upward margin to align the icon's geometric
                    centre with Inter's cap-middle (verified via Chromium
                    rendering probe). `mt` not `translate-y` because
                    margin affects layout and renders consistently across
                    devicePixelRatios, whereas Tailwind's transform-compose
                    pipeline can snap subpixel translations inconsistently. */}
                <BadgeCheck className="-mt-px h-3 w-3" />
                <span>Official</span>
              </Badge>
            )}
          </span>
          {secondaryContent && (
            <span className="text-xs font-normal text-[#71717A] truncate max-w-[600px]">
              {secondaryContent}
            </span>
          )}
        </div>
      </div>

      {/* Right section — popularity + (MCP type) + Install/Installed/Retry.
          gap-5 (20px) per Things 3 / Linear right-section convention; user
          feedback flagged gap-3.5 still felt cramped between e.g. `1.4M`
          and `✓ Installed`. */}
      <div className="flex items-center gap-5 shrink-0" style={rightSectionStyle}>
        {/* Popularity — installs (skills V2) or stars (MCP / legacy).
            Neutral grey numeric, formatted compactly (1.2K / 3.4M). */}
        {popularity > 0 && (
          <span className="text-[11px] font-normal text-[#A1A1AA] tabular-nums">
            {formatPopularity(popularity)}
          </span>
        )}

        {/* MCP type label — plain text, no chip. Sits between popularity and
            the install control so the install action stays the rightmost /
            most-prominent affordance. Visual weight matches `popularity`
            (11px / #A1A1AA / normal) so the right section reads as a single
            "info ··· action" lane with only the Install button carrying
            colour — the prior `Badge` chip created a competing grey block
            that fought the Install button for attention. */}
        {mcpType && (
          <span className="text-[11px] font-normal text-[#A1A1AA]">
            {mcpType === 'stdio' ? 'stdio' : 'HTTP'}
          </span>
        )}

        {trailingControl}
      </div>
    </div>
  );

  return row;
};

export default MarketplaceListItem;
