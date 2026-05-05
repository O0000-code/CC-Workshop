# Stage 4 — 持久化内容评审

> 审本次 Session 落盘的 5 条项目 Rule + 6 处 Memory 变更，按六维度严格审计。
> 评审基线：`/Users/bo/.claude/CLAUDE.md` + 9 条全局 Rule + `persistence-system.md` 决策标准。
> 评审日期：2026-05-04。

---

## Rule 评审（逐条）

### Rule 1 — `fallback-path-must-be-unreachable-in-test.md`

**普适性**：**PASS**。规则核心"测试 build 下生产路径必须物理不可达"独立于任何技术栈——Rust `cfg(test)`、Node `NODE_ENV=test`、Python `PYTEST_CURRENT_TEST` 都被显式枚举。Why 段虽用本次事件作具体证据（categories `A/B/C` / `#000000` 颜色），但"positive guarantee → negative guarantee"的方法论抽象是脱本次事件成立的。下次任何"home-dir-fallback / unwrap_or_else / 默认配置目录"模式触发，主 Agent 依此可行动。

**措辞精确性**：**PASS**。
- 触发条件明确：枚举了"Returns a default file path / Falls back to home / `env::var(...).unwrap_or_else(...)` / `fs::write` / 网络 / 外部 process"四类。
- 动作具体：给出了 Rust 完整代码模板 + Vitest/pytest 等价形式 + `#[should_panic]` 回归守卫。
- 无歧义词。一条小瑕：line 11 "physically unreachable under test build" 的"physically"在跨语言下其实是逻辑不可达（Python 没有编译期），但 line 43-44 已显式给出 `process.env.NODE_ENV === 'test'` 等运行时判定，整体不致误读。

**enable-over-constrain**：**PASS**。删掉后下次坏事具体：SubAgent 写测试漏 set `ENSEMBLE_DATA_DIR`，fallback 静默写真实 `~/.ensemble/data.json` 覆盖用户数据。已实证。Rule 是工具不是束缚——它把"忘了 set"从可能性彻底删除。

**重复**：**PASS**。grep `~/.claude/rules/` 与 `~/.claude/CLAUDE.md` 全无"测试隔离/cfg(test)/fallback path"主题。与 `Global Rules.md`（"先调查后回答"）领域不同（一个是回答前调研，一个是写测试隔离）。

**paths frontmatter**：**不需加**。规则适用于"任何函数若可写真实文件/网络/DB/外部资源"——这类函数广泛分布于 `src-tauri/src/` 和 `src/utils/`，没有窄路径前缀可枚举。无条件加载（当前形态）合适。如果硬要加 `paths`，只能限制为 `**/*test*` / `**/tests/**` / `**/*.test.ts`，但这会丢掉"在写生产函数时也要触发本规则"的关键覆盖（添加 cfg(test) panic 是修生产函数）。

**修订建议**：**无**。

---

### Rule 2 — `cross-document-cascade-discipline.md`

**普适性**：**PASS（含一定项目耦合，但不致命）**。
- 规则核心"修订 Decisional 文档时声明 cascade footprint + 跨阶段独立 alignment SubAgent"完全独立于本项目领域——对学术综述、PRD、API doc spec 都适用。
- Why 段引用了 `02_design_spec.md` / `03_tech_plan.md` / `04_implementation_plan.md` 文件名 + T8/T13b 任务 ID + "X=0 DragOverlay bug" 等本次特例细节，构成强项目色彩。但本质是作为 evidence 而非 spec 内容，未把规则本身耦合到本项目。
- 下次"V2→V3 学术综述修订" / "PRD 多版本迭代" 触发时主 Agent 仍能依此行动（"对齐 SubAgent + Revision History"是动作）。

**措辞精确性**：**PASS**。
- 触发条件明确：line 18 "Two or more Decisional-tier documents have been revised to a new shared version (V_n → V_{n+1}) and the next phase is about to start"。
- 动作具体：Action 1（Revision History 含 cascade 列表）+ Action 2（独立 alignment SubAgent，单一职责）。Action 2 还显式区分"对齐 SubAgent ≠ 内容评审 SubAgent"避免合并误用。
- 无歧义词。

**enable-over-constrain**：**PASS**。删掉后下次坏事具体：主 Agent 修完 V3 spec 但漏改 implementation plan T8 modifiers / T13b acceptance #4-#8，T1 实施 SubAgent 按 V2 配置实施 → 重现 V2 P0 bug，回滚 4-6 小时。已实证。

**重复**：**PASS**。规则 line 14 显式声明与 `~/.claude/rules/document-authority-ranking.md` 是**互补关系**（authority 解决"谁说了算"；cascade 解决"修一处后谁要跟着改"），引用准确。grep 全局 Rule，无其他重叠。

**paths frontmatter**：**不需加**。规则触发是"项目状态"而非"文件内容"——主 Agent 在做修订/进入下一阶段时主动 trigger，与 paths 模式不匹配。无条件加载合适。

**修订建议**：**无**（项目色彩在 Why 段属可接受范围，规则本身已脱离）。

---

### Rule 3 — `verify-third-party-behavior-firsthand.md`

**普适性**：**PASS**。
- 规则核心"第三方库行为需读源码/类型签名验证，不信文档/注释/训练记忆"完全跨语言、跨域适用。
- Why 段虽用 dnd-kit `defaultTransition` 作具体证据，但抽象（"documentation lies, tutorials are out of date, comments rot, training memory is two generations behind"）是本次事件之外都成立的事实陈述。
- line 13 显式声明与 `academic-reference-verification.md` 是 peer 关系（"same principle, different artifact"），跨域 evidence 已埋下种子。

**措辞精确性**：**PASS**。
- 触发条件明确：line 17-21 列举三种 trigger 形态（"provided by X" / 非 trivial 第三方 API / 默认值假设）。
- 验证物（artifact）三选一明确：`node_modules/<lib>/<dist>:line` / `.d.ts` 类型 / 最小复现脚本。
- 动作具体到"如果不能链 source 时，注释必须 explicit 写 `// TODO verify`"——这条非常重要，把"comments lie" 闭环。

**enable-over-constrain**：**PASS**。删掉后下次坏事具体：spec 阶段按文档/tutorial/training memory 假设库行为，下游撞墙——本次磁吸事件实证（spec 假设"DragOverlay 提供 intrinsic CSS transition"，实际 dnd-kit v6.3.1 鼠标拖拽下 `defaultTransition` 返回 undefined，1.5h 返工 + 三轮修订）。

**重复**：**PASS（互补关系已显式声明）**。
- 与 `Global Rules.md` "Investigate Before Answering"：line 11-12 显式说"Global rule 覆盖回答前调查；本条覆盖 spec/code 写之前的验证"，不同 phase 不重叠。
- 与 `academic-reference-verification.md`：line 13 显式说"peer，同原则不同 artifact"。
- 显式声明的互补是 persistence-system.md 鼓励的写法。

**paths frontmatter**：**不需加**。触发是"写 spec 或写代码引用第三方"，跨 spec md 文件 + 几乎所有源码文件，无窄路径可枚举。

**修订建议**：**无**。

---

### Rule 4 — `validate-numerical-equivalence-claims.md`

**普适性**：**PASS**。
- 规则核心"数值等价声称必须有数学复现 evidence；无复现退到定性"独立于本次动效场景——任何 benchmark 比较、信号处理、参数转换、跨框架/版本"等价"措辞都触发。
- Why 段虽用 cubic-bezier vs spring 作具体证据，但 line 5-6 "Numerical equivalence is a precision claim. Precision claims propagate" 是脱本次事件的方法论抽象。
- "RMSE > 5% 或 max diff > 10% 视为不可等价"是工程惯例的合理阈值，跨场景可移植。

**措辞精确性**：**PASS**。
- 触发条件明确：line 21-25 列举四类 trigger 措辞（"X is equivalent to Y" / "matches" / "= Y" / "replaces" + 跨库参数等价表 + 迁移注释）。
- 动作具体：Reproduce → Measure (RMSE + max diff) → Threshold (5%/10%)。
- "Honest retraction is the correct move, not a defect" 这条态度立场表达准确——避免"加更多数字让虚假精确变真"这一常见反模式。
- line 33 "keep the previously-claimed numbers as 'informational reference, not equivalence', clearly labeled. Do not silently delete" — 撤回时的 spec hygiene 也覆盖。

**enable-over-constrain**：**PASS**。删掉后下次坏事具体：spec 写"spring(500/40) 与 cubic-bezier(0.16,1,0.3,1) 等价"，下游开发者按等价做替换，实际 RMSE 20% / 最大差 48% / 视觉时间差 65%——团队成员被错误 spec 误导，引发更深的下游 bug。已实证。

**重复**：**PASS**。
- 与 `verify-third-party-behavior-firsthand.md`：line 39-40 显式声明"latter verifies what the library actually does; this one verifies that two numerical descriptions you wrote actually mean the same thing"——两条规则针对的对象不同（库行为 vs 你自己写的两个数值描述），互补不重叠。
- 与 `academic-reference-verification.md`：领域不同（学术 citation 是 metadata 验证，本条是数值等价验证）。

**paths frontmatter**：**不需加**。触发是 spec/comment/commit 中的措辞模式，跨多种文件类型，无窄路径可枚举。

**修订建议**：**无**。

---

### Rule 5 — `grep-before-enumerate-shared-resource.md`

**普适性**：**PASS**。
- 规则核心"规划共享资源约束前必须 grep 数据访问 API"独立于具体资源类型——data file / DB / 全局状态 / 配置 / 审计日志全适用。
- Why 段引用本项目 `claude_md.rs` / `trash.rs` / `read_app_data` / `write_app_data` 等具体名作 evidence，但本质规则是"列文件 vs 列 API 调用"的方法论分野，跨项目成立。

**措辞精确性**：**PASS**。
- 触发条件明确：line 15-21 列出五类 trigger 短语（"Apply to every X" / "All Y must Z" / "Wrap every callsite of W" / "Audit all paths" / "Add validation at every entry point"）。
- 动作具体：1. Identify API name → 2. Run grep（含具体命令）→ 3. Treat grep output as authoritative → 4. Re-run at completion + verification step in plan + implementation SubAgent re-grep。
- 无歧义。

**enable-over-constrain**：**PASS**。删掉后下次坏事具体：主 Agent 按"我看过 commands/data.rs 那里有 5 个 mutating fn"心智模型枚举锁覆盖范围，漏 `claude_md.rs` / `trash.rs` 对同一 `data.json` 的 mutation；并发 reorder + import 产生 lost update（生产 bug）。已实证（code reviewer 拦下，否则进生产）。

**重复**：**PASS**。
- 与 `hard-constraints-before-soft-evaluation.md`：line 40 显式声明"methodologically sibling: both are 'do step N before step N+1 to avoid silent omission'. They apply to different phases"——不同阶段（评估 vs 规划），不重叠。
- 与其他 8 条全局 Rule 无重叠。

**paths frontmatter**：**不需加**。触发是"规划共享资源约束"这种 task type，不绑定特定文件路径。

**修订建议**：**无**。

---

## Memory 评审（逐条）

### Memory 1 — `feedback_ensemble_commit_quality.md`（新建）

**与已有重复**：**PASS**。grep `MEMORY.md` 和 `~/.claude/CLAUDE.md`，commit message 质量主题在 user CLAUDE.md 完全没有；现有 `feedback_no_pr_for_personal_changes.md` 只说"跳过 PR 流程"，未涉及 commit 措辞质量。两条互补关系已通过 Memory 7（cross-ref）显式声明。

**类型选择**：**PASS**。frontmatter `type: feedback`——是用户在 Session 中明确表达的偏好（U1：开源项目升格后 commit 推送需要写得清晰、精细一点），符合 persistence-system "User correction or preference learned in session → Memory"。

**项目级 vs 全局**：**PASS**。Body 末尾明确"此偏好仅适用于 Ensemble 当前阶段；项目重新私有化或受众变更后需 re-confirm"——边界声明清晰，未误升全局。

**Body 内容**：**PASS**。Why 段有 U1 原话引用；How to apply 给出可操作清单（4 条）；与配对 Memory 的关系通过 line 15 明确 `feedback_no_pr_for_personal_changes.md` 互补。

**修订建议**：**无**。

---

### Memory 2 — `project_ensemble_design_standard.md`（新建）

**与已有重复**：**PASS**。grep `MEMORY.md`，原本完全没有设计语汇 / 动效标准相关条目；与 `~/.claude/CLAUDE.md` Constitution 也无重叠（Constitution 是元规则，本条是设计基线）。

**类型选择**：**PASS**。frontmatter `type: project`——五锚点（考究/精致/细节/克制/物理级动效）是 Ensemble 项目质量基线，符合 persistence-system "Project phase status or progress tracking → Memory"。

**项目级 vs 全局**：**PASS**。Body 中"涉及 UI/动效任务时显式按下列做"边界明确为 Ensemble UI/动效任务；五锚点是项目特有词汇，不可外推到 CLI 工具或数据脚本项目。

**Body 内容**：**PASS（有一条小瑕）**。Why 段引用 U3 用户原话；How to apply 五条均可操作（物理级动效 / 磁吸软引力 / 状态转换 / 克制 / 考究）。
- 小瑕：line 13 "spring 参数（stiffness/damping）需有数值复现支撑，禁止拍脑袋数字（参考 `validate-numerical-equivalence-claims.md`）" 这个内嵌 cross-ref 是项目 Rule 路径而非全局；要让未来 Session 加载时能找到，前提是项目 Rule 仍在 `.claude/rules/`——目前确实在。OK。
- 同 line 14 引用 `verify-third-party-behavior-firsthand.md` 项目 Rule，类似考虑。

**修订建议**：**无**（cross-ref 路径正确）。

---

### Memory 3 — `feedback_research_before_bug_fix.md`（新建）

**与已有重复**：**PARTIAL**。
- 与 `Global Rules.md` "Investigate Before Answering" 存在**精神重叠**——后者覆盖"回答问题前调研"。Body line 16 显式声明互补："那条覆盖回答问题，本条覆盖修代码"——区分明确：回答 vs 修复 bug 是不同动作类别。
- 与 CLAUDE.md §一.4 "理解→调研→规划"的 generic 流程也精神重叠，但本条专门 bug fix 子场景。
- 互补关系已声明，可接受。

**类型选择**：**PASS**。frontmatter `type: feedback`——用户 U5 明确表达"先调研分析设计"否定主 Agent 的 patch 反应模式。

**项目级 vs 全局**：**PASS**。仅本次单一项目证据，按 persistence-system 默认 project，body 隐含未提全局升格。

**Body 内容**：**PASS**。Why 段三层根因（modifier 钉死 + DragOverlay 无 transition + 注释撒谎）举证充分；How to apply 四条可操作。

**修订建议**：**无**（与 Global Rules 的边界已明确划分）。

---

### Memory 4 — `project_ensemble_pragmatic_execution.md`（新建）

**与已有重复**：**PASS**。MEMORY.md 无相关条目；CLAUDE.md "全然自主性"是元规则，与"Path B 开工标准"+"不补救专注预防"是不同维度。

**类型选择**：**PASS**。frontmatter `type: project`——是 Ensemble 项目阶段决策风格。

**项目级 vs 全局**：**PASS（这是关键审视点）**。Body line 20 明确"**关键边界**：这条偏好**只适用于 Ensemble**（单人 + 小数据量）。**不可外推到团队/客户/生产数据库项目**——团队项目里 Path B 留 P1 给下游 SubAgent，会因 SubAgent 没有同等上下文而误解；生产数据库丢失，恢复优先级远高于'修预防'"。这是高质量的边界声明，明确防止误用。

**Body 内容**：**PASS**。两条偏好（Path B 务实开工 + 不补救专注预防）合并为一个 project Memory 是合理选择——它们共享同一个项目特性根源（单人 + 数据可重建）。

**修订建议**：**无**（边界声明非常到位）。

---

### Memory 5 — `feedback_decision_with_recommendation.md`（新建）

**与已有重复**：**PASS**。CLAUDE.md "主动推演" / "全然自主性" 隐含此态度但未具体到决策请示形态；本条是其具体化（含模板）。

**类型选择**：**PASS**。frontmatter `type: feedback`——用户 U8 在 V3 评审决策接受了"自主+请示"混合形态。

**项目级 vs 全局**：**PASS（边界稍宽但稳妥）**。Body line 18 "适用范围：所有用户决策点。当前证据来自本次 Session，先按 feedback 类（项目级）记录；下次类似交互再确认是否升 user 类"——明确按 persistence-system "默认项目级，多次证据后再升级"路径。

**Body 内容**：**PASS**。Why 段有 U8 决策上下文；How to apply 给出"决策请示模板"4 行——这是该类 Memory 中**最可操作**的形态之一。"不带倾向的请示是异常"明确边界。

**修订建议**：**无**。

---

### Memory 6 — `MEMORY.md` 更新（追加 2 条 patterns + 重组 Topic memories 段）

**与已有重复**：**PASS**。
- 新追加的 dnd-kit listeners chain pattern 与现有 Patterns 段三条 Serde 相关（`#[serde(default)]` / HashMap / `if let Ok`）领域不同。
- Rust HashMap iteration order 与上述也无重叠。
- 重组 Topic memories 段为"Project state & quality bar" + "Workflow feedback" 两小节是结构调整，原有索引（如 `feedback_no_pr_for_personal_changes.md`）保留。

**Body 内容**：**PASS**。两条新 patterns 都包含三件事：(1) pattern 描述；(2) 反例陷阱；(3) 实证背景（本次踩过 / code reviewer 才发现）。这种"踩过一次的实证"正是 Memory 的价值所在（避免下次重踩），符合 persistence-system "Debugging insight or workflow pattern discovered → Memory"。

**MEMORY.md 总长度核查**：当前 50 行，远低于 200 行 cache 友好上限。OK。

**修订建议**：**无**。

---

### Memory 7 — `feedback_no_pr_for_personal_changes.md` 末尾追加 cross-ref（更新）

**与已有重复**：**N/A**（cross-ref 本身就是消除重复歧义的机制）。

**Body 内容**：**PASS**。新追加 line 16 "**Important pairing**: skipping PR ceremony does NOT lower the standard for the commit message itself. Ensemble is now an open-source project with users; commit messages must still be reader-facing and precise. See `feedback_ensemble_commit_quality.md`." 这条 cross-ref 直接防止下次主 Agent "看到不走 PR 就误以为 commit 也可以草草写"的失败模式。

**修订建议**：**无**。

---

## "不保存"清单审视

读 `session_review_s2_do_not_save.md` 13 项后逐条核验：

### 应保存但被遗漏？

**无**。13 项中：
- #1 dnd-kit 行为细节 → 落 `06_snap_research.md`，**版本耦合**理由成立（dnd-kit 升级行号失效），不该 Memory。
- #2 12px / 0.18 lerp 魔法数字 → 落代码注释，**容器/DPI 耦合**理由成立，不该 Memory。
- #3 apply_reorder 算法 → 落代码 + 12 测试，理由成立。
- #4 V1→V2→V3 修订路径 → 落 `_archive/v1` `_archive/v2` + Revision History，**事件 vs 方法论**区分清晰：方法论已通过 R2 cascade discipline 提取。
- #5 commit `116bdda` → git log 已含；方法论已通过 R1 cfg(test) panic 提取。
- #6 Tauri+dnd-kit 集成 → 8 个 Sortable 组件源文件已是参考实现。
- #7 5/3/1 SubAgent 阶梯数字 → 数字本身不可迁移，理由成立。
- #8 用户接受 Path B / 拒绝恢复 → **抽象成偏好**已通过 Memory 4 处理。
- #9 snapModifier 完整代码 → 源码 + 调研文档双份，不需 Memory 复制。
- #10 DATA_MUTEX 文件清单 → 方法论通过 R5 grep-before-enumerate 提取。
- #11 SubAgent 角色名 → 应是 Skill 不是 Memory。
- #12 用户设计词 → **已**通过 Memory 2 项目级处理（不该上全局），决策正确。
- #13 完整时间线 → `_session_summary.md` 已含。

每一条理由都按"代码已含 / git 已含 / Rules 已含 / `.dev/` 已含 / 应去其他载体（Skill）/ 已在 Memory 中"五种合法去向之一处理，结构齐全。

### 不该保存但被保存？

**无**。逐条核验：
- Memory 1（commit quality）：用户偏好，纯偏好语义，源码无法表达。
- Memory 2（design standard）：项目质量基线，源码无法表达。
- Memory 3（research before bug fix）：工作模式偏好，与 Global Rules 互补关系明确。
- Memory 4（pragmatic execution）：项目阶段判断风格，边界声明明确。
- Memory 5（decision with recommendation）：用户偏好显式表达，模板化 actionable。
- Memory 6（MEMORY.md 追加）：踩过的具体语言/库陷阱，正是 Memory 的设计目标。
- Memory 7（cross-ref）：消除歧义的元数据，纯互补。
- 5 条 Rule 全部满足"违反代价已实证 + 不重复 + enable-over-constrain"门槛，无误升 Rule。

### 边缘审视：是否有"应该 Rule 但被错落 Memory"或反之？

**无**：
- Memory 3（research before bug fix）：审视过 Rule 化路径，但 Stage 2D 已判定"与 Global Rules 部分重叠 + 偏向用户偏好性质 + 仅项目单次证据"——走 Memory 优于 Rule。复审认同此判定。
- Memory 5（decision with recommendation）：审视过 Rule 化路径，但目前仅本次单一交互证据，按"默认 project Memory，多次证据后再升 user CLAUDE.md"路径稳妥。复审认同。

---

## 总体结论

- **Rule 通过**：5/5（R1-R5 全部通过五维度审计）
- **Memory 通过**：6/6（Memory 1-6 全部通过五维度审计 + Memory 7 cross-ref 通过）
- **需修订**：0 条
- **建议第二轮的项**：无
- **是否可以宣布 Session Review 完成**：**YES**

### 关键观察

1. **5 条 Rule 全部正确判定为 project scope，无误升 global**——符合 persistence-system "默认项目级，多项目证据后再升级"严格门槛。Rule 中显式声明的与 Global Rules / academic-reference / hard-constraints / document-authority 的"互补关系"全部精确（不是过度自我合理化的 buzzword 挂靠）。

2. **6 处 Memory 变更全部含明确边界声明**：`feedback_ensemble_commit_quality.md` / `project_ensemble_pragmatic_execution.md` 都有"仅适用于 Ensemble"的明示，避免误外推。这是 Memory 写作的高质量示范。

3. **"不保存"清单 13 项的每条理由都按合法去向 (代码 / git / Rules / `.dev/` / Skill / 已 Memory) 处理**，无遗漏。

4. **唯一可考虑的边缘提醒（不构成修订）**：Memory 2 (design_standard) 内嵌引用了两条项目 Rule 的相对路径（`validate-numerical-equivalence-claims.md` / `verify-third-party-behavior-firsthand.md`）——目前路径正确，但若未来项目 Rule 移动 / 重命名，需手动更新 Memory 2 的引用。这是后续维护提醒，不是当前缺陷。

5. **本次 Session Review 整体质量**：Stage 2D（Rule 候选）+ Stage 2E（Memory 候选）+ Stage 2F（不保存）三份产出之间的逻辑闭环非常清晰——Rule 候选与 Memory 候选互不重叠、不保存项与保存项之间的边界精确、所有判定都按 persistence-system.md 严格门槛。Stage 3 落盘忠实执行 Stage 2 决议，无走样。
