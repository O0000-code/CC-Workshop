import React, { useMemo, useRef } from 'react';
import {
  Folder,
  FolderOpen,
  RefreshCw,
  Trash2,
  Check,
  X,
  Minus,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import { Button, Input, Dropdown, ICON_MAP } from '../common';
import type { DropdownOption } from '../common/Dropdown';
import type { Project, Scene } from '../../types';
import { useMcpsStore } from '../../stores/mcpsStore';

// ============================================================================
// Types
// ============================================================================

export interface ProjectConfigPanelProps {
  project: Project | null;
  scene?: Scene;
  scenes?: Scene[];
  isEditing?: boolean;
  // View mode callbacks
  onOpenFolder?: () => void;
  onChangeScene?: (sceneId: string) => void;
  onSync?: () => void;
  onClearConfig?: () => void;
  onIconClick?: (triggerRef: React.RefObject<HTMLDivElement>) => void;
  // Edit mode form state
  formData?: {
    name: string;
    path: string;
    sceneId: string;
  };
  onFormChange?: (data: Partial<{ name: string; path: string; sceneId: string }>) => void;
  onSave?: () => void;
  onCancel?: () => void;
  onBrowse?: () => void;
}

// ============================================================================
// View Mode Component
// ============================================================================

function ViewModePanel({
  project,
  scene,
  scenes = [],
  onChangeScene,
  onSync,
  onClearConfig,
  onIconClick,
}: Omit<
  ProjectConfigPanelProps,
  'isEditing' | 'formData' | 'onFormChange' | 'onSave' | 'onCancel' | 'onBrowse'
>) {
  const iconRef = useRef<HTMLDivElement>(null);

  // SSoT — pull the local MCP catalog so we can detect stdio MCPs whose
  // required env vars are still empty. Surfaces the issue at the project
  // level before Sync writes an unusable `.mcp.json` (F-P0-4 / E3-2).
  const mcpServers = useMcpsStore((s) => s.mcpServers);

  // Build the list of MCPs in the active scene that are missing required
  // env values. We rely on the per-MCP `requiredEnvVars` snapshot persisted
  // by the marketplace install (F-Back P0) — when undefined the MCP did not
  // declare requirements, so it's never "missing".
  const mcpsWithMissingEnv = useMemo(() => {
    if (!scene) return [];
    return scene.mcpIds
      .map((id) => mcpServers.find((m) => m.id === id))
      .filter((mcp): mcp is NonNullable<typeof mcp> => Boolean(mcp))
      .map((mcp) => {
        const required = mcp.requiredEnvVars ?? [];
        const env = mcp.env ?? {};
        const missing = required.filter((spec) => !env[spec.name] || env[spec.name].trim() === '');
        return missing.length > 0
          ? { id: mcp.id, name: mcp.name, missing: missing.map((s) => s.name) }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [scene, mcpServers]);

  if (!project) return null;

  // Calculate stats from scene
  const skillsCount = scene?.skillIds?.length || 0;
  const mcpsCount = scene?.mcpIds?.length || 0;
  const claudeMdCount = scene?.claudeMdIds?.length || 0;
  const rulesCount = scene?.ruleIds?.length || 0;
  const isSynced = !!project.lastSynced;

  // Scene dropdown options
  const sceneOptions: DropdownOption[] = scenes.map((s) => ({
    value: s.id,
    label: s.name,
  }));

  // Get icon component - use custom icon if set, otherwise default to Folder
  const Icon = project.icon && ICON_MAP[project.icon] ? ICON_MAP[project.icon] : Folder;

  const handleIconClick = () => {
    onIconClick?.(iconRef as React.RefObject<HTMLDivElement>);
  };

  return (
    <div className="flex flex-col gap-7">
      {/* Project Info Section */}
      <div className="flex items-start gap-4">
        {/* Project Icon */}
        <div
          ref={iconRef}
          onClick={handleIconClick}
          className={`
            flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#FAFAFA]
            ${onIconClick ? 'cursor-pointer hover:ring-2 hover:ring-[#18181B]/10 transition-shadow' : ''}
          `}
        >
          <Icon className="h-6 w-6 text-[#52525B]" />
        </div>

        {/* Project Details */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-lg font-semibold text-[#18181B]">{project.name}</h2>
          <p className="truncate text-[13px] font-normal text-[#71717A]">{project.path}</p>
        </div>
      </div>

      {/* Assigned Scene Section */}
      <div className="flex flex-col gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.8px] text-[#A1A1AA]">
          ASSIGNED SCENE
        </span>

        <div className="flex items-center justify-between rounded-lg border border-[#E5E5E5] px-[18px] py-4">
          {/* Scene Info */}
          <div className="flex flex-col gap-1">
            <span className="text-[14px] font-medium text-[#18181B]">
              {scene?.name || 'No scene selected'}
            </span>
            {scene && (
              <span className="text-[12px] font-normal text-[#71717A]">
                {skillsCount} Skills · {mcpsCount} MCPs
                {claudeMdCount > 0 ? ` · ${claudeMdCount} Docs` : ''}
                {rulesCount > 0 ? ` · ${rulesCount} Rules` : ''}
              </span>
            )}
          </div>

          {/* Change Button with Dropdown */}
          <div className="relative">
            <Dropdown
              options={sceneOptions}
              value={project.sceneId || ''}
              onChange={(value) => onChangeScene?.(value as string)}
              placeholder="Select scene..."
              compact
              triggerClassName="!h-auto !px-3 !py-1.5 !text-[11px] !font-medium"
            />
          </div>
        </div>
      </div>

      {/* Configuration Status Section */}
      <div className="flex flex-col gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.8px] text-[#A1A1AA]">
          CONFIGURATION STATUS
        </span>

        <div className="flex gap-4">
          {/* Skills Card */}
          <ConfigCard
            title="Skills"
            path=".claude/skills/"
            count={skillsCount}
            isSynced={isSynced && skillsCount > 0}
          />

          {/* MCP Servers Card */}
          <ConfigCard
            title="MCP Servers"
            path=".claude/mcp_servers.json"
            count={mcpsCount}
            isSynced={isSynced && mcpsCount > 0}
          />

          {/* CLAUDE.md Card - only show if > 0 */}
          {claudeMdCount > 0 && (
            <ConfigCard
              title="CLAUDE.md"
              path=".claude/CLAUDE.md"
              count={claudeMdCount}
              isSynced={isSynced && claudeMdCount > 0}
            />
          )}

          {/* Rules Card — opt-in like CLAUDE.md (most projects don't bundle
              Rules, so showing an empty card every time would be noise).
              When present, Project Sync writes each rule to
              `<project>/.claude/rules/<filename>.md` via
              `distribute_scene_rules` (rules.rs). */}
          {rulesCount > 0 && (
            <ConfigCard
              title="Rules"
              path=".claude/rules/"
              count={rulesCount}
              isSynced={isSynced && rulesCount > 0}
            />
          )}
        </div>
      </div>

      {/* MCP Missing Env Vars warning section — only renders when at least
          one MCP in the assigned Scene is missing required environment
          variables (F-P0-4 / E3-2 / PRD §8.4). Without this the user only
          finds out via Claude Code stderr after Sync; surfacing it here
          turns a cryptic runtime failure into a visible product-layer
          warning. */}
      {mcpsWithMissingEnv.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.8px] text-[#A1A1AA]">
            MCP CONFIGURATION ISSUES
          </span>
          <div className="flex flex-col gap-1.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-[#DC2626]" />
              <span className="text-[13px] font-medium text-[#DC2626]">
                {mcpsWithMissingEnv.length === 1
                  ? '1 MCP needs setup before Sync'
                  : `${mcpsWithMissingEnv.length} MCPs need setup before Sync`}
              </span>
            </div>
            <div className="flex flex-col gap-1 pl-6">
              {mcpsWithMissingEnv.map((mcp) => (
                <span key={mcp.id} className="text-[11px] text-[#DC2626]">
                  <span className="font-medium">{mcp.name}</span> — Missing required env vars:{' '}
                  {mcp.missing.join(', ')}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2.5">
        <Button
          variant="primary"
          size="medium"
          icon={<RefreshCw />}
          onClick={onSync}
          className="h-9"
        >
          Sync Configuration
        </Button>

        <Button
          variant="secondary"
          size="medium"
          icon={<Trash2 />}
          onClick={onClearConfig}
          className="h-9"
        >
          Clear Config
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Config Card Component
// ============================================================================

interface ConfigCardProps {
  title: string;
  path: string;
  count: number;
  isSynced: boolean;
}

function ConfigCard({ title, path, count, isSynced }: ConfigCardProps) {
  return (
    <div className="flex flex-1 flex-col gap-3 rounded-lg border border-[#E5E5E5] px-[18px] py-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-[#18181B]">{title}</span>
        {isSynced && (
          <span className="rounded-[3px] bg-[#DCFCE7] px-2 py-[3px] text-[10px] font-semibold text-[#16A34A]">
            Synced
          </span>
        )}
      </div>

      {/* Meta */}
      <div className="flex flex-col gap-1">
        <span className="text-[12px] font-normal text-[#71717A]">{path}</span>
        <span className="text-[11px] font-normal text-[#A1A1AA]">
          {count} {title === 'Skills' ? 'symlinks' : 'configurations'} active
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Edit Mode Component
// ============================================================================

function EditModePanel({
  scenes = [],
  formData,
  onFormChange,
  onBrowse,
}: Omit<
  ProjectConfigPanelProps,
  'project' | 'scene' | 'isEditing' | 'onOpenFolder' | 'onChangeScene' | 'onSync' | 'onClearConfig'
>) {
  if (!formData || !onFormChange) return null;

  // Validation state
  const validations = {
    nameSet: formData.name.trim().length > 0,
    pathValid: formData.path.trim().length > 0,
    sceneSelected: formData.sceneId.length > 0,
  };

  // Scene dropdown options
  const sceneOptions: DropdownOption[] = [
    { value: '', label: 'Select a scene...' },
    ...scenes.map((s) => ({
      value: s.id,
      label: s.name,
    })),
  ];

  return (
    <div className="flex flex-col gap-7">
      {/* Project Information Section */}
      <div className="flex flex-col gap-4">
        <h3 className="text-[14px] font-semibold text-[#18181B]">Project Information</h3>

        <div className="flex flex-col gap-4">
          {/* Name Field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#52525B]">Project Name</label>
            <Input
              value={formData.name}
              onChange={(e) => onFormChange({ name: e.target.value })}
              placeholder="Enter project name..."
              className="h-10"
            />
          </div>

          {/* Path Field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#52525B]">Project Path</label>
            <div className="relative">
              <Input
                value={formData.path}
                onChange={(e) => onFormChange({ path: e.target.value })}
                placeholder="/path/to/project"
                className="h-10 pr-20"
              />
              <button
                type="button"
                onClick={onBrowse}
                className="
                  absolute right-2 top-1/2 -translate-y-1/2
                  flex items-center gap-1 rounded bg-[#FAFAFA]
                  px-2 py-1
                  text-[11px] font-medium text-[#52525B]
                  transition-colors hover:bg-[#F4F4F5]
                "
              >
                <FolderOpen className="h-3 w-3" />
                Browse
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scene Configuration Section */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-[14px] font-semibold text-[#18181B]">Scene Configuration</h3>
          <p className="text-[12px] font-normal text-[#71717A]">
            Select which scene to use for this project
          </p>
        </div>

        <div className="flex h-11 items-center justify-between rounded-md border border-[#E5E5E5] px-3.5">
          <div className="flex items-center gap-2.5">
            <Layers className="h-4 w-4 text-[#52525B]" />
            <Dropdown
              options={sceneOptions}
              value={formData.sceneId}
              onChange={(value) => onFormChange({ sceneId: value as string })}
              placeholder="Select a scene..."
              triggerClassName="!border-0 !h-auto !px-0"
            />
          </div>
        </div>
      </div>

      {/* Configuration Status Section */}
      <div className="flex flex-col gap-3">
        <h3 className="text-[14px] font-semibold text-[#18181B]">Configuration Status</h3>

        <div className="flex flex-col gap-2">
          <StatusItem
            status={validations.nameSet ? 'valid' : 'invalid'}
            text="Project name configured"
          />
          <StatusItem
            status={validations.pathValid ? 'valid' : 'invalid'}
            text="Project path is valid"
          />
          <StatusItem
            status={validations.sceneSelected ? 'valid' : 'pending'}
            text="Scene selected"
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Status Item Component
// ============================================================================

interface StatusItemProps {
  status: 'valid' | 'invalid' | 'pending';
  text: string;
}

function StatusItem({ status, text }: StatusItemProps) {
  const iconConfig = {
    valid: {
      bg: 'bg-[#DCFCE7]',
      icon: <Check className="h-3 w-3 text-[#16A34A]" />,
    },
    invalid: {
      bg: 'bg-[#FEE2E2]',
      icon: <X className="h-3 w-3 text-[#DC2626]" />,
    },
    pending: {
      bg: 'bg-[#F4F4F5]',
      icon: <Minus className="h-3 w-3 text-[#A1A1AA]" />,
    },
  };

  const { bg, icon } = iconConfig[status];

  return (
    <div className="flex items-center gap-2.5">
      <div className={`flex h-5 w-5 items-center justify-center rounded-full ${bg}`}>{icon}</div>
      <span className="text-[12px] font-normal text-[#52525B]">{text}</span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * ProjectConfigPanel displays project configuration details.
 *
 * Two modes:
 * 1. View Mode (isEditing=false): Shows project info, scene, config status
 * 2. Edit Mode (isEditing=true): Shows form for creating/editing project
 */
export function ProjectConfigPanel(props: ProjectConfigPanelProps) {
  const { isEditing = false } = props;

  if (isEditing) {
    return <EditModePanel {...props} />;
  }

  return <ViewModePanel {...props} />;
}

export default ProjectConfigPanel;
