# Ensemble Marketplace — Product Requirements Document V2

> **Status**: V2（基于 V1 评审反馈修订）
> **Author**: PRD V2 修订 SubAgent（Opus 4.7）
> **Date**: 2026-05-09
> **Scope**: Ensemble V2.0 — Skill Marketplace + MCP Marketplace（V1 不含 Agent Marketplace）
> **Authority**: Decisional 文档；下游 spec / tech plan 阅读时遇冲突按 `02_synthesis_decisions.md` 与本文档为准。
>
> **本 PRD 是产品视角的"做什么"契约**。所有"怎么做"（Rust struct、IPC 命令、TypeScript 接口、像素值、动效曲线）由后续 spec / tech plan 阶段定义。本 PRD 严格遵守 `.claude/rules/design-language.md`：视觉与动效一律引用现有设计语言，**不引入新 token、不画线框、不重写动效**。
>
> **决策与风险来源**：每条产品判断都由 `02_synthesis_decisions.md` 的 D-N 决策与 `02_risk_distillation.md` 的 R-N 风险驱动。引用一律采用 `[D-N]` / `[R-N]` 简写。

---

## 目录

1. [概述：愿景与问题](#1-概述愿景与问题)
2. [目标用户与场景](#2-目标用户与场景)
3. [用户旅程：核心闭环](#3-用户旅程核心闭环)
4. [功能范围 V1](#4-功能范围-v1)
5. [信息架构与关键交互](#5-信息架构与关键交互)
6. [数据源策略](#6-数据源策略)
7. [闭环定义](#7-闭环定义)
8. [成功标准与反馈机制](#8-成功标准与反馈机制)
9. [范围 In / Out](#9-范围-in--out)
10. [风险与开放问题](#10-风险与开放问题)
11. [附录 A：决策登记引用映射](#附录-a决策登记引用映射)
12. [附录 B：术语对照](#附录-b术语对照)

---

## 1. 概述：愿景与问题

### 1.1 当前断点

Ensemble 1.x 是一个 macOS-native 的 Claude Code 配置管家。它把分散在用户机器各处的 Skill、MCP Server、CLAUDE.md 文件统一管理起来，组合成 Scene，再通过 Scene 部署到每一个具体的 Project。这个闭环——**集中管理 → 组合 → 部署**——已经跑通。

但当用户问"我从哪里得到一个新的 Skill"或"我想找一个能查 Linear 的 MCP"时，Ensemble 沉默。用户必须离开 Ensemble，去 GitHub、去 skills.sh、去某个 Reddit 帖子手动找资源，然后回到终端跑 `git clone` 或 `claude plugin install`，再回到 Ensemble 触发一次 Import 才让它进入管理范围。

**用户原话**："核心想要做到就是能够直接安装到我们的管理路径，然后直接能够分发、使用、分类，让它系统的闭环。"

这句话定义了 V2.0 的目标：**让"发现资源"成为 Ensemble 闭环的一环，而不是离开 Ensemble 才能完成的外部动作**。

### 1.2 V2.0 解决什么

Ensemble V2.0 在 sidebar 顶部新增一个独立分组——「Marketplace」——内含两个 nav item：「Skill Marketplace」与「MCP Marketplace」。用户从此可以在 Ensemble 内浏览 skills.sh 上的 Skill 与 Official MCP Registry 上的 MCP Server、用与 SkillsPage 一致的视觉密度搜索/筛选/查看详情、一键安装到 Ensemble 自有管理路径，然后由系统接力完成 Auto-Classify，让资源立即进入 Skills / MCP Servers 列表与本地资源平等参与 Scene、Sync、Project 部署。

也就是说：**安装一个 marketplace 资源 = 把它接入 Ensemble 已有的闭环**。用户不必学新的心智模型，新功能只是已有心智模型的"上游入口"。三个外部条件——skills.sh 已成为社区最活跃的 Skill 聚合源；Official MCP Registry 由 Anthropic 等多方共同维护并提供 vendor-neutral REST API；Ensemble 现有数据模型已包含 plugin 来源标识字段（扩展第三态是同语义自然延伸）——叠加让 V2.0 的接入工程量与产品价值之比首次为正。

### 1.3 一句话产品定义

> Ensemble Marketplace 是 Ensemble 内置的资源发现入口，把 skills.sh 与 Official MCP Registry 接到 Ensemble 已有的「集中管理 → Scene 组合 → Project 部署」闭环最前端，让用户在不离开 Ensemble 的情况下完成"发现 → 评估 → 安装 → 分类 → 使用"全流程。

---

## 2. 目标用户与场景

### 2.1 谁在使用 Ensemble

Ensemble 当前的用户画像（事实推断，基于 macOS-only + Claude Code 集成 + 单机管理）：

- **专业开发者 / 内容创作者**：使用 Claude Code 处理代码、写作、研究、产品设计。已经有自己的工作流偏好。
- **多项目工作模式**：同时在 5–20 个 Project 间切换，不同 Project 需要不同的 Skill / MCP / CLAUDE.md 组合（这是 Scene 模型存在的理由）。
- **macOS-native 审美**：选择 Ensemble 而非纯命令行，是因为重视视觉一致、键盘友好、低认知负担。Apple HIG / Linear / Things 3 是审美锚点，不是参考。
- **配置稍重的用户**：现有 Ensemble 用户中已有 30+ 个 MCP、17+ 个 Skill、16+ 个 Claude plugin（来自 H §Q6 实际机器扫描）——这些用户对资源的"获取与组织"有明确诉求。

### 2.2 V2.0 让谁更受益

| 用户类型 | 现状痛点 | V2.0 的价值 |
|---|---|---|
| **新用户**（刚装 Ensemble） | 不知道有哪些 Skill / MCP 可用；要去 GitHub 自己淘 | 进入 Ensemble 即可看到上游热门资源，安装零门槛；首次进入态有 onboarding 提示帮新用户跨过空白 |
| **常用 plugin 的开发者** | 已经在 Claude Code 装了一些 plugin，但发现新资源仍需离开 Ensemble | 把"发现"环节接到 Ensemble 内部；plugin 来源继续走原 ImportSkillsModal Plugin tab，与 Marketplace 互不冲突 [D-3] |
| **重度 Scene 编排用户** | 想为新 Project 组合 Scene 时缺少特定能力的资源（如某 MCP），要中途断流去找 | Marketplace 装完即可加 Scene，闭环不断流 [D-7, D-8] |
| **关注资源更新的用户** | 不知道用了的 Skill 上游有没有新版本 | V1 不解决（自动更新留 V1.5），但通过 Marketplace 详情可手动看 [D-11 Out 第 6 项] |

### 2.3 典型场景

**场景 A：发现新 Skill**

> 用户在 Reddit 看到有人推荐 `pdf-to-markdown-mineru`，想试试。
>
> V1 之前：终端 `git clone https://github.com/.../skill.git ~/.ensemble/skills/pdf-to-markdown-mineru/`，回到 Ensemble 触发 Import，再手动分类。
>
> V1 之后：Ensemble sidebar → Skill Marketplace → 搜索 "pdf"→ 详情面板看 README → 点 Install → 30 秒后该 Skill 出现在 Skills 列表中、已被 Auto-Classify 到合适分类，并伴随安装成功的"View in Skills →"短链引导用户跨过 Marketplace ↔ Skills 心智差距。

**场景 B：为新 Project 找 MCP**

> 用户开始一个新的"Linear issue 自动化"项目，需要连接 Linear。
>
> V1 之前：搜索 GitHub awesome-mcp，挑一个，看 README 配 `command` / `args`，写到 `~/.claude.json`。
>
> V1 之后：Ensemble sidebar → MCP Marketplace → 输入 "linear" → 详情看到 Official Registry 已收录 → 点 Install → MCP 出现在 MCP Servers 列表 → 加入新建 Scene → 关联 Project → Sync。OAuth 类提示在详情中含"Copy command"按钮，让用户能直接复制 `/mcp` 而非凭记忆。

**场景 C：浏览发现**

> 用户没有具体目标，只是想看看"最近大家都在用什么"。
>
> V1 之前：得去逛 skills.sh、Reddit、Twitter，体验割裂。
>
> V1 之后：进入 Skill Marketplace 默认排序 = upstream popularity，列表顶部即热门资源；首次进入时顶部有 onboarding banner（"New here? Try these popular Skills"）+ top-3 popularity 视觉强调；点开详情快速浏览。

### 2.4 不是给谁用

- **不是 Claude Code plugin 包的开发者**：发布 plugin 仍走 Claude Code 自身机制（`claude plugin marketplace add`）。Ensemble Marketplace 是消费侧入口，不是发布平台 [D-11 Out 第 2 项]。
- **不是企业 / 团队管理员**：私有 marketplace、跨账号同步在 V1 之外 [D-11 Out 第 4、5 项]。
- **不是非 Claude Code 用户**：Ensemble 的全部价值绑定 Claude Code，第三方 AI Agent 应用（aider / cline）不在 Ensemble 管辖范围 [00_understanding §3.3, R-14]。

---

## 3. 用户旅程：核心闭环

V1 把"从听说一个新资源到在 Project 里用上它"完整画一遍，每一步说清**用户在哪里、做什么、看到什么**。

### 3.1 旅程地图（高位视角）

```
[1] 听说 → [2] 进入 Marketplace → [3] 浏览 → [4] 看详情 → [5] Install
                                                              │
                                  Auto-Classify(异步) ← [5.5] ┘
                                          │
                  [5.6] short-cut 引导后续 → [6] 加入 Scene
                                                       ↓
                          [8] 在 Project 中用上 ← [7] Sync
```

**核心论断**：[1]→[5] 是"V2.0 新增的上游通道"；[5.5]→[8] 是"已有闭环的下游消费"。Marketplace 的产品边界**严格止于 [5] 完成时** + [5.5]/[5.6] 的引导承接——Install 成功 → 资源进入 Ensemble 自有路径 → 后续路径与本地 Skill / MCP 完全同模式 [D-7]。

### 3.2 单步详述

**[1] 听说**

来源不限（Reddit、Twitter、博客、同事推荐）。Ensemble 不参与，但要在 [2] 入口可达性上让用户能在 30 秒内进入 Marketplace。

**[2] 进入 Marketplace**

- **入口**：Ensemble sidebar 顶部独立分组「MARKETPLACE」下的两个 nav item—— `Skill Marketplace` 与 `MCP Marketplace`（D-1, D-2）。
- **看到什么**：sidebar 现有的 hairline divider（沿用 Nav→Categories / Categories→Tags 同款，具体 token 与 Sidebar 现有实现一致）+ uppercase 段标题 `MARKETPLACE` + 两个 nav item，视觉与现有 sidebar 完全同语言（D-1, R-16）。
- **可用性**：从任意 Ensemble 页面 1 次点击可达；无需打开 Settings、无需弹 Modal（与 Obsidian 反例区分，E §4.2）。

**[3] 浏览 / 搜索**

- 进入 `Skill Marketplace` 页面后，看到的页面骨架与 `SkillsPage` 完全一致：顶部 PageHeader（标题 + 内嵌 SearchInput + Refresh actions）+ 中段全宽列表 + 详情打开时右侧 SlidePanel(800 px) 滑入，主区右收 [D-13, A §1.4]。Refresh action 沿用现有 Button secondary + small size + RotateCw icon 形态（不新建按钮形态）。
- 列表项视觉密度与 SkillListItem 完全一致：图标 + 名称 + 描述 + 右段操作区 [D-13, A §3.1]。
- 列表项右段：类型 / 状态信息（Skill 列表是"`Installed` ✓ 标签 / Install 按钮"；MCP 列表是 stdio / HTTP 类型 badge + "`Installed` ✓ / Install 按钮"）[D-9, D-12, D-14]。badge 沿用现有 Badge 组件 status variant，使用 zinc 系中性灰，不引入新色。
- 排序：默认 by upstream popularity（skills.sh 的 leaderboard / MCP Registry 的 install 计数）；可切换 alphabet / recently updated。两个 marketplace 的排序文案差异化（Skill 的"By weekly installs" vs MCP 的"By GitHub stars"），反映上游本身差异 [D-15, B §10.4, R2-P2-2]。
- 搜索：PageHeader 内置的 SearchInput 即时过滤上游列表（不发新请求；仅本地过滤已加载列表项）。
- 筛选：列表上方一行包含 CategoryTreeDropdown（Ensemble 已有 Categories）+ Tag pill 多选（Ensemble 已有 Tags）—— 上游分类**不**进入 Ensemble 分类系统，只在详情面板显示 [D-15, R-33]。

**[4] 看详情**

- 用户单击列表项 → 右侧 SlidePanel(width=800) 滑入，主区右收（与 SkillsPage 完全同动效，A §8.4）[D-13]。
- 详情面板从上到下分**三块**（决策必读 / 参考信息 / 配置项），视觉优先级递减，避免输入与展示混排 [R2-P1-2]：
  - **决策必读**：图标 + 名称 + 一行短描述 + 主操作按钮 `Install`（首次进入态）+ 上次更新时间 + 安装数（如上游提供）—— 这三项决定用户是否相信这个资源。
  - **参考信息**：作者 + 上游分类与 tag（仅展示，不进入 Ensemble 分类系统）+ Source 行（扩展 SkillDetailPanel 现有 Source section，新增上游来源 + owner/repo link）。
  - **配置项**（仅 MCP 类型）：独立块，不与元数据混排。stdio 类显示需填字段说明 + Where to find this 链接（如有）；HTTP 类显示 `url`，OAuth 类附"安装后在 Claude Code 内 `/mcp` 完成认证 [Copy command]"提示 + 复制按钮 [D-12, R-29, R2-P2-1]。
- 主区：上游 README 的 Markdown 渲染；图片懒加载；图片加载失败显示占位（沿用现有占位形态，spec 阶段决策具体形态，OQ 跟踪 R2-P2-3）；异常 markdown 安全降级（保底显示纯文本，R-38）。
- 缓存命中时（数据可能已 12h 旧），列表上方显示"Last synced X ago"标签 + Refresh 按钮就近放置（沿用现有 actions 槽 + 现有 Button 形态），让用户感知数据新鲜度并可主动刷新 [R2-P1-4]。

**[5] 一键 Install**

- 用户在详情面板点 `Install` 按钮 → 按钮文案立即变 `Installing...` 灰态（disabled）。按钮沿用现有 Button primary variant + small size + 内置 loading state；不新建按钮形态 [D-14, R3-P0-2]。
- 列表项也接受同样的点击（不必先开详情）；行为完全相同。
- 后台执行：从上游下载（Skill = git clone / archive；MCP = 构造配置 JSON）→ 写入 `~/.ensemble/skills/<name>/` 或 `~/.ensemble/mcps/<name>.json` [D-7]。
- 完成：按钮变 `Installed` 灰态。Skill 类型立即可见；MCP 的 stdio 类型变 `Installed — needs setup`（直白文案，避免"configure env"技术黑话），并在按钮下方显示一行小字 inline 提示用户去配置区填环境变量 [D-12, R2-P0-3]。
- 异常路径：
  - **同名碰撞**（用户已有同名 Skill / MCP）：弹小型 Confirm Modal（沿用现有 Modal 组件 + small size + 现有按钮档位），三选项 `Restore from Trash`（如 Trash 中存在）/ `Replace existing` / `Cancel`，默认 Cancel；Replace 时把旧版本写入 Trash（沿用现有 Trash 流程，30 天可恢复，把"撤销"从用户认知负担变成系统兜底）[D-10, R-1, R2-P0-4, R1-P0-2]。
  - **网络失败**：失败态：(a) 顶部 error banner 沿用 SkillsPage 现有错误条机制；(b) 按钮恢复 `Retry`（保持 primary variant 可点击态，不引入"按钮变红"新视觉）[D-10, R-37, R3-P0-3]。失败态绑定到资源 entry 而非视图位置——用户切去其他页面再回来，列表项与详情按钮的失败态保持一致 [R1-P0-5]。
  - **安装中网络中断**：等同安装失败处理 + 自动清理半成品（不残留半下载文件），反馈与失败相同 [R1-P1-1]。
  - **上游不可达且缓存空**：列表显示 EmptyState（沿用现有 EmptyState 组件 + WifiOff icon + 中立文案 `Marketplace temporarily unavailable. This may be a network issue or upstream service outage.` + Retry 按钮，不再暗示问题在用户网络）[D-10, R2-P1-3, R3-P2-5]。
  - **上游可达但搜索/筛选无匹配**：与上一条不同，显示 `No results` + 筛选清空建议（区别于 WifiOff 形态）[R1-P2-1]。

**[5.5] 自动分类（异步、不阻塞）**

- 安装成功后，系统**对该单项**异步触发 Auto-Classify（不是全量重跑）[D-8, R-15]。
- 触发时机：安装成功的瞬间立即异步发起，不等待用户操作。
- **跨页反馈**：用户当时在 Marketplace 列表，分类完成后该项右段从 `Installing...` → `Installed` ✓ 灰态（hover 时 tooltip 显示 "Categorized as: [category]"），让用户即时看到分类结果，不必跑回 Skills 列表确认 [R2-P1-5]。
- **失败处理**：分类失败不阻断"装"成功——资源仍出现在 Skills / MCP Servers 列表中（无 Category / Tag）；该项 row 显示一个非阻断 inline 提示（如 "Auto-classify failed — assign manually"），用户点击展开手动分类入口 [R1-P0-4]。**不静默失败**——用户能感知到分类失败而不是误判产品分类不准。

**[5.6] 装完后的下一步引导**

安装成功的瞬间，详情面板顶部显示一次性 short-cut 引导（一次性、可 dismiss、不阻塞）[R2-P0-1]：

- "Installed in Skills →"（点击跳转 Skills 列表对应项）
- "Add to active Scene →"（如当前有关联 Scene；点击直接加入并 sync）

这是 PRD V2 主动承担"三段式契约 vs 用户原话装即用"心智差距的产品翻译——不假装契约不存在，而是用引导帮用户跨过去。

**[6] 加入 Scene**

- 资源进入 Skills / MCP Servers 列表后，**与本地资源平等**——可加入任意 Scene、可改 Category / Tag、可重命名图标、可在 More menu 中删除 [D-9, R-4]。
- 没有"启用"步骤（与 Obsidian 的 download/enable 分离不同，E §4.2）—— Ensemble 的"启用"概念由 Scene 与 Project 关系实现 [D-7]。

**[7] Sync 到 Project**

- 用户把 Scene 关联到 Project，Sync 走现有路径：Skill 通过符号链接进入 `<project>/.claude/skills/`；MCP 写入 `<project>/.mcp.json`。
- Marketplace 来源的资源因为是真实拷贝（不是 plugin 三跳 symlink），Sync 行为与本地资源完全一致 [R-32]。
- stdio MCP 若用户**未填环境变量**就 Sync，Project 详情面板显示该 MCP 状态为 "Missing required env vars"（产品层可见提示），而非用户在 Claude Code 终端遇到 cryptic 错误 [R2-P0-3, R1-P0-3]。

**[8] 在 Project 中用上**

- 用户跑 Claude Code（通过 Ensemble Launch 或 Finder Quick Action），新装资源立即可用 —— 与本地 Skill / MCP 同模式。

---

## 4. 功能范围 V1

V1 包含 8 项功能（≤8 项，符合 D-11 范围约束）。每项写"用户因此获得 Y"句式，**不是**"我们要支持 X"。

### V1 In #1：Sidebar 顶部 Marketplace 分组入口

> 用户在 Ensemble 任意页面，**1 次点击就能进入 Skill 或 MCP 的 Marketplace**——而不是去 Settings 找、不是离开 Ensemble 去网页找。入口位置与 sidebar 现有视觉语言完全一致：现有 hairline divider + uppercase 段标题 `MARKETPLACE` + 两个 nav item（`Skill Marketplace` / `MCP Marketplace`），与 Navigation/CATEGORIES/TAGS 同模式 [D-1, D-2]。

### V1 In #2：Skill Marketplace 浏览 / 搜索 / 筛选 / 详情 / 一键安装

> 用户**进入 Skill Marketplace 即可看到 skills.sh 上游的热门 Skill 列表**（按 upstream popularity 默认排序，可切 alphabet / recently updated）；可以用顶部搜索框过滤、用现有 Categories / Tags 作辅助筛选；点开详情看 README + 元数据；点 Install 安装到本地 [D-4, D-13, D-14, D-15]。

### V1 In #3：MCP Marketplace 浏览 / 搜索 / 筛选 / 详情 / 一键安装

> 用户**进入 MCP Marketplace 即可看到 Official MCP Registry 上游的 MCP server 列表**；列表项右段以 stdio / HTTP 类型 badge 标识；详情面板内据类型差异化显示配置区（stdio 类必填字段说明 + Where to find this 链接；HTTP 类 url + OAuth 提示含 [Copy command]）；点 Install 安装到本地 [D-5, D-12, D-13, D-14]。

### V1 In #4：安装到 Ensemble 自有管理路径（`~/.ensemble/`）

> 用户**安装的 marketplace 资源直接落到 Ensemble 已有的管理路径**——Skill 落到 `~/.ensemble/skills/<name>/`（真实拷贝）、MCP 落到 `~/.ensemble/mcps/<name>.json`。不写 `~/.claude.json`、不动 `~/.claude/plugins/`，与 Claude Code plugin 体系完全独立、互不污染 [D-3, D-7, R-9, R-10]。

### V1 In #5：安装后单项自动 Auto-Classify

> 用户**安装一个新资源后立即看到它分类好出现在 Skills / MCP Servers 列表中**——不必点 Auto Classify 按钮、不必手动选 Category 与 Tag。系统对**该单项异步触发**分类（不是全量重跑），分类完成后伴随现有 spinner → checkmark → fade-out 动效；分类失败时该项 row 显示非阻断 inline 提示 "Auto-classify failed — assign manually"，用户能感知失败并手动改 [D-8, R-15, R1-P0-4]。

### V1 In #6：离线降级（24h 缓存 + EmptyState + Retry）

> 用户在网络不可用时**不会看到一个空白卡死的页面**——Marketplace 列表渲染本地 24h 缓存（缓存命中时列表上方显示 "Last synced X ago" 标签 + Refresh 按钮就近放置，让用户感知数据新鲜度）；缓存为空时显示 EmptyState（沿用现有 EmptyState 组件 + 中立文案不暗示问题在用户网络）；**已安装资源不受影响**，照常出现在 Skills / MCP Servers 列表 [D-10, R-30, R-39, R2-P1-3, R2-P1-4]。

### V1 In #7：与现有 Skills / MCP Servers 列表的闭环（marketplace 来源平等参与）

> 用户**不需要为 marketplace 来源的资源学一套新的管理心智**——marketplace 来源的资源进入 Skills / MCP Servers 列表后，与本地、plugin 来源的资源平等显示（不沉底，不特殊排序，不分两个列表），可加入任意 Scene、可 sync 到 Project、可改分类与图标、可在 More menu 中删除 [D-3, D-7, D-9, R-4]。

### V1 In #8：Marketplace 列表 Install / Installing / Installed 状态切换 + 失败态绑定

> 用户**在 Marketplace 列表中一眼看到哪些资源已经装过**——避免重复点 Install 触发"已存在"错误。状态机：未装 → `Install`（沿用 Button primary variant + small size）；点击中 → `Installing...`（沿用 Button 内置 loading prop）；已装 → `Installed` ✓（沿用 Button disabled state，列表项不再触发安装动作）；失败 → 顶部 error banner（沿用现有错误条）+ 按钮恢复为 `Retry` 可点击态。**失败态绑定到资源 entry 而非视图位置**，跨页面切换持久化直到用户点 Retry 或下一次成功安装 [D-14, R3-P0-2, R3-P0-3, R1-P0-5]。

---

## 5. 信息架构与关键交互

### 5.0 首次进入态

新用户第一次进入 Skill / MCP Marketplace 时：

- 顶部一次性 onboarding banner（"New here? These are popular Skills others have installed this week"），可 dismiss、不阻塞主流程；dismiss 后不再显示
- top-3 popularity 视觉强调（沿用现有 Badge 组件 status variant + 现有 popularity 数字字号档位，不引入新视觉），让用户有"从这里开始"的 cue
- 不做 onboarding tooltip 走马灯（与 Linear / Things 3 简洁审美一致；多步引导反而增加首次认知负担）

这是 V1 对"Marketplace 的目标用户群之一是新用户"承诺的产品翻译 [R2-P0-2]。一次性、轻量、可跳过——与 macOS-native 极简语言一致。

### 5.1 Sidebar 改造（V1 唯一的导航变更）

V1 仅在 sidebar 顶部新增一个独立分组，其他不动：

```
┌───────────────────────────────┐
│ Header（traffic lights + Refresh）│
├───────────────────────────────┤      ← 新增 hairline divider（沿用 sidebar 现有同款）
│ ─ MARKETPLACE（uppercase 段标题）─│      ← 新增段标题
│   • Skill Marketplace          │      ← 新增 nav item
│   • MCP Marketplace            │      ← 新增 nav item
├───────────────────────────────┤      ← 现有 hairline divider（保留）
│ ─ NAVIGATION（5 项保留不动）─  │
│   • Skills          (count)    │
│   • MCP Servers     (count)    │
│   • CLAUDE.md       (count)    │
│   • Scenes          (count)    │
│   • Projects        (count)    │
├───────────────────────────────┤
│ ─ CATEGORIES（保留不动）        │
├───────────────────────────────┤
│ ─ TAGS（保留不动）              │
├───────────────────────────────┤
│ Settings（footer 齿轮）         │
└───────────────────────────────┘
```

**严格按 `.claude/rules/design-language.md` + 现有 SkillsPage / McpServersPage 的视觉密度；不引入新 token 或新组件**。新增 hairline divider 沿用 sidebar 现有 Nav→Categories / Categories→Tags 同款 hairline（具体颜色 token 由 spec 阶段对齐到 design-language Rule + Sidebar 实现，PRD 不写 hex 字面值）；段标题位于 hairline 之下（沿用 Categories / Tags 段标题先例）；nav item 行高、字号、icon 处理与现有 5 项 Navigation 同款 [D-1, R-11, R-16, R3-P0-1]。

**为什么不在现有 Navigation 内并列**：用户原话明确"在 Skill 上面再加一个分隔线"，字面就是顶部独立分组——Marketplace 是"系统级入口"（与 Inbox / Today 同级），与"用户的内容容器"（Skills / Categories / Tags）应分层 [E §Q9, D-1]。

### 5.2 Marketplace 页面布局

`Skill Marketplace` 与 `MCP Marketplace` 两个页面**完全沿用 SkillsPage / McpServersPage 的布局骨架**（D-13）：

- 顶部 PageHeader（高度沿用 SkillsPage PageHeader / Sidebar header 同款 + title + 内嵌 SearchInput + actions：Refresh 按钮沿用现有 Button secondary variant + small size + RotateCw icon，不新建形态）
- 中段全宽列表区
- 右侧 SlidePanel(width=800) 详情，主区收缩动效沿用 SkillsPage 现有
- 不使用 ListDetailLayout（保持与 SkillsPage 心智一致）[D-13, A §1.1]

**不抽象新组件**——MarketplaceListItem 复制 SkillListItem / McpListItem 的容器骨架（与现有 SkillListItem ↔ McpListItem 已镜像复制的模式一致）[D-13, A §3.3]。

### 5.3 列表项视觉

列表项**完全沿用 SkillListItem / McpListItem 的视觉密度**（容器、字号、间距、icon 处理）[D-13, A §3.3]，仅替换右段为：

- **Skill Marketplace 列表项**：右段 = `Installed` ✓ 标签 / `Install` 按钮（互斥）+ 上游 popularity 数字（沿用现有 sidebar count / tooltip body 同档字号，不引入新档）
- **MCP Marketplace 列表项**：右段 = stdio / HTTP 类型 badge（沿用现有 Badge 组件 status variant，使用 zinc 系中性灰）+ `Installed` ✓ / `Install` 按钮

**已安装态在列表中如何显示**：右段直接显示一个带 checkmark icon 的 `Installed` 灰色文字标签（沿用现有 Badge status variant + lucide-react `Check` icon；不再使用 plugin badge 同位置的左段右上角蓝点——蓝点位置已被 plugin 来源占用，再叠会冲突）[D-9, R-11, A §7.4]。术语统一为英文 `Installed`（与 Button 文案一致）[R3-P1-1]。

**列表项的 compact 模式动效必须保留**——SkillListItem 的现有 compact 模式 opacity / max-width 折叠动效（具体时长 / 缓动沿用 design-language Rule §Constraints 的"list↔detail compact / SlidePanel"通用 inline easing，PRD 不复述字面值）必须在 marketplace 列表项中镜像，否则用户从详情切回列表时会感到节奏断层 [R-23, A §8.5, R3-P1-6]。

### 5.4 详情面板节奏

用户单击列表项 → SlidePanel 滑入，主区右收（与 SkillsPage 完全同动效，沿用 design-language Rule "list↔detail compact / SlidePanel"通用缓动）[D-13, R3-P1-6]。

详情面板从上到下分**三块**（决策必读 / 参考信息 / 配置项），视觉优先级递减，避免输入与展示混排 [R2-P1-2]：

1. **决策必读**（最高优先级）：图标（IconPicker 锚点定位）+ 名称 + 一行短描述 + 主操作按钮 `Install` / `Installed`（沿用 Button primary variant + small size + 内置 loading / disabled state）+ 上次更新时间（相对时间或绝对时间，i18n 决策 OQ 跟踪）+ 安装数（如上游提供）—— 这三项决定用户是否相信这个资源 [D-14, R3-P0-2]
2. **参考信息**（中等优先级）：作者 + 上游分类与 tag（仅展示，不进入 Ensemble 分类系统）+ Source 行（扩展 SkillDetailPanel 现有 Source section，新增上游来源标签 + owner/repo link，沿用现有 anchor 样式）—— 用户决策时的辅助信息 [D-15, R-33, R3-P2-4]
3. **README 主区**：上游 README 的 Markdown 渲染；图片懒加载；图片加载失败显示占位（沿用现有占位形态，spec 阶段决策具体形态，OQ 跟踪 R2-P2-3）；异常 markdown 安全降级 [R-38]
4. **配置项**（仅 MCP 类型；视觉独立块，不与元数据混排）：
   - **stdio 类**：明确显示 "Required environment variables (this MCP won't work without them)" 区段头 + 字段名 + 字段说明 + Where to find this 链接（如有）+ 输入框（用户在此填写并保存）+ 保存动作（即时持久化 / 显式 Save 按钮的具体形态由 spec 阶段决策；产品契约 = 用户感知"填了就保存"而非"填了不知道有没有保存"）
   - **HTTP 类**：显示 url；OAuth 类附加 "After installing, run `/mcp` in your Claude Code session to complete authentication. [Copy command]" + 复制按钮（沿用现有 Button secondary 形态）[D-12, R-29, R2-P2-1]
   - **stdio 配置区交互契约**：(a) 编辑入口 = 详情面板配置项区可直接点击输入框；(b) 保存动作 = 用户感知"填了就保存"（具体显式 Save vs 即时 spec 决策）；(c) 按钮状态映射 = 用户已填全部必填字段 → 按钮从 `Installed — needs setup` 变 `Installed`；(d) 错误反馈 = 必填字段缺失时该字段红色边框 + 字段下方说明 [R1-P0-3]

**缓存命中提示**：列表上方一行显示 "Last synced X ago" 标签 + Refresh 按钮就近放置（沿用现有 PageHeader actions 槽 + 现有 Button 形态），让用户感知数据新鲜度并可主动刷新；缓存命中与在线获取的视觉差异最小化，但用户始终能看到 "Last synced" 提示 [R2-P1-4]。

### 5.5 安装反馈节奏

完全采用**就地按钮状态机**——`Install → Installing... → Installed`（D-14），按钮沿用现有 Button primary variant + small size + 内置 loading / disabled state；不新建按钮形态 [R3-P0-2]：

- 不弹 Modal（避免 visual hierarchy 加层）
- 不显示进度条（Skill / MCP 体量小、秒级完成；超过 N 秒的进度反馈留 V1.5 评估）
- 不开 Toast 通知

**失败反馈职责分工**（按钮 vs banner，互不重叠）[R2-P1-1]：

- **按钮 = 局部反馈**：用户在哪里点击就在哪里反馈。按钮恢复为 `Retry`（保持 primary variant 可点击态，不引入"按钮变红"新视觉）[R3-P0-3]
- **error banner = 全局反馈**：沿用 SkillsPage 现有错误条机制；用户在详情面板停留时不重复显示（避免叠加），关闭 SlidePanel 后才出现

**失败态绑定与持久化**[R1-P0-5]：失败态绑定到资源 entry（资源标识层）而非视图位置（按钮 DOM）—— 用户在列表项触发安装、失败后切去其他页面、再回来，列表项与详情按钮仍显示同一失败态（同一资源对应同一态）；失败态持久化直到用户点 Retry 或该资源下一次成功安装。

主入口**在 SlidePanel 详情面板顶部按钮**（用户先看 README 再决定装）；列表项右段的 Install 按钮**也接受点击**（不必先开详情，给已知道想装什么的老用户最短路径）；列表项 Install 按钮 hover 时显示 README 第一行作为预览（给"未读详情就安装"的用户一次温和的二次确认，不是 Modal 是行内 hover 提示）[R2-P1-6]。

### 5.5.1 安装成功的 short-cut 引导

安装成功的瞬间，详情面板顶部显示一次性 short-cut 引导（一次性、可 dismiss、不阻塞主流程）[R2-P0-1]：

- "View in Skills →"（点击跳转 Skills 列表对应项，让用户即时确认资源已进入管理）
- "Add to active Scene →"（如当前用户在 Ensemble 工作流中有 active Scene 概念；点击直接加入并 sync）

这是 V2 主动承担"三段式契约 vs 用户原话装即用"心智差距的产品翻译——不假装契约不存在，而是用引导帮用户跨过三段式心智门槛。引导本身可关闭、可不显示，不强制；用户能学会三段式后短链就成为多余的纸花。

### 5.6 同名碰撞处理

用户安装时碰到本地已有同名资源（Skill 同名或 MCP 同名 + 同 scope），系统弹小型 Confirm Modal（沿用现有 Modal 组件 + small size，按钮档位：`Replace existing` 用 Button primary、`Restore from Trash` 与 `Cancel` 用 secondary；默认焦点在 Cancel）[R3-P1-4]：

```
<name> already exists in your library.

[ Restore from Trash ]   [ Replace existing ]   [ Cancel ]
```

**三种情形对应三种行为** [R-1, D-10, R1-P0-2, R2-P0-4]：

- **本地仍存在 + Trash 中无条目**：仅显示 `Replace existing` 与 `Cancel`；选 Replace 时**把旧版本写入 Trash**（沿用现有 Trash 流程，30 天可恢复，不立即丢失用户改动）[R2-P0-4]。`Replace existing` 等价于物理拷贝覆盖 + metadata 继承（保留用户的 Category / Tag / 自定义图标）[R1-P1-5]。
- **Trash 中存在条目**（用户曾删除过同名资源）：显示三选项，**默认聚焦 `Restore from Trash`**（最低惊讶——用户的可能意图是"想找回我之前删的那个"）[R1-P0-2]。
- **Cancel 永远是最安全选项**：用户不必明确点击就可以关闭 Modal 而不发生任何变化。

**为什么不静默覆盖**：用户既有数据安全；H §3-条款 2 已发现现有 `dest_skill_path.exists()` 短路逻辑会把"已存在"误算作"已导入"——marketplace 不能延续此问题，必须在产品层显式定义 [R-1]。

**为什么 Replace 走 Trash 而非直接覆盖**：Marketplace 的批量浏览属性显著放大误点风险；用户在浏览节奏中习惯性按 Enter 或快速点 Replace 不应导致永久数据丢失。把"撤销"从用户认知负担变成系统兜底能力（沿用 macOS Trash 心智）[R2-P0-4]。

### 5.7 离线 / 错误状态

| 场景 | 用户看到什么 |
|---|---|
| 上游可达、首次加载 | 加载中（沿用 SkillsPage 加载态）→ 列表渲染 |
| 上游可达、已加载 | 列表渲染（来自上游） |
| 上游不可达、缓存命中 | 列表渲染缓存内容；列表上方显示 "Last synced X ago" 标签（沿用现有字号档位、低饱和提示色）+ Refresh 按钮就近放置 |
| 上游不可达、缓存为空 | EmptyState：沿用现有 EmptyState 组件 + WifiOff icon + 中立文案 `Marketplace temporarily unavailable. This may be a network issue or upstream service outage.` + Retry 按钮（沿用 Button secondary variant + small size） |
| 上游可达、搜索/筛选无匹配 | `No results` 形态 + 筛选清空建议（与 WifiOff 形态显式区分，避免歧义） |
| 安装失败 | 顶部 error banner 沿用 SkillsPage 现有错误条；详情按钮恢复为 `Retry` 可点击态；按钮与 banner 不重叠展示（用户在详情面板时不显示 banner，关闭 SlidePanel 后才出现）|
| 安装中网络中断 | 等同安装失败处理 + 自动清理半成品（不残留半下载文件） |

**Refresh 触发时的视觉反馈** [R1-P1-6]：用户点 Refresh，**当前列表保持显示**（不清空 → loading），后台拉取上游后无缝替换列表内容；触发期间 Refresh 按钮 disabled + spinner，结束后恢复。这是为保护用户在浏览节奏中不被打断。

已安装资源**永远不受网络影响**——Skills / MCP Servers 列表照常工作，与 Marketplace 列表彼此独立 [D-10, R-30, R-39]。

### 5.8 列表筛选与排序

**列表上方一行**包含简化版过滤器（D-15）：

- 左：CategoryTreeDropdown（Ensemble 已有 Categories；选 ALL 不过滤）
- 中：Tag pill 多选（Ensemble 已有 Tags；多选 OR 关系）
- 右：Sort dropdown，文案按上游差异化：
  - Skill Marketplace：默认 `By weekly installs`（反映 skills.sh 自身口径），可切 `Alphabetical` / `Recently updated`
  - MCP Marketplace：默认 `By GitHub stars`（反映 Official MCP Registry 自身口径），可切 `Alphabetical` / `Recently updated`
  - 两个 marketplace 排序文案不同是正确的——它反映上游本身差异 [R2-P2-2]

**为什么不做 VSCode 的 `@`-prefix 命令式过滤**：Ensemble 用户群非工程师场景比例不低；命令式过滤违反 macOS-native 简洁审美；现有过滤器已足够覆盖 80% 用例 [E §4.3]。

**已知开放点**：上游分类与 Ensemble Categories 语义可能不一致——用户的 Categories 是基于自己**已装资源**建立的，marketplace 内**未装**资源可能不属于任何已有 Category。V1 用 Ensemble Categories 作筛选可能产品价值有限，实测后 V1.5 可调整为"按上游 category 筛选 + Ensemble 分类只在已安装 tab 内"[D-15 Medium 置信度, §10 Open Questions]。

### 5.9 视觉一致性总则

**严格按 `.claude/rules/design-language.md` + 现有 SkillsPage / McpServersPage 的视觉密度；不引入新 token 或新组件**。

具体而言：

- 不新建颜色（使用现有 zinc 系 + accent + status 集）
- 不新建动效曲线（使用现有 `--ease-drag*` / `--duration-drag-*` token；按钮态切换沿用 Button 组件现有过渡，design-language Rule §Constraints "button transitions" 归属 ease-out keyword，不在 PRD 中复述时长字面值）[R3-P0-4]
- 不新建 Modal / Page 形态（沿用 SkillsPage / McpServersPage 骨架）
- 不新建分组形态（sidebar Marketplace 分组沿用现有 hairline + uppercase 段标题）
- Plugin badge 蓝色现状违例（R-21）是既有代码库技术债务，V1 不引入第二个违例（不在 V2 PRD 解决该现状违例 — 超出 V1 scope）

任何"为了 marketplace 视觉差异"的新增都需要先证明 design-language Rule 不能覆盖且 SkillsPage 模式不能覆盖；此为 V1 的视觉硬约束 [D-13]。

---

## 6. 数据源策略

### 6.1 大策略：自有路径 + 上游目录

V1 采用**「自有路径 + 上游目录」双层架构**（D-3）：

- **上游目录**：通过 HTTP 拉取上游列表元数据（leaderboard / server registry / 描述 / 作者等），用本地 24h 缓存做离线降级。
- **自有路径**：所有 marketplace 安装动作的物理落地都在 Ensemble 自有路径 `~/.ensemble/skills/` 与 `~/.ensemble/mcps/`，**不写 `~/.claude.json`、不动 `~/.claude/plugins/`**。

**不复用 Claude Code plugin 体系作为安装通道**——`claude plugin install` 的 headless 路径未官方支持（issue #12840 仍 Critical 开放，G §6.2, R-9）；走 plugin 路径会立即继承"Scene 中 plugin 启用时自动 disable"陷阱（H §3-条款 4, R-10）。Marketplace 与 Claude Code plugin 体系**并行、不替代**：用户继续可以通过现有 ImportSkillsModal Plugin tab 导入 plugin 来源资源，与 Marketplace 互不冲突 [D-3]。

### 6.2 Skill 主数据源：skills.sh

**主源 = skills.sh / officialskills.sh**（Vercel Labs 维护的开放 skill 生态）[D-4, B §1, §5]。

**为什么是它**：用户原话明确点名（00_understanding §1）；当前唯一同时满足"权威 + 覆盖广度（91k+） + 元数据足够丰富"的源；与 Claude Code plugin 机制完全解耦，与 Ensemble 自有路径策略契合 [B §8]。

**接入路径**：用 GitHub API 取每个 Skill 的 SKILL.md 与 repo 元数据（作者 / 描述 / 上次更新）；用网页或 CLI 抓取 install 数与 leaderboard 名单（skills.sh 没有公开文档化 REST API，B §1.2, R-7）；24h 本地缓存覆盖以上两类数据。

**备选源**：GitHub API 直查（主源不可达时降级，使用本地缓存的 owner/repo 名单）[D-4]。

**已知风险**：无文档化 REST API → 接入工程复杂度高（接入侧风险，不是产品风险）[R-7]；Vercel 单点击穿可能（站点下线 / 改前端 / 限流）→ V1 用 GitHub API 备选 + 24h 缓存缓解 [R-8]；GitHub API rate limit（无 token 60 req/h）→ 列表初次加载策略需限制 + 渐进 [R-24]；"weekly installs" / "agentAdoption" 是 skills.sh 私有数据，纯 GitHub API 无法替代，需 fallback 到网页抓取 [R-25]。

### 6.3 MCP 主数据源：Official MCP Registry

**主源 = Official MCP Registry**（`registry.modelcontextprotocol.io`，REST `/v0.1/servers`，Anthropic + GitHub + PulseMCP + Microsoft 共同维护）[D-5, C §10.1]。

**为什么是它**：唯一既权威又结构化的源（vendor-neutral）；在 schema 层本体级区分 stdio 与 HTTP（`packages` vs `remotes`）；提供结构化 args / env vars 字段，允许 Ensemble 在详情面板自动渲染配置区 [C §3, D-12]。

**备选源 = Glama**（`glama.ai/mcp/servers`）[D-5]：自我表述 superset；公开 REST 无需 auth；用于主源不可达时降级或长尾扩展（Official Registry 覆盖 ~500，Glama 覆盖 ~22k，R-12）。

**Smithery 留 V1.5 评估**——商业 API 稳定性风险（C §2.2, R-28），不进 V1 主路径。

**已知风险**：主源覆盖度有限（~500），用户搜索"我想要的 server"可能找不到 [R-12]——V1.5 评估引入 Glama 长尾；上游 server 的 `repository.url` 失效时，Ensemble 已展示但安装时才报错，体验断层 [R-18]。

### 6.4 上游分类与 Ensemble 分类的关系

**上游分类与 tag 不进入 Ensemble Categories / Tags 系统**——V1 仅在详情面板"展示"上游分类（作为静态标签，无交互）；筛选用 Ensemble 自己的 Categories / Tags（D-15）。

**为什么这样**：

- 用户原话"不打算自己建设映射表"：把 marketplace 上游分类作为持久 Ensemble 分类等于自建映射表 → 违反原则
- 上游分类与 Ensemble 用户分类的语义错配：用户分类是基于自己**已装**资源建立的，把 marketplace 内未装资源强行套进可能产生大量"None of the above"分类 → 违反"如无必要勿增实体"

**实测中的开放点**：当用户用 Ensemble Categories 筛选 marketplace 列表时，如果**未装**资源不属于任何已有 Category，是否产品价值有限——见 §10 Open Questions[R-33]。

### 6.5 缓存策略（产品层）

V1 采用 **24h TTL 本地缓存**——

- 触发刷新时机：(1) Marketplace 页面打开时若缓存 > 24h 且网络可达；(2) 用户在 PageHeader 点 `Refresh` 按钮强制刷新
- 缓存命中：直接渲染，不发请求（保证打开速度）；同时显示 "Last synced X ago" 提示，让用户感知数据新鲜度（不再"不区分"上游 vs 缓存）[R2-P1-4]
- Refresh 触发：当前列表保持显示，后台拉取后无缝替换（不清空 → loading 体验断层）[R1-P1-6]
- 缓存未命中且无网络：渲染 EmptyState（D-10）
- TTL 选择 24h 是产品决策——更长会让用户看不到上游新内容；更短会增加网络压力 [R-30]

PRD 不写 TTL 实现细节（缓存目录路径、文件 schema、刷新机制等），那是 spec 阶段的事。

### 6.6 数据源稳定性应对（产品层声明）

每类风险的产品层缓解（不是 spec 实现）：

| 风险 | 产品层缓解 |
|---|---|
| skills.sh 下线 / 改前端 / 限流 [R-8] | 24h 缓存让用户在主源不可用时仍能浏览近 24h 内容；备选 GitHub API 直查；V1.5 评估 awesome-list 备份 |
| GitHub API rate limit [R-24] | 列表初次加载只取 top-N（产品决策点：top-100 起步，滚动加载 V1.5）[R-39, OQ-1] |
| Official MCP Registry 覆盖不足 [R-12] | V1 接受边界；V1.5 评估引入 Glama 长尾覆盖 |
| 上游 repository.url 失效 [R-18] | 安装失败时清晰错误反馈（顶部 error banner + 按钮恢复为 Retry）；不预先校验所有 url（成本不可承受） |
| 上游 README 异常 markdown [R-38] | 详情主区 markdown 渲染必须安全降级（保底显示纯文本）；图片加载失败显示占位（OQ 跟踪具体形态）|

---

## 7. 闭环定义

### 7.0 为什么是三段式而不是装完即用

**用户原话期望**："核心想要做到就是能够直接安装到我们的管理路径，然后直接能够分发、使用、分类，让它系统的闭环。"

按字面理解，用户期望"装 = 即用"。但 Ensemble 的 Scene 模型决定了"装"必须分三段：装到管理路径（资源出现在 Ensemble 内）→ 加进 Scene（用户决定哪些资源在哪些场景下被使用）→ Sync 到 Project（资源真正部署到目标项目）。这不是 PRD 在重述用户原话——而是 Scene 模型本身存在的产品意义。

**Scene 模型为什么必要**：用户在 5–20 个 Project 间切换，不同 Project 需要不同的 Skill / MCP / CLAUDE.md 组合（"Linear 自动化"项目不需要 PDF 处理 Skill，"研究助手"项目不需要部署相关 MCP）。如果"装即在 Claude Code 全局启用"，则用户安装的所有 Skill / MCP 会在所有 Project 中同时存在，产生大量噪音并污染 Project 上下文。Scene 模型就是为了让用户对"哪些资源在哪些场景下被使用"有显式控制权。

**V2 如何处理这个心智差距** [R2-P0-1]：PRD 不假装这个差距不存在；不强行把 Scene 模型塞给用户。具体策略：

1. **在产品文档与界面中显式翻译契约**：§7.1 三段式表 + §7.0 这一段（PRD 内）+ 应用内安装成功的 short-cut 引导（§5.5.1）
2. **用引导承担心智门槛**：安装成功的瞬间提供 "View in Skills →" 与 "Add to active Scene →" short-cut，降低三段式的认知摩擦
3. **保留用户主动权**：short-cut 一次性、可 dismiss，用户学会三段式后短链就成为多余的纸花，不会强制阻塞

不引入"Default Scene"概念——这是另一个数量级的产品决策（违反 D-11 V1 范围、违反商减），需 V1.5/V2 单独评估。

### 7.1 闭环的产品契约：三段式

V1 的核心产品契约是**「装 → 选 → 部署」三段式**（D-7），对应 §3.2 旅程的 [5] / [5.5] / [6] / [7]：

| 阶段 | 动作 | 物理操作 | 用户感知 |
|---|---|---|---|
| **装**（Install） | 从 Marketplace 装到 Ensemble | 写入 `~/.ensemble/skills/<name>/` 或 `~/.ensemble/mcps/<name>.json`；自动 Auto-Classify 异步触发于 [5.5] | 资源出现在 Skills / MCP Servers 列表；分类异步出现，不阻断后续 Scene 编排 |
| **选**（Compose） | 把资源加入 Scene | data.json 中 Scene 的 skillIds / mcpIds 增加引用 | 资源在 Scene 详情中显示 |
| **部署**（Sync） | 把 Scene 部署到 Project | `<project>/.claude/skills/` 加 symlink；`<project>/.mcp.json` 写入；CLAUDE.md 拷贝到目标 | 在 Project 跑 Claude Code 时立即可用 |

**关键产品契约**：

- "**装 ≠ 在 Claude Code 全局启用**"——Marketplace 装完不会立即在 Claude Code 全局生效（这是 Scene 模型的存在意义，§7.0）。如果用户想"装即用"，他们需要把资源加进默认 Scene 并 sync 到 Project [D-7, R-20]
- "**装 = 在 Ensemble 内激活**"——一旦装成功，资源就成为 Ensemble 的一等公民（与本地、plugin 平等），可加 Scene、可改分类、可重命名图标、可删除 [D-9, R-4]

### 7.2 Auto-Classify 的衔接

安装成功后，系统对**该单项**异步触发 Auto-Classify [D-8, R-15]：

- **触发时机**：安装成功瞬间立即异步发起，不阻塞用户操作
- **作用域**：仅该新装项（不全量重跑——避免性能损耗，避免改动用户已确认的旧分类）
- **跨页反馈**：Marketplace 列表项右段从 `Installing...` → `Installed` ✓ 灰态，hover 时 tooltip 显示 "Categorized as: [category]"，让用户在 Marketplace 中即时看到分类结果而不必跑回 Skills 列表确认 [R2-P1-5]
- **失败处理**：分类失败不阻断"装"成功——资源仍出现在 Skills / MCP Servers 列表中（无 Category / Tag）[R1-P0-4]

**分类失败的用户感知** [R1-P0-4]：分类失败时，该项 row（在 Skills / MCP Servers 列表）显示一个非阻断 inline 提示——"Auto-classify failed — assign manually"（沿用现有 inline 提示形态），用户点击展开手动分类入口（CategoryTreeDropdown + Tag 选择）。**不静默失败**——用户能感知到分类失败并知道下一步该做什么，避免误判产品分类不准。

**为什么是单项不是全量**：现有 Auto-Classify 按钮是用户主动触发的全量批处理（A §6），保留供"用户主动重分类"使用；marketplace 安装是新增动作，单项触发性能与心智都最优 [D-8]。

**settings 协议**：`autoClassifyNewItems: boolean` flag 已在 settings.json 存在但当前未被任何代码消费 [R-22, A §6]。V1 启用该 flag 并默认 `true`；用户可在 Settings 关闭。

### 7.3 与现有 plugin 资源的关系

**Marketplace 来源 ≠ Plugin 来源**——V1 把 `installSource` 枚举从二态扩展到**三态**（D-9, R-2）：

| installSource | 来源 | 物理位置 | UI 标识 |
|---|---|---|---|
| `'local'` | 用户本地 / 用户从 ~/.agents/skills/ 导入 | `~/.ensemble/skills/<name>/`（拷贝或 symlink） | 无 badge |
| `'plugin'` | Claude Code plugin（通过 ImportSkillsModal Plugin tab 导入） | `~/.claude/plugins/...`（间接通过 plugin） | 列表项左段右上角 plugin badge（现有，保留） |
| `'marketplace'` | Ensemble Marketplace 安装（V1 新增） | `~/.ensemble/skills/<name>/`（真实拷贝） | 列表项**不**加 badge；详情面板 Source 行显示来源 |

**关键产品契约**：

- Marketplace 来源资源**与本地资源平等**——可加任意 Scene、可 sync、可改分类与图标、可删除 [D-9]
- Marketplace 来源资源**不沉底排序**——现有 plugin 来源资源在 SkillsPage / McpServersPage 列表中沉底（H §3-条款 3），但这是 plugin 体系特有逻辑；marketplace 资源平等参与默认排序 [R-4]
- **不在列表项左段叠 marketplace badge**——现有 plugin badge 位置已被占用，再叠会冲突；marketplace 来源信息只在详情面板"Source"行展示 [D-9, R-11]

### 7.4 在 Marketplace 列表中识别"已装" — Single Source of Truth 契约

虽然 marketplace 资源进入 Skills / MCP Servers 后与本地平等，但**用户在 Marketplace 列表中浏览时仍需要一眼识别"哪些我已装过"**——避免重复点 Install 触发"已存在"错误（R-1）。

**已装态判定的产品契约**（Single Source of Truth）[R1-P0-1]：

> Marketplace 列表中某项的 `Installed` 状态当且仅当三个条件**同时**成立：
> 1. Ensemble 自有路径下存在该资源条目（`~/.ensemble/skills/<name>/` 或 `~/.ensemble/mcps/<name>.json`）
> 2. data.json 中存在该资源的 metadata entry
> 3. 该资源不在 Trash 中

**这三者必须共同成立**才显示 `Installed`；任一不成立则恢复 `Install`（或在第 2 类不成立时按"上游有新版"提示 `Update available`，V1.5 评估）。

**跨页面状态自动同步**：Marketplace 列表与 Skills / MCP Servers 列表共享同一 SSoT；用户从 Skills 列表 Delete（进 Trash）后回到 Marketplace，该项自动从 `Installed` 切回 `Install`；从 Trash 恢复后再切回 `Installed`。**用户从不会看到"删了又出现"或"装了不知道哪里看"的状态错位**。

**实现层提醒**（仅作为产品契约的边界声明，不是技术 spec）：spec 阶段必须避免现有 `dest_skill_path.exists()` 短路逻辑（H §3-条款 2 已识别为 R-1）—— 单凭物理路径存在判定"已装"不充分，必须三者共同成立。

V1 列表项右段的视觉表达：未装态显示 `Install` 按钮；已装态显示带 checkmark 的 `Installed` 灰态文字标签（沿用 Badge status variant + lucide-react Check icon）[D-9]。

### 7.5 stdio vs HTTP MCP 的差异化闭环

stdio 与 HTTP 两类 MCP 在闭环中行为不同（D-12, R-13, R-29）：

| 类型 | 装完即用？ | 用户后续动作 | 闭环到部署的差异 |
|---|---|---|---|
| **HTTP** （如 Linear, Sentry） | 通常是 | 多数 OAuth 类需在 Claude Code 内 `/mcp` 完成认证（详情面板提示含 [Copy command]）；V1 不感知 Claude Code 内 OAuth 状态，提示文案恒显，V1.5 评估认证状态回流 [R1-P1-4] | Sync 时无差异 |
| **stdio** （如 puppeteer, browserbase） | **不是** | 必须填环境变量（API key 等）才能跑；详情面板"配置区"显示需填字段 + Where to find this 链接 + 输入框 + 保存动作 | Sync 时与本地 stdio MCP 同模式 |

**产品反馈**：stdio 类装完按钮变 `Installed — needs setup` 而非纯 `Installed`，按钮下方一行小字 inline 提示用户去配置区填环境变量；HTTP 类装完变纯 `Installed` [D-12, R2-P0-3]。

**stdio 配置区交互契约** [R1-P0-3]：

- **编辑入口** = 详情面板配置项区可直接点击输入框（不必额外点"Edit"按钮）
- **保存动作** = 用户感知"填了就保存"（具体是即时 vs 显式 Save 按钮形态由 spec 阶段决策；产品层契约 = 用户不需要担心"我填了不知道有没有保存"）
- **按钮状态映射** = 用户已填全部必填字段时，详情面板主操作按钮从 `Installed — needs setup` 变 `Installed`
- **错误反馈** = 必填字段缺失时该字段红色边框 + 字段下方说明（沿用现有错误提示形态）

**用户跳过 env 配置直接 Sync 到 Project 的处理** [R2-P0-3]：在 Project 详情面板显示该 MCP 状态为 `Missing required env vars`（产品层可见提示），让用户在 Ensemble 端就知道哪个 MCP 配置不全，而不是在 Claude Code 终端遇到 cryptic 错误。

### 7.6 删除、卸载与 Trash 期间的重装语义

V1 的删除入口**只在 Skills / MCP Servers 列表项的 More menu 中**（沿用现有路径，A §3.1）。**Marketplace 列表项不提供删除 / 卸载入口**——避免 Marketplace 列表项变成 Skills 列表的镜像（信息冗余，R-19）。

用户卸载 marketplace 来源的资源走与本地资源完全相同的路径：从 Skills / MCP Servers 列表选中 → More menu → Delete → 进 Trash → 30 天后清除（沿用现有 Trash 流程，R-26）。

**Trash 期间的重装语义** [R1-P0-2]：

- 用户从 Marketplace 重新点 Install 同名资源时，系统检查 Trash 是否含该资源条目
- **Trash 中存在条目** → 弹同名碰撞 Modal，显示三选项 `Restore from Trash` / `Replace existing` / `Cancel`，**默认聚焦 Restore from Trash**（最低惊讶——用户的可能意图是"想找回我之前删的那个"）
- `Restore from Trash` = 把 Trash 中条目恢复到原路径，metadata 全部继承（Category / Tag / 自定义图标完整保留）
- `Replace existing` = 把当前 Trash 中条目永久删除（不进 Trash 第二次），写入新版本，metadata 不继承（按全新装处理）
- `Cancel` = 不变化

**为什么不让 Replace 走 Trash 第二次**：避免 Trash 中出现两份同资源不同版本（认知混乱）；用户既然显式选 Replace，等于明确放弃 Trash 中的旧版本。

**卸载时是否清理上游来源记录** [R1-P1-3]：V1 行为 = 卸载等同清除全部 metadata 含 upstream 来源；从 Trash 恢复时来源记录一并恢复；30 天 Trash 清除后来源记录永久丢失。这与"用户全权控制 Trash 周期"的现有契约一致。

### 7.7 Marketplace 资源的 metadata 持久化

Marketplace 来源的资源在 Ensemble 中的 metadata（Category / Tag / 自定义图标 / Scene 关联）持久化在 `data.json` 的 `skillMetadata` / `mcpMetadata` 中（沿用现有模式，A §5）。**与本地资源完全同模式**。

**已知风险**：`Skill.id = source_path` 是字符串，marketplace 资源升级 / 改名 / 路径变更会导致 metadata 成为孤儿 [R-3]。V1 的边界——升级到上游新版（自动更新）不在 V1 范围 [D-11 Out 第 6 项]，因此 V1 周期内不会主动触发"路径变更"；用户手动卸载再装会丢 metadata（除非走 §7.6 的 Restore from Trash 路径），与本地资源同行为。这是 V1 接受的边界 [§10 Open Questions]。

### 7.8 Sync 行为（marketplace 来源 vs 本地）

V1 的核心承诺：**Marketplace 来源的资源 Sync 到 Project 时与本地资源完全同行为**[R-32]。

- Skill 通过 symlink 进入 `<project>/.claude/skills/<name>/`，源指向 `~/.ensemble/skills/<name>/`
- MCP 写入 `<project>/.mcp.json`，配置内容来自 `~/.ensemble/mcps/<name>.json`

因为 marketplace Skill 是真实拷贝（不是 plugin 的三跳 symlink，A §5.1），Sync 不会遇到 plugin 路径问题 [R-10]。stdio MCP 若用户未填环境变量就 Sync，Project 详情面板显示 `Missing required env vars`（§7.5）。

---

## 8. 成功标准与反馈机制

### 8.1 V1 成功长什么样

V1 发布后，**用户在 Ensemble 内完成"发现 → 安装 → Scene → Sync → 用上"全流程的总耗时显著低于"离开 Ensemble 走外部路径"的耗时**。具体地：

| 衡量维度 | V1 之前 | V1 目标 |
|---|---|---|
| 单个 Skill 从听说到能在 Project 中用上 | 5–15 分钟（终端 git clone + Import + 分类 + Scene + Sync） | < 60 秒（点 Install + Auto-Classify 后台 + 加 Scene + Sync） |
| 单个 MCP 从听说到能在 Project 中用上（HTTP 类） | 3–10 分钟（找配置文档 + 编辑 ~/.claude.json + Restart） | < 60 秒（点 Install + 加 Scene + Sync；OAuth 类 + 30 秒认证） |
| 单个 stdio MCP（需 env vars） | 5–15 分钟 | < 90 秒（Install + 详情填 env + 加 Scene + Sync） |

### 8.2 度量信号（产品健康度）

**正向信号**：

- 用户在某月内**至少使用一次 Marketplace** 的比例（产品采用率）
- 用户从 Marketplace 安装的 Skill / MCP **加入 Scene** 的比例（闭环到达率）—— 这是衡量"装是否真的能用上"的关键
- 用户从 Marketplace 安装后**不立即删除**的比例（推荐准确度的代理指标）
- 在用户机器上 `installSource: 'marketplace'` 资源占比逐月上升（替代外部 git clone 路径）

**反向信号**：

- 安装失败率 > 5%（数据源 / 网络 / 同名碰撞处理出了问题）
- "Already exists" Modal 出现频率高（说明用户重复点 Install——列表已装态判定有问题，§7.4 SSoT 违例）
- Marketplace 离线后用户报告"看不到资源"（缓存 / EmptyState 不够清晰）
- 用户继续主要用外部路径而非 Marketplace（产品价值不被感知）
- **装完 30 天内未加入任何 Scene 的 marketplace 资源占比 > 阈值**（闭环到达率不足，死库存比例偏高）[R1-P2-4]

### 8.3 反馈渠道（V1）

- **应用内**：Settings 中保留 `Send feedback` 链接（沿用现有，不新建）
- **GitHub Issues**：开源项目的标准渠道
- **隐式信号**：用户行为（产品采用率、闭环到达率、报错频率）通过本地匿名分析（如已有此机制；V1 不为 Marketplace 单独引入）

V1 不引入应用内评分 / 评论系统——理由见 [D-11 Out 第 3 项, E §5 模式 7]。

### 8.4 失败信号（什么样算 V1 没成功）

明确的失败信号——满足以下任一即视为 V1 未达目标，需 V1.5 干预：

- 已安装资源在 Skills / MCP Servers 列表中**与本地资源行为不一致**——例如不能加 Scene、Sync 时报错、改分类失败
- Marketplace **离线时整个 Ensemble 不可用**——marketplace 失败溢出影响其他模块
- **同名碰撞频繁**——用户反馈"我装的东西不知道为什么消失"或"覆盖了我自己写的"
- **Auto-Classify 安装时不触发**——用户安装后 Skills 列表不出现新项或出现但永远在"未分类"
- **跨页面状态错位频繁**——用户反馈"删了又出现"或"装了不知道哪里看"（违反 §7.4 SSoT 契约）

---

## 9. 范围 In / Out

### 9.1 V1 In（≤8 项）

镜像 §4 的 V1 In 列表 [D-11]：

1. Sidebar 顶部 Marketplace 分组入口
2. Skill Marketplace 浏览 / 搜索 / 筛选 / 详情 / 一键安装
3. MCP Marketplace 浏览 / 搜索 / 筛选 / 详情 / 一键安装
4. 安装到 Ensemble 自有管理路径（`~/.ensemble/`）
5. 安装后单项自动 Auto-Classify
6. 离线降级（24h 缓存 + EmptyState + Retry）
7. 与现有 Skills / MCP Servers 列表的闭环（marketplace 来源平等参与）
8. Marketplace 列表 Install / Installing / Installed 状态切换 + 失败态绑定

### 9.2 V1 Out（≤8 项）

每条给出"为什么不在 V1"的理由 [D-11]。

**Out #1：Agent Marketplace（Claude Code Subagent）**

- **理由**：Ensemble 当前完全不管理 Subagent——没有数据模型、没有列表页、Scene 不含 agent 字段（D §4-5）。强行 V1 引入 Agent 等于一次性新增"Marketplace 入口 + Subagent 管理 + Subagent 安装闭环"三层概念，违反商减。
- **未来评估**：V1.5/V2 启动时新一轮调研收敛主源（候选源已记录）；前置工作 = 加 Subagent 列表页 + 数据模型 + 扫描 + Scene 字段 [D-6]。引入时机取决于 V1 实测的"Marketplace 模式是否被用户接受"，不在 PRD 内承诺时间表。

**Out #2：用户上传 / 贡献 marketplace 内容（双向 marketplace）**

- **理由**：双向 marketplace 是另一个数量级的产品（需要后端账户、内容审核、举报、安全审查）。Ensemble 当前是单机 macOS App，引入用户内容上传等于一次性扩展为 SaaS——商增重区域 [00_understanding §4.5, R-5]。

**Out #3：评论 / 评分系统**

- **理由**：上游 skills.sh / Official MCP Registry 不提供评分；Ensemble 自建评分等于"建映射表"——违反用户原话"不打算自己建映射表"。Raycast 也明确不引入评分（E §4.1, §5 模式 7）。

**Out #4：跨账号 / 团队同步**

- **理由**：Ensemble 当前是单机 App，无账户体系、无云存储。引入团队同步等于扩展为 SaaS [00_understanding §4.5]。

**Out #5：私有 / 企业 marketplace**

- **理由**：用户场景未提（Ensemble 当前是开源单机产品）；引入企业版 SKU 偏离当前产品定位 [00_understanding §4.5]。

**Out #6：自动更新已装资源到上游新版**

- **理由**：自动更新涉及"metadata follow"问题（用户改过的 Category / Tag / 自定义图标如何随升级保留）—— 复杂度高于 V1 总目标 [R-3, D-11]。也包括"上游升级被动通知"作为 V1 Out 子集。

**Out #7：Marketplace 内置 try-before-install 沙盒**

- **理由**：上游不提供"试用"机制（C §8）；Ensemble 自建沙盒等于实现一个 Claude Code 子进程隔离环境——架构成本不可接受。用户可以装到 Ensemble 后用一个临时 Scene 测试，再加进正式 Scene。

**Out #8：跨 marketplace 全局推荐 / 编辑精选 / "Featured / Verified" 标签**

- **理由**：违反"不建映射表"原则——Ensemble 引入"我们认为这个好"等于自建质量评判表 [B §10.4, R-42]。如有需要，由上游（skills.sh / Official MCP Registry）做编辑精选，Ensemble 透传。

### 9.3 范围控制的硬约束

V1 的范围**已被 D-11 锁定**。在评审 / 修订 / 实施过程中：

- 不允许把 Out 列表中的项"偷偷"放回 V1（如以"为完整性"为由）
- 不允许在数据模型 / 组件命名 / sidebar 视觉中为 Out 项埋点（如 sidebar 留 Agent 入口位置、数据库字段 `agentMetadata` 占位、`MarketplaceTab` 组件预留 third tab）—— 这些埋点等于 V1 暗中扩范围 [Reviewer 4 专项检查]
- 不允许扩展"装即分类"为"上游升级即重分类"（这等于偷偷把 Out #6 拉回 In）—— V1 In/Out 边界张力的硬约束 [Reviewer 4 §V1 In/Out 边界张力审查]

V1 的精神是"少做但做透"。任何"为未来铺垫"的代码 / 视觉 / 命名都需要先证明"V1 周期内会被使用"，否则不引入。

---

## 10. 风险与开放问题

### 10.1 P0 风险（V1 已在前面章节定义产品层处理）

> 完整 P0 列表见 `02_risk_distillation.md` R-1~R-20。下面只列章节锚反向索引，处理细节已在 §5/§6/§7 各处显式定义；V2 修订采纳 R4-P1-2 不再重复表述 [Reviewer 4]。

| 风险 | 章节锚 |
|---|---|
| R-1 同名碰撞 → 误算已导入 | §5.6, §7.4 |
| R-2 `installSource` 二态扩三态联动 | §7.3 |
| R-3 metadata 孤儿（path 变更） | §7.6, §7.7 |
| R-4 plugin 沉底排序延展 | §7.3 |
| R-5 用户上传 / 评论商增 | §9.2, §9.3 |
| R-6 入口可达性 | §5.1 |
| R-7 skills.sh 无 REST API | §6.2 |
| R-8 Vercel 单点击穿 | §6.6 |
| R-9 plugin headless install 未支持 | §6.1 |
| R-10 plugin Scene 自动 disable 陷阱 | §6.1 |
| R-11 plugin badge 位置占用 | §5.3, §7.3 |
| R-12 MCP Registry 覆盖有限 | §6.3 |
| R-13 stdio 装完不能即用 | §5.4, §7.5 |
| R-14 Agent 范围扩大 | §9.2 Out #1 |
| R-15 安装与分类不同步 | §3.2 [5.5], §7.2 |
| R-16 hairline vs gap 风格冲突 | §5.1 |
| R-17 Marketplace ↔ Skills 心智重复 | §7.6, §7.4 |
| R-18 上游 url 失效 | §5.7, §6.6 |
| R-19 Marketplace 列表卸载入口 | §7.6 |
| R-20 "装到管理路径"全局启用误读 | §7.0, §7.1 |

### 10.2 P1 风险（PRD 已就地处理 / OQ 跟踪）

> P1 完整列表见 `02_risk_distillation.md` R-21~R-40。重点跟踪：

- **R-22 settings flag 链路补完**：V1 端到端启用 `autoClassifyNewItems`
- **R-25 weekly installs / agentAdoption 私有数据**：V1 用网页抓取 fallback
- **R-29 OAuth 类 HTTP MCP 装完认证**：V1 在详情面板提示并提供 [Copy command]，不阻断；V1.5 评估状态回流
- **R-30 24h 缓存 TTL**：V1 用 24h，实测后 V1.5 校准
- **R-33 上游分类 vs Ensemble 分类语义错配**：V1 不纳入；OQ-2 跟踪
- **R-38 上游 README 异常 markdown**：V1 必须安全降级 + 图片占位
- **R-39 列表初次加载策略**：V1 top-N（建议 100 起步）；V1.5 滚动加载

### 10.3 V1 阶段无法关闭的开放问题

下列问题属于"PRD 阶段不下定论、留给 spec / 实施 / 用户实测后回归"的开放点：

**OQ-1**：列表初次加载页 size 选择

- 上游可能有 91k+ 条目（skills.sh leaderboard）+ ~500 条目（Official MCP Registry）
- V1 倾向 top-100 + 用户搜索过滤；实测后 V1.5 决策"无限滚动 vs 分页"

**OQ-2**：上游分类 vs Ensemble 分类的语义错配（继承自 R-33, D-15 Medium 置信度）

- 用户用 Ensemble Categories 筛选 marketplace 列表时，未装资源不属于任何已有 Category 的 UX
- V1.5 评估"按上游 category 筛选 + Ensemble 分类只在已安装 tab 内"

**OQ-3**：marketplace 资源升级 / 卸载再装的 metadata 持久化（继承 R-3）

- V1 接受边界——卸载再装丢 Category / Tag / 图标（除非走 Restore from Trash）
- V1.5 评估"按 owner/repo/skill-name 三元组绑定 metadata，独立于 Skill.id"

**OQ-4**：Glama 作为 MCP 长尾源的引入时机

- Official MCP Registry ~500 vs Glama ~22k 覆盖差异
- V1 实测如果用户搜索"找不到"频率高，V1.5 引入 Glama 作长尾备选 [R-12]

**OQ-5**：列表筛选默认排序"by upstream popularity"的精确口径

- V1 已在 §5.8 文案差异化（"By weekly installs" vs "By GitHub stars"）反映上游本身差异
- 但"什么是 popularity"在不同上游含义不同，文档需在 spec / 实施阶段进一步明确

**OQ-6**：marketplace 资源在 Ensemble 端的元数据存储位置

- 是否在 `data.json.skillMetadata` 加 `upstreamSource` 字段，还是新建 `marketplaceMetadata` 集合
- spec 阶段决策；产品行为不变

**OQ-7**：详情面板图片加载失败的占位形态

- V1 必须有占位（不能视觉断层）；具体形态（IconPicker 默认 icon vs zinc 灰色 placeholder vs alt text）由 spec 阶段决策 [R2-P2-3]

**OQ-8**：详情面板时间格式（相对 vs 绝对）

- V1 用相对时间（"12h ago"）符合现代 UI 直觉，但 i18n 时存在格式宽度差异
- spec 阶段决策；i18n 时机参考 R-58 留 V1.5

---

## 附录 A：决策登记引用映射

> 决策定义见 `02_synthesis_decisions.md`。本表给出 D-1 ~ D-15 在本 PRD 中被引用的章节位置。

| 决策 | 标题 | 主要承载章节 |
|---|---|---|
| D-1 | Marketplace 入口位置 | §3.2 [2], §5.1, §9 V1 In #1 |
| D-2 | V1 子项数量与命名 | §1.2, §3.2 [2], §4 V1 In #1, §9 V1 Out #1 |
| D-3 | 数据源大策略 | §1.2, §6.1, §6.2, §6.3, §10.1 (R-9, R-10) |
| D-4 | Skill 主数据源 | §1.2, §6.2, §10.1 (R-7, R-8) |
| D-5 | MCP 主数据源 | §1.2, §6.3, §10.1 (R-12, R-18) |
| D-6 | Agent 主数据源（V1.5/V2 占位） | §9.2 Out #1 |
| D-7 | 安装路径与"装到管理路径"产品定义 | §3.2 [5], §6.1, §7.0, §7.1, §7.4, §10.1 (R-20) |
| D-8 | 安装后 Auto-Classify 是否自动触发 | §3.2 [5.5], §4 V1 In #5, §7.2, §10.1 (R-15) |
| D-9 | 与现有 plugin 资源的视觉 / 数据合并 | §5.3, §7.3, §7.4, §10.1 (R-2, R-4, R-11) |
| D-10 | 离线 / 错误 / 重复安装行为 | §3.2 [5], §4 V1 In #6, §5.6, §5.7, §6.5, §10.1 (R-1, R-30) |
| D-11 | V1 In/Out 范围 | §4, §9.1, §9.2, §9.3, §10.1 (R-5) |
| D-12 | stdio vs HTTP MCP 展示策略 | §3.2 [4], §3.2 [5], §5.4, §7.5, §10.1 (R-13, R-29) |
| D-13 | 列表 / 详情页面布局复用模式 | §5.2, §5.3, §5.9, §10.1 (R-23) |
| D-14 | 安装反馈形态 | §3.2 [5], §4 V1 In #8, §5.5, §10.1 |
| D-15 | Marketplace 列表筛选与排序 | §5.8, §6.4, §10.3 OQ-2, §10.3 OQ-5 |

**覆盖率**：15 / 15 决策全部被引用（100%）。

---

## 附录 B：术语对照

| 术语 | 含义 |
|---|---|
| **Marketplace** | Ensemble V2.0 新增的资源发现入口（Skill Marketplace + MCP Marketplace） |
| **上游 / Upstream** | 数据源（skills.sh / Official MCP Registry）的远程内容 |
| **管理路径** | `~/.ensemble/`（Ensemble 的资源持久化根目录） |
| **闭环** | 「集中管理 → Scene 组合 → Project 部署」全流程 |
| **三段式契约** | 装（Install）→ 选（Compose Scene）→ 部署（Sync） |
| **SSoT（Single Source of Truth）** | 已装态判定的产品契约：自有路径条目 + metadata + 不在 Trash 三者共同成立 |
| **Auto-Classify** | Ensemble 已有的"AI 自动分类"功能（按 Category + Tag + Icon 自动建议） |
| **Plugin 来源** | 通过 Claude Code plugin 机制（`claude plugin install`）安装的资源（与 Marketplace 并行存在） |
| **`installSource`** | 资源来源枚举字段；V1 从二态（local / plugin）扩到三态（+ marketplace） |
| **stdio MCP** | 通过本地子进程 stdio 通信的 MCP（如 puppeteer）；需配置 command + args + env vars |
| **HTTP MCP** | 通过 HTTP 通信的 MCP（如 Linear, Sentry）；多数需 OAuth 认证 |
| **同名碰撞** | 用户已有同名资源时再次 install 触发的产品交互（V1 弹 Confirm Modal） |
| **Restore from Trash** | 同名碰撞时，若 Trash 含该资源条目，恢复并继承 metadata 的优先选项 |

---

**本 PRD V2 结束。**

下游对齐审计 SubAgent 阅读时，本文档与 `02_synthesis_decisions.md` / `02_risk_distillation.md` 是平级权威；V2 修订**未反转任何 D-N 决策**，所有 P0 处理均在 PRD 表述粒度层面收齐，与决策契约完全一致。
