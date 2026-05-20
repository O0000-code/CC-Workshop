import React, { useRef, useState, useEffect, useMemo } from 'react';
import { MoreHorizontal, Trash2, Puzzle, AlertCircle } from 'lucide-react';
import { ICON_MAP, CategoryTreeDropdown } from '@/components/common';
import { CornerBadge } from '@/components/common/CornerBadge';
import { truncateToFirstSentence } from '@/utils/text';
import { McpServer } from '@/types';
import { getCategoryColor as getCategoryColorFromName } from '@/utils/constants';
import { useAppStore } from '@/stores/appStore';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { useMcpsStore } from '@/stores/mcpsStore';
import {
  getCategoryDisplayName,
  getCategoryColor as getResolvedCategoryColor,
} from '@/utils/categoryTree';
import { TagsWithTooltip } from '@/components/common/TagsWithTooltip';
import { Badge } from '@/components/common/Badge';
import { isEnterCommit } from '@/utils/keyboard';

// ============================================================================
// Animation Constants
// ============================================================================

const TRANSITION_DURATION = '250ms';
const TRANSITION_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';
const TRANSITION_BASE = `${TRANSITION_DURATION} ${TRANSITION_EASING}`;
// Delay for right section to appear when expanding (closing detail panel)
const RIGHT_SECTION_DELAY = '150ms';

// ============================================================================
// Icon Helpers
// ============================================================================

const categoryIconMap: Record<string, React.ElementType> = {
  Database: ICON_MAP['database'] || ICON_MAP['plug'],
  Development: ICON_MAP['code'] || ICON_MAP['plug'],
  Communication: ICON_MAP['message-square'] || ICON_MAP['plug'],
  Research: ICON_MAP['globe'] || ICON_MAP['plug'],
  Productivity: ICON_MAP['file-text'] || ICON_MAP['plug'],
};

const getMcpIcon = (mcp: McpServer): React.ElementType => {
  if (mcp.icon && ICON_MAP[mcp.icon]) {
    return ICON_MAP[mcp.icon];
  }
  return categoryIconMap[mcp.category] || ICON_MAP['plug'];
};

// ============================================================================
// McpListItem Component
// ============================================================================

interface McpListItemProps {
  mcp: McpServer;
  compact?: boolean;
  selected?: boolean;
  onDelete?: (id: string) => void;
  onClick?: (id: string) => void;
  onIconClick?: (triggerRef: React.RefObject<HTMLDivElement>) => void;
}

/**
 * Unified MCP list item with smooth transition between full and compact modes.
 *
 * Full mode (compact=false): Shows category badge and tags
 * Compact mode (compact=true): Shows only icon, name, description
 *
 * Key animation behavior:
 * - When collapsing (full → compact): right section fades out immediately
 * - When expanding (compact → full): right section fades in with delay
 *   to prevent layout shift while list width is still animating
 */
export const McpListItem: React.FC<McpListItemProps> = ({
  mcp,
  compact = false,
  selected = false,
  onDelete,
  onClick,
  onIconClick,
}) => {
  const iconRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showMenu, setShowMenu] = useState(false);
  const IconComponent = getMcpIcon(mcp);
  // V2 §5.9 dual-read: prefer the categoryId-resolved name/color, fall back
  // to the cached `mcp.category` string for legacy entries.
  const allCategories = useAppStore((s) => s.categories);
  const displayCategoryName = useMemo(
    () => getCategoryDisplayName(mcp.categoryId, mcp.category, allCategories),
    [mcp.categoryId, mcp.category, allCategories],
  );
  const categoryColor = useMemo(
    () =>
      getResolvedCategoryColor(mcp.categoryId, mcp.category, allCategories) ??
      getCategoryColorFromName(mcp.category),
    [mcp.categoryId, mcp.category, allCategories],
  );

  // Plugin source detection
  const isPluginSource = mcp.installSource === 'plugin';

  // Auto-classify failure flag (F-P0-5 / E3-4). Mirrors the SkillListItem
  // implementation: subscribe to the marketplace store's failed-set and,
  // when present, render an inline non-blocking prompt below the row.
  const classifyFailed = useMarketplaceStore((s) => s.classifyFailedItemIds.has(mcp.id));
  const clearClassifyFailed = useMarketplaceStore((s) => s.clearClassifyFailed);
  const updateMcpCategory = useMcpsStore((s) => s.updateMcpCategory);
  const updateMcpTags = useMcpsStore((s) => s.updateMcpTags);
  const [classifyExpanded, setClassifyExpanded] = useState(false);
  const [pendingTagText, setPendingTagText] = useState('');

  const handleClick = () => {
    onClick?.(mcp.id);
  };

  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onDelete?.(mcp.id);
  };

  const handleClassifyExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setClassifyExpanded((v) => !v);
  };

  const handleManualCategoryChange = async (categoryId: string) => {
    if (!categoryId) {
      await updateMcpCategory(mcp.id, '');
      return;
    }
    const cat = allCategories.find((c) => c.id === categoryId);
    if (cat) {
      await updateMcpCategory(mcp.id, cat.name);
    }
  };

  const handleAddTag = async () => {
    const trimmed = pendingTagText.trim();
    if (!trimmed) return;
    const next = Array.from(new Set([...(mcp.tags ?? []), trimmed]));
    await updateMcpTags(mcp.id, next);
    setPendingTagText('');
  };

  const handleClassifyDone = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearClassifyFailed(mcp.id);
    setClassifyExpanded(false);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  // Right section transition: immediate hide, delayed show
  const rightSectionStyle = {
    opacity: compact ? 0 : 1,
    maxWidth: compact ? 0 : '300px',
    overflow: 'hidden' as const,
    transition: compact
      ? `opacity ${TRANSITION_BASE}, max-width ${TRANSITION_BASE}`
      : `opacity ${TRANSITION_BASE} ${RIGHT_SECTION_DELAY}, max-width ${TRANSITION_BASE} ${RIGHT_SECTION_DELAY}`,
  };

  return (
    <div className="flex flex-col">
      <div
        onClick={handleClick}
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
        ${selected ? 'bg-[#FAFAFA]' : 'bg-white hover:bg-[#FAFAFA]'}
        ${onClick ? 'cursor-pointer' : ''}
      `}
        style={{
          transition: `background-color ${TRANSITION_BASE}`,
        }}
      >
        {/* Left Section */}
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          {/* Icon Container with Plugin Badge */}
          <div className="relative shrink-0">
            <div
              ref={iconRef}
              onClick={(e) => {
                e.stopPropagation();
                onIconClick?.(iconRef as React.RefObject<HTMLDivElement>);
              }}
              className={`
              flex h-10 w-10 items-center justify-center rounded-lg
              ${selected ? 'bg-[#F4F4F5]' : 'bg-[#FAFAFA]'}
              ${onIconClick ? 'cursor-pointer hover:ring-2 hover:ring-[#18181B]/10' : ''}
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
            {/* Corner badge — priority: needsConfig (warning, actionable) ▸
                plugin (accent, identity). Only one renders; the slot does
                not stack (10 §E1). needsConfig wins because "fill missing
                env" is user-actionable; the plugin badge is identity-only
                and the same info still surfaces in the detail panel. In
                practice plugin-sourced MCPs do not carry `required_env_vars`
                (only the marketplace install path writes them), so the
                plugin badge is rarely preempted (10 §E3). */}
            {mcp.needsConfig ? (
              <CornerBadge
                icon={AlertCircle}
                tone="warning"
                tooltip="Configuration required — fill missing environment variables"
              />
            ) : isPluginSource ? (
              <CornerBadge icon={Puzzle} tone="accent" tooltip="From plugin" />
            ) : null}
          </div>

          {/* Info */}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span
              className={`text-[13px] text-[#18181B] truncate ${selected ? 'font-semibold' : 'font-medium'}`}
              style={{ transition: `font-weight ${TRANSITION_BASE}` }}
            >
              {mcp.name}
            </span>
            <span className="text-xs font-normal text-[#71717A] truncate max-w-[600px]">
              {truncateToFirstSentence(mcp.description, 100)}
            </span>
          </div>
        </div>

        {/* Right Section - Category & Tags (hidden in compact mode with delay on show) */}
        <div className="flex items-center gap-1.5 shrink-0" style={rightSectionStyle}>
          {/* Category Badge - only show if a resolvable category exists */}
          {displayCategoryName && (
            <Badge variant="category" color={categoryColor}>
              {displayCategoryName.charAt(0).toUpperCase() + displayCategoryName.slice(1)}
            </Badge>
          )}

          {/* Tags */}
          <TagsWithTooltip tags={mcp.tags} />
        </div>

        {/* More Menu - Always visible */}
        <div ref={menuRef} className="shrink-0 ml-4 relative">
          <button
            onClick={handleMoreClick}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-[#F4F4F5] transition-colors"
          >
            <MoreHorizontal className="w-4 h-4 text-[#71717A]" />
          </button>

          {/* Dropdown Menu */}
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-lg border border-[#E5E5E5] shadow-lg z-50 p-1">
              <button
                onClick={handleDelete}
                className="w-full px-3 py-2 text-left text-sm text-[#DC2626] hover:bg-[#FEF2F2] flex items-center gap-2 transition-colors rounded"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Inline classify-failed prompt — mirrors SkillListItem (F-P0-5 / E3-4). */}
      {classifyFailed && (
        <div className="px-5 pb-2 -mt-1">
          <button
            type="button"
            onClick={handleClassifyExpand}
            className="text-[11px] text-[#DC2626] hover:underline cursor-pointer"
            aria-expanded={classifyExpanded}
          >
            {classifyExpanded
              ? 'Auto-classify failed — close manual assign'
              : 'Auto-classify failed — assign manually'}
          </button>
          {classifyExpanded && (
            <div
              className="mt-2 flex flex-col gap-2 rounded-md border border-[#E5E5E5] bg-[#FAFAFA] px-3 py-2.5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-[#71717A] w-16 shrink-0">
                  Category
                </span>
                <CategoryTreeDropdown
                  categories={allCategories}
                  value={mcp.categoryId ?? ''}
                  onChange={handleManualCategoryChange}
                  placeholder="Uncategorized"
                  compact
                  className="flex-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-[#71717A] w-16 shrink-0">Tags</span>
                <input
                  type="text"
                  value={pendingTagText}
                  onChange={(e) => setPendingTagText(e.target.value)}
                  onKeyDown={(e) => {
                    // IME guard — CJK candidate Enter must not commit.
                    if (isEnterCommit(e)) {
                      e.preventDefault();
                      void handleAddTag();
                    }
                  }}
                  placeholder="Add tag and press Enter"
                  className="flex-1 h-8 px-2.5 text-[12px] rounded-md border border-[#E5E5E5] bg-white text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#18181B]"
                />
              </div>
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleClassifyDone}
                  className="h-7 px-3 rounded-md bg-[#18181B] text-white text-[11px] font-medium hover:bg-[#3F3F46] transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default McpListItem;
