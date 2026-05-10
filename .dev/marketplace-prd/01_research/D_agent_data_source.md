# D — Agent (Subagent) Marketplace 数据源调研【V1.1 已降级】

> **范围已被断点 1 用户对齐锁定**：Agent Marketplace **不在 V1 范围**。V1 = Skill + MCP 两个子项；Agent 延后到 V1.5/V2。
>
> 本调研为 V1.5/V2 路线图收集证据，不深度对比社区源、不画候选源对比表、不评估 V1 取舍、不为 V1 PRD 的"埋点"做任何建议。
>
> 证据原则：每条事实标注来源（Anthropic 官方文档 / GitHub repo / 实测命令输出 / Ensemble 代码行号）。
>
> 实测环境：Claude Code 2.1.133 + Ensemble main 分支（2026-05-09）。

---

## 0. 证据来源清单

| 标号 | 来源 | 用途 |
|---|---|---|
| OD-A1 | https://docs.claude.com/en/docs/claude-code/sub-agents | 官方"Subagents" 概念页 |
| OD-A2 | https://docs.claude.com/en/docs/claude-code/skills | 官方"Skills" 概念页 |
| GH-A1 | https://github.com/VoltAgent/awesome-claude-code-subagents（14.0k stars） | 社区主聚合源 1（110+ subagent） |
| GH-A2 | https://github.com/rahulvrane/awesome-claude-agents（326 stars） | 社区聚合源 2（meta-list，列出多个 collection） |
| GH-A3 | https://github.com/wshobson/agents | 主流 production 集合（48 agent，企业范式；从 GH-A2 引用） |
| GH-A4 | https://github.com/0xfurai/claude-code-subagents | 主流"最大覆盖" 集合（100+ agent；从 GH-A2 引用） |
| FS-A1 | `~/.claude/agents/` | 本机目录存在但**为空**（`ls`：0 个 .md 文件）|
| FS-A2 | `src/types/index.ts:82,192-193,236-237,250-251,302-303,320` | Scene / DetectedSkill / DetectedMcp / SkillUsage / McpUsage / data root：**全部仅含 `skills` + `mcps`，无 `agents` 字段**|
| FS-A3 | `src-tauri/src/commands/usage.rs:122-125` | 现有代码中唯一的 `subagents` 引用 = token usage 扫描会话子目录，与 Claude Code Subagent 管理无关|
| 引用-G | `01_research/G_claude_plugin_mechanism.md §3 / §5` | plugin 内部 `agents/*.md` 资源类型 + standalone 路径事实 |

---

## 1. Q1 — Claude Code Subagent 的官方定义、文件结构、与 Skill 的产品差异

**官方定义**（OD-A1）：Subagent 是一种"专业化的 AI 助手"，由用户在 `~/.claude/agents/<name>.md`（user scope）或 `<project>/.claude/agents/<name>.md`（project scope）创建。每个 subagent 拥有**独立的 context window**，可被 Claude Code 主对话**显式调用或自动委派**（Claude 根据 subagent 的 description 字段判断任务匹配度）。文件结构 = YAML frontmatter（`name`, `description`, 可选 `tools`, `model`）+ 正文 system prompt（markdown）。

**与 Skill 的产品差异**（OD-A1 vs OD-A2 + 引用-G §3）：

- **Skill**：技能片段（如"如何写 Excel"），Claude 在主对话中**就地加载并使用**，**不开新会话、不切换 context**。文件 = `~/.claude/skills/<name>/SKILL.md`（+ 可选 references/scripts 子目录）。
- **Subagent**：独立 AI 角色（如"code-reviewer"），主对话**委派任务**给它后**新开一个 context** 跑完任务再返回结果。文件 = `~/.claude/agents/<name>.md`（单文件，无目录嵌套）。
- **产品心智差**：Skill = "工具书"（被引用），Subagent = "专家"（被请去办事）。Skill 偏知识/流程封装，Subagent 偏角色/任务委派。
- **plugin 内同时支持**（引用-G §3）：plugin 可在 `agents/*.md` 与 `skills/<name>/SKILL.md` 两个目录下混合发布；同一 marketplace 可同时分发两类资源。

---

## 2. Q2 — 是否有 Anthropic 官方 Subagent 目录？社区主要聚合源 1-2 个候选

**Anthropic 官方目录**：**没有专门的 "Anthropic Subagent 目录"**。但官方 `claude-plugins-official` marketplace（引用-G §4）中部分 plugin 是 agent-only 形式（如 `code-simplifier` 只含 `agents/code-simplifier.md`）—— Subagent 通过 plugin 体系被官方间接分发，**没有独立的"Subagent registry"**。

**社区主要聚合源 1-2 个候选**：

- **VoltAgent/awesome-claude-code-subagents**（GH-A1）：14.0k stars，110+ subagent 跨 10 个分类（核心开发 / 语言专家 / 基础设施 / 质量与安全 / 数据 AI / DX / 专域 / 商业产品 / 元编排 / 研究分析）。**社区最大、最活跃、维护稳定**，是事实 V1.5/V2 主候选源。
- **rahulvrane/awesome-claude-agents**（GH-A2）：326 stars，本身是 **meta-list**（列举 wshobson/agents 48 agent、0xfurai/claude-code-subagents 100+ agent、VoltAgent 等多个 collection），适合"多源聚合视角"。

**附注（非深挖）**：rshah515/claude-code-subagents（133 agent）、wshobson/agents（48 agent，企业范式）也是常见候选；若 V1.5/V2 真要做 Subagent Marketplace，倾向以 VoltAgent 为主源 + meta-list 校验覆盖度。**本调研不下推荐结论**——决策留给 V1.5/V2 启动时的新一轮调研。

---

## 3. Q3 — Subagent 的"安装单元"是单 markdown 还是 git repo / plugin 子集？

**三种共存形式**（引用-G §5 互通性矩阵 + GH-A1/A2 实测）：

1. **单 markdown 文件**（最常见）：社区主流做法 = clone 整个 awesome-list repo → `cp` 想要的 `<agent>.md` 到 `~/.claude/agents/<agent>.md`。VoltAgent 的"Quick Start"就是 `git clone ... ~/.claude/agents/ai-team`（GH-A1）。**这是标准 standalone 安装路径，与 Skill 的 standalone 路径完全对称**。
2. **git repo 整体**：直接 `git clone <repo> ~/.claude/agents/<subdir>/`，把整个 collection 作为单个 user-scope agent 集合使用。粒度粗，但批量获取最快。
3. **plugin 子集**：marketplace.json 中的 plugin 条目可仅声明 `agents/` 目录（引用-G §3 中 `code-simplifier` 实例）。安装路径 = `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/agents/*.md`，由 Claude Code 自动加载。

**对未来 Ensemble 接入的事实意义**：

- **粒度选择是产品决策点**：是把"一个 agent 作为安装单元"（用户体验最细粒度，与 Skill Marketplace 同结构），还是"一个 collection 作为安装单元"（数据爬取最简单，但用户要全装或全不装）。
- **`description` 字段是**核心元数据**——Claude 用它做自动委派匹配，所以 Subagent 列表页"详情"必然要展示 description 全文（这点与 Skill 列表的"description 短摘"心智不同）。
- 与 plugin 体系的互通方式与 Skill 同：standalone 安装 vs plugin 安装 互不依赖，可任选其一或双轨。

---

## 4. Q4 — Ensemble 当前对 Subagent 的支持现状（事实陈述）

| 检查项 | 现状 | 证据 |
|---|---|---|
| 是否有 `Subagent` / `Agent` 数据模型 | **无**。`src/types/index.ts` 全文仅 `Skill` / `McpServer` / `ClaudeMdFile` / `Scene` / `Project` / `Category` / `Tag`；没有任何 agent 类型 | FS-A2 |
| 是否扫描 `~/.claude/agents/` | **无**。`commands/` 下没有 agent 扫描模块（对比 `skills.rs` / `mcps.rs` 是有的）；`commands/usage.rs:122-125` 中的 `subagents/` 字眼是扫描 token usage 会话子目录，不是 Subagent 资源 | FS-A3 |
| Scene 模型是否含 agent 字段 | **不含**。`Scene` 仅有 `skills: SkillRef[]` + `mcps: McpRef[]` + `claudeMdId?: string`（line 82）。`DetectedSkill[] / DetectedMcp[]`（lines 192-193）、`SkillUsage / McpUsage`（lines 302-303）、stats 计数（lines 236-237 / 250-251）全部不含 agent | FS-A2 |
| 本机 `~/.claude/agents/` 状态 | 目录**存在但为空**（0 个 .md 文件）；说明用户当前未使用 Subagent | FS-A1 |
| plugin 来源的 agent 处理 | Ensemble 通过 `commands/plugins.rs` 扫描 `~/.claude/plugins/cache/` 时**只识别 plugin 内部的 `skills/` 和 `mcps`**；plugin 内部的 `agents/*.md` 当前**不被 Ensemble 显示**（即 plugin-sourced subagent 在 Ensemble 中是隐形的） | 引用-G §3 + Ensemble 现有实现观察 |

**一句话总结**：Ensemble 在 Subagent 维度是**完全空白**——没有数据模型、没有扫描、没有列表页、没有 Scene 集成。把 Subagent 纳入 Marketplace V1 等于"先建 Subagent 管理 + 再加 Subagent Marketplace"两层基础设施，与"商减"原则冲突。这是 V1 决策延后的事实依据。

---

## 5. V1.5/V2 接入 Subagent Marketplace 的前置工作清单（≤ 5 项，文字描述）

> 仅描述方向，不画线框、不写 schema、不做技术建议。

1. **Subagent 数据模型**：在 `src/types/index.ts` + `src-tauri/src/types.rs` 新增 `Subagent` 类型（参考现有 `Skill` 字段集 + `description` 必填 + `installSource: 'local' | 'plugin'` 等 marketplace 元数据），并在 `data.json` schema 中增加 subagents 集合。
2. **Subagent 扫描与导入**：参考 `commands/skills.rs` + `commands/import.rs` 实现 `~/.claude/agents/` 的扫描、frontmatter 解析、入库与冲突检测。同时让 plugin 扫描器（`commands/plugins.rs`）识别 plugin 内部的 `agents/*.md` 并入库，与现有 plugin-sourced Skill / MCP 同等对待。
3. **Subagent 列表页 + 详情面板**：在 sidebar Navigation 中新增 Subagent 入口；页面骨架完全沿用 SkillsPage（`ListDetailLayout` + `PageHeader` + `SlidePanel`）；详情默认展开 `description` 全文（用户判断"是否安装"的核心信息）。
4. **Scene 模型扩展 + Project Sync 路径**：在 `Scene` 中新增 `subagents: SubagentRef[]` 字段；Project sync 时把 subagent 文件 symlink 到 `<project>/.claude/agents/`（与现有 Skill symlink 路径同构）。
5. **Subagent Marketplace 子项**：在已建成的 Marketplace 区下新增第三个子项（与 Skill / MCP 并列）；主候选数据源在该阶段通过新一轮 B-类调研收敛（VoltAgent 是最强候选，但 V1.5/V2 启动时需重新评估生态变化）。

---

**本文件结束。全文约 165 行。**
