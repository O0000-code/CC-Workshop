// src/pages/RulesPage.tsx
//
// Mirrors `ClaudeMdPage.tsx`. Differences (per
// `.dev/rule-management/01_design.md`):
//   * No "global first" sort secondary key — multiple Rules may be global
//     simultaneously, so pinning any single one to the top is meaningless.
//     Sort options are pure name / recent / updated.
//   * The status line shows "{N} global" using the per-rule `isGlobal` count
//     (not a singleton).

import React, { useState, useMemo } from 'react';
import { FileText, FileSearch2, Download, Loader2, Sparkles, Check } from 'lucide-react';
import { PageHeader } from '@/components/layout';
import { RuleCard } from '@/components/rules/RuleCard';
import { RuleDetailPanel } from '@/components/rules/RuleDetailPanel';
import { ImportRuleModal } from '@/components/modals/ImportRuleModal';
import { ScanRuleModal } from '@/components/modals/ScanRuleModal';
import { IconPicker, Button, ViewOptionsMenu, type ViewOption } from '@/components/common';
import { useRulesStore } from '@/stores/rulesStore';
import { useAppStore } from '@/stores/appStore';
import { useSortPreferencesStore } from '@/stores/sortPreferencesStore';
import type { Category, Tag } from '@/types';
import type { Rule } from '@/types/rule';

// ============================================================================
// Sort + Group options
// ============================================================================

const RULE_SORT_OPTIONS: ViewOption[] = [
  { value: 'name', label: 'Name (A → Z)' },
  { value: 'recent', label: 'Recently created' },
  { value: 'updated', label: 'Recently updated' },
];

const RULE_GROUP_OPTIONS: ViewOption[] = [
  { value: 'none', label: 'None' },
  { value: 'categories', label: 'Categories' },
  { value: 'tags', label: 'Tags' },
];

interface GroupBucket<T> {
  group: { id: string; label: string; count: number } | null;
  items: T[];
}

function groupRules(
  items: Rule[],
  groupBy: string,
  categories: Category[],
  appTags: Tag[],
): GroupBucket<Rule>[] {
  if (groupBy === 'categories') {
    const buckets = new Map<string, Rule[]>();
    for (const item of items) {
      const key = item.categoryId || '';
      const list = buckets.get(key) ?? [];
      list.push(item);
      buckets.set(key, list);
    }
    const out: GroupBucket<Rule>[] = [];
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
    const tagById = new Map(appTags.map((t) => [t.id, t]));
    const buckets = new Map<string, Rule[]>();
    const untagged: Rule[] = [];
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
    const out: GroupBucket<Rule>[] = [];
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

function applyRuleSort(items: Rule[], sortBy: string): Rule[] {
  // No "global first" secondary key — per-rule isGlobal flag is not a
  // singleton, so it is not a meaningful pin axis.
  const sorted = [...items];
  switch (sortBy) {
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'recent':
      sorted.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      break;
    case 'updated':
      sorted.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
      break;
    default:
      sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
  return sorted;
}

// ============================================================================
// Empty State Icon Component (matches CLAUDE.md page)
// ============================================================================

const EmptyStateDocIcon: React.FC = () => {
  return (
    <svg width="36" height="44" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 0V44H36V10L26 0H0Z" stroke="#D4D4D8" strokeWidth="1.5" fill="none" />
      <path d="M26 0V10H36" stroke="#E5E5E5" strokeWidth="1" fill="none" />
      <line x1="7" y1="18" x2="29" y2="18" stroke="#E5E5E5" strokeWidth="1.5" />
      <line x1="7" y1="26" x2="23" y2="26" stroke="#E5E5E5" strokeWidth="1.5" />
      <line x1="7" y1="34" x2="19" y2="34" stroke="#E5E5E5" strokeWidth="1.5" />
    </svg>
  );
};

const RulesEmptyState: React.FC = () => {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-5">
        <EmptyStateDocIcon />
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-sm font-medium tracking-[-0.2px] text-[#A1A1AA]">No Rules</span>
          <span className="text-[13px] font-normal text-[#D4D4D8] text-center">
            Import rules or scan your system to get started
          </span>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// RulesPage Component
// ============================================================================

export function RulesPage() {
  // Store
  const {
    rules,
    filter,
    setFilter,
    selectedRuleId,
    selectRule,
    deleteRule,
    loadRules,
    updateRule,
    isLoading,
    isScanning,
    isAutoClassifying,
    classifySuccess,
    isFadingOut,
    showRestoreAnimation,
    autoClassify,
    error,
    clearError,
  } = useRulesStore();

  // Local state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);

  // Icon Picker state
  const [iconPickerState, setIconPickerState] = useState<{
    isOpen: boolean;
    ruleId: string | null;
    triggerRef: React.RefObject<HTMLDivElement> | null;
  }>({ isOpen: false, ruleId: null, triggerRef: null });

  const sortBy = useSortPreferencesStore((s) => s.sort.rules);
  const groupBy = useSortPreferencesStore((s) => s.group.rules);
  const setSortFor = useSortPreferencesStore((s) => s.setSortFor);
  const setGroupFor = useSortPreferencesStore((s) => s.setGroupFor);

  const { categories, tags: appTags } = useAppStore();

  // Get filtered rules - compute in component to ensure reactivity
  const filteredRules = useMemo(() => {
    let filtered = [...rules];

    // Search filter
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      filtered = filtered.filter(
        (rule) =>
          rule.name.toLowerCase().includes(searchLower) ||
          rule.description.toLowerCase().includes(searchLower) ||
          rule.content.toLowerCase().includes(searchLower),
      );
    }

    // Category filter
    if (filter.categoryId) {
      filtered = filtered.filter((rule) => rule.categoryId === filter.categoryId);
    }

    // Tags filter
    if (filter.tagIds && filter.tagIds.length > 0) {
      filtered = filtered.filter((rule) => filter.tagIds.some((tag) => rule.tagIds.includes(tag)));
    }

    // Global only filter
    if (filter.showGlobalOnly) {
      filtered = filtered.filter((rule) => rule.isGlobal);
    }

    return applyRuleSort(filtered, sortBy);
  }, [rules, filter, sortBy]);

  const groupedRules = useMemo(
    () => groupRules(filteredRules, groupBy, categories, appTags),
    [filteredRules, groupBy, categories, appTags],
  );

  // Status text. Plain mode: "{N} rules · {M} global". Group modes shift to
  // "{N} rules across {K} categories|tags".
  const statusText = useMemo(() => {
    const count = filteredRules.length;
    const rulesLabel = `${count} ${count === 1 ? 'rule' : 'rules'}`;
    if (count === 0) return rulesLabel;
    if (groupBy === 'tags') {
      const tagBuckets = groupedRules.filter((b) => b.group && b.group.id !== '__untagged__');
      if (tagBuckets.length === 0) return rulesLabel;
      return `${rulesLabel} across ${tagBuckets.length} ${
        tagBuckets.length === 1 ? 'tag' : 'tags'
      }`;
    }
    if (groupBy === 'categories') {
      const catBuckets = groupedRules.filter((b) => b.group && b.group.id !== '__uncategorized__');
      if (catBuckets.length === 0) return rulesLabel;
      return `${rulesLabel} across ${catBuckets.length} ${
        catBuckets.length === 1 ? 'category' : 'categories'
      }`;
    }
    const globalCount = filteredRules.filter((r) => r.isGlobal).length;
    return `${rulesLabel} · ${globalCount} global`;
  }, [filteredRules, groupBy, groupedRules]);

  // Get selected rule
  const selectedRule = useMemo(
    () => rules.find((r) => r.id === selectedRuleId) || null,
    [rules, selectedRuleId],
  );

  // Note: Rules are loaded in MainLayout. No load here to prevent flicker.

  // Handlers
  const handleSearchChange = (value: string) => {
    setFilter({ search: value });
  };

  const handleRuleClick = (id: string) => {
    selectRule(id);
  };

  const handleCloseDetail = () => {
    selectRule(null);
  };

  const handleDelete = (id: string) => {
    deleteRule(id);
  };

  const handleScan = () => {
    setIsScanModalOpen(true);
  };

  const handleImport = () => {
    setIsImportModalOpen(true);
  };

  const handleImportComplete = () => {
    loadRules();
  };

  // Handle icon click from list
  const handleIconClick = (ruleId: string, ref: React.RefObject<HTMLDivElement>) => {
    setIconPickerState({ isOpen: true, ruleId, triggerRef: ref });
  };

  // Handle icon change
  const handleIconChange = async (iconName: string) => {
    if (iconPickerState.ruleId) {
      await updateRule(iconPickerState.ruleId, { icon: iconName });
    }
    setIconPickerState({ isOpen: false, ruleId: null, triggerRef: null });
  };

  // Handle icon picker close
  const handleIconPickerClose = () => {
    setIconPickerState({ isOpen: false, ruleId: null, triggerRef: null });
  };

  // ============================================================================
  // Header Buttons
  // ============================================================================

  const headerActions = (
    <div className="flex items-center gap-2.5">
      {/* Scan System Button */}
      <Button
        variant="secondary"
        size="small"
        icon={isScanning ? <Loader2 className="animate-spin" /> : <FileSearch2 />}
        onClick={handleScan}
        disabled={isScanning}
      >
        {isScanning ? 'Scanning...' : 'Scan System'}
      </Button>

      {/* Import Button */}
      <Button variant="secondary" size="small" icon={<Download />} onClick={handleImport}>
        Import
      </Button>

      {/* Auto Classify Button */}
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
        disabled={isAutoClassifying || classifySuccess || rules.length === 0}
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
  // Render
  // ============================================================================

  const showEmptyState = rules.length === 0 && !filter.search;
  const showNoResults = !isLoading && filteredRules.length === 0 && filter.search;

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Header */}
      <PageHeader
        title="Rules"
        searchValue={filter.search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search rules..."
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
          ${selectedRuleId ? 'mr-[800px]' : ''}
        `}
      >
        {/* Status line — count + context | View Options (Group + Sort) */}
        {!isLoading && filteredRules.length > 0 && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-[11px] text-[#A1A1AA]">{statusText}</span>
            <ViewOptionsMenu
              sections={[
                {
                  id: 'group',
                  label: 'GROUP BY',
                  options: RULE_GROUP_OPTIONS,
                  value: groupBy,
                  onChange: (v) => setGroupFor('rules', v),
                },
                {
                  id: 'sort',
                  label: 'SORT BY',
                  options: RULE_SORT_OPTIONS,
                  value: sortBy,
                  onChange: (v) => setSortFor('rules', v),
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
          <RulesEmptyState />
        ) : showNoResults ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F4F4F5]">
              <FileText className="h-8 w-8 text-[#A1A1AA]" />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-medium text-[#71717A]">No rules found</h3>
              <p className="mt-1 text-[13px] text-[#A1A1AA]">No rules match "{filter.search}"</p>
            </div>
          </div>
        ) : (
          /* Rule List — flat when groupBy === 'none', sectioned otherwise. */
          <div className="flex flex-col">
            {groupedRules.map((bucket, idx) => (
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
                  {bucket.items.map((rule) => (
                    <RuleCard
                      key={`${bucket.group?.id ?? 'all'}::${rule.id}`}
                      rule={rule}
                      compact={!!selectedRuleId}
                      onClick={() => handleRuleClick(rule.id)}
                      onDelete={() => handleDelete(rule.id)}
                      onIconClick={(ref) => handleIconClick(rule.id, ref)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Detail Panel with SlidePanel */}
      <RuleDetailPanel rule={selectedRule} isOpen={!!selectedRuleId} onClose={handleCloseDetail} />

      {/* Import Modal */}
      <ImportRuleModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={handleImportComplete}
      />

      {/* Scan Modal */}
      <ScanRuleModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        onImportComplete={handleImportComplete}
      />

      {/* Icon Picker */}
      {iconPickerState.triggerRef && (
        <IconPicker
          value={rules.find((r) => r.id === iconPickerState.ruleId)?.icon || 'file-text'}
          onChange={handleIconChange}
          triggerRef={iconPickerState.triggerRef}
          isOpen={iconPickerState.isOpen}
          onClose={handleIconPickerClose}
        />
      )}
    </div>
  );
}

export default RulesPage;
