// src/components/modals/ImportRuleModal.tsx
//
// Mirrors `ImportClaudeMdModal.tsx` 1:1, with strings/IPC renamed for Rule.
// No structural deviation — the import flow is identical (Browse / Enter Path).

import { useEffect, useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload } from 'lucide-react';
import { useRulesStore } from '@/stores/rulesStore';
import { isTauri, safeInvoke } from '@/utils/tauri';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

type ImportMethod = 'file' | 'path';

interface ImportRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

/**
 * ImportRuleModal Component
 *
 * A modal dialog for importing a Rule (`.claude/rules/*.md` file).
 * Supports two import methods:
 * 1. Select File - Browse and select a Rule .md file
 * 2. Enter Path - Type the full path to the Rule .md file
 *
 * Visual spec mirrors `ImportClaudeMdModal`:
 * - Modal: 540x480px, rounded-[16px], bg-white
 * - Overlay: bg-black/40 (#00000066)
 * - Header: 56px height, border-b, px-24px
 * - Body: flex-1, padding 24px, gap 20px
 * - Footer: 64px height, border-t, padding 14px 24px, gap 12px
 */
export function ImportRuleModal({ isOpen, onClose, onImportComplete }: ImportRuleModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [importMethod, setImportMethod] = useState<ImportMethod>('file');
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [enteredPath, setEnteredPath] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Store
  const { importRule, isImporting } = useRulesStore();

  // Tauri drag-drop event listener
  useEffect(() => {
    if (!isOpen || !isTauri()) return;

    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      try {
        unlisten = await listen<{ paths: string[]; position: { x: number; y: number } }>(
          'tauri://drag-drop',
          (event) => {
            const paths = event.payload.paths;
            if (paths && paths.length > 0) {
              const mdFile = paths.find((p) => p.toLowerCase().endsWith('.md'));
              if (mdFile) {
                setSelectedFilePath(mdFile);
                // Auto-fill display name from filename stem if empty
                if (!displayName) {
                  const fileName = mdFile.split('/').pop() || '';
                  const nameWithoutExt = fileName.replace(/\.md$/i, '');
                  setDisplayName(nameWithoutExt);
                }
              }
            }
          },
        );
      } catch (error) {
        console.error('Failed to setup drag-drop listener:', error);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [isOpen, displayName]);

  // Get the effective file path based on import method
  const effectiveFilePath = importMethod === 'file' ? selectedFilePath : enteredPath;

  // Determine if Import button should be enabled
  const canImport = effectiveFilePath.trim().length > 0 && !isImporting;

  // Handle file selection via Tauri dialog
  const handleBrowseFile = useCallback(async () => {
    if (!isTauri()) {
      console.warn('File selection requires Tauri environment');
      return;
    }

    try {
      const result = await safeInvoke<string | null>('select_file', {
        filters: [['Rule (.md)', ['md']]],
      });

      if (result) {
        setSelectedFilePath(result);
        if (!displayName) {
          const fileName = result.split('/').pop() || '';
          const nameWithoutExt = fileName.replace(/\.md$/i, '');
          setDisplayName(nameWithoutExt);
        }
      }
    } catch (error) {
      console.error('Failed to select file:', error);
    }
  }, [displayName]);

  // Handle drop zone click
  const handleDropZoneClick = useCallback(() => {
    handleBrowseFile();
  }, [handleBrowseFile]);

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    // Path comes through Tauri's native drag-drop event (set up above).
  }, []);

  // Handle import
  const handleImport = useCallback(async () => {
    if (!canImport) return;

    const result = await importRule({
      sourcePath: effectiveFilePath,
      name: displayName.trim() || undefined,
    });

    if (result?.success) {
      onImportComplete?.();
      onClose();
      // Reset form
      setDisplayName('');
      setSelectedFilePath('');
      setEnteredPath('');
      setImportMethod('file');
    }
  }, [canImport, effectiveFilePath, displayName, importRule, onImportComplete, onClose]);

  // Handle Escape key press
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

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

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setDisplayName('');
      setSelectedFilePath('');
      setEnteredPath('');
      setImportMethod('file');
    }
  }, [isOpen]);

  // Handle overlay click
  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === overlayRef.current) {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  const modalContent = (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="modal-overlay-animate fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="modal-dialog-animate w-[540px] bg-white rounded-[16px] flex flex-col overflow-hidden shadow-[0_25px_50px_rgba(0,0,0,0.1)]">
        {/* Modal Header - 56px height */}
        <div className="flex items-center justify-between h-14 px-6 border-b border-[#E5E5E5] flex-shrink-0">
          <h2 className="text-[16px] font-semibold text-[#18181B]">Import Rule</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-[6px] hover:bg-[#FAFAFA] transition-colors"
            aria-label="Close modal"
          >
            <X className="w-[18px] h-[18px] text-[#71717A]" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
          {/* Display Name Section */}
          <div className="flex flex-col gap-3">
            <label className="text-[14px] font-semibold text-[#18181B]">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter a name for this Rule"
              className="h-9 px-3 text-[13px] text-[#18181B] placeholder:text-[#A1A1AA] border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#18181B] transition-colors"
            />
          </div>

          {/* Import Method Section */}
          <div className="flex flex-col gap-3">
            <label className="text-[14px] font-semibold text-[#18181B]">Import Method</label>
            <div className="flex flex-col gap-3">
              {/* Select File Option */}
              <div
                onClick={() => setImportMethod('file')}
                className={`flex items-center gap-3 p-4 rounded-[8px] cursor-pointer transition-colors ${
                  importMethod === 'file'
                    ? 'border-[1.5px] border-[#18181B]'
                    : 'border border-[#E5E5E5] hover:border-[#D4D4D8]'
                }`}
              >
                {/* Radio Button */}
                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                    importMethod === 'file'
                      ? 'border-[1.5px] border-[#18181B]'
                      : 'border border-[#E5E5E5]'
                  }`}
                >
                  {importMethod === 'file' && <div className="w-2 h-2 rounded-full bg-[#18181B]" />}
                </div>
                {/* Option Content */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-medium text-[#18181B]">Select File</span>
                  <span className="text-[12px] font-normal text-[#71717A]">
                    Browse and select a Rule .md file from your system
                  </span>
                </div>
              </div>

              {/* Enter Path Option */}
              <div
                onClick={() => setImportMethod('path')}
                className={`flex items-center gap-3 p-4 rounded-[8px] cursor-pointer transition-colors ${
                  importMethod === 'path'
                    ? 'border-[1.5px] border-[#18181B]'
                    : 'border border-[#E5E5E5] hover:border-[#D4D4D8]'
                }`}
              >
                {/* Radio Button */}
                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                    importMethod === 'path'
                      ? 'border-[1.5px] border-[#18181B]'
                      : 'border border-[#E5E5E5]'
                  }`}
                >
                  {importMethod === 'path' && <div className="w-2 h-2 rounded-full bg-[#18181B]" />}
                </div>
                {/* Option Content */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-medium text-[#18181B]">Enter Path</span>
                  <span className="text-[12px] font-normal text-[#71717A]">
                    Type the full path to the Rule .md file
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Selected File / Enter Path Section */}
          <div className="flex flex-col gap-3">
            <label className="text-[14px] font-semibold text-[#18181B]">
              {importMethod === 'file' ? 'Selected File' : 'File Path'}
            </label>

            {importMethod === 'file' ? (
              // File Browser Drop Zone
              <div
                onClick={handleDropZoneClick}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`h-[120px] flex flex-col items-center justify-center gap-3 rounded-[8px] cursor-pointer transition-colors ${
                  isDragging
                    ? 'bg-[#F4F4F5] border-[1.5px] border-[#18181B]'
                    : 'bg-[#FAFAFA] border border-[#E5E5E5] hover:border-[#D4D4D8]'
                }`}
              >
                {selectedFilePath ? (
                  // Show selected file
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[13px] font-medium text-[#18181B] max-w-[400px] truncate">
                      {selectedFilePath.split('/').pop()}
                    </span>
                    <span className="text-[11px] font-normal text-[#A1A1AA] max-w-[400px] truncate">
                      {selectedFilePath}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFilePath('');
                      }}
                      className="text-[11px] font-medium text-[#71717A] hover:text-[#18181B] transition-colors"
                    >
                      Clear selection
                    </button>
                  </div>
                ) : (
                  // Empty state
                  <>
                    <Upload className="w-8 h-8 text-[#71717A]" />
                    <span className="text-[13px] font-normal text-[#71717A]">
                      Click to browse or drag and drop
                    </span>
                    <span className="text-[11px] font-normal text-[#A1A1AA]">
                      Rule .md files only
                    </span>
                  </>
                )}
              </div>
            ) : (
              // Path Input
              <input
                type="text"
                value={enteredPath}
                onChange={(e) => setEnteredPath(e.target.value)}
                placeholder="e.g., /Users/username/.claude/rules/my-rule.md"
                className="h-9 px-3 text-[13px] text-[#18181B] placeholder:text-[#A1A1AA] border border-[#E5E5E5] rounded-[6px] focus:outline-none focus:border-[#18181B] transition-colors"
              />
            )}
          </div>
        </div>

        {/* Modal Footer - 64px height */}
        <div className="flex items-center justify-end h-16 px-6 border-t border-[#E5E5E5] gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-[6px] border border-[#E5E5E5] text-[14px] font-normal text-[#18181B] hover:bg-[#FAFAFA] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!canImport}
            className={`h-9 px-4 rounded-[6px] text-[14px] font-medium text-white transition-colors ${
              canImport ? 'bg-[#18181B] hover:bg-[#27272A]' : 'bg-[#18181B]/50 cursor-not-allowed'
            }`}
          >
            {isImporting ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>

      {/* Hidden file input for fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            setSelectedFilePath(file.name);
          }
        }}
      />
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default ImportRuleModal;
