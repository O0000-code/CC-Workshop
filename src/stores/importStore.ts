import { create } from 'zustand';
import type {
  ExistingConfig,
  ImportItem,
  ImportResult,
  BackupInfo,
  DetectedSkill,
  DetectedMcp,
} from '../types';
import { useSettingsStore } from './settingsStore';
import { useSkillsStore } from './skillsStore';
import { useMcpsStore } from './mcpsStore';
import { isTauri, safeInvoke } from '@/utils/tauri';

// ============================================================================
// Import Store
// ============================================================================
// Manages import state for detecting and importing existing Claude configurations
// from ~/.claude/ directory. Supports Skills and MCP servers detection,
// backup before import, and selective import functionality.

interface ImportState {
  // 状态
  isDetecting: boolean;
  detectedConfig: ExistingConfig | null;
  isImporting: boolean;
  importResult: ImportResult | null;
  backupInfo: BackupInfo | null;
  showImportDialog: boolean;
  selectedItems: ImportItem[];
  error: string | null;

  // 独立弹窗状态
  isSkillsModalOpen: boolean;
  isMcpsModalOpen: boolean;

  // 独立检测结果
  detectedSkills: DetectedSkill[];
  detectedMcps: DetectedMcp[];

  // 独立加载状态
  isDetectingSkills: boolean;
  isDetectingMcps: boolean;

  // Actions
  detectExistingConfig: () => Promise<void>;
  backupBeforeImport: () => Promise<BackupInfo | null>;
  importConfig: () => Promise<void>;
  openImportDialog: () => void;
  closeImportDialog: () => void;
  toggleItemSelection: (item: ImportItem) => void;
  selectAllItems: () => void;
  deselectAllItems: () => void;
  clearError: () => void;
  reset: () => void;

  // 独立检测方法
  detectSkillsOnly: () => Promise<DetectedSkill[]>;
  detectMcpsOnly: () => Promise<DetectedMcp[]>;

  // 弹窗控制
  openSkillsModal: () => Promise<void>;
  closeSkillsModal: () => void;
  openMcpsModal: () => Promise<void>;
  closeMcpsModal: () => void;

  // 独立导入方法
  importSkills: (items: ImportItem[]) => Promise<ImportResult | null>;
  importMcps: (items: ImportItem[]) => Promise<ImportResult | null>;
}

const initialState = {
  isDetecting: false,
  detectedConfig: null,
  isImporting: false,
  importResult: null,
  backupInfo: null,
  showImportDialog: false,
  selectedItems: [] as ImportItem[],
  error: null,
  // 独立弹窗状态
  isSkillsModalOpen: false,
  isMcpsModalOpen: false,
  // 独立检测结果
  detectedSkills: [] as DetectedSkill[],
  detectedMcps: [] as DetectedMcp[],
  // 独立加载状态
  isDetectingSkills: false,
  isDetectingMcps: false,
};

export const useImportStore = create<ImportState>((set, get) => ({
  ...initialState,

  detectExistingConfig: async () => {
    if (!isTauri()) {
      console.warn('ImportStore: Cannot detect config in browser mode');
      return;
    }

    const { claudeConfigDir } = useSettingsStore.getState();
    set({ isDetecting: true, error: null });

    try {
      const config = await safeInvoke<ExistingConfig>('detect_existing_config', {
        claudeConfigDir,
      });

      if (config && config.hasConfig) {
        // 默认不全选 — 让用户显式选择要导入的项目，避免误把 ~/.claude/skills/ 里
        // 的内容整体搬进 ~/.cc-workshop/skills/（import 流程会同时从源目录删除原文件）
        set({
          detectedConfig: config,
          selectedItems: [],
          isDetecting: false,
          showImportDialog: true,
        });
      } else {
        set({ detectedConfig: config, isDetecting: false });
      }
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isDetecting: false });
    }
  },

  backupBeforeImport: async () => {
    if (!isTauri()) return null;

    const { claudeConfigDir, skillSourceDir } = useSettingsStore.getState();
    const ensembleDir = skillSourceDir.replace('/skills', '');

    try {
      const backupInfo = await safeInvoke<BackupInfo>('backup_before_import', {
        ensembleDir,
        claudeConfigDir,
      });
      set({ backupInfo });
      return backupInfo;
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message });
      return null;
    }
  },

  importConfig: async () => {
    if (!isTauri()) return;

    const { selectedItems } = get();
    if (selectedItems.length === 0) {
      set({ error: 'No items selected for import' });
      return;
    }

    const { claudeConfigDir, skillSourceDir } = useSettingsStore.getState();
    const ensembleDir = skillSourceDir.replace('/skills', '');

    set({ isImporting: true, error: null });

    try {
      // 先备份
      const backupInfo = await get().backupBeforeImport();
      if (!backupInfo) {
        set({ isImporting: false, error: 'Backup failed' });
        return;
      }

      // 执行导入
      const result = await safeInvoke<ImportResult>('import_existing_config', {
        claudeConfigDir,
        ensembleDir,
        items: selectedItems,
      });

      if (result) {
        result.backupPath = backupInfo.path;
        set({ importResult: result, isImporting: false });

        // 标记导入已完成并重新加载数据
        if (result.success || result.imported.skills > 0 || result.imported.mcps > 0) {
          useSettingsStore.getState().setHasCompletedImport(true);

          // 重新加载 Skills 和 MCPs 数据以显示导入的内容
          await useSkillsStore.getState().loadSkills();
          await useMcpsStore.getState().loadMcps();
        }
      } else {
        set({ isImporting: false, error: 'Import failed' });
      }
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isImporting: false });
    }
  },

  openImportDialog: () => set({ showImportDialog: true }),

  closeImportDialog: () => set({ showImportDialog: false }),

  toggleItemSelection: (item) => {
    const { selectedItems } = get();
    // Use type, name, AND sourcePath to uniquely identify items
    // This is important for MCPs with same name but different scopes (user vs local)
    const exists = selectedItems.find(
      (i) => i.type === item.type && i.name === item.name && i.sourcePath === item.sourcePath,
    );

    if (exists) {
      set({
        selectedItems: selectedItems.filter(
          (i) =>
            !(i.type === item.type && i.name === item.name && i.sourcePath === item.sourcePath),
        ),
      });
    } else {
      set({ selectedItems: [...selectedItems, item] });
    }
  },

  selectAllItems: () => {
    const { detectedConfig } = get();
    if (!detectedConfig) return;

    const items: ImportItem[] = [
      ...detectedConfig.skills.map((s) => ({
        type: 'skill' as const,
        name: s.name,
        sourcePath: s.path,
      })),
      ...detectedConfig.mcps.map((m) => ({
        type: 'mcp' as const,
        name: m.name,
        sourcePath: '',
      })),
    ];
    set({ selectedItems: items });
  },

  deselectAllItems: () => set({ selectedItems: [] }),

  clearError: () => set({ error: null }),

  reset: () => set(initialState),

  // ============================================================================
  // 独立检测方法
  // ============================================================================

  detectSkillsOnly: async () => {
    if (!isTauri()) {
      console.warn('ImportStore: Cannot detect skills in browser mode');
      return [];
    }

    const { claudeConfigDir } = useSettingsStore.getState();
    set({ isDetectingSkills: true, error: null });

    try {
      const config = await safeInvoke<ExistingConfig>('detect_existing_config', {
        claudeConfigDir,
      });

      const skills = config?.skills ?? [];
      set({ detectedSkills: skills, isDetectingSkills: false });
      return skills;
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isDetectingSkills: false });
      return [];
    }
  },

  detectMcpsOnly: async () => {
    if (!isTauri()) {
      console.warn('ImportStore: Cannot detect MCPs in browser mode');
      return [];
    }

    const { claudeConfigDir } = useSettingsStore.getState();
    set({ isDetectingMcps: true, error: null });

    try {
      const config = await safeInvoke<ExistingConfig>('detect_existing_config', {
        claudeConfigDir,
      });

      const mcps = config?.mcps ?? [];
      set({ detectedMcps: mcps, isDetectingMcps: false });
      return mcps;
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isDetectingMcps: false });
      return [];
    }
  },

  // ============================================================================
  // 弹窗控制
  // ============================================================================

  openSkillsModal: async () => {
    set({ isSkillsModalOpen: true });
    await get().detectSkillsOnly();
  },

  closeSkillsModal: () => {
    set({ isSkillsModalOpen: false, detectedSkills: [], selectedItems: [], error: null });
  },

  openMcpsModal: async () => {
    set({ isMcpsModalOpen: true });
    await get().detectMcpsOnly();
  },

  closeMcpsModal: () => {
    set({ isMcpsModalOpen: false, detectedMcps: [], selectedItems: [], error: null });
  },

  // ============================================================================
  // 独立导入方法
  // ============================================================================

  importSkills: async (items: ImportItem[]) => {
    if (!isTauri()) {
      console.warn('ImportStore: Cannot import skills in browser mode');
      return null;
    }

    if (items.length === 0) {
      set({ error: 'No skills selected for import' });
      return null;
    }

    const { claudeConfigDir, skillSourceDir } = useSettingsStore.getState();
    const ensembleDir = skillSourceDir.replace('/skills', '');

    set({ isImporting: true, error: null });

    try {
      // 先备份
      const backupInfo = await get().backupBeforeImport();
      if (!backupInfo) {
        set({ isImporting: false, error: 'Backup failed' });
        return null;
      }

      // 执行导入
      const result = await safeInvoke<ImportResult>('import_existing_config', {
        claudeConfigDir,
        ensembleDir,
        items,
      });

      if (result) {
        result.backupPath = backupInfo.path;
        set({ importResult: result, isImporting: false });

        // 成功导入后，从源位置删除已导入的 Skills
        if (result.success || result.imported.skills > 0) {
          const skillNames = items.map((item) => item.name);
          await safeInvoke<number>('remove_imported_skills', {
            claudeConfigDir,
            skillNames,
          });

          // 重新加载 Skills 数据以显示导入的内容
          await useSkillsStore.getState().loadSkills();
        }

        return result;
      } else {
        set({ isImporting: false, error: 'Import failed' });
        return null;
      }
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isImporting: false });
      return null;
    }
  },

  importMcps: async (items: ImportItem[]) => {
    if (!isTauri()) {
      console.warn('ImportStore: Cannot import MCPs in browser mode');
      return null;
    }

    if (items.length === 0) {
      set({ error: 'No MCPs selected for import' });
      return null;
    }

    // R7 F7-5 fix (A7): use mcpSourceDir, not skillSourceDir, so a user
    // who customised `mcpSourceDir` to a non-default path (e.g. an external
    // volume) gets the imported MCP JSON files written under their chosen
    // directory. Backend `import_existing_config` derives `mcps_dest =
    // ensembleDir/mcps` (`src-tauri/src/commands/import.rs:537`), so the
    // strip mirrors that contract.
    const { claudeConfigDir, mcpSourceDir } = useSettingsStore.getState();
    const ensembleDir = mcpSourceDir.replace('/mcps', '');

    set({ isImporting: true, error: null });

    try {
      // 先备份
      const backupInfo = await get().backupBeforeImport();
      if (!backupInfo) {
        set({ isImporting: false, error: 'Backup failed' });
        return null;
      }

      // 执行导入
      const result = await safeInvoke<ImportResult>('import_existing_config', {
        claudeConfigDir,
        ensembleDir,
        items,
      });

      if (result) {
        result.backupPath = backupInfo.path;
        set({ importResult: result, isImporting: false });

        // 成功导入后，从 ~/.claude.json 删除已导入的 MCPs
        if (result.success || result.imported.mcps > 0) {
          const mcpNames = items.map((item) => item.name);
          await safeInvoke<number>('remove_imported_mcps', {
            mcpNames,
          });

          // 重新加载 MCPs 数据以显示导入的内容
          await useMcpsStore.getState().loadMcps();
        }

        return result;
      } else {
        set({ isImporting: false, error: 'Import failed' });
        return null;
      }
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isImporting: false });
      return null;
    }
  },
}));
