import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useScenesStore } from '@/stores/scenesStore';
import { useProjectsStore } from '@/stores/projectsStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Folder, X } from 'lucide-react';
import { safeInvoke } from '@/utils/tauri';

interface LauncherModalProps {
  isOpen: boolean;
  folderPath: string;
  onClose: () => void;
}

/**
 * Multi-line recovery instructions shown when cmux's CLI socket is locked
 * down by the default `socketControlMode: "cmuxOnly"`. Mirrors the
 * `ACCESSIBILITY_PERMISSION_REQUIRED` pattern (see MainLayout.tsx) — the
 * backend returns a short sentinel and the frontend supplies the user-facing
 * copy in the locale and layout it controls. Rendered in a `whitespace-pre-line`
 * container so newlines and the JSON literal stay readable.
 */
const CMUX_SOCKET_LOCKED_MESSAGE = `cmux is installed and running, but its CLI socket is locked down (default mode "cmuxOnly"). To let CC Workshop control cmux:

  1. Open ~/.config/cmux/cmux.json
  2. Add or set:
     "automation": { "socketControlMode": "automation" }
  3. Fully quit cmux (Cmd-Q) and reopen it.
     — cmux's reload-config command does NOT pick up this setting.
  4. Retry Launch.`;

export function LauncherModal({ isOpen, folderPath, onClose }: LauncherModalProps) {
  const { scenes } = useScenesStore();
  const { projects, syncProject, updateProject } = useProjectsStore();
  const { terminalApp, claudeCommand, warpOpenMode } = useSettingsStore();

  const [selectedSceneId, setSelectedSceneId] = useState<string>('');
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);

  // Check if folder already has an associated project
  const existingProject = projects.find((p) => p.path === folderPath);

  useEffect(() => {
    if (existingProject?.sceneId) {
      setSelectedSceneId(existingProject.sceneId);
    } else if (scenes.length > 0) {
      setSelectedSceneId(scenes[0].id);
    }
  }, [existingProject, scenes]);

  // Get folder name from path
  const folderName = folderPath.split('/').pop() || folderPath;

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

  // Handle overlay click
  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === overlayRef.current) {
      onClose();
    }
  };

  const handleLaunch = async () => {
    if (!selectedSceneId) {
      setError('Please select a Scene');
      return;
    }

    setIsLaunching(true);
    setError(null);

    try {
      let projectId = existingProject?.id;

      // If no existing project, create one
      if (!existingProject) {
        const newProject = await safeInvoke<{ id: string }>('add_project', {
          name: folderName,
          path: folderPath,
          sceneId: selectedSceneId,
        });
        if (newProject) {
          projectId = newProject.id;
          // Reload projects to get the new one
          await useProjectsStore.getState().loadProjects();
        }
      } else if (existingProject.sceneId !== selectedSceneId) {
        // Update existing project's Scene
        await updateProject(existingProject.id, { sceneId: selectedSceneId });
      }

      // Sync configuration to project directory
      if (projectId) {
        await syncProject(projectId);
      }

      // Launch terminal and Claude Code
      await safeInvoke('launch_claude_for_folder', {
        folderPath,
        terminalApp,
        claudeCommand,
        warpOpenMode: warpOpenMode || 'window',
      });

      onClose();
    } catch (err) {
      // R2-8d: the backend returns "TerminalNotInstalled:<App>" when the
      // user-selected terminal is missing. Surface this as a friendly,
      // actionable message instead of the raw OS-level error string.
      // cmux: a separate CMUX_SOCKET_LOCKED sentinel covers the
      // socketControlMode=cmuxOnly default — see cmux module-level comment
      // in `import.rs` for the rationale.
      const raw = typeof err === 'string' ? err : String(err);
      if (raw.startsWith('TerminalNotInstalled:')) {
        const missing = raw.substring('TerminalNotInstalled:'.length).trim();
        setError(
          `${missing} doesn't appear to be installed on this Mac. Open Settings → Launch Configuration and pick a different terminal, or install ${missing}.`,
        );
      } else if (raw === 'CMUX_SOCKET_LOCKED' || raw.includes('CMUX_SOCKET_LOCKED')) {
        setError(CMUX_SOCKET_LOCKED_MESSAGE);
      } else {
        setError(raw);
      }
    } finally {
      setIsLaunching(false);
    }
  };

  // Get skill, MCP, and CLAUDE.md counts for a scene
  const getSceneCounts = (scene: {
    skillIds: string[];
    mcpIds: string[];
    claudeMdIds?: string[];
  }) => {
    return {
      skillCount: scene.skillIds.length,
      mcpCount: scene.mcpIds.length,
      claudeMdCount: scene.claudeMdIds?.length ?? 0,
    };
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="modal-overlay-animate fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="modal-dialog-animate flex h-[500px] w-[480px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_25px_50px_rgba(0,0,0,0.1)]">
        {/* Modal Header */}
        <div className="flex flex-col gap-3 px-6 pt-5 pb-2">
          {/* Header Top - Title and Close */}
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-semibold text-[#18181B]">Launch Claude Code</h2>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[#F4F4F5]"
              aria-label="Close modal"
            >
              <X className="h-4 w-4 text-[#A1A1AA]" />
            </button>
          </div>

          {/* Folder Info */}
          <div className="flex items-center gap-2.5 rounded-lg bg-[#F4F4F5] px-[14px] py-3">
            <Folder className="h-4 w-4 text-[#71717A]" />
            <span className="text-[13px] font-medium text-[#18181B]">{folderName}</span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Scene Label */}
          <div className="border-b border-[#E5E5E5] px-6 py-2">
            <span className="text-xs font-medium text-[#71717A]">Select Scene</span>
          </div>

          {/* Scene List */}
          <div className="flex-1 overflow-y-auto">
            {scenes.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-6 text-center">
                <p className="text-sm text-[#71717A]">No Scenes available</p>
                <p className="mt-1 text-xs text-[#A1A1AA]">
                  Create a Scene first in the Scenes page
                </p>
              </div>
            ) : (
              scenes.map((scene) => {
                const isSelected = selectedSceneId === scene.id;
                const { skillCount, mcpCount, claudeMdCount } = getSceneCounts(scene);

                return (
                  <div
                    key={scene.id}
                    onClick={() => setSelectedSceneId(scene.id)}
                    className={`flex cursor-pointer items-center gap-3 px-6 py-[14px] transition-colors ${
                      isSelected ? 'bg-[#F4F4F5]' : 'hover:bg-[#FAFAFA]'
                    }`}
                  >
                    {/* Indicator / Spacer */}
                    <div
                      className={`h-5 w-[3px] rounded-sm ${
                        isSelected ? 'bg-[#18181B]' : 'bg-transparent'
                      }`}
                    />
                    {/* Info */}
                    <div className="flex flex-1 flex-col gap-0.5">
                      <span
                        className={`text-sm text-[#18181B] ${
                          isSelected ? 'font-semibold' : 'font-medium'
                        }`}
                      >
                        {scene.name}
                      </span>
                      <span className="text-xs text-[#71717A]">
                        {skillCount} Skills · {mcpCount} MCPs
                        {claudeMdCount > 0 ? ` · ${claudeMdCount} Docs` : ''}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Error Display
         *
         * `whitespace-pre-line` preserves `\n` line breaks for multi-line
         * recovery instructions (e.g. CMUX_SOCKET_LOCKED_MESSAGE). Single-line
         * errors render identically. `max-h-32 overflow-y-auto` prevents the
         * footer from being pushed out of frame when the error is long. */}
        {error && (
          <div className="mx-6 mb-2 max-h-32 overflow-y-auto whitespace-pre-line rounded-lg bg-[#FEF2F2] p-3 text-sm text-[#DC2626]">
            {error}
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[#E5E5E5] px-6 py-4">
          <button
            onClick={onClose}
            disabled={isLaunching}
            className="h-10 rounded-lg border border-[#E5E5E5] px-5 text-sm font-medium text-[#71717A] transition-colors hover:bg-[#F4F4F5] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleLaunch}
            disabled={isLaunching || scenes.length === 0 || !selectedSceneId}
            className="h-10 rounded-lg bg-[#18181B] px-6 text-sm font-medium text-white transition-colors hover:bg-[#27272A] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLaunching ? 'Launching...' : 'Launch'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
