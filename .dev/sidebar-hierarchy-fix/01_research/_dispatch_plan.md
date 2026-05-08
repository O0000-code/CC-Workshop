# Sidebar Hierarchy Drag — Research Dispatch Plan (Round 1)

> 本轮调研由 3 个**并行**调研 SubAgent 承担。本计划是它们的派单契约。
> 主 Agent 后续基于 3 份 r*.md 报告写 `_synthesis_decisions.md` + `_risk_distillation.md`。

## 0. 必读上下文

每个 SubAgent **必须先读**以下文档，否则不要开始工作：

1. `.dev/sidebar-hierarchy-fix/00_understanding.md` — 主 Agent 的根因假设清单（H1-H5）+ 调研问题（Q1-Q5）
2. `.dev/category-hierarchy/02_design_spec.md` 全文，特别是：
   - `Revision History V2.1` (L9-29) — 不对称 promote/demote 语义微订
   - `§2.7 Drop Indicator` (L294-340)
   - `§2.13 Drop Validity` (L422-437)
   - `§2.14 Dwell 状态机` (L438-484)
   - `§4.1 / §4.2` 时序示意 (L781-862)
   - `§6.3` (L1030-1062) — 12 px + 80 ms
3. `.dev/sidebar-reorder/02_design_spec.md` V3 §2.5 Snap 磁吸
4. `.dev/sidebar-reorder/06_snap_research.md` §1.3 / §1.4 / §2 / §4 物理推导
5. `.claude/rules/design-language.md` — token / no-stagger / no-overshoot / verify-firsthand 硬底线
6. `.claude/rules/verify-third-party-behavior-firsthand.md` — 任何"库提供 X" 必须 link 到 `node_modules/...`
7. `.claude/rules/validate-numerical-equivalence-claims.md` — 任何"等价于"必须 RMSE 验证

## 1. 分工

### Agent A — 用户场景帧级 trace + spec/实现 gap 审计

**目标**：把 00 中 S1-S5 每个症状映射到具体代码路径 + 帧级状态。同时审计 V2.1 spec 与实现的 gap。

**任务**：
1. 阅读 00 + 必读上下文 + `SortableCategoriesList.tsx` 全文 + `treeUtilities.ts` 全文
2. 对 S2 "拖到父类别上面后又闪烁移动下来"，**手算或用 mental model**给出拖 A-1 over A 时（pointer 在 A 中线上方/下方）的逐项状态：
   - `over.id` / `pointerBelowOver` / `originalActiveParentId`
   - `getProjection` 内部分支走向（asymmetric branch / 标准算法）
   - `previousItem` / `nextItem` / `dragDepth` / `projectedDepth` / `maxDepth` / 最终 depth
   - `projected.parentId` / `parentRowIdForIndicator` / `visibleDropIntoProjectionRef`
   - DragOverlay 视觉位置 / inline row padding-left
   - 验证 H1 是否成立（pointer 跨 originalParent 中线导致 promote/keep-child 切换）
3. 对 S3 "移出失败"，trace 用户向上拖 A-1 经过 A、再经过 root B 的过程：
   - over 何时切换？snap 是否锁住 over？
   - asymmetric immediate-promote 何时触发？
   - 验证 H2 是否成立
4. 对 S4 "promote 后无动效闪烁"，trace `handleDragEnd` 路径下 setCategoryParent + reorder 双 IPC 之间的 React 渲染中间帧：
   - flatten 输出在中间帧的形态
   - useSortable transition 是否触发
   - 验证 H3 / H4 是否成立
5. 对 S1 / S5 综合体感，列出"哪些代码路径让 DragOverlay 与 pointer 不一致"
6. 审计 02 V2.1 spec L9-29 每条要求是否在实现中有对应代码：
   - "over.id 仍在 {originalParent, sibling, self} 内 → 保持 child 状态"——实现里 pointerBelowOver 还在影响 → spec 期望被违反吗？
   - "不显示缩进 indicator" 在 same-parent reorder 下——实现 5 重 gate 是否真正排除？
   - "无需 X 偏移、无需 80 ms dwell" promote——实现 isChildActive 路径是否真无 dwell？
   - 其它每条
7. 对 §2.14 / §6.3 状态机契约逐条审计
8. 把每个症状最终归因到 1-3 个具体代码 file:line + 1 句话根因

**产出**：`r1_user_scenario_trace.md`（≤ 1500 行；表格化呈现）

**关键节制**：
- 不要重新设计任何东西 —— 只调研
- 不要给修复方案 —— 那是后续阶段
- 不要泛泛比较 —— 每个 finding 必须 cite file:line
- 不要 invent 行为 —— 看不到的就说"未验证"

---

### Agent B — dnd-kit 内部行为源码验证

**目标**：用一手 `node_modules/@dnd-kit/...` 源码回答 00 中的 Q1。

**任务**：
1. 阅读 00 + 必读上下文 + `snapModifier.ts` + `SortableCategoriesList.tsx` 的 DndContext 配置（line 1058-1085）
2. 验证 `closestCenter` 算法的实际输入：
   - 读 `node_modules/@dnd-kit/core/dist/utilities/algorithms/closestCenter.ts` 或对应 d.ts
   - 用什么 rect？是 active rect 还是 collisionRect？是否受 modifiers (transform) 影响？
   - 给出 file:line 引用
3. 验证 modifier chain 与 collision detection 的执行顺序：
   - 一帧 dnd-kit 的事件循环：modifiers 何时跑？collision 何时跑？
   - snapModifier 修改 transform 后，下一次 collision detection 用的是修改后的还是原始的 rect？
   - 给出 file:line 引用
4. 验证 `useSortable` 的 cascade transition 触发条件：
   - 读 `node_modules/@dnd-kit/sortable/dist/hooks/useSortable.ts`
   - cascade 是 drag 期间 measurement 触发还是 SortableContext.items 变化触发？
   - drop 之后退出 drag 状态，store-driven items 变化是否仍触发 transition？
   - 给出 file:line 引用
5. 评估自定义 collisionDetection 的可行性：
   - 改用 `closestCorners` / `pointerWithin` / `rectIntersection` 各有什么取舍？
   - 是否能基于 pointer 而非 active rect 选 over？
   - 是否能保留 V3 不变量 #22 (closestCenter)？或必须打破？
6. 评估 modifier 的"按需禁用"可行性：
   - snapModifier 能否在 isChildActive 时返回 transform 不变？
   - 这与 V3 §2.5 / §2.9 的"hierarchy 不修改 snap"约束如何调和？
7. 评估 `event.delta` / `event.over.rect` / `active.rect.current.translated` 三者的同步性：
   - 在 onDragMove 内同帧读取，三者是否反映同一时刻？
   - snap 后 `active.rect.current.translated` 是 transform 应用后还是前？

**产出**：`r2_dndkit_source_verification.md`（≤ 1200 行；每个 finding 必须 cite 具体 file:line）

**关键节制**：
- 严格遵守 verify-third-party-behavior-firsthand：不能 cite 文档/教程，必须 cite 源码
- 不要 invent dnd-kit 的行为 —— 看不到的就说"未在源码中找到"
- 不给修复方案 —— 只验证可能性

---

### Agent C — 同类工具 hierarchy drag UX 调研 + 物理模型评估

**目标**：调研 macOS Finder / Linear / Things 3 / Notion 的 hierarchy drag UX，作为修复方案的设计参照。

**任务**：
1. 阅读 00 + 必读上下文，特别是 06_snap_research §2 物理引力公式和 NN/G 论文引证
2. 调研以下产品**在 hierarchy 拖拽场景下**的具体 UX 设计：
   - **macOS Finder list view**：拖文件夹/文件嵌套到其它文件夹（spring-loaded）
   - **Linear sidebar**：nested issues（projects / cycles / sub-issues）
   - **Things 3**：Areas → Projects 的 reorder + cross-Area move
   - **Notion sidebar**：page nesting / unnesting
   - **Apple Notes**：嵌套文件夹 reorder
3. 对每个产品，回答：
   - 是否有磁吸？hierarchy 离开 parent 的反馈是怎样的？
   - 拖 child 到 parent 行附近时，是否会"被吸住"还是"自由离开"？
   - 是否有 dwell / hover delay？多长？
   - drop 后的动效：是否有 cascade？
   - 当用户横向移动 vs 纵向移动时的视觉反馈差别？
4. 评估当前项目实现（snap + 12 px X + 80 ms dwell + immediate-promote）相对于这些产品的对齐度
5. 评估 06_snap_research §4 推荐的"方案 E + C 组合：连续引力 + 帧间 lerp"在 hierarchy 场景下的适配性：
   - 当前实现已经是 E+C，但 hierarchy 加入后是否仍然合适？
   - 如果不合适，方案 X "放弃磁吸，依赖 drop indicator" 在 hierarchy 场景下是否更合适？
6. 给出"哪些产品做得好，哪些设计值得借鉴"的 finding

**产出**：`r3_industry_ux_reference.md`（≤ 1000 行；每个产品独立小节 + 对比表）

**关键节制**：
- 不要泛泛说"X 看起来不错"——要到具体反馈层面
- 不要给修复方案 —— 但可以指出"如果这么做会更接近 X 的体验"
- 不要 invent —— 凭实际使用经验或可查证的设计参考；不能查证的 finding 标注"未验证"

---

## 2. 编排约束（编排责任在主 Agent）

- **3 个 SubAgent 完全独立**：彼此无依赖 → **同一条消息内并行发布**
- **全部 blocking 模式**（不用 background）：主 Agent 等齐 3 份报告再做综合
- **全部用 Opus 4.7**：质量优先，不降级
- **不允许 SubAgent 嵌套派 SubAgent**：调研是 leaf 任务，自己读自己写

## 3. 风险登记

- **风险 R1**：SubAgent 把 reproduction 当 verification（trace 自己想的，不去看真实代码）→ 通过 Prompt 强调"必须 cite file:line"防御
- **风险 R2**：SubAgent 越界给修复方案 → 通过 Prompt 末"关键节制"防御
- **风险 R3**：3 份报告冲突无法综合 → 主 Agent 在 synthesis 阶段处理，本轮不预防
- **风险 R4**：dnd-kit 源码版本与实际安装版本不一致 → SubAgent B 必须用 `node_modules/@dnd-kit/...` 实际路径

## 4. 主 Agent 后续动作（本计划不涉及但要预告）

调研完成后：
1. 主 Agent 亲自读 r1 / r2 / r3 → 写 `_synthesis_decisions.md`（锁定决策、按确信度标注 + 显式冲突解决）
2. 主 Agent 亲自写 `_risk_distillation.md`（每个研究侧风险一行 + 引用研究 r*.md 的具体段落）
3. 进入 Plan 模式，写 02 spec patch + 04 implementation plan
4. 一份 alignment reviewer SubAgent 检查 spec / plan / V3 不变量一致性
5. 用户确认后退出 Plan 模式，进入实施
