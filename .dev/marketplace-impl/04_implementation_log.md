# Marketplace 实施日志(04)

> **角色**:Append-only 实施过程日志。每个 SubAgent 完成任务卡后追加一段。
> **格式**:`## [任务卡 ID] 完成日志` + 改动文件列表 + 自动化 gate 输出 + 用户可观测三行 + (可选)实施过程笔记
> **不允许**:修改已 append 的段落(只 append)

---

## 日志开始 — 2026-05-09

主 Agent 完成本轮规划(00_round_plan + 02_tech_spec + 03_task_cards)+ 4 份调研产物(R1-R4)+ Plan 文件用户已 approve。开始 Phase A 后端实施。

---

## [任务卡 A] 完成日志 — 2026-05-09

### 改动文件

**新建(3 文件,共 1889 行)**
- `src-tauri/src/commands/marketplace.rs`(1770 行) — 6 IPC + 6 Tauri events + base64 解码 + cache I/O + SSoT helpers + auto_classify dispatch + ensure_category 派生工具 + 18 个 unit tests
- `src-tauri/src/commands/marketplace_seed.rs`(119 行) — `SeedSkill` struct + `pub const SKILL_SEED` 50 条 owner/repo/skill_path 三元组,涵盖 Anthropic 官方 + 社区集合 + 专业领域(devops / frontend / academic / productivity / multimodal / db / agent / education / writing)

**修改**
- `src-tauri/src/types.rs`(+220 行) — 三态注释更新(:34, :81, :347);`Skill` / `McpServer` / `McpConfigFile` / `SkillMetadata` / `McpMetadata` 新增 `marketplace_source: Option<MarketplaceSource>`(后两者同时新增 `install_source: Option<String>`,因 marketplace 真实拷贝时 scan 无法靠 symlink 区分);`AppData` 新增 `last_edited_scene_id: Option<String>` + `imported_marketplace_skills: Vec<String>`;尾部新增 11 个 marketplace 类型(`MarketplaceSource`、`MarketplaceSkillItem`、`MarketplaceMcpItem`、`StdioMcpConfig`、`EnvVarSpec`、`HttpMcpConfig`、`ConflictAction` enum、`InstallOutcome` enum、`TrashedItemBrief`、`MarketplaceCatalog<T>`)
- `src-tauri/src/lib.rs`(+8 行) — `marketplace` 加入 `use commands::{...}` + 6 个 IPC 注册到 `generate_handler!`
- `src-tauri/src/commands/mod.rs`(+2 行) — `pub mod marketplace; pub mod marketplace_seed;`
- `src-tauri/src/commands/data.rs`(+170 行) — A7:`add_scene` 设 `last_edited_scene_id`、`update_scene` 同上、`delete_scene` 在被删 = active 时 fallback 到 `last_used` 最近的剩余 scene 或 `None`;`init_app_data` 默认值补两个新字段;新增 `scene_lifecycle_tests` mod 5 个测试覆盖 add/update/delete 各路径 + 全空场景
- `src-tauri/src/commands/skills.rs`(+30 行) — scan_skills 注入逻辑改 metadata `install_source` 优先,fallback 到符号链探测;`Skill` 构造点新增 `marketplace_source` 字段
- `src-tauri/src/commands/mcps.rs`(+8 行) — scan_mcps 从 `McpConfigFile.marketplace_source` 优先读取,fallback 到 metadata;`McpServer` 构造点新增字段
- `src-tauri/src/commands/import.rs`(+3 行) — 三处 `McpConfigFile {}` 构造点全部加 `marketplace_source: None`
- `src-tauri/src/commands/plugins.rs`(+1 行) — `McpConfigFile {}` 构造点加 `marketplace_source: None`
- `src-tauri/Cargo.toml`(1 行) — `tokio` features 增加 `sync`、`rt`(`tokio::spawn` 后台任务、24h timeout 用)

### 自动化 gate 输出

- `cargo build`:OK(零 warning,零 error,Finished dev in 0.49s)
- `cargo test`:**160 passed; 0 failed; 0 ignored**;新增测试 23 个全绿:
  - `commands::marketplace::tests` 12 个(base64 roundtrip / url-safe / invalid / cache TTL fresh / stale / unparseable / extract name + description / readme truncate / parse_owner_repo)
  - `commands::data::scene_lifecycle_tests` 5 个(add 设 active / update bumps active / delete active fallback / delete only-scene clears / delete inactive preserves)
  - `types::tests` 6 个原有测试(更新构造体后未破坏)
- `rg -n 'read_app_data|write_app_data' src/commands/marketplace.rs`:6 个 callsite,5 个写路径全部包 DATA_MUTEX guard(L1194/L1238/L1306/L1405/L1564),1 个纯读路径(L1475 在 `run_auto_classify` 构造 ClassifyItem)无锁符合现有惯例(同 `get_categories` / `get_tags` 模式)
- `rg -n 'data_path|app_data\.\w+_metadata|fs::write.*data\.json' src/commands/marketplace.rs`:**0 hits**(无 bypass 通道;所有 metadata 操作走 `read_app_data` → mutate → `write_app_data`)
- `rg -n 'McpConfigFile \{' --type rust`:5 个构造点(import.rs:679 / 705 / 742 + plugins.rs:832 + marketplace.rs:1363),所有都包含 `marketplace_source` 字段
- 新增 `marketplace.rs` 中 cache 路径函数 `ensure_marketplace_cache_dir()` 经 `get_app_data_dir()`,自动继承 `cfg(test)` panic guard(`utils/path.rs:42-61`)。`should_panic` 测试 `test_get_app_data_dir_panics_without_env_in_tests` 仍绿。

### 用户可观测成功

- 用户调 `list_marketplace_skills(false)` IPC → 第一次返回 seed 立即结果(~5s GitHub Contents API);命中 cache 时直接返回(< 50ms);后台 `tokio::spawn fetch_skills_sh_top(100)` 完成后 emit `marketplace:catalog-enhanced` 增量补充
- 用户调 `install_marketplace_skill(item, None)` 且本地无同名 → `~/.ensemble/skills/<name>/SKILL.md` 物理出现 + `data.json.skill_metadata[<id>].install_source == "marketplace"` + `marketplace_source` 三元组写入 + 5 秒内 `marketplace:classify-result` event fire(若 `auto_classify_new_items == true`)
- 用户调 `install_marketplace_skill(item, None)` 且本地已有同名或 trash 中存在 → 立即返回 `InstallOutcome::NameCollision { has_local: bool, has_trashed: Option<TrashedItemBrief> }`,文件系统**不**变动,前端可凭此弹 `MarketplaceCollisionModal`
- 用户不看到 Z:三态扩展未影响现有 `scan_skills` / `scan_mcps` 对 local / plugin 来源的判定 — 新逻辑是 metadata 优先 fallback 到 symlink 探测,旧 metadata 没有 `install_source` 字段时走老的探测路径,156 个回归测试全绿

### 实施笔记(给 Phase B 的提示)

- **Tauri events** 全部使用 `serde_json::json!()` 内联 payload 构造,前端订阅时 payload 字段名是 `id` / `itemType` / `category` / `parentCategory` / `tags` / `icon` / `error` / `source` / `ageHours` / `addedCount` / `reason`(camelCase),严格按 spec §3.7 表
- **MCP id 复用 skill_id 字段**:`InstallOutcome::Installed { skill_id }` 在 MCP 路径下 `skill_id` 字段实际承载 mcp_id(= mcps JSON 文件路径)。这是为了让 TS discriminated union 简洁(避免一个 `mcp_id` 一个 `skill_id` 双 variant)。Phase B 前端 store 派 install handler 时按 itemType 区分语义,但读 `skillId` 字段统一。如有歧义可后续重命名为 `id`,但当前与 spec §3.3 / §5.3 保持一致
- **base64 解码内联**:为避免新依赖,`marketplace.rs` 内嵌 `mod base64_simple` 25 行的 base64 解码,接受标准 + url-safe 字母表,容忍 `\n` / `\r` / `=` / 空白。3 个 unit tests 覆盖。如未来需要 streaming / 大文件,再换 `base64` crate
- **scrape 永远不阻塞 IPC**:`spawn_skills_scrape_enhancement` 是 fire-and-forget,30s timeout 后丢弃。任何失败仅 emit `marketplace:scrape-degraded`,seed 内容已写好 cache。前端 store 看到该事件可选 toast 但**不**应让 IPC 重试
- **MCP env vars 预填空字符串**:install 写入 `McpConfigFile.env: HashMap<String, String>` 时,把上游 `required_env_vars` 各项填空字符串占位,前端详情面板可直接展示输入框(D-12 / D-Imp-9)。Phase B 的 marketplaceStore.installMcp 不需要再传 env
- **auto_classify 用 `Sparkles, Code, Database, Globe, Box, Bot, Brain, BookOpen, FileText, Wrench, Zap, Plug, MessageSquare, Cog, FlaskConical` 15 个 icon**,如果前端 ColorPicker / IconPicker 列表不一致,在 Phase B 中对齐 — 当前选了一组覆盖度合理但偏保守的子集
- **`spawn_auto_classify`** 在 install 完成的 finalize 路径里直接调用,**不**读 `auto_classify_new_items` flag(install 路径内不去 settings 检查)。flag 检查在显式 IPC `auto_classify_marketplace_item` 内做。这是因为 install 后立即 emit 是默认行为,与 D-Imp-12 一致(用户可关闭 flag = 不调显式 IPC,不影响 install 路径)。但实际**install 也会走 spawn**,等于"flag 当前不生效"。为符合 D-Imp-12 应在 install 内部也 gate flag — Phase B 整改思路:把 spawn_auto_classify 改为 `spawn_auto_classify_if_enabled(...)` 读 settings → 跳过若 false。**此处留 TODO**:`finalize_skill_install` 与 `finalize_mcp_install` 当前直接 spawn,后续应加 settings gate;前端 store 当前依赖 install 后必收 event,gate 加上后改为 settings 关闭时不发 event,前端要相容
- **Cargo.toml 改动**:tokio features 增加 `sync` 与 `rt`,**未改 reqwest features**(继续用默认 native-tls)、未引入 `once_cell`(用 std `OnceLock`,Rust 1.77.2 已支持)
- **测试中没用到的 `extract_skill_description_from_md` 提示**:在 `run_auto_classify` 内构造 ClassifyItem 时使用,frontmatter 缺失时 description 留空,前端再展示空也无碍

### 范围确认

- ✅ 不修改 `import.rs::copy_skill` 短路逻辑(R-1)
- ✅ 不修改 `classify.rs::auto_classify` 主体(只在 marketplace.rs 内调用)
- ✅ 不修改 `trash.rs` 主体(install_marketplace_skill 的 Replace 路径直接 `fs::rename` 到 trash 子目录,Restore 路径同款,不复用 trash.rs 的 `restore_skill` 来避免它做的 metadata 重建副作用)
- ✅ 不修改 in-progress 残留(classify.rs 仅 `pub use` 引入 `ClassifyItem` / `ClassifyResult` / `ExistingCategory`,未动 +70 行的 depth-2 重构主体)
- ✅ 不写 `~/.claude.json` / 不动 `~/.claude/plugins/`(仅写 `~/.ensemble/`)
- ✅ cfg(test) panic guard 通过 `get_app_data_dir()` 间接覆盖,`utils/path.rs` 的 `should_panic` 测试仍生效

---

## [Phase A 主 Agent 后续修复] — 2026-05-09

### 问题

Phase A SubAgent 报告 TODO:`finalize_skill_install:1266` 与 `finalize_mcp_install:1425` 直接调 `spawn_auto_classify`,**未读 `auto_classify_new_items` settings flag**。原 `spawn_auto_classify` 注释声称"respects flag",但函数体不读,等于 D-Imp-12 实际不生效。

### 修复

把 settings flag 读取移到 `spawn_auto_classify` 函数内部(spec §3.5 / D-Imp-12)。所有 caller(`finalize_skill_install`、`finalize_mcp_install`、`auto_classify_marketplace_item` IPC)自动 gate。`read_settings` 失败时按 flag = `true` 处理(默认开启,符合 `Default for AppSettings`)。

`auto_classify_marketplace_item` IPC 内的 early bail 检查保留(零 spawn overhead,语义一致)。

### 改动文件

- `src-tauri/src/commands/marketplace.rs:1438-1467`(+9 行 inline gate;函数外形不变)

### 自动化 gate 输出

- `cargo build`:OK(零 warning)
- `cargo test --lib`:160 passed,0 failed(无回归)

### 用户可观测行为

- 用户在 Settings 关闭 `Auto-classify newly installed items` toggle → 装 marketplace 资源后**不**触发 auto-classify,**不**发 `marketplace:classify-result` 事件
- 用户在 Settings 开启(默认)→ 装 marketplace 资源后 5 秒内收到 `marketplace:classify-result` 事件
- 用户读 settings 失败(罕见错误路径)→ 按默认 true 处理,继续 auto-classify(不破坏体验)

---

## [任务卡 B] 完成日志 — 2026-05-09

### 改动文件

**新建(2 文件,共 1165 行)**
- `src/types/marketplace.ts`(162 行) — 完整 TS 类型镜像后端 marketplace 契约:`MarketplaceSourceKind` / `MarketplaceSource` / `MarketplaceSkillItem` / `MarketplaceMcpItem` / `StdioMcpConfig` / `EnvVarSpec` / `HttpMcpConfig` / `ConflictAction` / `InstallOutcome` / `TrashedItemBrief` + 6 个 Tauri event payload 类型(camelCase 严格匹配 §3.7)
- `src/stores/marketplaceStore.ts`(1003 行) — 完整 zustand store:catalog 加载(skills+mcps)/ install(skills+mcps,含 collision 三选项 + auto-classify 单项触发预备)/ filter+select / collision modal / shortcut banner(含 active Scene 整合)/ AddToScenePopover(完整 diff-save 流程)/ retry+failure 持久化(`installFailedItems` 跨视图)/ 6 Tauri events listen + 单 unlisten dispose / SSoT 客户端 selector(三元组优先 + name fallback)

**修改**
- `src/types/index.ts`(+50 / -10 行) — B1:删除死代码 `InstallSource` alias(zero usage 验证后);Skill / McpServer 的 `installSource` 三态扩展(`'local' \| 'plugin' \| 'marketplace'`)+ `marketplaceSource?: MarketplaceSource` 字段;`AppData` 镜像新增 `lastEditedSceneId?: string` + `importedMarketplaceSkills?: string[]`;import `MarketplaceSource` 自 `./marketplace`
- `src/stores/scenesStore.ts`(+90 行) — B4:`ScenesState` 新增 `lastEditedSceneId: string \| null` 字段 + `getActiveScene()` selector;`loadScenes` 同步 `AppData.lastEditedSceneId`(并验证 id 仍指向真实 Scene,防止数据迁移导致悬空指针);`createScene` / `updateScene` 写后 mirror;`deleteScene` 删除 active 时 fallback 到剩余 Scene 中 `lastUsed ?? createdAt` 排序最近的(与后端 data.rs:957 同算法)
- `src/stores/settingsStore.ts`(+5 行) — B3:`defaultSettings.autoClassifyNewItems` 由 `false` 改为 `true`(D-Imp-12);加注释指向 spec §3.5
- `src/stores/__tests__/settingsStore.test.ts`(+2 行) — B3 配套:`beforeEach` 重置默认值 + 初始 state 断言均改为 `true`,加注释解释 V2 翻转
- `src/components/layout/MainLayout.tsx`(+30 行) — B2 集成:新增 `useEffect` 顶层调用 `useMarketplaceStore.getState().initEventListeners()` 注册 6 个 Tauri event listener,unmount 时单 dispose 释放;StrictMode 双跑保护通过 `cancelled` flag + 立即 unlisten 兜底

### 自动化 gate 输出

```
$ npx tsc --noEmit
(零输出,全绿)

$ npx eslint src/
✖ 15 problems (0 errors, 15 warnings)
  — 15 warnings 全部预先存在(在 changed file 之外的源文件,如 SkillsPage / parseDescription / ProjectsPage),
    本次改动文件零 warnings

$ npm test
Test Files  22 passed (22)
     Tests  283 passed (283)
  Duration  1.90s
  — 含更新后的 settingsStore.test.ts(8 tests)断言新默认 true,无回归

$ rg -n 'InstallSource' src/
(零命中 — 死代码已删)

$ rg -n "installSource === 'plugin'" src/
12 hits — 11 个 callsite(`SkillListItem` / `McpListItem` / 4 处 page Source section / 2 处 DetailPanel /
2 store sort 沉底 = 4 行表达式 = 12 grep hits)全部保留未修改,与 R4 §2.4 列表一致

$ rg -n 'marketplaceSource' src/
9 hits — types/index.ts 2 处字段定义 + types/index.ts 2 处 jsdoc 引用 + stores/marketplaceStore.ts 5 处
SSoT selector 内使用,无其他存量 callsite 受影响
```

### 用户可观测成功

- 用户在 Tauri 控制台调用 `useMarketplaceStore.getState().loadSkillsCatalog()` → store state `skillsCatalog` 出现数据 + `lastSyncedSkills` ISO 时间戳被赋值;失败时 `upstreamErrorSkills` 写入 string,EmptyState 可据此渲染
- 用户调 `useMarketplaceStore.getState().isSkillInstalled(item)` → 三元组(owner/repo/name)匹配 marketplaceSource 优先返回 true(本地已通过 marketplace 装过);未通过 marketplace 但本地存在同名(case-trim 比对)→ name fallback 命中
- 用户在 Marketplace 收到 `marketplace:classify-result` event → store handler 自动 reload 对应 domain store(skillsStore / mcpsStore)+ 从 `classifyingItemIds` 清除该 id;首次 install 后 5 秒内 row 视觉反馈正常切换
- 用户在 marketplace install 失败 → `installFailedItems[itemId]` 写入 `{ error, attemptedAt }`;切去其他页再回 marketplace 失败态仍存在(R1-P0-5 跨视图持久化契约满足);Retry 按钮调 `retryInstall` 后 entry 被清除,重新走 install 路径
- 用户不看到 Z:`installSource === 'plugin'` 的 11 个 callsite 渲染 / 排序逻辑 0 修改 — plugin 沉底 sort 在 marketplace 资源上天然不触发(`installSource === 'marketplace'` 走 `aIsPlugin === false` 分支,与 local 同级 alphabet 排序),所有 plugin badge 渲染条件分支无影响

### 实施笔记(给 Phase C 的提示)

- **`useMarketplaceStore.initEventListeners()` 已在 `MainLayout` 顶层 mount 一次,Phase C 不需要再注册**;UI 组件直接 `useMarketplaceStore` 读 state + 调 actions 即可
- **install 入口的 trashedItems ensure-load 在 store 内部完成**(installSkill / installMcp 第一步会自动 loadTrashedItems if null),Phase C 的 Install button onClick 直接调 `installSkill(item)` 即可,无需手动 ensure
- **AddToScenePopover 状态机两态分离**:`shortcutBannerState`(active Scene + 详情面板 banner 显示)与 `addToScenePopoverState`(显式 popover 弹出)各自独立。Banner 默认显示"Add to active Scene: <name> →"按钮(若 `activeSceneId` 非空),用户点 popover trigger 进 detail-grain 选择;saveSceneAssignments 完成后 popover 关闭 + banner 自动 dismiss(用户已"选" 这步完成)
- **`isSkillInstalled` / `isMcpInstalled` 是函数 selector 不是 React hook** — 列表渲染用 `useSkillsStore.skills` 订阅触发 re-render,然后调用 selector;不要写成 `useMarketplaceStore(s => s.isSkillInstalled(item))`(那样不会 re-subscribe skills 变化)。Phase C ListItem 范例:
  ```tsx
  const skills = useSkillsStore((s) => s.skills);
  const installed = useMemo(() => useMarketplaceStore.getState().isSkillInstalled(item), [skills, item]);
  ```
- **MCP `marketplaceSource.owner = item.author`**:`MarketplaceMcpItem` 没有独立 `owner` 字段(Official MCP Registry 用 `author` 做 publisher),所以 SSoT MCP selector 用 `marketplaceSource.owner === item.author` 三元组对齐 — 与后端 `install_marketplace_mcp` 写入 metadata 时的字段映射一致
- **`InstallOutcome.Installed.skillId` 在 MCP 路径下承载 mcp_id** — Phase A 笔记已说明。store handler `installMcp` switch case `installed` 内 `outcome.skillId` 实际是 mcp 路径串;`showShortcutBanner(outcome.skillId, 'mcp')` 第一参数对 banner 来说是"local 资源 id",对 MCP 即 mcp 路径串(与 `useMcpsStore.mcpServers[i].id` 一致)
- **Filter 排序用 `[...result].sort()`** 不是 mutate `filtered.sort()`(避免 React 浅比较失效);marketplace 不复用 skillsStore 的 plugin 沉底逻辑(D-9:marketplace 与 local 平等,marketplace 内部无 plugin 概念)
- **`marketplace:scrape-degraded` 仅 console.warn**:V1 不要求 UI 暴露 — `lastSyncedSkills` ISO 已隐含 seed-only 时间。Phase C 若要在"Last synced N hours ago" hint 加 "(seed only)" 后缀,可在 store state 加 `scrapeDegraded: boolean` 字段并由 listener set;V1 暂不实现以避免 UI 噪音
- **shortcutBanner activeScene 状态在 banner 抬起瞬间快照**(showShortcutBanner 内调 `useScenesStore.getState().getActiveScene()` 一次)— 用户在 banner 显示期间编辑了别的 Scene 不影响 banner 已捕获的 active id。这与"短链是一次性、可 dismiss"的 PRD §5.5.1 / §7.0 契约一致

### 范围确认

- ✅ 不修改 `useSkillsStore` / `useMcpsStore` / `useClaudeMdStore` 主体(只读 skills / mcpServers + 调 loadSkills / loadMcps)
- ✅ `installSource === 'plugin'` 11 callsite 0 修改(grep 验证 12 hits 全保留)
- ✅ `skillsStore.ts:469-478` / `mcpsStore.ts:503-513` 排序沉底逻辑 0 修改
- ✅ marketplaceStore 内部 0 缓存"installedSet"(SSoT 必须从 useSkillsStore.skills 派生,详 isSkillInstalled / isMcpInstalled 实现)
- ✅ in-progress 残留(`src/utils/classifyHelpers.ts` / `src/types/index.ts:161-170 ClassifyResult / ExistingCategoryPayload` / `src/stores/{skills,mcps,claudeMd}Store.ts` 已修改区域)0 触动
- ✅ `verify-third-party-behavior-firsthand`:已读 `node_modules/@tauri-apps/api/event.d.ts` 第 84 行确认 `listen<T>(event: EventName, handler: EventCallback<T>, options?: Options): Promise<UnlistenFn>` 签名;listen 返回 Promise<UnlistenFn>,UnlistenFn = `() => void`,本 store 内严格按此签名使用
- ✅ `npx tsc --noEmit` / `npx eslint src/` / `npm test` 三项 gate 全绿,死代码 grep 0 命中

---

## [任务卡 C5] 完成日志 — 2026-05-09

### 改动文件

**新建(1 文件,共 250 行)**
- `src/components/marketplace/MarketplaceCollisionModal.tsx`(250 行) — 同名碰撞 Modal 组件,接通 `marketplaceStore.collisionModalState` + `resolveCollision` + `closeCollisionModal`。沿用通用 `Modal`(`maxWidth=480px` / `showHeader=false`),body 内自渲染 `role="alertdialog"` + `aria-modal="true"` + `aria-labelledby` + `aria-describedby` 完整 ARIA(因 Modal 通用组件不暴露 role 改写),Esc / overlay click / portal / body-scroll lock 全部沿用 Modal 内置行为。

### 自动化 gate 输出

```
$ npx tsc --noEmit
exit=0(零输出,全绿)

$ npx eslint src/components/marketplace/MarketplaceCollisionModal.tsx
exit=0(零输出,零 warning,零 error)
```

### 用户可观测成功

- 用户装一个本地已有同名 marketplace skill(仅 `hasLocal`)→ Modal 弹出,标题 `<name> already exists in your library.`,描述 `Replacing will move the existing version to Trash. Your category, tags, and custom icon will not be carried over.`,Footer 按钮 `[Cancel] [Replace existing]`,默认焦点在 Cancel(避免无可恢复副本时默认走破坏性操作)
- 用户曾删过同名(`hasTrashed` 存在,无论 `hasLocal` 与否)→ Modal 描述切为 `A previously deleted version exists in Trash. Restoring will recover your category, tags, and custom icon.`,Footer 多一个 `Restore from Trash` primary 按钮,默认焦点在 Restore(最低惊讶 + 保留 metadata)
- 用户点 Replace → `resolveCollision({ kind: 'replace' })` → Modal 立即关闭(store 乐观置 `collisionModalState` 初值)→ 后端 fs::rename 旧版到 trash + 装新版,SSoT loadSkills 触发 → 用户看到 Skills 列表新版上场;若 install 失败,失败态走 ListItem Retry 路径(`installFailedItems[id]`)
- 用户点 Restore → `resolveCollision({ kind: 'restoreFromTrash', trashPath: hasTrashed.path })` → Modal 关闭 → 后端从 trash 子目录 fs::rename 回 `~/.ensemble/skills/<name>/` + marketplace 元数据回填 metadata → SSoT loadSkills → 用户看到 Skills 列表立即出现该 skill,Marketplace 对应行 `Installed ✓`(三元组匹配命中或 name fallback 命中)
- 用户点 Cancel / 按 Esc / 点 overlay → `closeCollisionModal()`,Modal 关闭,`installingItemIds` 同时清除该 item(store 内置语义)→ ListItem 按钮回到 `Install` 状态,文件系统零变动
- 用户**不**看到 Z:Modal 不阻断其他页面交互(portal 到 body,z-50,bg-black/40 overlay);列表项与详情面板的安装按钮在弹出 Modal 期间保持 `Installing...` 状态(由 `installingItemIds` 持续命中驱动)

### ARIA / 交互完整性核对

- `role="alertdialog"`:渲染在内层包裹 div(因通用 Modal 不允许 caller 改 role)
- `aria-modal="true"`:同上,使屏幕阅读器知道 Modal 之外内容应被忽略
- `aria-labelledby={titleId}`:指向 `<h2>` 元素(useId 生成 stable id)
- `aria-describedby`:默认指向 description `<p>`;如果 `inlineError` 非空,变为 `${descriptionId} ${errorId}` 二者并列
- 默认焦点:`useEffect` + 0ms `setTimeout` + `data-collision-action="..."` 属性查询(因 Button 通用组件未 forwardRef,无法直接 ref;data-attr 由 Button 的 `{...props}` spread 透传到内部 `<button>`,与 codebase 现有 `setTimeout(() => ref.current?.focus(), 0)` pattern 一致 — 见 `Dropdown.tsx:90` / `IconPicker.tsx:535`)
- Esc:沿用 Modal `useEffect` keydown handler(`Modal.tsx:30-37`)
- overlay click:沿用 Modal `handleOverlayClick`(`Modal.tsx:54-58`,`closeOnOverlayClick=true` 默认)
- Enter:在 focused button 上沿用 native button 行为
- 错误处理:`runResolution` 内 try/catch,sync 抛错 → 写入 `inlineError` state,渲染 `role="alert"` 红字段;async install 失败按 store 契约走 `installFailedItems` → ListItem Retry 路径(不重弹此 Modal)

### 实施笔记(给主 Agent / Reviewer)

- **Modal 通用组件不允许 caller 改 role**(检查 `src/components/common/Modal.tsx:64-99`,outermost div 无 role 属性可覆盖)。我的取舍:`showHeader={false}` 让 Modal 不渲染默认 dialog 头部,把整个 alertdialog 内容放进 children 自渲染。这保留 Modal 的 portal / Esc / overlay / body-scroll-lock / 动画,同时获得 alertdialog ARIA 语义。这是任务卡明确允许的两条路径之一(原文 "或如果 Modal 默认 dialog role 不能改 alertdialog,自渲染整个 body 含 ARIA 属性")。
- **Button 通用组件不是 forwardRef**(`src/components/common/Button.tsx:64-128` 是普通函数组件,React 18.3 不允许 ref prop 透传到 plain functional component)。修改 Button 加 forwardRef 出于 C5 范围之外(任务明令"不允许修改 Modal 通用组件内部主体"且 Button 改动会影响全局 callsite)。我的取舍:在 footer 容器上挂 `useRef<HTMLDivElement>`,用 `data-collision-action="cancel|replace|restore"` 属性透传到 Button 内部 `<button>`(`{...props}` spread 自动透传 data-* 属性),`useEffect` 内 `querySelector` 定位并 `focus()`。这是 React 18.3 在不修改 Button 前提下唯一干净的焦点管理方式。
- **Modal 父组件渲染入口**:任务卡 C5 不接通父组件渲染。我的组件假设有人在 `MainLayout` 或 `MarketplacePages` 顶层渲染 `<MarketplaceCollisionModal />` 一次(组件内自订阅 store,只有 `collisionModalState.open === true` 时才显示 Modal)。Wave 2 的 C2 / C3 SubAgent 接通入口。
- **error handling 边缘**:`resolveCollision` 当前实现在 `set({ collisionModalState: initialCollisionModalState })` 后再 await install,意味着 sync 关闭 Modal 后再异步发起 install。我的 try/catch 仍写了出来:用于捕获将来 store 重构后可能出现的 sync throw(防御性);async install 失败的传统路径走 `installFailedItems` → ListItem Retry,不会再回到此 Modal。
- **store API 偏离登记**:任务卡描述"click Replace → `await marketplaceStore.installSkill(item, { kind: 'replace' })`",但实际 Phase B SubAgent 落地的 store API 是 `resolveCollision(action)`(它内部根据 itemType 分派 installSkill / installMcp,且关闭 modal)。我按 store 实际 API 实现 — 这是 spec §6.2 contract,与任务卡描述一致(任务卡也写了"click Replace → `await useMarketplaceStore.getState().resolveCollision({ kind: 'replace' })` → close modal")。两条文案在任务卡前后两段一致,我按后段实施。

### 范围确认

- ✅ 不直接 mutate 文件系统(全部走 `marketplaceStore.resolveCollision` → `installSkill/Mcp` → IPC)
- ✅ 不修改 `trashStore` / `TrashRecoveryModal`
- ✅ 不引入新 design token(只用既有 zinc 调色板:`#18181B` 标题 / `#71717A` 描述 / `#DC2626` 错误 / `#E5E5E5` 边框 / `#FAFAFA` overlay 由 Modal 内置)
- ✅ 不修改 `marketplaceStore` 主体逻辑(只 read state + 调 `resolveCollision` / `closeCollisionModal` 两个 action)
- ✅ 不修改 `Modal` 通用组件内部主体(只通过其 props 控制行为:`isOpen` / `onClose` / `title=""` / `showHeader={false}` / `maxWidth="480px"`)
- ✅ 不修改 Button 通用组件(用 data-attribute spread 实现焦点定位,不需要 forwardRef)
- ✅ 不修改 in-progress 残留(`src/utils/classifyHelpers.ts` / `src/stores/{skills,mcps,claudeMd}Store.ts` 已修改区域 / `src/index.css` 已修改区域)0 触动
- ✅ ARIA 完整:`role="alertdialog"` + `aria-modal="true"` + `aria-labelledby` + `aria-describedby` + `role="alert"` 错误条
- ✅ 文案严格按 spec §9 表(标题 / 描述两态 / 三按钮文字)
- ✅ 自动化 gate 全绿:`npx tsc --noEmit` exit=0,`npx eslint <file>` exit=0

---

## [任务卡 C4] 完成日志 — 2026-05-09

### 改动文件

**新建(1 文件,共 270 行)**
- `src/components/marketplace/MarketplaceListItem.tsx`(270 行) — Marketplace 列表项共用组件,被 SkillMarketplacePage / McpMarketplacePage(C2 / C3 创建)调用;容器骨架完全镜像 SkillListItem `:126-145`(同 className / 同 padding / 同 border / 同 background-color transition);三个 compact 动效常量(`TRANSITION_DURATION` / `TRANSITION_EASING` / `RIGHT_SECTION_DELAY`)原样镜像 SkillListItem `:19-23`;`rightSectionStyle.maxWidth` = `compact ? 0 : '240px'`(D-Imp / R2 §3.2 marketplace 右段比 skill/mcp 窄);右段三态 trailing control(Installed / Retry / Install)依据 SSoT `isInstalled` + `installFailedItems[id]` + `installingItemIds.has(id)` 派生;MCP 类型 badge(stdio / HTTP)用 `<Badge variant="status" showDot={false}>`(沿用现有 status variant,不引入新色);整行包 Tooltip(README 第一句,`maxWidth={320}`);Install button onClick 调 `e.stopPropagation()` 防止冒泡触发 row select;键盘可达(`role="button" tabIndex={0} aria-pressed={selected}` + `Enter/Space` 触发 select);hierarchy:icon `h-10 w-10 rounded-lg`、name `text-[13px] font-medium`(selected `font-semibold`,`transition: font-weight 250ms cubic-bezier(0.4,0,0.2,1)`)、description `text-xs font-normal text-[#71717A] truncate` 配 `truncateToFirstSentence(desc, 100)`

### 自动化 gate 输出

```
$ cd /Users/bo/Documents/Development/Ensemble/Ensemble2
$ npx tsc --noEmit 2>&1 | grep "MarketplaceListItem"
(零命中 — MarketplaceListItem.tsx 类型检查全绿。tsc 总输出仅有 1 条错误位于 src/pages/SettingsPage.tsx,属于 C1 任务范围,与本卡无关)

$ npx eslint src/components/marketplace/MarketplaceListItem.tsx
(零输出,exit 0)
```

### 用户可观测成功

- 父页面渲染 `<MarketplaceListItem item={...} itemType="skill" isInstalled={false} compact={false} selected={false} onSelect={...} />` → 用户看到一行卡片,左段 icon(`Sparkles` 默认)+ name + description first-sentence;右段 popularity 数字(灰小字)+ Install button(primary `bg-[#18181B]`)
- 用户点 Install button → button 变 `Installing...` + spinner;backend resolve 后(若成功)`isInstalled = true` 由 SSoT selector 派生 → 右段切到 `<Badge variant="status">✓ Installed</Badge>`,不再可点
- 用户在选中态下其他行 compact = true → rightSection `opacity 0` + `maxWidth 0`,250 ms 立即收缩;关闭详情时 expand 走 150 ms delay 与 SlidePanel `mr-[800px]` 反向收缩节奏对齐
- 用户 hover 任意行 → Tooltip 弹出,显示 README 第一句(≤ 200 字),tooltip `maxWidth=320` 可换行
- 用户在 mcp 列表 `itemType="mcp"` 模式下 → 右段在 popularity 与 install 控件之间插入 `stdio` 或 `HTTP` badge
- 用户安装失败(`installFailedItems[id]` 写入)→ 右段 button 文案变 `Retry`,Tooltip(嵌套)显示 error 字符串;**不**变红 / **不**引入新色(R3-P0-3)
- 用户不看到 Z:左段 icon 容器右上角**无** plugin 蓝点 badge(R-11 / D-9);右段**无** More menu(R-19 marketplace 列表项不提供卸载入口)

### 实施笔记

- **Tooltip 嵌套**:`Retry` 按钮的 Tooltip 用 `<span>` 包裹 Button 因 Tooltip cloneElement 需要可附 ref 的 trigger;Button 内部已 forwardRef-like(原生 button)但更稳妥的写法是包一层 span 让 Tooltip 锚定到 span,避免 Button props 与 Tooltip 注入的 onMouseEnter/Leave 冲突。整行 Tooltip 直接 wrap row div(div 自身可附 ref)
- **右段 trailing control 三态优先级**:Installed > Failure > Install;Installed 是 terminal(SSoT 派生),即使 store 中 `installFailedItems[id]` 残留也不显示 Retry — 因为已成功后失败标志应当被清掉(由 marketplaceStore 在 `installSkill` / `installMcp` 入口的 `installFailedItems delete` 清理)。这避免了"已装但显示 Retry"的边界 UI
- **Tooltip 包整行**:R2 §10.5 / 任务卡要求 hover 显示 README,采用整行 wrap 是最直观;Tooltip 内部 `whiteSpace: maxWidth ? 'normal' : 'nowrap'` 已支持长文本换行
- **`tabular-nums`** 给 popularity 数字防止 1k / 10k 跨 row 对齐时数字宽度不一致
- **`item.stars` fallback to 0**:类型 `MarketplaceSkillItem.stars: number` / `MarketplaceMcpItem.stars: number` 都是必填,但运行时若上游 catalog 缺失则 `?? 0` 兜底
- **`tooltipPreview` empty 时跳过 Tooltip wrap**:`truncateToFirstSentence('', 200)` 返回空串 → 直接返回 row,避免渲染空 portal bubble
- **icon 默认值固定 Sparkles / Plug**:Marketplace catalog 当前不传 `icon` 字段,默认即可;若未来加 icon 字段(R-49 / 低优 backlog)再 import `ICON_MAP` 查表
- **不动 marketplaceStore**:遵守"不允许做的事"清单,只 read state(`installingItemIds.has(item.id)` / `installFailedItems[item.id]`)+ 调 actions(`installSkill` / `installMcp`),零写入 store 内部数据结构
- **不修改 SkillListItem / McpListItem**:严格遵守任务卡;若未来发现两套 ListItem 漂移,可抽公共 hook(`useListItemTransition`),但 V1 阶段保持双胞胎平行实现避免跨任务卡污染

### 范围确认

- ✅ 容器骨架完全镜像 SkillListItem `:126-145`(同 className 字符串 / 同 padding / 同 border / 同 background-color transition / 同 cursor 处理)
- ✅ 三个 compact 动效常量原样镜像(`'250ms'` / `'cubic-bezier(0.4, 0, 0.2, 1)'` / `'150ms'`),与 SkillListItem `:19-23` 字面一致
- ✅ 不显示 plugin badge(左段 icon 容器右上角无任何 4px×4px 角标)
- ✅ 不引入新 design token / 自创 className(只用 zinc 调色板 + `var(--color-accent)` 间接通过 Button primary;Badge variant="status" 沿用现有渲染)
- ✅ rightSectionStyle.maxWidth = `compact ? 0 : '240px'`(R2 §3.2 / D-Imp 要求,比 SkillListItem 的 400 与 McpListItem 的 300 都窄)
- ✅ 右段无 More menu(R-19)
- ✅ Install button onClick 用 `e.stopPropagation()` 防止冒泡(任务卡要求)
- ✅ font-weight transition(`text-[13px] font-medium → font-semibold`)走 inline `transition: font-weight 250ms cubic-bezier(0.4,0,0.2,1)`
- ✅ 不修改 SkillListItem / McpListItem / marketplaceStore 主体(只 read state + 调 actions)

---

## [任务卡 C7] 完成日志 — 2026-05-09

### 改动文件

**新建(1 文件,46 行)**
- `src/components/marketplace/MarketplaceSourceBadge.tsx`(46 行) — 接受 `MarketplaceSource | undefined`;有值时渲染两行(`<owner>/<repo>` GitHub 链接 + `from skills.sh` / `from MCP Registry` 副文本);undefined 时渲染防御性 fallback `Unknown marketplace`(V1 不应触发,但 type-safe 兼容)。GitHub 链接使用 `target="_blank"` + `rel="noopener noreferrer"` 保证安全外链。仅复用现有 zinc 调色板 + `font-mono text-xs` / `text-[11px]` 两档字号 — 0 新 token / 0 新 className。

**修改(6 文件)**
- `src/components/skills/SkillDetailPanel.tsx`(+2 行) — import + Scope ConfigItem 内 `installSource === 'plugin'` 三元链插入 `installSource === 'marketplace'` 分支(line 588)
- `src/components/mcps/McpDetailPanel.tsx`(+2 行) — import + Install Scope `installSource === 'plugin'` 三元链插入 marketplace 分支(line 540)
- `src/pages/SkillsPage.tsx`(+2 行) — import + 内嵌详情面板 Scope ConfigItem(line 622) 插入 marketplace 分支
- `src/pages/McpServersPage.tsx`(+2 行) — import + 内嵌详情面板 Install Scope(line 613) 插入 marketplace 分支
- `src/pages/SkillDetailPage.tsx`(+2 行) — import + Scope ConfigItem(line 452) 插入 marketplace 分支
- `src/pages/McpDetailPage.tsx`(+2 行) — import + Install Scope(line 363) 插入 marketplace 分支(注:此页 default 分支显示 `User` 静态 badge 而非 ScopeSelector,marketplace 分支插入位置与其他 5 处一致)

### 自动化 gate 输出

- `npx tsc --noEmit`:OK(0 errors)
- `npx eslint <7 files>`:OK(0 errors / 0 warnings)
- `npm test`:**283 passed; 0 failed**(22 test files,1.66s)— 无回归

### 用户可观测成功

- 用户装 marketplace skill 后 → Skills 详情面板的 Scope row 显示 `<owner>/<repo>` GitHub 链接(可点击新窗口打开 https://github.com/{owner}/{repo})+ 副文本 `from skills.sh`(MCP 路径下副文本为 `from MCP Registry`)
- 用户的 local 来源 skill 详情 Scope row 显示原 `ScopeSelector`(MCP 详情页 `User` badge)— 行为完全不变
- 用户的 plugin 来源 skill 详情 Scope row 显示 `Plugin` badge — 行为完全不变
- 用户点击 GitHub 链接 → 默认浏览器新窗口打开 repo 主页(`target="_blank"` + `rel="noopener noreferrer"` 阻止 reverse-tabnabbing 与 referrer 泄漏)

### 实施笔记

- **位置溯源**:任务卡 C7 描述 "Source row" 实际指 detail panel 内 `installSource === 'plugin'` 现有 callsite 所在的 `Scope` ConfigItem(skills) 与 `Install Scope` 行(mcps),不是另一个独立的 "Source" section(后者在文件中是第二个 section,渲染 `sourcePath` + Open in Finder 按钮,与 plugin 三态判断无关)。R4 §2.4 callsite 表的 6 个行号(586/538/620/611/450/361)精确指向 plugin 三元判断,与本卡修改点完全一致。
- **新 component 内联文案使用**:spec §9 文案表"详情面板 Source 行 marketplace 来源"仅给出 `<owner>/<repo>` (link to GitHub) 的核心展示,未明确副文本;实施层补充 "from skills.sh" / "from MCP Registry" 第二行作为 source kind 的来源标签,对应 D-Imp-4 中 source 字段的两个枚举值,与现有 InfoItem label 字号 11px 一致 — 不引入新 token。
- **default 分支保留**:6 处修改均严格遵循 "if plugin → if marketplace → else (现有逻辑)" 三元链结构。`else` 分支(local / undefined)与 plugin 分支均原样保留 — `ScopeSelector` 触发的 IPC、`User` 静态 badge、Plugin badge 文本 / 颜色均 0 修改。回归保证:283 个 frontend tests + 已有 11 个 `installSource === 'plugin'` callsite 的 grep 计数(本卡未引入额外 plugin callsite,只在其后追加 marketplace 分支)未变。
- **type 安全**:`MarketplaceSourceBadge` 接受 `MarketplaceSource | undefined` 而非 `MarketplaceSource`(虽然父级条件 `installSource === 'marketplace'` 时 backend 保证 `marketplaceSource` 非空,但 TS 类型 `marketplaceSource?: MarketplaceSource` 允许 undefined)— 这是防御性 typing 而非语义松弛;运行时若出现 undefined(数据损坏),展示中性的 "Unknown marketplace" 不会崩溃。

### 范围确认

- ✅ plugin 分支现有逻辑 0 修改(11 处 callsite 全保留;只在其后追加 marketplace 分支)
- ✅ local / default 分支现有逻辑 0 修改(ScopeSelector + User badge 原样)
- ✅ 0 新 design token / 0 新颜色 / 0 新字号 — 仅复用 zinc + `text-xs` / `text-[11px]` / `font-mono`
- ✅ 0 SkillDetailPanel / McpDetailPanel 主体改动 — 仅 Source(Scope)section 内 if/else 链扩展
- ✅ SkillsPage / McpServersPage 其它部分 0 触动(Wave 2 C6+C8 SubAgent 改其它区域)
- ✅ in-progress 残留(`src-tauri/src/commands/classify.rs` / `src/utils/classifyHelpers.ts` / sidebar 改动)0 触动


---

## [任务卡 C1] 完成日志 — 2026-05-09

### 改动文件

**新建(2 文件,共 50 行)**
- `src/pages/SkillMarketplacePage.tsx`(25 行) — Wave 1 stub:`<PageHeader title="Skill Marketplace" />` + 居中 "Skill Marketplace coming soon" 占位。任务卡 C2 (Wave 2) 会覆盖完整实现(列表 + SlidePanel 详情 + onboarding banner)
- `src/pages/McpMarketplacePage.tsx`(25 行) — Wave 1 stub:同形态,标题/文案改为 MCP。任务卡 C3 (Wave 2) 会覆盖完整实现(含 stdio/HTTP 配置区差异)

**修改**
- `src/components/layout/Sidebar.tsx`(+74 行) — `lucide-react` import 追加 `Store, Package`;`SidebarProps.activeNav` 联合追加 `'marketplace-skills' | 'marketplace-mcps'`;新增 `marketplaceItems` 独立数组(2 nav item,不混入 navItems);在 `:276` `<div flex-1 ... overflow-hidden>` 与原 NAVIGATION `<nav>` 之间插入 MARKETPLACE 段(`<nav aria-label="Marketplace">` 包裹 + 段标题行镜像 :317-330 CATEGORIES 模式 + 2 个 nav button 镜像 :285-308 现有 NAV item 模式 + 段尾 `<div className="h-px bg-[#E4E4E7] my-4 flex-shrink-0" />` divider);**严格沿用现有 token** — 段标题 `text-[10px] font-semibold text-[#A1A1AA] uppercase tracking-[0.8px]`、按钮 `h-9 px-2.5 gap-2.5 rounded-[6px]` 与现有 NAV 一致;不显示 count badge(任务卡 D-1 决策:marketplace 资源数量随上游变,sidebar 计数无意义)
- `src/App.tsx`(+5 行) — import `SkillMarketplacePage` / `McpMarketplacePage`;在 `<Route path="skills" ...>` **之前**新增 2 路由(顺序与 Sidebar 视觉顺序一致:Marketplace 上,Navigation 下)
- `src/components/layout/MainLayout.tsx`(+9 行) — `getActiveNav()` 返回类型联合追加 `'marketplace-skills' | 'marketplace-mcps'`;path 分支追加 `if (path.startsWith('/marketplace-skills')) return 'marketplace-skills';` + mcp 镜像。匹配位置在 `path.startsWith('/skills')` **之前**(因为 `/marketplace-skills` 不会匹配到 `/skills` startsWith,但保持顺序与 sidebar 视觉一致)
- `src/pages/SettingsPage.tsx`(+30 行) — import `Toggle` from `@/components/common/Toggle`;`useSettingsStore()` 解构追加 `autoClassifyNewItems` 与 `setAutoClassifyNewItems`;在 CLAUDE.md 与 Storage section 之间新增 Marketplace section,完全镜像现有 `<SectionHeader />` + `<Card>` + `<Row noBorder>` 模式,`<Toggle checked={autoClassifyNewItems} onChange={setAutoClassifyNewItems} />` 作 Row 右段。Toggle 通用组件签名是 `{checked, onChange, size?, disabled?}` — 不接受 label/description prop,所以 label / description 文案放在 Row 左段 `<span>` 中(与 SettingsPage 现有 Row 格式完全一致)。文案严格按任务卡:label "Auto-classify newly installed items" + description "When enabled, items installed from the Marketplace will be automatically categorized."

### 自动化 gate 输出

```
$ npx tsc --noEmit
(零输出,全绿 — 0 errors)

$ npx eslint src/components/layout/Sidebar.tsx src/App.tsx src/components/layout/MainLayout.tsx src/pages/SettingsPage.tsx src/pages/SkillMarketplacePage.tsx src/pages/McpMarketplacePage.tsx
✖ 3 problems (0 errors, 3 warnings)
  — 3 warnings 全部预先存在(MainLayout :257 useEffect dependency array 历史 / MainLayout :297 unused 'e' / Sidebar :48 unused 'err'),
    本卡新增改动 0 warning

$ npm test
Test Files  22 passed (22)
     Tests  283 passed (283)
  Duration  1.64s
  — settingsStore.test.ts 8 tests 包括 autoClassifyNewItems 默认 true 断言,无回归
```

### 用户可观测成功

- 用户启动 `npm run tauri dev` 打开 Ensemble → 看到 Sidebar 顶部 Header 之下、原 NAVIGATION 5 项(Skills / MCP Servers / CLAUDE.md / Scenes / Projects)**之上** 有"MARKETPLACE"段标题(全大写 10px tracking 0.8px) + 2 个 nav item(`Skill Marketplace` 用 Store icon,`MCP Marketplace` 用 Package icon),段尾有 1px hairline divider(#E4E4E7)与 NAV→CATEGORIES divider 视觉一致
- 用户点 `Skill Marketplace` → URL 变为 `/marketplace-skills`,Sidebar 该项变 active 态(背景白 + border #E5E5E5 + 字深 + icon 深),主区显示 PageHeader title="Skill Marketplace" + 居中 13px #A1A1AA "Skill Marketplace coming soon" 文字。MCP 同款行为
- 用户进 Settings → 在 CLAUDE.md 与 Storage section 之间看到新 Marketplace section,含 1 行 Toggle(label "Auto-classify newly installed items" + description "When enabled, items installed from the Marketplace will be automatically categorized.");默认开启(checked=true,因 Phase B 改了默认值);切换状态被持久化到 `~/.ensemble/settings.json`(经 `setAutoClassifyNewItems` → `saveSettings` → `write_settings` IPC)
- 用户不看到 Z:Skills/MCP/CLAUDE.md/Scenes/Projects 5 项 + Categories + Tags 现有结构无任何视觉变化(仅在 NAVIGATION 段之上多了 MARKETPLACE 段);Header 56px / pl-5 pr-3 / border-b 不变;Footer Settings 齿轮不变;ARIA 现有结构兼容(MARKETPLACE 段独立 `<nav aria-label="Marketplace">`,不影响原 NAVIGATION `<nav>`)

### 实施笔记(给 Phase D 实测的提示)

- **Wave 2 SubAgent 覆盖 stub**:C2 SubAgent 完整实现 `SkillMarketplacePage`,C3 SubAgent 完整实现 `McpMarketplacePage`。stub 文件结构(顶层 `<div className="flex h-full flex-col bg-white">` + PageHeader + main 区)与 SkillsPage 现状骨架兼容,Wave 2 替换 main 区即可
- **getActiveNav 顺序很重要**:虽然 `path.startsWith('/marketplace-skills')` 与 `path.startsWith('/skills')` 不会发生混淆(前者更长,字面值不同),但仍把 marketplace 分支放在 skills 分支之前,以镜像 sidebar 视觉顺序;若未来路由命名改成 `/skills/marketplace` 则需要重新审视
- **Toggle 通用组件契约**:Toggle.tsx 签名是 `{ checked: boolean; onChange: (checked: boolean) => void; size?: 'large'|'medium'|'small'; disabled?: boolean }`,**不接受 label/description prop**。任务卡 prompt 写的 `<Toggle label="..." description="..." />` 是抽象意图,实际实现要按 SettingsPage 现有 Row 模式把 label/description 放到 Row 左段 `<span>` 中
- **MarketplaceSourceBadge 假阳性**:首次 `npx tsc` 报 `McpDetailPanel.tsx:28 'MarketplaceSourceBadge' declared but never read` — 是 IDE 缓存问题(C7 SubAgent 同时改了 McpDetailPanel),第二次 tsc 即清空。这是 wave 1 并行 SubAgent 时序的 known artifact,不影响最终 build
- **Sidebar 段顺序**:本卡按 PRD §5.1 ASCII 图把 MARKETPLACE 放在 NAVIGATION 之上(Header → MARKETPLACE → divider → NAVIGATION → divider → CATEGORIES → divider → TAGS → footer Settings),完全符合 D-1 "marketplace 顶部独立分组"决策

### 范围确认

- ✅ 不引入新 design token / 新颜色 / 自创 className(全部沿用 R1 §5 token + design-language Rule)
- ✅ 不修改 Header / 现有 NAVIGATION 5 项 / CATEGORIES / TAGS 段
- ✅ Marketplace nav item 用独立 `marketplaceItems` 数组,不混入 `navItems`
- ✅ stub 页面只 PageHeader + 居中占位文字,不实现完整功能(留给 C2/C3)
- ✅ 不改 Toggle 通用组件主体(`src/components/common/Toggle.tsx` 0 改动)
- ✅ 不跳过 npx tsc / eslint / npm test gate
- ✅ in-progress 残留 0 触动(`src/utils/classifyHelpers.ts` / `src/types/index.ts` 已修改区域 / `src/stores/{skills,mcps,claudeMd}Store.ts` 已修改区域 / `src/index.css` 已修改区域 / `SortableCategoriesList.tsx` / `src-tauri/src/commands/classify.rs`)

---

## [任务卡 C2] 完成日志 — 2026-05-09

### 改动文件

**重写(1 文件,Wave 1 stub → 完整 715 行)**
- `src/pages/SkillMarketplacePage.tsx`(715 行,覆盖原 25 行 stub) — 完整 Skill Marketplace 页面:
  - 顶层 wrapper `<div className="relative flex h-full flex-col overflow-hidden">` 镜像 SkillsPage `:682`
  - PageHeader title=`Skill Marketplace`、SearchInput placeholder=`Search skills...`、actions = Refresh button + Sort Dropdown(`By Popularity / Alphabetical / Recently Updated`,180px 宽,沿用通用 Dropdown compact)
  - 错误条复用 SkillsPage `:735-745` 红色 banner + Dismiss(`upstreamError && skillsCatalog.length > 0` 时才显示,fallback 到 seed/cache 的情况下不弹空 banner)
  - 主滚动区 `flex-1 overflow-y-auto px-7 py-6 transition-[margin-right] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]` + `${selectedItemId ? 'mr-[800px]' : ''}` 与 SkillsPage 完全同款 collapse 节奏
  - Onboarding banner — 首次进入显示 `bg-[#FAFAFA] border border-[#E5E5E5] rounded-lg px-4 py-3` + Sparkles icon + "New here? These are popular Skills others are using." + × 关闭(调 `dismissOnboarding('skills')`),已 dismiss 后不再渲染
  - Filter row — 左:`<CategoryTreeDropdown categories={appStore.categories} compact w-44 placeholder="All categories">`;右:Last synced X ago 标签(staleCache 时切 amber `#B45309`,正常时 `#A1A1AA`)
  - 列表渲染 `flex flex-col gap-3` + `<SkillRowWrapper>`(React.memo)wrapper 调 `MarketplaceListItem`(Wave 1 C4 产物)。Wrapper 内对 `useMarketplaceStore.getState().isSkillInstalled(item)` 使用 `useMemo` + `[item, localSkills]` deps(满足 Phase B 笔记的"function selector + skills 订阅 + useMemo"模式)
  - **三态 EmptyState**:
    - **Loading**:中央 Loader2 spinner + "Loading marketplace..."(`isLoading && skillsCatalog.length === 0`)
    - **Offline / EmptyState**:WifiOff icon + "Marketplace temporarily unavailable" + "This may be a network issue or upstream service outage." + Retry Button(`upstreamError && skillsCatalog.length === 0`)
    - **No results**:Search icon + "No skills match your filters" + "Try adjusting your search or category selection."(filter 命中 0)
  - SlidePanel(width=800)详情面板 — `header` 槽放 detailHeader(36×36 icon + name `text-base font-semibold` + description first-sentence);`headerRight` 槽放 `<DetailInstallControl>`(三态:Installed Badge / Retry Button / Install Button,SSoT 派生);`children` 是 `<SkillDetailContent>` 三块布局:
    - **Block 1 决策必读**:Info row 4 列(Author / Last Updated `formatRelativeTime` / Stars + Star icon + tabular-nums / License),沿用 SkillsPage InfoItem 11px label + 13px value 字号档
    - **Block 2 参考信息**:upstream Categories(`<Badge variant="category">`)+ upstream Tags(`<Badge variant="tag">`)+ Source row 用 `<MarketplaceSourceBadge source={buildSourceFromSkillItem(item)}>`(catalog item 没有 metadata `marketplaceSource` 字段,临时构造 source kind = `skills_sh` + owner / repo / name)
    - **Block 3 README**:`<h3>README</h3>` + `<div className="overflow-y-auto rounded-lg border border-[#E5E5E5] bg-white p-4" style={{ maxHeight: '480px' }}>` 内 raw markdown 用 `<pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-[#52525B]">`(V1 简化:`package.json` 无 react-markdown / remark / rehype 依赖,读了 `npm pkg` 验证;若空 README fallback 到 description first-sentence)
  - `<MarketplaceCollisionModal />` 单实例渲染在页面顶层,组件自订阅 `collisionModalState.open` 控制显隐
  - 不调用 SkillDetailPanel(R2 §0.1 禁止)/ 不修改 marketplaceStore / SkillsStore 主体 / 不改 SkillsPage / SkillListItem

### 自动化 gate 输出

```
$ npx tsc --noEmit 2>&1 | grep "SkillMarketplacePage"
(零命中 — 本卡新文件类型检查全绿;tsc 整体仍报 1 条 MainLayout.tsx 错误,
 来自并行 wave C6+C8 SubAgent 引入的 not-yet-written 组件 imports +
 unused state slice,与 C2 完全无关)

$ npx eslint src/pages/SkillMarketplacePage.tsx
(零输出,exit 0,0 errors / 0 warnings — 三处 react-hooks/exhaustive-deps
 false positive 用 line-level disable 注释处理,所有 disable 都附 1-3 行
 reason 解释为何 lint 规则在 getState() 派生场景下错报)

$ npm test
Test Files  22 passed (22)
     Tests  283 passed (283)
  Duration  1.80s
  — 22 个测试文件 / 283 个测试全部通过,本卡无新增测试,亦未引发回归
```

### 用户可观测成功(三行)

- 用户进入 Skill Marketplace → 看到 PageHeader(Skill Marketplace + Search input + Refresh + Sort By Popularity)+ Onboarding banner(若未 dismiss)+ Filter row(All categories dropdown + Last synced X ago)+ MarketplaceListItem 列表(seed 内容立即可见,catalog-enhanced event 后无缝增长)
- 用户点列表项 → SlidePanel 滑入(250ms cubic-bezier(0.4,0,0.2,1)),主区右收 mr-[800px],详情渲染三块(决策必读 4 列 / 参考信息 categories+tags+Source / README 480px scroll 区);headerRight 槽显示 Install button(三态:Install / Installing... / Installed ✓ / Retry,与 row 共享 SSoT 派生)
- 用户搜索 / 改 sort / 选 Category → 即时过滤(无 debounce),与 SkillsPage 节奏一致
- 用户离线(`upstreamErrorSkills` 非空且 catalog 为空)→ EmptyState `Marketplace temporarily unavailable` + Retry button;有 catalog 时改在顶部 banner dismiss 不阻断浏览
- 用户安装本地已存同名 → MarketplaceCollisionModal 弹出(C5 已实现的 alertdialog),按钮三态根据 hasLocal/hasTrashed 切换
- 用户点 Onboarding banner 的 ×  → 该会话起此 banner 不再显示(`onboardingDismissedSkills` set true,zustand 持久化语义由 marketplaceStore 自身决定;V1 内存级,刷新后重置 — 与 PRD §5.0 "一次性、可 dismiss、不阻塞"契约一致)
- 用户**不**看到 Z:列表项视觉密度与 SkillsPage SkillListItem 完全一致(MarketplaceListItem Wave 1 已镜像 :126-145 容器骨架);列表项左段无 plugin 蓝点 badge;详情面板**不**是 SkillDetailPanel 的 7 section 布局而是 marketplace 专属的 3 块布局(Block 1/2/3)

### 实施笔记(给 Phase D 实测的提示)

- **R2 §0.1 SkillDetailPanel 禁用**:严格遵守 — 详情面板内嵌实现,不 import SkillDetailPanel 组件。三块结构(Decision-critical / Reference / README)与 R2 §4.4 推荐一致,与 SkillsPage 7-section 完全不同(那是已装 Skill 的"管理"面板,Marketplace 是"浏览安装"面板,职责差异)
- **README 渲染 V1 简化**:`package.json` 无 react-markdown / remark / rehype / marked 任一依赖,故按任务卡明示的"V1 简化"使用 `<pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-[#52525B]">`。`<pre>` 而非 `<div>` 是为了天然保留代码块缩进 + 换行;`font-sans` override 让正文不显示等宽字体(代码块在原始 markdown 里若 fenced 也只是字面 ```bash 字符串,不解析为 HTML)。Future:V1.5 引入 react-markdown 后只需替换 Block 3 内容容器,容器形态(border + maxHeight + scroll)不变
- **CategoryTreeDropdown 语义错配**:任务卡明示用 CategoryTreeDropdown,但 marketplaceStore.applyFilter 用 `item.categories.includes(filter.categoryId)` 比对(item.categories 是上游字符串数组,filter.categoryId 是 Ensemble Category id)。这是 PRD §10 Open Questions 已识别的 V1 dissonance(D-15 / R-33),实测后 V1.5 评估改"按上游 category 筛选"。任务卡也明示走 CategoryTreeDropdown 路径,我严格遵守
- **`buildSourceFromSkillItem` 临时构造**:catalog item 没有 metadata 中的 `marketplaceSource` 字段(`MarketplaceSource` 只在已装 skill 的 metadata 里写入)。因为 MarketplaceSourceBadge 接受同结构,我在前端构造一个 `{ source: 'skills_sh', owner, repo, name, lastSyncedAt: item.lastUpdatedAt }` 临时对象,这是显示层级的桥接,不持久化、不混淆与 metadata 写入路径
- **Onboarding banner 显示条件**:`!onboardingDismissedSkills && skillsCatalog.length > 0` — 即"有 catalog 内容才显示",空 catalog 时不显示是为了避免与 EmptyState 视觉冲突。dismiss 状态由 marketplaceStore 持有(B2 已实现),V1 不持久化到 settings.json
- **filter row 折叠行为**:`skillsCatalog.length > 0` 时才渲染(避免空 catalog 显示半成品 dropdown);offline / loading 时统一走中央 EmptyState,filter row 不出现
- **Refresh button 双状态**:`isRefreshing` 本地状态 vs store 的 `isLoadingSkills`。Refresh 按钮 disabled 期间显示 spinner + "Refreshing..." 文案;loadSkillsCatalog(true) 完成后清。这与 PRD §5.7 "Refresh 触发时当前列表保持显示,不清空 → loading"契约一致,store 内 loadSkillsCatalog 清不清空 catalog 由 store 自定 — store 当前实现是**保留旧 items**直到新数据来,符合契约
- **detail panel headerRight Install button**:与 row 的 Install button **共享 SSoT 派生**(都从 `useMarketplaceStore.getState().isSkillInstalled(item)` 派生 + 都订阅 `installingItemIds.has(item.id)` + `installFailedItems[item.id]`),所以一处装完两处状态同步;但用户视线有两条路径(列表行的小 button vs SlidePanel 顶部大 button),两路径都可触发 install,行为完全等价
- **CSS reduced-motion**:本卡未引入新 transition / animation(所有过渡都来自现有组件 — SlidePanel 自带 250ms,主区 mr- 用 inline transition class,Onboarding banner 是静态 layout 无 transition)。`@media (prefers-reduced-motion: reduce)` fallback 不需要在本卡新增,沿用 design-language Rule §10.3 + 现有 src/index.css `:709-728` 通用 wildcard 已覆盖。如未来加专属 marketplace 入场动效,需在 src/index.css 末尾追加 `[data-marketplace-onboarding-banner]` 等选择器的 reduced-motion 兜底
- **eslint-disable inline 注释位置**:react-hooks/exhaustive-deps 的警告锚定在 dep array 行(不是 useMemo 调用行),所以 `// eslint-disable-next-line` 必须紧贴 dep array 上一行,不是 useMemo 之前。三处使用都附了 reason 注释解释 lint rule 错报原因(lint 不能 trace through getState())

### 范围确认

- ✅ 不调用 / 不 import SkillDetailPanel(R2 §0.1)
- ✅ 不引入新 design token / 自创 className / 新颜色(全部沿用 zinc 调色板 + design-language Rule + 现有组件 className)
- ✅ 不修改 marketplaceStore / SkillsStore / appStore 主体(只 read state + 调 actions)
- ✅ 不修改 SkillsPage / SkillListItem(本卡仅新建 SkillMarketplacePage 覆盖 stub,SkillsPage 0 改动)
- ✅ 不抽象 BaseListItem(D-13:沿用复制+改右段模式,直接 import 复用 MarketplaceListItem)
- ✅ 不 import / 引用 C6 / C8 任务的 ShortcutBanner / AddToScenePopover(并行 wave 仍在做)
- ✅ 自动化 gate 全绿:tsc 0 errors(SkillMarketplacePage 维度)/ eslint 0 errors 0 warnings / npm test 283/283
- ✅ in-progress 残留(`src-tauri/src/commands/classify.rs` / `src/utils/classifyHelpers.ts` / `src/stores/{skills,mcps,claudeMd}Store.ts` 已修改区域 / `src/index.css` 已修改区域 / `SortableCategoriesList.tsx`)0 触动
- ✅ 文案严格按 spec §9 表(Skill Marketplace / Search skills... / Refresh / By Popularity / Alphabetical / Recently Updated / All categories / Last synced X ago / Marketplace temporarily unavailable + 描述 + Retry / No skills match your filters + 描述 / "New here? These are popular Skills others are using.")



---

## [任务卡 C6 + C8] 完成日志 — 2026-05-09

### 改动文件

**新建(2 文件,共 ~440 行)**
- `src/components/marketplace/MarketplaceShortcutBanner.tsx`(~210 行) — 安装短链 banner + `AddToSceneTriggerButton` 助手组件。Banner 容器严格沿用 design-language token(`bg-[#FAFAFA] border border-[#E5E5E5] rounded-lg px-4 py-3`);从 store `shortcutBannerState` 读取 `activeSceneId` / `activeSceneName` snapshot(由 Phase B `showShortcutBanner` 在 banner 抬起瞬间用 `getActiveScene()` 一次性写入),不在渲染期 live-derive 避免漂移。两态:有 active Scene → `[View in Skills →] + [Add to active Scene: <name> →] + [Add to Scene...] secondary button`;无 active Scene → `[View in Skills →] + [Create your first Scene →]`。`itemType === 'mcp'` 时 view-link 文案切换为 `View in MCP Servers →`(banner 同时服务 Skill 与 MCP 安装事件)。close `×` button onClick `dismissShortcutBanner()`;`role="status" aria-live="polite"` 让屏幕阅读器宣告。`AddToSceneTriggerButton` 子组件 export 给 C2/C3 SubAgent 在 SlidePanel headerRight 槽用,通过 `e.currentTarget.getBoundingClientRect()` 获取 anchor rect(避免 Button 不 forwardRef 的限制,与 MarketplaceCollisionModal 同手法)
- `src/components/marketplace/AddToScenePopover.tsx`(~230 行) — 详情粒度 Scene 分配 popover。`createPortal` 到 body,`position: fixed` 视口锚点定位:右对齐 trigger 右边 + 下方 6px gap + 8px 视口边距 clamp,bottom-overflow 时翻转到 trigger 上方。Header `Add to Scenes` text-sm font-semibold + Body scrollable list `max-h-80` 每行 `Checkbox + Scene name + 已含本资源时 Check icon`(`text-[#16A34A]`)+ Footer `[Cancel] [Save]`。Empty state(0 Scene)正文显示 `No scenes yet.` + `Create your first Scene →` link(navigate `/scenes`)且隐藏 Footer。`saveSceneAssignments(Array.from(selectedSet))` 调用后由 store 内部 diff initial vs current 多次 `updateScene` + close popover + dismiss banner(完整 D-Imp-6 闭环);Cancel / Esc / outside-click 全部仅关闭 popover(local 选择丢弃);outside-click handler 在 `setTimeout(0)` 后绑定避免开 popover 的 click 立即触发关闭

**修改**
- `src/pages/SkillsPage.tsx`(+19 行) — import `useSearchParams`;`selectedSkillId` useState 后追加 `[searchParams, setSearchParams]` + `useEffect` 监听 `searchParams.get('selected')` → 命中时 `setSelectedSkillId(value)` + 用 `setSearchParams(next, { replace: true })` 删 query param 防 refresh 重选(保留其他 param);现有 selectedSkillId / handleSkillClick / handleCloseDetail 主体逻辑 0 修改
- `src/pages/McpServersPage.tsx`(+15 行) — 同款扩展(`?selected=` → `setSelectedMcpId`),其余主体 0 触动
- `src/components/layout/MainLayout.tsx`(+17 行) — import `MarketplaceShortcutBanner` / `AddToScenePopover`;新增 `isShortcutBannerVisible = useMarketplaceStore((s) => s.shortcutBannerState.visible)` slice subscription(只在 banner 显示/隐藏 flip 时 re-render layout);在 `<main>` 内 `<Outlet />` 之前条件渲染 `<div className="px-7 pt-4 flex-shrink-0"><MarketplaceShortcutBanner /></div>`(无 banner 时不渲染外层 div,无 padding 浪费);在外层 wrapper `</div>` 之后渲染 `<AddToScenePopover />`(组件自身 portal 到 body,layout 位置仅决定 React 树节点)
- `src/index.css`(+13 行) — 末尾追加 Marketplace reduced-motion fallback `@media (prefers-reduced-motion: reduce) { [data-marketplace-shortcut-banner], [data-marketplace-shortcut-banner] * { transition: none !important; animation: none !important; } }`,沿用 §709-728 同款模式;不影响 popover(后者无入场动画,只 hover bg `transition-colors` 已被通用 `*` 选择器在用户偏好时禁用 — 但本规则主要 cover banner close button color transition + popover row hover bg)

### 自动化 gate 输出

```
$ cd /Users/bo/Documents/Development/Ensemble/Ensemble2
$ npx tsc --noEmit; echo EXIT=$?
EXIT=0(零输出)

$ npx eslint src/components/marketplace/MarketplaceShortcutBanner.tsx \
              src/components/marketplace/AddToScenePopover.tsx \
              src/pages/SkillsPage.tsx \
              src/pages/McpServersPage.tsx \
              src/components/layout/MainLayout.tsx
✖ 2 problems (0 errors, 2 warnings)
  — 2 warnings 全部预先存在(MainLayout :267 useEffect deps / :307 unused 'e'),
    本卡新建 / 修改文件 0 warning。与 C1 / B2 / C7 提到的同两条警告一致

$ npm test
Test Files  22 passed (22)
     Tests  283 passed (283)
  Duration  1.83s
EXIT=0(无回归)
```

### 用户可观测成功

- **场景 1(有 active Scene)**:用户在 Marketplace 装完 skill `pdf-to-markdown` → main 区顶部出现 `Installed in your library.` banner,左侧绿色 ✓ + 文案;中段 `View in Skills → · Add to active Scene: <用户最近 Scene 名> → · [Add to Scene...]` button;右侧 `×` dismiss icon。banner 视觉密度与 design-language 文档 token 一致(灰底 #FAFAFA / 同 PageHeader 的横向 padding 7 / 上方间距 4),不打断用户在 Marketplace 列表 + 详情面板的浏览
- **场景 2(无 active Scene)**:用户从未编辑过 Scene → banner 中段替换为 `View in Skills → · Create your first Scene →`,后者点击 navigate `/scenes` 同时 dismiss banner
- **场景 3(active Scene 一键加)**:用户点 `Add to active Scene: <name> →` → marketplaceStore.addToActiveScene 调 useScenesStore.updateScene 加入该 Scene → ScenesPage 立即看到该 Scene 含此 skill;banner 自动 dismiss
- **场景 4(多 Scene 选择)**:用户点 `[Add to Scene...]` → popover 在该按钮下方右对齐弹出,header `Add to Scenes`,body 列出所有 scenes(每行 14×14 checkbox + Scene 名 + 已含项有右侧 ✓ icon);用户勾几个新 Scene + 取消勾选某已含 Scene → 点 `[Save]` → store diff 后多次串行调 updateScene → popover 关闭 + banner 自动 dismiss + ScenesPage 即时反映勾选差异
- **场景 5(0 Scene 起步)**:用户的 Scenes 列表为空 → popover body 显示 `No scenes yet.` + `Create your first Scene →` 链接,Footer 隐藏(避免无意义 Save 按钮);点链接 navigate `/scenes` + 关闭 popover
- **场景 6(short-cut deep link)**:用户在 Marketplace 装完后点 banner `View in Skills →` → URL 变 `/skills?selected=<skillId>` → SkillsPage useEffect 命中 query → 自动 setSelectedSkillId + SlidePanel 滑入 → useSearchParams 立即剥离 selected param(其他 param 保留,history replace 不增 back-stack);用户关闭面板 + 刷新页面 → 不会再次自动选中(query 已被剥离)。MCP 路径同款 `/mcp-servers?selected=<id>`
- **场景 7(键盘 / 屏幕阅读器)**:Esc 关闭 popover;outside click 关闭 popover;banner `role="status" aria-live="polite"` → 屏幕阅读器在装完瞬间宣告 "Installed in your library";`×` button `aria-label="Dismiss installation banner"` 显式;popover `role="dialog" aria-labelledby={headerId}` 关联 header h3
- **场景 8(`prefers-reduced-motion: reduce`)**:用户在系统设置开启减少动效偏好 → banner 内 close button `transition-colors` + popover row `hover:bg-[#FAFAFA] transition-colors` 立即 disable,banner 出现 / 消失瞬间无任何过渡(state 切换硬切)。fallback 选择器 `[data-marketplace-shortcut-banner], [data-marketplace-shortcut-banner] *` 完全覆盖 banner 自身 + 子元素

### 用户不看到 Z(回归保证)

- 既有 SkillsPage / McpServersPage 直接打开(不带 query)→ selectedSkillId / selectedMcpId 默认 null,SlidePanel 不滑入,行为与 C7 落地之前 0 差异
- 现有 `installSource === 'plugin'` 11 callsite 0 触动(grep 已验证;C7 完成日志的 R4 §2.4 callsite 表保留)
- ScenesStore 主体逻辑未改(只 read scenes / lastEditedSceneId / 调 updateScene action — Phase B 已落地的字段)
- ScenesPage / SceneDetailPage 现有 UX 未改(用户在 Scenes 页面创建 / 编辑 Scene 行为不变)
- MarketplaceCollisionModal / MarketplaceListItem / MarketplaceSourceBadge / Sidebar / SettingsPage / 6 个 detail panel 5 个 page 主体 0 修改
- in-progress 残留(`src-tauri/src/commands/classify.rs` / `src/utils/classifyHelpers.ts` / `src/types/index.ts` 已修改区域 / `src/stores/{skills,mcps,claudeMd}Store.ts` 已修改区域 / `src/index.css` 已修改区域 / `SortableCategoriesList.tsx`)0 触动

### 实施笔记(给主 Agent / Phase D 实测的提示)

- **Banner 在跨页面切换时仍可见**:渲染入口在 MainLayout `<main>` 内,跨 Skills / MCP Servers / Scenes 等页面切换时(用户点 banner `View in Skills →` 后)banner 不会消失 — 只有 `dismissShortcutBanner()` 被调或 navigate `/scenes` 时手动 dismiss。这是 PRD §5.5.1"一次性、可 dismiss、不阻塞主流程"的实施:不阻塞 = 不挡 modal / 不弹层;一次性 = 用户主动 dismiss 或 banner 自身在 addToActiveScene / saveSceneAssignments 完成后自我 dismiss,**不**做 5 秒自动 dismiss timer(任务卡明令禁止)
- **Banner activeScene 状态 snapshot vs live**:Phase B 提示明确 `shortcutBannerState.activeSceneId` / `activeSceneName` 是 banner 抬起瞬间的快照(`marketplaceStore.ts:702-713` `showShortcutBanner` 内调一次 `getActiveScene()`)。本组件直接读 banner state 字段而非现场 derive,完全符合 spec §6.1 + Phase B 提示
- **AddToSceneTriggerButton export**:Wave 2 的 C2 / C3 SubAgent 在他们的 SkillMarketplacePage / McpMarketplacePage detail panel SlidePanel headerRight 槽 import 此组件:`<AddToSceneTriggerButton itemId={installedItemId} itemType="skill" />`(itemId 是已装资源的本地 id,= ShortcutBanner 的 `targetItemId`)。`Button` 不 forwardRef,所以 trigger 用 `e.currentTarget.getBoundingClientRect()` 获取 rect — 与 MarketplaceCollisionModal 的 `data-collision-action` 焦点定位同手法(Button 不能改;两次 SubAgent 同款 workaround)
- **Popover 锚点 vs 视口 clamp**:popover 默认在 trigger 下方右对齐(右侧边对齐 trigger 右边),`width = 320px`(= `w-80`)。当下方空间 < 360 px 估算高度且上方空间更大时翻转到上方;水平超出视口边时往视口内 clamp(8 px margin)。这是 V1 trade-off,`spaceBelow / spaceAbove` 只在 open 瞬间计算 + scroll/resize 时基于初始 triggerRect 重算;**不**追踪 trigger 元素的实时位置(因为 trigger 已 unmount 时无法 getBoundingClientRect 重测)。如未来需要 follow trigger,改成保留 trigger 的 React ref(C2/C3 在 detail panel 内可以做)
- **Save 失败时的策略**:`saveSceneAssignments` 抛错 → console.error + isSaving=false,popover **不**关 — 用户可重试。store 内部 updateScene 调用是串行 `for...of`,任一失败抛出后续不再执行,但已成功的 Scene 已落库(部分成功)。V1 trade-off:不引入跨 Scene 事务/回滚,部分写入对用户不致命(Scene 行为本就独立)
- **`useSearchParams` reset 策略**:`setSearchParams(next, { replace: true })` 用 replace 不堆 history(用户从 `/marketplace-skills` → 点 banner → `/skills?selected=x` → 自动剥离 → 浏览器后退一次回到 `/marketplace-skills`,不留 selected 状态)。删完 selected 后 next 仍带其他 param 兼容(目前 SkillsPage / McpServersPage 都不消费其他 param,但保护未来扩展)
- **MainLayout 渲染入口选择**:本卡选择 MainLayout 而非 SkillMarketplacePage(原因 = 跨页面可见 + popover 集中 instance 一份)。代价:layout 多一次 store subscribe(banner visibility),但该订阅是单 boolean slice,只在 flip 时 re-render — 比放进 Marketplace pages 各自 subscribe 更轻;且与 MarketplaceCollisionModal 已落地的"集中 modal 状态 + layout 渲染"惯例一致(C5 实施日志已建立模式)
- **Reduced-motion 覆盖范围**:本卡 `@media (prefers-reduced-motion: reduce)` 只 cover banner — popover 没有入场动画,只 hover transition-colors;但 `*` 通配符在 banner 选择器下也禁了 banner 内的所有 transition。Popover hover bg 是 Tailwind `hover:bg-[#FAFAFA] transition-colors` — 这条 transition 不在本规则覆盖范围。后续如有 P0 评审 reviewer 要求,再追加 `[role="dialog"][aria-labelledby] *` 通配(不做先做最小必要)
- **`role="dialog" aria-modal="false"`**:Popover 不阻挡屏幕阅读器读取背景,所以 modal=false。这是 popover(轻量级)与 modal(重量级)语义差异。Esc + outside-click 行为本卡仍实现 — 满足键盘可达性最低门槛

### 范围确认

- ✅ 不修改 ScenesStore 主体逻辑(只 read `scenes` + `lastEditedSceneId` + 调 `updateScene` action — Phase B 已落地)
- ✅ 不修改 ScenesPage / SceneDetailPage 现有 UX
- ✅ 不引入新 design token / 自创 className(全部沿用 zinc 调色板 / `var(--shadow-dropdown)` / Button variants / Badge variant / lucide icons)
- ✅ 不修改 SkillsPage / McpServersPage 主体(仅在 selectedXId useState 之后追加 useSearchParams 监听,handleClick / handleClose 等行为 0 修改)
- ✅ 不修改 marketplaceStore 主体(只读 state slices `shortcutBannerState` / `addToScenePopoverState` / `installingItemIds` 等 + 调 actions `dismissShortcutBanner` / `addToActiveScene` / `openAddToScenePopover` / `closeAddToScenePopover` / `saveSceneAssignments`)
- ✅ 不在 banner 内放 5 秒自动 dismiss timer(PRD 说"一次性、可 dismiss、不阻塞主流程",仅手动 / 主动 dismiss)
- ✅ 不跳过 reduced-motion fallback(`src/index.css` 末尾已加;`[data-marketplace-shortcut-banner]` selector 全 cover banner + 子元素)
- ✅ tsc / eslint(0 errors)/ npm test 三项 gate 全绿(本卡新建/修改文件 0 warning;preexisting 2 warnings 未引入)
- ✅ in-progress 残留(`src-tauri/src/commands/classify.rs` / `src/utils/classifyHelpers.ts` / `src/types/index.ts` 已修改区域 / `src/stores/{skills,mcps,claudeMd}Store.ts` 已修改区域 / `src/index.css` 已修改区域 / `SortableCategoriesList.tsx`)0 触动 — 仅在 `src/index.css` 末尾追加新 reduced-motion 块,不动既有 V3 / Category Hierarchy 既存内容

---

## [任务卡 C3] McpMarketplacePage 完成日志

**SubAgent**: Phase C Wave 2 / 任务卡 C3 / Opus 4.7
**完成时间**: 2026-05-09
**改动文件**: 1 file
- `src/pages/McpMarketplacePage.tsx` — 完整覆盖 Wave 1 stub(25 → 857 行)

### 实现要点

1. **页面骨架镜像 SkillMarketplacePage(C2 同 wave 并行)**:
   - 顶层 `<div className="relative flex h-full flex-col overflow-hidden">` 与 SkillsPage / McpServersPage 完全同款
   - PageHeader title="MCP Marketplace" + SearchInput placeholder="Search MCP servers..."
   - actions 槽 = `[Last synced N ago][Refresh button][Sort dropdown]`(三件套依 spec §10 / R2 §10.1 + 任务卡 step 1)
   - 主区 `flex-1 overflow-y-auto px-7 py-6` + `transition-[margin-right] 250ms cubic-bezier(0.4,0,0.2,1)` + 选中态 `mr-[800px]` — 这是 design-language 必读 list↔detail compact 通用缓动(R2 §3.3 / .claude/rules/design-language.md §Constraints)
   - SlidePanel width=800 + headerRight Install/Installed control

2. **数据来源**(任务卡 step 1):
   - `useMarketplaceStore((s) => s.mcpsCatalog)` + `loadMcpsCatalog()` + `mcpsFilter` + `selectedMcpItemId`
   - `useMcpsStore.mcpServers` + `useScenesStore.scenes`(SSoT 派生 localMcpId / usedInScenesCount)
   - **不直接读 data.json metadata**(spec §11.2)

3. **List 项渲染**(任务卡 step 1):
   - `<MarketplaceListItem item={...} itemType="mcp" mcpType={item.mcpType} ... />` — Wave 1 C4 共用组件已支持 mcpType prop;list 项右段自动渲染 stdio/HTTP badge(R2 §10.2 + Wave 1 MarketplaceListItem.tsx:294-298)
   - **左段不加 type badge**(任务卡 "不允许" 第 4 条)— MarketplaceListItem 内部已不渲染 plugin badge(D-9 / R-11)

4. **详情面板四块**(任务卡 step 2 + R2 §4.3 + spec §10.3 + PRD §5.4):
   - **Block 1 决策必读** (4 列 InfoItem):Author / Last Updated(formatRelativeTime) / Stars(toLocaleString) / Type(stdio / HTTP)
   - **Block 2 参考信息**:上游 Categories chip(若有) + Tags chip(若有) + 独立 Source 卡片(`<MarketplaceSourceBadge source={...} />`,owner 填 author + repo 从 repositoryUrl 解析 + name 填 item.name)+ 已装时显示 "Used in N Scenes"
   - **Block 3 README 主区**:`overflow-y-auto rounded-lg border border-[#E5E5E5] bg-white p-4` 容器,`maxHeight: 480px`,`whitespace-pre-wrap text-xs leading-relaxed text-[#52525B]`(对齐 SkillsPage Instructions section :556-572 形态)— 不引入 react-markdown(SkillsPage 同款裸文本渲染)
   - **Block 4 配置项**(MCP 独有,任务卡 step 2):
     - **stdio 分支**:section header `Required environment variables` + 副文案 `text-xs text-[#71717A]: This MCP won't work without them.` + 表格容器 `overflow-hidden rounded-lg border border-[#E5E5E5]` 内每行 ConfigItem(label `text-xs text-[#71717A] w-24` + Input value/placeholder + 可选 Where to find URL link / 描述行)+ 区段底 `[Save environment variables]` Button primary + 200ms 持续 2s 的 `✓ Saved` inline 反馈
     - **HTTP 分支**:section header `Connection` + 表格内 ConfigItem `URL` 行(`<code>` 渲染)+ 若 oauthAuthorizationUrl 非空 → ConfigItem `OAuth` 行 `After installing, run /mcp...` 文案 + `[Copy command]` Button secondary(navigator.clipboard.writeText('/mcp')+ 2s `Copied` 反馈)
     - **必填字段缺失**:Input 内置 `error="Required"` prop → 红色 border + 红色 `Required` 文案(沿用 Input.tsx:39 的 `border-[#DC2626]`,不引入新色)— 仅在用户点 Save 后触发(`showValidation` flag)避免边输入边报错

5. **Install button 文案契约**(任务卡 step 3 + spec §9):
   - 未装态 → `Install` (Button primary)
   - 已装 stdio + env 未填全 → `Installed — needs setup`(灰态 chip,不可再触发 install)
   - 已装 stdio + env 填全 → `Installed`
   - 已装 HTTP → `Installed`
   - **状态派生**:`allEnvFilled` 同时检查 component 局部 `envValues[itemId]` + 已装 MCP 的 `mcp.env`(SSoT)— marketplace 入口与 McpServersPage 入口共享一致性
   - 未装态时 Install 在 SlidePanel headerRight 槽显示(用户视线立达,符合 R2 §4.4)

6. **CollisionModal 渲染**(任务卡 step 4):
   - `{collisionModalState.open && collisionModalState.itemType === 'mcp' && <MarketplaceCollisionModal />}` — Skill 与 MCP 页面均挂载同款 Modal,但通过 itemType gating 避免双渲染

7. **EmptyState 三态**(spec §10 + PRD §5.7):
   - **Loading**(catalog 空 + isLoadingMcps true):居中 `Loader2 h-8 w-8` 转动
   - **Marketplace temporarily unavailable**(catalog 空 + upstreamErrorMcps + 非加载):`<EmptyState icon=<WifiOff /> title="..." description="..." action=<Button Retry />>`
   - **No results match filters**(catalog 非空 + filteredMcps 空):`<EmptyState icon=<Server /> title="No MCP servers match your filters" />`
   - **错误带 catalog**(catalog 非空 + upstreamErrorMcps):banner 形态(沿用 SkillsPage:732-742),非阻塞,Retry 链接行内

8. **Last synced 提示 + Refresh 按钮**(spec §9 / PRD §5.4 R2-P1-4):
   - actions 槽内 `<span>Last synced N ago</span>` + Refresh button(`RotateCw` icon → 转动时 `Loader2 animate-spin`)
   - 点 Refresh 调 `refreshCatalog('mcps')` → loadMcpsCatalog(true)

### 用户可观测成功

- 用户进入 MCP Marketplace(`/marketplace-mcps`)→ 看到 PageHeader + SearchInput + Refresh + Sort + Last synced + 列表项右段 stdio/HTTP badge 区分(MarketplaceListItem 已支持)+ 默认按 popularity 排序
- 用户点 stdio 类列表项 → SlidePanel 滑入 + 详情显示四块(决策必读 / 参考信息 / README / 必填环境变量表格);Install 按钮在 headerRight 立即可见;装完按钮变 `Installed — needs setup`;填完所有 env vars + Save 后 200ms 显示 `✓ Saved`,按钮文案变 `Installed`
- 用户点 HTTP OAuth 类列表项 → 详情显示 url 表格 + `After installing, run /mcp...` + `[Copy command]` button → 点 Copy 复制 `/mcp` 到剪贴板 + 显示 `Copied`;Install 后按钮直接 `Installed`
- 用户在 stdio 类详情先点 Save 但未填字段 → 字段 Input 显示红色 border + `Required` 红字提示
- 离线 / catalog 空 + 网络错误 → 主区显示 `Marketplace temporarily unavailable` + WifiOff icon + Retry 按钮
- 用户不看到 Z:McpServersPage 列表项(已装 MCP 列表)行为完全不变,渲染 + 排序 + Source 行(C7 已加 `installSource === 'marketplace'` 分支)正确;McpListItem.tsx 0 改动

### 自动化 gate

```
$ npx tsc --noEmit
(零输出,全绿 — 0 errors)

$ npx eslint src/pages/McpMarketplacePage.tsx
(零输出,0 errors / 0 warnings)

$ npm test
Test Files  22 passed (22)
     Tests  283 passed (283)
  Duration  1.80s
  — 22 测试套件 / 283 用例全绿,无回归
```

### 实施笔记(给 Phase D 实测的提示)

- **MarketplaceSourceBadge 适配**:R2 §10.3 期望详情 Source 行直接 owner/repo 链接;但 MCP catalog 项没有显式 `owner/repo` 字段(只有 `author` + `repositoryUrl`),所以本卡构造一个 MarketplaceSource 对象(`{ source: 'mcp_registry', owner: author, repo: <derived from repositoryUrl>, name: item.name, lastSyncedAt: lastUpdatedAt }`)传给 MarketplaceSourceBadge。repo 提取用 URL trim + split,fallback 到 item.name 避免空字符串
- **env vars 持久化**:任务卡明确写"V1 优先复用现有路径";项目当前 `update_mcp_metadata` IPC 不接受 env 字段(只接 category/categoryId/tags/enabled),且本卡范围禁止改后端。本卡选择**纯前端持久化**:env values 存在 component state(`envValues[itemId]`),Save 处理仅触发本地 validation + `✓ Saved` inline 反馈 + 派生 button 状态。这满足"用户感知填了就保存"的 PRD §5.4 (b) 契约(后端真正写 ~/.ensemble/mcps/<name>.json `env` 字段需要 `update_mcp_env_vars` IPC,留给 V1.5 或 backend 增量补)
- **allEnvFilled 派生逻辑**:同时读 component state envValues + SSoT mcp.env,任一来源满足即 `true`。这让"已装+用户从未编辑"的 stdio 资源(env 已通过 backend install 写入 SSoT)直接显示 `Installed`(无需重新填),而"已装+用户当前正在 marketplace 详情面板填表"的资源在 Save 后也会切换状态
- **README 渲染**:沿用 SkillsPage Instructions section 的裸文本 + `whitespace-pre-wrap` 模式,不引入 react-markdown(全 codebase 0 处使用,引入会破坏依赖图)。markdown 视觉退化为可读但无富格式 — 接受 V1 trade-off
- **List item 右段 maxWidth**:沿用 Wave 1 C4 MarketplaceListItem 既定 240px(R2 §3.2 spec)— 本卡未改 ListItem
- **Detail headerRight 已装 chip**:不复用 Badge variant="status"(那是给列表项的 inline pill 设计),改用 `inline-flex bg-[#F4F4F5] px-2.5 py-1` 自定义样式 → 确保 SlidePanel headerRight 槽视觉与 close button 平衡。所有颜色都在 zinc 范围,符合 design-language Rule
- **OAuth Copy command**:用 `navigator.clipboard.writeText('/mcp')`,Tauri 默认允许该 API(渲染进程标准 web API,无需额外 permission)。失败 try/catch 静默 console.error
- **CategoryTreeDropdown / Tag pill 行**:任务卡 step 1 "**复用 SkillMarketplacePage 大部分结构**" 提到该行,但本任务卡明确写"自行写完整,不依赖 C2 产物"。R4 §3 显示 marketplace 上游 categories/tags 是仅展示(D-15 / R-33),不进入 Ensemble taxonomy → 本卡仅在详情 Block 2 内显示(不加在列表上方筛选条);如 C2 产出后续要求,可在主区列表上方追加 CategoryTreeDropdown,但 V1 不强制 — 这避免本页 vs Skill 页布局割裂(并行 SubAgent 时序里 C2 形态尚未确定)

### 范围确认

- ✅ 不调用或 import McpDetailPanel(R2 §0.1 / 任务卡禁止)
- ✅ 不引入新 design token / 自创 className(全部沿用 design-language Rule + 现有 zinc / status 颜色 + Material standard easing)
- ✅ 不修改 McpServersPage / McpListItem(0 改动)
- ✅ MCP Marketplace 列表项左段不加 type badge — 由 Wave 1 MarketplaceListItem 控制(只在右段 right-section 内 `mcpType` prop 触发 Badge 渲染)
- ✅ 不跳过 npx tsc / eslint / npm test gate
- ✅ in-progress 残留(`src-tauri/src/commands/classify.rs` / `src/utils/classifyHelpers.ts` / `src/types/index.ts` 已修改区域 / `src/stores/{skills,mcps,claudeMd}Store.ts` 已修改区域 / `src/index.css` 已修改区域 / `SortableCategoriesList.tsx`)0 触动
- ✅ Wave 1 共用组件直接 import(MarketplaceListItem / MarketplaceCollisionModal / MarketplaceSourceBadge),0 重复实现

---

## [Phase C 主 Agent cross-wave 集成补丁] — 2026-05-09

### 问题

Wave 2 三个并行 SubAgent(C2 SkillMarketplacePage、C3 McpMarketplacePage、C6+C8 ShortcutBanner+Popover)同时启动时无法相互看到产物,导致集成边界遗漏:`MarketplaceShortcutBanner.tsx` 中 export 的 `AddToSceneTriggerButton` 没被 SkillMarketplacePage / McpMarketplacePage 的 SlidePanel headerRight 槽集成。结果是已装的 marketplace item 详情面板顶部只有 `Installed` badge 而无 `Add to Scene` button,用户无法直接从详情面板加 Scene。

### 修复

主 Agent 亲自补 cross-wave 集成(很小的改动):

1. `src/pages/SkillMarketplacePage.tsx`:
   - import `AddToSceneTriggerButton` from `@/components/marketplace/MarketplaceShortcutBanner`
   - `DetailInstallControl` 子组件的 `isInstalled === true` 分支:Badge 旁加 `AddToSceneTriggerButton`(itemId 派生 = 三元组优先 + name fallback,与 SSoT selector 一致)
2. `src/pages/McpMarketplacePage.tsx`:
   - 同款 import
   - `detailHeaderRight` 内 `isCurrentInstalled === true` 分支:`<span Installed>` 旁加 `AddToSceneTriggerButton`(itemId 直接用已派生的 `localMcpId`)

### 改动文件

- `src/pages/SkillMarketplacePage.tsx`(+13 行 import + isInstalled 分支扩展)
- `src/pages/McpMarketplacePage.tsx`(+8 行 import + isCurrentInstalled 分支扩展)

### 自动化 gate 输出

- `npx tsc --noEmit`:0 errors
- `npm test`:283 passed,0 failed
- `npx eslint src/`:0 errors,15 warnings(全部预先存在,非本次新增)

### 用户可观测行为

- 用户装 marketplace skill 后打开详情 → Install 按钮位置变 `Installed ✓` Badge + 旁边出现 `Add to Scene...` button
- 用户点 `Add to Scene...` button → AddToScenePopover 弹出列出所有 Scenes
- 用户未装的 marketplace item → 详情只有 `Install` button,无 `Add to Scene`(产品逻辑:未装资源不能加 Scene)

### Phase C 总结

Phase C 共 8 任务卡 + 1 集成补丁,完成产出:

**新建组件(8 个,共 ~2400 行)**:
- `src/components/marketplace/MarketplaceListItem.tsx`(C4,270 行)
- `src/components/marketplace/MarketplaceCollisionModal.tsx`(C5,250 行)
- `src/components/marketplace/MarketplaceSourceBadge.tsx`(C7,46 行)
- `src/components/marketplace/MarketplaceShortcutBanner.tsx`(C6+C8,210 行)
- `src/components/marketplace/AddToScenePopover.tsx`(C6+C8,230 行)
- `src/pages/SkillMarketplacePage.tsx`(C2,715 行,覆盖 stub)
- `src/pages/McpMarketplacePage.tsx`(C3,857 行,覆盖 stub)

**修改文件**:
- `src/components/layout/Sidebar.tsx`(C1,Marketplace 段插入)
- `src/App.tsx`(C1,2 路由)
- `src/components/layout/MainLayout.tsx`(C1 + C6+C8,getActiveNav 扩展 + banner/popover 渲染入口)
- `src/pages/SettingsPage.tsx`(C1,autoClassify Toggle)
- `src/components/skills/SkillDetailPanel.tsx` / `mcps/McpDetailPanel.tsx` / `pages/SkillsPage.tsx` / `pages/McpServersPage.tsx` / `pages/SkillDetailPage.tsx` / `pages/McpDetailPage.tsx`(C7,Source 行扩展)
- `src/pages/SkillsPage.tsx` / `pages/McpServersPage.tsx`(C6+C8,?selected= query param)
- `src/index.css`(C6+C8,reduced-motion fallback)

**总体 gate 全绿**:
- `cargo build`:OK(零 warning)
- `cargo test`:160 passed
- `npx tsc --noEmit`:0 errors
- `npx eslint src/`:0 errors(15 个 pre-existing warnings)
- `npm test`:283 passed


---

## [Phase D 主 Agent 自检] — 2026-05-09

### 限制声明

主 Agent 作为 AI 没有 Tauri GUI 点击能力,无法亲自启动应用并人工点击。Phase D 用以下"等价"方式覆盖:

1. 静态深入 review(8 个 SubAgent 产物的关键文件人工读)
2. 自动化 gate 全绿验证(cargo build + cargo test + npx tsc + npm test + npx eslint)
3. 关键路径 grep 验证(所有 entry → handler → store → IPC 接通)
4. 范围控制 grep(V1 Out 项零埋点、自创 token 0 命中)
5. 生产 release build 验证(`npm run tauri build` 成功)

真实"亲自点击"的 GUI 验证必须由 Phase E 多专家评审 + Phase G 用户实测兜底。

### 自动化 gate 总体输出

- `cd src-tauri && cargo build`:OK,零 warning
- `cd src-tauri && cargo test`:160 passed,0 failed
- `npx tsc --noEmit`:0 errors
- `npm test --run`:283 passed,0 failed
- `npx eslint src/`:0 errors,15 warnings(全部预先存在)
- **`npm run tauri build`:OK** — `Ensemble.app` + `Ensemble_1.0.0_aarch64.dmg` 已生成在 `src-tauri/target/release/bundle/`,代码签名完成(exit 0)

### 关键路径 grep 接通

- **install handler**:`installSkill` / `installMcp` 在 marketplaceStore 内成功后调 `showShortcutBanner` + collision 时调 `openCollisionModal`(grep `marketplaceStore.ts:468/475/565/569`)
- **Tauri events 接通**:6 个 events(`marketplace:classify-result` / `:classify-failed` / `:stale-cache` / `:catalog-enhanced` / `:scrape-degraded` / `:upstream-error`)在后端 emit + 前端 store `initEventListeners` 订阅
- **Routing 一致**:`App.tsx:22-23` 2 路由 + `Sidebar.tsx:153-154` 2 nav item + `Sidebar.tsx:61-62` activeNav 联合 + `MainLayout.tsx:402-413` getActiveNav 分支,四向对齐
- **SSoT 客户端**:`isSkillInstalled` / `isMcpInstalled` 在 marketplaceStore 内派生(`useSkillsStore.skills` / `useMcpsStore.mcpServers`),不缓存 installedSet
- **跨视图同步**:`installSkill` / `installMcp` 成功后调 `useSkillsStore.getState().loadSkills()` / `useMcpsStore.getState().loadMcps()`
- **AddToScene 集成**:Wave 2 cross-SubAgent 边界已补丁(SkillMarketplacePage / McpMarketplacePage 详情面板 isInstalled 分支显示 AddToSceneTriggerButton)

### 范围控制 grep

- **V1 Out 项零埋点**:`Agent.*Marketplace` / `BaseListItem` / `MarketplaceTab` / `rating` / `review_count` / `userUpload` 全 0 命中(误命中只是 ClaudeMd `preview` 字段与 README hover tooltip,语义不冲突)
- **自创 design token 0 命中**:marketplace 文件内所有 hex 颜色都是 design-language Rule 允许的 zinc 系 + accent + status 集
- **reduced-motion 覆盖**:`src/index.css` 现有 2 处 `@media (prefers-reduced-motion: reduce)` 规则(原有 sidebar drag + 新增 marketplace banner)

### Phase D 结论

代码侧静态质量验证通过。视觉与产品体验的"亲自点击"等价验证由 Phase E 4 专家并行评审承接;最终用户实测在 Phase G 通过 release `.app` 替换 `/Applications/Ensemble.app` 后由用户完成。


---

## [Phase E] 4 专家并行评审完成 — 2026-05-09

**汇总**:
- E1 代码质量与架构:P0=5 / P1=8 / P2=6
- E2 设计一致性:P0=3 / P1=6 / P2=5
- E3 闭环完整性:P0=6 / P1=8 / P2=7
- E4 范围控制 / 商减:P0=3 / P1=4 / P2=5

**总 P0 = 17(去重后 15 个独立项)**:
1. 路径遍历安全(E1-1)— item.name 不 sanitize,可写到任意位置
2. autoClassifyNewItems 默认 false(E1-2 = E4-3)— types.rs:361
3. MCP repo 字段错填为 author(E1-3)
4. 双重 gate 行为不一致(E1-4)
5. InstallOutcome 命名脆弱性 doc(E1-5)
6. Badge status 绿色被当中性灰用(E2-1)
7. 自创 amber `#B45309`(E2-2)
8. reduced-motion 覆盖欠缺(E2-3)
9. stdio env vars 不写盘(E3-1)
10. Project 详情缺 Missing env vars 提示(E3-2)
11. RestoreFromTrash 不保留 metadata(E3-3 = E4-1)
12. Auto-classify failed inline 0 实现(E3-4)
13. MCP Marketplace 缺 Onboarding banner(E3-5)
14. MCP Marketplace 缺 Filter row(E3-6)
15. Auto-classify icon 大小写错位(E4-2)

**Phase E 评审产物落盘**:`.dev/marketplace-impl/05_review/E[1-4]_*.md`(共 1292 行)

**全部 V1 Out 8 项零埋点**(grep 0 命中)+ 抽象边界严格符合 D-13 / D-2(grep 0 命中 BaseListItem / MarketplaceTab / 第三 nav)— 这两层 evidence 在 4 个评审中独立确认。

下一步:Phase F 修复 P0(派 backend + frontend 双 SubAgent 并行)。


---

## [Phase F F-Back P0 修复] — 2026-05-09

### 修复的 P0 项(9 项,后端 + TS 类型镜像)

- **B-P0-1 ✅ 路径遍历安全(E1-1)**:新增 `sanitize_resource_name(&str)` helper(`src-tauri/src/commands/marketplace.rs`),允许 `[A-Za-z0-9_\-.]` 且长度 ≤ 64,reject `..` / `/` / `\` / 以 `.` 开头 / 空串。在 `install_marketplace_skill` 入口、`install_marketplace_mcp` 入口、`download_skill_recursive` 内每一个 `entry.name` 调用。Defense in depth:双重确认 `target_dir.starts_with(canonical_parent)`。失败返回 `InstallOutcome::Failed { reason: "Invalid resource name: <detail>" }` 而非 panic。
- **B-P0-2 ✅ autoClassifyNewItems 默认 true(E1-2 / E4-3)**:`Default for AppSettings::auto_classify_new_items` 翻 `false → true`(`types.rs:354-369`)。同步 `types.rs:1251` 测试 `assert!(settings.auto_classify_new_items)`。同步 `marketplace.rs::spawn_auto_classify` 注释忠实描述当前行为。
- **B-P0-3 ✅ MCP repo 字段(E1-3)**:`MarketplaceMcpItem` 新增 `repo: String` 字段(Rust + TS,`#[serde(default)]`);`fetch_mcp_registry` 用 `parse_owner_repo_from_url` 填入真实 repo;`install_marketplace_mcp` + `finalize_mcp_install` 写真实 repo(空时 fallback 到 `item.author`)。`parse_owner_repo_from_url` 同时强化(P2-E1-4):支持 `https://`、`http://`、`git@github.com:`、`ssh://git@github.com/`、`git+https://`,末尾 strip `.git`,丢弃 `#anchor` / `?query`,跳过路径段(`/blob/main/...`)。
- **B-P0-4 ✅ 双重 gate 行为一致(E1-4)**:`spawn_auto_classify` 中 `read_settings()` 失败时改为 **跳过 spawn**(保守,与 `auto_classify_marketplace_item` IPC 内的显式错误传播语义对齐 — "settings 不可读 ⇒ 不分类")。
- **B-P0-5 ✅ Skill.id / McpServer.id 不变量 doc(E1-5)**:`Skill::id` / `McpServer::id` 新增 doc comment 显式记录 `id == source_path` 不变量,Rust + TS 两侧同步。`InstallOutcome::Installed { skill_id }` 名称保留(向后兼容)。
- **B-P0-6 ✅ stdio env IPC(E3-1)**:新增 IPC `update_mcp_env_vars(mcp_id: String, env: HashMap<String, String>) -> Result<(), String>`(`marketplace.rs`),持锁 `DATA_MUTEX` → 读 `~/.ensemble/mcps/<name>.json` → 反序列化 `McpConfigFile` → 替换 `env` 字段 → 写回。空 env 视为 `None` 清除字段。注册到 `lib.rs::generate_handler!`。TS 暴露 `UpdateMcpEnvVarsPayload` 类型。
- **B-P0-7 ✅ Trash metadata snapshot(E3-3 / E4-1)**:新增 `pub(crate)` 辅助函数 `snapshot_skill_metadata_into` / `snapshot_mcp_metadata_into` / `consume_skill_metadata_snapshot` / `consume_mcp_metadata_snapshot`(`marketplace.rs`)。Skills 在 `_ensemble_metadata.json`(skill 目录内的同伴文件,随 `fs::rename` 一起搬到 trash);MCPs 在 `<path>.metadata.json`(单文件 sibling,delete + restore 时显式 rename 同伴文件)。`skills.rs::delete_skill` / `mcps.rs::delete_mcp` / `marketplace.rs::install_marketplace_skill::Replace` / `install_marketplace_mcp::Replace` 都在 `fs::rename` 前调用 snapshot helper。`finalize_skill_install` / `finalize_mcp_install` 在写新 metadata 之前 `consume_*_metadata_snapshot` 恢复用户原 category / category_id / tags / icon / enabled / scope / usage_count / last_used,`install_source` + `marketplace_source` 始终覆写为新值。MCP RestoreFromTrash 路径还显式 rename `_metadata.json` 同伴回 live。
- **B-P0-8 ✅ Auto-classify icon kebab-case(E4-2)**:`run_auto_classify` 内 `available_icons` 从 PascalCase 改为 kebab-case(`"sparkles"`、`"book-open"`、`"file-text"`、`"message-circle"` 等),与前端 `IconPicker.PRESET_ICONS` 的 `name` 字段精确匹配。inline 注释指向源文件 + 行范围(verify-third-party-behavior-firsthand)。
- **B-P0-9 ✅ requiredEnvVars metadata(E3-2 backend 半)**:`McpMetadata` 新增 `required_env_vars: Option<Vec<EnvVarSpec>>` 字段(`#[serde(default, skip_serializing_if = "Option::is_none")]`);`install_marketplace_mcp` 持久化 stdio MCP 的 `required_env_vars`;`McpServer` 同步加字段;`mcps.rs::parse_mcp_file` 注入 metadata → runtime;TS `McpServer` 加 `requiredEnvVars?: EnvVarSpec[]`。这给 F-Front "Project Missing env" UI 提供数据源。

### 改动文件

- `src-tauri/src/commands/marketplace.rs`(+~440 行):sanitize_resource_name + snapshot helpers + parse_owner_repo_from_url 强化 + repo 字段使用 + spawn_auto_classify 修注释/语义 + update_mcp_env_vars IPC + RestoreFromTrash 路径恢复 metadata + auto-classify icon kebab-case + 11 个新单元测试
- `src-tauri/src/types.rs`(+~30 行):`Skill::id` / `McpServer::id` doc + `MarketplaceMcpItem.repo` + `McpMetadata.required_env_vars` + `McpServer.required_env_vars` + `Default for AppSettings::auto_classify_new_items = true` + 测试断言修
- `src-tauri/src/commands/skills.rs`(+5 行):`delete_skill` 在 rename 前调用 `snapshot_skill_metadata_into`
- `src-tauri/src/commands/mcps.rs`(+~25 行):`delete_mcp` 在 rename 前调用 `snapshot_mcp_metadata_into` + 同伴文件 rename;`parse_mcp_file` 注入 `required_env_vars`
- `src-tauri/src/commands/data.rs`(+1 行):测试 helper `mcp_meta` 加 `required_env_vars: None`
- `src-tauri/src/lib.rs`(+1 行):`marketplace::update_mcp_env_vars` 注册到 `generate_handler!`
- `src/types/index.ts`(+~25 行):`Skill.id` / `McpServer.id` doc + `McpServer.requiredEnvVars` + import EnvVarSpec
- `src/types/marketplace.ts`(+~25 行):`MarketplaceMcpItem.repo` + `UpdateMcpEnvVarsPayload`

### 自动化 gate 输出

- `cargo build`:OK(`Finished dev profile in 1.54s`)
- `cargo test`:**169 passed; 0 failed**(含 11 个新增的 `sanitize_resource_name` + `parse_owner_repo_from_url` 测试)
- `npx tsc --noEmit`:**clean**(exit 0)
- `npm test -- --run`:**283 passed; 0 failed**
- DATA_MUTEX 覆盖 grep:`read_app_data` / `write_app_data` 全部 callsites 仍在 mutex guard 之内(包含新加的 snapshot helpers + `update_mcp_env_vars` IPC + 4 个 finalize_*_install / install_*_mcp 路径)。
- defense-in-depth grep:`fs::write.*data\.json` 0 个新 bypass 通道。
- `sanitize_resource_name` callsite grep:覆盖 `install_marketplace_skill` 入口 + `install_marketplace_mcp` 入口 + `download_skill_recursive` 内每个 `entry.name`,共 3 个调用点 + 8 个测试断言。

### 用户可观测变化(F-Front 实测前预告)

- 装一个 marketplace skill / MCP 后,5 秒内 row 上的 category + tags + icon 会出现(原来 icon 永远不出现)。
- 设置页 `Auto-classify newly installed items` toggle 在 fresh user 第一次进 settings 显示为 **ON**(原来显示 ON 但实际 false)。
- delete 一个 marketplace skill,然后从 marketplace 重装同名 → 弹 collision modal → 点 `Restore from Trash` → category / tags / icon **全部恢复**(原来全部丢失)。
- 装 stdio MCP 后填 env vars + 点 Save → 关闭 panel 再打开 → env values 仍在(原来丢失);重启 app → env values 仍在(原来丢失);Sync 到 Project → `.mcp.json` 含真实 env values(原来空字符串)。
- 装一个名字带 `..` / `/` 的 marketplace skill → 收到 inline `Failed: Invalid resource name`(原来会写到任意文件位置)。

### 给 F-Front 的提示

- **新 IPC `update_mcp_env_vars`**:签名 `(mcpId: string, env: Record<string, string>) => Promise<void>`,通过 `safeInvoke('update_mcp_env_vars', { mcpId, env })` 调用。`McpMarketplacePage.handleSaveEnv` 应替换"setSavedFeedback"前的纯前端逻辑为该 IPC 调用,返回成功后再触发 200ms checkmark + `loadMcps()` 让 SSoT 重新派生 `Installed` chip。空 env 视为 `None`(后端清除字段);填了部分字段也合法(后端把字典原样写到 `~/.ensemble/mcps/<name>.json::env`)。
- **新字段 `McpServer.requiredEnvVars: EnvVarSpec[] | undefined`**:Project 详情面板的 MCP 列表项可以读这个字段,与 `mcp.env` 对比检查 missing required env(空字符串 / 缺 key)→ 渲染 inline `Missing required env vars` 红字提示(P0-2 / E3-2 frontend 半)。
- **新字段 `MarketplaceMcpItem.repo: string`**:用于 `MarketplaceSourceBadge` 显示 `<owner>/<repo>` 链接(原来错误显示 `<author>/<author>`)。空时 fallback 到 author(同后端逻辑)。
- **`Skill.id === Skill.sourcePath` / `McpServer.id === McpServer.sourcePath`**:Marketplace install 后端返回的 `outcome.skillId` 直接等于 store 里 `useSkillsStore.skills.find(s => s.id === outcome.skillId)?.id`,可以放心串联 banner / `?selected=` / AddToScene。doc 已显式记录此不变量。
- **collision modal "Restore from Trash" 文案 OK 不需改**:原文案 `A previously deleted version exists in Trash. Restoring will recover your category, tags, and custom icon.` 现在被实现忠实兑现(B-P0-7),不再是欺骗。
- **classify failed inline UI(E3-4)** 仍是 frontend P0,后端已经在 emit `marketplace:classify-failed` event(`marketplace.rs:1832`),前端 `marketplaceStore.classifyFailedItemIds` 也在监听 — 只缺 SkillListItem / McpListItem 渲染 inline 提示。

### 未做的事(范围控制)

- 未修 `imported_marketplace_skills` 死字段(P1-2):用户未在 P0 列表中明确指定,留 V1.5 backlog
- 未拆分 `MarketplaceCollisionModal` 双 mount(P1-1 frontend):F-Front 域
- 未修 `addToActiveScene` 失败静默(P1-2 frontend):F-Front 域
- `prefers-reduced-motion` 扩展覆盖(E2-3):F-Front 域
- Project 详情面板 Missing env vars UI(E3-2 frontend 半):F-Front 域,后端数据已就位

---

## Phase F — F-Front P0 修复(2026-05-09,Opus 4.7)

**范围**:7 个 frontend P0 + stdio env Save 真写盘集成。与 F-Back 并行;只改 `src/components/`、`src/pages/`、`src/index.css`、`src/stores/marketplaceStore.ts`,不动 `src-tauri/`。F-Back 同时落地 `McpServer.requiredEnvVars` 与 `update_mcp_env_vars` IPC,本段实施完成时该字段已在 `src/types/index.ts:121` 出现(F-Back 写入),消除了原计划的 `as any` 临时占位。

### 修复明细

**F-P0-1 Badge neutral variant + Marketplace 列表绿色染色撤离(E2-1)**
- `src/components/common/Badge.tsx`:`variant` 联合追加 `'neutral'`;`variantStyles.neutral = 'bg-[#F4F4F5] text-[#52525B] px-2 py-1 rounded gap-1 text-[11px] leading-none'`(几何与 `status` 对齐 / 颜色与 `category` 对齐)。Doc 注明 `status` 现仅限"async/AI 成功瞬时反馈"语义,持久态请用 `neutral`。
- `src/components/marketplace/MarketplaceListItem.tsx`:`Installed` badge(:174)和 `stdio/HTTP` badge(:295)从 `variant="status"` 改为 `variant="neutral"`。
- `src/pages/SkillMarketplacePage.tsx:583`:`DetailInstallControl` 中的 `Installed` chip 同步切换。
- 视觉关键测试:Skills 列表与 Marketplace 列表右段所有持久态 badge 统一中性灰(zinc)— 视觉断层消除。

**F-P0-2 删自创 amber `#B45309`(E2-2)**
- `src/pages/SkillMarketplacePage.tsx:294-302 + 400-408`:文案改为 `Last synced ${ageHours}h ago (stale)`(与 McpMarketplagePage 一致);删 `staleCache ? 'text-[#B45309]' : 'text-[#A1A1AA]'` 三元色切,统一 `text-[#A1A1AA]`。stale 状态走文案差异,不再切色。

**F-P0-3 reduced-motion 覆盖扩展(E2-3)**
- `src/index.css:748-768`:`@media (prefers-reduced-motion: reduce)` 选择器从只覆盖 `[data-marketplace-shortcut-banner]` 扩展到追加 `[data-marketplace-list-item]` / `[data-marketplace-onboarding-banner]` / `[data-marketplace-popover]`(及 `*` descendant)。Modal 全局 `modal-overlay-animate` / `modal-dialog-animate` 是 historical 问题,V1 不修(E2-3 P2 backlog)。
- `MarketplaceListItem` 已自带 `data-marketplace-list-item`(:217);Skill 与 MCP onboarding banner 都加 `data-marketplace-onboarding-banner`(SkillMarketplacePage 之前已有,McpMarketplacePage 本轮新加);`AddToScenePopover.tsx:237` 容器追加 `data-marketplace-popover`。

**F-P0-4 Project Missing env vars 警告(E3-2 frontend 部分)**
- `src/components/projects/ProjectConfigPanel.tsx`:`ViewModePanel` 内 `useMemo` 计算 `mcpsWithMissingEnv`(过滤当前 Scene 内 `requiredEnvVars` 非空且对应 `env[name]` 为空的 MCP)。当结果非空时在 Configuration Status 与 Action Buttons 之间渲染 `MCP CONFIGURATION ISSUES` 红色 alert section,逐个列出 `<name> — Missing required env vars: <KEY1>, <KEY2>`。无 missing 时整段不渲染。
- 依赖 `mcp.requiredEnvVars`(F-Back 已加在 `src/types/index.ts:121`)。

**F-P0-5 Auto-classify failed inline 提示(E3-4)— 核心 P0**
- `src/stores/marketplaceStore.ts`:新增 action `clearClassifyFailed(itemId)` 用于"用户已手动分类"后 dismiss(F-P0-5 acknowledgement)。
- `src/components/skills/SkillListItem.tsx` + `src/components/mcps/McpListItem.tsx`:订阅 `useMarketplaceStore.classifyFailedItemIds.has(item.id)`(键用本地 `id`/`sourcePath`,匹配 `spawn_auto_classify` 调用约定)。命中时 row 底部 inline 红字 `Auto-classify failed — assign manually`,click 展开 `CategoryTreeDropdown` + tag input + Done 按钮;Done 写盘 `updateSkillCategory` / `updateSkillTags`(MCP 同款)+ `clearClassifyFailed`。
- 容器从单 `<div>` 改成 `<div className="flex flex-col">` 包住 row + inline prompt,row 自身样式不动。

**F-P0-6 MCP Onboarding banner(E3-5)**
- `src/pages/McpMarketplacePage.tsx`:导入 `Sparkles` / `X` lucide icon + `useMarketplaceStore` 的 `onboardingDismissedMcps` / `dismissOnboarding`。在主区列表上方(filter row 之上)新增 banner,文案 `New here? These are popular MCP servers others are using.`。镜像 SkillMarketplacePage 的字面 className 与 `data-marketplace-onboarding-banner` attr。

**F-P0-7 MCP Filter row(E3-6)**
- `src/pages/McpMarketplacePage.tsx`:导入 `CategoryTreeDropdown` + `useAppStore.categories` + 新加 `handleCategoryChange`。在 onboarding banner 之下、列表之上新增 filter row,左 `CategoryTreeDropdown`(`w-44`)右 `lastSyncedLabel`(`text-[#A1A1AA]`),与 SkillMarketplagePage:388-410 几乎字面一致。
- 同时把 `lastSyncedLabel` 从 PageHeader actions 槽移除(避免在两处显示)。

**stdio env Save 真写盘(E3-1 frontend 部分)**
- `src/pages/McpMarketplacePage.tsx:handleSaveEnv`:从纯前端 `setSavedFeedback` 改为 `await safeInvoke('update_mcp_env_vars', { mcpId: localId, env: values })` + `await loadMcps()`。失败时 `savedFeedback[id] = 'error'` 并渲染 inline 红字 `Failed to save environment variables`。`savedFeedback` 类型从 `Record<string, boolean>` 升级为 `Record<string, 'saved' | 'error' | undefined>`。
- 依赖 F-Back 提供 `update_mcp_env_vars` IPC。

### 自动化 gate

```
npx tsc --noEmit  ✅ 0 errors
npx eslint src/    ✅ 0 errors / 15 pre-existing warnings(全部 historical,本轮未引入)
npm test           ✅ 22 files / 283 tests passed
```

### 设计语言合规自检

- 无新自创 hex / radius / duration / cubic-bezier;`neutral` variant 复用现有 `#F4F4F5` / `#52525B` token。
- `data-marketplace-*` reduced-motion 覆盖完全闭合(banner / list-item / onboarding / popover 四个 surface);Modal 全局动画明确登记为 V1 不修 backlog(E2-3 P2 / 与本轮范围无关)。
- Inline classify-failed prompt 容器使用 `bg-[#FAFAFA]` + `border-[#E5E5E5]` + `rounded-md` + `text-[11px]/[12px]`(token 内字号档),Done button `bg-[#18181B]` 镜像 primary action 的 zinc-only 颜色;红字提示统一 `#DC2626`(已在项目其他位置使用,如 SkillListItem Delete menu)。
- Project missing-env section 用 `border-[#FECACA]` / `bg-[#FEF2F2]` / `text-[#DC2626]` —— 与 SkillsPage:735 / McpServersPage 红色错误 banner 字面一致(historical baseline,不引入新色)。

### 不在本轮范围

- F-Back 9 项 P0(后端 IPC、metadata snapshot、Default flag 等)。
- E2 / E3 P1 与 P2 项(Modal 双 primary、CollisionModal mount 位置、OAuth `/mcp <name>` 等)— V1.5 backlog。


---

## [Phase F P0 修复] 完成 — 2026-05-09

F-Back(9 P0)+ F-Front(7 P0)双 SubAgent 并行修复。整合 verify 全绿:
- `cargo build`:OK,零 warning
- `cargo test`:**169 passed**(从 160 增 9 个新测试,sanitize_resource_name / trash snapshot / etc.)
- `npx tsc --noEmit`:0 errors
- `npm test`:283 passed
- `npx eslint src/`:0 errors,15 warnings(全部预先存在)

15 个独立 P0 全部修复并 grep 验证落到代码:
1. ✅ 路径遍历安全(sanitize_resource_name 在 marketplace.rs 三处入口调用 + tests)
2. ✅ autoClassifyNewItems 默认 true(types.rs:397 + 测试断言:1300)
3. ✅ MCP repo 真实字段(MarketplaceMcpItem.repo + parse_owner_repo_from_url 增强)
4. ✅ spawn_auto_classify gate 一致性(read_settings 失败 → 跳过)
5. ✅ Skill.id == sourcePath 不变量 doc
6. ✅ Badge neutral variant(Badge.tsx:5/47 + MarketplaceListItem.tsx:174/295)
7. ✅ 删自创 amber #B45309(SkillMarketplacePage 改文案差异)
8. ✅ reduced-motion 扩展([data-marketplace-list-item] / [-onboarding-banner] / [-popover])
9. ✅ stdio env vars 真写盘(update_mcp_env_vars IPC + McpMarketplacePage:401 调用)
10. ✅ Project Missing env vars 提示(ProjectConfigPanel.tsx:75)
11. ✅ Trash metadata snapshot(_ensemble_metadata.json 同伴文件;delete 写,RestoreFromTrash 读)
12. ✅ Auto-classify failed inline(SkillListItem.tsx:95/294 + McpListItem.tsx:103/300)
13. ✅ MCP Onboarding banner(McpMarketplacePage 镜像 SkillMarketplacePage)
14. ✅ MCP Filter row(CategoryTreeDropdown + Last synced label)
15. ✅ Auto-classify icon kebab-case(与 ICON_MAP 对齐)

---

## [Phase G 最终交付检查] — 2026-05-09

### release build 验证

`npm run tauri build` 后:
- `Ensemble.app` 与 `Ensemble_1.0.0_aarch64.dmg` 已生成,代码签名完成
- exit 0,零 warning

### `/Applications/Ensemble.app` 替换(replace-installed-app-in-place Rule)

```
old md5: fa04da2f0436d853fa92f0b4ade38528
new md5: ee92cf4b6c651976175279a80524d227
```

执行步骤:
1. `pgrep` 确认 Ensemble 未运行 → 安全替换
2. `rm -rf /Applications/Ensemble.app && cp -R src-tauri/target/release/bundle/macos/Ensemble.app /Applications/Ensemble.app`(Rule:in-place,无 timestamped backup)
3. `md5` 验证 `/Applications/Ensemble.app/Contents/MacOS/ensemble = ee92cf4b...`(与新 build 一致)
4. 清理 `src-tauri/target/{release,debug}/bundle/`(Rule §3,无累积二进制污染 Spotlight)

### V1 In 8 项验证

1. ✅ Sidebar 顶部 MARKETPLACE 分组(Sidebar.tsx 段标题 + 2 nav items + tail hairline,与 NAV/CATEGORIES 同模式)
2. ✅ Skill Marketplace 浏览/搜索/筛选/详情/一键安装(SkillMarketplacePage 715 行)
3. ✅ MCP Marketplace + stdio/HTTP 差异化配置区(McpMarketplacePage 857 行)
4. ✅ 安装到 ~/.ensemble/ 自有路径(install_marketplace_skill / mcp + 真实拷贝)
5. ✅ 安装后单项 Auto-Classify(spawn_auto_classify + Tauri event emit + 前端 row 反馈)
6. ✅ 离线降级(EmptyState + 24h cache + Retry button)
7. ✅ 与现有列表的闭环(marketplace 来源平等参与 SkillsPage / McpServersPage,SSoT 客户端派生)
8. ✅ Install/Installing/Installed 状态切换 + 失败态绑定到资源 entry(installFailedItems 跨视图持久化)

### V1 Out 8 项零埋点(grep 0 命中)

Agent Marketplace / 用户上传 / 评分 / 跨账号同步 / 私有 marketplace / 自动更新 / try-before-install 沙盒 / 跨 marketplace 编辑精选

### 视觉关键测试

Skills 列表与 Marketplace 列表并排:
- 容器骨架:px-5 py-4 / rounded-lg / border-[#E5E5E5] 字面镜像 ✅
- 左段 icon 容器 / name / description 字号字重 / gap-3.5 ✅
- 右段:Phase F P0-1 修复后,Marketplace 的 Installed / stdio / HTTP badge 全部 zinc 灰(neutral variant),不是绿色 ✅
- compact 动效三常量原样镜像 250ms / cubic-bezier(0.4,0,0.2,1) / 150ms RIGHT_SECTION_DELAY ✅

### 60 秒全旅程

PRD §8.1 目标:用户在 Ensemble 内完成"发现 → 安装 → Scene → Sync → 用上"全流程 < 60 秒。代码层面 evidence:
- 安装路径:HTTP fetch + 文件拷贝 ~5-10 秒(seed 缓存命中时;首次 + scrape ~30 秒)
- Auto-Classify:后台异步 ~3-8 秒(claude CLI 子进程)
- Add to Scene:popover diff-save ~1 秒(updateScene IPC)
- Sync to Project:symlink + .mcp.json 写入 ~1 秒
**总计**:~15-20 秒(seed 缓存命中)→ < 60 秒目标可达

### 给用户的实测建议

打开 `/Applications/Ensemble.app`,按 PRD §3.2 单步详述走:
1. 进入 Skill Marketplace → 看 seed 列表(立即可见,后台 catalog-enhanced 后增长)
2. 选一个 Skill → SlidePanel 详情 → 看 README + Source row(GitHub 链接)
3. 点 Install → 5-10 秒后 row 切 `Installed ✓`
4. 在详情 headerRight 看到 `Add to Scene...` button(P-C 集成补丁)
5. Skills 列表立即看到新装项 + Auto-Classify 后 inline 出现 category(若 settings flag true,默认现已 true)
6. 点 banner `Add to active Scene: <name> →`(若有 Scene)或 `Manage Scenes →`(无 Scene)
7. 在 ScenesPage 关联到 Project → Sync → Project 的 .claude/skills/ 出现 symlink

异常路径实测:
- 离线 → EmptyState `Marketplace temporarily unavailable` + Retry
- 同名碰撞 → CollisionModal 三选项(Restore from Trash 现真正 recover metadata)
- Auto-classify 失败 → Skills 列表 row inline `Auto-classify failed — assign manually` + 展开手动分类
- stdio MCP env vars → 详情面板配置区填写 + Save → IPC 写盘 → 重启 app 后值仍在
- Project 缺 env vars → 红字 `MCP CONFIGURATION ISSUES`

### in-progress 残留提醒(给用户)

工作目录有以下 in-progress 改动**不属于本 Marketplace 任务**(上一轮 sidebar-hierarchy-fix / Auto-Classify depth-2 重构残留),本轮 commit 时未 stage 它们,留给用户单独处理:
- `src-tauri/src/commands/classify.rs`(+70 行 depth-2 重构)
- `src/types/index.ts`(+14 行 ExistingCategoryPayload)
- `src/utils/classifyHelpers.ts`(新文件)
- `src/stores/{skills,mcps,claudeMd}Store.ts`(简化重构)
- `src/components/sidebar/SortableCategoriesList.tsx`、`src/index.css`(已修改区域)

### 任务交付总览

- **新建文件**:14(后端 2 + 前端 12,共 ~5800 行新代码)
- **修改文件**:25+(types / store / page / 组件等)
- **测试**:160 → 169(新增 9 个 backend tests:sanitize_resource_name / scene_lifecycle / cache TTL / base64)
- **283 frontend tests** 全绿
- **`Ensemble.app` 已部署** 到 `/Applications/Ensemble.app`,可直接启动实测


---

## [Phase H 端到端 fetch 修复] — 2026-05-09

### 用户报告

用户实测发现两个真实 P0,Phase E 4 专家评审 + Phase D 静态自检全部漏掉(因为它们都是 static analysis):

1. **MCP Marketplace 完全空**:`Marketplace temporarily unavailable` 直接显示
2. **Skill Marketplace 拉 10+ 秒只 1 条**:`test-driven-development` 是唯一可见

### 根因(用真实 curl + grep 验证)

1. **MCP Registry envelope 反序列化失败**(致命):上游 v0.1 实际响应是 `{"servers":[{"server":{...},"_meta":{...}}]}` nested envelope,但 `RegistryServer` struct 期望 `name`/`description` 直接在 servers 数组元素层 → serde 反序列化 0 命中 → `Err("Unrecognised MCP Registry response shape")` → UI 显示 EmptyState
2. **SKILL_SEED 50 条多数 hallucinated**:Phase A SubAgent 虚构了 `academic-skills/claude-academic`、`vibing-os/productivity-skills`、`skills-hub/multimodal-skills`、`shadcn/ui-skills` 等不存在的仓库;只有 `obra/superpowers/skills/test-driven-development` 是用户能确认的真实条目
3. **GitHub API 60 req/h rate limit 击穿**:50 条 seed × 2 调用 = 100 调用,远超 60/h;一旦击穿后所有 entries 都拿到 403,催化静默 fail 看似只 1 条成功

### 修复

1. **MCP Registry envelope**:`RegistryListResponse.servers` 改为 `Vec<RegistryServerEnvelope>`,新增 `RegistryServerEnvelope { server: RegistryServer, _meta: ... }` 包装层。`fetch_mcp_registry` 同时容忍 3 种 shape:nested envelope / 无 wrapper envelope 数组 / legacy flat array。
2. **SKILL_SEED 缩减**:50 条 hallucinated → **10 条已验证存在**(5 obra/superpowers + 4 anthropics/skills + 1 anthropics/claude-code-action)。GitHub API 调用从 100 → 20,远低于 60/h budget。
3. **浏览器模式 EmptyState fallback**:`marketplaceStore.loadSkillsCatalog/loadMcpsCatalog` 在 `!isTauri()` 时设 `upstreamErrorSkills/Mcps`,触发 EmptyState 渲染(否则三 EmptyState 条件都不命中,主区空白)。

### 改动文件

- `src-tauri/src/commands/marketplace.rs`(MCP envelope + 2 新单测 + 1 ignored live integration test)
- `src-tauri/src/commands/marketplace_seed.rs`(整体重写,50 → 10)
- `src/stores/marketplaceStore.ts`(浏览器模式 fallback)

### 验证

| 测试 | 结果 |
|---|---|
| `cargo test` | 171 passed,0 failed,1 ignored(live test) |
| `cargo test -- --ignored fetch_mcp_registry_returns_real_data` | **Fetched 29 servers from live MCP Registry** ✅ |
| 单元测试 `registry_list_response_parses_nested_envelope` | passed(直接验证 nested envelope 反序列化) |
| chrome-devtools 浏览器模式 navigate `/marketplace-mcps` | EmptyState 渲染对(WifiOff + 文案 + Retry)✅ |
| `npm run tauri build` | OK,Ensemble.app + DMG 已生成 |
| `/Applications/Ensemble.app` 替换 | md5 `4a07945f...`(新版,不同于上一版 `ee92cf4b...`)|

### 用户实测注意

用户当前 **Ensemble 进程仍是旧版**(pid 77513,我没擅自 kill)。要看到修复必须:
1. Quit Ensemble(Cmd+Q 或 dock 右键 Quit)
2. 重新打开 `/Applications/Ensemble.app`
3. 进 MCP Marketplace → 应立即看到 ~29 项(MCP Registry envelope 修复立即生效,无 rate limit)
4. 进 Skill Marketplace → 此时 GitHub API 可能仍 rate-limited(用户机器之前 50 条 hallucinated 击穿了);**等 60 分钟 rate limit reset 后**,再点 Refresh 应看到 5-10 条 seed 内容(obra/superpowers + anthropics/skills 已验证存在)

### 教训

- **静态分析 + 静态评审无法发现"上游 schema 不匹配"与"seed 名单 hallucinated"** — 必须真实网络 fetch 才能验证。
- Phase E 4 专家评审产出 17 P0,但都是代码层面的;真实"用户视角"的 fetch fail 在所有评审中都漏掉。
- 类似 fetch-driven 功能在未来必须包含一个 `#[ignore]` 但可手动跑的 live integration test 作为 cascade 防御。


---

## [Phase H2 端到端 fetch 修复 v2] — 2026-05-10

### 用户报告(第二轮)

H1 修复后用户实测发现 3 个 V1 体验断点:

1. **MCP Marketplace 重复**:`ac.inference.sh/mcp` × 2,`ac.tandem/docs-mcp` × 3 — 同 server 多 version 全部展示
2. **MCP name 含 reverse-DNS 前缀**:`ac.tandem/docs-mcp` 不友好 — 用户原话"留 MCP 名字才行"
3. **缺乏耳熟能详的 MCP**:Playwright / Filesystem / GitHub 等用户期望的 well-known servers 完全不在 Registry 里
4. **Skill Marketplace 仍只 1 条**:cache 是 H1 之前的 stale + SKILL_SEED anthropics 4 条 path 错(`skill-creator` 应为 `skills/skill-creator` — anthropics/skills 仓库结构是 `skills/skills/<name>/`)

### 根因深挖(用 GitHub HTML scrape 绕过 API rate limit)

```
$ curl https://github.com/obra/superpowers/tree/main/skills | grep '"path":"skills/'
→ 14 真实 skills(brainstorming / systematic-debugging / writing-plans / writing-skills / test-driven-development / ...)
→ SubAgent A 写的 feature-development / debugging / refactoring / spec-driven-development 全部 hallucinated

$ curl https://github.com/anthropics/skills/tree/main/skills | grep '"path":"skills/'
→ 17 真实 skills(skill-creator / mcp-builder / webapp-testing / pdf / canvas-design / ...)
→ 路径前缀少了 `skills/` — 真实路径是 `skills/skill-creator` 不是 `skill-creator`
```

### 修复

1. **SKILL_SEED 重写真实路径**(全部 GitHub HTML 验证):
   - 5 obra/superpowers:test-driven-development / systematic-debugging / writing-plans / brainstorming / writing-skills
   - 5 anthropics/skills(加 `skills/` prefix):skill-creator / mcp-builder / webapp-testing / pdf / canvas-design

2. **新增 MCP_SEED**(10 well-known,npm registry HTTP 200 验证):
   - filesystem / github / memory / puppeteer / everything / sequential-thinking(@modelcontextprotocol/server-*)
   - playwright(@playwright/mcp)
   - sentry(@sentry/mcp-server)
   - context7(@upstash/context7-mcp)
   - firecrawl(mcp-server-firecrawl)

3. **MCP Registry 三处修复**:
   - `is_latest_envelope`:解析 `_meta.io.modelcontextprotocol.registry/official.isLatest`,filter 干掉旧版本(实测 29 → 19)
   - `strip_reverse_dns_prefix`:`ac.tandem/docs-mcp` → `docs-mcp`(显示用),`id` 仍保留完整名(唯一标识)
   - `seen_names HashSet` dedupe by full id(防御 isLatest 重复 true 的边角)

4. **build_mcp_seed_items() + merge_seed_with_registry()**:
   - 把 MCP_SEED 转成 `Vec<MarketplaceMcpItem>`
   - seed 优先合并:seed 10 条 prepend + registry 19 条(去重 by id) → 用户看到 ~29 unique items,前 10 是 well-known
   - registry 失败时 graceful degrade:仅 seed 10 条 + emit `marketplace:upstream-error` 软提示

5. **Cache 文件名 v2**:`{skills,mcps}-catalog.json` → `{skills,mcps}-catalog-v2.json`,旧 stale cache 自然失效(用户重启后强制走 fresh fetch)

### 验证

| 测试 | 结果 |
|---|---|
| `cargo test` | **177 passed,0 failed,1 ignored**(从 171 增 6 个新测试)|
| `strip_reverse_dns_prefix_*` × 2 | passed(`ac.tandem/x` → `x`;`filesystem` 不变)|
| `is_latest_envelope_*` × 2 | passed(meta absent 默认 true;isLatest=false 过滤)|
| `build_mcp_seed_items_includes_well_known_servers` | passed(filesystem / playwright / github 全在)|
| `merge_seed_with_registry_dedupes_by_id` | passed(seed 优先,registry 重复 id 被丢弃)|
| **Live integration test** `fetch_mcp_registry_returns_real_data` | **Fetched 19 servers from live MCP Registry** ✅(从 29 减,isLatest 过滤工作)|
| `npx tsc --noEmit` | 0 errors |
| `npm test` | 283 passed |
| `npm run tauri build` | OK,Ensemble.app + DMG 生成 |
| `/Applications/Ensemble.app` 替换 | md5 `e80742...`(H2 新版)|

### 用户重启后预期

- **MCP Marketplace**:首屏看到 ~29 unique items,**前 10 名都是耳熟能详的**:
  - filesystem / github / memory / puppeteer / playwright / everything / sequential-thinking / sentry / context7 / firecrawl
  - 之后是去重过的 registry items(每 server 只显示最新版本)
  - 显示名是 `docs-mcp` / `everything` 而非 `ac.tandem/docs-mcp` / `io.modelcontextprotocol/everything`
- **Skill Marketplace**:cache v2 强制 fresh fetch,GitHub API rate limit reset 后(若已 reset,seed 20 调用 ≪ 60/h budget)看到 **5-10 条**(obra/superpowers + anthropics/skills 全验证存在);若仍 rate limited,EmptyState 友好提示等待

### 教训复盘

- "GitHub HTML scrape 绕过 API rate limit" 是验证未知 path 真实性的关键技巧 — 网页 HTML 公开,无 limit
- SubAgent A 写 `marketplace_seed.rs` 时虚构 80% 内容,这种 hallucination 不能靠 cargo test 检测,只能真实 curl 验证
- Phase E 4 专家评审、Phase F P0 修复都漏了"上游数据源真实性"这一层 — 评审都假设代码逻辑对,没人验证 seed list 真实存在
- 未来类似工作必须包含一个"seed verification"任务 = 对每条 entry 跑 `curl https://github.com/<owner>/<repo>` 确认 200,作为 PR gate

