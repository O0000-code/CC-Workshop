# Stage 1C — 用户偏好提取

## 偏好清单（按持久化价值排序）

### #1 [PREF-COMMIT-QUALITY] 开源项目升格后的 commit/push 写作标准

- **用户表达**（U1）："Ensemble 当前已经是一个有一定使用量的开源项目，所以提交的推送需要写得清晰、精细一点。"
- **可提炼的偏好**：Ensemble 的项目状态从"私人项目"升格为"有用户的开源项目"，commit message 与 push notes 必须做到清晰、精细、面向外部读者。简短、口水化、随手写的 commit 不再合适。
- **类别**：feedback（项目级，特指 Ensemble）
- **是否已在 Memory**：NO，**这是对现有 `feedback_no_pr_for_personal_changes.md` 的部分语境更新**——既有反馈说"单人项目，直奔 main 不走 PR"。两条不冲突，但开源项目升格后 commit 描述质量必须提升，这是新增的约束。
- **下次 Session 没有这条会怎样**：主 Agent 大概率沿用以前的简短 commit 风格（如"fix: ..."一行）。对当前已有用户群的 Ensemble，commit log 是项目对外脸面，措辞粗糙会损害项目可信度，且 release note/changelog 提取困难。
- **建议**：新建 `feedback_ensemble_commit_quality.md`，并在现有 `feedback_no_pr_for_personal_changes.md` 中补一条交叉引用——"虽然不走 PR，但 commit 本身要写得对外可读"。两条共同构成 Ensemble 当前阶段的提交策略。

---

### #2 [PREF-DESIGN-STANDARD] 设计/动效的极高质量关键词集

- **用户表达**（U3）："考究、精致、细节、克制、物理级别动效（Spring 曲线/磁吸、自然、流畅等等）。"
- **可提炼的偏好**：在 Ensemble 这类设计驱动的桌面 App 上，用户对 UI/动效要求达到产品级（Apple/Linear/Things 档次），不是 acceptable 级。具体关键词锚点：考究、精致、细节、克制、物理级动效（spring/磁吸/自然过渡）。
- **类别**：project（Ensemble 专属设计基线）
- **是否已在 Memory**：NO。MEMORY.md 完全没有设计语汇相关条目。
- **下次 Session 没有这条会怎样**：主 Agent 在 Ensemble 涉及 UI 时，默认按"实现功能即可"的标准做，结果是动画硬阈值、cubic-bezier 拍脑袋、CSS 注释撒谎（本次 V2→V3 修订时反复撞上的问题）。下次还会再交付一遍生硬动效，被用户打回。
- **建议**：新建 `project_ensemble_design_standard.md`，记录这组关键词与"物理级动效要求"的具体含义（spring 曲线、磁吸要连续软引力非硬阈值、状态转换要带 transition 不要瞬变）。

---

### #3 [PREF-ROOT-CAUSE-FIRST] 修问题前先调研根因，不直接动手改

- **用户表达**（U5）：用户在磁吸生硬反馈时说"先调研分析设计，之后再完善一下"——明确否定"主 Agent 看到 bug 立即 patch"的反应。
- **可提炼的偏好**：用户期望主 Agent 在面对 bug/质量缺陷反馈时，先派调研 SubAgent 找根因，再决定怎么改，不是边读边改。即便 fix 看起来很明显，也要先建立对根因的完整理解。
- **类别**：user（跨项目稳定偏好）。该偏好与现有 `~/.claude/CLAUDE.md` 中的"理解→调研→规划→执行"流程一致，且与 Global Rules.md 中"Investigate Before Answering"同源——但**那条只针对回答问题，本条针对修代码 bug 的场景**，是延伸而非重复。
- **是否已在 Memory**：部分覆盖（Global Rules 的"Investigate Before Answering"覆盖回答场景，CLAUDE.md 的流程覆盖复杂任务）。**bug fix 场景下"先调研根因再动手"未被显式记录。**
- **下次 Session 没有这条会怎样**：主 Agent 看到 bug 描述就直接读相关文件然后 patch，错过对系统性根因的发现。本次磁吸事件中：如果主 Agent 直接把硬阈值改成软阈值，会错过 CSS 注释撒谎（注释说有 transition 但实际没有）这个深层问题。
- **建议**：以**新增项目级 Memory** `feedback_research_before_bug_fix.md` 形式记录。**不上升为 Global Rule**——证据只来自本次一个项目的两个事件（磁吸 + data wipe），不满足 persistence-system.md 要求的"multi-project evidence"。

---

### #4 [PREF-PATH-B-PRAGMATIC] 单人 + 自评驱动的项目允许"务实开工"，无需 10/10 完美

- **用户表达**（U2）：用户在评审 9.5/10 时选"路径 B（务实开工）"，并接受主 Agent 的判断："V3 已无 P0，P1 是细节优化；实施过程会暴露新事实，过早完美化文档容易脱离实际。"
- **可提炼的偏好**：当评审已无 P0、剩下都是 P1/P2 细节时，用户愿意接受"开始执行 + 边做边调"，而不是死磕到 10/10。前提条件是：1) 没有真正的 blocker，2) 主 Agent 有理由相信文档完美化的边际收益已低于继续投入的成本。
- **类别**：project（Ensemble 专属，因为它是单人项目；其他项目此偏好未必成立）
- **是否已在 Memory**：NO。
- **下次 Session 没有这条会怎样**：主 Agent 死循环优化文档，把 9.5/10 的 V3 反复打磨到"绝对完美"才肯执行。在 Ensemble 这种边做边发现的场景下，浪费时间且产出反而下降。
- **建议**：新增 `project_ensemble_pragmatic_execution.md`，并明确这条**不能横向迁移到团队/客户项目**——团队项目不允许"V3 进入实施留 P1"，因为返工成本高于反复评审。

---

### #5 [PREF-NO-RECOVERY] 数据丢失/事故后倾向于不补救、专注预防

- **用户表达**（U4）：用户拒绝从 Time Machine 恢复 ~/.ensemble/data.json，宁可重新整理。隐含判断："已经没了的不值得追溯，重要的是把口子堵死。"
- **可提炼的偏好**：在 Ensemble 这种小数据量、可手动重建的项目里，用户更看重"把根因修干净不再发生"，而不是"把数据找回来"。Sunk cost 不主导决策。
- **类别**：project（Ensemble 专属——小数据量、用户能手动重建是前提；不可外推到生产数据库等场景）
- **是否已在 Memory**：NO。
- **下次 Session 没有这条会怎样**：主 Agent 遇到下次数据/状态丢失，第一反应会是花时间做恢复脚本/Time Machine 查找。用户实际希望主 Agent 把时间投入到"修预防机制"（如本次的 cfg(test) panic 改造）。
- **建议**：合并到 `project_ensemble_pragmatic_execution.md`，作为"务实"风格的另一例。或独立成短条目。

---

### #6 [PREF-AUTONOMY-LONG-TASK] 长任务中期望主 Agent 自主推进，不频繁请示

- **用户表达**（U7、U9）：用户中断恢复后说"刚才意外中断了，请严格按照上面要求继续"——期望工作连续，不重复确认。U6 中 T0 对齐 SubAgent 主动派出，用户也未干预。
- **可提炼的偏好**：用户已经给出方向（如"按规划执行"），后续主 Agent 应该自主推进、出问题再来报告，而不是每个分支都来确认。这条偏好与 `~/.claude/CLAUDE.md` 已记载的"主 Agent 拥有全然自主性"一致。
- **类别**：不持久化（**与现有 CLAUDE.md 重复，无新增价值**）
- **是否已在 Memory**：YES，CLAUDE.md 第 11-13 行已写"作为领导者，你拥有全然的自主性"。
- **下次 Session 没有这条会怎样**：现有 CLAUDE.md 已覆盖。
- **建议**：不创建新文件。

---

### #7 [PREF-OPTION-WITH-RECOMMENDATION] 评审决策点期望"选项+倾向+理由"，不是单纯请示

- **用户表达**（U8）：评审 9.5/10 时主 Agent 给了"路径 A（继续打磨到 10/10）/ 路径 B（务实开工）"两个选项，附带主 Agent 的倾向与理由。用户选 B。
- **可提炼的偏好**：在决策节点上，用户期望主 Agent 给出 1) 可选项 2) 主 Agent 的倾向 3) 倾向的理由——而不是单纯把球踢回来"请用户决定"。这与"全然自主性"一致：自主不等于不请示，而是请示也带着判断。
- **类别**：user（跨项目稳定偏好，符合 leadership 风格）。但与 CLAUDE.md 的"主动推演、责任在你"已隐含——是否需要单独记录有争议。
- **是否已在 Memory**：部分覆盖（CLAUDE.md "主动推演"+"责任在你"隐含此态度，但未具体到"决策请示时给倾向"）。
- **下次 Session 没有这条会怎样**：主 Agent 可能在不确定时直接列选项请用户裁决，缺失主 Agent 自己的推荐。这种"中性请示"会增加用户负担。
- **建议**：**项目级**新增 `feedback_decision_with_recommendation.md`，明确"决策请示要带倾向+理由"。**不上升为 Global Rule**——证据仅来自本次单一 Session，且 CLAUDE.md 已部分覆盖。允许下次再积累一次后再考虑全局化。

---

### #8 [PREF-PATIENT-ON-ITERATION] 对真在改进的迭代有耐心

- **用户表达**（U10）：V1 评审 6.6/10 时用户没有不耐烦，继续允许 V2/V3 迭代；只在 V3 真正修了 P0 后才说"路径 B 务实开工"。
- **可提炼的偏好**：用户对"低分但真在改进"的迭代有耐心，不是简单的"不耐烦"或"催进度"。但这种耐心**仅限于真正在改进的场景**，不包含"反复刷分但不解决根本问题"。
- **类别**：不持久化。**这是用户的稳定性格特征，主 Agent 不应该把"用户耐心"作为偷懒理由**。从"知道用户有耐心 → 多迭代几次"是错误反推。
- **是否已在 Memory**：NO，且**不应记录**。
- **下次 Session 没有这条会怎样**：保持不变。主 Agent 应继续以"每一轮都解决具体问题"为目标，而不是依赖用户耐心。
- **建议**：不持久化。

---

### #9 [PREF-AUTO-QC-OK] 接受主 Agent 主动派出"对齐/质检"SubAgent

- **用户表达**（U6）：主 Agent 主动派 T0 对齐 SubAgent（发现 04 文档跟不上 V3）、code-reviewer SubAgent（发现 2 个真 P0），用户全程未干预。
- **可提炼的偏好**：用户**接受**这种自动化质检环节，不认为是过度行为。这条信息价值在于"将来主 Agent 可以放心做这种质检 spawn"。
- **类别**：不持久化（属于 CLAUDE.md "慷慨发布、精准拆解"已覆盖范围）
- **是否已在 Memory**：YES，CLAUDE.md 已写"慷慨比节省更接近你要的质量"。
- **下次 Session 没有这条会怎样**：现有 CLAUDE.md 已覆盖。
- **建议**：不创建新文件。

---

## 与已有 Memory 的关系

### 必须新增（高价值，未被现有 Memory 覆盖）
- **#1 PREF-COMMIT-QUALITY** → 新建 `feedback_ensemble_commit_quality.md`
- **#2 PREF-DESIGN-STANDARD** → 新建 `project_ensemble_design_standard.md`
- **#3 PREF-ROOT-CAUSE-FIRST** → 新建 `feedback_research_before_bug_fix.md`（**仅项目级**，不全局）
- **#4 PREF-PATH-B-PRAGMATIC + #5 PREF-NO-RECOVERY** → 合并新建 `project_ensemble_pragmatic_execution.md`
- **#7 PREF-OPTION-WITH-RECOMMENDATION** → 新建 `feedback_decision_with_recommendation.md`（**仅项目级**）

### 是对现有的更新/补充（不是新建，是 merge 提示）
- **#1** 与 `feedback_no_pr_for_personal_changes.md` 配对——后者说"不走 PR"，前者说"但 commit 本身要清晰精细"。建议在两个文件互加交叉引用，避免主 Agent 只看到"不走 PR"就误以为 commit 也可以随意写。
- **#3** 与 Global Rules.md 的"Investigate Before Answering"互补——那条覆盖"回答问题"，本条覆盖"修 bug"。**不需要修改 Global Rules**，新建项目级即可。

### 与现有冲突（需要用户裁决）
- **无明确冲突**。所有偏好都是新增或对现有的细化，未与已存条目矛盾。

### 不持久化（仅本次场景的判断/性格描述）
- **#6 PREF-AUTONOMY-LONG-TASK**：CLAUDE.md "全然自主性"已覆盖
- **#8 PREF-PATIENT-ON-ITERATION**：用户性格特征，不应作为主 Agent 行为依据
- **#9 PREF-AUTO-QC-OK**：CLAUDE.md "慷慨发布"已覆盖

---

## 关于上升为 Global Rule 的判断

**结论：本次没有任何一条达到 Global Rule 的标准。**

按 `persistence-system.md` 要求，全局化需要：
1. 多项目证据
2. 项目无关内容
3. 跨领域适用性

逐条检查：
- #1 commit 质量 → 仅 Ensemble 升格情境，非项目无关
- #2 设计标准 → Ensemble 专属
- #3 修 bug 前调研 → 只从 Ensemble 一个项目的两次事件得出，不满足"multi-project evidence"
- #4 / #5 务实开工与不补救 → Ensemble 单人项目特性，不可外推
- #7 决策带倾向 → 仅本次一个 Session 证据

**全部按项目级 Memory 写入。** 如下次 Session 在其他项目再次出现 #3 或 #7 模式，再考虑 promote。

---

## 总结

- **共发现 9 条偏好相关表达**
- **5 条值得 Memory 化**（PREF-1, 2, 3, 4+5 合并, 7）→ 共 4 个新文件
- **3 条与现有 Memory 重复，不持久化**（PREF-6, 8, 9）
- **0 条达到 Global Rule 标准**——全部以项目级 Memory 写入

**关键行动建议**：
1. 写入 4 个新 Memory 文件（路径在 `~/.claude/projects/-Users-bo-Documents-Development-Ensemble-Ensemble2/memory/`）
2. 在 MEMORY.md 索引中追加这 4 个 topic 链接
3. 在 `feedback_no_pr_for_personal_changes.md` 中补一条"虽然不走 PR，但 commit 仍需对外可读"的交叉提示，避免被误读为"commit 也可以随意写"
