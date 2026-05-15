// src/components/rules/RuleDetailPanel.tsx
//
// Mirrors `ClaudeMdDetailPanel.tsx`. Differences (per
// `.dev/rule-management/01_design.md`):
//   * No source-type display (Rule has no Global/Project/Local trichotomy).
//   * "Set as Global" toggle is per-rule — flipping it on does NOT unset any
//     other rule's `isGlobal` flag. Description text reflects the
//     `~/.claude/rules/<filename>.md` target path.
//   * Filename is shown read-only (immutable) alongside the source path.

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { FileText, FolderOpen, Layers, X, Plus } from 'lucide-react';
import { SlidePanel } from '@/components/layout';
import { Toggle, CategoryTreeDropdown, Button } from '@/components/common';
import { MarkdownBody } from '@/components/marketplace/MarkdownBody';
import { safeInvoke } from '@/utils/tauri';
import { useRulesStore } from '@/stores/rulesStore';
import { useAppStore } from '@/stores/appStore';
import { useScenesStore } from '@/stores/scenesStore';
import { isEnterCommit } from '@/utils/keyboard';
import type { Rule } from '@/types/rule';

// ============================================================================
// Helper Functions
// ============================================================================

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function countLines(content: string): number {
  if (!content) return 0;
  return content.split('\n').length;
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

interface SceneChipProps {
  name: string;
}

function SceneChip({ name }: SceneChipProps) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-[#E5E5E5] px-3.5 py-2">
      <Layers className="h-3.5 w-3.5 text-[#71717A]" />
      <span className="text-[13px] font-normal text-[#18181B]">{name}</span>
    </div>
  );
}

interface RemovableTagProps {
  name: string;
  onRemove: () => void;
}

function RemovableTag({ name, onRemove }: RemovableTagProps) {
  return (
    <span className="flex items-center gap-1.5 rounded-md border border-[#E5E5E5] px-2.5 py-1.5">
      <span className="text-xs font-medium text-[#18181B]">{name}</span>
      <button onClick={onRemove} className="text-[#A1A1AA] transition-colors hover:text-[#71717A]">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

// ============================================================================
// RuleDetailPanel Props
// ============================================================================

export interface RuleDetailPanelProps {
  rule: Rule | null;
  isOpen: boolean;
  onClose: () => void;
}

// ============================================================================
// RuleDetailPanel Component
// ============================================================================

export function RuleDetailPanel({ rule, isOpen, onClose }: RuleDetailPanelProps) {
  // ALL HOOKS MUST BE CALLED FIRST - before any conditional returns
  const { rules, updateRule, setGlobal, unsetGlobal, isSetting } = useRulesStore();

  const { categories, tags: appTags, addTag: addGlobalTag } = useAppStore();
  const { scenes } = useScenesStore();

  // Tag input state
  const [tagInputValue, setTagInputValue] = useState('');
  const [isTagInputOpen, setIsTagInputOpen] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Get the latest rule data from store (in case it's updated)
  const selectedRule = useMemo(
    () => (rule ? rules.find((r) => r.id === rule.id) || rule : null),
    [rules, rule],
  );

  // Get scenes that reference this Rule (multi-select on the Scene side)
  const usedInScenes = useMemo(() => {
    if (!selectedRule) return [];
    return scenes.filter((scene) => scene.ruleIds?.includes(selectedRule.id));
  }, [scenes, selectedRule]);

  // Resolve tag objects from tag IDs
  const ruleTags = useMemo(() => {
    if (!selectedRule?.tagIds) return [];
    return selectedRule.tagIds
      .map((tagId) => appTags.find((t) => t.id === tagId))
      .filter(Boolean) as { id: string; name: string }[];
  }, [selectedRule?.tagIds, appTags]);

  // Filtered tag suggestions based on input
  const tagSuggestions = useMemo(() => {
    if (!tagInputValue.trim()) return appTags;
    const query = tagInputValue.toLowerCase();
    return appTags.filter(
      (tag) => tag.name.toLowerCase().includes(query) && !selectedRule?.tagIds?.includes(tag.id),
    );
  }, [tagInputValue, appTags, selectedRule?.tagIds]);

  // Reset state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setTagInputValue('');
      setIsTagInputOpen(false);
    }
  }, [isOpen]);

  // Event handlers
  const handleCategoryChange = (categoryId: string) => {
    if (selectedRule) {
      updateRule(selectedRule.id, { categoryId: categoryId || undefined });
    }
  };

  const handleAddTag = async (tagName: string) => {
    if (selectedRule && tagName.trim()) {
      const trimmedName = tagName.trim();

      // Check if tag already exists in appStore
      let existingTag = appTags.find((t) => t.name.toLowerCase() === trimmedName.toLowerCase());

      // If new tag, add to appStore first
      if (!existingTag) {
        try {
          existingTag = await addGlobalTag(trimmedName);
        } catch (error) {
          console.error('Failed to add tag to global store:', error);
          return;
        }
      }

      if (existingTag) {
        const newTagIds = [...(selectedRule.tagIds || []), existingTag.id];
        updateRule(selectedRule.id, { tagIds: newTagIds });
      }

      setTagInputValue('');
      setIsTagInputOpen(false);
    }
  };

  const handleRemoveTag = (tagId: string) => {
    if (selectedRule) {
      const newTagIds = selectedRule.tagIds.filter((t) => t !== tagId);
      updateRule(selectedRule.id, { tagIds: newTagIds });
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

  const handleGlobalToggle = async (enabled: boolean) => {
    if (!selectedRule || isSetting) return;

    if (enabled) {
      await setGlobal(selectedRule.id);
    } else {
      await unsetGlobal(selectedRule.id);
    }
  };

  const handleOpenInFinder = async () => {
    if (selectedRule?.sourcePath) {
      await safeInvoke('reveal_in_finder', { path: selectedRule.sourcePath });
    }
  };

  // NOW we can do conditional rendering (after all hooks)
  // If no rule, render empty SlidePanel to maintain animation
  if (!selectedRule) {
    return (
      <SlidePanel isOpen={isOpen} onClose={onClose} width={800} header={null}>
        <div />
      </SlidePanel>
    );
  }

  // Detail Header content
  const detailHeader = (
    <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
      {/* Icon - 36x36, bg #F4F4F5, cornerRadius 8px */}
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#F4F4F5]">
        <FileText className="h-5 w-5 text-[#71717A]" />
      </div>

      {/* Title Wrap - gap 2px */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="text-[15px] font-semibold text-[#18181B]">{selectedRule.name}</h2>
        <p
          className="w-full truncate text-xs font-normal text-[#71717A]"
          title={selectedRule.sourcePath}
        >
          {selectedRule.sourcePath}
        </p>
      </div>
    </div>
  );

  // Detail Content
  const detailContent = (
    <div className="flex flex-col gap-7">
      {/* Info Row - Imported, File Size, Lines, Scenes */}
      <div className="flex gap-8">
        <InfoItem label="Imported" value={formatDate(selectedRule.createdAt)} />
        <InfoItem label="File Size" value={formatFileSize(selectedRule.size)} />
        <InfoItem
          label="Lines"
          value={`${countLines(selectedRule.content).toLocaleString()} lines`}
        />
        <InfoItem
          label="Scenes"
          value={`${usedInScenes.length} ${usedInScenes.length === 1 ? 'scene' : 'scenes'}`}
        />
      </div>

      {/* Category & Tags Section */}
      <div className="flex flex-col gap-4">
        {/* Category Item */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium text-[#71717A]">Category</span>
          <CategoryTreeDropdown
            categories={categories}
            value={selectedRule.categoryId || ''}
            onChange={handleCategoryChange}
            placeholder="Select category"
            compact
            className="w-fit"
          />
        </div>

        {/* Tags Item */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium text-[#71717A]">Tags</span>
          <div className="flex flex-wrap items-center gap-2">
            {ruleTags.map((tag) => (
              <RemovableTag key={tag.id} name={tag.name} onRemove={() => handleRemoveTag(tag.id)} />
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
                className="flex items-center gap-1 rounded-md border border-[#E5E5E5] px-2.5 py-1.5 text-[#A1A1AA] transition-colors hover:bg-[#FAFAFA]"
              >
                <Plus className="h-3 w-3" />
                <span className="text-xs font-medium">Add</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content Section - gap 12px */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-[#18181B]">Content</h3>
        <div
          className="overflow-y-auto rounded-lg border border-[#E5E5E5] bg-white p-4"
          style={{ maxHeight: '480px' }}
        >
          {selectedRule.content ? (
            <MarkdownBody source={selectedRule.content} />
          ) : (
            <span className="text-xs text-[#A1A1AA]">No content available</span>
          )}
        </div>
      </section>

      {/* Configuration Section - per-rule global toggle */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-[#18181B]">Configuration</h3>
        <div className="overflow-hidden rounded-lg border border-[#E5E5E5]">
          {/* Set as Global Row - padding 16px. Per-rule; toggling does not
              affect any other rule's isGlobal flag. */}
          <div className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[#18181B]">Set as Global</span>
              <span className="text-xs font-normal text-[#71717A]">
                Mirror to ~/.claude/rules/{selectedRule.filename}
              </span>
            </div>
            <Toggle
              checked={selectedRule.isGlobal}
              onChange={handleGlobalToggle}
              disabled={isSetting}
            />
          </div>
        </div>
      </section>

      {/* Source Section - filename + path, both read-only */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-[#18181B]">Source</h3>
        <div className="flex flex-col gap-3 rounded-lg border border-[#E5E5E5] p-4">
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-normal text-[#71717A]">Filename</span>
            <span className="truncate font-mono text-[13px] font-normal text-[#18181B]">
              {selectedRule.filename}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-normal text-[#71717A]">Location</span>
            <span className="truncate font-mono text-[13px] font-normal text-[#18181B]">
              {selectedRule.sourcePath}
            </span>
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
      </section>

      {/* Used in Scenes Section - gap 12px */}
      <section className="flex flex-col gap-3">
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
      </section>
    </div>
  );

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      width={800}
      header={detailHeader}
      headerRight={null}
    >
      {detailContent}
    </SlidePanel>
  );
}

export default RuleDetailPanel;
