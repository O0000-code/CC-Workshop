# Wave 1 — Research SubAgent Dispatch Plan

> 本文件是本轮 SubAgent 的**专属执行规划**（参 `~/.claude/CLAUDE.md` 第二章 §4 "每轮专属规划文档"）。
> 所有研究 SubAgent 必须先读 `00_understanding.md`，再读本文件分配到自己的任务，再读 spec 中要求的相关 source files。
> 7 个 SubAgent 在主 Agent 的同一条消息内并行发布。

---

## 共同必读（每个 SubAgent 都必须读完）

按顺序：
1. `.dev/category-hierarchy/00_understanding.md` — 任务边界 + 14 个待决策问题清单
2. `~/.claude/rules/document-authority-ranking.md` — 跨文档冲突仲裁
3. `~/.claude/rules/plan-as-research-design.md` — 调研设计在先、结论在后
4. `~/.claude/rules/hard-constraints-before-soft-evaluation.md` — 硬约束在前
5. `.claude/rules/cross-document-cascade-discipline.md`
6. `.claude/rules/verify-third-party-behavior-firsthand.md` — 第三方库声称必须 link 源码
7. `.claude/rules/validate-numerical-equivalence-claims.md` — 数值等价必须 reproduce
8. `.claude/rules/grep-before-enumerate-shared-resource.md` — 全枚举必须先 grep
9. `.dev/sidebar-reorder/02_design_spec.md` V3（**全文** — V3 不变量必背）
10. `.dev/sidebar-reorder/03_tech_plan.md` V3（**全文** — 技术架构必背）

每个 SubAgent 在自己的产物头部必须列出"已读基线" 标明上述全部 10 项已读。**未读 = 未达成**。

---

## R1 — 数据模型 & 引用方案 & 迁移架构师

**模型**：Opus（最强可用）  
**输出**：`.dev/category-hierarchy/01_research/r1_data_model.md`  
**目标**：回答 D1（引用统一为 id 还是保留 name？）+ D2（数据模型形状）+ D13（hierarchy 失败模式），产出**带迁移路径的最终决策建议**。

**必须 grep 的范围**：
- `rg -n '\.category\b|\.categoryId\b|\.category_id\b' src/ src-tauri/src/`
- `rg -n 'metadata\.category|skill\.category|mcp\.category|claudeMd.*category' src/ src-tauri/src/`
- `rg -n 'addCategory|updateCategory|deleteCategory|reorderCategories' src/ src-tauri/src/`

**额外必读**：
- `src-tauri/src/types.rs:1-200`（Skill / McpServer / ClaudeMdFile / Category / Tag）
- `src-tauri/src/commands/data.rs`（categories CRUD + apply_reorder）
- `src-tauri/src/commands/skills.rs`（metadata.category 行为）
- `src-tauri/src/commands/mcps.rs`
- `src-tauri/src/commands/claude_md.rs`（categoryId 引用）
- `src-tauri/src/commands/classify.rs`（autoClassify prompt + 路径）
- `src/stores/skillsStore.ts:300-450`（autoClassify 创建 categories）
- `src/stores/mcpsStore.ts:350-460`（同上）
- `src/stores/claudeMdStore.ts:400-520`（categoryId 路径）
- `src/utils/constants.ts`（getCategoryColor）

**产物结构（必须包含）**：
1. **现状画像**：grep 结果列表 + 每处用什么引用方式（name / id）
2. **D1 候选评估**（A-D 四个候选 × 维度矩阵）：
   - 数据迁移成本（一次性 / 增量）
   - autoClassify 兼容性
   - getCategoryColor 兼容性
   - 重命名 category 的影响
   - hierarchy 下两个子类同名的处理
   - 代码改动 LoC 估算
3. **D2 候选评估**（A-C × 维度矩阵）
4. **D13 候选评估**
5. **最终建议**（带置信度 0-100 + 反对声音）
6. **如果选 A（迁移到 id），**完整迁移规划**：
   - Rust 端 `pub category_id: Option<String>` 字段加法
   - SkillMetadata / McpMetadata 同步
   - 旧 data.json → 新 schema 的 backward compatible 反序列化（serde default + custom Deserialize 函数？）
   - Frontend store 改造步骤
   - autoClassify chain 改造
7. **回归测试清单**

**质量要求**：每条决策必须 grep / 数值 / 源码 link 支撑，不允许"凭印象"。

---

## R2 — dnd-kit Sortable Tree 模式深度调研

**模型**：Opus  
**输出**：`.dev/category-hierarchy/01_research/r2_dnd_tree_architecture.md`  
**目标**：回答 D3（dnd-kit 模式选择）+ D5（父类拖拽语义）+ D6（promote 路径），产出**经源码验证的可行架构**。

**关键禁忌**：本任务必须保留所有 V3 Reorder 不变量（参 00_understanding §4.4）。任何方案破坏 V3 = P0 Reject。

**必须验证的第三方行为**（参 `.claude/rules/verify-third-party-behavior-firsthand.md`）：
- `node_modules/@dnd-kit/sortable/dist/sortable.esm.js`（或 .d.ts）：
  - `useSortable` 返回的 `transform`/`transition` 对子节点 indent 的影响
  - `verticalListSortingStrategy` 在变高 row（不同缩进）下的行为
  - 是否支持单 SortableContext 内多深度
- `node_modules/@dnd-kit/core/dist/core.esm.js`（或 .d.ts）：
  - `Modifier` 签名（snapModifier 可叠加吗？）
  - `closestCenter` vs `closestCorners` vs `pointerWithin` collision detection 在 tree 场景
  - `over.rect` 在嵌套场景下指向哪个 rect
- 官方 examples：`node_modules/@dnd-kit/sortable/`（如有）或 GitHub `dnd-kit/dnd-kit/stories/3 - Examples/Tree/Sortable`（必须 web fetch 真源码，不能凭印象）

**必读 / 必 web search 的实际项目实例**（必须给出 GitHub 链接）：
- 官方 dnd-kit Sortable Tree story 源码
- shadcn/ui 或 radix 的树形组件（如有）
- 至少 2 个生产环境 React + dnd-kit 嵌套清单实例

**ToDoList 行业基准**（必须 web search/fetch + 至少 2 个）：
- Things 3：drop into / promote / demote 手势（macOS 原生气质对照）
- Linear：sub-issue 拖拽（极简对照）
- Notion：page nesting 拖拽（容差/视觉反馈对照）
- Todoist：sub-task 拖拽
- Apple Reminders / Notes：folder hierarchy
- Asana / Trello（如适用）

**产物结构（必须包含）**：
1. **dnd-kit 6.3 + sortable 10 源码事实**（每条声称都 link 到 node_modules 源码行号）
2. **官方 Sortable Tree example 的实现解构**（projected depth + flatten/restore + indentation pixel）
3. **三个候选**（A 单 ctx + 投影 / B 嵌套 ctx / C 自研）× 维度矩阵：
   - V3 不变量保留度
   - snapModifier 兼容性
   - 实现复杂度（LoC）
   - 键盘可达
   - 性能（measureDroppableContainers 的 O(n)）
4. **D5 父类拖拽语义评估**
5. **D6 子→根的 promote 路径设计**
6. **最终建议 + 完整组件改造清单**（保留 V3 + 增加 hierarchy）：
   - SortableCategoriesList.tsx 的关键改动点
   - 新增 utility（flatten / projected）
   - snapModifier 是否需要扩展
   - 4px activation 是否需要调整
7. **行业基准对比表**（Things vs Linear vs Notion vs Todoist 在 7 个交互维度上的对比）
8. **回归风险登记**

---

## R3 — macOS 顶级视觉与交互设计

**模型**：Opus  
**输出**：`.dev/category-hierarchy/01_research/r3_visual_interaction_design.md`  
**目标**：回答 D4（"拖入"激活区与视觉）+ D10（缩进量）+ D11（缩进表达介质）+ D12（展开折叠）+ D14（drop indicator 表达）+ 完整视觉/动效规格。

**设计基线**：极简、克制、考究、Apple/Linear/Things 级。**禁止**任何"凭感觉"。所有规格都需源自参考产品截图分析或 macOS HIG 原生引证。

**必读基线**：
- `.dev/sidebar-reorder/02_design_spec.md` V3（**全文** — 当前的视觉/动效语言必须保留）
- `src/index.css`（已落地的 token + V3 drag-overlay-row / drop-indicator 类）
- `src/components/sidebar/CategoryRowContent.tsx` / `SortableCategoryRow.tsx` / `SortableCategoriesList.tsx`
- `src/components/layout/Sidebar.tsx:289-328`（Categories section 当前 JSX）

**必参考产品（必须给出截图/示例链接 / web fetch 资料）**：
- macOS Finder sidebar（folder hierarchy + sub-folder 拖拽）
- macOS Notes（Folders + Smart Folders 嵌套 + 拖拽）
- macOS Reminders（List Group + List 嵌套）
- Things 3（Project + Heading 嵌套，**最重要参考** — Things 极致克制）
- Linear（Workspace > Team > Project 树）
- Notion sidebar pages tree
- Bear sidebar tags hierarchy（极简对照）
- Apple HIG: Sidebars / Lists / Outline Views

**产物结构**：
1. **设计哲学三句话总结**（保持与 V3 已有语言一致）
2. **D10 缩进量决策**：候选 12 / 14 / 16 / 20 / 24 px × 评判维度（与 ColorPicker dot 不冲突、Fitts's law 命中区、视觉密度），最终建议带数学论据
3. **D11 缩进表达介质决策**：仅 padding / 1px guide / 颜色淡化 × 评判
4. **D12 展开折叠决策**：含 chevron 是否必要、状态持久化策略、空树态
5. **D4 "拖入"激活区设计**：
   - 水平偏移阈值（基于 R2 的投影深度 + Things 3 行为对照）
   - 视觉反馈（slot inflate? 父行 hover? drop indicator 嵌入式？）
   - 与 V3 的 12px 磁吸如何**叠加而不冲突**（叠加规格表）
   - 4px activation 是否仍然可保 click navigate
6. **完整视觉规格表**（仿照 V3 §2 表格）：
   - hierarchy 行的尺寸（高度、padding、字号、颜色）
   - 父类 vs 子类的视觉差异（如有）
   - 折叠态 chevron 的尺寸 / 位置 / icon 选取
   - drop into 视觉态：父行 hover bg、indicator 形态、padding 渐变
   - 缩进过渡动效（用户拖出/拖入时 padding-left 的过渡 timing）
7. **完整动效规格表**：
   - 缩进过渡 = ?ms ease-?
   - 折叠展开 = ?ms 高度过渡 + opacity（Spring? cubic-bezier?）
   - drop into 反馈与 V3 的 cascade 让位如何同时发生
8. **每个规格的 prefers-reduced-motion 退化路径**
9. **键盘可达**：左/右键缩进 promote/demote 的视觉反馈（或新增热键）
10. **A11y 公告**："moved to child of X"、"promoted to root"、"expanded category Y" 的措辞
11. **acceptance 客观可验证条件**（≥ 12 项，每项含像素 / ms / 曲线 token）

**质量要求**：每个 px / ms 都要有论据。引用产品行为不能凭印象，必须有截图/源码/HIG 链接。

---

## R4 — HCI / 认知心理学评估嵌套层级

**模型**：Opus  
**输出**：`.dev/category-hierarchy/01_research/r4_hci_evaluation.md`  
**目标**：从用户认知/直觉/误触/行业心理预期角度，评估并给出 D7（父类聚合视图） + D8（父类 count 数字）+ D14（drop indicator 心理感）+ D4 容错率的客观依据。

**理论框架（必引）**：
- Fitts's Law：drop into 命中区与误触
- Hick's Law：layered choice 数量（max depth=2 的合理性）
- Gestalt（Proximity / Common Region）：缩进表达层级
- 行业心理学预期（Norman 的 affordance + signifier）
- macOS HIG 关于 hierarchy / disclosure 的指引

**必参考的产品行为研究**：
- Things 3 / Linear / Notion / Todoist 的 hierarchy "聚合行为"（点父类是看自己 or 全部）
- 用户教程视频 / blog 中"父类 count 显示"做法的总结（至少 4 个）

**产物结构**：
1. **D7 父类聚合视图心理学评估**：
   - 行业普遍做法（统计表）
   - 用户预期：点父类应该看到什么
   - 决策：聚合 / 不聚合 / 切换 toggle，并给心理学依据
2. **D8 父类 count 心理学评估**：
   - 仅自身 vs 自身+所有子级 vs `X (+N)` 的认知负担对比
   - 与极简哲学契合度
   - 推荐
3. **D4 drop into 命中区的 Fitts's law 计算**：基于 R3 给出的视觉规格，计算误触概率
4. **键盘流的 Hick's law 评估**：左右键 promote/demote 是否增加心智负担
5. **空树/单父无子 等 edge state 的认知预期**
6. **极简哲学下"该删什么"清单**（哪些 UI 元素是冗余的，可论证删除）

**质量要求**：每个建议都给出心理学/HCI 论据，**不允许凭直觉**。

---

## R5 — 全 codebase 影响面 grep 枚举（防遗漏的兜底闸）

**模型**：Opus  
**输出**：`.dev/category-hierarchy/01_research/r5_impact_enumeration.md`  
**目标**：履行 `.claude/rules/grep-before-enumerate-shared-resource.md`，**穷举每一处引用 category 的地方**，每条标注本任务下的处理意图（改 / 不改 / 待 02_design_spec 决定）。

**必跑的 grep**（每条都要执行，原始输出贴入产物）：
```bash
rg -n --no-heading 'categor' src/ src-tauri/src/
rg -n --no-heading '\.category\b' src/ src-tauri/src/
rg -n --no-heading '\.categoryId\b' src/ src-tauri/src/
rg -n --no-heading 'category_id' src-tauri/src/
rg -n --no-heading 'categories' src/ src-tauri/src/
rg -n --no-heading 'parentId|parent_id' src/ src-tauri/src/
rg -n --no-heading 'hierarchy|hierar|nested|depth|parent|child' src/components/sidebar/
rg -n --no-heading 'getCategoryColor|categoryColors' src/
rg -n --no-heading 'CategoryPage|category/:|/category/' src/
rg -n --no-heading 'SortableCategor' src/
rg -n --no-heading 'reorder_categor|reorderCategor' src/ src-tauri/src/
rg -n --no-heading 'setCategoriesFilter|categoryFilter' src/
```

**额外必读（找隐性引用）**：
- `src/test/helpers/tauriMock.ts`（mock 的 categories 形状）
- `src/stores/__tests__/appStore.test.ts`
- `src/components/__tests__/Badge.test.tsx`
- 任何 `__tests__/` 下面 mention category 的文件
- `src-tauri/src/commands/trash.rs`（trash 路径下的 category_id）
- `docs/` 文件下的 category 文档（如有）

**产物结构（必须）**：
1. **每个 grep 命令 + 原始输出**
2. **完整 impact 表**（每行：file:line, 当前 code 摘录, 引用类型 [name/id/构造], 在 hierarchy 下的处理决议 [必改/可能改/不改]）
3. **遗漏风险标记**：grep 不可能 100% 覆盖的隐性路径（动态 string 拼接、PageHeader title 等），列出来供后续核查
4. **测试 / mock / fixture 改动清单**

**质量要求**：grep 输出必须 100% 贴出，不允许压缩；每行 impact 必须明确处理意图，禁止"待定"。

---

## R6 — Auto-classify / Count 派生 / Filter 在 hierarchy 下的行为分析

**模型**：Opus  
**输出**：`.dev/category-hierarchy/01_research/r6_classification_count_filter.md`  
**目标**：回答 D14（autoClassify）+ 详化 D7（filter）+ D8（count），产出三大行为路径在 hierarchy 下的最终行为。

**必读**：
- `src/stores/skillsStore.ts:300-450`（auto-classify chain）
- `src/stores/mcpsStore.ts:350-460`
- `src/stores/claudeMdStore.ts:400-520`
- `src-tauri/src/commands/classify.rs`（prompt）
- `src/components/layout/MainLayout.tsx:96-115`（counts 派生）
- `src/pages/CategoryPage.tsx`（filter 逻辑）
- `src/pages/SkillsPage.tsx`（如何收 categoryFilter）
- `src/stores/scenesStore.ts:21,81`（scenes categoryFilter）

**产物结构**：
1. **autoClassify 现状链路图**（数据流：UI → store → classify command → LLM → 创建 category → 写 metadata）
2. **三种 hierarchy autoClassify 候选**：
   - A) 暂不感知，新分类一律落根（最简）
   - B) prompt 喂入完整树，LLM 建议父类（path 形式）
   - C) v2 候选（先不动）
   - 每个候选的 prompt 改动 / 失败模式 / 用户视角
3. **count 派生策略**：自身 / 自身+子级 / 显示 split — 给出选定 + 实现伪代码
4. **filter 语义**：
   - 点父类 nav → 看到什么
   - 子类 nav → 仅子类
   - URL 路由 `/category/:id` 在 hierarchy 下含义
5. **scenesStore.categoryFilter 语义**（这个字段当前用法 + hierarchy 下推荐）
6. **回归风险**

---

## R7 — 设计哲学蒸馏（为 design-language Rule 提取）

**模型**：Opus  
**输出**：`.dev/category-hierarchy/01_research/r7_design_philosophy_distillation.md`  
**目标**：通读项目所有视觉/动效相关代码，蒸馏出整套设计哲学。这是为最终产出 `.claude/rules/design-language.md` 提供素材的研究步骤。

**必读 / 必扫**：
- `src/index.css` 全文（680 行）
- `src/components/common/`（全部组件 — Badge, Button, Checkbox, ColorPicker, ContextMenu, Dropdown, Input, Modal, SearchInput, Toggle, Tooltip 等）
- `src/components/sidebar/*`（含 dnd/）
- `src/components/layout/*`（Sidebar / MainLayout / PageHeader / SlidePanel / ListDetailLayout）
- `src/components/skills/*`（SkillItem / SkillListItem / SkillDetailPanel）
- `src/components/mcps/*`
- `src/components/claude-md/*`
- `src/components/scenes/*`
- `src/pages/*`（不同 page 的视觉一致性）
- `.dev/sidebar-reorder/02_design_spec.md` V3
- `.dev/sidebar-reorder/06_snap_research.md`（snap 物理感 derivation）
- `tailwind.config`（如有）/ `vite.config.ts`（确认 Tailwind 4 设置）
- `AGENTS.md`（项目自有的 design 约束）
- `CLAUDE.md`（项目级）

**产物结构**：
1. **设计语言三层蒸馏**：
   - **Layer 1：哲学（Why）** — 极简、克制、考究、物理级、macOS 原生气质（每条要有从代码中蒸馏的具体例子）
   - **Layer 2：原则（What）** — 7-12 条可执行原则（如：所有动效 token 化、所有色彩 token 化、不允许 stagger、不允许 overshoot bounce、cubic-bezier 优于 spring 用作 settle 等）
   - **Layer 3：约束（How）** — 具体规则（字号梯度 / 圆角梯度 / 阴影分级 / 颜色 token 表 / 动效曲线表 / 时长表 / 间距表 / hover/active state 规范 / 滚动条样式）
2. **核心设计 Token 大全**（从 index.css 蒸馏 + 已有 V3 token 整理）
3. **Anti-Pattern 清单**（项目中已经被排除的、不准做的具体设计动作 — 如"禁止 transform: scale 整体放大让位、必须 translate3d"）
4. **macOS 原生引用清单**（每条原则对照的 macOS 行为）
5. **跨 Session 持久化建议**：哪些哲学应当落到 `.claude/rules/design-language.md`，哪些可以更轻量

**质量要求**：每条蒸馏出来的原则必须**至少有 2 个 codebase 实例引证**（file:line）。哲学不能凭印象写。

---

## 全部 SubAgent 共同的 Done 条件

- ☐ 产出 md 文档存在于指定路径
- ☐ 头部明确标注"已读基线"列表（10 项必读 + 任务专属必读）
- ☐ 每个声称都有 link / grep / 截图 / 源码行号 支撑
- ☐ 标记 confidence 0-100 + 主要不确定性
- ☐ 在产物末尾留 1-2 行给后续 design_spec 作者的"关键 takeaway"
- ☐ 产物长度合理（不为长而长，但充分性优先）

## SubAgent 故意失败的常见路径（务必规避）

1. 忘记读 V3 sidebar-reorder spec → 提议方案破坏 V3 不变量 = P0 Reject
2. "我推测 dnd-kit 6.3 应该可以 ..." → 没读源码 = `verify-third-party-behavior-firsthand` 违反
3. "spring 与 cubic-bezier 等价 ..." 无 reproduction → `validate-numerical-equivalence-claims` 违反
4. impact 清单凭印象列 → `grep-before-enumerate-shared-resource` 违反
5. 产物只有结论没有论据 → 评审 Reject
