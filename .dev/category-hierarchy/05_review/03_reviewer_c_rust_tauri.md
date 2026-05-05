# Reviewer C — Rust + Tauri 架构师评审

> **角色**：资深 Rust + Tauri 架构师评审 SubAgent。
> **评审对象**：`.dev/category-hierarchy/03_tech_plan.md` V1（含其引用的 R1 数据迁移规划）
> **基线**：`.dev/sidebar-reorder/03_tech_plan.md` V3（DATA_MUTEX / apply_reorder / version 协议必背）
> **职责**：数据安全的最后一道闸 — 一个错误的 migration 或缺失的锁可能让用户数据丢失（参 MEMORY 已有的"测试覆盖真实数据"事故）。

---

## 0. 已读基线 checklist

- [x] `00_understanding.md`（任务边界 + 14 决策清单 + 风险登记 §7 + D1=A / D2=A / D13=A+B 决议）
- [x] `01_research/_synthesis_decisions.md`（14 决策定锤 + 跨文档 cascade footprint）
- [x] `01_research/r1_data_model.md`（D1/D2/D13 论据 + 完整迁移规划主要素材）
- [x] `01_research/r5_impact_enumeration.md`（grep 兜底闸 / G1-G21 / 改动文件清单）
- [x] `01_research/r6_classification_count_filter.md`（autoClassify / count / filter 行为论据）
- [x] `03_tech_plan.md` V1（评审主对象 — 全文 2732 行）
- [x] `.dev/sidebar-reorder/03_tech_plan.md` V3（V3 不变量基线 — 949 行）
- [x] `.claude/rules/grep-before-enumerate-shared-resource.md`
- [x] `.claude/rules/fallback-path-must-be-unreachable-in-test.md`
- [x] `.claude/rules/cross-document-cascade-discipline.md`
- [x] `.claude/rules/verify-third-party-behavior-firsthand.md`

**已读现状代码**：
- [x] `src-tauri/src/types.rs` 全 1003 行（`#[serde(default)]` 现有 20 处用例）
- [x] `src-tauri/src/commands/data.rs` 全 816 行（DATA_MUTEX / apply_reorder / 测试套件）
- [x] `src-tauri/src/commands/skills.rs` 全 293 行（`update_skill_metadata` 现状未持锁）
- [x] `src-tauri/src/commands/mcps.rs` 全 461 行（`update_mcp_metadata` 现状未持锁）
- [x] `src-tauri/src/commands/claude_md.rs` 关键段（`import_claude_md` `update_claude_md` `delete_claude_md` `set_global_claude_md` `unset_global_claude_md` `restore_claude_md` `migrate_claude_md_storage`）
- [x] `src-tauri/src/commands/classify.rs` 全 277 行
- [x] `src-tauri/src/commands/trash.rs` 关键段（`restore_claude_md`）
- [x] `src-tauri/src/lib.rs` 全 178 行（command 注册）
- [x] `src-tauri/src/utils/path.rs` 全 304 行（`get_app_data_dir` cfg(test) panic 已落实 + 回归测试）
- [x] `src/stores/appStore.ts`（categoriesVersion / enqueueReorder / applyReorder / two-phase commit）
- [x] `src/stores/settingsStore.ts`（loadSettings / saveSettings 路径）

**已跑 grep**：

```
$ rg -n 'read_app_data|write_app_data' src-tauri/src/
（约 70 行命中：trash.rs:387/410/414/445；data.rs ~30 处；claude_md.rs:107/383/388/449/470/511/554/577/633/655/759/778/797/813/937/958；lib.rs:91/92）

$ rg -n 'DATA_MUTEX' src-tauri/src/
（命中：data.rs（声明）+ 13 个 mutator 持锁点；trash.rs:341；claude_md.rs:382/510/576/654/777/936）

$ rg -n '#\[tauri::command\]' src-tauri/src/
（命中：~85 个命令，跨 17 个文件）

$ rg -n '#\[serde\(default' src-tauri/src/types.rs
（命中：20 处 — 含 #[serde(default)] 与 #[serde(default = "...")] 两类）
```

---

## 1. DATA_MUTEX 协议覆盖核查（grep-before-enumerate）

> 复用 V1 §3.1 grep 表 + 我亲自重 grep 一次结果做对照。

### 1.1 grep 重新枚举（2026-05-04）

实际执行的 grep：`rg -n 'read_app_data|write_app_data' src-tauri/src/`。

完整 mutator 清单（持 DATA_MUTEX）：

| # | 文件:行 | 命令 | DATA_MUTEX 现状 | V1 处理 |
|---|---|---|---|---|
| 1 | `data.rs:222` | `add_category` | ✅ 持锁 | **改**：增 `parentId: Option<String>` 参数 + parent validation |
| 2 | `data.rs:241` | `update_category` | ✅ 持锁 | 改：保留同签名（V1 显式不接受 parent_id；走 `set_category_parent`） |
| 3 | `data.rs:261` | `delete_category` | ✅ 持锁 | **改**：增 cascade-promote loop |
| 4 | `data.rs:274` | `reorder_categories` | ✅ 持锁 | 不变（apply_reorder 透明 generic） |
| 5 | `data.rs:294` | `add_tag` | ✅ 持锁 | 不变 |
| 6 | `data.rs:312` | `update_tag` | ✅ 持锁 | 不变 |
| 7 | `data.rs:327` | `delete_tag` | ✅ 持锁 | 不变 |
| 8 | `data.rs:338` | `reorder_tags` | ✅ 持锁 | 不变 |
| 9 | `data.rs:367` | `add_scene` | ✅ 持锁 | 不变 |
| 10 | `data.rs:400` | `update_scene` | ✅ 持锁 | 不变 |
| 11 | `data.rs:432` | `delete_scene` | ✅ 持锁 | 不变 |
| 12 | `data.rs:473` | `add_project` | ✅ 持锁 | 不变 |
| 13 | `data.rs:500` | `update_project` | ✅ 持锁 | 不变 |
| 14 | `data.rs:526` | `delete_project` | ✅ 持锁 | 不变 |
| 15 | `claude_md.rs:382` | `import_claude_md` | ✅ 持锁 | 不变 |
| 16 | `claude_md.rs:510` | `update_claude_md` | ✅ 持锁 | 不变（categoryId 字段语义不变） |
| 17 | `claude_md.rs:576` | `delete_claude_md` | ✅ 持锁 | 不变 |
| 18 | `claude_md.rs:654` | `set_global_claude_md` | ✅ 持锁 | 不变 |
| 19 | `claude_md.rs:777` | `unset_global_claude_md` | ✅ 持锁 | 不变 |
| 20 | `claude_md.rs:936` | `migrate_claude_md_storage` | ✅ 持锁 | 不变 |
| 21 | `trash.rs:341` | `restore_claude_md` | ✅ 持锁 | 不变 |
| 22 | **新增** `data.rs` | `set_category_parent` | — | **必加 DATA_MUTEX**（V1 §3.3.3 已写） |
| 23 | **新增** `data.rs` | `migrate_category_id_for_skills_mcps` | — | **必加 DATA_MUTEX**（V1 §3.4 已写） |

### 1.2 现状缺口（V1 也已 explicit 承认）

| # | 文件:行 | 命令 | 现状 | V1 处理 | 我的评估 |
|---|---|---|---|---|---|
| GAP-1 | `skills.rs:60-103` | `update_skill_metadata` | **未持 DATA_MUTEX**（裸 `fs::read_to_string` + `fs::write` on data.json） | V1 §3.1 已 explicit 标记 P1 跨 PR；本任务**不修但要扩展**（增 `category_id` 参数） | **本任务不修是合理的**（避免越界） — 但**V1 必须显式声明这是已知风险点 + 在 04 任务卡列入 Known Risk** |
| GAP-2 | `mcps.rs:51-90` | `update_mcp_metadata` | 同上 | 同上 | 同上 |

**关键事实核查（亲自读源码）**：

`skills.rs:60-103` 与 `mcps.rs:51-90` 的实现确实是裸 `fs::read_to_string(data_path) → modify → fs::write(data_path)`，**完全没有 DATA_MUTEX**。这意味着：

> 用户在主界面 dropdown 改 category（→ `update_skill_metadata` IPC）的同时，sidebar 拖动 reorder（→ `reorder_categories` IPC，持 DATA_MUTEX），存在 **lost update 窗口**：
>
> - T1（reorder）持锁 → read data.json → start writing
> - T2（update_skill_metadata）裸读 data.json（拿到 T1 写入前的旧版） → modify metadata → write 覆盖 T1 的写入
>
> 这是 **V3 之前就存在的 race，不是 V1 引入**。V1 **承认了这个缺口**（§3.1 表格底部的 "现状缺口"），但**没解决**。

**我的结论**：V1 这一处理是**克制 + 透明**的（标记不修），符合"任务范围聚焦"原则。但是：
- 这意味着 V1 引入的 `category_id` 字段写入也走这条**未持锁路径** — 与新的 hierarchy 数据流叠加后，race 窗口会被**更频繁**触发（用户改父类同时拖 reorder 同时 dropdown 改子类）。
- 我**强烈建议**（P1）把 `update_skill_metadata` / `update_mcp_metadata` 的 DATA_MUTEX 修复**纳入本任务范围**，理由：本任务本来就在改这两个函数（增 `category_id` 参数），加锁是 5-LoC 改动。

详见 §6（P1 问题列表）。

### 1.3 V1 §3.1 表格的完整性核查

**逐行复核**：V1 §3.1 grep 表格显示 21 个现有 callsite + 2 个新增 = 23 个。我的 grep 一致（trash.rs:387/410/414/445 这 4 个 read/write 点都在 `restore_claude_md` 持锁的 line 341 之内，不算独立 mutator）。

**缺口**：V1 §3.1 没在表格中显示 `data.rs:198`（`init_app_data` 内的 `write_app_data(default_data)?;`）。这是首次启动初始化路径，不在并发竞争窗口内（仅在 `data.json` 不存在时触发，单线程启动期），但**严格按 grep-before-enumerate Rule 应该列入并标注"无需锁，单线程启动"**。这是 P2 完整性瑕疵。

### 1.4 DATA_MUTEX 协议覆盖结论

✅ **V1 新增的 2 个 mutator 都加了 DATA_MUTEX**（§3.3.3 + §3.4）。
✅ **现有 21 个 mutator 全部持锁**（grep 已验证）。
⚠️ **现状已知 2 处缺口**（GAP-1/GAP-2 — `update_skill_metadata` / `update_mcp_metadata`），V1 已透明标记 P1。
⚠️ **V1 §3.1 表格遗漏 1 处**（`init_app_data` 内的 write）— P2 完整性。

**总评**：覆盖核查 8.5/10。`grep-before-enumerate` 规则**履行良好**（V1 §3.1 显式列了 grep 命令 + 输出，每条 callsite 都有处理决议），但 GAP-1/2 在新数据流叠加后会被更频繁触发，建议在本任务范围内补锁（详 P1）。

---

## 2. serde backward compat 核查（旧 data.json 反序列化路径）

### 2.1 `#[serde(default)]` on `Option<String>` 的语义验证

V1 声称：旧 data.json 无 `parentId` 字段 → 反序列化为 `None`。证据：

**项目内 7 处现有 in-tree 用例**：
- `types.rs:24-33`：`Skill.install_source / plugin_id / plugin_name / marketplace / plugin_enabled` 全部用 `#[serde(skip_serializing_if = "Option::is_none")]`。
- `types.rs:160-175`：`AppData.imported_plugin_skills / claude_md_files` 等字段用 `#[serde(default)]`。
- `types.rs:653`：`ClaudeMdFile.category_id: Option<String>` 用 `#[serde(skip_serializing_if = "Option::is_none")]`，**已经 V3 之前生产环境验证过**。

**关键观察**：V1 §2.1 的 `Category.parent_id` 写法是：

```rust
#[serde(default, skip_serializing_if = "Option::is_none")]
pub parent_id: Option<String>,
```

`#[serde(default)]` 应用于 `Option<String>` 时，**等同 `Option::default() = None`**，旧 JSON 缺失 key 反序列化为 `None`，**不抛错**。这一点**项目内已有大量 in-tree 验证**（`AppData.imported_plugin_skills: Vec<String>` 用同模式），且 serde-rs 1.0.219 文档明确支持。

**验证状态**：✅ 已验证（in-tree 现有 20 处 `#[serde(default)]` 用例 — types.rs grep 确认）。

### 2.2 V1 §3.7 的 backward compat 测试设计核查

V1 提了 4 个测试（在 §3.7 末段）：
1. `old_data_json_without_parent_id_deserializes_to_root` — ✅ 测试 fixture 完整（手写 JSON 无 parentId）
2. `category_with_parent_id_serde_roundtrip` — ✅ 验证 camelCase rename + skip_serializing_if
3. `category_root_does_not_emit_parent_id_key` — ✅ 验证新写入对老解析器友好
4. `old_skill_without_category_id_deserializes_to_none` — ✅ 对称测试 Skill.category_id

**评价**：测试覆盖**充分**。建议补一个测试：

5. **缺失**：`category_id_pointing_to_deleted_category_falls_back_to_name`。当 `delete_category` cascade-promote 后（V1 §3.3.4 不删 Skill/Mcp），Skills 的 `category_id` 仍指向某个 child（已 promote），**不会指向被删的 parent** — 这条 V1 说"category_id 永远不会 dangling"。

   **但 V1 §2.2 dual-field 表格里又写**：

   > | **数据 corruption fallback** | 当 `category_id` 指向已删除的 id（理论上不可能…），UI 显示 "Uncategorized" |

   "理论上不可能"是 V1 的声明，但 R1 §6 假设了 dangling 可能性（"dual-read"）。**这是 V1 内部小不一致**：cascade-promote 保证不丢 child；但若用户用某种方式（手工编辑 data.json / migration 失败）造成 category_id dangling，V1 §4.8 / §4.9 的 dual-read 路径其实是**数据兜底**，不是"理论上不可能"。

   建议 P2：V1 §2.2 的措辞改为"**正常路径下不会发生**（cascade-promote 保证）；**但若发生**（手工编辑 / 跨版本数据导入），display 自动 fallback 到 cached `category` name，最终若仍找不到则显示 'Uncategorized'"。

### 2.3 双字段 dual-write 与单用户单客户端的兼容期

**V1 §2.2** 提出 `Skill.category` (cached display) + `Skill.category_id` (SoT) 双字段共存：

```rust
pub category: String,                              // KEEP — cached display
#[serde(default, skip_serializing_if = "Option::is_none")]
pub category_id: Option<String>,                   // NEW (SoT)
```

**好处**：
1. 新前端 binary 读旧 data.json → 解析仍成功（`category_id` 为 `None`）。
2. 新前端写新 data.json → 双字段都写（`dual-write`）。
3. 旧前端 binary（如果用户回滚）读新 data.json → 读到 `category` 字段，仍能 display；只是不知道 `category_id`，会忽略。

**风险**：这是**单用户 + 单客户端 + 单文件**的项目（per CLAUDE.md），不存在跨设备 sync / 回滚到旧 binary 的现实场景。所以"旧客户端读新数据"的污染**不是真实风险**。

**评价**：✅ 双字段策略对单用户场景合理；✅ rollback 路径理论可行但非真实场景。

### 2.4 AppSettings backward compat 核查

V1 §3.5 在 `AppSettings` 加 `has_completed_category_id_migration: bool` 字段，用 `#[serde(default)]` 标记。

**关键验证**：现有 `AppSettings` 中其他 bool 字段的 serde 处理：

```rust
// types.rs:200-217 现状
pub struct AppSettings {
    pub skill_source_dir: String,
    // ...
    pub auto_classify_new_items: bool,         // ❌ 无 #[serde(default)]
    pub terminal_app: String,                  // ❌ 无 #[serde(default)]
    pub claude_command: String,                // ❌ 无 #[serde(default)]
    #[serde(default = "default_warp_open_mode")]
    pub warp_open_mode: String,                // ✅ 有 default
    pub has_completed_import: bool,            // ❌ 无 #[serde(default)]
    #[serde(default = "default_claude_md_distribution_path")]
    pub claude_md_distribution_path: ClaudeMdDistributionPath,  // ✅ 有 default
}
```

**存在的现状缺口（不是 V1 引入）**：`auto_classify_new_items`、`has_completed_import` 等 bool 字段**没有** `#[serde(default)]` — 旧 settings.json 缺这些字段会导致解析失败。但项目早期升级时这些字段是同步加入的，旧用户的 settings.json 必然已含此字段（因为应用启动时若 settings.json 不存在会用 `AppSettings::default()` 写入）。

**V1 加 `has_completed_category_id_migration: bool` 用 `#[serde(default)]` — 这个写法是正确的**：旧 settings.json 缺该字段 → 反序列化为 `false` → 触发首次迁移；运行一次后写为 `true` → 后续启动跳过。

**前端 store 兼容性核查**（这一点 V1 没显式测试）：

`src/stores/settingsStore.ts:198-211` 的 `saveSettings`：

```ts
await safeInvoke('write_settings', {
  settings: {
    skillSourceDir: state.skillSourceDir,
    // ... 列出 10 个字段 ...
    hasCompletedImport: state.hasCompletedImport,
  },
});
```

**这是显式列字段**，**没有 `hasCompletedCategoryIdMigration`**！

**V1 §4.10** 的 initApp 触发迁移路径写的是：

```ts
const settings = await safeInvoke<AppSettings>('read_settings');
if (settings && !settings.hasCompletedCategoryIdMigration) {
  await safeInvoke('migrate_category_id_for_skills_mcps');
  await safeInvoke('write_settings', {
    settings: { ...settings, hasCompletedCategoryIdMigration: true },
  });
}
```

**这里 V1 用 spread `...settings`**，所以 IPC payload 里**包含**了 `hasCompletedCategoryIdMigration: true` — 没问题。

**但是**：用户首次跑迁移后立即关闭 app，`hasCompletedCategoryIdMigration` 写入 settings.json。下次用户在 Settings UI 改任何选项 → 调 `settingsStore.saveSettings()` → IPC payload 中**遗漏 `hasCompletedCategoryIdMigration`**！

**Tauri 行为关键事实**：Tauri 的 `safeInvoke('write_settings', { settings: {...} })` 会把 settings 对象 deserialize 为 Rust `AppSettings`。**Rust 端 deserialize 时若字段缺失且无 `#[serde(default)]`，会报错**；但本字段有 `#[serde(default)]`，所以 deserialize 成 `false`！

**结果**：用户改任何 setting → settingsStore.saveSettings → 调 write_settings IPC，payload 里没有 `hasCompletedCategoryIdMigration` → Rust 端反序列化为 `false`（因为有 `#[serde(default)]`） → settings.json 写入 `has_completed_category_id_migration: false`。**flag 被悄悄重置！**

**结果**：下次启动 → `hasCompletedCategoryIdMigration` 又是 false → 又跑一次 migration。虽然 migration 是 idempotent（V1 §3.4 显式声明），所以**不会数据丢失**，但每次用户改任意 setting 后都会触发一次冗余 migration，**性能 + UX 都不好**。

**这是 P0 问题**（详见 §5）。修复方法：
- **路径 A**：在 `settingsStore.saveSettings` 中加上 `hasCompletedCategoryIdMigration: state.hasCompletedCategoryIdMigration` — **04 任务卡必须显式覆盖此点**（V1 §4.10 没提）。
- **路径 B**：把迁移 flag 单独放到一个 backend 级 config（不通过 frontend settings store 中转），如 data.json 里加一个 schema_version 或 flags 字段 — 这避免 frontend store 的 enumerate 风险。

V1 选了路径 A 但**未在文档中说明 saveSettings 必须同步加字段**。**这是 P0 — 不修复 = 每次改 setting 都会 reset migration flag**。

### 2.5 serde backward compat 总评

✅ `Category.parent_id` / `Skill.category_id` / `McpServer.category_id` / `SkillMetadata.category_id` / `McpMetadata.category_id` 全部用 `#[serde(default, skip_serializing_if = "Option::is_none")]` — 设计正确。
✅ 旧 data.json 反序列化测试设计完整（4 测试）。
✅ 新写入对旧解析器友好（skip_serializing_if）。
⚠️ 测试缺一个 dangling category_id 的 fallback 测试（P2）。
🔴 **AppSettings 新字段 `has_completed_category_id_migration` 与现有 settingsStore.saveSettings 显式 enumerate 模式撞车 — flag 会被悄悄重置 → 每次 setting 改动后冗余 migration**（P0）。

---

## 3. 总评打分

**85 / 100**。一句话评语：**架构与数据模型设计扎实、grep 规则履行良好、V3 不变量逐项核对、迁移幂等设计正确；但 P0 两处（migration flag 与 settingsStore 撞车 + cascade-promote 撞 unique constraint）+ P1 多处（lock 缺口扩散 + dropdown enumerate 漏掉 SkillsPage / SkillDetailPage / McpServersPage / McpDetailPanel）需要修订**。

不达 95+ 的原因聚焦：
- §2.4 揭示的 migration flag 失效是数据语义级 P0
- §4 揭示的 cascade-promote 同名碰撞是数据 corruption 级 P0
- §6 揭示的 GAP-1/GAP-2 在 hierarchy 数据流叠加下会更频繁触发
- §6 揭示的 dropdown 改造列表与 R5 grep 实际命中数不一致（V1 §5.9 列了 SkillDetailPanel + McpServersPage + ClaudeMdDetailPanel 共 3 处，实际 R5 grep 显示 6 处 dropdown）

---

## 4. P0 问题列表（Rust 后端 stop-ship 级）

> **P0 = 不修不能合并**。每条都给具体修订方案 + 代码示例。

### P0-1：AppSettings 新字段 `hasCompletedCategoryIdMigration` 与 `settingsStore.saveSettings` enumerate 模式撞车 → 迁移 flag 被悄悄重置 → 每次改 setting 后冗余迁移

**触发路径**：

1. 首次启动 → V1 §4.10 `initApp` 调 `migrate_category_id_for_skills_mcps` IPC → 完成后调 `write_settings({...settings, hasCompletedCategoryIdMigration: true})` → settings.json 中 `has_completed_category_id_migration: true`。
2. 用户在 Settings 页改任意选项（如改 terminalApp） → `settingsStore.setTerminalApp` → `get().saveSettings()` → `safeInvoke('write_settings', { settings: {...10 个字段...} })`。
3. **payload 中没有 `hasCompletedCategoryIdMigration`**（settingsStore.saveSettings 显式 enumerate）。
4. Rust 端 `write_settings(settings: AppSettings)` 反序列化 — 因为 V1 §3.5 给该字段加了 `#[serde(default)]`，**deserialize 成 `false`**。
5. settings.json 写入 `has_completed_category_id_migration: false`。
6. 下次启动 → flag 又是 false → 又跑一次迁移（idempotent，所以不丢数据，但每次开 app 都跑一次冗余 migration）。

**严重程度**：
- **数据丢失**：✅ 不会（migration 是 idempotent）。
- **性能**：每次启动跑一次冗余 migration（read all metadata + 比对 + write）。
- **UX**：用户察觉不到，但 app 启动时多 ~50ms 延迟（V1 §11 性能预算）。
- **正确性**：违反"flag 设计意图"的语义（flag 应该 sticky）。

**修复方案 — 必须 P0**：

**路径 A（推荐 — 5 LoC 改动，影响小）**：

V1 §4.10 + §4.4 + §3.5 必须显式声明：

> `settingsStore.ts` 的 `saveSettings` 必须新增 `hasCompletedCategoryIdMigration: state.hasCompletedCategoryIdMigration` 到 enumerate list；`SettingsState` 必须新增 `hasCompletedCategoryIdMigration: boolean` 字段；`loadSettings` 必须读入并设置该字段；`defaultSettings` 必须给默认值 `false`。

V1 §4.10 现在写的 spread `{...settings, hasCompletedCategoryIdMigration: true}` **不够**。Rust deserialize AppSettings 时如果 settings 对象**少了任何一个**前面的字段（如 user 改 ApiKey 但忘了 spread），照样会失败 — 但因为有 `#[serde(default)]` on 该字段，**少这一个不会失败，但会被 default 成 false**。所以问题特征是"silent reset"。

**路径 B（更稳，但改动大）**：

把迁移 flag 移出 `AppSettings`，放到 `AppData`（或单独的 `~/.ensemble/migration_state.json`）。`AppData` 现有 `imported_plugin_skills` 等字段已经用 `#[serde(default)]`，加一个 `has_completed_category_id_migration: bool` 字段也用 `#[serde(default)]`，由后端 `migrate_category_id_for_skills_mcps` 一并写入。这样 frontend 的 saveSettings 完全不接触 migration flag，零撞车风险。

**我的推荐**：**路径 B**。理由：
- 路径 A 依赖 04 实施时记得改 saveSettings — 容易遗漏（这就是问题的本质）。
- 路径 B 把 migration state 放在它**应该在的地方**（data.json 里），与 `AppSettings`（user 偏好）语义分离。
- 路径 B 的 LoC 增加 ~10（types.rs 加字段 + migrate 函数末尾设 true），影响面纯 Rust 内部，不波及 frontend。

**示例代码（路径 B）**：

```rust
// src-tauri/src/types.rs — AppData 加字段
pub struct AppData {
    // ... existing fields ...
    /// V1 hierarchy migration state. Set to true after migrate_category_id_for_skills_mcps
    /// has run successfully. Subsequent app launches skip the migration.
    #[serde(default)]
    pub has_completed_category_id_migration: bool,
}

// src-tauri/src/commands/data.rs — migrate_category_id_for_skills_mcps 末尾
pub fn migrate_category_id_for_skills_mcps() -> Result<MigrateCategoryIdReport, String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    if data.has_completed_category_id_migration {
        // Idempotent fast path — already done.
        return Ok(MigrateCategoryIdReport { /* zeros */ });
    }

    // ... 现有 migration 逻辑 ...

    data.has_completed_category_id_migration = true;  // ← 持久化 flag
    write_app_data(data)?;
    Ok(report)
}
```

**Frontend 改动（路径 B）**：

```ts
// src/stores/appStore.ts initApp
initApp: async () => {
  // ... existing ...
  const data = await safeInvoke<AppData>('read_app_data');
  if (data && !data.hasCompletedCategoryIdMigration) {
    try {
      await safeInvoke('migrate_category_id_for_skills_mcps');
      // 不需要再 write — backend 自己写了 flag
    } catch (e) { /* graceful warn */ }
  }
},
```

---

### P0-2：`add_category` parent validation 与现状 name 唯一性的边界没在 V1 中讨论；`delete_category cascade-promote` 后子类被 promote 到 root 时若与现有 root 同名，没有冲突处理

**问题描述**：

V1 §3.3.4 的 `delete_category cascade-promote`：

```rust
pub fn delete_category(id: String) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    for cat in data.categories.iter_mut() {
        if cat.parent_id.as_deref() == Some(&id) {
            cat.parent_id = None;  // ← promote 到 root
        }
    }

    data.categories.retain(|c| c.id != id);
    write_app_data(data)?;
    Ok(())
}
```

**场景**：用户已有：
- root: `Web` (id=cat-A)
- root: `Tools` (id=cat-B)
- child of Tools: `Web` (id=cat-C)  ← **同名子类合法**（D1=A 决策的核心动机：id 引用，name 不需唯一）

用户删除 `Tools` (cat-B) → cascade-promote → cat-C `Web` 变成 root。

**现状结果**：
- categories = `[ Web (cat-A, root), Web (cat-C, root) ]`
- **两个 root 同名**！
- Skills/MCPs 的 `category` 字段是 cached name，但 sidebar 显示两个名字一样的 root 行。
- 用户视角：完全混乱，不知道哪个是哪个。

**严重程度**：
- **数据 corruption**：✅ 是的 — categories 数据本身没坏，但 D1 决策的"id 唯一保证"在 UI 层面不再成立（用户看到两个相同的项）。
- **可恢复性**：用户可以重命名其中一个，但需要先点对了。
- **是否阻塞功能**：不阻塞，但显著破坏 UX。

**修复方案**：

**路径 A — `delete_category` 主动改名 children**：

```rust
pub fn delete_category(id: String) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    // Find name of the deleted parent (used for disambiguation suffix).
    let deleted_parent_name = data
        .categories
        .iter()
        .find(|c| c.id == id)
        .map(|c| c.name.clone());

    // Collect existing root-level names for collision detection.
    let root_names: std::collections::HashSet<String> = data
        .categories
        .iter()
        .filter(|c| c.parent_id.is_none() && c.id != id)
        .map(|c| c.name.clone())
        .collect();

    // Promote children, suffixing names that would collide with existing roots.
    for cat in data.categories.iter_mut() {
        if cat.parent_id.as_deref() == Some(&id) {
            cat.parent_id = None;
            if root_names.contains(&cat.name) {
                if let Some(parent_name) = &deleted_parent_name {
                    cat.name = format!("{} ({})", cat.name, parent_name);
                    // 仍可能撞名，加序号兜底
                }
            }
        }
    }

    data.categories.retain(|c| c.id != id);
    write_app_data(data)?;
    Ok(())
}
```

**路径 B — 不改名，让 frontend 显示 disambiguation**：

UI 层面在两个同名 root 显示时附加一个小 disambiguation badge（如显示原父类名）。但这违反 V1 §5.4 "极简优先"。

**路径 C — 用户确认对话框**：

`delete_category` 在 cascade-promote 前检查 children 与 root names 的冲突，**返回冲突列表**给前端；前端弹对话框让用户决定（合并 / 重命名 / 取消删除）。

**我的推荐**：**路径 A 自动加后缀**。理由：
- 路径 B 违反极简哲学。
- 路径 C 对用户友好但增加 UI 复杂度（V1 没有现成的 disambiguation modal）。
- 路径 A 对用户透明，**用户事后可改名**，且后缀 `(原父类名)` 提供了**可读的来源信息**。

**附加测试**：

```rust
#[test]
fn delete_category_disambiguates_children_with_existing_root_name() {
    let _scope = ScopedDataDir::new();
    seed(vec![
        Category { id: "A".into(), name: "Web".into(), parent_id: None, /* ... */ },
        Category { id: "B".into(), name: "Tools".into(), parent_id: None, /* ... */ },
        Category { id: "C".into(), name: "Web".into(), parent_id: Some("B".into()), /* ... */ },
    ], vec![]);

    delete_category("B".into()).expect("delete_category");
    let final_data = read_app_data().expect("read_app_data");

    // Cat A is unchanged.
    assert!(final_data.categories.iter().any(|c| c.id == "A" && c.name == "Web"));
    // Cat C is promoted but disambiguated.
    let cat_c = final_data.categories.iter().find(|c| c.id == "C").unwrap();
    assert!(cat_c.parent_id.is_none());
    assert_ne!(cat_c.name, "Web", "should be disambiguated");
    assert!(cat_c.name.contains("Web") && cat_c.name.contains("Tools"));
}
```

**V1 必须修订**：§3.3.4 加上 disambiguation 处理 + §3.7 加上测试。

---

## 5. P1 问题列表

### P1-1：GAP-1 / GAP-2（`update_skill_metadata` / `update_mcp_metadata` 未持 DATA_MUTEX）应纳入本任务范围

**V1 现状**：§3.1 显式承认这两处不持锁是**现状缺口**（V3 之前就存在），本任务**不修**。

**为什么我建议修**：
1. **本任务必修这两个函数**（增 `category_id` 参数，§3.6） — 加 DATA_MUTEX 是 5-LoC 增量。
2. **hierarchy 引入后 race 窗口频率提升**：用户拖动重排（reorder）+ 主面板 dropdown 改 category（update_*_metadata）+ sidebar 改父级（set_category_parent）三路并发的概率比 V3 高得多。
3. **V1 §10 测试策略**已经写了 `concurrent_set_parent_and_add_no_lost_update`；再加一个 `concurrent_update_metadata_and_reorder_no_lost_update` 是顺手的事。
4. 本任务以"hierarchy 数据安全"为口号，让一个已知 lost update 路径继续存在，与口号矛盾。

**修复方案**：

```rust
// src-tauri/src/commands/skills.rs:60-103（替换实现）

#[tauri::command]
pub fn update_skill_metadata(
    skill_id: String,
    category: Option<String>,
    category_id: Option<String>,    // V1 §3.6 NEW
    tags: Option<Vec<String>>,
    enabled: Option<bool>,
    icon: Option<String>,
) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;        // ← P1-1 ADD
    let mut app_data = read_app_data()?;                                // ← REPLACE bare read

    let metadata = app_data
        .skill_metadata
        .entry(skill_id)
        .or_insert_with(SkillMetadata::default);

    if let Some(cat) = category {
        metadata.category = cat;
    }
    metadata.category_id = category_id;  // V1 §3.6 dual-write
    if let Some(t) = tags {
        metadata.tags = t;
    }
    if let Some(e) = enabled {
        metadata.enabled = e;
    }
    if let Some(i) = icon {
        metadata.icon = Some(i);
    }

    write_app_data(app_data)?;                                          // ← REPLACE bare write
    Ok(())
}
```

`mcps.rs::update_mcp_metadata` 对称改。

**风险**：吞吐影响。`update_*_metadata` 在 dropdown 改 category 时调用一次（用户级低频操作），加锁后串行排队最多增加 ~5-30ms（V1 §11 估算 DATA_MUTEX 持锁 ≤5ms IO 主导）。**对 UX 不可见**。

**V1 应在 §3.1 把"现状缺口"改为"本任务一并修复"**。

### P1-2：V1 §5.9 的 dropdown 改造列表与 R5 grep 实际命中不一致

V1 §5.9 列了 3 处 dropdown 改造（SkillDetailPanel / McpServersPage / ClaudeMdDetailPanel）+ 提了"`McpServersPage.tsx:219-228`、`McpDetailPanel.tsx`、`ClaudeMdDetailPanel.tsx:149-157`、`SkillsPage.tsx:218-227` 同模式改造"。

但 **R5 §3.6 + R1 §1.6 grep 显示**有 6 处 dropdown：
- `SkillDetailPanel.tsx:238-247, 414`（dropdown value=cat.name）
- `McpDetailPanel.tsx:222, 378`（dropdown value=cat.name）  ← V1 §5.9 提了但没列入"主改造"
- `SkillsPage.tsx:218-227, 451`（dropdown value=cat.name）
- `McpServersPage.tsx:219-228, 429`（dropdown value=cat.name）
- `ClaudeMdDetailPanel.tsx:149-157, 310`（dropdown value=cat.id — 不需要改 value 语义，但需树形渲染）
- `SkillDetailPage.tsx:79-100`（**没有 dropdown 但有 `categoryColors[selectedSkill.category]` lookup** — 需复读 categoryId fallback）

**R5 §3.7 列了 6 处 dropdown 改 value semantic + 3 处 autoClassify chain**，**V1 §5.9 漏列 SkillDetailPage**。

**修复**：V1 §5.9 必须**完整**列出 6 个 dropdown + 3 处 display fallback 路径，给每处 acceptance criteria；04 任务卡按这个表拆分。

---

### P1-3：cycle 检测在 `add_category` 中缺失（与 `set_category_parent` 不对称）

**V1 §3.3.1** 的 `add_category` 只校验 orphan + depth：

```rust
if let Some(pid) = parentId.as_deref() {
    let parent = data.categories.iter().find(|c| c.id == pid).ok_or(...)?;
    if parent.parent_id.is_some() {
        return Err(HierarchyError::DepthExceeded.to_string());
    }
}
```

**但**：新增的 category 还没存在，所以"自循环"和"环"都不可能 — 看似对称。

**仔细推理**：`add_category` 没有 target_id，所以**不能形成 cycle**（target 是新 UUID）。**这一点 V1 注释里说了**：

> Reuse the same checker minus self-as-parent / cycle / demote-with-children (those don't apply to a brand-new category).

✅ 这一点 V1 是**正确的**。我误判，撤回此 P1。但**测试套件应**有一个 `add_category_with_grandchild_parent_rejects_orphan` 显式覆盖（V1 §3.7 已有 `add_category_rejects_orphan_parent`）。

**降级为 P2**：建议 V1 §3.3.1 内的注释改清楚：「new UUID never appears in existing chain → no cycle/self/demote check needed」，让审阅者一目了然。

---

### P1-4：`set_category_parent` 返回 `Vec<Category>` 与 `reorder_categories` 一致 — 但 V1 §4.3 frontend 实现里调了同一个 enqueueReorder 队列，与现有 `reorderCategories` 串行 — 这一点 V1 写了但没核对边界

V1 §4.3 frontend `setCategoryParent` 复用了 `enqueueReorder` 队列：

```ts
return enqueueReorder(async () => {
  // ... set_category_parent IPC ...
});
```

**好处**：保证 `reorderCategories` 与 `setCategoryParent` 串行（用户连续拖动同时改顺序+父级，按提交顺序执行）。

**潜在问题**：用户**单次拖动**触发 `setCategoryParent` + `reorderCategories` 双 IPC（V1 §6.2 / §3.3.5 描述）。`enqueueReorder` 队列保证两个 IPC 顺序执行：
1. T1: `setCategoryParent("X", Some("P"))` 持 DATA_MUTEX → write data.json (parent_id 改了，**顺序不变**)
2. T2: `reorderCategories(orderedIds)` 持 DATA_MUTEX → write data.json (顺序改了，parent_id 不变)

**OK** — 两个 IPC 各自持锁，数据状态最终一致。但 **stage 1 optimistic 路径**：
- T1 optimistic 先把 `parentId` 改了（`set_category_parent` stage 1）。
- T2 optimistic 把 `categories` 顺序改了（`reorderCategories` stage 1，参 V1 §4.4）。
- 两个 stage 1 之间的中间状态：**parentId 已改 + 顺序未改**。这一帧 UI 是有意义的（dnd-kit 会立即重渲染，让 UI 反馈用户拖到了新位置），但**如果 stage 2 失败需要回滚**，需要回到原始 snapshot — V1 §4.3 / §4.4 fallback 都用了 `snapshot` 或 `get_categories` 重新拉取。

**不一致点**：V1 §4.3 fallback 路径若 `set_category_parent` IPC 失败，fallback 到 `get_categories` 拉取 + revert snapshot；但如果**T1 成功 + T2 失败**呢？UI 会有一个时刻显示新 parentId（已 IPC 持久化）但顺序回到 snapshot — 看起来"位置弹回"但 hierarchy 关系仍生效，**不是干净的 revert**。

**修复**：04 实施时，`reorderCategories` fallback 路径应该 **`get_categories` 拉取整个 categories 状态**（含 parentId），而不是用 snapshot — 这样 T2 失败时 UI 反映的是**T1 已持久化**的真实状态。

**V1 §4.4** 现状写 "fallback 时应保留 parentId 字段（自然由 spread 维持）"，但**没强调应该用 `get_categories` 拉取最新 backend 状态**而不是用 snapshot revert。

**降级建议**：V1 §4.4 增加一句"reorderCategories fallback 必须优先 `get_categories`，snapshot 仅作 last resort（与 V3 同模式）"，并增加测试：

```ts
test('setCategoryParent succeeded then reorderCategories failed should not revert parentId', async () => {
  // ...
});
```

---

### P1-5：`update_skill_metadata` IPC 签名变更可能破坏现有调用方

V1 §3.6 提议 `update_skill_metadata` 增 `category_id: Option<String>`（简化版，不用 Option<Option<T>>）。

**问题**：现有调用方有 4 处：
- `src/stores/skillsStore.ts:168`（updateSkillCategory）
- `src/components/layout/MainLayout.tsx`（间接调用）
- `src/stores/skillsStore.ts:391-401`（autoClassify）
- 还有未列入 V1 的潜在调用方（如 import / migration）

V1 §3.6 注释里说"调用方不能跳过 category_id 写入" — 这意味着 **每个**现有调用站点都需要传 `category_id`。

**但**：`update_skill_metadata` 的现有签名还接受 `tags / enabled / icon` — 它们都是 `Option<T>`，跳过表示"不修改"。新加的 `category_id` 写法（V1 §3.6 简化版）**没有"不修改"分支**。

**实际场景**：用户在 SkillDetail 里改 `enabled` 但不改 category — 调用 `update_skill_metadata` 必须**仍然传 category_id**，否则 V1 简化版会清空它。

**修复**：

**路径 A — 保持 Option<Option<T>>**：维持原 V1 §3.6 注释里讨论的复杂签名。

**路径 B — 把 category 与 category_id 移到独立的 IPC**：`update_skill_category` 专门改 category；`update_skill_metadata` 改其他元数据。这清晰但拆分 IPC。

**路径 C — V1 §3.6 简化版的代价是 caller 必须每次都重新读 metadata 然后重传 category_id**：V1 注释里说"所有调用站点都会同时设 category 与 category_id" — 但**`enabled` 切换路径**不会同时设。

**我的推荐**：**路径 A**。理由：
- 它解决了"不修改"语义。
- Tauri 的 `Option<Option<T>>` IPC 序列化在 v2.9 已被实战验证（参 `update_claude_md` 的 Option<String> 模式 — line 506）。
- LoC 增加 ~3 行（包装层 outer/inner Option）。

**V1 §3.6 应回到 Option<Option<T>> 复杂签名**，并在 §3.6 加一个注释："**外层 None = 不修改**, **外层 Some(None) = 清空**, **外层 Some(Some(id)) = 设值**" + 1 个 IPC 测试覆盖三种情况。

---

### P1-6：V1 §3.4 migration 的 mcp_metadata 路径里 `meta.scope` 没初始化

**V1 §3.4** migrate_category_id_for_skills_mcps 的 mcp_metadata 路径：

```rust
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
            report.orphan_mcps += 1;
        }
    }
}
```

✅ 这部分逻辑是对称且正确的（与 skill_metadata 路径一致）。

**但**：`McpMetadata` 现状声明（types.rs:190-198）：

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct McpMetadata {
    pub category: String,
    pub tags: Vec<String>,
    pub enabled: bool,
    pub usage_count: u32,
    pub last_used: Option<String>,
    pub scope: String, // "global" | "project"
}
```

`McpMetadata` **没有 `last_used` 之外的 Option 字段**，且 `scope` 是 String — 没有 `#[serde(default)]`。

**问题**：如果 mcp_metadata 之前的 data.json 没存 `scope`（或缺其他字段），`migrate_category_id_for_skills_mcps` 在 `read_app_data()` 时就会反序列化失败 — 还没到 migration 逻辑就 abort。

**核查**：实际 data.json 中 `mcpMetadata` 子对象什么样的？grep 一下：

实际 V3 现状：每次 `update_mcp_metadata` 调用都会写完整字段（types.rs 的 default 派生），所以**老 data.json 的 mcpMetadata 都是完整的**。但**首次启动 data.json 不存在时**初始化路径走 `init_app_data`（data.rs:148-208），那个路径里 `mcp_metadata: HashMap::new()`，根本没有 mcp metadata。

✅ **实际不会触发反序列化失败**。但**V1 §3.7 应增加一个测试**：

```rust
#[test]
fn migrate_category_id_with_partial_mcp_metadata_does_not_panic() {
    // Simulate user with old data.json containing mcp metadata that lacks scope field.
    // (Pre-V0 data, hypothetical.)
    // Assert migration runs without panic + falls back gracefully.
}
```

**降级为 P2 完整性瑕疵**：实际不会触发，但缺测试覆盖。

---

### P1-7：`Skill` / `McpServer` 不是持久化的对象 — V1 §3.6 改动 scan_* 函数时缺一句话警告

V1 §3.6 注释里说：

> 关键事实：`Skill` / `McpServer` 不是 data.json 中持久化的对象，而是 `scan_skills` / `scan_mcps` 在 IPC 调用时**实时从 metadata + 文件系统拼装**出来的。

这一点 V1 写得清楚 — 但**没有解释为什么这是 backward compat 的福音**：

- `Skill.category_id` 字段是 runtime-derived from metadata；data.json 里**只有** `skill_metadata.category_id` 一个真值 — 不存在双 SoT 数据 corruption 问题。
- 旧 data.json 没 `skill_metadata.category_id` → `metadata.and_then(|m| m.category_id.clone())` → `None` → `Skill.category_id = None`。前端 dual-read 路径从 `skill.category` (cached name) fallback。

**降级为 P2 完整性**：V1 §3.6 应加一句注释强调这一点（"`Skill.category_id` 字段是 runtime-derived，不存在双 SoT" — 让 04 实施 SubAgent 不会误以为要在 data.json 里持久化 `Skill` 对象）。

---

### P1-8：lib.rs 命令注册检查

V1 §3.3.3 显式提到：

```rust
.invoke_handler(tauri::generate_handler![
    // ...
    data::set_category_parent,                    // NEW
    data::migrate_category_id_for_skills_mcps,    // NEW
    // ...
])
```

✅ **V1 已显式列入**。

但 **04 任务卡必须显式核对**：lib.rs 注册在不同 PR 中容易遗漏（如果 SubAgent 把 set_category_parent 函数写好但忘了在 lib.rs 注册，前端 invoke 会 silently fail with "command not found"）。

**降级为 P2**：04 任务卡应有一个 acceptance criteria："**lib.rs 注册过 set_category_parent + migrate_category_id_for_skills_mcps**，CI 跑 grep 验证"。

---

### P1-9：fallback-path-must-be-unreachable-in-test 检查

**已读 `src-tauri/src/utils/path.rs`**（304 行）。`get_app_data_dir` 现状：

```rust
pub fn get_app_data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("ENSEMBLE_DATA_DIR") {
        return PathBuf::from(dir);
    }
    #[cfg(test)]
    {
        panic!(...)
    }
    #[cfg(not(test))]
    {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")).join(".ensemble")
    }
}
```

✅ Rule 已落实。**回归测试 `test_get_app_data_dir_panics_without_env_in_tests` 仍存在**（line 227-251）。

**V1 任何新代码引入新的 fallback path？**

逐个核对：
- `set_category_parent` — 仅持锁 + read_app_data → 不引入新路径。
- `migrate_category_id_for_skills_mcps` — 同上。
- `add_category` 改 — 同上。
- `delete_category cascade-promote` — 同上。

✅ **V1 没引入新的 unreachable-in-test 风险路径**。

但 **V1 §10 测试策略**应**显式 require**：所有新 integration test 必须用 `ScopedDataDir`（这一点 V1 §10.1 已写"使用 ScopedDataDir + ENSEMBLE_DATA_DIR override"）。✅ 满足。

---

### P1-10：`migrate_category_id_for_skills_mcps` 失败后的回滚保证

**V1 §3.4** 实现：

```rust
pub fn migrate_category_id_for_skills_mcps() -> Result<MigrateCategoryIdReport, String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    // ... migration logic ...

    write_app_data(data)?;
    Ok(report)
}
```

**问题**：如果 migration 跑到一半就 panic（如 OOM 或 unwrap 失败），`data` 是 in-memory 修改的部分，`write_app_data` 还没调到 → 数据库（data.json）没动。**这是天然的 atomicity 保证**（要么不写，要么完整写）。✅

**但**：如果 `write_app_data` 自己写到一半（如 disk full），data.json 处于损坏状态。**这是 `fs::write` 的现状 race**，不是本任务引入。`fs::write` 在 macOS 上原子性较差（不 fsync）— V3 之前就是这个状态。

**风险评估**：
- 概率：低（disk full 是 edge case）
- 严重度：高（data.json 损坏 = 应用启动失败）

**修复（不强制）**：
- 写入用 `tempfile + rename` 模式（atomic rename in POSIX）：

```rust
pub fn write_app_data(data: AppData) -> Result<(), String> {
    let data_path = get_data_file_path();
    if let Some(parent) = data_path.parent() {
        ensure_dir(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    let tmp_path = data_path.with_extension("json.tmp");
    fs::write(&tmp_path, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, &data_path).map_err(|e| e.to_string())?;  // atomic on same filesystem
    Ok(())
}
```

**V1 应在 §3.4 注释里讨论这个边缘场景**（migration 是单次大量数据写入，比单个 add/update 风险略高），并**至少声明**"如果 migration 失败用户重启 app 仍能 lazy fallback"（V1 §4.10 已写 "fallback 到 dual-read 的 name 比对路径"）。

**降级为 P2**：本任务范围不强求加 atomic write，但 V1 §3.4 应**显式提及** "migration 中途崩溃可恢复，因为 idempotent + dual-read fallback"。

---

## 6. P2 问题列表

### P2-1：V1 §3.1 grep 表格遗漏 `init_app_data` 内的 `write_app_data(default_data)?;`（line 198）

虽然这个路径是单线程启动期，无并发，但 grep-before-enumerate Rule 要求**全 callsite 列出**。修订：表格末尾加一行"`data.rs:198` `init_app_data` 单线程启动期 / 无需锁 / 不变"。

### P2-2：V1 §2.2 dual-field 表格 "category_id 指向已删除 id 理论上不可能" 措辞不严谨

cascade-promote 保证不丢 child，但用户手工编辑 / 跨版本数据导入仍有可能造成 dangling。措辞改为"正常路径不会发生；若发生，display 自动 fallback"。

### P2-3：V1 §3.7 缺 `migrate_category_id_with_partial_mcp_metadata_does_not_panic` 测试

虽然现状不会触发，但加这个测试是 future-proof（防止有人加新 McpMetadata 字段时忘了 default）。

### P2-4：V1 §3.6 注释应强调 `Skill.category_id` 是 runtime-derived（非持久化）

避免 04 实施 SubAgent 误以为要在 data.json 里持久化 `Skill` 对象。

### P2-5：V1 §3.3.1 注释应解释 `add_category` 不需要 cycle 检查的原因

"new UUID never appears in existing chain → no cycle/self/demote check needed" — 让审阅者一目了然。

### P2-6：04 任务卡应显式 acceptance criteria 核对 lib.rs 注册

防止 SubAgent 写好新 IPC 但忘了在 lib.rs 注册。

### P2-7：V1 §10 测试策略缺一个 `concurrent_update_metadata_and_reorder_no_lost_update`

如果决定按 P1-1 修复 GAP-1/2，则必须加这个测试。

### P2-8：V1 §3.4 注释应提及 migration 中途崩溃可恢复（idempotent + lazy fallback）

让 04 实施 SubAgent 知道这是 acceptable risk。

### P2-9：V1 §6.2 父类拖动 D5=B-1 的"父类不可成子" backend 接受度

V1 §3.7 测试 `valid_demote_root_without_children_to_another_root` 注释解释了"backend 不拒"（仅前端 UX gate）。这一点的注释应强调：**backend 是数据完整性闸；前端是 UX 闸**。如果 frontend 因 bug 被绕过（如未来 import 路径），backend 仍不会破坏 max depth=2 — 但**会接受 root → child of another root**（只要被移动的 root 自己没 children）。这一点 V1 注释已写，✅ 接受。

### P2-10：V1 §3.5 frontend AppSettings 类型同步

`src/types/index.ts:99-111` 的 `AppSettings` 加 `hasCompletedCategoryIdMigration?: boolean` — V1 §3.5 已提到，✅。但 **04 任务卡必须**列入 P2 类型同步：`SettingsState`（`src/stores/settingsStore.ts:18-46`）也要加字段，并跑 tsc --noEmit 验证。

如果走 P0-1 路径 B（把 flag 移到 AppData 而不是 AppSettings），这一项可以删除。

---

## 7. 赞赏点列表

### A1：DATA_MUTEX 协议覆盖 grep 重新枚举（§3.1）

V1 §3.1 显式列出 grep 命令 + 完整 stdout + 23 行表格 + 每条 callsite 决议。这是**严格按 `grep-before-enumerate-shared-resource.md` Rule 执行**的范例。审阅时只需 re-run grep + 比对表格即可，**Rule 落地的最佳实践**。

### A2：V3 不变量逐项核对（§12）

23 项 V3 不变量（远超 task spec 要求的 ≥ 22 项），每项标注"V1 改造下保留方案" + ✅。**完全没遗漏关键项**（snap modifier、220ms cascade、distance-aware settle、enqueueReorder 队列、categoriesVersion 协议、KeyboardSensor + sortableKeyboardCoordinates 全部覆盖）。

### A3：双字段 dual-write 策略（§2.2）

`category` (cached display) + `category_id` (SoT) 双字段共存策略**完美对接 ClaudeMdFile 的现有模式**（types.rs:653），且与 R1 §3.1 候选 A 论据一致。设计成熟、风险可控。

### A4：max depth=2 的 4 处 clamp 同步（§2.3）

清晰的 clamp 表（5 处实际，含 autoClassify 创建路径）+ 显式建议 04 任务卡的 acceptance criteria 必须把 clamp 作为单独勾选项 — **直接呼应 R2 §10 U1 的关键风险**。这是**风险驱动设计**的范例。

### A5：迁移 IPC `migrate_category_id_for_skills_mcps` 的 idempotent 设计

V1 §3.4 idempotent 设计（`category_id.is_some()` 跳过）+ orphan 处理（不修 + report 计数）+ 持锁串行 — **生产级迁移命令的标准模式**。

### A6：`apply_reorder` 不修改 + 单 SortableContext + 投影深度（§3.2 + §6.1）

不修改 V3 已稳定的 `apply_reorder` pure function，新增 hierarchy 改动走独立 `set_category_parent` IPC — **语义分离 + 单一职责**。这避免了"双语义函数"陷阱（参 V1 §3.3.5 解释）。

### A7：`delete_category` cascade-promote 而非 cascade-delete（§3.3.4）

R1 §6.2 反对声音 #3 已论证；V1 选 cascade-promote — 极简哲学一致 + 避免 Skill/MCP/ClaudeMd `category_id` 失效。**正确的设计选择**。

### A8：测试矩阵分层（§10）

unit (validate_hierarchy) + integration (ScopedDataDir + ENSEMBLE_DATA_DIR override) + concurrency (DATA_MUTEX 串行) + backward compat (serde roundtrip) — **完整的四层测试金字塔**。

### A9：与 ImplementationPlan 的衔接（§13）

5 个 wave 的依赖图清晰，每 wave 内任务可并行 — 给 04 实施 SubAgent 留下了**可直接执行的拆分**。

---

## 8. 要求 V2 修订

**true** — 必须 V2 修订。

### 触发条件
- 2 个 P0（数据语义级）必须修复
- 6 个 P1 中至少 P1-1 / P1-2 / P1-5 必须修复
- P2 可与 V1 → V2 cascade 一起处理

### V2 必须输出
- 更新 `Revision History (V1 → V2)` 声明 cascade footprint：
  - 影响 04_implementation_plan T1e（migration flag 路径）
  - 影响 04_implementation_plan T-FE-3（updateSkillCategory dropdown 改造）
  - 影响 04_implementation_plan T-BE-4（GAP-1/GAP-2 加锁）
- 走一次 `cross-document-cascade-discipline.md` 的 alignment SubAgent

---

## 9. patch list（可直接落到 V2 的具体修订）

### Patch 1（P0-1）：迁移 flag 移到 AppData

**Touch**：
- `.dev/category-hierarchy/03_tech_plan.md` §3.5（删除 AppSettings 改造）
- `.dev/category-hierarchy/03_tech_plan.md` §4.10（initApp 路径改为 read_app_data 检测 flag）
- `.dev/category-hierarchy/03_tech_plan.md` §3.4（`migrate_category_id_for_skills_mcps` 末尾设 `data.has_completed_category_id_migration = true`）

**新代码**（types.rs `AppData`）：

```rust
pub struct AppData {
    // ... existing fields ...
    /// V1 hierarchy migration state.
    #[serde(default)]
    pub has_completed_category_id_migration: bool,
}
```

**新代码**（commands/data.rs `migrate_category_id_for_skills_mcps`）：

```rust
pub fn migrate_category_id_for_skills_mcps() -> Result<MigrateCategoryIdReport, String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    if data.has_completed_category_id_migration {
        return Ok(MigrateCategoryIdReport { migrated_skills: 0, orphan_skills: 0, migrated_mcps: 0, orphan_mcps: 0 });
    }

    // ... existing migration logic ...

    data.has_completed_category_id_migration = true;
    write_app_data(data)?;
    Ok(report)
}
```

**前端**（appStore.ts initApp）：

```ts
initApp: async () => {
  // ... existing ...
  try {
    const data = await safeInvoke<AppData>('read_app_data');
    if (data && !data.hasCompletedCategoryIdMigration) {
      await safeInvoke('migrate_category_id_for_skills_mcps');
    }
  } catch (migErr) {
    console.warn('Category id migration failed (non-fatal):', migErr);
  }
}
```

### Patch 2（P0-2）：`delete_category cascade-promote` 同名碰撞处理

**Touch**：`.dev/category-hierarchy/03_tech_plan.md` §3.3.4

**新代码**：

```rust
pub fn delete_category(id: String) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    let deleted_parent_name = data
        .categories
        .iter()
        .find(|c| c.id == id)
        .map(|c| c.name.clone());

    let mut root_names: std::collections::HashSet<String> = data
        .categories
        .iter()
        .filter(|c| c.parent_id.is_none() && c.id != id)
        .map(|c| c.name.clone())
        .collect();

    for cat in data.categories.iter_mut() {
        if cat.parent_id.as_deref() == Some(&id) {
            cat.parent_id = None;
            if root_names.contains(&cat.name) {
                if let Some(parent_name) = &deleted_parent_name {
                    let mut new_name = format!("{} ({})", cat.name, parent_name);
                    let mut suffix = 2;
                    while root_names.contains(&new_name) {
                        new_name = format!("{} ({} {})", cat.name, parent_name, suffix);
                        suffix += 1;
                    }
                    root_names.insert(new_name.clone());
                    cat.name = new_name;
                }
            } else {
                root_names.insert(cat.name.clone());
            }
        }
    }

    data.categories.retain(|c| c.id != id);
    write_app_data(data)?;
    Ok(())
}
```

**新测试**（§3.7 增加）：

```rust
#[test]
fn delete_category_disambiguates_promoted_children_with_existing_root_name() {
    let _scope = ScopedDataDir::new();
    seed(vec![
        Category { id: "A".into(), name: "Web".into(), color: "#000".into(), count: 0, parent_id: None },
        Category { id: "B".into(), name: "Tools".into(), color: "#000".into(), count: 0, parent_id: None },
        Category { id: "C".into(), name: "Web".into(), color: "#000".into(), count: 0, parent_id: Some("B".into()) },
    ], vec![]);

    delete_category("B".into()).expect("delete_category");
    let final_data = read_app_data().expect("read_app_data");

    assert_eq!(final_data.categories.len(), 2);
    let cat_a = final_data.categories.iter().find(|c| c.id == "A").unwrap();
    assert_eq!(cat_a.name, "Web");
    let cat_c = final_data.categories.iter().find(|c| c.id == "C").unwrap();
    assert_ne!(cat_c.name, "Web");
    assert!(cat_c.parent_id.is_none());
    assert!(cat_c.name.contains("Web") && cat_c.name.contains("Tools"));
}
```

### Patch 3（P1-1）：GAP-1/GAP-2 加锁

**Touch**：`.dev/category-hierarchy/03_tech_plan.md` §3.1（"现状缺口"改为"本任务一并修复"）+ §3.6（update_*_metadata 实现示例加 DATA_MUTEX）

**新代码**（skills.rs，对称 mcps.rs）：

```rust
#[tauri::command]
pub fn update_skill_metadata(
    skill_id: String,
    category: Option<String>,
    category_id: Option<Option<String>>,    // P1-5: revert to Option<Option<T>> for "no change" semantics
    tags: Option<Vec<String>>,
    enabled: Option<bool>,
    icon: Option<String>,
) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut app_data = read_app_data()?;

    let metadata = app_data
        .skill_metadata
        .entry(skill_id)
        .or_insert_with(SkillMetadata::default);

    if let Some(cat) = category {
        metadata.category = cat;
    }
    if let Some(cid_outer) = category_id {
        metadata.category_id = cid_outer;
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

    write_app_data(app_data)?;
    Ok(())
}
```

**新测试**（concurrency）：

```rust
#[test]
fn concurrent_update_metadata_and_reorder_no_lost_update() {
    let _scope = ScopedDataDir::new();
    seed(vec![cat("A"), cat("B"), cat("C")], vec![]);

    let mut handles = Vec::new();
    for i in 0..5 {
        handles.push(std::thread::spawn(move || {
            update_skill_metadata(
                format!("skill-{i}"),
                Some("A".to_string()),
                Some(Some("cat-id-A".to_string())),
                None, None, None,
            ).expect("update_skill_metadata");
        }));
    }
    for _ in 0..5 {
        handles.push(std::thread::spawn(|| {
            let _ = reorder_categories(vec!["C".into(), "A".into(), "B".into()]);
        }));
    }
    for h in handles { h.join().unwrap(); }

    let final_data = read_app_data().expect("read_app_data");
    assert_eq!(final_data.skill_metadata.len(), 5);
}
```

### Patch 4（P1-2）：dropdown 改造列表完整化

**Touch**：`.dev/category-hierarchy/03_tech_plan.md` §5.9 增加完整 6 处改造表 + 03 处 display fallback：

| 文件:行 | 类型 | 处理 |
|---|---|---|
| `SkillDetailPanel.tsx:238-247, 414` | dropdown | 改 value: name → categoryId + 树形 indent |
| `SkillsPage.tsx:218-227, 451` | dropdown | 同上 |
| `McpDetailPanel.tsx:222, 378` | dropdown | 同上 |
| `McpServersPage.tsx:219-228, 429` | dropdown | 同上 |
| `ClaudeMdDetailPanel.tsx:149-157, 310` | dropdown | 改：仅树形 indent（value 已是 id） |
| `SkillDetailPage.tsx:79-100` | display | categoryColors 用 categoryId fallback to name |
| `SkillItem.tsx:113`, `SkillListItem.tsx:68` | display | category 显示需 categoryId resolve 当前 name |
| `McpListItem.tsx:76`, `McpItem.tsx:28`, `McpDetailPanel.tsx:52` | display | 同上 |

### Patch 5（P1-5）：恢复 `Option<Option<T>>` IPC 签名

**Touch**：§3.6 删除"简化为 Option<String>"段，恢复完整 Option<Option<T>> + 三种 case 的注释 + IPC 测试。

### Patch 6（P2 各项）：

- §3.1 表格加 `data.rs:198 init_app_data`
- §2.2 dual-field 表格措辞改"正常路径"
- §3.7 加 `migrate_category_id_with_partial_mcp_metadata_does_not_panic`
- §3.6 加 `Skill.category_id is runtime-derived` 注释
- §3.3.1 加 `new UUID never appears in chain` 注释
- §13 / 04 任务卡 acceptance criteria 加 lib.rs 注册核对

---

## confidence

90/100

**置信度折扣来源**（10 点）：
- 5 点：P0-1 的实际触发概率取决于用户改 setting 的频率 + saveSettings 实施细节 — 我推断"silent reset"是必然的，但**未本地实测**（建议 V2 修订时本地用 ScopedDataDir 跑一个 fixture 验证）。
- 3 点：P0-2 的 cascade-promote 同名碰撞场景，**用户实际触发概率**取决于他/她是否会在两个不同父类下创建同名 child — 单用户场景下可能性中等（但一旦发生 = 数据 corruption）。
- 2 点：P1-1 的 GAP-1/GAP-2 修复理论上正确但**LoC 风险与现状打架**（V3 之前未发现这个 race 触发，可能是因为 update_skill_metadata 调用频率低）— 我建议补但**不强求**。

**所有 P0/P1 都基于一手代码核查**：
- types.rs 全文读
- data.rs / skills.rs / mcps.rs / claude_md.rs 关键段读
- settingsStore.ts saveSettings 路径行号级核对
- 4 次独立 grep 结果
- V3 03_tech_plan §3.1（V3 baseline 协议）逐项对照

## takeaway

**架构与数据模型设计扎实、grep 规则履行良好、V3 不变量逐项核对、迁移幂等设计正确**。但 **2 个 P0 必须修**（migration flag 与 settingsStore enumerate 撞车 → 每次改 setting 重置 flag；cascade-promote 同名子类碰撞 → 数据 corruption）+ **3 个 P1 必须修**（GAP-1/GAP-2 加锁、dropdown 改造列表完整化、Option<Option<T>> 恢复"不修改"语义）。剩余 P2 可与 V1 → V2 cascade 一起处理。**修订后预期评分 95+**。
