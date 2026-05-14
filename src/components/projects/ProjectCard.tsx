import React, { useState, useRef, useEffect } from 'react';
import {
  Folder,
  MoreHorizontal,
  Trash2,
  Layers,
  Sparkles,
  Plug,
  FileText,
  ScrollText,
} from 'lucide-react';
import type { Project, Scene } from '../../types';

// ============================================================================
// Types
// ============================================================================

export interface ProjectCardProps {
  project: Project;
  scene?: Scene;
  compact?: boolean;
  selected?: boolean;
  onClick: () => void;
  onDelete?: () => void;
}

// ============================================================================
// ProjectCard Component
// ============================================================================

/**
 * ProjectCard Component
 *
 * Displays a project card in the projects list page.
 *
 * Design specs (from VXJaS - Projects List):
 * - Layout: justify-content: space-between, align-items: center
 * - Size: width fill_container (w-full)
 * - Padding: 16px 20px (py-4 px-5)
 * - Border: 1px solid #E5E5E5
 * - Corner Radius: 8px
 * - Hover: bg #FAFAFA
 *
 * Left Section (gap: 14):
 * - Icon Wrap: 40x40, rounded-lg, bg #FAFAFA
 * - Icon: folder, 20x20, #52525B
 * - Info: name (14px, font-medium, #18181B) + path (12px, #71717A)
 *
 * Right Section (gap: 24):
 * - Meta Info: Scene label/value (11px, gap: 6)
 * - Status Badge: "Configured" if project has scene
 * - Action Button: 28x28, MoreHorizontal icon
 */
export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  scene,
  compact = false,
  selected = false,
  onClick,
  onDelete,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Format path for display (show truncated version)
  const formatPath = (path: string) => {
    const segments = path.split('/').filter(Boolean);
    if (segments.length <= 3) return path;
    return '~/' + segments.slice(-2).join('/');
  };

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
        border-[#E5E5E5]
        px-5
        py-4
        transition-colors
        ${selected ? 'bg-[#FAFAFA]' : 'bg-white hover:bg-[#FAFAFA]'}
      `}
    >
      {/* Left Section */}
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        {/* Icon Wrap */}
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-[#F4F4F5]' : 'bg-[#FAFAFA]'}`}
        >
          <Folder className={`h-5 w-5 ${selected ? 'text-[#18181B]' : 'text-[#52525B]'}`} />
        </div>

        {/* Info */}
        <div className="flex flex-col gap-1 min-w-0">
          <span
            className={`text-sm text-[#18181B] truncate ${selected ? 'font-semibold' : 'font-medium'}`}
          >
            {project.name}
          </span>
          <span className="text-xs font-normal text-[#71717A] truncate">
            {formatPath(project.path)}
          </span>
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center">
        {/* Meta Info - hidden in compact mode */}
        {scene && (
          <div
            className="flex items-center overflow-hidden"
            style={{
              opacity: compact ? 0 : 1,
              maxWidth: compact ? 0 : '400px',
              gap: compact ? 0 : '20px',
              transition:
                'opacity 250ms cubic-bezier(0.4, 0, 0.2, 1), max-width 250ms cubic-bezier(0.4, 0, 0.2, 1), gap 250ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {/* Scene */}
            <div
              className="flex items-center overflow-hidden whitespace-nowrap"
              style={{
                gap: compact ? 0 : '6px',
                transition: 'gap 250ms cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <Layers className="h-3 w-3 text-[#A1A1AA] shrink-0" />
              <span className="text-[11px] font-normal text-[#71717A]">{scene.name}</span>
            </div>

            {/* Skills Count */}
            <div
              className="flex items-center overflow-hidden whitespace-nowrap"
              style={{
                gap: compact ? 0 : '6px',
                transition: 'gap 250ms cubic-bezier(0.4, 0, 0.2, 1)',
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
                transition: 'gap 250ms cubic-bezier(0.4, 0, 0.2, 1)',
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
                  transition: 'gap 250ms cubic-bezier(0.4, 0, 0.2, 1)',
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
                  transition: 'gap 250ms cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                <ScrollText className="h-3 w-3 text-[#A1A1AA] shrink-0" />
                <span className="text-[11px] font-normal text-[#71717A]">
                  {scene.ruleIds?.length} Rules
                </span>
              </div>
            )}
          </div>
        )}

        {/* Action Button - Always visible */}
        <div ref={menuRef} className="shrink-0 ml-4 relative">
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
    </div>
  );
};

export default ProjectCard;
