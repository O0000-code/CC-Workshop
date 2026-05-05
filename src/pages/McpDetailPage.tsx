import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Database,
  FolderOpen,
  Code,
  MessageSquare,
  Globe,
  FileText,
  Pencil,
  Layers,
  Wrench,
  Info,
} from 'lucide-react';
import { ListDetailLayout } from '@/components/layout/ListDetailLayout';
import { SearchInput, Badge, Button, EmptyState, IconPicker, ICON_MAP } from '@/components/common';
import { McpItemCompact } from '@/components/mcps/McpItem';
import { useMcpsStore } from '@/stores/mcpsStore';
import { useScenesStore } from '@/stores/scenesStore';
import { useAppStore } from '@/stores/appStore';
import { safeInvoke } from '@/utils/tauri';
import { getCategoryDisplayName } from '@/utils/categoryTree';
import { Tool } from '@/types';

// Icon mapping for MCP servers
const iconMap: Record<string, React.ElementType> = {
  Database: Database,
  Development: Code,
  Communication: MessageSquare,
  Research: Globe,
  Productivity: FileText,
  default: FolderOpen,
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

/**
 * McpDetailPage - MCP Server Detail Page
 *
 * Two-column layout with:
 * - List panel (380px): MCP server list with search
 * - Detail panel: Selected server details
 *
 * Detail panel sections:
 * - Info: Tools count, Total Calls, Avg Response
 * - Category & Tags
 * - Provided Tools (MCP-specific)
 * - Source Configuration
 * - Used in Scenes
 */
export const McpDetailPage: React.FC = () => {
  const { id: encodedId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    mcpServers,
    filter,
    setFilter,
    selectMcp,
    deleteMcp,
    updateMcpIcon,
    getFilteredMcps,
    getEnabledCount,
    getSelectedMcp,
    usageStats,
    loadUsageStats,
  } = useMcpsStore();

  const { scenes } = useScenesStore();
  const { categories } = useAppStore();

  // Decode the URL-encoded MCP ID
  const id = encodedId ? decodeURIComponent(encodedId) : null;

  const filteredMcps = getFilteredMcps();
  const enabledCount = getEnabledCount();
  const selectedMcp = getSelectedMcp();

  // Get scenes that use the selected MCP
  const usedInScenes = useMemo(() => {
    if (!id) return [];
    return scenes.filter((scene) => scene.mcpIds.includes(id));
  }, [scenes, id]);

  // Sync URL param with store selection (useEffect is the correct place for side effects)
  useEffect(() => {
    if (id) {
      selectMcp(id);
    }
  }, [id, selectMcp]);

  // Load usage stats on mount
  useEffect(() => {
    loadUsageStats();
  }, [loadUsageStats]);

  const handleSearchChange = (value: string) => {
    setFilter({ search: value });
  };

  const handleMcpClick = (mcpId: string) => {
    navigate(`/mcp-servers/${encodeURIComponent(mcpId)}`);
  };

  const handleDelete = (mcpId: string) => {
    deleteMcp(mcpId);
  };

  // Icon Picker state
  const [iconPickerState, setIconPickerState] = useState<{
    isOpen: boolean;
    mcpId: string | null;
    triggerRef: React.RefObject<HTMLDivElement> | null;
  }>({ isOpen: false, mcpId: null, triggerRef: null });

  // Ref for detail header icon
  const detailIconRef = useRef<HTMLDivElement>(null);

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

  // Handle open in Finder
  const handleOpenInFinder = async () => {
    if (selectedMcp?.sourcePath) {
      await safeInvoke('reveal_in_finder', { path: selectedMcp.sourcePath });
    }
  };

  // List Panel Header
  const listHeader = (
    <>
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-[#18181B]">MCP Servers</h2>
        <Badge variant="status">{enabledCount} active</Badge>
      </div>
      <SearchInput
        value={filter.search}
        onChange={handleSearchChange}
        placeholder="Search servers..."
        className="w-[140px]"
      />
    </>
  );

  // List Panel Content
  const listContent = (
    <div className="flex flex-col gap-1">
      {filteredMcps.map((mcp) => (
        <McpItemCompact
          key={mcp.id}
          mcp={mcp}
          selected={mcp.id === id}
          onDelete={handleDelete}
          onClick={handleMcpClick}
          onIconClick={(ref) => handleIconClick(mcp.id, ref)}
        />
      ))}
      {filteredMcps.length === 0 && (
        <div className="py-8 text-center text-sm text-[#A1A1AA]">No servers found</div>
      )}
    </div>
  );

  // Get the appropriate icon for the selected MCP
  const SelectedMcpIcon = selectedMcp ? getMcpIcon(selectedMcp) : Database;

  // Detail Panel Header (when MCP is selected)
  const detailHeader = selectedMcp && (
    <>
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
      <div className="flex items-center gap-2">
        {/* Edit Button */}
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-md border border-[#E5E5E5] px-3 text-[13px] font-medium text-[#18181B] transition-colors hover:bg-[#FAFAFA]"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
      </div>
    </>
  );

  // Detail Panel Content (when MCP is selected)
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

        {/* Category & Tags */}
        <div className="flex flex-wrap items-center gap-2">
          {/* V2 §5.9 dual-read: prefer categoryId resolution over cached
              `category` name string so renames in the sidebar reflect here
              immediately. Hide the badge entirely when both are empty
              (uncategorized) to match the rest of the app's badge policy. */}
          {(() => {
            const displayName = getCategoryDisplayName(
              selectedMcp.categoryId,
              selectedMcp.category,
              categories,
            );
            return displayName ? (
              <Badge variant="category" color="#18181B">
                {displayName}
              </Badge>
            ) : null;
          })()}
          {selectedMcp?.tags?.map((tag) => (
            <Badge key={tag} variant="tag">
              {tag}
            </Badge>
          ))}
        </div>
      </section>

      {/* Provided Tools Section (MCP-specific) */}
      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-[#18181B]">Provided Tools</h3>
        <div className="overflow-hidden rounded-lg border border-[#E5E5E5]">
          {selectedMcp?.providedTools && selectedMcp.providedTools.length > 0 ? (
            selectedMcp.providedTools.map((tool, index) => (
              <ToolItem
                key={tool.name}
                tool={tool}
                isLast={index === selectedMcp.providedTools!.length - 1}
              />
            ))
          ) : (
            <div className="flex items-center gap-3 px-3.5 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#F4F4F5]">
                <Info className="h-3.5 w-3.5 text-[#A1A1AA]" />
              </div>
              <span className="text-[13px] text-[#71717A]">No tools detected yet</span>
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
          <div className="flex items-center gap-3 px-3.5 py-3">
            <span className="w-24 flex-shrink-0 text-xs font-medium text-[#71717A]">
              Install Scope
            </span>
            <div className="flex-1">
              {selectedMcp.installSource === 'plugin' ? (
                <span className="rounded bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-medium text-[#3B82F6]">
                  Plugin
                </span>
              ) : (
                <span className="rounded bg-[#EEF2FF] px-2 py-1 text-[10px] font-semibold text-[#4F46E5]">
                  User
                </span>
              )}
            </div>
          </div>
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

  // Empty detail state
  const emptyDetail = (
    <EmptyState
      icon={<Database className="h-12 w-12" />}
      title="Select an MCP server"
      description="Choose a server from the list to view details"
    />
  );

  return (
    <>
      <ListDetailLayout
        listWidth={380}
        listHeader={listHeader}
        listContent={listContent}
        detailHeader={detailHeader}
        detailContent={detailContent}
        emptyDetail={emptyDetail}
      />

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
    </>
  );
};

// ============================================================================
// ToolItem Component
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

export default McpDetailPage;
