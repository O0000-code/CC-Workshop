# Category Hierarchy — 理解文档

> 该文档作为后续所有 SubAgent 的"必读基线"。任何 SubAgent 在动手前必须先全文读完。
> 本任务的方法论与文档结构沿用 `.dev/sidebar-reorder/` 的 6 步范式（00_understanding → 01_research → 02_design_spec → 03_tech_plan → 04_implementation_plan → 05_review）。

## 1. 任务原文（用户原话压缩）

> 给 Categories 加二级分类（一级父类 + 二级子类）。要求：
>
> 1. **数据/后端**：扩展数据模型支持父子关系。
> 2. **UI**：在左侧栏以"最佳的树状结构"展现二级分类，**不要任何过多的元素**——崇尚极致极简和克制，"如无必要勿增实体"。
> 3. **拖拽**：能通过拖动把类别放入另一个类别变成子类，也能拖出来变回独立类。**不能破坏现有的极致拖动+磁吸效果**，必须在保持一致性的基础上增强。
> 4. **设计风格**：保持考究、精致、细节、克制、物理级别动效（Spring/磁吸/自然/流畅）。设计要求顶尖（Apple/Linear/Things 级）。
> 5. **设计文档**：写一份 Design.md（**挂在项目 Rule 里**：`.claude/rules/design-language.md`，每个 session 自动加载）总结整体设计哲学，让未来 session 不需要被反复强调。
> 6. **流程**：充分调研 → 多 Agent 评估 → 不达标继续调研 → 接近 10/10 才实施 → 实施后专家审核 → 不能影响任何现有功能 → 不能引入新问题。

## 2. 方法论沿用（与 sidebar-reorder 一致）

```
00_understanding.md       ← 本文档，作 Referential 必读基线
01_research/*.md          ← 调研产出，多 SubAgent 并行
02_design_spec.md         ← Decisional 视觉/动效规格
03_tech_plan.md           ← Decisional 技术架构
04_implementation_plan.md ← Decisional 任务卡 + 依赖图
05_review/*.md            ← 评审记录（同级冲突向用户提问；跨级以高层为准）
```

附加产物（**不在 .dev/ 内**）：
- `.claude/rules/design-language.md` — 全局设计哲学 Rule，绑定 project（每个 session 自动加载）

跨文档级冲突解决：参 `~/.claude/rules/document-authority-ranking.md`；任何 02/03/04 修订必须遵守 `.claude/rules/cross-document-cascade-discipline.md`（V_n → V_{n+1} 转换前必须跑对齐 SubAgent）。

## 3. 项目背景（Tech Stack 复读机）

- **桌面应用**：Tauri 2.9 + Rust（后端）+ React 18 + TypeScript 5.9（前端）
- **macOS only**（min macOS 12.0）— 设计基线就是 macOS 原生气质
- **样式**：Tailwind CSS 4，无 CSS modules，全部 utility-first
- **状态**：Zustand 5
- **图标**：lucide-react
- **数据**：`~/.ensemble/data.json`（Rust 后端读写）
- **拖拽核心**：`@dnd-kit/core@^6.3.1` + `@dnd-kit/sortable@^10.0.0` + `@dnd-kit/modifiers@^9.0.0` + `@dnd-kit/utilities@^3.2.2`
- **质量门槛**：`npx tsc --noEmit && npm run test && cd src-tauri && cargo test && cargo clippy -- -D warnings`

## 4. 当前实现的关键事实（来自 Read，非推断）

### 4.1 后端数据模型

**Rust** (`src-tauri/src/types.rs:134-141`)：

```rust
pub struct Category {
    pub id: String,
    pub name: String,
    pub color: String,
    pub count: u32,
}
```

**TS** (`src/types/index.ts:84-89`)：
```ts
interface Category { id: string; name: string; color: string; count: number; }
```

`AppData.categories: Vec<Category>` 持久化在 `~/.ensemble/data.json`。

**关键事实**：
- **Category 是扁平的**，没有 `parentId`、`depth`、`path`、`sortOrder` 任何引用父级的字段。
- `count` 是 **派生** 字段，由 `MainLayout.tsx:96-104` 的 `categoriesWithCounts` `useMemo` 实时计算（统计 skills/mcps/claudeMdFiles）注入到 sidebar。
- 顺序由 `Vec` 在 JSON 中的天然顺序决定，已通过 V3 Reorder 改造支持手动 reorder + DATA_MUTEX 串行 + version 协议。

### 4.2 异构的 category 引用方式（**P0 重要**）

```rust
// Skills (src-tauri/src/types.rs:11)
pub struct Skill { pub category: String, ... }    // ← name string

// MCPs  (src-tauri/src/types.rs:42)
pub struct McpServer { pub category: String, ... } // ← name string

// CLAUDE.md (src-tauri/src/types.rs:653)
pub struct ClaudeMdFile { pub category_id: Option<String>, ... } // ← UUID id
```

`CategoryPage.tsx:62-64`：
```ts
const categorySkills = skills.filter((s) => s.category === categoryName);
const categoryMcps = mcpServers.filter((m) => m.category === categoryName);
const categoryClaudeMd = claudeMdFiles.filter((f) => f.categoryId === categoryId);
```

**这是 P0 的设计冲突点**：当引入二级分类后，两个不同父类下都可以有名为 "Web" 的子类，**name-based 引用无法区分两者**。`Skill.category = "Web"` 究竟指向哪个？

**所有可能方案都需要在 02/03 中显式选定**（候选见 §6）。

### 4.3 自动分类（`autoClassify`）

`src/stores/skillsStore.ts:323-410` / `mcpsStore.ts:367-460` / `claudeMdStore.ts:418-510`：

- 把现有 `categories.map(c => c.name)` 作为已有列表喂给 LLM
- LLM 返回 `suggested_category: string`（一个 name）
- 若不在已有列表中，创建新 Category（`addCategory(name, color)`，append 到末尾）
- Skills/MCPs `metadata.category = name`；ClaudeMd `categoryId = updatedCategories.find(c => c.name === result.suggested_category)?.id`

**关键事实**：自动分类**只产出 name**，不感知父子关系。引入 hierarchy 后这套链路在"创建新分类"路径上需要决策：放到根、放到默认 Other、还是让 LLM 也建议父类？

### 4.4 Sidebar V3 Reorder 现状（不能破坏）

参 `.dev/sidebar-reorder/02_design_spec.md` V3 / `03_tech_plan.md` V3 / `04_implementation_plan.md` V3。压缩列出本任务必须严格保留的 V3 不变量：

- 4px 激活 distance（保 click navigate 不抢）
- 两段 lift：吸盘 80ms（scale 1.0→1.04） + 拉离 120ms（DragOverlay 接管）
- DragOverlay 多层 hsl 阴影
- 12px 连续磁吸（quadratic gravity well + 帧间 lerp，**不是阈值瞬移**）
- 220ms cascade（cubic-bezier(0.16, 1, 0.3, 1)，无 stagger）
- distance-aware settle：< 4px → 0ms（磁吸已对齐则跳过 dropAnimation）；≥ 4px → `min(280, 120 + delta × 0.5)`
- Cancel snap-back：280ms cubic-bezier(0.32, 0.72, 0, 1)
- DndContext modifiers = `[snapModifier]` 仅磁吸，DragOverlay modifiers = `[restrictToWindowEdges]` 仅防出窗
- 全套 CSS token：`--color-accent`、`--ease-drag*`、`--duration-drag-*`
- DATA_MUTEX 串行 + apply_reorder pure function + ENSEMBLE_DATA_DIR 测试隔离
- categoriesVersion / tagsVersion 版本协议防 autoClassify race
- enqueueReorder 串行 IPC 队列保证用户最近一次拖拽是 canonical
- `data-no-dnd` + `CustomMouseSensor` 双保险
- 编辑/新增态 SortableContext 全局 disabled 防 input 被打断
- KeyboardSensor + sortableKeyboardCoordinates + screenReaderInstructions（VoiceOver 用 name 不用 UUID）
- prefers-reduced-motion 全套尊重

新增的 hierarchy 拖拽逻辑必须**叠加**在以上之上，**任何 V3 不变量被破坏 = P0 回归**。

### 4.5 现有 Sidebar 组件结构（V3 已落地）

```
src/components/sidebar/
├── index.ts
├── CategoryInlineInput.tsx       91 行  — 编辑/新增 input（双击/+ 触发）
├── CategoryRowContent.tsx        65 行  — 共享渲染：ColorPicker dot + name + count
├── DragOverlayCategoryRow.tsx           — DragOverlay thin wrapper
├── SortableCategoriesList.tsx   316 行  — DndContext 容器（**核心改造点**）
├── SortableCategoryRow.tsx      136 行  — useSortable + 4px activation
├── TagInlineInput.tsx
├── TagPillContent.tsx
├── DragOverlayTagPill.tsx
├── SortableTagsList.tsx         314 行
├── SortableTagPill.tsx          127 行
└── dnd/
    ├── animations.ts             28 行  — SNAP_DISTANCE_PX、CATEGORY_DROP_ANIMATION
    ├── announcements.ts          86 行  — VoiceOver
    ├── CustomMouseSensor.ts             — data-no-dnd 跳过逻辑
    └── snapModifier.ts          126 行  — 连续磁吸 modifier
```

`MainLayout.tsx:96-104` 计算 `categoriesWithCounts`，传给 `Sidebar`，最终落到 `SortableCategoriesList`。`MainLayout.tsx:483-492` 是 `handleReorderCategories`，调用 `appStore.reorderCategories`（两阶段提交）。

### 4.6 已知的"会展示分类"的位置（必须全列入 04_impl 的覆盖清单）

| 位置 | 文件:行 | 当前形态 | 与 hierarchy 的关系 |
|---|---|---|---|
| Sidebar 左侧栏 | `Sidebar.tsx:289-328` | 1D 列表 | **核心改造点**：渲染树形 |
| CategoryPage（路由 `/category/:id`） | `CategoryPage.tsx` | 单 category 聚合视图 | 必须决定父级聚合策略 |
| Skill 详情页 Category dropdown | `SkillDetailPanel.tsx:238-247, 413-417` | flat options | 需决定 dropdown 是否树形 |
| MCP 详情页 Category dropdown | `McpServersPage.tsx:219-228, 428-431` | flat options | 同上 |
| ClaudeMd 详情页 / 导入弹窗 | （需 grep 确认） | flat? | 同上 |
| `categoriesWithCounts` 计数 | `MainLayout.tsx:96-104` | 单 category 计数 | 需决定父级是否汇总子级计数 |
| Skills 列表过滤（侧边栏点击 → URL 路由） | `MainLayout.tsx:236-239`, `SkillsPage.tsx` (待读) | 单 category 过滤 | 同 CategoryPage |
| 自动分类 prompt | `classify.rs:50-95`, `skillsStore.ts:323`, `mcpsStore.ts:367`, `claudeMdStore.ts:418` | 喂入 category names | 需决定是否传入 hierarchy / 是否建议父类 |
| `utils/constants.ts` | `getCategoryColor(name)` | 静态 name → color 兜底 | 不破坏 |
| Trash 恢复路径 | `commands/trash.rs:401-436` | `category_id` 字段保留 | 子类删除/恢复链路 |
| Scenes `categoryFilter` | `scenesStore.ts:21,81` | 单 string | 需检查具体语义 |

调研阶段必须 **grep 全 codebase** 重新枚举（参 `.claude/rules/grep-before-enumerate-shared-resource.md`）确保无遗漏，**不能依赖此表**。

## 5. 隐含的前提与边界（推演用户未明说）

用户原话只说"加二级分类"。表面是"加 parentId 字段"，但深挖：

1. **聚合语义**：点击父类应该看到所有子类下的内容（标准 ToDoList/Notion/Things 习惯）。本任务必须实现。
2. **拖入即变子类、拖出即变独立**：用户原话明确，且这是行业标准（Things 3 / Linear / Notion / Todoist 都有）。意味着 hover 在某个 row 的"内部水平区域"时是 "make child"，hover 在行间是 "reorder same level"。
3. **二级仅一层**：用户原话 "二级"，明示**不要无限嵌套**。本任务硬限制 max depth = 2（root + 1 层 child）。这是简化关键，所有算法/视觉规格按此设计。
4. **极简优先**：用户原话"不要任何过多的元素"——意味着**禁止**：
   - chevron/箭头展开收起标识（除非可证明必要）
   - 缩进显眼指示线/虚线（最多用左 padding 表达）
   - 父类的 "X children" 计数 badge（除非确实必要）
   - 任何强装饰
   只保留：**必要的左缩进 + 必要的 hover/drop 状态反馈 + 必要的可达性**。
5. **拖拽细节物理感**：当把一个 row 拖向另一个 row 的"内部中心区"时，需要明确"这是 drop into 而非 reorder"的视觉反馈，并且物理感与现有 V3 一致（连续磁吸、spring 让位）。
6. **键盘可达**：现有 V3 已有 KeyboardSensor + sortableKeyboardCoordinates。新增 hierarchy 操作必须有键盘等价（最小化新增热键，最好复用现有方向键 + 扩展 left/right 表达 in/out 缩进）。
7. **数据迁移零风险**：`Vec<Category>` 加 optional `parent_id` field 后，旧 data.json 反序列化必须仍然成功（serde `#[serde(default)]` 保证）。
8. **现有功能零回归**：包含但不限于 V3 Reorder 不变量（§4.4）。
9. **Auto-classify 路径**：选 Path A 简化（暂不让 LLM 建议父类，新分类一律落到根）；用户后续手动拖入子类层级。这是低风险 + 用户可控。Path B（让 LLM 也建议父类）放到 v2 之后。
10. **导出/导入兼容**：本项目目前无导出导入特性，可暂不考虑。
11. **跨设备 sync**：项目无云同步，可暂不考虑。
12. **Apple/Linear 级设计标准**：意味着所有边距/字号/圆角/动效曲线/timing 都需有依据，token 化，不能"凭感觉"。

## 6. 关键决策需要在调研后回答

| 编号 | 问题 | 候选 | 评判维度 |
|---|---|---|---|
| **D1** | category 引用统一为 id 还是保留 name？ | (A) Skills/MCPs 全迁移到 categoryId 跟 ClaudeMd 一致；(B) 保留 name + 全树名字唯一约束；(C) 复合 path 字符串 `parent/child`；(D) 维持现状 + 名字唯一仅在同 parent 下 | 数据迁移成本、与现有 autoClassify 兼容、与现有 `getCategoryColor` 兼容、未来扩展性、代码改动面积 |
| **D2** | 数据模型形状 | (A) `parent_id: Option<String>` + Vec 顺序；(B) 双层 Vec（categories 是 root，每个 root 内嵌 children）；(C) 树字段 `path: Vec<String>` materialized | 序列化兼容、查询性能、reorder 算法复杂度 |
| **D3** | dnd-kit 模式 | (A) Sortable Tree 单 SortableContext + 投影深度（dnd-kit 官方 example）；(B) 父类一个 SortableContext，每个子组一个嵌套 SortableContext；(C) 自研 | 物理感是否破坏 V3、代码改动面积、键盘可达 |
| **D4** | "拖入"激活区与视觉 | (A) 行的水平 indent（>16px）触发 in、< 触发 reorder；(B) 行的右半部触发 in；(C) 长 hover ≥ 250ms 触发 in | 直觉、误触率、与现有 4px 激活兼容 |
| **D5** | 父类是否可拖拽 | (A) 父类只能 reorder 父类层、不可成子；(B) 父类拖入另一父类时**整个子树**一起搬；(C) 父类拖入只允许成同级 | 复杂度、用户心智模型、子树丢失风险 |
| **D6** | 子类拖到根的方式 | (A) 拖到任意根级 row 之间；(B) 拖到顶部空白专用区；(C) 拖到当前父类的左外侧（缩进减少触发 promote） | 直觉、误触 |
| **D7** | 父类聚合视图 | (A) CategoryPage 显示父类自己的内容 + 所有子类的内容；(B) 父类只显示自己；(C) 父类 + 可切换 toggle | 用户期望、实现复杂度 |
| **D8** | 父类 count 数字 | (A) 仅自身；(B) 自身 + 所有子级总和；(C) 显示 `X (+N)` | 极简、信息密度、与设计哲学契合 |
| **D9** | dropdown 中如何展现树 | (A) 缩进 + 不可选父类；(B) 缩进 + 父类可选；(C) 两段：父类标题 + 子类列表 | 极简、键盘导航、搜索体验 |
| **D10** | 视觉缩进量 | (A) 12px；(B) 16px；(C) 20px；(D) 24px | macOS Finder/Notes 对照、与现有 row 26px 圆点不冲突 |
| **D11** | 缩进表达介质 | (A) 仅 padding-left；(B) 极淡 1px guide line；(C) 仅 dot 颜色淡化 | 极简、可识别 |
| **D12** | 二级展开/折叠 | (A) 始终展开（极简）；(B) 默认展开 + 可折叠 + 状态持久化；(C) 默认折叠 | 信息密度、用户控制、空间占用 |
| **D13** | hierarchy 失败模式 | (A) 后端拒绝（产生 cycle / max depth 超限）；(B) 前端 prevent 不允许 drop；(C) 自动平摊到根 | 健壮性 |
| **D14** | 自动分类对父级感知 | (A) 暂不感知，新分类落根；(B) prompt 喂入树并要求建议父类；(C) 后续 v2 | 范围控制 |

调研结束后这 14 个决策必须**全部有据可依**地落到 02/03 中，并在 05_review 中至少 2 名以上专家独立验证。

## 7. 风险登记（评审清单必查）

1. ☐ V3 Reorder 全套不变量（§4.4 列表）零回归。
2. ☐ 旧 data.json 反序列化仍然成功（serde default 保证）。
3. ☐ Skills/MCPs 的 category name 引用在 hierarchy 引入后仍能正确解析（D1 决策落地）。
4. ☐ autoClassify 创建新 category 路径不被破坏。
5. ☐ CategoryPage / Sidebar nav 的"父类聚合"语义一致（D7）。
6. ☐ count 的派生算法（MainLayout）正确处理 hierarchy（D8）。
7. ☐ Skill/MCP 详情页的 Category dropdown 仍可用，新增树形渲染时不破坏其它 dropdown。
8. ☐ Trash / 恢复链路在子类被删除时正确处理（孤儿子类的 fallback）。
9. ☐ Scenes `categoryFilter` 语义验证。
10. ☐ ContextMenu Rename / Delete 在父类与子类下都正确工作（含 Delete 父类后子类的归宿）。
11. ☐ 拖拽激活 4px 仍然区分 click→navigate（hierarchy drop 检测不能在 < 4px 时触发）。
12. ☐ 磁吸 modifier 与新的 "drop into" 语义共存，不互斥。
13. ☐ KeyboardSensor 路径在 hierarchy 操作下仍可达（左/右键缩进或额外快捷键）。
14. ☐ ScreenReader announcements 对父子操作有正确措辞。
15. ☐ prefers-reduced-motion 下 hierarchy 视觉降级一致。
16. ☐ Refresh 按钮在 hierarchy reorder 期间 disabled 一致。
17. ☐ "Show X more" 折叠态在 hierarchy 下的语义需要决定（按父类计数 or 总计数）。
18. ☐ Tags 不受影响（本任务范围只动 categories；Tags 继续 1D rectSortingStrategy）。
19. ☐ `getCategoryColor` 在 utils/constants 的兜底逻辑保持工作。
20. ☐ 单元测试 + 集成测试 + 并发测试 全绿。

## 8. 不在本次范围

- 三级及更深的嵌套（max depth = 2，硬限制）
- Tags 的 hierarchy（用户只说 Categories）
- autoClassify 智能建议父类（v2 候选）
- 跨设备 sync / 协作 reorder（项目无）
- Force Touch / 三指拖（与 sidebar-reorder V3 一致，不实现）

## 9. 文档作者要求（给后续 SubAgent 的）

- 所有 02/03/04 文档必须**明确版本号**（V1, V2, ...）+ Revision History 标记跨文档 cascade footprint（参 `.claude/rules/cross-document-cascade-discipline.md`）。
- 所有"等价"声称必须遵守 `.claude/rules/validate-numerical-equivalence-claims.md`（数值等价必须 reproduce；否则降级为"形态相近"措辞）。
- 所有引用第三方库行为的声称必须遵守 `.claude/rules/verify-third-party-behavior-firsthand.md`（必须 link 到 node_modules 源码或 .d.ts）。
- Plan 必须遵守 `~/.claude/rules/plan-as-research-design.md`（先调研后规划，先研究设计后下结论）。
- 评估顺序必须遵守 `~/.claude/rules/hard-constraints-before-soft-evaluation.md`（不变量评估在前，体验评估在后）。
- 所有跨 SubAgent 共享的中间产物必须落 md 文件，禁用 Response 通道。
