# G2 Log — Plugin + Trash 长期清理 (Round 2)

## Scope: R2-6, R2-9, R2-10

## Files Touched

### Backend
- `src-tauri/src/types.rs`:加 3 个新结构体 — `PluginImportError`、`PluginImportResult`、`PluginImportCleanupResult`
- `src-tauri/src/commands/plugins.rs`:
  - 改 `import_plugin_skills` 返回 `Result<PluginImportResult, String>`(R2-6)
  - 改 `import_plugin_mcps` 返回 `Result<PluginImportResult, String>`(R2-6)
  - 加 `read_installed_plugin_ids` helper(共享 detect / cleanup)
  - 加 `cleanup_orphan_plugin_imports` IPC(R2-10)
- `src-tauri/src/commands/trash.rs`:
  - 加 `parse_trash_kind` + `TrashKind` enum
  - 加 `delete_trashed_item_permanently` IPC(R2-9)
  - 加 `empty_trash` IPC(R2-9)
  - 加 2 测试覆盖 `parse_trash_kind`(positive + typo rejection)
- `src-tauri/src/lib.rs`:注册 3 个新 IPC(`cleanup_orphan_plugin_imports`、`delete_trashed_item_permanently`、`empty_trash`)

### Frontend
- `src/types/plugin.ts`:加 `PluginImportError`、`PluginImportResult`、`PluginImportCleanupResult` TS types
- `src/stores/pluginsStore.ts`:
  - `importPluginSkills` / `importPluginMcps` 返回类型从 `Promise<string[]>` 改为 `Promise<PluginImportResult>`(R2-6)
  - `detectPluginSkillsForImport` / `detectPluginMcpsForImport` 开头先调 `cleanup_orphan_plugin_imports`(R2-10)
- `src/stores/trashStore.ts`:
  - 加 `TrashKind` export
  - 加 `isPermanentlyDeleting` state
  - 加 `deleteTrashedItemPermanently` action
  - 加 `emptyTrash` action
- `src/components/modals/ImportSkillsModal.tsx`:
  - `handleImportPluginSkills` 改为读 `result.errors`,非空时显示红色 banner 并保留 modal 开
  - 新增 `pluginImportErrors` state + banner JSX(absolute-positioned over plugin tab body)
- `src/components/modals/ImportMcpModal.tsx`:同上 mirror
- `src/components/modals/TrashRecoveryModal.tsx`:
  - Header 加 "Empty Trash" 按钮(仅 `totalCount > 0` 显示)
  - `renderRow` 新增 6 列 `pathOrId` 参数 + per-row trash icon(hover-revealed Trash2)
  - 新增 confirm overlay(absolute, 内嵌不引入新 portal,守 design-language "≤3 layers")
  - 新增 emptyTrashSummary 状态 + success banner(zinc tokens 区分于错误红 banner)
  - ESC 改为先关 confirm 再关 modal

## Gate Results

| Gate | Result |
|---|---|
| `cargo build` | 0 errors, 4 warnings(全为 G3 mcps.rs 中无关 dead-code 警告) |
| `cargo test --lib`(non-ignored) | **196 passed, 0 failed, 7 ignored** ✓ |
| `cargo test --lib -- --include-ignored` | 202 passed, **1 failed**(`live_codeload_install` — live network test,与 G2 改动无关,marketplace.rs 未被 G2 触碰) |
| `tsc --noEmit` | 0 errors ✓ |
| `eslint src/` | 0 errors, 17 warnings(全为 pre-existing,无 G2 引入新警告) |
| `vitest run` | **289 passed, 0 failed** ✓ |

## Self-Check 6 Q

1. **触及 finding 外代码?** — 是,但全部由 finding 直接驱动:
   - `types.rs` 加 3 个结构体:`PluginImportError`/`PluginImportResult` 是 R2-6 IPC contract 必需;`PluginImportCleanupResult` 是 R2-10 IPC 必需
   - `lib.rs` 注册 3 个新 IPC:R2-9/R2-10 都需要新 IPC,故必加
   - 前端 modals(`ImportSkillsModal`/`ImportMcpModal`):R2-6 改 IPC return shape,前端必须同步,否则部分失败仍 invisible
2. **同款 bug 别处?** — grep 验证(见 plan 末尾):`write_app_data`/`read_app_data` 195 处 callsite 均未受影响(G2 只新增,未改任何已存在的 callsite);所有 `imported_plugin_skills`/`imported_plugin_mcps` 读写路径仍正常。`eprintln!` 在其他模块(marketplace.rs 等)也有,但 scope 外,本轮不动。
3. **新依赖?** — 无。`Trash2` icon 已存于 `lucide-react` 安装包(`X`、`Wand2` 等同包)。
4. **改 round 1 代码?** — 没有改任何 round 1 已 commit 的代码;`trash.rs::restore_*` 未动;`plugins.rs::detect_*` 未动(只在 detect 的 callsite 前增加一个 cleanup 调用)。
5. **破坏 unit test?** — 否:
   - Backend:196 passed(baseline 185 + 2 我新加 + 9 来自 G1/G3 的 unicode/mcp 等改动)
   - Frontend:289 passed(round 1 baseline 283 + 其他 Agent 加)
6. **IPC signature 变化前端同步?** — 是,**关键**:
   - `import_plugin_skills` / `import_plugin_mcps` 的 return shape `Vec<String>` → `PluginImportResult { imported, errors }`
   - 前端 `pluginsStore.ts` 的两个 action 已同步;callsite `ImportSkillsModal::handleImportPluginSkills` + `ImportMcpModal::handleImportPluginMcps` 已同步
   - 新加 3 个 IPC(`cleanup_orphan_plugin_imports`、`delete_trashed_item_permanently`、`empty_trash`)— 都已在 lib.rs 注册 + 前端 store 已加 action

## 回归风险分析

| 邻近功能 | 风险 | 验证 |
|---|---|---|
| Skills 页面 import-from-plugins 流程 | result 形状变化破坏 import | 通过:前端 store + 2 modals 已同步;手动验证:`tsc --noEmit` 0 errors 证明类型兼容 |
| MCPs 页面 import-from-plugins 流程 | 同上 | 同上 |
| Trash recovery — restore Skill/MCP/CLAUDE.md/Rule/Scene/Project | 6 row callsite 全部新增 `pathOrId` 参数 | 通过:已逐一修改 6 处 callsite + tsc 通过 |
| Trash recovery — 现有 restore 流程 | 新增 confirm overlay 干扰 hover/click | 不会:overlay 仅 `confirmRequest !== null` 时显示;`stopPropagation` 在 trash icon button 防止行级 toggle 误触发 |
| `read_app_data` 195 处 callsite | 新加 `DATA_MUTEX` 持锁可能竞争 | 不会:`cleanup_orphan_plugin_imports`/`empty_trash`/`delete_trashed_item_permanently` 各自独立持锁,与现有 callsite 一致 |
| `~/.ensemble/trash/` 用户旧数据 | `empty_trash` 误删 trash 外文件 | 已防御:`delete_trashed_item_permanently` 拒绝 path 不含 `/trash/`;`empty_trash` 只 walk `trash/skills,mcps,claude-md,rules/` |
| `imported_plugin_skills` malformed entries(老数据) | retain 误删 | 已防御:无 `|` 分隔的 entry retain(`split_once` 返回 `None`); only `installed.is_empty()` 时整体 skip,避免 I/O 失败导致全量清除 |

## 手动验证步骤(主 Agent 用)

### R2-6 — 部分失败可见性
1. Dev 启动 `npm run tauri dev`,点 Skills 页面 → Import Plugins
2. 在某个 plugin 的 source 路径 `~/.claude/plugins/cache/<marketplace>/<plugin>/skills/<name>/` 临时 `mv` 走某个 skill 目录(模拟 source 失踪)
3. 在 Import Skills Modal "Plugin" tab 勾选 5 个含被 mv 走的那个
4. 点 "Import Selected"
5. **预期**: modal **不**关闭,顶部红 banner 显示 "Failed to import N skill(s)" + 每条详细错(如 "Source path does not exist")
6. 成功的 row 会从 unimported 列表消失;失败的 row 留下供用户重试或忽略

### R2-9 — Empty Trash + per-row 永久删除
1. 删几个 Skill / MCP / CLAUDE.md / Rule(走 Trash)
2. 打开 Settings → Recover Deleted Items modal
3. **per-row 测试**: hover 某行,看到右侧 trash icon(`Trash2`);点击 → confirm dialog 居中显示 "Permanently delete '<name>'?" → 点 "Delete Permanently" → 行从列表消失
4. **Empty Trash 测试**: 点 header 右侧红色 "Empty Trash" 按钮 → confirm dialog 显示 "Empty Trash? This will permanently delete all N items in trash" → 点 Delete → 所有 tab 显示 empty state,顶部灰色 banner "Trash emptied"
5. **ESC 行为**: confirm dialog 打开时按 ESC → 只关 confirm,modal 保持打开 + 选择保持

### R2-10 — Plugin orphan cleanup
1. 装某 plugin(含 1 个 skill),在 Ensemble 中 import 它
2. 通过 Claude Code 卸载该 plugin(plugin 从 `~/.claude/plugins/cache/<marketplace>/<plugin>/` 消失)
3. 在 Ensemble 重打 Import from Plugins modal
4. **预期**: 不显示该 plugin 任何 skill(detect 看不到);若用户再装回 plugin → detect 列表中那些 skill 行恢复"可选"状态(不是 disabled "Already imported")
5. 验证:`~/.ensemble/data.json` 中 `imported_plugin_skills` 不再含已卸载 plugin 的 marker(grep 卸载 plugin id 应该 0 hits)

## User-Observable Success — Recap

### R2-6
- User does: 在 Import Plugin Skills 选 5 条,2 条因 source 失踪等 fail
- User sees: modal 顶部红 banner "Failed to import 2 skills: ..." + 成功的 3 条仍 import 完
- User does NOT see: "全部成功"但 SkillsPage 少 2 条的静默部分失败

### R2-9 — Empty Trash
- User does: TrashRecoveryModal 点 "Empty Trash"
- User sees: 同一 modal 中央 confirm "Permanently delete N items? This cannot be undone." → 确认 → 全空 + 灰色 "Trash emptied" toast
- User does NOT see: 直接清空无 confirm

### R2-9 — per-row
- User does: hover trash row,点行右 trash icon
- User sees: confirm "Permanently delete '<name>'? ..." → 该行从列表移除
- User does NOT see: 单击立即删除 / 删后又出现

### R2-10
- User does: Claude Code 卸载某 plugin → 再开 Import Plugin Skills modal
- User sees: 该 plugin skill 不显示;若重装 plugin → 可重新 import
- User does NOT see: "Already imported" + broken symlink 的死循环

## 与 round 1 / G1 / G3 / G4 并行 Agent 的边界

- G1 改 `data.rs::migrate_unicode_normalization` + `lib.rs` setup 加 normalization 调用 —— **不冲突**:G2 触碰的 `lib.rs` 是 `tauri::generate_handler![]` 列表,与 setup 无重叠
- G3 改 `mcps.rs::fetch_mcp_tools`(可能加 stderr capture)+ `import.rs::launch_claude_for_folder` —— **不冲突**:G2 未触碰这两个文件
- G4 改前端 Enter 键 IME composition + 部分 sync_project 失败 UI —— **不冲突**:G2 未触碰这两个表面

## 关键 Design-Language 合规

- `Trash2` icon = lucide-react functional icon ✓
- 红色 destructive = `bg-[#FEE2E2]` text `text-[#DC2626]` = pre-existing tokens in TrashRecoveryModal ✓
- 灰色 success = `bg-[#F4F4F5]` text `text-[#52525B]` = pre-existing zinc tokens ✓
- Confirm overlay 用 `bg-black/40` backdrop + `rounded-[12px]` + `shadow-[0_25px_50px_rgba(0,0,0,0.1)]` = consistent with modal-only shadow tier in design-language.md ✓
- Visual hierarchy ≤ 3 layers ✓:overlay 内嵌在 TrashRecoveryModal 同一 portal,不 nested portal
- ESC 优先关 confirm 而非 modal = macOS-native sheet behaviour ✓
