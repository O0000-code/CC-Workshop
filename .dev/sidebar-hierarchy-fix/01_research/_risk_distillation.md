# Sidebar Hierarchy Drag — Risk Distillation

> 配套 `_synthesis_decisions.md`。每个风险一行 + 引用研究 r*.md 的具体段落。spec / plan / SubAgent 在编写时**必须 audit 这份清单**——修复方案不能违反任一项。

## R-arch（架构层风险）

| # | 风险 | 来源引用 | 修复路径必须保证 |
|---|---|---|---|
| R-arch-1 | snap 修改 transform 直接进入 collisionRect → 同帧 closestCenter 用偏移后 rect | r2 §1.3 / §2.3 (`core.esm.js:2984`) | D3（hybrid pointerWithin）+ D5（child-active 减弱 snap）双层防御；任何修复绕过 collisionRect 路径都必须验证 over 选择不再被 modifier 锁定 |
| R-arch-2 | useSortable cascade 50 ms 窗口由 `setTimeout(50)` 维护（`sortable.esm.js:575-578`） | r2 §3.5 / §3.7 | D4 store 合并必须**单次 React commit**完成 parentId+order 改动；任何修复让 IPC 完成后才 mutate store 都会错过窗口 |
| R-arch-3 | `pointerWithin` 在指针落在行间 gap 时返回空 → over=null → snap decay → DragOverlay 漂回鼠标 | r2 §1.5 + §4.3 | D3 必须保留 closestCenter 作为 fallback（hybrid 模式）；不能裸用 pointerWithin |
| R-arch-4 | `MeasuringStrategy.Always` 会在 sortableContext.items 变化时重测 droppable rect (`useDroppableMeasuring`) → 中间帧期间 droppable rect 不一致 | r2 §6.4 | D4 store 合并必须 atomic（一次 commit），避免 React 渲染中间状态 |
| R-arch-5 | active row 受 ActiveDraggableContext.transform；其他 row 不受 modifier 影响 | r2 §7.3 (`core.esm.js:3409-3410`) | D5 减弱 snap 仅影响 active row 视觉；不会影响 cascade let-pass — 与 V3 §2.4 cascade 解耦无冲突 |

## R-spec（spec 一致性风险）

| # | 风险 | 来源引用 | 修复路径必须保证 |
|---|---|---|---|
| R-spec-1 | V2.1 L17 "保持 child 状态"被实现违反；spec 期望 inline 视觉稳定 | r1 §2 G1/G2/G3 + 02 V2.1 L17 | D1 + D2 双层（视觉锁定 + projection short-circuit）必须同时实施 |
| R-spec-2 | 02 V2.1 §2.13 L431 与 V2.1 L15 互斥（cross-parent demote vs immediate promote） | r1 §4.A G6 + 02 spec L422-437 | D7 决策按 V2.1 优先；02 V2.2 必须删除 §2.13 L431 cross-parent demote 行 |
| R-spec-3 | V3 不变量 #22 (closestCenter) 在本修复软破 | r2 §8 + V3 §6.2 | D3 必须在 02 V2.2 章节显式声明 hierarchy override；V3 主体不动 |
| R-spec-4 | V3 §2.5 / §2.9 hierarchy 不修改 snap 的约束在本修复软破 | 02 V2 §2.9 + r3 §6.2 | D5 必须在 02 V2.2 章节显式声明 isChildActive 下 snap 减弱；02 V2.1 §2.9 改为引用 V2.2 |
| R-spec-5 | spec V2.1 修订后 03_tech_plan / 04_implementation_plan 是否同步——cross-document cascade 文档 | cross-document-cascade-discipline.md | spec patch 必须在 Revision History V2.2 显式列出 cascade footprint；plan 同步 patch |
| R-spec-6 | spec 与 design-language.md 的 token 化约束 | design-language.md §Constraints | D5 引入新 snap 强度系数 0.3 → 必须 token 化为 `--snap-strength-child-active` 或 spec 显式说明 hardcode 理由 |

## R-impl（实施层风险）

| # | 风险 | 来源引用 | 修复路径必须保证 |
|---|---|---|---|
| R-impl-1 | D4 store 合并的 fallback 路径：IPC 1 失败但 IPC 2 已 enqueue → 状态分裂 | r1 §1.3 trace + appStore.ts 双 IPC | D4 实施必须有 atomic fallback：任一 IPC 失败 → 整体 `get_categories` 拉取真状态；不能 partial commit |
| R-impl-2 | snapModifier 是 module-singleton；改为闭包工厂 + ref 注入会改变共享状态语义 | r2 §5.2 + snapModifier.ts:125 | D5 实施必须保留 module-level singleton；通过外部 ref（在 onDragStart 时 set）注入 isChildActive 信号；不重建 modifier |
| R-impl-3 | hybrid collisionDetection 在 pointerWithin 返回多个 hits 时的排序行为未在 r2 详查 | r2 §1.5 (`core.esm.js:472-513`) | D3 实施时确认 pointerWithin 返回值排序（应该是 closestCenter 同样 sortCollisionsAsc）；如有疑虑，hybrid 函数内手动 take first |
| R-impl-4 | D2 short-circuit 必须仅在 over === originalParent 自身时触发（不影响 sibling 路径） | 02 V2.1 L17 + r1 §1.1 | D2 代码里**严格限制**为 `overItem.id === originalActiveParentId`，sibling-of-active 仍走标准算法 |
| R-impl-5 | inline source row visual lock（D1）与 §2.8 缩进过渡（drop 完成 padding-left 220 ms transition）的相互作用 | 02 V2 §2.8 + SortableCategoryRow.tsx:129 | D1 仅锁定 `renderDepth` during drag；drop 后 useSortable 的 isDragging=false → padding transition 启用，与 §2.8 一致 |
| R-impl-6 | D6 D5-invalid 视觉（DragOverlay opacity 0.5）与 V3 §2.7 cancel snap-back 视觉一致性 | 02 V2 §2.13 + V3 §2.7 | D6 实施使用 V3 现有的 opacity 0.95 → 0.5 切换语义（不引入新 fade transition；§2.22 anti-pattern 锁定）|

## R-regression（回归风险）

| # | 风险 | 来源引用 | 修复路径必须保证 |
|---|---|---|---|
| R-reg-1 | V3 flat reorder 不能受影响 | 用户："不能影响任何正常功能" | D3 / D5 在 hierarchy 子集（isChildActive 或 hierarchy useDroppable items 集合）下激活；root active flat reorder 行为完全不变 |
| R-reg-2 | dev / release build 二者行为一致 | 项目 V3 历史 + memory feedback_verify_fix_actually_applies | 每个 Stage 在 dev mode 实测后确认；ship 前必须 release build 实测一遍 |
| R-reg-3 | 23 V3 不变量除 #4 / #8 / #22 在 D3 / D5 软破之外保持 | V3 §7 + 02 V2 §7 | spec patch 列出每个不变量是否被影响；plan 实施时执行 V3 invariant audit |
| R-reg-4 | 单测覆盖：现有 treeUtilities.test.ts / SortableCategoryRow.test.tsx 不能 break；D2 / D3 / D4 / D5 各自加新测试 | 项目现有 235 frontend tests | 每个 Stage 完成后 npm test 全绿；新决策必须有对应测试 |
| R-reg-5 | 235 frontend tests + 142 backend tests 一律不能 break | 项目历史 P0 commit msg | 实施 SubAgent 在每次提交前 npm test + cargo test 双绿色 |
| R-reg-6 | 11 V2 hierarchy 不变量 (R-V3-1 ~ R-V3-23) 在 V2 spec 列出 | 02 V2 §7 | 同 R-reg-3 |
| R-reg-7 | 单测中 over === originalParent 的 case 添加 | r1 §2 spec 落地审计未审 | D2 实施必须新增 `treeUtilities.test.ts` case："child A-1 over A (originalParent) at center → keep child（depth=1, parentId=A）；at top → 同样 keep child" |

## R-ux（用户体验风险）

| # | 风险 | 来源引用 | 修复路径必须保证 |
|---|---|---|---|
| R-ux-1 | snap 减弱后 child 拖动 feel "drop to floor"（无物理感）| r3 §6.2 + V3 §1 | D5 系数 0.3 是初始值；dev mode 实测后调谐至 acceptance A1 通过 |
| R-ux-2 | hybrid collisionDetection 边界 1 px 抖动（pointer 在 row 边界）| r2 §4.3 | D3 + D2 配合：D2 让 over=originalParent 时视觉不变，D3 让 pointer 离开行立即切换 over → 边界抖动不再产生 projection 抖动 |
| R-ux-3 | D7 取消 cross-parent demote → 用户原有"一步到位 demote"工作流改两步 | r1 §4.A G6 + r3 §3.2 (Linear 用 picker) | D7 决策已记录；用户实际体验由 dev mode 实测验证；如显著影响 → 后续考虑 ContextMenu "Move to Parent..." 引入（V2 patch plan §3.7 已 deferred） |
| R-ux-4 | F5 / F6 calibration：80 ms dwell vs Finder 500 ms | r3 §3.1 + 4.1 / 5.3 | D 不调 dwell 数值；如修复后 user 仍报"误触" → backlog 调整为 100-150 ms |

## R-meta（元层风险）

| # | 风险 | 来源引用 | 修复路径必须保证 |
|---|---|---|---|
| R-meta-1 | 修复期间在 dev mode 反复 build + reinstall 浪费时间（memory feedback） | memory feedback_verify_fix_actually_applies | 多轮 fix 一律 `npm run tauri dev`；release build 仅在 ship 前 |
| R-meta-2 | SubAgent 在实施期间引入额外 abstraction（违反 simplify guidance） | CLAUDE.md "no over-engineering" | plan 中明确每个决策的"最小变动行数"（D1: ~10、D2: ~20、D3: ~15、D4: ~80、D5: ~30、D6: ~20）；超出 1.5x 触发膨胀自检 |
| R-meta-3 | 用户实测反馈 vs reviewer 反馈优先级冲突 | memory feedback_user_test_outranks_reviewer | 每个 Stage 完成后 user dev mode 实测 = ground truth；reviewer 清单进 backlog |
| R-meta-4 | 修复影响其它 sidebar drag scenarios（Tags reorder etc.） | r1 §0 范围 | D3 / D5 仅在 categories DndContext 中激活；Tags / Skills 等其它列表不受影响 |

---

## 综合 audit checklist（spec / plan / SubAgent 编写时执行）

- [ ] **D1**：inline source row visual lock 仅在 same-parent reorder 触发；不影响 demote
- [ ] **D2**：getProjection short-circuit 仅在 `overItem.id === originalActiveParentId` 时触发
- [ ] **D3**：hybrid collisionDetection 保留 closestCenter 作为 fallback
- [ ] **D4**：store 合并 atomic optimistic + IPC 失败统一 fallback
- [ ] **D5**：snap modifier 通过外部 ref 注入；保留 module-singleton
- [ ] **D6**：DragOverlay opacity 0.95↔0.5 瞬时切换（不引入 fade）
- [ ] **D7**：02 V2.2 删除 §2.13 L431 cross-parent demote 行
- [ ] **D8**：5 项 acceptance criteria 写入 02 V2.2 §9
- [ ] **R-spec-3 / R-spec-4**：02 V2.2 显式声明 V3 不变量 #4 / #8 / #22 的 hierarchy override
- [ ] **R-spec-5**：cascade footprint 在 02 V2.2 Revision History 列出
- [ ] **R-spec-6**：snap 减弱系数 0.3 → token 化或 spec 注明 hardcode 理由
- [ ] **R-reg-1 / R-reg-2 / R-reg-3 / R-reg-4 / R-reg-5 / R-reg-6**：每 Stage 后 npm test + cargo test + dev mode 实测
- [ ] **R-impl-4**：单测覆盖 over === originalParent 多种 pointer 位置
- [ ] **R-meta-1**：实施全程 dev mode；ship 前 release build 一次
