# B. 功能全景与用户使用场景

> 来源：Explore Sonnet SubAgent B（2026-05-12）
> 覆盖：功能总览 / 领域模型 / 每页详解 / Marketplace 系统 / AI 自动化 / 用户工作流 / 隐性功能 / 完成度

## 1. 功能总览表

| 路由 / 功能区 | 一句话职责 |
|---|---|
| `/marketplace-skills` (SkillMarketplacePage) | 浏览 skills.sh 91k+ Claude Code Skill，搜索并一键安装到本地 |
| `/marketplace-mcps` (McpMarketplacePage) | 实时镜像 Official MCP Registry，浏览/搜索/安装 MCP Server |
| `/skills` (SkillsPage) | 管理已安装 Skill：查看、编辑元数据、排序/分组、启用/停用、AI 自动分类 |
| `/mcp-servers` (McpServersPage) | 管理已安装 MCP Server：查看工具列表、编辑配置、排序/分组、AI 分类 |
| `/claude-md` (ClaudeMdPage) | 管理 CLAUDE.md 上下文文件：导入、编辑、设全局、分发到项目目录 |
| `/scenes` (ScenesPage) | 创建并管理 Scene（配置集合），把 Skill / MCP / CLAUDE.md 打包成可复用模板 |
| `/projects` (ProjectsPage) | 注册本地项目文件夹并关联 Scene，Sync 把 Scene 部署到项目目录 |
| `/category/:categoryId` (CategoryPage) | 按分类聚合视图：显示该分类及其子类下所有 Skill / MCP / CLAUDE.md |
| `/tag/:tagId` (TagPage) | 按标签聚合视图：显示携带该 Tag 的所有 Skill / MCP / CLAUDE.md |
| `/settings` (SettingsPage) | 全局设置：CLAUDE.md 分发路径、Auto Classify 模型/开关、终端应用、Finder 集成、Trash 回收 |

## 2. 核心实体（领域模型）

### 实体定义

**Skill** — Claude Code 的"指令插件"。对应 `~/.ensemble/skills/<name>/SKILL.md` 文件夹。字段：`id`（= `sourcePath`）、`name`、`description`、`instructions`、`category`/`categoryId`、`tags`、`enabled`、`scope`（`global`/`project`）、`invocation`、`allowedTools`、`usageCount`、`installSource`（`local`/`plugin`/`marketplace`）。

**MCP Server** — Model Context Protocol 服务器配置。对应 `~/.ensemble/mcps/<name>.json`。字段：`id`、`name`、`command`/`args`/`env`（stdio）或 `url`（HTTP）、`providedTools`、`scope`、`requiredEnvVars`。

**CLAUDE.md 文件** — Claude Code 上下文指令文件。存储在 `~/.ensemble/claude-md/`。三种类型：`global`（用户级 `~/.claude/CLAUDE.md`）、`project`（项目级）、`local`（`CLAUDE.local.md`）。通过 `isGlobal` 决定是否分发到 `~/.claude/CLAUDE.md`，通过 `distribute` 复制到项目目录。

**Scene** — 配置集合（模板）。字段：`id`、`name`、`description`、`icon`、`skillIds`、`mcpIds`、`claudeMdIds`。Ensemble 闭环的核心枢纽。

**Project** — 本地项目文件夹的注册记录。字段：`id`、`name`、`path`、`sceneId`、`lastSynced`。

**Category** — 标签分类（两级层级）。字段：`id`、`name`、`color`、`count`（派生）、`parentId`（`undefined` = 根级，max depth = 2）。`count` 由 `MainLayout.tsx` 实时计算注入 sidebar。

**Tag** — 轻量标签。Tag 是跨切、多值的；Category 是层级、单归属的。

**Plugin** — 来自 Claude Code 自身插件系统（`~/.claude/plugins/`）的资源来源。`installSource === 'plugin'` 的 Skill/MCP 对应此来源。

**MarketplaceSource** — V2 新增，记录 Skill/MCP 的 marketplace 溯源：`(source, owner, repo, name, repoSubpath, lastSyncedAt)` 六元组。

### 实体关系

```
MarketplaceSkillItem ──install──> Skill
MarketplaceMcpItem   ──install──> McpServer
Plugin               ──import──>  Skill / McpServer

Skill ←─────────────────────────┐
McpServer ←──── Scene (ids) ────┤ N资源 ↔ 1Scene（多对多）
ClaudeMdFile ←──────────────────┘

Scene ←──── Project (sceneId) ────── 1Scene ↔ NProject（一对多）

Skill / McpServer / ClaudeMdFile ──categoryId──> Category（多对一）
Skill / McpServer / ClaudeMdFile ──tags[]──> Tag（多对多）
Category ──parentId──> Category（自引用，最多两级）
```

### 数据持久化

- Skills/MCPs 元数据（category、tags、icon、installSource 等）存 `~/.ensemble/data.json` 的 `skill_metadata` / `mcp_metadata` HashMap
- Skills 实际文件在 `~/.ensemble/skills/<name>/`
- MCPs 配置 JSON 在 `~/.ensemble/mcps/<name>.json`
- CLAUDE.md 在 `~/.ensemble/claude-md/`（UUID 命名）
- Scenes / Projects / Categories / Tags 全部在 `~/.ensemble/data.json`

## 3. 每个核心功能详解

### 3.1 Skills Management (`/skills`)

**痛点**：Claude Code Skill 分散在 `~/.claude/skills/`、plugin 路径，无法统一查看启用/禁用、使用频率、分类。

**主要交互**：
- 4 种排序（Name / Recently added / Recently used / Most used），3 种分组（None / Categories / Tags）
- 实时搜索 name/description
- Scope 切换（Global / Project）
- 选中 Skill 打开 SlidePanel：编辑 name/description/category/tags/icon、查看使用统计
- `ImportSkillsModal`：扫描 `~/.claude/skills/`（`claude` tab）或 plugin（`plugin` tab）批量导入
- Auto Classify 按钮：AI 批量分类
- `MarketplaceSourceBadge` 展示 marketplace 来源链接

### 3.2 MCP Servers Management (`/mcp-servers`)

**痛点**：MCP 配置分散在 `~/.claude.json`（user）和各项目 `.mcp.json`（project），手动编辑易错，不知每个 MCP 提供哪些工具。

**主要交互**：
- 与 SkillsPage 对称的排序/分组/搜索
- 详情 SlidePanel：MCP 命令、参数、环境变量（可编辑）、`providedTools` 运行时工具列表
- "Fetch Tools"：实时连接 MCP server 获取工具
- `ImportMcpModal`：扫描 `~/.claude.json` 中的 user/local scope MCPs
- `requiredEnvVars`：Marketplace 安装的 MCP 记录必填 env，详情面板渲染输入框

### 3.3 CLAUDE.md Management (`/claude-md`)

**痛点**：同份 CLAUDE.md 需分发到多个项目，手动 copy 易过时；全局与项目上下文混淆。

**主要交互**：
- `ImportClaudeMdModal`：从文件系统导入
- `ScanClaudeMdModal`：扫描所有 CLAUDE.md / CLAUDE.local.md / `.claude/CLAUDE.md`
- 详情：编辑内容、设 Global（同步到 `~/.claude/CLAUDE.md`）、分发到 Scene 关联项目（路径可配 `.claude/CLAUDE.md` / `CLAUDE.md` / `CLAUDE.local.md`）
- 全局文件置顶：`isGlobal=true` 始终排首

### 3.4 Scenes (`/scenes`)

**痛点**：不同项目类型需要不同 Skill+MCP 组合，每次切换要手动重配。Scene 让用户一次定义多处复用。

**主要交互**：
- `CreateSceneModal`：名称、描述、图标
- SlidePanel：Scene 包含的资源、关联 Projects 列表（`ProjectChip`）
- 编辑：增减 Skills/MCPs（通过 `AddToScenePopover` 或 Skill/MCP 详情面板）
- `lastEditedSceneId` 驱动 Marketplace "Add to active Scene" 快捷功能

### 3.5 Projects (`/projects`)

**痛点**：多仓库各自配置 Claude Code，手动维护繁琐易冲突。

**主要交互**：
- 注册项目（选文件夹 + 关联 Scene）
- **Sync**：Scene 的 Skills（symlinks）+ MCPs（`.mcp.json`）部署到项目目录
- Clear：清除部署内容
- 切换 Scene：自动 Clear + Sync

### 3.6 Category Page / Tag Page

CategoryPage 通过 `collectDescendantIds`（`CategoryPage.tsx:38`）递归收集子类 ID，实现层级聚合。TagPage 是跨切面（一个 item 多 Tag）。

### 3.7 Settings (`/settings`)

4 个功能区：
1. **CLAUDE.md**：分发目标路径
2. **Auto Classify**：选 AI 模型（Opus/Sonnet/Haiku）、开关"自动分类 Marketplace 新装"、重置分类数据
3. **Storage**：TrashRecoveryModal 恢复已删除项
4. **Launch Configuration**：选择终端（Terminal/iTerm2/Warp/Ghostty/Alacritty）、Warp/Ghostty Tab/Window 模式、启动命令、安装 Finder Quick Action

## 4. Marketplace 系统专章

### 4.1 系统定位

V2.0 核心新功能，"发现→评估→安装"上游入口。**App 默认落地页已改为 `/marketplace-skills`**（`App.tsx:21`）。

### 4.2 Skill Marketplace（`/marketplace-skills`）

- **数据源**：skills.sh 内部 API（`/api/skills/{view}/{page}` 和 `/api/search`），不需 API key，91,000+ 真实分页
- **3 个视图 Tab**：All Time / Trending / Hot（Hot 额外显示 `installsYesterday` 和 `change`）
- **8 个 Topic 过滤**：React / Next.js / Databases / Design & UI / Marketing / Mobile / Testing / Agent workflows
- **搜索**：debounce 300ms，返回 `searchType`（`fuzzy` / `semantic`）和 `durationMs`
- **无限滚动**：200 items/page
- **详情 SlidePanel**：
  - Block 1：Info Row（install count / stars / author）+ Badges（official + source）
  - Block 2：README（on-demand GitHub fetch）
  - Block 3：AI Summary（Marketplace 专属 auto-classify，可选触发）
  - Block 4：Related skills（topic 匹配或同 repo 匹配，最多 5 个）
  - 底部：Install 按钮 / "Add to Scene" 快捷
- **已安装状态**：`(owner, repo, name)` 三元组精确匹配
- **Collision 处理**：`MarketplaceCollisionModal` "Replace" / "Restore from Trash"

### 4.3 MCP Marketplace（`/marketplace-mcps`）

- **数据源**：Official MCP Registry（`registry.modelcontextprotocol.io/v0.1/servers`），cursor-based 分页，96/page
- **视图 Tab**：All Servers / Recently Updated（`updated_since` 过滤）
- **分页**：Previous / Next（非无限滚动）
- **详情**：Info Row + Badges + README + Configuration Block（stdio: env var 输入框；HTTP: URL + OAuth 按钮）+ 复制命令 + Install

### 4.4 "Add to active Scene" 快捷流

安装后 `AddToSceneTriggerButton` 弹出 `AddToScenePopover`，默认高亮 `lastEditedSceneId`。**这是"发现→安装→立即使用"闭环的最后一步**。

### 4.5 Auto-classify on install

`autoClassifyNewItems` 开启时，后端自动 `spawn_auto_classify`，通过 Tauri event `marketplace:classify-result` 异步推送结果，前端更新 item 的 category/tags/icon。

### 4.6 Stale Cache / Scrape Degraded 处理

订阅 `marketplace:stale-cache` / `marketplace:scrape-degraded` / `marketplace:upstream-error` 事件（`marketplace.ts:297-317`），离线/上游错误时仍能展示缓存内容。

## 5. AI / 自动化功能

### 5.1 Auto Classify（手动触发）

**机制**：
1. 前端收集 `ClassifyItem[]`（name + description，**不含 instructions 全文**——`auto-classify-context-overflow/05_recommendation.md` 优化）
2. IPC 调 `auto_classify` → 后端调 `claude -p <prompt> --output-format json --json-schema <schema> --dangerously-skip-permissions --model <classifyModel>`
3. 返回 `ClassifyResult[]`（`suggested_category`, `suggested_parent_category`, `suggested_tags`, `suggested_icon`）
4. 前端创建新 Category/Tag，调用 `update_*_metadata` 持久化

**模型选择**：Settings 中 Opus / Sonnet / Haiku（`classifyModel` 字段）
**层级分类**：`suggested_parent_category` 不为空时，建议作为某父类子类（max depth = 2）
**Scope 支持**：`ClassifyScope`（`types/index.ts:185-188`）允许局部分类
**视觉反馈**：rainbow border 动效（`src/index.css:190-547`），完成后 1.5 秒绿色后重置

### 5.2 Context Overflow 研究

`.dev/auto-classify-context-overflow/` 系统性 A/B/C/D 实验：
- Strategy D（全文）56 个 Skill 时 prompt 达 210K tokens，触发 Sonnet blocking limit
- Strategy A（仅 description）category 准确率 ≥ D，且语义质量在多 case 中更优（4:2 wins）
- **采用 Strategy A**（`05_recommendation.md`）

### 5.3 Marketplace 安装后 Auto-classify

独立路径：后端 `spawn_auto_classify` 仅对新装单个 item 运行，结果异步推送，不阻塞安装。

## 6. 典型用户工作流

### Journey A：新用户从打开到部署第一个 Scene

1. 默认落地 `/marketplace-skills`，看 skills.sh 热门
2. Onboarding banner "New here? Try these popular Skills"
3. 点击 Skill → SlidePanel 展开 README + install count
4. Install → 安装到 `~/.ensemble/skills/`，若开 `autoClassifyNewItems` 则异步分类
5. 进 `/skills` 确认 Category 正确
6. 进 `/scenes`，创建 "Frontend Dev"，加 Skill
7. 进 `/projects`，注册项目，关联 Scene
8. Sync，Skills 通过 symlink 部署，`.mcp.json` 写入

### Journey B：老用户更新某 Skill

1. `/skills` 找到目标，`MarketplaceSourceBadge` 显示上游链接
2. 点击 badge 浏览器查上游变更
3. `/marketplace-skills` 搜索 → `MarketplaceCollisionModal` → "Replace"
4. 新版本安装，旧版本进 Trash
5. Scene 引用 id（= sourcePath，路径不变），无需手动更新

### Journey C：从 Marketplace 安 MCP 并立即使用

1. `/marketplace-mcps` 搜 "linear" → Configuration Block 列 `LINEAR_API_KEY` 必填 env
2. Install → 写入 `~/.ensemble/mcps/linear.json`，env 预填空
3. "Add to Scene" 按钮高亮 `lastEditedSceneId` → 选 Scene
4. MCP 详情 env var 输入框填 key → 自动保存
5. `/projects` 点 Sync，`.mcp.json` 写入

## 7. 隐性 / 高级功能

### 7.1 Trash 回收系统

删除 = 移到 `~/.ensemble/trash/<type>/`，记录 `deletedAt`。Settings → Storage → Recover 打开 `TrashRecoveryModal`，三 Tab 浏览批量恢复。Marketplace Collision 中 `TrashedItemBrief` 让用户选"Restore from Trash"代替重下载。`importedMarketplaceSkills` 记录历史安装 triple-hash ids。

### 7.2 Plugin 集成（`~/.claude/plugins/`）

`InstalledPlugin` 含 `hasSkills` / `hasMcp` 标志。`DetectedPluginSkill` / `DetectedPluginMcp` 用于导入。导入资源 `installSource === 'plugin'`，**在排序时 plugin-sink 沉到底部**。

### 7.3 Finder Quick Action

Settings → Launch Configuration → Finder Integration → Install 调 `install_quick_action`，安装 macOS Quick Action 到 `~/Library/Services/`。Finder 右键文件夹选"Open with Ensemble"。

### 7.4 `--launch` CLI Flag

`lib.rs:44-66`：Ensemble 支持 `--launch <path>`。已运行时通过单实例协议发 `second-instance-launch` Tauri event。`LauncherModal` 接收文件夹路径 → 显 Scene 选择器 → Sync → `launch_claude_for_folder` 在选定终端打开 Claude Code。

### 7.5 PATH 修复（macOS GUI 应用）

`main.rs:5` 启动时运行用户 login shell 获取完整 PATH，确保从 Finder/Launchpad 启动的 GUI 应用能找 `claude` CLI。

### 7.6 Category 层级拖拽系统

`@dnd-kit` 实现 sidebar 分类拖拽重排 + 层级变更（root → child / child → root）。经历 V2.1 → V2.2 → V2.3 三轮大版本迭代，解决磁吸反馈环（D1-D5）、drop 动效悬浮感（D9-D11）、跨深度 padding 跳变（D12）。

### 7.7 Usage Statistics

后端定期解析 Claude Code 日志，注入 `usageCount` 和 `lastUsed`，支持"Most used" / "Recently used"排序。

### 7.8 Category ID 迁移

V1 用 name string 引用分类，V1 层级迁移后需迁移为 UUID。`migrate_category_id_for_skills_mcps` IPC 在 `initApp` 时检查执行，`hasCompletedCategoryIdMigration` flag 防重复，孤儿项不阻塞迁移。

## 8. 功能完成度评估

### 已成熟（多次迭代、稳定）

| 功能 | 成熟度依据 |
|---|---|
| Skills / MCPs 管理 | 核心，完整类型/Store/IPC，plugin 分层逻辑 |
| Scene + Project 部署 | 完整 CRUD + Sync/Clear + Launch |
| CLAUDE.md 中央管理 | Import / Scan / Global / 分发 / 关联 Scene 完整 |
| Trash 回收 | 三类资源全覆盖 |
| Category 层级拖拽 | V2.3 已解决多轮实测问题 |
| Finder Quick Action + `--launch` | 完整 |
| Auto Classify（手动）| 完整流程 + context overflow 优化支撑 |

### 已上线但仍在迭代

| 功能 | WIP 说明 |
|---|---|
| Skill Marketplace（skills.sh） | Phase I 已 ship（91k 真实条目）；`autoClassifyNewItems` settings gate 在 install 路径有 TODO |
| MCP Marketplace（Registry 实时镜像）| V2.0 PRD + 实现已 ship，搜索/分页/安装基础功能完整 |
| Marketplace auto-classify on install | flag gate 逻辑有 TODO，当前 install 路径直接 spawn（不查 flag），即"安装后总分类" |

### 仅有 PRD / 规划中

| 功能 | 说明 |
|---|---|
| 自动更新 Marketplace Skill | PRD V1 D-11 排除，留 V1.5 |
| `autoClassifyNewItems` 的非 Marketplace Import 触发 | setting 存在但 "NOT consumed anywhere" |
| Agent Marketplace | V1/V2 明确排除 |
| "你曾安装过此项"提示 | `importedMarketplaceSkills` 已记录但 UI 未读 |
| Skill 搜索 Category/Tags 过滤（Marketplace）| 标注 "reserved for V1.5" |

---

*主要引用*：src/App.tsx, src/types/index.ts, src/types/marketplace.ts, src/types/{trash,plugin}.ts, .dev/marketplace-prd/{03,04}_PRD_v*.md, .dev/marketplace-impl/04_implementation_log.md, .dev/auto-classify-{analysis,context-overflow/05_recommendation}.md, .dev/category-hierarchy/{00_understanding,02_design_spec}.md, src/pages/SettingsPage.tsx:237-583
