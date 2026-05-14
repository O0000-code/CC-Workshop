import React, { useRef, useState, useEffect } from 'react';
import {
  Layers,
  Code,
  Server,
  BarChart,
  Cloud,
  FileText,
  BookOpen,
  Smartphone,
  MoreHorizontal,
  Trash2,
  Sparkles,
  Plug,
  ScrollText,
} from 'lucide-react';
import { Scene } from '@/types';

// ============================================================================
// Types
// ============================================================================

interface SceneListItemProps {
  scene: Scene;
  compact?: boolean;
  selected?: boolean;
  active?: boolean;
  onClick?: () => void;
  onMoreClick?: (e: React.MouseEvent) => void;
  onIconClick?: (triggerRef: React.RefObject<HTMLDivElement>) => void;
  onDelete?: () => void;
}

// ============================================================================
// Icon Mapping
// ============================================================================

const iconMap: Record<string, React.FC<{ className?: string }>> = {
  layers: Layers,
  code: Code,
  server: Server,
  'bar-chart': BarChart,
  cloud: Cloud,
  'file-text': FileText,
  'book-open': BookOpen,
  smartphone: Smartphone,
};

const getIcon = (iconName: string) => {
  return iconMap[iconName] || Layers;
};

// ============================================================================
// Animation Constants
// ============================================================================

const TRANSITION_DURATION = '250ms';
const TRANSITION_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';
const TRANSITION_BASE = `${TRANSITION_DURATION} ${TRANSITION_EASING}`;

// ============================================================================
// SceneListItem Component
// ============================================================================

/**
 * SceneListItem Component
 *
 * Unified scene list item with smooth transition between full and compact modes.
 *
 * Full mode (compact=false): Shows description, right-side stats, active badge, more button
 * Compact mode (compact=true): Shows only icon, name, and inline stats below name
 *
 * Animation specs:
 * - Duration: 250ms (consistent with SlidePanel)
 * - Easing: cubic-bezier(0.4, 0, 0.2, 1) (Material Design standard)
 * - Elements: opacity, max-height, width transitions
 */
export const SceneListItem: React.FC<SceneListItemProps> = ({
  scene,
  compact = false,
  selected = false,
  active = false,
  onClick,
  onMoreClick: _onMoreClick,
  onIconClick,
  onDelete,
}) => {
  const iconRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showMenu, setShowMenu] = useState(false);
  const IconComponent = getIcon(scene.icon);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onDelete?.();
  };

  // Stats text for both modes
  const statsText = `${scene.skillIds.length} Skills · ${scene.mcpIds.length} MCPs`;

  return (
    <div
      onClick={onClick}
      className={`
        flex
        w-full
        cursor-pointer
        items-center
        justify-between
        rounded-lg
        border
        px-5
        py-4
        border-[#E5E5E5] ${selected ? 'bg-[#FAFAFA]' : 'bg-white hover:bg-[#FAFAFA]'}
      `}
      style={{
        transition: `background-color ${TRANSITION_BASE}, border-color ${TRANSITION_BASE}`,
      }}
    >
      {/* Left Section - align to start in compact mode */}
      <div
        className={`flex min-w-0 flex-1 overflow-hidden gap-3.5 ${compact ? 'items-start' : 'items-center'}`}
      >
        {/* Icon Container */}
        <div
          ref={iconRef}
          onClick={(e) => {
            e.stopPropagation();
            onIconClick?.(iconRef as React.RefObject<HTMLDivElement>);
          }}
          className={`
            flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg
            ${selected ? 'bg-[#F4F4F5]' : 'bg-[#FAFAFA]'}
            ${onIconClick ? 'cursor-pointer hover:ring-2 hover:ring-[#18181B]/10' : ''}
          `}
          style={{
            transition: `background-color ${TRANSITION_BASE}, box-shadow ${TRANSITION_BASE}`,
          }}
        >
          <IconComponent
            className={`h-5 w-5 transition-colors duration-[250ms] ${selected ? 'text-[#18181B]' : 'text-[#52525B]'}`}
          />
        </div>

        {/* Info */}
        <div className="flex flex-col gap-1">
          {/* Name */}
          <span
            className={`
              text-sm text-[#18181B]
              ${selected ? 'font-semibold' : 'font-medium'}
            `}
            style={{ transition: `font-weight ${TRANSITION_BASE}` }}
          >
            {scene.name}
          </span>

          {/* Secondary Text - overlapping layout */}
          <div className="relative">
            {/* Description - always in flow, controls height */}
            <span
              className="block max-w-[400px] truncate text-xs font-normal text-[#71717A]"
              style={{
                opacity: compact ? 0 : 1,
                transition: `opacity ${TRANSITION_BASE}`,
              }}
            >
              {scene.description}
            </span>

            {/* Stats - absolute positioned, overlays description */}
            <span
              className="absolute top-0 left-0 w-full truncate text-xs font-normal text-[#71717A]"
              style={{
                opacity: compact ? 1 : 0,
                transition: `opacity ${TRANSITION_BASE}`,
              }}
            >
              {statsText}
            </span>
          </div>
        </div>
      </div>

      {/* Right Section Wrapper - keeps stats and menu together */}
      <div className="flex items-center shrink-0">
        {/* Stats Section - visible in full mode */}
        <div
          className="flex items-center"
          style={{
            opacity: compact ? 0 : 1,
            maxWidth: compact ? 0 : '400px',
            gap: compact ? 0 : '24px',
            overflow: 'hidden' as const,
            transition: `opacity ${TRANSITION_BASE}, max-width ${TRANSITION_BASE}, gap ${TRANSITION_BASE}`,
          }}
        >
          {/* Meta Stats */}
          <div
            className="flex items-center"
            style={{
              gap: compact ? 0 : '20px',
              transition: `gap ${TRANSITION_BASE}`,
            }}
          >
            {/* Skills Count */}
            <div
              className="flex items-center overflow-hidden whitespace-nowrap"
              style={{
                gap: compact ? 0 : '6px',
                maxWidth: compact ? 0 : '120px',
                transition: `gap ${TRANSITION_BASE}, max-width ${TRANSITION_BASE}`,
              }}
            >
              <Sparkles className="h-3 w-3 text-[#A1A1AA] shrink-0" />
              <span className="text-[11px] font-normal text-[#71717A]">
                {scene.skillIds.length} Skills
              </span>
            </div>

            {/* MCPs Count */}
            <div
              className="flex items-center overflow-hidden whitespace-nowrap"
              style={{
                gap: compact ? 0 : '6px',
                maxWidth: compact ? 0 : '120px',
                transition: `gap ${TRANSITION_BASE}, max-width ${TRANSITION_BASE}`,
              }}
            >
              <Plug className="h-3 w-3 text-[#A1A1AA] shrink-0" />
              <span className="text-[11px] font-normal text-[#71717A]">
                {scene.mcpIds.length} MCPs
              </span>
            </div>

            {/* CLAUDE.md Count - only show if > 0 */}
            {(scene.claudeMdIds?.length ?? 0) > 0 && (
              <div
                className="flex items-center overflow-hidden whitespace-nowrap"
                style={{
                  gap: compact ? 0 : '6px',
                  maxWidth: compact ? 0 : '120px',
                  transition: `gap ${TRANSITION_BASE}, max-width ${TRANSITION_BASE}`,
                }}
              >
                <FileText className="h-3 w-3 text-[#A1A1AA] shrink-0" />
                <span className="text-[11px] font-normal text-[#71717A]">
                  {scene.claudeMdIds?.length} Docs
                </span>
              </div>
            )}

            {/* Rules Count - only show if > 0 */}
            {(scene.ruleIds?.length ?? 0) > 0 && (
              <div
                className="flex items-center overflow-hidden whitespace-nowrap"
                style={{
                  gap: compact ? 0 : '6px',
                  maxWidth: compact ? 0 : '120px',
                  transition: `gap ${TRANSITION_BASE}, max-width ${TRANSITION_BASE}`,
                }}
              >
                <ScrollText className="h-3 w-3 text-[#A1A1AA] shrink-0" />
                <span className="text-[11px] font-normal text-[#71717A]">
                  {scene.ruleIds?.length} Rules
                </span>
              </div>
            )}
          </div>

          {/* Active Badge */}
          {active && (
            <span
              className="overflow-hidden whitespace-nowrap rounded px-2.5 py-1 text-[10px] font-semibold text-[#16A34A] bg-[#DCFCE7]"
              style={{
                opacity: compact ? 0 : 1,
                maxWidth: compact ? 0 : '80px',
                transition: `opacity ${TRANSITION_BASE}, max-width ${TRANSITION_BASE}`,
              }}
            >
              Active
            </span>
          )}
        </div>

        {/* More Button with Dropdown Menu - Always visible */}
        <div ref={menuRef} className="relative shrink-0 ml-4">
          <button
            onClick={handleMoreClick}
            className="flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-[#F4F4F5]"
          >
            <MoreHorizontal className="h-4 w-4 text-[#A1A1AA]" />
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
    </div>
  );
};

export default SceneListItem;
