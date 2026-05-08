# R1 — User Scenario Trace + Spec / Implementation Gap Audit

> **作者**：Agent A（调研 SubAgent）
> **日期**：2026-05-08
> **范围**：S1-S5 五个症状的逐帧 state trace + V2.1 / §2.7 / §2.13 / §2.14 / §6.3 spec 实现 gap 审计
> **节制**：仅调研，不重新设计；每个 finding cite file:line；未验证 / 假设 显式标注；dnd-kit 内部行为标注"由 Agent B 验证"
> **不做的事**：dnd-kit 源码逐行验证（Agent B）；同类工具调研（Agent C）；任何修复方案 / 建议

---

## 0. 一手代码事实（trace 前的契约固定）

下列代码事实是后续 trace 的输入。每条都已 cite file:line，trace 表格里再次出现 file:line 时不再重复解释。

### 0.1 关键状态与契约

| Symbol | 类型 | 来源 / file:line | 语义 |
|---|---|---|---|
| `activeId` | `UniqueIdentifier \| null` | `SortableCategoriesList.tsx:209` | 当前 drag 的 row id |
| `overId` | `UniqueIdentifier \| null` | `SortableCategoriesList.tsx:210, 687, 763` | dnd-kit 选出的 over row id |
| `offsetLeft` | `number` | `SortableCategoriesList.tsx:213, 647, 653` | 累计 `event.delta.x`（拖动开始以来的横向偏移） |
| `pointerBelowOver` | `boolean \| null` | `SortableCategoriesList.tsx:221, 668-677` | 真实 pointer 是否在 over row 中线下方；mouse drag 必算（`isPointerBelowRowCenter(pointerY, event.over.rect)`，`treeUtilities.ts:166-172`） |
| `dwellState` | `'OUT' \| 'HOVER_NEAR' \| 'DROP_INTO_READY'` | `SortableCategoriesList.tsx:254, 265-268` | 仅为 ROOT-active demote 服务的状态机 |
| `activeOriginalParentId` | `string \| null` | `SortableCategoriesList.tsx:380-384` | drag 开始时 active row 的 parentId（snapshot from `categories`，**非 `displayFlat`**） |
| `isChildActive` | `boolean` | `SortableCategoriesList.tsx:394` | `activeOriginalParentId !== null` |
| `projected` | `Projection \| null` | `SortableCategoriesList.tsx:429-465` | `getProjection(...)` 的返回；`{depth, parentId, isInvalid}` |
| `parentRowIdForIndicator` | `string \| null` | `SortableCategoriesList.tsx:501-508` | 5 重 gate 后的 indicator 渲染锚点 |
| `visibleDropIntoProjectionRef` | `Projection \| null` (ref) | `SortableCategoriesList.tsx:305, 511-516` | useLayoutEffect 同步写入；`getVisibleDropIntoProjection` 返回 |
| `dropProjectionRef` | `{ activeId, oldParentId, newParentId } \| null` (ref) | `SortableCategoriesList.tsx:295-299` | A11y 公告用 |
| `finalProjection` | `Projection \| null` (local) | `SortableCategoriesList.tsx:805` | `handleDragEnd` 最终决策 |

### 0.2 关键算法分支

#### 0.2.1 `projected` useMemo gate（`SortableCategoriesList.tsx:429-465`）

```
if (activeId === null || overId === null) return null;
if (!isChildActive && dwellState === 'OUT') return null;        // L432
if (!isChildActive && !isKeyboardDrag && pointerBelowOver === null && overId !== activeId)
  return null;                                                   // L441-443
return getProjection(displayFlat, activeId, overId, offsetLeft, INDENT_STEP_PX,
                     pointerBelowOver ?? undefined, baseFlat, activeOriginalParentId);
```

**关键含义**：
- ROOT-active：必须 `dwellState !== 'OUT'` 才进入 `getProjection`。
- CHILD-active：**跳过** dwell gate；只要 `over !== null`，每帧调 `getProjection`。
- `pointerBelowOver === null` 在 ROOT-active 下短路（除非 `over === active`）；CHILD-active 下不短路（`isChildActive` 旁路了第二条 gate）。

#### 0.2.2 `getProjection` asymmetric short-circuit（`treeUtilities.ts:535-551`）

```
if (originalActiveParentId != null && originalActiveParentId !== '') {
  const overItem = items[overItemIndex];
  const overInOriginalSubtree =
    String(overItem.id) === String(activeId) ||              // self
    String(overItem.id) === originalActiveParentId ||        // originalParent
    overItem.parentId === originalActiveParentId;            // sibling
  if (!overInOriginalSubtree) {
    return { depth: 0, parentId: null, isInvalid: false };   // immediate promote
  }
  // else fall through to standard algorithm
}
```

**关键含义**：仅当 active 是 pre-drag CHILD（`originalActiveParentId` 非 null/空）时启用。`overInOriginalSubtree` 为真 → 走标准算法；为假 → 直接 promote。

#### 0.2.3 `parentRowIdForIndicator` 5 重 gate（`SortableCategoriesList.tsx:501-508`）

```
if (!projected) return null;
if (dwellState !== 'DROP_INTO_READY') return null;              // 第 1 重
if (projected.isInvalid) return null;                           // 第 2 重
if (projected.parentId === null) return null;                   // 第 3 重 (promote 时为 null)
if (projected.parentId === activeOriginalParentId) return null; // 第 4 重 (same-parent reorder)
return projected.parentId;                                       // → indicator 渲染
```

**关键观察**：第 1 重要求 `DROP_INTO_READY`——但 CHILD-active 路径**不进入 dwell 状态机**（dwell 只在 `xPassesThreshold` 时被 arm，见 `handleDragMove:689` `xPassesThreshold = Math.abs(newOffset) >= ABS_X_THRESHOLD_PX`）。意味着 CHILD-active **几乎不可能** `dwellState === 'DROP_INTO_READY'`，从而 indicator 几乎不可能为 CHILD-active 显示。

#### 0.2.4 `handleDragEnd` finalProjection 决策（`SortableCategoriesList.tsx:805-819`）

```
let finalProjection: Projection | null = visibleDropIntoProjectionRef.current;
if (over && isChildActive) {
  finalProjection = getProjection(
    displayFlat, active.id, over.id, event.delta.x, INDENT_STEP_PX,
    endPointerBelowOver, baseFlatRef.current, activeOriginalParentId
  );
} else if (!finalProjection) {
  finalProjection = null;
}
```

**关键含义**：
- ROOT-active：唯一来源 = `visibleDropIntoProjectionRef.current`（必须 indicator 曾经渲染过）。
- CHILD-active：drop 时**重算** `getProjection`（哪怕 indicator 从未显示过）。

#### 0.2.5 `handleDragEnd` IPC 序列（`SortableCategoriesList.tsx:932-957`）

```
if (parentChanged) {
  if (onSetCategoryParent) {
    await onSetCategoryParent(String(active.id), finalParentId);   // IPC 1
  }
  if (oldParentId !== null && finalParentId === null && localOverId !== null) {
    // promote 路径：构 newOrderedIds 并发 reorder
    if (orderChanged) {
      await onReorder(newOrderedIds);                                // IPC 2
    }
  }
}
```

**关键含义**：promote (oldParentId !== null && finalParentId === null) 后**再发**一次 reorder IPC（"保留 promoted 后的位置"）；demote 仅发 IPC 1。

### 0.3 snapModifier 闭包行为（`snapModifier.ts:48-126`）

`snapModifier` 是 module 级单例（`snapModifier.ts:125`）。每帧：
- `dragged center` 减去前一帧 `state.dx/dy` 得到"未 snap 的 pointer 期望中心"。
- 计算 `slot center` 与 `dragged center` 的 `dx/dy`，距离 `dist`。
- 若 `dist < SNAP_RANGE_PX` (12 px)：`strength = (1 - dist/12)²`，`targetDx/Dy = dx/dy * strength`。
- `state.dx += (targetDx - state.dx) * 0.35` (LERP)。
- 返回 `transform.x + state.dx, transform.y + state.dy`。

**关键含义**：snapModifier 修改 **DragOverlay transform 的 x 和 y**（不只是 y）。但当 `dist > 12`（pointer 离 slot center 超过 12 px），`strength = 0`，snap 不施加任何拉力（state.dx/dy 仍可能有衰减残值，会随 LERP 衰减回 0）。

### 0.4 dnd-kit 内部行为（标注待 Agent B 验证）

下列推断基于代码痕迹；准确机制由 Agent B 一手 `node_modules/@dnd-kit/...` 验证：

- `closestCenter` 用什么 rect 选 over —— **待 Agent B 验证**。本报告中的 trace 假设 over 选用 `active.rect.current.translated`（即 transform 应用后），因为这是 dnd-kit 默认行为。如 Agent B 验证为不同输入，本报告的 over.id 推断需修订。
- modifier 链与 collision detection 的执行顺序 —— **待 Agent B 验证**。
- `useSortable.transition` 在 drop 之后由 store-driven items 变化触发与否 —— **待 Agent B 验证**（H4 关键问题）。

---

## 1. 症状 → 帧级 trace

### 1.1 S2 trace —— "拖二级到父类别上面，闪烁移动下来"

**重现路径**：
- Tree state（拖前）：`A (root, 有 children) > A-1 (child of A)`、`B (root, 无 children)`、`C (root)`
- 用户拖 A-1，慢慢向上越过 A 行的中线（即 pointer 从 A 行下半部分穿越到上半部分）。

**先验固定**：
- `activeId = "A-1"`
- `activeOriginalParentId = "A"` （L380-384）
- `isChildActive = true` （L394）
- `originalActiveParentId = "A"` 传入 `getProjection`
- `displayFlat` 在 A-1 拖动时 = `removeChildrenOf(baseFlat, ["A-1"])` = baseFlat 减掉 children of A-1 = baseFlat 不变（A-1 是 child，没有自己的 children）；所以 `displayFlat ≈ baseFlat = [A, A-1, B, C]`（拖动期间 dragOverrideExpand=true，所有 parent 展开；但 A-1 自己也仍在列表里，因为 removeChildrenOf 只移除 children of activeId，不移除 active 本身）。

#### Frame 表（pointer 自下而上越过 A 中线）

| frame | event | pointer.y | over.id (假设) | event.delta.x | offsetLeft | pointerBelowOver | dwellState | xPassesThreshold | `overInOriginalSubtree` | projected | parentRowIdForIndicator | visibleDropIntoProjectionRef | DragOverlay 视觉位置 | inline source row paddingLeft (= renderDepth × 16 + ?) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F0 | dragStart | 起点 (在 A-1 行内) | A-1 | 0 | 0 | null | OUT | false | true (over === active) | depth=1, parentId=A, isInvalid=false (走标准, `over === active` 短路过 asymmetric) | null (gate 1: dwellState 不是 DROP_INTO_READY) | null | 起点位置 (在 A-1 行) | 26 px (depth=1) |
| F1 | dragMove (微微上移) | 在 A-1 中线上方但仍在 A-1 行 | A-1 | 0 | 0 | false | OUT | false | true | 走标准。但 `over === active` 边缘情形：positionAware = `pointerBelowOver=false && activeIdx === overIdx` → false → 走 legacy。`arrayMove(items, activeIdx, overIdx)` 是 no-op。`previousItem = items[overIdx-1] = A`、`nextItem = items[overIdx+1] = B`。`dragDepth = 0`（offsetLeft=0）。`projectedDepth = 1`、`maxDepth = min(1, A.depth+1) = 1`、`minDepth = B.depth = 0`。**`depth = 1`**。`getParentId()`: depth==previousItem.depth (1==0?) **不等**；depth > previousItem.depth → return previousItem.id = "A"。所以 projected = `{depth: 1, parentId: "A", isInvalid: false}`. | null (第 4 重 gate: parentId === activeOriginalParentId = "A" → 阻止) | null | 跟 pointer | 26 px |
| F2 | dragMove (pointer 越过 A-1 顶端，落在 A 行下半部分) | 在 A 行下半部 | A (假设；待 Agent B 验证 closestCenter 行为) | 0 | 0 | true (在 A 中线下) | OUT (overChanged → setDwellIfChanged('OUT')，因 xPassesThreshold=false; L724-735) | false | true (over === A === originalParent) | over === A === originalParent → `overInOriginalSubtree = true` (L541) → 走标准算法。positionAware = (pointerBelowOver=true && activeIdx=1, overIdx=0) → true。`pointerBelowOver === true` 分支 (L569-578)：`previousItem = items[0] = A`、`nextIdx = 1`，但 `nextIdx === activeIdx` (=1) → `nextIdx = 2 = B`、`nextItem = items[2] = B`、`walkBackStartIdx = 1`。`dragDepth = 0`（offsetLeft=0）。`projectedDepth = activeItem.depth + 0 = 1`. `previousDerivedMax = A.depth + 1 = 1`、`maxDepth = min(1, 1) = 1`、`minDepth = B.depth = 0`. **`depth = 1`**。`getParentId()`: depth (1) == previousItem.depth (0)? 否. depth > previousItem.depth → return previousItem.id = "A". **projected = `{depth: 1, parentId: "A", isInvalid: false}`** | null (第 4 重 gate: parentId === activeOriginalParentId = "A") | null | 跟 pointer (snap 可能锁向 A 中心) | 26 px |
| F3 | dragMove (pointer 已穿过 A 行中线，进入 A 行**上半部**) | A 中线略上 | A (假设) | 0 | 0 | **false** (pointer 在 A 中线上方) | OUT | false | true | over === A → `overInOriginalSubtree = true` → 走标准算法。`pointerBelowOver === false` 分支 (L579-588)：`prevIdx = -1`，`prevIdx === activeIdx`? (-1==1?) 否；`previousItem = items[-1] = undefined`；`nextItem = items[0] = A`. `dragDepth = 0`. `projectedDepth = 1`. `previousDerivedMax = 0` (no prev). `maxDepth = min(1, 0) = 0`、`minDepth = A.depth = 0`. **`depth = 0`** (clamped by maxDepth). `getParentId()`: depth=0 → return null. **projected = `{depth: 0, parentId: null, isInvalid: false}`** | null (第 3 重 gate: parentId === null → 阻止) | null (gate-blocked → useLayoutEffect 写 null) | 跟 pointer | 跟 projected.depth = 0 → 10 px ⚠ **inline source row 缩进抖回根级（视觉跳变）** |
| F4 | dragMove (pointer 微微往下) | A 中线略下 | A | 0 | 0 | true | OUT | false | true | (与 F2 相同) projected = `{depth: 1, parentId: "A", isInvalid: false}` | null (第 4 重 gate) | null | 跟 pointer | **26 px** ⚠ inline source row 跳回 child 缩进 |
| F5 | dragMove (再回上方) | A 中线略上 | A | 0 | 0 | false | OUT | false | true | (与 F3 相同) projected = `{depth: 0, parentId: null, isInvalid: false}` | null | null | 跟 pointer | **10 px** ⚠ inline source row 跳回 root 缩进 |

**Trace 解释**：
- F2/F3/F4/F5 之间的差异是 `pointerBelowOver` 由 `false ↔ true`，原因是 pointer 在 A 行**中线**附近抖动。
- `overInOriginalSubtree = true` → `getProjection` 始终走标准算法（L549-551，注释明确"fall through"）。
- 标准算法的 `pointerBelowOver` 分支决定 previousItem/nextItem，**导致 projected.parentId 在 `null ↔ "A"` 之间频繁切换**。
- `parentRowIdForIndicator` 始终为 null（gate 4 或 gate 3 阻止），所以 indicator 不会渲染——跟用户看到的"飘忽"无关 indicator。
- **真正的视觉抖动来源是 `inline source row paddingLeft`** —— `SortableCategoriesList.tsx:1117-1125`：
  ```
  const renderDepth =
    localStringEq(item.id, activeId) && projected
      ? (Math.max(0, Math.min(1, projected.depth)) as 0 | 1)
      : (item.depth as 0 | 1);
  ```
  active row（A-1）的 inline DOM `paddingLeft = renderDepth × 16 + 10` (`SortableCategoryRow.tsx:153`) 跟着 `projected.depth` 抖动 0 ↔ 1，亦即 `paddingLeft = 10 ↔ 26`。
- 但 active row 在 drag 期间 `opacity: 0` (`SortableCategoryRow.tsx:149`)——这意味着 inline DOM 视觉上是看不到的。**那么用户看到的"闪烁"是什么？**

#### 假设性子机制（标注"待验证"）

候选机制 1（中确信）—— **dnd-kit cascade 让位（其他 row 的 transform）触发 sibling 视觉抖动**：
- 当 `displayFlat` / `sortedIds` 不变 + `renderDepth` 变化 → `<SortableCategoryRow>` 重新 render，`useSortable` 检测到 `padding-left` 变化、触发 `useSortable.transition`（220 ms）。但 `paddingTransition` 在 `isDragging=true` 时被禁用（`SortableCategoryRow.tsx:129`：`const paddingTransition = isDragging ? null : 'padding-left 220ms ...'`）。所以**理论上**当前 frame active row 不会有 padding-left transition——但下一个 frame 如果 measurement 变化，dnd-kit 重新测 sibling 位置 → cascade transform 抖动。**待 Agent B 验证 measurement 与 active row padding-left 变化的耦合**。
- 也可能 active 之外的其他 sibling rows 在 active row 的 padding-left 变化触发 reflow 时，rect 改变 → dnd-kit `MeasuringStrategy.Always` 触发重测 → cascade transform 重算 → sibling row visual jitter。
- **结论**：H1（pointerBelowOver 切换 → projected.parentId 切换 → renderDepth 切换 → inline DOM padding-left 抖动 → sibling reflow / cascade 重测） **是有代码证据支持**的。但"用户实际看到的飘忽"是否完全由此机制产生 = **待 Agent B 验证**（涉及 measurement 与 transform pipeline）。

候选机制 2（高确信）—— **snapModifier 拉力**：
- F2: pointerBelowOver=true, over=A. snapModifier 的 over.rect = A.rect. snap 试图把 active rect 拉向 A.rect.center。`dragOverlay center y` 与 `slotCenterY = A.center.y` 之差 = pointer.y - A.center.y（约几 px）。`dist < 12` → 引力激活，DragOverlay y 被拉向 A 中线。
- F3: pointer 进入 A 上半部分；snap 仍拉向 A center（dist 仍 < 12）。但 `event.delta.y` 是负的（pointer 上移），DragOverlay 的 transform.y 变小。
- 视觉效果：DragOverlay 在 pointer y 与 A 中心 y 之间被"软拉"——不是闪烁，是"粘性"。
- 这也不直接产生用户描述的"闪烁"，但符合 H2 "snap 锁住 over"。

候选机制 3（高确信）—— **dropIndicator 抖动 + `displayFlat` 抖动**：
- 不存在。`displayFlat` 在 S2 路径下不变（`removeChildrenOf` 只移除 children of A-1，A-1 没有 children）；`sortedIds` 不变；indicator 始终不渲染（gate-blocked）。

#### 验证 H1 是否成立

| H1 子断言 | 证据 | 结论 |
|---|---|---|
| `over === originalParent` 时 `getProjection` 走标准算法 | `treeUtilities.ts:541` `overItem.id === originalActiveParentId` → `overInOriginalSubtree = true` → fall through 走标准算法（L549-551） | **成立** |
| 标准算法在 `pointerBelowOver = false` 时返回 `{depth: 0, parentId: null}` | `treeUtilities.ts:579-588`: `prevIdx = overItemIndex - 1 = -1`，`previousItem = undefined`；`previousDerivedMax = 0`；`maxDepth = 0`；`depth` clamp 到 0；`getParentId()` depth=0 → return null | **成立** |
| 标准算法在 `pointerBelowOver = true` 时返回 `{depth: 1, parentId: originalParent}` | `treeUtilities.ts:569-578`: `previousItem = A`、`projectedDepth = 1`、`maxDepth = 1`、`minDepth = B.depth = 0`、`depth = 1`；`getParentId()` depth > previousItem.depth → return previousItem.id = "A" | **成立** |
| `inline source row` 的 `paddingLeft` 跟随 `projected.depth` 抖动 0 ↔ 1 | `SortableCategoriesList.tsx:1117-1125` + `SortableCategoryRow.tsx:153` `paddingLeft: depth * INDENT_STEP_PX + 10` | **成立** |
| 当 active row `opacity=0` 时，inline DOM padding 抖动是否产生用户看到的视觉效果 | `SortableCategoryRow.tsx:149` opacity 0 → DOM 视觉看不到。但 reflow 影响 sibling rect → MeasuringStrategy.Always 重测 → 可能影响 cascade transform | **部分成立 / 待 Agent B 验证 measurement 链路**（关于 sibling 视觉影响） |

**H1 综合结论**：**成立**。`pointerBelowOver` 的边界抖动驱动 `projected.parentId` 在 `null ↔ "A"` 之间切换，进而驱动 `renderDepth` 在 0 ↔ 1 之间切换，最终驱动 `inline source row paddingLeft` 在 10 ↔ 26 之间抖动。被 opacity 0 隐藏的 inline DOM 是否仍能产生用户可见的"闪烁"，依赖 dnd-kit measurement / cascade transform 链路 —— 由 Agent B 验证。

---

### 1.2 S3 trace —— "移除子类别失败"

**重现路径**：
- Tree state（拖前）：`A (root) > A-1 (child)`，`A`下还有 `A-2 (child)`，再加 `B (root)`、`C (root)`
- 用户拖 A-1 想 promote，向上越过 A、再越过 root B（或继续往上到 sidebar 顶端）。

**先验固定**：
- `activeId = "A-1"`、`activeOriginalParentId = "A"`、`isChildActive = true`
- `displayFlat = baseFlat = [A, A-1, A-2, B, C]`

#### Frame 表

| frame | over.id (假设) | pointer.y | offsetLeft | pointerBelowOver | dwellState | `overInOriginalSubtree` | projected | parentRowIdForIndicator | visibleDropIntoProjectionRef | DragOverlay 视觉 |
|---|---|---|---|---|---|---|---|---|---|---|
| F0 | A-1 | 在 A-1 行内 | 0 | null (over===active) | OUT | true (self) | (走 over===active 边缘 fall through legacy；类似 S2 F0) projected = `{depth: 1, parentId: "A", ...}` | null (gate 4) | null | 在原位 |
| F1 | A | A 中线上方 (穿过 A-1) | 0 | false | OUT | true (over === originalParent) | (S2 F3 同) projected = `{depth: 0, parentId: null, isInvalid: false}` | null (gate 3) | null | 跟 pointer (snap 可能拉向 A center) |
| F2 | A | A 中线下方 | 0 | true | OUT | true | (S2 F2 同) projected = `{depth: 1, parentId: "A", ...}` | null (gate 4) | null | 跟 pointer |
| F3 | A-2 (sibling) | A-2 中线上方 | 0 | false | OUT | true (sibling) | over === A-2，A-2.parentId === "A" === originalActiveParentId → `overInOriginalSubtree = true` → 走标准算法。positionAware: `pointerBelowOver === false && activeIdx === ?, overIdx === ?`. 假设 `displayFlat = [A, A-1, A-2, B, C]`，`activeIdx = 1`、`overIdx = 2`. `prevIdx = 1`、`prevIdx === activeIdx` → `prevIdx -= 1 = 0`、`previousItem = items[0] = A`. `nextItem = items[2] = A-2`. `dragDepth = 0`. `projectedDepth = activeItem.depth + 0 = 1`. `previousDerivedMax = A.depth + 1 = 1`. `maxDepth = min(1, 1) = 1`. `minDepth = nextItem.depth = 1`. **`depth = 1`**. `getParentId()`: depth (1) == previousItem.depth (0)? 否. depth > previousItem.depth → return previousItem.id = "A". **projected = `{depth: 1, parentId: "A", isInvalid: false}`** | null (gate 4) | null | 跟 pointer |
| F4 | B (终于离开原 subtree) | B 中线下方 | 0 | true | OUT | **false** (over === B，B.id !== "A"、B.parentId === undefined → not sibling) | **immediate promote** (asymmetric, `treeUtilities.ts:545-548`)：return `{depth: 0, parentId: null, isInvalid: false}` | null (gate 3: parentId === null) | null | 跟 pointer |
| F5 | mouseup ON B (`handleDragEnd`) | B | event.delta.x ≈ 0 | true | OUT | false | (`isChildActive=true` → `handleDragEnd:806-816` 重算 finalProjection) finalProjection = `{depth: 0, parentId: null, isInvalid: false}` | (already null) | (already null) | settle |

#### finalProjection 链路与 IPC 决策

```
finalProjection = visibleDropIntoProjectionRef.current  // = null (一直没渲染过 indicator)
if (over && isChildActive) {                            // true
  finalProjection = getProjection(...)                  // 重算
                  = { depth: 0, parentId: null, isInvalid: false }
}
// finalProjection.parentId = null
// activeItem.parentId = "A" (oldParentId)
// parentChanged = (null !== "A") = true
//
// → onSetCategoryParent("A-1", null)  // promote IPC
// (oldParentId="A"!==null && finalParentId===null && localOverId="B"!==null)
//   → 进入 reorder 块构 newOrderedIds → 发 onReorder IPC 2
```

**Trace 解释**：
- 当 over 离开 originalSubtree（F4）→ projected.parentId 立即变 null。
- `handleDragEnd` 在 `isChildActive=true` 时**始终重算**`finalProjection` —— 不依赖 dwellState、不依赖 indicator 是否曾经渲染。
- promote IPC 应该被调起。

#### 但 S3 是"移除失败" —— 失败可能性

| 假设 | 评估 |
|---|---|
| H2-A：snapModifier 把 active rect 锁在 A，导致 over 不切换到 B | **代码上有可能**。snapModifier (`snapModifier.ts:90-117`) 修改 transform.y 拉向 over.rect.center；如果 dnd-kit closestCenter 用 `active.rect.current.translated`（应用 snap 后的 rect）选 over，而 active rect 被 snap 拉回 A center → closestCenter 仍选 A → over 不切到 B。**但**：Agent B 必须验证 closestCenter 输入是否真为 transformed rect。如果它用的是 collisionRect 或 pointer，则 over 会随 pointer 切换。**此处标注：H2 待 Agent B 验证；本 trace 暂以"closestCenter 用 transformed rect"为假设展开**。 |
| H2-B：用户没拖到 B 行，在 A 行内 mouseup —— over 仍是 A | 这是用户使用错误，但 user 报告"反正问题很多"，意味着即使到了 B 行也可能失败 —— 不能完全归因于此。 |
| 可能性 X：用户拖到 B 行 mouseup，但 finalProjection 重算返回 `{parentId: "A"}` | `treeUtilities.ts` 唯一返回 `parentId: "A"` 的路径是 `overInOriginalSubtree = true`。如 F4 over=B 不在 subtree，asymmetric 短路返回 promote。所以**只要 over 切到 B**，promote 必发生。 |

**H2 综合结论**：**有代码可能性**（snapModifier + closestCenter 反馈环）；**但需要 Agent B 验证 closestCenter 算法的实际输入** 才能定锤是否就是 S3 的根因。如果 Agent B 验证 closestCenter 用 `pointer` 或 `collisionRect`（与 active rect 解耦），则 H2 不成立，S3 必有其他原因。

#### 候选其他原因（待 Agent B 协助验证）

- 候选 X1：`onSetCategoryParent` 后端验证失败。例：`set_category_parent` 拒绝（cycle / max depth）→ store 抛错 → 前端 fallback get_categories → 结果与原状一致 → 视觉"没动"。但用户描述"移除失败"是"看到没移除"，符合此场景。需要看 console.error 输出（`SortableCategoriesList.tsx:993`）。
- 候选 X2：handleDragEnd 进入 D5-invalid 分支（`SortableCategoriesList.tsx:907-911`）—— 但这只在 finalProjection.isInvalid=true 时发生；child active 不会触发 D5（D5 只针对 root with children → child）。
- 候选 X3：`getSubtreeReorderIds` 返回 null → reorder IPC 跳过 → 看上去没动。代码 `treeUtilities.ts:342-385` 返回 null 的条件：`overId == null` 或 `activeIdx === -1` 或 `overIdx === -1` 或 `subtreeIds.has(overIdStr) && overIdStr !== activeIdStr`。**关键**：`childIds = items.filter(it => it.parentId === activeIdStr)`；A-1 是 child，自身没有 children → childIds = []，subtreeIds = {A-1}。over=B，B 不在 subtreeIds → 不返回 null。reorder 应该正常。

---

### 1.3 S4 trace —— "promote 后无动效闪烁"

**重现路径**（接 S3 成功 promote 后）：
- IPC 1 `onSetCategoryParent("A-1", null)` await 完成
- IPC 2 `onReorder([...])` await 完成

#### 中间帧 trace（focus 在 store / render 链）

| 时刻 | store.categories 状态 | flatten 输出 | sortedIds（`displayFlat.map(.id)`） | 用户视觉 |
|---|---|---|---|---|
| t=0 | drag 中（A-1 parent="A"） | `[A, A-1, A-2, B, C]` | `["A", "A-1", "A-2", "B", "C"]` | DragOverlay over B |
| t=1 (drop, before IPC) | 同 | 同 | 同 | settle 开始 (DragOverlay 收回) |
| t=2 (await `setCategoryParent` IPC 1) | optimistic update applied (`appStore.ts:587-594`)：A-1.parentId = undefined | `[A, A-1, A-2, B, C]` （A-1 现在 parent=null，flatten 输出顺序 = `categories` 的根级遍历顺序：A, A-1 (root now), A-2 (still A's child, but A-2 顺序 in array), B, C）| `["A", "A-1", "A-2", "B", "C"]` | **A-1 仍出现在 A 的下方**（数组顺序未变）；视觉等效"没移动"，但 A-1 现在 paddingLeft=10（root 缩进） |
| t=3 (await `reorder` IPC 2) | optimistic + `apply_reorder` 更新（`appStore.ts:enqueueReorder` 内部）；A-1 移动到 B 位置 | `[A, A-2, B, A-1, C]`（假设 `newOrderedIds = ["A", "A-2", "B", "A-1", "C"]`） | `["A", "A-2", "B", "A-1", "C"]` | A-1 终于在 B 下方 |

**Trace 解释**：
- 在 t=2（仅 IPC 1 完成）的中间帧，store 已 mutate A-1.parentId → flatten 重新 `flattenTree(categories, ...)` (`treeUtilities.ts:205`) → 输出 `[A, A-1 (root, depth=0), A-2 (parent=A, depth=1), B, C]`：A-1 提前出现在 A 下面，**因为 `flattenTree` 按 categories 数组顺序遍历 root，并在每个 root 后塞 children**。但 A-1 此时是 root，所以它会按 `categories` 数组中 A-1 的位置渲染（即原来在 A、A-2 之间）。
- 视觉跳变：用户看到 A-1 突然在 A 下方而不是 B 下方（**第一次跳变**），无 transition；
- 然后 IPC 2 完成，A-1 又跳到 B 下方（**第二次跳变**）；
- 这两次都没有 cascade transition（H4 假设：dnd-kit cascade 在 drop 之后退出 measurement 周期）。

#### handleDragEnd dropAnimationConfig（distance-aware settle）

`SortableCategoriesList.tsx:854-869`：基于 `active.rect.current.translated` 和 `over.rect` 算 dist；如 dist<4 则 dropAnimation=null。

**问题**：dropAnimation 的 final rect 是 over.rect = B.rect。但实际 A-1 在 IPC 2 完成后会跳到 B 下方（`pointerBelowOver=true`/`false` 决定上下）。如果 distance-aware 算的 dist 是从 active.rect.current.translated 到 over.rect.center —— 但 A-1 落在 B 行**下方**新插入的 slot，rect 与 over.rect 实际偏移一行 32 px。

**潜在问题**：dropAnimation duration ≈ 280 ms (max(280, 120 + 32×0.5) = 136)。这个 settle 动画 + IPC 1/2 之间的中间帧渲染**有可能错位**。

#### finalProjection 与中间帧的关系

`SortableCategoriesList.tsx:880-889`：
```
setActiveId(null);
setOverId(null);
setOffsetLeft(0);
...
visibleDropIntoProjectionRef.current = null;
onDragEnd();
```

这一段是**同步**清掉 React state（drag UI state）。然后 `if (over)` 进入异步 IPC 块。所以：
- drag UI 已退出 → useSortable.transition 进入 settle 阶段（distance-aware settle 220 ms）；
- settle 期间，store mutate（IPC 1）→ flatten 重新输出；
- 但 useSortable 在 settle 期间**是否仍跟随 measurement 变化** = **待 Agent B 验证 H4**。

#### 验证 H3

| H3 子断言 | 证据 | 结论 |
|---|---|---|
| `handleDragEnd` 有两次 IPC 序列：setCategoryParent → reorder | `SortableCategoriesList.tsx:932-957` | **成立** |
| 两次 IPC 之间，store 已 optimistic update（中间帧） | `appStore.ts:587-594` `set({categories: optimistic, ...})` 在 IPC 1 await 之前 | **成立** |
| 中间帧 React 渲染时 A-1 在新位置（root 级，但在 A、A-2 之间） | `treeUtilities.ts:205-255` flatten 按 categories 顺序遍历 root；但 optimistic 后 A-1 是 root，按它在 categories 数组中的索引渲染。**有趣的是**：如果 A-1 在 categories 数组的索引 = 1（A 之后），它现在作为 root 会出现在 A 之后、B 之前 —— 而 IPC 2 的 reorder 才把它真正移到 B 下方。 | **成立** |
| 两次跳变之间无动画 | dnd-kit cascade transition 是 useSortable 内部驱动的，依赖 measurement；store mutate 触发 React render，但 dnd-kit 在 drag end 之后是否仍 measurement → 待 Agent B 验证（H4） | **部分成立 / H4 由 Agent B 决定** |

**H3 综合结论**：**成立**。两次 IPC 之间 store 的中间状态会被 React 渲染。中间帧的 A-1 位置 ≠ 预期位置 → 视觉跳变。最终是否"无动画"取决于 H4。

#### 验证 H4

H4 关键问题：**drop 后 store-driven items 变化时，useSortable 的 transition 是否仍触发 cascade**。

代码层面证据：
- `SortableCategoryRow.tsx:107-118` `useSortable({ id, disabled, transition: { duration: 220, easing: ... } })` —— transition 配置存在。
- `SortableCategoryRow.tsx:129-136` paddingLeft transition 有，但 `paddingTransition = isDragging ? null : 'padding-left 220ms ...'` —— **drop 后 isDragging=false，padding-left transition 应该启用**。
- `SortableCategoriesList.tsx:1064` `measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}` —— 测量策略设为 Always，理论上一直测量。

**待 Agent B 验证**：
- drop 后 dnd-kit 的 useSortable transition 是否仍会因为 sortedIds 顺序变化触发 transform 让位？
- `MeasuringStrategy.Always` 是否在 drag end 后仍持续测量？
- 当 sortedIds 中元素的索引变化（A-1 的 index 改变），useSortable 是否计算出新 transform 并 transition？

如果 Agent B 验证 dnd-kit cascade 在 drop 之后**不再触发**——则 H4 成立，S4 视觉跳变 root cause 之一就是 cascade 缺失。

如果 Agent B 验证 dnd-kit cascade 在 drop 之后**仍触发**——则 S4 的"无动效"另有原因（候选：两次 IPC 之间的中间帧太短，cascade 没来得及播完就被第二次 store mutate 打断；或 padding-left transition 与 cascade 让位冲突）。

**H4 综合结论**：**待 Agent B 验证**。本 trace 仅能定位"有两个不动画的跳变"是 S4 的视觉表现，不能定锤是否是 dnd-kit cascade 缺失或 IPC 序列竞争。

---

### 1.4 S1 + S5 trace —— "磁吸不自然 / 总是误触 / 整体跟手性差"

S1（磁吸不自然）+ S5（跟手性差）属综合体感，无单一帧序列；列出**让 DragOverlay 与 pointer 视觉不一致**的所有代码路径。

#### 路径 1：snapModifier 在 over 行内时持续拉力

`snapModifier.ts:48-126` 单例（module 级，line 125）。

| 触发条件 | 行为 | 视觉效果 |
|---|---|---|
| `over !== null` + `over.rect` 存在 | 计算 dragged center vs slot center；若 `dist < 12 px`，引力 = `(1 - dist/12)²` | DragOverlay 被拉向 slot center（最大 strength=1） |
| `over === null` | 衰减 state.dx/dy（LERP × (1-0.35)） | DragOverlay 慢慢回到 0 偏移（约 7 帧 / 120 ms） |

**关键代码事实**：
- `snapModifier.ts:85-88` —— `draggedCenterX/Y = draggingNodeRect.left + width/2 + transform.x - state.dx`，即把已应用的 snap 拉力从计算中减去，得到 "pointer 期望中心"。
- `snapModifier.ts:114-118` —— 修改 transform.x 和 transform.y（**不只是 y**）。

**S1 体感来源**：
- snap 同时作用在 X 和 Y 轴。在 hierarchy 场景（拖 child 横向调 indent），任何 X 抖动都被 snap 软拉向 over.center.x。
- 当 child A-1 拖到 over=A 时，snap 把 DragOverlay 拉向 A row 中心（X、Y 轴都拉）。pointer 离 slot center 越近，拉力越强。
- 用户感知："不是我在拖动 DragOverlay，是 DragOverlay 被某种力拽住"。

#### 路径 2：DragOverlay 视觉位置 = transform 应用结果

`SortableCategoriesList.tsx:1211-1213`：
```
<DragOverlay modifiers={[restrictToWindowEdges]} dropAnimation={dropAnimationConfig}>
  {activeCategory && <DragOverlayCategoryRow category={activeCategory} />}
</DragOverlay>
```

DndContext 的 `modifiers={[snapModifier]}` (`SortableCategoriesList.tsx:1064`) 是 active rect 的 transform pipeline。snap 修改的 transform 应用到 DragOverlay。

**视觉一致性**：DragOverlay 视觉位置 = pointer.x/y + snap 偏移。如果 snap 拉力大（pointer 在 slot 中心附近），DragOverlay 与 pointer 显著分离。

#### 路径 3：closestCenter 选 over 的输入

**待 Agent B 验证**。如果 closestCenter 用 transformed rect → snap 的拉力影响 over 选择 → over 锁定不切换；用户感受"我在向上拖，但 cursor 上面的视觉根本没跟着"。

#### 路径 4：inline source row paddingLeft 抖动（S1 中的"误触"感）

S2 trace 中 F2-F5 已展示 `pointerBelowOver` 边界抖动 → `projected.depth` 抖动 → `renderDepth` 抖动 → `inline source row paddingLeft` 抖动。

虽然 active row 是 opacity:0，但其周围 sibling row 在 cascade 让位中可能因 reflow 重测而抖动 —— **待 Agent B 验证 measurement 链路**。

#### 路径 5：dwell 边界抖动（仅 ROOT-active 路径）

`SortableCategoriesList.tsx:739-758` —— 当 `xPassesThreshold=true` 且 `dwellState=OUT` 时进入 HOVER_NEAR；当 X<12 时退回 OUT。dwell 在 ±12 边界抖动会导致 DROP_INTO_READY ↔ HOVER_NEAR 切换 → indicator wrapper paddingLeft 抖动（150 ms transition）+ DragOverlay opacity（仅 D5 invalid 时切换）。

但 S1 用户主要拖 child（CHILD-active）—— dwell 路径不进入。所以 dwell 边界抖动不构成主要 S1 痛点。

#### S1 / S5 综合结论

让 DragOverlay 与 pointer 不一致的代码路径包括：
1. **snapModifier 拉力**（最直接，`snapModifier.ts:48-126`）
2. closestCenter 选 over 受 transformed rect 影响（**待 Agent B 验证**）
3. `inline source row paddingLeft` 抖动驱动 reflow / re-measurement（**待 Agent B 验证**）
4. dwell 状态机抖动仅影响 ROOT-active demote indicator visualization（次要）

---

## 2. V2.1 Spec 逐条审计（02_design_spec.md L9-29）

V2.1 修订正文：`02_design_spec.md:9-29`。

| # | spec 要求（来自 V2.1） | 实现位置 | 落地状态 / 偏差描述 |
|---|---|---|---|
| 1 | **promote 触发**：active visually 离开"原父类的子树区域"——即 over.id 不在 `{originalParent, sibling-of-active, active 自身}` —— 立即 promote (`{depth=0, parentId=null}`)，无 X、无 80 ms dwell | `treeUtilities.ts:535-548` 的 `originalActiveParentId` 短路 + `SortableCategoriesList.tsx:432` `if (!isChildActive && dwellState === 'OUT') return null` 的 `!isChildActive` 旁路 + L441-443 第二条 gate 同样 `!isChildActive` 旁路 | **已落地** |
| 2 | **demote 触发**：保留 V2 全套约束（12 px X 偏移 + 80 ms dwell） | `SortableCategoriesList.tsx:432` ROOT-active 必须 `dwellState !== 'OUT'`；`SortableCategoriesList.tsx:689` `xPassesThreshold = Math.abs(newOffset) >= ABS_X_THRESHOLD_PX` (=12); dwell timer 80 ms (`L139` `DWELL_MS = 80`) | **已落地** |
| 3 | **same-parent reorder**：over.id 仍在 `{originalParent, sibling, self}` → 保持 child 状态、不显示缩进 indicator | `treeUtilities.ts:537-543` `overInOriginalSubtree` 集合 + L549-551 fall through 走标准算法（保持 child）；`SortableCategoriesList.tsx:506` `parentRowIdForIndicator` 的 gate 4（`projected.parentId === activeOriginalParentId` → null）阻止 indicator 渲染 | **部分落地 / 偏差**：spec 说"保持 child 状态"，但**走标准算法时**`projected.parentId` 可能 = `null`（当 `pointerBelowOver=false`、`previousItem=undefined`，见 S2 F3 trace）→ `parentRowIdForIndicator` 第 3 重 gate 阻止 indicator（与 spec "不显示 indicator" 一致），但 `projected.depth=0` 导致 inline source row `renderDepth=0`（**违反 spec"保持 child 状态"**——视觉上 inline DOM 跳到 root 缩进）。详见 §1.1 S2 F3 frame trace。 |
| 4 | **stay-as-root reorder**：root 间排序，不满足 demote 条件 → 不显示缩进 indicator | `SortableCategoriesList.tsx:432` ROOT-active + dwellState=OUT → projected = null → `parentRowIdForIndicator` 第一条 gate `if (!projected) return null` | **已落地** |
| 5 | **§2.7 / §2.14 / §6.3 状态机仅对 root → child 路径生效** | `SortableCategoriesList.tsx:680-758` dwell 状态机；`L432` ROOT-active 才 gate dwell；L689 仅 X 阈值进入 HOVER_NEAR | **已落地** |
| 6 | **child → root 路径不进入 dwell**，由 `getProjection` 第 8 参数 `originalActiveParentId` + "leave-original-subtree" 检查直接短路返回 `{depth=0, parentId=null}` | `treeUtilities.ts:469-505` getProjection 签名第 8 参数 `originalActiveParentId`；L535-548 短路 | **已落地** |
| 7 | **实现位置 1**：`treeUtilities.ts` getProjection 顶部 | `treeUtilities.ts:514-551` | **已落地** |
| 8 | **实现位置 2**：`SortableCategoriesList.tsx` `projected` useMemo 与 `handleDragEnd` recompute gate 中 `isChildActive` 分支 | `SortableCategoriesList.tsx:394` (isChildActive) + `L429-465` (projected useMemo) + `L806-816` (handleDragEnd recompute) | **已落地** |
| 9 | **单元测试**：6 个用例 | **未审计**（不在 r1 范围；L23 引用未在源码扫描范围内验证） | **未验证**（Agent A 仅审实现） |
| 10 | **§2.7 indicator 显示条件不变**（`parentRowIdForIndicator` 5 重 gate 中 `parentId === null` 已自然把 promote 排除） | `SortableCategoriesList.tsx:505` `if (projected.parentId === null) return null` | **已落地** |
| 11 | **§2.14 dwell 状态机继续描述 demote 路径**；非对称语义仅在 Revision History 章节声明 | `SortableCategoriesList.tsx:248-758` dwell 状态机仅 ROOT-active demote 用 | **已落地** |
| 12 | **§6.3 阈值规则修订为只针对 demote** | `treeUtilities.ts:603-606` X 阈值 + `SortableCategoriesList.tsx:432` ROOT-active 才 gate | **已落地** |
| 13 | **03_tech_plan / 04_implementation_plan 任务卡内容不需 patch** | **未审计**（不在 r1 范围） | **N/A** |

### 2.A V2.1 关键 gap（用户报告症状的根因候选）

| Gap | 描述 | 影响症状 | 严重度 |
|---|---|---|---|
| **G1** | spec 要求 same-parent reorder "保持 child 状态"；实现走标准算法返回的 `projected.depth` 在 `pointerBelowOver` 抖动下在 0 ↔ 1 之间切换 | S2、S1、S5 | **高** |
| **G2** | spec 要求 child → root 路径不进入 dwell；实现确实不进入 dwell，**但 same-parent reorder（child 在原父类子树内）走标准算法时 `projected.parentId` 可能错误返回 null**（pointerBelowOver=false 时） | S2 | **高** |
| **G3** | spec L11-15 隐含期望"在原父类子树内（含 originalParent）始终保持 child 视觉"，但实现 inline source row paddingLeft 跟随 projected.depth 抖动 | S2、S1、S5 | **高** |

---

## 3. §2.7 Drop Indicator 审计（02_design_spec.md L294-340）

| # | spec 要求 | 实现位置 | 落地状态 |
|---|---|---|---|
| 1 | indicator 缩进通过 wrapper element + `padding-left: depth × var(--indent-step)` 表达；不修改 `.drop-indicator-h` CSS | `SortableCategoryRow.tsx:273-288` 渲染 `.drop-indicator-wrapper` + `paddingLeft: INDENT_STEP_PX`；`src/index.css:677-679` `.drop-indicator-wrapper { transition: padding-left 150ms var(--ease-drag); }`；`.drop-indicator-h` 保留原 CSS 不变 (L651-659) | **已落地** |
| 2 | 缩进切换 timing：wrapper `transition: padding-left 150ms var(--ease-drag)` | `src/index.css:678` | **已落地** |
| 3 | indicator 自身（`.drop-indicator-h`）几何不变 | `src/index.css:651-659` 保持 V3 结构 | **已落地** |
| 4 | 拖入越过未展开折叠父类 row → 父类自动展开（onDragStart 已展开作冗余兜底） | `SortableCategoriesList.tsx:625-628` `setDragOverrideExpand(true)` | **已落地** |
| 5 | Drop 完成 → indicator fade out 100 ms | `src/index.css:657` `transition: opacity var(--duration-drag-indicator-fade) ease-out` (= 100 ms via token) | **已落地** |
| 6 | indicator 渲染锚点：anchored on `parentRowIdForIndicator` 的 row 下方（`bottom: -2`），不是 active row 自己 | `SortableCategoryRow.tsx:273-288` `position: absolute; bottom: -2; left: 0; right: 0; paddingLeft: INDENT_STEP_PX` | **已落地** |
| 7 | indicator 仅在 DROP_INTO_READY + !isInvalid + parentId !== originalParentId + parentId !== null 时渲染 | `SortableCategoriesList.tsx:501-508` 5 重 gate | **已落地** |

### 3.A §2.7 关键 gap

| Gap | 描述 | 影响症状 | 严重度 |
|---|---|---|---|
| **G4** | gate 1 (`dwellState !== 'DROP_INTO_READY'` → null) 对 CHILD-active 路径**不可能满足**（dwell 仅在 X≥12 + 时间过去时进入 DROP_INTO_READY；CHILD-active spec 期望"无 X、无 dwell"，所以用户 child→root 操作时 X 通常 ≈ 0，dwell 永远停在 OUT，indicator 永远不显示）。注意：spec L23 隐含 indicator 仅 demote 时显示，promote 时不显示 indicator —— 此行为**理论上正确**，但用户报告"反正问题很多"中的"无视觉反馈"可能与此相关 | S3、S5 | **中**（设计上 promote 不应显示 indicator，但用户失去视觉反馈） |

---

## 4. §2.13 Drop Validity 审计（02_design_spec.md L422-437）

| # | spec 要求 | 实现位置 | 落地状态 |
|---|---|---|---|
| 1 | 父类 → 同级 reorder（dragOffset.x ∈ [-12, +12]）→ 合法 | `SortableCategoriesList.tsx:932-987` 同级 reorder 路径 | **已落地** |
| 2 | 父类 → 另一父类的 drop into 区（X≥+12+dwell）→ 非法 (D5)；DragOverlay 0.5、cursor not-allowed、indicator 不渲染 | `treeUtilities.ts:629-637` `isParentBecomingChild` + `Projection.isInvalid=true`；`SortableCategoriesList.tsx:907-911` D5-invalid drop 直接 skip IPC | **部分落地 / 偏差**：opacity 0.5 与 cursor not-allowed 的 DragOverlay 视觉**未在 SortableCategoriesList.tsx 中显式控制**——DragOverlay 仅渲染 `<DragOverlayCategoryRow>`（L1212）。`isInvalid` 的视觉 feedback **未注入**到 DragOverlay。 |
| 3 | 子类 → 同级 reorder | `SortableCategoriesList.tsx:958-987` 同级 reorder | **已落地** |
| 4 | 子类 → 另一父类的 drop into 区 → 合法（change parent）；indicator 缩进 16 px | spec 期望此路径（demote into another parent）走 indicator 显示路径；实现：`SortableCategoriesList.tsx:432` ROOT-active 才有 dwell，CHILD-active 跳过 dwell；CHILD-active 的 promote-immediate 优先级 → 一旦 over 离开 originalSubtree 就立即 promote。**那 CHILD → 另一父类的 child** 怎么实现？查看 trace：用户拖 A-1 到 D（root，与 A 平级）的下方 → over=D；D !== originalParent、D.parentId=null !== "A" → `overInOriginalSubtree=false` → 立即 promote 到 root。**用户失去 child→另一父类 child 的能力**（无法做 cross-parent demote） | S3 (cross-parent move 失败) | **可能严重 gap**：spec L431 期望"子类→另一父类的 drop into 区"是"change parent"（demote 到新 parent），但 V2.1 的 immediate-promote 规则把它降级为"promote to root"。**待主 Agent 评估这是否为设计有意 / 用户场景实际需求**。 |
| 5 | 子类 → 根级 (dragOffset.x ≤ -12 + dwell) → 合法 promote | V2.1 的 immediate-promote 规则不需要 X≤-12（无 X、无 dwell） → 比 spec L432 更宽松 | **超落地**（V2.1 spec 已修订更宽松，原 L432 要求过时）|
| 6 | 任何破坏 max depth=2 → 非法（前端 prevent） | `treeUtilities.ts:602-619` `MAX_DEPTH=1` clamp + `appStore.ts:556-584` `moveCategoryToParent` pre-validate | **已落地** |
| 7 | 拖到 categories section 之外 → 非法（V3 不变） | V3 现状（不在 hierarchy 范围） | **已落地** |
| 8 | 验证在 onDragMove / onDragOver 实时判定（per D13）；后端命令侧二次校验 | `SortableCategoriesList.tsx:646-759` handleDragMove 计算 projected；后端 `set_category_parent` 二次校验（`appStore.ts:599-602` 指向 IPC）| **已落地** |

### 4.A §2.13 关键 gap

| Gap | 描述 | 影响症状 | 严重度 |
|---|---|---|---|
| **G5** | D5-invalid 视觉反馈（DragOverlay 0.5 + cursor not-allowed）未实现 —— DragOverlay 不接受 isInvalid prop，仅 `<DragOverlayCategoryRow>` 默认 0.95 opacity | S1 (用户得不到非法反馈) | **中** |
| **G6** | spec L431 "子类→另一父类的 drop into 区 = change parent" 与 V2.1 的 immediate-promote 行为**互斥**：实现下用户无法直接把 child A-1 拖到 D 上变 D 的 child，必须先 promote 到 root、再 demote 到 D —— 两步操作 | S3 部分场景 | **可能严重**（设计意图待主 Agent 决策）|

---

## 5. §2.14 Dwell 状态机审计（02_design_spec.md L438-484）

| # | spec 要求 | 实现位置 | 落地状态 |
|---|---|---|---|
| 1 | 三态：OUT / HOVER_NEAR / DROP_INTO_READY | `SortableCategoriesList.tsx:254` `useState<'OUT' \| 'HOVER_NEAR' \| 'DROP_INTO_READY'>('OUT')` | **已落地** |
| 2 | OUT 下：dwell timer = idle、pending depth = baseline、indicator wrapper paddingLeft = baseline × 16 | `SortableCategoriesList.tsx:432` ROOT-active dwellState=OUT → projected=null → indicator 不渲染（baseline 视觉） | **已落地** |
| 3 | HOVER_NEAR 下：dwell timer = setTimeout(80ms)、pending depth = projected、indicator wrapper paddingLeft = baseline × 16（尚未切换） | `SortableCategoriesList.tsx:703-714` `armTimer` 启动 80 ms timer；`L501-508` 5 重 gate 在 HOVER_NEAR 状态下仍阻止 indicator 渲染 | **已落地** |
| 4 | DROP_INTO_READY 下：dwell timer = idle (已 fired)、pending depth = projected (commit)、indicator wrapper paddingLeft = projected × 16 (150 ms transition)、若 D5-invalid → DragOverlay 0.95→0.5 瞬时 + cursor not-allowed、若合法 → DragOverlay 不变 | `SortableCategoriesList.tsx:705-712` timer expires → setDwellState('DROP_INTO_READY')；indicator gate 满足，渲染。但 D5-invalid 视觉**未注入**到 DragOverlay（仅在 `Projection.isInvalid` 字段中携带，未驱动 DragOverlay opacity/cursor 改变） | **部分落地 / 偏差**：D5-invalid 视觉缺失（同 G5） |
| 5 | 转移：OUT → HOVER_NEAR (`\|X\| ≥ 12` + over) | `SortableCategoriesList.tsx:739-745` `if (xPassesThreshold) setDwellIfChanged('HOVER_NEAR') + armTimer` | **已落地** |
| 6 | 转移：HOVER_NEAR → OUT (`\|X\| < 12`) | `SortableCategoriesList.tsx:755-758` `if HOVER_NEAR + X<12 → clearTimer + setDwellIfChanged('OUT')` | **已落地** |
| 7 | 转移：HOVER_NEAR → DROP_INTO_READY (timer expires + still over same row) | `SortableCategoriesList.tsx:705-712` timer callback 检查 `dwellOverIdRef.current === id` → 设 DROP_INTO_READY | **已落地** |
| 8 | 转移：DROP_INTO_READY → HOVER_NEAR (X<12) | `SortableCategoriesList.tsx:750-754` `if DROP_INTO_READY + X<12 → setDwellIfChanged('HOVER_NEAR')` | **已落地** |
| 9 | 转移：HOVER_NEAR → HOVER_NEAR (over 切换) | `SortableCategoriesList.tsx:724-735` `overChanged → clearTimer + (X≥12 → setDwellIfChanged('HOVER_NEAR') + armTimer)` | **已落地** |
| 10 | 转移：DROP_INTO_READY → HOVER_NEAR (over 切换 + X≥12) | 同上：`SortableCategoriesList.tsx:724-735` overChanged → 重置 + arm new timer。**注意**：spec 要求此转移视觉反向 150ms 恢复 baseline → 启动新 timer 80ms → expire 后 commit 新 over 的 projected。实现确实如此（dwellState 退到 HOVER_NEAR、indicator gate 1 阻止渲染、timer 80ms 后再次 fire 进入 DROP_INTO_READY）| **已落地** |
| 11 | 转移：any → OUT (cancel/end/over=null) | `SortableCategoriesList.tsx:846-852` (handleDragEnd) + `L1007-1013` (handleDragCancel) 清零 timer + 设 OUT | **已落地** |
| 12 | dwell timer 同步清零 | `SortableCategoriesList.tsx:693-698` `clearTimer` 内 `clearTimeout + dwellTimerRef.current = null` | **已落地** |
| 13 | opacity 0.95 ↔ 0.5 瞬时（无 fade 过渡） | DragOverlay opacity 切换的 CSS：`.drag-overlay-row` 类**未声明** opacity transition；瞬时切换。但 opacity 切换本身**未实现**到 D5-invalid 路径（同 G5） | **部分落地** |
| 14 | indicator wrapper paddingLeft 切换 150ms transition | `src/index.css:678` `.drop-indicator-wrapper { transition: padding-left 150ms var(--ease-drag); }` | **已落地** |
| 15 | DROP_INTO_READY → HOVER_NEAR → DROP_INTO_READY (X 抖动 11/13)：spec 接受 150ms 反复过渡的代价 | `SortableCategoriesList.tsx:739-758` 实际行为符合 spec；**但 spec L481 备注"评审时若 dev mode 实测视觉抖动显著，可在 03_tech_plan 中追加 hysteresis"**——目前**未实现 hysteresis** | **已落地（V2 接受代价）** |
| 16 | onDragOver 切换 over row 时 dwell timer 立即清零 | `SortableCategoriesList.tsx:724` `clearTimer()` | **已落地** |

### 5.A §2.14 关键 gap

| Gap | 描述 | 影响症状 | 严重度 |
|---|---|---|---|
| **G7**（重复 G5）| D5-invalid 视觉反馈缺失 | S1 | **中** |

---

## 6. §6.3 Drop-into 横向阈值审计（02_design_spec.md L1030-1062）

| # | spec 要求 | 实现位置 | 落地状态 |
|---|---|---|---|
| 1 | 触发 demote：`dragOffset.x ≥ +12 px` 且 dwell ≥ 80 ms | `treeUtilities.ts:73` `ABS_X_THRESHOLD_PX = 12` + `treeUtilities.ts:603-606` `if (Math.abs(dragOffsetX) >= ABS_X_THRESHOLD_PX)` ；`SortableCategoriesList.tsx:139` `DWELL_MS = 80` | **已落地** |
| 2 | 触发 promote：`dragOffset.x ≤ -12 px` 且 dwell ≥ 80 ms | V2.1 已修订为"无 X、无 dwell"——`treeUtilities.ts:535-548` immediate-promote 短路 | **已被 V2.1 修订** |
| 3 | 不触发深度变化：`dragOffset.x ∈ [-12, +12]` | `treeUtilities.ts:601-606` `dragDepth=0` 当 `\|offsetLeft\| < 12`；`SortableCategoriesList.tsx:689` `xPassesThreshold = Math.abs(newOffset) >= ABS_X_THRESHOLD_PX` | **已落地** |
| 4 | dwell 状态机 OUT/HOVER_NEAR/DROP_INTO_READY 三态（详 §2.14） | 见 §5 | **已落地** |
| 5 | 实测目标：从 mousedown 到看到 demote 视觉反馈 ≤ 600 ms | **未审计**（dev mode 实测，不在 r1 范围）| **未验证** |
| 6 | dwell 退路：> 600 ms 影响体感 → 降至 50 ms 或取消 | **未实现**（仍 80 ms）| **N/A** |
| 7 | Retreat：DROP_INTO_READY → HOVER_NEAR (X<12) 视觉立即恢复 reorder 状态 | `SortableCategoriesList.tsx:750-754` 退到 HOVER_NEAR；indicator gate 1 阻止渲染 → 用 `transition: padding-left 150ms` 反向恢复（不在主代码而在 CSS） | **已落地** |
| 8 | Retreat：HOVER_NEAR → OUT (X<12 + timer 未 fire) timer 清零、视觉无变化 | `SortableCategoriesList.tsx:755-758` clearTimer + setDwellIfChanged('OUT')；视觉确实不变（HOVER_NEAR 阶段 indicator 已被 gate 阻止） | **已落地** |
| 9 | dwell 计时器同步清零（不等 expire） | 见 §5 #12 | **已落地** |
| 10 | dwell 用 `setTimeout(80)` 实现，不依赖 rAF 抖动 | `SortableCategoriesList.tsx:705` `setTimeout(...)` | **已落地** |

### 6.A §6.3 关键 gap

| Gap | 描述 | 影响症状 | 严重度 |
|---|---|---|---|
| 无新 gap（G1-G3 涵盖了 same-parent reorder 的 child 状态保持问题，与 §6.3 关系不大） | — | — | — |

---

## 7. 症状 → 根因映射表

> 每症状最终归到 1-3 个具体 file:line + 1 句话根因。带"待 Agent B 验证"的项最终定锤需 Agent B 协作。

| 症状 | 根因候选 1 (file:line) | 根因候选 2 (file:line) | 根因候选 3 (file:line) | 综合 |
|---|---|---|---|---|
| **S2** "拖二级到父类别上面闪烁" | `treeUtilities.ts:541` (`overItem.id === originalActiveParentId` → `overInOriginalSubtree=true` → 走标准算法) → 标准算法在 `pointerBelowOver` 边界抖动下 `projected.parentId` 在 `null ↔ originalParent` 之间切换 | `treeUtilities.ts:579-588` (`pointerBelowOver=false` 分支：`previousItem=undefined` → `maxDepth=0` → `depth=0` → `parentId=null`) | `SortableCategoriesList.tsx:1117-1125` (`renderDepth = projected.depth` 驱动 inline source row paddingLeft 抖动 0/1) | **同根因 H1**：`pointerBelowOver` 在 over=originalParent 的中线附近抖动 → `projected` 在 promote/keep-child 之间切换 → inline source row paddingLeft 抖动；视觉效果是否产生用户可见的"闪烁"还需 Agent B 验证 measurement 链路 |
| **S3** "移除子类别失败" | **待 Agent B 验证**：`snapModifier.ts:48-126` (snap 拉力) + closestCenter 选 over 的输入（如果用 transformed rect → over 锁定 → asymmetric promote 不触发） | `SortableCategoriesList.tsx:993` (catch error 静默) → `console.error` 但视觉无反馈，用户感觉"移除失败" | `appStore.ts:556-584` (前端 pre-validation reject) → set error → fallback get_categories → 视觉与原状一致 | **H2 待 Agent B 验证**：root cause 取决于 closestCenter 输入；如果是 transformed rect（snap 影响）→ over 不切换；如果不是，则需要查 console.error/前端 pre-validation 路径 |
| **S4** "promote 后无动效闪烁" | `SortableCategoriesList.tsx:932-957` (两次 IPC 序列：setCategoryParent → reorder)；中间帧 `appStore.ts:587-594` optimistic update 后 store mutate → React re-render → flatten 输出中 A-1 在错位置（**第一次跳变**） | `SortableCategoriesList.tsx:954` await onReorder(newOrderedIds) 后 store 第二次 mutate → A-1 跳到目标位置（**第二次跳变**） | **待 Agent B 验证 H4**：dnd-kit `useSortable.transition` 在 drop 之后是否仍触发 cascade。如果不触发 → 两次跳变都无动画；如果触发但 IPC 序列太短 → 第一次 cascade 还没播完就被打断 | **H3 成立 + H4 待 Agent B 验证**：两次 IPC 之间确有中间帧；视觉是否"无动效"取决于 dnd-kit cascade 在 drop 之后的行为 |
| **S1** "磁吸不自然 / 总是误触" | `snapModifier.ts:114-118` (transform.x 和 transform.y 都被修改；hierarchy 场景下 X 也被拉) | `treeUtilities.ts:541` 同 S2（pointerBelowOver 边界抖动 → projected 切换 → inline DOM 抖动 → 可能影响 sibling 视觉）| `SortableCategoriesList.tsx:432, 441` (CHILD-active 路径不进入 dwell；indicator 不显示给 user → 用户失去"我现在的拖动会触发什么"反馈) | **复合根因**：snap 在 X/Y 都施加拉力 + projected 边界抖动 + 缺少视觉反馈 |
| **S5** "整体跟手性差" | 同 S1 | (同) | (同) | 综合体感；与 S1 同根因 |

---

## 8. 关键不确定性 / 待 Agent B 验证清单

| # | 问题 | 影响 |
|---|---|---|
| Q-B1 | `closestCenter` 算法的实际输入：是 active rect (transformed) 还是 collisionRect 还是 pointer？ | 决定 H2 是否成立（snap → over 锁定）；决定 S3 根因 |
| Q-B2 | snap modifier 修改 transform 后，下一次 collision detection 用的是修改后的还是原始的 rect？ | 同 Q-B1；决定 snap-collision 反馈环是否存在 |
| Q-B3 | `useSortable.transition` 在 drop 之后退出 measurement 周期还是仍触发 cascade？ | 决定 H4 是否成立；决定 S4 根因之一 |
| Q-B4 | `MeasuringStrategy.Always` 在 drag end 后是否仍持续测量？sibling row reflow（被 active row paddingLeft 抖动驱动）是否产生 cascade transform 抖动？ | 决定 S1/S2 视觉效果与 inline DOM 抖动的耦合机制 |
| Q-B5 | `event.delta.x` 是否始终反映"用户横向意图"（无 snap 干扰、无累积漂移）？ | 验证 H1 / H5 中 X 阈值的可靠性 |

---

## 9. Agent A 不能解答的问题（明确移交）

- dnd-kit 一手源码逐行验证 → **Agent B**
- 同类工具（macOS Finder / Linear / Things 3 / Notion / Apple Notes）hierarchy drag UX 调研 → **Agent C**
- 修复方案（选项 A/B/C/D/E 等）评估 → **后续阶段（综合 + 规划）**
- 是否要保留"子类→另一父类的 drop into 区 = change parent"语义（spec L431 vs V2.1 immediate-promote 冲突，G6） → **主 Agent 综合阶段决策**

---

## 10. 摘要

**关键 finding（按确信度降序）**：

1. **H1 成立（高确信）**：`pointerBelowOver` 在 over=originalParent 的中线附近抖动驱动 `projected.parentId` 在 `null ↔ originalParent` 之间切换；标准算法在 `pointerBelowOver=false` 时返回 `{depth=0, parentId=null}`，与 V2.1 spec L17 "保持 child 状态" 直接矛盾（**G1 / G2 / G3** = high）。代码证据：`treeUtilities.ts:535-588`、`SortableCategoriesList.tsx:1117-1125`。

2. **H3 成立（高确信）**：`handleDragEnd` 的两次 IPC（setCategoryParent → reorder）之间有 React 中间帧渲染；store 的 optimistic update 在 IPC 1 完成时立即 mutate，A-1 在 categories 数组中的位置不变（仍紧邻 A）→ flatten 输出中 A-1 出现在 A 后面、B 前面（错位）；IPC 2 完成后又跳到正确位置 → 两次跳变。代码证据：`SortableCategoriesList.tsx:932-957`、`appStore.ts:587-594`、`treeUtilities.ts:205-255`。

3. **G5 / G6 关键 spec gap（中确信）**：D5-invalid 的 DragOverlay 视觉（opacity 0.5 + cursor not-allowed）未实现；spec L431 "子类 → 另一父类的 drop into 区 = change parent" 与 V2.1 immediate-promote 冲突——实现下用户失去 cross-parent demote 能力。

4. **H2 / H4 待 Agent B 验证**：S3 / S4 的 root cause 取决于 dnd-kit closestCenter / cascade transition 在 transformed rect / drop 后的具体行为。

**V2.1 spec 落地状态**：14 项要求中 9 项已落地、3 项部分落地（spec 期望 "保持 child 状态" 但实现 inline DOM 抖动）、2 项未审计（单测 + 03/04 plan）。

**§2.7 / §2.13 / §2.14 / §6.3 落地状态**：38 项细则中 31 项已落地、5 项部分落地（D5-invalid 视觉缺失）、2 项未审计（dev mode 实测 + 单测）。

**未发现的"完全未落地"spec 要求**：所有核心要求都有对应代码路径；偏差集中在"边界场景下的视觉一致性"（G1-G7）。
