import React, { useState, useMemo, useRef, useEffect } from 'react';
import { FileText, FolderOpen, Layers, X, Plus } from 'lucide-react';
import { SlidePanel } from '@/components/layout';
import { Toggle, CategoryTreeDropdown, Button } from '@/components/common';
import { MarkdownBody } from '@/components/marketplace/MarkdownBody';
import { safeInvoke } from '@/utils/tauri';
import { useClaudeMdStore } from '@/stores/claudeMdStore';
import { useAppStore } from '@/stores/appStore';
import { useScenesStore } from '@/stores/scenesStore';
import { isEnterCommit } from '@/utils/keyboard';
import type { ClaudeMdFile, ClaudeMdType } from '@/types/claudeMd';

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

function getTypeLabel(type: ClaudeMdType): string {
  switch (type) {
    case 'global':
      return 'User Configuration';
    case 'project':
      return 'Project Configuration';
    case 'local':
      return 'Local Configuration';
    default:
      return 'Configuration';
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
// ClaudeMdDetailPanel Props
// ============================================================================

export interface ClaudeMdDetailPanelProps {
  file: ClaudeMdFile | null;
  isOpen: boolean;
  onClose: () => void;
}

// ============================================================================
// ClaudeMdDetailPanel Component
// ============================================================================

export function ClaudeMdDetailPanel({ file, isOpen, onClose }: ClaudeMdDetailPanelProps) {
  // ALL HOOKS MUST BE CALLED FIRST - before any conditional returns
  const { files, updateFile, setGlobal, unsetGlobal, isSetting } = useClaudeMdStore();

  const { categories, tags: appTags, addTag: addGlobalTag } = useAppStore();
  const { scenes } = useScenesStore();

  // Tag input state
  const [tagInputValue, setTagInputValue] = useState('');
  const [isTagInputOpen, setIsTagInputOpen] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Get the latest file data from store (in case it's updated)
  const selectedFile = useMemo(
    () => (file ? files.find((f) => f.id === file.id) || file : null),
    [files, file],
  );

  // Get scenes that use the selected CLAUDE.md file
  const usedInScenes = useMemo(() => {
    if (!selectedFile) return [];
    return scenes.filter((scene) => scene.claudeMdIds?.includes(selectedFile.id));
  }, [scenes, selectedFile]);

  // V2 §5.9 row 6: ClaudeMd was already categoryId-keyed; the only change is
  // switching to the hierarchy-aware tree dropdown so children are indented.

  // Get tag names from IDs
  const fileTags = useMemo(() => {
    if (!selectedFile?.tagIds) return [];
    return selectedFile.tagIds
      .map((tagId) => appTags.find((t) => t.id === tagId))
      .filter(Boolean) as { id: string; name: string }[];
  }, [selectedFile?.tagIds, appTags]);

  // Filtered tag suggestions based on input
  const tagSuggestions = useMemo(() => {
    if (!tagInputValue.trim()) return appTags;
    const query = tagInputValue.toLowerCase();
    return appTags.filter(
      (tag) => tag.name.toLowerCase().includes(query) && !selectedFile?.tagIds?.includes(tag.id),
    );
  }, [tagInputValue, appTags, selectedFile?.tagIds]);

  // Reset state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setTagInputValue('');
      setIsTagInputOpen(false);
    }
  }, [isOpen]);

  // Event handlers
  const handleCategoryChange = (categoryId: string) => {
    if (selectedFile) {
      updateFile(selectedFile.id, { categoryId: categoryId || undefined });
    }
  };

  const handleAddTag = async (tagName: string) => {
    if (selectedFile && tagName.trim()) {
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
        const newTagIds = [...(selectedFile.tagIds || []), existingTag.id];
        updateFile(selectedFile.id, { tagIds: newTagIds });
      }

      setTagInputValue('');
      setIsTagInputOpen(false);
    }
  };

  const handleRemoveTag = (tagId: string) => {
    if (selectedFile) {
      const newTagIds = selectedFile.tagIds.filter((t) => t !== tagId);
      updateFile(selectedFile.id, { tagIds: newTagIds });
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
    if (!selectedFile || isSetting) return;

    if (enabled) {
      await setGlobal(selectedFile.id);
    } else {
      await unsetGlobal();
    }
  };

  const handleOpenInFinder = async () => {
    if (selectedFile?.sourcePath) {
      await safeInvoke('reveal_in_finder', { path: selectedFile.sourcePath });
    }
  };

  // NOW we can do conditional rendering (after all hooks)
  // If no file, render empty SlidePanel to maintain animation
  if (!selectedFile) {
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
        <h2 className="text-[15px] font-semibold text-[#18181B]">{selectedFile.name}</h2>
        <p
          className="w-full truncate text-xs font-normal text-[#71717A]"
          title={selectedFile.sourcePath}
        >
          {selectedFile.sourcePath}
        </p>
      </div>
    </div>
  );

  // Detail Content
  const detailContent = (
    <div className="flex flex-col gap-7">
      {/* Info Row - Imported, File Size, Lines, Scenes */}
      <div className="flex gap-8">
        <InfoItem label="Imported" value={formatDate(selectedFile.createdAt)} />
        <InfoItem label="File Size" value={formatFileSize(selectedFile.size)} />
        <InfoItem
          label="Lines"
          value={`${countLines(selectedFile.content).toLocaleString()} lines`}
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
            value={selectedFile.categoryId || ''}
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
            {fileTags.map((tag) => (
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
          {selectedFile.content ? (
            <MarkdownBody source={selectedFile.content} />
          ) : (
            <span className="text-xs text-[#A1A1AA]">No content available</span>
          )}
        </div>
      </section>

      {/* Configuration Section - gap 12px */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-[#18181B]">Configuration</h3>
        <div className="overflow-hidden rounded-lg border border-[#E5E5E5]">
          {/* Set as Global Row - padding 16px */}
          <div className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[#18181B]">Set as Global</span>
              <span className="text-xs font-normal text-[#71717A]">
                Use this as ~/.claude/CLAUDE.md
              </span>
            </div>
            <Toggle
              checked={selectedFile.isGlobal}
              onChange={handleGlobalToggle}
              disabled={isSetting}
            />
          </div>
        </div>
      </section>

      {/* Source Section - gap 12px */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-[#18181B]">Source</h3>
        <div className="flex flex-col gap-3 rounded-lg border border-[#E5E5E5] p-4">
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-normal text-[#71717A]">Type</span>
            <span className="text-[13px] font-normal text-[#18181B]">
              {getTypeLabel(selectedFile.sourceType)}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-normal text-[#71717A]">Location</span>
            <span className="truncate font-mono text-[13px] font-normal text-[#18181B]">
              {selectedFile.sourcePath}
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

export default ClaudeMdDetailPanel;
