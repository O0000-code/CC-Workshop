import { create } from 'zustand';
import type { Project, Scene } from '../types';
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

  // New project form
  newProject: NewProjectForm;

  // Actions
  setProjects: (projects: Project[]) => void;
  selectProject: (id: string | null) => void;
  setFilter: (filter: Partial<ProjectsFilter>) => void;
  startCreating: () => void;
  cancelCreating: () => void;
  updateNewProject: (data: Partial<NewProjectForm>) => void;

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
      await safeInvoke('update_project', { id, ...data });
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

    set({ syncingProjectId: id, error: null });
    try {
      // Sync Skills (symlinks) and MCP config (.mcp.json)
      await safeInvoke('sync_project_config', {
        projectPath: project.path,
        skillPaths: skillPaths,
        mcpServers: mcpServers,
      });

      // Distribute CLAUDE.md files if scene has any
      if (scene.claudeMdIds && scene.claudeMdIds.length > 0) {
        // Get distribution path from settings (default: '.claude/CLAUDE.md')
        const claudeMdDistributionPath = useSettingsStore.getState().claudeMdDistributionPath;
        await safeInvoke('distribute_scene_claude_md', {
          claudeMdIds: scene.claudeMdIds,
          projectPath: project.path,
          targetPath: claudeMdDistributionPath,
          conflictResolution: 'backup', // Backup existing files
        });
      }

      // Distribute Rules if the Scene references any. Target is fixed at
      // `<project>/.claude/rules/<filename>.md` per `.dev/rule-management/01_design.md`,
      // so there is no `targetPath` parameter — conflict policy stays `backup`
      // for parity with the CLAUDE.md branch above.
      if (scene.ruleIds && scene.ruleIds.length > 0) {
        await safeInvoke('distribute_scene_rules', {
          ruleIds: scene.ruleIds,
          projectPath: project.path,
          conflictResolution: 'backup',
        });
      }

      // Update lastSynced
      const now = new Date().toISOString();
      await safeInvoke('update_project', { id, lastSynced: now });

      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, lastSynced: now } : p)),
        syncingProjectId: null,
      }));
    } catch (error) {
      set({ error: String(error), syncingProjectId: null });
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
