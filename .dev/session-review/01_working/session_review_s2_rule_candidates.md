# Stage 2D — Rule 候选提取

> **任务**：从 Stage 1A 返工 + Stage 1B 方法论的候选模式中，按 `persistence-system.md` 严格门槛筛选真正应升为 Rule 的候选项。
> **默认 scope**：project（`./.claude/rules/`）。
> **严格性**：宁缺毋滥。0 条产出是合格结果。

---

## 一、候选项审视清单（输入）

### 1.1 来自 Stage 1A "可规范化为 Rule？YES" 的 5 个候选

| 代号 | 候选内容 | 1A 建议 |
|---|---|---|
| 1A-#1 | Test isolation by negative guarantee（cfg(test) panic 而非 fallback） | YES（全局） |
| 1A-#2 | Cross-document cascade discipline（修订 Decisional 时 grep 所有引用方） | YES（项目或更宽） |
| 1A-#3 | Validate cross-layer implementation assumptions（spec 中"由 X 提供"必须验证 X 真的提供） | YES（跨项目） |
| 1A-#5 | Grep before enumerate（规划共享资源约束前 grep 所有访问点） | YES（项目或更宽） |
| 1A-#6 | Research-to-plan conformance check | 已在 plan-as-research-design.md，但执行机制不强 |
| 1A-#7 | Validate numerical equivalence claims with reproduction | YES（专题） |
| 1A-#10 | Each SubAgent task card must list explicit file:line context refs | YES（项目，部分体现在 CLAUDE.md §二.2） |

### 1.2 来自 Stage 1B "建议落项目 Rule" 的 7 个候选

| 代号 | 候选内容 | 1B 建议路径 |
|---|---|---|
| 1B-#1 | Feedback triage research-first（用户负面反馈先调研根因） | `feedback-triage-research-first.md` |
| 1B-#2 | Verify library behavior firsthand（不信文档/注释，读源码） | `verify-library-behavior-firsthand.md` |
| 1B-#3 | Cross-document alignment gate（多文档迭代后独立对齐 SubAgent） | `cross-document-alignment-gate.md` |
| 1B-#4 | Honest precision retraction（伪精确撤回为定性表达） | `honest-precision-retraction.md` |
| 1B-#5 | Fallback path must be unreachable in test | `fallback-path-must-be-unreachable-in-test.md` |
| 1B-#6 | Required reading list format（必读清单按章节号、顺序、置顶） | `required-reading-list-format.md` |
| 1B-#7 | Revision history in evolving docs | `revision-history-in-evolving-docs.md` |
| 1B-#8 | Iterative review to target score（多轮评审驱动收敛） | `iterative-review-to-target-score.md` |

### 1.3 候选项整合后的去重清单

合并 1A + 1B 同主题候选（结果共 10 个独立 Rule 候选）：

| 候选 ID | 主题 | 来源 |
|---|---|---|
| C1 | 测试隔离 negative guarantee（cfg(test) panic） | 1A-#1 + 1B-#5 |
| C2 | 跨文档级联同步 / 对齐检查 | 1A-#2 + 1B-#3 |
| C3 | 库行为一手验证（spec / 代码） | 1A-#3 + 1B-#2 |
| C4 | 数值等价性需复现验证 | 1A-#7 |
| C5 | 用户反馈先调研根因 | 1B-#1 |
| C6 | SubAgent 任务卡显式必读清单格式 | 1A-#10 + 1B-#6 |
| C7 | Grep before enumerate | 1A-#5 |
| C8 | 多轮评审驱动到目标分 | 1B-#8 |
| C9 | Revision History 段 | 1B-#7 |
| C10 | 诚实精度撤回 | 1B-#4 |

---

## 二、严格门槛评估（按候选项）

每个候选项必须通过：
- **A. 内容门槛**（5 项全过）：可泛化、违反代价可见、独立可执行、不重复、enable-over-constrain
- **B. Scope 门槛**：默认 project；global 需多项目证据 + 项目无关 + 跨领域
- **C. retrospective-to-global 反模式自检**：generic 措辞不是普适性证据

---

### C1 — 测试隔离 negative guarantee

**候选**：路径解析 / 默认值 / fallback 在 cfg(test) 下必须 panic 而非回退到生产路径，由 build profile 物理保证不可达，不依赖每个测试 caller 的纪律。

**A. 内容门槛**：
- 可泛化：YES — 任何"开发态可能撞真实资源"的语言（Rust / Node / Python / Go / 任何带文件 IO / 网络 / DB / API 的代码）都适用。
- 违反代价：用户真实数据被覆盖（本次 F1 已实证：用户 Categories/Tags/Scenes 全部丢失，不可恢复）。是单次伤害**最高**的事故类。
- 独立可执行：YES — "在生产路径函数加 `#[cfg(test)] panic`"是可立即检索 + 实施的指令。
- 不重复：与现有 9 条 Rule 全无重叠（Global Rules.md 是"先调查"，academic-reference 是引用验证，document-authority 是文档优先级；无一覆盖测试隔离）。
- enable-over-constrain：删掉它，Agent 在测试设计时会按"加 env override 即可"做 positive guarantee（本次 V1 实施规划 P0-3 就是这种思路），错失 negative guarantee 视角，可能在多 SubAgent 并发场景下重蹈覆辙。

**B. Scope 门槛**（评估是否可全局）：
- Multi-project evidence：**未满足** — 仅本项目 1 次实证。Stage 1A 推断"Tauri / Rust / 任何 home-dir 配置 CLI 都会撞上"，但这是 generic 措辞而非多项目实证。
- Project-agnostic content：satisfied（无项目特有路径/技术栈）。
- Cross-domain applicability：marginal — 工程域内强适用（Rust/Node/Python 测试），但学术/UI 设计等域不直接触发。

**结论**：**通过 → 项目级 Rule**。Global 不达标（仅 1 次证据点）。

**C. 反模式自检**：本条不是"把 retrospective 通用语言包装成 global"——它是具体的代码模式（`cfg(test)` panic），不是抽象方法论。Pass。

**Rule 内容草稿**（200 字内）：
> **任何函数若可写真实文件 / 发真实网络请求 / 调用真实外部资源（DB/API/configdir），其在测试构建（`cfg(test)` / NODE_ENV=test 等）下必须以 panic 或显式异常作为最后一层防线，不得 fallback 到生产路径。**
>
> 测试 isolation 的传统做法是"加 env override + 测试 setup 必须 set 它"——这是 positive guarantee，依赖每个 caller 的纪律，在多 SubAgent / 并发改动场景下不可执行。正确做法是 negative guarantee：让生产路径在测试构建中物理不可达。
>
> 具体形式：`get_app_data_dir()` 在 `cfg(test)` 下若无 env override 则 panic（不是 fallback 到 home dir）。这把"忘了 set env"从可能性彻底删除。
>
> **Why**：本项目 F1 事件——SubAgent 写测试漏 set env，fallback 静默写真实磁盘，覆盖用户全部数据，不可恢复。

**How to apply**：
- 写 / review 任何带 fs / network / external IPC 的 Rust / Node / Python 测试时触发
- 关键词：`unwrap_or_else(|_|`, `or default`, `fallback`, `home_dir()`, `env::var`

**门槛核验汇总**：
- 可泛化：YES
- 违反代价：用户数据丢失（已实证）
- 可独立执行：YES（具体 cfg pattern）
- 不重复：YES（与 9 条现有 Rule 全无重叠）
- enable-over-constrain：删掉后 Agent 会按 positive guarantee 写测试 → 数据安全性下降

---

### C2 — 跨文档级联同步 / 对齐检查

**候选**：多文档协同的项目（spec/plan/impl 三件套），修订一个 Decisional 文档时必须显式声明 cascade footprint；多版本迭代后进入实施前必须发布独立对齐 SubAgent。

**A. 内容门槛**：
- 可泛化：YES — 任何 multi-doc 项目（学术综述、PRD、API doc、framework spec）适用。
- 违反代价：本次 V2→V3 修订漏 04 → T0 抓 3 个 P0；如未抓将重现 V2 P0 bug，回滚 4-6 小时。
- 独立可执行：YES — "修完 02 派对齐 SubAgent 扫 03/04"是具体动作。
- **不重复**：与 `document-authority-ranking.md` 是**互补关系**（authority 解决"谁说了算"；cascade 解决"修一处后谁要跟着改"），不重叠。
- enable-over-constrain：删掉后 Agent 按"修哪个文档单点编辑哪个"做，cascade footprint 漏算，下游撞错配。本次实证。

**B. Scope 门槛**：
- Multi-project evidence：**未满足** — 仅本项目 1 次实证。
- Project-agnostic content：satisfied。
- Cross-domain applicability：YES（学术综述 V2→V3 / 工程 spec / 产品文档同结构）。

**结论**：**通过 → 项目级 Rule**。Global 不达标（仅 1 次证据点）。

**C. 反模式自检**：cascade discipline 不是抽象口号，是具体动作（grep + alignment SubAgent + Revision History），有可操作锚点。Pass。

**Rule 内容草稿**：
> **当一组 Decisional 文档（≥ 2 份，例如 spec / plan / impl checklist）共同构成项目真理且经历多版本迭代时，每次修订必须执行两动作：(1) 在 Revision History 中显式声明 cascade footprint —— 本次改动在其他文档的哪些章节产生连带影响；(2) 进入下一阶段（实施 / 评审）前发布一个独立对齐 SubAgent，单一职责：跨文档逐条比对 P0 矛盾，不评内容质量。**
>
> 对齐 SubAgent 与"评审 SubAgent"是不同任务：评审看内容是否够好，对齐看版本是否一致。同时存在不可合并。
>
> **Why**：本次 V2→V3 修订完成后，主 Agent 漏更新 04 implementation plan T8 modifiers 配置 + T13b acceptance #4/#8 —— T0 对齐 SubAgent 抓出 3 个 P0；若 T0 跳过直接 T1-T13，T8 SubAgent 按 V2 实施会重现 P0 bug（DragOverlay 跟手 X=0），回滚成本 4-6 小时。

**How to apply**：
- 触发条件：≥ 2 份核心文档完成新版迭代（V_n → V_{n+1}）且即将进入实施 / 评审 / 发布。
- 失败信号：跨文档相互引用的章节号 / 数值 / 措辞出现版本错配。

**门槛核验汇总**：
- 可泛化：YES
- 违反代价：下游按过期版本实施（已实证）
- 可独立执行：YES（"派对齐 SubAgent"是动作）
- 不重复：YES（document-authority 互补不重叠）
- enable-over-constrain：删掉后 Agent 单点编辑 → cascade 漏算

---

### C3 — 库行为 / 跨层假设一手验证

**候选**：spec / 代码引用的"库行为"或"由其他层（CSS / lib / 浏览器默认）提供"的物理特性，必须以读源码或类型为准，不以文档、tutorial、注释、AI 推理为准。

**A. 内容门槛**：
- 可泛化：YES — 跨域适用（动效库 / 并发原语 / 浏览器 API / Rust unsafe / 学术 citation 等）。
- 违反代价：本次 spec §2.5 假设"DragOverlay 提供 intrinsic CSS transition"（实际 dnd-kit defaultTransition 鼠标拖拽返回 undefined），磁吸生硬，1.5h 返工 + V2 → V3 → 06_snap_research 三轮修订。
- 独立可执行：YES — "进 node_modules 读源码 / 看类型签名"是具体动作。
- **不重复**：与 `Global Rules.md` "Investigate Before Answering" **重叠但更具体**——后者覆盖"回答前调查"，本条特指"在 spec / 代码中 reliance 第三方/跨层行为时的硬验证要求"，是延伸而非重复。与 `academic-reference-verification.md` 同源（"信息源不能信 AI 输出"），不同载体（学术 citation vs 库行为）。
- enable-over-constrain：删掉它，Agent 在 spec 阶段按"文档/tutorial/training memory"假设库行为，下游撞墙。本次实证。

**B. Scope 门槛**：
- Multi-project evidence：**部分满足** — 本项目 1 次（dnd-kit defaultTransition），但同原则在 academic-reference-verification.md 已有学术域 cross-domain 印记。这构成 "同原则 2 个独立载体" 的初步证据。
- Project-agnostic content：satisfied。
- Cross-domain applicability：satisfied（工程 + 学术）。

**结论**：**项目级 Rule（推荐）。** 评估升 global 但建议先项目级稳一轮：本次具体证据仍是 dnd-kit 单项目；academic 是另一类载体不算独立项目。**Stage 2 不直接升 global，下次再看。**

**C. 反模式自检**：原则有具体触发条件（"spec 写'由 X 提供'") + 具体动作（读 node_modules 源码），不是抽象口号。Pass。

**Rule 内容草稿**：
> **凡 spec 或代码引用"第三方库行为"、"浏览器默认行为"、"由其他层提供的物理/视觉/语义特性"——必须以读源码或类型签名为准，不以官方文档、tutorial、训练记忆、自己写过的注释为准。**
>
> 文档和注释可能撒谎、可能滞后于版本、可能在升级后偏离实际。spec 中任何"由 X 提供"的措辞必须配套一手验证步骤：进 `node_modules/<lib>/dist/` 找具体函数读返回值；看 `.d.ts` 看类型；跑最小可重现脚本看实际输出。
>
> 此 Rule 是 `Global Rules.md` "Investigate Before Answering" 在 spec / 代码层的延伸——后者覆盖"回答前调查"，本条特指"在 spec 中假设第三方行为时必须有一手 evidence link"。
>
> **Why**：本项目 V1/V2 spec §2.5 假设"dnd-kit DragOverlay 提供 intrinsic CSS transition"，实际 v6.3.1 `defaultTransition` 在鼠标拖拽下返回 undefined。下游磁吸生硬，1.5h 返工 + 三轮修订。

**How to apply**：
- 触发：写 spec / 代码时使用第三方库非 trivial 行为，或声明"由 X 自动处理"
- 验证物：源码 line:column 引用 / 类型定义 / 实测脚本输出（任一）

**门槛核验汇总**：
- 可泛化：YES（跨工程语言 / 学术域）
- 违反代价：下游 1.5h 返工 + 三轮修订（已实证）
- 可独立执行：YES
- 不重复：与 Global Rules / academic-reference 互补，不重叠
- enable-over-constrain：删掉后 Agent 按文档假设 → 下游撞实际行为

---

### C4 — 数值等价性需复现验证

**候选**：spec 写"X 与 Y 数值等价 / 匹配 / 替换"必须有数学复现作为 evidence；不能复现就退到"形态相近 / 定性表达"。

**A. 内容门槛**：
- 可泛化：YES — 动效物理 / 信号处理 / benchmark 比较 / 任何带数值的等价声称。
- 违反代价：V1/V2 spec 写 spring 与 cubic-bezier "等价"，V2 评审 SubAgent 跑 Python 复现：RMSE 20%、最大差 48%、视觉时间差 65%——不可数值等价。V3 才撤销。约 2h 间接返工。
- 独立可执行：YES — "派 SubAgent 跑 Python 复现 < 5% 误差才算等价"是具体动作。
- **不重复**：与现有 9 条 Rule 全无重叠。
- enable-over-constrain：删掉后 Agent 按"研究给一个数 → spec 抄一个数 → 评审改一个数"流程做，从未做数值验证。本次实证。

**B. Scope 门槛**：
- Multi-project evidence：**未满足** — 仅本项目 1 次。
- Project-agnostic content：satisfied。
- Cross-domain applicability：YES（动效 / 信号处理 / 学术 benchmark）。

**结论**：**通过 → 项目级 Rule**。

**C. 反模式自检**：具体触发（"spec 出现等价/匹配措辞"）+ 具体动作（数学复现 < 5% RMSE），有锚点。Pass。

**Rule 内容草稿**：
> **任何 spec / 文档声称"X 与 Y 数值等价 / 匹配 / 可替换"必须有数学复现作为 evidence。无复现，必须退到"形态相近 / 定性表达"，不允许保留"等价"措辞。**
>
> 复现要求：派 SubAgent 用 Python（或合适数值工具）按两条曲线 / 公式 / 算法的实际定义采样，计算 RMSE、最大偏差、关键时间点（峰值、半值、稳态）差异。RMSE > 5% 或最大偏差 > 10% 即视为"不可等价"。
>
> 在伪精确与诚实定性之间，主动选诚实定性是正确动作不是退步。审 SubAgent 指出"精度超过证据"时，作者方应优先撤回声称而非加更多数字让虚假精确变真。
>
> **Why**：本项目 V1/V2 §2.4 声称 spring(500/40) 与 cubic-bezier(0.16,1,0.3,1) "等价"，V2 评审跑数值复现发现 RMSE 20%、最大差 48%、视觉时间差 65%。V3 撤销。如未拦截会污染团队 spring 物理认知。约 2h 间接返工。

**How to apply**：
- 触发：spec / 代码 / commit 出现"等价"、"等同"、"matches"、"replaces"、"equivalent" 等强精度措辞 + 数值
- 验证物：数学复现脚本 + 误差报告（或主动改措辞为"形态相近"）

**门槛核验汇总**：
- 可泛化：YES
- 违反代价：V1/V2 → V3 共 2h 间接返工（已实证）
- 可独立执行：YES（"跑 Python 复现"）
- 不重复：YES
- enable-over-constrain：删掉后 Agent 按字面抄数 → 数值等价错

---

### C5 — 用户反馈先调研根因

**候选**：用户报"X 不丝滑 / 不对 / 卡 / 读不通"等主观负面感受时，先派调研 SubAgent 找根因再决定怎么改，不直接调参。

**A. 内容门槛**：
- 可泛化：YES — 任何"症状 → 多个可能根因"诊断场景。
- 违反代价：本次磁吸生硬，如直接调 LERP_FACTOR / cubic-bezier 参数无效（根因不是 lerp 系数，是 modifier 把 transform 钉死 1 帧又跳回 + CSS 注释撒谎）。约 2-3 轮浪费才退回调研。
- 独立可执行：YES — "派调研 SubAgent 一手读 lib 源码 + 核对项目 CSS"。
- **不重复**：与 `Global Rules.md` "Investigate Before Answering" **存在显著重叠**——后者覆盖"回答问题前调查"。本条强调的是"修 bug 前调研根因"——属于不同动作类别（回答 vs 修复），但精神一致。**Stage 1C 已判定走 Memory** 而非 Rule（理由：仅本项目 1 次证据 + 与 Global Rules 部分重叠）。
- enable-over-constrain：删掉后 Agent 按"立即 patch"反应 → 根因被掩盖。本次实证。

**B. Scope 门槛**：
- Multi-project evidence：**未满足** — 仅本项目 1 次。
- Project-agnostic content：satisfied。
- Cross-domain applicability：YES（学术 / 产品 / 工程跨域适用）。

**冲突分析**：
- Stage 1B 建议项目级 Rule。
- Stage 1C 建议 Memory（理由：仅本项目证据 + 与 Global Rules.md 部分重叠）。
- 我的判断：**走 Memory 优于 Rule**——本条更接近"用户偏好"（用户在 U5 明确表达"先调研分析设计"），而 persistence-system.md 决策表明确"User correction or preference learned in session → Memory"。Stage 1C 的判断更符合 persistence-system 决策表。

**结论**：**拒绝 → 走 Memory**。理由：与 Global Rules 部分重叠 + 偏向"用户偏好"性质 + 仅项目内单次证据。

---

### C6 — SubAgent 任务卡显式必读清单格式

**候选**：每个 SubAgent 任务卡顶部带"必读上下文清单（按顺序读完再开工）"，列 file:line 而非仅 section ref，按阅读顺序排列。

**A. 内容门槛**：
- 可泛化：YES — 所有 SubAgent 投递场景。
- 违反代价：本次 V1 04 implementation plan 没列必读上下文，T6/T8 SubAgent 按 dnd-kit 默认 best practice 写而非 spec → code-review 拦下 2 个 P0 + 3 个 P1，约 1h 返工。
- 独立可执行：YES — "任务卡顶部按顺序列 file:line"是具体格式。
- **不重复**：与 `~/.claude/CLAUDE.md` §二.2 "Prompt 放指令，md 放上下文" **存在显著重叠**——CLAUDE.md 已写"对间接相关但能提升理解的材料，必须显式要求阅读"。本条是 CLAUDE.md 的**实施细化**（按顺序、点章节号、置顶），不是新原则。
- enable-over-constrain：删掉它，CLAUDE.md §二.2 的"显式要求阅读"原则在 SubAgent 写作时仍生效，但缺乏统一格式标准。

**B. Scope 门槛**：
- Multi-project evidence：仅本项目 1 次。
- Project-agnostic content：satisfied。
- Cross-domain applicability：YES。

**结论**：**拒绝 → 不规范化为独立 Rule**。理由：
1. CLAUDE.md §二.2 已覆盖核心原则（"必须显式要求阅读"），本条是格式细化
2. 创建独立 Rule 与 CLAUDE.md §二.2 形成"同主题双源"，下次还要决定哪个优先
3. **更优替代**：在 Stage 1B 建议的 `iterative-review-to-target-score.md` 或类似 Rule 中以一段细化内嵌（如果有这条 Rule）；否则放 Memory

实际上 Stage 1B 自己也提到："这条已在 user Constitution §二.2 覆盖，本次的具体强化是'按顺序、点章节号、放任务卡顶部'。建议在 Constitution 现有条目下加一句... 或单独建项目 Rule" —— 1B 自己也犹豫。**走 Memory** 更稳。

---

### C7 — Grep before enumerate

**候选**：写"覆盖某资源的所有访问点"类规划时，必须先 grep 数据访问点（如 `grep -rn 'write_app_data\|read_app_data' src-tauri/`）得到完整 mutating set，再按 set 写规划，而非按文件目录浏览。

**A. 内容门槛**：
- 可泛化：YES — 任何"约束 / 锁 / 权限 / 校验需覆盖某共享资源"场景。
- 违反代价：本次 V3 03 §3.1 主 Agent 按"data.rs 内 mutating fn"心智模型列锁覆盖，漏 claude_md.rs / trash.rs。code-review 拦下，30 分钟返工。如未拦截 → 并发场景 lost update（生产 bug）。
- 独立可执行：YES — "先 grep 再 enumerate"是动作。
- **不重复**：与 9 条现有 Rule 无重叠。但与 `hard-constraints-before-soft-evaluation.md` **方法论同构**——都是"按某种顺序避免遗漏"——但具体场景不同（hard-constraint 是评估顺序，本条是规划数据访问）。
- enable-over-constrain：删掉后 Agent 按文件目录浏览 → 漏算访问点。本次实证。

**B. Scope 门槛**：
- Multi-project evidence：仅本项目 1 次（DATA_MUTEX 漏 claude_md / trash）。
- Project-agnostic content：satisfied。
- Cross-domain applicability：YES（任何带共享状态的系统都会撞）。

**结论**：**通过（边缘）→ 项目级 Rule**。

**审视**：本条与 hard-constraints-before-soft-evaluation 在"先做哪一步避免遗漏"层面同源。要不要合并？我的判断：**不合并**——hard-constraint 是评估顺序（评估眼前的候选时谁先淘汰），grep-before-enumerate 是规划顺序（写规划前先得到完整 set）。两者动作 / 触发 / 验证物都不同，并立可读。

**C. 反模式自检**：具体触发（"写覆盖共享资源约束的规划"）+ 具体动作（grep 命令），有锚点。Pass。

**Rule 内容草稿**：
> **当规划"对某共享资源（数据文件 / 数据库 / 全局状态 / 配置）的所有访问点施加约束（锁 / 校验 / 权限）"时，必须先以 grep / ripgrep / 等价工具枚举所有访问点，得到完整 mutating set，再按此 set 写规划——而非按文件目录浏览或按记忆补全。**
>
> 按文件目录浏览的心智模型是"我看过 commands/data.rs，那里有 5 个 mutating fn"——这只覆盖你看过的目录，遗漏其他模块对同一资源的 mutating（本项目实证：claude_md.rs / trash.rs 也写 data.json 但被漏算）。
>
> 完整 grep 命令应基于"资源访问 API"（如 `write_app_data`、`fs::write`、`db.execute`）而非"文件路径"，确保不遗漏跨模块调用。
>
> **Why**：本项目 V3 03 §3.1 列 DATA_MUTEX 覆盖范围时按 data.rs 单文件 enumerate，漏 claude_md.rs / trash.rs 对 data.json 的写。code-review 拦下；如未拦截会出 lost update。

**How to apply**：
- 触发：规划"全部 X 必须 Y"形式的约束
- 动作：先跑 grep，按 grep 结果写规划，写完让 SubAgent 重新 grep 验证 set 完整

**门槛核验汇总**：
- 可泛化：YES
- 违反代价：lost update 类 race condition（已拦截，但已实证遗漏）
- 可独立执行：YES（grep 命令）
- 不重复：与 hard-constraint 同构但不重叠
- enable-over-constrain：删掉后 Agent 按目录心智模型 → 漏算

---

### C8 — 多轮评审驱动到目标分

**候选**：复杂规划文档使用"多维度评审 SubAgent → 修订 → 复评"循环，每轮设定目标分（如 9/10）。

**A. 内容门槛**：
- 可泛化：YES。
- 违反代价：作者反复自查容易 sunk cost；下次类似任务还要重新设计评审机制。
- 独立可执行：YES。
- **不重复**：与 `~/.claude/CLAUDE.md` §一.4 "理解→调研→规划→确认→执行→迭代" **存在重叠**——CLAUDE.md 已规定迭代 + 用户确认 + 不固守第一版规划。本条添加的是"目标分阈值 + 评审 SubAgent + 路径 B 务实开工"——但这些是**项目特有判断**：
  - 目标分阈值（9/10）是 ad-hoc 数字，不同项目阈值不同
  - "路径 B 务实开工"已在 1C 偏好提取中归为 Ensemble 单人项目偏好（不能横向迁移到团队 / 客户项目）
- enable-over-constrain：删掉它，CLAUDE.md §一 + Constitution §二.1 仍覆盖 90% 行为；剩下 10% 是项目特有阈值。

**B. Scope 门槛**：
- Multi-project evidence：仅本项目 1 次。
- Project-agnostic content：not satisfied（"路径 B 务实开工"是 Ensemble 单人项目特性，不可外推）。

**结论**：**拒绝 → 不规范化为独立 Rule**。理由：
1. 与 Constitution §一.4 + §二.1 "慷慨发布、精准拆解"已大幅重叠
2. 关键差异化部分（目标分阈值 + 路径 B）是项目特有
3. 走 Memory（项目级偏好）更合适——Stage 1C 也是这个判断（已划入 PREF-PATH-B-PRAGMATIC，仅 Ensemble 适用）

---

### C9 — Revision History 段

**候选**：Decisional 文档每次主版本修订必须在头部加 "Revision History V_n→V_{n+1}" 段，列本版相对上版的关键变更。

**A. 内容门槛**：
- 可泛化：YES — 任何长寿命 Decisional 文档（spec / 学术 / PRD）。
- 违反代价：评审 SubAgent / 对齐 SubAgent 找 diff 工作量翻倍 + 容易漏。
- 独立可执行：YES。
- **不重复**：与 9 条现有 Rule 无重叠。但 **本条更接近 C2（cross-document cascade discipline）的实施细节**——cascade footprint 的载体就是 Revision History。
- enable-over-constrain：单独删掉它，对齐 SubAgent / 评审 SubAgent 的工作仍可做但效率低。

**B. Scope 门槛**：
- Multi-project evidence：仅本项目 1 次（V1→V2→V3 三版迭代）。

**结论**：**合并到 C2 → 不独立成 Rule**。理由：
1. Revision History 是 cascade footprint 的载体形式之一，已在 C2 草稿中作为关键动作 (1) 提到
2. 单独立 Rule 会与 C2 形成"同主题双源"
3. 直接在 C2 中保留对 Revision History 段的具体格式要求

**动作**：在 C2 的 Rule 草稿中保留 "在 Revision History 中显式声明 cascade footprint" 的指引，不另起 Rule。

---

### C10 — 诚实精度撤回

**候选**：当一个数值/公式/等价声称的精度超出实际可证伪范围时，主动退到诚实定性是正确动作；评审 SubAgent 指出"精度超过证据"时，作者方应优先撤回而非补数据。

**A. 内容门槛**：
- 可泛化：YES — 学术 / benchmark / spec / 任何带数值精度声称。
- 违反代价：作者倾向加更多数字让虚假精确变真，反复迭代后 spec 越来越复杂但仍含错误声称。
- 独立可执行：marginal — "撤回 vs 加数据"是判断，不是机械动作。
- **不重复**：与 C4（数值等价性需复现）**部分重叠**——C4 是"必须复现 evidence；不能复现就退定性"，本条是"评审指出虚假精度时优先撤回"——C4 已隐含本条的核心动作（"无复现 → 退定性"）。
- enable-over-constrain：删掉它，C4 + `Global Rules.md` "先调查后回答"已覆盖（"承认不知道好过假装知道"）。

**B. Scope 门槛**：
- Multi-project evidence：仅本项目 1 次。

**结论**：**合并到 C4 → 不独立成 Rule**。理由：
1. C4 已包含核心动作（"无复现 → 退定性"）
2. 本条强调的"评审驱动撤回 vs 补数据"是 C4 的实施判断
3. 直接在 C4 草稿中保留"在伪精确与诚实定性之间主动选诚实定性"的指引

**动作**：在 C4 草稿中已保留相关措辞，不另起 Rule。

---

## 三、决议汇总

### 通过门槛、推荐创建的 Rule

| ID | 文件名 | Scope | 主题 |
|---|---|---|---|
| **R1** | `fallback-path-must-be-unreachable-in-test.md` | project | 测试隔离 negative guarantee |
| **R2** | `cross-document-cascade-discipline.md` | project | 跨文档级联同步 + 对齐 SubAgent + Revision History |
| **R3** | `verify-third-party-behavior-firsthand.md` | project | 库/跨层行为一手验证 |
| **R4** | `validate-numerical-equivalence-claims.md` | project | 数值等价性需复现 + 诚实精度撤回 |
| **R5** | `grep-before-enumerate-shared-resource.md` | project | 共享资源约束规划前 grep |

**共 5 条，全部项目级**。

### 拒绝的候选

| 候选 | 拒绝原因 | 替代 |
|---|---|---|
| C5 用户反馈先调研根因 | 与 Global Rules.md "Investigate Before Answering" 重叠 + 偏向用户偏好性质 + 仅项目单次证据 | Memory（已在 1C） |
| C6 SubAgent 必读清单格式 | CLAUDE.md §二.2 已覆盖核心原则，本条是格式细化 | Memory or Constitution 内嵌 |
| C8 多轮评审到目标分 | 与 CLAUDE.md §一.4 + §二.1 重叠 + 关键差异化部分（路径 B）是项目特有 | Memory（已在 1C） |
| C9 Revision History | C2 cascade discipline 的实施细节，单独立 Rule 会形成同主题双源 | 合并入 R2 |
| C10 诚实精度撤回 | C4 已隐含核心动作（无复现→退定性） | 合并入 R4 |

---

## 四、Global Rule 评估

按 `persistence-system.md` 严格门槛 (multi-project evidence + project-agnostic + cross-domain)：

**结论：本次 0 条达 Global Rule 标准。**

逐条审视：
- R1 测试隔离：仅本项目 1 次实证。Stage 1A "Tauri/Rust/CLI 都会撞" 是 generic 措辞，不是 multi-project evidence。**Project**。
- R2 跨文档 cascade：仅本项目 1 次。Stage 1B 推断"学术综述同适用"也是 generic abstraction。**Project**。
- R3 第三方行为一手验证：本项目 1 次（dnd-kit）+ academic-reference-verification.md 是同原则不同载体的早期证据，但学术 citation 已自成 global Rule，本条目前评估按 Project。**Project**。
- R4 数值等价复现：仅本项目 1 次。**Project**。
- R5 grep before enumerate：仅本项目 1 次。**Project**。

**任何一条满足"在第二个独立项目再现同模式"时，可按 persistence-system 升级路径 promote 到 global。** 本次不升级。

---

## 五、关于项目级 `.claude/rules/` 不存在的处置

当前 `/Users/bo/Documents/Development/Ensemble/Ensemble2/.claude/rules/` 目录不存在。Stage 3 落盘时需要先创建目录。这是新建动作，没有 break 任何既有结构。

---

## 六、总结

- **通过门槛、推荐创建**：**5 条项目级 Rule**（R1-R5）
- **拒绝**：**5 条候选**（C5/C6/C8 走 Memory，C9 合并 R2，C10 合并 R4）
- **Global Rule**：**0 条** — 本次没有任何模式满足"multi-project evidence + project-agnostic + cross-domain"全 3 标准
- **执行注意**：写 Rule 时必须按 persistence-system.md "Required: Report Before Creating" 要求——即便项目级，也建议主 Agent 在 Stage 3 落盘前向用户确认 5 条 Rule 的措辞与边界

---

## 七、Stage 3 行动建议（供主 Agent 参考）

1. 创建项目级 `.claude/rules/` 目录
2. 按上述 R1-R5 草稿写 5 个 Rule 文件（落盘前可让用户审 1 轮）
3. Stage 1C 的 Memory 项独立落盘到 `~/.claude/projects/-Users-bo-Documents-Development-Ensemble-Ensemble2/memory/`
4. 不修改 `~/.claude/rules/` 任何文件（无 global 升级）
5. 不修改 `~/.claude/CLAUDE.md`（Constitution 已覆盖大部分元规则；本次 5 条 Rule 是细化补充，不动 Constitution）
