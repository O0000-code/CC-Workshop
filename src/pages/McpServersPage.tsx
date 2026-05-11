import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Server,
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
  Download,
  Loader2,
  Info,
  RefreshCw,
  Check,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { PageHeader, SlidePanel } from '@/components/layout';
import {
  EmptyState,
  IconPicker,
  ICON_MAP,
  CategoryTreeDropdown,
  ScopeSelector,
  Button,
  ViewOptionsMenu,
  type ViewOption,
} from '@/components/common';
import { MarketplaceSourceBadge } from '@/components/marketplace/MarketplaceSourceBadge';
import { McpListItem } from '@/components/mcps/McpListItem';
import { ImportMcpModal } from '@/components/modals/ImportMcpModal';
import { useMcpsStore } from '@/stores/mcpsStore';
import { useAppStore } from '@/stores/appStore';
import { useImportStore } from '@/stores/importStore';
import { useScenesStore } from '@/stores/scenesStore';
import { usePluginsStore } from '@/stores/pluginsStore';
import { useSortPreferencesStore } from '@/stores/sortPreferencesStore';
import { safeInvoke } from '@/utils/tauri';
import type { Category, McpServer, Tag, Tool } from '@/types';

// ============================================================================
// Sort + Group options
// ============================================================================
// Plugin-sink is an implicit secondary key in every sort option (see SkillsPage
// for the same pattern + rationale). Group buckets follow sidebar order; see
// SkillsPage `groupSkills` for the parallel implementation rationale.
const MCPS_SORT_OPTIONS: ViewOption[] = [
  { value: 'name', label: 'Name (A → Z)' },
  { value: 'recent', label: 'Recently added' },
  { value: 'used', label: 'Recently used' },
  { value: 'most-used', label: 'Most used' },
];

const MCPS_GROUP_OPTIONS: ViewOption[] = [
  { value: 'none', label: 'None' },
  { value: 'categories', label: 'Categories' },
  { value: 'tags', label: 'Tags' },
];

interface GroupBucket<T> {
  group: { id: string; label: string; count: number } | null;
  items: T[];
}

function groupMcps(
  items: McpServer[],
  groupBy: string,
  categories: Category[],
  appTags: Tag[],
): GroupBucket<McpServer>[] {
  if (groupBy === 'categories') {
    const buckets = new Map<string, McpServer[]>();
    for (const item of items) {
      const key = item.categoryId || '';
      const list = buckets.get(key) ?? [];
      list.push(item);
      buckets.set(key, list);
    }
    const out: GroupBucket<McpServer>[] = [];
    for (const cat of categories) {
      const bucket = buckets.get(cat.id);
      if (bucket && bucket.length > 0) {
        out.push({
          group: { id: cat.id, label: cat.name.toUpperCase(), count: bucket.length },
          items: bucket,
        });
      }
    }
    const uncategorized = buckets.get('') ?? [];
    if (uncategorized.length > 0) {
      out.push({
        group: { id: '__uncategorized__', label: 'UNCATEGORIZED', count: uncategorized.length },
        items: uncategorized,
      });
    }
    return out;
  }
  if (groupBy === 'tags') {
    const buckets = new Map<string, McpServer[]>();
    const untagged: McpServer[] = [];
    for (const item of items) {
      const tags = item.tags ?? [];
      if (tags.length === 0) {
        untagged.push(item);
        continue;
      }
      for (const tagName of tags) {
        const list = buckets.get(tagName) ?? [];
        list.push(item);
        buckets.set(tagName, list);
      }
    }
    const out: GroupBucket<McpServer>[] = [];
    const seen = new Set<string>();
    for (const tag of appTags) {
      const bucket = buckets.get(tag.name);
      if (bucket && bucket.length > 0) {
        out.push({
          group: { id: tag.id, label: tag.name.toUpperCase(), count: bucket.length },
          items: bucket,
        });
        seen.add(tag.name);
      }
    }
    const orphans = Array.from(buckets.keys())
      .filter((name) => !seen.has(name))
      .sort((a, b) => a.localeCompare(b));
    for (const name of orphans) {
      const bucket = buckets.get(name)!;
      out.push({
        group: { id: `__tag__${name}`, label: name.toUpperCase(), count: bucket.length },
        items: bucket,
      });
    }
    if (untagged.length > 0) {
      out.push({
        group: { id: '__untagged__', label: 'UNTAGGED', count: untagged.length },
        items: untagged,
      });
    }
    return out;
  }
  return [{ group: null, items }];
}

function applyMcpsSort(items: McpServer[], sortBy: string): McpServer[] {
  const pluginSink =
    (cmp: (a: McpServer, b: McpServer) => number) => (a: McpServer, b: McpServer) => {
      const aP = a.installSource === 'plugin';
      const bP = b.installSource === 'plugin';
      if (aP !== bP) return aP ? 1 : -1;
      return cmp(a, b);
    };
  const sorted = [...items];
  switch (sortBy) {
    case 'name':
      sorted.sort(pluginSink((a, b) => a.name.localeCompare(b.name)));
      break;
    case 'recent':
      sorted.sort(pluginSink((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')));
      break;
    case 'used':
      sorted.sort(
        pluginSink((a, b) => {
          const ax = a.lastUsed ?? '';
          const bx = b.lastUsed ?? '';
          if (ax && !bx) return -1;
          if (!ax && bx) return 1;
          return bx.localeCompare(ax);
        }),
      );
      break;
    case 'most-used':
      sorted.sort(pluginSink((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0)));
      break;
    default:
      sorted.sort(pluginSink((a, b) => a.name.localeCompare(b.name)));
  }
  return sorted;
}

// ============================================================================
// Icon Mapping and Helper Functions (from McpDetailPage.tsx)
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
  // 优先使用自定义图标
  if (mcp.icon && ICON_MAP[mcp.icon]) {
    return ICON_MAP[mcp.icon];
  }
  // 回退到原有逻辑（根据 category 或默认图标）
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
// ToolItem Component (from McpDetailPage.tsx)
// ============================================================================
// Displays a single tool in the Provided Tools section

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
// McpServersPage Component
// ============================================================================

/**
 * McpServersPage - MCP Servers List Page with Slide Panel
 *
 * Features:
 * - Page header with title, active count badge, and search
 * - List of MCP server items with stats and toggle
 * - Detail panel slides in from right when item is clicked
 * - No route navigation - uses local state for selection
 */
export const McpServersPage: React.FC = () => {
  const {
    mcpServers,
    filter,
    setFilter,
    deleteMcp,
    updateMcpIcon,
    updateMcpCategory,
    updateMcpTags,
    updateMcpScope,
    getFilteredMcps,
    loadMcps,
    fetchMcpTools,
    fetchingToolsForMcp,
    fetchToolsSuccessMcp,
    mcpFetchErrors,
    usageStats,
    loadUsageStats,
    autoClassify,
    isClassifying,
    classifySuccess,
    isFadingOut,
    showRestoreAnimation,
    error,
    clearError,
  } = useMcpsStore();

  const { categories, tags: appTags, addTag: addGlobalTag } = useAppStore();

  const { isMcpsModalOpen, openMcpsModal, closeMcpsModal, isDetectingMcps } = useImportStore();

  const { scenes } = useScenesStore();

  // Selected MCP ID state (replaces route navigation)
  const [selectedMcpId, setSelectedMcpId] = useState<string | null>(null);

  // Marketplace short-cut deep link (task card C6). The ShortcutBanner's
  // "View in MCP Servers →" link drops the user at `/mcp-servers?selected=<id>`;
  // we honor the param on mount, then strip it so refresh-after-close doesn't
  // re-open the panel.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const selected = searchParams.get('selected');
    if (selected) {
      setSelectedMcpId(selected);
      const next = new URLSearchParams(searchParams);
      next.delete('selected');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { loadInstalledPlugins } = usePluginsStore();

  // Load usage stats and plugin enabled status on mount
  useEffect(() => {
    loadUsageStats();
    // Load installed plugins to populate pluginEnabledStatus
    loadInstalledPlugins();
  }, [loadUsageStats, loadInstalledPlugins]);

  const sortBy = useSortPreferencesStore((s) => s.sort.mcps);
  const groupBy = useSortPreferencesStore((s) => s.group.mcps);
  const setSortFor = useSortPreferencesStore((s) => s.setSortFor);
  const setGroupFor = useSortPreferencesStore((s) => s.setGroupFor);

  const baseFilteredMcps = getFilteredMcps();
  const filteredMcps = useMemo(
    () => applyMcpsSort(baseFilteredMcps, sortBy),
    [baseFilteredMcps, sortBy],
  );

  const groupedMcps = useMemo(
    () => groupMcps(filteredMcps, groupBy, categories, appTags),
    [filteredMcps, groupBy, categories, appTags],
  );

  // Status text. Plain mode: "{N} servers · {M} enabled". Group modes shift
  // to "{N} servers across {K} categories|tags" so the count stays honest
  // when an item shows up in multiple buckets (Tags is multi-valued).
  const statusText = useMemo(() => {
    const count = filteredMcps.length;
    const serversLabel = `${count} ${count === 1 ? 'server' : 'servers'}`;
    if (count === 0) return serversLabel;
    if (groupBy === 'tags') {
      const tagBuckets = groupedMcps.filter((b) => b.group && b.group.id !== '__untagged__');
      if (tagBuckets.length === 0) return serversLabel;
      return `${serversLabel} across ${tagBuckets.length} ${
        tagBuckets.length === 1 ? 'tag' : 'tags'
      }`;
    }
    if (groupBy === 'categories') {
      const catBuckets = groupedMcps.filter((b) => b.group && b.group.id !== '__uncategorized__');
      if (catBuckets.length === 0) return serversLabel;
      return `${serversLabel} across ${catBuckets.length} ${
        catBuckets.length === 1 ? 'category' : 'categories'
      }`;
    }
    const enabledCount = filteredMcps.filter((m) => m.enabled).length;
    return `${serversLabel} · ${enabledCount} enabled`;
  }, [filteredMcps, groupBy, groupedMcps]);

  // Get selected MCP data using useMemo
  const selectedMcp = useMemo(
    () => mcpServers.find((mcp) => mcp.id === selectedMcpId) || null,
    [mcpServers, selectedMcpId],
  );

  // Get scenes that use the selected MCP
  const usedInScenes = useMemo(() => {
    if (!selectedMcpId) return [];
    return scenes.filter((scene) => scene.mcpIds.includes(selectedMcpId));
  }, [scenes, selectedMcpId]);

  // Auto-fetch tools when selecting an MCP that has no tools yet
  // Pass false for showSuccessAnimation since this is automatic, not user-initiated
  // Skip HTTP MCPs and MCPs that already failed fetching
  useEffect(() => {
    if (
      selectedMcp &&
      selectedMcp.mcpType !== 'http' &&
      !mcpFetchErrors[selectedMcp.id] &&
      (!selectedMcp.providedTools || selectedMcp.providedTools.length === 0) &&
      fetchingToolsForMcp !== selectedMcp.id
    ) {
      fetchMcpTools(selectedMcp.id, false);
    }
  }, [selectedMcpId, selectedMcp, fetchMcpTools, fetchingToolsForMcp, mcpFetchErrors]);

  // V2 dual-read: prefer categoryId (canonical), fall back to name lookup
  // for legacy entries. See 03_tech_plan V2 §5.9.
  const currentCategoryId = useMemo(() => {
    if (!selectedMcp) return '';
    if (selectedMcp.categoryId) return selectedMcp.categoryId;
    return categories.find((c) => c.name === selectedMcp.category)?.id ?? '';
  }, [selectedMcp, categories]);

  // Tag input state
  const [tagInputValue, setTagInputValue] = useState('');
  const [isTagInputOpen, setIsTagInputOpen] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Filtered tag suggestions based on input
  const tagSuggestions = useMemo(() => {
    if (!tagInputValue.trim()) return appTags;
    const query = tagInputValue.toLowerCase();
    return appTags.filter(
      (tag) => tag.name.toLowerCase().includes(query) && !selectedMcp?.tags?.includes(tag.name),
    );
  }, [tagInputValue, appTags, selectedMcp?.tags]);

  // Icon Picker state
  const [iconPickerState, setIconPickerState] = useState<{
    isOpen: boolean;
    mcpId: string | null;
    triggerRef: React.RefObject<HTMLDivElement> | null;
  }>({ isOpen: false, mcpId: null, triggerRef: null });

  // Ref for detail header icon
  const detailIconRef = useRef<HTMLDivElement>(null);

  const handleSearchChange = (value: string) => {
    setFilter({ search: value });
  };

  // Changed: Set state instead of navigating
  const handleMcpClick = (id: string) => {
    setSelectedMcpId(id);
  };

  // Close detail panel
  const handleCloseDetail = () => {
    setSelectedMcpId(null);
  };

  const handleDelete = (id: string) => {
    deleteMcp(id);
  };

  // Handle icon click
  const handleIconClick = (mcpId: string, ref: React.RefObject<HTMLDivElement>) => {
    setIconPickerState({ isOpen: true, mcpId, triggerRef: ref });
  };

  // Handle icon change
  const handleIconChange = (iconName: string) => {
    if (iconPickerState.mcpId) {
      updateMcpIcon(iconPickerState.mcpId, iconName);
    }
    setIconPickerState({ isOpen: false, mcpId: null, triggerRef: null });
  };

  // Handle icon picker close
  const handleIconPickerClose = () => {
    setIconPickerState({ isOpen: false, mcpId: null, triggerRef: null });
  };

  // V2 §5.9: dropdown emits categoryId; resolve id → name for store dual-write.
  const handleCategoryChange = (categoryId: string) => {
    if (!selectedMcpId) return;
    const targetName = categoryId ? (categories.find((c) => c.id === categoryId)?.name ?? '') : '';
    updateMcpCategory(selectedMcpId, targetName);
  };

  // Handle adding a tag
  const handleAddTag = async (tagName: string) => {
    if (selectedMcpId && selectedMcp && tagName.trim()) {
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
      updateMcpTags(selectedMcpId, newTags);
      setTagInputValue('');
      setIsTagInputOpen(false);
    }
  };

  // Handle removing a tag
  const handleRemoveTag = (tagName: string) => {
    if (selectedMcpId && selectedMcp) {
      const newTags = selectedMcp.tags.filter((t) => t !== tagName);
      updateMcpTags(selectedMcpId, newTags);
    }
  };

  // Handle tag input key down
  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInputValue.trim()) {
      e.preventDefault();
      handleAddTag(tagInputValue);
    } else if (e.key === 'Escape') {
      setIsTagInputOpen(false);
      setTagInputValue('');
    }
  };

  // Open tag input
  const handleOpenTagInput = () => {
    setIsTagInputOpen(true);
    setTimeout(() => tagInputRef.current?.focus(), 0);
  };

  const handleOpenInFinder = async () => {
    if (selectedMcp?.sourcePath) {
      await safeInvoke('reveal_in_finder', { path: selectedMcp.sourcePath });
    }
  };

  // Get the appropriate icon for the selected MCP
  const SelectedMcpIcon = selectedMcp ? getMcpIcon(selectedMcp) : Database;

  // ============================================================================
  // Detail Panel Header (from McpDetailPage.tsx)
  // ============================================================================
  const detailHeader = selectedMcp && (
    <div className="flex items-center gap-3">
      {/* Icon */}
      <div
        ref={detailIconRef}
        onClick={() =>
          handleIconClick(selectedMcp.id, detailIconRef as React.RefObject<HTMLDivElement>)
        }
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
  // Detail Panel Header Right (from McpDetailPage.tsx)
  // ============================================================================
  // 关闭按钮由 SlidePanel 组件提供，不需要额外的 header right 内容
  const detailHeaderRight = null;

  // ============================================================================
  // Detail Panel Content (from McpDetailPage.tsx)
  // ============================================================================
  const detailContent = selectedMcp && (
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
          {selectedMcp.mcpType === 'http' ? (
            <span className="text-[11px] font-normal text-[#A1A1AA]">HTTP MCP</span>
          ) : (
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
          )}
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
          ) : mcpFetchErrors[selectedMcp.id] ? (
            <div className="flex items-center gap-3 px-3.5 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#FEF2F2]">
                <AlertCircle className="h-3.5 w-3.5 text-[#EF4444]" />
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[13px] font-medium text-[#EF4444]">Failed</span>
                <span className="text-[11px] text-[#A1A1AA] truncate">
                  {mcpFetchErrors[selectedMcp.id]}
                </span>
              </div>
            </div>
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

  // Empty state when no MCPs exist
  if (filteredMcps.length === 0 && !filter.search) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader
          title="MCP Servers"
          searchValue={filter.search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="Search servers..."
          actions={
            <div className="flex items-center gap-2.5">
              <Button
                variant="secondary"
                size="small"
                icon={isDetectingMcps ? <Loader2 className="animate-spin" /> : <Download />}
                onClick={() => openMcpsModal()}
                disabled={isDetectingMcps}
              >
                {isDetectingMcps ? 'Detecting...' : 'Import'}
              </Button>
              <Button
                variant="secondary"
                size="small"
                icon={
                  isClassifying ? (
                    <span className="ai-spinner" />
                  ) : classifySuccess ? (
                    <Check
                      className={`classify-success-icon ${isFadingOut ? 'classify-fading-out' : ''}`}
                    />
                  ) : (
                    <Sparkles className={showRestoreAnimation ? 'classify-fade-in' : ''} />
                  )
                }
                onClick={() => autoClassify()}
                disabled={isClassifying || classifySuccess || mcpServers.length === 0}
                className={`w-[132px] ${isClassifying ? 'ai-classifying' : ''} ${classifySuccess ? 'classify-success-bg' : ''} ${isFadingOut ? 'classify-fading-out' : ''}`}
              >
                {isClassifying ? (
                  <span className="ai-classifying-text">Classifying...</span>
                ) : classifySuccess ? (
                  <span
                    className={`ai-classifying-text ${isFadingOut ? 'classify-fading-out' : ''}`}
                  >
                    Done!
                  </span>
                ) : (
                  <span className={showRestoreAnimation ? 'classify-fade-in' : ''}>
                    Auto Classify
                  </span>
                )}
              </Button>
            </div>
          }
        />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={<Server className="h-12 w-12" />}
            title="No MCP servers"
            description="Add servers to extend capabilities"
          />
        </div>

        {/* Import MCP Modal - Must be included in empty state too! */}
        <ImportMcpModal
          isOpen={isMcpsModalOpen}
          onClose={closeMcpsModal}
          onImportComplete={() => {
            loadMcps();
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Page Header */}
      <PageHeader
        title="MCP Servers"
        searchValue={filter.search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search servers..."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              size="small"
              icon={isDetectingMcps ? <Loader2 className="animate-spin" /> : <Download />}
              onClick={() => openMcpsModal()}
              disabled={isDetectingMcps}
            >
              {isDetectingMcps ? 'Detecting...' : 'Import'}
            </Button>
            <Button
              variant="secondary"
              size="small"
              icon={
                isClassifying ? (
                  <span className="ai-spinner" />
                ) : classifySuccess ? (
                  <Check
                    className={`classify-success-icon ${isFadingOut ? 'classify-fading-out' : ''}`}
                  />
                ) : (
                  <Sparkles className={showRestoreAnimation ? 'classify-fade-in' : ''} />
                )
              }
              onClick={() => autoClassify()}
              disabled={isClassifying || classifySuccess || mcpServers.length === 0}
              className={`w-[132px] ${isClassifying ? 'ai-classifying' : ''} ${classifySuccess ? 'classify-success-bg' : ''} ${isFadingOut ? 'classify-fading-out' : ''}`}
            >
              {isClassifying ? (
                <span className="ai-classifying-text">Classifying...</span>
              ) : classifySuccess ? (
                <span className={`ai-classifying-text ${isFadingOut ? 'classify-fading-out' : ''}`}>
                  Done!
                </span>
              ) : (
                <span className={showRestoreAnimation ? 'classify-fade-in' : ''}>
                  Auto Classify
                </span>
              )}
            </Button>
          </div>
        }
      />

      {/* Error notification */}
      {error && (
        <div className="mx-7 mt-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={clearError}
            className="text-sm font-medium text-red-700 hover:text-red-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Area - with shrink animation */}
      <div
        className={`
          flex-1 overflow-y-auto p-6 px-7
          transition-[margin-right] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]
          ${selectedMcpId ? 'mr-[800px]' : ''}
        `}
      >
        {/* Status line — count + context | View Options (Group + Sort) */}
        {filteredMcps.length > 0 && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-[11px] text-[#A1A1AA]">{statusText}</span>
            <ViewOptionsMenu
              sections={[
                {
                  id: 'group',
                  label: 'GROUP BY',
                  options: MCPS_GROUP_OPTIONS,
                  value: groupBy,
                  onChange: (v) => setGroupFor('mcps', v),
                },
                {
                  id: 'sort',
                  label: 'SORT BY',
                  options: MCPS_SORT_OPTIONS,
                  value: sortBy,
                  onChange: (v) => setSortFor('mcps', v),
                },
              ]}
            />
          </div>
        )}

        {/* No results for search */}
        {filteredMcps.length === 0 && filter.search ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<Server className="h-12 w-12" />}
              title="No servers found"
              description={`No servers match "${filter.search}"`}
            />
          </div>
        ) : (
          /* MCP Server List — flat when groupBy === 'none', sectioned
             otherwise. Section header style mirrors the sidebar's
             MARKETPLACE / LIBRARY labels. */
          <div className="flex flex-col">
            {groupedMcps.map((bucket, idx) => (
              <section key={bucket.group?.id ?? '__all__'} className={idx > 0 ? 'mt-7' : ''}>
                {bucket.group && (
                  <header className="mb-3 flex items-baseline gap-1.5">
                    <h3 className="text-[10px] font-semibold uppercase tracking-[0.8px] text-[#A1A1AA]">
                      {bucket.group.label}
                    </h3>
                    <span className="text-[10px] font-semibold tracking-[0.8px] text-[#A1A1AA]">
                      · {bucket.group.count}
                    </span>
                  </header>
                )}
                <div className="flex flex-col gap-3">
                  {bucket.items.map((mcp) => (
                    <McpListItem
                      key={`${bucket.group?.id ?? 'all'}::${mcp.id}`}
                      mcp={mcp}
                      compact={!!selectedMcpId}
                      selected={mcp.id === selectedMcpId}
                      onDelete={handleDelete}
                      onClick={handleMcpClick}
                      onIconClick={(ref) => handleIconClick(mcp.id, ref)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Slide Panel for Detail View */}
      <SlidePanel
        isOpen={!!selectedMcpId}
        onClose={handleCloseDetail}
        width={800}
        header={detailHeader}
        headerRight={detailHeaderRight}
      >
        {detailContent}
      </SlidePanel>

      {/* Icon Picker */}
      {iconPickerState.triggerRef && (
        <IconPicker
          value={mcpServers.find((m) => m.id === iconPickerState.mcpId)?.icon || 'plug'}
          onChange={handleIconChange}
          triggerRef={iconPickerState.triggerRef}
          isOpen={iconPickerState.isOpen}
          onClose={handleIconPickerClose}
        />
      )}

      {/* Import MCP Modal */}
      <ImportMcpModal
        isOpen={isMcpsModalOpen}
        onClose={closeMcpsModal}
        onImportComplete={() => {
          // 刷新 MCPs 列表
          loadMcps();
        }}
      />
    </div>
  );
};

export default McpServersPage;
