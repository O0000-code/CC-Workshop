# Round 3 Implementation Charter — Bug Audit 2026-05-15 (Round 3 housekeeping)

继 round 1(15+3,v2.1.3 ship)+ round 2(10,已 merge,commits `7b7b582..9faaa2a`)之后,本轮处理 5 条 P2/P3 backlog。

**适用对象**:Agent H1 + 复审专家 V1r3。

## 用户硬性要求(同前)

1. 不影响任何现有功能
2. 不引入任何新 bug
3. 修复用稳定、易维护方式,不过度工程化也不简化
4. 完成后责任专家复审

## Round 3 修复清单(5 条)

| ID | Round-1/2 finding | Brief 一句话 |
|---|---|---|
| R3-1 | R3 F10 | `update_project.sceneId` 改三态 `Option<Option<String>>`,可解绑 Scene |
| R3-2 | R5 F7 + R5 F8 | `AppData` 加 `#[serde(flatten)] other` + `schema_version: u32` 字段(passive forward-compat),旧版回滚时不丢未来字段 |
| R3-3 | R3 F4 / R7 F7-12 | 删 `src/pages/SceneDetailPage.tsx`(498 行死代码,无路由无 import) |
| R3-4 | R3 F7 | 32 处 `println!` → `log::warn!` / `log::info!` / `log::error!`(选合适 level)|

(R3-2 把"flatten other"和"schema_version"合一条:都是 forward-compat 加固)

## 强制必读

### 项目核心
- `/Users/bo/Documents/Development/Ensemble/Ensemble2/CLAUDE.md`
- `/Users/bo/.claude/CLAUDE.md`

### Round 1 + 2 已 commit(避免回归 + 复用 pattern)
- Round 1 `0ec5081 fix(audit-backend)` 含 A8 三态 pattern(update_rule / update_claude_md `Option<Option<String>>` — **R3-1 必须 mirror 这个 pattern**)
- Round 2 `4f5022e fix(audit-backend-r2)`、`9faaa2a fix(audit-frontend-r2)`、release `3408954`、round-2 docs `7b7b582`
- 你**绝对不能**碰已 commit 的修复处(除非 R3 finding 严格要求扩展同一函数)

### Round 3 finding 详细分析(必读各对应段)
- R3-1: `R3_findings.md::F10`(`update_project.sceneId Option<String>` 同 C6 模式)
- R3-2: `R5_findings.md::F7`(AppData 缺 flatten other)+ `R5_findings.md::F8`(多版本 .app schema 倒退)
- R3-3: `R3_findings.md::F4` + `R7_findings.md::F7-12`(SceneDetailPage 死代码确认零 import)
- R3-4: `R3_findings.md::F7`(32 处 println 列表)

### 必读 Rules
- `.claude/rules/fix-must-define-user-observable-success.md`
- `.claude/rules/grep-before-enumerate-shared-resource.md`(R3-4 必须 grep 完整,32 处不能漏)
- `.claude/rules/cross-document-cascade-discipline.md`(R3-3 删 SceneDetailPage 必须同步 `src/pages/index.ts` re-export)

## 强制工作流

1. **建立完整上下文**:必读 + 代码全文
2. **写实施计划**:`.dev/bug-audit-2026-05-15/round3/H1_plan.md`
   - 每条 finding 涉及的所有文件 + 函数 + 行号
   - **R3-4 grep**:列出所有 `println!` 在 `src-tauri/src/commands/*.rs` 的具体行号 + 每处建议的 log level
   - **R3-1 contract**:User does X / sees Y / does NOT see Z
3. **执行修改**
4. **写实施日志**:`.dev/bug-audit-2026-05-15/round3/H1_log.md`
   - 每条修复改动列表 + 影响分析
5. **自检 5 问**:
   - 改动是否触及 finding 外?为什么?
   - 是否有同款 bug 漏修?
   - 是否引入新依赖?(**R3 全部禁止新依赖** — `log` crate 已存在 with `tauri_plugin_log`)
   - 是否破坏已有测试?
   - IPC signature / return shape 变化?前端是否同步?
6. **Gate**(全 PASS):
   ```bash
   cd src-tauri && cargo build  # 0 errors
   cd src-tauri && cargo test --lib  # 全 pass(round 2 base 196)
   cd /Users/bo/Documents/Development/Ensemble/Ensemble2 && npx tsc --noEmit
   cd /Users/bo/Documents/Development/Ensemble/Ensemble2 && npx eslint src/
   cd /Users/bo/Documents/Development/Ensemble/Ensemble2 && npx vitest run  # round 2 base 289
   ```
7. **禁止**:
   - 改 scope 外文件
   - 引入新依赖
   - 改 round 1 / round 2 已 commit 修复
   - 跳过 gate
   - "顺便清理"(只清你的 5 条 scope 内涉及的代码)

## R3-2 设计细节(主 Agent 已决策)

**只做 passive forward-compat,不做 active refuse-to-mutate**:

1. `AppData` 添加两个字段(都 `#[serde(default)]`):
   ```rust
   /// Schema version anchor. Bumped explicitly when AppData adds
   /// breaking semantics. Currently informational only — `read_app_data`
   /// logs a warning when on-disk version exceeds the runtime constant,
   /// but does not refuse to operate. (Future tightening to "refuse
   /// mutation when disk > runtime" is intentionally deferred to avoid
   /// over-engineering for a single-developer project.)
   #[serde(default)]
   pub schema_version: u32,
   
   /// Forward-compat: unknown fields from a newer version are captured
   /// here on read and re-emitted on write. Round-trip safe: V2 → V3 →
   /// V2 → V3 preserves V3-only fields like `imported_marketplace_skills`.
   /// Pattern mirrors `ClaudeJson::other` (types.rs:639).
   #[serde(flatten, default)]
   pub other: std::collections::HashMap<String, serde_json::Value>,
   ```

2. 添加 const:
   ```rust
   /// Current AppData schema version. Bump when adding a field that
   /// older app versions cannot safely ignore. Most additions can rely
   /// on `#[serde(default)]` + `other: flatten` and do NOT need a bump.
   pub const APP_DATA_SCHEMA_VERSION: u32 = 1;
   ```

3. `read_app_data` 在 parse 成功后,如果 `data.schema_version > APP_DATA_SCHEMA_VERSION`,加 eprintln warning(已有 R5 F15 fix 的 stderr 诊断风格)。**不 refuse**,只 log。

4. `write_app_data` 之前(或 init 时)写入当前 `APP_DATA_SCHEMA_VERSION`(覆盖 default 0)。这样新数据有正确 version 标记。

5. **NOT to do**:不加前端模态、不加 active refuse、不写 schema migration framework。

**用户可见验证**:**用户无可见变化**(passive)。这是为未来 release 准备的防御。

## R3-1 设计细节(沿用 round 1 A8 pattern)

参考 `update_rule` / `update_claude_md`:
- backend `sceneId: Option<Option<String>>` + `#[allow(non_snake_case)]`
- mutation `if let Some(new) = sceneId { project.scene_id = new.unwrap_or_default(); }`(注意 — sceneId 是 String 不是 Option,所以三态 Some(None) → 设为 ""?还是改 Project.scene_id 为 Option<String>?)

**主 Agent 决策**:Project.scene_id 字段保持 `String`,空字符串 = 未绑定。`Some(None)` → `project.scene_id = String::new()`。

前端 `projectsStore::updateProject` 同步:`'sceneId' in updates` 检查 + emit null when undefined,与 round 1 A8 一致。

## R3-3 设计细节

- `git rm src/pages/SceneDetailPage.tsx`
- 编辑 `src/pages/index.ts`:移除 `export { default as SceneDetailPage } from './SceneDetailPage';` 这一行
- grep `SceneDetail` 在整个 `src/` 验证 grep 全无后才安全删除

## R3-4 设计细节

- grep `println!\(` 在 `src-tauri/src/commands/*.rs` 列全部 32 处
- 每处分类:
  - **error path**(失败 / fallback): `log::warn!` 或 `log::error!`
  - **info / progress**:`log::info!`
  - **debug**:`log::debug!`
- 不改 `marketplace.rs` 测试模块里的 `eprintln!`(那是 test output,保留)
- 不改 `eprintln!` 在 `read_app_data` recovery 路径(R5 F15 fix 故意用 eprintln 直接到 stderr,因为它发生在 logging 框架可能未 init 时;**保留**)
- 不改 `lib.rs` setup 里的 eprintln(同上)

**verify**:`tauri_plugin_log` 已在 `lib.rs:25-29` 接入,debug build → Info+,release build → 默认不输出。改 println→log 后 release build stderr 不再被污染。

## 阶段执行

- **Stage 1**: H1 完成 4 条修复 + gate
- **Stage 2**: V1r3 单独复审(代码层 + 完整性 + 回归 合一,因 round 3 改动小)
- **Stage 3**: 主 Agent 修补 BLOCKING(如有)
- **Stage 4**: 1 个 commit(整 round 3 合并)+ push

## 主 Agent 决策点(已决策,Agent 直接 follow)

1. R3-2 只做 passive forward-compat,不做 refuse-to-mutate ✓
2. R3-1 Project.scene_id 字段保持 String,空字符串=未绑定 ✓
3. R3-4 不改测试 eprintln,不改 recovery 路径 eprintln,不改 setup eprintln ✓
4. Round 3 全部禁止新依赖 ✓
