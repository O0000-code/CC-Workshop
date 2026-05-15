// ==================== 插件相关类型定义 ====================

/**
 * 检测到的插件 Skill（用于导入弹框）
 */
export interface DetectedPluginSkill {
  pluginId: string; // "plugin-name@marketplace"
  pluginName: string; // 插件名称
  marketplace: string; // marketplace 名称
  skillName: string; // Skill 名称
  description: string; // Skill 描述
  path: string; // SKILL.md 所在目录路径
  version: string; // 插件版本
  isImported: boolean; // 是否已导入
}

/**
 * 检测到的插件 MCP（用于导入弹框）
 */
export interface DetectedPluginMcp {
  pluginId: string; // "plugin-name@marketplace"
  pluginName: string; // 插件名称
  marketplace: string; // marketplace 名称
  mcpName: string; // MCP 名称
  command: string; // 执行命令
  args: string[]; // 命令参数
  env?: Record<string, string>; // 环境变量
  url?: string; // HTTP MCP URL
  mcpType?: string; // MCP type: "stdio" or "http"
  path: string; // .mcp.json 路径
  version: string; // 插件版本
  isImported: boolean; // 是否已导入
}

/**
 * 已安装的插件信息
 */
export interface InstalledPlugin {
  id: string; // "plugin-name@marketplace"
  name: string; // 插件名称
  marketplace: string; // marketplace 名称
  version: string; // 插件版本
  enabled: boolean; // 是否启用
  installPath: string; // 安装路径
  hasSkills: boolean; // 是否包含 Skills
  hasMcp: boolean; // 是否包含 MCP
}

/**
 * 插件导入项
 */
export interface PluginImportItem {
  pluginId: string; // "plugin-name@marketplace"
  pluginName: string; // 插件名称
  marketplace: string; // marketplace 名称
  itemName: string; // skill name 或 mcp name
  sourcePath: string; // 源文件路径
  version: string; // 插件版本
}

/**
 * Per-item failure surfaced by `import_plugin_skills` / `import_plugin_mcps`
 * (R2-6). Mirrors Rust `PluginImportError`.
 */
export interface PluginImportError {
  pluginId: string;
  itemName: string;
  error: string;
}

/**
 * Aggregate result of an `import_plugin_*` call (R2-6). Mirrors Rust
 * `PluginImportResult`.
 *
 * - `imported` is the list of import keys ("pluginId|itemName") that
 *   succeeded; the store appends these to the persisted
 *   `importedPluginSkills` / `importedPluginMcps` markers.
 * - `errors` is non-empty when partial failure occurred — the modal layer
 *   shows them to the user instead of silently closing.
 */
export interface PluginImportResult {
  imported: string[];
  errors: PluginImportError[];
}

/**
 * Counts returned by `cleanup_orphan_plugin_imports` (R2-10).
 */
export interface PluginImportCleanupResult {
  removedSkills: number;
  removedMcps: number;
}
