import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  Pencil,
  ChevronDown,
  X,
  Plus,
  Copy,
  FolderOpen,
} from 'lucide-react';
import ListDetailLayout from '../components/layout/ListDetailLayout';
import { SearchInput } from '../components/common/SearchInput';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import EmptyState from '../components/common/EmptyState';
import { IconPicker, ICON_MAP, ScopeSelector } from '@/components/common';
import SkillItem from '../components/skills/SkillItem';
import { useSkillsStore } from '../stores/skillsStore';
import { useScenesStore } from '../stores/scenesStore';
import { useAppStore } from '../stores/appStore';
import { safeInvoke } from '../utils/tauri';
import {
  getCategoryDisplayName,
  getCategoryColor as resolveCategoryColor,
} from '../utils/categoryTree';
import type { Skill } from '../types';

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
// SkillDetailPage Component
// ============================================================================

export function SkillDetailPage() {
  const { skillId: encodedSkillId } = useParams<{ skillId: string }>();
  const navigate = useNavigate();
  const {
    skills,
    filter,
    setFilter,
    selectSkill,
    selectedSkillId,
    deleteSkill,
    updateSkillIcon,
    updateSkillScope,
    getFilteredSkills,
    getEnabledCount,
    getSelectedSkill,
    usageStats,
    loadUsageStats,
  } = useSkillsStore();

  const { scenes } = useScenesStore();
  const { categories } = useAppStore();

  // Decode the URL-encoded skill ID
  const skillId = encodedSkillId ? decodeURIComponent(encodedSkillId) : null;

  const filteredSkills = getFilteredSkills();
  const enabledCount = getEnabledCount();
  const selectedSkill = getSelectedSkill();

  // Get scenes that use the selected skill
  const usedInScenes = useMemo(() => {
    if (!skillId) return [];
    return scenes.filter((scene) => scene.skillIds.includes(skillId));
  }, [scenes, skillId]);

  // Calculate scenes count for selected skill
  const scenesCount = usedInScenes.length;

  // Get usage stats for selected skill
  const selectedSkillUsage = useMemo(() => {
    if (!selectedSkill) return null;
    // Try by id first, then by name
    return usageStats[selectedSkill.id] || usageStats[selectedSkill.name] || null;
  }, [selectedSkill, usageStats]);

  // Detail header icon ref
  const detailIconRef = useRef<HTMLDivElement>(null);

  // Icon Picker state
  const [iconPickerState, setIconPickerState] = useState<{
    isOpen: boolean;
    skillId: string | null;
    triggerRef: React.RefObject<HTMLDivElement> | null;
  }>({ isOpen: false, skillId: null, triggerRef: null });

  // Sync URL param with store selection (useEffect is the correct place for side effects)
  useEffect(() => {
    if (skillId) {
      selectSkill(skillId);
    }
  }, [skillId, selectSkill]);

  // Load usage stats on mount
  useEffect(() => {
    loadUsageStats();
  }, [loadUsageStats]);

  const handleSearchChange = (value: string) => {
    setFilter({ search: value });
  };

  const handleSkillClick = (id: string) => {
    selectSkill(id);
    navigate(`/skills/${encodeURIComponent(id)}`);
  };

  const handleDelete = (id: string) => {
    deleteSkill(id);
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

  // List Header
  const listHeader = (
    <>
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-[#18181B]">Skills</h2>
        <Badge variant="status">{enabledCount} Active</Badge>
      </div>
      <SearchInput
        value={filter.search}
        onChange={handleSearchChange}
        placeholder="Search..."
        className="!w-[140px]"
      />
    </>
  );

  // List Content
  const listContent = (
    <div className="flex flex-col gap-1">
      {filteredSkills.map((skill) => (
        <SkillItem
          key={skill.id}
          skill={skill}
          variant="compact"
          selected={skill.id === selectedSkillId}
          onClick={() => handleSkillClick(skill.id)}
          onDelete={() => handleDelete(skill.id)}
          onIconClick={(ref) => handleIconClick(skill.id, ref)}
        />
      ))}
      {filteredSkills.length === 0 && (
        <div className="py-8 text-center text-sm text-[#71717A]">No skills found</div>
      )}
    </div>
  );

  // Detail Header (when skill is selected)
  const detailHeader = selectedSkill && (
    <>
      <div className="flex items-center gap-3">
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
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base font-semibold text-[#18181B]">{selectedSkill.name}</h2>
          <p className="text-xs font-normal text-[#71717A]">{selectedSkill.description}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="secondary" size="small" icon={<Pencil />}>
          Edit
        </Button>
      </div>
    </>
  );

  // Detail Content (when skill is selected)
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
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium text-[#71717A]">Category</span>
          {/* V2 §5.9 row 3: dual-read display — categoryId-resolved name
              wins over the cached `category` string; the legacy
              `categoryColors` static map remains as a final fallback for
              entries that pre-date both ids and the new color system. */}
          {(() => {
            const displayName = getCategoryDisplayName(
              selectedSkill.categoryId,
              selectedSkill.category,
              categories,
            );
            const resolvedColor =
              resolveCategoryColor(selectedSkill.categoryId, selectedSkill.category, categories) ??
              categoryColors[selectedSkill.category] ??
              '#71717A';
            const labelText = displayName
              ? displayName.charAt(0).toUpperCase() + displayName.slice(1)
              : 'Uncategorized';
            return (
              <button className="flex items-center gap-2 rounded-md border border-[#E5E5E5] px-2.5 py-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: resolvedColor }} />
                <span className="text-[13px] font-medium text-[#18181B]">{labelText}</span>
                <ChevronDown className="h-3.5 w-3.5 text-[#A1A1AA]" />
              </button>
            );
          })()}
        </div>

        {/* Tags */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium text-[#71717A]">Tags</span>
          <div className="flex flex-wrap items-center gap-2">
            {selectedSkill?.tags?.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1.5 rounded-md border border-[#E5E5E5] px-2.5 py-1.5"
              >
                <span className="text-xs font-medium text-[#18181B]">{tag}</span>
                <button className="text-[#A1A1AA] hover:text-[#71717A]">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button className="flex items-center gap-1 rounded-md border border-[#E5E5E5] px-2.5 py-1.5 text-[#A1A1AA] hover:bg-[#FAFAFA]">
              <Plus className="h-3 w-3" />
              <span className="text-xs font-medium">Add</span>
            </button>
          </div>
        </div>
      </div>

      {/* Instructions Section */}
      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-[#18181B]">Instructions</h3>
        <div className="rounded-lg border border-[#E5E5E5] bg-white p-4">
          <p className="whitespace-pre-wrap text-xs font-normal leading-relaxed text-[#52525B]">
            {selectedSkill.instructions}
          </p>
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
                  value={selectedSkill.scope as 'global' | 'project'}
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

  // Empty Detail State
  const emptyDetail = (
    <EmptyState
      icon={<Sparkles className="h-12 w-12" />}
      title="No skill selected"
      description="Select a skill from the list to view its details"
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
          value={skills.find((s) => s.id === iconPickerState.skillId)?.icon || 'sparkles'}
          onChange={handleIconChange}
          triggerRef={iconPickerState.triggerRef}
          isOpen={iconPickerState.isOpen}
          onClose={handleIconPickerClose}
        />
      )}
    </>
  );
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

export default SkillDetailPage;
