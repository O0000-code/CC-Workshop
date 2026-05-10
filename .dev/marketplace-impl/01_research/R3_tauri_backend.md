# R3 — Tauri Backend / 数据层 / IPC 调研

> **Scope**:Marketplace 实施所需的 Rust 后端 / 数据层 / IPC 现状,事实陈述,不写实施方案。
> **Source verification**:每条事实带 `file:line` 引用;`grep-before-enumerate` Rule 的 `read_app_data|write_app_data` 全 callsite + 防御性 grep 已执行(§4)。
> **Baseline note**:`src-tauri/src/commands/classify.rs` 已有未提交改动(+70 行,depth-2 重构 / `ExistingCategory.parent_name` / `ClassifyResult.suggested_parent_category`);本调研基于工作树当前内容。

---

## 0. TL;DR — 下游必看 5 条事实

1. **三态扩展点最少 8 处**:Skill / McpServer / McpConfigFile struct 上 `install_source: Option<String>` 注释为 `"local" | "plugin"`(types.rs:34 / 81 / 347);scan_skills 在 skills.rs:206-218 二选一构造,plugins.rs 安装时硬编码 `"plugin"` (plugins.rs:844);**前端排序在 stores 层硬编码 `=== 'plugin'`**(`skillsStore.ts:471-472` / `mcpsStore.ts:505-506`),不受后端控制 — Marketplace 资源若想"不沉底"只需把第三态 `'marketplace'` 不当 plugin 就够,后端 scan 路径不需要改沉底逻辑。
2. **`read_app_data|write_app_data` 全 callsite 共 7 文件 16 个写点 / 11 个读点已被 DATA_MUTEX 覆盖**(详 §4)。**新 Marketplace 安装命令必须遵循同一锁契约**:外层取 `DATA_MUTEX` → `read_app_data` → mutate → `write_app_data`;还有 4 个 bypass 通道(`load_skill_metadata` / `load_mcp_metadata` 的纯读 + `update_*_scope_in_metadata` 的低级别 helper)是已记录的 graph-shape 入口。
3. **R-1 同名碰撞短路** = `import.rs:621`(`copy_skill`)、`import.rs:665`(`extract_mcp_config`)、`plugins.rs:722`(`import_plugin_skills`)、`plugins.rs:825`(`import_plugin_mcps`)四处都用 `dest_path.exists()` 直接 `return Err`/`continue` — 这是 PRD §7.4 SSoT 契约里点名要绕过的逻辑。Marketplace 安装命令必须**不复用** `copy_skill` 而走自己的"三选项 confirm"分支。
4. **`autoClassifyNewItems` flag 端到端不通**:Rust 仅在 `types.rs:291`/`317`/`995` 默认 `false`,**没有任何代码消费它**(整个 src-tauri 内除定义外零引用)。前端 `settingsStore.ts:28/77/119/171/204` 已读写但未驱动行为。Marketplace V1 启用此 flag = 接通从 `read_settings` → 安装命令分支 → `auto_classify`(单元素 `Vec<ClassifyItem>`)的链路。
5. **HTTP 客户端可用,异步运行时已就绪**:`reqwest 0.12.28`(Cargo.toml:32,native-tls/Apple SecureTransport)+ `tokio 1`(features `process, io-util, time`,Cargo.toml:35) — marketplace 拉取直接复用,**不需要新增依赖**;但当前仅 `classify.rs:314` 一处 dead-code 用 reqwest,所以 client 重用 / 全局 instance / cache 落盘是实施侧首次决策。

---

## 1. 现有依赖与 HTTP 客户端缺口

`src-tauri/Cargo.toml:20-39` 完整列表:

| crate | 版本 / features | 调研结论 |
|---|---|---|
| `serde_json` | 1.0 | 充分 |
| `serde` | 1.0 derive | 充分 |
| `tauri` | 2.9.5 | OK |
| `tauri-plugin-{log,dialog,shell,single-instance}` | 2 | OK |
| `uuid` | 1 v4 | OK(marketplace cache key 可复用 v4) |
| `chrono` | 0.4 serde | OK(24h TTL 时间戳依赖 RFC3339) |
| `dirs` | 5 | OK(home dir) |
| `walkdir` | 2 | OK |
| **`reqwest`** | **0.12 features=["json"]** | **已存在**;native-tls(transitive `native-tls 0.2.14`)。macOS 上走 Apple SecureTransport,Marketplace HTTP 可直接用。**实施期是否切到 `rustls-tls` 是次要决策**(PRD 没要求 Linux,V1 不必动)|
| `tauri-plugin-single-instance` | 2 | OK |
| `urlencoding` | 2.1 | OK(URL 拼接) |
| **`tokio`** | **1 features=["process","io-util","time"]** | **已存在**;Marketplace 异步拉取若要 `tokio::sync::Mutex` 需要再加 `sync` feature(目前未启用)。`time` 已有,可做 24h TTL `Duration` 比对 |
| `regex` | 1 | OK |

**dev-dependencies**:`tempfile 3` (Cargo.toml:39)。

**结论**:**marketplace 拉取 HTTP 不需要任何新 crate**。仅当实施需要在 Rust 端做并发安全的内存缓存(而不是文件 cache)时,可能需要给 `tokio` 加 `sync` feature。

**注意**:reqwest 当前**只在一个 dead-code 路径中用过**(classify.rs:314 `validate_api_key`,被标 `#[allow(dead_code)]`)。Marketplace 是 Rust 端首次主路径使用 reqwest 的特性 — `Client::new()` 单例 / 全局 reuse / `User-Agent` 头部 / 超时配置都是实施侧首次决策点,**没有现成模式可抄**。

---

## 2. IPC 命令清单(`generate_handler!`,按 domain 分组)

来源:`src-tauri/src/lib.rs:66-165`。

### 2.1 Skills(skills.rs)
- `skills::scan_skills` — `lib.rs:68` / `skills.rs:10`
- `skills::get_skill` — `lib.rs:69` / `skills.rs:55`
- `skills::update_skill_metadata` — `lib.rs:70` / `skills.rs:86`
- `skills::delete_skill` — `lib.rs:71` / `skills.rs:265`(soft delete → trash)

### 2.2 MCPs(mcps.rs)
- `mcps::scan_mcps` — `lib.rs:73` / `mcps.rs:14`
- `mcps::get_mcp` — `lib.rs:74` / `mcps.rs:45`
- `mcps::update_mcp_metadata` — `lib.rs:75` / `mcps.rs:75`
- `mcps::delete_mcp` — `lib.rs:76` / `mcps.rs:431`(soft delete → trash)
- `mcps::fetch_mcp_tools` — `lib.rs:77` / `mcps.rs:229`(JSON-RPC 子进程 spawn)

### 2.3 Symlink(symlink.rs)
- `symlink::create_symlink` / `remove_symlink` / `is_symlink` / `get_symlink_target` / `create_symlinks` / `remove_symlinks` — `lib.rs:79-84`

### 2.4 Project Sync(config.rs)
- `config::write_mcp_config` — `lib.rs:86` / `config.rs:10`
- `config::sync_project_config` — `lib.rs:87` / `config.rs:65`(写 `.mcp.json` + symlink skills)
- `config::clear_project_config` — `lib.rs:88` / `config.rs:111`
- `config::get_project_config_status` — `lib.rs:89` / `config.rs:174`

### 2.5 Data / data.json(data.rs;`lib.rs:91-119`)
- 核心:`read_app_data` / `write_app_data`(data.rs:243 / 257)、`read_settings` / `write_settings`(data.rs:273 / 287)、`init_app_data`(data.rs:303,创建 `~/.ensemble/{skills,mcps,data.json,settings.json}`)
- Categories(7 个):`get/add/update/delete/reorder_categories`、`set_category_parent`、`migrate_category_id_for_skills_mcps`
- Tags(5 个):`get/add/update/delete/reorder_tags`
- Scenes(4 个):`get/add/update/delete_scene`
- Projects(4 个):`get/add/update/delete_project`

### 2.6 Dialog(dialog.rs;`lib.rs:121-124`)
`select_folder` / `select_file` / `reveal_in_finder` / `bring_window_to_front`

### 2.7 Classify(classify.rs;`lib.rs:126`)
`auto_classify` — classify.rs:194,签名详 §8

### 2.8 Import(import.rs;`lib.rs:128-139`)
`detect_existing_config`(import.rs:87)、`backup_before_import` / `backup_claude_json`、`import_existing_config`(import.rs:527)、`update_skill_scope` / `update_mcp_scope`、`remove_imported_skills` / `remove_imported_mcps`、`install_quick_action` / `launch_claude_for_folder` / `get_launch_args` / `open_accessibility_settings`

### 2.9 Usage(usage.rs;`lib.rs:141`)
`scan_usage_stats`

### 2.10 Plugin(plugins.rs;`lib.rs:143-148`)
`detect_installed_plugins` / `detect_plugin_skills` / `detect_plugin_mcps` / `import_plugin_skills` / `import_plugin_mcps` / `check_plugins_enabled`

### 2.11 CLAUDE.md(claude_md.rs;`lib.rs:150-159`)
`scan_claude_md_files` / `import_claude_md` / `read_claude_md` / `get_claude_md_files` / `update_claude_md` / `delete_claude_md` / `set_global_claude_md` / `unset_global_claude_md` / `distribute_claude_md` / `distribute_scene_claude_md`

### 2.12 Trash(trash.rs;`lib.rs:161-164`)
`list_trashed_items` / `restore_skill` / `restore_mcp` / `restore_claude_md`

**Marketplace 新增命令命名空间预占**:推荐 `marketplace::*`(新文件 `src-tauri/src/commands/marketplace.rs`),预期至少 6 个新命令 — 详 §12。

---

## 3. Skill / McpServer / AppData 类型现状

### 3.1 `Skill` struct(types.rs:6-43)

完整字段(camelCase via `#[serde(rename_all = "camelCase")]`):
- `id: String`(= `source_path`,文件系统路径,types.rs:7)
- `name`, `description`, `category` *(name string)*, `category_id: Option<String>`, `tags: Vec<String>`, `enabled: bool`
- `source_path: String`(= 物理路径)
- `scope: String` 注释为 `"user" | "project"`(types.rs:23)
- `invocation: Option<String>`, `allowed_tools: Option<Vec<String>>`, `instructions: String`
- `created_at: String`, `last_used: Option<String>`, `usage_count: u32`, `icon: Option<String>`, `installed_at: Option<String>`
- **Plugin 来源字段**(types.rs:32-43,均 `#[serde(skip_serializing_if = "Option::is_none")]`):
  - `install_source: Option<String>` *注释 "local" | "plugin"* — 这是三态扩展锚点
  - `plugin_id: Option<String>`, `plugin_name: Option<String>`, `marketplace: Option<String>`, `plugin_enabled: Option<bool>`

**Skill 是 runtime-derived,不直接持久化**(types.rs:13-15);`scan_skills` 从 `SkillMetadata`(types.rs:213-228) + 文件系统 fan-in 重建。所以"为 Skill 加 marketplace 字段"=同时加在 `SkillMetadata` 持久层 + `Skill` runtime 层 + 在 `scan_skills` 注入读路径。

### 3.2 `McpServer` struct(types.rs:47-90)
镜像 Skill 字段 + 自己的 MCP 字段(`command`, `args`, `env`, `provided_tools`, `url`, `mcp_type`)。**`url` 与 `mcp_type` 用 `#[serde(skip_serializing_if = "Option::is_none")]` 区分 stdio / HTTP** — 已支持(R3 的 D-12 stdio vs HTTP 双形态全靠这两字段)。Plugin 字段同 Skill。

### 3.3 `McpConfigFile` struct(types.rs:330-354)

**JSON 文件落盘的格式**(写入 `~/.ensemble/mcps/<name>.json`):
- `name`, `description: Option<String>`, `command: String`(`#[serde(default)]` 防止 HTTP MCP 缺失字段),`args`, `env`, `provided_tools`, `url`, `mcp_type` (rename `"type"`)
- Plugin 字段:`install_source`, `plugin_id`, `plugin_name`, `marketplace`(types.rs:346-353)

**关键**:`McpConfigFile` 在 `import.rs:679/704/740`(local import)+ `plugins.rs:832-848`(plugin import)**两处**构造(CLAUDE.md key patterns 段提到的"don't forget"陷阱)。Marketplace 安装将引入**第三处**构造点 — R-57 已登记。

### 3.4 `AppData` schema(types.rs:177-210)

```
categories: Vec<Category>
tags: Vec<Tag>
scenes: Vec<Scene>
projects: Vec<Project>
skill_metadata: HashMap<String, SkillMetadata>     // key = source_path (= Skill.id)
mcp_metadata: HashMap<String, McpMetadata>         // key = source_path
trashed_scenes: Vec<TrashedScene>                  // soft delete in data.json
trashed_projects: Vec<TrashedProject>
imported_plugin_skills: Vec<String>                // pluginId|skillName 三元组(plugins.rs:756 格式)
imported_plugin_mcps: Vec<String>
claude_md_files: Vec<ClaudeMdFile>
global_claude_md_id: Option<String>
has_completed_category_id_migration: bool          // V1 hierarchy 迁移闸
```

**注意**:`TrashedSkill` / `TrashedMcp` / `TrashedClaudeMd` **不在 AppData 中**(types.rs:917-953)。Skill / MCP / claude_md 的 trash 完全靠**文件系统下的目录扫描**(`~/.ensemble/trash/{skills,mcps,claude-md}/`,trash.rs:116-243),restore 仅 claude_md 写回 data.json(因为 claude_md 持久化在 AppData);skill / mcp restore 仅做 `fs::rename` 不动 data.json。

**这对 SSoT §7.4 的实现意义**:Marketplace `Installed` 状态判定 = (1) `~/.ensemble/skills/<name>/` 路径 + (2) `data.json.skill_metadata[<key>]` 存在 + (3) `~/.ensemble/trash/skills/` 下不存在同名 — 第三个判定靠**文件系统扫描**而非 data.json 查询。这是 V1 实现路径的硬约束。

### 3.5 三态扩展点 grep(完整 callsite)

`install_source` / `installSource` 在 src-tauri 全部出现:
- **类型定义**:`types.rs:34, 81, 347`(Skill / McpServer / McpConfigFile,均 `// "local" | "plugin"`)
- **写入(scan / parse 时填充)**:
  - `skills.rs:206-218`:依据是否是 plugin cache symlink 二选一(`Some("plugin")` 或 `Some("local")`)
  - `skills.rs:238`:写入 Skill struct
  - `mcps.rs:149-153`:`config.install_source.as_deref() == Some("plugin")` 决定 plugin_enabled
  - `mcps.rs:175`:写入 McpServer struct
- **Import 时硬编码 `"local"`**:`import.rs:688, 713, 749`(用户从 `~/.claude/` 导入的所有都标 local)
- **Plugin import 时硬编码 `"plugin"`**:`plugins.rs:844`
- **测试默认 None**:`types.rs:1156, 1223`

`imported_plugin_skills` / `imported_plugin_mcps` 用法:
- `data.rs:349-350`:`init_app_data` 默认空列表
- `plugins.rs:394`/`543`:`detect_plugin_*` 入参用于"已导入"标记
- `plugins.rs:756, 866`:写入格式 = `"{pluginId}|{skillName}"` 三元组字符串

**Marketplace 三态接入需要改动的最小集合**(只列存在于 Rust 的扩展点,前端清单见 R4):
1. **`types.rs:34/81/347`** 三处注释从 `"local" | "plugin"` 改为 `"local" | "plugin" | "marketplace"`(语义性,不影响 serde)
2. **可选**:在 SkillMetadata / McpMetadata / Skill / McpServer / McpConfigFile 上增加 marketplace 来源记录字段(D-9 → upstream owner / repo / install URL / 安装时间戳),命名待 spec 决定 — 但 PRD §7.6 / §7.7 提到 metadata 持久化在 `data.json` skillMetadata / mcpMetadata 内,与本地资源同模式
3. **scan_skills** (skills.rs:171-246):`install_source` 三选一的 `if/else` 链需添加第三分支 — 但因为 marketplace 安装是**真实拷贝**(D-7),scan 时无法靠"是否 symlink"区分 marketplace vs local。**必须在元数据(SkillMetadata / McpMetadata)持久化 install_source 字段** — 当前 `SkillMetadata` 没有此字段(types.rs:213-228),需新增

---

## 4. DATA_MUTEX / read_app_data / write_app_data callsite 完整 grep

**Rule 强制**:`grep-before-enumerate-shared-resource`(项目级 Rule),所有共享 data.json 的 mutator 必须列入下表。

### 4.1 主 grep:`rg -n 'read_app_data|write_app_data' --type rust`

执行结果(去除 lib.rs 注册行 + 注释 + 测试):

| File | Line | 用途 |
|---|---|---|
| `data.rs` | 243 | **`read_app_data` 定义** |
| `data.rs` | 257 | **`write_app_data` 定义** |
| `data.rs` | 355 | `init_app_data` 写默认数据 |
| `data.rs` | 408 / 432 | `add_category` 读写 |
| `data.rs` | 462 / 481 | `update_category` 读写 |
| `data.rs` | 515 / 576 | `delete_category` 读写 |
| `data.rs` | 587 / 590 | `reorder_categories` 读写 |
| `data.rs` | 617 / 638 | `set_category_parent` 读写 |
| `data.rs` | 688 / 767 | `migrate_category_id_for_skills_mcps` 读写 |
| `data.rs` | 776 | `get_tags` 读 |
| `data.rs` | 784 / 793 | `add_tag` 读写 |
| `data.rs` | 802 / 806 | `update_tag` 读写 |
| `data.rs` | 817 / 819 | `delete_tag` 读写 |
| `data.rs` | 828 / 831 | `reorder_tags` 读写 |
| `data.rs` | 840 | `get_scenes` 读 |
| `data.rs` | 857 / 873 | `add_scene` 读写 |
| `data.rs` | 890 / 911 | `update_scene` 读写 |
| `data.rs` | 922 / 945 | `delete_scene` 读写(soft delete → trashed_scenes) |
| `data.rs` | 954 | `get_projects` 读 |
| `data.rs` | 963 / 974 | `add_project` 读写 |
| `data.rs` | 990 / 1005 | `update_project` 读写 |
| `data.rs` | 1016 / 1035 | `delete_project` 读写(soft delete → trashed_projects) |
| `skills.rs` | 95 / 118 | `update_skill_metadata` 读写 |
| `skills.rs` | 300 / 306 | `delete_skill` 写(metadata 清理) |
| `mcps.rs` | 83 / 103 | `update_mcp_metadata` 读写 |
| `mcps.rs` | 467 / 473 | `delete_mcp` 写(metadata 清理) |
| `import.rs` | 860 / 869 | `update_skill_scope_in_metadata` |
| `import.rs` | 949 / 958 | `update_mcp_scope_in_metadata` |
| `claude_md.rs` | 107 | `import_claude_md` 读(已废弃路径,现在用 383) |
| `claude_md.rs` | 383 / 388 | `import_claude_md` 读写 |
| `claude_md.rs` | 449 | `read_claude_md` 读 |
| `claude_md.rs` | 470 | `get_claude_md_files` 读 |
| `claude_md.rs` | 511 / 554 | `update_claude_md` 读写 |
| `claude_md.rs` | 577 / 633 | `delete_claude_md` 读写 |
| `claude_md.rs` | 655 / 759 | `set_global_claude_md` 读写 |
| `claude_md.rs` | 778 / 797 | `unset_global_claude_md` 读写 |
| `claude_md.rs` | 813 | `distribute_claude_md` 读 |
| `claude_md.rs` | 937 / 958 | `migrate_claude_md_storage` 读写 |
| `trash.rs` | 387 / 410 | `restore_claude_md`(info.json 路径)读写 |
| `trash.rs` | 414 / 445 | `restore_claude_md`(无 info.json fallback)读写 |

**统计**:write 点 26 个,read 点 17 个(含纯 read 命令)。**所有 mutator(write 点)路径都包了 `DATA_MUTEX`**。

### 4.2 防御性 grep:`rg -n 'data_path|app_data\.\w+_metadata|fs::write.*data\.json|get_data_file_path|get_data_path' --type rust`

**bypass 通道**(读 data.json 但不经 `read_app_data`):
- `skills.rs:249-257` `load_skill_metadata` — 直接 `fs::read_to_string(get_data_file_path())` + `serde_json::from_str::<AppData>`。**纯读,不持锁**(scan_skills 私有 helper)
- `mcps.rs:186-195` `load_mcp_metadata` — 同上,纯读
- `data.rs:5/244/258/316` — 都在 `read_app_data` / `write_app_data` 自己内部使用 `get_data_file_path()`,不算 bypass
- `import.rs:10` — 引入 `get_data_file_path` 但未实际使用(`#![allow(unused_imports)]` 在文件首行)

**直接 `fs::write` 到 data.json 的非标准路径**:**0** — 所有写都经 `write_app_data`。

**直接 `app_data.X_metadata` 字段操作**(在已经 `let mut app_data = read_app_data()?` 之后,作为正常 mutator 流程的一部分):
- `skills.rs:301`:`app_data.skill_metadata.remove(&skill_id)`(`delete_skill`)
- `mcps.rs:190` / `468`:`app_data.mcp_metadata`(`delete_mcp`)
- `import.rs:862-867` / `951-956`:`metadata.scope = scope`(scope 切换)

**所有这些都已经在 DATA_MUTEX 保护下**(T1f Phase 1 audit 已封闭,各 fn 注释里都明确说明)。

### 4.3 Marketplace 新增 callsite 的契约

每一个新的 marketplace 命令(install / uninstall / update_metadata 等)只要它**写** data.json 就必须:
1. 外层取 `let _guard = DATA_MUTEX.lock()...`
2. 然后才 `read_app_data` → mutate → `write_app_data`
3. 提交时再次 `rg 'read_app_data|write_app_data'` 比对清单 — Rule 强制

---

## 5. 现有 Skill 导入流程(import.rs)

### 5.1 `import_existing_config` IPC(import.rs:526-578)

入参:`claude_config_dir`, `ensemble_dir`, `items: Vec<ImportItem>`(`item_type` ∈ `"skill" | "mcp"`)。

流程:
1. 创建 `~/.ensemble/skills/` 与 `mcps/`(`fs::create_dir_all`)
2. 对每个 item:
   - `"skill"` → `copy_skill(&item, &skills_dest)`
   - `"mcp"` → `extract_mcp_config(&item, &claude_path, &mcps_dest)`
3. 收集错误,返回 `ImportResult`

### 5.2 `copy_skill` 同名碰撞短路(import.rs:585-652)— **R-1 命中点**

```rust
// import.rs:621
if skill_dest.exists() || skill_dest.symlink_metadata().is_ok() {
    return Err(format!("Skill '{}' already exists in destination", item.name));
}
```

**R-1 原话(H §3-条款 2)**:"现有代码 `dest_skill_path.exists()` 短路把'已存在'误算作'已导入'"。这意味着:
- 用户曾装过同名 → 删除时只移到 trash → 旧目录确实不在 `~/.ensemble/skills/` 但 trash 中存在 → 重装时 `exists()` 为 false,正常装(没有 R-1)
- 用户已装同名 → 重装时 `exists()` 为 true → 直接 `Err` → 调用方收到错误字符串,不知道这是"已存在"还是"权限错"或别的

**Marketplace V1 必须不复用 `copy_skill`**(PRD §7.4 SSoT)。建议另开命令(`marketplace::install_skill`)实现:
1. 三选项判定:`Path.exists()` + `data.json.skill_metadata` 存在 + trash 中存在 = 三种独立信号
2. 根据 PRD §7.6 弹三选项 modal(Restore from Trash / Replace existing / Cancel),前端在 UI 层先 confirm → 再分别走具体子命令

### 5.3 `imported_plugin_skills` / `mcps` 列表维护

**位置**:仅在 `plugins.rs::import_plugin_skills` 内部 push(plugins.rs:756 / 866)。**plugins.rs 不直接写 data.json** — 这两个列表的写入路径是:plugins.rs → 返回 `Vec<String>` → **前端 store** 调用 `write_app_data` 把列表合并保存。

`detect_plugin_skills(imported_plugin_skills: Vec<String>)`(plugins.rs:394)入参由前端从 data.json 读出再传入。

**Marketplace 是否需要类似列表?** PRD §7.7 说"metadata 持久化在 data.json 的 skillMetadata / mcpMetadata 中,沿用现有模式" — 即 marketplace 来源信息(owner/repo)直接放进 SkillMetadata 字段,**不需要单独的 `imported_marketplace_skills` 列表**(R-36 已登记此风险,V1 应避免膨胀)。

### 5.4 现有"导入"的物理动作

- 来源 `~/.agents/skills/...`(npx skill 安装) → `copy_skill` 创建 **symlink**(import.rs:634-644,Strategy B)
- 来源 `~/.claude/skills/...`(无 .agents 路径) → `copy_skill` 走 **真实拷贝**(import.rs:647 `copy_dir_recursive`)

Marketplace 是**网络下载** → 必然走真实拷贝(没有本地源可 symlink) — 这与 D-7 / A §5.1 决策一致。

---

## 6. plugin 来源识别 + 沉底排序(plugins.rs)

### 6.1 plugin 来源识别

**两条独立路径**:
1. **scan_skills 时**(skills.rs:206-218):检查 `fs::read_link(skill_dir)` 是否指向 `.claude/plugins/cache/`,是 → `install_source = "plugin"` + 解析 `(plugin_id, plugin_name, marketplace)` 三元组
2. **scan_mcps 时**(mcps.rs:149-153):依据 JSON 文件里的 `install_source` 字段(`McpConfigFile` 反序列化)。**MCP 与 Skill 的识别机制不一样** — Skill 靠运行时 symlink 检查,MCP 靠 JSON 持久化字段

### 6.2 plugin enabled 状态(实时读 settings.json)

`is_plugin_enabled` 在 `skills.rs:153-169` + `mcps.rs:108-124` 各定义一次(代码重复,见 R-22 P1 风险)。**每次 scan 都同步读 `~/.claude/settings.json`** — 不持久化,不缓存。Marketplace 资源**不需要这个机制**(D-9 + R-27)。

### 6.3 McpConfigFile 双构造点(R-57)

- `import.rs:679, 704, 740`(local 三处分支)
- `plugins.rs:832-848`(plugin)

**Marketplace 是第三处**。CLAUDE.md key patterns 段已点名:"`McpConfigFile` is constructed in both `import.rs` and `plugins.rs` — when adding fields to it, update both"。

### 6.4 沉底排序(R-4)— 后端不参与

后端 `scan_skills` / `scan_mcps` 返回的 `Vec<Skill>` / `Vec<McpServer>` **不做任何排序**(skills.rs:50,mcps.rs:40)— 直接 `Ok(skills)` / `Ok(mcps)`。

**沉底排序在前端 store 层**:
- `src/stores/skillsStore.ts:469-478`:`a.installSource === 'plugin'` 排序到底
- `src/stores/mcpsStore.ts:503-512`:同上

**Marketplace 资源"不沉底"的实现路径**:前端 store 修改 — 与后端**完全无关**。后端只需返回三态 `install_source`,前端排序逻辑判断 `=== 'plugin'` 而 marketplace 的不命中,自然不沉底。

---

## 7. Trash 流程(soft delete / restore / SSoT 第 3 个条件)

### 7.1 Skill / MCP soft delete(skills.rs:265-310 / mcps.rs:431-477)

`delete_skill(skill_id, ensemble_dir)`(skills.rs:265):
1. 验证 `skill_path.exists()`(skill_id = path)
2. `~/.ensemble/trash/skills/` 创建目录(如不存在)
3. 如果 trash 内已有同名:`dest_path = trash_dir.join(format!("{}_{}", skill_name, timestamp))`(YYYYMMDD_HHMMSS,skills.rs:288-289)
4. `fs::rename(skill_path, &dest_path)` — 物理移动
5. `DATA_MUTEX` 持锁 → `app_data.skill_metadata.remove(&skill_id)` → `write_app_data`(skills.rs:298-307)— **失败被吞咽**(只 log,不 propagate)— 注释解释为"trash 移动已成功,现在报错会误导调用者"

`delete_mcp` 镜像。

### 7.2 Trash 列出(trash.rs:108-255)

**Trash 不在 data.json 里**(skill / mcp 这两类),靠**直接扫描** `~/.ensemble/trash/{skills,mcps,claude-md}/`:
- 扫每条目录 / 文件 → 解析 `name_YYYYMMDD_HHMMSS` 后缀提取删除时间(`parse_timestamp_from_name`,trash.rs:16-50)
- 没有时间戳 → 用文件 modified time
- skill: 读 `SKILL.md` frontmatter 取 description
- mcp: 解析 `McpConfigFile` 取 description
- claude_md: 读 `info.json` 取 name

返回 `TrashedItems { skills, mcps, claude_md_files }`。

### 7.3 Restore(trash.rs:262-450)

- `restore_skill` / `restore_mcp`:**只做 `fs::rename`**(trash.rs:289-291 / 329-331),**不写 data.json metadata**(因为 metadata 在 `delete_skill` 时已被清除 → restore 后 user 需要重新分类)
- `restore_claude_md`:不同 — 因为 claude_md 持久化在 `data.json.claude_md_files` 中,需要重建 entry

### 7.4 SSoT §7.4 第 3 个条件实现路径

PRD §7.4 三条件:
1. `~/.ensemble/skills/<name>/` 存在
2. `data.json.skill_metadata[<key>]` 存在
3. **不在 Trash 中** ← 此条件

**Marketplace 列表 Installed 状态判定的一种实现**:
- 命令拿到 marketplace skill 名字
- 检查 `~/.ensemble/skills/<name>/` 是否存在
- 检查 `data.json.skill_metadata[<key>]` 是否存在(`key = source_path`,所以= `~/.ensemble/skills/<name>` 的绝对路径)
- 检查 `~/.ensemble/trash/skills/` 下是否有 `<name>` 或 `<name>_<timestamp>` 形式的目录(扫描)
- 三者**都成立** → `Installed`;任一不成立 → `Install`(若仅"在 trash 中"则前端 PRD §7.6 弹 Restore Modal)

**实施提醒**:第 3 条件每次都全扫 trash 目录性能可能有问题(用户 trash 大时);可考虑 marketplace 加载列表时一次性 `list_trashed_items` 拿到 `TrashedItems.skills` 列表,在前端做 `Set<string>` 比对。

---

## 8. Classify 流程(含 in-progress 改动)

### 8.1 `auto_classify` 签名(classify.rs:194-304)

```rust
pub async fn auto_classify(
    items: Vec<ClassifyItem>,
    existing_categories: Vec<ExistingCategory>,
    existing_tags: Vec<String>,
    available_icons: Vec<String>,
) -> Result<Vec<ClassifyResult>, String>
```

`ClassifyItem`(classify.rs:5-16):`id, name, description, instructions?, content?, tools?`。

`ExistingCategory`(classify.rs:22-28,**未提交改动**):`name, parent_name?` — 支持深度 2。

`ClassifyResult`(classify.rs:33-41,**未提交改动**):
- `id: String`
- `suggested_category: String`(被分类项的 root 或 child 名字)
- `suggested_parent_category: Option<String>`(若是 child,父 category 名字)
- `suggested_tags: Vec<String>`
- `suggested_icon: Option<String>`

### 8.2 单项触发可行性(D-8 / R-15)

**完全支持单项**:`items: Vec<ClassifyItem>` 长度任意。前端只需传 1 元素 vec(`vec![single_item]`)。

执行路径(classify.rs:200-302):
1. 空 items → 立即返回 `vec![]`(classify.rs:200-202)— **优化**:Marketplace 安装时即使 N=1 也走完整路径
2. 构建 prompt(`build_classification_prompt`)
3. **`Command::new("claude")`** 子进程同步调用 — **不是 Anthropic API REST**(`reqwest` 路径在 classify.rs:308-335 是 dead code 标 `#[allow(dead_code)]`)
4. 入参:`-p <prompt> --output-format json --json-schema <schema> --dangerously-skip-permissions --model sonnet`
5. 解析 stdout 的 `structured_output.classifications`
6. `parent_category` 处理:空字符串/自指 → drop(classify.rs:283-288)

### 8.3 Marketplace 单项触发的关键约束

- **`auto_classify` 是 `async fn`** → tokio 执行,可以从同步命令中以 `tokio::spawn` 后台触发(D-8 异步不阻塞用户)
- **依赖 `claude` CLI 可用性** — 若 PATH 中没有 claude,直接 fail(classify.rs:251)
- **失败处理**:Marketplace 安装成功后 spawn 后台任务,任务自己 fail 时**不要 propagate 给安装结果**(R1-P0-4 / PRD §7.2)— 失败 → 前端 row 显示 "Auto-classify failed — assign manually"(在 Skills 列表上,不是 Marketplace 列表上)

### 8.4 与 §11 settings flag 的连接

PRD §7.2 说"`autoClassifyNewItems: boolean` flag 已在 settings.json 存在但当前未被任何代码消费"。Marketplace 安装命令实现需要:
1. 读 `read_settings()` → 检查 `auto_classify_new_items`
2. true → 安装成功后 `tokio::spawn` 一个调用 `auto_classify` 的 async 任务,完成后通过 Tauri event 通知前端单项分类结果(emit `'marketplace:item-classified'` 等)
3. false → 跳过 auto-classify,行为=用户手动点 Auto Classify 按钮才分类

**实施侧第一次决策**:Tauri `Window::emit` / `app.emit` 事件链(用于异步分类结果回流)— 项目其他模块有用过吗?搜 result:`lib.rs:55-62` 已有 `emit("second-instance-launch", ...)` 范例,所以 emit 模式已成熟。

---

## 9. Sync to Project 流程(config.rs)

### 9.1 `sync_project_config`(config.rs:65-106)

入参:`projectPath, skillPaths: Vec<String>, mcpServers: Vec<McpServer>`。

流程:
1. 创建 `<project>/.claude/skills/`
2. 移除现有 skill symlinks(扫描 + `fs::remove_file` 仅当是 symlink,config.rs:80-86)
3. 为每个 `skillPaths` 创建 symlink:`<project>/.claude/skills/<name>` → `<source>` (config.rs:89-100)
4. 调用 `write_mcp_config(projectPath, mcpServers)` 写 `.mcp.json`

### 9.2 `write_mcp_config`(config.rs:9-60)

写到 `<project>/.mcp.json`:
- HTTP MCP:`{ "type": "http", "url": ... }`(config.rs:28-31)
- stdio MCP:`{ "type": "stdio", "command": ..., "args": ... }`(config.rs:33-39)
- 含 `env` 时合并(config.rs:41-45)
- 写 `mcpServers: { <name>: <config> }` 嵌套结构

### 9.3 Marketplace 资源 Sync 行为(R-32)

PRD §7.8 承诺**与本地资源完全同行为**:
- Skill 走 symlink 链:`<project>/.claude/skills/<name>` → `~/.ensemble/skills/<name>`(因为 marketplace 是真实拷贝,这条 symlink 不会跨 plugin cache)— 一跳即达,**不会遇到 plugin 三跳 symlink 问题**(R-10)
- MCP 走 `.mcp.json`:从 `~/.ensemble/mcps/<name>.json` 读 `McpConfigFile` → 重新组装成 Claude Code 的 nested format

**没有任何 marketplace-specific 改动需要在 config.rs 内做**;只需保证 marketplace 安装的物理产物(skills 目录 / mcps JSON 文件)与 import 来源的物理产物结构一致 — 当前 `McpConfigFile` 三处构造点保持字段一致即可(R-57)。

---

## 10. ~/.ensemble/ 路径布局 + cfg(test) guard

### 10.1 当前路径(`init_app_data` 创建)

`data.rs:303-365`:
```
~/.ensemble/
├── skills/              # 真实/symlink 混合,每子目录 = 一个 Skill
├── mcps/                # *.json 文件,每文件 = 一个 MCP
├── data.json            # AppData 持久化(categories/tags/scenes/projects/metadata/...)
├── settings.json        # AppSettings 持久化
├── claude-md/           # claude_md.rs 创建,每子目录 {id}/CLAUDE.md + info.json
└── trash/               # 由 delete_skill / delete_mcp / delete_claude_md 创建
    ├── skills/
    ├── mcps/
    └── claude-md/
```

**注意**:
- `init_app_data` 只创建 `skills/`, `mcps/`, `data.json`, `settings.json`(data.rs:308-313)
- `claude-md/` 由 `claude_md.rs::get_claude_md_storage_dir()` 内部 ensure(claude_md.rs:29-32)
- `trash/{skills,mcps,claude-md}/` 由各自 `delete_*` 命令 lazy 创建(skills.rs:281-283 / mcps.rs:447-449)

### 10.2 Marketplace cache 子目录建议

**没有现成位置** — 需要新增。建议:
- `~/.ensemble/marketplace-cache/skills/leaderboard.json`(skills.sh top-N)
- `~/.ensemble/marketplace-cache/mcps/registry.json`(Official MCP Registry)
- `~/.ensemble/marketplace-cache/timestamps.json`(每源最后刷新时间,24h TTL 比对依据)

或更扁平:
- `~/.ensemble/marketplace-cache/skills.sh.json`
- `~/.ensemble/marketplace-cache/mcp-registry.json`

**实施侧首选**:由 spec 阶段决定;**无产品层风险**,纯实现细节。

### 10.3 `cfg(test)` guard(`get_app_data_dir`,utils/path.rs:41-61)

**已经实现并锁定**(utils/path.rs:42-61):
```rust
pub fn get_app_data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("ENSEMBLE_DATA_DIR") {
        return PathBuf::from(dir);
    }
    #[cfg(test)] { panic!("..."); }
    #[cfg(not(test))] { dirs::home_dir()...join(".ensemble") }
}
```

**Rule 强制**:`fallback-path-must-be-unreachable-in-test`。
**Marketplace 安装命令调用 `get_app_data_dir` / `get_data_file_path`**:自动继承此 guard,无需重复实现。
**新 marketplace cache 路径函数**(若新增 helper `get_marketplace_cache_dir()`):**必须基于 `get_app_data_dir().join("marketplace-cache")`** 而不是直接 `dirs::home_dir()` — 否则丢失 `cfg(test)` panic 保护。

`utils/path.rs:226-251` 已有 `should_panic` 测试守护此 guard 不被静默移除(`test_get_app_data_dir_panics_without_env_in_tests`)。

---

## 11. settings.json `autoClassifyNewItems` flag 现状

### 11.1 后端定义(types.rs:286-325)

`AppSettings` struct(types.rs:286-300):
```rust
pub auto_classify_new_items: bool,    // line 291
```

`Default for AppSettings`(types.rs:310-325):
```rust
auto_classify_new_items: false,        // line 317
```

### 11.2 后端读写命令(data.rs:272-298)

- `read_settings()`(data.rs:273)— `read_app_data` 的兄弟函数,读 `~/.ensemble/settings.json`
- `write_settings(settings)`(data.rs:287)— 全量覆盖

### 11.3 消费状况

`rg 'autoClassifyNewItems|auto_classify_new_items'` Rust 端结果:
- `types.rs:291` — 字段定义
- `types.rs:317` — 默认值
- `types.rs:995` — 测试断言默认 false

**整个 src-tauri 内除以上 3 处外,零消费**。即:`auto_classify` IPC **不读 settings**(classify.rs 完全不引用 read_settings 或此 flag)。

前端(供交叉参考):
- `src/types/index.ts:131` — TS 字段定义
- `src/stores/settingsStore.ts:28/77/119/171/204` — Zustand store 读写
- `src/stores/__tests__/settingsStore.test.ts:12/31` — 测试

**前端层面也没有消费驱动**:store 知道 flag 值,但 SkillsPage / McpServersPage 没有"在批量导入后 if (flag) auto_classify" 的连接。

### 11.4 Marketplace 启用此 flag 的最少改动

按 PRD §7.2 + R-22:
1. 后端 marketplace 安装命令调用 `read_settings()?.auto_classify_new_items` 读 flag
2. true → spawn `auto_classify(vec![item], ...)` async
3. 用 Tauri event emit 结果 → 前端 store 更新 single skill 的 category/tags
4. 前端 Settings 页面允许用户改此 flag(UI 已经有 toggle 接口在 settingsStore,只需挂载)

---

## 12. 给下游的扩展点清单

### 12.1 三态扩展点(install_source = "marketplace")
- **类型注释更新**:`types.rs:34, 81, 347` — 三处文档注释
- **持久化新字段**:`SkillMetadata` (types.rs:213-228) / `McpMetadata` (types.rs:231-245)新增 `install_source: Option<String>` 字段(camelCase = `installSource`)— 因为 marketplace 真实拷贝时 scan_skills 无法靠 symlink 区分。**这是 V1 必须的迁移点**
- **scan_skills 注入**:`skills.rs:206-218` if/else 改为先读 metadata.install_source,fallback 到 symlink 检测;backward compat 默认 "local"
- **scan_mcps 注入**:`mcps.rs:149-153` 已经从 `McpConfigFile.install_source` 读,marketplace 安装时把 `"marketplace"` 写进 JSON 即可
- **`scan_skills` 入参考虑**:scan 现在不知道 metadata 在哪儿,要么传 `metadata_map` 进去(已是),要么扩展 `SkillMetadata` 的 install_source 字段
- **前端排序判定**:`skillsStore.ts:471-472` / `mcpsStore.ts:505-506` 的 `=== 'plugin'` 判定**继续保持**,marketplace 不命中天然不沉底 — 这是 R-4 的最简实现

### 12.2 新 IPC 命令(`marketplace::*` 命名空间)
建议新文件 `src-tauri/src/commands/marketplace.rs`:
- `list_marketplace_skills()` — 拉取 + 缓存 skills.sh leaderboard
- `list_marketplace_mcps()` — 拉取 + 缓存 Official MCP Registry
- `get_marketplace_skill_detail(...)` / `get_marketplace_mcp_detail(...)` — 详情(README + 元数据)
- `install_marketplace_skill(name, owner, repo, ...)` — 主流程 IPC,含 §7.4 SSoT 三判定 + §7.6 collision 处理
- `install_marketplace_mcp(name, ...)` — 同上
- `refresh_marketplace_cache(source: 'skills' | 'mcps')` — PageHeader Refresh 按钮
- 在 `lib.rs:66-165` `generate_handler!` 中注册

### 12.3 cache 子目录(§10.2)
新增 `~/.ensemble/marketplace-cache/`,**必须经 `get_app_data_dir().join("marketplace-cache")`** 以继承 cfg(test) guard。子文件 schema 由 spec 决定。

### 12.4 HTTP 客户端引入策略
- reqwest 0.12 已存在(Cargo.toml:32);native-tls 即可
- 实施期建议:全局 lazy `Client` 单例(`once_cell::sync::Lazy` 或 `std::sync::OnceLock`)避免每次安装创建新 client — **这会需要新依赖 `once_cell`**,或用 std `OnceLock`(Rust 1.70+)。**Cargo.toml `rust-version = "1.77.2"` 已支持 std OnceLock**,**不需要新依赖**
- User-Agent 头:`Ensemble/1.0.0 (+https://github.com/O0000-code/Ensemble)` — Rule R-40 / R-47 法律合规层 + skills.sh / GitHub API 友好
- 超时:reqwest 默认无超时;Marketplace 必须显式 `Client::builder().timeout(Duration::from_secs(15)).build()`

### 12.5 SSoT §7.4 实现要求
- **Trash 第 3 判定靠扫文件系统**(§7.4)— marketplace 命令链需先 `list_trashed_items` 或单独 lightweight scan,不能只靠 `data.json`
- **Skill.id = source_path**(R-3) — marketplace 同名重装走 §7.6 Restore Modal 时,前端必须把"被恢复"的旧 id (= 旧 source_path)与"将装"的新 source_path 比对一致(都是 `~/.ensemble/skills/<name>/` 的同一绝对路径) — **天然一致**,因为同名 → 同路径

### 12.6 Auto-Classify 单项异步触发
- `auto_classify(items: Vec<ClassifyItem>, ...)`(classify.rs:194)接受单元素 vec
- Marketplace 安装命令:成功后 `if read_settings()?.auto_classify_new_items { tokio::spawn(async move { auto_classify(vec![item], ...).await }); }`
- 结果回流:`app.emit("marketplace:item-classified", payload)`,前端 store 监听并 update single Skill metadata
- 失败处理:不 propagate;前端在 Skills 列表 row 显示 "Auto-classify failed — assign manually"(R1-P0-4)

### 12.7 DATA_MUTEX 契约(R-1 / R-2 / R-3 / R-4 / 共享 mutex Rule)
**所有 marketplace 写 data.json 的命令必须**:
1. 外层取 `let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;`
2. 然后 `read_app_data` → mutate → `write_app_data`
3. 完成实施后再次执行 `rg -n 'read_app_data|write_app_data' --type rust` + `rg -n 'data_path|app_data\.\w+_metadata|fs::write.*data\.json' --type rust` 比对 §4 表更新

### 12.8 V1 不需要后端改动的范围
- **沉底排序逻辑**:前端 store(R-4 在前端解决,后端不改)
- **plugin enabled 状态**:不影响 marketplace(R-27,marketplace 来源 `plugin_enabled` 永远 None)
- **Plugin badge 渲染**:前端 List Item 渲染条件(R-11),后端只暴露 `install_source`
- **stdio vs HTTP UI 分支**:前端依据 `mcp_type` 字段渲染(D-12,后端字段已就绪)
- **Sync 行为**:`config.rs::sync_project_config` 无需改动(R-32)

---

## 附录 A:Grep 命令(下游 verifier 重跑用)

```bash
# Rule grep-before-enumerate-shared-resource(必跑)
cd src-tauri
rg -n 'read_app_data|write_app_data' --type rust
rg -n 'data_path|app_data\.\w+_metadata|fs::write.*data\.json|get_data_file_path|get_data_path' --type rust

# 三态扩展点 + plugin 列表
rg -n '"plugin"|"local"|"marketplace"|install_source|installSource|imported_plugin_skills|imported_plugin_mcps' --type rust

# DATA_MUTEX 覆盖
rg -n 'DATA_MUTEX' --type rust

# autoClassifyNewItems flag 链路
rg -n 'autoClassifyNewItems|auto_classify_new_items' --type rust

# McpConfigFile 三处构造点(防止漏 marketplace 第三处)
rg -n 'McpConfigFile \{' --type rust

# dest.exists() / R-1 短路
rg -n 'dest_skill_path\.exists|skill_dest\.exists|dest_mcp_path\.exists|dest_path\.exists' --type rust
```

---

**本文件结束。**
