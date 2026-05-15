# Bug Audit 2026-05-15 — Review Plan

主 Agent 已亲自读完所有核心后端 + 部分前端 + 3 个大文件的 Explore 摘要 + 历史 bugfix-archive。基于这些一手理解,确定四条评审主线,并行发布 4 个 Reviewer SubAgent。

## 任务背景

Ensemble v2.1.2 已 release,主分支当前有 3 条 in-flight 工作:codeload-install-fix(已落 fix + 待跑 broad-sample 验证)、mcp-detail-audit、skills-detail-audit(后两个只做了排序锚定修复,详情面板 UI 未动)。

用户要求:像 web-goat 一样穷尽 bug,功能视角(不是写法理论),按置信度 + P0/P1/P2 分级。修改要准、要保守、要可控。

## 评审角度

四条主线,每个角度对应 1 个 Reviewer SubAgent。Reviewer 之间故意保留少量重叠,以便互验 P0(同一处 bug 被两个角度的 Reviewer 都点到 = 高置信)。

### R1 — 数据完整性 / 并发 / Sync 部署
覆盖:`data.rs` / `config.rs` / 所有 entity 的 delete + cascade + DATA_MUTEX 边界 / `sync_project_config` / `clear_project_config` / distribute_scene_*。
核心问题:并发竞态、orphan id、cascade 漏删、distribution path 不一致、partial sync 状态、用户数据保护。

### R2 — 安装 / 三种来源(local/plugin/marketplace) / Restore 一致性
覆盖:`marketplace.rs::install_*` + `finalize_*` / `import.rs::detect/import/scope` / `plugins.rs::detect/import` / `trash.rs::restore_*` / metadata snapshot。
核心问题:三条 restore 路径的 metadata 恢复是否一致、scope 字段语义、install_source 状态机、symlink-vs-copy 不一致。

### R3 — 错误处理 / 前后端契约 / 用户可见反馈
覆盖:所有 `let _ =` / `unwrap_or_default` / `eprintln` 静默失败模式 / `safeInvoke` 调用与 backend signature 对齐 / errors-in-Ok 模式 / Option<Option<T>> 三态映射 / Tauri serde 行为。
核心问题:静默失败让用户看到"成功"但实际部分失败 / 前后端 IPC args 名称、类型、shape 不匹配。

### R4 — 安全 / 输入验证 / Shell 注入 / 文件系统竞态
覆盖:`import.rs::launch_claude_for_folder`(AppleScript / Warp YAML 注入) / `install_quick_action`(硬编码路径) / 所有 path traversal 风险 / fs::rename 跨 fs 失败 / 符号链接 + race。
核心问题:用户路径含特殊字符导致 launch 失败 / 注入 / 跨 filesystem rename 失败 / 自创/手写文件被误删。

## 共同 Reviewer Contract

每个 Reviewer 必须:

1. **读完整 `02_known_risk_surfaces.md`**——主 Agent 已发现的 ~16 条 candidate。Reviewer 必须:
   - 对每一条主 Agent 已发现的 candidate **复核**(读代码,确认 / 否认 / 校正严重度)
   - 在自己的 angle 内**新发现**未列入的问题
2. **必读项目 Rules**:
   - `.claude/rules/fix-must-define-user-observable-success.md` — 每条 finding 必须能写出 "User does X / sees Y / does NOT see Z" 三行契约,否则不算 finding
   - `.claude/rules/verify-third-party-behavior-firsthand.md` — 任何 "library handles this" 不可假设
   - `.claude/rules/measure-before-iterative-tuning.md` — 任何 perf 类 finding 必须有 measurement,否则降级为 P3
3. **不要修改任何代码**——只产出 findings markdown。
4. **每条 finding 用以下格式**:

```markdown
### F{N}. {一句话标题}

- **置信度**: High / Medium / Low (主观但要给理由)
- **严重度**: P0 / P1 / P2 / P3
- **代码位置**: `path:line` (具体行号)
- **触发条件 (User does X)**: 用户做什么操作能触发
- **用户可见后果 (User sees Y)**: 用户看到什么(具体的——什么按钮、什么列表、什么文件、什么消息)
- **不可见后果**: 用户察觉不到但底层发生了什么(数据损坏、文件残留、悬空引用)
- **根因**: 一段话,引用代码
- **建议修复 / 不修复**: 给出明确建议;不修也要说明为什么不修(权衡)
- **修复保守度**: Safe(肯定无副作用) / Medium(可能影响其它路径) / Risky(需要小心)
- **复核状态**: 主 Agent 后续会复核,Reviewer 自己标 "self-confirmed" 或 "needs lead-agent verify"
```

5. **置信度量纲**:
   - **High**: 你已经亲自读代码 + 推演了具体输入 + 推演了具体观察 + 推断无误判
   - **Medium**: 代码看着像有问题,但需要 lead agent 在实际数据 / UI 中确认
   - **Low**: 怀疑,无法在代码层确定 — 应该列出但标 "needs lead-agent verify"

6. **严重度量纲**:
   - **P0**: 数据丢失 / 数据损坏 / 用户内容被静默删除 / 影响主流程(install / sync / scope 切换)失败且不可恢复
   - **P1**: 功能错误(显示错、行为错、不能用) / 错误未提示用户 / restore 失败 / partial state 后用户卡死
   - **P2**: UX 问题 / inconsistency / 罕见场景 bug / 性能差
   - **P3**: 代码质量 / 风格 / 未来 maintainability

7. **不要发现这些**(免疫,跳过):
   - 代码风格(命名、注释、format)
   - 没有具体触发条件的"理论上可能"问题
   - "应该加测试"
   - 推测性的 future regression
   - "可以更优雅"
   - 已经在 `02_known_risk_surfaces.md` 中列出且未质疑 / 提升严重度的 — 不要重复列(可以引用 + 校正)

## 产出要求

每个 Reviewer 产出独立文件:`{Rx}_findings.md`(R1/R2/R3/R4 各一份)。文件结构:

```
# {Rx} — {Angle Title} Findings

## 复核结果(对 02_known_risk_surfaces.md 中归我角度负责的 candidates)

(逐条 confirm / refute / adjust)

## 新发现

(按 P0 → P1 → P2 → P3 排序,每条按上面的 finding 格式)

## 总结
- 我个人最关注的 1-3 条(若用户只修这 1-3 条,影响最大)
- 我觉得不必修的 0-3 条(列入 candidate 但实际不算问题 / 影响极小)
```

Length cap:每个 reviewer ≤ 600 行(per `plan-document-style.md`)。如果超过 1000 行,Reviewer 自检是否在写"完整性证明"而非"决策支持"。

## Reviewer 调度

4 个 Reviewer **同一条消息内并行发布**(per Constitution § 6),全部使用 Opus,blocking(等返回)。

主 Agent 复核(Phase 5)前不进入 Phase 6。
