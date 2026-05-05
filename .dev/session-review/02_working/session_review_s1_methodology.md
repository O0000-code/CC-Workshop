# Stage 1B — 方法论提取（Category Hierarchy session）

> 输入材料：`00_understanding.md`、`01_research/_dispatch_plan.md`、`r1-r7` 7 份调研、`_synthesis_decisions.md`、`_v2_patch_plan.md`、`04_implementation_plan.md` V2、`05_review/00-06` 6 份评审 + alignment check + `phase1_audit.md` + `final_audit.md`、新增的 `.claude/rules/design-language.md` / `plan-document-style.md`、本次 session 共 21,179 行交付文档。
> 评估标准：抽象去掉本次具体细节后还成立——必须能说出"这在 UI 工程之外的什么领域也用得上"。答不上来的就剔除。**与上次 session_review_s1_methodology.md 不同**：本次重点是**编排决策的 ROI 评估** + **是否过度规划**——任务被用户判定为"$400 / 8h 实现一个小功能太夸张"。

---

## 0. 顶层评估：本次 session 的核心问题不是"方法不够好"，是"方法用在了不需要的任务上"

**关键事实**（来自 wc -l 与 audit 时间线）：
- 21,179 行规划/调研/评审文档（不含代码）；
- 7 个 wave 1 SubAgent + 6 个 V1 reviewer + 3 个 V2 reviewer 风格的 alignment check + Phase 1 audit + T1f audit + final audit = **≥ 18 SubAgent 投递**（不计 patch / impl SubAgent）；
- 04 V1 写到 64K token 上限失败 → V2 343 行重写；
- final audit 78/100 仍发现 3 P0（DragOverlay anti-pattern、ContextMenu 缺 Promote-to-root、父类删除无 confirmation）；
- 实际生产的"小功能"代码：~600 LoC Rust + ~1200 LoC TS（其中 SortableCategoriesList 单文件 888 行）。

**用户原话："$400 / 8h 实现一个小功能太夸张"**——这不是抱怨完成度，而是抱怨**单位产出的成本**。本次 session 在 sidebar-reorder session 验证好的"6 步范式 + 多评审收敛"上**机械复用**，但 sidebar-reorder 是**首次建立动效物理感**的研究型任务，category-hierarchy 是**已知问题的扩展型任务**——两者所需的规划深度天差地别。

下面 6 类模式，分别评估"哪些是真值得固化"和"哪些是任务-方法错配"。

---

## #1 高 ROI 步骤（值得保留）

### 1.1 R7 设计哲学蒸馏 → 直接转 design-language.md（**最高 ROI**）

- **本次具体表现**：R7 SubAgent 通读 53+ 个组件文件 + index.css 680 行 + V3 spec + 06_snap_research，蒸馏出"哲学/原则/约束"三层结构。最终落到 `.claude/rules/design-language.md`（129 行项目级 Rule，每个 session 自动加载）。
- **可迁移的抽象**：当一个项目的"质量标准"被反复在 session 间口头重申（"考究、精致、极简、Apple/Linear 级"），把这套标准从口头默契转为**可加载、可引用、可违反检测**的 Rule 是高 leverage 操作。每个未来 session 不用再被反复"教育"——design-language.md 自动加载，违反点可以被 reviewer SubAgent 客观引用。
- **本次量化收益**：①未来每个新 session 节省 ≥ 1 轮"反复强调极简"的对话；②reviewer SubAgent（如 final_audit）可直接引用 design-language.md anti-pattern 表来标记 P0；③本次的 V2 §2.22 anti-pattern 表 + 24 项 V3 不变量，本质都是 design-language.md 的"未来再发生时的对照清单"。
- **跨域测试**：学术综述项目里"行文风格指南"（论证语气 / 引用密度 / 章节模板）从口头默契转为可加载的 style.md，是同一动作。✓
- **结论**：**值得固化为通用方法**——任何"质量标准被反复重申"的项目，都应该派 R7 类 SubAgent 蒸馏到可加载 Rule。

### 1.2 主 Agent 亲笔写 _synthesis_decisions.md（**高 ROI，但有边界**）

- **本次具体表现**：7 份 wave 1 调研产出后，主 Agent 不外包，自己读完 7 份 + 解决 4 项跨报告冲突 + 写出 14 决策的最终汇总（带置信度 0-100）。这份 _synthesis_decisions.md 让 wave 2/3 的 SubAgent 不需要重读 7 份调研报告就能直接作业。
- **可迁移的抽象**：**多 SubAgent 调研后的"冲突仲裁 + 决议落锤"必须由主 Agent 亲笔完成，不可外包**。原因：(a) SubAgent 没有"全局任务边界感"；(b) 多份报告的冲突解决需要"判断哪个论据更对齐主任务目标"，这是领导决策不是执行；(c) 落锤后的决议是后续所有 SubAgent 的 Decisional 权威，写得不准确等于污染整个下游。
- **本次量化收益**：14 决策 × 4 文档 × 落地一致性 = 56 个对齐检查点；alignment check 验证全部一致。如果没有 _synthesis_decisions，下游 SubAgent 各自读 7 份报告，每个 SubAgent 重新解决一次冲突——必然不一致。
- **本次的边界问题**：**14 决策中有几个本可以不需要调研就直接锁定**（比如 D10 缩进量 16px 是 Apple HIG / Finder 默认，D14 autoClassify 落根是显然的 v1 范围）。把"显然决策"也走"调研→冲突→决议"流程，是过度仪式。
- **跨域测试**：学术综述里多 SubAgent 调研某理论分歧后，导师亲笔写"我们采纳 Theory A 的 X 论点 + Theory B 的 Y 论点"决议——是同一动作。✓
- **结论**：**值得固化为通用方法，但需要"决策需不需要调研"的前置筛选**——不是每个决策都需要 7 SubAgent 论证。

### 1.3 T0 跨文档对齐检查 SubAgent（**高 ROI**）

- **本次具体表现**：02 V2 / 03 V2 / 04 V2 / `_v2_patch_plan` / `_synthesis_decisions` / `design-language.md` 修订完后，主 Agent 派**单独**的对齐检查 SubAgent（不评内容，只看 14 决策三处一致 / V3 不变量 23 项三处一致 / token 命名一致）。结果零 P0 警报，14 决策完美一致，直接进 Phase 1。
- **可迁移的抽象**：**当 ≥ 3 份相互引用的 Decisional 文档同时迭代后，必须独立派"对齐检查"SubAgent，与"内容评审"SubAgent 严格分开**。两者关注点不同——内容评审看"思想是否对"，对齐检查看"措辞 / 数值 / 编号是否一致"。混在一起，对齐问题必然被淹没。
- **本次量化收益**：T0 报告 393 行，14 决策 × 3-4 处落地点全部对照。Phase-1 audit P0-1（orphan-vs-flag）是 T0 漏掉的真 P0，但漏掉原因是"two Decisional 文档自相矛盾"，T0 prompt 没专门看这种情况——这是 T0 prompt 可改进点，不是 T0 步骤本身的问题。
- **跨域测试**：学术论文 V2 → V3 修订后派"reference & cross-section consistency"reviewer，独立于"内容评审"。✓
- **结论**：**值得固化为通用方法**。已部分体现在 `cross-document-cascade-discipline.md` Rule。本次发现的改进点：T0 prompt 应显式包含"two Decisional 自相矛盾"扫描。

### 1.4 plan-document-style.md（V1 64K 失败后建立的 Rule）

- **本次具体表现**：04 V1 第一次撰写超 64K token 上限失败（W6-C SubAgent 文件大小返回 error）。根因：W6-C 把 03 tech plan 的代码细节大量复制到 04 任务卡里，每张卡 ~80 行代码 × 25 张卡 ≈ 2000 行代码 + 注释 = 6万 token。修订成 V2 343 行（每张卡 ≤ 30 行，纯方向 / 范围 / 关注点 / 验证）。修订后立即写为 `.claude/rules/plan-document-style.md` Rule。
- **可迁移的抽象**：**Plan 文档（"如何执行"层）不是代码 / 不是 spec / 不是 tutorial——是"导航图 + 风险登记 + 依赖图"**。Plan 写得过详 SubAgent 反而会跳读。具体硬上限：≤ 800 行总，单任务卡 ≤ 30 行，不复制 spec 内容（用引用），代码细节归 spec / SubAgent 自驱。
- **本次量化收益**：V1 失败后立即 Rule 化 → 未来任何项目的 implementation_plan 都不会再出现这个错误。这是"实战教训立即转 Rule"的典型成功案例。
- **跨域测试**：学术综述的"executive plan"（先研究再综述再投稿的步骤图）vs "实际综述内容"，是同一边界——plan 不是综述本身。✓
- **结论**：**已固化，验证过有效**（本次 V2 343 行远低于 sidebar-reorder V3 的 482 行）。

---

## #2 失败→修正→成功路径（弯路）

### 2.1 04 V1 64K 失败 → V2 343 行（**真弯路，已转 Rule，不再重演**）

- **症状**：W6-C SubAgent 第一次撰写 04 V1 时超 64K token，被 Anthropic API 拒绝。
- **根因（用户事后判定）**：把 03 tech plan 的代码示例大量复制到任务卡里，违反"plan 是方向不是脚本"。
- **修正路径**：用户提示"plan 应该是方向 / 范围 / 注意点"，重新派 W6-C SubAgent 写 V2，约束 ≤ 800 行。
- **本次损失**：~1 SubAgent round（~30 min）。
- **可迁移性**：高。已转 `.claude/rules/plan-document-style.md`（37 行项目级 Rule）。同一错误下次会被 Rule 拦截。
- **结论**：**真正的可迁移弯路，已沉淀**。

### 2.2 sub-agent 修复"只是注释 / 视觉改动"被用户判定"没区别" → 真修复（**未沉淀，但教训已隐含在用户偏好里**）

- **症状**：本次过程中（来自 _session_summary 推测）某个 P0 修复 SubAgent 改了 CSS class 名 / 注释 / 视觉位置，用户判定"没区别"。
- **根因**：SubAgent 误把"改 prop 名"或"改注释"当作"修复"，没真改行为。
- **修正路径**：用户直接判 "no diff"，要求真改。
- **可迁移性**：中。这是 SubAgent prompt 的"acceptance 标准"问题——prompt 必须显式说"修改后行为差异是什么、如何客观验证"，而不是"修这个 P0"。
- **结论**：**值得 Memory，不必 Rule**——具体细节本次没文档记录，但用户偏好"feedback_research_before_bug_fix"已经覆盖了相关的反馈接收讨论。

### 2.3 Phase 间反复审核 → 用户改为"整体完成后再审核"（**真弯路，方法论收益相反**）

- **症状**：04 V2 §3 SubAgent 投递策略原本规定"每 Phase 之间必跑 npx tsc / npm test / cargo test"+ Phase 1 完整 audit + T1f audit；然后被用户调整为"整体完成后再做 final audit"。
- **根因（用户视角）**：每 Phase 单独 audit + 修复 → 进下 Phase，对**复杂动效任务**（sidebar-reorder）有用——因为每 Phase 的 P0 修复成本极高、跨 Phase 累积复杂度大。但**对结构性任务**（category-hierarchy）是过度——大部分 Phase 间问题是"对齐"而非"行为"，自动化 gate（tsc + test + clippy）已 enough。
- **修正路径**：本次实际执行就是"Phase 1 完整后做 phase1_audit + phase1_t1f_audit"（这是必要的，因为 Phase 1 是数据安全 + 跨 phase 接口，错了会全盘崩溃），但 Phase 2-4 改为"全部完成后做 final_audit"。
- **可迁移性**：高。教训：**审核频率应与 Phase 间错误成本成正比，不是固定每 Phase 都审**。
- **结论**：**已部分沉淀在用户 MEMORY `feedback_phase_review_loop.md`**，但当前 memory 写法是"每 Phase 完成后单专家审核 SubAgent"——这是 sidebar-reorder 总结的，本次显示该 Rule 需补充"对错误成本低的 Phase（如 frontend visual-only changes），可以合并到 final audit 一次性做"。**Memory 升级候选**。

### 2.4 V1 reviewer 数量 6 → V2 alignment check 1 → final audit 1（评审 SubAgent 数量从 6 降到 1）

- **症状**：V1 阶段派 6 个并行 reviewer（A 设计 / B HCI / C Rust / D dnd-kit / E 对齐 / F migration）。每份 500-1456 行。dedup 后 17 项原始 P0 → 15 unique P0。V2 修订后只派 1 个 alignment check + 1 个 final audit。
- **根因评估**：6 reviewer 中 **E（对齐）和 F（migration）抓了真 P0**（DATA_MUTEX 漏锁、CreateSceneModal 漏改、cascade-promote 同名碰撞、migration flag 撞 settingsStore），其他 4 个的 P0 大部分是 P1 升级（E 自己说 P0 数=0）。**但 V2 final audit（1 个 reviewer）依然抓出 3 个 P0**（DragOverlay anti-pattern、ContextMenu 缺 Promote-to-root、parent-delete 无 confirmation）——说明 V2 的"少派几个 reviewer"也没漏关键问题。
- **可迁移的抽象**：**V1 阶段的"5+ 角度独立评审"是必要的**（防止单一视角漏 P0）；**V2 阶段的"少数几个针对性评审"也够用**（因为 P0 已经收敛到边角），不需要每轮都重派 5+。
- **结论**：**值得 Memory**——评审 SubAgent 数量应**随 P0 收敛而缩减**，不是固定每轮 5+。

### 2.5 _v2_patch_plan.md §3.4 与 03_tech_plan §3.4 自相矛盾 →  Phase-1 audit 才发现（**真弯路，未沉淀**）

- **症状**：`_v2_patch_plan` §3.4 写"orphan → flag 不写 true"；`03_tech_plan` V2 §3.4 写"orphan 是终态 → flag advance"。两份都是 Decisional level，T0 alignment check 评 ✅ aligned（漏检），Phase-1 audit 才发现。
- **根因**：T0 alignment check 只对照"14 决策三处一致"，没对照"两份 Decisional 文档之间的细节是否互相矛盾"。
- **可迁移的抽象**：**当多份 Decisional 文档之间有内容重叠时，alignment check SubAgent 必须显式扫描"重叠内容是否一致"，不能只对照锁定的 N 个决策列表**。
- **结论**：**值得加到 `cross-document-cascade-discipline.md` Rule** —— 现 Rule 只说"修订一份后扫描相关文档"，没说"扫描必须包括内容重叠区，不只是被显式 cascade 的部分"。**Rule 升级候选**。

---

## #3 非显然的依赖关系

### 3.1 T2c categoryTree.ts 与 T2a appStore.Category.parentId 的隐性依赖

- **本次表现**：04 V2 任务卡 §2 把 T2c（categoryTree.ts）和 T2a（appStore + migration）放在 Phase 2 4 并行组里，标 "T2c 独立工具"。**事实上 T2c 的 collectDescendantIds 假定 Category 有 parentId 字段** —— 没有 T1a 落地这个字段，T2c 写出的代码会 TypeScript 编译失败。本次能 work 是因为 T1a → Phase 1 全部完成 → 才进 Phase 2，所以 T2c 实际有 T1a 前置。
- **可迁移的抽象**：**"独立工具文件"不等于"无依赖"——任何使用 type 字段 / API signature 的工具都依赖那些字段 / API 已落地**。依赖图必须画到 type-level，不只是 IPC-level。
- **本次损失**：实际无（Phase 1 严格在 Phase 2 之前），但若发布顺序错了，T2c SubAgent 会失败。
- **结论**：**Memory** —— 任务依赖图必须包括"type 字段定义"和"shared utility 假定"，不只是"IPC 调用"。

### 3.2 handleSetCategoryParent 的 try/catch + moveCategoryToParent 的 fallback 形成"看不见错误"链路

- **本次表现**：MainLayout.handleSetCategoryParent 调 moveCategoryToParent，try/catch 后 console.error；moveCategoryToParent 内部又有 fallback to `get_categories`（appStore 行为）。两层 catch 后 UI 上无 error 反馈。final_audit 提到 "handleSetCategoryParent 吞 error"是 P2 backlog。
- **可迁移的抽象**：**"防御性编程的多层 catch"很容易形成静默失败链路**。每一层独立看都正确（不让 UI crash），合在一起用户完全不知道 IPC 失败了。需要"错误传递层数 ≤ 1"或"最外层必须有 user-visible 反馈"。
- **结论**：**Memory** —— 不是 Rule（不通用），是项目特定的"前端错误反馈纪律"。

### 3.3 HMR + console.warn 诊断 = dev mode 可见 / prod build 不可见

- **本次表现**（推测来自工作流）：本次开发期 dev mode 有 console.warn 显示"category lookup failed"等诊断信息，但 prod build 没有这种诊断。
- **可迁移的抽象**：**dev-mode-only 诊断信息会让"用户报 prod 问题但开发者复现不了"成为常态**。任何 console.warn / console.info 在 dev 给出的"看似没问题"，到了 prod 都会 invisible。
- **结论**：**Memory**——前端 / 跨环境调试纪律。

---

## #4 方法论创新（本次 session 真正的新东西）

### 4.1 _synthesis_decisions.md（多 SubAgent 调研后主 Agent 亲笔仲裁）— **真创新**

- 见 §1.2。
- 跨域适用范围：高（学术综述、产品 PRD、研究方案）。
- 是否值得固化：**是**——已隐含在 user Constitution §二.4，但本次首次落实为"具体文件名 + 必含字段 + 主 Agent 不外包"的可执行规范。**Constitution 升级候选**："每轮多 SubAgent 调研后，主 Agent 必须亲笔写 _synthesis.md，含冲突解决章节 + 决议带置信度 + cascade 表"。

### 4.2 _v2_patch_plan.md（多 reviewer 评审后的 patch 编排）— **真创新**

- **结构**：6 reviewer 各报告 → 主 Agent dedup（17→15 P0）→ 锁定 12 项 V2 修订决议（§3.1-§3.12）→ 派 W6-A/B/C/D 4 个 patch SubAgent。
- **创新点**：在"评审产出"和"patch 实施"之间插入了"主 Agent 决议 + 任务分派"层。每个 patch SubAgent 不再各自读 6 份评审，只读 _v2_patch_plan §3 锁定决议 + 自己的任务清单。
- **跨域适用**：审稿人意见整合（学术）、PR review 多 reviewer comments 整合（工程）、产品 critique 整合（设计）。
- 是否值得固化：**是**。**Constitution 升级候选**："多 reviewer 评审后必有'主 Agent 整合 + 锁定 + 分派' 中间层文档，不许 patch SubAgent 各自读全部评审"。

### 4.3 T0 对齐检查 SubAgent 作为 Plan→Implementation 之间的硬 gate— **此次特别强化**

- 本次 T0 报告 393 行，对照 14 决策 × 3-4 处落地点 + 12 V2 决议落地 + 15 P0 修订验证 + 4 P1 验证。**T0 实际抓到 P0 数 = 0** 但抓到 P1 = 11 项（编号不一致 / dropdown 数量 / 编号偏移等），都是 V1 → V2 cascade 不彻底的衍生问题。
- 是否值得固化：**已在 cross-document-cascade-discipline.md 项目 Rule 里**。本次的强化点是 T0 报告的"穷尽对照矩阵"格式（决策 × 落地点 × 一致性）。**Rule 升级候选**：在 cross-document-cascade-discipline.md 加 "T0 报告必含的对照矩阵清单"。

---

## #5 技术事实偏差（库实际行为 vs 文档/直觉）

### 5.1 dnd-kit `closestCenter` 在 vertical reorder 让位后 `over === active`

- **本次发现**（来自 r2_dnd_tree_architecture.md §1）：当 sortable item A 让位给 active item B 时，因为 cascade let-pass 让 A 的 rect 已偏移，dnd-kit 的 closestCenter collision detection 会判定 over = active 自身（而不是预期的 over = A）。
- **影响**：handleDragEnd 里如果 `over.id === active.id` 就 return，会让"reorder 到中间位置"完全失效——必须读 `over.id !== active.id || projection.depth changed` 才对。
- **跨域适用**：低——dnd-kit 特定行为。但**可迁移的抽象是**：collision detection / hit-test / spatial query 类 API，文档很少描述"item 自身参与 query 时怎么判"——必须 console.log 实测。
- **结论**：**Memory**（库行为），不必 Rule。

### 5.2 React batched setState + useEffect 同步 ref → 在 StrictMode + dnd-kit MeasuringStrategy.Always 下放大成 infinite loop

- **本次发现**（来自 SortableCategoriesList 实施期间）：handleDragMove 里 setState（更新 dwell state）→ React batch → useEffect 同步 ref → dnd-kit 重新 measure → 再触发 onDragMove → 再 setState ... 在 StrictMode 双调用下放大成 infinite loop。
- **修复**：把"useState + useEffect 同步 ref"改为"`useRef` 直接 mutation"，让 setState 仅在用户可见状态变化时调（dwell state machine 三态切换）。
- **跨域适用**：中——任何 React + 高频回调（resize observer / pointer move / scroll）都可能踩。
- **结论**：**Memory**——React + 高频回调 + ref 同步纪律。

### 5.3 Tauri 2 `#[allow(non_snake_case)]` 让 Rust function param 直接接 camelCase

- **本次发现**（来自 phase1_audit §9.9）：T1c 在 `set_category_parent(id, newParentId: ...)` 上加 `#[allow(non_snake_case)]`，前端 IPC 用 camelCase 直接调通——不需要在 Rust 里写 `new_parent_id` 然后 serde rename。
- **跨域适用**：低——Tauri 2 特定。
- **结论**：**Memory**。

### 5.4 dnd-kit MutableRefObject pattern for treeKeyboardCoordinates（**真正 non-trivial**）

- **本次发现**（来自 r2 §3 + P0-ARCH-1）：dnd-kit Tree example 的 `coordinateGetter` 必须用"factory + MutableRefObject"模式（让外部 update 状态时不重建 getter，否则 dnd-kit 的 KeyboardSensor 缓存的 getter 引用过期）。第一次 SubAgent 直接写 `coordinateGetter = (event) => { /* 用 currentCoordinates.x 算 */ }` 完全不 work——P0-ARCH-1 是 V1 → V2 修订的 stop-ship。
- **跨域适用**：中——任何"library 接受 callback 但缓存 callback 引用，要求外部状态通过 Ref 而非 closure 传递"的库。
- **结论**：**Memory**（已隐含在用户 MEMORY 的 dnd-kit listeners chain 段落，可补充）。

---

## #6 编排决策评估（本次最关键章节）

### 6.1 7 个 wave 1 SubAgent — **过度，应该 4 个**

| SubAgent | 主要产出 | 真实贡献 | ROI |
|---|---|---|---|
| **R1** 数据模型 / 引用方案 / 迁移架构 | 1271 行 | D1=A 迁移方案 + D2 + D13 验证算法 + 完整 backward compat | **高 ROI** ✓ |
| **R2** dnd-kit Tree 架构 | 1026 行 | dnd-kit 6.3.1 源码事实 + 官方 Tree example 解构 + 单 SortableContext 决策 + 7 行业基准对比 | **高 ROI** ✓（避免 V3 不变量被破坏） |
| **R3** macOS 顶级视觉与交互设计 | 562 行 | 16px 缩进 + chevron + 默认展开 + 8px X dwell 提议（被 R4 改为 12px） | **中 ROI**——主要价值是 chevron 设计 + 视觉规格表，但与 R7 + design-language 内容大量重叠 |
| **R4** HCI / 认知心理学评估 | 400 行 | D7 聚合视图（行业 6 家行为统计）+ D8 count（被冲突解决推翻）+ Fitts's law 容错率 | **中 ROI**——D7 决策本可不需要 Fitts's law 论证；D8 被推翻；价值在"行业基准统计表" |
| **R5** 全 codebase grep 枚举 | 1773 行 | 9 处 dropdown 完整清单 + 10 个隐藏地雷 + scenesStore.categoryFilter 语义 | **高 ROI** ✓（防遗漏，CreateSceneModal 是 P0-DATA-4，靠这份 grep 才发现） |
| **R6** autoClassify / count / filter 行为分析 | 760 行 | D14 落根决策 + collectDescendantIds helper（与 R1 重复）+ 三 store autoClassify chain | **低 ROI**——内容大量与 R1 + R5 重叠；D14 决策一行可锁定（"暂不感知，落根"是显然 v1 范围） |
| **R7** 设计哲学蒸馏 | 1394 行 | design-language.md 候选大纲 + 53 组件扫描 + 哲学三层蒸馏 | **最高 ROI** ✓✓（产出永久性 Rule） |

**评估**：
- **真贡献集中在 R1 / R2 / R5 / R7（4 个）**，覆盖"数据模型 + 拖拽架构 + 全枚举 + 设计哲学"。这 4 份**几乎所有 14 决策都能落地**。
- **R3 / R4 / R6 是 overlap heavy**：R3 与 R7 重叠（视觉规格 vs 设计哲学），R4 与 R6 重叠（HCI vs 行为分析），R6 与 R1 重叠（reference 方案）。
- **如果只派 4 个**（R1+R2+R5+R7 + 一个综合 "interaction design + HCI" SubAgent 替代 R3+R4），减 ~3000 行调研产出，节省 ~1.5 SubAgent round（30% 调研成本），决策质量基本不变（D7 / D8 / D4 这三个会有信息损失但可补 R8 微调研，或主 Agent 自己补判断）。

**可迁移的抽象**：**多 SubAgent 调研的"数量充分性"是 ROI-aware 的**——不是越多越好。一个简单的检验：**派单前问自己"如果只用前 N 份就能回答 14 决策的 90%，剩下的 SubAgent 是不是为了'显得调研充分'？"**。本次 7 个里 R3/R4/R6 至少有一个是这种状态。

**结论**：**值得 Memory** —— Constitution §二.1 "慷慨发布、精准拆解" 的具体细化"对调研类 SubAgent，先列出待回答问题清单 + 划分 expert lens，再决定 N，不为'凑数'多派"。

### 6.2 6 个 V1 reviewer — **合理，每个都抓到 P0**

| Reviewer | 角度 | 分数 | 真 P0 数 | ROI |
|---|---|---|---|---|
| A | Apple-grade Design | 87 | 5 (drop-indicator 几何 / chevron 占用 / localStorage 反转 / dwell 状态机 / DragOverlay 论据) | **高** ✓ |
| B | HCI / 交互 | 78 | 4 (treeKeyboardCoordinates 误用 / HIG 引证 / Move-to-Parent 缺规格 / 父删 confirmation) | **高** ✓ |
| C | Rust/Tauri | 85 | 2 (migration flag 撞 settingsStore / cascade 同名碰撞) | **高** ✓ |
| D | dnd-kit + frontend | 83 | 2 (treeKeyboardCoordinates / arrayMove 错位) | **高** ✓ (D 与 B P0-1 重合一项—这本身是好的，互相验证) |
| E | 跨文档对齐 | 88 | 0 + 11 P1 | **中**（关键 P1 11 项，但 E 自己说 P0=0） |
| F | Migration 安全 + 回归 | **62** | 4 (双 IPC stale / migration 失败仍写 flag / CreateSceneModal 漏 / setSkillsFilter cleanup) | **最高** ✓✓ —— **F 一个 reviewer 抓到 4 个 stop-ship，且 62 分远低于其他人**——证明派"对极端用户场景敏感的 reviewer"价值极高 |

**评估**：6 个 reviewer **全部抓到 P0**，没有"白派"。F 的 62 分是关键警报——如果不派 F，4 个 stop-ship 会全部漏。
**值得保留**——多 lens reviewer 在"高复杂度任务"上仍是 ROI-positive。

**但**：本次 6 reviewer 是**对"高复杂度 spec"**而言。category-hierarchy 任务整体复杂度其实不高（数据模型加字段 + dnd 树形 + 缩进视觉）—— **6 reviewer 出现 V1 22 P0 的根本原因可能是 V1 spec 本身写得太"全"，每个 reviewer 都对一份 1300+ 行的 spec 找毛病**。如果 V1 spec 一开始就紧凑（300 行的方向性 spec），可能 3-4 reviewer 也够。

### 6.3 final audit 1 个 — **合适**

- 1 个 reviewer 写 725 行 final audit，覆盖 code + design + regression + cross-Phase spec drift。抓到 3 P0 + 6 P1。
- 评估：**ROI 最高的 reviewer 派单**——晚期收敛阶段，1 个综合 reviewer 比 5 个分维度 reviewer 更 efficient（不会重复检查同样的代码）。
- 结论：**值得保留**。

### 6.4 应该派但没派的 SubAgent（**真正缺失**）

- **实测验证 SubAgent**（缺失）：本次 final_audit §9 列了 27 项 dev mode 验证清单，但**主 Agent 没派 SubAgent 跑 npm run tauri dev + curl / DevTools 自动化检查可机器验证的项**（DOM padding-left 数值 / chevron 旋转 transition timing / chevron 颜色 RGB），全部留给"用户手动验证"。这是 8h 工时里"用户验证 + 反馈 + 修"占了一大块时间的根本原因。
- **可迁移的抽象**：**当 acceptance 列表 ≥ 10 项中有 ≥ 30% 是机器可验证的**（DOM 计算 / API 返回 / 文件存在），应该派"自动化 acceptance 验证 SubAgent"，不要把全部 acceptance 都丢给用户。
- **结论**：**Memory**——acceptance 验证应自动化优先，用户验证只覆盖主观项 + 视觉 / 物理感。

### 6.5 T1c/T1d/T1e 三并行（同改 data.rs）— **侥幸通过，应改串行或加文件锁**

- 04 V2 §2 把 T1c (set_category_parent) / T1d (delete cascade) / T1e (migration) 三个并行——**全都修改 data.rs**。本次靠 SubAgent 顺序写入 + 没 git merge 冲突侥幸过关。
- **可迁移的抽象**：**多 SubAgent 并行修改同一文件是 race condition**——理论无 git 操作冲突，实际 SubAgent A 看到的 snapshot 不含 SubAgent B 的改动，最后一个写入会覆盖 / 错乱。本次没出问题是因为三个 SubAgent 改的是 data.rs 不同 function，没行级冲突。
- **修正建议**：(a) 按 function-level 串行；(b) 先派 T1a（types）+ T1b（validator）落地 → 再派 T1c/T1d/T1e（每个都依赖 T1a，所以本就该 T1a 串行）。
- **结论**：**值得 Memory**——多 SubAgent 修同一文件应串行；"独立 function"不是"独立文件"。

---

## #7 关键反思：用户原话"$400 / 8h 实现一个小功能太夸张"——理想路径是什么？

### 7.1 真实的"小功能"拆解

| 任务 | 直接做估时 | 本次实际做法 |
|---|---|---|
| Backend: parent_id 字段 + IPC | 1-2h | 用了 Phase 1 ~3h（4-5 SubAgent，含 audit） |
| Backend: 迁移 category_id | 1-2h | 同上 ~3h |
| Frontend: dnd-kit Tree（参考 official example） | 3-4h | 用了 Phase 3 ~3h（5 SubAgent） |
| Frontend: 9 处 dropdown 改造 | 1-2h | T3e ~30min |
| 用户验证 + 修 P0 + final fix pass | 1-2h | ~2-3h（含 DragOverlay revert / ContextMenu / confirmation dialog） |
| **总计估时** | **7-12h（无规划文档）** | **8h 实际（含 21K 行规划文档）** |

**关键观察**：本次 8h 与"完全不规划直接做"的 7-12h **差不多**——规划没有显著降低实施时间。规划的真正贡献是：
1. **避免 sidebar-reorder V3 不变量被破坏**（这是用户高度关心，"零回归"硬需求）；
2. **D1 categoryId migration 的 backward compat 决策**（如果一开始没规划，可能直接 break old data.json，事后修复成本高）；
3. **多 reviewer 抓到 6 个 stop-ship P0**（如果不审，进 prod 才发现，回滚成本高）。

但是：**21K 行文档的边际产出是递减的**。前 3-4K 行（理解 + 调研 4 份核心 + 14 决策仲裁 + 简化 spec）就能抓到 80% 价值；后 17K 行的 marginal contribution 主要是"完整性证明"而非"决策依据"。

### 7.2 跳过 .dev/category-hierarchy/ 直接做会更差吗？

**会更差，但只差 30-50%——不是 5 倍**：
- 不规划直接派"backend SubAgent 加 parent_id + 迁移 + IPC"+ "frontend SubAgent 派 dnd-kit Tree 改造"+ "frontend SubAgent 派 dropdown 改 9 处"+ "实测 SubAgent 跑 acceptance"——~4-5 SubAgent 投递，~4-5h；
- 风险：① V3 不变量可能被破坏（DragOverlay anti-pattern 这种 P0 就是规划过的还是出错，没规划更可能出）；② backward compat 可能不稳（serde default 不熟可能 break old data.json）；③ 用户验收时多轮反馈修复成本高。
- 估时：直接做 5h + 修 3h 反馈 = 8h，**跟本次完全一样**。但**质量不一定更差，有可能更好**——因为规划耗费的精力分散了"实施时的注意力"。

### 7.3 理想中间路径

**比 8h 更省 + 不损质量的方案**：

1. **跳过 wave 1 R3/R4/R6**（保留 R1/R2/R5/R7），节省 ~30% 调研。
2. **02 design spec 写"方向性"**而非 1300 行细节——只写关键视觉规格（缩进、chevron、drop indicator 形态）+ V3 不变量 link，不写每个 px / ms 的论据。
3. **03 tech plan 写"模块清单 + 关键算法 + 风险登记"**而非 3600 行——具体代码留给 SubAgent 自驱。
4. **跳过 V1 → V2 修订循环**——V1 直接给 final audit（综合 reviewer），抓 P0 后修。**多 reviewer + 多轮修订** 是 sidebar-reorder 这种"动效物理感首次建立"才需要的，本次不需要。
5. **派"自动化 acceptance SubAgent"**——把 27 项可机器验的 acceptance 自动化，让用户只验主观/视觉/物理感。

估算：**4-5h 总（节省 ~40%），代码质量基本相同**。

### 7.4 可迁移的抽象（最重要的一条）

**任务规划深度 ∝ 任务的"创造性 / 不可逆性 / 跨 session 复用价值"**：

| 任务类型 | 例子 | 推荐规划深度 |
|---|---|---|
| **创造性 + 高不可逆 + 高复用** | sidebar-reorder（首次定义动效物理感 + 未来所有 drag UI 复用） | 6 步范式 + 多 reviewer + design-language Rule |
| **结构性 + 中不可逆 + 中复用** | category-hierarchy（数据模型扩展 + dnd 树形是 known pattern） | **3-4 步范式 + 1 综合 reviewer**（本次过度规划） |
| **维护性 + 低不可逆 + 低复用** | 改 dropdown 选项 / 加 button | 直接做（按 Constitution §一.4 豁免） |

本次的核心方法论错误是：**误用 sidebar-reorder 的"创造性任务"规划范式，套到一个本质是"结构性扩展"的任务上**。Constitution §一.4 已经写了"任务本身简单 / 处理路径明确"可豁免，但"category-hierarchy 这种中等复杂度"任务没有清晰的判断标准。

**结论**：**值得 Constitution / Memory 升级** —— 在 Constitution §一.4 加"任务规划深度的三档分类",或把 `plan-as-research-design.md` Rule 扩充"何时不该 research-first plan"段（已有"Skip research-first planning when"段，但本次的 case 不在那个清单里）。

---

## 不纳入清单的候选模式（评估后未达可迁移标准）

- **"自动 commit 失败立即 revert + 重试"**：未在本次出现明确证据。
- **"final fix pass 一次性修 P0 + 选择性修 P1"**：是 sidebar-reorder Memory 已覆盖，本次只是应用，不算新方法论。
- **"用 design-language.md 作为 reviewer 的对照锚点"**：本次 final_audit 没显式引用 design-language.md，所以这个模式还没被验证；属于 future improvement。

---

## 总结：本次 session 提取的 6 个最值得固化模式

| # | 模式 | 类型 | 去向 |
|---|---|---|---|
| **A** | 设计哲学蒸馏 → 可加载 Rule（design-language.md） | 高 ROI 步骤 | **已固化**（项目 Rule） |
| **B** | _synthesis_decisions.md（多 SubAgent 调研后主 Agent 亲笔仲裁）| 编排创新 | **Constitution 升级**（§二.4） |
| **C** | _v2_patch_plan.md（多 reviewer 评审后主 Agent 整合 + 分派 patch） | 编排创新 | **Constitution 升级**（§二 增 6 节） |
| **D** | 任务规划深度三档分类（创造 vs 结构 vs 维护） | 反思后总结 | **Rule 升级**（plan-as-research-design.md） |
| **E** | 评审 SubAgent 数量随 P0 收敛而缩减 | 反思后总结 | **Memory** |
| **F** | "可机器验证的 acceptance" 应派自动化 SubAgent，不丢给用户 | 缺失 SubAgent 反思 | **Memory** |

### 最浪费的 3 个编排决策

1. **7 个 wave 1 SubAgent（应 4 个）**——R3/R4/R6 与其他报告 overlap heavy，多派 ~1.5 SubAgent round。
2. **6 个 V1 reviewer 派给一份 1307 行 V1 spec**——V1 spec 本身写得太详细诱发了过多 P0；如果 V1 spec 紧凑 300 行，3-4 reviewer 就够。
3. **未派"自动化 acceptance SubAgent"**——27 项可机器验的 acceptance 全丢给用户，让用户验证 + 反馈 + 修复占了 8h 中 ~2h。

### 最值得固化的 3 个模式（按优先级）

1. **任务规划深度三档分类**——这是本次最大的元教训，决定下次是不是要再走 21K 行文档路径；**升级 plan-as-research-design.md Rule 优先级最高**。
2. **设计哲学蒸馏 → 可加载 Rule**——已固化为 design-language.md，可作为"任何项目的质量标准建立后期"通用方法。
3. **_synthesis_decisions / _v2_patch_plan 的"主 Agent 不外包整合"模式**——Constitution 升级候选，让未来所有项目都按此结构编排多 SubAgent 协作。

---

## 附：建议落地清单（供后续 Stage 1C 评估）

| 模式 | 建议去向 | 文件路径 | 优先级 |
|---|---|---|---|
| A 设计哲学蒸馏 | 项目 Rule（已固化） | `.claude/rules/design-language.md` | 已完成 |
| B _synthesis_decisions 主 Agent 亲笔仲裁 | Constitution §二.4 补充 | `~/.claude/CLAUDE.md` | 高 |
| C _v2_patch_plan 主 Agent 整合分派 | Constitution §二 增节 | `~/.claude/CLAUDE.md` | 高 |
| D 任务规划深度三档分类 | Rule 升级 | `~/.claude/rules/plan-as-research-design.md` 加 "When NOT to plan" 段 | 最高 |
| E 评审 SubAgent 数量随 P0 收敛缩减 | Memory | `~/.claude/projects/.../memory/` | 中 |
| F 自动化 acceptance SubAgent | Memory | `~/.claude/projects/.../memory/` | 中 |
| #2.5 alignment check 必扫 Decisional 内容重叠 | 项目 Rule 升级 | `.claude/rules/cross-document-cascade-discipline.md` 加扫描清单 | 中 |
| 多 SubAgent 同改一文件应串行 | Memory | `~/.claude/projects/.../memory/` | 低 |

**注**：所有 Rule / Constitution 升级最终决议应在 Stage 1C 复盘阶段由用户确认；本文仅做提取与建议。
