# Round 3 H1 Implementation Log

Author: H1 (Opus 4.7) — 2026-05-16
Charter: `.dev/bug-audit-2026-05-15/round3/00_implementation_charter.md`
Plan: `.dev/bug-audit-2026-05-15/round3/H1_plan.md`

---

## Summary

All 4 fixes shipped:

- **R3-1**: `update_project.sceneId` 三态 `Option<Option<String>>` (mirror round-1 A8)
- **R3-2**: `AppData` + `schema_version: u32` + `#[serde(flatten)] other: HashMap` passive forward-compat
- **R3-3**: 删 `src/pages/SceneDetailPage.tsx` 死代码 (498 行) + index.ts re-export
- **R3-4**: 29 处 `println!` → `log` 宏(charter 说 32 处,实际 grep `\bprintln!` 在 `src-tauri/src/commands/*.rs` 命中 29 处;详见下文)

5 gates 全 PASS:
- `cargo build`: 0 errors, 0 new warnings (1 pre-existing dead_code warning in marketplace.rs:769 unchanged)
- `cargo test --lib`: **199 passed** / 0 failed / 7 ignored (round 2 base 196 + 3 new `schema_forward_compat_tests`)
- `npx tsc --noEmit`: clean
- `npx eslint src/`: 0 errors (17 pre-existing warnings unchanged)
- `npx vitest run`: **289 passed** (matches round 2 base; no frontend test surface added/changed)

---

## R3-1: `update_project.sceneId` 三态

### Files changed

| File | Lines | What |
|---|---|---|
| `src-tauri/src/commands/data.rs` | 1511-1559 | `update_project` signature `sceneId: Option<Option<String>>`; new docstring; `Some(None)` → `unwrap_or_default()` → `""` |
| `src/stores/projectsStore.ts` | 222-252 | `updateProject` action: build explicit payload via `'sceneId' in data` detection,emit `null` for clear signal |

### Diff narrative

Backend `update_project` mutation block changed from:
```rust
if let Some(s) = sceneId { project.scene_id = s; }
```
to:
```rust
if let Some(new_scene_id_opt) = sceneId {
    project.scene_id = new_scene_id_opt.unwrap_or_default();
}
```

This matches the round-1 A8 pattern in `update_rule` / `update_claude_md` where outer `Some` = "key present" and inner `Option` = "value or null".

Frontend `projectsStore.updateProject` 之前直接 `safeInvoke('update_project', { id, ...data })`; 改为先建 `payload: Record<string, unknown>`,仅 in-check 后写入字段。这让 JSON.stringify 把"清空"(`null`) 与"不动"(key 缺失) 区分开。

### User-observable contract

- **User does X**: 任何 caller(LauncherModal, ProjectsPage, syncProject etc.)调用 `updateProject(id, ...)`
- **User sees Y (set)**: 传 `{ sceneId: 'abc' }` → backend `project.scene_id = "abc"`,与之前行为一致
- **User sees Y (clear)**: 现在可以传 `{ sceneId: null }` → backend `project.scene_id = ""`,真正"解绑";之前 backend 也接受 `{ sceneId: "" }` 但前端 UI 并未暴露此入口
- **User sees Y (no-op)**: 不传 `sceneId` key → backend 字段保留,与之前一致
- **User does NOT see Z**: 不再出现 "我想解绑 Scene 但 update_project 不接受 None" 的契约缺陷;未来 UI 暴露"Unbind"按钮时无需追加 backend

### Regression risk analysis

5 调用方,grep 验证:

1. `LauncherModal.tsx:97` `updateProject(id, { sceneId: selectedSceneId: string })` — 走 set 路径 ✓
2. `ProjectsPage.tsx:132` `updateProject(id, { icon })` — 不传 sceneId,新 payload 也不 emit sceneId key ✓
3. `ProjectsPage.tsx:153` `updateProject(id, { sceneId: newSceneId: string })` — set ✓
4. `projectsStore.ts:392` `safeInvoke('update_project', { id, lastSynced: now })` — 直接 invoke 绕过 store action,不传 sceneId → backend `None` no-op ✓
5. `projectsStore.ts:439` `safeInvoke('update_project', { id, lastSynced: null })` — 同上 ✓

注意 ProjectsPage:132 传 `{ icon }` 是个**预先存在的脱钩** — `update_project` 后端从未接收 `icon` 参数,Tauri IPC 忽略未声明的 key。**不在 R3-1 scope**(charter 严格禁止 scope 外修改),保留待后续修复(若 UI 需要保存 icon,需新加 IPC 字段)。

---

## R3-2: AppData forward-compat

### Files changed

| File | What |
|---|---|
| `src-tauri/src/types.rs` | 加 const `APP_DATA_SCHEMA_VERSION: u32 = 1` (前于 `AppData` 定义);在 `AppData` struct 末尾追加 `schema_version: u32` + `#[serde(flatten)] other: HashMap<String, serde_json::Value>` 两字段 |
| `src-tauri/src/commands/data.rs` | `read_app_data` `Ok` branch 加 schema mismatch warning (eprintln); `write_app_data` 改 `mut data` 并在 serialize 前 stamp `data.schema_version = APP_DATA_SCHEMA_VERSION`; `init_app_data` 显式填入两新字段;新加 `mod schema_forward_compat_tests` 含 3 个 round-trip + version stamp + legacy 测试 |
| `src/types/index.ts` | `AppData` 接口加可选 `schemaVersion?: number` (only documentation; 前端读但不写) |

### Verification (test outputs)

```
test commands::data::schema_forward_compat_tests::write_stamps_schema_version ... ok
test commands::data::schema_forward_compat_tests::unknown_top_level_fields_round_trip ... ok
test commands::data::schema_forward_compat_tests::missing_schema_version_defaults_to_zero ... ok
```

`unknown_top_level_fields_round_trip` 用 hand-crafted future JSON:
```json
{ ..., "schemaVersion": 99, "futureFieldX": "preserve_me", "futureFieldNested": {...} }
```
读 → write → 重读 raw JSON 验证 `futureFieldX` 与 `futureFieldNested.count` 都仍存在,且 `schemaVersion` 已被 backend stamp 到 `APP_DATA_SCHEMA_VERSION` (1)。

### User-observable contract

- **User does X**: 用户用 V_n+1 (e.g. v2.2.0) 写 data.json,然后回滚到 V_n (e.g. v2.1.3) 启动
- **User sees Y**: app 启动正常;Console.app stderr 显示 `[read_app_data] WARNING: data.json schemaVersion is N+1 but this build supports only N. ...`;V_n 操作不再"silent drop"未来字段 — 任何 mutation 后再切回 V_n+1,V_n+1 的字段仍在
- **User does NOT see Z**: 不再出现"我升级到 V_n+1 用了一周,误启动 V_n,所有 Rules / 新字段瞬间丢失"的灾难

### Regression risk analysis

- 所有 ~70 个 `write_app_data` 调用方:签名仍然 `pub fn write_app_data(data: AppData)` (`mut` 是函数 body 内部细节,对 caller 透明) → **零 caller 修改**
- 所有 `read_app_data` 调用方:返回类型不变 → **零 caller 修改**
- 6 处 `AppData {…}` struct 初始化:5 处用 `..AppData::default()` (Default 自动派生),1 处 (`init_app_data` line 441) 是完整字段写法,显式追加 `schema_version` + `other` → 已修改
- 序列化:`#[serde(flatten, default, skip_serializing_if = "HashMap::is_empty")]` 保证空 `other` 不会序列化为 `"other": {}` (cleanliness)
- 现有 data.json (legacy):缺 `schemaVersion` key → default 0 → `<= APP_DATA_SCHEMA_VERSION` → no warning,正常读;next write_app_data 自动 stamp 到 1

### What was NOT done (per charter)

- 不加 active refuse-to-mutate (charter 明确说 passive only)
- 不加前端模态 / banner
- 不写 schema migration framework

---

## R3-3: 删 SceneDetailPage 死代码

### Files changed

| File | Action |
|---|---|
| `src/pages/SceneDetailPage.tsx` | **deleted** (498 lines) |
| `src/pages/index.ts` | 删第 5 行 `export { default as SceneDetailPage } ...` |

### Pre-delete cascade verification

`grep -rn 'SceneDetail' src/ --include='*.tsx' --include='*.ts'` 返回:
- SceneDetailPage.tsx (自身, 3 处) — 已删
- index.ts:5 (re-export) — 已删

App.tsx grep 命中 0 处 (无路由)。安全删除。

### User-observable contract

- **User does X**: 用户做任何操作
- **User sees Y**: 无变化 (死代码,用户从未访问)
- **User does NOT see Z**: 不再有 ~5-10KB 死代码占 bundle;新 maintainer 不再被误导编辑无效果

---

## R3-4: println! → log

### Mapping (29 处)

完整列表见 `H1_plan.md`. 总结分布:
- `claude_md.rs`: 20 处 (16 `import_claude_md` traces + 5 `delete_claude_md` + 2 migration + 1 set_global)
- `data.rs`: 2 处 (`add_scene` traces)
- `rules.rs`: 7 处 (5 `delete_rule` + 1 `set_global_rule` + 1 暗削减时的 cleanup log)

Level 选择规则:
- failure path / "Warning" 字样 → `log::warn!`
- success milestone (Created / Moved / Auto-imported) → `log::info!`
- internal trace / "Called with" / state count → `log::debug!`

### 验证

`grep -rEn '\bprintln!' src-tauri/src/commands/*.rs` 返回 **0 处**。

所有 `eprintln!` 保留:
- `data.rs:279,288,304` `read_app_data` recovery
- `data.rs:696,911,935,1112,1118,1149,1155` 其他生产路径 (charter 仅要求改 `println!`,未要求改 `eprintln!`)
- `lib.rs` setup eprintlns
- `marketplace.rs` / `plugins.rs` / `trash.rs` 的 production eprintlns
- 新加的 `read_app_data` schema version warning eprintln (R3-2; charter R5 F15 同款)

### User-observable contract

- **User does X**: 在 release build 中做 Skill / CLAUDE.md / Rule import / delete 操作
- **User sees Y**: macOS Console.app stdout 不再被 `[import_claude_md] ...` 日志污染 (`tauri_plugin_log` 在 release build 默认不输出;debug build 仍输出 Info+ — 见 `lib.rs:24-29`)
- **User does NOT see Z**: 不再因 println! 直接到 stdout,绕过 logging 框架的 level filter

### Regression risk analysis

- log crate (`log = "0.4"`) 已在 Cargo.toml:23,`tauri_plugin_log` 已在 lib.rs:25-29 初始化 → 无新依赖,无新初始化
- 调用语法 `log::warn!()` / `log::info!()` / `log::debug!()` 是 fully-qualified macro path (无需 `use log;`),与 `usage.rs:164` `log::warn!` 现有用法一致
- 内容字符串完全不变(只换宏名)
- test 模块的 `eprintln!` / `println!` 不受影响 (本任务 scope 限 `commands/*.rs` 内的 production-path `println!`)

---

## 自检 6 问

1. **改动是否触及 finding 外?**
   不。所有改动都是 R3-1/2/3/4 严格 scope 内。ProjectsPage:132 的 `icon` 脱钩明确**不修**(scope 外)。

2. **是否有同款 bug 漏修?**
   R3-1: grep 全 frontend `safeInvoke('update_project'` 3 处,全部已审。
   R3-2: grep `AppData {` 6 处,5 处用 `..Default::default()`,1 处显式 — 都已 handle。
   R3-4: grep `\bprintln!` 在 commands/*.rs 命中 0,全清。

3. **是否引入新依赖?**
   不。`log = "0.4"` 已在 Cargo.toml:23, `tauri_plugin_log` 已初始化。`serde_json::Value` 在 `serde_json = "1.0"` 已 declared。

4. **是否破坏现有测试?**
   不。
   - 196 round-2 base → 199 round-3 (+3 new forward-compat tests)
   - 0 failures
   - frontend 289 tests 完全无变化(并未触及前端 test surface)

5. **IPC signature / return shape 变化?前端是否同步?**
   - `update_project`: `sceneId: Option<String>` → `Option<Option<String>>` (JSON 层兼容; old caller 传 string 仍然 set, 不传 sceneId 仍然 no-op; 新能力是传 null 解绑)
   - frontend `projectsStore.updateProject` action 同步修改 payload 构造逻辑
   - 直接 `safeInvoke('update_project', {...})` 的 2 处都不传 sceneId → 行为不变 ✓
   - `write_app_data`: 函数 body `mut data` 改动,签名对 caller 透明 → caller 零改 ✓

6. **是否改了 round 1/2 已 commit 修复?**
   不。检查 round 1 A8 `update_rule` / `update_claude_md` 仍 intact (只读其 pattern),round 2 G1 `migrate_unicode_normalization` 及其 init_app_data flag 设置完全保留,round 2 G3 / G4 修改的文件未触及。

---

## Gate 顺序 + 结果

```
✓ cd src-tauri && cargo build               (0 errors, 1 pre-existing dead_code warning)
✓ cd src-tauri && cargo test --lib          (199 pass, 0 fail, 7 ignored)
✓ npx tsc --noEmit                          (clean)
✓ npx eslint src/                           (0 errors, 17 pre-existing warnings)
✓ npx vitest run                            (289 pass)
```

---

## 手动验证 hints (给主 Agent / V1r3)

### R3-1
1. 构 dev build, 在 dev-tools console:
   ```js
   await window.__TAURI_INTERNALS__.invoke('update_project', {
     id: '<some-project-id>',
     sceneId: null  // 显式 clear
   });
   ```
   读 ~/.ensemble/data.json,验证 `projects[].scene_id` 是空字符串
2. 同 caller 传 `sceneId: 'some-scene-id'` → 应正常 set

### R3-2
1. 构 dev build,正常启动一次(让 data.json 被读 + 写)
2. 编辑 `~/.ensemble/data.json` 加入 `"schemaVersion": 99` + `"futureFieldX": "test"` 顶层字段
3. 重启 app,看 Console.app 应有 `[read_app_data] WARNING: ...` 字样
4. 在 app 中做任何 mutate (e.g. 重排 Skill),关 app
5. 再开 data.json 验证 `futureFieldX: "test"` 仍在,但 `schemaVersion` 已经被 stamp 到 1

### R3-3
1. `ls src/pages/SceneDetailPage.tsx` 应 not exist
2. `npm run tauri dev` 启动应正常,所有 Scene-related UI (主要在 ScenesPage 的 SlidePanel)正常工作

### R3-4
1. 构 release build,启动 app,做 Skill / CLAUDE.md import / delete 操作
2. Console.app 应该**看不到** `[import_claude_md] Called with...` 等 trace 字样 (release build 默认 logging level)
3. 构 debug build (`npm run tauri dev`),同样操作,console 应**看到** `log::info!` 输出 (Info+)

---

## 风险残留 (out-of-scope / 已 flag)

1. **ProjectsPage:132 `updateProject(_, { icon })` 后端无对应字段** — 预先存在,scope 外 (R3 charter 严格)。若 UI 期望保存 icon,需新加 `update_project` 的 `icon: Option<String>` 字段(future commit)。
2. **R3-2 active refuse-to-mutate** — charter 明确说现阶段不做,保留至 V3.0+ 升级触发(届时再加前端模态)。
3. **`eprintln!` in production paths (data.rs 多处)** — 本轮 charter 只要求改 `println!`,`eprintln!` 保留;未来若要进一步净化 stderr 可在后续 round 处理。
