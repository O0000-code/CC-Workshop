// src/pages/ClaudeMdPage.tsx

import React, { useState, useMemo } from 'react';
import { FileText, FileSearch2, Download, Loader2, Sparkles, Check } from 'lucide-react';
import { PageHeader } from '@/components/layout';
import { ClaudeMdCard } from '@/components/claude-md/ClaudeMdCard';
import { ClaudeMdDetailPanel } from '@/components/claude-md/ClaudeMdDetailPanel';
import { ImportClaudeMdModal } from '@/components/modals/ImportClaudeMdModal';
import { ScanClaudeMdModal } from '@/components/modals/ScanClaudeMdModal';
import { IconPicker, Button, ViewOptionsMenu, type ViewOption } from '@/components/common';
import { useClaudeMdStore } from '@/stores/claudeMdStore';
import { useAppStore } from '@/stores/appStore';
import { useSortPreferencesStore } from '@/stores/sortPreferencesStore';
import type { Category, Tag } from '@/types';
import type { ClaudeMdFile } from '@/types/claudeMd';

// ============================================================================
// Sort + Group options
// ============================================================================
// Global-first is an implicit secondary key in every sort option so the
// global CLAUDE.md always pins to the top regardless of the chosen primary
// axis. Group buckets follow sidebar order (categories) / explicit tag order
// (tags); see SkillsPage for the parallel rationale.
const CLAUDE_MD_SORT_OPTIONS: ViewOption[] = [
  { value: 'name', label: 'Name (A → Z)' },
  { value: 'recent', label: 'Recently created' },
  { value: 'updated', label: 'Recently updated' },
];

const CLAUDE_MD_GROUP_OPTIONS: ViewOption[] = [
  { value: 'none', label: 'None' },
  { value: 'categories', label: 'Categories' },
  { value: 'tags', label: 'Tags' },
];

interface GroupBucket<T> {
  group: { id: string; label: string; count: number } | null;
  items: T[];
}

function groupClaudeMdFiles(
  items: ClaudeMdFile[],
  groupBy: string,
  categories: Category[],
  appTags: Tag[],
): GroupBucket<ClaudeMdFile>[] {
  if (groupBy === 'categories') {
    const buckets = new Map<string, ClaudeMdFile[]>();
    for (const item of items) {
      const key = item.categoryId || '';
      const list = buckets.get(key) ?? [];
      list.push(item);
      buckets.set(key, list);
    }
    const out: GroupBucket<ClaudeMdFile>[] = [];
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
    // CLAUDE.md uses tagIds (not tag names), so resolve each id to its Tag
    // object via the global appStore tag list before bucketing.
    const tagById = new Map(appTags.map((t) => [t.id, t]));
    const buckets = new Map<string, ClaudeMdFile[]>();
    const untagged: ClaudeMdFile[] = [];
    for (const item of items) {
      const ids = item.tagIds ?? [];
      if (ids.length === 0) {
        untagged.push(item);
        continue;
      }
      let placed = false;
      for (const tagId of ids) {
        if (!tagById.has(tagId)) continue;
        const list = buckets.get(tagId) ?? [];
        list.push(item);
        buckets.set(tagId, list);
        placed = true;
      }
      if (!placed) untagged.push(item);
    }
    const out: GroupBucket<ClaudeMdFile>[] = [];
    for (const tag of appTags) {
      const bucket = buckets.get(tag.id);
      if (bucket && bucket.length > 0) {
        out.push({
          group: { id: tag.id, label: tag.name.toUpperCase(), count: bucket.length },
          items: bucket,
        });
      }
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

function applyClaudeMdSort(items: ClaudeMdFile[], sortBy: string): ClaudeMdFile[] {
  const globalFirst =
    (cmp: (a: ClaudeMdFile, b: ClaudeMdFile) => number) => (a: ClaudeMdFile, b: ClaudeMdFile) => {
      if (a.isGlobal !== b.isGlobal) return a.isGlobal ? -1 : 1;
      return cmp(a, b);
    };
  const sorted = [...items];
  switch (sortBy) {
    case 'name':
      sorted.sort(globalFirst((a, b) => a.name.localeCompare(b.name)));
      break;
    case 'recent':
      sorted.sort(globalFirst((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')));
      break;
    case 'updated':
      sorted.sort(globalFirst((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')));
      break;
    default:
      sorted.sort(globalFirst((a, b) => a.name.localeCompare(b.name)));
  }
  return sorted;
}

// ============================================================================
// Empty State Icon Component (Custom document icon matching design)
// ============================================================================

/**
 * EmptyStateDocIcon Component
 *
 * Custom document icon matching the design spec:
 * - 36x44 frame with line-based document illustration
 * - Stroke color: #D4D4D8 for outer, #E5E5E5 for inner details
 */
const EmptyStateDocIcon: React.FC = () => {
  return (
    <svg width="36" height="44" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Document outline with folded corner */}
      <path d="M0 0V44H36V10L26 0H0Z" stroke="#D4D4D8" strokeWidth="1.5" fill="none" />
      {/* Fold lines */}
      <path d="M26 0V10H36" stroke="#E5E5E5" strokeWidth="1" fill="none" />
      {/* Text lines */}
      <line x1="7" y1="18" x2="29" y2="18" stroke="#E5E5E5" strokeWidth="1.5" />
      <line x1="7" y1="26" x2="23" y2="26" stroke="#E5E5E5" strokeWidth="1.5" />
      <line x1="7" y1="34" x2="19" y2="34" stroke="#E5E5E5" strokeWidth="1.5" />
    </svg>
  );
};

// ============================================================================
// Empty State Component (Custom for CLAUDE.md page)
// ============================================================================

/**
 * ClaudeMdEmptyState Component
 *
 * Shows when there are no CLAUDE.md files.
 *
 * Design specs (from design 6zwvB):
 * - Icon: Custom document SVG, 36x44
 * - Title: "No CLAUDE.md files", 14px, 500, #A1A1AA
 * - Description: "Import files or scan your system to get started", 13px, normal, #D4D4D8, text-align center
 * - No buttons (buttons are in header only)
 * - gap: 20px between icon and text group
 * - gap: 6px between title and description
 */
const ClaudeMdEmptyState: React.FC = () => {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      {/* Empty State Container - gap 20px */}
      <div className="flex flex-col items-center gap-5">
        {/* Document Icon - 36x44 */}
        <EmptyStateDocIcon />

        {/* Text Group - gap 6px */}
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-sm font-medium tracking-[-0.2px] text-[#A1A1AA]">
            No CLAUDE.md files
          </span>
          <span className="text-[13px] font-normal text-[#D4D4D8] text-center">
            Import files or scan your system to get started
          </span>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// ClaudeMdPage Component
// ============================================================================

/**
 * ClaudeMdPage Component
 *
 * Main page for managing CLAUDE.md files.
 *
 * Features:
 * - Header with title, Scan System and Import buttons
 * - Empty state when no files
 * - File list with ClaudeMdCard components
 * - Slide panel for detail view
 *
 * Design specs:
 * - Header height: 56px
 * - Header padding: 0 28px
 * - Content padding: 24px 28px
 * - Card gap: 12px
 */
export function ClaudeMdPage() {
  // Store
  const {
    files,
    filter,
    setFilter,
    selectedFileId,
    selectFile,
    deleteFile,
    loadFiles,
    updateFile,
    isLoading,
    isScanning,
    isAutoClassifying,
    classifySuccess,
    isFadingOut,
    showRestoreAnimation,
    autoClassify,
    error,
    clearError,
  } = useClaudeMdStore();

  // Local state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);

  // Icon Picker state
  const [iconPickerState, setIconPickerState] = useState<{
    isOpen: boolean;
    fileId: string | null;
    triggerRef: React.RefObject<HTMLDivElement> | null;
  }>({ isOpen: false, fileId: null, triggerRef: null });

  const sortBy = useSortPreferencesStore((s) => s.sort.claudeMd);
  const groupBy = useSortPreferencesStore((s) => s.group.claudeMd);
  const setSortFor = useSortPreferencesStore((s) => s.setSortFor);
  const setGroupFor = useSortPreferencesStore((s) => s.setGroupFor);

  const { categories, tags: appTags } = useAppStore();

  // Get filtered files - compute in component to ensure reactivity
  const filteredFiles = useMemo(() => {
    let filtered = [...files];

    // Search filter
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      filtered = filtered.filter(
        (file) =>
          file.name.toLowerCase().includes(searchLower) ||
          file.description.toLowerCase().includes(searchLower) ||
          file.content.toLowerCase().includes(searchLower),
      );
    }

    // Category filter
    if (filter.categoryId) {
      filtered = filtered.filter((file) => file.categoryId === filter.categoryId);
    }

    // Tags filter
    if (filter.tagIds && filter.tagIds.length > 0) {
      filtered = filtered.filter((file) => filter.tagIds.some((tag) => file.tagIds.includes(tag)));
    }

    // Global only filter
    if (filter.showGlobalOnly) {
      filtered = filtered.filter((file) => file.isGlobal);
    }

    // Sorting is delegated to `applyClaudeMdSort`, which folds in the
    // global-first secondary key for every option.
    return applyClaudeMdSort(filtered, sortBy);
  }, [files, filter, sortBy]);

  const groupedFiles = useMemo(
    () => groupClaudeMdFiles(filteredFiles, groupBy, categories, appTags),
    [filteredFiles, groupBy, categories, appTags],
  );

  // Status text. Plain mode: "{N} files · {M} global". Group modes shift to
  // "{N} files across {K} categories|tags" — the count is unique-by-file so
  // the surfaced number stays honest even when Tags grouping multiplies the
  // visible rows across buckets.
  const statusText = useMemo(() => {
    const count = filteredFiles.length;
    const filesLabel = `${count} ${count === 1 ? 'file' : 'files'}`;
    if (count === 0) return filesLabel;
    if (groupBy === 'tags') {
      const tagBuckets = groupedFiles.filter((b) => b.group && b.group.id !== '__untagged__');
      if (tagBuckets.length === 0) return filesLabel;
      return `${filesLabel} across ${tagBuckets.length} ${
        tagBuckets.length === 1 ? 'tag' : 'tags'
      }`;
    }
    if (groupBy === 'categories') {
      const catBuckets = groupedFiles.filter((b) => b.group && b.group.id !== '__uncategorized__');
      if (catBuckets.length === 0) return filesLabel;
      return `${filesLabel} across ${catBuckets.length} ${
        catBuckets.length === 1 ? 'category' : 'categories'
      }`;
    }
    const globalCount = filteredFiles.filter((f) => f.isGlobal).length;
    return `${filesLabel} · ${globalCount} global`;
  }, [filteredFiles, groupBy, groupedFiles]);

  // Get selected file
  const selectedFile = useMemo(
    () => files.find((f) => f.id === selectedFileId) || null,
    [files, selectedFileId],
  );

  // Note: Files are already loaded in MainLayout, no need to load here
  // This prevents the flickering caused by redundant loading state changes

  // Handlers
  const handleSearchChange = (value: string) => {
    setFilter({ search: value });
  };

  const handleFileClick = (id: string) => {
    selectFile(id);
  };

  const handleCloseDetail = () => {
    selectFile(null);
  };

  const handleDelete = (id: string) => {
    deleteFile(id);
  };

  const handleScan = () => {
    setIsScanModalOpen(true);
  };

  const handleImport = () => {
    setIsImportModalOpen(true);
  };

  const handleImportComplete = () => {
    loadFiles();
  };

  // Handle icon click from list
  const handleIconClick = (fileId: string, ref: React.RefObject<HTMLDivElement>) => {
    setIconPickerState({ isOpen: true, fileId, triggerRef: ref });
  };

  // Handle icon change
  const handleIconChange = async (iconName: string) => {
    if (iconPickerState.fileId) {
      await updateFile(iconPickerState.fileId, { icon: iconName });
    }
    setIconPickerState({ isOpen: false, fileId: null, triggerRef: null });
  };

  // Handle icon picker close
  const handleIconPickerClose = () => {
    setIconPickerState({ isOpen: false, fileId: null, triggerRef: null });
  };

  // ============================================================================
  // Header Buttons
  // ============================================================================

  // Header actions - always show Scan System, Import and Auto Classify buttons
  // Auto Classify should be on the rightmost position
  const headerActions = (
    <div className="flex items-center gap-2.5">
      {/* Scan System Button - Secondary style, icon=file-search */}
      <Button
        variant="secondary"
        size="small"
        icon={isScanning ? <Loader2 className="animate-spin" /> : <FileSearch2 />}
        onClick={handleScan}
        disabled={isScanning}
      >
        {isScanning ? 'Scanning...' : 'Scan System'}
      </Button>

      {/* Import Button - Secondary style, icon=download */}
      <Button variant="secondary" size="small" icon={<Download />} onClick={handleImport}>
        Import
      </Button>

      {/* Auto Classify Button - rightmost position */}
      <Button
        variant="secondary"
        size="small"
        icon={
          isAutoClassifying ? (
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
        disabled={isAutoClassifying || classifySuccess || files.length === 0}
        className={`w-[132px] ${isAutoClassifying ? 'ai-classifying' : ''} ${classifySuccess ? 'classify-success-bg' : ''} ${isFadingOut ? 'classify-fading-out' : ''}`}
      >
        {isAutoClassifying ? (
          <span className="ai-classifying-text">Classifying...</span>
        ) : classifySuccess ? (
          <span className={`ai-classifying-text ${isFadingOut ? 'classify-fading-out' : ''}`}>
            Done!
          </span>
        ) : (
          <span className={showRestoreAnimation ? 'classify-fade-in' : ''}>Auto Classify</span>
        )}
      </Button>
    </div>
  );

  // ============================================================================
  // Render - Single JSX structure to prevent flickering
  // ============================================================================

  // Determine content to show
  const showEmptyState = files.length === 0 && !filter.search;
  const showNoResults = !isLoading && filteredFiles.length === 0 && filter.search;

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Header */}
      <PageHeader
        title="CLAUDE.md Files"
        searchValue={filter.search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search files..."
        actions={headerActions}
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
          ${selectedFileId ? 'mr-[800px]' : ''}
        `}
      >
        {/* Status line — count + context | View Options (Group + Sort) */}
        {!isLoading && filteredFiles.length > 0 && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-[11px] text-[#A1A1AA]">{statusText}</span>
            <ViewOptionsMenu
              sections={[
                {
                  id: 'group',
                  label: 'GROUP BY',
                  options: CLAUDE_MD_GROUP_OPTIONS,
                  value: groupBy,
                  onChange: (v) => setGroupFor('claudeMd', v),
                },
                {
                  id: 'sort',
                  label: 'SORT BY',
                  options: CLAUDE_MD_SORT_OPTIONS,
                  value: sortBy,
                  onChange: (v) => setSortFor('claudeMd', v),
                },
              ]}
            />
          </div>
        )}

        {/* Loading state */}
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#71717A]" />
          </div>
        ) : showEmptyState ? (
          /* Empty state - no files imported yet */
          <ClaudeMdEmptyState />
        ) : showNoResults ? (
          /* No results for search */
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F4F4F5]">
              <FileText className="h-8 w-8 text-[#A1A1AA]" />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-medium text-[#71717A]">No files found</h3>
              <p className="mt-1 text-[13px] text-[#A1A1AA]">No files match "{filter.search}"</p>
            </div>
          </div>
        ) : (
          /* File List — flat when groupBy === 'none', sectioned otherwise.
             Section header style mirrors the sidebar's MARKETPLACE / LIBRARY
             labels. */
          <div className="flex flex-col">
            {groupedFiles.map((bucket, idx) => (
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
                  {bucket.items.map((file) => (
                    <ClaudeMdCard
                      key={`${bucket.group?.id ?? 'all'}::${file.id}`}
                      file={file}
                      compact={!!selectedFileId}
                      onClick={() => handleFileClick(file.id)}
                      onDelete={() => handleDelete(file.id)}
                      onIconClick={(ref) => handleIconClick(file.id, ref)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Detail Panel with SlidePanel */}
      <ClaudeMdDetailPanel
        file={selectedFile}
        isOpen={!!selectedFileId}
        onClose={handleCloseDetail}
      />

      {/* Import Modal */}
      <ImportClaudeMdModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={handleImportComplete}
      />

      {/* Scan Modal */}
      <ScanClaudeMdModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        onImportComplete={handleImportComplete}
      />

      {/* Icon Picker */}
      {iconPickerState.triggerRef && (
        <IconPicker
          value={files.find((f) => f.id === iconPickerState.fileId)?.icon || 'file-text'}
          onChange={handleIconChange}
          triggerRef={iconPickerState.triggerRef}
          isOpen={iconPickerState.isOpen}
          onClose={handleIconPickerClose}
        />
      )}
    </div>
  );
}

export default ClaudeMdPage;
