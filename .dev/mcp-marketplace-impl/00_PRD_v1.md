# Ensemble V2.0 Marketplace MCP — Realtime Mirror PRD V1

> **Scope**: 把 V1 的"全量 GET + 24h 本地 cache + default 30 条"模式升级为"Registry API 真实分页 / 搜索 / 详情实时操作"。
> **Source**: Official MCP Registry v0.1(`registry.modelcontextprotocol.io`,API 已 frozen 2025-10-24,稳定 ≥ 1 月)。
> **Precedent**: Phase I Skill Marketplace skills.sh 镜像(已 ship,用户认可"非常棒,效果非常好")。
> **Tier**: Structural — 强 precedent,任务节奏 = 调研分析 → PRD → 实施 → build + 部署 → 用户验证。无多专家评审、无自点击循环。
> **Date**: 2026-05-11
> **Author**: 主 Agent(基于 Registry OpenAPI v0.1 + 实测 curl evidence)

---

## 1. 背景与问题

Phase I 已让 Skill Marketplace 镜像 skills.sh 实时:91k 项,3 视图,服务端搜索,无限滚动,详情按需 fetch。MCP Marketplace 仍停留在 V1 模式:

- `fetch_mcp_registry()` 调用 `https://registry.modelcontextprotocol.io/v0.1/servers` **未传任何 query param**
- 实际 default `limit=30` → 用户每次只看到 30 条
- 24h 文件 cache 在 `~/.ensemble/marketplace-cache/mcps-catalog-v2.json`
- 无搜索(任何输入都是客户端在 30 条上做)
- 无分页(无翻页 / 无加载更多)
- 客户端做 dedupe + isLatest filter(实际 Registry API 已支持 server-side filter)

**用户原话**(2026-05-11):

> "我们已经完成了让 SKill 的 MarketPlace 深入接入SKill.sh,完全镜像 SKill.sh的所有能力。接下来,MCP Marketplace也要一样,不能像现在这样都是本地内容,需要实事接入对应的站点的所有能力。完全去掉现有的这种爬取 20 个 MCP 下来然后就全部本地使用的情况,把每一次都变成真正的站点级别的实时操作。"

V1 的 30 条 + 24h cache 跟用户描述的"爬 20 个全部本地用"等价。任务 = 把这条路径整个删掉,换成 Registry API 实时调用。

## 2. 产品愿景

**MCP Marketplace 与 Skill Marketplace 是同一产品的两个区域** — 视觉密度、浏览方式、搜索行为、详情交互、安装流程一致。用户无需切换心智模型。

## 3. Registry API 能力盘点(事实基础)

实测来源:
- OpenAPI 完整 spec:`https://registry.modelcontextprotocol.io/openapi.json`(48998 字节)
- 实测 curl(2026-05-11)

### 3.1 主 endpoint

`GET /v0.1/servers`(只读浏览;publish 类 endpoint 不在本任务范围)

支持的 query params:

| param | 类型 | 实测行为 |
|---|---|---|
| `cursor` | opaque string | 用 `metadata.nextCursor` 翻下一页;不能 jump |
| `limit` | int 1-100 (default 30) | 实测 limit=100 通过,limit=150 → 422 |
| `search` | string | **substring match on `name` field only** — 不查 description / tags |
| `updated_since` | RFC3339 datetime | 时间过滤 |
| `version` | "latest" or 精确版本号 | server-side 版本过滤;`latest` 替代 V1 客户端 isLatest 逻辑 |
| `include_deleted` | bool (default false) | — |

### 3.2 响应结构

```json
{
  "servers": [{ "server": {...}, "_meta": {...} }, ...],
  "metadata": { "nextCursor": "<opaque>", "count": 10 }
}
```

`server` 已含完整 install spec:`name` / `description` / `version` / `repository` / `packages[]`(stdio:registry/identifier/transport/env/args)/ `remotes[]`(http:url/transport/oauth)/ `categories` / `tags`。**列表项 = 详情**,无需独立 detail fetch。

### 3.3 单 server 版本相关 endpoint

`GET /v0.1/servers/{name}/versions` 与 `GET /v0.1/servers/{name}/versions/{version}` 存在但本任务用不到 — 默认行为 `?version=latest` 已经满足"列表显示最新版"需求。

### 3.4 与 skills.sh 关键差异

| 维度 | skills.sh | Registry v0.1 | 本任务取舍 |
|---|---|---|---|
| 分页 | page-based 0-indexed,200/page | cursor-based,max 100/page | ✅ 切到 cursor + limit=100 |
| 搜索 | server-side full-text(fuzzy/semantic) | substring on name only | UI 标 "Search by name" |
| 视图 | 3(all-time / trending / hot) | 单一 | UI **不出 view tab** |
| Sort | 由视图决定 | 隐式(API 返回顺序) | 沿用 API 默认 |
| Total 条目 | response.total 字段 | **无 total** | UI 显示 "X loaded so far" |
| 详情 | readme GitHub raw fetch | list 已含 install spec | install spec 直接渲染;readme 按需 GitHub fetch |

### 3.5 V1 实现的 5 个 deficiencies

1. `fetch_mcp_registry()` 没传 limit → 实际只拿 30 条
2. 全量 GET 不分页 → 无法看到第 30 条之后的 server
3. 没传 `?search=` → 搜索全在客户端 30 条上跑,几乎无效
4. 客户端 isLatest dedupe → 重复 60-80% 条目浪费带宽,Registry 已支持 `?version=latest` 服务端 filter
5. 24h 文件 cache → 跟用户"实时操作"原话冲突

## 4. V1.5 In(本轮做什么)

1. **新 IPC 替换 V1 全量 GET**:
   - `list_marketplace_mcps_page(cursor: Option<String>, limit: u32) -> McpsPageResponse` — 1 页(默认 100)
   - `search_marketplace_mcps(query: String, cursor: Option<String>, limit: u32) -> McpsPageResponse` — 服务端 substring on name
   - 响应类型 `McpsPageResponse { items, next_cursor, has_more }` mirror Phase I `SkillsPageResponse` 形状(便于复用前端)
2. **删除 V1 cache 路径**:
   - 删 `fetch_mcp_registry()` 全量 + cache 写盘 + 24h TTL 检查
   - 删 `~/.ensemble/marketplace-cache/mcps-catalog-v2.json`(用户首次启动新版时自动 clean,或在 install 时清掉)
   - 客户端 isLatest filter / HashSet dedupe → 删除(server-side `?version=latest` 替代)
3. **保留 V1 已实现的资产**:
   - `MCP_SEED` 10 条(已 npm verify,Registry 不收录 `filesystem` / `memory` 等 stdio 经典 server,seed 是补集)
   - `strip_reverse_dns_prefix()` 显示逻辑
   - `parse_owner_repo_from_url()` install 解析
   - `install_marketplace_mcp()` IPC 完全不动 — install 路径已 stable,本任务不触
   - `auto_classify_marketplace_item()` IPC 不动
   - Tauri events 不动(Phase I 同款 emit pattern)
4. **frontend store 改造**:
   - 删 `mcps`(全量数组)+ `mcpsLastSyncedAt` + `mcpsRefreshing` cache 字段
   - 新增 `mcpsListing: { items, cursor, hasMore, loading, error }`(mirror `skillsListing`)
   - 新增 `mcpsSearch: { query, items, cursor, hasMore, loading, error }`(mirror `skillsSearch`)
   - 新 actions:`loadMcpsPage` / `loadMoreMcps` / `searchMcps` / `clearMcpsSearch`
   - 沿用现有 install/auto-classify event 监听
5. **`McpMarketplacePage` 重写**:
   - 删 sort dropdown(Registry 无 sort 概念)
   - 删 view tab(Registry 单视图)
   - 加 debounced 300ms 服务端搜索(mirror SkillMarketplacePage 模式)
   - 加 IntersectionObserver 无限滚动
   - **顶部小字** "Search by name" 标注(R-MCP-1)+ "X loaded" 计数(R-MCP-2)
   - 列表项视觉密度、详情面板、stdio/HTTP 配置区、install 状态机:**完全沿用 V1 已有实现**

## 5. V1.5 Out(本轮不做)

- ❌ Trending / Hot / Recently Updated 视图 — Registry 无此数据,强造会失真
- ❌ Description full-text 搜索 — API 不支持
- ❌ Sort by stars / installs — Registry 不存这些字段
- ❌ Categories / tags filter UI — Registry response 含 categories/tags 但 query 不能 filter,客户端 filter 与"实时镜像"原则冲突
- ❌ 改 install 路径 / 改 auto-classify 流程 — V1 已 ship 且 stable,本任务不触
- ❌ 客户端 dedupe 逻辑 — 服务端 `?version=latest` 替代

## 6. 决策登记

每条决策给信心等级(High = 由实测 evidence 支持;Medium = 有 strong 推断但缺 1 步实测)。

| ID | 决策 | 信心 | 理由 |
|---|---|---|---|
| **D-MCP-1** | 数据源 = Official MCP Registry v0.1 | High | 继 D-Imp-2;用户原话"我们已经选好了"= 代码内 `registry.modelcontextprotocol.io` URL |
| **D-MCP-2** | 视图 = 单一默认(无 tab) | High | Registry 无 trending/hot 数据;强造会失真 |
| **D-MCP-3** | 搜索 = `?search=<q>` 服务端 substring on name | High | OpenAPI 实测确认;UI 加 "Search by name" 标注让用户知道范围 |
| **D-MCP-4** | 分页 = cursor + limit=100,无限滚动 | High | OpenAPI 实测;cursor opaque 不能 jump,只能 sequential |
| **D-MCP-5** | 详情 readme = GitHub raw fetch on-demand | High | 沿用 Phase I `fetch_skill_readme_github` 同款 + 5min memo cache |
| **D-MCP-6** | 删除 24h 文件 cache;保留 5min in-memory page cache | High | 用户原话"实时操作"显式排除文件 cache |
| **D-MCP-7** | 多版本 = `?version=latest` 服务端 filter,删客户端 isLatest 逻辑 | High | 实测 + V1 客户端逻辑可去 |
| **D-MCP-8** | MCP_SEED 保留 10 条,与 Registry 结果合并展示 | Medium | seed 是 Registry 不收录的 stdio 经典 server 补集;若 Registry 已收录全部 seed,可降级删除(实施时 reconnaissance) |
| **D-MCP-9** | UI = mirror SkillMarketplacePage(略 view tab) | High | 视觉一致性是产品愿景核心 |
| **D-MCP-10** | `install_marketplace_mcp` / `auto_classify_marketplace_item` IPC 不动 | High | V1 stable,本任务范围之外 |

## 7. 风险登记

| ID | 风险 | 缓解 |
|---|---|---|
| **R-MCP-1** | 搜索仅匹配 name,用户搜 "browser" 找不到 description 里说"browser"的 server | UI 顶部 explicit 标 "Search by name"(11px 中性灰),让用户知道范围;不静默 |
| **R-MCP-2** | Registry 无 total → UI 不能显示 "X / Y skills" | 显示 "X loaded so far" + 无限滚动;skills.sh 同款体验 |
| **R-MCP-3** | cursor opaque,翻第 10 页必须依次 fetch 1-9 | 无限滚动天然 sequential,与 cursor 模型 1:1 fit |
| **R-MCP-4** | 删除 24h 文件 cache → 离线时 marketplace 完全不可用(无 fallback) | 用户原话"实时操作"已接受;若用户后续抱怨可再加 in-memory 5min retry banner;**不接受 fallback phasing 提议** |
| **R-MCP-5** | Registry 偶发慢(实测 20s timeout 失败 / 60s 通过) | reqwest client timeout 设 30s + 失败 banner "MCP Registry temporarily slow — Retry" 沿用 Phase I 模式 |
| **R-MCP-6** | seed 与 Registry 重复(若 Registry 现已收录 `filesystem`)→ 同名冲突 | 实施时按 name dedupe,seed 优先(已实测 verify);若 Registry 已全覆盖,后续 cleanup |
| **R-MCP-7** | Registry API freeze 期可能在本任务实施期间结束(2025-10-24 起约 1 月) | 加 `#[ignore]` live integration test 作为 schema drift 哨兵(沿用 Phase I 模式) |

## 8. 用户旅程(60 秒承诺)

```
[0s]  用户从 sidebar 点 MCP Marketplace
[2s]  页面渲染,Registry 第 1 页 100 条 + 10 条 seed merge 后 ~110 条立即可见
[10s] 用户输入 "playwright" + 300ms debounce 后服务端 ?search=playwright 触发
[12s] 搜索结果显示;清除搜索回到默认列表(cursor 状态保留)
[20s] 用户向下滚到底,IntersectionObserver 触发 ?cursor=<next>,加载第 2 页
[25s] 用户点详情,inline 渲染 install spec(stdio command/args 或 HTTP url)
[30s] 用户点 Install,Installing... → Installed ✓ → Auto-Classify 完成,该 MCP 出现在 MCP Servers 列表
[45s] 用户从 MCP Servers 把 MCP 加到 active Scene
[55s] 用户 Sync Scene to Project,.mcp.json 写入项目根目录
[60s] 用户回 Claude Code,新 MCP 立即可用
```

## 9. UX 契约

- **完全沿用** V1 已有的 list item / detail panel / stdio 配置区 / HTTP 配置区(OAuth Copy command)/ install 状态机 / 同名碰撞 Modal / Trash restore 流程
- **新增**:debounced 服务端搜索 input(顶部 sticky)+ "Search by name" hint + "X loaded" counter + IntersectionObserver sentinel
- **不引入** 新 design token / 新颜色 / 新动效曲线(`design-language.md` Rule)
- 视觉一致性测试:Skill Marketplace 与 MCP Marketplace 并排 — 视觉密度、交互节奏、加载状态文案、错误 banner 一致

## 10. 完成定义

**全部满足才算完成**:

1. 用户可以在 MCP Marketplace 浏览 ≥ 100 条真实 Registry server(不再卡在 30 条)
2. 用户输入 query 触发服务端搜索,300ms debounce,结果实时返回
3. 用户向下滚到底自动加载下一页,无翻页按钮
4. V1 全量 GET / 24h 文件 cache / 客户端 isLatest dedupe **代码物理删除**(不留 fallback)
5. install / auto-classify / add-to-Scene / Sync 流程不变
6. 视觉与 Skill Marketplace 并排无割裂感
7. release `.app` 替换 `/Applications/Ensemble.app`(in-place,无 timestamped backup)
8. 用户实测 60 秒全旅程成立

---

## 11. 实施编排(任务流程,非工程细节)

| Stage | 谁做 | 产出 | 阻塞下一步? |
|---|---|---|---|
| 1 | 主 Agent | 本 PRD V1 | 是 |
| 2 | 用户审阅 | feedback / approval | 是 |
| 3 | 1 SubAgent(Opus 4.7,阻断) | 后端 + 前端 + UI 全部改造,自动化 gate(cargo build / tsc / eslint)通过 | 是 |
| 4 | 主 Agent | `npm run tauri build` + 替换 `/Applications/Ensemble.app` | 是 |
| 5 | 用户实测 + 主 Agent commit | 用户认可后 commit;若回炉则进 fix 循环 | — |

**没有多专家并行评审,没有主 Agent 自点击循环。** 用户验证 = 唯一质量 gate。

## 12. 范围红线

- 不写 `~/.claude.json`、不动 `~/.claude/plugins/`(D-7 继承)
- 不引入新 design token(`design-language.md` Rule)
- 不接受 fallback phasing(`feedback_no_fallback_phasing.md`)
- 不复用 V1 cache 路径(必须物理删除)
- 不破坏 V1 install / auto-classify / Scene 流程
- `MCP_SEED` 任何变动需 per-entry 实测 verify(`validate-curated-upstream-ids.md` Rule)
