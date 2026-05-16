import { create } from 'zustand';
import type { Project, Scene } from '../types';
import type { ClaudeMdDistributionResult } from '../types/claudeMd';
import type { RuleDistributionResult } from '../types/rule';
import { useScenesStore } from './scenesStore';
import { useSkillsStore } from './skillsStore';
import { useMcpsStore } from './mcpsStore';
import { useSettingsStore } from './settingsStore';
import { isTauri, safeInvoke } from '@/utils/tauri';

// ============================================================================
// Types
// ============================================================================

interface ProjectsFilter {
  search: string;
}

interface NewProjectForm {
  name: string;
  path: string;
  sceneId: string;
}

/**
 * Per-step result of a `syncProject` run.
 *
 * Round 2 fix R2-3 (R1 A7 / R7 F7-3 / R1 F5): the 4-step sync chain
 * (sync_project_config → distribute_scene_claude_md → distribute_scene_rules
 * → update_project lastSynced) previously surfaced only a single thrown
 * error to the UI, leaving the user with no idea which step failed or
 * whether the project was now half-synced. The store now collects one
 * `SyncStepResult` per attempted step so `ProjectsPage` can render a
 * structured banner naming each step's outcome.
 *
 * Steps that were skipped (e.g. Scene has no CLAUDE.md / Rules) are
 * omitted from the array — the consumer should treat missing entries
 * as "not applicable", not "succeeded silently".
 */
export interface SyncStepResult {
  /** Human-readable step name, shown verbatim to the user. */
  step: string;
  /** True if every operation in this step succeeded. */
  ok: boolean;
  /** Failure message when `ok === false`. Omitted on success. */
  error?: string;
}

interface ProjectsState {
  // Data
  projects: Project[];
  selectedProjectId: string | null;
  isCreating: boolean;
  isLoading: boolean;
  filter: ProjectsFilter;

  // Error and sync state
  error: string | null;
  syncingProjectId: string | null;

  /**
   * Per-step results of the most recent `syncProject` run. Cleared when
   * the user dismisses the banner or starts a new sync. `null` means
   * there is no recent sync outcome to surface; an empty array means a
   * sync was attempted but no step ran (defensive — should not happen
   * in practice).
   */
  syncStepResults: SyncStepResult[] | null;
  /** Project id the `syncStepResults` belong to, for banner targeting. */
  syncResultsProjectId: string | null;

  // New project form
  newProject: NewProjectForm;

  // Actions
  setProjects: (projects: Project[]) => void;
  selectProject: (id: string | null) => void;
  setFilter: (filter: Partial<ProjectsFilter>) => void;
  startCreating: () => void;
  cancelCreating: () => void;
  updateNewProject: (data: Partial<NewProjectForm>) => void;
  /**
   * Clear the most recent sync step results — used by the banner's
   * "Dismiss" button. Does not roll back any filesystem state; that is
   * the user's job via `clearProjectConfig`.
   */
  clearSyncResults: () => void;

  // Tauri Actions
  loadProjects: () => Promise<void>;
  createProject: () => Promise<Project | undefined>;
  updateProject: (id: string, data: Partial<Project>) => Promise<void>;
  syncProject: (id: string) => Promise<void>;
  clearProjectConfig: (id: string) => Promise<void>;
  selectProjectFolder: () => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  // Getters
  getAvailableScenes: () => Scene[];
}

// ============================================================================
// Store
// ============================================================================

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  // Initial state
  projects: [],
  selectedProjectId: null,
  isCreating: false,
  isLoading: false,
  filter: {
    search: '',
  },
  error: null,
  syncingProjectId: null,
  syncStepResults: null,
  syncResultsProjectId: null,
  newProject: {
    name: '',
    path: '',
    sceneId: '',
  },

  // Actions
  setProjects: (projects) => set({ projects }),

  selectProject: (id) =>
    set({
      selectedProjectId: id,
      isCreating: false,
    }),

  setFilter: (filter) =>
    set((state) => ({
      filter: { ...state.filter, ...filter },
    })),

  startCreating: () =>
    set({
      isCreating: true,
      selectedProjectId: null,
      newProject: {
        name: '',
        path: '',
        sceneId: '',
      },
    }),

  cancelCreating: () =>
    set({
      isCreating: false,
      newProject: {
        name: '',
        path: '',
        sceneId: '',
      },
    }),

  updateNewProject: (data) =>
    set((state) => ({
      newProject: { ...state.newProject, ...data },
    })),

  clearSyncResults: () => set({ syncStepResults: null, syncResultsProjectId: null }),

  // Tauri Actions
  loadProjects: async () => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('ProjectsStore: Cannot load projects in browser mode');
      set({ isLoading: false });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const projects = await safeInvoke<Project[]>('get_projects');
      set({ projects: projects || [], isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  createProject: async () => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('ProjectsStore: Cannot create project in browser mode');
      return;
    }

    const { newProject } = get();
    if (!newProject.name || !newProject.path) return;

    try {
      const project = await safeInvoke<Project>('add_project', {
        name: newProject.name,
        path: newProject.path,
        sceneId: newProject.sceneId || null,
      });
      if (!project) {
        set({ error: 'Failed to create project' });
        return;
      }
      set((state) => ({
        projects: [...state.projects, project],
        isCreating: false,
        selectedProjectId: null,
        newProject: {
          name: '',
          path: '',
          sceneId: '',
        },
      }));
      return project;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  updateProject: async (id, data) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('ProjectsStore: Cannot update project in browser mode');
      return;
    }

    try {
      // `sceneId` is three-state on the backend (`Option<Option<String>>`):
      //   - key omitted              → "do not modify"
      //   - key with literal `null`  → "clear scene binding"
      //   - key with string id       → "rebind"
      // Detect intent by `'sceneId' in data`; normalise `undefined` → `null`
      // so JSON.stringify emits an explicit `null` for the clear signal
      // rather than dropping the key. Mirrors the round-1 A8 pattern in
      // `rulesStore.updateRule` / `claudeMdStore.updateFile`. R3-1 / R3 F10.
      const payload: Record<string, unknown> = { id };
      if ('name' in data) payload.name = data.name;
      if ('path' in data) payload.path = data.path;
      if ('sceneId' in data) {
        payload.sceneId = data.sceneId === undefined ? null : data.sceneId;
      }
      if ('lastSynced' in data) payload.lastSynced = data.lastSynced;

      await safeInvoke('update_project', payload);
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, ...data } : p)),
      }));
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  syncProject: async (id) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('ProjectsStore: Cannot sync project in browser mode');
      return;
    }

    const project = get().projects.find((p) => p.id === id);
    if (!project) return;

    const scene = useScenesStore.getState().scenes.find((s) => s.id === project.sceneId);
    if (!scene) {
      set({ error: 'Scene not found' });
      return;
    }

    // Get skills and mcps data
    const allSkills = useSkillsStore.getState().skills;
    const allMcps = useMcpsStore.getState().mcpServers;

    // Convert skill IDs to skill paths
    const skillPaths = scene.skillIds
      .map((skillId) => allSkills.find((s) => s.id === skillId))
      .filter((s): s is NonNullable<typeof s> => s !== undefined)
      .map((s) => s.sourcePath);

    // Convert MCP IDs to full MCP server objects (backend expects complete McpServer)
    const mcpServers = scene.mcpIds
      .map((mcpId) => allMcps.find((m) => m.id === mcpId))
      .filter((m): m is NonNullable<typeof m> => m !== undefined);

    // Round 2 fix R2-3: step-level reporting. Each of the four steps is
    // tried in its own try/catch, and the per-item Vec returned by
    // `distribute_scene_claude_md` / `distribute_scene_rules` is
    // inspected for `success: false` entries (backend convention: those
    // commands always return Ok but include per-item errors). Any step
    // failure aborts the chain (later steps would touch the same
    // partially-synced project), the collected results are persisted to
    // store state for the banner to render, and an Error is thrown so
    // existing toast / store-error consumers still light up.
    const stepResults: SyncStepResult[] = [];

    set({
      syncingProjectId: id,
      error: null,
      syncStepResults: null,
      syncResultsProjectId: null,
    });

    try {
      // Step 1: Skills (symlinks) + .mcp.json
      try {
        await safeInvoke('sync_project_config', {
          projectPath: project.path,
          skillPaths: skillPaths,
          mcpServers: mcpServers,
        });
        stepResults.push({ step: 'Skills + MCP config', ok: true });
      } catch (e) {
        stepResults.push({ step: 'Skills + MCP config', ok: false, error: String(e) });
        throw new Error(`Sync step "Skills + MCP config" failed: ${String(e)}`);
      }

      // Step 2: CLAUDE.md distribution (only if scene references any)
      if (scene.claudeMdIds && scene.claudeMdIds.length > 0) {
        const claudeMdDistributionPath = useSettingsStore.getState().claudeMdDistributionPath;
        try {
          const results =
            (await safeInvoke<ClaudeMdDistributionResult[]>('distribute_scene_claude_md', {
              claudeMdIds: scene.claudeMdIds,
              projectPath: project.path,
              targetPath: claudeMdDistributionPath,
              conflictResolution: 'backup', // Backup existing files
            })) ?? [];
          // Backend convention: the batch IPC returns Ok with per-item
          // success flags. We must inspect them — otherwise a partial
          // failure (1/3 CLAUDE.md couldn't be written) would slip past
          // the catch entirely.
          const failures = results.filter((r) => !r.success);
          if (failures.length > 0) {
            const summary = `${failures.length} file(s) failed: ${failures
              .map((f) => f.error ?? 'unknown error')
              .join('; ')}`;
            stepResults.push({ step: 'CLAUDE.md distribute', ok: false, error: summary });
            throw new Error(`Sync step "CLAUDE.md distribute" failed: ${summary}`);
          }
          stepResults.push({ step: 'CLAUDE.md distribute', ok: true });
        } catch (e) {
          // Either the IPC itself threw, or our per-item check rethrew.
          // Only push a step result if we haven't already (the per-item
          // branch pushes before throwing).
          if (
            stepResults.length === 0 ||
            stepResults[stepResults.length - 1]?.step !== 'CLAUDE.md distribute'
          ) {
            stepResults.push({ step: 'CLAUDE.md distribute', ok: false, error: String(e) });
          }
          throw e;
        }
      }

      // Step 3: Rules distribution (target is fixed at
      // `<project>/.claude/rules/<filename>.md` per
      // `.dev/rule-management/01_design.md`, so no `targetPath` param.
      // Same per-item check pattern as Step 2.)
      if (scene.ruleIds && scene.ruleIds.length > 0) {
        try {
          const results =
            (await safeInvoke<RuleDistributionResult[]>('distribute_scene_rules', {
              ruleIds: scene.ruleIds,
              projectPath: project.path,
              conflictResolution: 'backup',
            })) ?? [];
          const failures = results.filter((r) => !r.success);
          if (failures.length > 0) {
            const summary = `${failures.length} rule(s) failed: ${failures
              .map((f) => f.error ?? 'unknown error')
              .join('; ')}`;
            stepResults.push({ step: 'Rules distribute', ok: false, error: summary });
            throw new Error(`Sync step "Rules distribute" failed: ${summary}`);
          }
          stepResults.push({ step: 'Rules distribute', ok: true });
        } catch (e) {
          if (
            stepResults.length === 0 ||
            stepResults[stepResults.length - 1]?.step !== 'Rules distribute'
          ) {
            stepResults.push({ step: 'Rules distribute', ok: false, error: String(e) });
          }
          throw e;
        }
      }

      // Step 4: update lastSynced timestamp
      const now = new Date().toISOString();
      try {
        await safeInvoke('update_project', { id, lastSynced: now });
        stepResults.push({ step: 'Update last-synced timestamp', ok: true });
      } catch (e) {
        stepResults.push({
          step: 'Update last-synced timestamp',
          ok: false,
          error: String(e),
        });
        throw new Error(`Sync step "Update last-synced timestamp" failed: ${String(e)}`);
      }

      // All steps succeeded — clear any previous result banner since the
      // user just got a clean run, then update local lastSynced.
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, lastSynced: now } : p)),
        syncingProjectId: null,
        syncStepResults: null,
        syncResultsProjectId: null,
      }));
    } catch (error) {
      // Partial-fail path: keep `stepResults` so the page can render the
      // banner naming exactly which step blew up. `error` still set so
      // existing toast / banner consumers behave as before.
      set({
        error: String(error),
        syncingProjectId: null,
        syncStepResults: stepResults,
        syncResultsProjectId: id,
      });
      throw error;
    }
  },

  clearProjectConfig: async (id) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('ProjectsStore: Cannot clear project config in browser mode');
      return;
    }

    const project = get().projects.find((p) => p.id === id);
    if (!project) return;

    try {
      await safeInvoke('clear_project_config', { projectPath: project.path });

      // Clear lastSynced
      await safeInvoke('update_project', { id, lastSynced: null });

      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, lastSynced: undefined } : p)),
      }));
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  selectProjectFolder: async () => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('ProjectsStore: Cannot select folder in browser mode');
      return;
    }

    try {
      const path = await safeInvoke<string | null>('select_folder');
      if (path) {
        set((state) => ({
          newProject: { ...state.newProject, path },
        }));
      }
    } catch (error) {
      set({ error: String(error) });
    }
  },

  deleteProject: async (id) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('ProjectsStore: Cannot delete project in browser mode');
      return;
    }

    try {
      await safeInvoke('delete_project', { id });
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId,
      }));
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  // Getters
  getAvailableScenes: () => {
    return useScenesStore.getState().scenes;
  },
}));

export default useProjectsStore;
