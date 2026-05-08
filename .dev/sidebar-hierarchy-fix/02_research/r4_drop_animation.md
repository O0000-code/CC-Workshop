# r4 — DragOverlay Drop Animation 调研（精修阶段）

> **目的**：用一手 `node_modules/@dnd-kit/core` v6.3.1 源码 + 数值化曲线评估，回答主 Agent 关于"悬浮 0.5 秒 / 阴影生硬消失 / 色圈跳变 16 px"三个用户报告问题的内在机制与可行候选方案。
>
> **范围**：仅本轮 drop animation；D1-D7 主修问题已 commit（611c21c / b970a8c），不重新调研。
>
> **节制**：每个 dnd-kit finding 严格 cite `node_modules/@dnd-kit/core/dist/core.esm.js:<line>` 一手；任何"等价 / 接近"声称用 RMSE 或形态相近措辞；不出最终方案，只出可行性 + tradeoffs。

---

## 0. 必读吸收摘要

- **r2 §1.3 / §1.6**：`collisionRect = getAdjustedRect(draggingNodeRect, modifiedTranslate)`（`core.esm.js:2984`），snap → closestCenter 反馈环已被一手验证，本调研以此为前提。
- **06_snap_research §1.4 / §1.6**：`Modifier` 是纯函数签名，但闭包内可保留状态——这是 V3 §2.5 现役 snapModifier 的物理基础。
- **02 V3 §2.5**：snap 在 modifier 闭包内做 quadratic gravity well + 帧间 lerp，不依赖 CSS transition——这是项目"物理级跟手"的 invariant。
- **02 V3 §2.6**：settle distance-aware：`dist < 4 → null`；否则 `min(280, 120 + dist × 0.5)` ms + `cubic-bezier(0.16, 1, 0.3, 1)`。
- **02 category-hierarchy V2 §2.5 / §2.10 / §2.22**：DragOverlay 不携带 inline-row padding（V3 invariant #21）；anti-pattern 表禁止 "DragOverlay component 增加 depth/paddingLeft prop"——主 Agent 关心的 Q3 核心点在此。
- **design-language.md**：单层廉价阴影禁止；DragOverlay-class lift 必须三层 hsl；overshoot 仅允许 ≤80 ms 微效果；no spring overshoot precision claim that doesn't reproduce。
- **validate-numerical-equivalence-claims.md**：cubic-bezier ↔ spring 等价声称必须 RMSE ≤ 5%；本报告对所有候选采用"形态相近"或"feel 类似"诚实表述。

---

## 1. Q1 — dnd-kit dropAnimation 内部源码事实

### 1.1 默认配置（`core.esm.js:3743-3754`）

```js
const defaultDropAnimationConfiguration = {
  duration: 250,
  easing: 'ease',
  keyframes: defaultKeyframeResolver,
  sideEffects: /*#__PURE__*/defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: '0'
      }
    }
  })
};
```

**事实**：默认 sideEffects **作用对象是 `active.node`（inline source row）**，把 `style.opacity = '0'`。**不接触 dragOverlay.node**。这就是默认行为下"原位行隐身让位"的实现路径。它**与 DragOverlay 的 box-shadow / opacity 无关**——dragOverlay.node 的视觉在 dropAnimation 期间**不被 sideEffects 触碰**。

### 1.2 默认 keyframes（`core.esm.js:3729-3741`）

```js
const defaultKeyframeResolver = _ref2 => {
  let {
    transform: {
      initial,
      final
    }
  } = _ref2;
  return [{
    transform: CSS.Transform.toString(initial)
  }, {
    transform: CSS.Transform.toString(final)
  }];
};
```

**事实**：默认 keyframes **只有 transform 一个属性**——`[{ transform: initial }, { transform: final }]`。**没有 opacity**、**没有 box-shadow**、**没有 background**——这是"两个端点的 transform"线性序列，其余视觉属性靠 `easing` 字符串的整体 cubic-bezier 插值。

**含义**：用户报告 B（"阴影生硬消失"）的根因之一在此——dnd-kit 默认 keyframes **不 fade box-shadow 也不 fade opacity**；任何"shadow 渐隐"必须由调用方显式提供 keyframes 或在 sideEffects 里 transition box-shadow。

### 1.3 dropAnimation 期间的 DOM 生命周期（`core.esm.js:3578-3611`）

```js
function AnimationManager(_ref) {
  let { animation, children } = _ref;
  const [clonedChildren, setClonedChildren] = useState(null);
  const previousChildren = usePrevious(children);

  if (!children && !clonedChildren && previousChildren) {
    setClonedChildren(previousChildren);
  }

  useIsomorphicLayoutEffect(() => {
    if (!element) return;
    // …
    Promise.resolve(animation(id, element)).then(() => {
      setClonedChildren(null);   // ← unmount 时机
    });
  }, [animation, clonedChildren, element]);

  return React.createElement(React.Fragment, null, children, clonedChildren ? cloneElement(clonedChildren, {
    ref: setElement
  }) : null);
}
```

**事实**（精确机制）：

1. drag 期间 `children` = `<DragOverlayCategoryRow />`（active 存在）
2. `onDragEnd` 回调清 active → 父 DragOverlay 的 `children` 变为 `null`
3. AnimationManager 在 `previousChildren` 还在时，用 `setClonedChildren(previousChildren)` **保留**克隆——这就是 dropAnimation 期间 dragOverlay.node **依然在 DOM** 的实现机制
4. `useIsomorphicLayoutEffect` 触发 `animation(id, element)`（即 useDropAnimation 返回的函数）
5. `dragOverlay.node.animate(animationKeyframes, { duration, easing, fill: 'forwards' })`（行 3871-3875）—— **Web Animations API 启动 keyframe animation**
6. `animation.onfinish = () => { cleanup?.(); resolve(); }` —— 动画结束**先调 cleanup**（恢复 active.node 的 opacity）**再 resolve Promise**
7. `Promise.resolve(animation(...)).then(() => setClonedChildren(null))`—— Promise resolve 后**下一个 React commit** 才把 dragOverlay 子树从 DOM 卸载

**精确卸载时机**：dropAnimation `duration` 完成的那帧后：
- `animation.onfinish` 触发
- cleanup 执行（恢复 active 行的 opacity 0 → 原值，**但默认 cleanup 不接触 DragOverlay**）
- Promise resolve
- React 调 setClonedChildren(null)
- React 触发 re-render → DragOverlay.children = null → cloneElement 不返回 → DOM 卸载

**含义**（用户报告 B 的关键事实）：dragOverlay.node 在动画 `duration` 完整窗口都**视觉满血在 DOM**——不渐隐、不缩小、不渐没。`setClonedChildren(null)` 触发的 unmount 是**单帧消失**：上一帧三层 hsl 阴影的"漂浮 row"，下一帧没了。**这正是用户说"阴影生硬消失"的代码层根因**。

**含义**（与项目 sideEffects 的关系）：项目 `CATEGORY_DROP_ANIMATION` 用 `...defaultDropAnimation, duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)'`（`animations.ts:17-21`），继承默认 `sideEffects`——这意味着 sideEffects 对**inline source row** 设 `opacity: 0` 直到 cleanup（onfinish）才恢复。**inline source row 在 dropAnimation 全程是隐身的**，dragOverlay 是用户唯一看见的视觉元素。这点对解释用户报告 A（悬浮）和 B（生硬消失）都是关键前提。

### 1.4 sideEffects 时机精确语义（`core.esm.js:3678-3727` + `3866-3870` + `3877-3880`）

```js
const cleanup = sideEffects == null ? void 0 : sideEffects({
  active, dragOverlay, ...rest
});
const animation = dragOverlay.node.animate(animationKeyframes, { duration, easing, fill: 'forwards' });
return new Promise(resolve => {
  animation.onfinish = () => {
    cleanup == null ? void 0 : cleanup();
    resolve();
  };
});
```

**事实**：
- `sideEffects(...)` **在 keyframe animation 启动 *之前* 同步调用**——它把 `active.node.style.opacity = '0'` 写入；返回一个 cleanup 函数
- cleanup 函数在 `animation.onfinish` 时调，**先 cleanup 再 resolve**
- 默认 `defaultDropAnimationSideEffects` 的 cleanup 把 active.node 的 opacity 恢复到原始值（`originalStyles[key]`，行 3683 + 3719-3720）
- `className.dragOverlay`（如果配置）会被 `add()` 但**不会**在 cleanup 移除（行 3714-3716 vs 3722-3725）—— `dragOverlay` 路径**没有自动 cleanup**（设计上：dragOverlay 即将卸载，无需恢复）

**这是配置 fade box-shadow 的关键开口**：可以通过 `defaultDropAnimationSideEffects({ styles: { dragOverlay: { transition: 'box-shadow 220ms', boxShadow: 'none' } } })` 让 dragOverlay 启动 transition 同时把 shadow 改成 none——动画启动那一帧 box-shadow 开始 fade。验证：`core.esm.js:3700-3708` 显示 dragOverlay.styles 走 `setProperty(key, value)`，会触发 CSS transition（如果 transition 已经在样式表里设定了）。

### 1.5 dropAnimation = `null` vs config 对象（`core.esm.js:3762-3812`）

```js
return useEvent((id, node) => {
  if (config === null) {
    return;            // ← null: 立即返回，不播放任何 animation
  }
  // ...
  return animation({...});
});
```

**事实**：`useDropAnimation` 在 `config === null` 时**直接 return undefined**——不调 animate、不 setProperty、不返回 Promise。`AnimationManager` 拿到 `animation(id, element)` 返回 undefined → `Promise.resolve(undefined).then(...)` → **下一个 microtask** 立刻 `setClonedChildren(null)` → DOM 卸载。

**等价于 V3 §2.6 distance < 4 路径的"瞬时卸载 dragOverlay"**：用户视觉上看到 dragOverlay 直接消失，没有 transform 滑动。

### 1.6 `keyframes` 与 `sideEffects` 字段是否可被外部覆写

**事实**：`DropAnimationOptions` interface（`useDropAnimation.d.ts:27-32`）显式声明 4 个字段全部 optional：

```ts
export interface DropAnimationOptions {
    keyframes?: KeyframeResolver;
    duration?: number;
    easing?: string;
    sideEffects?: DropAnimationSideEffects | null;
}
```

`createDefaultDropAnimation`（`core.esm.js:3815-3823`）通过 spread merge 默认配置：

```js
const { duration, easing, sideEffects, keyframes } = {
  ...defaultDropAnimationConfiguration,
  ...options
};
```

**含义**：**全 4 个字段都可外部覆写**。可以传入：
- 自定义 `keyframes(parameters) => Keyframe[]` 函数，包含 `transform` + `opacity` 多属性 keyframe 序列
- `sideEffects: null`（不让 inline row 隐身——当前不需要，但理论上）
- 或自定义 sideEffects 对 dragOverlay.node 加 className / style transition

### 1.7 项目当前 dropAnimation 配置审计

`animations.ts:17-21`：

```ts
export const CATEGORY_DROP_ANIMATION: DropAnimation = {
  ...defaultDropAnimation,
  duration: 220,
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
};
```

**事实**：项目**仅覆写 duration 和 easing**——keyframes 与 sideEffects 走默认。这意味着：
- DragOverlay box-shadow 不 fade（默认 keyframes 只插值 transform；默认 sideEffects 不接触 dragOverlay）
- DragOverlay opacity 不 fade（默认 keyframes 不含 opacity）
- inline source row 在 220 ms 全程 opacity 0；onfinish 时 cleanup 恢复

**这就是用户报告 B 的根因**：DragOverlay 视觉（含三层 hsl 阴影）从 dropAnimation 启动到结束**全帧无变化**，结束那一帧（setClonedChildren(null) → React commit）整体 unmount——没有视觉过渡，所以"生硬消失"。

### 1.8 .drag-overlay-row CSS transition 现状

`src/index.css:631-639`：

```css
.drag-overlay-row {
  box-shadow:
    0 1px 2px hsl(0 0% 0% / 0.06),
    0 4px 8px hsl(0 0% 0% / 0.08),
    0 12px 24px hsl(0 0% 0% / 0.1);
  border-radius: 6px;
  background: white;
  cursor: grabbing;
}
```

**事实**：**没有 `transition: box-shadow ...`**。即使 sideEffects 修改了 box-shadow 值，浏览器也直接 commit 新值，无 transition——除非 CSS 里加上 transition: box-shadow。

### 1.9 PositionedOverlay 的 `transition` prop 在 drop 期间是否生效（`core.esm.js:3635-3675`）

```js
const defaultTransition = activatorEvent => {
  const isKeyboardActivator = isKeyboardEvent(activatorEvent);
  return isKeyboardActivator ? 'transform 250ms ease' : undefined;
};
// ...
const styles = {
  ...,
  transform: CSS.Transform.toString(scaleAdjustedTransform),
  transition: typeof transition === 'function' ? transition(activatorEvent) : transition,
  ...style
};
```

**事实**：`transition` prop **只影响 inline `style.transition`**——但 dropAnimation 用 Web Animations API（`dragOverlay.node.animate(...)`，行 3871）不走 CSS transition，所以 `PositionedOverlay.transition` prop 在 drop 期间**与 dropAnimation 无关**。

**例外**：在 dropAnimation 启动**之前**的拖动期间，`transition: undefined`（mouse 路径），所以拖动期间 transform 走 inline style，无 transition——这与 r2 / 06_snap_research §1.2 完全一致。

### 1.10 一图流：dropAnimation 完整 timeline

```
t = 0 ms (mouseup 同帧):
  ├─ DndContext onDragEnd 回调触发
  ├─ React 提交：activeId = null → DragOverlay.children = null
  ├─ AnimationManager: previousChildren 还在 → setClonedChildren(previousChildren)
  ├─ useIsomorphicLayoutEffect 同步执行：
  │   └─ animation(id, element) 调用：
  │       ├─ sideEffects({ active, dragOverlay }) 同步写：
  │       │   active.node.style.opacity = '0'  (inline row 隐身)
  │       │   返回 cleanup function
  │       ├─ dragOverlay.node.animate(keyframes, { duration: 220, easing: '...', fill: 'forwards' })
  │       └─ 返回 Promise (resolve at onfinish)
  └─ DOM 状态：dragOverlay 在原拖动结束位置，开始 transform 插值

t = 0 ~ 220 ms:
  └─ dragOverlay.node：transform 按 cubic-bezier(0.16, 1, 0.3, 1) 插值
       从 initial transform → final transform
       三层 hsl 阴影、opacity 0.95 (来自 .drag-overlay-row 的 inline 1.0 与 PositionedOverlay 的 inline opacity)、background:white、border-radius:6px
       全帧不变 (默认 keyframes 不插值这些)
  └─ inline source row：opacity 0（sideEffects 写死）

t = 220 ms (animation.onfinish):
  ├─ cleanup() 执行：active.node.style.opacity 恢复 → inline row 重现
  ├─ Promise resolve
  ├─ Promise.then 调度 setClonedChildren(null)
  └─ React schedule re-render

t = 220 + ~16 ms (next React commit):
  └─ DragOverlay.cloneElement 不返回 → dragOverlay subtree unmount → DOM remove
       single-frame disappearance (no fade)
```

**关键观察**：
- 在 t=180 ~ 220 ms（cubic-bezier 末段 80%-100%），transform 已经走完 99%（见 §2.1 数值）——视觉上"已就位"
- 但 dragOverlay subtree 还在 DOM，三层阴影满血
- t=220 ms 整体 unmount，三层阴影**单帧消失**
- 用户感受："悬浮 0.5 秒"实际是 dragOverlay 在末段已就位、但还在 DOM 的最后 ~80 ms（占 220 ms 的 36%）；"阴影生硬消失"是 unmount 单帧无过渡

---

## 2. Q2 — 当前曲线 + 候选曲线评估

### 2.1 cubic-bezier(0.16, 1, 0.3, 1) 末段拖沓数值评估

| 时间分数 x | 当前 V3 (0.16, 1, 0.3, 1) | (0.22, 1, 0.36, 1) ease-out-quart | (0.4, 0, 0.2, 1) Material | (0, 0, 0.2, 1) std ease-out |
|---|---|---|---|---|
| 0.5 | 0.972 | 0.961 | 0.776 | 0.839 |
| 0.6 | 0.988 | 0.984 | 0.876 | 0.902 |
| 0.7 | 0.996 | 0.994 | 0.938 | 0.947 |
| 0.8 | 0.999 | 0.999 | 0.975 | 0.978 |
| 0.9 | 1.000 | 1.000 | 0.994 | 0.995 |
| 0.95 | 1.000 | 1.000 | 0.999 | 0.999 |

**当前 V3 (0.16, 1, 0.3, 1) 时间到位率**（duration=220 ms）：
- 95% 达成于 t=93.7 ms（占 42.6%）
- 97% 达成于 t=108.5 ms（占 49.3%）
- 99% 达成于 t=136.4 ms（占 62%）
- **后 84 ms（38% 时长）仅完成 1% 进度** ← 这就是"悬浮 0.5 秒"的客观存在

对照感受：用户感受 220 ms × 0.38 = **84 ms 的视觉停滞**。配合 §1.10 的 unmount 单帧消失，"悬浮 + 突然消失"两段感受合计 ~80-90 ms。"0.5 秒"是用户主观时间感放大（人类对"动画结束-消失"的注意力放大效应），但**客观确有视觉停滞 84 ms**，方向上证实用户报告。

### 2.2 候选曲线尾段拖沓对比

按"95% 达成时间分数"评估末段：

| 曲线 | 95% 达成 x | 后段 (95%→100%) 占总时长 | 评价 |
|---|---|---|---|
| (0.16, 1, 0.3, 1) ease-out-expo-like | 0.426 | **57.4%** | 极端尾段拖沓 |
| (0.22, 1, 0.36, 1) ease-out-quart | 0.468 | **53.2%** | 仍拖沓 |
| (0, 0, 0.2, 1) std ease-out | 0.708 | 29.2% | 中等 |
| (0.4, 0, 0.2, 1) Material standard | 0.727 | 27.3% | 紧凑 |

**关键洞察**：(0.16, 1, 0.3, 1) 与 (0.22, 1, 0.36, 1) 都是"前段陡 → 末段极平"曲线（exponential-like），它们的尾段视觉**本身就是拖沓的**——这是曲线族的特性，不是 bug。Material standard 或 std ease-out 末段紧凑得多。

但另一侧：前段 50% 时间内：
- (0.16, 1, 0.3, 1) 已完成 97.2% ← 这是"早期感觉到位"的关键，前段足够快
- (0.4, 0, 0.2, 1) 仅完成 77.6% ← 前段慢得多

**tradeoff**：(0.16, 1, 0.3, 1) 前段极快（克制 settle 的"早期到位"感）+ 末段拖沓；(0.4, 0, 0.2, 1) 前段较慢但全程节奏均匀。两者满足 V3 §2.6 "无可见 overshoot" + "monotonic to target"，**都不违反 design-language hard constraint**。

### 2.3 spring step-response 与 cubic-bezier 不可比

按 validate-numerical-equivalence-claims.md：spring step-response **起始速度恒为 0**（critical-damped 也一样），cubic-bezier ease-out **起始速度极高**——曲线族不同。任何 `{ stiffness, damping, mass }` 与 `cubic-bezier(...)` 的等价声称都需 RMSE 验证。本调研**不出 spring 候选**——项目目前 cubic-bezier-only，引入 spring 库（motion / react-spring）属于工具选择问题，超出本调研范围。

形态相近的描述（不是数值等价）：
- spring `{ stiffness: 500, damping: 40, mass: 1 }` 在 t≈220 ms 时进度约 87%（来自 sidebar-reorder/02 V3 §2.4 retraction 的引证）
- 与 cubic-bezier (0.16, 1, 0.3, 1) @ 220 ms = 100% 相比，spring 在 220 ms 仍未到位
- **形态都是"先快后慢"**但**不可数值替换**——这是 02 V3 §2.4 已经吸收的教训

### 2.4 NN/G + Apple + Things 3 实测 duration 区间

**仅作 informational reference, 不作等价声称**：

- macOS Finder 拖文件回原位（cancel）：约 250-300 ms
- Things 3 任务卡释放：约 180-220 ms（lift 等同时间，settle 视觉短）
- Apple Springboard icon 排序释放：约 200-250 ms
- iOS Notes 拖动：约 150-200 ms（短列表）

**含义**：220 ms 当前选择**位于业界主流区间**，不是离谱选择。但 280 ms 上限（dist=320 时）已经接近 Finder 偏长一端——长距离 settle 体感 ~"animator-noticeable"。

---

## 3. Q3 — V3 invariant #21 拆解

### 3.1 V3 #21 原文（02 sidebar-reorder 与 02 category-hierarchy）

`SortableCategoriesList.tsx:90-91` 注释：
> 21. DragOverlay does not carry inline-row padding — owned by DragOverlayCategoryRow's hard-coded `px-2.5`

`DragOverlayCategoryRow.tsx:14-29` 注释：
> **V2 hierarchy invariant #21 (02 V2 §2.5 + §2.22 + §11)**: this component **does not accept** `depth`, `paddingLeft`, or `hasChildren` props.
> `padding-left` is hard-coded as `px-2.5` (10 px) regardless of the source row's depth — the overlay is a "naked row" by design. ...
> **the DragOverlay itself stays depth-agnostic so it always equals the picked-up row's CURRENT visual (V3 strict hand-tracking — equals current form, not future form).**

### 3.2 02 V2 §2.22 anti-pattern 表

> | **DragOverlay component 增加 depth/paddingLeft prop**（V2 新增）| `DragOverlayCategoryRow` className 写死 `px-2.5` 是 hierarchy 不变量 #20 的代码层保障；引入 prop 等于打开"DragOverlay 跟随 child 缩进"的口子 |
> | 子类 DragOverlay 自带 26 px 缩进 | 拖动期间深度由翻越阈值离散切换（§6.3）；自带缩进会与新目标深度视觉冲突（§2.5） |

注：02 V2 §2.5 给的论据原文：
> 子类 DragOverlay 不携带 26 px 缩进的论据：拖动期间深度有两种稳定态（root / child），由 dragOffset.x 翻越 12 px + dwell 80ms 后离散切换（§6.3）。**如果 DragOverlay 自带 26 px padding，DragOverlay 在 dragOffset.x = 0 ~ 12px 时（无意改深度的 reorder）也表现为 child 视觉——破坏 V3 严格跟手原则（DragOverlay 视觉应等同被拖项当前形态而非未来形态）。**

### 3.3 #21 的精确语义拆解（关键点）

**精读 §2.5 论据**：禁止 DragOverlay 携带 padding 的真正理由是"视觉应等同被拖项当前形态"——其**避免的具体反例**是"DragOverlay 跟随 projected depth 切换 padding"。

**反过来**：被拖项的**预拖动 depth**（pre-drag depth）是一个**整个 drag session 不变的量**。子类 active 的 pre-drag depth 永远是 1，root active 的 pre-drag depth 永远是 0——它们**不是 projection**，**与"未来形态"无关**——它们就是"当前被拖项的真实出身"。

| 维度 | pre-drag depth | projected depth |
|---|---|---|
| 时间 | drag 整个 session 恒定 | 每帧随指针变化（§2.7 / §2.14 状态机） |
| 改变 padding 的语义 | "DragOverlay = 被拖项的真实身份" | "DragOverlay = 未来落地预测" |
| §2.5 论据是否禁止 | **未明确禁止** | **明确禁止**（"未来形态" 反例） |

**关键判断**：02 V2 §2.5 / §2.22 的 anti-pattern **核心**是"DragOverlay 不跟随 projection"，**不是**"DragOverlay 不能呈现 pre-drag depth"。

**但 §2.5 的字面措辞**："DragOverlay padding 实现引证 ... 不接受 row prop、不接受 depth prop、不接受 paddingLeft prop"——这是对**当前实现**的描述，不是对**所有可能扩展**的禁止。

### 3.4 假设场景验证：DragOverlay 携带 pre-drag depth padding

**场景 A — root active reorder**：
- pre-drag depth = 0 → DragOverlay padding-left = 10 px（pre-drag-depth × 16 + 10 = 0 + 10 = 10）
- 与当前实现完全一致（`px-2.5` = 10 px）
- 落地时 inline row depth = 0 → padding-left 也 10 px
- **结论**：root active 路径**无变化**，不会破坏 V3 §2.5 的现有不变量

**场景 B — child active same-parent reorder（无 commit）**：
- pre-drag depth = 1 → DragOverlay padding-left = 26 px（1 × 16 + 10 = 26）
- inline source row 在 same-parent reorder 期间 renderDepth 由 D1 锁定为 `activeOriginalDepth` = 1（`SortableCategoriesList.tsx:1227-1232`），所以 inline padding-left = 26 px
- drop 后 final inline row 的 padding-left 也 = 26 px（depth 不变）
- **结论**：DragOverlay padding 26 = inline padding 26 = final padding 26 → drop 后 dragOverlay 与 inline 像素对齐，**无 16 px 跳变**

**场景 C — child active promote 到 root**：
- pre-drag depth = 1 → DragOverlay padding-left = 26 px
- drop 后 final inline row depth = 0 → padding-left = 10 px
- DragOverlay (26 px padding) 落到 final rect 顶端时，inline row 已经 padding=10 px 渲染
- 视觉上，DragOverlay 在 settle 路径上保持 26 px padding，settle 完成后 unmount，露出 10 px padding 的 inline row → **dragOverlay 26→inline 10 的 16 px 跳变**
- **不是用户报告 C 的场景**——用户报告 C 是 "same-parent reorder"，跨深度 promote 是另一回事
- 但这个场景**确实存在 padding 不一致**——这是"pre-drag padding"方案的边界 case

**场景 D — child active demote 到另一父 child（cross-parent）**：
- 02 V2.2 D7 已删除此路径——不存在

**场景 E — root active demote 到 child**：
- pre-drag depth = 0 → DragOverlay padding-left = 10 px
- drop 后 final inline row depth = 1 → padding-left = 26 px
- DragOverlay 10 px → unmount → inline 26 px 显示 → **dragOverlay 10→inline 26 的 16 px 跳变（反向）**
- 同样存在边界 case

### 3.5 V3 invariant #21 重述选项

**option α — 严格保留 #21 现状**：
- DragOverlay padding 永远 10 px（px-2.5），与 active depth 无关
- 副作用：用户报告 C（child active same-parent reorder）的 16 px 跳变继续存在
- 不变量层次：**完全保留** V3 #21

**option β — DragOverlay 携带 pre-drag depth padding**：
- DragOverlay padding-left = `pre-drag-depth × 16 + 10`
- 副作用：场景 B 16 px 跳变消失（用户报告 C 修复）；场景 C / E 跨深度 drop 时仍存在 16 px 跳变（但跨深度 drop 时 settle 距离也大，padding 跳变隐藏在 settle 动画末段）
- 不变量层次：**软破** V3 #21 字面措辞，**保留** §2.5 "DragOverlay 视觉等同被拖项当前形态" 的精神（因为 pre-drag depth = 被拖项当前形态）；**保留** §2.22 anti-pattern "DragOverlay 跟随 projection 切换 padding" 的硬约束（pre-drag depth 不会切换）

### 3.6 接口分析（option β 实施面）

如果选择 option β，最小改动：
- `DragOverlayCategoryRow` 增加 `paddingLeft?: number` prop
- `SortableCategoriesList.tsx:1318-1329` 注入 `paddingLeft={(activeOriginalDepth ?? 0) * INDENT_STEP_PX + 10}`
- `activeOriginalDepth` 已经在 SortableCategoriesList 内存在（D1 sameParentReorder 判定使用，line ~1228）

副作用边界：
- 02 V2 §2.5 / §2.22 需要更新（添加"pre-drag depth padding 是允许的；只有 projected depth padding 是 anti-pattern"的精确措辞）
- 单测 `DragOverlayCategoryRow.test.tsx` 增加 child active path 的 padding 校验
- 不需要新增 token（INDENT_STEP_PX 已存在）
- 不影响 cascade / settle / snap 任何路径

### 3.7 Q3 总结

- V3 #21 的**精神**（"DragOverlay 视觉等同被拖项当前形态而非未来形态"）**与"DragOverlay 携带 pre-drag depth padding"不冲突**；冲突的是字面措辞与当前实现
- 硬冲突点是 §2.22 anti-pattern 表"DragOverlay component 增加 depth/paddingLeft prop"——这条字面禁止 props，但论据指向"projection 跟随"的反例
- **判断**：option β 是一个 spec-edit 类型修改（不是 hard violation），需要主 Agent 决策是否修订 02 V2 §2.5 / §2.22 让 pre-drag depth padding 显式合法化
- 用户报告 C 的修复路径**最纯粹**（且唯一无 16 px 跳变）的方案是 option β——但这是 spec 修订决策，不是无副作用代码改动

---

## 4. Q4 — 候选方案对比表

> 不出"最终方案"——出可行性 + 体感 tradeoffs 矩阵；具体 duration 数值 / 替换什么由主 Agent 决策。

### 4.1 用户报告 A "悬浮 0.5 秒" 的候选 settle 曲线

| 候选 | 公式 | 末段 95→100% 占比 | 目标问题 | 副作用 |
|---|---|---|---|---|
| **C1（保守缩 dur）** | `min(220, 100 + dist × 0.4)` ms + `cubic-bezier(0.16, 1, 0.3, 1)` | 57.4% | 减少绝对停滞时长（dist=200 时 200→180 ms，省 20 ms） | 末段拖沓比例不变；用户感受改善有限 |
| **C2（换曲线）** | `min(220, 100 + dist × 0.4)` ms + `cubic-bezier(0, 0, 0.2, 1)` std ease-out | 29.2% | 末段紧凑+绝对时长缩短 | 前段慢一点（前段 50% 仅完成 84%）；与项目 cascade `--ease-drag` 不一致，引入第二种 settle 曲线（design-language allowed inline easing 已包含） |
| **C3（更激进缩短）** | `min(180, 80 + dist × 0.3)` ms + `cubic-bezier(0.16, 1, 0.3, 1)` | 57.4% | 全程更短（dist=200 时 140 ms） | "嗖一下"风险（< 150 ms 时 cubic-bezier ease-out 视觉接近瞬时）；与 V3 §2.6 distance-aware 上限 280 偏离较大 |
| **C4（曲线+激进缩短）** | `min(180, 80 + dist × 0.3)` ms + `cubic-bezier(0, 0, 0.2, 1)` | 29.2% | 同 C3 但末段不拖沓 | 同 C2 + 同 C3 |
| **C5（spring 切换）** | 引入 motion 库，`{ stiffness: 600, damping: 38 }` | N/A（spring）| 物理感强 | 引入新依赖、违反"项目 cubic-bezier-only"现状、validate-numerical-equivalence 必须 RMSE 验证、与项目 cascade cubic-bezier 不形态相近 → "settle 与让位曲线族不同" 视觉割裂；**不推荐本期评估** |
| **C6（保留曲线）** | 当前 V3 不变（`min(280, 120 + dist × 0.5)` + `cubic-bezier(0.16, 1, 0.3, 1)`）| 57.4% | 维持现状 | 用户报告 A 不修复 |

**关键 tradeoff**：
- 缩短 duration 治"绝对停滞时间"；换曲线治"末段拖沓比例"
- 两者**叠加**才接近"最自然"；单独用一项也有改善
- 任何选项都不破坏 V3 §2.6 "monotonic to target / 无 overshoot"
- 任何选项的 token 兼容性见 design-language.md "Allowed inline easing" 表

### 4.2 用户报告 B "阴影生硬消失" 的候选

| 候选 | 改动位置 | 机制 | 副作用 |
|---|---|---|---|
| **B1（自定义 keyframes — 末段 fade）** | `animations.ts` 增加 `keyframes` 函数返回 [{transform, opacity:1}, {transform, opacity:1, offset:0.8}, {transform:final, opacity:0}] | 前 80% transform 走 cubic-bezier，后 20% 同时 fade opacity 0 | dragOverlay opacity 1→0 与 inline source row opacity 0→1（cleanup）的两侧 fade 在 t=80% ~ 100% 同时发生；视觉双向交叉；需要确认 inline source row cleanup 时机（onfinish，t=100%）与 keyframes opacity 0（t=100%）刚好同步 |
| **B2（CSS box-shadow transition）** | `src/index.css:.drag-overlay-row` 加 `transition: box-shadow 80ms ease-out`；同时 sideEffects 在动画启动时把 shadow 改成单层薄阴影 | shadow 80ms 平滑过渡 | 拖动期间 shadow 也会有 transition（但拖动期间 shadow 不变，所以无副作用）；onfinish 后 unmount 还是单帧消失（仅 shadow 在动画启动那刻 fade，不解决"unmount 单帧"） |
| **B3（DragOverlay 动画期间 className 切换）** | sideEffects 配置 `className: { dragOverlay: 'is-dropping' }`；CSS 里 `.is-dropping { transition: opacity 100ms ease-out, box-shadow 100ms ease-out; opacity: 0; box-shadow: none; }` | className 添加触发 CSS transition；shadow + opacity 同步 fade；dragOverlay.node 在 220 ms 总时长内 80-100% 段 fade 完毕 | sideEffects 的 dragOverlay className 在 cleanup 路径**不会自动移除**（`core.esm.js:3722-3725` 仅 active 路径有 cleanup）；但因为 dragOverlay subtree 在 setClonedChildren(null) 时整体 unmount，"残留 className"无副作用；需确认 transition duration < dropAnimation duration |
| **B4（保留默认 + 加 settleDuration 末段 buffer）** | dropAnimation 跑完 transform 后再 + 80 ms unmount 延迟（自定义 keyframes 在 220 ms 后追加 fade keyframe） | 用 keyframes offset 把 transform 完成在 t=0.6（132 ms），剩余 88 ms 用于 box-shadow 和 opacity fade | 需要自定义 keyframes 接口（`useDropAnimation.d.ts:28` 允许） |

**判断**：
- B1 + B2 / B3 组合最完整；B2 / B3 单独使用解决"shadow 渐隐"，B1 解决"opacity 渐隐"
- B4 是 "treat unmount as second phase" 的物理合理表达——但实施复杂度高
- 简单度 / 物理合理度：**B3 ≥ B1 ≥ B2 > B4**

### 4.3 用户报告 C "16 px 跳变" 的候选

见 §3.5 / §3.6。三个选项：

| 候选 | 描述 | 副作用 |
|---|---|---|
| **α 保留 #21**（不动）| DragOverlay padding 永远 10 | 用户报告 C 不修复 |
| **β pre-drag depth**（02 V2 §2.5 修订 + DragOverlay prop 扩展）| DragOverlay padding = `pre-drag-depth × 16 + 10` | 修复 same-parent reorder 跳变；跨深度 drop 边界 case（场景 C / E）仍存在但可通过 settle 距离遮蔽；spec 修订成本（02 V2 §2.5 / §2.22 措辞更新） |
| **γ projected depth**（V3 #21 字面 + 精神都破，与 §2.22 anti-pattern 直接冲突）| DragOverlay padding 跟随 projection 帧帧切换 | 恢复 V2 / V3 一直明确禁止的"hidden hand 抢控制权"反模式；**不予考虑** |

### 4.4 综合候选组合（仅供主 Agent 选择）

| 修复目标 | 推荐组合 | 复杂度 | spec 修订 |
|---|---|---|---|
| 仅治 A（悬浮）| C1 或 C2 | 低 | 02 V3 §2.6 公式更新（数值微调，token 不变） |
| 仅治 B（阴影）| B3 + B2 | 中 | design-language.md 增加"DragOverlay drop fade transition"段；02 V3 §2.6 增加 sideEffects 段 |
| 仅治 C（跳变）| β | 中 | 02 V2 §2.5 / §2.22 措辞更新；DragOverlayCategoryRow 接口扩展 |
| ABC 全治 | C2 + B3 + β | 中 | 三处 spec 联动 |
| 最小改动（仅 A）| C1 | 极低 | 单数值修改 |

---

## 5. 未在源码中找到 / 待主 Agent 决策的悬而未决项

1. **CSS box-shadow transition 是否真的会被 sideEffects 触发**——`core.esm.js:3700-3708` 显示 styles.dragOverlay 路径走 `setProperty(key, value)`；理论上会触发 CSS transition，但**未实际反复测**。建议 Skill / 实施 SubAgent 在 dev 模式跑一次 box-shadow transition 验证。

2. **B3 的 className 持续时间精确同步**——dropAnimation duration 是 220 ms，CSS transition `opacity 100ms`；如果 transition < animation duration，opacity 在 t=100 ms 已经 0，剩余 120 ms dragOverlay 是透明 box-shadow=0 的"空 div"——视觉上等同 unmount。**这反而是好事**——unmount 单帧消失变成"透明残骸下一帧消失"，物理合理。

3. **inline source row cleanup 时机与 keyframes opacity 0 同步**（B1 路径）——`animation.onfinish` 触发 cleanup（恢复 inline opacity 1），同帧/下帧 setClonedChildren(null) unmount dragOverlay。如果 keyframes 让 dragOverlay opacity 在 t=100% 已是 0，同帧 inline opacity 也已经 1 → **零间隙交叉淡入淡出**——视觉上 dragOverlay 与 inline 完美交接。但**需要确认 keyframes opacity 0 写到 dragOverlay.node 后 fill: 'forwards' 是否在 unmount 前保留**——`core.esm.js:3873` 显示 `fill: 'forwards'`，理论上保留；但 unmount 那帧浏览器会把 element 从 DOM 拿掉，fill 是否生效取决于浏览器。**未实测**。

4. **option β 边界 case "child active promote 到 root"**（场景 C）——pre-drag padding 26 → final padding 10 仍有 16 px 跳变。settle 距离 = |finalRect.left - dragOverlayRect.left| 在 X 方向已经包含 16 px → settle 把这段距离包了进去 → DragOverlay 在 settle 期间从 X1 滑到 X1-16 → unmount → inline row X1-16 处展现 → 视觉上**跳变被 settle 滑动遮蔽**。**理论上对**，但需要 dev 模式实测确认是否有"滑动突兀"。

5. **dropAnimation `keyframes` 的精确返回 type**（`useDropAnimation.d.ts:26` `KeyframeResolver` returns `Keyframe[]`）——Web Animations API `Keyframe` 类型来自浏览器；TS 可能宽松。本调研未深入 Web Animations API 跨浏览器边界（Chromium based WebView，按理 100% 支持）。

6. **prefers-reduced-motion** 下的 dropAnimation 行为——dnd-kit 不内置 reduced-motion handling；项目 `src/index.css:681-690` 仅覆盖 transition / animation——`dragOverlay.node.animate(...)` Web Animations API **不在 CSS animation 范围**，需要主 Agent 决策是否在 reduced-motion 下传 `dropAnimation={null}`（V3 §2.12 已声明 transition duration → 0 ms 但未明确 dropAnimation；本期可补）。

7. **02 V2 §2.5 论据 "DragOverlay 视觉应等同被拖项当前形态而非未来形态" 的精确解读权**——本调研给出 pre-drag depth 不属于"未来形态"的判断，但这是**调研判断**，不是已 commit 的 spec 措辞。最终解读权在主 Agent + 用户。

---

## 6. 节制重申

- 本文档**不出最终修复方案**——只给可行性 + tradeoffs；最终选择 C1/C2/B1/B2/B3/α/β 由主 Agent 决策
- 每个 dnd-kit finding 严格 cite `core.esm.js` 一手 file:line（§1 全部带行号）
- 数值评估（§2.1-2.2）来自 Newton-Raphson 实算，不是凭感觉；spring 不出等价声称（§2.3）
- §3 V3 #21 拆解给出"字面 vs 精神"两层判断，最终修订权在主 Agent
- §4 候选表每行 < 50 字（部分接近上限，已尽量节制）
- §5 列举所有"未实测 / 待决策"项，避免给主 Agent 错觉"全部已确认"
