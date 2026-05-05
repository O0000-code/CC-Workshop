use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    /// Source of truth for category reference. `None` = uncategorized OR
    /// not-yet-migrated (legacy data.json). UI prefers this over `category`.
    /// Note: `Skill` is runtime-derived — built by `scan_skills` from
    /// `SkillMetadata` + filesystem — and not directly persisted in `data.json`.
    /// The persisted source of truth is `SkillMetadata.category_id`.
    /// Backward compat: `serde(default)` makes the absence of this key in old
    /// JSON deserialise to `None`; `skip_serializing_if` keeps new writes clean.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
    pub tags: Vec<String>,
    pub enabled: bool,
    pub source_path: String,
    pub scope: String, // "user" | "project"
    pub invocation: Option<String>,
    pub allowed_tools: Option<Vec<String>>,
    pub instructions: String,
    pub created_at: String,
    pub last_used: Option<String>,
    pub usage_count: u32,
    pub icon: Option<String>,
    pub installed_at: Option<String>,
    // Plugin source fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub install_source: Option<String>, // "local" | "plugin"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugin_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugin_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub marketplace: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugin_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServer {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    /// Source of truth for category reference. `None` = uncategorized OR
    /// not-yet-migrated (legacy data.json). UI prefers this over `category`.
    /// Note: `McpServer` is runtime-derived — built by `scan_mcps` from
    /// `McpMetadata` + filesystem — and not directly persisted in `data.json`.
    /// The persisted source of truth is `McpMetadata.category_id`.
    /// Backward compat: `serde(default)` makes the absence of this key in old
    /// JSON deserialise to `None`; `skip_serializing_if` keeps new writes clean.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
    pub tags: Vec<String>,
    pub enabled: bool,
    pub source_path: String,
    pub scope: String, // "global" | "project"
    pub command: String,
    pub args: Vec<String>,
    pub env: Option<HashMap<String, String>>,
    pub provided_tools: Vec<Tool>,
    pub created_at: String,
    pub last_used: Option<String>,
    pub usage_count: u32,
    pub installed_at: Option<String>,
    /// URL for HTTP-type MCP servers
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// MCP type: "stdio" or "http"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mcp_type: Option<String>,
    // Plugin source fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub install_source: Option<String>, // "local" | "plugin"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugin_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugin_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub marketplace: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugin_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tool {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scene {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub skill_ids: Vec<String>,
    pub mcp_ids: Vec<String>,
    pub created_at: String,
    pub last_used: Option<String>,
    /// Associated CLAUDE.md file IDs (excluding isGlobal=true files)
    #[serde(default)]
    pub claude_md_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashedScene {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub skill_ids: Vec<String>,
    pub mcp_ids: Vec<String>,
    pub created_at: String,
    pub last_used: Option<String>,
    pub deleted_at: String,
    #[serde(default)]
    pub claude_md_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub scene_id: String,
    pub last_synced: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashedProject {
    pub id: String,
    pub name: String,
    pub path: String,
    pub scene_id: String,
    pub last_synced: Option<String>,
    pub deleted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub name: String,
    pub color: String,
    pub count: u32,
    /// Parent category id. `None` = root level. Max depth = 2 (root + children).
    /// Backward compat: `serde(default)` makes the absence of this key in old
    /// `data.json` deserialise to `None` (root). `skip_serializing_if` keeps
    /// new writes clean — root rows do NOT emit the key, matching pre-V1 JSON.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppData {
    pub categories: Vec<Category>,
    pub tags: Vec<Tag>,
    pub scenes: Vec<Scene>,
    pub projects: Vec<Project>,
    pub skill_metadata: HashMap<String, SkillMetadata>,
    pub mcp_metadata: HashMap<String, McpMetadata>,
    #[serde(default)]
    pub trashed_scenes: Vec<TrashedScene>,
    #[serde(default)]
    pub trashed_projects: Vec<TrashedProject>,
    /// Imported plugin Skills' pluginId list
    #[serde(default)]
    pub imported_plugin_skills: Vec<String>,
    /// Imported plugin MCPs' pluginId list
    #[serde(default)]
    pub imported_plugin_mcps: Vec<String>,
    /// Managed CLAUDE.md files list
    #[serde(default)]
    pub claude_md_files: Vec<ClaudeMdFile>,
    /// Current global CLAUDE.md file ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub global_claude_md_id: Option<String>,
    /// V1 hierarchy migration state. Set to `true` by
    /// `migrate_category_id_for_skills_mcps` after a successful run; subsequent
    /// app launches skip the migration. Stored in `AppData` (NOT `AppSettings`)
    /// to bypass the `settingsStore.saveSettings` enumerate risk that would
    /// otherwise reset this flag every time the user changes any setting.
    /// Backward compat: `serde(default)` makes the absence of this key in old
    /// `data.json` deserialise to `false`, triggering a one-time migration on
    /// next startup.
    #[serde(default)]
    pub has_completed_category_id_migration: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SkillMetadata {
    pub category: String,
    /// Persisted source of truth for category reference (mirrored into
    /// runtime `Skill.category_id` by `scan_skills`). `None` = uncategorized
    /// OR not-yet-migrated (legacy `data.json`). Backward compat: missing key
    /// in old metadata deserialises to `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
    pub tags: Vec<String>,
    pub enabled: bool,
    pub usage_count: u32,
    pub last_used: Option<String>,
    pub icon: Option<String>,
    pub scope: String, // "global" | "project"
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct McpMetadata {
    pub category: String,
    /// Persisted source of truth for category reference (mirrored into
    /// runtime `McpServer.category_id` by `scan_mcps`). `None` = uncategorized
    /// OR not-yet-migrated (legacy `data.json`). Backward compat: missing key
    /// in old metadata deserialises to `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
    pub tags: Vec<String>,
    pub enabled: bool,
    pub usage_count: u32,
    pub last_used: Option<String>,
    pub scope: String, // "global" | "project"
}

/// Result of running [`migrate_category_id_for_skills_mcps`].
///
/// V2 [P0-DATA-3] (per `03_tech_plan.md` V2 §3.4 — Decisional source):
/// - `migrated_*`: successfully filled `category_id` on metadata entries
///   whose `category` (name) resolved against the current `categories` Vec.
/// - `orphaned_*`: HashMap keys (skill_id / mcp_id) whose `category` name
///   does not match any existing category. These entries are left unchanged
///   (display still falls back to the cached `category` name string).
///
/// **Flag advancement rule** (per Phase-1 audit P0-1 ruling, finalised in
/// `03_tech_plan` V2 §3.4): orphan presence is a **terminal state** — the
/// metadata's `category` string does not match any current Category and the
/// user must rename or re-classify manually. Re-running migration on every
/// launch would never resolve orphans on its own and would add I/O churn.
/// So `has_completed_category_id_migration` in [`AppData`] is advanced to
/// `true` once a migration pass completes, **regardless of orphan presence**.
/// The `orphaned_*` lists are returned as part of this report so the
/// front-end can surface them for manual cleanup if desired.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MigrationReport {
    /// Number of skill_metadata entries whose `category_id` was filled in
    /// during this run (excludes already-migrated entries).
    pub migrated_skills: u32,
    /// Number of mcp_metadata entries whose `category_id` was filled in
    /// during this run (excludes already-migrated entries).
    pub migrated_mcps: u32,
    /// HashMap keys of skill_metadata entries whose `category` name did not
    /// resolve. These entries are persisted unchanged; the flag still
    /// advances (orphan = terminal state, see struct doc above).
    pub orphaned_skills: Vec<String>,
    /// HashMap keys of mcp_metadata entries whose `category` name did not
    /// resolve. These entries are persisted unchanged; the flag still
    /// advances (orphan = terminal state, see struct doc above).
    pub orphaned_mcps: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub skill_source_dir: String,
    pub mcp_source_dir: String,
    pub claude_config_dir: String,
    pub anthropic_api_key: Option<String>,
    pub auto_classify_new_items: bool,
    pub terminal_app: String,
    pub claude_command: String,
    #[serde(default = "default_warp_open_mode")]
    pub warp_open_mode: String,
    pub has_completed_import: bool,
    /// CLAUDE.md distribution target path
    #[serde(default = "default_claude_md_distribution_path")]
    pub claude_md_distribution_path: ClaudeMdDistributionPath,
}

fn default_warp_open_mode() -> String {
    "window".to_string()
}

fn default_claude_md_distribution_path() -> ClaudeMdDistributionPath {
    ClaudeMdDistributionPath::ClaudeDir
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            skill_source_dir: "~/.ensemble/skills".to_string(),
            mcp_source_dir: "~/.ensemble/mcps".to_string(),
            claude_config_dir: "~/.claude".to_string(),
            anthropic_api_key: None,
            auto_classify_new_items: false,
            terminal_app: "Terminal".to_string(),
            claude_command: "claude".to_string(),
            warp_open_mode: "window".to_string(),
            has_completed_import: false,
            claude_md_distribution_path: ClaudeMdDistributionPath::default(),
        }
    }
}

/// MCP configuration file format (JSON file in MCP source directory)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpConfigFile {
    pub name: String,
    pub description: Option<String>,
    #[serde(default)]
    pub command: String,
    pub args: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    #[serde(rename = "providedTools")]
    pub provided_tools: Option<Vec<Tool>>,
    /// URL for HTTP-type MCP servers
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// MCP type: "stdio" or "http"
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub mcp_type: Option<String>,
    // Plugin source fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub install_source: Option<String>, // "local" | "plugin"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugin_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugin_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub marketplace: Option<String>,
}

/// Claude settings.json / .claude.json MCP configuration format
///
/// Supports both stdio MCPs (command + args) and HTTP MCPs (url).
/// `command` defaults to "" when missing (HTTP MCPs have no command).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeMcpConfig {
    #[serde(default)]
    pub command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<HashMap<String, String>>,
    /// URL for HTTP-type MCP servers
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// MCP type: "stdio" or "http"
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub mcp_type: Option<String>,
}

/// Claude settings.json root structure
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ClaudeSettings {
    #[serde(rename = "mcpServers", default)]
    pub mcp_servers: HashMap<String, ClaudeMcpConfig>,
    #[serde(flatten)]
    pub other: HashMap<String, serde_json::Value>,
}

/// Project configuration status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfigStatus {
    pub has_claude_dir: bool,
    pub has_settings_local: bool,
    pub has_commands_md: bool,
    pub skill_count: u32,
    pub mcp_count: u32,
}

// ============================================================================
// Import-related types
// ============================================================================

/// Detected existing configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExistingConfig {
    pub skills: Vec<DetectedSkill>,
    pub mcps: Vec<DetectedMcp>,
    pub has_config: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedSkill {
    pub name: String,
    pub path: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedMcp {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: Option<HashMap<String, String>>,
    pub scope: Option<String>,        // "user" or "local"
    pub project_path: Option<String>, // Project path when scope is "local"
    /// URL for HTTP-type MCP servers
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// MCP type: "stdio" or "http"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mcp_type: Option<String>,
}

/// Import item
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportItem {
    #[serde(rename = "type")]
    pub item_type: String, // "skill" | "mcp"
    pub name: String,
    pub source_path: String,
}

/// Import result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub success: bool,
    pub imported: ImportedCounts,
    pub errors: Vec<String>,
    pub backup_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedCounts {
    pub skills: u32,
    pub mcps: u32,
}

/// Backup information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub path: String,
    pub timestamp: String,
    pub items_count: ImportedCounts,
}

// ============================================================================
// ~/.claude.json types (correct MCP configuration location)
// ============================================================================

/// ~/.claude.json complete structure
///
/// MCP configuration is stored here, NOT in ~/.claude/settings.json
/// - User scope: top-level `mcpServers` field
/// - Local scope: `projects[path].mcpServers` field
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeJson {
    /// User-level MCP configuration (Global scope - available in all projects)
    #[serde(default)]
    pub mcp_servers: HashMap<String, ClaudeMcpConfig>,

    /// Project-level configurations (Local scope - only in specific projects)
    #[serde(default)]
    pub projects: HashMap<String, ClaudeProjectConfig>,

    /// Preserve all other fields (numStartups, theme, tipsHistory, etc.)
    #[serde(flatten)]
    pub other: HashMap<String, serde_json::Value>,
}

/// Project-level configuration within ~/.claude.json
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeProjectConfig {
    /// Local-scope MCP configuration for this project
    #[serde(default)]
    pub mcp_servers: HashMap<String, ClaudeMcpConfig>,

    /// Preserve all other project fields
    #[serde(flatten)]
    pub other: HashMap<String, serde_json::Value>,
}

// ============================================================================
// MCP Tools Fetch types (for runtime tool discovery)
// ============================================================================

/// MCP Tool detailed information (fetched from MCP Server at runtime)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolInfo {
    pub name: String,
    pub description: Option<String>,
    pub input_schema: Option<serde_json::Value>,
}

/// Result of fetching MCP tools from a server
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchMcpToolsResult {
    pub success: bool,
    pub tools: Vec<McpToolInfo>,
    pub error: Option<String>,
    pub server_info: Option<McpServerRuntimeInfo>,
}

/// MCP Server runtime information (from initialize response)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerRuntimeInfo {
    pub name: String,
    pub version: Option<String>,
}

// ============================================================================
// Plugin-related types (for plugin detection and import)
// ============================================================================

/// Installed plugin information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPlugin {
    /// Plugin ID: "plugin-name@marketplace"
    pub id: String,
    /// Plugin name
    pub name: String,
    /// Marketplace name
    pub marketplace: String,
    /// Plugin version
    pub version: String,
    /// Whether enabled in Claude Code settings
    pub enabled: bool,
    /// Installation path
    pub install_path: String,
    /// Whether plugin contains Skills
    pub has_skills: bool,
    /// Whether plugin contains MCP configurations
    pub has_mcp: bool,
}

/// Detected plugin Skill (for import dialog)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedPluginSkill {
    /// Plugin ID: "plugin-name@marketplace"
    pub plugin_id: String,
    /// Plugin display name
    pub plugin_name: String,
    /// Marketplace name
    pub marketplace: String,
    /// Skill name (directory name)
    pub skill_name: String,
    /// Skill description from SKILL.md
    pub description: String,
    /// Path to SKILL.md directory
    pub path: String,
    /// Plugin version
    pub version: String,
    /// Whether already imported to Ensemble
    pub is_imported: bool,
}

/// Detected plugin MCP (for import dialog)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedPluginMcp {
    /// Plugin ID: "plugin-name@marketplace"
    pub plugin_id: String,
    /// Plugin display name
    pub plugin_name: String,
    /// Marketplace name
    pub marketplace: String,
    /// MCP name (from .mcp.json)
    pub mcp_name: String,
    /// Execution command
    #[serde(default)]
    pub command: String,
    /// Command arguments
    pub args: Vec<String>,
    /// Environment variables
    pub env: Option<HashMap<String, String>>,
    /// URL for HTTP-type MCP servers
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// MCP type: "stdio" or "http"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mcp_type: Option<String>,
    /// Path to .mcp.json file
    pub path: String,
    /// Plugin version
    pub version: String,
    /// Whether already imported to Ensemble
    pub is_imported: bool,
}

/// Plugin import item
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginImportItem {
    /// Plugin ID: "plugin-name@marketplace"
    pub plugin_id: String,
    /// Plugin display name
    pub plugin_name: String,
    /// Marketplace name
    pub marketplace: String,
    /// Item name (skill name or MCP name)
    pub item_name: String,
    /// Source file path
    pub source_path: String,
    /// Plugin version
    pub version: String,
}

// ============================================================================
// CLAUDE.md related types
// ============================================================================

/// CLAUDE.md file type
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ClaudeMdType {
    Global,
    Project,
    Local,
}

impl ClaudeMdType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ClaudeMdType::Global => "global",
            ClaudeMdType::Project => "project",
            ClaudeMdType::Local => "local",
        }
    }
}

/// CLAUDE.md distribution target path
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ClaudeMdDistributionPath {
    #[serde(rename = ".claude/CLAUDE.md")]
    ClaudeDir,
    #[serde(rename = "CLAUDE.md")]
    Root,
    #[serde(rename = "CLAUDE.local.md")]
    Local,
}

impl Default for ClaudeMdDistributionPath {
    fn default() -> Self {
        ClaudeMdDistributionPath::ClaudeDir
    }
}

impl ClaudeMdDistributionPath {
    pub fn as_str(&self) -> &'static str {
        match self {
            ClaudeMdDistributionPath::ClaudeDir => ".claude/CLAUDE.md",
            ClaudeMdDistributionPath::Root => "CLAUDE.md",
            ClaudeMdDistributionPath::Local => "CLAUDE.local.md",
        }
    }
}

/// Conflict resolution strategy
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ClaudeMdConflictResolution {
    Overwrite,
    Backup,
    Skip,
}

impl Default for ClaudeMdConflictResolution {
    fn default() -> Self {
        ClaudeMdConflictResolution::Backup
    }
}

/// CLAUDE.md file info (managed file)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeMdFile {
    /// Unique identifier (UUID)
    pub id: String,

    /// Display name
    pub name: String,

    /// Description
    pub description: String,

    /// Original source path
    pub source_path: String,

    /// Original source type
    pub source_type: ClaudeMdType,

    /// File content - runtime populated from independent file
    /// Stored as empty string in data.json, actual content read from ~/.ensemble/claude-md/{id}/CLAUDE.md
    #[serde(default)]
    pub content: String,

    /// Managed file path (new field for independent file storage)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub managed_path: Option<String>,

    /// Whether set as global
    pub is_global: bool,

    /// Category ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,

    /// Tag ID list
    #[serde(default)]
    pub tag_ids: Vec<String>,

    /// Created time (ISO 8601)
    pub created_at: String,

    /// Updated time (ISO 8601)
    pub updated_at: String,

    /// File size in bytes
    pub size: u64,

    /// Custom icon name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

/// Scan result item
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeMdScanItem {
    /// File path
    pub path: String,

    /// File type
    #[serde(rename = "type")]
    pub file_type: ClaudeMdType,

    /// File size (bytes)
    pub size: u64,

    /// Last modified time (ISO 8601)
    pub modified_at: String,

    /// Whether already imported
    pub is_imported: bool,

    /// Corresponding ClaudeMdFile ID (if imported)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub imported_id: Option<String>,

    /// Content preview (first 500 chars)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview: Option<String>,

    /// Project name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
}

/// Scan result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeMdScanResult {
    /// Scanned file list
    pub items: Vec<ClaudeMdScanItem>,

    /// Number of directories scanned
    pub scanned_dirs: u32,

    /// Duration in milliseconds
    pub duration: u64,

    /// Error messages
    #[serde(default)]
    pub errors: Vec<String>,
}

/// Import options
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeMdImportOptions {
    /// Source file path
    pub source_path: String,

    /// Custom name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    /// Custom description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Category ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,

    /// Tag ID list
    #[serde(default)]
    pub tag_ids: Vec<String>,
}

/// Import result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeMdImportResult {
    /// Whether successful
    pub success: bool,

    /// Imported file
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<ClaudeMdFile>,

    /// Error message
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Distribution options
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeMdDistributionOptions {
    /// ClaudeMdFile ID to distribute
    pub claude_md_id: String,

    /// Target project path
    pub project_path: String,

    /// Target file path
    pub target_path: ClaudeMdDistributionPath,

    /// Conflict resolution strategy
    #[serde(default)]
    pub conflict_resolution: ClaudeMdConflictResolution,
}

/// Distribution result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeMdDistributionResult {
    /// Whether successful
    pub success: bool,

    /// Target file full path
    pub target_path: String,

    /// Action performed
    pub action: String, // "created" | "overwritten" | "backed_up" | "skipped"

    /// Backup path
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backup_path: Option<String>,

    /// Error message
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Set global result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetGlobalResult {
    /// Whether successful
    pub success: bool,

    /// Previous global file ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_global_id: Option<String>,

    /// Backup path
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backup_path: Option<String>,

    /// Auto-imported file ID (when existing global was not managed)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_imported_id: Option<String>,

    /// Error message
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// ============================================================================
// Trash Recovery types
// ============================================================================

/// Trashed skill information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashedSkill {
    pub id: String,
    pub name: String,
    pub path: String,
    pub deleted_at: String,
    pub description: String,
}

/// Trashed MCP information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashedMcp {
    pub id: String,
    pub name: String,
    pub path: String,
    pub deleted_at: String,
    pub description: String,
}

/// Trashed CLAUDE.md file information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashedClaudeMd {
    pub id: String,
    pub name: String,
    pub path: String,
    pub deleted_at: String,
}

/// Collection of all trashed items
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashedItems {
    pub skills: Vec<TrashedSkill>,
    pub mcps: Vec<TrashedMcp>,
    pub claude_md_files: Vec<TrashedClaudeMd>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_claude_md_type_as_str() {
        assert_eq!(ClaudeMdType::Global.as_str(), "global");
        assert_eq!(ClaudeMdType::Project.as_str(), "project");
        assert_eq!(ClaudeMdType::Local.as_str(), "local");
    }

    #[test]
    fn test_claude_md_distribution_path_as_str() {
        assert_eq!(ClaudeMdDistributionPath::ClaudeDir.as_str(), ".claude/CLAUDE.md");
        assert_eq!(ClaudeMdDistributionPath::Root.as_str(), "CLAUDE.md");
        assert_eq!(ClaudeMdDistributionPath::Local.as_str(), "CLAUDE.local.md");
    }

    #[test]
    fn test_claude_md_distribution_path_default() {
        let default = ClaudeMdDistributionPath::default();
        assert_eq!(default, ClaudeMdDistributionPath::ClaudeDir);
    }

    #[test]
    fn test_claude_md_conflict_resolution_default() {
        let default = ClaudeMdConflictResolution::default();
        assert_eq!(default, ClaudeMdConflictResolution::Backup);
    }

    #[test]
    fn test_app_settings_default() {
        let settings = AppSettings::default();
        assert_eq!(settings.skill_source_dir, "~/.ensemble/skills");
        assert_eq!(settings.mcp_source_dir, "~/.ensemble/mcps");
        assert_eq!(settings.claude_config_dir, "~/.claude");
        assert_eq!(settings.terminal_app, "Terminal");
        assert_eq!(settings.claude_command, "claude");
        assert_eq!(settings.warp_open_mode, "window");
        assert!(!settings.auto_classify_new_items);
        assert!(!settings.has_completed_import);
        assert!(settings.anthropic_api_key.is_none());
        assert_eq!(settings.claude_md_distribution_path, ClaudeMdDistributionPath::ClaudeDir);
    }

    #[test]
    fn test_app_data_default() {
        let data = AppData::default();
        assert!(data.categories.is_empty());
        assert!(data.tags.is_empty());
        assert!(data.scenes.is_empty());
        assert!(data.projects.is_empty());
        assert!(data.skill_metadata.is_empty());
        assert!(data.mcp_metadata.is_empty());
        assert!(data.trashed_scenes.is_empty());
        assert!(data.trashed_projects.is_empty());
        assert!(data.imported_plugin_skills.is_empty());
        assert!(data.imported_plugin_mcps.is_empty());
        assert!(data.claude_md_files.is_empty());
        assert!(data.global_claude_md_id.is_none());
        assert!(!data.has_completed_category_id_migration);
    }

    #[test]
    fn test_tool_serde_roundtrip() {
        let tool = Tool {
            name: "test-tool".to_string(),
            description: "A test tool".to_string(),
        };
        let json = serde_json::to_string(&tool).unwrap();
        let deserialized: Tool = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "test-tool");
        assert_eq!(deserialized.description, "A test tool");
    }

    #[test]
    fn test_category_serde_roundtrip() {
        let category = Category {
            id: "cat-1".to_string(),
            name: "Development".to_string(),
            color: "#3B82F6".to_string(),
            count: 5,
            parent_id: None,
        };
        let json = serde_json::to_string(&category).unwrap();
        let deserialized: Category = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "cat-1");
        assert_eq!(deserialized.name, "Development");
        assert_eq!(deserialized.color, "#3B82F6");
        assert_eq!(deserialized.count, 5);
        assert!(deserialized.parent_id.is_none());
    }

    #[test]
    fn test_claude_md_type_serde_roundtrip() {
        // ClaudeMdType serializes to lowercase
        let json = serde_json::to_string(&ClaudeMdType::Global).unwrap();
        assert_eq!(json, "\"global\"");

        let deserialized: ClaudeMdType = serde_json::from_str("\"project\"").unwrap();
        assert_eq!(deserialized, ClaudeMdType::Project);
    }

    #[test]
    fn test_claude_md_distribution_path_serde() {
        let json = serde_json::to_string(&ClaudeMdDistributionPath::Root).unwrap();
        assert_eq!(json, "\"CLAUDE.md\"");

        let json_dir = serde_json::to_string(&ClaudeMdDistributionPath::ClaudeDir).unwrap();
        assert_eq!(json_dir, "\".claude/CLAUDE.md\"");

        let deserialized: ClaudeMdDistributionPath = serde_json::from_str("\"CLAUDE.local.md\"").unwrap();
        assert_eq!(deserialized, ClaudeMdDistributionPath::Local);
    }

    #[test]
    fn test_claude_mcp_config_http_type() {
        let json = r#"{"url":"https://example.com/mcp","type":"http"}"#;
        let config: ClaudeMcpConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.command, ""); // default empty string when missing
        assert_eq!(config.url, Some("https://example.com/mcp".to_string()));
        assert_eq!(config.mcp_type, Some("http".to_string()));
    }

    #[test]
    fn test_claude_mcp_config_stdio_type() {
        let json = r#"{"command":"node","args":["server.js"]}"#;
        let config: ClaudeMcpConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.command, "node");
        assert_eq!(config.args, Some(vec!["server.js".to_string()]));
        assert!(config.url.is_none());
        assert!(config.mcp_type.is_none());
    }

    // ========================================================================
    // T1a: Category-hierarchy field-addition serde compatibility tests
    // (per 03_tech_plan V2 §2 + §3.5)
    //
    // Each test exercises one of the two backward-compat paths:
    //   - "with"  : new JSON includes the new key → deserialises round-trip
    //   - "without": pre-V1 JSON omits the new key → deserialises with default
    //                (None for Option<String> fields, false for the bool flag)
    // The "without" cases are the critical regression guard: any old `data.json`
    // on disk MUST continue to parse. `serde(default)` plus `Option<String>`
    // (or plain `bool`) supplies the default; this suite locks that contract.
    // ========================================================================

    #[test]
    fn category_with_parent_id_serde_roundtrip() {
        let category = Category {
            id: "child-1".to_string(),
            name: "Frontend".to_string(),
            color: "#10B981".to_string(),
            count: 3,
            parent_id: Some("dev-root".to_string()),
        };
        let json = serde_json::to_string(&category).unwrap();
        // camelCase rename means Rust `parent_id` ↔ JSON `parentId`.
        assert!(json.contains("\"parentId\":\"dev-root\""));
        let deserialized: Category = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.parent_id, Some("dev-root".to_string()));
        assert_eq!(deserialized.id, "child-1");
        assert_eq!(deserialized.name, "Frontend");
    }

    #[test]
    fn category_without_parent_id_serde_roundtrip() {
        // Simulates pre-V1 data.json: no parentId key at all. After
        // deserialise, parent_id must be None. After serialise back, the key
        // must NOT appear (skip_serializing_if = "Option::is_none") — this
        // keeps writes byte-clean for users who never touch hierarchy.
        let legacy_json = r##"{"id":"cat-legacy","name":"Productivity","color":"#3B82F6","count":7}"##;
        let deserialized: Category = serde_json::from_str(legacy_json).unwrap();
        assert!(deserialized.parent_id.is_none());
        assert_eq!(deserialized.name, "Productivity");

        let reserialized = serde_json::to_string(&deserialized).unwrap();
        assert!(!reserialized.contains("parentId"));
    }

    #[test]
    fn skill_with_category_id_roundtrip() {
        let skill = Skill {
            id: "skill-1".to_string(),
            name: "test-skill".to_string(),
            description: "A skill".to_string(),
            category: "Development".to_string(),
            category_id: Some("dev-cat-id".to_string()),
            tags: vec!["a".to_string()],
            enabled: true,
            source_path: "/x".to_string(),
            scope: "user".to_string(),
            invocation: None,
            allowed_tools: None,
            instructions: String::new(),
            created_at: "2026-05-04T00:00:00Z".to_string(),
            last_used: None,
            usage_count: 0,
            icon: None,
            installed_at: None,
            install_source: None,
            plugin_id: None,
            plugin_name: None,
            marketplace: None,
            plugin_enabled: None,
        };
        let json = serde_json::to_string(&skill).unwrap();
        assert!(json.contains("\"categoryId\":\"dev-cat-id\""));
        let deserialized: Skill = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.category_id, Some("dev-cat-id".to_string()));
        assert_eq!(deserialized.category, "Development");
    }

    #[test]
    fn skill_without_category_id_old_data_compat() {
        // Old skill JSON (no categoryId). Even though Skill is runtime-derived
        // (built by scan_skills), being able to deserialise without categoryId
        // matters for any cached / round-tripped fixture and for the IPC
        // boundary where the frontend may send legacy shapes.
        let legacy_json = r#"{
            "id":"old-skill",
            "name":"legacy",
            "description":"",
            "category":"Misc",
            "tags":[],
            "enabled":true,
            "sourcePath":"/path",
            "scope":"user",
            "invocation":null,
            "allowedTools":null,
            "instructions":"",
            "createdAt":"2025-12-01T00:00:00Z",
            "lastUsed":null,
            "usageCount":0,
            "icon":null,
            "installedAt":null
        }"#;
        let deserialized: Skill = serde_json::from_str(legacy_json).unwrap();
        assert!(deserialized.category_id.is_none());
        assert_eq!(deserialized.category, "Misc");

        let reserialized = serde_json::to_string(&deserialized).unwrap();
        assert!(!reserialized.contains("categoryId"));
    }

    #[test]
    fn mcpserver_with_category_id_roundtrip() {
        let mcp = McpServer {
            id: "mcp-1".to_string(),
            name: "test-mcp".to_string(),
            description: String::new(),
            category: "Tools".to_string(),
            category_id: Some("tools-cat-id".to_string()),
            tags: vec![],
            enabled: true,
            source_path: "/y".to_string(),
            scope: "global".to_string(),
            command: "node".to_string(),
            args: vec![],
            env: None,
            provided_tools: vec![],
            created_at: "2026-05-04T00:00:00Z".to_string(),
            last_used: None,
            usage_count: 0,
            installed_at: None,
            url: None,
            mcp_type: None,
            install_source: None,
            plugin_id: None,
            plugin_name: None,
            marketplace: None,
            plugin_enabled: None,
        };
        let json = serde_json::to_string(&mcp).unwrap();
        assert!(json.contains("\"categoryId\":\"tools-cat-id\""));
        let deserialized: McpServer = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.category_id, Some("tools-cat-id".to_string()));
        assert_eq!(deserialized.category, "Tools");
    }

    #[test]
    fn mcpserver_without_category_id_old_data_compat() {
        // Old MCP JSON (no categoryId). Same rationale as the Skill variant.
        let legacy_json = r#"{
            "id":"old-mcp",
            "name":"legacy-mcp",
            "description":"",
            "category":"Misc",
            "tags":[],
            "enabled":true,
            "sourcePath":"/p",
            "scope":"global",
            "command":"node",
            "args":[],
            "env":null,
            "providedTools":[],
            "createdAt":"2025-12-01T00:00:00Z",
            "lastUsed":null,
            "usageCount":0,
            "installedAt":null
        }"#;
        let deserialized: McpServer = serde_json::from_str(legacy_json).unwrap();
        assert!(deserialized.category_id.is_none());
        assert_eq!(deserialized.category, "Misc");

        let reserialized = serde_json::to_string(&deserialized).unwrap();
        assert!(!reserialized.contains("categoryId"));
    }

    #[test]
    fn skillmetadata_without_category_id_old_data_compat() {
        // SkillMetadata is the persisted source of truth in data.json
        // (under the `skillMetadata` map). Old data.json lacks the
        // `categoryId` key on each metadata entry — it MUST deserialise to
        // None so the runtime fallback (display name from `category`) works.
        let legacy_json = r#"{
            "category":"Productivity",
            "tags":["work"],
            "enabled":true,
            "usageCount":0,
            "lastUsed":null,
            "icon":null,
            "scope":"global"
        }"#;
        let deserialized: SkillMetadata = serde_json::from_str(legacy_json).unwrap();
        assert!(deserialized.category_id.is_none());
        assert_eq!(deserialized.category, "Productivity");

        let reserialized = serde_json::to_string(&deserialized).unwrap();
        assert!(!reserialized.contains("categoryId"));
    }

    #[test]
    fn skillmetadata_with_category_id_roundtrip() {
        let metadata = SkillMetadata {
            category: "Productivity".to_string(),
            category_id: Some("prod-cat-id".to_string()),
            tags: vec!["work".to_string()],
            enabled: true,
            usage_count: 5,
            last_used: None,
            icon: None,
            scope: "global".to_string(),
        };
        let json = serde_json::to_string(&metadata).unwrap();
        assert!(json.contains("\"categoryId\":\"prod-cat-id\""));
        let deserialized: SkillMetadata = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.category_id, Some("prod-cat-id".to_string()));
    }

    #[test]
    fn mcpmetadata_without_category_id_old_data_compat() {
        // McpMetadata is the persisted source of truth for MCPs. Same
        // backward-compat contract as SkillMetadata.
        let legacy_json = r#"{
            "category":"Tools",
            "tags":[],
            "enabled":true,
            "usageCount":0,
            "lastUsed":null,
            "scope":"global"
        }"#;
        let deserialized: McpMetadata = serde_json::from_str(legacy_json).unwrap();
        assert!(deserialized.category_id.is_none());
        assert_eq!(deserialized.category, "Tools");

        let reserialized = serde_json::to_string(&deserialized).unwrap();
        assert!(!reserialized.contains("categoryId"));
    }

    #[test]
    fn mcpmetadata_with_category_id_roundtrip() {
        let metadata = McpMetadata {
            category: "Tools".to_string(),
            category_id: Some("tools-cat-id".to_string()),
            tags: vec![],
            enabled: true,
            usage_count: 0,
            last_used: None,
            scope: "global".to_string(),
        };
        let json = serde_json::to_string(&metadata).unwrap();
        assert!(json.contains("\"categoryId\":\"tools-cat-id\""));
        let deserialized: McpMetadata = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.category_id, Some("tools-cat-id".to_string()));
    }

    #[test]
    fn appdata_without_migration_flag_defaults_to_false() {
        // Critical backward compat: old data.json has NO
        // `hasCompletedCategoryIdMigration` key. Per 03 V2 §3.5 [P0-DATA-1],
        // the field is `bool` with `#[serde(default)]` — missing key MUST
        // deserialise to `false`, which is the signal that triggers a
        // one-time migration on next startup.
        let legacy_json = r#"{
            "categories":[],
            "tags":[],
            "scenes":[],
            "projects":[],
            "skillMetadata":{},
            "mcpMetadata":{}
        }"#;
        let deserialized: AppData = serde_json::from_str(legacy_json).unwrap();
        assert!(!deserialized.has_completed_category_id_migration);
        // Sanity-check the other defaults still kick in (no regression to
        // the existing serde(default) annotations).
        assert!(deserialized.trashed_scenes.is_empty());
        assert!(deserialized.imported_plugin_skills.is_empty());
        assert!(deserialized.claude_md_files.is_empty());
        assert!(deserialized.global_claude_md_id.is_none());
    }

    #[test]
    fn appdata_with_migration_flag_true_roundtrip() {
        // After a successful migration the flag is true and the key is
        // emitted. Re-deserialise must observe true so the next launch
        // skips migration.
        let mut data = AppData::default();
        data.has_completed_category_id_migration = true;
        let json = serde_json::to_string(&data).unwrap();
        assert!(json.contains("\"hasCompletedCategoryIdMigration\":true"));
        let deserialized: AppData = serde_json::from_str(&json).unwrap();
        assert!(deserialized.has_completed_category_id_migration);
    }
}
