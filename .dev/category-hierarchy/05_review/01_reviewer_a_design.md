# Reviewer A — Apple-grade Design Review

> **角色**：Reviewer A（顶级设计师评审 SubAgent，背景 Apple Design Studio / Linear / Things 团队）。
> **评审主对象**：`/Users/bo/Documents/Development/Ensemble/Ensemble2/.dev/category-hierarchy/02_design_spec.md` V1（Category Hierarchy）。
> **评审副对象（同等严格）**：`/Users/bo/Documents/Development/Ensemble/Ensemble2/.claude/rules/design-language.md` V1（117 行项目级 Rule）。
> **职责**：从设计还原度、Apple/Linear/Things 级标准、克制极简哲学一致性视角给出严格分级问题清单。

---

## 0. 已读基线 Checklist

- [x] `/Users/bo/Documents/Development/Ensemble/Ensemble2/.dev/category-hierarchy/00_understanding.md`
- [x] `/Users/bo/Documents/Development/Ensemble/Ensemble2/.dev/category-hierarchy/01_research/_synthesis_decisions.md`
- [x] `/Users/bo/Documents/Development/Ensemble/Ensemble2/.dev/category-hierarchy/01_research/r3_visual_interaction_design.md`
- [x] `/Users/bo/Documents/Development/Ensemble/Ensemble2/.dev/category-hierarchy/01_research/r4_hci_evaluation.md`
- [x] `/Users/bo/Documents/Development/Ensemble/Ensemble2/.dev/category-hierarchy/01_research/r7_design_philosophy_distillation.md`
- [x] `/Users/bo/Documents/Development/Ensemble/Ensemble2/.dev/category-hierarchy/02_design_spec.md` V1（**评审主对象**）
- [x] `/Users/bo/Documents/Development/Ensemble/Ensemble2/.claude/rules/design-language.md`（**评审副对象**）
- [x] `/Users/bo/Documents/Development/Ensemble/Ensemble2/.dev/sidebar-reorder/02_design_spec.md` V3（V3 不变量必背基线 — 完整文件 + 历史 P0 修复）
- [x] `/Users/bo/Documents/Development/Ensemble/Ensemble2/.dev/category-hierarchy/01_research/_dispatch_plan.md`
- [x] 已交叉验证以下源代码事实（**非推断**）：
  - `src/components/common/ColorPicker.tsx:178`（dot `w-2 h-2` = 8 × 8 px）
  - `src/components/sidebar/SortableCategoriesList.tsx:285-303`（Show X more 是 `<button data-no-dnd="true">` 模式 + `ChevronUp/Down size={12}`）
  - `src/components/sidebar/SortableCategoryRow.tsx:82-121`（dnd-kit listeners chain 实际写法 + V3 P0-2 教训）
  - `src/components/sidebar/CategoryRowContent.tsx:42`（ColorPicker wrap = `<span data-no-dnd="true" onMouseDown={(e) => e.stopPropagation()}>`）
  - `src/components/sidebar/dnd/CustomMouseSensor.ts`（data-no-dnd 实际行为）
  - `src/index.css:651-660`（`.drop-indicator-h` 实际：height 2px / margin 0 2px / 用 transform 不用 left）
  - `src/components/sidebar/dnd/snapModifier.ts:35-37`（SNAP_RANGE_PX = SNAP_DISTANCE_PX = 12）
  - `src/components/sidebar/dnd/animations.ts:9`（`SNAP_DISTANCE_PX = 12`）

---

## 1. 总评打分与一句话评语

**87 / 100**

V1 在视觉表达与 V3 不变量保留两条主线上接近优秀：唯一新 token `--indent-step: 16px`、Anti-pattern 清单 24 条具体可执行、Acceptance ≥ 18 项客观、22 V3 不变量逐项核对——这是 Apple/Linear/Things 团队会认可的**结构**。**距 10/10 的差距集中在 5 个 P0**：(1) `.drop-indicator-h` 用绝对 `left/width` 描述与现有 CSS 实现（`margin 0 2px` + `transform`）冲突；(2) chevron click hit-target 分离与父类 row 的 dnd 拖拽 listeners 在 leading 16 px 上的"hit-target 占用"机制未指明（V3 §P0-2 教训未被吸收）；(3) localStorage 语义在 V1 内部从 R3 的 `expandedCategories` 反转为 `collapsedCategories`，反转方向影响默认行为容错性，但 §2.15 的"默认全展开 / 创建新父类自动展开 / 创建新子类自动展开父"等行为口径未与新语义对齐；(4) D5 (父类不可成子) 与 D8 (聚合 count) 的 dragOffset.x 判定在拖动**父类**时的"非法区"措辞与"父类拖到另一父类的 reorder 区合法"叙述存在边界悖论（dragOffset.x = +12 + 1px 突变 vs dragOffset.x = +12px 合法 vs +13px + dwell 非法），需要明确状态机；(5) §2.6 子类 DragOverlay "不携带 26 px 缩进" 的论据虽对但与 V3 §2.2 一句话的等效"DragOverlay 不带原位 padding"形成隐式声称——需明确 V3 不变量 #20 的来源（即"V3 §2.2 隐含"在 V3 spec 内**未显式表述**，是 V1 的二次推断），按 verify-third-party-behavior-firsthand 必须落实为代码事实而不是 V3 spec 引用。其余 P1 / P2 集中在文字精度、口径统一、与 design-language.md 的横向交叉。

---

## 2. P0 问题列表（设计 stop-ship 级，必须修订）

### P0-1 — `.drop-indicator-h` 几何描述与现有实现冲突，hierarchy 缩进表达需要新增方案

**问题**：V1 §2.7 表格描述 drop indicator 在 hierarchy 下的视觉为：

> dragOffset.x ∈ [-12, +12] | `left = row.left + 2`、`width = row.width - 4`
> dragOffset.x ≥ +12 + dwell | `left = row.left + var(--indent-step) + 2 = row.left + 18 px`；`width = row.width - var(--indent-step) - 4 = row.width - 20 px`

**出处**：`02_design_spec.md` V1 §2.7（行 180-185）+ §6.5 + §9 Acceptance 第 6/7/8 项。

**事实校对**（非推断 — 已 Read `src/index.css:651-660`）：

```css
.drop-indicator-h {
  height: 2px;
  background: var(--color-accent);
  border-radius: 1px;
  margin: 0 2px;
  transition:
    opacity var(--duration-drag-indicator-fade) ease-out,
    transform var(--duration-drag-indicator-move) var(--ease-drag);
}
```

V3 现有 indicator 是**普通 block 元素 + `margin: 0 2px` + 由 `transform` 驱动 translateY**，**不是绝对定位用 left/width 控制**的元素。"row.left + 2" 这种表述是误用了 absolute positioning 心智模型。`.drop-indicator-h` 本身在 V3 没有 `position: absolute`、没有 `left:`、`width:`、也没有显式宽度——它在 sortable list 的常规 flow 内通过 transform 在 row 之间表达"位置已确定的水平线"。

**影响**：
1. 实施 SubAgent 在按 V1 §2.7 落地时会困惑：到底是改 `.drop-indicator-h` 为绝对定位、还是用 `margin-left: var(--indent-step)`？两者视觉等价但实现路径完全不同（前者破坏 V3 indicator transition transform；后者 V3 transform 仍有效）。
2. §9 Acceptance 第 8 项要求 "DevTools Elements 验证 indicator 起点 left = row.left + 18px" — **但现有元素根本没 left 属性**，断言不可机械检验。
3. P0-2 教训（V3 §2.7 修订史中"声称的 transition 是由 dnd-kit 提供"实际未提供）的反复——在没看 V3 实际 CSS 的前提下"以为" indicator 是 absolute。

**修订建议**：
1. **V2 §2.7 改用 margin-left 表达**：
   - reorder 区（dragOffset.x ∈ [-12, +12]）：`margin-left: 2px; margin-right: 2px`（与 V3 现状一致；indicator 占满 sortable list 宽度减 4px）。
   - demote 区（dragOffset.x ≥ +12 + dwell）：`margin-left: calc(var(--indent-step) + 2px) = 18px; margin-right: 2px`。
   - promote 区（dragOffset.x ≤ -12 + dwell，且被拖项原本是 child）：`margin-left: 2px; margin-right: 2px`（顶到根级，与 reorder 区一致）。
2. **§6.3 增加 V3 不变量复核条款**："indicator 仍通过 transform 驱动垂直位移；缩进过渡仅修改 margin-left（CSS transition 包含 `margin-left var(--duration-drag-indicator-move) var(--ease-drag)` 一项）。"
3. **§9 Acceptance 第 6/7/8 项改写为 margin-left 验证**："DevTools Elements computed style `margin-left: 2px` (reorder) / `margin-left: 18px` (demote)。"
4. **§5 CSS Token 增加`.drop-indicator-h`需追加的 transition 项**：明确 V2 阶段 `.drop-indicator-h` 的 transition 字符串增加 `, margin-left var(--duration-drag-indicator-move) var(--ease-drag)`（不动 transform 那条）。

---

### P0-2 — chevron click 与 row drag 的 hit-target 占用悖论：dnd-kit 4 px activation 在 chevron 按下后是否触发？

**问题**：V1 §2.4 + §2.13 + §6.4 + §11 R6 + V3 不变量 #13 多处声称"chevron click 与 row click hit-target 分离"，但实施细节是：

> §6.4：`chevron 包裹一个独立 `<button>` 元素，width: 16px、onClick = (e) => { e.stopPropagation(); toggleExpand(); }; row 整体的 onClick 仍负责 navigate；chevron click 不会冒泡到 row click（stopPropagation）`
>
> §V3 不变量 #13：`chevron <button> 加 data-no-dnd="true" + onMouseDown stopPropagation，与 ColorPicker 一致`

**事实校对**（非推断 — 已 Read `src/components/sidebar/dnd/CustomMouseSensor.ts` + `CategoryRowContent.tsx:42`）：

`CustomMouseSensor` 在 `onMouseDown` 时检查祖先 `data-no-dnd="true"`，若存在则**短路 dnd 激活**——这是 ColorPicker dot 的工作原理，已经正确。**但**：

1. ColorPicker dot 是 `<span>`（无原生 click semantic），用 `onMouseDown stopPropagation` 即可阻止冒泡到 sortable row。
2. chevron 是 `<button>`（**有原生 click semantic + 原生 keyDown semantic + 焦点管理**），且 V1 没说清楚 chevron 与 sortable row 的 listeners chain 关系。

**关键技术问题**（V1 没回答）：
- chevron 在父类 row 内时，dnd-kit 的 `useSortable` 给整个 row 注入 `attributes / listeners`（包含 `onPointerDown / onKeyDown / onMouseDown`）。spread 到 row 的 `<div>` 上时，**chevron `<button>` 是否被这些 listeners 覆盖**？
- 项目 Memory 已记录："dnd-kit listeners chain (not shadow)：当添加 onKeyDown 时，必须 extract listeners.onKeyDown 并 chain 在 custom logic 之前；spread 顺序必须 listeners → custom override 才不会 shadow 自定义 onKeyDown。" 这是 V3 §P0-2 修复的明确教训（`SortableCategoryRow.tsx:82-121` 实证）。
- chevron 的 `<button>` 在父类 row 子树中，子节点 `data-no-dnd="true"` + `onMouseDown stopPropagation` 可阻挡 mouse 路径，**但 keyboard 路径**（Tab 到 chevron 后按 Space/Enter）—— `<button>` 原生触发 click event，但 dnd-kit `KeyboardSensor` 监听的是 `onKeyDown`（在 row 上），按 Space 在 chevron `<button>` 上时事件**先**到 chevron（trigger native click → toggleExpand）再冒泡到 row（dnd-kit 监听）。**V1 没声明 chevron 是否要 keyDown stopPropagation**。

**影响**：
1. 用户键盘 Tab 到父类 row 后，`Tab` 再按一次进入 chevron（`<button>` 默认可 focus），此时按 Space → 同时触发 chevron toggle + dnd-kit lift？还是只 chevron toggle？V1 没解。
2. 如果 chevron 用 `<button>` 元素 + `data-no-dnd="true"`，`<button>` 在 V3 现有"Show X more" 模式下已被验证能阻挡 dnd（`SortableCategoriesList.tsx:286`）—— **但 "Show X more" 在 SortableContext 之外，chevron 在 SortableContext 之内**（父类 row 是 sortable）。两者 hit-target 占用机制不同。
3. V3 §2.9 `justDroppedRef / 50ms guard` 是为 click 的反向防误触；V1 没说清楚 chevron click 是否也走 justDroppedRef 检查。如果不走 → 拖动结束瞬间用户点 chevron 区会被 50ms guard 误识为 row click。

**修订建议**：
1. **§2.4 增加 chevron 元素的完整 attributes 表**：
   ```
   chevron <button>: 
     - data-no-dnd="true" 
     - aria-label="Toggle {categoryName} children"
     - aria-expanded={expanded}
     - onMouseDown={(e) => e.stopPropagation()} (V3 ColorPicker pattern)
     - onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') e.stopPropagation(); }} (新增；防 Space 触发 dnd-kit lift)
     - onClick={(e) => { e.stopPropagation(); toggleExpand(); }}
     - tabIndex={0} (默认；不要 -1，否则键盘不可达)
     - 不在 SortableContext 之外；在父类 row 内但通过 data-no-dnd 短路 dnd 激活
   ```
2. **§6.4 增加 keyboard 路径明确**：chevron 焦点状态下按 Space/Enter 仅触发 toggle，不冒泡到 row 的 dnd-kit listener；按 Esc / Tab 按系统默认行为。
3. **§7 V3 不变量核对清单 #18 (justDroppedRef) 增加 chevron 检查**：拖动结束后 50ms guard 内 chevron click 是否豁免？建议**豁免**——chevron 是非 dnd 的独立 affordance，不应被 dnd 50ms guard 牵制。明确写："chevron click 不受 justDroppedRef 50ms guard 约束（chevron 在 data-no-dnd 域内，与 row click 完全独立）。"
4. **新增 Anti-pattern 条目**："chevron 不能用 `<div role='button'>` 仿冒——必须真 `<button>`，否则键盘可达性 + screen reader 行为破坏（Apple Design Studio 守则）。"

---

### P0-3 — localStorage 语义反转：从 R3/R4 的 `expandedCategories` 改为 V1 的 `collapsedCategories`，但 V1 内部行为口径未对齐

**问题**：R3 §5.4 + R3 §15.2 takeaway #4 明确写："localStorage key = `ensemble.sidebar.expandedCategories`，存 JSON `string[]`；初始默认 = 全展开。" — 即**存储展开的父类 ID**（缺省语义 = 折叠）。

V1 §2.15 + §9 Acceptance #13 + §11 风险 R5 + §V3 不变量 #17 全部改为 `ensemble.sidebar.collapsedCategories` ——**存储折叠的父类 ID**（缺省语义 = 展开）。

**反转的潜在好处**：默认展开（V1 §2.15 锁定）+ 仅持久化"用户主动折叠的"集合 → 新父类自动展开（不在集合内）+ localStorage 缺失时全部展开 → 直觉对。

**反转的潜在风险**（V1 没处理）：
1. **§2.15 行为口径未与新 key 语义对齐**：
   - "创建新父类 → 默认展开（新建意味着用户在主动操作它）" — 在 `collapsedCategories` 模型下：什么都不需要做（新 ID 不在集合内 = 展开）。✓ 一致。
   - "创建新子类 → 父类自动展开（如果折叠的话）" — 在 `collapsedCategories` 模型下：需要 `setCollapsedCategories(prev => prev.delete(parentId))` 显式从集合移除。**V1 没说**。
   - "拖动开始 → 全部父类自动展开" — V1 描述为"不修改持久化状态，仅覆盖渲染"。在 `collapsedCategories` 模型下需要 React state `dragOverrideExpand: boolean` 与 `localStorage collapsed: Set` 同时存在的合并语义。**V1 没说**这两个状态的 OR/AND 关系。
   - "拖动结束 → 恢复用户的持久化折叠状态" — 即 dragOverrideExpand = false。**V1 没说**这是 onDragEnd / onDragCancel 都要重置。
2. **§Acceptance #13 措辞自相矛盾**："折叠/展开任一父类后，`localStorage.getItem('ensemble.sidebar.collapsedCategories')` 返回有效 JSON `string[]`（折叠的 category UUID 列表）" — 这条只验证"集合中包含"，没验证"展开的父类 ID **不在**集合中"。在 expanded → collapsed 转换里，"展开父类 X" 应该 `delete(X)` 不是 `add(X)`，这条 Acceptance 不够细。
3. **HIG 引证错位**：R3 §5.2 HC5 引 HIG "Retain people's expansion choices"——HIG 描述的是"记忆**展开**这个动作"，与 `expandedCategories` 直接对应；与 `collapsedCategories` 对应需要"我记得你折叠过的"额外推理一步。**这不是错，但语义重定向需要明确写在文档里**。

**影响**：实施 SubAgent 按 V1 §2.15 各条单独读，会在"创建新子类自动展开父类" 这一行为上漏写代码（因为新 key 下展开状态默认开启，但若父类**已经**在 collapsedCategories 集合中，需要 `delete(parentId)`）。这是潜伏性 P0 — 一段时间内功能看似正常，直到用户先折叠 → 再创建子类 → 子类被父类折叠折叠不可见 → 用户困惑。

**修订建议**：
1. **V2 §2.15 表格逐行改写为 `collapsedCategories` 语义的精确动作**：
   ```
   | 默认状态 | localStorage missing → 视为 empty Set → 全部父类展开 |
   | 用户点击 chevron 折叠父类 X | collapsedCategories.add(X)；持久化 |
   | 用户点击 chevron 展开父类 X | collapsedCategories.delete(X)；持久化 |
   | 创建新父类 X | 不需要修改 collapsedCategories（新 ID 不在集合内 = 展开）|
   | 创建新子类 → 父类 P 自动展开 | collapsedCategories.delete(P)；持久化（确保 P 不在折叠集合中）|
   | 拖动开始（onDragStart）| React state `dragOverrideAllExpanded = true`；不修改 collapsedCategories；渲染时 `expanded = !collapsedCategories.has(id) || dragOverrideAllExpanded` |
   | 拖动结束（onDragEnd / onDragCancel）| `dragOverrideAllExpanded = false`；不修改 collapsedCategories |
   ```
2. **V2 §2.15 增加"渲染合并函数"伪代码**：明确 effective expansion 由 `(persistedCollapsedSet, dragOverrideAllExpanded)` 二元组决定。
3. **V2 §9 Acceptance #13 改写为双向**："折叠父类 X → `JSON.parse(localStorage.getItem('ensemble.sidebar.collapsedCategories')).includes(X)` 为 true；展开父类 X → 同 expression 为 false。"
4. **V2 §1 设计哲学条目 2 引证改为对应语义**：将 "Retain people's expansion choices" 改述为 "持久化用户主动**偏离默认**的折叠动作；新父类与未操作过的父类自然继承默认展开"。

---

### P0-4 — D5 (父类不可成子) 状态机在 dragOffset.x = +12px 边界的合法/非法切换语义不清

**问题**：V1 §2.14 表 + §4.3 时序示意 描述：

> §2.14：父类 → 同级根 reorder | **合法** | drop indicator 横线（V3 不变）
> §2.14：父类 → 另一父类的"drop into"区（dragOffset.x ≥ +12 + dwell）| **非法**
> §4.3：⚠️ 父类拖到另一父类的"reorder 区"（dragOffset.x ∈ [-12, +12]）是合法的同级 reorder；只有 dragOffset.x ≥ +12 + dwell 80ms 才进入"drop into"非法区

**逻辑边界分析**：
- 拖动父类 P1 至父类 P2 上方且 dragOffset.x = +12 px 时：边界值，V1 没说"≥" 是包含还是不包含。
- 用户从 P1 拖到 P2 上方 + 缓慢横向漂移时：dragOffset.x 在 +11px / +12px / +13px 之间抖动——视觉反馈在 [+12px + dwell] 边界 fluctuate。dwell 计时器在抖回 +11px 时是清零（V1 §6.3 写"dwell 计时器在 hover 离开 over row 时立即清零"——但 over row 没变，仅 X 偏移变了）还是保留？V1 没回答。
- 当用户**按住** P1 右移 X = +20px 长达 100ms（已过 80 dwell）触发非法视觉（DragOverlay opacity 0.5 + cursor not-allowed），然后**回退** X = +5px：
  - 仍在 P2 上方，drop into 非法状态应该清除（变同级 reorder 合法）—— V1 没显式说。
  - DragOverlay opacity 是否瞬时 0.5 → 0.95？需要 fade 动画？V1 没说。

**影响**：
1. 用户体验在边界场景"闪烁"——drop indicator 出现 / 消失 / 父类 drop into 非法状态 / 同级 reorder 合法状态 在 ±1px 之间反复切换。
2. dwell 计时器的清零条件不明确——清零规则错配会导致"用户停在 +12.5px 处但 dwell 始终不到 80ms"（计时器被高频清零）。
3. 测试 + Acceptance 无法机械验证边界行为。

**修订建议**：
1. **V2 §6.3 增加完整状态机**：
   ```
   dwell state machine (per drag session):
     - state: 'idle' | 'pending-demote' | 'pending-promote' | 'committed-demote' | 'committed-promote'
     - 'idle' → 'pending-demote' 当 dragOffset.x 进入 (+12, +∞)
     - 'pending-demote' → 'committed-demote' 80ms 内未回退
     - 'pending-demote' → 'idle' dragOffset.x 退回 [-12, +12]（保留累计计时？或重置？建议**重置**，因为用户回退是明确"取消" 的信号）
     - 'committed-demote' → 'idle' dragOffset.x 退回 [-12, +12]（视觉立即恢复 reorder 状态）
     - 切换 over row 时（onDragOver 触发 over change）→ 一律重置到 'idle'
   ```
2. **V2 §2.14 增加边界规则表**：
   ```
   | dragOffset.x | over=父类 P2 (when active=父类 P1) | dwell satisfied |
   |---|---|---|
   | < -12 px | promote 区（仅 child 可触发；P1 是 parent 故 idle）| no |
   | [-12, +12] | reorder 同级（合法）| no |
   | (+12, +∞) | drop into demote 候选 | wait dwell |
   ```
3. **V2 §11 风险登记** 增加 R7："dwell 边界抖动 ±1px 反复触发 drop into 候选" — 缓解：state machine 重置规则 + 视觉反馈无 fade（避免抖动出现 fade 动画分裂）。
4. **V2 §2.12 Cancel 视觉一致性约束**：明确"opacity 0.95 ↔ 0.5 切换不引入 fade 过渡，瞬时切换"——这条目前只在隐含层面通过 V3 §2.7 文字推断；hierarchy 边界抖动场景需要显式写。

---

### P0-5 — V3 不变量 #20 ("DragOverlay 不带原位 padding") 是 V1 的二次推断而非 V3 spec 显式表述，违反 verify-third-party-behavior-firsthand

**问题**：V1 §7 V3 不变量核对清单 #20 写：

> DragOverlay 不带原位 padding（V3 §2.2 隐含——DragOverlay 内容是 row 内部克隆，原位 row 的 padding 不复用）

V1 用此为 §2.6 "子类 DragOverlay 不携带 26 px 缩进" 的论据。

**事实校对**：V3 `02_design_spec.md` §2.2 实际明确表述（V3 行 X-Y）"DragOverlay 内容: ColorPicker dot + 名字（**省略 count**）"——V3 spec **没有显式说**"DragOverlay 不带原位 padding"。这是 V1 在 hierarchy 上下文中的**二次推断**。

**实施层面**（已 Read `DragOverlayCategoryRow.tsx` 第 21 行）：DragOverlay 当前 className `drag-overlay-row h-8 px-2.5 flex items-center gap-2.5`——**有自己的 px-2.5 = 10px padding**，但**这是 DragOverlay 自有 padding（用于阴影 box 内部），不是 row 原位 padding 的复制**。V1 第 #20 条"原位 row 的 padding 不复用"**事实正确**，但**论据归属错误**——它不是 V3 §2.2 的推断，是 DragOverlay component 的实现选择（选择写死 px-2.5 而不是接受 row prop）。

**违反规则**：`.claude/rules/verify-third-party-behavior-firsthand.md` 明确："任何'X 是 Y 提供' 类声称必须 link 到 node_modules 源码或 .d.ts，或显式标记为推断。" V1 这里把"DragOverlay 自有 padding 实现"误归为"V3 §2.2 隐含"——属于"由 spec 推断 lib/component 行为"而未实际验证。

**影响**：
1. 后续 SubAgent 按 V1 §7 #20 推断 V3 spec 隐含某行为时，会再叠加新推断（"V3 §2.2 隐含 a"+"V1 §7 隐含 b"= 二级推断），逐步与代码事实脱钩。
2. 子类 DragOverlay 行为（不携带 26 px 缩进）的真实保障**应来源于 DragOverlay component 的 className hardcoded 是 px-2.5**，而不是"V3 §2.2 隐含"。这两种保障的修订条件完全不同——前者修改 className 即可改变；后者改 V3 spec 文字才能影响——文档误归属让维护成本变高。

**修订建议**：
1. **V2 §7 #20 改写为代码事实**："DragOverlay 不带原位 row 的 padding（来源：`DragOverlayCategoryRow.tsx:21` className 写死 `px-2.5` 而非动态 row prop；hierarchy 不修改此 className）。"
2. **V2 §2.6 论据段去除"V3 §2.2 隐含"措辞**，直接引用 `DragOverlayCategoryRow.tsx:21` 行号。
3. **V2 增加全局规则**：所有"V3 隐含"措辞（V1 §2.6、§2.9、§7 多处）都要交叉到 V3 spec **逐条核对原文**——若 V3 spec 没明文，必须降级为"V1 推断"或追加 V3 spec 文字本身（cross-document cascade discipline）。
4. **V2 §1 Revision History** 增加："V1→V2 修复 P0-5：去除 V3 spec 二次推断；所有 V3 不变量条款均链接到 V3 spec 原文行号或代码事实行号。"

---

## 3. P1 问题列表（应当修订，不阻塞）

### P1-1 — chevron rotation duration 120ms 没有 token 化但被 design-language.md 的"Animation tokens are mandatory"约束

**问题**：V1 §5 末段说"chevron rotation duration = 120ms 是项目'Show X more'切换的现状值，不属于已有 token；本规格首次显式声明，建议 03_tech_plan 评估是否提取为 `--duration-disclosure-rotate: 120ms` token——属技术决策。"

**冲突**：design-language.md L29 写 "Animation tokens are mandatory. Every transition's duration and easing MUST reference `--ease-drag*` / `--duration-drag-*` (or the inline allow-list in §Constraints). Self-invented cubic-beziers and stray `200ms` literals are forbidden."

按副对象 design-language.md V1 自己的硬约束，120ms 应当落 token。V1 把这条丢给 03_tech_plan 决策——不符合 design-language.md L29 的硬约束语义。

**事实校对**（已 grep）：`src/index.css:606` 仅有 `--duration-drag-lift-pull: 120ms`——同值但**语义完全不同**（lift 拉离 vs disclosure 旋转），按 design-language.md L78 不宜共享 token（语义不混用）。

**影响**：02 → 03 冲突 → 实施期 03 SubAgent 选择不落 token → 与 design-language.md 第一条 Principle 直接矛盾——审查会反复 ping-pong。

**修订建议**：V2 §5 直接写 "新增 `--duration-disclosure-rotate: 120ms` token"——本是设计决策（不是技术决策），落地不需要 03_tech_plan 二次评估。同时 design-language.md V2 在 Constraints 章节扩展 disclosure rotation token 列表。

---

### P1-2 — V1 §1 设计哲学第 1 条与 Anti-pattern §2.21 关于 chevron 的措辞悖论

**问题**：
- §1 设计哲学第 1 条："父子关系**仅靠左 padding（`var(--indent-step) = 16px`）+ chevron disclosure 控件**承担。"
- §2.21 Anti-pattern："chevron 在无子类的父类 row 上渲染" → 禁止
- §2.4 chevron 仅在父类有 ≥ 1 个 child 时渲染

意味着：**无子类的父类 row 视觉与普通 root row 完全一致**——但"父子关系仅靠 indent + chevron 承担" 在"父类无子类时"既无 indent 又无 chevron——**那一刻"父子关系"完全不可见**。

**逻辑分析**：用户视角下父类无子类时的 row 看起来与"普通 row" 完全相同，因为它**就是**普通 row（"父类"是关系不是属性）。R4 §8.2 已论证此点正确（"无子时父根本不是'父'"），但 V1 §1 哲学语述"父子关系靠 indent + chevron"在此类场景悖论——**父子关系不存在因为没有子**。

**影响**：哲学条款被实施 SubAgent 按字面读时会困惑——"我要不要在所有父类上做点什么？" 答案是"不"，但 §1 表达让其难以一眼看出。

**修订建议**：V2 §1 第 1 条改写为更精确措辞："**有子类的父类 row** 通过 chevron disclosure 承担'有子'信号；**子类 row** 通过左 padding 16 px 承担'是子'信号；**无子类的父类 row** 与普通 root row 视觉完全一致——hierarchy 关系是**相对**的，无子时无关系。"

---

### P1-3 — chevron 颜色三态 (`#A1A1AA` / `#71717A` / `#18181B`) 与 design-language.md 的 zinc 体系一致但选取依据不全

**问题**：V1 §2.2 chevron 颜色三态：

| 状态 | 颜色 |
|---|---|
| default | `#A1A1AA` (`var(--color-tertiary)`) |
| hover row | `#71717A` (`var(--color-secondary)`) |
| active 父类 | `#18181B` (`var(--color-primary)`) |

**对照 design-language.md L60**：所有色值必须来自 token 或 zinc palette。✓ 全部来自 zinc 体系。

**但**：V1 没说为何选择**这套三态阶梯**而不是其他可能（比如 `#71717A → #52525B → #18181B`，差距更小阶梯更细）。R3 §5.3 给出了 chevron 颜色单点（仅 default `#A1A1AA`）+ rotation 时长，但**未论证三态**。R3 §7.2 表格写了三态但未给依据。

**对照 macOS Finder 实测**：Finder list view disclosure triangle 在 default / hover / active 也有三态——但 Finder default = `secondaryLabelColor` ≈ `#3C3C435C` (`#71717A` 较接近)，不是 `#A1A1AA`。

**影响**：依据不充分 → 不能反驳"选择别的更对"——design-language.md L21 "every spec has a reason" 要求每条都有依据。

**修订建议**：V2 §2.2 chevron 颜色表追加 "依据" 列，引用 macOS Finder secondary label color + 项目"Show X more" chevron 实际颜色（`text-[#A1A1AA]`，已 grep 验证 `SortableCategoriesList.tsx:289`）—— "Show X more" 已用 `#A1A1AA` 默认；hierarchy chevron 沿用同 token 实现项目内一致性。三态 hover / active 的逐级加深则按"chevron 跟随 row state"原则——row text 色彩在 hover / active 时也加深，chevron 同步变化。这是依据完整版本。

---

### P1-4 — V1 §2.6 子类 DragOverlay 不携带缩进的论据中"目标深度会随用户拖移变化"未与 §6.3 dwell 状态机协调

**问题**：V1 §2.6 论据：

> 子类 DragOverlay 不携带缩进的论据：拖动期间深度由 `dragOffset.x / var(--indent-step)` 投影，即"目标深度"会随用户拖移变化；如果 DragOverlay 自带 26 px padding，会与新目标深度的视觉冲突。

**事实校对**：V1 §6.3 已锁定 X 阈值为 12 px（不是 dnd-kit example 默认 `indentationWidth/2 = 8` 也不是 16 px / 2 = 8 px）。"目标深度由 `dragOffset.x / var(--indent-step)` 投影"是 dnd-kit Sortable Tree example 的默认行为，但 V1 §6.3 已经显式覆盖为"12px + 80ms dwell"——所以"目标深度随拖移**实时**变化"在 V1 模型下**不准确**：实际是"达到 12 px + dwell 80ms 后**离散切换**深度"，中间是稳定状态。

**影响**：§2.6 论据用 dnd-kit 默认行为支持决策，但 V1 已偏离 dnd-kit 默认——论据链条断裂。

**修订建议**：V2 §2.6 修正论据为："拖动期间深度有两种稳定态（root / child），由 dragOffset.x 翻越 12 px + dwell 80ms 后离散切换。如果 DragOverlay 自带 26 px padding，DragOverlay 在 dragOffset.x = 0 ~ 12px 时（无意改深度的 reorder）也表现为 child 视觉——破坏 V3 严格跟手原则（DragOverlay 视觉应等同被拖项当前形态而非未来形态）。"

---

### P1-5 — design-language.md 的 11 条 Principles 中 "Visual hierarchy ≤ 3 layers" 与 hierarchy task 的视觉栈关系不清

**问题**：design-language.md L55 "Visual hierarchy ≤ 3 layers. Page → header + main → list (or list + detail) → row + slide-panel. No four-deep modal-on-modal-on-popover stacks."

V1 引入 hierarchy 后视觉栈：
- Page → header + main（含 sidebar + content）→ sidebar `Categories section` → 父类 row → 子类 row（缩进 26px）→ chevron click → 折叠/展开

子类 row 是父类 row 的视觉子层 —— 算第几层？
- 若按 "row + slide-panel" 这条—— sidebar 内的 row 算第 3 层；那子类 row 算第 4 层？还是仍在第 3 层（因为 row 本身的"形态变化"不算分层）？
- design-language.md 没明确"层"的定义——是 z-index？是 DOM 嵌套？是用户感知层级？

**影响**：实施 SubAgent 在引入"折叠/展开"时如果以为这是"违反第 3 层 cap"会主动避免——但实际上 hierarchy 的子类 row 不是"新一层"，是 sidebar list 的内部排列。design-language.md V2 应澄清。

**修订建议**：design-language.md L55 改为更精确措辞：
"Visual hierarchy ≤ 3 layers (Z-index / overlapping panels). Sidebar internal hierarchy (e.g. category → subcategory rows) does NOT count as a separate layer — it's structural ordering within the same panel layer. Layers count only when there's a new modal / popover / slide-panel that visually overlaps the previous one."

---

### P1-6 — V1 §5 CSS Token 列表与 design-language.md L66 Duration tokens 列表不交叉验证

**问题**：V1 §5 列出了 hierarchy 复用的 V3 token：
- `--duration-drag-snap: 80ms` — "磁吸 lerp（不动；hierarchy 的 dwell 80ms 与此**数值相同但语义独立**：磁吸是 modifier 内连续引力，dwell 是 React state lazy commit）"

design-language.md L66 写：`--duration-drag-snap` 80 ms。两文件值一致，但**含义注释不同**：
- design-language.md: "snap" — 磁吸
- V1 §5：dwell 复用同值

dwell 在 V1 是新概念，**不应该叫 "snap"**——dwell 是用户停留时间阈值，与磁吸 lerp 是两个 task（V1 已声明独立）。但若实施期 SubAgent 用 `--duration-drag-snap` 同时驱动 dwell 计时器 + 磁吸 lerp（直觉地）—— 两者绑定后任一改值会影响另一者的物理感。

**影响**：与 P1-1 同源——实质是"V1 没引入 dwell token"。本 P1 不阻塞但建议处理。

**修订建议**：V2 §5 增加 `--duration-hierarchy-dwell: 80ms` token；并在 design-language.md V2 Constraints 表加一行 dwell。两值在初始相同纯属巧合，未来调参时分离。

---

### P1-7 — Acceptance §9 第 22 项 (autoClassify 落根) 的描述漏掉一处事实

**问题**：V1 §9 第 22 项："☐ D14 autoClassify 落根：autoClassify 创建新分类后，新 category 在 `data.categories` 末尾、`parent_id === null`；不会建议父类。"

按 _synthesis_decisions §3 D14 = A 锁定的语义对，但漏了一处事实：**autoClassify 是否应在已存在的 hierarchy 树下推荐子类**？比如已有 "AI Tools / LLM" 这条线，autoClassify 给某个新 Skill 的 suggested_category = "LLM"—— LLM 是**已存在的子类**，应该挂在原父类下不动，还是创建新根？

V1 §11 + R6 D14 没正面回答这条。R6 §6.4 写：

> autoClassify 创建新 category 时（即 LLM 给出 suggested_category 是个不存在的 name），新 category 落根 + parent_id = null。
> 若 LLM 建议的是**已存在**的 category name（无论它是 root 还是 child），保持原有 hierarchy 关系。

**影响**：V1 §9 第 22 项只机械验证 "新建" 路径——已存在 category name 命中 child 的路径未验证。

**修订建议**：V2 §9 第 22 项扩展为两子项：
- 22a: autoClassify 创建**新** category → parent_id === null（V1 现状）
- 22b: autoClassify 命中**已存在的子类**（如 "LLM" 已是 "AI Tools" 的子）→ Skill/MCP/ClaudeMd 仍引用 "LLM"，**不修改 LLM 的 parent_id**（保持子类身份）

---

### P1-8 — design-language.md 缺失 hierarchy 任务专有的"子类视觉权重等同父类"原则

**问题**：design-language.md V1 是 117 行通用规则，**没有任何关于 hierarchy 的专门条款**。V1 02_design_spec 引入的核心新原则"子类视觉权重等同父类（D11：仅缩进表达层级）"——这条**应该**沉淀到 design-language.md（按 cascade footprint 声明，V1 在 Revision History 也明确列出"design-language.md V1 的'hierarchy 视觉一致性'段落"）—— 但截至当前阅读 design-language.md V1（已读，117 行），**没有这条**。

**影响**：未来非 sidebar 场景（如 SkillDetailPanel 的 Category dropdown 按 D9 用 16px 缩进 + 父类可选）的视觉决策没有 design-language.md 锚点——重新会引发"父类要不要加粗 / 子类 dot 要不要淡化"的旧争论。

**修订建议**：design-language.md V2 在 Principles 章节增加：
"**Hierarchy is expressed by position, not by decoration.** When showing a parent-child relationship, the child item MUST share font weight, color, dot size, and dot opacity with its parent. Indent (`var(--indent-step) = 16px`) is the only visual differentiator. Decorative differences (faded dot, thinner text, smaller row, indent guide line) are forbidden — they would violate the user's color/typography choices and reduce minimalist coherence."

---

## 4. P2 问题列表（建议改进，可推迟）

### P2-1 — Acceptance §9 第 6 项措辞使用绝对单位"px"但应该 token 化

第 6 项：`drop indicator 起点 left = row.left + 18 px` — 应当改写为 `margin-left = 2px (reorder) / 18px (= calc(var(--indent-step) + 2px), demote)`，与 design-language.md L60 token 化要求一致。

### P2-2 — V1 §3 键盘表中 ↓键的描述仅"row 间导航（V3 不变）"，但 hierarchy 引入后跨父子的"↓键穿越"行为没说

举例：父类 P1 有子类 C1 / C2 / C3；P2 是下一个父类。从 P1 row 按 ↓ 应该走 C1（进入子树）还是 P2（同级）？V3 是 1D，无歧义；V1 引入 hierarchy 后必须明示。dnd-kit Sortable Tree example 的 keyboard coordinator 走"flatten 顺序"——即 P1 → C1 → C2 → C3 → P2—— V1 应该锁定此行为。

### P2-3 — §2.20 ContextMenu "Promote to Root" 与 "Move to Parent..." 的视觉规格未给

ContextMenu items 的 icon / shortcut 标记 / disabled state visual 等。可推到 03_tech_plan 决定，但 V2 应给 1-2 句规格 hint（icon = `lucide-react` `ArrowUp` / `Move`；不带 shortcut 标识；disabled 时灰色 `#A1A1AA`）。

### P2-4 — §4.1-4.5 时序示意中所有 mouseup/Drop complete 的时间点 "t=720" "t=940" 等是示例值，应标注"actual timing varies by user gesture; here for illustration only"

避免实施 SubAgent 把 t=720 当成具体规格落地。

### P2-5 — V1 §11 风险登记 R5 "localStorage 折叠状态跨 git worktree" 写得不充分

跨 worktree 共享 localStorage 是因 Tauri webview origin 问题；V1 写 "预期不构成问题" 但未给验证证据。建议：在 03_tech_plan 决定 localStorage 是否升级到 settings.json（per device）—— V1 仅声明本规格不阻塞即可。

### P2-6 — design-language.md L102 "highest-resolution living example" 现在指向 V3 而 V1 02_design_spec 已经接近同等高分辨率

V2 design-language.md 应增加 "Two living examples: sidebar-reorder V3 + category-hierarchy V1"。

### P2-7 — V1 §11 风险 R6 "chevron 与 'Show X more' chevron 视觉重复 — chevron size = 10 vs 12"

视觉权重已分级，但 V2 应给具体数值依据：

> "Show X more chevron 12 px 是 secondary controls (`text-[12px] font-medium text-[#A1A1AA]`)；hierarchy chevron 10 px 是 disclosure 标记，比 secondary controls 更收敛——10/12 = 0.83 比例；与 macOS Finder list view secondary text 11 px / disclosure 9 px 的 0.82 比例一致"。

---

## 5. 赞赏点列表（V1 做得好的地方，列出来防止评审后修订时丢失）

1. **§2.21 Anti-pattern 24 条具体可执行**——每条都是"某个特定错误 + 原因"，比泛泛"保持极简"高一个数量级。这是 Apple 风格的精度。
2. **§7 V3 不变量核对清单 22 项**——逐条标注本任务保留方案，不破坏 V3。这是 cross-document cascade discipline 的最佳实践。
3. **§Document Authority Ranking 表格 + 冲突解决规则**——明确"_synthesis_decisions = Decisional 高于 R3/R4 = Referential"。这是 document-authority-ranking 的正确执行。
4. **§6.3 D4 锁定 12 px** + 文档解释"R3 推荐 8，_synthesis_decisions 锁定 12，按 Decisional > Referential 取 12"——透明的冲突解决。
5. **§2.6 子类 DragOverlay 不携带 26 px 缩进**（即使论据归属错——参 P0-5——但**结论正确**）：DragOverlay 严格跟手是 V3 §2.5 不变量延续，不允许 hidden hand。
6. **§5 CSS Token 列表只新增 1 个 token (`--indent-step: 16px`)**——克制示范。
7. **§9 Acceptance ≥ 18 项客观条件 + V3 行为零回归 12 项 + 用户主观兜底 3 项**分级清晰，主观词限定在 §35-37 三项。
8. **§1 设计哲学三句话与 V3 §1 同体例**——延续"macOS 原生气质 + 物理感由 V3 已有动效承担"的语言框架。
9. **§2.10 Snap 磁吸完全继承 V3 不变** + 论据中明确"hierarchy X 阈值是独立维度，不接入 snapModifier"——避免"hidden hand 抢控制权"的 V3 §2.5 警示。
10. **§2.7 drop indicator 缩进表达**只采用 α 而拒绝 β/γ/δ/ε——R3 §6.3 已论证选择，V1 落地一致。
11. **D5 父类不可成子的视觉反馈复用 V3 cancel opacity 0.95 → 0.5 + cursor `not-allowed`**——不引入新非法区视觉，与 V3 一致。
12. **§3 键盘左/右方向键的模态切换**——明确"仅在已 Space 进入键盘 drag mode 时生效，普通浏览模式下不抢"——与 dnd-kit KeyboardSensor 现有模态一致。
13. **§4 时序示意 4.3 "拖动父类到非法位置" 显式给出 dragOffset.x ∈ [-12, +12] 是合法 reorder**——边界情况显式列出（虽然 P0-4 仍指出状态机不全，但这一条至少不在表格遗忘）。
14. **§9 第 11 项明确 "onDragStart 自动展开是状态切换不是动画"**——区分清楚动画与状态切换是 macOS 设计精度。
15. **§2.18 reduced-motion 退化路径**显式追加 hierarchy selectors，不留 V3 已覆盖范围之外的盲区。
16. **§2.20 ContextMenu 兜底**（per D6 = C + E）—— 给"Promote to Root" / "Move to Parent..." 而不是新建快捷键，遵循"Ensemble 极简哲学下不增加新热键"。

**design-language.md V1 117 行**做得好的：
- L17 "Default is delete; addition requires justification" ——一句话钉住极简哲学。
- L19 Restraint 用一系列"refusal" 定义自己 ——这是 V3 §1 的精炼版。
- L21 Crafted "every spec has a reason"——把"考究"操作化为具体要求。
- L23-25 Physical / macOS-native 用具体数值（4px / `kRecognizesDragMovement` / `#0063E1`）锚定，无空话。
- L43 dnd-kit "hover grab 在 src/index.css:622-628 被 override" —— **有 file:line 引证**。
- L97 "Required reading for visual / motion work" 列表 —— 让规则可继承到所有未来 session。
- L107-111 Conflict resolution + L113-117 "Why this Rule exists" —— 文档自我维护规则 + 设计哲学的 why（不只 what）。

---

## 6. 跨 V3 不变量核对（22 项中可能被 V1 破坏的标记）

通读 V1 §7 + 实施层文件后逐项核对（仅列出可能问题项；其余 17 项 V1 都正确保留）：

| # | V3 不变量 | V1 状态 | 风险评级 |
|---|---|---|---|
| **#5** | 220 ms cascade（cubic-bezier(0.16, 1, 0.3, 1)，无 stagger） | V1 §2.9 沿用 | ✓ 安全 |
| **#13** | `data-no-dnd` + `CustomMouseSensor` 双保险 | V1 §V3 不变量 #13 描述 chevron 用 button + data-no-dnd——但**未明确 keyDown stopPropagation**（参 P0-2） | ⚠ **可能破坏**，详 P0-2 |
| **#15** | KeyboardSensor + sortableKeyboardCoordinates + screenReaderInstructions | V1 §3 + §V3 不变量 #15 说 "扩展 sortableKeyboardCoordinates 为 hierarchy-aware version (参 dnd-kit example tree)"——但若 chevron `<button>` 的键盘焦点行为未与 sortable row 协调（P0-2），可能 race | ⚠ **依赖 P0-2 修订** |
| **#17** | "Show X more" 折叠态在 onDragStart 自动展开 | V1 §2.15 + §V3 不变量 #17 描述沿用 | ✓ 安全 |
| **#18** | justDroppedRef / 50 ms guard 防 drop 同 row 误触 click navigate | V1 §V3 不变量 #18 写 "不变；chevron click 与 row click 已 hit-target 分离不冲突"——但 chevron click 是否豁免 50ms guard 未明确（P0-2 关联） | ⚠ **依赖 P0-2 修订** |
| **#20** | DragOverlay 不带原位 padding（V3 §2.2 隐含） | V1 §7 #20 把它当 V3 隐含——实际是 V1 二次推断 | **P0-5 标记** |

**结论**：V1 整体保留 V3 不变量做得很好，但 **#13 / #15 / #18 三项**与 chevron 引入相关的边界情况（P0-2）必须在 V2 修订；**#20 论据归属**（P0-5）必须改写。

---

## 7. 要求 V2 修订

**True**

理由：5 个 P0（drop indicator 几何描述错位 / chevron hit-target 与 dnd 占用悖论 / localStorage 语义反转未对齐 / dwell 边界状态机不全 / V3 不变量 #20 论据归属错误）任一足够阻塞实施——它们涉及实施层 SubAgent 直接落地的代码事实，错误成本会沿 04_implementation_plan 放大；P0-2 还可能让 V3 §P0-2 教训重新发生（"声称 lib 行为而未验证 → 实施期发现错"）。

**优先级**：P0-1 / P0-2 / P0-5 是高优先（涉及代码事实 + 第三方行为），P0-3 / P0-4 是中优先（涉及行为口径完整性）。

8 个 P1 + 7 个 P2 在 V2 修订时一并处理；其中 P1-1 / P1-8 也涉及 design-language.md V2 同步。

---

## 8. 改进 V1 进 V2 的 patch list

### 8.1 V1 → V2 修订工作（按 P0/P1 顺序）

1. **P0-1**：§2.7 表格全部用 `margin-left` 重写；§5 CSS Token 增加 `.drop-indicator-h` 必要的 transition 项；§9 Acceptance 第 6/7/8 项改写为 margin-left 验证。
2. **P0-2**：§2.4 增加 chevron `<button>` 完整 attributes 表（含 onKeyDown stopPropagation + tabIndex=0）；§6.4 显式说明 chevron keyboard 路径；§7 #18 (justDroppedRef) 增加"chevron click 豁免"说明；§2.21 Anti-pattern 增加"chevron 不能用 div 仿冒"。
3. **P0-3**：§2.15 表格按 `collapsedCategories` 语义重写每一行的精确动作；§2.15 增加"渲染合并函数"伪代码；§9 #13 改双向验证；§1 哲学第 2 条引证微调。
4. **P0-4**：§6.3 增加 dwell state machine；§2.14 增加 dragOffset.x 边界规则表；§11 风险增加 R7（dwell 边界抖动）；§2.12 显式声明 opacity 切换无 fade 过渡。
5. **P0-5**：§7 #20 改写为代码事实引用 (`DragOverlayCategoryRow.tsx:21`)；§2.6 论据去除"V3 §2.2 隐含"；§Revision History 添加 V1→V2 修复说明；全文搜索"V3 隐含 / V3 §2.X 隐含"全部改写。
6. **P1-1**：§5 直接定义 `--duration-disclosure-rotate: 120ms` token；同步 design-language.md V2 Constraints。
7. **P1-2**：§1 第 1 条精确措辞重写为"有子类的父类 / 子类 / 无子类的父类"三态分述。
8. **P1-3**：§2.2 chevron 颜色表追加"依据"列（macOS Finder secondary label color + 项目"Show X more" 一致性）。
9. **P1-4**：§2.6 论据修正为离散切换语义（不是实时投影）。
10. **P1-5**：design-language.md L55 "≤ 3 layers" 增加 sidebar 内 hierarchy 不计层的澄清。
11. **P1-6**：§5 增加 `--duration-hierarchy-dwell: 80ms` token；同步 design-language.md V2。
12. **P1-7**：§9 第 22 项扩展为 22a / 22b 两子项。
13. **P1-8**：design-language.md V2 增加 "Hierarchy is expressed by position, not by decoration" Principle。

### 8.2 V2 → 进 Plan 前的对齐 SubAgent 重跑（per cross-document-cascade-discipline.md）

V1 → V2 修订完成后**必须**派一个独立 alignment SubAgent，在 02_design_spec V2 + design-language.md V2 + 03_tech_plan（待写）+ _synthesis_decisions（不变）四份文件之间扫描：
- §6.3 dwell state machine 与 03_tech_plan 实现伪代码一致性
- localStorage key + 语义在 02 / 03 / 04 一致
- chevron `<button>` attributes 在 02 与 03 实现 spec 一致
- design-language.md L29 / L66 token 列表增量项有对应 03_tech_plan CSS 改动卡

### 8.3 reviewer A 对 V2 复审条件

V2 修订完成后请再次派 Reviewer A（本人）对**P0 修订处**做关闭核对（only on 5 P0），其余 P1/P2 不重审。Reviewer A 关闭 P0 后视为可进 Plan。

---

## 9. confidence 与 takeaway

**Confidence**：90 / 100

10 分扣减来源：
- 4 分：dnd-kit 6.3 KeyboardSensor 与 chevron `<button>` 焦点协作的具体行为（P0-2 关联）需要在 V2 修订后由实施期 dev mode 实测验证——文档级评审无法 100% 推断。
- 3 分：localStorage 跨 worktree 共享行为（P2-5 / V1 R5）属于 Tauri webview origin 实测领域，本评审仅基于推理。
- 2 分：dwell state machine 在边界抖动场景（P0-4）的真实用户体感需 dev mode 实测，文档级评审仅能锁定状态机逻辑。
- 1 分：design-language.md V1 117 行整体质量评估略偏主观（虽然每条都有具体指引，仍有"是否够 117 行 vs 是否该 200 行"的阅读偏好维度）。

**Takeaway**（一句话）：V1 是**接近 Apple/Linear/Things 级**的设计规格——结构、Anti-pattern 精度、V3 不变量保留、token 纪律都经得起 Apple Design Studio 的内审；但 5 个 P0（drop indicator 几何描述错位 / chevron hit-target 与 dnd 占用悖论 / localStorage 语义反转未对齐口径 / dwell 边界状态机缺失 / V3 不变量 #20 论据归属误用）是 stop-ship 级阻塞，V2 修订并独立 alignment SubAgent 重跑后接近 10/10 才能进 Plan。
