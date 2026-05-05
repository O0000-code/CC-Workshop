import React, { useRef, useState, useMemo } from 'react';
import { Sparkles, MoreHorizontal, Trash2, Puzzle } from 'lucide-react';
import Badge from '../common/Badge';
import { ICON_MAP } from '@/components/common';
import { TagsWithTooltip } from '@/components/common/TagsWithTooltip';
import { truncateToFirstSentence } from '@/utils/text';
import { getCategoryColor as getCategoryColorFromName } from '@/utils/constants';
import { useAppStore } from '@/stores/appStore';
import {
  getCategoryDisplayName,
  getCategoryColor as getResolvedCategoryColor,
} from '@/utils/categoryTree';
import { Skill } from '@/types';

// ============================================================================
// Animation Constants
// ============================================================================

const TRANSITION_DURATION = '250ms';
const TRANSITION_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';
const TRANSITION_BASE = `${TRANSITION_DURATION} ${TRANSITION_EASING}`;
// Delay for right section to appear when expanding (closing detail panel)
const RIGHT_SECTION_DELAY = '150ms';

// ============================================================================
// Icon & Color Helpers
// ============================================================================

const getSkillIcon = (skill: Skill): React.ElementType => {
  if (skill.icon && ICON_MAP[skill.icon]) {
    return ICON_MAP[skill.icon];
  }
  return Sparkles;
};

// ============================================================================
// SkillListItem Component
// ============================================================================

interface SkillListItemProps {
  skill: Skill;
  compact?: boolean;
  selected?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
  onIconClick?: (triggerRef: React.RefObject<HTMLDivElement>) => void;
}

/**
 * Unified Skill list item with smooth transition between full and compact modes.
 *
 * Full mode (compact=false): Shows category badge and tags
 * Compact mode (compact=true): Shows only icon, name, description
 *
 * Key animation behavior:
 * - When collapsing (full → compact): right section fades out immediately
 * - When expanding (compact → full): right section fades in with delay
 *   to prevent layout shift while list width is still animating
 */
export const SkillListItem: React.FC<SkillListItemProps> = ({
  skill,
  compact = false,
  selected = false,
  onClick,
  onDelete,
  onIconClick,
}) => {
  const iconRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showMenu, setShowMenu] = useState(false);
  const IconComponent = getSkillIcon(skill);
  // V2 §5.9 dual-read: prefer the categoryId-resolved name/color, fall back
  // to the cached `skill.category` string for legacy entries.
  const allCategories = useAppStore((s) => s.categories);
  const displayCategoryName = useMemo(
    () => getCategoryDisplayName(skill.categoryId, skill.category, allCategories),
    [skill.categoryId, skill.category, allCategories],
  );
  const categoryColor = useMemo(
    () =>
      getResolvedCategoryColor(skill.categoryId, skill.category, allCategories) ??
      getCategoryColorFromName(skill.category),
    [skill.categoryId, skill.category, allCategories],
  );

  // Plugin source detection
  const isPluginSource = skill.installSource === 'plugin';

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
          {/* Plugin Badge */}
          {isPluginSource && (
            <div
              className="absolute flex items-center justify-center w-4 h-4 bg-[#3B82F6] rounded-lg border-2 border-white"
              style={{ right: '-4px', top: '-4px' }}
            >
              <Puzzle className="w-2 h-2 text-white" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            className={`text-[13px] text-[#18181B] truncate ${selected ? 'font-semibold' : 'font-medium'}`}
            style={{ transition: `font-weight ${TRANSITION_BASE}` }}
          >
            {skill.name}
          </span>
          <span className="text-xs font-normal text-[#71717A] truncate max-w-[600px]">
            {truncateToFirstSentence(skill.description, 100)}
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
        <TagsWithTooltip tags={skill.tags} />
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
  );
};

export default SkillListItem;
