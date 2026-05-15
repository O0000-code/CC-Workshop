import { useEffect, useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Check,
  Info,
  Wand2,
  Server,
  FileText,
  ScrollText,
  Layers,
  Folder,
  Trash2,
} from 'lucide-react';
import { useTrashStore, type TrashKind } from '@/stores/trashStore';
import { Tooltip } from '@/components/common/Tooltip';
import type {
  TrashedSkill,
  TrashedMcp,
  TrashedClaudeMd,
  TrashedRule,
  TrashedScene,
  TrashedProject,
} from '@/types';

// All six entity types live in trash. Tab order mirrors the sidebar
// app structure (Skills → MCPs → CLAUDE.md → Rules → Scenes → Projects)
// so users find each tab where their muscle memory expects it.
type TabType = 'skills' | 'mcps' | 'claudemd' | 'rules' | 'scenes' | 'projects';

interface TrashRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreComplete?: () => void;
}

/**
 * Format deleted time to human-readable string
 */
function formatDeletedTime(deletedAt: string): string {
  const deleted = new Date(deletedAt);
  const now = new Date();
  const diffMs = now.getTime() - deleted.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Deleted today';
  } else if (diffDays === 1) {
    return 'Deleted yesterday';
  } else if (diffDays < 7) {
    return `Deleted ${diffDays} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `Deleted ${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  } else {
    return deleted.toLocaleDateString();
  }
}

/**
 * TrashRecoveryModal Component
 *
 * A modal dialog for recovering deleted Skills, MCPs, CLAUDE.md files,
 * Rules, Scenes, and Projects. Six tabs total; tab order mirrors the
 * sidebar app structure so the user's mental model carries over.
 *
 * Design specs:
 * - Modal: 520x580px, rounded-[16px], bg-white
 * - Overlay: bg-black/40
 * - Six tabs: Skills, MCPs, CLAUDE.md, Rules, Scenes, Projects
 * - Tab badges show count of deleted items
 * - List items with checkboxes for multi-select recovery
 *
 * Restore keying:
 * - Skills / MCPs / CLAUDE.md / Rules: keyed by `path` (trash directory
 *   on disk).
 * - Scenes / Projects: keyed by `id` (records live in `data.json`, no
 *   disk path).
 */
export function TrashRecoveryModal({
  isOpen,
  onClose,
  onRestoreComplete,
}: TrashRecoveryModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabType>('skills');

  // Track selected items per tab. Skills/MCPs/CLAUDE.md/Rules key by `path`;
  // Scenes/Projects key by `id` (no disk path — record is in data.json).
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [selectedMcps, setSelectedMcps] = useState<Set<string>>(new Set());
  const [selectedClaudeMd, setSelectedClaudeMd] = useState<Set<string>>(new Set());
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set());
  const [selectedScenes, setSelectedScenes] = useState<Set<string>>(new Set());
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());

  // Get trash store state
  const {
    trashedItems,
    isLoading,
    isRestoring,
    isPermanentlyDeleting,
    loadTrashedItems,
    restoreSkill,
    restoreMcp,
    restoreClaudeMd,
    restoreRule,
    restoreScene,
    restoreProject,
    deleteTrashedItemPermanently,
    emptyTrash,
    clearError,
  } = useTrashStore();

  // Local error state for showing restore errors
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // R2-9 — permanent-delete confirm. Two confirm shapes share one piece of
  // state so we render exactly one centred dialog at a time:
  //   - `kind: 'empty'`     → "Empty Trash" pressed (delete everything).
  //   - `kind: 'single'`    → trash icon on a row pressed (delete one item).
  // Setting this to null closes the dialog. Confirming dispatches the
  // matching trashStore action and clears the dialog on completion.
  type ConfirmRequest =
    | { kind: 'empty'; itemCount: number }
    | {
        kind: 'single';
        trashKind: TrashKind;
        pathOrId: string;
        displayName: string;
      };
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [emptyTrashSummary, setEmptyTrashSummary] = useState<string | null>(null);

  // Counts
  const skillsCount = trashedItems?.skills.length || 0;
  const mcpsCount = trashedItems?.mcps.length || 0;
  const claudeMdCount = trashedItems?.claudeMdFiles.length || 0;
  const rulesCount = trashedItems?.rules.length || 0;
  const scenesCount = trashedItems?.scenes.length || 0;
  const projectsCount = trashedItems?.projects.length || 0;
  const totalCount =
    skillsCount + mcpsCount + claudeMdCount + rulesCount + scenesCount + projectsCount;

  // Current tab counts
  const currentSelected =
    activeTab === 'skills'
      ? selectedSkills.size
      : activeTab === 'mcps'
        ? selectedMcps.size
        : activeTab === 'claudemd'
          ? selectedClaudeMd.size
          : activeTab === 'rules'
            ? selectedRules.size
            : activeTab === 'scenes'
              ? selectedScenes.size
              : selectedProjects.size;

  const currentTotal =
    activeTab === 'skills'
      ? skillsCount
      : activeTab === 'mcps'
        ? mcpsCount
        : activeTab === 'claudemd'
          ? claudeMdCount
          : activeTab === 'rules'
            ? rulesCount
            : activeTab === 'scenes'
              ? scenesCount
              : projectsCount;

  const allSelected = currentTotal > 0 && currentSelected === currentTotal;

  // Handle select all / deselect all for current tab
  const handleSelectAll = useCallback(() => {
    if (activeTab === 'skills') {
      setSelectedSkills(
        allSelected ? new Set() : new Set(trashedItems?.skills.map((s) => s.path) || []),
      );
    } else if (activeTab === 'mcps') {
      setSelectedMcps(
        allSelected ? new Set() : new Set(trashedItems?.mcps.map((m) => m.path) || []),
      );
    } else if (activeTab === 'claudemd') {
      setSelectedClaudeMd(
        allSelected ? new Set() : new Set(trashedItems?.claudeMdFiles.map((c) => c.path) || []),
      );
    } else if (activeTab === 'rules') {
      setSelectedRules(
        allSelected ? new Set() : new Set(trashedItems?.rules.map((r) => r.path) || []),
      );
    } else if (activeTab === 'scenes') {
      setSelectedScenes(
        allSelected ? new Set() : new Set(trashedItems?.scenes.map((s) => s.id) || []),
      );
    } else {
      setSelectedProjects(
        allSelected ? new Set() : new Set(trashedItems?.projects.map((p) => p.id) || []),
      );
    }
  }, [activeTab, allSelected, trashedItems]);

  // Handle individual item toggle
  const handleToggleSkill = useCallback((skill: TrashedSkill) => {
    setSelectedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skill.path)) {
        next.delete(skill.path);
      } else {
        next.add(skill.path);
      }
      return next;
    });
  }, []);

  const handleToggleMcp = useCallback((mcp: TrashedMcp) => {
    setSelectedMcps((prev) => {
      const next = new Set(prev);
      if (next.has(mcp.path)) {
        next.delete(mcp.path);
      } else {
        next.add(mcp.path);
      }
      return next;
    });
  }, []);

  const handleToggleClaudeMd = useCallback((claudeMd: TrashedClaudeMd) => {
    setSelectedClaudeMd((prev) => {
      const next = new Set(prev);
      if (next.has(claudeMd.path)) {
        next.delete(claudeMd.path);
      } else {
        next.add(claudeMd.path);
      }
      return next;
    });
  }, []);

  const handleToggleRule = useCallback((rule: TrashedRule) => {
    setSelectedRules((prev) => {
      const next = new Set(prev);
      if (next.has(rule.path)) {
        next.delete(rule.path);
      } else {
        next.add(rule.path);
      }
      return next;
    });
  }, []);

  const handleToggleScene = useCallback((scene: TrashedScene) => {
    setSelectedScenes((prev) => {
      const next = new Set(prev);
      if (next.has(scene.id)) {
        next.delete(scene.id);
      } else {
        next.add(scene.id);
      }
      return next;
    });
  }, []);

  const handleToggleProject = useCallback((project: TrashedProject) => {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(project.id)) {
        next.delete(project.id);
      } else {
        next.add(project.id);
      }
      return next;
    });
  }, []);

  // Total selected across all tabs (footer button counts ALL tabs so the
  // user can batch-restore across multiple tabs in one click — existing
  // pre-A4/A5 behaviour preserved)
  const totalSelectedCount =
    selectedSkills.size +
    selectedMcps.size +
    selectedClaudeMd.size +
    selectedRules.size +
    selectedScenes.size +
    selectedProjects.size;

  // Handle restore — iterate every tab's selection, count successes / failures
  const handleRestore = useCallback(async () => {
    if (totalSelectedCount === 0) return;

    // Clear any previous error
    setRestoreError(null);
    clearError();

    let successCount = 0;
    let failCount = 0;
    let lastError = '';

    // Restore skills
    for (const path of selectedSkills) {
      const result = await restoreSkill(path);
      if (result) {
        successCount++;
      } else {
        failCount++;
        lastError = useTrashStore.getState().error || 'Failed to restore skill';
      }
    }

    // Restore MCPs
    for (const path of selectedMcps) {
      const result = await restoreMcp(path);
      if (result) {
        successCount++;
      } else {
        failCount++;
        lastError = useTrashStore.getState().error || 'Failed to restore MCP';
      }
    }

    // Restore CLAUDE.md files
    for (const path of selectedClaudeMd) {
      const result = await restoreClaudeMd(path);
      if (result) {
        successCount++;
      } else {
        failCount++;
        lastError = useTrashStore.getState().error || 'Failed to restore CLAUDE.md';
      }
    }

    // Restore Rules (A4)
    for (const path of selectedRules) {
      const result = await restoreRule(path);
      if (result) {
        successCount++;
      } else {
        failCount++;
        lastError = useTrashStore.getState().error || 'Failed to restore Rule';
      }
    }

    // Restore Scenes (A5) — keyed by id, not path
    for (const id of selectedScenes) {
      const result = await restoreScene(id);
      if (result) {
        successCount++;
      } else {
        failCount++;
        lastError = useTrashStore.getState().error || 'Failed to restore Scene';
      }
    }

    // Restore Projects (A5) — keyed by id, not path
    for (const id of selectedProjects) {
      const result = await restoreProject(id);
      if (result) {
        successCount++;
      } else {
        failCount++;
        lastError = useTrashStore.getState().error || 'Failed to restore Project';
      }
    }

    // Clear selections for successfully restored items
    setSelectedSkills(new Set());
    setSelectedMcps(new Set());
    setSelectedClaudeMd(new Set());
    setSelectedRules(new Set());
    setSelectedScenes(new Set());
    setSelectedProjects(new Set());

    // Show error if any failed
    if (failCount > 0) {
      if (failCount === 1) {
        setRestoreError(lastError);
      } else {
        setRestoreError(`${failCount} items could not be restored. ${lastError}`);
      }
    }

    if (successCount > 0) {
      onRestoreComplete?.();
    }
  }, [
    totalSelectedCount,
    selectedSkills,
    selectedMcps,
    selectedClaudeMd,
    selectedRules,
    selectedScenes,
    selectedProjects,
    restoreSkill,
    restoreMcp,
    restoreClaudeMd,
    restoreRule,
    restoreScene,
    restoreProject,
    clearError,
    onRestoreComplete,
  ]);

  // Handle Escape key press.
  //
  // R2-9: when the permanent-delete confirm overlay is open, ESC dismisses
  // *just the confirm* (treat it as Cancel) rather than closing the whole
  // modal. This matches macOS-native confirm-sheet behaviour and prevents
  // a stray ESC from blowing away the user's selection state.
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (confirmRequest) {
          setConfirmRequest(null);
        } else {
          onClose();
        }
      }
    },
    [confirmRequest, onClose],
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

  // Load trashed items when modal opens
  useEffect(() => {
    if (isOpen) {
      loadTrashedItems();
    }
  }, [isOpen, loadTrashedItems]);

  // Reset selections and errors when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedSkills(new Set());
      setSelectedMcps(new Set());
      setSelectedClaudeMd(new Set());
      setSelectedRules(new Set());
      setSelectedScenes(new Set());
      setSelectedProjects(new Set());
      setActiveTab('skills');
      setRestoreError(null);
      // R2-9: also clear permanent-delete confirm + empty-trash summary
      // so a fresh open never inherits a half-dismissed dialog.
      setConfirmRequest(null);
      setEmptyTrashSummary(null);
      clearError();
    }
  }, [isOpen, clearError]);

  // R2-9 — handlers for the new permanent-delete actions.
  //
  // Open-confirm helpers just set state — they never touch the backend.
  // The confirm dialog's "Delete Permanently" button is what dispatches
  // the action (gated by `isPermanentlyDeleting` so a double-click does
  // not double-fire).
  const openEmptyTrashConfirm = useCallback(() => {
    setConfirmRequest({ kind: 'empty', itemCount: totalCount });
  }, [totalCount]);

  const openSingleDeleteConfirm = useCallback(
    (trashKind: TrashKind, pathOrId: string, displayName: string) => {
      setConfirmRequest({ kind: 'single', trashKind, pathOrId, displayName });
    },
    [],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmRequest) return;
    if (confirmRequest.kind === 'empty') {
      const result = await emptyTrash();
      setConfirmRequest(null);
      if (!result.success) {
        setRestoreError(result.errors[0] || 'Failed to empty trash');
        return;
      }
      // R2-9: show an aggregated summary as the success path so the user
      // gets confirmation that the action ran. Errors (per-item) get
      // surfaced through the same red banner used by restore failures.
      if (result.errors.length > 0) {
        setRestoreError(`Emptied trash with ${result.errors.length} error(s)`);
      } else {
        setEmptyTrashSummary('Trash emptied');
      }
    } else {
      const ok = await deleteTrashedItemPermanently(
        confirmRequest.trashKind,
        confirmRequest.pathOrId,
      );
      setConfirmRequest(null);
      if (!ok) {
        setRestoreError(`Failed to delete '${confirmRequest.displayName}'`);
      }
    }
  }, [confirmRequest, emptyTrash, deleteTrashedItemPermanently]);

  // R2-9: the per-tab "active" trash kind, used by `renderRow` when the
  // user clicks the trash icon on a row. Scene/Project rows pass `id`
  // for their backend record; everything else passes the disk path.
  const trashKindForTab: Record<TabType, TrashKind> = {
    skills: 'skill',
    mcps: 'mcp',
    claudemd: 'claudeMd',
    rules: 'rule',
    scenes: 'scene',
    projects: 'project',
  };

  // Handle overlay click
  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === overlayRef.current) {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  // Tab metadata. Keeping this as a static array (over inline JSX) means
  // the 6-button row stays consistent and adding a 7th tab in the future
  // is one append rather than 6 manual touches.
  const tabs: { id: TabType; icon: typeof Wand2; label: string }[] = [
    { id: 'skills', icon: Wand2, label: 'Skills' },
    { id: 'mcps', icon: Server, label: 'MCPs' },
    { id: 'claudemd', icon: FileText, label: 'CLAUDE.md' },
    { id: 'rules', icon: ScrollText, label: 'Rules' },
    { id: 'scenes', icon: Layers, label: 'Scenes' },
    { id: 'projects', icon: Folder, label: 'Projects' },
  ];

  // Render a single list item (consistent layout across all six tabs):
  // checkbox + name + meta line + trash icon. `meta` is the secondary text
  // (deleted time, or filename + deleted time for Rules). The trash icon
  // (R2-9) is always present; click stops propagation so it does NOT
  // toggle the row's checkbox.
  //
  // `pathOrId` is the value passed to `deleteTrashedItemPermanently` —
  // for Scenes/Projects this is the record id; for the other four kinds
  // it is the on-disk trash path.
  const renderRow = (
    key: string,
    isSelected: boolean,
    onToggle: () => void,
    name: string,
    meta: string,
    pathOrId: string,
  ) => (
    <div
      key={key}
      onClick={onToggle}
      className="group flex items-center gap-3 py-2.5 px-3 rounded-[6px] hover:bg-[#FAFAFA] cursor-pointer transition-colors"
    >
      {/* Checkbox - 16x16 */}
      {isSelected ? (
        <div className="w-4 h-4 rounded-[4px] bg-[#18181B] flex items-center justify-center flex-shrink-0">
          <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
        </div>
      ) : (
        <div className="w-4 h-4 rounded-[4px] border-[1.5px] border-[#D4D4D8] bg-transparent flex-shrink-0" />
      )}
      {/* Item Info - gap 2px */}
      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
        <span className="text-[13px] font-medium text-[#18181B] truncate">{name}</span>
        <span className="text-[11px] font-normal text-[#A1A1AA] truncate">{meta}</span>
      </div>
      {/* R2-9: per-row "Delete Permanently" affordance. Hover-revealed so
          the row stays visually quiet by default — destructive actions
          should not advertise themselves. */}
      <Tooltip content="Delete permanently" position="top">
        <button
          onClick={(e) => {
            e.stopPropagation();
            openSingleDeleteConfirm(trashKindForTab[activeTab], pathOrId, name);
          }}
          className="w-7 h-7 flex items-center justify-center rounded-[6px] opacity-0 group-hover:opacity-100 hover:bg-[#FEE2E2] transition-all flex-shrink-0"
          aria-label={`Delete '${name}' permanently`}
        >
          <Trash2 className="w-3.5 h-3.5 text-[#A1A1AA] hover:text-[#DC2626]" />
        </button>
      </Tooltip>
    </div>
  );

  // Render the shared footer (Cancel + Recover Selected). Identical
  // across all six tabs — extracted to avoid drift.
  const renderFooter = () => (
    <div className="flex items-center justify-between py-4 px-6 border-t border-[#E5E5E5]">
      {/* Info Button */}
      <Tooltip content="Recover previously deleted items from trash" position="top">
        <button
          className="w-7 h-7 flex items-center justify-center rounded-[6px] hover:bg-[#FAFAFA] transition-colors"
          aria-label="More information"
        >
          <Info className="w-4 h-4 text-[#A1A1AA]" />
        </button>
      </Tooltip>

      {/* Action Buttons */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={onClose}
          className="h-[36px] px-4 rounded-[6px] border border-[#E5E5E5] text-[13px] font-medium text-[#71717A] hover:bg-[#FAFAFA] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleRestore}
          disabled={totalSelectedCount === 0 || isRestoring}
          className={`h-[36px] px-5 rounded-[6px] text-[13px] font-medium text-white transition-colors
            ${
              totalSelectedCount === 0 || isRestoring
                ? 'bg-[#18181B]/50 cursor-not-allowed'
                : 'bg-[#18181B] hover:bg-[#27272A]'
            }
          `}
        >
          {isRestoring ? 'Restoring...' : 'Recover Selected'}
        </button>
      </div>
    </div>
  );

  // Render an empty-state placeholder for a tab. `Icon` is the tab's
  // lucide-react icon component (matching the tab button's icon).
  const renderEmpty = (Icon: typeof Wand2, label: string) => (
    <div className="flex items-center justify-center h-full flex-col gap-2">
      <Icon className="w-8 h-8 text-[#D4D4D8]" />
      <span className="text-[13px] text-[#71717A]">No deleted {label}</span>
      <span className="text-[11px] text-[#A1A1AA]">Items you delete will appear here</span>
    </div>
  );

  // Render the active tab's body. Each branch builds its own list of rows;
  // the loading / empty / list-content tri-state is shared shape.
  const renderTabBody = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <span className="text-[13px] text-[#71717A]">Loading...</span>
        </div>
      );
    }

    if (activeTab === 'skills') {
      if (skillsCount === 0) return renderEmpty(Wand2, 'Skills');
      return trashedItems?.skills.map((skill) =>
        renderRow(
          skill.path,
          selectedSkills.has(skill.path),
          () => handleToggleSkill(skill),
          skill.name,
          formatDeletedTime(skill.deletedAt),
          skill.path,
        ),
      );
    }

    if (activeTab === 'mcps') {
      if (mcpsCount === 0) return renderEmpty(Server, 'MCPs');
      return trashedItems?.mcps.map((mcp) =>
        renderRow(
          mcp.path,
          selectedMcps.has(mcp.path),
          () => handleToggleMcp(mcp),
          mcp.name,
          formatDeletedTime(mcp.deletedAt),
          mcp.path,
        ),
      );
    }

    if (activeTab === 'claudemd') {
      if (claudeMdCount === 0) return renderEmpty(FileText, 'CLAUDE.md');
      return trashedItems?.claudeMdFiles.map((claudeMd) =>
        renderRow(
          claudeMd.path,
          selectedClaudeMd.has(claudeMd.path),
          () => handleToggleClaudeMd(claudeMd),
          claudeMd.name,
          formatDeletedTime(claudeMd.deletedAt),
          claudeMd.path,
        ),
      );
    }

    if (activeTab === 'rules') {
      if (rulesCount === 0) return renderEmpty(ScrollText, 'Rules');
      return trashedItems?.rules.map((rule) =>
        renderRow(
          rule.path,
          selectedRules.has(rule.path),
          () => handleToggleRule(rule),
          rule.name,
          // Rules show filename in the meta line to disambiguate when two
          // rules share the same display name (filename is the Claude
          // Code identity per CLAUDE.md easy-to-miss).
          `${rule.filename} · ${formatDeletedTime(rule.deletedAt)}`,
          rule.path,
        ),
      );
    }

    if (activeTab === 'scenes') {
      if (scenesCount === 0) return renderEmpty(Layers, 'Scenes');
      return trashedItems?.scenes.map((scene) => {
        const bundleSummary =
          `${scene.skillIds.length} skill${scene.skillIds.length === 1 ? '' : 's'} · ` +
          `${scene.mcpIds.length} MCP${scene.mcpIds.length === 1 ? '' : 's'}`;
        return renderRow(
          scene.id,
          selectedScenes.has(scene.id),
          () => handleToggleScene(scene),
          scene.name,
          `${bundleSummary} · ${formatDeletedTime(scene.deletedAt)}`,
          scene.id,
        );
      });
    }

    if (activeTab === 'projects') {
      if (projectsCount === 0) return renderEmpty(Folder, 'Projects');
      return trashedItems?.projects.map((project) =>
        renderRow(
          project.id,
          selectedProjects.has(project.id),
          () => handleToggleProject(project),
          project.name,
          `${project.path} · ${formatDeletedTime(project.deletedAt)}`,
          project.id,
        ),
      );
    }

    return null;
  };

  const modalContent = (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="w-[520px] h-[580px] bg-white rounded-[16px] flex flex-col overflow-hidden shadow-[0_25px_50px_rgba(0,0,0,0.1)]">
        {/* Modal Header - 80px height */}
        <div className="flex items-center justify-between h-20 px-6 border-b border-[#E5E5E5]">
          <div className="flex flex-col gap-1">
            <h2 className="text-[18px] font-semibold text-[#18181B]">Recover Deleted Items</h2>
            <p className="text-[13px] font-normal text-[#71717A]">
              Found {totalCount} {totalCount === 1 ? 'item' : 'items'} in trash
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* R2-9: Empty Trash — destructive batch action, only visible
                when there is something to empty. Same red token as the
                error banner so the destructive nature reads consistently
                across the modal. Two-step confirm lives in
                `confirmRequest` state — this button only opens the dialog. */}
            {totalCount > 0 && (
              <button
                onClick={openEmptyTrashConfirm}
                className="h-8 px-3 flex items-center gap-1.5 rounded-[6px] text-[12px] font-medium text-[#DC2626] hover:bg-[#FEE2E2] transition-colors"
                aria-label="Empty Trash"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Empty Trash
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-[6px] hover:bg-[#FAFAFA] transition-colors"
              aria-label="Close modal"
            >
              <X className="w-[18px] h-[18px] text-[#A1A1AA]" />
            </button>
          </div>
        </div>

        {/* Tab Row - justify-between with tabs left, selection right */}
        <div className="flex items-center justify-between px-6 border-b border-[#E5E5E5]">
          {/* Left side: Tabs */}
          <div className="flex items-center">
            {tabs.map(({ id, icon: TabIcon, label }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-2 py-3 px-4 border-b-2 transition-colors ${
                    active ? 'border-[#18181B]' : 'border-transparent'
                  }`}
                >
                  <TabIcon
                    className={`w-3.5 h-3.5 ${active ? 'text-[#18181B]' : 'text-[#71717A]'}`}
                  />
                  <span
                    className={`text-[13px] ${
                      active ? 'font-semibold text-[#18181B]' : 'font-normal text-[#71717A]'
                    }`}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right side: Divider + Count + Divider + All Checkbox */}
          <div className="flex items-center gap-3">
            {/* Divider */}
            <div className="w-px h-4 bg-[#E5E5E5]" />
            {/* Count */}
            <span className="text-[12px] font-normal text-[#A1A1AA]">
              {currentSelected}/{currentTotal}
            </span>
            {/* Divider */}
            <div className="w-px h-4 bg-[#E5E5E5]" />
            {/* All Checkbox */}
            <div className="flex items-center gap-2.5 cursor-pointer" onClick={handleSelectAll}>
              {allSelected ? (
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

        {/* Content wrapper with relative positioning for error banner */}
        <div className="flex-1 flex flex-col min-h-0 relative">
          {/* Error Banner - Absolute positioned overlay */}
          {restoreError && (
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-2.5 bg-[#FEE2E2]">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#DC2626] flex-shrink-0" />
                <span className="text-[12px] text-[#DC2626]">{restoreError}</span>
              </div>
              <button
                onClick={() => setRestoreError(null)}
                className="text-[11px] font-medium text-[#DC2626] hover:text-[#B91C1C] transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* R2-9: Empty-trash success banner — positive (zinc tokens
              rather than red) so the user can distinguish success from
              partial failure. Same absolute-positioned overlay shape
              as the error banner for consistency. */}
          {emptyTrashSummary && !restoreError && (
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-2.5 bg-[#F4F4F5]">
              <div className="flex items-center gap-2">
                <Check className="w-3 h-3 text-[#52525B]" strokeWidth={3} />
                <span className="text-[12px] text-[#52525B]">{emptyTrashSummary}</span>
              </div>
              <button
                onClick={() => setEmptyTrashSummary(null)}
                className="text-[11px] font-medium text-[#52525B] hover:text-[#18181B] transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Tab body — list / loading / empty state */}
          <div className="flex-1 overflow-y-auto py-4 px-6 flex flex-col gap-0.5">
            {renderTabBody()}
          </div>

          {/* Shared footer — same across all tabs */}
          {renderFooter()}

          {/* R2-9: Permanent-delete confirm overlay. Inline (NOT a nested
              portal) so the visual hierarchy stays within this modal's
              own layer — design-language Rule "Visual hierarchy ≤ 3
              layers". Backdrop is the same `bg-black/40` as the modal
              overlay so the layered look is consistent. */}
          {confirmRequest && (
            <div
              onClick={(e) => {
                // Click on backdrop only — bail if click came from the
                // confirm card itself.
                if (e.target === e.currentTarget) {
                  setConfirmRequest(null);
                }
              }}
              className="absolute inset-0 z-20 flex items-center justify-center bg-black/40"
              role="dialog"
              aria-modal="true"
              aria-labelledby="trash-confirm-title"
            >
              <div className="w-[380px] bg-white rounded-[12px] shadow-[0_25px_50px_rgba(0,0,0,0.1)] overflow-hidden">
                <div className="p-5 flex flex-col gap-2">
                  <h3 id="trash-confirm-title" className="text-[14px] font-semibold text-[#18181B]">
                    {confirmRequest.kind === 'empty' ? 'Empty Trash?' : 'Delete Permanently?'}
                  </h3>
                  <p className="text-[13px] font-normal text-[#52525B]">
                    {confirmRequest.kind === 'empty' ? (
                      <>
                        This will permanently delete all{' '}
                        <span className="font-medium text-[#18181B]">
                          {confirmRequest.itemCount}{' '}
                          {confirmRequest.itemCount === 1 ? 'item' : 'items'}
                        </span>{' '}
                        in trash. This cannot be undone.
                      </>
                    ) : (
                      <>
                        Permanently delete{' '}
                        <span className="font-medium text-[#18181B]">
                          &lsquo;{confirmRequest.displayName}&rsquo;
                        </span>
                        ? This cannot be undone.
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2.5 px-5 py-3 bg-[#FAFAFA] border-t border-[#E5E5E5]">
                  <button
                    onClick={() => setConfirmRequest(null)}
                    disabled={isPermanentlyDeleting}
                    className="h-[32px] px-3 rounded-[6px] border border-[#E5E5E5] text-[12px] font-medium text-[#71717A] hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    disabled={isPermanentlyDeleting}
                    className="h-[32px] px-3 rounded-[6px] bg-[#DC2626] text-[12px] font-medium text-white hover:bg-[#B91C1C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPermanentlyDeleting
                      ? 'Deleting...'
                      : confirmRequest.kind === 'empty'
                        ? 'Empty Trash'
                        : 'Delete Permanently'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default TrashRecoveryModal;
