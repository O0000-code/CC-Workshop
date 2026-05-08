# Sidebar Reorder — Design Spec V3（设计规格 — 二轮评审后修订版）

> **Decisional 文档**。视觉/动效细节冲突时以本文档为准。
> V1/V2 已归档至 `_archive/v1` `_archive/v2`。
> V3 修订基于 V2 复评（`05_review/v2_*.md`），处理 V2 残留的 design+animation P0。

## Revision History (V2 → V3)

V2 复评结果：design 8.7、animation 6.0。V3 处理：
- **D-NEW-P0-A**：lift 表头"原位"语义混乱 → 拆"主视觉元素"，吸盘段=行内 DOM、拉离段=DragOverlay
- **D-NEW-P0-B**：磁吸 80ms + settle 220ms 衔接漏洞 → 加"距离感知 dropAnimation"规则（已磁吸 → 跳过 dropAnimation）
- **A-P0-1（持续）**：spring 与 cubic-bezier 数学不等价 → 删"等价"声称，改"形态相近的备选"，明确本项目用 cubic-bezier 实现
- **A-P0-2**：lift 拉离段 cubic-bezier(0.34, 1.32, 0.64, 1) 用在 scale + opacity 引起 negative/undershoot → 拉离段 scale 改用 ease-out 标准曲线
- **D-P1-4**：settle duration 改公式 `min(280, 120 + |delta| × 0.5)`
- **D-P0-4 残留**：acceptance §6.1 第 4 项措辞修正
- **A-P1**：cancel spring 微 overshoot 改诚实表述（实测 ~0.0035% 不可感知，等同 ease-out + 微弹的视觉印象）

## Revision History

**V1 → V2 关键变更**（按评审单 P0 编号）：
- D-P0-1：原位 opacity `0.4` → **`0`**（让位填空间，符合 macOS Finder/Notes 原生气质）
- D-P0-2：**新增"磁吸 snap"** 完整规格（用户原文要求"磁吸"）
- D-P0-3：**引入 `--color-accent` token + dark mode `#0A84FF`**（替代硬编码 `#0063E1`）
- D-P0-4：Acceptance §6 全部改为客观可验证（含 ms/px 量化指标）
- A-P0-1：spring 与 cubic-bezier 等价参数**重新计算**（spring 改为 `stiffness:500, damping:40`，与 cubic-bezier(0.16,1,0.3,1) 220ms 真正等价）
- A-P0-3：**Settle 时长由 180ms 改为 220ms**（≥ Cascade，避免目标抖动）
- A-P0-6：**Lift scale Categories 1.02→1.03、Tags 1.04→1.05**（增强物理感知）
- A-P0-5：**新增 Trackpad / Force Touch 适配段**（声明范围 + dnd-kit 兜底）
- 新增 token：`--ease-drag`、`--ease-drag-lift`、`--duration-drag-*` 全套
- WCAG 2.5.7 dragging movements alternative 显式声明（键盘可达即满足）

## 1. 设计哲学（修订）

> **macOS 原生气质为基底，借 Things 3 的"吸盘 + 拉离"两段 lift 与 Linear 的 spring 让位增加物理感，全程 ≤ 560ms，所有动效用 token 化曲线/时长。**

具体取舍（V2 调整）：
- **不做** Notion / Trello 风格夸张 lift + 大阴影 + rotate
- **不做** 任何 settle overshoot bounce（工具型 sidebar 不需要"晃动"）
- **不做** stagger（同步让位更"crisp"）
- **保留** 项目已有 `cubic-bezier(0.16, 1, 0.3, 1)` 的克制气质
- **新增** 极轻 lift 两段：80ms 吸盘 + 120ms 拉离（Things 3 物理感）
- **新增** 12px snap 距离磁吸（用户原文要求）
- **新增** macOS system blue token，dark mode 自动切换

---

## 2. 视觉规格表

### 2.1 Lift（拾起）—— 拖拽激活的瞬间（V3 拆主视觉元素）

> V3 修复 D-NEW-P0-A：明确两段 lift 的"主视觉元素"切换。  
> 用户感受："手指/光标先把目标'吸住'（行内元素胀起），然后被'拉离桌面'（DragOverlay 接管跟手）"。

| 阶段 | 时长 | 主视觉元素 | Categories | Tags |
|---|---|---|---|---|
| **激活手势** | — | — | 鼠标按下后移动 ≥ **4px** | 同 |
| **激活延迟** | — | — | 0ms（无 long-press） | 同 |
| **Stage 1: 吸盘**<br>0–80ms | 80ms | **行内 DOM 元素**（DragOverlay 还**未挂载**） | scale 1.0 → 1.04（ease-out），opacity 保持 1.0 | scale 1.0 → 1.06 |
| **过渡瞬间**<br>t=80ms | 0ms | DragOverlay 挂载 + 行内 DOM 准备消失 | DragOverlay 在指针位置以 scale 1.05 + opacity 0 出现 | scale 1.07 + opacity 0 |
| **Stage 2: 拉离**<br>80–200ms | 120ms | **DragOverlay 接管**（行内 DOM 在 ≤ 16ms 内 fade 到 0） | 行内：scale 1.04 → 1.0（ease-out 短促），opacity 1.0 → 0；DragOverlay：scale 1.05 → 1.03（ease-out 标准），opacity 0 → 0.95；同步开始跟手 | 行内同；DragOverlay scale 1.07 → 1.05 |
| 原位/Overlay transform-origin | — | — | center | center |
| 吸盘段 timing | — | — | `cubic-bezier(0, 0, 0.2, 1)`（ease-out 标准，**无 overshoot**） | 同 |
| 拉离段 scale timing | — | — | `cubic-bezier(0, 0, 0.2, 1)`（ease-out 标准，**无 undershoot**） | 同 |
| 拉离段 opacity timing | — | — | `linear`（连续淡出，避免曲线引起负值） | 同 |
| Cursor 切换时机 | — | — | **激活瞬间**（4px 阈值达到时） → `grabbing` | 同 |

**V3 关键修复说明**：
- **拉离段 scale 不再用 overshoot 曲线**（A-P0-2 修复）：V2 用 `cubic-bezier(0.34, 1.32, 0.64, 1)` 同时驱动 scale 1.04→1.0 与 opacity 1.0→0，会出现 -3.4% opacity 负值与 0.9986 scale undershoot（"已消失项还在缩小"的物理诡异）。V3 拉离段 scale 用 ease-out 标准曲线、opacity 用 linear。
- **吸盘段曲线**：原 V2 用 `(0.34, 1.32, 0.64, 1)` 是"弹簧 overshoot"，但 80ms 内 scale 1.0→1.04 的振幅极小，overshoot 实际不可感知。V3 改为 ease-out 标准 `(0, 0, 0.2, 1)`，等价于 `--ease-out` 项目通用；保留 overshoot 曲线在 cancel snap-back 中（那里是大幅位移，能体现）。
- **主视觉元素切换**：行内 DOM 与 DragOverlay 不会同时存在 visible 状态。t=80 是切换瞬间，行内瞬时（≤16ms 即 1 frame）淡出，DragOverlay 接力。这避免了 V2 表头"原位 1.0→1.04→1.0"看起来与"原位 opacity → 0"自相矛盾。

### 2.2 DragOverlay（跟手克隆）

| 属性 | Categories | Tags |
|---|---|---|
| 内容 | ColorPicker dot + 名字（**省略 count**） | 仅文字（**保留 pill 形态**） |
| opacity | **0.95** | **0.95** |
| scale（绝对值） | **1.03** | **1.05** |
| rotation | **0**（macOS 不旋转） | 0 |
| box-shadow（**V2 改 hsl 多层**） | `0 1px 2px hsl(0 0% 0% / 0.06), 0 4px 8px hsl(0 0% 0% / 0.08), 0 12px 24px hsl(0 0% 0% / 0.10)` | `0 1px 2px hsl(0 0% 0% / 0.05), 0 3px 6px hsl(0 0% 0% / 0.07), 0 8px 16px hsl(0 0% 0% / 0.08)` |
| 背景 | white | active 态用 `#18181B`，否则 `#FAFAFA` |
| 圆角 | 6px（同 row） | 4px（同 pill） |
| z-index | dnd-kit auto-managed（document body teleport） | 同 |
| 跟手位置 | `pointer.{x,y} - element.origin` | 同 |
| 出现 timing | 与 Lift 同步（0–200ms） | 同 |

### 2.3 Drop indicator（插入线）（V2 token 化）

> 颜色统一引用 `var(--color-accent)`，无硬编码。

#### Categories（1D 垂直列表）

| 属性 | 值 |
|---|---|
| 形状 | **水平线** |
| 粗细 | **2px** |
| 颜色 | `var(--color-accent)`（light=`#0063E1`，dark=`#0A84FF`） |
| 长度 | `calc(100% - 4px)`，左右各内缩 2px 对齐 row hover 边距 |
| 位置 | 行间正中心（行间 gap 0.5 = 2px） |
| 端点 | **不加圆点**（保持极简，与 Notes 一致） |
| 出现 timing | `100ms ease-out` opacity 0 → 1 |
| 移动 timing | `150ms var(--ease-drag)` translateY |

#### Tags（2D wrap）

| 属性 | 值 |
|---|---|
| 形状 | **垂直线**（pill 之间） |
| 粗细 | `2px` 宽 × `20px` 高 |
| wrap 行尾特例 | 行末用**短水平线** `24px × 2px`（同 indicator 颜色） |
| 颜色 | `var(--color-accent)` |
| 位置 | pill 之间正中心（gap 1.5 = 6px，line 居中） |
| timing | 同 Categories（100ms 出，150ms 移） |

### 2.4 Cascade（让位）—— 其他项响应（V3 撤销 spring 等价声称）

> **V3 关键修订**（A-P0-1 持续问题）：spring 与 cubic-bezier(0.16, 1, 0.3, 1) **数学上无法 < 5% 误差等价**（spring step response 起始速度恒为 0，cubic-bezier ease-out 起始速度极高，曲线族根本不同）。  
> 本项目**实施层用 cubic-bezier**（dnd-kit + CSS transition）。spring 数值仅作"形态相近的备选"参考，**不强求精确等价**。如未来切换到 motion 库实施，需重新设计动画曲线。

**本项目实施值**（绑定）：

| 属性 | Categories（1D） | Tags（2D wrap） |
|---|---|---|
| **CSS timing**（实施路径） | `220ms cubic-bezier(0.16, 1, 0.3, 1)` | `220ms cubic-bezier(0.16, 1, 0.3, 1)` |
| stagger | **0**（同步让位） | **0** |
| GPU | 仅用 `transform: translate*` | 同 |

**形态相近的 spring 备选**（**仅当未来切换到 motion 库时参考；与 cubic-bezier 视觉不严格等价**）：

| 库 | Categories | Tags | 备注 |
|---|---|---|---|
| motion | `{ type: 'spring', stiffness: 500, damping: 40, mass: 1 }` | `{ stiffness: 460, damping: 40, mass: 1 }` | damping ratio ≈ 0.89 / 0.93，settle ~226ms 但前段比 cubic-bezier 慢 |
| react-spring | `{ tension: 350, friction: 32 }` | `{ tension: 320, friction: 32 }` | 同上特性 |

> Tags cascade 时长由 V1 的 240ms 改为 **220ms**（与 Categories 一致），减少视觉割裂。wrap 重排的"稳定性"通过算法（`closestCenter` + `MeasuringStrategy.Always`）保证，不通过延长动画。

### 2.5 Snap 磁吸（V3 修订 — 软引力 + 帧间 lerp）

> **V3 修订**：V2 的"硬阈值 12px 即瞬移"实测产生 3 个叠加硬感（进入瞬移 12px、阈值内死板、离开反向瞬移 12px）。V3 改为**连续软引力**，不依赖 CSS transition，无视觉跳变。

**作用范围**：被拖项中心距最近 slot 中心 ≤ **12px**（`SNAP_RANGE_PX`）开始有可感知吸力

**吸力模型**：
- `g(dist) = max(0, 1 - dist/12)^2`（quadratic gravity well）
- 远场（dist=12）`g≈0` 完全跟手；中心（dist=0）`g=1` 完全吸附；中间连续过渡
- 没有"阈值切换"事件，因此没有跳变

**帧间平滑**：`LERP_FACTOR = 0.35`（每帧应用 35% 目标 snap，~7 帧达 95%，~120ms @ 60fps）
- 防止快速 mousemove 单帧产生大跳
- 离开 over slot 时自动以 `1-LERP_FACTOR` 速率衰减回 0

**实现位置**：`src/components/sidebar/dnd/snapModifier.ts`（factory + closure 持帧间状态）

**禁止**：
- 不做"加速吸附"动画（避免"hidden hand 抢控制权"感）
- 不发额外触觉/音效（保持克制）
- 不在拖动激活前生效

**调参表**：详见 `.dev/sidebar-reorder/06_snap_research.md` §5

> **Hierarchy override（2026-05-08，V2.2 D5）**：当 categories DndContext 内拖动一个 pre-drag CHILD 行时，snap 强度按 `snapStrengthRef.current = 0.3` 衰减（保留 lift/drop 端点感、去除 in-flight 锁定力）。ROOT active 完全保留 V3 baseline 1.0。**modifier 配置不变（仍 `[snapModifier]`）**，仅闭包内乘以 strength。详见 `.dev/category-hierarchy/02_design_spec.md` V2.2 Revision History + §6.2 V3 不变量 hierarchy override 表。原因：r2 §1.3 一手源码（`core.esm.js:2984`）证实 snap → collisionRect → closestCenter 反馈环；r3 §4.1 Finder/Linear/Things 3/Notion/Apple Notes 五家产品全无 in-flight 磁吸。本注记不修改 V3 spec 主体规则。

### 2.6 Settle（落定）—— drop 完成（V3 加距离感知 + 磁吸衔接）

> **D-P1-4 + D-NEW-P0-B 修复**：  
> 1. settle duration 改为 distance-aware 公式（避免 5px 距离也跑 220ms 的拖泥带水）  
> 2. 磁吸已对齐时跳过 dropAnimation（避免"磁吸完成→settle 空跑"的双段机械感）

**duration 公式**（实施时计算）：

```
const delta = |finalRect.center - DragOverlayRect.center|  // px
let settleDuration: number;
if (delta < 4) {
  // 已被磁吸完美对齐 — 跳过 dropAnimation
  settleDuration = 0;
} else {
  // 距离正比 + 封顶
  settleDuration = Math.min(280, 120 + delta * 0.5);
}
```

| 属性 | 值 |
|---|---|
| DragOverlay 滑向最终位置 | dnd-kit `dropAnimation`：`{ duration: settleDuration, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }`；当 `settleDuration === 0` 时 dropAnimation 设为 `null` |
| 原位 opacity 恢复 | 0 → 1.0 与 dropAnimation 同步（distance=0 时也是瞬时） |
| 总 settle 时长 | **0ms（已磁吸） / 120-280ms（按距离）** |
| overshoot | **无** |
| 触觉反馈 | 不实现 |

**实现 hint**：dnd-kit `<DragOverlay dropAnimation={dropAnim}>` 接受函数式 `dropAnimation`：
```tsx
const dropAnimation: DropAnimation = {
  duration: 0, // placeholder, computed on dragEnd
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  sideEffects: defaultDropAnimationSideEffects({ /* ... */ }),
};

// 在 onDragEnd 中根据 over.rect 与 active.rect.current.translated 计算 distance，
// 通过 React state 传入 DragOverlay 实际 props
```

> **Hierarchy override（2026-05-09，V2.3 D10/D11）**：实测验证 V3 公式 `min(280, 120 + dist × 0.5)` + `cubic-bezier(0.16, 1, 0.3, 1)` 在 220 ms 末段 38 % 时长仅完成 1 % 进度（"悬浮"感），同时 dnd-kit 默认 keyframes 不 fade DragOverlay 的 `opacity` / `box-shadow`，导致 unmount 单帧"阴影生硬消失"（详见 `.dev/sidebar-hierarchy-fix/02_research/r4_drop_animation.md` §1.10 / §2.1）。Categories DndContext 调整为：duration 公式 `min(220, 100 + dist × 0.4)`、曲线 `cubic-bezier(0, 0, 0.2, 1)` std ease-out、sideEffects 给 dragOverlay 加 `is-dropping` className（CSS 在 120 ms 内 fade `opacity` + `box-shadow`）。`distance < 4` 跳过路径不变。详见 `.dev/category-hierarchy/02_design_spec.md` V2.3 Revision History + §6.2 V3 invariant override。本注记不修改 V3 spec 主体规则。

### 2.7 Cancel（取消）（V3 撤销虚假 spring overshoot 声称）

> **A-P1 修订**：V2 声称 spring `{280, 32}` 有 ~0.5% overshoot 实测仅 0.0035%（不可感知）。  
> V3 改为诚实表述：cancel 用 cubic-bezier `(0.32, 0.72, 0, 1)` 做"减速回弹"视觉印象（项目 `--ease-drag-cancel` token），形态接近物理弹性而无 overshoot 数值依赖。

| 触发 | 反馈 |
|---|---|
| 按 Esc 键 | DragOverlay snap-back 到原位（`280ms cubic-bezier(0.32, 0.72, 0, 1)`，开局 ease-in 减速感）；原位 opacity 0 → 1 |
| 拖出 sidebar 边界 + 释放 | 同上 snap-back |
| 拖动期间持续在非法区 | DragOverlay opacity 0.95 → **0.5**；cursor 切 `not-allowed` |

> spring 数值（如未来切 motion）：`{ stiffness: 280, damping: 32, mass: 1 }`（ζ≈0.96，settle ~280ms，**形态相近，非数值等价**）

### 2.8 Cursor（V2 明确 lift 期间）

| 状态 | Cursor |
|---|---|
| Hover 在可拖项 | `default`（不切 grab，符合 macOS 气质） |
| 按下未达 4px | `default` |
| **拖动激活瞬间（4px 阈值达到）** | **立即切 `grabbing`** |
| 拖到合法 drop target | `grabbing` |
| 拖到非法区域 | `not-allowed` |
| 拖动结束 / 取消 | 立即恢复 `default` |

### 2.9 已有手势的隔离规则

| 手势 | 隔离方式 |
|---|---|
| ColorPicker 圆点单击 | 圆点 wrapper 加 `data-no-dnd="true"` + `onMouseDown={(e) => e.stopPropagation()}` 双保险 |
| Inline edit / add 输入框 | edit/add 态时整个 SortableContext 设 `disabled` 而非单 row 禁用（避免 Add 输入框边界） |
| Right-click ContextMenu | 右键不触发拖动；激活中按右键则取消拖动 |
| Sidebar 窗口拖动（startDrag） | sortable 容器加 `data-sortable-list`，`startDrag` 用 `target.closest('[data-sortable-list]')` 排除 |
| Refresh 按钮 | 拖动激活期间 disable Refresh + visual gray |
| 单击导航 | activationConstraint.distance: 4 区分；额外加 `justDroppedRef` 防 drop 同 row 误触 click navigate |
| 双击编辑 | 双击不会移动 4px；T13 acceptance 包含手抖测试 |

### 2.10 "Show X more" 折叠态

| 场景 | 行为 |
|---|---|
| 用户在折叠态开始拖动 | **自动展开**（在 `onDragStart` 中调用 `setShowAllCategories(true)`） |
| 拖动期间 | 保持展开 |
| Drop 完成 | 保持展开（不自动折回） |
| 折叠中的项作为 drop target | 自动展开后所有项参与 |

### 2.11 数据一致性反馈（V2 含 version 协议）

| 场景 | 视觉 |
|---|---|
| Drop 后乐观更新 UI | 立即生效（无 loading） |
| 后端落盘成功 | 无额外反馈 |
| 后端落盘失败 | 1. 通过后端最新顺序校准前端 state；2. 错误指示器（5px 红点）出现 1.5s |
| 拖动期间外部刷新 | Refresh disabled；autoClassify 通过 categoriesVersion 协议跳过 categories set（详见 03_tech_plan §4） |

### 2.12 Reduced Motion

`@media (prefers-reduced-motion: reduce)`：
- 所有 transition duration → `0ms`
- DragOverlay 仍渲染（位置跟手），但 cascade/settle/cancel 都瞬时
- Drop indicator opacity 直接 0/1 无淡入

### 2.13 Trackpad / Force Touch / 多指手势（V2 新增）

> A-P0-5 修复

**当前覆盖**（dnd-kit `MouseSensor` 透明处理）：
- 单指 trackpad 拖动：等价 mouse 事件，已自动 cover
- 普通 click：activationConstraint.distance:4 区分

**显式不实现（本期不做）**：
- Force Touch 反馈（需 Tauri 调 macOS NSHapticFeedbackPerformer，扩展工作量大）
- 三指拖（macOS 系统 Three Finger Drag 是 OS 层 mouse drag 模拟，对 WebView 透明）
- 惯性滚动重排（无明确 spec）

**记录于 docs/usage.md**：未来可基于本基础扩展 Force Touch。

### 2.14 WCAG 2.5.7 Dragging Movements Alternative（V2 新增）

WCAG 2.2 要求拖拽功能必须有"单指针 alternative"。
**满足方式**：
- KeyboardSensor 提供 Tab + Space + 方向键 + Esc 完整键盘流程
- 右键 ContextMenu 已包含 Rename / Delete（不含 Move 但**Move 可通过键盘达成**）
- 无需额外"Move to top/bottom" 按钮（保持 sidebar 极简）

---

## 3. 时序示意（V2 含磁吸 + 两段 lift）

### 3.1 Categories 1D — 完整 lift → drag → snap → drop

```
t=0       mousedown on "Coding" row (pointer at row top + 8px)
          │
          │ (movement < 4px → 等待)
t=~16     pointer 移到 row top + 12px (4px movement)
          │
          ↓
t=16      [Drag activates]
          │ Cursor → grabbing
          │ Lift sub-stage 1: 吸盘 (80ms)
          │   原位 scale 1.0 → 1.04
          │   DragOverlay 渲染：opacity 0 → 0.95，无位移
          │ Refresh button disabled
          │ ContextMenu / inline edit 全部清除
t=96      Lift sub-stage 2: 拉离 (120ms)
          │   原位 scale 1.04 → 1.0
          │   原位 opacity 1.0 → 0（消失让位）
          │   DragOverlay 开始跟手位移
t=216     Lift 完成
          │
t=300     pointer 越过 "Design" row 中心
          │ Drop indicator fade in 100ms
          │ Cascade let-pass 220ms（同步无 stagger）
          │   "Design" 及其下方所有 row 同步上移一行高
t=520     Cascade settled
          │
t=600     pointer 进入 slot 中心 12px 范围（snap 触发）
          │ DragOverlay 80ms 平滑吸附到 slot 中心
t=680     吸附完成
          │
t=720     mouseup
          │ Settle 220ms：
          │   DragOverlay 滑向最终位置（已经 snap，移动距离 ≤ 12px）
          │   Drop indicator 1 → 0 fade out
          │ 原位 opacity 0 → 1.0（与 settle 同步）
t=940     Drop complete
          │
          │ 后台异步：
          │   appStore.reorderCategories([...newOrder])（立即 set，IPC 排队）
          │   失败 → 后端校准 + 错误指示器
```

### 3.2 Tags 2D wrap — 与 Categories 同时序，不再赘述

### 3.3 Cancel snap-back（V2 spring 微 overshoot）

```
t=0       User dragged DragOverlay outside sidebar bounds
          │ cursor changes to not-allowed
          │ DragOverlay opacity 0.95 → 0.5
          │
t=800     User releases (mouseup) or presses Esc
          │
          │ Snap-back animation (280ms spring ζ≈0.96):
          │   DragOverlay 滑回源位（峰值 overshoot ~0.5%）
          │   opacity 0.5 → 0 over last 80ms
          │
t=1080    Original row restored to opacity 1.0
```

---

## 4. CSS Token（V2 新增）

新增到 `src/index.css` 的 `:root`：

```css
:root {
  /* macOS system accent — 与 NSColor.controlAccentColor 近似 */
  --color-accent: #0063E1;
  --color-accent-soft: rgba(0, 99, 225, 0.5);

  /* Drag-specific easing/duration tokens */
  --ease-drag: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-drag-lift: cubic-bezier(0.34, 1.32, 0.64, 1);
  --ease-drag-cancel: cubic-bezier(0.32, 0.72, 0, 1);

  --duration-drag-lift-grip: 80ms;
  --duration-drag-lift-pull: 120ms;
  --duration-drag-reorder: 220ms;
  --duration-drag-settle: 220ms;
  --duration-drag-cancel: 280ms;
  --duration-drag-snap: 80ms;
  --duration-drag-indicator-fade: 100ms;
  --duration-drag-indicator-move: 150ms;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-accent: #0A84FF;
    --color-accent-soft: rgba(10, 132, 255, 0.5);
  }
}
```

> 项目目前只有 light 模式，但 V2 一次性预留 dark token 以支持未来。

---

## 5. 不在范围（V2 明确）

- Force Touch / 三指拖 / haptic feedback（未来扩展）
- 实时多用户协作 reorder（项目无云同步）
- 跨设备 sync（项目无）
- 拖到 nav 区"Skills/MCP/..." 形成移动到 nav 的语义（不允许跨区拖动）

---

## 6. Acceptance（V2 量化重写）

> V1 的"无 jank / 顺滑 / 自然"等主观判定 V2 全部改为可量化指标，配合 DevTools / VoiceOver 验证。

### 6.1 视觉效果客观条件（必须全过）

1. ☐ Lift 启动延迟 ≤ **16ms**（DevTools Performance Tab 抓首帧）
2. ☐ Lift 两段总时长 = **200ms ±5ms**（80 grip + 120 pull），且：
    - 吸盘段 ease-out scale up 视觉
    - 拉离段 scale 无 undershoot（不应小于 1.0）
    - 拉离段 opacity 单调下降无负值
3. ☐ Cascade 让位 duration = **220ms ±5ms**，FPS 全程 **≥ 55**（DevTools FPS 仪表）
4. ☐ Settle distance-aware：
    - distance < 4px → settle 瞬时（0ms，磁吸已对齐）
    - distance ≥ 4px → settle = `min(280, 120 + delta × 0.5)`，无可见 overshoot
5. ☐ 磁吸触发距离 = **12px ±1px**，吸附时长 = **80ms ±5ms**
6. ☐ Drop indicator 颜色 = `var(--color-accent)` 解析后的 `#0063E1`（light）/ `#0A84FF`（dark）
7. ☐ Drop indicator 在 wrap 末端正确显示短水平线（24×2px）
8. ☐ Cancel snap-back duration = **280ms ±5ms**，曲线为 `cubic-bezier(0.32, 0.72, 0, 1)`（开局减速感）
9. ☐ DragOverlay 阴影使用 hsl 三层叠加，rendered 像素与 spec 完全一致

### 6.2 行为零回归条件（V2 抽至 03_tech_plan / 04_implementation_plan，仅留下视觉强相关项）

10. ☐ 拖动期间 cursor 切 `grabbing`，hover 时保持 `default`
11. ☐ `prefers-reduced-motion: reduce` 下所有 transition duration = 0ms
12. ☐ Dark mode（macOS 系统切深色）后 indicator 颜色变 `#0A84FF`（即使本期不主推 dark mode，验证 token 可生效）

### 6.3 用户感受口语化条件（V2 加入主观维度作为兜底）

13. ☐ 拖动起始有"先吸住后拉离"的物理感（Things 3 体感）
14. ☐ 让位动画"crisp"（不拖泥带水），全程视觉总时长 < 600ms
15. ☐ 磁吸时不会感到"hidden hand 抢控制权"

> 13-15 项由用户在 dev mode 实测时主观判断，主 Agent 在 T13 中将 dev server 启动后请求用户验证。
