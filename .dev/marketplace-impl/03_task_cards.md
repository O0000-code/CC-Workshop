# Marketplace 实施 — 任务卡(03)

> **角色**:Phase A/B/C SubAgent 任务分发卡。
> **上游**:`00_round_plan.md`(本轮规划)+ `02_tech_spec.md`(技术契约)+ Plan 文件(`/Users/bo/.claude/plans/toasty-mixing-salamander.md`,用户已 approve)
> **纪律**:每卡 self-contained;SubAgent 读卡 + spec 即可开工。

---

## 全卡共同必读(每个 SubAgent 都读)

按顺序读完后再开工:

1. `.dev/marketplace-impl/README.md`(目录约定与 baseline 注意事项)
2. `.dev/marketplace-impl/00_round_plan.md`(本轮规划)
3. `.dev/marketplace-impl/02_tech_spec.md`(技术契约)
4. `.dev/marketplace-prd/04_PRD_v2.md`(PRD V2 终稿,按本卡指定章节)
5. `.dev/marketplace-prd/02_synthesis_decisions.md`(D-1~D-15)
6. `.dev/marketplace-prd/02_risk_distillation.md`(R-1~R-58)
7. `.dev/marketplace-impl/01_research/R[1-4]*.md`(按本卡指定的相关章节)
8. `CLAUDE.md`(项目根)
9. `.claude/rules/design-language.md`(UI 类卡必读)
10. **本卡指明的项目 Rule**

## 全卡共同纪律

- **模型**:Opus 4.7(本任务最强模型,质量优先于成本)
- **不修改 in-progress 残留**:`src-tauri/src/commands/classify.rs` / `src/types/index.ts`(已修改区域)/ `src/utils/classifyHelpers.ts` / `src/stores/{skills,mcps,claudeMd}Store.ts` / `src/components/sidebar/SortableCategoriesList.tsx` / `src/index.css`(在已修改区域)— 这些是 sidebar-hierarchy-fix 的 in-progress 改动,本轮不动
- **完成后落盘日志**:每张任务卡完成后 append 到 `.dev/marketplace-impl/04_implementation_log.md`,格式 = `## [任务卡 ID] 完成日志`+ 改动文件列表 + 自动化 gate 输出 + 用户可观测三行
- **fix-must-define-user-observable-success**:每个交付单元写"用户做 X 看到 Y / 用户不做 Z"三行
- **grep-before-enumerate-shared-resource**:改 data.json 的卡完成前重跑 R3 §4 grep 命令对比 callsite

---

# Phase A:后端实施(1 SubAgent 串行)

## 任务卡 A — 后端 marketplace 完整实施

**自我定位**:Phase A 后端实施 SubAgent。串行做完 A1-A7(类型扩展 + marketplace 模块 + HTTP fetch + cache + install + auto_classify trigger + SSoT trash helper + AppData lastEditedSceneId + Scene update 维护)。

**必读章节**:
- spec §1.1 / §1.2 / §1.3 / §1.4(数据源接入策略与上游条目类型)
- spec §2(~/.ensemble/ 路径布局变更)
- spec §3.1-§3.8(IPC 命令清单)
- spec §4(Rust 类型扩展)
- spec §11(SSoT 后端 helper)
- spec §13 Phase A 扩展(AppData lastEditedSceneId)
- spec §14(实施过程纪律)
- PRD §6 数据源策略 / §7 闭环定义
- R3 全文(后端调研)
- 项目 Rule:`.claude/rules/grep-before-enumerate-shared-resource.md` / `verify-third-party-behavior-firsthand.md` / `fallback-path-must-be-unreachable-in-test.md`

**里程碑**(串行):

### A1 — 类型扩展
1. `types.rs:34, 81, 347` 注释三态(`"local" | "plugin" | "marketplace"`)
2. `types.rs:213-245` `SkillMetadata` / `McpMetadata` 新增 `install_source: Option<String>` + `marketplace_source: Option<MarketplaceSource>`
3. `types.rs:6-90` `Skill` / `McpServer` 新增 `marketplace_source: Option<MarketplaceSource>`
4. `types.rs:330-354` `McpConfigFile` 新增 `marketplace_source: Option<MarketplaceSource>`
5. **AppData 扩展**:`types.rs:177-210` 新增 `last_edited_scene_id: Option<String>` + `imported_marketplace_skills: Vec<String>`(三元组 hash 列表,可选,只为防止 marketplace 同 skill 多次装记录)
6. 新增类型:`MarketplaceSource`、`MarketplaceSkillItem`、`MarketplaceMcpItem`、`StdioMcpConfig`、`HttpMcpConfig`、`EnvVarSpec`、`ConflictAction`、`InstallOutcome`、`TrashedItemBrief`、`MarketplaceCatalog<T>`(具体定义见 spec §1.4 / §3.3)
7. 在 `Default for AppData` / `Default for AppSettings` 内填默认值
8. cargo test 通过(types.rs 单测)

### A2 — Marketplace 模块脚手架
1. 新建 `src-tauri/src/commands/marketplace.rs`(空模块 + 全局 `OnceLock<reqwest::Client>` 单例 + `ensure_marketplace_cache_dir()` helper)
2. 新建 `src-tauri/src/commands/marketplace_seed.rs`(SeedSkill struct + `pub const SKILL_SEED: &[SeedSkill] = &[...]` ~40-60 条)
3. `src-tauri/src/commands/mod.rs` 添加 `pub mod marketplace; pub mod marketplace_seed;`
4. `src-tauri/src/lib.rs:66-165` `generate_handler!` 注册 6 个 IPC(暂为 stub):`list_marketplace_skills` / `list_marketplace_mcps` / `install_marketplace_skill` / `install_marketplace_mcp` / `auto_classify_marketplace_item` / `refresh_marketplace_cache`
5. cargo build 通过

### A3 — HTTP fetch + cache(D-Imp-1 混合)
1. 实现 `fetch_skills_seed()` 内部 helper(GitHub Contents API 拉 SKILL.md / repo metadata,串行 sleep 100ms)
2. 实现 `fetch_skills_sh_top(limit: usize)` 内部 helper(HTTP GET skills.sh,HTML 解析提取 owner/repo,然后调 GitHub API 拉每条;失败静默)
3. 实现 `fetch_mcp_registry()` 内部 helper(GET registry.modelcontextprotocol.io/v0.1/servers)
4. 实现 cache 读写(`read_skills_catalog()` / `write_skills_catalog()` / mcps 镜像;TTL 比对 24h)
5. 实现 `list_marketplace_skills(refresh: bool)`:走 spec §3.1 完整逻辑(seed 立即 + 后台 spawn skills.sh scrape + cache 增量合并 + emit events)
6. 实现 `list_marketplace_mcps(refresh: bool)`(MCP 用同款架构但只走 seed=registry,无 scrape 增强)
7. 实现 `refresh_marketplace_cache(source: String)`(传 "skills"/"mcps")
8. cargo test 通过(mock HTTP)

### A4 — install_marketplace_skill / install_marketplace_mcp
1. 实现 `is_skill_in_trash(skill_name: &str) -> bool`(spec §11.1 helper)+ `is_mcp_in_trash` 镜像
2. 实现 `install_marketplace_skill`:
   - DATA_MUTEX 取锁
   - 检查同名(自有路径 + data.json metadata + trash)
   - `conflict_action = None` 且无冲突 → 走 GitHub Contents API 递归下载 `skill_path/` 目录到 `~/.ensemble/skills/<name>/`(注意 base64 解码)→ 写 SkillMetadata(含 install_source: "marketplace" + marketplace_source 三元组)
   - `conflict_action = Replace` → 旧目录 fs::rename 到 trash → 走下载
   - `conflict_action = RestoreFromTrash` → fs::rename trash 目录到 ~/.ensemble/skills/<name>/(metadata 用 marketplace 元数据填,因 trash 不存 metadata)
   - 释放 lock
   - 后台 spawn `auto_classify_marketplace_item`
   - 返回 `InstallOutcome::Installed { skill_id }` 或 `NameCollision { ... }` 或 `Failed { reason }`
3. 实现 `install_marketplace_mcp` 镜像但物理写入是 `McpConfigFile` JSON(stdio 类 env 留空、HTTP 类含 url)
4. `verify-third-party-behavior-firsthand`:GitHub Contents API 与 Official MCP Registry 的实际 schema 必须 verify(读 GitHub docs 或运行真实 curl,inline comment 链接到 docs)
5. cargo test 通过

### A5 — 单项 auto_classify trigger + event emit
1. 实现 `auto_classify_marketplace_item(skill_or_mcp_id: String, item_type: String)`:
   - 读 `read_settings()?.auto_classify_new_items`,false → 立即 Ok(())
   - true → tokio::spawn:从 data.json 读该项 metadata 构造 ClassifyItem → 调 `auto_classify(items: vec![item], existing_categories, existing_tags, available_icons)` → 解析 ClassifyResult → 调 `update_skill_metadata` / `update_mcp_metadata` 应用 + 创建新 cat/tag if needed(用 R-applyClassifyResults 同款 backend 等价逻辑)
   - 完成时 `app.emit("marketplace:classify-result", payload)` 或 `marketplace:classify-failed`
2. 注意 `auto_classify` 通过 `claude` CLI 子进程,失败要捕获(PR-3)
3. cargo test 通过

### A6 — SSoT trash helper(已并入 A4)
此里程碑实质上已并入 A4(`is_skill_in_trash` 在 A4 开头实现)。补充测试覆盖 trash 边界情形。

### A7 — AppData lastEditedSceneId + Scene IPC 维护(因 D-Imp-6)
1. `src-tauri/src/commands/data.rs` 的 `add_scene` 在写入后 `app_data.last_edited_scene_id = Some(scene.id.clone())`
2. `update_scene` 在写入后 `app_data.last_edited_scene_id = Some(scene_id.clone())`
3. `delete_scene` 时若 `last_edited_scene_id == Some(deleted_id)` → 设为 `None` 或 fallback 到剩余 scene 中最近 modified
4. 单测覆盖 add/update/delete scene 后 last_edited_scene_id 的正确变化

**自动化 gate(必须全绿)**:
- `cd src-tauri && cargo build` 成功
- `cd src-tauri && cargo test` 全绿
- `rg -n 'read_app_data|write_app_data' --type rust` 与 R3 §4 表对比新增 callsite 全部已包 `DATA_MUTEX`
- `rg -n 'data_path|app_data\.\w+_metadata|fs::write.*data\.json' --type rust` 防御性 grep 无 bypass
- `rg -n 'McpConfigFile \{' --type rust` 三处构造点字段一致(import.rs / plugins.rs / marketplace.rs)
- 新增的 `~/.ensemble/marketplace-cache/` 路径函数有 cfg(test) panic guard 间接覆盖(经 `get_app_data_dir()`)

**用户可观测成功**(三行):
- 用户调用 `list_marketplace_skills(false)` IPC → 看到 seed 名单 + 已合并的 skills.sh top-N catalog 返回(若 24h 内已 scrape;否则只 seed)
- 用户调用 `install_marketplace_skill(item, None)` 且本地无同名 → `~/.ensemble/skills/<name>/SKILL.md` 物理出现 + `data.json.skill_metadata[<id>].install_source == "marketplace"` + 5 秒内 `marketplace:classify-result` event fire(若 settings flag true)
- 用户不看到 Z:三态扩展未影响现有 `scan_skills` / `scan_mcps` 对 local / plugin 来源的判定(回归测试通过)

**不允许**:
- 修改 `import.rs::copy_skill` 的同名碰撞短路逻辑(R-1 通过新建 install_marketplace_* 命令绕开)
- 修改 `classify.rs::auto_classify` 主体(只在 marketplace.rs 内调用)
- 修改 `trash.rs` 主体(只在 marketplace.rs 内 fs::rename 到 trash 子目录)
- 删除 in-progress 改动残留(classify.rs +70 行 / types.rs +14 行)
- 跳过 grep-before-enumerate 验证

---

# Phase B:前端 stores + types(1 SubAgent 串行)

## 任务卡 B — 前端 stores/types 完整实施

**自我定位**:Phase B 前端实施 SubAgent。串行做完 B1-B5(TS 三态 + Marketplace types + marketplaceStore + SSoT selector + settings flag default + scenesStore active scene)。

**必读章节**:
- spec §5(TS 类型扩展)
- spec §6(marketplaceStore 完整状态机)
- spec §11.2(前端 selector)
- spec §13 Phase B 扩展(scenesStore lastEditedSceneId)
- PRD §7.2 / §7.4(SSoT + Auto-classify 客户端流程)
- R4 全文(前端 stores 调研)

**里程碑**(串行):

### B1 — TS 类型扩展
1. **删死代码**:`src/types/index.ts:2` 删除 `export type InstallSource = 'manual' | 'import' | 'npx' | 'plugin';`
2. **三态**:`src/types/index.ts:32` 与 `:70` 改为 `installSource?: 'local' | 'plugin' | 'marketplace';`
3. **新增字段**:`src/types/index.ts` Skill / McpServer 末尾新增 `marketplaceSource?: MarketplaceSource;`(import from `./marketplace`)
4. **新文件**:`src/types/marketplace.ts` 完整内容按 spec §5.3
5. **AppData TS 镜像**:`src/types/index.ts:317-338` `AppData` 新增 `lastEditedSceneId?: string;` + `importedMarketplaceSkills?: string[];`(若 A1 加了对应 Rust 字段)
6. `npx tsc --noEmit` 无错误

### B2 — marketplaceStore
1. 新建 `src/stores/marketplaceStore.ts` 按 spec §6.1 / §6.2 完整实现
2. **Tauri event 订阅**:store create 时 `initEventListeners()` 用 `@tauri-apps/api/event::listen` 订阅 6 个事件(classify-result / classify-failed / stale-cache / catalog-enhanced / scrape-degraded / upstream-error),返回 unsubscribe;`MainLayout` 或 `App` 顶层调用一次确保 listeners 注册
3. **跨 store 触发**:`installSkill` 成功 → `useSkillsStore.getState().loadSkills()`;`installMcp` 同理;`saveSceneAssignments` → `useScenesStore.getState().loadScenes()`
4. **SSoT 客户端 selector**:`isSkillInstalled(item)` 三元组优先 + name fallback(spec §6.3)
5. **失败态绑定到资源 entry**:`installFailedItems[itemId] = { error, attemptedAt }`(R1-P0-5)
6. **Set 不可变更新模式**:`installingItemIds: Set<string>` 用 `new Set([...prev, id])` / `new Set([...prev].filter(i => i !== id))`(zustand 不识别 mutate)
7. `npx tsc --noEmit` 无错误 + `npx eslint src/stores/marketplaceStore.ts` 无错误

### B3 — settingsStore default flag + 死代码清理
1. `src/stores/settingsStore.ts:77` `defaultSettings.autoClassifyNewItems = true`
2. 验证 settings 持久化与 `settingsStore.test.ts` 不破坏
3. 删除 `src/types/index.ts:2` `InstallSource` alias(已在 B1 做)

### B4 — scenesStore lastEditedSceneId(因 D-Imp-6)
1. `src/stores/scenesStore.ts` 新增 `lastEditedSceneId: string | null`(初始 null,从 `useAppStore.getState().scenes` 或 `data.json` 加载时初始化)
2. `addScene` action 内 IPC 成功后 `set({ lastEditedSceneId: newScene.id })`
3. `updateScene` action 内 IPC 成功后 `set({ lastEditedSceneId: scene.id })`
4. `deleteScene` 内若被删的 = 当前 lastEditedSceneId,fallback 到剩余 scenes 中最近 modified 或 null
5. `loadScenes` 内从 `read_app_data()` 中读 `lastEditedSceneId` 并 set(若 backend 已写入)
6. 新 `getActiveScene()` selector(从 lastEditedSceneId 派生 Scene 实例)

**自动化 gate(必须全绿)**:
- `npx tsc --noEmit` 无错误
- `npx eslint src/` 无错误
- `npm test` 全绿(现有 settingsStore / 其它 store 测试不破坏)
- 死代码 `InstallSource` alias 已删(grep 验证 0 命中)

**用户可观测成功**(三行):
- 用户在控制台调用 `useMarketplaceStore.getState().loadSkillsCatalog()` → store state 出现 `skillsCatalog` 数据 + `lastSyncedSkills` ISO 时间戳
- 用户调 `useMarketplaceStore.getState().isSkillInstalled(item)` → 三元组匹配返回 true(本地已装时)/ name fallback 命中(本地有同名但无 marketplaceSource 时)
- 用户不看到 Z:`installSource === 'plugin'` 现有 11 处 callsite(R4 §2.4 列表)的渲染 / 排序行为不变

**不允许**:
- 修改 `useSkillsStore` / `useMcpsStore` / `useClaudeMdStore` 主体(只读它们的 selector)
- 修改 `installSource === 'plugin'` 的 11 处 callsite 现有逻辑
- 修改 `src/stores/skillsStore.ts:469-478` 排序沉底逻辑(marketplace 走非 plugin 分支天然不沉底)
- 在 marketplaceStore 内部缓存"installedSet"(SSoT 必须从 `useSkillsStore.skills` 派生)

---

# Phase C:UI 实施(8 SubAgent 并行,同一条消息内发布)

## 任务卡 C1 — Sidebar + Routing + Settings toggle

**自我定位**:UI 改造 SubAgent。改 Sidebar 加 MARKETPLACE 分组、App.tsx 加 2 路由、MainLayout.getActiveNav 扩展、SettingsPage 加 autoClassify toggle。

**必读章节**:
- spec §7.2 修改文件清单(Sidebar / App / MainLayout / SettingsPage)
- spec §10(可访问性 ARIA 要求)
- PRD §5.1(Sidebar 改造 ASCII 图)
- R1 §1.2 / §1.3 / §1.4(Sidebar 现状 + 插入点)
- R1 §2(Routing 配置)
- R1 §4(通用组件清单 — Toggle 用法)
- design-language Rule 全文

**实现要求**:
1. `src/components/layout/Sidebar.tsx:43` `activeNav` 联合追加 `'marketplace-skills' | 'marketplace-mcps'`
2. `src/components/layout/Sidebar.tsx:276-278` 之间插入 MARKETPLACE 段:`<div className="flex items-center justify-between flex-shrink-0 mb-3"><h3 className="text-[10px] font-semibold text-[#A1A1AA] uppercase tracking-[0.8px]">Marketplace</h3></div>` + 2 nav button(镜像 :285-308 模式,去掉 count)+ 段尾 `<div className="h-px bg-[#E4E4E7] my-4 flex-shrink-0" />`
3. `src/App.tsx` 新增 `<Route path="marketplace-skills" element={<SkillMarketplacePage />} />` 与 `<Route path="marketplace-mcps" element={<McpMarketplacePage />} />`(放在 skills 路由之前)
4. `src/components/layout/MainLayout.tsx:354-372` `getActiveNav()` 追加两个 path 分支(`startsWith('/marketplace-skills')` → `'marketplace-skills'` 等)
5. ARIA:Marketplace `<nav aria-label="Marketplace">` 包裹 nav buttons
6. `src/pages/SettingsPage.tsx` 新增 Toggle:`<Toggle label="Auto-classify newly installed items" hint="..." checked={settings.autoClassifyNewItems} onChange={(v) => updateSettings({ autoClassifyNewItems: v })} />`(找到合适 section 位置,例如 General 或 Marketplace 新建 section)

**自动化 gate**:
- `npx tsc --noEmit` 无错误
- `npm run tauri dev` 启动后 sidebar 渲染 MARKETPLACE 分组,nav item 可点击导航(虽页面是 stub,无 console error)
- ARIA 设备测试(主 Agent Phase D 验证)

**用户可观测成功**:
- 用户打开 Ensemble → 看到 Sidebar 顶部 Header 之下、Skills 之上有"MARKETPLACE"段标题 + 2 个 nav item(Skill Marketplace / MCP Marketplace)
- 用户点 Skill Marketplace → URL 变为 `/marketplace-skills`,sidebar 该项变 active(背景白 + 字深)
- 用户不看到 Z:Skills/MCP/CLAUDE.md/Scenes/Projects 5 项 + Categories + Tags 现有结构无任何视觉变化

**不允许**:
- 引入新 design token / 新颜色 / 自创 className
- 修改 Header / 现有 NAVIGATION / CATEGORIES / TAGS 段
- 改 Toggle / Sidebar / MainLayout / App.tsx 之外的其他文件

---

## 任务卡 C2 — SkillMarketplacePage 完整实施

**自我定位**:UI 实施 SubAgent。新建 SkillMarketplacePage(列表 + inline 详情 + onboarding banner + 离线 EmptyState 框架)。

**必读章节**:
- spec §3(IPC 命令清单)
- spec §6(marketplaceStore 接口)
- spec §7.1 SkillMarketplacePage 行
- spec §8(状态机)
- spec §9(文案表)
- spec §10(键盘 + ARIA)
- PRD §3.2 [3] / [4](浏览/搜索/详情)+ §5.0 / §5.2 / §5.3 / §5.4 / §5.7 / §5.8
- R2 §1 页面骨架对比 / §3 compact 动效 / §4 DetailPanel 三块布局 / §10 复用建议

**实现要求**:
1. 新建 `src/pages/SkillMarketplacePage.tsx` 镜像 SkillsPage 骨架(参 R2 §10.1 结构示例)
2. `<div className="relative flex h-full flex-col overflow-hidden">` 顶层 wrapper
3. PageHeader(`Skill Marketplace`,SearchInput placeholder `Search skills...`,actions = Refresh button + Sort dropdown + Last synced 标签)
4. 错误条复用 SkillsPage `:732-742` 同款形态
5. List 容器 `flex flex-col gap-3` + transitionMargin `mr-[800px]` 收缩
6. **CategoryTreeDropdown + Tag pill + Sort dropdown 一行**(列表上方,在 SkillsPage 类似位置或 PageHeader 与 list 之间)
7. List 渲染 `<MarketplaceListItem item={...} isInstalled={isInstalled(item)} compact={!!selectedItemId} />`(MarketplaceListItem 由 C4 提供;C2 内嵌使用)
8. SlidePanel(width=800)详情面板内嵌实现按 spec §10.1 + R2 §4.4 三块结构(Decision-critical / Reference / README + Source row + Used in X Scenes)
9. **不调用 SkillDetailPanel**(R2 §0.1 已点名 SkillDetailPanel 不被 SkillsPage 使用)
10. 列表项 hover Install 按钮 → Tooltip 显示 README 第一行(R-P2-1 / PRD §5.5)
11. EmptyState 三态:**No results**(filter 无匹配)/ **Marketplace temporarily unavailable**(WifiOff,离线)/ **Loading**(centered Loader2 spinner)
12. Onboarding banner(首次进入 + top-3 popularity 强调)— 用 `useMarketplaceStore.onboardingDismissedSkills` 控制
13. 详情面板 SlidePanel headerRight 槽放 Install button(用户视线立达)
14. compact 动效完全镜像 SkillsPage `transition-[margin-right] 250ms cubic-bezier(0.4,0,0.2,1)`(R2 §3.1 三常量)
15. reduced-motion fallback in `src/index.css`

**自动化 gate**:
- `npx tsc --noEmit` 无错误
- `npm run tauri dev` 启动 → 导航到 `/marketplace-skills` → 看到 PageHeader + List + 列表项渲染(数据来自 marketplaceStore)
- 主 Agent Phase D 验证

**用户可观测成功**:
- 用户进入 Skill Marketplace → 看到列表(seed 内容立即可见,catalog-enhanced event 后列表无缝增长)+ 顶部 Refresh 按钮 + 默认排序"By Popularity"
- 用户点列表项 → SlidePanel 滑入 main 区右收 250ms,详情面板渲染三块 + Install button 在 headerRight
- 用户不看到 Z:列表项视觉密度与 SkillsPage SkillListItem 完全一致(并排截图无差异)

**不允许**:
- 调用或 import SkillDetailPanel 组件(R2 §0.1)
- 引入新 design token / 自创 className
- 修改 marketplaceStore 主体(只 read)
- 修改 SkillsPage / SkillListItem

---

## 任务卡 C3 — McpMarketplacePage 完整实施

**自我定位**:UI 实施 SubAgent。新建 McpMarketplacePage(列表 + 详情含 stdio/HTTP 配置区差异化 + OAuth Copy command)。

**必读章节**:
- spec §3 / §6 / §7.1 McpMarketplacePage 行 / §8 / §9 / §10
- PRD §3.2 [4] / §5.4 配置项 / §7.5(stdio vs HTTP)
- R2 §1 / §2.3(MCP ListItem 差异)/ §4.3(McpServersPage 详情主区)/ §10.3 配置区示例

**实现要求**:
1. 新建 `src/pages/McpMarketplacePage.tsx` 镜像 SkillMarketplacePage 骨架(参 C2 结构)
2. List item 右段加类型 badge:`<Badge variant="status">stdio</Badge>` 或 `HTTP`(Badge 中性 zinc 色 override,不引入新色)
3. 详情面板增加"配置项"块(决策必读 / 参考信息 / README / 配置项 4 块)
4. **stdio 类配置区**:区段标题 `Required environment variables (this MCP won't work without them)` + 每个 envVar 一行 `<Input label={name} hint={description} placeholder={whereToFind} value={...} onChange={...} />` + 区段底部 `Save environment variables` button(D-Imp-9)
5. **HTTP 类配置区**:`<ConfigItem label="URL" value={<code>{url}</code>} />` + OAuth 提示 `<ConfigItem label="OAuth" value={<div>...After installing, run /mcp...<Button icon={<Copy />}>Copy command</Button></div>} />`
6. Install 按钮文案:stdio 装完 `Installed — needs setup`(直白文案,详 spec §9);HTTP 装完 `Installed`
7. 用户填完所有必填 env vars → 按钮从 `Installed — needs setup` 变 `Installed`(B2 提供的 marketplaceStore selector 派生)
8. 必填字段缺失:Input 红色边框 + 字段下方说明(沿用现有 Input error prop)

**自动化 gate**:
- 同 C2

**用户可观测成功**:
- 用户进入 MCP Marketplace → 看到列表项右段 stdio/HTTP badge 区分
- 用户点 stdio 类 → 详情显示需填字段;点 Install → 装完按钮变 `Installed — needs setup`,填完 env Save 后变 `Installed`
- 用户点 HTTP OAuth 类 → 详情显示 url + Copy command 按钮;Install 后按钮直接 `Installed`

**不允许**:
- 修改 McpServersPage / McpListItem
- 在 MCP Marketplace 列表项左段加 type badge(只在右段)

---

## 任务卡 C4 — MarketplaceListItem(共用组件)

**自我定位**:UI 实施 SubAgent。新建 MarketplaceListItem 共用组件,被 SkillMarketplacePage / McpMarketplacePage 调用。

**必读章节**:
- spec §7.1 MarketplaceListItem 行 / §8.1 Install button 三态
- R2 §2 ListItem 复用基线 / §3 compact 动效

**实现要求**:
1. 新建 `src/components/marketplace/MarketplaceListItem.tsx`
2. 容器骨架完全镜像 SkillListItem `:126-145`(`flex w-full items-center justify-between rounded-lg border border-[#E5E5E5] px-5 py-4`)
3. 左段:icon 容器 `h-10 w-10 rounded-lg`(同 SkillListItem)+ name `text-[13px] font-medium`(selected 态 font-semibold)+ description `text-xs font-normal text-[#71717A] truncate`
4. **不显示 plugin badge**(marketplace 来源不叠 R-11)
5. 右段:依据 `isInstalled` 切两态:
   - 未装:popularity 数字 `text-[11px]` + Install button(loading={installingItemIds.has(id)} disabled={installingItemIds.has(id) || isInstalled})
   - 已装:popularity + `<Badge variant="status">Check + Installed</Badge>`(灰态,不可点 install)
6. **MCP 列表项 prop**:加 `mcpType?: 'stdio' | 'http'` → 右段 badge 在 popularity 与 Install 之间
7. compact 动效三常量原样镜像(R2 §3.1):`TRANSITION_DURATION = '250ms'` / `TRANSITION_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'` / `RIGHT_SECTION_DELAY = '150ms'`
8. rightSectionStyle maxWidth:`compact ? 0 : 240px`(D-Imp / R2 §3.2 marketplace 右段比 skill/mcp 窄)
9. hover 态 Tooltip 显示 README 第一行(`<Tooltip content={readmeFirstLine} maxWidth={320}>`)
10. **失败态**:若 `installFailedItems[id]` 存在 → button 变 `Retry` + Tooltip 显示 error
11. row click 触发 `onSelect(item)` 父组件传 — 选中项打开详情面板

**自动化 gate**:同 C2/C3

**用户可观测成功**:
- 用户在 Skill Marketplace 看到列表项 → 右段显示 popularity 数字 + Install button
- 用户点 Install → button 变 Installing... → 安装完成变 `Installed ✓`
- 用户不看到 Z:左段没有 plugin 蓝点 badge

---

## 任务卡 C5 — MarketplaceCollisionModal + Trash restore 端到端

**自我定位**:UI + IPC 集成 SubAgent。新建同名碰撞 Modal 组件,接通 marketplaceStore.collisionModalState + IPC 调用 + Trash restore。

**必读章节**:
- spec §3.3 / §3.4(InstallOutcome::NameCollision)+ §6.2 collision actions / §9 文案 / §10.2 ARIA
- PRD §5.6 / §7.6(同名碰撞处理 + Trash restore 语义)
- R2 §6(Trash UX 现状)/ R3 §7(Trash 后端流程)/ R4 §6(SSoT 第 3 条件)

**实现要求**:
1. 新建 `src/components/marketplace/MarketplaceCollisionModal.tsx`
2. 沿用现有 `Modal` 通用组件(`maxWidth=480`,role=alertdialog)
3. Body 渲染:`<name> already exists in your library.` + 按 hasLocal/hasTrashed 切两态描述文案(spec §9)
4. Footer 三按钮(动态):
   - 仅 hasLocal:`[Cancel] [Replace existing]`,默认 focus Cancel
   - 仅 hasTrashed:`[Cancel] [Restore from Trash]`,默认 focus Restore
   - 两者都有:`[Cancel] [Replace existing] [Restore from Trash]`,默认 focus Restore
5. click Replace → `await marketplaceStore.installSkill(item, { kind: 'replace' })`(or installMcp)+ close modal
6. click Restore → `await useTrashStore.getState().restoreSkill(trashPath)` → `await useSkillsStore.getState().loadSkills()` + close modal + `marketplaceStore.dismissCollisionModal()`
7. click Cancel → 仅 close modal
8. Modal 弹出前确保 `useTrashStore.trashedItems` 已 load(若未 load 由 marketplaceStore 内部 ensure-load)
9. ARIA 完整:`role="alertdialog"` + `aria-labelledby` + `aria-describedby`

**自动化 gate**:同 C2

**用户可观测成功**:
- 用户装一个本地已有同名的 marketplace skill → Modal 弹出 `Replace existing` 与 `Cancel`,默认 focus Cancel
- 用户曾删过同名(Trash 中存在) → Modal 多一个 `Restore from Trash` 选项,默认 focus 在它
- 用户点 Restore → 该 skill 从 Trash 恢复,Skills 列表立即出现该项,Marketplace 列表对应项切回 Installed ✓
- 用户点 Cancel → 无任何变化(Modal 关闭)

**不允许**:
- 直接 mutate 文件系统(只通过 IPC)
- 修改 trashStore / TrashRecoveryModal

---

## 任务卡 C6 — ShortcutBanner + EmptyState + SkillsPage query-param

**自我定位**:UI SubAgent。新建 ShortcutBanner(基础版)+ EmptyState + 改 SkillsPage 监听 `?selected=` 短链。

**必读章节**:
- spec §7.1 MarketplaceShortcutBanner 行 / §9 文案表 / §10.3 reduced-motion
- PRD §5.5.1 short-cut 引导 / §5.7 离线/错误状态
- R2 §10.5 EmptyState 用法 / R4 §9.3 selectedSkillId query-param

**实现要求**:
1. 新建 `src/components/marketplace/MarketplaceShortcutBanner.tsx`(基础版,active Scene 增强由 C8 接管)
2. banner 容器:`bg-[#FAFAFA] border border-[#E5E5E5] rounded-lg px-4 py-3 flex items-center gap-3`(沿用 design-language token)
3. 左侧 check icon + 文案 `Installed in your library.`
4. 右侧 nav links:`View in Skills →`(navigate `/skills?selected=<skillId>`)+ `[active Scene 部分留 placeholder,C8 接管]`
5. close button(`×`)右上角,onClick `marketplaceStore.dismissShortcutBanner()`
6. 自动消失:5 秒后(可选)— 但 PRD 说"一次性、可 dismiss、不阻塞主流程"故仅手动 dismiss
7. **SkillsPage `?selected=` query-param**:`src/pages/SkillsPage.tsx` 内 `useSearchParams` 监听 `selected` query → `useEffect` 设 `setSelectedSkillId(query)` 初始化(只在首次 mount 时)
8. McpServersPage 同款扩展(支持 `?selected=`)
9. EmptyState 三态完整实现(在 C2/C3 内调用,本卡只确保模板正确):**No results** + **Marketplace temporarily unavailable** + 通用 Loading
10. reduced-motion fallback:`@media (prefers-reduced-motion: reduce) { [data-marketplace-shortcut-banner] { transition: none !important; animation: none !important; } }` 加到 `src/index.css` 末尾

**自动化 gate**:同 C2

**用户可观测成功**:
- 用户在 Marketplace 装完一个 skill → 详情面板顶部出现 `Installed in your library.` banner + `View in Skills →` link
- 用户点 `View in Skills →` → URL 变为 `/skills?selected=<skillId>` → SkillsPage 自动选中该项 SlidePanel 滑入
- 用户在 SkillsPage 直接修改 URL 加 `?selected=<id>` → 该项被选中

**不允许**:
- 引入新 design token
- 修改 SkillsPage 主体逻辑(只加 useSearchParams 监听)

---

## 任务卡 C7 — DetailPanel Source 行扩展 marketplace 来源

**自我定位**:UI SubAgent。在现有 SkillDetailPanel / McpDetailPanel / SkillsPage / McpServersPage 内嵌详情的 Source section 内,追加 `installSource === 'marketplace'` 分支显示上游来源。

**必读章节**:
- spec §7.2 Source 行修改清单
- PRD §5.4(详情面板 Source 行)
- R4 §2.4(`installSource === 'plugin'` callsite 11 处)

**实现要求**:
1. `src/components/skills/SkillDetailPanel.tsx:586` `installSource === 'plugin'` 分支后追加:
   ```tsx
   ) : skill.installSource === 'marketplace' ? (
     <MarketplaceSourceBadge source={skill.marketplaceSource} />
   ) : ( /* default 'local' 分支 */ )
   ```
2. `src/components/mcps/McpDetailPanel.tsx:538` 镜像
3. `src/pages/SkillsPage.tsx:620` 内嵌 Source 渲染镜像
4. `src/pages/McpServersPage.tsx:611` 内嵌 Source 渲染镜像
5. `src/pages/SkillDetailPage.tsx:450` 与 `McpDetailPage.tsx:361` 镜像
6. 新建 `src/components/marketplace/MarketplaceSourceBadge.tsx`:`<a href={`https://github.com/${owner}/${repo}`} className="font-mono text-xs text-[#18181B] hover:underline">{owner}/{repo}</a>` + Source label

**自动化 gate**:同 C2

**用户可观测成功**:
- 用户装 marketplace skill 后到 Skills 详情 → Source row 显示 `<owner>/<repo>` GitHub 链接
- 用户的 local 来源 skill 详情 Source row 显示路径(原行为不变)
- 用户的 plugin 来源 skill 详情 Source row 显示 plugin name(原行为不变)

**不允许**:
- 改 plugin 分支现有逻辑
- 引入新 design token

---

## 任务卡 C8 — AddToScenePopover + Active Scene 整合

**自我定位**:UI 实施 SubAgent。实现 D-Imp-6 完整路径:active Scene + AddToScenePopover + ShortcutBanner 整合显示 active Scene。

**必读章节**:
- spec §6.1 / §6.2(addToScenePopoverState + 相关 actions)+ §7.1 AddToScenePopover.tsx + §9 文案表 + §13 Phase B/C 扩展
- PRD §5.5.1 short-cut 引导 + §7.0 三段式契约
- R4 §9(加 Scene 客户端流程) / R2 §9(加 Scene UX 现状)
- Plan 文件"Active Scene + 内嵌 Popover"段(用户决策细节)

**实现要求**:
1. 新建 `src/components/marketplace/AddToScenePopover.tsx`(~200 行)
2. Popover 容器:`portal` 到 body,`triggerRect` 锚点定位,`shadow-[var(--shadow-dropdown)]` + `rounded-md bg-white border border-[#E5E5E5]`
3. Header:`Add to Scenes`(text-sm font-semibold)
4. Body:列出 `useScenesStore.scenes` → 每行 `<Checkbox + Scene name + 当前是否已含本资源(check icon)>`
5. Empty state(0 个 Scene):`No scenes yet.` + `Create your first Scene →`(navigate `/scenes`)
6. Footer:`[Cancel] [Save]`,Save 触发 `marketplaceStore.saveSceneAssignments(selectedSceneIds)`
7. saveSceneAssignments 实现:diff initialSelectedSceneIds vs selectedSceneIds → 对每个 changed Scene 调用 `useScenesStore.updateScene(sceneId, { skillIds: [...] })`(各 IPC 串行 await)
8. 完成后 popover close + `useMarketplaceStore.dismissShortcutBanner()`(说明用户已"选" 步骤完成)
9. **MarketplaceShortcutBanner 增强**(C6 已有基础版,此卡接管):
   - 加 active Scene 显示:`Add to active Scene: <name> →`(直接调用 `marketplaceStore.addToActiveScene()`)
   - 加 popover trigger button:`Add to Scene...`(secondary variant + Plus icon)→ click 调 `marketplaceStore.openAddToScenePopover(...)`
   - 无 active Scene 时(scenesStore.lastEditedSceneId 为 null):banner 替换为 `Create your first Scene →`(navigate `/scenes`)
10. 详情面板 SlidePanel headerRight 增加 `Add to Scene...` button(secondary + Plus icon) — 与 banner 平级触发 popover
11. 详情面板内嵌 `Used in X Scenes` 文案 = `useScenesStore.scenes.filter(s => s.skillIds.includes(targetItemId) || s.mcpIds.includes(targetItemId)).length`

**自动化 gate**:
- `npx tsc --noEmit` 无错误
- 用户场景实测(Phase D)

**用户可观测成功**:
- 用户装完 marketplace skill → ShortcutBanner 出现 `Installed in your library.` + `Add to active Scene: <SceneName> →` + `[Add to Scene...]` button
- 用户点 `Add to active Scene` → skill 加入该 Scene + ShortcutBanner 消失;ScenesPage 立即看到 Scene 含此 skill
- 用户点 `Add to Scene...` button → popover 弹出,列出所有 Scenes + checkbox + 已含项预勾选 → Save 后多 Scene 同时更新
- 用户从未编辑过 Scene → ShortcutBanner 显示 `Create your first Scene →`(无 active Scene 状态)

**不允许**:
- 修改 ScenesStore 主体逻辑(只加 lastEditedSceneId 字段维护已在 B4)
- 修改 ScenesPage / SceneDetailPage 现有 UX
- 引入新 design token

---

## 任务卡 D-G(主 Agent 直接做,不派 SubAgent)

- **Phase D**:主 Agent 自点击循环调试(npm run tauri dev + 主 Agent 亲自走 PRD §3.2 单步详述);每轮日志 append 到 `04_implementation_log.md`
- **Phase E**:派 4 个并行评审 SubAgent(详 plan 文件§"Phase E"表)
- **Phase F**:主 Agent 关闭 P0 + 再 D 调试
- **Phase G**:主 Agent 60 秒全旅程 + 视觉关键测试 + V1 In/Out 确认 + release build 替换 `/Applications/Ensemble.app`(沿 user memory 偏好 + replace-installed-app-in-place Rule)

---

**任务卡分发完毕。Phase A SubAgent 启动后,任务卡 A 是该 SubAgent 的完整 prompt 基础;主 Agent 在派 SubAgent 时把任务卡内容 + 共同必读 + 任务卡 A 详细要求作为 prompt 入口。**
