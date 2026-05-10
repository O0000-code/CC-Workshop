import { create } from 'zustand';
import type { AppSettings, ClaudeMdDistributionPath } from '../types';
import { isTauri, safeInvoke } from '@/utils/tauri';

// ============================================================================
// Settings Store
// ============================================================================
// Manages application settings including storage paths, API configuration,
// and auto-classify preferences. Uses Tauri backend for persistence.

export interface SettingsStats {
  skillsCount: number;
  mcpsCount: number;
  scenesCount: number;
  totalSize: string;
}

export interface SettingsState {
  // Storage paths
  skillSourceDir: string;
  mcpSourceDir: string;
  claudeConfigDir: string;

  // API configuration
  anthropicApiKey: string;

  // Auto classify settings
  autoClassifyNewItems: boolean;

  // Terminal and launch settings
  terminalApp: string;
  claudeCommand: string;
  warpOpenMode: 'tab' | 'window';

  // CLAUDE.md settings
  claudeMdDistributionPath: ClaudeMdDistributionPath;

  // Import state
  hasCompletedImport: boolean;

  // Stats (computed from other stores or fetched)
  stats: SettingsStats;

  // Loading state
  isLoading: boolean;
  error: string | null;

  // Actions - Setters (with auto-save)
  setSkillSourceDir: (dir: string) => void;
  setMcpSourceDir: (dir: string) => void;
  setClaudeConfigDir: (dir: string) => void;
  setAnthropicApiKey: (key: string) => void;
  setAutoClassifyNewItems: (enabled: boolean) => void;
  setTerminalApp: (app: string) => void;
  setClaudeCommand: (command: string) => void;
  setWarpOpenMode: (mode: 'tab' | 'window') => void;
  setClaudeMdDistributionPath: (path: ClaudeMdDistributionPath) => void;
  setHasCompletedImport: (completed: boolean) => void;
  setStats: (stats: Partial<SettingsStats>) => void;

  // Actions - Tauri integration
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  selectDirectory: (type: 'skill' | 'mcp' | 'claude') => Promise<void>;

  // Utility
  getMaskedApiKey: () => string;
  hasApiKey: () => boolean;
}

// Default values
const defaultSettings = {
  skillSourceDir: '~/.ensemble/skills',
  mcpSourceDir: '~/.ensemble/mcps',
  claudeConfigDir: '~/.claude',
  anthropicApiKey: '',
  // V2 Marketplace (D-Imp-12 / spec §3.5): default ON so newly installed
  // marketplace items are auto-classified without requiring the user to
  // discover the toggle. Users can still disable in Settings; backend
  // `spawn_auto_classify` reads this flag before dispatching.
  autoClassifyNewItems: true,
  terminalApp: 'Terminal',
  claudeCommand: 'claude',
  warpOpenMode: 'window' as const,
  claudeMdDistributionPath: '.claude/CLAUDE.md' as ClaudeMdDistributionPath,
  hasCompletedImport: false,
  stats: {
    skillsCount: 0,
    mcpsCount: 0,
    scenesCount: 0,
    totalSize: '0 MB',
  },
};

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  // Initial state
  ...defaultSettings,
  isLoading: false,
  error: null,

  // Actions - Setters (with auto-save)
  setSkillSourceDir: (dir: string) => {
    set({ skillSourceDir: dir });
    get().saveSettings();
  },

  setMcpSourceDir: (dir: string) => {
    set({ mcpSourceDir: dir });
    get().saveSettings();
  },

  setClaudeConfigDir: (dir: string) => {
    set({ claudeConfigDir: dir });
    get().saveSettings();
  },

  setAnthropicApiKey: (key: string) => {
    set({ anthropicApiKey: key });
    get().saveSettings();
  },

  setAutoClassifyNewItems: (enabled: boolean) => {
    set({ autoClassifyNewItems: enabled });
    get().saveSettings();
  },

  setTerminalApp: (app: string) => {
    set({ terminalApp: app });
    get().saveSettings();
  },

  setClaudeCommand: (command: string) => {
    set({ claudeCommand: command });
    get().saveSettings();
  },

  setWarpOpenMode: (mode: 'tab' | 'window') => {
    set({ warpOpenMode: mode });
    get().saveSettings();
  },

  setClaudeMdDistributionPath: (path: ClaudeMdDistributionPath) => {
    set({ claudeMdDistributionPath: path });
    get().saveSettings();
  },

  setHasCompletedImport: (completed: boolean) => {
    set({ hasCompletedImport: completed });
    get().saveSettings();
  },

  setStats: (stats: Partial<SettingsStats>) =>
    set((state) => ({
      stats: { ...state.stats, ...stats },
    })),

  // Actions - Tauri integration
  loadSettings: async () => {
    // Skip loading in non-Tauri environment
    if (!isTauri()) {
      console.warn('Settings: Running in browser mode, using default settings');
      set({ isLoading: false });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const settings = await safeInvoke<AppSettings>('read_settings');
      if (settings) {
        set({
          skillSourceDir: settings.skillSourceDir,
          mcpSourceDir: settings.mcpSourceDir,
          claudeConfigDir: settings.claudeConfigDir,
          anthropicApiKey: settings.anthropicApiKey || '',
          autoClassifyNewItems: settings.autoClassifyNewItems,
          terminalApp: settings.terminalApp || 'Terminal',
          claudeCommand: settings.claudeCommand || 'claude',
          warpOpenMode: settings.warpOpenMode || 'window',
          claudeMdDistributionPath: settings.claudeMdDistributionPath || '.claude/CLAUDE.md',
          hasCompletedImport: settings.hasCompletedImport || false,
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      console.error('Failed to load settings:', error);
      set({ error: message, isLoading: false });
    }
  },

  saveSettings: async () => {
    // Skip saving in non-Tauri environment
    if (!isTauri()) {
      console.warn('Settings: Cannot save in browser mode');
      return;
    }

    const state = get();
    try {
      await safeInvoke('write_settings', {
        settings: {
          skillSourceDir: state.skillSourceDir,
          mcpSourceDir: state.mcpSourceDir,
          claudeConfigDir: state.claudeConfigDir,
          anthropicApiKey: state.anthropicApiKey,
          autoClassifyNewItems: state.autoClassifyNewItems,
          terminalApp: state.terminalApp,
          claudeCommand: state.claudeCommand,
          warpOpenMode: state.warpOpenMode,
          claudeMdDistributionPath: state.claudeMdDistributionPath,
          hasCompletedImport: state.hasCompletedImport,
        },
      });
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      console.error('Failed to save settings:', error);
      set({ error: message });
    }
  },

  selectDirectory: async (type: 'skill' | 'mcp' | 'claude') => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('Settings: Directory selection not available in browser mode');
      return;
    }

    try {
      const path = await safeInvoke<string | null>('select_folder');
      if (path) {
        if (type === 'skill') {
          set({ skillSourceDir: path });
        } else if (type === 'mcp') {
          set({ mcpSourceDir: path });
        } else {
          set({ claudeConfigDir: path });
        }
        // Save settings after directory selection
        get().saveSettings();
      }
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      console.error('Failed to select directory:', error);
      set({ error: message });
    }
  },

  // Utility functions
  getMaskedApiKey: () => {
    const key = get().anthropicApiKey;
    if (!key) return '';
    // Show first 10 chars and mask the rest
    if (key.length <= 15) {
      return key.substring(0, 7) + '***...';
    }
    return key.substring(0, 10) + '***...';
  },

  hasApiKey: () => {
    const key = get().anthropicApiKey;
    return key.length > 0;
  },
}));
