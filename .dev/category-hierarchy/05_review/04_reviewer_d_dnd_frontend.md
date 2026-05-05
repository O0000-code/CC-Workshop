# Reviewer D — dnd-kit + React Frontend Review (V1 03_tech_plan + 02_design_spec)

> **作者身份**：Reviewer D（资深 React 18 + TypeScript + dnd-kit 6.3.1 / sortable 10.0.0 工程师评审 SubAgent）
> **评审主对象**：`.dev/category-hierarchy/03_tech_plan.md` V1（前端组件改造与 dnd-kit 树形拖拽实现）
> **次评审对象**：`02_design_spec.md` V1 中视觉/动效与 dnd-kit 行为耦合的部分
> **评审视角**：V3 不变量保留 + dnd-kit API 用法正确性 + frontend store 一致性 + TypeScript 类型安全
> **评审基础**：`node_modules/@dnd-kit/{core@6.3.1,sortable@10.0.0,modifiers@9.0.0}` 一手源码 + 官方 `clauderic/dnd-kit/stories/3 - Examples/Tree/` 一手 GitHub 源码 + 现有项目 `src/components/sidebar/` V3 实现

---

## 0. 已读基线 Checklist

| # | 文档 / 代码 | 关键摘录 |
|---|---|---|
| 1 | `.dev/category-hierarchy/00_understanding.md` | §4.4 V3 不变量必背、§5 隐含前提、§6 14 决策 |
| 2 | `.dev/category-hierarchy/01_research/_synthesis_decisions.md` | 14 决策定锤、§2.2 D4 = 12px+80ms、§2.3 chevron 保留 |
| 3 | `.dev/category-hierarchy/01_research/r2_dnd_tree_architecture.md` | dnd-kit 6.3 + sortable 10 一手源码 + Sortable Tree example 解构 |
| 4 | `.dev/category-hierarchy/01_research/r5_impact_enumeration.md` | grep 全 codebase 569 行 categor 命中 + 5 dropdown 必改清单 |
| 5 | `.dev/category-hierarchy/01_research/r6_classification_count_filter.md` | filter / count / autoClassify 全路径 |
| 6 | `.dev/category-hierarchy/02_design_spec.md` V1 | §2.4 chevron + §6.3 12px+80ms dwell + §7 V3 不变量 22 项核对 |
| 7 | `.dev/category-hierarchy/03_tech_plan.md` V1 | §2.3 max depth 4 处 clamp + §5.1.A treeUtilities + §5.1.B treeKeyboardCoordinates + §5.2 SortableCategoriesList 改造 |
| 8 | `.dev/sidebar-reorder/02_design_spec.md` V3 | V3 视觉不变量基线 |
| 9 | `.dev/sidebar-reorder/03_tech_plan.md` V3 | V3 技术不变量基线 |
| 10 | `.claude/rules/verify-third-party-behavior-firsthand.md` | 第三方源码必须 link node_modules |
| 11 | `src/components/sidebar/SortableCategoriesList.tsx`（316 行）+ `SortableCategoryRow.tsx`（136 行）+ `CategoryRowContent.tsx`（65 行）+ `dnd/snapModifier.ts`（126 行）+ `dnd/animations.ts`（28 行）+ `dnd/announcements.ts`（86 行）+ `stores/appStore.ts`（partial）+ `components/layout/MainLayout.tsx:96-104`（categoriesWithCounts） | V3 现状一手代码 |
| 12 | `node_modules/@dnd-kit/core/dist/sensors/keyboard/types.d.ts:18-22`（KeyboardCoordinateGetter 签名） | 类型签名一手 |
| 13 | `node_modules/@dnd-kit/sortable/dist/sortable.esm.js:657-758`（sortableKeyboardCoordinates 实现） | 行为一手 |
| 14 | `node_modules/@dnd-kit/core/dist/types/events.d.ts:6-12, 33-35`（DragMoveEvent / DragOverEvent 含 `delta: Translate`） | DragMoveEvent.delta.x 是 drag 累积偏移 |
| 15 | `node_modules/@dnd-kit/sortable/dist/hooks/useSortable.d.ts`（return shape） | data 字段可选传入 |
| 16 | GitHub `clauderic/dnd-kit/stories/3 - Examples/Tree/SortableTree.tsx` `keyboardCoordinates.ts` `types.ts` | SensorContext = `MutableRefObject<{items, offset}>` 模式 |

**所有 16 项命中文件已逐文件 Read 完毕**；每条 dnd-kit / 官方 example 声称都附 `node_modules` 路径或 GitHub raw URL。

---

## 1. V3 不变量保留核对表（22 项 + 1 项扩展）

> 每项核对 V1 03/02 中的对应方案是否破坏 V3 不变量。任何破坏 = P0。

| # | V3 不变量 | 现状位置（codebase 一手） | V1 03/02 中的对应处理 | ✅/❌/⚠️ | 备注 |
|---|---|---|---|---|---|
| 1 | 4 px activation distance（保 click navigate 不抢） | `SortableCategoriesList.tsx:115` `useSensor(CustomMouseSensor, { activationConstraint: { distance: 4 } })` | 03 §1 库选型不变；02 §7 #1 标 ✅；§6.3 dwell 80ms 是激活后才计算 | ✅ | 不变 |
| 2 | 两段 lift（80ms 吸盘 + 120ms 拉离）= `SortableCategoryRow.opacity:0` + DragOverlay 接管 | `SortableCategoryRow.tsx:68` `opacity: isDragging ? 0 : 1` | 03 §5.3 `opacity: isDragging ? 0 : (isInvalidDrop ? 0.5 : 1)`；02 §6.3 不改 lift 阶段 | ✅ | invalid drop 用 0.5（V3 cancel 视觉一致）|
| 3 | DragOverlay 多层 hsl 阴影（`.drag-overlay-row` class） | `index.css` `.drag-overlay-row { box-shadow: ... }` | 03 §5.1 `DragOverlayCategoryRow` 不变 | ✅ | — |
| 4 | 12 px 连续磁吸（quadratic gravity well + lerp，**非阈值瞬移**） | `dnd/snapModifier.ts:48-119` createMagneticSnapModifier | 03 §6.5 `snapModifier.ts` **完全不修改**；02 §2.10 论证不接入 X 轴磁吸（"hidden hand"禁忌） | ✅ | V3 magnetic snap 在 hierarchy 下行为正确（snap 仍把 dragged 中心吸向 over.rect.center） |
| 5 | 220 ms cascade（`cubic-bezier(0.16, 1, 0.3, 1)` 无 stagger） | `SortableCategoryRow.tsx:51-54` `transition: { duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }` | 03 §5.3 useSortable transition 不变；02 §2.9 cascade 继承 | ✅ | row 高度恒定 h-8 → cascade 不错位 |
| 6 | distance-aware settle（< 4px → 0ms；≥ 4px → `min(280, 120 + delta × 0.5)`）| `SortableCategoriesList.tsx:138-159` | 03 §5.2 handleDragEnd 不变；02 §2.11 公式不改 | ✅ | — |
| 7 | Cancel snap-back 280ms `cubic-bezier(0.32, 0.72, 0, 1)` | `index.css` token `--ease-drag-cancel` | 02 §2.12 hierarchy 非法区复用同 cancel | ✅ | — |
| 8 | DndContext modifiers = `[snapModifier]` 仅磁吸 | `SortableCategoriesList.tsx:215` | 03 §6.5 不动；02 §7 #8 标 ✅ | ✅ | — |
| 9 | DragOverlay modifiers = `[restrictToWindowEdges]` 仅防出窗 | `SortableCategoriesList.tsx:311` | 03 §5.2 JSX 不动 | ✅ | — |
| 10 | CSS.Translate.toString（**不是** CSS.Transform.toString）| `SortableCategoryRow.tsx:62` 显式 `CSS.Translate.toString(transform)` | 03 §5.3 `transform: CSS.Translate.toString(transform)` 注释明示"不是 Transform" | ✅ | 与官方 Tree example `SortableTreeItem.tsx:30` 一致 |
| 11 | 全套 CSS token | `index.css` `--color-accent`, `--ease-drag*`, `--duration-drag-*` | 02 §5 仅新增 `--indent-step: 16px`；不引入新曲线 | ✅ | 03 §7.1 同 |
| 12 | DATA_MUTEX 串行 + apply_reorder pure + ENSEMBLE_DATA_DIR 测试隔离 | `data.rs:106-112` + `apply_reorder` | 03 §3.1 grep 全 callsite 表 + §3.3.3 `set_category_parent` 加锁 + §3.4 migrate 加锁 | ✅ | 后端逻辑 OK（属 Reviewer A/C 范围）|
| 13 | categoriesVersion / tagsVersion 协议防 autoClassify race | `appStore.ts:67, 161-170, 247-249, 277, 297-298` | 03 §4.1 + §4.3 setCategoryParent bump version；§4.5 dual-write | ✅ | — |
| 14 | enqueueReorder 串行 IPC 队列 | `appStore.ts:19-25` | 03 §4.3 setCategoryParent 复用同队列 | ✅ | — |
| 15 | data-no-dnd + CustomMouseSensor 双保险 | `CustomMouseSensor.ts` + `CategoryRowContent.tsx:42` | 03 §5.5 ChevronToggle 加 `data-no-dnd="true"` + `onMouseDown stopPropagation` | ✅ | 与 ColorPicker 同模式 |
| 16 | 编辑/新增态 SortableContext 全局 disabled | `SortableCategoriesList.tsx:231` `disabled={isInputMounted}` | 03 §5.2 JSX 不动 | ✅ | — |
| 17 | KeyboardSensor + sortableKeyboardCoordinates + announcements（VoiceOver name 不 UUID） | `SortableCategoriesList.tsx:116, 218` + `announcements.ts:28-85` | 03 §5.1.B `treeKeyboardCoordinates`（**有 P0**，详 §5）；02 §3 announcements 扩展 | ⚠️ | 见 P0-1 |
| 18 | prefers-reduced-motion 全套尊重 | `index.css @media (prefers-reduced-motion: reduce)` | 02 §2.18 + 03 §7.4 hierarchy selectors 追加 | ✅ | — |
| 19 | justDroppedId 50 ms guard 防误触 click navigate | `SortableCategoriesList.tsx:101, 175-177` + `SortableCategoryRow.tsx:71-79` | 03 §5.2 handleDragEnd 末尾 50ms 不变 | ✅ | — |
| 20 | 拖动期间 Refresh 按钮 disabled | `MainLayout.tsx`（V3）| 03/02 不提；推断不改 | ✅ | — |
| 21 | "Show X more" 折叠态 onDragStart 自动展开 | `SortableCategoriesList.tsx:131-133` | 03 §5.2 handleDragStart 保留；hierarchy 折叠是独立 state | ✅ | — |
| 22 | DragOverlay 不带原位 padding（DragOverlay 内容是裸 row clone）| `DragOverlayCategoryRow.tsx`（V3）| 02 §2.6 显式扩展为"不带 26 px 缩进"；03 §5.1 `DragOverlayCategoryRow` 不变 | ✅ | — |
| 23（扩展） | closestCenter collision detection | `SortableCategoriesList.tsx:212` | 03 §5.2 不动 | ✅ | dnd-kit Sortable Tree example 也用 closestCenter |
| 24（扩展） | MeasuringStrategy.Always | `SortableCategoriesList.tsx:216` | 03 §5.2 不动 | ✅ | expand/collapse 重测量正确 |

**结论**：**V3 22 项 + 2 项扩展 = 24 项不变量逐项打勾，无 P0 破坏**（仅 #17 keyboard coordinate 有 P0 实现 bug，详 §5）。

---

## 2. dnd-kit 行为正确性核查

### 2.1 sortableKeyboardCoordinates 与 treeKeyboardCoordinates 的差异（**P0 实施 bug**）

**dnd-kit 6.3.1 `KeyboardCoordinateGetter` 签名**（一手源码 `node_modules/@dnd-kit/core/dist/sensors/keyboard/types.d.ts:18-22`）：

```ts
export declare type KeyboardCoordinateGetter = (event: KeyboardEvent, args: {
    active: UniqueIdentifier;
    currentCoordinates: Coordinates;
    context: SensorContext;
}) => Coordinates | void;
```

**`Coordinates`** = `{x: number, y: number}` — **绝对屏幕像素坐标**（屏幕 / 容器内的 active 当前位置），**不是** 拖动累积偏移。

**官方 Sortable Tree example 的 `keyboardCoordinates.ts`**（GitHub raw 一手代码）：

```ts
export const sortableTreeKeyboardCoordinates: (
  context: SensorContext,                  // ← MutableRefObject<{items, offset}>
  indicator: boolean,
  indentationWidth: number
) => KeyboardCoordinateGetter = (context, indicator, indentationWidth) => (
  event,
  { currentCoordinates, context: { active, over, ... } }
) => {
  // ...
  const { current: { items, offset } } = context;   // ← 从 ref 取最新 items + offset
  if (horizontal.includes(event.code) && over?.id) {
    const { depth, maxDepth, minDepth } = getProjection(
      items, active.id, over.id, offset, indentationWidth   // ← 用 offset，不用 currentCoordinates.x
    );
    // ...
  }
}
```

`SortableTree.tsx` 中：

```ts
const sensorContext: SensorContext = useRef({
  items: flattenedItems,
  offset: offsetLeft,
});
const [coordinateGetter] = useState(() =>
  sortableTreeKeyboardCoordinates(sensorContext, indicator, indentationWidth)
);
// ...
useEffect(() => {
  sensorContext.current = {
    items: flattenedItems,
    offset: offsetLeft,
  };
}, [flattenedItems, offsetLeft]);
```

**关键事实**：`coordinateGetter` 是 `useState(() => factory(...))` **创建一次**的稳定 closure；它读取的 `items` / `offset` 必须通过 **MutableRef** 通道，否则会捕获到 V0 渲染的 stale 值。

**V1 03 §5.1.B 中的实现**（违规）：

```ts
export function makeTreeKeyboardCoordinates(
  getItems: () => FlattenedCategory[],
  indentationWidth: number = INDENT_STEP_PX,
): KeyboardCoordinateGetter {
  return (event, args) => {
    const { currentCoordinates, context } = args;
    const { active, over, droppableContainers, collisionRect } = context;
    // ...
    const items = getItems();
    // Compute pseudo-offset for getProjection
    const offsetX = currentCoordinates.x;     // ← P0 BUG
    const projection = getProjection(items, active.id, over.id, offsetX, indentationWidth);
    // ...
  };
}
```

**P0 问题**：
1. **`currentCoordinates.x` 不是 drag offset，是绝对坐标**。`getProjection` 期待的是 **dragOffsetX 累积偏移**（鼠标拖动期间 X 累积位移）；用绝对 x 调用，`Math.round(absoluteX / 16)` 会产生**任意大数**（如 200/16 = 12 → projectedDepth = activeItem.depth + 12 → clamp 到 1 → 看起来"work"但语义错乱），并且**不响应键盘 Left/Right** — 因为按 Left 后 currentCoordinates.x 仅改变 indentationWidth，但是 getProjection 已经 clamp 到 depth=1（无意义信号）。
2. **缺少 SensorContext.current.offset 的 ref 通道**：V1 计划仅在 `SortableCategoriesList` 内 `useState(offsetLeft)`，但 KeyboardSensor 的 coordinateGetter 是 closure；V1 没有提供从 closure 内拿到最新 offsetLeft 的通路。
3. **缺少 `event.preventDefault()`**：官方 example 在 horizontal direction 命中时 `event.preventDefault()`（line 32）。V1 的 makeTreeKeyboardCoordinates 没有这一步 — 浏览器默认按 → 在 sidebar focus 状态下可能滚动 sidebar 容器。

**修订建议**（必须修订才能落地）：

```ts
// 1. 引入 SensorContext ref 通道
import type { MutableRefObject } from 'react';

export interface TreeSensorContext {
  items: FlattenedCategory[];
  offset: number;
}

export type TreeSensorContextRef = MutableRefObject<TreeSensorContext>;

export function makeTreeKeyboardCoordinates(
  contextRef: TreeSensorContextRef,
  indentationWidth: number = INDENT_STEP_PX,
): KeyboardCoordinateGetter {
  return (event, args) => {
    const { currentCoordinates, context: { active, over, ...rest } } = args;

    // Pass-through to default ↑/↓ (vertical sortable behavior)
    if (!horizontal.includes(event.code)) {
      return sortableKeyboardCoordinates(event, args);
    }

    if (!active?.id || !over?.id) return undefined;

    event.preventDefault();   // ← 防 sidebar 容器滚动

    const { items, offset } = contextRef.current;   // ← 从 ref 取最新（不是 closure stale）
    const projection = getProjection(items, active.id, over.id, offset, indentationWidth);

    switch (event.code) {
      case KeyboardCode.Left:
        if (projection.depth > 0) {
          return { ...currentCoordinates, x: currentCoordinates.x - indentationWidth };
        }
        return undefined;
      case KeyboardCode.Right:
        if (projection.depth < MAX_DEPTH && !projection.isInvalid) {
          return { ...currentCoordinates, x: currentCoordinates.x + indentationWidth };
        }
        return undefined;
      default:
        return undefined;
    }
  };
}

// 2. 在 SortableCategoriesList 内
const sensorContextRef = useRef<TreeSensorContext>({
  items: flattenedItems,
  offset: offsetLeft,
});

useEffect(() => {
  sensorContextRef.current = { items: flattenedItems, offset: offsetLeft };
}, [flattenedItems, offsetLeft]);

const [coordinateGetter] = useState(() =>
  makeTreeKeyboardCoordinates(sensorContextRef, INDENT_STEP_PX),
);

const sensors = useSensors(
  useSensor(CustomMouseSensor, { activationConstraint: { distance: 4 } }),
  useSensor(KeyboardSensor, { coordinateGetter }),
);
```

> **第三方源码引证**：`node_modules/@dnd-kit/core/dist/sensors/keyboard/types.d.ts:18-22`（KeyboardCoordinateGetter 签名）+ GitHub `clauderic/dnd-kit/stories/3 - Examples/Tree/SortableTree.tsx`（sensorContext useRef + useEffect 同步模式）。

### 2.2 onDragEnd 的 `arrayMove(flattenedItems, ...)` 把"未提及"子类挤散（**P0 设计 bug**）

**V1 03 §5.2 handleDragEnd**：

```ts
if (orderChanged) {
  const newFlat = arrayMove(
    flattenedItems,
    flattenedItems.findIndex((it) => it.id === active.id),
    flattenedItems.findIndex((it) => it.id === over.id),
  );
  onReorder(newFlat.map((it) => String(it.id)));
}
```

**问题链**：

1. `flattenedItems` 在 §5.2 useMemo 里是：
   ```ts
   const baseFlat = flattenTree(categories, collapsedIds);
   if (activeId === null) return baseFlat;
   return removeChildrenOf(baseFlat, [activeId]);
   ```
   即 **active 父类的所有 children 被临时从 flat list 中移除**（dnd-kit Sortable Tree example pattern §2.5）。

2. 拖动结束时 `arrayMove(flattenedItems, ...)` 操作的是**已移除 active 子树**的 flat list；其结果是不含 active 子类的 ordered ids。

3. 这个 ordered ids 传给 backend `reorder_categories(orderedIds)` → backend `apply_reorder`：
   - **未在 orderedIds 中的 ids**（含 active 子类）会被**追加到末尾**（`apply_reorder` Pass 2，参 `data.rs:77-83`）。
   - 即 active 父类的 children 在 backend Vec 中被**移到 Vec 末尾**，而不是紧跟其父类。

4. UI 重渲染时 `flattenTree(categories, ...)` 会把 children 按 parentId 找回并放在父类下面渲染——所以**视觉上看起来正确**，但 backend Vec 顺序是错的（破坏"children 紧跟 parent"的 invariant）。

5. 长期影响：每次拖动 root（如 reorder root A 与 root B），所有 root 的子类都被冲到 Vec 末尾。这不是 "lost data"，但破坏 Vec 的拓扑——下次拖动同样问题，且任何依赖 Vec 顺序的 reasoning（如 "siblings adjacent in Vec" 假设）会失败。

**修订建议**（必须修订）：

```ts
if (orderChanged) {
  // 必须以 baseFlat（未移除 children）为基础重组顺序，而不是 flattenedItems（已移除 active 子树）
  const baseFlat = flattenTree(categories, collapsedIds);  // recompute without removeChildrenOf

  // 在 baseFlat 中找到 active 与 over 的索引
  const activeBaseIdx = baseFlat.findIndex((it) => it.id === active.id);
  const overBaseIdx = baseFlat.findIndex((it) => it.id === over.id);
  if (activeBaseIdx === -1 || overBaseIdx === -1) return;

  // arrayMove 保留 children 在 active 之后（因为 baseFlat 中 children 紧跟 parent）
  // 注意：如果 active 是 root + 它有 children，arrayMove 只移动 active 一行，
  // children 留在原 root 后面。需要把 children 跟着 active 一起搬。
  const activeChildren = baseFlat.filter(
    (it) => it.parentId === String(active.id),
  );
  const subtreeIds = new Set([String(active.id), ...activeChildren.map((c) => String(c.id))]);
  const withoutSubtree = baseFlat.filter((it) => !subtreeIds.has(String(it.id)));
  const targetIdx = withoutSubtree.findIndex((it) => it.id === over.id);

  // Insert subtree at targetIdx（如果 over 在 active 之后，targetIdx 已经反映"over 上推一格"的位置）
  const newFlat = [
    ...withoutSubtree.slice(0, targetIdx + 1),
    ...baseFlat.filter((it) => subtreeIds.has(String(it.id))),  // active + children（保序）
    ...withoutSubtree.slice(targetIdx + 1),
  ];
  onReorder(newFlat.map((it) => String(it.id)));
}
```

**或者更清晰**：把 reorder + setCategoryParent 合并为单 IPC `reorder_categories_with_hierarchy(items: Vec<{id, parent_id}>)`（03 §3.2 已讨论但未采用）。这种合并的代价是修改 `apply_reorder` 与队列协议，但语义最干净。

> **关键论据**：`apply_reorder` 在 `src-tauri/src/commands/data.rs:51-86` 的"Pass 2: append remaining items in original_order"行为决定了——任何不在 orderedIds 中的 id 都会被冲到 Vec 末尾。`removeChildrenOf` + `arrayMove` + `map(it => it.id)` 的组合在 V3（无 hierarchy）下是无害的，因为 V3 不会移除任何 row；引入 hierarchy 后这条路径失效。

### 2.3 V1 缺少"实时深度预览"（**P1 体验缺失**）

官方 Sortable Tree example 在 JSX 中：

```tsx
<SortableTreeItem
  // ...
  depth={id === activeId && projected ? projected.depth : depth}
  // ...
/>
```

**含义**：当用户拖动期间，源行（仍在 sortable 列表中、`opacity:0` 但占位）的 `depth` prop 实时跟随 `projected.depth` 变化——即**用户拖动横向偏移时，源行的 `padding-left` 实时响应**。这是用户感知到 "I am about to demote this" 的核心视觉信号。

**V1 03 §5.2 JSX**（line 1956-1960）：

```tsx
<SortableCategoryRow
  key={item.id}
  category={item}
  depth={item.depth}     // ← 仅 static depth，从 flattenedItems 来
  // ...
/>
```

V1 把 `item.depth`（拖动起始的 depth）直传，没有 active+projected 的合成。用户拖动期间，源行的 `padding-left` **不更新**——只有 drop 完成后通过 `onSetCategoryParent` 提交 + 后端返回新数据 + React 重新 flattenTree 才更新。

但同时，源行 `opacity:0`（`SortableCategoryRow.tsx:68`），所以视觉上看不到这条源行——但 V1 02 §2.7 规定 drop indicator 缩进位置随 dragOffset.x 变化。indicator 位置是另一种深度反馈，不是源行 padding-left。

**问题**：
- 02 §2.8 "缩进过渡 220ms" 在 V1 中明确是"drop 完成后"才发生，但官方 example 是"实时 follow drag"。
- 用户拖动期间唯一的深度反馈是 drop indicator 缩进（02 §2.7），但 indicator 是 2px 横线——它只显示"drop 后 row 会落在缩进 16px 处"，不显示"行本身的 padding-left"。这两者一致性较弱。

**P1 修订建议**：在 SortableCategoryRow 接收 `effectiveDepth` 而不是固定 `item.depth`：

```tsx
<SortableCategoryRow
  key={item.id}
  category={item}
  depth={
    String(item.id) === String(activeId) && projected
      ? projected.depth
      : item.depth
  }
  // ...
/>
```

这只影响**源行**（活动行）的视觉：拖动期间它仍是 `opacity:0`，所以肉眼看不到 padding-left 变化——但 cascade 让位（其他行的 transform）依赖 active 的 rect.height（不依赖 padding-left），所以无副作用。**不增加任何成本，只补回官方 example 的对称性**。

或者，主 Agent 可决定：本任务的"drop indicator 缩进 + 80ms dwell"已经表达了深度反馈，源行 padding-left 实时跟随是冗余反馈。这是一个 design 决策，不是 P0。

### 2.4 SortableCategoryRow `paddingLeft` 没有 transition（**P1 视觉 bug**）

**V1 03 §5.3**：

```ts
const baseStyle: CSSProperties = {
  transform: CSS.Translate.toString(transform),
  transition,                              // ← from useSortable, only "transform XXX ease YYY"
  opacity: isDragging ? 0 : (isInvalidDrop ? 0.5 : 1),
  paddingLeft: depth * INDENT_STEP_PX + 10,   // ← inline px
};
```

`transition` 来自 `useSortable`（`SortableCategoryRow.tsx:51-54`，V3）：

```ts
transition: {
  duration: 220,
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
},
```

dnd-kit v10 `useSortable` 内部把这个转成 `"transform 220ms cubic-bezier(0.16, 1, 0.3, 1)"`（参 `node_modules/@dnd-kit/sortable/dist/sortable.esm.js:506-517` 周围逻辑 + sortable.esm.js:377-380 的 defaultTransition）——**只过渡 transform，不过渡 padding-left**。

**问题**：02 §2.8 明确规定：

> drop 完成后，被拖项的实际 row（不是 DragOverlay）的 `padding-left` 需要从旧值过渡到新值：
> | 根 → 子（demote） | 10 → 26 px | `220 ms var(--ease-drag)` |
> | 子 → 根（promote） | 26 → 10 px | `220 ms var(--ease-drag)` |

但 V1 03 §5.3 的 baseStyle 没有 padding-left transition；drop 完成、`projected.depth` 改变（提交后端 → store 更新 → re-render）时，**padding-left 会瞬时跳变**。02 §2.8 与 V1 03 §5.3 视觉规格冲突。

**P1 修订建议**：

```ts
const baseStyle: CSSProperties = {
  transform: CSS.Translate.toString(transform),
  transition: [
    transition,                                                                  // useSortable transform
    'padding-left 220ms cubic-bezier(0.16, 1, 0.3, 1)',                          // hierarchy depth change
  ].filter(Boolean).join(', '),
  opacity: isDragging ? 0 : (isInvalidDrop ? 0.5 : 1),
  paddingLeft: depth * INDENT_STEP_PX + 10,
};
```

但要注意 — `transition` 字符串拼接多个属性时，浏览器在 `useSortable` 重写 transition 字符串时会覆盖整个属性。需要在 SortableCategoryRow 内通过 `style.transition` 显式覆盖，并保留 useSortable 给的 transform timing。

更稳的做法：在 `baseStyle` 中**始终**用静态字符串，不依赖 `transition` 变量：

```ts
const baseStyle: CSSProperties = {
  transform: CSS.Translate.toString(transform),
  transition:
    transition === undefined
      ? undefined
      : `${transition}, padding-left 220ms cubic-bezier(0.16, 1, 0.3, 1)`,
  opacity: isDragging ? 0 : (isInvalidDrop ? 0.5 : 1),
  paddingLeft: depth * INDENT_STEP_PX + 10,
};
```

并在 `index.css` `[data-sortable-list] [aria-roledescription='sortable']` 上加默认的 `transition: padding-left 220ms var(--ease-drag)` 兜底。

### 2.5 ChevronToggle 旋转动效是死代码（**P2 文档 bug**）

**V1 03 §5.5**：

```tsx
<button
  // ...
  style={{
    transition: 'transform 120ms cubic-bezier(0.16, 1, 0.3, 1)',
    transform: collapsed ? 'rotate(0deg)' : 'rotate(0deg)',  // ← 都是 0deg！
  }}
>
  {collapsed ? (
    <ChevronRight size={10} className="text-[#A1A1AA]" />
  ) : (
    <ChevronDown size={10} className="text-[#A1A1AA]" />
  )}
</button>
```

注释又说：
> Chevron rotation 通过**切换 icon component**而不是 `transform: rotate()` 实现（lucide-react 提供两个不同 icon）—— 这避免 transform 与 row 的 transform 冲突；transition 仅用于切换瞬间的 opacity / color 微变（如 hover 跟随 row 的 #71717A）。

**问题**：
1. `style.transition: 'transform 120ms ...'` 与"通过切换 icon 而不是 transform: rotate"自相矛盾。
2. `transform: collapsed ? 'rotate(0deg)' : 'rotate(0deg)'` — 两个分支都是 0deg，写错了；如果意图是"通过 icon 切换实现旋转"，则应**完全删除** style.transform 与 style.transition。
3. 02 §2.4 chevron rotation timing 规定 "120 ms var(--ease-drag)（与"Show X more"切换节奏一致；与项目 `--duration-drag-snap = 80ms` 不同——chevron 是 disclosure 不是磁吸）"，意指 transition 应作用于 transform: rotate(0deg ↔ 90deg)。

**实际语义冲突**：
- 02 §2.4 的语义是"chevron 旋转 transition 120ms"——这暗示 chevron 应该是**单一 lucide-react icon + rotate transform 切换 0deg ↔ 90deg**，而不是 ChevronRight ↔ ChevronDown 两个 icon 切换（后者根本无 transition 效果，因为 React 卸载/挂载不同 component）。
- V1 03 §5.5 的实现切换 `<ChevronRight>` 与 `<ChevronDown>` — 这是即时切换，**没有任何旋转动画**。

**P2 修订**（两选一，需 designer / 主 Agent 决策）：

**方案 A — 单 icon + transform rotate**（与 02 §2.4 设计语义一致）：

```tsx
<button>
  <ChevronRight
    size={10}
    className="text-[#A1A1AA]"
    style={{
      transition: 'transform 120ms cubic-bezier(0.16, 1, 0.3, 1)',
      transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
    }}
  />
</button>
```

**方案 B — 两个 icon 即时切换**（V1 实际写法，需更新 02 §2.4）：

把 02 §2.4 的 "chevron rotation timing 120ms" 改为 "chevron icon 即时切换"，并删除 V1 03 §5.5 的死 transition / transform。

**推荐方案 A**：与 02 设计意图一致 + 用户能感知到 "chevron 旋转"是更连续的物理感（与 V3 设计哲学契合）。

### 2.6 dwell timer 的清理路径覆盖完整（✅ 正确）

**V1 03 §5.2 handleDragMove + handleDragEnd**：

- handleDragMove：`newOverId !== dwellOverIdRef.current` 时清旧 timer + 启新 timer ✅
- handleDragEnd：`if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current)` ✅

**未覆盖**：
- `handleDragCancel`（Esc 按下）— 当前 V1 03 §5.2 描述的 handleDragCancel 是 V3 版本（仅 `setActiveId(null) + setDropAnimationConfig(CATEGORY_DROP_ANIMATION) + onDragEnd()`），**没有清 dwell timer**。

**P1 修订**：在 handleDragCancel 中也加 dwell 清理：

```ts
const handleDragCancel = () => {
  if (dwellTimerRef.current) {
    clearTimeout(dwellTimerRef.current);
    dwellTimerRef.current = null;
  }
  dwellOverIdRef.current = null;
  setDwellPassed(false);
  setActiveId(null);
  setOverId(null);
  setOffsetLeft(0);
  setDropAnimationConfig(CATEGORY_DROP_ANIMATION);
  onDragEnd();
};
```

否则：用户 drag start → over a row → 等 80ms → setDwellPassed(true) → 按 Esc → handleDragCancel 清 activeId 但 dwellPassed 还是 true → 下一次 drag 一开始 projected 立即生效（跳过 80ms dwell 节奏）。

### 2.7 `Math.round(dragOffset / indentationWidth)` 的边界行为（**P1 体验问题**）

V1 03 §5.1.A `getProjection`：

```ts
const dragDepth = Math.round(dragOffsetX / indentationWidth);
```

`indentationWidth = 16px`。当 `dragOffsetX = 8px` → `Math.round(8/16) = Math.round(0.5) = 1`（JavaScript 用 banker's rounding 处理 0.5：`Math.round(0.5) === 1`）。

**问题**：02 §6.3 说 "12 px X 阈值 + 80ms dwell 才触发深度变化"。但 `Math.round` 的实际触发阈值是 8px（depth 跳到 1 的中点）：
- dragOffsetX < 8px → projectedDepth = 0
- dragOffsetX >= 8px → projectedDepth = 1（+dwell 80ms 才进入 isInvalid / drop indicator 缩进）

如果 02 §6.3 的"12 px 阈值"指**视觉反馈出现时机**，那 V1 03 §5.2 的 `dwellPassed` 80ms gate 控制时机；但 12px 数值与 `getProjection` 的 8px 实际边界不一致。

**两种解读**：

**解读 A — 12px 数值就是 round 阈值**：用户偏移 < 12px 时不应触发深度变化。则 `getProjection` 应改为：

```ts
const ABS_X_THRESHOLD = 12;  // px
const dragDepth =
  Math.abs(dragOffsetX) < ABS_X_THRESHOLD
    ? 0
    : Math.sign(dragOffsetX);  // 1 or -1
```

**解读 B — 12px 是 dwell pre-condition**：当 dragOffsetX < 12px 时不启动 dwell timer（早 abort），见 V1 03 §5.2 handleDragMove，dwell 仅在 `newOverId` 变化时启动，不依赖 dragOffsetX 阈值。

**V1 现状**：解读 B（dwell 与 dragOffsetX 解耦），即 round 阈值仍是 8px（数学上 Math.round 必然），但视觉反馈通过 dwell 的 80ms 延迟"软化"。

**P1 风险**：用户慢速横向拖到 dragOffsetX = 9px 后停留 80ms → projected.depth = 1（Math.round(9/16) = 1）→ drop indicator 缩进 → 02 §6.3 说"12 px 阈值"但实际是"~8 px 阈值 + 80ms dwell"。这是数值与设计 spec 的不一致。

**修订建议**（解读 A 更接近 02 §6.3 数值意图）：

```ts
const ABS_X_THRESHOLD_PX = 12;
const dragDepth =
  Math.abs(dragOffsetX) < ABS_X_THRESHOLD_PX
    ? 0
    : Math.sign(dragOffsetX) * Math.min(MAX_DEPTH, Math.round(Math.abs(dragOffsetX) / indentationWidth));
```

> 这一项可作为 03 V2 的修订点，主 Agent 决策。或者 02 §6.3 的"12px"重新表述为"约 8-12px 之间触发"，与 round 数学一致。

### 2.8 `over.id` 与 `flattenedItems` 之间的同步竞态（**P1 潜在 bug**）

**V1 03 §5.2 useMemo flattenedItems**：

```ts
const flattenedItems = useMemo(() => {
  const baseFlat = flattenTree(categories, collapsedIds);
  if (activeId === null) return baseFlat;
  return removeChildrenOf(baseFlat, [activeId]);
}, [categories, collapsedIds, activeId]);
```

**onDragMove**：

```ts
setOverId(event.over?.id ?? null);
```

**onDragOver**: 实际上 `event.over` 来自 dnd-kit 内部 collision detection，依赖 `SortableContext.items` 与 droppable rects。`SortableContext.items = sortedIds = flattenedItems.map(it => it.id)`。

**问题**：
- 当 user 把 activeId 拖出 over → re-enter → over 计算依赖最新的 droppableRects；如果 `removeChildrenOf` 把 active 子类移除，**子类的 droppable container 会被 unmount**（dnd-kit 的 droppable 注册依赖 React 组件 mount，参 `core.esm.js` useDroppable hook）；下次 collision 不会 hit 这些子类。
- 这其实是**期望行为**（防止 active 父类拖入自己的子类形成 cycle），但 `getProjection` 中查找 `previousItem` / `nextItem` 时只能看到不含 active 子类的 flat list — 这影响 `parentId` 推断（02 §6.3 + r2 §2.3 example pattern 假设 baseFlat 是干净 flat，所以这是 OK 的）。
- 但是 onDragEnd 时 `flattenedItems` 仍是去除 active 子树后的 list — `arrayMove(flattenedItems, ...)` 在 §2.2 已经分析过的"backend Vec 顺序错乱"问题。

**结论**：onDragOver / over.id 路径**没有竞态**（dnd-kit 同步处理 droppable lifecycle），但 onDragEnd reorder 路径有问题（已在 §2.2 标 P0）。

### 2.9 `enqueueReorder` 串行队列 IPC 顺序（✅ 正确）

V1 03 §4.3 `setCategoryParent` 用 `enqueueReorder` 队列；§4.4 `reorderCategories` V3 已有同队列。两者共用同一 reorderQueue 全局变量（`appStore.ts:19`）—**同一队列保证顺序**。

V1 03 §3.3.5 + §4.3 的 onDragEnd 路径：先 `setCategoryParent(id, parentId)`，后 `reorderCategories(orderedIds)`。两次 enqueue → 队列保证 set_parent 完成后才 reorder。OK。

但 §5.2 handleDragEnd 实际写法是：

```ts
if (parentChanged) {
  onSetCategoryParent(String(active.id), finalParentId);
}
if (orderChanged) {
  // ...
  onReorder(newFlat.map((it) => String(it.id)));
}
```

`onSetCategoryParent` 与 `onReorder` 不 await（fire-and-forget）。这是 V3 现状（reorderCategories 也是 fire-and-forget，参 `MainLayout.tsx:483-492`）。两次同步调用 enqueue → 队列内串行 → OK。

✅ 正确。

---

## 3. TypeScript 类型安全核查

### 3.1 `Category.parentId?: string` 与 Rust `parent_id: Option<String>` 兼容（✅ 正确）

V1 03 §2.1：

```rust
pub struct Category {
    // ...
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
}
```

```ts
export interface Category {
  // ...
  parentId?: string;
}
```

`#[serde(rename_all = "camelCase")]` 全局生效 → Rust `parent_id` ↔ TS `parentId` 自动映射。

`#[serde(default)]` on `Option<String>` → 旧 data.json 反序列化 `parent_id` 缺失 → `None`（OK）；新 root category 序列化 `None` → JSON 不含 `parentId` key（`skip_serializing_if`）→ 旧前端 binary 装新数据可读。

`Option<String>` ↔ `string | undefined`：TypeScript 的 `?:` 即 `string | undefined`，与 Rust 序列化为 `null` 略不同（serde 对 None 序列化为 `null` 还是省略 key 取决于 `skip_serializing_if` —— 已正确配置）。tauri 反序列化把 null/missing 都当 undefined ✅。

✅ 类型安全 OK。

### 3.2 `Skill.categoryId?: string` / `McpServer.categoryId?: string` 双字段（✅ 正确）

V1 03 §2.2：保留 `category: string`（cached display）+ 新增 `categoryId?: string`（SoT）。前端 store 在迁移期 dual-read（`s.categoryId ? idSet.has(s.categoryId) : nameSet.has(s.category)`）。

**类型**：`Skill.categoryId?: string` — `string | undefined`，与现有 ClaudeMdFile.categoryId 模式一致。✅

### 3.3 `FlattenedCategory` 类型扩展正确（✅ 正确）

V1 03 §5.1.A：

```ts
export interface FlattenedCategory extends Category {
  parentId: string | null;     // ← override Category.parentId? to non-optional, with `null` for root
  depth: number;
  index: number;
  hasChildren: boolean;
  collapsed: boolean;
}
```

**潜在 P2**：`Category.parentId?: string`（undefined 表 root）vs `FlattenedCategory.parentId: string | null`（null 表 root）—— 两种 root 表示不一致：
- Category：`parentId: undefined`（key 不存在或值是 undefined）
- FlattenedCategory：`parentId: null`（显式 null）

这在 TypeScript 是合法的（`extends` + `parentId: string | null` overrides `parentId?: string`），但需要 flattenTree 显式：

```ts
result.push({
  ...cat,
  parentId: null,    // ← 显式 null（不是 cat.parentId ?? null，因为 cat.parentId 未在原对象上）
  depth: 0,
  // ...
});
```

V1 03 §5.1.A 第 1502-1507 行确实是 `parentId: null` 而非 `parentId: undefined` ✅。但 `getProjection` 内部的 `getParentId()` 返回 `string | null`，与 `setCategoryParent(id, newParentId: string | null)` 签名匹配 ✅。

### 3.4 KeyboardCoordinateGetter 签名兼容（与 §2.1 P0 联动）

dnd-kit 6.3.1 `KeyboardCoordinateGetter` 期待返回 `Coordinates | void`。V1 03 §5.1.B `makeTreeKeyboardCoordinates` 返回的函数：

- horizontal 路径：返回 `{...currentCoordinates, x: ...}` 或 `undefined` ✅
- 非 horizontal：调用 `sortableKeyboardCoordinates(event, args)` → 返回 `Coordinates | undefined` ✅
- default fallthrough：返回 `undefined` ✅

类型 OK，但 §2.1 已标 P0 — `getProjection(items, active.id, over.id, currentCoordinates.x, indentationWidth)` 把 `currentCoordinates.x` 传作 `dragOffset` 参数语义错误（运行时不会类型错，TS 看到 `number` 兼容 `number`）。这是**类型安全无问题、运行时语义错误**的典型案例。

---

## 4. Frontend store 一致性核查

### 4.1 `categoriesVersion` 协议覆盖完整（✅ 正确）

V1 03 §4.1：所有 hierarchy mutator bump version：
- `addCategory` 增 parentId 参数后 — `set` 内 bump（§4.2 line 980-983）✅
- `setCategoryParent` — Stage 1 optimistic + Stage 2 IPC 都 bump（§4.3 line 1024-1027, 1044-1048）✅
- `deleteCategory` cascade-promote — V3 现状 bump 不变（`appStore.ts:296-300`）✅
- `reorderCategories` — V3 现状 bump 不变 ✅

✅ V3 race protection 在 hierarchy 下仍生效。

### 4.2 dual-write 路径（✅ 正确，P1 改进点）

V1 03 §4.5 + §4.6：autoClassify 与 updateSkillCategory 都做 dual-write `category` + `categoryId`。

**P1 改进**：dual-write 期间，如果 `categoryName` 在 categories 中找不到（race condition：autoClassify 创建 category 后立刻又被 reorder/delete），`categoryId` 会是 `undefined`。V1 03 §4.5 line 1130-1132：

```ts
const updatedCategories = useAppStore.getState().categories;
for (const result of results) {
  // ...
  const targetCategoryId = updatedCategories.find(
    (c) => c.name === result.suggested_category,
  )?.id;
  // ...
}
```

`updatedCategories` 是 autoClassify 流程开头的 snapshot；中间一系列 await addCategory 可能让真实 store 状态与 snapshot 偏离。`useAppStore.getState().categories` 调用一次后不会随 store update 改变（getState 是同步快照）—— 这是 OK 的，但意味着：

1. 第一个新 category 创建（addCategory await 完成 → store updated）
2. 取 snapshot — store 已经包含第一个新 category ✅
3. for-loop 创建第二个 category — addCategory await 完成 → store updated（第二个）
4. 但 `updatedCategories` 仍是 step 2 的 snapshot — 不含第二个新 category
5. 如果某 result.suggested_category 是第二个新 category 的 name → `find()` 返回 undefined → categoryId = undefined ❌

**P1 修订**：

```ts
for (const result of results) {
  const skill = skills.find((s) => s.id === result.id);
  if (skill) {
    // 实时取 categories（不在 loop 外预 snapshot）
    const cats = useAppStore.getState().categories;
    const targetCategoryId = cats.find(
      (c) => c.name === result.suggested_category,
    )?.id;
    await safeInvoke('update_skill_metadata', {
      skillId: result.id,
      category: result.suggested_category,
      categoryId: targetCategoryId,
      // ...
    });
  }
}
```

每次循环重取 store snapshot，确保看到最新创建的 categories。

### 4.3 `collectDescendantIds` helper 对 max depth=2 假设正确（✅ 正确）

V1 03 §4.7：

```ts
export function collectDescendantIds(
  rootCategoryId: string,
  allCategories: Category[],
): Set<string> {
  const result = new Set<string>([rootCategoryId]);
  for (const cat of allCategories) {
    if (cat.parentId === rootCategoryId) {
      result.add(cat.id);
    }
  }
  return result;
}
```

**正确性**：max depth=2 → 子类不会有自己的 children → 一次扫描就能穷尽 descendants ✅
**注释说"如果未来允许 depth > 2，递归 collectDescendantIds(cat.id, allCategories) 即可"** — 这是 future-proof 注解，good ✅

### 4.4 V3 `applyReorder` 在引入 hierarchy 后仍正确（✅ 正确）

`appStore.ts:29-52` `applyReorder` 是 generic over `{ id: string }` — 新字段 `parentId` 不影响 generic constraint ✅。但与 §2.2 P0 联动：frontend `applyReorder(snapshot, orderedIds)` 与 backend `apply_reorder` 都把 unmentioned items 追加到末尾——这条路径在 hierarchy 下需配合 §2.2 的修订才能保持 children 紧跟 parent。

---

## 5. P0 / P1 / P2 问题汇总

### P0（前端 stop-ship 级 — V3 不变量破坏 / dnd-kit API 误用 / 设计 bug）

**P0-1：treeKeyboardCoordinates 把 `currentCoordinates.x` 当 `dragOffsetX` 用，且缺 SensorContext ref 通道**（详 §2.1）

- **影响**：键盘 ←/→ promote/demote 失效（实际不会响应方向键，因为 `getProjection` 用绝对坐标计算 dragDepth = round(big_number/16)，瞬时 clamp 到 MAX_DEPTH=1，停留在边界状态不响应）。
- **WCAG 2.5.7 Dragging Movements Alternative 失败**：键盘 hierarchy 操作不可达。
- **必修订**：引入 `TreeSensorContextRef = MutableRefObject<{items, offset}>`，在 SortableCategoriesList 内 useRef + useEffect 同步；makeTreeKeyboardCoordinates 接 ref 而非 callback；用 `contextRef.current.offset` 作为 getProjection 第 4 参；显式 `event.preventDefault()`。完整 patch 见 §2.1。
- **第三方源码引证**：`node_modules/@dnd-kit/core/dist/sensors/keyboard/types.d.ts:18-22` + GitHub `clauderic/dnd-kit/stories/3 - Examples/Tree/keyboardCoordinates.ts` + `SortableTree.tsx`。

**P0-2：onDragEnd 的 `arrayMove(flattenedItems, ...)` 把 active 父类的 children 散到 backend Vec 末尾**（详 §2.2）

- **影响**：每次拖动 root（reorder root A 与 root B），children 被冲到 backend Vec 末尾，破坏"children 紧跟 parent"的拓扑。
- **可见性**：UI 重渲染时 flattenTree 仍按 parentId 把 children 还原到父类下面，所以**视觉上看不出 bug**——但 backend Vec 顺序长期错乱，影响任何依赖 Vec 顺序的 reasoning（如 backend 测试断言、跨 worktree 文件比对、未来 export/import 路径）。
- **必修订**：handleDragEnd 中重新计算 `baseFlat`（不去除 children），把 active + active.children 作为 subtree 整体 splice 到 over 位置；或合并 reorder + setCategoryParent 为单 IPC `reorder_categories_with_hierarchy(items: Vec<{id, parent_id}>)`（更彻底但改动面更大）。完整 patch 见 §2.2。
- **关键论据**：`src-tauri/src/commands/data.rs:51-86` apply_reorder 的"Pass 2: append remaining items in original_order"行为。

### P1（不阻塞 ship，但影响体验或 spec 一致性）

**P1-1：源行 padding-left 没有实时跟随 projected.depth**（详 §2.3）

- **影响**：与官方 dnd-kit Sortable Tree example 的"实时深度预览"模式不一致；用户拖动期间，drop indicator 缩进表达深度，但行本身的 padding-left 不变。
- **修订**：JSX 中 `depth={String(item.id) === String(activeId) && projected ? projected.depth : item.depth}`。
- **优先级**：P1，因为源行 `opacity:0` 视觉看不到，但与 02 §2.8 的"缩进过渡"语义匹配度提升。

**P1-2：SortableCategoryRow `paddingLeft` 没有 transition 字符串**（详 §2.4）

- **影响**：drop 完成、depth 变化（重渲染）时，padding-left 瞬时跳变，与 02 §2.8 "220ms cubic-bezier(0.16, 1, 0.3, 1) 缩进过渡"规格冲突。
- **修订**：在 `baseStyle.transition` 中追加 `padding-left 220ms cubic-bezier(0.16, 1, 0.3, 1)`，或在 `[data-sortable-list] [aria-roledescription='sortable']` 加 default transition。完整 patch 见 §2.4。

**P1-3：handleDragCancel 没有清 dwell timer**（详 §2.6）

- **影响**：用户 drag → 等 80ms 触发 dwellPassed → Esc → handleDragCancel 不清 timer/dwellPassed → 下一次 drag 一开始 projected 立即生效（跳过 80ms dwell 节奏）。
- **修订**：handleDragCancel 中加 dwell 清理。完整 patch 见 §2.6。

**P1-4：`Math.round(dragOffset / 16)` 实际阈值是 8px 不是 02 §6.3 声称的 12px**（详 §2.7）

- **影响**：02 §6.3 设计意图与 V1 03 §5.1.A 实际阈值数值不一致。
- **修订**：选解读 A — 在 getProjection 内显式 `Math.abs(dragOffsetX) < ABS_X_THRESHOLD = 12 ? 0 : Math.sign(...)`；或选解读 B — 02 §6.3 的"12 px 阈值"重新表述为"约 8 px 触发 + 80ms dwell"，与 round 数学一致。需主 Agent 决策。

**P1-5：autoClassify dual-write 路径取 categoryId 用 outer snapshot 而非循环内实时**（详 §4.2）

- **影响**：autoClassify 创建多个新 category 时，第二个之后的 result 拿不到 categoryId（snapshot 是第一个 await 后的快照）。
- **修订**：把 `useAppStore.getState().categories` 移到 for-loop 内每次重取。

**P1-6：`updateSkillCategory(id, name)` 签名不变 + 内部 dual-write 是过渡期妥协**（V1 03 §4.6）

- **影响**：现有调用方传 name，store 内反查 id，后端 dual-write — 这条路径可能在 race 下（category 改名）导致 categoryId 引用 stale category。
- **修订建议**（v2 候选）：长期改为 `updateSkillCategory(id, categoryId)`，store 内反查 name 写 cached display。但本 V1 范围内 V1 03 决策是"保留同签名"，主 Agent 已锁定。**P1 仅记录**。

### P2（设计/文档清理）

**P2-1：ChevronToggle 旋转动效自相矛盾**（详 §2.5）

- **影响**：02 §2.4 规定 chevron rotation 120ms transition；V1 03 §5.5 实现是切换 icon component（无 transition），且 style.transform 两个分支都是 0deg（写错）。两者语义矛盾。
- **修订**：选方案 A — 单 icon + transform: rotate(0deg ↔ 90deg) 配 120ms transition（与 02 设计意图一致）；或方案 B — 02 改"icon 即时切换" + V1 03 §5.5 删 transform/transition。推荐方案 A。

**P2-2：`Category.parentId?` (undefined for root) vs `FlattenedCategory.parentId: string | null`（null for root）双重 root 表示**（详 §3.3）

- **影响**：开发者需记忆两种 root 表示——Category 序列化是省略 key（`skip_serializing_if`），FlattenedCategory 内部用 null。可能导致 `=== null` vs `=== undefined` 比较 bug。
- **修订**：在 collectDescendantIds + 任何 Category[] 操作中显式 `cat.parentId === rootCategoryId`（V1 03 已正确，因为 `undefined === string` always false，所以 root cats 在该比较下不会误中），但需在 04_implementation_plan 中加 lint rule / type guard 防止后续误用。**P2 仅文档警示**。

**P2-3：announcements 中 hierarchy 上下文的传递路径模糊**（V1 03 §5.6）

- V1 03 §5.6 line 2167-2170：`accessibility={{ announcements: makeAnnouncements(categories, 'category', { collapsedIds, parentMap: ... }) ... }}`
- `parentMap` 是怎么构造的？应在哪里维护？V1 没显式说。
- **修订**：04_implementation_plan 中明确：`parentMap` 在 SortableCategoriesList 内 useMemo 从 categories.filter(c => c.parentId).reduce(...) 构造；onDragMove 时实时更新（基于 projected）。

---

## 6. 赞赏点

1. **V3 不变量保留逐项核对极其严格**（02 §7 22 项 + 03 §12 23 项）：每条都对应到 codebase 一手位置 + V1 改造下的具体处理。这是项目级"零回归"承诺的硬证据。
2. **dnd-kit Sortable Tree example 的源码事实掌握深刻**（R2 §1-§2 + 03 §6.1-§6.5）：所有声称都 link 到 node_modules:行号 或 GitHub raw URL；遵守 `verify-third-party-behavior-firsthand.md` 严格。
3. **库选型零新依赖**（03 §1）：明确说明为什么不引入 `dnd-kit-sortable-tree` 等 wrapper——保留 V3 已落地组件改造路径不冲突。
4. **DATA_MUTEX grep 全 callsite 表**（03 §3.1）：体现 `grep-before-enumerate-shared-resource.md` 规则；新 mutator `set_category_parent` / `migrate_*` 都加锁；`update_skill_metadata` / `update_mcp_metadata` 现状不持锁标 P1 跨 PR 不擅自越界。
5. **D5 = B-1（父类不可成子）的 isInvalid 标志清晰**（03 §5.1.A getProjection 第 1601-1604 行）：在投影层标记非法，UI 层据此显示 cursor not-allowed + opacity 0.5（02 §2.14）+ onDragEnd skip IPC（03 §5.2 line 1858-1860）—— 三处一致。
6. **chevron click 与 row click hit-target 分离**（02 §6.4 + 03 §5.5）：data-no-dnd + onMouseDown stopPropagation + onClick stopPropagation 双保险，与 V3 ColorPicker 同模式。
7. **dual-write `category` + `category_id` 的 backward compat 设计**（03 §2.2 + §4.5 + §4.6）：旧 binary 装新数据可读、新 binary 装旧数据可读、迁移失败可 graceful degrade、所有写入路径都同时维护两字段。这条路径的工程稳健性远高于"硬切到 categoryId"方案。
8. **enqueueReorder 串行队列对 hierarchy 改动同样适用**（03 §4.3 line 1030 注释 "shared queue (serial with reorderCategories)"）：保证用户连续操作（先改父级再 reorder）按提交顺序执行。
9. **prefers-reduced-motion 全套尊重 + hierarchy selector 追加**（02 §2.18 + 03 §7.4）：chevron / children-of / depth row 三个 selector 都在 reduced-motion 下 transition: none。
10. **`removeChildrenOf` + flattenTree 模式直接抄自官方 example**（03 §5.1.A line 1532-1545）：注释明示"Mirrors dnd-kit Sortable Tree example pattern (R2 §2.5)"——零自研行为，最大化生产验证。

---

## 7. 评分

**总评：83 / 100**

**评语**：架构决策与 V3 不变量保留度世界级（24 项不变量逐项核对、零新依赖、严格遵守 verify-third-party-behavior-firsthand），但实施层有 2 个 P0 bug：键盘协调器把 `currentCoordinates.x` 当 dragOffset 误用（直接破坏 WCAG 2.5.7）、onDragEnd 的 arrayMove(flattenedItems, ...) 在 hierarchy 下把 children 散到 backend Vec 末尾。两处都是"按官方 example 修改"即可修复的 mechanical bugs，但必须在 V2 中修订才能落地。其余 5 项 P1 + 3 项 P2 为视觉一致性 / 体验微调 / 文档清理，不阻塞 ship 但建议在 04_implementation_plan 任务卡中显式列出。

**评分细分**：
- V3 不变量保留：24/24 项 = 100%（无破坏，仅 #17 keyboard 有实施 bug）→ 满分
- dnd-kit API 用法：60/100（P0-1 误用 KeyboardCoordinateGetter 参数语义、P0-2 误用 arrayMove 在 hierarchy flat list 上）→ -40
- TypeScript 类型安全：95/100（dual root 表示是 P2 不影响安全）→ -5
- Frontend store 一致性：90/100（autoClassify dual-write snapshot 时机是 P1）→ -10
- 视觉/动效与 02 设计 spec 一致性：75/100（P1-1 源行实时 depth + P1-2 padding transition + P2-1 chevron rotation 三处与 02 不一致）→ -25
- 类聚合 / 折叠态 / hit-target 分离：100/100 → 满分
- 文档严谨性（authority ranking + cascade footprint + grep 表）：100/100 → 满分

加权汇总（V3 不变量 25% + dnd-kit API 25% + TS 类型 10% + store 一致 15% + 视觉 spec 一致 15% + 其他 10%）：

`100×0.25 + 60×0.25 + 95×0.10 + 90×0.15 + 75×0.15 + 100×0.10 = 25 + 15 + 9.5 + 13.5 + 11.25 + 10 = 84.25` → 取整 83。

---

## 8. 要求 V2 修订

**是**（true）。两条 P0 必修：

1. **P0-1**：`treeKeyboardCoordinates` 必须改用 `MutableRefObject<{items, offset}>` 模式（参 §2.1 完整 patch + GitHub `clauderic/dnd-kit/stories/3 - Examples/Tree/keyboardCoordinates.ts` 一手代码模板）。
2. **P0-2**：`onDragEnd` 的 reorder 逻辑必须显式处理 active subtree 紧跟父类（参 §2.2 完整 patch；或合并 reorder + setCategoryParent 为单 IPC `reorder_categories_with_hierarchy`）。

P1 / P2 由主 Agent 决定是否纳入 V2（建议 P1-1 / P1-2 / P1-3 / P1-5 一并修订，P1-4 / P1-6 / P2-* 可延后）。

---

## 9. Patch List（供 03 V2 / 04 V1 直接采纳）

### Patch 1（必修 — P0-1）— `src/components/sidebar/dnd/treeKeyboardCoordinates.ts` 重写

将 03 §5.1.B 替换为：

```ts
import type { MutableRefObject } from 'react';
import { KeyboardCode } from '@dnd-kit/core';
import type { KeyboardCoordinateGetter } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { getProjection, INDENT_STEP_PX, MAX_DEPTH, type FlattenedCategory } from './treeUtilities';

const horizontal: string[] = [KeyboardCode.Left, KeyboardCode.Right];

export interface TreeSensorContext {
  items: FlattenedCategory[];
  offset: number;
}
export type TreeSensorContextRef = MutableRefObject<TreeSensorContext>;

export function makeTreeKeyboardCoordinates(
  contextRef: TreeSensorContextRef,
  indentationWidth: number = INDENT_STEP_PX,
): KeyboardCoordinateGetter {
  return (event, args) => {
    const { currentCoordinates, context: { active, over } } = args;

    if (!horizontal.includes(event.code)) {
      return sortableKeyboardCoordinates(event, args);
    }

    if (!active?.id || !over?.id) return undefined;

    event.preventDefault();

    const { items, offset } = contextRef.current;
    const projection = getProjection(items, active.id, over.id, offset, indentationWidth);

    switch (event.code) {
      case KeyboardCode.Left:
        if (projection.depth > 0) {
          return { ...currentCoordinates, x: currentCoordinates.x - indentationWidth };
        }
        return undefined;
      case KeyboardCode.Right:
        if (projection.depth < MAX_DEPTH && !projection.isInvalid) {
          return { ...currentCoordinates, x: currentCoordinates.x + indentationWidth };
        }
        return undefined;
      default:
        return undefined;
    }
  };
}
```

并更新 `SortableCategoriesList.tsx` 的 sensor wiring（03 §5.2 patch）：

```tsx
const sensorContextRef = useRef<TreeSensorContext>({
  items: flattenedItems,
  offset: offsetLeft,
});
useEffect(() => {
  sensorContextRef.current = { items: flattenedItems, offset: offsetLeft };
}, [flattenedItems, offsetLeft]);

const [coordinateGetter] = useState(() =>
  makeTreeKeyboardCoordinates(sensorContextRef, INDENT_STEP_PX),
);

const sensors = useSensors(
  useSensor(CustomMouseSensor, { activationConstraint: { distance: 4 } }),
  useSensor(KeyboardSensor, { coordinateGetter }),
);
```

### Patch 2（必修 — P0-2）— `SortableCategoriesList.tsx` handleDragEnd reorder 路径

将 03 §5.2 handleDragEnd 中的 reorder 路径改为：

```ts
if (orderChanged) {
  // 重新计算 baseFlat（不去除 children），保证 children 紧跟父类
  const baseFlat = flattenTree(categories, collapsedIds);

  // active 是 root 且有 children → 整子树搬迁；child / 无 children root → 单行搬迁
  const activeChildIds = baseFlat
    .filter((it) => it.parentId === String(active.id))
    .map((it) => String(it.id));
  const subtreeIds = new Set([String(active.id), ...activeChildIds]);

  const withoutSubtree = baseFlat.filter((it) => !subtreeIds.has(String(it.id)));
  const overIdxAfterRemove = withoutSubtree.findIndex((it) => it.id === over.id);
  if (overIdxAfterRemove === -1) return;

  // 决定 splice 位置：active 在 over 之前 → 插到 over 之后；反之插到 over 之前
  const baseActiveIdx = baseFlat.findIndex((it) => it.id === active.id);
  const baseOverIdx = baseFlat.findIndex((it) => it.id === over.id);
  const insertIdx =
    baseActiveIdx < baseOverIdx ? overIdxAfterRemove + 1 : overIdxAfterRemove;

  const subtreeInOriginalOrder = baseFlat.filter((it) => subtreeIds.has(String(it.id)));
  const newFlat = [
    ...withoutSubtree.slice(0, insertIdx),
    ...subtreeInOriginalOrder,
    ...withoutSubtree.slice(insertIdx),
  ];
  onReorder(newFlat.map((it) => String(it.id)));
}
```

或（更彻底但改动面大）合并 reorder + setCategoryParent 为单 IPC：

```rust
// src-tauri/src/commands/data.rs — 新增
#[tauri::command]
pub fn reorder_categories_with_hierarchy(
    items: Vec<CategoryReorderEntry>,  // ordered + parent_id
) -> Result<Vec<Category>, String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;
    // validate hierarchy invariants
    // apply order + parent_id changes in one shot
    // ...
    Ok(data.categories.clone())
}
```

主 Agent 决定走 Patch 2.A（subtree splice）还是 2.B（合并 IPC）。Patch 2.A 改动小、不破坏 V3 reorder 队列协议；Patch 2.B 语义更干净但改动面大。**推荐 Patch 2.A** 作 V2 修订点。

### Patch 3（建议 — P1-1）— `SortableCategoriesList.tsx` JSX 实时深度

将 03 §5.2 JSX 中 `depth={item.depth}` 改为：

```tsx
<SortableCategoryRow
  key={item.id}
  category={item}
  depth={
    String(item.id) === String(activeId) && projected
      ? projected.depth
      : item.depth
  }
  // ...
/>
```

与官方 dnd-kit Sortable Tree example `SortableTree.tsx` line 213 对齐。

### Patch 4（建议 — P1-2）— `SortableCategoryRow.tsx` paddingLeft transition

将 03 §5.3 baseStyle 的 transition 改为：

```ts
const baseStyle: CSSProperties = {
  transform: CSS.Translate.toString(transform),
  transition:
    transition === undefined
      ? 'padding-left 220ms cubic-bezier(0.16, 1, 0.3, 1)'
      : `${transition}, padding-left 220ms cubic-bezier(0.16, 1, 0.3, 1)`,
  opacity: isDragging ? 0 : (isInvalidDrop ? 0.5 : 1),
  paddingLeft: depth * INDENT_STEP_PX + 10,
};
```

### Patch 5（建议 — P1-3）— `SortableCategoriesList.tsx` handleDragCancel 清 dwell

将 03 §5.2 handleDragCancel 改为：

```ts
const handleDragCancel = () => {
  if (dwellTimerRef.current) {
    clearTimeout(dwellTimerRef.current);
    dwellTimerRef.current = null;
  }
  dwellOverIdRef.current = null;
  setDwellPassed(false);
  setActiveId(null);
  setOverId(null);
  setOffsetLeft(0);
  setDropAnimationConfig(CATEGORY_DROP_ANIMATION);
  onDragEnd();
};
```

### Patch 6（建议 — P1-5）— autoClassify dual-write loop snapshot

将 03 §4.5 + skillsStore.ts:391-401 改为：

```ts
for (const result of results) {
  const skill = skills.find((s) => s.id === result.id);
  if (skill) {
    const cats = useAppStore.getState().categories;     // ← 移到 loop 内
    const targetCategoryId = cats.find(
      (c) => c.name === result.suggested_category,
    )?.id;
    await safeInvoke('update_skill_metadata', {
      skillId: result.id,
      category: result.suggested_category,
      categoryId: targetCategoryId,
      tags: result.suggested_tags,
      icon: result.suggested_icon,
    });
  }
}
```

### Patch 7（建议 — P2-1）— ChevronToggle 旋转

将 03 §5.5 ChevronToggle 改为单 icon + transform: rotate（与 02 §2.4 一致）：

```tsx
import { ChevronRight } from 'lucide-react';

interface ChevronToggleProps {
  collapsed: boolean;
  onToggle: () => void;
  categoryName: string;
}

export function ChevronToggle({ collapsed, onToggle, categoryName }: ChevronToggleProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle();
  };
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <button
      type="button"
      data-no-dnd="true"
      data-chevron="true"
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      aria-label={`Toggle ${categoryName} children`}
      aria-expanded={!collapsed}
      className="w-[16px] flex items-center cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[#0063E1]"
    >
      <ChevronRight
        size={10}
        className="text-[#A1A1AA]"
        style={{
          transition: 'transform 120ms cubic-bezier(0.16, 1, 0.3, 1)',
          transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
        }}
      />
    </button>
  );
}
```

### Patch 8（建议 — P2-3）— announcements parentMap 显式构造

在 SortableCategoriesList 内：

```tsx
const parentMap = useMemo(() => {
  const m = new Map<string, string>();   // childId → parentName
  for (const cat of categories) {
    if (cat.parentId) {
      const parent = categories.find((c) => c.id === cat.parentId);
      if (parent) m.set(cat.id, parent.name);
    }
  }
  return m;
}, [categories]);

// 在 DndContext 中：
accessibility={{
  announcements: makeAnnouncements(categories, 'category', { parentMap, collapsedIds }),
  screenReaderInstructions: sidebarScreenReaderInstructions,
}}
```

---

## 10. Confidence + Takeaway

**Confidence**: **88 / 100**

**Confidence 折扣来源**：
- **5 点**：P0-1 / P0-2 都是 mechanical 修订（按官方 example 抄即可），但需 V2 验证修订后无引入新 regression（如 §2.2 的 subtree splice 逻辑在 child 是 active 时是否正确——已设计但未实测）。
- **4 点**：P1-4 的 12px 阈值数值/round 数学一致性需主 Agent / 02 作者拍板（解读 A 还是 B）。
- **3 点**：P1-1 实时深度预览的 visual feel 需要在实施期实测（02 §2.7 drop indicator 缩进 + P1-1 源行 padding-left 是否有视觉冗余/竞争）。

主要不确定性集中在**实施期 visual feel 验证**，而非架构层面。

**Takeaway**（给主 Agent / 03 V2 / 04 作者的 1-3 句话）：

1. **Two P0 mechanical bugs** must be patched before V2 ships: `treeKeyboardCoordinates` must use `MutableRefObject<{items, offset}>` ref channel (per `clauderic/dnd-kit` Tree example, not callback), and `handleDragEnd`'s `arrayMove(flattenedItems, ...)` must be replaced by subtree splice on `baseFlat` (or unified `reorder_categories_with_hierarchy` IPC). Both have complete patches in §9.
2. **V3 invariants are world-class preserved** (24/24 items checked against codebase one-hand sources). The architecture is sound — the bugs are in the example translation, not the design.
3. **02 §2.4 chevron rotation 与 03 §5.5 实现的 transform/icon 切换路径冲突**——需 designer 选方案 A（单 icon + transform: rotate）或方案 B（icon 即时切换 + 02 改文案）。推荐 A。

---

> **End of Reviewer D Review (V1)**
