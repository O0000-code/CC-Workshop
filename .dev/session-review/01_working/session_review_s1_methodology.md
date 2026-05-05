# Stage 1B — 方法论提取

> 输入材料：`_session_summary.md`、`04_implementation_plan.md` V3、`05_review/v3_final_review.md`、`05_review/06_v3_alignment_check.md`、`06_snap_research.md`、user Constitution、`persistence-system.md`、`plan-as-research-design.md`、`document-authority-ranking.md`。
> 评估标准：**抽象去掉本次具体细节后还成立**——必须能说出"这在 UI 工程之外的什么领域也用得上"。答不上来的就剔除。

---

## 发现清单（按可迁移度排序）

---

### #1 P6 ⇒ 反馈接收反射：先调研根因，再选解法

- **本次具体表现**：用户报"磁吸非常生硬，几乎没有动效"。主 Agent 没有立刻去调 `LERP_FACTOR` 或换 `cubic-bezier` 参数，而是先派一个调研 SubAgent 一手读 dnd-kit 源码（`core.esm.js`），同时核对项目当前 CSS。结果发现两条根因：(a) `defaultTransition` 鼠标拖拽时返回 `undefined`，(b) `snapModifier.ts` 顶部那行注释"DragOverlay's intrinsic CSS transition on transform"是错的。修复路径从"参数微调"变为"软引力 + 帧间 lerp 重写整个 modifier"。
- **可迁移的抽象**：当反馈以**主观负面感受**形式出现（"生硬"、"不对"、"卡"、"读不通"），第一反应必须是"为什么会出现这个感受"而不是"调哪个参数能消除这个感受"。在没有定位根因前的任何参数调整，都是在猜——猜对的概率随系统复杂度反比下降。
- **适用类别**：UI/动效调优；性能 bug；学术综述被审稿人评"论证不清"；产品试用反馈"不顺手"；任何"症状 → 多个可能根因"的诊断场景。
- **去向建议**：**项目 Rule**（`./.claude/rules/feedback-triage-research-first.md`）。理由：这是高 leverage 行为模式，但目前只有本项目一个证据点（候选模式编号 P6 仅本项目）。按 `persistence-system.md` 的"默认项目级，多项目证据后再升级全局"的纪律，先落项目。
- **如果不固化的损失**：下次反馈一来，主 Agent 先入为主认为"知道是什么问题"，去改一两个参数，浪费 2-3 轮再退回来调研根因。本次磁吸如果直接改 `LERP_FACTOR=0.2`，根本无效——根因不是 lerp 系数，是 modifier 把 transform 钉死在 slot 中心 1 帧后又跳回。

**Cross-domain test**：学术写作里读者反馈"读不懂第三章"——是结构问题、术语问题、还是论证跳跃？参数微调（换几个词）vs 根因调研（重读全章看是哪种问题）是同一组对立。✓

---

### #2 P8 + 一手验证库实际行为，不信文档与注释

- **本次具体表现**：dnd-kit 的 `defaultTransition` 在鼠标活化器下返回 `undefined`（不是文档暗示的"自带 transition"）；`Over.rect` 类型为非 nullable 但 V3 §11 还写了 `if (!overRect) return transform;`；项目自己的 `snapModifier.ts` 注释撒谎说"intrinsic CSS transition"。三处都需要读源码才确认。
- **可迁移的抽象**：**写代码、写 spec 时引用的"库行为"，必须以读源码或类型为准，不以文档、tutorial、AI 推理、自己之前写的注释为准**。注释和文档可能撒谎、可能滞后于版本、可能在版本升级后偏离实际。任何动效、并发、底层 API 集成的方案都必须有一手验证步骤。
- **适用类别**：动效/动画库集成；并发/锁/原子操作的语义；浏览器 API 行为；Rust unsafe 边界；学术引用（标题/作者/年份/期刊不能信 AI 输出，必须查 DOI 数据库）；任何对外部 source-of-truth 的 reliance。
- **去向建议**：**项目 Rule**（`./.claude/rules/verify-library-behavior-firsthand.md`）扩展现有的 `Global Rules.md` 的"先调查后回答"。本次特别价值是把"读源码确认"作为**spec 合格的硬要求**，不只是回答前的调研。同时也匹配现有 `academic-reference-verification.md` 的精神。
- **如果不固化的损失**：spec 通过审查但实施时 SubAgent 撞到"文档/注释 vs 实际行为"分裂，回到 spec 修订（V2 → V3 → 06_snap_research 三轮迭代有相当部分本可避免）。

**Cross-domain test**：学术 citation 验证（不信 AI 给的标题，必须查 OpenAlex DOI）已经是 cross-domain 公认实践（已有 `academic-reference-verification.md`）。这是同一原则在工程域的延伸。✓

---

### #3 P3 ⇒ 文档版本一致性单独检查环节（T0 alignment SubAgent）

- **本次具体表现**：V2 → V3 修订完三份文档（02 design、03 tech、04 impl），主 Agent 派一个独立 SubAgent 单做"文档对齐检查"。结果抓到 04 实施规划没跟上 V3 修订（T8 modifiers 配置仍是 V2、T13b acceptance #4/#8 仍是 V2 表述）——3 个 P0 阻断点，主 Agent 实施前 30 分钟修完，避免实施到 T8 阶段才撞墙。
- **可迁移的抽象**：**当一组相关文档共同构成"决策真理"且经历多版迭代后，发布"对齐检查 SubAgent"是独立必备环节**。这个 SubAgent 不评内容质量、不评工程可行性，只做一件事：跨文档比对，找过时引用、版本错配、互相矛盾。这与 V3 final review（评质量）是不同任务，必须分开。
- **适用类别**：multi-doc 项目（spec + plan + impl checklist 三件套）；学术 multi-section 论文（abstract / intro / discussion 互相引用，最后一轮修改后核对一致）；产品文档（feature spec + API doc + user guide）；任何"主文档迭代后多个附属文档容易滞后"的场景。
- **去向建议**：**项目 Rule**（`./.claude/rules/cross-document-alignment-gate.md`）。规定："当 ≥ 2 份核心 Decisional 文档完成新版迭代后、进入实施前，必须发布单独的对齐检查 SubAgent，输出对齐表 + P0 矛盾清单"。
- **如果不固化的损失**：本次 V3 final review 已经 9.5 分判定可实施，主 Agent 当时未发现 04 与 02/03 的版本错配——若直接进入 T1 → T8，T8 SubAgent 按 04 写就重现 V2 P0（restrictToVerticalAxis 卡 X=0），到 T13b 用户验证才发现，回滚成本远超 30 分钟。

**Cross-domain test**：学术综述 V2 → V3 改 introduction 的核心定义后，必须独立扫一遍所有引用该定义的章节看是否还自洽——是同一行为。✓ 已有 `document-authority-ranking.md` 解决"哪份文档说了算"，但**没解决"它们之间是否一致"**——这是不同问题，互补不重叠。

---

### #4 P2 ⇒ 诚实撤销虚假精确声称（精度撤回模式）

- **本次具体表现**：V2 spec 声称 spring `{280, 32}` 与 cubic-bezier "等价"。V3 修订时撤销该声称，改为"形态相近的备选，不强求精确等价；如未来切 motion 库需重新设计曲线"。这是从"伪精确"主动退到"诚实定性"。同时撤销了"~0.5% spring overshoot"（实测 0.0035% 不可感知）的虚假数值。
- **可迁移的抽象**：**伪精确比承认不知道更危险。当一个数值/公式/等价声称的精度超出实际可证伪范围时，主动退到诚实定性是正确动作，不是退步。** 这需要"对自己之前的写作进行二次质量审查"的能力——而这种审查只能由独立评审 SubAgent 触发，因为原作者(包括前几轮 SubAgent)对自己的精确措辞有 sunk cost。
- **适用类别**：动效/物理参数（"等价"、"匹配"声称）；性能 benchmark（"提升 X%"，但 X 在噪声范围内）；学术综述（"研究表明 X 与 Y 显著相关"——但显著性是 p=0.04 还是 p<0.001？）；任何把"近似关系"包装成"等价/严格/精确"的语言。
- **去向建议**：**项目 Rule**（`./.claude/rules/honest-precision-retraction.md`）。规则：当评审 SubAgent 指出某声称"精度超过证据"，作者方应优先选择"撤回声称、退到定性表达"，而不是"再补一组数据/参数让声称看起来对"。这种纪律对自我审查特别有用。
- **如果不固化的损失**：作者(Agent)倾向于"加更多数字让虚假精确变真"，反复迭代后 spec 越来越复杂但仍含错误声称。本次 V2 → V3 的 Animation 评分 6.0 → 9.0（最大单次跃升）核心来自这一动作。

**Cross-domain test**：学术写作里"我们的方法比 baseline 显著好" vs "我们的方法在 X 维度好、Y 维度持平、Z 维度劣"——后者是诚实退回，前者是伪精确。✓

---

### #5 P9 ⇒ 兜底路径必须在测试态可证不可达（防御层级反向证伪）

- **本次具体表现**：F1 重大事故——SubAgent 写的 Rust 测试依赖 env var，但路径函数有 fallback：`std::env::var("ENSEMBLE_DATA_DIR").unwrap_or_else(|_| <真实 ~/.ensemble/>)`。如果测试 setup 漏 set env var，就静默写到用户真实数据目录。修复：在 `cfg(test)` 下让函数 panic 而不是 fallback。
- **可迁移的抽象**：**任何"安全 fallback 路径"在测试/隔离环境下必须可证伪不可达，否则它就不是 fallback 而是可触发的真实路径**。具体方法：一层 env var override + 一层 `cfg(test)` panic 兜底。仅靠"约定测试要 set env var"是约定，不是隔离。
- **适用类别**：数据存储路径（绝对场景）；网络请求 mock vs 真请求；外部 API 调用 stub；任何"开发者不小心调到真实资源"的可能性；CI 环境与本地环境差异。
- **去向建议**：**项目 Rule**（`./.claude/rules/fallback-path-must-be-unreachable-in-test.md`）。规则："任何写真实文件、发真实 IPC、调真实外部资源的函数，必须在 cfg(test)/test build 下 panic 或抛异常作为最后一层防护，而不是 fallback 到真实资源"。
- **如果不固化的损失**：本次损失就是用户全部 Categories/Tags/Scenes 数据被覆盖。下次换不同的"真实资源"（Stripe API、生产数据库、用户配置）会重演。这是单次伤害极高的事故类。

**Cross-domain test**：学术写作里测试新分析脚本时不小心写到 final 数据集——同样是"测试态访问真实资源"的反模式。但这条更偏工程，cross-domain 应用相对窄。✓（保留但偏 Project Rule）

---

### #6 P4 ⇒ 实施任务卡顶部必带"必读上下文清单"

- **本次具体表现**：04 V1 实施规划没列必读上下文；T0 对齐 SubAgent 抓出 04 内容残留 V2、SubAgent 默认按 V2 实施会重现 P0 bug。V3 修订后每个任务卡顶部加"必读上下文清单（按顺序读完再开工）"，包含 design spec 章节号、tech plan 章节号、相关现有文件路径。
- **可迁移的抽象**：**SubAgent prompt 不能只放任务描述，必须把"上下文边界"显式放在 prompt 顶部、按顺序排列、链接到具体章节号**。没有显式必读，SubAgent 默认跳读或按训练记忆补，质量必然偏移。Constitution §二.2 已规定"对间接相关但能提升理解的材料，必须显式要求阅读"，本次的强化是"加到任务卡里、按顺序、点到章节号"。
- **适用类别**：任何 SubAgent 投递；学术任务的助手分工；跨人协作的工程任务交接；新员工 onboarding 任务清单。
- **去向建议**：**这条已在 user Constitution §二.2 覆盖**，本次的具体强化是"按顺序、点章节号、放任务卡顶部"。建议在 Constitution 现有条目下加一句"必读清单按阅读顺序排列、引用到具体章节号、放任务卡顶部"。或单独建项目 Rule `./.claude/rules/required-reading-list-format.md`。倾向后者——避免改动 Constitution。
- **如果不固化的损失**：清单存在但不按顺序、不点章节号、被埋在任务描述底部，等于没有——SubAgent 默认跳过或读浅。本次 04 V1 这个具体形式的失败可证。

**Cross-domain test**：学术综述派给 SubAgent 写第三章时，告诉它"读 chapter 1-2 + 5 篇 reference paper"——如果不点页码/章节号、不排序，SubAgent 还是会跳读。同理。✓

---

### #7 P10 ⇒ 演进文档自带"Revision History"段（变更轨迹内嵌）

- **本次具体表现**：V3 三份文档头部均加 "Revision History V2→V3" 段，列出"按评审单 P0 编号修了哪些"。终审 SubAgent 直接核对这些修复点是否真的闭环（验 V3 final review 的全部 P0 闭环判定就基于此）。
- **可迁移的抽象**：**长寿命的 Decisional 文档每次修订必须自带变更日志段**。这与 git commit history 不同——commit history 是 diff 视图（机器可读、机器视角），Revision History 是"哪些设计决策从什么改成什么、为什么"（人/Agent 可读、决策视角）。下游评审/对齐 SubAgent 第一动作就是读这段。
- **适用类别**：spec 文档；学术论文的版本演进；产品 PRD；多轮调优后的算法文档；任何"经历多版本迭代且需被独立评审/二次使用"的文档。
- **去向建议**：**项目 Rule**（`./.claude/rules/revision-history-in-evolving-docs.md`）。规则："Decisional 文档每次主版本修订（V1 → V2、V2 → V3 等）必须在头部加 Revision History 段，列出本版相对上版的关键变更（按评审或修订点 ID 编号）"。
- **如果不固化的损失**：评审 SubAgent 必须从头读全文找 diff，工作量翻倍且容易漏；对齐 SubAgent 不知道"V2→V3 改了哪些"无法定位是否传染到附属文档。

**Cross-domain test**：学术综述每版加"V1→V2 changelog（按审稿人 comment 编号）"是顶级期刊投稿的标准实践。✓

---

### #8 P1 ⇒ 多轮评审驱动收敛到目标分（评审-修订-复评循环）

- **本次具体表现**：V1 6.6/10（5 SubAgent 评审，23 P0）→ V2 8.0/10（3 SubAgent 复评，仍多 P0）→ V3 9.5/10（终审通过）。3 轮评审驱动质量从"差"到"接近完美"。用户接受 V3 的"务实开工"（路径 B）也是这套机制的产物——明确分数让"是否达标"从主观判断变客观决策。
- **可迁移的抽象**：**多维度创意输出的质量收敛需要"独立评审+定量评分+迭代修订"的机制，不是"作者反复自查"**。关键点：(a) 评审是独立 SubAgent，不是作者自审；(b) 评分是多维度（design/animation/architecture/regression/feasibility），不是单一"好/不好"；(c) 评审给出 P0/P1/P2 优先级清单，作者修订有抓手；(d) 设定阈值（如 9/10）作为开工门，但允许"路径 B"务实开工。
- **适用类别**：spec 设计；学术论文（peer review = 同一机制）；产品/UI 设计 critique；研究方案；任何"质量是多维度且需要外部视角"的产出。
- **去向建议**：**项目 Rule**（`./.claude/rules/iterative-review-to-target-score.md`）。规则："对要求最高质量的 Decisional 文档，使用'多维度评审 SubAgent → 修订 → 复评'循环，每轮设定目标分（如 9/10），允许'路径 B 务实开工'退出但需用户确认"。
- **如果不固化的损失**：作者反复自查容易 sunk cost，看不出自己的盲点；下次类似任务又重新设计评审机制。

**Cross-domain test**：学术论文 peer review = 同样机制（reviewer 给 minor/major revision 分级，作者 response letter 逐条回复）。✓

---

### #9 P7 ⇒ 多视角评审最低 5 维度（设计 / 架构 / 回归 / 动效 / 可行性）

- **本次具体表现**：V1 评审派 5 个并行 SubAgent，分别从 design、animation、architecture、regression、feasibility 五个维度独立审。每个维度都给出独立 P0 清单。如果只派一个综合评审，会丢失 60-80% 的 P0（每个评审 SubAgent 在自己擅长维度有 3-5 倍 sensitivity）。
- **可迁移的抽象**：**复杂创意产出的评审，单一综合 SubAgent 视角必然窄，必须按维度分派 5+ 独立评审**。维度划分以"独立 expert lens"为准——design lens 看 visual hierarchy 不会去查 race condition，architecture lens 看并发安全不会去看 micro-interaction 物理感。
- **适用类别**：spec 评审；学术综述评审（理论维度 / 方法维度 / 样本维度 / 写作维度 / 引用准确性维度）；产品 launch readiness review；研究方案评审。
- **去向建议**：**Memory**（不是 Rule）。理由：5 维度的具体划分是项目特定的（UI 工程的 design + animation + architecture + regression + feasibility），跨项目应该是"按 ≥ 5 个独立 expert lens 分派"——但具体维度因任务而异。把"≥ 5 个独立 lens" 这个通用原则写进 user Constitution §二.1（已有"慷慨发布"原则的补充："对评审任务，至少 5 个独立 expert lens"）；具体维度划分留 case-by-case。
- **如果不固化的损失**：本次单一综合评审做过试点（被否决），如果走单一综合路径，V1 → V2 那批 P0 中的 animation 维度（6.0 → 9.0 最大跃升）大概率被埋——毕竟 animation 物理感和 architecture 并发安全完全不是同一种 sensitivity。

**Cross-domain test**：学术综述评审里"理论维度 + 方法维度 + 引用准确性维度 + 写作维度"是 4 维度典型；论文重投时 reviewer 数量 ≥ 3 是顶级期刊标准。同结构。✓

---

### #10 P5 ⇒ SubAgent 顺手修同区域低成本 P1（批量修复触发条件）

- **本次具体表现**：code-reviewer SubAgent 发现 2 个真 P0（DATA_MUTEX 未覆盖 claude_md.rs/trash.rs；onKeyDown shadow KeyboardSensor）。主 Agent 修 P0 时顺手把 P1-2 / P1-3 / P2-3 一并修了——理由：都在同一段代码里、修复成本极低（< 5 行/条）、互不冲突。
- **可迁移的抽象**：**修同一区域的 P0 时，对相邻的 P1/P2 应用"批量修复触发条件"——三条同时成立时一起修：(a) 物理位置相邻（同一文件/同一函数/同一段）；(b) 单条修复成本 < 1 turn；(c) 修复路径不会改变 P0 修复语义（互不冲突）**。三条任一不成立就分开提交。
- **适用类别**：bug fix；refactor；学术论文修订（reviewer 提到"section 3 论证不清"，顺手修同 section 的措辞 P1）；任何"主任务工具链已经打开"的场景。
- **去向建议**：**Memory**（项目内的工程纪律）。理由：这是判断标准而非硬规则，且依赖经验。Constitution 已有"慷慨发布、精准拆解"——本条是"修复任务的精准拆解"具体化。不值得单独 Rule，但写到 Memory 让下次主 Agent 有参考。
- **如果不固化的损失**：要么过度细分（每个 P1 单提交，PR review 累 5 倍）要么过度合并（一个 commit 改 10 处不相关，回滚困难）。

**Cross-domain test**：学术论文修订 reviewer comment 时，相邻段落的小问题一起修是常识，但 cross-section 的不要混进同一 commit。✓

---

### 不纳入清单的候选模式（已评估但未达可迁移标准）

- **"接受 V3 9.5 而非死磕 10/10"**：是用户决策（路径 B），不是方法论。不抽象。
- **"V3 加 Document Authority Ranking 表"**：已在 `document-authority-ranking.md` Rule 中覆盖，本次只是应用。

---

## 编排决策评估

### T0 阶段对齐检查的 ROI

**评估**：极高 ROI。30 分钟工作量阻断了 1 个 P0 bug 重现路径（如果 T8 SubAgent 按 04 写，T13b 用户验证才发现，回滚 T6-T9 4 个组件 + 重做 SortableContext 配置 ≈ 4-6 小时）。**ROI ≈ 8x-12x**。

**判断**：T0 alignment 应作为"V_n → V_{n+1} 修订后实施前"的固定环节（见 #3）。

### T2-T5 4 并行 / T6+T7 / T8+T9 并行的合理性

**T2-T5 4 并行**（依赖 dnd-kit 安装、appStore、CSS、dnd 工具文件夹）：合理。这 4 项产出无相互依赖（T3 read T1 IPC，T2/T4/T5 互不依赖；T5 依赖 T2 的 dnd-kit，但 T2 是单 npm install，可在 T5 SubAgent 内串行处理）。

但严格说，T5 (← T2) 是有依赖的，把 T5 与 T2/T3/T4 并行有风险——T5 SubAgent 如果在 T2 完成前启动 npm install 没生效。本次 T2 包在并行组里能 work 是因为 npm install 在同一发布消息内被快速完成。**潜在改进**：T2 单独串行先发，T3/T4/T5 后并行——更稳健，几秒钟差异。

**T6+T7 并行**（Categories Row + Tags Pill）：合理。完全独立组件、没有相互引用、共享 T5 工具文件夹。

**T8+T9 并行**（Categories List + Tags List）：合理。同上。

**整体编排**：精准拆解，没有"为并行而并行"或"为节省 SubAgent 数而合并"的形式主义。

### 5 评审 SubAgent → 3 复评 → 1 终审是否最优

**5 → 3 → 1 阶梯**：合理。每轮评审任务量随修订收敛而下降（V1 改 23 个 P0 vs V3 改 P1 残留），评审 SubAgent 数量同步下降是 ROI-aware 的——但**核心维度（design/animation/architecture）必须保留独立评审 SubAgent**，不可合并。

V2 复评只保留 3 个评审 SubAgent 是合理收敛（regression 维度在 V2 已 8.7 不需独立 SubAgent，与 architecture 合并）；V3 终审 1 个合并审是因为已接近完美，单一终审能 cover。

**潜在改进**：V3 终审虽然 1 个，但仍是"5 维度并列"输出（v3_final_review.md §5.1-§5.5），相当于在 1 个 SubAgent 内完成 5 维度检查。这是可接受的优化，前提是 prompt 显式要求"每维度独立评分 + 独立 P0 清单"。

### "实施前 / 实施中 / 实施后"三段评审的必要性

**实施前**：5 → 3 → 1 评审驱动 spec 收敛。**必要**——这是核心质量门，没有它实施按错误 spec 跑。

**实施中**：T0 对齐 SubAgent + 各 Phase 间 `tsc + tests + cargo + clippy`。**必要**——T0 抓 spec 一致性，CI 抓代码 quality。

**实施后**：code-reviewer SubAgent + animation reviewer + 用户视觉验证 28 项。**必要**——code reviewer 发现 2 个真 P0（DATA_MUTEX 漏 + KeyboardSensor shadow）；用户视觉验证发现"磁吸生硬"触发 06_snap_research 二次调研。

**整体**：三段评审都不可省。本次失败 F1（数据被覆盖）发生在实施后但根因是测试 setup 阶段，由代码 review SubAgent 应该抓到但漏了——这是评审 prompt 中应显式要求"verify any test that touches real fs paths uses tempdir / env var override"的教训。

---

## 总结

- **共提取 10 个可迁移模式**。
- **其中 7 个值得规范化**（#1-#7），其中 6 个落项目 Rule（`./.claude/rules/`），1 个补 user Constitution 一句（#9）。**3 个落 Memory**（#5、#9、#10 的"5 维度"具体划分部分）。
- **共性主题**：**"防止精度幻觉与版本错配"**——本次 session 的 7/10 个模式都围绕同一基本问题：当多 Agent 协作产出多维度多版本的复杂工件时，"精确措辞 ≠ 真实精确"、"上版本 ≠ 当前版本"、"文档说 ≠ 实际行为"——质量崩塌的常见路径都在这三组幻觉。修复机制几乎都是"独立 SubAgent 做反向证伪"（评审、对齐检查、源码验证、根因调研、撤回伪精确）。这是本次最大的方法论收获。

---

## 附：建议落地清单（供后续 Stage 1C 评估）

| 模式 | 建议去向 | 文件路径 | 优先级 |
|---|---|---|---|
| #1 反馈先调研 | 项目 Rule | `./.claude/rules/feedback-triage-research-first.md` | 高 |
| #2 一手验证库行为 | 项目 Rule | `./.claude/rules/verify-library-behavior-firsthand.md` | 高 |
| #3 跨文档对齐检查 | 项目 Rule | `./.claude/rules/cross-document-alignment-gate.md` | 高 |
| #4 诚实精度撤回 | 项目 Rule | `./.claude/rules/honest-precision-retraction.md` | 中 |
| #5 测试态兜底不可达 | 项目 Rule | `./.claude/rules/fallback-path-must-be-unreachable-in-test.md` | 高（因事故严重性）|
| #6 必读清单格式 | 项目 Rule | `./.claude/rules/required-reading-list-format.md` | 中 |
| #7 Revision History | 项目 Rule | `./.claude/rules/revision-history-in-evolving-docs.md` | 中 |
| #8 多轮评审循环 | 项目 Rule | `./.claude/rules/iterative-review-to-target-score.md` | 中 |
| #9 ≥ 5 lens 评审 | Memory（项目特化）+ Constitution 补一句（通用）| `~/.claude/projects/.../memory/MEMORY.md` 加段 | 低 |
| #10 顺手修 P1 判定 | Memory | `~/.claude/projects/.../memory/MEMORY.md` 加段 | 低 |

**注**：所有项目 Rule 的最终决议应在 Stage 1C 复盘阶段由用户确认；本文仅做提取与建议，不直接落盘 Rule 文件（按 `persistence-system.md` "Required: Report Before Creating"）。
