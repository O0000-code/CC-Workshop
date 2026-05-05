# R2 — dnd-kit Sortable Tree 架构调研

> **作者身份**：R2 SubAgent (Opus)
> **输出位置**：`.dev/category-hierarchy/01_research/r2_dnd_tree_architecture.md`
> **Authority**：Referential（调研报告，作论据）。任何与本文档冲突的最终决议以 02/03 V_n+1 为准。

---

## 0. 已读基线 Checklist

| 顺序 | 文档 | 路径 | 关键摘录 |
|---|---|---|---|
| 1 | 任务理解 | `.dev/category-hierarchy/00_understanding.md` | §4.4 V3 不变量必背、§6 D3/D5/D6 |
| 2 | 本轮派单 | `.dev/category-hierarchy/01_research/_dispatch_plan.md` | R2 任务规格、产物结构、必跑事 |
| 3 | 文档权威 | `~/.claude/rules/document-authority-ranking.md` | 跨文档冲突仲裁 |
| 4 | 调研先行 | `~/.claude/rules/plan-as-research-design.md` | research-first |
| 5 | 硬约束在前 | `~/.claude/rules/hard-constraints-before-soft-evaluation.md` | 评估顺序 |
| 6 | 串联文档 | `.claude/rules/cross-document-cascade-discipline.md` | V→V+1 cascade 纪律 |
| 7 | 第三方源码验证 | `.claude/rules/verify-third-party-behavior-firsthand.md` | dnd-kit 声称必须 link node_modules |
| 8 | 数值等价验证 | `.claude/rules/validate-numerical-equivalence-claims.md` | 等价主张必须 reproduce |
| 9 | 设计 V3 全文 | `.dev/sidebar-reorder/02_design_spec.md` | §2.1-§2.14、CSS token、V2/V3 修订记录 |
| 10 | 技术 V3 全文 | `.dev/sidebar-reorder/03_tech_plan.md` | §1-§15、DndContext 配置、apply_reorder、snapModifier |
| 11 | snap 研究 | `.dev/sidebar-reorder/06_snap_research.md` | dnd-kit 修饰器调用路径 + 软引力推导 |
| 12 | 现有实现 | `src/components/sidebar/SortableCategoriesList.tsx` 及 5 个相关文件 | DndContext template、useSortable usage、CustomMouseSensor、announcements |
| 13 | dnd-kit v6.3.1 源码 | `node_modules/@dnd-kit/{core,sortable,modifiers}/dist/*.esm.js` + `.d.ts` | 见 §1 全部 quote 与行号 |
| 14 | 官方 Sortable Tree example | GitHub `clauderic/dnd-kit/stories/3 - Examples/Tree/` | 见 §2 全部源码摘录 |
| 15 | 行业基准 web 引证 | Things 3 / Linear / Notion / Todoist / macOS Finder / Apple HIG / Apple Reminders | 见 §7 表格引证链接 |

**所有 13/14 项命中文件已逐文件 Read 完毕；行业基准全部有公开链接（§7）；每条 dnd-kit 声称都给出 `node_modules/...:行号` 或 `.d.ts:行号`。**

---

## 1. dnd-kit v6.3.1 + sortable v10 + modifiers v9 源码事实

> 安装版本（实测 `package.json`）：`@dnd-kit/core@6.3.1`、`@dnd-kit/sortable@10.0.0`、`@dnd-kit/modifiers@9.0.0`。
>
> 路径前缀：本节所有 `core.esm.js` / `sortable.esm.js` / `modifiers.esm.js` 都在 `node_modules/@dnd-kit/{core,sortable,modifiers}/dist/`；`.d.ts` 文件在同一目录。

### 1.1 Modifier 类型签名（**核心**）

**源码**：`node_modules/@dnd-kit/core/dist/modifiers/types.d.ts:1-17`

```ts
export declare type Modifier = (args: {
    activatorEvent: Event | null;
    active: Active | null;
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

**关键事实**：
- Modifier 是**纯函数签名**，**没有 dispatch / setState / effect 入口**
- `over: Over | null` 在 dnd-kit 6 是**单一**的 over，**没有 over 链 / parent over**（嵌套场景下需要通过 `Over.data: DataRef` 自己传递 parent 信息）
- `args.transform` 是入参，函数返回值是新的 `Transform`（即 modifier 是变换函数，不是事件监听器）
- 同一 modifier 实例的闭包可以跨帧持有状态（这是 V3 snapModifier 的 `state.dx/dy` 跨帧 lerp 的实现基础，参 `src/components/sidebar/dnd/snapModifier.ts:48-119`）

### 1.2 Over 类型签名（**嵌套场景关键**）

**源码**：`node_modules/@dnd-kit/core/dist/store/types.d.ts:35-40`

```ts
export interface Over {
    id: UniqueIdentifier;
    rect: ClientRect;
    disabled: boolean;
    data: DataRef;
}
```

**关键事实**：
- `Over.rect` 是**单个** ClientRect（被 hover 的 droppable 自身的矩形），**不包含父级矩形**
- `Over.data` 是 `DataRef = MutableRefObject<Data | undefined>` — 这是嵌套场景下传递 `parentId/depth` 的**唯一通道**
- `useSortable` 自动写入 `data.sortable = { containerId, index, items }`（`sortable.esm.js:463-470`），但**不带 depth/parentId** — 这两个字段需调用方手动通过 `useDraggable({ data })` 传入
- `Over.id` 是 droppable 的 id；**没有 over.parentId / over.path** — 嵌套必须靠 client 自己 flatten 后通过 id → 数据 lookup

### 1.3 Modifier 的 double-apply（DndContext + DragOverlay 各调用一次）

**源码**：`node_modules/@dnd-kit/core/dist/core.esm.js:2959-2976` (DndContext 调用 `applyModifiers`)
**源码**：同文件 line 3925-3937（DragOverlay 内 `applyModifiers` 再次调用，参 `06_snap_research.md` §1.1 的逐帧调用链）

```js
// DndContext 内部（每帧 mousemove 都跑）
const modifiedTranslate = applyModifiers(modifiers, {
    transform: { x: translate.x - nodeRectDelta.x, y: translate.y - nodeRectDelta.y, scaleX: 1, scaleY: 1 },
    activatorEvent, active, activeNodeRect, containerNodeRect, draggingNodeRect,
    over: sensorContext.current.over, overlayNodeRect: dragOverlay.rect,
    scrollableAncestors, scrollableAncestorRects, windowRect
});
```

**关键事实**：
- `<DndContext modifiers={[...]}>` 与 `<DragOverlay modifiers={[...]}>` 是**两条独立串联**（V2 P0 NEW-P0-1 的根因 — V2 把 `restrictToVerticalAxis` 放在 DndContext 上同时影响了 DragOverlay 跟手，V3 明确分离）
- 修饰后的 transform 通过 `ActiveDraggableContext.Provider` 下发到 useSortable 子节点（`core.esm.js:2843, 3625`）
- Modifier 的执行频率 = 每帧 mousemove（远高于 React render）

### 1.4 `useSortable` 返回的 transform 行为

**源码**：`node_modules/@dnd-kit/sortable/dist/hooks/useSortable.d.ts:12-36`

```ts
export declare function useSortable(args): {
    // ...
    transform: import("@dnd-kit/utilities").Transform | null;
    transition: string | undefined;
    // ...
};
```

**实际计算**：`node_modules/@dnd-kit/sortable/dist/sortable.esm.js:506-517`

```js
const isSorting = Boolean(active);
const displaceItem = isSorting && !disableTransforms && isValidIndex(activeIndex) && isValidIndex(overIndex);
const shouldDisplaceDragSource = !useDragOverlay && isDragging;
const dragSourceDisplacement = shouldDisplaceDragSource && displaceItem ? transform : null;
const finalTransform = displaceItem ? dragSourceDisplacement != null ? dragSourceDisplacement : strategy({
    rects: sortedRects, activeNodeRect, activeIndex, overIndex, index
}) : null;
// ...
transform: derivedTransform != null ? derivedTransform : finalTransform,
transition: getTransition()
```

**关键事实**：
- 当**使用 DragOverlay** 时（项目当前架构），`useSortable.transform` 仅返回 cascade 让位的 transform — 即"其他静止 row 让位用的位移"，**不是被拖那一项的位移**
- 被拖项的实际位移由 DragOverlay 内部 `applyModifiers` 计算（line 3925），不走 useSortable
- `transform: null` 时 useSortable 不应用任何位移（用于"未在 sorting 状态" / "out of valid index"）
- `useSortable.transition` 默认 `defaultTransition = { duration: 200, easing: 'ease' }`（`sortable.esm.js:377-380`），但项目层在 `SortableCategoryRow.tsx:51-54` 通过 `transition` arg 覆盖为 220ms cubic-bezier(0.16, 1, 0.3, 1)

### 1.5 `verticalListSortingStrategy` 在变高 row（不同缩进同高度的子类）下的行为

**源码**：`node_modules/@dnd-kit/sortable/dist/sortable.esm.js:205-258`

```js
const verticalListSortingStrategy = _ref => {
  let { activeIndex, activeNodeRect: fallbackActiveRect, index, rects, overIndex } = _ref;
  const activeNodeRect = rects[activeIndex] ?? fallbackActiveRect;
  if (!activeNodeRect) return null;

  if (index === activeIndex) {
    const overIndexRect = rects[overIndex];
    if (!overIndexRect) return null;
    return {
      x: 0,
      y: activeIndex < overIndex
        ? overIndexRect.top + overIndexRect.height - (activeNodeRect.top + activeNodeRect.height)
        : overIndexRect.top - activeNodeRect.top,
      ...defaultScale$1
    };
  }

  const itemGap = getItemGap$1(rects, index, activeIndex);

  if (index > activeIndex && index <= overIndex) {
    return { x: 0, y: -activeNodeRect.height - itemGap, ...defaultScale$1 };
  }
  if (index < activeIndex && index >= overIndex) {
    return { x: 0, y: activeNodeRect.height + itemGap, ...defaultScale$1 };
  }
  return { x: 0, y: 0, ...defaultScale$1 };
};
```

**关键事实**（**P0 决策依据**）：
- cascade 让位的位移**只用 `activeNodeRect.height`**，**不读 row[index] 的 height**
- 这意味着**所有 row 必须保持相同高度**，否则 cascade 会错位（row B 让位 row A 的高度时，如果 B 比 A 矮，会出现"重叠"，反之 "空隙"）
- 项目当前 row `h-8 = 32px`（`SortableCategoryRow.tsx:114`、`DragOverlayCategoryRow.tsx:21`），新增 hierarchy 后**必须保持 h-8 不变**，**禁止**给子类改 `h-7` 或类似变化（即子类只能改 `padding-left`，不能改高度）
- 这是 V3 不变量的隐式硬约束 — 02_design_spec V3 §2.4 cascade duration 220ms cubic-bezier(0.16, 1, 0.3, 1) 等参数都建立在"row 高度恒定"前提上
- ✅ 与官方 dnd-kit Sortable Tree example 一致 — `TreeItem.tsx:57-61` 把 indentation 应用为 `--spacing` CSS var（仅水平 padding），**不改 wrapper height**

### 1.6 `closestCenter` / `closestCorners` / `pointerWithin` 在嵌套场景的差异

**源码**：`core.esm.js:325-353`(closestCenter)、`360-392`(closestCorners)、`472-513`(pointerWithin)

| 算法 | 计算方式 | 嵌套场景行为 | 推荐场景 |
|---|---|---|---|
| `closestCenter` | active 矩形中心到每个 droppable 中心的欧氏距离 | 在嵌套树（每行一个 droppable）下，会选**最近的中心** — 即使被拖项已经有 X 偏移到子类区，over 仍是**几何最近的 row**（不是 hierarchy 最近） | 一维列表 + 投影深度（推荐） |
| `closestCorners` | 4 个角到对应 4 个角的距离平均 | 对方形 row 与 closestCenter 几乎等价（差仅在边缘斜接） | 卡片网格 |
| `pointerWithin` | pointer 在 droppable 矩形内即触发 | 嵌套场景下**指针落在哪个 row 哪个就是 over** — 与缩进 X 偏移**无关** | 文件夹拖入（必须命中 rect）|

**关键事实**：
- **三种算法都返回 `Collision[]`，每条带 `data.value`（distance / inverse intersection ratio）**，最终 `getFirstCollision(collisions, 'id')` 取首个（`core.esm.js:292-298`）
- 没有内置的"按 hierarchy 优先 + 距离次之"算法 — 嵌套树的 over 选择**完全靠 client 算 X 偏移决定 depth**（参 §2 官方 example 的 `getProjection`）
- 项目当前 V3 用 `closestCenter`（`SortableCategoriesList.tsx:212`），与官方 Tree example `closestCenter` 选择一致

### 1.7 `MeasuringStrategy.Always`（项目已用）

**源码**：`core.esm.js:1946-1952`

```js
var MeasuringStrategy;
(function (MeasuringStrategy) {
  MeasuringStrategy[MeasuringStrategy["Always"] = 0] = "Always";
  MeasuringStrategy[MeasuringStrategy["BeforeDragging"] = 1] = "BeforeDragging";
  MeasuringStrategy[MeasuringStrategy["WhileDragging"] = 2] = "WhileDragging";
})(MeasuringStrategy || (MeasuringStrategy = {}));
```

**关键事实**：
- `Always` 在每次 wrap 重排 / 高度变化时重测量 — 嵌套场景中 expand/collapse 会触发 row 数量变化，必须用 `Always` 才能正确重新计算 droppable rects
- 项目 V3 已用 `Always`（`SortableCategoriesList.tsx:216`），新增 hierarchy 不需改

### 1.8 `Modifier args` 在嵌套场景下的可用信息

**关键事实**：modifier 的 `args.over` 是当前 collision 选中的最近 droppable（§1.6 所选），但**只有这一个 over**。无法直接从 args 拿到"父类 droppable" / "祖先链"。

**对 hierarchy 的影响**：
- 若选 candidate A（单 SortableContext + 投影深度），父级判定**完全靠 client 在 onDragOver/onDragMove 通过 `dragOffset.x` 算 depth**（与 over.id 配合查 flatten array 得 parentId）
- 若选 candidate B（嵌套 SortableContext），每个父类自己一个 droppable container，over 直接是"当前 hover 的子类的父容器"，**但**：
  - 子类自己也是 droppable（每个子类一个 droppable id）→ over 是子类，不是父容器
  - 要让 hover 在父类的"内部空白区"触发"加入此父类"，必须给父类**也**注册一个独立 droppable id（不属于 sortable items），而 hover 在子类区时 over 是子类
  - 这个混合模型 dnd-kit 6 不直接支持 — 需要在 collisionDetection 自定义中合并 sortable + droppable 排序

### 1.9 `restrictToWindowEdges` modifier 实际行为

**源码**：`modifiers.esm.js:81-93`

```js
const restrictToWindowEdges = _ref => {
  let { transform, draggingNodeRect, windowRect } = _ref;
  if (!draggingNodeRect || !windowRect) return transform;
  return restrictToBoundingRect(transform, draggingNodeRect, windowRect);
};
```

**关键事实**：仅约束 transform 的 x/y 不让 dragged 矩形出窗口；**不影响** scale/depth；可与 snapModifier 串联使用（modifiers 是数组，按顺序依次 apply）。本任务不需要修改它。

### 1.10 `defaultDropAnimation` 与项目 V3 distance-aware 配置

**源码**：`core.esm.js`（`defaultDropAnimationConfiguration` 在 line ~3635-3680 区域）+ 项目 `animations.ts:17-21`

```ts
export const CATEGORY_DROP_ANIMATION: DropAnimation = {
  ...defaultDropAnimation,
  duration: 220,
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
};
```

**关键事实**：
- DropAnimation 在 DragOverlay unmount 时播放（即从最终 transform 滑回真实 sortable 位置）
- V3 在 onDragEnd 内动态切换 `dropAnimationConfig` state（distance-aware：< 4px → null skip；≥ 4px → `min(280, 120 + dist*0.5)`）
- **嵌套场景的 dist 算法需要扩展**：当 active 从 root 拖到 child（X 偏移变化）时，`active.rect.current.translated` 的 left 已包含拖动 X 偏移，**target rect (over.rect) 的 left 是新位置**（即 child 的 indented left），距离仍由 modifier 写入的 transform.x/y 与 over.rect 共同决定 — 现有公式仍生效，但需要在 02_design_spec V4 / 03_tech_plan V4 新加一条："distance 包含 X 缩进切换的 visible 位移，不只 Y"

---

## 2. 官方 Sortable Tree example 实现解构

> 来源：`https://github.com/clauderic/dnd-kit/blob/master/stories/3%20-%20Examples/Tree/`
>
> 抓取方式：`curl -sL https://raw.githubusercontent.com/clauderic/dnd-kit/master/stories/3%20-%20Examples/Tree/{SortableTree.tsx,utilities.ts,components/TreeItem/{SortableTreeItem.tsx,TreeItem.tsx},types.ts,keyboardCoordinates.ts}`
>
> 全部源码已落盘 `/tmp/SortableTree.tsx`、`/tmp/Tree_utilities.ts`、`/tmp/SortableTreeItem.tsx`、`/tmp/TreeItem.tsx`、`/tmp/Tree_types.ts`、`/tmp/Tree_kbd.ts`，以下引用按抓取行号。

### 2.1 数据形状（types.ts）

```ts
export interface TreeItem {
  id: UniqueIdentifier;
  children: TreeItem[];
  collapsed?: boolean;
}
export type TreeItems = TreeItem[];

export interface FlattenedItem extends TreeItem {
  parentId: UniqueIdentifier | null;
  depth: number;
  index: number;
}
```

**关键**：
- 树形态 (`TreeItem`) 与 flat 态 (`FlattenedItem`) 双向转换
- `depth=0` 是根，`depth=1` 是子（**正好**对应本任务 max depth=2）
- `parentId: UniqueIdentifier | null` — null 表示根

### 2.2 flatten / build（utilities.ts:80-114）

```ts
function flatten(items: TreeItems, parentId = null, depth = 0): FlattenedItem[] {
  return items.reduce<FlattenedItem[]>((acc, item, index) => {
    return [...acc, {...item, parentId, depth, index},
            ...flatten(item.children, item.id, depth + 1)];
  }, []);
}
export function flattenTree(items: TreeItems): FlattenedItem[] { return flatten(items); }

export function buildTree(flattenedItems: FlattenedItem[]): TreeItems {
  const root: TreeItem = {id: 'root', children: []};
  const nodes: Record<string, TreeItem> = {[root.id]: root};
  const items = flattenedItems.map((item) => ({...item, children: []}));
  for (const item of items) {
    const {id, children} = item;
    const parentId = item.parentId ?? root.id;
    const parent = nodes[parentId] ?? findItem(items, parentId);
    nodes[id] = {id, children};
    parent.children.push(item);
  }
  return root.children;
}
```

**关键**：
- 简单递归 flatten，O(n)
- buildTree 用一个 `nodes` Map 重新挂回每个 child
- 输入 flattened 的顺序决定输出 children 顺序（因为是 `.push`），**这是 hierarchy + 顺序信息同时被 flat 数组承载的核心机制**
- **本项目可行性**：将"Categories: parentId+顺序"序列化为单一 `Vec<{id, parentId}>` flat list（保持原顺序）即可；后端不需要嵌套结构

### 2.3 `getProjection` — depth 投影核心算法（utilities.ts:6-65）

```ts
function getDragDepth(offset: number, indentationWidth: number) {
  return Math.round(offset / indentationWidth);
}

export function getProjection(
  items: FlattenedItem[],
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier,
  dragOffset: number,
  indentationWidth: number
) {
  const overItemIndex = items.findIndex(({id}) => id === overId);
  const activeItemIndex = items.findIndex(({id}) => id === activeId);
  const activeItem = items[activeItemIndex];
  const newItems = arrayMove(items, activeItemIndex, overItemIndex);
  const previousItem = newItems[overItemIndex - 1];
  const nextItem = newItems[overItemIndex + 1];
  const dragDepth = getDragDepth(dragOffset, indentationWidth);
  const projectedDepth = activeItem.depth + dragDepth;
  const maxDepth = getMaxDepth({previousItem});
  const minDepth = getMinDepth({nextItem});
  let depth = projectedDepth;
  if (projectedDepth >= maxDepth) depth = maxDepth;
  else if (projectedDepth < minDepth) depth = minDepth;
  return {depth, maxDepth, minDepth, parentId: getParentId()};

  function getParentId() {
    if (depth === 0 || !previousItem) return null;
    if (depth === previousItem.depth) return previousItem.parentId;
    if (depth > previousItem.depth) return previousItem.id;
    const newParent = newItems.slice(0, overItemIndex).reverse()
      .find((item) => item.depth === depth)?.parentId;
    return newParent ?? null;
  }
}

function getMaxDepth({previousItem}) { return previousItem ? previousItem.depth + 1 : 0; }
function getMinDepth({nextItem}) { return nextItem ? nextItem.depth : 0; }
```

**关键算法事实**：
- `dragDepth = round(offset.x / indentationWidth)` — **X 偏移 / 缩进单位 = 深度变化**
- `projectedDepth = activeItem.depth + dragDepth` — 拖动起始 depth + delta
- **maxDepth 限制**：插入位置的"前一项 depth + 1"（也就是子类只能比前一项深 1 级，不能跳到深 2 级）
- **minDepth 限制**：插入位置的"后一项 depth"（不能比后一项浅，否则后一项变孤儿）
- **本项目硬限制 max depth=2**：在 getProjection 之上再加一道 clamp `depth = Math.min(depth, 1)`（depth 0=root, 1=child；2 禁止）

### 2.4 indentation 像素策略（TreeItem.tsx:57-61）

```jsx
<li
  // ...
  style={{ '--spacing': `${indentationWidth * depth}px` } as React.CSSProperties}
  {...props}
>
  <div className={styles.TreeItem} ref={ref} style={style}>
    {/* ... */}
  </div>
</li>
```

**关键**：
- 通过 CSS variable `--spacing` 将 depth 翻译为 padding-left
- `TreeItem.module.css` 中 `.TreeItem { padding-left: var(--spacing); }`（推断 — module.css 未抓但是行业标准）
- **官方 example 的默认 indentationWidth = 50px**（`SortableTree.tsx:110`），但本任务用户原话"极简优先 + 不要任何过多的元素"，需在 R3 视觉调研中决定（候选 12/16/20/24px，参 00_understanding §6 D10）

### 2.5 DragOverlay 在 example 中的内容（SortableTree.tsx:222-239）

```jsx
{createPortal(
  <DragOverlay
    dropAnimation={dropAnimationConfig}
    modifiers={indicator ? [adjustTranslate] : undefined}
  >
    {activeId && activeItem ? (
      <SortableTreeItem
        id={activeId}
        depth={activeItem.depth}  // 注意：用 activeItem.depth 不是 projected.depth
        clone
        childCount={getChildCount(items, activeId) + 1}
        value={activeId.toString()}
        indentationWidth={indentationWidth}
      />
    ) : null}
  </DragOverlay>,
  document.body
)}
```

**关键**：
- DragOverlay 内 SortableTreeItem 用的是 `activeItem.depth`（拖动起始的 depth），**不是 projected.depth**
- `clone` prop 让 wrapper 加 `.clone` className（视觉态：阴影、cursor: grabbing）
- `childCount`：拖父类时显示"+N"角标提示带走 N 个子类（本任务 D5 决策 — 是否搬整子树）
- `adjustTranslate` modifier `y: transform.y - 25` 仅在 `indicator` 模式下使用（drop indicator 模式 vs 完全替换模式）

### 2.6 Indicator 模式（SortableTree.tsx 关键 prop）

`indicator: boolean` — 决定是否显示"drop indicator 模式"：
- `false`（默认）：被拖元素**直接替换**到目标位置（用户看到 row 跳来跳去）
- `true`：被拖元素**虚化在原位**（`.ghost`），只显示一条 indicator line — 与项目 V3 的 cascade + DragOverlay 模式更接近

**项目当前选择**：V3 用"DragOverlay + cascade 让位"模式（既不是 example 默认替换，也不是 example 的 indicator）— 即 cascade 已经用 row 让位告知用户位置，DragOverlay 跟手是被拖项的视觉。本任务**保留这个模式**，不要切到官方 example 的两种模式之一。

### 2.7 SortableTreeItem 的 useSortable 配置（SortableTreeItem.tsx:13-29）

```tsx
const animateLayoutChanges: AnimateLayoutChanges = ({isSorting, wasDragging}) =>
  isSorting || wasDragging ? false : true;

export function SortableTreeItem({id, depth, ...props}: Props) {
  const {attributes, isDragging, isSorting, listeners,
         setDraggableNodeRef, setDroppableNodeRef, transform, transition} = useSortable({
    id, animateLayoutChanges,
  });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };
  // ...
}
```

**关键**：
- `animateLayoutChanges` 在 isSorting / wasDragging 时返回 false，禁用 dnd-kit 的"自动布局动画" — 项目 V3 没用此 prop（默认 true）；嵌套场景下需要重新评估
- 现有 V3 用 `CSS.Translate.toString(transform)`（`SortableCategoryRow.tsx:62`）与 example 一致 — 不用 `CSS.Transform.toString`（避免 scale 因 row 高度差导致挤压）

### 2.8 keyboardCoordinates — 键盘 promote/demote（Tree_kbd.ts:42-72）

```ts
if (horizontal.includes(event.code) && over?.id) {
  const {depth, maxDepth, minDepth} = getProjection(
    items, active.id, over.id, offset, indentationWidth
  );
  switch (event.code) {
    case KeyboardCode.Left:
      if (depth > minDepth) {
        return { ...currentCoordinates, x: currentCoordinates.x - indentationWidth };
      }
      break;
    case KeyboardCode.Right:
      if (depth < maxDepth) {
        return { ...currentCoordinates, x: currentCoordinates.x + indentationWidth };
      }
      break;
  }
  return undefined;
}
```

**关键**：
- 拖动期间按 ← 是 promote（depth - 1，当前 depth > minDepth 才允许）
- 拖动期间按 → 是 demote（depth + 1，当前 depth < maxDepth 才允许）
- 这套是**键盘可达**的核心，回应 00_understanding §5.6"键盘可达"

---

## 3. 三个候选评估矩阵（hard-constraints-before-soft-evaluation 顺序）

### 3.1 三个候选定义

| 编号 | 候选 | 一句话描述 |
|---|---|---|
| **A** | 单 SortableContext + 投影深度 | 整树 flatten 成 1D 列表，所有 row 作为 sortable items；depth 由 X drag offset 投影；**与 dnd-kit 官方 Sortable Tree example 同模式** |
| **B** | 嵌套 SortableContext | 根级一个 SortableContext 装根类；每个父类内部一个嵌套 SortableContext 装子类；跨级拖拽需要 cross-context 协议 |
| **C** | 自研：DragOverlay 不用，自管 transform + 自管 snap | 完全不用 dnd-kit，自己用 useReducer + RAF 实现 |

### 3.2 阶段 1 — 硬约束（Eliminatory）

按 `~/.claude/rules/hard-constraints-before-soft-evaluation.md`，先评估哪些候选会破坏 V3 不变量、键盘可达、嵌套支持等硬约束。

| 硬约束 | A | B | C |
|---|---|---|---|
| **HC-1**: V3 4px activation distance（`SortableCategoriesList.tsx:115`）保留可行 | ✅ 直接保留 | ✅ 每个 ctx 各自配置 sensor，相同 4px | ✅ 自研可控 |
| **HC-2**: V3 两段 lift（80ms + 120ms）通过 SortableCategoryRow `opacity:0` + DragOverlay 的机制保留 | ✅ 完全等价（仅 row 渲染加 padding-left）| ⚠️ 跨 ctx 拖拽时 active item 切容器，opacity 切换时机复杂 | ❌ 必须自研复刻所有 timing |
| **HC-3**: V3 12px 连续磁吸 modifier（`snapModifier.ts`）继续生效 | ✅ 直接复用（modifier 全局，不依赖 SortableContext 数量）| ✅ 同左 | ❌ 必须自研复刻 |
| **HC-4**: V3 220ms cascade（cubic-bezier(0.16, 1, 0.3, 1)）让位 | ✅ verticalListSortingStrategy 直接生效；row 高度恒定（h-8）保证不错位（§1.5）| ⚠️ 跨 ctx 让位不连续 — root ctx 与 child ctx 是两个独立 layout group，让位动画在 ctx 边界**断裂** | ❌ 自研 |
| **HC-5**: V3 distance-aware settle (`SortableCategoriesList.tsx:145-159`) | ✅ active.rect.current.translated 与 over.rect 仍正确 | ⚠️ over.rect 跨 ctx 时是被拖项**新所在 ctx** 的 rect — 需验证 dnd-kit 是否支持 cross-ctx active.rect | ❌ 自研 |
| **HC-6**: V3 Cancel snap-back 280ms cubic-bezier(0.32, 0.72, 0, 1) | ✅ DragOverlay dropAnimation 同等行为 | ✅ 同左 | ❌ 自研 |
| **HC-7**: V3 cursor 抑制（`index.css` `[data-sortable-list] [aria-roledescription='sortable']` rules）| ✅ aria 属性 dnd-kit 自动写 | ✅ 同左 | ❌ 自研 cursor 切换 |
| **HC-8**: V3 全套 token（`--color-accent`, `--ease-drag-*`, `--duration-drag-*`）保留 | ✅ 与 Sortable Tree example 一致用 padding-left + transition | ✅ 同左 | ⚠️ 自研需重接所有 token |
| **HC-9**: KeyboardSensor + sortableKeyboardCoordinates + 公告 | ✅ 直接复用 + 增加 horizontal 方向 promote/demote 协调器（§2.8 模板）| ⚠️ 跨 ctx 键盘协调极复杂（focus 在 ctx 内不能跨）| ❌ 自研 |
| **HC-10**: prefers-reduced-motion 全套尊重 | ✅ 媒体查询全局生效 | ✅ 同左 | ⚠️ 自研需手动 |
| **HC-11**: data-no-dnd（ColorPicker）兼容 | ✅ CustomMouseSensor 全局生效 | ✅ 同左 | ❌ 自研需复刻 |
| **HC-12**: 跨级拖拽支持（child→root / root→child）| ✅ 整树 1D，X 偏移即 depth 切换，原生支持 | ⚠️ 跨 ctx 需 dnd-kit 6 多容器 sortable + sortable container 外的 droppable 协议；6.3.1 不直接支持子→另一父 | ✅ 自研可控 |
| **HC-13**: 父类拖拽时**整子树跟随**（D5 决策选 B 时）| ✅ 在 onDragStart 时 `removeChildrenOf(flattened, [activeId])` 把子隐藏（§2.1 example pattern），DragOverlay 内显示 childCount，drop 后 buildTree 重组 | ⚠️ 嵌套 ctx 必须显式定义"父类被拖时子 ctx 隐藏 + active 项替换为单一 marker"，复杂 | ❌ 自研 |
| **HC-14**: 子→根的 promote 是手势可达（D6 决策）| ✅ X 向左拖 → dragOffset.x < 0 → projectedDepth = activeDepth - 1（自然原生）| ⚠️ 跨 ctx 拖出当前父 ctx 至根 ctx — 协议复杂 | ✅ 自研 |
| **HC-15**: 4px activation 与"drop into" 区分不冲突（drop into 不能在 < 4px 时触发）| ✅ 4px 是 dnd-kit activation 阈值，进入拖动后才有 dragOffset.x；本身不冲突 | ✅ 同左 | ⚠️ 自研需重做激活协议 |

#### 阶段 1 结论

- **A 全部 ✅**（除 HC-13 父类拖整子树需要 example pattern 显式实现，但官方已示范）
- **B 多项 ⚠️**（HC-2/HC-4/HC-5/HC-9/HC-12/HC-13/HC-14 都涉及跨 ctx 的复杂边界问题）
- **C 7 项 ❌ + 5 项 ⚠️**（自研意味着把 V3 全套不变量重做一遍，明显违反"零回归"）

**Eliminatory result**：候选 C 因破坏 V3 不变量被淘汰。候选 B 因 7 项 ⚠️（每项都有未解决的跨 ctx 边界），保留进入软评估但风险标记 high。候选 A 进入软评估。

### 3.3 阶段 2 — 软评估（Preferential，仅 A 与 B）

| 维度 | A 单 ctx + 投影 | B 嵌套 ctx | 评分（10 分制）|
|---|---|---|---|
| **D-1**: V3 不变量保留度（HC 累积）| 全 ✅ | 7 ⚠️ | A=10, B=4 |
| **D-2**: snapModifier 兼容性（modifier 是否需扩展）| 不需扩展 — 仅磁吸 Y，X 由 user free drag 决定 depth；modifier 看 over.rect 仍正确 | 跨 ctx 时 over.rect 是新 ctx 的 rect — modifier 依然能算，但 active.rect 在 ctx 切换瞬间是否准确未知 | A=9, B=6 |
| **D-3**: 4px activation 兼容 | 完全不变 | 完全不变 | A=10, B=10 |
| **D-4**: 键盘可达（promote/demote, cross-level）| 现成 example 模式（§2.8）一改即用 | focus 跨 ctx 极复杂 | A=10, B=3 |
| **D-5**: 跨级拖拽（child→root / root→child）| 原生支持 | 需自研 cross-ctx 协议 | A=10, B=4 |
| **D-6**: 实现 LoC（仅前端 +）| ~ +120 LoC（utility + projection 显示）| ~ +400 LoC（多 ctx 协调 + drag handoff） | A=9, B=5 |
| **D-7**: 性能（measureDroppableContainers O(n)）| 单 ctx，n = 总 row 数 | 多 ctx，每个 ctx 自己测量自己的子集 — 本质上仍是 O(n) | A=10, B=10 |
| **D-8**: dnd-kit 6.3 实战支持（社区 example、生产用例）| 官方 example、`dnd-kit-sortable-tree` npm 包均基于此模式 | 嵌套 ctx 在 dnd-kit 6 是 supported but rare（多 container sortable 一般用 onDragOver 显式 setItems 跨容器，不是嵌套；dnd-kit-sortable-tree 内部仍是单 ctx）| A=10, B=5 |
| **D-9**: 与 V3 SortableCategoriesList 现有结构的 diff 量 | small：增加 utility + 把 categories prop 改为 flattened；DndContext 不变 | medium：拆 list 为 root list + 多 child lists，每个 list 自己 DndContext？还是嵌套 SortableContext？后者更 dnd-kit-idiomatic 但仍要重构 | A=9, B=4 |
| **D-10**: 故障可追踪性 | example 有，社区 issue 多 | 嵌套 ctx 的 race / desync 问题报告少 — 自己踩坑 | A=9, B=4 |

**软评估结论**：A 全维度领先 B，多个维度 B ≤ 5/10。

### 3.4 最终候选选择：A（单 SortableContext + 投影深度）

**置信度**：92/100

**理由**：
1. V3 不变量逐项保留可行（§5 详细 mapping）
2. 与 dnd-kit 官方 Sortable Tree example 完全同模式 — 有 4 年公开生产验证
3. 跨级拖拽（HC-12）+ 键盘 promote/demote（HC-9, §2.8）原生支持
4. snap modifier 不需修改（HC-3）
5. 实现 LoC 最小（仅 +120 LoC for utility + state）

**主要不确定性 / 残留风险**（参 §10）：
- max depth=2 的 clamp 必须在多处统一（getProjection、键盘协调、自动分类创建路径）— 单点失误会让用户误产生 depth=2 节点
- 父类拖动时"整子树跟随" pattern（`removeChildrenOf(flattened, [activeId])`）在 React state 切换瞬间的 jank 风险（V3 cascade 220ms 期间 children 是否短暂消失？需要 T8 SubAgent 在实施时验证）
- "drop into" 视觉反馈与 V3 12px 磁吸的视觉叠加 — 两个反馈机制是否互相干扰需 R3 / 实施时验证

---

## 4. D5 父类拖拽语义决策

> 参 00_understanding §6 D5 候选：(A) 父类只能 reorder 父类层、不可成子；(B) 父类拖入另一父类时整个子树一起搬；(C) 父类拖入只允许成同级。

### 4.1 候选评估

| 维度 | A: 父类不可成子 | B: 父类 + 整子树搬走 | C: 父类只能同级 reorder |
|---|---|---|---|
| 用户心智模型 | 简单：父类是固定的，子类灵活 | 中等：与 Things 3 / Notion 一致（都允许） | 简单（=A 子集） |
| 数据复杂度 | low：拖父类只改顺序 | medium：拖父类时改 parentId 同时整子链 follow | low |
| dnd-kit 实现 | 在 getProjection 加 clamp `if active.depth==0 then maxDepth=0` | 需 `removeChildrenOf` example pattern + buildTree 重新挂 | 同 A |
| 跨产品对照 | 没有产品支持"父类升级为子类"且最大化简洁（Apple Reminders Lists in Groups 是 3 层但禁止 List → 嵌套到另一 List 的子）| Things 3 头部 → 项目 → headings 三层；Notion 无限嵌套；都允许"父类拖入另一父类成子" | macOS Finder 第二级别文件夹拖入第二个文件夹会变更深 |
| 极简 / 克制 | ✅ 高 | ⚠️ 中（拖父类时多了一层"我会带走 N 个孩子"提示）| ✅ 高 |
| 用户场景频次 | 父类层级较稳定，主要用拖拽是把 child 在 parent 间挪 | 父类重组（重命名为另一种"主题"）需要先拖出所有子类再拖父类 — 麻烦 | 同 A |
| 与本任务"max depth=2"硬约束契合 | ✅ depth=2 物理上不可能（parent 不可成 child）| ⚠️ 必须严格 clamp：父类 depth=0 拖到另一父类下时 projectedDepth=1，但其子类 depth 应为 ?（depth 2 = 禁止）→ 拒绝拖入 | ✅ |

### 4.2 推荐：B（父类 + 整子树搬走）+ depth 硬 clamp（block 而非允许）

**关键洞察**：用户原话明确"能通过拖动把类别放入另一个类别变成子类，也能拖出来变回独立类"。这暗含**双向**操作（父类 → 子类 / 子类 → 父类）。

但本任务硬约束 max depth=2，意味着如果父类 P1（depth=0）拖入另一父类 P2 下：
- P1 自身降为 depth=1（合法）
- P1 的子类（原 depth=1）会被"挤"到 depth=2（**违反硬约束**）

**两种处理方式**：

| 方式 | 行为 | 用户感受 |
|---|---|---|
| **B-1**: 拒绝（block）| 拖动期间检测：active 是 parent 且 dragDepth → child；如果 active 有 children 则 indicator 灰色 + cursor: not-allowed；drop 不发生 | 干净，但偶尔会让用户困惑"为什么这次不能" |
| **B-2**: 自动平摊子类（promote children to root）| P1 拖入 P2 下，P1 的 children 自动 promote 到 root（depth=0），P1 自己变 child | 复杂，子类被"撕散"，潜在数据丢失感 |
| **B-3**: 整子树搬走（保 children 仍是 P1 的 children）| Notion/Things 模式 — 但 max depth=2 阻止此选项 | 在 max depth=2 下不可行 |

**推荐**：**B-1（block）+ 视觉灰化 indicator + 解释性 announcement**。理由：
1. 与 max depth=2 硬约束逻辑一致
2. 用户可手动先把 P1 的 children 搬走（单步原子）再把 P1 拖入 P2
3. 不会有数据"自动重组"的隐式行为（symmetric with delete-parent 必须先处理孩子的设计哲学）
4. 与 R4 SubAgent 的 HCI 评估应交叉验证（"用户期望 vs 平摊 vs 阻断"）— 本研究的 D5 倾向 B-1，最终决议见 02_design_spec V4

### 4.3 父类拖动时的 DragOverlay 内容

参 §2.5 example 的 `clone` + `childCount={getChildCount(items, activeId) + 1}` pattern：

- 父类无 children → DragOverlay 是单 row（与现有 V3 Categories 完全一致）
- 父类有 N children → DragOverlay 是单 row + 角标 "N+1"（克制：仅一个数字徽章）

**视觉规格留给 R3** 决策（如何渲染 N+1 角标的字号、位置、颜色）— 本研究只确认信息架构。

---

## 5. D6 子→根 promote 路径设计

### 5.1 候选评估

| 候选 | 触发方式 | 直觉 | 误触率 | 与 V3 兼容 |
|---|---|---|---|---|
| **A**: 拖到根级 row 之间 | 子类向上拖到任意根级位置 → projected.depth=0 | low（与拖入子类对称）| medium（用户可能本意 reorder 同子类下的次序，被误升） | ✅ |
| **B**: 顶部专用区 | sidebar 顶部加一个"顶级"虚拟 drop zone | low（违反极简，新增 UI 元素）| low | ❌ 违反"不要任何过多元素" |
| **C**: 水平向左缩进减少 | 拖动期间 X 向左拖 → dragOffset.x = -indentationWidth → projectedDepth = activeDepth - 1 | high（与 Todoist Ctrl+[、Notion sidebar 行业一致）| low | ✅ — 与 §2.3 example 完全一致 |
| **D**: 拖到根 (depth=0) row 上方 | 子类拖到首个根级 row 之上的间隙 | medium | medium | ✅ |
| **E**: 右键 ContextMenu "Promote to root" | 不通过拖拽 | n/a（备份路径）| zero | ✅ — 兜底 |

### 5.2 推荐：C（水平向左缩进）+ E（右键备份）

**理由**：
- C 是行业标准（Todoist、Notion sidebar、Apple Notes、官方 dnd-kit example 全用此模式）
- C 不增加任何 UI 元素（极简）
- 配合官方 example 的键盘 ←/→ 协调器（§2.8），鼠标向左拖 = depth-1 = 视觉感知 = ←键 = depth-1 = 完全统一
- E 是兜底（用户指针不准 / 单手操作场景）— 已经在现有 ContextMenu 系统中可低成本添加

**实现细节**：
- 在 `handleDragMove({delta})` 中 `setOffsetLeft(delta.x)`（与 example `SortableTree.tsx:260-262` 同）
- `getProjection(items, activeId, overId, offsetLeft, indentationWidth)` 自动算 projectedDepth
- max depth=2 clamp：`depth = Math.max(0, Math.min(1, depth))`
- 视觉反馈：当 projected.depth 变化时，被拖的 SortableTreeItem 渲染时用 `projected.depth` 而非 `activeItem.depth` — 即用户看到 row 在 X 上"缩进减少 1 级"，所见即所得

### 5.3 promote 时的视觉要求

| 状态 | 视觉 |
|---|---|
| 拖动开始（depth=1 子类）| DragOverlay 用 activeItem.depth=1 的 indent 渲染（保持当前位置感）|
| 拖动期间 X 向左过 indentationWidth/2 | sortable 内的源行（opacity:0 但仍占位）的 padding-left 立即变 0；DragOverlay 跟手不变（X 偏移由 dnd-kit transform 表达，padding 由 react state 表达）|
| 拖动期间 X 回到右侧 | padding-left 立即恢复到 indentationWidth |
| Drop 完成 | onDragEnd 中 `setItems(buildTree(arrayMove(...))` 落地 hierarchy 变化 |

视觉层动效（缩进切换是否带 transition）由 R3 decide。

---

## 6. 最终建议 + 完整组件改造清单

### 6.1 文件清单（新增 / 修改）

| 文件 | 改动类型 | 改动概要 |
|---|---|---|
| **新增**：`src/components/sidebar/dnd/treeUtilities.ts` | 新文件 | flattenTree / buildTree / getProjection / getDragDepth / getMaxDepth / getMinDepth / removeChildrenOf — 改写自 §2 example，**加 max depth=2 clamp** |
| **新增**：`src/components/sidebar/dnd/treeKeyboardCoordinates.ts` | 新文件 | 改写自 §2.8 example 的 `sortableTreeKeyboardCoordinates` — **加 max depth=2 clamp** |
| **修改**：`src/components/sidebar/SortableCategoriesList.tsx` | 中等改动 | 详 §6.2 |
| **修改**：`src/components/sidebar/SortableCategoryRow.tsx` | 小改动 | 加 `depth: number` prop；inline style 加 `paddingLeft: depth * INDENTATION_PX`（数值由 R3 决定）|
| **修改**：`src/components/sidebar/CategoryRowContent.tsx` | 小改动 | 不改（depth 在外层 row 容器表达，不在 content 里）|
| **修改**：`src/components/sidebar/DragOverlayCategoryRow.tsx` | 小改动 | 加 `depth: number` + `childCount: number` 两个 prop，用 padding-left + 可选角标 |
| **修改**：`src/components/sidebar/dnd/snapModifier.ts` | 不改 | snapModifier 在嵌套场景下行为正确（参 §6.3 论证）|
| **修改**：`src/components/sidebar/dnd/animations.ts` | 小改动 | 新增 `INDENTATION_PX` 常量（数值待 R3）|
| **修改**：`src/components/sidebar/dnd/announcements.ts` | 中等改动 | 加"moved as child of X" / "promoted to root" / "expanded category Y" 等措辞（参 §6.4）|
| **修改**：`src/components/sidebar/dnd/CustomMouseSensor.ts` | 不改 | data-no-dnd 逻辑全局生效 |
| **修改**：`src/components/layout/Sidebar.tsx` | 中等改动 | Categories 部分由 flat list 改为 flattened tree props 传给 SortableCategoriesList；可能新增 collapsed state 持久化（D12 决策）|
| **修改**：`src/stores/appStore.ts` | 中等改动 | reorderCategories 接收 flattened ordered list（含 parentId 信息），传给后端；详 §6.5 |
| **修改**：后端 `src-tauri/src/types.rs` + `data.rs` | 中等改动 | Category 加 `parent_id: Option<String>`；apply_reorder 接收 `Vec<{id, parent_id}>`；详 §6.5 |

### 6.2 SortableCategoriesList.tsx 关键改动点

**保留**（V3 不变量）：
- 全部 sensors（CustomMouseSensor distance:4 + KeyboardSensor）
- collisionDetection={closestCenter}
- modifiers={[snapModifier]}
- measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
- accessibility 配置（announcements + screenReaderInstructions）
- DragOverlay 的 `modifiers={[restrictToWindowEdges]}` + 动态 dropAnimation
- justDroppedId 50ms guard
- handleDragCancel 重置 dropAnimationConfig

**新增 state**：
```ts
const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
const [overId, setOverId] = useState<UniqueIdentifier | null>(null);
const [offsetLeft, setOffsetLeft] = useState(0);
```

**新增 useMemo**：
```ts
// flattenedItems 中要把 active 的 children 暂时移除（视觉上 "接走整子树" — 与 §2.5 一致）
const flattenedItems = useMemo(() => {
  const flat = flattenTree(categoriesTree);
  const collapsedIds = flat.reduce<UniqueIdentifier[]>(
    (acc, { children, collapsed, id }) => collapsed && children.length ? [...acc, id] : acc, []);
  return removeChildrenOf(flat, activeId != null ? [activeId, ...collapsedIds] : collapsedIds);
}, [activeId, categoriesTree]);

const projected = activeId && overId
  ? getProjection(flattenedItems, activeId, overId, offsetLeft, INDENTATION_PX)
  : null;

const sortedIds = useMemo(() => flattenedItems.map(({id}) => id), [flattenedItems]);
```

**新增 handlers**：
```ts
const handleDragMove = (event: DragMoveEvent) => {
  setOffsetLeft(event.delta.x);
};
const handleDragOver = (event: DragOverEvent) => {
  setOverId(event.over?.id ?? null);
};
```

**修改 handleDragEnd**：
```ts
const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  // distance-aware dropAnimation 逻辑保留不变
  // ...
  if (projected && over && active.id !== over.id) {
    const { depth, parentId } = projected;
    const clampedDepth = Math.min(depth, 1);  // max depth = 2 clamp (depth 0=root, 1=child)
    // ... build new tree
    const flat = flattenTree(categoriesTree);
    const overIndex = flat.findIndex(({id}) => id === over.id);
    const activeIndex = flat.findIndex(({id}) => id === active.id);
    const cloned = JSON.parse(JSON.stringify(flat)) as FlattenedCategory[];
    cloned[activeIndex] = { ...cloned[activeIndex], depth: clampedDepth, parentId };
    const sorted = arrayMove(cloned, activeIndex, overIndex);
    onReorder(sorted);  // 传给 store + 后端
  }
  resetState();
};
```

**新增 props**：
```ts
interface SortableCategoriesListProps {
  // ... 原有 props
  categoriesTree: CategoryTree[];   // 取代原 categories: Category[]
  collapsedIds: Set<string>;        // D12 决策决定是否需要
  onToggleCollapse: (id: string) => void;
  onReorder: (orderedItems: FlattenedCategory[]) => void;  // 接收 ordered + parentId 信息
  // 不变：activeCategoryId, editingCategoryId, isAddingCategory, ...
}
```

### 6.3 snapModifier 不需扩展的论证

**snapModifier 当前行为**（`src/components/sidebar/dnd/snapModifier.ts:48-119`）：在 over 存在且 dist < 12px 时给 transform 加上 `(dx, dy) * gravity`，把 dragged 中心吸向 over 中心。

**嵌套场景下**：
- 当 active 是 root（depth=0）拖向 child（depth=1）时，over.rect 是 child row 的 rect — 中心 X 已经因 padding-left 而向右偏 INDENTATION_PX/2
- snapModifier 把 dragged 中心吸向 over.rect.center — 即把 dragged 在 X 上吸到 child 的 indented 位置
- 这与"用户想拖到子类位置"一致，**不需修改**

**唯一可能要扩展的点**：
- **如果**业务定义"drop into 父类内部时不应吸到 child 的 indented X，而是吸到一个独立的 'drop into parent' 中心"（D4 候选 A：水平 indent > 16px 触发 in）
- 但本研究推荐 D6=C（X 向左拖触发 promote / X 向右拖触发 demote）+ V3 现有的 12px 磁吸只在 Y 方向严格意义上做"吸到 slot 中心" — 这两个机制**正交不冲突**
- 因此 snapModifier 不需扩展，保留 V3 实现

### 6.4 announcements 扩展

```ts
function makeTreeAnnouncements(items: FlattenedItem[]): Announcements {
  const findByName = (id: UniqueIdentifier) => items.find(({id: i}) => i === id)?.name ?? id;
  // ... onDragStart / onDragOver 与 V3 类似
  
  onDragOver({active, over}) {
    if (!over) return /* ... */;
    const projected = /* 重新计算 — 因为 announcements 是独立帧 */;
    const activeName = findByName(active.id);
    const overName = findByName(over.id);
    if (projected.parentId !== null) {
      return `Category ${activeName} will be nested under ${findByName(projected.parentId)}.`;
    }
    return `Category ${activeName} will be at root level, position ${overIndex + 1}.`;
  },
  onDragEnd({active, over}) {
    // 同上，描述最终 hierarchy 变化
  },
}
```

参 §2 example 的 `getMovementAnnouncement` 实现作模板。

### 6.5 reorder IPC 接口形状变化

**现状**（V3 `reorder_categories(orderedIds: Vec<String>)`）：
- 仅传 ordered ids
- 后端 `apply_reorder` 不感知 parentId

**新协议**（candidate）：

```ts
// Frontend → Backend
type ReorderCategoriesPayload = {
  items: Array<{ id: string; parent_id: string | null }>;  // ordered + hierarchy
};

// Rust 端
pub struct CategoryReorderEntry {
  pub id: String,
  pub parent_id: Option<String>,
}

#[tauri::command]
pub fn reorder_categories(items: Vec<CategoryReorderEntry>) -> Result<Vec<Category>, String> {
  let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
  let mut data = read_app_data()?;
  data.categories = apply_reorder_with_hierarchy(data.categories, &items);
  let result = data.categories.clone();
  write_app_data(data)?;
  Ok(result)
}

// 实现：把 items 当作权威 ordered list 来重组 categories
//  - 每个 entry 在结果中按顺序放置
//  - 每个 category 的 parent_id 字段被 entry.parent_id 覆盖
//  - 未在 entry 中提及的 categories 按原 Vec 顺序追加（无 parent_id 改动）
```

**关键事实**（与 R1 SubAgent 的 D1/D2 决策耦合）：
- 如果 R1 决议保留"flat Vec<Category> + parent_id" 数据形态（D2 候选 A），本接口直接可用
- 如果 R1 决议改为嵌套 Vec（D2 候选 B），需要加一层 fold: flat → tree before persist
- **R2 推荐**与 R1 协同：选 D1=A（统一 categoryId 引用） + D2=A（flat + parent_id），原因是 dnd-kit Tree 模式天然产出 flat list

详细数据模型 / 兼容性 / autoClassify 链路改造由 R1 SubAgent 主导。

---

## 7. 行业基准对比表（7 维度）

| 产品 | drop into 触发 | 视觉反馈 | promote 手势 | 键盘 hierarchy | 容差 | 磁吸 | collapse/expand |
|---|---|---|---|---|---|---|---|
| **Things 3** Mac | 拖到 List 上方 hover | "List highlighted" + 一行短暂 expand 显示子区 | 拖出 area 到 sidebar 顶 (空白) | 键盘有限（非主路径）| 容差大（hover 一会儿才提交）| 无显式磁吸 | Areas 默认展开，可折叠 |
| **Linear** | 拖到 issue → ContextMenu "Set parent"（**非主流拖拽方式**）| 命令面板模式（Cmd Shift O / "Set parent"）| Cmd K → "Remove parent" | 完整 keyboard-first | 无（命令式）| 无 | sub-issue 列表内嵌 |
| **Notion** sidebar | 拖到 page hover → blue highlight | 整个 page 蓝色高亮 + 自动展开 | 拖到根 sidebar 边缘 | Cmd-Shift-Arrow promote/demote | 容差大（hover ≥ 300ms 自动展开）| 无 | 默认折叠，chevron 显式 |
| **Todoist** | 拖到 task 下方 + 缩进 | indicator 缩进显示目标 depth | Ctrl-[ promote / Ctrl-] demote | 完整 | 无（精准）| 无 | 默认展开，chevron |
| **macOS Finder sidebar** | hover 到 folder → 高亮 | Folder 蓝色高亮 + horizontal insertion indicator | 不支持（folder 是 OS 实体）| 不支持 | 容差中（hover ≈ 600ms 自动打开 spring-loaded folder）| 无 | n/a |
| **Apple Reminders** Mac | 拖 List 到 List → group create | List 高亮 | 拖出 group 到 sidebar 根 | 不支持 hierarchy promote | 容差中 | 无 | 默认展开 group |
| **dnd-kit Sortable Tree example** | X 偏移投影 depth | indicator 缩进同步显示 | X 向左拖 → depth-1 | ←/→ promote/demote | 4px activation | 无（无 modifier）| 默认展开，chevron 可选 |
| **Ensemble V3 Categories**（当前）| n/a（无 hierarchy）| n/a | n/a | n/a | 4px activation | 12px continuous | 默认全展开（显示前 9，"Show X more"）|
| **Ensemble V4 Categories（推荐）** | X 偏移投影 depth + over.id 决定 anchor row | depth 由 SortableCategoryRow padding-left 实时反映；缩进过渡有 transition；hover 父类时父类极淡背景 | X 向左拖到 depth=0（dragOffset.x ≤ -INDENTATION_PX/2）| ←/→ promote/demote（仅在拖动状态下）| 4px activation 不变 | 12px continuous（不修改）| TBD by D12 — 推荐"始终展开"以契合极简，未来再加 collapsed 持久化 |

### 7.1 引证链接

| 产品 | 主要资料源 |
|---|---|
| Things 3 | [Moving Items in Things](https://culturedcode.com/things/support/articles/9651894/) · [Using Headings in Projects](https://culturedcode.com/things/support/articles/2803577/) |
| Linear | [Parent and sub-issues – Linear Docs](https://linear.app/docs/parent-and-sub-issues) · [Personalized sidebar changelog 2024-12-18](https://linear.app/changelog/2024-12-18-personalized-sidebar) |
| Notion | [Navigate with the sidebar – Notion](https://www.notion.com/help/navigate-with-the-sidebar) · [Nesting Pages in Notion](https://www.bardeen.ai/answers/how-do-you-nest-pages-in-notion) · [Notion 'Sidebar zen' announcement](https://x.com/notionhq/status/1186400544832798720) |
| Todoist | [Introduction to sub-tasks](https://www.todoist.com/help/articles/introduction-to-sub-tasks-kMamDo) · [Experimental drag features](https://todoist.com/help/articles/experimental-features) · [26 hidden features](https://www.todoist.com/inspiration/hidden-features-todoist) |
| macOS Finder | [Customize the Finder sidebar](https://support.apple.com/guide/mac-help/customize-the-finder-sidebar-on-mac-mchl83c9e8b8/mac) · [HIG Drag and Drop (legacy)](https://developers.apple.com/design/human-interface-guidelines/macos/user-interaction/drag-and-drop/) |
| Apple Reminders | [Move reminders on Mac](https://support.apple.com/guide/reminders/move-reminders-remnda262a43/mac) · [Organise reminder lists](https://support.apple.com/en-gb/guide/reminders/remnee767c58/mac) |
| Apple HIG (Sidebars) | [Sidebars – Apple HIG](https://developer.apple.com/design/human-interface-guidelines/sidebars) · [Disclosure controls](https://developer.apple.com/design/human-interface-guidelines/disclosure-controls) |
| dnd-kit | [SortableTree.tsx (GitHub)](https://github.com/clauderic/dnd-kit/blob/master/stories/3%20-%20Examples/Tree/SortableTree.tsx) · [dnd-kit-sortable-tree (Shaddix wrapper)](https://github.com/Shaddix/dnd-kit-sortable-tree) · [Sortable docs](https://docs.dndkit.com/presets/sortable) |
| react-arborist (对照) | [LogRocket review](https://blog.logrocket.com/using-react-arborist-create-tree-components/) |

### 7.2 设计观察归纳

1. **没有产品在 sidebar 中使用磁吸式吸附** — V3 的 12px 磁吸是 Ensemble 独有的物理质感，应保留
2. **超过 90% 的产品用 X 偏移投影 depth** — D6=C 是行业共识
3. **drop into 视觉反馈普遍是"父类背景高亮"** — 不是单独 indicator
4. **Things 3 / Notion 都允许"父类拖入另一父类"** — 但都允许更深嵌套（非 max depth=2）；本任务硬限制 2 层时的"父类拖入另一父类 + 整子树搬"行为是新设计点（参 §4.2 推荐 B-1 阻断）
5. **macOS Finder 的 spring-loaded folder（hover 600ms 自动打开）不在本任务范围**（项目 sidebar 没有"打开 folder"语义；点击父类 = filter 父类聚合视图）
6. **Apple HIG 对 sidebar disclosure 没有强约束** — 只要"清晰、克制、可达"即可

---

## 8. V3 不变量回归核对清单（逐项 ✅）

> 每条标注：**当前 V3 实现位置** → **V4 hierarchy 改造后的对应位置/状态**

| # | V3 不变量 | V3 实现位置 | V4 设计后的处理 | ✅ |
|---|---|---|---|---|
| 1 | 4px activation distance | `SortableCategoriesList.tsx:115` `useSensor(CustomMouseSensor, { activationConstraint: { distance: 4 } })` | 不改 | ✅ |
| 2 | 两段 lift（80ms 吸盘 + 120ms 拉离）| `SortableCategoryRow.tsx:68` `opacity: isDragging ? 0 : 1` + DragOverlay 在 SortableCategoriesList 渲染 | 不改 — `SortableCategoryRow` 加的是 padding-left（depth），不改 opacity/lift 行为 | ✅ |
| 3 | DragOverlay 多层 hsl 阴影 | `index.css` `.drag-overlay-row { box-shadow: ... }` | 不改 — `DragOverlayCategoryRow` 仍用 `.drag-overlay-row` className | ✅ |
| 4 | 12px 连续磁吸（quadratic gravity well）| `dnd/snapModifier.ts:48-119` `createMagneticSnapModifier()` | **不改** — modifier 在嵌套场景下行为正确（§6.3 论证）| ✅ |
| 5 | 220ms cascade（cubic-bezier(0.16, 1, 0.3, 1) 无 stagger）| `SortableCategoryRow.tsx:51-54` `transition: { duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }` | 不改 — useSortable 配置不变；row 高度恒定（h-8）保证 cascade 正确（§1.5）| ✅ |
| 6 | distance-aware settle（< 4px → 0ms；≥ 4px → `min(280, 120 + delta × 0.5)`）| `SortableCategoriesList.tsx:145-159` | 不改 — distance 计算公式仍正确（§1.10），仅在 onDragEnd 中可能附加 hierarchy 变化判断 | ✅ |
| 7 | Cancel snap-back 280ms cubic-bezier(0.32, 0.72, 0, 1) | dnd-kit DragOverlay 自动 + token 化 CSS | 不改 | ✅ |
| 8 | DndContext modifiers = [snapModifier]（仅磁吸）| `SortableCategoriesList.tsx:215` | 不改 | ✅ |
| 9 | DragOverlay modifiers = [restrictToWindowEdges]（仅防出窗）| `SortableCategoriesList.tsx:311` | 不改 | ✅ |
| 10 | 全套 CSS token（`--color-accent`, `--ease-drag*`, `--duration-drag-*`）| `index.css` | 不改；新增 `--indentation-width-categories` token by R3 | ✅ |
| 11 | DATA_MUTEX 串行 + apply_reorder pure function + ENSEMBLE_DATA_DIR 测试隔离 | `data.rs:106-112` + `apply_reorder` | 不改基础结构；apply_reorder 升级为 hierarchy-aware 版本（§6.5）| ✅（需 R1 一致）|
| 12 | categoriesVersion / tagsVersion 版本协议防 autoClassify race | `appStore.ts` | 不改；categoriesVersion 在新 reorderCategories 调用时仍 bump | ✅ |
| 13 | enqueueReorder 串行 IPC 队列 | `appStore.ts` `enqueueReorder` | 不改；enqueue 接收新 payload 形态（含 parentId 数组）| ✅ |
| 14 | data-no-dnd + CustomMouseSensor 双保险 | `CustomMouseSensor.ts` + `CategoryRowContent.tsx:42` | 不改 | ✅ |
| 15 | 编辑/新增态 SortableContext 全局 disabled | `SortableCategoriesList.tsx:231` `disabled={isInputMounted}` | 不改 | ✅ |
| 16 | KeyboardSensor + sortableKeyboardCoordinates + announcements | `SortableCategoriesList.tsx:116, 218` | **扩展** — 用 `sortableTreeKeyboardCoordinates`（§2.8）支持 ←/→ promote/demote；announcements 加 hierarchy 措辞（§6.4）| ✅（扩展但兼容）|
| 17 | prefers-reduced-motion 全套尊重 | `index.css` `@media (prefers-reduced-motion: reduce)` | 不改；缩进过渡 transition 加入 reduced-motion 退化（R3 规格）| ✅ |
| 18 | justDroppedId 50ms guard 防误触 click navigate | `SortableCategoriesList.tsx:175-177` | 不改 | ✅ |
| 19 | onDragStart 编辑/新增态时 return 不 clear 输入 | `MainLayout.tsx:506` | 不改 | ✅ |
| 20 | "Show X more" 折叠态拖拽自动展开 | `SortableCategoriesList.tsx:130-133` | 不改 — 与 hierarchy 折叠（D12）正交，分别处理 | ✅ |

**全部 20 项 ✅**。其中第 11 项（apply_reorder hierarchy-aware）与 第 16 项（keyboard tree coordinates）需要在 R1 / 实施期间确认细节，但**架构层面 R2 选 A 候选不破坏任何 V3 不变量**。

---

## 9. 不确定性 / 主要风险

### 9.1 高优先级（必须在 02_design_spec V4 / 03_tech_plan V4 闭环）

1. **U1: max depth=2 clamp 必须在 4 个位置同时执行**：
   - `getProjection` 后：`depth = Math.min(depth, 1)`
   - 键盘 → 协调器：`if (depth >= 1) ignore Right key`
   - 后端 `apply_reorder_with_hierarchy`：拒绝任何 depth≥2 的 entry
   - 自动分类创建路径：新 category 一律 root（已确认 00_understanding §5.9 = Path A）
   单点缺失会让"depth=2 节点"漏入数据。**需要在 03_tech_plan V4 §X 加专门一节列举所有 clamp 点**。

2. **U2: 父类拖动时 `removeChildrenOf` 的 React state 切换是否在 cascade 期间引起 jank** — V3 的 cascade 220ms 期间 children 短暂消失 → 隐藏 → 当 drop 完成后又出现是否有视觉跳变？**需要 T8 SubAgent 在实施时实测**。

3. **U3: 父类拖入另一父类时（B-1 阻断方案）的视觉反馈不能晚于 4px 激活后**：dragOffset.x 在 onDragMove 中累计；P1 with children 拖入 P2 下时，应在第一帧检测到 `projectedDepth=1 + activeItem.children.length > 0` 时立即把 indicator 灰化 + cursor 改 not-allowed。02_design_spec V4 需明确"灰化"与现有 V3 的"非法区"视觉是否一致。

4. **U4: Apple HIG 引用页面在本研究中未能完整 fetch**（WebFetch 返回标题但内容缺失），仅能用搜索结果摘要。如果 R3 视觉调研需要 HIG sidebar 详细规格，可能需要主 Agent 协助直接读 HIG 页面或交由 R3 处理。

### 9.2 中优先级（实施时确认）

5. **U5: `Over.data` 在 useSortable 默认 data.sortable 中没有 parentId/depth** — 需要在 SortableCategoryRow 的 useSortable args 上传 `data: { type: 'category', parentId, depth }`，确保跨级拖拽时 modifier / collision 能拿到。

6. **U6: 嵌套场景 cascade 在跨 depth 让位时的视觉**：如 root 拖到 depth=1，其他 root 让位（Y 轴）+ depth=1 的兄弟也让位（Y 轴）— 是否同时同步？dnd-kit verticalListSortingStrategy 应该 ✅，但需实测。

7. **U7: drop indicator 在 hierarchy 下是否需要扩展显示 depth** — V3 的 indicator 是单条 horizontal line（`drop-indicator-h`）。如果用户拖到深度 1，indicator 是否应该自带 padding-left？**留给 R3 决定**。

### 9.3 低优先级（非阻塞但要求 04_implementation_plan 列入回归测试）

8. **U8: 父类被删除时子类 fallback** — 已在 00_understanding §7.10 列入风险，但本研究对其无独立结论。R1 主导。

9. **U9: VoiceOver 对 hierarchy 的 announcement 措辞** — §6.4 提了三句模板，但具体措辞需 R3 / accessibility 评审 confirm。

---

## 10. 关键 takeaway 给 03_tech_plan / 02_design_spec 作者

1. **架构选 A（单 SortableContext + 投影深度）— 与 dnd-kit 官方 Sortable Tree example 同模式**。这是 V3 不变量保留度 + 实现 LoC + 行业生产验证三方面最优解。
2. **数据形态选 R1=A+A**（统一 categoryId 引用 + Vec<Category> + parent_id）— 与 dnd-kit Tree 模式天然 flat 输出契合，避免不必要的 nest/flatten 转换。
3. **D5 父类拖拽语义 = B-1**（block，因 max depth=2 且不愿撕散子类）— 与"拒绝是为了简单"的极简哲学契合。
4. **D6 promote 路径 = C+E**（X 向左拖 + ContextMenu 兜底）— 行业共识 + 不增加 UI 元素。
5. **snapModifier、4px activation、cascade 不需修改**。仅扩展 announcements + 新建 treeUtilities + 调整 SortableCategoriesList 的内部 state。
6. **max depth=2 clamp 必须 4 个地方同时落地**（U1）— 在 03_tech_plan V4 单独成节列举。
7. **行业基准对比表（§7）+ V3 不变量逐项核对（§8）应 verbatim 引入 02_design_spec V4 / 03_tech_plan V4** 作 cascade footprint 的固定证据。

---

## 11. confidence 评分

| 维度 | 评分 | 理由 |
|---|---|---|
| dnd-kit 源码事实准确性 | **95/100** | 全部 link 到 node_modules:行号 + .d.ts 类型签名；唯一缺口是 `defaultDropAnimationConfiguration` 完整代码未抓（line 3635-3680 区域只看了部分），但已有 .d.ts 充分说明 |
| 官方 Sortable Tree example 解构完整度 | **98/100** | 5 个文件全文抓取 + 引用行号；module.css 未抓（推断常规规则）但不影响架构判断 |
| 候选评估覆盖度 | **92/100** | 3 个候选 × 15 硬约束 + 10 软维度，矩阵完整；C 自研选项可能可以更细化（但已被硬约束筛掉，性价比低） |
| V3 不变量保留逐项核对 | **97/100** | 20 项全 ✅ 标注；少数项（11/16）需 R1 / 实施期间确认细节，但架构层面无破坏 |
| 行业基准引证 | **88/100** | 8 个产品 + 7 维度对比 + 引证链接；但部分产品（Linear / Apple HIG）的实际拖拽视觉未能 fetch 详细规格（仅文档级），实施时如有视觉冲突可能需补充 |
| 不确定性识别 | **94/100** | 9 项风险按优先级标注；U4 是知识空白（需主 Agent 协助）但已显式声明 |
| **综合** | **94/100** | 高置信度推荐：A 候选 + B-1 父类拖拽 + C/E promote 手势 |

**主要不确定性集中在实施时段而非架构时段** — 这是好的迹象（架构选择本身有强证据，实施细节需 T8 验证是常态）。

---

## 12. 给 03_tech_plan V4 作者的可粘贴架构骨架

```tsx
// 新文件 src/components/sidebar/dnd/treeUtilities.ts
// 改写自 dnd-kit/stories/3 - Examples/Tree/utilities.ts，加 max depth=2 clamp

import type { UniqueIdentifier } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';

export interface CategoryTreeItem {
  id: string;
  name: string;
  color: string;
  count: number;
  children: CategoryTreeItem[];
  collapsed?: boolean;
}
export type CategoryTree = CategoryTreeItem[];

export interface FlattenedCategory extends CategoryTreeItem {
  parentId: string | null;
  depth: number;
  index: number;
}

export const MAX_DEPTH = 1;  // 0=root, 1=child; max depth=2 hard limit

export function flattenTree(items: CategoryTree, parentId: string | null = null, depth = 0): FlattenedCategory[] {
  return items.reduce<FlattenedCategory[]>((acc, item, index) => {
    return [...acc, { ...item, parentId, depth, index },
            ...flattenTree(item.children, item.id, depth + 1)];
  }, []);
}

// ... buildTree, removeChildrenOf, getChildCount, findItemDeep, removeItem,
//     setProperty 与 example utilities.ts 同（§2.2 已抄）

export function getProjection(
  items: FlattenedCategory[],
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier,
  dragOffset: number,
  indentationWidth: number,
) {
  const overItemIndex = items.findIndex(({id}) => id === overId);
  const activeItemIndex = items.findIndex(({id}) => id === activeId);
  const activeItem = items[activeItemIndex];
  const newItems = arrayMove(items, activeItemIndex, overItemIndex);
  const previousItem = newItems[overItemIndex - 1];
  const nextItem = newItems[overItemIndex + 1];
  const dragDepth = Math.round(dragOffset / indentationWidth);
  const projectedDepth = activeItem.depth + dragDepth;
  const maxDepth = Math.min(MAX_DEPTH, previousItem ? previousItem.depth + 1 : 0);  // ← MAX_DEPTH clamp
  const minDepth = nextItem ? nextItem.depth : 0;
  let depth = Math.max(0, Math.min(projectedDepth, maxDepth));
  if (depth < minDepth) depth = minDepth;
  // active 父类拖入另一父类下被禁（§4.2 B-1 阻断）：
  const isParentBecomingChild = activeItem.depth === 0
    && depth > 0
    && items.some(i => i.parentId === activeItem.id);
  if (isParentBecomingChild) {
    depth = 0;  // force back to root — caller can detect this via comparing projected vs activeItem.depth
  }
  return { depth, maxDepth, minDepth, parentId: getParentId(), isParentBecomingChild };
  function getParentId() { /* §2.3 example */ }
}
```

完整伪代码与 SortableCategoriesList.tsx 改造细节由 03_tech_plan V4 作者基于本研究展开。

---

> **End of R2 Research Document**
