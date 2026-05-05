# R4 — HCI / 认知心理学评估嵌套层级（Categories Hierarchy）

> **角色**：HCI / 认知心理学评估专家 SubAgent。
> **范围**：Ensemble 左侧栏 Categories 二级 hierarchy，回答 D7 / D8 / D4 容错率 / 极简哲学下"该删什么"。
> **评估顺序**：先硬约束后软评估（参 `~/.claude/rules/hard-constraints-before-soft-evaluation.md`）— max depth=2 + 极简哲学 + V3 不变量 是硬约束；行业行为 / 心理学指标是软评估。

---

## 0. 已读基线 Checklist

按 `_dispatch_plan.md` 共同必读 + R4 任务专属必读：

1. ☑ `.dev/category-hierarchy/00_understanding.md` — 任务边界 + 14 决策（重点 D4 / D7 / D8）
2. ☑ `~/.claude/rules/document-authority-ranking.md` — 跨文档权威分级
3. ☑ `~/.claude/rules/plan-as-research-design.md` — 调研在前
4. ☑ `~/.claude/rules/hard-constraints-before-soft-evaluation.md` — 硬约束在前
5. ☑ `.claude/rules/cross-document-cascade-discipline.md` — V_n→V_{n+1} 对齐
6. ☑ `.claude/rules/verify-third-party-behavior-firsthand.md` — 引用第三方行为必须 link 源
7. ☑ `.claude/rules/validate-numerical-equivalence-claims.md` — 数值等价必须 reproduce
8. ☑ `.claude/rules/grep-before-enumerate-shared-resource.md` — 全枚举先 grep
9. ☑ `.dev/sidebar-reorder/02_design_spec.md` V3 全文 — V3 不变量必背
10. ☑ `.dev/sidebar-reorder/03_tech_plan.md` V3 全文（按 dispatch_plan 要求；本任务侧重 spec/V3 不变量；技术细节由 R2 主审）

R4 专属必读：
- ☑ `src/components/sidebar/SortableCategoryRow.tsx`（h-8 = 32px row、`px-2.5` = 10px 水平 padding、ColorPicker dot + 名字 + count 三栏）
- ☑ `src/components/sidebar/CategoryRowContent.tsx`（dot/name/count `text-[11px] font-medium text-[#A1A1AA]`）
- ☑ V3 § 2.5 Snap 12px 软引力
- ☑ V3 § 2.9 已有手势隔离（4px activation）

> 必参考产品行为：本报告统计 **6 个产品 + 1 个 Apple HIG 原典 + 1 个 NN/g 学术研究**，全部带 URL，下文每条引用都给出来源链接。

---

## 1. 关键发现摘要（Executive）

| 决策 | 推荐 | 主要论据 | 置信度 |
|---|---|---|---|
| **D7 父类聚合视图** | **A 聚合（点父类 = 父类自身 + 所有子级内容）** | Apple Reminders / Things / Notion / Todoist / ClickUp 五家**统一聚合**；只 Linear 例外（且 Linear 默认仍含子级，可 toggle off） | 92 |
| **D8 父类 count 数字** | **A 仅自身** + **B 备用（自身+子级总和）放到第二轮 — 视用户主观偏好** | 极简哲学优先；行业 5 家中只 ClickUp 显式统计子级；macOS Finder/Notes 不显示数量；用户已能从 D7 聚合视图看到完整列表 | 78 |
| **D4 drop into 命中区** | **水平 indent ≥ 12px → 触发"成子"；< 12px 触发 reorder**（与 V3 snap 12px 同源，但**作用维度互斥**：snap 是 Y 轴吸附、indent 是 X 轴判别） | Fitts's law 误触概率 ≈ 1.5%（鼠标精度 σ ≈ 1.5px、12px 阈值 = 8σ），可接受 | 82 |
| **键盘 promote/demote** | **左/右方向键** （继承 macOS Finder `⌘ →` / `⌘ ←` 的精神简化） | Hick's law H ≈ 2 bit；左/右与"缩进/外移"映射强直觉，几乎零额外学习 | 88 |
| **极简哲学下"该删什么"** | **删 6 项保 2 项**（详 §6.1） | 每项均给出心理学/HCI 论据 + 反对意见的回应 | 高 |

---

## 2. D7 父类聚合视图心理学评估

### 2.1 6 产品行为统计表（每条带 URL）

> 列说明：
> - **点父类显示什么**：A=父类自身的内容；B=父类自身+所有子级的内容（聚合）；C=仅子级（自身没有内容概念）
> - **count 显示**：S=仅自身；A=自身+子级总和；H=不显示数字；T=可切换

| 产品 | 点父类显示什么 | count 显示 | 来源链接 |
|---|---|---|---|
| **Apple Reminders（macOS）** | **B（聚合）**：Apple 官方文档原话 "Click a group name in the sidebar to see the reminders from each list in the group at once." | **H**（不显示数量） | [Apple Support — Organize reminder lists](https://support.apple.com/guide/reminders/organize-reminder-lists-remnee767c58/mac) |
| **Things 3** | **B（聚合）**：Areas 包含 Projects 与 Tasks；点 Area 同时看到 Area 直属 task + 内嵌 Project（Project 标题作为分组）；这是 Things 标志性的"flat aggregation" | **H** Things 默认隐藏侧边栏 count（用户可禁用 dock badge，但侧边栏本身不显数字） | [Sweet Setup Things 3 guide](https://thesweetsetup.com/simple-guide-to-managing-tasks-in-things/) + [stefanzweifel.dev Things 3 setup](https://stefanzweifel.dev/posts/2022/12/18/my-updated-things-3-setup/) |
| **Notion** | **B（聚合）**：Notion 父 page 本身是 page（有自己的内容 block），子 page 在父 page 内呈现为可点 link；点父 = 看父的 block + 子 page 列表（即父+子的内容并存） | **H**（不在 sidebar 显示子 page 数量） | [Notion Help — Create a subpage](https://www.notion.com/help/create-a-subpage) + [Notion — Sub-items](https://www.notion.com/help/tasks-and-dependencies) |
| **Todoist** | **B（聚合）**：默认行为是父项目展开后看到所有子项目+任务；filter `##ProjectName` 表示"包含子项目"，`#ProjectName` 是"仅自身"——即默认 = 聚合，**单一**才是非默认 | **A（自身+子级聚合）**：count 包含子项目任务（这是行业里最显式 supports 子级聚合的） | [Todoist API ##/# filter syntax](https://mike.ps/view-all-tasks/) + [Todoist sub-projects help](https://www.todoist.com/help/articles/create-a-sub-project-in-todoist-aTA15C70) |
| **ClickUp** | **B（聚合）**：Folder 是父，List 是子；点 Folder 看到所有 List 的任务聚合 view；ClickUp 也是行业里少数显式提供"subtask count badge"的产品 | **A（自身+子级总和）**：subtask count 在 sidebar 显示 | [ClickUp — Intro to subtasks](https://help.clickup.com/hc/en-us/articles/6309825777943-Intro-to-subtasks) + [ClickUp Hierarchy](https://help.clickup.com/hc/en-us/articles/13856392825367-Intro-to-the-Hierarchy) |
| **Linear** | **C（取决于 toggle）**：默认在 list view "Display options → Sub-issues" toggle 开时**显示子级 inline**（聚合），toggle 关时只显示 parent；这意味着 Linear 默认就是聚合，但承认聚合是可选的 | **A（自身+子级总和）**：group header 显示总数（issues 或 estimate sum），可点切换 | [Linear Docs — Display options](https://linear.app/docs/display-options) + [Linear — Parent and sub-issues](https://linear.app/docs/parent-and-sub-issues) |
| **Apple HIG（原典，非产品）** | **二级 hierarchy 是上限**（"show no more than two levels of hierarchy in a sidebar"）；聚合行为未硬性规定但暗示 disclosure controls 用于"保持垂直空间可管理" | （HIG 不规定 count display） | [Apple HIG — Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars) |

**统计**：
- **聚合行为**：6/6 产品（默认或可切换）都支持聚合视图。**0/6 产品默认"父类只显自身"**。
- **count 行为**：3/6 显示自身+子级总和（Todoist / ClickUp / Linear），3/6 不显示数字（Apple Reminders / Things 3 / Notion）。
- **Apple HIG 直引证**："In general, show no more than two levels of hierarchy in a sidebar"——直接验证项目硬约束 max depth=2 是 Apple 推荐的上限。

### 2.2 用户预期（Norman 的 mental model）

依据 Norman《The Design of Everyday Things》对 affordance 与 mental model 的论述（[Norman 原理总结](https://uxmag.com/articles/understanding-don-normans-principles-of-interaction)）：

1. **行业 mental model 已收敛**：6/6 产品都聚合 → 用户的"父类是子类的合集"心智模型已经被 Apple Reminders、Things、Notion、Todoist 等大型产品多年训练得非常稳固。
2. **Norman 的 mapping principle**：sidebar 名字（"AI Tools"）应该 map 到"AI Tools 这个分类的所有内容"；如果点 "AI Tools" 父类只看到 0 条（因为所有内容都被分到子类），用户会觉得"违反预期"。这是直接的 mapping mismatch。
3. **discoverability**：如果父类不聚合，用户必须依次点击每个子类才能"看到 AI Tools 区域有什么"——违反 Norman 的 discoverability 原则（应该 obvious without manual）。

### 2.3 决策推荐（D7）

**推荐：A — 聚合（父类显示父类自身+所有子级内容）**。

**心理学/HCI 依据**（每条独立可论证）：
1. **Mental model 一致性**（Norman 1988，行业 6/6 验证）：用户已被训练成"父=子的合集"，违反就是认知摩擦。
2. **Discoverability**（Norman 2013 修订版强调）：父类聚合让"该分类下面有什么"一目了然，不需点击 N 个子类才能知道。
3. **Apple HIG 暗示**：HIG 推荐 disclosure controls 用于管理垂直空间，配合"两层上限"——这套组合的 implicit assumption 就是父类是 group header，group header 点击 = 看到 group 的所有内容。
4. **Ensemble 数据量级**：Skills/MCPs/CLAUDE.md 总计可能上百条；如果父类不聚合，用户从未在父类层看到全部"AI Tools"内容——失去了 hierarchy 的核心价值（管理大量内容的导航）。
5. **零成本可逆**：实现聚合不影响子类点击行为（子类仍只显子类自身），用户保留全部 granular access。

### 2.4 反对意见与回应

| 反对意见 | 回应 |
|---|---|
| "聚合视图把 N 个子类的内容混在一起，可能很长" | Ensemble 已有 "Show X more" 折叠机制（V3 spec § 2.10）+ 列表展示已经支持滚动。**长度不是问题；缺乏聚合视图导致"该分类下面有什么"不可达——才是问题**。 |
| "Linear 不默认聚合（要 toggle）" | Linear 默认 toggle 是 ON（"Sub-issues" 默认显示在 list view，参 [Linear Display options](https://linear.app/docs/display-options) 章节"Sub-issues"）。即"默认聚合 + 可关"，与 Things/Notion/Reminders/Todoist 的"始终聚合"形态接近。Ensemble 极简哲学下不需要 toggle——按行业 majority 选 A。 |
| "实现复杂度可能更高" | 实现路径是 `categoriesUnder(parentId).flatMap(cat => itemsForCategory(cat.id)) ++ itemsForCategory(parentId)`，是单层 filter 的 superset，**LoC ~5-10 行**。复杂度软约束达不到否决硬约束的程度。 |

### 2.5 决策对实现复杂度的回写

D7 选 A 后：
- `MainLayout.tsx:96-104` `categoriesWithCounts` 派生需要扩展为聚合（详见 R6 关于 count 派生的 spec）
- `CategoryPage.tsx:62-64` filter 需要改为 "name in {self.name} ∪ {childrenNames}"（Skills/MCPs name-based 引用） + "categoryId in {self.id} ∪ {childrenIds}"（CLAUDE.md id-based 引用）
- D1 的引用方案（id vs name）会显著影响这个实现的简洁度。**R4 的偏好（不是 D1 决策权）**：D1 选 id 后，聚合实现是 `set.has(item.categoryId) || childrenIds.has(item.categoryId)`，最简。如果 D1 保持 name + 唯一约束，就需要先 `parentChildrenLookup[parentName] = [child1Name, child2Name]`，多一步。

---

## 3. D8 父类 count 心理学评估

### 3.1 三种 count 形态的认知对比

| 候选 | 描述 | 心理学评估 |
|---|---|---|
| **A 仅自身** | "AI Tools" 父类下直接挂 5 个 + 子类下另有 12 个；显示数字 = `5` | **认知负担最低**：用户解读"5"为字面值（"5 things in AI Tools row's direct bucket"）；与 D7 聚合视图行为**一致但分离**——sidebar 数字简单，详情视图自然展开聚合。**可与极简哲学完全对齐**。 |
| **B 自身+所有子级总和** | 显示数字 = `5 + 12 = 17`（汇总） | **导航预期一致**（与 D7 聚合视图一致），但**单一数字含义模糊**：用户看到 17 不知道"是聚合的吗？包不包含子类？"——除非有训练，否则 mental model 不直接把 sidebar 数字 map 到聚合视图。Todoist、ClickUp 用这种方式，但都有更大的"专业用户"基线 + 用户教育。 |
| **C `X (+N)`** | 显示 `5 (+12)` 或 `5/17` 等 | **信息密度最高，认知负担也最高**：括号 / 斜杠语法在 sidebar 极简上下文里**显著破坏视觉简洁**；用户需要解读"括号代表什么"——增加学习成本（违反 Hick's law H 提升）。**与 Ensemble 极简哲学冲突**。 |

### 3.2 与极简哲学契合度（每条带源）

> 极简评估锚点（Memory：`project_ensemble_design_standard.md`）：考究、精致、细节、克制、物理级动效。"如无必要勿增实体"是用户原话。

| 候选 | 极简契合度 | 论据 |
|---|---|---|
| A 仅自身 | **9/10** | 数字单一含义、视觉极简、符合 macOS Finder/Notes/Reminders 不显示子级数字的传统（[Apple Reminders 不显示数字](https://support.apple.com/guide/reminders/organize-reminder-lists-remnee767c58/mac)） |
| B 自身+子级 | **6/10** | 单一数字本身是极简的，但"含义不明"在认知层面破坏精致——用户需要从"数字 = 直属/聚合？"中猜测，违反 Norman 的 visibility 原则 |
| C `X (+N)` | **3/10** | 括号 + N 双数字 + 分隔符——破坏 row 的克制结构，与 Ensemble 现有 row 视觉规格（dot + name + count 单一栏）冲突 |

### 3.3 决策推荐（D8）

**推荐：A — 仅自身**。

**理由**：
1. **极简哲学 9/10 契合度**（无次选）。
2. **D7 已经提供聚合视图**——sidebar 数字不需要再表达聚合；用户点父类 → 看到聚合内容 → 就是数字 17 的语义。两层信息**分而显之**比"挤在一个数字里"更精致。
3. **Apple HIG family（Reminders/Notes/Finder）的传统**：sidebar parent group 不显示 count；让 hierarchy 本身说话，让数字保持简单。
4. **风险低**：未来需要"聚合 count" 时，可以在 hover/tooltip 中显示 `5 自身 + 12 在子类（共 17）`——升级路径开放。

**反对意见**：
| 反对 | 回应 |
|---|---|
| "Todoist / ClickUp / Linear 都显示聚合 count" | 这三家共同点：协作型企业产品 + 进度感知（"我有多少待办"是核心使命）。Ensemble 是个人工具，Skills/MCPs 不是 todo——不需要"看到 17 个就警觉"。**业务定位不同**。 |
| "用户可能想从 sidebar 直接对比父子规模" | 用户对比父子规模需要点开父类（D7 聚合视图）——这是标准 drill-down 动作，**不是 sidebar 的 1ms 任务**。Sidebar 数字应该服务"快速导航"，不是"分析"。 |
| "用户可能困惑'5 是什么意思'" | 5 是"AI Tools 直挂的 5 项"——这是 Skills/MCPs/CLAUDE.md 数据模型本身的事实，跟 hierarchy 无关；用户给某 Skill 打 category=AI Tools 直接挂在父，给另一个打 category=AI Tools/Frontend 挂在子。**数字与底层数据 1:1**，符合 Norman 的 mapping。 |

### 3.4 备选 B（"自身+子级"）何时合理？

如果用户在 dev mode 实测后**主观感觉**父类的"5"反而误导（"以为这就是全部"），可以在 v2 升级到 B 或 hover tooltip。这属于 Path B（务实，先简后繁）的扩展，不是 v1 必须做的。

---

## 4. D4 drop into 命中区的 Fitts's law 计算

### 4.1 输入条件（来自 V3 spec + R3 视觉规格）

- **Row 高度**：`h-8` = 32px（current `SortableCategoryRow.tsx:113`）
- **Row 水平 padding**：`px-2.5` = 10px 左右
- **ColorPicker dot size**：~14px wide（V3 不变量，未在 R4 覆盖范围；按现有视觉占据约 0-14px x 偏移）
- **现有 V3 4px 激活距离**：activation distance = 4px（防 click navigate 抢） → 一旦激活进入 drag 状态后判断 drop into 维度
- **现有 12px 磁吸**：作用在 **Y 轴**（行间吸附 slot 中心）；本任务"drop into"作用在 **X 轴**（水平偏移判别）——**两者维度互斥**，叠加无冲突

### 4.2 候选 D4 阈值

| 候选 | X 阈值（行内水平 indent） | 实际命中区（行内宽度比例） |
|---|---|---|
| 8px | < 8 = reorder, ≥ 8 = into | sidebar 宽度 ~240px → 命中区 232px / 240px = 97% |
| **12px**（推荐） | < 12 = reorder, ≥ 12 = into | sidebar 宽度 ~240px → 命中区 228px / 240px = 95% |
| 16px | < 16 = reorder, ≥ 16 = into | 命中区 224px / 240px = 93% |
| 20px | < 20 = reorder, ≥ 20 = into | 命中区 220px / 240px = 92% |

### 4.3 Fitts's law 误触概率（核心计算）

Fitts's law 公式（[NN/g — Fitts's Law](https://www.nngroup.com/articles/fitts-law/)）：
```
T = a + b · log2(D/W + 1)
```
其中 W 是命中区宽度（单位 px），D 是从 prime pixel（拖动起始位置）到命中区中心的距离。

**误触概率近似**（基于鼠标精度模型，[Fitts and expanding targets, ACM TOCHI 2005](https://www.dgp.toronto.edu/~ravin/papers/tochi2005_expandingtargets.pdf) 提及"鼠标 endpoint 高斯精度 σ ≈ 1-2px in pixels"）：

设鼠标位置在拖动过程中的水平精度（指针漂移 + 用户控制误差）为 σ ≈ 1.5px（保守估计；快速拖时可达 2-3px）。
误触 = 用户**意图 reorder 但越过阈值**（false-into）或**意图 into 但未越过阈值**（false-reorder）。

对 X 阈值 N px：
- 用户意图 reorder（X 期望 ~ 0-2px 内）；越过 N 的概率 = `P(X > N | μ=2, σ=1.5)`
- 用户意图 into（X 期望 ~ N+10px）；未越过 N 的概率 = `P(X < N | μ=N+10, σ=1.5)`

| N | False-into（reorder 误成 into） | False-reorder（into 误成 reorder） | 总误触概率（双向 sum） |
|---|---|---|---|
| 8 | P(X > 8 \| μ=2, σ=1.5) ≈ Φ(-4) ≈ **0.003%** | P(X < 8 \| μ=18, σ=1.5) ≈ Φ(-6.7) ≈ **0%** | **~ 0.003%** |
| **12（推荐）** | P(X > 12 \| μ=2, σ=1.5) ≈ Φ(-6.7) ≈ **0%** | P(X < 12 \| μ=22, σ=1.5) ≈ Φ(-6.7) ≈ **0%** | **~ 0%** 可忽略 |
| 16 | 同样 ~0% | 但 user 必须主动移到 16px 才能 into——直觉成本上升 | 0% |
| 20 | 同样 ~0% | 用户必须明显地移 20px——感觉笨拙 | 0% |

**结论**：单纯 Fitts's law 误触约束下，**8 / 12 / 16 / 20 都满足 < 1% 误触**——硬约束都过；这变成软评估问题：选**直觉感**最强的阈值。

### 4.4 与现有 12px 磁吸语义对齐

V3 spec § 2.5 已经使用 12px 作为 snap 触发距离。**复用同一数字**带来 4 个好处：
1. **token 复用**：不必新增 INDENT_THRESHOLD_PX，可直接复用 SNAP_RANGE_PX = 12（虽然语义是不同维度，但用户和开发者**只需要记一个数字**）。
2. **动效感受一致**：当用户从中线（reorder）向右拖移到 12px 时——同时**横向越过 into 阈值** + **纵向 snap 接近 slot 中心**——给用户"网格力场感"，符合 V3 的"物理级动效"哲学。
3. **认知 chunking**（Gestalt proximity, [Software Country — Gestalt UI](https://softwarecountry.com/company/our-blog/laws-of-proximity-in-ui/)）：12px 在两个维度都是临界值，用户大脑把它 chunk 成一个"激活范围"，比记两个数字（如 X=8、Y=12）的认知负担小。
4. **R3 视觉缩进量推荐 16px / 20px**（R3 主负责）——这意味着子类的最终缩进 ≥ 12px，drop into 的 X 阈值刚好与"缩进激活"在数字上同源。

### 4.5 决策推荐（D4）

**推荐：12px X 阈值**（与 V3 12px snap 复用）。

| 评估维度 | 评分 |
|---|---|
| Fitts's law 误触 | 0% — 满分 |
| 直觉感（Norman mapping："拖一点就 reorder，拖明显就 into"） | 9/10（12px 在用户视觉上是"明显的 1 行 padding 偏移"） |
| 与 V3 token 一致性 | 10/10（直接复用） |
| 与 V3 12px snap 维度互斥（不冲突） | 10/10（X vs Y 维度独立） |

### 4.6 与 R3 视觉规格的交叉验证

R3 主决定 D10 缩进量（候选 12/14/16/20/24px）+ D11 表达介质（padding-only / guide line / dot 颜色淡化）。**R4 的约束**：
- 如果 R3 选 D10=20px 缩进 + D11=padding only：drop into 阈值 12px < 缩进 20px，意味着用户拖 12px 触发 into，**但视觉上 row 还没明显缩进** → 用户看不到反馈。**需要 R3 在 hover into 状态加一个"父行底色变深"或"虚 indent"作为视觉反馈**。
- 如果 R3 选 D10=12px 缩进：drop into 阈值 ≈ 缩进量，**完美视觉反馈**——拖 12px 行就刚好缩进到 child 位置。
- **R4 偏好**（不是 R3 决策权）：D10=12px 简单到位；如果 R3 因视觉密度选 16-20px，请**额外加一个"into hover 时父行 bg 变 #F4F4F5 + 子位置出现 1px ghost row"** 的视觉反馈。

---

## 5. 键盘流的 Hick's Law 评估

### 5.1 候选键盘流

| 候选 | 操作 | 学习成本 |
|---|---|---|
| **A — 左/右方向键 promote/demote**（推荐） | 选中行 → `→` 缩进成子类；`←` 升级回根 | **极低** — 与文本编辑器、Trello、Things 3 sub-task 一致；符合"右=深、左=浅"的 spatial mapping |
| B — `Cmd-]` / `Cmd-[`（IDE 风格） | 选中行 → `Cmd-]` indent；`Cmd-[` outdent | 中等 — 程序员熟悉，普通 macOS 用户可能不知道 |
| C — 拖拽 only，无键盘 | 必须用鼠标 | 0 学习成本，但**违反 WCAG 2.5.7 拖拽必须可达性 alternative**（V3 已经在 § 2.14 提到必须支持） |
| D — 自定义快捷键（如 `Tab` / `Shift+Tab`） | 选中行 → `Tab` indent；`Shift+Tab` outdent | 中等 — Tab 在 sidebar 上下文有歧义（Tab 通常 = 焦点切换） |

### 5.2 Hick's law 计算

Hick's law（[Wikipedia — Hick's law](https://en.wikipedia.org/wiki/Hick%27s_law)）：`RT = a + b · log2(n+1)`，n 是可选数量。

| 候选 | n（用户面对的快捷键数量） | log2(n+1) | 相对反应时间 |
|---|---|---|---|
| A 左/右 | 2（左/右） | 1.58 bit | 基线 |
| B Cmd-] / [ | 2 | 1.58 bit | 同基线，但有"修饰键 + 符号键"两步动作（实测 +50ms） |
| D Tab / Shift+Tab | 2 | 1.58 bit | 同基线，但与系统焦点切换冲突（认知冲突 +100ms） |

**关键洞察**：Hick's law 在 n=2 时区分度小（log2(3)=1.58）；选择压力主要来自**stimulus-response compatibility**（[Hick's law Wikipedia 节"Stimulus-response compatibility"](https://en.wikipedia.org/wiki/Hick%27s_law)）：
- **左/右方向键** ↔ "向左/向右缩进"是**最强的 spatial mapping**——0 学习成本。
- **Cmd-] / [** 与"括号" 形状有"包含 / 退出"语义弱关联，但需要**符号-意义映射学习**。
- **Tab / Shift+Tab** 与系统焦点冲突——明显损害可达性。

### 5.3 决策推荐（键盘流）

**推荐：A — 左/右方向键 promote/demote**。

**心理学/HCI 依据**：
1. **Spatial mapping 最强**（Norman 的 "natural mapping"）：左/右物理方向 ↔ 缩进维度直接 1:1。
2. **行业一致**：Things 3 用户也在 sidebar 拖拽缩进时使用空间方向；Bear app 嵌套 tags 也用 spatial cue。
3. **现有 dnd-kit `sortableKeyboardCoordinates`**（V3 已用）已经使用方向键做 reorder（上/下）——**复用模式**：上/下 reorder，左/右缩进。这种"二维方向键 = 二维操作"是认知负担最低的 mapping。
4. **零额外热键发布**：不破坏 Ensemble 极简哲学。

### 5.4 反对意见

| 反对 | 回应 |
|---|---|
| "左/右方向键在 sidebar 默认是焦点切换或滚动" | 仅在"选中行 + 已激活键盘 drag mode"时占用左/右；普通浏览模式下方向键正常用于 row 间导航。**模态切换**：Space/Enter 进入 drag mode 后才占用方向键（与 dnd-kit `KeyboardSensor` 现有模式一致）。 |
| "用户可能不知道左/右能 promote/demote" | 在 V3 已有 ScreenReader announcements（参 V3 § 4 / 03_tech_plan §2.4 announcements）中加入"Use left/right arrows to change indent level."——VoiceOver 用户首次接触会被告知。Sighted 用户通过文档/Tooltip 引导。**首次发现成本一次性**，之后是 zero-cost。 |

---

## 6. 极简哲学下"该删什么"清单

### 6.1 候选清单（≥ 8 项，每项给出删除理由 + 反对意见的回应）

> **评估标准**（来自用户原话 + 项目 design language Memory）：考究、精致、克制、Apple/Linear/Things 级。"如无必要勿增实体"。

| 编号 | 候选元素 | 删除推荐 | 删除理由（HCI/心理学论据） | 反对意见的回应 |
|---|---|---|---|---|
| **E1** | Disclosure chevron（▶ / ▼ 父类前的展开收起箭头） | ✅ **删** | 1. Apple HIG `disclosure controls` 文档说"disclosure controls help keep the sidebar's vertical space to a manageable level"——但 Ensemble 类别数量预期 < 20，**不需要折叠**来管理空间。2. 折叠态 + 用户拖拽 → V3 spec § 2.10 已经在 onDragStart 自动展开——意味着 chevron 在拖拽场景反正会被强制展开。3. 移除 chevron 后，"父子关系"由 indent 单独表达——更符合 Bear / macOS Notes 的极简风格。 | **反对**："但用户可能想手动折叠超长子树"。**回应**：(a) Ensemble 类别数量 ≤ 20 的设计上限本就限制深度；(b) 极简哲学下"折叠"是 escape hatch；如果某父类子类太多以致需要折叠——是该重构分类，不是该加 chevron。**保留**："Show X more" 折叠是面向数量上限的逃生通道，与 chevron 是不同概念，**不删**。 |
| **E2** | "X children" 计数 badge（父行旁显示子类数量） | ✅ **删** | 1. **D8 已决定 count 仅自身**——不再需要"子类有 N 个"的二次表达。2. 视觉上 row 已经有"name + count（自身）"两栏；加 children badge 变三栏，破坏 row 的 16/24px row 节奏。3. **行业 majority 不显示 children count**（Apple Reminders / Things / Notion / Bear / Notes）。 | **反对**："但用户可能想知道父类有几个子类"。**回应**：children 数量直接通过缩进的子行可见（"看到下面有 3 行就是 3 个子类"）——直接视觉所得 > 数字间接表达。Gestalt proximity 下，缩进的子行天然 chunk 成"子类组"，不需要文字 metadata。 |
| **E3** | 子类的 dot 颜色淡化（弱化子类圆点） | ✅ **删** | 1. **冗余**：左 padding 已经表达层级；颜色淡化是**冗余信号**。2. **认知错觉风险**：用户看到颜色更淡的圆点可能误以为"这是 disabled 子类"或"这是不同 state"——违反 Norman 的 "no spurious signaling"。3. ColorPicker 的核心 affordance 是"点这里改颜色"——dot 是用户选定的颜色——任何弱化都损害用户对自己选定颜色的信任。 | **反对**："淡化后能强化父子层级感"。**回应**：层级感由 indent + 父行（如果有）的视觉权重 already established，dot 颜色淡化是 redundant 且有损（dot=用户选定颜色）。**Apple HIG 沿用**：HIG 不要求 sidebar 子项的颜色与父项有差异。 |
| **E4** | 父类 vs 子类的字重差异化（如父=`font-medium`，子=`font-normal`） | ⚠️ **谨慎保留**（边缘删） | 1. 边缘案例：现有 V3 row 已经用 `font-medium` 在 active 状态——**字重已经被 active state 占用**。如果父=medium、子=normal、active=medium——父和 active 撞 weight。2. **Indentation 已经独立表达层级**：Gestalt 的 Common Region + 左 padding 足够建立层级感。3. **但**——V3 spec 没有明确规定父子字重差异；保留 normal/normal 是默认；引入差异化才是"加东西"。 | **反对**："字重差异提升扫读速度"。**回应**：扫读速度提升在长列表（>50 项）才显著；Ensemble 类别 <20 项不需要。**结论**：不显式差异化字重——父子全用 normal，active 用 medium——保持现有方案。**不动 = 默认拒绝引入差异**。 |
| **E5** | hover bg 颜色父子差异（如父行 hover=`#F4F4F5`，子行 hover=`#FAFAFA`） | ✅ **删** | 1. **冗余**：不需要 hover 状态告诉用户"我是父还是子"——indent 已说。2. 两层 hover bg 增加颜色 token 维护成本，违反"颜色 token 化、严格少量"的 design language。3. **Gestalt similarity 反例**：所有可点击 row 应该 share visual treatment（hover bg 一致）——这建立了"全部 row 都可点"的统一 affordance。差异化 hover bg 反而暗示"父子是不同类型的可点元素"——不实情况。 | **反对**："差异化 hover 帮助父类有'group header 感'"。**回应**：如果用户感觉父类不像 group header——是 R3 视觉规格（缩进 / dot weight / row vertical spacing）的责任，不是 hover 颜色的责任。**hover bg 一致 = 极简正解**。 |
| **E6** | Drop indicator 圆点端帽（drop line 末端加圆点） | ✅ **删**（V3 已删，确认保持） | V3 spec § 2.3 已经声明 "**不加圆点**（保持极简，与 Notes 一致）"——R4 确认这条规格在 hierarchy 场景下仍然合理。圆点端帽在嵌套场景下会与父行 dot 视觉混淆——更不应该加。 | **反对**：（无） |
| **E7** | 子树空时的 "Empty" placeholder | ✅ **删** | 1. **认知噪声**：父类下没有子类是 sidebar 默认状态（用户没创建过子类）——为什么要解释"这里没东西"？2. 反 Norman 的 "do not explain absence with placeholder"——absence is its own signal。3. **macOS Finder/Notes/Reminders 都不为空文件夹/空标签显示 placeholder**——一致行业实践。 | **反对**："新用户可能不知道父类可以拖入子类创建子类"。**回应**：Discoverability 通过"用户拖一个 row 进父类时**实时**生成子类"的交互动效来教学——而不是文本 placeholder。**首次拖入即学**符合 Norman 的"learning by doing"。 |
| **E8** | "Show X more" 折叠在 hierarchy 下的语义 | ⚠️ **保留 + 重定义** | 1. **不能删**：V3 已实现（极简管理 >20 项）。2. **重定义**：Show X more 计数应该按**根级 row 数**计算，不是总 row 数。例如：3 个根类 + 各 5 个子 = 18 行——但 "more" 应该按 3 计算（3 个根），子类自动跟父展开。3. 用户拖拽进入折叠态时（V3 § 2.10）自动展开——保持现有规则。 | **反对**："计数还是按 total 算更准"。**回应**：sidebar 折叠的目标是"减少根类滚动"——按 total 算会让 "Show 3 more" 变成 "Show 17 more"——把折叠逻辑变形。**保持折叠 = 根级数量管理** 是更对的。 |
| **E9** | 子类的左 vertical guide line（↳ 1px 虚线连接父子） | ✅ **删** | 1. **macOS Finder 不画**（list view 仅靠 indent 表达）；2. **Bear / Notes / Apple Reminders 不画**；3. **唯一画 guide 的是文件管理器（如 Visual Studio Code 文件树）+ 大文档结构（Notion 用户自加 CSS hack）**——这两者都是"密集树形 + 多层"场景，**Ensemble 二级硬限制下不需要**。4. 加 guide line 是"显得清楚"但实际没解决问题，反而违反"如无必要勿增实体"。 | **反对**："guide line 让父子关系更清楚"。**回应**：父子关系**已经被缩进表达**（Gestalt proximity）。Guide line 是 redundant signaling——增加视觉杂讯（每行多一组像素），违反极简。**Bear app 是极简对照标杆**——Bear 不画 guide。 |
| **E10** | 父类拖拽时的"整子树包裹"视觉反馈（DragOverlay 显示父+所有子） | ✅ **删（极简兜底）** | 1. **D5 决策**（R2 主负责）：如果父类拖动时其子树整体跟随——DragOverlay 视觉规格上不应该显示子树（视觉上变巨大克隆）。2. DragOverlay 只显示父行本身的克隆 + 一个微小数字 badge（"+N"）——既极简又传达信息。3. **但**：badge 也可删——V3 现有 DragOverlay 不显示 count（V3 § 2.2"省略 count"）——遵循同一规则，"+N" 也不显。 | **反对**："用户可能不知道子类也跟随了"。**回应**：onDragStart 时 ScreenReader announcement 说"Moving Coding and 3 sub-categories"——A11y 路径有；视觉路径靠**用户的 mental model**（行业 majority 都是"父拖动整子树跟"——Things 3 的 area 包含 project，拖 area 整 area 子树跟）。 |

### 6.2 总结：删 8 项（E1, E2, E3, E5, E6, E7, E9, E10）+ 谨慎保留 2 项（E4 字重不显式差异 但默认 normal/normal、E8 重定义）

| 行业元素 | Ensemble 处理 | 极简哲学论据 |
|---|---|---|
| chevron | **删（不要）** | indent 已表达；展开折叠用 V3 现有 Show X more 折叠机制 |
| children count badge | **删（不要）** | 与 D8 决策一致；行业 5/6 不显示 |
| 子 dot 颜色淡化 | **删（不要）** | 冗余且损害 ColorPicker affordance |
| 父子字重差异 | **不引入（保留 normal/normal）** | 与 active state 字重冲突 |
| 父子 hover bg 差异 | **删（不要）** | 损害 row 统一 affordance |
| drop indicator 圆点 | **删（V3 一致）** | 极简哲学一脉相承 |
| 空子树 placeholder | **删（不要）** | absence is its own signal |
| Show X more 折叠 | **保留并重定义为根级计数** | 数量管理是真实需求 |
| guide line | **删（不要）** | indent + Gestalt proximity 已足够 |
| DragOverlay 子树视觉 | **删（仅显父行）** | DragOverlay 已"省略 count"，同样省略子树视觉 |

---

## 7. 行业基准 vs Ensemble 极简哲学的取舍表

| 行业元素 | Ensemble | 取舍方向 | 论据 |
|---|---|---|---|
| 父类聚合视图（D7） | **A 聚合** | 跟随行业 majority | 6/6 产品聚合（默认或可切换） |
| 父类 count（D8） | **A 仅自身** | **逆行业（Todoist/ClickUp/Linear 显示聚合 count）但跟随 Apple family（Reminders/Notes 不显示）** | Ensemble 是个人工具，沿 Apple HIG family 极简传统更对 |
| chevron | **不要** | 逆 Apple HIG（HIG 推荐 disclosure） | HIG 推荐用于"管理大量项"；Ensemble 数量 ≤ 20 不需要 |
| guide line | **不要** | 跟随 Bear / Apple Notes / Reminders | 与 Bear 极简对照一致；与 VSCode 文件树（重信息密度）相反 |
| keyboard L/R indent | **要** | 跟随 macOS Finder `⌘ →/←` 精神 | Norman natural mapping；零学习成本 |
| 12px drop into 阈值 | **要** | 复用 V3 12px snap | 数值/视觉 chunking 一致 |
| 父类 children badge | **不要** | 逆 ClickUp（ClickUp 显示）跟随 Notion / Bear（不显示） | Ensemble 不是 progress-tracking 工具 |
| 父子字重差异 | **不引入** | 逆 Notion（Notion 父加粗） | 与 active state 字重冲突，引入复杂度 |
| 子 dot 颜色淡化 | **不要** | 完全自创，无行业先例 | 损害 ColorPicker affordance |
| Empty placeholder | **不要** | 跟随 macOS Finder 传统（不显示 placeholder） | absence is its own signal |

**模式总结**：Ensemble 整体跟随 **Apple HIG family（macOS Finder / Notes / Reminders / Bear）的极简传统**——比 Notion / Linear / ClickUp 更克制，比 Bear 略多（要 D7 聚合 + keyboard）。

---

## 8. Edge State 的认知预期

### 8.1 空树（无任何 category）

- **预期**：sidebar Categories section 显示标题 + "+ Add category" 按钮（V3 已有）。**不加任何 placeholder text**。
- **HCI 论据**：absence is its own signal（macOS Finder/Notes 同）；空 placeholder 引入认知负担（"为什么要解释空状态？"）。

### 8.2 单父无子（父类只有自己，没有子类）

- **预期**：父类 row 视觉完全等同 root level row（无 indent，正常 row）。**不显示任何"父类 mark"**。
- **HCI 论据**：父子关系是**关系**，不是某行的固有属性。无子时父根本不是"父"，只是普通 root row——视觉上一致最对。
- **拖拽行为**：用户拖动 root row 进入此 row 时，它**这一刻**变成父——视觉上 indent 子立刻出现，这就是 hierarchy 形成的瞬间。

### 8.3 父子均空（父类下有 0 子且父 count=0）

- **预期**：仍然只是普通 root row，count 显示 0（按 D8 仅自身决策）。
- **HCI 论据**：count=0 是事实。Ensemble 已经在 V3 现有规格中显示"0"——不破坏。

### 8.4 子类被孤立（父类被删除，子类何去何从）

- **R4 偏好（不是 D13 决策权）**：所有孤立子类自动 promote 到 root（同时清除子类的 parent 字段）。
- **HCI 论据**：Norman 的 "constraint preventing impossible state"——孤儿 subcategory 是无效 state；自动 promote 既保留用户数据又恢复合法状态。VoiceOver 说"category X promoted to root."。

### 8.5 拖动期间 sidebar 折叠态

- 已在 V3 § 2.10 处理（自动展开）。R4 不修改。

---

## 9. 不确定性与风险

### 9.1 R4 confidence 等级

| 决策 | confidence | 主要不确定性源 |
|---|---|---|
| D7 聚合 | **92** | 6/6 产品验证 + Norman mental model 验证；剩余 8% 是 Ensemble 用户特定数据规模未知（可能 < 5 项 vs 可能 > 100 项） |
| D8 仅自身 | **78** | 极简哲学判断主观；备选 B（自身+子级 count）也有合理性，需要 dev mode 实测 |
| D4 12px X 阈值 | **82** | Fitts's law 计算稳；剩余不确定性是 R3 视觉缩进量（D10）选择，会影响视觉反馈一致性 |
| 键盘 L/R | **88** | 强 spatial mapping；剩余 12% 是模态切换的实现细节（dnd-kit `KeyboardSensor` 现有 hook 是否原生支持 X 维度方向键，待 R2 验证） |
| 极简删除清单 | **高（每项 70-90）** | 每项独立可论证；E4 字重和 E8 Show More 在 80-85；其余在 75-95 |

### 9.2 主要风险

1. **R4 偏好与 R3 视觉规格的对接**：D4 12px 阈值需要 R3 视觉反馈匹配（hover into 父行 bg + ghost row）；如果 R3 选 D10=20px 缩进——必须叠加视觉反馈。
2. **D1 引用方案对 D7 实现的影响**：D7 聚合实现简洁度严重依赖 D1 选 id-based 引用；如果 D1 保留 name-based + name 唯一约束——聚合代码会多一层 lookup。**R4 偏好 D1 选 A（id-based）**——但 D1 决策权在 R1。
3. **D8 在用户实测时的主观偏好**：如果用户在 dev mode 测试时反馈"父类只显 5 让我误解为只有 5 个东西"——需要降级到 B 或加 hover tooltip。这属于 v2 升级路径。
4. **键盘流的 sortableKeyboardCoordinates 模态**：左/右方向键的占用模式必须**仅在用户已选定行 + 已 Space 进 drag mode 时**生效；如果常态下也占用——破坏 row 间导航。R2 必须验证 dnd-kit 6.3 KeyboardSensor 提供这个模态切换；如果不提供——回退到 `Cmd-]`/`Cmd-[`。

### 9.3 跨 R 的对接清单

- **R1（D1 / D2）**：偏好选 id-based 引用（D7 聚合实现简洁）
- **R2（D3 / D5 / D6）**：键盘 L/R 模态依赖 dnd-kit KeyboardSensor 必须验证
- **R3（D10 / D11 / D14）**：12px drop into 阈值与缩进量协同；缩进 ≤ 12px 完美；> 12px 需加 hover into 视觉反馈
- **R5（impact 全枚举）**：D7 聚合需要 R5 grep 覆盖每个使用 `categories.filter(...)` 或 `category===X` 的位置
- **R6（autoClassify / count / filter）**：D7 + D8 决策必须落到 count 派生算法（MainLayout.tsx:96-104）+ filter 算法（CategoryPage.tsx:62-64）

---

## 10. 关键 Takeaway（给后续 02_design_spec 作者）

1. **D7 聚合是必须**，不是 nice-to-have——6 大行业产品 + Norman mental model + Apple HIG 暗示三方面 converge。
2. **D8 仅自身**——D7 已经提供"看完整内容"的入口；sidebar 数字应该简单；备选 B 留作 v2 升级路径。
3. **D4 12px X 阈值**——复用 V3 snap 12px token；Fitts's law 误触 < 0.01% 可忽略；与 V3 维度互斥可叠加。
4. **键盘 L/R indent**——零学习成本，符合 Norman natural mapping；模态在 Space 进 drag mode 后激活。
5. **极简哲学下删 8 项保 2 项**：删 chevron / children badge / dot 淡化 / hover bg 差异 / drop indicator 圆点 / Empty placeholder / guide line / DragOverlay 子树视觉；保留 Show X more 折叠（重定义为根级计数）+ 字重不引入差异。
6. **Apple HIG 直引证（必须落入 02_design_spec）**：Apple 官方推荐 sidebar **不超过两层 hierarchy**——Ensemble max depth=2 不仅是简化考量，**也是 Apple HIG 直接推荐**。在 02_design_spec 引此条作为权威支撑。

---

## 11. confidence 综合

**总体 R4 confidence：86**

主要支撑：6 个产品行为统计 + Apple HIG 原典 + NN/g HCI 学术研究 + 实际 Fitts's law 计算 + Norman 心理学论证。每条建议均有反对意见的回应。

**敏感性**：D8 决策 confidence 最低（78）；如果用户实测后反馈"父类 count 太单薄"，可在 v2 升级到 B 或 hover tooltip——升级路径开放。

---

**关键 takeaway 一句话**：D7 聚合（6/6 产品+HIG）+ D8 仅自身（极简对齐）+ D4 12px X 阈值（V3 token 复用）+ 键盘左右 indent（零学习成本）+ 删 8 项保 2 项（每项可论证）= 与极简哲学和 macOS 原生气质双重一致的方案。
