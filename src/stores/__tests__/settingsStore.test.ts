import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '../settingsStore';

describe('settingsStore - utility methods and state', () => {
  beforeEach(() => {
    // Reset store to defaults. V2 (D-Imp-12) flips `autoClassifyNewItems`
    // default to `true` so Marketplace installs auto-classify without the
    // user having to opt in.
    useSettingsStore.setState({
      skillSourceDir: '~/.ensemble/skills',
      mcpSourceDir: '~/.ensemble/mcps',
      claudeConfigDir: '~/.claude',
      anthropicApiKey: '',
      autoClassifyNewItems: true,
      classifyModel: 'opus',
      terminalApp: 'Terminal',
      claudeCommand: 'claude',
      warpOpenMode: 'window',
      claudeMdDistributionPath: '.claude/CLAUDE.md',
      hasCompletedImport: false,
      stats: { skillsCount: 0, mcpsCount: 0, scenesCount: 0, totalSize: '0 MB' },
      isLoading: false,
      error: null,
    });
  });

  describe('initial state', () => {
    it('has correct default values', () => {
      const state = useSettingsStore.getState();
      expect(state.skillSourceDir).toBe('~/.ensemble/skills');
      expect(state.mcpSourceDir).toBe('~/.ensemble/mcps');
      expect(state.claudeConfigDir).toBe('~/.claude');
      expect(state.anthropicApiKey).toBe('');
      // V2 (D-Imp-12): default flipped from false → true.
      expect(state.autoClassifyNewItems).toBe(true);
      expect(state.terminalApp).toBe('Terminal');
      expect(state.claudeCommand).toBe('claude');
      expect(state.warpOpenMode).toBe('window');
    });
  });

  describe('getMaskedApiKey', () => {
    it('returns empty string when no API key', () => {
      expect(useSettingsStore.getState().getMaskedApiKey()).toBe('');
    });

    it('masks short API keys (<=15 chars)', () => {
      useSettingsStore.setState({ anthropicApiKey: 'sk-ant-1234567' });
      const masked = useSettingsStore.getState().getMaskedApiKey();
      expect(masked).toBe('sk-ant-***...');
      expect(masked).not.toContain('1234567');
    });

    it('masks long API keys (>15 chars)', () => {
      useSettingsStore.setState({
        anthropicApiKey: 'sk-ant-api03-abcdefghij-rest-of-key-here',
      });
      const masked = useSettingsStore.getState().getMaskedApiKey();
      expect(masked).toBe('sk-ant-api***...');
      expect(masked).not.toContain('rest-of-key');
    });
  });

  describe('hasApiKey', () => {
    it('returns false when no API key is set', () => {
      expect(useSettingsStore.getState().hasApiKey()).toBe(false);
    });

    it('returns true when API key is set', () => {
      useSettingsStore.setState({ anthropicApiKey: 'sk-ant-test' });
      expect(useSettingsStore.getState().hasApiKey()).toBe(true);
    });
  });

  describe('setStats', () => {
    it('merges partial stats into existing state', () => {
      useSettingsStore.getState().setStats({ skillsCount: 10 });
      const stats = useSettingsStore.getState().stats;
      expect(stats.skillsCount).toBe(10);
      expect(stats.mcpsCount).toBe(0); // untouched
      expect(stats.scenesCount).toBe(0); // untouched
      expect(stats.totalSize).toBe('0 MB'); // untouched
    });

    it('can update multiple stats at once', () => {
      useSettingsStore.getState().setStats({ skillsCount: 5, mcpsCount: 3, totalSize: '1.2 MB' });
      const stats = useSettingsStore.getState().stats;
      expect(stats.skillsCount).toBe(5);
      expect(stats.mcpsCount).toBe(3);
      expect(stats.totalSize).toBe('1.2 MB');
    });
  });
});
