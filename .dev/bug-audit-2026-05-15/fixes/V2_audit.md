# V2 — 完整性 + 回归风险 Audit Report

**Auditor**: V2 (Opus 4.7 SubAgent)
**Date**: 2026-05-15
**Scope**: F1 / F2 / F3 / F4a / F4b — 15 个 finding 的覆盖完整性 + 跨修复回归风险
**Out of scope** (V1 干这部分): 代码层正确性、逐行 Rust/TS 审查

## TL;DR

- **整体判断**: **CONDITIONAL GO**
- **BLOCKING 必修 (1 条)**: B-5 — F2 restore_scene / restore_project 没让 SettingsPage.handleRestoreComplete 重载 `scenesStore` / `projectsStore` / `rulesStore`,用户恢复 Scene 后看不到结果(需关闭页面再打开)
- **NON-BLOCKING 但 backlog (15 条)**: 详见 §C 总结
- **整体结论**: 15 条 finding 修复**主体正确,核心 case 都覆盖**,但 **F2 A5 的前端 reload 链路漏了**,会让 P1 finding 在用户视角"看着没生效"。再就是有 3 块 **WIP 改动被意外打包**(scope refactor / codeload-install-fix / sort-with-usageStats),它们独立合理但增加了本次 PR 审查面

---

## A. 完整性审查(逐条 finding × 3 子问)

### A1 — clear_project_config 用户文件保护(F1)

**同类 bug 漏修了吗**:
- `unset_global_claude_md` / `set_global_claude_md` (claude_md.rs) 写 `~/.claude/CLAUDE.md` 时**不**走 content-match 删除—— 但它们是显式 IPC,用户主动调用,语义不同(用户主动 unset 就是要清空)。**NO miss**。
- `write_mcp_config` 同模块的**非**空-list 分支(line 137-194 大致路径)未变,仍然是"覆写"语义。**正确**——非空分支是 sync 时的"Ensemble 写 Ensemble 的 MCP",不是 cleanup。
- `marketplace.rs` 的 Replace / Trash 流程会走 trash 而非删除,与 A1 无关。

**callsite 全覆盖了吗**:
- `clear_project_config`: 改了 ✓
- `write_mcp_config` 空-list 分支: 改了 ✓
- `sync_project_config` 调用 `write_mcp_config` —— 通过 helper 自动受益 ✓

**依赖修复完整吗**:
- F1 改 `clear_project_config` 时,把 DATA_MUTEX 扩展到包住既有 rule cleanup block (R1 F2 territory)。这是个无意中的副作用改进,**不算 scope creep**(无 line 改动),F1 plan 已说明。

### A2 — AppleScript 注入(F3)

**同类 bug 漏修了吗**:
- **YES, 一处**: Warp 的 New Window 模式(`import.rs:1551-1552`)依然用 `replace('"', "\\\"")` 来 escape `folder_path_str` 和 `claude_command`,**写进 YAML 文件**。`\n`、`\\`、tab 等 YAML metacharacter 没 escape。这是 Master findings 列为 **R4 D2(降级 P2)** 的 issue,V2 仅在此处 flag。
- Ghostty / Alacritty 已经正确(F3 已 verify)。

**callsite 全覆盖了吗**:
- iTerm + Terminal.app 两处都改了 ✓
- 验证 grep `escaped_path = folder_path_str` 返回 0 hits ✓

**依赖修复完整吗**:
- `folder_launch_command` 已经在 Ghostty 路径用过——复用 ✓
- `applescript_quote` 已经存在——复用 ✓

### A3 — Trash UI restore metadata 恢复(F2)

**同类 bug 漏修了吗**:
- `restore_claude_md` / `restore_rule` 不读 metadata snapshot,因为它们的 metadata 直接在 `data.json::claude_md_files / rules`,不像 skill/mcp 是独立 file。**结构性差异,无 miss**。
- `marketplace.rs::finalize_skill_install` 的 Replace 路径已经独立处理 snapshot 消费(line 3006)。**无冲突**。

**callsite 全覆盖了吗**:
- `consume_skill_metadata_snapshot` 在 marketplace.rs 和 trash.rs 都用 ✓
- `consume_mcp_metadata_snapshot` 同 ✓
- `pub(crate)` visibility 改动正确,只暴露给同 crate ✓

**依赖修复完整吗**:
- MCP sibling snapshot rename (`<file>.json.metadata.json`)正确 ✓
- `sanitize_*_against_data` 过滤 dangling category / tag,在 R5 F5 reference-validity 上正确 ✓
- **但**: 恢复成功后**没 trigger `loadSkills` / `loadMcps`**——这跟 A5 的 B-5 是**相同**问题,但 SettingsPage.handleRestoreComplete 至少**有**调用 `loadSkills / loadMcps`,所以这部分 OK ✓(对比 Scenes / Projects 完全 missing)

### A4 — Rules tab in TrashRecoveryModal(F2)

**同类 bug 漏修了吗**:
- 后端 `list_trashed_items` 已经返回 rules,无需后端改动 ✓
- 唯一前端 consumer 是 TrashRecoveryModal ✓

**callsite 全覆盖了吗**:
- trashStore 加 `restoreRule` ✓
- TrashRecoveryModal 加 'rules' tab ✓

**依赖修复完整吗**:
- **YES MISS**: SettingsPage.handleRestoreComplete (line 281-285) 只 reload `loadSkills / loadMcps / loadClaudeMdFiles`,**漏 `loadRules`**。Rule 恢复后用户不开 Rules 页就不会触发 loadRules,看着像"没恢复"。已存在的 issue,不是 F2 新增,但 F2 加 restoreRule 把这个潜在 issue 放大了一倍。

### A5 — Scene / Project Trash full restore(F2)

**同类 bug 漏修了吗**:
- 后端: `delete_scene` / `delete_project` 已经写 `trashed_scenes / trashed_projects`,F2 加了 reader (`list_trashed_items` 扩展 + `restore_scene` / `restore_project`)。完整 ✓
- 是否还有别的实体 trash 路径没暴露?**NO**——五种实体(skill / mcp / claude_md / rule / scene / project)全覆盖。

**callsite 全覆盖了吗**:
- 后端 `restore_scene` / `restore_project` IPC: 注册了 ✓ (lib.rs:184-185)
- 前端 `trashStore.restoreScene / restoreProject`: 加了 ✓
- TrashRecoveryModal Scenes / Projects tab: 加了 ✓

**依赖修复完整吗**:
- **❌ BLOCKING — B-5**: `SettingsPage.handleRestoreComplete` (line 281-285) **漏 reload `scenesStore` / `projectsStore`**:
  ```ts
  const handleRestoreComplete = useCallback(async () => {
    await Promise.all([loadSkills(), loadMcps(), loadClaudeMdFiles()]);
  }, [loadSkills, loadMcps, loadClaudeMdFiles]);
  ```
  用户恢复 Scene → modal 关闭 → 打开 ScenesPage → Scene 不在 → 困惑。这是**P0 用户可见 regression**——A5 finding 本身就是 P1(Scenes 不能恢复),修了一半就掉这里。
- 推荐 fix: 把上面那行改成 `await Promise.all([loadSkills(), loadMcps(), loadClaudeMdFiles(), loadRules(), loadScenes(), loadProjects()])`,顺手把 A4 的 `loadRules` 也补上。

### A6 — delete_category / delete_tag cascade Rules(F4a)

**同类 bug 漏修了吗**:
- **YES, 一处**: `data.rs::reset_auto_classify_data` (line 1011-1035) 清 categories + tags + 清 skill/mcp/claude_md 的 category_id / tag_ids,**漏 rules**。F4a 在 log 里**显式承认**"reset_auto_classify_data 是同款 bug 但 out of scope"——技术上正确但**用户视角**就是:Auto Classify reset 之后 Rules 还挂着死引用。这是**同款 logical bug**。
- 推荐 backlog: 把同样 4 行加到 reset_auto_classify_data:
  ```rust
  for rule in data.rules.iter_mut() {
      rule.category_id = None;
      rule.tag_ids.clear();
  }
  ```
- TrashedRule 没有 category_id / tag_ids field——F4a verify 过,无 cascade 需求 ✓

**callsite 全覆盖了吗**:
- `delete_category`: 改了 ✓
- `delete_tag`: 改了 ✓

**依赖修复完整吗**:
- 完整 ✓ —— 不需要 frontend 改动,store 自动 re-load 时拿到 cleared category_id

### A7 — importMcps 路径推导(F4b)

**同类 bug 漏修了吗**:
- grep `skillSourceDir.replace('/skills', '')`: 还有 3 处(backupBeforeImport line 131, importConfig line 157, importSkills line 336)——前两个是双类型联合操作不能改,后一个是 importSkills 正确。**F4b verify 完整 ✓**。

**callsite 全覆盖了吗**:
- 只有 importMcps 这一处 ✓

**依赖修复完整吗**:
- backend `import.rs:537` 不变(`mcps_dest = ensemble_dir/mcps`),前端 strip 对齐 ✓

### A8 — update_rule / update_claude_md tri-state categoryId(F4a)

**同类 bug 漏修了吗**:
- `update_skill_metadata` / `update_mcp_metadata` 已经是 tri-state 了——这是 F4a 的参照实现 ✓
- 是否有别的"setter 字段语义混淆 None"?Grep `Option<Option<` 在 commands/*.rs:全部都对(skills / mcps / rules / claude_md)✓

**callsite 全覆盖了吗**:
- `rulesStore.updateRule` 和 `claudeMdStore.updateFile`: 改了 ✓
- 直接 `safeInvoke('update_rule')` 的 auto-classify path(rulesStore:490, claudeMdStore:509)在 F4a log 里 verify 过:`categoryId: string | undefined` 在 JSON.stringify 时,undefined 被 drop → backend 外层 None → no-op。**与之前行为一致** ✓
- detail panel callers 都通过 store action 走 ✓

**依赖修复完整吗**:
- Tauri serde `Option<Option<String>>` 反序列化语义:JSON 缺 key → outer None;JSON null → Some(None);JSON 字符串 → Some(Some(s))。已 verify ✓

### A9 — addCategory / addTag / addScene 重名校验(F4b)

**同类 bug 漏修了吗**:
- `scenesStore.createScene` (line 188) 是另一个 `add_scene` 调用 path,**不**带 dedup guard。但 grep 显示**没人**调它(死代码)。**Low priority**。
- `classifyHelpers.ts` 的 `addCategory` / `addTag` 调用是 auto-classify,但它已经做了 `existingTagNames.has` 过滤——**已经 idempotent** ✓
- Backend `add_category` / `add_tag` / `add_scene` 本身**没**校验,frontend 拦截即可——符合 charter 的"前端拦住"原则。

**callsite 全覆盖了吗**:
- `MainLayout.handleCategorySave` / `handleTagSave` ✓
- `ScenesPage.handleCreateScene` / `handleUpdateScene` ✓
- Edge case: 加 child category 路径目前 UI 不存在(F4b plan 已说明),add 模式 parent scope 是 root——正确,future-proof 也可以(只要未来添加 add-child UI 时同步 dedup 逻辑)。

**依赖修复完整吗**:
- `appStore.setError` / `clearError` 新加 ✓
- 错误通过 A10 全局 banner 显示 ✓
- Modal 在 dedup 失败时**不关闭**,允许用户改名(F4b 在 ScenesPage 已实现)✓

### A10 — appStore.error 全局 banner(F4b)

**同类 bug 漏修了吗**:
- SkillsPage / McpServersPage / RulesPage 各有自己的 page-level error banner(读各自 store.error),与 appStore.error **独立**。共存不冲突 ✓
- A10 的 banner 用 design-language token(`var(--color-error)` / `var(--color-error-bg)`),与既有 `bg-red-50 text-red-700` page banner **视觉风格略不一致**——F4b log 已 flag 为 backlog。

**callsite 全覆盖了吗**:
- 唯一新 consumer 是 MainLayout(把 sidebar reorder / hierarchy / dedup 失败都路由到这)✓

**依赖修复完整吗**:
- `prefers-reduced-motion` 不需扩展(无 transition)✓
- `role="alert"` for a11y ✓

### A11 — SlidePanel 删除选中项不关闭(F4b)

**同类 bug 漏修了吗**:
- CategoryPage / TagPage 用的是 `SkillDetailPanel` / `McpDetailPanel` **独立组件**,有自己的 panel close 逻辑(R7 F7-1 提到双实现)。F4b plan 显式排除 ✓
- 是否有别的 "selected\*Id 单独于 store state" 的 page?Grep:`useState<.*Id>` in src/pages/——只有 SkillsPage / McpServersPage。**完整** ✓

**callsite 全覆盖了吗**:
- SkillsPage handleDelete + SlidePanel isOpen swap ✓
- McpServersPage 同 ✓
- 双层保险设计(handleDelete 同步 reset + isOpen 数据驱动 fallback)合理 ✓

**依赖修复完整吗**:
- `mr-[800px]` 主区 margin 仍 keyed on `selectedSkillId`——但 handleDelete reset 是同步 batch,所以 margin 同帧关 ✓
- `auto-fetch tools effect` deps 已经包含 selectedMcp + selectedMcpId,新的 isOpen swap 不影响其行为 ✓

### B1 — atomic write + backup + recovery(F1)

**同类 bug 漏修了吗**:
- **YES, 一处**: `write_settings` (data.rs:372) 也写关键 config (`settings.json`),用非原子 `fs::write`,无 backup。settings.json 损坏会丢用户偏好(mcp_source_dir / claudeConfigDir / theme / terminal preference)——不致命但 P2。**F1 plan 显式只 scope 到 data.json**,合理(用户报告只针对 data.json),但同款 logical bug 在 settings.json 上仍存在。
- Defense-in-depth grep `fs::write` 直接绕过 `write_app_data` 的路径:已经在 F1 grep 里查了——无非法 callsite ✓

**callsite 全覆盖了吗**:
- `read_app_data` / `write_app_data` 签名不变,所有 ~70 callsite 自动受益 ✓
- `read_app_data` 的 caller 之前期望"failure = Err",现在新增"parse failure → fallback 到 .bak 或 default + Ok"——**行为变化**!对于"宁可白屏不要旧数据"的 caller 是 regression,但项目内不存在这种 caller(全部都是 `read_app_data()?` 然后用 data ——遇到 default 不会崩,只是看到空状态)。✓

**依赖修复完整吗**:
- 测试隔离 `ENSEMBLE_DATA_DIR` + `cfg(test)` panic 仍生效——F1 没动 `get_app_data_dir` ✓
- `.bak` 文件用户在 Finder 可见,无文档化——`hardconstraints` rule 没硬要求,但 UX 上需要 README 一行 ✓

### B4 — install_marketplace_skill sanitize owner/repo(F3)

**同类 bug 漏修了吗**:
- 3 个 sibling callsite (`get_marketplace_repo_stars` 1893, `fetch_skill_summary_github` 2005, `fetch_mcp_readme_github` 2100)已经 sanitize ✓
- `finalize_skill_install` 的二次 `derive_install_triple` 用 raw values——但 install_marketplace_skill 已经在到这里之前 sanitize 失败时 return Failed,所以到达这里的 owner/repo 已经是 sanitize-clean string(`sanitize_resource_name` 不修改字符,只 verify)。**无 regression** ✓
- `install_marketplace_mcp` 不调用 codeload,不构造类似 URL ✓

**callsite 全覆盖了吗**:
- `install_skill_via_codeload` 的 URL construction 是唯一 attack surface ✓

**依赖修复完整吗**:
- `sanitize_resource_name` 已存在,直接复用 ✓
- `skill_path` 不 sanitize(legitimate `/`),由 tar 解压层验证(line 2710-2726)已存在 ✓

### B5 — envelope_to_item allowlist + derive_stdio_command fallback(F3)

**同类 bug 漏修了吗**:
- `derive_stdio_command` 只有一个 caller (line 1426),前面就是 allowlist gate ✓
- 是否有其他 "upstream provided string → spawn binary" 路径?Grep `Command::new(.*identifier|TokioCommand::new(.*identifier)` —— **0 hits**。MCP fetch 路径用 stored config 的 command(配置文件已经 sanitize-via-allowlist),不是 envelope identifier 直接 spawn ✓

**callsite 全覆盖了吗**:
- 一处 envelope_to_item + 一处 fallback 收紧 ✓ (defense-in-depth)

**依赖修复完整吗**:
- MCP Registry 当前所有 entry 的 `registryType`:文档 line 705 说"every package carries `registryType` (npm / pypi / oci)"——allowlist 与文档一致 ✓ ; 但 V2 没法自己跑实测 verify;**信任 F3 已 verify 当前 catalog 全在 allowlist 内**。建议主 Agent ship build 后实测一次:`MCP servers` 页面与之前列表对比,确认没条目消失。

### B7 — `.claude/` scan exception(F1)

**同类 bug 漏修了吗**:
- `rules.rs:351` 同款 `.claude` exception 已经有——F1 plan 显式 mirror ✓
- 其他扫描函数(`scan_skills` / `scan_mcps`)默认 `.starts_with('.')` excl 是合理的,不需要扫 `.claude` ✓

**callsite 全覆盖了吗**:
- 唯一处 `is_excluded_dir` 在 claude_md.rs 中,改了 ✓

**依赖修复完整吗**:
- `infer_claude_md_type` (line 402+) 已经能识别 `.claude/CLAUDE.md` 为 Project 类型 ✓

---

## B. 回归风险审查

### B1 数据保护 / F1(B1, A1, B7)

- **B-10 (data.json.tmp lingering)**: 失败 write 留下 `data.json.tmp`。下次 write 覆盖 → 不累积。Finder 中可见 ≠ 问题。NON-BLOCKING。
- **B-12 (silent recovery)**: read_app_data parse 失败时 _parse_err 被 silently swallow,无 eprintln,无 UI 提示。 用户突然丢失 categories 时无任何 debug breadcrumb。**强烈建议加 1 行 `eprintln!("[read_app_data] parse failure: {}", _parse_err);`** —— 一行改动,极大降低未来支持成本。NON-BLOCKING but cheap fix。
- **B-4 (CLAUDE.md content-match)**: 用户编辑过的项目 CLAUDE.md 与 managed bytes 不匹配 → 保留(安全侧选错)。Distribute 时再覆盖。F1 plan Q2 已显式选择此 trade-off。NON-BLOCKING — conscious design。
- **B-6 (.mcp.json non-atomic write)**: trim_managed_mcps_in_file 用 `fs::write`(不 atomic)。SIGKILL 中途可能截断用户 `.mcp.json`。低概率,与之前调用频次一致。NON-BLOCKING。
- **B-7 (.mcp.json 重写丢评论)**: JSON 没评论 → no-op。NON-BLOCKING。
- **B-11 (read_app_data recovery + 同一 launch 的 restore_scene)**: 极低概率(同一 launch 内 data.json 损坏 + .bak missing trashed_scenes entry)。NON-BLOCKING。

### B2 Trash 子系统 / F2(A3, A4, A5)

- **❌ BLOCKING — B-5**: SettingsPage.handleRestoreComplete 没 reload rulesStore / scenesStore / projectsStore。Rule / Scene / Project 恢复后 UI 不显示。修复方案:
  ```ts
  const handleRestoreComplete = useCallback(async () => {
    await Promise.all([
      loadSkills(),
      loadMcps(),
      loadClaudeMdFiles(),
      loadRules(),       // NEW for A4
      loadScenes(),      // NEW for A5
      loadProjects(),    // NEW for A5
    ]);
  }, [loadSkills, loadMcps, loadClaudeMdFiles, loadRules, loadScenes, loadProjects]);
  ```
  注:Rules tab 的 reload 漏掉算 A4 残留,不算 F2 新增(restore_rule 本来就没 reload),但 F2 加 Rules tab 把"看不见"放大成"频繁看不见"。**必修**。
- **B (list_trashed_items 加 DATA_MUTEX)**: 锁范围紧——只 wrap `data.clone()`,不 wrap fs scan。**正确**。锁开销 = 一次 acquire/release,无 contention 风险。
- **B (TrashedItems 增 scenes/projects 字段)**: 都 `#[serde(default)]`,旧 data.json 读 OK ✓ 旧 frontend 读新 backend payload —— ignore unknown fields (TypeScript loose) ✓
- **B (restore_skill / restore_mcp DATA_MUTEX hygiene)**: lock acquired after `fs::rename`,scoped to read/write,与 marketplace finalize 一致。**安全**。无 double-lock 风险(consume_*_snapshot 不 lock)。
- **B (restore_mcp sibling rename best-effort)**: 失败仅 log eprintln 不 propagate err,与 plan 一致。可能罕见 case 下 snapshot 残留在 trash 目录,无害。NON-BLOCKING。
- **B (restore_scene / restore_project 防 collision)**: 实现选择 early-return without re-insert,比 plan(remove + re-insert + write + Err)更稳——less write path。**比 plan 更好**。
- **B (cross-fix F1 atomic write + F2 trash IPC)**: F2 所有 IPC 都走 read_app_data + write_app_data,自动受益 F1 atomicity。**正确,无新 issue**。

### B3 安全 / F3(A2, B4, B5)

- **B-9 (finalize_skill_install second derive_install_triple)**: 重复 derive 但 sanitize_resource_name 不变换字符,等价 ✓ **无 regression**。
- **B (B5 allowlist 可能让 catalog entry 消失)**: 信任 F3 已 verify 当前 MCP Registry 全部 entry 用 npm/pypi/oci。**主 Agent ship build 后建议实测**:打开 MCP servers 页对比之前列表,确认无意外 disappearance。

### B4 数据完整 / F4a(A6, A8)

- **B (tri-state 反序列化)**: Tauri serde 已 verify `Option<Option<String>>` 行为符合预期 ✓
- **B (auto-classify path categoryId)**: rulesStore:490 / claudeMdStore:509 直接 safeInvoke,`categoryId: string | undefined` 路径在新 backend 下行为不变 ✓
- **B (update_rule / update_claude_md unit tests)**: 现有测试不 cover categoryId clear semantics——F4a log 已 verify cargo test 全 pass。但 NEW test wouldn't have caught the regression even if F4a regressed,因为没有 categoryId 相关 unit test。Charter 不要新测试,合理 ✓

### B5 前端 UX / F4b(A7, A9, A10, A11)

- **B-8 (双 banner 共存)**: SkillsPage page-level error banner + MainLayout global banner 可能同时显示。视觉略乱但功能正确。NON-BLOCKING。
- **B-13 (add child category)**: 当前 UI 无 add-child 入口,parent_scope 永远 root。Future-proof 需要 add-child 时同步 dedup,F4b 已 verify ✓
- **B (A11 mr-[800px])**: handleDelete reset 是同步 batch,margin 与 panel 同帧关闭。**正确**。
- **B (A11 marketplace deep link `?selected=`)**: 走的是 useEffect → setSelectedSkillId,不走 handleDelete,无 interaction ✓

### B6 跨修复 interaction

- **F1 + F4a**: delete_category cascade Rules 经 write_app_data 写盘——自动受益 F1 atomicity ✓
- **F1 + F2**: 所有 restore_* 经 write_app_data——自动受益 ✓
- **F1 + F4a write semantics 变化**: read_app_data 现在 parse 失败 → fallback。F4a update_rule 内部 read_app_data → 可能返回 default(corrupted recovery)→ rule_id 不在 → return Err("Rule not found")。**预期行为** ✓
- **F2 + F4a**: restore_scene 内 filter dangling rule_ids 用 `data.rules.iter().any(|r| r.id == ...)`——与 F4a 的 update_rule tri-state 无 interaction ✓
- **F2 list_trashed_items DATA_MUTEX + 其他 marketplace finalize DATA_MUTEX**: 在不同时刻 acquire,无嵌套 ✓ 无 deadlock。
- **F4b A10 + F4a A6**: delete_category 失败时 store 写 appStore.error → MainLayout banner 显示。**新 happy path,正确** ✓

---

## C. Surprise 改动确认

git diff stat 显示 4 块文件改了**但 F1-F4b 任一 plan / log 都没提及**:

| 文件 | +/- 行 | 实际改动来源 | 合理性 | 风险 |
|---|---|---|---|---|
| `src-tauri/src/commands/skills.rs` | +56 | **Scope refactor**(`/Users/bo/.claude/plans/hazy-percolating-forest.md`)| 合理:scope derived 而非 metadata 持久化,与 Claude Code 真实状态一致 | LOW —— 与本次 bug fix 正交;但增加 PR diff 体积 |
| `src-tauri/src/commands/mcps.rs` | +71 | **Scope refactor** 同上 | 合理 | LOW |
| `src-tauri/src/commands/import.rs` (~80 lines 部分) | + | **Scope refactor**(删 update_*_scope_in_metadata)| 合理 | LOW |
| `src-tauri/src/commands/marketplace.rs` (~350 lines 部分) | + | **Codeload install fix**(`.dev/codeload-install-fix/`)+ scope refactor(删 entry.scope 默认值)| 两块独立合理 | LOW — codeload fix 有 validation doc |
| `src-tauri/src/types.rs` (~30 lines) | + | Scope refactor 注释 + F2 TrashedItems 字段(F2 plan 内)| 合理 | LOW |
| `src/components/common/ScopeSelector.tsx` | +16/-9 | **Scope refactor**——`Scope | 'user'` 类型简化为 `Scope` | 合理 | LOW |
| `src/stores/skillsStore.ts` | +13/-3 | **Scope refactor**(传 claudeConfigDir + updateScope 后 loadSkills)| 合理 | LOW |
| `src/stores/mcpsStore.ts` | +5 | **Scope refactor**(updateMcpScope 后 loadMcps)| 合理 | LOW |
| `src/pages/SkillsPage.tsx` | +49(扣除 A11 的 +9 = +40) | **Sort with usageStats** + `installedAt` anchor — 与 `.dev/skills-detail-audit/` 相关 | 合理,但 outside F4b plan | LOW |
| `src/pages/McpServersPage.tsx` | +49(扣除 A11 的 +9 = +40) | **Sort with usageStats** 同上 | 合理 | LOW |

**结论**:这些是 3 个独立的 in-flight task 改动被一起打包了:
1. **Scope refactor**(`hazy-percolating-forest.md`)—— 解决 user reported scope 显示与实际不一致
2. **Codeload install fix**(`.dev/codeload-install-fix/`)—— 解决 azure-prepare install 报错
3. **Skills/MCPs sort with usageStats + installedAt**(`.dev/skills-detail-audit/` + `.dev/mcp-detail-audit/`)—— 改 sort 用真 install 时间和真 usage stats

**所有三块独立合理且与 bug-audit fix 无负向 interaction**。但**没有放进本轮 bug-audit-2026-05-15 的 charter**——是更早 session 的 WIP 在合并时一起带过来的。

**对本次 PR 决定的影响**:三块都应该在 commit message 里**显式归类**——例如 `chore(scope): derive Skill/MCP scope from filesystem` / `fix(marketplace): codeload diagnostic + per-request timeout` / `feat(sort): anchor on installedAt + usage stats` —— 不要全部 fold 进 "bug-audit-2026-05-15 fixes" commit message,否则未来 archeology 会困惑。**建议主 Agent commit 时拆 3-4 commits,而不是一个 megacommit。**

---

## D. 测试覆盖审查

| 修复 | 新代码 | 单测覆盖? | 影响 |
|---|---|---|---|
| F1 B1 atomic write | `read_app_data` recovery / `write_app_data` atomic / `.bak` / `.corrupt` | **NO** | HIGH —— critical infra. 一行回归 = 数据丢失。建议加 `mod atomic_write_tests` (3-4 test:basic round-trip, parse failure → bak recovery, parse failure + no bak → default + corrupt rename) |
| F1 A1 selective delete | `ensemble_managed_claude_md_contents` / `matches_any_managed` / `ensemble_managed_mcp_names` / `trim_managed_mcps_in_file` | **NO** | MEDIUM —— pure functions trivially testable. 现回归会被用户在 Clear 操作里 catch,但用户已经丢文件了 |
| F2 A3 sanitize_*_against_data | `sanitize_skill_metadata_against_data` / `sanitize_mcp_metadata_against_data` | **NO** | MEDIUM —— pure helpers,easy to test |
| F2 A5 restore_scene / restore_project | 整个 IPC 包括 dangling ref filter | **NO** | MEDIUM —— integration test 需要 ScopedDataDir 框架,但 fixture-based unit test (mock AppData) 也可以 cover dangling filter 逻辑 |
| F3 A2 escape | `applescript_quote` + `folder_launch_command` | 用 (已有) | LOW —— helpers 已 verified safe via Ghostty 路径 |
| F3 B4 sanitize | `sanitize_resource_name` 已有 test | 用 (已有) | LOW |
| F3 B5 allowlist | envelope_to_item 新 if check | **NO** | LOW —— 简单 if 条件 |
| F4a A6 cascade | `delete_category` / `delete_tag` 4 行 cascade | **NO** —— `delete_category_cascade_tests` 覆盖 skills/mcps/claude_md 不覆盖 rules | LOW |
| F4a A8 tri-state | `update_rule` / `update_claude_md` 参数类型变化 | **NO** | MEDIUM —— Tauri serde tri-state 行为是隐式契约,一个 test 能锚定语义 |
| F4b 所有 | 前端代码 | vitest 283 全 pass(F4b log)| LOW —— 但没新增 test cover dedup 逻辑 |

**Charter 显式禁止新增 tests**,合理(本次任务是 fix,不是 build framework)。但 V2 强烈建议 **post-merge backlog 立项**:F1 B1 的 atomic write/recovery 是基础设施,没 test 等于无回归保护。

---

## 总结

### ❌ BLOCKING(必须修才能 merge)

- **B-5**: `SettingsPage.handleRestoreComplete` 漏 reload `rulesStore` / `scenesStore` / `projectsStore`。**A5(restore_scene/project)在用户视角不工作**——用户恢复 Scene 后看不到。F2 修了一半。
  - **修复**: 改 1 个文件(SettingsPage.tsx)的 1 行,加 3 个 load 函数到 Promise.all。

### NON-BLOCKING 但跟进(post-merge backlog)

按价值/成本排:

| 优先级 | Item | 成本估计 |
|---|---|---|
| HIGH | **B-12 read_app_data silent recovery 加 eprintln 1 行** —— 调试用户报"我所有数据没了"必备 | 1 line code |
| HIGH | F1 B1 加单测(atomic write / recovery / .bak / .corrupt rename) | 50-80 lines test code |
| MEDIUM | A6-2: `reset_auto_classify_data` 加 Rules cascade(F4a 已 flag, 与 A6 同款 logical bug) | 4 lines code |
| MEDIUM | A2-2: Warp YAML 路径的 escape(`\n` / `\\` / tab)—— Master findings R4 D2,降级 P2 | 1 helper function + 2 callsite update |
| MEDIUM | B1 same-pattern: `write_settings` 也 atomic + backup(P2,settings 不太致命但同款 bug) | ~30 lines code |
| LOW | F2 / F4a / F4b 加单测(pure helpers + dedup + sanitize) | 各 ~30 lines |
| LOW | A9 完整性:`scenesStore.createScene` 也加 dedup(死代码但 future-proof) | 5 lines |
| LOW | A10 + page-level banner 视觉一致性(token migration) | UI cleanup |
| LOW | `.bak` 文件在 README 文档化(用户 Finder 看到不困惑) | 1 README paragraph |
| LOW | Codeload install fix / scope refactor / sort 改动**单独 commit** 而不是 fold 进 bug-audit commit | commit 时操作 |

### Surprise 改动确认

三块 in-flight WIP 改动被打包(详 §C):
1. **Scope refactor** —— 独立 plan,合理,无 interaction
2. **Codeload install fix** —— 独立 plan 有 validation doc,合理
3. **Skills/MCPs sort with usageStats + installedAt** —— 改 sort 锚点,合理

**它们没有引入 fix 范围外的 regression**。但建议 **commit 时拆分** ——主 Agent 操作 commit message 时显式归类,不要 fold 成 "bug-audit-2026-05-15 fixes" megacommit。

### 整体判断

- 15 条 finding 的**核心修复**正确、覆盖完整
- 唯一 BLOCKING 是 SettingsPage 的前端 reload 链路漏掉 — **1 行改动可完整修**
- 跨修复 interaction(F1 atomic write + F2/F4a write paths)是 net positive — 所有 write 自动受益 atomicity
- 测试覆盖普遍偏弱 — 但 charter 显式禁止新测,合理 — backlog 立项
- Surprise 改动是 3 个独立 in-flight task,正交合理 — 建议 commit 时拆分

**判定**: **CONDITIONAL GO**(修 B-5 即可 GO)
