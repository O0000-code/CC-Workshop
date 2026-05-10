# Ensemble Marketplace —— 任务理解（00）

> **必读基线**。本轮所有 SubAgent 在执行前必须完整读完本文档，以保证认知一致。
> 本文档由主 Agent 亲自撰写，描述用户诉求 + 项目事实 + 关键产品上下文 + 初步推演。
> **角色定位**：本任务最终产出是一份 **PRD（Product Requirements Document，产品需求文档）**，不是技术规格、不是设计动效细节、不是代码方案。

---

## 1. 用户原话（不经压缩，作为唯一原始输入）

> 接下来，请帮我分析一下。我们现在有一个 ACP、Skill、CodeMD 的管理工具，我现在想要拓展一下我们 App 的功能。希望把管理、安卓、Skill、SCP，还有不同类别的 AI Agent 的市场也放到我们这个软件里面。
>
> 具体来说，可以在 Skill 的上面再加一个分隔线，然后在上面去把 Skill Marketing、NCP Marketing 放到放上去。一整个设计的风格和样式，要跟我们现有的 SAP Service Skills 的设计功能完全一致。
>
> 你可以先充分地探索、分析一下当前这个软件的设计风格是什么样的，它的设计规范是什么样的。我们在设计上有非常高的要求，不能有任何的偏差。所以，一定要尽可能使用现有的组件，不要再有新的组件。用的话，风格也要和当前一模一样，并且要保持非常质感高级、细腻、精致。
>
> 这里我们可能需要加一下 Skill Marketing 和 NCP Marketing。CodeMD 应该是没有 Marketing 的，微博的话也可以加，但是我知道不同的 Agent 应该会有 Marketing，这个应该也可以加入进来。
>
> Skill Marketing 应该就有 skills.sh 这个网站，是不是直接进去或者从它里面爬数据就可以了？这样做会好一点。你跟其他的 NCP 也是找一个比较权威的官方网站，然后从那里爬数据，这样会比较好一点，效果会更好一点。所以说可能需要尽量调研一下哪个网站会比较权威一点，可以直接拿到他们的数据。如果我们是看软件，我们也不打算自己去建设这种映射表，就直接用别人的权威一点就好。
>
> 核心想要做到就是能够直接安装到我们的管理路径，然后直接能够分发、使用、分类，让它系统的闭环。
>
> 这个就相当于我们这个软件开源软件的 2.0 版本，就是加了一个新的功能，不仅是管理和安装，更是让它一整个闭环，更方便一点。
>
> 最终的产出结果就是一个 PRD 需求文档就可以了。要是像一个真的产品经理一样，不完全懂技术，但是非常懂产品、非常懂逻辑、非常懂用户的角度去写这个文档。
>
> 不是说"商增"，而是说"商减"，就是把简单让目标变得清晰，让功能变得明确，让逻辑变得闭环。而不是塞一堆用不到的功能。

### 1.1 用户语音转写校正

`/orchestrate` 命令入口的输入是语音转写，存在已知歧义需要在调研中校正：

| 转写文本 | 校正后真实诉求 | 依据 |
|---|---|---|
| ACP / SCP / NCP / SAP Service | **MCP**（Model Context Protocol） | 项目已有 MCP Servers 模块；用户曾用 "MCP" 标准缩写 |
| Skill Marketing / NCP Marketing | **Skill Marketplace / MCP Marketplace** | "市场"在产品语境是 marketplace，不是营销 |
| 安卓 | **Agent**（AI Agent） | 上下文是"不同类别的 AI Agent"，与 Android 无关 |
| CodeMD | **CLAUDE.md**（项目 / 用户级 Markdown 配置文件） | 项目已有 CLAUDE.md 模块 |
| 微博也可以加 | **没问题，也可以加** 或 **MCP 也可以加** | 上下文是"不同 Agent 也有 marketplace 可以加" |

**校正后的核心诉求一句话表述**：在现有的 Ensemble（Skill / MCP / CLAUDE.md 管理工具）之上，**新增 Marketplace（市场）能力**，让用户能在 Ensemble 内**发现 → 评估 → 一键安装 → 自动分类 → 加入 Scene / 分发**整个闭环，不必离开 Ensemble 去外部网站手动 git clone / npm install。CLAUDE.md 没有 marketplace；Skill / MCP / Agent 有。

---

## 2. 项目事实（来自代码 Read，不是推断）

### 2.1 当前 Ensemble 是什么

**定位**：macOS 桌面 App，集中管理 Claude Code 的三类配置资产 + 把它们打包成 Scene 部署到具体 Project。

**技术栈**：Tauri 2 + Rust（后端）+ React 18 + TypeScript 5 + Tailwind CSS 4 + Zustand 5；macOS-only。

**核心数据模型**（`src/types/index.ts`、`src-tauri/src/types.rs`）：

| 实体 | 用途 | Marketplace 相关字段（已存在） |
|---|---|---|
| `Skill` | 一个 Skill 的元数据 + 内容 | `installSource: 'local' \| 'plugin'`, `pluginId`, `pluginName`, `marketplace`, `pluginEnabled` |
| `McpServer` | 一个 MCP Server（stdio / HTTP） | 同上 + `url`, `mcpType` |
| `ClaudeMdFile` | 一个 CLAUDE.md 文件 | 无 marketplace 字段（用户也明确说 CLAUDE.md 没有 marketplace） |
| `Scene` | Skills + MCPs + CLAUDE.md 的打包组合 | — |
| `Project` | 一个文件夹路径 + 关联的 Scene | — |
| `Category` | 全局分类（带颜色 + 父子层级，max depth 2） | — |
| `Tag` | 全局标签 | — |

**重要事实**：`Skill` 和 `McpServer` 的类型已经包含完整的 marketplace 来源字段。这是因为 **Claude Code 自身已经有一套 plugin marketplace 机制**（`~/.claude/plugins/`），Ensemble 通过 `commands/plugins.rs` 扫描并展示这些"插件来源的 Skill / MCP"。换言之：Ensemble 已经"被动感知"了 Claude Code 的 marketplace 生态，但从未"主动浏览/安装"过。

**用户诉求的本质**：让 Ensemble **从被动展示者变成主动入口**。

### 2.2 当前 Sidebar 与导航结构

`src/components/layout/Sidebar.tsx`（260px 宽）：

```
┌───────────────────────────────┐
│ Header（traffic lights + Refresh）│ 56px
├───────────────────────────────┤
│ ─ Navigation（5 项）─          │
│   • Skills          (count)    │  ← 这里是用户说的"Skill 上面"
│   • MCP Servers     (count)    │
│   • CLAUDE.md       (count)    │
│   • Scenes          (count)    │
│   • Projects        (count)    │
│ ─────────── Divider ────────── │
│ ─ CATEGORIES（uppercase 10px）─│
│   ... categories list           │
│ ─────────── Divider ────────── │
│ ─ TAGS（uppercase 10px）──────│
│   ... tag pills                 │
├───────────────────────────────┤
│ Settings（footer 齿轮）         │
└───────────────────────────────┘
```

**用户对新结构的字面要求**："在 Skill 上面再加一个分隔线，然后在上面去把 Skill Marketplace、MCP Marketplace 放到上面"。

这意味着新 Sidebar 顶部会增加一个独立分组（Marketplace 区），位于 Header 与现有 5 项 Navigation 之间，靠分隔线视觉分隔。

### 2.3 现有功能闭环（不含 marketplace）

```
1. 发现：用户从外部得知一个 Skill / MCP 的存在
2. 安装：用户在终端执行 git clone / claude plugin add / npm install
3. 导入：Ensemble 通过 ImportSkillsModal / ImportMcpModal / 文件扫描发现新增项
4. 分类：用户手动或自动分类（按 Category / Tag）
5. 组合：用户把 Skill + MCP + CLAUDE.md 组合成 Scene
6. 部署：用户把 Scene 关联到 Project，由 Ensemble 写入 ~/.claude/skills 符号链接 + .mcp.json + CLAUDE.md
7. 启动：从 Finder Quick Action 或 Ensemble 内 Launch 进入终端跑 Claude Code
```

**当前断点**：1 → 2 之间用户必须**离开 Ensemble** 去网页 / GitHub / npm 找资源、手动安装。这是用户原话"让它一整个闭环"想消除的断点。

### 2.4 现有组件库（用户强调"尽量使用现有组件，不要新增"）

| 类别 | 现有组件 | 可复用于 Marketplace 的初步判断 |
|---|---|---|
| Layout | `MainLayout`, `Sidebar`, `PageHeader`, `SlidePanel`, `ListDetailLayout` | Marketplace 页面应直接复用 `ListDetailLayout` + `PageHeader` + `SlidePanel`（与 SkillsPage / McpServersPage 同结构） |
| List Item | `SkillListItem`, `McpListItem` | Marketplace List Item 形式参考这两个，但需要"安装/已安装"状态而非"启用/范围" |
| Detail | `SkillDetailPanel`, `McpDetailPanel` | Marketplace 详情可参考结构（顶部信息 + 描述 + 元数据 + 操作按钮） |
| Modals | `ImportSkillsModal`, `ImportMcpModal`, `ImportClaudeMdModal`, `ScanClaudeMdModal` | Marketplace 安装可能复用 ImportXxxModal 风格的进度反馈 |
| Common | `Badge`, `Button`, `Checkbox`, `Dropdown`, `EmptyState`, `Input`, `Modal`, `SearchInput`, `Tooltip`, `IconPicker`, `CategoryTreeDropdown`, `ScopeSelector`, `Toggle` | Marketplace 几乎全部 UI 元素都可在此挑选 |

**验证假设**："新建 Marketplace 页面 = 一份新的 Routes 配置 + 复用 ListDetailLayout + PageHeader + 一个 MarketplaceListItem 变体（与 SkillListItem 同密度同字号但操作改成 Install 按钮）"。这是初步推演，需调研验证。

### 2.5 设计语言（已固化为项目级 Decisional Rule）

`.claude/rules/design-language.md` 是 Decisional 文档：色彩 token、缓动 token、时长 token、圆角阶梯、字号、阴影分层都已锁定。任何 Marketplace 页面必须严格符合该 Rule，**不允许新建 token、不允许自创灰、不允许新建动效曲线**。
PRD 不需要重写设计 Rule —— 只需指明"完全沿用 design-language.md V3 + sidebar-reorder/02_design_spec.md V3 的语言"。

---

## 3. 关键产品上下文（必须搞清楚的"隐藏前提"）

### 3.1 Ensemble Marketplace ↔ Claude Code 自有 Plugin Marketplace 的关系

这是**整个 PRD 的核心 ambiguity**，必须在调研中明确：

**事实**：Claude Code 本身有一套 plugin 系统：
- `claude plugin marketplace add <git-url>` 添加 marketplace 源（git repo）
- `claude plugin install <name>@<marketplace>` 安装 plugin
- 安装到 `~/.claude/plugins/`，包含 skills + mcps + commands 等
- Ensemble 已经通过 `commands/plugins.rs` 扫描这些插件并把里面的 skill/mcp 显示出来，标记为 `installSource: 'plugin'`

**三种产品策略**（必须由调研 + 用户决策选定其一）：

| 策略 | 描述 | 优势 | 劣势 |
|---|---|---|---|
| **A. 完全复用 Claude Code plugin 体系** | Ensemble Marketplace 是 Claude Code plugin marketplace 的 GUI；用户在 UI 中点 Install 实质是触发 `claude plugin install` | 与 Claude Code 完全同构、零迁移；Anthropic 官方维护 | 受限于 Claude Code plugin 生态尚不成熟、能否安装非 plugin 形式的资源（如 skills.sh 收录的纯 markdown skill）存疑 |
| **B. Ensemble 自建 Marketplace（爬 skills.sh / GitHub）** | Ensemble 直接对接 skills.sh、awesome-mcp、agent 列表等社区源，自己处理下载/解压/安装 | 不依赖 Claude Code，能覆盖更多社区资源 | 用户原话"不打算自己建设映射表"被违背；安装路径需要自行管控 |
| **C. 双轨并行** | Ensemble Marketplace 同时支持 plugin 形式（call CLI）+ 直接资源形式（爬 skills.sh）；UI 统一展示 | 覆盖最广 | UX / 数据模型复杂度上升；与"商减"原则冲突 |

**用户语义倾向（暂作假设）**："找一个比较权威的官方网站，然后从那里爬数据" + "不打算自己建设映射表"——这两句话同时指向 **B + C 中"不重新发明数据源"** 的原则。但用户没有明确说要避开 Claude Code plugin 体系。**这是必须由调研产物澄清的最大开放问题。**

### 3.2 已有事实暗示的强约束

- **CLAUDE.md 没有 marketplace**（用户明确说）→ Marketplace 区只有 Skill / MCP / Agent 三个入口，CLAUDE.md 不进入。
- **不打算自建映射表** → 直接用上游权威源，不维护 Ensemble 自有的目录数据库。
- **风格完全一致** → 不能引入新视觉语言；Marketplace 项目卡的视觉密度、字号、动效必须和 SkillsPage/McpServersPage 同构。
- **核心是"闭环"** → 安装路径必须落到 Ensemble 已有的管理路径，让安装后立即出现在已有 Skills / MCP Servers / Categories 列表中，能立即被分类、加入 Scene、部署到 Project。

### 3.3 Agent Marketplace 的定义模糊性

用户说"不同类别的 AI Agent 应该会有 Marketplace"。在 Claude Code 生态中 "Agent" 至少有两种解释：

| 解释 | 范围 | 调研重点 |
|---|---|---|
| **Claude Code Subagent**（`~/.claude/agents/*.md`） | 由 Markdown 文件定义的专用 agent | 是否有 marketplace 集合（如 awesome-claude-agents）？ |
| **泛化"AI Agent"产品**（autogpt / open-interpreter / cline / aider / 等） | 整套 agent 应用 | 不属于 Ensemble 管辖范围（Ensemble 不是 launcher） |

**初步判断**：用户说的是 Claude Code Subagents（项目内已有 `.claude/agents/` 概念，扩展 Ensemble 管理是自然的）。但这是假设，需调研验证 Claude Code Subagent 类型，以及是否存在 Subagent 资料聚合源（GitHub awesome list、官方目录等）。

> **范围决策的影响**：如果 Agent Marketplace 范围太大（涵盖第三方 agent 应用），PRD 范围会失控并违反"商减"原则。**建议在调研后先做范围收敛**：默认 Agent Marketplace = Claude Code Subagent Marketplace，超出范围的不在 V1 PRD 中。

---

## 4. 我作为主 Agent 对任务边界的初步推演（"我说了的和没说的我都要做"）

用户没明说但 PRD 必须回答的开放问题：

### 4.1 用户路径维度

- **首次发现路径**：用户从哪里第一次进入 Marketplace？只有 sidebar 入口？还是 SkillsPage 空状态时也引导？
- **搜索 / 浏览 / 推荐**：marketplace 列表如何呈现？官方推荐 vs 社区贡献？热度 / 时间 / 字母序？
- **详情页内容**：marketplace item 的详情应展示什么？description、来源、版本、贡献者、依赖、示例、用户评价？
- **安装流程**：一键安装？需要确认（路径 / scope / 范围）？是否进度条？是否能取消？
- **冲突 / 重复**：用户已经本地有同名 Skill，再次从 marketplace 安装会发生什么？覆盖？提示？版本化？
- **更新机制**：本地已安装的 marketplace item 上游有新版怎么通知？是否手动 / 自动更新？
- **卸载**：marketplace 安装的 item 卸载是否有特殊处理（删除缓存、解除关联）？
- **离线**：Marketplace 列表是否缓存？无网络时降级行为？
- **错误处理**：上游不可达 / 安装失败 / 校验失败的提示与恢复路径？

### 4.2 数据 / 同步维度

- **数据源刷新策略**：什么时候去拉取上游？App 启动？Marketplace 页打开？手动 Refresh？后台定时？
- **缓存层**：上游数据缓存在 `~/.ensemble/marketplace-cache/` 还是其他位置？TTL 多久？
- **离线降级**：网络断开时 Marketplace 页应展示什么（最近一次缓存）？
- **数据完整性**：上游 README 的 description 不一定结构化，如何确保 marketplace item 在 Ensemble 里能渲染出 SkillsPage 同质感的展示？

### 4.3 闭环维度

- **安装后的归属**：marketplace 安装的 Skill 进入 Skills 列表后，是否自动应用 Auto-Classify？是否标记 marketplace 来源以便区分？
- **Scene 关联**：marketplace 安装的 Skill 立即可进入 Scene 吗？还是需要某种"激活"步骤？
- **Project 部署**：marketplace 来源的 Skill 在 sync 到 Project 时和本地 Skill 行为一致吗？
- **可追溯**：用户日后想看"这个 Skill 是从 marketplace 哪个源装来的"如何呈现？

### 4.4 与现有 plugin 体系的协调

- **Sidebar Marketplace 与 SkillsPage "Plugin" 标签的关系**：现有 `installSource: 'plugin'` 的 Skill 会同时出现在 Marketplace 和 Skills 里吗？两个标识体系如何统一？
- **Ensemble 是否要「成为」一种 plugin 来源**：让用户在 Claude Code 自身命令行 `claude plugin add` 时也能引用 Ensemble Marketplace？（V1 不必，但 PRD 应注明此扩展空间）

### 4.5 范围与"商减"

V1 不应包含但调研可触达：
- 用户上传 / 贡献 marketplace item（这是双向 marketplace，重大复杂度）
- Marketplace 评论 / 评分系统
- 跨账号同步
- 私有 marketplace（企业版）
- AI Agent 的范围扩展到非 Claude Code Agent

---

## 5. PRD 风格定位（用户明确指示）

### 5.1 必须做到

- 像产品经理写的，不像技术 spec
- 目标 + 用户 + 用户需求 + 功能闭环 + 范围 + 成功标准 为主
- 让下游执行 Agent 看完后能**理解动机和目标**，并自己推导技术路径
- 商减：每一节都要思考"这是必要的吗？删掉影响目标达成吗？"

### 5.2 必须避免

- 几十万字、详细到代码行的技术方案
- 把 02_design_spec / 03_tech_plan 内容塞到 PRD 里
- 罗列所有可能的实现路径而不收敛
- 为"完整性证明"补字数（参考 `plan-document-style.md`）
- 所有"商增"陷阱：可有可无的功能、与目标无关的 nice-to-have

### 5.3 PRD 应回答的核心问题（顶层结构假设）

```
1. 我们要做什么 / 为什么（Vision + Problem）
2. 给谁做（User & Persona）
3. 用户旅程（End-to-end Journey）
4. 功能定义（Feature Scope，每个功能写明 user value）
5. 信息架构 & 关键交互（不写视觉细节，但要写"用户在哪里、做什么、看到什么")
6. 数据源 & 安装路径决策（产品角度的核心选择，不写技术实现）
7. 范围 In / Out（V1 包含与不包含）
8. 成功标准 & 反馈机制（如何判断这个功能成功 / 失败）
9. 风险 & 开放问题
```

---

## 6. 调研需要回答的关键问题（输入给规划 SubAgent）

| 维度 | 关键问题 | 涉及 SubAgent |
|---|---|---|
| 当前应用 | 现有 Skills / MCP / Scenes 的真实用户流程；可复用的所有组件清单；安装路径细节 | 调研 A |
| Skill 数据源 | skills.sh 是什么？数据结构？是否 API？上游是 GitHub 还是 Anthropic 官方？是否还有别的权威源？ | 调研 B |
| MCP 数据源 | 官方 MCP registry / awesome-mcp / Smithery / Glama / mcp.so 等候选；权威性比较；是否有结构化 API | 调研 C |
| Agent 数据源 | Claude Code Subagent 的官方 / 社区聚合源；与 awesome-claude-agents 等的关系 | 调研 D |
| 同类参考 | 类似产品（Raycast Store, Setapp, VSCode Marketplace, Obsidian Plugins, Things 3, Linear）的 marketplace 集成 UX 模式 | 调研 E |
| 用户旅程 | 从用户角度梳理 marketplace 从发现到部署的完整闭环；找出每一步的用户问题、决策点、错误路径 | 调研 F |
| Claude Code Plugin 机制 | `claude plugin marketplace add / install` 命令、API、git 形式的 marketplace 文件结构；Ensemble 是否能 / 应该复用 | 调研 G |

---

## 7. 工作流的"红线"（参考 `plan-document-style.md` 与 `plan-as-research-design.md`）

- **任务分类**：Creative 级（首次定义产品 V2.0 新功能、高复用价值、无现成模板）。走完整研究 → 综合双产物（决策 + 风险）→ 撰写 → 多角度评审 → 修订 → 对齐审计的 6+ 阶段管道。
- **PRD 体量软上限 1500 行**（参考 02_design_spec 上限）；目标 800-1200 行；超 2000 行触发膨胀自检。
- **不写技术实现**；不引入新设计 token；不为执行 Agent 的工作做替代。
- **每一个 SubAgent 派出前**：先有专属规划文档，明确读什么、产出什么、产出的格式。
- **风险登记必产出**：调研后产出 `_risk_distillation.md`（与 `_synthesis_decisions.md` 并列），让 PRD 撰写者既知道"做什么"也知道"避开什么"。

---

## 8. 已有项目级 Rules（PRD 撰写时必须遵守）

- `~/.claude/CLAUDE.md` — 主 Agent 工作宪法
- `~/.claude/rules/plan-as-research-design.md` — Creative 级走完整管道
- `~/.claude/rules/document-authority-ranking.md` — 多 Decisional 文档时建立 ranking table
- `.claude/rules/design-language.md` — 项目设计语言；PRD 描述视觉时只能引用 Rule，不能自创 token
- `.claude/rules/plan-document-style.md` — Plan / Spec / PRD 简洁原则、行数硬上限
- `.claude/rules/cross-document-cascade-discipline.md` — 文档版本迭代时的级联纪律
- `~/.claude/rules/persistence-system.md` — 文档落盘 vs 内存的分层
