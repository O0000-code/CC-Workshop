import { useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useImportStore } from '@/stores/importStore';
import Button from './Button';
import { X, Check, Sparkles, Plug, Info, CheckCircle } from 'lucide-react';
import { Tooltip } from '@/components/common/Tooltip';

/**
 * ImportDialog Component
 *
 * First-time startup dialog for importing existing Claude Code configurations.
 * Displays detected Skills and MCPs from ~/.claude/ directory with selection capability.
 *
 * Design Spec: V1 (560x580px Modal)
 * - Custom checkbox styling (16x16, rounded-4px)
 * - Grouped display (SKILLS + MCP SERVERS)
 * - Skills: name + path format
 * - MCPs: name + scope/path format (User scope purple, Local grey)
 */

// Custom Checkbox Component
function CustomCheckbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
        checked ? 'bg-[#18181B]' : 'border-[1.5px] border-[#D4D4D8]'
      }`}
    >
      {checked && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
    </button>
  );
}

export function ImportDialog() {
  const {
    showImportDialog,
    detectedConfig,
    selectedItems,
    isImporting,
    importResult,
    error,
    closeImportDialog,
    toggleItemSelection,
    selectAllItems,
    deselectAllItems,
    importConfig,
  } = useImportStore();

  const overlayRef = useRef<HTMLDivElement>(null);

  // Handle Escape key press
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isImporting) {
        closeImportDialog();
      }
    },
    [closeImportDialog, isImporting],
  );

  // Disable body scroll when modal is open
  useEffect(() => {
    if (showImportDialog) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showImportDialog, handleKeyDown]);

  // Handle overlay click
  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === overlayRef.current && !isImporting) {
      closeImportDialog();
    }
  };

  // Don't render if dialog is closed or no config detected
  if (!showImportDialog || !detectedConfig) return null;

  // Show import result after completion
  if (importResult) {
    const totalImported = importResult.imported.skills + importResult.imported.mcps;
    const skippedCount = importResult.errors.filter((e) => e.includes('already exists')).length;
    const otherErrors = importResult.errors.filter((e) => !e.includes('already exists'));

    // Determine the title and message based on the result
    let title = 'Import Complete';
    let message = '';
    let isSuccess = true;

    if (totalImported > 0 && skippedCount > 0) {
      message = `Imported ${totalImported} item${totalImported > 1 ? 's' : ''}, skipped ${skippedCount} (already exist)`;
    } else if (totalImported > 0) {
      message = `Imported ${importResult.imported.skills} skill${importResult.imported.skills !== 1 ? 's' : ''} and ${importResult.imported.mcps} MCP${importResult.imported.mcps !== 1 ? 's' : ''}`;
    } else if (skippedCount > 0 && otherErrors.length === 0) {
      title = 'Already Up to Date';
      message = `All ${skippedCount} item${skippedCount > 1 ? 's' : ''} already exist in CC Workshop`;
    } else {
      title = 'Import Failed';
      message = 'No items could be imported';
      isSuccess = false;
    }

    // Result dialog uses similar custom styling
    const resultContent = (
      <div
        ref={overlayRef}
        onClick={handleOverlayClick}
        className="modal-overlay-animate fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      >
        <div className="modal-dialog-animate w-[560px] bg-white rounded-2xl shadow-[0_25px_50px_rgba(0,0,0,0.1)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between py-5 px-6 border-b border-[#E5E5E5]">
            <div className="flex flex-col gap-1">
              <h2 className="text-[18px] font-semibold text-[#18181B]">{title}</h2>
            </div>
            <button
              onClick={closeImportDialog}
              className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-[#F4F4F5] transition-colors"
              aria-label="Close modal"
            >
              <X className="w-[18px] h-[18px] text-[#A1A1AA]" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6">
            {/* Status indicator */}
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle
                className={`w-8 h-8 flex-shrink-0 ${isSuccess ? 'text-green-500' : 'text-[#71717A]'}`}
              />
              <div>
                <h3 className="font-medium text-[#18181B]">
                  {isSuccess
                    ? totalImported > 0
                      ? 'Import Successful'
                      : 'No Changes Needed'
                    : 'Import Failed'}
                </h3>
                <p className="text-sm text-[#71717A]">{message}</p>
              </div>
            </div>

            {/* Backup path information */}
            {importResult.backupPath && (
              <div className="bg-[#EFF6FF] p-4 rounded-lg mb-4">
                <p className="text-sm text-[#1E40AF]">
                  <strong>Backup created at:</strong>
                </p>
                <code className="text-xs text-[#1E40AF] break-all">{importResult.backupPath}</code>
              </div>
            )}

            {/* Skipped items info */}
            {skippedCount > 0 && totalImported > 0 && (
              <div className="bg-[#F5F5F5] p-4 rounded-lg mb-4">
                <p className="text-sm text-[#71717A]">
                  {skippedCount} item{skippedCount > 1 ? 's were' : ' was'} skipped because{' '}
                  {skippedCount > 1 ? 'they' : 'it'} already exist{skippedCount === 1 ? 's' : ''} in
                  CC Workshop.
                </p>
              </div>
            )}

            {/* Other errors if any */}
            {otherErrors.length > 0 && (
              <div className="bg-[#FEF3C7] p-4 rounded-lg mb-4">
                <p className="text-sm font-medium text-[#92400E] mb-2">
                  Some items could not be imported:
                </p>
                <ul className="text-sm text-[#B45309] list-disc list-inside">
                  {otherErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <Button onClick={closeImportDialog} className="w-full">
              Continue
            </Button>
          </div>
        </div>
      </div>
    );

    return createPortal(resultContent, document.body);
  }

  // Calculate totals
  const totalSkills = detectedConfig.skills.length;
  const totalMcps = detectedConfig.mcps.length;
  const totalItems = totalSkills + totalMcps;

  // Check if an item is selected
  const isItemSelected = (type: string, name: string, sourcePath: string = '') =>
    selectedItems.some((i) => i.type === type && i.name === name && i.sourcePath === sourcePath);

  // Check if all items are selected
  const allSelected = selectedItems.length === totalItems && totalItems > 0;

  // Toggle select all
  const handleSelectAllToggle = () => {
    if (allSelected) {
      deselectAllItems();
    } else {
      selectAllItems();
    }
  };

  // Main import dialog
  const modalContent = (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="modal-overlay-animate fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="modal-dialog-animate w-[560px] h-[580px] bg-white rounded-2xl shadow-[0_25px_50px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden">
        {/* Modal Header - 80px height */}
        <div className="flex items-center justify-between h-20 px-6 border-b border-[#E5E5E5] flex-shrink-0">
          <div className="flex flex-col gap-1">
            <h2 className="text-[18px] font-semibold text-[#18181B]">
              Import Existing Configuration
            </h2>
            <p className="text-[13px] text-[#71717A]">
              We found Skills and MCP servers on your system
            </p>
          </div>
          <button
            onClick={closeImportDialog}
            disabled={isImporting}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-[#F4F4F5] transition-colors disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="w-[18px] h-[18px] text-[#A1A1AA]" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* List Header */}
          <div className="flex items-center justify-between py-3 px-6 border-b border-[#E5E5E5] flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <CustomCheckbox checked={allSelected} onChange={handleSelectAllToggle} />
              <span className="text-[13px] font-medium text-[#18181B]">Select All</span>
            </div>
            <span className="text-xs text-[#A1A1AA]">
              {selectedItems.length} of {totalItems} selected
            </span>
          </div>

          {/* List Content - Scrollable */}
          <div className="flex-1 overflow-y-auto py-4 px-6">
            <div className="flex flex-col gap-4">
              {/* Skills Group */}
              {totalSkills > 0 && (
                <div className="flex flex-col gap-2">
                  {/* Group Header */}
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3 h-3 text-[#A1A1AA]" />
                    <span className="text-[10px] font-semibold tracking-[0.8px] text-[#A1A1AA] uppercase">
                      SKILLS
                    </span>
                  </div>
                  {/* Skills List */}
                  <div className="flex flex-col gap-0.5">
                    {detectedConfig.skills.map((skill) => {
                      const selected = isItemSelected('skill', skill.name, skill.path);
                      return (
                        <div
                          key={skill.name}
                          onClick={() =>
                            toggleItemSelection({
                              type: 'skill',
                              name: skill.name,
                              sourcePath: skill.path,
                            })
                          }
                          className="flex items-center gap-3 py-2.5 px-3 rounded-md hover:bg-[#FAFAFA] cursor-pointer transition-colors"
                        >
                          <CustomCheckbox
                            checked={selected}
                            onChange={() =>
                              toggleItemSelection({
                                type: 'skill',
                                name: skill.name,
                                sourcePath: skill.path,
                              })
                            }
                          />
                          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                            <span className="text-[13px] font-medium text-[#18181B] truncate">
                              {skill.name}
                            </span>
                            <span className="text-[11px] text-[#A1A1AA] truncate">
                              ~/.claude/skills/{skill.name}/
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* MCP Group */}
              {totalMcps > 0 && (
                <div className="flex flex-col gap-2">
                  {/* Group Header */}
                  <div className="flex items-center gap-2">
                    <Plug className="w-3 h-3 text-[#A1A1AA]" />
                    <span className="text-[10px] font-semibold tracking-[0.8px] text-[#A1A1AA] uppercase">
                      MCP SERVERS
                    </span>
                  </div>
                  {/* MCP List */}
                  <div className="flex flex-col gap-0.5">
                    {detectedConfig.mcps.map((mcp) => {
                      // For MCPs, sourcePath is empty string by default
                      const sourcePath =
                        mcp.scope === 'local' && mcp.projectPath ? mcp.projectPath : '';
                      const selected = isItemSelected('mcp', mcp.name, sourcePath);
                      return (
                        <div
                          key={`${mcp.name}-${mcp.scope || 'user'}-${mcp.projectPath || ''}`}
                          onClick={() =>
                            toggleItemSelection({
                              type: 'mcp',
                              name: mcp.name,
                              sourcePath,
                            })
                          }
                          className="flex items-center gap-3 py-2.5 px-3 rounded-md hover:bg-[#FAFAFA] cursor-pointer transition-colors"
                        >
                          <CustomCheckbox
                            checked={selected}
                            onChange={() =>
                              toggleItemSelection({
                                type: 'mcp',
                                name: mcp.name,
                                sourcePath,
                              })
                            }
                          />
                          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                            <span className="text-[13px] font-medium text-[#18181B] truncate">
                              {mcp.name}
                            </span>
                            {mcp.scope === 'user' ? (
                              <span className="text-[11px] font-medium text-[#8B5CF6]">
                                User scope
                              </span>
                            ) : mcp.scope === 'local' && mcp.projectPath ? (
                              <span className="text-[11px] text-[#71717A] truncate">
                                Local · {mcp.projectPath}
                              </span>
                            ) : (
                              <span className="text-[11px] text-[#71717A] truncate">
                                {mcp.command}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="mx-6 mb-2 p-3 bg-[#FEF2F2] text-[#DC2626] text-sm rounded-lg flex-shrink-0">
            {error}
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-between py-4 px-6 border-t border-[#E5E5E5] flex-shrink-0">
          {/* Info Icon */}
          <Tooltip
            content="Items will be copied to ~/.cc-workshop/ for centralized management"
            position="top"
          >
            <div className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#FAFAFA] cursor-pointer">
              <Info className="w-4 h-4 text-[#A1A1AA]" />
            </div>
          </Tooltip>

          {/* Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={closeImportDialog}
              disabled={isImporting}
              className="h-9 px-4 rounded-md border border-[#E5E5E5] text-[13px] font-medium text-[#71717A] hover:bg-[#FAFAFA] transition-colors disabled:opacity-50"
            >
              Skip
            </button>
            <button
              onClick={importConfig}
              disabled={isImporting || selectedItems.length === 0}
              className="h-9 px-5 rounded-md bg-[#18181B] text-[13px] font-medium text-white hover:bg-[#27272A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isImporting ? 'Importing...' : 'Import Selected'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default ImportDialog;
