import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../appStore';
import type { AppData, MigrationReport } from '@/types';

vi.mock('@/utils/tauri', () => ({
  isTauri: vi.fn(() => true),
  safeInvoke: vi.fn(),
  BROWSER_MODE_MESSAGE: 'mock browser mode',
}));

import { safeInvoke } from '@/utils/tauri';
const mockSafeInvoke = vi.mocked(safeInvoke);

const flushPromises = async () => {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
};

const baseAppData = (overrides: Partial<AppData> = {}): AppData => ({
  scenes: [],
  projects: [],
  categories: [],
  tags: [],
  hasCompletedCategoryIdMigration: false,
  ...overrides,
});

describe('appStore.initApp — V1 hierarchy one-time migration trigger', () => {
  // Migration summary logs at warn level (project ESLint disallows console.info);
  // failures log at error level. Both spies are silenced here so the test runner
  // output stays clean.
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockSafeInvoke.mockReset();

    useAppStore.setState({
      activeCategory: null,
      activeTags: [],
      categories: [],
      tags: [],
      categoriesVersion: 0,
      tagsVersion: 0,
      counts: { skills: 0, mcpServers: 0, scenes: 0, projects: 0 },
      isLoading: false,
      error: null,
      editingCategoryId: null,
      isAddingCategory: false,
      editingTagId: null,
      isAddingTag: false,
    });

    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    mockSafeInvoke.mockReset();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('triggers migrate IPC when hasCompletedCategoryIdMigration is false', async () => {
    const report: MigrationReport = {
      migratedSkills: 3,
      migratedMcps: 1,
      orphanedSkills: ['orphan-skill-1'],
      orphanedMcps: [],
    };

    mockSafeInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'init_app_data') return null;
      if (cmd === 'get_categories') return [];
      if (cmd === 'get_tags') return [];
      if (cmd === 'read_app_data') return baseAppData({ hasCompletedCategoryIdMigration: false });
      if (cmd === 'migrate_category_id_for_skills_mcps') return report;
      return null;
    });

    await useAppStore.getState().initApp();
    await flushPromises();

    const ipcNames = mockSafeInvoke.mock.calls.map(([n]) => n);
    expect(ipcNames).toContain('read_app_data');
    expect(ipcNames).toContain('migrate_category_id_for_skills_mcps');

    // The migration summary logs at warn level (per project ESLint policy).
    // Filter only entries that look like the migration tag — other warns may
    // appear (e.g. transient store messages) and shouldn't affect this assertion.
    const migrationLogs = consoleWarnSpy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .filter((s: string) => s.startsWith('[migrate_category_id]'));
    expect(migrationLogs).toHaveLength(1);
    const logged = migrationLogs[0];
    expect(logged).toContain('migrated 3 skills');
    expect(logged).toContain('1 mcps');
    expect(logged).toContain('1 skills');

    // App initialisation completed normally
    expect(useAppStore.getState().isLoading).toBe(false);
    expect(useAppStore.getState().error).toBeNull();
  });

  it('skips migrate IPC when hasCompletedCategoryIdMigration is true (idempotent fast path)', async () => {
    mockSafeInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'init_app_data') return null;
      if (cmd === 'get_categories') return [];
      if (cmd === 'get_tags') return [];
      if (cmd === 'read_app_data') return baseAppData({ hasCompletedCategoryIdMigration: true });
      // Migrate IPC must NOT be called.
      if (cmd === 'migrate_category_id_for_skills_mcps') {
        throw new Error('migration should not be invoked when flag=true');
      }
      return null;
    });

    await useAppStore.getState().initApp();
    await flushPromises();

    const ipcNames = mockSafeInvoke.mock.calls.map(([n]) => n);
    expect(ipcNames).toContain('read_app_data');
    expect(ipcNames).not.toContain('migrate_category_id_for_skills_mcps');

    expect(useAppStore.getState().isLoading).toBe(false);
    expect(useAppStore.getState().error).toBeNull();
  });

  it('does not block app start when migrate IPC throws (logs and continues)', async () => {
    mockSafeInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'init_app_data') return null;
      if (cmd === 'get_categories') return [];
      if (cmd === 'get_tags') return [];
      if (cmd === 'read_app_data') return baseAppData({ hasCompletedCategoryIdMigration: false });
      if (cmd === 'migrate_category_id_for_skills_mcps') throw 'DATA_MUTEX poisoned';
      return null;
    });

    await useAppStore.getState().initApp();
    await flushPromises();

    // Migrate was attempted
    const ipcNames = mockSafeInvoke.mock.calls.map(([n]) => n);
    expect(ipcNames).toContain('migrate_category_id_for_skills_mcps');

    // Error logged but not surfaced to store.error
    expect(consoleErrorSpy).toHaveBeenCalled();

    // App init still completed: isLoading=false, no top-level error set.
    // We treat migration failure as non-fatal because dual-read fallback
    // (category_id ?? cached name) keeps the UI functional.
    const finalState = useAppStore.getState();
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBeNull();
  });

  it('does not block app start when read_app_data itself throws', async () => {
    mockSafeInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'init_app_data') return null;
      if (cmd === 'get_categories') return [];
      if (cmd === 'get_tags') return [];
      if (cmd === 'read_app_data') throw new Error('disk read failed');
      if (cmd === 'migrate_category_id_for_skills_mcps') {
        throw new Error('should not be reached when read_app_data fails');
      }
      return null;
    });

    await useAppStore.getState().initApp();
    await flushPromises();

    // No migrate attempt — read_app_data short-circuited the path.
    const ipcNames = mockSafeInvoke.mock.calls.map(([n]) => n);
    expect(ipcNames).toContain('read_app_data');
    expect(ipcNames).not.toContain('migrate_category_id_for_skills_mcps');

    // App init still completes — migration block is wrapped in its own try/catch.
    const finalState = useAppStore.getState();
    expect(finalState.isLoading).toBe(false);
    expect(finalState.error).toBeNull();
  });

  it('triggers migration when hasCompletedCategoryIdMigration is undefined (legacy data.json)', async () => {
    const report: MigrationReport = {
      migratedSkills: 0,
      migratedMcps: 0,
      orphanedSkills: [],
      orphanedMcps: [],
    };

    mockSafeInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'init_app_data') return null;
      if (cmd === 'get_categories') return [];
      if (cmd === 'get_tags') return [];
      // Simulate legacy data.json: the field is missing entirely.
      if (cmd === 'read_app_data') {
        const data = baseAppData();
        // Simulate `serde(default)` → field absent on the wire.
        delete (data as { hasCompletedCategoryIdMigration?: boolean })
          .hasCompletedCategoryIdMigration;
        return data;
      }
      if (cmd === 'migrate_category_id_for_skills_mcps') return report;
      return null;
    });

    await useAppStore.getState().initApp();
    await flushPromises();

    const ipcNames = mockSafeInvoke.mock.calls.map(([n]) => n);
    expect(ipcNames).toContain('migrate_category_id_for_skills_mcps');
  });
});
