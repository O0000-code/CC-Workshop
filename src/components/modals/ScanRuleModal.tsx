// src/components/modals/ScanRuleModal.tsx
//
// Mirrors `ScanClaudeMdModal.tsx`. Differences:
//   * Tabs are user / project only (CLAUDE.md additionally has "local" —
//     `.claude.local.md` — which has no Rule analogue).
//   * Items are bucketed by `RuleScanItem.sourceScope` ("user" | "project")
//     instead of CLAUDE.md's `type` enum.

import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Info, Globe, Folder, Loader2 } from 'lucide-react';
import { useRulesStore } from '@/stores/rulesStore';
import { Tooltip } from '@/components/common/Tooltip';
import type { RuleScanItem } from '@/types/rule';

type TabType = 'user' | 'project';

interface ScanRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

/**
 * ScanRuleModal Component
 *
 * A modal dialog for viewing scan results and selectively importing Rules.
 *
 * Visual spec mirrors `ScanClaudeMdModal`:
 * - Modal: 520x580px, rounded-[16px], bg-white
 * - Overlay: bg-black/40 (#00000066)
 * - Header: 80px height
 * - Tab: padding 12px 16px, icon 14x14
 * - Tab badge: rounded-[10px], bg #F4F4F5
 * - List item: padding 10px 12px, gap 2px
 * - Checkbox: 16x16, rounded-[4px]
 * - Buttons: height 36px
 */
export function ScanRuleModal({ isOpen, onClose, onImportComplete }: ScanRuleModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabType>('user');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [importingCount, setImportingCount] = useState(0);

  // Store
  const {
    scanRules,
    scanResult,
    isScanning,
    isImporting,
    importRule,
    loadRules,
    getUnimportedScanItems,
  } = useRulesStore();

  // Get unimported items
  const unimportedItems = useMemo(() => getUnimportedScanItems(), [scanResult]);

  // Filter items by tab (sourceScope)
  const getItemsByType = useCallback(
    (type: TabType): RuleScanItem[] => {
      return unimportedItems.filter((item) => item.sourceScope === type);
    },
    [unimportedItems],
  );

  // Count by type
  const userCount = getItemsByType('user').length;
  const projectCount = getItemsByType('project').length;

  // Current tab items
  const currentItems = getItemsByType(activeTab);

  // Selected count for current tab
  const currentTabSelectedCount = currentItems.filter((item) =>
    selectedPaths.has(item.path),
  ).length;

  // Total selected count
  const totalSelectedCount = selectedPaths.size;

  // All selected for current tab
  const allSelectedInTab =
    currentItems.length > 0 && currentTabSelectedCount === currentItems.length;

  // Handle select all / deselect all for current tab
  const handleSelectAll = useCallback(() => {
    if (allSelectedInTab) {
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        currentItems.forEach((item) => next.delete(item.path));
        return next;
      });
    } else {
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        currentItems.forEach((item) => next.add(item.path));
        return next;
      });
    }
  }, [allSelectedInTab, currentItems]);

  // Handle individual item toggle
  const handleToggleItem = useCallback((item: RuleScanItem) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(item.path)) {
        next.delete(item.path);
      } else {
        next.add(item.path);
      }
      return next;
    });
  }, []);

  // Handle import selected
  const handleImportSelected = useCallback(async () => {
    if (totalSelectedCount === 0) return;

    const itemsToImport = unimportedItems.filter((item) => selectedPaths.has(item.path));

    setImportingCount(0);

    for (const item of itemsToImport) {
      await importRule({
        sourcePath: item.path,
      });
      setImportingCount((prev) => prev + 1);
    }

    setSelectedPaths(new Set());

    // Reload rules from backend to ensure UI is in sync
    await loadRules();
    onImportComplete?.();
    onClose();
  }, [
    totalSelectedCount,
    unimportedItems,
    selectedPaths,
    importRule,
    loadRules,
    onImportComplete,
    onClose,
  ]);

  // Handle Escape key press
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  // Scan rules when modal opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        scanRules();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, scanRules]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedPaths(new Set());
      setActiveTab('user');
      setImportingCount(0);
    }
  }, [isOpen]);

  // Disable body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  // Handle overlay click
  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === overlayRef.current) {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  // Extract filename from path
  const getFileName = (path: string): string => {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  };

  const modalContent = (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="modal-overlay-animate fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="modal-dialog-animate w-[520px] h-[580px] bg-white rounded-[16px] flex flex-col overflow-hidden shadow-[0_25px_50px_rgba(0,0,0,0.1)]">
        {/* Modal Header - 80px height */}
        <div className="flex items-center justify-between h-20 px-6 flex-shrink-0">
          <div className="flex flex-col gap-1">
            <h2 className="text-[18px] font-semibold text-[#18181B]">Scan Results</h2>
            <p className="text-[13px] font-normal text-[#71717A]">Found Rules on your system</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-[6px] hover:bg-[#FAFAFA] transition-colors"
            aria-label="Close modal"
          >
            <X className="w-[18px] h-[18px] text-[#A1A1AA]" />
          </button>
        </div>

        {/* Tab Row - justify-between with tabs left, selection right */}
        <div className="flex items-center justify-between px-6 border-b border-[#E5E5E5]">
          {/* Left side: Tabs */}
          <div className="flex items-center">
            {/* User Tab */}
            <button
              onClick={() => setActiveTab('user')}
              className={`flex items-center gap-2 py-3 px-4 border-b-2 transition-colors ${
                activeTab === 'user' ? 'border-[#18181B]' : 'border-transparent'
              }`}
            >
              <Globe
                className={`w-3.5 h-3.5 ${
                  activeTab === 'user' ? 'text-[#18181B]' : 'text-[#71717A]'
                }`}
              />
              <span
                className={`text-[13px] ${
                  activeTab === 'user'
                    ? 'font-semibold text-[#18181B]'
                    : 'font-normal text-[#71717A]'
                }`}
              >
                User
              </span>
              <span
                className={`rounded-[10px] px-2 py-0.5 text-[11px] font-medium ${
                  activeTab === 'user'
                    ? 'bg-[#F4F4F5] text-[#52525B]'
                    : 'bg-[#F4F4F5] text-[#A1A1AA]'
                }`}
              >
                {isScanning ? '-' : userCount}
              </span>
            </button>

            {/* Project Tab */}
            <button
              onClick={() => setActiveTab('project')}
              className={`flex items-center gap-2 py-3 px-4 border-b-2 transition-colors ${
                activeTab === 'project' ? 'border-[#18181B]' : 'border-transparent'
              }`}
            >
              <Folder
                className={`w-3.5 h-3.5 ${
                  activeTab === 'project' ? 'text-[#18181B]' : 'text-[#71717A]'
                }`}
              />
              <span
                className={`text-[13px] ${
                  activeTab === 'project'
                    ? 'font-semibold text-[#18181B]'
                    : 'font-normal text-[#71717A]'
                }`}
              >
                Project
              </span>
              <span
                className={`rounded-[10px] px-2 py-0.5 text-[11px] font-medium ${
                  activeTab === 'project'
                    ? 'bg-[#F4F4F5] text-[#52525B]'
                    : 'bg-[#F4F4F5] text-[#A1A1AA]'
                }`}
              >
                {isScanning ? '-' : projectCount}
              </span>
            </button>
          </div>

          {/* Right side: Divider + Count + Divider + All Checkbox */}
          <div className="flex items-center gap-3">
            <div className="w-px h-4 bg-[#E5E5E5]" />
            <span className="text-[12px] font-normal text-[#A1A1AA]">
              {isScanning ? '-/-' : `${currentTabSelectedCount}/${currentItems.length}`}
            </span>
            <div className="w-px h-4 bg-[#E5E5E5]" />
            <div className="flex items-center gap-2.5 cursor-pointer" onClick={handleSelectAll}>
              {allSelectedInTab ? (
                <div className="w-4 h-4 rounded-[4px] bg-[#18181B] flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                </div>
              ) : (
                <div className="w-4 h-4 rounded-[4px] border-[1.5px] border-[#D4D4D8] bg-transparent" />
              )}
              <span className="text-[13px] font-medium text-[#18181B]">All</span>
            </div>
          </div>
        </div>

        {/* Modal Body - Scrollable Items List */}
        <div className="flex-1 overflow-y-auto py-4 px-6 flex flex-col gap-0.5">
          {isScanning ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-[#71717A]" />
              <div className="text-center">
                <p className="text-[14px] font-medium text-[#18181B]">Scanning system...</p>
                <p className="text-[13px] text-[#71717A]">Looking for Rule files</p>
              </div>
            </div>
          ) : currentItems.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-[13px] text-[#71717A]">
                No {activeTab === 'user' ? 'user' : 'project'} Rules found
              </span>
            </div>
          ) : (
            currentItems.map((item) => {
              const isSelected = selectedPaths.has(item.path);
              return (
                <div
                  key={item.path}
                  onClick={() => handleToggleItem(item)}
                  className="flex items-center gap-3 py-2.5 px-3 rounded-[6px] hover:bg-[#FAFAFA] cursor-pointer transition-colors"
                >
                  {/* Checkbox - 16x16 */}
                  {isSelected ? (
                    <div className="w-4 h-4 rounded-[4px] bg-[#18181B] flex items-center justify-center flex-shrink-0">
                      <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                    </div>
                  ) : (
                    <div className="w-4 h-4 rounded-[4px] border-[1.5px] border-[#D4D4D8] bg-transparent flex-shrink-0" />
                  )}
                  {/* Rule Info - gap 2px. Use filename (last path segment) as
                      the display name; project name (if known) is appended on
                      the path line for context. */}
                  <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                    <span className="text-[13px] font-medium text-[#18181B] truncate">
                      {getFileName(item.path)}
                    </span>
                    <span className="text-[11px] font-normal text-[#A1A1AA] truncate">
                      {item.projectName ? `${item.projectName} · ${item.path}` : item.path}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between py-4 px-6 border-t border-[#E5E5E5] flex-shrink-0">
          <Tooltip
            content="Scans ~/.claude/rules/ and project .claude/rules/ for Rule files"
            position="top"
          >
            <button
              className="w-7 h-7 flex items-center justify-center rounded-[6px] hover:bg-[#FAFAFA] transition-colors"
              aria-label="More information"
            >
              <Info className="w-4 h-4 text-[#A1A1AA]" />
            </button>
          </Tooltip>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="h-[36px] px-4 rounded-[6px] border border-[#E5E5E5] text-[13px] font-medium text-[#71717A] hover:bg-[#FAFAFA] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImportSelected}
              disabled={totalSelectedCount === 0 || isImporting || isScanning}
              className={`h-[36px] px-5 rounded-[6px] text-[13px] font-medium text-white transition-colors
                ${
                  totalSelectedCount === 0 || isImporting || isScanning
                    ? 'bg-[#18181B]/50 cursor-not-allowed'
                    : 'bg-[#18181B] hover:bg-[#27272A]'
                }
              `}
            >
              {isImporting
                ? `Importing (${importingCount}/${totalSelectedCount})...`
                : 'Import Selected'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default ScanRuleModal;
