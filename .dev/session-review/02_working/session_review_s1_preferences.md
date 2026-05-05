# Stage 1C — 用户偏好提取（Session 2 复盘）

> **范围**：本次 session（category-hierarchy 任务）。先验基线 = `01_working/session_review_s1_preferences.md`（Session 1 复盘） + 已落地 7 个 Memory 文件 + MEMORY.md 索引。
> **方法**：用户原话优先；行为推断必须标注"推断"二字；与已有 Memory 重复或被覆盖的偏好不再列入候选。
> **本次定位**：上一次复盘已写入大量 Memory，本轮重点是 **新发现 / 旧条目修订 / 推断**。

---

## 一、新增偏好（Memory 完全没有，且高置信度）

### #1 [PREF-FIX-VERIFICATION] 修复必须实质生效，不接受"看似修了实际没修"

- **用户表达（多次出现，本次最尖锐的反馈线索）**：
  - "我没有任何区别"
  - "你没有修复成功"
  - "弹回了"（多次出现，描述磁吸 demote 不松手）
- **背景**：本次磁吸 V2.1 修订过程中，主 Agent 至少有一轮派 SubAgent"修复 getProjection 算法"——SubAgent 改了算法但没改 drop 路径（`handleDragEnd` 的 isChildActive 分支与 dwell 状态机），导致用户实测**完全没有差别**。用户连续两次给出"没区别"信号后，主 Agent 才意识到上轮修复没真的命中。
- **可提炼的偏好**：用户对"提交了一次自称完成的修复 → 实测 = 0 差异"极度不满。比起"修复完成"的措辞，用户更看重**实际行为变化能否被实测看到**。
- **类别**：feedback（项目级 + 跨项目可推广，但当前证据来自单 session 单项目，先按项目级登记）
- **是否已在 Memory**：NO。已有 `feedback_research_before_bug_fix.md` 覆盖"修 bug 前先调研根因"，但**不覆盖"修复后必须验证生效"** 这个反向闭环。这是新独立维度。
- **下次 Session 没有这条会怎样**：主 Agent 派 SubAgent 修完代码就回报"已修"，不强制再亲自走读改动是否真的覆盖了用户报告的现象路径。下一次磁吸/UI 反馈类 bug，仍可能因为 SubAgent 改错位置而连续被打回 2-3 轮。
- **建议**：新建 `feedback_verify_fix_actually_applies.md`，记录"修复 SubAgent 完成后，主 Agent 必须自己 patch 路径核对"的硬要求。和 `feedback_research_before_bug_fix.md` 配对——前者是"修前调研根因"，后者是"修后核对路径"。

---

### #2 [PREF-RESOURCE-EFFICIENCY] 资源消耗（token / 时间）是显性成本，过度调研/规划是缺点不是优点

- **用户表达**：
  - "$400 / 8h 实现这么一个小功能太夸张"（针对 hierarchy 这个相对简单的功能花了 8 小时 + 大量 SubAgent 调用）
  - "调研可能是有价值且能够复用的"——区分**"复盘要让未来 session 知道哪些不该再重复"**
- **可提炼的偏好**：用户**不是**单纯希望"调研得越多越好"，而是希望**调研深度 ∝ 任务复杂度 + 复用价值**。一个二级分类拖拽功能，本可以 2-3h 落地，本次花了 8h + 数十次 SubAgent 调用，是**过度规划 + 评审 + 修订**的累积代价。
- **类别**：feedback（项目级；用户在 Ensemble 这个长期演进项目里多次表达此偏好，跨项目证据待积累）
- **是否已在 Memory**：NO（最接近的是 `project_ensemble_pragmatic_execution.md` "Path B 务实开工"，但那是"评审 9.5/10 后选 B"的局部场景；本条更宏观——**整个 V2/V3 评审循环本身就是过度的**）。
- **下次 Session 没有这条会怎样**：主 Agent 默认套用上次 sidebar-reorder 的 V1 → V2 → V3 反复评审 + 修订流程，不区分任务复杂度。下次一个相对简单的"二级分类"任务还是会跑成 8h。
- **建议**：新建 `feedback_calibrate_research_depth_to_task.md`，明确：
  - 简单任务（CRUD 字段、单一交互、参考 V3 已有不变量）→ 直接进 plan，跳过多 reviewer 评审；
  - 中等任务（涉及新交互模式但有 V3 类似先例）→ 单轮 reviewer 评审就够；
  - 复杂任务（V3 没有先例 + 多人协作 + 公开发布）→ 才走 V1/V2/V3 多轮。
- **注意**：本条和 #4 PREF-PATH-B-PRAGMATIC 是**同源不同切片**——Path B 是"评审完后开工"，本条是"评审本身要不要那么深"。两条互补不重复。

---

### #3 [PREF-USER-AS-FINAL-ORACLE] 用户实测反馈是最权威 ground truth，超过任何静态分析或 reviewer SubAgent

- **用户表达**：
  - "磁吸力太强了，需要稍微调弱一点，让它移动到正上方时就能自然地移除子类别状态"
  - "无论移动到多远的位置都不行，必须同时向右移动才能解除子类别状态。但正常来说，只要移除出它原本子类别的位置（比如移动到父类别的正上方），就应该能够正常解除"
- **背景**：本次 final_audit.md 给了 78/100 分 + 3 P0 + 6 P1 的细致清单。用户实测时**完全没提**这些 P0（DragOverlay depth prop / ContextMenu Promote / 父类删除 confirm）——他第一时间报的是磁吸"非对称"问题，而 reviewer 完全没看出来。用户的实测瞄准了**真正影响体验的体感 bug**，reviewer 命中的是 **spec 字面 deviation**。
- **可提炼的偏好**：reviewer SubAgent 的清单 ≠ 用户优先级；用户实测后给的反馈是**最高权威**。当 reviewer 报"3 P0"但用户实测说"磁吸力太强"时，**先解决用户反馈，再回头处理 reviewer 清单**。
- **类别**：user（跨项目稳定偏好——任何有用户体验的项目都成立）
- **是否已在 Memory**：部分覆盖（CLAUDE.md "全然自主性" + 用户偏好实测 dev mode 验证 §8.1）。但**没有显式记录"用户实测 > reviewer SubAgent 报告"的优先级关系**——这是新维度。
- **下次 Session 没有这条会怎样**：主 Agent 在用户给一个反馈、reviewer 同时给另一份清单时，可能优先处理 reviewer 清单（因为它更结构化），把用户反馈延后；用户体验上反而更糟。
- **建议**：新建 `feedback_user_test_outranks_reviewer.md`，明确"用户实测反馈 = ground truth；reviewer SubAgent = 候选清单；冲突时先做用户反馈"。

---

### #4 [PREF-DIRECT-BUILD-INSTALL] 期望主 Agent 直接 build + install 而非要求用户自己跑命令

- **用户表达**："可以构建并安装到我的本机"
- **可提炼的偏好**：用户实测前的 "build + install to /Applications/Ensemble.app" 工作流应该由主 Agent 自动执行，**用户不希望被打断去自己跑 `npm run tauri build`**。
- **类别**：project（Ensemble 专属——其他项目可能没有"本机安装"概念）
- **是否已在 Memory**：MEMORY.md 已有 "Build & Deploy" 章节描述命令，但**没有"主 Agent 主动执行而非提示用户去跑"** 的指令性偏好。
- **下次 Session 没有这条会怎样**：主 Agent 修完代码后，给用户提示"请你跑 npm run tauri build 验证"——用户要切窗口、等编译、再切回来反馈。比直接交付能验证的 binary 慢一倍以上。
- **建议**：在已有 MEMORY.md "Build & Deploy" 段落后追加一行：
  > "**用户偏好**：实测前由主 Agent 自动 `npm run tauri build` + 替换 `/Applications/Ensemble.app`，不要打断用户让他自己跑命令。"
  这是**对已有 Memory 的就地补强**，不需要新建文件。

---

## 二、已有 Memory 需要修订的（高优先级）

### M-1 [REVISE] `feedback_phase_review_loop.md` —— 必须改写，避免误导

- **当前内容**（标题 + 第一句）：
  > "Phase-by-phase expert review loop"
  > "每个 Phase 完成后派 1 个专家审核 SubAgent + 修复，再进下一 Phase"
- **问题**：这个文件本身在主 Agent 第一稿写错了——文件正文的第 7 行写"实施全部完成后单专家审核"，但**标题和 description 还是 "Phase-by-phase"**。这种文件级语义自相矛盾，下次主 Agent 通过索引或全文 grep 都会被误导。
- **本次实证**：本次 category-hierarchy 任务里，主 Agent 在 Phase 1 完成后就派了 phase1_audit.md + phase1_t1f_lock_audit.md 两轮（即"phase-by-phase"），用户**没明确反对**——但事后用户表达的偏好是"末端单审"。说明用户偏好和文件标题不一致，文件正文修对了一半。
- **修订方案**：
  - 改标题为 `End-of-implementation single expert review (not phase-by-phase)`
  - description 改为 `复杂任务全部 Phase 完成后才派 1 个专家审核 + 修复；不在 Phase 之间反复审核`
  - 正文的"How to apply"中加一句反例提醒："Phase 间只跑自动化 gate（test/clippy/tsc）；不要在 Phase 间派 reviewer SubAgent。"
- **优先级**：P0——这条是"语义错位的 Memory"，不修会让主 Agent 下次读到时陷入冲突。

---

### M-2 [SUPPLEMENT] `feedback_research_before_bug_fix.md` —— 加一条边界

- **当前内容**核心："主观负面感受类反馈 → 先派调研 SubAgent → 再修。"
- **本次教训**：调研 SubAgent **不能成为目的本身**。本次"磁吸太强"的反馈用户在 V2.1 修订之前就明确给出了根因（"移除原父子树位置就应该解除"），但主 Agent 仍派了一轮额外的"调研 SubAgent"，重复推导用户已说出口的洞察。
- **修订方案**：在文件末尾加一段：
  > **边界**：调研 SubAgent 是为了**找用户没说的根因**——如果用户已经在反馈里给出了根因（"应该 X 自然解除"= 完整因果），就直接进入修复设计，不必派调研 SubAgent。判定方法："用户的反馈句子里有没有 should / 应该 / 自然 + 一个具体的因果机制"——有就跳过调研。
- **优先级**：P1——避免下次重复"用户已经给答案了，主 Agent 还派调研"的浪费。

---

### M-3 [SUPPLEMENT] `project_ensemble_pragmatic_execution.md` —— 增加"过度规划"反例

- **当前内容**：Path B 务实开工 + 不补救只预防。
- **本次违反**：本次 category-hierarchy 任务整个 V1 → V2 → V3 评审循环本身就是**违反 Path B 精神**的——这是相对简单的功能（V3 已经把所有不变量定下了，hierarchy 只是叠加 parentId + 一个 dwell + 一个 chevron），用 sidebar-reorder 那种"重型评审循环"明显过度。用户没明确反对，但事后 #2 PREF-RESOURCE-EFFICIENCY 的反馈实质是对此的不满。
- **修订方案**：在 "How to apply" 的 Path B 触发条件后追加一条**反向触发条件**：
  > **当任务有强先例（V3 已落地的相似不变量）时，不应启动 V1/V2/V3 完整评审循环**。直接 plan + 单轮评审 + 实施 = 上限。本次 hierarchy 任务的教训：sidebar-reorder 已经把 dnd 无关变量全部锁死，hierarchy 只是叠加 1 维（parentId）+ 1 个新交互（drop-into），不需要再走"V1 写完派 6 reviewer + V2 写完再派 3 reviewer" 的流程。
- **优先级**：P1——和 #2 配合，避免下次同类任务重蹈覆辙。

---

## 三、推断偏好（行为 → 标准；标注"推断"，下次 session 验证后再固化）

### I-1 [INFER] 用户希望 AI 直接行动而非反复确认（用户给反馈时）

- **行为线索**：
  - 用户截图 Console output 给主 Agent，**没说"你看一下"或"你帮我分析"**——直接发图。隐含期望"你看到症状自动诊断"。
  - 用户中断后回来说"刚才意外中断了，请严格按照上面要求继续"——明确希望工作连续，不重新确认。
- **可提炼的偏好（推断）**：用户给反馈时（截图 / 描述症状 / "X 不对"），主 Agent 应直接进入诊断 + 修复流程，**不需要回一句"明白了，我去查一下"** 之类的礼貌确认。礼貌确认本身是 token 浪费 + 增加用户等待。
- **类别**：user（如成立则跨项目）；当前**仅推断**，未达"用户原话直接陈述"标准。
- **下次 Session 验证方式**：观察用户给反馈后，主 Agent 直接动手 vs 先确认，用户哪种态度更积极。
- **建议**：**先不写入 Memory**，标记为"待下次 session 验证"。

---

### I-2 [INFER] 用户在 AI 失败时希望快速承认 + 修正，不浪费 token 解释为什么之前会错

- **行为线索**：
  - 用户在主 Agent 解释 "为什么之前没改对" 时**不回应**——直接转到下一条反馈。这是"我不在乎为什么，我在乎结果"的隐含信号。
  - 用户从未反过来追问"为什么会写错"——他只关心"现在好了吗"。
- **可提炼的偏好（推断）**：失败后主 Agent 应该**承认 + 修正**，不要展开"复盘式解释"。失败后续解释 ≈ 浪费 token。
- **类别**：user（如成立则跨项目）；推断。
- **下次 Session 验证方式**：观察用户对"我之前理解错了，因为 X" vs "好的，我现在改" 哪种回应更直接。
- **建议**：**先不写入 Memory**，标记为"待下次 session 验证"。

---

### I-3 [INFER] 用户作为"观察 + 高层描述"角色，不希望被要求做底层调试

- **行为线索**：
  - 用户实测时直接报"弹回了" / "没区别" / "磁吸力太强"，从未给 Console error / 堆栈 trace / 详细操作步骤。
  - 用户截图 Console 的输出**给主 Agent 让主 Agent 自己看**，而不是自己分析后总结。
- **可提炼的偏好（推断）**：用户的角色定位是"产品体验的观察者 + 反馈给出者"，**调试和诊断是主 Agent 的工作**。不应该期望用户给出 reproduction step 或操作日志。
- **类别**：project（Ensemble 这种 UX-heavy 桌面项目）+ user（跨项目都成立）；推断。
- **下次 Session 验证方式**：直接询问 vs 让主 Agent 自己推导。
- **建议**：**先不写入 Memory**，标记为"待下次 session 验证"。

---

## 四、元偏好（与 AI 交互层）

### M-1 [META] 失败时承认 + 修正 + 不解释为什么前次会错（与 I-2 同源）

参见 I-2，推断状态。

### M-2 [META] 不确定时希望明确说"我不确定"，不装懂

- **行为线索**（推断）：用户从未抱怨主 Agent 说"我不确定"——但本次有几次主 Agent 在 reviewer 给出复杂分歧时直接判断（如 V2 patch_plan 的整合），用户也接受。两种行为用户都接受，**关键判定**是判断本身合理。
- **可提炼的偏好（推断）**：在主 Agent **真的不确定**时，明说优于装懂；但在主 Agent **能合理判断**时，直接判断也接受。换言之：**真实是边界，不是态度问题**。
- **类别**：user 推断。
- **建议**：**不写入 Memory**——这条与 CLAUDE.md "全然自主性 + 责任在你" 已隐含同义；不需要再加一条。

---

## 五、已有 Memory 与本次发现的关系总览

| 已有 Memory | 本次状态 | 处置 |
|---|---|---|
| `feedback_no_pr_for_personal_changes.md` | 本次未触发 | 保持 |
| `feedback_research_before_bug_fix.md` | 仍有效，但需加边界 | M-2 修订 |
| `feedback_decision_with_recommendation.md` | 本次未触发（无大决策点） | 保持 |
| `feedback_phase_review_loop.md` | 标题与正文语义错位 | M-1 改写（P0） |
| `feedback_ensemble_commit_quality.md` | 仍有效；commit 质量本次还行 | 保持 |
| `project_ensemble_design_standard.md` | 本次"磁吸太强"事件再次印证；保持 | 保持 |
| `project_ensemble_pragmatic_execution.md` | 本次过度规划事件违反精神；需加反例 | M-3 修订 |

---

## 六、Memory 候选清单（汇总）

### 新建（高置信度，立即可写）

| 候选 filename | type | 一句描述 |
|---|---|---|
| `feedback_verify_fix_actually_applies.md` | feedback | 修复 SubAgent 完成后，主 Agent 必须自己 patch 路径核对真的命中用户报告的现象，不接受"已修"措辞作为完成证据 |
| `feedback_calibrate_research_depth_to_task.md` | feedback | 调研深度按任务复杂度 + 复用价值校准；有强 V3 先例的任务**不应**走多 reviewer 评审循环 |
| `feedback_user_test_outranks_reviewer.md` | feedback | 用户实测反馈 = ground truth；reviewer SubAgent 报告 = 候选清单；冲突时先做用户反馈 |

### 修订（高优先级，必须做）

| 文件 | 优先级 | 修订动作 |
|---|---|---|
| `feedback_phase_review_loop.md` | P0 | 标题 + description 改写为"末端单审"；正文加反例 |
| `feedback_research_before_bug_fix.md` | P1 | 末尾加"用户已给根因 → 跳过调研"边界 |
| `project_ensemble_pragmatic_execution.md` | P1 | 加反例："强先例任务不应走完整评审循环" |

### 就地补强（已有 Memory 内追加）

| 文件 | 追加内容 |
|---|---|
| `MEMORY.md` "Build & Deploy" 段落 | 一行用户偏好："实测前由主 Agent 自动 build + install，不打断用户跑命令" |

### 推断偏好（暂不写入，标记"待下次 session 验证"）

| 推断内容 | 验证方式 |
|---|---|
| I-1：用户给反馈时 AI 直接行动 vs 先确认 | 观察反馈触达后主 Agent 反应 |
| I-2：失败时承认 + 修正不解释 | 观察用户对"为什么会错"的反应 |
| I-3：用户作为高层观察者，不做底层调试 | 直接询问 vs 推导 |

---

## 七、关于上升为 Global Rule 的判断

**结论：本次发现的 4 条新偏好都不达 Global Rule 标准。**

逐条核对 `persistence-system.md` 三条件：

- **#1 PREF-FIX-VERIFICATION**：单 session 单项目证据；项目无关（任何项目都成立）；跨领域（也适用学术写作 / 文档修订）。**满足 2/3**——多项目证据不足，先按项目级登记，下次别的项目再现一次后再升 Global。
- **#2 PREF-RESOURCE-EFFICIENCY**：单 session；和 Ensemble 单人特性强相关。先按项目级登记，待跨项目证据。
- **#3 PREF-USER-AS-FINAL-ORACLE**：单 session；项目无关；跨领域。**最接近 Global 标准**，但仍仅一例证据，先按项目级登记。
- **#4 PREF-DIRECT-BUILD-INSTALL**：Ensemble 专属（涉及 .app 安装路径）；不可外推。

**全部按项目级 Memory 写入。**

---

## 八、本轮"看起来像偏好但其实不是"陷阱

> 这一节是任务规范明示要求的——区分**真偏好**和**误判为偏好**。

### 陷阱 #1：用户允许 V2.1 修订 ≠ 用户希望每次都做这种修订循环

本次磁吸 V2 落地后用户给反馈、主 Agent 加 V2.1 修订——用户接受了这个流程。但这**不**意味着用户希望未来每个 UI 反馈都要走"V2 → V2.1 → V2.2 →" 的版本号修订。下次类似反馈，主 Agent 应**直接改代码 + 测试**，不要主动建一份 V2.1 文档。

### 陷阱 #2：用户写 `_synthesis_decisions.md` Decisional 文档 ≠ 用户希望每个任务都建这种结构

本次 category-hierarchy 是从上次 sidebar-reorder 复用了 `_synthesis_decisions / 02_design_spec / 03_tech_plan / 04_implementation_plan` 四件套。这是**因为任务复杂 + 有协作 SubAgent**才需要——简单任务就一份 plan + 实施即可。下次不要为简单任务套这套结构。

### 陷阱 #3：用户没明确反对"phase-by-phase 评审" ≠ 用户认可这种模式

本次 phase1_audit + phase1_t1f_lock_audit 跑了，用户没反对。但事后从用户的资源效率反馈倒推，这种 phase-by-phase 评审属于**用户容忍但非偏好**的范畴。`feedback_phase_review_loop.md` 的修订方向是对的（末端单审），不要把"用户没反对"当成"用户认可"。

---

## 九、总结报告（给主 Agent）

- **新增偏好（高置信度）**：**3** 条 → 3 个新 Memory 文件
- **新增偏好（推断）**：**3** 条 → 暂不写入，待下次 session 验证
- **已有 Memory 待修订**：**3** 条
  - P0：`feedback_phase_review_loop.md` 标题与正文语义错位（必须修）
  - P1：`feedback_research_before_bug_fix.md` 加边界（用户已给根因则跳过调研）
  - P1：`project_ensemble_pragmatic_execution.md` 加反例（强先例任务不走完整评审）
- **已有 Memory 就地补强**：**1** 条（MEMORY.md "Build & Deploy" 加一行）
- **达 Global Rule 标准**：**0** 条——全部按项目级登记
- **"看起来像偏好但不是"陷阱**：**3** 个识别并标注

**关键行动建议**：
1. 立即修订 `feedback_phase_review_loop.md`（P0 语义错位）
2. 写入 3 个新 Memory 文件
3. 给 `feedback_research_before_bug_fix.md` + `project_ensemble_pragmatic_execution.md` + `MEMORY.md` 加边界/反例/补强
4. 推断偏好（I-1/I-2/I-3）建议只在专属"待验证"区域记录，不进 Memory 主线
