import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Github, BookOpen, FileText, ChevronDown, Check } from 'lucide-react';
import { TrashRecoveryModal } from '@/components/modals';
import { PageHeader } from '@/components/layout/PageHeader';
import Toggle from '@/components/common/Toggle';
import {
  useSettingsStore,
  useSkillsStore,
  useMcpsStore,
  useAppStore,
  useScenesStore,
  useProjectsStore,
} from '@/stores';
import { LOCAL_SKILL_SOURCE_DIR, SKILL_MANAGER_LIBRARY_DIR } from '@/stores/settingsStore';
import { useClaudeMdStore } from '@/stores/claudeMdStore';
import { useRulesStore } from '@/stores/rulesStore';
import Modal from '@/components/common/Modal';
import { safeInvoke } from '@/utils/tauri';
import type { ClassifyModel } from '@/types';

// ============================================================================
// Settings Page
// ============================================================================
// Central configuration hub for CC Workshop application.
// Includes CLAUDE.md, Launch Configuration, and About sections.

// ============================================================================
// Reusable Components
// ============================================================================

interface SectionHeaderProps {
  title: string;
  description?: string;
}

function SectionHeader({ title, description }: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-1 mb-4">
      <h2 className="text-sm font-semibold text-[#18181B]">{title}</h2>
      {description && <p className="text-xs text-[#71717A]">{description}</p>}
    </div>
  );
}

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`border border-[#E5E5E5] rounded-lg overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

interface RowProps {
  children: React.ReactNode;
  noBorder?: boolean;
}

function Row({ children, noBorder = false }: RowProps) {
  // `gap-4` enforces a 16px minimum gap between the left text block and the
  // right control, even when the left description wraps to multiple lines.
  // Without it, long descriptions visually collide with the trailing
  // dropdown / toggle.
  return (
    <div
      className={`flex items-center justify-between gap-4 px-5 py-4 ${
        noBorder ? '' : 'border-b border-[#E5E5E5]'
      } last:border-b-0`}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Custom Select Component (ScopeSelector style)
// ============================================================================

interface CustomSelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  className?: string;
  /**
   * Minimum trigger width in pixels. Default 140 fits longer labels like
   * `./.claude/CLAUDE.md`. Override with a smaller value for short
   * single-word labels (e.g. model picker — `Opus` / `Sonnet` / `Haiku`).
   * The dropdown menu inherits the trigger's measured width, so this
   * shrinks both surfaces consistently.
   */
  minWidth?: number;
}

function CustomSelect({
  value,
  options,
  onChange,
  className = '',
  minWidth = 140,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        style={{ minWidth: `${minWidth}px` }}
        className="flex items-center justify-between gap-2 h-9 px-3 rounded-md border border-[#E5E5E5] hover:bg-[#FAFAFA] transition-colors cursor-pointer"
      >
        <span className="text-[13px] text-[#18181B]">{selectedOption?.label || value}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#A1A1AA] transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu - Rendered via Portal */}
      {isOpen &&
        createPortal(
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-[100]" onClick={() => setIsOpen(false)} />

            {/* Menu */}
            <div
              className="fixed bg-white rounded-lg border border-[#E5E5E5] shadow-[0_4px_12px_rgba(0,0,0,0.06)] z-[101]"
              style={{
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                minWidth: dropdownPosition.width,
              }}
            >
              {options.map((option, index) => {
                const isSelected = option.value === value;
                const isFirst = index === 0;
                const isLast = index === options.length - 1;

                const roundedClass = isFirst ? 'rounded-t-md' : isLast ? 'rounded-b-md' : '';

                return (
                  <button
                    key={option.value}
                    onClick={() => handleSelect(option.value)}
                    className={`
                    w-full flex items-center justify-between gap-2.5 py-2.5 px-3 text-left
                    transition-colors cursor-pointer
                    ${roundedClass}
                    ${isSelected ? 'bg-[#F4F4F5]' : 'hover:bg-[#FAFAFA]'}
                  `}
                  >
                    <span
                      className={`text-[13px] text-[#18181B] ${isSelected ? 'font-semibold' : 'font-medium'}`}
                    >
                      {option.label}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#18181B]" />}
                  </button>
                );
              })}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

// ============================================================================
// Main Settings Page Component
// ============================================================================

// Stat row inside the Reset confirm modal. Number on the left in a fixed
// 3-character column (tabular-nums + right-align) so multi-row numbers line
// up regardless of digit count — same layout idea as macOS Finder "Get Info".
// Number 14px medium (token), label 13px regular zinc-600.
interface ResetStatRowProps {
  count: number;
  label: string;
}

function ResetStatRow({ count, label }: ResetStatRowProps) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-[3ch] text-right text-[14px] font-medium text-[#18181B] tabular-nums">
        {count}
      </span>
      <span className="text-[13px] text-[#52525B]">{label}</span>
    </div>
  );
}

// Action Button Component for consistent styling
interface ActionButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

function ActionButton({
  onClick,
  children,
  variant = 'default',
  disabled = false,
}: ActionButtonProps) {
  // Default: neutral foreground that darkens on hover (matches the
  // section-action voice of every other Row entry). Danger: red accent,
  // used for irreversible operations only — currently the Reset entry
  // in the Auto Classify section.
  const variantClass =
    variant === 'danger'
      ? 'text-[var(--color-error)] hover:opacity-80'
      : 'text-[#71717A] hover:text-[#18181B]';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-xs font-medium ${variantClass} transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

export function SettingsPage() {
  const [quickActionStatus, setQuickActionStatus] = useState<
    'idle' | 'installing' | 'success' | 'error'
  >('idle');
  const [_quickActionMessage, setQuickActionMessage] = useState('');
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const {
    terminalApp,
    claudeCommand,
    warpOpenMode,
    skillSourceDir,
    claudeMdDistributionPath,
    autoClassifyNewItems,
    classifyModel,
    setTerminalApp,
    setClaudeCommand,
    setWarpOpenMode,
    setSkillSourceDir,
    setClaudeMdDistributionPath,
    setAutoClassifyNewItems,
    setClassifyModel,
    selectDirectory,
  } = useSettingsStore();

  // Get reload functions from stores to refresh data after recovery / reset
  const { loadSkills, skills } = useSkillsStore();
  const { loadMcps, mcpServers } = useMcpsStore();
  const { loadFiles: loadClaudeMdFiles, files: claudeMdFiles } = useClaudeMdStore();
  const { loadCategories, loadTags, categories, tags } = useAppStore();
  // V2 (bug-audit B-5): TrashRecoveryModal can now restore Rules / Scenes /
  // Projects (A4 + A5). Without these reload functions, restoring a Scene
  // would leave the user with stale ScenesPage state until the next session.
  const { loadRules } = useRulesStore();
  const { loadScenes } = useScenesStore();
  const { loadProjects } = useProjectsStore();
  const supportsOpenMode =
    terminalApp === 'Warp' || terminalApp === 'Ghostty' || terminalApp === 'cmux';
  // Brand-agnostic label so the row reads cleanly regardless of which
  // terminal is active. Avoids the awkward sentence-start lowercase brand
  // ("cmux Open Mode") that the per-brand label flavor would produce.
  const terminalOpenModeLabel = 'Open new sessions as';
  const skillSourceKind =
    skillSourceDir === SKILL_MANAGER_LIBRARY_DIR
      ? 'skill-manager canonical library'
      : skillSourceDir === LOCAL_SKILL_SOURCE_DIR
        ? 'CC Workshop local library'
        : 'Custom source';

  // R2-8e: validate the user-selected terminal app whenever it changes.
  // `null` = not yet checked (initial mount / between checks), so we
  // render no status dot. The dot is intentionally subtle — it confirms
  // installation rather than nagging — and the row only adds a red
  // warning line when the answer is definitively "not installed".
  const [terminalAppInstalled, setTerminalAppInstalled] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    setTerminalAppInstalled(null);
    safeInvoke<boolean>('validate_terminal_app', { name: terminalApp })
      .then((result) => {
        if (!cancelled) setTerminalAppInstalled(result ?? null);
      })
      .catch(() => {
        // Unknown terminal name shouldn't happen because the dropdown is
        // a closed set, but be defensive — show no indicator on error.
        if (!cancelled) setTerminalAppInstalled(null);
      });
    return () => {
      cancelled = true;
    };
  }, [terminalApp]);

  // Callback to refresh all data after trash recovery
  const handleRestoreComplete = useCallback(async () => {
    // Reload all data stores in parallel for better performance.
    // This ensures sidebar counts and lists update without page refresh.
    // Rules / Scenes / Projects are included because TrashRecoveryModal
    // now restores them too (A4 + A5).
    await Promise.all([
      loadSkills(),
      loadMcps(),
      loadClaudeMdFiles(),
      loadRules(),
      loadScenes(),
      loadProjects(),
    ]);
  }, [loadSkills, loadMcps, loadClaudeMdFiles, loadRules, loadScenes, loadProjects]);

  const handleUseSkillManagerSource = useCallback(async () => {
    setSkillSourceDir(SKILL_MANAGER_LIBRARY_DIR);
    await loadSkills();
  }, [loadSkills, setSkillSourceDir]);

  const handleChooseSkillSource = useCallback(async () => {
    await selectDirectory('skill');
    await loadSkills();
  }, [loadSkills, selectDirectory]);

  // Reset every auto-classify-produced classification (categories, tags,
  // and all item ↔ classification links). Items themselves stay; their
  // category / tag assignments are cleared. Used by the Settings "Reset
  // auto-classify data" button — sized for the case where a manual
  // Auto Classify run produced a result the user wants to throw away.
  const handleConfirmReset = useCallback(async () => {
    setIsResetting(true);
    try {
      await safeInvoke('reset_auto_classify_data');
      // Reload every surface that mirrors the cleared backend state.
      // `loadCategories` / `loadTags` carry the sidebar; the three item
      // stores carry the per-item category / tag chips.
      await Promise.all([
        loadCategories(),
        loadTags(),
        loadSkills(),
        loadMcps(),
        loadClaudeMdFiles(),
      ]);
      setShowResetModal(false);
    } catch (error) {
      console.error('Failed to reset auto-classify data:', error);
    } finally {
      setIsResetting(false);
    }
  }, [loadCategories, loadTags, loadSkills, loadMcps, loadClaudeMdFiles]);

  // Pre-compute counts shown in the confirm modal. These are read once
  // when the modal opens (snapshotted via current React render); user
  // mutations after that point are extremely rare given the modal is
  // dismissed within seconds.
  const skillsWithClassification = skills.filter(
    (s) => s.categoryId || s.category || s.tags.length > 0,
  ).length;
  const mcpsWithClassification = mcpServers.filter(
    (m) => m.categoryId || m.category || m.tags.length > 0,
  ).length;
  const claudeMdWithClassification = claudeMdFiles.filter(
    (f) => f.categoryId || (f.tagIds?.length ?? 0) > 0,
  ).length;

  const handleInstallQuickAction = async () => {
    setQuickActionStatus('installing');
    setQuickActionMessage('');

    try {
      const result = await safeInvoke<string>('install_quick_action');

      if (result === null) {
        // safeInvoke returns null when not in Tauri environment
        setQuickActionStatus('error');
        setQuickActionMessage(
          'Please run this app using "npm run tauri dev" for full functionality',
        );
        return;
      }

      setQuickActionStatus('success');
      setQuickActionMessage(`Installed at: ${result}`);

      // Reset after 5 seconds
      setTimeout(() => {
        setQuickActionStatus('idle');
        setQuickActionMessage('');
      }, 5000);
    } catch (error) {
      setQuickActionStatus('error');
      setQuickActionMessage(typeof error === 'string' ? error : String(error));
      console.error('Failed to install Quick Action:', error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <PageHeader title="Settings" />

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[600px] mx-auto px-7 py-8 flex flex-col gap-8">
          {/* CLAUDE.md Section */}
          <section>
            <SectionHeader
              title="CLAUDE.md"
              description="Configure how CLAUDE.md files are distributed to projects"
            />
            <Card>
              {/* Default Distribution Path */}
              <Row noBorder>
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] font-medium text-[#18181B]">
                    Default Distribution Path
                  </span>
                  <span className="text-xs text-[#71717A]">
                    {claudeMdDistributionPath === '.claude/CLAUDE.md' && './.claude/CLAUDE.md'}
                    {claudeMdDistributionPath === 'CLAUDE.md' && './CLAUDE.md'}
                    {claudeMdDistributionPath === 'CLAUDE.local.md' && './CLAUDE.local.md'}
                  </span>
                </div>
                <CustomSelect
                  value={claudeMdDistributionPath}
                  onChange={(value) =>
                    setClaudeMdDistributionPath(
                      value as '.claude/CLAUDE.md' | 'CLAUDE.md' | 'CLAUDE.local.md',
                    )
                  }
                  options={[
                    { value: '.claude/CLAUDE.md', label: './.claude/CLAUDE.md' },
                    { value: 'CLAUDE.md', label: './CLAUDE.md' },
                    { value: 'CLAUDE.local.md', label: './CLAUDE.local.md' },
                  ]}
                />
              </Row>
            </Card>
          </section>

          {/* Auto Classify Section.
              Houses both (a) the model used by manual + Marketplace auto-classify
              runs (single source of truth read by backend `auto_classify`), and
              (b) the V2.0 D-Imp-12 toggle controlling whether Marketplace installs
              auto-classify on completion. Two distinct settings live together
              because they both shape the same feature surface. */}
          <section>
            <SectionHeader
              title="Auto Classify"
              description="Configure how items are categorized"
            />
            <Card>
              <Row>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-medium text-[#18181B]">
                    Classification model
                  </span>
                  <span className="text-xs text-[#71717A]">
                    Claude model used by Auto Classify.
                  </span>
                </div>
                <CustomSelect
                  value={classifyModel}
                  onChange={(value) => setClassifyModel(value as ClassifyModel)}
                  minWidth={110}
                  options={[
                    { value: 'opus', label: 'Opus' },
                    { value: 'sonnet', label: 'Sonnet' },
                    { value: 'haiku', label: 'Haiku' },
                  ]}
                />
              </Row>
              <Row>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-medium text-[#18181B]">
                    Auto-classify newly installed items
                  </span>
                  <span className="text-xs text-[#71717A]">
                    When enabled, items installed from the Marketplace will be automatically
                    categorized.
                  </span>
                </div>
                <Toggle checked={autoClassifyNewItems} onChange={setAutoClassifyNewItems} />
              </Row>
              {/* Destructive entry — "reset auto-classify data". Lives at the
                  bottom of the Auto Classify section because conceptually it
                  undoes the rest of the section. Items themselves stay; only
                  classification assignments are wiped. The button is text-only
                  (no icon) to keep visual weight low; danger is communicated
                  by the accent color and the confirm-modal copy. */}
              <Row noBorder>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-medium text-[#18181B]">
                    Reset auto-classify data
                  </span>
                  <span className="text-xs text-[#71717A]">
                    Remove all categories and tags. Items themselves stay.
                  </span>
                </div>
                <ActionButton
                  variant="danger"
                  onClick={() => setShowResetModal(true)}
                  disabled={
                    categories.length === 0 &&
                    tags.length === 0 &&
                    skillsWithClassification === 0 &&
                    mcpsWithClassification === 0 &&
                    claudeMdWithClassification === 0
                  }
                >
                  Reset
                </ActionButton>
              </Row>
            </Card>
          </section>

          {/* Storage Section */}
          <section>
            <SectionHeader title="Storage" description="Manage application data and storage" />
            <Card>
              {/* Skill Source Directory */}
              <Row>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13px] font-medium text-[#18181B]">
                    Skill Source Directory
                  </span>
                  <span className="text-xs text-[#71717A]">{skillSourceKind}</span>
                  <span className="max-w-[380px] truncate font-mono text-[11px] text-[#A1A1AA]">
                    {skillSourceDir}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <ActionButton
                    onClick={handleUseSkillManagerSource}
                    disabled={skillSourceDir === SKILL_MANAGER_LIBRARY_DIR}
                  >
                    Use skill-manager
                  </ActionButton>
                  <ActionButton onClick={handleChooseSkillSource}>Choose...</ActionButton>
                </div>
              </Row>

              {/* Deleted Items */}
              <Row noBorder>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-medium text-[#18181B]">Deleted Items</span>
                  <span className="text-xs text-[#71717A]">
                    Skills, MCPs, and CLAUDE.md files you've removed
                  </span>
                </div>
                <ActionButton onClick={() => setShowTrashModal(true)}>Recover</ActionButton>
              </Row>
            </Card>
          </section>

          {/* Launch Configuration Section */}
          <section>
            <SectionHeader
              title="Launch Configuration"
              description="Configure how Claude Code is launched from Finder"
            />
            <Card>
              {/* Terminal Application */}
              <Row>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-medium text-[#18181B]">
                    Terminal Application
                  </span>
                  <span className="text-xs text-[#71717A]">Select your preferred terminal app</span>
                  {/* R2-8e: visible "not installed" warning sits in the
                      description column so it shares the dropdown row
                      and does not require a new layout slot. */}
                  {terminalAppInstalled === false && (
                    <span className="text-xs text-[#DC2626]">
                      {terminalApp} doesn't appear to be installed on this Mac.
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* R2-8e: status dot. Green = present, red = missing,
                      hidden = not yet checked. 6 px circle aligns with
                      the existing "Installed" badge style elsewhere on
                      this page. */}
                  {terminalAppInstalled === true && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-[#16A34A]"
                      aria-label={`${terminalApp} installed`}
                    />
                  )}
                  {terminalAppInstalled === false && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-[#DC2626]"
                      aria-label={`${terminalApp} not installed`}
                    />
                  )}
                  <CustomSelect
                    value={terminalApp}
                    onChange={setTerminalApp}
                    options={[
                      // Brand-canonical spellings: each label reflects the
                      // product's own marketing capitalization. iTerm2's
                      // lowercase-i and cmux's all-lowercase are deliberate
                      // brand choices — do not "normalize" them to Title Case.
                      { value: 'Terminal', label: 'Terminal.app' },
                      { value: 'iTerm', label: 'iTerm2' },
                      { value: 'Warp', label: 'Warp' },
                      { value: 'Ghostty', label: 'Ghostty' },
                      { value: 'Alacritty', label: 'Alacritty' },
                      { value: 'cmux', label: 'cmux' },
                    ]}
                  />
                </div>
              </Row>

              {/* Open Mode - Only shown for terminal apps that support window/tab selection */}
              {supportsOpenMode && (
                <Row>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-medium text-[#18181B]">
                      {terminalOpenModeLabel}
                    </span>
                    <span className="text-xs text-[#71717A]">
                      How to open new sessions in {terminalApp}
                    </span>
                  </div>
                  <CustomSelect
                    value={warpOpenMode}
                    onChange={(value) => setWarpOpenMode(value as 'tab' | 'window')}
                    options={[
                      { value: 'window', label: 'New Window' },
                      { value: 'tab', label: 'New Tab' },
                    ]}
                  />
                </Row>
              )}

              {/* Launch Command */}
              <Row>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-medium text-[#18181B]">Launch Command</span>
                  <span className="text-xs text-[#71717A]">Command to execute in the terminal</span>
                </div>
                <input
                  type="text"
                  value={claudeCommand}
                  onChange={(e) => setClaudeCommand(e.target.value)}
                  placeholder="claude"
                  className="h-9 w-[180px] px-3 rounded-md border border-[#E5E5E5] text-[13px] font-mono text-[#18181B] focus:outline-none focus:ring-1 focus:ring-[#18181B]"
                />
              </Row>

              {/* Finder Integration */}
              <Row noBorder>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-medium text-[#18181B]">Finder Integration</span>
                  <span className="text-xs text-[#71717A]">
                    Right-click 'Open with CC Workshop' in Finder
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  {/* Status Badge */}
                  {quickActionStatus === 'success' || quickActionStatus === 'idle' ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#DCFCE7]">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                      <span className="text-[11px] font-semibold text-[#16A34A]">Installed</span>
                    </div>
                  ) : quickActionStatus === 'error' ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#FEE2E2]">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#DC2626]" />
                      <span className="text-[11px] font-semibold text-[#DC2626]">Error</span>
                    </div>
                  ) : null}
                  {/* Reinstall Button */}
                  <button
                    onClick={handleInstallQuickAction}
                    disabled={quickActionStatus === 'installing'}
                    className="text-xs font-medium text-[#71717A] hover:text-[#18181B] transition-colors disabled:opacity-50"
                  >
                    {quickActionStatus === 'installing' ? 'Installing...' : 'Reinstall'}
                  </button>
                </div>
              </Row>
            </Card>
          </section>

          {/* About Section */}
          <section>
            <SectionHeader title="About" />
            <Card className="p-5">
              {/* App Info */}
              <div className="flex items-center gap-3.5">
                {/* App Icon - Flat Style */}
                <div
                  className="w-12 h-12 rounded-[10px] flex-shrink-0 relative overflow-hidden"
                  style={{
                    background: 'linear-gradient(145deg, #27272A 0%, #18181B 40%, #09090B 100%)',
                    boxShadow: 'inset 0 0.6px 0 rgba(255,255,255,0.06)',
                  }}
                >
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 48 48"
                    fill="none"
                    className="absolute inset-0"
                  >
                    <defs>
                      {/* 连接线描边渐变 - 180度 (从上到下) */}
                      <linearGradient id="iconStrokeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#FFFFFF" />
                        <stop offset="100%" stopColor="#A1A1AA" />
                      </linearGradient>
                      {/* 图形填充渐变 - 135度 (从左上到右下) */}
                      <linearGradient id="iconFillGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FFFFFF" />
                        <stop offset="100%" stopColor="#D4D4D8" />
                      </linearGradient>
                      {/* 图形阴影滤镜 */}
                      <filter id="iconShapeShadow" x="-50%" y="-50%" width="200%" height="200%">
                        <feDropShadow
                          dx="0"
                          dy="1.8"
                          stdDeviation="1.8"
                          floodColor="#000000"
                          floodOpacity="0.25"
                        />
                      </filter>
                    </defs>

                    {/* 三角形连接线 - 位置(14, 15), 尺寸(20 x 17.32) */}
                    <path
                      d="M24 15 L14 32.32 L34 32.32 Z"
                      fill="none"
                      stroke="url(#iconStrokeGradient)"
                      strokeWidth="0.9"
                    />

                    {/* 六边形 - 位置(19.5, 10.5), 尺寸(9 x 9) */}
                    <polygon
                      points="24,10.5 28.5,12.75 28.5,17.25 24,19.5 19.5,17.25 19.5,12.75"
                      fill="url(#iconFillGradient)"
                      filter="url(#iconShapeShadow)"
                    />

                    {/* 圆形 - 位置(10, 28.32), 尺寸(8 x 8) */}
                    <circle
                      cx="14"
                      cy="32.32"
                      r="4"
                      fill="url(#iconFillGradient)"
                      filter="url(#iconShapeShadow)"
                    />

                    {/* 圆角矩形 - 位置(30.2, 28.52), 尺寸(7.6 x 7.6), 圆角 1.6 */}
                    <rect
                      x="30.2"
                      y="28.52"
                      width="7.6"
                      height="7.6"
                      rx="1.6"
                      fill="url(#iconFillGradient)"
                      filter="url(#iconShapeShadow)"
                    />
                  </svg>
                </div>
                {/* Info Text */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-[#18181B]">CC Workshop</span>
                  <span className="text-xs text-[#71717A]">Version 0.0.1 (Build 1)</span>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-[#E4E4E7] my-4" />

              {/* Links */}
              <div className="flex items-center gap-4">
                <a
                  href="https://github.com/anthropics/ensemble"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-medium text-[#71717A] hover:text-[#18181B] transition-colors"
                >
                  <Github size={14} className="text-[#71717A]" />
                  GitHub
                </a>
                <a
                  href="https://docs.ensemble.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-medium text-[#71717A] hover:text-[#18181B] transition-colors"
                >
                  <BookOpen size={14} className="text-[#71717A]" />
                  Documentation
                </a>
                <a
                  href="https://opensource.org/licenses/MIT"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-medium text-[#71717A] hover:text-[#18181B] transition-colors"
                >
                  <FileText size={14} className="text-[#71717A]" />
                  MIT License
                </a>
              </div>
            </Card>
          </section>
        </div>
      </div>

      {/* Trash Recovery Modal */}
      <TrashRecoveryModal
        isOpen={showTrashModal}
        onClose={() => setShowTrashModal(false)}
        onRestoreComplete={handleRestoreComplete}
      />

      {/* Reset Auto-Classify Confirm Modal.
          Design language rationale (see `.claude/rules/design-language.md`):
          - No subtitle "This cannot be undone." — the danger button colour
            and the listed counts already encode irreversibility.
          - Stat rows: tabular-nums right-aligned numbers + secondary label,
            mirroring macOS Finder Get Info's "N items, N bytes" pattern.
            14px medium for the number (font-size token), 13px for the label.
          - Zero rows are hidden; nothing reads "0 categories".
          - Body / Footer split by a 1px divider matches the system modal
            convention (System Preferences sheets, Finder Get Info). */}
      <Modal
        isOpen={showResetModal}
        onClose={() => !isResetting && setShowResetModal(false)}
        title="Reset auto-classify data?"
        maxWidth="460px"
        closeOnOverlayClick={!isResetting}
      >
        <div className="flex flex-col">
          <div className="px-7 py-6 flex flex-col gap-5">
            <div className="flex flex-col gap-2.5">
              {categories.length > 0 && (
                <ResetStatRow
                  count={categories.length}
                  label={categories.length === 1 ? 'category' : 'categories'}
                />
              )}
              {tags.length > 0 && (
                <ResetStatRow count={tags.length} label={tags.length === 1 ? 'tag' : 'tags'} />
              )}
              {skillsWithClassification > 0 && (
                <ResetStatRow
                  count={skillsWithClassification}
                  label={`${skillsWithClassification === 1 ? 'skill' : 'skills'} with assignments`}
                />
              )}
              {mcpsWithClassification > 0 && (
                <ResetStatRow
                  count={mcpsWithClassification}
                  label={`MCP ${mcpsWithClassification === 1 ? 'server' : 'servers'} with assignments`}
                />
              )}
              {claudeMdWithClassification > 0 && (
                <ResetStatRow
                  count={claudeMdWithClassification}
                  label={`CLAUDE.md ${claudeMdWithClassification === 1 ? 'file' : 'files'} with assignments`}
                />
              )}
            </div>

            <p className="text-[12px] text-[#71717A] leading-relaxed">
              Skills, MCP servers, and CLAUDE.md files themselves are not removed.
            </p>
          </div>

          <div className="flex justify-end gap-2 px-7 py-4 border-t border-[#E5E5E5]">
            <button
              type="button"
              onClick={() => setShowResetModal(false)}
              disabled={isResetting}
              className="px-3 py-1.5 text-[13px] font-medium text-[#3F3F46] hover:bg-[#FAFAFA] rounded transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmReset}
              disabled={isResetting}
              className="px-3 py-1.5 text-[13px] font-medium text-white bg-[var(--color-error)] hover:opacity-90 rounded transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isResetting ? 'Resetting…' : 'Reset'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default SettingsPage;
