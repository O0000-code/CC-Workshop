# Marketplace PRD — 风险登记 (V1)

> **角色**：Synthesis Gate 双产物之一。回答"避开什么"。
> **配套**：`02_synthesis_decisions.md`（"做什么"）。两份独立、不重复。
> **格式**：每条 1 行 `R-N | 类别 | 风险一句话 | 严重度 | 来源`。
> **纪律**：登记，不写缓解（缓解是 PRD / spec 阶段的事）；按 P0 → P1 → P2 排序；总条数 30-80。

## 类别图例
数据源稳定性 / 安装路径 / UX 一致性 / 数据模型膨胀 / 闭环断裂 / 范围失控 / 法律合规 / 性能 / 可访问性 / 其他

---

## P0 风险（必须在 PRD 中处理或显式 Open Question）

R-1 | 闭环断裂 | Skill 同名碰撞时现有代码 `dest_skill_path.exists()` 短路把"已存在"误算作"已导入"，Marketplace 必须显式定义同名替换 / 跳过 / 取消语义 | P0 | H §3-条款 2
R-2 | 数据模型膨胀 | 现有 `installSource` 是二值枚举 `'local' | 'plugin'`，引入 marketplace 第三态需联动 SkillListItem / McpListItem / DetailPanel / Scene 模态 / 排序 / 删除清理多处 | P0 | H §3-条款 5 + §5
R-3 | 闭环断裂 | `Skill.id = source_path` 字符串：marketplace 资源升级 / 改名 / 路径变更会导致 SkillMetadata（category / tags / enabled / icon）成为孤儿，metadata follow 策略 V1 必须显式回应 | P0 | H §3-条款 7
R-4 | UX 一致性 | 现有"plugin 资源全局沉底"排序（skillsStore.ts:469-478, mcpsStore.ts:503-512）若延展到 marketplace 资源，与"marketplace 装的是平等公民"产品定义直接冲突 | P0 | H §3-条款 3
R-5 | 范围失控 | 用户上传 / 评论 / 评分 / 推荐 / 跨账号同步等"商增"功能极易在评审 / 后续轮次悄悄回归 V1 | P0 | 00_understanding §4.5 + E §5 模式 7
R-6 | 闭环断裂 | 用户已装 16+ Claude plugin / 0 个被显式 import 到 Ensemble，现有 ImportModal Plugins 分页对用户没有触发使用——Marketplace 入口不能重蹈覆辙 | P0 | H §Q6
R-7 | 数据源稳定性 | skills.sh 没有公开文档化 REST API，接入需 GitHub API + 网页/CLI 组合，工程复杂度高于"调一个 REST API" | P0 | B §1.2
R-8 | 数据源稳定性 | Vercel 决策可单点击穿 skills.sh（站点下线 / 改前端 / 限流）—— 主源可用性风险高 | P0 | B §9.1
R-9 | 闭环断裂 | Claude Code `claude plugin install` headless 路径未官方支持（issue #12840 仍 Critical 开放），如果选用 plugin 体系作安装通道会落入未支持区 | P0 | G §6.2
R-10 | 闭环断裂 | 走 plugin 路径会立即继承 H §3.4 的"Scene 中 plugin 启用时自动 disable"陷阱——marketplace 资源若复用 plugin 路径默认无法加入 Scene | P0 | H §3-条款 4
R-11 | UX 一致性 | List Item 现有 `installSource: 'plugin'` 蓝点 badge 位置已被占用，marketplace 资源若再叠 badge 会冲突 | P0 | A §7.4
R-12 | 数据源稳定性 | Official MCP Registry 覆盖仅 ~500 servers（远小于 Glama 22k / mcp.so 20k），用户搜索"我想要的 server"可能找不到 | P0 | C §3 对比表 + §10.1
R-13 | UX 一致性 | stdio MCP "装完即可用"是误导（实际还要填 env vars / 装 Node），UI 必须显式区分 stdio vs HTTP 心智模型 | P0 | C §7.2
R-14 | 范围失控 | Agent Marketplace 范围被扩大到第三方 agent 应用（aider / cline / autogpt），超出"Claude Code Subagent"边界 | P0 | 00_understanding §3.3
R-15 | 闭环断裂 | Marketplace 安装的资源与现有"装好但未自动分类"的 Auto-Classify 触发链不同步，用户感受到"装了但分类没跟上" | P0 | A §6 + D-8
R-16 | UX 一致性 | "在 Skill 上面再加一个分隔线"字面要求与 Linear / Things 3 gap-based 分组语言冲突，必须沿用 Ensemble 现有 hairline 模式 | P0 | E §Q9 / §4.4
R-17 | 闭环断裂 | Marketplace 列表与现有 Skills / MCP Servers 列表心智重复——用户不知道"在哪儿看自己的 Skill" | P0 | E §Q5 + 00_understanding §4.4
R-18 | 数据源稳定性 | 上游某 server `repository.url` 失效时，Ensemble 已展示但安装时才报错，用户体验断层 | P0 | C §9
R-19 | 范围失控 | "卸载"在 marketplace 列表项的 More menu 是否提供——若引入则 Marketplace 列表项变成 Skills 列表的镜像（信息冗余） | P0 | E §6 / §4.3 + 模式 4
R-20 | 闭环断裂 | 用户原话"装到管理路径"被解读为"立即在 Claude Code 全局启用"会绕过 Scene 模型——产品定义必须明确"装 = 写 ~/.ensemble/，Scene = 选用，Sync = 部署"三段式 | P0 | C §6.2 / 决策 D-7

## P1 风险（应在 PRD 中提及或在 Open Questions 中跟踪）

R-21 | UX 一致性 | Plugin badge 蓝色 `#3B82F6` 是当前代码库唯一硬编码颜色，不在 design-language Rule 色板内（先存语言违例，但属现状） | P1 | H §Q2
R-22 | 数据模型膨胀 | settings.json 中 `autoClassifyNewItems: boolean` 已存在但无任何代码消费（types.ts:131）—— 启用时需端到端补完链路 | P1 | A §6
R-23 | UX 一致性 | List Item 的 compact 模式动效（opacity / max-width 250 ms + 150 ms 延迟）必须在 marketplace List Item 镜像，否则用户感到节奏断层 | P1 | A §3.4 / §8.5
R-24 | 数据源稳定性 | GitHub API rate limit（无 token 60 req/h，有 token 5000 req/h）—— marketplace 列表初次加载可能超限 | P1 | B §9.1
R-25 | 数据源稳定性 | "weekly installs" / "agentAdoption" 是 skills.sh 私有数据，纯 GitHub API 无法替代——若 PRD 要展示需 fall back 到网页刮取 | P1 | B §11.1
R-26 | 闭环断裂 | Trash 流程不感知 plugin 来源，恢复 plugin Skill 时若 plugin 已被卸载会得到 broken link——marketplace 资源是真实拷贝不受此影响但需在 PRD 中确认 | P1 | H §Q3
R-27 | 数据模型膨胀 | `pluginEnabled` 字段不持久化、每次启动实时读 `settings.json`——marketplace 资源没有此字段，UI 条件分支需要明确 | P1 | H §Q4 + §3-条款 6
R-28 | 数据源稳定性 | Smithery / Glama 等商业源若改 auth / 限速 / 变更 schema，备选源策略需要预案 | P1 | C §9
R-29 | UX 一致性 | OAuth 类 HTTP MCP（Linear / Sentry）安装后还要在 Claude Code 内 `/mcp` 完成认证——产品反馈中需提示但不阻断 | P1 | C §7 + §10.4
R-30 | 性能 | 24h 缓存 TTL 选择是产品决策；过长用户看不到上游新内容；过短网络压力大 | P1 | C §10.5 + B §9.3 / §10.3
R-31 | UX 一致性 | "Marketplace" 段标题 + 2 nav items vs 直接 2 nav items（无段标题）的信息密度抉择 | P1 | E §6 (D-1 子项)
R-32 | 闭环断裂 | Marketplace 资源加入 Scene 后 sync 到 Project 是 symlink 链——marketplace 资源因为是真实拷贝可避免 plugin 三跳 symlink，但 PRD 必须确认 | P1 | H §Q3 (Sync 段)
R-33 | 范围失控 | 上游分类 / tag 是否纳入 Ensemble Categories / Tags 系统——若纳入则违反"不建映射表"，若不纳入则上游分类信息丢失 | P1 | B §10.4 + 决策 D-15
R-34 | 数据源稳定性 | 后端 `update_skill_scope` / `update_mcp_scope` 不检查 `installSource`——前端绕过校验直接 IPC 调用即可对 plugin / marketplace Skill 改 scope（事实陈述） | P1 | H §Q2
R-35 | UX 一致性 | "Refresh" 入口位置（PageHeader actions 内）和"全量刷新缓存"的产品语义需明确 | P1 | A §2.1 (PageHeader actions)
R-36 | 数据模型膨胀 | `imported_plugin_skills/mcps` 列表当前只跟踪显式 import，若 marketplace 也走类似列表（如 `imported_marketplace_skills`）需避免膨胀 | P1 | H §Q5
R-37 | 闭环断裂 | 安装失败时 SlidePanel 中的失败状态与 SkillsPage 顶部 error banner 的关系——产品反馈应只在一处展示 | P1 | A §1.1 + §4.1
R-38 | UX 一致性 | 上游 README 不一定结构化（含图片 / HTML / 异常 markdown），SlidePanel 详情中渲染需要"安全降级" | P1 | 00_understanding §4.2
R-39 | 性能 | 列表初次加载时网络拉取 + 91k 项 leaderboard 部分加载策略——一次性拉全 vs 滚动加载 vs 默认 top-100 | P1 | B §1.1
R-40 | 法律合规 | skills.sh 的 robots.txt / 服务条款是否允许程序化访问（B 调研未深查） | P1 | B §12

## P2 风险（可在 V1.5 / 后续迭代回应）

R-41 | 数据模型膨胀 | 多 skill repo 的"一键装全部" vs"逐项装"产品决策——V1 选逐项 | P2 | B §6.3
R-42 | 范围失控 | "Featured / Editor's Pick / Verified" 这类标签若引入会被解读为 Ensemble 自评 | P2 | B §10.4
R-43 | 性能 | Marketplace 列表初次加载 + 详情面板首次打开都涉及网络请求——单 detail 慢于列表，可能造成用户 perceive 应用变慢 | P2 | C §10
R-44 | 可访问性 | 详情面板内嵌 README 对屏幕阅读器的友好度（结构化字段 vs 长 markdown） | P2 | E §6
R-45 | 数据源稳定性 | mcp.so 没有公开 API 仅可 web scrape——若 V1.5 引入此源风险高 | P2 | C §2.4
R-46 | 数据源稳定性 | GitHub MCP Registry 限定在 VS Code / Copilot 内、无第三方公开 API——Ensemble 不能直接消费 | P2 | C §2.7
R-47 | 法律合规 | scrape skills.sh leaderboard 的频率与方式（友好 User-Agent、缓存复用、避免 burst） | P2 | B §12
R-48 | UX 一致性 | "Last updated 12h ago" 提示文案的精度（小时 / 分钟 / 相对时间）和 i18n（V1 仅英文） | P2 | C §10.5
R-49 | 数据模型膨胀 | 上游来源（owner/repo/skill-name 三元组）字段是否进入 `data.json.skillMetadata` 还是新建 `marketplaceMetadata` 集合 | P2 | B §6.3 + 决策 D-9
R-50 | 性能 | Marketplace 与 SkillsPage 同时打开时（虽不可能但 sidebar 切换瞬间）网络请求和缓存读取的并发竞争 | P2 | A §1.1
R-51 | 范围失控 | "已装资源升级到上游新版"自动 vs 手动通知——V1 Out 但需要在 V1.5 评估 | P2 | E §Q6 + 决策 D-11
R-52 | UX 一致性 | 排序下拉的默认值（by upstream popularity vs by 最近更新）的产品口径影响首次进入用户的"什么是热门"心智 | P2 | B §10.4 + E 模式 6
R-53 | 法律合规 | 上游 skill / MCP 的许可证（MIT / Apache / 自定义）展示在 Marketplace 详情中是否必要 | P2 | B §7
R-54 | 闭环断裂 | Marketplace 安装的 Skill 在 Scene 中 → sync 到 Project → Project 跑 Claude Code 时 skill 是否真的能 load —— 端到端验证缺口 | P2 | A §6 / §7.3 + H §Q3 (Sync 段)
R-55 | UX 一致性 | 详情面板顶部 IconPicker 锚点定位（marketplace 资源默认 icon vs 用户改）—— 行为应与 SkillsPage 一致但需确认 | P2 | A §1.1 + §9
R-56 | 数据源稳定性 | PulseMCP "trending / weekly visitors" 数据若 V1.5 引入需确认 API 永久免费承诺的实际持续性 | P2 | C §2.5
R-57 | 数据模型膨胀 | `McpConfigFile` 在 `import.rs` 与 `plugins.rs` 都构造——marketplace 安装第三处构造点需保持字段一致 | P2 | CLAUDE.md key patterns 段
R-58 | UX 一致性 | "Install / Installed / Installing" 三态文案在 i18n 时（V1.5 中文版）的字符宽度变化 | P2 | E 模式 2

---

**本文件结束。条数 = 58。**
