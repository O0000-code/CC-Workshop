import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Plug,
  FileText,
  Layers,
  Folder,
  Plus,
  Settings,
  Repeat,
  Store,
  Package,
} from 'lucide-react';
import { Category, Tag } from '@/types';
import { SortableCategoriesList, SortableTagsList } from '@/components/sidebar';
import { getCurrentWindow } from '@tauri-apps/api/window';

// Helper to start window dragging
const startDrag = async (e: React.MouseEvent) => {
  if (e.button !== 0) return;

  const target = e.target as HTMLElement;

  // V3 — exclude sortable list regions so dnd-kit owns drag gestures inside
  // the Categories / Tags lists. Without this, mousedown on a sortable row
  // would race the window-drag handler against the 4px sensor activation.
  if (target.closest('[data-sortable-list]')) return;

  const tagName = target.tagName.toLowerCase();

  // Don't drag if clicking on interactive elements
  if (
    tagName === 'button' ||
    tagName === 'input' ||
    tagName === 'a' ||
    tagName === 'select' ||
    tagName === 'textarea' ||
    target.getAttribute('role') === 'button' ||
    target.getAttribute('role') === 'switch' ||
    target.closest('button, input, a, select, textarea, [role="button"], [role="switch"]')
  ) {
    return;
  }

  try {
    await getCurrentWindow().startDragging();
  } catch (err) {
    // Ignore errors in browser mode
  }
};

export interface SidebarProps {
  activeNav:
    | 'skills'
    | 'mcp-servers'
    | 'claude-md'
    | 'scenes'
    | 'projects'
    | 'settings'
    | 'marketplace-skills'
    | 'marketplace-mcps'
    | null;
  activeCategory?: string | null;
  activeTags?: string[];
  categories: Category[];
  tags: Tag[];
  counts: {
    skills: number;
    mcpServers: number;
    claudeMd: number;
    scenes: number;
    projects: number;
  };
  onNavChange: (nav: string) => void;
  onCategoryChange: (categoryId: string | null) => void;
  onTagToggle: (tagId: string) => void;
  onAddCategory?: () => void;
  onAddTag?: () => void;
  onCategoryContextMenu?: (category: Category, position: { x: number; y: number }) => void;
  onCategoryColorChange?: (categoryId: string, color: string) => void;

  // 编辑状态 props
  editingCategoryId?: string | null;
  isAddingCategory?: boolean;
  editingTagId?: string | null;
  isAddingTag?: boolean;

  // 编辑状态回调
  onCategoryDoubleClick?: (categoryId: string) => void;
  onCategorySave?: (id: string | null, name: string) => void;
  onCategoryEditCancel?: () => void;
  onTagDoubleClick?: (tagId: string) => void;
  onTagContextMenu?: (tag: Tag, position: { x: number; y: number }) => void;
  onTagSave?: (id: string | null, name: string) => void;
  onTagEditCancel?: () => void;

  // Refresh 相关 props
  onRefresh?: () => void;
  isRefreshing?: boolean;

  // Drag-and-drop reorder props (V3 — wired up by MainLayout, fed into the
  // Sortable* lists). All five must come together: reorder callbacks persist
  // the new order, drag start/end gate UI globally (Refresh disable), and
  // isDragging mirrors the active drag state for visual feedback.
  //
  // V2 hierarchy [P0-ARCH-3]: `onReorderCategories` and `onSetCategoryParent`
  // both return `Promise<void>` so SortableCategoriesList can `await` the
  // parent-change Stage 2 commit before computing the Stage 3 reorder payload
  // off fresh `categories` state. See 03 V2 §5.7 / §5.8.
  onReorderCategories: (orderedIds: string[]) => Promise<void>;
  onReorderTags: (orderedIds: string[]) => Promise<void>;
  /** Commit a Category parent_id change. Optional — when omitted, drop-into
   *  drops in SortableCategoriesList silently degrade to same-level reorders.
   *  Production wiring lives in MainLayout (`handleSetCategoryParent` →
   *  `appStore.moveCategoryToParent`). */
  onSetCategoryParent?: (id: string, newParentId: string | null) => Promise<void>;
  /**
   * V2.2 D4 (2026-05-08): atomic merge of setCategoryParent + reorder for
   * the promote-with-position path. SortableCategoriesList prefers this
   * when both a parent change AND a target position are known (child → root
   * with explicit drop slot), avoiding the dual-await intermediate React
   * frame. Optional — when omitted, the dual-await fallback (existing
   * `onSetCategoryParent` then `onReorder`) is used. Production wiring:
   * MainLayout → `appStore.moveCategoryToParentAtPosition`. See
   * _synthesis_decisions D4 / 02 V2.2 §6.2.
   */
  onMoveCategoryToParentAtPosition?: (
    id: string,
    newParentId: string | null,
    newOrderedIds: string[],
  ) => Promise<void>;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
}

// Navigation items configuration
const navItems = [
  { id: 'skills', label: 'Skills', icon: Sparkles, countKey: 'skills' as const },
  { id: 'mcp-servers', label: 'MCP Servers', icon: Plug, countKey: 'mcpServers' as const },
  { id: 'claude-md', label: 'CLAUDE.md', icon: FileText, countKey: 'claudeMd' as const },
  { id: 'scenes', label: 'Scenes', icon: Layers, countKey: 'scenes' as const },
  { id: 'projects', label: 'Projects', icon: Folder, countKey: 'projects' as const },
];

// Marketplace nav items (V2.0): independent group above NAVIGATION. PRD §5.1
// + design-language Rule constrain these to mirror existing nav-button visual
// language (h-9 / px-2.5 / gap-2.5 / rounded-[6px] / 13px label) but without a
// count badge — marketplace catalog size is upstream-driven and not meaningful
// in the sidebar.
const marketplaceItems = [
  { id: 'marketplace-skills', label: 'Skill Marketplace', icon: Store },
  { id: 'marketplace-mcps', label: 'MCP Marketplace', icon: Package },
];

// Maximum categories to display before showing "Show X more"
const MAX_VISIBLE_CATEGORIES = 9;

// Maximum tags to display before showing "+N"
const MAX_VISIBLE_TAGS = 10;

export function Sidebar({
  activeNav,
  activeCategory,
  activeTags = [],
  categories,
  tags,
  counts,
  onNavChange,
  onCategoryChange: _onCategoryChange, // Kept for potential future use
  onTagToggle: _onTagToggle, // Kept for potential future use
  onAddCategory,
  onAddTag,
  onCategoryContextMenu,
  onCategoryColorChange,
  // 编辑状态 props
  editingCategoryId,
  isAddingCategory,
  editingTagId,
  isAddingTag,
  // 编辑状态回调
  onCategoryDoubleClick,
  onCategorySave,
  onCategoryEditCancel,
  onTagDoubleClick,
  onTagContextMenu,
  onTagSave,
  onTagEditCancel,
  // Refresh 相关 props
  onRefresh,
  isRefreshing = false,
  // Drag-and-drop reorder props
  onReorderCategories,
  onReorderTags,
  onSetCategoryParent,
  onMoveCategoryToParentAtPosition,
  onDragStart,
  onDragEnd,
  isDragging,
}: SidebarProps) {
  const navigate = useNavigate();
  const [isClickAnimating, setIsClickAnimating] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);

  // Handle refresh button click with animation
  const handleRefreshClick = useCallback(() => {
    if (isRefreshing || isClickAnimating) return;

    // Start click animation
    setIsClickAnimating(true);

    // Call refresh after a tiny delay for visual feedback
    setTimeout(() => {
      onRefresh?.();
    }, 50);

    // Reset click animation after a longer cooldown to prevent rapid clicks
    setTimeout(() => {
      setIsClickAnimating(false);
    }, 1500);
  }, [isRefreshing, isClickAnimating, onRefresh]);

  // Handle navigation item click
  const handleNavClick = (navId: string) => {
    onNavChange(navId);
    if (navId === 'settings') {
      navigate('/settings');
    } else {
      navigate(`/${navId}`);
    }
  };

  // Handle settings button click
  const handleSettingsClick = () => {
    onNavChange('settings');
    navigate('/settings');
  };

  // Click handlers used by the Sortable lists. Routing logic kept verbatim
  // from the original inline JSX (formerly Sidebar.tsx:302-308 / :437-442) so
  // single-click navigation behaviour is unchanged.
  const handleCategoryRowClick = (categoryId: string) => {
    if (activeCategory === categoryId) {
      navigate('/skills'); // 取消选择时回到 Skills 页面
    } else {
      navigate(`/category/${categoryId}`);
    }
  };

  const handleTagPillClick = (tagId: string) => {
    if (activeTags.includes(tagId)) {
      navigate('/skills'); // 取消选择时回到 Skills 页面
    } else {
      navigate(`/tag/${tagId}`);
    }
  };

  // Adapt Sidebar's existing onCategoryContextMenu / onTagContextMenu prop
  // shapes (which take a `{x, y}` position object) to what the Sortable lists
  // emit (a raw MouseEvent). Behaviour matches the original inline handlers.
  const handleCategoryContextMenu = (category: Category, e: React.MouseEvent) => {
    e.preventDefault();
    onCategoryContextMenu?.(category, { x: e.clientX, y: e.clientY });
  };

  const handleTagContextMenu = (tag: Tag, e: React.MouseEvent) => {
    e.preventDefault();
    onTagContextMenu?.(tag, { x: e.clientX, y: e.clientY });
  };

  return (
    <aside className="w-[260px] h-screen bg-white border-r border-[#E5E5E5] flex flex-col flex-shrink-0">
      {/* Sidebar Header - Traffic Lights 占位 + Collapse Button */}
      <header
        className="h-14 flex items-center justify-between pl-5 pr-3 border-b border-[#E5E5E5] flex-shrink-0"
        onMouseDown={startDrag}
      >
        {/* Traffic Lights 占位区 - 为系统原生红绿灯预留空间，不绘制任何内容 */}
        <div className="w-[52px]" aria-hidden="true" />

        {/* Refresh Button — disabled + visually dimmed during a drag (V3 §2.11
            data feedback rule: no external mutations while a reorder is in
            flight). pointer-events-none keeps the cursor from becoming a
            hover affordance during the drag. */}
        <button
          onClick={handleRefreshClick}
          disabled={isRefreshing || isClickAnimating || isDragging}
          aria-disabled={isRefreshing || isClickAnimating || isDragging}
          className={`w-6 h-6 flex items-center justify-center rounded-[6px] hover:bg-[#F4F4F5] transition-colors active:scale-95 ${
            isDragging ? 'opacity-40 pointer-events-none' : ''
          }`}
          aria-label="Refresh data"
        >
          <Repeat
            size={14}
            className={`text-[#D4D4D8] transition-transform ${
              isRefreshing ? 'refresh-spinning' : ''
            } ${isClickAnimating && !isRefreshing ? 'refresh-click' : ''}`}
          />
        </button>
      </header>

      {/* Sidebar Content.
          V2.8 (2026-05-12): left padding now 12 px (pl-3). Earlier V2.7
          tried pl-3.5 (14 px) for a 2 px shift but the result was visually
          imperceptible — user requested another 2 px (total 4 px) left
          shift, so pl-3 (12 px) is the final landing. Other sides keep
          their original values (pt-4 = 16, pr-4 = 16, pb-2 = 8). This is
          the only way to move the Categories hover-bg leftward because
          the container's overflow-hidden clips any per-row negative
          margin. The whole sidebar content column — Marketplace / Library
          nav items, Categories rows (hover bg included), Tags pills, all
          section headers — shifts left in lock-step. Sidebar header
          (traffic-lights + refresh) is in its own element above and is
          not affected. */}
      <div className="flex-1 flex flex-col pt-4 pr-4 pl-3 pb-2 overflow-hidden">
        {/* Marketplace Section - 固定，不滚动。
            V2.0 PRD §5.1: independent top group above NAVIGATION. Top
            separator is provided by the Header `border-b border-[#E5E5E5]`
            above; this section ends with a divider (#E4E4E7) mirroring
            NAV→CATEGORIES at line :314 below. */}
        <nav
          aria-label="Marketplace"
          aria-labelledby="marketplace-section-label"
          className="flex flex-col flex-shrink-0"
        >
          <div className="flex items-center justify-between flex-shrink-0 mb-3">
            <h3
              id="marketplace-section-label"
              className="text-[10px] font-semibold text-[#A1A1AA] uppercase tracking-[0.8px]"
            >
              Marketplace
            </h3>
          </div>
          <div className="flex flex-col gap-0.5 flex-shrink-0">
            {marketplaceItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`
                      h-9 px-2.5 flex items-center gap-2.5 rounded-[6px] cursor-pointer
                      transition-colors duration-150 border
                      ${
                        isActive
                          ? 'bg-white border-[#E5E5E5]'
                          : 'border-transparent hover:bg-[#F4F4F5]'
                      }
                    `}
                >
                  <Icon size={16} className={isActive ? 'text-[#18181B]' : 'text-[#71717A]'} />
                  <span
                    className={`
                        text-[13px] flex-1 text-left
                        ${isActive ? 'font-medium text-[#18181B]' : 'font-normal text-[#71717A]'}
                      `}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Divider — Marketplace → Library. Mirror of NAV→CATEGORIES
            at :314 below; uses divider token (#E4E4E7), not the page-chrome
            border token (#E5E5E5). */}
        <div className="h-px bg-[#E4E4E7] my-4 flex-shrink-0" />

        {/* Library Section Header — section label mirroring Marketplace /
            Categories. Covers the nav items below (Skills / MCP Servers /
            CLAUDE.md / Scenes / Projects), naming the user's managed
            resource library as a distinct group from Marketplace (the
            upstream discovery surface) and Categories (the organisational
            facet). */}
        <div className="flex items-center justify-between flex-shrink-0 mb-3">
          <h3 className="text-[10px] font-semibold text-[#A1A1AA] uppercase tracking-[0.8px]">
            Library
          </h3>
        </div>

        {/* Navigation Section - 固定，不滚动 */}
        <nav className="flex flex-col gap-0.5 flex-shrink-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            const count = counts[item.countKey];

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`
                    h-9 px-2.5 flex items-center gap-2.5 rounded-[6px] cursor-pointer
                    transition-colors duration-150 border
                    ${
                      isActive
                        ? 'bg-white border-[#E5E5E5]'
                        : 'border-transparent hover:bg-[#F4F4F5]'
                    }
                  `}
              >
                <Icon size={16} className={isActive ? 'text-[#18181B]' : 'text-[#71717A]'} />
                <span
                  className={`
                      text-[13px] flex-1 text-left
                      ${isActive ? 'font-medium text-[#18181B]' : 'font-normal text-[#71717A]'}
                    `}
                >
                  {item.label}
                </span>
                <span className="text-[11px] font-medium text-[#A1A1AA]">{count}</span>
              </button>
            );
          })}
        </nav>

        {/* Divider - 固定，不参与滚动 */}
        <div className="h-px bg-[#E4E4E7] my-4 flex-shrink-0" />

        {/* Categories Section Header - 固定，不参与滚动 */}
        <div className="flex items-center justify-between flex-shrink-0 mb-3">
          <h3 className="text-[10px] font-semibold text-[#A1A1AA] uppercase tracking-[0.8px]">
            Categories
          </h3>
          {onAddCategory && (
            <button
              onClick={onAddCategory}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#F4F4F5] transition-colors"
              aria-label="Add category"
            >
              <Plus size={12} className="text-[#A1A1AA]" />
            </button>
          )}
        </div>

        {/* Scrollable Area - Categories列表 + Tags 自适应高度，整体滚动 */}
        <div className="flex-1 overflow-y-auto sidebar-scroll min-h-0">
          {/* Categories List — V3: dnd-kit Sortable container.
              Pass the FULL `categories` array (not pre-sliced) so the list
              owns its visible/overflow split internally; otherwise drag
              targets in the overflow region would be invisible to dnd-kit. */}
          <SortableCategoriesList
            categories={categories}
            activeCategoryId={activeCategory ?? null}
            editingCategoryId={editingCategoryId ?? null}
            isAddingCategory={isAddingCategory ?? false}
            showAll={showAllCategories}
            setShowAll={setShowAllCategories}
            maxVisible={MAX_VISIBLE_CATEGORIES}
            onReorder={onReorderCategories}
            onSetCategoryParent={onSetCategoryParent}
            onMoveCategoryToParentAtPosition={onMoveCategoryToParentAtPosition}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onCategoryClick={handleCategoryRowClick}
            onCategoryDoubleClick={(id) => onCategoryDoubleClick?.(id)}
            onCategoryContextMenu={handleCategoryContextMenu}
            onCategoryColorChange={(id, color) => onCategoryColorChange?.(id, color)}
            onCategorySave={(id, name) => onCategorySave?.(id, name)}
            onCategoryEditCancel={() => onCategoryEditCancel?.()}
          />

          {/* Tags Section */}
          <section className="flex flex-col gap-3 pt-4 border-t border-[#E4E4E7] mt-4">
            {/* Section Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-semibold text-[#A1A1AA] uppercase tracking-[0.8px]">
                Tags
              </h3>
              {onAddTag && (
                <button
                  onClick={onAddTag}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#F4F4F5] transition-colors"
                  aria-label="Add tag"
                >
                  <Plus size={12} className="text-[#A1A1AA]" />
                </button>
              )}
            </div>

            {/* Tags Grid — V3 dnd-kit container; same full-array contract as
                the Categories list above. */}
            <SortableTagsList
              tags={tags}
              activeTagIds={activeTags ?? []}
              editingTagId={editingTagId ?? null}
              isAddingTag={isAddingTag ?? false}
              showAll={showAllTags}
              setShowAll={setShowAllTags}
              maxVisible={MAX_VISIBLE_TAGS}
              onReorder={onReorderTags}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onTagClick={handleTagPillClick}
              onTagDoubleClick={(id) => onTagDoubleClick?.(id)}
              onTagContextMenu={handleTagContextMenu}
              onTagSave={(id, name) => onTagSave?.(id, name)}
              onTagEditCancel={() => onTagEditCancel?.()}
            />
          </section>
        </div>

        {/* Sidebar Footer - 固定 */}
        <footer className="pt-2 -ml-1.5 flex-shrink-0">
          <button
            onClick={handleSettingsClick}
            className={`
              w-8 h-8 flex items-center justify-center rounded-[6px]
              transition-colors duration-150
              ${activeNav === 'settings' ? 'bg-[#F4F4F5]' : 'hover:bg-[#F4F4F5]'}
            `}
            aria-label="Settings"
          >
            <Settings size={18} className="text-[#71717A]" />
          </button>
        </footer>
      </div>
    </aside>
  );
}

export default Sidebar;
