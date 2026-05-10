# Marketplace PRD — Synthesis 决策登记 (V1)

> **角色**：Synthesis Gate 双产物之一。回答"做什么"。
> **配套**：`02_risk_distillation.md`（回答"避开什么"）。两份独立、不重复。
> **上游**：A / G / H / B / C / D / E 七份调研 + `00_understanding.md` + `01_research_plan.md`（含 V1.1 用户决策锁定）。
> **下游**：`03_PRD_v1.md` 撰写 SubAgent 必读。
> **纪律**：每条决策格式严格按规划 §4.2；不写技术实现 / 不写 PRD 章节内容 / 不写视觉 token / 决策不踢回用户。

---

## 决策一览（D-1 ~ D-15）

| 编号 | 决策标题 | 置信度 |
|---|---|---|
| D-1 | Marketplace 入口位置 | High |
| D-2 | V1 子项数量与命名 | High（用户已锁） |
| D-3 | 数据源大策略 | High |
| D-4 | Skill 主数据源 | High |
| D-5 | MCP 主数据源 | High |
| D-6 | Agent 主数据源 | High（V1.5/V2 占位） |
| D-7 | 安装路径与"装到管理路径"产品定义 | High |
| D-8 | 安装后 Auto-Classify 是否自动触发 | High |
| D-9 | 与现有 plugin 资源的视觉 / 数据合并 | High |
| D-10 | 离线 / 错误 / 重复安装行为 | High |
| D-11 | V1 In/Out 范围 | High |
| D-12 | stdio vs HTTP MCP 在 Marketplace 中的展示策略 | High |
| D-13 | 列表 / 详情页面布局复用模式 | High |
| D-14 | 安装反馈形态（按钮 / 模态 / 进度条） | High |
| D-15 | Marketplace 列表与现有 Skills 列表的过滤器复用 | Medium |

置信度分布：High = 14；Medium = 1；Low = 0。

---

### D-1: Marketplace 入口位置

- **决策**：在 sidebar Header 与现有 Navigation 之间新增**顶部独立分组**，分组用 hairline divider（沿用现有 sidebar 同款 `#E5E5E5`）+ uppercase 段标题"MARKETPLACE"，分组内为两个 nav item（Skill Marketplace / MCP Marketplace），与下方 Skills / MCP Servers / CLAUDE.md / Scenes / Projects 平铺为同一 Navigation 视觉序列的"上一段"。
- **置信度**：High
- **备选**：(a) Navigation 内并列（不顶部分组）；(b) gap-only 分隔（不用 hairline）；(c) 下沉到二级页面入口
- **选定理由**：用户原话"在 Skill 上面再加一个分隔线"字面就是顶部独立分组（00_understanding §1）；E §4.4 / Q9 已论证 VSCode Activity Bar 的 Extensions 顶层入口模式是产品级先例；Ensemble 现有 sidebar 已使用 hairline divider（A §2.2），新增同款 divider 零新视觉语言。
- **冲突解决**：E §4.4 提到 Linear / Things 3 用 gap 而非 hairline；与 Ensemble 现有 line-based 分组语言冲突——按字面要求（"加一个分隔线"）+ 现状一致性原则取 hairline。
- **影响下游**：PRD §5 信息架构必须画出 sidebar 改造后的层级；视觉规则交给现有 design-language Rule，PRD 不重写。

### D-2: V1 子项数量与命名

- **决策**：V1 Marketplace 分组下**仅含 2 个 nav item**：「Skill Marketplace」与「MCP Marketplace」。Agent Marketplace 不在 V1。CLAUDE.md 不进入 Marketplace（用户原话已锁）。命名采用与 Skills / MCP Servers 一致的"功能 + 类别"模式（不简化为 "Skills" / "MCPs" 单字，避免与下方导航项混淆）。
- **置信度**：High（用户已锁）
- **备选**：(a) 三项含 Agent；(b) 单项"Marketplace"统一入口（再二级 tab）；(c) 命名简化
- **选定理由**：`01_research_plan.md` V1.1 Revision History 已记录用户断点 1 决策；理由（用户认可）= Ensemble 当前完全不管理 Subagent，纳入 V1 = 一次性新增三层概念违反商减；D §4 已确认 Ensemble 在 Subagent 维度完全空白（无类型、无扫描、Scene 无 agent 字段）。
- **冲突解决**：无（用户决策唯一权威）。
- **影响下游**：PRD §4 Feature Scope V1 的 In list 仅含 Skill / MCP marketplace 两项；§9 Out list 必须显式声明 Agent Marketplace 延后到 V1.5/V2 + 路线图前置工作清单（来自 D §5）。

### D-3: 数据源大策略

- **决策**：采用**"自有路径 + 上游目录"双层架构**——Ensemble 不复用 Claude Code plugin 体系作为安装通道；Marketplace 资源一律装到 Ensemble 现有的 `~/.ensemble/skills/` 与 `~/.ensemble/mcps/`；上游目录数据（leaderboard / server list / 元数据）通过 HTTP 拉取并本地缓存。**与 Claude Code plugin 体系并行、不互相替代**。
- **置信度**：High
- **备选**：(A) 完全用 Claude Code plugin 体系（调 `claude plugin install`）；(B) 自爬社区源 + 自建路径；(C) 双轨混合
- **选定理由**：G §6 已论证 `claude plugin install` 的 headless 路径未官方支持（issue #12840 仍开放）+ 默认写入 `~/.claude/plugins/cache/` 不在 Ensemble 管控；H §3-条款 4 表明走 plugin 路径会立即继承"Scene 中 plugin 启用时自动 disable"陷阱；G §5 / B §8 论证 standalone 路径完全独立永远可用，不需对接 plugin 即可装任何 markdown skill；C §6.3 论证 MCP 路径与 plugin 体系天然解耦。本策略 = B 路径。
- **冲突解决**：用户原话"找权威源 + 不打算自建映射表"与"复用 plugin 体系"两种解读并存——按"装到管理路径 + 闭环"原则取 B（Plugin 路径无法落到 Ensemble 管理路径，违反闭环要求）。
- **影响下游**：PRD §6 数据源 / §7 闭环必须显式区分"Ensemble Marketplace 装的资源"与"Claude Code plugin 装的资源"是两条独立路径；后者继续由 ImportSkillsModal Plugin tab 承担，Marketplace 不重叠。

### D-4: Skill 主数据源

- **决策**：**主源 = skills.sh / officialskills.sh**（Vercel Labs 维护的开放 skill 生态）。接入路径 = GitHub API 取 SKILL.md 与 repo 元数据 + 网页/CLI 取 install 数 + leaderboard 名单。**备选源 = GitHub API 直查**（主源不可达时降级，使用本地缓存的 owner/repo 名单）。
- **置信度**：High
- **备选**：(a) Anthropic `anthropics/skills` only；(b) skillsdirectory.com（付费 REST API）；(c) ComposioHQ awesome-list seeded
- **选定理由**：B §1 / §5 论证 skills.sh 是当前唯一同时满足"权威 + 覆盖广度（91k+） + 元数据足够丰富"的源；用户原话明确点名 "skills.sh 这个网站"（00_understanding §1）；B §8 论证与 plugin 机制完全解耦，与 D-3 自有路径策略契合。
- **冲突解决**：B §1.2 指出 skills.sh 没有公开 REST API（接入工程复杂度高）——这是工程问题不是产品问题；产品上 skills.sh 的"产品形态适配度"压倒"接入工程便利性"。
- **影响下游**：PRD §6 必须说明数据源 = skills.sh；§10 风险章节必须注明"无文档化 REST API"为接入风险（不是产品风险）。

### D-5: MCP 主数据源

- **决策**：**主源 = Official MCP Registry**（`registry.modelcontextprotocol.io`，REST `/v0.1/servers`，Anthropic + GitHub + PulseMCP + Microsoft 共同维护）。**备选源 = Glama**（自我表述 superset；公开 REST 无需 auth；用于主源不可达时降级或长尾扩展）。**Smithery 留 V1.5 评估**（商业 API 风险高，不进 V1 主路径）。
- **置信度**：High
- **备选**：(a) Glama 作主源；(b) Smithery 作主源；(c) 多源聚合
- **选定理由**：C §10.1 论证 Official Registry 是唯一既权威又结构化的源（vendor-neutral + stdio/HTTP 本体级 schema 区分 + 结构化 args/env vars 字段允许自动渲染配置表单）；C §3 对比表显示其 5 个维度中 4 个 5 星；C §10.2 论证 Glama 作为容错备选与覆盖扩展；C §2.2 / §10.3 论证 Smithery 商业风险使其不适合 V1 主路径。
- **冲突解决**：覆盖广度上 Glama / mcp.so > Official Registry（22k vs 500），但门槛 / 权威性反向；按"用户原话不建映射表 + 找权威源"取 Official Registry。
- **影响下游**：PRD §6 主源声明 + §10 风险登记的"主源覆盖度有限（500）"需在 Open Questions 中注明 V1.5/V2 是否引入 Glama 长尾。

### D-6: Agent 主数据源（V1.5/V2 占位）

- **决策**：V1 不选定，**仅在 PRD §10 Open Questions 中以候选清单形式留路线图**：候选主源 = `VoltAgent/awesome-claude-code-subagents`（社区最大、110+ subagent、14k stars）；候选 meta-list = `rahulvrane/awesome-claude-agents`（聚合多个 collection）。最终决策由 V1.5/V2 启动时新一轮 B-类调研收敛。
- **置信度**：High（V1.5/V2 占位）
- **备选**：n/a（V1 不进决策）
- **选定理由**：D §1-§5 已确认 V1 不在范围；D §5 已列出 V1.5/V2 前置工作清单（数据模型 / 扫描 / 列表页 / Scene 字段 / Marketplace 子项五项）；强行 V1 选源等于把延后决策提前。
- **冲突解决**：无（V1 范围已锁）。
- **影响下游**：PRD §9 Scope Out 必须显式包含 Agent Marketplace 并附"V1.5/V2 路线图占位"理由；§10 Open Questions 列候选源但不闭合。

### D-7: 安装路径与"装到管理路径"产品定义

- **决策**：Skill 装到 `~/.ensemble/skills/<skill-name>/`（**真实拷贝**，不是 symlink）；MCP 装到 `~/.ensemble/mcps/<name>.json`（写入构造好的 `McpConfigFile`，含 `installSource: 'marketplace'`）。**安装动作只触及 `~/.ensemble/`，不写 `~/.claude.json`、不动 `~/.claude/plugins/`**。Claude Code 端的"启用"通过 Scene → Project sync 实现（与本地 Skill / MCP 完全同模式）。
- **置信度**：High
- **备选**：(B) 同时写入 `~/.claude.json` user-scope 立即在 Claude Code 全局生效；(C) 仅 ensemble 路径，Scene 部署激活
- **选定理由**：A §5 已确认 Marketplace Skill 安装的物理落地必须落到 `~/.ensemble/skills/` 否则不被 SkillsPage 主列表识别；A §5.1 推荐"真实拷贝"模式（marketplace 源在远程，不能用 symlink）；C §6.2 三种"安装"产品定义中"定义 C"与现有 Skill / MCP plugin 导入模式同构；B §6.3 论证 Skill 安装单元 = `<owner>/<repo>/<skill-name>` 三元组真实拷贝。
- **冲突解决**：用户原话"直接安装到管理路径，能直接分发使用"——"直接分发"暗示装完即可加 Scene，不暗示"立即在 Claude Code 全局启用"（否则就绕过了 Scene 模型）；按 Scene 模型一致性原则取定义 C。
- **影响下游**：PRD §6 数据源 + §7 闭环定义必须明确"装 = 写 ~/.ensemble/，Scene = 选用，Project sync = 部署激活"三段式；这是 V1 闭环的核心契约。

### D-8: 安装后 Auto-Classify 是否自动触发

- **决策**：**自动触发 Auto-Classify**——仅对**新装的那一个 item**（不是全量批处理）。触发时机 = 安装成功后立即异步发起，不阻塞用户操作；分类结果在分类完成后异步出现在列表中（带 A §6 现有 spinner → checkmark → fade-out 视觉反馈，作用域局限到该单项 row）。settings 中已有但未消费的 `autoClassifyNewItems: boolean` flag 启用并默认 `true`。
- **置信度**：High
- **备选**：(a) 不自动触发，沿用现有"用户点 Auto Classify 按钮"模式；(b) 全量批处理（性能差）；(c) 仅推荐分类不持久化
- **选定理由**：A §6 已确认 settings 已有 `autoClassifyNewItems` flag 但当前无代码消费——产品意图早已存在；用户原话"安装到管理路径，能直接被分类"暗示安装即分类（00_understanding §1）；E §3 模式分析显示 Raycast / VSCode 安装后零额外步骤，符合"闭环最短路径"。
- **冲突解决**：现有"全量 Auto-Classify"按钮与新增"单项自动触发"并存——按规划"两者并存且互不干扰"取舍：单项自动触发用于 marketplace 安装，全量按钮保留供用户主动重分类时使用。
- **影响下游**：PRD §7 闭环必须显式画出"安装 → 自动分类 → 出现在已分类列表"路径；§5 关键交互必须描述单项分类的视觉节奏（继承 A §6 现有动效）。

### D-9: 与现有 plugin 资源的视觉 / 数据合并

- **决策**：扩展 `installSource` 枚举至**三态**（`'local' | 'plugin' | 'marketplace'`）；列表项 plugin badge（icon 容器右上角 16×16 蓝点）**仅在 `installSource === 'plugin'` 时显示**；marketplace 来源**不加同位置 badge**——marketplace 来源信息（如"来自 skills.sh"、上游 owner/repo）展示在 SlidePanel 详情面板顶部"Source"行，列表项保持视觉简洁。**已安装 vs 未安装的区分发生在 Marketplace 列表内**（不在 SkillsPage 列表内）：Marketplace 列表项右段操作区按钮文案 `Install / Installing / Installed`；点击 `Installed` 不重新安装（按钮 disabled）。
- **置信度**：High
- **备选**：(a) Marketplace 也加 plugin badge 同位置不同色；(b) 复用 `'plugin'` 枚举不扩展；(c) 详情和列表都显示来源
- **选定理由**：H §3-条款 5 已点明 `installSource` 二值枚举必须扩展；A §7.4 论证 plugin badge 位置已被占用、再叠 badge 会冲突；E 模式 4 论证"按钮变态"是商减最优；E 模式 6 + B §10.4 论证 marketplace 列表的"已安装 vs 未安装"affordance 应在列表内（不依赖 SkillsPage 反向追溯）；H §3-条款 3 警告"plugin 全局沉底"行为不应延展到 marketplace 资源——marketplace 资源应作为平等公民与 local 同优先级排序，不沉底。
- **冲突解决**：B §6.4 / H §3-条款 5 给三种 installSource 处理候选——按"扩展枚举 + UI 条件分支"取 (c)，因为 marketplace 资源的运行时行为（不在 plugin cache、不依赖 settings.json enabledPlugins、可加 Scene）与 plugin 资源差异显著，复用 `'plugin'` 会污染现有逻辑。
- **影响下游**：PRD §5 关键交互必须描述列表项 Install / Installed 状态切换；§6 数据源补"上游来源（owner/repo）记录到 SkillMetadata"段；§7 闭环明确 marketplace 资源不沉底、与 local 同等参与 SkillsPage 列表。

### D-10: 离线 / 错误 / 重复安装行为

- **决策**：(1) **离线**：Marketplace 列表渲染本地缓存（24h TTL）；缓存为空时显示 EmptyState（icon WifiOff + title "Marketplace unavailable" + Retry 按钮）；已安装资源不受影响。(2) **上游错误**：错误吞咽到 EmptyState + 顶部 error banner（沿用 SkillsPage 现有错误条机制），不弹模态。(3) **重复安装**：Skill 同名碰撞时弹小型 confirm Modal（"<name> already exists in your library. Replace / Skip / Cancel"）；MCP 同名碰撞时同款 Modal。Cancel 是默认选项。(4) **安装失败**：详情面板 Install 按钮就地变红文字 + Retry；不影响其他列表项。
- **置信度**：High
- **备选**：(a) 离线时空白页（用户原话拒绝）；(b) 重复安装直接覆盖（破坏用户既有数据）；(c) 重复安装直接 skip 不提示（违反"用户知情"原则）
- **选定理由**：E §Q8 / 模式 5 论证 EmptyState + Retry 是同类产品共识；H §3-条款 2 已指出"Skill 同名 dest_skill_path.exists() 短路把已存在误算作已导入"是去重盲区，PRD 必须定义产品行为；C §10.5 / B §10.3 论证 24h TTL 缓存是与"不建映射表"原则相容的"性能缓存"（B §10.3 解读 B）。
- **冲突解决**：B §9.3 严格"不缓存上游"解读 vs"缓存为离线降级"解读——按"用户体验闭环"原则（用户原话"让它一整个闭环，更方便一点"）取后者，缓存是工具不是映射表。
- **影响下游**：PRD §5 错误状态描述 + §6 缓存策略 + §10 风险章节；不要在 PRD 中写 TTL 实现细节，只写产品行为。

### D-11: V1 In/Out 范围

- **决策**：
  **V1 In（≤ 8 项）**：(1) Sidebar 顶部 Marketplace 分组；(2) Skill Marketplace 浏览 / 搜索 / 筛选 / 详情 / 一键安装；(3) MCP Marketplace 同上；(4) 安装到 `~/.ensemble/` 自有路径；(5) 安装后自动 Auto-Classify 单项；(6) 离线降级（24h 缓存 + EmptyState + Retry）；(7) 与现有 Skills / MCP Servers 列表的闭环（marketplace 来源资源平等显示，可加 Scene、可 sync、可删除）；(8) Marketplace 列表 Install / Installed 状态切换。
  **V1 Out（≤ 8 项）**：(1) Agent Marketplace（D-2 用户锁定，V1.5/V2 路线图）；(2) 用户上传 / 贡献内容（双向 marketplace，商增重区）；(3) 评论 / 评分系统（无上游数据 + 自建违反"不建映射表"）；(4) 跨账号 / 团队同步（不在 Ensemble 当前能力范围）；(5) 私有 / 企业 marketplace（用户场景未提）；(6) 自动更新已装资源到上游新版（涉及 metadata 跟随，复杂度大；V1.5）；(7) Marketplace 内置 try-before-install 沙盒（C §8 已确认无可消费机制）；(8) 跨 marketplace 全局推荐 / 编辑精选（违反"不建映射表"）。
- **置信度**：High
- **备选**：n/a（范围决策唯一）
- **选定理由**：每条 In 都对应 D-1~D-10 中已锁的产品决策；每条 Out 都有调研依据（D-2 用户锁、E 模式 7 论证无评分、D §1-5 论证 Agent 延后、C §8 论证无沙盒、B §10 论证不建映射表）。
- **冲突解决**：无（V1 In 是 D-1~D-10 的合集；V1 Out 是用户原话商减原则的执行）。
- **影响下游**：PRD §4 Feature Scope V1 + §9 In/Out list 一对一镜像；每条 V1 In 必须用"用户因此获得 Y"句式（不用"我们要支持 X"句式）；每条 V1 Out 必须给"为什么不在 V1"理由。

### D-12: stdio vs HTTP MCP 在 Marketplace 中的展示策略

- **决策**：**同一 MCP Marketplace 列表混合展示**两类（不分两个 tab、不分两个页面）；列表项右段加小型类型标签（"stdio" / "HTTP" 文本 badge，沿用 Badge 现有 5 种 variant 中 status 类）；详情面板内根据类型渲染不同的"配置区"——stdio 类显示 `command + args + env vars` 占位输入（用户必须填 env API key 等）；HTTP 类显示 `url`（多数情况下用户无需填，OAuth 类提示"安装后在 Claude Code 内 /mcp 完成认证"）。Install 按钮文案两类相同，但行为差异——stdio 类装完按钮变 `Installed (configure env)`（提示用户去详情填环境变量），HTTP 类直接 `Installed`。
- **置信度**：High
- **备选**：(a) 两类分两个 tab（违反 E 模式 4 同一列表混排）；(b) 两类不区分（违反 C §7 心智模型差异）；(c) 仅在详情区分（列表无标识，用户决策时缺信息）
- **选定理由**：C §3 候选源对比表论证 Official Registry 在 schema 层本体级区分（`packages` vs `remotes`），数据已分类；C §7.1-7.3 论证两类心智模型显著不同需要 UI 显式区分；C §10.4 stdio/HTTP 处理建议表已给出列表 / 详情 / 安装的差异化策略。
- **冲突解决**：C §10.4 显式建议"不为 stdio / HTTP 建两套独立页面或两套数据模型"——本决策与之一致，仅 UI 渲染分支。
- **影响下游**：PRD §5 关键交互必须描述两类的差异化反馈节奏；§7 闭环说明 stdio 类装完后 env vars 填充入口在详情面板；§10 风险章节登记 stdio 类"装完不能立即用"是必然产品行为，不是 bug。

### D-13: 列表 / 详情页面布局复用模式

- **决策**：Marketplace 页面布局**完全沿用 SkillsPage / McpServersPage 的"全宽 List + 右侧 SlidePanel(width=800)"模式**（A §1.4 跨三页一致的骨架抽象）。**不使用 ListDetailLayout** 的双栏共存模式（保持与 Skills / MCP 列表心智一致）。Marketplace 列表项**复用 SkillListItem / McpListItem 的容器骨架 + compact 动效**，仅替换右段操作区为 `[type badge] + Install / Installed 按钮`。**不抽象 BaseListItem 公共组件**——按 A §3.3 / §10 N2 推断"复制骨架 + 替换右段"模式（与现有 SkillListItem ↔ McpListItem 镜像复制模式一致）。
- **置信度**：High
- **备选**：(a) ListDetailLayout 双栏共存（A §2.2 备选）；(b) 抽象 BaseListItem 公共组件；(c) 新建 MarketplaceListItem 完全独立设计
- **选定理由**：A §1 / §9 已论证三页页面骨架完全同构；A §3.3 论证视觉密度必须完全一致是用户原话"风格一致"的硬约束；A §3.4 论证 compact 动效不能漏（否则节奏断层）；E 模式 3 论证"详情面板内嵌 Install 按钮"是同类产品共识。
- **冲突解决**：E §4.3 提到 VSCode 详情打开"Editor 区标签页"是 IDE 形态决定的——Ensemble 中央是 list+SlidePanel（A §1.1），不应学 VSCode 标签页模式；按 A 调研事实优先级取 SlidePanel。
- **影响下游**：PRD §5 信息架构描述 marketplace 页面布局时引用"完全沿用 SkillsPage 模式"一句即可，不重复画结构；§4 V1 In 不必单独列"复用 SlidePanel"，因为这是设计语言强约束的自然结果。

### D-14: 安装反馈形态

- **决策**：**就地按钮状态机**——`Install → Installing... → Installed`；不弹模态；不显示进度条；安装失败时 Install 按钮变红 + 一行短文（"Installation failed. Retry?"）+ 顶部 error banner（沿用 SkillsPage 现有，A §1.1）。安装动作**主入口在 SlidePanel 详情面板顶部**（用户从列表点击 → 详情滑入 → 按钮在详情中点击）；列表项右段的 Install 按钮**也接收点击**（不必先开详情）但行为相同。安装成功后按钮文案立即变 `Installed` 灰态，分类异步进行（D-8）。
- **置信度**：High
- **备选**：(a) 弹 ImportSkillsModal 风格的 Modal 显示批量勾选 + 进度（违反 D-13 一键模式）；(b) 顶部进度条（visual hierarchy 增层）；(c) Toast 通知
- **选定理由**：E §Q7 / 模式 2 横向论证 Raycast / VSCode / Obsidian 都是按钮状态机模式；A §10 N5 已识别现有 ImportSkillsModal 不支持单项进度，新建 Modal 是商增；用户原话"商减"明确反对"塞一堆用不到的功能"。
- **冲突解决**：B §11 / C §10 数据源调研提到"安装是网络密集 + 文件操作"——网络下载 / git clone 可能慢——但 E §Q7 论证 Raycast extension 通常 < 100 KB 秒完，Skill / MCP 体量类似，进度条收益低于 visual hierarchy 增层成本。如果实测发现某些 skill repo 较大（含 references / scripts 子目录），可在 V1.5 评估"超过 N 秒切换为细颗粒进度反馈"——V1 不引入。
- **影响下游**：PRD §5 关键交互的"安装反馈节奏"段；§4 V1 In 第 (8) 条镜像。

### D-15: Marketplace 列表与现有 Skills 列表的过滤器复用

- **决策**：Marketplace 列表使用**简化版过滤器** = (1) PageHeader 内置 SearchInput（沿用 SkillsPage 现有）+ (2) 上方一行：CategoryTreeDropdown（用 Ensemble 现有 Categories 作筛选；可选项是用户已有 Categories；上游分类标签**不进入** Ensemble 分类系统，仅在详情面板显示）+ (3) Tag pill 多选（同上，用户已有 Tags）+ (4) 排序下拉（默认 by upstream popularity，备选 alphabet / recently updated）。**不引入 VSCode 风格的 `@`-prefix 命令式过滤器**。
- **置信度**：Medium
- **备选**：(a) 引入 `@installed` / `@updates` 过滤词；(b) 完全沿用 SkillsPage 过滤器（无差异）；(c) 仅 SearchInput 不引入分类过滤
- **选定理由**：E 模式 6 论证"复用现有 taxonomy 作 marketplace 过滤"是商减最优；A §9 已确认 CategoryTreeDropdown / Tag pill 全可复用；E §4.3 论证 VSCode `@`-prefix 系统过于工程化、不适合 Ensemble 用户群。Medium 置信度的原因——上游分类与 Ensemble 分类的语义错配可能导致"用 Ensemble 分类筛选 marketplace"产品价值有限（用户分类是基于自己已装资源建立的；marketplace 内未装资源可能不属于任何已有分类），实测可能需要在 V1.5 调整为"按上游 category 筛选 + Ensemble 分类只在已安装 tab 内"。
- **冲突解决**：B §10.4 强调"列表渲染必须以上游 leaderboard / search 为序，不是 Ensemble 自创顺序"——本决策中"排序下拉默认 by upstream popularity"与之一致；分类筛选仅作为辅助过滤，不改变上游基础排序。
- **影响下游**：PRD §5 关键交互的"列表筛选节奏"段；§10 Open Questions 注明"上游分类 vs Ensemble 分类的语义错配"是 V1.5 实测后再评估的开放点。

---

## 决策映射到 PRD 章节（参考）

| 决策 | PRD 主要承载章节 |
|---|---|
| D-1 | §5 信息架构 |
| D-2 | §4 Feature Scope V1 + §9 Scope Out |
| D-3 | §6 数据源策略 + §7 闭环定义 |
| D-4 / D-5 / D-6 | §6 数据源策略 |
| D-7 | §7 闭环定义 |
| D-8 | §7 闭环定义 + §5 关键交互 |
| D-9 | §5 关键交互 + §6 数据源（来源记录） |
| D-10 | §5 错误状态 + §6 缓存策略 |
| D-11 | §4 + §9 |
| D-12 | §5 关键交互 + §7 闭环 |
| D-13 | §5 信息架构（沿用现有，引用 design-language Rule） |
| D-14 | §5 关键交互 |
| D-15 | §5 关键交互 + §10 Open Questions |

---

**本文件结束。**
