# Stage 2D — Rule 候选提取（Category Hierarchy Session）

> **任务**：从 Stage 1A 11 条 Rule 候选 + Stage 1B 6 模式中识别真正应升 Rule 的项；走严格的 5 项测试 + Global vs Project 三标准 + retrospective-to-global 反模式自检。
> **默认 scope**：project（`./.claude/rules/`）。
> **核心警惕**：本次 session 用户判定"$400 / 8h 实现一个小功能太夸张"——很多返工不是缺 Rule，而是**过度套用**已有 Rule。**优先识别"减少 / 边界化已有 Rule"的修订；新建 Rule 是最后选项**。
> **结果摘要**：11 + 6 = 17 候选项 → 通过 5 项测试 4 条 → **新建 0 条 / 修订已有 4 条 / 拒绝 13 条**。

---

## 一、统一候选清单（17 条）

### Stage 1A "可规范化为 Rule" 候选（11 条）

| ID | 候选名 | 1A 判定 | 来源事件 |
|---|---|---|---|
| R-1 | Symmetric inverse operation pair must explicitly justify same-gate vs split-gate | YES P0（先项目，后 global） | #1 promote/demote 5 轮返工 |
| R-2 | A user-reported bug requires a diagnostic SubAgent before any code-level fix | YES P0（升级 MEMORY → Rule） | #1 #4 |
| R-3 | A fix must define a user-observable success criterion before claiming completion | YES P0（项目级） | #1 #4 #10 |
| R-4 | Cross-document cascade scope MUST include doc comments + test names + commit messages + SubAgent prompts | YES P0（扩展现有 Rule） | #3 #5 #10 |
| R-5 | Synthesis Gate must produce both `_synthesis_decisions.md` AND `_risk_distillation.md` | YES P0（强化 plan-as-research-design.md） | #6 |
| R-6 | Spec anti-patterns must be acknowledged in implementation deliverables | Partial YES P1（项目级） | #10 |
| R-7 | Spec/tech plan size discipline（02 ≤ 1000 / 03 ≤ 1500 / 04 ≤ 800） | YES P1（扩展 plan-document-style） | #2 #9 |
| R-8 | paths-frontmatter Rules don't fire on file creation; SubAgents must inline | YES P1（全局） | #2 |
| R-9 | Reviews are last-line-of-defense, not first-line | YES P1（全局） | #6 #7 |
| R-10 | Dev-mode for iterative testing; release build only for ship verification | NO P2（MEMORY） | #8 |
| R-11 | Debug logging discipline（DEBUG_X flag + 单独 commit） | NO P2（MEMORY） | #5 |

### Stage 1B 6 模式 + 3 编排浪费提到的固化候选（6 条）

| ID | 模式名 | 1B 判定 | 备注 |
|---|---|---|---|
| M-A | 设计哲学蒸馏 → design-language.md | 已固化 | 不重新评估 |
| M-B | 多 SubAgent 调研后主 Agent 亲笔仲裁（_synthesis_decisions） | Constitution §二.4 升级候选 | 不在 Rule scope，归 Constitution |
| M-C | 多 reviewer 评审后主 Agent 整合 + 分派 patch（_v2_patch_plan） | Constitution §二 增节候选 | 不在 Rule scope，归 Constitution |
| M-D | **任务规划深度三档分类**（创造 vs 结构 vs 维护）—— 本次最大元教训 | plan-as-research-design.md 加 "When NOT to plan" 段 | **P0 候选** |
| M-E | 评审 SubAgent 数量随 P0 收敛缩减 | Memory | 不在 Rule scope |
| M-F | 可机器验证的 acceptance 应派自动化 SubAgent | Memory | 不在 Rule scope |

### 编排浪费 3 项（仅作上下文，不直接成 Rule 候选）

- 7 个 wave 1 SubAgent 应 4 个（R3/R4/R6 与其他 overlap）→ 归 Memory
- 6 个 V1 reviewer 派给 1307 行 spec → 归 Memory（评审与 spec 体量正反馈）
- 未派"自动化 acceptance SubAgent" → 归 Memory

---

## 二、5 项测试评估（去重后聚合候选）

候选项整合：
- **R-1 + R-3** 共享"先识别用户视角再定义 fix"原则 → 合并审视
- **R-4** 与已有 `cross-document-cascade-discipline.md` 是**修订**，不是新建
- **R-5** 与已有 `plan-as-research-design.md` 是**修订**
- **R-7** 与已有 `plan-document-style.md` 是**修订**
- **M-D** 与已有 `plan-as-research-design.md` 是**修订**（"When NOT to plan" 段已存在，需要扩充任务三档分类）
- **R-2** 与 MEMORY `feedback_research_before_bug_fix` 是 **MEMORY 升级或保留**
- **R-6 / R-8 / R-9** 单独评估
- **R-10 / R-11 / M-B / M-C / M-E / M-F** 1A/1B 已自判定不进 Rule，验证后排除

**去重后 7 个独立候选**：C1（R-1）、C2（R-2）、C3（R-3）、C4（R-4 cascade scope 扩展）、C5（R-5 + M-D plan-as-research 扩展）、C6（R-7 plan-document-style 扩展）、C7（R-6 anti-pattern acknowledgment）、C8（R-8 paths-frontmatter）、C9（R-9 reviews-as-last-line）。共 **9 个**。

---

### C1 — Symmetric inverse operation pair must explicitly justify gate

**候选措辞**：任何成对的逆操作（promote/demote、attach/detach、expand/collapse、show/hide、enable/disable），spec 必须显式列出"两者是否共享 trigger / threshold / animation gate"决策项，不允许隐式对称。

**5 项测试**：

| 测试 | 评估 |
|---|---|
| 1. 可泛化 | 部分。"逆操作"概念跨域适用（UI / 命令模型 / 物理模拟），但**触发该 Rule 的非对称语义直觉**（用户的 demote = 新建立，promote = 撤销）极特定于这种交互成对。文档/数据领域几乎不触发。 |
| 2. 违反代价 | **高**（已实证）—— 5 轮 build + reinstall + 用户实测 ≈ 1.5-2h。但**违反代价的 80% 来自第二个根因（用户反馈缺诊断流程，C2/C3）而非缺这条 Rule**——即便 spec 阶段没识别非对称，如果第一轮反馈就派语义诊断 SubAgent，2 轮内能修对。本条 Rule 减少的是"识别非对称的概率"，不是"返工总量"。 |
| 3. 独立可执行 | 弱。"显式列出共享 gate 决策项" 听起来具体，但**触发条件本身需要识别**："这是一对逆操作吗？" 在 spec 编写期，主 Agent 不一定意识到自己写的两个动作互逆——sidebar reorder 时没意识到 promote/demote 是逆操作，就是因为代码层都是 setCategoryParent。**Rule 的 "trigger" 需要更明确的检测信号**，否则会变成 "spec 写完后派 SubAgent 找逆操作"——又一个评审环节。 |
| 4. 不重复 | 与现有 Rule 不重叠。 |
| 5. enable-over-constrain | **关键问题**。删掉这条 Rule，spec 阶段是否仍可能识别非对称？答：**有——只要 C5（research → plan 之间多一份 _risk_distillation.md）存在**。如果 R1-R7 调研里有任何一份显式做"用户心智模型 vs 代码对称性" 分析，promote/demote 非对称会被识别。本条 Rule 的实际价值，是 C5 之上的一个特殊子类（"逆操作语义对称性"是 _risk_distillation 应捕获的众多约束之一）。**单独立 Rule 加边际价值低；纳入 C5 边际价值高**。 |

**Global vs Project**：
- Multi-project evidence：仅本项目 1 次。
- Project-agnostic content：satisfied（措辞 generic）。
- Cross-domain：marginal（UI 强适用，文档/数据弱触发）。

**结论**：**拒绝独立成 Rule** → 合并入 C5 _risk_distillation 应覆盖的约束类清单（"逆操作对称 vs 非对称"作为 _risk_distillation 应识别的 risk pattern 之一）。

**理由**：
1. enable-over-constrain 弱——C5 已能间接捕获，单立 Rule 边际价值低
2. trigger 检测困难——独立 Rule 容易变成"spec 写完后再派 SubAgent 检"，等于增加评审环节而非减少返工
3. 用户元偏好"减少 Rule，避免过度规范"——本条加入会造成"逆操作必显式审议"的仪式负担

---

### C2 — User-reported bug requires diagnostic SubAgent before code-level fix

**候选措辞**：用户负反馈触发"语义诊断 SubAgent"作为强制第一步，输出"用户在抱怨的是哪一层（spec / 实现 / 配置 / 物理感）"，再决定下一步。

**5 项测试**：

| 测试 | 评估 |
|---|---|
| 1. 可泛化 | YES — 任何"用户报告 → 多个可能根因"诊断场景。 |
| 2. 违反代价 | **高**（已实证）—— 本 session 5 轮跳过诊断，1.5-2h 返工。 |
| 3. 独立可执行 | YES — "派一个 SubAgent 用用户原话作为 spec 诊断 input" 是具体动作。 |
| 4. **不重复** | **重叠严重**。本条与 MEMORY `feedback_research_before_bug_fix.md` **几乎完全重叠**：MEMORY 已写 "当用户反馈以主观负面感受形式出现，第一动作必须是派一个调研 SubAgent 一手核查根因"。本次 1A 自己也提到"`feedback_research_before_bug_fix` 已经记过原则，但本 session 5 轮跳过证明执行不够强"。**问题不是缺 Rule，是 MEMORY 的执行不强**。 |
| 5. enable-over-constrain | 删掉这条候选，MEMORY 已经在每次 session 加载（参考 `~/.claude/rules/persistence-system.md`：MEMORY.md 索引前 200 行 session 启动加载）。**升级到 Rule 的实际增量是"unconditional 加载 vs MEMORY 索引加载"**——如果 MEMORY 已加载但不被遵守，问题是 prompt-time 触发不强，不是加载 tier 不够高。 |

**Global vs Project**：
- Multi-project evidence：仅本项目 2-3 次（本次 + 上次磁吸）。仍是**同一项目重复出现**——按 persistence-system.md 严格门槛，不构成 multi-project。
- Project-agnostic content：satisfied。
- Cross-domain：YES。

**结论**：**拒绝独立成 Rule** → 强化 MEMORY `feedback_research_before_bug_fix.md` 的"执行机制" 段。

**理由**：
1. 与 MEMORY 内容重叠 → 创建 Rule 形成"同主题双源"，下次又要决定 Rule vs MEMORY 哪个优先
2. 本次失败不是缺 Rule，是已有 MEMORY 的执行不强 → 修 MEMORY 的"执行触发条件"比新建 Rule 更直接
3. retrospective-to-global 反模式：generic 措辞"用户反馈→诊断"是抽象方法论，本 session 是该原则在同一项目复发

**修订动作**（在 Memory 阶段输出，非 Rule 阶段）：
- 在 `feedback_research_before_bug_fix.md` 加"执行触发清单"段：用户负反馈关键词触发清单（"卡 / 不对 / 还是不行 / 没区别 / 太强 / 太弱"）+ 主 Agent 第一动作必须是派 SubAgent 而非任何 grep / 读代码 / 改参数
- 不进 Rule

---

### C3 — Fix must define user-observable success criterion before claiming completion

**候选措辞**：任何用户负反馈相关的 fix，主 Agent 必须列出"修复后在用户视角能观察到的具体差异"作为 fix 的"完成判定"，没列就不准 push build。不允许用 console 输出 / 中间 state 作为收敛代理。

**5 项测试**：

| 测试 | 评估 |
|---|---|
| 1. 可泛化 | YES — 任何"开发者视角的中间态 vs 用户视角的终态"问题。 |
| 2. 违反代价 | **高**（已实证）—— 第 1 轮"console 看起来对了"虚假收敛，第 2-3 轮重复同模式 ≈ 30 分钟纯 build/install。 |
| 3. 独立可执行 | YES — "fix 提交前显式写'修好后用户能观察到的差异'" 是具体格式约束。 |
| 4. **不重复** | 与现有 Rule **不重叠**。但与 `Global Rules.md` "Investigate Before Answering" + MEMORY `feedback_research_before_bug_fix` 是不同 phase（"修复完成前"而非"修复开始前"），互补不重叠。 |
| 5. enable-over-constrain | **保留有边际价值**。删掉这条，已有 Rule 覆盖"修前调研"，不覆盖"修后验证"——这是真实空隙。本次实证：第 2-3 轮的失败模式是"console 输出对了 → 直接 push build"，主 Agent 在该 phase 没有任何 Rule 触发。 |

**Global vs Project**：
- Multi-project evidence：仅本项目 1 次。
- Project-agnostic content：satisfied。
- Cross-domain：YES（学术 / 产品 / 工程跨域适用）。

**判断**：**通过 5 项测试**，但需要审视一个问题：**这条 Rule 是"不重复但低 leverage"，还是"不重复且高 leverage"？**

**Leverage 分析**：
- 高 leverage 的迹象：本次 5 轮 drop-into 中至少 3 轮触发该模式（"console 看起来对" → push build → 用户报"没区别"）。这是高频失败模式。
- 低 leverage 的迹象：用户反馈"没区别"本身已经会触发 C2 的诊断流程（Memory 升级后的执行）。如果 C2 的执行真到位，"console 看起来对"也会被诊断 SubAgent 拦下。
- **关键判断**：本条 Rule 的价值是 **"提前一步"** ——在"push build → 用户报错"之前，主 Agent 自己应已识别"我没在用户视角验证过"。但**这要求主 Agent 在 push build 前主动 self-check**——是个能力要求，不是 Rule 能强制的。Rule 写出来后，仍依赖主 Agent 在 push build 前**触发该 Rule**。

**结论**：**通过门槛 → 项目级 Rule（保留独立创建）**。

理由：
- 5 项测试全过
- 与现有 Rule 不重叠（现有都是修前 / 修中，本条是修完前）
- enable-over-constrain 通过：删掉后该 phase 无任何防御
- 但**优先级降为 P1 而非 P0**——因为依赖 self-check 触发，不是机械动作

**Rule 名建议**：`fix-must-define-user-observable-success.md`（项目级）

**Rule 内容草稿**（200 字内，写时再细化）：
> **任何"修复用户报告问题"的 commit 在 push build / 让用户实测前，必须显式定义"用户视角可观察到的差异"作为 acceptance：用户做 X 操作 → 看到 Y 现象（不再是 Z）。** console 输出、中间 state、单元测试绿、jsdom 测试不构成 user-observable 验证。
>
> trigger：commit message 含 "fix:" + 处理用户报告，且 SubAgent / 主 Agent 即将 push build / 让用户实测。
>
> action：fix 实施前主 Agent 列 acceptance；实施完后用 acceptance 反向验证；只有用户视角差异确实可观察才 push。
>
> **Why**：本项目第 1-3 轮 drop-into 修复都是"console 输出对了 → push build → 用户没区别"——主 Agent 用中间态 console.warn 代理终态判定，3 轮虚假收敛。

---

### C4 — Cross-document cascade scope expansion (doc comments / test names / commit messages / SubAgent prompts)

**候选措辞**：扩展现有 `cross-document-cascade-discipline.md` 的 cascade scope，定义"any binding artifact"包含 spec md + 源文件 inline doc comments + 测试函数名 + 测试断言文本 + commit message + SubAgent prompt template。

**5 项测试**：

| 测试 | 评估 |
|---|---|
| 1. 可泛化 | YES — 任何 multi-doc + 多 binding artifact 项目。 |
| 2. 违反代价 | 中（已实证）—— `_v2_patch_plan §3.4` 修订 → 仅在文档底加删除线 → `types.rs:247-262` doc comment 仍说旧措辞 → final_audit 拦下 + ~20 分钟修。 |
| 3. 独立可执行 | YES — "cascade scope 包含 grep 源文件 doc comment / 测试名" 是具体动作。 |
| 4. **不重复** | 这是对**现有 Rule 的修订**，不是新建。现有 `cross-document-cascade-discipline.md` 写"每次修订必须执行 cascade footprint"，但隐含 scope 仅 .md 文档间。本次实证 scope 应扩到 doc comment / test names。 |
| 5. enable-over-constrain | 删掉本条扩展，现有 Rule 仍生效但 scope 不全 → 30% 概率漏 doc comment。 |

**Global vs Project**：
- 现有 Rule 是 project 级（在 Ensemble 项目内）。修订本身保持 project scope。
- Multi-project evidence：仅本项目 1 次。
- Project-agnostic content：satisfied。
- Cross-domain：YES。

**结论**：**通过 → 修订 `/Users/bo/Documents/Development/Ensemble/Ensemble2/.claude/rules/cross-document-cascade-discipline.md`**。

修订点：
- 在 "How to Apply / Action 1: Revision History" 段后加 "Cascade scope clarification"：
  - cascade footprint 必须包括所有 binding artifact，不仅 .md：
    - .md spec / plan documents（已有）
    - 源文件 inline doc comments (`///` Rust / `/**` TS / `"""` Python)
    - 测试函数名 + 测试 description string
    - commit message （在 cascade 完成前不允许 commit）
    - SubAgent prompt template（如有 reusable prompt）
  - grep 命令应针对修订前措辞做反向匹配，找所有上述 artifact 中的 stale 引用

---

### C5 — Synthesis Gate: _synthesis_decisions + _risk_distillation + 任务规划深度三档分类

整合 R-5 (1A) + M-D (1B 核心元教训)，两者都是 `~/.claude/rules/plan-as-research-design.md` 的扩展。

**候选措辞 1（R-5 part）**：Synthesis Gate 必须产出两份 artifact —— `_synthesis_decisions.md`（决策汇总）AND `_risk_distillation.md`（研究的 binding 约束清单）。

**候选措辞 2（M-D part）**：plan-as-research-design 的 "When NOT to plan" 段需扩充为**任务规划深度三档分类**（创造 vs 结构 vs 维护），不是 binary "use research-first / skip research-first"。

**5 项测试**（合并审视）：

| 测试 | 评估 |
|---|---|
| 1. 可泛化 | YES — 跨工程 / 学术 / 产品。 |
| 2. 违反代价 | **极高**（已实证）—— 本次 ROI 评估：~30% 调研投入是 overlap heavy（R3/R4/R6 与其他重复）；6 个 V1 reviewer 是因为 V1 spec 写得太详细诱发 22 P0；最关键是**误用 sidebar-reorder "创造性任务" 范式套到 "结构性扩展" 任务**——8h 中至少 3-4h 是这个错配的代价。 |
| 3. 独立可执行 | 部分。"产出 _risk_distillation.md" 是动作；"任务三档分类"需要主 Agent 主动判断"任务属于哪一档"——是判断而非动作。但**判断标准可以列举**（创造性 vs 结构性 vs 维护性，配合本次 7.4 节的判断表），并不抽象。 |
| 4. **不重复** | 与现有 Rule **不重叠**——是对 `plan-as-research-design.md` 的扩展，不是新 Rule。 |
| 5. enable-over-constrain | **极强保留价值**。本次最大教训是"误用范式"——不修这条 Rule，下次结构性扩展任务又会按 sidebar-reorder 6 步范式跑一遍。这是 8h 浪费的根因。 |

**Global vs Project**：
- 现有 `~/.claude/rules/plan-as-research-design.md` 是 **global**。修订保持 global。
- Multi-project evidence：multi 不强，但本条修订的两个核心 — **任务三档分类** 是 generic 元方法论（任何项目类型适用），**_risk_distillation.md** 是工作流补充（跨项目可复用）。修订 global Rule 不需要重新满足三标准，只需要修订内容仍然 generic（满足 project-agnostic + cross-domain）。修订内容核查：
  - 任务三档分类 = project-agnostic（不含项目特定路径/技术栈）+ cross-domain（学术 / 工程都适用）✓
  - _risk_distillation.md 工作流 = project-agnostic + cross-domain ✓

**结论**：**通过 → 修订 `~/.claude/rules/plan-as-research-design.md`**。

修订点（两段）：

**修订 1：在 "Layer 2 — Synthesis Gate" 段后加"Two artifacts"段**：

> **Two artifacts, not one.** The Synthesis Gate must produce both:
> - `_synthesis_decisions.md` — the locked decisions（带置信度 + 冲突解决）, written by the lead agent (not delegated)
> - `_risk_distillation.md` — a flat checklist of all binding risks, constraints, and boundary conditions extracted from research (each ≤ 1 line + cite to research artifact). This is the conformance anchor for the spec / plan / implementation.
>
> The decisions document tells you what to build; the risk distillation tells you what to NOT miss. Without the second artifact, research-time risks vanish into the spec-writer's mental model and only re-surface during reviewer/audit phases — by which point V1 has already been written.

**修订 2：在 "Skip research-first planning when" 段扩充为三档分类**：

> ## Task Complexity Tiers (Determines Planning Depth)
>
> Before deciding "research-first or skip", classify the task into one of three tiers:
>
> | Tier | Examples | Planning Depth |
> |---|---|---|
> | **Creative + High Irreversibility + High Reuse** | First-time animation physics, novel framework design, design language definition | Full research-first: 6+ stage pipeline, multi-expert review, design-language Rule output |
> | **Structural + Medium Irreversibility + Medium Reuse** | Adding a field to a known data model, extending an established interaction (tree to existing reorder), well-known pattern adaptation | **Compact research-first: 3-4 stage pipeline, 1-2 综合 reviewer, no design-language Rule output**. Risk distillation still required (fewer items, but still required). |
> | **Maintenance + Low Irreversibility + Low Reuse** | Rename, dropdown option add, bug fix with clear root cause, format conversion | Skip research-first; direct execution per Constitution §一.4 exemption. |
>
> The dominant failure mode is **misclassifying a Structural task as Creative**——adding sidebar-reorder-grade ceremony to a task that needs only 3-4 stages. Symptom: the planning artifacts (research + spec + plan + reviews) exceed the implementation code by 10x+ in tokens, with most additional tokens going to "completeness proof" not "decision support". When this happens mid-task, stop and re-classify.

**优先级**：**P0 — 本次最大元教训，必须落地**。

---

### C6 — Spec/tech plan size discipline（02 ≤ 1000 / 03 ≤ 1500 / 04 ≤ 800）

**候选措辞**：扩展 `plan-document-style.md` scope 到所有 .dev/ 下的 binding 文档。

**5 项测试**：

| 测试 | 评估 |
|---|---|
| 1. 可泛化 | YES。 |
| 2. 违反代价 | **中-高**——本次 03 V2 3602 行 + 02 V2.1 1329 行，超长 spec → SubAgent 跳读 → 关键决策被 skim 过（参 #6）。每 SubAgent 必读 = N × 3602 行 token 浪费 ≈ 30K / SubAgent。 |
| 3. 独立可执行 | YES — 行数硬上限。 |
| 4. **不重复** | 现有 `plan-document-style.md` 仅约束 implementation_plan，本条扩展 scope 到 spec / tech plan。是修订不是新建。 |
| 5. enable-over-constrain | **关键**：超长 spec **本身就是** "结构性任务用了创造性任务方法" 的症状（C5 的根因）。**删掉这条扩展，C5 修订到位后，spec 不再为"覆盖一切"而膨胀，size 会自然控制**。本条与 C5 是症状-根因关系。 |

**Global vs Project**：N/A（修订 project-level Rule）。

**判断**：**通过 5 项测试，但低 leverage**——C5 修到位 → spec 体量自然控制。本条是治标不治本。

但是 size discipline 仍有独立价值：
- 即便 C5 落地，主 Agent 在写"创造性任务"spec 时仍可能膨胀（sidebar-reorder V3 也有 1329 行）。size 上限提供下限保障。
- 给具体数值参考（即便不强制），SubAgent 写 spec 时有 self-check 锚点。

**结论**：**通过 → 修订 `/Users/bo/Documents/Development/Ensemble/Ensemble2/.claude/rules/plan-document-style.md`**。

修订点：
- 文档标题/范围扩展：从"Plan 文档"扩到"Plan / Spec / Tech Plan 文档"
- "Hard limits" 段添加：
  - 02 design spec ≤ 1500 行（本次 V3 sidebar-reorder spec 约 1300 行可作 baseline；超 1500 是膨胀指标）
  - 03 tech plan ≤ 1500 行
  - 04 implementation plan ≤ 800 行（已有）
- 在每个上限旁边加注："超过上限不一定是错——但超过 1.5x 是 'spec 膨胀' 警报，stop 并审视：是否在为'完整性证明'而写而非'决策支持'？"

**优先级**：P1（C5 主治、本条辅助）。

---

### C7 — Spec anti-patterns must be acknowledged in implementation deliverables

**候选措辞**：实施 SubAgent 完成时必须输出"已避免哪些 anti-pattern"清单，主 Agent 验证后才进 next phase。

**5 项测试**：

| 测试 | 评估 |
|---|---|
| 1. 可泛化 | YES — 任何 spec + anti-pattern 项目。 |
| 2. 违反代价 | 中——本次 #10 DragOverlay depth prop 违反 V3 不变量 #21；final_audit 30 分钟修。 |
| 3. 独立可执行 | YES — SubAgent 交付清单中加一节"Anti-pattern conformance"。 |
| 4. **不重复** | 与现有 Rule 不重叠。 |
| 5. enable-over-constrain | **弱**。删掉本条，主 Agent 仍可以在派 SubAgent prompt 中加"必须 acknowledge anti-pattern X/Y"——这是 Constitution §二.2 "Prompt 放指令"应当处理的。**Rule 形式 vs prompt 形式**：本条本质是"实施 SubAgent prompt 应包含的一段标准"——是 prompt 模板而非 Rule。 |

**判断**：**拒绝独立成 Rule** → 走 Memory 或 Constitution 内嵌。

理由：
1. enable-over-constrain 弱——主 Agent 在 prompt 中显式要求即可
2. 与 Constitution §二.2 "Prompt 放指令，md 放上下文" 同类——Constitution 已覆盖通用原则
3. 单独成 Rule 会形成"同主题（SubAgent prompt 标准）多源"
4. 用户元偏好"减少 Rule"

**替代**：在 Memory 加"实施 SubAgent prompt 模板" 条目，列 anti-pattern acknowledgment 等模板化要素。

---

### C8 — paths-frontmatter Rules don't fire on file creation

**候选措辞**：paths-based Rule 是 read-time match 不是 write-time，SubAgent prompt 必须显式 inline 该 Rule 核心约束。

**5 项测试**：

| 测试 | 评估 |
|---|---|
| 1. 可泛化 | YES——是 Rule 系统机制层面的约束。 |
| 2. 违反代价 | 中——本次 04 V1 64K 失败 30 分钟。 |
| 3. 独立可执行 | YES。 |
| 4. **不重复** | 与现有 Rule 不重叠，是关于 Rule 系统机制的元 Rule。 |
| 5. enable-over-constrain | **关键**：删掉这条，主 Agent 派"创建新文件" SubAgent 时不知道 paths-based Rule 不会自动触发——会再次撞这个坑。 |

**Global vs Project**：
- Multi-project evidence：仅本项目 1 次。
- Project-agnostic content：satisfied（关于 Rule 系统机制本身）。
- Cross-domain：YES（任何项目都用 Rule 系统）。

**判断**：边缘候选。

**审视：是否真的需要这条 Rule？**：
- 本条本质是 `persistence-system.md` 的实施细节——paths frontmatter 行为本身是 Rule 系统机制，应当文档化在 persistence-system 而非另起 Rule。
- 现有 `persistence-system.md` 写"With paths frontmatter → loaded only when Claude reads matching files"，但没明示"创建新文件不算 read"——这是**完善 persistence-system，不是新 Rule**。

**结论**：**拒绝独立成 Rule** → 报告主 Agent，建议在 `~/.claude/rules/persistence-system.md` "Rules" 段补一句澄清"paths frontmatter triggers on file READ, not WRITE — SubAgents creating new files at the matched path will not auto-load the Rule; their prompt must inline the Rule".

**注**：本条的修订属于 `~/.claude/rules/` 范围，需用户确认（按 persistence-system.md "Required: Report Before Creating" 的延伸：修订 global Rule 也应通报）。

---

### C9 — Reviews are last-line-of-defense, not first-line

**候选措辞**：派评审 SubAgent 前 sanity-check："这个 reviewer 找的问题，规划/调研阶段是否有可能 catch？" Yes → 问题回流为规划阶段硬约束补强。

**5 项测试**：

| 测试 | 评估 |
|---|---|
| 1. 可泛化 | YES。 |
| 2. 违反代价 | 中——本次 Reviewer E 派给 1300 行 V1 spec 找 0 P0 + 11 P1（全 alignment 类）；reviewer F 找的 4 P0 全在 R1 已写过——这是规划没 cross-check research 的衍生品。 |
| 3. 独立可执行 | 弱——"sanity-check 这个 reviewer 找的问题规划阶段能否 catch"是反思动作，难量化触发。 |
| 4. **不重复** | 与现有 Rule 不直接重叠，但与 C5（Synthesis Gate 两 artifact）**根因相同**——都是"规划阶段没把 research risk 当 binding cross-check"的不同表达。 |
| 5. enable-over-constrain | **弱**。如 C5 落地（_risk_distillation 必产出），评审 SubAgent 找的 P0 大部分会在规划阶段被 catch——本条 Rule 的实际效果与 C5 重叠 80%。剩下的 20% 是"评审过度而非规划不足"——但这是**派单决策层**问题（Constitution §二.1 "慷慨发布、精准拆解"），不是 Rule 层。 |

**判断**：**拒绝独立成 Rule** → 合并入 C5 的修订（_risk_distillation 落地 → 评审承担规划质量的现象自然消失）。

理由：
1. 本条与 C5 是同一根因的不同表达
2. Rule 写法依赖反思而非具体动作（"是否能 catch" 是判断）
3. 用户元偏好"减少 Rule"
4. 派单决策层问题应在 Constitution §二.1 处理

---

## 三、决议汇总

### 通过 5 项测试、推荐落地的修订（4 条，全部 修订已有 Rule，0 条新建）

| ID | 候选 | 落位 | Scope | 优先级 |
|---|---|---|---|---|
| **MOD-1** | Cross-document cascade scope expansion（doc comments + test names + commit messages） | 修订 `/Users/bo/Documents/Development/Ensemble/Ensemble2/.claude/rules/cross-document-cascade-discipline.md` | project | P0 |
| **MOD-2** | Synthesis Gate two artifacts + 任务规划深度三档分类 | 修订 `~/.claude/rules/plan-as-research-design.md` | global（Rule 现有 scope） | **P0** — 本次最大元教训 |
| **NEW-1** | Fix must define user-observable success criterion | 新建 `/Users/bo/Documents/Development/Ensemble/Ensemble2/.claude/rules/fix-must-define-user-observable-success.md` | project | P1 |
| **MOD-3** | Spec/tech plan size discipline（02/03 ≤ 1500） | 修订 `/Users/bo/Documents/Development/Ensemble/Ensemble2/.claude/rules/plan-document-style.md` | project | P1 |

### 边界候选（建议向用户报告，不直接落地）

| ID | 候选 | 建议处理 |
|---|---|---|
| **REPORT-1** | paths-frontmatter Rules don't fire on file creation | 建议向用户报告：是否在 `~/.claude/rules/persistence-system.md` "Rules" 段加一句澄清"paths frontmatter triggers on read, not write"。这是修订 global Rule，按 persistence-system.md 严格门槛需用户确认。 |

### 拒绝候选（13 条 + REPORT-1）

| 候选 | 拒绝原因 | 替代去向 |
|---|---|---|
| C1（R-1） Symmetric inverse operation | 1. 单立边际价值低（C5 _risk_distillation 已能间接捕获） 2. trigger 检测困难 3. 用户元偏好"减少 Rule" | 合并入 C5 _risk_distillation 应识别的 risk pattern 之一 |
| C2（R-2） User-reported bug requires diagnostic SubAgent | 与 MEMORY `feedback_research_before_bug_fix` 重叠；问题是 MEMORY 执行不强而非缺 Rule | 强化 MEMORY 而非新建 Rule（Stage 2E 处理） |
| C7（R-6） Spec anti-patterns acknowledgment in deliverables | 本质是 SubAgent prompt 模板，不是 Rule；与 Constitution §二.2 同类 | Memory 模板条目 |
| C9（R-9） Reviews are last-line-of-defense | 与 C5 根因相同，C5 落地后效果重叠 80% | 合并入 C5 修订 |
| R-10 Dev-mode for iterative testing | 1A 自判定 P2 MEMORY | Memory（Stage 2E） |
| R-11 Debug logging discipline | 1A 自判定 P2 MEMORY | Memory（Stage 2E） |
| M-A 设计哲学蒸馏 | 1B 自判定"已固化" | 不重新评估 |
| M-B _synthesis_decisions（主 Agent 亲笔仲裁） | 1B 建议 Constitution 升级，不在 Rule scope | 不在 Rule 阶段处理 |
| M-C _v2_patch_plan（主 Agent 整合分派） | 1B 建议 Constitution 升级，不在 Rule scope | 不在 Rule 阶段处理 |
| M-E 评审 SubAgent 数量随 P0 收敛缩减 | 1B 自判定 Memory | Memory（Stage 2E） |
| M-F 自动化 acceptance SubAgent | 1B 自判定 Memory | Memory（Stage 2E） |
| 编排浪费 #1（7 wave1 应 4） | 项目特定 ROI 评估 | Memory（Stage 2E） |
| 编排浪费 #2（6 V1 reviewer 与 spec 体量正反馈） | 与 C5 + C6 落地后自然消除 | 合并入 C5/C6 |

---

## 四、修订已有 Rule 清单（详细）

### MOD-1: cross-document-cascade-discipline.md（项目级）

**修订位置**：`How to Apply` 段，"Action 1: Revision History" 之后。

**新增段**："Cascade scope clarification"

**修订内容**：
- 加段："Cascade footprint must include all binding artifacts, not only `.md` files. The grep step before declaring 'cascade complete' must cover:"
  - `.md` spec / plan / decision documents（已隐含）
  - 源文件 inline doc comments（`///` Rust / `/**` TS / `"""` Python） — **新增**
  - 测试函数名 + 测试 description string — **新增**
  - commit message + PR description — **新增**
  - SubAgent prompt template（如有 reusable）— **新增**
- 加 grep 命令模板：`rg -n '<obsoleted-phrase>' src-tauri/ src/ test/` 反向匹配检查 stale 引用
- 加证据段："In this project's category-hierarchy session, `_v2_patch_plan §3.4` was revised to drop 'orphan blocks flag advance', but the doc comment on `types.rs:247-262` still said 'ONLY when both orphaned_* are empty'. final_audit caught this as P1; without that audit, the doc comment would have rotted in place forever, contradicting the actual code. The cascade must extend to source-level comments + test names, not just `.md` files."

### MOD-2: plan-as-research-design.md（全局级；最重要的修订）

**修订位置**：两处。

**修订点 1**：在 "Layer 2 — Synthesis Gate" 段后加 "Two artifacts" 段：

新增段内容：
> **Two artifacts, not one.** The Synthesis Gate must produce both:
> - `_synthesis_decisions.md` — locked decisions (with confidence + conflict resolution), written by the lead agent (not delegated)
> - `_risk_distillation.md` — flat checklist of all binding risks, constraints, and boundary conditions extracted from research (each ≤ 1 line + cite to research artifact). This is the conformance anchor for downstream spec/plan/implementation.
>
> The decisions document tells you *what to build*; the risk distillation tells you *what to NOT miss*. Without the second artifact, research-time risks vanish into the spec-writer's mental model and only re-surface during reviewer/audit phases — by which point V1 has already been written. Reviewers then catch issues that planning could have caught, and the project pays double for the same problem.

**修订点 2**：将现有 "Skip research-first planning when" 段重写为 "Task Complexity Tiers (Determines Planning Depth)" 三档分类表：

新内容（替换现有 "Skip research-first planning when" 段）：
> ## Task Complexity Tiers (Determines Planning Depth)
>
> Before deciding "research-first or skip", classify the task into one of three tiers. The dominant failure mode is **misclassifying a Structural task as Creative** — applying full ceremony to a task that needs only a compact pipeline.
>
> | Tier | Examples | Planning Depth |
> |---|---|---|
> | **Creative + High Irreversibility + High Reuse** | First-time animation physics, novel framework design, design language definition, anything that establishes a reusable standard | Full research-first: 6+ stage pipeline (understanding → multi-expert research → synthesis with both artifacts → spec → plan → multi-reviewer → impl), design-language-Rule output if applicable |
> | **Structural + Medium Irreversibility + Medium Reuse** | Adding a field to a known data model, extending an established interaction (e.g. adding tree to existing reorder), adapting a well-known pattern | **Compact research-first: 3-4 stage pipeline, 1-2 综合 reviewer, no new design-language Rule output**. Risk distillation still required (smaller, but required). |
> | **Maintenance + Low Irreversibility + Low Reuse** | Rename, dropdown option add, bug fix with clear root cause, format conversion | Skip research-first; direct execution per Constitution §一.4 exemption. |
>
> ### Mid-task Re-classification Trigger
>
> If during the task you observe any of the following, stop and re-classify:
> - Planning artifacts exceed implementation code by >10x in tokens (most additional tokens going to "completeness proof", not "decision support")
> - V1 spec is >3x the size of comparable Creative-tier specs you have written before
> - Multiple reviewers all return "P0 was already addressed in research" — meaning the spec did not cross-check research risks
>
> These are signals that "Creative" ceremony was misapplied to a Structural task. The recovery is: stop the current Creative-pipeline trajectory, re-scope to a 3-4 stage compact pipeline, and continue.

**Why 段补充**（追加到现有 Why）：
> The fixed-template failure mode goes both ways: applying too little planning to Creative tasks loses to "premature specificity"; applying too much planning to Structural tasks loses to "ceremony exceeds value". The three-tier table makes the second failure mode addressable, not just the first.

### MOD-3: plan-document-style.md（项目级）

**修订位置**：标题 + scope + Hard limits 三处。

**修订点 1**：标题与 scope。
- 现：`# Plan Document Style` + 范围 = "Plan 文档（implementation plan、tech plan、design spec 之外的'如何执行'层文档）"
- 改：扩展 scope 到 "Plan + Spec + Tech Plan 文档"，标题不变

**修订点 2**：Hard limits 段补充：
- 现：implementation plan 总行数 ≤ 800
- 加：
  - 02 design spec ≤ 1500 行（V3 sidebar-reorder ≈ 1300 行可作 baseline；超 1500 是膨胀指标）
  - 03 tech plan ≤ 1500 行
  - 04 implementation plan ≤ 800 行（已有）
- 加注："超过上限不一定是错——但超过 1.5x 是 'spec 膨胀' 警报，stop 并审视：是否在为'完整性证明'而写而非'决策支持'？"

**修订点 3**：Why 段加证据：
> 本次 category-hierarchy session 03 V2 写到 3602 行（约 2.4x 上限），SubAgent 必读时跳读，关键决策被 skim 过；6 个 V1 reviewer 共找到 22 P0，这是 spec 体量与 reviewer 派单数量的正反馈循环——长 spec → 多 reviewer → 找 22 P0 → V2 修订膨胀更长。Hard limit 是切断这个循环的方式。

### NEW-1: fix-must-define-user-observable-success.md（项目级，新建）

**位置**：`/Users/bo/Documents/Development/Ensemble/Ensemble2/.claude/rules/fix-must-define-user-observable-success.md`

**主体内容**（约 200 字）：

```markdown
# Fix Must Define User-Observable Success Criterion

When making a fix in response to user-reported behavior (visual bug, interaction bug, "X doesn't work" complaints), the fix must declare a **user-observable success criterion** before push/build/install — not a developer-observable proxy.

## When This Applies

- A commit message contains `fix:` and addresses a user complaint
- A subsequent step is "push build" / "let user test" / "install to /Applications/"
- The fix changes runtime behavior (not pure refactoring)

## The Rule

Before declaring the fix complete, write:
- **User action**: "User does X (e.g. drags A onto B's row)"
- **Observable change**: "User sees Y (e.g. A is now indented under B; B's row shows the chevron)"
- **Anti-observation (invariant)**: "User does NOT see Z (e.g. A does not snap back to root after drop)"

Console output, intermediate state, dwell-state values, jsdom test results — none of these constitute "user-observable" verification. They are developer-observable proxies. A fix passing console checks but unverified at the user-observable layer is **not done**.

## Why

In this project's category-hierarchy session, rounds 1-3 of "drop-into" fixes all followed the pattern: change code → console.warn now shows correct dwell state → push build → user reports "no difference". The lead agent used the developer-side proxy (console output of `pointerBelowOver` selection) to claim the user-side bug was fixed. Three full rounds of build/install/user-test wasted before the lead agent stopped using console as the success proxy.

The user-observable criterion is the fix's contract. Skipping it is using mid-state observation in place of end-state verification.

## How to Apply

- Inline in commit message body, or as a checklist comment in the PR description
- One short paragraph; not a test plan, just the user-observable diff
- The lead agent uses this as its own self-check before authorizing push
```

---

## 五、关于"减少 Rule"的元判断

用户元偏好"很多返工不是缺 Rule，是过度套用 Rule"——本次 17 候选项 → 仅 4 条通过门槛，落实了这个偏好。具体体现：

1. **拒绝 C1 R-1**（symmetric inverse）尽管是 P0 候选——因为它要么是 ceremony，要么已被 C5 间接捕获
2. **拒绝 C2 R-2**（user-reported bug diagnostic）尽管 1A 标 P0——因为 MEMORY 已写，问题是执行不强不是缺 Rule
3. **拒绝 C7 R-6 / C9 R-9**——这两条与已有 Rule / Constitution 重叠
4. **MOD-2 是最高优先级修订**——因为它**减少误用规模**（让结构性任务不再误套创造性任务的 6 步范式）。这是"减少 Rule 应用"而非"加更多 Rule"

修订全部为已有 Rule 的内容补充，没有引入新的 unconditional 加载 burden。新建 1 条（NEW-1）属于"现有 Rule 完全没覆盖的 phase（修后 / push 前）"，不是替代或重复任何已有 Rule。

---

## 六、Stage 3 行动建议（供主 Agent 参考）

1. **MOD-1 修订** `cross-document-cascade-discipline.md` —— project Rule，可主 Agent 自决直接修
2. **MOD-2 修订** `~/.claude/rules/plan-as-research-design.md` —— **global Rule，按 persistence-system.md "Required: Report Before Creating" 的延伸：修订 global Rule 也应通报用户，建议 Stage 3 先报告再修**
3. **NEW-1 新建** `fix-must-define-user-observable-success.md` —— project Rule，可主 Agent 自决直接创建
4. **MOD-3 修订** `plan-document-style.md` —— project Rule，可主 Agent 自决直接修
5. **REPORT-1** paths-frontmatter clarification —— 报告主 Agent，让其向用户提议是否在 persistence-system.md 加一句澄清

**最终 Rule 库变化**：
- 项目级 Rule 数量：7 → 8（新增 NEW-1）
- 全局 Rule 数量：9 → 9（修订不增加数量）
- 修订项：3 处

**最终结果**：通过严格门槛 → 4 条（其中 3 条修订 + 1 条新建）+ 1 条边界 REPORT。**13 条候选拒绝**。

---

## 七、报告主 Agent 摘要（简短）

- **候选总数**：17（11 from Stage 1A + 6 from Stage 1B）
- **通过 5 项测试**：4 条（MOD-1 / MOD-2 / MOD-3 / NEW-1）
- **新建**：1 条（fix-must-define-user-observable-success.md，project，P1）
- **修订已有 Rule**：3 条（cross-document-cascade-discipline 项目 / plan-as-research-design 全局 / plan-document-style 项目）
- **拒绝**：13 条（全部因合并 / 与 MEMORY 重叠 / 与 Constitution 重叠 / 与已通过修订重叠）
- **边界报告**：1 条（paths-frontmatter clarification 建议补 persistence-system.md）
- **核心**：**MOD-2（plan-as-research-design.md 三档分类）是最高优先级修订**——它直击本次最大元教训（误用 sidebar-reorder 创造性任务范式套到结构性扩展任务），是 8h / $400 浪费的根本预防机制。**Stage 3 落地 MOD-2 比新建任何 Rule 都重要。**
