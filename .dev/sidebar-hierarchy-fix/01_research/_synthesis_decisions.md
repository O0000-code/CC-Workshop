# Sidebar Hierarchy Drag — 综合决策（Round 1 锁定）

> **作者**：主 Agent（亲自综合 r1 / r2 / r3）
> **日期**：2026-05-08
> **本文档地位**：Decisional —— 锁定本次系统性修复的核心决策。spec / plan / SubAgent 必须以此为准。
> **冲突解决**：本文档同级冲突 → 主 Agent 二次修订；跨文档冲突（与 02 V2.1 / V3 不变量）→ 本文档优先（V2.1 spec 与本文档冲突部分按本文档执行；V3 不变量除 D7 注明软破之外保持）。

## 0. 调研确认的关键事实（不再讨论；后续 spec/plan 直接引用）

### F1（一手源码确认）—— snap → collisionRect → closestCenter 反馈环

来源：r2 §1.3 (`core.esm.js:2984`) + §1.6 + §2.3。

snap 修改的 transform 进入 `collisionRect = getAdjustedRect(draggingNodeRect, modifiedTranslate)`，下一帧 `closestCenter` / `closestCorners` / `rectIntersection` 都以此 collisionRect 为输入；snap 锁定了 over 选择。

`pointerWithin` 是 dnd-kit 唯一基于真实指针位置的 collision algo（r2 §1.5：`pointerCoordinates = activationCoordinates + translate`，未经 modifier 影响）。

### F2（一手源码确认）—— useSortable cascade 50 ms 窗口

来源：r2 §3.5（`sortable.esm.js:565-579`）+ §3.6 + §3.7。

drop 后 `previous.current.activeId` 由 `setTimeout(50)` 清空。窗口外 `wasDragging = false` → `defaultAnimateLayoutChanges` 返回 false → useSortable cascade 不触发。Tauri IPC await ≥ 50 ms 是常态，**双 IPC 路径下几乎必然错过窗口**（r2 §3.7）。

### F3（代码 trace 确认）—— pointerBelowOver 在 over=originalParent 中线抖动 → projection 切换

来源：r1 §1.1 (S2 frame trace) + §1.1 H1 验证表。

`over === originalParent` → `overInOriginalSubtree = true`（`treeUtilities.ts:541`）→ fall through 标准算法 → 标准算法用 `pointerBelowOver` 决定 `previousItem` / `nextItem` → `pointerBelowOver=false` 时返回 `{depth: 0, parentId: null}`、`pointerBelowOver=true` 时返回 `{depth: 1, parentId: originalParent}`。pointer 跨 originalParent 中线即切换。

### F4（spec gap）—— V2.1 期望 vs 实现行为

来源：r1 §2 V2.1 spec 逐条审计。

V2.1 spec L17 "same-parent reorder（child 在原父类子树内调整顺序）→ 保持 child 状态" 与实现矛盾（实现允许 projected.parentId=null）。**这是 spec 期望但实现未达到**。

### F5（industry calibration）—— 五家产品全无 in-flight 磁吸

来源：r3 §4.1 + §6.2。

Finder list view / Linear sidebar / Things 3 / Notion sidebar / Apple Notes 全部"DragOverlay 严格跟手 + drop indicator 表达 destination"，无 in-flight 位置磁吸。Apple HIG 强制"identify one at a time"，与 V2.1 实施层 S2 抖动直接冲突。

### F6（spec 内部冲突）—— V2.1 immediate-promote vs §2.13 cross-parent demote

来源：r1 G6（§4.A）。

spec §2.13 L431 期望"子类→另一父类的 drop into 区 = change parent (demote)"。V2.1 修订 L15 期望"离开原父类即 immediate promote"。**两者逻辑互斥**：拖 A-1 到 root D 上 → V2.1 → immediate promote 到 root；拖到 D 上 → spec L431 → 应该 demote 成 D 的 child。**实现走 V2.1 路径**，用户失去 cross-parent direct-demote 能力。

---

## 1. 决策表（按确信度排序）

### D1 [高确信] —— same-parent reorder 时 inline source row 视觉锁定

**决策**：`SortableCategoriesList.tsx:1117-1125` 的 `renderDepth` 计算修改：当 `isChildActive && projected.parentId === activeOriginalParentId`（即 same-parent reorder）时，强制 `renderDepth = activeOriginalDepth`（child 的话锁定 1，不跟 projected.depth）。

**理由**：F3 + F4 证实 spec 期望 child 在原 subtree 内 visual stable；当前 inline 跟 projected 抖动违反 V2.1 spec。即使 projection 仍可能切换，视觉不再闪烁。

**覆盖症状**：S2（视觉闪烁防御层）。

**是否破 V3 不变量**：否。

**与 V2.1 spec 关系**：完全对齐 L17 "保持 child 状态"。

---

### D2 [高确信] —— `getProjection` 内 over=originalParent 时 short-circuit 为 keep-child

**决策**：`treeUtilities.ts:535-551` 的 asymmetric branch 增强：当 `originalActiveParentId != null && overItem.id === originalActiveParentId` → 直接返回 `{depth: activeItem.depth, parentId: originalActiveParentId, isInvalid: false}`（始终 keep child），**不调用 pointerBelowOver-based 标准算法**。

**理由**：F3 证实 standard algorithm 在 over=originalParent 时基于 pointerBelowOver 切换 promote/keep-child，违反 V2.1 spec L17。直接 short-circuit 消除根因。注意：sibling-of-active（即 active 的另一个 child sibling）仍走标准算法（同级 reorder 需要计算位置）。

**覆盖症状**：S2 根因之一。

**是否破 V3 不变量**：否。

**与 V2.1 spec 关系**：完全对齐 L11-23。把 spec 的"在原 subtree 区域 → 保持 child"从"behavior intent"提升为"algorithm short-circuit"。

---

### D3 [高确信] —— Collision detection 改为混合 `pointerWithin → closestCenter` fallback

**决策**：`SortableCategoriesList.tsx:1060` 的 `collisionDetection={closestCenter}` 改为：
```ts
const sidebarCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) return pointerHits;
  return closestCenter(args);
};
```

**理由**：F1 证实 snap → collisionRect → closestCenter 反馈环；pointerWithin 用 pointerCoordinates 不受 modifier 影响（r2 §1.5）。指针在 row 内时基于真实指针选 over，离开行时退回 closestCenter（避免行间 gap 1 px 时 over=null）。

**覆盖症状**：S3 根因（snap 锁定 over）+ S2 部分（pointer 离开 originalParent 时 over 真正切换 → asymmetric immediate-promote 能触发）+ S1。

**是否破 V3 不变量**：**软破 #22**（closestCenter）。但保留 closestCenter 作为 fallback —— 行间 gap、列表外、空 droppable 集合 时仍用 closestCenter，行为与 V3 一致。

**spec patch**：02_design_spec.md V2.1 → 增加章节 V2.2 修订记录。`.dev/sidebar-reorder/02_design_spec.md` V3 §6.2 不变量 #22 改为"closestCenter 作为 fallback；in-flight 期间优先 pointerWithin 当指针在行内"。

---

### D4 [高确信] —— store 层合并 setCategoryParent + reorder 为单次乐观 mutation

**决策**：`appStore.ts` 增加 `moveCategoryToParentAtPosition(id, newParentId, newOrderedIds)` 方法。该方法：
1. **同步**计算 atomic optimistic state（parentId + order 一起改），一次 React render commit
2. 异步 fire-and-forget 触发 `setCategoryParent` IPC（已 enqueue）+ `reorder` IPC（已 enqueue）
3. 任一 IPC 失败时 → `get_categories` 拉取真状态 → 整体 fallback

`SortableCategoriesList.tsx:932-957` 的双 await 链改为单次调用 `moveCategoryToParentAtPosition`。

**理由**：F2 证实 50 ms cascade 窗口；双 IPC await 必错过；中间帧引起跳变。store 层一次乐观更新 → React commit 一次新 state → useSortable 在 50 ms 内看到 items 变化（因为 cascade window 由 setTimeout 50 ms 维护，不依赖 IPC 完成）→ cascade 触发。

**覆盖症状**：S4 根因。

**是否破 V3 不变量**：否（IPC 串行经 DATA_MUTEX 仍被 backend enqueue）。

**spec patch**：03_tech_plan §3 IPC 序列描述更新。

**风险关键**：IPC 失败时 fallback 路径要正确恢复 store。详见 `_risk_distillation.md` R-D4-1。

---

### D5 [高确信] —— snap modifier 在 isChildActive 时退化（不完全禁用）

**决策**：`snapModifier.ts` 工厂改造：
- 接受外部 `getActiveContext()` ref（项目层在 onDragStart 时填入 `{ activeId, originalParentId }`）
- 当 `originalParentId != null`（child active）→ snap 强度乘以 `0.3`（保留 lift/drop 端点些许物理感，去除 in-flight 锁定力）
- 当 root active（originalParentId == null）→ 行为不变（保留 V3 §2.5）

**理由**：F1 证实 snap 是反馈环源头；F5 证实参考集全无 in-flight 磁吸。但完全禁用 snap 会让 child active 拖动 feel "drop to floor"，与 V3 整体物理感不一致。0.3 系数是经验调谐，dev mode 实测目标 = "child 拖动期间 DragOverlay 跟手不被拽"。

**覆盖症状**：S1 + S3 + S5。

**是否破 V3 不变量**：**软破 #4 / #8**（snap 物理 / modifiers 配置）。

**spec patch**：02 V2.2 + V3 §2.9 修订（声明 hierarchy 下 snap 行为按 isChildActive 调整）。

**实测验收**（dev mode）：拖 child A-1 离开 originalParent 时 DragOverlay 中心与 pointer 偏差 < 4 px。

---

### D6 [中确信] —— D5-invalid 视觉补全

**决策**：`DragOverlayCategoryRow.tsx` 增加 `isInvalid?: boolean` prop（来自 SortableCategoriesList 的 `projected.isInvalid`），`isInvalid=true` 时 `opacity: 0.5` + `cursor: not-allowed`（class 切换）。

**理由**：r1 G5 + V2.1 spec §2.13 / §2.14 要求；当前未实现。

**覆盖症状**：用户在试图非法 drop（父类→另父类 child）时无视觉反馈，间接影响 S1 体感。

**是否破 V3 不变量**：否。

**spec patch**：无新增（只是补全已要求的实现）。

---

### D7 [中确信] —— cross-parent direct demote 取消（V2.1 优先）

**决策**：F6 spec 内部冲突按 V2.1 修订决议处理 —— 拖 child A-1 到另一 root D 上时，**immediate promote to root**（与 V2.1 L11-29 一致）。**取消** spec §2.13 L431 "子类 → 另一父类的 drop into 区 = change parent" 路径（spec patch 删除该行）。

**理由**：
1. V2.1 修订是用户实测后明确反馈的语义（"磁吸力太强、必须向右才能 promote"）；
2. cross-parent direct demote 在 industry 参考集（Linear / Notion / Apple Notes）也并非主流路径 —— 用户更熟悉"先到 root、再 demote 到新 parent"两步流程；
3. 保留 cross-parent demote 会要求"over=root D 时区分 promote vs demote"，必然引入新的 X+dwell 状态机给 child-active —— 与 V2.1 "child active 无 X 无 dwell" 直接冲突。

**用户实际能力路径**（spec patch 描述）：
- 拖 A-1 到 D 上方 → A-1 promote 到 root（释放在 D 上方）
- 用户随后将 A-1（现在 root）拖到 D 上方 → 第二次拖动按 root active → 12px X + dwell → demote 成 D 的 child
- 两步操作；操作时间 < 5 秒

**ContextMenu 备选**：保留 V2.1 spec §2.20 的"Promote to root"，**不增加** "Move to Parent..."（与 V2 patch plan §3.7 一致）。

**键盘等价**：现有 Space + ←/→ 路径不变（V2 §3）。

**覆盖症状**：明确 G6 设计冲突；不直接对应 S1-S5 但消除歧义。

**是否破 V3 不变量**：否。

**spec patch**：02 V2.2 修订 §2.13 L431。

---

### D8 [中确信] —— hierarchy 验收 acceptance 增强

**决策**：02 V2.2 + 03 + 04 增加以下 acceptance criteria（必须 dev mode 实测通过才可 ship）：

| # | 用户操作 | 期望视觉 | Anti-observation |
|---|---|---|---|
| A1 | 拖 child A-1 在原父类 A 行内上下移动 | inline DOM 不抖动；DragOverlay 跟手；indicator 不显示 | 无 padding-left 抖动；无 indicator 闪烁 |
| A2 | 拖 child A-1 越过 A 顶端进入根级 gap 区 | DragOverlay 跟手；inline DOM 缩进 26→10 转换发生在 over 切换时（不是 pointer 跨 A 中线时） | 不会"被拉回 A 行" |
| A3 | promote 完成后视觉 settle | A-1 出现在目标 root 位置；padding-left 220ms cascade transition；行间无中间帧跳变 | 无两次跳变；无"先跳错位再跳目标位置" |
| A4 | 拖 root A 到 root B 上方 + X≥12 + dwell 80ms | indicator 显示在 B 行下方（depth=1 缩进）；松手 commit demote | （V2 现有行为不变）|
| A5 | D5-invalid（拖 root A 有 children 到另一父行的 drop-into 区） | DragOverlay opacity 0.5 + cursor not-allowed；indicator 不渲染 | 不会"看似 commit 然后 snap-back" |

按 fix-must-define-user-observable-success.md 规则，每个 commit 在 push 前必须确认对应 acceptance 通过。

**spec patch**：02 V2.2 §9。

---

## 2. 不做的决策（明确排除）

| # | 项 | 排除理由 |
|---|---|---|
| N1 | 完全放弃 in-flight 磁吸（06_snap_research §6.3 方案 X） | 影响 V3 flat reorder，超出 hierarchy 修复范围；用户未要求；D5 已满足 hierarchy 场景需求 |
| N2 | hysteresis 状态机给 child active | D2 + D3 已系统性解决根因；引入新状态机是过度工程 |
| N3 | 改 closestCenter 为 closestCorners 或 rectIntersection | r2 §4.4 / §4.6 证实仍受 collisionRect 影响，无收益 |
| N4 | 改 spec dwell 80 ms → 500 ms 对齐 Finder | F5 calibration 仅是 reference；本次实施层修复不调 dwell 数值（D2+D3 修好后 80 ms 应足够） |
| N5 | 后端 IPC 合并（setCategoryParentAtPosition） | D4 store 层合并已足；后端不动减少回归面 |
| N6 | 修改 V3 §2.5 / §2.9 / 不变量 #22 的 V3 spec 主体 | D3 / D5 仅在 hierarchy 子集下软破，spec patch 在 V2.2 章节做 hierarchy override，不动 V3 spec 主体（Document Authority Ranking 允许 V2 在 V3 之上叠加） |

---

## 3. 修复方案优先级（实施顺序）

| Stage | 决策 | 估算行数 | 备注 |
|---|---|---|---|
| Stage A（最小可见效）| D2 + D1 | ~30 行 / 2 个文件 | 立刻消除 S2 视觉闪烁 |
| Stage B（核心反馈环修复）| D3 | ~15 行 / 1 个文件 | 解决 over 锁定 → S3 + S2 根因 |
| Stage C（中间帧消除）| D4 | ~80 行 / 2 个文件（appStore + SortableCategoriesList） | 解决 S4 |
| Stage D（snap 调谐）| D5 | ~30 行 / 1 个文件 | 解决 S1 体感 |
| Stage E（视觉补全）| D6 + D7 spec patch | ~20 行 / 2 个文件 | 补 D5-invalid 视觉 + 修 spec |
| Stage F（验收 + spec）| D8 + spec V2.2 | spec only | 验收 acceptance 锁定 |

每个 Stage 完成后建议 dev mode 实测对应 acceptance。Stage 之间可串行；A 和 B 是核心，必须先做。

---

## 4. 与 cross-document-cascade-discipline.md 的一致性

本次 spec 修订（V2.1 → V2.2）的 cascade footprint：

- 02 V2.2 §2.13 L431 删除 cross-parent demote 路径（D7）
- 02 V2.2 §2.7 仍引用 5-gate（D2 不影响 indicator 渲染条件）
- 02 V2.2 §2.9 增加 "isChildActive 下 snap 退化" 描述（D5）
- 02 V2.2 §9 增加 5 项 acceptance（D8）
- 03_tech_plan §3 / §5 / §6 + 04_implementation_plan：D4 store 合并 + D3 collision 改造影响处描述同步
- `.dev/sidebar-reorder/02_design_spec.md` V3 §2.5 / §6.2 不变量 #22 增加 "hierarchy override 见 02 V2.2"

**cascade scope grep**（执行 spec patch 前）：

```
rg -n 'closestCenter|setCategoryParent.*reorder|in-flight 磁吸|drop into.*另一父类' src/ src-tauri/ .dev/
```

每条 hit 必须 audit。

---

## 5. 验证流程（综合阶段后）

进入 plan 模式之前的 readiness check：

- [x] r1 / r2 / r3 调研报告完整
- [x] 根因 F1-F6 全部由一手代码 / 源码 / spec 证实
- [x] 决策 D1-D8 每条都对应 1-2 个症状
- [x] 不破 V3 不变量除 D3 / D5 软破注明
- [x] cascade footprint 显式列出
- [x] 不做项 N1-N6 显式排除

下一步：
1. 写 `_risk_distillation.md`
2. EnterPlanMode → 写 02 V2.2 spec patch + 04_implementation_plan
3. 一份 alignment SubAgent reviewer
4. 用户确认 → ExitPlanMode → 实施
