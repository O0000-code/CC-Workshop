# Stage 2F — 刻意不保存清单

> 本文档列出本次 Session 中**看起来值得保存、但根据 `persistence-system.md` 的纪律不应保存**的内容。每条都带"诱惑性来源"与"替代信息源"，作为质量保证的反向证据。
> 使用的判定标准（按 `persistence-system.md` "Exclusion Constraints"）：
> - **代码已含**：源码本身就是 single source of truth，Memory 摘要会与代码版本漂移
> - **Git 已含**：commit/diff/blame 是更准确的事实通道，记忆里写"什么时候改了什么"是冗余
> - **CLAUDE.md/Rules 已含**：行为已被现有规范覆盖，再写一遍会稀释规范
> - **临时调试态**：迭代过程中的中间产物，已在 `.dev/` 归档，没有未来 Session 触发价值
> - **可重新提取**：从 `.dev/sidebar-reorder/` 任意时点能完整重建上下文

---

## 不保存项（按"看起来诱人度"排序）

---

### #1 dnd-kit v6.3.1 行为细节（DragOverlay transition=undefined / PositionedOverlay inline transform 在第 3666 行 / ActiveDraggableContext 不读注释）

- **看起来值得保存的理由**：本次磁吸事故的核心知识源——"dnd-kit 默认不给 DragOverlay 提供 CSS transition"是非显然的事实，下次任何涉及 dnd-kit 的任务都可能再次踩到。把这条写进 Memory 让未来 Session 不必再读源码。
- **决定不保存的理由**：(a) **代码已含**——`06_snap_research.md` §1-§4 已把根因、源码引用（line 3666 / `defaultTransition` 返回值）、修复路径全部固化在项目内；(b) **版本耦合**——dnd-kit 升级到 v6.4 / v7 后这些行号和接口可能完全失效，写进 Memory 会变成过时陷阱；(c) Memory 应保留**Claude 的工作模式学习**，不是**第三方库的实现细节**——那是源码或 changelog 的领域。
- **替代信息源**：`/Users/bo/Documents/Development/Ensemble/Ensemble2/.dev/sidebar-reorder/06_snap_research.md` + 升级时直接 grep `node_modules/@dnd-kit/core/dist/core.esm.js`。

---

### #2 12px snap 阈值 / 0.18 lerp factor / 软引力公式具体常数

- **看起来值得保存的理由**：这些是经过实测调优的"魔法数字"，调一次很贵，把它们写进 Memory 让下次类似动效任务直接复用，少走几轮迭代。
- **决定不保存的理由**：(a) **代码已含**——这些常数都在 `src/utils/dnd/snapModifier.ts` 源码里，源码本身就是规范；(b) 这些值是**特定容器尺寸 + 特定卡片高度 + 特定显示器 DPI** 下的产物，跨场景不可迁移——写进 Memory 假装它有跨场景价值是误导；(c) Memory 写"12px 阈值是黄金值"会反向锁死未来调优空间，违反 `persistence-system.md` "No things inferable from code"。
- **替代信息源**：`src/utils/dnd/snapModifier.ts` + `06_snap_research.md` §4（讲了为什么是这个数量级）。

---

### #3 apply_reorder 算法的具体实现（original_order Vec snapshot / drained_set 思路）

- **看起来值得保存的理由**：从 V1 的 HashMap 错误迭代（事件 #9）一路调到 V3 的"snapshot original_order Vec"是有思考过程的，下次写类似 reorder 算法时把这个 pattern 拉出来用。
- **决定不保存的理由**：(a) **代码已含 + 12 测试已含**——`src-tauri/src/data.rs::apply_reorder` 就是规范，配套的 12 个 unit test 锁死语义；(b) "Rust HashMap 不保证迭代顺序"是 Rust 标准库的事实，不是项目知识——`std::collections::HashMap` 文档第一段就讲；(c) 把"具体算法实现"写进 Memory 等于让 Memory 变成代码片段图书馆，违反 `persistence-system.md` "things inferable from code"。
- **替代信息源**：`src-tauri/src/data.rs` 的 `apply_reorder` + 测试文件。

---

### #4 V1→V2→V3 的具体修订路径（每个 P0 怎么改的）

- **看起来值得保存的理由**：本次 Session 的"过程精华"——5 SubAgent 评 V1 找 23 P0、3 SubAgent 评 V2 找 7 P0、终审过 V3。这些修订决策本身是高密度知识，写进 Memory 让未来类似多轮评审任务有先例可循。
- **决定不保存的理由**：(a) **`.dev/sidebar-reorder/_archive/v1, _archive/v2` 已归档** + V3 三件套头部已有 Revision History 段——任何想看"哪个 P0 怎么改"都能查；(b) **写进 Memory 等于把临时调试态固化**——P0/P1 编号、评审分数、复评轮次全是本项目特有，跨 Session 没有触发价值；(c) "多轮评审驱动收敛"这个**方法论本身**才是可迁移知识，已在 Stage 1B #8 单独考虑（候选 Project Rule），不需要把具体过程也写进 Memory。
- **替代信息源**：`.dev/sidebar-reorder/02_design_spec.md`（V3，含 Revision History）/ `_archive/v1` / `_archive/v2` / `05_review/`。

---

### #5 cargo test 误写 ~/.ensemble/data.json 的具体修复 commit（`116bdda`）

- **看起来值得保存的理由**：本次唯一的用户数据级事故，写进 Memory 让未来 Session"看到 cfg(test) 就警觉"。
- **决定不保存的理由**：(a) **Git 已含**——`116bdda` commit message + diff 就是完整事故复盘记录，git log/blame 永远可查；(b) 抽象成"Test isolation by negative guarantee"的方法论才是可迁移部分（已在 Stage 1A #1 / Stage 1B #5 提议为 Project Rule `fallback-path-must-be-unreachable-in-test.md`）——具体 commit hash + 具体文件名是噪音；(c) Memory 写"`116bdda` 这个 commit 修了什么"违反 `persistence-system.md` "No information derivable from git history"。
- **替代信息源**：`git show 116bdda` + 上述候选 Project Rule（如果落地）。

---

### #6 Tauri 2.0 + dnd-kit 集成的具体配置（SortableContext 配置项 / sensor activationConstraint / measure strategy）

- **看起来值得保存的理由**：本次踩了 sensor activationConstraint 和 measure strategy 的坑（onKeyDown shadow 事件），写进 Memory 让下次 dnd-kit 接入直接抄。
- **决定不保存的理由**：(a) **代码已含**——`src/components/sidebar/SortableCategoriesList.tsx` 等 8 个 sortable 组件的源码就是参考实现，比 Memory 摘要可靠；(b) "dnd-kit listeners chain pattern"在 Stage 1A #4 已被明确判定**不规范化**（dnd-kit 特定 API 形状，不具备跨项目泛化价值），如果改写进 Memory 等于绕过判定；(c) 真要保留也应该是**项目内 Skill 或文档**（`.dev/sidebar-reorder/03_tech_plan.md` 已经是了），不应是 Memory。
- **替代信息源**：8 个 Sortable 组件源文件 + `.dev/sidebar-reorder/03_tech_plan.md`（V3）。

---

### #7 "5 评审 SubAgent → 3 复评 → 1 终审"的具体阶梯

- **看起来值得保存的理由**：本次评审编排的"配方"，看起来是可复用的 SubAgent 数量公式。
- **决定不保存的理由**：(a) **数字本身没有可迁移价值**——5/3/1 是本任务复杂度对应的数量，下次任务复杂度不同就不适用；(b) **真正可迁移的是"评审 SubAgent 数量随修订收敛递减"的思想**，已在 Stage 1B #8 / #9 提取（前者候选 Project Rule "iterative-review-to-target-score"，后者建议补 Constitution）；(c) 把数字写进 Memory 会反向变成"下次也用 5/3/1"的迷信。
- **替代信息源**：上述 Stage 1B 候选规范化条目（思想，不是数字）。

---

### #8 "用户接受路径 B 务实开工 / 拒绝从 Time Machine 恢复数据"的具体本次决策

- **看起来值得保存的理由**：用户当时给了两次明确决策，看起来是用户偏好的硬证据。
- **决定不保存的理由**：(a) **决策语境耦合**——"接受 V3 9.5/10"是因为评审已无 P0；"拒绝恢复"是因为数据小可重建。脱离语境写"用户倾向于务实"会过度泛化；(b) **抽象成偏好**才有保存价值，已在 Stage 1C #4 #5 处理（合并为 `project_ensemble_pragmatic_execution.md`，且**明确标注不可外推**）；(c) 写"用户当时选了 B 而不是 A"是事件记录，不是偏好——`persistence-system.md` 明确禁止 ephemeral state。
- **替代信息源**：Stage 1C #4 #5 合并条目（决议待 Stage 1D 确认）。

---

### #9 03_tech_plan.md V3 §11 的 modifier 代码 sample（snapModifier 完整实现）

- **看起来值得保存的理由**：磁吸调研的高质量产出，连续软引力 + 帧间 lerp 的代码是非显然的工程方案。
- **决定不保存的理由**：(a) **代码已含**——`src/utils/dnd/snapModifier.ts` 是真实实现；(b) **`.dev/sidebar-reorder/06_snap_research.md` §4 + `03_tech_plan.md` V3 §11 已经是完整文档**——双份记录；(c) Memory 摘要的代码 sample 必然简化、必然漂移、必然过时，不如让未来 Session 直接读源码 + 调研文档。
- **替代信息源**：`src/utils/dnd/snapModifier.ts` + `06_snap_research.md` §4。

---

### #10 "DATA_MUTEX 必须覆盖 claude_md.rs / trash.rs"的具体清单

- **看起来值得保存的理由**：MEMORY.md "Patterns" 段已经有"plugins.rs 也构造 McpConfigFile - 别忘了"的同类提示，把这次的"claude_md.rs / trash.rs 也写 data.json"按相同 pattern 加进去看起来很自然。
- **决定不保存的理由**：(a) **代码已含**——这些文件现在都已经 acquire DATA_MUTEX，加了之后是否覆盖一个 grep 就能验；(b) **真正的 lesson 不是"哪些文件要加"而是"规划共享资源约束时先 grep 数据访问点而非按文件枚举"**——Stage 1A #5 已建议规范化为 Rule "Grep before enumerate"；(c) 把具体文件名写进 Memory 会随项目结构演化迅速过期（拆模块、加新文件都会让清单失效）。
- **替代信息源**：候选 Rule（如果落地） + `grep -rn 'DATA_MUTEX\|write_app_data' src-tauri/`。

---

### #11 "code-reviewer SubAgent / animation-reviewer SubAgent / alignment-checker SubAgent"作为命名 SubAgent 角色

- **看起来值得保存的理由**：本次实战验证有效，值得作为**项目 Skill 库**积累——下次主 Agent 想做代码评审时直接 `code-reviewer SubAgent` 即可。
- **决定不保存的理由**：(a) **这是 Skill / 工具问题，不是 Memory 问题**——若值得规范化应该作为 `.claude/agents/` Subagent 配置或 `.claude/skills/` Skill，不是 Memory；(b) **Memory 不是"工具列表"的存储位置**——`persistence-system.md` 明确 Memory 是"Claude 的累积学习"，不是"我以前这么用过 SubAgent 的清单"；(c) 这种 SubAgent 角色都是**任务驱动定义**（拿到任务派一个就行），写进 Memory 假装"有这些固定角色"反而限制未来主 Agent 的派发自由度。
- **替代信息源**：本次 Session 的 SubAgent prompt 历史 + Constitution §二.1 "慷慨发布、精准拆解"原则（已规范）。

---

### #12 用户对设计/动效用的具体词："考究、精致、细节、克制、物理级动效"

- **看起来值得保存的理由**：这是用户语言风格的硬证据，写进 Memory 让未来 Session 在涉及 UI 时立刻知道用户口味。
- **决定不保存的理由**：(a) **已在 Stage 1C #2 处理**——决议是写入 `project_ensemble_design_standard.md` Memory（这是合理的去向）；本"不保存清单"针对的是"看起来值得但实际不应"，#12 在这里出现是因为它**有诱惑被复制到 user 级 CLAUDE.md / 全局 Rule** 的风险；(b) **不能上升为全局**——`persistence-system.md` 三条 Global 标准全不满足：单一项目证据 / 项目相关词汇 / 跨域适用性弱；(c) 即便项目级也应作为"Ensemble 设计基线"而非"用户口味描述"，避免主 Agent 在其他项目误用同样标准。
- **替代信息源**：`project_ensemble_design_standard.md`（Stage 1D 决议后落盘）。

---

### #13 完整时间线（Session 内 19 个事件节点）

- **看起来值得保存的理由**：`_session_summary.md` 的事件清单是黄金一手记录，写进 Memory 让未来 Session 完整重建本次过程。
- **决定不保存的理由**：(a) **`.dev/session-review/01_working/_session_summary.md` 已是落盘文件**——Memory 复制等于双份；(b) **时间线本身没有可迁移知识**——它是"本次发生了什么"，不是"我从中学到什么"；可迁移部分在 Stage 1A/1B/1C 三份提取里；(c) Memory 的 "Project phase status or progress tracking" 适用于"当前在哪个 phase"这种 active 状态，不适用于"以前发生了哪些事"的 historical record——后者属于 git/项目内 .dev 文档。
- **替代信息源**：`.dev/session-review/01_working/_session_summary.md`（已存在）。

---

## 共性原则

上述 13 项的"看起来值得保存"都源自**两个心智误区**：

1. **"信息密度高 = 应该保存"**——本次 Session 高密度知识确实多（dnd-kit 行为、调优常数、修订路径、SubAgent 编排），但 `persistence-system.md` 的核心问题不是"这条信息有没有价值"，而是"这条信息的最佳存储位置在哪"。代码里能查到的 → 别复制；git 能查到的 → 别复制；项目 .dev 文档已落盘的 → 别复制；本质是工具/库的 → 别污染 Memory。Memory 的预算用于**Claude 的工作模式学习与跨项目可迁移的偏好**，每多一条 noise 就少一条 signal。

2. **"具体细节方便下次直接用"**——把数字、文件名、commit hash、SubAgent 角色名写进 Memory 看似省了下次查询时间，实际造成两类风险：(a) 漂移——代码版本演化后 Memory 内容过期但 Memory 自己不知道；(b) 过度具体化——具体数字会被误用为"通用配方"。`persistence-system.md` "Information flows by stability" 的设计意图正是要 Memory 只存最稳定的层，具体值的不稳定性意味着它们应该停留在源码或文档层。

---

## 总结

- **不保存项数量**：13
- **类别分布**：
  - **代码已含**：8 条（#1, #2, #3, #6, #9, #10 部分, #11 部分, #13 部分）
  - **Git 已含**：2 条（#4 部分, #5）
  - **CLAUDE.md / 现有 Rules 已含**：1 条（#11 借助 Constitution）
  - **临时调试态 / `.dev/` 已落盘**：5 条（#4, #7, #8, #13）
  - **应去 Project Rules / Skill 而非 Memory**：3 条（#1 行为细节其实是项目文档、#11 应是 Subagent 配置、#10 应是 Rule）
  - **应作为项目 Memory 但不能上升全局**：1 条（#12，已在 Stage 1C 决议）

  注：单条可同时归多个类别，分布相加超 13 是预期。

- **给主 Agent 的提醒（未来 Session 想保存这类内容时先查）**：
  1. 想存"某个第三方库的某个版本的某个行为"——先问"这是否会随 lib 升级失效？"答 yes → 落项目文档不落 Memory；
  2. 想存"某次调优出来的具体数字"——先问"这个数字脱离当前容器/尺寸/DPI 还成立吗？"答 no → 落代码注释不落 Memory；
  3. 想存"某次决策的过程"——先问"这是事件记录还是方法论？"前者 → git/`.dev/`；后者 → Stage 1B 类别的方法论提取走规范化流程；
  4. 想存"用户当时这么说了"——先问"这是 ephemeral 决策还是稳定偏好？"前者 → 不存；后者 → 走 Stage 1C 类别的偏好提取流程，**默认项目级**。
  5. 凡是"代码 grep / git log / `.dev/` 文件读取" 5 分钟内能重建的事实，都不是 Memory 候选——Memory 只装这些通道无法替代的"Claude 工作模式学习"。
