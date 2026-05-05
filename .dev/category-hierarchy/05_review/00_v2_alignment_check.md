# V2 对齐检查报告 (T0 — Phase 0 Blocking Gate)

> **作者**：T0 alignment SubAgent (Opus, blocking)
> **日期**：2026-05-04
> **范围**：仅评估 02 V2 / 03 V2 / 04 V2 / `_v2_patch_plan` / `_synthesis_decisions` / `design-language.md` 的跨文档**对齐**；不评估内容好坏。
> **目的**：Phase 1（实施）前的最后 gate；任一 P0 → 主 Agent 停下修文档；零 P0 → 进 Phase 1。

---

## 1. 已读基线 checklist

按任务卡顺序通读，全部 verbatim：

- [x] `00_understanding.md`（253 行）
- [x] `01_research/_synthesis_decisions.md`（190 行；14 决策 + 4 跨报告冲突 + cascade 表）
- [x] `05_review/_v2_patch_plan.md`（234 行；15 P0 + 11 P1 dedup + §3 12 项 V2 决议）
- [x] `02_design_spec.md` V2（1307 行）
- [x] `03_tech_plan.md` V2（3601 行）
- [x] `04_implementation_plan.md` V2（343 行）
- [x] `.claude/rules/design-language.md`（129 行）
- [x] `.claude/rules/plan-document-style.md`（37 行）
- [x] `.claude/rules/cross-document-cascade-discipline.md`（47 行）
- [x] `05_review/01_reviewer_a_design.md` ~ `05_review/06_reviewer_f_migration_regression.md`（按 §3 patch_plan 决议表交叉校验，仅 §3 锁定的修订点纳入对齐范围）

V3 sidebar-reorder V3 baseline（02 V3 + 03 V3）作为不变量参照系，不在本次对齐评估直接展开。

---

## 2. 14 决策三处一致性核对

> 评估每条决策在 `_synthesis_decisions §3` (Decisional 最高权威) / `02 V2` / `03 V2` / `04 V2` 是否数值/术语完全一致。

| 决策 | 锁定值 | 02 V2 | 03 V2 | 04 V2 | 一致 |
|---|---|---|---|---|---|
| **D1** category 引用 | A: Skills/MCPs 迁移 categoryId UUID + 保留 category cached name | §6.1 / §6.2 / §11 dual-read 描述与决策一致 | §2.2 dual-write/prefer-id-on-read + scan_skills 拼装 §3.6 一致 | T1a/T2a/T3e 一致 | ✅ |
| **D2** 数据模型 | A: Category + `parent_id: Option<String>` + 现有 Vec | §1 / §2.3 引用 16px indent；规格 self-consistent | §2.1 完整 Rust + serde + TS struct 一致 | T1a 字段清单一致 | ✅ |
| **D3** dnd-kit 模式 | A: 单 SortableContext + 投影深度 | §1 / §2.5 / §6.5 / §7 #8/#9 一致 | §1 / §6.1 / §8 配置一致 | T2d/T3a 一致 | ✅ |
| **D4** drop-into 阈值 | 12px X + 80ms dwell | §6.3 / §2.13 / §2.14 锁定 12px+80ms 全文一致 | §6.4 80ms `setTimeout` + ABS_X_THRESHOLD_PX = 12（`treeUtilities.ts`）一致 | T2d/T3a "dwell 状态机三态" 一致 | ✅ |
| **D5** 父类拖拽 | B-1: 父类不可成另一父类的子 | §2.13 / §6.5 / §2.22 anti-pattern + 时序图 4.3 一致 | §6.2 isParentBecomingChild → depth 强制回 0；UI invalid flag | T3a "subtree splice + isInvalid" 一致 | ✅ |
| **D6** promote 路径 | C+E: 拖左 + ContextMenu 兜底 | §2.20 / §3 ContextMenu "Promote to root" 一致 | §6.3 Left Arrow → `currentCoordinates.x - 16`；ContextMenu 一致 | T3d "Promote to Root" 一致 | ✅ |
| **D7** 父类聚合视图 | A: 含 self + descendants | §6.2 / Acceptance #22 一致 | §4.9 collectDescendantIds + dual-read 一致 | T3c filter 改造一致 | ✅ |
| **D8** 父类 count | B: self + Σ children.self（叶=self） | §6.1 / Acceptance #23 一致 | §4.8 categoriesWithCounts useMemo 一致 | T3d 描述一致 | ✅ |
| **D9** dropdown 树形 | 缩进 16 + 父类可选 + chevron 不可点 | §10 不在范围 + dropdown 视觉规则提及 | §5.9 完整 9 处 + Dropdown indent 32px = 16 base+16 indent | T3e 9 处描述一致 | ✅ |
| **D10** 缩进量 | 16px | §1 / §2.3 / §5 token --indent-step:16px 一致 | §5.1.A INDENT_STEP_PX = 16 + §7.1 token 一致 | T4 "--indent-step: 16px" 一致 | ✅ |
| **D11** 缩进介质 | padding-left only | §1 / §2.3 / §2.22 anti-pattern 一致 | §5.4 CategoryRowContent depth-agnostic 一致 | T3b "depth prop + padding-left" 一致 | ✅ |
| **D12** 折叠/展开 | 默认展开 + chevron 10×10 + localStorage 持久化 | §2.4 / §2.15 / §10 Acceptance #14 一致 | §5.2 expandedSet 默认 + EXPANDED_KEY localStorage 一致 | T3a "expandedCategories" 一致 | ✅ |
| **D13** 失败模式 | A+B: 后端硬验证 + 前端 prevent + delete cascade-promote | §2.13 / §6.5 一致 | §2.4 validate_hierarchy + §3.3.4 cascade-promote + disambiguation 一致 | T1b/T1d 一致 | ✅ |
| **D14** autoClassify | A: 暂不感知，落根 | §10 不在范围 + Acceptance #24 一致 | §9 prompt 不变 + addCategory(parentId=undefined) 一致 | T2b 描述一致 | ✅ |

**结论**：14 决策三处完全一致。无 P0/P1 漂移。

---

## 3. 12 项 V2 锁定决议（`_v2_patch_plan §3`）落地核对

| 决议 | 主修文件 | 落地 | 备注 |
|---|---|---|---|
| **§3.1** localStorage 语义反转回 expandedCategories | 02 §2.15 | ✅ | 02 line 484 `'ensemble.sidebar.expandedCategories'` + 03 line 2298 `EXPANDED_KEY` 命名一致；删除/添加语义匹配（add=展开，delete=折叠）|
| **§3.2** Chevron keyboard 三层防御 + Tab 顺序 | 02 §2.4 | ✅ | 02 line 169-186 完整 attributes 表；03 line 2877+ ChevronToggle.tsx 三层防御实现一致 |
| **§3.3** Migration flag 在 AppData | 03 §3.5 | ✅ | 03 line 988 AppData + 04 line 117 `AppData.has_completed_category_id_migration` 一致；AppSettings 无此字段 |
| **§3.4** Migration 失败不写 flag | 03 §3.4 | ✅ | 03 line 922-925 atomic write + ? propagation；04 T2a "失败时不写 flag" 一致 |
| **§3.5** Cascade-promote 同名碰撞 disambiguation | 03 §3.3.4 | ✅ | 03 line 736-757 "<原名> (<父类名>)" + 数字后缀 + 日志；04 T1d 描述一致 |
| **§3.6** 父类删除 confirmation dialog | 02 §2.21 | ✅ | 02 line 598-637 完整文案 + NSAlert / React Modal fallback；04 T1d 加任务前置 |
| **§3.7** ContextMenu 仅 "Promote to root"（不 "Move to Parent..."） | 02 §2.20 | ✅ | 02 line 580-585 only "Promote to root" + 03 §5.7 删除 Move to Parent submenu + 04 T3d 描述一致 |
| **§3.8** Drop indicator margin-only + wrapper paddingLeft | 02 §2.7 | ✅ | 02 line 297-303 wrapper pattern + indicator 自身不变 + 03 §7.4 仅追加 padding-left transition |
| **§3.9** DragOverlay padding 引证源码行号 | 02 §2.5 + §7 #21 | ✅ | 02 line 232-243 引证 `DragOverlayCategoryRow.tsx:21`；03 §12 #21 描述一致 |
| **§3.10** Dwell 完整状态机 OUT/HOVER_NEAR/DROP_INTO_READY | 02 §2.14 | ✅ | 02 line 423-462 完整状态机 + retreat 路径；03 §6.4 / §5.2 handleDragMove 实现匹配；opacity 瞬时无 fade |
| **§3.11** V3 不变量编号 22 → 23 项 | 02 §7 | ✅ | 02 §7 列 23 项；03 §12 列 23 项；编号 1-23 一致；item 8/9 拆开 modifiers / DragOverlay |
| **§3.12** Apple HIG Outline Views 引证 | 02 §3 / §10 | ✅ | 02 line 691-697 引证 + line 1230 NSOutlineView 标准；浏览模式 ←/→ 折叠/展开模态切换显式 |

**结论**：12 项 V2 决议全部落地，无遗漏。

---

## 4. 15 P0 修订验证表

| ID | 主修文件 | 实际落地 | 验证 |
|---|---|---|---|
| **P0-ARCH-1** treeKeyboardCoordinates MutableRef + preventDefault | 03 §5.1.B | ✅ | 03 line 2099-2213 完整重写；MutableRefObject<TreeSensorContext> + event.preventDefault；引证 dnd-kit 6.3.1 源码 line 670 + 官方 Tree example |
| **P0-ARCH-2** subtree splice on baseFlat | 03 §5.2 + §6.1 | ✅ | 03 line 2540-2614 完整 subtree splice 算法（baseFlatRef + withoutSubtree + insert position）；04 T3a 描述一致 |
| **P0-ARCH-3** 串行 await IPC | 03 §4.4 + §5.2 | ✅ | 03 line 2557-2615 `await onSetCategoryParent` → fresh state → `await onReorder`；setCategoryParent / reorderCategories 均返 Promise<void>；04 T3a "async + 双 IPC 顺序" 一致 |
| **P0-DATA-1** Migration flag 在 AppData | 03 §3.5 + §4.10 | ✅ | 03 line 988 AppData 字段 + line 1815 initApp 读 `data.hasCompletedCategoryIdMigration`；AppSettings 不动；04 T1a/T2a 一致 |
| **P0-DATA-2** delete cascade 同名碰撞 disambiguation | 03 §3.6 (实际 §3.3.4) | ✅ | 03 line 736-758 全实现（重命名 + 日志 + 数字后缀）+ tests `delete_category_disambiguates_*` 各 2 个 |
| **P0-DATA-3** Migration 失败不写 flag | 03 §3.4 + §4.10 | ✅ | 03 line 922-928 atomic write + `?` propagation；初始化路径 line 1830-1834 catch 仅 console.warn + 不写 flag；test `migrate_category_id_does_not_write_flag_when_write_app_data_fails` |
| **P0-DATA-4** Dropdown 改造含 CreateSceneModal | 03 §5.9 + 04 T3e | ✅ | 03 §5.9 表 row #7 (V2 NEW) `CreateSceneModal.tsx:447, 487, 865`；04 T3e "9 处包含 CreateSceneModal" 一致；test "filter by categoryId 不混淆" |
| **P0-VIZ-1** Drop indicator 几何 margin-only | 02 §2.7 / §6.3 | ✅ | 02 line 274-303 wrapper paddingLeft；indicator 自身 CSS 不动；Acceptance #11 `.drop-indicator-h 自身 CSS 不变`；03 §7.4 / §7.2 一致 |
| **P0-VIZ-2** Chevron `<button>` + listeners chain 三层防御 | 02 §2.4 / §3 | ✅ | 02 line 167-216 完整 attributes 表；03 §5.5 ChevronToggle.tsx 实现三层；04 T3b "三层防御 + listeners chain" 一致 |
| **P0-VIZ-3** localStorage `expandedCategories` 命名 | 02 §2.15 | ✅ | 02 line 484 + 03 line 2298 命名一致；onDragStart dragOverrideExpand override 语义无 OR/AND 模糊 |
| **P0-VIZ-4** Dwell 状态机三态边界 | 02 §2.14 + §6.3 | ✅ | 02 line 423-462 完整 OUT/HOVER_NEAR/DROP_INTO_READY；03 §5.2 handleDragMove + §6.4 实现一致；retreat 路径 + 边界抖动 R7 风险登记 |
| **P0-VIZ-5** DragOverlay padding 源码引证 | 02 §2.5 / §7 #21 | ✅ | 02 line 232-243 引证 `DragOverlayCategoryRow.tsx:21`；03 §12 #21 同一引证；移除 V1 的 "V3 §2.2 隐含" 二次推断 |
| **P0-HCI-1** Apple HIG Outline Views 引证 | 02 §3 / §10 | ✅ | 02 line 691-697 NSOutlineView 标准引证；浏览模式 ←/→ 折叠/展开 + drag 模式 ←/→ promote/demote 模态切换显式表 |
| **P0-HCI-2** ContextMenu 仅 Promote to root | 02 §2.20 | ✅ | 02 line 575-596 仅 "Promote to root"，**不**实现 Move to Parent submenu；03 §5.7 删除 + 04 T3d "不增加 Move to Parent submenu" |
| **P0-HCI-3** 父类删除 confirmation dialog | 02 §2.21 | ✅ | 02 line 598-637 完整文案 + 操作流；03 §3.6 cascade-promote 配套；04 T1d "confirmation dialog 任务前置" 一致 |

**结论**：15 P0 全部修订到位。无 P0 残漏。

---

## 5. 章节交叉引用合法性核对（≥ 10 关键引用）

| # | 引用源 | 引用目标 | 目标实存？ |
|---|---|---|---|
| 1 | 02 V2 cascade footprint line 32 → "03_tech_plan §5.3 SortableCategoryRow chevron 注入位置" | 03 §5.3 | ✅ 03 line 2755 |
| 2 | 02 V2 cascade footprint line 33 → "03_tech_plan §5.5 DragOverlay 注释" | 03 §5.5 | ✅ 03 line 2873 (`ChevronToggle.tsx`) — 但 02 V2 footprint 描述说 §5.5 是 "DragOverlay 注释"，实际 03 §5.5 是 ChevronToggle 实现，§2.6 / §5 `DragOverlayCategoryRow` 注释才是引用——P1 标记 |
| 3 | 02 V2 cascade footprint line 34 → "03 §5.1.A getProjection / §7.2 CSS / §5.2 onDragMove indicator state" | 03 §5.1.A / §7.2 / §5.2 | ✅ 三处全在（line 1885 / line 3267 / line 2484-2495）|
| 4 | 02 V2 cascade footprint line 35 → "03 §6.4 dwell timer + 04 T2d/T3a acceptance" | 03 §6.4 / 04 T2d/T3a | ✅ 03 line 3211 + 04 T2d (line 185) / T3a (line 193) |
| 5 | 02 V2 cascade footprint line 36 → "03 §5.2 COLLAPSED_KEY → EXPANDED_KEY + 04 T3a localStorage" | 03 §5.2 / 04 T3a | ✅ 03 line 2298 + 04 line 197 |
| 6 | 02 V2 cascade footprint line 37 → "03 §5.7 删除 Move to Parent submenu + 04 T3d" | 03 §5.7 / 04 T3d | ✅ 03 line 2989 + 04 T3d (line 217) |
| 7 | 02 V2 cascade footprint line 39 → "03 §5.6 announcements.ts HierarchyContext.expandedIds" | 03 §5.6 | ⚠️ **P1 漂移**：02 V2 cascade 说应改 `expandedIds`，但 03 §5.6 实际命名 `expandedSet`；语义统一但 ID/Set 命名口径不一致 |
| 8 | 02 V2 line 1303 cascade → "T5c acceptance ≥ 27 项 (V2 §9 #1-27)" | 04 V2 T5c | ⚠️ **P0 漂移**：04 V2 T5c (line 258) 说 "客观条件 ≥ 22"；02 V2 §9 实际 27 项客观（详 §8）|
| 9 | 03 V2 §13 line 3543 → "04 V2 T1g concurrency tests" | 04 V2 T1g | ⚠️ **P0 漂移**：04 V2 任务卡只有 T1a-T1f，**无 T1g**；§13 同样在 line 3532 声称 "25 张任务卡"，实际只有 24 张（详 §9）|
| 10 | 03 V2 §13 line 3556 → "T3e: **6+ dropdown** 树形渲染" | 04 V2 T3e | ⚠️ **P1 漂移**：03 V2 §5.9 + line 3597 takeaway #6 说 "9 处" / 04 V2 T3e 说 "9 处"；§13 中说 "6+" 是简化口径，与 9 处不一致 |
| 11 | 03 V2 §13 line 3562 → "02 V2 §9 acceptance 完整 37 项 (22 客观 + 12 + 3)" | 02 V2 §9 | ⚠️ **P0 漂移**：02 V2 §9 实际 27+12+3 = **42 项**（详 §8）|
| 12 | 04 V2 line 17 → "02 V2 **§6** 全套" + line 258 / 339 同 | 02 V2 §6 | ⚠️ **P0 漂移**：02 V2 §6 是 "关键行为决策详化"，**不是 acceptance**；acceptance 在 §9（详 §8）|
| 13 | 04 V2 共同必读 §1.13 → "sidebar-reorder 02_design_spec.md V3 §V3 不变量段" | V3 spec | ✅ V3 spec 存在；但 04 V2 写 "§V3 不变量段" 而非具体章节号 — 可接受语义引用 |
| 14 | 02 V2 line 16 → "V3 不变量 #20 重述..." | 02 V2 §7 | ⚠️ **P1 内部**：V2 修订内容把原编号 #20 重新归为 #21（拆开 modifiers），但 line 16 revision history 仍说 "#20 重述"；P1 标记（自描述漂移）|
| 15 | 02 V2 line 26 + §9 标题 → "≥ 18 项客观条件" | 02 V2 §9 实际 27 项 | ⚠️ **P0 漂移**：见 §8 细节 |

**结论**：14/15 引用 ≥ 10 个验证；其中 ≥ 5 项已被识别为 P0/P1 漂移（见 §8、§9）。

---

## 6. V3 不变量 23 项编号一致性

| # | 02 V2 §7 描述 | 03 V2 §12 描述 | 一致 |
|---|---|---|---|
| 1 | 4 px 激活 distance | 4 px activation distance | ✅ |
| 2 | 两段 lift (80ms + 120ms) | 两段 lift (80ms + 120ms) | ✅ |
| 3 | DragOverlay 多层 hsl 阴影 | DragOverlay 多层 hsl 阴影 | ✅ |
| 4 | 12 px 连续磁吸 | 12 px 连续磁吸 | ✅ |
| 5 | 220 ms cascade 无 stagger | 220 ms cascade 无 stagger | ✅ |
| 6 | distance-aware settle | distance-aware settle | ✅ |
| 7 | Cancel snap-back 280ms | Cancel snap-back 280ms | ✅ |
| 8 | DndContext modifiers = [snapModifier] | DndContext modifiers = [snapModifier] | ✅ |
| 9 | DragOverlay modifiers = [restrictToWindowEdges] | DragOverlay modifiers = [restrictToWindowEdges] | ✅ |
| 10 | 全套 CSS token | 全套 CSS token | ✅ |
| 11 | DATA_MUTEX + apply_reorder pure + ENSEMBLE_DATA_DIR | DATA_MUTEX + apply_reorder pure + ENSEMBLE_DATA_DIR | ✅ |
| 12 | categoriesVersion / tagsVersion 协议 | categoriesVersion / tagsVersion 协议 | ✅ |
| 13 | enqueueReorder 串行 IPC 队列 | enqueueReorder 串行 IPC 队列 | ✅ |
| 14 | data-no-dnd + CustomMouseSensor 双保险 | data-no-dnd + CustomMouseSensor 双保险 | ✅ |
| 15 | 编辑/新增态 SortableContext disabled | 编辑/新增态 SortableContext disabled | ✅ |
| 16 | KeyboardSensor + sortableKeyboardCoordinates + 公告 | KeyboardSensor + sortableKeyboardCoordinates + 公告 | ✅ |
| 17 | prefers-reduced-motion | prefers-reduced-motion | ✅ |
| 18 | "Show X more" onDragStart 自动展开 | "Show X more" onDragStart 自动展开 | ✅ |
| 19 | justDroppedRef / 50ms guard | justDroppedId 50ms guard | ✅ (Ref vs Id 是命名变体，语义同) |
| 20 | 拖动期间 Refresh 按钮 disabled | 拖动期间 Refresh 按钮 disabled | ✅ |
| 21 | DragOverlay 不带原位 row 的 padding (改述源码引证) | DragOverlay 显示与 inline row 同 padding (改述源码引证) | ✅ (语义同，措辞不同) |
| 22 | closestCenter collision detection | closestCenter collision detection | ✅ |
| 23 | MeasuringStrategy.Always | MeasuringStrategy.Always | ✅ |

**结论**：23 项编号 + 内容**完全一致**（02 V2 §7 与 03 V2 §12 一致；04 V2 不重列细节，仅在 T0/T6/§4 风险登记里引用 23 项编号语义）。

---

## 7. Token / Migration flag / localStorage / 命名一致性

### 7.1 Token 命名

| Token | design-language.md | 02 V2 | 03 V2 | 04 V2 / index.css 当前 | 一致 |
|---|---|---|---|---|---|
| `--indent-step` | 未列入 design-language.md（V1 task-spec-only） | §5 "新增 token --indent-step:16px" | §7.1 / §5.1.A INDENT_STEP_PX = 16 | T4 "--indent-step:16px" | ✅ |
| `--ease-drag` | 已收录 | §5 复用 | §7.2 复用 | T4 "复用 --ease-drag" | ✅ |
| `--ease-drag-cancel` | 已收录 | §5 复用 | §12 #7 cancel 复用 | — | ✅ |
| `--duration-drag-reorder` (220ms) | 已收录 | §5 / §2.6 / §2.8 复用 | §5.3 baseStyle transition | T3b "padding-left 220ms" | ✅ |
| `--duration-drag-snap` (80ms) | 已收录 | §5 复用 (Y 磁吸) | §6.4 dwell setTimeout(80) **数值同但语义独立** | — | ✅（V2 显式声明 dwell 与 magnet 独立） |
| `--duration-drag-indicator-fade` (100ms) | 已收录 | §2.7 / §5 复用 | §7 引用 | — | ✅ |
| `--duration-drag-indicator-move` (150ms) | 已收录 | §2.7 / §5 复用 | §5.2 padding-left transition (150ms) | — | ✅ |
| chevron rotation 120ms inline | design-language Constraints **§Chevron / disclosure rotation** 已 endorse "120ms inline + var(--ease-drag) 必须" | §2.4 / §5 "120ms `var(--ease-drag)`" | §7.2 / §5.5 ChevronToggle "transition: transform 120ms cubic-bezier(0.16, 1, 0.3, 1)" | T4 "120ms 复用 --ease-drag" | ✅ |
| `--color-tertiary` (#A1A1AA) chevron color | 已收录 zinc palette | §2.2 / §5 chevron color | §5.5 ChevronToggle "text-[#A1A1AA]" | — | ✅ |

### 7.2 Migration flag 位置

| 文档 | 位置声明 | 一致 |
|---|---|---|
| `_v2_patch_plan` §3.3 | AppData (NOT AppSettings) | ✅ |
| 02 V2 cascade footprint | "Migration flag 写入 AppData (不是 AppSettings)" | ✅ (在 04 cascade 同步) |
| 03 V2 §3.5 | `pub has_completed_category_id_migration: bool` 在 AppData struct | ✅ |
| 03 V2 §4.10 | 前端读 `data.hasCompletedCategoryIdMigration`（AppData）| ✅ |
| 04 V2 T1a + T2a | "AppData.has_completed_category_id_migration" + "data.hasCompletedCategoryIdMigration" | ✅ |
| 04 V2 line 15 (Revision History) | "T1e migration flag 写入 AppData (不是 AppSettings)" | ✅ |

**结论**：4 处全部一致 — 全部说 AppData，AppSettings 不动。

### 7.3 localStorage 命名

| 位置 | 命名 | 一致 |
|---|---|---|
| 02 V2 §2.15 line 484 | `'ensemble.sidebar.expandedCategories'` | ✅ |
| 02 V2 Acceptance #14 line 1186 | `'ensemble.sidebar.expandedCategories'` | ✅ |
| 03 V2 §5.2 line 2298 | `EXPANDED_KEY = 'ensemble.sidebar.expandedCategories'` | ✅ |
| 03 V2 line 2300 | `loadExpandedFromLocalStorage` | ✅ |
| 03 V2 line 2331 | `persistExpanded` | ✅ |
| 04 V2 T3a line 197 | "localStorage `expandedCategories`" | ✅ |
| 03 V2 §5.6 announcements.ts | **`expandedSet`** (而非 02 V2 footprint 说的 `expandedIds`) | ⚠️ **P2** 内部命名漂移：02 V2 cascade footprint line 39 说 announcements.ts HierarchyContext 应改 `expandedIds`；03 §5.6 实际命名 `expandedSet: Set<string>`；语义同但字面命名不一致。代码 SubAgent 实施时按 03 V2 命名 `expandedSet` 即可。 |

**结论**：localStorage key + 4 个相关 helper 命名 100% 一致；仅 announcements.ts internal type field name 与 02 V2 footprint 描述存在 P2 字面差异。

### 7.4 Cascade-promote 重命名规则

| 文档 | 规则 | 一致 |
|---|---|---|
| `_v2_patch_plan` §3.5 | "重命名为 `<原名> (<父类名>)`，必要时附数字后缀；记录 disambiguation 日志" | ✅ |
| 03 V2 §3.3.4 line 736-757 | 实现一致：`format!("{} ({})", name, parent_name)` + suffix=2,3,4 fallback + `eprintln!` 日志 | ✅ |
| 04 V2 T1d | "cascade-promote 子类到根 + 同名碰撞 disambiguation `<原名> (<父类名>)`" | ✅ |
| 02 V2 §2.21 | "Cascade-promote 同名碰撞处理：03_tech_plan §3.6 详化 ... 重命名为 `<原名> (<父类名>)` (per _v2_patch_plan §3.5)" | ✅ (引用)，注意：02 V2 行 637 写 `§3.6` 应该指 03 V2 §3.3.4——检查后 03 V2 实际 §3.3.4 是该实现位置，但 02 V2 引用 "§3.6" 是 typo 或粗粒度引用 |

**结论**：核心规则完全一致；存在一个 P2 反向引用：02 V2 line 637 `03_tech_plan §3.6` 应为 `§3.3.4`（实际在 §3.3.4，但 §3.6 是 update_skill_metadata 加锁段 — 错位反向引用）。

### 7.5 Acceptance 数量与内容一致性

| 来源 | 客观条件 | V3 零回归 | 主观兜底 | 总计 |
|---|---|---|---|---|
| **02 V2 §9 标题 (line 1164)** | "≥ 18 项客观可验证" | — | — | (声明) |
| **02 V2 line 26 (Revision History)** | "≥ 18 项客观条件" | "12 项" | "3 项" | 33 (声明)|
| **02 V2 §9 实际计数** | **27** (items 1-27 视觉+行为) | **12** (items 28-39) | **3** (items 40-42) | **42** |
| **02 V2 line 1303 (cascade footprint)** | "T5c acceptance ≥ 27 项视觉/行为客观条件 (§9 #1-27)" | (未列) | (未列) | (部分声明，与实际 27 一致) |
| **03 V2 §13 line 3562** | "37 项 (22 客观 + 12 V3 零回归 + 3 主观兜底)" | — | — | **37 (错误)** |
| **04 V2 T5c line 258** | "客观条件 ≥ 22" | "V3 行为零回归 12" | "主观感受 3" | **37 (错误)** |

**漂移**：
- 02 V2 §9 标题 + line 26 + line 1164 都说 "≥ 18 项客观条件"（应是 27）— **02 V2 自身内部 P0 漂移**
- 03 V2 line 3562 说 "37 项 (22 客观)"（应是 42 总 / 27 客观）— **P0 跨文档漂移**
- 04 V2 line 258 说 "≥ 22 客观"（应是 ≥27 / 实际 27） — **P0 跨文档漂移**

### 7.6 04 V2 引用 02 V2 的 acceptance 章节号

| 04 V2 行 | 引用 | 实际位置 | 一致 |
|---|---|---|---|
| line 17 (Revision History) | "T5c 用户验收清单引用 **02 V2 §6** 全套" | 02 V2 §6 是 "关键行为决策详化"；acceptance 在 **§9** | ⚠️ **P0** |
| line 258 (T5c) | "给用户 **02 V2 §6** 完整 acceptance 清单" | 02 V2 §9 才是 acceptance | ⚠️ **P0** |
| line 339 (退场条件) | "T5c 用户验证 **02 V2 §6** 全过" | 02 V2 §9 才是 acceptance | ⚠️ **P0** |

**结论**：04 V2 至少 3 处把 acceptance 章节号写成 §6，但实际 acceptance 在 02 V2 §9。这是 P0 跨文档引用错位。

---

## 8. 04 V2 任务卡数量一致性

| 来源 | 任务卡数声明 | 实际可数 | 一致 |
|---|---|---|---|
| 03 V2 §13 line 3532 | "25 张任务卡" | 详见下行 | ⚠️ **P0** |
| 03 V2 §13 line 3543 | 引用 "T1g：concurrency tests" | 04 V2 T1g 不存在 | ⚠️ **P0** |
| 04 V2 §3 实际任务卡数 | T0(1) + T1a-T1f(6) + T2a-T2d(4) + T3a-T3e(5) + T4(1) + T5a-T5c(3) + T6a-T6d(4) = **24** | — | — |

**漂移**：03 V2 §13 line 3532 说 "25 张任务卡"，line 3543 引用 T1g — 但 04 V2 实际 24 张（无 T1g），P1-2（_v2_patch_plan §2 / Reviewer E P1-2）补 T6a/T6b/T6c/T6d 4 张已落地，但 T1g 仍为 "应有未补"。

→ 这导致 03 V2 §13 takeaway 1 + 后续 SubAgent 在引用 "T1g：concurrency tests" 时无对应卡。**P0 跨文档漂移**：要么 04 V2 增 T1g（concurrency tests 单独成卡），要么 03 V2 §13 删除 T1g 引用、改正 25 → 24，并让 concurrency tests 归在 T1f 之内（实际 04 V2 T1f line 156-158 已含 concurrency / mutator coverage）。

---

## 9. 总评 (0-100 对齐度) + 是否进入 Phase 1

### 总评

| 维度 | 得分 | 备注 |
|---|---|---|
| 14 决策三处一致 | 100/100 | 完全一致 |
| 12 V2 决议落地 | 100/100 | 全部到位 |
| 15 P0 修订验证 | 100/100 | 全部修订到位 |
| V3 不变量 23 项编号 | 100/100 | 02 §7 vs 03 §12 完全一致 |
| Token 命名 | 95/100 | `--indent-step` / `--ease-drag` / 全套 token 一致；微小异：announcements.ts type field name `expandedSet` vs 02 V2 footprint 说的 `expandedIds` (P2) |
| Migration flag 位置 | 100/100 | AppData 全文一致 |
| localStorage 命名 | 100/100 | 4 处一致 |
| Cascade-promote 重命名 | 95/100 | 规则一致；02 line 637 反向引用 03 §3.6 应为 §3.3.4 (P2) |
| **Acceptance 数量** | **40/100** | **02 V2 §9 自身标题 / 03 V2 §13 / 04 V2 T5c 三处计数不一致 — P0** |
| **04 V2 引用 02 V2 acceptance 章节号** | **40/100** | **04 V2 至少 3 处把 §9 误写为 §6 — P0** |
| **任务卡数（25 vs 24 vs T1g 引用）** | **70/100** | **03 V2 §13 引用 T1g + 25 但 04 V2 只有 24 — P0** |
| 章节交叉引用合法性 | 90/100 | 大多数引用真实存在，有 2-3 处 typo / 反向漂移（P1/P2）|

**综合分**：~91/100

### 是否进入 Phase 1

**false** — 存在 **3 个 P0 残留矛盾**，主 Agent 必须停下修文档后才能进入 Phase 1。

---

## 10. P0 残留矛盾清单（**阻塞 Phase 1**）

> 每条标注：在哪个文件 §X 与 哪个文件 §Y 矛盾 + 主修建议。

### P0-ALIGN-1：Acceptance 项目数计数三处不一致

**位置**：
- 02 V2 §9 标题 (line 1164)：「Acceptance（**≥ 18 项**客观可验证）」
- 02 V2 line 26 (Revision History)：「保持 **≥ 18 项**客观条件 + V3 行为零回归 12 项 + 主观兜底 3 项」
- 02 V2 line 1303 (cascade footprint)：「T5c acceptance **≥ 27 项**视觉/行为客观条件（V2 §9 #1-27）」
- 03 V2 §13 line 3562：「02 V2 §9 acceptance 完整 **37 项 (22 客观 + 12 V3 零回归 + 3 主观兜底)**」
- 04 V2 line 258 (T5c)：「客观条件 **≥ 22** / V3 行为零回归 12 / 主观感受 3」
- **02 V2 §9 实际计数：客观 27（items 1-27）+ V3 零回归 12（items 28-39）+ 主观兜底 3（items 40-42）= 42 项**

**矛盾**：三个文档对 "客观条件" 的数量给出了 ≥18 / ≥22 / ≥27 三种声明；同时给出总数 33 / 37 / 42 三种；都与 02 V2 §9 实际 42 项不符。

**主修建议**：
- **主修 02 V2**（最高权威 acceptance 来源）：
  - line 1164 标题：`## 9. Acceptance（≥ 27 项客观 + 12 V3 零回归 + 3 主观，共 42 项）`
  - line 26 Revision History：改 "≥ 18 项客观条件 + 12 + 3" → "27 项客观 + 12 V3 零回归 + 3 主观，共 42 项"
- **副修 03 V2**：line 3562 takeaway 把 "37 项 (22 客观)" → "42 项 (27 客观 + 12 + 3)"
- **副修 04 V2**：line 258 把 "客观条件 ≥ 22" → "客观条件 ≥ 27"，line 17 (Revision History) 把 "02 V2 §6" → "02 V2 §9"

### P0-ALIGN-2：04 V2 三处引用 02 V2 §6 应为 §9

**位置**：
- 04 V2 line 17 (Revision History)：「T5c 用户验收清单引用 **02 V2 §6** 全套（含 V3 行为零回归 12 + 主观 3 — Reviewer E P1-9）」
- 04 V2 line 258 (T5c 任务卡)：「主 Agent 启 npm run tauri dev，给用户 **02 V2 §6** 完整 acceptance 清单」
- 04 V2 line 339 (退场条件)：「T5c 用户验证 **02 V2 §6** 全过」

**矛盾**：02 V2 §6 是 "关键行为决策详化"（包括 §6.1 父类 count / §6.2 父类聚合视图 / §6.3 dwell 12px+80ms / §6.4 chevron hit-target / §6.5 max depth=2），不是 acceptance；acceptance 在 02 V2 §9。

**主修建议**：
- **主修 04 V2**：3 处 `02 V2 §6` → `02 V2 §9`

### P0-ALIGN-3：03 V2 §13 提到 T1g + 25 张任务卡，04 V2 实际 24 张（无 T1g）

**位置**：
- 03 V2 §13 line 3532：「04 V2 实际任务命名采用 T0 / T1a-**T1g** / T2a-T2d / T3a-T3e / T4 / T5a-T5c / T6a-T6d（**25 张任务卡**）」
- 03 V2 §13 line 3543：「**T1g**：concurrency tests — `concurrent_set_parent_and_add_no_lost_update` + V2 NEW `concurrent_update_metadata_and_reorder_no_lost_update`」
- 04 V2 §3 实际任务卡：T0 + T1a/T1b/T1c/T1d/T1e/**T1f** + T2a-T2d + T3a-T3e + T4 + T5a-T5c + T6a-T6d = 24 张（无 T1g）
- 04 V2 T1f line 154-159 实际囊括了 03 V2 §13 中归在 T1g 的 concurrency tests + DATA_MUTEX 全 callsite 核查

**矛盾**：03 V2 §13 期望 25 张并引用 T1g；04 V2 实际 24 张并把 concurrency tests 合在 T1f 内。SubAgent 按 03 V2 §13 寻找 T1g 时会找不到对应任务卡，影响 Wave 2 实施信号传递。

**主修建议**（二选一）：
- **方案 A（推荐，副修 04 V2 一处）**：04 V2 拆 T1f 为 T1f（DATA_MUTEX 漏锁 + Option<Option<T>>）+ T1g（concurrency tests），共 25 张任务卡，与 03 V2 §13 一致
- **方案 B（副修 03 V2 三处）**：把 03 V2 §13 line 3532 「25 张」→「24 张」，line 3543 删除 T1g 单独行 / 把内容合并到 T1f 描述里，line 3532 任务命名表 `T1a-T1g` → `T1a-T1f`

主 Agent 按 04 V2 已遵循 plan-document-style "≤ 800 行" 与 "单卡 ≤ 30 行" 原则，**推荐方案 B**（修 03 V2 / 不动 04 V2 — 让 plan 简洁）。

---

## 11. P1 / P2 漂移清单（不阻塞 Phase 1，标记 backlog）

### P1（建议在 Phase 1 实施前的快速窗口修订）

- **P1-1**：02 V2 cascade footprint (line 39) 说 03 V2 §5.6 announcements.ts HierarchyContext 字段命名 `expandedIds`，但 03 V2 §5.6 实际命名 `expandedSet`。语义一致，命名漂移。修订建议：02 V2 line 39 `expandedIds` → `expandedSet`，与 03 V2 §5.6 一致。
- **P1-2**：03 V2 §13 line 3556 takeaway `T3e: **6+ dropdown** 树形渲染`，与 03 V2 §5.9 + line 3597 takeaway #6 + 04 V2 T3e（皆说 "9 处"）数量口径不一致。修订建议：03 V2 line 3556 改 "6+" → "9 处"。
- **P1-3**：02 V2 §2.5 line 16 (Revision History) 说 "V3 不变量 #20 重述..."，但实际 V2 把该项重新归为 #21（拆开 modifiers 后顺移）。修订建议：line 16 `#20` → `#21`，避免下游阅读把 §7 #20（Refresh disabled）误以为是 DragOverlay padding。

### P2（不影响 Phase 1，归 backlog）

- **P2-1**：02 V2 §2.21 line 637 说 "03_tech_plan §3.6 详化 delete_category 实现"，实际 03 V2 §3.6 是 `update_skill_metadata` / `update_mcp_metadata` 加锁段；delete_category 在 03 V2 **§3.3.4**。建议：02 V2 line 637 `§3.6` → `§3.3.4`。
- **P2-2**：02 V2 cascade footprint line 33 说 "03_tech_plan §5.5 DragOverlay 注释"，实际 03 V2 §5.5 是 ChevronToggle.tsx 实现段；DragOverlay 注释相关在 03 V2 §5.4 + §2.6 注释 — 但语义上 §5.5 也间接影响 chevron→DragOverlay 协作，可接受。建议：line 33 `§5.5` → `§2.6 / §5.4`。
- **P2-3**：02 V2 标题 (`Acceptance（≥ 18 项客观可验证）`) 是 V1 残留措辞；P0-ALIGN-1 修订时需一并修正。
- **P2-4**：04 V2 line 165 T2a 描述 "**moveCategoryToParent** action"，但 03 V2 §4.3 命名为 **setCategoryParent** action。建议：04 V2 T2a `moveCategoryToParent` → `setCategoryParent`。

---

## 12. 评估方法 + 局限

- **评估对象**：仅评估 Decisional 文档（02 V2 / 03 V2 / 04 V2）+ Decisional 引用 (`_synthesis_decisions` / `_v2_patch_plan` / `design-language.md`) 之间的对齐；Referential（reviewer 报告 / R*.md）只在与决议对照时复核。
- **方法**：每个 P0 / P1 修订点对应到 02 V2 / 03 V2 / 04 V2 的具体 §X line 进行核对；交叉引用用 grep 验证目标存在。
- **局限**：
  - 不评估内容好坏（is by design — alignment-only）
  - 不在范围：reviewer 报告 vs 02 / 03 / 04 V2 自身的对齐（已在 _v2_patch_plan §3 锁定）
  - V3 baseline 不变量本身（V3 spec / V3 tech plan）作为参照系，不展开核对
- **未触及**：6 reviewer 报告的内容（A/B/C/D/E/F），按 _v2_patch_plan §3 决议假设已被吸收为 12 V2 决议；未独立验证个别 reviewer 的 P0/P1 是否完整体现于 V2 文档。仅核对 _v2_patch_plan §3 决议在 V2 中是否落地（结果：12/12 全部落地）。

---

## 13. 给主 Agent 的执行建议

按 cross-document-cascade-discipline 规则：
1. 主 Agent 收到本报告后，先修订 P0-ALIGN-1 / P0-ALIGN-2 / P0-ALIGN-3 三个 P0 残留矛盾。
2. P1-1 / P1-2 / P1-3 建议同步修订，单点改动成本极低（< 30 LoC）。
3. P2-* 可作为 backlog 推迟。
4. P0 修复后**重跑本 alignment SubAgent**（按 cross-document-cascade-discipline.md "Loop"），确认零 P0 后才进入 Phase 1。

---

## 14. Confidence + 是否进入 Phase 1

**Confidence**：92 / 100

**Confidence 折扣来源**：
- 5 点：02 V2 §9 项 1-42 实际逐项验证；但 04 V2 T5c 任务卡内是否 SubAgent 在实施期会真按 "客观 27 项" 验证（vs 按 line 258 "≥22"），存在执行漂移风险；建议 P0 修订后通过实际运行 T5c 验证
- 2 点：announcements.ts HierarchyContext type field 命名 `expandedSet` vs `expandedIds` 是 P1，命名偏差极小；但若 SubAgent 写 04 实施代码时凭 02 V2 footprint 字面取 `expandedIds`，会与 03 V2 §5.6 spec 不一致 — 实施期会被代码审计发现
- 1 点：03 V2 §13 任务卡数 25 vs 04 V2 实际 24 张是 P0；选方案 B 修订只需 03 V2 三处微调，但若 SubAgent 凭 03 V2 §13 "T1g" 寻找任务卡会卡住

**核心架构层面对齐良好**：14 决策 / 12 V2 决议 / 15 P0 修订 / V3 不变量 23 项 / token / Migration flag / localStorage / Cascade-promote / Chevron 三层防御 / DwellSM / SubtreeSplice / 双 IPC await — 全部对齐通过。

---

**进入 Phase 1（实施）？**

**❌ false**

**理由**：3 个 P0 alignment 残留矛盾（acceptance 计数 / acceptance 章节号 / 任务卡数与 T1g 引用）会导致 Phase 1 SubAgent 接收到错位/缺失信号，引起实施层 P0 偏差。修订成本极低（< 1 小时），收益是确保 Phase 1 SubAgent 收到正确的 acceptance 准星 + 任务卡覆盖。

修订 P0 + 重跑本 alignment 后零 P0 → 进入 Phase 1。

---

**End of 00_v2_alignment_check.md**
