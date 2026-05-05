# Reviewer E — 跨文档对齐评审报告（V1 首版）

> **Reviewer 身份**：跨文档对齐评审 SubAgent（执行 `.claude/rules/cross-document-cascade-discipline.md`）。
> **评审范围**：V1 各 Decisional 文档之间的**对齐度**（不评估内容质量；那是其他 Reviewer 的工作）。
> **评审产物**：本文档；P0 = 三处不一致 stop-ship；P1 = 轻微术语漂移；P2 = 风格/标号偏移。

---

## 0. 已读基线 checklist

- [x] `00_understanding.md`（任务边界 + 14 决策清单 + 关键事实段 §4）
- [x] `01_research/_synthesis_decisions.md` V1（**14 决策定锤** + cascade footprint table §4 + R1-R7 已读 checklist）
- [x] `02_design_spec.md` V1（全文 — Revision History / Authority Ranking / §1 设计哲学 / §2 视觉规格 21 小节 / §3 键盘 / §4 时序 / §5 token / §6 决策详化 / §7 V3 不变量 22 项 / §8 dev 验证 / §9 Acceptance ≥ 18 项实计 22 + V3 12 + 主观 3 / §10 不在范围 / §11 风险）
- [x] `03_tech_plan.md` V1（全文 — Revision History / §1-§3 数据模型与后端 / §4 前端 store / §5 组件层 / §6 dnd-kit 树形 / §7 CSS / §8 DndContext / §9 autoClassify / §10 测试 / §11 性能 / §12 V3 不变量 23 项 / §13 04 衔接建议）
- [x] `04_implementation_plan.md` V1（全文 — Revision History / Authority Ranking / §1 依赖图 25 任务 / §2 全部任务卡 T0/T1a-g/T2a-d/T3a-e/T4/T5a-c/T6a-d / §3 风险登记预期段 / §4 acceptance 引用 / §5 SubAgent 投递策略段）
- [x] `.claude/rules/design-language.md`（V3 token / 哲学五条 / 原则段 / Constraints 全 token 表 / Anti-pattern 段 / Conflict resolution）
- [x] `01_research/_dispatch_plan.md`（wave 1 R1-R7 任务分配 + 共同必读 10 项）
- [x] `.claude/rules/cross-document-cascade-discipline.md`（**核心规则**：cascade footprint 必须显式 + 对齐 SubAgent 在 V_n→V_{n+1} 之前必跑）
- [x] `~/.claude/rules/document-authority-ranking.md`（同级冲突向用户 / 跨级以高层为准 / 自引用）

---

## 1. 评审角度（cross-document-cascade-discipline 第 8 维度）

| 维度 | 检查内容 |
|---|---|
| §2 | 14 决策 × 02/03/04 三处落地点 × 数值/术语一致性 |
| §3 | 章节交叉引用合法性（"见 §X" 指向是否真实存在） |
| §4 | Token 命名与 design-language.md 的一致性 |
| §5 | V3 不变量核对清单数量一致性（02 §7 vs 03 §12 vs 04 任务卡） |
| §6 | Acceptance 数量与内容一致性（02 §9 vs 04 T5c） |
| §7 | 术语漂移（"drop into" / "promote" / "demote" / category 措辞） |
| §8 | 依赖图与文档间实际引用结构 |
| §9 | Authority Ranking 三处文档头部一致性 |
| §10 | Cascade footprint V1 首版下声明完整度 |

---

## 2. 14 决策落地一致性表（核心评审）

> 每条决策的"原始定锤值"以 `_synthesis_decisions.md` §3 为准（Decisional 最高权威）。02 / 03 / 04 三处落地点的"数值/术语一致性"逐项核查。

| ID | 决策定锤值（_synthesis） | 02_design_spec V1 落地 | 03_tech_plan V1 落地 | 04_impl_plan V1 落地 | 一致性 |
|---|---|---|---|---|---|
| **D1** | A: Skills/MCPs 迁移到 categoryId UUID + 保留 category(name) cached display + backward compat | §6.2 dropdown 用 categoryId / §10 dropdown 视觉规则；§9 Acc#22 dual-write fixture | §2.2 双字段迁移完整代码；§3.4 migrate IPC；§4.5 autoClassify dual-write；§4.6 updateSkillCategory dual-write；§5.9 dropdown value=categoryId | T1a 字段加法；T1e 一次性迁移；T2b dual-write；T3e 5 dropdown value=id + name 反查 | ✅ 一致 |
| **D2** | A: Category 加 `parent_id: Option<String>` + 现有 Vec<Category> 不变 | §1 哲学引用 parent_id；§2.5 容器 `data-children-of={parentId}`；§2.20 max depth=2 提及 D2 锁定 | §2.1 完整字段定义 + serde 模式；§2.3 4 处 clamp 同步表 | T1a `parent_id` Rust + `parentId?` TS 同步加法 | ✅ 一致（Rust 用 snake_case `parent_id`，TS 用 camelCase `parentId`，`#[serde(rename_all = "camelCase")]` 自动转换 — 两侧均正确，无矛盾） |
| **D3** | A: 单 SortableContext + 投影深度（dnd-kit 官方 Sortable Tree pattern） | §2.6 DragOverlay clone 单一行；§2.7 indicator 缩进表达；§2.10 modifier 不变 | §6.1 单 SortableContext + 投影深度详细论证；§5.1.A treeUtilities + getProjection；§8 DndContext 配置 | T2d treeUtilities + treeKeyboardCoordinates；T3a SortableCategoriesList flatten + projection | ✅ 一致 |
| **D4** | drop-into: 12 px X 阈值 + 80 ms dwell + drop indicator 缩进表达 + DragOverlay 严格跟手不引入水平磁吸 | §2.7 indicator 阈值表 12 + dwell 80；§4.1 时序 t=400+80；§6.3 详化；§9 Acc#8 acceptance；§11 R1 风险登记 | §6.3 promote 路径用 -12px；§6.4 dwell timer setTimeout(80) 实现；§5.2 handleDragMove 80 ms 与 dwellTimerRef | T2d getProjection 使用 INDENT_STEP_PX；T3a 80 ms dwell setTimeout；T5a `SortableCategoriesList.dwell` 测试 | ✅ 一致（全部三处都是 12 + 80） |
| **D5** | B-1: 父类只能 reorder 父类层、不可成另一父类的子（避免撕散子树+绕过 max depth=2） | §2.6 DragOverlay 单 row clone；§2.14 表行"父→另父 drop into 区 = 非法"；§2.20 ContextMenu 父类无 hierarchy 操作；§2.21 Anti-pattern 列入；§4.3 时序示意；§9 Acc#19 acceptance | §6.2 完整说明；§5.1.A getProjection `isParentBecomingChild` 检测；§5.1.B treeKeyboardCoordinates Right 阻止 | T2d treeUtilities 测试覆盖 D5 父→子 isInvalid；T3b SortableCategoryRow `isInvalidDrop` prop；T3a handleDragEnd projected.isInvalid → skip IPC | ✅ 一致 |
| **D6** | C+E: 水平向左拖（dnd-kit 投影深度负方向）+ ContextMenu "Promote to Root" 兜底 | §2.7 promote indicator 顶到根级；§2.20 ContextMenu "Promote to Root"（仅 child 可见）；§3 键盘 ←/→；§4.2 时序 promote | §6.3 子→根 promote 详化；§5.1.B treeKeyboardCoordinates Left → x -= indent；§5.7 MainLayout 兜底 | T3a handleDragEnd setCategoryParent(null)；T3d MainLayout ContextMenu 加"Promote to Root"项；T3b 仅 child 可见 | ✅ 一致 |
| **D7** | A: CategoryPage 显示父类自身 + 所有子级内容 | §6.2 完整规则；§9 Acc#20 fixture 验证 10 项；§10 不在范围段排除子类 group header | §4.9 CategoryPage filter 完整代码；§4.7 collectDescendantIds helper | T2c categoryTree.ts；T3c CategoryPage 改造（visibleIds + dual-read）；T5a CategoryPage.aggregation 测试 | ✅ 一致 |
| **D8** | B: 父类 count = 自身+所有子级总和；子类（叶）= 仅自身 | §6.1 完整规则；§9 Acc#21 fixture 验证 sidebar 显示 10 | §4.8 categoriesWithCounts 完整代码；§4.7 collectDescendantIds | T3d MainLayout categoriesWithCounts 聚合；T5a MainLayout.aggregateCounts 测试 | ✅ 一致 |
| **D9** | dropdown: 缩进 16px + 父类可选 + chevron 不可点（dropdown 内不折叠） | §10 不在范围段对 D9 措辞声明；hint 给 03 详化 | §5.9 5 个 dropdown 改造 + Dropdown 组件 depth-aware indent | T3e 5 个 dropdown 改造 + Dropdown.tsx Option.depth + paddingLeft = 16+depth*16 | ⚠️ **轻微 P1**：02 §9 Acceptance 列表（≥ 22 项）中**未覆盖 dropdown 视觉验证**（仅说"缩进 16 px + 父类可选"在 §10）— 04 T5c 用户验证清单同样未列。本身不是矛盾，但 D9 落地缺乏可对照的 acceptance 条目。详 §6 |
| **D10** | 视觉缩进量 16 px / level | §1 哲学引用；§2.3 子类行 padding-left = 26 px = 10 + 16；§5 token `--indent-step: 16px`；§9 Acc#1 验证 padding-left 26 px | §2.1 注释引用 02 §5；§5.1.A `INDENT_STEP_PX = 16`；§7.1 token `--indent-step: 16px` | T2d treeUtilities INDENT_STEP_PX = 16；T3b SortableCategoryRow paddingLeft = depth * INDENT_STEP_PX + 10；T4 `--indent-step: 16px` token | ✅ 一致 |
| **D11** | 仅 padding-left（无 indent guide / 无 dot 颜色淡化） | §1 哲学；§2.3 表格 dot 8×8 + 字色相同；§2.21 Anti-pattern 列入子类淡化 | §5.4 CategoryRowContent 注释更新（depth-agnostic） | T3b CategoryRowContent 仅注释更新；其他不变 | ✅ 一致 |
| **D12** | 默认展开 + chevron + 持久化 localStorage `ensemble.sidebar.collapsedCategories` | §2.4 chevron 行为表；§2.15 折叠/展开规则 + localStorage key；§9 Acc#13 验证 key | §5.2 SortableCategoriesList COLLAPSED_KEY 完整 / loadCollapsedFromLocalStorage / persistCollapsed | T3a localStorage 持久化（COLLAPSED_KEY）；T5c Acc#13 引用 | ✅ 一致 |
| **D13** | A+B: 后端硬验证（cycle/depth/orphan/demote-with-children）+ 前端 prevent + delete cascade-promote | §2.14 Drop Validity 表；§6.5 max depth=2 验证 | §2.4 完整 validate_hierarchy 函数 + HierarchyError 5 个 variant；§3.3.4 delete cascade-promote 完整代码 | T1b validate_hierarchy + 6 测试；T1d delete cascade-promote + 1 测试；T1c set_category_parent + 8 测试 | ✅ 一致 |
| **D14** | A: 暂不感知，新分类一律落根（prompt 不变） | §10 不在范围段排除"autoClassify 智能建议父类（v2）"；§9 Acc#22 验证 落根 | §9 autoClassify 改造（最小化 D14=A）；§4.5 显式 parentId=undefined | T2b 3 store dual-write + `undefined` 第三参数；prompt 不变 | ✅ 一致 |

**总结**：14 决策中 **13 项完美一致**，**1 项 P1 轻微 acceptance 覆盖缺口**（D9 dropdown 视觉验证未列入 02 §9 Acceptance / 04 T5c 用户清单）。

---

## 3. 章节交叉引用核对（"见 §X" 指向真实存在性）

> 评审方法：扫描 02 / 03 / 04 中所有"参/见 §X" / "per §X" / "（详见 §X）"模式，验证目标章节是否真实存在。

### 3.1 02_design_spec V1 内部引用

| 引用源 | 引用目标 | 实际存在 | 一致性 |
|---|---|---|---|
| §1 设计哲学 → "详见 §2.20 Anti-pattern 清单" | 02 §2.21 Anti-pattern 清单 | 实际章节号 = §2.21（21 节），但引用写"§2.20"。 | ⚠️ **P1**：§2.20 是 "WCAG 2.5.7 Dragging Movements Alternative" + ContextMenu 兜底，§2.21 才是 Anti-pattern。引用源指向错位一节。详 §11 |
| §2.7 → "参 R3 §6.3" | r3_visual_interaction_design.md §6.3 | 假设存在（未读 R3 全文，但 _synthesis_decisions §1 引用 R3 §6 candidate evaluation） | 推测 ✅（基线引用；未做穿透核查） |
| §2.10 → "snapModifier.ts" 路径 + V3 §2.5 | `src/components/sidebar/dnd/snapModifier.ts` + V3 spec §2.5 | 路径 + V3 章节号正确（00_understanding §4.5 列出文件） | ✅ |
| §2.14 → "前端 prevent 在 onDragOver / onDragMove 实时判定（per D13 = A+B）" | _synthesis §3 D13 | _synthesis §3 D13 = "A + B：后端硬验证 + 前端 prevent" 一致 | ✅ |
| §3 announcements 表 → "扩展 announcements.ts 工厂内增加 hierarchy: { parentMap, expandedSet }" | 03 §5.6 announcements.ts 完整伪代码 | 03 §5.6 实际是 `hierarchy?: HierarchyContext = { parentMap: Map<string, string>; collapsedIds: Set<string> }` | ⚠️ **P1**：02 §3 写"expandedSet"，03 §5.6 写"collapsedIds"。两者语义反向（一个是已展开的 set，一个是已折叠的 set），但都能描述同一状态。03 与 §2.15 持久化 key 用 `collapsedCategories`（折叠的 ids）一致；02 §3 用"expandedSet"是与 §2.15 实际持久化反向命名。详 §11 |
| §6.1 → "实现位置 MainLayout.tsx:96-104 的 categoriesWithCounts useMemo" | 文件 + 行号在 00_understanding §4.6 中也提到 | ✅ | ✅ |
| §6.3 → "snap modifier 仅磁吸 lerp" + "_synthesis_decisions §3 D4" | 决策文件 + D4 条目 | _synthesis §3 D4 = "12px X 阈值 + 80ms dwell + drop indicator 缩进表达..." 一致 | ✅ |
| §7 V3 不变量 → "来自 R2 §10" | r2_dnd_tree_architecture.md §10 | 03 §12 也写"来自 R2 §10 + R2 §8 + V3 spec 全文交叉" — 目标存在 | ✅ |
| §11 R1 → "如显著则 03_tech_plan 评估降至 50 ms 或取消" | 03 是否有此段？ | 03 全文未见"50 ms"作为 dwell 备选；仅 §6.4 dwell timer 描述与 02 §11 R1 一致 | ⚠️ **P2**：02 §11 提及"如显著则 03_tech_plan 评估"，但 03 实际未为这种降级路径预留任何 hook（§6.4 写 setTimeout(80) 硬编码，无 abstraction layer）。这不算 P0/P1 矛盾（仅是风险缓解承诺方未严格落地），但读者会循着 02 §11 去 03 找具体方案找不到。详 §11 |

### 3.2 03_tech_plan V1 内部引用

| 引用源 | 引用目标 | 实际存在 | 一致性 |
|---|---|---|---|
| §1 → "参 R2 §3.2 阶段 1 硬约束 HC-1 ~ HC-15" | R2 §3.2 + HC 列表 | _synthesis §0 已 read R2，HC 应存在但未独立验证 | 推测 ✅ |
| §2.1 → "ClaudeMdFile.category_id: Option<String> 已经在用" + "types.rs:653" | 真实代码行 | 00_understanding §4.2 也指向 types.rs:653 一致 | ✅ |
| §2.3 表 5 处 clamp → 与 §3.3.1 / §3.3.3 / §5.1.A / §5.1.B / §9 章节号 | 表中"§3.3.1 / §5.1 / §5.2 / §9" | §3.3.1 add_category 存在；§5.1.A getProjection 存在；§5.1.B treeKeyboardCoordinates 存在；§9 autoClassify 存在 | ✅ |
| §3.1 grep 表 → "03 §3.3.1 / §3.3.3 / §3.4" | 全部存在 | ✅ | ✅ |
| §3.3.1 add_category → "per §9 = D14 = A 落根" | 03 §9 autoClassify | 03 §9 实际是 "autoClassify 改造（最小化 — D14=A）"一致 | ✅ |
| §3.3.4 delete_category → "matches the D7 / D14 separation" | _synthesis D7 + D14 | _synthesis §3 D7 + D14 存在 | ✅ |
| §4.1 → "appStore.ts:67, 161-170, 174-205, 247-249, 277, 297-298" | 现有代码行号 | 假设代码行号正确（V3 已落地）；本评审不穿透核查 | 推测 ✅ |
| §4.5 dual-write → "skillsStore.ts:391-401" + "claudeMdStore.ts:496-508 已经是 id 模式" | 现有代码行号 | 00_understanding §4.3 指向 skillsStore.ts:323-410 (autoClassify 整段) — 接近但不重合 | 推测 ✅ |
| §4.7 collectDescendantIds → "max depth = 2 hard cap (D2)" | _synthesis §3 D2 | D2 存在；说法一致 | ✅ |
| §4.10 → "迁移失败 graceful degrade" 段 → "fallback 到 dual-read 的 name 比对路径" | §4.8 / §4.9 dual-read | 一致 | ✅ |
| §5.1.A getProjection → "Mirrors dnd-kit Sortable Tree example pattern (R2 §2.5)" | R2 §2.5 | _synthesis §1 已 read R2 | 推测 ✅ |
| §5.1.B → "参 R2 §2.8 一手源码" + "node_modules/@dnd-kit/core/dist/sensors/keyboard/types.d.ts" | 第三方源码路径 | 04 T2d 必读上下文中也明确要求读这两个路径 | ✅ |
| §5.2 → "参 R2 §6.2 完整模板" | R2 §6.2 | _synthesis §1 已 read | 推测 ✅ |
| §6.5 → "参 R2 §6.3 + 02 §2.10" | 02 §2.10 | 02 §2.10 实际是 "Snap 磁吸（继承 V3 不变）"一致 | ✅ |
| §7.3 折叠/展开候选 A → "useLayoutEffect 测量 + 写入 inline `height: Npx`" | 与 02 §2.15 末尾"实施 hint" | 02 §2.15 写 "useLayoutEffect 测量 children 容器实际高度，写入 inline `height: Npx`，触发 transition" — 一致 | ✅ |
| §7.3 末尾 → **"最终决策**：折叠/展开**完全靠 dnd-kit cascade 让位**" | 02 §2.15 折叠/展开过渡 timing 段 | 02 §2.15 描述"折叠/展开过渡（chevron 旋转 + children 容器高度 + opacity）220 ms"，与 03 §7.3 最终决策"完全靠 dnd-kit cascade 让位（无需 height transition）"**视觉行为一致**（都是 220 ms cascade），但**实现路径表述不同**：02 描述高度 + opacity 过渡，03 表述 cascade transform 让位 = 不引入额外动画通道。详 §11 | ⚠️ **P1**（实现路径表述漂移） |

### 3.3 04_implementation_plan V1 内部引用

| 引用源 | 引用目标 | 实际存在 | 一致性 |
|---|---|---|---|
| T1a 必读 1 → "03 V1 §2.1（Category.parent_id）" | 03 §2.1 | 03 §2.1 = "D2=A：Category 加 parent_id 字段" — 一致 | ✅ |
| T1a 必读 1 → "03 V1 §2.2（Skill/McpServer dual-field 迁移）" | 03 §2.2 | 03 §2.2 = "D1=A：Skills/MCPs 双字段迁移" — 一致 | ✅ |
| T1a 必读 1 → "03 V1 §3.7 末尾的 backward compat 测试 ≥ 4 个 case" | 03 §3.7 | 03 §3.7 = "单元测试 + 集成测试 + 并发测试" 列出 4 个 backward compat tests — 一致 | ✅ |
| T1c 必读 1 → "03 V1 §3.3.1（add_category 完整代码 — 新增 parentId 参数 + DATA_MUTEX + validate_hierarchy 调用）" | 03 §3.3.1 | 03 §3.3.1 add_category 完整代码包含 parentId + DATA_MUTEX；但**未调用 `validate_hierarchy`**（仅做 `if parent.parent_id.is_some() return DepthExceeded`），是手写复用部分逻辑，不调用 pure validator | ⚠️ **P1**：04 T1c 必读说"调用 validate_hierarchy"，03 §3.3.1 实际只手写校验 parent.parent_id.is_some() + orphan 查找。**注释表述漂移**：03 注释自称"Reuse the same checker minus self-as-parent / cycle / demote-with-children"，与 T1c 必读描述差异微小但存在。详 §11 |
| T1d 必读 → "03 V1 §3.3.4（delete_category cascade-promote 完整代码）" | 03 §3.3.4 | 03 §3.3.4 完整代码存在 | ✅ |
| T1e 必读 → "03 V1 §3.4（migrate_category_id_for_skills_mcps 完整代码）+ §3.5（AppSettings flag）" | 03 §3.4 + §3.5 | 两节存在 | ✅ |
| T1f 必读 → "03 V1 §3.6（scan_skills 拼装 + update_skill_metadata 简化签名）" | 03 §3.6 | 03 §3.6 存在；最终签名简化为 `category_id: Option<String>`（T1f 实现要求一致） | ✅ |
| T2a 必读 → "03 V1 §4 全文 + sidebar-reorder 03 §4 V3" | 03 §4 + V3 03 §4 | 两节存在 | ✅ |
| T2b 必读 7 → "_synthesis §3 D14（落根决策）" | _synthesis §3 D14 | 一致 | ✅ |
| T2c 必读 → "03 V1 §4.7（categoryTree.ts 完整代码）" | 03 §4.7 | 03 §4.7 = "collectDescendantIds helper" 完整代码存在 | ✅ |
| T2d 必读 → "03 V1 §5.1.A（treeUtilities.ts 完整代码 — flattenTree / removeChildrenOf / getProjection / getChildCount + MAX_DEPTH=1 + INDENT_STEP_PX=16）" | 03 §5.1.A | 03 §5.1.A 完整代码 + 4 个 utility export + 2 个常量 — 一致 | ✅ |
| T2d 必读 → "03 V1 §5.1.B（treeKeyboardCoordinates.ts 完整代码 — Left/Right promote/demote）" | 03 §5.1.B | 一致 | ✅ |
| T3a 必读 9 → "02 V1 §3 全文（键盘可达 + announcements 扩展措辞）" | 02 §3 | 一致 | ✅ |
| T3a 必读 → "03 V1 §12 全文（V3 不变量保留核对清单 23 项 — 必背）" | 03 §12 | 03 §12 实际有 23 项 ✓ | ✅ |
| T3a 必读 → "03 V1 §6 全文（dnd-kit 树形架构详细实现）" | 03 §6 | 一致 | ✅ |
| T3b 必读 8 → "`.claude/rules/design-language.md`（Required reading）" | 该 Rule 存在 | ✅ | ✅ |
| T3c 必读 → "03 V1 §4.9（CategoryPage filter 完整代码）" | 03 §4.9 | 一致 | ✅ |
| T3d 必读 7 → "03 V1 §4.8（categoriesWithCounts 完整代码）" | 03 §4.8 | 一致 | ✅ |
| T3e 必读 → "02 §10 末尾（D9 dropdown 树形渲染规则）" | 02 §10 不在范围段对 D9 措辞 | 一致 | ✅ |
| T4 必读 → "02 V1 §5（CSS Token — 仅引入 1 个新 token --indent-step: 16px）" | 02 §5 | 一致 | ✅ |
| T5a 测试场景 → "02 §9 / §8.1 acceptance 客观条件 — 测试以此为靶" | 02 §9 + §8.1 | 一致 | ✅ |
| T5c 完整 acceptance 清单 22 项 → "from 02 §9" | 02 §9 第 1-22 项 | 02 §9 客观条件第 1-22 项一一对应 ✓ | ✅ |

### 3.4 跨 02-03 引用核对

| 02 引用 03 | 03 引用 02 |
|---|---|
| 02 §2.7 末尾"具体由 03_tech_plan 详化（D13 = A + B...）" → 03 §2.4 ✓ | 03 §6.2 → "02 §2.6 + §2.14" → 02 §2.6 + §2.14 ✓ |
| 02 §2.15 末尾"具体实现细节由 03_tech_plan 详化" → 03 §7.3 ✓ | 03 §6.3 → "02 §3" 键盘表 ✓ |
| 02 §2.18 末尾"具体 selectors 由 03_tech_plan 详化" → 03 §7.4 ✓ | 03 §6.5 → "02 §2.10" V3 snap modifier 不修改 ✓ |
| 02 §3 末尾"扩展 announcements.ts 工厂内增加 hierarchy: { parentMap, expandedSet }" → 03 §5.6 写 "HierarchyContext = { parentMap: Map<...>; collapsedIds: Set<...> }" | ⚠️ **P1**：expandedSet vs collapsedIds 反向命名（详 §3.1 表 + §11） |
| 02 §5 末尾"建议 03_tech_plan 评估是否提取为 `--duration-disclosure-rotate: 120ms` token" → 03 §7 (CSS 增量) | 03 §7 未单独提取该 token；T4 任务卡也写"本 V1 默认不提取——直接 inline 120ms（02 §5 末尾备注）" — **决策一致**（决议为不提取） | ✅ |
| 02 §6.3 dwell 80ms → 03 §6.4 dwell timer 实现 ✓ | |
| 02 §6.5 末尾"具体由 03_tech_plan 详化" → 03 §3.3.3 set_category_parent ✓ | |
| 02 §11 风险 R1"如显著则 03_tech_plan 评估降至 50 ms 或取消" → 03 未提供降级路径方案（hardcoded setTimeout(80)） | ⚠️ **P2**（详 §11） | |

---

## 4. Token 命名一致性核对

> 评审方法：交叉对照 design-language.md 列出的 token vs 02 V1 引用的 token vs 03 V1 CSS 增量。所有 hierarchy 引用的 token 应在 design-language.md 中已列出，否则需要在 design-language.md 中显式列出（不允许"隐式"引入）。

| Token | design-language.md | 02 V1 引用位置 | 03 V1 引用位置 | 一致性 |
|---|---|---|---|---|
| `--indent-step: 16px` | **未列入** Constraints 任何 token 表（全文搜索仅有 V3 之前的 token） | §1 / §2.3 / §5 / §7 (V3 不变量 #9) | §2.1 注释 / §5.1.A INDENT_STEP_PX = 16 / §7.1 token 定义 | ⚠️ **P1**：唯一新 token 未声明在 design-language.md 中。02 §5 + 03 §7.1 都假设它将来加入；目前是"02/03 自创"。详 §11 |
| `--ease-drag` (cubic-bezier(0.16, 1, 0.3, 1)) | Constraints "Easing tokens" 段列出 | §2.4 / §2.7 / §2.8 / §2.9 / §2.15 / §5 token | §5.2 / §7.2 chevron / §7.3 children container | ✅ |
| `--ease-drag-cancel` | Constraints 列出 | §2.12 / §5 token | §5.2 onDragCancel 段 | ✅ |
| `--duration-drag-reorder: 220ms` | Constraints 列出 | §2.7 / §2.8 / §2.9 / §2.15 / §5 token | §5.2 / §7.3 / §10 测试 | ✅ |
| `--duration-drag-snap: 80ms` | Constraints 列出 | §2.10 / §5 token（与 dwell 80ms 数值相同语义独立） | §6.4 dwell timer 复用 80 数字（实现是 setTimeout 不是 token） | ⚠️ **P2**：02 §5 明示"`--duration-drag-snap = 80ms` ... 数值相同但语义独立"。03 §6.4 直接 `setTimeout(80)` hardcode 80 — 这是合理的（dwell 是 React state，不是 CSS transition），但读者需自己理解 80 数字非 token 引用。 |
| `--duration-drag-cancel: 280ms` | Constraints 列出 | §2.12 cancel 280 ms | §5.2 / §10.3 测试 | ✅ |
| `--duration-drag-indicator-fade: 100ms` | Constraints 列出 | §2.7 indicator 100ms fade | 暗含 §7 / drop animation | ✅ |
| `--duration-drag-indicator-move: 150ms` | Constraints 列出 | §2.7 末尾段 / §5 token | §7.2 没有显式引用，但 02 §2.7 表述清楚 | ✅ |
| chevron rotation duration `120 ms` | **未在 design-language Constraints 中列出**（不是 token，仅 inline 120ms） | §2.2 chevron rotation timing 120ms / §5 token 段末尾 备注 | §7.2 chevron transition: color 120ms var(--ease-drag) | ⚠️ **P1**（与 P1#1 同一根源）：02 §5 末尾说"建议 03_tech_plan 评估是否提取为 `--duration-disclosure-rotate: 120ms` token" → 03 §7 决议不提取直接 inline 120ms → 但 design-language.md "Constraints" 段对自定义 cubic-bezier / 自创 ms 数字明令"forbidden"："Self-invented 200ms literals are forbidden"。120 ms 严格说是"现状值"但首次正式落到 hierarchy 文档里 = 该值需在 design-language Rule 加入或 explicit 标记 deviation。详 §11 |
| `--color-tertiary: #A1A1AA` | Constraints "Color tokens" 列出 | §2.2 / §2.4 chevron 三态色 / §5 | §7.2 chevron 默认颜色 | ✅ |
| `--color-secondary: #71717A` | Constraints 列出 | §2.2 chevron hover 色 / §5 | §7.2 chevron hover 跟随 | ✅ |
| `--color-primary: #18181B` | Constraints 列出 | §2.2 chevron active 父类色 / §5 | 暗含 | ✅ |
| `--color-bg-tertiary: #F4F4F5` | Constraints 列出 | §2.1 row hover/active bg | 暗含 | ✅ |
| `--color-accent` | Constraints 列出 | §2.7 drop indicator + §5 | 暗含（drop indicator 同 V3） | ✅ |

---

## 5. V3 不变量核对清单数量一致性

> 02 V1 §7 / 03 V1 §12 / 04 V1 任务卡引用三处必须**列项数量** + **内容**一致。

| 文档 | 列项数 | 列出形态 |
|---|---|---|
| 02 V1 §7 V3 不变量保留核对清单 | **22 项** | 表格 # 1-22 |
| 03 V1 §12 V3 不变量保留核对（≥ 22 项） | **23 项** | 表格 # 1-23 |
| 04 V1 §1 / 任务卡 V3 不变量回归核对 | T3a 列出 **23 项 R-V3-1 ~ R-V3-23** | 散布在 T1a-T6 各任务卡内 |

**核心差异分析**：

| 02 §7 | 03 §12 | 差异内容 |
|---|---|---|
| #1 4 px 激活 | #1 4 px activation | 一致 |
| #2 两段 lift 80ms+120ms | #2 两段 lift（80ms 吸盘 + 120ms 拉离）| 一致 |
| #3 DragOverlay 多层 hsl 阴影 | #3 DragOverlay 多层 hsl 阴影 | 一致 |
| #4 12 px 连续磁吸 | #4 12px 连续磁吸 | 一致 |
| #5 220 ms cascade | #5 220ms cascade | 一致 |
| #6 distance-aware settle | #6 distance-aware settle | 一致 |
| #7 Cancel snap-back 280 ms | #7 Cancel snap-back 280ms | 一致 |
| #8 DndContext modifiers `[snapModifier]` 仅磁吸；DragOverlay modifiers `[restrictToWindowEdges]` 仅防出窗 | #8 DndContext modifiers `[snapModifier]` + #9 DragOverlay modifiers `[restrictToWindowEdges]` | ⚠️ **02 §7 #8 是合并条目**（DndContext + DragOverlay 两个 modifier 写一行）；**03 §12 拆分为 #8 + #9 两条**。这正是 02 22 项 vs 03 23 项的**核心差异点** |
| #9 全套 CSS token | #10 全套 CSS token | 02 #9 = 03 #10（编号偏移 1） |
| #10 DATA_MUTEX 串行 + apply_reorder pure + ENSEMBLE_DATA_DIR 测试隔离 | #11 DATA_MUTEX 串行 + apply_reorder pure + ENSEMBLE_DATA_DIR 测试隔离 | 一致（编号偏移 1） |
| #11 categoriesVersion / tagsVersion 协议 | #12 categoriesVersion / tagsVersion 协议 | 一致（编号偏移 1） |
| #12 enqueueReorder 串行 IPC 队列 | #13 enqueueReorder 串行 IPC 队列 | 一致（编号偏移 1） |
| #13 data-no-dnd + CustomMouseSensor 双保险 | #14 data-no-dnd + CustomMouseSensor 双保险 | 一致（编号偏移 1） |
| #14 编辑/新增态 SortableContext 全局 disabled | #15 编辑/新增态 SortableContext 全局 disabled | 一致（编号偏移 1） |
| #15 KeyboardSensor + sortableKeyboardCoordinates + announcements | #16 KeyboardSensor + ... + announcements | 一致（编号偏移 1） |
| #16 prefers-reduced-motion 全套尊重 | #17 prefers-reduced-motion 全套尊重 | 一致（编号偏移 1） |
| #17 "Show X more" 折叠 onDragStart 自动展开 | #18 "Show X more" onDragStart 自动展开 | 一致（编号偏移 1） |
| #18 justDroppedRef / 50 ms guard 窗口 | #19 justDroppedId 50 ms guard | 一致（编号偏移 1） |
| #19 拖动期间 Refresh 按钮 disabled | #20 拖动期间 Refresh disabled | 一致（编号偏移 1） |
| #20 DragOverlay 不带原位 padding | #21 DragOverlay 不带原位 padding | 一致（编号偏移 1） |
| #21 closestCenter collision detection | #22 closestCenter collision detection | 一致（编号偏移 1） |
| #22 MeasuringStrategy.Always | #23 MeasuringStrategy.Always | 一致（编号偏移 1） |

**04 T3a "V3 不变量回归核对"段实际 23 项 R-V3-1 ~ R-V3-23**（与 03 §12 形态一致）。

⚠️ **P1**：02 §7 22 项 vs 03 §12 23 项 vs 04 R-V3-23 的**列项编号偏移**会导致 reviewer 在 02→03 跨引时（如 04 T3a 必读"02 V1 §7 V3 不变量"）某个具体引用编号在两侧含义不同。例如"V3 不变量 #15"在 02 是"KeyboardSensor"，在 03 是"编辑/新增态 SortableContext disabled"。**虽然全部内容覆盖一致**（无内容遗漏），但**编号引用是漂移的**——任何代码评审或 SubAgent 引用时若按编号沟通，会指错条目。详 §11

---

## 6. Acceptance 数量与内容一致性

| 文档 | Acceptance 段 | 客观条件数量 | 主观条件数量 |
|---|---|---|---|
| 02 V1 §9 客观条件 | "≥ 18 项客观可验证"（实际 22 项 + V3 12 项 = 34 项）+ 主观 3 项 | 客观 22 + V3 12 = 34 | 主观 35-37（3 项） |
| 04 V1 T5c "完整 acceptance 清单（给用户）" | 引用"from 02 §9" | 22 项（视觉 12 + 行为 10）— 与 02 §9 的"客观 22 项" 1:1 对应 ✓ | 缺失 |

**详细 1-1 比对**（22 客观 + 12 V3 + 3 主观）：

- 02 §9 第 1-12 项视觉客观 = 04 T5c 第 1-12 项 ✅
- 02 §9 第 13-22 项行为客观 = 04 T5c 第 13-22 项 ✅
- 02 §9 第 23-34 项 V3 行为零回归（regression guards）= 04 T5c 缺失 ⚠️

⚠️ **P1**：04 T5c 用户验证清单**未包含 02 §9 第 23-34 项 V3 行为零回归**（12 项 V3 不变量回归 acceptance）。04 T5c 文中说"≥ 23 项 V3 不变量回归"但该列表本身缺失，仅在 04 §1 依赖图段说"≥ 23 项 V3 不变量回归"作为 phase 5 出口标准。

⚠️ **P1**：04 T5c 用户验证清单**未包含 02 §9 第 35-37 项主观感受兜底**（3 项），但 04 T5c 任务描述说"§8.1 第 20-22 主观感受兜底 3 项"——这些**应**被包含，文档表述说包含但清单本身没列出。详 §11

⚠️ **P1**：D9 dropdown 视觉验证缺失：02 §9 客观 22 项中**没有任何条目验证 5 个 dropdown 树形渲染**（如"SkillDetailPanel 的 category dropdown 显示树形 + 子类缩进 16px"）。04 T5c 同样缺失。这与 §2 评审表中"D9 落地 acceptance 缺口"是同一项。详 §11

---

## 7. 术语漂移核对表

| 术语候选 | 02 V1 用法 | 03 V1 用法 | 04 V1 用法 | 漂移程度 |
|---|---|---|---|---|
| **drop into** vs **drop-into** | 混用："drop into 区"（§2.14、§2.7）+ "drop-into 反馈"（§1）+ "drop-into 视觉候选"（§2.7）+ "drop-into 区"（§2.14） | "drop-into 区"（§6.2）+ "drop-into indicator"（§5.1.A 注释） | "drop into 阈值"（T2d 必读） + "drop-into"（T3a 注释） | 跨文档**混用** "drop into" / "drop-into" — 同义但风格不一。详 §11 |
| **嵌入 / 成为子类 / demote** | "成为子类语义"（§2.2 注释 / §2.7）+ "demote"（§2.7 / §3 / §4.1）+ "嵌入"（§2.7 候选 alpha） | "demote"（§5.1.A 注释 / §5.2 / §6.3）+ "成为子类"未单独使用 | "demote"（T3a 注释）+ "成为子类"未使用 | 02 用三种表述，03/04 仅"demote"。可读性 P2 漂移 |
| **promote / 拖出 / 升级到根** | "promote"（§2.7 / §3 / §4.2 / §6.4）+ "拖出"（用户层措辞）+ "升级到根" 无 | "promote"（§5.1.A / §5.1.B / §6.3） + "promote to root" 多次 | "promote"（T2d / T3a / T3d ContextMenu "Promote to Root"）一致 | 全部一致 ✅ |
| **category** vs **分类** | 全文中文注释处用"分类"（§1 末尾"二级分类"），代码层面词用"category" / "Category" / "categoryId" | 全 English 术语；代码注释用 category | 全 English；任务卡用 category | 02 中英文混用（中文用"分类"做日常语言，英文用 category 做代码 ID）— 项目 README + 用户原话也是这种风格，**不是漂移而是项目惯例**。✅ |
| **二级 / hierarchy / max depth=2** | "二级"（§10 不在范围："三级及更深嵌套"）+ "hierarchy"（§1 / §6.5 / §7）+ "max depth = 2"（§1 注释 / §6.5 / §10）| "hierarchy"（多处）+ "max depth=2"（§2.3 / §3.7）+ "二级" 不用 | "hierarchy"（多处）+ "max depth=2"（多处）+ "二级" 不用 | 02 中文注释保留"二级"作为项目对话术，03/04 全 hierarchy；这是 02 作为"用户原话直承"层的合理风格差异 ✅ |
| **chevron** | 全统一使用 `chevron`（lucide-react `ChevronRight/ChevronDown`） | 同 | 同 | ✅ |
| **collapsedIds** vs **expandedSet** | 02 §3 announcements context 写"hierarchy: { parentMap, expandedSet }"；§2.15 持久化 key 用 `collapsedCategories`（折叠的 ids） | 03 §5.6 announcements 写"HierarchyContext = { parentMap, collapsedIds }" | 04 T3a 实现按 03 写"collapsedIds" | ⚠️ **P1**：02 用 expandedSet 描述 announcements；03/04 用 collapsedIds — 反向命名 |
| **`isInvalidDrop` vs `isInvalid` vs `projected.isInvalid`** | 02 §2.6 / §2.14 用"非法（drop invalid）"做语义描述（无字段名）；§9 Acc#19 用"D5 父类不可成子" | 03 §5.1.A `Projection.isInvalid: true`；§5.3 `isInvalidDrop?: boolean` prop；§5.2 `projected?.isInvalid` | 04 T3a `projected?.isInvalid`；T3b `isInvalidDrop?: boolean`；T2d "isInvalid=true" 测试 | 02 不使用字段名（描述层），03/04 字段层有两个名（Projection.isInvalid 内部 + isInvalidDrop 组件 prop）— 明确区分内部状态 vs UI prop。✅ 不漂移（语义清晰分层） |
| **active(Id) / Active(Category)** | 02 §2.6 / §4 时序使用"被拖项 / active item" | 03 §5.1.A `activeItem` / `activeId`；§5.2 useState `activeId` | 04 T3a `activeId` useState | 一致 ✅ |
| **`onDragMove` vs `onDragOver`** 语义 | 02 §2.14 "在 onDragOver / onDragMove 实时判定"（合用） | 03 §5.2 拆分：handleDragMove(setOffsetLeft + dwell) + handleDragOver(setOverId) | 04 T3a 同 03 拆分 | 02 合用 / 03/04 拆分 — 02 是描述层（一阶段），03/04 是实现层（两 handler）。语义实质一致 ✅ |

---

## 8. 依赖图与文档间实际依赖

| 检查 | 状态 |
|---|---|
| 04 V1 §1 依赖图（Phase 0-6） | T0 → Phase 1 (T1a 是源头 → T1b/c/d/e/f 并行 → T1g) → Phase 2 (T2a-d) → Phase 3 (T3a 串行依 T3b) → Phase 4/5/6 |
| Phase 1 内 T1c 依赖 T1b（用 validate_hierarchy） + T1a（用 Category.parent_id）✓ | ✅ 正确 |
| Phase 2 T2a 依赖 T1c（addCategory 后端支持 parentId） + T1e（迁移 IPC）✓ | ✅ 正确 |
| Phase 2 T2b 依赖 T1f（update_skill_metadata 支持 categoryId） + T2a（addCategory 第三参数）✓ | ✅ 正确 |
| Phase 2 T2c 依赖 T1a（TS Category.parentId 字段）✓ | ✅ 正确 |
| Phase 2 T2d 依赖 T1a（TS Category.parentId）✓ | ✅ 正确 |
| Phase 3 T3a 依赖 T2a + T2c + T2d 全部并行通过；T3a 与 T3b 串行（T3b 必须先于 T3a）— 04 §1 注释明确 | ✅ 正确 |
| Phase 3 T3c/T3d/T3e 互相独立（同消息并行） | ✅ 正确 |
| Phase 4 T4 与 Phase 3 任意可并行（独立 CSS） | ✅ 正确 |
| Phase 5 T5a 依赖 Phase 2 + Phase 3 全部通过；T5b 主 Agent 自跑 4 命令；T5c 主 Agent 启 dev server + 用户验证 | ✅ 正确 |
| Phase 6 T6a/b/c 同消息并行；T6d commit | 04 §1 列出但未在 §2 详化任务卡（未读到 T6a/b/c/d 的详细任务卡）— 这是任务卡 P1 缺失 |

⚠️ **P1**：04 §1 依赖图列出 Phase 6 T6a/T6b/T6c/T6d 但 §2 详细任务卡部分（已读至 T5c）**未提供 T6a/T6b/T6c/T6d 的详细任务卡**。任务卡完整度仅到 T5c — 25 张任务卡中 4 张缺失。详 §11

⚠️ **P1**：04 §1 与 §2 列出的"总任务数"在 §1 末尾说**25 张任务卡**：T0 + T1a-T1g（7） + T2a-T2d（4） + T3a-T3e（5） + T4 + T5a-T5c（3） + T6a-T6d（4） = 25。计算正确（1+7+4+5+1+3+4=25）。但 §2 实际仅详化到 T5c，T6a-T6d 在文档中**未实际写出任务卡**（已读至 T5c L1390 行止）。详 §11

---

## 9. Document Authority Ranking 一致性

> 评审三处文档头部的 Authority Ranking table 是否互相一致。

| 文档 | Authority Ranking 出现位置 | 列出 |
|---|---|---|
| 02 V1 | "Document Authority Ranking" 段（紧随 Revision History） | 13 行（5 Decisional + 8 Referential） |
| 03 V1 | "Document Authority Ranking" 段 | 11 行（6 Decisional + 5 Referential） |
| 04 V1 | "Document Authority Ranking" 段 | 13 行（7 Decisional + 6 Referential） |

**详细对照**：

| 文档行 | 02 V1 | 03 V1 | 04 V1 | 一致性 |
|---|---|---|---|---|
| _synthesis_decisions | Decisional / 2026-05-04 / "14 决策定锤（D1–D14）, 最高权威" | Decisional / 2026-05-04 / "14 决策定锤（D1-D14）— 最高权威" | Decisional / 2026-05-04 / 同 | ✅ |
| 02_design_spec V1 | Decisional / 2026-05-04 / "视觉/动效/交互规格"（自引用） | Decisional / 2026-05-04 / "视觉/动效/交互规格" | Decisional / 2026-05-04 / 同 | ✅ |
| 03_tech_plan V1 | Decisional / TBD / "库选型 / 数据模型 / API / 架构 / 迁移"（02 写时 03 未定稿）| Decisional / 2026-05-04 / 同（自引用） | Decisional / 2026-05-04 / 同 | ⚠️ **P2**：02 写"TBD"（合理 — 写 02 时 03 还未存在）；03 / 04 都已写"2026-05-04"。这不是矛盾，是时间序的合理结果。但 02 应该已经被同步更新为 2026-05-04，否则未来任何 reviewer 看 02 会觉得 03 是 "未定稿"状态 |
| 04_implementation_plan V1 | Decisional / TBD / 同上理由 | Decisional / TBD / 同上理由 | Decisional / 2026-05-04 / 同（自引用） | ⚠️ 同 P2 |
| sidebar-reorder/02_design_spec V3 | Decisional / 2026-05-03 / "V3 不变量基线（hierarchy 必须叠加在其上不破坏）"  | Decisional / 2026-05-03 / "V3 视觉不变量基线" | Decisional / 2026-05-03 / "V3 视觉不变量基线" | ✅ |
| sidebar-reorder/03_tech_plan V3 | Decisional / 2026-05-03 / "V3 技术不变量基线" | Decisional / 2026-05-03 / "V3 技术不变量基线（DATA_MUTEX、apply_reorder pure、version 协议、enqueueReorder 队列、ENSEMBLE_DATA_DIR 测试隔离）" | Decisional / 2026-05-03 / 同 03 | ✅ |
| design-language.md | **02 V1 未在 Ranking 中列出 design-language.md** | **03 V1 未列出** | Decisional / 2026-05-03 / "项目级设计语言 Rule（每 session 自动加载；token 化、no-stagger、no-overshoot 等硬底线）" | ⚠️ **P1**：仅 04 V1 把 design-language.md 列入 Authority Ranking（且标 Decisional + 2026-05-03）；02 / 03 完全没列。但 02 / 03 实质上**应受 design-language.md 约束**（02 §1 哲学层完全引用 design-language 风格；03 §7 CSS 增量受 token 化 / "no self-invented duration"等 design-language Constraints 约束）。详 §11 |
| _dispatch_plan | 未列入 Ranking | 未列入 Ranking | 未列入 Ranking | ✅ 正确（Referential — 仅作研究 wave 计划，不作权威）— 但 04 的 R1-R7 R# 都列了，dispatch 也应列 — P2 |
| 00_understanding | Referential / 2026-05-04 / 任务边界 + 隐含前提 | Referential / 2026-05-04 / 任务边界 + 隐含前提 + 风险登记 | Referential / 2026-05-04 / 同 | ✅ |
| R1-R7 | 全部 Referential / 2026-05-04 / 各自论据来源 | R1/R2/R5/R6 仅列出 4 个（R3/R4/R7 未列） | R1-R7 全部列出 7 个 | ⚠️ **P2**：03 V1 Authority Ranking 只列了 R1/R2/R5/R6，没列 R3/R4/R7。由于 03 主要素材来自 R1/R2/R5/R6（数据模型 + dnd-kit 架构 + grep + classify count），R3/R4/R7 视觉/HCI/哲学不在 03 范围；但 design-language.md 来自 R7 →也未列入 — 03 缺失会造成"03 看 R7 蒸馏后的 design-language 没有 traceback 链"。详 §11 |

**冲突解决规则三处声明**：
- 02 V1 段末："同级冲突 → 向用户提问；跨级冲突 → 自动以高层为准；本 V1 落地中出现 R3 推荐 X，_synthesis 锁定 Y → Decisional > Referential 取 Y" ✓
- 03 V1 段末："同级冲突 → 向用户提问；跨级冲突 → 自动以高层为准；任何越界都标记 P0 与 _synthesis 矛盾，不擅自修改决策" ✓
- 04 V1 段末："同级冲突 → 向用户提问；跨级冲突 → 自动以高层为准（_synthesis_decisions > 02=03=04 > V3 spec > Referential）；本 V1 落地中若发现某条任务卡与 02/03/_synthesis 冲突 → 视觉以 02 为准；技术以 03 为准；任务粒度以本 04 为准" ✓

✅ 三处冲突解决规则**实质一致**，仅措辞略有不同（这是合理的，因为 04 比 02/03 更具体表达"任务粒度以本 04 为准"）。

---

## 10. Cascade Footprint V1 首版下声明完整度

> V1 是首版，不存在 V_n → V_{n+1} cascade；但 cross-document-cascade-discipline.md 仍要求**未来 V2 修订时必须声明 cascade footprint**。本评审检查 V1 是否在 Revision History 中预留 cascade 声明 placeholder，且在主 Agent 锁定的 14 决策修订过程中是否有效地把 cascade 影响扩散到三个文档。

### 10.1 _synthesis_decisions § 4 cascade 表

`_synthesis_decisions §4` 列出 14 决策对 02 / 03 / 04 / design-language.md 的 cascade footprint：

| 决策 | 02 影响 | 03 影响 | 04 影响 | design-language 影响 |
|---|---|---|---|---|
| D1 | 弱 | 强 | 强 | 无 |
| D2 | 中 | 强 | 强 | 无 |
| D3 | 强 | 强 | 强 | 无 |
| D4 | 强 | 中 | 中 | 弱 |
| D5 | 中 | 中 | 中 | 无 |
| D6 | 中 | 中 | 中 | 无 |
| D7 | 中 | 中 | 中 | 无 |
| D8 | 弱 | 中 | 中 | 无 |
| D9 | 强 | 中 | 中 | 无 |
| D10 | 强 | 弱 | 弱 | **中**（建议 `--indent-step` 添加 token） |
| D11 | 强 | 弱 | 弱 | 弱 |
| D12 | 强 | 中 | 中 | 无 |
| D13 | 弱 | 强 | 强 | 无 |
| D14 | 无 | 弱 | 弱 | 无 |

**评审**：

⚠️ **P1**：D10 cascade 表列出"design-language 中等影响（建议添加 `--indent-step` 可选 token）"——但实际上 design-language.md V1（已读全文）**没有任何 V1 hierarchy 相关的更新**。这是 _synthesis_decisions §4 cascade 声明的"中等影响"承诺**未落地**。详 §11

⚠️ **P1**：D4 cascade 表列出"design-language 弱影响（drop-into 范式可记到 design-language）"——但 design-language.md V1 **没有任何关于 drop-into 范式的段落**。同上未落地。详 §11

### 10.2 02 / 03 / 04 V1 Revision History cascade footprint 声明

| 文档 | Revision History 中 cascade 声明 |
|---|---|
| 02 V1 | "cascade footprint 声明：本 V1 直接驱动 03_tech_plan.md V1 的视觉/动效字段（dnd-kit Sortable Tree 投影宽度 = `var(--indent-step)`）+ 04_implementation_plan.md V1 的视觉验收子任务 + .claude/rules/design-language.md V1 的'hierarchy 视觉一致性'段落" |
| 03 V1 | "cascade footprint 声明：本 V1 直接驱动 04_implementation_plan.md V1 的任务卡（T-DM-1 ~ T-FE-7）+ 测试矩阵；不影响 02_design_spec V1（视觉/动效已锁定）" |
| 04 V1 | "cascade footprint 声明：本 V1 直接驱动后续的 SubAgent 投递工作流（§5）+ Phase 2 ~ Phase 6 的执行；不向回影响 02 / 03 V1 内容" |

**评审**：

⚠️ **P1**：02 V1 cascade footprint 提到"`.claude/rules/design-language.md` V1 的'hierarchy 视觉一致性'段落"——但 design-language.md 当前内容**没有"hierarchy 视觉一致性"段落**（该 Rule 是 V3 sidebar-reorder 时期定稿，未被 V1 hierarchy 改造）。02 V1 的 cascade 承诺**未落地** 到 design-language.md。详 §11

⚠️ **P1**：03 V1 cascade footprint 列出"04_implementation_plan.md V1 的任务卡（T-DM-1 ~ T-FE-7）+ 测试矩阵"。但 04 V1 实际任务命名是 **T0 / T1a-T1g / T2a-T2d / T3a-T3e / T4 / T5a-T5c / T6a-T6d**，**不是 T-DM-* / T-FE-* 命名**。03 §13 末尾"与 ImplementationPlan 的衔接"建议命名是 T-DM-1 ~ T-FE-12，但 04 实际选用了不同任务卡命名规则（按 phase + 字母）。**这是 03 → 04 cascade 的命名漂移**——03 §13 的"建议拆分"未被 04 实际遵循（虽然 04 表述更清晰）。**实质内容覆盖一致**，但**命名引用对不上**。详 §11

### 10.3 design-language.md V1 是否被本任务 V1 改动

design-language.md 的 V1 hierarchy 改造在 _synthesis_decisions §4 cascade 表中标 D4 / D10 / D11 弱-中影响。但读完 design-language.md 全文，V1 hierarchy 任何条目都**未在该 Rule 中出现**（无 `--indent-step`、无 hierarchy 段、无 chevron 范式）。

⚠️ **P0 候选**：design-language.md V1 应有的 hierarchy 改动（D4 drop-into 范式 / D10 `--indent-step` token / D11 padding-only 表达 / chevron 120ms inline 数字 / D12 disclosure control 范式 / 子类 padding 26 px 视觉 / 缩进过渡 220ms）**完全未落地** — 但 design-language.md 在 04 V1 Authority Ranking 中标"2026-05-03"（V3 时期，未被改）。

是否构成 **P0 stop-ship**？分析：
- design-language.md 是 **Decisional 项目级 Rule（每 session 自动加载）**。它没有 hierarchy 内容时，未来开发 hierarchy 相关代码的 SubAgent 在没读 02/03/04 的情况下，可能**自创 chevron rotation 数字 / drop-into 阈值**——违反 design-language 的"Self-invented duration literals are forbidden"。
- 02 V1 / 03 V1 / 04 V1 的 cascade footprint 都承诺 design-language 改动，但**实际未落地**——这是 cascade 声明 vs 实际不一致 = **跨文档对齐 P0**。
- **但**：从风险等级看，design-language 当前作为"基线 Rule"已能 cover 大部分 hierarchy 行为（color tokens / easing tokens / no-stagger / no-overshoot / cursor: default 这些都对 hierarchy 同样适用）；唯一漏的是"`--indent-step` token / chevron 120ms inline / drop-into 80ms dwell 范式"。**不是 stop-ship 级别的 P0**，而是 **P1 cascade footprint 与实际落地之间的承诺断裂**。

降级为 **P1**，详 §11。

---

## 11. P0 / P1 / P2 问题列表

### P0 问题列表（对齐 stop-ship — 同样决策三处不一致）

**P0 — 无**。

14 决策、视觉规格、技术架构、任务拆分在三处文档中**核心数值与术语完全一致**。无任何"02 说 X，03 说 ¬X"的三处对齐 stop-ship。

### P1 问题列表（同级 same-level 漂移 / 必须修订）

#### **P1-1：02 §3 announcements context "expandedSet" vs 03 §5.6 "collapsedIds" 反向命名**

- **位置**：02 §3 末尾"扩展点：在 announcements.ts 的 makeAnnouncements 工厂内增加 `hierarchy: { parentMap, expandedSet }` 上下文参数"
- 03 §5.6：`HierarchyContext = { parentMap: Map<string, string>; collapsedIds: Set<string> }`
- **冲突**：expandedSet（已展开 ids）vs collapsedIds（已折叠 ids）是反向语义。02 §2.15 持久化 key 用 `collapsedCategories`（折叠的 ids）— 与 03 一致；但 02 §3 announcements 段写"expandedSet"反向。
- **修订建议**：02 §3 末尾"hierarchy: { parentMap, expandedSet }" 改为 "hierarchy: { parentMap, collapsedIds }"。

#### **P1-2：02 §1 设计哲学引用 §2.20 应是 §2.21**

- **位置**：02 §1 末尾"原则的硬底线 — 详见 §2.20 Anti-pattern 清单"
- 02 §2.20 实际是 "WCAG 2.5.7 Dragging Movements Alternative" + ContextMenu 兜底（per D6 = C + E）
- 02 §2.21 才是 "Anti-pattern 清单（明确禁止）"
- **冲突**：引用源章节号错位 1 节
- **修订建议**：02 §1 末尾"详见 §2.20" 改为"详见 §2.21"。

#### **P1-3：02 §7 V3 不变量 22 项 vs 03 §12 23 项编号偏移**

- **位置**：02 §7 列 22 项（#8 是合并条目"DndContext + DragOverlay 两 modifier 合写一行"）；03 §12 列 23 项（#8 + #9 拆分为独立条目）
- **冲突**：编号偏移 1 — 同一不变量在两侧编号不同（如"#15"在 02 是 KeyboardSensor，在 03 是 SortableContext disabled）
- **风险**：04 T3a 列 23 项 R-V3-1~R-V3-23 与 03 一致；但 04 任何任务卡引用"V3 不变量 #N"或外部 PR review 引用编号沟通时，会因为 02 编号 vs 03 编号偏移指错条目。
- **修订建议**：将 02 §7 第 #8 拆分为 #8 (`[snapModifier]`) + #9 (`[restrictToWindowEdges]`) 两条；其后所有编号 +1（#9→#10 ... #22→#23）。最终 02 §7 = 23 项，与 03 §12 / 04 R-V3-23 完全一致。

#### **P1-4：04 T5c "完整 acceptance 清单"未列出 V3 行为零回归 12 项 + 主观感受 3 项**

- **位置**：04 T5c "完整 acceptance 清单（给用户）"末尾止于第 22 项；但 02 §9 实际有 22 + 12 + 3 = 37 项
- **冲突**：04 T5c 文中"≥ 22 项 from 02 §9 + ≥ 23 项 V3 不变量回归"承诺包含 V3 回归项，但任务卡内列出的清单仅前 22 项
- **修订建议**：04 T5c 任务卡补全 23-34 项 V3 行为零回归清单 + 35-37 项主观感受兜底。

#### **P1-5：04 §1 与 §2 任务卡完整度 — T6a/T6b/T6c/T6d 缺失详细任务卡**

- **位置**：04 §1 依赖图 Phase 6 列出 T6a (代码审计) / T6b (设计还原度审计) / T6c (回归扫描) / T6d (commit + push)
- 04 §2 详细任务卡仅写到 T5c L1390 行止
- **冲突**：25 张任务卡承诺中 4 张未详化（T6a-T6d 占 16% 任务量）
- **修订建议**：04 §2 补全 T6a/T6b/T6c/T6d 任务卡详情（类似 T0 概念对齐 SubAgent 形态 + 必读上下文 + 输出文件 + 验证标准）。

#### **P1-6：D9 dropdown 视觉 acceptance 缺口**

- **位置**：02 §9 客观 22 项中无任何条目验证 5 个 dropdown 的树形渲染（如"SkillDetailPanel 的 category dropdown 显示树形 + 子类缩进 16px"）；04 T5c 同样缺失
- **冲突**：D9 决策已落实到 03 §5.9 + 04 T3e 任务，但**用户验收路径**没有 acceptance 验证条目
- **修订建议**：02 §9 视觉客观条件追加：
  - 第 X 项：5 个 dropdown 的 option 树形渲染：root option 缩进 padding-left = 16px；child option 缩进 padding-left = 32px；DOM 验证 ≥ 5 处 dropdown（SkillDetailPanel、SkillsPage、McpServersPage、McpDetailPanel、ClaudeMdDetailPanel）
- 04 T5c 同步追加该条。

#### **P1-7：design-language.md V1 未实施 cascade footprint 承诺的 hierarchy 改动**

- **位置**：02 / 03 / 04 V1 Revision History 都声明 cascade footprint 包含 design-language.md 改动（V1 hierarchy 视觉一致性 / `--indent-step` token / drop-into 范式）
- design-language.md V1 当前内容**完全是 V3 时期版本**（标"2026-05-03"），无任何 hierarchy 相关条目
- **冲突**：cascade 声明 vs 实际未落地
- **修订建议（V2 cascade gate 必跑）**：在进入实施 phase 前，
  1. 在 design-language.md "Constraints/Duration tokens" 段加入 `--indent-step: 16px`（命名建议 `--sidebar-indent-step` 或保留 `--indent-step` 视项目 token 命名 convention）
  2. 在 "Constraints" 或独立"hierarchy 视觉一致性"段记录：chevron disclosure 范式（10×10 / 仅有子类时渲染 / hit-target 16px）+ drop-into 范式（12 px X 阈值 + 80 ms dwell + indicator 缩进表达） + 子类视觉权重等同父类（D11） + max depth=2 硬约束 + chevron rotation 120ms 是允许的 inline 值
  3. 在 "Allowed inline easing" 段决定 chevron 120ms 是该追加 `--duration-disclosure-rotate: 120ms` token 还是显式 inline allow-list

#### **P1-8：04 V1 Authority Ranking 含 design-language.md，但 02 / 03 不含**

- **位置**：04 V1 Authority Ranking 列 design-language.md（Decisional / 2026-05-03 / 项目级设计语言 Rule）；02 / 03 均未列入
- **冲突**：02 / 03 实质受 design-language Constraints 约束（02 §1 哲学层完全引用 / 03 §7 CSS 增量受 token 化 + Anti-pattern 约束），但 Authority Ranking 表内未声明
- **修订建议**：02 / 03 V1 Authority Ranking 表追加 design-language.md 行（Decisional / 2026-05-03 / 项目级设计语言 Rule）。

#### **P1-9：02 / 03 Authority Ranking 中 03 / 04 行的 Last Modified = "TBD"（在 02 / 03 中）**

- **位置**：
  - 02 V1 Ranking：03 V1 写 "TBD"，04 V1 写 "TBD"
  - 03 V1 Ranking：04 V1 写 "TBD"
- **冲突**：写时合理（链式编写时）；但 V1 三文档全部已存在后，应同步把 TBD 改为 2026-05-04
- **修订建议**：02 / 03 V1 Ranking 表里 03 / 04 的 "TBD" → "2026-05-04"。

#### **P1-10：04 V1 任务卡 T1c 必读 03 §3.3.1 描述漂移**

- **位置**：04 V1 T1c 必读 1 写"03 §3.3.1（add_category 完整代码 — 新增 parentId 参数 + DATA_MUTEX + **validate_hierarchy 调用**）"
- 03 §3.3.1 实际代码**未调用** `validate_hierarchy` 函数；改为手写 `if parent.parent_id.is_some() return DepthExceeded` + orphan find（`Reuse the same checker minus self-as-parent / cycle / demote-with-children`）
- **冲突**：04 必读描述与 03 实际代码差异 — 03 自己注释也说"reuse minus..."；不是调用 validate_hierarchy
- **修订建议**：04 T1c 必读 1 改为"03 §3.3.1（add_category 完整代码 — 新增 parentId 参数 + DATA_MUTEX + **手写 hierarchy 校验，复用 validate_hierarchy 部分逻辑（parent 存在 + parent.parent_id 是 None）**）"。

#### **P1-11：03 §13 任务命名 vs 04 实际任务命名漂移**

- **位置**：03 §13 "与 ImplementationPlan 的衔接"建议拆分命名是 T-DM-1 ~ T-FE-12（4 wave）；04 实际命名 T0 / T1a-T1g / T2a-T2d / T3a-T3e / T4 / T5a-T5c / T6a-T6d
- **冲突**：03 cascade footprint 引用"T-DM-1 ~ T-FE-7" 但 04 没有这种命名
- **修订建议**（影响小）：04 V1 在 §1 末尾追加一段"任务命名映射表"：T-DM-1/T-DM-2 ≈ T1a 字段加法；T-BE-1 ≈ T1b/T1c/T1d；T-BE-2 ≈ T1c set_category_parent；T-BE-3 ≈ T1e migrate；T-BE-4 ≈ T1f scan；... 让 03 → 04 cascade reader 能 map 找到对应任务卡。**或**修改 03 §13 的"建议拆分"段落标注"04 实际采用 T0/T1a-g/T2a-d... 命名，本节作为命名映射的 obsolete 建议"。

### P2 问题列表（轻微 — 风格 / 标号）

#### **P2-1：术语"drop into" vs "drop-into" 跨文档混用**

- **位置**：02 / 03 / 04 三处文档全部混用"drop into"（无连字符）和"drop-into"（含连字符）
- **影响**：可读性微小，不构成歧义
- **修订建议**：选定一种统一拼写（建议"drop-into"作为术语形式 + "drop into" 作为日常英语动词形式）

#### **P2-2：02 §11 R1 风险预留降级路径"03_tech_plan 评估降至 50 ms 或取消"未在 03 中预留 hook**

- **位置**：02 §11 R1 末尾"如显著则 03_tech_plan 评估降至 50 ms 或取消（仅依赖 12 px 翻转）"
- 03 §6.4 dwell timer 实现是 `setTimeout(80)` hardcode；无 abstraction layer / config flag / 降级 hook
- **影响**：不构成 stop-ship；R1 是"实测体感"风险，dev mode 验证后再决定。但读者循着 02 §11 找具体降级方案找不到。
- **修订建议**：03 §6.4 末尾追加一段"如 02 §11 R1 实测显著，可改为：(a) `setTimeout(50)` hardcode；(b) `setTimeout(0)` 取消 dwell（仅依赖 12 px 翻转）；(c) 提取为 `DWELL_MS` 常量便于实测调整"。

#### **P2-3：02 §2.20 标号交叉漂移（与 P1-2 同一根源延伸）**

- **位置**：02 § 编号 2.20 实际是 WCAG 2.5.7 Dragging Movements Alternative 段；§2.21 是 Anti-pattern 清单。但 §2 总数从 §2.1 ~ §2.21 = 21 节的同时，"Row Anatomy 父类有子类"在 §2.2 / "Row Anatomy 子类行" 在 §2.3 — 节标号本身合理，但 §1 → §2.20 的引用已走偏（详 P1-2）。
- **影响**：与 P1-2 修订同步处理。

#### **P2-4：03 V1 Authority Ranking 缺 R3/R4/R7**

- **位置**：03 V1 Ranking 仅列 R1/R2/R5/R6
- **影响**：03 主要素材确实来自 R1/R2/R5/R6，但 R7 → design-language.md → 03 §7 CSS 增量 这条 trace chain 缺失
- **修订建议**：03 V1 Ranking 追加 R3 / R4 / R7（标 Referential / 2026-05-04 / 各自论据来源）

#### **P2-5：02 V1 Acceptance 段标题"≥ 18 项客观可验证"，实际 22 客观 + 12 V3 + 3 主观 = 37 项**

- **位置**：02 §9 标题"## 9. Acceptance（≥ 18 项客观可验证）"
- 实际客观条件（视觉 1-12 + 行为 13-22）= 22 项；含 V3 zero-regression 22-34 项 = 34；含主观 35-37 = 37 项
- **影响**：标题"≥ 18"是保底承诺，不是错；但读者先读标题会以为只有 18 项。
- **修订建议**：02 §9 标题改为"## 9. Acceptance（22 项客观 + 12 项 V3 零回归 + 3 项主观兜底 = 37 项）"。

---

## 12. 总评打分

**对齐度（0-100）**：**88 / 100**

**一句话评语**：14 决策的核心数值与术语在三处文档中**完美一致（无 P0）**；但存在 11 项 P1 同级漂移（最重要为 V3 不变量编号偏移、cascade footprint 承诺未落地到 design-language、04 任务卡 T6 缺失 + acceptance 缺 D9/V3 回归/主观），需 V2 修订前必跑对齐 SubAgent 复检。

**扣分分布**（共扣 12）：
- P1-1（expandedSet/collapsedIds）-1
- P1-2（§2.20 vs §2.21）-1
- P1-3（V3 不变量编号偏移 22/23）-2（最高优先级 P1，因为编号引用频繁出现于 04 任务卡）
- P1-4（T5c V3 回归 + 主观兜底缺失）-1.5
- P1-5（04 T6a-T6d 任务卡缺失）-1.5
- P1-6（D9 dropdown acceptance 缺口）-1
- P1-7（design-language hierarchy 改动未落地 — cascade 承诺断裂）-2
- P1-8（02/03 Ranking 缺 design-language）-1
- P1-9（02/03 Ranking TBD 未刷新）-0.5
- P1-10（04 T1c 必读漂移）-0.5
- P1-11（03 §13 任务命名 vs 04 实际命名）-1

总：12 分扣减 / 100 → 88 / 100。

---

## 13. 要求 V2 修订

**`requires_v2_revision: true`**

V1 首版整体对齐质量很高（无 P0），但 11 项 P1 必须在进入 implementation phase 之前修订完成。理由：

1. **P1-3 V3 不变量编号偏移** 会导致 04 任务卡内"R-V3-N" 与 02 §7 "#N" 不对应——任何 SubAgent 引用编号沟通都会指错条目。
2. **P1-4 T5c 用户验收清单不全** = 用户验收时漏掉 V3 回归 + 主观兜底，等 phase 5 才发现 = 大返工。
3. **P1-5 T6a-T6d 任务卡缺失** = 25 张任务卡承诺仅 21 张实化，phase 6 评审 + commit 流程缺执行规范。
4. **P1-7 + P1-8 design-language.md V1 hierarchy 改动未落地** = 项目级 Rule 不知道 V1 引入了 `--indent-step` token + chevron 120ms inline 数字，未来 SubAgent 在 hierarchy 模块外的代码会"自创" — 违反 design-language Constraints。
5. **P1-6 D9 dropdown acceptance 缺口** = 5 处 dropdown 视觉验证无对应 acceptance 条目，dev mode 验证可能漏掉。

**修订流程**：
1. 主 Agent 修订 11 项 P1（按 §11 patch list 逐条）
2. 重新派 cascade discipline 对齐 SubAgent（即 Reviewer E V2）核查
3. 全部 P1 关闭后才进入 implementation phase（T1a 起跑）

---

## 14. Patch List（完整修订指引）

| # | 文档:位置 | 操作 | 内容 |
|---|---|---|---|
| 1 | 02 V1 §1 末尾 | **修改** | "详见 §2.20 Anti-pattern 清单" → "详见 §2.21 Anti-pattern 清单" |
| 2 | 02 V1 §3 末尾扩展点段 | **修改** | "hierarchy: { parentMap, expandedSet }" → "hierarchy: { parentMap, collapsedIds }" |
| 3 | 02 V1 §7 V3 不变量表 | **拆分 + 重编号** | 当前 #8 行（合并 DndContext + DragOverlay 两 modifier）拆为 #8 (`[snapModifier]`) + #9 (`[restrictToWindowEdges]`)；其后所有 #9~#22 重编号为 #10~#23（共 23 项），与 03 §12 + 04 R-V3-23 一致 |
| 4 | 02 V1 §9 标题 | **修改** | "Acceptance（≥ 18 项客观可验证）" → "Acceptance（22 项客观 + 12 项 V3 零回归 + 3 项主观兜底 = 37 项）" |
| 5 | 02 V1 §9 视觉客观条件 | **追加** | 在第 12 项之后追加 D9 dropdown 视觉验证条目（5 处 dropdown 树形渲染 + 父类 padding-left=16 / 子类 padding-left=32 / DOM 验证） |
| 6 | 02 V1 Authority Ranking | **追加 + 刷新** | 追加 `.claude/rules/design-language.md` Decisional 行（标 2026-05-03）；03 V1 + 04 V1 行 "TBD" → "2026-05-04" |
| 7 | 03 V1 Authority Ranking | **追加 + 刷新** | 追加 `.claude/rules/design-language.md` Decisional 行；追加 R3 / R4 / R7 Referential 行；04 V1 行 "TBD" → "2026-05-04" |
| 8 | 03 V1 §13 末尾 | **修改 + 标注** | "本节作为命名映射的 obsolete 建议（04 实际采用 T0/T1a-g/T2a-d... 命名，参 04 §1 依赖图）" |
| 9 | 03 V1 §6.4 末尾 | **追加** | 追加降级 hook 注释："如 02 §11 R1 实测显著，可改为：(a) `setTimeout(50)` hardcode / (b) `setTimeout(0)` 取消 dwell / (c) 提取为 `DWELL_MS` 常量便于实测调整" |
| 10 | 04 V1 T1c 必读 1 | **修改** | "validate_hierarchy 调用" → "手写 hierarchy 校验，复用 validate_hierarchy 部分逻辑（parent 存在 + parent.parent_id 是 None）" |
| 11 | 04 V1 T5c | **追加 V3 回归 + 主观兜底** | "完整 acceptance 清单（给用户）" 末尾追加：(a) V3 行为零回归条件 12 项（02 §9 第 23-34 项 1:1 复制） + (b) 主观感受兜底 3 项（02 §9 第 35-37 项） + (c) D9 dropdown 视觉验证条目（来自 patch #5） |
| 12 | 04 V1 §2 任务卡 | **补全** | 追加 T6a (代码审计 SubAgent) / T6b (设计还原度审计 SubAgent) / T6c (回归扫描 SubAgent) / T6d (commit + push) 四张完整任务卡（参照 T0 任务卡模板：必读上下文 + 实现要求 + 验证标准 + 模型 Opus + 模式 blocking） |
| 13 | design-language.md | **追加 hierarchy 段** | 在 "Constraints / Duration tokens" 段：(a) 加入 `--indent-step: 16px`（命名 `--sidebar-indent-step` 或与 02/03 保持一致 `--indent-step`，由项目 token convention 决定）；(b) "Allowed inline easing" 决定 chevron 120ms 是新增 `--duration-disclosure-rotate: 120ms` token 还是显式声明 inline 120ms 允许；(c) "Constraints / Sizes & spacing" 或独立 "Hierarchy 视觉一致性" 段：chevron disclosure 范式（10×10 / 仅有子类时渲染 / hit-target 16px）+ drop-into 范式（12 px X 阈值 + 80 ms dwell + indicator 缩进表达 + max depth=2 硬约束）+ 子类视觉权重等同父类（D11） |
| 14 | （所有文档） | **统一术语** | "drop into" / "drop-into" → 选定单一拼写（建议 "drop-into"）— 全文 sed 替换 |
| 15 | 03 V1 cascade footprint 段 | **追加 design-language 改动声明** | "本 V1 直接驱动 04_implementation_plan.md V1 任务卡 + design-language.md V1 hierarchy 段（详见 patch #13）"（如 patch #13 与 03 V2 同时落地） |

---

## 15. 总结（cross-document-cascade-discipline 视角）

V1 首版的对齐质量值得 88 分。所有"硬数值 + 决策选定值 + 术语主词"在三处文档中保持一致——这表明主 Agent 在 wave 1 → wave 2 之间**有意识地把 cascade footprint 提前在 _synthesis_decisions §4 中声明**，并把 14 决策定锤值精准下游传递到 02/03/04。这正是 cross-document-cascade-discipline.md 的"declare cascade footprint in revision history"原则的良好实践。

但 11 项 P1 漂移说明：**cascade 声明很到位，cascade 实际落地仍有缺口**。最关键的是 design-language.md cascade 承诺未实际落地（patch #13）+ V3 不变量编号偏移（patch #3）+ T6 任务卡缺失（patch #12）—— 这三项一旦不修订，未来 SubAgent 在 implementation phase 极易踩坑。

**V2 cascade gate 必跑**：本评审产物本身充当 V1 首版的 cascade alignment 基线；**V2 任何修订**（无论 02 / 03 / 04 / design-language）都必须再跑一次本 SubAgent（Reviewer E V2）核查 cascade footprint 与实际是否一致。Sidebar-reorder 项目教训（cascade discipline.md 第 32-43 行）：V2→V3 cascade 不全曾让一个 SubAgent 引入 3 个 P0；V1 已设好 cascade 基线，V2 必须严格沿用本评审基线。

---

**Confidence**: 92/100

**Confidence 折扣来源**:
- 6 点：未做穿透核查 R1-R7 报告内具体段落（如 03 引用 R2 §6.2 时仅靠 _synthesis §0 已读 checklist 推测存在），实际是否字字一致需在 V2 alignment 时补穿透。
- 2 点：design-language.md 是否需要更新为 V1（patch #13 / P1-7）取决于项目对"项目级 Rule 跨任务复用"的严格程度——理论上可接受 Rule 保留为 V3 时期版本不动，让本任务的 hierarchy 视觉规则只在 02/03 中存在；但 04 V1 Authority Ranking 已显式引用它做 T3b "Required reading"——这是判定为 P1 而非 P2 的依据。

**给 V2 cascade gate 的 1-2 句关键 takeaway**:

1. **本任务 V1 三文档对齐核心质量优秀（无 P0）**——主 Agent 通过 _synthesis §4 cascade 表把 14 决策精准下游传递；V2 任何决策修订都必须先更新 _synthesis_decisions（最高权威）+ 在自身 Revision History 显式 cascade footprint 表，再让本 Reviewer E 做对齐核查。
2. **V1 收尾必须做的 11 项 P1 修订（patch #1-#15）已列入 §14 patch list**——其中 patch #3（V3 不变量编号统一）/ #12（04 T6a-d 补全）/ #13（design-language.md hierarchy 段追加）三项最关键，缺其中任一会让 implementation SubAgent 误认 V3 不变量、缺 phase 6 流程、自创 token = 三种 P0 风险。
