# Ensemble V2.0 Marketplace MCP — Realtime Mirror PRD V2

> **Scope**: 把 V1 的"全量 GET 30 条 + 24h 本地 cache"模式升级为"Registry 网站级别实时浏览"。
> **Source**: Official MCP Registry v0.1(`registry.modelcontextprotocol.io`,API frozen 2025-10-24)。
> **Precedent**: Phase I Skill Marketplace skills.sh 镜像(已 ship)。
> **Tier**: Structural — 强 precedent。流程 = 调研分析 → PRD → 实施 → build + 部署 → 用户验证。无多专家评审。
> **Date**: 2026-05-11
> **Author**: 主 Agent(基于 OpenAPI v0.1 + 实测 curl + chrome-devtools 实测 skills.sh 与 Registry 网站行为)

## V2 vs V1 修订摘要

V1 假设"MCP UX = mirror Phase I Skill UX(无限滚动 / 状态行 'X loaded')"。V2 推翻这一假设 —— 用 chrome-devtools 实测 Registry 主页后发现:**Registry 网站本身用显式 Previous/Next 分页,不是无限滚动**。用户原话"如果网站做分页,我们可能也要在底部做分页"正是这种情形。MCP UX 必须 mirror Registry 网站(显式分页 + Recently Updated 段),不应该粗糙 copy Skill UX。修订集中在 D-MCP-2 / D-MCP-4 / D-MCP-9 + 新增 D-MCP-11。

---

## 1. 背景与问题

Phase I 已让 Skill Marketplace 镜像 skills.sh 实时(91k 项,3 视图,server-side 搜索,无限滚动)。MCP Marketplace 仍是 V1 模式:

- `fetch_mcp_registry()` 调 `https://registry.modelcontextprotocol.io/v0.1/servers` **无任何 query param**
- API default `limit=30` → 用户每次只看到 30 条
- 24h 文件 cache `~/.ensemble/marketplace-cache/mcps-catalog-v2.json`
- 客户端做 isLatest filter / dedupe(实际 Registry API 已支持 server-side `?version=latest`)
- 无搜索、无分页

用户原话(2026-05-11):

> "MCP Marketplace 也要一样,不能像现在这样都是本地内容,需要实事接入对应的站点的所有能力。完全去掉现有的这种爬取 20 个 MCP 下来然后就全部本地使用的情况,把每一次都变成真正的站点级别的实时操作。"

> "你先看看 SKill.sh怎么实现的,完整看一下。我们记得做了和 SKill.sh完全相同的能力,它网站上是一次性展示 500 条数据的,然后继续往下触底就会触发加载,我们也做了完全一样的效果。MCP 也需要根据这个网站的特性来调整,如果网站做分页,我们可能也要在底部做分页。"

V1 的 30 条 + 24h cache 跟"爬 20 个全部本地用"等价。任务 = 删除这条路径,换成 Registry **网站行为级别**的实时镜像。

## 2. 产品愿景

**Skill 与 MCP marketplace 共享视觉密度 / 列表项样式 / 详情面板 / install 流程,但浏览模式各自 mirror 上游网站**:Skill = skills.sh 的无限滚动,MCP = Registry 的显式分页 + Recently Updated 段。两个 marketplace 在 Ensemble 内并排时,用户**感觉是同一产品的两个区域**(共享 atomic),但**操作模式各自 fit upstream**(尊重 source character)。

## 3. 上游网站 UX 实测(事实基础)

### 3.1 skills.sh 网站行为(Phase I 已 mirror)

实测 2026-05-11 via chrome-devtools:

- **首屏 SSR 渲染前 ~600 条**(初始 docHeight 38259px,可见 rank #1-#51,中间用 collapse button "+N more from owner/repo" 折叠多 server 同 owner 的项)
- **触底懒加载**:scrollY 至底部时,JS 自动 fetch internal API `/api/skills/all-time/{page}`,page 从 3 开始(0-2 已在 SSR),每页 200
- 实测 reqid 序列:`/api/skills/all-time/3` → `/4` → `/5-9` 串行触发
- **无显式分页按钮**;底部 sentinel "Loading more..." → "End of catalog (91k total)"
- 3 视图 tab(`/`、`/trending`、`/hot`)— 切换是 RSC 导航,不在同一 page 内 swap
- **搜索框** server-side full-text(fuzzy / semantic)

Phase I Ensemble 实现:无限滚动 + 200 条/页 + IntersectionObserver(rootMargin 200px 预触发)+ 3 view tab + debounced 300ms 服务端搜索。**用户已确认"完全一样的效果"。**

### 3.2 Registry 网站行为(MCP 应 mirror)

实测 2026-05-11 via chrome-devtools(`https://registry.modelcontextprotocol.io/`):

- **页面顶部段:Recently Updated**
  - 9 条最近 24h 更新 server,显示 name + version + description + date
  - API:`GET /v0.1/servers?updated_since=<24h ago RFC3339>&limit=96`
- **主列表段**
  - 96 条/页(< API max 100)
  - API:`GET /v0.1/servers?limit=96&version=latest`
  - 包含 `?version=latest` server-side filter(自动 dedupe 多版本)
- **底部分页 DOM**:
  ```html
  <div class="mt-8 flex justify-between items-center">
    <button id="prev-btn" disabled>Previous</button>
    <span id="page-info">More available</span>
    <button id="next-btn">Next</button>
  </div>
  ```
- **翻页行为**:点 Next → API `?limit=96&cursor=ai.llmse%2Fmcp%3A1.3.12&version=latest`
  - `cursor` 来自上一页响应 `metadata.nextCursor`(opaque)
  - URL 同步更新 `?cursor=...`(可分享 / 可 reload 保持位置)
- **页码指示**:**"More available"**(不是 "Page X of Y" — 因为 cursor opaque,Registry 不预先知道总页数)
- **搜索框** "Search servers by name..." — 实测确认 substring on name
- **复选框** "Show only latest versions" 默认 checked — 控制 `?version=latest` 是否传

### 3.3 Registry API 实测能力(OpenAPI v0.1)

| param | 用途 | 限制 |
|---|---|---|
| `cursor` | opaque pagination cursor | 来自 prev `metadata.nextCursor` |
| `limit` | 每页 size | 1-100,default 30 |
| `search` | substring on `name` field only | **不查 description / tags** |
| `updated_since` | RFC3339 时间过滤 | 用于 Recently Updated 段 |
| `version` | "latest" 或精确版本号 | server-side dedupe 替代客户端 isLatest |
| `include_deleted` | bool | default false |

响应 `{ servers: [{server: {...}, _meta: {...}}, ...], metadata: { nextCursor, count } }`。**列表项已含完整 install spec**(packages stdio + remotes http + env vars),无需独立 detail fetch。

### 3.4 V1 实现的 5 个 deficiencies

1. `fetch_mcp_registry()` 没传 limit → 实际只 30 条
2. 全量 GET 不分页 → 看不到第 30 条之后
3. 没传 `?search=` → 客户端在 30 条上做几乎无效的搜索
4. 客户端 isLatest dedupe → 重复 60-80% 条目浪费带宽,Registry 已支持 server-side filter
5. 24h 文件 cache → 跟用户"实时操作"原话冲突

## 4. V1.5 In(本轮做什么)

1. **新 IPC**(替换 V1 全量 GET):
   - `list_marketplace_mcps_page(cursor: Option<String>, limit: u32) -> McpsPageResponse` — 主列表分页
   - `list_recently_updated_mcps(hours_back: u32, limit: u32) -> Vec<MarketplaceMcpItem>` — Recently Updated 段
   - `search_marketplace_mcps(query: String, cursor: Option<String>, limit: u32) -> McpsPageResponse` — 服务端 substring on name
   - 响应 `McpsPageResponse { items, next_cursor: Option<String>, has_more }`

2. **删除 V1 路径**:
   - `fetch_mcp_registry()` 全量 + cache 写盘 + 24h TTL 检查 → 删
   - `~/.ensemble/marketplace-cache/mcps-catalog-v2.json` 文件 → 启动时静默清除
   - 客户端 `is_latest_envelope` filter / HashSet dedupe → 删(server-side `?version=latest` 替代)

3. **保留 V1 资产**:
   - `MCP_SEED` 10 条(已逐条 npm verify)— 与 Registry 主列表合并
   - `strip_reverse_dns_prefix()` / `parse_owner_repo_from_url()` 显示 / install 解析
   - `install_marketplace_mcp` / `auto_classify_marketplace_item` / Tauri events — **完全不动**

4. **frontend store 改造**:
   - 删 `mcps`(全量数组)+ `mcpsLastSyncedAt` + `mcpsRefreshing` cache 字段
   - 新增 `mcpsListing: { items, currentCursor, prevCursors[], nextCursor, hasMore, hasPrev, page, loading, error }` — 显式分页 state
   - 新增 `mcpsRecentlyUpdated: { items, loading, error }` — 顶部段
   - 新增 `mcpsSearch: { query, items, currentCursor, prevCursors[], nextCursor, hasMore, hasPrev, page, loading, error }`
   - 新 actions:`loadMcpsPage(cursor)` / `loadMcpsNextPage` / `loadMcpsPrevPage` / `loadRecentlyUpdated` / `searchMcps` / `clearMcpsSearch`

5. **`McpMarketplacePage` 重写**:
   - 顶部段 "Recently Updated" — 9 条 / 横向 grid 或紧凑列表 / 每条 name + version + description + 日期
   - 主列表段 — 96 条/页(对齐 Registry)
   - **底部分页控件**:`Previous` button(首页 disabled) + 中间指示 "More available" / "Page N" + `Next` button(无更多时 disabled)
   - debounced 300ms 服务端搜索(进入搜索模式后:Recently Updated 段隐藏 / 主列表替换为搜索结果 / 分页控件作用于搜索结果)
   - **顶部小字** "Search by name(Registry 限制)" 11px 中性灰,explicit 标搜索范围
   - 列表项 / 详情面板 / stdio/HTTP 配置区 / install 状态机 / 同名碰撞 Modal:**完全沿用 V1 已有视觉密度 + 组件**

## 5. V1.5 Out(本轮不做)

- ❌ 无限滚动(violates Registry 网站 UX,不 mirror 上游)
- ❌ Trending / Hot / Popular 视图 tab(Registry 无此 endpoint)
- ❌ Description full-text 搜索(API 不支持)
- ❌ Sort by stars / installs(Registry 不存这些字段)
- ❌ Categories / tags filter(API query 不支持)
- ❌ "Page X of Y" 总页数指示(cursor opaque,Registry 自己也不显示)
- ❌ 改 install 路径 / 改 auto-classify 流程(V1 已 stable)
- ❌ "Show only latest versions" 复选框(默认 always true,无切换需求)

## 6. 决策登记

| ID | 决策 | 信心 | 理由 |
|---|---|---|---|
| **D-MCP-1** | 数据源 = Official MCP Registry v0.1 | High | 继 D-Imp-2;用户原话"我们已经选好了"= 代码内 URL |
| **D-MCP-2**(V2 修订) | 浏览模式 = **显式 Previous/Next 分页 + 顶部 Recently Updated 段** | High | chrome-devtools 实测 `registry.modelcontextprotocol.io/` 主页 UX;用户原话"如果网站做分页,我们也要在底部做分页" |
| **D-MCP-3** | 搜索 = `?search=<q>` 服务端 substring on name | High | OpenAPI 实测;UI 显式标"Search by name" |
| **D-MCP-4**(V2 修订) | 分页 = cursor + 显式 Previous/Next 按钮(**非无限滚动**)| High | Registry 网站本身行为;cursor opaque 适合显式翻页 |
| **D-MCP-5** | 详情 = 列表项已含完整 install spec,readme 按需 GitHub raw fetch | High | OpenAPI + 沿用 Phase I `fetch_skill_readme_github` 套路 |
| **D-MCP-6** | 删除 24h 文件 cache;保留 5min in-memory readme cache | High | 用户原话"实时操作"显式排除文件 cache |
| **D-MCP-7** | 多版本 = `?version=latest` 服务端 filter,删客户端 isLatest 逻辑 | High | OpenAPI 实测 |
| **D-MCP-8** | MCP_SEED 保留 10 条,与 Registry 主列表合并展示 | Medium | seed 是 Registry 不收录的 stdio 经典 server 补集 |
| **D-MCP-9**(V2 修订) | UI = **mirror Registry 网站结构**(Recently Updated + 主列表 + 显式分页),**不是 mirror SkillMarketplacePage 形状** | High | Registry 网站本身行为;两 marketplace UX 各自 fit upstream |
| **D-MCP-10** | `install_marketplace_mcp` / `auto_classify_marketplace_item` / Tauri events 不动 | High | V1 stable,本任务范围之外 |
| **D-MCP-11**(V2 新增) | 首屏 = 顶部 9 条 Recently Updated + 主列表第 1 页 96 条 | High | Registry 网站实测 `?updated_since=<24h>&limit=96` 与 `?limit=96&version=latest` 双 fetch |
| **D-MCP-12**(V2 新增) | 每页 96 条(< API max 100,与 Registry 网站一致)| High | Registry 网站 limit=96 实测 |
| **D-MCP-13**(V2 新增) | 进入搜索模式时:Recently Updated 段隐藏 / 主列表替换为搜索结果 / 分页控件作用于搜索结果 | High | Registry 网站搜索行为推测合理(网站本身搜索时也不再显示 Recently Updated) |

## 7. 风险登记

| ID | 风险 | 缓解 |
|---|---|---|
| **R-MCP-1** | 搜索仅 name 不 description | UI 顶部 explicit 标 "Search by name" |
| **R-MCP-2** | cursor opaque,翻第 N 页必须依次翻 | Previous/Next 按钮天然 sequential,与 cursor 模型 1:1 fit;前端 store 缓存 prevCursors[] 让 Previous 不发新 API,直接回退 state |
| **R-MCP-3** | 删 24h cache → 离线时不可用 | 用户原话已接受;若用户后续抱怨可加 in-memory retry banner |
| **R-MCP-4** | Registry 偶发慢(实测 20s timeout,60s 通过) | reqwest timeout 30s + 失败 banner "MCP Registry temporarily slow — Retry"(Phase I 同款) |
| **R-MCP-5** | seed 与 Registry 重复(若 Registry 已收录 `filesystem` 等)| 实施时按 name dedupe,seed 优先;未来若 Registry 全覆盖可清理 |
| **R-MCP-6** | API freeze 期(2025-10-24 起约 1 月)可能在实施期内结束 | 加 `#[ignore]` live integration test 作为 schema drift 哨兵 |
| **R-MCP-7**(V2 新增) | 用户已熟悉 Skill 无限滚动,MCP 改显式分页可能初见违和 | trade-off 已知;用户原话明确"根据这个网站的特性来调整",此为 mirror upstream 的代价。两 marketplace 视觉密度 / 详情 / install / collision modal 一致,只浏览模式不同 |

## 8. 用户旅程(60 秒承诺)

```
[0s]  用户从 sidebar 点 MCP Marketplace
[2s]  并行 fetch:Recently Updated (9 条) + 主列表第 1 页 (96 条) → 两段同时 ready
[3s]  用户看到顶部 9 条最近 24h 更新 server + 下方主列表 96 条
[10s] 用户输入 "playwright" + 300ms debounce → server-side ?search=playwright
[12s] 搜索结果显示;Recently Updated 段隐藏;清除搜索回到默认双段
[20s] 用户点 Next → cursor 翻页,主列表替换;Previous 变 enabled
[25s] 用户点 Previous → store 缓存的 prevCursor 直接回退,无新 API 调用
[30s] 用户点详情 inline 渲染 install spec(stdio command/args 或 HTTP url)
[35s] 用户点 Install → Installing... → Installed ✓ → Auto-Classify 完成
[45s] 用户从 MCP Servers 把 MCP 加到 active Scene
[55s] 用户 Sync Scene to Project,.mcp.json 写入项目根目录
[60s] 用户回 Claude Code,新 MCP 立即可用
```

## 9. UX 契约

- **沿用 V1 已有**:list item 视觉密度 / SlidePanel 详情面板 / stdio 配置区 / HTTP 配置区(OAuth Copy command)/ install 状态机 / 同名碰撞 Modal / Trash restore
- **新增**:
  - 顶部 "Recently Updated" 段(横向滚动或 9-cell 紧凑 grid;每条 name + version + description + date)
  - 主列表保持现 list 模式
  - 底部分页控件:Previous(disabled when page 1)/ "More available" 中间文字 / Next(disabled when no more)
  - debounced 300ms 服务端搜索 input(顶部 sticky)+ "Search by name" hint
- **不引入** 新 design token / 新颜色 / 新动效曲线
- 视觉一致性测试:Skill Marketplace 与 MCP Marketplace 并排 — 视觉密度、列表项、详情面板、错误 banner **一致**;浏览模式(无限滚动 vs 显式分页)**各自 fit upstream**

## 10. 完成定义

1. 用户进入 MCP Marketplace 看到 **Recently Updated 段(9 条)+ 主列表(96 条)**双区域同时显示
2. 输入 query 触发服务端搜索,300ms debounce,Recently Updated 段隐藏,搜索结果显示
3. 点 Next 翻页,API `?cursor=<>` 触发,主列表替换;Previous 此时 enabled
4. 点 Previous 直接回退到缓存的上一页 state(无新 API 调用)
5. V1 全量 GET / 24h 文件 cache / 客户端 isLatest dedupe **代码物理删除**(不留 fallback)
6. install / auto-classify / add-to-Scene / Sync 流程不变
7. 视觉密度与 Skill Marketplace 一致,但浏览模式独立(显式分页)
8. release `.app` 替换 `/Applications/Ensemble.app`(in-place,无 timestamped backup)

## 11. 实施编排

| Stage | 谁做 | 产出 |
|---|---|---|
| 1 | 主 Agent | PRD V1 → V2 修订(已含 chrome-devtools 实测) |
| 2 | 用户审阅 | feedback / approval |
| 3 | 1 SubAgent(Opus 4.7,阻断) | 后端 IPC + 前端 store/types + McpMarketplacePage 重写,自动化 gate(cargo build / tsc / eslint)通过 |
| 4 | 主 Agent | `npm run tauri build` + 替换 `/Applications/Ensemble.app` |
| 5 | 用户实测 + 主 Agent commit | 用户认可 → commit;若回炉 → fix 循环 |

**没有多专家并行评审,没有自点击循环。** 用户验证 = 唯一质量 gate。

## 12. 范围红线

- 不写 `~/.claude.json` / 不动 `~/.claude/plugins/`(D-7 继承)
- 不引入新 design token(`design-language.md` Rule)
- 不接受 fallback phasing(`feedback_no_fallback_phasing.md`)
- 不复用 V1 cache 路径(必须物理删除)
- 不改 V1 install / auto-classify / Scene 流程
- 不强行让 MCP UX 与 Skill UX 一致(各自 mirror 上游 — 这是 V2 与 V1 的核心修订)
- `MCP_SEED` 任何变动需 per-entry 实测 verify(`validate-curated-upstream-ids.md` Rule)
