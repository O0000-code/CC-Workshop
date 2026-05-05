# V2 Patch Plan — 主 Agent 跨评审整合

> **作者**：主 Agent。  
> **基于**：Reviewer A / B / C / D / E / F 6 份评审。  
> **目的**：dedup 17 项原始 P0 → 15 unique；明确每条 P0 在哪个文件修；为 V1 → V2 patch SubAgent 提供执行清单。

## 0. 评审分汇总

| Reviewer | 角度 | 分数 | P0 数 | P1 数 | Require V2 |
|---|---|---|---|---|---|
| A | Design Apple-grade | 87 | 5 | 8 | yes |
| B | HCI / 交互 | 78 | 4 | 8 | yes |
| C | Rust/Tauri 后端 | 85 | 2 | 5 | yes |
| D | dnd-kit + 前端 | 83 | 2 | 5 | yes |
| E | 跨文档对齐 | 88 | 0 | 11 | yes |
| F | Migration 安全 + 回归 | 62 | 4 | 7 | yes |

**所有 6 名都要求 V2 修订**。最严是 Reviewer F（62）— 数据安全角度发现 4 个 stop-ship。  
**接近 10/10 = false**，必须修订。

## 1. 15 个 unique P0（dedup 后）

> 命名约定：`P0-cat-N`，cat ∈ {ARCH 架构 / DATA 数据安全 / VIZ 视觉 / HCI 交互}。

### 架构类（3 项）

| ID | 标题 | 来源 | 一句话描述 | 主修文件 | 副修文件 |
|---|---|---|---|---|---|
| **P0-ARCH-1** | treeKeyboardCoordinates API 误用 | B P0-1 / D P0-1 | `currentCoordinates.x` 是屏幕绝对坐标，不是累积 drag delta；缺 `event.preventDefault()` + `MutableRefObject` channel；需对照官方 dnd-kit Tree example 重写 | 03_tech_plan §5.1.B / §6 | 02 §3 / 04 T2d / T3a |
| **P0-ARCH-2** | arrayMove(flattened, …) 让 children 在 backend Vec 末尾错序 | D P0-2 / F P0-F1 | 父类拖动时 `flattenedItems = removeChildrenOf(baseFlat, [activeId])` 已移除子项；arrayMove 后送 backend `apply_reorder` 把 children append 到末尾 | 03 §5.2 / §6.1 | 04 T3a 验证 |
| **P0-ARCH-3** | onDragEnd 双 IPC stale ordered_ids | F P0-F2 | `setCategoryParent` + `reorderCategories` 都进 enqueueReorder 队列；reorder 的 ordered_ids 基于 set parent **之前**的 flat → 串行执行后第二次 IPC 用 stale 数据 | 03 §4.4 / §5.2 | 04 T2a / T3a |

### 数据安全类（4 项）

| ID | 标题 | 来源 | 一句话描述 | 主修文件 | 副修文件 |
|---|---|---|---|---|---|
| **P0-DATA-1** | Migration flag 与 settingsStore.saveSettings 撞车 | C P0-1 | `has_completed_category_id_migration: bool` 加 AppSettings；前端 saveSettings 显式 enumerate 字段，不在 list → 每次保存设置 → IPC payload 缺 flag → serde default false → 重启再次跑迁移（虽 idempotent 但冗余） | 03 §3.7 / §4.10 | 04 T1e / T2a |
| **P0-DATA-2** | delete_category cascade-promote 同名碰撞 | C P0-2 | child name 与现有 root names 冲突时 cascade-promote 后两个 root 重名 → name-based 引用解析歧义（autoClassify / Skill.category）+ UI 困惑 | 03 §3.6 | 04 T1d |
| **P0-DATA-3** | Migration 失败仍写 flag = true | F P0-F3 | `migrate_category_id_for_skills_mcps` 失败仅 warn，仍写 `hasCompletedCategoryIdMigration = true` → 失败迁移永久跳过 | 03 §4.10 | 04 T1e / T2a |
| **P0-DATA-4** | T3e 漏 CreateSceneModal | F P0-F4 | T3e 列 5 dropdown 漏 `src/components/scenes/CreateSceneModal.tsx:447`（uniqueCategories 仅按 name 提取）→ V1 落地后允许重名子类 → 用户选 "Stripe" 看到混合内容 | 04 T3e + T3f | 03 §5.9 dropdown 列表 |

### 视觉类（5 项）

| ID | 标题 | 来源 | 一句话描述 | 主修文件 | 副修文件 |
|---|---|---|---|---|---|
| **P0-VIZ-1** | Drop indicator 几何描述错位 | A P0-1 | V1 §2.7 用 `left = row.left + 18px` / `width = row.width - 20px`，但 `.drop-indicator-h`（src/index.css:651-660）实际是 block + `margin: 0 2px` + transform 驱动；Acceptance §9 第 6/7/8 项不可机械验证 | 02 §2.7 / §6.3 | 03 §7 CSS |
| **P0-VIZ-2** | Chevron click 与 row dnd hit-target 占用悖论 | A P0-2 | chevron `<button>` keyboard 路径未说明（Tab 进 chevron 后 Space 触发什么）；onKeyDown stopPropagation 是否需要；dnd-kit listeners chain（V3 §P0-2 教训）未吸收 | 02 §2.4 + §3 | 03 §5.3 / §6 / 04 T3b |
| **P0-VIZ-3** | localStorage 语义反转 | A P0-3 | R3/R4 提的是 `expandedCategories` 集合；V1 改为 `collapsedCategories` 但 §2.15 行为口径未对齐：创建新子类 → 父自动展开（在新模型下要 `delete(parentId)`，V1 没说）；onDragStart "覆盖渲染"与 collapsedCategories 集合的合并语义未明 (OR/AND) | 02 §2.15 | 03 §5.2 / 04 T2c |
| **P0-VIZ-4** | Dwell 边界状态机不全 | A P0-4 | V1 §2.14 + §6.3 没回答 dragOffset.x 在 ±12px 边界抖动时（用户回退、over row 切换）的清零规则；opacity 0.95↔0.5 是瞬时还是 fade 未明 | 02 §2.14 / §6.3 | 03 §5.2 / §6.4 |
| **P0-VIZ-5** | DragOverlay padding 是 component 实现而非 spec 隐含 | A P0-5 | V3 不变量 #20 ("DragOverlay 不带原位 padding") 是 V1 二次推断，违反 verify-third-party-behavior-firsthand；事实是 `DragOverlayCategoryRow.tsx:21` className 写死 `px-2.5`，应作 spec 明示 | 02 §2.5 + §7 #20 | 03 §5.5 |

### HCI 类（3 项）

| ID | 标题 | 来源 | 一句话描述 | 主修文件 | 副修文件 |
|---|---|---|---|---|---|
| **P0-HCI-1** | Apple HIG Outline Views 引证缺失 | B P0-2 | V1 §3 提 ←/→ promote/demote 但缺 Apple HIG Outline Views 关于 browse-mode ←/→ collapse/expand 的引证（NSOutlineView 默认行为是同方向 collapse/expand 同级） | 02 §3 / §10 | design-language §macOS-native |
| **P0-HCI-2** | ContextMenu Move to Parent 路径未规格 | B P0-3 | V1 §2.20 把 secondary menu / Modal path 全部 deferred 到 03_tech_plan，但 03 不做 UX 决策 → WCAG 2.5.7 alternative path 未规格 | 02 §2.20 + §3 | 04 T3b |
| **P0-HCI-3** | 父类删除无 confirmation dialog | B P0-4 | cascade-promote 不可逆 + 数据丢失风险；Norman 防误操作；Things/Notes/Finder 都有确认 | 04 T1d / T3b 任务卡 ContextMenu | 02 §2.21 + 03 §3.6 |

## 2. P1 整合（11 个跨文档关键 P1）

> 仅列被 ≥ 2 个 reviewer 提及或对实施有阻塞性的 P1，其它详查各 reviewer patch list。

| ID | 标题 | 来源 | 主修文件 |
|---|---|---|---|
| **P1-1** | V3 不变量编号偏移：02 §7 列 22 项 vs 03 §12 列 23 项 | E P1 | 02 §7 拆开重编号 |
| **P1-2** | 04 §1 承诺 25 任务卡，§2 仅 21 张（漏 T6a/T6b/T6c/T6d） | E P1 | 04 §2 补 4 张任务卡 |
| **P1-3** | design-language.md cascade footprint 未实施（缺 hierarchy Principle、`--indent-step` token、chevron 120ms 关系） | E / A P1 | design-language.md 增量 |
| **P1-4** | 5 dropdown 实际是 6+（含 SkillsPage / SkillDetailPage / McpServersPage / McpDetailPanel / SkillDetailPanel / ClaudeMdDetailPanel + CreateSceneModal） | C P1-2 / F | 03 §5.9 + 04 T3f 重新清单 |
| **P1-5** | `update_skill_metadata` / `update_mcp_metadata` 不持 DATA_MUTEX → V1 hierarchy 引入后 race 窗口放大 | C P1-1 / F P1-F1 | 03 §3.1 / 04 T1f 加锁 |
| **P1-6** | `Option<Option<T>>` 简化丢失"不修改 vs 显式清空"语义 | C P1-3 | 03 §3.6 set_category_parent + update_category 签名 |
| **P1-7** | reorderCategories 失败 fallback 应优先 `get_categories` | C P1-4 | 03 §4 |
| **P1-8** | dwell ≤ 600ms 总时长 + retreat 路径 + 80ms 是否过长 实测 | B P1 | 02 §2.14 加测试要求 |
| **P1-9** | T3e/T3f 缺 V3 行为零回归 12 项 + 主观感受 3 项 | E | 04 T5c 用户验收清单 |
| **P1-10** | `src/components/sidebar/SortableCategoryRow.tsx` baseStyle 缺 `padding-left` transition string → drop completion 瞬时 snap | D P1 | 03 §5.3 |
| **P1-11** | onDragStart 全展开未反映在 flattenedItems → dragOverrideExpand state 缺失 | F P1-F7 | 03 §5.2 |

## 3. V2 修订决策（主 Agent 必须明确锁定）

下列冲突 / 选择是 V2 必须做的关键决策，由主 Agent 直接定锤：

### 3.1 localStorage 语义（P0-VIZ-3）

**决策**：取 R3/R4 原稿 `expandedCategories: Set<string>` 命名（默认包含所有有 children 的父类）；用户折叠时 `delete(parentId)`，展开时 `add(parentId)`。

**理由**：
- 与 R3/R4/V1 §2.15 "默认展开" 语义对齐：set 包含 = 展开，set 不含 = 折叠
- 创建新子类时父类自动展开 = `expandedSet.add(parentId)`（直觉 + 不需要"反向语义"）
- 拖动开始时 dragOverrideExpand = `expandedSet ∪ {allParentsAlongDragPath}` 临时值，drop 后恢复 expandedSet
- 减少 V1 推断的"覆盖渲染" + "OR/AND 合并" 模糊性

### 3.2 Chevron keyboard 路径（P0-VIZ-2）

**决策**：
- chevron `<button data-no-dnd="true" onMouseDown={(e) => e.stopPropagation()}>` 三层防御
- chevron 自身 Tab 可达，Space/Enter 触发 toggle
- chevron 与 row 共用一个 `<div role="button" tabIndex={0}>` 时，Tab 顺序：row → chevron（如果存在） → 下一 row（不进入折叠的子类）
- 当用户在 row 上按 Space/Enter 时不 toggle chevron（沿用现有 row click 导航）；chevron toggle 仅由 chevron 自身的 onClick 触发

### 3.3 Migration flag 存放位置（P0-DATA-1）

**决策**：把 `has_completed_category_id_migration: bool` 移到 `AppData`（不放 AppSettings）。

**理由**：
- AppData 已经有完整 serde + DATA_MUTEX 协议
- 绕过 frontend `settingsStore.saveSettings` 显式 enumerate 风险
- 与 `imported_plugin_skills` / `imported_plugin_mcps` 等 V3 已存在的 "完成状态" flag 同位一致
- 测试隔离 + ScopedDataDir 已支持

### 3.4 Migration 失败行为（P0-DATA-3）

**~~决策（V2 草稿，已被 Phase-1 audit P0-1 推翻）~~**：
- ~~任一 orphan → flag 不写 true~~

**最终决策（Phase-1 audit P0-1 ruling，2026-05-04，按 03 V2 §3.4）**：
- orphan 是终态（用户必须手动 rename / re-classify），重跑迁移每次启动都做无意义；
- migration 走完一遍 → flag = true 一律写入；
- orphan 列表通过 `MigrationReport.orphaned_*: Vec<String>` 暴露给前端 UI；
- 真正失败仅指 `write_app_data` / DATA_MUTEX poisoning → IPC 返回 Err → frontend 不写 flag → 下次启动重试。
- 与 _v2_patch_plan §3.4 V2 草稿措辞冲突；本节内容为最终。

### 3.5 Cascade-promote 同名碰撞（P0-DATA-2）

**决策**：在 cascade-promote 时检查冲突，**重命名为 `<原名> (<父类名>)`** disambiguate。

**示例**：`root: Web | Tools/Web`，删 Tools → cascade-promote `Web` 检测到 root 已有 `Web` → 重命名为 `Web (Tools)` → root: `Web | Web (Tools)`。

**理由**：
- 不静默丢弃信息（保留 child 的存在）
- 名字回溯到原父类语义（用户能看出来源）
- 如用户不喜欢可手动 rename
- backend 写日志记录 disambiguation

### 3.6 父类删除 confirmation dialog（P0-HCI-3）

**决策**：父类有 children 时弹 confirmation dialog（标题："Delete '{parentName}'?"，正文："{parentName} contains {N} sub-categor{y/ies}. Sub-categories will be promoted to root level. This cannot be undone." 主按钮："Delete"，次按钮："Cancel"）。

**实现**：在 ContextMenu Delete handler 中检测 children 后才弹（无 children 时直接删，与现有行为一致）。

### 3.7 ContextMenu Move to Parent（P0-HCI-2）

**决策**：父类 ContextMenu 增加 "Promote to root" 项（仅子类显示）；不实现 "Move to Parent..." submenu（推迟到 v2，避免实现复杂度，因为子类拖入新父类已通过 X 阈值实现）。

### 3.8 Drop indicator 实现（P0-VIZ-1）

**决策**：取 V3 已有 `.drop-indicator-h` block + `margin: 0 2px` + transform 驱动方案（不要 absolute left/width）。

**hierarchy 表达**：缩进时通过 wrapper `<div style={{ paddingLeft: depth * 16 }}>` 让 indicator 自然继承缩进；不修改 indicator 自身几何。

### 3.9 DragOverlay padding（P0-VIZ-5）

**决策**：02 §7 V3 不变量 #20 重新表述为：「DragOverlay 显示与 inline row 同 padding（含 `px-2.5` 与 hierarchy 缩进）」+ link 到 `DragOverlayCategoryRow.tsx:21` 实现引证（verify-third-party-behavior-firsthand）。

不需要任何代码改动；只是 spec 要修正措辞。

### 3.10 dwell 状态机（P0-VIZ-4）

**决策**：完整状态机定义在 02 §2.14 重新写：

```
state OUT { dwell timer = idle, pending depth = baseline }
state HOVER_NEAR (X ≥ 12px on over row) { dwell timer = 80ms countdown, pending depth = parent }
state DROP_INTO_READY (timer expired) { drop indicator缩进 + parent row hover bg }

transitions:
  OUT → HOVER_NEAR: dragMove with X ≥ 12 + over row exists
  HOVER_NEAR → OUT: dragMove with X < 12 (cancel timer)
  HOVER_NEAR → DROP_INTO_READY: timer expires
  DROP_INTO_READY → HOVER_NEAR: X 重新 < 12 (revert visual, dwell timer 重新 idle)
  HOVER_NEAR → HOVER_NEAR (new over row): cancel timer + restart 80ms
  any → OUT: dragCancel | dragEnd
```

opacity 0.95 ↔ 0.5：仅在 cancel 状态下用，与 V3 一致；dwell 阶段 opacity 不变 0.95。

### 3.11 V3 不变量编号统一（P1-1）

**决策**：02 V2 §7 拆开列 23 项（与 03 §12 一致）：将原 #8 拆为 #8 (DndContext modifiers = [snapModifier]) + #9 (DragOverlay modifiers = [restrictToWindowEdges])，后续编号顺延。

### 3.12 Apple HIG Outline Views 引证（P0-HCI-1）

**决策**：02 V2 §3 在键盘流段加上引证：

> macOS NSOutlineView 默认 ←/→ 在 disclosure 模式下 collapse/expand；在拖拽模式下我们用 ←/→ 表达 promote/demote，与 Outline Views 设计哲学一致（横向方向键 = 层级方向）。引证：[Apple HIG Outline Views](https://developer.apple.com/design/human-interface-guidelines/outline-views)。

## 4. V2 patch 任务划分

### W6-A：02_design_spec V1 → V2

**主修 P0**：P0-VIZ-1, P0-VIZ-2, P0-VIZ-3, P0-VIZ-4, P0-VIZ-5, P0-HCI-1, P0-HCI-2  
**主修 P1**：P1-1, P1-8  
**输出**：`/Users/bo/Documents/Development/Ensemble/Ensemble2/.dev/category-hierarchy/02_design_spec.md` 替换为 V2  
**Revision History 必须**：列出 V1 → V2 的 cascade footprint（哪些 §X 改了 + 影响 03/04 的哪些 §Y）

### W6-B：03_tech_plan V1 → V2

**主修 P0**：P0-ARCH-1, P0-ARCH-2, P0-ARCH-3, P0-DATA-1, P0-DATA-2, P0-DATA-3, P0-DATA-4 (副)  
**主修 P1**：P1-4, P1-5, P1-6, P1-7, P1-10, P1-11  
**输出**：`/Users/bo/Documents/Development/Ensemble/Ensemble2/.dev/category-hierarchy/03_tech_plan.md` 替换为 V2  
**Revision History 必须**：列出 V1 → V2 的 cascade footprint

### W6-C：04_implementation_plan V1 → V2

**主修 P0**：P0-DATA-4, P0-HCI-3 (任务卡 + acceptance)  
**主修 P1**：P1-2, P1-3, P1-9  
**输出**：`/Users/bo/Documents/Development/Ensemble/Ensemble2/.dev/category-hierarchy/04_implementation_plan.md` 替换为 V2

### W6-D：design-language.md 增量

**主修**：P1-3 — 加 1 条 hierarchy Principle "Hierarchy is expressed by position, not by decoration"；说明 chevron 120ms 与现有 `--ease-drag` 关系（不引入新 token）；加 anti-pattern "Don't add indent guide lines or color-fade child swatches"（per D11）  
**输出**：`/Users/bo/Documents/Development/Ensemble/Ensemble2/.claude/rules/design-language.md` 微调（保持 < 200 行）

## 5. patch 顺序与并行策略

W6-A、W6-B、W6-D **可同时并行**（同一条消息 3 个 SubAgent）；它们之间的 cascade 由 §3 决策表统一锁定，避免 race。

W6-C **严格在 W6-A + W6-B 完成之后**（W6-C 需引用最新 §X 编号）。

## 6. V2 完成后的对齐复检

W6-A/B/C/D 全部完成后，主 Agent 必须：
1. 派一个独立 alignment SubAgent（参 cross-document-cascade-discipline）扫描 02 V2 + 03 V2 + 04 V2 + design-language.md 一致性，输出 `_v2_alignment_check.md`
2. 主 Agent 亲眼复核以下高风险点：
   - 14 决策的数值在 02 V2 / 03 V2 / 04 V2 完全一致
   - V3 不变量 23 项在 02 V2 §7 / 03 V2 §12 / 04 V2 任务卡引用一致
   - migration flag 位置 + 失败行为在 03 V2 + 04 V2 一致
   - cascade-promote 重命名规则在 03 V2 + 04 V2 一致
3. 若发现 P0 → 回 W6 修订；若仅 P1 → 标记 backlog 进 Plan
4. 接近 10/10（≥ 95 综合分）→ 进 ExitPlanMode

## 7. 给 W6 SubAgent 的 takeaway

- **不要重新评估 14 决策**（仍锁定）
- **不要重新评估 §3 V2 修订决策**（这些都已锁）
- W6 任务是**精确执行 patch**，不发明新方案
- 任何与 §3 决策矛盾的修订都需向主 Agent 提 P0 警告，不要默默改
- Revision History 必须列 cascade footprint（参 cross-document-cascade-discipline.md）
- 全文版本（不是 diff），因为 V1 → V2 改动较多 patch 散布
