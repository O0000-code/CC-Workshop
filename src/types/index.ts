import type { EnvVarSpec, MarketplaceSource } from './marketplace';

export interface Skill {
  /**
   * Canonical id. **Invariant: `id === sourcePath`** — the absolute filesystem
   * path to the skill directory (mirror of Rust `Skill::id`). Marketplace
   * shortcut paths (`InstallOutcome.skillId`, `?selected=` query, AddToScene
   * popover) rely on this identity. See `Skill::id` doc in `types.rs` for the
   * full audit list (B-P0-5 / E1-5).
   */
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
  /**
   * Provenance of the resource. V2 expanded the historical two-state union
   * (`'local' | 'plugin'`) to three states with the addition of
   * `'marketplace'` (D-9 / R-2). UI conditionals over `=== 'plugin'` keep
   * their existing semantics; marketplace items take the implicit
   * non-plugin branch and rank equally with local resources (no sort
   * sink-to-bottom; see skillsStore.ts:469-478 / mcpsStore.ts:503-513).
   */
  installSource?: 'local' | 'plugin' | 'marketplace';
  pluginId?: string; // 插件 ID，如 "nanobanana-skill@claude-code-settings"
  pluginName?: string; // 插件显示名称
  marketplace?: string; // plugin 来源里的 marketplace 名称（与 V2 marketplace 概念无关，保留以避免破坏 plugin 路径）
  pluginEnabled?: boolean; // 插件在 Claude Code 中是否启用
  /**
   * Marketplace upstream provenance. Populated only when
   * `installSource === 'marketplace'` (D-Imp-4). Carries the
   * `(owner, repo, name)` triple plus a sync timestamp; the SSoT
   * selector matches on this triple before falling back to name match
   * (D-Imp-8 / spec §6.3).
   */
  marketplaceSource?: MarketplaceSource;
}

export interface McpServer {
  /**
   * Canonical id. **Invariant: `id === sourcePath`** — the absolute filesystem
   * path to the MCP `.json` config (mirror of Rust `McpServer::id`). The
   * marketplace install short-cut depends on this identity; see
   * `Skill.id` for the full audit list.
   */
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
  /** HTTP request headers for HTTP-type MCPs (Authorization / X-API-Key /
   *  etc.). Written verbatim into `.mcp.json` `headers` by sync. */
  headers?: Record<string, string>;
  mcpType?: string;
  // 插件相关字段 - 从 Rust 后端返回
  /**
   * Provenance of the resource. V2 expanded the historical two-state union
   * (`'local' | 'plugin'`) to three states with the addition of
   * `'marketplace'` (D-9 / R-2). See {@link Skill.installSource}.
   */
  installSource?: 'local' | 'plugin' | 'marketplace';
  pluginId?: string; // 插件 ID，如 "nanobanana-skill@claude-code-settings"
  pluginName?: string; // 插件显示名称
  marketplace?: string; // plugin 来源里的 marketplace 名称（与 V2 marketplace 概念无关，保留以避免破坏 plugin 路径）
  pluginEnabled?: boolean; // 插件在 Claude Code 中是否启用
  /**
   * Marketplace upstream provenance. Populated only when
   * `installSource === 'marketplace'` (D-Imp-4). See {@link Skill.marketplaceSource}.
   */
  marketplaceSource?: MarketplaceSource;
  /**
   * Required environment-variable specs declared by the upstream marketplace
   * catalog item (stdio MCPs only). Mirror of Rust `McpServer.required_env_vars`.
   * UI surfaces such as the Project detail panel use this to detect "missing
   * required env" states without rehydrating the marketplace catalog
   * (B-P0-9 / E3-2). `undefined` for HTTP MCPs and for MCPs not installed
   * via the marketplace.
   */
  requiredEnvVars?: EnvVarSpec[];
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

/** Claude model alias passed to the CLI's `--model` flag for Auto Classify. */
export type ClassifyModel = 'opus' | 'sonnet' | 'haiku';

/**
 * Optional scope for `autoClassify` calls. When undefined, the store classifies
 * all items it owns. When `categoryIds` is provided, only items whose category
 * is in the set are classified (the set must already include descendants for
 * hierarchical categories — resolution is the caller's responsibility, since
 * `collectDescendantIds` lives in the page layer). When `tagId` is provided,
 * only items carrying that tag are classified. Both can be combined; an item
 * must satisfy every provided field to be included.
 */
export interface ClassifyScope {
  categoryIds?: Set<string>;
  tagId?: string;
}

export interface AppSettings {
  skillSourceDir: string;
  mcpSourceDir: string;
  claudeConfigDir: string;
  anthropicApiKey: string;
  autoClassifyNewItems: boolean;
  /** Model alias for Auto Classify: `opus` | `sonnet` | `haiku`. Default `opus`. */
  classifyModel: ClassifyModel;
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
 * 从后端返回的 AI 分类建议。当 `suggested_parent_category` 存在时，
 * `suggested_category` 应作为该父类的子分类创建/使用（depth ≤ 2）。
 */
export interface ClassifyResult {
  id: string;
  suggested_category: string;
  suggested_parent_category?: string;
  suggested_tags: string[];
  suggested_icon?: string;
}

/**
 * 传给 `auto_classify` IPC 的现有分类快照。`parentName` 设置时表示该
 * 分类是名为 `parentName` 的根分类的子分类；`null` / 缺省表示根分类。
 * 模型只在名字层面推理层级。
 */
export interface ExistingCategoryPayload {
  name: string;
  parentName: string | null;
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
  /**
   * Most recently created or edited Scene id. Drives the Marketplace
   * "Add to active Scene" short-cut (D-Imp-6). Maintained by `add_scene` /
   * `update_scene` / `delete_scene` on the Rust side; mirrored into
   * `scenesStore` on the frontend. `undefined` until the user creates or
   * updates a Scene at least once.
   */
  lastEditedSceneId?: string;
  /**
   * Triple-hash ids (`{owner}-{repo}-{name}`) of every Skill ever installed
   * via the Ensemble Marketplace. V1 records only — not yet read by any UI
   * surface (R-36 keeps top-level lists lean). Survives uninstall + Trash
   * recovery so the catalog can later show a "you have installed this
   * before" hint without reaching into `data.json.skillMetadata`.
   */
  importedMarketplaceSkills?: string[];
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
