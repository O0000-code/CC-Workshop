// src/components/rules/RuleCard.tsx
//
// Mirrors `ClaudeMdCard.tsx`. Differences (per `.dev/rule-management/01_design.md`):
//   * No `source_type` Global/Project/Local trichotomy — only the `isGlobal`
//     flag controls the badge, which renders a single Globe variant.
//   * Badge is conditionally rendered only when `rule.isGlobal === true`;
//     non-global rules show no badge (project/local source has no badge
//     concept here).

import React, { useRef, useState } from 'react';
import { FileText, MoreHorizontal, Trash2, LucideIcon } from 'lucide-react';
import { ICON_MAP } from '@/components/common';
import { RuleBadge } from './RuleBadge';
import { TagsWithTooltip } from '@/components/common/TagsWithTooltip';
import Badge from '@/components/common/Badge';
import type { Rule } from '@/types/rule';
import { useAppStore } from '@/stores/appStore';

// ============================================================================
// Animation Constants
// ============================================================================

const TRANSITION_DURATION = '250ms';
const TRANSITION_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';
const TRANSITION_BASE = `${TRANSITION_DURATION} ${TRANSITION_EASING}`;
const RIGHT_SECTION_DELAY = '150ms';

// ============================================================================
// RuleCard Component
// ============================================================================

interface RuleCardProps {
  /** Rule data */
  rule: Rule;
  /** Whether to show compact mode (when detail panel is open) */
  compact?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Delete handler */
  onDelete?: () => void;
  /** Icon click handler for IconPicker */
  onIconClick?: (ref: React.RefObject<HTMLDivElement>) => void;
}

/**
 * RuleCard Component
 *
 * Displays a managed Rule in the list view. Visual treatment mirrors
 * `ClaudeMdCard`:
 * - Width: fill_container
 * - Border radius: 8px
 * - Border: 1px solid #E5E5E5
 * - Padding: 16px 20px
 * - Gap: 14px
 * - Background: white
 *
 * Layout:
 * - Icon Container: 40x40, layout none (for badge positioning)
 *   - Icon Wrap: 40x40, bg #FAFAFA, cornerRadius 8px, icon 20x20 (#52525B)
 *   - Badge (only when `isGlobal`): 16x16 circle, 2px white border, top-right
 * - Info: name (13px, #18181B, 500) + source path (12px, #71717A), gap 3px
 * - Tags: category + tags
 * - Actions: 28x28, ellipsis icon
 */
export const RuleCard: React.FC<RuleCardProps> = ({
  rule,
  compact = false,
  onClick,
  onDelete,
  onIconClick,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const [showMenu, setShowMenu] = useState(false);
  const { tags: appTags, categories } = useAppStore();

  // Get rule icon - default to FileText
  const RuleIcon: LucideIcon = rule.icon && ICON_MAP[rule.icon] ? ICON_MAP[rule.icon] : FileText;

  const handleIconClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onIconClick?.(iconRef as React.RefObject<HTMLDivElement>);
  };

  // Resolve category name + color from categoryId
  const category = rule.categoryId ? categories.find((c) => c.id === rule.categoryId) : null;
  const categoryName = category?.name;
  const categoryColor = category?.color || '#71717A';

  // Resolve tag names from tag IDs
  const tagNames = rule.tagIds
    .map((tagId) => appTags.find((t) => t.id === tagId)?.name)
    .filter(Boolean) as string[];

  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onDelete?.();
  };

  // Close menu when clicking outside
  React.useEffect(() => {
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
    maxWidth: compact ? 0 : '400px',
    overflow: 'hidden' as const,
    transition: compact
      ? `opacity ${TRANSITION_BASE}, max-width ${TRANSITION_BASE}`
      : `opacity ${TRANSITION_BASE} ${RIGHT_SECTION_DELAY}, max-width ${TRANSITION_BASE} ${RIGHT_SECTION_DELAY}`,
  };

  return (
    <div
      onClick={onClick}
      className={`
        flex
        w-full
        items-center
        gap-[14px]
        rounded-lg
        border
        border-[#E5E5E5]
        px-5 py-4
        bg-white
        ${onClick ? 'cursor-pointer hover:bg-[#FAFAFA]' : ''}
      `}
      style={{
        transition: `background-color ${TRANSITION_BASE}`,
      }}
    >
      {/* Icon Container - 40x40, layout none for badge positioning */}
      <div className="relative h-10 w-10 flex-shrink-0">
        {/* Icon Wrap - 40x40, bg #FAFAFA, cornerRadius 8px, clickable for icon change */}
        <div
          ref={iconRef}
          onClick={handleIconClick}
          className={`flex h-10 w-10 items-center justify-center rounded-lg bg-[#FAFAFA] ${
            onIconClick
              ? 'cursor-pointer hover:ring-2 hover:ring-[#18181B]/10 transition-shadow'
              : ''
          }`}
        >
          <RuleIcon className="h-5 w-5 text-[#52525B]" />
        </div>
        {/* Badge - Globe, only when isGlobal=true. No badge for non-global rules. */}
        {rule.isGlobal && (
          <div className="absolute -right-1 -top-1">
            <RuleBadge />
          </div>
        )}
      </div>

      {/* Info - flex-1, gap 3px */}
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        {/* Name - 13px, #18181B, font-medium (500) */}
        <span className="text-[13px] font-medium text-[#18181B] truncate">{rule.name}</span>
        {/* Source path - 12px, #71717A, font-normal */}
        <span className="text-xs font-normal text-[#71717A] truncate">{rule.sourcePath}</span>
      </div>

      {/* Category & Tags Section (hidden in compact mode) */}
      <div className="flex items-center gap-[6px] shrink-0" style={rightSectionStyle}>
        {/* Category Badge - only show if category exists */}
        {categoryName && (
          <Badge variant="category" color={categoryColor}>
            {categoryName.charAt(0).toUpperCase() + categoryName.slice(1)}
          </Badge>
        )}

        {/* Tags */}
        {tagNames.length > 0 && <TagsWithTooltip tags={tagNames} />}
      </div>

      {/* Actions Button - 28x28, ellipsis icon */}
      <div ref={menuRef} className="shrink-0 relative">
        <button
          onClick={handleMoreClick}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#F4F4F5] transition-colors"
          aria-label="More actions"
        >
          <MoreHorizontal className="h-4 w-4 text-[#A1A1AA]" />
        </button>

        {/* Dropdown Menu */}
        {showMenu && (
          <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-lg border border-[#E5E5E5] shadow-lg z-50 p-1">
            <button
              onClick={handleDelete}
              className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors text-[#DC2626] hover:bg-[#FEF2F2] rounded"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RuleCard;
