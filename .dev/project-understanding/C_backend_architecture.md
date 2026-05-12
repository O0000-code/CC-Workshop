# C. Rust 后端架构

> 来源：Explore Sonnet SubAgent C（2026-05-12）
> 覆盖：架构图 / 依赖 / IPC commands / 数据模型 / 持久化 / 外部集成 / 关键模式 / 测试 / 复杂度热点

## 1. 架构总览

```
Frontend (React/TS)
    │  invoke("command_name", { ...args })
    ▼
Tauri IPC Bridge (tauri::generate_handler![...] in lib.rs)
    │
    ├── commands/skills.rs       ← scan / get / update_metadata / delete
    ├── commands/mcps.rs         ← scan / get / update_metadata / delete / fetch_tools
    ├── commands/claude_md.rs    ← scan / import / read / update / delete / distribute
    ├── commands/config.rs       ← write_mcp_config / sync / clear project
    ├── commands/data.rs         ← AppData / AppSettings CRUD (categories/tags/scenes/projects)
    ├── commands/classify.rs     ← auto_classify → `claude -p` CLI subprocess
    ├── commands/import.rs       ← detect / backup / import from ~/.claude/ + ~/.claude.json
    ├── commands/plugins.rs      ← detect / import Claude Code plugins
    ├── commands/marketplace.rs  ← skills.sh API + MCP Registry + codeload install
    ├── commands/trash.rs        ← list / restore from ~/.ensemble/trash/
    ├── commands/symlink.rs      ← create / remove / is / get_target
    ├── commands/dialog.rs       ← select_folder / select_file / reveal_in_finder
    ├── commands/usage.rs        ← scan Claude Code transcripts for usage stats
    │
    ├── Filesystem: ~/.ensemble/   ← data.json + settings.json + skills/ + mcps/
    │       └── claude-md/ + trash/ + marketplace-cache/
    │
    ├── External Read: ~/.claude/
    │       ├── settings.json (enabledPlugins)
    │       ├── skills/ (detect/import)
    │       ├── plugins/{marketplace}/{plugin}/{version}/skills/
    │       └── CLAUDE.md
    │
    ├── External R/W: ~/.claude.json (MCP config: user + per-project)
    │
    └── External HTTP:
            ├── skills.sh internal API   (api/skills/{view}/{page})
            ├── skills.sh search         (api/search?q=...)
            ├── raw.githubusercontent.com (README on demand)
            ├── codeload.github.com      (tarball install)
            └── registry.modelcontextprotocol.io/v0.1/servers
```

## 2. Cargo 依赖与能力地图

`src-tauri/Cargo.toml`（`version = "1.0.0"`, `rust-version = "1.77.2"`）:

| 依赖 | 版本 | 能力 |
|---|---|---|
| `tauri` | 2.9.5 | IPC / 窗口 / 单实例插件 |
| `tauri-plugin-shell` | 2 | `shell::open`（PATH 继承用于 classify） |
| `tauri-plugin-dialog` | 2 | 文件选择对话框 |
| `tauri-plugin-single-instance` | 2 | 防多实例，转发 `--launch <path>` |
| `tauri-plugin-log` | 2 | debug 日志 |
| `serde` / `serde_json` | 1.0 | IPC 序列化 + data.json/settings.json 读写 |
| `tokio` | 1（process/io-util/time/sync/rt） | 异步 commands + `timeout` 包装 |
| `reqwest` | 0.12（json/gzip） | marketplace HTTP 客户端；15s 超时；gzip（skills.sh 强制） |
| `dirs` | 5 | home_dir() → ~/.ensemble/ / ~/.claude/ / ~/.claude.json |
| `walkdir` | 2 | MCPs 目录扫描 + CLAUDE.md 扫描 |
| `uuid` | 1（v4） | AppData 实体 ID |
| `chrono` | 0.4 | UTC 时间戳 |
| `regex` | 1 | trash 文件名解析 + topic HTML scrape |
| `flate2` + `tar` | 1 / 0.4 | codeload tarball 解包 |
| `urlencoding` | 2.1 | skills.sh search query |
| `log` | 0.4 | 结构化日志 |
| `tempfile` | 3（dev-only） | 测试临时目录 |

## 3. IPC Commands 完整清单（~90 个）

`lib.rs:72-192` 的 `invoke_handler!` 注册：

### Skills（4）
`scan_skills`, `get_skill`, `update_skill_metadata`, `delete_skill`

### MCPs（5）
`scan_mcps`, `get_mcp`, `update_mcp_metadata`, `delete_mcp`, `fetch_mcp_tools`（异步 JSON-RPC over stdio）

### Symlink（6）
`create_symlink`, `remove_symlink`, `is_symlink`, `get_symlink_target`, `create_symlinks`, `remove_symlinks`

### Config（4）
`write_mcp_config`, `sync_project_config`, `clear_project_config`, `get_project_config_status`

### Data（17 核心 CRUD）
`read_app_data` / `write_app_data` / `read_settings` / `write_settings` / `init_app_data`
+ Categories（`get / add / update / delete / reorder / set_parent / migrate_category_id_for_skills_mcps`）
+ Tags（`get / add / update / delete / reorder / reset_auto_classify_data`）
+ Scenes（`get / add / update / delete`）
+ Projects（`get / add / update / delete`）

### Dialog（4）
`select_folder`, `select_file`, `reveal_in_finder`, `bring_window_to_front`

### Classify（1）
`auto_classify(items, existing_categories, existing_tags, available_icons)` — 调 `claude -p` CLI

### Import（12）
`detect_existing_config`, `backup_before_import`, `backup_claude_json`, `import_existing_config`, `update_skill_scope`, `update_mcp_scope`, `remove_imported_skills`, `remove_imported_mcps`, `install_quick_action`, `launch_claude_for_folder`, `get_launch_args`, `open_accessibility_settings`

### Usage（1）
`scan_usage_stats(claude_dir)` — 解析 `~/.claude/projects/` transcript JSON

### Plugins（6）
`detect_installed_plugins`, `detect_plugin_skills`, `detect_plugin_mcps`, `import_plugin_skills`, `import_plugin_mcps`, `check_plugins_enabled`

### CLAUDE.md（10）
`scan_claude_md_files`, `import_claude_md`, `read_claude_md`, `get_claude_md_files`, `update_claude_md`, `delete_claude_md`, `set_global_claude_md`, `unset_global_claude_md`, `distribute_claude_md`, `distribute_scene_claude_md`

### Trash（4）
`list_trashed_items`, `restore_skill`, `restore_mcp`, `restore_claude_md`

### Marketplace（15）
`list_marketplace_skills(view, page)`（200/page），`search_marketplace_skills(query)`, `get_marketplace_skill_readme`, `get_marketplace_mcp_readme`, `get_marketplace_repo_stars`, `get_marketplace_skill_summary`, `list_skill_topics_map`（24h 文件缓存）, `list_marketplace_mcps_page(cursor?, limit?)`（96/page）, `list_recently_updated_mcps`, `search_marketplace_mcps`, `install_marketplace_skill(item, conflict_action)`（codeload tarball）, `install_marketplace_mcp`, `auto_classify_marketplace_item`, `refresh_marketplace_cache`, `update_mcp_env_vars`

## 4. 数据模型清单（types.rs 1822 行）

### 核心 runtime 对象（不直接持久化）

**`Skill`**（`types.rs:6-59`）
- `id == source_path`（绝对路径，不变量）
- `category` (名称) + `category_id` (UUID, V2 新增)
- `tags`, `enabled`, `scope`（`user` | `project`）
- `install_source`：`local` | `plugin` | `marketplace`
- `marketplace_source: Option<MarketplaceSource>` — 上游溯源三元组

**`McpServer`**（`types.rs:63-123`）
- `command/args/env`（stdio）or `url/mcp_type`（HTTP）
- `provided_tools: Vec<Tool>`
- `required_env_vars: Option<Vec<EnvVarSpec>>`

### 持久化实体（data.json）

**`AppData`**（`types.rs:208-256`）— data.json 根
- `categories`, `tags`, `scenes`, `projects`
- `skill_metadata: HashMap<String, SkillMetadata>`（key = 绝对路径 = skill id）
- `mcp_metadata: HashMap<String, McpMetadata>`
- `trashed_scenes/trashed_projects`
- `claude_md_files`, `global_claude_md_id: Option<String>`
- `has_completed_category_id_migration: bool`
- `last_edited_scene_id: Option<String>` — marketplace "Add to active Scene"
- `imported_marketplace_skills: Vec<String>` — 安装历史 triple-hash

**`Category`**（`types.rs:185-198`）— `parent_id: Option<String>`，max depth = 2

**`Scene`**（`types.rs:132-146`）— `skill_ids` / `mcp_ids` / `claude_md_ids`

**`Project`** — `scene_id` + `path`

**`SkillMetadata` / `McpMetadata`**（`types.rs:258-318`）— `install_source` / `marketplace_source` / `required_env_vars` 等溯源字段

**`AppSettings`**（`types.rs:357-416`）— settings.json 根
- `anthropic_api_key: Option<String>` — 遗留字段（classify 改用 CLI）
- `classify_model: String`（默认 `"opus"`）
- `terminal_app`, `claude_command`, `warp_open_mode`, `claude_md_distribution_path`

### 外部文件结构体

**`ClaudeJson`**（`types.rs:578-590`）— ~/.claude.json
- `mcp_servers: HashMap<String, ClaudeMcpConfig>` (user)
- `projects: HashMap<String, ClaudeProjectConfig>` (per-project)
- `#[serde(flatten)] other: HashMap<String, Value>` — **保留其他字段（`numStartups`、`theme`），防止写回丢失**

### Marketplace 类型

**`MarketplaceSource`**（`types.rs:1072-1099`）— 溯源六元组：source/owner/repo/name/repo_subpath/last_synced_at

**`MarketplaceSkillItem`**（`types.rs:1117-1198`）— V2 字段 `source/skill_id/installs/is_official/installs_yesterday/change`

## 5. 持久化机制

### 目录结构

```
~/.ensemble/
├── data.json                ← AppData（categories/tags/scenes/projects/metadata/claude_md）
├── settings.json            ← AppSettings
├── skills/                  ← managed skill 目录
├── mcps/                    ← managed MCP .json
├── claude-md/{uuid}/CLAUDE.md  ← 2026-05 迁移后从 data.json 剥离
├── trash/{skills,mcps,claude-md}/
└── marketplace-cache/skills-topics.json  ← 24h TTL
```

### DATA_MUTEX 锁保护

`data.rs:20`：`pub static DATA_MUTEX: Mutex<()> = Mutex::new(());`

所有 read-modify-write 路径在最外层 acquire。**纯读操作不加锁**。

覆盖的 mutator 包括：`add/update/delete_category`, `set_category_parent`, `add/update/delete/reorder_tag`, `add/update/delete_scene`, `add/update/delete_project`, `update_skill_metadata`, `update_mcp_metadata`, `delete_skill`/`delete_mcp`（metadata 清理段）, `install_marketplace_skill/mcp`（metadata 写入段）, `auto_classify_marketplace_item`, `reset_auto_classify_data`。

**注意**：DATA_MUTEX 是 `std::sync::Mutex`（非 tokio），在 async command 中 `.lock()` 期间不能 `.await`。现有代码均遵守。

### ENSEMBLE_DATA_DIR 测试隔离

`utils/path.rs:41-61`：`get_app_data_dir()` 优先读 `ENSEMBLE_DATA_DIR` 环境变量。**在 `cfg(test)` 编译时该变量未设置则 `panic!`**（2026-05-04 真实数据损坏事故后引入，对应 `fallback-path-must-be-unreachable-in-test.md` Rule）。

测试用 `ScopedEnv` RAII + `ENV_TEST_LOCK`（全局 Mutex<()>）序列化环境变量访问。

### CLAUDE.md 独立文件迁移

`lib.rs:33` 启动时调 `migrate_claude_md_storage()`。旧格式 content 内嵌于 `data.json::claude_md_files[].content`；新格式 content 在 `~/.ensemble/claude-md/{id}/CLAUDE.md`。

## 6. 外部集成点

### ~/.claude/（读）

- `settings.json` — `enabledPlugins` 字段
- `skills/` — `detect_existing_config` 扫描（含 symlink 解析）
- `CLAUDE.md` — `set_global_claude_md` 写入

### ~/.claude.json（读写）

- 读：解析 `mcpServers`（user）+ `projects.{path}.mcpServers`（local）
- 写：使用 `#[serde(flatten)]` **保留所有非 MCP 字段**

### ~/.claude/plugins/（读）

- `installed_plugins.json`
- `plugins/cache/{marketplace}/{plugin_name}/{version}/skills/`
- `.mcp.json`, `plugin.json`, `.claude-plugin/`
- Plugin ID 格式：`"{plugin_name}@{marketplace}"`

### Marketplace 源（HTTP，异步 reqwest）

**Skills（skills.sh internal API，2026-05-10 V2 迁移）：**
- 列表：`GET https://skills.sh/api/skills/{view}/{page}`（200/page，~91k 总量）
- 搜索：`GET https://skills.sh/api/search?q=...`
- **必须携带浏览器指纹 headers**（`Origin` / `Referer` / `Sec-Fetch-Mode`），UA 伪装 Mac Safari（`marketplace.rs:151`）
- README：`GET https://raw.githubusercontent.com/{owner}/{repo}/HEAD/{skill_id}/SKILL.md`
- 安装：`GET https://codeload.github.com/{owner}/{repo}/tar.gz/HEAD`，**无 GitHub API rate limit**；`flate2` + `tar` 解包，`sanitize_resource_name` 防 path traversal

**MCP（MCP Registry，2026-05-11 V2）：**
- `GET registry.modelcontextprotocol.io/v0.1/servers?limit=96&version=latest[&cursor=...]`
- V1 单次 GET + 24h 文件缓存（`mcps-catalog-v2.json`）已废弃，启动时自动清理（`lib.rs:43`）

### auto_classify：Claude Code CLI

`classify.rs:281-293`：
```
Command::new("claude")
    .arg("-p").arg(&prompt)
    .arg("--output-format").arg("json")
    .arg("--json-schema").arg(schema.to_string())
    .arg("--dangerously-skip-permissions")
    .arg("--model").arg(&model)
```
- 使用同步 `std::process::Command`（命令的 async 签名是 Tauri 要求的）
- 解析 `response.structured_output.classifications`
- 不再用 Anthropic HTTP API（`validate_api_key` 标 `#[allow(dead_code)]`）

## 7. 关键模式与陷阱

### serde 处理模式

1. **三态 `Option<Option<String>>`**（`skills.rs:85-89`）：JS undefined → 外层 None（不改）；JS null → Some(None)（清空）；JS "id" → Some(Some("id"))（设值）
2. **`#[serde(default, skip_serializing_if = "Option::is_none")]`**：新增字段保证旧 data.json 仍可反序列化
3. **`#[serde(flatten)]` 在 ClaudeJson/ClaudeSettings**：保留所有未知字段，防止写回丢失 Claude Code 自身配置
4. **`#[serde(rename_all = "camelCase")]`**：所有 IPC 边界 struct 统一，TypeScript 对齐

### HTTP MCP vs stdio MCP

`McpConfigFile.mcp_type: Option<String>`（`"stdio"` | `"http"`）。`config.rs:25-39`：写入 `.mcp.json` 时 HTTP 用 `url`，stdio 用 `command + args`。`fetch_mcp_tools` 仅对 stdio MCP 有意义。

### fetch_mcp_tools JSON-RPC over stdio

`mcps.rs:235-440`：完整 MCP 协议握手（`initialize` → `notifications/initialized` → `tools/list`），`tokio::time::timeout` 包裹，默认 15s，`kill_on_drop(true)`。newline-delimited JSON。

### Marketplace skill 安装的 path traversal 防御

`marketplace.rs:178-208`：`sanitize_resource_name` 拒绝 `..`、`.` 开头、路径分隔符、非 ASCII 字母数字。三个来源（SKILL.md frontmatter name / H1 fallback / codeload tarball entry）均过此关。

### `scan_skills` 用 `fs::read_dir` 而非 WalkDir

`skills.rs:23-51`：`WalkDir(max_depth=2)` 会把 skill 目录和 `SKILL.md` 文件都作为 entry 处理，导致每个 skill 添加两次。`fs::read_dir` + 手动检查 `SKILL.md` 是正确实现。MCPs 模块用 WalkDir 是因为 MCP 是扁平 `.json`。

## 8. 测试覆盖

| 文件 | 测试模块 | 覆盖 |
|---|---|---|
| `utils/path.rs:133-303` | `tests` | expand_path / collapse_tilde / get_app_data_dir / ScopedEnv / **panic-without-env 回归测试** |
| `utils/parser.rs:137-273` | `tests` | parse_skill_md / parse_mcp_json / extract_skill_body |
| `commands/data.rs:1171-1251` | `apply_reorder_tests` | Category/Tag 重排序 |
| `commands/data.rs:1253-~1600` | `hierarchy_validator_tests` | 6 条 validate_hierarchy 规则 |
| `commands/data.rs:1645+` | `reorder_integration_tests` | 持久化集成（ENV_TEST_LOCK + tempdir） |
| `commands/trash.rs:452+` | 小测试 | 时间戳解析 |
| `commands/marketplace.rs:3260+` | 轻量单测 | sanitize_resource_name 边界 |
| `commands/import.rs:1755+` | 小测试 | 内部 helper |
| `commands/plugins.rs:895+` | 小测试 | plugin ID 解析 |
| `commands/usage.rs:296+` | 小测试 | transcript 解析 |

测试隔离：`ScopedEnv` RAII + `ENV_TEST_LOCK`，所有磁盘操作必须通过 `ENSEMBLE_DATA_DIR` 重定向。

## 9. 复杂度热点

### 最大文件

| 文件 | 行数 | 复杂度来源 |
|---|---|---|
| `commands/marketplace.rs` | **4011** | 两套 marketplace + codeload + 4 个 in-memory cache（README/stars/summary/topics） + OnceLock HTTP client + scraper + 防 traversal |
| `commands/data.rs` | **3175** | 全量 CRUD + DATA_MUTEX 覆盖 + apply_reorder 泛型 + validate_hierarchy + migration + 5 个 cfg(test) 模块 |
| `commands/import.rs` | **1842** | 多源检测 + symlink 解析 + backup/restore + Quick Action + 多终端 launch |
| `src/types.rs` | **1822** | 所有 IPC 类型 + 大量 serde 兼容注解 + V2 Marketplace |
| `commands/claude_md.rs` | **963** | 文件扫描（深度 10，排除 15 个目录）+ 独立文件存储 + 3 种分发路径 + 冲突解决 |

### 主要风险点

1. **`marketplace.rs` > 4000 行**，4 个独立 in-memory cache（OnceLock<Mutex<HashMap>>），FIFO 64 entries cap。任何 cache miss/race 需在此文件内定位。
2. **skills.sh 依赖浏览器指纹 headers**：如 skills.sh 更新服务器端检测规则，`skills_sh_request()` helper 需同步更新；失败 → 全部 skill 列表 403。
3. **`auto_classify` 依赖 CLI 子进程**：必须 PATH 中找到 `claude`；同步 `std::process::Command` 阻塞 Tokio worker，大批量分类有 executor 饥饿风险。
4. **DATA_MUTEX 是 std::sync::Mutex**：在 async 中 lock 期间不能 await；新增异步逻辑需注意。
5. **category.count 维护**：删除 skill/mcp 时通过 scan 重算，而非 `delete_category` 时级联——已知最终一致性弱点。

### 最近高频改动

前 20 commit 全集中在 marketplace（2026-05-10~05-12）：
- `feat(marketplace): Phase 2 mirror — AI Summary + Related skills`
- `feat(marketplace): real MCP Registry mirror with cursor pagination`
- `feat(marketplace): real skills.sh mirror via internal API`
- `feat(sidebar): hierarchical (depth-2) Categories with drop-into nesting`
- `fix(test-isolation): refuse to fall back to ~/.ensemble/ during cargo test`
