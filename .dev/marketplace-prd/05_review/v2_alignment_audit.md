# PRD V2 对齐审计

> **职责**：仅做覆盖性 / 决策一致性 / 风险登记三项对齐审计。不评审 V2 内容质量、文笔、UX、商减、设计一致性——这些已由 V1 评审 4 个 Reviewer 处理。
> **审计对象**：`04_PRD_v2.md`（943 行）。
> **基线**：`00_understanding.md` §1 / §1.1、`02_synthesis_decisions.md` D-1 ~ D-15、`02_risk_distillation.md` R-1 ~ R-20（P0）。
> **日期**：2026-05-09。

---

## 表 1：覆盖性审计（用户原话每一句 → V2 章节）

将 `00_understanding.md` §1 的用户原话切分为 16 个最小诉求单元。

| 诉求 | 用户原话节选（含 §1.1 校正） | V2 是否回应 | V2 章节锚 | 备注 |
|---|---|---|---|---|
| U-1 | "拓展 App 功能：Skill / MCP / Agent 的市场" | ⚠️ 部分回应 | §1.2 / §9.2 Out#1 | Agent 由用户决策锁定延后到 V1.5/V2，已在 §9.2 Out#1 + 附录 B 显式声明，符合 D-2 |
| U-2 | "在 Skill 上面再加一个分隔线" | ✅ | §3.2 [2] / §5.1 / §4 V1 In#1 | sidebar 顶部新增 hairline + uppercase 段标题 |
| U-3 | "把 Skill Marketplace、MCP Marketplace 放上去" | ✅ | §1.2 / §3.2 [2] / §4 V1 In#1 | 两个 nav item 名称严格匹配 |
| U-4 | "整体设计风格和样式跟现有 SkillsPage 完全一致" | ✅ | §5.2 / §5.3 / §5.9 | 显式声明完全沿用 SkillsPage / McpServersPage 骨架 |
| U-5 | "充分探索现有软件设计风格 / 设计规范" | ✅ | §5.9 / §5.1 | 严格按 design-language.md；R3 修订后删除字面 hex 值 |
| U-6 | "对设计有非常高的要求，不能有任何偏差" | ✅ | §5.9 视觉一致性总则 | 不新建 token / 组件 / 形态 |
| U-7 | "尽可能使用现有组件，不要再有新的组件" | ✅ | §5.9 / §5.2 / §5.3 / §5.5 | 显式声明不抽象新组件、复制 SkillListItem 骨架 |
| U-8 | "保持非常质感高级、细腻、精致" | ✅ | §5.9 / §5.0 / §5.5 | 不做 onboarding 走马灯；compact 动效保留 |
| U-9 | "Skill Marketplace + MCP Marketplace + Agent Marketplace；CLAUDE.md 没有 Marketplace" | ✅ | §1.2 / §9.2 Out#1 / 附录 B | CLAUDE.md 不进 Marketplace；Agent 延后 |
| U-10 | "skills.sh 这个网站直接进去或爬数据" | ✅ | §6.2 | 主源 = skills.sh；备选 = GitHub API |
| U-11 | "MCP 也找一个权威官方网站爬数据" | ✅ | §6.3 | 主源 = Official MCP Registry；备选 = Glama |
| U-12 | "调研一下哪个网站比较权威" | ✅ | §6.2 / §6.3 | 各自论证为什么是它 |
| U-13 | "不打算自己建设映射表，直接用别人权威的就好" | ✅ | §6.4 / §9.2 Out#3 / §9.2 Out#8 | 明确不自建分类映射；不引入"Featured / Verified"标签 |
| U-14 | "核心：能直接安装到管理路径，直接分发使用分类，让它系统闭环" | ✅ | §1.2 / §7.1 三段式 / §7.0 | 三段式契约 + §7.0 解释；安装到 `~/.ensemble/` |
| U-15 | "开源软件的 2.0 版本，加新功能、不仅管理安装更让它整体闭环" | ✅ | §1.1 / §1.2 / §7.1 | V2.0 定位明确 |
| U-16 | "商减不是商增——目标清晰、功能明确、逻辑闭环、不塞用不到的功能" | ✅ | §9.2 / §9.3 / §5.0 / §5.5 | 8 项 Out 各给理由；不做 Toast / Modal / 进度条；onboarding 一次性可 dismiss |

**结果**：✅ 15 条 / ⚠️ 1 条（U-1，Agent 延后是用户决策） / ❌ 0 条。覆盖率 = 16 / 16 = 100%（含部分回应）。

---

## 表 2：决策一致性审计（D-1 ~ D-15 → V2）

| 决策 | 决策内容（一句话） | V2 是否遵守 | V2 章节锚 | 不一致点 |
|---|---|---|---|---|
| D-1 | sidebar 顶部独立分组 + hairline + uppercase 段标题 | ✅ | §3.2 [2] / §5.1 / §4 V1 In#1 | — |
| D-2 | V1 仅 2 个 nav item（Skill + MCP），Agent 不在 V1 | ✅ | §1.2 / §4 V1 In#1 / §9.2 Out#1 | — |
| D-3 | 自有路径 + 上游目录双层架构；不复用 plugin 体系作安装通道 | ✅ | §1.2 / §6.1 / §7.3 | — |
| D-4 | Skill 主源 = skills.sh；备选 = GitHub API | ✅ | §6.2 | — |
| D-5 | MCP 主源 = Official MCP Registry；备选 = Glama；Smithery 留 V1.5 | ✅ | §6.3 | — |
| D-6 | Agent 主源 V1 不选定，仅 OQ 占位 | ✅ | §9.2 Out#1 / §10.3 (无 OQ 但显式声明) | V2 删除了路线图占位（采纳 R4-P1-1），但 Out#1 仍有"未来评估"措辞，符合"OQ 自身已是延后语义"精神 |
| D-7 | Skill / MCP 装到 `~/.ensemble/`；不写 `~/.claude.json`、不动 plugins/ | ✅ | §3.2 [5] / §6.1 / §7.1 三段式 / §4 V1 In#4 | — |
| D-8 | 安装后单项异步 Auto-Classify；启用 `autoClassifyNewItems` flag 默认 true | ✅ | §3.2 [5.5] / §7.2 / §4 V1 In#5 | — |
| D-9 | `installSource` 三态；marketplace 不加 plugin 同位 badge；列表内显示 Install/Installed | ✅ | §5.3 / §7.3 / §7.4 / §4 V1 In#7 + #8 | — |
| D-10 | 离线 24h 缓存 + EmptyState；同名碰撞 Confirm Modal 默认 Cancel；安装失败按钮 + banner | ✅ | §3.2 [5] / §5.6 / §5.7 / §6.5 | V2 在 D-10 基础上扩展了"Restore from Trash"作第三选项（采纳 R1-P0-2 / R2-P0-4），但默认聚焦改为"Restore"（仅当 Trash 中存在条目）；Trash 无条目时仍 Cancel 默认。这是**对 D-10 的精化补充而非反转**，符合"V2 修订未反转任何 D-N 决策"自检。 |
| D-11 | V1 In ≤ 8 项 + V1 Out ≤ 8 项 | ✅ | §4 / §9.1 / §9.2 / §9.3 | In = 8、Out = 8 严格符合 |
| D-12 | stdio / HTTP 同列表混合展示 + 类型 badge + 详情差异化 + 按钮文案差异 | ✅ | §3.2 [4] / §5.4 / §7.5 | — |
| D-13 | 完全沿用 SkillsPage / McpServersPage 布局；不抽象新组件 | ✅ | §5.2 / §5.3 / §5.9 | — |
| D-14 | 就地按钮状态机 Install→Installing→Installed；不弹 Modal / 不进度条 / 不 Toast | ✅ | §3.2 [5] / §5.5 / §4 V1 In#8 | "按钮变红"措辞已删除（采纳 R3-P0-3），改为按钮恢复 Retry + 顶部 banner，符合 D-14 精神 |
| D-15 | 简化版过滤器（SearchInput + CategoryTreeDropdown + Tag pill + 排序）；不引入 `@` 命令式 | ✅ | §5.8 / §6.4 / §10.3 OQ-2 | Medium 置信度的语义错配点已在 §5.8 + OQ-2 跟踪 |

**结果**：✅ 15 / 15 决策被遵守。0 反转、0 静默偏离。D-10 的精化（Restore from Trash 作第三选项）不构成反转。

---

## 表 3：风险登记审计（R-1 ~ R-20 P0 → V2）

| 风险 | 风险一句话 | V2 是否注意到 | V2 处理方式 | V2 章节锚 |
|---|---|---|---|---|
| R-1 | Skill 同名碰撞 `dest_skill_path.exists()` 短路误算已导入 | ✅ | §5.6 三选项 Confirm Modal + §7.4 SSoT 三条件契约（路径 + metadata + 非 Trash）+ §5.6 末段显式 spec 边界声明 | §5.6 / §7.4 |
| R-2 | `installSource` 二值扩三态联动 SkillListItem / DetailPanel / Scene / 排序 / 删除 | ✅ | §7.3 三态表 + 列表项不加 marketplace badge + 排序不沉底 | §7.3 |
| R-3 | `Skill.id = source_path` → marketplace 升级 / 改名 / 路径变更使 metadata 成孤儿 | ✅ | §7.7 显式声明边界 + §10.3 OQ-3 跟踪到 V1.5 | §7.7 / §10.3 |
| R-4 | plugin 全局沉底排序若延展到 marketplace 与"平等公民"定义冲突 | ✅ | §7.3 显式声明 marketplace 不沉底、平等参与默认排序 | §7.3 |
| R-5 | 用户上传 / 评论 / 评分 / 跨账号同步等商增功能悄悄回归 V1 | ✅ | §9.2 Out#2 / Out#3 / Out#4 / Out#5 + §9.3 范围控制硬约束 | §9.2 / §9.3 |
| R-6 | 已装 16+ plugin 但 0 显式 import → 入口可达性不能重蹈覆辙 | ✅ | §5.1 1 次点击可达 + §3.2 [2] 不弹 Modal / 不进 Settings + §2.4 不是给非 CC 用户 | §5.1 / §3.2 |
| R-7 | skills.sh 无文档化 REST API → 接入复杂度高 | ✅ | §6.2 显式登记为接入侧风险（不是产品风险） | §6.2 |
| R-8 | Vercel 单点击穿可击穿 skills.sh | ✅ | §6.2 + §6.6 表格"产品层缓解" | §6.2 / §6.6 |
| R-9 | `claude plugin install` headless 路径未官方支持（issue #12840） | ✅ | §6.1 显式声明不复用 plugin 通道 + §4 V1 In#4 + 附录 A D-3 | §6.1 / §4 |
| R-10 | plugin 路径继承"Scene 中 plugin 启用时自动 disable"陷阱 | ✅ | §6.1 显式声明不复用 plugin 通道 + §7.8 marketplace 真实拷贝避免三跳 symlink | §6.1 / §7.8 |
| R-11 | List Item plugin badge 蓝点位置已被占用 | ✅ | §5.3 / §7.3 marketplace 不加 plugin 同位 badge；Source 行在详情面板顶部 | §5.3 / §7.3 |
| R-12 | Official MCP Registry ~500 vs Glama ~22k 覆盖差异 | ✅ | §6.3 + §6.6 + §10.3 OQ-4 跟踪到 V1.5 | §6.3 / §10.3 |
| R-13 | stdio 装完即用是误导，UI 必须显式区分心智 | ✅ | §3.2 [5] / §5.4 配置区契约 / §7.5 表格 / 按钮文案 `Installed — needs setup` | §5.4 / §7.5 |
| R-14 | Agent Marketplace 范围扩大到第三方 agent（aider / cline / autogpt） | ✅ | §2.4 不是给非 CC 用户 + §9.2 Out#1 限定为 Claude Code Subagent | §2.4 / §9.2 |
| R-15 | Marketplace 安装与 Auto-Classify 触发链不同步导致"装了但分类没跟上" | ✅ | §3.2 [5.5] 跨页反馈 + §7.2 失败感知 + §4 V1 In#5 | §3.2 / §7.2 |
| R-16 | hairline vs gap 风格冲突，必须沿用 hairline | ✅ | §5.1 + §3.2 [2] 显式声明沿用 sidebar 现有 hairline | §5.1 / §3.2 |
| R-17 | Marketplace ↔ Skills/MCP 列表心智重复，用户不知"在哪儿看自己的" | ✅ | §7.4 SSoT 跨页面状态自动同步 + §5.5.1 short-cut 引导 + §7.6 删除入口仅在 Skills 列表 | §7.4 / §5.5.1 / §7.6 |
| R-18 | 上游 `repository.url` 失效，Ensemble 已展示但安装才报错 | ✅ | §5.7 + §6.6 显式声明"安装失败时清晰错误反馈，不预先校验 url" | §5.7 / §6.6 |
| R-19 | Marketplace 列表项是否提供卸载入口 | ✅ | §7.6 显式声明 Marketplace 列表项不提供删除 / 卸载入口 | §7.6 |
| R-20 | "装到管理路径"被解读为"立即在 CC 全局启用"绕过 Scene 模型 | ✅ | §7.0 整段产品语言解释 + §7.1 三段式契约表 + §1.2 重申 | §7.0 / §7.1 / §1.2 |

**结果**：✅ 20 / 20 P0 风险全部被注意到。每条都有显式产品层处理或 OQ 跟踪。

---

## 总体审计结论

- **覆盖性**：16 / 16 用户诉求被回应（100%；其中 1 条 ⚠️ Agent 延后是用户决策锁定）
- **决策一致性**：15 / 15 决策被遵守（100%；0 反转、0 静默偏离）
- **风险登记**：20 / 20 P0 风险被注意到（100%）

**对齐状态**：✅ **Pass**

V2 修订未反转任何 D-N 决策；未修改 V1 In/Out 各 8 项的边界；未引入新 design token / 新组件；未为 V1.5/V2 偷偷埋点。所有 V1 评审反馈（13 P0 / 21 P1 / 16 P2）均在 PRD 表述粒度收齐到现有决策契约与现有组件 API。Cascade Footprint 自检（V2 §Cascade Footprint）与本审计独立交叉验证一致——`02_synthesis_decisions.md` / `02_risk_distillation.md` / `00_understanding.md` 三份基线均不需要因 V2 修订作级联更新。

## 不在本审计范围的发现

无（V2 修订严格收敛到 PRD 表述层，本对齐审计未观察到超出范围的产品决策反转或新风险引入）。
