# r2 — dnd-kit 内部行为源码验证（Agent B）

> **目的**：用一手 `node_modules/@dnd-kit/...` 源码（v6.3.1）回答 `_dispatch_plan` Agent B 的 7 个核心问题。
>
> **节制**：每个 finding 严格 cite 具体 `file:line`；看不到的就说"未在源码中找到"；不给修复方案，只给可行性 + 副作用边界。
>
> **验证依据**：
> - `node_modules/@dnd-kit/core/dist/core.esm.js`（v6.3.1，sourcemap 可读形态）
> - `node_modules/@dnd-kit/core/dist/utilities/algorithms/*.d.ts`
> - `node_modules/@dnd-kit/core/dist/modifiers/types.d.ts`
> - `node_modules/@dnd-kit/sortable/dist/sortable.esm.js`（v8.0.0 — 由 `import { SortableContext } from '@dnd-kit/sortable'` 解析）

## 0. 最关键 finding（单行摘要）

| # | finding | 一句话结论 | 关键源码引用 |
|---|---|---|---|
| F1 | collisionDetection 接收的 rect | **`collisionRect = getAdjustedRect(draggingNodeRect, modifiedTranslate)`**——是 modifier 修改后的 rect，不是 active rect 也不是 pointer | `core.esm.js:2984` |
| F2 | modifier 与 collision 的执行顺序 | **同一帧内：modifier 先跑 → collisionRect 计算 → collisionDetection**。snap 修改的 transform **直接进入下一次 collision** 的输入 | `core.esm.js:2959-2991` |
| F3 | closestCenter / closestCorners / rectIntersection 全部用 collisionRect | **3 个算法都没用 pointerCoordinates**，都受 modifier 影响 | `core.esm.js:325-353, 360-392, 422-452` |
| F4 | pointerWithin 用 pointerCoordinates | **唯一基于真实指针位置**的算法——`pointerCoordinates = activationCoordinates + translate`，**未经 modifier 影响** | `core.esm.js:472-513, 2977` |
| F5 | useSortable cascade transition 触发条件 | 由 `defaultAnimateLayoutChanges` + `getTransition` 共同决定；store-driven items 变化触发 `disableTransforms = true` 这一帧 cascade 被禁用，但 `wasDragging` 50 ms 窗口内 derivedTransform（FLIP）补救 | `sortable.esm.js:314, 363-376, 575-578, 604-622` |
| F6 | event.delta vs active.rect.current.translated 同步性 | **同帧值**——都来自 `modifiedTranslate`/`scrollAdjustedTranslate` 与 `collisionRect`；`event.over.rect` 是 droppable 的真实 measured rect，不被 active 端 modifier 影响 | `core.esm.js:3225-3234, 3287-3306, 3260-3266` |
| F7 | snapModifier 闭包内 active.id 可读 | Modifier args 包含 `active: Active \| null`；可在闭包中根据 `active?.id` 决定是否禁用 snap | `modifiers/types.d.ts:4-16` |

## 1. closestCenter 算法的输入：active rect、collisionRect、还是 pointer？

### 1.1 算法签名（`utilities/algorithms/types.d.ts:14-20`）

```ts
export declare type CollisionDetection = (args: {
    active: Active;
    collisionRect: ClientRect;       // ← 入参
    droppableRects: RectMap;
    droppableContainers: DroppableContainer[];
    pointerCoordinates: Coordinates | null;
}) => Collision[];
```

### 1.2 closestCenter 实现（`core.esm.js:325-353`）

```js
const closestCenter = _ref => {
  let { collisionRect, droppableRects, droppableContainers } = _ref;
  const centerRect = centerOfRectangle(collisionRect, collisionRect.left, collisionRect.top);
  const collisions = [];
  for (const droppableContainer of droppableContainers) {
    const { id } = droppableContainer;
    const rect = droppableRects.get(id);
    if (rect) {
      const distBetween = distanceBetween(centerOfRectangle(rect), centerRect);
      collisions.push({ id, data: { droppableContainer, value: distBetween } });
    }
  }
  return collisions.sort(sortCollisionsAsc);
};
```

**结论**：closestCenter **只解构 `collisionRect / droppableRects / droppableContainers`**——不读 `pointerCoordinates`，不读 active 字段。

### 1.3 collisionRect 的生产源（`core.esm.js:2984`）

```js
const collisionRect = draggingNodeRect ? getAdjustedRect(draggingNodeRect, modifiedTranslate) : null;
```

- `draggingNodeRect`（行 2948）：`isInitialized ? (dragOverlay.rect ?? activeNodeRect) : null`——使用 DragOverlay 时取 overlay 的初始 rect，否则取 active node rect
- `modifiedTranslate`（行 2959-2976）：`applyModifiers(modifiers, {transform: {x: translate.x - delta.x, ...}, ...})`——是 modifier 链返回的最终 transform
- `getAdjustedRect`（行 544）：`createRectAdjustmentFn(1)`，把 transform 的 x/y 加到 rect 的 left/right/top/bottom

**结论**：closestCenter 的输入 **是 modifier 之后的 rect**，因此 snapModifier 把 transform 拉向 over slot center 的同时，**下一次 collision 时这个被拉过的 rect 直接作为 closestCenter 的输入**——形成正反馈，与主 Agent 的 H2 假设完全吻合。

### 1.4 closestCorners 与 rectIntersection 同样依赖 collisionRect

- closestCorners（`core.esm.js:360-392`）：`const corners = cornersOfRectangle(collisionRect);`
- rectIntersection（`core.esm.js:422-452`）：`getIntersectionRatio(rect, collisionRect)`

两者都用 collisionRect、不用 pointerCoordinates。**改算法对"snap 锁定 over"的反馈环没本质修复作用**——因为 collisionRect 仍然是 modifier 之后的。

### 1.5 pointerWithin 是唯一基于 pointerCoordinates 的（`core.esm.js:472-513`）

```js
const pointerWithin = _ref => {
  let { droppableContainers, droppableRects, pointerCoordinates } = _ref;
  if (!pointerCoordinates) return [];
  const collisions = [];
  for (const droppableContainer of droppableContainers) {
    const { id } = droppableContainer;
    const rect = droppableRects.get(id);
    if (rect && isPointWithinRect(pointerCoordinates, rect)) { /* ... */ }
  }
  return collisions.sort(sortCollisionsAsc);
};
```

`pointerCoordinates` 的生产源（`core.esm.js:2977`）：

```js
const pointerCoordinates = activationCoordinates ? add(activationCoordinates, translate) : null;
```

- `activationCoordinates`（行 2916）：`activatorEvent ? getEventCoordinates(activatorEvent) : null`——mousedown 当时的指针坐标
- `translate`：reducer 维护，`Action.DragMove` 时 `translate.x = action.coordinates.x - initialCoordinates.x`（行 2598-2599）；`action.coordinates` 来自 sensor 的 `onMove(coordinates)`（行 3110-3113），**就是真实鼠标坐标**

**结论**：`pointerCoordinates = mousedown 位置 + (当前真实鼠标位置 - mousedown 位置) = 当前真实鼠标位置**。**未经任何 modifier 影响**——这是 dnd-kit 内部唯一可信的 pointer 源。

### 1.6 与 Agent A 调研的对接

H2（snap + closestCenter 正反馈）**得到一手源码确认**。下游修复评估：要打破这个反馈环，要么：
- 让 snap 不把 transform 拉向 over slot center（行为变化）
- 让 collision detection 不基于 collisionRect（换 pointerWithin / 自定义函数）
- 让 modifier 链对 hierarchy 场景按需禁用

参见 §4 / §5。

## 2. modifier chain 与 collision detection 的执行顺序

### 2.1 一帧的执行序列（`core.esm.js:2959-2991`）

```js
// 行 2959-2976：apply modifiers
const modifiedTranslate = applyModifiers(modifiers, {
  transform: { x: translate.x - nodeRectDelta.x, y: translate.y - nodeRectDelta.y, scaleX: 1, scaleY: 1 },
  activatorEvent, active, activeNodeRect, containerNodeRect, draggingNodeRect,
  over: sensorContext.current.over,             // ← 注意：是上一帧的 over
  overlayNodeRect: dragOverlay.rect,
  scrollableAncestors, scrollableAncestorRects, windowRect,
});

// 行 2977：pointerCoordinates 计算
const pointerCoordinates = activationCoordinates ? add(activationCoordinates, translate) : null;

// 行 2983：scrollAdjustedTranslate
const scrollAdjustedTranslate = add(modifiedTranslate, scrollAdjustment);

// 行 2984：collisionRect = modifier 之后的 rect
const collisionRect = draggingNodeRect ? getAdjustedRect(draggingNodeRect, modifiedTranslate) : null;

// 行 2985-2991：collision detection 用 collisionRect
const collisions = active && collisionRect ? collisionDetection({
  active, collisionRect, droppableRects,
  droppableContainers: enabledDroppableContainers,
  pointerCoordinates
}) : null;
const overId = getFirstCollision(collisions, 'id');
```

**结论**：
1. **同一帧内**：modifier 先跑 → 计算 collisionRect → collision detection → 推导 overId
2. **modifier 拿到的 over 是上一帧的**（`sensorContext.current.over`，行 2971）；**当前帧 modifier 修改后的 transform 直接作用于本帧 collision 的输入**
3. **`pointerCoordinates` 与 `collisionRect` 在同一帧并存**——但 closestCenter / closestCorners / rectIntersection 都不读 pointerCoordinates，仅 pointerWithin 用

### 2.2 applyModifiers 的语义（`core.esm.js:2750-2761`）

```js
function applyModifiers(modifiers, _ref) {
  let { transform, ...args } = _ref;
  return modifiers != null && modifiers.length
    ? modifiers.reduce((accumulator, modifier) =>
        modifier({ transform: accumulator, ...args }), transform)
    : transform;
}
```

- 是 reduce 串联，每个 modifier 拿上一个 modifier 的输出 transform，传同一份 args（active / over / draggingNodeRect 等）
- **空数组或 null → 返回原 transform 不变**——这意味着可以在条件下让 modifier 退化为身份函数（`return transform`）

### 2.3 关键含义（snap → collision 反馈环的源码闭环）

设第 N 帧：snap 把 transform 加上 (dx_n, dy_n)，使 collisionRect 中心偏向 over slot center → 第 N 帧 collision detection 用偏移后的 rect 选出 over_n。第 N+1 帧 mousemove 触发：

1. modifier 运行时 `over` 字段还是 over_n（来自 sensorContext.current.over，由上一帧 setOver 更新）
2. snap 继续把 transform 拉向 over_n.rect 中心
3. 第 N+1 帧 collisionRect 仍偏向 over_n
4. closestCenter 选 over 时，over_n 的距离继续最小 → over 不切换

**这就是 H2 假设的源码层闭环**：snap → 偏移 collisionRect → closestCenter 锁 over_n → snap 继续。

### 2.4 onDragMove vs onDragOver 的触发时机差异

- `onDragMove` 触发依赖：`[scrollAdjustedTranslate.x, scrollAdjustedTranslate.y]`（`core.esm.js:3243`）——**snap 改变 dx/dy 也会触发**（因为 modifiedTranslate 依赖于 modifier 输出）
- `onDragOver` 触发依赖：`[overId]`（`core.esm.js:3286`）——**只在 over.id 变化时触发**

**含义**：snap 锁定 over 期间，`onDragMove` 持续被调，`onDragOver` 不再触发——项目 `handleDragOver` 内部 `setOverId` 这一行（`SortableCategoriesList.tsx:762-763`）在 snap 锁定时不执行，但 `handleDragMove` 里另一处 `setOverId(event.over?.id ?? null)`（行 686-687）仍执行（值相同，相当于 noop）。**用户感受到的"over 不切换"在 dnd-kit 内部就是 overId 不变**。

## 3. useSortable cascade transition 的触发条件

### 3.1 SortableContext 一级闸门（`sortable.esm.js:314`）

```js
const disableTransforms = overIndex !== -1 && activeIndex === -1 || itemsHaveChanged;
```

- `itemsHaveChanged = !itemsEqual(items, previousItemsRef.current)`（行 313）——SortableContext.items 变化时为 `true`
- `disableTransforms` 透过 contextValue 传给所有子 useSortable

### 3.2 useSortable 二级判断（`sortable.esm.js:506-517`）

```js
const isSorting = Boolean(active);
const displaceItem = isSorting && !disableTransforms && isValidIndex(activeIndex) && isValidIndex(overIndex);
const shouldDisplaceDragSource = !useDragOverlay && isDragging;
const dragSourceDisplacement = shouldDisplaceDragSource && displaceItem ? transform : null;
const strategy = localStrategy != null ? localStrategy : globalStrategy;
const finalTransform = displaceItem
  ? dragSourceDisplacement != null ? dragSourceDisplacement : strategy({ rects: sortedRects, activeNodeRect, activeIndex, overIndex, index })
  : null;
```

- `displaceItem === false`（drag 期间 items 变了，例如外部 setState 写入新 categories）→ **strategy 不计算 transform，行不被位移**
- 项目用 `verticalListSortingStrategy`（`SortableCategoriesList.tsx:22, 1092`）

### 3.3 transition 字符串生成（`sortable.esm.js:604-622`）

```js
function getTransition() {
  if (
    derivedTransform ||
    itemsHaveChanged && previous.current.newIndex === index
  ) {
    return disabledTransition;  // CSS.Transition with duration: 0
  }
  if (shouldDisplaceDragSource && !isKeyboardEvent(activatorEvent) || !transition) {
    return undefined;
  }
  if (isSorting || shouldAnimateLayoutChanges) {
    return CSS.Transition.toString({ ...transition, property: transitionProperty });
  }
  return undefined;
}
```

- 默认 `transition = { duration: 200, easing: 'ease' }`（行 377-380）
- **drag 期间 `isSorting = true` → 返回 transition 字符串**——cascade 在这条路径上发生（同帧 `isSorting && !disableTransforms` 时）
- **drop 之后 `isSorting = false`**：要 cascade 必须 `shouldAnimateLayoutChanges = true`

### 3.4 shouldAnimateLayoutChanges（`sortable.esm.js:350-376`）

```js
const defaultAnimateLayoutChanges = _ref2 => {
  let { containerId, isSorting, wasDragging, index, items, newIndex, previousItems, previousContainerId, transition } = _ref2;
  if (!transition || !wasDragging) return false;
  if (previousItems !== items && index === newIndex) return false;
  if (isSorting) return true;
  return newIndex !== index && containerId === previousContainerId;
};
```

- `wasDragging` = `previous.current.activeId != null`（行 544）
- `previous.current.activeId` 在 drop 后**有 50 ms 延迟才置 null**（行 575-579，setTimeout 50）

### 3.5 50 ms 窗口（`sortable.esm.js:565-579`）

```js
useEffect(() => {
  if (activeId === previous.current.activeId) return;
  if (activeId != null && previous.current.activeId == null) {
    previous.current.activeId = activeId;
    return;
  }
  const timeoutId = setTimeout(() => {
    previous.current.activeId = activeId;  // activeId === null
  }, 50);
  return () => clearTimeout(timeoutId);
}, [activeId]);
```

**结论（drop 之后的 cascade 触发条件）**：

| 时间窗口 | wasDragging | items 变化触发 transition? |
|---|---|---|
| Drop 后 0 ms ~ 50 ms | true（previous.activeId 还未清） | 看 `defaultAnimateLayoutChanges` 判断 |
| Drop 后 > 50 ms | false | 直接 return false（行 363），**cascade 不触发** |

进一步 `defaultAnimateLayoutChanges` 的逻辑：
- `if (previousItems !== items && index === newIndex) return false;`——items 变了但当前 row 的 index 没变，**返回 false**（不触发 transition）
- `if (isSorting) return true;`——drag 期间一直 true
- 否则 `return newIndex !== index && containerId === previousContainerId;`——drop 之后只有"index 变了"的 row 触发 transition

### 3.6 useDerivedTransform（FLIP-style 补救机制，`sortable.esm.js:396-436`）

```js
function useDerivedTransform({ disabled, index, node, rect }) {
  const [derivedTransform, setDerivedtransform] = useState(null);
  const previousIndex = useRef(index);
  useIsomorphicLayoutEffect(() => {
    if (!disabled && index !== previousIndex.current && node.current) {
      const initial = rect.current;
      if (initial) {
        const current = getClientRect(node.current, { ignoreTransform: true });
        const delta = {
          x: initial.left - current.left,
          y: initial.top - current.top,
          scaleX: initial.width / current.width,
          scaleY: initial.height / current.height
        };
        if (delta.x || delta.y) setDerivedtransform(delta);
      }
    }
    if (index !== previousIndex.current) previousIndex.current = index;
  }, [disabled, index, node, rect]);
  useEffect(() => { if (derivedTransform) setDerivedtransform(null); }, [derivedTransform]);
  return derivedTransform;
}
```

- 触发条件：`!disabled && index !== previousIndex.current && node.current`
- `disabled = !shouldAnimateLayoutChanges`（`sortable.esm.js:547`）
- 行为：测量行新位置 → 计算 delta（旧位置 - 新位置）→ 把 delta 设为 transform，下一帧清零——配合 transition，就有 FLIP-style 动画

**结论**：useSortable 自带 FLIP 机制，但启用条件依赖 `shouldAnimateLayoutChanges = true`。在 drop 后 50 ms 窗口内 + index 变化的情况下，**会触发**；但 store 异步更新（双 IPC 之间）若超过 50 ms（IPC 1 await 完成）就**错过窗口**，cascade 不触发——与主 Agent H4 假设完全吻合。

### 3.7 关于 H4 假设的最终判定

**H4 「useSortable cascade 在 store-driven 变化下不触发」**：源码层确认 **当且仅当** 满足以下任一条件时不触发：

1. drop 后 store 写入延迟 > 50 ms（`previous.current.activeId === null` 已触发 → `wasDragging = false`）
2. 第一次 IPC 后 items 变了但当前 row 的 index 没变（`previousItems !== items && index === newIndex` → 返回 false）
3. 双 IPC 之间 React commit 出中间帧，但中间帧 `wasDragging` 已 false（因为 50 ms 早过了）

修复路径上需考虑的副作用：项目 `handleDragEnd` 路径（`SortableCategoriesList.tsx:932-957` 待 Agent A 详查）双 IPC 路径下，IPC 1 (`onSetCategoryParent`) await 一个 Tauri invoke——网络/IO 延迟 ≥ 50 ms 是常态——**几乎必然错过 cascade 窗口**。

## 4. 自定义 collisionDetection 的可行性评估

### 4.1 接口契约（`utilities/algorithms/types.d.ts:14-20`）

任何函数只要满足 `(args) => Collision[]` 签名都可作为 `collisionDetection` 传入 DndContext。args 包含：
- `active: Active`（含 `rect: { current: { initial, translated } }` ref）
- `collisionRect: ClientRect`（modifier 之后）
- `droppableRects: RectMap`（id → rect）
- `droppableContainers: DroppableContainer[]`
- `pointerCoordinates: Coordinates | null`（真实指针位置）

### 4.2 不变量 #22（V3）的现状

`SortableCategoriesList.tsx:1060` 当前 `collisionDetection={closestCenter}`。V3 设计文档把它列为不变量。

### 4.3 选项 A：换 pointerWithin

**可行性**：
- pointerWithin（`core.esm.js:472-513`）只在 pointerCoordinates 落在 rect 内时返回 collision
- **优点**：完全脱离 collisionRect → 与 snap 解耦 → 打破 H2 反馈环
- **缺点**：
  - 当指针在 row 之间的 gap（即使是 1 px）→ 返回空 → over = null → snap 退化为 decay → DragOverlay 漂回鼠标——可能造成 over.id 闪烁
  - 不变量 #22「closestCenter」要打破

### 4.4 选项 B：自定义函数 — closestCenter + pointer fallback（混合）

**可行性**（接口允许）：
```ts
const customCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length) return pointerHits;
  return closestCenter(args);
};
```

- **优点**：当指针在 row 内时基于真实 pointer 选 over（脱离 modifier 影响），离开时回退到 closestCenter（保留 V3 行为）
- **缺点**：行间 gap 的边界 1 px 抖动仍可能造成 over.id 切换（但只在 pointerWithin 的边界，比 closestCenter + snap 反馈环窄得多）
- **副作用**：不破坏 V3 不变量 #22 的精神（gap 内仍 closestCenter），但需要 spec 显式说明"pointer 命中优先"

### 4.5 选项 C：自定义函数 — closestCenter 用 active.rect.current.initial（去掉 modifier）

**可行性**（理论可行）：
- 函数体内手动用 `args.active.rect.current.initial` + `event.delta` 重建未经 modifier 影响的 rect 中心——但 collisionRect 已经在 args 里被预计算
- **缺点**：
  - args 不直接暴露 `delta`/`scrollAdjustedTranslate`；需要从 `args.active.rect.current.translated` 与 `.initial` 反推 modifier 的 dx/dy 后扣除——**这条路径未在源码中找到直接 API**
  - 实现复杂度高，bug 面广；不推荐

### 4.6 选项 D：自定义函数 — closestCorners

**可行性**（与 closestCenter 同源）：
- closestCorners（`core.esm.js:360-392`）用 collisionRect 的 4 个角到每个 droppable 4 个角的距离求和
- **依然受 modifier 影响**——不解决 H2，仅改变"哪个 over 算最近"的几何度量，对反馈环无本质修复

### 4.7 综合可行性总结

| 选项 | 可行性 | 打破 H2 反馈环？ | V3 #22 影响 |
|---|---|---|---|
| A. pointerWithin | 高 | 是（完全脱离 modifier） | **打破**（需 spec 修订） |
| B. 混合 pointerWithin → closestCenter | 高 | 部分（pointer 命中时脱离） | **软打破**（gap 内仍 closestCenter） |
| C. 自定义反推 modifier | 低 | 是 | 保留 #22 |
| D. closestCorners | 高 | **否** | **打破**（无收益） |

修复路径的设计 trade-off 由后续 synthesis 阶段决定，本调研不出方案。

## 5. modifier 按需禁用的可行性

### 5.1 Modifier args 包含 `active`（`modifiers/types.d.ts:4-16`）

```ts
export declare type Modifier = (args: {
    activatorEvent: Event | null;
    active: Active | null;            // ← 拿得到 active.id
    activeNodeRect: ClientRect | null;
    draggingNodeRect: ClientRect | null;
    containerNodeRect: ClientRect | null;
    over: Over | null;
    overlayNodeRect: ClientRect | null;
    scrollableAncestors: Element[];
    scrollableAncestorRects: ClientRect[];
    transform: Transform;
    windowRect: ClientRect | null;
}) => Transform;
```

**结论**：modifier 在每帧执行时**直接拿到 `active.id`** 与 `active.data.current`。配合闭包 / 模块级 ref，可以在 modifier 内根据 active.id（或注入的 ref）判断当前 drag 是 child-active 还是 root-active。

### 5.2 身份函数路径已在项目当前实现中存在

snapModifier.ts 行 65-69（无 over 时）：
```ts
if (Math.abs(state.dx) < RESET_THRESHOLD_PX && Math.abs(state.dy) < RESET_THRESHOLD_PX) {
  state.dx = 0;
  state.dy = 0;
  return transform;   // ← 身份返回
}
```

**结论**：在闭包内某个条件分支返回原 `transform`（不修改 x/y）是 **dnd-kit 完全允许且当前已使用的模式**——按需禁用的物理可行性 = ★★★（无歧义）。

### 5.3 与 V3 §2.5 / §2.9 的相容性（仅作可行性边界，不出方案）

V3 §2.5 / §2.9 要求 hierarchy 不修改 snap 的相关约束在 02 spec 内描述。**本调研不评估 spec 一致性**，那是 Agent A 的工作。从 dnd-kit 源码侧：modifier 的「按需禁用 / 减弱」是接口允许且当前已部分使用的模式，没有 dnd-kit 内部反对力。

### 5.4 注入条件的方式（接口允许但需用项目机制）

- modifier 是闭包工厂返回的纯函数；无 props 注入接口
- 当前 snapModifier 是 module-singleton（`export const snapModifier`）
- 注入 isChildActive 信号有几种方式（**仅技术可行性，不推荐特定方案**）：
  1. 把 modifier 改成"接受外部 ref"的工厂——`createSnapModifier(stateRef)`，DndContext 渲染层 useMemo 传入；闭包内读 `stateRef.current.isChildActive`
  2. 在 active.data 里塞 `originalParentId`（`useDraggable` 的 data prop）——modifier 通过 `active.data.current` 读
  3. 用模块级 var + 项目层在 onDragStart 时同步——不推荐（共享可变状态难追）

**任一方式都需要项目层的实现工作；dnd-kit 接口本身不阻止**。

## 6. event.delta / event.over.rect / active.rect.current.translated 三者的同步性

### 6.1 三者的源码定义

| 字段 | 源码出处 | 数学表达 |
|---|---|---|
| `event.delta` | `core.esm.js:3229-3232, 3271-3274` | `{ x: scrollAdjustedTranslate.x, y: scrollAdjustedTranslate.y }` |
| `event.over.rect` | `core.esm.js:3261-3266` | `overContainer.rect.current`（droppable 测量出来的 DOM rect） |
| `event.active.rect.current.translated` | `core.esm.js:3303-3306` | `collisionRect`（= `getAdjustedRect(draggingNodeRect, modifiedTranslate)`） |
| `event.active.rect.current.initial` | 同上 | `draggingNodeRect`（= `dragOverlay.rect ?? activeNodeRect`） |

### 6.2 同帧一致性（`core.esm.js:3287-3307`）

```js
useIsomorphicLayoutEffect(() => {
  sensorContext.current = {
    activatorEvent, active, activeNode,
    collisionRect, collisions, droppableRects,
    draggableNodes, draggingNode, draggingNodeRect,
    droppableContainers, over,
    scrollableAncestors, scrollAdjustedTranslate
  };
  activeRects.current = {
    initial: draggingNodeRect,
    translated: collisionRect
  };
}, [active, activeNode, collisions, collisionRect, draggableNodes, draggingNode,
    draggingNodeRect, droppableRects, droppableContainers, over,
    scrollableAncestors, scrollAdjustedTranslate]);
```

**结论**：在 `useIsomorphicLayoutEffect` 提交后：
- `event.active.rect.current.translated` ≡ `collisionRect`（同一对象引用）
- `event.delta` ≡ `scrollAdjustedTranslate`（来自同一帧）

**三者在 onDragMove handler 内 = 同一时刻的快照**——`scrollAdjustedTranslate.x / y` 与 `collisionRect.left / top` 的关系恒为 `collisionRect = draggingNodeRect + modifiedTranslate`、`scrollAdjustedTranslate = modifiedTranslate + scrollAdjustment`——两者只差 `scrollAdjustment`（无 scroll 时为 0）。

### 6.3 关键含义对项目代码

`SortableCategoriesList.tsx:647`：
```ts
const newOffset = event.delta.x;
```

`event.delta.x` = `scrollAdjustedTranslate.x` = `modifiedTranslate.x + scrollAdjustment.x` = **modifier 之后**的 x 偏移。snapModifier 在 hierarchy 场景下若把 transform 横向拉了（注：当前 snapModifier 实际只看 dy/dx 双轴 snap—— `snapModifier.ts:93-94` 算 dx 是 `slotCenterX - draggedCenterX`），`event.delta.x` 包含 snap 引入的横向位移——这意味着 V2.1 的 12 px X 阈值（`SortableCategoriesList.tsx:689`）是 **modifier 之后**的 delta，不是用户真实横向意图的纯指针位移。

未在源码中找到通过 `event` 直接拿到 modifier 之前 translate 的字段——若需"用户真实横向意图"，需要：
- `pointerCurrentRef.current.x - pointerStartRef.current.x`（项目当前已记录 pointerStartRef + pointerCurrentRef，行 670-672），即 raw pointer delta
- 或 `pointerCoordinates.x - activationCoordinates.x`（dnd-kit 内部值，未通过 event 暴露）

### 6.4 over.rect 不受 active 端 modifier 影响

`overContainer.rect.current` 由 `useDroppableMeasuring`（`core.esm.js:1961-2059`）维护，是 droppable DOM 元素的 measured rect——**完全独立于 active 端 modifier**。

但有一个微妙点：在 `MeasuringStrategy.Always`（项目当前配置）下，每一帧 droppable rect 都被重新测量（`useDroppableMeasuring:1994-2026` 的 `useLazyMemo`），如果 sortableContext.items 变了（例如双 IPC 中间帧），`measureDroppableContainers(items)` 会被调（`sortable.esm.js:316-320`），rect 可能被重测——但仍然是 DOM 真实 rect，不被 active modifier 影响。

## 7. 附加细节：active rect 与 DragOverlay 的二级 modifier chain

### 7.1 DragOverlay 内部的二次 applyModifiers（`core.esm.js:3923-3937`）

```js
const transform = useContext(ActiveDraggableContext);
const key = useKey(active == null ? void 0 : active.id);
const modifiedTransform = applyModifiers(modifiers, {  // ← DragOverlay.modifiers
  activatorEvent, active, activeNodeRect, containerNodeRect,
  draggingNodeRect: dragOverlay.rect, over,
  overlayNodeRect: dragOverlay.rect, transform,
  scrollableAncestors, scrollableAncestorRects, windowRect
});
```

- `useContext(ActiveDraggableContext)` 拿到的 transform **已经是 DndContext modifier chain（即 snapModifier）应用之后**的（`core.esm.js:2997, 3360`）
- **DragOverlay.modifiers 在此基础上再叠加一遍**——项目当前是 `[restrictToWindowEdges]`（V3 #9）

**含义**：snapModifier 仅在 DndContext 链中执行；DragOverlay 链中是 restrictToWindowEdges。两条链不重复执行 snap。但 DragOverlay 渲染的 transform 是 **DndContext snap + DragOverlay restrict** 的复合结果——这正是 V3 #8 / #9 已经确认的设计。

### 7.2 ActiveDraggableContext 的 transform 计算（`core.esm.js:2996-2997`）

```js
const appliedTranslate = usesDragOverlay ? modifiedTranslate : add(modifiedTranslate, activeNodeScrollDelta);
const transform = adjustScale(appliedTranslate, over?.rect ?? null, activeNodeRect);
```

- 使用 DragOverlay 时（`usesDragOverlay = true`）—— transform = `modifiedTranslate`（只调整了 scale）
- 不用 DragOverlay 时——transform = `modifiedTranslate + activeNodeScrollDelta`
- `adjustScale(transform, rect1, rect2)`（行 515-520）：仅修改 scaleX / scaleY，不影响 x / y

**结论**：snap 的 dx/dy 直接进入 `appliedTranslate`，再进入 ActiveDraggableContext，最终影响 active row 的可见 transform 与下一帧 collisionRect。

### 7.3 useDraggable 对该 context 的消费（`core.esm.js:3409-3410`）

```js
const isDragging = (active == null ? void 0 : active.id) === id;
const transform = useContext(isDragging ? ActiveDraggableContext : NullContext);
```

- 只有 active row（`active.id === id`）从 `ActiveDraggableContext` 消费 transform
- 其他 row 从 NullContext（永远 null）消费 → 不直接受 modifier 影响

useSortable 在此基础上层叠 finalTransform（来自 verticalListSortingStrategy 计算的 cascade displacement）：
```js
return {
  // ...
  transform: derivedTransform != null ? derivedTransform : finalTransform,
  transition: getTransition()
};
```

**结论**：active row 看到 modifier 后的 transform；非 active row 看到 strategy 计算的 cascade displacement——cascade 与 modifier 完全解耦。这是修复路径上"snap 仅作用于 active row，cascade 不被影响"的源码保证。

## 8. 与 V3 既有不变量的冲突点（仅源码层事实，不出方案）

| V3 不变量 | 与本调研发现的关系 |
|---|---|
| #8 DndContext.modifiers = [snapModifier] only | **当前实现兼容**：snap 是闭包 modifier，可以注入条件返回身份函数；满足"按需禁用"无需新增 modifier |
| #9 DragOverlay.modifiers = [restrictToWindowEdges] only | **不影响**——本调研未触及 DragOverlay 链 |
| #22 closestCenter collision detection | **若选择 §4 选项 A 或 B**——直接打破；选项 C 或 D 不打破语义但意义有限 |
| #23 MeasuringStrategy.Always | **不直接冲突**——但每帧重测 droppable rect 的开销是后续 synthesis 阶段需评估的副作用边界 |

## 9. 未在源码中找到 / 需要降级到「未验证」的项

- 「`event.delta` 中能否单独剥离 modifier 引入的横向位移」—— 未在 `core.esm.js` 中找到 API；项目 pointerStartRef / pointerCurrentRef 是当前唯一可信的 raw pointer source
- 「pointerCoordinates 是否在 onDragMove event 中暴露」—— 未在源码中找到（`event` 字段仅 `active / activatorEvent / collisions / delta / over`，行 3225-3234）
- 「`MeasuringFrequency` 取值除 `'optimized'` 外是否有 numeric 选项」——dist `MeasuringFrequency` 仅 `Optimized = 'optimized'`（`core.esm.js:1956-1958`），但 useDroppableMeasuring 的 `frequency` 参数若是 number 类型也走 setTimeout 路径（行 2044-2052）；未在源码中找到 frequency 接受数字的 public API 文档
- 「snapModifier 内部状态闭包是否在 DndContext rerender 时被破坏」——`SortableCategoriesList.tsx` 用 module-singleton（`snapModifier.ts:125`），渲染不重建闭包；但若改为 useMemo 工厂，需注意依赖数组——本调研未做 React rerender 端的额外验证

## 10. 总结表（一图流）

```
┌──────────────────────────────────────────────────────────────┐
│ 一帧 dnd-kit DndContext 内部执行序列                          │
├──────────────────────────────────────────────────────────────┤
│  1. sensor.onMove(coordinates) → reducer 更新 state.translate │
│  2. translate = state.translate（真实指针累积偏移，无 modifier）│
│  3. modifiedTranslate = applyModifiers(modifiers, {...})      │
│     ↑ snapModifier 在这一步执行；用上一帧的 over             │
│  4. pointerCoordinates = activationCoordinates + translate    │
│     ↑ 真实指针位置，未经 modifier 影响                        │
│  5. collisionRect = getAdjustedRect(draggingNodeRect,         │
│                                     modifiedTranslate)        │
│     ↑ 受 modifier 影响                                       │
│  6. collisions = collisionDetection({active, collisionRect,   │
│                                      droppableRects,          │
│                                      droppableContainers,     │
│                                      pointerCoordinates})     │
│     ↑ closestCenter / closestCorners / rectIntersection 用    │
│       collisionRect（受 modifier）                            │
│       pointerWithin 用 pointerCoordinates（不受 modifier）    │
│  7. overId = getFirstCollision(collisions, 'id')              │
│  8. setOver(over) only when overId 变化                       │
│  9. activeRects.current = { initial: draggingNodeRect,        │
│                              translated: collisionRect }      │
│ 10. 触发 onDragMove (依赖 [scrollAdjustedTranslate])           │
│     onDragOver (依赖 [overId]，不变就不触发)                   │
│ 11. ActiveDraggableContext.value = adjustScale(modifiedTranslate)│
│     ↑ active row 与 DragOverlay 通过此 context 拿 transform    │
│ 12. useSortable 内：                                           │
│     - 非 active row: finalTransform = strategy(...)            │
│     - 即 cascade displacement                                  │
│     - 受 disableTransforms 闸门约束                            │
└──────────────────────────────────────────────────────────────┘
```

## 11. Agent B 调研结论（一句话）

dnd-kit v6.3.1 / sortable v8.0.0 的源码层面**完全证实** H2（snap → closestCenter 反馈环）与 H4（cascade 50 ms 窗口外不触发）；自定义 `collisionDetection`（基于 pointerCoordinates 或混合）与 modifier 按需禁用都在 dnd-kit 接口允许范围内，**不需要新增 dependency 或 fork 库**；具体修复路径的选择 trade-off 留给后续 synthesis 阶段。

---

> **节制重申**：本文档仅做事实陈述与可行性边界，不出任何修复方案、不重新设计；每个 finding 严格 cite 一手源码 file:line；看不到的项已在 §9 标注「未在源码中找到」。
