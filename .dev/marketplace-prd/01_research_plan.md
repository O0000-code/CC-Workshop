# Marketplace PRD — 本轮专属执行规划（01）

> **本文档是本轮所有 SubAgent 的派单工单蓝本。** 由规划 SubAgent 撰写，主 Agent 审定。所有调研 / 综合 / 撰写 / 评审 SubAgent 必须按本文档发布。**任何对本文档的偏离必须由主 Agent 显式批准。**

---

## Revision History (V1.0 → V1.1) — 断点 1 用户对齐结果（2026-05-09）

主 Agent 在大规模调研启动前执行 §9.1 断点 1 与用户对齐。**用户决策**（不可被下游任何 SubAgent 推翻）：

- **【V1 范围决策】Agent Marketplace 不纳入 V1。** V1 范围 = Skill Marketplace + MCP Marketplace 两个子项；CLAUDE.md 没有 marketplace（用户原话明确）；Agent Marketplace 延后到 V1.5 / V2。
- 理由（用户认可）：Ensemble 当前完全不管理 Subagent；强行 V1 引入 Agent 等于一次性新增"Marketplace 入口 + Agent 管理 + Agent 安装闭环"三层概念，违反商减；Skill+MCP 已有列表页可复用，闭环最快建立。

### Cascade footprint（本次决策影响下列章节，须按下游 SubAgent 启动顺序传播）

| 受影响章节 | 影响 | 已就地修订 |
|---|---|---|
| §2.3 调研矩阵 | D 调研降级：从"为 V1 选源"变为"为 V1.5/V2 路线图留方向" | ✅ 见下文 §3 D 卡更新 |
| §3 D 派单卡 | 范围收窄、行数下调、产出重点改为"延后理由证据 + 路线图候选源初评" | ✅ 已 Edit |
| §4.2 决策登记必须覆盖 | D-2 / D-6 已被本决策提前锁定；Synthesis 不再纠结这两条 | ✅ 见 §4.2 末尾标注 |
| §5 PRD 撰写卡 | "必答问题"增加：在 §10 Risks & Open Questions 中明确写入"Agent Marketplace V1.5/V2 路线图占位" | ✅ 见 §5 末尾 |
| §6 评审卡 | Reviewer 4（商减/范围）必须额外确认 V1 没有"偷偷"为 Agent 留埋点（如 sidebar Agent 入口、数据字段、组件名） | ✅ 见 §6.4 末尾 |

### 此后 SubAgent 必读约束

**所有调研 / 综合 / PRD / 评审 / 修订 / 对齐审计 SubAgent 在阅读本文件时必须读到本 Revision History 块。** 把它当作 Decisional 文档的一部分；任何把 Agent Marketplace 重新放回 V1 范围的产物视为违反约束，立即返工。

---

## 0. 文档权威排名（document-authority-ranking）

任何 SubAgent 在阅读多个文档时遇到冲突，按以下规则解决：**跨级冲突自动取高级别；同级冲突上报主 Agent 提为 Open Question**。

| Level | Document | Last Modified | Purpose |
|---|---|---|---|
| Decisional | `~/.claude/CLAUDE.md` + `~/.claude/rules/*.md` | 主 Agent 全局宪法 | 工作方式与文档纪律 |
| Decisional | `.claude/rules/design-language.md` | 项目级 | 视觉与动效语言；PRD 描述风格时只能引用，不可自创 |
| Decisional | `.claude/rules/plan-document-style.md` | 项目级 | 行数硬约束、商减原则 |
| Decisional | `00_understanding.md`（本任务） | 2026-05-09 | 用户原话校正 + 项目事实基线 + 范围边界 |
| Decisional | `01_research_plan.md`（本文件） | 2026-05-09 | SubAgent 派单蓝本 |
| Referential | `01_research/A-G_*.md`（待产出） | — | 调研产物，PRD 的事实输入 |
| Referential | `02_synthesis_decisions.md` + `02_risk_distillation.md`（待产出） | — | Synthesis Gate 双产物，PRD 的决策输入 |
| Historical | 用户原话（`00_understanding.md` §1） | — | 不可被任何 Decisional 推翻；始终是真相起点 |

---

## 1. 任务分级与方法

**任务分级**：**Creative** 级。理由——首次为 Ensemble 引入 Marketplace 能力，无可直接复用的产品先例；产出（PRD V1）将作为下游 spec / tech plan / impl plan 的源头，复用价值极高；多个独立设计决策（数据源选择、闭环路径、UX 模式、范围控制）需要并行调研后才能定。

**因此走完整管道**：理解 → 多专家并行调研 → Synthesis Gate（双产物）→ PRD V1 → 多角度并行评审 → V2 修订 → 最终对齐审计。

**但应用商减**：调研不为"完整性"过度展开；Synthesis Gate 立刻收敛决策；PRD 自身行数严格守 800-1200，硬上限 1500（参考 `plan-document-style.md`）；评审 SubAgent 数量限制为 4（足以覆盖角度，更多即重复）。

---

## 2. 调研维度评估与设计

### 2.1 对 `00_understanding.md` §6 的 7 维度的评估

| 维度 | 是否保留 | 调整 |
|---|---|---|
| A 当前应用 | 保留 | 必须最先完成（其他维度依赖它的"可复用组件清单"和"现有路径事实"） |
| B Skill 数据源 | 保留 | 与 G 并行；G 的产出会反过来影响 B 的策略选择 |
| C MCP 数据源 | 保留 | 与 B 完全并行 |
| D Agent 数据源 | 保留 | 与 B/C 并行；范围明确收窄至 Claude Code Subagent |
| E 同类参考 | 保留 | 与 B/C/D 并行；专注 marketplace 集成 UX 模式（不分析功能，只分析产品形态） |
| F 用户旅程 | **移到 Synthesis 之后** | 用户旅程必须基于"已选定的数据源 + 已选定的策略"才能写实；放在调研期是空想 |
| G Claude Code Plugin 机制 | **提级为最早调研之一** | G 的产出决定 B/C/D 的策略空间（是否复用 plugin 体系、是否爬纯资源） |

### 2.2 维度合并 / 拆分

- 不合并 B/C/D：三类资源的权威源 / 数据结构 / 安装方式差异显著，合并会丢失颗粒度。
- 不拆分 E：marketplace UX 模式在不同产品里高度同构，一个 SubAgent 跨产品横向对比比拆三个 SubAgent 各看一个产品更高效。
- 新增**调研 H：现有 plugin 安装路径深度审计**（独立于 G）：G 看 Claude Code 的 plugin 机制本身，H 看 Ensemble 现有 `commands/plugins.rs` 是怎么对接的、安装路径在哪、`installSource: 'plugin'` 的 Skill / MCP 在 UI 中是怎么展现的。这是闭环设计的事实依据。

### 2.3 最终调研矩阵

| 编号 | 维度 | 并行性 | 模型 | 行数预算 |
|---|---|---|---|---|
| A | 当前应用全景 | 串行（最先） | Opus 4.7 | 400-700 |
| G | Claude Code Plugin 机制 | 与 A 并行 | Opus 4.7 | 300-600 |
| H | Ensemble plugin 路径审计 | 与 A 并行 | Opus 4.7 | 250-500 |
| B | Skill 数据源 | A+G+H 完成后并行 | Opus 4.7 | 400-700 |
| C | MCP 数据源 | A+G+H 完成后并行 | Opus 4.7 | 400-700 |
| D | Agent 数据源 | A+G+H 完成后并行 | Opus 4.7 | 300-500 |
| E | 同类产品参考 | 与 B/C/D 并行 | Opus 4.7 | 400-700 |

**用户旅程 F 不作为调研维度**，由 PRD 撰写 SubAgent 在拥有 Synthesis 双产物后撰写。

---

## 3. 调研 SubAgent 派单卡

### 通用约束（每张卡都默认遵守）

- 模型：Opus 4.7（除非显式指定）
- Skill 加载：使用任何 Skill 前必须先 `Skill` 工具加载
- Web 工具优先级：MCP（Tavily / EXA / Linkup / FireCrawl）优先于内置 WebSearch / WebFetch；按 `~/.claude/rules/mcp-search-strategy.md` 默认最高深度
- 写文件：写入指定路径；不返回长文 Response（只返 ≤200 字总结）
- 不写技术实现细节（Rust struct、IPC 命令名、TypeScript 接口）— 全部留给 PRD 之后的 spec / tech plan 阶段
- 共同必读上下文（每张卡都必须 Read 完）：
  1. `.dev/marketplace-prd/00_understanding.md`
  2. `.dev/marketplace-prd/01_research_plan.md`（本文件）
  3. `.claude/rules/plan-document-style.md`（控制行数）

### A — 当前应用全景

- **产物**：`.dev/marketplace-prd/01_research/A_current_app_landscape.md`，400-700 行
- **核心问题**：
  1. SkillsPage / McpServersPage / ScenesPage 的页面结构（Header / List / Detail / Modal）有哪些可复用骨架？
  2. `ListDetailLayout` / `PageHeader` / `SlidePanel` / `EmptyState` / `SearchInput` 的实际 props 与使用模式？哪些直接可复用于 Marketplace 页面？
  3. `SkillListItem` / `McpListItem` 的视觉密度、字号、间距、icon 处理？Marketplace List Item 应"完全沿用还是局部变体"？
  4. 现有"安装/导入"路径的事实：`ImportSkillsModal` / `ImportMcpModal` 怎么走的？进度反馈、错误处理、撤销机制？
  5. `~/.ensemble/` 目录下的实际安装路径（`skills/` / `mcps/` / `claude-md/`）？文件结构？哪些可作为 Marketplace 安装目标？
  6. `Auto-Classify` 流程：用户安装一个新 Skill 后，AI 自动分类是怎么触发、什么时候触发的？
  7. `installSource: 'plugin'` 的 Skill / MCP 在现有 UI 中如何被标识与展示？
  8. 哪些现有交互（双击编辑、右键菜单、拖拽、SlidePanel 出场动效）必须在 Marketplace 中保持一致？
- **必读上下文清单**（除通用项外）：
  - `src/components/layout/{Sidebar.tsx, MainLayout.tsx, ListDetailLayout.tsx, PageHeader.tsx, SlidePanel.tsx}`
  - `src/components/skills/SkillListItem.tsx`、`src/components/mcps/McpListItem.tsx`
  - `src/components/modals/{ImportSkillsModal.tsx, ImportMcpModal.tsx}`
  - `src/pages/{SkillsPage.tsx, McpServersPage.tsx, ScenesPage.tsx}`（各读前 200 行了解模式）
  - `src/types/index.ts`（已有 marketplace 字段事实）
  - `src/index.css`（design tokens）
  - 项目 `CLAUDE.md`
- **产出格式骨架**：H2 = 7 个核心问题 / 各 H3 子节回答 / 末尾"可复用资产清单（表格）" / "新概念真正需要新建的清单（≤5 项，需充分理由）"
- **不做**：不写 PRD 内容；不预设 Marketplace 应该长什么样；不评论现有架构好坏
- **质量自检**：
  - [ ] 7 个核心问题每个都有具体回答 + 文件行号引用
  - [ ] "可复用资产清单"覆盖 Layout / List / Detail / Modal / Common 五类
  - [ ] "需要新建"清单 ≤ 5 项，每项有理由（"现有的不够用，因为 X"）
  - [ ] 总行数在 400-700 范围
  - [ ] 没有任何 Rust struct / IPC 命令名 / TS 接口建议

### G — Claude Code Plugin 机制

- **产物**：`.dev/marketplace-prd/01_research/G_claude_plugin_mechanism.md`，300-600 行
- **核心问题**：
  1. `claude plugin marketplace add <git-url>` 的实际机制：marketplace 是什么形式（git repo？json index？）？
  2. `claude plugin install` 的下载、解压、安装流程在哪儿落地（`~/.claude/plugins/`）？
  3. plugin 内部结构：`.claude-plugin/marketplace.json` / `plugin.json` 的字段？支持哪些资源类型（skills、mcps、commands、subagents）？
  4. 是否存在已知的"权威 Anthropic 官方 marketplace"？还是只有社区自建的 marketplace git repo？
  5. plugin 形式 vs "纯 markdown skill"（如 skills.sh 的资源）能否互通？非 plugin 的资源能否通过 plugin 机制安装？
  6. Ensemble 是否有可能"在 GUI 中调用 `claude plugin install`"（CLI 调用 vs 自行实现下载逻辑的优劣）？
  7. plugin 安装后是否需要"启用"步骤？是否有 `enabled: false` 状态？
  8. Anthropic 是否有官方 marketplace 列表 / discovery 入口？
- **必读上下文清单**（除通用项外）：
  - `~/.claude/plugins/` 实际目录（如存在）— 用 Bash `ls`/`find` 探查
  - `src-tauri/src/commands/plugins.rs`（Ensemble 现有 plugin 处理代码）
  - 通过 MCP 工具搜索：Anthropic 官方文档关于 plugin marketplace 的章节、`claude plugin --help` 输出、社区已知的 marketplace git repo 示例
- **产出格式骨架**：H2 = 8 个核心问题 / H3 各项 + 引用证据（文档链接 / repo 链接 / 实际 ls 输出）/ 末尾"对 Marketplace 数据源策略的影响"小节（不超过 30 行，不下定论，列出对 B/C/D 调研的影响）
- **不做**：不下"应该用 plugin / 不应该用 plugin"的最终决策（这是 Synthesis 阶段的事）；不规划 Ensemble 怎么实现
- **质量自检**：
  - [ ] 每个事实都有引用源（文档链接 / 实际命令输出 / repo URL）
  - [ ] 第 5 题"plugin vs 纯资源能否互通"有明确答复
  - [ ] 末尾"对 B/C/D 调研的影响"列出可能的策略空间
  - [ ] 总行数在 300-600 范围

### H — Ensemble plugin 路径审计

- **产物**：`.dev/marketplace-prd/01_research/H_ensemble_plugin_audit.md`，250-500 行
- **核心问题**：
  1. Ensemble 现在如何扫描 `~/.claude/plugins/` 中的 Skill / MCP？文件路径模式？字段提取？
  2. `installSource: 'plugin'` 的 Skill 在 SkillsPage 中如何视觉区分？是否有"来源 badge"、链接到 plugin 名？
  3. Plugin-sourced Skill / MCP 是否能被 Auto-Classify？是否能加入 Scene？是否能 sync 到 Project？是否能删除？任何特殊处理？
  4. `pluginEnabled: boolean` 字段实际含义？与 Ensemble `Skill.enabled` 的关系？谁是真相之源？
  5. 现有 `data.json` 字段 `importedPluginSkills` / `importedPluginMcps` 表示什么？防重复机制？
  6. 现有 Ensemble 中 plugin 来源的 Skill / MCP 数量级（用户实际有几个）？
- **必读上下文清单**（除通用项外）：
  - `src-tauri/src/commands/plugins.rs`（完整读）
  - `src-tauri/src/types.rs`（搜 `plugin` / `marketplace` 字段）
  - `src/types/index.ts`、`src/types/plugin.ts`
  - `src/components/skills/SkillListItem.tsx`、`src/components/mcps/McpListItem.tsx`（看 plugin 来源标识渲染）
  - `~/.ensemble/data.json` 实际内容（用 `cat` 读）
  - 项目 `CLAUDE.md` 中关于"插件支持"的章节
- **产出格式骨架**：H2 = 6 个核心问题 / 表格"Plugin-sourced 资源在 Ensemble 各功能中的当前行为" / 末尾"对 Marketplace 闭环设计的事实约束"
- **不做**：不评估架构合理性；不建议改造
- **质量自检**：
  - [ ] 6 个问题每个都有代码行号引用
  - [ ] 表格至少覆盖：扫描 / 显示 / 分类 / Scene / Sync / 删除 6 个动作
  - [ ] "对 Marketplace 闭环设计的事实约束"清单 ≥ 3 条
  - [ ] 总行数在 250-500 范围

### B — Skill Marketplace 数据源调研

- **前置依赖**：A、G、H 完成
- **产物**：`.dev/marketplace-prd/01_research/B_skill_data_source.md`，400-700 行
- **核心问题**：
  1. skills.sh 是什么？维护者？数据结构（GitHub repo？API endpoint？前端聚合页？）？更新频率？覆盖广度？是否官方背书？
  2. 是否有 Anthropic 官方 Skill 目录 / 索引？相对 skills.sh 的权威差异？
  3. 除了 skills.sh，还有哪些社区 Skill 聚合源（awesome-claude-skills 类 GitHub 列表）？覆盖差异？
  4. 这些数据源的"安装单元"是什么？一个 git repo？一个 markdown 文件？一个 plugin？这影响 Ensemble 怎么"装到本地管理路径"。
  5. 数据源是否提供：作者 / 描述 / 截图 / 版本 / 依赖 / 评分 / 下载量 / 上次更新等元数据？
  6. 数据源的内容是否包含"非 plugin 形式的纯 markdown skill"？怎么和 G 调研出的 plugin 机制对接（或不对接）？
  7. 数据源的稳定性（是否会消失、被收购、改 API）？是否有备选源做容错？
  8. 用户原话"不打算自己建设映射表"在数据源层面的真正含义：是否完全不缓存？还是允许 Ensemble 缓存上游数据但不维护自己的目录？
- **必读上下文清单**（除通用项外）：
  - 调研产物 A、G、H 的对应文件
  - 用 MCP 工具（FireCrawl、Tavily、EXA）抓取 skills.sh 实际页面与数据结构、查询其他社区 skill 列表
- **产出格式骨架**：H2 = 8 个核心问题 / H3 各候选源对比表（权威性 / API 稳定性 / 元数据完整度 / 安装单元类型 / 覆盖广度 5 列）/ 末尾"推荐主源 + 备选源"小节（带理由，但不下最终决策；最终决策在 Synthesis）
- **不做**：不写 Ensemble 怎么实现爬取；不评估爬虫法律风险（Synthesis 阶段如需再补）
- **质量自检**：
  - [ ] 至少调研 3 个候选源
  - [ ] 候选源对比表 5 列齐全
  - [ ] 第 4、6、8 题（这三题是闭环设计的关键）回答清晰、不模糊
  - [ ] 总行数在 400-700 范围

### C — MCP Marketplace 数据源调研

- **前置依赖**：A、G、H 完成
- **产物**：`.dev/marketplace-prd/01_research/C_mcp_data_source.md`，400-700 行
- **核心问题**：
  1. 已知的 MCP 聚合源候选：MCP 官方 registry（Anthropic / modelcontextprotocol.io）？Smithery？Glama？mcp.so？awesome-mcp-servers？
  2. 各源的权威性、覆盖广度、API 稳定性、元数据完整度对比
  3. MCP 的"安装单元"差异（stdio MCP vs HTTP MCP）：源是否区分？Ensemble 现有 `McpServer` 模型已支持两类，安装路径需要区分吗？
  4. 各源是否提供：作者 / 描述 / 命令模板 / args 参数说明 / env 变量需求 / 依赖（如需要 Node / Python 运行时）？
  5. 安装一个 MCP 在 Ensemble 中的实际含义：是把 `command + args` 写入 `~/.claude.json` 还是 `~/.ensemble/mcps/*.json`？数据源调研要回答"安装动作的内容是什么"。
  6. HTTP MCP（如 Sentry、Linear）和 stdio MCP（如 puppeteer）在 marketplace 中是否区分？用户对二者的安装心智模型差异？
  7. 是否存在 MCP 的"试用"机制（不真正安装到 Claude Code、只在 Ensemble 内试调用）？
  8. 与 B 一样的数据源稳定性 / 备选源问题
- **必读上下文清单**（除通用项外）：
  - 调研产物 A、G、H
  - `src-tauri/src/types.rs:McpServer / ClaudeMcpConfig` 字段
  - `~/.claude.json` 实际内容（看现有 MCP 是怎么写的）
  - 用 MCP 工具调研各候选源
- **产出格式骨架**：H2 = 8 个核心问题 / 候选源对比表 / 末尾"推荐主源 + 备选 + stdio/HTTP 处理建议"
- **不做**：不写 Rust 代码；不规划 IPC 命令
- **质量自检**：
  - [ ] 至少调研 4 个候选源（MCP 生态比 Skill 成熟，源更多）
  - [ ] 第 5、6 题（安装动作的产品定义）回答明确
  - [ ] 总行数在 400-700 范围

### D — Agent (Subagent) Marketplace 数据源调研【V1.1 已降级 — 仅为 V1.5/V2 路线图收集证据】

> **范围已被断点 1 用户对齐锁定**：Agent Marketplace **不在 V1 范围**。本调研降级为"为 V1.5/V2 留路线图证据"，行数预算从 300-500 → **150-300**，调研深度浅出即可。

- **前置依赖**：A、G、H 完成
- **范围收敛**：用户语境下的 "Agent" = **Claude Code Subagent**（`~/.claude/agents/*.md`）。第三方 AI Agent 应用（aider / cline / autogpt）**不在 V1 范围**。
- **产物**：`.dev/marketplace-prd/01_research/D_agent_data_source.md`，**150-300 行**（降级后）
- **核心问题（降级后只调研 4 题，足以为 V1.5/V2 留方向）**：
  1. Claude Code Subagent 的官方定义、文件结构、与 Skill 的产品差异（一段文字概述即可）
  2. 是否存在 Anthropic 官方 Subagent 目录？社区主要聚合源 1-2 个候选（不深挖）
  3. Subagent 的"安装单元"是单 markdown 还是 git repo / plugin 子集？（直接影响未来纳入时的复杂度）
  4. Ensemble 当前对 Subagent 的支持现状（事实陈述）：是否有数据模型、是否扫描 `~/.claude/agents/`、Scene 是否包含 agent
- **必读上下文清单**（精简）：
  - 调研产物 A、G、H
  - `src/types/index.ts`（确认 Scene 模型不含 agent — 已确认）
  - 通过一次 MCP 工具搜索（Tavily / EXA）获得社区聚合源候选名称即可，**不抓取详情**
- **产出格式骨架**：4 个核心问题简答（每题 ≤ 30 行）+ 末尾"V1.5/V2 接入 Subagent Marketplace 的前置工作清单"（≤ 5 项，如"先加 Subagent 列表页 / Subagent 数据模型 / Scene 中 Subagent 字段 / ..."）
- **不做**：不深入对比社区源、不画候选源对比表、不评估 V1 取舍（已被用户决策锁定）、不为 V1 PRD 的"埋点"做任何建议
- **质量自检**：
  - [ ] 4 个问题每个回答 ≤ 30 行
  - [ ] "V1.5/V2 前置工作清单"≤ 5 项
  - [ ] 总行数在 150-300 范围
  - [ ] 不出现任何"V1 应该如何处理 Agent"的讨论

### E — 同类产品 Marketplace UX 模式调研

- **产物**：`.dev/marketplace-prd/01_research/E_competitor_ux.md`，400-700 行
- **核心问题**（横向对比，不分别深入）：
  1. **macOS-native 桌面工具**：Raycast Store 的发现、安装、管理 UX；Setapp 的 sidebar 入口模式
  2. **开发者工具**：VSCode Extensions Marketplace 的页面结构、详情页元数据、一键安装提示
  3. **桌面笔记 / 知识工具**：Obsidian Community Plugins 的 sidebar 入口、列表筛选、安装/启用分离
  4. **设计参考**：Linear 的 sidebar 分组方式、Things 3 的极简密度对比
  5. 这些产品如何处理"已安装 vs 未安装"状态在同一列表中的视觉区分？
  6. 这些产品的"详情页"（Detail Pane）展示什么内容？描述长度、截图、版本、作者、用户评价
  7. 一键安装的反馈：是否有进度条？模态？默认在哪儿写入？怎么处理失败？
  8. 离线 / 网络故障的降级
  9. "Marketplace" 入口在 sidebar 中的位置（顶部独立分组 vs 与现有功能并列 vs 下沉到二级页面）— 与本任务的字面要求"在 Skill 上面再加一个分隔线"的契合度
- **必读上下文清单**（除通用项外）：
  - 用 MCP 工具（FireCrawl、Tavily）抓 Raycast Store / Obsidian Community Plugins / VSCode Extensions 的页面结构与截图描述
  - **不需要**安装这些产品来跑（成本过高）；以官方文档 + 社区评论 + 截图为准
- **产出格式骨架**：H2 = 9 个核心问题 / H3 横向对比表 / 末尾"对 Ensemble Marketplace UX 的可移植设计模式（≥5 条）"
- **不做**：不写 Marketplace 页面应该长什么样（这是 PRD 的事）；不画线框图
- **质量自检**：
  - [ ] 至少 4 款产品被横向对比
  - [ ] 末尾"可移植设计模式"≥ 5 条且每条注明源产品
  - [ ] 没有照搬某一款产品的整套方案
  - [ ] 总行数在 400-700 范围

---

## 4. Synthesis Gate 派单卡（双产物）

### 4.1 综合 SubAgent

- **前置依赖**：A、G、H、B、C、D、E 全部完成
- **任务**：阅读全部 7 个调研产物 + `00_understanding.md`，输出**两份独立文档**
- **必读上下文清单**：
  - `.dev/marketplace-prd/00_understanding.md`
  - `.dev/marketplace-prd/01_research_plan.md`
  - `.dev/marketplace-prd/01_research/A_*.md` ~ `E_*.md`（共 7 个）
  - `~/.claude/rules/plan-as-research-design.md`（重读"Two artifacts at the Synthesis Gate"节）

### 4.2 产物 1 — `02_synthesis_decisions.md`（决策登记）

- **路径**：`.dev/marketplace-prd/02_synthesis_decisions.md`
- **行数预算**：300-600
- **每条决策的格式（强制）**：

  ```
  ### D-N: <决策名>
  - **决策**：<一句话锁定>
  - **置信度**：High / Medium / Low
  - **备选**：<≤3 个>
  - **选定理由**：<≤3 行，引用调研产物 §x.y>
  - **冲突解决**：<若调研间冲突，说明取舍依据>
  - **影响下游**：<对 PRD V1 哪些章节、对未来 spec/tech plan 的影响>
  ```

- **必须覆盖的决策（最少清单）**：
  - D-1：Marketplace 入口在 sidebar 的位置（顶部独立分组 vs 其他）
  - D-2：Marketplace 子项数量与命名（Skill / MCP / Agent；Agent 是否纳入 V1）
  - D-3：数据源策略 — 完全用 Claude Code plugin 体系 / 自爬 / 双轨（A / B / C 选一）
  - D-4：Skill 主数据源选择
  - D-5：MCP 主数据源选择
  - D-6：（如 Agent 入 V1）Agent 主数据源选择
  - D-7：安装路径与"装到管理路径"的产品定义（落到 `~/.ensemble/` 还是 `~/.claude/plugins/`）
  - D-8：安装后 Auto-Classify 是否自动触发
  - D-9：与现有 `installSource: 'plugin'` 资源的视觉与数据合并策略
  - D-10：离线 / 错误 / 重复安装的产品行为
  - D-11：V1 In/Out 范围（用户上传、评论、跨账号同步、私有 marketplace 是否在 V1）
- **格式约束**：所有决策按 D-1 → D-N 顺序；每条决策 ≤ 25 行；决策之间不重复
- **不做**：不写 PRD 内容；不写技术实现；不画线框

### 4.3 产物 2 — `02_risk_distillation.md`（风险登记）

- **路径**：`.dev/marketplace-prd/02_risk_distillation.md`
- **行数预算**：100-250
- **每条风险的格式（强制，一行一条）**：
  ```
  R-N | <类别> | <风险一句话> | <严重度: P0/P1/P2> | <来源: 01_research/X §x.y>
  ```
- **类别枚举**：数据源稳定性 / 安装路径 / UX 一致性 / 数据模型膨胀 / 闭环断裂 / 范围失控（商增）/ 法律合规 / 性能 / 可访问性 / 其他
- **必须覆盖的风险源**（至少应从这些类别下挖掘）：
  - 上游数据源消失 / 改 API
  - 安装失败的恢复路径不清晰
  - 装到 `~/.ensemble/` 与 `~/.claude/plugins/` 的双路径混乱
  - V1 范围被"用户上传 / 评论 / 推荐算法"等商增功能吞没
  - Marketplace 列表与现有 Skills 列表的视觉重复 / 心智冗余
  - 离线时 Marketplace 页空白卡死
  - Agent 范围被扩大到第三方 agent 应用
- **格式约束**：每条 ≤ 1 行；总条数 30-80（少则覆盖不足，多则商减失败）；按 P0 → P2 排序
- **不做**：不写缓解方案（这是 PRD / spec 阶段的事，登记是为了"不要漏掉"）

---

## 5. PRD 撰写 SubAgent 派单卡

- **前置依赖**：`02_synthesis_decisions.md` + `02_risk_distillation.md` 完成
- **产物**：`.dev/marketplace-prd/03_PRD_v1.md`，**目标 800-1200 行，硬上限 1500**
- **必读上下文清单**：
  - `.dev/marketplace-prd/00_understanding.md`（用户原话 + 项目事实）
  - `.dev/marketplace-prd/02_synthesis_decisions.md`（决策登记 — 这是"做什么"的契约）
  - `.dev/marketplace-prd/02_risk_distillation.md`（风险登记 — 这是"避开什么"的契约）
  - `.claude/rules/plan-document-style.md`（行数与商减纪律）
  - `.claude/rules/design-language.md`（设计语言；只引用，不重写）
- **撰写风格强约束（必须遵守）**：
  - 像产品经理写的，不像技术 spec
  - 不写 Rust struct / IPC 命令名 / TypeScript 接口 / 代码示例
  - 不重新定义 design tokens、不画线框图、不嵌入截图
  - 视觉一致性章节用一句话引用："严格按 `.claude/rules/design-language.md` V3 + `02_design_spec.md` V3 的语言；不引入新 token"
  - 每写一节都自问"这是必要的吗？删掉影响目标达成吗？"
- **必须回答的核心问题（不强制章节顺序，但必答）**：
  1. **Vision & Problem**：当前断点是什么？V2.0 解决什么？为什么是现在？
  2. **User & Persona**：谁是 Marketplace 的目标用户？典型场景？
  3. **End-to-End Journey**：从"我听说有个新 Skill"到"我在自己的项目里用上了"的完整路径，每一步用户在哪、做什么、看到什么
  4. **Feature Scope V1**：详细列出每个功能的 user value（不是"我们要支持 X"，而是"用户因此获得 Y"）
  5. **Information Architecture & Key Interactions**：Marketplace 在 sidebar 中的位置、子项、点击进入后的页面布局（用文字描述，不画线）；列表 / 详情 / 安装 / 已安装状态切换的交互节奏
  6. **Data Source & Install Path**：每类资源的主数据源 + 备选源 + 安装落地路径（引用 D-3 ~ D-7 决策）
  7. **Closed Loop Definition**：从 Marketplace 安装的资源如何进入"已有 Skills 列表"、如何被 Auto-Classify、如何加入 Scene、如何 sync 到 Project — 闭环的每一环节都要被显式定义
  8. **Scope In / Out**：V1 包含的（≤8 项）+ 显式不包含的（≤8 项）+ 每条 Out 给出"为什么不在 V1"的理由
  9. **Success Criteria & Feedback Mechanism**：成功长什么样？如何度量？失败信号是什么？
  10. **Risks & Open Questions**：基于 `02_risk_distillation.md` 的 P0 风险 + 在 PRD 阶段无法关闭、需要 spec / 实施阶段进一步决策的开放问题
- **章节骨架建议**（仅供参考，SubAgent 可调整顺序但不可遗漏问题）：
  ```
  1. 概述（Vision + Problem 一页）
  2. 目标用户与场景
  3. 用户旅程（核心闭环）
  4. 功能范围 V1
  5. 信息架构与关键交互
  6. 数据源策略
  7. 闭环定义
  8. 成功标准
  9. 范围 In/Out
  10. 风险与开放问题
  附录 A：决策登记引用映射（D-1~D-N 在哪节被引用）
  ```
- **不做**：
  - 不写技术实现（任何形式的代码、伪代码、struct 字段）
  - 不写设计 token、动效曲线、像素值
  - 不重复 `02_design_spec` 风格的视觉细节
  - 不为"完整性证明"补章节（Skill / MCP / Agent / CLAUDE.md / Scene / Project / Settings 不必每个都讨论一遍 — 只讨论与 Marketplace 直接相关的）
- **质量自检**（提交前必跑）：
  - [ ] 10 个核心问题每个都被显式回答（不模糊带过）
  - [ ] 总行数在 800-1500（超 1500 触发膨胀自检：是否在做完整性证明？是否在重写设计 spec？）
  - [ ] 没有 Rust / TS / 代码块（除非是 ≤ 3 行的关键 API 名称引用）
  - [ ] 每个 V1 In 的 user value 句子不是"我们要支持 X"而是"用户因此获得 Y"
  - [ ] V1 Out 每条都有"为什么不在 V1"的理由
  - [ ] 附录 A 的决策映射至少覆盖 80% 的 D-N

---

## 6. 评审 SubAgent 派单卡（4 个并行）

每个评审 SubAgent 从一个**独立角度**评审 PRD V1。**严禁评审超出本角度的内容**（避免重复）。

### 共同约束

- 模型：Opus 4.7
- 必读：`00_understanding.md` + `02_synthesis_decisions.md` + `02_risk_distillation.md` + `03_PRD_v1.md`
- 产物路径：`.dev/marketplace-prd/05_review/v1_<perspective>.md`
- 行数预算：每份 200-500
- **产物格式（强制）**：每条发现编号为 P0 / P1 / P2，格式 `[P0-N] <一行问题描述> — <影响> — <修订建议>`；P0 = 必须修才能发布、P1 = 应修、P2 = 可修。每条 ≤ 6 行。
- 评审完毕在末尾给一个总体判断：**Pass / Pass with revisions / Reject**
- **不做**：不写实现细节；不重写 PRD 章节；不评审超出本角度的内容

### Reviewer 1 — 产品逻辑闭环

- **角度**：闭环是否真正成立？发现 → 评估 → 安装 → 分类 → Scene → 部署 → 启动 中是否有断点？每一步的"用户做什么 + 看到什么"是否都说清？
- **专项检查**：
  - 安装到 Auto-Classify 的衔接是否定义清楚
  - 已安装 vs 未安装在 Marketplace 列表的状态切换是否回流到 Skills/MCP 列表
  - 错误恢复路径（安装失败、上游不可达）是否有产品级回应
- **路径**：`05_review/v1_product_loop.md`

### Reviewer 2 — 用户体验

- **角度**：用户旅程的真实可信度。从用户角度看，每一步的认知负担、决策点、错误路径、可逆性
- **专项检查**：
  - 首次进入 Marketplace 的用户是否被引导清楚
  - 列表与详情的信息密度是否符合用户决策需要
  - 安装动作的不可逆性是否被合理处理（撤销 / 卸载）
  - 离线 / 网络故障的降级是否友好
- **路径**：`05_review/v1_user_experience.md`

### Reviewer 3 — 设计一致性

- **角度**：PRD 中所有视觉与交互描述是否完全沿用现有设计语言；是否潜伏新 token / 新组件 / 新动效
- **专项检查**：
  - PRD 是否引用而非重写 `design-language.md`
  - 描述 List / Detail / Modal 时是否完全对齐 SkillsPage / McpServersPage 模式
  - sidebar 顶部新 marketplace 分组的视觉描述是否与现有分组（CATEGORIES / TAGS）同构
  - 是否有"新建 marketplace badge / 新颜色 / 新动效"等违反约束的语句
- **路径**：`05_review/v1_design_consistency.md`

### Reviewer 4 — 商减 / 范围控制

- **角度**：是否有"商增"陷阱？V1 范围是否真的克制？是否潜伏可有可无的功能？
- **专项检查**：
  - V1 In 中每项功能是否真的为闭环必需
  - V1 Out 是否漏掉了应该被排除的"听起来不错"的功能（用户上传、评论、推荐算法、AI 生成、跨账号同步等）
  - PRD 章节本身是否有"为完整性补字数"的赘余
  - 总行数是否健康（800-1200 区间是否做到，超 1500 必须被点出）
- **路径**：`05_review/v1_scope_minimalism.md`

---

## 7. 修订 + 对齐审计 SubAgent 派单卡

### 7.1 修订 SubAgent

- **前置依赖**：4 份评审报告全部完成
- **产物**：`.dev/marketplace-prd/04_PRD_v2.md`，行数预算同 V1（800-1500）
- **必读**：`03_PRD_v1.md` + 4 份评审报告 + `02_synthesis_decisions.md` + `02_risk_distillation.md`
- **必做**：
  - 顶部 `## Revision History (V1 → V2)` 块：列出每条 P0 / P1 的处理方式（采纳 / 部分采纳 / 不采纳 + 理由）
  - 同时声明 cascade footprint：本次 V2 修订是否影响 `00_understanding.md` 的事实陈述（应不会）、是否影响 `02_synthesis_decisions.md`（如果影响，必须回 Synthesis 重做，而不是 V2 自己改）
- **不做**：
  - 不静默丢弃 P0（不采纳必须有理由）
  - 不在 V2 中再增章节（除非 P0 明确要求）
  - 不超过 1500 行硬上限

### 7.2 对齐审计 SubAgent

- **前置依赖**：`04_PRD_v2.md` 完成
- **产物**：`.dev/marketplace-prd/05_review/v2_alignment_audit.md`，100-300 行
- **必读**：`00_understanding.md` + `02_synthesis_decisions.md` + `02_risk_distillation.md` + `04_PRD_v2.md`
- **职责（仅这三项，不评审内容质量）**：
  1. **覆盖性审计**：用户原话（`00_understanding.md` §1）的每一句诉求是否在 V2 中被回应？逐条检查
  2. **决策一致性审计**：`02_synthesis_decisions.md` 的每条决策是否在 V2 中被遵守（不被矛盾改写）？
  3. **风险登记审计**：`02_risk_distillation.md` 的每条 P0 风险是否在 V2 中至少被注意到（在 §Risks & Open Questions 中提及或在功能定义中规避）？
- **产物格式**：三个表格各对应三项审计
- **不做**：不评审 V2 文笔、风格、用户体验质量（这是 V1 评审已经做过的）

---

## 8. 依赖图与执行序列

```
                                 ┌──────────────────┐
                                 │ 阶段 0：理解（已完成）│
                                 └────────┬─────────┘
                                          │
                                 ┌────────▼─────────┐
                                 │ 阶段 1：本规划文档 │
                                 │ （01_research_plan）│
                                 └────────┬─────────┘
                                          │  [主 Agent 必须停下与用户对齐 §9]
                                          ▼
            ┌───────────────────┬─────────────────────┐
            │ 调研 A 当前应用   │ 调研 G plugin 机制   │ 调研 H ensemble 审计
            │（必须最先）        │  （并行）            │  （并行）
            └────────┬──────────┴──────────┬──────────┘
                     │                     │
                     ▼                     ▼
            ┌────────────────────────────────────────────────┐
            │ A + G + H 全部 ready 后并行：                   │
            │ B Skill 源 / C MCP 源 / D Agent 源 / E 同类参考 │
            └────────────────────┬───────────────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │ Synthesis Gate（综合 SubAgent）│
                  │ → 02_synthesis_decisions.md   │
                  │ → 02_risk_distillation.md     │
                  └──────────────┬───────────────┘
                                 │  [主 Agent 检查 D-1~D-N 决策完整性]
                                 ▼
                       ┌─────────────────────┐
                       │ PRD V1 撰写 SubAgent │
                       │ → 03_PRD_v1.md      │
                       └──────────┬──────────┘
                                  │
                ┌─────────────────┼─────────────────┐
                │  并行 4 个评审  │                 │
                ▼                 ▼                 ▼
           Reviewer 1         Reviewer 2-4      （并行）
           产品闭环           UX / 设计 / 商减
                │                 │                 │
                └─────────────────┼─────────────────┘
                                  │
                                  ▼
                        ┌──────────────────────┐
                        │ V2 修订 SubAgent      │
                        │ → 04_PRD_v2.md       │
                        └──────────┬───────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │ 对齐审计 SubAgent     │
                        │ → 05_review/         │
                        │   v2_alignment_audit │
                        └──────────┬───────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │ 主 Agent 与用户交付   │
                        │ （PRD V2 即终稿）     │
                        └──────────────────────┘
```

**主 Agent 强制断点**：
- **断点 1**（阶段 1 → 2 之间）：与用户对齐 §9 列出的"调研前必须明确的开放问题"
- **断点 2**（Synthesis 完成后）：检查 D-1 ~ D-N 是否完整覆盖 §4.2 列出的"必须覆盖的决策"，缺失的回 Synthesis 补
- **断点 3**（V1 完成后、4 评审发布前）：主 Agent 亲自通读 V1，确认行数与基本风格符合本规划，再发评审
- **断点 4**（对齐审计完成后）：主 Agent 与用户交付 PRD V2，**不主动启动下游 spec / tech plan 任务**（用户决定是否启动）

---

## 9. 关键产品决策点（用户对齐）

### 9.1 调研前必须与用户对齐（断点 1）

| 编号 | 决策 | 备选项 | 推荐倾向 | 理由 |
|---|---|---|---|---|
| Q1 | Agent Marketplace 是否纳入 V1？ | (a) 纳入；(b) 延后到 V1.5/V2；(c) 不做 | **(b) 延后** | Ensemble 当前完全不管理 Subagent；纳入 V1 等于一次性引入两个新概念（Marketplace + Subagent 管理），违反商减；建议先把 Skill / MCP marketplace 跑通 |
| Q2 | 数据源策略大方向倾向？ | (A) 完全用 Claude Code plugin 体系；(B) 自爬 skills.sh 等社区源；(C) 双轨 | **由调研收敛**，但偏向 (B) 社区源 + 安装到 `~/.ensemble/` 的现有路径 — 与用户原话"找权威源 + 落到管理路径"对齐 | 用户原话明确"不打算自己建映射表"+"找权威源"，但没说一定要用 plugin；用调研验证再选 |
| Q3 | "在 Skill 上面再加分隔线"是否字面上理解为 sidebar 顶部独立分组？ | (a) 顶部独立分组（字面）；(b) 在 5 项 Navigation 中并列；(c) 二级页面入口 | **(a) 顶部独立分组** | 用户原话明确"在 Skill 上面" + "加一个分隔线"，字面就是顶部独立分组；与 Linear / Things 3 的"功能区域分层"模式同构 |
| Q4 | V1 Out 是否包含"用户上传 marketplace 内容"？ | (a) 完全 Out；(b) 列在 V2 路线图；(c) 至少展示 placeholder | **(a) 完全 Out** | 双向 marketplace 是另一个数量级的产品；商减 |

### 9.2 调研后再与用户对齐（断点 2 之后，可选）

下列决策建议由 Synthesis Gate 在调研基础上做出，**只在 Synthesis 决策置信度为 Low 时**才回到用户：

- 主数据源选哪个（Skill / MCP）
- 离线 / 错误处理的产品口径
- 与现有 `installSource: 'plugin'` 资源的视觉合并细节

### 9.3 主 Agent 调用 AskUserQuestion 的纪律

- **同一轮最多问 4 个问题**（避免认知负担）
- **每个问题给 ≤ 4 个选项 + 推荐倾向 + 理由**（不单纯把球踢回，参考 `feedback_decision_with_recommendation.md`）
- **不在调研中途反复打断用户**（每个断点是显式的，不连续骚扰）

---

## 10. 文档体量与风格自检

### 本规划文档（01_research_plan.md）自检

- [x] 不写技术实现细节
- [x] 不画视觉线框
- [x] 每张派单卡包含：必读上下文 / 产物路径 / 行数预算 / 核心问题 / 产出格式 / 不做清单 / 质量自检
- [x] 依赖图清楚标注并行 vs 串行
- [x] 用户决策点清楚区分"调研前 / 调研后"
- [x] Synthesis Gate 双产物模型明确写入
- [x] 评审 SubAgent 数量克制（4 个）
- [x] 总行数自检（≤ 800 软上限；超 1.2x 触发膨胀自检）

### 体量约束矩阵（下游所有产物）

| 产物 | 软上限 | 硬上限 | 膨胀警报 |
|---|---|---|---|
| 调研 A/B/C/E 各文 | 700 | 900 | > 900 |
| 调研 D/G/H 各文 | 500 | 700 | > 700 |
| `02_synthesis_decisions.md` | 600 | 800 | > 800 |
| `02_risk_distillation.md` | 250 | 400 | 条数 > 100 |
| `03_PRD_v1.md` / `04_PRD_v2.md` | 1200 | 1500 | > 1500 |
| 各评审报告 | 500 | 700 | 单份 > 700 |

膨胀警报触发后停下自检：是否在为"完整性证明"而写？是否把上游内容粘进了下游？是否引入了不必要的章节？

---

## 11. 失败模式预防清单（本任务专属）

| 失败模式 | 预防措施（已写入相关派单卡） |
|---|---|
| 调研 SubAgent 把 PRD 写了一遍 | 每张调研卡明确"不做：不写 PRD 内容 / 不下决策 / 不写技术实现" |
| Synthesis 决策不完整（漏关键决策） | §4.2 列出"必须覆盖的决策"最少清单 |
| 风险登记沦为缓解方案文档 | §4.3 强制"一行一条 + 不写缓解" |
| PRD 沦为技术 spec | PRD 卡强制"不写代码 / 不定义 token / 商减自检" |
| PRD 范围失控（商增） | Reviewer 4 专门看商减；V1 In 与 V1 Out 各 ≤ 8 |
| V2 修订把 P0 静默丢弃 | V2 卡强制 Revision History 列出每条 P0 处理方式 |
| 调研产物之间冲突无人裁决 | 综合 SubAgent 强制处理冲突；同级冲突上报主 Agent |
| 用户原话被改写 | 对齐审计 SubAgent 强制"用户原话每一句逐条检查" |
| 文档膨胀 | §10 体量约束矩阵 + 膨胀警报机制 |

---

**本文件结束。任何 SubAgent 在执行前未读完本文件不允许动手。**
