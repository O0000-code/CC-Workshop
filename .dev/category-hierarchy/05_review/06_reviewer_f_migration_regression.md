# Reviewer F — 数据迁移安全 + 回归扫描评审

> **角色**：Reviewer F，专精数据迁移安全 / backward compat / 回归扫描。
> **职责**：评审 V1 全套（02_design_spec V1 + 03_tech_plan V1 + 04_implementation_plan V1），三大轴线：
>   1. 现有功能零回归（V1 落地不能破任何当前可用路径）
>   2. 旧 data.json 反序列化零异常（serde 默认行为 + fixture 设计）
>   3. grep 全 codebase 隐藏地雷（防止"file-shaped 心智模型"漏掉的 callsite）
> **输出**：本文件 `.dev/category-hierarchy/05_review/06_reviewer_f_migration_regression.md`
> **心态**：MEMORY 已记录"测试覆盖真实数据"事故；类似 migration 失败可能再次让用户数据丢失。最严格 + 最建设性。

---

## 0. 已读基线 checklist

### 必读基线（11 项）

- [x] `.dev/category-hierarchy/00_understanding.md`（任务边界 + 14 决策清单 + **§7 风险登记 20 项**）
- [x] `.dev/category-hierarchy/01_research/_synthesis_decisions.md`（14 决策定锤；§2.4 拒绝删 MainLayout filter sync）
- [x] `.dev/category-hierarchy/01_research/r5_impact_enumeration.md`（**完整 grep 影响清单 + 569 行 `categor` 命中 + 10 个隐藏地雷**）
- [x] `.dev/category-hierarchy/01_research/r1_data_model.md`（D1=A、D2=A、D13=A+B 论据 + 完整迁移规划）
- [x] `.dev/category-hierarchy/01_research/r6_classification_count_filter.md`（autoClassify / count / filter 行为；§4.4 标记 P0 隐藏需求）
- [x] `.dev/category-hierarchy/02_design_spec.md` V1
- [x] `.dev/category-hierarchy/03_tech_plan.md` V1
- [x] `.dev/category-hierarchy/04_implementation_plan.md` V1
- [x] `.claude/rules/grep-before-enumerate-shared-resource.md`
- [x] `.claude/rules/fallback-path-must-be-unreachable-in-test.md`
- [x] `~/.claude/projects/-Users-bo-Documents-Development-Ensemble-Ensemble2/memory/MEMORY.md`（事故背景：lost-update 测试污染 + 双字段 metadata pattern）

### 必读现状代码（核对回归点）

- [x] `src-tauri/src/types.rs:1-220, 178-220, 630-746`（数据 schema + ClaudeMdFile + ImportOptions）
- [x] `src-tauri/src/commands/data.rs:1-300, 695-815`（Mutex / apply_reorder / 现有测试）
- [x] `src-tauri/src/commands/trash.rs:335-450`（restore_claude_md 路径下的 category_id）
- [x] `src-tauri/src/commands/claude_md.rs:490-570`（update_claude_md 现状）
- [x] `src/components/layout/MainLayout.tsx:96-104, 235-239`（categoriesWithCounts + filter sync）
- [x] `src/pages/CategoryPage.tsx:39-93`
- [x] `src/stores/appStore.ts:140-450`（addCategory / updateCategory / deleteCategory / reorderCategories / 版本协议）
- [x] `src/stores/skillsStore.ts:158-192, 320-420, 450-490`（updateSkillCategory / autoClassify / getFilteredSkills）
- [x] `src/stores/mcpsStore.ts`
- [x] `src/stores/claudeMdStore.ts`
- [x] `src/stores/__tests__/appStore.test.ts:1-130`（fixture 不含 version 字段已是现状）
- [x] `src/test/helpers/tauriMock.ts:1-77`（registerMockCommand pattern）

### 评审角度

1. 旧 data.json 反序列化路径（serde 行为 + fixture 设计建议）
2. Migration 安全性（idempotent + 失败回滚 + 事务性）
3. 现有功能回归（≥ 20 核心场景）
4. 隐藏地雷（基于 grep + R5 列表）
5. V3 不变量在 hierarchy 下行为不变
6. Auto-classify chain
7. Trash 恢复
8. Cycle 检测算法 + 性能
9. 双字段 dual-write/dual-read 一致性
10. 测试 fixture 与覆盖

---

## 1. 旧 data.json 反序列化路径核查

### 1.1 V1 声称：`#[serde(default, skip_serializing_if = "Option::is_none")]` on `Option<String>` 让旧 data.json 反序列化成功

**验证 — V3 既有用例支撑（一手源）**：

`src-tauri/src/types.rs:24-33` 已 in-tree 7 处使用相同模式：

```rust
#[serde(skip_serializing_if = "Option::is_none")]
pub install_source: Option<String>,
#[serde(skip_serializing_if = "Option::is_none")]
pub plugin_id: Option<String>,
// ... 还有 plugin_name, marketplace, plugin_enabled
```

`types.rs:160-176`：`AppData` 中 `imported_plugin_skills` / `claude_md_files` / `global_claude_md_id` 均用 `#[serde(default)]` 或 `#[serde(skip_serializing_if = ...)]`，已经被生产环境老 data.json 反序列化验证过。

`types.rs:653`：`ClaudeMdFile.category_id: Option<String>` 已是同模式，**已生产验证**。

**结论**：T1a 加 `parent_id` / `category_id` 用同一模式安全。**赞赏点 #1**。

### 1.2 `#[serde(default)]` 行为确认（防 LLM cross-language trap）

来自 MEMORY："Serde `#[serde(default)]` on String = empty string when key missing (not when parse fails)"。

- `Option<String>` 字段：缺 key → `None`（非 panic）。
- `Option<bool>` 字段：缺 key → `None`。
- 但若 key **存在但类型不对**（例如 `parentId: 123`）→ 反序列化整体失败。
- **HashMap 字段的隐患**（已记入 MEMORY："如果 ANY entry 失败，整个 HashMap fail"）：`AppData.skill_metadata: HashMap<String, SkillMetadata>` — 如果某个 SkillMetadata 实例反序列化失败，**整个 AppData::deserialize 失败**，不是仅丢失这一项。

V1 在 SkillMetadata 加 `category_id: Option<String>` + `#[serde(default, skip_serializing_if = "Option::is_none")]` 是安全的（缺 key 反序列化为 None；不会让 entry 失败）。

**P1 — fixture 缺口**：测试套件应包含一项"old 类型嵌套字段"测试：

```rust
// 旧 SkillMetadata JSON（V1 之前）
let old_skill_meta = r#"{
    "category": "Web",
    "tags": ["react"],
    "enabled": true,
    "usageCount": 0,
    "lastUsed": null,
    "icon": null,
    "scope": "global"
}"#;
let parsed: SkillMetadata = serde_json::from_str(old_skill_meta).expect("...");
assert_eq!(parsed.category_id, None);
```

03 §3.7 给的 backward compat tests 列表覆盖了 Category.parent_id 与 Skill.category_id，但**没有显式 SkillMetadata.category_id 单元测试**——T1a 任务卡也没有。**T1a 应增加**：
- `old_skill_metadata_without_category_id_deserializes_to_none`
- `old_mcp_metadata_without_category_id_deserializes_to_none`

### 1.3 旧 data.json 完整 fixture 设计（建议补给 T1a 或 T1g）

**V1 建议追加 fixture**：

| Fixture 名 | 内容 | 应反序列化为 |
|---|---|---|
| `data_v0_no_hierarchy_no_category_id.json` | 旧版 data.json（无 parentId, 无 categoryId 任何处） | 全 root；全 None |
| `data_v0_partial_hierarchy.json` | 部分 categories 含 parentId（人为构造），其他不含 | 含字段的为 child，不含字段的为 root |
| `data_v0_with_orphan_parent.json` | 某 category.parentId 指向不存在 id | 反序列化成功（serde 不验证引用），UI 显示 fallback |
| `data_v0_with_grandchild.json` | 人为构造 depth=3（不法但可能从外部修改 data.json 引入） | 反序列化成功；UI 显示但 backend mutator 之后会 reject 改动 |
| `data_v0_skill_metadata_unmigrated.json` | skill_metadata.category="Web"，category_id 缺失 | 反序列化成功；migrate IPC 后 category_id 写入 |
| `data_v0_mixed_metadata.json` | skill_metadata 一半已有 category_id（手动迁过）一半未迁 | migrate IPC 跳过已有的 |

**T1g 建议追加任务**：将上述 fixture 文件落到 `src-tauri/tests/fixtures/category_hierarchy_v1/`，作为 integration 反序列化测试输入。当前 03/04 的 fixture 仅 inline JSON 字符串，缺少"完整 data.json 块"测试。

### 1.4 现状 fixture 缺失

`src/stores/__tests__/appStore.test.ts:8-20` 已经 reset state 缺 `categoriesVersion` / `tagsVersion` 字段（V3 现状已存在的小 bug — beforeEach 未涵盖这两个 version 计数器，导致 setState 之后 categoriesVersion 仍是上次测试的值）。**这与 V1 本任务无关，但 V1 落地后任何含 hierarchy fixture 的 state reset 应该一并修这个**：

```ts
// 推荐 V1 测试 fixture 模板（T5a 应统一）
useAppStore.setState({
  activeCategory: null,
  activeTags: [],
  categories: [],
  tags: [],
  counts: { skills: 0, mcpServers: 0, scenes: 0, projects: 0 },
  isLoading: false,
  error: null,
  editingCategoryId: null,
  isAddingCategory: false,
  editingTagId: null,
  isAddingTag: false,
  categoriesVersion: 0,        // V3 缺失，V1 fixture 应补
  tagsVersion: 0,              // 同上
});
```

**P2** — 不阻塞 V1，但建议 T5a 在写新 fixture 时一并修。

### 1.5 反序列化路径核查总评

✅ V1 数据模型新增字段都用 `#[serde(default, skip_serializing_if = "Option::is_none")]`，旧 data.json 反序列化安全。
✅ V3 已有 7 处同模式 in-tree 验证。
⚠ T1a 未显式覆盖 SkillMetadata / McpMetadata 反序列化（仅覆盖 Skill / McpServer / Category）— **P1 补 fixture**。
⚠ 缺乏完整 fixture 文件套件（仅 inline JSON 字符串）— **P2 补 fixture 文件**。

---

## 2. Migration 安全性核查

### 2.1 `migrate_category_id_for_skills_mcps` 的事务性

**03 §3.4 + 04 T1e 实现路径**：

```
1. _guard = DATA_MUTEX.lock()
2. mut data = read_app_data()
3. (loop) build categories_by_name + 遍历 skill_metadata + mcp_metadata 写入
4. write_app_data(data)
5. _guard 释放
```

**事务性评估**：

✅ 持锁 + read → modify → write 同步执行（R-V3-10 不变量保留）。
✅ idempotent — 跳过 `category_id.is_some()` 的 entries（03 §3.4 + 04 T1e）。
✅ orphan 处理 — name 找不到时 leave unchanged，不丢数据（03 §3.4）。

**P0 — write_app_data 失败的事务性问题**：

03 §3.4 的实现是：
```rust
// (modify in memory)
write_app_data(data)?;
```

如果 `write_app_data` 失败（如 disk full / 权限错误 / 文件系统瞬态），**已修改的 data 没写入**，但 `Result::Err` 返回。这本身没问题（in-memory mutation lost on Err）。

但是在 04 T2a `initApp` 中：
```ts
await safeInvoke('migrate_category_id_for_skills_mcps');
await safeInvoke('write_settings', {
  settings: { ...settings, hasCompletedCategoryIdMigration: true },
});
```

**如果 write_app_data 失败但前端不知道并设置了 flag** — settings.hasCompletedCategoryIdMigration = true，但实际数据没迁移。**下次启动跳过 migration → metadata 永远停留在 V0 半状态**。

03 §4.10 提到："迁移失败 graceful degrade — fallback 到 dual-read 的 name 比对路径，UI 层不会出现错误。" — 这是用户视角下的 fallback，但**违反 idempotent 设计意图**（重启不会重新尝试）。

**修复建议**（V2 patch）：把 settings flag 写入挪到迁移成功才执行：

```ts
try {
  const report = await safeInvoke<MigrateCategoryIdReport>('migrate_category_id_for_skills_mcps');
  if (report) {  // IPC 真的成功
    await safeInvoke('write_settings', {
      settings: { ...settings, hasCompletedCategoryIdMigration: true },
    });
  }
} catch (migErr) {
  console.warn('Category id migration failed (non-fatal):', migErr);
  // 不写 flag → 下次启动重试
}
```

**或者更保守 — 失败时主动重置 flag**：

```ts
} catch (migErr) {
  console.warn('Category id migration failed:', migErr);
  // 显式重置 flag（如已被部分写入，下次重试）
  await safeInvoke('write_settings', {
    settings: { ...settings, hasCompletedCategoryIdMigration: false },
  });
}
```

**04 T1e + T2a 必须显式补这一点**。

### 2.2 双字段共存 dual-write 一致性

**03 §2.2 dual-write 设计**：写时 dual-write `category` + `category_id`；读时 prefer id。

**P0 风险 — write_app_data 失败导致 dual-write 不一致**：

`update_skill_metadata`（V1 改造后接受 category_id）当前**不持 DATA_MUTEX**（03 §3.1 grep 表已识别为已知 P1 现状缺口）。如果用户连续两次更改 category（第一次 disk write 失败、第二次成功），中间 read 可能看到 `metadata.category="A"` + `metadata.category_id="B"` 这种**字段间不一致**。

**修复建议**：要么补 DATA_MUTEX（与 V3 一致），要么显式接受这种不一致并在 dual-read 路径中明确"id 优先"。03 §2.2 表格已选后者，**但前端 SkillItem.tsx / MainLayout 等 dual-read 实现必须严格 prefer id**。

V1 03 §4.8 / §4.9 dual-read 写得对：
```ts
s.categoryId ? idSet.has(s.categoryId) : nameSet.has(s.category)
```

但 03 §5.9 dropdown value：
```ts
const currentCategoryId = selectedSkill.categoryId ?? categories.find((c) => c.name === selectedSkill.category)?.id ?? '';
```

✅ 优先 id，fallback name → id 反查。OK。

**P1 — 用户 rename category 后 dual-write 不同步**：

如果 user 把 category "Web" rename 为 "Network"：
- `Category.name` 改了
- `Skill.category_id` 仍指向旧 id
- `Skill.category` 仍是 "Web"（cached display 不主动同步）

dual-read 优先 id → 通过 `categories.find(c => c.id === categoryId)?.name` 解析得到 "Network" — UI 正确。OK。

**问题**：`getCategoryColor(skill.category)` (utils/constants.ts:20-21) 仍按旧 name "Web" 查找——**这是 V3 现状已有的行为**，rename 后 fallback color 可能不一致。但不属于 V1 引入的回归。

### 2.3 settings.hasCompletedCategoryIdMigration flag 的隐患

**P1 — settings.json 与 data.json 不一致风险**：

settings.json 是独立文件，**不与 data.json 共享 DATA_MUTEX**（settings 用 `read_settings`/`write_settings`，data 用 `read_app_data`/`write_app_data`）。

场景：用户在 V0 时启动，迁移开始：
1. T+0: `read_app_data` （DATA_MUTEX 持锁）
2. T+10ms: 修改 data 内存中
3. T+20ms: `write_app_data` 释放锁
4. T+30ms: `write_settings({ hasCompletedCategoryIdMigration: true })`

若步骤 4 失败（settings.json 写不进去）— data 已迁移但 flag 未设。下次启动会重新 migrate（idempotent → 无副作用，OK）。**不构成 P0**。

但若反过来：步骤 4 成功，但 settings.json 和 data.json 之间有 OS 缓存导致跨次启动看到不一致状态——**理论可能但极低概率**。

**建议**：在 settings flag 之外，也在 data.json 中冗余存储一个 `dataSchemaVersion: u32` 字段（next iteration），让 backend 自检数据形态。**P2，不阻塞 V1**。

### 2.4 用户禁用迁移的可能性

00_understanding §5 / 14 决策中没有"用户可以拒绝迁移"的选项。任务卡也没有。

**P2 — 用户视角期望**：用户可能希望"看到迁移报告并 confirm 后再写入"。V1 的设计是**首次启动静默执行**——如果用户感觉"突然有些 metadata 变了"会困惑。

**建议**（V2 候选，不阻塞 V1）：
- 主 Agent 启动 dev mode 时弹一次"Found N legacy categories without ID, migrating now..." 提示。
- 或在 settings.json 中加 `enableCategoryIdMigration: bool`（默认 true）允许用户禁用。

V1 范围内**可接受静默迁移**（行为正确 + idempotent + safe），但**用户期望**层面建议在 commit message 或 CHANGELOG.md 中明示"V1 引入一次性 metadata 迁移"。

### 2.5 旧客户端读新 data.json 的行为（downgrade safety）

如果用户运行 V1 创建了带 hierarchy 的 data.json，然后**回退到 V0 客户端**：

- V0 不认识 `parentId` 字段 → serde 默认行为 = **报错**（除非 V0 用 `#[serde(deny_unknown_fields)]`，但项目没用 — 已 grep 确认）。

**实际行为**：V0 反序列化时**忽略未知字段**（serde 默认）。

但 V0 的逻辑：
- `apply_reorder` 处理整个 categories Vec — 不会丢 hierarchy 信息（id 不变）
- `delete_category` 在 V0 不 cascade-promote — 删父类后子类的 parent_id 仍指向 deleted id（**dangling**）
- 然后 V1 客户端重启时 `validate_hierarchy` 看到 orphan → **拒绝 set_category_parent 操作**，但 categories 数组本身仍然合法（serde 反序列化通过）

**结论**：downgrade safe（无数据丢失），但用户在 V0 期间删父类后再升 V1 → 需要清理 orphan parent_id refs。这属于 edge case，建议：

**修复建议**（V2 patch — T1e 增强）：`migrate_category_id_for_skills_mcps` 同时处理 orphan parent_id（清空指向已删除 id 的 parent_id）：

```rust
// V1+ 增量
for cat in data.categories.iter_mut() {
    if let Some(pid) = &cat.parent_id {
        if !data.categories.iter().any(|c| c.id == *pid) {
            cat.parent_id = None;  // orphan → promote to root
        }
    }
}
```

**P2** — V1 不阻塞，但 commit message 应注明"未来 downgrade 后 orphan 清理需手动跑或 v2 自动处理"。

### 2.6 Migration 安全性总评

✅ idempotent 设计正确（03 §3.4 + 04 T1e）。
✅ DATA_MUTEX 持锁覆盖（03 §3.1 grep 已枚举）。
✅ orphan name 处理正确（leave unchanged）。
🔴 **P0 — `initApp` flag 写入时机错误**：失败时不应写 flag，否则下次启动跳过失败的迁移（§2.1）。
⚠ **P1 — fixture 缺 SkillMetadata / McpMetadata 反序列化覆盖**（§1.2）。
⚠ **P1 — write_app_data 失败 dual-write 不一致**（§2.2）— 已知 V3 缺口，本任务不引入但放大影响。
⚠ **P2 — settings flag 与 data.json 跨文件一致性**（§2.3）。
⚠ **P2 — downgrade orphan parent_id 清理**（§2.5）。

---

## 3. 现有功能回归核查

> 基于 R5 grep 结果（569 行 categor 命中 + 5 dropdown + 3 autoClassify + 隐藏地雷 10 项）+ 主动扫描 ≥ 20 核心场景。

### 3.1 Skills 路径（5 项）

| 场景 | V1 改造 | 回归风险 | 状态 |
|---|---|---|---|
| **Skills 列表渲染** | T1f 加 categoryId 字段；列表组件不必改 | 低 — UI 仍按 `skill.category` 显示 cached name | ✅ |
| **Skills 详情 Dropdown** | T3e 改 dropdown 树形 + value=id + onChange 反查 name 调 updateSkillCategory(name) | 中 — V3 onChange 调 store.updateSkillCategory(category: string)，T2b 内部反查 id 后 dual-write | ⚠ 见 §3.10 |
| **Skills 删除** | 不改 | 无 | ✅ |
| **Skills 自动分类（autoClassify）** | T2b dual-write + 显式 parentId=undefined | 中 — D14=A 落根；R6 §1 链路图详细 | ✅ 见 §6 |
| **Skills filter sync (sidebar)** | **未改** — V3 已 broken（filter.category 收 categoryId 但 store 比 name） | 低 — V1 不引入回归，但 V1 落地后 broken 影响放大（dual-read 路径未覆盖 store filter）| ⚠ 见 §3.10 |

### 3.2 MCP 路径（5 项）

| 场景 | V1 改造 | 状态 |
|---|---|---|
| MCPs 列表渲染 | 同 Skills | ✅ |
| MCPs 详情 Dropdown | 同 Skills | ⚠ 见 §3.10 |
| MCPs 删除 | 不改 | ✅ |
| MCPs autoClassify | T2b mirror skills | ✅ |
| MCPs filter sync (sidebar) | 同 Skills | ⚠ 见 §3.10 |

### 3.3 CLAUDE.md 路径（5 项）

| 场景 | V1 改造 | 状态 |
|---|---|---|
| CLAUDE.md 列表 | 不改 | ✅ |
| CLAUDE.md 详情 Dropdown | T3e 改树形（已经 id-based） | ✅ |
| CLAUDE.md 导入（ImportClaudeMdOptions） | 不改（categoryId 字段未变） | ⚠ 见 §3.11 |
| CLAUDE.md 自动分类 | T2b 显式 parentId=undefined（mirror） | ✅ |
| CLAUDE.md 分发到项目 | 不改 | ✅ |

### 3.4 Scenes / Projects（3 项）

| 场景 | V1 改造 | 状态 |
|---|---|---|
| Scenes 列表 / 创建 / 编辑 / 删除 | 不改 | ✅ |
| Projects 创建 / 同步 | 不改 | ✅ |
| **scenesStore.categoryFilter** | 不改（R5 §6 已识别为孤儿字段，无 UI 调用 setFilter） | ⚠ 见 §3.11 |
| **CreateSceneModal.categoryFilter** | 不改（V3 现状仅按 name 比对） | ⚠ V1 落地后子类作为同级出现，但 selector 仅匹配 name string — 当下没回归但视觉上"重复名"两者都会被选中 | 见 §3.11 |

### 3.5 Trash 恢复路径（2 项）

| 场景 | V1 改造 | 状态 |
|---|---|---|
| restore_claude_md 恢复 category_id | 不改（trash.rs:401 仍然 `category_id: file_info.category_id`） | ⚠ 见 §3.11 |
| trash 期间父类被删除 → file_info.category_id 指向 dangling | 不改 — 现状已是这样（不属 V1 回归） | ⚠ 已知现状 |

### 3.6 Refresh 按钮 + 拖拽 V3 行为（≥ 6 项 V3 不变量子集）

参 §5 详细。

### 3.7 ContextMenu 路径（2 项）

| 场景 | V1 改造 | 状态 |
|---|---|---|
| Rename / Delete | 不改 — 仍调 `startEditingCategory` / `deleteCategory` | ✅（D13 cascade-promote 在 backend 处理） |
| **新增 "Promote to Root"** | T3d 加（仅在 child row 上） | ✅ |
| 父类无 hierarchy 操作菜单 | 02 §2.20 + Anti-pattern 已锁 | ✅ |

### 3.8 设置页面

不改 — `AppSettings` 加 `has_completed_category_id_migration: bool` 字段，但**用户可见的设置 UI 不暴露此字段**（属内部 flag）。

✅

### 3.9 首次启动导入

T2a `initApp` 触发 `migrate_category_id_for_skills_mcps`。**P0 见 §2.1**（失败时机错误）。

### 3.10 ⚠ filter sync useEffect 隐藏隐患

**风险描述**：`MainLayout.tsx:236-239` 把 `activeCategory: string | null`（来自 appStore.setActiveCategory，是 categoryId）传给 `setSkillsFilter({ category: ... })`。但 `skillsStore.getFilteredSkills:467-468` 用 `filter.category === skill.category`（**name 比对**）。这是 V3 现状已 broken（filter 实际不生效——除非 categoryId 偶等于 categoryName）。

**V1 影响**：V1 落地后 `Skill.categoryId` 是 SoT、`Skill.category` 是 cached display。`skill.category === categoryId` 现在**永远不可能成立**（id 是 UUID、name 是 string），但 V3 之前可能因 hash collision 或 user-named-as-id 偶尔生效——V1 落地后概率为 0。

**结果**：用户在 SkillsPage / McpServersPage 时点击 sidebar category — sidebar UI 上 active state 更新（路由不变），但**列表 filter 完全不生效**。

**这不是 V1 引入的回归，但 V1 落地后明显放大此现状 bug**。R6 §4.4 已识别为"P0 隐藏需求"，建议删除 sync useEffect。**_synthesis_decisions §2.4 拒绝此建议**（"超范围"）。

**评议**：_synthesis_decisions 的拒绝合理（这是独立 architectural cleanup），但 04 V1 应**显式标记此为已知现状 P1**，并在 commit message 中说明"V1 不修复 SkillsPage/McpServersPage sidebar filter sync 现状缺陷"——避免未来用户报"sidebar 点 category 在 SkillsPage 失效"。

**修复建议**（V1 文档补丁）：03 §3.1 已识别 update_skill/mcp_metadata 不持 DATA_MUTEX 为已知 P1，**类似地，04 风险登记应加 R26（filter sync 现状不修复）**。

### 3.11 ⚠ Trash + Scenes + ImportClaudeMdOptions 涉及 categoryId

| 路径 | 现状 | V1 影响 |
|---|---|---|
| `trash.rs:401` restore_claude_md | `category_id: file_info.category_id` 直接 copy | trash 期间父类被删除 → restored file 的 category_id 指向 cascade-promoted child（其 id 不变） — **正确**；但若该 child 自己被删除 → dangling — V3 现状已存在 |
| `claude_md.rs:506` update_claude_md(category_id) | 不验证 category_id 存在性 | V1 落地后 dropdown 输出 categoryId — 新引入的 child id 在 V0 客户端不存在 — V1 写时**应验证存在性** |
| `ImportClaudeMdOptions.category_id` (types.rs:741) | 旧字段，不验证 | 同上 |
| `CreateSceneModal.tsx:447 + 487` (category Select 内仅按 name) | 不改 | V1 落地后子类同名时两者都被选中（重名情况） |
| `scenesStore.ts:21+81 categoryFilter` | 孤儿字段（R5 §6 + R6 §4.5） | 不改 — 不影响 |

**P1 — update_claude_md 应验证 category_id 存在**（V1 范围内补，约 +5 LoC）：

```rust
if let Some(cid) = category_id {
    // 防 dangling reference
    if !app_data.categories.iter().any(|c| c.id == cid) {
        return Err(format!("Category {} not found", cid));
    }
    file.category_id = Some(cid);
}
```

**实际**：V1 之前一直没验证 — 不在本任务范围内修复，但**应在 04 风险登记中明示**。

**P0 — CreateSceneModal 视觉行为**（**重命名情况下 V1 引入回归**）：

V1 落地后用户可能创建：父=Web、子=Stripe；父=Stripe、子=API（hierarchy 允许同名子类）。
CreateSceneModal categoryFilter:447-453 仍按 `Set(items.map(item => item.category))` 提取 unique names——
**两个 "Stripe" 父类的内容会全部聚合到 categoryFilter "Stripe" 选项下**。
filter:487 `item.category !== categoryFilter` 也是 name 比对——两者全部匹配。

**结果**：用户选 "Stripe" 看到两个父类的内容混在一起。这是 V1 引入的视觉行为回归。

**修复建议**（V2 patch — 04 加任务卡）：CreateSceneModal categoryFilter 改为 categoryId-based，options 含 hierarchy（与 D9 一致）。**T3e 应包含 CreateSceneModal**，但 04 T3e 只列了 5 个 dropdown（SkillDetailPanel / SkillsPage / McpServersPage / McpDetailPanel / ClaudeMdDetailPanel），**漏掉 CreateSceneModal**。

### 3.12 现有功能回归总评

✅ Skills / MCPs / CLAUDE.md / Scenes / Projects / Settings 主要路径不改。
✅ ContextMenu 增"Promote to Root"，不破坏现有项。
✅ Trash 恢复路径 V1 改造前后行为一致（V3 现状的 dangling 风险也存在）。
🔴 **P0 — CreateSceneModal categoryFilter 在重名子类下混淆内容**（§3.11）— 04 T3e 漏列。
⚠ **P1 — filter sync useEffect 现状缺陷在 V1 后影响放大**（§3.10）— 04 风险登记应明示。
⚠ **P1 — update_claude_md 不验证 category_id 存在**（§3.11）— V3 现状，建议 V1 补。

---

## 4. 隐藏地雷核查（基于 grep + R5 列表）

### 4.1 R5 §7 列出的 10 个隐藏地雷

| # | R5 标识 | V1 处理 | 状态 |
|---|---|---|---|
| 1 | DATA_MUTEX 仍需覆盖 hierarchy 写路径 | 03 §3.1 grep 表 + 04 T1g 重新核查 | ✅ |
| 2 | 5 dropdown 必改清单 | 04 T3e | ⚠ 漏 CreateSceneModal — 见 §3.11 |
| 3 | autoClassify 创建 category 路径必须更新 | 04 T2b | ✅ |
| 4 | tauriMock fixture 不含 category 字段 | 04 T5a 没显式涵盖 | ⚠ 见 §4.3 |
| 5 | CategoryPage 聚合算法递归基线 | 04 T2c collectDescendantIds 注释 max depth=2 | ✅ |
| 6 | "Show X more" 与 hierarchy 共存 | 02 §2.16 + 04 R13 | ✅ |
| 7 | 拖父类时 DragOverlay 子树视觉 | 02 §2.6 + 04 R14 D5 决议 | ✅ |
| 8 | 删除父类时 active 重置 | 04 T2a R15 | ✅ |
| 9 | scenesStore.categoryFilter 遗孤激活 | R5 §6 决议（不在本任务） | ✅ |
| 10 | announcements 扩展 vs VoiceOver fallback | 04 T3a R17 | ✅ |

### 4.2 必跑 grep 复核结果

```bash
# G_F1 — src/test/ 中 category 命中
$ rg -n --no-heading 'category' /Users/bo/Documents/Development/Ensemble/Ensemble2/src/test/
（输出为空 — 仅 tauriMock.ts 注释中提及 'get_categories'）

# G_F2 — tauriMock 使用点
$ rg -n --no-heading 'tauriMock|registerMockCommand|setupTauriMock' /Users/bo/Documents/Development/Ensemble/Ensemble2/src/
src/test/helpers/tauriMock.ts:30:* registerMockCommand('get_categories', () => [...]);
src/test/helpers/tauriMock.ts:35: registerMockCommand
src/test/helpers/tauriMock.ts:59: setupTauriMock

注：tauriMock.ts 仅作为 mock 工具，不含真实 category fixture。
当前任何使用 mock 的测试都需要显式调 registerMockCommand('get_categories', ...) 提供 fixture。

# G_F3 — docs/ category 命中（≥ 14 处）
docs/development.md:274:| `/category/:categoryId` | `CategoryPage` |
docs/development.md:311:    category: Option<String>,
docs/development.md:476:`get_categories`, `add_category`, ...
docs/usage.md:30,31,33,53,56,158,165,182:多处用户文档（"category" 单数）
README.md:26 + 63（Sidebar filtering by category）

# G_F4 — AGENTS.md / README.md
README.md:26: <a href="docs/screenshots/category-filter.png">
README.md:63: Sidebar filtering by category and tag

# G_F5 — CategoryPage / route 命中
src/pages/index.ts:10
src/pages/CategoryPage.tsx:20, 24, 335
src/components/skills/SkillDetailPanel.tsx:4 (注释)
src/components/layout/Sidebar.tsx:191 (navigate(`/category/${categoryId}`))
src/components/layout/MainLayout.tsx:341 (path.startsWith('/category/'))
src/App.tsx:9, 23

# G_F6 — classify 命中
src-tauri/src/commands/classify.rs (auto_classify IPC)
src-tauri/src/types.rs:208 (auto_classify_new_items)
```

**结论**：grep 全 codebase 无新增可疑命中。**R5 列表 10 项 + 主动 grep 结论一致**。

### 4.3 ⚠ tauriMock fixture 缺口

`src/test/helpers/tauriMock.ts:30` 注释举例：
```ts
registerMockCommand('get_categories', () => [
  { id: '1', name: 'Development', color: '#000', count: 5 }
])
```

**缺 parentId 字段**。V1 落地后任何使用 mock 的测试如果不显式包含 parentId 字段，会有 TypeScript 错误（因为 Category interface 现在含 `parentId?: string`，optional 但应当显式声明 fixture 类型）。

T5a 应补：
- 在 `tauriMock.ts` 注释例子中加 `parentId: undefined`
- 或在 `src/test/helpers/categoryFixture.ts`（建议新建）放标准 fixture：

```ts
// V1 推荐 fixture
export const sampleCategoriesFlat: Category[] = [
  { id: 'p1', name: 'Development', color: '#000', count: 0 },
  { id: 'p2', name: 'Productivity', color: '#000', count: 0 },
];

export const sampleCategoriesHierarchy: Category[] = [
  { id: 'p1', name: 'Development', color: '#000', count: 0 },
  { id: 'c1', name: 'Frontend', color: '#000', count: 0, parentId: 'p1' },
  { id: 'c2', name: 'Backend', color: '#000', count: 0, parentId: 'p1' },
  { id: 'p2', name: 'Productivity', color: '#000', count: 0 },
];

export const sampleSkillsAggregated = (
  parentName: string,
  childNames: string[],
): Skill[] => /* ... */;
```

**P1 — 04 T5a 应包含 fixture 文件创建**。

### 4.4 隐藏地雷新增（评审过程中发现的）

#### Mine A — `MainLayout.tsx:323-326` URL 路径解析

```ts
const categoryMatch = location.pathname.match(/^\/category\/(.+)$/);
const currentCategoryId = categoryMatch ? decodeURIComponent(categoryMatch[1]) : null;
```

V1 后 categoryId 是 UUID（与 V3 同），URL 中不含特殊字符。`decodeURIComponent` 处理无问题。

**未引入回归**。✅

#### Mine B — `Sidebar.tsx:191` navigate 调用

```ts
navigate(`/category/${categoryId}`);
```

V1 后子类与父类 URL 路径相同（`/category/${id}` — 无 `/parent/child` 形式）。CategoryPage 通过 categoryId 反查 hierarchy 决定聚合范围（`collectDescendantIds`）。✅

#### Mine C — `Skills 列表 sort` 不感知 hierarchy

`skillsStore.getFilteredSkills:478-487` sort 逻辑只看 `installSource` + `name`，不看 hierarchy。SkillsPage 列表始终按全 skills 排序（不分组到父类下）。

V1 不改这条路径。✅（D7 选 A 聚合视图只在 CategoryPage 生效，SkillsPage 是 flat 列表）

#### Mine D — `MainLayout.tsx:236` setSkillsFilter 现状错配

详 §3.10 — V1 不修复但应明示。

#### Mine E — `claude_md.rs:704` import_claude_md 默认 category_id: None

```rust
file.category_id = options.category_id;  // line 371
// ... 后续：
category_id: None,  // line 704（应该是某种默认情形）
```

**P2** — 未深查这一行 context，但若是默认导入路径，V1 不影响（仍为 None）。✅

#### Mine F — Anti-pattern：03 §5.2 onDragEnd reorder payload 漏子项 ⚠ **P0 隐藏地雷**

**详细见 §5.2** — 这是 V1 文档级 P0，必须修订。

### 4.5 隐藏地雷总评

✅ R5 §7 列出的 10 项中，9 项已正确处理。
🔴 **P0 — Mine F**（03 §5.2 onDragEnd reorder payload 漏子项）— V2 patch 必修。
⚠ **P1 — Mine D**（filter sync useEffect 现状未明示）— 04 风险登记应增加。
⚠ **P1 — tauriMock fixture 缺口**（§4.3）— 04 T5a 应增任务。
⚠ **P1 — CreateSceneModal 漏列在 T3e**（§3.11 / §4.1 #2）。

---

## 5. V3 不变量在 hierarchy 下行为不变

### 5.1 23 项不变量逐项核查

参照 03 §12 的 V1 核对清单。本评审重新逐条核查：

| # | V3 不变量 | V1 处理 | 评议 |
|---|---|---|---|
| 1 | 4 px activation distance | useSensor distance 不变 | ✅ |
| 2 | 两段 lift 80ms+120ms | DragOverlay 内容不变 | ✅ |
| 3 | DragOverlay 多层 hsl 阴影 | `.drag-overlay-row` 类 不变 | ✅ |
| 4 | 12px 连续磁吸 | snapModifier.ts 不修改（02 §2.10 + 03 §6.5）| ✅ |
| 5 | 220ms cascade | useSortable transition 不变 | ✅ |
| 6 | distance-aware settle | onDragEnd 公式不变；rect 改了自动正确 | ✅ |
| 7 | 280ms cancel | 复用 cancel 视觉，不引入新 cancel | ✅ |
| 8 | DndContext modifiers `[snapModifier]` | 不变 | ✅ |
| 9 | DragOverlay modifiers `[restrictToWindowEdges]` | 不变 | ✅ |
| 10 | DATA_MUTEX 串行 + apply_reorder pure + ENSEMBLE_DATA_DIR 测试隔离 | 03 §3.1 grep 表 ≥ 64 行枚举；新增 mutator 都加锁 | ✅ |
| 11 | categoriesVersion / tagsVersion 协议 | addCategory(parentId) / setCategoryParent / deleteCategory cascade 都 bump（03 §4）| ✅ |
| 12 | enqueueReorder 串行队列 | setCategoryParent 共用同队列（03 §4.3）| ✅ 见 §5.2 |
| 13 | data-no-dnd + CustomMouseSensor 双保险 | ChevronToggle 加 `data-no-dnd="true"` + `onMouseDown stopPropagation`（03 §5.5）| ✅ |
| 14 | 编辑/新增态 SortableContext 全局 disabled | 不变 | ✅ |
| 15 | KeyboardSensor + sortableKeyboardCoordinates | 配 treeKeyboardCoordinates（03 §5.1.B），fallback 仍 sortableKeyboardCoordinates | ✅ |
| 16 | prefers-reduced-motion 全套尊重 | 03 §7.4 增 selectors | ✅ |
| 17 | "Show X more" onDragStart 自动展开 | 03 §5.2 handleDragStart 不变 | ✅ |
| 18 | justDroppedId 50ms guard | 不变 | ✅ |
| 19 | 拖动期间 Refresh disabled | 不变 | ✅ |
| 20 | DragOverlay 不带原位 padding | DragOverlayCategoryRow 不传 depth（02 §2.6）| ✅ |
| 21 | closestCenter collision detection | 不变 | ✅ |
| 22 | MeasuringStrategy.Always | 不变 | ✅ |
| 23 | useSortable transform 用 CSS.Translate | T3b 沿用（V3 现有）| ✅ |

### 5.2 🔴 P0 — onDragEnd reorder payload 不完整（Mine F）

**问题描述**：

03 §5.2 `handleDragEnd` 在拖动**父类同级 reorder** 场景下调用：

```ts
// flattenedItems = removeChildrenOf(baseFlat, [activeId])
// → 已经移除 active 父类的所有 children
const newFlat = arrayMove(flattenedItems, oldIdx, newIdx);
onReorder(newFlat.map(it => String(it.id)));
```

**触发场景**：用户拖动父类 P1（其下有子 C1, C2）到另一父类 P2 之后的位置（同级 reorder，不改 parent）。

**实际执行流**：

1. `onDragStart`: setActiveId(P1)
2. `flattenedItems` useMemo: `removeChildrenOf(baseFlat, [P1])` → flat list 中 **C1, C2 被隐藏**
3. 用户拖到 P2 后
4. `arrayMove(flattenedItems, oldIdx, newIdx)` → newFlat = `[..., P2, P1, ...]`（不含 C1, C2）
5. `onReorder(newFlat.map(it => it.id))` → `reorder_categories(['P2_id', 'P1_id', ...])`（**不含 C1, C2 的 id**）
6. backend `apply_reorder`：
   - C1, C2 不在 ordered_ids → **append 到末尾**
7. 持久化的 categories Vec 顺序：`[..., P2, P1, ..., C1, C2]`
8. 但 C1.parent_id = P1（仍在），C2.parent_id = P1
9. flattenTree 再次执行：根据 parent_id 把 C1, C2 渲染在 P1 row 之下，**不在 Vec 末尾位置**

**视觉结果**：用户拖完 P1，看到 P1 下的 C1、C2 正常跟随（视觉对）。

**数据持久化结果**：data.json 中 categories Vec 顺序混乱 — C1, C2 跑到 Vec 尾。重启 app 后 flattenTree 再渲染：children 顺序仍然按"在 categories Vec 中出现的顺序"——所以渲染时 C1, C2 仍跟在 P1 下方（按 parent_id 解析），**视觉看起来一致**。

**问题在哪？**

- (a) 表面上视觉正确（flattenTree 按 parent_id reconstruct）。
- (b) 但 categories Vec 顺序与 flat list 渲染顺序**不再一致** — 这违反 V3 的"Vec 顺序 = sidebar 顺序"心智模型。
- (c) 后续一次"父类 P3 加新子类 C3"操作 — `add_category(parentId=P3)` push C3 到 Vec 末尾，**位于 C1, C2 之后**——但视觉中 C3 仍在 P3 下、C1, C2 仍在 P1 下。**视觉与 Vec 仍 OK**。
- (d) 直到用户手动"reset to JSON 顺序"或下次"全 reorder"——`reorder_categories(orderedIds)` 把所有 ids 重新排——arrayMove 仍然不含 C1, C2 → 又被 push 到末尾。

**最严重场景**：

V3 backend `apply_reorder` 处理 unmentioned items 时**保留原始 Vec 顺序追加**（不是按 user gesture）：

```rust
// data.rs:79-83
for id in &original_order {
    if let Some(item) = by_id.remove(id) {
        result.push(item);
    }
}
```

如果用户**多次拖动多个父类**（每次都触发 reorder 时漏掉自己的 children），**children 的相对顺序会变化** — 因为每次都被 append 到末尾。最终 Vec 顺序与用户的视觉拖动意图脱节。

但更严重：**flattenTree 假设父类的 children 在 Vec 中紧跟父类之后吗？**

查 03 §5.1.A `flattenTree`:

```ts
for (const cat of categories) {
  if (cat.parentId) continue; // children rendered below their parent

  const children = childrenByParent.get(cat.id) ?? [];  // ← 索引拿 children
  // ...
  if (!collapsed) {
    for (const child of children) {  // ← 按 children 顺序渲染
      // ...
    }
  }
}
```

`childrenByParent.get(cat.id)` 返回的 children 顺序**取决于这些 children 在 categories Vec 中的相对顺序**（因为 Map 按插入顺序）。如果 C1 在 Vec 中比 C2 后出现，渲染时 C1 在 C2 之后。

**所以 onDragEnd 漏 children 的最严重副作用**：拖完父类 P1 后，C1, C2 被 push 到 Vec 末尾。如果它们的相对顺序在 Vec 中颠倒（如先 push C2、后 C1），**渲染时 P1 下方的 C1, C2 顺序也颠倒**。这是**数据一致性 bug**，不仅是 cosmetic。

**修复方案**（V2 必修）：

03 §5.2 handleDragEnd 在 reorder 同级时应**展开 children**：

```ts
if (orderChanged) {
  // V2 patch — include children of every parent in the reorder payload
  const newFlat = arrayMove(flattenedItems, oldIdx, newIdx);
  // Reconstruct full Vec order: for each item in newFlat, also emit its
  // children (in their existing order) right after.
  const fullOrder: string[] = [];
  for (const item of newFlat) {
    fullOrder.push(String(item.id));
    if (item.depth === 0) {
      // root — emit children (which were hidden via removeChildrenOf)
      const children = categories.filter(c => c.parentId === item.id);
      for (const child of children) {
        fullOrder.push(child.id);
      }
    }
  }
  onReorder(fullOrder);
}
```

**或更简洁**：onDragEnd 时直接基于 `categories`（**而非 `flattenedItems`**）构造完整 ordered_ids，按拖动后的根级顺序 + 每个根的 children：

```ts
const rootOrder = newFlat.filter(it => it.depth === 0).map(it => String(it.id));
const fullOrder: string[] = [];
for (const rootId of rootOrder) {
  fullOrder.push(rootId);
  for (const child of categories.filter(c => c.parentId === rootId)) {
    fullOrder.push(child.id);
  }
}
onReorder(fullOrder);
```

**04 V2 应修订 T3a 的 onDragEnd 实现，并增加测试**：

```
test('reorder parent does not lose children sibling order', () => {
  // seed: [P1, P2, C1(parent=P1), C2(parent=P1), C3(parent=P2)]
  // reorder P1 to after P2
  // expected ordered_ids passed to reorder_categories:
  //   [P2, C3, P1, C1, C2]  (NOT [P2, P1])
  // expected disk order after: [P2, C3, P1, C1, C2]
});
```

**严重程度**：🔴 P0 — V1 落地后用户多次拖动父类会产生 data corruption（child 相对顺序错乱）。

### 5.3 ⚠ enqueueReorder 队列：setCategoryParent 与 reorderCategories 并发是否真的串行？

**03 §4.3** 声称 setCategoryParent 走 enqueueReorder 队列。

**查 appStore.ts:19-25** `enqueueReorder` 实现（用户讨论时未直接核对，本次 grep 出来）：

<内嵌实现位于 appStore.ts，按顺序串行 promise> ✅ 假设它是按 V3 设计的串行 promise queue，正确。

**但 03 §5.2 handleDragEnd 同时调 setCategoryParent + onReorder（即 reorderCategories）两次 IPC**：

```ts
if (parentChanged) {
  onSetCategoryParent(String(active.id), finalParentId);
}
if (orderChanged) {
  // ... reorder
  onReorder(newFlat.map(it => String(it.id)));
}
```

两个 IPC 都进 enqueueReorder 队列 — 串行执行。

**问题**：setCategoryParent 完成后 backend 返回 canonical Vec（含新 parent_id），但 `onReorder(newFlat)` 中的 `newFlat` 是基于**调用前的 flattenedItems** 计算的，含 active 在旧 parent 下的位置。这两次 IPC 的 ordered_ids 之间存在**数据不一致**。

实际执行流：

1. `setCategoryParent(active.id, newParentId)` 入队
2. `reorderCategories(newFlatIds)` 入队
3. enqueueReorder 弹出 #1：backend 写 parent_id；frontend P1-2 比较 parentId 不同 → 覆盖 state
4. enqueueReorder 弹出 #2：backend 重排 categories Vec
5. backend `apply_reorder(ordered_ids)` 中 ordered_ids 含 active.id 在新位置；其他 children 仍在原 sibling 下 — apply_reorder 把 active.id 移到新位置，**unmentioned 的 children 按 V3 行为 append 到末尾**

**双重坑**：既有 §5.2 的 children 漏列问题，又有"setCategoryParent 已完成 → 应基于新 hierarchy 重新计算 reorder ids"的问题。

**修复建议**（V2 patch — 与 §5.2 综合处理）：

不要分两次 IPC——在 backend 加一个 atomic `set_parent_and_reorder(id, new_parent_id, ordered_ids)` 命令：

```rust
#[tauri::command]
pub fn set_parent_and_reorder(
    id: String,
    newParentId: Option<String>,
    orderedIds: Vec<String>,
) -> Result<Vec<Category>, String> {
    let _guard = DATA_MUTEX.lock()?;
    let mut data = read_app_data()?;
    validate_hierarchy(&data.categories, &id, newParentId.as_deref())?;
    if let Some(cat) = data.categories.iter_mut().find(|c| c.id == id) {
        cat.parent_id = newParentId;
    }
    data.categories = apply_reorder(data.categories, &orderedIds);
    write_app_data(data)?;
    Ok(data.categories)
}
```

但这违反 03 §3.2 的"语义分离"决议。**评议**：03 §3.2 的"语义分离"决议本身是合理的，**问题在 frontend onDragEnd 的双 IPC 逻辑**——应该在前端**计算最终 ordered_ids**（含**hierarchy 变化后的所有子项**）后只发**一次** `reorder_categories`，hierarchy 变化通过先发 `set_category_parent` IPC（不带顺序）完成。但这又回到 §5.2 的双 IPC 问题。

**最终建议**：

V2 修订 03 §5.2 + 04 T3a：

```ts
// V2 onDragEnd
if (parentChanged) {
  await onSetCategoryParent(String(active.id), finalParentId);
  // 等 backend 返回 canonical Vec 后再计算 reorder
}

// 重新读 categories（已更新 parent_id）
const updatedCategories = useAppStore.getState().categories;

// 基于 updatedCategories 重新构造完整 ordered_ids（含所有 children）
const rootOrder = newFlat.filter(it => it.depth === 0).map(it => String(it.id));
const fullOrder: string[] = [];
for (const rootId of rootOrder) {
  fullOrder.push(rootId);
  for (const child of updatedCategories.filter(c => c.parentId === rootId)) {
    fullOrder.push(child.id);
  }
}
if (orderChanged || parentChanged /* 顺序也可能因父变化间接改变 */) {
  await onReorder(fullOrder);
}
```

**04 V2 应**：
- 修订 T3a handleDragEnd 实现
- 增 T5a 测试：`reorder_after_set_parent_emits_full_ordered_ids`

### 5.4 V3 不变量总评

✅ 23 项中 21 项无问题。
🔴 **P0 — onDragEnd reorder payload 漏 children**（§5.2 Mine F）— V2 必修。
🔴 **P0 — onDragEnd 双 IPC 顺序计算 stale**（§5.3）— V2 必修。

---

## 6. Auto-classify chain 核查

### 6.1 三个 store 显式 parentId=undefined（D14=A）

**04 T2b 改动**：

```ts
await addCategory(categoryName, color, undefined);  // 显式 D14=A 落根
```

✅ 正确。语义清晰。

### 6.2 prompt 不变（D14=A）但 LLM 输出 schema 仍解析正确

**classify.rs 不动**，schema 不变：
```json
"category": { "type": "string" }   // 单 name，无 path
```

✅ V1 不修改 schema，prompt 输出与之前一致。

### 6.3 autoClassify 与 hierarchy reorder 并发 race

**触发场景**：用户开始 autoClassify（IPC 调 LLM 30+ 秒），同时拖动父类 reorder。

**V3 现状保护机制**：
- categoriesVersion 协议（appStore.ts:184-205 loadCategories race detection）
- enqueueReorder 队列（reorder 串行，按用户最近一次为 canonical）

**V1 落地后**：
- autoClassify 在 results 处理循环外 `useAppStore.getState().categories` 取 snapshot（03 §4.5 modified）
- 在循环内 `find(c => c.name === result.suggested_category)?.id` — 如果同名 category 在 snapshot 后被 reorder 但没改 name，**id 仍正确**
- 如果同名 category 被删除 → snapshot 仍含旧记录 → autoClassify 写入 metadata.category_id 指向**已删除的 id**（dangling）

**但 V1 写入路径**：
```ts
await safeInvoke('update_skill_metadata', {
  skillId, category, categoryId: targetCategoryId, ...
});
```

如果 targetCategoryId 是 dangling — backend 不验证 category_id 存在性（V3 现状已不验证）。**这是 V3 已存在的 race 缺口**，V1 不引入新回归但放大风险（因为引入了 categoryId SoT，dangling reference 现在更明显）。

**修复建议**（V2 patch — 04 T2b 增强）：autoClassify 在循环内重新查 categoryId — 不依赖 snapshot：

```ts
for (const result of results) {
  const skill = skills.find((s) => s.id === result.id);
  if (skill) {
    // V2 patch — re-read fresh from store, not snapshot
    const freshCategories = useAppStore.getState().categories;
    const targetCategoryId = freshCategories.find(
      (c) => c.name === result.suggested_category,
    )?.id;
    if (!targetCategoryId) {
      console.warn(`Category "${result.suggested_category}" was deleted during autoClassify; skipping.`);
      continue;
    }
    // ...
  }
}
```

**P1** — 边缘情况，V2 patch 建议。

### 6.4 Auto-classify chain 总评

✅ D14=A 显式 parentId=undefined 落根正确。
✅ Prompt + schema 不变。
⚠ **P1 — race protection**（§6.3）— V2 patch 建议。

---

## 7. Trash 恢复路径核查

### 7.1 restore_claude_md 在 hierarchy 下行为

`trash.rs:401`：
```rust
let restored_file = ClaudeMdFile {
    // ...
    category_id: file_info.category_id,  // 直接 copy 原 categoryId
    // ...
};
```

V1 行为分析：

**Case A**：trash 期间该 categoryId 一直存在 → 恢复后 file 指向同 id，**正确**。

**Case B**：trash 期间该 categoryId 是子类，其父被删除 → cascade-promote 后子类自身 id 不变（变 root）→ 恢复后 file 指向 promoted root，**正确**（不丢内容；视觉上现在该 file 显示在新 root category 下）。

**Case C**：trash 期间该 categoryId 是父类，被用户删除 → cascade-promote 把所有子类提到 root，**父类 id 消失** → file 恢复后指向 dangling id：
- UI 显示 "Uncategorized"（fallback `getCategoryColor`）
- update_claude_md 不验证 → 可继续写入（dangling 持续）
- 这是 V3 现状已存在的问题（dangling categoryId 是允许的）

**评议**：D1=A 之后，引用更稳定（id 不变）。但 `delete_category` cascade-promote 不删除 metadata.category_id 引用（03 §3.3.4 注释明示）—— 父类被删后 Skill/Mcp 引用仍指向 deleted id。这是设计取舍（避免二次删除元数据复杂），符合"infer hardcap=2 让 cascade 简单"。**合理**。

### 7.2 删除子类后再恢复

trash 路径中**没有 trash for category**（categories 不进 trash —— 只有 Scenes / ClaudeMd / Project trash）。`delete_category` 永久删除（cascade-promote children）。

**评议**：用户视角下"删除子类后想恢复"= 不可能（与 V3 现状一致）。如果需要可恢复 categories 是 V2 范围。✅

### 7.3 Trash 总评

✅ V1 不引入新 trash 路径回归。
✅ Cascade-promote 设计与 trash 路径兼容。
⚠ **P2 — danging category_id refs**（V3 现状，V1 不修复）。

---

## 8. Cycle 检测算法 + 性能

### 8.1 算法正确性

03 §2.4 `validate_hierarchy`：

```rust
let mut current = Some(new_parent);
let mut hops = 0;
while let Some(p) = current {
    if p.id == target_id { return Err(Cycle); }
    current = p.parent_id.as_deref().and_then(|pid| categories.iter().find(|c| c.id == pid));
    hops += 1;
    if hops > 32 { return Err(Cycle); }  // defensive
}
```

**正确性**：
- max depth=2 hard cap → 实际只需检查 1 层（new_parent.parent_id 是 None 才合法）。`if new_parent.parent_id.is_some() => DepthExceeded` 已在 cycle check 之前 catch。
- cycle check 此情况下只走 1 hop（new_parent 自己） — 检查 self-as-parent 已被前置。

**冗余但不错**：cycle check 的存在是 defensive — 防止 future MAX_DEPTH 增加时漏检。03 §2.4 注释明示。✅

### 8.2 多层 cycle (A→B→C→A)

实际不可能（max depth=2），但 validate 算法仍能检测——`while let Some(p)` 走 chain 时如果碰到 `p.id == target_id` 就 reject。

**测试场景**（建议增 T1b）：

```rust
#[test]
fn rejects_multi_hop_cycle_defensive() {
    // pre-existing data corruption: A→B, B→C, C→A (depth>2 + cycle)
    // 测试 validate(_, "X", Some("A")) 时不爆栈、能 reject
    let cats = vec![
        Category { id: "A".into(), parent_id: Some("B".into()), .. },
        Category { id: "B".into(), parent_id: Some("C".into()), .. },
        Category { id: "C".into(), parent_id: Some("A".into()), .. },
        Category { id: "X".into(), parent_id: None, .. },
    ];
    // First, depth check: A.parent_id = B, B is not root → DepthExceeded
    assert!(matches!(
        validate_hierarchy(&cats, "X", Some("A")),
        Err(HierarchyError::DepthExceeded | HierarchyError::Cycle)
    ));
}
```

**P2 — 增此测试**（cargo test 防爆栈）。

### 8.3 性能 — 50 categories < 1ms

03 §11 表格预估 < 0.05ms — 实际 50 categories chain walk + iter find = 50 × 50 = 2500 ops，每 op 字符串比较 ~ 0.001ms = 2.5ms 内。

**有可能超 1ms 但与 03 §11 < 0.05ms 估算冲突** — 03 估算偏乐观。**实际不影响用户**（IPC 本身 ~10ms，validate 占 25% 是可接受的）。

**P2 — 03 §11 应修订**。

### 8.4 算法总评

✅ Cycle 检测算法正确 + 防爆栈。
⚠ **P2 — 多层 cycle defensive 测试**（§8.2）。
⚠ **P2 — 03 §11 性能估算偏低**（§8.3）。

---

## 9. 总评打分（0-100，安全 + 回归）+ 一句话评语

**总评分**：**62/100**（如不修订 P0 则为 stop-ship）

**评语**：V1 在 schema 设计、serde 反序列化、DATA_MUTEX 协议、V3 不变量保留 21/23 项上做得很好；但 **onDragEnd reorder payload 漏 children**（§5.2 Mine F）是 V1 落地后会让 data.json 顺序与 sidebar 视觉脱节的 P0 数据完整性 bug；**双 IPC 顺序计算 stale**（§5.3）使得 hierarchy 改动同时 reorder 时 backend 收到错位的 ordered_ids；**migration flag 写入时机错误**（§2.1）让失败迁移永久跳过；**T3e 漏 CreateSceneModal**（§3.11）会让重名子类内容混淆。这四项都需在 V2 patch 中修订。修订后评分预计 88/100（可进入实施）。

---

## 10. P0 问题列表（数据丢失 / 反序列化失败 / 功能回归级 — stop-ship）

### P0-F1 — onDragEnd reorder payload 漏 children（Mine F / §5.2）

**位置**：03_tech_plan §5.2 handleDragEnd L1881-1886；04_implementation_plan T3a §5.2

**问题**：拖动父类同级 reorder 时，`flattenedItems` 已被 `removeChildrenOf` 移除 active 父类的子项；后续 `arrayMove(flattenedItems, oldIdx, newIdx).map(it => it.id)` 作为 `reorder_categories(orderedIds)` 输入 → backend `apply_reorder` 把 children **append 到末尾**。多次拖动后 children 相对顺序错乱（数据 corruption）。

**复现步骤**：
1. seed: `[P1, C1(parent=P1), C2(parent=P1), P2, C3(parent=P2)]`
2. 拖动 P1 到 P2 之后
3. flattenedItems（已移除 P1 的 children C1, C2）= `[P2, C3, P1]`
4. arrayMove → `[P2, C3, P1]`
5. ordered_ids = `["P2", "C3", "P1"]` 发给 backend
6. backend apply_reorder(["P2", "C3", "P1"]) → result = `[P2, C3, P1, ...原顺序未提及的: C1, C2]`
7. 重启 app 后 categories Vec = `[P2, C3, P1, C1, C2]`
8. 多次类似操作 → C1, C2 在 Vec 中的相对顺序与用户拖前不一致

**修复方案**：onDragEnd 计算 reorder 时 reconstruct 含 children 的完整 ordered_ids（§5.2 末尾代码）。

**严重度**：🔴 P0 — 数据 corruption（虽不丢失数据，但顺序错位是用户感知到的 bug）。

### P0-F2 — onDragEnd 双 IPC 顺序计算 stale（§5.3）

**位置**：03_tech_plan §5.2 handleDragEnd；04 T3a

**问题**：handleDragEnd 同时调 `setCategoryParent` + `reorderCategories` 两次 IPC，但 reorder 的 ordered_ids 是基于**改 parent 之前的 flattenedItems** 计算的。enqueueReorder 串行执行时，第一次 IPC 完成后 `categories` 已变 parent，但第二次 IPC 的 ordered_ids 仍含旧 parent 关系。

**修复方案**：`await setCategoryParent` 完成后再基于 fresh `categories` 计算 reorder ids。或在 backend 加 atomic `set_parent_and_reorder` 命令。

**严重度**：🔴 P0 — 多次 reorder + reparent 操作下数据 corruption 累积。

### P0-F3 — Migration flag 写入时机错误（§2.1）

**位置**：03_tech_plan §4.10 initApp；04 T2a 实现要求 #3

**问题**：

```ts
await safeInvoke('migrate_category_id_for_skills_mcps');  // 失败仅 warn
await safeInvoke('write_settings', { ... hasCompletedCategoryIdMigration: true });  // 总是写 flag
```

如果 migrate IPC 失败（disk full / partial write）但 frontend 仍设 flag → 下次启动跳过 → 永远未迁移。

**修复方案**：

```ts
try {
  const report = await safeInvoke<MigrateCategoryIdReport>('migrate_category_id_for_skills_mcps');
  if (report) {
    await safeInvoke('write_settings', {
      settings: { ...settings, hasCompletedCategoryIdMigration: true },
    });
  }
} catch (migErr) {
  // 不写 flag → 下次启动重试（idempotent 安全）
}
```

**严重度**：🔴 P0 — 用户数据迁移可能永久跳过（虽 dual-read fallback 可用，但违反设计意图）。

### P0-F4 — T3e 漏 CreateSceneModal（§3.11 / §4.1 #2）

**位置**：04_implementation_plan T3e 任务卡

**问题**：T3e 列出 5 个 dropdown 改造（SkillDetailPanel / SkillsPage / McpServersPage / McpDetailPanel / ClaudeMdDetailPanel），但漏掉 `src/components/scenes/CreateSceneModal.tsx:447, 487, 865`（categoryFilter 选项）。

V1 落地后 hierarchy 允许重名子类（不同父下的 "Stripe"）。CreateSceneModal categoryFilter 仅按 `Set(items.map(i => i.category))` 提取 unique names → 重名时只剩一个 "Stripe" 选项。filter 检查 `item.category !== categoryFilter` 也是 name 比对 → 用户选 "Stripe" 看到两个父类的内容混淆。

**修复方案**：将 CreateSceneModal categoryFilter 改为 categoryId-based，options 含 hierarchy（与 D9 同模式）。**04 T3e 应改 6 个 dropdown 而非 5 个**。

**严重度**：🔴 P0 — V1 引入的视觉行为回归（V3 之前没 hierarchy，不可能重名）。

---

## 11. P1 问题列表

### P1-F1 — `update_skill_metadata` / `update_mcp_metadata` 不持 DATA_MUTEX 在 V1 后影响放大

**位置**：03_tech_plan §3.1 已识别为已知 P1；04 T1f 必读上下文 #4

**问题**：V3 现状已不持 mutex。V1 引入 dual-write 后，`category` 与 `category_id` 字段间一致性更敏感——并发 read 可能看到 `category="A"` + `category_id=B` 不一致状态。

**修复方案**：跨 PR 处理（V1 范围内不修，但 commit message 应说明）。

### P1-F2 — filter sync useEffect 现状缺陷（§3.10）

**位置**：04 风险登记应增 R26；MainLayout.tsx:236-239 未改

**问题**：V3 现状已 broken（filter.category 收 categoryId 但 store 比 name）。V1 落地后 broken 影响放大（dual-read 路径未覆盖 store filter）。

**修复方案**：04 风险登记加 R26 明示"V1 不修复 SkillsPage/McpServersPage sidebar filter sync 现状缺陷"。commit message 应注明。

### P1-F3 — fixture 缺 SkillMetadata / McpMetadata 反序列化测试（§1.2 / §1.3）

**位置**：04 T1a

**问题**：03 §3.7 给的 backward compat tests 仅覆盖 Skill / McpServer / Category，未覆盖持久化层 SkillMetadata / McpMetadata。

**修复方案**：04 T1a 应增 2 个测试：
- `old_skill_metadata_without_category_id_deserializes_to_none`
- `old_mcp_metadata_without_category_id_deserializes_to_none`

### P1-F4 — autoClassify race protection（§6.3）

**位置**：04 T2b

**问题**：autoClassify 循环内仅依赖 outer snapshot；如果 category 在循环中被删除，写入会指向 dangling id。

**修复方案**：循环内重新读 fresh categories；找不到时 console.warn 并 skip。

### P1-F5 — tauriMock fixture 缺 parentId 字段示例（§4.3）

**位置**：04 T5a；src/test/helpers/tauriMock.ts:30 注释

**问题**：tauriMock.ts 的 fixture 例子不含 parentId 字段，T5a 没显式包含 fixture 文件创建。

**修复方案**：04 T5a 应包含创建 `src/test/helpers/categoryFixture.ts`（或更新 tauriMock.ts:30 注释）。

### P1-F6 — update_claude_md 不验证 category_id 存在（§3.11）

**位置**：claude_md.rs:506；V3 现状

**问题**：V3 现状 update_claude_md 不验证 category_id 存在性。V1 落地后 dropdown 输出 categoryId — 写入 dangling reference 不报错。

**修复方案**：04 加任务卡（约 +5 LoC）：claude_md.rs update_claude_md 验证 category_id 存在性。或 V2 修复。

### P1-F7 — onDragStart 全展开未反映在 flattenedItems

**位置**：03 §5.2 handleDragStart；04 T3a 实现要求 #4

**问题**：03 §5.2 注释说"V1 自动展开所有持久化折叠的父类（仅 render override，不写 localStorage）"。但 `flattenedItems` useMemo 依赖 `collapsedIds` state；handleDragStart 仅 setActiveId，**没有清空 collapsedIds**——所以 flattenedItems 中折叠的父类的 children 仍然不渲染。

具体看 03 §5.2 line 1782-1786：
```ts
const flattenedItems = useMemo(() => {
  const baseFlat = flattenTree(categories, collapsedIds);  // ← 仍含 collapsedIds
  if (activeId === null) return baseFlat;
  return removeChildrenOf(baseFlat, [activeId]);
}, [categories, collapsedIds, activeId]);
```

03 §5.2 handleDragStart 没设置 "drag override" 状态，只 setActiveId。

**修复方案**：增加 dragOverrideExpand 临时 state：

```tsx
const [dragOverrideExpand, setDragOverrideExpand] = useState(false);

const flattenedItems = useMemo(() => {
  const effectiveCollapsed = dragOverrideExpand ? new Set<string>() : collapsedIds;
  const baseFlat = flattenTree(categories, effectiveCollapsed);
  if (activeId === null) return baseFlat;
  return removeChildrenOf(baseFlat, [activeId]);
}, [categories, collapsedIds, dragOverrideExpand, activeId]);

const handleDragStart = (event) => {
  setDragOverrideExpand(true);  // V1 §2.15
  // ...
};

const handleDragEnd = (event) => {
  // ...
  setDragOverrideExpand(false);  // 恢复持久化状态
};
```

**04 T3a 应修订实现**。否则 02 §2.15 acceptance #11"拖动开始时全部父类自动展开"会失败。

---

## 12. P2 问题列表

### P2-F1 — settings flag 与 data.json 跨文件一致性（§2.3）

建议未来增 `dataSchemaVersion: u32` 在 data.json 中冗余存储。V2+ 范围。

### P2-F2 — Downgrade orphan parent_id 清理（§2.5）

如用户回退到 V0 客户端再升 V1，V1 应处理 orphan parent_id。建议增到 migrate IPC 中。V2+ 范围。

### P2-F3 — appStore.test.ts beforeEach 缺 categoriesVersion / tagsVersion（§1.4）

V3 现状缺口，V1 fixture 应一并修。低影响。

### P2-F4 — 多层 cycle defensive 测试（§8.2）

03 §3.7 没列 `rejects_multi_hop_cycle_defensive`。建议补。

### P2-F5 — 03 §11 性能估算偏低（§8.3）

性能不影响用户但文档预估值与实际值不符。

### P2-F6 — 静默 migration 用户期望（§2.4）

建议 commit message + CHANGELOG.md 明示 V1 引入一次性 metadata 迁移。

---

## 13. 赞赏点列表

### 赞赏 #1 — serde 模式选择正确

`#[serde(default, skip_serializing_if = "Option::is_none")]` 是项目内已 7 处验证的稳定模式。V1 完全沿用，零风险。

### 赞赏 #2 — DATA_MUTEX grep 重新枚举（03 §3.1）

明确列出 64 行 `read_app_data|write_app_data` callsite 并逐行决议——遵循 `.claude/rules/grep-before-enumerate-shared-resource.md` 模板。识别 `update_skill/mcp_metadata` 不持 mutex 是已知 V3 缺口，本任务不修——这种"显式列出现状缺口而非默默漏盖"的态度是模板。

### 赞赏 #3 — D5 父类不可成子的双层防御

03 §6.2 + getProjection isInvalid 检测 + UI cursor not-allowed + onDragEnd skip IPC + backend `validate_hierarchy` 不强制 D5（仅 enforce 数据 invariant）。这种"backend 数据闸 + frontend UX 闸"的分层设计是经典 defense-in-depth。

### 赞赏 #4 — 双字段 dual-write/dual-read 设计

D1=A 决策保留 `Skill.category` 作 cached display name + LLM training sample + backward compat，新增 `Skill.category_id` 作 SoT。读时优先 id，找不到时 fallback name。这种 schema 渐进迁移模式适用未来 v2 进一步统一。

### 赞赏 #5 — apply_reorder pure function 不修改

`apply_reorder` generic over `HasId` — 加 `parent_id` 字段不影响。V3 现有 6 测试 100% 不修改保留。

### 赞赏 #6 — cascade-promote 设计哲学正确

`delete_category` cascade-promote children to root（保留 children）vs cascade-delete children — 选 cascade-promote 是符合极简哲学（避免二次清理 metadata 复杂度）。

### 赞赏 #7 — 任务卡的"必读上下文清单"逐项可执行

04 V1 每张任务卡都有具体 file:line 路径 + 章节号引用。这避免 SubAgent 用模糊"读相关文档"心智摸索。

### 赞赏 #8 — Idempotent migration 设计

`migrate_category_id_for_skills_mcps` 跳过 `category_id.is_some()` 的 entries — 重启不会重复迁移。orphan name 处理为 leave unchanged 不丢数据。

### 赞赏 #9 — 全部新 mutator 加 DATA_MUTEX

`set_category_parent` / `migrate_category_id_for_skills_mcps` 都显式持锁。V3 不变量 R-V3-10 完整保留。

### 赞赏 #10 — V3 不变量逐条核查

03 §12 列出 23 项 V1 改造下的保留方案 — 每项有具体证据。文档质量超出"简单声称无回归"的 baseline。

---

## 14. 要求 V2 修订：**true**

V1 必须修订才能进入实施。修订项：

- 4 个 P0（必修）
- 7 个 P1（强烈建议修）
- 6 个 P2（V1 文档补丁，不必代码改动）

修订后预计评分 88/100，可进入 Phase 1 实施。

---

## 15. patch list（V2 应包含的修订）

### 文档级修订

#### Patch 1 — 03 §5.2 + 04 T3a handleDragEnd reorder payload（P0-F1, P0-F2）

修订 onDragEnd 实现：
- `await setCategoryParent` 完成后基于 fresh categories 重新计算 ordered_ids
- 计算 ordered_ids 时 include 所有 children（不只 flattenedItems 中的）
- 增 T5a 测试：`reorder_parent_emits_full_ordered_ids`、`reorder_after_set_parent_uses_fresh_categories`

#### Patch 2 — 03 §4.10 + 04 T2a initApp migration flag 时机（P0-F3）

修订 initApp 实现：
- migrate 失败时不写 flag（idempotent 重试）
- 只有 `safeInvoke` 返回成功才写 flag

#### Patch 3 — 04 T3e 增 CreateSceneModal（P0-F4）

修订 T3e 任务卡：
- 改造对象从 5 个 dropdown 增至 6 个（加 `src/components/scenes/CreateSceneModal.tsx:447, 487, 865`）
- categoryFilter 改为 categoryId-based，options 含 hierarchy

#### Patch 4 — 03 §5.2 + 04 T3a handleDragStart 全展开（P1-F7）

修订 SortableCategoriesList state：
- 增 `dragOverrideExpand: boolean` state
- handleDragStart 设 true / handleDragEnd 设 false
- flattenedItems useMemo 中 `effectiveCollapsed = dragOverrideExpand ? new Set() : collapsedIds`

#### Patch 5 — 04 T1a 增 SkillMetadata / McpMetadata 反序列化测试（P1-F3）

T1a 任务卡新增 2 个测试：
- `old_skill_metadata_without_category_id_deserializes_to_none`
- `old_mcp_metadata_without_category_id_deserializes_to_none`

#### Patch 6 — 04 T2b autoClassify race protection（P1-F4）

修订 T2b 实现：
- 循环内 fresh `useAppStore.getState().categories`
- 找不到 categoryId 时 console.warn 并 skip 该 skill 的 categoryId 写入（保留旧 category name）

#### Patch 7 — 04 T5a 增 categoryFixture（P1-F5）

T5a 任务卡新增：
- `src/test/helpers/categoryFixture.ts` 标准 fixture
- 更新 `tauriMock.ts:30` 注释

#### Patch 8 — 04 风险登记增 R26（P1-F2 + P1-F1）

新增风险登记项：
- R26 — V1 不修复 SkillsPage/McpServersPage sidebar filter sync 现状缺陷（V3 现状）
- R27 — V1 不修复 update_skill/mcp_metadata 不持 DATA_MUTEX 现状缺陷

### 代码级修订（V1 范围内可选）

#### Patch 9 — claude_md.rs update_claude_md 验证 category_id 存在（P1-F6）

```rust
if let Some(cid) = category_id {
    if !app_data.categories.iter().any(|c| c.id == cid) {
        return Err(format!("Category {} not found", cid));
    }
    file.category_id = Some(cid);
}
```

V1 范围内 ~5 LoC 改动。或归到 V2 范围。

### 文档辅助修订

#### Patch 10 — 多层 cycle defensive test（P2-F4）

T1b 任务卡新增 1 个测试：
- `rejects_multi_hop_cycle_defensive`

#### Patch 11 — 03 §11 性能估算修订（P2-F5）

将 `validate_hierarchy ≤ 0.1ms 实际 < 0.05ms` 改为 `≤ 5ms 实际 ≤ 2.5ms`（更现实）。

#### Patch 12 — 04 T6d CHANGELOG.md 内容（P2-F6）

T6d Commit 5 CHANGELOG.md 加一行：
```
- Migration: V1 introduces a one-time backfill of category_id for skill/mcp metadata
```

---

## 16. Confidence

**整体置信度**：**88/100**

### 置信度分项

| 维度 | 分数 | 论据 |
|---|---|---|
| 反序列化路径分析 | 95 | serde 模式 + 7 处 in-tree 同模式验证 + 完整 fixture 设计建议 |
| Migration 安全性 | 85 | idempotent + DATA_MUTEX 正确；P0-F3 时机错误已识别 |
| 现有功能回归 | 90 | 20 项核心场景核查 + R5 grep 复核；P0-F4 漏 CreateSceneModal 已识别 |
| 隐藏地雷 | 92 | R5 §7 10 项 + 主动 grep 6 项 + Mine F 新发现 |
| V3 不变量 | 80 | 23 项中识别 2 个 P0（onDragEnd payload + 双 IPC stale）— 这是文档级 P0，未在 03 §12 自检中发现 |
| Auto-classify chain | 88 | D14=A 落根正确；race protection P1 |
| Trash | 90 | restore 路径在 hierarchy 下 3 case 分析完整 |
| Cycle 检测算法 | 85 | 算法正确；性能估算偏乐观 |

### 信心折扣 12 点来源

1. 6 点：P0-F1 / P0-F2 是新发现的文档级 bug，需要主 Agent 复核我的复现步骤是否完全正确（我对 `apply_reorder` unmentioned items 行为基于 data.rs:79-83 源码分析，但是否真会引发用户感知的视觉错乱需要 dev mode 验证）。
2. 3 点：P0-F4 CreateSceneModal 是基于 r5 grep + R6 §1 的链路追踪，我没核对当前 V3 是否已经允许同名 category（理论 V3 不允许全树同名，所以 V3 之前就没这个 bug；V1 引入的）。需要复核。
3. 2 点：P1-F7 onDragStart 全展开未反映在 flattenedItems — 我读 03 §5.2 时认为 dragOverrideExpand 不存在；如果 04 T3a 的实施 SubAgent 在 ChiefDeveloper review 时自补这个 state，则 P1 自然消化。
4. 1 点：MEMORY 中"测试覆盖真实数据"事故是 reading-comprehension 触发的额外谨慎；migrate IPC 有 ScopedDataDir 保护，用户数据安全。

### 建议主 Agent 后续动作

1. **dev mode 复现 P0-F1 / P0-F2**：seed `[P1, C1(parent=P1), P2]`，拖 P1 到 P2 之后，重启检查 data.json 顺序。
2. **核对 V3 是否允许重名 category**（验证 P0-F4 是否 V1 引入）：
   - 现状 `add_category` 没有 unique check（grep `add_category` 看 backend 校验）
   - UI 也没有 unique check（grep MainLayout.handleCategorySave）
   - **结论**：V3 已允许全树重名 — 但 hierarchy 之前用户自然避开。V1 引入 hierarchy 后用户**会**创建重名子类。**P0-F4 仍成立**。
3. **如 P0 复现确认**：进入 V2 修订；否则降级 P0 → P1。

---

## 17. takeaway（一句话给主 Agent）

**V1 整体设计正确（88/100 修订后），但 onDragEnd 的 reorder payload 漏 children + migration flag 时机错误 + T3e 漏 CreateSceneModal 是 4 个 stop-ship P0；V2 修订需在 03 §5.2 + 04 T3a / T2a / T3e 落地 patch list 1-3。修订后可进入 Phase 1 实施。**

---

> **End of Reviewer F report**
