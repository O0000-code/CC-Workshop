# Stage 1A — 返工溯源（Category Hierarchy Session）

> 范围：Category Hierarchy Session 全过程（00_understanding → 01_research × 7 → 02 V1/V2/V2.1 → 03 V1/V2 → 04 V1/V2 → 05_review × 6 reviewer + alignment + phase1_audit + phase1_t1f_lock_audit + final_audit + post-impl V2.1 修订）。
> 数据来源：`.dev/category-hierarchy/` 全部产物 + 当前 working tree 未 commit 的 707 行 SortableCategoriesList.tsx diff + 147 行 treeUtilities.ts diff + 247 行 appStore test diff + 02_design_spec V2 → V2.1 Revision History + git log（`a4cdcf7` 单 commit + 后续 working tree 未 commit 的所有修改）。
> 严格性：每个根因深挖到"信息/方法/假设/编排/上下文管理"层面；引用具体文件/行号 + commit hash + 用户原话。
> 用户成本：~$400 + 8 小时；用户原话："虽然让你充分调研，但花费了非常多 token，最终执行出来的效果依然存在很多问题"。

---

## 返工事件清单（按严重度排序）

### #1 实测后多轮"修了视觉但没修实质" — 拖入子类 bug 的反复修复（用户感受最痛）

- **表面原因**：实施完成、final_audit 评分 92-95 后，用户第一次实测发现"拖入子类的功能不工作"。最少 5 轮返工才真正修对：

  1. **第 1 轮**（"我以为修了 getProjection but 用户说没区别"）— 主 Agent 看到 console.warn 显示 `pointerBelowOver` 和 `over` 选择不对 → 写了 position-aware 的 getProjection（diff `treeUtilities.ts +332..+364`）→ 推送 build → 用户实测："我没有任何区别，你没有修复成功"。
  2. **第 2 轮**（"V3 reorder guard 跳过 IPC"） — 用户给截图证明 `activeId === overId === Writing` 但 `projection.parentId = Analysis`。主 Agent 发现 V3 时代的 `if (over && active.id !== over.id)` guard 在 hierarchy 场景下会让 IPC 被跳过 → 修了 guard，让"projection.parentId 改变"也走进 IPC → 推送 build → 用户："还是不行"。
  3. **第 3 轮**（"indicator 显示与 drop 行为不一致"） — 主 Agent 在 `handleDragEnd` 加 `console.warn` 调试日志（共 7 处），让用户复制 console 输出。从 console 看出 `dwellState === 'OUT'` 但 indicator 显示了 → indicator 显示条件和 drop 落地条件不同步 → 改 `parentRowIdForIndicator` 5 重 gate（diff `SortableCategoriesList.tsx +424..+457`）→ 推送 build → 用户："还有问题"。
  4. **第 4 轮**（"4 个 P0 一起修"）— 主 Agent 派一个 P0-bundle 修复 SubAgent 同时修：
     - **Maximum update depth exceeded** infinite loop — handleDragMove 闭包读 stale dwellState（diff +241..+253: `dwellStateRef`）
     - **isInvalid 失效** — 父类有 children 但 displayFlat 已 `removeChildrenOf`，D5 检测读不到 children → 加 `originalItems` 第 7 参数（diff `treeUtilities.ts +373..+388`）
     - **reorder 覆盖 setCategoryParent** — 双 IPC 顺序执行，第二个 IPC 把刚 setParent 完成的 child 弹回 root（diff `+855..+945` "P0-3 dispatch policy"：parentChanged → 只发 setCategoryParent；不再两个都发）
     - **max depth 漏网** — 前端 optimistic 阶段没有任何校验，backend 拒绝时已 mutate store 透出 illegal tree（diff `appStore.ts +537..+584`：前端镜像 backend 的 6 条 validate_hierarchy 规则）
     → 推送 build → 用户："拖动还是有问题——magnet 太强了"。
  5. **第 5 轮**（"非对称 promote/demote 语义"）— 用户原话："磁吸力太强了，需要稍微调弱一点……拖动到下方的大类别 2 的位置，正常也应该移除它作为大类别 1 子类别的身份……必须同时向右移动才能解除子类别状态。但正常来说，只要移除出它原本子类别的位置（比如移动到父类别的正上方），就应该能够正常解除"。主 Agent 终于理解："promote 是用户撤销之前的 demote，不应再要求重复一次确认手势"。改 V2.1 — 加 `originalActiveParentId` 第 8 参数 + "leave-original-subtree" 短路（diff `treeUtilities.ts +411..+451`）→ 用户验收"OK"。

- **根因（深一层）**：**主 Agent 在每一轮拿到反馈时都默认"reproduce 一遍 + 找 console 看 state + 改 state 计算"**——这是工程师调 bug 的直觉，但**完全错过了一层"用户真正在抱怨什么"的语义诊断**：
  - 第 1-3 轮，用户其实在抱怨"拖动 → 落不下子类"——根因有两条：(a) drop 行为本身不对（IPC 跳过、indicator/drop 不一致），(b) drop 行为对了但**用户对"什么时候 promote / 什么时候 demote"的心智模型与代码对齐不一致**。前者是技术 bug，后者是交互 spec 错误。每一轮主 Agent 都只在前者上修，后者一直没人 audit。
  - 第 4 轮一次修 4 个 P0，但仍然**对称地**对 promote 和 demote 都要求 12px X + 80ms dwell。用户在第 5 轮才用"磁吸力太强"这个**用户视角的物理隐喻**点破——这是 spec 层的对称性错误，不是实现层的 bug。
  - **元元根因**：spec 阶段（V2 `_v2_patch_plan §3.10` 状态机定义、V2 §6.3 阈值规则）就把 promote 和 demote **对称地**纳入 12px+80ms 状态机。R3/R4/R6 调研报告里都没显式分析过 promote vs demote 是否应该同 gate，主 Agent 也没在 _synthesis_decisions §3 里把这个决策点单独列出来评估。这是一个**未识别的决策点**——用户心智模型里 promote 和 demote 是非对称的（demote 是新建立、promote 是撤销），但 spec 把它们简单对称化，调研/规划/评审 6 个角度都没人 catch。
  
- **元根因（再深一层）**：**用户反馈类 bug 的诊断流程缺了一个"先理解抱怨语义，再去查代码"的前置 SubAgent**。MEMORY.md 的 `feedback_research_before_bug_fix` 已经记过"主观反馈类 bug 必须先派调研 SubAgent 找根因，不直接 patch"——但本 session 第 1-4 轮全部跳过了这一步，每次都是直接 grep state/run，每次都假定"用户说的就是技术 bug"。第 5 轮用户原话"磁吸力太强了"才让主 Agent 改派 spec 诊断而不是代码诊断。如果第 1 轮就派一个"用户感受 → 心智模型 → spec 偏差"的 diagnostic SubAgent，promote/demote 非对称性会在第 1 轮就识别出来，不需要 5 轮 build/install。

- **一步到位方案**：
  - **spec 阶段强制识别"对称 vs 非对称"决策点**：任何"X 与 Y 互为反操作"的交互（promote/demote、expand/collapse、attach/detach），spec 必须显式回答"两者是否同 gate"，不允许默认对称。本案应在 `_synthesis_decisions D6` 里加子问题 D6a：promote 与 demote 的 gate 是否对称？候选：(a) 对称 12px+80ms；(b) 非对称 promote 立即 / demote 12px+80ms；(c) 非对称的两个独立 dwell。每一选项必须列论据（用户心智、误触率、行业基准 Things 3/Linear/Notion 是非对称的）→ 主 Agent 锁定 (b) → 后续 02/03/04 都按 (b) 落地。
  - **第一次用户反馈强制派"语义诊断 SubAgent"**：用户给负反馈时，主 Agent 第一动作不是看 state/grep，而是派一个 SubAgent 用用户原话作为 spec 诊断 input，输出"用户在抱怨的是哪一层（spec 错 / 实现错 / 配置错 / 物理感错）+ 抱怨与 spec 的偏差点"，再决定下一步（改 spec / 改实现 / 改物理参数 / 改默认值）。本案如第 1 轮就这样做，第 5 轮的"非对称 promote"一定会在第 1 轮被识别。

- **可规范化为 Rule？**：**YES**——可写一条项目级（先项目，验证后升 global）："**Symmetric inverse operation pair must explicitly justify same-gate vs split-gate**"。任何成对的逆操作（promote/demote、attach/detach、expand/collapse、show/hide、enable/disable），spec 必须显式列出"两者是否共享 trigger/threshold/animation gate"决策项，不允许隐式对称。本 session 没识别这个决策点 → 5 轮返工。
  - 此外，**强化 `feedback_research_before_bug_fix`** Rule 的执行机制：用户负反馈触发"语义诊断 SubAgent"作为强制第一步，不允许跳到 grep/state/code 诊断。MEMORY 已经写了原则，但本 session 的 5 轮跳过证明执行不够强；需要把"派 diagnostic SubAgent"作为可调用 skeleton 而非纯文字 Rule。

- **影响**：
  - **直接成本**：5 轮 build + reinstall + 用户实测（每轮 ~10-15 分钟用户时间 + 10-20 分钟主 Agent 时间）= ~1.5-2 小时纯返工。
  - **token 成本**：每轮包含 console.warn 加日志/移除日志 + 各种 SubAgent 派发 + 重新 build 触发 cargo + dev mode 各种 grep——单 5 轮估约 80-150K token。
  - **设计 token 漂移**：第 4 轮加的 4 个 P0 修复都是补丁式 fix（`dwellStateRef`、`originalItems` 第 7 参、双 IPC 改单 IPC dispatch policy、前端 6 条 mirror 校验），都不在 V2 spec 内，有 4 处 `Bug fix 2026-05-05` 注释作为标记——这部分实质是 V2 spec 的 P0 漏洞，但代码里以"实施期 patch"形式落地，没回流 spec → 下次改这部分代码的 SubAgent 看 spec 会以为 V2 是对的，导致 spec 与代码再度偏离。

---

### #2 04 implementation_plan V1 第一次撰写超 64K token 上限失败

- **表面原因**：04 V1 第一次撰写时，撰写 SubAgent 把 03 tech_plan 的实现细节（types、validators、IPC bodies、useMemo 实现）全部复制进 04 任务卡里，最终 plan 超过 64K token 上限直接 truncate 失败。主 Agent 必须重新写。

- **根因（深一层）**：**SubAgent 默认按"详尽 = 安全"的标准写文档**。04 是 implementation plan，但 SubAgent 错把它当成"实施手册"——把 03 的 spec 内容下沉到 04 让 SubAgent "看一份就能干"。这违反 plan-document-style 的"方向 over 细节、范围 over 行号、必读上下文 over 重复内容"，但 SubAgent 没看 plan-document-style Rule，主 Agent 也没把这条 Rule 显式列入 04 撰写 SubAgent 的"必读清单"。

- **元根因（再深一层）**：**Rule 加载机制不靠谱时的 fallback**——`.claude/rules/plan-document-style.md` 在项目根有 paths frontmatter（按文件路径触发），但 04 撰写 SubAgent 在新 cwd / 新 prompt 上下文里不一定加载到——尤其是 plan 文件本身还在新建中（`.dev/category-hierarchy/04_implementation_plan.md` 不存在时，paths 无法 match）。主 Agent 没意识到这个时机错位，把 Rule 当成会自动加载的"硬约束"。

- **一步到位方案**：
  - 04 撰写 SubAgent 的 prompt 显式加："**必读 + 严格遵守** `.claude/rules/plan-document-style.md`，特别是"≤ 800 行"和"不写代码示例"硬限制；超过 100 行的任务卡是 P0"。
  - 04 撰写 prompt 限制本身设硬约束："输出不得超过 800 行，超过则停下重新组织"。
  - 主 Agent 在派发涉及"产出新文件"的 SubAgent 时，意识到 paths-based Rule 在新文件创建场景下不会自动 trigger（paths 是 read-time match，不是 write-time），必须主动把相关 Rule 复制进 prompt。

- **可规范化为 Rule？**：**YES**——可补强既有 `.claude/rules/plan-document-style.md`：在 "Hard limits" 段加一条 "撰写 SubAgent 必须收到这个 Rule 作为 prompt 内嵌（不依赖 paths 自动加载）"——本质是 plan-document-style 的执行机制问题，不是新 Rule。
  - **更通用的 Rule 候选**："**paths-frontmatter Rules don't fire on file creation**"——任何 Rule 用 paths frontmatter 限定到某文件路径，SubAgent 在创建该文件时 paths 不 match → Rule 不加载。此时 SubAgent prompt 必须显式 inline 该 Rule 的核心约束。本案是真实事故，可作为 global Rule 候选（涉及 paths frontmatter 机制本身，跨项目通用）。

- **影响**：
  - 直接成本：~30 分钟（撰写失败 + 重写 V1 → ≤ 800 行成功）。
  - 间接成本：04 V1 的"不达 plan-document-style"问题没在重写时被完全修正，仍有"任务卡 ≤ 30 行"的违例（_v2_patch_plan 也是如此）；只是没再超 64K。

---

### #3 P0 修复后又被前一次"修复"覆盖（cascade-promote orphan-flag 反复）

- **表面原因**：phase1_audit 列出 P0-1 同级 Decisional 矛盾（`_v2_patch_plan §3.4` 说"orphan 不写 flag"，`03_tech_plan §3.4` 说"orphan 不阻塞 flag advance"）。phase1_audit 推荐 Option A（spec 03 reading）。主 Agent 让用户裁决 → 用户选 Option A → T1e 实施 SubAgent **改了 data.rs**，但 `_v2_patch_plan §3.4` 的草稿措辞"任一 orphan → flag 不写 true"没改——只在文档底加了 "~~决策（V2 草稿，已被 Phase-1 audit P0-1 推翻）~~" 删除线 + 新决议。phase1_t1f_lock_audit 之后 final_audit 又重新审查，发现 `types.rs:247-262` 的 doc comment 仍说 "ONLY when both orphaned_* are empty" → 又是 P1-1。修复 doc comment 之后才真正清掉。

- **根因（深一层）**：**修订 Decisional 文档时只在文档头部加 "~~草稿已推翻~~" 标签，不去清理文档正文 + 代码 doc comment + 测试断言**。这是 cascade-discipline 的反例——多文档 + 代码注释 + 测试都引用"orphan-blocks-flag"措辞，单点修订后 cascade footprint 在 4 处（`_v2_patch_plan` 正文、`03_tech_plan §3.4`、`types.rs:247-262` doc comment、`migrate_*` 测试 `migrate_does_not_write_flag_on_orphan` 命名）。phase1_audit 修了正文 + 测试，没修 doc comment；final_audit 才点出 doc comment。

- **元根因（再深一层）**：**审 SubAgent 阅读"过期文档"时把它当作"参考但已修订"理解，而新 SubAgent 阅读时倾向于"按字面执行"**。审 SubAgent（phase1_audit）知道 `_v2_patch_plan §3.4` 草稿已 obsolete，但 T1e 实施 SubAgent 第一次读时拿到的是同时含 obsolete 草稿 + 新决议的文档——容易选错 reference。这是 multi-round revision 的 retroactive 修订模式（"加标签、不删原文"）的固有缺陷。

- **一步到位方案**：
  - **修订 Decisional 文档时强制 cascade footprint 完整执行**：`_v2_patch_plan §3.4` 推翻时，主 Agent 必须 grep `orphan_skills|orphan_mcps|migrate_does_not_write_flag_on_orphan|ONLY when both` 找出所有 4 处引用，全部 patch 到新决议——不允许只在文档头加标签留下原文。本 session 的方法论"加 ~~草稿~~ 标签 + 文档底加新决议"是反模式。
  - **doc comment 与代码同步检查**：`types.rs` 的 doc comment 是代码内的 spec——任何 spec 修订必须 grep `///|//!|##` 加上 `Rust types/structs` 的 doc 段把它纳入 cascade。
  - 这条与现有 `cross-document-cascade-discipline.md` 是同一原则，但本 session 只把 .md 文档纳入 cascade scope，没把 doc comment / test names 纳入 → Rule 需要扩大 scope。

- **可规范化为 Rule？**：**YES**——可强化 `.claude/rules/cross-document-cascade-discipline.md` 增加一条 "Cascade scope MUST include doc comments inside source files and test names"——任何 spec 修订时，cascade footprint 检查必须包括：(a) .md 文档；(b) 源文件 inline doc comments；(c) 测试函数名 + 断言文本；(d) commit message 与 PR 描述。

- **影响**：
  - 直接成本：~20 分钟（final_audit 识别 + 主 Agent patch doc comment）。
  - 间接成本：本 session 因为 cascade 不全的 retroactive 修订模式至少触发 3 次类似的"修了一处忘另一处"——本事件 + #4 + #5。说明现有 cascade Rule 的 scope 不够，只覆盖文档级 cascade，没覆盖 doc comment / 测试 / commit message 级 cascade。

---

### #4 前次"修复"实际只是注释 / 视觉改动，没修实质（drop-into 第 1 轮）

- **表面原因**：用户原话："我没有任何区别，你没有修复成功"。事件背景：第 1 轮主 Agent 看到 `pointerBelowOver` 错位 → 修了 position-aware getProjection（diff `treeUtilities.ts +332..+364`）→ console.warn 看起来对了 → 推送 build → 用户实测仍未修。

- **根因（深一层）**：**主 Agent 把"console 输出对了 + 自动化测试绿了"当作"用户场景修复了"的代理指标**。但 console 输出展示的是 `pointerBelowOver` 这个 *中间* 状态，不是"drop 落地是否正确"这个 *终态*。同时本 session 的自动化测试是 jsdom（不能驱动真 PointerEvent + dnd-kit sensor），所以测试绿不代表 drop 行为对。**主 Agent 用"我看到 console 输出对了"代替"用户场景对了"做收敛判断**，导致每次 push build 都是 false positive。

- **元根因（再深一层）**：**实施期间没有"用户场景级"自动化验证**。code 测试是 jsdom，跳过 PointerEvent 驱动；用户测试需要主 Agent 启 dev server + 用户实测。两者中间没有任何"模拟用户拖拽 + 验证后端最终状态"的端到端测试。主 Agent 默认用"console.warn + 看 state" 作为"能不能放出去"的判断，但 console.warn 是开发者视角的中间态，不是用户视角的终态。

- **一步到位方案**：
  - **任何用户负反馈相关的 fix，主 Agent 必须列出"修复后在用户视角能观察到的具体差异"**——不是"console 输出对了"，而是"用户拖 A 到 B 下方然后松手 → A 现在是 B 的子类（数据层 + 视觉层都验证）"。这条作为 fix 的"完成判定"，没列就不准 push build。
  - **建立 "drop scenario E2E" 一类的 manual test 清单**：用户实测时按清单走（拖 A 到 B 下、A 到 B 内、A 到 root、子类拖出等等），每条对应"预期 dataAfter"——不再让用户自己想"我应该测什么"。

- **可规范化为 Rule？**：**YES（项目级）**——"**A fix for user-reported behavior must define a user-observable success criterion before claiming completion**"。修复时必须先写"修好后用户能观察到的差异"+ "不能观察到的差异"（不变量），再去修——避免主 Agent 用 console 输出作为收敛代理。本案值得加进项目 `.claude/rules/`。

- **影响**：
  - 直接成本：第 1 轮浪费一整轮 build + reinstall + 用户实测（~15 分钟）。
  - 复合效应：第 2-3 轮都因同样的"console 看起来对" 失败，是第 1 轮模式的复制——所以本根因放在最高 P0 不为过。

---

### #5 工程纪律违反 — console.warn 调试日志加入又移除（生产代码污染）

- **表面原因**：第 3 轮 drop-into 调试时，主 Agent 在 `SortableCategoriesList.tsx` 加了 7 处 `console.warn` 用于让用户复制 console 输出（`[DragEnd] enter`、`[DragEnd] recomputed projection`、`[DragEnd] skipped re-projection (no over or dwell=OUT)`、`[DragEnd] decision`、`[DragEnd] -> onSetCategoryParent BEFORE/AFTER await`、`[DragEnd] reorder plan`、`[DragEnd] -> onReorder AFTER await` + appStore 3 处 `[reorderCategories] Stage 1/2`、`[moveCategoryToParent] Stage 1`），同时把整个 `__dbg_*` 局部快照变量塞进 handleDragEnd → 后续 cleanup 时人工删除。当前 working tree 的 diff 仍含这些 add/del 的"日志半成品" — 大量 console.warn 已删除，但 commit 还没创建。一个 commit (`a4cdcf7`) 后又有 707 行 SortableCategoriesList diff 才"干净"。

- **根因（深一层）**：**用 `console.warn` 做诊断日志而不用专门的 debug build flag / DEBUG_LOGS 常量**——`console.warn` 是生产代码里的非临时态，加进 commit/push 后污染所有用户的 console。本应用 `if (DEBUG_LOGS) console.warn(...)` 或 React DevTools 的 hooks debug，使其能 commit 不污染但又方便开发者打开。同时主 Agent 没把"加日志 → 一次性移除"作为单独的 cleanup commit，而是把日志和后续 fix 揉在一起，使 final commit `a4cdcf7` 之后还有大量 add/del 的 working tree diff。

- **元根因（再深一层）**：**主 Agent 在用户实测期间没有区分"用户看的东西"和"开发者看的东西"两个频道**——console.warn 是"开发者看"的，但因为本 session 用户被引导去看 console 输出，console.warn 被错误地当成"用户看的东西"，结果后续清理时纠结于"还要保留给用户看 vs 是临时的不该 commit"。如果一开始就用 `if (DEBUG_DROP) console.debug(...)` 或 dev-mode-only 的可视化 overlay panel，这种二义性就不存在。

- **一步到位方案**：
  - **诊断日志统一走 `if (process.env.NODE_ENV === 'development' && DEBUG_DROP_INTO) console.warn(...)`**，commit 进 main 不污染生产，开发者可以 toggle DEBUG_DROP_INTO=true 重启 dev server 看。
  - **诊断日志的 commit 与 fix commit 严格分离**：每加一组日志单独 commit `chore(debug): add drop-into diagnostic logging`，cleanup 时单独 commit `chore(debug): remove drop-into diagnostic logging`，fix 自身一个 commit。这样 git log 干净。
  - **本 session 应当在最后做 cleanup commit 把所有 console.warn 移除**——但实际状态是 working tree 还存着大量 add/del 没整理（见 git status diff 707 行），说明主 Agent 在本 session 末尾没做 final cleanup。

- **可规范化为 Rule？**：**NO**（语言层面/工程纪律细节，不必上 Rule）——但可以加进项目 memory "console.warn debug discipline" 或 user CLAUDE.md "debug logging discipline"。

- **影响**：
  - 直接成本：cleanup 期间 ~10 分钟人工删除每处 console.warn。
  - 间接成本：本 session 的 commit `a4cdcf7` 之后还有 707 行 working tree diff，**没有作为 commit 收尾**——意味着用户机器上"feature ship 了"但 working tree 还在脏状态，违反"open-source 升格后 commit 必须清晰精细" MEMORY 反馈。

---

### #6 V1 评审整体差距 — 6 reviewer 平均 78.8/10、F 给 62（数据安全）

- **表面原因**：V1 三件套（02/03/04）评审 6 份并行：A 87、B 78、C 85、D 83、E 88、F 62。F（migration safety）给 62 是 stop-ship 级别，发现 4 个 P0 数据安全 bug（migration flag 撞 saveSettings、cascade-promote 同名碰撞、migration 失败仍写 flag、CreateSceneModal P0-DATA-4 漏在 T3e 清单）。V2 复评后才 close。

- **根因（深一层）**：**调研→规划→评审三阶段各自独立，规划阶段没把调研的"数据迁移风险"当作硬约束 cross-check**。R1 (`r1_data_model.md`) 70K 字详细写了 migration 风险，包括"flag 失败处理"、"orphan 处理"、"cascade-promote 冲突"等等——但 V1 03_tech_plan 写出来时只采用了"happy path 实现"，没用 R1 的 risk 段做 conformance check。F 评审站在数据安全角度复读 R1 里其实已经写过的风险 → 才识别 4 个 P0。这不是研究不足，是"规划阶段没把研究的 risk 段当作 binding 评审锚点"。
  - 与"shared session 1 #6 V1 评审整体差距 6.6/10"是同一根因（research 没驱动规划）的复发。MEMORY 写过 `feedback_phase_review_loop` "每个 Phase 完成后单专家审核 SubAgent + 修复，再进下一 Phase"，但这是评审-时刻的 Rule，不是规划-时刻的——规划阶段缺的是"主动 cross-check research"。
  - `~/.claude/rules/plan-as-research-design.md` 的 Layer 2 "Synthesis Gate" 是这个问题的解药，但本 session 的 _synthesis_decisions.md 只 syndecisions 了 14 个决策点，没系统化把 7 份调研的所有 risk / constraint 抽出来做 conformance。

- **元根因（再深一层）**：**research → plan 之间的 "risk distillation" 步骤缺失**。`_synthesis_decisions.md` 是"决策汇总"——把 14 个 D 的最佳选择确认下来。但 R1-R7 里还有 30+ 条隐性约束 / 风险（例如 R1 §4.2 "migration 失败 + 重启重跑" 的 atomic 要求、R5 §3 "5 dropdown 实际是 6+" 的列表、R6 §2.2 "filter 解析在 CategoryPage 层"等等），这些不在 14 决策点中但对实施关键。主 Agent 应在 _synthesis 之后再派一个 _risk_distillation SubAgent 把所有 R*.md 的"风险/约束/边界条件"抽成清单，spec 写完后用 SubAgent 跑这份清单做 conformance。

- **一步到位方案**：
  - **research → plan 中间多加一个产物 `_risk_distillation.md`**：把 7 份调研的所有 risk + constraint + boundary condition 抽成 ≤ 50 条清单（每条 1 行 + 引用 R*.md §X）。02/03/04 写完后由独立 SubAgent 跑这份清单，输出 conformance report。本 session 的 _v2_patch_plan 实际已经隐式做了这件事（dedup 6 评审找 P0），但是 *评审-后* 做的——成本是 V1 已经写完。如果 *规划-前* 就做，V1 就接近 V2 质量。
  - **`_synthesis_decisions.md` 加 §"未列入 14 决策但关键的 binding 约束清单"** ——主 Agent 写 _synthesis 时强制写这一节，把 30+ 条隐性约束显式化。

- **可规范化为 Rule？**：**YES**——可补强 `~/.claude/rules/plan-as-research-design.md` Layer 2 "Synthesis Gate"：明确 "Synthesis Gate must produce two artifacts — `_synthesis_decisions.md` (decision lock) AND `_risk_distillation.md` (binding constraints from research)"。后者是规划-time 的 audit anchor，不是评审-time 的 reviewer 输出。本案值得 promote 到 global Rule（跨项目都适用 research-first 工作流）。

- **影响**：
  - 直接成本：V1 → V2 评审 + patch（6 reviewer 评审 SubAgent + 主 Agent 整合 + W6-A/B/C/D 四个 patch SubAgent + T0 alignment）≈ 2-3 小时。
  - 这是本 session **时间成本最大**的单一返工。本应一次到位 V2 级别。

---

### #7 大量评审 SubAgent 的 ROI 分布严重不均

主 Agent 派发的所有大型 SubAgent 评估：

| SubAgent | 角色 | ROI | 理由 |
|---|---|---|---|
| R1-R7 调研 7 份 (~458K 字) | 调研 | High | R1 里的 6 条 P0 数据安全约束、R2 里的 dnd-kit Tree pattern + 20 V3 不变量回归核对、R5 里的"5 dropdown 实际 6+"清单都直接驱动了 V2 修订；R7 design philosophy 直接产出了 design-language.md |
| `_synthesis_decisions.md` 主 Agent 自写 | 决策汇总 | High | 14 决策定锤后所有 wave 2/3 SubAgent 不需要再读 7 份调研，是主 Agent 唯一不外包的产出，节省了大量 wave 2/3 token |
| Reviewer A (Design) | 评审 | High | 5 P0 全是真问题（drop-indicator 几何、chevron click 占用、localStorage 反转、dwell 边界、DragOverlay padding），全部进入 V2 |
| Reviewer B (HCI) | 评审 | Medium-High | 4 P0 中 2 真（HIG 引证、ContextMenu 路径、parent-delete confirmation），但 P0-1 的 keyboardCoordinates API 误用本是 R2 已经标注的（R2 已经引证 dnd-kit 官方 example），重复劳动 |
| Reviewer C (Rust/Tauri) | 评审 | High | 2 P0 全真（migration flag 撞 saveSettings、cascade-promote 同名碰撞），都是 R1 risk 段已 partial 提及但 V1 漏的 |
| Reviewer D (dnd-kit) | 评审 | High | 2 P0 都是关键 spec 错（arrayMove 错序、treeKeyboardCoordinates API），影响实施 |
| Reviewer E (alignment) | 评审 | Low | 0 P0 + 11 P1 全是文档级编号偏移（22 vs 23 项不变量、25 vs 21 任务卡）。**这本来是 cross-document-cascade-discipline 应该在 V1 撰写时由主 Agent 自己保证的，外包给 reviewer 是把保障责任转嫁到评审，反向激励规划质量** |
| Reviewer F (migration safety) | 评审 | High | 4 P0 数据安全，最高分严肃度。但参 #6 — F 找的 4 P0 全在 R1 已写过，反向证明 V1 没把 R1 risk cross-check 进去 |
| `_v2_patch_plan` 主 Agent 自写 | 修订决议 | High | dedup 17 P0 → 15 unique 是必要的整合，主 Agent 不外包 |
| W6-A/B/C/D V2 patch 4 SubAgent | 修订实施 | Medium | 必要但写得偏机械，不少地方"加标签不删原文"导致后续 cascade 漏修 |
| T0 alignment | 对齐 | Medium | 对齐表 14 决策三处一致 + V3 不变量编号一致——文档对齐价值高，但**前面 V1 阶段如果一次到位 V2 级别，就不需要这一步**（这一步是 V1→V2 修订的产物） |
| phase1_audit (T1a-T1e) | Phase 1 审计 | Medium-High | 88/100 + 找出 1 P0 (orphan-vs-flag 同级 Decisional 矛盾) — 真问题。但 P0 本来就是规划阶段就该锁定的，"两份 Decisional 互相矛盾"是 cascade-discipline 失效（参 #3）。审 SubAgent 帮 catch 是 last line of defense |
| phase1_t1f_lock_audit | T1f 锁覆盖审计 | High | 95/100 + 进一步发现 4 个 mutator 漏锁（`delete_skill`/`delete_mcp`/`update_skill_scope_in_metadata`/`update_mcp_scope_in_metadata` in import.rs）— 是 grep-before-enumerate Rule 的反面教材，证明单 grep `read_app_data\|write_app_data` 不够（缺 `data_path|fs::write.*data\.json` 的 defense-in-depth grep）。本 session 已经把这条作为 Rule 更新写进 grep-before-enumerate-shared-resource.md |
| final_audit (Phase 1-4) | Final audit | High | 78/100 找 3 P0（DragOverlay 接受 depth prop 违反 V3 不变量 #21、ContextMenu Promote-to-root 缺、parent-delete confirmation 缺）+ 7 P1。本应实施期 SubAgent 自己 ensure conformance，但 final_audit 拦下 → **如果 V2 spec 写得更明确这些反 anti-pattern 项 + 实施 SubAgent prompt 显式要求"列出每个 V2 §X.Y 的 conformance 状态"，可能不需要这一步**。最终 92-95 评分主要是 final_audit 的修复贡献 |
| post-impl V2.1 (5 轮 drop-into 修复 + 用户实测) | 后置修复 | Negative | 见 #1 — 本 session 浪费最严重的部分；如果 spec 阶段识别 promote/demote 非对称性，这一整个阶段都不需要 |

**ROI High 的合计 token 估计 ~70%（调研 + reviewer A/C/D/F + phase1_t1f + final_audit）**；ROI Medium 占 ~20%（W6/T0/phase1_audit）；ROI Low/Negative 占 ~10%（Reviewer E + post-impl 5 轮）。**关键观察：哪怕只把 ROI Low/Negative 那 10% 从 ~$40 节省到 $0，本 session 仍是 $360 的成本——根本性节省必须来自规划阶段一次到位（参 #6）+ 用户反馈的诊断流程升级（参 #1 #4）**。

- **可规范化为 Rule？**：**Partial YES**——
  - 评审 SubAgent 派发前必须 sanity-check："这个 reviewer 找的问题，规划/调研阶段是否有可能 catch？" 如果 yes，问题应该回流为"规划/调研阶段的硬约束补强"，而不是"再多派一个 reviewer"。 反向激励是"评审越多越好"，正向激励是"规划越准越好"。本案 Reviewer E 的 P1 全是 alignment 类，本应主 Agent 自己保障 → 派发前可以省。**但 Rule 写法要小心，因为 reviewer 兜底仍有正面价值；只要明示"评审是 last line of defense, not first"即可。**

---

### #8 修每一次 bug 就 rebuild + reinstall 一次（4-5 次循环）

- **表面原因**：本 session 用户机器上至少 4-5 次 `cargo build --release` + `rm -rf /Applications/Ensemble.app && cp -R ...bundle/macos/Ensemble.app /Applications/`，对应 5 轮 drop-into 修复（#1）+ 一次 final ship 修复 (3 P0)。每次 release build ~5 分钟（Rust 全编 + Tauri bundle）。

- **根因（深一层）**：**用 release build 而非 dev mode 实测**——`npm run tauri dev` 启用 hot-reload 是 < 30 秒迭代；release build 是 ~5 分钟全编 + 必须 reinstall 到 /Applications/。本 session 多轮迭代用 release，是错的工具选择。MEMORY 已经写过"`生产版本不会自动覆盖 /Applications/Ensemble.app`"（说明用户偏好 release build for 实测），但实际 dev mode 完全可以 + 节省 5 分钟/轮。

- **元根因（再深一层）**：**"用户实测必须用 release build"是隐性假设，实际上 dev mode 能跑全功能（仅热加载机制不同）**。主 Agent 没主动建议 dev mode，用户也没主动要求 dev mode，于是默认走最重的路径。

- **一步到位方案**：
  - 实施期间用户实测一律走 dev mode (`npm run tauri dev`)——主 Agent 主动建议，user 启动一次 + 持续 hot-reload，每次 fix 不需 rebuild。
  - 仅 ship 前最终验证用 release build。

- **可规范化为 Rule？**：**NO**（项目工具偏好层，写进 MEMORY 即可）——已有 "Build & Deploy" 段写过 release build 步骤，但缺一条"实测期间用 dev mode，仅 ship 前 release"的引导。

- **影响**：
  - 直接成本：5 轮 × 5 分钟 = 25 分钟纯 build 等待。
  - 心理成本：每次 5 分钟等让"调一个小 bug"显得很沉重，进一步压缩了"先派语义诊断 SubAgent 再 fix"的容忍度（参 #1）。

---

### #9 Plan-document-style 80% adherence 后又复发（cross-session）

- **表面原因**：04 implementation_plan V2 是 343 行（在 ≤ 800 限制内），相对 V1 64K 失败大幅 improve。但本 session 02 design_spec V2.1 共 1329 行（V2 已经 1307 行），03 tech_plan V2 共 3602 行——**plan-document-style 只约束 04，没约束 02/03，结果 03 自由膨胀**。

- **根因（深一层）**：**plan-document-style.md 的 "Hard limits" 段只列 implementation_plan ≤ 800，没有给 02/03 设上限**。V2 03_tech_plan.md 3602 行是过度的——里面有大量"verify-third-party-behavior"的 node_modules 引用粘贴、各 P0 的 implementation block 完整代码、每条 V3 invariant 的 verbatim quote 等等。这是"详尽 = 安全"思维的延续，但 03 不是 implementation plan 是 tech plan，本应聚焦"架构决策 + 关键算法 + 必要 verbatim 代码"，不该是 implementation 手册。

- **元根因（再深一层）**：**plan-document-style 是 implementation_plan 的特化 Rule，不是 spec/tech plan 的通用 Rule**。但本 session 表明 spec/tech plan 同样需要 size discipline——3602 行的 tech plan 没人能完整读一遍，连主 Agent 自己也只能读章节 + grep。3602 行是膨胀指标。

- **一步到位方案**：
  - 写一条更通用的 `.claude/rules/spec-document-style.md`，覆盖 02 design_spec / 03 tech_plan / 任何 binding 文档：
    - 02 ≤ 1000 行（视觉 + 交互 + 动效，token 化的内容应该不超过 800）
    - 03 ≤ 1500 行（架构决策 + 关键算法 + 必要 quotes，超出说明在 verbose 区域膨胀）
    - 04 ≤ 800 行（已有）
  - 超限的硬约束 + 撰写 SubAgent 必须收到这个 Rule。

- **可规范化为 Rule？**：**YES**——可加 `.claude/rules/spec-document-style.md`（项目级）或者扩展现有 `plan-document-style.md` 的 scope 到所有 .dev/ 下的 binding 文档。

- **影响**：
  - 直接：3602 行 tech plan 反复读取的 token 成本（每个 SubAgent 必读 = N × 3602 行）→ 估算 ~30K token 浪费 / SubAgent。
  - 间接：超长 spec 反而让 SubAgent "跳着读"，关键决策可能被 skim 过——参 #6。

---

### #10 设计 spec 的 Anti-pattern 项目本身违反 spec（DragOverlay depth prop）

- **表面原因**：02 V2 §2.5 + §2.22 anti-pattern + §11 三处都明文禁止 "DragOverlay 接受 depth/paddingLeft prop"。final_audit 拦到 T3b 实施 SubAgent 给 `DragOverlayCategoryRow` 加了 `depth + hasChildren` props（违反 V3 不变量 #21）。修复：revert 回 V3 风格的 naked clone。

- **根因（深一层）**：**实施 SubAgent 看到"父类有缩进，DragOverlay 跟手时也应该有缩进"的视觉直觉，违反了 spec 的 anti-pattern 显式禁止**。spec 的禁止理由是"DragOverlay 视觉应等同被拖项当前形态而非未来形态"——这是设计哲学层的 invariant。SubAgent 在没有 design philosophy 训练的情况下，倾向于按"看起来一致"的视觉直觉写。

- **元根因（再深一层）**：**T3b 任务卡的 prompt 没把 anti-pattern 列表显式列出来**，只是引用 02 V2 §2.22。SubAgent 默认按 spec body 实施，anti-pattern 段是补丁式 reminder，容易被 skip。

- **一步到位方案**：
  - 实施 SubAgent 的 prompt 必须显式 inline 该任务相关的 anti-pattern 清单，让 SubAgent 在 deliverable 里 cite "本实施已避免 anti-pattern 1/2/3"（强制 acknowledge）。
  - 02 V2 §2.22 anti-pattern 段在 spec 中应当是 "硬 acceptance"——final_audit 之前一定会跑一遍 grep "为每条 anti-pattern 跑一次反向匹配（看代码里有没有违反）"，不能依赖 final_audit SubAgent 自己识别。

- **可规范化为 Rule？**：**Partial YES**——可在项目级 `.claude/rules/` 加一条 "**spec anti-patterns must be acknowledged in implementation deliverables**"。SubAgent 完成实施时必须输出"已避免哪些 anti-pattern"清单，主 Agent 验证后才进 next phase。

- **影响**：
  - 直接成本：final_audit 找出 → 修复 SubAgent 30 分钟（revert + 重写测试）。
  - 间接：如果 final_audit 没拦下，V3 不变量 #21 破坏会被 V3 sidebar-reorder Session 1 的回归测试 catch（如果有），否则用户实测 lift 视觉就会发现"child row lift 起来 padding 不对"——还会再多一轮返工。

---

## 跨事件的共性根因（合计观察）

合计 10 个返工事件，可以聚合出 4 条共性根因：

### 共性根因 #1：用户反馈类 bug 没有"语义诊断"前置 SubAgent

- **触发事件**：#1（5 轮 drop-into 修复都跳过语义诊断）、#4（第 1 轮"console 看起来对了"代理指标错）

- **共性表述**：用户用直觉/物理感隐喻描述问题（"磁吸力太强"、"没有任何区别"），主 Agent 默认跳到 grep state / 改实现层。需要先有"用户语义 → spec 偏差"的诊断 SubAgent，才决定下一步去改 spec / 实现 / 物理参数。

- **解药方向**：MEMORY 已写过 `feedback_research_before_bug_fix`，但本 session 仍有 5 轮跳过——证明纯 Rule/Memory 不够，需要 skeleton 化的 diagnostic SubAgent template。

### 共性根因 #2：cascade footprint scope 太窄

- **触发事件**：#3（doc comment 漏修）、#5（debug log + commit 没分离）、#10（anti-pattern 没回流到实施 prompt）

- **共性表述**：现有 `cross-document-cascade-discipline.md` 只覆盖 `.md` 文档间 cascade，没覆盖 doc comment / 测试名 / commit message / 实施 SubAgent prompt 的 cascade。修订一处 spec，cascade 需要扩到 4-5 个介质。

- **解药方向**：扩展 cascade Rule scope，定义 "any binding artifact"（包含 spec md + doc comment + tests + commit message + SubAgent prompt template）作为 cascade 的目标。

### 共性根因 #3：规划阶段没把研究的 risk/约束当 binding cross-check

- **触发事件**：#6（V1 评审 6.6 主要因 R1 risk 没 cross-check）、#1（promote/demote 非对称性是未识别决策点）

- **共性表述**：调研产出大量 risk/constraint，规划阶段只用了 14 个显式决策点，剩下 30+ 条隐性约束被 skip。评审阶段 catch 的 P0 大部分是 R*.md 已经写过的 → 评审承担了"规划应当避免"的常规问题。

- **解药方向**：研究 → 规划 中间多一份 `_risk_distillation.md`，把 R*.md 抽成 binding 清单。Synthesis Gate 必须产出两份 artifact 而不是一份。

### 共性根因 #4：主 Agent 用代理指标代替终态判定

- **触发事件**：#1 / #4（console.warn 输出 vs 用户场景）、#10（实施 SubAgent self-claim "已遵守 spec" vs final_audit 实测）

- **共性表述**：主 Agent 在 SubAgent 完成后倾向于信任 SubAgent 的自评（"console 输出对了"、"我已遵守 §2.22 anti-pattern"），不主动跑 grep/反向匹配。结果 last-line-of-defense（final_audit / 用户实测）才识别。

- **解药方向**：每个 fix 之前主 Agent 必须显式列出"完成后用户/系统能观察到的差异"。SubAgent 完成后主 Agent 必须 grep "anti-pattern" 反向匹配。**不让 SubAgent 自评为终态。**

---

## 总结

- **共发现 10 次返工**（其中 #2 是 V1 撰写失败，未到用户层；#3 #6 #10 全是评审拦截；#1 #4 #5 #8 用户实测期间发生；#7 是 ROI 评估而非单事件）。

- **其中 4 次会产生用户可感知后果**：
  - #1 5 轮 drop-into 修复都需要用户实测（已发生，~1.5-2 小时）
  - #4 第 1 轮"我没有任何区别"（已发生，包含在 #1 内）
  - #8 用户机器 4-5 次 release build + reinstall（已发生）
  - #5 commit `a4cdcf7` 之后 707 行未 commit 的 working tree diff（已发生，feature ship 但 git 状态脏）

- **其他 6 次属于"规划/评审内部"返工**：质量代价 = 评审时间 + 规划修订时间，未到用户层（但评审 SubAgent 的 token 大头在此）。

- **共性根因**：用户反馈语义诊断缺失 + cascade scope 太窄 + 规划阶段不 cross-check research risk + 用代理指标代替终态判定。这四条互相强化——规划没 cross-check 导致评审承担、评审多了导致主 Agent 倾向于信任 SubAgent 自评、信任 self-evaluation 导致 last line of defense（用户实测）才发现，于是返工到用户层；用户负反馈缺诊断流程导致 5 轮 build 错位。

- **本 session 浪费分布**：
  - **ROI High（必要 + 驱动决策）**：调研 7 份、A/C/D/F reviewer、phase1_t1f_lock_audit、final_audit、用户最终验收 → 占 token 70%。
  - **ROI Medium（必要但本可避免）**：W6 V2 patch 4 SubAgent、T0 alignment、phase1_audit、Reviewer B → 占 token 20%。如果 V1 一次到位 V2 级别，这部分大部分省。
  - **ROI Low/Negative（浪费）**：Reviewer E（评审承担规划质量）、post-impl V2.1 5 轮 drop-into（spec 阶段未识别非对称语义）、console.warn 加入又移除、release build × 5 → 占 token 10%。

---

## 所有可规范化候选 Rule 列表

| # | 候选 Rule | 范围 | 来源事件 | 优先级 |
|---|---|---|---|---|
| R-1 | **Symmetric inverse operation pair must explicitly justify same-gate vs split-gate** — 任何成对的逆操作（promote/demote、attach/detach、expand/collapse）spec 必须显式列出"两者是否共享 gate"决策项，不允许隐式对称 | 项目级（先），跨项目验证后升 global | #1 | **P0**（本 session 5 轮返工根源） |
| R-2 | **A user-reported bug requires a diagnostic SubAgent before any code-level fix** — 用户负反馈触发"语义诊断 SubAgent"作为强制第一步，输出"用户在抱怨的是哪一层（spec/实现/配置/物理感）+ 抱怨与 spec 的偏差点"，再决定下一步。`feedback_research_before_bug_fix` 升级为可调用 skeleton | 全局（升级 MEMORY 反馈为 Rule） | #1 #4 | **P0** |
| R-3 | **A fix must define a user-observable success criterion before claiming completion** — 修复时必须先写"修好后用户能观察到的差异 + 不能观察到的差异（不变量）"，再去修；不允许用 console 输出 / 中间 state 作为收敛代理 | 项目级 | #1 #4 #10 | **P0** |
| R-4 | **Cross-document cascade scope MUST include doc comments + test names + commit messages + SubAgent prompts** — 现有 `cross-document-cascade-discipline.md` scope 扩到所有 binding artifact | 项目级（扩展现有 Rule） | #3 #5 #10 | **P0** |
| R-5 | **Synthesis Gate must produce both `_synthesis_decisions.md` (decisions) AND `_risk_distillation.md` (binding constraints from research)** — 规划阶段必须把研究的 risk/约束抽成 binding 清单作为 conformance anchor | 全局（强化 `~/.claude/rules/plan-as-research-design.md`） | #6 #1（promote/demote 也是未识别约束） | **P0** |
| R-6 | **Spec anti-patterns must be acknowledged in implementation deliverables** — SubAgent 完成实施时必须输出"已避免哪些 anti-pattern"清单 | 项目级 | #10 | **P1** |
| R-7 | **Spec/tech plan size discipline** — 02 ≤ 1000 行 / 03 ≤ 1500 行 / 04 ≤ 800 行（已有）。扩展 `plan-document-style.md` scope 到 spec/tech plan | 项目级（扩展现有 Rule） | #2 #9 | **P1** |
| R-8 | **paths-frontmatter Rules don't fire on file creation; SubAgents creating new files must inline the relevant Rules** — paths-based Rule 是 read-time match 不是 write-time，SubAgent prompt 必须显式 inline 该 Rule 核心约束 | 全局 | #2 | **P1** |
| R-9 | **Reviews are last-line-of-defense, not first-line; same problem in next session means planning quality regressed** — 派评审 SubAgent 前 sanity-check："这个 reviewer 找的问题，规划/调研阶段是否有可能 catch？" Yes → 问题回流为规划阶段硬约束补强 | 全局 | #6 #7 | **P1** |
| R-10 | **Dev-mode for iterative testing; release build only for ship verification** — 多轮 fix 周期一律走 `npm run tauri dev`，避免 5 分钟/轮的 release build | 项目级 MEMORY（轻量补强） | #8 | **P2** |
| R-11 | **Debug logging discipline** — 诊断日志走 `if (DEBUG_X) console.warn(...)`，不污染生产；加入和移除日志各自单独 commit | 项目级 MEMORY | #5 | **P2** |

**Promote 路径**：R-1 / R-2 / R-3 / R-5 / R-9 候选验证为跨项目 → global rules 候选。R-4 / R-7 是现有 Rule 的 scope 扩展。R-6 / R-8 / R-10 / R-11 项目级 / MEMORY 即可。

