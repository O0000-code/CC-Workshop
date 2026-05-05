# Stage 2E — Memory 候选提取

> 输入：Stage 1A（10 返工事件）/ 1B（10 方法论模式）/ 1C（9 偏好）三份产出。
> 任务：按 `persistence-system.md` 决策表筛选可写入 Memory 的项；判定新建 vs 更新。
> 严格性：每条都做"门槛核验"（不能从代码推导 / 不与现有重复 / 类型选择正确）。

---

## 通过门槛的 Memory（推荐创建/更新）

### Memory #1 — `feedback_ensemble_commit_quality.md`（feedback 类）

- **决策**：新建
- **来源**：Stage 1C #1（PREF-COMMIT-QUALITY），用户原话 U1
- **完整 frontmatter**：
  ```
  ---
  name: Ensemble open-source-grade commit message quality
  description: Ensemble has external users now; commit messages and push notes must be clear, precise, and reader-facing — not casual one-liners
  type: feedback
  originSessionId: <本次 session id>
  ---
  ```
- **Body 草稿**：
  > Ensemble 已经从私人项目升格为有一定使用量的开源项目。所有 commit message 与 push notes 必须做到清晰、精细、面向外部读者，体现项目对外的可信度。短至 "fix: stuff"、"update foo" 这类草草措辞不再合适。
  >
  > **Why**: 用户在本次 Session 中明确表达"Ensemble 当前已经是一个有一定使用量的开源项目，所以提交的推送需要写得清晰、精细一点"（U1）。commit log 是开源项目对外的脸面之一；release note / changelog 也是从 commit message 自动提取。粗糙措辞会损害项目可信度。
  >
  > **How to apply**:
  > - commit message 至少包含：变更范围 + 变更内容 + (必要时) 变更动机。例：`fix(import): restore Warp new tab command launch when manifest defines spawn args` 而非 `fix import bug`。
  > - 涉及 user-visible 行为变化时，subject 要让最终用户能看懂；纯内部重构可以更技术化。
  > - 涉及 breaking change / 数据格式变更 / 配置迁移，必须在 body 段说明。
  > - 与 `feedback_no_pr_for_personal_changes.md` 配合：**不走 PR ≠ commit 也可以随意写**。直推 main 的便利不能降低 commit 自身的质量标准。
  > - 此偏好仅适用于 Ensemble 当前阶段；项目重新私有化或受众变更后需要 re-confirm。
- **MEMORY.md 索引行草稿**：
  - `- [Ensemble commit quality bar](feedback_ensemble_commit_quality.md) — open-source 升格后 commit/push 必须清晰精细，不再用草草一行`
- **门槛核验**：
  - 不能从代码推导：YES — 这是用户对项目阶段的判断 + 写作风格要求，纯偏好。
  - 不与现有重复：YES — `feedback_no_pr_for_personal_changes.md` 只说"不走 PR"，未涉及"commit 怎么写"。两条互补。
  - 类型选择正确：YES — feedback 类（用户在 session 中纠正/明确表达的偏好）。
- **不做 Global**：项目级是 Ensemble 阶段判断，不可外推到其他项目（其他项目可能仍是私有 / 团队协作走 PR）。

---

### Memory #2 — `project_ensemble_design_standard.md`（project 类）

- **决策**：新建
- **来源**：Stage 1C #2（PREF-DESIGN-STANDARD），用户原话 U3
- **完整 frontmatter**：
  ```
  ---
  name: Ensemble UI design standard — Apple/Linear/Things tier
  description: Ensemble UI/animation must hit product-grade quality with explicit anchors — 考究/精致/细节/克制/物理级动效, not "implementation works"
  type: project
  originSessionId: <本次 session id>
  ---
  ```
- **Body 草稿**：
  > Ensemble 的 UI 与动效目标是 Apple / Linear / Things 档次的产品级质量，不是 "acceptable" 级。用户明确给出五个评估关键词作为锚点：**考究、精致、细节、克制、物理级动效**（spring 曲线、磁吸、自然过渡、流畅）。
  >
  > **Why**: 用户在本次 Session 表达"考究、精致、细节、克制、物理级别动效（Spring 曲线/磁吸、自然、流畅等等）"（U3）。Ensemble 是设计驱动的桌面 App，而不是工具型 utility——动效 / 视觉差距直接转化为用户感知的产品价值。本次磁吸事件证明：默认按"实现功能即可"做出的动效（硬阈值 binary、固定时长、cubic-bezier 拍脑袋）会被用户当场打回。
  >
  > **How to apply** — 在 Ensemble 涉及 UI/动效任务时主 Agent 必须显式按下列执行：
  > - **物理级动效**：避免 binary 阈值（dist≤12px → snap 满量这种），用连续引力函数 + 帧间 lerp。spring 参数（stiffness / damping）需有实测或物理模拟支撑，不能拍脑袋。
  > - **磁吸要软引力**：吸附是连续的、可感知方向变化的，不是离散切换。
  > - **状态转换**：bring 视觉变化必须经 transition 平滑过渡，不要瞬变。CSS transition 写在能生效的层（class / inline style），不假设上层默认提供。
  > - **克制**：动效服务功能而不喧宾夺主——shadow / overlay / spring overshoot 强度都要在用户**几乎察觉不到**的范围。
  > - **考究**：颜色 token、间距、圆角统一来自 design system，不允许局部 cubic-bezier 或 px 数字脱离 token。
  > - **CSS 注释不撒谎**：任何"由 X 提供"的实现假设，注释里说之前必须确认 X 真的提供（参考本次 snapModifier.ts 注释撒谎事件）。
  > - 涉及 spec 写"X 由 CSS Y 提供 / 由 lib Z 默认行为提供"，必须有源码引用或一手代码验证作为 evidence，否则 spec 不通过。
- **MEMORY.md 索引行草稿**：
  - `- [Ensemble design standard](project_ensemble_design_standard.md) — Apple/Linear/Things 级；考究/精致/细节/克制/物理级动效是评估锚点`
- **门槛核验**：
  - 不能从代码推导：YES — 是设计目标 + 评估标准，源码无法表达。
  - 不与现有重复：YES — MEMORY.md 完全没有设计语汇相关条目。
  - 类型选择正确：YES — project 类（项目专属的质量基线 / 状态描述）。
- **不做 Global**：纯 Ensemble 项目特性。其他项目（如 CLI 工具、内部数据脚本）UI 标准不一样。

---

### Memory #3 — `feedback_research_before_bug_fix.md`（feedback 类）

- **决策**：新建
- **来源**：Stage 1C #3（PREF-ROOT-CAUSE-FIRST）+ Stage 1B #1（P6 反馈接收反射），用户原话 U5 + 磁吸事件
- **完整 frontmatter**：
  ```
  ---
  name: Investigate root cause before patching subjective-feeling bugs
  description: When user reports subjective-quality complaints (生硬/卡/不对/读不通), spawn research SubAgent to find root cause first — do not jump to parameter tweaks
  type: feedback
  originSessionId: <本次 session id>
  ---
  ```
- **Body 草稿**：
  > 当用户反馈以**主观负面感受**形式出现（"生硬"、"不对"、"卡"、"不流畅"、"读不通"）时，第一反应必须是派一个调研 SubAgent 一手核查根因，再决定怎么改。**不要直接读相关文件然后 patch、不要在没定位根因前调参数**——参数微调在不知根因时是猜，猜中概率随系统复杂度反比下降。
  >
  > **Why**: 用户在磁吸生硬反馈时明确说"先调研分析设计，之后再完善一下"（U5）——这是对"看到 bug 立即 patch"反应模式的直接否定。本次磁吸事件实证：如果主 Agent 直接调 LERP_FACTOR 或换 cubic-bezier 参数，根本无效——根因是 modifier 把 transform 钉在 slot 中心 1 帧后跳回 + DragOverlay wrapper 没有 CSS transition + snapModifier.ts 注释指向不存在的实现。这三层根因不读 dnd-kit 源码 + 不读项目 CSS 找不到。
  >
  > **How to apply**:
  > - 收到主观感受类反馈，第一动作是派调研 SubAgent，不是开 patch。
  > - 调研 SubAgent 必须一手读源码 / 一手 grep 项目 CSS / 一手核对类型，不依赖文档或注释。
  > - 调研返回根因报告（含证据：源码行号、类型签名、CSS 路径）后，主 Agent 再设计修复方案。
  > - 这条与 `~/.claude/CLAUDE.md` 的"理解→调研→规划→执行"流程一致，但**专门覆盖"修 bug"场景**——bug fix 的诱惑是"我看到代码就知道怎么改"，但根因经常不在主 Agent 的第一直觉里。
  > - 与 Global Rules.md 的"Investigate Before Answering"互补：那条覆盖回答问题，本条覆盖修代码。
- **MEMORY.md 索引行草稿**：
  - `- [Research before bug fix](feedback_research_before_bug_fix.md) — 主观反馈类 bug 必须先派调研 SubAgent 找根因，不直接 patch`
- **门槛核验**：
  - 不能从代码推导：YES — 是工作流偏好，不是代码规范。
  - 不与现有重复：YES — Global Rules 的"Investigate Before Answering"只覆盖回答场景，本条专门 bug fix 场景。CLAUDE.md "理解→调研"是 generic 流程，本条是其在 bug fix 子场景的具体化。
  - 类型选择正确：YES — feedback 类（用户在本次 Session 直接纠正主 Agent 行为）。
- **不做 Global**：证据只来自本次单一项目（Ensemble 磁吸 + data wipe），不满足 multi-project evidence 标准。如果未来在其他项目再次出现，再考虑 promote。

---

### Memory #4 — `project_ensemble_pragmatic_execution.md`（project 类）

- **决策**：新建（合并 Stage 1C #4 + #5 两条相关偏好）
- **来源**：Stage 1C #4（PREF-PATH-B-PRAGMATIC）+ #5（PREF-NO-RECOVERY），用户原话 U2 + U4
- **完整 frontmatter**：
  ```
  ---
  name: Ensemble pragmatic execution — Path B over endless polishing
  description: For Ensemble (single-developer, manually-rebuildable data), accept "Path B 务实开工" when only P1/P2 left, and prioritize prevention over recovery on data loss
  type: project
  originSessionId: <本次 session id>
  ---
  ```
- **Body 草稿**：
  > Ensemble 是单人开发 + 数据可手动重建的项目。这两个特性允许两条务实做法：
  >
  > **务实开工 (Path B)**：当评审已无 P0、剩下都是 P1/P2 细节时，接受"开始执行 + 边做边调"，不死磕到 10/10 完美。前提：(1) 没有真正的 blocker；(2) 主 Agent 有理由相信文档完美化的边际收益已低于继续投入的成本；(3) 涉及多 SubAgent 协作时，剩余 P1/P2 不会传染到下游 SubAgent 误解。
  >
  > **不补救、专注预防**：在 Ensemble 这种小数据量、可手动重建的项目里，遇到数据丢失/状态异常事故，不优先做 Time Machine 恢复 / 数据重组脚本，而是把根因修干净不再发生。Sunk cost 不主导决策。
  >
  > **Why**:
  > - Path B：用户在 V3 评审 9.5/10 时明确选"路径 B 务实开工"（U2）——主 Agent 当时给的判断"V3 已无 P0，P1 是细节优化；实施过程会暴露新事实，过早完美化文档容易脱离实际"被采纳。这是用户对 Ensemble 这种边做边发现的小项目的明确允许。
  > - 不补救：用户在 ~/.ensemble/data.json 被测试覆盖事故中拒绝从 Time Machine 恢复（U4），宁可重新整理。隐含判断"已经没了的不值得追溯，重要的是把口子堵死"。
  >
  > **How to apply**:
  > - **Path B 触发条件**：评审分数 ≥ 9/10 + P0 数 = 0 + 主 Agent 认为继续打磨边际收益已低 → 主动给用户"路径 A 继续打磨 / 路径 B 务实开工"二选一，附带主 Agent 倾向（参考 `feedback_decision_with_recommendation.md`）。
  > - **不补救**：遇到数据/状态丢失，第一反应不是恢复脚本，而是修预防机制（如本次 cfg(test) panic 改造）。如果用户主动说要恢复，再做恢复。
  > - **关键边界**：这条偏好**只适用于 Ensemble**（单人 + 小数据量）。**不可外推到团队/客户/生产数据库项目**——团队项目里 Path B 留 P1 给下游 SubAgent，会因为 SubAgent 没有同等上下文而误解；生产数据库丢失，恢复优先级远高于"修预防"。
- **MEMORY.md 索引行草稿**：
  - `- [Pragmatic execution & no-recovery](project_ensemble_pragmatic_execution.md) — Ensemble 单人项目允许 Path B 务实开工 + 数据丢失专注预防不补救`
- **门槛核验**：
  - 不能从代码推导：YES — 是项目阶段决策风格，不是代码规范。
  - 不与现有重复：YES — MEMORY.md 无相关条目。"先调查后回答"是 generic 流程，与本条"开工标准"是不同维度。
  - 类型选择正确：YES — project 类（项目阶段/动机/性质描述）。
- **不做 Global**：明确不可外推。

---

### Memory #5 — `feedback_decision_with_recommendation.md`（feedback 类）

- **决策**：新建
- **来源**：Stage 1C #7（PREF-OPTION-WITH-RECOMMENDATION），用户原话 U8
- **完整 frontmatter**：
  ```
  ---
  name: Decision asks must include options + leaning + reasoning
  description: When asking the user for a decision, present (1) options (2) main agent's leaning (3) reasoning — never punt the call back as a neutral request
  type: feedback
  originSessionId: <本次 session id>
  ---
  ```
- **Body 草稿**：
  > 在决策节点上请示用户时，必须给出三件事：(1) 可选项；(2) 主 Agent 的倾向；(3) 倾向的理由。**不允许的形式**："你想怎么做？" / "请用户决定" / 单纯列选项不带倾向——这是把球踢回，增加用户负担。
  >
  > **Why**: 用户在 V3 评审 9.5/10 时主 Agent 给了"路径 A（继续打磨到 10/10）/ 路径 B（务实开工）"两个选项 + 主 Agent 倾向（B）+ 理由（继续打磨边际收益低于实施暴露新事实），用户选 B。这次互动证明：用户接受这种"自主+请示"混合形态。
  >
  > 这与 `~/.claude/CLAUDE.md` "全然自主性" + "主动推演" 一致——自主不等于不请示，而是请示也带着判断；让用户做最终决策但不让用户从零开始思考。
  >
  > **How to apply**:
  > - **决策请示模板**：
  >   - 选项 A：[简述 + 后果]
  >   - 选项 B：[简述 + 后果]
  >   - 我的倾向：[A / B]
  >   - 理由：[1-2 句]
  > - **不带倾向的请示是异常**——只在主 Agent 真的没倾向时（双方权衡接近 50/50 + 用户偏好维度未知）才能用。这种情况要明确说"我没倾向，因为 X 我无法判断"。
  > - 适用范围：所有用户决策点，不限于 Ensemble。但目前证据仅来自本次 Session，先按 feedback 类（项目级）记录；下次类似交互再确认是否升 user 类。
- **MEMORY.md 索引行草稿**：
  - `- [Decision with recommendation](feedback_decision_with_recommendation.md) — 决策请示要带选项+倾向+理由，不要单纯把球踢回`
- **门槛核验**：
  - 不能从代码推导：YES — 是交互风格偏好。
  - 不与现有重复：YES — CLAUDE.md "主动推演" + "责任在你"隐含此态度但未具体到决策请示形态。本条是其具体化。
  - 类型选择正确：YES — feedback 类（用户对工作方式的隐式确认）。
- **不做 Global**：仅本次单一 Session 证据，按 persistence-system.md 应默认 project，再积累后再考虑全局。

---

### Memory #6 — 更新 `MEMORY.md`：补 dnd-kit listeners chain pattern + Rust HashMap 顺序未定义

- **决策**：更新现有 MEMORY.md（追加到现有 "Patterns" 段）
- **来源**：Stage 1A #4（onKeyDown shadow dnd-kit KeyboardSensor）+ Stage 1A #9（HashMap 迭代序错误）
- **理由**：这两条都是**项目踩过的具体语言/库 API 陷阱**，不值得各自单独 Memory 文件，但对下次涉及 dnd-kit / Rust 集合算法的任务有用。Stage 1A 已明确推荐"放进项目级 memory"。
- **拟改动 diff**（追加到 MEMORY.md "## Patterns" 段末尾）：
  ```diff
   ## Patterns
   - Serde `#[serde(default)]` on String = empty string when key missing (not when parse fails)
   - Serde HashMap: if ANY entry fails to deserialize, entire HashMap fails
   - `if let Ok(...)` silently swallows parse errors - be careful with this pattern
  +- **dnd-kit listeners chain (not shadow)**: when adding custom `onKeyDown` / `onMouseDown` / `onTouchStart` to a sortable item, must chain (`listeners.onKeyDown?.(e); /* custom logic */`) and place `{...listeners}` BEFORE the custom handler in JSX — otherwise `{...listeners}` shadows your handler or vice versa, breaking KeyboardSensor (踩过一次，code-reviewer 才发现)
  +- **Rust HashMap iteration order is undefined** (SipHash + random seed per process); never rely on insertion order for "原序追加未提及项"类算法。Use `IndexMap` / `BTreeMap` / 或显式 snapshot `Vec<String>` of original order before iteration. Common LLM trap: cross-language assumption from Python dict (3.7+) / JS Map (insertion order)
  ```
- **门槛核验**：
  - 不能从代码推导：PARTIAL — pattern 本身可以从 dnd-kit 源码 + Rust 文档推出，但**踩过一次的实证**是 Memory 的价值（避免下次 SubAgent 再踩）。这是"经验"不是"代码事实"。
  - 不与现有重复：YES — MEMORY.md Patterns 段已有 Serde 三条，但无 dnd-kit / Rust HashMap 条目。
  - 类型选择正确：YES — 现有 Patterns 段就是收集这类"经验级 pitfall"的位置。
- **不做单独文件**：单条 pattern 不到 100 字，单独建文件分裂。索引段就是合适位置。

---

## 拒绝的候选（含理由）

### 拒绝 PREF-AUTONOMY-LONG-TASK（Stage 1C #6）
- **拒绝原因**：与 `~/.claude/CLAUDE.md` "作为领导者，你拥有全然的自主性"重复（CLAUDE.md 已加载在每个 Session 起点）。再写到 Memory 是冗余。

### 拒绝 PREF-PATIENT-ON-ITERATION（Stage 1C #8）
- **拒绝原因**：这是用户性格特征（对真在改进的迭代有耐心），不应作为主 Agent 行为依据。Memory 的目的是改善主 Agent 行为，把"用户耐心"写进 Memory 反而可能让主 Agent 用作"多迭代几次"的偷懒理由——错误反推方向。Stage 1C 也明确建议"不应记录"。

### 拒绝 PREF-AUTO-QC-OK（Stage 1C #9）
- **拒绝原因**：与 `~/.claude/CLAUDE.md` §二.1 "慷慨发布、精准拆解" 重复。CLAUDE.md 已说"慷慨比节省更接近你要的质量"——本条只是其应用场景之一，不需要单独 Memory。

### 拒绝 Stage 1A #1 / #2 / #3 / #5 / #6 / #7 / #8 / #10 的"返工教训"
- **拒绝原因**：这些事件的**抽象方法论已被 Stage 1B 提取为模式**，对应处置是 Rule（项目 Rule 落 `./.claude/rules/`）。Stage 1A 只是事件溯源，**事件本身不应直接进 Memory**——会导致 Memory 充斥 fix recipe，违反 persistence-system.md "No debugging insight that's just a fix recipe"。教训通过 Rule 化保留。
- **例外**：#4 dnd-kit listeners + #9 HashMap iteration order，因其太局部不适合 Rule、但需要项目级提醒，已合并到 Memory #6 上。

### 拒绝 Stage 1B #9 ≥5 lens 评审
- **拒绝原因**：Stage 1B 自己已明确建议"具体维度划分留 case-by-case，把 ≥5 lens 这个通用原则写进 user Constitution"——意思是 Constitution 修订（用户写），不是 Memory（主 Agent 写）。本 Stage 2E 不直接修改 Constitution。
- **替代处置**：建议在最终 Synthesis 阶段提醒用户，是否要在 Constitution 中补一句"对评审任务，至少 5 个独立 expert lens"。**不在 Memory 里加冗余条目。**

### 拒绝 Stage 1B #10 顺手修 P1 判定
- **拒绝原因**：Stage 1B 自己说"是判断标准而非硬规则，且依赖经验"，建议落 Memory 让下次主 Agent 有参考。**但仔细评估后判定不应落 Memory**：原因是 (1) 三条触发条件（同区域 + 单条<1 turn + 不冲突）已经是常识级判断，主 Agent 默认会做；(2) 写进 Memory 会被解读为"硬规则"，反而限制灵活判断。属于"过度系统化"风险。

---

## 与现有 Memory 的关系

### 新建（5 个新文件）
1. `feedback_ensemble_commit_quality.md` — Memory #1
2. `project_ensemble_design_standard.md` — Memory #2
3. `feedback_research_before_bug_fix.md` — Memory #3
4. `project_ensemble_pragmatic_execution.md` — Memory #4
5. `feedback_decision_with_recommendation.md` — Memory #5

### 更新（1 处现有文件）
6. `MEMORY.md` — 追加 dnd-kit listeners chain + Rust HashMap iteration order 两条 patterns + 5 个新 topic memory 索引

### 交叉引用建议（提醒用户：可选追加，不是必须）
- 在 `feedback_no_pr_for_personal_changes.md` 末尾加一句："**注意**：直推 main 不走 PR ≠ commit message 可以草草写。Ensemble 已是开源项目，commit 质量见 `feedback_ensemble_commit_quality.md`。" — 避免下次主 Agent 只读到"不走 PR"就误以为 commit 也可以随意写。

### 冲突
- **无明确冲突**。所有新增条目要么是空白领域填补，要么是对现有条目的细化补充，未与已存条目矛盾。

---

## MEMORY.md 索引整合后预览

整合后 MEMORY.md 的"Topic memories"段（替换现有第 37-38 行）：

```markdown
## Topic memories

### Project state & quality bar
- [Ensemble commit quality bar](feedback_ensemble_commit_quality.md) — open-source 升格后 commit/push 必须清晰精细，不再用草草一行
- [Ensemble design standard](project_ensemble_design_standard.md) — Apple/Linear/Things 级；考究/精致/细节/克制/物理级动效是评估锚点
- [Pragmatic execution & no-recovery](project_ensemble_pragmatic_execution.md) — Ensemble 单人项目允许 Path B 务实开工 + 数据丢失专注预防不补救

### Workflow feedback
- [No PR for personal changes](feedback_no_pr_for_personal_changes.md) — Ensemble 是单人项目；commit 直奔 main，跳过 PR 仪式
- [Research before bug fix](feedback_research_before_bug_fix.md) — 主观反馈类 bug 必须先派调研 SubAgent 找根因，不直接 patch
- [Decision with recommendation](feedback_decision_with_recommendation.md) — 决策请示要带选项+倾向+理由，不要单纯把球踢回
```

整合后 MEMORY.md 总行数预估：~50-55 行（仍远低于 200 行硬上限）。

---

## 总结

- **推荐 Memory 操作**：6 处变更（5 新建 + 1 更新）
  - 新建 5 个 topic 文件（覆盖 commit 质量、设计标准、修 bug 调研、务实开工、决策带倾向）
  - 更新 MEMORY.md（追加 2 条 patterns + 5 个新 topic 索引 + 重组 Topic memories 段）
- **拒绝 6 类候选**：
  - 3 条偏好（与 CLAUDE.md 重复 / 不应作为行为依据）
  - 8 个 Stage 1A 返工事件（已通过 Rule 化处置，不重复进 Memory）
  - 2 个 Stage 1B 模式（建议路径不是 Memory）
- **未触达 Global Rule 标准**：所有 Memory 都按项目级，符合 persistence-system.md "默认项目级、多项目证据后再升级"的纪律。
- **总条目数**：现有 1 topic memory + 6 新增 = 7 条 topic memory；MEMORY.md 索引仍简洁可控。

**特殊提醒主 Agent**：
- Memory #6（更新 MEMORY.md）建议在所有新文件创建完成后**最后一步执行**，避免索引指向尚未存在的文件。
- 所有新文件的 frontmatter `originSessionId` 应在最终写入时填入本次 Session 的真实 ID（主 Agent 在 Stage 3 执行时填）。
