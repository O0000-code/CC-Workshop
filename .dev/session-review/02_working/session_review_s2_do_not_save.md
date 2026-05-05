# Stage 2F — 刻意不保存清单（Category Hierarchy Session）

> **本轮定位**：与 Session 1 复盘的 13 项不保存清单不同，本轮所有内容已对照阶段 2D（Rule 候选）+ 阶段 2E（Memory 候选）+ 阶段 1A/1B/1C 提取产出。这里列出的是 **看似该写入 Rule/Memory，但经判定不应写入** 的内容——即对阶段 2D/2E 的反向闸门。
>
> **判定标准**（按 `~/.claude/rules/persistence-system.md` "Exclusion Constraints"）：
> - **代码已含**：源码本身就是 single source of truth；写 Memory 等于让摘要与源码版本漂移
> - **Git 已含**：commit/diff/blame 是更准确的事实通道
> - **`.dev/category-hierarchy/` 已含**：spec / 调研 / 评审已成 binding artifact，再写一遍稀释权威
> - **现有 CLAUDE.md / Rules / Memory 已覆盖**：再加等于污染信噪比
> - **临时调试态**：迭代过程中的中间产物
> - **可重新提取**：从源文件 5 分钟内能完整重建
>
> **本次 session 的特殊背景**：用户原话 "$400 / 8h 实现一个小功能太夸张" → 本轮不保存清单的额外严格度：**任何"看似过度规划的方法论副产品"都不写入**——保留它们等于固化"过度做事"的范式。
>
> ---
>
> **总览**：不保存类别 7（A-G） / 总条目 32 / 边缘 case 3

---

## 类别 A: 已在代码 / spec 中体现的实现细节

> 这一类的诱惑性来自"信息密度高"，但 `Memory` 的预算应保留 Claude 的工作模式学习，而不是项目实现细节。每加一条具体实现细节，未来 session 启动时加载的内容信噪比就降一分。

---

### A-1 backend `validate_hierarchy` 的 6 条规则（cycle / depth / orphan / demote-with-children / parent-not-exist / self-parent）

- **诱惑来源**：阶段 1A #3 + #6 把"hierarchy validator"作为 Phase 1 高 ROI 产出反复提及；6 条规则是 V3 V2 spec 锁定的非显然约束。
- **看似值得保存的理由**：未来任何"树形数据 + 拖拽"任务都可以参考这 6 条作为先验校验清单。
- **决定不保存的理由**：
  - **代码已含**：`src-tauri/src/commands/data.rs::validate_hierarchy` + 6 个独立测试是 single source of truth；规则随 schema 演化时代码会自动更新，Memory 摘要不会
  - **types.rs 已含 doc comment**：`HierarchyError` enum 的 6 个 variant 自带 `///` 文档
  - **可重新提取**：未来类似任务直接 grep `validate_hierarchy` 5 秒可读
  - **跨项目可迁移性弱**：6 条规则中"orphan"概念绑定本项目 cascade-promote 设计，离开 Ensemble 不一定适用
- **替代信息源**：`src-tauri/src/commands/data.rs` + `types.rs` 的 `HierarchyError` enum 文档

---

### A-2 dnd-kit Tree 的 `MutableRefObject` channel pattern（用 ref 传外部状态给 keyboard coordinateGetter）

- **诱惑来源**：阶段 1B §5.4 把 R2 评估为 "non-trivial" 发现；user MEMORY 已含相关 dnd-kit listeners chain 段，看起来是同类。
- **看似值得保存的理由**：dnd-kit `coordinateGetter` 通过 closure 读外部状态会被缓存的 getter 引用过期——这是个非显然的 React + dnd-kit 集成陷阱。
- **决定不保存的理由**：
  - **`.dev/category-hierarchy/01_research/r2_dnd_tree_architecture.md` 已含完整源码引证 + 官方 Tree example 解构**——这是该模式的 binding 文档源
  - **代码已含**：`src/components/sidebar/dnd/treeKeyboardCoordinates.ts` 实现 + 注释引用 R2 §3
  - **版本耦合**：dnd-kit v6.3.1 的内部缓存机制可能在 v6.4/v7 改变，写 Memory 会变过时陷阱
  - **user MEMORY 已含同维度提示**：`Patterns` 段的 "dnd-kit listeners chain" 已经覆盖"dnd-kit API 不能用 closure 假定，要用 ref/chain 等显式机制"——再加一条只是把粒度切细，没增加新原则
- **替代信息源**：`r2_dnd_tree_architecture.md` §3 + 源码 + user MEMORY `Patterns` 段

---

### A-3 `apply_reorder` 的 "snapshot original_order Vec before HashMap" 算法实现

- **诱惑来源**：sidebar-reorder Session 1 的 user MEMORY `Patterns` 段已有"Rust HashMap iteration order is undefined"提示；本次 hierarchy 任务里 `set_category_parent` + cascade-promote 也都涉及类似的"枚举 + 排序"。
- **看似值得保存的理由**：Rust HashMap 不保证迭代顺序是非显然的（对 Python/JS 背景的人尤其），具体修复 pattern 写成模板更省事。
- **决定不保存的理由**：
  - **user MEMORY `Patterns` 段已覆盖**——"Rust HashMap iteration order is undefined" 已经是稳定 LLM cross-language trap 的提示，本次 hierarchy 任务里**没有遇到该陷阱的复发**（cascade-promote 用的是 Vec 而不是 HashMap）
  - **代码已含**：`apply_reorder` + 12 个 unit test 已经是 binding 实现
  - **过度具体化**：算法实现写进 Memory 等于让 Memory 变成代码片段图书馆，违反 `persistence-system.md` "things inferable from code"
- **替代信息源**：user MEMORY `Patterns` 段 + `src-tauri/src/commands/data.rs::apply_reorder` + 测试文件

---

### A-4 dwell state machine 三态（OUT / HOVER_NEAR / DROP_INTO_READY）+ 12px X + 80ms dwell 阈值

- **诱惑来源**：阶段 1A #1 + #6 把这是"V2 spec 调优产出"，调一次很贵。
- **看似值得保存的理由**：三态 + 阈值是经过反复用户实测调优的"黄金参数"，下次类似 drop-into 交互直接复用。
- **决定不保存的理由**：
  - **`.dev/category-hierarchy/02_design_spec.md` V2.1 §6.3 已是 binding spec**
  - **代码已含**：`SortableCategoriesList.tsx` 的 dwell state machine 实现 + V2.1 promote/demote 非对称分支
  - **场景耦合**：12px / 80ms 是 sidebar 行高 ~36px + 16px 缩进步长 + macOS 默认 DPI 下的产物，跨场景不可迁移
  - **写 Memory 等于把魔法数字假装成跨场景定律**——违反 `persistence-system.md` "No things inferable from code"
  - **更严重的反向风险**：本次 V2.1 修订证明"对称的 12px+80ms"本身是错的（promote 应短路），把数字写进 Memory 会让下次再走对称错误
- **替代信息源**：`02_design_spec.md` V2.1 §6.3 + 源码

---

### A-5 cascade-promote 同名碰撞处理（"Foo (1)" 后缀）+ disambiguation 算法

- **诱惑来源**：V1 Reviewer C 抓到的 P0；最终算法落到 `delete_category` IPC。
- **看似值得保存的理由**：删除带子类的 category 时，把子类提升到 root 但 root 已有同名时怎么办——这是隐性边界条件，非显然。
- **决定不保存的理由**：
  - **代码已含**：`delete_category` 的 cascade-promote 分支 + 同名 disambiguation
  - **测试已含**：`test_delete_with_children_cascade_promote_disambiguation` 锁死语义
  - **跨项目可迁移性弱**：disambiguation 后缀 `(1)` 是 Finder/Slack 通用，但具体应用规则与 Ensemble 数据 schema 耦合
- **替代信息源**：`src-tauri/src/commands/data.rs` + 测试文件

---

### A-6 single SortableContext + projected-depth pattern（dnd-kit Tree 架构选型）

- **诱惑来源**：R2 调研结论 + V2 spec §2 锁定。是本次 dnd-kit Tree 实现的核心架构决策。
- **看似值得保存的理由**：未来任何"树形 dnd"任务都需要先回答"嵌套 SortableContext vs 单 context + projected depth"——这个二选一是非显然的。
- **决定不保存的理由**：
  - **`r2_dnd_tree_architecture.md` 是 binding 调研报告**——已对官方 Tree example 完整解构，比 Memory 摘要详细 100×
  - **dnd-kit 官方 Tree example 本身已存在**——任何未来 session 都可以从 dnd-kit 文档 + R2 重建
  - **过度具体化**：写 Memory 等于把决策结论固化，下次新场景（比如三级树、跨容器）这个结论可能不再适用
- **替代信息源**：`r2_dnd_tree_architecture.md` + dnd-kit 官方 Tree example

---

### A-7 02_design_spec V2 §2.22 anti-pattern 表的 12 项条目

- **诱惑来源**：阶段 1A #10 把 "anti-pattern must be acknowledged" 提为 Rule 候选；anti-pattern 列表本身是高密度知识。
- **看似值得保存的理由**：12 项 anti-pattern（DragOverlay 接 depth、tree 渲染嵌套 SortableContext、dwell 不分 promote/demote ...）是反复评审收敛出来的 "negative space spec"。
- **决定不保存的理由**：
  - **`02_design_spec.md` V2 §2.22 是 binding spec**
  - **`.claude/rules/design-language.md` 已含 Anti-patterns 节**——本次新发现的 anti-pattern 应回流到 design-language.md，不应另存 Memory
  - **任务耦合**：12 项中至少 8 项是 hierarchy 任务特有，不是通用 design language；写进 Memory 会被误用为 "drop-into 交互的通用约束"
- **替代信息源**：`02_design_spec.md` V2 §2.22 + `.claude/rules/design-language.md` Anti-patterns 段

---

### A-8 6 处 dropdown 的 `category_id` 改造完整清单（含 CreateSceneModal）

- **诱惑来源**：R5 grep 调研产出 + V1 Reviewer F 抓到的 P0-DATA-4（CreateSceneModal 漏改）。
- **看似值得保存的理由**：未来任何 schema 改造（加字段 / 改 reference）都需要类似的 grep 全枚举。
- **决定不保存的理由**：
  - **代码已含 + git 已含**：`a4cdcf7` commit 完整记录每处改造 diff
  - **真正的 lesson 已规范化**：`.claude/rules/grep-before-enumerate-shared-resource.md` 已经在 Phase 1 audit 之后加了 second-grep 规则——具体清单是 instance，不是 lesson
  - **结构耦合**：6 处具体位置随项目结构演化迅速过期（拆模块、新增页面会让清单失效）
- **替代信息源**：`grep-before-enumerate-shared-resource.md` + `git show a4cdcf7`

---

## 类别 B: Git 历史可查的变更

> commit message 已经详细描述本次每个 Phase 的产物。Memory 复制 git log = 双份事实，两份必然漂移。

---

### B-1 commit `a4cdcf7` 的 Phase 1-4 完整改动列表

- **诱惑来源**：commit body 包含 Phase 1-4 详细 diff 摘要，看起来值得作为"本次做了什么"的 Memory 入口。
- **看似值得保存的理由**：未来 session 想 reference "上次怎么改 Category schema" 时方便。
- **决定不保存的理由**：
  - **`git show a4cdcf7` 永远可查**——commit message + diff 是 single source of truth
  - **`.dev/category-hierarchy/04_implementation_plan.md` V2 已是 binding plan**
  - 写 Memory 等于让"今天的状态"凝结为"未来的真理"——schema 演化时 Memory 不会自动更新
- **替代信息源**：`git show a4cdcf7` + `04_implementation_plan.md` V2

---

### B-2 V2.1 patch 的 5 轮迭代细节（每轮加了什么 console.warn / 改了哪个分支）

- **诱惑来源**：阶段 1A #1 详细记录 5 轮路径；过程信息密度极高。
- **看似值得保存的理由**：未来类似 "用户实测 → 多轮 fix" 场景的"血泪史模板"。
- **决定不保存的理由**：
  - **过程不是 lesson**：5 轮迭代的细节是 ephemeral state；可迁移的 lesson 已在阶段 1C #1 / 阶段 2D 候选 Rule "用户负反馈触发语义诊断 SubAgent" 中提取
  - **`.dev/category-hierarchy/02_design_spec.md` V2.1 Revision History 已记录关键修订**
  - **过程的负面价值高**：写进 Memory 会让未来 session 误以为"5 轮迭代是正常路径"——实际上**这本身就是返工**
- **替代信息源**：`02_design_spec.md` V2.1 Revision History + 阶段 1A #1

---

### B-3 working tree 的 707 行 SortableCategoriesList diff（commit `a4cdcf7` 之后未 commit 的清理）

- **诱惑来源**：阶段 1A #5 把这作为"工程纪律违反"事件提及；console.warn 加入又移除的 diff 量很大。
- **看似值得保存的理由**：可作为"console.warn 调试纪律"的反例样本。
- **决定不保存的理由**：
  - **临时状态**：working tree 状态会随用户下次 commit 改变；写 Memory 当时正确，5 分钟后过时
  - **lesson 已提取**：阶段 1A #5 已识别"调试日志走 `if (DEBUG_X) console.warn(...)`"作为可写 Memory 候选；具体 707 行 diff 内容是 instance 不是 lesson
  - **不需要保留过程证据**：未来 session 不需要 reference 本次具体 diff
- **替代信息源**：阶段 2E Memory 候选（如果"console.warn debug discipline"被选为 Memory）

---

## 类别 C: CLAUDE.md / 现有 Rules 已覆盖

> 阶段 2D 应该已经识别这些重叠。本节是双保险——确保即使阶段 2D 漏判，2F 也能 catch。

---

### C-1 "调研后再修复" — 已被 `~/.claude/rules/plan-as-research-design.md` + user Memory `feedback_research_before_bug_fix.md` 覆盖

- **诱惑来源**：阶段 1A #1 / 阶段 1C #2 都强调本次有"5 轮跳过调研直接 grep state"的失败。
- **看似值得保存的理由**：本次实证再次证明这条 Rule 的执行力不够。
- **决定不保存的理由**：
  - **已有 Rule + Memory 双覆盖**——Rule 在 ~/.claude/rules/，Memory 在 user MEMORY；再加一条只是稀释信噪比
  - **本次的 lesson 升级是"边界补充"而非"新规则"**——已在阶段 1C M-2 提议补充 `feedback_research_before_bug_fix.md` "用户已给根因则跳过调研"边界，这是**修订**不是**新增**
  - **如果想强化执行力，应该把 lesson 体现在 SubAgent prompt template 而非 Memory**
- **替代信息源**：`~/.claude/rules/plan-as-research-design.md` + user MEMORY `feedback_research_before_bug_fix.md`（含 M-2 修订）

---

### C-2 "shared-resource grep 全枚举" — 已被 `.claude/rules/grep-before-enumerate-shared-resource.md` 覆盖（且本次已加 second-grep 修订）

- **诱惑来源**：phase1_t1f_audit 发现 4 个 mutator 漏锁 → 已升级 Rule 加入"defense-in-depth second grep"。
- **看似值得保存的理由**：本次实证证明这条 Rule 的执行力不够。
- **决定不保存的理由**：
  - **已 in-place 修订该 Rule**——rule 文件已经包含 T1f Phase 1 audit 案例 + second-grep 段
  - **再加 Memory 等于把"已被规范化的 lesson"再写一份**——违反 single source of truth
- **替代信息源**：`.claude/rules/grep-before-enumerate-shared-resource.md`（已含 T1f 案例 + second-grep）

---

### C-3 "数值等价声称必须 reproduce" — 已被 `.claude/rules/validate-numerical-equivalence-claims.md` 覆盖

- **诱惑来源**：本次未触发，但 sidebar-reorder Session 1 的 spring vs cubic-bezier 教训仍是"高 leverage 反复出现"类。
- **决定不保存的理由**：
  - **已 Rule 化**——本次没有再触发，证明 Rule 起作用
  - **没有补充必要**
- **替代信息源**：`.claude/rules/validate-numerical-equivalence-claims.md`

---

### C-4 "第三方库行为必须 link 源码" — 已被 `.claude/rules/verify-third-party-behavior-firsthand.md` 覆盖

- **诱惑来源**：本次 R2 dnd-kit 调研深度引证 node_modules 源码（line 3666 等）即是这条 Rule 的成功应用。
- **决定不保存的理由**：
  - **已 Rule 化 + 本次实证 Rule 起作用**——R2 调研严格遵守该 Rule
  - **没有补充必要**
- **替代信息源**：`.claude/rules/verify-third-party-behavior-firsthand.md`

---

### C-5 "测试隔离 negative guarantee" — 已被 `.claude/rules/fallback-path-must-be-unreachable-in-test.md` 覆盖

- **诱惑来源**：上次 Session 1 复盘新建的 Rule；本次 cargo test 全部用 ScopedDataDir，无复发。
- **决定不保存的理由**：
  - **已 Rule 化 + 本次零复发**——证明 Rule 起作用
  - **没有补充必要**
- **替代信息源**：`.claude/rules/fallback-path-must-be-unreachable-in-test.md`

---

### C-6 "Plan 文档风格 ≤ 800 行 / 任务卡 ≤ 30 行" — 已被 `.claude/rules/plan-document-style.md` 覆盖

- **诱惑来源**：本次 04 V1 撰写超 64K token 失败 → 已 in-place 转 Rule。
- **决定不保存的理由**：
  - **已 Rule 化 + V2 343 行实证有效**
  - **可能补充扩展（02 ≤ 1000 / 03 ≤ 1500）应作为 Rule 修订（阶段 1A R-7 / 阶段 2D 应已识别）**——不是新 Memory
- **替代信息源**：`.claude/rules/plan-document-style.md`（如有 size discipline 扩展则修订该 Rule）

---

### C-7 "cross-document cascade discipline" — 已被 `.claude/rules/cross-document-cascade-discipline.md` 覆盖

- **诱惑来源**：本次 phase1_audit 发现的 P0-1（_v2_patch_plan vs 03_tech_plan §3.4 内容矛盾）证明现有 Rule 的 scope 不够。
- **决定不保存的理由**：
  - **已 Rule 化**——本次的 lesson 是 scope 扩展（doc comment / 测试名 / commit message / SubAgent prompt template），应作为 Rule 修订（阶段 1A R-4 / 阶段 2D 应已识别）
  - **不应作为 Memory**——cascade discipline 是行为规则，不是 Claude 学习
- **替代信息源**：`.claude/rules/cross-document-cascade-discipline.md`（待修订加 scope）

---

### C-8 "Apple/Linear/Things 3 设计标准" — 已被 user MEMORY `project_ensemble_design_standard.md` + `.claude/rules/design-language.md` 双覆盖

- **诱惑来源**：本次"磁吸太强"事件再次印证用户对克制 / 物理感的偏好。
- **决定不保存的理由**：
  - **Memory + Rule 双覆盖**
  - **本次没有引入新维度**——只是再次实证已有标准
- **替代信息源**：user MEMORY `project_ensemble_design_standard.md` + `.claude/rules/design-language.md`

---

## 类别 D: 临时性的调试过程

> 调试过程产物零跨项目价值，只是本次特定 bug 的副产物。

---

### D-1 7 处 console.warn 诊断 log 的具体位置 / 文本（`[DragEnd] enter`、`[reorderCategories] Stage 1` ...）

- **诱惑来源**：诊断输出帮主 Agent 定位 V2.1 修订的关键 bug。
- **决定不保存的理由**：
  - **临时调试态**——已 cleanup（待 commit）
  - **lesson 已提取**："调试日志走 dev-mode-only flag" 已在阶段 1A #5 + 阶段 1B §3.3 / 阶段 2E 候选中
  - **具体文本零再次复用价值**——下次 bug 在不同位置，console.warn 文本必然不同
- **替代信息源**：阶段 2E Memory 候选（如有"console.warn debug discipline"）

---

### D-2 多次 build + reinstall 的 md5 hash 对比

- **诱惑来源**：user MEMORY `Build & Deploy` 段已经写过"用 md5 对比二进制确认是否已替换"；本次 4-5 次实测都用了。
- **决定不保存的理由**：
  - **user MEMORY 已写过 md5 对比方法**——再写一条是冗余
  - **每次具体 md5 hash 零保留价值**
- **替代信息源**：user MEMORY `Build & Deploy` 段

---

### D-3 各 SubAgent 的 self-claim confidence（80%、92%、95%、78/100 等）

- **诱惑来源**：每个 SubAgent 评分看起来是质量代理指标。
- **决定不保存的理由**：
  - **self-claim confidence 不是稳定参考**——SubAgent 给自己打分通常偏高（典型偏差 +15-20%）
  - **数字本身零再次使用价值**——下次 SubAgent 完全是不同评分基线
  - **`persistence-system.md` "No ephemeral state"** 明确禁止
- **替代信息源**：无（不应保留）

---

### D-4 V1 reviewer A/B/C/D/E/F 给的 22 个具体 P0 编号 / 11 个 P1 编号

- **诱惑来源**：编号系统看起来工整；阶段 1A / 1B 引用了部分编号。
- **决定不保存的理由**：
  - **编号绑定本次 V1 spec 文件，跨项目无意义**
  - **真正的 lesson 在"V1 评审 6.6 平均分"的 takeaway**——已在阶段 1B §6.2 / 阶段 1A #6 提取
  - **`.dev/category-hierarchy/05_review/` 已是 binding 历史**——需要查具体编号永远可读
- **替代信息源**：`.dev/category-hierarchy/05_review/`

---

### D-5 phase1_audit / phase1_t1f_lock_audit / final_audit 的具体分数（88、95、78）

- **诱惑来源**：分数演变看起来像质量曲线。
- **决定不保存的理由**：
  - **三轮分数是 V2 spec 修订过程的痕迹**——已 ship 后这些分数零未来参考价值
  - **真正的 lesson 在"末端单审 vs phase-by-phase"的取舍**——已在 user MEMORY `feedback_phase_review_loop.md`（待修订）覆盖
- **替代信息源**：user MEMORY `feedback_phase_review_loop.md`（含 M-1 修订）

---

### D-6 4 轮 drop-into 修复的具体尝试细节（diff 行号、改了什么 prop、加了什么 ref）

- **诱惑来源**：阶段 1A #1 详细记录了每轮的 diff 行号 + 改动内容。
- **决定不保存的理由**：
  - **过程不是 lesson**——4 轮尝试细节零未来参考价值，最终方案才有价值
  - **最终方案已 in-code**——`SortableCategoriesList.tsx` + `treeUtilities.ts` 当前 working tree 就是
  - **写过程进 Memory 反而误导**——让下次类似 bug 误以为"4 轮路径是常态"
- **替代信息源**：当前源码 + `.dev/category-hierarchy/02_design_spec.md` V2.1

---

## 类别 E: 可从源文件重新提取的标准 / 规范

> 5 分钟内能 grep 重建的内容不是 Memory 候选。

---

### E-1 `index.css` token 列表（color tokens / easing tokens / duration tokens）

- **诱惑来源**：`.claude/rules/design-language.md` 引用了完整 token 表，看起来是高密度参考。
- **决定不保存的理由**：
  - **直接读 `src/index.css` 即可**
  - **`design-language.md` 已含 Constraints 节** 引用源文件位置
  - **Token 演化**——写 Memory 必然过期
- **替代信息源**：`src/index.css` + `.claude/rules/design-language.md`

---

### E-2 V3 不变量 23 项完整清单

- **诱惑来源**：阶段 1A 多次提及"DragOverlay 不接 depth prop"等 V3 不变量；23 项完整清单看起来值得固化。
- **决定不保存的理由**：
  - **`.dev/sidebar-reorder/02_design_spec.md` V3 §7 完整列出**
  - **`.dev/category-hierarchy/02_design_spec.md` V2 §7 已 verbatim quote**——双份记录
  - **任何 reviewer SubAgent 直接读 V3 spec 即可**
- **替代信息源**：`.dev/sidebar-reorder/02_design_spec.md` V3 §7

---

### E-3 dnd-kit Tree example 算法 / API（flattenTree / buildTree / getProjection）

- **诱惑来源**：R2 调研深度引证；本项目源码也实现了。
- **决定不保存的理由**：
  - **dnd-kit 官方 Tree example 永远在线**——`https://5fc05e08a4a65d0021ae0bf2-mcwflzphcd.chromatic.com/?path=/story/examples-tree-sortable--all-features`
  - **R2 已 verbatim quote 算法 + 行号**——`r2_dnd_tree_architecture.md` 是 binding artifact
  - **本项目源码实现于 `treeUtilities.ts`**
- **替代信息源**：dnd-kit 官方 Tree example + R2 调研报告 + 本项目 `treeUtilities.ts`

---

### E-4 R1-R7 七份调研报告的核心结论摘要

- **诱惑来源**：合计 458K 字调研产出，看起来摘要后能浓缩成 Memory。
- **决定不保存的理由**：
  - **`.dev/category-hierarchy/01_research/` 已是 binding artifact**——任何 future session 直接读
  - **摘要会误导**——R1 70K 字浓缩成 Memory 的几行必然丢失非主流观点（参 V1 评审 F 说的"R1 已写 risk 但 V1 漏"）
  - **跨项目可迁移性弱**——多数 R 内容耦合本项目数据 schema / dnd-kit
- **替代信息源**：`.dev/category-hierarchy/01_research/r1-r7`

---

## 类别 F: 太特定 / 太长尾的发现

> 这一类的诱惑来自"看起来是教训"，但教训过于绑定本次 instance，写进 Memory 会让未来 session 误用。

---

### F-1 "本次用 7 个 wave 1 SubAgent 而非 4 个是浪费"

- **诱惑来源**：阶段 1B §6.1 表详细论证 R3/R4/R6 overlap heavy。
- **决定不保存的理由**：
  - **数字 7 vs 4 不能跨项目泛化**——下次任务复杂度 / 决策点数量不同，3 / 5 / 8 都可能正确
  - **真正可迁移的是"调研类 SubAgent 的 ROI sanity check 步骤"**——已在阶段 1B §6.1 末尾建议为 Constitution 升级（Stage 1D 决议）
  - **写"上次 7 个浪费"进 Memory 等于设定下次"≤ 4"的迷信下限**
- **替代信息源**：阶段 1B §6.1（如有 Constitution 升级则落到 ~/.claude/CLAUDE.md）

---

### F-2 "用户偏好 dot 居中" 等具体视觉元素偏好

- **诱惑来源**：本次 chevron 设计 + dot 视觉确实有具体决策。
- **决定不保存的理由**：
  - **`.claude/rules/design-language.md` Anti-pattern 节已含相关偏好**——具体决策已转 Rule
  - **再写一条 Memory 等于污染 design-language.md 的权威**
- **替代信息源**：`.claude/rules/design-language.md`

---

### F-3 "Tauri 2 `#[allow(non_snake_case)]` 让 Rust function param 直接接 camelCase"

- **诱惑来源**：阶段 1B §5.3 把这识别为"non-trivial 技术事实偏差"。
- **决定不保存的理由**：
  - **Tauri 2 特定 + 非 surprising**——这种 Rust 集成 trick 在 Tauri 文档里有提及
  - **本项目代码已用**——`set_category_parent(id, newParentId: ...)` 是 reference implementation
  - **跨项目可迁移性弱**——非 Tauri 项目不用
- **替代信息源**：本项目源码 + Tauri 2 文档

---

### F-4 "T2c categoryTree.ts 与 T2a appStore.Category.parentId 的 type-level 隐性依赖"

- **诱惑来源**：阶段 1B §3.1 把这识别为"非显然依赖关系"。
- **决定不保存的理由**：
  - **太项目特定**——T2c / T2a 是本次任务卡编号，离开 04_implementation_plan 完全不可读
  - **lesson 已抽象**——"任务依赖图必须包括 type 字段定义"已在阶段 1B 提取，**但抽象后过于平庸**（任何 TS 项目的 SubAgent 都该懂这个），不达 Memory 标准
- **替代信息源**：阶段 1B §3.1（如最终决定保留）

---

### F-5 "handleSetCategoryParent 的 try/catch + moveCategoryToParent 的 fallback 形成静默失败"

- **诱惑来源**：阶段 1B §3.2 + final_audit P2 backlog 提及。
- **决定不保存的理由**：
  - **太项目特定**——具体函数名只在本项目存在
  - **lesson 抽象后是"防御性编程多层 catch 形成静默失败"——属于 React/前端常识**，不达 Memory 标准
  - **本次没真造成问题**——只是 P2 backlog 待修
- **替代信息源**：无（不应保留）

---

### F-6 "T1c/T1d/T1e 三并行修同一文件 data.rs 是侥幸通过"

- **诱惑来源**：阶段 1B §6.5 提议为可写 Memory。
- **决定不保存的理由**：
  - **抽象后过于平庸**——"多 SubAgent 同改一文件应串行"是工程常识，写进 Memory 信噪比低
  - **本次没真造成问题**——属于"理论风险"
  - **更高 leverage 的修订**：让 SubAgent prompt template 默认包含 "if multiple SubAgents touch the same file, declare dependency" 字段，但这是 Constitution / Skeleton 改进，不是 Memory
- **替代信息源**：无（不应保留）；如想强化，作为 Constitution 二.7 编排责任的补充

---

### F-7 "code-reviewer / animation-reviewer / alignment-checker SubAgent 作为命名角色"

- **诱惑来源**：本次实战验证有效；看起来值得作为 SubAgent 角色库积累。
- **决定不保存的理由**（与 Session 1 不保存清单 #11 同根因）：
  - **是 Skill / Subagent 配置问题，不是 Memory 问题**——若值得规范化应作为 `.claude/agents/`
  - **Memory 不是工具列表存储位置**
  - **任务驱动定义比固定角色更灵活**
- **替代信息源**：本次 SubAgent prompt 历史 + Constitution §二.1 / §二.6

---

### F-8 "用户在 Console output 截图后没说'你看一下'，主 Agent 应直接进入诊断"

- **诱惑来源**：阶段 1C I-1 把这作为推断偏好。
- **决定不保存的理由**：
  - **阶段 1C 自己已标记"暂不写入，待下次 session 验证"**——单 session 单证据不达 Memory 标准
  - **可能是用户性格偏好，可能是某次场景特殊**——需要多次实证
- **替代信息源**：阶段 1C I-1（标记为待验证）

---

### F-9 "用户在主 Agent 解释为什么之前没改对时不回应 → 用户希望快速承认 + 修正"

- **诱惑来源**：阶段 1C I-2 把这作为推断偏好。
- **决定不保存的理由**：
  - **阶段 1C 自己已标记"暂不写入，待下次 session 验证"**
  - **可能与本次"5 轮返工"特殊场景耦合**
- **替代信息源**：阶段 1C I-2（标记为待验证）

---

### F-10 "用户作为观察 + 高层描述角色，不希望被要求做底层调试"

- **诱惑来源**：阶段 1C I-3 把这作为推断偏好。
- **决定不保存的理由**：
  - **阶段 1C 自己已标记"暂不写入，待下次 session 验证"**
  - **跨项目证据不足**——其他项目（如学术）用户可能很乐意给 reproduction step
- **替代信息源**：阶段 1C I-3（标记为待验证）

---

## 类别 G: 阶段 1C 已识别的 3 个"误判偏好"陷阱

> 阶段 1C 自己已标注这三项**不是真偏好**——本节只是再次确认 2F 不保存。

---

### G-1 "用户允许 V2.1 修订 ≠ 用户希望每次都做这种修订循环"

- **来源**：阶段 1C 八.陷阱 #1。
- **本节再次确认**：用户接受了本次 V2.1，但**不**意味着希望未来每个 UI 反馈都走"V2 → V2.1 → V2.2"流程。下次类似反馈应直接改代码 + 测试，不主动建 V2.1 文档。
- **不保存原因**：阶段 1C 已标记为陷阱，主 Agent 在 Stage 1D 决议时应**主动反向核对**——确保不会有任何 Memory 候选实际上落到"鼓励多版本号修订"的方向。

---

### G-2 "用户写 `_synthesis_decisions.md` Decisional 文档 ≠ 用户希望每个任务都建这种四件套结构"

- **来源**：阶段 1C 八.陷阱 #2。
- **本节再次确认**：四件套（_synthesis_decisions / 02_design_spec / 03_tech_plan / 04_implementation_plan）是因为本次任务复杂 + 多 SubAgent 协作才需要——简单任务不需要。
- **不保存原因**：阶段 1C 已标记为陷阱；主 Agent 在 Stage 1D 决议时应核对——任何 Memory 候选都不应隐含"四件套是默认结构"的假设。**此项与阶段 1C #2 PREF-RESOURCE-EFFICIENCY 配套**——后者是新增 Memory 写入"调研深度按任务复杂度校准"，前者是反向闸门"不要把四件套当作默认"。

---

### G-3 "用户没明确反对 phase-by-phase 评审 ≠ 用户认可这种模式"

- **来源**：阶段 1C 八.陷阱 #3。
- **本节再次确认**：本次 phase1_audit + phase1_t1f_lock_audit 跑了，用户没反对。但事后从资源效率反馈倒推，phase-by-phase 评审属于**用户容忍但非偏好**。
- **不保存原因**：阶段 1C 已标记；现有 user MEMORY `feedback_phase_review_loop.md` 必须按 1C M-1 改为"末端单审"，否则保留旧标题"phase-by-phase"会再次误导。

---

## 边界判断 ambiguous 清单（"似该保存似不该"的边缘 case）

> 本节标注那些介于"该保存"与"不该保存"之间的灰色案例 + 主 Agent 的决断方向。Stage 1D 决议时应优先审视这 3 项。

---

### Edge-1 "调研→规划之间多一份 `_risk_distillation.md`"（来自阶段 1A R-5 / 阶段 1B §6 共性根因 #3）

- **诱惑维度**：本次 V1 评审 6.6 平均分的根因是"R*.md risk 没有被 cross-check"——多一份 _risk_distillation.md 是直接解药。这看起来是 high-leverage 方法论。
- **不保存倾向理由**：
  - 这是**单 session 单实证**——可能是本次 V1 写得太详细诱发了过度评审，risk distillation 是症状治疗而非根本治疗
  - 真正的根本治疗是"V1 直接写 V2 级别"（即不要写 1300 行的 V1 spec）——这与 _risk_distillation.md 是不同方向
  - 如果走 _risk_distillation 路径，会再加一层方法论开销，可能让本来就 overplanned 的流程更重
- **保存倾向理由**：
  - `~/.claude/rules/plan-as-research-design.md` Layer 2 "Synthesis Gate" 已经隐含这个意图——升级该 Rule 增加显式 artifact 不算大改
  - 跨项目可迁移性强（任何 research-first 工作流）
- **决断方向**：**Stage 1D 应判断 → 倾向"暂不立 Rule"**——优先级让位于"任务规划深度三档分类" Rule 升级（阶段 1B §7 / 阶段 1C #2）。如果未来另一项目再次出现同类 V1 评审低分，再升级。
- **去向（如保留）**：`~/.claude/rules/plan-as-research-design.md` 修订（Layer 2 加 artifact）；不是新 Memory

---

### Edge-2 "Symmetric inverse operation pair must explicitly justify same-gate vs split-gate"（来自阶段 1A R-1）

- **诱惑维度**：本次 V2.1 5 轮返工的根因——promote/demote 隐式对称是未识别决策点。如果有这条 Rule，spec 阶段就会显式问"两者 gate 是否对称"。
- **不保存倾向理由**：
  - **太抽象**——"对称 vs 非对称"几乎适用于一切交互；写成 Rule 容易被理解为"任何成对操作都要列对称性决策"，导致 spec 膨胀
  - **本次单证据**——单一 instance 不足以提取通用 Rule
  - **可能与"任务规划深度三档分类"冲突**——简单任务不需要这种全方位决策点扫描
- **保存倾向理由**：
  - 影响极大（5 轮返工的根源）
  - 跨项目可迁移性强（promote/demote、attach/detach、expand/collapse 等都适用）
  - 阶段 1A 标 P0 优先级
- **决断方向**：**Stage 1D 应判断 → 倾向"项目级 Rule"**——本次实证性极强，但不达全局 Rule 三标准；先项目级，让未来其他项目（如学术综述用户研究 X 因素 Y 结果对称性）出现类似失败再升 global。
- **去向（如保留）**：`.claude/rules/symmetric-inverse-operation-justification.md`（项目级）

---

### Edge-3 "评审 SubAgent 数量随 P0 收敛而缩减"（来自阶段 1B §2.4 / §6.2 / 阶段 1A #7）

- **诱惑维度**：本次 V1 6 reviewer → V2 1 alignment + 1 final audit 的演化轨迹是质量收敛的代理；这是新发现的编排范式。
- **不保存倾向理由**：
  - **数字 6→1 不能跨项目泛化**——下次任务可能 4→1 / 8→2，绑定具体任务复杂度
  - **真正的 lesson 是"V1 是否需要 6 reviewer 取决于 V1 spec 自身质量"**——如果 V1 一次到位 V2 级别，根本不需要 6 reviewer。这条 lesson 的根因落在"V1 写得太全"，与本条不重合
  - **写进 Memory 容易被误用**——下次任务 V2 阶段可能仍需 5+ reviewer（如果 V2 spec 又加了大量内容）
- **保存倾向理由**：
  - 阶段 1B §6.2 / §6.3 详细论证 6→1 的 ROI 演化
  - 跨项目可迁移性中（任何多轮评审都涉及）
- **决断方向**：**Stage 1D 应判断 → 倾向"暂不立 Memory"**——优先级让位于更高 leverage 的"任务规划深度三档分类"。如果下个项目再次实证，再考虑。
- **去向（如保留）**：user MEMORY 新建 `feedback_review_count_decreases_with_p0_convergence.md`（项目级）

---

## 总结

- **不保存类别**：7（A-G）
- **不保存条目总数**：32
  - 类别 A（代码/spec 已含）：8 条
  - 类别 B（git 已含）：3 条
  - 类别 C（CLAUDE.md/Rules 已覆盖）：8 条
  - 类别 D（临时调试态）：6 条
  - 类别 E（可重新提取）：4 条
  - 类别 F（太特定/长尾）：10 条（含阶段 1C 标记的 3 条推断偏好）
  - 类别 G（阶段 1C 已识别陷阱）：3 条
  
  注：单条可同时归多个类别（如 D-1 也属 C-类已覆盖），分布相加略超 32 是预期。

- **边缘 case**：3（Edge-1 _risk_distillation / Edge-2 对称性决策 Rule / Edge-3 评审数量缩减 Memory）——Stage 1D 决议时优先审视。

---

## 给主 Agent 的反向闸门提醒

> 这一节是 2F 的核心价值——除了列出"不保存"，更要给主 Agent 在 Stage 1D 决议时的反向核对清单。

### Trap 1：不要把"过程精华"当作"方法论"

本次最容易踩的陷阱：5 轮 drop-into 修复 / V1→V2→V3 评审循环 / 7 个 wave 1 SubAgent / 3 轮 audit ——这些都是过程，**且大部分是返工证据**。把过程细节写进 Memory 会让未来 session 误以为"5 轮 / 3 轮 / 7 个"是常态。

### Trap 2：不要让 Memory 变成代码 / spec 的影子

本次涉及大量代码细节（dwell 三态、12px 阈值、validate_hierarchy 6 规则、cascade-promote disambiguation ...）。这些都在源码 + spec + commit 里。Memory 如果复制这些，三处不同步必然漂移；Memory 摘要永远是过期版本。

### Trap 3：不要把"已被规范化的 lesson"再写一份 Memory

本次许多 lesson 已经在现有 Rules 里（grep-before-enumerate / cross-document-cascade / plan-document-style / verify-third-party-behavior 等）。本次实证只是再次证明 Rule 的执行需要补强——补强 Rule body 比另写 Memory 更高 leverage。

### Trap 4：不要把"误判偏好"写入 Memory

阶段 1C 已识别 3 个陷阱（V2.1 修订循环、四件套、phase-by-phase）+ 3 个推断偏好（I-1/I-2/I-3 暂不写入）。Stage 1D 决议任何 Memory 候选时，必须**反向核对**：候选是否实际上是这 6 项之一的换皮？任何"看起来鼓励多版本号修订 / 默认四件套 / 默认 phase-by-phase 评审"的 Memory 都属于这类。

### Trap 5：单 session 单实证 ≠ 跨项目可迁移

本次许多发现（symmetric inverse operation、_risk_distillation、review count decrease ...）都是 **单 session 单实证**。`persistence-system.md` 全局 Rule 三标准要求 "Multi-project evidence"——单实证只够项目级 Rule 或暂不立。Stage 1D 决议时应严格区分"单 session 教训"与"跨项目模式"。

### Trap 6：抽象到平庸 = 不达 Memory 标准

本次 F-4 / F-5 / F-6 都是抽象后变得平庸（"type 字段依赖"、"多层 catch 静默失败"、"多 Agent 改同文件应串行"）——这些是工程常识，写进 Memory 信噪比低。Memory 应保留**非常识**的 Claude 工作模式学习。

---

## 共性原则总结

本轮 32 项不保存条目都源自 **三个心智误区**：

1. **"过程信息密度高 = 应该保存"**——本次 session 5 轮 V2.1 修订 / 6 reviewer / 4 阶段 audit 都是高密度过程，但密度 ≠ 价值。Memory 应保留 **跨项目可迁移的 Claude 工作模式**，过程细节属于 git / `.dev/`，不属于 Memory。

2. **"具体细节 = 方便下次直接用"**——12px 阈值 / 6 验证规则 / V1 评审 22 P0 编号 / 707 行 diff 看似省了下次查询时间，实际造成 (a) 漂移——代码演化后 Memory 内容过期但 Memory 自己不知道；(b) 过度具体化——具体数字会被误用为通用配方。

3. **"实证一次 = 该写规则"**——本次 5 轮返工 / V1 评审 6.6 分 / 7 个 wave 1 SubAgent 浪费都是单 session 实证。`persistence-system.md` 全局 Rule 标准要求 multi-project evidence；单实证至多升项目级 Rule 或暂不立。

> 反向决策原则（给主 Agent 的简记）：**5 分钟内能从源码 / spec / git / 现有 Rule grep 到的事实 → 不写 Memory。Memory 只装这些通道无法替代的 Claude 工作模式学习。**
