# Session 摘要（供 SubAgent 参考）

## Session 主题
为 Ensemble (Tauri 2 + React 18 + TS + Rust) 桌面应用的左侧 Sidebar 加 Categories（1D 列表）和 Tags（2D wrap）的拖拽排序功能。要求：动效物理感、克制、丝滑、零回归。

## 主要 Commits（按时间序）
1. `17a2e62` feat(sidebar): add drag-and-drop reordering for Categories and Tags
   - Phase 1：Rust 后端（DATA_MUTEX + apply_reorder + reorder_categories/tags + 12 测试 + ENSEMBLE_DATA_DIR env override + ENV_TEST_LOCK）
   - Phase 2：dnd-kit 安装 + appStore 两阶段提交 + 串行队列 + version 协议 + CSS token + dnd 工具
   - Phase 3：8 个 sortable 组件 + Sidebar/MainLayout 集成
2. `116bdda` fix(test-isolation): refuse to fall back to ~/.ensemble/ during cargo test
   - 因测试污染了用户真实数据后的根因修复

## 完整规划/评审产物
位于 `.dev/sidebar-reorder/`：
- 00_understanding.md 一手理解
- 01_research/ 5 份并行调研（库选型/动效/wrap/a11y/macOS pattern）
- 02_design_spec.md V1→V2→V3
- 03_tech_plan.md V1→V2→V3
- 04_implementation_plan.md V1→V2→V3
- 05_review/ 12 份评审（V1 5 份 + V2 3 份 + V3 final + 06 alignment + 实施后 code review）
- 06_snap_research.md 磁吸丝滑性研究（实施后用户反馈不丝滑后的二次研究）
- _archive/v1, _archive/v2 旧版本归档

## 关键过程节点
1. 用户初始要求"以最高质量完成"+"先调研再执行"+"10/10 才能实施"
2. 主 Agent 派 5 个并行 SubAgent 调研
3. 写 V1 规划三件套
4. 派 5 个 SubAgent 评审 V1：综合 6.6/10，23 个 P0
5. 修 V2，派 3 个 SubAgent 复评：8.0/10，仍多 P0
6. 修 V3，派终审 SubAgent：9.5/10
7. 用户选路径 B（务实开工）
8. T0 对齐 SubAgent 发现 04 文档未跟上 V3，主 Agent patch
9. 顺序发布 T1 后端 → T2-T5 4 并行基础 → T6+T7 并行 → T8+T9 并行 → T10 → T11 集成
10. T13a 全套验证全绿
11. code-reviewer SubAgent 发现 2 个真 P0：DATA_MUTEX 未覆盖 claude_md.rs/trash.rs；onKeyDown shadow dnd-kit KeyboardSensor
12. 主 Agent 修 P0 + 顺手修 P1-2/P1-3/P2-3
13. 用户实测：磁吸"非常生硬，几乎没有动效"
14. 派磁吸调研 SubAgent，发现根因（modifier 直接改 transform 无 transition + CSS 注释撒谎）
15. 改连续软引力 + 帧间 lerp，用户验收："非常棒"
16. 提交 + 推送
17. 用户报告："我所有的 Categories/Tags/Scenes 都没了"
18. 排查发现是 cargo test 期间 ENSEMBLE_DATA_DIR 临时未设导致写入了真实 ~/.ensemble/data.json
19. 用户拒绝恢复，主 Agent 改 get_app_data_dir 在 cfg(test) 下 panic 而非 fallback
20. 提交 + 推送

## 关键失败
- **F1**：SubAgent 写的 Rust 测试用了真实文件路径（依赖 env var fallback），跑一遍就污染了用户数据
- **F2**：V1/V2 规划在动效领域有数学错误（spring vs cubic-bezier 不可能等价），评审才发现
- **F3**：磁吸初版用硬阈值 + 无 CSS transition，用户反馈"生硬"
- **F4**：V1 实施规划没列必读上下文清单，T0 对齐 SubAgent 发现 04 内容仍是 V2

## 用户表达的偏好/标准（散落在对话中）
- "Ensemble 是单人项目，直奔 main"（已在 MEMORY 中）
- "提交的推送需要写得清晰、精细一点"（开源项目使用量在涨）
- 接受 V3 而非死磕到 10/10（路径 B 务实开工）
- 不恢复数据，宁可重新整理（务实，不让 sunk cost 主导）
- 对设计要求"考究、精致、细节、克制、物理级别动效"
- 期望主 Agent 在长任务里保持自主性（V3 评审通过后选 B 路径就让主 Agent 推进）

## 现有 Memory 状态（必读）
位于 `~/.claude/projects/-Users-bo-Documents-Development-Ensemble-Ensemble2/memory/`：
- MEMORY.md（索引）
- feedback_no_pr_for_personal_changes.md
内容大致：
- Tauri 2 / Rust + React/TS 架构
- ~/.ensemble/ 数据目录、~/.claude.json 是 MCP 配置
- 几个关键 bug fix 记录
- 关键文件位置
- "先调查后回答"工作原则
- Serde 模式
- "Ensemble 是单人项目"反馈

## 现有 Global Rules 状态（必读）
位于 `~/.claude/rules/`：
- Global Rules.md（投资先于回答原则）
- hard-constraints-before-soft-evaluation.md
- document-authority-ranking.md
- plan-as-research-design.md
- project-structify.md
- mcp-search-strategy.md
- command-rules.md
- persistence-system.md
- pnpm-docker.md
- academic-reference-verification.md

注：项目级 .claude/rules/ 不存在。
