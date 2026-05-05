# Category Hierarchy — Design Spec V2

> **Decisional 文档**。视觉/动效细节冲突时以本文档为准（仅次于 `_synthesis_decisions.md` 的 14 决策——那些已锁定，本文档只能落地不能重新评估）。
> 视觉与动效以外的技术架构细节由 `03_tech_plan.md` 决定；任务拆分由 `04_implementation_plan.md` 决定。
> 本文档全程沿用 `.dev/sidebar-reorder/02_design_spec.md` V3 的结构与措辞风格——这是项目内已经验证过的高质量模板。

## Revision History

**V2（V1 → V2 修订；2026-05-04）**

V1 经 6 名 reviewer 评审后，由主 Agent 整合 17 项原始 P0 → 15 项 unique P0（参 `05_review/_v2_patch_plan.md`）。本 V2 严格按 `_v2_patch_plan §3` 主 Agent 锁定的修订决议落地，**不重新评估任何 14 决策、不偏离 §3 决议**。

修订内容（按 P0/P1 编号映射，全部见 `_v2_patch_plan §1` 与 §3）：

- **§2.4（V2 修订）**：Chevron 完整 `<button>` attributes 表（含 `data-no-dnd="true"` + `onMouseDown stopPropagation` + `onKeyDown stopPropagation` + `aria-expanded` + `tabIndex={0}`）；keyboard 路径明确（chevron Tab 可达、Space/Enter 触发 toggle，不冒泡到 row dnd-kit listeners）。**主修来源**：reviewer A P0-2、reviewer B P0-1。
- **§2.5（V2 修订）**：DragOverlay padding 论据改为引用 `DragOverlayCategoryRow.tsx:21` 实现行号（V3 不变量 #20 重述为代码事实，去除"V3 §2.2 隐含"二次推断）。**主修来源**：reviewer A P0-5。
- **§2.7（V2 修订）**：Drop indicator 几何描述全部用 `.drop-indicator-h` 实际实现（block + `margin: 0 2px` + transform 驱动）；hierarchy 缩进通过 wrapper `<div style={{ paddingLeft: depth * 16 }}>` 自然继承，**不修改 indicator 自身几何**。**主修来源**：reviewer A P0-1。
- **§2.14（V2 修订）**：完整 dwell 状态机（OUT / HOVER_NEAR / DROP_INTO_READY 三态 + 转移规则）；opacity 0.95↔0.5 仅 cancel 状态用，dwell 阶段不变 0.95；边界抖动场景显式声明。**主修来源**：reviewer A P0-4。
- **§2.15（V2 修订）**：localStorage 命名改回 `expandedCategories: Set<string>`（与 R3/R4 原稿对齐），默认含所有有 children 的父类；折叠 = `delete(parentId)`、展开 = `add(parentId)`；onDragStart 期间 `dragOverrideExpand = expandedSet ∪ {drag-path-parents}` 临时合并；onDragEnd 恢复 expandedSet。**主修来源**：reviewer A P0-3。
- **§2.20（V2 修订）**：父类 ContextMenu 仅添加 "Promote to root"（仅子类显示），**不实现** "Move to Parent..." submenu（推迟到后续；子类拖入新父类已通过 X 阈值实现）。**主修来源**：reviewer B P0-2 修订决议（_v2_patch_plan §3.7）。
- **§2.21（V2 新增）**：父类删除 confirmation dialog（父类有 children 时弹 dialog；正文措辞按 _v2_patch_plan §3.6）。**主修来源**：reviewer B P0-3 / _v2_patch_plan §3.6。
- **§2.22（V2 编号变更）**：Anti-pattern 清单（V1 原 §2.21；新增 chevron `<div>` 仿冒、indent hardcode 等条目）。
- **§3（V2 修订）**：Apple HIG Outline Views 引证补全（普通浏览态 ←/→ 折叠/展开复用 NSOutlineView 标准）；chevron keyboard 模态切换显式声明。**主修来源**：reviewer B P0-1 / _v2_patch_plan §3.12。
- **§6.3（V2 修订）**：dwell 状态机定义 + `≤ 600ms` 实测目标 + dwell 退路（如显著则降至 0ms 仅依赖 12 px 翻转）+ retreat 路径。**主修来源**：reviewer B P1-1（P1-8 in patch plan）。
- **§7（V2 修订）**：V3 不变量编号偏移修订（拆 V1 #8 为 #8 + #9 → 共 23 项，与 03 §12 一致）。**主修来源**：reviewer E P1-1。
- **§9 / §8.1**：新增 dwell 测试 + chevron keyboard 测试 acceptance；共 **42 项**（27 客观 + 12 V3 行为零回归 + 3 主观兜底）。
- **§10（V2 修订）**：Apple HIG Outline Views / NSOutlineView 引证。
- **Document Authority Ranking**：last modified 全部更新为 2026-05-04；02 / 03 / 04 标 V2 状态。

**Cascade footprint（V1 → V2，按 cross-document-cascade-discipline.md 要求显式声明）**：

- §2.4 chevron `<button>` 完整 attributes → invalidates `03_tech_plan §5.3` SortableCategoryRow chevron 注入位置 → **必须 patch 03 V2**
- §2.5 DragOverlay padding 引证改源码行号 → invalidates `03_tech_plan §5.5` DragOverlay 注释 → **必须 patch 03 V2**
- §2.7 drop indicator 几何重述（margin-only） → invalidates `03_tech_plan §5.1.A` getProjection indicator wrapper 描述、§7.2 CSS（`.drop-indicator-h` 不需追加 left/width transition）、§5.2 onDragMove indicator state 描述 → **必须 patch 03 V2**
- §2.14 dwell 状态机 → invalidates `03_tech_plan §6.4` dwell timer 实现（OUT/HOVER_NEAR/DROP_INTO_READY 三态机映射） + `04_implementation_plan T2d / T3a` acceptance → **必须 patch 03 V2 + 04 V2**
- §2.15 localStorage 命名反转 → invalidates `03_tech_plan §5.2 COLLAPSED_KEY / loadCollapsedFromLocalStorage / persistCollapsed` 全部命名（应改为 `EXPANDED_KEY` / `loadExpandedFromLocalStorage` / `persistExpanded`） + `04 T3a localStorage 持久化` 任务 → **必须 patch 03 V2 + 04 V2**
- §2.20 ContextMenu 简化（无 Move to Parent submenu） → invalidates `03_tech_plan §5.7 MainLayout ContextMenu` 的 Move to Parent 段（删除）+ `04 T3d 增加 Promote to root 项；不增加 Move to Parent submenu` → **必须 patch 03 V2 + 04 V2**
- §2.21 父类删除 confirmation → 新增 03 V2 § / 04 V2 任务卡（HCI-3 / DATA-2）→ **必须 patch 03 V2 + 04 V2**
- §3 模态切换 + HIG 引证 → invalidates `03_tech_plan §5.6 announcements.ts` HierarchyContext 命名（`collapsedIds` 应改 `expandedIds`）+ `04 T3a` announcements 任务 → **必须 patch 03 V2 + 04 V2**
- §7 V3 不变量 22 → 23 项 → invalidates 04 V2 任务卡内"V3 不变量 R-V3-X"编号引用 → **必须 patch 04 V2**

V3 不变量保留核对：23 项与 03 §12 + 04 R-V3-1~R-V3-23 对齐（V2 版本）。

**V1（首版；归档）**

- 基于 `_synthesis_decisions.md` §3 的 14 决策定锤落地视觉/动效规格。
- 基线沿袭 `.dev/sidebar-reorder/02_design_spec.md` V3 的全部不变量。
- 新增 hierarchy 专属规格：父子行差异化、chevron disclosure、drop-into 反馈、缩进过渡、折叠/展开持久化、键盘 promote/demote、聚合视图与父类聚合 count。
- 仅引入 1 个新 token（`--indent-step: 16px`）；其余动效曲线/时长/颜色全部复用 V3 已落地 token。

## Document Authority Ranking

按 `~/.claude/rules/document-authority-ranking.md`：

| Level | Document | Last Modified | Purpose |
|---|---|---|---|
| Decisional | `_synthesis_decisions.md` | 2026-05-04 | 14 决策定锤（D1–D14），最高权威 |
| Decisional | `05_review/_v2_patch_plan.md` | 2026-05-04 | 主 Agent 锁定的 V1 → V2 修订决议（15 P0 + 11 P1） |
| Decisional | `02_design_spec.md` V2（**本文档**） | 2026-05-04 | 视觉/动效/交互规格 |
| Decisional | `03_tech_plan.md` V2 | 2026-05-04 | 库选型 / 数据模型 / API / 架构 / 迁移 |
| Decisional | `04_implementation_plan.md` V2 | 2026-05-04 | 任务拆分与执行步骤 |
| Decisional | `.dev/sidebar-reorder/02_design_spec.md` V3 | 2026-05-03 | V3 不变量基线（hierarchy 必须叠加在其上不破坏） |
| Decisional | `.dev/sidebar-reorder/03_tech_plan.md` V3 | 2026-05-03 | V3 技术不变量基线 |
| Decisional | `.claude/rules/design-language.md` | 2026-05-04 | 项目级设计语言 Rule（每 session 自动加载；token 化、no-stagger、no-overshoot、verify-firsthand 等硬底线） |
| Referential | `00_understanding.md` | 2026-05-04 | 任务边界、隐含前提、风险登记 |
| Referential | `01_research/r1_data_model.md` | 2026-05-04 | D1 / D2 / D13 论据 |
| Referential | `01_research/r2_dnd_tree_architecture.md` | 2026-05-04 | D3 / D5 / D6 论据；20 V3 不变量回归核对一手源 |
| Referential | `01_research/r3_visual_interaction_design.md` | 2026-05-04 | D4 / D10 / D11 / D12 主要视觉素材 |
| Referential | `01_research/r4_hci_evaluation.md` | 2026-05-04 | D7 / D8 / 键盘 / 极简删除清单论据 |
| Referential | `01_research/r5_impact_enumeration.md` | 2026-05-04 | 影响面 grep 兜底闸 |
| Referential | `01_research/r6_classification_count_filter.md` | 2026-05-04 | D14 / count / filter 行为论据 |
| Referential | `01_research/r7_design_philosophy_distillation.md` | 2026-05-04 | 设计语言素材 |
| Historical | `05_review/01_reviewer_a_design.md` | 2026-05-04 | A reviewer P0/P1 来源 |
| Historical | `05_review/02_reviewer_b_hci.md` | 2026-05-04 | B reviewer HCI P0/P1 来源 |

**冲突解决规则**：
- 同级冲突 → 向用户提问（Open Question）。
- 跨级冲突 → 自动以高层为准。
- V2 落地中出现"reviewer 个别 patch 与 _v2_patch_plan §3 决议冲突" → 一律以 _v2_patch_plan §3 决议为准（主 Agent 已整合）。
- V2 落地中出现"reviewer 提议某 P0 修订与 14 决策本质冲突" → 标记为 P0 警告而非默默修改决策（至本 V2 完稿时未发生）。

---

## 1. 设计哲学

V3 §1 已确立："macOS 原生气质为基底，借 Things 3 的'吸盘 + 拉离'两段 lift 与 Linear 的 spring 让位增加物理感，全程 ≤ 560ms，所有动效用 token 化曲线/时长。" V2 在 hierarchy 议题上把它收紧为三句：

1. **二级是表达层级，不是装饰层级**。父子关系**仅靠左 padding（`var(--indent-step) = 16px`）+ chevron disclosure 控件**承担。不引入 indent guide line、不淡化子类 dot/字色、不加 children-count badge、不加父行 hover 差异化、不加 ghost row。**子类的视觉权重等同父类**；hierarchy 由位置说话，不由装饰说话。

2. **chevron 是 disclosure control，不是 ornament**。chevron 仅在父类**有子类时**渲染（无子类的 root row 视觉与 V3 现状完全一致，**不留 chevron 占位**）。chevron 复用 macOS Finder list view / Notes / Things 的 ▸/▾ 习惯（lucide-react `ChevronRight` / `ChevronDown`，10×10 px，`#A1A1AA`），承担"折叠/展开"功能——HIG Sidebars 与 Outline Views 页明文 endorse（参 §3 / §10）。

3. **物理感由 V3 已有动效承担**。chevron 旋转、子类展开/折叠的高度过渡、缩进过渡、drop-into 反馈、cascade 让位——全部复用 V3 的 `cubic-bezier(0.16, 1, 0.3, 1)` (`--ease-drag`) 与 `220ms` (`--duration-drag-reorder`) / `120ms` / `150ms` token。**不为 hierarchy 单独引入新曲线**。"一种物理在不同对象上的同时呈现"，不是"多种动画在叠加"——这条比"全部用 spring"更克制；spring 与 cubic-bezier **形态相近、不数值等价**（V3 §2.4 已撤销等价声称），按 `validate-numerical-equivalence-claims` 规则本 V2 不重新发明。

> 原则的硬底线 — 详见 §2.22 Anti-pattern 清单。

---

## 2. 视觉规格表

视觉规格表沿用 V3 §2 的"行 / 元素 / 状态"分项格式，对每一项明确 hierarchy 行为。

### 2.1 Row Anatomy — 父类行（root level，无子类）

**hierarchy 引入后视觉与现状完全一致**——意味着无子类的 root row 是 V3 row 的零变更映射，便于回归。

| 属性 | 值 | 出处 |
|---|---|---|
| 高度 | `h-8` = 32 px | `Sidebar.tsx:295` 现状 |
| padding-left | `px-2.5` = 10 px | 同上 |
| padding-right | `px-2.5` = 10 px | 同上 |
| 字号 | `text-[13px]` | `CategoryRowContent.tsx:48` |
| 字色（default） | `#52525B` | 同上 |
| 字色（active） | `#18181B` + `font-medium` | 同上 |
| Background（default） | transparent | `Sidebar.tsx:295` |
| Background（hover） | `#F4F4F5` (`var(--color-bg-tertiary)`) | 同上 |
| Background（active） | `#F4F4F5` | 同上 |
| 圆角 | `rounded-[6px]` (`var(--radius-md)`) | 同上 |
| Cursor（hover） | `default`（继承 V3 §2.8） | V3 token |
| Gap (dot ↔ name) | `gap-2.5` = 10 px | 同上 |
| Dot 尺寸 | **8 × 8 px** (`w-2 h-2`) | `ColorPicker.tsx:178`（**校正**：任务卡推测的 14 px 是错的；以源码为准） |
| Leading 元素顺序 | `[dot 8×8] · [gap 10] · [name flex-1 truncate] · [count 11px tail]` | 与 V3 一致 |

### 2.2 Row Anatomy — 父类行（root level，**有子类**）

唯一差异：在 leading 端**新增 chevron 占位 16 px**（chevron icon 10 px + gap 6 px）。其余视觉规则与 §2.1 完全一致。

| 属性 | 值 |
|---|---|
| 高度 | 32 px（不变） |
| Leading 元素顺序 | `[chevron 10×10] · [gap 6] · [dot 8×8] · [gap 10] · [name flex-1 truncate] · [count 11px tail]` |
| chevron 起点（leading edge） | row.padding-left = 10 px（chevron 中心对齐 row 中心 baseline） |
| chevron icon | `ChevronRight` (collapsed) / `ChevronDown` (expanded)，from `lucide-react` |
| chevron icon size | **10 × 10 px**（macOS Finder list view 实测 ≤ 10 px；项目"Show X more" 按钮 chevron = 12 px label 旁；hierarchy chevron 是结构标记更收敛）|
| chevron color (default) | `#A1A1AA` (`var(--color-tertiary)`) |
| chevron color (hover row) | `#71717A` (`var(--color-secondary)`) |
| chevron color (active 父类) | `#18181B` (`var(--color-primary)`) |
| chevron rotation timing | `120 ms var(--ease-drag)`（与"Show X more"切换节奏一致；与项目 `--duration-drag-snap = 80ms` 不同——chevron 是 disclosure 不是磁吸） |
| chevron click hit-target | leading **16 px**（chevron + gap）= 仅切换 expand/collapse、**不触发 row click navigate** |
| 其余 | 同 §2.1 |

> **chevron click 与 row click 必须 hit-target 分离**：用户点 chevron 区域是想展开/折叠；点 row 名字才是想 nav。两者必须分开 hit-target。详见 §2.4 与 §6.4。

### 2.3 Row Anatomy — 子类行（depth = 1）

子类行在视觉权重上**等同父类**（D11 决策：仅缩进表达层级，不淡化）。**不为子类预留 chevron 空间**——max depth = 2，子类不可能有自己的子类，所以子类一定不需要 disclosure control。

| 属性 | 值 | 论据 |
|---|---|---|
| 高度 | `h-8` = 32 px | macOS Finder/Notes 子文件夹高度与父级一致；hierarchical 视觉关系全靠 indent |
| **padding-left** | `10 px (基础) + var(--indent-step) = 16 px` = **26 px** | D10 = 16 px（_synthesis_decisions §3 锁定；HIG / Things 3 / Notes / Finder list view 一致） |
| padding-right | `10 px`（与父类一致） | — |
| 字号 | `text-[13px]`（与父类一致） | D11 决策：字号一致 + 颜色一致 = "信息层级靠位置而非装饰" |
| 字色 (default) | `#52525B`（**与父类同**） | D11 决策——不淡化用户语义 |
| 字色 (active) | `#18181B` + `font-medium`（与父类同） | — |
| Background (default/hover/active) | 与父类完全相同的三态色 | — |
| Dot 尺寸与颜色 | **8 × 8 px、用户选定颜色**（与父类完全一致） | D11 决策——不淡化、不缩小 |
| Cursor (hover) | `default` | V3 §2.8 |
| Gap (dot ↔ name) | 10 px（与父类一致） | — |
| Leading 元素顺序 | `[dot 8×8] · [gap 10] · [name flex-1 truncate] · [count 11px tail]` | 与父类无 chevron 时同 |

> 子类 row 的 leading 直接 padding-left 26 px 到 dot 起点；**不为子类预留 chevron 空间**。

### 2.4 Chevron — disclosure control 行为（**V2 修订：完整 attributes 表 + keyboard 路径**）

[**P0-VIZ-2 修订**] V1 把"chevron click 与 row click 分离" 仅作行为描述；V2 显式锁定 chevron 的完整 element attributes 表 + keyboard 路径，吸收 V3 P0-2 教训（dnd-kit listeners chain not shadow），与项目内 ColorPicker 同路线（`CategoryRowContent.tsx:35-42` 实证）。

**Chevron `<button>` 完整 attributes**：

```
<button
  data-no-dnd="true"                          ← short-circuit CustomMouseSensor (实证：CustomMouseSensor.ts:5-20)
  aria-label="Toggle ${categoryName} children"
  aria-expanded={expanded}                    ← screen reader 状态
  tabIndex={0}                                ← 默认 0；不要 -1，否则键盘不可达
  onMouseDown={(e) => e.stopPropagation()}    ← V3 ColorPicker pattern (CategoryRowContent.tsx:42)
  onKeyDown={(e) => {                         ← V2 新增：防 Space/Enter 触发 row dnd-kit lift
    if (e.key === ' ' || e.key === 'Enter') e.stopPropagation();
  }}
  onClick={(e) => {
    e.stopPropagation();
    toggleExpand(categoryId);                 ← 仅切换持久化状态；不影响 row click navigate
  }}
>
  <ChevronRight | ChevronDown size={10} />
</button>
```

**为什么需要 `onKeyDown stopPropagation`**：

V3 P0-2 修复教训（`SortableCategoryRow.tsx:82-101` 实证）：dnd-kit `useSortable` 在 row 上注入 `listeners.onKeyDown`；若不 chain 处理或 stopPropagation，`<button>` 焦点状态下按 Space → 同时触发 chevron click + row 的 dnd-kit lift。`onKeyDown stopPropagation` 让 keyboard event 在 chevron `<button>` 自身处停止冒泡，不到达 row 的 dnd-kit listener。

**chevron 行为表（与 V1 一致；元素层 attributes 由上方列出）**：

| 状态 | chevron 行为 |
|---|---|
| 父类有 ≥ 1 个 child + 展开态 | 渲染 `ChevronDown` |
| 父类有 ≥ 1 个 child + 折叠态 | 渲染 `ChevronRight` |
| 父类**无** child | **不渲染 chevron**（DOM 无该元素，row leading 与 §2.1 完全一致；不留 16 px 空白）|
| 子类（depth = 1） | 永不渲染 chevron（max depth = 2 硬约束） |
| 鼠标单击 chevron 区域 (leading 16 px) | 切换该父类的折叠/展开状态；不触发 row click navigate；写入 localStorage（详 §2.15） |
| 鼠标单击 row 其余部分 | 触发 row click navigate（保留 V3 行为）；如折叠态，保持折叠（不联动展开） |
| 键盘 Tab 进入 chevron | chevron 获得 focus ring（继承 design-language.md `focus-visible:ring-*`）|
| 键盘 chevron focused + Space/Enter | 触发 chevron 自身 toggle（与 mouse click 等价）；**不**冒泡到 row dnd-kit lift |
| 键盘 row focused + ←/→（普通浏览态） | 切换折叠/展开（详 §3）；与 chevron click 等价路径，但通过 row 上的 ←/→ 直达 |

**Tab 顺序**：`row → 同 row 内的 chevron（如有） → 下一 row`。chevron 是 row 的一个子元素，但通过 `tabIndex={0}` 显式可达。

**justDroppedRef 50ms guard 与 chevron 关系**：chevron click **豁免**该 guard——chevron 在 `data-no-dnd` 域内，与 row click 完全独立。drop 完成 50ms guard 内 chevron 仍可点击 toggle。

**Anti-pattern 锁定**（详细列在 §2.22）：
- chevron 不允许在 hover 时变色或放大（仅父类 row hover 时 chevron 跟随取 `#71717A`，非 chevron 自变化）；
- chevron 不允许在折叠/展开时整行 flash；
- chevron rotation 仅允许 `transform: rotate(...)`，不允许 scale/translate；
- chevron 不允许 spring 物理（cubic-bezier 一致）；
- chevron 不能用 `<div role="button">` 仿冒——必须真 `<button>`，否则键盘可达性 + screen reader 行为破坏。

### 2.5 DragOverlay 内容（hierarchy 下）（**V2 修订：padding 论据改源码引证**）

[**P0-VIZ-5 修订**] V1 §7 #20 把 "DragOverlay 不带原位 padding" 归为"V3 §2.2 隐含"——这是 V1 二次推断，违反 verify-third-party-behavior-firsthand。V2 重述为**代码事实**：DragOverlay 显示与 inline row 同 padding（`px-2.5`）由 `DragOverlayCategoryRow.tsx:21` 的 className 写死，**不读 row prop、也不携带 26 px 缩进**。

V3 §2.2 已规定 DragOverlay 内容为 ColorPicker dot + 名字、**省略 count**。hierarchy 下叠加：

| 状态 | DragOverlay 渲染 |
|---|---|
| 拖动父类（无论是否有子类） | DragOverlay 仅渲染**该父类自身的 row clone**（不显示 chevron、不显示子树）。`CategoryRowContent showCount={false}` |
| 拖动子类 | DragOverlay 渲染该子类自身的 row clone（**不携带 26 px 缩进**——仅 `px-2.5` = 10 px 与所有 row 同 padding）|
| 拖动期间 over slot | DragOverlay 视觉规则、阴影、scale、opacity 全部继承 V3 §2.2 不变 |

**DragOverlay padding 实现引证**（verify-third-party-behavior-firsthand）：

```
src/components/sidebar/DragOverlayCategoryRow.tsx:19-25
─────────────────────────────────────────────────────
export function DragOverlayCategoryRow({ category }: Props) {
  return (
    <div className="drag-overlay-row h-8 px-2.5 flex items-center gap-2.5">
      <CategoryRowContent category={category} showCount={false} />
    </div>
  );
}
```

`px-2.5` 是 className 写死（10 px / 边）。**不接受 row prop**、**不接受 depth prop**、**不接受 paddingLeft prop**——这就是 hierarchy 下"DragOverlay 不携带 26 px 缩进"的代码层保障。任何想让 DragOverlay 跟随子类深度的尝试都需要修改此 className 或新增 prop——V2 hierarchy 规格**不修改此 component**。

> **关键论据**（取代 V1 误归"V3 §2.2 隐含"）：单一 row clone（never carry subtree visually）= D5 决策"父类拖拽时整子树**逻辑层**跟随，但**视觉层不渲染子树**"。这与"DragOverlay 已 omit count" 是同一族克制规则——视觉只承担最低必要信息。
>
> 子类 DragOverlay 不携带 26 px 缩进的论据：拖动期间深度有两种稳定态（root / child），由 dragOffset.x 翻越 12 px + dwell 80ms 后离散切换（§6.3）。如果 DragOverlay 自带 26 px padding，DragOverlay 在 dragOffset.x = 0 ~ 12px 时（无意改深度的 reorder）也表现为 child 视觉——破坏 V3 严格跟手原则（DragOverlay 视觉应等同被拖项当前形态而非未来形态）。**让 DragOverlay 像 V3 一样始终是"裸 row"，让 drop indicator 与原位 row 表达深度变化**。

阴影规格（继承 V3 §2.2）：

```
box-shadow:
  0 1px 2px hsl(0 0% 0% / 0.06),
  0 4px 8px hsl(0 0% 0% / 0.08),
  0 12px 24px hsl(0 0% 0% / 0.10)
```

应用类 `.drag-overlay-row`（`src/index.css:631-639` V3 已落地）。

### 2.6 Cascade（让位） — 继承 V3

继承 V3 §2.4 全部不变：

| 属性 | 值 |
|---|---|
| timing | `220 ms cubic-bezier(0.16, 1, 0.3, 1)` (`--duration-drag-reorder` + `--ease-drag`) |
| stagger | 0（同步让位） |
| GPU | 仅用 `transform: translate*` |

**hierarchy 追加**：当 `dragOffset.x` 翻越 +12 阈值触发 demote 时，让位仍由 dnd-kit Sortable 内部 transform 驱动（V3 不变）；缩进过渡（§2.8）作为**叠加层**在 onDragEnd 之后驱动新 row 的 padding-left 过渡。两者**串行**（cascade 在拖动过程中持续；缩进过渡在 drop 完成后单次发生），不互相竞争。

### 2.7 Drop Indicator（hierarchy 下表达）（**V2 修订：margin-only + wrapper paddingLeft 缩进**）

[**P0-VIZ-1 修订**] V1 §2.7 用绝对 `left = row.left + 18px / width = row.width - 20px` 描述——但 `.drop-indicator-h`（`src/index.css:651-660`）实际是 block 元素 + `margin: 0 2px` + transform 驱动 translateY 的常规 flow，**不是绝对定位**。V1 描述与现有 CSS 实现冲突，且 §9 Acceptance 第 6/7/8 项断言不可机械检验。V2 改用**已有 `.drop-indicator-h` 实现 + wrapper paddingLeft 表达 hierarchy 缩进**。

**`.drop-indicator-h` 实现引证**（src/index.css:651-660，verify-third-party-behavior-firsthand）：

```
.drop-indicator-h {
  height: 2px;
  background: var(--color-accent);
  border-radius: 1px;
  margin: 0 2px;                 /* ← 左右各内缩 2px；占 row 宽度（继承 flow） */
  transition:
    opacity var(--duration-drag-indicator-fade) ease-out,   /* 100ms */
    transform var(--duration-drag-indicator-move) var(--ease-drag);   /* 150ms */
}
```

V3 现有 indicator 是**普通 block 元素 + `margin: 0 2px` + transform 驱动 translateY**——它不是绝对定位、不需要 left/width 控制。它在 sortable list 的常规 flow 内通过 transform 在 row 之间表达"位置已确定的水平线"。

**hierarchy 下的缩进表达机制**（V2 锁定）：

V2 hierarchy 不修改 `.drop-indicator-h` 自身几何。缩进通过 **wrapper element** 表达：

```
<div class="drop-indicator-wrapper" style={{ paddingLeft: depth * var(--indent-step) }}>
  <div class="drop-indicator-h" />
</div>
```

- depth = 0（root 级 indicator）→ wrapper paddingLeft = 0 → indicator 占 row 宽度减 4 px（`margin: 0 2px`）
- depth = 1（child 级 indicator）→ wrapper paddingLeft = 16 px → indicator 自然向右内移 16 px，width 自动减少 16 px

**缩进切换的过渡机制**：

| 状态 | indicator 视觉 | 切换 timing |
|---|---|---|
| dragOffset.x ∈ [-12, +12]（不触发深度变化） | wrapper paddingLeft = 0 → indicator 占 row 全宽减 4 px | — |
| dragOffset.x ≥ +12 px **且** dwell ≥ 80 ms（demote → 变子类） | wrapper paddingLeft = 16 px → indicator 向右内移 16 px | wrapper 自身 `transition: padding-left 150ms var(--ease-drag)` |
| dragOffset.x ≤ -12 px **且** dwell ≥ 80 ms（promote → 变根级，仅在被拖项原本是 child 时有效） | wrapper paddingLeft = 0 → indicator 顶到根级 | wrapper 自身 transition 同上 |
| 拖入越过未展开的折叠父类 row | 父类自动展开（`onDragStart` 已经全展开，本条作冗余兜底） | — |
| Drop 完成 | indicator fade out 100ms（V3 不变；`--duration-drag-indicator-fade`）| — |

> **R3 §6.3** 详细评估了 5 种 drop-into 视觉候选（α drop indicator 缩进 / β 父行 hover bg / γ 父行 outline / δ slot inflate / ε column rule）。本 V2 采用 **α 单一**——**不引入父行 hover bg、不引入 outline、不引入 ghost row、不引入 slot inflate**。理由：β/γ 都让父行视觉"脏"破坏 V3 cascade 让位的"crisp"语义；δ 增加预 reorder 成本（cascade 已经表达让位）；ε 实验性，参考度不足。**统一靠 indicator 自身缩进 + 缩进过渡过表达深度变化**——与 V3 极简一脉相承。
>
> **不修改 `.drop-indicator-h` CSS** —— V3 已落地的 transition 字符串保持原样（`opacity 100ms` + `transform 150ms`）。hierarchy 缩进过渡由 wrapper 元素的 `padding-left` transition 单独承担（150ms `var(--ease-drag)`），不污染 indicator 自身。这条架构选择避免了 V1 思路下"修改 indicator transition" 的连锁影响。

### 2.8 缩进过渡动效（拖出/拖入完成时 padding-left 变化）

drop 完成后，被拖项的实际 row（不是 DragOverlay）的 `padding-left` 需要从旧值过渡到新值：

| 场景 | padding-left 变化 | timing |
|---|---|---|
| 根 → 子（demote） | 10 → 26 px | `220 ms var(--ease-drag)`（`--duration-drag-reorder`）|
| 子 → 根（promote） | 26 → 10 px | `220 ms var(--ease-drag)`（`--duration-drag-reorder`）|
| 同级 reorder（深度不变） | padding-left 不变 | — |

复用 V3 cascade duration + easing 是**形态选择决策**：复用同曲线、同时长 → 父子让位与缩进过渡视觉一致；不引入新曲线 → 不增加 cognitive load。**不是数值等价声称**（cubic-bezier 与 cubic-bezier 完全相同就是相同，无需 reproduce）。

### 2.9 Snap 磁吸（继承 V3 不变）

完全继承 V3 §2.5：

- 12 px Y 轴磁吸 quadratic gravity well + 帧间 lerp（LERP_FACTOR = 0.35）
- 实现位置 `src/components/sidebar/dnd/snapModifier.ts`
- 无视觉跳变；DragOverlay 严格跟手（无水平磁吸叠加）

**hierarchy 不修改 `snapModifier.ts`**。X 轴的 12 px 阈值（D4，详见 §6.3）是**完全独立维度**，**不接入 snapModifier**——它是 React state lazy commit 路径上的 dwell 状态机，与 modifier 内的连续引力函数互不干涉。

> 论据：snapModifier 是 modifier 内闭包的纯函数（接受 transform，返回新 transform）；它不知道也不该知道 hierarchy 投影。深度投影是"逻辑层"的（dnd-kit Sortable Tree example 用 React state `offsetLeft` 跟踪），它只影响 drop indicator 渲染位置 + 最终 onDragEnd 的 parentId/depth 计算，**不修改 DragOverlay 视觉位置**。水平方向再叠磁吸 = 双重控制，DragOverlay 会被"水平拽到子类对齐线"——这是 V3 §2.5 明确禁止的"hidden hand 抢控制权"。

### 2.10 Settle（落定） — 继承 V3 不变

完全继承 V3 §2.6 distance-aware 公式：

```
const delta = |finalRect.center - DragOverlayRect.center|
let settleDuration: number;
if (delta < 4) {
  settleDuration = 0;          // 已被磁吸完美对齐 → skip dropAnimation
} else {
  settleDuration = Math.min(280, 120 + delta * 0.5);
}
```

| 属性 | 值 |
|---|---|
| dropAnimation easing | `cubic-bezier(0.16, 1, 0.3, 1)` (`--ease-drag`) |
| dropAnimation duration | distance-aware（公式如上）|
| 原位 opacity 恢复 | 0 → 1.0 与 dropAnimation 同步 |
| total settle | 0ms（已磁吸） / 120-280 ms（按距离） |
| overshoot | 无 |

**hierarchy 下不变**——dropAnimation 仅基于 final rect 与 DragOverlay rect 的几何距离计算，深度变化（demote/promote）已经反映在 final rect 的 `left` 上（因为目标 row 是新位置 + 新 padding-left）。

### 2.11 Cancel snap-back — 继承 V3 不变

完全继承 V3 §2.7：

| 触发 | 反馈 |
|---|---|
| 按 Esc 键 | DragOverlay snap-back 到原位（`280 ms cubic-bezier(0.32, 0.72, 0, 1)` = `--duration-drag-cancel` + `--ease-drag-cancel`）；原位 opacity 0 → 1 |
| 拖出 sidebar 边界 + 释放 | 同上 snap-back |
| 拖动期间持续在非法区 | DragOverlay opacity 0.95 → 0.5；cursor 切 `not-allowed` |

**hierarchy 追加非法区**（详 §2.13）：
- 父类被拖到另一父类的"drop into"区（`dragOffset.x ≥ +12 + dwell`，per D5：父类不可成子）→ 视为非法区
- 任何拖入会破坏 max depth = 2 的尝试 → 视为非法区

非法区视觉一致性沿用 V3 cancel：opacity 0.95 → 0.5、cursor `not-allowed`。

**opacity 切换无 fade 过渡**（V2 显式声明）：opacity 0.95 ↔ 0.5 切换是瞬时的（V3 cancel 视觉一致），不引入 fade transition。这避免了 dwell 边界抖动场景（参 §2.14）下"opacity fade 动画分裂"。

### 2.12 Cursor — 继承 V3 不变 + chevron 追加

完全继承 V3 §2.8：

| 状态 | Cursor |
|---|---|
| Hover 在可拖项 | `default` |
| 按下未达 4px | `default` |
| 拖动激活瞬间（4px 阈值达到） | 立即切 `grabbing` |
| 拖到合法 drop target | `grabbing` |
| 拖到非法区域 | `not-allowed` |
| 拖动结束 / 取消 | 立即恢复 `default` |

**chevron 追加**：父类 chevron click 区域（leading 16 px）的 `cursor: pointer`——与 row 整体的 `cursor: default` 形成微差异，明示这里是 disclosure control 而非普通 row 内文字。

### 2.13 Drop Validity — hierarchy specific

按 D5 / D13 锁定：

| 拖动目标 | 行为 | 视觉反馈 |
|---|---|---|
| 父类 → 同级根 reorder（dragOffset.x ∈ [-12, +12]） | 合法 | drop indicator 横线（V3 不变） |
| 父类 → 另一父类的"drop into"区（`dragOffset.x ≥ +12 + dwell`）| **非法**（per D5：父类不可成子；避免子树撕散 + 绕过 max depth=2） | DragOverlay opacity 0.95 → 0.5；cursor `not-allowed`；drop indicator 不渲染 |
| 子类 → 同级（同父）reorder | 合法 | drop indicator 横线（在子类对齐位置）|
| 子类 → 另一父类的"drop into"区 | 合法（change parent） | drop indicator 缩进 16 px（§2.7）|
| 子类 → 根级（reorder 区，`dragOffset.x ≤ -12 + dwell`，被拖项原本是 child） | 合法（promote to root） | drop indicator 顶到根级（§2.7）|
| 任何破坏 max depth=2 的尝试 | 非法（前端 prevent） | DragOverlay opacity 0.95 → 0.5；cursor `not-allowed` |
| 拖到 categories section 之外（如 nav 区、Tags section） | 非法（V3 不变） | DragOverlay opacity 0.95 → 0.5；cursor `not-allowed` |

> Validation 在前端 `onDragMove` / `onDragOver` 实时判定（per D13 = A+B：后端硬验证 + 前端 prevent）；后端在 `reorder_categories`（V3 已存在）+ `set_category_parent`（hierarchy 新增 IPC，由 03_tech_plan 详化）的命令侧二次校验。

### 2.14 Dwell 状态机（**V2 修订：完整三态机 + 边界规则**）

[**P0-VIZ-4 修订**] V1 §2.14 + §6.3 没回答 dragOffset.x 在 ±12px 边界抖动时（用户回退、over row 切换）的清零规则；opacity 0.95↔0.5 是瞬时还是 fade 未明。V2 显式定义完整状态机。

**Dwell 状态定义**（per drag session）：

```
state OUT
  invariant: dwell timer = idle (cleared)
  invariant: pending depth = baseline (active item 原 depth)
  invariant: drop indicator wrapper paddingLeft = baseline depth × 16

state HOVER_NEAR
  trigger: onDragMove with active != null AND |dragOffset.x| ≥ 12 AND over row exists
  invariant: dwell timer = setTimeout(80ms)
  invariant: pending depth = projected depth (= baseline + 1 demote 或 0 promote)
  invariant: indicator wrapper paddingLeft = baseline × 16 (尚未切换;视觉等同 OUT)

state DROP_INTO_READY
  trigger: dwell timer expires (HOVER_NEAR 80ms 后)
  invariant: dwell timer = idle (已 fired)
  invariant: pending depth = projected depth (commit)
  invariant: indicator wrapper paddingLeft = projected depth × 16 (切换;150ms 过渡)
  invariant: 若该 commit 触发 D5 非法（父→另父子）→ DragOverlay opacity 0.95 → 0.5 (瞬时)；cursor not-allowed
  invariant: 若该 commit 合法 → DragOverlay opacity 不变 0.95 (无 fade)
```

**状态转移规则**：

| from → to | trigger | 副作用 |
|---|---|---|
| OUT → HOVER_NEAR | dragMove with `\|dragOffset.x\| ≥ 12` + over row 存在 | 启动 dwell timer 80ms；indicator 视觉不变（仍 baseline）|
| HOVER_NEAR → OUT | dragMove with `\|dragOffset.x\| < 12`（用户横向回退）| 清零 dwell timer；indicator 视觉不变 |
| HOVER_NEAR → DROP_INTO_READY | dwell timer 自然 expires（80ms 内未回退、未切换 over row）| indicator wrapper paddingLeft 切换（150ms transition）；若非法则 opacity 切换 |
| DROP_INTO_READY → HOVER_NEAR | dragMove with `\|dragOffset.x\| < 12`（已 commit 后用户回退）| 视觉立即恢复（indicator wrapper paddingLeft 反向 150ms transition；opacity 恢复 0.95；cursor 恢复 grabbing）；不重启 dwell timer 直到再次 ≥ 12 |
| HOVER_NEAR → HOVER_NEAR | onDragOver 切换 over row（仍 \|dragOffset.x\| ≥ 12 但 row 不同）| 取消旧 dwell timer + 启动新 80ms timer（per new over row）|
| DROP_INTO_READY → HOVER_NEAR | onDragOver 切换 over row（同上 \|dragOffset.x\| ≥ 12）| 视觉反向 150ms 恢复 baseline；启动新 dwell timer 80ms (per new row);新 timer expire 后 commit 新 over row 的 projected depth |
| any → OUT | onDragCancel \| onDragEnd \| over = null | 清零 timer；视觉立即恢复 baseline（无过渡或 V3 cancel snap-back 视觉）|

**关键不变量**：
- dwell timer 的清零是**同步**的——任何转移触发立即清零，不等当前 timer 自然 expire。
- opacity 0.95 ↔ 0.5 切换是**瞬时**的（无 fade 过渡），与 V3 cancel 视觉一致。
- indicator wrapper paddingLeft 切换是**150ms 过渡**的（`var(--ease-drag)`，复用 `--duration-drag-indicator-move`），但仅在 DROP_INTO_READY ↔ HOVER_NEAR 之间触发，不在 HOVER_NEAR ↔ OUT 触发（HOVER_NEAR 阶段 indicator 仍是 baseline 视觉）。
- DROP_INTO_READY 状态下 dragOffset.x 在 +11px 与 +13px 之间反复抖动 → 视觉在"baseline / projected"之间反复 150ms 过渡。这条是 V2 接受的代价（替代方案是引入更深 hysteresis，会让 dwell 状态机复杂度爆炸）；评审时若 dev mode 实测视觉抖动显著，可在 03_tech_plan 中追加 hysteresis（仅 X 离开 ±15 才退回 HOVER_NEAR），属优化。

**onDragOver 切换 over row 时的清零规则**（V2 显式锁定）：dwell timer 在 over row 切换时**立即清零**（`dwellTimerRef.current && clearTimeout(...)` + `dwellTimerRef.current = null`）；新 row 启动新 80ms timer。这与 V1 §6.3 描述"hover 离开 over row 时立即清零；进入新 row 重新开始"语义一致，V2 在状态机层显式落地。

### 2.15 折叠/展开（D12）（**V2 修订：localStorage 命名反转回 expandedCategories**）

[**P0-VIZ-3 修订**] V1 改用 `collapsedCategories` 命名（默认全展开 = empty set），但行为口径与该语义未对齐——创建新子类时父类自动展开需要 `delete(parentId)`、onDragStart 期间 dragOverrideExpand 与 collapsedSet 的合并语义未明、HIG "Retain people's expansion choices" 引证错位。V2 取 R3/R4 原稿 `expandedCategories: Set<string>` 命名（默认包含所有有 children 的父类）；展开 = `add(parentId)`、折叠 = `delete(parentId)`，让"set 包含 = 展开"直觉自然成立。

按 D12 锁定（V2 修订状态机）：

| 状态 | 行为 |
|---|---|
| 默认状态（首次启动 / localStorage 为空） | `expandedSet = new Set(allParentsWithChildren.map(c => c.id))`（运行时计算）→ 全部父类**默认展开** |
| 用户点击 chevron 折叠父类 X | `expandedSet.delete(X)`；持久化 |
| 用户点击 chevron 展开父类 X | `expandedSet.add(X)`；持久化 |
| 创建新父类（无 children）| 不修改 expandedSet（无 children 不需在 set 内；chevron 也不渲染）|
| 创建新子类 → 父类 P 自动展开 | `expandedSet.add(P)`；持久化（确保 P 在展开集合中）|
| 拖动开始（`onDragStart`）| React state `dragOverrideExpand = new Set([...expandedSet, ...allParentsAlongDragPath])`；不修改持久化的 expandedSet；渲染时 `effectiveExpandedSet = dragOverrideExpand` |
| 拖动结束（`onDragEnd` / `onDragCancel`）| `dragOverrideExpand = null`；不修改持久化的 expandedSet；渲染时 `effectiveExpandedSet = expandedSet` |
| 折叠/展开过渡（chevron 旋转 + children 容器高度 + opacity）| 220 ms `cubic-bezier(0.16, 1, 0.3, 1)`（`--duration-drag-reorder` + `--ease-drag` 复用）|
| 父类无子类时 | chevron **不渲染**；row 与 §2.1 完全一致 |

**localStorage 持久化协议**：

```
localStorage key   = "ensemble.sidebar.expandedCategories"
localStorage value = JSON.stringify([...expandedSet])  // string[]: 展开父类的 ID 列表
```

**渲染合并函数（伪代码）**：

```typescript
function effectiveExpansion(
  categoryId: string,
  expandedSet: Set<string>,
  dragOverrideExpand: Set<string> | null
): boolean {
  if (dragOverrideExpand !== null) {
    return dragOverrideExpand.has(categoryId);
  }
  return expandedSet.has(categoryId);
}
```

——`dragOverrideExpand` 在拖动期间是 expandedSet 的**超集**（包括拖动路径上的父类）；非拖动期间为 `null`，渲染依赖 expandedSet。

**折叠态 children 不渲染**（不仅是 `display: none`，**而是从 DOM 移除**）。论据：
1. 避免成为 dnd-kit drop target（即使被 `display: none` 也可能仍参与 collision detection）；
2. 性能：N 父类全折叠时无需 mount N×M children DOM；
3. 与 V3 "Show X more" 折叠的 conditional render 模式一致。

**高度过渡实现 hint**（属 03_tech_plan 范围，本节仅给出视觉规格）：用 React `useLayoutEffect` 测量 children 容器实际高度，写入 inline `height: Npx`，触发 transition；折叠时反向（从 Npx → 0px）。具体实现细节由 03_tech_plan 详化。

### 2.16 Show X more（hierarchy 下重新定义）

V3 §2.10 已规定 maxVisible = 9，超过则显示"Show X more"折叠 UI。hierarchy 下重新定义计数语义：

- **maxVisible = 9 仅在根级计数**——根级父类超过 9 个时显示"Show X more"。
- **子类不计入根级 maxVisible**——折叠状态下子类不可见，但仍计入根级数。
- 折叠态用户拖动开始 → 自动展开（继承 V3 §2.10）。

> 论据：sidebar 折叠的目标是"减少根类滚动"——按 total（含子类）计算会让 "Show 3 more" 变成 "Show 17 more"——把折叠逻辑变形（参 R4 §6.1 E8）。**保持折叠 = 根级数量管理**是更对的语义。

### 2.17 Empty 状态

| 状态 | 视觉 |
|---|---|
| 完全空 categories（categories.length === 0） | 显示 "No categories" placeholder（继承现状，`SortableCategoriesList.tsx:203`） |
| 父类**展开**但 children = 0 | **不显示任何 placeholder**（极简，per R4 §6.1 E7） |
| 父类**折叠**但 children > 0 | chevron 朝右；children 容器从 DOM 移除（§2.15） |
| 父子均空（父类 count = 0 + children = 0） | 显示该父类 row + count "0"（V3 现状）；chevron **不渲染**（§2.4） |

### 2.18 Reduced Motion — 继承 V3 + hierarchy 追加

继承 V3 §2.12 的"all transition duration → 0ms"基础上追加：

| 动效 | reduced-motion 下行为 |
|---|---|
| chevron rotation | duration → 0ms（瞬时旋转） |
| 子类展开/折叠（高度 + opacity） | duration → 0ms（瞬时切换 height + opacity） |
| 缩进过渡（拖出/拖入完成 padding-left 变化） | duration → 0ms（padding-left 瞬时跳到新值） |
| drop indicator wrapper paddingLeft 切换（dragOffset.x 翻转 + dwell 后 0 ↔ 16 过渡）| duration → 0ms |
| 12 px X 阈值的 80 ms dwell | **保留**（不是动画，是状态防误触；reduced-motion 不取消防误触）|

**新增 CSS 范围**（src/index.css `@media (prefers-reduced-motion: reduce)` 段已存在，hierarchy 选择器追加）：

```css
@media (prefers-reduced-motion: reduce) {
  /* V3 已落地的 selectors 继续覆盖 */
  /* hierarchy 追加：chevron 旋转、children 容器高度过渡、子类 row padding-left 过渡、indicator wrapper paddingLeft */
  [data-sortable-list] [data-chevron],
  [data-children-of],
  [data-sortable-list] [data-depth],
  [data-drop-indicator-wrapper] {
    transition: none !important;
    animation: none !important;
  }
}
```

具体 selectors 由 03_tech_plan 详化；本规格仅声明语义。

### 2.19 Trackpad / Force Touch — 继承 V3 不变

完全继承 V3 §2.13：

- 单指 trackpad 拖动 = mouse 事件，已 cover
- 普通 click：activationConstraint.distance: 4 区分

**显式不实现（本期不做）**：
- Force Touch 反馈
- 三指拖
- 惯性滚动重排

### 2.20 WCAG 2.5.7 Dragging Movements Alternative（**V2 修订：不实现 Move to Parent submenu**）

[**P0-HCI-2 修订**] V1 §2.20 把"Move to Parent..."secondary menu/Modal path 全部 deferred 到 03_tech_plan，但 03_tech_plan 不做 UX 决策 → WCAG 2.5.7 alternative path 未规格。V2 按 _v2_patch_plan §3.7 决议：父类 ContextMenu 仅添加 "Promote to root"（仅子类显示）；**不实现** "Move to Parent..." submenu（推迟到后续；子类拖入新父类已通过 X 阈值 + dwell 实现，键盘则通过 ←/→ 在 drag mode 下完成）。

继承 V3 §2.14 KeyboardSensor 路径作为拖拽 alternative。**hierarchy 追加键盘可达**详见 §3。

**ContextMenu 兜底（per D6 = C + E，V2 简化）**：

- 现有 ContextMenu 已包含 `Rename` / `Delete`；
- **新增 ContextMenu 项**：
  - **"Promote to root"**（仅在 row 是 child 时可见）— 直接 promote 当前 row 到根级，等同于键盘 Space + ←；A11y 公告"{name} promoted to root level."；
- **不实现**：
  - **"Move to Parent..."** submenu（V1 候选 → V2 推迟）— 父类 ContextMenu 上**不**添加此项；推迟原因：（1）子类拖入新父类已可通过 mouse 拖动 + 键盘 ←/→ + ContextMenu Promote-then-drag 路径完成；（2）submenu 增加 ContextMenu 列表长度 + 每次需要枚举所有候选父类，违反极简哲学；（3）键盘可达"通过 Space → 拖到新父类的 drop-into 区"已满足 WCAG 2.5.7（key alternative for dragging movement）。
- 父类（root）无 hierarchy ContextMenu 项（父类只能通过 reorder 改顺序，不可 demote — 与 D5 一致）；

**键盘等价路径（满足 WCAG 2.5.7 dragging alternative）**：

| 拖动操作 | 键盘等价 |
|---|---|
| 子类 → 根（promote） | Space（lift）→ ←（promote）→ Space（drop）；或 ContextMenu → "Promote to root" |
| 子类 → 同级 reorder | Space → ↑/↓ → Space |
| 子类 → 另一父类的 child（cross-parent）| Space → ↑/↓ 走到目标父类 → →（demote at over row）→ Space |
| 父类 → 同级 reorder（root level） | Space → ↑/↓ → Space |
| 父类 → demote | **不允许**（D5 lock）；ContextMenu 不显示此项；键盘 → 在 drag mode 下也不响应 |

### 2.21 父类删除 Confirmation Dialog（**V2 新增**）

[**P0-HCI-3 修订**] V1 完全没有讨论删除父类时给用户的确认（confirmation dialog）。当前代码 `commands/data.rs::delete_category` 是直接删除，cascade-promote 不可逆 + 数据丢失风险。V2 按 _v2_patch_plan §3.6 决议：父类有 children 时弹 confirmation dialog；正文按主 Agent 锁定文案。

**触发条件**：用户右键父类 → ContextMenu Delete 时，前端检测父类有 ≥ 1 个 children → **弹出 confirmation dialog**；父类**无 children** 时直接删除（与 V3 现有行为一致）。

**Dialog 文案**（V2 锁定，按 _v2_patch_plan §3.6）：

```
Title:    "Delete '{parentName}'?"
Body:     "{parentName} contains {N} sub-categor{y/ies}.
           Sub-categories will be promoted to root level.
           This cannot be undone."
Buttons:  "Cancel"（默认）/ "Delete"（destructive style）
```

**Dialog 视觉规格**：

- **优先**使用 macOS 原生 NSAlert（通过 Tauri `dialog::ask` 或类似 IPC 路径），保留 macOS 原生气质；
- **如不可用** fallback 用前端 React Modal（继承项目现有 Modal 组件视觉规则；不引入新 Modal 视觉）；
- 主按钮 ("Delete") 颜色：`var(--color-error)`（destructive 调色）；次按钮 ("Cancel") 默认；
- N (`{N}`) 由前端计算 = `categories.filter(c => c.parent_id === parent.id).length`。

**操作流（V2 完整时序）**：

| 步骤 | 行为 |
|---|---|
| 用户右键父类 → Delete | 前端检测 children 数；如 N ≥ 1 → 弹 confirmation；如 N = 0 → 直接删除 |
| Dialog "Cancel" | 不变（无任何状态修改）|
| Dialog "Delete" | 后端 `delete_category` IPC 调用；父类移到 trash；children parent_id 清零（promote to root）；写入 data.json；categoriesVersion bump |
| 完成后 sidebar 视觉 | 父类消失；children 出现根级；padding-left 通过 220ms 缩进过渡（§2.8）从 26 → 10 px |
| A11y 公告 | "{parentName} deleted. {N} categories promoted to root: {child1}, {child2}..."（最多列 3 个 child name；超出说 "and N more"）|

**Anti-pattern 锁定**（详 §2.22）：
- 删除父类无 confirmation 直接 cascade-promote 是 Norman "preventing irreversible action" 违反 → 禁止
- confirmation dialog 文案不提子类数量 → 禁止（用户决策需要 N 信息）
- cascade-promote 不发 A11y 公告 → 禁止
- 删父类后 children 不出现在根级（即默默丢失） → 禁止（数据丢失）

**Cascade-promote 同名碰撞处理**：03_tech_plan §3.6 详化 `delete_category` 实现；当 child name 与现有 root names 冲突时 cascade-promote 后**重命名为 `<原名> (<父类名>)`** disambiguate（per _v2_patch_plan §3.5）；该处理是后端职责，本视觉规格仅声明语义边界。

### 2.22 Anti-pattern 清单（明确禁止；V1 §2.21 重新编号 + V2 增量）

承接 §1 设计哲学的硬底线 + R3 §13 + R4 §6 整合 + V2 评审反馈追加：

| ❌ Anti-pattern | 原因 |
|---|---|
| chevron 大于 12 px | 抢主名字与 dot 视觉权重；macOS Finder list view 实测 ≤ 10 px |
| chevron 在无子类的父类 row 上渲染 | 视觉冗余 + 信息错误（无可展开的内容） |
| chevron 出现在子类 row | max depth = 2 硬约束；子类不可能有 children |
| **chevron 用 `<div role="button">` 仿冒**（V2 新增）| `<button>` 必须是真元素，否则键盘可达性 + screen reader 行为破坏（Apple Design Studio 守则）|
| **chevron 不携带 `data-no-dnd="true"`**（V2 新增）| 项目 CustomMouseSensor 走 `data-no-dnd` 短路；缺失会让 chevron mousedown 启动 dnd-kit lift |
| **chevron 缺 onKeyDown stopPropagation**（V2 新增）| `<button>` focus 状态下按 Space 会冒泡到 row dnd-kit listener → 同时触发 toggle + lift |
| **chevron click 受 justDroppedRef 50ms guard 约束**（V2 新增）| chevron 在 data-no-dnd 域内，与 row click 完全独立；guard 是 row click 防误触机制，不应限制 chevron |
| 子类 row 高度 ≠ 32 px | 破坏 V3 row gap 节奏，并制造"子类是次要内容"的视觉降权 |
| 子类 dot 颜色淡化（如 opacity 0.6） | 破坏用户主动选定的颜色语义（D11） |
| 子类 row 字色淡化 | 同上；macOS Finder/Notes 子文件夹字色不淡化 |
| 父子字重差异化（父 medium、子 normal） | 与 V3 active state 字重冲突；indent 已表达层级 |
| 1 px 永久 indent guide line | 与 V3 drop indicator 视觉打架；与 Things 3/Notes/Finder 不一致 |
| 1 px hover-only guide line | 与 V3 极简哲学冲突；当 drop-into 触发时与 indicator 视觉繁杂 |
| 拖入子类时父行变 hover bg | 与 V3 reorder 期间父行不变化路线冲突；引入"父行视觉脏" |
| 拖入子类时父行加 outline ring | 同上；与"crisp cascade"哲学冲突 |
| 引入新 cubic-bezier 曲线（如 `(0.4, 0, 0.2, 1)`） | V3 已统一用 `(0.16, 1, 0.3, 1)`；不增加 cognitive load |
| 子类展开/折叠用 spring 物理 | spring 与 cubic-bezier 数学不等价（V3 §2.4 已撤销）；本项目实施层用 cubic-bezier |
| 子类展开/折叠 stagger（依次出现） | V3 §1 明示"不做 stagger"；同步让位更"crisp" |
| 缩进过渡用线性曲线 | 物理感丢失；与 V3 cascade 不一致 |
| 默认折叠（HC8 in R3 §5.2 已论证排除） | 用户新建子类后看不到自己的成果；Categories 数量级小不必折叠节省空间 |
| 持久化折叠状态写入 `~/.ensemble/data.json` | 偏好不应污染数据；data.json 应跨设备 sync 安全（项目目前无 sync，但保留语义边界）|
| chevron click 同时触发 nav | 用户点 chevron 是想展开/折叠；点 row 名字才是想 nav。两者必须分开 hit-target |
| **修改 `.drop-indicator-h` 自身几何（追加 left/width transition）**（V2 新增）| V3 indicator 是 block + margin-only + transform 驱动；hierarchy 缩进通过 wrapper paddingLeft 表达，不污染 indicator CSS |
| **DragOverlay component 增加 depth/paddingLeft prop**（V2 新增）| `DragOverlayCategoryRow` className 写死 `px-2.5` 是 hierarchy 不变量 #20 的代码层保障；引入 prop 等于打开"DragOverlay 跟随 child 缩进"的口子 |
| **hardcoded 缩进数字（如 `padding-left: 26px`）**（V2 新增）| 必须用 `calc(10px + var(--indent-step))` 或 `padding-left: calc(10px + depth * var(--indent-step))`；hardcode 26 让缩进改值时 grep miss |
| 拖动期间在父类 row 上加 spring-load 自动展开（额外延迟） | `onDragStart` 已经全展开，spring-load 是 V3 不存在的新行为，引入冗余复杂度 |
| children-count badge（"X children" 父行旁数字） | D8 决策已聚合 count；不再需要二次表达；行业 majority 不显示 |
| 父类 DragOverlay 携带子树视觉（DragOverlay 显示父+所有子） | D5 决策"逻辑层跟随但视觉层不渲染子树"；DragOverlay 已 omit count 与同族 |
| 子类 DragOverlay 自带 26 px 缩进 | 拖动期间深度由翻越阈值离散切换（§6.3）；自带缩进会与新目标深度视觉冲突（§2.5） |
| Empty children 显示 placeholder（"No subcategories"） | absence is its own signal；macOS Finder/Notes 不显示 |
| 水平翻转点设为 8 px | _synthesis_decisions §3 D4 锁定 12 px（复用 SNAP_RANGE token + Fitts 误触 0%）；R3 推荐的 8 px 已被 Decisional 决策推翻 |
| 水平方向引入新磁吸（snap to indent rail） | "hidden hand 抢控制权"，违反 V3 §2.5 设计禁忌（§2.9）|
| 父类 ContextMenu 出现 "Promote/Move to Parent" 项 | 父类不可成子（D5）；菜单项应仅对 child 可见 |
| **删除父类无 confirmation 直接 cascade-promote**（V2 新增）| Norman "preventing irreversible action"；用户子树丢失感 |
| **confirmation dialog 文案不提子类数量**（V2 新增）| 用户无法预估操作影响（决策需要的关键信息缺失）|
| **cascade-promote 不发 A11y 公告**（V2 新增）| VoiceOver 用户失去状态变化感知 |
| **opacity 0.95 ↔ 0.5 切换引入 fade transition**（V2 新增）| dwell 边界抖动场景下 fade 与 indicator wrapper paddingLeft 过渡视觉繁杂；瞬时切换是 V3 cancel 视觉一致 |

---

## 3. 键盘可达 — Hierarchy 操作（**V2 修订：HIG Outline Views 引证 + chevron keyboard 模态**）

[**P0-HCI-1 修订**] V1 §3 提 ←/→ promote/demote 但缺 Apple HIG Outline Views 关于 browse-mode ←/→ collapse/expand 的引证。V2 按 _v2_patch_plan §3.12 加上引证。

继承 V3 KeyboardSensor + sortableKeyboardCoordinates 基线（Tab → focus row, Space → 拾起, ↑↓ → 移动, Esc → 取消, Enter → 落定）。hierarchy 追加左右方向键（per D6 + R4 §5）。

**HIG Outline Views 引证（普通浏览态 ←/→ 折叠/展开）**：

> macOS NSOutlineView 默认 ←/→ 在 disclosure 模式下 collapse/expand；在拖拽模式下我们用 ←/→ 表达 promote/demote，与 Outline Views 设计哲学一致（横向方向键 = 层级方向）。
>
> 引证：**Apple HIG Outline Views**（https://developer.apple.com/design/human-interface-guidelines/outline-views）—"To expand and collapse rows in an outline view, people can press the right and left arrow keys"。
>
> VoiceOver 兼容性：VoiceOver 用户使用 VO+方向键导航；本快捷键不与 VoiceOver 默认热键冲突（VO+→ 展开、VO+← 折叠在 NSOutlineView 中本身就是 OS 提供，本项目在浏览模式下复用同语义）。
>
> 用户在 macOS Finder list view、Notes 嵌套文件夹、Reminders Group 都已被训练成"右展开 / 左折叠"——hierarchy ←/→ 不是项目自创映射。

| 键 | 状态：未拖动（普通浏览） | 状态：键盘拖动中（已 Space 进入 drag mode） |
|---|---|---|
| `→` (Right Arrow) | 父类有子类 + **折叠态** → **展开**（HIG NSOutlineView 标准）；子类 row 上无操作；其他 → 无操作 | 当前 row 是 root → **demote 为 child of previousItem**（如有 previousItem 可作 parent）；当前 row 是 child → 无操作（max depth=2 硬约束）|
| `←` (Left Arrow) | 父类有子类 + **展开态** → **折叠**（HIG NSOutlineView 标准）；子类 row 上无操作；其他 → 无操作 | 当前 row 是 child → **promote 为 root**；当前 row 是 root → 无操作 |
| `↑` / `↓` | row 间导航（V3 不变） | 同级 reorder（dnd-kit 默认）|
| `Space` / `Enter`（未拖动）| nav | falls through to dnd-kit lift/drop |
| `Esc`（拖动中）| Cancel snap-back（V3 不变）| 同 |

**chevron `<button>` focus 状态键盘行为**（V2 显式锁定）：

| chevron focused | 按键 | 行为 |
|---|---|---|
| chevron focused | `Space` / `Enter` | 触发 chevron toggle（与 mouse click 等价）；**不冒泡**到 row dnd-kit listener（onKeyDown stopPropagation 实现，参 §2.4） |
| chevron focused | `Tab` | 系统默认（focus 离开 chevron → 进入下一 row 或 row 之外的下一 focusable）|
| chevron focused | `Esc` | 系统默认；不影响 chevron 状态 |

**视觉反馈对应**：
- 未拖动状态下按 ←/→ 折叠/展开 → 触发 §2.15 子类展开/折叠动效（220 ms 高度 + opacity）。
- 键盘拖动中按 ←/→ promote/demote → 等同于鼠标拖动时水平偏移翻转点的视觉（drop indicator wrapper paddingLeft 切换 / 不切换），由扩展后的 hierarchy-aware coordinate getter 处理（dnd-kit Sortable Tree example 的 `sortableTreeKeyboardCoordinates` 已经实现该投影逻辑——参 R2 §7 一手源码）。具体由 03_tech_plan §5.1.B 详化。

**模态切换**（V2 锁定）：左/右方向键的占用模式**仅在用户已选定行 + 已 Space 进入键盘 drag mode 时**生效；普通浏览模式下方向键正常用于 row 间导航 + 折叠/展开（per HIG）。这与 dnd-kit `KeyboardSensor` 现有模态一致。

| 当前模态 | 按键 | 转移到 | 视觉/A11y 反馈 |
|---|---|---|---|
| Browse（focus on row） | `Space` | Drag | A11y 公告 "Picked up category {name}. Use arrow keys to move..."（V3 默认 announcements 已有）+ row scale 1.0 → 1.04（V3 lift sub-stage 1） |
| Browse | `←` | Browse | 折叠（如展开）；A11y 公告 "Collapsed category {name}." |
| Browse | `→` | Browse | 展开（如折叠）；A11y 公告 "Expanded category {name}." |
| Browse | `↑` / `↓` | Browse | row 间导航（V3 不变） |
| Browse | `Enter` | Browse | row click navigate |
| Drag | `↑` / `↓` | Drag | dnd-kit 内部 reorder over slot（视觉同 V3）|
| Drag | `←` | Drag | promote（child → root）；A11y "{name} promoted to root level."；root 行试图 promote 公告 "Cannot promote — already at root level." |
| Drag | `→` | Drag | demote（root → child of previous）；A11y "{name} moved to child of {parentName}."；child 试图 demote 公告 "Cannot demote — already at maximum depth." |
| Drag | `Space` / `Enter` | Browse | drop（V3 默认）；A11y "{name} dropped at position N." |
| Drag | `Esc` | Browse | cancel + snap-back；A11y "Drag cancelled. {name} returned to original position."（V3 不变） |

**A11y 公告（announcements）**：在 V3 已有 `announcements.ts` 模式扩展（VoiceOver 走 name 不走 UUID）：

| 事件 | 公告措辞 |
|---|---|
| 拖到 root 位置 | `"{name} moved to root level."` |
| 拖到子类位置（demote） | `"{name} moved to child of {parentName}."` |
| 从子类拖出（promote） | `"{name} promoted to root level."` |
| 父类展开 | `"Expanded category {name}."` |
| 父类折叠 | `"Collapsed category {name}."` |
| Drop cancelled | `"Drag cancelled. {name} returned to original position."`（V3 不变） |
| 拖入未展开父类 → 自动展开 | `"Auto-expanded {parentName} during drag."`（仅在 `onDragMove` 期间，避免重复轰炸）|
| 键盘试图 demote 已经是 child 的 row | `"Cannot demote — already at maximum depth."` |
| 键盘试图 promote 已经是 root 的 row | `"Cannot promote — already at root level."` |
| 父类删除 cascade-promote | `"{parentName} deleted. {N} categories promoted to root: {child1}, {child2}..."` |

扩展点：在 `announcements.ts` 的 `makeAnnouncements` 工厂内增加 `hierarchy: { parentMap, expandedSet }` 上下文参数（V2 命名与 §2.15 持久化语义一致），按上面表格格式格式化公告。03_tech_plan §5.6 详化具体 `HierarchyContext` type。

---

## 4. 时序示意

时序图沿用 V3 §3 风格（毫秒级时间线）。仅展示与 V3 时序差异的 hierarchy 专属场景。**注**：t=720 / t=940 等时间点为示例值（actual timing varies by user gesture; here for illustration only），不应被实施 SubAgent 视为具体规格。

### 4.1 Drag 子类到另一父类（demote 跨树）

```
t=0       mousedown on "Frontend" child row (under "Development")
          │ pointer 在 row top + 8px
          │
t=~16     pointer 移到 row top + 12px (4px movement)
          ↓
t=16      [Drag activates]
          │ Cursor → grabbing
          │ Lift sub-stage 1: 吸盘 (80ms) — 行内 DOM scale 1.0 → 1.04
          │ DragOverlay 渲染：opacity 0 → 0.95，无位移
          │ DragOverlay 内容 = "Frontend" row clone (无 chevron、无 26px 缩进；px-2.5 与 inline row 同)
          │ V3 onDragStart 副作用：折叠的父类全部自动展开（dragOverrideExpand = expandedSet ∪ {drag-path-parents}，无延迟动画）
          │ Refresh button disabled
          │
t=96      Lift sub-stage 2: 拉离 (120ms)
          │ 行内 row scale 1.04 → 1.0；opacity 1.0 → 0
          │ DragOverlay 开始跟手位移
          │
t=216     Lift 完成
          │
t=400     pointer 移到 "Productivity" 父类 row 上方
          │ pointer X 偏移 ≈ +20px
          │ Dwell state: OUT → HOVER_NEAR
          │ dwell timer 启动 (80ms)
          │
t=400+80  dwell expires → HOVER_NEAR → DROP_INTO_READY
          │ drop indicator wrapper paddingLeft: 0 → 16 px (150ms transition `var(--ease-drag)`)
          │ drop indicator 自身 (.drop-indicator-h) 占新缩进位置（block 元素 + margin: 0 2px）
          │ Cascade 让位 220ms：Productivity 下方所有 row 同步下移
          │ DragOverlay 严格跟手（不水平磁吸）
          │
t=720     mouseup
          │ Settle distance-aware：
          │   delta = |finalRect.center - DragOverlayRect.center|
          │   < 4px → settleDuration = 0；其他 → min(280, 120 + delta * 0.5)
          │ drop indicator 1 → 0 fade out 100ms (--duration-drag-indicator-fade)
          │ 原位 opacity 0 → 1.0（与 settle 同步）
          │
          │ 同时（onDragEnd 后）：
          │   "Frontend" row 的 padding-left 在 220ms `--ease-drag` 内
          │     从 26 (旧 Development 子类位置) → 26 (新 Productivity 子类位置) 不变
          │     ⚠️ 注意：本场景两个父类都让 child padding-left = 26，所以视觉上无 padding 变化；
          │           跨深度场景（root → child）才有 padding-left 过渡（§2.8）
          │   parentId 在后端 update：set_category_parent({id: "Frontend.id", parentId: "Productivity.id"})
          │
t=940     Drop complete
          │ A11y announcement: "Frontend moved to child of Productivity."
          │
          │ 后台异步：
          │   appStore IPC 落盘；DATA_MUTEX 串行；categoriesVersion bump
          │   dragOverrideExpand 重置 = null；渲染依赖 expandedSet
```

### 4.2 Drag 子类到根级（promote）

```
t=0       mousedown on "Frontend" child row (under "Development")
          │
t=16      [Drag activates] (lift 同 4.1)
          │
t=216     Lift 完成
          │
t=400     pointer 拖到 "Development" 父类 row 与 "Productivity" 父类 row 之间
          │ pointer X 偏移 ≈ -20px
          │ Dwell state: OUT → HOVER_NEAR (timer 80ms 启动)
          │
t=400+80  dwell expires → DROP_INTO_READY
          │ drop indicator wrapper paddingLeft: 16 → 0 px (150ms transition)
          │ Cascade 让位 220ms：Productivity 及其下方所有 row 同步下移
          │
t=720     mouseup
          │ Settle distance-aware
          │ 缩进过渡：Frontend row 的 padding-left 在 220ms `--ease-drag` 内 26 → 10px
          │ parentId 在后端 update：set_category_parent({id: "Frontend.id", parentId: null})
          │
t=940     Drop complete
          │ A11y announcement: "Frontend promoted to root level."
          │ dragOverrideExpand 重置
```

### 4.3 拖动父类到非法位置（被另一父类的 drop into 区）

```
t=0       mousedown on "Development" parent row
          │
t=16      [Drag activates] (lift 同 4.1)
          │
t=216     Lift 完成
          │
t=400     pointer 移到 "Productivity" 父类 row 上方
          │ pointer X 偏移 ≈ +20px
          │ Dwell state: OUT → HOVER_NEAR (timer 80ms 启动)
          │
t=400+80  dwell expires → DROP_INTO_READY
          │ 检测到非法（D5：父类不可成子）
          │ DragOverlay opacity 0.95 → 0.5（瞬时切换；无 fade）
          │ Cursor → not-allowed
          │ drop indicator 不渲染（在 over 但深度无效）
          │ Cascade 让位**仍然按 reorder 同级处理**（dnd-kit Sortable 行为；
          │   父类间 reorder 是合法的，让位继续）
          │
          │ ⚠️ 关键区分：父类拖到另一父类的"reorder 区"（dragOffset.x ∈ [-12, +12]）是合法
          │   的同级 reorder；只有 dragOffset.x ≥ +12 + dwell 80ms 才进入"drop into"非法区。
          │
t=550     用户回退 X = +5px (dragOffset.x ∈ [-12, +12])
          │ Dwell state: DROP_INTO_READY → HOVER_NEAR (X < 12)；视觉立即恢复 reorder 状态
          │ DragOverlay opacity 0.5 → 0.95（瞬时切换）
          │ Cursor → grabbing
          │ drop indicator 重新渲染（reorder 横线）
          │
t=720     mouseup
          │ if dragOffset.x ∈ [-12, +12]（合法 reorder）：
          │   合法同级 reorder（V3 不变）
          │ else if dragOffset.x ≥ +12 + dwell（非法 drop into）：
          │   onDragEnd 检测目标是 drop-into 非法 → cancel snap-back 280ms
```

### 4.4 折叠/展开 chevron click

```
t=0       click on "Development" 父类 chevron 区域（leading 16px）
          │ chevron <button data-no-dnd="true"> 拦截 mousedown stopPropagation
          │
t=16      onClick handler 触发：
          │ 1. e.stopPropagation() 防冒泡到 row navigate
          │ 2. toggleExpand: expandedSet.delete(X) 或 add(X)；持久化到 localStorage
          │ 3. chevron 旋转：transform: rotate(0deg → 90deg)，120ms `--ease-drag`
          │ 4. children 容器：
          │    if 折叠中（展开 → 折叠）：
          │      step a: useLayoutEffect measure 当前 height (e.g. 64px = 2 children × 32px)
          │      step b: 写入 inline `height: 64px`
          │      step c: 下一帧 写入 inline `height: 0`
          │      transition: height 220ms `--ease-drag` + opacity 220ms `--ease-drag`
          │    if 展开中（折叠 → 展开）：
          │      step a: render children DOM (尚未 mount)
          │      step b: useLayoutEffect measure target height
          │      step c: 写入 inline `height: 0` → 下一帧写入 `height: 64px`
          │      transition: height 220ms `--ease-drag` + opacity 220ms `--ease-drag`
          │
t=336     transition 完成（120 chevron + 220 height 重叠区）
          │ A11y: "Expanded category Development." / "Collapsed category Development."
```

### 4.5 Cancel during drop-into hover

```
t=0       drag 中，pointer 在 "Productivity" 父类的 drop-into 区（X 偏移 ≥ +12 + dwell 80ms）
          │ Dwell state: DROP_INTO_READY
          │ drop indicator 已缩进显示（wrapper paddingLeft = 16）
          │
t=200     用户按 Esc
          │
t=200     onDragCancel 触发：
          │ Dwell state: any → OUT (清零 timer)
          │ DragOverlay 280ms `--ease-drag-cancel` snap-back 到原位
          │ drop indicator 100ms ease-out fade out
          │ 原位 row opacity 0 → 1
          │ A11y: "Drag cancelled. Frontend returned to original position."
          │ dragOverrideExpand 重置
          │
t=480     Cancel 完成
```

### 4.6 父类删除 confirmation flow（V2 新增）

```
t=0       用户右键父类 "Development" → ContextMenu Delete
          │ 前端检测：N = categories.filter(c => c.parent_id === Development.id).length
          │ if N === 0 → 直接调用 delete_category IPC（与 V3 现有行为一致）
          │ if N >= 1 → 弹出 confirmation dialog
          │
t=16      Confirmation Dialog 出现：
          │ Title: "Delete 'Development'?"
          │ Body: "Development contains 2 sub-categories. Sub-categories
          │        will be promoted to root level. This cannot be undone."
          │ Buttons: [Cancel] [Delete]
          │
          │ if 用户点 Cancel：
          │   Dialog dismiss；无任何状态改变
          │ if 用户点 Delete：
          │   后端 delete_category IPC：
          │     - Development → trash
          │     - Frontend / Backend parent_id = null（promote to root）
          │     - 同名碰撞检测 + 重命名 disambiguate（per _v2_patch_plan §3.5）
          │     - data.json 写入；DATA_MUTEX 守护；categoriesVersion bump
          │   前端：
          │     - sidebar Development row 消失
          │     - Frontend / Backend 出现根级
          │     - Frontend / Backend padding-left 220ms 缩进过渡 26 → 10px (§2.8)
          │     - A11y: "Development deleted. 2 categories promoted to root: Frontend, Backend."
```

---

## 5. CSS Token

**新增到 `src/index.css` 的 `:root`**（V3 token 之后）：

```css
:root {
  /* Hierarchy V1: indent step (single new token) */
  --indent-step: 16px;
}
```

**复用 V3 已有 token**（hierarchy 不引入新版本）：
- `--ease-drag: cubic-bezier(0.16, 1, 0.3, 1)` — chevron rotation / 子类展开折叠 / 缩进过渡 / drop indicator wrapper paddingLeft 切换
- `--ease-drag-cancel: cubic-bezier(0.32, 0.72, 0, 1)` — Cancel snap-back（继承 V3 §2.7）
- `--duration-drag-reorder: 220ms` — 子类展开/折叠 + 缩进过渡 + cascade 让位
- `--duration-drag-snap: 80ms` — 磁吸 lerp（不动；hierarchy 的 dwell 80ms 与此**数值相同但语义独立**：磁吸是 modifier 内连续引力，dwell 是 React state lazy commit）
- `--duration-drag-indicator-fade: 100ms` — drop indicator opacity
- `--duration-drag-indicator-move: 150ms` — drop indicator wrapper paddingLeft 切换 + V3 indicator translateY
- `--color-accent` / `--color-accent-soft` — drop indicator
- `--color-tertiary` (`#A1A1AA`) / `--color-secondary` (`#71717A`) / `--color-primary` (`#18181B`) — chevron 三态色
- `--color-bg-tertiary` (`#F4F4F5`) — row hover/active bg

> **chevron rotation duration = 120ms** 是项目"Show X more"切换的现状值，不属于已有 token；本规格首次显式声明，建议 03_tech_plan 评估是否提取为 `--duration-disclosure-rotate: 120ms` token——属技术决策。本规格仅声明"用 120ms"。

> **dwell timer = 80ms** 数字与 `--duration-drag-snap = 80ms` 相同纯属巧合（磁吸 lerp 时长 vs 状态 lazy commit），未来如需独立调参，建议加 `--duration-hierarchy-dwell: 80ms` 新 token；本 V2 hierarchy 实施层 hardcode 80（详 03_tech_plan §6.4 / §7.3 决议）。

---

## 6. 关键行为决策详化

### 6.1 父类 count = 自身 + 所有子级总和（D8 = B）

按 _synthesis_decisions §3 D8 锁定：

- **父类 count** = `selfCount(parent) + Σ selfCount(child)`（所有 children 的 self count 总和）
- **子类（叶）count** = `selfCount(child)`（仅自身）
- 实现位置 `MainLayout.tsx:96-104` 的 `categoriesWithCounts` useMemo

> 论据：D7（父类聚合视图）锁定 → 用户点父类 → 看到包含子类内容的列表。如果 sidebar 上显示 `count=5`，但点进去看到 8 项 → 违反 Norman "系统状态可见性"原则——这是 bug 级 UX 问题，比"极简多一个数字"严重得多。详 _synthesis_decisions §2.1。

count 显示位置不变（V3 现状的 `text-[11px] font-medium text-[#A1A1AA]` tail，CategoryRowContent.tsx:58）。

### 6.2 父类聚合视图（D7 = A）

按 _synthesis_decisions §3 D7 锁定：

- **CategoryPage.tsx 在父类 URL 下显示父类自身 + 所有 descendants 的 skills + mcps + claudeMd**
- **CategoryPage.tsx 在子类 URL 下仅显示该子类**（max depth = 2，子类无 children）
- 子类内容**不显示 group header**（不分组渲染——CategoryPage 现有 section header "Skills (X)"、"MCP Servers (X)"、"CLAUDE.md Files (X)" 已经够用，详 R6 §4.3）
- 子类来源信息靠 SkillListItem 上的 category badge 体现（V3 之前已存在，免费支持 hierarchy）

视觉规格层面：父类被点击后 active state 视觉 = 父类 row 高亮（与 V3 一致）。子类被点击后 active state = 子类 row 高亮；**父类不显示"半亮"**（极简，per R6 §4.6）。

### 6.3 Drop-into 横向阈值 = 12 px + 80 ms dwell（D4）（**V2 修订：实测目标 + 退路 + retreat 路径**）

[**P1-8 修订**] V1 §6.3 仅声明 12 + 80，但缺乏量化退路标准。V2 加 dev mode 实测目标 + 退路 + retreat 路径。

按 _synthesis_decisions §3 D4 锁定：

- 触发 demote（变子类）：`dragOffset.x ≥ +12 px` **且** dwell ≥ 80 ms
- 触发 promote（变根级）：`dragOffset.x ≤ -12 px` **且** dwell ≥ 80 ms
- 不触发深度变化：`dragOffset.x ∈ [-12, +12]`（同级 reorder 区）

> **R3 推荐 8 px**（dnd-kit Sortable Tree example 默认 `indentationWidth/2`）；**_synthesis_decisions 锁定 12 px**。两者冲突已被 _synthesis_decisions §2.2 解决：复用 `SNAP_RANGE_PX = 12` token（同一数字双用：Y 轴磁吸 + X 轴 hierarchy 阈值）+ Fitts's Law 误触概率 < 0.01% 都满足 + 12 px 在精确鼠标 + trackpad/抖手场景下更稳。
>
> 按文档权威分级（_synthesis_decisions = Decisional 高于 R3 = Referential），自动取 12 px。

**dwell 状态机**：详见 §2.14（OUT / HOVER_NEAR / DROP_INTO_READY 三态）。

**实测目标（dev mode 量化退路）**：

- **Doherty Threshold** (IBM 1982)：response > 400ms 进入"等待"区间，操作流畅度损失 ~50%。
- **Nielsen Norman 2014**："Response Times: 3 important limits"；100ms 瞬时感、1s 思绪保持。
- **复合等待时间** = `t_lift (200ms) + t_user_movement_to_target (~200-400ms) + t_dwell (80ms)` = 480-680ms
- **Dev mode 实测目标**：用户从 mousedown 到看到 demote 视觉反馈 ≤ **600ms**（Doherty 边界内）。
- **dwell 退路**：若实测 > 600ms 显著影响体感 → 03_tech_plan 评估降至 50ms 或取消（仅依赖 12 px 翻转）。
  - 单纯 12px 阈值 + Fitts σ ≈ 1.5px → 误触概率 = Φ(-(12-2)/1.5) ≈ 0%——dwell 是 nice-to-have 不是必要。
  - 取消 dwell 路径：dragOffset.x 翻越 ±12 立即 commit projected depth；Dwell 状态机简化为 OUT / DROP_INTO_READY 两态。

**Retreat 路径**（用户在 DROP_INTO_READY 状态下回退）：

- DROP_INTO_READY → HOVER_NEAR：dragOffset.x < 12（横向回退）；视觉立即恢复 reorder 状态（DragOverlay opacity 0.95、cursor grabbing、drop indicator wrapper paddingLeft 反向 150ms 过渡）；不重启 dwell timer。
- HOVER_NEAR → OUT：dragOffset.x < 12 且 dwell timer 未 fire；timer 清零；视觉无变化（仍 baseline 视觉）。

dwell 计时器的清零是同步操作；任何转移触发立即清零（不等当前 timer 自然 expire）。dwell 计时不依赖 `requestAnimationFrame` 抖动，应用 `setTimeout(80)` 实现（具体由 03_tech_plan 详化）。

### 6.4 chevron click 与 row click hit-target 分离

leading 16 px（chevron icon 10 px + gap 6 px）= chevron click 区域；其余 row 部分 = row click 区域。

实现 hint（chevron `<button>` 完整 attributes 详见 §2.4 + 03_tech_plan §5.3）：
- chevron 包裹一个独立 `<button data-no-dnd="true">` 元素，`width: 16px`、`onClick = (e) => { e.stopPropagation(); toggleExpand(categoryId); }`；
- row 整体的 onClick 仍负责 navigate；
- chevron click 不会冒泡到 row click（stopPropagation）；
- chevron mousedown 通过 `data-no-dnd` 短路 CustomMouseSensor，不启动 dnd-kit lift；
- chevron keydown（Space/Enter）通过 `onKeyDown stopPropagation` 不冒泡到 row dnd-kit listener。

**Fitts 误触评估**（单点击落地 σ ≈ 1.5 px）：

| 用户意图 | 误触概率 |
|---|---|
| navigate（瞄准 row 中心 ≈ 120 px）| P(X<16 \| μ=120, σ=1.5) ≈ 0% — 可忽略 |
| toggle（瞄准 chevron 中心 ≈ 8 px）| P(X>16 \| μ=8, σ=1.5) ≈ 0% — 可忽略 |

**结论**：16 px hit-target 在 Fitts 误触下安全。trackpad 在高 DPI 显示器（macOS Retina）下 σ 可能略大（≈ 2 px），但仍 < 1% 误触。

A11y：chevron `<button>` 加 `aria-label="Toggle ${categoryName} children"`、`aria-expanded={expanded}`。

### 6.5 hierarchy 验证 max depth = 2（D13）

视觉层面：任何会破坏 max depth = 2 的拖拽尝试 → 视为非法区（§2.13）。

具体场景：
- 已经是 child 的 row 被拖到另一 child 的"drop into"区 → 检测到目标 child 已经是 depth 1 → 非法（不允许形成 depth 2 child）；DragOverlay opacity 0.5 + cursor not-allowed。
- ⚠️ 该场景实际上**不应该出现**——因为子类的"drop into"区在 X 阈值层面也成立，但前端 prevent 在 `onDragOver` 检测到 over.depth + 1 > 1 后视为非法。

**容错路径**：后端 `set_category_parent` IPC 命令在 commands 内二次校验 `descendants(self) ∩ {target_parent_id} ∅` 防 cycle，并 clamp `depth ≤ 1`。具体由 03_tech_plan 详化（D13 = A + B：后端硬验证 + 前端 prevent）。

---

## 7. V3 不变量保留核对清单（**V2 修订：22 → 23 项，与 03 §12 对齐**）

[**P1-1 修订**] V1 §7 列 22 项（合并 #8 = DndContext modifiers + DragOverlay modifiers），与 03 §12 列 23 项（拆 #8/#9）编号偏移。V2 拆开重编号 → 23 项，对齐 03 §12。

> 来自 R2 §10（一手 dnd-kit 6.3 + sortable 10 源码 + V3 spec 验证）。每条标注本任务方案如何**不破坏**。任何破坏 = P0 Reject。

| # | V3 不变量 | 本任务保留方案 |
|---|---|---|
| 1 | 4 px 激活 distance（保 click navigate 不抢） | hierarchy 仍用 `useSensor(CustomMouseSensor, { activationConstraint: { distance: 4 } })`；hierarchy 的 X 阈值 12 px 是**激活后**才计算的，不冲突（详 R3 §6.5） |
| 2 | 两段 lift：吸盘 80 ms + 拉离 120 ms | DragOverlay 内容 = `<DragOverlayCategoryRow>`（CategoryRowContent showCount=false）；hierarchy 不修改 lift 阶段 |
| 3 | DragOverlay 多层 hsl 阴影（`.drag-overlay-row` class） | 沿用现有 class，不改 |
| 4 | 12 px 连续磁吸（quadratic gravity well + 帧间 lerp，不是阈值瞬移） | `snapModifier.ts` 不修改；hierarchy X 阈值是独立 React state，不接入 modifier（§2.9） |
| 5 | 220 ms cascade（`cubic-bezier(0.16, 1, 0.3, 1)`，无 stagger） | useSortable transition `{duration: 220, easing: '...'}` 不变；hierarchy 缩进过渡叠加（§2.8）但**串行**而非竞争 |
| 6 | distance-aware settle：< 4 px → 0 ms（skip dropAnimation）；≥ 4 px → `min(280, 120 + delta × 0.5)` | onDragEnd 公式不变；目标 rect 在 demote/promote 后是新位置 + 新 padding-left，distance 计算自动正确 |
| 7 | Cancel snap-back：280 ms `cubic-bezier(0.32, 0.72, 0, 1)` | hierarchy 追加非法区（§2.11 + §2.13）使用同一 cancel 视觉；不引入新 cancel |
| 8 | DndContext modifiers = `[snapModifier]` 仅磁吸 | hierarchy 不修改 modifier 配置；投影深度由 React state 在 onDragMove 中跟踪（dnd-kit Sortable Tree 模式），与 modifier 解耦 |
| 9 | DragOverlay modifiers = `[restrictToWindowEdges]` 仅防出窗 | hierarchy 不修改 modifier 配置 |
| 10 | 全套 CSS token（`--color-accent` / `--ease-drag*` / `--duration-drag-*`） | hierarchy 复用所有 token；唯一新增 `--indent-step: 16px` |
| 11 | DATA_MUTEX 串行 + `apply_reorder` pure function + `ENSEMBLE_DATA_DIR` 测试隔离 | hierarchy 后端新命令（如 `set_category_parent` / `cascade_promote_children`）也加 DATA_MUTEX guard；apply_reorder 升级为 hierarchy-aware 形式（属 03_tech_plan）|
| 12 | `categoriesVersion` / `tagsVersion` 版本协议防 autoClassify race | hierarchy 后端任何 mutator（addCategory / updateCategory / deleteCategory / setCategoryParent / reorderCategories / cascadePromote）都 bump `categoriesVersion`；前端 loadCategories 在 race 时 skip set |
| 13 | `enqueueReorder` 串行 IPC 队列保证用户最近一次拖拽是 canonical | hierarchy reorder + setCategoryParent 共用同一队列（属 03_tech_plan 决定），保证语义不重叠 |
| 14 | `data-no-dnd` + `CustomMouseSensor` 双保险 | chevron `<button>` 加 `data-no-dnd="true"` + `onMouseDown stopPropagation` + `onKeyDown stopPropagation`，与 ColorPicker 一致（详 §2.4）|
| 15 | 编辑/新增态 SortableContext 全局 disabled 防 input 被打断 | hierarchy 不破坏（`isInputMounted` 仍 disable 整 SortableContext）|
| 16 | KeyboardSensor + sortableKeyboardCoordinates + screenReaderInstructions（VoiceOver 用 name 不用 UUID） | 替换 `sortableKeyboardCoordinates` 为 hierarchy-aware version（参 dnd-kit example tree）；announcements 扩展 hierarchy context（§3）|
| 17 | prefers-reduced-motion 全套尊重 | hierarchy 追加 selectors（chevron / children container / 子类 row padding-left / drop-indicator-wrapper），duration → 0 ms（§2.18） |
| 18 | "Show X more" 折叠态在 onDragStart 自动展开（V3 §2.10） | hierarchy 追加：折叠的父类在 onDragStart 也自动展开（§2.15）；onDragEnd 后恢复用户持久化状态 |
| 19 | `justDroppedRef` / 50 ms guard 窗口防 drop 同 row 误触 click navigate（V3 §2.9） | 不变；chevron click 与 row click 已 hit-target 分离不冲突；chevron click **豁免** 50ms guard（chevron 在 data-no-dnd 域内，与 row click 完全独立）|
| 20 | 拖动期间 Refresh 按钮 disabled（V3 §2.11） | 不变 |
| 21 | DragOverlay 不带原位 row 的 padding | 来源：`DragOverlayCategoryRow.tsx:21` className 写死 `px-2.5` 而非动态 row prop；hierarchy 不修改此 className（详 §2.5）|
| 22 | `closestCenter` collision detection（V3 §7） | hierarchy 不修改；max depth = 2 + dnd-kit Sortable Tree 模式自然适配 closestCenter |
| 23 | `MeasuringStrategy.Always`（V3 §7，避免 wrap 重排时 stale rect） | 不变 |

> 23 项 ≥ 任务卡要求的 20 项最小集。**任何破坏 = P0 Reject**——评审单必查。**编号与 03 §12 / 04 R-V3-N 一致**。

---

## 8. 实施时验证流程

继承 V3 §3 风格——dev mode 启动 + 用户主观验证清单。

### 8.1 主 Agent 启动 dev server 后请用户手动验证以下条目

**视觉验证**（用 DevTools Elements + Animations panel）：

1. ☐ 子类 row computed `padding-left: 26px`（含 dot 起点 = 36px，即 chevron 占位的另一种验证）
2. ☐ 父类有子类时 chevron computed `width: 10px; height: 10px`，color = `rgb(161, 161, 170)` (#A1A1AA)
3. ☐ 父类无子类时 chevron 元素**不存在**于 DOM（getElementsByTagName('svg') 不应包含 chevron icon）
4. ☐ chevron rotation 切换瞬间，transition `120ms cubic-bezier(0.16, 1, 0.3, 1)`
5. ☐ 子类展开/折叠 children container `transition-duration: 220ms`，height + opacity 同步开始结束
6. ☐ 拖动子类、水平偏移 +20 px 后 + 等 80 ms，drop indicator wrapper computed style `padding-left: 16px`（缩进位置；indicator 自身仍 `margin: 0 2px` 不变）
7. ☐ 拖动子类、水平偏移在 [-12, +12] 之间，drop indicator wrapper computed style `padding-left: 0`（根级位置）
8. ☐ Drop 完成 demote 时，被拖项 row padding-left transition 220 ms 从 10 → 26 px
9. ☐ chevron click 区域（leading 16 px）单击后 URL 不变；row click 区域单击后 URL 变（DevTools Network panel 验证）
10. ☐ localStorage 展开状态：折叠任一父类 → `localStorage.getItem('ensemble.sidebar.expandedCategories')` 返回**不包含**该 ID 的有效 JSON；展开任一父类 → 返回**包含**该 ID 的有效 JSON

**键盘验证**：

11. ☐ 普通浏览模式 + 父类 row focused + 折叠态 → 按 `→` 展开（HIG NSOutlineView 标准）
12. ☐ 普通浏览模式 + 父类 row focused + 展开态 → 按 `←` 折叠（HIG NSOutlineView 标准）
13. ☐ Space 进入 drag mode + child row → 按 `←` 试图 promote → A11y live region 包含 "promoted to root level"
14. ☐ Space 进入 drag mode + 已是 child → 按 `→` 试图 demote → A11y live region 包含 "Cannot demote — already at maximum depth"
15. ☐ chevron `<button>` Tab 可达：从 row 上 Tab 一次进入 chevron focus；按 Space 触发 toggle 而**不**触发 row dnd-kit lift（DevTools Console 验证 dnd-kit `onDragStart` 未被调用）

**拖拽验证**：

16. ☐ 拖动父类到另一父类的"drop into"区（X 偏移 +20 + dwell 80）→ DragOverlay opacity 0.5（瞬时切换无 fade）+ cursor not-allowed（D5 父类不可成子）
17. ☐ 拖动子类到另一父类的"drop into"区 + drop → 子类 parent 改变；A11y "moved to child of {parent}"
18. ☐ 拖动子类到根级（dragOffset.x ≤ -12 + dwell + drop）→ 子类 parent 清零；A11y "promoted to root level"
19. ☐ 拖动开始时所有折叠的父类自动展开；拖动结束后恢复持久化展开状态
20. ☐ Dwell 状态机 retreat 路径：在 DROP_INTO_READY 状态下回退 X 至 < 12 → 视觉立即恢复 reorder 状态（drop indicator wrapper paddingLeft 16 → 0；DragOverlay opacity 0.5 → 0.95；cursor not-allowed → grabbing）

**Reduced Motion 验证**：

21. ☐ 启用 macOS 系统 "Reduce Motion" 偏好后，chevron 旋转、children 展开/折叠、缩进过渡、indicator wrapper paddingLeft 切换 transition-duration 均 = 0 ms

**父类删除验证**（V2 新增）：

22. ☐ 右键有 children 的父类 → Delete → 弹 confirmation dialog；title "Delete '{name}'?"；body 含子类数量；buttons "Cancel" / "Delete"
23. ☐ Confirm Delete 后：父类消失；children 出现根级 + padding-left 220ms 过渡 26 → 10；A11y 公告"{name} deleted. {N} categories promoted to root: ..."
24. ☐ 右键无 children 的父类 → Delete → 直接删除（无 dialog；与 V3 现状一致）

**用户主观感受**（dev mode 验证，不阻塞）：

25. ☐ chevron 旋转、子类展开/折叠、缩进过渡看起来"是同一种物理"（共享 cubic-bezier(0.16, 1, 0.3, 1)）
26. ☐ drop-into 反馈"crisp"（不拖泥带水、不与父行视觉竞争）
27. ☐ 80 ms dwell 不会让"快速拖动到子类"显得"延迟"（如显著延迟感 + 复合等待 > 600ms，03_tech_plan 可降至 0ms 仅依赖 12 px 翻转）

---

## 9. Acceptance（≥ 18 项客观可验证）

> **客观条件**：每条都能在 dev mode 通过 DevTools / Animations panel / VoiceOver / Cypress 验证。**禁止**"看起来流畅"这种主观词（仅末尾主观兜底允许）。

### 视觉客观条件

1. ☐ **子类缩进精确 16 px**：子类 row 起点 left 距 sidebar 左 padding 边 = 26 px ±0.5 px（DevTools Elements computed style 验证 `padding-left: 26px`）。
2. ☐ **dot 尺寸不变**：所有父类与子类的 ColorPicker dot computed `width: 8px; height: 8px`（V3 §2.1 不变量；任务卡推测 14 px 是错的）。
3. ☐ **chevron 仅在父类有子类时显示**：父类有 ≥ 1 个 child 的 row → chevron 出现；无 child 的 root row → chevron 不渲染（DOM 内不存在 chevron 元素，`querySelector('[data-chevron]')` 返回 null）。
4. ☐ **chevron 尺寸**：computed `width: 10px; height: 10px`（lucide-react `ChevronRight/ChevronDown` size={10}）。
5. ☐ **chevron color (default)**：computed `color: rgb(161, 161, 170)` (#A1A1AA = `--color-tertiary`)。
6. ☐ **chevron `<button>` attributes**（V2 新增）：chevron element 是 `<button>`（非 `<div>`）；`data-no-dnd="true"`；`aria-expanded={true|false}`；`aria-label` 含 category name；`tabIndex={0}`。
7. ☐ **chevron rotation duration**：折叠↔展开切换瞬间，DevTools Animations panel 显示 `transition-duration: 120ms; transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1)`。
8. ☐ **子类展开/折叠 duration**：children container `transition-duration: 220ms; transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1)`，且 height + opacity 同步开始结束。
9. ☐ **拖入 X 阈值 = 12 px + dwell 80 ms**（V2 修订）：从 root 拖动一项，水平偏移 < 12 px 时 drop indicator wrapper computed `padding-left: 0`；偏移 ≥ 12 px + 持续 80 ms 后 drop indicator wrapper computed `padding-left: 16px`。
10. ☐ **缩进过渡 duration**：drop 完成瞬间，被 demote/promote 项的 padding-left 在 220 ms 内过渡（10 ↔ 26 px），曲线 `--ease-drag`。DevTools Animations panel 验证。
11. ☐ **drop indicator wrapper paddingLeft 切换 duration**（V2 修订）：水平偏移翻越阈值 + dwell 80 ms 后 wrapper `padding-left` 在 150 ms 内过渡（0 ↔ 16），曲线 `--ease-drag`（`--duration-drag-indicator-move`）。**`.drop-indicator-h` 自身 CSS 不变**（block + margin: 0 2px + transform 驱动 translateY）。
12. ☐ **拖动开始时全部父类自动展开**：`onDragStart` 触发后，所有持久化为"折叠"的父类瞬间渲染其 children（无延迟动画，因为这是状态切换不是动画），并在 `onDragEnd` 后恢复持久化状态。
13. ☐ **chevron click 不触发 row navigate**：单击 chevron 区域（leading 16 px）后，URL 不变；row click 区域（其余）才触发 navigate（Cypress / Playwright 可验证 `cy.url()` 不变）。

### 行为客观条件

14. ☐ **localStorage key 写入正确**（V2 修订命名）：折叠/展开任一父类后，`localStorage.getItem('ensemble.sidebar.expandedCategories')` 返回有效 JSON `string[]`（**展开**的 category UUID 列表；折叠 = 不在列表中）。
15. ☐ **左/右键在折叠态切换 + 在键盘拖动态 promote/demote**：详见 §3 表格逐键测试。
16. ☐ **chevron keyboard 路径**（V2 新增）：chevron `<button>` Tab 可达；按 Space → toggle expand/collapse（chevron rotation 触发；onDragStart 不触发）；按 Tab 离开 chevron → focus 进入下一 row 或 row 之外的下一 focusable。
17. ☐ **prefers-reduced-motion 下所有 hierarchy 动效 duration = 0**：模拟 CSS media `(prefers-reduced-motion: reduce)`，DevTools 验证 chevron rotation、子类高度过渡、缩进过渡、drop-indicator-wrapper paddingLeft 切换 transition-duration 均 = 0 ms。
18. ☐ **空树态（无子类）父类无 chevron 占位**：DOM 无 chevron element，row leading 与 §2.1 完全一致（不留 16 px 空白）；row text 起点 left = 28 px（10 padding + 8 dot + 10 gap）。
19. ☐ **A11y 公告措辞**：拖入子类后，dnd-kit live region 的 textContent 包含 `"moved to child of {parentName}"`；promote 后包含 `"promoted to root level"`；折叠后包含 `"Collapsed category {name}"`。
20. ☐ **HIG max depth=2 硬约束**：尝试把 child 拖到另一个 child 上 → 实际行为是同级 reorder（不会形成 grandchild），DevTools React state 验证最终 `depth ∈ {0, 1}`。
21. ☐ **D5 父类不可成子**：拖动父类到另一父类的"drop into"区（X 偏移 ≥ +12 + dwell 80）→ DragOverlay opacity = 0.5（**瞬时切换、无 fade**）；cursor = `not-allowed`；onDragEnd 不更新 parent；A11y 不发"moved"公告。
22. ☐ **D7 父类聚合视图**：CategoryPage（`/category/<父id>`）下显示父类自身 + 所有子级的 skills + mcps + claudeMd（手工 fixture：父=Development、子=Frontend (3 项) + Backend (5 项) + 自身 (2 项)，预期 CategoryPage 显示 10 项）。
23. ☐ **D8 父类聚合 count**：sidebar 父类 row 显示 count = self + Σ children.self（同上 fixture：sidebar 显示 `10`）。
24. ☐ **D14 autoClassify 落根**：autoClassify 创建新分类后，新 category 在 `data.categories` 末尾、`parent_id === null`；不会建议父类。
25. ☐ **Dwell retreat 路径**（V2 新增）：在 DROP_INTO_READY 状态下用户横向回退 X 至 < 12 → 立即转移到 HOVER_NEAR；视觉立即恢复 reorder 状态（drop indicator wrapper paddingLeft: 16 → 0，150ms transition；DragOverlay opacity 0.5 → 0.95 瞬时；cursor not-allowed → grabbing 瞬时）；不重启 dwell timer。
26. ☐ **父类删除 confirmation**（V2 新增）：右键有 children 的父类 → Delete → 弹 confirmation dialog；含子类数量 + "This cannot be undone" 提示；点 Cancel 不变；点 Delete 触发 cascade-promote + A11y 公告。
27. ☐ **父类无 children 删除直接执行**（V2 新增）：右键无 children 的父类 → Delete → 直接删除（无 dialog；与 V3 现状一致）。

### V3 行为零回归条件（Regression Guards）

28. ☐ V3 4 px 激活距离：单击父类 row（不超过 4 px 移动）→ row 不进入 drag mode、URL 跳转 `/category/<id>`。
29. ☐ V3 两段 lift：拖动激活后 0–80 ms 内行内 row scale 1.0 → 1.04，80–200 ms DragOverlay 接管。
30. ☐ V3 12 px Y 轴磁吸：拖动到 over slot 中心 12 px 范围内时 DragOverlay 平滑吸到 slot 中心。
31. ☐ V3 220 ms cascade：拖入新位置 + over 切换瞬间，其他 row 同步让位 220 ms（无 stagger）。
32. ☐ V3 distance-aware settle：drop 时 delta < 4 px → settleDuration = 0；其他按公式。
33. ☐ V3 280 ms cancel：Esc 取消 → DragOverlay 280 ms snap-back。
34. ☐ V3 Refresh disabled：拖动期间 Refresh 按钮 disabled + visual gray。
35. ☐ V3 编辑/新增态：rename 输入框 mount 时整个 SortableContext disabled、CategoryRowContent dot 仍可点开 ColorPicker。
36. ☐ V3 KeyboardSensor：Tab → focus row → Space → 拾起 → ↑↓ 移动 → Enter 落定。
37. ☐ V3 ScreenReader：VoiceOver 公告用 category name（不暴露 UUID）。
38. ☐ V3 Categories Vec append-to-end：autoClassify 创建新分类 → push 到末尾，不破坏既有 reorder 顺序。
39. ☐ V3 categoriesVersion 协议：autoClassify 进行中拖动 reorder → 入队，autoClassify 完成后正确顺序保留。

### 用户主观感受兜底（仅作 UX 报告，不阻塞）

40. ☐ chevron 旋转、子类展开/折叠、缩进过渡看起来"是同一种物理"（共享 `cubic-bezier(0.16, 1, 0.3, 1)`）。
41. ☐ drop-into 反馈"crisp"（不拖泥带水、不与父行视觉竞争）。
42. ☐ 80 ms dwell 不会让"快速拖动到子类"显得"延迟"（复合等待 ≤ 600ms 视为通过）。

> 40-42 由用户在 dev mode 实测时主观判断，主 Agent 启动 dev server 后请求用户验证（参 §8.1）。

---

## 10. 不在范围

继承 V3 §5 + 本任务追加：

- **三级及更深嵌套**（max depth = 2 硬约束，per HIG Sidebars 页"show no more than two levels of hierarchy in a sidebar" + Apple HIG Outline Views 标准 + 用户原话"二级"+ D2 / D13 锁定）
- **拖拽时整个子树跟随**（per D5：父类拖动只允许同级 reorder，不可成子；DragOverlay 仅渲染 row 自身不渲染子树）
- **autoClassify 智能建议父类**（per D14 = A 落根；后续候选）
- **Force Touch / 三指拖 / haptic feedback**（与 sidebar-reorder V3 一致，不实现）
- **拖到 nav 区"Skills/MCP/..." 形成跨 section 移动**（V3 不变，hierarchy 不开放）
- **跨设备 sync / 协作 reorder**（项目无云同步）
- **Tags hierarchy**（用户只说 Categories；Tags 继续 1D rectSortingStrategy）
- **dropdown（SkillDetailPanel / McpServersPage Category dropdown）的树形渲染深化**：D9 锁定为"缩进 16 px + 父类可选 + chevron 不可点（dropdown 内不折叠）"——本规格仅声明 dropdown 视觉规则，详细 UI 由 03_tech_plan 决定 Dropdown 组件改造路径
- **CategoryPage 子类 group header**（per R6 §4.3 极简兜底——靠 SkillListItem 上的 category badge 体现来源；不引入新 section header）
- **父行半亮**（子类 active 时父类不显示视觉差异，per R6 §4.6 极简兜底）
- **ContextMenu "Move to Parent..." submenu**（V2 推迟；per _v2_patch_plan §3.7：子类拖入新父类已通过 X 阈值 + dwell + 键盘 ←/→ 满足；submenu 增加 ContextMenu 列表长度违反极简哲学）
- **hover tooltip 消歧 count**（V1 V2 候选 → 推迟）：父类 row 上 count `17` 不显示 hover tooltip "5 directly + 12 in subs"；用户通过点击 + CategoryPage 看到完整列表自然消歧。极简优先。
- **subtle 父行 demote-active hint bg**（V1 候选 → V2 推迟）：α drop indicator 缩进 是单一反馈；不引入"父行加深 -2 灰度差"的二阶反馈。

---

## 11. 关键风险与不确定性

继承 R3 §14 + R4 §9 + 本规格层面整合：

| # | 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|---|
| R1 | 12 px X 阈值 + 80 ms dwell 的实测体感（"延迟感"） | 中 | 中 | dev mode 实测目标 ≤ 600ms 复合等待（§6.3）；如显著则 03_tech_plan 评估降至 0 ms 仅依赖 12 px 翻转。本规格保留 80 ms 作初始值。 |
| R2 | dnd-kit Sortable Tree example 的 `getProjection` 默认无 max depth 硬限制（`maxDepth = previousItem.depth + 1`）；子类拖到子类会变 grandchild | 高 | 高 | 在 onDragEnd 与 getProjection wrapper 中显式 clamp `depth = Math.min(depth, 1)`（属 03_tech_plan 实施；本规格 §6.5 + §2.13 已声明视觉行为）|
| R3 | onDragStart 全展开后，Categories 数量过大（> 50）时 cascade 让位卡顿 | 低 | 中 | V3 已有 `MeasuringStrategy.Always`；如出现，可引入子类懒渲染（后续）|
| R4 | 折叠/展开高度过渡用 `max-height` 实现时 CSS auto 高度不可过渡（需 measure children 后写入精确 px） | 中 | 低 | 用 React `useLayoutEffect` 测量 + 写入 inline `height: Npx` 触发 transition（属 03_tech_plan 实施细节；本规格 §2.15 已 hint）|
| R5 | localStorage 展开状态跨 git worktree 的隔离行为 | 低 | 低 | 单人项目跨多个 git worktree 时，每个 worktree 是独立 web 应用实例，但同 origin → localStorage 共享。预期不构成问题（用户在哪个 worktree 折叠都映射到同一 sidebar 视图偏好）。仅记录不缓解。 |
| R6 | chevron 与"Show X more" 按钮 chevron 视觉重复 | 低 | 低 | "Show X more" chevron size = 12 px、hierarchy chevron size = 10 px；视觉权重已分级（10/12 ≈ 0.83 比例，与 macOS Finder list view secondary text 11 px / disclosure 9 px 的 0.82 比例一致）|
| R7 | dwell 边界抖动：dragOffset.x 在 ±12 px 边界 ±1 抖动时 DROP_INTO_READY ↔ HOVER_NEAR 反复切换 → 视觉在 baseline / projected 之间反复 150ms 过渡 | 低 | 低 | V2 接受的代价（替代方案是引入 hysteresis ±15px 才退回，会让 dwell 状态机复杂度爆炸）；评审时若 dev mode 实测视觉抖动显著，可在 03_tech_plan 中追加 hysteresis 优化（§2.14）|
| R8 | chevron `<button>` 在 SortableContext 内 + 键盘 Tab 顺序的 a11y 行为：`row → 同 row 内的 chevron → 下一 row` 是 V2 设计；dev mode 实测可能 Tab 顺序不符（如跨 row 跳）| 中 | 低 | 03_tech_plan §5.3 显式声明 Tab 顺序（chevron tabIndex={0} 而非 -1）；dev mode 实测验证（§9 #16）|
| R9 | macOS NSAlert dialog 不可用时前端 React Modal fallback 视觉风格与 macOS 原生不一致 | 低 | 低 | §2.21 优先 NSAlert + fallback Modal；项目目前无云同步、无多窗口架构，NSAlert 在 Tauri 2 dialog plugin 应可用 |

---

**Confidence**：90 / 100

**Confidence 折扣来源**：
- 4 点：dnd-kit 6.3 KeyboardSensor 与 chevron `<button>` 焦点协作的具体行为需要在 V2 修订后由实施期 dev mode 实测验证（R8）——文档级评审无法 100% 推断。
- 3 点：80 ms dwell 实测体感（R1）+ getProjection clamp 实施期细节（R2）+ 折叠高度过渡 max-height 路径（R4）三者均属 03_tech_plan / 04_implementation_plan 范围。
- 2 点：dwell state machine 在边界抖动场景（R7）的真实用户体感需 dev mode 实测，文档级评审仅能锁定状态机逻辑。
- 1 点：localStorage 跨 worktree 共享行为（R5）属于 Tauri webview origin 实测领域，本评审仅基于推理。

**给 03_tech_plan V2 SubAgent 的关键 takeaway**（5 条）：

1. **localStorage key 反转回 `ensemble.sidebar.expandedCategories`**（V2 §2.15）；类型 `Set<string>`（展开父类 ID 列表）；`COLLAPSED_KEY` / `loadCollapsedFromLocalStorage` / `persistCollapsed` 等命名应改 `EXPANDED_KEY` / `loadExpandedFromLocalStorage` / `persistExpanded`；announcements.ts HierarchyContext 应改 `expandedIds`（与 §3 一致）；这是 cascade footprint 上的硬约束。
2. **drop indicator 缩进通过 wrapper paddingLeft 表达**（V2 §2.7），**不**修改 `.drop-indicator-h` 自身 CSS（V3 已落地的 transition 字符串保持原样）；V2 §7.3 应仅描述 `[data-drop-indicator-wrapper] { transition: padding-left 150ms var(--ease-drag); }` 一条增量。
3. **chevron `<button>` 完整 attributes**（V2 §2.4）：`data-no-dnd="true"` + `onMouseDown stopPropagation` + `onKeyDown stopPropagation`（防 Space/Enter 冒泡到 row dnd-kit listener）+ `tabIndex={0}` + `aria-expanded` + `aria-label`。这条是 P0-VIZ-2 修订的核心。
4. **DragOverlay 不接受 depth/paddingLeft prop**（V2 §2.5 + §2.22 anti-pattern）：`DragOverlayCategoryRow.tsx:21` className 写死 `px-2.5` 是不变量 #21 的代码层保障；任何想让 DragOverlay 跟随子类深度的尝试都需修改此 className，V2 hierarchy 不修改。
5. **ContextMenu 仅 "Promote to root"（不 "Move to Parent..." submenu）**（V2 §2.20）：03 V2 §5.7 应删除 Move to Parent submenu 段；04 V2 T3d ContextMenu 任务应仅添加 Promote to root 项。

**跨文档 cascade 明确列出**（按 cross-document-cascade-discipline.md 要求）：

V2 修订对其他 Decisional 文档的级联清单（**必须 patch**，否则 V2 不完整）：

- `03_tech_plan.md` V1 → V2 必须 patch 段：
  - §2.4 + §3.3.4 父类删除 confirmation backend 集成（与 §2.21 V2 决议对齐）
  - §3.6 cascade-promote 同名碰撞重命名规则（per _v2_patch_plan §3.5）
  - §5.1.A getProjection indicator wrapper 描述（V2 §2.7）
  - §5.2 dwell 状态机实现（OUT/HOVER_NEAR/DROP_INTO_READY 三态）+ retreat 路径
  - §5.2 localStorage 命名反转（EXPANDED_KEY）
  - §5.3 chevron `<button>` attributes 完整注入（V2 §2.4）
  - §5.5 DragOverlay padding 引证改源码行号
  - §5.6 announcements.ts `HierarchyContext.expandedIds`（命名与 V2 一致）
  - §5.7 删除 Move to Parent submenu 段
  - §7.2 不修改 `.drop-indicator-h` CSS；新增 `[data-drop-indicator-wrapper]` 选择器
  - §12 V3 不变量 #21 描述改源码引证
- `04_implementation_plan.md` V1 → V2 必须 patch 段：
  - T1d delete cascade-promote 任务卡（含 confirmation backend 路径）
  - T2c categoryTree.ts 测试（dwell 状态机测试用例）
  - T2d treeUtilities + treeKeyboardCoordinates 任务卡（getProjection wrapper paddingLeft + dwell 状态机调用）
  - T3a SortableCategoriesList localStorage 命名（EXPANDED_KEY）+ dwell 状态机 + dragOverrideExpand
  - T3b SortableCategoryRow chevron `<button>` 完整 attributes 注入
  - T3d MainLayout ContextMenu：增加 "Promote to root"；**不**增加 Move to Parent submenu；增加 confirmation dialog 触发逻辑
  - T5c acceptance 42 项（27 客观 + 12 V3 行为零回归 + 3 主观，V2 §9 全套）
  - V3 不变量回归 R-V3-1~R-V3-23（与 V2 §7 / 03 §12 编号一致）
- `.claude/rules/design-language.md`（V1 不动）：本 V2 不要求 design-language Rule 新增 "Hierarchy is expressed by position, not by decoration" Principle（按 _v2_patch_plan §4 W6-D 决策落地，由 W6-D SubAgent 单独 patch）。

V1 → V2 修订完成后**必须**派一个独立 alignment SubAgent（参 cross-document-cascade-discipline）扫描 02 V2 + 03 V2 + 04 V2 一致性，输出 `_v2_alignment_check.md`。
