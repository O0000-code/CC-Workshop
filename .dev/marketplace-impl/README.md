# Marketplace Implementation — 工作目录

本目录是 Ensemble V2.0 Marketplace 实施轮次的工作产物落地点。产品契约在上游目录 `.dev/marketplace-prd/`(PRD V2 / 决策登记 / 风险登记 / 基线理解)。本目录只关心"怎么做"。

## 目录约定

```
.dev/marketplace-impl/
├── README.md                    # 本文件
├── 00_round_plan.md             # 本轮专属规划:阶段、依赖图、SubAgent 必读清单、产出契约
├── 01_research/                 # 调研产物(R1-R4 当前代码状态)
│   ├── R1_sidebar_layout.md
│   ├── R2_skill_mcp_pages.md
│   ├── R3_tauri_backend.md
│   └── R4_frontend_stores.md
├── 02_tech_spec.md              # 技术 spec(IPC 契约、Rust struct、TS 类型、组件清单、状态机)
├── 03_task_cards.md             # 任务卡(可独立执行的 SubAgent 单元)
├── 04_implementation_log.md     # 实施过程日志
└── 05_review/                   # 多专家评审产物
```

## 上下文层级(Decisional → Referential → Historical)

| 层级 | 文档 | 用途 |
|---|---|---|
| **Decisional** | `.dev/marketplace-prd/04_PRD_v2.md` | 产品契约,"做什么"。本轮所有判断的最高权威。 |
| **Decisional** | `.dev/marketplace-prd/02_synthesis_decisions.md` | D-1~D-15 决策登记。不可被静默推翻。 |
| **Decisional** | `.dev/marketplace-prd/02_risk_distillation.md` | R-1~R-58 风险登记。P0 必须处理。 |
| **Decisional** | `.claude/rules/design-language.md` | 视觉硬约束。不引入新 token / 颜色 / 动效曲线。 |
| **Decisional** | 本目录 `02_tech_spec.md` / `03_task_cards.md` | 当前轮次的实施契约。 |
| **Referential** | 本目录 `01_research/R*.md` | 当前代码状态的调研产物。事实陈述,不是设计。 |
| **Referential** | `.dev/marketplace-prd/00_understanding.md` | 用户原话与项目事实基线。 |

**冲突解决**:跨级冲突由高级别决定;同级冲突升级到主 Agent。

## 当前 baseline 注意事项

启动本轮工作时,工作目录有上一轮(sidebar-hierarchy-fix)的 in-progress 改动:

- `src-tauri/src/commands/classify.rs`(+70 行,depth-2 分类支持)
- `src/types/index.ts`(+14 行,新增 `ExistingCategoryPayload` 等)
- `src/utils/classifyHelpers.ts`(新文件,Auto-Classify 帮助函数)
- `src/stores/{skills,mcps,claudeMd}Store.ts`(简化重构)
- `src/components/sidebar/SortableCategoriesList.tsx`、`src/index.css` 等

这些改动属于上一轮工作的成品,与 marketplace 实施**无功能冲突**。本轮只 stage 与 marketplace 直接相关的改动,不动这些 in-progress 文件,等待用户单独处理。

## 范围红线

- 不写 `~/.claude.json`、不动 `~/.claude/plugins/`(D-7)
- 不引入新 design token / 新颜色 / 新动效曲线(design-language Rule)
- 不绕过 Scene 模型("装 ≠ 在 Claude Code 全局启用")
- 不为任何 V1 Out 8 项埋点(Agent Marketplace / 用户上传 / 评分等)
- V1 In 严格 8 项,V1 Out 严格 8 项
