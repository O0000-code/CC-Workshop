# Category Hierarchy — Technical Plan V2

> **Decisional 文档**。技术细节冲突时以本文档为准；视觉/动效冲突按 `02_design_spec.md` V2。
> 本文档全程沿用 `.dev/sidebar-reorder/03_tech_plan.md` V3 的章节结构与措辞风格——这是项目内已经验证过的高质量模板。
> 实施步骤拆分由 `04_implementation_plan.md` V2 决定；本文档仅给出"改什么、怎么改"。

## Revision History

**V2（2026-05-04）—— V1 → V2 cascade footprint**

V1 经 6 名 reviewer（A 设计 / B HCI / C Rust+Tauri / D dnd-kit+前端 / E 跨文档对齐 / F migration+回归）评审后命中 7 个 P0 + 6 个 P1 后端/前端架构修订。V2 锁定如下修订（决议见 `05_review/_v2_patch_plan.md` §3）：

**P0 修订（7 项）**：

- **[P0-ARCH-1] §5.1.B + §6.2** — `treeKeyboardCoordinates` 重写为 `MutableRefObject<{items, offset}>` SensorContext 通道（不用 callback、不用 `currentCoordinates.x`）；`event.preventDefault()` 显式调用；按 dnd-kit 官方 `clauderic/dnd-kit/stories/3 - Examples/Tree/SortableTree.tsx` 一手模板重写。证据 link：`node_modules/@dnd-kit/core/dist/sensors/keyboard/types.d.ts:18-22` + `node_modules/@dnd-kit/sortable/dist/sortable.esm.js:655-720`。
- **[P0-ARCH-2] §5.2 + §6.1** — `onDragEnd` reorder 路径不再用 `arrayMove(flattenedItems, ...)`（`flattenedItems` 已被 `removeChildrenOf` 移除 active subtree）；改为基于 `baseFlat` 的 subtree splice 算法，保证 active 父类的 children 紧跟其后送入 backend `apply_reorder` 的 ordered_ids，不被冲到 Vec 末尾。
- **[P0-ARCH-3] §4.4 + §5.2** — 双 IPC stale ordered_ids 修复：`onDragEnd` 中 `setCategoryParent` 必须 await 完成后才基于 fresh `categories` 计算 `reorderCategories` 的 ordered_ids；同时基于 fresh state 重组完整 ordered_ids（含所有 children）。
- **[P0-DATA-1] §3.3 + §4.10** — Migration flag `has_completed_category_id_migration: bool` 从 `AppSettings` 移到 `AppData`（与 `imported_plugin_skills` 等 V3 已有 flag 同位），绕过 `settingsStore.saveSettings` 显式 enumerate 风险（V1 路径下用户每次改 setting 都会让 flag 被 serde default 重置为 false → 冗余 migration）。
- **[P0-DATA-2] §3.3.4** — `delete_category` cascade-promote 同名碰撞处理：促升至根时若 child name 与现有 root names 冲突，自动重命名为 `<原名> (<父类名>)`，必要时附数字后缀；记录 disambiguation 日志。
- **[P0-DATA-3] §3.4 + §4.10** — Migration 失败行为：仅当一次性迁移成功（IPC 返回 Ok 且 backend 写 flag）才推进；任一 skill/mcp 找不到 category_id 时记录日志并**不写 flag**，下次启动重试（idempotent 安全）。
- **[P0-DATA-4 副修] §5.9** — Dropdown 改造列表完整化：补上 `CreateSceneModal.tsx` + `SkillsPage`、`SkillDetailPage`、`McpDetailPanel` 的完整 6+ 处枚举（V1 §5.9 仅列 3 处）。

**P1 修订（6 项）**：

- **[P1-4] §5.9** — Dropdown 改造完整列表（与 P0-DATA-4 同源）。
- **[P1-5] §3.1 + §3.6** — `update_skill_metadata` / `update_mcp_metadata` 加 DATA_MUTEX 持锁（5 LoC + 测试）；本任务一并修复，不再标"现状缺口"。
- **[P1-6] §3.6** — `update_skill_metadata` / `update_mcp_metadata` 与 `set_category_parent`、`update_category` 签名恢复 `Option<Option<T>>` 表达"不修改 vs 显式清空"语义。
- **[P1-7] §4.4 + §4.3** — `reorderCategories` / `setCategoryParent` 失败 fallback 优先 `get_categories`（避免 set_parent 成功 + reorder 失败的不一致）。
- **[P1-10] §5.3** — `SortableCategoryRow` baseStyle `transition` 字符串追加 `padding-left 220ms cubic-bezier(0.16, 1, 0.3, 1)`，drop completion 不瞬时 snap。
- **[P1-11] §5.2** — `onDragStart` 全展开反映在 `flattenedItems`：增加 `dragOverrideExpand: boolean` state（per 02 V2 §2.15 锁定的 `expandedCategories` 语义 — set 包含 = 展开，set 不含 = 折叠）。

**附加修订**：

- **[P0-VIZ-2 副修] §5.3 + §5.5** — Chevron click listeners chain（V3 P0-2 教训吸收）：`data-no-dnd="true"` + `onMouseDown stopPropagation` + `onClick stopPropagation` 三层防御。
- **[P0-VIZ-4 副修] §5.2 + §6.4** — Dwell timer 状态机按 02 V2 §2.14 锁定的 OUT / HOVER_NEAR / DROP_INTO_READY 三态实现。
- **§12 V3 不变量核对** — 维持 23 项与 02 V2 §7 编号一致。
- **DATA_MUTEX 协议覆盖核查** — §3.1 grep 重新枚举 + 列入 `update_skill_metadata` / `update_mcp_metadata` 加锁。
- **localStorage 语义反转** — `expandedCategories: Set<string>` 命名（与 02 V2 §2.15 一致，不再用 V1 的 `collapsedCategories`），见 §5.2。

**Cascade footprint（V1 → V2 影响下游）**：

- 影响 `02_design_spec.md` V2 §2.4（chevron listeners chain 三层防御）+ §2.7（drop indicator block + transform 驱动）+ §2.14（dwell 状态机）+ §2.15（expandedCategories 语义）+ §7（V3 不变量编号 23 项）。
- 影响 `04_implementation_plan.md` V2 任务卡 T1a（AppData 加 flag 字段，不再改 AppSettings）+ T1c（set_category_parent + Option<Option<T>>）+ T1d（cascade-promote disambiguation）+ T1e（migration 写 backend flag，前端不写 settings）+ T1f（update_skill/mcp_metadata 加锁 + Option<Option<T>>）+ T2a（initApp 流程改：read AppData.hasCompletedCategoryIdMigration）+ T2b（autoClassify dual-write 循环内 fresh snapshot）+ T3a（onDragEnd subtree splice + 串行 IPC + dragOverrideExpand）+ T3b（SortableCategoryRow paddingLeft transition + chevron 三层防御）+ T3e（dropdown 6 处而非 5 处，含 CreateSceneModal）+ T5a（concurrent_update_metadata_and_reorder_no_lost_update 测试）。

**V1（2026-05-04，首版）**

- 基于 `_synthesis_decisions.md` §3 的 14 决策定锤 + 02_design_spec V1 的视觉/动效契约 + R1/R2/R5/R6 的调研论据落地为可实施的技术架构。
- 完全保留 V3 sidebar-reorder 的全部不变量（详 §12 V3 不变量保留核对清单，逐项标注本任务方案如何**不破坏**每一项）。
- 新增 hierarchy 专属技术架构：`Category.parent_id` 字段、`Skill/McpServer/SkillMetadata/McpMetadata` 双字段（`category` cached display + `category_id` SoT）、`set_category_parent` IPC、`migrate_category_id_for_skills_mcps` 一次性迁移命令、`validate_hierarchy` 后端硬验证、dnd-kit 单 SortableContext + 投影深度的树形架构。
- **零新依赖**（dnd-kit 库选型与 V3 一致；不引入 `dnd-kit-sortable-tree` 等 wrapper）。
- cascade footprint 声明：本 V1 直接驱动 `04_implementation_plan.md` V1 的任务卡（T-DM-1 ~ T-FE-7）+ 测试矩阵；不影响 02_design_spec V1（视觉/动效已锁定）。

## Document Authority Ranking

按 `~/.claude/rules/document-authority-ranking.md`：

| Level | Document | Last Modified | Purpose |
|---|---|---|---|
| Decisional | `_synthesis_decisions.md` | 2026-05-04 | 14 决策定锤（D1–D14）— 最高权威 |
| Decisional | `_v2_patch_plan.md` | 2026-05-04 | V2 修订决议（§3 锁定 7 P0 + 6 P1 修订点） |
| Decisional | `02_design_spec.md` V2 | 2026-05-04 | 视觉/动效/交互规格（高于 03 的视觉部分） |
| Decisional | `03_tech_plan.md` V2（**本文档**） | 2026-05-04 | 库选型 / 数据模型 / API / 架构 / 迁移 |
| Decisional | `04_implementation_plan.md` V2 | 2026-05-04 | 任务拆分与执行步骤 |
| Decisional | `.claude/rules/design-language.md` | 2026-05-04 | 项目级设计语言 Rule（每 session 自动加载） |
| Decisional | `.dev/sidebar-reorder/02_design_spec.md` V3 | 2026-05-03 | V3 视觉不变量基线（hierarchy 必须叠加在其上不破坏） |
| Decisional | `.dev/sidebar-reorder/03_tech_plan.md` V3 | 2026-05-03 | V3 技术不变量基线（DATA_MUTEX、apply_reorder pure、version 协议、enqueueReorder 队列、ENSEMBLE_DATA_DIR 测试隔离） |
| Referential | `00_understanding.md` | 2026-05-04 | 任务边界、隐含前提、风险登记 |
| Referential | `01_research/r1_data_model.md` | 2026-05-04 | D1 / D2 / D13 论据 + 完整迁移规划主要素材 |
| Referential | `01_research/r2_dnd_tree_architecture.md` | 2026-05-04 | D3 / D5 / D6 论据；dnd-kit 6.3.1 + sortable 10.0.0 一手源码事实；V3 不变量回归核对一手源 |
| Referential | `01_research/r3_visual_interaction_design.md` | 2026-05-04 | D4 视觉/动效论据 |
| Referential | `01_research/r4_hci_evaluation.md` | 2026-05-04 | D7/D8/D12 HCI 论据 |
| Referential | `01_research/r5_impact_enumeration.md` | 2026-05-04 | 影响面 grep 兜底闸（含 569 行 `categor` 命中） |
| Referential | `01_research/r6_classification_count_filter.md` | 2026-05-04 | autoClassify / count / filter 行为论据 |
| Referential | `01_research/r7_design_philosophy_distillation.md` | 2026-05-04 | 设计哲学蒸馏 |

**冲突解决规则**：
- 同级冲突 → 向用户提问（Open Question）。
- 跨级冲突 → 自动以高层为准。
- 本 V2 落地中若发现某条改动与 02_design_spec V2 冲突 → 视觉以 02 为准；技术以本 03 为准；任何越界都标记 P0 与 _synthesis_decisions / _v2_patch_plan §3 矛盾，不擅自修改决策。

---

## 1. 库选型（继承 V3 — 零新依赖）

| 用途 | 选用 | 版本 | 与 V3 差异 |
|---|---|---|---|
| 拖拽核心 | `@dnd-kit/core` | `^6.3.1` | 不变 |
| Sortable 抽象 | `@dnd-kit/sortable` | `^10.0.0` | 不变 |
| 工具函数 | `@dnd-kit/utilities` | `^3.2.2` | 不变 |
| Modifiers | `@dnd-kit/modifiers` | `^9.0.0` | 不变 |

**为什么不引入 `dnd-kit-sortable-tree` 或类似 wrapper**：
- Wrapper 会重新定义 `useSortable` / `DndContext` 调用形态，与 V3 已落地的 `SortableCategoriesList.tsx` / `SortableCategoryRow.tsx` / `snapModifier.ts` 改造路径冲突。
- 官方 `clauderic/dnd-kit/stories/3 - Examples/Tree/` 的 `SortableTree.tsx` + `utilities.ts` + `keyboardCoordinates.ts` 是 ~400 LoC 的"模式"，直接抄入项目即可（参 R2 §2 一手源码摘录），引入 wrapper 反而增加版本耦合。
- 见 R2 §3.2 阶段 1 硬约束 HC-1 ~ HC-15 全部通过单 SortableContext + 投影深度方案的论证。

**dnd-kit 源码事实引证（V2 加强）**：

- `KeyboardCoordinateGetter` 类型签名：`node_modules/@dnd-kit/core/dist/sensors/keyboard/types.d.ts:18-22`
  ```ts
  export declare type KeyboardCoordinateGetter = (event: KeyboardEvent, args: {
      active: UniqueIdentifier;
      currentCoordinates: Coordinates;
      context: SensorContext;
  }) => Coordinates | void;
  ```
  关键事实：`currentCoordinates: Coordinates` 是 `{x, y}` 屏幕**绝对坐标**（不是 drag offset 累积位移）。`context: SensorContext` 是同步可读的，含 `active / over / collisionRect / droppableContainers / droppableRects`。
- `sortableKeyboardCoordinates` 实现：`node_modules/@dnd-kit/sortable/dist/sortable.esm.js:655-720`。第 670 行 `event.preventDefault()` 在 horizontal/vertical 命中时调用——**自定义 coordinate getter 必须自己调用 `preventDefault()`**，否则 sidebar 在 focus 状态下按 ←/→ 会触发浏览器默认滚动。
- 官方 `clauderic/dnd-kit/stories/3 - Examples/Tree/SortableTree.tsx` 的 `sensorContext: SensorContext = useRef({ items, offset })` + `useEffect(() => { sensorContext.current = ... }, [...])` 同步模式 — 详 §5.1.B。

**Rust 后端**：现有 `serde@1.0.219`、`uuid@1` 不变；新增字段使用现有 `#[serde(default, skip_serializing_if = "Option::is_none")]` 模式（已在 `types.rs:24-33`、`types.rs:653-657` 等 7 处 in-tree 用过）。

---

## 2. 数据模型（**完整改造**）

> 本节落地 _synthesis_decisions §3 的 D1=A（Skills/MCPs 迁移到 categoryId）+ D2=A（Category 加 parent_id）+ D13=A+B（后端硬验证 + 前端 prevent + delete cascade-promote）。

### 2.1 D2=A：`Category` 加 `parent_id` 字段

**Rust 改动**（`src-tauri/src/types.rs:134-141`）：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub name: String,
    pub color: String,
    pub count: u32,
    /// Parent category id. `None` = root level. Max depth = 2 (root + children).
    /// Backward compat: serde `default` makes the absence of this key in old
    /// data.json deserialise to `None` (root). `skip_serializing_if` keeps
    /// new writes clean — root rows do NOT emit the key, matching pre-V1 JSON.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
}
```

**关键 serde 行为证据**（已在 codebase 中 in-tree 7 处使用，验证通过）：
- `types.rs:24-33`：`Skill.install_source` / `plugin_id` / `plugin_name` / `marketplace` / `plugin_enabled` 全部用 `#[serde(skip_serializing_if = "Option::is_none")]` + `Option<String>` 模式。
- `types.rs:160-175`：`AppData.imported_plugin_skills` / `claude_md_files` / `global_claude_md_id` 等字段用 `#[serde(default)]` + `#[serde(skip_serializing_if = "Option::is_none")]`，旧 data.json 反序列化为空 `Vec` 或 `None`。
- `types.rs:653`：`ClaudeMdFile.category_id: Option<String>` 已经在用 `#[serde(skip_serializing_if = "Option::is_none")]`，与新 `parent_id` 同模式。

**`#[serde(default)]` on `Option<String>` 的语义**（参 `serde-rs/serde@1.0.219` 文档 + 项目内 `types.rs:160`、`:170-172`、`:653` 现有用例）：旧 JSON 无此 key → 反序列化为 `None`，**不抛错**。

**TS 改动**（`src/types/index.ts:84-89`）：

```ts
export interface Category {
  id: string;
  name: string;
  color: string;
  count: number;
  /** Parent category id. `undefined` = root level. Max depth = 2. */
  parentId?: string;
}
```

`#[serde(rename_all = "camelCase")]` 全局生效（`types.rs:5`），Rust `parent_id` ↔ TS `parentId` 自动映射。

### 2.2 D1=A：Skills/MCPs 双字段迁移

> 关键论据：R5 grep 显示 5 个 dropdown（SkillDetailPanel / SkillsPage / SkillDetailPage / McpDetailPanel / McpServersPage）当前 `value=cat.name`，1 个（ClaudeMdDetailPanel）已经 `value=cat.id` —— 三种实体三种引用方式不统一。统一为 id 是行业最佳实践 + ClaudeMd 已经验证。

**Rust 改动**（`src-tauri/src/types.rs:4-11` + `:36-43` + `:178-188` + `:190-198`）：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,                              // KEEP — cached display name + backward compat for old data.json + LLM training sample
    /// Source of truth for category reference. `None` = uncategorized OR
    /// not-yet-migrated (legacy data.json). UI prefers this over `category`.
    /// Note: Skill is runtime-derived (built by scan_skills from skill_metadata
    /// + filesystem) — not directly persisted in data.json. The persisted SoT
    /// is `SkillMetadata.category_id` (§2.2 lower section).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,                   // NEW (SoT, runtime)
    pub tags: Vec<String>,
    // ... 其余 14 个现有字段不变
}

// McpServer 同样的字段加法（types.rs:36-72）
pub struct McpServer {
    // ...
    pub category: String,                              // KEEP
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,                   // NEW (runtime, mirrors McpMetadata.category_id)
    // ...
}

// SkillMetadata（types.rs:178-188 持久化字段，写入 data.json 的 skillMetadata map）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SkillMetadata {
    pub category: String,                              // KEEP
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,                   // NEW — SoT persisted layer
    pub tags: Vec<String>,
    pub enabled: bool,
    pub usage_count: u32,
    pub last_used: Option<String>,
    pub icon: Option<String>,
    pub scope: String,
}

// McpMetadata（types.rs:190-198）— 对称改动
pub struct McpMetadata {
    pub category: String,                              // KEEP
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,                   // NEW
    // ...
}
```

> **关键澄清（V2 加强 — Reviewer C P2-4 反馈吸收）**：`Skill` / `McpServer` 不是 data.json 中持久化的对象，而是 `scan_skills` / `scan_mcps` 在 IPC 调用时**实时从 metadata + 文件系统拼装**出来的。data.json 的 SoT 是 `skill_metadata.category_id` / `mcp_metadata.category_id` 一个真值——不存在双 SoT 数据 corruption 问题。旧 data.json 没 `skill_metadata.category_id` → `metadata.and_then(|m| m.category_id.clone())` → `None` → `Skill.category_id = None`。前端 dual-read 路径从 `skill.category` (cached name) fallback。

**双字段共存策略**（dual-write、prefer-id-on-read）：

| 操作 | 行为 |
|---|---|
| **写入路径**（autoClassify / Dropdown change / 用户手动改）| `category_id` 写为目标 category 的 id；`category` 写为目标 category 当前的 name（cached display + backward compat 给 v1 之前的代码）|
| **读取路径**（filter / display / count）| 优先 `category_id`：`category_id ? categories.find(c => c.id === id)?.name : skill.category`；找不到 id 时（被删除）退化到 `category` 字段做 fallback display |
| **重命名 category 后**| `Category.name` 变 → 所有 Skill/Mcp 通过 `category_id` 自动看到新名字；`Skill.category` 字段保留旧 cached name 不主动同步（节省并发改写成本；下次 metadata 写入时被覆盖）|
| **数据 corruption fallback** | **正常路径下不会发生**（cascade-promote 保证 child id 不消失）；**但若发生**（用户手工编辑 data.json / 跨版本数据导入），display 自动 fallback 到 cached `category` name；最终若仍找不到则显示 "Uncategorized"。 |

**TS 改动**（`src/types/index.ts:4-27` + `:29-55`）：

```ts
export interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;          // KEEP
  categoryId?: string;       // NEW
  tags: string[];
  // ... 其余字段不变
}

export interface McpServer {
  id: string;
  name: string;
  description: string;
  category: string;          // KEEP
  categoryId?: string;       // NEW
  // ...
}
```

**ClaudeMdFile 不动**（`types.rs:653` 已经是 `category_id: Option<String>`，`src/types/claudeMd.ts:54` 已经是 `categoryId?: string`）。

### 2.3 max depth = 2 硬约束（**5 处 clamp 同步**）

> 关键风险：R2 §10 U1 — clamp 必须在 5 处同步落地，单点缺失 = depth=2 节点漏入数据。

| # | 位置 | clamp 实现 |
|---|---|---|
| 1 | **后端 validator**：`set_category_parent` / `add_category` 命令内（§3.3）| `validate_hierarchy(...)` 函数检测 `new_parent.parent_id.is_some()` → reject `"Hierarchy depth limit exceeded (max 2)"` |
| 2 | **后端 apply_reorder hierarchy guard**：`reorder_categories` 命令内 | 接收的 ordered list 本身不变（只换顺序），但同时附带 `parent_id` 改动时（如果 04 选用 `reorder_categories_with_hierarchy` 单一 IPC）必须 validate 每条 entry 的 `parent_id`。**V2 决策**：保留语义分离（reorder 不改 parent_id），仅由 `set_category_parent` 改 parent — 即 #2 在 V2 路径下不触发，由 #1 替代。 |
| 3 | **前端 `getProjection` wrapper**：`src/components/sidebar/dnd/treeUtilities.ts`（新建，§5.1）| `Math.min(MAX_DEPTH, previousItem ? previousItem.depth + 1 : 0)` + `Math.max(0, projectedDepth)`，常量 `MAX_DEPTH = 1`（depth 0=root, 1=child；2 禁止）|
| 4 | **前端 KeyboardSensor coordinate**：`src/components/sidebar/dnd/treeKeyboardCoordinates.ts`（新建，§5.1.B）| `Right` 键拒绝 `if (currentDepth >= MAX_DEPTH || projection.isInvalid) return undefined`（不 demote） |
| 5 | **autoClassify 创建路径**：`addCategory(name, color, parentId)` 调用时显式 `parentId = undefined`（详 §9）| 所有 store 的 autoClassify 在 `for (categoryName of newCategories) await addCategory(name, color)` 处显式传 `parentId: undefined` 落根（D14=A）|

> 5 处都需要在 04_implementation_plan V2 中落到对应任务卡的 acceptance criteria 内，逐项打勾。

### 2.4 数据完整性 invariants（**后端硬验证 — D13=A**）

`validate_hierarchy(categories, target_id, new_parent_id)` 函数（pure，便于单测）：

```rust
// src-tauri/src/commands/data.rs（新增，与 apply_reorder 同模式）

#[derive(Debug)]
pub enum HierarchyError {
    /// F1: setting category as its own parent (1-cycle).
    SelfAsParent,
    /// F1: setting parent creates a cycle in the parent chain.
    Cycle,
    /// F2: depth would exceed MAX_DEPTH (root + child only, max=2).
    DepthExceeded,
    /// F3: target parent_id does not refer to any existing category.
    OrphanParent,
    /// Demoting a category that itself has children would push them to depth 2.
    DemoteWithChildren,
}

impl std::fmt::Display for HierarchyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::SelfAsParent => write!(f, "Cannot set category as its own parent"),
            Self::Cycle => write!(f, "Setting parent would create a cycle"),
            Self::DepthExceeded => write!(f, "Hierarchy depth limit exceeded (max 2)"),
            Self::OrphanParent => write!(f, "Parent category not found"),
            Self::DemoteWithChildren => write!(f, "Cannot demote a category that has children"),
        }
    }
}

/// Pure validator for hierarchy operations. Called by `set_category_parent`
/// and `update_category` (the latter only when `parent_id` is being changed).
///
/// `categories` is the current `Vec<Category>` snapshot (held under DATA_MUTEX);
/// `target_id` is the category whose parent_id is changing;
/// `new_parent_id` is the desired new parent (`None` = promote to root).
pub fn validate_hierarchy(
    categories: &[Category],
    target_id: &str,
    new_parent_id: Option<&str>,
) -> Result<(), HierarchyError> {
    let Some(new_parent_id) = new_parent_id else {
        // Promoting to root: always valid (no cycle/depth/orphan possible).
        return Ok(());
    };

    // F1a: self-as-parent
    if new_parent_id == target_id {
        return Err(HierarchyError::SelfAsParent);
    }

    // F3: orphan — new_parent_id must refer to an existing category
    let new_parent = categories
        .iter()
        .find(|c| c.id == new_parent_id)
        .ok_or(HierarchyError::OrphanParent)?;

    // F2: depth — new parent must itself be root (parent_id = None)
    if new_parent.parent_id.is_some() {
        return Err(HierarchyError::DepthExceeded);
    }

    // F1b: cycle — walking new_parent's parent chain must not hit target_id
    //      Currently MAX_DEPTH=2 makes this redundant with F2 (a non-root
    //      parent is already rejected), but the check is defensive — if
    //      MAX_DEPTH ever grows, we want this loop to catch deep cycles.
    //      Also defends against pre-existing data corruption (e.g. user hand-edit
    //      data.json to create depth>2 chains, downgrade-then-upgrade scenario).
    let mut current = Some(new_parent);
    let mut hops = 0;
    while let Some(p) = current {
        if p.id == target_id {
            return Err(HierarchyError::Cycle);
        }
        current = p
            .parent_id
            .as_deref()
            .and_then(|pid| categories.iter().find(|c| c.id == pid));
        hops += 1;
        if hops > 32 {
            // Defensive: pre-existing data corruption with a cycle. Reject.
            return Err(HierarchyError::Cycle);
        }
    }

    // Demote-with-children: if target itself has any children, demoting it
    // would push them to depth 2.
    let target_has_children = categories
        .iter()
        .any(|c| c.parent_id.as_deref() == Some(target_id));
    if target_has_children {
        return Err(HierarchyError::DemoteWithChildren);
    }

    Ok(())
}
```

**前端 prevent**（D13=B）：在 `onDragOver` / `onDragMove` 中算到 `projected.isInvalid` 时，DragOverlay opacity 0.5 + cursor `not-allowed`（参 02 §2.14）；onDragEnd 检测到非法 → 不 dispatch IPC，触发 cancel snap-back。

具体的"非法"包含：
- 父类被拖入另一父类的 drop-into 区（per D5 = B-1：父类不可成子）
- 任何会破坏 max depth=2 的 demote（已被 getProjection 的 `Math.min(depth, 1)` clamp 提前拦截，但 02 §2.14 仍要求视觉反馈）

**delete_category cascade-promote**（D13 一部分）：详 §3.3.4。

---

## 3. 后端 API（**完整修订**）

> 本节延续 V3 §3 的措辞与结构。所有 mutating 命令必须在最外层 `let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;`，防止 read-modify-write 被并发打断。

### 3.1 DATA_MUTEX 协议覆盖核对（**grep 重新枚举 — V2 P1-5 修订**）

> 履行 `.claude/rules/grep-before-enumerate-shared-resource.md`：枚举 read_app_data / write_app_data 全 callsite，每条标注本任务下的处理意图。

**grep 命令与原始输出**（V2 重新执行）：

```
$ rg -n 'write_app_data|read_app_data' src-tauri/src/commands/
src-tauri/src/commands/trash.rs:387:        let mut app_data = read_app_data()?;
src-tauri/src/commands/trash.rs:410:            write_app_data(app_data)?;
src-tauri/src/commands/trash.rs:414:        let mut app_data = read_app_data()?;
src-tauri/src/commands/trash.rs:445:            write_app_data(app_data)?;
src-tauri/src/commands/data.rs:198:    write_app_data(default_data)?;   # init_app_data (single-threaded startup)
src-tauri/src/commands/data.rs:215:    let data = read_app_data()?;     # get_categories (read-only)
src-tauri/src/commands/data.rs:223:    let mut data = read_app_data()?; # add_category
src-tauri/src/commands/data.rs:233:    write_app_data(data)?;
src-tauri/src/commands/data.rs:242:    let mut data = read_app_data()?; # update_category
src-tauri/src/commands/data.rs:251:    write_app_data(data)?;
src-tauri/src/commands/data.rs:262:    let mut data = read_app_data()?; # delete_category
src-tauri/src/commands/data.rs:264:    write_app_data(data)?;
src-tauri/src/commands/data.rs:275:    let mut data = read_app_data()?; # reorder_categories
src-tauri/src/commands/data.rs:278:    write_app_data(data)?;
src-tauri/src/commands/data.rs:287:    let data = read_app_data()?;     # get_tags (read-only)
src-tauri/src/commands/data.rs:295:    let mut data = read_app_data()?; # add_tag (lock'd)
src-tauri/src/commands/data.rs:304:    write_app_data(data)?;
src-tauri/src/commands/data.rs:313:    let mut data = read_app_data()?; # update_tag (lock'd)
src-tauri/src/commands/data.rs:317:    write_app_data(data)?;
src-tauri/src/commands/data.rs:328:    let mut data = read_app_data()?; # delete_tag (lock'd)
src-tauri/src/commands/data.rs:330:    write_app_data(data)?;
src-tauri/src/commands/data.rs:339:    let mut data = read_app_data()?; # reorder_tags (lock'd)
src-tauri/src/commands/data.rs:342:    write_app_data(data)?;
src-tauri/src/commands/data.rs:351:    let data = read_app_data()?;     # get_scenes (read-only)
src-tauri/src/commands/data.rs:368:    let mut data = read_app_data()?; # add_scene (lock'd)
src-tauri/src/commands/data.rs:384:    write_app_data(data)?;
src-tauri/src/commands/data.rs:401:    let mut data = read_app_data()?; # update_scene (lock'd)
src-tauri/src/commands/data.rs:422:    write_app_data(data)?;
src-tauri/src/commands/data.rs:433:    let mut data = read_app_data()?; # delete_scene (lock'd)
src-tauri/src/commands/data.rs:456:    write_app_data(data)?;
src-tauri/src/commands/data.rs:465:    let data = read_app_data()?;     # get_projects (read-only)
src-tauri/src/commands/data.rs:474:    let mut data = read_app_data()?; # add_project (lock'd)
src-tauri/src/commands/data.rs:485:    write_app_data(data)?;
src-tauri/src/commands/data.rs:501:    let mut data = read_app_data()?; # update_project (lock'd)
src-tauri/src/commands/data.rs:516:    write_app_data(data)?;
src-tauri/src/commands/data.rs:527:    let mut data = read_app_data()?; # delete_project (lock'd)
src-tauri/src/commands/data.rs:546:    write_app_data(data)?;
src-tauri/src/commands/claude_md.rs:107:    let app_data = read_app_data().unwrap_or_default(); # get_global_claude_md_id (read-only)
src-tauri/src/commands/claude_md.rs:382-388:                                                         # set_global_claude_md_id (lock'd at 382)
src-tauri/src/commands/claude_md.rs:449,470:                                                          # get_claude_md_files (read-only)
src-tauri/src/commands/claude_md.rs:510-554:                                                          # update_claude_md (lock'd at 510)
src-tauri/src/commands/claude_md.rs:576-633:                                                          # delete_claude_md / unset_global (lock'd at 576)
src-tauri/src/commands/claude_md.rs:654-759:                                                          # import_claude_md (lock'd at 654)
src-tauri/src/commands/claude_md.rs:777-797:                                                          # restore_claude_md (lock'd at 777)
src-tauri/src/commands/claude_md.rs:813:    let app_data = read_app_data()?; # get_claude_md_file (read-only)
src-tauri/src/commands/claude_md.rs:936-958:                                                          # migrate_claude_md_storage (lock'd at 936)
src-tauri/src/commands/trash.rs:341:    let _guard = DATA_MUTEX.lock()...                            # restore_claude_md (lock'd)
src-tauri/src/commands/skills.rs:60-103:                                                              # update_skill_metadata — V1 NOT lock'd; **V2 ADD lock**
src-tauri/src/commands/mcps.rs:51-90:                                                                 # update_mcp_metadata — V1 NOT lock'd; **V2 ADD lock**
```

**每条 callsite 的处理决议（V2 修订表）**：

| 文件:行 | 命令 | 是否需 DATA_MUTEX | 本任务下处理 |
|---|---|---|---|
| `data.rs:198` | `init_app_data` | **不需要**（单线程启动期；data.json 不存在时初始化）| 不变；列入 grep 表完整性（V1 P2 修订点吸收）|
| `data.rs:215` | `get_categories` | 否（pure read） | 不变 |
| `data.rs:222-233` | `add_category` | 是（已加） | **改**：增 `parent_id: Option<Option<String>>` 参数（§3.3.1）|
| `data.rs:241-251` | `update_category` | 是（已加） | **改**：增 `parent_id: Option<Option<String>>` 三态语义（§3.3.2）|
| `data.rs:261-264` | `delete_category` | 是（已加） | **改**：增 cascade-promote + disambiguation（§3.3.4）|
| `data.rs:274-278` | `reorder_categories` | 是（已加） | 不变；hierarchy 改动走 `set_category_parent` IPC（§3.3.5）|
| `data.rs:287, 295-304, 313-317, 328-330, 339-342` | tags 全集 | 是（已加） | 不变 |
| `data.rs:351, 368-384, 401-422, 433-456` | scenes 全集 | 是（已加） | 不变 |
| `data.rs:465, 474-485, 501-516, 527-546` | projects 全集 | 是（已加） | 不变 |
| `claude_md.rs:107` | `get_global_claude_md_id` | 否（pure read） | 不变 |
| `claude_md.rs:382-388` | `set_global_claude_md_id` | **是（已加 line 382）** | 不变 |
| `claude_md.rs:449, 470, 813` | `get_claude_md_files` / `get_claude_md_file` | 否（pure read） | 不变 |
| `claude_md.rs:510-554` | `update_claude_md` | **是（已加 line 510）** | 不变（categoryId 字段语义不变；ClaudeMd 已经是 id 引用）|
| `claude_md.rs:576-633` | `delete_claude_md` / `unset_global_claude_md` | **是（已加 line 576）** | 不变 |
| `claude_md.rs:654-759` | `import_claude_md` | **是（已加 line 654）** | 不变 |
| `claude_md.rs:777-797` | `restore_claude_md` | **是（已加 line 777）** | 不变 |
| `claude_md.rs:936-958` | `migrate_claude_md_storage` | **是（已加 line 936）** | 不变 |
| `trash.rs:341, 387, 410, 414, 445` | `restore_claude_md`（在 trash 内复用） | 是（已加 line 341） | 不变 |
| **`skills.rs:60-103`** | `update_skill_metadata` | **V1 未持** | **V2 [P1-5] 一并修复 — 加 DATA_MUTEX**（§3.6 完整代码）|
| **`mcps.rs:51-90`** | `update_mcp_metadata` | **V1 未持** | **V2 [P1-5] 一并修复 — 加 DATA_MUTEX**（§3.6 完整代码）|
| **新增**：`set_category_parent` | （§3.3.3）| **必须加 DATA_MUTEX** | **新增任务卡** |
| **新增**：`migrate_category_id_for_skills_mcps` | （§3.4） | **必须加 DATA_MUTEX** | **新增任务卡** |

**[P1-5] V2 修订理由**：V1 §3.1 把 `update_skill_metadata` / `update_mcp_metadata` 标为"现状缺口、本任务不修"。Reviewer C 论证：
1. 本任务原本就在改这两个函数（增 `category_id` 参数）—— 加锁是 5 LoC 增量。
2. hierarchy 引入后 race 窗口频率提升（用户拖动 reorder + dropdown 改 category + sidebar 改父级三路并发）。
3. V2 §10 一并增 `concurrent_update_metadata_and_reorder_no_lost_update` 测试。

→ V2 锁定：**本任务一并修复 GAP-1 / GAP-2**（详 §3.6 完整代码）。

### 3.2 apply_reorder hierarchy-aware（保留现有 pure function + 新增 validate）

> 关键决策：**不修改 `apply_reorder` pure function 的签名**。它已经是 `Vec<T> + ordered_ids` 的纯排序函数（`data.rs:51-86`），与 hierarchy 正交（仅改顺序，不改 parent_id）。

**为什么不合并 reorder + hierarchy change 到单一 IPC**：
- V3 `reorder_categories(orderedIds: Vec<String>) -> Vec<Category>` 的契约是"reorder same-level only"。
- 若扩展为 `reorder_categories_with_hierarchy(items: Vec<{id, parent_id}>)`，需要修改前端 `applyReorder` helper（`appStore.ts:29-52`）+ 后端 `apply_reorder` + 测试覆盖 — 改动面大且与 `enqueueReorder` 队列协议（appStore.ts:21-25）耦合。
- **V2 推荐方案**：`reorder_categories` 保留同签名（仅顺序，不改 parent_id）；hierarchy 改动用单独的 `set_category_parent(id, parent_id)` IPC，由 onDragEnd 在 reorder 之外**串行**触发（V2 [P0-ARCH-3] 修订：`await setCategoryParent` 完成后再算 reorder ordered_ids，避免 stale；详 §4.4 / §5.2）。

**与 V1 的差异（V2 [P0-ARCH-3] 修订）**：V1 §3.2 末段提到"如果用户拖动一项同时改了顺序与父级，可在 onDragEnd 中**串行**两次 IPC：先 `set_category_parent`，后 `reorder_categories`，由 `enqueueReorder` 队列保证顺序"。但 V1 没说明 reorder 的 `orderedIds` 在何时计算——若是在 `enqueueReorder` 入队前一次性计算（fire-and-forget），第二次 IPC 拿到的是 stale ordered_ids（基于改 parent 之前的 hierarchy）。

V2 锁定：onDragEnd 必须 `await setCategoryParent`（Promise resolution 而非 fire-and-forget），完成后才基于 `useAppStore.getState().categories` 的 fresh state 重组完整 ordered_ids（含所有 children），再调 `reorderCategories`。详 §5.2 完整代码。

### 3.3 Category CRUD 改动

#### 3.3.1 `add_category` 增 `parent_id` 参数（V2 [P1-6] 修订：Option<Option<T>>）

```rust
// src-tauri/src/commands/data.rs:219-236（替换现有实现）

/// Add a new category. `parent_id = None` (outer None / not provided) creates
/// a root-level category; `parent_id = Some(None)` is unused for add (semantically
/// identical to root); `parent_id = Some(Some(id))` creates a child of that category.
///
/// V2 [P1-6] note: `add_category` does not need the three-state semantic of
/// `Option<Option<T>>` because there is no "do not modify" path during creation.
/// We keep `Option<String>` here (single Option) — the `Option<Option<T>>`
/// pattern is reserved for `update_category` / `set_category_parent` /
/// `update_skill_metadata` where "do not modify" is meaningful.
///
/// Validates hierarchy invariants under DATA_MUTEX:
/// - F2 depth: parent_id (if set) must refer to a root-level category
///   (a category whose own parent_id is None) — D2 hard cap 2.
/// - F3 orphan: parent_id (if set) must refer to an existing category.
///
/// Why we don't call `validate_hierarchy` directly (V2 [E P1-10] alignment):
/// `validate_hierarchy` requires a `target_id` (the category whose parent_id
/// is changing). For `add_category` the target is a brand-new UUID that does
/// not yet appear in the chain — so cycle / self-as-parent / demote-with-children
/// checks all trivially pass. We inline the relevant subset (orphan + depth)
/// instead of constructing a fake target_id.
#[tauri::command]
#[allow(non_snake_case)]
pub fn add_category(
    name: String,
    color: String,
    parentId: Option<String>,  // V2: single Option (no three-state needed for create)
) -> Result<Category, String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    if let Some(pid) = parentId.as_deref() {
        let parent = data
            .categories
            .iter()
            .find(|c| c.id == pid)
            .ok_or_else(|| HierarchyError::OrphanParent.to_string())?;
        if parent.parent_id.is_some() {
            return Err(HierarchyError::DepthExceeded.to_string());
        }
    }

    let category = Category {
        id: Uuid::new_v4().to_string(),
        name,
        color,
        count: 0,
        parent_id: parentId,
    };

    data.categories.push(category.clone());
    write_app_data(data)?;

    Ok(category)
}
```

**前端 IPC 签名**：`safeInvoke<Category>('add_category', { name, color, parentId })`。autoClassify 调用时显式传 `parentId: undefined`（D14=A 落根）。

#### 3.3.2 `update_category` 增 `parent_id: Option<Option<String>>`（V2 [P1-6] 修订）

> **V2 决策（[P1-6] 吸收）**：V1 把 `update_category` 简化为不接受 `parent_id`（"语义分离"），把改父级路径全部拐去 `set_category_parent`。但 Reviewer C 论证：保留 `Option<Option<T>>` 三态（外层 None = 不修改 / 外层 Some(None) = 显式清空 / 外层 Some(Some(id)) = 设值）让 update_category 自然支持"同时改 name + 改 parent"的复合操作（如 ContextMenu Rename + Promote）。本 V2 修订采纳。
>
> 但出于 implementation 边界清晰，**`update_category` 仍以 name/color 为主路径，parent_id 是可选 third 参数**；专用的 hierarchy mutation 路径仍是 `set_category_parent`（详 §3.3.3）。Frontend 调用约定：
> - `appStore.updateCategory(id, name?, color?)` 调用不传 parent_id → IPC payload 不含该字段 → Rust 端解析为外层 None → 不修改 parent_id ✓（与 V1 行为兼容）
> - `appStore.setCategoryParent(id, newParentId)` 仍走 `set_category_parent` IPC，不复用此入口

**Tauri Option<Option<T>> IPC 行为**（参 `tauri@2.9` + `serde_json` 标准 + `update_claude_md` 现有用例 line 506）：
- 前端不传该字段（payload 中省略 key）→ Rust 收到 `None`（外层）→ "不修改"
- 前端传 `parentId: null` → 外层 `Some`，内层 `None` → "显式清空（promote to root）"
- 前端传 `parentId: "some-id"` → 外层 `Some`，内层 `Some("some-id")` → "设为该 id"

```rust
// src-tauri/src/commands/data.rs:240-260（替换现有实现）

#[tauri::command]
#[allow(non_snake_case)]
pub fn update_category(
    id: String,
    name: Option<String>,
    color: Option<String>,
    parentId: Option<Option<String>>,    // V2 [P1-6]: three-state Option<Option<T>>
) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    // If parent change requested, validate hierarchy (cycle / depth / orphan / demote-with-children).
    if let Some(new_parent_id_opt) = parentId.as_ref() {
        validate_hierarchy(&data.categories, &id, new_parent_id_opt.as_deref())
            .map_err(|e| e.to_string())?;
    }

    if let Some(category) = data.categories.iter_mut().find(|c| c.id == id) {
        if let Some(n) = name {
            category.name = n;
        }
        if let Some(c) = color {
            category.color = c;
        }
        if let Some(new_parent_id_opt) = parentId {
            category.parent_id = new_parent_id_opt;
        }
        write_app_data(data)?;
        Ok(())
    } else {
        Err("Category not found".to_string())
    }
}
```

**不改动**：现有 frontend `appStore.updateCategory(id, name?, color?)` 调用路径全部保留（不传 parentId → Rust 解析为外层 None → 不修改）。

#### 3.3.3 新增 `set_category_parent` 命令

```rust
// src-tauri/src/commands/data.rs（在 reorder_categories 之后）

/// Set or unset a category's parent. `new_parent_id = None` promotes the
/// category to root level. Validates hierarchy invariants under DATA_MUTEX
/// (D13 = A backend hard validate).
///
/// Returns the resulting `Vec<Category>` for client-side calibration —
/// frontend applies optimistic state then reconciles with this canonical Vec.
///
/// V2 [P1-6] note: This IPC accepts `new_parent_id: Option<String>` (single
/// Option) since the "do not modify" path is not meaningful for this command
/// (the entire purpose is to modify parent_id). The Option semantics are:
/// - `None` (omitted in JS payload, or null) → promote to root
/// - `Some("id")` → demote to child of that id
#[tauri::command]
#[allow(non_snake_case)]
pub fn set_category_parent(
    id: String,
    newParentId: Option<String>,
) -> Result<Vec<Category>, String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    // Find target — error if missing (orphan target id).
    if !data.categories.iter().any(|c| c.id == id) {
        return Err("Category not found".to_string());
    }

    // Hierarchy validation (D13 = A backend hard validate).
    validate_hierarchy(&data.categories, &id, newParentId.as_deref())
        .map_err(|e| e.to_string())?;

    // Apply.
    if let Some(category) = data.categories.iter_mut().find(|c| c.id == id) {
        category.parent_id = newParentId;
    }

    let result = data.categories.clone();
    write_app_data(data)?;
    Ok(result)
}
```

**前端 IPC 签名**：`safeInvoke<Category[]>('set_category_parent', { id, newParentId })`。

**注册**（`src-tauri/src/lib.rs:97-101`）：

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    data::add_category,
    data::update_category,
    data::delete_category,
    data::reorder_categories,
    data::set_category_parent,                    // NEW
    data::migrate_category_id_for_skills_mcps,    // NEW
    // ...
])
```

> **04 任务卡 acceptance**：lib.rs 注册需 grep 验证（防 SubAgent 写好新 IPC 但忘了注册）— `rg -n 'set_category_parent|migrate_category_id_for_skills_mcps' src-tauri/src/lib.rs` 必须各命中 ≥ 1 次。

#### 3.3.4 `delete_category` cascade-promote + 同名碰撞 disambiguation（V2 [P0-DATA-2] 修订）

**V1 → V2 修订原因（Reviewer C P0-2 + Reviewer F 一致命中）**：

V1 实现仅做 `cat.parent_id = None`（promote 到 root），未处理"child name 与现有 root names 冲突"。场景：

- root: `Web` (cat-A)
- root: `Tools` (cat-B)
- child of Tools: `Web` (cat-C)  ← D1=A 决策的核心动机：id 引用，name 不需全树唯一

用户删除 `Tools` (cat-B) → cascade-promote → cat-C `Web` 变成 root → categories = `[Web (cat-A), Web (cat-C)]` **两个 root 同名**。Skills/MCPs 的 `category` 字段是 cached name；sidebar 显示两行同名 row；用户视角混乱。

**V2 修订**（_v2_patch_plan §3.5 锁定决议）：cascade-promote 前检测冲突，重命名为 `<原名> (<父类名>)`，必要时附数字后缀；记录 disambiguation 日志。

```rust
// src-tauri/src/commands/data.rs:258-265（V2 替换实现）

use std::collections::HashSet;

/// Delete a category and cascade-promote all of its children to root level
/// (set their parent_id to None). This preserves Skill/MCP/ClaudeMd
/// references — child categories survive the parent deletion, so any
/// downstream references via category_id remain valid.
///
/// V2 [P0-DATA-2]: When a promoted child's name collides with an existing
/// root name (or another about-to-promote sibling), we disambiguate by
/// renaming to "<原名> (<原父名>)", appending a numeric suffix if necessary.
/// The disambiguation is logged to stderr for traceability.
///
/// Skill/MCP metadata pointing to the deleted category itself is NOT
/// cleaned up (the category_id field becomes a dangling reference, falling
/// back to the cached `category` name field at display time, eventually
/// rendering as "Uncategorized" if the user explicitly clears it). This
/// matches the D7 / D14 separation: removing a parent does NOT silently
/// re-categorize its content.
#[tauri::command]
pub fn delete_category(id: String) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    // Find name of the deleted parent (used for disambiguation suffix).
    let deleted_parent_name = data
        .categories
        .iter()
        .find(|c| c.id == id)
        .map(|c| c.name.clone());

    // Collect existing root-level names (excluding the to-be-deleted parent itself).
    // Mutable so we can grow it as we promote each child (later children disambiguate
    // against earlier promoted siblings too).
    let mut root_names: HashSet<String> = data
        .categories
        .iter()
        .filter(|c| c.parent_id.is_none() && c.id != id)
        .map(|c| c.name.clone())
        .collect();

    // Promote children, suffixing names that would collide with existing roots.
    // max depth = 2 means "child of child" cannot exist, so single pass is enough.
    for cat in data.categories.iter_mut() {
        if cat.parent_id.as_deref() == Some(&id) {
            cat.parent_id = None;
            if root_names.contains(&cat.name) {
                if let Some(parent_name) = &deleted_parent_name {
                    let original_name = cat.name.clone();
                    let mut new_name = format!("{} ({})", original_name, parent_name);
                    let mut suffix = 2;
                    while root_names.contains(&new_name) {
                        new_name = format!("{} ({} {})", original_name, parent_name, suffix);
                        suffix += 1;
                    }
                    eprintln!(
                        "[delete_category] disambiguating promoted child '{}' → '{}' (parent was '{}')",
                        original_name, new_name, parent_name
                    );
                    root_names.insert(new_name.clone());
                    cat.name = new_name;
                } else {
                    // No parent name available (defensive — shouldn't happen).
                    root_names.insert(cat.name.clone());
                }
            } else {
                root_names.insert(cat.name.clone());
            }
        }
    }

    // Now remove the deleted category itself.
    data.categories.retain(|c| c.id != id);

    write_app_data(data)?;
    Ok(())
}
```

> 论据：R1 §6.2 反对声音 #3 — 删除父类时 cascade-promote（保留 children）vs cascade-delete（一并删 children）。本 V2 选 cascade-promote + disambiguation：极简哲学（"无必要勿增实体"），且 cascade-delete 会引起 Skill/MCP/ClaudeMd 的 `category_id` 失效，必须二次清理元数据 — 复杂度不值。同名碰撞 disambiguation 不静默丢弃信息（保留 child 的存在）+ 名字回溯到原父类语义（用户能看出来源）+ 用户可手动 rename。

#### 3.3.5 `reorder_categories` 保持现有签名

```rust
// src-tauri/src/commands/data.rs:268-280（不修改）

#[tauri::command]
#[allow(non_snake_case)]
pub fn reorder_categories(orderedIds: Vec<String>) -> Result<Vec<Category>, String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;
    data.categories = apply_reorder(data.categories, &orderedIds);
    let result = data.categories.clone();
    write_app_data(data)?;
    Ok(result)
}
```

**关键事实**：`apply_reorder` 已是 generic over `HasId`（`data.rs:51`），新增 `parent_id` 字段不破坏其语义。前端拖动结束后（V2 [P0-ARCH-2] + [P0-ARCH-3] 修订）：

1. 仅同级 reorder（不改父级）→ 单次 `reorder_categories(orderedIds)` IPC；ordered_ids 必须含所有 children 的 id（含 active 父类的子树，按 fresh categories 顺序），避免 backend `apply_reorder` 把 unmentioned ids append 到 Vec 末尾（详 §5.2 + §6.1）。
2. 同时 reorder + 改父级 → **串行**两次 IPC：`await setCategoryParent(id, newParentId)`，完成后基于 fresh `categories` 重组完整 ordered_ids，再 `reorder_categories(orderedIds)`。
3. 仅改父级（顺序不变）→ 单次 `set_category_parent(id, newParentId)` IPC。

**reorder 不改父级的理由（V2 重申）**：避免 `apply_reorder_with_hierarchy` 这类双语义函数。语义分离让单元测试与 reasoning 都更直接。代价是前端 onDragEnd 需要正确处理双 IPC 串行（V2 [P0-ARCH-3] 完成此修订）。

### 3.4 一次性迁移命令 `migrate_category_id_for_skills_mcps`（V2 [P0-DATA-3] 修订）

> 用途：旧 data.json 中 Skills/MCPs 的 metadata 仅含 `category: String name`。V1 之后 SoT 切到 `category_id: Option<String>`。一次性迁移：name → id 反查写入。idempotent。
>
> **V2 [P0-DATA-3] 修订**：迁移成功才 set flag = true（事务性视角）；任一 skill/mcp 找不到 category_id 时仅记 orphan_count 并不阻塞，但**不阻塞写 flag**——orphan name 是合法终态（用户后续可手动归类）。**真正的失败是 `write_app_data` 失败 / DATA_MUTEX poisoning** —— 这种情况下 `?` 会让 IPC 返回 Err，frontend 不写 flag，下次启动重试。
>
> **V2-late 修订（Phase-1 audit P1-2，2026-05-04）**：实际实现采用结构 `MigrationReport { migrated_skills: u32, migrated_mcps: u32, orphaned_skills: Vec<String>, orphaned_mcps: Vec<String> }`（详 `src-tauri/src/types.rs:265-279`）。下方 spec 中 `MigrateCategoryIdReport` / `flag_just_set` 字段是 V2 草稿；**以实现为准**。orphan 列表是 `Vec<String>`（skill_id / mcp_id 键），不是 u32 计数；前端无需 `flag_just_set` —— migration 已成功调用即说明 flag 已写。

```rust
// src-tauri/src/commands/data.rs（在 set_category_parent 之后；新增）

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateCategoryIdReport {
    /// Number of skill_metadata entries successfully filled with a category_id.
    pub migrated_skills: u32,
    /// Number of skill_metadata entries whose `category` name does not match
    /// any existing category — left unchanged (display falls back to the
    /// cached name string, or "Uncategorized" if name is empty).
    pub orphan_skills: u32,
    /// Same for mcp_metadata.
    pub migrated_mcps: u32,
    pub orphan_mcps: u32,
    /// True iff the migration ran (data.has_completed_category_id_migration
    /// went from false → true). Idempotent fast path returns false.
    pub flag_just_set: bool,
}

/// One-time migration: backfill `category_id` for all skill_metadata and
/// mcp_metadata entries by looking up `category` (name) against the current
/// `categories` Vec. Idempotent — entries that already have `category_id`
/// set are skipped, AND if `data.has_completed_category_id_migration` is
/// already true the entire function early-returns with zero counts.
///
/// V2 [P0-DATA-1] note: The flag now lives in `AppData` (not `AppSettings`).
/// This sidesteps the frontend `settingsStore.saveSettings` enumerate risk
/// (V1 path: every saveSettings() call would silently reset the flag to
/// false because the Settings UI did not enumerate this field, and serde
/// `#[serde(default)]` on bool defaults missing → false on Rust-side
/// deserialization).
///
/// V2 [P0-DATA-3] note: The flag is set to `true` ONLY if
/// `write_app_data` succeeds (i.e. the disk state reflects the migrated
/// metadata). If write fails, `?` propagates the error to the caller; the
/// frontend then does NOT see a successful Ok return and does not advance.
/// On next launch, `has_completed_category_id_migration` is still false →
/// migration retries (idempotent). orphan_skills / orphan_mcps DO NOT
/// block the flag advance — orphan names are a legitimate terminal state
/// (user has skills referencing categories that no longer exist; this is
/// fallback-displayable via cached `category` name).
#[tauri::command]
pub fn migrate_category_id_for_skills_mcps() -> Result<MigrateCategoryIdReport, String> {
    use std::collections::HashMap;

    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    // Idempotent fast path — already migrated.
    if data.has_completed_category_id_migration {
        return Ok(MigrateCategoryIdReport {
            migrated_skills: 0,
            orphan_skills: 0,
            migrated_mcps: 0,
            orphan_mcps: 0,
            flag_just_set: false,
        });
    }

    // Build name → id index (one pass).
    let categories_by_name: HashMap<String, String> = data
        .categories
        .iter()
        .map(|c| (c.name.clone(), c.id.clone()))
        .collect();

    let mut report = MigrateCategoryIdReport {
        migrated_skills: 0,
        orphan_skills: 0,
        migrated_mcps: 0,
        orphan_mcps: 0,
        flag_just_set: false,
    };

    for meta in data.skill_metadata.values_mut() {
        if meta.category_id.is_some() {
            continue; // already migrated — idempotent
        }
        if meta.category.is_empty() {
            continue; // genuinely uncategorized
        }
        match categories_by_name.get(&meta.category) {
            Some(id) => {
                meta.category_id = Some(id.clone());
                report.migrated_skills += 1;
            }
            None => {
                eprintln!(
                    "[migrate_category_id] orphan skill_metadata.category='{}' — leaving unchanged",
                    meta.category
                );
                report.orphan_skills += 1; // dangling name; UI shows fallback
            }
        }
    }

    for meta in data.mcp_metadata.values_mut() {
        if meta.category_id.is_some() {
            continue;
        }
        if meta.category.is_empty() {
            continue;
        }
        match categories_by_name.get(&meta.category) {
            Some(id) => {
                meta.category_id = Some(id.clone());
                report.migrated_mcps += 1;
            }
            None => {
                eprintln!(
                    "[migrate_category_id] orphan mcp_metadata.category='{}' — leaving unchanged",
                    meta.category
                );
                report.orphan_mcps += 1;
            }
        }
    }

    // V2 [P0-DATA-3]: set flag IN-MEMORY and persist atomically with metadata.
    // If write_app_data fails, ? propagates Err — frontend won't advance.
    data.has_completed_category_id_migration = true;
    write_app_data(data)?;
    report.flag_just_set = true;
    Ok(report)
}
```

**注**：本命令仅迁移 `data.json` 中的 `skill_metadata` / `mcp_metadata` map（持久化层）。`Skill` / `McpServer` 是 runtime-derived（在 `scan_skills` / `scan_mcps` 时从 metadata + 文件系统拼装而来，参 `skills.rs:208`、`mcps.rs:144`），下次 scan 时会自动填充新 `category_id` 字段（详 §3.6）。

> **Migration 中途崩溃可恢复（Reviewer C P1-10 + V2 [P0-DATA-3]）**：
> - `read_app_data → modify in-memory → write_app_data`：`write_app_data` 之前任何 panic/OOM 不会动 disk。
> - `write_app_data` 自身的写中断（disk full）：data.json 短时间内可能损坏，但这是 `fs::write` 的现状 race（V3 之前就是这个状态，不在本任务引入）。如需未来加固，可改 `tempfile + atomic rename` 模式 — V2 不强求。
> - `idempotent + fallback`：即使迁移半成功（不可能，因为整个函数原子写一次），下次重启 `data.has_completed_category_id_migration` 仍为 false → 重跑；`category_id.is_some()` 跳过的 entry 已经稳定。

### 3.5 AppData 加迁移完成 flag（V2 [P0-DATA-1] 修订 — 移出 AppSettings）

**V1 → V2 修订原因（Reviewer C P0-1）**：

V1 把 flag `has_completed_category_id_migration: bool` 加在 `AppSettings`，并用 `#[serde(default)]` 让旧 settings.json 反序列化为 false。但 `src/stores/settingsStore.ts:198-211` 的 `saveSettings` 是**显式列字段**：

```ts
await safeInvoke('write_settings', {
  settings: {
    skillSourceDir: state.skillSourceDir,
    // ... 列出 10 个字段 ...
    hasCompletedImport: state.hasCompletedImport,
    // ❌ V1 路径：没有 hasCompletedCategoryIdMigration
  },
});
```

用户首次启动后 flag 写为 true → 然后改任意 setting → `saveSettings()` → IPC payload 不含 `hasCompletedCategoryIdMigration` → Rust 端反序列化 `AppSettings` 时该字段缺失 → `#[serde(default)]` 触发 → **解析为 false** → settings.json 写入 `has_completed_category_id_migration: false`。下次启动 flag 又是 false → 再跑一次 migration（idempotent，但每次冗余）。

V2 修订（_v2_patch_plan §3.3 锁定）：把 flag 移到 `AppData`（与 `imported_plugin_skills` 等 V3 已有 flag 同位），绕过 frontend `settingsStore` 显式 enumerate 风险。

```rust
// src-tauri/src/types.rs:151-176（修改 AppData）

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppData {
    pub categories: Vec<Category>,
    pub tags: Vec<Tag>,
    pub scenes: Vec<Scene>,
    pub projects: Vec<Project>,
    pub skill_metadata: HashMap<String, SkillMetadata>,
    pub mcp_metadata: HashMap<String, McpMetadata>,
    #[serde(default)]
    pub trashed_scenes: Vec<TrashedScene>,
    #[serde(default)]
    pub trashed_projects: Vec<TrashedProject>,
    #[serde(default)]
    pub imported_plugin_skills: Vec<String>,
    #[serde(default)]
    pub imported_plugin_mcps: Vec<String>,
    #[serde(default)]
    pub claude_md_files: Vec<ClaudeMdFile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub global_claude_md_id: Option<String>,
    /// V1 hierarchy migration state. Set to `true` by
    /// `migrate_category_id_for_skills_mcps` after a successful run.
    /// Subsequent app launches skip the migration. NEW (V2 [P0-DATA-1] —
    /// moved from AppSettings to bypass settingsStore.saveSettings enumerate
    /// risk).
    #[serde(default)]
    pub has_completed_category_id_migration: bool,
}
```

**`AppSettings` 不动**（V2 取消 V1 §3.5 对 AppSettings 的修改）：

```rust
// src-tauri/src/types.rs:201-217 — UNCHANGED in V2
pub struct AppSettings {
    pub skill_source_dir: String,
    pub mcp_source_dir: String,
    pub claude_config_dir: String,
    pub anthropic_api_key: Option<String>,
    pub auto_classify_new_items: bool,
    pub terminal_app: String,
    pub claude_command: String,
    #[serde(default = "default_warp_open_mode")]
    pub warp_open_mode: String,
    pub has_completed_import: bool,
    #[serde(default = "default_claude_md_distribution_path")]
    pub claude_md_distribution_path: ClaudeMdDistributionPath,
    // ❌ V1 had: pub has_completed_category_id_migration: bool — REMOVED in V2
}
```

**前端类型同步**（`src/types/index.ts`）：

```ts
export interface AppData {
  categories: Category[];
  tags: Tag[];
  scenes: Scene[];
  projects: Project[];
  // ... existing fields ...
  hasCompletedCategoryIdMigration?: boolean;   // NEW (V2)
}
```

`AppSettings` 类型不需新加字段（V2 取消 V1 §3.5 的 AppSettings 改动）。

### 3.6 `scan_skills` / `scan_mcps` 拼装 + `update_skill_metadata` / `update_mcp_metadata` 加锁（V2 [P1-5] + [P1-6]）

> 关键事实：`Skill` / `McpServer` 不是 data.json 中持久化的对象，而是 `scan_skills` / `scan_mcps` 在 IPC 调用时**实时从 metadata + 文件系统拼装**出来的。需要在拼装时把 metadata.category_id 透传到 Skill.category_id。

**Rust 改动**（`src-tauri/src/commands/skills.rs:200-220` 区域 — `scan_skills` 拼装 Skill 处）：

```rust
// 现有（skills.rs:200-218 区域）：
Skill {
    id: skill_id.clone(),
    name: ...,
    description: ...,
    category: metadata.map(|m| m.category.clone()).unwrap_or_default(),
    tags: metadata.map(|m| m.tags.clone()).unwrap_or_default(),
    // ...
}

// V2 改造后：
Skill {
    id: skill_id.clone(),
    name: ...,
    description: ...,
    category: metadata.map(|m| m.category.clone()).unwrap_or_default(),
    category_id: metadata.and_then(|m| m.category_id.clone()),  // NEW
    tags: metadata.map(|m| m.tags.clone()).unwrap_or_default(),
    // ...
}
```

`mcps.rs:144` 区域对称改。

**`update_skill_metadata` / `update_mcp_metadata` V2 完整实现**（[P1-5] 加 DATA_MUTEX + [P1-6] `Option<Option<T>>` 三态）：

```rust
// src-tauri/src/commands/skills.rs:60-103（V2 完整替换实现）

/// Update skill metadata. V2 changes:
/// - [P1-5] Wrap in DATA_MUTEX (V3 baseline preserved across all data.json mutators).
/// - [P1-6] `category_id: Option<Option<String>>` for "do not modify / clear / set" semantics.
///
/// Tauri Option<Option<T>> IPC behavior (verified via `update_claude_md` in claude_md.rs:506):
/// - JS payload omits the key OR sends `undefined` → outer None → "do not modify"
/// - JS payload sends `null` → outer Some(None) → "clear (set to None)"
/// - JS payload sends `{ categoryId: "abc" }` → outer Some(Some("abc")) → "set to abc"
#[tauri::command]
#[allow(non_snake_case)]
pub fn update_skill_metadata(
    skillId: String,
    category: Option<String>,
    categoryId: Option<Option<String>>,    // V2 [P1-6]: three-state Option<Option<T>>
    tags: Option<Vec<String>>,
    enabled: Option<bool>,
    icon: Option<String>,
) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;       // V2 [P1-5]
    let mut app_data = read_app_data()?;                               // V2: replace bare fs::read

    let metadata = app_data
        .skill_metadata
        .entry(skillId)
        .or_insert_with(SkillMetadata::default);

    if let Some(cat) = category {
        metadata.category = cat;
    }
    if let Some(cid_outer) = categoryId {
        metadata.category_id = cid_outer;     // outer Some(None)=clear; Some(Some(id))=set
    }
    if let Some(t) = tags {
        metadata.tags = t;
    }
    if let Some(e) = enabled {
        metadata.enabled = e;
    }
    if let Some(i) = icon {
        metadata.icon = Some(i);
    }

    write_app_data(app_data)?;                                          // V2: replace bare fs::write
    Ok(())
}
```

`mcps.rs::update_mcp_metadata` 对称改：

```rust
#[tauri::command]
#[allow(non_snake_case)]
pub fn update_mcp_metadata(
    mcpId: String,
    category: Option<String>,
    categoryId: Option<Option<String>>,    // V2 [P1-6]
    tags: Option<Vec<String>>,
    enabled: Option<bool>,
) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut app_data = read_app_data()?;

    let metadata = app_data
        .mcp_metadata
        .entry(mcpId)
        .or_insert_with(McpMetadata::default);

    if let Some(cat) = category {
        metadata.category = cat;
    }
    if let Some(cid_outer) = categoryId {
        metadata.category_id = cid_outer;
    }
    if let Some(t) = tags {
        metadata.tags = t;
    }
    if let Some(e) = enabled {
        metadata.enabled = e;
    }

    write_app_data(app_data)?;
    Ok(())
}
```

> **吞吐影响评估（Reviewer C P1-1 反馈吸收）**：`update_*_metadata` 在 dropdown 改 category 时调用一次（用户级低频操作），加锁后串行排队最多增加 ~5-30ms（V2 §11 估算 DATA_MUTEX 持锁 ≤5ms IO 主导）。**对 UX 不可见**。但避免了 hierarchy 引入后用户拖动 reorder + dropdown 改 category 同时并发的 lost update 窗口。

### 3.7 单元测试 + 集成测试 + 并发测试（V2 增 4 测试）

**保留 V3 现有测试 100% 通过**：
- `apply_reorder` 6 个 unit tests（`data.rs:555-633`）— 不修改，新增 parent_id 字段不影响 generic over `HasId`。
- `reorder_integration_tests` 5 个（`data.rs:636-815`）— 不修改，ScopedDataDir 模式继续 work。

**新增 unit tests**（`data.rs::tests::validate_hierarchy_tests` 模块内，约 +60 LoC，pure function — no IO）：

| 测试名 | 输入 | 期望 |
|---|---|---|
| `promote_to_root_always_valid` | 任意 cats，`validate_hierarchy(&cats, "A", None)` | `Ok(())` |
| `rejects_self_as_parent` | `validate(_, "A", Some("A"))` | `Err(SelfAsParent)` |
| `rejects_orphan_parent` | `validate(_, "A", Some("nonexistent"))` | `Err(OrphanParent)` |
| `rejects_depth_3` | seed P (root) + A (child of P)；`validate(_, "B", Some("A"))` | `Err(DepthExceeded)`（A 已是 child，不能再做 parent — 会让 B 到 depth 2）|
| `rejects_demote_with_children` | seed P 有 child C + P2 (root)；`validate(_, "P", Some("P2"))` | `Err(DemoteWithChildren)`（P 有 child，demote 会撕散）|
| `valid_demote_root_without_children_to_another_root` | seed P1, P2 均 root（无 children）；`validate(_, "P1", Some("P2"))` | `Ok(())`（D5 = B-1 由前端 UX gate 表达；backend 仅 enforce 数据 invariant，不破坏 max depth=2 时不拒）|
| **V2 NEW** `rejects_multi_hop_cycle_defensive` | 人为构造 A→B、B→C、C→A 的损坏数据；`validate(_, "X", Some("A"))` | `Err(DepthExceeded | Cycle)`（不爆栈，hops > 32 兜底）|

代表性 case 完整代码（其余按相同 fixture pattern）：

```rust
#[test]
fn rejects_depth_3() {
    let cats = vec![
        Category { id: "P".into(), name: "P".into(), color: "#000".into(), count: 0, parent_id: None },
        Category { id: "A".into(), name: "A".into(), color: "#000".into(), count: 0, parent_id: Some("P".into()) },
        Category { id: "B".into(), name: "B".into(), color: "#000".into(), count: 0, parent_id: None },
    ];
    assert!(matches!(
        validate_hierarchy(&cats, "B", Some("A")),
        Err(HierarchyError::DepthExceeded)
    ));
}

#[test]
fn rejects_multi_hop_cycle_defensive() {
    // Pre-existing data corruption: hand-edited data.json or downgrade-then-upgrade.
    // A→B, B→C, C→A — depth>2 + cycle.
    let cats = vec![
        Category { id: "A".into(), name: "A".into(), color: "#000".into(), count: 0, parent_id: Some("B".into()) },
        Category { id: "B".into(), name: "B".into(), color: "#000".into(), count: 0, parent_id: Some("C".into()) },
        Category { id: "C".into(), name: "C".into(), color: "#000".into(), count: 0, parent_id: Some("A".into()) },
        Category { id: "X".into(), name: "X".into(), color: "#000".into(), count: 0, parent_id: None },
    ];
    // Try to make X a child of A — A's parent chain has a cycle.
    let result = validate_hierarchy(&cats, "X", Some("A"));
    assert!(matches!(
        result,
        Err(HierarchyError::DepthExceeded) | Err(HierarchyError::Cycle)
    ));
}
```

**新增 integration tests**（`reorder_integration_tests` 模块内，约 +120 LoC，沿用 `ScopedDataDir` + `seed()` helper）：

| 测试名 | 验证 |
|---|---|
| `add_category_with_parent_persists` | `add_category("C", color, Some("P"))` → reload disk → 子类的 parent_id 正确持久化为 P |
| `add_category_rejects_orphan_parent` | `add_category("X", color, Some("nonexistent"))` → returns Err |
| `add_category_rejects_grandchild_attempt` | seed P + child C；`add_category("X", color, Some("C"))` → Err（C 已是 child，不能再做 parent）|
| `set_category_parent_persists_and_returns_canonical` | seed P + X → `set_category_parent("X", Some("P"))` → 返回 Vec<Category> 中 X.parent_id == Some("P")，disk 一致 |
| `set_category_parent_rejects_cycle` | A.parent=B + 试图 B.parent=A → SelfAsParent / Cycle |
| `set_category_parent_rejects_depth_3` | seed P + child C；`set_category_parent("X", Some("C"))` → DepthExceeded |
| `set_category_parent_rejects_demote_with_children` | seed P 有 child C；`set_category_parent("P", Some("P2"))` → DemoteWithChildren |
| `delete_category_promotes_children_to_root` | seed P + C1(P) + C2(P) + Other → `delete_category("P")` → P 消失，C1/C2 parent_id == None，Other 不动 |
| **V2 NEW** `delete_category_disambiguates_promoted_children_with_existing_root_name` | seed `[Web (cat-A, root), Tools (cat-B, root), Web (cat-C, child of B)]` → `delete_category("B")` → cat-C.name 含 "Web" 且 != "Web"（disambiguated）+ cat-C.parent_id == None |
| **V2 NEW** `delete_category_disambiguates_with_numeric_suffix_when_simple_collision_exists` | seed `[Web, Web (Tools), Tools, Web (child of Tools)]` → `delete_category("Tools")` → 第二次冲突走 `Web (Tools 2)` |
| `migrate_category_id_idempotent` | seed Web + skill_metadata.category="Web" + category_id=None；首次跑迁移 → migrated=1 + flag_just_set=true；二次跑 → migrated=0 + flag_just_set=false（idempotent）|
| `migrate_category_id_orphan_left_unchanged` | seed Existing + skill_metadata.category="Vanished"（无对应 category）→ 迁移 → orphan=1，category_id 仍 None，category 仍 "Vanished"（fallback display 仍可用）|
| **V2 NEW** `migrate_category_id_writes_flag_to_app_data_not_settings` | 跑 migrate → reload disk → `data.has_completed_category_id_migration == true`；同时验证 settings.json 不含此 key（V2 [P0-DATA-1] 锁定的 flag 位置）|
| **V2 NEW** `migrate_category_id_does_not_write_flag_when_write_app_data_fails` | mock write_app_data to fail（或用只读目录）→ migrate IPC 返回 Err → reload disk → flag 仍为 false（下次启动重试）|
| **V2 NEW** `concurrent_update_metadata_and_reorder_no_lost_update` | 5 个 update_skill_metadata 线程 + 5 个 reorder_categories 线程并发；最终 skill_metadata 全部 5 项；categories 顺序为某次 reorder 的 canonical 状态（不丢更新）|

**新增 backward compat tests**（`types.rs::tests` 模块内，约 +60 LoC）：

```rust
#[test]
fn old_data_json_without_parent_id_deserializes_to_root() {
    let json = r#"{
        "categories": [{ "id": "A", "name": "Web", "color": "#3B82F6", "count": 0 }],
        "tags": [], "scenes": [], "projects": [],
        "skillMetadata": {}, "mcpMetadata": {}
    }"#;
    let data: AppData = serde_json::from_str(json).expect("deserialize");
    assert_eq!(data.categories[0].parent_id, None);
}

#[test]
fn old_data_json_without_migration_flag_deserializes_to_false() {
    // V2 [P0-DATA-1] regression test: legacy data.json without the new
    // hasCompletedCategoryIdMigration field deserialises to false.
    let json = r#"{
        "categories": [], "tags": [], "scenes": [], "projects": [],
        "skillMetadata": {}, "mcpMetadata": {}
    }"#;
    let data: AppData = serde_json::from_str(json).expect("deserialize");
    assert!(!data.has_completed_category_id_migration);
}

#[test]
fn category_with_parent_id_serde_roundtrip() {
    let cat = Category { id: "C".into(), name: "Frontend".into(), color: "#fff".into(), count: 0, parent_id: Some("P".into()) };
    let json = serde_json::to_string(&cat).expect("serialize");
    assert!(json.contains("\"parentId\":\"P\""));
    let parsed: Category = serde_json::from_str(&json).expect("deserialize");
    assert_eq!(parsed.parent_id.as_deref(), Some("P"));
}

#[test]
fn category_root_does_not_emit_parent_id_key() {
    let cat = Category { id: "C".into(), name: "Web".into(), color: "#fff".into(), count: 0, parent_id: None };
    let json = serde_json::to_string(&cat).expect("serialize");
    assert!(!json.contains("parentId"));
}

#[test]
fn old_skill_metadata_without_category_id_deserializes_to_none() {
    // V2 [P1-F3 from Reviewer F] regression: persisted-layer SkillMetadata.
    let old = r#"{
        "category": "Web",
        "tags": ["react"],
        "enabled": true,
        "usageCount": 0,
        "lastUsed": null,
        "icon": null,
        "scope": "global"
    }"#;
    let parsed: SkillMetadata = serde_json::from_str(old).expect("deserialize");
    assert_eq!(parsed.category_id, None);
}

#[test]
fn old_mcp_metadata_without_category_id_deserializes_to_none() {
    let old = r#"{
        "category": "Tools",
        "tags": [],
        "enabled": true,
        "usageCount": 0,
        "lastUsed": null,
        "scope": "global"
    }"#;
    let parsed: McpMetadata = serde_json::from_str(old).expect("deserialize");
    assert_eq!(parsed.category_id, None);
}
```

**新增并发测试**（约 +30 LoC，沿用 V3 `concurrent_reorder_and_add_no_lost_update` 模板）：

```rust
#[test]
fn concurrent_set_parent_and_add_no_lost_update() {
    let _scope = ScopedDataDir::new();
    seed(vec![cat_root("P"), cat_root("X")], vec![]);

    let mut handles = Vec::new();
    for i in 0..5 {
        handles.push(std::thread::spawn(move || {
            let _ = set_category_parent("X".into(), Some("P".into()));
        }));
    }
    for i in 0..5 {
        handles.push(std::thread::spawn(move || {
            let _ = add_category(format!("new-{}", i), "#000".into(), None);
        }));
    }
    for h in handles { h.join().unwrap(); }

    let final_data = read_app_data().expect("read_app_data");
    // 2 seeded + 5 added = 7 categories minimum
    assert!(final_data.categories.len() >= 7);
    // X's parent_id is either Some("P") or None depending on serialization
    let x = final_data.categories.iter().find(|c| c.id == "X").unwrap();
    assert!(x.parent_id == Some("P".into()) || x.parent_id == None);
    // No add_category was lost
    assert_eq!(
        final_data.categories.iter().filter(|c| c.name.starts_with("new-")).count(),
        5
    );
}
```

**估算 Rust 总测试 LoC：+270**（V1 +210 → V2 +270，含 V2 新 6 测试）。

---

## 4. 前端 Store（V2 [P0-ARCH-3] + [P0-DATA-1] + [P0-DATA-3] + [P1-7] 修订）

> 本节延续 V3 §4 的措辞与结构。

### 4.1 `categoriesVersion` 协议（继承 V3 不变）

V3 协议不变（`appStore.ts:67, 161-170, 174-205, 247-249, 277, 297-298`）：所有 mutator bump version；`loadCategories` snapshot version-before / version-after 防 autoClassify race。

**新增的 mutator 也要 bump version**：
- `addCategory` 增 `parentId` 参数后 — 内部 set 仍 bump（已有）。
- `setCategoryParent`（新）— 必须 bump。
- `migrateCategoryIdForSkillsMcps` 副作用 — 不直接 bump categoriesVersion（迁移仅改 metadata，不改 categories）；但调用方应 reload 受影响 stores（skillsStore、mcpsStore）。

### 4.2 `addCategory` 增 `parentId` 参数

```ts
// src/stores/appStore.ts:103, 237-260（修改）

interface AppState {
  // ...
  addCategory: (name: string, color: string, parentId?: string) => Promise<Category>;
  // ...
}

// 实现
addCategory: async (name: string, color: string, parentId?: string) => {
  if (!isTauri()) {
    console.warn('AppStore: Cannot add category in browser mode');
    throw new Error('Not available in browser mode');
  }

  try {
    const category = await safeInvoke<Category>('add_category', { name, color, parentId });
    if (category) {
      set((state) => ({
        categories: [...state.categories, category],
        categoriesVersion: state.categoriesVersion + 1,
      }));
      return category;
    }
    throw new Error('Failed to create category');
  } catch (error) {
    console.error('Failed to add category:', error);
    set({ error: typeof error === 'string' ? error : String(error) });
    throw error;
  }
},
```

**调用方**：
- `MainLayout.tsx:375`：`addCategory(name, '#A1A1AA')` → 不变（隐式 parentId=undefined）
- `skillsStore.ts:381`：`addCategory(categoryName, color)` → V2 显式传 `undefined`（per D14=A，§4.5）
- `mcpsStore.ts:423`：同上
- `claudeMdStore.ts:475`：同上

### 4.3 新增 `setCategoryParent` action（V2 [P1-7] 修订：fallback 优先 get_categories）

```ts
// src/stores/appStore.ts（新增）

interface AppState {
  // ...
  /** Returns Promise that resolves when backend confirms (or rejects). */
  setCategoryParent: (id: string, newParentId: string | null) => Promise<void>;
  // ...
}

// 实现 — two-phase commit 同 reorderCategories pattern
setCategoryParent: (id: string, newParentId: string | null) => {
  if (!isTauri()) return Promise.resolve();

  // Stage 1: optimistic
  const snapshot = get().categories;
  const optimistic = snapshot.map((c) =>
    c.id === id
      ? { ...c, parentId: newParentId ?? undefined }
      : c
  );

  set((state) => ({
    categories: optimistic,
    categoriesVersion: state.categoriesVersion + 1,
  }));

  // Stage 2: persist via shared queue (serial with reorderCategories)
  return enqueueReorder(async () => {
    try {
      const updated = await safeInvoke<Category[]>('set_category_parent', {
        id,
        newParentId,
      });
      if (updated) {
        // V3 P1-2 pattern: only set if backend canonical differs (avoid no-op re-render).
        // V2: also compare parentId (not just id order) since this mutation changes hierarchy.
        const current = get().categories;
        const sameOrderAndHierarchy =
          current.length === updated.length &&
          current.every((c, i) =>
            c.id === updated[i].id && c.parentId === updated[i].parentId
          );
        if (!sameOrderAndHierarchy) {
          set((state) => ({
            categories: updated,
            categoriesVersion: state.categoriesVersion + 1,
          }));
        }
      }
    } catch (error) {
      console.error('set_category_parent failed:', error);
      const message = typeof error === 'string' ? error : String(error);

      // V2 [P1-7]: Recovery — pull canonical from backend (preferred over snapshot revert,
      // since intermediate state may include other concurrent reorder/setCategoryParent
      // changes that we don't want to throw away).
      try {
        const real = await safeInvoke<Category[]>('get_categories');
        if (real) {
          set((state) => ({
            categories: real,
            categoriesVersion: state.categoriesVersion + 1,
            error: message,
          }));
          return;
        }
      } catch {}

      // Last resort: revert to snapshot (only if get_categories also fails)
      set((state) => ({
        categories: snapshot,
        categoriesVersion: state.categoriesVersion + 1,
        error: message,
      }));
    }
  });
},
```

**关键点**：
- 复用 V3 `enqueueReorder` 队列（`appStore.ts:19-25`），保证 `reorderCategories` 与 `setCategoryParent` 串行 — 用户连续操作（如先改父级再 reorder）按提交顺序执行。
- Stage 2 验证条件升级为同时比较 id 顺序 + parentId（V3 仅比较 id），确保 hierarchy 改动也走 set 路径。
- **V2 [P1-7] 修订**：fallback 优先 `get_categories`。如果用户连续触发 setCategoryParent + reorderCategories，前者成功后者失败，使用 snapshot revert 会把 setCategoryParent 的成功结果一起 revert（错位）；改用 `get_categories` 拉取 backend canonical 状态保证一致。
- **V2 [P0-ARCH-3] 关键**：返回 `Promise<void>`（不是 `void`）——这是 V1 的关键缺漏。`onDragEnd` 必须 `await` 此 Promise 完成后再算 reorder 的 ordered_ids（详 §5.2）。

### 4.4 `reorderCategories` 改造：保留同签名 + V2 [P1-7] fallback

> **决策**：`reorderCategories(orderedIds: string[])` 签名**不变**。order 由 dnd-kit 拖拽产生的 flat list 顺序决定；hierarchy 改动（parentId）走单独的 `setCategoryParent` IPC（§4.3）。

V3 实现（`appStore.ts:390-448`）几乎不动，唯一调整是 fallback 时：

```ts
// V2 [P1-7] 修订：fallback 优先 get_categories
} catch (error) {
  console.error('reorderCategories failed:', error);
  try {
    const real = await safeInvoke<Category[]>('get_categories');
    if (real) {
      set((state) => ({ categories: real, categoriesVersion: state.categoriesVersion + 1, error: errorMsg }));
      return;
    }
  } catch {}
  // Last resort: snapshot revert
  set((state) => ({ categories: snapshot, categoriesVersion: state.categoriesVersion + 1, error: errorMsg }));
}
```

> **V2 [P0-ARCH-3] 关键**：`reorderCategories` 也必须返回 `Promise<void>` 且 `await` 才能让 onDragEnd 串行 — 详 §5.2。

### 4.5 autoClassify 改造（D14=A 落根 + V2 [P1-F4] race protection）

> **决策**：autoClassify 创建新 category 时显式传 `parentId: undefined` 落根。LLM prompt **不变**（参 R6 §2 候选 A）。

**skillsStore.ts:381**（替换调用）：

```ts
// V1 之前
await addCategory(categoryName, categoryColors[colorIndex % categoryColors.length]);

// V2（**显式传 parentId=undefined 体现落根语义**）
await addCategory(
  categoryName,
  categoryColors[colorIndex % categoryColors.length],
  undefined,  // D14=A: new categories from autoClassify land at root
);
```

`mcpsStore.ts:423`、`claudeMdStore.ts:475` 对称改。**不需要修改 LLM prompt 或 schema**。

**autoClassify 写入 metadata 时同时 dual-write `category` + `category_id`，且循环内 fresh snapshot（V2 [P1-F4] 修订）**：

```ts
// skillsStore.ts:391-401（V2 修改 — 在 results 处理循环内）

// V2 修改：每次循环内 fresh `useAppStore.getState().categories`
// 而非 outer snapshot — 防止 autoClassify 创建多个新 category 时
// 第二个之后的 result 拿不到 categoryId（snapshot 是第一个 await 后的快照）。
for (const result of results) {
  const skill = skills.find((s) => s.id === result.id);
  if (skill) {
    // V2 [P1-F4] / Reviewer D §4.2 — re-read fresh (not outer snapshot)
    const cats = useAppStore.getState().categories;
    const targetCategoryId = cats.find(
      (c) => c.name === result.suggested_category,
    )?.id;
    if (!targetCategoryId) {
      console.warn(
        `Category "${result.suggested_category}" was deleted during autoClassify; skipping skill ${result.id}.`,
      );
      continue;
    }
    await safeInvoke('update_skill_metadata', {
      skillId: result.id,
      category: result.suggested_category,
      categoryId: targetCategoryId,  // V2: dual-write SoT (Option<Option<T>> outer Some(Some(id)))
      tags: result.suggested_tags,
      icon: result.suggested_icon,
    });
  }
}
```

`mcpsStore.ts` 对称改。`claudeMdStore.ts:496-508` 已经是 id 模式（`updatedCategories.find(c => c.name === result.suggested_category)?.id`），仍需把 `updatedCategories` 移到循环内（V2 [P1-F4] 同等修订）。

### 4.6 `updateSkillCategory` / `updateMcpCategory` 改造

> 现签名（`skillsStore.ts:158`、`mcpsStore.ts:144`）：`updateSkillCategory: (id, category: string) => Promise<void>`，参数是 category name string。
> V2 决策：**保留同签名**（避免破坏所有调用站点：`SkillsPage.tsx:333`、`McpServersPage.tsx:293`、`SkillDetailPanel.tsx:298`、`McpDetailPanel.tsx`）。内部把 name → id 反查后做 dual-write。

```ts
// src/stores/skillsStore.ts:158-192（修改）

updateSkillCategory: async (id, category) => {
  if (!isTauri()) {
    console.warn('SkillsStore: Cannot update skill category in browser mode');
    return;
  }
  const skill = get().skills.find((s) => s.id === id);
  if (!skill) return;
  const oldCategory = skill.category;
  const oldCategoryId = skill.categoryId;

  // Resolve name → id from current categories
  const cats = useAppStore.getState().categories;
  const newCategoryId = cats.find((c) => c.name === category)?.id;

  // Optimistic
  set((state) => ({
    skills: state.skills.map((s) =>
      s.id === id ? { ...s, category, categoryId: newCategoryId } : s,
    ),
  }));

  try {
    // V2 [P1-6]: pass categoryId via Option<Option<T>> outer-Some-inner-Some semantics.
    // newCategoryId may be undefined (no matching category) → outer Some(None) → backend clears.
    await safeInvoke('update_skill_metadata', {
      skillId: id,
      category,                                // dual-write display
      categoryId: newCategoryId === undefined ? null : newCategoryId,  // outer Some(None|Some(id))
    });
  } catch (e) {
    // Rollback
    set((state) => ({
      skills: state.skills.map((s) =>
        s.id === id ? { ...s, category: oldCategory, categoryId: oldCategoryId } : s,
      ),
    }));
    throw e;
  }
},
```

`mcpsStore.ts:144-190` 对称改。

> **JS 三态 → Rust Option<Option<T>> 映射**（V2 [P1-6] 标准化）：
> - JS `categoryId` 不在 payload 中 → Rust 外层 `None` → "不修改"
> - JS `categoryId: null` → Rust 外层 `Some(None)` → "清空"
> - JS `categoryId: "abc"` → Rust 外层 `Some(Some("abc"))` → "设为 abc"
> - JS `categoryId: undefined` → JSON.stringify 时通常被省略 → 同"不在 payload 中"，与 `null` 不同。Tauri 的 invoke 对 undefined 字段一致省略。

**未来 v2** 升级路径：调用方逐步改为 `updateSkillCategory(id, categoryId: string | undefined)`，stores 内反查 name → 写 metadata.category cached display；本任务范围**不动**这部分（避免越界 + 影响所有 dropdown 调用）。

### 4.7 `collectDescendantIds` helper（`src/utils/categoryTree.ts` 新建）

> 共享给 MainLayout（计算父类 count 聚合）+ CategoryPage（filter 解析）+ skillsStore/mcpsStore filter（如果保留 sidebar sync — 详 §4.9）。

**新文件 `src/utils/categoryTree.ts`**：

```ts
import type { Category } from '@/types';

/**
 * Collect the id of `rootCategoryId` itself plus all of its direct children.
 * Returns a `Set<string>` of category ids.
 *
 * Design notes:
 * - Max depth = 2 hard cap (D2): a child cannot have its own children, so
 *   we don't recurse beyond one level. If MAX_DEPTH ever grows, change
 *   `for (const cat of allCategories)` into a stack-based DFS.
 * - Returns `Set` (not array) because the consumers do `.has()` checks
 *   inside hot filter loops.
 * - Tolerates orphaned children (`parentId` pointing to a missing root):
 *   the orphan is a leaf, its descendants are just itself.
 */
export function collectDescendantIds(
  rootCategoryId: string,
  allCategories: Category[],
): Set<string> {
  const result = new Set<string>([rootCategoryId]);
  for (const cat of allCategories) {
    if (cat.parentId === rootCategoryId) {
      result.add(cat.id);
    }
  }
  return result;
}

/**
 * Build a Map<parentId, Category[]> in one pass for O(N) repeated lookups
 * (used by sidebar tree rendering).
 */
export function buildChildrenIndex(allCategories: Category[]): Map<string, Category[]> {
  const idx = new Map<string, Category[]>();
  for (const cat of allCategories) {
    if (cat.parentId) {
      const existing = idx.get(cat.parentId);
      if (existing) {
        existing.push(cat);
      } else {
        idx.set(cat.parentId, [cat]);
      }
    }
  }
  return idx;
}

/**
 * Check whether `ancestorId` is a (transitive) ancestor of `descendantId`.
 * Used by drag validation to detect potential cycles before sending IPC.
 */
export function isAncestorOf(
  ancestorId: string,
  descendantId: string,
  allCategories: Category[],
): boolean {
  let current: string | undefined = descendantId;
  let hops = 0;
  while (current && hops < 32) {
    const cat = allCategories.find((c) => c.id === current);
    if (!cat) return false;
    if (cat.parentId === ancestorId) return true;
    current = cat.parentId;
    hops += 1;
  }
  return false;
}
```

**对应 vitest 测试**（`src/utils/__tests__/categoryTree.test.ts`，约 +60 LoC）：覆盖 collectDescendantIds（含/不含 children / orphan）+ buildChildrenIndex + isAncestorOf。

### 4.8 `MainLayout.categoriesWithCounts` 聚合改造（D8=B）

```tsx
// src/components/layout/MainLayout.tsx:96-104（修改）

import { collectDescendantIds } from '@/utils/categoryTree';

const categoriesWithCounts = useMemo(() => {
  return categories.map((cat) => {
    // D7+D8 = 聚合：父类 count = self + children's self counts
    const idSet = collectDescendantIds(cat.id, categories);
    // 兼容期：dual-read — 优先 categoryId（SoT），fallback name（cached）
    const nameSet = new Set(
      categories
        .filter((c) => idSet.has(c.id))
        .map((c) => c.name),
    );
    return {
      ...cat,
      count:
        skills.filter((s) =>
          s.categoryId ? idSet.has(s.categoryId) : nameSet.has(s.category),
        ).length +
        mcpServers.filter((m) =>
          m.categoryId ? idSet.has(m.categoryId) : nameSet.has(m.category),
        ).length +
        claudeMdFiles.filter((f) => f.categoryId && idSet.has(f.categoryId)).length,
    };
  });
}, [categories, skills, mcpServers, claudeMdFiles]);
```

> **D8=B**（_synthesis_decisions §3）：父类 count = self + 所有 children 的 self count；子类（叶）count = 仅自身。max depth=2 让 collectDescendantIds 一次扫描即可（不需递归）。

> **dual-read 兼容期**：迁移完成前，部分 Skill/Mcp 的 `categoryId` 可能为空（未迁移 / orphan name）。优先 `categoryId`，fallback `category` name —— `migrate_category_id_for_skills_mcps` 完成后所有 Skill/Mcp 都有 `categoryId`，此 fallback 退化为冗余但无害。

### 4.9 CategoryPage filter 改造（D7=A）

```tsx
// src/pages/CategoryPage.tsx:39-93（修改）

import { collectDescendantIds } from '@/utils/categoryTree';

const { categoryId } = useParams<{ categoryId: string }>();
const { categories } = useAppStore();
const category = categories.find((c) => c.id === categoryId);

// D7=A: aggregated view — show self + all descendants
const visibleIds = useMemo(
  () => (categoryId ? collectDescendantIds(categoryId, categories) : new Set<string>()),
  [categoryId, categories],
);

// dual-read names for backward compat
const visibleNames = useMemo(
  () =>
    new Set(
      Array.from(visibleIds)
        .map((id) => categories.find((c) => c.id === id)?.name)
        .filter((n): n is string => !!n),
    ),
  [visibleIds, categories],
);

const filteredData = useMemo(() => {
  const categorySkills = skills.filter((s) =>
    s.categoryId ? visibleIds.has(s.categoryId) : visibleNames.has(s.category),
  );
  const categoryMcps = mcpServers.filter((m) =>
    m.categoryId ? visibleIds.has(m.categoryId) : visibleNames.has(m.category),
  );
  const categoryClaudeMd = claudeMdFiles.filter(
    (f) => f.categoryId && visibleIds.has(f.categoryId),
  );

  if (!search) {
    return { skills: categorySkills, mcps: categoryMcps, claudeMd: categoryClaudeMd };
  }
  // ... existing search filter unchanged
}, [skills, mcpServers, claudeMdFiles, visibleIds, visibleNames, search]);
```

> **filter 在 CategoryPage 层解析，不在 store 层**（per R6 §4 takeaway #3）。store filter shape 不破，store 仍单值。

### 4.10 一次性迁移触发（V2 [P0-DATA-1] + [P0-DATA-3] 修订）

> **V2 [P0-DATA-1]**：flag 从 `AppSettings` 移到 `AppData`，frontend 不再显式调 `write_settings` 来更新 flag。
> **V2 [P0-DATA-3]**：仅当 IPC 成功 (Ok return) 才推进；失败时不写 flag，下次重试。

**新增**（在 `appStore.ts::initApp` 内）：

```ts
// src/stores/appStore.ts:505-523（V2 修改 initApp）

initApp: async () => {
  if (!isTauri()) {
    console.warn('AppStore: Cannot initialize app in browser mode');
    set({ isLoading: false });
    return;
  }

  set({ isLoading: true, error: null });
  try {
    await safeInvoke('init_app_data');
    await Promise.all([get().loadCategories(), get().loadTags()]);

    // V2 hierarchy: trigger one-time category_id backfill if not yet done.
    // Idempotent — backend skips entries with category_id already set;
    // also early-returns if data.has_completed_category_id_migration is true.
    //
    // V2 [P0-DATA-1] note: We read `data.hasCompletedCategoryIdMigration`
    // from AppData (NOT from AppSettings — V1 path). This avoids the
    // settingsStore.saveSettings enumerate risk where the flag could be
    // silently reset to false.
    //
    // V2 [P0-DATA-3] note: We only consider migration "done" when the IPC
    // returns Ok (which means backend successfully wrote the flag to disk
    // along with the migrated metadata atomically). If write_app_data
    // failed, IPC throws — frontend doesn't advance, next launch retries.
    try {
      const data = await safeInvoke<AppData>('read_app_data');
      if (data && !data.hasCompletedCategoryIdMigration) {
        const report = await safeInvoke<MigrationReport>(
          'migrate_category_id_for_skills_mcps',
        );
        if (report) {
          console.info(
            `[migrate_category_id] migrated ${report.migratedSkills} skills + ${report.migratedMcps} mcps; orphans: ${report.orphanedSkills.length} skills + ${report.orphanedMcps.length} mcps`,
          );
          // No need to call write_settings — backend wrote the flag in AppData.
          // Reload affected stores so dual-read sees fresh categoryId fields.
          await get().loadCategories();
        }
      }
    } catch (migErr) {
      console.warn('Category id migration failed (non-fatal):', migErr);
      // Migration failed — flag remains false → next launch retries.
      // App still works because dual-read fallback (name comparison) is operational.
    }

    set({ isLoading: false });
  } catch (error) {
    console.error('Failed to initialize app:', error);
    set({ error: typeof error === 'string' ? error : String(error) });
    set({ isLoading: false });
  }
},
```

> **V1 → V2 关键差异**：
> 1. V1 调 `read_settings` + 检查 `settings.hasCompletedCategoryIdMigration`，迁移后调 `write_settings({ ...settings, hasCompletedCategoryIdMigration: true })`。**V2 删除这两次 settings IPC**——backend 自己写 flag 到 AppData。
> 2. V1 在 catch 块外仍设 flag = true（即使 migrate 失败）。**V2 catch 块内仅 console.warn，不设任何 flag**——下次启动 backend 检查 `data.hasCompletedCategoryIdMigration` 仍为 false → 重试。
> 3. V1 没有显式 reload 受影响 stores。**V2 在 migration 成功后调 `get().loadCategories()`**（注：实际 categoryId 写到 metadata，下游 skillsStore/mcpsStore 在各自 `loadSkills`/`loadMcps` 时会重新拉取，所以这里 loadCategories 主要为保证 categoriesVersion 协议；如果不需要可省略，由 04 实施时按 race 风险评估决定）。

> 迁移失败 graceful degrade：fallback 到 dual-read 的 name 比对路径，UI 层不会出现错误。

---

## 5. 组件层架构（V2 [P0-ARCH-1] + [P0-ARCH-2] + [P0-ARCH-3] + [P1-10] + [P1-11] + [P0-VIZ-2 副] + [P0-VIZ-4 副] 修订）

### 5.1 文件结构（追加项）

```
src/components/sidebar/
├── index.ts
├── CategoryInlineInput.tsx       91 行 — 不变
├── CategoryRowContent.tsx        65 行 — 改：接收 depth + showChevron props（§5.4）
├── DragOverlayCategoryRow.tsx           — 不变（per 02 §2.6 单一 row clone，不携带子树视觉）
├── SortableCategoriesList.tsx   316 行 — **核心改造**（§5.2）
├── SortableCategoryRow.tsx      136 行 — 改：depth prop + chevron 渲染 + paddingLeft transition（§5.3）
├── ChevronToggle.tsx                    — **新增**：disclosure control（§5.5，三层防御）
├── TagInlineInput.tsx                   — 不变
├── TagPillContent.tsx                   — 不变
├── DragOverlayTagPill.tsx               — 不变
├── SortableTagsList.tsx         314 行 — 不变
├── SortableTagPill.tsx          127 行 — 不变
└── dnd/
    ├── animations.ts             28 行 — 增 INDENT_STEP_PX = 16 常量
    ├── announcements.ts          86 行 — 改：增 hierarchy 措辞（§5.6）
    ├── CustomMouseSensor.ts             — 不变
    ├── snapModifier.ts          126 行 — 不变（参 R2 §6.3 论证）
    ├── treeUtilities.ts                 — **新增**：flattenTree / buildTree / getProjection / removeChildrenOf / MAX_DEPTH（§5.1.A）
    └── treeKeyboardCoordinates.ts       — **新增**：MutableRefObject<TreeSensorContext> ref 通道（§5.1.B [P0-ARCH-1]）

src/utils/
├── ...（现有）
└── categoryTree.ts                      — **新增**：collectDescendantIds / buildChildrenIndex / isAncestorOf（§4.7）
```

### 5.1.A `dnd/treeUtilities.ts`（新建）

完整 API（参 R2 §2.2-2.3 + §12 一手源码）：

```ts
// src/components/sidebar/dnd/treeUtilities.ts

import type { UniqueIdentifier } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { Category } from '@/types';

/** Hard cap: depth 0=root, 1=child. depth 2 forbidden. */
export const MAX_DEPTH = 1;

/** Visual indent per depth level (matches 02 design_spec §5: --indent-step). */
export const INDENT_STEP_PX = 16;

/**
 * V2 [P1-4]: explicit threshold for "user is in horizontal demote/promote
 * intent" — must be > Math.round(8/16) = 1's natural step boundary so users
 * don't trigger demote at sub-perceptual offsets. Mirrors 02 V2 §6.3.
 */
export const ABS_X_THRESHOLD_PX = 12;

export interface FlattenedCategory extends Category {
  parentId: string | null;
  depth: number;
  index: number;
  hasChildren: boolean;
  collapsed: boolean;
}

/**
 * Flatten Vec<Category> + parent_id graph into a depth-aware flat list,
 * preserving sibling order (root order → children order, within each parent
 * group children appear in their data.json Vec order).
 *
 * `expandedSet` semantics (V2 [P0-VIZ-3] aligned with 02 V2 §2.15):
 * - A parent id is "expanded" iff it appears in `expandedSet`.
 * - Default: parents with children are added to `expandedSet` at app load
 *   (D12 = 默认展开). User collapse removes from set; user expand adds.
 * - During drag, callers may pass `expandedSet ∪ allParentIds` for temporary
 *   "drag override expand" (P1-11 fix).
 */
export function flattenTree(
  categories: Category[],
  expandedSet: Set<string>,
): FlattenedCategory[] {
  // Build children-by-parent index in one pass
  const childrenByParent = new Map<string, Category[]>();
  for (const cat of categories) {
    if (cat.parentId) {
      const existing = childrenByParent.get(cat.parentId);
      if (existing) {
        existing.push(cat);
      } else {
        childrenByParent.set(cat.parentId, [cat]);
      }
    }
  }

  const result: FlattenedCategory[] = [];
  let index = 0;

  for (const cat of categories) {
    if (cat.parentId) continue; // children rendered below their parent

    const children = childrenByParent.get(cat.id) ?? [];
    const collapsed = !expandedSet.has(cat.id);

    result.push({
      ...cat,
      parentId: null,
      depth: 0,
      index: index++,
      hasChildren: children.length > 0,
      collapsed,
    });

    if (!collapsed) {
      for (const child of children) {
        result.push({
          ...child,
          parentId: cat.id,
          depth: 1,
          index: index++,
          hasChildren: false, // max depth=2 → child cannot have children
          collapsed: false,
        });
      }
    }
  }

  return result;
}

/**
 * During an active drag, hide the children of the dragged node so they
 * do not become drop targets. Mirrors dnd-kit Sortable Tree example pattern
 * (R2 §2.5).
 */
export function removeChildrenOf(
  items: FlattenedCategory[],
  hideParentIds: UniqueIdentifier[],
): FlattenedCategory[] {
  const hideSet = new Set(hideParentIds.map(String));
  const result: FlattenedCategory[] = [];
  for (const item of items) {
    if (item.parentId && hideSet.has(String(item.parentId))) continue;
    result.push(item);
  }
  return result;
}

interface Projection {
  depth: number;
  parentId: string | null;
  /** True if this projection is illegal (per D5 = B-1: parent → child of another parent). */
  isInvalid: boolean;
}

/**
 * Compute projected depth + parent_id from drag offset. Mirrors the dnd-kit
 * Sortable Tree example (R2 §2.3) but with our hard caps:
 *
 * - `Math.min(depth, MAX_DEPTH)` — depth 2 forbidden.
 * - If `activeItem.depth === 0` (a root being dragged) AND it has children,
 *   force depth to 0 (D5 = B-1: parent cannot become a child of another).
 *
 * V2 [P1-4 / Reviewer D §2.7]: explicit ABS_X_THRESHOLD_PX = 12 gate to align
 * with 02 V2 §6.3 "12 px X 阈值" — under naive Math.round(offset/16) the
 * effective threshold is 8 px. We use floor / sign / threshold to make 12 px
 * the actual transition point.
 *
 * The "isInvalid" flag is set when the user's gesture *intends* a depth
 * change that we cannot honour (e.g. parent → child). The caller (UI)
 * uses this to render DragOverlay opacity 0.5 + cursor: not-allowed
 * (per 02 §2.14).
 */
export function getProjection(
  items: FlattenedCategory[],
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier,
  dragOffsetX: number,
  indentationWidth: number = INDENT_STEP_PX,
): Projection {
  const overItemIndex = items.findIndex(({ id }) => id === overId);
  const activeItemIndex = items.findIndex(({ id }) => id === activeId);
  const activeItem = items[activeItemIndex];
  if (!activeItem) {
    return { depth: 0, parentId: null, isInvalid: false };
  }

  const newItems = arrayMove(items, activeItemIndex, overItemIndex);
  const previousItem = newItems[overItemIndex - 1];
  const nextItem = newItems[overItemIndex + 1];

  // V2 [P1-4]: explicit 12px threshold gate before computing dragDepth
  const dragDepth =
    Math.abs(dragOffsetX) < ABS_X_THRESHOLD_PX
      ? 0
      : Math.sign(dragOffsetX) *
        Math.min(MAX_DEPTH, Math.round(Math.abs(dragOffsetX) / indentationWidth));
  const projectedDepth = activeItem.depth + dragDepth;

  // Cap by MAX_DEPTH and previousItem-derived max
  const previousDerivedMax = previousItem ? previousItem.depth + 1 : 0;
  const maxDepth = Math.min(MAX_DEPTH, previousDerivedMax);
  const minDepth = nextItem ? nextItem.depth : 0;

  let depth = Math.max(0, Math.min(projectedDepth, maxDepth));
  if (depth < minDepth) depth = minDepth;

  // D5 = B-1: parent (root) with children cannot become a child of another root.
  // Detection: active is a root with children, and depth would become > 0.
  const activeHasChildren = items.some(
    (it) => it.parentId === String(activeItem.id),
  );
  const isParentBecomingChild = activeItem.depth === 0 && depth > 0 && activeHasChildren;
  if (isParentBecomingChild) {
    depth = 0; // force back to root; UI surfaces invalid via flag
  }

  function getParentId(): string | null {
    if (depth === 0 || !previousItem) return null;
    if (depth === previousItem.depth) return previousItem.parentId;
    if (depth > previousItem.depth) return String(previousItem.id);
    const newParent = newItems
      .slice(0, overItemIndex)
      .reverse()
      .find((it) => it.depth === depth)?.parentId;
    return newParent ?? null;
  }

  return {
    depth,
    parentId: getParentId(),
    isInvalid: isParentBecomingChild,
  };
}

/**
 * Compute number of immediate children of a category. Used by DragOverlay
 * to optionally show a "+N" badge when dragging a parent (per 02 §2.6 —
 * the badge itself is omitted in V2 spec because we keep DragOverlay as
 * single row clone; provided here for potential v2 use).
 */
export function getChildCount(items: FlattenedCategory[], id: UniqueIdentifier): number {
  return items.filter((it) => it.parentId === String(id)).length;
}
```

**单元测试**（`src/components/sidebar/dnd/__tests__/treeUtilities.test.ts`，约 +140 LoC）：覆盖 flattenTree（含 expanded/collapsed）+ removeChildrenOf + getProjection（含 max depth clamp + parent→child invalid 检测 + V2 ABS_X_THRESHOLD_PX 12px 边界）+ getChildCount。

### 5.1.B `dnd/treeKeyboardCoordinates.ts`（V2 [P0-ARCH-1] 重写 — 按官方 dnd-kit Tree example 模板）

> **V1 → V2 修订原因（Reviewer D P0-1）**：
>
> V1 实现把 `currentCoordinates.x`（屏幕**绝对坐标**）传给 `getProjection` 当作 `dragOffsetX` 用，但 `getProjection` 期待的是**累积偏移**。这让 `Math.round(absoluteX / 16)` 产生任意大数 → clamp 到 MAX_DEPTH=1 → 看起来"work"但实际不响应方向键（depth 永远停在边界）。
>
> 此外 V1 缺少：
> 1. `event.preventDefault()` 调用（dnd-kit `sortableKeyboardCoordinates` 在 sortable.esm.js:670 显式调用）。
> 2. SensorContext ref 通道：keyboardCoordinateGetter 是 `useState(() => factory())` 创建一次的稳定 closure，无法直接 close over 最新 `flattenedItems` / `offsetLeft`；必须通过 `MutableRefObject<{items, offset}>` 通道。
>
> 第三方源码引证：
> - `node_modules/@dnd-kit/core/dist/sensors/keyboard/types.d.ts:18-22`（`KeyboardCoordinateGetter` 签名 — `currentCoordinates: Coordinates` 是绝对坐标）
> - `node_modules/@dnd-kit/sortable/dist/sortable.esm.js:670`（`event.preventDefault()` 在 horizontal/vertical 命中时调用）
> - GitHub `clauderic/dnd-kit/stories/3 - Examples/Tree/SortableTree.tsx`（`sensorContext: MutableRefObject<{items, offset}>` + `useEffect` 同步模式）
> - GitHub `clauderic/dnd-kit/stories/3 - Examples/Tree/keyboardCoordinates.ts`（`const { current: { items, offset } } = context;` 取最新值）

```ts
// src/components/sidebar/dnd/treeKeyboardCoordinates.ts (V2 重写)

import type { MutableRefObject } from 'react';
import { KeyboardCode } from '@dnd-kit/core';
import type { KeyboardCoordinateGetter } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
  getProjection,
  INDENT_STEP_PX,
  MAX_DEPTH,
  type FlattenedCategory,
} from './treeUtilities';

const horizontal: string[] = [KeyboardCode.Left, KeyboardCode.Right];

/**
 * Sensor context — maintained via MutableRef in SortableCategoriesList,
 * read on each keyboard event from the closure-stable coordinateGetter.
 *
 * Why ref (not callback): dnd-kit's KeyboardSensor accepts a single
 * KeyboardCoordinateGetter created once via useState(() => factory()).
 * That closure cannot capture latest flattenedItems / offsetLeft directly
 * (would be a stale snapshot). The ref pattern is the dnd-kit-recommended
 * way to feed live state into the closure (mirrors `clauderic/dnd-kit
 * /stories/3 - Examples/Tree/SortableTree.tsx`).
 */
export interface TreeSensorContext {
  items: FlattenedCategory[];
  /** Current dragOffsetX (累积偏移, NOT absolute screen x). */
  offset: number;
}

export type TreeSensorContextRef = MutableRefObject<TreeSensorContext>;

/**
 * Hierarchy-aware keyboard coordinate getter. Extends dnd-kit's
 * `sortableKeyboardCoordinates` (which only handles ↑/↓) with ←/→ for
 * promote/demote (D6 = C+E + 02 §3 keyboard flow).
 *
 * Right Arrow during keyboard drag → demote (depth + 1, capped MAX_DEPTH).
 * Left Arrow during keyboard drag → promote (depth - 1, floored 0).
 * Other keys fall through to default vertical sortable coordinates.
 *
 * V2 [P0-ARCH-1]:
 * - Reads items + offset from `contextRef.current` (NOT closure args; NOT
 *   currentCoordinates.x which is absolute screen coord).
 * - Calls `event.preventDefault()` on horizontal hits to prevent sidebar
 *   container scroll (dnd-kit's own sortableKeyboardCoordinates does the
 *   same at sortable.esm.js:670).
 *
 * Mirrors dnd-kit Sortable Tree example (R2 §2.8) with our MAX_DEPTH=1 hard cap.
 */
export function makeTreeKeyboardCoordinates(
  contextRef: TreeSensorContextRef,
  indentationWidth: number = INDENT_STEP_PX,
): KeyboardCoordinateGetter {
  return (event, args) => {
    const { currentCoordinates, context } = args;
    const { active, over } = context;

    // Pass-through to default ↑/↓ (vertical sortable behavior)
    if (!horizontal.includes(event.code)) {
      return sortableKeyboardCoordinates(event, args);
    }

    if (!active?.id || !over?.id) return undefined;

    event.preventDefault();   // V2 [P0-ARCH-1]: prevent sidebar container scroll

    // V2 [P0-ARCH-1]: read live state from ref (not stale closure)
    const { items, offset } = contextRef.current;
    const projection = getProjection(items, active.id, over.id, offset, indentationWidth);

    switch (event.code) {
      case KeyboardCode.Left:
        // Promote: only valid if depth > 0
        if (projection.depth > 0) {
          return {
            ...currentCoordinates,
            x: currentCoordinates.x - indentationWidth,
          };
        }
        return undefined;
      case KeyboardCode.Right:
        // Demote: only valid if depth < MAX_DEPTH AND not blocked by D5 invalid
        if (projection.depth < MAX_DEPTH && !projection.isInvalid) {
          return {
            ...currentCoordinates,
            x: currentCoordinates.x + indentationWidth,
          };
        }
        return undefined;
      default:
        return undefined;
    }
  };
}
```

**SortableCategoriesList wiring**（在 §5.2 完整实现的子集）：

```tsx
// V2 [P0-ARCH-1] sensor wiring
const sensorContextRef = useRef<TreeSensorContext>({
  items: flattenedItems,
  offset: offsetLeft,
});
useEffect(() => {
  sensorContextRef.current = { items: flattenedItems, offset: offsetLeft };
}, [flattenedItems, offsetLeft]);

const [coordinateGetter] = useState(() =>
  makeTreeKeyboardCoordinates(sensorContextRef, INDENT_STEP_PX),
);

const sensors = useSensors(
  useSensor(CustomMouseSensor, { activationConstraint: { distance: 4 } }),
  useSensor(KeyboardSensor, { coordinateGetter }),
);
```

> **关键 invariant（V2）**：`coordinateGetter` 用 `useState(() => factory(...))` 创建一次（避免 sensor 重新创建）；`sensorContextRef.current` 在 `useEffect` 中同步最新值；coordinateGetter 触发时从 ref 读取。


### 5.2 `SortableCategoriesList.tsx` 改造（V2 [P0-ARCH-2] + [P0-ARCH-3] + [P1-11] + [P0-VIZ-4 副] 完整修订）

> 基于 02_design_spec V2 + R2 §6.2 完整模板。保留 V3 全部不变量（参 R2 §8 / §12）。

**保留**（V3 → V2 零变化）：
- 全部 sensors（CustomMouseSensor distance:4 + KeyboardSensor with V2 treeKeyboardCoordinates）— `:114-117`
- collisionDetection={closestCenter} — `:212`
- modifiers={[snapModifier]} — `:215`
- measuring={{ droppable: { strategy: MeasuringStrategy.Always } }} — `:216`
- accessibility={{ announcements, screenReaderInstructions }} — `:217-220`
- DragOverlay modifiers={[restrictToWindowEdges]} — `:311`
- 动态 dropAnimation（distance-aware）— `:138-159`
- justDroppedId 50ms guard — `:101, 175-177`
- handleDragCancel 重置 dropAnimationConfig — `:180-187`
- onDragStart auto-expand "Show X more" — `:131-133`
- SortableContext disabled={isInputMounted} — `:231`

**新增 state（V2）**：

```tsx
const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
const [overId, setOverId] = useState<UniqueIdentifier | null>(null);
const [offsetLeft, setOffsetLeft] = useState(0);

// V2 [P0-VIZ-3 + 02 V2 §2.15]: expandedSet semantics — set contains id ⇒ expanded.
// Default: every parent with children is added at app load (D12 = 默认展开).
const [expandedSet, setExpandedSet] = useState<Set<string>>(() =>
  loadExpandedFromLocalStorage(categories),
);

// V2 [P1-11 / Reviewer F P1-F7]: drag override — temporarily expand all parents
// during drag so user can target previously-collapsed parents.
const [dragOverrideExpand, setDragOverrideExpand] = useState(false);

// V2 [P0-VIZ-4 副 / 02 V2 §2.14]: dwell state machine OUT / HOVER_NEAR / DROP_INTO_READY
//
// State transitions:
//   OUT → HOVER_NEAR: dragMove with |X| ≥ 12 + over row exists
//   HOVER_NEAR → OUT: dragMove with |X| < 12 (cancel timer)
//   HOVER_NEAR → DROP_INTO_READY: timer expires (80ms)
//   DROP_INTO_READY → HOVER_NEAR: |X| < 12 again (revert visual, dwell timer idle)
//   HOVER_NEAR → HOVER_NEAR (new over row): cancel timer + restart 80ms
//   any → OUT: dragCancel | dragEnd
//
// dwellState is the user-perceptible state; isDwellPassed is the gate
// for projected.depth becoming "active" for visual indicator.
const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const dwellOverIdRef = useRef<UniqueIdentifier | null>(null);
const [dwellState, setDwellState] = useState<'OUT' | 'HOVER_NEAR' | 'DROP_INTO_READY'>('OUT');

// V2 [P0-ARCH-1]: SensorContext ref for keyboard coordinate getter
const sensorContextRef = useRef<TreeSensorContext>({ items: [], offset: 0 });
```

**localStorage 持久化（V2 [P0-VIZ-3] expandedSet 语义）**：

```tsx
// V2 storage key — 与 02 V2 §2.15 锁定的命名一致
const EXPANDED_KEY = 'ensemble.sidebar.expandedCategories';

function loadExpandedFromLocalStorage(categories: Category[]): Set<string> {
  if (typeof window === 'undefined') return new Set();

  // First read user preferences (already-toggled state)
  let userSet: Set<string> | null = null;
  try {
    const raw = window.localStorage.getItem(EXPANDED_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        userSet = new Set(arr.filter((x): x is string => typeof x === 'string'));
      }
    }
  } catch {
    // localStorage may be disabled (private browsing); treat as no-prefs.
  }

  if (userSet) {
    return userSet;
  }

  // Default: D12 = 默认展开 — every parent with children starts expanded
  const defaults = new Set<string>();
  for (const cat of categories) {
    if (categories.some((c) => c.parentId === cat.id)) {
      defaults.add(cat.id);
    }
  }
  return defaults;
}

function persistExpanded(ids: Set<string>): void {
  try {
    window.localStorage.setItem(EXPANDED_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // localStorage may be disabled; silently ignore.
  }
}

// V2 [P0-VIZ-3]: toggle semantics aligned with 02 V2 §2.15 expandedSet:
//   set contains id ⇒ expanded; set lacks id ⇒ collapsed.
//   Toggling collapsed→expanded: add(id); expanded→collapsed: delete(id).
//   New child created with parent → expandedSet.add(parentId) (not delete).
const toggleExpanded = useCallback((id: string) => {
  setExpandedSet((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    persistExpanded(next);
    return next;
  });
}, []);
```

**新增 useMemo**：

```tsx
// V2: flatten the tree per current data + expanded state + drag override
const flattenedItems = useMemo(() => {
  // V2 [P1-11]: dragOverrideExpand temporarily expands all parents during drag
  // so user can target previously-collapsed parents. Does NOT mutate
  // persisted expandedSet — only render override.
  const effectiveExpanded = dragOverrideExpand
    ? new Set<string>(
        categories
          .filter((c) => categories.some((cc) => cc.parentId === c.id))
          .map((c) => c.id),
      )
    : expandedSet;

  const baseFlat = flattenTree(categories, effectiveExpanded);

  // During drag, also hide the active item's children (per R2 §2.5 example
  // pattern). This prevents children from becoming drop targets while their
  // parent is in flight.
  if (activeId === null) return baseFlat;
  return removeChildrenOf(baseFlat, [activeId]);
}, [categories, expandedSet, dragOverrideExpand, activeId]);

// V2 [P0-ARCH-2]: also keep baseFlat (without removeChildrenOf) accessible
// to onDragEnd for subtree splice reconstruction.
const baseFlatRef = useRef<FlattenedCategory[]>([]);
useEffect(() => {
  const effectiveExpanded = dragOverrideExpand
    ? new Set<string>(
        categories
          .filter((c) => categories.some((cc) => cc.parentId === c.id))
          .map((c) => c.id),
      )
    : expandedSet;
  baseFlatRef.current = flattenTree(categories, effectiveExpanded);
}, [categories, expandedSet, dragOverrideExpand]);

const projected = useMemo(() => {
  if (activeId === null || overId === null || dwellState === 'OUT') return null;
  return getProjection(flattenedItems, activeId, overId, offsetLeft, INDENT_STEP_PX);
}, [flattenedItems, activeId, overId, offsetLeft, dwellState]);

const sortedIds = useMemo(() => flattenedItems.map((it) => it.id), [flattenedItems]);

// V2 [P0-ARCH-1]: sync sensor context ref
useEffect(() => {
  sensorContextRef.current = { items: flattenedItems, offset: offsetLeft };
}, [flattenedItems, offsetLeft]);

// V2 [P0-ARCH-1]: stable coordinateGetter created once
const [coordinateGetter] = useState(() =>
  makeTreeKeyboardCoordinates(sensorContextRef, INDENT_STEP_PX),
);

// V2 [E P2-3]: parentMap for announcements (childId → parentName)
const parentMap = useMemo(() => {
  const m = new Map<string, string>();
  for (const cat of categories) {
    if (cat.parentId) {
      const parent = categories.find((c) => c.id === cat.parentId);
      if (parent) m.set(cat.id, parent.name);
    }
  }
  return m;
}, [categories]);
```

**新增 handlers（V2 [P0-VIZ-4 副] dwell state machine + [P0-ARCH-2] subtree splice + [P0-ARCH-3] await IPC）**：

```tsx
const handleDragMove = (event: DragMoveEvent) => {
  const newOffset = event.delta.x;
  setOffsetLeft(newOffset);

  // V2 [P0-VIZ-4 副 / 02 V2 §2.14] dwell state machine
  // OUT / HOVER_NEAR / DROP_INTO_READY
  const newOverId = event.over?.id ?? null;
  const overChanged = newOverId !== dwellOverIdRef.current;
  const xPassesThreshold = Math.abs(newOffset) >= ABS_X_THRESHOLD_PX;

  if (overChanged) {
    // Reset dwell when over row changes (per 02 V2 §2.14 "HOVER_NEAR → HOVER_NEAR (new over row): cancel timer + restart 80ms")
    if (dwellTimerRef.current) {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
    dwellOverIdRef.current = newOverId;
    if (newOverId !== null && xPassesThreshold) {
      // OUT/HOVER_NEAR/DROP_INTO_READY → HOVER_NEAR
      setDwellState('HOVER_NEAR');
      dwellTimerRef.current = setTimeout(() => {
        // HOVER_NEAR → DROP_INTO_READY (timer expires)
        setDwellState('DROP_INTO_READY');
      }, 80);
    } else {
      // OUT
      setDwellState('OUT');
    }
  } else {
    // Same over — handle X threshold transitions
    if (xPassesThreshold) {
      // Re-enter HOVER_NEAR if previously OUT
      if (dwellState === 'OUT' && newOverId !== null) {
        setDwellState('HOVER_NEAR');
        if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = setTimeout(() => {
          setDwellState('DROP_INTO_READY');
        }, 80);
      }
      // HOVER_NEAR / DROP_INTO_READY: no transition needed (stay).
    } else {
      // |X| < 12 — back to OUT or HOVER_NEAR depending on current state
      if (dwellState === 'DROP_INTO_READY') {
        // DROP_INTO_READY → HOVER_NEAR (revert visual, dwell timer idle)
        // (per 02 V2 §2.14 "DROP_INTO_READY → HOVER_NEAR: X 重新 < 12")
        setDwellState('HOVER_NEAR');
      } else if (dwellState === 'HOVER_NEAR') {
        // HOVER_NEAR → OUT (cancel timer)
        if (dwellTimerRef.current) {
          clearTimeout(dwellTimerRef.current);
          dwellTimerRef.current = null;
        }
        setDwellState('OUT');
      }
    }
  }
};

const handleDragOver = (event: DragOverEvent) => {
  setOverId(event.over?.id ?? null);
};

const handleDragStart = (event: DragStartEvent) => {
  // V3 §2.10: auto-expand "Show X more" so user can target hidden rows
  if (!showAll && categories.length > maxVisible) {
    setShowAll(true);
  }
  // V2 [P1-11 / Reviewer F P1-F7] §2.15: also expand all collapsed parents
  // during drag (render override; does NOT mutate persisted expandedSet).
  setDragOverrideExpand(true);
  setActiveId(String(event.active.id));
  onDragStart();
};

const handleDragEnd = async (event: DragEndEvent) => {
  // Clean up dwell state
  if (dwellTimerRef.current) {
    clearTimeout(dwellTimerRef.current);
    dwellTimerRef.current = null;
  }
  dwellOverIdRef.current = null;
  setDwellState('OUT');

  const { active, over } = event;

  // V3 distance-aware dropAnimation logic — unchanged
  if (active.rect.current.translated && over) {
    const a = active.rect.current.translated;
    const o = over.rect;
    const dx = o.left + o.width / 2 - (a.left + a.width / 2);
    const dy = o.top + o.height / 2 - (a.top + a.height / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    setDropAnimationConfig(
      dist < 4
        ? null
        : {
            duration: Math.min(280, 120 + dist * 0.5),
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          },
    );
  }

  // Capture state before clearing — needed for IPC dispatch below
  const localActiveId = String(active.id);
  const localProjected = projected;
  const localOverId = over?.id ?? null;

  setActiveId(null);
  setOverId(null);
  setOffsetLeft(0);
  setDragOverrideExpand(false); // V2: restore persisted expandedSet
  onDragEnd();

  if (over && active.id !== over.id) {
    // V2 [P0-ARCH-2 / Reviewer D P0-2 / Reviewer F P0-F1]: use baseFlat (NOT
    // flattenedItems which has children removed) for subtree-aware reorder.
    const baseFlat = baseFlatRef.current;

    const activeItem = baseFlat.find((it) => it.id === active.id);
    if (!activeItem) return;

    // If projection is invalid (e.g. parent-becoming-child), drop is rejected — skip IPC.
    if (localProjected?.isInvalid) {
      return; // 02 §2.14: cursor not-allowed, no IPC dispatch
    }

    // Compute final order + parentId changes
    const finalDepth = localProjected?.depth ?? activeItem.depth;
    const finalParentId = localProjected?.parentId ?? activeItem.parentId;
    const parentChanged = finalParentId !== activeItem.parentId;

    try {
      // V2 [P0-ARCH-3 / Reviewer F P0-F2]: await setCategoryParent FIRST,
      // then compute reorder ordered_ids based on FRESH categories (which
      // now reflect the new parent_id). This prevents the stale-payload
      // double-IPC bug where reorder sees pre-setParent hierarchy.
      if (parentChanged) {
        await onSetCategoryParent(localActiveId, finalParentId);
      }

      // V2 [P0-ARCH-2 / P0-ARCH-3]: reconstruct full ordered_ids based on
      // fresh categories (after setCategoryParent if any), with subtree splice
      // (children stay adjacent to their parent).
      const freshCategories = useAppStore.getState().categories;
      const effectiveExpanded = new Set<string>(
        freshCategories
          .filter((c) => freshCategories.some((cc) => cc.parentId === c.id))
          .map((c) => c.id),
      );
      const freshBaseFlat = flattenTree(freshCategories, effectiveExpanded);

      // Find indices in fresh base flat
      const freshActiveIdx = freshBaseFlat.findIndex((it) => it.id === active.id);
      const freshOverIdx = freshBaseFlat.findIndex((it) => it.id === localOverId);
      if (freshActiveIdx === -1 || freshOverIdx === -1) return;

      // Build subtree of (active + active's children) in their fresh order.
      const activeChildIds = freshBaseFlat
        .filter((it) => it.parentId === String(active.id))
        .map((it) => String(it.id));
      const subtreeIds = new Set<string>([String(active.id), ...activeChildIds]);
      const withoutSubtree = freshBaseFlat.filter((it) => !subtreeIds.has(String(it.id)));
      const overIdxAfterRemove = withoutSubtree.findIndex((it) => it.id === localOverId);
      if (overIdxAfterRemove === -1) return;

      // Decide splice position: active was-before-over → insert after over;
      // was-after-over → insert before over.
      const insertIdx =
        freshActiveIdx < freshOverIdx ? overIdxAfterRemove + 1 : overIdxAfterRemove;

      const subtreeInOrder = freshBaseFlat.filter((it) =>
        subtreeIds.has(String(it.id)),
      );
      const newFlat = [
        ...withoutSubtree.slice(0, insertIdx),
        ...subtreeInOrder,
        ...withoutSubtree.slice(insertIdx),
      ];

      const newOrderedIds = newFlat.map((it) => String(it.id));

      // Compare with pre-drag order — only dispatch reorder if actually different
      const preDragOrder = freshBaseFlat.map((it) => String(it.id));
      const orderChanged =
        preDragOrder.length !== newOrderedIds.length ||
        preDragOrder.some((id, i) => id !== newOrderedIds[i]);

      if (orderChanged) {
        await onReorder(newOrderedIds);
      }
    } catch (err) {
      // setCategoryParent or onReorder failed — appStore handles fallback
      // (V2 [P1-7]: get_categories pull, snapshot revert). UI state already
      // restored above (setActiveId(null) etc.).
      console.error('handleDragEnd IPC failed:', err);
    }
  }

  // 50ms guard window — V3
  setJustDroppedId(localActiveId);
  setTimeout(() => setJustDroppedId(null), 50);
};

const handleDragCancel = () => {
  // V2 [Reviewer D P1-3] — clean dwell state on Esc cancel
  if (dwellTimerRef.current) {
    clearTimeout(dwellTimerRef.current);
    dwellTimerRef.current = null;
  }
  dwellOverIdRef.current = null;
  setDwellState('OUT');
  setActiveId(null);
  setOverId(null);
  setOffsetLeft(0);
  setDragOverrideExpand(false);
  setDropAnimationConfig(CATEGORY_DROP_ANIMATION);
  onDragEnd();
};
```

**新增 props**：

```tsx
interface SortableCategoriesListProps {
  // ... existing V3 props ...
  /**
   * V2 [P0-ARCH-3]: must return Promise<void> so handleDragEnd can await
   * before computing reorder ordered_ids.
   */
  onSetCategoryParent: (id: string, newParentId: string | null) => Promise<void>;
  /**
   * V2 [P0-ARCH-3]: must return Promise<void> for the same reason.
   */
  onReorder: (orderedIds: string[]) => Promise<void>;
}
```

**JSX 渲染** — 调用 `flattenedItems` 而不是直接 map `categories`，并实时 depth（V2 [Reviewer D P1-1]）：

```tsx
<DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  modifiers={[snapModifier]}
  measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
  accessibility={{
    announcements: makeAnnouncements(categories, 'category', { parentMap, expandedSet }),
    screenReaderInstructions: sidebarScreenReaderInstructions,
  }}
  onDragStart={handleDragStart}
  onDragMove={handleDragMove}
  onDragOver={handleDragOver}
  onDragEnd={handleDragEnd}
  onDragCancel={handleDragCancel}
>
  <SortableContext
    items={sortedIds}
    strategy={verticalListSortingStrategy}
    disabled={isInputMounted}
  >
    <div data-sortable-list className="flex flex-col gap-0.5">
      {flattenedItems.map((item) => {
        const isEditing = editingCategoryId === item.id;
        if (isEditing) {
          return (
            <div key={item.id} data-no-dnd="true">
              <CategoryInlineInput
                mode="edit"
                category={item}
                onSave={(name) => onCategorySave(item.id, name)}
                onCancel={() => onCategoryEditCancel()}
              />
            </div>
          );
        }
        return (
          <SortableCategoryRow
            key={item.id}
            category={item}
            // V2 [Reviewer D P1-1]: live depth follows projection during drag
            depth={
              String(item.id) === String(activeId) && projected
                ? projected.depth
                : item.depth
            }
            hasChildren={item.hasChildren}
            collapsed={item.collapsed}
            isActive={activeCategoryId === item.id}
            isEditing={false}
            justDropped={justDroppedId === item.id}
            isInvalidDrop={projected?.isInvalid && String(activeId) === String(item.id)}
            isDropIntoReady={
              dwellState === 'DROP_INTO_READY' &&
              String(overId) === String(item.id) &&
              !projected?.isInvalid
            }
            onClick={() => onCategoryClick(item.id)}
            onDoubleClick={() => onCategoryDoubleClick(item.id)}
            onContextMenu={(e) => onCategoryContextMenu(item, e)}
            onColorChange={(color) => onCategoryColorChange(item.id, color)}
            onToggleExpanded={() => toggleExpanded(item.id)}
          />
        );
      })}
      {/* Add input (unchanged) */}
      {isAddingCategory && (
        <div data-no-dnd="true">
          <CategoryInlineInput mode="add" {...addInputProps} />
        </div>
      )}
      {/* "Show X more" (unchanged) */}
    </div>
  </SortableContext>
  <DragOverlay modifiers={[restrictToWindowEdges]} dropAnimation={dropAnimationConfig}>
    {activeCategory && <DragOverlayCategoryRow category={activeCategory} />}
  </DragOverlay>
</DndContext>
```

> **关键 V2 改造点（再总结）**：
> 1. `flattenedItems` 用 `effectiveExpanded`（含 dragOverrideExpand 临时全展开）而不是直接 `expandedSet`。
> 2. `baseFlatRef` 持有未 `removeChildrenOf` 的完整 flat list，给 `handleDragEnd` 用于 subtree splice。
> 3. `handleDragEnd` 是 `async`，先 `await onSetCategoryParent`，然后基于 fresh `useAppStore.getState().categories` 重组 ordered_ids（含 active 子树）。
> 4. dwell state machine 三态完整（OUT / HOVER_NEAR / DROP_INTO_READY）；`handleDragMove` 处理 4 类 transition；`handleDragCancel` 清理。
> 5. `coordinateGetter` 用 `useState(() => factory(sensorContextRef))` 创建一次；`sensorContextRef` 在 useEffect 同步最新 items + offset。
> 6. JSX `depth={... activeId === item.id && projected ? projected.depth : item.depth}` 实时跟随。
> 7. `onSetCategoryParent` / `onReorder` props 类型必须是 `Promise<void>` 而不是 `void`。


### 5.3 `SortableCategoryRow.tsx` 改造（V2 [P1-10] paddingLeft transition + [P0-VIZ-2 副] chevron 三层防御）

```tsx
// src/components/sidebar/SortableCategoryRow.tsx:17-32（V2 修改）

interface SortableCategoryRowProps {
  category: Category;
  depth: number;                  // NEW: 0 = root, 1 = child
  hasChildren: boolean;           // NEW: true → render chevron
  collapsed: boolean;             // NEW: true → ChevronRight, false → ChevronDown
  isActive: boolean;
  isEditing: boolean;
  justDropped: boolean;
  isInvalidDrop?: boolean;        // NEW: D5 = B-1 invalid drop visual feedback
  isDropIntoReady?: boolean;      // NEW: dwell DROP_INTO_READY visual highlight
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onColorChange: (color: string) => void;
  onToggleExpanded: () => void;   // NEW (was onToggleCollapse)
}

export function SortableCategoryRow({
  category,
  depth,
  hasChildren,
  collapsed,
  isInvalidDrop,
  isDropIntoReady,
  onToggleExpanded,
  // ... existing props ...
}: SortableCategoryRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
    disabled: isEditing,
    transition: {
      duration: 220,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    },
  });

  // V2 [P1-10 / Reviewer D P1-2]: append padding-left transition so drop completion
  // doesn't snap padding instantly when depth changes.
  // useSortable returns transition as "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)"
  // — we extend it (not replace) so the existing transform timing remains.
  const baseStyle: CSSProperties = {
    transform: CSS.Translate.toString(transform),  // V3 不变量：必须用 Translate 不是 Transform
    transition:
      transition === undefined
        ? 'padding-left 220ms cubic-bezier(0.16, 1, 0.3, 1)'
        : `${transition}, padding-left 220ms cubic-bezier(0.16, 1, 0.3, 1)`,
    opacity: isDragging ? 0 : (isInvalidDrop ? 0.5 : 1),
    // V1 / V2: padding-left applied via inline style (V3 was hardcoded h-8 px-2.5)
    paddingLeft: depth * INDENT_STEP_PX + 10,  // 10 = base padding (V3 px-2.5 = 10px)
  };

  // ... existing handleClick / handleKeyDown (V3 listeners chain pattern) ...

  return (
    <div
      ref={setNodeRef}
      style={baseStyle}
      {...attributes}
      {...listenersWithoutKeyDown}
      className={`
        h-8 pr-2.5 flex items-center gap-2.5 rounded-[6px] cursor-pointer
        transition-colors duration-150
        ${isActive ? 'bg-[#F4F4F5]' : isDropIntoReady ? 'bg-[#F4F4F5]' : 'hover:bg-[#F4F4F5]'}
      `}
      onClick={handleClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      {/* V2: chevron disclosure control — only for parents with children */}
      {hasChildren && (
        <ChevronToggle
          collapsed={collapsed}
          onToggle={onToggleExpanded}
          categoryName={category.name}
        />
      )}
      <CategoryRowContent
        category={category}
        showCount
        isActive={isActive}
        onColorChange={onColorChange}
      />
    </div>
  );
}
```

> **V2 [P1-10] 关键**：`baseStyle.transition` 字符串扩展而不是替换 — useSortable 给的 `transition` 仅在拖拽期间存在（drag 时是 cubic-bezier 让位 transform；非 drag 时为 undefined）。我们追加 `padding-left 220ms` 让 depth 变化（如 cascade-promote 后 row 缩进）平滑过渡。

> **`paddingLeft` 用 inline style 而不是 className** 是因为 Tailwind 不能动态插值 px 值。CSS 变量法（参 02 §5）也可，由 04 决定具体落地形式（inline style vs CSS var）。

### 5.4 `CategoryRowContent.tsx` 改造

> 02 §2.3：**子类视觉权重等同父类**（D11 = padding-only）。所以 CategoryRowContent **不变化**——dot 颜色、字号、字色全部一致。

实际只需补一个**接口注释更新**说明 hierarchy 后此组件仍然 unchanged：

```tsx
// src/components/sidebar/CategoryRowContent.tsx:14-22 注释更新
/**
 * Shared inner content of a category row — used by both the inline sortable
 * row (`SortableCategoryRow`) and the drag overlay (`DragOverlayCategoryRow`).
 *
 * V2 hierarchy note: this component is **depth-agnostic**. Per 02 §2.3 +
 * D11, child categories share the same dot size / text color / font weight
 * as parents — hierarchy is expressed via padding-left at the row wrapper
 * level (SortableCategoryRow), not by tweaking content visuals.
 */
```

### 5.5 `ChevronToggle.tsx`（新建，V2 [P0-VIZ-2 副] 三层防御 + [Reviewer D P2-1] 单 icon + transform: rotate）

> per 02 V2 §2.4 — disclosure control，仅在父类 hasChildren 时渲染；hit-target 与 row click 分离；listeners chain（V3 P0-2 教训吸收）。

```tsx
// src/components/sidebar/ChevronToggle.tsx (V2)

import { ChevronRight } from 'lucide-react';

interface ChevronToggleProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Used in aria-label for VoiceOver. */
  categoryName: string;
}

export function ChevronToggle({ collapsed, onToggle, categoryName }: ChevronToggleProps) {
  // V2 [P0-VIZ-2 副 / 02 V2 §2.4 三层防御]:
  //   layer 1: data-no-dnd="true" — CustomMouseSensor.ts 跳过此节点
  //   layer 2: onMouseDown stopPropagation — 防止 dnd-kit listeners 接管
  //   layer 3: onClick stopPropagation — 防止冒泡到 row click（导航）

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();   // layer 3: do NOT navigate; only toggle
    onToggle();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();   // layer 2: prevent dnd-kit drag activation
  };

  // V2 [Reviewer D P2-1]: single icon + transform: rotate (not two icons swap)
  // — this gives a smooth 120ms rotation animation per 02 V2 §2.4.
  return (
    <button
      type="button"
      data-no-dnd="true"               // layer 1
      data-chevron="true"
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      aria-label={`Toggle ${categoryName} children`}
      aria-expanded={!collapsed}
      // 16 px wide hit target = 10 px chevron + 6 px gap (per 02 V2 §2.2)
      className="w-[16px] flex items-center cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[#0063E1]"
    >
      <ChevronRight
        size={10}
        className="text-[#A1A1AA]"
        style={{
          transition: 'transform 120ms cubic-bezier(0.16, 1, 0.3, 1)',
          transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
        }}
      />
    </button>
  );
}
```

> **prefers-reduced-motion** 在 `index.css` 已有 selector 增量（参 02 V2 §2.18），DOM data attribute `data-chevron="true"` 用于 selector 匹配。在 reduced-motion 下 transition: none 让 chevron 切换为即时（无旋转动画）。

> **关键差异（V1 → V2）**：V1 错误地用了"两个 icon 切换 + style.transform 0deg/0deg"自相矛盾的实现（Reviewer D P2-1 命中），V2 锁定为"单 ChevronRight + rotate(0deg ↔ 90deg) + 120ms transition" — 视觉上 chevron 旋转真的发生（不是 icon 卸载/挂载的瞬间替换）。

### 5.6 `dnd/announcements.ts` 改造（V2 [E P1-1] expandedSet 命名修正 + [E P2-3] parentMap 显式构造）

```ts
// src/components/sidebar/dnd/announcements.ts（V2 修改）

interface HierarchyContext {
  parentMap: Map<string, string>;       // childId → parentName
  expandedSet: Set<string>;             // V2: aligned with 02 V2 §2.15 + §5.2 expandedSet semantics
}

export function makeAnnouncements(
  items: NamedItem[],
  label: 'category' | 'tag',
  hierarchy?: HierarchyContext,         // NEW (optional — Tags 不传)
): Announcements {
  return {
    onDragStart({ active }) {
      const name = items.find((it) => it.id === active.id)?.name ?? String(active.id);
      return `Picked up ${label} ${name}.`;
    },
    onDragOver({ active, over }) {
      const activeName = items.find((it) => it.id === active.id)?.name ?? String(active.id);
      if (!over) {
        return `${label} ${activeName} is no longer over a droppable area.`;
      }
      const overName = items.find((it) => it.id === over.id)?.name ?? String(over.id);
      return `${label} ${activeName} is over ${overName}.`;
    },
    onDragEnd({ active, over }) {
      const activeName = items.find((it) => it.id === active.id)?.name ?? String(active.id);
      if (!over) {
        return `${label} ${activeName} was dropped.`;
      }
      const overName = items.find((it) => it.id === over.id)?.name ?? String(over.id);
      // V2 hierarchy: enrich announcement with parent change info if applicable
      if (hierarchy) {
        const newParent = hierarchy.parentMap.get(String(active.id));
        if (newParent) {
          return `${activeName} moved to child of ${newParent}.`;
        }
        // promote to root or same-level reorder — fall through to default phrasing
      }
      return `${label} ${activeName} was dropped over ${overName}.`;
    },
    onDragCancel({ active }) {
      const activeName = items.find((it) => it.id === active.id)?.name ?? String(active.id);
      return `Drag cancelled. ${label} ${activeName} returned to original position.`;
    },
  };
}
```

> 完整公告文案见 02 V2 §3 表格。本伪代码体现"扩展点 hierarchy: HierarchyContext"。`parentMap` 在 SortableCategoriesList 内 useMemo 构造（详 §5.2 末段）。

### 5.7 `MainLayout.tsx` 改造（V2 [P0-ARCH-3] await Promise）

```tsx
// src/components/layout/MainLayout.tsx（修改）

import { collectDescendantIds } from '@/utils/categoryTree';

// 改 categoriesWithCounts (参 §4.8)
const categoriesWithCounts = useMemo(() => { /* ... per §4.8 ... */ }, [...]);

// V2: handleSetCategoryParent must return Promise (P0-ARCH-3)
const { setCategoryParent } = useAppStore();

const handleSetCategoryParent = useCallback(
  async (id: string, newParentId: string | null): Promise<void> => {
    return setCategoryParent(id, newParentId);   // V2: return the Promise so SortableCategoriesList can await
  },
  [setCategoryParent],
);

const handleReorderCategories = useCallback(
  async (orderedIds: string[]): Promise<void> => {
    return reorderCategories(orderedIds);   // V2: same — must return Promise
  },
  [reorderCategories],
);

// 传递给 Sidebar
<Sidebar
  // ... existing props ...
  onSetCategoryParent={handleSetCategoryParent}
  onReorderCategories={handleReorderCategories}   // V2: now Promise<void> instead of void
/>
```

### 5.8 `Sidebar.tsx` 改造

```tsx
// src/components/layout/Sidebar.tsx（V2 修改 — Promise<void> prop types）

interface SidebarProps {
  // ... existing V3 props ...
  onSetCategoryParent?: (id: string, newParentId: string | null) => Promise<void>;
  onReorderCategories?: (orderedIds: string[]) => Promise<void>;
}

// 内部传给 SortableCategoriesList
<SortableCategoriesList
  categories={categories}
  // ... existing V3 props ...
  onSetCategoryParent={onSetCategoryParent ?? (async () => {})}
  onReorder={onReorderCategories ?? (async () => {})}
/>
```

### 5.9 Dropdown 改造（V2 [P0-DATA-4 副] + [P1-4]：完整 6+ 处枚举）

> per D9：缩进 16px + 父类可选 + chevron 不可点（dropdown 内不折叠）。
> 现有 dropdown options 是 flat list；改为按父子顺序 + 缩进表达。
>
> **V1 → V2 修订原因（Reviewer C P1-2 + Reviewer F P0-F4）**：V1 §5.9 仅列 3 处主改造（SkillDetailPanel / McpServersPage / ClaudeMdDetailPanel）。R5 grep 命中 6 处 dropdown + display 路径 + **CreateSceneModal**（V1 漏列）。V2 锁定完整列表如下：

**V2 完整改造表**：

| # | 文件:行 | 类型 | 改造 |
|---|---|---|---|
| 1 | `src/components/skills/SkillDetailPanel.tsx:238-247, 414` | dropdown | value: name → categoryId + 树形 indent |
| 2 | `src/pages/SkillsPage.tsx:218-227, 451` | dropdown | 同 #1 |
| 3 | `src/pages/SkillDetailPage.tsx:79-100` | display + (any dropdowns) | `categoryColors` lookup 改用 categoryId fallback to name |
| 4 | `src/components/mcps/McpDetailPanel.tsx:222, 378` | dropdown | 同 #1 |
| 5 | `src/pages/McpServersPage.tsx:219-228, 429` | dropdown | 同 #1 |
| 6 | `src/components/claude-md/ClaudeMdDetailPanel.tsx:149-157, 310` | dropdown | 仅树形 indent（value 已是 id） |
| **7 (V2 NEW — P0-DATA-4)** | `src/components/scenes/CreateSceneModal.tsx:447, 487, 865` | categoryFilter | 改为 categoryId-based + options 含 hierarchy（避免重名子类内容混淆） |
| 8 | `src/components/skills/SkillItem.tsx:113`, `SkillListItem.tsx:68` | display | categoryId resolve 当前 name 用 cache fallback |
| 9 | `src/components/mcps/McpListItem.tsx:76`, `McpItem.tsx:28`, `McpDetailPanel.tsx:52` | display | 同 #8 |

**典型改造伪代码**（dropdown 共享 pattern）：

```tsx
// src/components/skills/SkillDetailPanel.tsx:238-247（修改）

const categoryOptions = useMemo(() => {
  const roots = categories.filter((c) => !c.parentId);
  const childrenByParent = new Map<string, Category[]>();
  for (const cat of categories) {
    if (cat.parentId) {
      const list = childrenByParent.get(cat.parentId) ?? [];
      list.push(cat);
      childrenByParent.set(cat.parentId, list);
    }
  }

  const options: Array<{
    value: string;        // V2: now categoryId (UUID), not name
    label: string;
    color: string;
    depth: number;        // 0 = root, 1 = child
  }> = [];
  for (const root of roots) {
    options.push({ value: root.id, label: root.name, color: root.color, depth: 0 });
    for (const child of childrenByParent.get(root.id) ?? []) {
      options.push({ value: child.id, label: child.name, color: child.color, depth: 1 });
    }
  }
  return [{ value: '', label: 'Uncategorized', color: '#71717A', depth: 0 }, ...options];
}, [categories]);

const currentCategoryId =
  selectedSkill.categoryId ??
  categories.find((c) => c.name === selectedSkill.category)?.id ??
  '';

<Dropdown
  value={currentCategoryId}
  onChange={(id: string) => {
    if (typeof id === 'string') {
      const targetName = categories.find((c) => c.id === id)?.name ?? '';
      updateSkillCategory(selectedSkill.id, targetName);
    }
  }}
  options={categoryOptions}
/>
```

**Dropdown 组件**（`src/components/common/Dropdown.tsx`）的 option rendering 改造：当 option 含 `depth: 1` 时给 `padding-left: 32px`（16 base + 16 indent），保持视觉缩进。具体改动留给 04_implementation_plan。

**CreateSceneModal 特别说明（V2 [P0-DATA-4] 修订）**：

```tsx
// src/components/scenes/CreateSceneModal.tsx:447（V2 修改）

// V1 / V3 之前: name-based — V2 hierarchy 引入后会让重名子类内容混淆
// const uniqueCategories = Array.from(new Set(items.map(i => i.category)));

// V2: categoryId-based，options 含 hierarchy
const categoryFilterOptions = useMemo(() => {
  // For each unique categoryId in items, look up the resolved category metadata
  const usedCategoryIds = new Set<string>();
  for (const item of items) {
    if (item.categoryId) usedCategoryIds.add(item.categoryId);
  }
  // Build hierarchy-aware options (root first, children below)
  const opts: Array<{ value: string; label: string; depth: number }> = [];
  const roots = categories.filter((c) => !c.parentId && usedCategoryIds.has(c.id));
  for (const root of roots) {
    opts.push({ value: root.id, label: root.name, depth: 0 });
    for (const child of categories.filter((c) => c.parentId === root.id && usedCategoryIds.has(c.id))) {
      opts.push({ value: child.id, label: child.name, depth: 1 });
    }
  }
  return opts;
}, [items, categories]);

// V2: filter compare by categoryId not name
const filteredItems = useMemo(() => {
  if (!categoryFilter) return items;
  return items.filter((item) => item.categoryId === categoryFilter);
}, [items, categoryFilter]);
```

> `updateSkillCategory` 仍接受 name（§4.6 决策），所以 dropdown change 时把 id → name 反查后传 store；store 内部再做 name → id 的 dual-write。这种"id-in / name-bridge / id-out" 是过渡期的代价，未来 v2 可统一为 id-only。

---

## 6. dnd-kit 树形架构详细实现（V2 [P0-ARCH-1] + [P0-ARCH-2] + [P0-VIZ-4 副] 修订）

### 6.1 单 SortableContext + 投影深度模式（D3 = A）

> 参 R2 §3.4 + §6 完整论证：单 SortableContext + getProjection + flattenTree/buildTree 是 V3 不变量保留度最高 + LoC 最小 + 行业生产验证最完整的方案。

**关键事实**（R2 §1 一手 dnd-kit 6.3.1 源码）：
- `useSortable` 在使用 DragOverlay 时 `transform` 仅返回 cascade 让位的 transform（`sortable.esm.js:506-517`）— 不影响被拖项视觉。
- `verticalListSortingStrategy` 仅用 `activeNodeRect.height` 计算让位（`sortable.esm.js:205-258`），所以**所有 row 必须保持相同高度（h-8 = 32px）**。子类只能改 padding-left，不能改 height。
- `Modifier args` 不含父级矩形（`core/modifiers/types.d.ts:1-17`），所以 hierarchy 投影必须靠 client 在 React state 中跟踪。
- `MeasuringStrategy.Always` 在 expand/collapse 时正确重测量（`core.esm.js:1946-1952`）—— V3 已用，不改。

**V2 [P0-ARCH-2] subtree splice 算法（关键修订）**：

V1 的 `arrayMove(flattenedItems, oldIdx, newIdx)` 路径在 hierarchy 下产生数据 corruption（active 父类的 children 在 backend `apply_reorder` 中被 append 到末尾，破坏"children 紧跟 parent"的 Vec 拓扑）。Reviewer D §2.2 + Reviewer F §5.2 一致命中。

V2 算法（`handleDragEnd` 完整实现见 §5.2）：

1. 用 `baseFlatRef.current`（**未** removeChildrenOf）作为 splice 基础。
2. 找到 active 在 baseFlat 的索引 + over 的索引。
3. Build subtree = `[active.id, ...active 的 children ids]`（按 baseFlat 中 children 的 fresh 顺序）。
4. `withoutSubtree` = baseFlat 去除 subtree 后的列表。
5. 在 `withoutSubtree` 中找到 `over.id` 的索引；按"active 之前 vs 之后"决定 splice 位置。
6. 拼接：`[...withoutSubtree.slice(0, insertIdx), ...subtree, ...withoutSubtree.slice(insertIdx)]`。
7. 该结果即为完整 ordered_ids，含所有 children — backend `apply_reorder` 不会把任何 id 漏到末尾。

**V2 [P0-ARCH-3] 串行双 IPC 关键**：

V1 fire-and-forget `setCategoryParent + reorderCategories` 在 enqueueReorder 串行队列里执行——但 reorder 的 ordered_ids 是基于 setCategoryParent **之前**的 hierarchy 计算的（stale）。

V2 路径：

1. `await onSetCategoryParent(activeId, finalParentId)` — Promise 完成后 store 已更新，optimistic 也已应用。
2. 重新读 `useAppStore.getState().categories`（fresh state，含新 parent_id）。
3. 基于 fresh state 重组 baseFlat + subtree splice → ordered_ids（fresh）。
4. `await onReorder(orderedIds)` — backend 收到的 ordered_ids 与新 hierarchy 一致。

> 注：步骤 2-4 之间不会有用户重入新的拖动（前端 dnd-kit 已 setActiveId(null)，下一次 drag 必须重新触发）；但 enqueueReorder 队列仍会保证两个 IPC 串行（防御 layer 2）。

### 6.2 父类拖动时整子树的处理（D5 = B-1）

> per R2 §4.2 + 02 §2.6 + §2.14：

1. **拖动开始（onDragStart）**：用 `removeChildrenOf(flat, [activeId])` 把 active 父类的所有 children 从 flat list 中暂时移除（视觉上从 sidebar 中消失，让位空间）。**同时 `setDragOverrideExpand(true)`**（V2 [P1-11]）让所有持久化折叠的父类临时全展开。
2. **拖动期间（onDragMove）**：`getProjection` 检测 `isParentBecomingChild` → 设置 `projected.isInvalid = true`。dwell state machine 跟踪 OUT / HOVER_NEAR / DROP_INTO_READY。
3. **DragOverlay 视觉**：仅渲染父类自己的 row clone（不渲染子树，per 02 §2.6）；当 `isInvalid` 时 opacity 0.5 + cursor not-allowed（02 §2.14）。
4. **拖动结束（onDragEnd）**：`isInvalid` → 不 dispatch IPC，触发 cancel snap-back（V3 §2.7 cancel 视觉一致）。
5. **合法 drop**：`set_category_parent` IPC（如果 parentId 改了）+ `reorder_categories` IPC（如果顺序改了）— **不需要单独"携带子树搬走"的逻辑**，因为子类的 parent_id 字段没变（只是父类的 parent_id 变了），子类自动跟随父类移动到新位置。但 V2 [P0-ARCH-2] 要求 reorder 的 ordered_ids 必须包含完整 subtree（详 §6.1）。

### 6.3 子→根 promote（D6 = C + E）

> per R2 §5.2 + 02 §3：

1. **手势**：用户向左拖动子类 → `dragOffset.x ≤ -12px` → V2 [P1-4] `Math.sign(-12)` * `Math.round(12/16)` → projectedDepth = -1 → clamp 到 0（root）。
2. **80ms dwell**（per 02 V2 §6.3）：`dragOffset.x` 翻越 -12 阈值后必须停留 ≥ 80ms 才触发深度变化的视觉反馈（避免快速扫过误触）— V2 dwell state machine HOVER_NEAR → DROP_INTO_READY 表达此过程。
3. **键盘等价**：V2 [P0-ARCH-1] `treeKeyboardCoordinates` 中 Left Arrow → 通过 SensorContext ref 读 fresh items + offset → `getProjection` 检查 `projection.depth > 0` → 返回 `{ ...currentCoordinates, x: currentCoordinates.x - 16 }`。
4. **ContextMenu 兜底**（per 02 §2.20）：右键 child row → "Promote to Root" 项 → 直接调 `setCategoryParent(id, null)` IPC。

### 6.4 dwell timer 实现（V2 [P0-VIZ-4 副] 状态机完整化）

> per 02 V2 §2.14 + §6.3：完整状态机定义如下：

```
state OUT { dwell timer = idle, pending depth = baseline }
state HOVER_NEAR { dwell timer = 80ms countdown, pending depth = parent }
state DROP_INTO_READY { drop indicator 缩进 + parent row hover bg }

transitions:
  OUT → HOVER_NEAR: dragMove with |X| ≥ 12 + over row exists
  HOVER_NEAR → OUT: dragMove with |X| < 12 (cancel timer)
  HOVER_NEAR → DROP_INTO_READY: timer expires
  DROP_INTO_READY → HOVER_NEAR: |X| < 12 again (revert visual, dwell timer 重新 idle)
  HOVER_NEAR → HOVER_NEAR (new over row): cancel timer + restart 80ms
  any → OUT: dragCancel | dragEnd
```

完整代码已在 §5.2 `handleDragMove` 中给出。关键细节：

- `dwellOverIdRef` 跟踪当前 over id。
- 进入新 over → 清除旧 timer，重启 80ms timer（如果 X 跨阈值）。
- 离开 over → 立即清零（不延迟生效）。
- 翻越 X 阈值（±12px）但 over 没变 → 状态机基于 dwellState + xPassesThreshold 决定 transition。
- `handleDragCancel` 必须清 timer + setDwellState('OUT')。

> **`setTimeout(80)` 而非 `requestAnimationFrame` 的论据**：dwell 80ms 是单次延迟事件（不是动画帧），setTimeout 精度足够（< 16ms 抖动 acceptable）；rAF 在用户暂停拖动时停止触发，会让 dwell timer 失效。

> **如 02 V2 §11 R1 实测体感不佳**，可改为：(a) `setTimeout(50)` hardcode；(b) `setTimeout(0)` 取消 dwell（仅依赖 12 px 翻转）；(c) 提取为 `DWELL_MS` 常量便于实测调整。V2 默认 80ms。

### 6.5 snap modifier 不修改的论证

参 R2 §6.3 + 02 §2.10：

- `snapModifier`（`src/components/sidebar/dnd/snapModifier.ts:48-119`）是纯函数：接受 transform，返回新 transform。它在 over.rect 范围内做 Y 轴磁吸 lerp。
- hierarchy X 阈值（12px + 80ms dwell）是**完全独立维度**的 React state lazy commit 路径，与 modifier 内的连续引力函数**互不干涉**。
- 不接入 X 轴磁吸（02 §2.10 明示禁止"hidden hand 抢控制权"）。
- DragOverlay 严格跟手不水平磁吸 = V3 §2.5 的硬约束。

---

## 7. CSS 增量

### 7.1 新 token：`--indent-step: 16px`

```css
/* src/index.css :root 段（V3 token 之后追加）*/
:root {
  /* ... V3 tokens unchanged ... */
  /* V1/V2 hierarchy: indent step (single new token) */
  --indent-step: 16px;
}
```

> 02 V2 §5 仅引入这一个新 token。其余动效曲线 / 时长 / 颜色全部复用 V3 已有 token。

### 7.2 chevron 样式

```css
/* src/index.css — chevron disclosure visual rules */
[data-chevron="true"] {
  transition: color 120ms var(--ease-drag);
}
[data-sortable-list] [aria-roledescription='sortable']:hover [data-chevron="true"] {
  color: var(--color-secondary);  /* #71717A — chevron tracks row hover state */
}
```

> rotation 通过 `transform: rotate()` 实现（V2 [Reviewer D P2-1] 修订；V1 错误地用了 icon swap）。`<ChevronRight>` 单个 icon + `style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}`。Row 的 useSortable transform 与 chevron 自身的 rotate transform 不冲突，因为 chevron 是独立的 `<button>` 子节点，自身 transform 与父节点 transform 是 CSS 累积变换。

### 7.3 折叠/展开过渡（V2 决策：cascade 让位）

> per 02 V2 §2.15 实施 hint：折叠/展开**完全靠 dnd-kit cascade 让位**（V3 已有）—— children 行的加入/移除是 React 重渲染，dnd-kit `verticalListSortingStrategy` 在 row 数量变化时自动给所有受影响 row 添加 `transform: translate3d(0, ±N×32px, 0)` cascade transition（duration 220ms `--ease-drag`，参 R2 §1.5）。无需额外 height transition。

### 7.4 padding-left transition（V2 [P1-10] 新增）

```css
/* src/index.css — V2 padding-left transition for depth changes */
[data-sortable-list] [aria-roledescription='sortable'] {
  transition-property: padding-left;
  transition-duration: 220ms;
  transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}
```

> V2 [P1-10]：`SortableCategoryRow` baseStyle 在 inline style 中追加 `padding-left 220ms cubic-bezier(0.16, 1, 0.3, 1)` 已能 cover；这里 CSS selector 是 fallback 兜底，避免 useSortable 的 transition 字符串覆盖时丢失 padding-left transition。

### 7.5 prefers-reduced-motion 增量

per 02 V2 §2.18：

```css
/* src/index.css @media (prefers-reduced-motion: reduce) 段（V3 selector 之后追加）*/
@media (prefers-reduced-motion: reduce) {
  /* ... V3 selectors unchanged ... */

  /* V1/V2 hierarchy additions */
  [data-chevron="true"],
  [data-children-of],
  [data-sortable-list] [data-depth] {
    transition: none !important;
    animation: none !important;
  }
  /* V2 [P1-10]: padding-left also instant under reduced-motion */
  [data-sortable-list] [aria-roledescription='sortable'] {
    transition-property: none !important;
  }
}
```

> dwell 80ms timer 不计入 reduced-motion（02 V2 §2.18 明示：dwell 是状态防误触，不是动画）。

---

## 8. SortableCategoriesList 完整 DndContext 配置（继承 V3 + V2 修订）

> 严格保留 V3 §7 的所有不变量。本节仅总结，详细伪代码已在 §5.2 给出。

```tsx
<DndContext
  sensors={sensors}                           // V3: CustomMouseSensor distance:4 + KeyboardSensor (with V2 treeKeyboardCoordinates via MutableRef)
  collisionDetection={closestCenter}          // V3 不变
  modifiers={[snapModifier]}                  // V3 不变 — 无 hierarchy 改造
  measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}  // V3 不变
  accessibility={{
    announcements: makeAnnouncements(categories, 'category', { parentMap, expandedSet }),  // V2 加 hierarchy 上下文
    screenReaderInstructions: sidebarScreenReaderInstructions,
  }}
  onDragStart={handleDragStart}               // V2: + setDragOverrideExpand(true)
  onDragMove={handleDragMove}                 // V2: dwell state machine OUT/HOVER_NEAR/DROP_INTO_READY
  onDragOver={handleDragOver}                 // V2: setOverId
  onDragEnd={handleDragEnd}                   // V2: async — await setCategoryParent + fresh subtree splice ordered_ids + await reorder
  onDragCancel={handleDragCancel}             // V2: clean dwell timer + dragOverrideExpand
>
  <SortableContext
    items={sortedIds}                          // V2: flattened items list（含 children depth=1, with dragOverrideExpand）
    strategy={verticalListSortingStrategy}     // V3 不变
    disabled={isInputMounted}                  // V3 不变
  >
    <div data-sortable-list className="flex flex-col gap-0.5">
      {/* V2: render flattenedItems with live depth follow projection */}
      {flattenedItems.map(/* ... */)}
    </div>
  </SortableContext>
  <DragOverlay
    modifiers={[restrictToWindowEdges]}        // V3 不变
    dropAnimation={dropAnimationConfig}        // V3 distance-aware
  >
    {activeCategory && <DragOverlayCategoryRow category={activeCategory} />}
  </DragOverlay>
</DndContext>
```

---

## 9. autoClassify 改造（最小化 — D14=A + V2 [P1-F4] race protection）

> per R6 §2 候选 A：暂不感知 hierarchy，新分类一律落根。**LLM prompt 不变**。

### 9.1 三个 store 的改动行

**`src/stores/skillsStore.ts:381`**：

```ts
// V1 之前
await addCategory(categoryName, categoryColors[colorIndex % categoryColors.length]);

// V2（仅显式 parentId=undefined 体现意图，行为等同）
await addCategory(
  categoryName,
  categoryColors[colorIndex % categoryColors.length],
  undefined,  // D14=A: new categories from autoClassify always land at root
);
```

**`src/stores/mcpsStore.ts:423`** 同模式。

**`src/stores/claudeMdStore.ts:475`** 同模式。

### 9.2 metadata 写入路径加 `categoryId`（循环内 fresh snapshot）

参 §4.5：在 results 处理循环**内部**取 fresh `useAppStore.getState().categories`（V2 [P1-F4] 修订），dual-write `category` + `categoryId`（前者 cached display，后者 SoT）。如果 categoryName 在 fresh state 中找不到（race：在 autoClassify 进行中被 reorder 改名/被删除），console.warn + skip 该 skill 的 categoryId 写入（保留旧 cached name），避免写入 dangling categoryId。

### 9.3 prompt 不变

`src-tauri/src/commands/classify.rs:34-145` 的 `build_classification_prompt` 完全不动。`existingCategories` 仍是扁平 `name[]`（line 38 `categories.join(", ")`）。

> v2 候选（`R6 §2 候选 B`：让 LLM 建议父类）放到未来——本任务不实施。

---

## 10. 测试策略（V2 增 6 测试）

### 10.1 Rust 后端

**Pure unit tests**（约 +70 LoC）：
- `validate_hierarchy_tests::*`（参 §3.7）— 7 个 case 覆盖 self-as-parent / orphan / depth-3 / demote-with-children / valid-promote / valid-demote-empty / **V2 NEW** rejects_multi_hop_cycle_defensive。
- `apply_reorder` 现有 6 测试**不修改**（generic over HasId，新字段透明）。

**Integration tests**（约 +130 LoC，使用 ScopedDataDir + ENSEMBLE_DATA_DIR override）：
- `add_category_with_parent_persists`
- `add_category_rejects_orphan_parent`
- `add_category_rejects_grandchild_attempt`
- `set_category_parent_persists_and_returns_canonical`
- `set_category_parent_rejects_cycle / depth_3 / orphan / demote_with_children`
- `delete_category_promotes_children_to_root`
- **V2 NEW** `delete_category_disambiguates_promoted_children_with_existing_root_name`
- **V2 NEW** `delete_category_disambiguates_with_numeric_suffix_when_simple_collision_exists`
- `migrate_category_id_idempotent`
- `migrate_category_id_orphan_left_unchanged`
- **V2 NEW** `migrate_category_id_writes_flag_to_app_data_not_settings`
- **V2 NEW** `migrate_category_id_does_not_write_flag_when_write_app_data_fails`

**Concurrency test**（约 +50 LoC）：
- `concurrent_set_parent_and_add_no_lost_update` — 5 set_category_parent + 5 add_category 并发，断言 DATA_MUTEX 串行。
- **V2 NEW** `concurrent_update_metadata_and_reorder_no_lost_update` — 5 update_skill_metadata + 5 reorder_categories 并发（V2 [P1-5] 加锁后才有意义）。
- V3 `concurrent_reorder_and_add_no_lost_update` 仍 100% 通过。

**Backward compat tests**（约 +60 LoC，在 `types.rs::tests`）：
- `old_data_json_without_parent_id_deserializes_to_root`（serde default）
- **V2 NEW** `old_data_json_without_migration_flag_deserializes_to_false`（V2 [P0-DATA-1] regression test for AppData.has_completed_category_id_migration default）
- `old_skill_without_category_id_deserializes_to_none`
- `category_with_parent_id_serde_roundtrip`（rename_all + skip_serializing_if）
- `category_root_does_not_emit_parent_id_key`（新写入兼容老解析器）
- **V2 NEW** `old_skill_metadata_without_category_id_deserializes_to_none`（持久化层 SkillMetadata fallback）
- **V2 NEW** `old_mcp_metadata_without_category_id_deserializes_to_none`

**估算 Rust 总测试 LoC：+310**（V1 +210 → V2 +310，新增 6 测试 + 5 测试 +30 LoC）

### 10.2 前端

**Pure utility tests**（约 +160 LoC）：
- `treeUtilities.test.ts`：flattenTree（含 expanded/collapsed） / removeChildrenOf / getProjection（含 max depth clamp + parent→child invalid 检测 + **V2 ABS_X_THRESHOLD_PX 12px 边界测试**）/ getChildCount。
- `categoryTree.test.ts`：collectDescendantIds / buildChildrenIndex / isAncestorOf。
- **V2 NEW** `treeKeyboardCoordinates.test.ts`：mock `TreeSensorContextRef` + dispatch ArrowLeft / ArrowRight events → 验证返回的 Coordinates 含正确的 x 偏移；验证 `event.preventDefault` 被调用。

**Store tests**（约 +90 LoC）：
- `appStore.setCategoryParent.test.ts`：optimistic update + version bump + IPC failure rollback + **V2 [P1-7] get_categories fallback test**。
- `appStore.addCategory.test.ts`：新增 `parentId` 参数路径。
- **V2 NEW** `appStore.initApp.migration.test.ts`：mock `read_app_data` 返回 `hasCompletedCategoryIdMigration: false` → 验证调 `migrate_category_id_for_skills_mcps`；mock IPC 失败 → 验证不写 settings flag。
- `skillsStore.autoClassify.test.ts`：dual-write `category` + `categoryId` 验证 + **V2 [P1-F4] 循环内 fresh snapshot 验证**。

**Render tests**（约 +90 LoC，jsdom + RTL）：
- `SortableCategoryRow` chevron 渲染（hasChildren=true / false / collapsed=true / **V2: rotate(0deg ↔ 90deg) 切换验证**）。
- `MainLayout.categoriesWithCounts` 聚合数验证（fixture: 父=Development, 子=Frontend (3)+Backend (5)+self (2), 期望 count=10）。
- `CategoryPage` 父类聚合 filter 验证（同 fixture）。
- `Dropdown` 选项树形渲染（depth-based indent）。
- **V2 NEW** `CreateSceneModal` filter 在重名子类下 filter by categoryId（不混淆）。

**估算前端总测试 LoC：+340**（V1 +240 → V2 +340，新增 V2 测试 +100 LoC）

### 10.3 Type / Lint

V3 不变量：

```
npx tsc --noEmit && npm run test && cd src-tauri && cargo test && cargo clippy -- -D warnings
```

全绿。

---

## 11. 性能与 bundle

| 项 | 预算 | 实际预估 | 论据 |
|---|---|---|---|
| 新增 npm 依赖 | 0 | 0 | dnd-kit 库选型不变（参 §1）|
| dnd-kit bundle 增量 | 0 KB | 0 KB | 复用 V3 同版本 |
| 新增前端 LoC | ≤ 280 | ~220 | R1 §7.4 估算（迁移 ~150 + dnd-kit tree utilities ~60 + V2 dwell state machine ~10）|
| 新增 Rust LoC | ≤ 300 | ~240 | R1 §7.4 估算（types ~12 + commands ~150 + V2 [P0-DATA-2] disambiguation ~20 + V2 [P1-5] update_*_metadata 加锁 ~10 + tests separate）|
| 新增 Rust 测试 LoC | — | ~310 | §10.1 |
| 新增前端测试 LoC | — | ~340 | §10.2 |
| `flattenTree` O(n) 50 categories | < 1ms | ~0.1ms | 单 pass + Map lookup |
| `getProjection` 每帧 onDragMove | < 0.5ms | ~0.05ms | findIndex × 2 + arrayMove + parent walk ≤ 32 hops |
| `collectDescendantIds` 50 cats | < 1ms | ~0.1ms | 一次扫描 |
| `categoriesWithCounts` useMemo 重算 | ≤ 1ms | < 1ms | filter × 3 + collectDescendantIds 内嵌 |
| Rust `validate_hierarchy` | ≤ 5ms | ≤ 2.5ms | parent 链 walk 最多 32 hops（**V2 [Reviewer F P2-5] 修订 — 50 categories 实际 ~2.5ms 而非 V1 估算的 0.05ms**）|
| Rust DATA_MUTEX 持锁时长 | ≤ 5ms（IO 主导） | ≤ 5ms | read + parse + modify + serialize + write |
| `set_category_parent` 一次 IPC | ≤ 50ms | ~10-30ms | DATA_MUTEX + read + validate + write + serialize |
| 新 IPC `migrate_category_id_*` | ≤ 100ms（首次）| ~50ms | 一次性 + 数据量小 |
| **V2 NEW** `update_skill_metadata` 加锁后 | ≤ 50ms | ~10-30ms | 与 set_category_parent 同 |

---

## 12. V3 不变量保留核对（23 项 — 与 02 V2 §7 编号一致）

> 来自 R2 §10 + R2 §8 + V3 spec 全文交叉 + 02 V2 §7 拆分编号统一。任何破坏 = P0 Reject。

| # | V3 不变量 | V1 改造下保留方案 | V2 修订点 | ✅ |
|---|---|---|---|---|
| 1 | 4 px activation distance | `useSensor(CustomMouseSensor, { activationConstraint: { distance: 4 } })` 不变；hierarchy X 阈值 12px 是激活后才计算 | 不变 | ✅ |
| 2 | 两段 lift（80ms 吸盘 + 120ms 拉离）| DragOverlay 内容仍是 `<DragOverlayCategoryRow>`（裸 row clone），不涉 lift 阶段 | 不变 | ✅ |
| 3 | DragOverlay 多层 hsl 阴影 | `.drag-overlay-row` className 不动 | 不变 | ✅ |
| 4 | 12px 连续磁吸 | `snapModifier.ts` **完全不修改**（参 R2 §6.3 + 02 §2.10）| 不变 | ✅ |
| 5 | 220ms cascade（cubic-bezier(0.16, 1, 0.3, 1) 无 stagger）| `useSortable.transition = { duration: 220, easing: '...' }` 不变；hierarchy 缩进过渡复用同曲线（02 §2.8）| V2 [P1-10] 加 padding-left 220ms 同曲线 | ✅ |
| 6 | distance-aware settle（< 4px → 0ms；≥ 4px → `min(280, 120 + delta × 0.5)`）| onDragEnd 公式不动；目标 rect 在 demote/promote 后是新位置 + 新 padding-left，distance 自动正确 | 不变 | ✅ |
| 7 | Cancel snap-back 280ms cubic-bezier(0.32, 0.72, 0, 1) | hierarchy 非法区（D5/D13）复用同 cancel 视觉，不引入新 cancel | 不变 | ✅ |
| 8 | DndContext modifiers = `[snapModifier]` | 不动；hierarchy 投影是 React state，不接入 modifier（§6.5）| 不变（V2 §7 编号统一为独立条目，与 02 V2 §7 一致）| ✅ |
| 9 | DragOverlay modifiers = `[restrictToWindowEdges]` | 不动 | 不变（V2 §7 编号统一为独立条目）| ✅ |
| 10 | 全套 CSS token | hierarchy 复用所有 token；唯一新增 `--indent-step: 16px` | 不变 | ✅ |
| 11 | DATA_MUTEX 串行 + apply_reorder pure + ENSEMBLE_DATA_DIR 测试隔离 | 新增 `set_category_parent` / `migrate_*` 两个 mutator 都加 DATA_MUTEX；apply_reorder 不变（参 §3.1 grep 表）| **V2 [P1-5]** 一并修复 `update_skill_metadata` / `update_mcp_metadata` GAP — 现状缺口转为已修复 | ✅ |
| 12 | categoriesVersion / tagsVersion 协议 | 所有 hierarchy mutator（addCategory + parentId / setCategoryParent / deleteCategory cascade）都 bump version | 不变 | ✅ |
| 13 | enqueueReorder 串行 IPC 队列 | `setCategoryParent` 与 `reorderCategories` 共用同一队列（appStore.ts:19-25）| **V2 [P0-ARCH-3]** 让两个 IPC 真正串行（async + await），而非 fire-and-forget；fallback 优先 get_categories（V2 [P1-7]）| ✅ |
| 14 | data-no-dnd + CustomMouseSensor 双保险 | chevron `<button>` 加 `data-no-dnd="true"` + `onMouseDown stopPropagation`（§5.5）| **V2 [P0-VIZ-2 副]** 三层防御（layer 3 onClick stopPropagation 加上）| ✅ |
| 15 | 编辑/新增态 SortableContext 全局 disabled | 不动 | 不变 | ✅ |
| 16 | KeyboardSensor + sortableKeyboardCoordinates + announcements | KeyboardSensor 配 `treeKeyboardCoordinates`（§5.1.B）扩展 ←/→；announcements 加 hierarchy context（§5.6）| **V2 [P0-ARCH-1]** treeKeyboardCoordinates 重写为 MutableRefObject ref 通道 + event.preventDefault | ✅ |
| 17 | prefers-reduced-motion 全套尊重 | hierarchy selector 追加（§7.5）| **V2 [P1-10]** padding-left transition 也在 reduced-motion 下 transition: none | ✅ |
| 18 | "Show X more" 折叠 onDragStart 自动展开 | 不动；hierarchy 折叠是独立 state（§5.2 expandedSet）| **V2 [P1-11]** 增 dragOverrideExpand state — 拖动期间所有持久化折叠的父类临时全展开 | ✅ |
| 19 | justDroppedId 50ms guard | 不动 | 不变 | ✅ |
| 20 | 拖动期间 Refresh 按钮 disabled | 不动 | 不变 | ✅ |
| 21 | DragOverlay 显示与 inline row 同 padding（含 px-2.5 与 hierarchy 缩进）| `DragOverlayCategoryRow` 不传 depth prop（02 §2.6） + `DragOverlayCategoryRow.tsx:21` className 写死 `px-2.5`（与 inline row 同 padding base） | V2 [P0-VIZ-5 副] 措辞修正：原 V3 不变量 #20 二次推断改为基于 `DragOverlayCategoryRow.tsx:21` 实现引证 | ✅ |
| 22 | closestCenter collision detection | 不动 | 不变 | ✅ |
| 23 | MeasuringStrategy.Always | 不动 | 不变 | ✅ |

> **V2 §7 编号统一**（_v2_patch_plan §3.11）：02 V1 §7 列 22 项（合并 modifiers 一行），03 V1 §12 列 23 项（拆开）；V2 锁定 23 项，与 02 V2 §7 + 04 V2 R-V3-23 完全一致。

---

## 13. 与 ImplementationPlan 的衔接（指向 04_implementation_plan V2）

> 04 V2 实际任务命名采用 T0 / T1a-T1f / T2a-T2d / T3a-T3e / T4 / T5a-T5c / T6a-T6d（24 张任务卡）。下面按 V2 phase 列出本 03 V2 各 §X 对应的任务卡 cascade footprint。

**Wave 1 — 数据模型基础（可并行）**：
- T1a：Rust types 加 `parent_id` / `category_id` 字段 + serde roundtrip tests + backward compat tests。**V2 cascade**：增 SkillMetadata / McpMetadata 反序列化测试 + AppData.hasCompletedCategoryIdMigration 字段（不再加在 AppSettings — V2 [P0-DATA-1]）。

**Wave 2 — 后端 IPC（依赖 Wave 1）**：
- T1b：`validate_hierarchy` pure function + 7 unit tests（含 V2 NEW rejects_multi_hop_cycle_defensive）
- T1c：`add_category` 增 `parentId` + `update_category` 增 `Option<Option<String>>`（V2 [P1-6]）+ tests
- T1d：`delete_category` cascade-promote + **disambiguation**（V2 [P0-DATA-2]）+ 2 NEW tests
- T1e：新 `set_category_parent` IPC + tests + lib.rs 注册；新 `migrate_category_id_for_skills_mcps` IPC（V2 [P0-DATA-1] flag in AppData; V2 [P0-DATA-3] write flag only after success）
- T1f：scan_skills / scan_mcps 拼装 `category_id` + `update_skill/mcp_metadata` **加 DATA_MUTEX + Option<Option<T>>**（V2 [P1-5] + [P1-6]） + concurrency tests — `concurrent_set_parent_and_add_no_lost_update` + V2 NEW `concurrent_update_metadata_and_reorder_no_lost_update`

**Wave 3 — 前端 store（依赖 Wave 2）**：
- T2a：appStore initApp 触发一次性迁移（**读 AppData.hasCompletedCategoryIdMigration, NOT settings**；失败时不写 flag — V2 [P0-DATA-1] + [P0-DATA-3]）
- T2b：autoClassify chain dual-write + 显式 parentId=undefined + **循环内 fresh snapshot**（V2 [P1-F4]）
- T2c：appStore `addCategory` 增 `parentId` + 新 `setCategoryParent` action（**返回 Promise<void>** — V2 [P0-ARCH-3]）+ version bump + V2 [P1-7] get_categories fallback
- T2d：treeUtilities + categoryTree.ts + treeKeyboardCoordinates（**MutableRefObject 通道** — V2 [P0-ARCH-1]）+ 单元测试

**Wave 4 — 前端组件（依赖 Wave 3）**：
- T3a：SortableCategoriesList 改造（**dwell state machine + dragOverrideExpand + subtree splice + async handleDragEnd** — V2 [P0-ARCH-2] + [P0-ARCH-3] + [P0-VIZ-4 副] + [P1-11]）
- T3b：SortableCategoryRow 改造（**paddingLeft transition + chevron 三层防御** — V2 [P1-10] + [P0-VIZ-2 副]）+ ChevronToggle 新建（**单 icon + transform: rotate** — V2 [Reviewer D P2-1]）
- T3c：MainLayout categoriesWithCounts + Sidebar 透传（**Promise<void> prop types**）
- T3d：CategoryPage filter 改造 + ContextMenu "Promote to Root"
- T3e：**6+ dropdown** 树形渲染 + value 切换（**含 CreateSceneModal** — V2 [P0-DATA-4]）
- T4：CSS 增量（--indent-step / chevron / reduced-motion / **padding-left transition fallback**）

**Wave 5 — 测试 + 验证（依赖全部）**：
- T5a：跨 Wave 的 integration smoke tests + V2 新增测试（含 race condition + migration failure + dropdown disambiguation）
- T5b：tsc --noEmit + npm test + cargo test + cargo clippy 全绿
- T5c：dev mode 主 Agent + 用户验证 02 V2 §9 acceptance 完整 42 项（27 客观 + 12 V3 零回归 + 3 主观兜底）

**Wave 6 — 审计 + commit**：
- T6a：代码审计 SubAgent
- T6b：设计还原度审计 SubAgent
- T6c：回归扫描 SubAgent
- T6d：commit + push

依赖图：T-DM-* → T-BE-* → T-FE-* → T-QA-*。同 Wave 内任务可并行。

---

**Confidence**：93/100

**Confidence 折扣来源**：
- 5 点：V2 [P0-ARCH-2] subtree splice 算法在 child 是 active 时（不是 root active）的边界行为已设计但未实测——需 04 实施期 dev mode 拖动验证（"拖动 child 到另一 root 之下，children 顺序不影响"）。
- 2 点：V2 dwell state machine 在 transition `OUT → HOVER_NEAR → DROP_INTO_READY → HOVER_NEAR` 快速振荡场景下需 dev mode 体感验证（02 V2 §11 R1 风险）。

**核心架构层面（D1-A + D2-A + D3-A + 单 SortableContext + 投影深度 + V2 [P0-ARCH-1/2/3] 三个机制修订）有强证据**：R1 R2 R5 R6 各自独立给出相同推荐 + 14 决策已锁 + V3 不变量逐项核对通过 + dnd-kit 6.3.1 一手源码事实支撑（`KeyboardCoordinateGetter` 签名 + `sortableKeyboardCoordinates` event.preventDefault + 官方 Tree example MutableRef 模式）+ ClaudeMdFile 已经验证过 id 引用模式。

**给 04_implementation_plan V2 作者的关键 takeaway**：

1. **数据模型 + IPC 心脏 = `set_category_parent` + 双字段（category cached display + category_id SoT） + `migrate_category_id_for_skills_mcps` 一次性迁移（flag in AppData NOT AppSettings, write flag only after success）**；T-DM-* / T-BE-* 必须先于 T-FE-* 完成，但同 Wave 内可并行（参 §13 依赖图）。

2. **三大架构 P0 修订必须落地**：
   - **[P0-ARCH-1] `treeKeyboardCoordinates` 用 `MutableRefObject<{items, offset}>` 通道**（NOT `currentCoordinates.x`、NOT callback）+ `event.preventDefault()`；按 dnd-kit 官方 Tree example `clauderic/dnd-kit/stories/3 - Examples/Tree/SortableTree.tsx` + `keyboardCoordinates.ts` 一手代码模板。
   - **[P0-ARCH-2] `onDragEnd` 用 `baseFlat` (NOT `flattenedItems`) 做 subtree splice**；active + active 子树作为整体 splice 到 over 位置，保证 backend `apply_reorder` 不把 children 漏到 Vec 末尾。
   - **[P0-ARCH-3] `setCategoryParent` 与 `reorderCategories` 串行 await**；`onDragEnd` 必须 `async`，先 `await onSetCategoryParent`，然后基于 `useAppStore.getState().categories` fresh state 重组 ordered_ids，再 `await onReorder`。两个 IPC 必须返回 `Promise<void>` 不能是 `void`。

3. **max depth=2 clamp 必须 5 处同步**（§2.3：后端 validator + apply_reorder hierarchy guard + 前端 getProjection + KeyboardSensor coordinate + autoClassify 创建）—— 这是 R2 §10 U1 的关键风险，每个 task 卡的 acceptance criteria 必须把该 clamp 作为单独勾选项。

4. **V3 不变量 23 项必须每个 PR 单独 regression check**（§12）—— 任何破坏 = P0 Reject；尤其 snap modifier、220ms cascade、distance-aware settle、enqueueReorder 队列、categoriesVersion 协议这五项最容易被误改。

5. **Migration flag 必须存在 `AppData` 而非 `AppSettings`**（V2 [P0-DATA-1]）；前端 `initApp` 检查 `data.hasCompletedCategoryIdMigration` 而非 `settings.hasCompletedCategoryIdMigration`；后端 `migrate_category_id_for_skills_mcps` 写 flag in AppData 同 transaction 中；失败时（write_app_data Err）不推进 flag，下次重试。

6. **6+ dropdown 改造必须含 `CreateSceneModal`**（V2 [P0-DATA-4]）— V1 §5.9 漏列；V2 锁定完整 9 处（6 dropdown + 3 display fallback），按 §5.9 表格 1:1 落任务卡。

---

> **End of 03_tech_plan V2**
