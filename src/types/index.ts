// 安装来源类型
export type InstallSource = 'manual' | 'import' | 'npx' | 'plugin';

export interface Skill {
  id: string;
  name: string;
  description: string;
  /** Cached display name of the category. Kept in sync with Category.name; the
   * canonical reference is `categoryId` once the V1 hierarchy migration completes. */
  category: string;
  /**
   * Source of truth for category reference (V1 hierarchy migration).
   * `undefined` = uncategorized OR not-yet-migrated (legacy data.json). UI prefers
   * this over `category` for routing and sidebar count aggregation. The persisted
   * source of truth lives in `SkillMetadata.category_id` on the Rust side; this
   * field mirrors it via `scan_skills`.
   */
  categoryId?: string;
  tags: string[];
  enabled: boolean;
  sourcePath: string;
  scope: 'global' | 'project'; // 安装范围: global=用户级全局, project=项目级
  invocation?: string;
  allowedTools?: string[];
  instructions: string;
  createdAt: string;
  lastUsed?: string;
  usageCount: number;
  icon?: string; // 自定义图标名称
  installedAt?: string; // 安装时间 (文件创建时间)
  // 插件相关字段 - 从 Rust 后端返回
  installSource?: 'local' | 'plugin'; // 安装来源
  pluginId?: string; // 插件 ID，如 "nanobanana-skill@claude-code-settings"
  pluginName?: string; // 插件显示名称
  marketplace?: string; // marketplace 名称
  pluginEnabled?: boolean; // 插件在 Claude Code 中是否启用
}

export interface McpServer {
  id: string;
  name: string;
  description: string;
  /** Cached display name of the category. Kept in sync with Category.name; the
   * canonical reference is `categoryId` once the V1 hierarchy migration completes. */
  category: string;
  /**
   * Source of truth for category reference (V1 hierarchy migration).
   * `undefined` = uncategorized OR not-yet-migrated (legacy data.json). UI prefers
   * this over `category` for routing and sidebar count aggregation. The persisted
   * source of truth lives in `McpMetadata.category_id` on the Rust side; this
   * field mirrors it via `scan_mcps`.
   */
  categoryId?: string;
  tags: string[];
  enabled: boolean;
  sourcePath: string;
  scope: 'global' | 'project'; // 安装范围: global=用户级全局, project=项目级
  command: string;
  args: string[];
  env?: Record<string, string>;
  providedTools: Tool[];
  createdAt: string;
  lastUsed?: string;
  usageCount: number;
  icon?: string; // 自定义图标名称
  installedAt?: string; // 安装时间 (文件创建时间)
  url?: string;
  mcpType?: string;
  // 插件相关字段 - 从 Rust 后端返回
  installSource?: 'local' | 'plugin'; // 安装来源
  pluginId?: string; // 插件 ID，如 "nanobanana-skill@claude-code-settings"
  pluginName?: string; // 插件显示名称
  marketplace?: string; // marketplace 名称
  pluginEnabled?: boolean; // 插件在 Claude Code 中是否启用
}

export interface Tool {
  name: string;
  description: string;
}

export interface Scene {
  id: string;
  name: string;
  description: string;
  icon: string;
  skillIds: string[];
  mcpIds: string[];
  createdAt: string;
  lastUsed?: string;
  /** 关联的 CLAUDE.md 文件 ID 列表 (排除 isGlobal=true 的) */
  claudeMdIds?: string[];
}

export interface Project {
  id: string;
  name: string;
  path: string;
  sceneId: string;
  lastSynced?: string;
  icon?: string; // 自定义图标名称
}

export interface Category {
  id: string;
  name: string;
  color: string;
  count: number;
  /**
   * Parent category id. `undefined` = root level. Max depth = 2 (root + children).
   * Backward compat: legacy `data.json` rows omit this key → deserialised to
   * `undefined` (root). Corresponds to Rust `Category.parent_id: Option<String>`
   * with `serde(default, skip_serializing_if = "Option::is_none")`.
   */
  parentId?: string;
}

export interface Tag {
  id: string;
  name: string;
  count: number;
}

import type { ClaudeMdDistributionPath } from './claudeMd';

export interface AppSettings {
  skillSourceDir: string;
  mcpSourceDir: string;
  claudeConfigDir: string;
  anthropicApiKey: string;
  autoClassifyNewItems: boolean;
  terminalApp: string; // 终端应用 (Terminal/iTerm/Warp/custom)
  claudeCommand: string; // 启动 Claude Code 的命令
  hasCompletedImport: boolean; // 是否已完成首次导入
  warpOpenMode: 'tab' | 'window'; // Warp 打开模式：新 Tab 或新窗口
  /** CLAUDE.md 分发目标路径 */
  claudeMdDistributionPath?: ClaudeMdDistributionPath;
}

export interface ConfigStatus {
  projectExists: boolean;
  sceneSelected: boolean;
  skillsConfigured: boolean;
  mcpsConfigured: boolean;
}

// ==================== 分类相关类型 ====================

/**
 * 用于自动分类的项目信息
 * 传递给后端进行 AI 分类
 */
export interface ClassifyItem {
  id: string;
  name: string;
  description: string;
  content?: string; // For CLAUDE.md files
  instructions?: string; // For Skills
  tools?: string[]; // For MCPs - tool names
}

/**
 * 自动分类结果
 * 从后端返回的 AI 分类建议
 */
export interface ClassifyResult {
  id: string;
  suggested_category: string;
  suggested_tags: string[];
  suggested_icon?: string;
}

// ==================== 导入相关类型 ====================

/**
 * 检测到的现有配置
 * 用于首次启动时检测 ~/.claude/ 中的现有 Skills 和 MCPs
 */
export interface ExistingConfig {
  skills: DetectedSkill[];
  mcps: DetectedMcp[];
  hasConfig: boolean; // 是否存在可导入的配置
}

/**
 * 检测到的 Skill
 */
export interface DetectedSkill {
  name: string;
  path: string;
  description?: string;
}

/**
 * 检测到的 MCP Server
 */
export interface DetectedMcp {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  scope?: 'user' | 'local'; // 来源范围: user=用户全局配置, local=项目本地配置
  projectPath?: string; // Local scope 时的项目路径
  url?: string;
  mcpType?: string;
}

/**
 * 导入项
 * 用于指定要导入的 Skill 或 MCP
 */
export interface ImportItem {
  type: 'skill' | 'mcp';
  name: string;
  sourcePath: string; // 原始路径
}

/**
 * 导入结果
 */
export interface ImportResult {
  success: boolean;
  imported: {
    skills: number;
    mcps: number;
  };
  errors: string[];
  backupPath: string; // 备份目录路径
}

/**
 * 备份信息
 */
export interface BackupInfo {
  path: string; // 备份目录路径
  timestamp: string; // ISO 格式时间戳
  itemsCount: {
    skills: number;
    mcps: number;
  };
}

// ==================== MCP Tools Fetch 类型 ====================

/**
 * MCP Tool 详细信息
 * 从 MCP Server 运行时获取
 */
export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * 获取 MCP Tools 的结果
 */
export interface FetchMcpToolsResult {
  success: boolean;
  tools: McpToolInfo[];
  error?: string;
  serverInfo?: {
    name: string;
    version?: string;
  };
}

// ==================== 使用统计类型 ====================

/**
 * Skill 使用统计
 */
export interface SkillUsage {
  call_count: number;
  last_used: string | null;
}

/**
 * MCP 使用统计
 */
export interface McpUsage {
  total_calls: number;
  last_used: string | null;
}

/**
 * 完整使用统计数据
 */
export interface UsageStats {
  skills: Record<string, SkillUsage>;
  mcps: Record<string, McpUsage>;
}

// ==================== 应用数据类型 ====================

/**
 * 应用持久化数据
 * 存储在 ~/.ensemble/data.json 中
 *
 * Mirrors Rust `AppData` in `src-tauri/src/types.rs`. Note: `skills` and
 * `mcpServers` are NOT persisted in `data.json` — they are runtime-derived
 * by `scan_skills` / `scan_mcps`. The fields below are kept optional for
 * legacy callers; do not rely on them being populated by `read_app_data`.
 */
export interface AppData {
  skills?: Skill[];
  mcpServers?: McpServer[];
  scenes: Scene[];
  projects: Project[];
  categories: Category[];
  tags: Tag[];
  settings?: AppSettings;
  importedPluginSkills?: string[]; // 已导入的插件 Skills 的 pluginId 列表
  importedPluginMcps?: string[]; // 已导入的插件 MCPs 的 pluginId 列表
  /**
   * V1 hierarchy migration completion flag. Set to `true` by the backend
   * `migrate_category_id_for_skills_mcps` IPC after a successful run; the
   * frontend reads this on `initApp` to decide whether to invoke migration.
   * Stored in AppData (not AppSettings) to bypass the
   * `settingsStore.saveSettings` enumerate risk that would otherwise reset
   * the flag every time the user changes any setting.
   * Backward compat: legacy `data.json` omits this key → `undefined` →
   * frontend treats as `false` and triggers migration.
   */
  hasCompletedCategoryIdMigration?: boolean;
}

/**
 * Result returned by the one-time `migrate_category_id_for_skills_mcps` IPC.
 * Mirrors Rust `MigrationReport` in `src-tauri/src/types.rs:265-278`.
 *
 * Per Phase-1 audit P0-1 / 03 V2 §3.4: orphans do NOT block the flag advance —
 * orphan names are a legitimate terminal user state (the user has skills/mcps
 * referencing categories that no longer exist; the cached `category` name
 * remains as fallback display). Orphan ids are surfaced here so the UI can
 * optionally prompt the user to re-classify them.
 */
export interface MigrationReport {
  /** Number of skill_metadata entries whose `categoryId` was filled this run. */
  migratedSkills: number;
  /** Number of mcp_metadata entries whose `categoryId` was filled this run. */
  migratedMcps: number;
  /** HashMap keys (skill ids) of entries whose `category` name did not resolve. */
  orphanedSkills: string[];
  /** HashMap keys (mcp ids) of entries whose `category` name did not resolve. */
  orphanedMcps: string[];
}

// ==================== 插件相关类型导出 ====================

export * from './plugin';

// ==================== CLAUDE.md 相关类型导出 ====================

export * from './claudeMd';

// ==================== Trash 相关类型导出 ====================

export * from './trash';
