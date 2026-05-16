# V1r3 — Round 3 合并 Audit Report

Author: V1r3 (Opus 4.7) — 2026-05-16
Charter: `.dev/bug-audit-2026-05-15/round3/00_implementation_charter.md`
Plan: `.dev/bug-audit-2026-05-15/round3/H1_plan.md`
Log: `.dev/bug-audit-2026-05-15/round3/H1_log.md`
Scope: 4 fixes(R3-1 / R3-2 / R3-3 / R3-4)合并审,三视角(代码正确性 + 完整性 + 回归)。

---

## Gate 复跑结果

| Gate | 命令 | 结果 |
|---|---|---|
| Rust build | `cd src-tauri && cargo build` | PASS — 0 errors, 1 pre-existing `dead_code` warning (`marketplace.rs:769 transport`) unchanged |
| Rust tests | `cd src-tauri && cargo test --lib` | PASS — **199 passed / 0 failed / 7 ignored**(round-2 base 196 + 3 new `schema_forward_compat_tests`) |
| TS check | `npx tsc --noEmit` | PASS — clean output |
| ESLint | `npx eslint src/` | PASS — 0 errors / 17 pre-existing warnings unchanged |
| Vitest | `npx vitest run` | PASS — **289 passed**(matches round-2 base) |

3 个新测试单独跑也 PASS:
```
test commands::data::schema_forward_compat_tests::write_stamps_schema_version ... ok
test commands::data::schema_forward_compat_tests::missing_schema_version_defaults_to_zero ... ok
test commands::data::schema_forward_compat_tests::unknown_top_level_fields_round_trip ... ok
```

H1 自报数据全 verify。

---

## 逐条 finding 审查(4 条 × 6 问)

### R3-1: `update_project.sceneId` 三态

**Files**: `src-tauri/src/commands/data.rs:1555-1589`(+docstring 1539-1554)/ `src/stores/projectsStore.ts:222-254`

**Q1 修对了吗?**(代码层)
对。Backend `sceneId: Option<Option<String>>` + `unwrap_or_default()` → `""` 符合 `add_project` 的"空字符串=未绑定"约定。Frontend `'sceneId' in data` 检测 + `undefined → null` 正常化与 `rulesStore::updateRule` 行 271-281 / `claudeMdStore::updateFile` round-1 pattern 一致。Mirror 完美。

**Q2 边界正确吗?**(代码层)
对。
- `Some(Some("xxx"))` → set 到 "xxx" ✓
- `Some(None)` → unwrap_or_default() → `""` ✓
- `None` → 跳过 if let,project.scene_id 不变 ✓
- Frontend 空 object `{}` → payload 只含 `id` → backend 全 `None` → no-op ✓
- 找不到 project → `Err("Project not found")` ✓(round 1 已实现)

**Q3 同类 bug 漏修?**(完整性)
**No same-class bugs left.** Grep `Option<Option<String>>` 命中 3 处:`rules.rs:510`(A8 round-1)/ `claude_md.rs:520`(A8 round-1)/ `data.rs:1561`(R3-1 round-3)。剩下的可空字段:
- `update_skill_metadata` / `update_mcp_metadata` 已有 `Option<Option<String>>` 模式(round-1 之前已存在)
- `Project.last_synced: Option<String>` 字段:`update_project::lastSynced: Option<String>` 也存在"清空"语义缺失(若需 explicit clear,需要类似改造)。但 round-1 A8 的 cleanup 不在 R3 charter scope,且 `lastSynced` 的"未同步"状态没有 user-facing UI 调用——保留可接受,不算漏修。

**Q4 callsite 全覆盖?**(完整性)
对。Grep `update_project\(` 和 `safeInvoke\('update_project'`:
- `LauncherModal.tsx:97` — 传 `sceneId: string` → set ✓
- `ProjectsPage.tsx:132` — 传 `{ icon }` 不含 sceneId → 新 payload filter 不 emit → backend `None` no-op ✓
- `ProjectsPage.tsx:153` — 传 `sceneId: string` → set ✓
- `projectsStore.ts:392` — `{ id, lastSynced: now }` 直接 invoke → 不含 sceneId → backend `None` no-op ✓
- `projectsStore.ts:439` — `{ id, lastSynced: null }` 直接 invoke → 同上 ✓

Backend 5 处 caller 全 verify,无遗漏。

**Q5 Round 1/2 回归?**(回归)
**No regression.** Round-1 A8(`update_rule` / `update_claude_md` 三态)未被触及,仍 intact(`grep "categoryId: Option<Option<String>>"` 命中 2 处)。Round-2 G1(`has_completed_unicode_normalization`)未被触及。Round-1 B1(atomic write_app_data)未被触及。

**Q6 未来风险?**(回归)
**Low risk.**
- `Project.scene_id: String`(非 Option)+ 空字符串 sentinel 与 `add_project` 一致;若未来想统一改为 `Option<String>`,需同时改 `add_project` / `Project` struct / TrashedProject struct / JSON migration,这是 V3 级别的 breaking change,本轮不强求。
- 前端 `Partial<Project>` 类型与新 payload 显式 list (`name` / `path` / `sceneId` / `lastSynced`)耦合:若未来给 `Project` interface 加新字段,frontend 新字段必须显式加入 `updateProject` action 的 payload 构造,否则会被 silent 丢弃。这是一个**轻量 footgun**——但 `icon` 已是这种情况(pre-existing,不在 scope),所以模式上不算 R3-1 引入。
- ProjectsPage:132 `updateProject(_, { icon })` 的 frontend-only 状态泄漏(optimistic state 更新但后端不存)是 pre-existing 问题,R3-1 不引入也不解决,H1_log 已 flag,**non-blocking**。

---

### R3-2: AppData passive forward-compat

**Files**: `src-tauri/src/types.rs:230-241`(const)+ `:308-331`(2 fields)/ `src-tauri/src/commands/data.rs:270-292`(read warning)、`:352-392`(write stamps)、`:485-488`(init_app_data 显式填充)、`:3851-3996`(3 new tests)/ `src/types/index.ts:426-436`(可选 frontend mirror)

**Q1 修对了吗?**(代码层)
**修对。** 我做了如下深度推演验证关键路径:

**核心场景:V_n+1 (schema=2, +foo:42) → V_n (schema=1) → V_n+1**:
1. V_n+1 写出 JSON `{ schemaVersion: 2, foo: 42, ... }`
2. V_n 读到:`data.schema_version = 2`(serde 命名字段 priority),`foo: 42` 进 `other["foo"]`(flatten 抓未知 key)。`read_app_data` eprintln warning(`2 > 1`),不 refuse。
3. V_n 做 mutate(eg. delete scene),`write_app_data(mut data)` stamp `data.schema_version = 1`,序列化:named field 输出 `"schemaVersion": 1`,flatten `other` 输出 `"foo": 42`。最终 JSON 顶层有 `schemaVersion: 1` + `foo: 42`(no double-key,因 named 优先 + flatten capture 不含 named-key)。
4. V_n+1 重读:`data.schema_version = 1`(命名字段 commands `schemaVersion` 顶层值),`foo: 42` 命中 V_n+1 的命名字段(serde camelCase rename `foo` → `"foo"` → 反序列化 OK)。
5. **数据保护 OK**:`foo: 42` 没丢。`schemaVersion: 1` 是 metadata 失准(V_n+1 误以为 disk 是 V_n 写的,实际就是 V_n 写的所以也算正确)。**不影响数据完整性。**

**等等,这个推演还触发一个边界:V_n+1 如果有 schema_version-gated 迁移逻辑**(eg. "如果 disk schema=1,执行 NFC migration"),V_n+1 重读看到 `schemaVersion: 1` 可能误触发已完成的迁移。**但这是 future-fix 的问题——当前 V2.1.4 没有 schema_version-gated 行为,所有迁移用独立 boolean flag(`has_completed_unicode_normalization` / `has_completed_category_id_migration`)**。这些 boolean flag 与 schema_version 解耦,不受 stamp-down 影响。

**结论**:passive forward-compat 设计**对当前架构安全**。Future risk 我在 Q6 详述。

**Q2 边界正确吗?**(代码层)
对。
- Legacy data.json(无 schemaVersion key)→ `#[serde(default)]` → `schema_version = 0`,`0 <= APP_DATA_SCHEMA_VERSION (1)`,不触发 warning,next write stamps to 1 ✓
- `other` 字段空 → `skip_serializing_if = "HashMap::is_empty"`,fresh data.json 不污染 ✓
- `read_app_data` recovery path(round-1 B1)不受影响——新 warning 在 `Ok(data)` branch,parse failure 走 `Err` branch unchanged ✓
- `write_app_data(mut data)` 签名对 caller 透明(by-value 参数,内部 mut)→ 70+ caller 零修改 ✓
- `init_app_data` 显式填两个新字段(避免在多字段 struct literal 中漏初始化) ✓
- `Default for AppData` 自动派生 → `schema_version: 0`, `other: HashMap::new()` ✓
- 3 个 round-trip tests cover write-stamp、unknown-fields preserve、legacy default ✓

**Q3 同类 bug 漏修?**(完整性)
**没有。** 我 grep 了所有"用户数据"持久化结构,确认 forward-compat 覆盖完整:
- `AppData`(`data.json`)→ R3-2 加 flatten + schema_version ✓
- `AppSettings`(`settings.json`)→ **未加 flatten**,但这是设计选择:settings 是 Ensemble 私有的简单配置,且 round-1 V2 fixes 中 `extract_skill_settings_into_appsettings` 已专门处理过 enumerate 风险。Settings 加 flatten 是 nice-to-have 但非 R3-2 scope。Flag 但**non-blocking**,留 backlog。
- `ClaudeJson` / `ClaudeProjectConfig`(`~/.claude.json`)→ **已有** flatten other(types.rs:683-686, 698-699)✓
- `ClaudeSettings`(`~/.claude/settings.json`)→ **已有** flatten other(types.rs:575-576)✓
- `Project` / `TrashedProject` / `Scene` 等内嵌结构 → 不需要 flatten(它们的字段集由 AppData 控制,AppData 的 `other` 已覆盖任何 newer-version 顶层加字段)

**Q4 callsite 全覆盖?**(完整性)
对。`AppData {` literal 在 src-tauri 中只有 6 处:
- `init_app_data` line 441-489:fresh install 完整初始化 → 已加 `schema_version` + `other` ✓
- 其他 5 处 `..Default::default()` 用法(主要在 tests):derive Default 自动包含新字段 → 零修改 ✓

`write_app_data` signature 从 `pub fn write_app_data(data: AppData)` → `pub fn write_app_data(mut data: AppData)`,**caller 视角没变**(by-value 参数)。70+ callers 验证 → 零需修改。

**Q5 Round 1/2 回归?**(回归)
**No regression.**
- Round-1 B1 atomic write(read_app_data recovery / write tmp+rename):`read_app_data` 新 warning 在 `Ok(data)` branch 加,`Err` branch + recovery code 一字未改。`write_app_data` 的 atomic sequence(tmp → fsync → rename + bak)一字未改,新加的 stamping 在 serialize 之前——不影响 atomicity。
- Round-2 G1 `has_completed_unicode_normalization`(`init_app_data` 显式 set true):新字段加在 `imported_marketplace_skills` 之后,不影响 flag 设置 ✓
- Round-2 G3/G4(其他文件)未被触及 ✓

**Q6 未来风险?**(回归)
**Medium risk — 需要 flag 给主 Agent 关注。** 列三个潜在 footgun(都 NON-BLOCKING):

1. **Unconditional stamp-down**:V_n 写回时无条件 stamp `data.schema_version = APP_DATA_SCHEMA_VERSION = 1`,即使 disk 原本是 99。这让 V_n+1 重读时 metadata 失准("看起来是老版本写的"),**但数据完整性 OK**(foo 等未来字段从 other flatten 回顶层)。
   - **若未来引入 schema_version-gated 迁移逻辑**(eg. v3.0 加 "schema < 5 时跑 X migration"),V_n 写回会导致 V_n+1 误触发已 V_n+1 跑过的 migration。
   - **当前缓解**:V2.1.4 所有迁移用独立 boolean flag,与 schema_version 解耦。Future v3.0 加新 migration 时,**必须用独立 flag 或加 `max(disk, runtime)` stamping** 才能用 schema_version gate。建议在 const `APP_DATA_SCHEMA_VERSION` 上方文档化此约束(目前 doc comment 没说)。
   - **NON-BLOCKING,future-proofing concern**。

2. **`other` flatten 与 named field name 重叠** is silently handled correctly by serde(named field consumes the JSON key first; `other` only captures truly-unknown keys)。但若**未来给 AppData 加一个命名字段**(eg. `pub foo: u32`),老版本 V_n+1 写出的 `{ "foo": 42, ... }` 在 V_n 读取时,V_n 没有 `foo` 命名字段 → `foo` 进 `other`。V_n 写回,`other` 把 `foo` 平铺回顶层。V_n+1 重读,V_n+1 的 `foo` 命名字段命中。**round-trip 安全**。

3. **`#[serde(deny_unknown_fields)]` not present on AppData** — 当前已 verify(否则 flatten 不可能 work)。但若未来不小心加上,会立刻让 flatten 失效(因 flatten 是通过把未知 key 走"漏网"机制实现的)。建议在 const doc-comment 加 `// CAUTION: do NOT add deny_unknown_fields to AppData — it nullifies the `other` flatten.`。**NON-BLOCKING**。

---

### R3-3: 删 SceneDetailPage 死代码

**Files**: `src/pages/SceneDetailPage.tsx`(498 行)deleted / `src/pages/index.ts:5` deleted

**Q1 修对了吗?**(代码层)
对。文件物理删除(`git status` 显示 `deleted: src/pages/SceneDetailPage.tsx`),index.ts re-export 行已删。

**Q2 边界正确吗?**(代码层)
对。`grep -rn "SceneDetail" src/` 返回零结果 → 无遗留引用。

**Q3 同类 bug 漏修?**(完整性)
**No same-class.** 我 grep 了 `src/pages/` 下所有 .tsx 文件并对照 `src/App.tsx` 的路由表:
- 实际路由文件:SkillsPage, McpServersPage, ScenesPage, ProjectsPage, SettingsPage, CategoryPage, TagPage, RulesPage, ClaudeMdPage, SkillMarketplacePage, McpMarketplacePage(11 个)
- `src/pages/index.ts` re-exports 现 10 个(删 SceneDetailPage 后)
- 文件系统 pages 目录 12 个 .tsx 文件(包含 index.ts)
- 经 cross-check,无其他完全无 import 的死代码 .tsx 文件

**Q4 callsite 全覆盖?**(完整性)
对。无 dynamic import(`grep "lazy\|import(" src/App.tsx src/pages/index.ts` 空),无 string-based router 引用。

**Q5 Round 1/2 回归?**(回归)
**No regression.** SceneDetailPage 从未被 round 1/2 修过(零代码改动),且其他 Scene 相关 UI(ScenesPage 的 SlidePanel)与 SceneDetailPage 是平行实现而非互依——删 SceneDetailPage 不影响 ScenesPage。

**Q6 未来风险?**(回归)
**Zero risk.** 死代码删除是绝对安全的清理操作。

---

### R3-4: `println!` → `log` macros

**Files**: `claude_md.rs`(20 处)/ `data.rs`(2 处)/ `rules.rs`(7 处)= **29 处**(charter 说 32,实际命中 29;H1 在 log 中说明此 discrepancy)

**Q1 修对了吗?**(代码层)
对。Verify:
- `grep -rn 'println!' src-tauri/src/` 排除 eprintln → 命中 0 处 ✓
- 所有 production-path println 已替换 → log::{debug, info, warn} ✓
- 内容字符串完全不变(只换宏名,无副作用)✓
- `log` crate 已在 `Cargo.toml:23`("0.4")✓
- `tauri_plugin_log` 已在 `lib.rs:24-29` 初始化(仅 debug build,Info+ filter)✓

**Q2 边界正确吗?**(代码层)
**Mostly correct, with one developer-experience caveat.**

Level 选择审查(逐条):
- `claude_md.rs:324,326,344,355,386,389,391,392,394` — 11 处 trace logs(`Called with`, `Read content, length`, `After push, count` etc.)→ `log::debug!` ✓ — these are verbose tracing, debug level 合理
- `claude_md.rs:330` — `Source file not found!` → `log::warn!` ✓ — failure recovery path
- `claude_md.rs:363,383` — success milestones(`Written to managed path`, `Created file with id`)→ `log::info!` ✓
- `claude_md.rs:619,626,633,636` — `delete_claude_md` Warning lines(error recovery)→ `log::warn!` ✓
- `claude_md.rs:639,747,967,973` — info milestones(`Moved to trash`, `Auto-imported`, migration)→ `log::info!` ✓
- `data.rs:1389,1392` — `add_scene` traces → `log::debug!` ✓
- `rules.rs:608,631,638,647,649` — delete_rule warnings → `log::warn!` ✓
- `rules.rs:652,757` — success milestones → `log::info!` ✓

**Caveat (NON-BLOCKING)**: `tauri_plugin_log` 初始化只 in `debug_assertions`(`lib.rs:24`),release build **no logger 注册** → `log::*!` 全成 no-op,**完全静默**。debug build 的 filter 是 `LevelFilter::Info` → `log::debug!` 不显示。
- 这意味着开发者跑 `npm run tauri dev` 时,大量 trace logs(`[import_claude_md] Called with...`)**消失**——比之前 `println!` 行为更安静。
- 这是 **deliberate trade-off**:H1 plan 明确说"release build 不输出"是目标,牺牲 dev 体验是接受的。
- 若开发者需要看 debug logs,需手动改 `lib.rs:27` 到 `LevelFilter::Debug`(临时)或者通过环境变量(`tauri_plugin_log` 支持 `RUST_LOG`)。**这点 H1_log 没明示提醒**,建议主 Agent 在 commit message 或后续文档中加一句。

**Q3 同类 bug 漏修?**(完整性)
**No.** Grep verify:
- `grep -rn 'println!' src-tauri/src/` 0 hits in src-tauri ✓
- `eprintln!` 保留(charter 明确):data.rs 8 处(read_app_data recovery/3 处 + 其他 production paths/5 处)、marketplace.rs 多处、plugins.rs 2 处、trash.rs 1 处、lib.rs setup 3 处 — 全部按 charter 决策保留

**Q4 callsite 全覆盖?**(完整性)
对。`grep -rn 'println!' src-tauri/src/` 全 zero hit(全局清),无 commands 外漏点。

**Q5 Round 1/2 回归?**(回归)
**No regression.**
- Round-1 B1 `data.rs:294,303,319` 的 recovery eprintln 保留 ✓
- Round-2 G1 `data.rs::migrate_unicode_normalization` 用 eprintln(实际是 `read_app_data` 的 recovery path eprintlns),未触及 ✓
- 所有 round-1/2 改过的 `println!`(应该没有,round-1/2 改 backend 主要是逻辑/数据保护,非日志净化)未被反向触及

**Q6 未来风险?**(回归)
**Low risk.**
- Future log 加入时,继续用 `log::*!` 即可,模式建立 ✓
- 若发现 dev 体验不够(debug logs 都看不到),可调 `lib.rs:27` filter,或加 RUST_LOG 文档。NON-BLOCKING。

---

## 总结

### BLOCKING(必须修才能合并)

**无。** 所有 4 条 finding 修复在代码正确性、完整性、回归避免三个维度上都通过。

### NON-BLOCKING 但应跟进

1. **R3-2 stamping-down 文档化**(future-proofing):`APP_DATA_SCHEMA_VERSION` const doc comment 应加一句 "若未来引入 schema_version-gated migration,需重新评估 stamp-down 策略(可能改 `max(disk, runtime)`)"。同时建议加 `// CAUTION: do NOT add #[serde(deny_unknown_fields)] to AppData — it nullifies the `other` flatten` 在 AppData struct 上方。**不是 round-3 必修,后续 cleanup commit 加即可。**

2. **R3-4 debug-build dev 体验**:开发者跑 `npm run tauri dev` 时,debug logs 默认看不到(因 LevelFilter::Info)。若开发期间 trace 是常用调试手段,建议:(a) 临时改 `lib.rs:27` 到 `LevelFilter::Debug`;或 (b) 在 README / CONTRIBUTING.md 加一节说明 RUST_LOG 用法。**Document-only,不阻塞合并。**

3. **R3-1 frontend payload filter footgun**:`projectsStore::updateProject` 的新 explicit-list 写法对未来给 `Project` interface 加字段不够 forward-compat——必须在 store action 显式 list 新字段。但既然加 Project 字段本身就需要 backend IPC 同步,这个耦合是合理的。**No action needed,只 flag。**

4. **ProjectsPage:132 `updateProject(_, { icon })` 脱钩**(pre-existing,H1_log 已 flag):frontend 设 icon 不持久化到 backend。**已知问题,scope 外。** 建议在 Issues / backlog 追踪。

5. **`AppSettings` 未加 flatten other**(non-scope):若用户在 V_n+1 之后回滚 V_n 改 settings,settings.json 中的未来字段可能丢。R3-2 charter scope 仅 AppData,合理。**Backlog 项。**

### 整体判断:**GO**

理由:
- 5 个 gate 全 PASS(199 Rust tests / 289 TS tests / TS / ESLint / Build clean)
- 所有 4 条 finding 都对应代码改动,逻辑正确,边界处理对,callsite 全覆盖
- Round 1 / Round 2 已 commit 修复**零回归**(grep / pattern 实测验证)
- R3-2 round-trip 推演 + 3 个新测试覆盖 → forward-compat 设计**对当前 V2.1.4 架构数据安全**;future schema-gated migration 风险已识别但 non-blocking
- R3-4 dev-build behavior change(debug logs silent at Info filter)是 deliberate trade-off,符合 H1 plan 的"release build 不污染"目标
- 用户硬性要求"不影响现有功能 + 不引入新问题"**满足**

可以 commit 进入合并阶段。建议主 Agent 在 commit message 中:
- 提及 R3-2 forward-compat 设计的限制("passive only — schema_version stamping does not preserve disk version")
- 提及 R3-4 release build 日志静默 vs debug build Info+ 的行为分界
- Future-proofing 的两个文档化建议(stamping doc + deny_unknown_fields 警告)可以另起一个 doc-only commit。
