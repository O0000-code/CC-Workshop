# Marketplace 实施 — 技术 Spec(02)

> **角色**:本轮 Decisional 文档(技术契约层)。把 PRD 决策与调研产物映射到精确的 IPC 名 / Rust struct / TS 类型 / 组件清单 / 状态机契约。
> **上游**:`00_round_plan.md`(本轮规划)+ `04_PRD_v2.md`(产品契约)+ `01_research/R[1-4]*.md`(代码现状)
> **下游**:各实施 SubAgent 必读;`03_task_cards.md` 任务卡分发的事实库
> **纪律**:不复述 PRD 内容;只补"PRD 没写但实施必须明确"的契约。

---

## 0. TL;DR — 实施层 5 条契约

1. **新后端模块** = `src-tauri/src/commands/marketplace.rs`;**6 个 IPC 命令**注册到 lib.rs(详 §3)
2. **三态扩展最小集合** = 类型注释 + `SkillMetadata.install_source` 新字段 + `McpConfigFile.install_source` JSON 写入 marketplace + 前端 type 字面量(详 §4-5)
3. **HTTP 客户端**用 std `OnceLock<reqwest::Client>` 单例,User-Agent / 15s timeout 写死,不引入 once_cell
4. **Cache 路径** = `~/.ensemble/marketplace-cache/{skills,mcps}-catalog.json`;schema = `{ items, lastSyncedAt, source }`;24h TTL
5. **新建组件** = `MarketplaceListItem` + `MarketplaceCollisionModal` + `MarketplaceShortcutBanner`;**新建页面** = `SkillMarketplacePage` + `McpMarketplacePage`;**改造** = Sidebar / App.tsx / MainLayout.getActiveNav / SkillsPage(只加 query-param 监听)/ SettingsPage(只加 toggle)

---

## 1. 数据源接入策略(实施层精确)

### 1.1 Skill 主源:混合 — seed 名单 + 异步爬 skills.sh top-N(D-Imp-1 修订)

**用户在 Plan 模式选定混合方案**:V1 同时实现两层接入,seed 立即可用 + 后台爬虫逐步丰富。

#### 1.1.1 基线层:精选 seed 名单 + GitHub Contents API

**Seed 名单位置**:`src-tauri/src/commands/marketplace_seed.rs`(新文件,纯数据 const),包含约 40-60 个 owner/repo 来自 skills.sh leaderboard 当前 top 内容。结构:

```rust
pub struct SeedSkill {
    pub owner: &'static str,
    pub repo: &'static str,
    pub skill_path: &'static str,             // skill-level path within repo
    pub upstream_id: &'static str,            // {owner}/{repo}/{name} 三元组 hash 用
}

pub const SKILL_SEED: &[SeedSkill] = &[
    SeedSkill {
        owner: "anthropics",
        repo: "skills",
        skill_path: "examples/pdf-to-markdown",
        upstream_id: "anthropics/skills/pdf-to-markdown",
    },
    // ... ~40-60 entries
];
```

**Seed catalog 拉取流程**(`fetch_skills_seed()` 内部 helper,不直接暴露 IPC):
1. 对 seed 名单每条 → GitHub API `GET https://api.github.com/repos/{owner}/{repo}` 取仓库元数据(stars, updated_at, description, license)
2. 对每条 → GitHub API `GET https://api.github.com/repos/{owner}/{repo}/contents/{skill_path}/SKILL.md`(取 SKILL.md 内容,base64 解码)
3. 解析 SKILL.md frontmatter 与 README markdown(取头部前 ~3000 字作为详情主区内容)
4. 每个 API 调用之间 `sleep 100ms`(R-24 GitHub API rate limit 缓解);40 调用约 4-5 秒
5. 失败立即 fallback 到 stale cache,emit `marketplace:upstream-error`

#### 1.1.2 增强层:后台异步爬 skills.sh top-100

**新增内部 helper**:`fetch_skills_sh_top(limit: usize)` — 不暴露独立 IPC,在 `list_marketplace_skills` 拉完 seed 后由 `tokio::spawn` 后台触发。

**爬虫策略**:
1. HTTP GET `https://skills.sh/`(或 `https://skills.sh/leaderboard`,根据实际页面结构)
2. 解析 HTML 提取 leaderboard 中 top-100 个 skill repo 链接(`<a href="https://github.com/{owner}/{repo}">` 形式)
3. 对每个新发现的 owner/repo(去重 seed 已有)走 §1.1.1 同款流程拉 SKILL.md / 元数据
4. 增量合并到 catalog,写入 cache

**容错链**(R-7/R-8 P0 缓解):
- skills.sh 不可达 / 429 → 静默失败,emit `marketplace:scrape-degraded`,seed 内容不受影响,UI 显示 "Last synced N hours ago(seed only)" 软提示
- 网页结构变更解析失败 → 同上,降级到 seed only
- 爬虫超过 30s 未完成 → tokio timeout → 同上降级
- 即使爬虫成功也保留 seed 名单(seed 是 ground truth,爬虫是补充)

#### 1.1.3 详情面板的 README

不另发 API 请求 — catalog 拉取时把 SKILL.md 内容 + 仓库 README(若 `getContents("/")` 命中 README.md)缓存进 catalog 项的 `readme_markdown` 字段。

### 1.2 MCP 主源:Official MCP Registry(D-Imp-2)

**API 端点**:`https://registry.modelcontextprotocol.io/v0.1/servers`

**拉取**:单次 GET 拉全量(~500 项,JSON 体积 ~200 KB 量级,可接受);`Accept: application/json`,无 auth。

**字段映射**(catalog 内每项):
- `id` = 上游 server id(e.g. `io.modelcontextprotocol/everything`)
- `name`, `description`, `version`
- `repository.url`, `repository.source`
- `packages: [...]`(stdio 类:含 `runtime_hint, package_arguments, package_environment_variables`)
- `remotes: [...]`(HTTP 类:含 `url, type, oauth_authorization_url?`)
- `categories[]`, `tags[]`(上游分类,V1 仅展示不参与 Ensemble 分类)

**stdio vs HTTP 判定**:
- `packages` 非空 → stdio
- `remotes` 非空 → HTTP
- 两者都非空 → 优先 HTTP(用户选择 url 接入更轻);V1 不混合显示
- 都空 → 跳过该项(不入 catalog)

### 1.3 Cache schema(D-Imp-3)

**路径**(经 `get_app_data_dir()` 继承 cfg(test) guard):
- `~/.ensemble/marketplace-cache/skills-catalog.json`
- `~/.ensemble/marketplace-cache/mcps-catalog.json`

**Schema**(MarketplaceCatalog):

```rust
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceCatalog<T> {
    pub items: Vec<T>,
    pub last_synced_at: String,           // ISO8601
    pub source: String,                    // "skills.sh-seed-v1" | "mcp-registry-v0.1"
}
```

**TTL 比对**:`now - last_synced_at < 24h` → cache 有效;否则尝试刷新,失败 fallback 到 stale cache + emit "stale cache used" event(前端不阻塞但 "Last synced X ago" 文案显示真实陈旧度)。

### 1.4 上游条目类型(MarketplaceSkillItem / MarketplaceMcpItem)

```rust
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceSkillItem {
    pub id: String,                        // 三元组 hash:`{owner}-{repo}-{name}`
    pub name: String,                      // SKILL.md frontmatter `name`
    pub description: String,               // SKILL.md frontmatter `description`
    pub readme_markdown: String,           // SKILL.md body + 可选 repo README 头部
    pub author: String,                    // owner
    pub owner: String,
    pub repo: String,
    pub skill_path: String,                // repo 内子路径
    pub homepage_url: String,              // https://github.com/{owner}/{repo}
    pub last_updated_at: String,           // ISO8601 from GitHub API
    pub stars: u32,                        // popularity proxy(代替 weekly installs)
    pub categories: Vec<String>,           // 上游分类(仅展示)
    pub tags: Vec<String>,                 // 上游 tag
    pub license: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceMcpItem {
    pub id: String,                        // 上游 server id
    pub name: String,
    pub description: String,
    pub readme_markdown: String,           // 来自 repo README 或 inline description
    pub author: String,
    pub repository_url: String,
    pub last_updated_at: String,
    pub stars: u32,                        // GitHub stars(若可得)
    pub categories: Vec<String>,
    pub tags: Vec<String>,
    pub license: Option<String>,
    pub mcp_type: String,                  // "stdio" | "http"
    pub stdio_config: Option<StdioMcpConfig>,
    pub http_config: Option<HttpMcpConfig>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StdioMcpConfig {
    pub command: String,
    pub args: Vec<String>,
    pub required_env_vars: Vec<EnvVarSpec>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EnvVarSpec {
    pub name: String,
    pub description: Option<String>,
    pub where_to_find: Option<String>,     // 上游若提供帮助链接
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HttpMcpConfig {
    pub url: String,
    pub transport: String,                 // "sse" | "streamable-http" | etc
    pub oauth_authorization_url: Option<String>,
}
```

---

## 2. ~/.ensemble/ 目录布局变更

**新增**(由 `marketplace.rs::ensure_marketplace_cache_dir()` lazy 创建):

```
~/.ensemble/
├── skills/                       # 不变(marketplace 装到此处真实拷贝)
├── mcps/                         # 不变(marketplace 装到此处)
├── data.json                     # SkillMetadata / McpMetadata 扩展字段
├── settings.json                 # autoClassifyNewItems 默认 true(B4)
├── claude-md/                    # 不变
├── trash/                        # 不变
└── marketplace-cache/            # ← 新增
    ├── skills-catalog.json
    └── mcps-catalog.json
```

**关键**:不引入 `~/.ensemble/marketplace/` 子目录 — Marketplace 装的资源直接进 `skills/` 与 `mcps/`(D-7)。仅有 cache 的元数据落到独立 `marketplace-cache/` 目录。

---

## 3. IPC 命令清单(marketplace::*)

**新文件**:`src-tauri/src/commands/marketplace.rs`
**注册位置**:`src-tauri/src/lib.rs:66-165` `generate_handler!` 末尾追加 6 项

### 3.1 `list_marketplace_skills(refresh: bool) -> Result<Vec<MarketplaceSkillItem>, String>`

**行为**(混合方案 D-Imp-1):
1. `refresh = false`:读 cache(`skills-catalog.json`),若 24h 内有效 → 直接返回 `items`(不发 HTTP);**同时 `tokio::spawn` 后台触发** `fetch_skills_sh_top(100)` 增量补充(若距上次爬虫 > 24h)
2. `refresh = true` 或 cache 过期:走 `fetch_skills_seed()`(基线层,~5 秒)→ 写 cache → 返回 items;**立即** `tokio::spawn` 后台触发 `fetch_skills_sh_top(100)` 增量
3. 后台爬虫完成 → 增量合并 cache(写入 `skills-catalog.json` 时合并 + 去重)→ emit `marketplace:catalog-enhanced` payload `{ source: 'skills', addedCount: N }` 让前端可选 toast / 列表无缝刷新
4. 后台爬虫失败 → emit `marketplace:scrape-degraded` payload `{ source: 'skills', reason: ... }`(seed 不受影响)
5. seed 失败 + cache 存在 → fallback 返回 stale cache + emit `marketplace:stale-cache` payload `{ source: 'skills', ageHours: N }`
6. seed 失败 + 无 cache → `Err(message)` 让前端显示 EmptyState

**错误模式**:
- `"Network error: <reqwest 错误信息>"`
- `"GitHub rate limit reached. Try again in <minutes> minutes."`
- `"Cache file corrupted, please refresh."`

**注意**:scrape 失败**永远不**让 IPC 返回 `Err` — scrape 是后台增强,seed 是基线,基线成功就 IPC 成功。

### 3.2 `list_marketplace_mcps(refresh: bool) -> Result<Vec<MarketplaceMcpItem>, String>`

同 3.1,数据源换 Official MCP Registry。

### 3.3 `install_marketplace_skill(item: MarketplaceSkillItem, conflict_action: Option<ConflictAction>) -> Result<InstallOutcome, String>`

**ConflictAction**:

```rust
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum ConflictAction {
    Replace,                                // 旧版本 → Trash,装新版,metadata 不继承
    RestoreFromTrash { trash_path: String }, // 从 Trash 恢复旧版,放弃新装(metadata 全继承)
}
```

**InstallOutcome**:

```rust
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum InstallOutcome {
    Installed { skill_id: String },                              // 成功
    NameCollision { has_local: bool, has_trashed: Option<TrashedItemBrief> },  // 必须先解决冲突
    Failed { reason: String },                                   // 安装失败(网络 / 文件系统)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashedItemBrief {
    pub name: String,
    pub path: String,                       // 给 RestoreFromTrash 传回
    pub deleted_at: String,
}
```

**流程**:
1. 取 `DATA_MUTEX` lock
2. 读 `app_data` + 列 trash 子目录
3. 检查同名:
   - `~/.ensemble/skills/<name>/` 存在 → has_local = true
   - `~/.ensemble/trash/skills/` 含 `<name>` 或 `<name>_<ts>` → has_trashed = Some(...)
   - 两者都有 → `Ok(InstallOutcome::NameCollision { ... })` 直接返回(让前端弹 Modal)
4. 若 `conflict_action = None` 且无冲突 → 走真实下载 + 装(走 GitHub Contents API 拉整个 `skill_path/` 目录,递归 `getContents` → 每文件 `fs::write` 到 `~/.ensemble/skills/<name>/`)
5. 若 `conflict_action = Some(Replace)`:
   - 把 `~/.ensemble/skills/<name>/` move to trash(`fs::rename` 到 `~/.ensemble/trash/skills/<name>_<timestamp>`)
   - data.json `skill_metadata.remove(<old_id>)`(metadata 不继承)
   - 走真实下载 + 装(同上)
6. 若 `conflict_action = Some(RestoreFromTrash { trash_path })`:
   - `fs::rename(trash_path, ~/.ensemble/skills/<name>/)`
   - data.json metadata 继承(如果 trash 中带的话 — 实际 trash skill 没有 metadata,见 R3 §7.3,所以 V1 用户从 Trash 恢复只能拿物理文件,metadata 用 marketplace 的元数据填)
   - **不**走下载(用户选择"恢复我之前的"即放弃新版)
7. 装完后:写 `SkillMetadata` 含 `install_source: "marketplace"` + `marketplace_source: { source, owner, repo, name, last_synced_at }` + `installed_at: now`
8. `write_app_data`
9. 释放 lock
10. **后台异步触发** auto_classify(若 `read_settings()?.auto_classify_new_items == true`)— 详 §3.5

**错误模式**:
- `"Network error during download"`
- `"Disk write failed: <io::Error>"`
- `"Skill <name> already exists"`(只在 conflict_action 错误时)

### 3.4 `install_marketplace_mcp(item: MarketplaceMcpItem, conflict_action: Option<ConflictAction>) -> Result<InstallOutcome, String>`

同 3.3,但物理写入是构造 `McpConfigFile` 写入 `~/.ensemble/mcps/<name>.json`:

- **stdio 类**:`McpConfigFile { name, description, command: stdio.command, args: stdio.args, env: HashMap<>::new() (用户后续填), provided_tools: vec![], install_source: Some("marketplace"), marketplace_source: ..., url: None, mcp_type: Some("stdio") }`
- **HTTP 类**:`command: "", args: vec![], env: empty, url: Some(http.url), mcp_type: Some("http")`

**注意 R-57**:McpConfigFile 是第三处构造点,字段必须与 `import.rs` / `plugins.rs` 已构造点保持一致。

### 3.5 `auto_classify_marketplace_item(skill_or_mcp_id: String, item_type: String) -> Result<(), String>`

**新 IPC**(spawn-and-forget,前端调用后立即返回):
1. 入参 `item_type: "skill" | "mcp"`、`skill_or_mcp_id: String`
2. 检查 `read_settings()?.auto_classify_new_items`,false → 立即返回 `Ok(())` 不触发
3. true → tokio::spawn:
   - 从 data.json 读该项 metadata 构造 `ClassifyItem`
   - 调 `auto_classify(items: vec![item], existing_categories, existing_tags, available_icons)`
   - 拿到 `Vec<ClassifyResult>` 长度应为 1
   - 调 `applyClassifyResultsToCategories` 等价的后端版本(创建新 cat/tag if needed → write_app_data)
   - 用 `update_skill_metadata` / `update_mcp_metadata` 应用 categoryId / tags / icon
   - **emit Tauri event**:`app.emit("marketplace:classify-result", payload)`(payload 详 §3.7)
4. 失败时 emit `marketplace:classify-failed` 含 `{ id, type, error }`

### 3.6 `refresh_marketplace_cache(source: String) -> Result<(), String>`

**便捷命令**:source ∈ `"skills" | "mcps"`,触发对应 list 的强制刷新。前端 PageHeader Refresh 按钮调用。

### 3.7 Tauri events(后端 → 前端)

| Event 名 | Payload | 触发点 |
|---|---|---|
| `marketplace:classify-result` | `{ id: string, itemType: "skill" \| "mcp", category: string?, parentCategory: string?, tags: string[], icon: string? }` | 单项分类成功 |
| `marketplace:classify-failed` | `{ id: string, itemType: "skill" \| "mcp", error: string }` | 单项分类失败 |
| `marketplace:stale-cache` | `{ source: "skills" \| "mcps", ageHours: number }` | list 命令命中过期 cache(降级使用) |
| `marketplace:catalog-enhanced` | `{ source: "skills" \| "mcps", addedCount: number }` | 后台爬虫成功增量补充 |
| `marketplace:scrape-degraded` | `{ source: "skills", reason: string }` | skills.sh 爬虫失败(seed 不受影响) |
| `marketplace:upstream-error` | `{ source: "skills" \| "mcps", error: string }` | 上游不可达 / API rate-limited(seed/cache 也无法 fallback 时) |

**前端订阅位置**:`marketplaceStore` 在 store init 时调用 `@tauri-apps/api/event::listen`。

### 3.8 现有 IPC 复用清单(marketplace 流程依赖)

| IPC | 用途 |
|---|---|
| `auto_classify` | A5 单项触发的核心(items 传单元素 vec) |
| `read_app_data` / `write_app_data` | A4 持久化 metadata(在 `DATA_MUTEX` 内) |
| `update_skill_metadata` / `update_mcp_metadata` | 单项分类后应用结果 |
| `list_trashed_items` | 同名碰撞判定 |
| `restore_skill` / `restore_mcp` | 同名碰撞 "Restore from Trash" 选项的物理动作 |
| `read_settings` / `write_settings` | autoClassifyNewItems flag |
| `scan_skills` / `scan_mcps` | install 后前端触发 reload |

---

## 4. Rust 类型扩展

### 4.1 `SkillMetadata` / `McpMetadata`(types.rs:213-245)

**新增字段**:

```rust
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SkillMetadata {
    // ... 现有字段
    #[serde(skip_serializing_if = "Option::is_none")]
    pub install_source: Option<String>,    // "local" | "plugin" | "marketplace"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub marketplace_source: Option<MarketplaceSource>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceSource {
    pub source: String,                     // "skills_sh" | "mcp_registry"
    pub owner: String,
    pub repo: String,
    pub name: String,
    pub last_synced_at: String,
}
```

**`McpMetadata` 镜像**(同两个新字段)。

### 4.2 `Skill` / `McpServer`(types.rs:6-90)

**注释更新**(语义性,不影响 serde):
- types.rs:34 `pub install_source: Option<String>,  // "local" | "plugin" | "marketplace"`
- types.rs:81 同上
- types.rs:347(McpConfigFile)同上

**新增 marketplace_source 字段**(skip_serializing_if = "Option::is_none"):
- Skill struct(types.rs:6-43):新增 `pub marketplace_source: Option<MarketplaceSource>,`
- McpServer struct(types.rs:47-90):同
- McpConfigFile struct(types.rs:330-354):同

### 4.3 scan_skills 注入逻辑(skills.rs:206-218)

**改造**(伪代码):

```rust
let install_source = if let Some(metadata) = metadata_map.get(&skill_path_str) {
    // metadata 含 install_source → 优先用(marketplace 真实拷贝必走此路径)
    metadata.install_source.clone().unwrap_or_else(|| {
        // metadata 无 install_source → fallback 到 symlink 检测
        if is_plugin_symlink(skill_dir) { "plugin".into() } else { "local".into() }
    })
} else {
    // 无 metadata → fallback 到 symlink 检测
    if is_plugin_symlink(skill_dir) { "plugin".into() } else { "local".into() }
};

let marketplace_source = metadata_map.get(&skill_path_str)
    .and_then(|m| m.marketplace_source.clone());

// 把 marketplace_source 注入到 Skill struct 输出
```

### 4.4 scan_mcps 注入(mcps.rs:149-153)

`McpConfigFile` 已经有 `install_source` 字段从 JSON 读;只需新增 `marketplace_source` 字段读取并注入到 `McpServer` 输出。

### 4.5 删除 / Trash / Restore 兼容性

- `delete_skill` / `delete_mcp`(skills.rs:265 / mcps.rs:431):**不需要改**。删除时把目录 move to trash + 清除 metadata,marketplace_source 自然丢失(R-3 已记)。Restore 时 metadata 是空的(用户得重新分类),与本地资源同行为。
- 这个**不偏离 PRD §7.6 的"Restore from Trash 时 metadata 全部继承"** — 因为该 PRD 段落特指"marketplace 同名碰撞 Modal 的 Restore 选项",此时旧版本是 marketplace 装的(metadata 应已存在 marketplace_source);从 Trash 恢复物理目录后,**前端 marketplaceStore 主动用 marketplace 的元数据补 metadata**(因为 Trash 不存 metadata)。这是 §6.4 路径的实施细节。

### 4.6 `AppData`(types.rs:177-210)— **不新增字段**

理由:R-49 P2 已登记"是否新建 marketplaceMetadata 集合 vs 复用 skillMetadata"。本轮决策走"复用 skillMetadata + marketplace_source 子字段"(D-Imp-4)。**AppData top-level 不新增** `imported_marketplace_skills` 等列表(R-36 已登记需避免膨胀)。

---

## 5. TS 类型扩展

### 5.1 `src/types/index.ts:2` 死代码删除

```ts
// 删除以下整行:
export type InstallSource = 'manual' | 'import' | 'npx' | 'plugin';
```

### 5.2 三态扩展

```ts
// src/types/index.ts:32 (Skill)
installSource?: 'local' | 'plugin' | 'marketplace';

// src/types/index.ts:70 (McpServer)
installSource?: 'local' | 'plugin' | 'marketplace';
```

### 5.3 新增 Marketplace 类型

新文件 `src/types/marketplace.ts`(避免污染 index.ts):

```ts
export type MarketplaceSourceKind = 'skills_sh' | 'mcp_registry';

export interface MarketplaceSource {
  source: MarketplaceSourceKind;
  owner: string;
  repo: string;
  name: string;
  lastSyncedAt: string;
}

export interface MarketplaceSkillItem {
  id: string;
  name: string;
  description: string;
  readmeMarkdown: string;
  author: string;
  owner: string;
  repo: string;
  skillPath: string;
  homepageUrl: string;
  lastUpdatedAt: string;
  stars: number;
  categories: string[];
  tags: string[];
  license?: string;
}

export interface MarketplaceMcpItem {
  id: string;
  name: string;
  description: string;
  readmeMarkdown: string;
  author: string;
  repositoryUrl: string;
  lastUpdatedAt: string;
  stars: number;
  categories: string[];
  tags: string[];
  license?: string;
  mcpType: 'stdio' | 'http';
  stdioConfig?: StdioMcpConfig;
  httpConfig?: HttpMcpConfig;
}

export interface StdioMcpConfig {
  command: string;
  args: string[];
  requiredEnvVars: EnvVarSpec[];
}

export interface EnvVarSpec {
  name: string;
  description?: string;
  whereToFind?: string;
}

export interface HttpMcpConfig {
  url: string;
  transport: string;
  oauthAuthorizationUrl?: string;
}

export type ConflictAction =
  | { kind: 'replace' }
  | { kind: 'restoreFromTrash'; trashPath: string };

export type InstallOutcome =
  | { kind: 'installed'; skillId: string }
  | { kind: 'nameCollision'; hasLocal: boolean; hasTrashed?: TrashedItemBrief }
  | { kind: 'failed'; reason: string };

export interface TrashedItemBrief {
  name: string;
  path: string;
  deletedAt: string;
}

export interface MarketplaceClassifyResultEvent {
  id: string;
  itemType: 'skill' | 'mcp';
  category?: string;
  parentCategory?: string;
  tags: string[];
  icon?: string;
}

export interface MarketplaceClassifyFailedEvent {
  id: string;
  itemType: 'skill' | 'mcp';
  error: string;
}

export interface MarketplaceStaleCacheEvent {
  source: 'skills' | 'mcps';
  ageHours: number;
}
```

### 5.4 Skill / McpServer 字段扩展(`src/types/index.ts:4-75`)

```ts
import type { MarketplaceSource } from './marketplace';

// Skill 接口末尾新增:
marketplaceSource?: MarketplaceSource;

// McpServer 同上
```

### 5.5 不偏离原则

`SkillMetadata` 在 TS 端没有独立接口(由 backend `Skill` 拼装而来),所以不需要 TS 侧 `SkillMetadata` 类型新增。`AppData` 接口同样不变。

---

## 6. 前端 marketplaceStore(B2)

**新文件**:`src/stores/marketplaceStore.ts`

### 6.1 State

```ts
interface MarketplaceState {
  // 数据
  skillsCatalog: MarketplaceSkillItem[];
  mcpsCatalog: MarketplaceMcpItem[];
  lastSyncedSkills?: string;                 // ISO,显示 "Last synced X ago"
  lastSyncedMcps?: string;
  staleCacheSkills?: { ageHours: number };
  staleCacheMcps?: { ageHours: number };

  // 加载/错误
  isLoadingSkills: boolean;
  isLoadingMcps: boolean;
  upstreamErrorSkills: string | null;
  upstreamErrorMcps: string | null;

  // 进度态(per-item,资源 entry 维度,跨视图持久化)
  installingItemIds: Set<string>;
  installFailedItems: Record<string, { error: string; attemptedAt: string }>;
  classifyingItemIds: Set<string>;
  classifyFailedItemIds: Set<string>;

  // Filter
  skillsFilter: { search: string; categoryId: string | null; tags: string[]; sort: 'popularity' | 'alphabet' | 'updated' };
  mcpsFilter: { search: string; categoryId: string | null; tags: string[]; sort: 'popularity' | 'alphabet' | 'updated' };

  // 选择(SlidePanel 详情)
  selectedSkillItemId: string | null;
  selectedMcpItemId: string | null;

  // 同名碰撞 Modal 状态(集中管理)
  collisionModalState: {
    open: boolean;
    item: MarketplaceSkillItem | MarketplaceMcpItem | null;
    itemType: 'skill' | 'mcp' | null;
    hasLocal: boolean;
    hasTrashed?: TrashedItemBrief;
  };

  // 安装成功 short-cut banner(D-Imp-6,active Scene + AddToScenePopover)
  shortcutBannerState: {
    visible: boolean;
    itemType: 'skill' | 'mcp' | null;
    targetItemId: string | null;            // 已装后的 Skill.id / MCP.id(不是 marketplace itemId)
    activeSceneId: string | null;           // 用户最近编辑的 Scene id;null 时显示 "Create your first Scene"
    activeSceneName: string | null;
  };

  // AddToScenePopover 状态(详情面板内嵌 popover)
  addToScenePopoverState: {
    open: boolean;
    targetItemId: string | null;            // 已装后的 Skill.id / MCP.id
    itemType: 'skill' | 'mcp' | null;
    initialSelectedSceneIds: string[];      // 弹出时已含本资源的 Scene id(用于 checkbox 初始勾选 + diff)
    triggerRect?: DOMRect;                  // popover 锚点定位
  };

  // Onboarding banner
  onboardingDismissedSkills: boolean;
  onboardingDismissedMcps: boolean;
}
```

### 6.2 Actions(签名级)

```ts
interface MarketplaceActions {
  // Catalog
  loadSkillsCatalog(refresh?: boolean): Promise<void>;
  loadMcpsCatalog(refresh?: boolean): Promise<void>;

  // Install
  installSkill(item: MarketplaceSkillItem, conflictAction?: ConflictAction): Promise<void>;
  installMcp(item: MarketplaceMcpItem, conflictAction?: ConflictAction): Promise<void>;

  // Filter / select
  setSkillsFilter(filter: Partial<MarketplaceState['skillsFilter']>): void;
  setMcpsFilter(filter: Partial<MarketplaceState['mcpsFilter']>): void;
  selectSkillItem(id: string | null): void;
  selectMcpItem(id: string | null): void;

  // Collision modal
  openCollisionModal(state: MarketplaceState['collisionModalState']): void;
  closeCollisionModal(): void;
  resolveCollision(action: ConflictAction): Promise<void>;  // 包含 install 流程后续

  // Failure / retry
  retryInstall(itemId: string, itemType: 'skill' | 'mcp'): Promise<void>;
  clearInstallFailure(itemId: string): void;

  // Onboarding
  dismissOnboarding(kind: 'skills' | 'mcps'): void;

  // Short-cut banner(D-Imp-6,active Scene)
  showShortcutBanner(targetItemId: string, itemType: 'skill' | 'mcp'): void;  // install 成功后调用
  dismissShortcutBanner(): void;
  addToActiveScene(): Promise<void>;       // 短链 banner 点击 "Add to active Scene: <name>" 触发

  // AddToScenePopover
  openAddToScenePopover(targetItemId: string, itemType: 'skill' | 'mcp', triggerRect: DOMRect): void;
  closeAddToScenePopover(): void;
  saveSceneAssignments(selectedSceneIds: string[]): Promise<void>;             // diff initial vs selected → updateScene 多次

  // Selectors(派生)
  isSkillInstalled(item: MarketplaceSkillItem): boolean;   // 通过 useSkillsStore.skills 派生
  isMcpInstalled(item: MarketplaceMcpItem): boolean;
  getFilteredSkills(): MarketplaceSkillItem[];
  getFilteredMcps(): MarketplaceMcpItem[];

  // Tauri event 订阅初始化(仅在 store 创建时调用一次)
  initEventListeners(): () => void;  // 返回 unsubscribe
}
```

### 6.3 SSoT 客户端实现(D-Imp-8 三元组优先 + name fallback)

```ts
isSkillInstalled: (item) => {
  const skills = useSkillsStore.getState().skills;
  // 优先三元组匹配(marketplace 装过的有 marketplaceSource)
  const tripleMatch = skills.find((s) =>
    s.marketplaceSource?.owner === item.owner
    && s.marketplaceSource.repo === item.repo
    && s.marketplaceSource.name === item.name
  );
  if (tripleMatch) return true;
  // fallback name 匹配
  return skills.some((s) => s.name.trim() === item.name.trim());
}
```

### 6.4 跨页同步契约

- `installSkill` 成功后:`await useSkillsStore.getState().loadSkills()`
- `installMcp` 成功后:`await useMcpsStore.getState().loadMcps()`
- `restoreFromTrash` 路径:先 `useTrashStore.restoreSkill(trashPath)` → 再 `loadSkills`
- 任何 install 入口前:`if (!useTrashStore.getState().trashedItems) await useTrashStore.getState().loadTrashedItems()`

### 6.5 失败态绑定(R1-P0-5 / PR-mfb)

- `installFailedItems[itemId] = { error, attemptedAt }` — 用 itemId(三元组 hash)作 key
- 列表项与详情按钮均订阅 `installFailedItems[currentItemId]`,显示 `Retry` 按钮 + 错误文案
- `Retry` 按钮:`actions.retryInstall(itemId)` → 清 `installFailedItems[itemId]` → 重新调 install

---

## 7. 组件清单与文件名

### 7.1 新建组件

| 文件 | 职责 | 大小预估 |
|---|---|---|
| `src/pages/SkillMarketplacePage.tsx` | Skill Marketplace 页(列表 + inline 详情) | ~700 行 |
| `src/pages/McpMarketplacePage.tsx` | MCP Marketplace 页(同 + stdio/HTTP 配置区) | ~750 行 |
| `src/components/marketplace/MarketplaceListItem.tsx` | 列表项(共用 Skill/MCP) | ~250 行 |
| `src/components/marketplace/MarketplaceCollisionModal.tsx` | 同名碰撞 Modal | ~200 行 |
| `src/components/marketplace/MarketplaceShortcutBanner.tsx` | 安装成功 short-cut 引导(支持 active Scene 显示) | ~120 行 |
| `src/components/marketplace/AddToScenePopover.tsx` | 详情面板内嵌 Add to Scene popover(D-Imp-6) | ~200 行 |
| `src/components/marketplace/MarketplaceOnboardingBanner.tsx` | 首次进入 onboarding | ~60 行 |
| `src/components/marketplace/MarketplaceSourceBadge.tsx` | 详情面板 Source 行展示 marketplace 来源 | ~50 行 |
| `src/stores/marketplaceStore.ts` | 状态管理 | ~600 行 |
| `src/types/marketplace.ts` | 类型 | ~120 行 |
| `src-tauri/src/commands/marketplace.rs` | 后端命令 | ~600 行 |
| `src-tauri/src/commands/marketplace_seed.rs` | Skill seed 名单 | ~80 行 |

### 7.2 修改文件清单

| 文件 | 改动 |
|---|---|
| `src/components/layout/Sidebar.tsx` | C1:Header 与 NAVIGATION 之间插入 MARKETPLACE 段(:276 与 :278 之间) |
| `src/components/layout/Sidebar.tsx:43` | `activeNav` 联合追加 `'marketplace-skills' \| 'marketplace-mcps'` |
| `src/App.tsx` | C1:新增 2 路由 `marketplace-skills` / `marketplace-mcps`(无 lazy load) |
| `src/components/layout/MainLayout.tsx:354-372` | C1:`getActiveNav()` 追加两个 path 分支 |
| `src/types/index.ts:2` | B1:删死代码 `InstallSource` alias |
| `src/types/index.ts:32, 70` | B1:installSource 三态 |
| `src/types/index.ts` Skill / McpServer 字段尾部 | B1:新增 `marketplaceSource?: MarketplaceSource;` |
| `src/stores/skillsStore.ts:469-478` | **不改**(marketplace 走默认非 plugin 分支天然不沉底,R-4) |
| `src/stores/mcpsStore.ts:503-513` | **不改**(同上) |
| `src/stores/settingsStore.ts:77` | B4:`defaultSettings.autoClassifyNewItems = true` |
| `src/pages/SettingsPage.tsx` | C1:新增一个 Toggle 暴露 `autoClassifyNewItems` flag |
| `src/pages/SkillsPage.tsx:212-225` | C6:新增 `useSearchParams` 监听初始化 `selectedSkillId`(支持 `?selected=<id>` 短链) |
| `src/pages/SkillsPage.tsx:638-655` Source section / `src/pages/McpServersPage.tsx:611+ Source` | C7:在 `installSource === 'plugin'` 分支后追加 `installSource === 'marketplace'` 分支 |
| `src/components/skills/SkillDetailPanel.tsx:586` / `McpDetailPanel.tsx:538` | C7:同上 |
| `src-tauri/src/types.rs:34, 81, 347` | A1:三态注释 |
| `src-tauri/src/types.rs:213-245` | A1:`SkillMetadata` / `McpMetadata` 新增 `install_source` + `marketplace_source` |
| `src-tauri/src/types.rs:6-90` | A1:`Skill` / `McpServer` 新增 `marketplace_source` 字段 |
| `src-tauri/src/types.rs:330-354` | A1:`McpConfigFile` 新增 `marketplace_source` |
| `src-tauri/src/commands/skills.rs:206-218` | A1:scan_skills 注入逻辑改 metadata 优先 |
| `src-tauri/src/commands/mcps.rs:149-153` | A1:scan_mcps 注入 marketplace_source |
| `src-tauri/src/lib.rs:66-165` | A2:注册 6 个 marketplace IPC |

### 7.3 不修改的关键文件(范围控制)

- `src/components/layout/SlidePanel.tsx` — 完全复用
- `src/components/layout/PageHeader.tsx` — 完全复用
- `src/components/skills/SkillListItem.tsx` — 不改(marketplace 列表项是新组件)
- `src/components/mcps/McpListItem.tsx` — 不改
- `src/components/skills/SkillDetailPanel.tsx` 主体 — 不改(只 Source section 的现有 if/else 内追加分支)
- `src-tauri/src/commands/import.rs` — 不改(marketplace 不复用 `copy_skill` 短路逻辑;R-1 通过新建 install_marketplace_* 命令绕开)
- `src-tauri/src/commands/classify.rs` — 不改(`auto_classify` 接受单元素 vec,通过新增 `auto_classify_marketplace_item` IPC 在 marketplace.rs 内调用)
- `src-tauri/src/commands/trash.rs` — 不改(marketplace 通过 IPC 复用现有 `restore_skill` / `restore_mcp`)
- `src-tauri/src/commands/config.rs` — 不改(R-32:Sync 行为完全同模式)

---

## 8. 状态机契约

### 8.1 Install 按钮三态(每个 marketplace 列表项 + 详情面板按钮共享)

```
[Install]  (default, primary variant, enabled)
   │
   │ user click
   ▼
[Installing...] (loading prop, disabled)
   │
   │ install IPC resolves
   ├─ Installed ────────► [Installed ✓] (status badge variant, hover tooltip "Categorized as: <cat>")
   ├─ NameCollision ────► (open Modal, button stays Installing... 不变)
   │     └─ Modal close (Cancel) ─► back to [Install]
   │     └─ Modal Replace ────────► continue install with conflict_action
   │     └─ Modal Restore ────────► restore IPC + back to [Install] OR [Installed]
   └─ Failed ────────────► [Retry] (primary variant, enabled, hover tooltip with error)
```

**态切换契约**:
- `Installing...` 期间 button disabled,防重复点
- `Installed ✓` 是 Badge status variant,**不**是 Button — 列表点击仍打开详情(浏览已装项),但不触发 install
- `Retry` 仍是 Button primary variant — **不引入"按钮变红"新视觉**(R3-P0-3 / PRD §5.5)
- 失败态绑定到 `installFailedItems[itemId]`(资源 entry 维度),跨页面切换持久化

### 8.2 单项 Auto-Classify 行级反馈

```
[Installed]  (just installed)
   │
   │ store fires auto_classify_marketplace_item IPC (background)
   │ 同时 row 进入 classifyingItemIds set
   ▼
[Installed ✓ <ai-spinner inline>]  (右段 button 旁边追加 8x8 spinner)
   │
   │ tauri event 'marketplace:classify-result' arrives
   ├─ Success ──► [Installed ✓]  (200ms checkmark fade-in,然后回到稳态)
   │              + tooltip "Categorized as: <category>"
   └─ Failure ──► [Installed ✓] + 紧邻一行小字 "Auto-classify failed — assign manually"
                  (出现在 Skills 列表的对应 row,不在 Marketplace 列表)
                  (Marketplace 列表 spinner 消失,无失败感知)
```

**注意**:Marketplace 列表行级反馈与 SkillsPage 列表行级反馈是两个 view layer。具体:
- Marketplace 列表:行级 spinner 200ms 淡出(D-Imp / R2 §7.3 简化版)
- Skills 列表:row 显示 "Auto-classify failed" inline(在 Skills 列表新增一个 row-level 状态显示;C7 任务)

### 8.3 Catalog 加载 / 缓存命中

```
[empty / first visit] ─► loadSkillsCatalog()
   │
   │ refresh = false
   ▼
[reading cache]
   ├─ cache valid (< 24h) ─► render items, lastSyncedAt = cache.lastSyncedAt
   ├─ cache stale ─► HTTP refresh
   │   ├─ success ─► render new items, write cache
   │   └─ failure ─► render stale cache + emit 'marketplace:stale-cache'
   │       └─ frontend shows "Last synced 36h ago" + amber tone
   └─ cache missing ─► HTTP refresh
       ├─ success ─► render new items
       └─ failure ─► EmptyState(WifiOff)
```

---

## 9. 关键 UX 文案表

| 场景 | 文案 | 备注 |
|---|---|---|
| Sidebar 段标题 | `MARKETPLACE` | 与 CATEGORIES / TAGS 同 uppercase 模式 |
| Sidebar nav item 1 | `Skill Marketplace` | D-2 锁定 |
| Sidebar nav item 2 | `MCP Marketplace` | 同 |
| PageHeader Skill | `Skill Marketplace` | |
| PageHeader MCP | `MCP Marketplace` | |
| SearchInput placeholder Skill | `Search skills...` | 与 SkillsPage 同 |
| SearchInput placeholder MCP | `Search MCP servers...` | |
| Refresh button | `Refresh`(icon RotateCw) | 沿用 lucide |
| Sort dropdown | `By Popularity / Alphabetical / Recently Updated` | D-Imp-5 |
| Install button(default) | `Install` | |
| Install button(loading) | `Installing...` | Button loading prop |
| Installed badge | `Installed`(Badge status variant + Check 12px icon) | |
| Retry button(failed) | `Retry`(primary variant) | hover tooltip = error |
| stdio MCP button(installed without env) | `Installed — needs setup` | D-12 |
| HTTP MCP OAuth 提示 | `After installing, run /mcp in your Claude Code session to complete authentication.` + [Copy command] | D-12 |
| 同名碰撞 Modal title | `<name> already exists in your library.` | |
| 同名 Modal Cancel button | `Cancel` | secondary,默认 focus(无 Trash 时) |
| 同名 Modal Replace button | `Replace existing` | primary |
| 同名 Modal Restore button(if Trashed exists) | `Restore from Trash` | primary,默认 focus(有 Trash 时) |
| 同名 Modal description(无 Trash) | `Replacing will move the existing version to Trash. Your category, tags, and custom icon will not be carried over.` | |
| 同名 Modal description(有 Trash) | `A previously deleted version exists in Trash. Restoring will recover your category, tags, and custom icon.` | |
| 离线 EmptyState title | `Marketplace temporarily unavailable` | D-10 / R3-P2-5 中立文案 |
| 离线 EmptyState description | `This may be a network issue or upstream service outage.` | |
| 离线 EmptyState action | `Retry`(secondary) | |
| No results title | `No skills match your filters` / `No MCP servers match your filters` | |
| No results description | `Try adjusting your search or category selection.` | |
| Stale cache indicator(列表上方) | `Last synced N hours ago` + Refresh button | |
| Onboarding banner(首次) | `New here? These are popular Skills others are using.` / `... popular MCP servers.` | |
| Short-cut banner(安装成功 5s 内) — 有 active Scene | `Installed in your library.` + `View in Skills →` + `Add to active Scene: <name> →` + `[Add to Scene...]` button | D-Imp-6 修订 |
| Short-cut banner — 无 active Scene(用户从未编辑过 Scene) | `Installed in your library.` + `View in Skills →` + `Create your first Scene →` | D-Imp-6 |
| Short-cut banner(关闭) | `×` icon button,关闭后该项 install 周期不再显示 |
| AddToScenePopover title | `Add to Scenes` |
| AddToScenePopover row(每 Scene 一行) | checkbox + Scene name + 当前是否已含本资源(check icon if 已含) |
| AddToScenePopover Save button | `Save` (primary) |
| AddToScenePopover Cancel button | `Cancel` (secondary) |
| AddToScenePopover empty state(用户 0 个 Scene) | `No scenes yet. ` + `Create your first Scene →`(navigate `/scenes`) |
| 详情面板 Add to Scene button | `Add to Scene...` (secondary variant + Plus icon) |
| 详情面板 Used in X Scenes | `Used in 3 Scenes`(实时从 useScenesStore 派生) | |
| Auto-classify failure inline(Skills 列表 row 内) | `Auto-classify failed — assign manually` + click → 展开手动分类入口 | R1-P0-4 |
| 详情面板 Source 行 marketplace 来源 | `<owner>/<repo>` (link to GitHub) | |
| stdio MCP env vars 区段标题 | `Required environment variables (this MCP won't work without them)` | D-12 |
| stdio MCP env vars Save button | `Save environment variables` | D-Imp-9 |
| stdio MCP env vars Save 成功 | `✓ Saved`(200ms inline) | |
| stdio MCP env vars 字段必填错误 | `Required` | red |
| Settings autoClassifyNewItems toggle label | `Auto-classify newly installed items` | D-Imp-12 |
| Settings autoClassifyNewItems toggle hint | `When enabled, items installed from the Marketplace will be automatically categorized.` | |

---

## 10. 键盘快捷键 + 可访问性

### 10.1 快捷键(本轮新增)

- **无 marketplace 专属快捷键**(避免增加用户认知负担)
- 沿用现有 — Search input 的 `Esc` 清空、`Enter` 触发 immediate filter(已存在)
- 同名碰撞 Modal:`Esc` 等价 Cancel(沿用 Modal 组件现有 `closeOnOverlayClick` + Esc handler);`Enter` 触发当前 focus 的 button(沿用 native focus)

### 10.2 ARIA / 可访问性

- Sidebar Marketplace 段:`<nav aria-label="Marketplace">` 包裹 nav items;段标题 `<h3 id="marketplace-section-label">` + nav items 容器 `aria-labelledby="marketplace-section-label"`
- Marketplace 列表 row:`role="button"` + `tabIndex=0` + `aria-pressed` 表示 selected 态
- Install button 状态变化:`aria-live="polite"` 区域宣告 `Installing...` / `Installed`(可选 V1.5 增强,V1 不强制)
- 同名碰撞 Modal:`role="alertdialog"` + `aria-labelledby` + `aria-describedby`(沿用现有 Modal 组件,无需重写)
- EmptyState:`role="status"` + WifiOff icon `aria-hidden="true"` + 文字内容自然可读

### 10.3 reduced-motion

新组件添加任何 transition / animation,**必须同步在 `src/index.css` 内追加 reduced-motion fallback** — 沿用现有 §671-680 模式。具体清单:

```css
@media (prefers-reduced-motion: reduce) {
  /* Marketplace listitem rightSectionStyle transition */
  [data-marketplace-list-item] *,
  /* Install spinner */
  [data-marketplace-installing] .ai-spinner,
  /* Short-cut banner fade */
  [data-marketplace-shortcut-banner] {
    transition: none !important;
    animation: none !important;
  }
}
```

---

## 11. SSoT 实现要求(§7.4 PRD)

### 11.1 后端 helper(marketplace.rs 内)

```rust
fn is_skill_in_trash(skill_name: &str) -> bool {
    let trash_dir = get_app_data_dir().join("trash/skills");
    if !trash_dir.exists() { return false; }
    fs::read_dir(trash_dir).ok().map(|rd| {
        rd.filter_map(|e| e.ok())
          .any(|e| {
              let n = e.file_name();
              let s = n.to_string_lossy();
              s == skill_name || s.starts_with(&format!("{}_", skill_name))
          })
    }).unwrap_or(false)
}
```

McpVersion 镜像。`install_marketplace_skill` 命令第 3 步用此 helper 判定 has_trashed。

### 11.2 前端 selector(marketplaceStore 内)

详 §6.3 `isSkillInstalled`。**关键**:不查 data.json metadata,**只**通过 `useSkillsStore.skills` 派生。理由:`scan_skills` 已经返回"自有路径存在 + metadata 存在 + 不在 trash 子目录"三个条件的合集(R3 §3.4 / R4 §6.1)。

### 11.3 跨视图同步保证

**任一改变 SSoT 三条件之一的动作,必须主动调用 `useSkillsStore.loadSkills()` (或 mcps)**:
- install 成功 → loadSkills(条件 1+2 变化)
- delete(从 SkillsPage) → 自动 reload(skillsStore.deleteSkill 已实现)
- restore from trash → loadTrashedItems + loadSkills

---

## 12. PRD 偏离登记(供 reviewer 检查)

参 `00_round_plan.md §6` D-Imp-1 ~ D-Imp-12 + Plan 文件 `/Users/bo/.claude/plans/toasty-mixing-salamander.md` 的"实施层降级登记"表(用户决策已反映)。

**用户在 Plan 模式 explicit 决策的两条修订**:

- **D-Imp-1(用户选项 3 混合方案)**:Skill 数据源 = seed 名单(基线层立即可用)+ 异步爬 skills.sh top-100(增强层后台补充)。详 §1.1。
- **D-Imp-6(用户选项 B active Scene + popover)**:安装成功 short-cut = 详情面板内嵌 AddToScenePopover + active Scene banner。详 §6.1 / §7.1 AddToScenePopover.tsx / §9 文案表。

**其他 D-Imp 不变**:
- D-Imp-5:Sort 文案统一为 By Popularity(V1 简化)
- D-Imp-7:View in Skills 走 URL query param
- D-Imp-9:stdio env vars 显式 Save 按钮
- D-Imp-10:HTTP Client 单例用 std OnceLock
- 其他

**所有偏离都不反转 D-1~D-15 决策,不放回 V1 Out 项**。Reviewer 4(范围控制)用此清单检查。

---

## 13. 任务卡分阶段拆分(对 03_task_cards.md 的 outline)

**Phase A**(后端,1 SubAgent 串行):
- 任务卡 A1-A6:`backend.md`,见 03_task_cards.md

**Phase B**(前端 stores/types,1 SubAgent 串行):
- 任务卡 B1-B4:`frontend-data.md`

**Phase C**(UI,多 SubAgent 并行):
- C1:Sidebar + Routing + Settings toggle
- C2:SkillMarketplacePage(完整 + ListItem 内嵌使用 + onboarding banner)
- C3:McpMarketplacePage(完整 + stdio/HTTP 配置区)
- C4:MarketplaceListItem(C2/C3 共用,在 C2 任务内一并产出,C3 直接 import)
- C5:MarketplaceCollisionModal + Trash restore 端到端
- C6:MarketplaceShortcutBanner + EmptyState 离线/错误 + SkillsPage `?selected=` query param 支持
- C7:SkillDetailPanel / McpDetailPanel "Source" 行扩展 marketplace 来源 + Settings autoClassify toggle
- C8:AddToScenePopover + ScenesStore active Scene + ShortcutBanner 整合 active Scene(D-Imp-6)

**Phase A 扩展**(因 D-Imp-6):
- AppData 新增 `last_edited_scene_id: Option<String>` 字段(types.rs:177-210)
- `add_scene` / `update_scene` IPC 内更新此字段

**Phase B 扩展**(因 D-Imp-6):
- ScenesStore 镜像 `lastEditedSceneId: string | null` + 在 addScene / updateScene 时更新

**任务卡详细内容**(每卡含必读清单 / 改造目标 / 完成标准 / 出验证物)由 03_task_cards.md 撰写。本文件仅给 outline。

---

## 14. 实施过程的纪律

### 14.1 grep-before-enumerate(PR-mfb / R3 §4)

每个改 data.json 的 SubAgent **完成前**必须重跑:

```bash
cd src-tauri
rg -n 'read_app_data|write_app_data' --type rust
rg -n 'data_path|app_data\.\w+_metadata|fs::write.*data\.json' --type rust
```

新增的 callsite 必须在 `DATA_MUTEX` 之内。

### 14.2 verify-third-party-behavior-firsthand

reqwest / GitHub API / Official MCP Registry 接入时:
- reqwest:`#[derive(Deserialize)]` 解析 `serde_json::Value` 还是显式 struct → 显式 struct(V1 用 reqwest `.json::<MarketplaceCatalog>()` 解析)
- GitHub Contents API:`Accept: application/vnd.github+json` + `X-GitHub-Api-Version: 2022-11-28`(GitHub 官方推荐头部,实施 SubAgent 必须读 GitHub docs 验证)
- `node_modules/@tauri-apps/api/event/index.d.ts` 验证 `listen(event, callback)` 签名(B2 SubAgent 必须读)

### 14.3 fix-must-define-user-observable-success

每个 SubAgent 任务卡完成时必须写"用户做 X 看到 Y / 用户不做 Z"三行(详 03_task_cards.md)。

### 14.4 cascade discipline

本文件(02_tech_spec.md)是 Decisional;若实施过程发现需要修订,SubAgent 必须**先**修订本文件 + 在 Revision History 列出 cascade footprint(影响哪些任务卡 / 哪些已完成代码)+ 通知主 Agent → 再继续。

---

**02_tech_spec 结束。下游必读 03_task_cards.md 获取本人的任务卡。**
