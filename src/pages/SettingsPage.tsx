import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Github, BookOpen, FileText, ChevronDown, Check } from 'lucide-react';
import { TrashRecoveryModal } from '@/components/modals';
import { PageHeader } from '@/components/layout/PageHeader';
import Toggle from '@/components/common/Toggle';
import { useSettingsStore, useSkillsStore, useMcpsStore } from '@/stores';
import { useClaudeMdStore } from '@/stores/claudeMdStore';
import { safeInvoke } from '@/utils/tauri';

// ============================================================================
// Settings Page
// ============================================================================
// Central configuration hub for Ensemble application.
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
  return (
    <div
      className={`flex items-center justify-between px-5 py-4 ${
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
}

function CustomSelect({ value, options, onChange, className = '' }: CustomSelectProps) {
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
        className="flex items-center justify-between gap-2 h-9 px-3 min-w-[140px] rounded-md border border-[#E5E5E5] hover:bg-[#FAFAFA] transition-colors cursor-pointer"
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

// Action Button Component for consistent styling
interface ActionButtonProps {
  onClick: () => void;
  children: React.ReactNode;
}

function ActionButton({ onClick, children }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className="text-xs font-medium text-[#71717A] hover:text-[#18181B] transition-colors"
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

  const {
    terminalApp,
    claudeCommand,
    warpOpenMode,
    claudeMdDistributionPath,
    autoClassifyNewItems,
    setTerminalApp,
    setClaudeCommand,
    setWarpOpenMode,
    setClaudeMdDistributionPath,
    setAutoClassifyNewItems,
  } = useSettingsStore();

  // Get reload functions from stores to refresh data after recovery
  const { loadSkills } = useSkillsStore();
  const { loadMcps } = useMcpsStore();
  const { loadFiles: loadClaudeMdFiles } = useClaudeMdStore();
  const supportsOpenMode = terminalApp === 'Warp' || terminalApp === 'Ghostty';
  const terminalOpenModeLabel = terminalApp === 'Ghostty' ? 'Ghostty Open Mode' : 'Warp Open Mode';

  // Callback to refresh all data after trash recovery
  const handleRestoreComplete = useCallback(async () => {
    // Reload all data stores in parallel for better performance
    // This ensures sidebar counts and lists update without page refresh
    await Promise.all([loadSkills(), loadMcps(), loadClaudeMdFiles()]);
  }, [loadSkills, loadMcps, loadClaudeMdFiles]);

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

          {/* Marketplace Section — V2.0 (D-Imp-12, spec §3.5).
              Single Toggle controlling whether installs from Skill /
              MCP Marketplace trigger a single-item auto-classify on
              completion. Default ON; persisted via settingsStore →
              backend `write_settings`. */}
          <section>
            <SectionHeader
              title="Marketplace"
              description="Configure Marketplace install behavior"
            />
            <Card>
              <Row noBorder>
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
            </Card>
          </section>

          {/* Storage Section */}
          <section>
            <SectionHeader title="Storage" description="Manage application data and storage" />
            <Card>
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
                </div>
                <CustomSelect
                  value={terminalApp}
                  onChange={setTerminalApp}
                  options={[
                    { value: 'Terminal', label: 'Terminal.app' },
                    { value: 'iTerm', label: 'iTerm2' },
                    { value: 'Warp', label: 'Warp' },
                    { value: 'Ghostty', label: 'Ghostty' },
                    { value: 'Alacritty', label: 'Alacritty' },
                  ]}
                />
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
                    Right-click 'Open with Ensemble' in Finder
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
                  <span className="text-sm font-semibold text-[#18181B]">Ensemble</span>
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
    </div>
  );
}

export default SettingsPage;
