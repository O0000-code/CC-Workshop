# Round 2 Implementation Charter — Bug Audit 2026-05-15 (Round 2)

继 round 1(15+3 修复已合并到 main, commits `b2e5729..e61554e`)之后,本轮处理用户明确列出的 **10 条新修复**。

**适用对象**:全部 Round 2 fix Agent(G1 / G2 / G3 / G4)+ 复审专家(V1r2 / V2r2)。

## 用户硬性要求(同 round 1)

1. **不影响任何现有功能**(包括 UI / 交互 / 其他流程)
2. **不引入任何新 bug**
3. **修复用稳定、易维护方式,不过度工程化也不简化**
4. **每个 Agent 充分上下文**(必读所有相关 finding + 代码全文)
5. **完成后责任专家复审**

## Round 2 修复清单(10 条)

| ID | Round-1 finding | Brief 一句话 | Agent |
|---|---|---|---|
| R2-1 | B6 / R6 F5 | macOS NFC vs NFD 边界 → 含中文 / 带音标 Skill 名 metadata 反复重置 | **G1** |
| R2-2 | B11 / R6 F2 | `~/.ensemble/` owner 错配(用户 sudo open 过)后 silent 空白状态 | **G1** |
| R2-3 | B8 / R1 A7 / R7 F7-3 | syncProject 部分失败用户看不到具体哪一步 | **G4** |
| R2-4 | B9 / R2 F4 | HTTP MCP install/update URL 是空或未替换 `{VAR}` 仍显示成功 | **G3** |
| R2-5 | R7 F7-7 | 19 处 Enter handler 无 IME composition 守卫 → 中文输入法用户被坑 | **G4** |
| R2-6 | R2 F9 / R3 C3 | import_plugin_skills / import_plugin_mcps 错误 eprintln 不返回前端 | **G2** |
| R2-7 | R3 C5 | fetch_mcp_tools stderr 丢弃 → MCP 启动失败用户拿不到根因 | **G3** |
| R2-8 | R6 F3 | 终端没装时 silent fail(Alacritty / Warp / Ghostty)+ Ensemble.app 路径硬编码 | **G3** |
| R2-9 | R5 F4 | Trash 长期累积无清理(Empty Trash 按钮 + per-row 永久删除) | **G2** |
| R2-10 | R5 F12 | plugin 卸载后 `imported_plugin_skills` / `imported_plugin_mcps` marker 永不清理 | **G2** |

## 强制必读(每个 Agent)

### 项目核心
- `/Users/bo/Documents/Development/Ensemble/Ensemble2/CLAUDE.md`
- `/Users/bo/.claude/CLAUDE.md`

### Round 1 上下文(完整保留)
- `.dev/bug-audit-2026-05-15/02_known_risk_surfaces.md`
- `.dev/bug-audit-2026-05-15/04_master_findings.md`
- 你负责 finding 对应的 R reviewer 详细分析(下面 Agent 各自 brief 内列出)
- `.dev/bug-audit-2026-05-15/fixes/00_implementation_charter.md`(Round 1 宪法,核心规则相同)

### Round 1 已修 commit(避免回归 / 复用 helper)
- `b2e5729 chore(audit-prep)`
- `7d73921 docs(audit)`
- `0ec5081 fix(audit-backend)` — F1 / F2 / F3 / F4a backend
- `e61554e fix(audit-frontend)` — F2 / F4a / F4b frontend
- 你**绝对不能**碰已 commit 的 round 1 修复处(除非你的 finding 严格要求扩展同一函数)

### 必读 Rules
- `.claude/rules/fix-must-define-user-observable-success.md`
- `.claude/rules/verify-third-party-behavior-firsthand.md`
- `.claude/rules/grep-before-enumerate-shared-resource.md`
- `.claude/rules/measure-before-iterative-tuning.md`
- `.claude/rules/cross-document-cascade-discipline.md`
- `.claude/rules/design-language.md`(UI 改动必需)

## 强制工作流(每个 Agent)

1. **建立完整上下文**:精读必读 + 你要改的代码全文
2. **写实施计划**:`.dev/bug-audit-2026-05-15/round2/{G_id}_plan.md`
   - 每条 finding 涉及的文件 + 函数 + 行号
   - **grep callsite 验证**(共享资源 / 类型 change)
   - **User does X / sees Y / does NOT see Z** 三行契约
3. **执行修改**
4. **写实施日志**:`.dev/bug-audit-2026-05-15/round2/{G_id}_log.md`
   - 每行改动 + 理由
   - **回归风险分析**:列出 N 个相邻功能,验证未受影响
   - **手动验证步骤**
5. **自检 6 问**:
   - 这处修改是否触及了 finding 外的代码?为什么需要?
   - 是否有同款 bug 在其他地方但你没改?(grep 验证)
   - 是否引入新依赖?**round 2 唯一允许的新依赖:G1 可加 `unicode-normalization` crate(成熟,small,业界标准)**。其他 Agent 不得加新依赖。
   - 是否改了 round 1 已修的代码?
   - 是否破坏任何已有 unit test?
   - 你的改动是否对 IPC signature / return shape 造成变化?如有,前端 caller 是否同步?
6. **必跑 Gate**(全 PASS 才算完成):
   ```bash
   cd src-tauri && cargo build  # 0 errors
   cd src-tauri && cargo test --lib  # 全 pass
   cd src-tauri && cargo test --lib -- --include-ignored 2>/dev/null  # round 1 是 192 全 pass(7 ignored 是 live network)
   cd /Users/bo/Documents/Development/Ensemble/Ensemble2 && npx tsc --noEmit  # clean
   cd /Users/bo/Documents/Development/Ensemble/Ensemble2 && npx eslint src/  # 0 errors
   cd /Users/bo/Documents/Development/Ensemble/Ensemble2 && npx vitest run  # 全 pass(round 1 是 283 pass)
   ```
7. **绝对禁止**:
   - 改 scope 外文件
   - 引入新依赖(G1 例外见上)
   - "顺便清理"无关代码
   - 跳过任何 gate
   - 改已 commit 的 round 1 修复
   - 私自调整 finding scope(发现 finding 与代码"根本性矛盾"立即在 log flag 但不调整)

## 阶段执行(同 round 1 模式)

- **Stage R2-1**:G1 / G2 / G3 / G4 **并行**(4 个 Opus 同时)
- **Stage R2-2**:V1r2 + V2r2 并行复审
- **Stage R2-3**:主 Agent 复核 + 修补 BLOCKING
- **Stage R2-4**:commit + push

## 用户语境提示

- macOS 桌面 app(Ensemble v2.1.2),用户群 Claude Code 用户(技术 audience 但**不该被要求懂代码错误**)
- 任何修复涉及用户可见行为时,"User sees" 必须是普通话不是 Rust error
- 错误信息泄露 `/Users/<name>/...` 已 round 1 标记 backlog;本轮新增错误信息时**尽量**走通用 user-friendly 文案
