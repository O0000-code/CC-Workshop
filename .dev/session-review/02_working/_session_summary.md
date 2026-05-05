# Session 2 复盘 — 最终汇总

> Session: Category Hierarchy（depth=2 嵌套分类 + drop-into 拖拽）  
> 资源：~$400 + 8h 实测时间 + 1 次 build/install ≈ 5 次  
> 产出：1 commit (`a4cdcf7`) + 4 Rule 修订 + 7 Memory 变更 + 27 调研/spec/plan 文档  
> 用户评价："对实现这么一个小功能来说，这种消耗过于夸张"

---

## 1. 返工分析表

> 来源：`session_review_s1_rework.md`（10 事件 + 4 共性根因）

| # | 表象 | 根因 | 可规范化？ |
|---|---|---|---|
| 1 | drop-into 5 轮反复修（用户实测才修对） | spec 阶段未识别 promote/demote **非对称语义**：promote = 撤销 demote 不需重复确认手势 | YES → 已写入 `feedback_user_test_outranks_reviewer.md` |
| 2 | 04 V1 implementation_plan 写到 64K token 上限**失败** | 把 03 tech plan 内容粘进任务卡，混淆了 plan（导航图）与 spec（详细教程） | YES → 已扩 `plan-document-style.md` 到 spec/tech plan + 1.5x 行数自检 |
| 3 | "前次修复只是注释 / 视觉改动，没修实质" → 用户："没区别" | 主 Agent 信任 SubAgent 自评（"已修"措辞 / 测试绿 / console 输出），未亲自核对修复路径 | YES → 已新建 `fix-must-define-user-observable-success.md` |
| 4 | V1 评审 6 reviewer 找出 22 P0 → V2 patch 链返工 ~2-3h | V1 spec 写出来时未把 R1-R7 调研的 risk 当作硬约束 cross-check；reviewer 复读 R1 才识别 | YES → 已扩 `plan-as-research-design.md` 加双 artifact: `_synthesis_decisions.md` + `_risk_distillation.md` |
| 5 | V2→V3 cascade 不全（doc comment / test name 漏改） | cascade discipline 只覆盖 .md 文档，不覆盖 source-level binding artifacts | YES → 已扩 `cross-document-cascade-discipline.md` cascade scope 到 5 类 binding artifacts + 反向 grep |
| 6 | "Phase 间反复审核" → 用户："整体完成后审核就行" | 主 Agent 主动加了 phase-by-phase 流程，与用户期望相反 | YES → 已修订 `feedback_phase_review_loop.md`（标题/正文统一为"末端单审"） |
| 7 | 多次 build + install + 等用户实测（每轮 5 分钟全编 + 用户操作）| 错误工具选择：bug-fix 周期应走 `npm run tauri dev` HMR，不走 release build | YES → 已加入 MEMORY.md "Build & Deploy" 段（dev mode 优先） |
| 8 | infinite loop in handleDragMove + 4 P0 一起爆（line 237 dispatchSetState）| React 18 + StrictMode + dnd-kit MeasuringStrategy.Always + setState in handler 共同放大；缺 ref + bail-on-unchanged 防御 | NO（具体技术细节，已在代码注释 + 02 V2.1 spec 体现） |
| 9 | 主 Agent 加 console.warn 诊断 → 用户开 DevTools 看 → bug 锁定 → 移除 | 流程对（实测 = ground truth），但 console.warn 的"加 / 移"循环本可一次到位 | NO（个案，已含在 fix-must-define-user-observable-success） |
| 10 | 用户两次反馈"没区别" / "我没修复成功" | 修 getProjection 但没改 drop 路径；视觉修了实质未修 | YES（与 #3 同根因，由同一 Rule 覆盖） |

**核心规律**：用户 8h 中 ~3-4h 是返工（30%-50%）。最大单点损失是 **#1 + #4**（spec 未识别 risk + 范式错位），约 ~$120-150。

---

## 2. 方法论发现表

> 来源：`session_review_s1_methodology.md`（6 模式 + 3 编排浪费）

| 类型 | 发现 | 可迁移抽象 | 去向 |
|---|---|---|---|
| 高 ROI | R7 设计哲学蒸馏 → `design-language.md`（项目 Rule，每 session 加载） | 长寿命设计标准应从代码中蒸馏成可加载 Rule | 已落（design-language.md + reference_design_documentation_locations） |
| 高 ROI | 主 Agent 亲笔写 `_synthesis_decisions.md` + `_v2_patch_plan.md`（不外包整合层） | 多 SubAgent 并行后的冲突仲裁文档由 lead agent 亲笔，下游只读这层 | 已扩入 `plan-as-research-design.md` Layer 2 双 artifact 段 |
| 失败→修正 | 04 V1 64K 失败 → V2 343 行 | Plan 是导航图不是教程；spec 同理超 1.5x 触发自检 | 已扩入 `plan-document-style.md`（scope + 行数 + 膨胀自检） |
| 失败→修正 | "Phase 间反复审核" → "末端单审" | 末端审核覆盖率高于过程审核；过程审核易导致重复评审同范围 | 已修订 `feedback_phase_review_loop.md` |
| 编排浪费 | 7 个 wave 1 SubAgent **应是 4 个**（R3↔R7 / R4↔R6 重叠） | SubAgent 拆分应按"独立信息源"而非"显得调研充分" | 已含在 `feedback_calibrate_research_depth_to_task.md`（项目级证据） |
| 编排浪费 | 6 reviewer 评 V1 spec → 全部 P0 重复 | reviewer 数量与 spec 体量正反馈循环；spec 简洁 → reviewer 少 | 已含在 `plan-document-style.md` Why 段 |
| 编排浪费 | 未派"自动化 acceptance SubAgent" → ~2h 用户手动验证 | 可机器验的 acceptance（DOM/CSS/timing 数值）应有 SubAgent 验过再交用户 | NO Rule（任务特异，已项目级标注） |
| 元教训 | 21,179 行规划文档 实施 600 LoC Rust + 1200 LoC TS：**规划:代码 ≈ 12:1** | 任务三档分类 — Creative(6步)/Structural(3-4步)/Maintenance(直接做) | 已扩 global Rule `plan-as-research-design.md` Task Complexity Tiers 段 |
| 元教训 | 误用 sidebar-reorder 创造性范式套到结构性扩展任务 | 中等复杂度结构性任务遗漏档；现有"skip / use research-first" 二档过粗 | 已含在三档分类 + Mid-task Re-classification Trigger |
| 技术陷阱 | dnd-kit `closestCenter` vertical reorder 让位后 over === active | 拖入语义场景下 V3 reorder guard "active.id !== over.id" 跳过 IPC | NO（已在 SortableCategoriesList.tsx 注释 + V2.1 spec 锁定） |
| 技术陷阱 | React + StrictMode + dnd-kit Always-measure → setState in handler 死循环 | 任何 dnd-kit handler 中读 React state 应优先 ref + bail-on-unchanged | NO（已在 SortableCategoriesList.tsx 实现 + 注释） |

---

## 3. 保存清单（写入了什么 / 写到哪里 / 固化什么）

### Rule（4 处变更，全部已 Edit/Write 落盘）

| 文件 | 类型 | 行数 | 固化的内容 |
|---|---|---|---|
| `~/.claude/rules/plan-as-research-design.md` | 修订（global P0）| 68 | **任务三档分类**（Creative/Structural/Maintenance）+ Mid-task Re-classification + 双 artifact Synthesis Gate |
| `.claude/rules/cross-document-cascade-discipline.md` | 修订（project P0）| 65 | Cascade scope 扩到 5 类 binding artifacts（doc comments / test names / commit messages / SubAgent prompts）+ 反向 grep 命令模板 |
| `.claude/rules/plan-document-style.md` | 修订（project P1）| 56 | Scope 扩到 spec/tech plan + 02/03 ≤ 1500 行硬上限 + 4 条膨胀自检触发清单 |
| `.claude/rules/fix-must-define-user-observable-success.md` | 新建（project P1）| 49 | "User action / Observable change / Anti-observation"三行契约；console / 单测 / jsdom 不构成验证 |

### Memory（7 处变更）

| 文件 | 类型 | 优先级 | 防止/固化什么 |
|---|---|---|---|
| `feedback_phase_review_loop.md` | 修订（P0 误植修复） | — | 标题与正文矛盾的自我误植；明确"末端单审"+ Phase 1 数据安全例外 |
| `feedback_research_before_bug_fix.md` | 修订（P1 加边界） | — | 用户已给根因 + "should be X" 句式 → 跳过调研直接修 |
| `project_ensemble_pragmatic_execution.md` | 修订（P1 加反例） | — | 强先例任务（V3 已锁不变量）不启动重型评审循环 |
| `feedback_verify_fix_actually_applies.md` | 新建（P0） | 高 | 修复完成后主 Agent 必须**亲自核对路径**，不接受"已修"措辞 / console 输出 / 测试绿 |
| `feedback_calibrate_research_depth_to_task.md` | 新建（P0） | 高 | 任务规划深度按三档分类；强先例任务不走重型评审；本 session 12:1 规划:代码比作为反例 |
| `feedback_user_test_outranks_reviewer.md` | 新建（P0） | 高 | 用户实测 = ground truth；冲突时优先做用户反馈，reviewer 清单进 backlog |
| `reference_design_documentation_locations.md` | 新建（P1，**用户明确要求沉淀**）| 中 | design 文档导航：design-language Rule + sidebar-reorder V3 + category-hierarchy V2.1 + index.css token |
| MEMORY.md "Build & Deploy" 段 | 就地补强 | — | dev mode 优先 + 主 Agent 主动 build + install |
| MEMORY.md "Topic memories" 段 | 重组 | — | 4 新建链接 + 新建 "Reference / index" 子段 |

---

## 4. 不保存清单（刻意不保存什么 / 为什么）

> 来源：`session_review_s2_do_not_save.md`（32 条 + 3 边缘 case + 6 trap 警告）

| 类别 | 条目数 | 为什么不保存 |
|---|---|---|
| A. 已在代码 / spec 中体现 | 8 | 代码注释 + 02 V2.1 spec + 03 V2 plan 完整记录；Memory 重复 = 信噪比下降 |
| B. Git 历史可查 | 3 | `a4cdcf7` commit body 已含完整 phase 描述 |
| C. 现有 Rule 已覆盖 | 8 | grep-before-enumerate / fallback-path / verify-third-party / validate-numerical-equivalence 等都已存在 |
| D. 临时调试态 | 6 | console.warn 加/移流程、build/install md5、reviewer 自评 confidence、各轮 P0 编号——都是一次性 |
| E. 可重新提取 | 4 | index.css token / V3 不变量 23 项 / hierarchy validator 6 规则——直接读源文件 |
| F. 太特定 / 长尾 | 10 | 本 session 用 7 SubAgent / dot 居中 / 等等——单实例 |
| G. "误判偏好"陷阱（阶段 1C 识别）| 3 | V2.1 修订循环 / 4 件套结构 / phase-by-phase 容忍——是返工/工作方式不是偏好 |

**3 边缘 case（决议方向）**：
- `_risk_distillation.md` 是否独立 Rule → **暂不立**（已并入 plan-as-research-design.md 双 artifact 段）
- Symmetric inverse operation（promote/demote 非对称）作为通用决策点 Rule → **项目级**（单证据，跨项目证据后再升 global）
- 评审 SubAgent 数量随 P0 收敛缩减 → **不立 Memory**（数字 6→1 不能跨项目泛化）

**6 trap 警告**（写入 do-not-save 文件末尾）：核心是阶段 1D 决议任何 Memory 候选时必须反向核对——候选是否实际上是"误判偏好"的换皮。

---

## 5. 评审记录

> 来源：`session_review_s4_audit.md`

| 轮次 | 修订项数 | 改了什么 |
|---|---|---|
| 第 1 轮（发现 + 修订）| 6 | (1) Memory `feedback_calibrate_research_depth_to_task` 与 Rule `plan-as-research-design.md` 冗余 → Memory 改为"项目特定实例化 + 用户反馈证据"形式；(2) Rule MOD-2 缺"开始时如何判定档位"标准 → 加 Tier Judgment Heuristic 段；(3) MOD-1 cascade scope 5 类论据强弱不一 → 拆 MUST-cover (3) + Additionally (2)；(4) `project_ensemble_pragmatic_execution.md` description 未反映新增段 → 更新；(5) NEW-1 "User" 未明示是最终用户 → 加澄清；(6) MOD-3 1500 行硬上限是否过硬 → 改为"1.5x 触发自检"非禁止 |
| 第 2 轮（自审引入新问题）| 3 | (1) MOD-1 "two MUST-cover" 与列了 3 矛盾 → 删 "two"；(2) MOD-2 "downgrade rather than upgrade" cryptic → 改为 "lower-ceremony tier"；(3) Memory 三档表格"实施模式"列与 Rule 重叠 → 删列保持一致 |
| 第 3 轮（最终复检）| 0 | 全部修订 self-contained，0 新问题 |

**最终评审结论**：**approved**（无未解决项 / 无待用户裁决）

---

## 元结论：本次 session 浪费的真实根因

阶段 1B 的元教训："**方法用在了不需要的任务上**"——21,179 行规划文档实施一个 600 LoC Rust + 1200 LoC TS 的功能，规划:代码 ≈ 12:1。

具体来说，本次 session 的 ~$400 / 8h 中：
- ~50% 是必要支出（调研 + 关键 reviewer + final_audit + 关键 implementation + 实测验证）
- ~30% 是过度规划（误用创造性 6 步范式套结构性扩展任务；6 reviewer 评 V1 等）
- ~20% 是返工（V1 没识别 risk → V2 patch 链 / drop-into 5 轮反复修 / phase-by-phase 容忍）

**理想中间路径估算**：4-5h 完成同等代码质量。

**最高 leverage 修订**：global Rule `plan-as-research-design.md` 三档分类 —— 直接预防"误用范式"的复发，是本次复盘最值得固化的成果。

**用户明确要求的沉淀** `design-language.md`（Rule，每 session 加载）+ `reference_design_documentation_locations.md`（Memory 索引）—— 让未来 session 知道"这份高分辨率设计文档在哪"，最大化已经付出的调研价值。
