# Stage 1A — 返工溯源

> 范围：Sidebar reorder Session 全过程。
> 数据来源：`_session_summary.md` 时间线 + `05_review/` 12 份评审 + `06_snap_research.md` + git log 实证。
> 严格性：每个根因深挖到"信息/方法/假设"层面；每条事件 trace 得到具体文件/行号。

---

## 返工事件清单（按严重度排序）

### #1 测试污染用户真实数据 (F1 / 事件 A)

- **表面原因**：T1 SubAgent 写的 Rust 测试经由 `get_app_data_dir()` 的 home-dir fallback 写到了 `~/.ensemble/data.json`。`ENV_TEST_LOCK` 在跨模块并发或某次 SubAgent 迭代中被绕过（env var 短暂未设），导致测试 fixture 覆盖真实数据。用户拒绝恢复，主 Agent 在 `116bdda` 用 `cfg(test)` panic 替代 fallback。

- **根因（深一层）**：**fallback 是默认安全错觉**。`get_app_data_dir()` 设计时把"home dir 兜底"当作"对生产稳健"的优点，但同一函数被 cargo test 复用，fallback 就从兜底变成 footgun——只要任何一个测试漏调 `ScopedDataDir`，就静默写真实磁盘。规划层（`05_feasibility_review.md` P0-3 line 102-138）已经预警"测试不能直接 hit 真实文件 IO"，但只给了"加 ENSEMBLE_DATA_DIR env override + tempdir + ENV_TEST_LOCK"这种**positive guarantee 防御**——所有路径必须正确才安全，少一个就翻车。这条思路本身有问题：在多 SubAgent 并行写代码、且 env var 是进程级共享状态的环境下，**假设"每个 caller 都记得 acquire lock"是不可执行的**。正确思路应是 **negative guarantee**：让生产路径在测试上下文里物理不可达（panic 而非 fallback），把"忘了"从可能性彻底删除。从更高层看：这是**信任默认行为而不质疑默认假设的失误**——主 Agent 看到 SubAgent 给出的测试方案后没问"如果这个 lock 没被 acquire 怎么办"，因为 lock 看起来已经处理了 race。

- **一步到位方案**：T1 任务卡里直接规定：`get_app_data_dir()` 在 `cfg(test)` 下**必须 panic 而非 fallback**，无 ENSEMBLE_DATA_DIR 即视为编程错误。`116bdda` 的设计应当从一开始就是 T1 实施要求，而不是事故后的修复。

- **可规范化为 Rule？**：**YES**——可写一条全局 Rule "Test isolation by negative guarantee, not positive lock"。任何在 cfg(test) 下能复用生产路径的代码（路径解析 / 默认值 / fallback），必须在测试上下文里物理不可达，而不是依赖每个 caller 的纪律。已具备跨项目复用价值（任何 Tauri / Rust / 任何使用 home-dir 配置的 CLI 都会撞上）。

- **影响**：用户全部 Categories/Tags/Scenes 数据丢失（不可恢复，用户拒绝恢复，重新整理）。这是本 Session 唯一**用户数据级**事故。

---

### #2 V3 之前 04 文档未跟上 V2→V3 修订 (F4 / 事件 F)

- **表面原因**：02/03 在 V2→V3 时改了三个核心点（restrictToVerticalAxis 删除、settle distance-aware 公式、cancel 撤销 spring overshoot），但 04 implementation plan T8 modifiers 配置 + T13b acceptance #4/#8 仍是 V2 的措辞。T0 对齐 SubAgent 在 `06_v3_alignment_check.md` 才发现这 3 个 P0 矛盾，主 Agent patch。

- **根因（深一层）**：**修文档时缺失"反向引用扫描"**。02 修订一处会在 03/04 多处被引用——比如 settle 时长公式在 02 §2.6 改、在 02 §6.1 acceptance 里也要改、在 03 §7 onDragEnd 实现也要改、在 04 T13b 视觉验证清单里也要改。V2→V3 修订时主 Agent 把 02 改完后，没有系统化扫描"02 这一处改动会牵连哪些 03/04 段落"。**document-authority-ranking** rule 只解决了"冲突时谁赢"，没解决"修订时谁要跟着改"的级联问题。从更高层看：这是**把"改文档"当成单点编辑而不是 graph mutation**——文档不是孤立文件，是带有引用链的 DAG，修一个节点必须把它的所有 transitive references 同步过——但没有显式的 cascade 机制。

- **一步到位方案**：每次修订 02/03/04 时，主 Agent 派一个对齐 SubAgent 同步发布，input = 改动 diff，output = "本改动 cascade 到的所有其他文件 / 段落清单"。或者更轻量：02 修订完成后立刻在 commit message / revision history 里列出"本次修订 cascade 到 03 §X / 04 T#"，下一轮修 03/04 时主 Agent 把这条作为 must-touch checklist。

- **可规范化为 Rule？**：**YES**（项目级或更宽）——可写一条 "Cross-document cascade discipline"。多文档协同的项目（spec/plan/implementation 三件套）每次修订必须显式声明 cascade footprint，避免下游文档版本错配。

- **影响**：T0 对齐发现 3 个 P0；如果 T0 跳过直接进 T1-T13，T8 SubAgent 会按 04 实施 → DragOverlay 跟手卡 X=0 重现 V2 P0 bug，T13b 用户验证才察觉，回滚成本高。**幸而 T0 拦截**，实际损失 = T0 SubAgent + 主 Agent patch 一轮（约 30 分钟）。

---

### #3 磁吸生硬 (F3 / 事件 B)

- **表面原因**：用户实测后说"非常生硬，几乎没有任何动效"。`06_snap_research.md` §1 调研后查清三层根因：
  1. snapModifier.ts 用硬阈值 binary（dist≤12 → snap 满量），导致进入瞬移 12px、阈值内死板、离开反向瞬移 12px
  2. DragOverlay wrapper 没有任何 CSS transition transform（dnd-kit 默认 transition=undefined）
  3. snapModifier.ts 第 7-8 行注释撒谎："The 80ms smooth transition is provided by DragOverlay's intrinsic CSS transition on transform"——这条注释指向不存在的实现

- **根因（深一层）**：**spec→实施层的实现假设没被验证**。02 §2.5 写"12px snap + 80ms 平滑过渡"，03 §11 给出 modifier 代码 + §10 给出 transition CSS——但**整套设计依赖一个未被验证的假设："DragOverlay wrapper 的 inline transform 改变会被 CSS class 上的 transition 平滑过渡"**。实际上 dnd-kit v6.3.1 的 PositionedOverlay 把 transform 写到 inline style（line 3666），而 inline style 优先级高于 class——但这里不是"被覆盖"问题，是"transition 字段定义错位置"问题：transition 应当写在 wrapper 自身的 className 上，但项目 CSS 里 .drag-overlay-row / .drag-overlay-pill 都没有 `transition: transform`。这个 gap 在 V3 final review §2.3（`v3_final_review.md` 247-322 行）已经标注为 P1 残留 "T8 SubAgent 验证"，但**主 Agent 在 patch 时未把 P1 转为 T8 显式实施代码**——只 acknowledge 了 "需用 `<DragOverlay style={{ transition }}>`" 的方向，没强制 SubAgent 写出来。从更高层看：这是**"知道有问题但只标注而不修"**的失误——P1 残留在主 Agent 的工作流里被默认推迟到下游 SubAgent，但 SubAgent 拿到 P1 注解后倾向于"按主 spec 字面写"，注解只成了文档不是行动指令。

- **一步到位方案**：03 §11 的 snapModifier 应当从一开始就用**连续引力函数 + 帧间 lerp**（即 `06_snap_research.md` §4 的方案 E+C），不依赖 CSS transition——这正是磁吸调研后的结论。原始 V3 design spec §2.5 写"12px snap + 80ms 平滑"是工程上不可靠的接口（依赖未验证的 CSS 接管），应当 V3 评审就拦截。具体来说：每当 spec 写"X 由 CSS Y 提供"时，必须配套验证"X 是否真的能被 Y 提供"——这条验证应在 V3 评审阶段（架构评审或可行性评审）做。

- **可规范化为 Rule？**：**YES** —— "Validate cross-layer implementation assumptions before approving spec"。Design spec 里凡是声称"由其他层（CSS / dnd-kit / 浏览器默认）提供"的物理特性，必须有一手代码或源码引用证明该层确实提供。本项目的根因 = spec 假设 dnd-kit DragOverlay 提供 intrinsic CSS transition（事实是 transition=undefined）。这条 Rule 在跨项目场景广泛适用（Web / Native / 任何分层架构）。

- **影响**：用户首次实测就给负反馈"非常生硬"，主 Agent 派磁吸调研 SubAgent → 改连续软引力 + 帧间 lerp → 用户验收"非常棒"。约 1.5 小时返工。

---

### #4 onKeyDown shadow dnd-kit KeyboardSensor (H 事件)

- **表面原因**：T6 SubAgent 写的 SortableCategoryRow 自定义 onKeyDown handler 在 `{...listeners}` 之后声明 → 后者覆盖前者 → dnd-kit KeyboardSensor 失效，键盘 reorder 整体不工作。code-reviewer SubAgent 在 T13a 之后才发现。

- **根因（深一层）**：**JSX props 后写覆盖前写的特性是 React 默认行为，但 SubAgent 看到的是"加一个 onKeyDown 监听就好"——没有意识到自己在和 listeners 抢同一个 prop key**。这是**SubAgent 在不熟悉的 lib API 上操作时的盲区**：dnd-kit 的 listeners 对象包含 onKeyDown，要透传必须 chain（先调 listeners.onKeyDown 再调自己的 handler）。03 §8 实现示例只写了 `{...attributes} {...listeners}`，没有提到"加 onKeyDown 时必须 chain 而非 shadow"——T6 任务卡也没说。从更高层看：这类**库 API 隐式 contract 的踩坑**没法靠"读 lib 文档"自动避免，需要通过经验或显式 lint 规则——在 SubAgent 缺乏长期记忆的情况下，必须在任务卡里把已知踩点写出来。

- **一步到位方案**：T6/T7 任务卡的"实现要点"里加一条 "如需新增 onKeyDown / onMouseDown / onTouchStart 等已被 dnd-kit listeners 占用的事件监听，必须 chain 而非 shadow（在 handler 内先调 `listeners.onKeyDown?.(e)` 再做自己的逻辑），写顺序上不要把 `{...listeners}` 放在自定义 handler 之后"。

- **可规范化为 Rule？**：**NO**（项目级或更窄）——这是 dnd-kit 特定的 API 形状，不具备跨项目泛化价值。但可以放进项目级 memory "dnd-kit listeners chain pattern"，下次涉及 dnd-kit 的任务自动加载。

- **影响**：键盘 a11y 完全失效；code-reviewer SubAgent 拦截，没有进入用户验收阶段——但提示了 T13a 自动化测试覆盖不全（unit test 测了 useSortable disabled / data-no-dnd / justDropped 等，但没覆盖键盘 reorder 端到端）。

---

### #5 DATA_MUTEX 漏覆盖 claude_md.rs / trash.rs (E 事件)

- **表面原因**：主 Agent 写 V3 03 §3.1 时只列了 data.rs 内的 mutating 命令；claude_md.rs / trash.rs 也读写 data.json，但被遗漏。code-review SubAgent 才发现。

- **根因（深一层）**：**主 Agent 在写规划时使用了"按文件归类"的心智模型，而非"按操作语义归类"**。问题域是"所有读+写 data.json 的命令必须串行化"——这是按数据访问语义聚合；但主 Agent 看代码时按文件目录浏览（commands/data.rs → 数 mutating fn），漏掉了"data.json 也被其他模块的 fn 写"这个事实。从更高层看：**读源码时的归类方式直接决定了对系统的理解 contour**——按文件读，看到的是文件级的 mutating 集；按操作读，看到的是操作级的 mutating 集。后者对一致性问题（race / 锁覆盖范围）才是正确视角。MEMORY.md 里"Patterns" 段已经写过"plugins.rs 也构造 McpConfigFile - 别忘了"——这是同类 pattern 的早期记录，但没有抽象成"按 grep 数据访问点而非按文件归类"的方法。

- **一步到位方案**：写"覆盖某资源的所有写入点"类规划时，必须先 grep 数据访问点（如 `grep -rn 'write_app_data\|read_app_data' src-tauri/`）得到完整 mutating set，再按 set 写规划，而非按文件目录浏览。规划完成后让 SubAgent 重新 grep 验证 set 完整。

- **可规范化为 Rule？**：**YES**（项目级或更宽）——"Grep before enumerate: when planning a constraint over a shared resource, grep all access points before writing the plan, not after". 跨项目适用（任何带共享状态的系统都会撞上）。

- **影响**：code-reviewer 拦截，主 Agent 补全 + 写测试覆盖。约 30 分钟返工。如果未拦截，并发场景（autoClassify / scene save 与 reorder 同时 mutating）会出 lost update。

---

### #6 V1 评审整体差距 6.6/10 (G 事件)

- **表面原因**：V1 三件套（02/03/04）评审 5 份并行：综合 6.6/10、23 个 P0、25 个 P1。意味着第一轮规划质量远未达"最高"标准；V2 复评 8.0、V3 终审 9.5 才达标。

- **根因（深一层）**：**V1 写规划时主 Agent 没有把"研究→规划"之间的桥梁建好**。01_research/ 5 份调研（库选型/动效物理/wrap/a11y/macOS）已经给了高质量信息，包括关键约束（research §3.1 误区 4 明确"opacity 0.4 是 Atlassian 风格"、§1.3 明确"距离 < 12px 自动吸附"、§1.5 明确 hsl 多层 shadow 等）。但 V1 spec **错过了多条 research 已经给出的约束**：lift opacity 0.4 与 research 冲突、磁吸完全缺失、阴影用 rgba 单层、settle 用固定时长——评审找出的 23 个 P0 中至少 15 个是"研究已答 spec 没听"。这不是研究不足，是**规划阶段没有把 research 当成 binding spec 来对照**。从更高层看：研究和规划是两个不同的 cognitive frame——研究是"信息收集"，规划是"决策"，决策时如果不显式 cross-check 研究结论，就会回退到 LLM 默认直觉。这种 gap 在 multi-phase 工作里非常常见。

- **一步到位方案**：V1 规划阶段必须在每节末尾显式列出"本节决策对应的 research §X 结论 vs 实际取用"——如果未取用，必须给出偏离理由。这是把 research 从"参考材料"升级为"binding 评审锚点"。或者更系统化：写一份 _research_distillation.md 把 5 份 research 的所有可执行约束摘成清单，spec 写完后用 SubAgent 跑这份清单做 conformance check。

- **可规范化为 Rule？**：**YES**——"Research-to-plan conformance check"。所有 research-first 工作流的规划阶段必须显式 cross-check 与研究结论的 conformance，未取用的结论必须 acknowledge 偏离。已写在 `~/.claude/rules/plan-as-research-design.md`（Layer 2 — Synthesis Gate），但这条 Rule 实际未被严格执行——本 Session 写 V1 时已加载，但主 Agent 未派 conformance check。问题在于 Rule 的执行机制不够强：默认主 Agent 自己做 cross-check，但实际很容易跳过。可考虑增加"Rule 配套的 SubAgent 模板"——把 conformance check 做成可调用的子任务。

- **影响**：V1→V2→V3 共 3 轮评审 + 修订，约 4-5 小时返工。本应一次到位 V3 级别（至少 V2 起手）。这是本 Session **时间成本最大**的返工。

---

### #7 Spring vs cubic-bezier 数学不等价 (C 事件)

- **表面原因**：V1/V2 spec 在 §2.4 都声称两者"等价"。V2 评审 SubAgent 用 Python 复现证明：spring(500/40) 与 cubic-bezier(0.16,1,0.3,1) RMSE 20%、最大差 48.21%、视觉完成时间相差 65%——**两类曲线族不可数值等价**（spring 始终从 0 速度起步，cubic-bezier ease-out 起始有瞬时速度）。V3 才撤销"等价"声称。

- **根因（深一层）**：**两层根因叠加**。第一层：V1 写 spec 的 SubAgent 看到 research 给的 spring 数值，直接复制并写"等价"——没数学验证。第二层：V1 评审虽然已经识别出"spring 等价是 P0"（`04_animation_review.md` 36-189 行），但 V2 修订时主 Agent / SubAgent 把 V1 的 stiffness 600/38 换成 500/40 当作"修复"——**没意识到无论换哪组参数都不等价**。这暴露的是**对"等价"概念的肤浅理解**：以为换参数就能逼近，没有从曲线族属性出发判断"是否物理上可逼近"。从更高层看：这是**用搜索代替理解**的失误——research 给一个数，spec 抄一个数，评审改一个数，但没人跑数学验证。一直到 V2 评审 SubAgent 跑 Python 复现才点破。

- **一步到位方案**：动效物理类 spec 写"等价"措辞时必须有数学复现作为 evidence。V1 spec 写 spring 等价时主 Agent 应该一开始就让一个 SubAgent 跑 Python 数值验证（spring step response + cubic-bezier Newton-Raphson），<5% 误差才算等价。或者更轻量：动效 spec 不允许写"等价"两个字，最多写"形态相近"+ acknowledge 不可数值替换——V3 最终采用的就是这个方案，应该 V1 就采用。

- **可规范化为 Rule？**：**YES**（专题）——"Validate numerical equivalence claims with reproduction"。对带数值的物理/数学等价声称，写入 spec 前必须有数学复现作为 evidence。跨项目适用（动效物理 / 信号处理 / 任何数值方法领域）。

- **影响**：V1→V2 一轮评审才识别问题；V2→V3 又一轮才真正撤销。约 2 小时间接返工（评审 + 修订两轮）。如果未拦截会污染团队 spring 物理认知，工程师未来错误使用。

---

### #8 V1 modifiers 错放在 DndContext (D 事件)

- **表面原因**：V1/V2 03 §7 把 `restrictToVerticalAxis` 放 DndContext modifiers 上 → DragOverlay 跟手 X 被卡 0（横向移动 overlay 不跟）。V1 架构评审已识别（`02_architecture_review.md` P0-4 line 156-189）。但 V2 修订时主 Agent **复现了同样错误**——v2 评审 NEW-P0-1（line 19-22, 32-86）才点破"V2 注释说不应用 DragOverlay，代码却仍是全局 modifier"。V3 才真正改对。

- **根因（深一层）**：**V2 修订时主 Agent 误以为"加注释 = 修复"**。V1 评审给的 P0-4 修复方案是"DndContext modifiers 设为空 / 仅 snapModifier，DragOverlay 显式 [restrictToWindowEdges]"——是代码结构改动。V2 修订时主 Agent 在 §7 加了"注释说 DragOverlay 不应用 modifiers"，但代码仍是 `<DndContext modifiers={[restrictToVerticalAxis, ...]}`——以为说明性注释能改变行为。实际 dnd-kit v6.3.1 内部 DragOverlay 通过 useContext(ActiveDraggableContext) 拿 transform，**不读注释**。从更高层看：这是**修文档当成修代码**的失误——技术规划中代码 sample 是 binding，注释是 narrative；修 narrative 不等于修 binding。但这个差异对 SubAgent 来说很容易混淆——尤其当 V1 评审给的修复方案描述里既有 narrative 又有代码 sample，SubAgent 倾向于挑"看起来工作量小"的部分实施。

- **一步到位方案**：V1→V2 修订时主 Agent 必须**一手核对代码 sample 是否真的改了**，而不只看注释/narrative 是否更新。或者：评审给修复方案时把代码 diff 写完整（不只是改后样子，还要包括 before→after 的 unified diff），让 V2 修订时复制粘贴而非"理解后重写"。

- **可规范化为 Rule？**：**NO**（这是规划落地的具体场景，难抽象为通用 Rule）——但可以加进 multi-round review 的 retrospective 提醒："上一轮 P0 修复 verify 时，必须读改后的代码 sample 而非 narrative"。

- **影响**：V1→V2 复评 SubAgent 拦截，未进入实施；如果未拦截 T8 SubAgent 按 V2 §7 实施会重现 P0 bug。约 30 分钟间接返工。

---

### #9 HashMap 迭代序错误 (I 事件)

- **表面原因**：V1 03 §3.1 apply_reorder 草稿用 `for (_id, c) in by_id { new_order.push(c); }` 把剩余项追加 → Rust HashMap 迭代序未定义（用 SipHash + 随机 seed，每次进程启动随机）。架构评审 P0-5 line 192-227 指出，V3 改用 Vec<String> snapshot original_order。

- **根因（深一层）**：**写算法时使用了"语言无关"的伪代码思维，未对接 Rust 标准库的语义**。"按原序追加未提及项"在伪代码层面是清晰的，但 Rust HashMap 不保证迭代顺序——LLM 默认知道 Python dict 在 3.7+ 保留插入顺序、JavaScript Map 保留插入顺序，但 Rust HashMap 不保留。SubAgent 写 Rust 算法时无意识用了"dict 保留顺序"的默认假设。从更高层看：这是**跨语言知识迁移时的 silent 假设**——同一抽象数据结构（hash map）在不同语言里有不同保证，SubAgent 默认按最熟悉的语言（Python/JS）的语义写。

- **一步到位方案**：写 Rust 集合算法时必须对核心操作（迭代顺序、容量、equality）显式 acknowledge 语义——比如 "HashMap 不保证迭代顺序"应当作为 spec 的 explicit assumption 列出，写完后让一个 SubAgent 验证。或者用 `IndexMap` / `BTreeMap` 等保留顺序的数据结构。或者像 V3 那样：在 take 之前 snapshot original_order: Vec<String>，把"原序"显式持有而不依赖 HashMap 内部。

- **可规范化为 Rule？**：**NO**（语言专题，作用面窄）。但可以加进项目级 memory "Rust HashMap iteration order is undefined"——本项目已经踩过一次，下次涉及类似算法时拉出来对照。

- **影响**：架构评审拦截 → V3 修复（apply_reorder 用 original_order Vec）。未进入实施。约 15 分钟间接返工。

---

### #10 实施期间 SubAgent 输出与规划偏离的隐性返工

- **表面原因**：T6 SortableCategoryRow / T8 SortableCategoriesList 实施时 SubAgent 偶有"按 dnd-kit 默认 best practice 而非按 spec 字面"的倾向。code-review SubAgent 拦下 P0 (DATA_MUTEX 漏覆盖 + onKeyDown shadow) 和 P1-2/P1-3/P2-3。`05_feasibility_review.md` P0-1 line 37-66 已经预警"T6/T7 任务卡缺必读上下文清单 → SubAgent 不会主动读 02/03 → 按 dnd-kit 默认 BG 写"。

- **根因（深一层）**：**SubAgent 默认会在"任务卡说什么"和"自己的 best practice 直觉"之间偏向后者**——尤其当任务卡只引用 spec 章节而不复制 binding 数值/代码 sample。`05_feasibility_review.md` P0-1 给了修复方案（每个任务卡顶部加"必读上下文清单"），V3 04 implementation plan 部分采纳但执行不彻底。从更高层看：这是**多 SubAgent 并行执行时的 spec 漂移**——每个 SubAgent 单独看自己的任务卡，没有"全局 spec adherence" gate。

- **一步到位方案**：04 implementation plan 每个任务卡的"必读上下文清单"必须是 explicit file:line 列表（如 02 §2.1 line 56-60，不只是 02 §2.1），并要求 SubAgent 在 deliverable 里 cite 这些 line。code-review SubAgent 是 last line of defense，不应是首要检测点。

- **可规范化为 Rule？**：**YES**（已部分体现在 user CLAUDE.md "SubAgent 操作规范" 第 2 条"Prompt 放指令，md 放上下文"，但执行细化不足）——可以加 "Each SubAgent task card must list explicit file:line context references, not just section refs". 跨项目适用。

- **影响**：code-reviewer 拦截 2 个 P0 + 3 个 P1。约 1 小时返工。如果未拦截，DATA_MUTEX 漏覆盖会在并发 mutation 场景出 lost update（生产 bug）；onKeyDown shadow 会在 a11y 测试发现键盘 reorder 失效。

---

## 跨事件的共性根因（合计观察）

合计 10 个返工事件，可以聚合出 3 条共性根因：

### 共性根因 #1：默认信任未验证假设

- **触发事件**：#1（fallback 是默认安全错觉）、#3（spec 假设 CSS transition 由 lib 提供）、#7（假设 spring 与 cubic-bezier 可数值逼近）、#8（假设加注释 = 修复）、#9（假设 HashMap 保留顺序）

- **共性表述**：写规划/代码时大量隐式假设（默认行为、库行为、跨语言语义、修订到位），但很少有显式验证步骤。一旦假设错，故障在下游某点（实施 / 用户实测 / 数据丢失）才暴露——离根因越远，定位越贵。

- **解药方向**：在 spec/规划阶段为关键假设建立"reproducible verification"。Spring 等价 → Python 复现；CSS transition by lib → 看 lib 源码；HashMap 顺序 → 看标准库文档。这些验证耗时小（10-30 分钟），但能拦下半数返工。

### 共性根因 #2：cascade footprint 不显式

- **触发事件**：#2（02→03/04 修订级联漏改）、#5（DATA_MUTEX 跨文件覆盖漏算）、#10（spec → 多 SubAgent 任务卡 cascade 不完整）

- **共性表述**：项目结构是 graph（文档之间引用、代码之间共享资源、规划之间继承约束），但操作时按文件/任务/模块拆分——一个改动的真实 footprint 跨多个节点，但操作只在一个节点。

- **解药方向**：每次修改前先 grep 真实 cascade footprint（grep 数据访问点 / 文档 cross-ref / SubAgent 上下文清单），按 footprint 操作而非按文件操作。或者引入显式的 cascade 机制（修订 02 立刻把 03/04 的 must-touch 列在 commit message）。

### 共性根因 #3：评审拦截优先于规划质量

- **触发事件**：#6（V1 6.6/10 远未达"最高"）、#7（V1/V2 spring 等价错）、#8（V2 modifiers 错）、#10（实施期 spec 漂移）

- **共性表述**：本 Session 严重依赖多轮评审拦截 P0——V1 评审拦 23 个、V2 拦 7 个、V3 拦 4 个、T0 对齐拦 3 个、code-review 拦 2 个、用户实测拦 1 个、用户数据事故 1 个未拦。如果把"评审能拦下"当成"规划质量 OK"的代理指标，会陷入"评审越多越好"的反向激励——实际更高效的是"规划阶段就把评审能 catch 的问题 catch 住"。V1 6.6/10 说明规划阶段 cross-check 不到位，把质量负担推给评审。

- **解药方向**：规划阶段必须做主动 cross-check（research conformance / 数学验证 / 假设一手验证），评审应当 catch 罕见 / 微妙问题，而非 catch "规划应当避免"的常规问题。

---

## 总结

- **共发现 10 次返工**（其中 #2 严格说是"未发生但被拦截"的潜在返工）。

- **其中 4 次会产生用户可感知后果**：
  - #1 用户数据丢失（已发生，不可恢复）
  - #3 用户实测磁吸生硬（已发生，1.5h 返工后用户验收"非常棒"）
  - #4 键盘 a11y 失效（被 code-review 拦截）
  - #10 中部分 P1（如颜色 token 漂移）会被用户视觉察觉（被 code-review 拦截）

- **其他 6 次属于"规划/评审内部"返工**：质量代价 = 评审时间 + 规划修订时间，未到用户层。

- **共性根因**：默认信任未验证假设 + cascade footprint 不显式 + 评审拦截代替规划质量。这三条互相强化——假设没验证导致下游故障，下游故障跨多个文件需要 cascade，cascade 不显式导致下次评审才发现，于是评审又承担更多——恶性循环。打破循环的关键是规划阶段建立"主动 verification + 显式 cascade"两个习惯，而不是依赖更多评审轮次。
