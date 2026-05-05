# Stage 4 — 评审与修订（Category Hierarchy Session）

> **审本次 Session 阶段 3 落盘的内容**：4 条项目/全局 Rule（MOD-1 / MOD-2 / MOD-3 / NEW-1）+ 8 处 Memory 变更（4 新建 + 3 修订 + 2 处 MEMORY.md 内修订）。
>
> **评审基线**：`/Users/bo/.claude/CLAUDE.md` Constitution + 9 条全局 Rule + `persistence-system.md` 决策标准 + `document-authority-ranking.md` + 阶段 1A/1B/1C 全部产出 + 阶段 2D/2E/2F 决议。
>
> **检查项**：A 普适性 / enable-over-constrain / B Rule 间冲突 / C Memory 冲突 / D "刻意不保存"清单合理性 / E paths frontmatter / F 措辞精确性。
>
> **评审日期**：2026-05-05.
>
> **评审轮数**：3 轮（第 1 轮发现 + 修订；第 2 轮自审 + 二次修订；第 3 轮最终复检）。

---

## 检查项 A：enable-over-constrain 审计

**核心问题**：每条新增 Rule + 修订段落，**如果未来 session 没读到这条，会发生什么？** 是 Agent 做得"更差"还是仅仅"不同"？

### A.1 NEW-1 `fix-must-define-user-observable-success.md`

- 删掉后 Agent 做得**更差**：本次实证三轮失败模式（console output 当作收敛代理 → push build → 用户报"没区别"），删掉本条后 fix 完成判定无任何防御。
- 已有 Rule 覆盖修前（research-before-bug-fix）/ 修中（verify-third-party-behavior），无修后 / push 前的 phase。
- **结论**：通过 enable-over-constrain。

### A.2 MOD-2 `plan-as-research-design.md` 三档分类

- 删掉后 Agent 做得**更差**：本次"误用 sidebar-reorder 创造性范式套到结构性扩展任务"是 8h / $400 浪费的根因，删掉本条后下次同类任务复发概率高（用户明确反馈"$400 太夸张"）。
- 三档分类 + Tier Judgment Heuristic 是高 leverage 元决策——影响整个项目流程而非单个动作。
- **第 1 轮发现的潜在问题**：三档分类例子全部偏软件 UI 工程，可能让其他领域 agent 难以映射。
- **第 1 轮修订**：每个 tier 增加 1 个学术领域例子（theoretical review / literature review / citation correction）。
- **结论**：通过 enable-over-constrain。

### A.3 MOD-1 `cross-document-cascade-discipline.md` 扩展 cascade scope

- 删掉后 Agent 做得**更差**：本次实证 doc comment + 测试名漏修（types.rs:247-262 / `test_advance_blocked_by_orphans_*`）。final_audit 拦下，否则 doc comment 永久 rotted。
- **第 1 轮发现的潜在问题**：5 类 binding artifacts 中 commit message body 和 SubAgent prompt templates 论据较弱（前者只是 reader confusion 不是 runtime bug，后者本次无证据）。
- **第 1 轮修订**：把 5 类拆分为"MUST-cover"3 条（强论据：.md / doc comments / test names）+ "Additionally, when applicable"2 条（弱论据：commit message / SubAgent prompt templates）+ 弱论据明示其代价（reader confusion / future SubAgent staleness risk）。
- **第 2 轮发现新问题**：拆分后 "two MUST-cover" 措辞与列了 3 个矛盾。
- **第 2 轮修订**：删除 "two"，统一为 "MUST-cover artifacts"。
- **结论**：通过 enable-over-constrain（修订后强 / 弱论据分层清晰）。

### A.4 MOD-3 `plan-document-style.md` 1500 行硬上限

- 删掉后 Agent 做得**更差**：本次实证 03 V2 3602 行（2.4x baseline），SubAgent 必读时跳读 → 关键决策被 skim 过 → 6 个 V1 reviewer 找 22 P0。Hard limit 是切断这个循环的方式。
- "1.5x 警报"机制保留弹性——超 1500 不一定是错，但触发自检。这是合理的"下限提示而非上限批准"措辞。
- **结论**：通过 enable-over-constrain。

### A 类总结

4 条 Rule 全部通过 enable-over-constrain 审计（修订后）。每条删除后 Agent 都会做得更差（已实证或可推），不是仅仅"不同"。

---

## 检查项 B：Rule 间冲突检测

### B.1 plan-as-research-design.md (global) vs plan-document-style.md (project)

- 前者描述"研究设计 → 综合 gate → 实施"层次结构（动作类）
- 后者描述"文档体量纪律"（size 类）
- 两者方向不同——一个是"做什么"，一个是"写多长"。**不冲突**。
- 边界检查：Creative tier "6+ stage pipeline" × 1500 行/份 = 9000+ 行总产出，仍是 multiplicative 关系；plan-document-style.md 仅约束 plan/spec/tech plan 三类文档，不约束研究 artifacts（R1-R7 等），不冲突。
- **结论**：不冲突。

### B.2 cross-document-cascade-discipline.md vs verify-third-party-behavior-firsthand.md

- 两者**都涉及 doc comments 的 stale claim 问题**——表面重叠。
- 但实质区别：
  - verify-third-party-behavior-firsthand：**写时**的 gate（写 doc comment 时必须有源码引证或 TODO 标记）
  - cross-document-cascade-discipline：**修时**的 gate（修订 spec 后 grep 反向匹配 stale doc comment）
- 不同 phase 责任，不冲突。
- **可选优化（非必须）**：cross-document-cascade-discipline 末尾可加 cross-ref 显式划分边界。但当前措辞"comments that paraphrase a spec rule become a stale claim"已暗示了这一区别，不强求显式 cross-ref。
- **结论**：不冲突。

### B.3 plan-document-style.md "1500 行" vs plan-as-research-design.md "Creative tier 6+ stages"

- Creative tier 6+ stages 中每份 spec ≤ 1500 行，总产出仍为 multiplicative，不构成强制压缩。
- V3 sidebar-reorder（真正 Creative 任务）的 02_design_spec ≈ 1300 行 < 1500，作为 baseline 验证可达性。
- **结论**：不冲突。

### B 类总结

3 个潜在冲突点全部经实质检查后判定为不冲突。Rule 之间的责任边界清晰。

---

## 检查项 C：Memory 冲突检测

### C.1 `feedback_phase_review_loop.md` 修订后是否真的解决"标题与正文矛盾"？

- frontmatter `name`: "End-of-implementation single expert review (not phase-by-phase)" ✓
- frontmatter `description`: 末端单审 + Phase 间只跑自动化 gate ✓
- 正文：整体完成后 + Phase 间不重复派 reviewer ✓
- 末尾保留 Session 1 初稿全文 + "已修正" 标签 + 矫正说明 ✓
- **结论**：解决。修订一致，name + description + body 全部对齐"末端单审"。

### C.2 `feedback_research_before_bug_fix.md` 加边界 vs `feedback_user_test_outranks_reviewer.md` 是否冲突？

- research-before-bug-fix：用户报感受类反馈 → 派调研 SubAgent（除非用户已给根因）
- user-test-outranks-reviewer：用户实测反馈优先于 reviewer 清单
- 两者**配合**：user-test-outranks-reviewer 决定**优先级**（先做用户的，再做 reviewer 的）；research-before-bug-fix 决定**第一动作**（派调研 SubAgent，除非已给根因）。
- 互补，不冲突。
- 与 verify_fix_actually_applies 形成"用户反馈 → 调研根因 → 修复 → 验证"完整链路。
- **结论**：不冲突。

### C.3 `feedback_calibrate_research_depth_to_task.md` 与 Global Rule `plan-as-research-design.md` 三档分类是否冗余？

**第 1 轮发现**：**严重冗余**。Memory 完整复制 Rule 内容（三档分类定义 + 实施模式 + 强先例判定），构成双源问题。

**第 1 轮修订（P0）**：
- Memory 顶部明确指向 Rule："generic 定义看 Rule plan-as-research-design.md"
- Memory 改为"项目特定实例化 + 用户反馈证据"
- 三档表格保留但只列"本项目示例"列，不重复 Rule 的"Planning Depth"列
- 加 "Ensemble 的'强先例'信号"段——project-specific 内容（V3 不变量 / dnd-kit Tree example / 9 处 dropdown）

**第 2 轮发现**：第 1 轮修订后 Memory 仍保留"实施模式"简化列，与 Rule 的"Planning Depth"轻微重叠（虽不致 drift 灾难）。

**第 2 轮修订（一致性优化）**：
- 删除"实施模式"列，让 Memory 三档表格只剩 "Tier" 和 "本项目示例" 两列
- 表格标题加 "具体 Planning Depth 措辞以 Rule 为准"

**第 3 轮复检**：双源问题已解决。Rule 给 generic 定义 + 通用 heuristic，Memory 给 project-specific instances + user-feedback evidence。两者职责清晰互补。

- **结论**：第 1 轮发现 P0 冗余 → 第 1 轮 + 第 2 轮修订后清晰互补。

### C.4 其他 Memory 修订/新建条目检查

- `feedback_verify_fix_actually_applies.md`（新建）：与 feedback_research_before_bug_fix.md 互补（前修 vs 后修）；与 Global Rules.md 互补（回答 vs fix）。措辞精确，无冲突。
- `feedback_user_test_outranks_reviewer.md`（新建）：与 feedback_research_before_bug_fix.md + feedback_verify_fix_actually_applies.md 三角配合。无冲突。
- `reference_design_documentation_locations.md`（新建）：纯路径索引；与 design-language.md Rule 互补；无冲突。
- `project_ensemble_pragmatic_execution.md`（修订加反向触发条件）：与 feedback_calibrate_research_depth_to_task.md 互补（"评审完后开工" vs "评审本身要不要那么深"）。
  - **第 1 轮发现**：description 字段未反映新增"反向触发条件"。
  - **第 1 轮修订（P2）**：更新 description 加 "tasks with strong V3-grade precedents must NOT auto-launch the full V1/V2/V3 review cycle"。
- MEMORY.md 索引：3 段（Project state / Workflow feedback / Reference / index）+ Build & Deploy 段加 "用户偏好（实测期间）" bullet。结构清晰，索引全部链接到实际文件。

### C 类总结

C.3 发现严重冗余（Rule/Memory 双源），通过 2 轮修订彻底解决。其他冲突点无问题。

---

## 检查项 D："刻意不保存"清单合理性

### D.1 边缘 case 3 个的判断合理性

- **Edge-1 _risk_distillation.md**：阶段 2F 建议"暂不立"。但 MOD-2 已经把它纳入 plan-as-research-design.md "Two artifacts at Synthesis Gate" 段——已落地。Edge case 决议自然消化。
- **Edge-2 symmetric inverse operation Rule**：阶段 2D 决定不立独立 Rule（合并入 _risk_distillation 应识别的 risk pattern）；阶段 2F 也建议"项目级 Rule"——两者结论略有出入，但 stage 2D 优先（更接近最终决议层）。MOD-2 修订已纳入。
- **Edge-3 评审 SubAgent 数量随 P0 收敛缩减**：阶段 2F 决定"暂不立"，让位 MOD-2 的三档分类。MOD-2 的 mid-task signals 已能间接覆盖（"multiple reviewers all return findings of the form 'this P0 was already addressed in research'"是同一类信号）。
- **结论**：3 个 edge case 决议合理，已被 MOD-2 间接覆盖。

### D.2 应该保存但被遗漏？

逐条核验阶段 2F 32 项：

- 类别 A 8 条：均已在代码 / spec 中体现。验证通过。
- 类别 B 3 条：均 git 历史可查。验证通过。
- 类别 C 8 条：均 CLAUDE.md / 现有 Rules 已覆盖（且本次已通过 Rule 修订增强 — 如 MOD-1/MOD-2 已扩展现有 Rule 的 scope）。验证通过。
- 类别 D 6 条：均临时调试态。验证通过。
- 类别 E 4 条：均可重新提取。验证通过。
- 类别 F 10 条：均太特定/长尾。验证通过。
- 类别 G 3 条：阶段 1C 已识别陷阱。验证通过。

**潜在审视**：dnd-kit closestCenter over === active 行为——阶段 2F A-2 论据是"R2 调研报告 + user MEMORY listeners chain pattern 已覆盖"。但实际 user MEMORY listeners chain 是关于 onKeyDown 的不同 dnd-kit trap。

但是阶段 2F 主要论据"R2 调研报告是 binding artifact"成立——R2 已对 dnd-kit 行为做完整源码引证，再写 Memory 是冗余。判定合理。

- **结论**：32 项不保存合理，无应保存被遗漏。

### D.3 不该保存但被保存？

逐条核验本次落盘的 4 新建 + 3 修订 + 2 处 MEMORY.md 内修订：

- 4 新建 Memory 全部有用户原话或反馈证据支撑（无凭空推断）。
- 3 修订 Memory 全部解决了 stage 1C 识别的具体问题（语义矛盾 / 加边界 / 加反例）。
- MEMORY.md 修订全部为索引同步。
- **结论**：无误升 Memory。

### D 类总结

阶段 2F 32 项不保存合理，3 个 edge case 决议合理（部分被 MOD-2 间接覆盖）。本次落盘 Memory 全部有据，无误升。

---

## 检查项 E：paths frontmatter 检查

所有 4 条 Rule 都没有 paths frontmatter（无条件加载）。逐条审：

- **MOD-1 cross-document-cascade-discipline.md**：触发是"修订 Decisional 文档进入下一阶段"——动作类触发，不是文件 read。无条件加载合适。
- **MOD-2 plan-as-research-design.md**：触发是"进入 Plan 模式"——同上，动作类触发。无条件加载合适。
- **MOD-3 plan-document-style.md**：触发是"撰写 plan/spec/tech plan"——这是 file write，paths 是 read-time match 不会 trigger。无条件加载合适。
- **NEW-1 fix-must-define-user-observable-success.md**：触发是"做 fix commit + push"——动作类触发，不是文件 read。无条件加载合适。

**结论**：所有 4 条 unconditional 加载恰当。无应加 paths 但被遗漏的。

---

## 检查项 F：措辞精确性

### F.1 NEW-1 三行契约

- "User action / Observable change / Anti-observation" 三行清晰。
- 三个例子（drag/indent/snap back）具体。
- "reasoning is not observation; reasoning is what produced the bug in the first place" 措辞精到。
- **第 1 轮发现潜在歧义**："User" 没明示是最终用户。
- **第 1 轮修订（P2）**：在 Trigger 段后加一句明确"User = 最终用户（end user who originally reported the problem）"+ 排除 developer / SubAgent / lead agent 三种 role。
- **结论**：第 1 轮修订后无歧义。

### F.2 MOD-2 三档分类的判定标准

- **第 1 轮发现潜在歧义**：三档分类的 Characterization 列描述抽象，但缺"开始时如何判定"的具体标准。
- **第 1 轮修订（P1）**：增加 "Tier Judgment Heuristic (How to Classify Before Launching)" 段——三个 ordered heuristic（强先例 / 首次建立标准 / 单维度变更），按 fits 优先选 lower-ceremony tier。
- **第 2 轮发现潜在歧义**："downgrade rather than upgrade"措辞 cryptic，可能让读者不知道指什么。
- **第 2 轮修订（澄清）**：改为 "prefer the lower-ceremony tier (Maintenance < Structural < Creative)" + 加一句解释 over-classification 是 invisible / silent failure。
- **结论**：第 1 轮 + 第 2 轮修订后判定标准明确。

### F.3 MOD-1 cascade scope

- **第 1 轮发现潜在歧义**：5 类 binding artifacts 论据强弱不一（commit message body + SubAgent prompt templates 弱）。
- **第 1 轮修订（P1）**：拆分为 "MUST-cover"（强论据）+ "Additionally, when applicable"（弱论据）。
- **第 2 轮发现新问题**："two MUST-cover" 与列了 3 个矛盾。
- **第 2 轮修订（措辞精确化）**：删除 "two"，统一为 "MUST-cover artifacts"。
- **结论**：第 1 轮 + 第 2 轮修订后措辞精确。

### F.4 NEW-1 触发条件

- 三条触发条件清晰（commit message + push step + runtime behavior change）。
- 有 "When This Does Not Apply" 段排除 refactor / 数据层 / 文档 / build tooling 四类——边界明确。
- **结论**：无歧义。

### F.5 Memory frontmatter description 字段精准性

- `feedback_phase_review_loop.md`：✓ 精确
- `feedback_research_before_bug_fix.md`：✓ 精确
- **`project_ensemble_pragmatic_execution.md`**：第 1 轮发现 description 未反映新增"反向触发条件"段。
- **第 1 轮修订（P2）**：更新 description 加 "tasks with strong V3-grade precedents must NOT auto-launch the full V1/V2/V3 review cycle"。
- `feedback_verify_fix_actually_applies.md`：✓ 精确
- `feedback_calibrate_research_depth_to_task.md`：第 1 轮修订后 description 改为 "Project-specific instantiations of the three-tier classification..."——精确反映 Memory 现在的"项目特定实例化"定位。
- `feedback_user_test_outranks_reviewer.md`：✓ 精确
- `reference_design_documentation_locations.md`：✓ 精确

### F 类总结

5 处措辞精确性问题全部经修订解决（多数在第 1 轮，部分在第 2 轮）。无遗留歧义。

---

## 修订记录

### 第 1 轮发现 + 修订（5 处）

| # | 优先级 | 问题 | 修订动作 | 影响文件 |
|---|---|---|---|---|
| 1 | **P0** | Memory `feedback_calibrate_research_depth_to_task.md` 与 Rule MOD-2 严重冗余（双源） | 重写 Memory 改为"项目特定实例化 + 用户反馈证据"形式，顶部明确指向 Rule | `feedback_calibrate_research_depth_to_task.md` |
| 2 | P1 | Rule MOD-2 缺"开始时如何判定档位"的具体标准 | 增加 "Tier Judgment Heuristic (How to Classify Before Launching)" 段——3 个 ordered heuristic + 跨档误用代价说明 | `~/.claude/rules/plan-as-research-design.md` |
| 3 | P1 | Rule MOD-1 cascade scope 5 类 binding artifacts 论据强弱不一 | 拆分为 "MUST-cover"（强论据 3 条：.md / doc comments / test names）+ "Additionally, when applicable"（弱论据 2 条：commit message / SubAgent prompt templates）+ 弱论据明示其代价边界 | `cross-document-cascade-discipline.md` |
| 4 | P2 | Memory `project_ensemble_pragmatic_execution.md` description 未反映新增"反向触发条件"段 | 更新 frontmatter description 加 "tasks with strong V3-grade precedents must NOT auto-launch..." | `project_ensemble_pragmatic_execution.md` |
| 5 | P2 | Rule NEW-1 "User" 未明示是最终用户 | 在 Trigger 段后加一句明确 "User = 最终用户" + 排除 developer / SubAgent / lead agent 三种 role | `fix-must-define-user-observable-success.md` |
| 附 | P3 | Rule MOD-2 三档分类例子全部偏软件 UI，跨域 agent 难以映射 | 每个 tier 添加 1 个学术领域例子（theoretical review / literature review / citation correction） | `~/.claude/rules/plan-as-research-design.md` |

### 第 2 轮自审 + 修订（2 处）

| # | 优先级 | 问题 | 修订动作 | 影响文件 |
|---|---|---|---|---|
| 1 | 措辞 | MOD-1 cascade scope "two MUST-cover" 措辞与列了 3 个矛盾 | 删除 "two"，统一为 "MUST-cover artifacts" | `cross-document-cascade-discipline.md` |
| 2 | 措辞 | MOD-2 "downgrade rather than upgrade" 措辞 cryptic，读者可能不知道指什么 | 改为 "prefer the lower-ceremony tier (Maintenance < Structural < Creative)" + 加一句解释 over-classification 是 invisible / silent failure | `~/.claude/rules/plan-as-research-design.md` |
| 3 | 一致性 | Memory `feedback_calibrate_research_depth_to_task.md` 三档表格"实施模式"列与 Rule "Planning Depth" 列轻微重叠（虽不致 drift 灾难） | 删除"实施模式"列，表格只剩 Tier + 本项目示例两列；加表格标题"具体 Planning Depth 措辞以 Rule 为准" | `feedback_calibrate_research_depth_to_task.md` |

### 第 3 轮最终复检（0 修订）

全部 12 个文件（4 Rule + 8 Memory）逐文件全文再读 → 修订一致 / 无新引入问题 / 无遗漏。

---

## 未解决项 / 待用户裁决

**无**。

所有 6 个检查项（A-F）的发现全部已通过 3 轮修订解决。3 个 edge case（_risk_distillation / symmetric inverse operation / review count decrease）已被 MOD-2 间接覆盖，决议一致。

---

## 关键观察

1. **第 1 轮发现的 P0 (C.3 Rule/Memory 双源) 是本次评审最重要的发现**——若不修订，未来 session 加载到两份相同内容时会困惑哪个为准；按 persistence-system.md "CLAUDE.md / Rules / Memory" 三层稳定性设计，Rule > Memory，Memory 不应复制 Rule 内容，仅记录 project-specific instances + 触发证据。修订后两者职责清晰互补。

2. **MOD-2 三档分类是本次最高 leverage 修订**——它直接预防本次 8h / $400 浪费的根本类型（误用范式套到结构性扩展任务）。第 1 轮加 Tier Judgment Heuristic 让 Rule 自包含（不依赖 Memory 才能判定档位），第 2 轮澄清 "lower-ceremony tier" 措辞，三档分类现在是可独立行动的 generic 元决策。

3. **MOD-1 cascade scope 强 / 弱论据分层是本次评审引入的措辞精度提升**——原 5 类 binding artifacts 一刀切，弱论据（commit message body / SubAgent prompt templates）会让 Rule 的"必须 grep"门槛过紧，导致执行成本反向增加。修订后拆分为 MUST-cover（3 条，全部有项目证据）+ Additionally（2 条，明示代价边界），让 Rule 的 actionable threshold 与实际收益匹配。

4. **修订后所有 4 条 Rule 各自独立可行动**——每条都明确：触发条件 / 必须动作 / 例外边界 / 项目证据 / 与其他 Rule 的关系。无 cryptic 措辞、无遗留歧义、无跨 Rule 冲突。

5. **8 处 Memory 变更全部含明确边界声明**：`feedback_calibrate_research_depth_to_task.md` 顶部指向 Rule + 项目实例；`project_ensemble_pragmatic_execution.md` 关键边界声明（"只适用于 Ensemble"）；`feedback_phase_review_loop.md` 反例提醒（Phase 1 数据安全例外）。这是 Memory 写作的高质量示范。

6. **paths frontmatter 不需添加**：4 条新增/修订 Rule 全部触发模式是"动作类"或"file write 类"，paths read-time match 模式不适用。Unconditional 加载恰当。

---

## 最终评审结论

**approved**

- 4 条 Rule 修订（MOD-1 / MOD-2 / MOD-3）+ 1 条 Rule 新建（NEW-1）：全部通过 enable-over-constrain + 措辞精确性 + 不冲突审计
- 8 处 Memory 变更（4 新建 + 3 修订 + 2 处 MEMORY.md 内修订）：全部通过双源 / 类型选择 / 边界声明审计
- 3 个 edge case 决议一致（被 MOD-2 间接覆盖）
- 32 项"刻意不保存"全部判定合理
- 无未解决项，无待用户裁决项

阶段 5（最终输出）可进。

---

## 给主 Agent 的简短报告

- **修订项数**：8（第 1 轮 6 处 + 第 2 轮 3 处，其中 1 处跨轮）
  - **P0** 1 处：Memory feedback_calibrate_research_depth_to_task.md 与 Rule plan-as-research-design.md 严重冗余 → 重写 Memory 为"项目实例化 + 用户反馈证据"
  - **P1** 2 处：MOD-2 加 Tier Judgment Heuristic + MOD-1 cascade scope 强 / 弱论据分层
  - **P2** 2 处：project_ensemble_pragmatic_execution.md description 更新 + NEW-1 "User"定义澄清
  - **P3** 1 处：MOD-2 三档分类例子加跨域举例
  - **第 2 轮措辞精确化** 3 处：MOD-1 "two MUST-cover" → "MUST-cover" / MOD-2 "downgrade rather than upgrade" → "lower-ceremony tier" + 解释 / Memory 三档表格删"实施模式"列保持一致性
- **拒绝项数**：0（所有候选拒绝项已在阶段 2D/2E 决议层处理）
- **未解决项数**：0
- **最终评审结论**：approved（阶段 5 可进）
