# Plan Document Style

Plan / Spec / Tech Plan 文档的目的是**方向、范围、注意点、决策注释**，不是代码级别的执行脚本。本规则同时约束：implementation plan（"如何执行"层）、design spec（"做成什么样"层）、tech plan（"系统怎么搭"层）。三类文档的内容职责不同，但**简洁、不重复、不膨胀**的 style 要求统一。

## When this applies

- 撰写任何 `implementation_plan.md` / 工程计划 / 任务卡 / phase plan
- 撰写任何 `design_spec.md` / 设计规约 / 02 spec
- 撰写任何 `tech_plan.md` / 技术方案 / 03 plan
- 撰写"基于已有 spec 安排执行"类的文档

## Principles

- **方向 over 细节**：每个任务卡说"做什么 + 边界 + 风险"，不要把代码实现写出来
- **范围 over 行号**：列出涉及的文件 / 模块 / 概念，不要列每行 LoC 估算
- **重点 over 全面**：突出 P0 决策、易错点、跨任务依赖；琐碎实现细节交给 SubAgent 凭 spec 自驱
- **必读上下文 over 重复内容**：让 SubAgent 读 02 / 03 spec，不要把 spec 内容粘进 plan
- **依赖图必须明确**：哪些任务并行、哪些串行；这是 plan 的核心价值
- **风险登记必须明确**：易错点 + 缓解策略

## Hard limits

行数上限是下限提示，不是上限批准。**超过上限不一定是错——但超过 1.5x 是 "膨胀警报"**：stop 并审视——是否在为"完整性证明"而写而非"决策支持"？是否把 02 / 03 内容粘进了 04？是否把上一轮 reviewer 反馈逐字粘进来当新内容？

- **02 design spec ≤ 1500 行**（V3 sidebar-reorder spec ≈ 1300 行是好 baseline；超 1500 触发膨胀自检）
- **03 tech plan ≤ 1500 行**
- **04 implementation plan ≤ 800 行**（V3 sidebar-reorder 482 行是好基线，不要超 V3 太多）
- 单个任务卡 ≤ 30 行（标题 + 前置 + 必读上下文清单 + 实现要求 4-8 条 + 验证）
- 不写代码示例（除非是 1-3 行的关键 API 签名引用）
- 不复制 02 / 03 spec 内容（用引用：「按 03 V2 §X」即可）

### 膨胀自检触发清单

任一项命中，停下来自检：

- 当前文档行数 > 上限的 1.5 倍
- 文档内出现 "为完整性补充"、"为照顾未来读者"、"covering edge case Z just in case" 类的开篇语
- 同一段落内有 3+ 个 "如 §X.Y / 见 §A.B.C / 参 §M.N" 嵌套引用
- SubAgent 反馈"读不完 / 关键决策遗漏" — 这是 spec 体量超出 SubAgent 实际消化能力的强信号

## Anti-patterns

- 任务卡里写 30+ 行代码块：错。代码归 02 / 03 spec 或 SubAgent。
- "实现细节按 §X.Y.Z.W"嵌套到第 4 层：错。引用 §X 一层即可。
- 把 P0 评审反馈逐字粘进 plan：错。引用 patch_plan + reviewer 编号即可。
- 同一信息在多个任务卡重复：错。抽到顶层"共同必读"或"风险登记"。
- 行数超 1000：错。除非任务真的有 50+ 张卡。

## Why

Plan 是 SubAgent 的"导航图"，02 / 03 是"详细教程"。让 plan 简洁，SubAgent 才会真正读完；写得过详 SubAgent 会跳着读，反而更易遗漏关键决策。**spec 同理**：02 / 03 是 SubAgent 的实施依据，但当 02 / 03 自身膨胀超过 1500 行，SubAgent 也会跳读，这时再"详细的教程"也变成了无人看完的教程。

**本项目历史**：

- 04 V2 第一次撰写超 64K token 上限失败，根因是把 03 tech plan 内容重复进任务卡。修订后 04 V2 必须 ≤ 800 行。
- category-hierarchy session 中 03 V2 写到 3602 行（约 2.4x 上限），SubAgent 必读时跳读，关键决策被 skim 过；6 个 V1 reviewer 共找到 22 P0 —— 这是 spec 体量与 reviewer 派单数量的正反馈循环：长 spec → 多 reviewer → 找 22 P0 → V2 修订膨胀更长。Hard limit 是切断这个循环的方式。spec / plan 体量本身就是项目健康度的一阶信号；体量失控时 P0 数量随之失控。
