import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Sparkles,
  Loader2,
  Code,
  Github,
  BookOpen,
  Smartphone,
  Palette,
  Server,
  Database,
  FileCode,
  GitPullRequest,
  TestTube,
  Layers,
  Wand2,
  X,
  Plus,
  Copy,
  FolderOpen,
  Download,
  Check,
} from 'lucide-react';
import { PageHeader, SlidePanel } from '@/components/layout';
import { parseDescription } from '@/utils/parseDescription';
import Badge from '@/components/common/Badge';
import Button from '@/components/common/Button';
import EmptyState from '@/components/common/EmptyState';
import {
  IconPicker,
  ICON_MAP,
  CategoryTreeDropdown,
  ScopeSelector,
  ViewOptionsMenu,
  type ViewOption,
} from '@/components/common';
import { MarketplaceSourceBadge } from '@/components/marketplace/MarketplaceSourceBadge';
import { MarkdownBody } from '@/components/marketplace/MarkdownBody';
import { SkillListItem } from '@/components/skills/SkillListItem';
import { ImportSkillsModal } from '@/components/modals';
import { useSkillsStore } from '@/stores/skillsStore';
import { useAppStore } from '@/stores/appStore';
import { useImportStore } from '@/stores/importStore';
import { useScenesStore } from '@/stores/scenesStore';
import { usePluginsStore } from '@/stores/pluginsStore';
import { useSortPreferencesStore } from '@/stores/sortPreferencesStore';
import { safeInvoke } from '@/utils/tauri';
import type { Category, Skill, SkillUsage, Tag } from '@/types';

// ============================================================================
// Sort + Group options
// ============================================================================
// Sort: every option folds in plugin-sink as an implicit secondary key so
// user-installed items always rank above plugin-imported ones inside
// whatever primary axis the user chose. `applySkillsSort` returns a new
// array; input is never mutated.
const SKILLS_SORT_OPTIONS: ViewOption[] = [
  { value: 'name', label: 'Name (A → Z)' },
  { value: 'recent', label: 'Recently added' },
  { value: 'used', label: 'Recently used' },
  { value: 'most-used', label: 'Most used' },
];

const SKILLS_GROUP_OPTIONS: ViewOption[] = [
  { value: 'none', label: 'None' },
  { value: 'categories', label: 'Categories' },
  { value: 'tags', label: 'Tags' },
];

function applySkillsSort(
  items: Skill[],
  sortBy: string,
  usageStats: Record<string, SkillUsage>,
): Skill[] {
  const pluginSink = (cmp: (a: Skill, b: Skill) => number) => (a: Skill, b: Skill) => {
    const aP = a.installSource === 'plugin';
    const bP = b.installSource === 'plugin';
    if (aP !== bP) return aP ? 1 : -1;
    return cmp(a, b);
  };
  // `usage.rs` keys UsageStats by the SKILL.md frontmatter `name` (which is
  // also what shows up in transcript `tool_use.input.skill`). Detail panels
  // already lookup with `id || name`; sort mirrors that.
  const lookupUsage = (s: Skill): SkillUsage | undefined => usageStats[s.id] || usageStats[s.name];
  const sorted = [...items];
  switch (sortBy) {
    case 'name':
      sorted.sort(pluginSink((a, b) => a.name.localeCompare(b.name)));
      break;
    case 'recent': {
      // Anchor on `installedAt` (OS directory creation time, persistent across
      // scans) and fall back to `createdAt` only when the backend couldn't
      // read it. `createdAt` alone re-derives on every scan and would collapse
      // into the `read_dir` physical order.
      const key = (s: Skill) => s.installedAt ?? s.createdAt ?? '';
      sorted.sort(pluginSink((a, b) => key(b).localeCompare(key(a))));
      break;
    }
    case 'used':
      sorted.sort(
        pluginSink((a, b) => {
          const ax = lookupUsage(a)?.last_used ?? '';
          const bx = lookupUsage(b)?.last_used ?? '';
          if (ax && !bx) return -1;
          if (!ax && bx) return 1;
          return bx.localeCompare(ax);
        }),
      );
      break;
    case 'most-used':
      sorted.sort(
        pluginSink((a, b) => (lookupUsage(b)?.call_count ?? 0) - (lookupUsage(a)?.call_count ?? 0)),
      );
      break;
    default:
      sorted.sort(pluginSink((a, b) => a.name.localeCompare(b.name)));
  }
  return sorted;
}

// ============================================================================
// Group helpers
// ============================================================================
// `groupSkills` produces an ordered list of `{ group, items }` buckets. When
// `groupBy === 'none'` the whole list is returned as a single anonymous
// bucket (`group: null`), so the renderer can iterate uniformly.
//
// Group ordering follows the user's category / tag arrangement in the
// sidebar (the `categories` / `appTags` arrays are already sorted by store
// reorder logic), so the page mirrors that mental model. Items with no
// category / no tags fall into the trailing UNCATEGORIZED / UNTAGGED
// bucket. For Tags grouping (multi-valued), an item appears once in every
// bucket whose tag it carries — Linear/Notion style multi-tag pivot.

export interface GroupBucket<T> {
  group: { id: string; label: string; count: number } | null;
  items: T[];
}

function groupSkills(
  items: Skill[],
  groupBy: string,
  categories: Category[],
  appTags: Tag[],
): GroupBucket<Skill>[] {
  if (groupBy === 'categories') {
    const buckets = new Map<string, Skill[]>();
    for (const item of items) {
      const key = item.categoryId || '';
      const list = buckets.get(key) ?? [];
      list.push(item);
      buckets.set(key, list);
    }
    const out: GroupBucket<Skill>[] = [];
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
    const buckets = new Map<string, Skill[]>();
    const untagged: Skill[] = [];
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
    const out: GroupBucket<Skill>[] = [];
    // Use sidebar tag order first; any tag the user has used but that is not
    // in the global tag list (legacy / inline-created) trails alphabetically.
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
// Helper Functions
// ============================================================================

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return 'Never';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return formatDate(dateString);
  }
}

// ============================================================================
// Helper Components
// ============================================================================

interface InfoItemProps {
  label: string;
  value: string;
}

function InfoItem({ label, value }: InfoItemProps) {
  return (
    <div className="flex flex-1 flex-col gap-1">
      <span className="text-[11px] font-medium text-[#71717A]">{label}</span>
      <span className="text-[13px] font-medium text-[#18181B]">{value}</span>
    </div>
  );
}

interface ConfigItemProps {
  label: string;
  value: React.ReactNode;
  isLast?: boolean;
}

function ConfigItem({ label, value, isLast = false }: ConfigItemProps) {
  return (
    <div
      className={`flex items-center gap-3 px-3.5 py-3 ${
        !isLast ? 'border-b border-[#E5E5E5]' : ''
      }`}
    >
      <span className="w-24 flex-shrink-0 text-xs font-medium text-[#71717A]">{label}</span>
      <div className="flex-1">{value}</div>
    </div>
  );
}

interface SceneChipProps {
  name: string;
}

function SceneChip({ name }: SceneChipProps) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-[#E5E5E5] px-3.5 py-2">
      <Layers className="h-3.5 w-3.5 text-[#52525B]" />
      <span className="text-xs font-medium text-[#18181B]">{name}</span>
    </div>
  );
}

// ============================================================================
// SkillsPage Component
// ============================================================================

export function SkillsPage() {
  const {
    skills,
    filter,
    setFilter,
    deleteSkill,
    updateSkillIcon,
    updateSkillCategory,
    updateSkillTags,
    updateSkillScope,
    getFilteredSkills,
    autoClassify,
    isClassifying,
    classifySuccess,
    isFadingOut,
    showRestoreAnimation,
    error,
    clearError,
    loadSkills,
    usageStats,
    loadUsageStats,
  } = useSkillsStore();

  const { categories, tags: appTags, addTag: addGlobalTag } = useAppStore();

  const { isSkillsModalOpen, openSkillsModal, closeSkillsModal, isDetectingSkills } =
    useImportStore();

  const { scenes } = useScenesStore();

  const { loadInstalledPlugins } = usePluginsStore();

  const sortBy = useSortPreferencesStore((s) => s.sort.skills);
  const groupBy = useSortPreferencesStore((s) => s.group.skills);
  const setSortFor = useSortPreferencesStore((s) => s.setSortFor);
  const setGroupFor = useSortPreferencesStore((s) => s.setGroupFor);

  const baseFiltered = getFilteredSkills();
  const filteredSkills = useMemo(
    () => applySkillsSort(baseFiltered, sortBy, usageStats),
    [baseFiltered, sortBy, usageStats],
  );

  const groupedSkills = useMemo(
    () => groupSkills(filteredSkills, groupBy, categories, appTags),
    [filteredSkills, groupBy, categories, appTags],
  );

  // Status line text. Mirrors the Marketplace pattern: count + secondary
  // context. When grouping by Tags the displayed total exceeds unique items
  // (one item shows up in every tag bucket it belongs to), so the status
  // text switches to "X skills across Y tags" to keep the count honest.
  const statusText = useMemo(() => {
    const count = filteredSkills.length;
    const skillsLabel = `${count} ${count === 1 ? 'skill' : 'skills'}`;
    if (groupBy === 'tags') {
      const tagBuckets = groupedSkills.filter((b) => b.group && b.group.id !== '__untagged__');
      if (tagBuckets.length === 0) return skillsLabel;
      return `${skillsLabel} across ${tagBuckets.length} ${
        tagBuckets.length === 1 ? 'tag' : 'tags'
      }`;
    }
    if (groupBy === 'categories') {
      const catBuckets = groupedSkills.filter((b) => b.group && b.group.id !== '__uncategorized__');
      if (catBuckets.length === 0) return skillsLabel;
      return `${skillsLabel} across ${catBuckets.length} ${
        catBuckets.length === 1 ? 'category' : 'categories'
      }`;
    }
    const categoryCount = new Set(
      filteredSkills
        .map((s) => s.categoryId || s.category)
        .filter((c) => c && c !== 'uncategorized'),
    ).size;
    if (categoryCount === 0) return skillsLabel;
    return `${skillsLabel} · ${categoryCount} ${categoryCount === 1 ? 'category' : 'categories'}`;
  }, [filteredSkills, groupBy, groupedSkills]);

  // Load usage stats and plugin enabled status on mount
  useEffect(() => {
    loadUsageStats();
    // Load installed plugins to populate pluginEnabledStatus
    loadInstalledPlugins();
  }, [loadUsageStats, loadInstalledPlugins]);

  // Selected skill ID state (replaces URL-based navigation)
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  // Marketplace short-cut deep link (task card C6).
  // When the user follows the ShortcutBanner's "View in Skills →" link, the
  // URL becomes `/skills?selected=<skillId>`. Read it once on mount + on
  // change so deep links land on the matching detail panel; then strip the
  // query param so a refresh doesn't keep re-selecting (the user may have
  // closed the panel intentionally).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const selected = searchParams.get('selected');
    if (selected) {
      setSelectedSkillId(selected);
      // `replace: true` keeps the history entry minimal — no extra back-stack
      // hop. Iterate over a copy of the entries so other params survive.
      const next = new URLSearchParams(searchParams);
      next.delete('selected');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Get the selected skill using useMemo
  const selectedSkill = useMemo(
    () => skills.find((s) => s.id === selectedSkillId) || null,
    [skills, selectedSkillId],
  );

  // V2 dual-read: prefer categoryId (canonical), fall back to name lookup
  // for legacy entries that have not yet completed the
  // `migrate_category_id_for_skills_mcps` migration. See 03_tech_plan V2 §5.9.
  const currentCategoryId = useMemo(() => {
    if (!selectedSkill) return '';
    if (selectedSkill.categoryId) return selectedSkill.categoryId;
    return categories.find((c) => c.name === selectedSkill.category)?.id ?? '';
  }, [selectedSkill, categories]);

  // Get scenes that use the selected skill
  const usedInScenes = useMemo(() => {
    if (!selectedSkillId) return [];
    return scenes.filter((scene) => scene.skillIds.includes(selectedSkillId));
  }, [scenes, selectedSkillId]);

  // Calculate scenes count for selected skill
  const scenesCount = usedInScenes.length;

  // Get usage stats for selected skill
  const selectedSkillUsage = useMemo(() => {
    if (!selectedSkill) return null;
    // Try by id first, then by name
    return usageStats[selectedSkill.id] || usageStats[selectedSkill.name] || null;
  }, [selectedSkill, usageStats]);

  // Tag input state
  const [tagInputValue, setTagInputValue] = useState('');
  const [isTagInputOpen, setIsTagInputOpen] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Filtered tag suggestions based on input
  const tagSuggestions = useMemo(() => {
    if (!tagInputValue.trim()) return appTags;
    const query = tagInputValue.toLowerCase();
    return appTags.filter(
      (tag) => tag.name.toLowerCase().includes(query) && !selectedSkill?.tags?.includes(tag.name),
    );
  }, [tagInputValue, appTags, selectedSkill?.tags]);

  // Detail header icon ref
  const detailIconRef = useRef<HTMLDivElement>(null);

  // Icon Picker state
  const [iconPickerState, setIconPickerState] = useState<{
    isOpen: boolean;
    skillId: string | null;
    triggerRef: React.RefObject<HTMLDivElement> | null;
  }>({ isOpen: false, skillId: null, triggerRef: null });

  const handleSearchChange = (value: string) => {
    setFilter({ search: value });
  };

  // Click handler now sets state instead of navigating
  const handleSkillClick = (skillId: string) => {
    setSelectedSkillId(skillId);
  };

  // Close detail panel
  const handleCloseDetail = () => {
    setSelectedSkillId(null);
  };

  const handleDelete = (skillId: string) => {
    // R7 F7-1 fix (A11): explicitly clear the page-local `selectedSkillId`
    // when deleting the currently-selected skill so the SlidePanel closes
    // synchronously. `skillsStore.deleteSkill` already resets the store's
    // own selectedSkillId (skillsStore.ts:152), but the page maintains a
    // separate `useState` and the two were decoupled — leaving the panel
    // open over a `selectedSkill === null` useMemo (empty 800-px column).
    if (selectedSkillId === skillId) {
      setSelectedSkillId(null);
    }
    deleteSkill(skillId);
  };

  const handleAutoClassify = async () => {
    await autoClassify();
  };

  const handleCopyInvocation = () => {
    if (selectedSkill?.invocation) {
      navigator.clipboard.writeText(selectedSkill.invocation);
    }
  };

  const handleOpenInFinder = async () => {
    if (selectedSkill?.sourcePath) {
      await safeInvoke('reveal_in_finder', { path: selectedSkill.sourcePath });
    }
  };

  // Handle icon click
  const handleIconClick = (skillId: string, ref: React.RefObject<HTMLDivElement>) => {
    setIconPickerState({ isOpen: true, skillId, triggerRef: ref });
  };

  // Handle icon change
  const handleIconChange = (iconName: string) => {
    if (iconPickerState.skillId) {
      updateSkillIcon(iconPickerState.skillId, iconName);
    }
    setIconPickerState({ isOpen: false, skillId: null, triggerRef: null });
  };

  // Handle icon picker close
  const handleIconPickerClose = () => {
    setIconPickerState({ isOpen: false, skillId: null, triggerRef: null });
  };

  // V2 §5.9: dropdown emits categoryId; resolve id → name and let the store
  // handle dual-write (name → metadata.category cached display +
  // metadata.category_id canonical reference).
  const handleCategoryChange = (categoryId: string) => {
    if (!selectedSkillId) return;
    const targetName = categoryId ? (categories.find((c) => c.id === categoryId)?.name ?? '') : '';
    updateSkillCategory(selectedSkillId, targetName);
  };

  // Handle adding a tag
  const handleAddTag = async (tagName: string) => {
    if (selectedSkillId && selectedSkill && tagName.trim()) {
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

      const newTags = [...(selectedSkill.tags || []), trimmedName];
      updateSkillTags(selectedSkillId, newTags);
      setTagInputValue('');
      setIsTagInputOpen(false);
    }
  };

  // Handle removing a tag
  const handleRemoveTag = (tagName: string) => {
    if (selectedSkillId && selectedSkill) {
      const newTags = selectedSkill.tags.filter((t) => t !== tagName);
      updateSkillTags(selectedSkillId, newTags);
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

  // Detail Header content
  const detailHeader = selectedSkill && (
    <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
      {/* Icon - Clickable for IconPicker */}
      <div
        ref={detailIconRef}
        onClick={() => handleIconClick(selectedSkill.id, detailIconRef)}
        className="flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[#F4F4F5] transition-shadow hover:ring-2 hover:ring-[#18181B]/10"
      >
        {React.createElement(getSkillIcon(selectedSkill), {
          className: 'h-[18px] w-[18px] text-[#18181B]',
        })}
      </div>

      {/* Title & Description */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="text-base font-semibold text-[#18181B]">{selectedSkill.name}</h2>
        {(() => {
          const { firstSentence } = parseDescription(selectedSkill.description);
          return (
            <p
              className="w-full truncate text-xs font-normal text-[#71717A]"
              title={selectedSkill.description}
            >
              {firstSentence}
            </p>
          );
        })()}
      </div>
    </div>
  );

  // Detail Header right content (close button provided by SlidePanel)
  const detailHeaderRight = null;

  // Detail Content
  const detailContent = selectedSkill && (
    <div className="flex flex-col gap-7">
      {/* Info Section */}
      <div className="flex gap-8">
        <InfoItem
          label="Installed"
          value={formatDate(selectedSkill.installedAt || selectedSkill.createdAt)}
        />
        <InfoItem
          label="Usage"
          value={`${(selectedSkillUsage?.call_count ?? 0).toLocaleString()} calls`}
        />
        <InfoItem
          label="Last Used"
          value={formatRelativeTime(selectedSkillUsage?.last_used ?? undefined)}
        />
        <InfoItem
          label="Scenes"
          value={`${scenesCount} ${scenesCount === 1 ? 'scene' : 'scenes'}`}
        />
      </div>

      {/* Category & Tags Section */}
      <div className="flex flex-col gap-4">
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
            {selectedSkill?.tags?.map((tag) => (
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
      </div>

      {/* Instructions Section */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-[#18181B]">Instructions</h3>
        <div
          className="overflow-y-auto rounded-lg border border-[#E5E5E5] bg-white p-4"
          style={{ maxHeight: '480px' }}
        >
          <div>
            {selectedSkill.description && (
              <p className="mb-3 whitespace-pre-wrap rounded bg-[#FAFAFA] p-2 text-xs font-normal leading-relaxed text-[#71717A]">
                {selectedSkill.description}
              </p>
            )}
            <MarkdownBody source={selectedSkill.instructions ?? ''} />
          </div>
        </div>
      </div>

      {/* Configuration Section */}
      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-[#18181B]">Configuration</h3>
        <div className="overflow-hidden rounded-lg border border-[#E5E5E5]">
          {/* Invocation */}
          <ConfigItem
            label="Invocation"
            value={
              <div className="flex items-center gap-2">
                <code className="rounded bg-[#F4F4F5] px-2 py-0.5 font-mono text-xs text-[#18181B]">
                  {selectedSkill.invocation || 'Not set'}
                </code>
                {selectedSkill.invocation && (
                  <button
                    onClick={handleCopyInvocation}
                    className="text-[#A1A1AA] hover:text-[#71717A]"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            }
          />

          {/* Allowed Tools */}
          <ConfigItem
            label="Allowed Tools"
            value={
              <div className="flex flex-wrap gap-1.5">
                {selectedSkill.allowedTools && selectedSkill.allowedTools.length > 0 ? (
                  selectedSkill.allowedTools.map((tool) => (
                    <Badge key={tool} variant="tag">
                      {tool}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-[#A1A1AA]">All tools</span>
                )}
              </div>
            }
          />

          {/* Scope */}
          <ConfigItem
            label="Scope"
            value={
              selectedSkill.installSource === 'plugin' ? (
                <span className="rounded bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-medium text-[#3B82F6]">
                  Plugin
                </span>
              ) : (
                <ScopeSelector
                  value={selectedSkill.scope}
                  onChange={async (scope) => {
                    await updateSkillScope(selectedSkill.id, scope);
                  }}
                />
              )
            }
            isLast
          />
        </div>
      </div>

      {/* Source Section */}
      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-[#18181B]">Source</h3>
        <div className="flex flex-col gap-3 rounded-lg border border-[#E5E5E5] p-4">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-medium text-[#71717A]">Path</span>
            <span className="font-mono text-xs text-[#18181B]">{selectedSkill.sourcePath}</span>
          </div>
          {selectedSkill.installSource === 'marketplace' && selectedSkill.marketplaceSource && (
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-medium text-[#71717A]">From</span>
              <MarketplaceSourceBadge source={selectedSkill.marketplaceSource} />
            </div>
          )}
          <Button
            variant="secondary"
            size="small"
            icon={<FolderOpen />}
            onClick={handleOpenInFinder}
          >
            Open in Finder
          </Button>
        </div>
      </div>

      {/* Used in Scenes Section */}
      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-[#18181B]">Used in Scenes</h3>
        {usedInScenes.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {usedInScenes.map((scene) => (
              <SceneChip key={scene.id} name={scene.name} />
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
      </div>
    </div>
  );

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Header */}
      <PageHeader
        title="Skills"
        searchValue={filter.search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search skills..."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              size="small"
              icon={isDetectingSkills ? <Loader2 className="animate-spin" /> : <Download />}
              onClick={() => openSkillsModal()}
              disabled={isDetectingSkills}
            >
              {isDetectingSkills ? 'Detecting...' : 'Import'}
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
              onClick={handleAutoClassify}
              disabled={isClassifying || classifySuccess || skills.length === 0}
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

      {/* Main Content - with shrink animation */}
      <div
        className={`
          flex-1 overflow-y-auto px-7 py-6
          transition-[margin-right] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]
          ${selectedSkillId ? 'mr-[800px]' : ''}
        `}
      >
        {/* Status line — count + secondary context on the left, View Options
            (Group + Sort) on the right. Mirrors the Marketplace pattern
            (see SkillMarketplacePage). */}
        {filteredSkills.length > 0 && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-[11px] text-[#A1A1AA]">{statusText}</span>
            <ViewOptionsMenu
              sections={[
                {
                  id: 'group',
                  label: 'GROUP BY',
                  options: SKILLS_GROUP_OPTIONS,
                  value: groupBy,
                  onChange: (v) => setGroupFor('skills', v),
                },
                {
                  id: 'sort',
                  label: 'SORT BY',
                  options: SKILLS_SORT_OPTIONS,
                  value: sortBy,
                  onChange: (v) => setSortFor('skills', v),
                },
              ]}
            />
          </div>
        )}

        {filteredSkills.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<Sparkles className="h-12 w-12" />}
              title="No skills"
              description={
                filter.search
                  ? 'No skills match your search. Try a different query.'
                  : 'Add your first skill to get started'
              }
            />
          </div>
        ) : (
          /* Skill List — flat when groupBy === 'none', sectioned otherwise.
             Section header style mirrors the sidebar's MARKETPLACE / LIBRARY
             labels (10px font-semibold uppercase tracking-[0.8px] text-
             [#A1A1AA]) for cross-surface visual coherence. */
          <div className="flex flex-col">
            {groupedSkills.map((bucket, idx) => (
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
                  {bucket.items.map((skill) => (
                    <SkillListItem
                      key={`${bucket.group?.id ?? 'all'}::${skill.id}`}
                      skill={skill}
                      compact={!!selectedSkillId}
                      selected={skill.id === selectedSkillId}
                      onClick={() => handleSkillClick(skill.id)}
                      onDelete={() => handleDelete(skill.id)}
                      onIconClick={(ref) => handleIconClick(skill.id, ref)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Slide Panel for Detail View */}
      {/* R7 F7-1 fix (A11): drive isOpen from `selectedSkill` (data) rather
          than `selectedSkillId` (local id). When the selected skill is
          deleted, `selectedSkill = useMemo(skills.find(...))` becomes null,
          so the panel closes automatically even if the id-clear in
          `handleDelete` is bypassed. Two-layer safety against the
          empty-panel state. */}
      <SlidePanel
        isOpen={!!selectedSkill}
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
          value={skills.find((s) => s.id === iconPickerState.skillId)?.icon || 'sparkles'}
          onChange={handleIconChange}
          triggerRef={iconPickerState.triggerRef}
          isOpen={iconPickerState.isOpen}
          onClose={handleIconPickerClose}
        />
      )}

      {/* Import Skills Modal */}
      <ImportSkillsModal
        isOpen={isSkillsModalOpen}
        onClose={closeSkillsModal}
        onImportComplete={() => {
          // 刷新 skills 列表
          loadSkills();
        }}
      />
    </div>
  );
}

export default SkillsPage;
