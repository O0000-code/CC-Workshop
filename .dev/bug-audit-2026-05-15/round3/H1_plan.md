# Round 3 H1 Implementation Plan

Author: H1 (Opus 4.7) — 2026-05-16

Scope: 4 housekeeping P3 fixes (R3-1 三态 sceneId / R3-2 AppData forward-compat / R3-3 删 SceneDetailPage 死代码 / R3-4 println→log).

---

## R3-1: `update_project.sceneId` 改三态 `Option<Option<String>>`

### Files & line numbers

| File | Function | Lines |
|---|---|---|
| `src-tauri/src/commands/data.rs` | `update_project` | 1511-1542 |
| `src/stores/projectsStore.ts` | `updateProject` action | 222-238 |
| `src/types/index.ts` | (no change — `Project.sceneId: string` 不变,空字符串=未绑定) | — |

### Pattern source (round 1 A8)

- Backend `categoryId: Option<Option<String>>` 模式见 `rules.rs::update_rule` (line 505-587),mutation 用 `if let Some(new_category_id_opt) = categoryId { rule.category_id = new_category_id_opt; }`
- 由于 `Project.scene_id` 是 `String`(非 `Option<String>`),我们用 `unwrap_or_default()` 把 `Some(None)` 折叠成空字符串(主 Agent 决策:空字符串 = 未绑定,与 `add_project` 保持一致)
- 前端 store 模式见 `rulesStore.ts::updateRule` line 271-281

### Code change

**Backend** (`data.rs:1514-1533`):
```rust
pub fn update_project(
    id: String,
    name: Option<String>,
    path: Option<String>,
    sceneId: Option<Option<String>>,   // ← was Option<String>
    lastSynced: Option<String>,
) -> Result<(), String> {
    ...
    if let Some(new_scene_id_opt) = sceneId {
        // Some(Some(id))  → set to id
        // Some(None)      → clear (empty string sentinel; matches
        //                    add_project + project.scene_id is String)
        project.scene_id = new_scene_id_opt.unwrap_or_default();
    }
    ...
}
```

**Frontend** (`projectsStore.ts:222-238`):
- Mirror the explicit-payload-key pattern from `rulesStore.ts::updateRule`
- Detect intent via `'sceneId' in data` so undefined collapses to null

### Caller compatibility (grep verified)

`updateProject(` callers in `src/`:

| Site | Call | New backend behavior |
|---|---|---|
| `LauncherModal.tsx:97` | `updateProject(existingProject.id, { sceneId: selectedSceneId })` | `selectedSceneId: string` → `Some(Some("..."))` → 正确 set |
| `ProjectsPage.tsx:132` | `updateProject(iconPickerState.projectId, { icon: iconName })` | no `sceneId` key → `None` → no-op on scene_id ✓ |
| `ProjectsPage.tsx:153` | `updateProject(projectId, { sceneId: newSceneId })` | `newSceneId: string` → `Some(Some("..."))` → 正确 set |
| `projectsStore.ts:376` | `safeInvoke('update_project', { id, lastSynced: now })` | no `sceneId` → `None` → no-op ✓ |
| `projectsStore.ts:423` | `safeInvoke('update_project', { id, lastSynced: null })` | no `sceneId` → `None` → no-op ✓ |

**已 verify**:无现有 caller 传 `sceneId: ''` 或 `sceneId: null`。改动**不影响**任何现有 caller。

注意:第 132 行的 `updateProject(_, { icon: iconName })` 是一个**预先存在的脱钩** — `update_project` 后端从未接收 `icon` 参数;Tauri IPC 会忽略未声明的 key。**不在本 finding scope**(R3 charter 严格禁止 scope 外修改)。

### User-observable success contract

- **User does X**: 用户在前端 ProjectsPage(或未来 UI 暴露 "Unbind Scene" 操作)调用 `updateProject(projectId, { sceneId: null })`
- **User sees Y**: backend `project.scene_id` 变为 `""` (空字符串); 之后 sync 时显示 "Scene not found" 这是合理 — 用户已主动解绑
- **User does NOT see Z**: 不再出现"无法清空"的脱钩;`updateProject(id, { lastSynced: now })` 不再误改 scene_id

注意:当前前端 UI **没有** "Unbind Scene" 按钮(R3 F10 finding 说 "needs lead-agent verify"),但 backend 多态契约的 fix 让未来 UI 工作不被阻塞,且对称于 `add_project`/`update_rule`/`update_claude_md` 的 round-1 修复。

---

## R3-2: `AppData` 加 `schema_version: u32` + `#[serde(flatten)] other`

### Files & line numbers

| File | Lines |
|---|---|
| `src-tauri/src/types.rs` (const + AppData struct) | new const before AppData (line ~229); fields appended end of AppData struct (line ~295) |
| `src-tauri/src/commands/data.rs::read_app_data` | line 273 (Ok branch) |
| `src-tauri/src/commands/data.rs::write_app_data` | line 337-368 |

### Step 1: Add const + fields to AppData

Place const **before** `pub struct AppData` (line ~229):
```rust
/// Current AppData schema version. Bump when adding a field that older
/// app versions cannot safely ignore. Most additions can rely on
/// `#[serde(default)]` + the `other: flatten` map below and do NOT
/// need a bump.
pub const APP_DATA_SCHEMA_VERSION: u32 = 1;
```

Append at the **end** of the `AppData` struct (after `imported_marketplace_skills`, line ~294 before closing `}`):
```rust
    /// Schema version anchor (R3-2 passive forward-compat). On-disk
    /// version is bumped explicitly when AppData adds breaking
    /// semantics. Currently informational only — `read_app_data` logs
    /// a stderr warning when on-disk version exceeds the runtime
    /// constant `APP_DATA_SCHEMA_VERSION`, but does NOT refuse to
    /// operate. Active refuse-to-mutate is intentionally deferred for
    /// a single-developer project.
    #[serde(default)]
    pub schema_version: u32,
    /// Forward-compat: unknown fields from a newer version are captured
    /// here on read and re-emitted on write. Round-trip safe: V2 → V3
    /// → V2 → V3 preserves V3-only fields. Mirrors `ClaudeJson::other`
    /// (types.rs:~640).
    #[serde(flatten, default, skip_serializing_if = "std::collections::HashMap::is_empty")]
    pub other: std::collections::HashMap<String, serde_json::Value>,
```

### Step 2: read_app_data version-mismatch warning

`data.rs:273` `Ok(data) => Ok(data)` 改为:
```rust
Ok(data) => {
    if data.schema_version > crate::types::APP_DATA_SCHEMA_VERSION {
        eprintln!(
            "[read_app_data] WARNING: data.json schema_version is {} but this build supports only {}. Some new fields will be preserved via `other` flatten map, but new semantics will be ignored. Consider upgrading the app.",
            data.schema_version,
            crate::types::APP_DATA_SCHEMA_VERSION
        );
    }
    Ok(data)
}
```

### Step 3: write_app_data stamps current version

`data.rs:337` 改 `pub fn write_app_data(data: AppData)` → `pub fn write_app_data(mut data: AppData)`, 在 step 1 (serialize) 之前插入:
```rust
// Stamp current runtime schema version so the written file always
// carries the build's version anchor. Round-trip from older versions
// will preserve unknown fields via `other` flatten.
data.schema_version = crate::types::APP_DATA_SCHEMA_VERSION;
```

### Frontend (`src/types/index.ts::AppData`)

加可选字段:
```typescript
/**
 * Schema version (R3-2 passive forward-compat). Bumped by Rust runtime
 * on every `write_app_data`. Frontend reads only, never sets.
 */
schemaVersion?: number;
```

(注:前端不需要 mirror `other` flatten map — frontend 读 AppData 之后是从 store 派生数据,unknown fields 不参与;backend 自己在 round-trip 中 preserve 即可)

### Caller compatibility

- `#[derive(Default)]` 仍然为 AppData 自动派生(`schema_version: 0`,`other: HashMap::new()`)
- 所有现有 ~70 个 `write_app_data` callsite **不需要改动**(签名为 `pub fn write_app_data(data: AppData)` → `pub fn write_app_data(mut data: AppData)` 不影响 caller — caller 传值不变)
- 所有现有 `read_app_data` callsite 不变(返回类型相同)
- 现有 unit tests 仍 pass:`AppData::default()` 现在多两个字段但都是 default 值

### User-observable success

R3-2 是 passive forward-compat,**没有可见用户行为**。验证标准:
- 写新 data.json 后,文件包含 `"schemaVersion": 1` 顶层字段
- 测试 round-trip:V2 写 `{schemaVersion: 99, futureField: "abc"}` → V1 read → V1 write → file 仍保留 `futureField: "abc"` 在顶层(via `other` flatten)
- 现有 data.json(无 schemaVersion field)启动正常 → default 0 → backend 写后 stamp 为 1

---

## R3-3: 删 `src/pages/SceneDetailPage.tsx` 死代码

### Files

| File | Action |
|---|---|
| `src/pages/SceneDetailPage.tsx` (498 lines) | 删除 |
| `src/pages/index.ts:5` | 移除 re-export 行 |

### Pre-delete verification (cascade)

`grep -rn 'SceneDetail' src/ --include='*.tsx' --include='*.ts'` 结果(已 run):

```
src/pages/SceneDetailPage.tsx:122:// SceneDetailPage Component  (in-file comment)
src/pages/SceneDetailPage.tsx:125:export const SceneDetailPage: React.FC = () => {
src/pages/SceneDetailPage.tsx:498:export default SceneDetailPage;
src/pages/index.ts:5:export { default as SceneDetailPage } from './SceneDetailPage';
```

确认**只有自身 + re-export**。`App.tsx` 不导入,无路由注册。安全删除。

### User-observable success

- **User does X**: 用户在 app 任何页面操作
- **User sees Y**: 无变化(死代码,用户从未访问过)
- **User does NOT see Z**: 不再有 ~5-10KB 的 dead bundle 代码;新加入的 maintainer 不再被误导

---

## R3-4: println! → log 宏

### Complete inventory (29 处)

注:R3 F7 finding 说 "32 处",但实际 grep `\bprintln!` (排除 eprintln) 在 `src-tauri/src/commands/*.rs` 命中 **29 处**(可能 finding 把 `eprintln!` 也算进 count;但 charter 明确说"32 处 println → log",并明确说**保留** eprintln 在 read_app_data recovery / lib.rs setup / tests)。

实际我应改的 = 29 处 `println!`(全是 production path,无一在 test 模块或 recovery 路径)。

| File | Line | Current | New level | Reason |
|---|---|---|---|---|
| `claude_md.rs` | 324 | `println!("[import_claude_md] Called with source_path: {}", options.source_path);` | `log::debug!` | trace/debug log,内部 |
| `claude_md.rs` | 326 | `println!("[import_claude_md] Expanded path: {:?}", source_path);` | `log::debug!` | trace |
| `claude_md.rs` | 330 | `println!("[import_claude_md] Source file not found!");` | `log::warn!` | failure path |
| `claude_md.rs` | 344 | `println!("[import_claude_md] Read content, length: {}", content.len());` | `log::debug!` | trace |
| `claude_md.rs` | 355 | `println!("[import_claude_md] Generated name: {}", name);` | `log::debug!` | trace |
| `claude_md.rs` | 363 | `println!("[import_claude_md] Written to managed path: {}", managed_path);` | `log::info!` | success milestone |
| `claude_md.rs` | 383 | `println!("[import_claude_md] Created file with id: {}", file.id);` | `log::info!` | success milestone |
| `claude_md.rs` | 386 | `println!("[import_claude_md] Reading app_data...");` | `log::debug!` | trace |
| `claude_md.rs` | 389 | `println!("[import_claude_md] Current claude_md_files count: {}", app_data.claude_md_files.len());` | `log::debug!` | trace |
| `claude_md.rs` | 391 | `println!("[import_claude_md] After push, count: {}", ...);` | `log::debug!` | trace |
| `claude_md.rs` | 392 | `println!("[import_claude_md] Writing app_data...");` | `log::debug!` | trace |
| `claude_md.rs` | 394 | `println!("[import_claude_md] Write complete!");` | `log::debug!` | trace |
| `claude_md.rs` | 619 | `println!("[delete_claude_md] Warning: Failed to save info.json: {}", e);` | `log::warn!` | recoverable failure |
| `claude_md.rs` | 626 | `println!("[delete_claude_md] Warning: Failed to create trash directory: {}", e);` | `log::warn!` | recoverable failure |
| `claude_md.rs` | 633 | `println!("[delete_claude_md] Warning: Failed to move to trash: {}", e);` | `log::warn!` | recoverable failure |
| `claude_md.rs` | 636 | `println!("[delete_claude_md] Warning: Failed to delete directory: {}", e);` | `log::warn!` | recoverable failure |
| `claude_md.rs` | 639 | `println!("[delete_claude_md] Moved to trash: {:?}", trash_dest);` | `log::info!` | success milestone |
| `claude_md.rs` | 747 | `println!("[set_global_claude_md] Auto-imported existing global file as 'Original Global'");` | `log::info!` | success milestone |
| `claude_md.rs` | 967 | `println!("[Migration] Migrated CLAUDE.md: {} (id: {})", file.name, file.id);` | `log::info!` | progress |
| `claude_md.rs` | 973 | `println!("[Migration] CLAUDE.md storage migration completed");` | `log::info!` | progress |
| `data.rs` | 1361 | `println!("add_scene called: name={}, ...", ...);` | `log::debug!` | trace |
| `data.rs` | 1364 | `println!("Current scenes count: {}", data.scenes.len());` | `log::debug!` | trace |
| `rules.rs` | 608 | `println!("[delete_rule] Warning: Failed to remove global rule file ...");` | `log::warn!` | recoverable failure |
| `rules.rs` | 631 | `println!("[delete_rule] Warning: Failed to save info.json: {}", e);` | `log::warn!` | recoverable failure |
| `rules.rs` | 638 | `println!("[delete_rule] Warning: Failed to create trash directory: {}", e);` | `log::warn!` | recoverable failure |
| `rules.rs` | 647 | `println!("[delete_rule] Warning: Failed to move to trash: {}", e);` | `log::warn!` | recoverable failure |
| `rules.rs` | 649 | `println!("[delete_rule] Warning: Failed to delete directory: {}", e);` | `log::warn!` | recoverable failure |
| `rules.rs` | 652 | `println!("[delete_rule] Moved to trash: {:?}", trash_dest);` | `log::info!` | success milestone |
| `rules.rs` | 757 | `println!("[set_global_rule] Auto-imported existing global rule as 'Original {}'", original_filename);` | `log::info!` | success milestone |

### Preserved (do NOT touch — charter explicit)

- **`eprintln!` in `read_app_data` recovery path** (`data.rs:279,288,304`) — fires when logging framework may be uninit
- **`eprintln!` in `lib.rs::setup`** — same reason
- **`eprintln!` elsewhere** (data.rs:696,911,935,1112,1118,1149,1155; marketplace.rs production paths; plugins.rs; trash.rs) — preserve per charter ("do not change eprintln"); charter only mandates `println! → log`

### Import requirements

`log` crate already in `src-tauri/Cargo.toml:23` (`log = "0.4"`). 无需新依赖。无需 `use log;` import — `log::warn!()` 等用 fully-qualified macro path 即可(`usage.rs:164` 已是这个模式)。

### User-observable success

- **User does X**: 用户运行 release build 后做任何 import/delete 操作
- **User sees Y**: macOS Console.app stdout 不再被污染(`tauri_plugin_log` 默认 release build 不输出);debug build 仍输出 Info+ (维持开发体验)
- **User does NOT see Z**: 不再在 Console.app 看到泄漏 `/Users/<name>/...` 绝对路径(注:warn 级别 log 仍含路径,但 release 默认不输出)

---

## Cross-cutting checks

1. **绝对不**改 round 1/2 已 commit 修复(grep `0ec5081`, `4f5022e`, `9faaa2a` 的改动文件,在不冲突的相同文件中只改 R3 scope 内函数)
2. **不引入新依赖**(log 已在 Cargo.toml)
3. **不改 IPC 名/形状**(R3-1 仅扩展三态语义,JSON 层兼容)
4. **不改 test 输出 eprintln / println**
5. **R3-2 `mut data` 改动**只在 `write_app_data` 一处,签名对 caller 透明

## Gate 顺序

1. `cd src-tauri && cargo build`
2. `cd src-tauri && cargo test --lib`
3. `npx tsc --noEmit`
4. `npx eslint src/`
5. `npx vitest run`

每 gate FAIL 立即 stop + log。
