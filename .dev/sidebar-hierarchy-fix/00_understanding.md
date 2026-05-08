# Sidebar Hierarchy Drag — 系统性修复 — Understanding

> 本文档是主 Agent 在派 SubAgent 调研前对任务的一手理解。SubAgent 必读。

## 1. 用户原话

> 当前这个 CATEGORIES 自从加了二级分类后拖动后的磁吸就不是特别自然，总是会误触，比如我把二级分类移除一级分类，它就总是有几率拖动到父类别上面后又闪烁移动下来，移出失败等等，反正问题很多，即使移除了也会闪烁和无动效重排，这个感觉就特别不好，导致一整个跟手性、动效很差，非常不好用，需要系统性的修复并完善。
>
> 树状结构已经修复了很多次各种问题，本次修改不能影响任何的正常功能也不能导致任何新的问题。

## 2. 用户报告的具体可观察症状

| ID | 症状（用户语言） | 重现路径 |
|---|---|---|
| S1 | "磁吸不自然 / 总是误触" | 任意拖拽过程，能感受到 DragOverlay 与 pointer 的拉扯 |
| S2 | "把二级分类移除一级分类，拖到父类别上面后又闪烁移动下来" | 拖 child 离开原父类，途经父类行附近视觉震荡 |
| S3 | "移出失败" | 拖 child 想 promote，松手时未促成 promote（仍是 child） |
| S4 | "即使移除了也会闪烁和无动效重排" | promote 成功后视觉跳变无动效 |
| S5 | "整体跟手性差" | 综合体感 |

## 3. 当前实现摘要（一手代码读出来的事实）

### 3.1 关键文件

- `src/components/sidebar/SortableCategoriesList.tsx` (1242 行) — DnD 主 dispatcher
- `src/components/sidebar/SortableCategoryRow.tsx` (293 行) — 单行 useSortable 包装
- `src/components/sidebar/dnd/treeUtilities.ts` (691 行) — 核心算法（flatten / projection / subtree reorder）
- `src/components/sidebar/dnd/snapModifier.ts` (125 行) — magnetic snap modifier
- `src/components/sidebar/dnd/animations.ts` — token 化的 SNAP_DISTANCE_PX 等

### 3.2 状态机与契约

- `activeId` / `overId` / `offsetLeft` / `pointerBelowOver` — drag 状态
- `dwellState` (`OUT` / `HOVER_NEAR` / `DROP_INTO_READY`) — **仅** ROOT-active demote 用
- `activeOriginalParentId` — drag 开始时的 parent；驱动**非对称 promote/demote**
- `isChildActive = activeOriginalParentId !== null`
- `projected` = `getProjection(displayFlat, activeId, overId, offsetLeft, INDENT_STEP_PX, pointerBelowOver, baseFlat, activeOriginalParentId)` 的返回 `{depth, parentId, isInvalid}`
- `parentRowIdForIndicator` — 5 重 gate（DROP_INTO_READY + !isInvalid + parentId !== null + parentId !== activeOriginalParentId + 必须有 projected）→ 蓝色 indicator 的渲染锚点
- `visibleDropIntoProjectionRef` — 最近一次"实际渲染了 indicator"对应的 projection；drop 时 ROOT-active 唯一可 commit 的源

### 3.3 V2.1 不对称语义（最近修订）

- **demote (root → child)**: 12 px X + 80 ms dwell + 必须有 indicator
- **promote (child → root)**: 离开"原父类子树区域 = `{originalParent, sibling, self}`"立即 promote（**无 X、无 dwell**）
- 实现位置：`treeUtilities.ts:535-548` 的 `originalActiveParentId` 短路 + `SortableCategoriesList.tsx` 的 `isChildActive` 分支
- 来自 V2.1 修订（2026-05-05），之前 V2 是对称严格的

### 3.4 最近 4 次修复（按时间倒序）

| Commit | 内容 | 触及问题 |
|---|---|---|
| `66ae781` | promote 后保留 reorder 位置 | 之前 promote 后位置默认到 categories 数组末尾 |
| `e642b30` | drop-into 稳定性：pointerBelowOver 改用真实 pointer / drop indicator 移到 row 内 | 之前 active-rect-based pointer side 受 snap/overlay 干扰 |
| `d0503cc` | drop indicator 契约：`visibleDropIntoProjectionRef` 作为 ROOT-active 唯一 source | 之前 drop 时重算 projection 导致与可见 indicator 不一致 |
| `7821c07` | 不对称 promote/demote + 4 层 cascading 内部 bug 修复 | 用户反馈"磁吸太强、必须向右才能 promote" |

## 4. 主 Agent 的根因假设清单（确信度标注；待 SubAgent 验证）

### 4.1 假设 H1（高确信）—— pointerBelowOver-based projection 与 V2.1 spec 在 `over === originalParent` 时矛盾

**Spec V2.1（02_design_spec.md:11-23）期望**：child 在原父类子树内（含 originalParent 自身）时**始终保持 child**，走 standard reorder 路径，不显示缩进 indicator。

**实现实际行为**（`treeUtilities.ts:535-551` + 标准算法）：
- `over === originalParent` → `overInOriginalSubtree = true` → 不进入 immediate-promote 分支
- 落入标准算法
- 如果 `pointerBelowOver === false`（pointer 在 originalParent 中线**上方**）→ 标准算法计算 `previousItem = undefined`、`nextItem = originalParent`、`maxDepth = 0` → 返回 **`{depth: 0, parentId: null}` (PROMOTE)**
- 如果 `pointerBelowOver === true`（pointer 在 originalParent 中线**下方**）→ `previousItem = originalParent`、`nextItem = sibling` → 返回 `{depth: 1, parentId: originalParent.id} (KEEP CHILD)`

**结果**：当 child 拖到原父类行内、pointer 跨过原父类中线时，`projected.parentId` 在 `null ↔ originalParent.id` 之间频繁切换。这与 S2 "拖到父类别上面后又闪烁移动下来" 完全吻合。

### 4.2 假设 H2（中确信）—— snapModifier + closestCenter 的相互作用让 over 被锁在 originalParent

`snapModifier.ts` 持续把 active rect 的 transform 拉向 over slot center。`closestCenter` 算法用 active rect (transformed) 选 over。两者构成正反馈：snap 把 active rect 锁在 originalParent center → closestCenter 选 over = originalParent → snap 继续拉。

**结果**：用户向上拖 child 想离开原父类时，pointer 已经远离 originalParent，但 over 不切换。spec V2.1 的"over 离开 → immediate promote"逻辑因此**实际触发不到**，对应 S3 "移出失败"。

### 4.3 假设 H3（中确信）—— 两次 IPC 序列产生中间帧 → S4 闪烁

promote 时 `handleDragEnd` 路径（`SortableCategoriesList.tsx:932-957`）：
```
await onSetCategoryParent(active.id, null)   // IPC 1
await onReorder(newOrderedIds)                // IPC 2
```

两个 IPC 之间 store 已更新（A-1 现在 `parentId=null`），React 渲染中间状态（A-1 在原数组位置 = 紧邻原父类下方），然后 IPC 2 完成又跳到目标位置。视觉上是"先跳一次（无动画）再跳一次（有动画）"。

### 4.4 假设 H4（中确信）—— useSortable cascade 在 store-driven 变化下不触发

dnd-kit `useSortable` 的 cascade transition 依赖 dnd-kit 内部的 measurement 周期，drag 结束后退出该周期。drop 后 store 更新引起 row 在 SortableContext.items 中位置变化时，单纯的 categories 重新 flatten 不会触发 transition。

需要源码验证：dnd-kit 的 cascade 在 drop 之后是否还能继续起作用？还是只在 drag 进行时？

### 4.5 假设 H5（中确信）—— pointerBelowOver 在快速移动下抖动

`pointerBelowOver` 在 `handleDragMove` 中持续重算（`isPointerBelowRowCenter(pointerY, over.rect)`），在 row 边界附近 1 px 抖动就触发状态切换。无任何 hysteresis（滞后区间）保护。child-active 路径下完全没有 dwell 防抖。

## 5. 项目历史与设计权威

### 5.1 已有 Decisional 文档（按权威递减）

| 文档 | 用途 |
|---|---|
| `.dev/category-hierarchy/_synthesis_decisions.md` | 14 决策定锤（D1–D14），最高权威 |
| `.dev/category-hierarchy/02_design_spec.md` V2.1 | hierarchy 视觉/交互规格 |
| `.dev/sidebar-reorder/02_design_spec.md` V3 | V3 不变量（23 项），hierarchy 必须叠加在其上 |
| `.dev/sidebar-reorder/06_snap_research.md` | snap 物理推导（连续引力 + lerp） |
| `.claude/rules/design-language.md` | 项目级硬底线（token 化 / no-stagger / no-overshoot / verify-firsthand） |

### 5.2 不可破坏的 V3 不变量（23 项，关键摘录）

| # | 不变量 |
|---|---|
| 1 | 4 px CustomMouseSensor activation distance |
| 2 | Two-stage lift (80 ms 吸盘 + 120 ms 拉离) |
| 3 | DragOverlay 多层 hsl shadow |
| 4 | 12 px Y 轴 quadratic snap 物理 |
| 5 | 220 ms cascade |
| 6 | 距离感知 settle (120 + 距离 × 0.5，最大 280 ms) |
| 7 | 280 ms cancel snap-back |
| 8 | DndContext modifiers = [snapModifier] only |
| 9 | DragOverlay modifiers = [restrictToWindowEdges] only |
| 22 | closestCenter collision detection |
| 23 | MeasuringStrategy.Always |

**任何修复方案都不能删除/改写这些不变量**。

## 6. 待调研的核心问题

### Q1（dnd-kit 行为验证）
- `closestCenter` 算法的实际输入：是 active rect（受 modifiers 影响）还是 pointer 坐标？source: `node_modules/@dnd-kit/core/dist/utilities/algorithms/closestCenter.ts`?
- DragOverlay 的 transform 链：`useDraggable.transform → modifiers chain → DragOverlay style`，snap 修改的 transform 是否影响 active rect 在 SortableContext.collisionDetection 中的输入？
- `useSortable` 的 cascade transition 触发条件：drag 期间 vs drop 后 store-driven 变化？
- `event.delta.x` 与累积偏移的关系，是否正确反映"用户横向意图"？
- 自定义 `collisionDetection` 的可行性：能否换成 pointerWithin 或基于 event 提供的 pointer 坐标的算法？

### Q2（用户场景帧级 trace）
- 拿 S1-S5 每个症状，按 dev mode 真实操作模拟，列出每一帧的：
  - pointer position
  - active rect (transformed)
  - snap.dx/dy
  - over.id
  - pointerBelowOver
  - projected.{depth, parentId, isInvalid}
  - visibleDropIntoProjectionRef
  - DragOverlay 视觉位置
  - inline source row padding-left
- 标注哪一帧出现"用户期望 vs 实际"的 divergence

### Q3（spec / 实现 gap）
- 对 V2.1 修订（02_design_spec.md L9-29）逐条审计实现是否落地
- 对 §2.7 / §2.13 / §2.14 / §6.3 的状态机/视觉契约逐条审计
- 输出 spec-implementation gap 表，以及哪些 gap 是"用户报告症状的根因"

### Q4（修复方向的物理可行性）
- 选项 A: 让 child-active 时 `over === originalParent` 走 special path（不调 pointerBelowOver-based depth projection），始终 keep-child
- 选项 B: snap 在 child-active 时禁用 / 减弱
- 选项 C: collisionDetection 换 closestCorners 或 pointerWithin（基于 pointer）
- 选项 D: 把 setCategoryParent + reorder 合并为 store 层单一乐观更新（避免中间帧）
- 选项 E: 给 child-active 路径加 dwell-like 防抖（但保持 V2.1 "无 X 阈值" 的精神）

每个选项的副作用、对 V3 不变量的影响、对 S1-S5 各症状的覆盖度。

### Q5（同类工具参考）
- macOS Finder list view 文件夹拖入/拖出
- Linear sidebar nested issues
- Things 3 Areas/Projects
- Notion sidebar pages

每个工具：
- 是否有磁吸？磁吸如何处理 hierarchy 离开？
- 拖 child 到 parent 行附近的视觉/物理反馈
- drop 后是否有 cascade 动效

## 7. 修复约束（来自用户）

1. **不能影响任何正常功能**：本次只能补丁/收紧现有路径，不能做架构级重构
2. **不能引入新问题**：每个修改要有回归保护（单测 + dev 实测）
3. **最高质量**：考究、克制、物理级动效——Apple/Linear/Things 3 标准
4. **系统性**：修复要解决根因而非补单个症状

## 8. 任务分类（按 plan-as-research-design.md）

**Tier: Structural（中等先例 + 多次失败 + 用户已声明系统性意图）**

判断依据：
- 已有 substantial spec（02 V2.1 + V3 baseline）
- 已修过 4 次但仍有问题 → 可能不只是补丁，需要重新审视根本机制
- 用户明确"系统性修复"+ "不能引入新问题" → 不是 Maintenance

**调研深度选择：Compact research-first pipeline (3-4 stages)**

- Stage 1: 3 个并行调研 SubAgent (A/B/C)
- Stage 2: 综合 → `_synthesis_decisions.md` + `_risk_distillation.md`
- Stage 3: spec patch + implementation plan
- Stage 4: 1 个 alignment reviewer（确保 spec/plan 与 V2.1 + V3 不变量一致）

不走 Creative 全套（理由：不创建新 design language，仅在已有 spec 内部找 gap 修复）。
