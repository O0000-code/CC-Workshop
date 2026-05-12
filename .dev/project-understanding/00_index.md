# 项目理解基线文档（Project Understanding Baseline）

> **生成于**：2026-05-12，由 5 个并行 Explore Sonnet SubAgent 调研后合编
> **目的**：为未来 session 提供完整、可引用的 Ensemble 项目认知基线
> **使用**：通过 `@.dev/project-understanding/<file>.md` 直接 inline 到提示中

---

## 五份维度报告

| # | 报告 | 维度 | 适用场景 |
|---|---|---|---|
| A | [产品定位与营销推广策略](./A_marketing_positioning.md) | 文案 / 用户画像 / 推广手段 / 品牌资产 / Release 节奏 | 写文案、规划发布、做品牌决策、回顾推广完成度 |
| B | [功能全景与用户场景](./B_feature_panorama.md) | 11 个 page / 9 大实体 / Marketplace / Auto-Classify / 用户 Journey | 理解 app 是什么、用户怎么用、做新功能前对齐 scope |
| C | [Rust 后端架构](./C_backend_architecture.md) | Tauri / ~90 IPC commands / 数据模型 / 持久化 / 外部集成 | 改后端、加 IPC、调试外部集成 |
| D | [React 前端架构](./D_frontend_architecture.md) | 路由 / 12 个 Store / 组件分层 / UI 模式 / 测试 | 改前端、加页面、处理状态、调 UI 模式 |
| E | [设计语言与历史决策演进](./E_design_language_evolution.md) | 五大哲学 / Token / 硬约束 / 动效 / .dev 地图 / 12 条 Rule | 改 UI/动效、参考设计 spec、回顾历史决策 |

---

## 跨维度精华：12 条"非显然"事实

下列事实**不读完整代码 + 完整 .dev 历史**不会知道，主 Agent 处理任何 Ensemble 任务前应知晓：

### 产品 / 营销层

1. **产品尚未真正发布**。4 个平台文案（Reddit / HN / Twitter / 小红书）全部完整，但都"准备好待发布"状态，无任何帖子 URL。Product Hunt 被明确标为可选，无 landing page，无项目专属社交账号。

2. **冷启动序列已规划**："Reddit + Show HN 先发，再用社会证明加持 Twitter"（launch-posts-twitter.md），中文社区由小红书 launch 覆盖。

3. **反身性营销叙事**："Coded with Claude Code" 在 r/ClaudeAI / r/ClaudeCode 社区有特殊共鸣。

4. **签名身份已公开真名**：tauri.conf.json:47 暴露 `BoZhi Yuan (4WZ6SMP55G)`。Cargo.toml authors 是 `O0000-code` 但 macOS 签名证书不可匿名。**如果匿名是诉求需关注**。

5. **V2.0 Marketplace 已在 main 实装但未版本化**：CHANGELOG 仍只有 v1.0.0。当前处于"代码领先文档/版本号"状态。

### 技术层

6. **App 默认落地页已改为 `/marketplace-skills`**（不是 Skills 或 Scenes 页）。这是 V2 marketplace 推广的核心 UX 决策。

7. **skills.sh 集成依赖浏览器指纹 headers**（marketplace.rs:151）：Origin / Referer / Sec-Fetch-Mode + UA 伪装 Mac Safari。**如 skills.sh 更新检测规则会全 403**，需立即修复 `skills_sh_request()` helper。这是 `validate-no-public-api-claim.md` Rule 的起源事件。

8. **DATA_MUTEX 用 std::sync::Mutex**（不是 tokio）：async command 中 lock 期间不能 await。新增异步逻辑必须遵守。

9. **`auto_classify` 用 `claude -p` CLI 子进程**：依赖 PATH 中找到 `claude`。同步 `std::process::Command` 阻塞 Tokio worker，大批量分类有 executor 饥饿风险。

10. **`marketplace.rs` 4011 行 + `marketplaceStore.ts` 2064 行**：两个最大文件都属 Marketplace。任何 cache miss / race / Tauri 事件问题都需在这两个文件内定位。

### 设计 / 决策层

11. **DragOverlay 没有 "intrinsic CSS transition on transform"**（`06_snap_research.md §1.4`）。snapModifier.ts 旧注释撒过这个谎，导致 1.5h 返工——`verify-third-party-behavior-firsthand.md` Rule 的起源。改 DnD 时不要相信这类"库自动处理"的注释，必须查 `node_modules/...:<line>`。

12. **sidebar-reorder V3** 是整个项目设计语言的最完整活样本。当 design-language Rule 沉默时，回退到 V3 spec（design-language.md:122）。

---

## 当前 WIP / 待结案的事项

下列议题在调研期间已识别，**未来 session 接触相关代码前应先确认状态**：

- **auto-classify-context-overflow** 06_plan 实施 pending（6 个并行任务未 commit）
- **mcp-detail-audit / skills-detail-audit** 截图阶段，无 design spec 文档；最新 commit `05f1dc8` 是该方向实施
- **Marketplace install 的 `autoClassifyNewItems` flag gate**：设置存在，但 install 路径直接 spawn 不查 flag（已知 TODO）
- **`SceneDetailPage.tsx`** 文件存在但 App.tsx 未注册路由——死代码或待接入
- **prefers-reduced-motion 覆盖缺口**：现有 sidebar-only，Marketplace/detail 新 motion 可能未加 fallback
- **Dark mode 全面适配**：`--color-accent` dark token 已预留，但目前"只有 light 模式"

---

## 高频引用速查

| 你想知道... | 看哪里 |
|---|---|
| 一个 IPC command 的定义和参数 | `src-tauri/src/commands/<domain>.rs` + `lib.rs:72-192` 注册 |
| 一个数据模型字段 | `src-tauri/src/types.rs`（后端）+ `src/types/index.ts`（前端） |
| 一个 page 用了哪些 store | 见报告 D 表"每页关联 Stores" |
| 一个动效用了什么 token | `src/index.css:30-680` + design-language.md §Constraints |
| 一个设计决策的历史脉络 | `.dev/<topic>/02_design_spec.md` + 报告 E §5 |
| 一个推广文案的现状 | 报告 A §4 "已采用的推广手段" |
| 一个 Marketplace 字段的 V1/V2 演进 | `.dev/marketplace-prd/{03,04}_PRD_v*.md` + types.rs:1117-1198 |

---

## 维护说明

本文档是**时间戳为 2026-05-12 的快照**。当下列情形发生时，应触发更新：

- 出现新的大型 .dev 迭代目录（如新 PRD / 新 spec）
- IPC commands 数量发生显著变化（±10）
- 新增或替换设计 token 体系（color/easing/duration）
- 推广手段实际落地（实际发帖、上 PH、有官网等）
- Marketplace V3 / Agent Marketplace 等新方向启动

更新方式：派 1-5 个 Explore SubAgent 重新调研对应维度，更新对应 `<letter>_*.md`，本索引同步更新。
