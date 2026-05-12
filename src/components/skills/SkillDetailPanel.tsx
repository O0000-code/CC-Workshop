/**
 * NOTE: This component is NOT used by SkillsPage.tsx!
 * SkillsPage has its own inline detail panel implementation.
 * This component is only used by CategoryPage and TagPage.
 * If you need to modify the Skills detail panel on the main Skills page,
 * edit src/pages/SkillsPage.tsx instead.
 */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Sparkles,
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
} from 'lucide-react';
import { SlidePanel } from '@/components/layout';
import { parseDescription } from '@/utils/parseDescription';
import Badge from '@/components/common/Badge';
import Button from '@/components/common/Button';
import { IconPicker, ICON_MAP, CategoryTreeDropdown, ScopeSelector } from '@/components/common';
import { MarketplaceSourceBadge } from '@/components/marketplace/MarketplaceSourceBadge';
import { MarkdownBody } from '@/components/marketplace/MarkdownBody';
import { useSkillsStore } from '@/stores/skillsStore';
import { useAppStore } from '@/stores/appStore';
import { useScenesStore } from '@/stores/scenesStore';
import { safeInvoke } from '@/utils/tauri';
import type { Skill } from '@/types';

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
// SkillDetailPanel Props
// ============================================================================

export interface SkillDetailPanelProps {
  skill: Skill | null;
  isOpen: boolean;
  onClose: () => void;
}

// ============================================================================
// SkillDetailPanel Component
// ============================================================================

export function SkillDetailPanel({ skill, isOpen, onClose }: SkillDetailPanelProps) {
  // ALL HOOKS MUST BE CALLED FIRST - before any conditional returns
  const {
    skills,
    updateSkillIcon,
    updateSkillCategory,
    updateSkillTags,
    updateSkillScope,
    usageStats,
  } = useSkillsStore();

  const { categories, tags: appTags, addTag: addGlobalTag } = useAppStore();
  const { scenes } = useScenesStore();

  // Tag input state
  const [tagInputValue, setTagInputValue] = useState('');
  const [isTagInputOpen, setIsTagInputOpen] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Detail header icon ref
  const detailIconRef = useRef<HTMLDivElement>(null);

  // Icon Picker state
  const [iconPickerState, setIconPickerState] = useState<{
    isOpen: boolean;
    triggerRef: React.RefObject<HTMLDivElement> | null;
  }>({ isOpen: false, triggerRef: null });

  // Get the latest skill data from store (in case it's updated)
  const selectedSkill = useMemo(
    () => (skill ? skills.find((s) => s.id === skill.id) || skill : null),
    [skills, skill],
  );

  // Get scenes that use the selected skill
  const usedInScenes = useMemo(() => {
    if (!selectedSkill) return [];
    return scenes.filter((scene) => scene.skillIds.includes(selectedSkill.id));
  }, [scenes, selectedSkill]);

  // Calculate scenes count for selected skill
  const scenesCount = usedInScenes.length;

  // Get usage stats for selected skill
  const selectedSkillUsage = useMemo(() => {
    if (!selectedSkill) return null;
    // Try by id first, then by name
    return usageStats[selectedSkill.id] || usageStats[selectedSkill.name] || null;
  }, [selectedSkill, usageStats]);

  // V2 dual-read: prefer categoryId (canonical), fall back to name lookup
  // for legacy entries that have not yet completed the
  // `migrate_category_id_for_skills_mcps` migration. See 03_tech_plan V2 §5.9.
  const currentCategoryId = useMemo(() => {
    if (!selectedSkill) return '';
    if (selectedSkill.categoryId) return selectedSkill.categoryId;
    return categories.find((c) => c.name === selectedSkill.category)?.id ?? '';
  }, [selectedSkill, categories]);

  // Filtered tag suggestions based on input
  const tagSuggestions = useMemo(() => {
    if (!tagInputValue.trim()) return appTags;
    const query = tagInputValue.toLowerCase();
    return appTags.filter(
      (tag) => tag.name.toLowerCase().includes(query) && !selectedSkill?.tags?.includes(tag.name),
    );
  }, [tagInputValue, appTags, selectedSkill?.tags]);

  // Reset state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setTagInputValue('');
      setIsTagInputOpen(false);
      setIconPickerState({ isOpen: false, triggerRef: null });
    }
  }, [isOpen]);

  // Event handlers (these don't use hooks, so they can be after hooks)
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

  const handleIconClick = (ref: React.RefObject<HTMLDivElement>) => {
    setIconPickerState({ isOpen: true, triggerRef: ref });
  };

  const handleIconChange = (iconName: string) => {
    if (selectedSkill) {
      updateSkillIcon(selectedSkill.id, iconName);
    }
    setIconPickerState({ isOpen: false, triggerRef: null });
  };

  const handleIconPickerClose = () => {
    setIconPickerState({ isOpen: false, triggerRef: null });
  };

  // V2 §5.9: dropdown emits categoryId; resolve id → name and let the store
  // handle dual-write (name → metadata.category cached display +
  // metadata.category_id canonical reference).
  const handleCategoryChange = (categoryId: string) => {
    if (!selectedSkill) return;
    const targetName = categoryId ? (categories.find((c) => c.id === categoryId)?.name ?? '') : '';
    updateSkillCategory(selectedSkill.id, targetName);
  };

  const handleAddTag = async (tagName: string) => {
    if (selectedSkill && tagName.trim()) {
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
      updateSkillTags(selectedSkill.id, newTags);
      setTagInputValue('');
      setIsTagInputOpen(false);
    }
  };

  const handleRemoveTag = (tagName: string) => {
    if (selectedSkill) {
      const newTags = selectedSkill.tags.filter((t) => t !== tagName);
      updateSkillTags(selectedSkill.id, newTags);
    }
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInputValue.trim()) {
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

  // NOW we can do conditional rendering (after all hooks)
  // If no skill, render empty SlidePanel to maintain animation
  if (!selectedSkill) {
    return (
      <SlidePanel isOpen={isOpen} onClose={onClose} width={800} header={null}>
        <div />
      </SlidePanel>
    );
  }

  // Detail Header content
  const detailHeader = (
    <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
      {/* Icon - Clickable for IconPicker */}
      <div
        ref={detailIconRef}
        onClick={() => handleIconClick(detailIconRef as React.RefObject<HTMLDivElement>)}
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

  // Detail Content
  const detailContent = (
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
          value={selectedSkill?.icon || 'sparkles'}
          onChange={handleIconChange}
          triggerRef={iconPickerState.triggerRef}
          isOpen={iconPickerState.isOpen}
          onClose={handleIconPickerClose}
        />
      )}
    </>
  );
}

export default SkillDetailPanel;
