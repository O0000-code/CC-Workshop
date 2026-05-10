# H — Ensemble plugin 路径审计

> 调研维度 H（派单卡见 `01_research_plan.md` §3 H）。事实审计，不评估架构合理性、不建议改造。每条事实带文件行号引用。

---

## 0. 调研范围与事实边界

本审计回答：**当 Skill / MCP 的 `installSource === 'plugin'` 时，Ensemble 在 6 个核心动作（扫描 / 显示 / 分类 / Scene / Sync / 删除）中分别会发生什么**。这是 Marketplace 闭环设计的事实约束基线 —— 上游决策（用 plugin 体系还是自建数据源）必须与现状兼容，或显式规定差异。

事实分两类：(1) **代码路径事实**（Rust + TS 行号引用）；(2) **用户实测事实**（本机 `~/.ensemble/data.json` + `~/.claude/plugins/`）。代码事实是规则；实测事实是当前真实使用场景。

---

## 1. 六个核心问题的事实

### Q1. Ensemble 如何扫描 `~/.claude/plugins/` 中的 Skill / MCP？

**两条独立的扫描路径**，分别为不同 UI 入口服务，两者对 plugin 的"识别策略"完全不同。

**路径 A — 由 `commands/plugins.rs` 主动遍历 plugin 目录**（用于 ImportSkillsModal / ImportMcpModal 的"Plugins"分页）：

- `detect_installed_plugins`（`plugins.rs:323-387`）读 `~/.claude/plugins/installed_plugins.json`，再去 `~/.claude/plugins/cache/{marketplace}/{plugin_name}/` 找 `version_dir`，确认是否带 `skills/` 或 `.mcp.json`。
- `detect_plugin_skills`（`plugins.rs:393-536`）三层遍历：marketplace → plugin → version → `skills/<skill_name>/SKILL.md`，对每个 skill 解析 frontmatter description（`parse_skill_description` `plugins.rs:184-269`）。
- `detect_plugin_mcps`（`plugins.rs:542-691`）同样三层遍历，读取每个 plugin 的 `.mcp.json`，将其中每个 server 展开为一行候选项。
- 同步用 `installed_plugins.json` + `~/.claude/settings.json` 的 `enabledPlugins` 字段判定启用状态（`plugins.rs:113-127`）。
- 重复检测：两个层面，先 `imported_plugin_skills`/`imported_plugin_mcps`（`AppData` 字段，见 Q5）做主键级判断，再用 `~/.ensemble/mcps/*.json` 文件名做"同名已存在"二次判断（仅 MCP 路径，见 `plugins.rs:556-571, 663`）。

**路径 B — 由 `commands/skills.rs` 通过文件系统符号链接被动识别**（用于"Skills 列表"主页面常规扫描）：

- `parse_skill_file`（`skills.rs:171-246`）扫到 `~/.ensemble/skills/<name>` 时，调用 `fs::read_link` 看是不是 symlink；若是，把 real path 传给 `extract_plugin_info_from_path`（`skills.rs:122-150`），用字符串匹配 `.claude/plugins/cache/` 判定是否 plugin 来源。
- 路径格式假设：`~/.claude/plugins/cache/{marketplace}/{plugin_name}/{version}/skills/{skill_name}`（`skills.rs:131`）。匹配则填 `install_source = "plugin"`、`plugin_id = "{plugin_name}@{marketplace}"`、`marketplace`、`plugin_enabled`（查 `~/.claude/settings.json`，`skills.rs:153-169`）；不匹配（含非 symlink）一律 `install_source = "local"`（`skills.rs:213-217`）。

**MCP 不走"被动识别"**：`commands/mcps.rs` 没有路径推断，`install_source / plugin_id / plugin_name / marketplace` 全部从 `~/.ensemble/mcps/*.json` 的 `McpConfigFile` 字段直接读取（`mcps.rs:175-178`）。这是因为 MCP 是 JSON 文件而非目录 symlink —— 唯一写入这些字段的来源是 `import_plugin_mcps`（`plugins.rs:832-848`）的导入路径。

**事实结论**：plugin 标识只来自两个地方 —— Skill 通过 symlink target 是否落入 `.claude/plugins/cache/` 自动推断；MCP 通过导入时显式写入 `McpConfigFile` 字段持久化。**这两条路径互不知道对方**。

**ImportModal → 落地的具体动作**：

- Skill 走 `import_plugin_skills`（`plugins.rs:697-768`）—— 在 `~/.ensemble/skills/<skill_name>` 处 `std::os::unix::fs::symlink(plugin_cache_skill_dir, ensemble_skill_path)`（`plugins.rs:735`）。注意：源端是 plugin cache 内的 skill 目录，目标端是 ensemble skills 目录的同名 entry —— 不复制文件、不解压。
- MCP 走 `import_plugin_mcps`（`plugins.rs:774-876`）—— 解析 plugin 内 `.mcp.json`，把指定 server 的 `command/args/env/url/mcp_type` 提取到一个新的 `McpConfigFile` 实例（`plugins.rs:832-848`），写到 `~/.ensemble/mcps/<mcp_name>.json`。**字段 `install_source/plugin_id/plugin_name/marketplace` 在写入时显式填好**（`plugins.rs:844-847`），后续扫描就能识别。
- `pluginsStore` 的写入链：导入成功后调 `addImportedPluginSkills`（`pluginsStore.ts:370-378`）/ `addImportedPluginMcps`（`pluginsStore.ts:381-389`），它们在内存合并 ids 后调用 `persistImportedPluginIds`（`pluginsStore.ts:69-?`）—— 用 `safeInvoke('read_app_data')` 读完整 `data.json`、改两个字段、再 `safeInvoke('write_app_data', { data })` 整体覆盖。**关键意涵**：每次导入都触发一次完整 data.json 读写；并发不安全位点（受后端 `DATA_MUTEX` 保护，参考项目 `grep-before-enumerate-shared-resource.md` Rule）。

### Q2. `installSource: 'plugin'` 在 UI 中如何视觉区分？

事实清单（统一一处徽章 + 一处 Scope 替换 + 一处全局排序，无第四处区分）：

- **List Item 左下角徽章**：`SkillListItem.tsx:87, 171-178` 与 `McpListItem.tsx:95, 183-190` —— icon 容器右上角绝对定位 16×16 蓝点（`bg-[#3B82F6]`）+ 内嵌 `<Puzzle>` 图标。`bg-[#3B82F6]` 是当前代码库唯一一处硬编码的蓝色，并不在 `.claude/rules/design-language.md` 的色板内（design-language Rule 仅认 `--color-accent: #0063E1`）—— 这是一处现存 design 语言违例，但属现状事实。
- **Detail Panel Scope 字段被替换为只读"Plugin"徽章**：`SkillDetailPanel.tsx:586-590`、`McpDetailPanel.tsx:538`、`SkillDetailPage.tsx:450`、`McpDetailPage.tsx:361`、`SkillsPage.tsx:620`、`McpServersPage.tsx:611` 都用同一图样：`<span className="rounded bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-medium text-[#3B82F6]">Plugin</span>`。原本 Local skill 这里是 `<ScopeSelector>` 可改 user/project，plugin skill 一律不可改。
- **列表全局排序：plugin 永远沉底**：`skillsStore.ts:469-478` 与 `mcpsStore.ts:503-512` 在 `getFilteredSkills/Mcps` 末尾对 `installSource === 'plugin'` 做 boolean 排序，本地永远在上、plugin 永远在下；同源内部按名称排。这是**全局产品行为**，非用户可关。

**没有的事**：plugin 来源不会显示 `pluginName`/`marketplace` 文本（不显示在列表），不会出现"链接到 plugin 详情页"，不会以子分组形式分簇展示，不会有 hover tooltip 表明来源插件。

**前后端不对称的细节**：Detail Panel 仅前端隐藏 ScopeSelector，但**后端 `update_skill_scope`（`import.rs:771-?`）/ `update_mcp_scope`（`import.rs:878-?`）并不检查 `installSource`**，理论上前端绕过校验直接 IPC 调用即可对 plugin Skill 改 scope。这是事实陈述，不评估。

### Q3. Plugin-sourced 资源在 Auto-Classify / Scene / Sync / Delete 中的行为？

**Auto-Classify（一视同仁）**：`skillsStore.ts:319-358` 与 `mcpsStore.ts:382-414` 的 `autoClassify` 把 `get().skills` / `get().mcpServers` 整个数组传给 `auto_classify` 命令（`skillsStore.ts:339-344`）—— **没有 plugin 过滤**。结果：plugin Skill / MCP 与本地资源同样被 AI 分类，结果写回 `SkillMetadata.category_id`（持久化到 `data.json`）。即便 plugin 后续被卸载或重装，metadata 用 `id` 当 key（`id` = source_path 字符串），所以路径变了 metadata 就 orphan。

**Scene 选择（区分对待）**：`CreateSceneModal.tsx:419-436` 的 `isSkillDisabled` / `isMcpDisabled` 钩子规则 —— 当 `installSource === 'plugin'` **且** 该 plugin 在 Claude Code 的 `enabledPlugins` 表中为 `true` 时，该 Skill/MCP **在 Scene 创建/编辑模态中显示为 disabled，无法勾选**。理由（隐含）：Claude Code 已经全局启用此 plugin，再放进 Scene 等于双管齐下、行为重复。**反过来**：plugin **未**在 Claude Code 启用时，可以加入 Scene。

**Sync to Project（一视同仁，但路径重要）**：`projectsStore.ts:215-233` 取 Scene 的 `skillIds` / `mcpIds`，从全局 store 取出对应对象的 `sourcePath`（Skill）或完整 `McpServer` 对象（MCP），传给 `sync_project_config`。`sync_project_config`（`config.rs:62-106`）对每个 skill path 在项目 `.claude/skills/` 下创建符号链接 —— **不区分来源**。所以 plugin Skill 的 sourcePath 是 `~/.ensemble/skills/<name>`（symlink）；项目 `.claude/skills/<name>` 又是指向 `~/.ensemble/skills/<name>` 的 symlink；最终解析链 = 项目 → ensemble → `~/.claude/plugins/cache/...` —— 三跳 symlink。MCP 写入 `.mcp.json` 时用 `McpServer.command/args/env` 字段，不需要符号链接。

**Delete（区分对待）**：

- 后端 `delete_skill`（`skills.rs:264-310`）/ `delete_mcp`（`mcps.rs:430-477`）一律走"移到 `~/.ensemble/trash/` + 清 metadata"，不区分来源。**对 symlink 来说 `fs::rename` 移动的是 symlink 本身**，plugin cache 里的真实文件不动。
- 前端 `skillsStore.ts:120-142` / `mcpsStore.ts:114-130` 在删除时多做一步：若 `skill.pluginId` 存在，从 `pluginsStore.importedPluginSkills` 中移除 `${pluginId}|${name}` 的 importKey，并 persist 回 `data.json`。**这一步只有前端做**；后端 `delete_skill` 不读不写 `imported_plugin_skills`。
- **Trash 恢复（`commands/trash.rs`）**：`list_trashed_items`（`trash.rs:104-?`）扫 `~/.ensemble/trash/skills/` 与 `~/.ensemble/trash/mcps/`。被回收的 plugin Skill 是 symlink，恢复时 symlink 移回原位即可继续指向 plugin cache（除非该 plugin 同期被卸载 → symlink 悬空，恢复后扫描会得到 broken link）。MCP 是独立 JSON 文件，恢复后字段完整、不依赖 plugin cache 是否还在 —— 但 `command/args` 仍可能引用 plugin 安装路径，运行时才会失败。Trash 流程**不感知 plugin 来源**，恢复行为与本地一致。

### Q4. `pluginEnabled: boolean` 字段的实际含义？

字段链路：

- 来源：`~/.claude/settings.json` 的 `enabledPlugins: { "<plugin_id>": bool }`（`plugins.rs:46-54`、`skills.rs:153-169`、`mcps.rs:107-124`）。
- 流向 `Skill.pluginEnabled` / `McpServer.pluginEnabled`：在 `parse_skill_file` 与 `parse_mcp_file` 中由 `is_plugin_enabled(plugin_id)` 实时计算（`skills.rs:206-218`、`mcps.rs:148-153`），**不持久化到 `data.json`**。
- 流向前端 `pluginsStore.pluginEnabledStatus`：通过 `check_plugins_enabled` 命令（`plugins.rs:881-892`）批量查询，缓存在 store 中（`pluginsStore.ts:32-36, 105, 134, 313`）。

**与 `Skill.enabled` 的关系**：

- `Skill.enabled`（`types.rs:21`）= **Ensemble 自己的开关**，存在 `SkillMetadata.enabled`（`types.rs:223`），用户在 Ensemble UI 里 toggle。语义为"用户是否选择启用这个 Skill 在自己的 workflow 中"。
- `Skill.pluginEnabled` = **Claude Code 的开关**，由 `~/.claude/settings.json` 决定。Ensemble 不能改它。
- **真相之源不重叠**：两个字段互不影响、各自代表不同主体的意图。一个 plugin Skill 可以 `enabled: false`（Ensemble 关）+ `pluginEnabled: true`（Claude 开），反之亦然。Scene 模态中的 disable 逻辑（Q3）只看 `pluginEnabled`，不看 `Skill.enabled`。

### Q5. `importedPluginSkills` / `importedPluginMcps` 字段表示什么？

- 数据模型：`AppData.imported_plugin_skills: Vec<String>` 和 `imported_plugin_mcps: Vec<String>`（`types.rs:188-193`，`#[serde(default)]`），TS 镜像 `index.ts:325-326`。
- 元素格式：`"{plugin_id}|{item_name}"` 字符串（如 `"nanobanana-skill@claude-code-settings|nanobanana"`）—— 见 `plugins.rs:511, 661, 725, 756, 864`、`skillsStore.ts:133`、`mcpsStore.ts:126`。
- 写入：仅在用户从 ImportSkillsModal/ImportMcpModal 的 Plugins 分页**显式勾选导入**时，由 `import_plugin_skills` / `import_plugin_mcps`（`plugins.rs:697-768, 774-876`）返回新 ids，前端 `pluginsStore` 合并并 persist。
- 读取：`detect_plugin_skills`/`detect_plugin_mcps` 入参 `imported_plugin_skills`/`imported_plugin_mcps` 用于把已导入项标记为 `is_imported: true`（在 ImportModal 中显灰），见 `plugins.rs:403, 511-512, 552, 660-663`。
- 防重复机制：**两层**。第一层是 `imported_plugin_skills`/`imported_plugin_mcps` 列表精确匹配 `pluginId|itemName`；第二层（仅 MCP）是 `~/.ensemble/mcps/{name}.json` 文件存在性检查（`plugins.rs:556-571, 663-664, 825-829`）—— 防止 user 改名/手工放进同名文件后再点导入仍然写入。
- 删除时清理：见 Q3 末段 —— 前端 `skillsStore.deleteSkill` / `mcpsStore.deleteMcp` 自己负责把 importKey 从这两个列表移除。

**重要警告**：这两个列表只跟踪"通过 Plugins 分页显式导入"的资源；不跟踪 Q1 路径 B 那种"用户手工 `ln -s ~/.claude/plugins/cache/.../skills/x ~/.ensemble/skills/x` 自然形成的 plugin symlink"。后者会被 `parse_skill_file` 识别为 plugin 来源（`installSource: "plugin"`），但 `imported_plugin_skills` 里**不包含**它。

**`pluginsStore` 完整动作清单**（`pluginsStore.ts:48-64`）：

- `loadInstalledPlugins`：调 `detect_installed_plugins`，写 `installedPlugins`。
- `detectPluginSkillsForImport` / `detectPluginMcpsForImport`：传入当前 `importedPluginSkills/Mcps` 列表给后端，让 backend 标记 `is_imported`。
- `importPluginSkills` / `importPluginMcps`：调 `import_plugin_skills` / `import_plugin_mcps`，将返回 importKeys 走 `addImported*` 合并 + persist。
- `refreshPluginEnabledStatus`：调 `check_plugins_enabled`（`plugins.rs:881-892`）批量查 `~/.claude/settings.json`，写 `pluginEnabledStatus`。
- `loadImportedPluginIds`：从 `data.json` 拉取已持久化的 importedPluginSkills/Mcps，写入 store。
- `setImportedPluginSkills/Mcps`、`addImportedPluginSkills/Mcps`：双写 store + persist data.json。

**关键：`pluginEnabledStatus` 在 ImportModal、SkillsPage、McpServersPage、CreateSceneModal 入场时分别 trigger `loadInstalledPlugins`**（`SkillsPage.tsx:214-216`、`McpServersPage.tsx:186`、`CreateSceneModal.tsx:411-416`），**每次重读 `~/.claude/settings.json`**。意味着用户在终端里 `claude` 命令改了 enabledPlugins，无需重启 Ensemble，下次进相关页面就同步。但 SkillsPage 列表本身的 `Skill.pluginEnabled` 是 `parse_skill_file` 计算的，需要 reload skills（`loadSkills`）才能更新。

### Q6. 用户实际有几个 plugin 来源资源？

**当前用户实测**（`~/.ensemble/data.json` + `~/.claude/plugins/installed_plugins.json` + `~/.ensemble/skills/`）：

| 维度 | 数量 / 内容 |
|---|---|
| `~/.ensemble/skills/` 总条目 | 10 项（agent-browser, codex, docx, find-skills, frontend-design, gemini, marketing-psychology, mcp-builder, pdf, pptx 等） |
| 上述 symlink 实际指向 | 全部指向 `~/.agents/skills/<name>` —— **不是** `.claude/plugins/cache/` |
| 因此被识别为 `installSource: 'plugin'` 的 Skill | **0 条**（路径不匹配，全部归为 `local`） |
| `~/.ensemble/mcps/*.json` 总数 | 数十条（agentation/auggie/aws-docs/chrome-devtools/cnki/context7/desktop-commander/exa-search/excalidraw/figma 等） |
| 其中 `installSource: 'plugin'` 的 MCP | **0 条**（无显式导入记录） |
| `data.json.importedPluginSkills` | `[]` |
| `data.json.importedPluginMcps` | `[]` |
| `data.json.skillMetadata` | 仅 1 项（`agent-browser`） |
| `~/.claude/plugins/installed_plugins.json` 中已安装 plugin | 约 4+（nanobanana-skill, autonomous-skill, github-explorer-skill, skill-installer 等，全部 `@claude-code-settings`） |
| `~/.claude/plugins/cache/claude-plugins-official/` 内置 plugin | 12+（feature-dev, claude-md-management, linear, swift-lsp, code-review, plugin-dev, supabase, pr-review-toolkit, figma, security-guidance, commit-commands 等） |

**结论**：用户的 Claude Code 实际安装了 16+ 个 plugin（含 Anthropic 官方 marketplace），但 **0 个被显式从 ImportSkillsModal/ImportMcpModal 的 Plugins 分页导入到 Ensemble**。

**Plugin 实际分布（实测 `~/.claude/plugins/cache/`）**：

| Marketplace | 已安装 plugin（部分举例） | 含 Skills | 含 MCP |
|---|---|---|---|
| `claude-code-settings`（社区源） | nanobanana-skill, autonomous-skill, github-explorer-skill, skill-installer | 是 | 否（典型 skill plugin） |
| `claude-plugins-official`（Anthropic 官方源） | feature-dev, claude-md-management, linear, swift-lsp, code-review, plugin-dev, supabase, pr-review-toolkit, figma, security-guidance, commit-commands | 部分 | 部分（如 linear / figma 含 .mcp.json） |

`installed_plugins.json` 中每个条目的 `installPath` 字段实际指向 `~/.claude/projects/plugins/cache/...`（注意是 `projects/plugins/cache` 不是 `plugins/cache`）—— 但 `plugins.rs:355` 的扫描逻辑用 `~/.claude/plugins/cache/{marketplace}/{name}/` 寻址 version_dir，**两者不一致**。这意味着 `detect_installed_plugins` 的 `install_path` 字段（`InstalledPlugin.install_path`）可能与实际可用 path 不一致。事实陈述，不评估对错。

---

## 1.5 扫描入口对比矩阵（Q1 补充）

| 入口 | 触发时机 | 产物去向 | 是否进入 SkillsPage 主列表 | 是否产生 `installSource: 'plugin'` |
|---|---|---|---|---|
| `scan_skills`（`skills.rs`，调用方为 `loadSkills`） | App 启动 / SkillsPage mount / 用户点 Refresh / 导入完成回调 | `skillsStore.skills` | 是 | 是（路径 B：symlink target 落入 `.claude/plugins/cache/`） |
| `scan_mcps`（`mcps.rs`，调用方为 `loadMcps`） | 同上 | `mcpsStore.mcpServers` | 是（McpServersPage 主列表） | 是（来自 `McpConfigFile` 字段直读） |
| `detect_installed_plugins`（`plugins.rs:323`） | ImportSkillsModal/ImportMcpModal/SkillsPage/McpServersPage/CreateSceneModal mount 时 | `pluginsStore.installedPlugins`（仅元数据，不进 Skills/Mcps 列表） | 否 | N/A（不产生 Skill/McpServer，只产生 InstalledPlugin） |
| `detect_plugin_skills`（`plugins.rs:393`） | ImportSkillsModal 打开 + 点击"Plugins"分页时 | `pluginsStore.detectedPluginSkills`（仅作模态候选项） | 否 | N/A（产生 DetectedPluginSkill，需走 import 才落地） |
| `detect_plugin_mcps`（`plugins.rs:542`） | ImportMcpModal 打开 + 点击"Plugins"分页时 | `pluginsStore.detectedPluginMcps` | 否 | N/A |
| `check_plugins_enabled`（`plugins.rs:881`） | `refreshPluginEnabledStatus` 调用时（同上 mount 路径） | `pluginsStore.pluginEnabledStatus`（HashMap 缓存） | 否 | N/A（仅刷新 enabled 状态，不产生新条目） |

**含义**：用户**在 Skills 主列表中看到一个 plugin Skill** 必须先经过 ImportModal Plugins 分页 → import_plugin_skills 创建 ensemble symlink → scan_skills 重扫 → symlink target 含 `.claude/plugins/cache/` → 标记为 plugin。中间任何一步缺失（如手动用 `claude plugin install` 后不来 Ensemble 导入），SkillsPage 主列表里**根本看不到那个 plugin Skill**。这正是 Q6 实测中 16+ plugin / 0 imported 的成因。

---

## 2. Plugin-sourced 资源在 Ensemble 各功能中的当前行为表

| 动作 | 行为 | 与本地资源差异 | 代码引用 |
|---|---|---|---|
| **扫描（路径 A — 主动）** | `commands/plugins.rs` 三层遍历 `~/.claude/plugins/cache/{marketplace}/{plugin}/{version}/`，按目录结构展开 skills 与 `.mcp.json` 内 servers | 不进入主列表；只为 ImportModal 提供候选 | `plugins.rs:323-387, 393-536, 542-691` |
| **扫描（路径 B — 被动）** | `commands/skills.rs` 扫 `~/.ensemble/skills/`，对每个 symlink 读取 target，若含 `.claude/plugins/cache/` 子串则识别为 plugin | 与本地 symlink 走同一扫描入口；只是元数据字段不同 | `skills.rs:122-150, 205-218` |
| **显示（List Item）** | icon 右上角加 `#3B82F6` Puzzle 徽章 | 本地无徽章；硬编码颜色不在 design-language token 内 | `SkillListItem.tsx:87, 171-178`、`McpListItem.tsx:95, 183-190` |
| **显示（Detail Panel）** | Scope 字段渲染为不可改的 "Plugin" 徽章 | 本地为可改的 `<ScopeSelector>` | `SkillDetailPanel.tsx:586-590`、`McpDetailPanel.tsx:538`、`SkillsPage.tsx:620`、`McpServersPage.tsx:611` |
| **显示（列表排序）** | 全局沉底，本地优先 | 用户无法关闭此排序 | `skillsStore.ts:469-478`、`mcpsStore.ts:503-512` |
| **分类（Auto-Classify）** | 与本地一同被 AI 分类，结果写回 `SkillMetadata.category_id` | 无差别 | `skillsStore.ts:319-358`、`mcpsStore.ts:382-414` |
| **Scene（创建/编辑）** | 当 `pluginEnabled === true` 时在模态内 disabled，不可勾选；`pluginEnabled === false` 时与本地等同 | 本地无此条件 | `CreateSceneModal.tsx:419-436` |
| **Sync to Project** | 与本地同样以 `sourcePath` 创建 symlink；最终解析为三跳链：项目 → `~/.ensemble/` → `~/.claude/plugins/cache/...` | 无差别（路径长度不同但行为相同） | `projectsStore.ts:215-233`、`config.rs:62-106` |
| **Delete（前端）** | 多做一步：若有 `pluginId` 则把 `${pluginId}\|${name}` 从 `importedPluginSkills`/`importedPluginMcps` 移除并 persist | 本地无此清理 | `skillsStore.ts:120-142`、`mcpsStore.ts:114-130` |
| **Delete（后端）** | 一律 `fs::rename` 移到 `~/.ensemble/trash/`；对 symlink 移动的是链接本身，cache 不动 | 无差别 | `skills.rs:264-310`、`mcps.rs:430-477` |
| **重复检测（导入时）** | 两层：`importedPluginSkills` 精确 importKey 匹配；MCP 多查 `~/.ensemble/mcps/{name}.json` 是否同名存在 | 本地从未"导入"概念 | `plugins.rs:511-512, 556-571, 660-664, 825-829` |
| **`pluginEnabled` 计算** | 实时读 `~/.claude/settings.json` 的 `enabledPlugins` 表；不持久化 | 本地恒为 `None` | `skills.rs:153-169`、`mcps.rs:107-124`、`plugins.rs:113-127` |

---

## 3. 对 Marketplace 闭环设计的事实约束

> 本节列出 **必须满足** 或 **必须显式权衡** 的事实约束。每条约束源自上述 Q1-Q6 的代码事实，下游 PRD 闭环设计若与下列条款冲突，必须显式说明并由用户决策。

1. **"Marketplace 安装"必须在 Ensemble 已有的安装路径上落地**：当前代码识别 plugin 来源的两条路径分别是 `(A) ImportModal 显式导入` 与 `(B) symlink target 落入 `.claude/plugins/cache/` 自动推断`。**Marketplace 的"安装"动作必须明确属于其中一种路径**；若引入第三种识别口（如 `installSource: 'marketplace'`），需新增字段并改造扫描代码 —— 不属事实但属约束传递。

2. **同名资源去重逻辑已存在但只覆盖一半**：MCP 路径有 `~/.ensemble/mcps/{name}.json` 文件级冲突检测（`plugins.rs:556-571, 825-829`），Skill 路径只有 importKey 列表级精确匹配，**没有目录级冲突检测**。Marketplace 安装 Skill 若与本地同名 Skill 重名，按现状会因 `dest_skill_path.exists()` 短路（`plugins.rs:722-730`）—— 但这条短路把"已存在"误算作"已导入"。这是去重盲区，PRD 必须定义 Skill 同名碰撞的产品行为。

3. **Plugin-sourced 资源被列表全局沉底**（`skillsStore.ts:471-477`、`mcpsStore.ts:505-511`）：用户原话"风格完全一致"意味着 Marketplace-installed 资源若也带 `installSource` 非 `local`，将自动沉底 —— 与 SkillsPage 列表的视觉权重发生冲突。PRD 必须显式规定 Marketplace-installed 资源是否**也**沉底、是否需要一个新的"已安装但仍是平等公民"语义。

4. **Scene 模态对 plugin 资源的 disable 逻辑依赖 `pluginEnabled`**（`CreateSceneModal.tsx:419-436`），而 `pluginEnabled` **由 Claude Code 的 `~/.claude/settings.json` 单向决定**，Ensemble 不能改。如果 Marketplace 资源也走 plugin 路径（即装到 `~/.claude/plugins/`），它会立刻继承"Claude 启用 → Ensemble 不可入 Scene"的行为；如果 Marketplace 资源装到 `~/.ensemble/` 不走 plugin，则 Scene 行为反而正常。**这是数据源策略 D-3（决策表）的硬约束**：选 plugin 路径 = 默认无法加入 Scene；选 ensemble 路径 = Scene 行为如本地。

5. **`installSource` 是二值枚举（`'local' | 'plugin'`）**：见 `types/index.ts:32, 70`、`types.rs:34, 81, 347`。引入 Marketplace 必然产生第三种来源（"marketplace 直装、非 plugin"）。PRD 必须决定：(a) 复用 `'plugin'`（把 plugin 体系当 Marketplace 容器）；(b) 扩展为 `'local' | 'plugin' | 'marketplace'`（含数据模型、UI 条件分支、`pluginEnabled` 语义改造）；(c) 其他。这是 D-3 / D-9 决策的核心字段含义。

6. **`pluginEnabled` 字段不持久化、每次启动实时读 `settings.json`**：意味着 Ensemble 启动后状态**总是与 Claude Code 当下设置同步**。Marketplace 若复用 plugin 路径，"Ensemble 内启用"必然意味着"修改 `~/.claude/settings.json.enabledPlugins`"—— 这是跨 App 边界写操作，下游须显式决策由谁负责（Ensemble 写 / 走 Claude CLI / 仅展示不改）。

7. **`Skill` / `McpServer` 的 `id` 是 `source_path` 字符串**（`skills.rs:187`、`mcps.rs:134`），`SkillMetadata` HashMap 用 id 做 key（`types.rs:182-183`）：意味着 Marketplace 资源若改名 / 升级 / 在 cache 里换 version_dir，**所有 metadata（category, tags, enabled, usage_count, icon）都会成为孤儿**（path 变 = id 变）。下游 PRD 须定义"升级 Marketplace 安装的资源时 metadata 如何 follow"。这是数据完整性硬约束。

8. **当前用户**有 16+ 个 Claude Code plugin 已安装但 **0 个**被显式 import 到 Ensemble（见 Q6）：说明现存 Plugins 导入分页对用户**没有触发使用**，PRD 设计 Marketplace 入口时必须诊断"为什么用户没用 ImportModal 的 Plugins 分页"，避免 Marketplace 入口重蹈覆辙（候选解释：发现路径深、价值不明、"已经在 Claude 里启用为什么还要再导入一次到 Ensemble"心智重复）—— 但这只是猜测，事实只是"用户实际未使用"。

---

## 4. 代码引用索引（按文件）

为下游 Synthesis / PRD 撰写者快速回查：

| 文件 | 关键行号 | 涉及功能 |
|---|---|---|
| `src-tauri/src/commands/plugins.rs` | 113-127, 184-269, 323-387, 393-536, 542-691, 697-768, 774-876, 881-892 | plugin 主动扫描、ImportModal 候选生成、import 落地、`enabledPlugins` 读取 |
| `src-tauri/src/commands/skills.rs` | 122-150, 153-169, 171-246, 264-310 | symlink 被动识别 plugin 来源、`pluginEnabled` 实时计算、delete 走 trash |
| `src-tauri/src/commands/mcps.rs` | 107-124, 126-183, 430-477 | `pluginEnabled` 实时计算、`McpConfigFile` 字段直读、delete 走 trash |
| `src-tauri/src/commands/import.rs` | 771-?, 858-?, 878-?, 947-? | `update_skill_scope` / `update_mcp_scope` —— 不检查 `installSource` |
| `src-tauri/src/commands/config.rs` | 62-106, 108-? | `sync_project_config` —— plugin/local 一视同仁创建 symlink |
| `src-tauri/src/commands/trash.rs` | 104-?, 158-? | trash list & restore —— 不感知 plugin 来源 |
| `src-tauri/src/types.rs` | 21-43, 47-90, 175-210, 327-354, 540-636 | `Skill.installSource/pluginId/pluginName/marketplace/pluginEnabled`、`McpServer` 镜像、`AppData.imported_plugin_skills/mcps`、`McpConfigFile` plugin 字段、`InstalledPlugin/DetectedPluginSkill/DetectedPluginMcp/PluginImportItem` |
| `src/types/index.ts` | 32-37, 70-75, 325-326 | TS 镜像 |
| `src/types/plugin.ts` | 1-59 | Detected/Installed/Import 类型 |
| `src/components/skills/SkillListItem.tsx` | 87, 171-178 | 蓝色 Puzzle 徽章 |
| `src/components/mcps/McpListItem.tsx` | 95, 183-190 | 同上 |
| `src/components/skills/SkillDetailPanel.tsx` | 586-590 | "Plugin" 徽章替代 ScopeSelector |
| `src/components/mcps/McpDetailPanel.tsx` | 538 | 同上 |
| `src/components/scenes/CreateSceneModal.tsx` | 358, 419-436 | 依赖 `pluginEnabledStatus` 决定 disable 状态 |
| `src/components/modals/ImportSkillsModal.tsx` | 90-180, 460-475 | "Plugins" 分页选中、提交、导入回调 |
| `src/components/modals/ImportMcpModal.tsx` | 100-190, 480-495 | 同上 |
| `src/stores/skillsStore.ts` | 120-142, 319-358, 469-478 | delete 时清 importedPluginSkills、autoClassify 不过滤、列表沉底排序 |
| `src/stores/mcpsStore.ts` | 114-130, 382-414, 503-512 | 同上 |
| `src/stores/pluginsStore.ts` | 1-64, 69-?, 105, 134, 234, 275, 302-313, 325, 354, 364, 370-389 | 全部 plugin 状态管理 |
| `src/stores/projectsStore.ts` | 195-244 | sync 不区分 plugin |
| `src/pages/SkillsPage.tsx` | 188, 214-216, 280-296, 620 | autoClassify trigger、loadInstalledPlugins on mount、Detail Panel 入口 |
| `src/pages/McpServersPage.tsx` | 186, 611 | 同上 |
| `~/.ensemble/data.json`（运行时） | `importedPluginSkills/Mcps`、`skillMetadata/mcpMetadata` | 持久化层 |
| `~/.claude/plugins/installed_plugins.json` | 整个文件 | Claude Code 拥有的 plugin 清单 |
| `~/.claude/settings.json` | `enabledPlugins` 字段 | Claude Code 启用状态权威源 |

---

## 5. 关键 schema 参考

下游 Synthesis / PRD 撰写者在讨论"是否扩展数据模型"时所需的现状字段全集（仅与 plugin 来源相关字段，省略其他）：

```
Skill / McpServer (runtime, 由 scan_skills/scan_mcps 构建):
  installSource?: 'local' | 'plugin'    // 二值，运行时决定
  pluginId?: string                      // 形如 "name@marketplace"
  pluginName?: string                    // plugin display name
  marketplace?: string                   // 单纯 marketplace 名
  pluginEnabled?: boolean                // 实时读 settings.json，未持久化

McpConfigFile (持久化在 ~/.ensemble/mcps/<n>.json):
  installSource?: 'local' | 'plugin'    // 同上但持久化
  pluginId/pluginName/marketplace?       // 同上但持久化
  // 注意：McpConfigFile 没有 pluginEnabled (它是计算属性)

AppData (持久化在 ~/.ensemble/data.json):
  importedPluginSkills: string[]         // ["pluginId|skillName", ...]
  importedPluginMcps: string[]           // ["pluginId|mcpName", ...]
  // 注意：AppData 不持久化 installSource —— 那是运行时由 source_path 推断

InstalledPlugin (运行时, 来自 detect_installed_plugins):
  id: string                             // "name@marketplace"
  name: string
  marketplace: string
  version: string
  enabled: boolean
  installPath: string
  hasSkills: boolean
  hasMcp: boolean
  // 注意：InstalledPlugin 不进入 Skills/Mcps 列表

DetectedPluginSkill / DetectedPluginMcp (运行时, ImportModal 候选):
  pluginId, pluginName, marketplace, skillName/mcpName, description, path, version
  isImported: boolean                    // 由后端检查 importedPluginSkills/Mcps + 文件存在
```

**Marketplace 引入新增的"潜在第三态"将影响：**

- `installSource` 枚举（目前 binary）
- `pluginEnabled` 语义在非 plugin 情况下的取值
- `imported_plugin_skills/mcps` 列表是否覆盖 marketplace
- ImportSkillsModal/ImportMcpModal 的"Plugins"分页是否需要扩展为更通用的"Sources"分页
- SkillListItem/McpListItem 的徽章是否要支持多种 source 视觉

这些是事实意义上"Marketplace 必然触碰"的字段；具体如何改属下游决策，不在本审计范围。

---

## 6. 审计完成自检

- [x] 6 个核心问题每个都有代码行号引用（Q1: 14+ 处；Q2: 8 处；Q3: 12 处；Q4: 6 处；Q5: 9 处；Q6: 4 个数据点 + marketplace 分布）
- [x] 表格至少覆盖：扫描 / 显示 / 分类 / Scene / Sync / 删除 6 个动作（实际覆盖 11 行 + 扫描入口对比矩阵 6 行）
- [x] "对 Marketplace 闭环设计的事实约束"清单 ≥ 3 条（实际 8 条）
- [x] 总行数在 250-500（最终约 290+ 行；密度合宜）
- [x] 没有架构合理性评论；没有改造方案；没有"应该如何"的口径
- [x] 包含代码引用索引（§4），便于下游 Synthesis / PRD 撰写者快速回查
- [x] 包含 schema 参考（§5），便于讨论数据模型时不需重新查代码

**调研产物结束。**
