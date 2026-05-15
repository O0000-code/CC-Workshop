# G2 Plan — Plugin + Trash 长期清理 (Round 2)

## Scope: R2-6, R2-9, R2-10

---

## R2-6 — `import_plugin_skills` / `import_plugin_mcps` 错误返回前端

### 当前症状
- `plugins.rs:762-765` (import_plugin_skills) + `plugins.rs:872-875` (import_plugin_mcps):errors 只 `eprintln!`,return `Ok(imported_plugin_ids)`。
- 前端只拿到 `Vec<String>` 成功列表;失败的条目没有信号。
- User does X(选 5 条 plugin skills,2 条 dest 已存在 / source 失踪)→ 当前 User sees Y("全部成功"导入)→ 真实情况只 3 条落盘。

### 修复

**Step 1: 新增结构体** (`types.rs` 紧邻 `PluginImportItem`):
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginImportError {
    pub plugin_id: String,
    pub item_name: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginImportResult {
    pub imported: Vec<String>,
    pub errors: Vec<PluginImportError>,
}
```

**Step 2: 改 `plugins.rs` 两函数签名**
- 返回 `Result<PluginImportResult, String>` 替代 `Result<Vec<String>, String>`
- error vec 类型从 `Vec<String>` 改为 `Vec<PluginImportError>`,带 plugin_id + item_name + 详细 error
- 末尾 `Ok(PluginImportResult { imported, errors })` — **保留 eprintln**(server log 仍有用,不吞错)

**Step 3: 前端类型** (`src/types/plugin.ts`):
- 新增 `PluginImportError` + `PluginImportResult`

**Step 4: 前端 `pluginsStore.ts` 两 action**
- `importPluginSkills` / `importPluginMcps`:返回类型从 `Promise<string[]>` 改为 `Promise<PluginImportResult>`
- safeInvoke 拿 `PluginImportResult`,addImported 用 `result.imported`,新增 errors 暴露途径

**Step 5: 前端 modals** (`ImportSkillsModal.tsx` / `ImportMcpModal.tsx`)
- `handleImportPluginSkills` / `handleImportPluginMcps`:从 `await importPluginSkills(...)` 拿 result
- result.errors 非空时:**不**直接 onClose,而是 `setRestoreError`-style 红色 banner 展示
  - 文案: `Imported {imported}, failed {failed}: {first 2 details + "..."}`
- result.errors 为空时:保持原流程(close + onImportComplete)

### User-Observable Success Contract
- **User does X**: 用户在 Import Plugin Skills 选 5 条,2 条会因为 dest 已存在 / source 失踪等 fail
- **User sees Y**: modal 不立即 close;顶部红色 banner: "Imported 3, failed 2: my-skill (Source path does not exist), other-skill (Failed to create symlink: ...)";用户可以 "Dismiss" 或重选
- **User does NOT see**: 不会"全部 5 条标记为已导入但 SkillsPage 只看到 3 条"的静默部分失败

---

## R2-9 — Trash 永久删除 + Empty Trash

### 当前症状
- `~/.ensemble/trash/` 只增不减(skills / mcps / claude-md / rules),3 月-1 年后达 GB 级
- 无 UI 入口清理

### R5 警示约束
**自动清理必须用户可见可关 — 不引入静默后台 GC**。本轮只加**手动**清理。Empty Trash + per-row 永久删除,**必须二次 confirm**。

### 修复

**Step 1: 新增 2 个 IPC** (`trash.rs`)

```rust
/// Permanently delete one trashed entry (one of:
///   - skill / claude-md / rule directory
///   - mcp `.json` file
///   - scene / project record in data.json::trashed_{scenes,projects}
/// Best-effort signature: returns Ok(()) on success, Err on failure.
#[tauri::command]
pub fn delete_trashed_item_permanently(
    kind: String,          // "skill" | "mcp" | "claudeMd" | "rule" | "scene" | "project"
    trash_path_or_id: String,
) -> Result<(), String>
```

- 对 `skill/mcp/claudeMd/rule`:`trash_path_or_id` 是 disk path → `fs::remove_{dir_all,file}`
- 对 `scene/project`:`trash_path_or_id` 是 id → 持 `DATA_MUTEX` 从 `data.trashed_scenes/projects` 移除

```rust
/// Best-effort: empty all trash storage AND clear data.json trashed_scenes/projects.
/// Returns errors aggregated as Vec<String>(per-item failures) — UI can show
/// "Emptied N items, M errors".
#[tauri::command]
pub fn empty_trash(ensemble_dir: String) -> Result<Vec<String>, String>
```

- 持 `DATA_MUTEX`:`data.trashed_scenes.clear()` + `data.trashed_projects.clear()` + `write_app_data(data)`
- 然后扫 4 trash dirs(skills/mcps/claude-md/rules):对每个 top-level entry 调 `fs::remove_{dir_all,file}`
- 每个 entry 失败时 push `format!("Failed to remove {}: {}", display_name, e)` 到 errors,**继续**下一条

**Step 2: 注册到 `lib.rs`**(放在 `trash::restore_project` 后)

**Step 3: 前端 `trashStore.ts` 2 action**
- `deleteTrashedItemPermanently(kind, pathOrId)`: 调 IPC,成功后 `await get().loadTrashedItems()` 刷新
- `emptyTrash()`: 同上,返回 errors 数组供 UI 展示

**Step 4: 前端 `TrashRecoveryModal.tsx` UI 改动**
- 顶部右侧(就在 close X 按钮旁边)加一个 **"Empty Trash" 按钮**:
  - 仅在 `totalCount > 0` 时显示
  - destructive style:`bg-[#FEE2E2]` text `text-[#DC2626]` border red(对应 design-language `--color-error` token)
- 每个 list row(`renderRow`)在 checkbox 右边加一个 **trash icon button (`lucide-react` `Trash2`)** :
  - hover 显示,默认 dim
  - 点击触发**单条**永久删除 confirm
- Confirm 模态:
  - **同一个 modal 内**渲染 confirm overlay,避免 nested portal modal-on-modal(`.claude/rules/design-language.md` "Visual hierarchy ≤ 3 layers")
  - 文案: "Permanently delete {N} items? This cannot be undone."  + "Cancel" / "Delete Permanently"(红色 destructive btn)

### User-Observable Success Contract — Empty Trash
- **User does X**: 用户在 TrashRecoveryModal 点 "Empty Trash"
- **User sees Y**: 同一 modal 中央显示 confirm: "Permanently delete N items? This cannot be undone." + Cancel/Delete Permanently;点 Delete 后 trash 清空,modal 内的 6 个 tab 全显示 empty state
- **User does NOT see**: 静默删除(无 confirm 直接清空);删了之后又出现

### User-Observable Success Contract — per-row Delete
- **User does X**: 用户在某 tab 的某行点 trash icon
- **User sees Y**: 同一 confirm 提示"Permanently delete '{name}'? This cannot be undone." → 确认后这一行从列表消失,trashedItems count -1
- **User does NOT see**: 单击就立即删除(无 confirm);删了之后又出现

---

## R2-10 — Plugin orphan marker cleanup

### 当前症状
- 用户卸载 plugin 后,`data.json::imported_plugin_skills`/`imported_plugin_mcps` 里残留 marker
- 重装同 plugin 时 detect 显示"已导入"但实际 symlink broken
- 用户陷入 cycle

### 修复

**Step 1: 新增 IPC** (`plugins.rs`)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginImportCleanupResult {
    pub removed_skills: u32,
    pub removed_mcps: u32,
}

/// Clean up orphan markers in `imported_plugin_skills` / `imported_plugin_mcps`
/// that point to plugins no longer installed in `~/.claude/plugins/cache/`.
///
/// Logic:
/// 1. Walk cache to build installed_plugin_ids set (same logic as `detect_installed_plugins`)
/// 2. For each entry "<plugin_id>|<item_name>" in markers Vec, retain when plugin_id ∈ set
/// 3. Persist + return counts
#[tauri::command]
pub fn cleanup_orphan_plugin_imports() -> Result<PluginImportCleanupResult, String>
```

- 持 `DATA_MUTEX`
- 用现有 `installed_plugins.json` parse 路径(已存在于 `detect_installed_plugins`)— 提炼一个 helper `read_installed_plugin_ids() -> HashSet<String>`,detect 函数和 cleanup 函数共用
- **保守语义**:malformed entry(无 `|`)retain — 不让 schema 变化误删用户数据
- 写回 `imported_plugin_skills.retain(...)` + `imported_plugin_mcps.retain(...)` + `write_app_data(app_data)?`

**Step 2: 注册到 `lib.rs`**

**Step 3: 前端 `pluginsStore.ts`**
- 在 `detectPluginSkillsForImport` 和 `detectPluginMcpsForImport` action 开头(`set isDetecting...` 之后,`read_app_data` 之前)调用 `cleanup_orphan_plugin_imports`
- 不需要 UI 提示(silent self-heal);若 `removed > 0` 仅 console.log

### User-Observable Success Contract
- **User does X**: 用户从 Claude Code 卸载某 plugin "claude-skills"(含 10 个 skills),然后在 Ensemble 重新打开 Import Plugin Skills modal
- **User sees Y**: 该 plugin 不在 detect 列表(因为 cache 已没了);如果用户**再装回**相同 plugin,detect 列表里的 10 条 skill 全是 **可选状态**(不是"Already imported" 灰态),可正常 import
- **User does NOT see**: "Already imported" 但实际 broken symlink(无法 re-import 的循环)

---

## Grep Verification (per `grep-before-enumerate-shared-resource.md`)

```bash
# write_app_data / read_app_data callsites (shared DATA_MUTEX resource)
rg -n 'write_app_data|read_app_data' src-tauri/

# imported_plugin_skills / imported_plugin_mcps callsites
rg -n 'imported_plugin_skills|imported_plugin_mcps|importedPluginSkills|importedPluginMcps' src/ src-tauri/

# import_plugin_skills / import_plugin_mcps invokers
rg -n 'import_plugin_skills|import_plugin_mcps|importPluginSkills|importPluginMcps' src/ src-tauri/
```

新 IPC `delete_trashed_item_permanently`、`empty_trash`、`cleanup_orphan_plugin_imports` 都加新行;**不**改任何 round 1 已 commit 代码。

## 自检 6 问

1. 触及 finding 外代码?— 是。`types.rs` 加 3 个新结构体;`lib.rs` 新增 3 个 IPC 注册;`pluginsStore.ts` action 返回类型变化(用户可见的 ImportSkillsModal/ImportMcpModal 跟着改)— 所有都是 finding 直接要求。
2. 同款 bug 别处?— grep `eprintln!.*errors` 在 `marketplace.rs` 等也有,但**scope 外**。本轮只 R2-6/9/10。
3. 新依赖?— 无。`Trash2` icon 已在 `lucide-react` 中。
4. 改 round 1 代码?— 不。`trash.rs` 加新函数,`plugins.rs` 改 2 函数 + 加 1 函数;`types.rs` 加新结构。round 1 的 `restore_*` 不动。
5. 破坏 unit test?— `cargo test --lib` 跑;前端 `vitest`。预期不破坏(只加新功能 + 改 2 函数签名,前端有 1 调用点已知)。
6. IPC signature 变化前端同步?— 是。`import_plugin_skills`/`import_plugin_mcps` 返回 shape 变了,前端 `pluginsStore` 必须同步。本计划已包含。

## 实施顺序

1. `types.rs`:加 `PluginImportError`、`PluginImportResult`、`PluginImportCleanupResult`
2. `plugins.rs`:改 2 函数签名,提炼 `read_installed_plugin_ids` helper,加 `cleanup_orphan_plugin_imports`
3. `trash.rs`:加 `delete_trashed_item_permanently`、`empty_trash`,引用 `dirs` already in scope via `expand_path`
4. `lib.rs`:注册 3 个新 IPC
5. `cargo build` + `cargo test --lib` 确认后端绿
6. `src/types/plugin.ts`:加 PluginImport{Error,Result,CleanupResult}
7. `src/stores/pluginsStore.ts`:改 2 action 返回 + 加 cleanup 调用
8. `src/stores/trashStore.ts`:加 2 action
9. `src/components/modals/ImportSkillsModal.tsx` + `ImportMcpModal.tsx`:read result.errors 后展示
10. `src/components/modals/TrashRecoveryModal.tsx`:加 Empty Trash 按钮 + per-row trash icon + confirm overlay
11. `tsc --noEmit` + `eslint` + `vitest run` 全绿
