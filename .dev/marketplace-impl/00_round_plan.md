# Marketplace 实施 — 本轮专属规划(00)

> **角色**:主 Agent 撰写的本轮**Decisional** 文档。所有并行 SubAgent 按本规划执行。
> **上游**:`.dev/marketplace-prd/04_PRD_v2.md`(产品契约)+ `02_synthesis_decisions.md`(D-1~D-15)+ `02_risk_distillation.md`(R-1~R-58)+ `01_research/R[1-4]*.md`(代码现状调研)
> **下游**:本目录 `02_tech_spec.md`(技术契约)+ `03_task_cards.md`(任务卡)+ 各 SubAgent 的实施产物

---

## 1. 本轮目的

把 PRD V2 已锁定的 V1 In(8 项)落实成**用户实测可用、4 个独立专家评审 P0 全清、视觉与 SkillsPage 并排无割裂感**的可交付产品。本轮**不**重新决策 PRD 已锁定的产品契约;实施层判断由主 Agent 给定(见 §6 实施层降级登记)。

## 2. 任务分类(plan-as-research-design 三档)

**Structural 为主、Creative 少量**:

| 工作单元 | 分类 | 理由 |
|---|---|---|
| Sidebar 改造、Marketplace 页面骨架、ListItem、SlidePanel 详情、Settings flag toggle | **Structural** | 完全沿用 SkillsPage / McpServersPage 模式,先例饱和(D-13 / R2 §10) |
| 三态 `installSource` 扩展、SSoT 客户端 selector、跨页面同步 | **Structural** | 已有 plugin 二态 + `mcpFetchErrors` 模式作先例(R3 §3.5 / R4 §10.4) |
| Marketplace HTTP 拉取 + 24h cache + `~/.ensemble/marketplace-cache/` | **Creative** | reqwest 在 Rust 端首次主路径使用(R3 §1);cache schema 与 ttl 比对是新设计 |
| Auto-Classify 单项异步触发 + Tauri event 回流 + 行级反馈 | **Structural→Creative 边界** | IPC 直接传单元素 vec 是 Structural;event emit/订阅是 Creative(项目内仅 lib.rs `second-instance-launch` 一例先例) |
| 同名碰撞 Confirm Modal + 三选项 + Trash 联动 | **Creative** | 项目内现状只有后端硬错,UI 要建立"安全可撤销"心智门槛(R-1 / D-10 / R2-P0-4) |

**结论**:走"compact research-first"管道(已完成)+ "实施先 spec 后任务卡"。**不写多轮 Reviewer-V1-V2 spec 修订循环**(避免 ceremony exceeds value)。

## 3. 阶段与依赖图

```
[Phase A 后端]──────────────┐
  ├─ A1 类型扩展(types.rs / SkillMetadata install_source 字段)
  ├─ A2 Marketplace 模块脚手架(marketplace.rs + lib.rs 注册)
  ├─ A3 HTTP fetch + cache(skills + mcps catalog 拉取与缓存)
  ├─ A4 install_marketplace_{skill,mcp}(写 ~/.ensemble/ + collision 三选项)
  ├─ A5 单项 auto_classify 触发 + event emit
  └─ A6 SSoT 后端工具函数(trash 第 3 条件 helper)
                             │
                             ▼
[Phase B 前端 store/type]────┐
  ├─ B1 TS 类型扩展(三态 + Marketplace types + AppData/Settings)
  ├─ B2 marketplaceStore(skills + mcps + cache 状态 + filter + selected + installing/failed)
  ├─ B3 SSoT 客户端 selector + 跨页同步契约
  └─ B4 settingsStore default `autoClassifyNewItems = true` + 清死代码 `InstallSource` alias
                             │
                             ▼
[Phase C UI 实施](Phase B 提供 store/types 契约)
  ├─ C1 Sidebar Marketplace 分组 + Routing + activeNav 扩展(P 并行)
  ├─ C2 SkillMarketplacePage(页面 + 列表 + inline 详情面板 + onboarding)(P)
  ├─ C3 McpMarketplacePage(页面 + stdio/HTTP 配置区)(P)
  ├─ C4 MarketplaceListItem(共用,新建)(C2/C3 内嵌依赖)
  ├─ C5 同名碰撞 Modal + Trash restore 闭环(P)
  ├─ C6 安装成功 short-cut banner + EmptyState 离线态(P)
  └─ C7 Skills/Mcp DetailPanel "Source" 行扩展 marketplace 来源展示(P)
                             │
                             ▼
[Phase D 主 Agent 自点击循环调试]
[Phase E 多专家并行评审(4 角度,Opus 4.7)]
[Phase F P0 修复 → 再循环]
[Phase G 最终交付检查]
```

**并行边界**:Phase A 内 A1 阻断 A2-A6,A2-A6 部分可并行(主要是文件不冲突时);Phase B 内 B1 阻断 B2-B4,B2-B4 可并行;Phase C 内 C2/C3 可并行(不同页面文件),C5/C6/C7 可并行,C1 与 C2/C3 可并行(Sidebar 与页面文件不冲突)。**A → B → C 跨阶段串行**(后端 IPC 契约必须先稳)。

**SubAgent 编排**:
- Phase A:1 个 backend SubAgent 串行做 A1-A6(共享 types.rs / lib.rs / 新文件 marketplace.rs)
- Phase B:1 个 frontend-data SubAgent 串行做 B1-B4(共享 types/index.ts)
- Phase C:**多个并行 SubAgent**:`C1-sidebar-routing`、`C2-skill-page`、`C3-mcp-page`(C4 内嵌)、`C5-collision-modal`、`C6-shortcut-empty`、`C7-detail-source`

## 4. 共同必读清单(所有实施 SubAgent)

按顺序读完后再开工:

1. `.dev/marketplace-impl/README.md` — 本轮目录约定
2. `.dev/marketplace-impl/00_round_plan.md` — 本文件
3. `.dev/marketplace-impl/02_tech_spec.md` — 技术契约
4. **本 SubAgent 任务卡**(03_task_cards.md 中对应的卡片)
5. `.dev/marketplace-prd/04_PRD_v2.md` — PRD V2 终稿(必读章节按任务卡指明)
6. `.dev/marketplace-prd/02_synthesis_decisions.md` — D-1~D-15
7. `.dev/marketplace-prd/02_risk_distillation.md` — R-1~R-58(P0 必避,P1 任务卡指明哪些就地处理)
8. **本任务卡指明的调研产物**(R1/R2/R3/R4 中相关章节)
9. `.claude/rules/design-language.md` — 视觉硬约束(UI 类 SubAgent 必读)
10. `CLAUDE.md`(项目根) + 本任务卡指明的项目 Rule(`grep-before-enumerate-shared-resource` / `verify-third-party-behavior-firsthand` / `fix-must-define-user-observable-success` / `replace-installed-app-in-place` 等)

## 5. 产出契约(各阶段)

| 阶段 | 落盘产物 | 行数预算 |
|---|---|---|
| **Phase A** | 后端代码改动 + 任务执行日志 `04_implementation_log.md`(append) | 代码不限;日志每 SubAgent ≤ 50 行 |
| **Phase B** | 前端 store/type 改动 + 同上 append 日志 | 同 |
| **Phase C** | 各 UI 文件 + 同上 append 日志 | 同 |
| **Phase D** | `04_implementation_log.md` 中"自点击轮次"段(每轮 1 段,记录场景 / 观察 / 修复) | 每轮 ≤ 100 行 |
| **Phase E** | `05_review/E1_code_quality.md` / `E2_design_consistency.md` / `E3_closed_loop.md` / `E4_scope_control.md` | 每份 250-450 行 |
| **Phase F** | `04_implementation_log.md` 中"P0 修复"段 | ≤ 200 行 |
| **Phase G** | `04_implementation_log.md` 中"交付检查"段 | ≤ 100 行 |

## 6. 实施层降级登记(主 Agent 在 PRD 决策外做的工程降级)

PRD V2 是 Decisional;以下是我作为主 Agent 给定的**实施层选择**(不反转 D-1~D-15,不放回 V1 Out 项):

### D-Imp-1:Skill 数据源 V1 用 GitHub API + 精选 seed 名单
- **决策**:V1 不实现 skills.sh 网页/CLI 抓取(R-7 风险)。改用一个**精选 seed 名单**(~40-60 个 owner/repo,从 skills.sh leaderboard 截图人工选)+ GitHub Contents API 拉每个 SKILL.md / repo 元数据。
- **理由**:R-7 P0 已点名 skills.sh 无文档化 REST API → 接入工程复杂度高;V1 用 seed 给用户"看似有内容"的 V1 体验,V1.5 评估真正的动态抓取
- **不偏离 PRD**:PRD §6.2 主源仍是 skills.sh,seed 是工程层简化;影响:weekly installs 数据 V1 不可得,sort 用 GitHub stars 替代(详 D-Imp-5)

### D-Imp-2:MCP 数据源 V1 用 Official MCP Registry REST 全量 + 24h cache
- **决策**:V1 拉全量(~500 项很小,一次拉完);分页/过滤在前端
- **理由**:覆盖广度(D-5 决策已说"V1 接受 ~500 边界")

### D-Imp-3:Marketplace cache 子目录扁平结构
- **决策**:`~/.ensemble/marketplace-cache/skills-catalog.json` 与 `mcps-catalog.json`,每文件含 `{ items: [...], lastSyncedAt: ISO8601, source: '...' }`
- **理由**:R3 §10.2 给出两选项,扁平更简单;V1 不需要嵌套结构

### D-Imp-4:`SkillMetadata` / `McpMetadata` 新增 marketplace 字段
- **决策**:新增 `install_source: Option<String>`(三态字符串)+ `marketplace_source: Option<MarketplaceSource>` 子对象,含 `{ source: 'skills_sh' | 'mcp_registry', owner, repo, name, last_synced_at }`(camelCase TS 镜像)。`McpConfigFile` 同样新增。
- **理由**:R3 §3.5 指出 marketplace 真实拷贝时 scan_skills 无法靠 symlink 区分(V1 必须迁移);三元组比 name 更稳定的已装态判定;Source 行展示需要 owner/repo;V1.5 自动更新需要 last_synced_at
- **避开 R-49 命名冲突**:不复用现有 `marketplace?: string`(plugin 来源的 marketplace ID),用新字段 `marketplace_source` 子对象

### D-Imp-5:Sort 选项文案 V1 统一为 `By Popularity`
- **决策**:Skill / MCP 两个 marketplace 的默认排序文案都用 `By Popularity`(数据源用 GitHub stars 数;MCP Registry 若无 stars,fallback alphabetic)
- **理由**:PRD §5.8 文案 `By weekly installs` / `By GitHub stars` 反映上游差异,但 V1 没有 weekly installs(D-Imp-1 用 seed 名单)。统一文案 V1 工程降级;V1.5 评估恢复差异化文案
- **不偏离 PRD 意图**:产品上仍是"按上游热门度排"

### D-Imp-6:"Add to active Scene →"short-cut V1 降级为 "Manage Scenes →"
- **决策**:V1 不实现"active scene"概念;安装成功 short-cut 提供两条:① "View in Skills →"(navigate `/skills?selected=<skillId>`)② "Manage Scenes →"(navigate `/scenes`)。**不**在详情面板内嵌 Scene 选择器
- **理由**:R2 §9 / R4 §9 明确:当前没有 active scene 概念,Scene chip 无 onClick,从 Skill 详情加 Scene 没有 IPC。V1 强行实现 = Vertical 大改 ScenesStore + ScenesPage。降级为 nav link 仍服务"帮用户跨过三段式心智门槛"目标
- **不偏离 PRD §5.5.1 意图**:PRD 文字"如当前用户在 Ensemble 工作流中有 active Scene 概念" 暗示这是可选的;V1 走可选的反向

### D-Imp-7:"View in Skills →"走 URL query param
- **决策**:`navigate('/skills?selected=<skillId>')`;`SkillsPage` 监听 `useSearchParams` 初始化 `selectedSkillId`(保持 page-local useState 不动)
- **理由**:R4 §9.3 指出 SkillsPage selectedSkillId 是 page-local 不在 store。Hoist 到 store 是无关 marketplace 的范围扩散

### D-Imp-8:同名匹配 V1 用三元组优先 + name fallback
- **决策**:已装态判定 = 优先匹配 marketplace_source 三元组(`{owner, repo, name}`);若本地 metadata 无三元组(未通过 marketplace 装的同名),fallback 用 `Skill.name === item.name` 精确匹配(case-sensitive,trim 空白)
- **理由**:R4 §10.2 指出 name 匹配脆弱;三元组稳定但需要本地 metadata 已存

### D-Imp-9:stdio MCP env vars 用显式 Save 按钮
- **决策**:配置区底部一个 `Save environment variables` Button primary;onSave 写入 `~/.ensemble/mcps/<name>.json` 的 `env` 字段;成功后按钮 200ms checkmark 反馈
- **理由**:即时保存对敏感信息(API key)给用户感知不强;显式 Save 与"用户填了就保存"产品契约一致(PRD §5.4 c 项保留 spec 自由度);保存动作明确可追踪

### D-Imp-10:HTTP Client 单例用 std `OnceLock`(无新依赖)
- **决策**:`marketplace.rs` 内 `static MARKETPLACE_HTTP: OnceLock<reqwest::Client> = OnceLock::new();`,全局 reuse;User-Agent = `Ensemble/<version> (+https://github.com/...)`(R3 §12.4);timeout 15s
- **理由**:R3 §12.4 说 std OnceLock 在 Rust 1.77.2 已支持,无需 once_cell

### D-Imp-11:V1 不实现"删除已装 marketplace 资源后从 Marketplace 看到"的特殊态
- **决策**:用户从 Skills 列表 Delete(进 Trash)后,Marketplace 列表对应项从 `Installed` 切回 `Install`;**不**显示"recently installed"或类似提示
- **理由**:符合 R-19 决策(Marketplace 列表项不提供卸载入口);SSoT 三条件天然驱动

### D-Imp-12:`autoClassifyNewItems` flag UI 暴露在 Settings 页
- **决策**:V1 在 SettingsPage 新增一个 Toggle(沿用现有 Toggle 组件 + label `Auto-classify newly installed items`);默认 true;后端读取 flag 决定是否触发单项 auto_classify
- **理由**:R-22 P1 已点名 V1 启用此 flag。toggle 暴露让用户能关闭(尊重用户主动权)

## 7. 质量门槛(每阶段通过的硬指标)

| Phase | 通过指标 |
|---|---|
| **A** | 1) `cargo build` 成功;2) `cargo test` 全绿;3) 新增 IPC 在 lib.rs 注册;4) `rg 'read_app_data\|write_app_data' src-tauri/` 与 R3 §4 表对比新增 callsite 已包 `DATA_MUTEX`;5) 新增模块的 `#[cfg(test)]` 路径有 panic guard 覆盖 |
| **B** | 1) `npx tsc --noEmit` 无错误;2) `npx eslint src/` 无错误;3) `npm test` 全绿;4) 死代码 `InstallSource` alias 已删 |
| **C** | 1) `npm run tauri dev` 启动无 console error;2) Sidebar Marketplace 分组渲染正确;3) 列表页骨架与 SkillsPage 并排截图无视觉差;4) 同名碰撞 Modal + Trash restore 端到端可走通 |
| **D** | PRD §3.2 单步详述每一步触发 + 状态切换全部走通;`fix-must-define-user-observable-success` Rule 的"用户做 X 看到 Y"三行写在每个交付单元 |
| **E** | 4 评审报告全部产出 P0/P1/P2 编号清单 |
| **F** | 所有 P0 关闭(每条贴 commit hash + 修复说明);P0 修复后再跑一次 D 自点击 |
| **G** | PRD §8 "60 秒全旅程"用户实测下成立;V1 In 8 项全部完成 + V1 Out 8 项零埋点确认 |

## 8. 实施过程风险登记(本轮过程中可能踩的雷)

> 这是 PRD R-1~R-58 之外的、来自调研发现 + 实施层判断的过程风险。

| 编号 | 风险 | 缓解 |
|---|---|---|
| **PR-1** | classify.rs / types/index.ts / store 文件已有 in-progress 改动(sidebar-hierarchy-fix);本轮改这些文件需避免冲撞 | A1 / B1 SubAgent 任务卡显式标注"in-progress 区域不动";最终 commit 只 stage 本轮新改动,不动 in-progress 残留;交付检查阶段提醒用户处理 |
| **PR-2** | `McpConfigFile` 三处构造点(R-57)— marketplace 是第三处 | A4 SubAgent 显式提示"必须扩展三处构造点字段一致" |
| **PR-3** | `auto_classify` 通过 `claude` CLI 子进程,用户机器若 PATH 无 `claude` 会 fail | A5 单项触发后 emit error event;前端 row 显示 "Auto-classify failed" inline 提示(R1-P0-4) |
| **PR-4** | GitHub API rate limit(无 token 60 req/h)— 列表初次加载可能限流(R-24) | A3 实现"批量 + 限速"(每 GitHub API 调用之间 sleep);失败 fallback 到 cache;V1.5 评估 GitHub PAT 环境变量 |
| **PR-5** | SkillsPage / McpServersPage 是 inline 实现,DetailPanel 不被使用 — Marketplace 不能复用 DetailPanel 组件 | C2/C3 任务卡显式说"内嵌实现详情主区,不调用 DetailPanel" |
| **PR-6** | "selectedSkillId" 是 page-local;短链 navigate 后必须用 query param 传 | C6 任务卡指定 D-Imp-7 路径 |
| **PR-7** | reduced-motion fallback 当前只覆盖 sidebar drag 区域(R1 §5.3) | UI 任务卡每加一个 transition 必须同步加 reduced-motion 选择器 |
| **PR-8** | Tauri event 在前端 store 订阅是新模式(项目内只有 lib.rs `second-instance-launch` 一处先例) | A5 SubAgent 写好 event 名 + payload schema;B2 SubAgent 用 `@tauri-apps/api/event listen` 订阅 |
| **PR-9** | `dev` build 启动慢 — 多轮 fix 期间最耗时 | 用户偏好已记 memory:多轮 fix 走 dev mode,不全编 release;只在 ship 前最终验证用 release |

## 9. 工作交付的最终判断(同 PRD §8 + 本轮 §6)

- PRD §8 "60 秒完成全旅程" 在用户实测下成立
- 4 评审 P0 全部关闭
- 端到端旅程在 Tauri 内能跑通(含离线 / 错误 / 同名 / Trash 重装等异常分支)
- **视觉关键测试**:Skills 列表与 Marketplace 列表并排,应该感觉是同一产品的两个区域
- V1 In 8 项全部完成;V1 Out 8 项零埋点

---

**00_round_plan 结束。下游必读 02_tech_spec.md 获取技术契约。**
