import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Database,
  Plug,
  FolderOpen,
  Code,
  MessageSquare,
  Globe,
  FileText,
  Layers,
  Wrench,
  Pencil,
  X,
  Plus,
  Info,
  RefreshCw,
  Check,
  Loader2,
} from 'lucide-react';
import { SlidePanel } from '@/components/layout';
import {
  IconPicker,
  ICON_MAP,
  CategoryTreeDropdown,
  ScopeSelector,
  Button,
} from '@/components/common';
import { MarketplaceSourceBadge } from '@/components/marketplace/MarketplaceSourceBadge';
import { useMcpsStore } from '@/stores/mcpsStore';
import { useAppStore } from '@/stores/appStore';
import { useScenesStore } from '@/stores/scenesStore';
import { safeInvoke } from '@/utils/tauri';
import { isEnterCommit } from '@/utils/keyboard';
import type { McpServer, Tool } from '@/types';

// ============================================================================
// Icon Mapping and Helper Functions
// ============================================================================

// Icon mapping for MCP servers
const iconMap: Record<string, React.ElementType> = {
  Database: Database,
  Development: Code,
  Communication: MessageSquare,
  Research: Globe,
  Productivity: FileText,
  default: Plug,
};

const getIcon = (category: string): React.ElementType => {
  return iconMap[category] || iconMap.default;
};

// Get icon for MCP server - prioritizes custom icon over category-based icon
const getMcpIcon = (mcp: { icon?: string; category: string }): React.ElementType => {
  // Priority: custom icon > category icon > default
  if (mcp.icon && ICON_MAP[mcp.icon]) {
    return ICON_MAP[mcp.icon];
  }
  return getIcon(mcp.category);
};

// Tool icon mapping based on tool name patterns
const getToolIcon = (toolName: string): React.ElementType => {
  if (toolName.includes('read') || toolName.includes('get') || toolName.includes('list')) {
    return FileText;
  }
  if (toolName.includes('write') || toolName.includes('create') || toolName.includes('update')) {
    return Pencil;
  }
  if (toolName.includes('search') || toolName.includes('query')) {
    return Globe;
  }
  return Wrench;
};

// Format date for display (e.g., "Jan 15, 2025")
const formatDate = (dateString?: string): string => {
  if (!dateString) return 'Unknown';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Unknown';
  }
};

// ============================================================================
// ToolItem Component
// ============================================================================

interface ToolItemProps {
  tool: Tool;
  isLast: boolean;
}

const ToolItem: React.FC<ToolItemProps> = ({ tool, isLast }) => {
  const IconComponent = getToolIcon(tool.name);

  return (
    <div
      className={`flex items-center gap-3 px-3.5 py-3 ${
        !isLast ? 'border-b border-[#E5E5E5]' : ''
      }`}
    >
      {/* Icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#F4F4F5]">
        <IconComponent className="h-3.5 w-3.5 text-[#52525B]" />
      </div>
      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] font-medium text-[#18181B]">{tool.name}</span>
        <span className="text-[11px] font-normal text-[#71717A] truncate">{tool.description}</span>
      </div>
    </div>
  );
};

// ============================================================================
// McpDetailPanel Props
// ============================================================================

export interface McpDetailPanelProps {
  mcp: McpServer | null;
  isOpen: boolean;
  onClose: () => void;
}

// ============================================================================
// McpDetailPanel Component
// ============================================================================

export function McpDetailPanel({ mcp, isOpen, onClose }: McpDetailPanelProps) {
  // ALL HOOKS MUST BE CALLED FIRST - before any conditional returns
  const {
    mcpServers,
    updateMcpIcon,
    updateMcpCategory,
    updateMcpTags,
    updateMcpScope,
    fetchMcpTools,
    fetchingToolsForMcp,
    fetchToolsSuccessMcp,
    usageStats,
  } = useMcpsStore();

  const { categories, tags: appTags, addTag: addGlobalTag } = useAppStore();
  const { scenes } = useScenesStore();

  // Tag input state
  const [tagInputValue, setTagInputValue] = useState('');
  const [isTagInputOpen, setIsTagInputOpen] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Icon Picker state
  const [iconPickerState, setIconPickerState] = useState<{
    isOpen: boolean;
    triggerRef: React.RefObject<HTMLDivElement> | null;
  }>({ isOpen: false, triggerRef: null });

  // Ref for detail header icon
  const detailIconRef = useRef<HTMLDivElement>(null);

  // Get the latest mcp data from store (in case it's updated)
  const selectedMcp = useMemo(
    () => (mcp ? mcpServers.find((m) => m.id === mcp.id) || mcp : null),
    [mcpServers, mcp],
  );

  // Get scenes that use the selected MCP
  const usedInScenes = useMemo(() => {
    if (!selectedMcp) return [];
    return scenes.filter((scene) => scene.mcpIds.includes(selectedMcp.id));
  }, [scenes, selectedMcp]);

  // V2 dual-read: prefer categoryId (canonical), fall back to name lookup
  // for legacy entries. See 03_tech_plan V2 §5.9.
  const currentCategoryId = useMemo(() => {
    if (!selectedMcp) return '';
    if (selectedMcp.categoryId) return selectedMcp.categoryId;
    return categories.find((c) => c.name === selectedMcp.category)?.id ?? '';
  }, [selectedMcp, categories]);

  // Filtered tag suggestions based on input
  const tagSuggestions = useMemo(() => {
    if (!tagInputValue.trim()) return appTags;
    const query = tagInputValue.toLowerCase();
    return appTags.filter(
      (tag) => tag.name.toLowerCase().includes(query) && !selectedMcp?.tags?.includes(tag.name),
    );
  }, [tagInputValue, appTags, selectedMcp?.tags]);

  // Auto-fetch tools when selecting an MCP that has no tools yet
  useEffect(() => {
    if (
      isOpen &&
      selectedMcp &&
      (!selectedMcp.providedTools || selectedMcp.providedTools.length === 0) &&
      fetchingToolsForMcp !== selectedMcp.id
    ) {
      fetchMcpTools(selectedMcp.id, false);
    }
  }, [isOpen, selectedMcp, fetchMcpTools, fetchingToolsForMcp]);

  // Reset state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setTagInputValue('');
      setIsTagInputOpen(false);
      setIconPickerState({ isOpen: false, triggerRef: null });
    }
  }, [isOpen]);

  // Event handlers (these don't use hooks, so they can be after hooks)
  const handleIconClick = (ref: React.RefObject<HTMLDivElement>) => {
    setIconPickerState({ isOpen: true, triggerRef: ref });
  };

  const handleIconChange = (iconName: string) => {
    if (selectedMcp) {
      updateMcpIcon(selectedMcp.id, iconName);
    }
    setIconPickerState({ isOpen: false, triggerRef: null });
  };

  const handleIconPickerClose = () => {
    setIconPickerState({ isOpen: false, triggerRef: null });
  };

  // V2 §5.9: dropdown emits categoryId; resolve id → name for store dual-write.
  const handleCategoryChange = (categoryId: string) => {
    if (!selectedMcp) return;
    const targetName = categoryId ? (categories.find((c) => c.id === categoryId)?.name ?? '') : '';
    updateMcpCategory(selectedMcp.id, targetName);
  };

  const handleAddTag = async (tagName: string) => {
    if (selectedMcp && tagName.trim()) {
      const trimmedName = tagName.trim();

      // Check if tag already exists in appStore
      const existingTag = appTags.find((t) => t.name.toLowerCase() === trimmedName.toLowerCase());

      // If new tag, add to appStore first so it appears in sidebar
      if (!existingTag) {
        try {
          await addGlobalTag(trimmedName);
        } catch (error) {
          console.error('Failed to add tag to global store:', error);
        }
      }

      const newTags = [...(selectedMcp.tags || []), trimmedName];
      updateMcpTags(selectedMcp.id, newTags);
      setTagInputValue('');
      setIsTagInputOpen(false);
    }
  };

  const handleRemoveTag = (tagName: string) => {
    if (selectedMcp) {
      const newTags = selectedMcp.tags.filter((t) => t !== tagName);
      updateMcpTags(selectedMcp.id, newTags);
    }
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // IME guard — CJK candidate Enter must not commit.
    if (isEnterCommit(e) && tagInputValue.trim()) {
      e.preventDefault();
      handleAddTag(tagInputValue);
    } else if (e.key === 'Escape') {
      setIsTagInputOpen(false);
      setTagInputValue('');
    }
  };

  const handleOpenTagInput = () => {
    setIsTagInputOpen(true);
    setTimeout(() => tagInputRef.current?.focus(), 0);
  };

  const handleOpenInFinder = async () => {
    if (selectedMcp?.sourcePath) {
      await safeInvoke('reveal_in_finder', { path: selectedMcp.sourcePath });
    }
  };

  // NOW we can do conditional rendering (after all hooks)
  // If no mcp, render empty SlidePanel to maintain animation
  if (!selectedMcp) {
    return (
      <SlidePanel isOpen={isOpen} onClose={onClose} width={800} header={null}>
        <div />
      </SlidePanel>
    );
  }

  // Get the appropriate icon for the selected MCP
  const SelectedMcpIcon = getMcpIcon(selectedMcp);

  // ============================================================================
  // Detail Panel Header
  // ============================================================================
  const detailHeader = (
    <div className="flex items-center gap-3">
      {/* Icon */}
      <div
        ref={detailIconRef}
        onClick={() => handleIconClick(detailIconRef as React.RefObject<HTMLDivElement>)}
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F4F4F5] cursor-pointer hover:ring-2 hover:ring-[#18181B]/10 transition-shadow"
      >
        <SelectedMcpIcon className="h-5 w-5 text-[#52525B]" />
      </div>
      {/* Title Info */}
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold text-[#18181B]">{selectedMcp.name}</h2>
        <p className="text-xs font-normal text-[#71717A]">{selectedMcp.description}</p>
      </div>
    </div>
  );

  // ============================================================================
  // Detail Panel Content
  // ============================================================================
  const detailContent = (
    <div className="flex flex-col gap-7">
      {/* Info Section */}
      <section className="flex flex-col gap-4">
        {/* Info Row - MCP specific: Installed, Tools, Total Calls, Scenes */}
        <div className="flex gap-8">
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] font-medium text-[#71717A]">Installed</span>
            <span className="text-[13px] font-medium text-[#18181B]">
              {formatDate(selectedMcp?.installedAt)}
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] font-medium text-[#71717A]">Tools</span>
            <span className="text-[13px] font-medium text-[#18181B]">
              {selectedMcp?.providedTools?.length ?? 0} available
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] font-medium text-[#71717A]">Total Calls</span>
            <span className="text-[13px] font-medium text-[#18181B]">
              {(
                usageStats[selectedMcp?.id ?? '']?.total_calls ??
                usageStats[selectedMcp?.name ?? '']?.total_calls ??
                0
              ).toLocaleString()}{' '}
              calls
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] font-medium text-[#71717A]">Scenes</span>
            <span className="text-[13px] font-medium text-[#18181B]">
              {usedInScenes.length} {usedInScenes.length === 1 ? 'scene' : 'scenes'}
            </span>
          </div>
        </div>

        {/* Category Selector */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium text-[#71717A]">Category</span>
          <CategoryTreeDropdown
            categories={categories}
            value={currentCategoryId}
            onChange={handleCategoryChange}
            placeholder="Select category"
            compact
            className="w-40"
          />
        </div>

        {/* Tags */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium text-[#71717A]">Tags</span>
          <div className="flex flex-wrap items-center gap-2">
            {selectedMcp?.tags?.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1.5 rounded-md border border-[#E5E5E5] px-2.5 py-1.5"
              >
                <span className="text-xs font-medium text-[#18181B]">{tag}</span>
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="text-[#A1A1AA] hover:text-[#71717A] transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {isTagInputOpen ? (
              <div className="relative">
                <input
                  ref={tagInputRef}
                  type="text"
                  value={tagInputValue}
                  onChange={(e) => setTagInputValue(e.target.value)}
                  onKeyDown={handleTagInputKeyDown}
                  onBlur={() => {
                    // Delay to allow click on suggestion
                    setTimeout(() => {
                      setIsTagInputOpen(false);
                      setTagInputValue('');
                    }, 150);
                  }}
                  placeholder="Type to search..."
                  className="w-32 rounded-md border border-[#18181B] px-2.5 py-1.5 text-xs font-medium text-[#18181B] outline-none placeholder:text-[#A1A1AA]"
                />
                {/* Suggestions dropdown */}
                {tagInputValue && tagSuggestions.length > 0 && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-[#E5E5E5] bg-white shadow-lg">
                    {tagSuggestions.slice(0, 5).map((tag) => (
                      <button
                        key={tag.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleAddTag(tag.name);
                        }}
                        className="flex w-full items-center px-3 py-2 text-left text-xs font-medium text-[#18181B] hover:bg-[#F4F4F5]"
                      >
                        {tag.name}
                      </button>
                    ))}
                    {/* Option to create new tag if not in suggestions */}
                    {!tagSuggestions.some(
                      (t) => t.name.toLowerCase() === tagInputValue.toLowerCase(),
                    ) && (
                      <button
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleAddTag(tagInputValue);
                        }}
                        className="flex w-full items-center gap-1.5 border-t border-[#E5E5E5] px-3 py-2 text-left text-xs font-medium text-[#71717A] hover:bg-[#F4F4F5]"
                      >
                        <Plus className="h-3 w-3" />
                        Create "{tagInputValue}"
                      </button>
                    )}
                  </div>
                )}
                {/* Show create option when no suggestions */}
                {tagInputValue && tagSuggestions.length === 0 && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-[#E5E5E5] bg-white shadow-lg">
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleAddTag(tagInputValue);
                      }}
                      className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-[#71717A] hover:bg-[#F4F4F5]"
                    >
                      <Plus className="h-3 w-3" />
                      Create "{tagInputValue}"
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={handleOpenTagInput}
                className="flex items-center gap-1 rounded-md border border-[#E5E5E5] px-2.5 py-1.5 text-[#A1A1AA] hover:bg-[#FAFAFA] transition-colors"
              >
                <Plus className="h-3 w-3" />
                <span className="text-xs font-medium">Add</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Provided Tools Section (MCP-specific) */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#18181B]">Provided Tools</h3>
          <button
            onClick={() => fetchMcpTools(selectedMcp.id)}
            disabled={fetchingToolsForMcp === selectedMcp.id}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-200 disabled:opacity-50 ${
              fetchToolsSuccessMcp === selectedMcp.id
                ? 'text-[#22C55E] bg-[#F0FDF4]'
                : 'text-[#71717A] hover:text-[#18181B] hover:bg-[#F4F4F5]'
            }`}
          >
            {fetchingToolsForMcp === selectedMcp.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : fetchToolsSuccessMcp === selectedMcp.id ? (
              <Check className="h-3.5 w-3.5 animate-[scale-in_0.2s_ease-out]" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {fetchToolsSuccessMcp === selectedMcp.id ? 'Done' : 'Fetch'}
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border border-[#E5E5E5]">
          {selectedMcp?.providedTools && selectedMcp.providedTools.length > 0 ? (
            selectedMcp.providedTools.map((tool, index) => (
              <ToolItem
                key={tool.name}
                tool={tool}
                isLast={index === selectedMcp.providedTools.length - 1}
              />
            ))
          ) : (
            <div className="flex items-center gap-3 px-3.5 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#F4F4F5]">
                <Info className="h-3.5 w-3.5 text-[#A1A1AA]" />
              </div>
              <span className="text-[13px] text-[#71717A]">
                No tools detected yet. Click Fetch to discover available tools.
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Source Configuration Section */}
      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-[#18181B]">Source Configuration</h3>
        <div className="overflow-hidden rounded-lg border border-[#E5E5E5]">
          {/* Config Path */}
          <div className="flex items-center gap-3 px-3.5 py-3 border-b border-[#E5E5E5]">
            <span className="w-24 flex-shrink-0 text-xs font-medium text-[#71717A]">
              Config Path
            </span>
            <span className="flex-1 font-mono text-xs text-[#18181B] truncate">
              {selectedMcp.sourcePath}
            </span>
          </div>
          {/* Install Scope */}
          <div
            className={`flex items-center gap-3 px-3.5 py-3${
              selectedMcp.installSource === 'marketplace' && selectedMcp.marketplaceSource
                ? ' border-b border-[#E5E5E5]'
                : ''
            }`}
          >
            <span className="w-24 flex-shrink-0 text-xs font-medium text-[#71717A]">
              Install Scope
            </span>
            <div className="flex-1">
              {selectedMcp.installSource === 'plugin' ? (
                <span className="rounded bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-medium text-[#3B82F6]">
                  Plugin
                </span>
              ) : (
                <ScopeSelector
                  value={selectedMcp.scope}
                  onChange={async (scope) => {
                    await updateMcpScope(selectedMcp.id, scope);
                  }}
                />
              )}
            </div>
          </div>
          {/* From (marketplace source) */}
          {selectedMcp.installSource === 'marketplace' && selectedMcp.marketplaceSource && (
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="w-24 flex-shrink-0 text-xs font-medium text-[#71717A]">From</span>
              <div className="flex-1">
                <MarketplaceSourceBadge source={selectedMcp.marketplaceSource} />
              </div>
            </div>
          )}
        </div>
        {/* Open in Finder Button */}
        <Button variant="secondary" size="small" icon={<FolderOpen />} onClick={handleOpenInFinder}>
          Open in Finder
        </Button>
      </section>

      {/* Used in Scenes Section */}
      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-[#18181B]">Used in Scenes</h3>
        {usedInScenes.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {usedInScenes.map((scene) => (
              <button
                key={scene.id}
                type="button"
                className="flex items-center gap-2 rounded-md border border-[#E5E5E5] px-3.5 py-2 text-xs font-medium text-[#18181B] transition-colors hover:bg-[#FAFAFA]"
              >
                <Layers className="h-3.5 w-3.5 text-[#52525B]" />
                {scene.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-[#E5E5E5] px-3.5 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#F4F4F5]">
              <Layers className="h-3.5 w-3.5 text-[#A1A1AA]" />
            </div>
            <span className="text-[13px] text-[#71717A]">Not used in any scenes yet</span>
          </div>
        )}
      </section>
    </div>
  );

  return (
    <>
      <SlidePanel
        isOpen={isOpen}
        onClose={onClose}
        width={800}
        header={detailHeader}
        headerRight={null}
      >
        {detailContent}
      </SlidePanel>

      {/* Icon Picker */}
      {iconPickerState.triggerRef && (
        <IconPicker
          value={selectedMcp?.icon || 'plug'}
          onChange={handleIconChange}
          triggerRef={iconPickerState.triggerRef}
          isOpen={iconPickerState.isOpen}
          onClose={handleIconPickerClose}
        />
      )}
    </>
  );
}

export default McpDetailPanel;
