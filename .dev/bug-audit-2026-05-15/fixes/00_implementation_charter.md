# Implementation Charter — Bug Audit 2026-05-15 修复实施宪法

**适用对象**:所有 fix Agent(F1 / F2 / F3 / F4a / F4b)+ 复审专家(V1 / V2)。

每个 Agent 在开始任何代码改动前**必须**完整阅读本文件。

## 用户硬性要求

1. **不影响任何现有功能** — 包括 UI 样式、交互、其他流程
2. **不引入任何新的 bug** — 修一处不能制造另一处
3. **不过度工程化** — 用最小改动覆盖问题,不"顺便"重构、不引入新依赖
4. **不简化问题** — 修复必须真正解决,不接受"绕过"
5. **稳定、易维护** — 改动要符合项目既有模式,不引入特殊化路径

## 强制必读(每个 Agent)

### 项目核心
- `/Users/bo/Documents/Development/Ensemble/Ensemble2/CLAUDE.md` — 项目 mental model,实体设计、易错点
- `/Users/bo/.claude/CLAUDE.md` — 全局工作宪法

### Bug Audit 完整上下文(全部)
- `.dev/bug-audit-2026-05-15/01_review_plan.md` — Reviewer Contract
- `.dev/bug-audit-2026-05-15/02_known_risk_surfaces.md` — 主 Agent 一手发现
- `.dev/bug-audit-2026-05-15/03_angle_validation.md` — Angle 划分依据
- `.dev/bug-audit-2026-05-15/04_master_findings.md` — Phase 5 cross-confirmed 列表
- `.dev/bug-audit-2026-05-15/angle_expert_A.md` + `angle_expert_B.md`
- 你**负责的 finding** 对应的 reviewer `Rx_findings.md`(详细复核)

### 项目 Rules(全部 12 条,优先级最高的)
- `.claude/rules/fix-must-define-user-observable-success.md` — 每个修复必须能写"User does X / sees Y / does NOT see Z"
- `.claude/rules/verify-third-party-behavior-firsthand.md` — 任何"X 库会自动 Y"必须查源码确认
- `.claude/rules/measure-before-iterative-tuning.md` — UI / perf 类不要盲调
- `.claude/rules/grep-before-enumerate-shared-resource.md` — 共享资源约束要 grep 全部 callsite
- `.claude/rules/design-language.md` — UI 改动必须用 token,禁止 inline 数值
- `.claude/rules/cross-document-cascade-discipline.md` — 改 spec 必须 cascade 到所有引用点
- `.claude/rules/replace-installed-app-in-place.md` — 不要建 backup `.app`(本次任务不需要)

## 强制工作流(每个 Agent)

1. **建立上下文**:精读所有必读文件 + 你要改的代码全文(不只是改动行附近)
2. **写实施计划**:在 `.dev/bug-audit-2026-05-15/fixes/{your_id}_plan.md` 记下:
   - 你要改的每条 finding 编号(A1/A3/...)
   - 涉及的所有文件 + 函数 + 行号
   - **关键** — 列出该修改可能影响的所有其他代码路径(grep callsite 验证)
   - 每条修复的"User does X / sees Y / does NOT see Z"契约
3. **执行修改**:按计划改代码
4. **写实施日志**:在 `.dev/bug-audit-2026-05-15/fixes/{your_id}_log.md` 记下:
   - 实际每行改动 + 理由
   - **影响分析**:列出 N 个可能 regress 的相邻功能,验证未受影响
   - 测试如何手动验证(给主 Agent 用)
5. **自检 5 问**(每条 finding 都问):
   - 这处修改是否触及了 finding 描述之外的代码?如果是,为什么需要?
   - 是否有同样问题在另一处但你没改?(grep 验证)
   - 是否引入新依赖、新文件、新 IPC?如果是,理由是什么?
   - 是否修改了已有 IPC 的 signature 或 return shape?如果是,前端 caller 是否同步?
   - 是否破坏了任何已有 unit test?
6. **build + test gate**(强制):
   - `cd src-tauri && cargo build` 通过
   - `cd src-tauri && cargo test --lib` 通过(non-ignored tests)
   - 前端:`npx tsc --noEmit` 通过
   - 前端:`npx eslint src/` 通过
   - **如果任一失败**:修到通过再交付,不接受"已知失败但应该没事"
7. **绝对禁止**:
   - 改 scope 外的文件(即使看起来该改)
   - 引入新依赖
   - 引入新 IPC(除非 finding 明确要求 — A4 / A5 是例外)
   - "顺便清理"无关代码
   - 跳过任何 type check / build / test gate
   - 写新文件除了 `_plan.md` / `_log.md`(除非 finding 要求,如 A4/A5 需要前端新组件)

## Bug → Agent 分配

| Bug ID | Severity | Agent | 文件 |
|---|---|---|---|
| B1 | P0 | F1 | data.rs(write_app_data + helper) |
| A1 | P0 | F1 | config.rs(sync / clear) |
| B7 | P0 | F1 | claude_md.rs(scan is_excluded_dir) |
| A3 | P0 | F2 | trash.rs(restore_skill + restore_mcp) |
| A4 | P1 | F2 | trash.rs + lib.rs + 前端 trashStore + TrashRecoveryModal |
| A5 | P1 | F2 | trash.rs + lib.rs + 前端 trashStore + TrashRecoveryModal + data.rs(read trashed_scenes/projects) |
| A2 | P0 | F3 | import.rs(launch_claude_for_folder iTerm + Terminal.app) |
| B4 | P0 | F3 | marketplace.rs(install_marketplace_skill / derive_install_triple) |
| B5 | P0 | F3 | marketplace.rs(derive_stdio_command `_` fallback) |
| A6 | P1 | F4a | data.rs(delete_category + delete_tag cascade rules) |
| A8 | P1 | F4a | rules.rs(update_rule) + claude_md.rs(update_claude_md) + 前端 rulesStore + claudeMdStore |
| A7 | P1 | F4b | 前端 importStore.ts(importMcps 路径推导) |
| A9 | P1 | F4b | 前端 MainLayout / sidebar inline inputs / CreateSceneModal(重名校验) |
| A10 | P2 | F4b | 前端 MainLayout / sidebar(appStore.error 显示) |
| A11 | P1 | F4b | 前端 SkillsPage / McpServersPage(handleDelete 同步关 panel) |

## 阶段执行

- **Stage 1**: F1 独立完成(改 write_app_data 是后续依赖的基础设施)
- **Stage 2**: F2 + F3 + F4a + F4b 并行(4 Opus 同时,文件不冲突)
- **Stage 3**: V1 + V2 并行复审,全部代码层 audit + 完整性审查
- 每个 Stage 完成,**主 Agent 亲自审 diff** 后才能进入下一 Stage

## "完全把握"的标准提醒

主 Agent 已经确认:**这 15 条全部 cross-confirmed 或经主 Agent 亲自代码层 verify**。Agent 的工作是 *执行*,不是 *再确认 finding 是否真实*。如果你在实施中遇到"代码看起来不像 finding 描述的样子"——立刻停下,写到 log 报告主 Agent,**不要私自调整 finding 范围**。

## 用户语境

这是开源 macOS 桌面 app(Ensemble v2.1.2),用户群:Claude Code 用户(技术 audience,但**不该被要求懂代码错误**)。任何修复涉及用户可见行为时,"User sees" 必须是普通话不是 Rust error。
