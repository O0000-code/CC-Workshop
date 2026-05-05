import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Sparkles,
  Plug,
  Search,
  CheckSquare,
  Check,
  ChevronDown,
  ChevronRight,
  Code,
  Database,
  Globe,
  FileCode,
  Zap,
  FileText,
} from 'lucide-react';
import { Skill, McpServer } from '@/types';
import { Dropdown, type DropdownOption } from '@/components/common/Dropdown';
import { usePluginsStore } from '@/stores/pluginsStore';
import { useScenesStore } from '@/stores/scenesStore';
import { useClaudeMdStore } from '@/stores/claudeMdStore';
import { useAppStore } from '@/stores/appStore';
import { flattenTree } from '@/components/sidebar/dnd/treeUtilities';

// ============================================================================
// Types
// ============================================================================

interface SceneData {
  name: string;
  description: string;
  skillIds: string[];
  mcpIds: string[];
  claudeMdIds?: string[];
}

interface CreateSceneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateScene: (scene: SceneData) => void;
  onUpdateScene?: (id: string, scene: SceneData) => void;
  skills: Skill[];
  mcpServers: McpServer[];
  /** Scene to edit - when provided, modal opens in edit mode */
  initialScene?: {
    id: string;
    name: string;
    description: string;
    skillIds: string[];
    mcpIds: string[];
    claudeMdIds?: string[];
  };
}

type TabType = 'skills' | 'mcps' | 'claudeMd';

// ============================================================================
// Icon Mapping for Skills/MCPs
// ============================================================================

const skillIconMap: Record<string, React.FC<{ className?: string }>> = {
  Development: Code,
  Design: Zap,
  Research: Globe,
  Productivity: FileCode,
  default: Sparkles,
};

const mcpIconMap: Record<string, React.FC<{ className?: string }>> = {
  Development: Code,
  Research: Globe,
  default: Database,
};

const getSkillIcon = (category: string) => skillIconMap[category] || skillIconMap.default;
const getMcpIcon = (category: string) => mcpIconMap[category] || mcpIconMap.default;

// ============================================================================
// Checkbox Item Component
// ============================================================================

interface CheckableItemProps {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  selected: boolean;
  type: 'skill' | 'mcp';
  onToggle: (id: string) => void;
  disabled?: boolean;
  disabledReason?: string;
}

const CheckableItem: React.FC<CheckableItemProps> = ({
  id,
  name,
  description,
  category,
  tags,
  selected,
  type,
  onToggle,
  disabled = false,
}) => {
  const IconComponent = type === 'skill' ? getSkillIcon(category) : getMcpIcon(category);
  const [showTooltip, setShowTooltip] = useState(false);

  const handleClick = () => {
    if (!disabled) {
      onToggle(id);
    }
  };

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => disabled && setShowTooltip(true)}
      onMouseLeave={() => disabled && setShowTooltip(false)}
      className={`
        relative
        flex
        items-center
        gap-3.5
        rounded-lg
        border
        px-4
        py-3.5
        transition-colors
        ${
          disabled
            ? 'cursor-not-allowed border-[#E5E5E5] bg-white'
            : selected
              ? 'cursor-pointer border-[#E5E5E5] bg-[#FAFAFA]'
              : 'cursor-pointer border-[#E5E5E5] bg-white hover:bg-[#FAFAFA]'
        }
      `}
    >
      {/* Tooltip for disabled items - shows on hover anywhere on the item */}
      {disabled && showTooltip && (
        <div
          className="absolute left-1/2 -translate-x-1/2 flex flex-col gap-0.5 rounded-[6px] py-2 px-3 shadow-lg"
          style={{
            width: '244px',
            zIndex: 9999,
            bottom: 'calc(100% + 8px)',
            backgroundColor: '#18181B',
          }}
        >
          <span className="text-[12px] font-medium text-white">Already globally enabled</span>
          <span
            className="text-[11px] font-normal leading-normal text-[#A1A1AA]"
            style={{ width: '220px' }}
          >
            This {type === 'skill' ? 'skill' : 'MCP'} is enabled via plugin and is already active in
            all projects.
          </span>
        </div>
      )}

      {/* Checkbox */}
      <div
        className={`
          flex
          h-5
          w-5
          flex-shrink-0
          items-center
          justify-center
          rounded
          transition-colors
          ${disabled ? 'bg-[#F4F4F5]' : selected ? 'bg-[#18181B]' : 'border-2 border-[#D4D4D4]'}
        `}
      >
        {selected && !disabled && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
      </div>

      {/* Icon Container */}
      <div
        className={`
          flex
          h-9
          w-9
          flex-shrink-0
          items-center
          justify-center
          rounded-lg
          ${disabled ? 'bg-[#FAFAFA]' : selected ? 'bg-white' : 'bg-[#FAFAFA]'}
        `}
      >
        <IconComponent
          className={`h-[18px] w-[18px] ${disabled ? 'text-[#A1A1AA]' : selected ? 'text-[#18181B]' : 'text-[#52525B]'}`}
        />
      </div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Name row */}
        <span
          className={`
            text-[13px]
            ${disabled ? 'font-medium text-[#A1A1AA]' : selected ? 'font-semibold text-[#18181B]' : 'font-medium text-[#18181B]'}
          `}
        >
          {name}
        </span>
        <span
          className={`
            truncate text-xs font-normal
            ${disabled ? 'text-[#D4D4D8]' : selected ? 'text-[#52525B]' : 'text-[#71717A]'}
          `}
        >
          {description}
        </span>
      </div>

      {/* Tags */}
      <div className="flex flex-shrink-0 items-center gap-1.5">
        {tags.slice(0, 2).map((tag, index) => (
          <span
            key={tag}
            className={`
              rounded
              px-2
              py-[3px]
              text-[10px]
              font-medium
              ${
                disabled
                  ? 'bg-[#FAFAFA] text-[#D4D4D8]'
                  : selected && index === 0
                    ? 'bg-white text-[#18181B]'
                    : 'bg-[#FAFAFA] text-[#52525B]'
              }
            `}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// Selected Item Component
// ============================================================================

interface SelectedItemProps {
  id: string;
  name: string;
  type: 'skill' | 'mcp' | 'claudeMd';
  onRemove: (id: string) => void;
}

const SelectedItem: React.FC<SelectedItemProps> = ({ id, name, type, onRemove }) => {
  const isSkill = type === 'skill';
  const isMcp = type === 'mcp';

  return (
    <div className="flex items-center justify-between rounded-md border border-[#E5E5E5] bg-white px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        {/* Icon */}
        <div
          className={`
            flex
            h-6
            w-6
            items-center
            justify-center
            rounded
            ${isSkill ? 'bg-[#F4F4F5]' : isMcp ? 'bg-[#DCFCE7]' : 'bg-[#E0E7FF]'}
          `}
        >
          {isSkill ? (
            <Sparkles className="h-3 w-3 text-[#18181B]" />
          ) : isMcp ? (
            <Plug className="h-3 w-3 text-[#16A34A]" />
          ) : (
            <FileText className="h-3 w-3 text-[#4F46E5]" />
          )}
        </div>
        <span className="text-xs font-medium text-[#18181B]">{name}</span>
      </div>

      {/* Remove Button */}
      <button
        onClick={() => onRemove(id)}
        className="flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-[#FEE2E2] group"
      >
        <X className="h-3 w-3 text-[#A1A1AA] group-hover:text-[#DC2626]" />
      </button>
    </div>
  );
};

// ============================================================================
// Collapsible Group Component
// ============================================================================

interface CollapsibleGroupProps {
  title: string;
  count: number;
  icon: React.ReactNode;
  iconColor?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const CollapsibleGroup: React.FC<CollapsibleGroupProps> = ({
  title,
  count,
  icon,
  children,
  defaultOpen = true,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2 text-left">
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-[#71717A]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-[#71717A]" />
        )}
        {icon}
        <span className="text-xs font-semibold text-[#18181B]">{title}</span>
        <span className="text-xs font-normal text-[#71717A]">({count})</span>
      </button>

      {/* Content */}
      {isOpen && <div className="flex flex-col gap-1.5 pl-5">{children}</div>}
    </div>
  );
};

// ============================================================================
// CreateSceneModal Component
// ============================================================================

export const CreateSceneModal: React.FC<CreateSceneModalProps> = ({
  isOpen,
  onClose,
  onCreateScene,
  onUpdateScene,
  skills,
  mcpServers,
  initialScene,
}) => {
  // Determine if we're in edit mode
  const isEditMode = !!initialScene;

  // Plugin state for filtering
  const { pluginEnabledStatus, loadInstalledPlugins } = usePluginsStore();

  // CLAUDE.md state from stores
  const { getDistributableClaudeMd } = useScenesStore();
  const { files: claudeMdFiles, loadFiles: loadClaudeMdFiles } = useClaudeMdStore();
  // V2 [P0-DATA-4]: categoryFilter is keyed by `categoryId` (D1=A migration),
  // not by category name. With hierarchical categories, two children of
  // different parents could share a name ("Tools/Web" vs "Research/Web") —
  // filtering by name would silently merge their content. The full category
  // list is read here so we can build hierarchy-aware options + map back
  // selected ids → name for display.
  const { categories: allCategories } = useAppStore();

  // Local state - initialize with initialScene values if in edit mode
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('skills');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [selectedMcpIds, setSelectedMcpIds] = useState<string[]>([]);
  // Single select for CLAUDE.md - a Scene can have at most one CLAUDE.md
  const [selectedClaudeMdId, setSelectedClaudeMdId] = useState<string | null>(null);

  // Reset form when modal opens or initialScene changes
  useEffect(() => {
    if (isOpen) {
      if (initialScene) {
        setName(initialScene.name);
        setDescription(initialScene.description);
        setSelectedSkillIds(initialScene.skillIds || []);
        setSelectedMcpIds(initialScene.mcpIds || []);
        // Take the first CLAUDE.md ID if exists (single select)
        setSelectedClaudeMdId(initialScene.claudeMdIds?.[0] || null);
      } else {
        setName('');
        setDescription('');
        setSelectedSkillIds([]);
        setSelectedMcpIds([]);
        setSelectedClaudeMdId(null);
      }
      setActiveTab('skills');
      setSearchQuery('');
      setCategoryFilter('');
      setTagFilter([]);
    }
  }, [isOpen, initialScene]);

  // Get distributable CLAUDE.md files (exclude global ones)
  const distributableClaudeMd = useMemo(() => getDistributableClaudeMd(), [claudeMdFiles]);

  // Load plugin status and CLAUDE.md files when modal opens
  useEffect(() => {
    if (isOpen) {
      loadInstalledPlugins();
      loadClaudeMdFiles();
    }
  }, [isOpen, loadInstalledPlugins, loadClaudeMdFiles]);

  // Check if a Skill should be disabled (from an enabled plugin)
  const isSkillDisabled = useCallback(
    (skill: Skill): boolean => {
      if (skill.installSource !== 'plugin') return false;
      if (!skill.pluginId) return false;
      return pluginEnabledStatus[skill.pluginId] === true;
    },
    [pluginEnabledStatus],
  );

  // Check if an MCP should be disabled (from an enabled plugin)
  const isMcpDisabled = useCallback(
    (mcp: McpServer): boolean => {
      if (mcp.installSource !== 'plugin') return false;
      if (!mcp.pluginId) return false;
      return pluginEnabledStatus[mcp.pluginId] === true;
    },
    [pluginEnabledStatus],
  );

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // V2 [P0-DATA-4]: Build hierarchy-aware category filter options keyed by
  // `categoryId`. Renders only roots (and their children) that actually
  // appear in the current items, so the dropdown stays compact. Falls back
  // to legacy name-based grouping for items whose `categoryId` is still
  // empty (pre-migration data); these surface as a flat "name-only"
  // synthetic option set after the hierarchy block.
  //
  // Why categoryId rather than name (per `_v2_patch_plan` §3.3 +
  // 03_tech_plan V2 §5.9 row 7): with depth-2 hierarchy, sibling roots
  // ("Tools" vs "Research") may each have a child literally named "Web".
  // A name-keyed filter merges them into a single "Web" line that selects
  // both subtrees' contents — D7=A's "self + descendants" semantic is
  // bypassed and the user sees content they didn't ask for.
  const categories = useMemo<DropdownOption[]>(() => {
    const items = activeTab === 'skills' ? skills : mcpServers;

    // Index items by categoryId for fast count and "used" detection.
    const byCategoryId = new Map<string, number>();
    const legacyByName = new Map<string, number>(); // items with no categoryId
    for (const item of items) {
      if (item.categoryId) {
        byCategoryId.set(item.categoryId, (byCategoryId.get(item.categoryId) ?? 0) + 1);
      } else if (item.category) {
        legacyByName.set(item.category, (legacyByName.get(item.category) ?? 0) + 1);
      }
    }

    // Hierarchy block — flatten all categories, then keep only those that
    // either contain items themselves or have a descendant with items
    // (so an empty-but-parent-of-used category still shows for context).
    const allRootIds = new Set(allCategories.filter((c) => !c.parentId).map((c) => c.id));
    const fullFlat = flattenTree(allCategories, allRootIds);

    const usedRoots = new Set<string>();
    for (const cat of fullFlat) {
      if (byCategoryId.has(cat.id)) {
        // Walk up to root and mark.
        let cursor: string | null = cat.id;
        while (cursor) {
          usedRoots.add(cursor);
          const parent = allCategories.find((c) => c.id === cursor);
          cursor = parent?.parentId ?? null;
        }
      }
    }

    const opts: DropdownOption[] = [];
    for (const cat of fullFlat) {
      if (!usedRoots.has(cat.id)) continue;
      // Count = items directly in this category. Aggregation (D8=B)
      // happens at filter time below — the dropdown badge shows direct
      // count to avoid double-counting in a flat picker.
      const count = byCategoryId.get(cat.id) ?? 0;
      opts.push({
        value: cat.id,
        label: cat.name,
        count: count > 0 ? count : undefined,
        indent: cat.depth,
      });
    }

    // Legacy fallback — entries that have only a name string. These ride
    // at the bottom with `__legacy:` prefix on `value` so the filter logic
    // can route them back to a name match without colliding with real ids.
    if (legacyByName.size > 0) {
      // Skip names that already resolve to one of the rendered ids — the
      // skill/mcp will appear under the resolved id when re-scanned.
      const resolvedNames = new Set(
        Array.from(byCategoryId.keys())
          .map((id) => allCategories.find((c) => c.id === id)?.name)
          .filter((n): n is string => !!n),
      );
      for (const [name, count] of legacyByName) {
        if (resolvedNames.has(name)) continue;
        opts.push({ value: `__legacy:${name}`, label: name, count, indent: 0 });
      }
    }

    return opts;
  }, [activeTab, skills, mcpServers, allCategories]);

  const tags = useMemo(() => {
    const items = activeTab === 'skills' ? skills : mcpServers;
    const allTags = items.flatMap((item) => item.tags);
    const tagCounts = allTags.reduce(
      (acc, tag) => {
        acc[tag] = (acc[tag] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    return Object.entries(tagCounts).map(([tag, count]) => ({
      value: tag,
      label: tag,
      count,
    }));
  }, [activeTab, skills, mcpServers]);

  // V2 [P0-DATA-4]: precompute the categoryId set the filter accepts.
  // When the user picks a parent, we expand to the parent + all
  // descendants (D7=A semantic). When the user picks a child, we keep
  // just that id. Legacy `__legacy:<name>` filter values fall through to
  // a direct `item.category === name && item.categoryId === undefined`
  // check below.
  const categoryFilterIds = useMemo<Set<string> | null>(() => {
    if (!categoryFilter) return null;
    if (categoryFilter.startsWith('__legacy:')) return null;
    const ids = new Set<string>([categoryFilter]);
    // Walk descendants of categoryFilter (max depth = 2 → one level deep
    // at most, per `02_design_spec` §6.5).
    for (const c of allCategories) {
      if (c.parentId === categoryFilter) ids.add(c.id);
    }
    return ids;
  }, [categoryFilter, allCategories]);

  // Filter and sort items (disabled items at bottom)
  const filteredItems = useMemo(() => {
    const items = activeTab === 'skills' ? skills : mcpServers;
    const filtered = items.filter((item) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !item.name.toLowerCase().includes(query) &&
          !item.description.toLowerCase().includes(query)
        ) {
          return false;
        }
      }

      // V2 [P0-DATA-4] Category filter — id-based with hierarchy expansion.
      if (categoryFilter) {
        if (categoryFilter.startsWith('__legacy:')) {
          // Legacy name-only path — accept items with no categoryId whose
          // cached `category` matches the legacy name.
          const legacyName = categoryFilter.slice('__legacy:'.length);
          if (item.categoryId || item.category !== legacyName) return false;
        } else {
          // Hierarchical id path — accept items whose categoryId is in
          // the expanded set (parent + descendants per D7=A). If the item
          // has no categoryId yet (legacy data), fall back to name match
          // so pre-migration entries don't disappear from the picker
          // unfairly.
          if (categoryFilterIds && categoryFilterIds.size > 0) {
            const matchesId = item.categoryId ? categoryFilterIds.has(item.categoryId) : false;
            const matchesNameFallback =
              !item.categoryId &&
              !!item.category &&
              Array.from(categoryFilterIds).some(
                (id) => allCategories.find((c) => c.id === id)?.name === item.category,
              );
            if (!matchesId && !matchesNameFallback) return false;
          }
        }
      }

      // Tag filter
      if (tagFilter.length > 0) {
        const hasTag = tagFilter.some((tag) => item.tags.includes(tag));
        if (!hasTag) return false;
      }

      return true;
    });

    // Sort: enabled items first, disabled items at bottom
    return filtered.sort((a, b) => {
      const aDisabled =
        activeTab === 'skills' ? isSkillDisabled(a as Skill) : isMcpDisabled(a as McpServer);
      const bDisabled =
        activeTab === 'skills' ? isSkillDisabled(b as Skill) : isMcpDisabled(b as McpServer);

      if (aDisabled === bDisabled) return 0;
      return aDisabled ? 1 : -1;
    });
  }, [
    activeTab,
    skills,
    mcpServers,
    searchQuery,
    categoryFilter,
    categoryFilterIds,
    tagFilter,
    isSkillDisabled,
    isMcpDisabled,
    allCategories,
  ]);

  // Selection handlers
  const handleToggleSkill = useCallback((id: string) => {
    setSelectedSkillIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const handleToggleMcp = useCallback((id: string) => {
    setSelectedMcpIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const handleSelectAll = useCallback(() => {
    if (activeTab === 'skills') {
      // Filter out disabled skills
      const selectableItems = filteredItems.filter((item) => !isSkillDisabled(item as Skill));
      const selectableIds = selectableItems.map((item) => item.id);
      const allSelected = selectableIds.every((id) => selectedSkillIds.includes(id));
      if (allSelected) {
        setSelectedSkillIds((prev) => prev.filter((id) => !selectableIds.includes(id)));
      } else {
        setSelectedSkillIds((prev) => [...new Set([...prev, ...selectableIds])]);
      }
    } else {
      // Filter out disabled MCPs
      const selectableItems = filteredItems.filter((item) => !isMcpDisabled(item as McpServer));
      const selectableIds = selectableItems.map((item) => item.id);
      const allSelected = selectableIds.every((id) => selectedMcpIds.includes(id));
      if (allSelected) {
        setSelectedMcpIds((prev) => prev.filter((id) => !selectableIds.includes(id)));
      } else {
        setSelectedMcpIds((prev) => [...new Set([...prev, ...selectableIds])]);
      }
    }
  }, [activeTab, filteredItems, selectedSkillIds, selectedMcpIds, isSkillDisabled, isMcpDisabled]);

  const handleClearAll = useCallback(() => {
    setSelectedSkillIds([]);
    setSelectedMcpIds([]);
    setSelectedClaudeMdId(null);
  }, []);

  // CLAUDE.md selection handler (single select - toggle behavior)
  const handleToggleClaudeMd = useCallback((id: string) => {
    setSelectedClaudeMdId((prev) => (prev === id ? null : id));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!name.trim()) return;
    const sceneData = {
      name: name.trim(),
      description: description.trim(),
      skillIds: selectedSkillIds,
      mcpIds: selectedMcpIds,
      // Convert single selection to array for backend compatibility
      claudeMdIds: selectedClaudeMdId ? [selectedClaudeMdId] : [],
    };

    if (isEditMode && initialScene && onUpdateScene) {
      onUpdateScene(initialScene.id, sceneData);
    } else {
      onCreateScene(sceneData);
    }
    onClose();
  }, [
    name,
    description,
    selectedSkillIds,
    selectedMcpIds,
    selectedClaudeMdId,
    onCreateScene,
    onUpdateScene,
    onClose,
    isEditMode,
    initialScene,
  ]);

  // Get selected items for display
  const selectedSkills = useMemo(
    () => skills.filter((s) => selectedSkillIds.includes(s.id)),
    [skills, selectedSkillIds],
  );

  const selectedMcps = useMemo(
    () => mcpServers.filter((m) => selectedMcpIds.includes(m.id)),
    [mcpServers, selectedMcpIds],
  );

  // Get the selected CLAUDE.md file (single select)
  const selectedClaudeMdFile = useMemo(
    () =>
      selectedClaudeMdId ? claudeMdFiles.find((f) => f.id === selectedClaudeMdId) || null : null,
    [claudeMdFiles, selectedClaudeMdId],
  );

  if (!isOpen) return null;

  const modalContent = (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div
        className="relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-[0_25px_50px_rgba(0,0,0,0.1)]"
        style={{ maxWidth: '1280px', height: '820px' }}
      >
        {/* Modal Header */}
        <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-[#E5E5E5] px-7">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-[#18181B]">
              {isEditMode ? 'Edit Scene' : 'Create New Scene'}
            </h2>
            <p className="text-[13px] font-normal text-[#71717A]">
              Configure skills and MCP servers for this development context
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-[#F4F4F5]"
          >
            <X className="h-5 w-5 text-[#71717A]" />
          </button>
        </div>

        {/* Modal Body - Three Column Layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - Basic Info */}
          <div className="flex w-80 flex-shrink-0 flex-col border-r border-[#E5E5E5]">
            <div className="flex flex-1 flex-col gap-6 p-6">
              {/* Basic Information Section */}
              <div className="flex flex-col gap-5">
                <h3 className="text-sm font-semibold text-[#18181B]">Basic Information</h3>

                {/* Name Input */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[#52525B]">Scene Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter scene name..."
                    className="h-10 rounded-md border border-[#E5E5E5] bg-white px-3 text-[13px] text-[#18181B] placeholder:text-[#A1A1AA] focus:border-[#18181B] focus:outline-none"
                  />
                </div>

                {/* Description Input */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[#52525B]">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe this scene..."
                    className="h-20 resize-none rounded-md border border-[#E5E5E5] bg-white p-3 text-xs leading-relaxed text-[#18181B] placeholder:text-[#A1A1AA] focus:border-[#18181B] focus:outline-none"
                  />
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-[#E4E4E7]" />

              {/* Selection Summary */}
              <div className="flex flex-col gap-4">
                <h3 className="text-sm font-semibold text-[#18181B]">Selection Summary</h3>

                {/* Summary Items */}
                <div className="flex flex-col gap-3">
                  {/* Skills */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[#71717A]" />
                      <span className="text-[13px] font-normal text-[#52525B]">Skills</span>
                    </div>
                    <span className="rounded bg-[#F4F4F5] px-2.5 py-1 text-xs font-medium text-[#18181B]">
                      {selectedSkillIds.length} selected
                    </span>
                  </div>

                  {/* MCPs */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Plug className="h-4 w-4 text-[#71717A]" />
                      <span className="text-[13px] font-normal text-[#52525B]">MCP Servers</span>
                    </div>
                    <span
                      className={`rounded px-2.5 py-1 text-xs font-medium ${
                        selectedMcpIds.length > 0
                          ? 'bg-[#DCFCE7] text-[#16A34A]'
                          : 'bg-[#F4F4F5] text-[#18181B]'
                      }`}
                    >
                      {selectedMcpIds.length} selected
                    </span>
                  </div>

                  {/* CLAUDE.md */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-[#71717A]" />
                      <span className="text-[13px] font-normal text-[#52525B]">CLAUDE.md</span>
                    </div>
                    <span
                      className={`rounded px-2.5 py-1 text-xs font-medium ${
                        selectedClaudeMdId
                          ? 'bg-[#E0E7FF] text-[#4F46E5]'
                          : 'bg-[#F4F4F5] text-[#18181B]'
                      }`}
                    >
                      {selectedClaudeMdId ? '1 selected' : '0 selected'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Action Buttons */}
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleSubmit}
                  disabled={!name.trim()}
                  className="flex h-11 items-center justify-center rounded-lg bg-[#18181B] text-sm font-medium text-white transition-colors hover:bg-[#27272A] disabled:cursor-not-allowed disabled:bg-[#18181B]/50"
                >
                  {isEditMode ? 'Save Changes' : 'Create Scene'}
                </button>
                <button
                  onClick={onClose}
                  className="flex h-11 items-center justify-center rounded-lg border border-[#E5E5E5] text-sm font-medium text-[#71717A] transition-colors hover:bg-[#F4F4F5]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>

          {/* Center Panel - Selection */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Center Header */}
            <div className="flex flex-col gap-4 border-b border-[#E5E5E5] px-6 py-4">
              {/* Tabs */}
              <div className="flex items-center">
                {/* Skills Tab */}
                <button
                  onClick={() => setActiveTab('skills')}
                  className={`flex items-center gap-2 px-5 py-2.5 ${
                    activeTab === 'skills'
                      ? 'border-b-2 border-[#18181B]'
                      : 'border-b-2 border-transparent'
                  }`}
                >
                  <Sparkles
                    className={`h-4 w-4 ${
                      activeTab === 'skills' ? 'text-[#18181B]' : 'text-[#71717A]'
                    }`}
                  />
                  <span
                    className={`text-[13px] ${
                      activeTab === 'skills'
                        ? 'font-semibold text-[#18181B]'
                        : 'font-normal text-[#71717A]'
                    }`}
                  >
                    Skills
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      activeTab === 'skills'
                        ? 'bg-[#FAFAFA] text-[#52525B]'
                        : 'bg-[#FAFAFA] text-[#71717A]'
                    }`}
                  >
                    {skills.length}
                  </span>
                </button>

                {/* MCP Servers Tab */}
                <button
                  onClick={() => setActiveTab('mcps')}
                  className={`flex items-center gap-2 px-5 py-2.5 ${
                    activeTab === 'mcps'
                      ? 'border-b-2 border-[#18181B]'
                      : 'border-b-2 border-transparent'
                  }`}
                >
                  <Plug
                    className={`h-4 w-4 ${
                      activeTab === 'mcps' ? 'text-[#18181B]' : 'text-[#71717A]'
                    }`}
                  />
                  <span
                    className={`text-[13px] ${
                      activeTab === 'mcps'
                        ? 'font-semibold text-[#18181B]'
                        : 'font-normal text-[#71717A]'
                    }`}
                  >
                    MCP Servers
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      activeTab === 'mcps'
                        ? 'bg-[#FAFAFA] text-[#52525B]'
                        : 'bg-[#FAFAFA] text-[#71717A]'
                    }`}
                  >
                    {mcpServers.length}
                  </span>
                </button>

                {/* CLAUDE.md Tab */}
                <button
                  onClick={() => setActiveTab('claudeMd')}
                  className={`flex items-center gap-2 px-5 py-2.5 ${
                    activeTab === 'claudeMd'
                      ? 'border-b-2 border-[#18181B]'
                      : 'border-b-2 border-transparent'
                  }`}
                >
                  <FileText
                    className={`h-4 w-4 ${
                      activeTab === 'claudeMd' ? 'text-[#18181B]' : 'text-[#71717A]'
                    }`}
                  />
                  <span
                    className={`text-[13px] ${
                      activeTab === 'claudeMd'
                        ? 'font-semibold text-[#18181B]'
                        : 'font-normal text-[#71717A]'
                    }`}
                  >
                    CLAUDE.md
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      activeTab === 'claudeMd'
                        ? 'bg-[#FAFAFA] text-[#52525B]'
                        : 'bg-[#FAFAFA] text-[#71717A]'
                    }`}
                  >
                    {distributableClaudeMd.length}
                  </span>
                </button>
              </div>

              {/* Filters Row */}
              <div className="flex items-center gap-3">
                {/* Search */}
                <div className="flex flex-1 items-center gap-2.5 rounded-lg border border-[#E5E5E5] bg-white px-3.5 h-10">
                  <Search className="h-4 w-4 flex-shrink-0 text-[#A1A1AA]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={`Search ${activeTab === 'skills' ? 'skills' : activeTab === 'mcps' ? 'MCP servers' : 'CLAUDE.md files'}...`}
                    className="flex-1 bg-transparent text-[13px] text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none"
                  />
                </div>

                {/* Category Filter */}
                <Dropdown
                  options={[{ value: '', label: 'All Categories' }, ...categories]}
                  value={categoryFilter}
                  onChange={(val) => setCategoryFilter(val as string)}
                  placeholder="Category"
                  compact
                  triggerClassName="w-[140px]"
                />

                {/* Tag Filter */}
                <Dropdown
                  options={tags}
                  value={tagFilter}
                  onChange={(val) => setTagFilter(val as string[])}
                  placeholder="Tags"
                  multiple
                  searchable
                  compact
                  triggerClassName="w-[120px]"
                />

                {/* All Button */}
                <button
                  onClick={handleSelectAll}
                  className="flex h-10 items-center gap-1.5 rounded-lg bg-[#FAFAFA] px-3.5 text-xs font-medium text-[#52525B] transition-colors hover:bg-[#F4F4F5]"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  All
                </button>
              </div>
            </div>

            {/* Center Content - Checkable List */}
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex flex-col gap-2">
                {/* Skills and MCPs list */}
                {(activeTab === 'skills' || activeTab === 'mcps') && (
                  <>
                    {filteredItems.map((item) => {
                      const disabled =
                        activeTab === 'skills'
                          ? isSkillDisabled(item as Skill)
                          : isMcpDisabled(item as McpServer);
                      const disabledReason = disabled
                        ? `此 ${activeTab === 'skills' ? 'Skill' : 'MCP'} 由已启用的插件提供，全局已生效，无需添加到场景`
                        : undefined;

                      return (
                        <CheckableItem
                          key={item.id}
                          id={item.id}
                          name={item.name}
                          description={item.description}
                          category={item.category}
                          tags={item.tags}
                          selected={
                            activeTab === 'skills'
                              ? selectedSkillIds.includes(item.id)
                              : selectedMcpIds.includes(item.id)
                          }
                          type={activeTab === 'skills' ? 'skill' : 'mcp'}
                          onToggle={activeTab === 'skills' ? handleToggleSkill : handleToggleMcp}
                          disabled={disabled}
                          disabledReason={disabledReason}
                        />
                      );
                    })}

                    {filteredItems.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Search className="h-8 w-8 text-[#D4D4D8]" />
                        <p className="mt-3 text-sm font-medium text-[#71717A]">No items found</p>
                        <p className="mt-1 text-xs text-[#A1A1AA]">
                          Try adjusting your search or filters
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* CLAUDE.md list */}
                {activeTab === 'claudeMd' && (
                  <>
                    {distributableClaudeMd
                      .filter((file) => {
                        if (!searchQuery) return true;
                        const query = searchQuery.toLowerCase();
                        return (
                          file.name.toLowerCase().includes(query) ||
                          file.description.toLowerCase().includes(query) ||
                          file.sourcePath.toLowerCase().includes(query)
                        );
                      })
                      .map((file) => {
                        const isSelected = selectedClaudeMdId === file.id;
                        return (
                          <div
                            key={file.id}
                            onClick={() => handleToggleClaudeMd(file.id)}
                            className={`
                              relative
                              flex
                              cursor-pointer
                              items-center
                              gap-3.5
                              rounded-lg
                              border
                              px-4
                              py-3.5
                              transition-colors
                              ${
                                isSelected
                                  ? 'border-[#E5E5E5] bg-[#FAFAFA]'
                                  : 'border-[#E5E5E5] bg-white hover:bg-[#FAFAFA]'
                              }
                            `}
                          >
                            {/* Checkbox (single select behavior) */}
                            <div
                              className={`
                                flex
                                h-5
                                w-5
                                flex-shrink-0
                                items-center
                                justify-center
                                rounded
                                transition-colors
                                ${isSelected ? 'bg-[#18181B]' : 'border-2 border-[#D4D4D4]'}
                              `}
                            >
                              {isSelected && (
                                <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                              )}
                            </div>

                            {/* Icon Container */}
                            <div
                              className={`
                                flex
                                h-9
                                w-9
                                flex-shrink-0
                                items-center
                                justify-center
                                rounded-lg
                                ${isSelected ? 'bg-white' : 'bg-[#FAFAFA]'}
                              `}
                            >
                              <FileText
                                className={`h-[18px] w-[18px] ${
                                  isSelected ? 'text-[#18181B]' : 'text-[#52525B]'
                                }`}
                              />
                            </div>

                            {/* Info */}
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                              <span
                                className={`
                                  text-[13px]
                                  ${
                                    isSelected
                                      ? 'font-semibold text-[#18181B]'
                                      : 'font-medium text-[#18181B]'
                                  }
                                `}
                              >
                                {file.name}
                              </span>
                              <span
                                className={`
                                  truncate text-xs font-normal
                                  ${isSelected ? 'text-[#52525B]' : 'text-[#71717A]'}
                                `}
                              >
                                {file.sourcePath}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                    {distributableClaudeMd.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <FileText className="h-8 w-8 text-[#D4D4D8]" />
                        <p className="mt-3 text-sm font-medium text-[#71717A]">
                          No CLAUDE.md files available
                        </p>
                        <p className="mt-1 text-xs text-[#A1A1AA]">
                          Import CLAUDE.md files in the CLAUDE.md management page
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel - Selected Items */}
          <div className="flex w-80 flex-shrink-0 flex-col border-l border-[#E5E5E5]">
            {/* Right Header */}
            <div className="flex h-14 items-center justify-between border-b border-[#E5E5E5] px-5">
              <span className="text-sm font-semibold text-[#18181B]">Selected Items</span>
              {(selectedSkillIds.length > 0 ||
                selectedMcpIds.length > 0 ||
                selectedClaudeMdId !== null) && (
                <button
                  onClick={handleClearAll}
                  className="rounded px-2.5 py-1 text-[11px] font-medium text-[#DC2626] transition-colors hover:bg-[#FEE2E2]"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Right Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex flex-col gap-4">
                {/* Skills Group */}
                <CollapsibleGroup
                  title="Skills"
                  count={selectedSkills.length}
                  icon={<Sparkles className="h-3.5 w-3.5 text-[#18181B]" />}
                >
                  {selectedSkills.length > 0 ? (
                    selectedSkills.map((skill) => (
                      <SelectedItem
                        key={skill.id}
                        id={skill.id}
                        name={skill.name}
                        type="skill"
                        onRemove={handleToggleSkill}
                      />
                    ))
                  ) : (
                    <p className="py-2 text-xs text-[#A1A1AA]">No skills selected</p>
                  )}
                </CollapsibleGroup>

                {/* MCPs Group */}
                <CollapsibleGroup
                  title="MCP Servers"
                  count={selectedMcps.length}
                  icon={<Plug className="h-3.5 w-3.5 text-[#16A34A]" />}
                >
                  {selectedMcps.length > 0 ? (
                    selectedMcps.map((mcp) => (
                      <SelectedItem
                        key={mcp.id}
                        id={mcp.id}
                        name={mcp.name}
                        type="mcp"
                        onRemove={handleToggleMcp}
                      />
                    ))
                  ) : (
                    <p className="py-2 text-xs text-[#A1A1AA]">No MCP servers selected</p>
                  )}
                </CollapsibleGroup>

                {/* CLAUDE.md Group (single select) */}
                <CollapsibleGroup
                  title="CLAUDE.md"
                  count={selectedClaudeMdFile ? 1 : 0}
                  icon={<FileText className="h-3.5 w-3.5 text-[#4F46E5]" />}
                >
                  {selectedClaudeMdFile ? (
                    <SelectedItem
                      key={selectedClaudeMdFile.id}
                      id={selectedClaudeMdFile.id}
                      name={selectedClaudeMdFile.name}
                      type="claudeMd"
                      onRemove={handleToggleClaudeMd}
                    />
                  ) : (
                    <p className="py-2 text-xs text-[#A1A1AA]">No CLAUDE.md file selected</p>
                  )}
                </CollapsibleGroup>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default CreateSceneModal;
