# Rule 管理 — V1 设计

## 目标

增加 Rule 作为可管理对象(对应 Claude Code 的 `.claude/rules/*.md`),与 CLAUDE.md **同骨架**。≥ 90% 代码 1:1 镜像 `commands/claude_md.rs` 及其前端组件,只在 6 处按 Rule 特性偏离。

## Rule 的定位

Claude Code 的模块化、主题专项行为指令文件。Claude Code 在 `~/.claude/rules/`(全局)和 `<project>/.claude/rules/`(项目)递归扫描;无 frontmatter 默认无条件加载,有 `paths:` frontmatter 则按 glob 条件加载。V1 **不**解析 frontmatter,整内容当作 markdown 渲染。

实地采样(2026-05-14):user `~/.claude/rules/` 11 个文件,项目 `.claude/rules/` 12 个文件,共 23 个,386 B – 16 KB,无子目录、无 symlink,23 个里只有 1 个有 frontmatter(字段 `globs:`,不是 `paths:`)。

## 与 CLAUDE.md 的 6 处偏离(必须实现)

| # | CLAUDE.md | Rule | 偏离理由 |
|---|---|---|---|
| 1 | Scene 单选(`claudeMdIds.length ≤ 1`)| **多选** `Scene.rule_ids: Vec<String>` | Rule 设计本身就是模块化组合,Scene 勾多个是基本用法 |
| 2 | 全局单一 `AppData.global_claude_md_id: Option<String>` | **每条独立** `Rule.is_global: bool`;AppData **不**新增 `global_rule_id` | `~/.claude/rules/` 天然多文件目录 |
| 3 | filename 固定 magic name | **持久 `Rule.filename: String`**;UI `name` 与 filename 解耦,name 可改,filename 不可改 | Claude Code 按 filename 索引 Rule;原始文件名必须保留作为部署用 |
| 4 | 部署路径用户三选一 | **固定** `<project>/.claude/rules/<filename>.md`,无 distributionPath setting | Claude Code 只在该目录扫描 |
| 5 | `source_type: Global/Project/Local` enum | **不要 source_type enum** | Rule 没有 `.local.md` 这种变体;UI 不展示来源类型徽章 |
| 6 | distribute 单文件(claudeMdIds 实质单条) | **真批量** `distribute_scene_rules` 循环写 N 个 .md | rule_ids 多条 → 写多个文件 |

## 数据模型

### Rust(types.rs 新增,镜像 ClaudeMd 区域)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub id: String,                       // UUID
    pub name: String,                     // 显示名(可改)
    pub description: String,
    pub filename: String,                 // e.g. "validate-no-public-api-claim.md"(不可改)
    pub source_path: String,
    #[serde(default)]
    pub content: String,                  // 运行时填充,序列化为空
    #[serde(skip_serializing_if = "Option::is_none")]
    pub managed_path: Option<String>,
    pub is_global: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
    #[serde(default)]
    pub tag_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub size: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

pub struct RuleScanItem { /* 镜像 ClaudeMdScanItem,去掉 file_type/project_name 中的 file_type;sourceScope: "user"|"project" */ }
pub struct RuleScanResult { items, scanned_dirs, duration, errors }
pub struct RuleImportOptions { source_path, name?, description?, category_id?, tag_ids }
pub struct RuleImportResult { success, file: Option<Rule>, error: Option<String> }
pub struct RuleDistributionOptions { rule_id, project_path, conflict_resolution }
pub struct RuleDistributionResult { success, target_path, action, backup_path, error }
pub struct SetGlobalRuleResult { success, backup_path: Option<String>, auto_imported_id: Option<String>, error }
pub struct TrashedRule { id, name, filename, path, deleted_at, description }

// Scene 扩展(types.rs)
pub struct Scene {
    ...,
    #[serde(default)]
    pub rule_ids: Vec<String>,
}
// TrashedScene 同步扩展

// AppData 扩展
pub struct AppData {
    ...,
    #[serde(default)]
    pub rules: Vec<Rule>,
    // 不需要 global_rule_id —— 直接 rules.iter().filter(is_global)
}
```

### TS(`src/types/rule.ts` 新增,镜像 claudeMd.ts)

`Rule`、`RuleScanItem`、`RuleScanResult`、`RuleImportOptions`、`RuleImportResult`、`RuleDistributionOptions`、`RuleDistributionResult`、`SetGlobalRuleResult` —— camelCase,全部对应 Rust 类型。

`src/types/index.ts` 中 `Scene` 接口加 `ruleIds?: string[]`,re-export `./rule`。

## 文件系统

- 内容存储:`~/.ensemble/rules/{uuid}/<filename>.md`(独立文件,data.json 只存元数据)
- Set Global 目标:`~/.claude/rules/<filename>.md`(若 unmanaged 同名存在 → 自动导入备份为 "Original" + 写到 `~/.ensemble/rules/global-backup/<filename>.YYYYMMDD_HHMMSS.backup`,沿用 CLAUDE.md 模式)
- Project 部署目标:`<project>/.claude/rules/<filename>.md`(**copy**,不 symlink)
- 软删除:`~/.ensemble/trash/rules/{uuid}_{timestamp}/`(包含 `<filename>.md` + `info.json`)
- Global backup 目录:`~/.ensemble/rules/global-backup/`

## 扫描默认范围

- `~/.claude/rules/` 递归(user global 全集)
- Default project dirs(`~/Documents`、`~/Projects`、`~/Developer`、`~/Code`、`~/Workspace`、`~/repos`)下深度扫描,识别 `<dir>/.claude/rules/**/*.md`
- 排除目录沿用 CLAUDE.md 的 `EXCLUDED_DIRS`
- 已导入项的去重:按 `Rule.source_path` 命中

## 部署机制

- **Copy**(同 CLAUDE.md)。Sync 是显式快照。
- 冲突策略:`distribute_scene_rules` 内固定使用 `backup`(同 CLAUDE.md sync)
- `clear_project_config` 扩展:遍历 `data.json::rules`,取所有 `filename` 集合,对 `<project>/.claude/rules/` 下命中该集合的 `.md` 文件逐个删除。**不**整目录清空(避免误删用户手写文件)
- `sync_project_config` 不调用 distribute(由前端 `projectsStore.syncProject` 在 sync 之后另外调 `distribute_scene_rules`,与 CLAUDE.md 部署链路并列)

## 后端 Commands(`rules.rs`,镜像 `claude_md.rs`)

| 命令 | 职责 |
|---|---|
| `scan_rules(scan_paths?, include_home?)` | 扫描 user + project 默认目录的 `.claude/rules/*.md` |
| `import_rule(options)` | 复制内容到 `~/.ensemble/rules/{id}/<filename>.md` + 写 metadata |
| `read_rule(id)` | 从独立文件读 content |
| `get_rules()` | 批量读 + content 填充 |
| `update_rule(id, content?, name?, description?, category_id?, tag_ids?, icon?)` | **不允许改 filename** |
| `delete_rule(id)` | 软删除 + 清 `scene.rule_ids` 引用 + 若 is_global 删除 `~/.claude/rules/<filename>.md` |
| `set_global_rule(id)` | 写 `~/.claude/rules/<filename>.md`;若 unmanaged 同名存在自动导入为 "Original" + backup |
| `unset_global_rule(id)` | 删 `~/.claude/rules/<filename>.md` + 该 Rule 的 `is_global = false` |
| `distribute_rule(options)` | 单条复制到 project,冲突 backup |
| `distribute_scene_rules(rule_ids, project_path, conflict_resolution)` | 批量 |
| `restore_rule(trash_path)` | 在 `trash.rs`,镜像 `restore_claude_md` |

`lib.rs` 注册所有上述 commands。

## 与其他领域的集成

| 领域 | 修改 |
|---|---|
| **`config.rs::clear_project_config`** | 加清理 `.claude/rules/` 下 ensemble-managed filename 的逻辑 |
| **`trash.rs`** | 加 `restore_rule` + `TrashedRule` 列入 `list_trashed_items` |
| **路由 + Sidebar** | App.tsx 加 `/rules` 路由;MainLayout 加 Rules 入口(放 CLAUDE.md 下方一行)+ 计数 |
| **`scenesStore` + CreateSceneModal** | 加 Rules tab(多选 checkbox)、`toggleRuleSelection`、`getAvailableRules` |
| **`projectsStore.syncProject`** | sync_project_config 之后增加 `if scene.ruleIds?.length > 0 → distribute_scene_rules(ruleIds, projectPath, 'backup')` |
| **`CategoryPage` / `TagPage`** | 加 rules 列表分组(与 Skills / MCPs / CLAUDE.md 并列)|
| **`ProjectConfigPanel` / `ScenesPage`** | 显示 rule 数(可选 V1 不做)|

## 执行 Phase

| Phase | 范围 | 验证标准 |
|---|---|---|
| **1** | Rust 后端全部 + 前端类型 + Scene/AppData/Trash 扩展 + clear_project_config 扩展 | `cd src-tauri && cargo check` 通过;`npx tsc --noEmit` 通过(前端类型) |
| **2** | 前端 rulesStore + UI 组件(RulesPage / RuleCard / RuleDetailPanel / ImportRuleModal / ScanRuleModal)+ 路由 + Sidebar + CategoryPage/TagPage + Scene/Project 集成 | `npm run tauri build` 不报错 |
