# Stage 2E — Memory 候选提取（Session 2 / Category Hierarchy）

> **输入**：
> - Stage 1A `session_review_s1_rework.md`（10 返工事件 + 4 共性根因）
> - Stage 1B `session_review_s1_methodology.md`（6 模式 + 编排 ROI 评估）
> - Stage 1C `session_review_s1_preferences.md`（3 新增偏好 + 3 修订建议 + 3 推断）
> - 现有 8 个 Memory 文件（含 MEMORY.md 索引）+ 上次 Session 1 模板
>
> **任务**：基于 Stage 1 全部产出 + 现有 Memory + persistence-system.md，决定哪些可写入 Memory（新建 / 更新 / 就地补强 / 拒绝）。
>
> **严格性**：每条做"门槛核验"——不能从代码推导 / 不与现有重复 / 类型选择正确 / 不是事件流水。
>
> **核心原则**：Memory 索引前 200 行 session 启动时全量加载，**新条目要真有跨 session 复用价值**，不是"我做过这个任务"的纪念。
>
> **header 总览**：候选总数 14 → 新建 4 / 修订 3 / 就地补强 2（含 MEMORY.md 索引）/ 拒绝 5。

---

## 一、新建候选（按优先级）

### 新建 #1 — `feedback_verify_fix_actually_applies.md` （**P0**）

- **来源**：Stage 1C #1（PREF-FIX-VERIFICATION）+ Stage 1A #1 / #4 / #10（共性根因 #4 "用代理指标代替终态判定"）
- **决策**：新建（feedback 类，项目级）
- **完整 frontmatter + Body 草稿**：

```markdown
---
name: Verify a fix actually changes user-observable behavior, not just compiles or self-reports done
description: After a fix SubAgent claims completion, the main Agent must walk the actual code path the user reported a problem in, not trust "done" or console traces or test green
type: feedback
originSessionId: <本次 session id>
---

修复 SubAgent 完成后，主 Agent 必须**亲自 patch 路径核对**——确认改动真的覆盖了用户报告的现象路径，而不是接受"已修"措辞、console 输出对了、自动化测试绿了作为完成证据。

**Why**: 本次 category-hierarchy 中至少 5 轮"拖入子类 bug"修复，每轮 SubAgent 改了某处代码 + 自报"已修"——但用户实测连续两次报"我没有任何区别 / 你没有修复成功"。根因是：第 1 轮改了 `getProjection` 算法，但漏改 `handleDragEnd` 的 isChildActive 分支与 dwell 状态机；第 2 轮修了 V3 reorder guard 但 indicator/drop 路径仍不一致；第 3 轮加了 5 重 indicator gate 但 promote/demote 仍对称。每一轮主 Agent 都用"console.warn 输出对了 + 自动化测试绿"作为收敛代理——但 console 输出展示的是中间态，不是用户视角的终态。jsdom 测试也跳过 PointerEvent 驱动，绿不代表 drop 行为对。

**How to apply**:
- **修复前先写"用户可观察成功标准"**：例如"拖 A 到 B 下方然后松手 → A 现在是 B 的子类（数据层 + 视觉层都验证）"。没列就不准 push build。
- **SubAgent 完成后亲自 grep 改动覆盖范围**：用户报告的现象路径有几个分支？SubAgent 改了哪些？还有哪些没改？用 `rg` 实证，不要听 SubAgent 自评。
- **不接受"已修"措辞作为完成证据**——只接受"在这个用户场景下，修改前 X 表现，修改后 Y 表现"的差异描述 + 主 Agent 自己的路径核对。
- 与 `feedback_research_before_bug_fix.md` 配对：前者是"修前调研根因"，本条是"修后核对路径"——两端闭环。
- 与 Global Rules.md "Investigate Before Answering" 互补：那条覆盖回答场景，本条覆盖 fix 完成判定。
```

- **门槛核验**：
  - 不能从代码推导：YES — 是工作流偏好 + 验证纪律。
  - 不与现有重复：YES — `feedback_research_before_bug_fix.md` 只覆盖"修前"，无"修后"。
  - 类型选择正确：YES — feedback 类（用户在本次 Session 多次直接表达："我没有任何区别 / 你没有修复成功"）。
- **不做 Global**：单 session 单项目证据；满足项目无关 + 跨领域 2/3 条件，但 multi-project 证据不足，先按项目级，下次别的项目再现一次再升 Global。

---

### 新建 #2 — `feedback_calibrate_research_depth_to_task.md` （**P0**）

- **来源**：Stage 1C #2（PREF-RESOURCE-EFFICIENCY）+ Stage 1B 全章节（核心元教训"方法用在了不需要的任务上"）+ Stage 1A #6 #7 #9
- **决策**：新建（feedback 类，项目级）
- **完整 frontmatter + Body 草稿**：

```markdown
---
name: Calibrate planning depth to task complexity — don't reuse heavy research / multi-reviewer cycles for tasks with strong precedents
description: Heavy V1/V2/V3 review cycle from research-grade tasks (e.g. sidebar-reorder) must NOT be auto-applied to extension tasks (e.g. category-hierarchy) where strong precedents already lock invariants
type: feedback
originSessionId: <本次 session id>
---

任务规划深度必须 **∝ 任务的"创造性 / 不可逆性 / 跨 session 复用价值"**——不是按统一最高规格做。机械复用上次成功的"6 步范式 + 多轮评审"到结构性扩展任务，会产生过度工程的可观成本。

**Why**: 用户原话："$400 / 8h 实现一个小功能太夸张"。本次 category-hierarchy 是相对简单的功能（V3 sidebar-reorder 已把所有不变量定下，hierarchy 只是叠加 parentId + 一个 dwell + 一个 chevron），却套用了 sidebar-reorder 的研究型任务流程：21,179 行规划/调研/评审文档、≥18 SubAgent 投递、6 reviewer V1 + alignment + Phase 1 audit + T1f audit + final audit。本质是**误把"V1→V2→V3 多轮评审"理解为"任意复杂任务的标准范式"**——而它实际只对**首次建立动效物理感**这种创造性任务才值得。

**How to apply** — 派发 SubAgent 前先评估任务档次：

| 任务类型 | 例子 | 推荐规划深度 |
|---|---|---|
| **创造性 + 高不可逆 + 高复用** | sidebar-reorder（首次定义动效物理感 + 未来所有 drag UI 复用） | 6 步范式 + 多 reviewer + design-language Rule |
| **结构性 + 中不可逆 + 中复用** | category-hierarchy（数据模型扩展 + dnd 树形是 known pattern） | **3-4 步范式 + 1 综合 reviewer**（本次过度规划 → 8h 应该是 4-5h） |
| **维护性 + 低不可逆 + 低复用** | 改 dropdown 选项 / 加 button | 直接做（按 Constitution §一.4 豁免） |

判断标准：
- **有强先例**（V3 已锁不变量、library 已有 official pattern、9 处 dropdown 已统一规范）→ 跳过 V1/V2/V3 多轮评审，直接 plan + 单轮综合 reviewer + 实施。
- **首次建立 X**（动效物理感、设计语言、新交互 paradigm）→ 才走完整 6 步范式。
- **简单 maintenance / single-dimension change** → 直接做，不立项。

与 `project_ensemble_pragmatic_execution.md` 互补：Path B 是"评审完后开工"，本条是"评审本身要不要那么深"。
```

- **门槛核验**：
  - 不能从代码推导：YES — 是元工作流策略。
  - 不与现有重复：YES — `feedback_phase_review_loop.md` 是"末端单审 vs phase-by-phase"维度；本条是"评审深度本身"维度。
  - 类型选择正确：YES — feedback 类（用户在本次 Session 直接对成本表达不满）。
- **不做 Global**：本次单 session 证据 + 与 Ensemble 单人项目特性强相关；按项目级登记，跨项目证据再升级。
- **Cross-link**：可在 `~/.claude/rules/plan-as-research-design.md` 加引用；但 Rule 升级不在本 Stage 范围。

---

### 新建 #3 — `feedback_user_test_outranks_reviewer.md` （**P0**）

- **来源**：Stage 1C #3（PREF-USER-AS-FINAL-ORACLE）+ Stage 1A #1（用户实测优先于 reviewer 清单）
- **决策**：新建（feedback 类，项目级）
- **完整 frontmatter + Body 草稿**：

```markdown
---
name: User real-world testing outranks reviewer SubAgent reports — prioritize user feedback over reviewer checklists when conflicts surface
description: When reviewer SubAgent gives a structured P0 list and user reports a different gut-feel issue, work on the user's feedback first; reviewer findings become candidate backlog
type: feedback
originSessionId: <本次 session id>
---

用户实测反馈是最权威 ground truth，**超过任何静态分析、reviewer SubAgent 清单、或 spec 字面 deviation**。当 reviewer 报"3 P0 + 6 P1"但用户实测说"磁吸力太强"时，**先解决用户反馈，再回头处理 reviewer 清单**。

**Why**: 本次 category-hierarchy final_audit 给了 78/100 + 3 P0 + 6 P1 的细致清单（DragOverlay depth prop 违反不变量 / ContextMenu Promote-to-root 缺失 / 父类删除 confirm 缺失）。用户实测时**完全没提**这些 P0——他第一时间报的是磁吸"非对称 promote/demote"问题，而 reviewer 完全没看出来。**用户的实测瞄准了真正影响体验的体感 bug，reviewer 命中的是 spec 字面 deviation**。两者优先级显著不同。

**How to apply**:
- **冲突时优先用户反馈**：用户实测反馈出现后，主 Agent 第一动作是处理用户反馈；reviewer 清单的剩余项纳入 backlog 顺序处理。
- **不混合调度**：不要把"reviewer P0-1"和"用户磁吸反馈"放在同一组 SubAgent 里同时修——容易让 SubAgent 误以为两者同等优先，结果用户的体感 bug 被淹没在 spec deviation 修复中。
- **理由**：reviewer SubAgent 的判定依据是 spec 字面，spec 字面**不一定是用户实际体验的瓶颈**。用户实测的反馈才能验证 spec 是否真的覆盖了所有用户视角的问题。
- **不矛盾点**：reviewer SubAgent 仍有价值——它是 last line of defense，能 catch 用户没注意到的字面 deviation。但**没用户反馈优先级高**。
- 与 `feedback_research_before_bug_fix.md` + `feedback_verify_fix_actually_applies.md` 三角配合：用户反馈 = 起点 + 终点，调研 + 修复 + 核对夹在中间。
```

- **门槛核验**：
  - 不能从代码推导：YES — 是优先级决策准则。
  - 不与现有重复：YES — 已有 Memory 无"reviewer 与用户反馈优先级"维度。
  - 类型选择正确：YES — feedback 类（用户在本次 Session 间接通过"先反馈磁吸而非 reviewer 列表"表达）。
- **不做 Global**：满足项目无关 + 跨领域 2/3 条件，但 multi-project 证据不足。这条**最接近 Global 标准**（任何有用户体验的项目都成立），但严格按 persistence-system 默认项目级，下次别的项目再现一次后再 promote。

---

### 新建 #4 — `reference_design_documentation_locations.md` （**P1**）

- **来源**：用户原话明确要求："你需要把它（设计参考文档）沉淀下来并写入 memory，让后续的 session 受益，让系统知道有这份文档存在"
- **决策**：新建（reference 类，项目级）
- **完整 frontmatter + Body 草稿**：

```markdown
---
name: Ensemble design documentation locations — design-language Rule + design specs index
description: Pointer index for the highest-authority design documents in this project so future sessions know where Ensemble's design language lives
type: reference
originSessionId: <本次 session id>
---

Ensemble 项目的设计权威文档分布在多个位置；本条目作为索引，确保未来 session 能快速找到 ground truth 而不重复造轮子。

**Why**: 本次 Session 之前的多个 session 反复重申"考究、精致、克制、Apple/Linear 级"等设计标准，每次都靠口头默契。本次 Session 把这些蒸馏成项目级 Rule（design-language.md），它会在每个 session 启动时自动加载——但同时也有大量 .dev/ 下的高分辨率 spec 文档（V3 sidebar-reorder 等），它们不自动加载，需要按需读取。用户明确要求"让系统知道有这份文档存在"。

**Authority ranking**（高 → 低）:

| 位置 | 内容 | 加载方式 | 何时读 |
|---|---|---|---|
| `.claude/rules/design-language.md` | 项目级 Decisional：哲学 / 原则 / 约束 / token 表 / anti-patterns / 必读清单 | **每 session 自动加载** | 所有视觉/动效任务 |
| `.dev/sidebar-reorder/02_design_spec.md` (V3) | 最丰富的 design 实例，drag/磁吸/lift/settle 物理级动效完整论据 | 按需读 | 设计任何拖拽 / 物理级动效时 |
| `.dev/sidebar-reorder/06_snap_research.md` | 磁吸物理算法（连续引力 vs binary）的研究与决策依据 | 按需读 | 设计磁吸 / 连续力反馈类交互时 |
| `.dev/category-hierarchy/02_design_spec.md` (V2.1) | 树形 / 缩进 / chevron / drop indicator 完整规格 + V3 不变量 23 项的 cross-reference | 按需读 | 设计层级 / 树形 UI 时 |
| `.dev/category-hierarchy/_synthesis_decisions.md` | 14 决策的最终汇总 + 置信度 + cascade 表 | 按需读 | 任何与 hierarchy 相关的 decision 重读时 |
| `.dev/session-review/01_working/` 与 `02_working/` | session 复盘文档（返工溯源 / 方法论提取 / 偏好提取 / Memory 候选 / Rule 候选） | 按需读 | 跨 session 复盘 / 元工作流改进时 |
| `src/index.css` | token 单一来源（color / easing / duration / radius / shadow / spacing） | 按需读 | 任何使用 token 的视觉代码时 |

**How to apply**:
- 设计/视觉任务起手第一动作：检查 `.claude/rules/design-language.md` 已加载（默认会）。如未加载，主动读取。
- 涉及拖拽 / 物理级动效：必读 V3 sidebar-reorder 02 spec（不仅引用）。
- 涉及 token 选择：从 `src/index.css :root` 取，禁止局部魔数。
- 索引本身**不是 spec 替代品**——是路径指引；具体 spec 内容必须读原文，不能只看本索引摘要。
- 与 `~/.claude/rules/document-authority-ranking.md`（global Rule）互补：authority 排序在本表中已具体化。
```

- **门槛核验**：
  - 不能从代码推导：YES — 是文档导航元信息。
  - 不与现有重复：YES — MEMORY.md 完全没有 design 文档导航条目。
  - 类型选择正确：YES — reference 类（信息索引，非偏好 / 项目状态 / 学习教训）。
- **不做 Global**：纯 Ensemble 项目特性（路径全部是 .dev/ 内）。
- **特别说明**：用户**明确要求**沉淀这份内容，是必须创建的项；其他候选都是基于推断/分析，本条是直接用户指令。

---

## 二、修订候选（按优先级，P0 先）

### 修订 #1 — `feedback_phase_review_loop.md` （**P0**：标题与正文矛盾必须修）

- **来源**：Stage 1C M-1（已知问题）+ Stage 1B #2.3（"phase-by-phase 反复审核 → 用户改为整体完成后再审核"）
- **决策**：修订（标题 + description + 内容部分修订；保留 originSessionId 与 type）
- **当前内容问题**：上次 Session 1 复盘时这个文件**自我误植**——标题是 "Phase-by-phase expert review loop"，description 是"每个 Phase 完成后派 1 个专家审核 SubAgent + 修复，再进下一 Phase"，但**正文第 7 行起的 "Why" 段已经是"末端单审"** 的叙述。这种文件级语义自相矛盾，下次主 Agent 通过索引会被 description 误导，读到正文又会困惑。

#### 旧措辞（关键段落）

```markdown
---
name: Phase-by-phase expert review loop
description: 每个 Phase 完成后派 1 个专家审核 SubAgent，修复后再进下一 Phase；不要在 Phase 之间无审核连跑
type: feedback
originSessionId: 5f7f5775-fbb0-4b51-acff-192835f124f2
---
# 实施全部完成后单专家审核 + 单次修复（不是每 Phase）

复杂任务的实施阶段（Phase 1 至最后一个 Phase 全部完成 + 自动化 gate 全绿）完成后，**派 1 个专家审核 SubAgent + 做 1 次修复**。**不要在 Phase 之间反复审核**。
```

#### 新措辞

```markdown
---
name: End-of-implementation single expert review (not phase-by-phase)
description: 复杂任务全部 Phase 完成后才派 1 个专家审核 + 修复；Phase 间只跑自动化 gate（test/clippy/tsc），不重复派 reviewer SubAgent
type: feedback
originSessionId: 5f7f5775-fbb0-4b51-acff-192835f124f2
---

复杂任务的实施阶段（Phase 1 至最后一个 Phase 全部完成 + 自动化 gate 全绿）**整体**完成后，派 1 个专家综合审核 SubAgent + 做 1 次修复。**不要在 Phase 之间反复派 reviewer SubAgent**——那只是把同样的检查工作分散成多次，并不增加质量。

**Why**: 用户偏好"信任执行 + 末端验证"——每 Phase 都审核会拖慢进度且重复劳动；末端审核能看到全局协作的最终结果（跨 SubAgent 接口对齐、整体测试覆盖、spec 偏离的累积影响）。本次 category-hierarchy 在 Phase 1 完成后派了 phase1_audit + phase1_t1f_lock_audit 两轮（即"phase-by-phase"），用户没明确反对——但事后从用户的资源效率反馈反推（"$400 / 8h 太夸张"），phase 间 reviewer 是过度的。Phase 1 因为是数据安全 + 跨 phase 接口可以例外（错了会全盘崩溃），但 Phase 2-4 之间不再额外 audit。

**How to apply**:
- Phase 间只跑自动化 gate：`npx tsc` + `npm test` + `cargo test` + `cargo clippy --all-targets -- -D warnings`；这些是机器可验证的硬约束。
- 全部 Phase 完成后派 1 个 Opus blocking 综合 reviewer SubAgent，审：(a) 全部新增/修改文件；(b) 跨 SubAgent spec 偏离；(c) 整体回归。
- 主 Agent 一次性修复发现的 P0/P1（重要 P1 顺手 + 不重要 P1 进 backlog）。
- **反例提醒**：Phase 1 中间不要派 reviewer SubAgent，除非 Phase 是"数据安全 + 跨 phase 接口"这种错了全盘崩溃的关键节点（本次 Phase 1 数据库迁移 + 锁是这种特例）。

**与其他 Memory 的关系**：
- 与 `feedback_calibrate_research_depth_to_task.md` 配对：本条说"评审何时做"，那条说"评审做多深"。
- 与 `~/.claude/rules/plan-as-research-design.md` 互补：那条是规划-time 的研究设计，本条是实施-time 的评审策略。
```

- **修订理由**：
  1. 标题/description 与正文统一为"末端单审"——消除语义矛盾。
  2. 加反例（Phase 1 数据安全 + 跨 phase 接口可例外）——本次 Phase 1 audit 实际有价值，不应被 Rule 一刀切。
  3. 加自动化 gate 具体命令——让"Phase 间只跑 gate"可执行。
  4. 与新增 Memory 的 cross-link——下次主 Agent 读到本条时能链接到 calibration Memory。
- **门槛核验**：
  - 不能从代码推导：YES。
  - 不与现有重复：YES。
  - 类型选择正确：YES（feedback 类不变）。
- **保留 origin session id**：YES（Session 1 留下的偏好，Session 2 只是矫正措辞）。

---

### 修订 #2 — `feedback_research_before_bug_fix.md` （**P1**：加边界）

- **来源**：Stage 1C M-2（用户已给根因 → 跳过调研）
- **决策**：修订（在文件末尾追加一段"边界"）
- **当前内容**：核心"主观负面感受类反馈 → 先派调研 SubAgent → 再修"。
- **本次教训**：调研 SubAgent **不能成为目的本身**。本次"磁吸太强"反馈用户在 V2.1 修订之前就明确给出了根因（"移除原父子树位置就应该解除"），但主 Agent 仍派了一轮"调研 SubAgent"，重复推导用户已说出口的洞察。

#### 旧措辞（追加位置：文件末尾，紧跟最后一个 bullet）

无新文件 frontmatter 修改。原文件最后一行：
```
- 与 `~/.claude/rules/Global Rules.md` "Investigate Before Answering" 互补：那条覆盖回答问题，本条覆盖修代码——bug fix 的诱惑是"我看到代码就知道怎么改"，但根因经常不在主 Agent 的第一直觉里
```

#### 新措辞（追加段落）

```markdown
**边界（用户已给根因时跳过调研）**:
- 调研 SubAgent 是为了**找用户没说的根因**——如果用户已经在反馈里给出了根因（"应该 X 自然解除"= 完整因果），就直接进入修复设计，不必派调研 SubAgent。
- **判定方法**：用户的反馈句子里有没有 "should / 应该 / 自然 + 一个具体的因果机制"——有就跳过调研。例如本次 category-hierarchy 用户原话："只要移除出它原本子类别的位置（比如移动到父类别的正上方），就应该能够正常解除"——这是用户已经把心智模型说清楚了，再派 SubAgent "调研非对称 promote/demote 语义"是浪费。
- **判定为有根因 → 直接修**：进入修复设计 + 一次到位实施 + `feedback_verify_fix_actually_applies.md` 验证流程。
- **判定为无根因（仅描述症状如"卡 / 不流畅 / 没区别"）→ 派调研**：保持原 Rule。
```

- **修订理由**：避免 over-application；调研 SubAgent 在用户已给根因时是冗余的。
- **门槛核验**：YES（与 Stage 1C M-2 完全对齐；不冲突现有内容）。

---

### 修订 #3 — `project_ensemble_pragmatic_execution.md` （**P1**：加反例）

- **来源**：Stage 1C M-3（强先例任务不应启动 V1/V2/V3 完整评审循环）+ Stage 1B § 7（理想中间路径）
- **决策**：修订（在 "How to apply" 段后追加反向触发条件）
- **当前内容**：Path B 务实开工 + 数据丢失专注预防不补救。
- **本次违反**：本次 category-hierarchy 任务整个 V1 → V2 → V3 评审循环本身就是**违反 Path B 精神**——这是相对简单的功能（V3 已经把所有不变量定下了），用 sidebar-reorder 那种"重型评审循环"明显过度。

#### 旧措辞（追加位置：原 "How to apply" 段最后一个 bullet 之后）

原文件最后一个 bullet：
```
- **关键边界**：这条偏好**只适用于 Ensemble**（单人 + 小数据量）。**不可外推到团队/客户/生产数据库项目**——团队项目里 Path B 留 P1 给下游 SubAgent，会因 SubAgent 没有同等上下文而误解；生产数据库丢失，恢复优先级远高于"修预防"
```

#### 新措辞（追加段落）

```markdown
**反向触发条件（强先例任务不应启动重型评审循环）**:
- 当任务有强先例（V3 已落地的相似不变量、library 已有 official pattern、9 处 dropdown 已统一规范）时，**不应启动 V1/V2/V3 完整评审循环**。直接 plan + 单轮综合 reviewer + 实施 = 上限。
- **本次反例**：category-hierarchy 套用 sidebar-reorder 的"V1 写完派 6 reviewer + V2 写完派 3 reviewer" 流程——但 sidebar-reorder 已经把 dnd 无关变量全部锁死，hierarchy 只是叠加 1 维（parentId）+ 1 个新交互（drop-into），明显过度。
- **判定方法**：调研报告是否大量引用现有不变量 / 现有 library example？是 → 强先例 → 跳过 V1/V2/V3 多轮。否 → 创造性任务 → 走完整流程。
- 与 `feedback_calibrate_research_depth_to_task.md` 协同：本条说"何时跳过完整评审循环"，那条说"任务规划深度三档分类"。
```

- **修订理由**：避免下次同类任务重蹈覆辙；明确"Path B 触发条件"之外的"反向触发条件"。
- **门槛核验**：YES（与 Stage 1C M-3 完全对齐；不冲突现有 Path B 触发条件）。

---

## 三、就地补强（追加到现有文件，不新建）

### 就地补强 #1 — `MEMORY.md` "Build & Deploy" 段落（追加一行）

- **来源**：Stage 1C #4（PREF-DIRECT-BUILD-INSTALL）+ Stage 1A #8（"用 release build 而非 dev mode 实测"反思）
- **决策**：就地追加（不新建文件）
- **追加位置**：现有 `MEMORY.md` "## Build & Deploy" 段最后一 bullet（"若怀疑 Rust 缓存..."）之后，加新 bullet：

```markdown
- **用户偏好（实测期间）**：实测前由主 Agent 主动 `npm run tauri build` + 替换 `/Applications/Ensemble.app`，**不打断用户**让他自己跑命令。同时**多轮 fix 周期一律走 dev mode** (`npm run tauri dev`)——release build 仅 ship 前最终验证用，每轮 5 分钟全编 + reinstall 是工具选择错误。
```

- **修订理由**：合并 Stage 1C #4（用户偏好）+ Stage 1A #8（dev mode 工具选择教训），统一进 "Build & Deploy" 段。
- **门槛核验**：
  - 不能从代码推导：YES — 是工作流偏好。
  - 不与现有重复：现有 "Build & Deploy" 段只描述命令，无"主动执行 + dev mode 优先"指令。
  - 类型选择正确：YES（MEMORY.md 主索引段，非独立 topic 文件）。

---

### 就地补强 #2 — `MEMORY.md` "Topic memories" 段重组 + 索引更新

- **来源**：所有新建 / 修订 / reference Memory 都需要在索引中可见
- **决策**：就地修订（替换现有 "Topic memories" 段全部内容）

#### 拟改动结果（替换现有第 39-51 行）

```markdown
## Topic memories

### Project state & quality bar
- [Ensemble commit quality bar](feedback_ensemble_commit_quality.md) — open-source 升格后 commit/push 必须清晰精细，不再用草草一行
- [Ensemble design standard](project_ensemble_design_standard.md) — Apple/Linear/Things 级；考究/精致/细节/克制/物理级动效是评估锚点
- [Pragmatic execution & no-recovery](project_ensemble_pragmatic_execution.md) — Ensemble 单人项目允许 Path B 务实开工 + 数据丢失专注预防不补救

### Workflow feedback
- [No PR for personal changes](feedback_no_pr_for_personal_changes.md) — Ensemble is single-developer; commit straight to main, skip PR ceremony
- [Research before bug fix](feedback_research_before_bug_fix.md) — 主观反馈类 bug 必须先派调研 SubAgent 找根因，不直接 patch（用户已给根因时跳过）
- [Verify fix actually applies](feedback_verify_fix_actually_applies.md) — 修复完成后主 Agent 必须亲自核对路径，不接受"已修"措辞 / console 输出 / 测试绿
- [Decision with recommendation](feedback_decision_with_recommendation.md) — 决策请示要带选项+倾向+理由，不要单纯把球踢回
- [End-of-implementation single review](feedback_phase_review_loop.md) — 整体完成后单专家审核 + 修复；Phase 间只跑自动化 gate
- [Calibrate research depth to task](feedback_calibrate_research_depth_to_task.md) — 任务规划深度按"创造性 / 不可逆性 / 复用价值"三档分类，强先例任务不走重型评审
- [User test outranks reviewer](feedback_user_test_outranks_reviewer.md) — 用户实测反馈 = ground truth；冲突时先做用户反馈，reviewer 清单进 backlog

### Reference / index
- [Design documentation locations](reference_design_documentation_locations.md) — design-language Rule + spec 路径索引（让未来 session 知道高分辨率设计文档在哪）

- [Plan document style](../../../../rules/plan-document-style.md) — Plan 是方向/范围/注意点，不是代码级脚本（≤ 800 行）
```

- **修订理由**：
  1. 新建 4 条 + 修订 1 条（feedback_phase_review_loop 改名）→ 索引必须同步。
  2. 加 "Reference / index" 子段——design 文档导航与 workflow feedback / project state 是不同维度。
  3. 保留原有 "Plan document style" Rule 链接（在 `~/.claude/rules/`）。

---

## 四、MEMORY.md 索引更新清单（汇总）

### 新增/修改的索引行

| 操作 | 段落 | 内容 |
|---|---|---|
| 修改 | Project state & quality bar 段 | 保持现有 3 条（不变） |
| 替换 | Workflow feedback 段 | feedback_phase_review_loop 行的 description 改为"整体完成后单专家审核 + 修复；Phase 间只跑自动化 gate" |
| 新增 | Workflow feedback 段 | + feedback_verify_fix_actually_applies / feedback_calibrate_research_depth_to_task / feedback_user_test_outranks_reviewer |
| 新增子段 | Reference / index | + reference_design_documentation_locations |
| 修改 | Build & Deploy 段 | 追加"用户偏好（实测期间）"bullet（dev mode + 主动 build/install） |

### 索引段落预览（最终）

整合后 MEMORY.md 总行数预估 **~62-68 行**（仍远低于 200 行硬上限，安全）。

---

## 五、拒绝候选（每条标注理由）

### 拒绝 #1 — Stage 1C 推断 I-1 / I-2 / I-3（用户给反馈时 AI 直接行动 / 失败时不解释 / 用户作为高层观察者）

- **拒绝原因**：Stage 1C 自己已明确建议"先不写入 Memory，待下次 session 验证"。这些是**推断**而非用户原话表达，证据强度不足。Memory 应该建立在确定证据上，推断条目过早写入会污染索引。
- **替代处置**：在 `.dev/session-review/01_working/` 保留为"待验证"档案，下次 session 看到类似线索后再升 Memory。

### 拒绝 #2 — Stage 1C 元偏好 M-2（不确定时希望明确说"我不确定"）

- **拒绝原因**：Stage 1C 自己说"与 CLAUDE.md '全然自主性 + 责任在你' 已隐含同义；不需要再加一条"。Memory 不应重复 CLAUDE.md 已覆盖的内容。

### 拒绝 #3 — Stage 1A 大部分返工事件（#1-#10 的事件级流水）

- **拒绝原因**：persistence-system.md 明确："Memory: No information derivable from code or git history, no implementation details that live in source"。这些事件的**抽象方法论**已被 Stage 1B 提取为模式 + Stage 2D 处理为 Rule 候选，事件本身是 git/.dev 历史可查询的，不应直接进 Memory。
- **例外处理**：Stage 1A #1（5 轮"修了视觉但没修实质"）的教训已并入新建 #1 `feedback_verify_fix_actually_applies.md`；Stage 1A #4（console.warn 代理指标）已并入同一条；Stage 1A #6 / #9（plan size discipline）已通过 Rule 候选层处理。
- **不重复进 Memory**：避免事件描述与 Rule / 偏好 Memory 重叠，破坏索引清晰度。

### 拒绝 #4 — Stage 1B #4.1 / #4.2 / #4.3（_synthesis_decisions / _v2_patch_plan / T0 alignment）

- **拒绝原因**：Stage 1B 自己建议"Constitution 升级候选"——是用户写的 Constitution 修订（CLAUDE.md），不是主 Agent 写的 Memory。Stage 2E 不直接修改 Constitution。
- **替代处置**：在 Stage 3 Synthesis 时提醒用户考虑 Constitution 修订。

### 拒绝 #5 — Stage 1B #5（dnd-kit 技术发现 + React batched setState + Tauri camelCase IPC）

- **判断标准**：跨 session 复用价值 vs 已在代码注释/MEMORY.md Patterns 段体现。
- **逐条评估**：
  - **dnd-kit `closestCenter` over === active 行为**：Stage 1B 自己建议"Memory（库行为），不必 Rule"——但仔细看 MEMORY.md 已有 "dnd-kit listeners chain (not shadow)" 一条 pattern；本条只是另一个 dnd-kit 怪行为，加进同段会让 Patterns 段膨胀。**判断**：这条更适合作为 V3 sidebar-reorder spec / category-hierarchy spec 的 inline 注释（已有），不进 Memory；下次写 dnd-kit 代码的 SubAgent 会读 spec 看到。
  - **React batched setState + StrictMode infinite loop**：踩过一次很有价值，但已通过代码内的 `useRef` mutation pattern 落地（diff `+241..+253: dwellStateRef`），下次写类似代码会自然遵循。**判断**：不进 Memory；存在于代码注释 + 实际 SubAgent prompt 中即可。
  - **Tauri 2 `#[allow(non_snake_case)]` IPC camelCase**：单行约定级，已多处使用。**判断**：可以进 MEMORY.md Patterns 段，但优先级低；本次不做（避免索引膨胀）。

- **总结**：3 条都判定为"不进 Memory"——它们已经体现在代码或 spec 中，写进 Memory 是冗余。

---

## 六、其他设计判断说明

### Q1：为什么不把 Stage 1B #6.1（7 个 wave 1 SubAgent 应改 4 个）写进 Memory？

A：Stage 1B 自己建议"Constitution §二.1 慷慨发布、精准拆解 的具体细化"——是 Constitution 升级，不是 Memory。Stage 2E 不修改 Constitution。如果用户在 Stage 3 Synthesis 时同意修订，再统一处理。

### Q2：为什么不为 Stage 1B #6.5（多 SubAgent 同改一文件应串行）写 Memory？

A：这是**编排纪律**，更适合 Constitution / Rule 层。Memory 是积累的"经验事实"，编排纪律应在更稳定层。Stage 2D Rule 候选可能已涵盖此项。

### Q3：为什么不创建"Phase 间审核策略"独立 Memory，而是修订 `feedback_phase_review_loop.md`？

A：避免索引重复。`feedback_phase_review_loop.md` 已经是这个主题的 Memory，只需要把它的标题/正文统一并补充内容即可。新建独立文件会让"Phase 间策略"在索引中出现两次。

### Q4：为什么不直接重命名 `feedback_phase_review_loop.md` 文件？

A：保持文件名不变 + 修改 frontmatter 的 name 字段，可以避免索引中的 markdown link 失效（`[End-of-implementation single review](feedback_phase_review_loop.md)`），是最稳妥的修订方式。frontmatter 的 `name` 字段才是用户/主 Agent 看到的"标题"，文件名是物理路径。

---

## 七、总结报告（给主 Agent）

### 数字汇总

- **新建数**：4
  - `feedback_verify_fix_actually_applies.md`（P0，feedback）
  - `feedback_calibrate_research_depth_to_task.md`（P0，feedback）
  - `feedback_user_test_outranks_reviewer.md`（P0，feedback）
  - `reference_design_documentation_locations.md`（P1，reference）
- **修订数**：3
  - P0：`feedback_phase_review_loop.md` 标题/description/正文重写（消除 Session 1 自我误植）
  - P1：`feedback_research_before_bug_fix.md` 末尾追加"用户已给根因时跳过调研"边界
  - P1：`project_ensemble_pragmatic_execution.md` "How to apply" 末尾追加"强先例任务不启动重型评审循环"反例
- **就地补强数**：2
  - `MEMORY.md` "Build & Deploy" 段追加"用户偏好（实测期间）" + dev mode 优先 bullet
  - `MEMORY.md` "Topic memories" 段重组（替换内容，添加 4 个新链接 + 1 个 "Reference / index" 子段）
- **拒绝数**：5（含 1 类批量拒绝）
  - 3 条推断（待验证不入 Memory）
  - 1 条元偏好（CLAUDE.md 已覆盖）
  - Stage 1A 8 个返工事件（事件流水不入 Memory，方法论已转 Rule / 偏好 Memory）
  - Stage 1B 3 个 Constitution 候选（不属于 Memory 范围）
  - Stage 1B 3 条技术发现（已在代码 / spec 中体现，不进 Memory）

### 索引更新条目数

- **MEMORY.md 增 / 改 行数**：
  - "Build & Deploy" 段：+1 bullet
  - "Topic memories" 段：完整重组，最终 9 条 topic + 1 条 reference + 1 条 Rule 链接 = 11 条索引（含子段标题与空行）
- **预估总行数**：~65 行（远低于 200 行硬上限）

### Global Rule 升级判断

按 persistence-system.md "Multi-project evidence" 标准，**0 条达 Global Rule 标准**——所有 Memory 都按项目级登记。
- 最接近 Global 标准的是 `feedback_user_test_outranks_reviewer.md`（项目无关 + 跨领域），仅缺 multi-project 证据；下次别的项目再现一次后再 promote。
- `feedback_verify_fix_actually_applies.md` / `feedback_calibrate_research_depth_to_task.md` 同理。

### 关键执行建议

1. **修订 / 新建顺序**：先修订（`feedback_phase_review_loop.md` P0 必须修），再新建（4 个新文件），最后更新 MEMORY.md 索引（避免索引指向尚未存在的文件）。
2. **`originSessionId` 填值**：所有新建文件需要主 Agent 在最终写入时填入本次 Session 的真实 ID。
3. **修订 `feedback_phase_review_loop.md` 时保留原 originSessionId**（5f7f5775...）—— 这是 Session 1 留下的偏好，Session 2 只是矫正措辞，不应清空原始追溯信息。
4. **不删除任何现有 Memory 文件**——本次只新建 + 修订 + 补强；保留所有现有学习。
