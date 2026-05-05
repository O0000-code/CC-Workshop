import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  Code,
  Github,
  BookOpen,
  Smartphone,
  Palette,
  Server,
  Database,
  Sparkles,
  FileCode,
  GitPullRequest,
  TestTube,
  Layers,
  Wand2,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import type { Skill } from '../../types';
import Badge from '../common/Badge';
import { ICON_MAP } from '@/components/common';
import { useAppStore } from '@/stores/appStore';
import {
  getCategoryDisplayName,
  getCategoryColor as getResolvedCategoryColor,
} from '@/utils/categoryTree';

// ============================================================================
// Types
// ============================================================================

export interface SkillItemProps {
  skill: Skill;
  variant?: 'full' | 'compact';
  selected?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
  onIconClick?: (triggerRef: React.RefObject<HTMLDivElement>) => void;
}

// ============================================================================
// Icon Mapping
// ============================================================================

const skillIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  'frontend-development': Code,
  'github-explorer': Github,
  'swiftui-expert': Smartphone,
  'api-design': Server,
  'unit-testing': TestTube,
  'ui-design-review': Palette,
  'algorithmic-art': Wand2,
  'color-system': Palette,
  'literature-review': BookOpen,
  'data-analysis': Database,
  'commit-guidelines': GitPullRequest,
  'pr-review': FileCode,
  'custom-template': Layers,
};

const categoryIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  development: Code,
  design: Palette,
  research: BookOpen,
  productivity: Sparkles,
  other: Layers,
};

function getSkillIcon(skill: Skill): React.ComponentType<{ className?: string }> {
  // Priority 1: Use custom icon if set and exists in ICON_MAP
  if (skill.icon && ICON_MAP[skill.icon]) {
    return ICON_MAP[skill.icon];
  }

  // Priority 2: Try to match by skill ID (converted to kebab-case)
  const skillKey = skill.name.toLowerCase().replace(/\s+/g, '-');
  if (skillIconMap[skillKey]) {
    return skillIconMap[skillKey];
  }

  // Priority 3: Fall back to category icon
  if (categoryIconMap[skill.category]) {
    return categoryIconMap[skill.category];
  }

  // Default icon
  return Sparkles;
}

// ============================================================================
// Category Color Mapping
// ============================================================================

const categoryColors: Record<string, string> = {
  development: '#18181B',
  design: '#8B5CF6',
  research: '#3B82F6',
  productivity: '#10B981',
  other: '#71717A',
};

// ============================================================================
// SkillItem Component
// ============================================================================

export function SkillItem({
  skill,
  variant = 'full',
  selected = false,
  onClick,
  onDelete,
  onIconClick,
}: SkillItemProps) {
  const iconRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showMenu, setShowMenu] = useState(false);
  const Icon = getSkillIcon(skill);
  // V2 §5.9 dual-read: prefer the categoryId-resolved color/name, fall
  // back to the cached `skill.category` string for legacy entries.
  const allCategories = useAppStore((s) => s.categories);
  const displayCategoryName = useMemo(
    () => getCategoryDisplayName(skill.categoryId, skill.category, allCategories),
    [skill.categoryId, skill.category, allCategories],
  );
  const categoryColor = useMemo(() => {
    const resolved = getResolvedCategoryColor(skill.categoryId, skill.category, allCategories);
    return resolved ?? categoryColors[skill.category] ?? '#71717A';
  }, [skill.categoryId, skill.category, allCategories]);

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

  // Full variant - for main list
  if (variant === 'full') {
    return (
      <div
        onClick={onClick}
        className={`
          flex items-center gap-3.5
          rounded-lg border border-[#E5E5E5]
          bg-white
          px-5 py-4
          transition-colors
          ${onClick ? 'cursor-pointer hover:bg-[#FAFAFA]' : ''}
        `}
      >
        {/* Icon Container */}
        <div
          ref={iconRef}
          onClick={(e) => {
            e.stopPropagation();
            onIconClick?.(iconRef as React.RefObject<HTMLDivElement>);
          }}
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#FAFAFA] ${onIconClick ? 'cursor-pointer hover:ring-2 hover:ring-[#18181B]/10 transition-shadow' : ''}`}
        >
          <Icon className="h-5 w-5 text-[#52525B]" />
        </div>

        {/* Info */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-[#18181B]">{skill.name}</span>
          <span className="max-w-[500px] truncate text-xs font-normal text-[#71717A]">
            {skill.description}
          </span>
        </div>

        {/* Tags Container */}
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {/* Category Badge */}
          <Badge variant="category" color={categoryColor}>
            {displayCategoryName
              ? displayCategoryName.charAt(0).toUpperCase() + displayCategoryName.slice(1)
              : 'Uncategorized'}
          </Badge>

          {/* Tags (max 2) */}
          {skill.tags.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="tag">
              {tag}
            </Badge>
          ))}
        </div>

        {/* More Menu */}
        <div ref={menuRef} className="flex-shrink-0 relative">
          <button
            onClick={handleMoreClick}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-[#F4F4F5] transition-colors"
          >
            <MoreHorizontal className="w-4 h-4 text-[#71717A]" />
          </button>
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
  }

  // Compact variant - for side list in detail page
  return (
    <div
      onClick={onClick}
      className={`
        flex items-center gap-3
        rounded-md
        px-3.5 py-3
        transition-colors
        ${onClick ? 'cursor-pointer' : ''}
        ${selected ? 'bg-[#FAFAFA]' : 'hover:bg-[#FAFAFA]'}
      `}
    >
      {/* Icon Container */}
      <div
        ref={iconRef}
        onClick={(e) => {
          e.stopPropagation();
          onIconClick?.(iconRef as React.RefObject<HTMLDivElement>);
        }}
        className={`
          flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md
          ${selected ? 'bg-[#F4F4F5]' : 'bg-[#FAFAFA]'}
          ${onIconClick ? 'cursor-pointer hover:ring-2 hover:ring-[#18181B]/10 transition-shadow' : ''}
        `}
      >
        <Icon className={`h-4 w-4 ${selected ? 'text-[#18181B]' : 'text-[#52525B]'}`} />
      </div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={`
            text-[13px] text-[#18181B]
            ${selected ? 'font-semibold' : 'font-medium'}
          `}
        >
          {skill.name}
        </span>
        <span className="truncate text-[11px] font-normal text-[#71717A]">{skill.description}</span>
      </div>

      {/* More Menu */}
      <div ref={menuRef} className="flex-shrink-0 relative">
        <button
          onClick={handleMoreClick}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#F4F4F5] transition-colors"
        >
          <MoreHorizontal className="w-3.5 h-3.5 text-[#71717A]" />
        </button>
        {showMenu && (
          <div className="absolute right-0 top-full mt-1 w-28 bg-white rounded-lg border border-[#E5E5E5] shadow-lg z-50 p-1">
            <button
              onClick={handleDelete}
              className="w-full px-2.5 py-1.5 text-left text-xs text-[#DC2626] hover:bg-[#FEF2F2] flex items-center gap-1.5 transition-colors rounded"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default SkillItem;
