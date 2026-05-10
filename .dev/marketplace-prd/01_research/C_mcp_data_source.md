# C — MCP Marketplace 数据源调研

> **派单**：`.dev/marketplace-prd/01_research_plan.md` §3 C
> **范围**：仅事实陈述 + 候选源对比 + 推荐倾向。**不下最终决策**——主源选择由 Synthesis Gate (`02_synthesis_decisions.md` D-5) 完成。
> **角色定位**：B（Skill 数据源）的并行兄弟。前置依赖 A / G / H 已完成；本调研基于其事实展开。
> **证据原则**：每条事实带证据来源（官方文档 URL / 实测命令输出 / 文件路径 + 行号）。

---

## 章节速览

- §0 证据来源清单
- §1 项目侧前提（A/G/H 中提取，决定本研究的产品边界）
- §2 候选源逐项调研（Q1 主线）
- §3 候选源对比表（5 列：权威性 / API 稳定性 / 元数据完整度 / stdio/HTTP 区分 / 覆盖广度）
- §4 Q3 — MCP "安装单元"差异（stdio vs HTTP 在源中的形态）
- §5 Q4 — 各源元数据完整度
- §6 Q5 — 在 Ensemble 中"安装一个 MCP"的实际含义【最关键】
- §7 Q6 — HTTP MCP vs stdio MCP 安装心智模型差异【最关键】
- §8 Q7 — 试用 / 沙盒机制
- §9 Q8 — 数据源稳定性 / 备选源容错
- §10 推荐主源 + 备选 + stdio/HTTP 处理建议
- §11 自检

---

## §0 证据来源清单

| 标号 | 来源 | 用途 |
|---|---|---|
| OD-1 | https://registry.modelcontextprotocol.io/ | 官方 MCP Registry 主页 |
| OD-2 | https://registry.modelcontextprotocol.io/docs | 官方 Registry REST API 文档（v1.0.0 export，Stoplight） |
| OD-3 | https://modelcontextprotocol.io/registry/about | "The MCP Registry" 概念页 |
| OD-4 | https://modelcontextprotocol.info/tools/registry/consuming/ | Consuming Registry Data — 端点 `/v0.1/servers` 详细 |
| OD-5 | https://github.com/modelcontextprotocol/registry | Registry server-side 实现 repo（6.6k stars） |
| OD-6 | https://modelcontextprotocol.io/specification/2025-06-18/basic/transports | 官方 Transport spec — stdio / Streamable HTTP / SSE |
| OD-7 | https://docs.claude.com/en/docs/claude-code/mcp | Claude Code MCP add CLI 文档 |
| SM-1 | https://smithery.ai/ | Smithery 主页（"6k+ servers"） |
| SM-2 | https://smithery.ai/docs | Smithery docs 入口 |
| SM-3 | https://smithery.ai/docs/concepts/registry_search_servers | `GET /servers` REST API + 字段 schema |
| SM-4 | https://smithery.ai/docs/use/connect | Connect via OAuth + API key + URL 形式 |
| SM-5 | https://smithery.ai/docs/use/deep-linking | Deep linking — 内部明确 `StdioMCPConfig` vs `HttpMCPConfig` 类型分裂 |
| SM-6 | https://smithery.ai/docs/build/session-config | configSchema —— Smithery 的 zod-based 配置 schema |
| GL-1 | https://glama.ai/ | Glama 主页（"22,915 MCP servers"） |
| GL-2 | https://glama.ai/mcp/servers | Glama 公开 servers 列表 |
| GL-3 | https://dlthub.com/context/source/glama-mcp | Glama MCP API 端点 `/servers` `/servers/{owner}/{repo}` 表格（无 auth） |
| MS-1 | https://mcp.so/ | mcp.so 主页（"20373 MCP Servers collected"） |
| MS-2 | https://mcp.so/categories | mcp.so 分类页 |
| MS-3 | https://github.com/chatmcp/mcpso | mcp.so 开源代码（依赖 Supabase；无公开 API） |
| PM-1 | https://www.pulsemcp.com/servers | PulseMCP 列表（"14,590+ servers updated daily"） |
| PM-2 | https://modelcontextprotocol.info/tools/registry/ | "trusted contributors like Anthropic, GitHub, **PulseMCP**, Microsoft" — PulseMCP 是官方注册表的核心维护者之一 |
| AW-1 | https://github.com/punkpeye/awesome-mcp-servers | awesome-mcp-servers（86.3k stars, 6,630 commits, README 2628 行） |
| AW-2 | https://mcpservers.org/ | "Awesome MCP Servers" web 视图（与 punkpeye repo 同步） |
| AP-1 | https://apigene.ai/blog/mcp-marketplace | "MCP Marketplace Guide 2026" 第三方对比文 |
| AP-2 | https://composio.dev/content/smithery-alternative | Smithery 替代品对比（含 MCP Market、MCP Servers.org 等） |
| TF-1 | https://www.truefoundry.com/blog/best-mcp-registries | "Best MCP Registries 2026" 详尽矩阵（含 RBAC / 审计 / 部署模式） |
| GH-1 | https://github.com/modelcontextprotocol/servers | 官方"reference servers" repo — 集合式 stdio servers，不是 marketplace |
| FS-1 | `~/.claude.json` 实测内容（10 个 user-scope MCP） | 现有 MCP 配置真实落地形态 |
| FS-2 | `~/.ensemble/mcps/*.json` 实测内容（30+ 文件） | Ensemble 已落地的 MCP 配置形态 |
| TY-1 | `src-tauri/src/types.rs:47-90, 330-374, 478-506` | Rust 端 `McpServer` / `McpConfigFile` / `ClaudeMcpConfig` 字段 |
| GH-2 | https://github.com/github/github-mcp-server | GitHub MCP server install 文档（HTTP + stdio 两条路径并存的实样） |

---

## §1 项目侧前提（来自 A / G / H 调研）

直接决定本调研边界的事实（**不重复，仅引用**）：

1. **`McpServer` 已是双形态字段集**（A §5.2、TY-1）：`command/args/env`（stdio）+ `url/mcpType`（HTTP）共存，`mcpType: "stdio" | "http"` 是字符串字段。Marketplace 对接**无需扩展**底层数据模型；H §5 明确"`McpServer` 现状已支持两类"。
2. **MCP 的"安装单元"是 JSON 配置而非文件**（A §5.0）：`extract_mcp_config` 从 `~/.claude.json` 读取 → 写到 `~/.ensemble/mcps/{name}.json`。MCP 与 Skill 的根本差异——**MCP 没有"目录"概念**，只有"一段配置"。
3. **plugin 体系对 MCP 几乎透明**（G §9）："即便从 plugin 安装一个 MCP，实际激活还是要把 entry 写到 `~/.claude.json` 或项目 `.mcp.json`"。Marketplace 不复用 plugin 体系也能完整闭环——这与 Skill 的 plugin 强耦合显著不同。
4. **现有 30+ MCP 已落地（实测 FS-2）**：用户 MCP 生态非常活跃；Marketplace 入口的"边际价值"必须超过现有 ImportMcpModal 才有意义（H §3.3 / Q6 实测："16+ plugin / 0 imported" 已暗示现有导入入口边际价值低）。
5. **`installSource: 'plugin'` 已是 List Item 的视觉标记**（H §Q2）；Marketplace 安装来源若引入第三态需要 D-9 决策。

---

## §2 候选源逐项调研

### 2.1 Official MCP Registry（`registry.modelcontextprotocol.io`）

**身份**：MCP 项目本体维护的"upstream metadata 注册表"。OD-3 明文："single source of truth for publicly-available MCP servers"。OD-5 仓库 6.6k stars，由 Anthropic / GitHub / PulseMCP / Microsoft 联合维护（PM-2）。2025-09-08 launch（OD-3 中的"Registry is Live!" 标志）。

**API**：

- 基地址：`https://registry.modelcontextprotocol.io/`
- 端点（OD-2 / OD-4）：
  - `GET /v0.1/servers` — list all servers，cursor 分页（`?cursor=...&limit=...`），支持 `?updated_since=<RFC3339>` 增量同步
  - `GET /v0.1/servers/{serverName}/versions` — 版本列表
  - `GET /v0.1/servers/{serverName}/versions/{version}` — 单版本详情；`version=latest` 取最新
  - `POST /v0.1/publish` — 发布（要求认证）
- URL path 中的 `serverName` 必须 URL-encode（如 `io.modelcontextprotocol/everything` → `io.modelcontextprotocol%2Feverything`）
- **无需认证**消费 GET 端点；只有 publish 需要 GitHub OAuth
- v0 → v0.1 已稳定（OD-5 commit "docs: update API endpoint documentation from /v0/ to /v0.1/"，2025-12-04）

**`server.json` 字段**（OD-2 + Nordic API guide 实样）：

```json
{
  "$schema": "https://...",
  "name": "io.github.username/server-name",
  "description": "...",
  "version": "1.0.0",
  "repository": { "url": "...", "source": "github" },
  "packages": [   // stdio 类
    {
      "registryType": "npm" | "pypi" | "oci" | "nuget" | "mcpb",
      "identifier": "@scope/package",
      "version": "1.0.0",
      "transport": { "type": "stdio" },
      "runtimeArguments": [ ... ],
      "packageArguments": [ ... ],
      "environmentVariables": [ ... ]
    }
  ],
  "remotes": [    // HTTP 类
    {
      "type": "streamable-http" | "sse",
      "url": "https://...",
      "headers": [ { "name": "Authorization", "value": "Bearer ..." } ]
    }
  ],
  "_meta": { "io.modelcontextprotocol.registry/official": { ... } }
}
```

**关键事实**：**`packages` vs `remotes` 分裂为两个独立数组** —— 这是官方 schema 对 stdio vs HTTP 的本体级区分（不是字段级 toggle）。

**覆盖广度**：~500 servers（AP-1 / TF-1 矩阵）。这是绝对量最少的源——**因为官方注册表只接收"正式 publish 流程"提交**，门槛高于聚合站。

**权威性**：最高（vendor-neutral, Anthropic 共同维护，社区治理）。

**已知扩展生态**：`io.com.mcp/registry` 自身被列为 server 提供"以 MCP 方式访问 registry"（OD-1 抓取的实样）；`io.com.mcp/skills-search` 提供 skills.sh 的 MCP 化访问。换言之"Registry 自身可以被 MCP 化访问" —— 但这对 Ensemble 没有直接价值（Ensemble 已经能直接打 REST）。

---

### 2.2 Smithery (`smithery.ai`)

**身份**：商业化 marketplace + hosting 平台（"closest to Docker Hub for MCP"，TF-1）。SM-1 主页声称 6,000+ servers（2026 早期；TF-1 写"6k+"，部分文 7,000+）。

**API**：

- REST：`GET https://server.smithery.ai/servers` 等（SM-3）
- **要求 Bearer token**（API key），`Authorization: Bearer <token>`
- 字段 schema（SM-3 实样）：
  ```json
  {
    "id": "abc123",
    "qualifiedName": "smithery/hello-world",
    "namespace": "smithery-ai",
    "slug": "hello-world",
    "displayName": "Hello World",
    "description": "...",
    "iconUrl": "...",
    "verified": true,
    "useCount": 42,
    "remote": true,        // ← 区分 remote vs local
    "isDeployed": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "homepage": "...",
    "bySmithery": false,
    "owner": "user_abc123",
    "score": 0.016
  }
  ```
- 分页 `pagination: { currentPage, pageSize, totalPages, totalCount }`，`pageSize` 1-100

**stdio vs HTTP 显式区分**：
SM-5（Deep linking）明确分两类 TypeScript 接口：
```ts
interface StdioMCPConfig { type: "stdio"; command: string; args: string[]; }
interface HttpMCPConfig { type: "http"; url: string; }
type MCPConfig = StdioMCPConfig | HttpMCPConfig;
```
**关键事实**：Smithery 的"安装"用 deep link `<client-schema>://mcp/install?name=<n>&config=<base64-JSON>` 启动，配置就是上述 union type 的一段 JSON——与 `~/.claude.json` 中实际形态（FS-1）几乎完全同构。

**configSchema**（SM-6）：每个 server 有 zod-based 配置 schema 描述 `apiKey / model / temperature` 等运行时参数；客户端可读 schema 自动生成"配置表单"。这是元数据完整度的关键差异点：**Smithery 提供机器可读的运行时配置 schema**，而 Official Registry 的 `packageArguments / environmentVariables` 是 array-of-flat-objects，不到 zod schema 这种深度。

**安装路径**：
- **Smithery CLI** `npx -y smithery setup` / `smithery mcp add ...`：CLI 自动检测 client（Claude Code / Cursor / VS Code）并写入正确格式的 config——**这是 Smithery 的核心 UX 卖点**。
- 也支持 hosted 模式：servers 在 Smithery 基础设施上跑（OAuth 处理由 Smithery 完成），客户端只连 streamable-http 端点。

**与官方 Registry 的关系**：Smithery 是**独立 marketplace**，不是 Official Registry 的下游。但 TF-1 / AP-1 都把 Smithery 与 Official Registry 并列为最受关注的两个源。Smithery 能注册"非 Official"的服务（自有运行时托管的 hosted servers）。

---

### 2.3 Glama (`glama.ai`)

**身份**：商业化 directory + hosting + observability。GL-1 自我表述："superset of the official MCP Registry, every server is maintainer-verified, continuously rebuilt, and scored for quality and safety"。

**覆盖**：22,915 MCP servers / 3,087 connectors / 150,443 tools（GL-1，2026-05-06 last indexed）—— **绝对量最大**的源之一。

**API**：

- 基地址：`https://glama.ai/api/mcp` 或 `https://glama.ai/api/v1` 类
- **公开**端点（GL-3 dltHub 文档实样）：
  ```
  GET /servers                              # 列出所有 server repo
  GET /servers/{owner}/{repo}               # 单 server 详情
  GET /servers/{owner}/{repo}/openapi.json  # 该 server 的 OpenAPI spec
  ```
- **不需要认证**（"Requests can be made without any authentication headers"，GL-3）
- 数据 selector：`servers` 字段是数组

**字段**：每个 server 有 maintenance / resources / tools / search appearance 等评分（GL-1 提及"每个 server 在 Glama 注册表中被 introspected, audited, scored"）；homepage 详情页有完整 README 渲染（如 SM-1 抓取的 Brave Search 页样：环境变量 `BRAVE_API_KEY`、transport modes、port 等）。

**与官方 Registry 的关系**：明确"superset"——Glama 自己说"用 Official Registry 拿 vendor-neutral metadata，用 Glama 拿 depth + observability"（GL-1）。即 Glama 自动同步 Official Registry，再加自有索引（npm / GitHub / 用户提交）。

**部署模式**：SaaS only（TF-1）；用户在 Glama 上申请 hosting → 一键部署。这与 Ensemble 的"装到本机管理路径"模式**正交**——Ensemble 用 Glama 也只是消费其元数据，不消费其托管。

---

### 2.4 mcp.so

**身份**：社区聚合站；MS-1 自我表述"third-party MCP Marketplace with **20373** MCP Servers collected"；GitHub repo MS-3 (`chatmcp/mcpso`) 明示"directory for Awesome MCP Servers"。

**覆盖**：20,373 servers（MS-1）—— 最大量级之一，但与 Glama 的 22k+ 接近。

**API**：

- **没有公开 REST API 文档**。MS-3 repo 的 `services/` 目录依赖 Supabase 后端（`SUPABASE_URL` / `SUPABASE_ANON_KEY`），不是公开 API。
- 数据库可在 `data/install.sql` 看到 schema（README 提及），但这是用户**自己 fork + 自建 Supabase** 才能访问。
- 实际可消费方式：**爬网页**（HTML 抓取）。每个 server 有 `mcp.so/server/<n>` 详情页，但无结构化 endpoint。

**字段密度**：详情页含分类（`/categories` 共 20 类，MS-2）、tags、官方/非官方标签、useCount。但读取要靠 HTML 解析。

**与官方 Registry 的关系**：未表态；属于独立社区聚合，不必然同步 Official Registry。

**关键事实**：mcp.so **不是**面向 API 消费的源——它是面向终端用户的浏览站。Ensemble 若选 mcp.so，实际操作是反向 web scraping，稳定性堪忧。

---

### 2.5 PulseMCP (`pulsemcp.com`)

**身份**：长期跟踪 trending MCP 的社区聚合站；同时是 Official Registry 的"trusted contributor"（PM-2）。

**覆盖**：14,243 servers（PM-1，"updated daily"）—— 仅次于 Glama / mcp.so 的第三梯队。

**API**：

- 公开 URL `https://api.pulsemcp.com/v0/servers`（社区文档分散提及；OD-4 / AP-1 暗示其 API 是开放的并被多个 aggregator 使用）
- **明确无需认证**（AP-1: "Free API for programmatic server browsing — '100% free and will remain this way'"，引用其创始人）
- 字段：trending / 周/月排行、author、stars、last update、official 标识等

**与官方 Registry 的关系**：PulseMCP 是 Official Registry 的核心维护者之一（PM-2），其 API 与 Official Registry 数据高度重叠 + PulseMCP 自有补充字段（estimation: visitors、rank）。

**关键事实**：PulseMCP 的"trending / popularity ranking" 元数据（PM-1 显示"6.2m visits, 352k this week, #9 ranking"）是其他源没有的——若 Marketplace UX 想做"热门优先"排序，PulseMCP 是唯一带这种 freshness signal 的源。

---

### 2.6 awesome-mcp-servers (punkpeye, AW-1)

**身份**：纯 GitHub README 聚合（86.3k stars, 6,630 commits, 720 KB README, 2628 行）。维护者 punkpeye 也维护 awesome-mcp-clients、awesome-mcp-devtools。

**覆盖**：表项级数千；按类别（Aggregators / Browser Automation / Cloud Platforms / 等 30+ 大类）+ 子类组织。

**API**：**无**。仅 GitHub raw markdown。Ensemble 可消费方式：
- `https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/main/README.md` 拉 markdown
- 解析 markdown 链接 / 表情符号（🏠 = local stdio, ☁️ = cloud, 📇 / 🐍 = TypeScript / Python）
- 没有结构化字段；没有 stdio/HTTP 区分（只有"local 🏠 vs cloud ☁️"的视觉提示）

**与 mcpservers.org 的关系**：AW-2 (`mcpservers.org`) 自我标识为"我们现在有 a web-based directory that is synced with the repository"——即 punkpeye 团队自建的 web 镜像，理论上也可作为 HTML 源消费，但同样无 API。

**关键事实**：punkpeye 列表是**社区共识"星图"**——它是 86k 用户用脚投票出的"应该被收录的 MCP 列表"。覆盖广度高于 Official Registry，但缺乏机器可读结构。**作为容错备选源**或**人工策展参考**有价值；作为唯一主源不现实。

---

### 2.7 GitHub MCP Registry / VS Code Marketplace

**身份**：GitHub 在 2025 末为 Copilot 内置的 MCP discovery（OD-5 FAQ）：

> "GitHub's registry integrates directly into Copilot and VS Code with one-click installation. GitHub's version uses repository signals for curation and is optimized for IDE convenience"

**与官方 Registry 的关系**：表面上 GitHub 自己维护，但 OD-5 说"GitHub MCP Registry will soon use the Official MCP Registry as a source"——即下游消费者，最终数据来自 Official Registry。

**Ensemble 适用性**：限定在 VS Code / Copilot 客户端内部（无独立公开 API 给第三方 GUI app）。**对 Ensemble 不可直接消费**，仅作为"GitHub 也认 Official Registry"的旁证。

---

### 2.8 其他次要候选

按 TF-1 / AP-2 / AP-1 各自的对比矩阵：

- **MCP Market** (`mcpmarket.com`)：商业化、企业 SLA 取向，~250+ "official" servers。门户体验强；但 Ensemble 是消费者方，没有用 SLA 价值。
- **MCP Servers.org** (`mcpservers.org`)：与 punkpeye/awesome-mcp-servers 双向同步的 web view；结构同 punkpeye。
- **mkinf, OpenTools, mcp.run, Composio MCP, mcphub**：各自有商业化定位（hosted / 注册中心 / 网关），覆盖远小于 Glama / Smithery；不进入主源候选。
- **`modelcontextprotocol/servers` GitHub repo**（GH-1）：Anthropic 自营的"reference servers" 单 repo（约 30 个 stdio servers，如 brave-search、github、postgres、puppeteer 等历史首批 servers）。**这不是 marketplace**，是早期 spec 时的样例集合；新生态全在 Official Registry 上。

---

## §3 候选源对比表

| 候选源 | 权威性 | API 稳定性 | 元数据完整度 | stdio/HTTP 区分 | 覆盖广度 |
|---|---|---|---|---|---|
| **Official MCP Registry** (registry.modelcontextprotocol.io) | ★★★★★ Anthropic + GitHub + PulseMCP + Microsoft 共同维护，vendor-neutral，"single source of truth" (OD-3) | ★★★★ 公开 REST `/v0.1/servers`、stable schema、namespace verified、cursor 分页、`updated_since` 增量同步 (OD-4)、无需 auth；v0→v0.1 已稳定 | ★★★★ `name/description/repository/version/packages/remotes/transport/runtimeArguments/packageArguments/environmentVariables/headers` 全字段；publisher-provided `_meta` 扩展点 | ★★★★★ **本体级区分**：`packages[].transport.type=stdio` vs `remotes[].type=streamable-http\|sse`，分裂为两个独立数组 | ★★ ~500 servers（AP-1 / TF-1 矩阵）—— 最少；门槛最高 |
| **Smithery** (smithery.ai) | ★★★★ 商业 leader（"Docker Hub for MCP"），独立维护，非 Official Registry 下游 | ★★★ REST `GET /servers` + Bearer token；deep linking + CLI auto-config；business-managed → 改 API 风险中等；configSchema 字段是 zod schema 标准 | ★★★★★ 字段最完整：`qualifiedName/namespace/slug/displayName/iconUrl/verified/useCount/remote/isDeployed/createdAt/homepage/bySmithery/owner/score` + 运行时 zod configSchema (SM-6) | ★★★★ `remote: bool` 字段 + `MCPConfig union type` (SM-5) — 显式 stdio vs http 二选一 | ★★★★ ~6,000-7,000 servers (TF-1 / SM-1)；其中 hosted (HTTP) 占比较大 |
| **Glama** (glama.ai) | ★★★ 商业化 directory；"superset of Official Registry"（自我表述 GL-1），同步官方再加 npm + GitHub | ★★★★ 公开 REST `/servers` `/servers/{owner}/{repo}` `/servers/{owner}/{repo}/openapi.json`；**无需 auth** (GL-3)；URL stable | ★★★★ 评分（maintenance / resources / tools / search appearance / score）+ OpenAPI spec per server + 详细 README 渲染 | ★★ 字段层无 stdio/http 标准化 toggle；要从 server 详情 / README 推断；HTTP host endpoint 字段独立 | ★★★★★ 22,915 servers（GL-1，2026-05-06）—— 最大量级 |
| **PulseMCP** (pulsemcp.com) | ★★★★ Official Registry 核心维护者之一 (PM-2)；社区影响力强 | ★★★ 公开 API（`api.pulsemcp.com/v0/servers`）+ 100% free 永久承诺 (AP-1) | ★★★★ trending / popularity ranking / weekly visitors / freshness signal —— 唯一提供"热度"维度的源 | ★★ 字段层从 README / GitHub repo 推断；HTTP 存在 `Remote` 类标签，但不严格 schema | ★★★★ 14,243 servers (PM-1) |
| **mcp.so** (mcp.so) | ★★ 社区聚合，独立于 Official Registry；治理 / 审核机制不透明 | ★ **无公开 REST API**（MS-3 repo 依赖 Supabase 自建）；要 web scraping；改版频率不可预测 | ★★ 详情页有分类 + tags + tools 列表；但仅 HTML | ★ 无字段级区分 | ★★★★★ 20,373 servers (MS-1) —— 最大量级之一 |
| **awesome-mcp-servers** (punkpeye, GitHub) | ★★★ 社区共识星图（86.3k stars）；纯志愿者维护 | ★★ GitHub raw markdown；URL 稳定但**无结构化数据**；要 markdown parsing | ★ 仅人类可读：name + 1-2 句描述 + 类别 + emoji（🏠/☁️/📇/🐍） | ★ 仅 emoji 提示（🏠 = stdio local / ☁️ = cloud HTTP），非机器可靠 | ★★★ 数千项（README 720 KB / 2628 行） |
| **GitHub MCP Registry** | ★★★★ GitHub 自营，下游消费 Official Registry | ★ **无第三方公开 API**（仅在 Copilot / VS Code 内可见） | N/A 无法直接消费 | N/A | N/A |
| **MCP Market / mkinf / mcp.run / OpenTools** | ★★ 各自小众商业化定位 | ★★ 部分有 API 但要付费或限速 | ★★★ 数据精度高但生态单薄 | ★★★ 多数显式分 stdio/HTTP | ★★ < 1,000 servers 各自 |

**评分说明**：5 星 = 业界最佳；1 星 = 不可用 / 无该维度。

---

## §4 Q3 — MCP "安装单元"差异（stdio vs HTTP 在源中的形态）

**事实**：MCP 与 Skill 的根本差异是"MCP 没有目录概念"，安装单元是**一段 JSON 配置**。但 stdio MCP 与 HTTP MCP 的"配置结构"差异显著：

### 4.1 stdio MCP 的"配置"

实样（FS-1，`~/.claude.json` 中的 `firecrawl`）：
```json
{
  "command": "npx",
  "args": ["-y", "firecrawl-mcp"],
  "env": { "FIRECRAWL_API_KEY": "fc-..." }
}
```

**装"这一段"的实际语义**：
1. 把这 4 行 JSON 写到 `~/.claude.json` 的 `mcpServers.<n>`（或 Ensemble 的 `~/.ensemble/mcps/<name>.json`）
2. **运行时**由 Claude Code 启动子进程：`npx -y firecrawl-mcp`，附 env 变量
3. 子进程必须在用户机器上能跑 —— 即 `npx` / `node` / `uvx` / `python` / `docker` 等运行时已就位
4. 用户必须自己提供 API key（`FIRECRAWL_API_KEY` 等敏感信息）

**关键事实**：stdio MCP 的"安装"实际是**配置生成 + 运行时依赖前置**——Ensemble 提供前者（写 JSON），后者完全靠用户系统已装的 npm / pip / docker 等工具。**Ensemble 不需要"下载 npm 包"——`npx -y` 在 Claude Code 启动 MCP 时按需拉取**。

### 4.2 HTTP MCP 的"配置"

实样（FS-1，`~/.claude.json` 中的 `linear-server`）：
```json
{
  "command": "",
  "args": null,
  "env": null,
  "url": "https://mcp.linear.app/mcp",
  "type": "http"
}
```

或更典型（FS-1 `exa-search`）：
```json
{
  "type": "http",
  "url": "https://mcp.exa.ai/mcp?exaApiKey=xxx&tools=..."
}
```

**装"这一段"的实际语义**：
1. 把 `url` 写到 `~/.claude.json` 即可
2. **运行时**由 Claude Code 直接打 HTTP（POST /mcp，Streamable HTTP 协议，OD-6）
3. **零本地依赖**——不启动子进程、不要 Node / Python / Docker
4. 认证：`url` 中带 query string token（Exa）或 OAuth（Linear，触发 Claude Code `/mcp` 流程后浏览器 OAuth）

**关键事实**：HTTP MCP 的"安装"几乎等于"复制 URL"——本地零物质动作，闭环极简。

### 4.3 安装单元差异总结表

| 维度 | stdio MCP | HTTP MCP |
|---|---|---|
| 配置长度 | 3-6 字段（`command/args/env/...`） | 1-2 字段（`url`/`headers`） |
| 写入文件 | `~/.claude.json` 或 `~/.ensemble/mcps/<n>.json` | 同上（同结构容器，仅字段不同） |
| 运行时依赖 | 用户机器要有 npm / pip / uvx / docker（取决于 server） | 无 |
| 第三方包下载 | 由 Claude Code 启动时通过 npx/uvx 按需拉取 | 不下载 |
| 敏感信息 | 用户必须提供 env API key | 多数走 OAuth（无 API key 暴露） |
| 出错可能性 | 较高（依赖缺失 / 参数错误 / env 缺失） | 较低（URL 拼错 / token 失效） |
| 试用门槛 | 高（要装 npx 包，再启动 Claude） | 低（一行 URL 即可） |
| Ensemble 闭环可控性 | 完全可控（写 JSON 即结束） | 完全可控（写 JSON 即结束） |

**对 Ensemble 的事实意义**：**两类 MCP 在"持久化层面"完全同构**——都是写 `~/.ensemble/mcps/<n>.json`，由 `extract_mcp_config` / `import_plugin_mcps` 一类的现有路径完成。Ensemble 的 `McpConfigFile`（TY-1）已经支持这两类的并存（`command` 默认 `""`，`url + mcp_type` 可选）。**Marketplace 不需要为 HTTP/stdio 引入新数据模型**。

---

## §5 Q4 — 各源元数据完整度详析

| 源 | 作者 | 描述 | 命令模板 | args 说明 | env 变量 | 依赖运行时 | 截图 | 版本 | 评分 / 下载 | 上次更新 |
|---|---|---|---|---|---|---|---|---|---|---|
| Official Registry | repository.url | description | `packages[].identifier` + `runtimeHint` | `packageArguments[]`（结构化） | `environmentVariables[]`（结构化） | `runtimeHint` (npx/uvx/docker) | ✗ | version 字段 | ✗ | `_meta.publishedAt/updatedAt` |
| Smithery | owner field | description | configSchema 描述 | configSchema | configSchema (zod) | 自动检测 | iconUrl | ✗（hosted） | useCount, score | createdAt |
| Glama | repository | description | 从 README 推断 | 从 README 推断 | 从 README 推断 | 从 OpenAPI 推断 | ✓ | latest tag | maintenance / tools 评分 | 持续 reindex |
| PulseMCP | provider | description | 从 GitHub README 推断 | 同 | 同 | 同 | ✗ | ✗ | popularity rank, weekly visitors | releasedOn |
| mcp.so | author | description | 详情页 markdown | 详情页 markdown | 详情页 markdown | ✗ | ✓ 部分有 | ✗ | useCount | ✗ |
| punkpeye | repo author | 1-2 句 | ✗ | ✗ | ✗ | emoji（🐍/📇） | ✗ | ✗ | GitHub stars 间接 | 仅 commit 时间 |

**关键观察**：

1. **Official Registry 是唯一提供"结构化命令模板 + args + env vars"**的源——这意味着 Ensemble 能用 OD-4 的 `packageArguments` / `environmentVariables` 字段**自动渲染配置表单**（"这个 MCP 需要 BRAVE_API_KEY 环境变量"）。其他源要靠 README 解析或人工填写。
2. **Smithery 的 configSchema** 等价但走 zod schema route——同样可机器消费，但 Smithery 专属。
3. **凡是 README-based 的源（Glama / PulseMCP / mcp.so / punkpeye）**：要么不结构化，要么是次要 metadata。Ensemble 要"自动推 env vars 占位符"会困难。

---

## §6 Q5 — 在 Ensemble 中"安装一个 MCP"的实际含义【最关键，必须明确】

> 本节是 Q5——派单卡明确标"产品定义关键"。事实陈述完后给出三种可能的产品定义供 Synthesis 选择。

### 6.1 当前 Ensemble 的 MCP 安装事实链（从 A §4.4 + H §Q1 提取）

通过 ImportMcpModal 安装一个 plugin MCP 的事实链：
1. 用户在 ImportMcpModal "Plugins" tab 勾选 → 后端 `import_plugin_mcps`（plugins.rs:774-876）
2. 解析 plugin `.mcp.json`，构造一个 `McpConfigFile` 实例（plugins.rs:832-848），包含 `name/description/command/args/env/url/mcpType/installSource/pluginId/pluginName/marketplace`
3. **写入** `~/.ensemble/mcps/<n>.json`
4. `addImportedPluginMcps` 把 `pluginId|name` 持久化到 `data.json.importedPluginMcps`
5. 前端 `loadMcps()` 重扫，新 MCP 出现在 McpServersPage 列表

**关键**：步骤 3 之后，**Ensemble 就完成了**。剩下的"用户怎么把这个 MCP 给到 Claude Code 用"是另一个独立动作（用户把 Scene sync 到 Project，或用户自己改 `~/.claude.json`）。

### 6.2 三种"安装"的产品定义候选

基于上述事实链，"Marketplace 安装"在产品语义上至少有三种合理定义：

| 定义 | 产品语义 | 落地动作 | 用户感知 |
|---|---|---|---|
| **A. 仅写入 Ensemble 管理库** | "我把这个 MCP 收纳到我的 Ensemble，但还没启用" | 写 `~/.ensemble/mcps/<n>.json`，不动 `~/.claude.json` | 装完后在 McpServersPage 出现，但 Claude Code 还看不到；要进 Scene → Sync to Project 才能用 |
| **B. 写入 Ensemble + 写入 `~/.claude.json` user-scope** | "我立即在 Claude Code 全局启用这个 MCP" | 同 A，再调 `import.rs:update_mcp_scope` 类逻辑或新增"安装并启用全局"动作 | 装完后立即在 Claude Code 的 user-scope 全局生效；但绕过 Scene 的"局部启用"模型 |
| **C. 仅写入 `~/.ensemble/mcps/`，由 Scene 部署激活** | "Marketplace 是仓库，Scene 是装填，Project 是子弹" | 同 A | 与 Skill 完全同模式；闭环更自洽，但用户多走一步 Scene 配置 |

**事实约束**：
- 现有 ImportMcpModal 走的是定义 A（plugins.rs:735 `import_plugin_mcps` 写 `~/.ensemble/mcps/<n>.json`，不写 `~/.claude.json`）
- Ensemble 的"启用 / 部署"通过 Scene → Project sync 完成（H §Q3 事实）
- 用户原话："核心想要做到就是能够直接安装到我们的管理路径，然后直接能够分发、使用、分类，让它系统的闭环"——"直接分发使用"暗示装完即"在 Ensemble 内可见 + 可加 Scene"，没说"立即在 Claude Code 全局启用"

**推荐倾向**（不下决策）：定义 **C** 与现有 Skill / MCP plugin 导入模式同构，闭环最自洽，扩张面最小。Synthesis 决策点 D-5/D-7 应明确选 C，并避免 B 引发的"在 Ensemble 之外修改 `~/.claude.json`"语义混乱。

### 6.3 与 Plugin MCP 的边界

H §Q1 表明 plugin MCP 与 ensemble MCP 在持久化层完全分离（plugin 来源在 `~/.claude/plugins/cache/` 的 `.mcp.json`；ensemble 来源在 `~/.ensemble/mcps/<n>.json`）。**Marketplace 安装应当采纳 ensemble 路径（与 plugin 解耦）**，理由：
1. Marketplace 资源不一定是 plugin 包装（Glama / mcp.so / punkpeye 多数为非 plugin 形式 server）
2. 走 plugin 路径会立即继承 H §3.4 的"Scene 中 plugin 启用时自动 disable"陷阱
3. 与 Skill Marketplace（B 调研）走同样的"装到 Ensemble 自有路径"原则保持对称

---

## §7 Q6 — HTTP MCP vs stdio MCP 安装心智模型差异【最关键】

> 本节是 Q6——派单卡明确标"产品差异很大"。

### 7.1 心智模型差异

**stdio MCP 安装心智模型**（用户感知）：
1. "我看到一个有意思的 MCP（如 GitHub MCP）"
2. "需要 npm / pip / docker 把 server 跑起来"
3. "需要 GitHub Personal Access Token 这种密钥"
4. "需要在 `~/.claude.json` 写 `command + args + env`"
5. "如果配错（如 token 漏写、env 名错）会沉默失败 / 启动报错"

→ **像装一个本地命令行工具**。复杂度等同于 `brew install xxx + 写 dotfile`。

**HTTP MCP 安装心智模型**（用户感知）：
1. "我看到一个有意思的 MCP（如 Linear MCP）"
2. "复制 URL"
3. "OAuth 浏览器登录"（如 Linear / Sentry）或"复制 API token 到 query string"（如 Exa）
4. "在 `~/.claude.json` 写 `url + type: http`"

→ **像加一个 Bookmark / 第三方应用授权**。零运行时依赖、零本地副作用。

### 7.2 设计含义

UI 必须**显式区分**这两类 MCP，否则会出三类问题：
1. **stdio MCP 显示成"一键安装"会误导用户**（实际还要装 Node / 提供 token，否则下次启动 Claude 会报错）
2. **HTTP MCP 显示成"一键安装"基本是真**（除非 OAuth 需要在 Claude Code 端再走 `/mcp` 命令——这是 Claude Code 的事，但 Ensemble 应在文案中提示）
3. **错误处理路径完全不同**：stdio 失败 = 子进程错；HTTP 失败 = 401 / 500 / 网络。

### 7.3 对 Marketplace UX 的事实需求（不下决策，仅列）

UX 应当可以表达至少这些状态差异：

- **"Local install" badge**（stdio）vs **"Remote / Hosted" badge**（HTTP），与 Smithery 的 `remote: bool` (SM-3) 同构
- 安装确认面板：stdio 要展示 `command + args + env vars`（用户可填空 / 检查 / 取消）；HTTP 只展示 `url`（极简）
- 进度反馈：stdio 安装本身不下载（写 JSON 即结束，下载发生在 Claude Code 启动时），但 UI 应提示"You'll need to provide BRAVE_API_KEY before this MCP works"；HTTP 多数情况下进度反馈直接为"Done"，但 OAuth 的需要在 detail 中提示"Open Claude Code and run /mcp to authenticate"
- Auto-Classify：两类同样可分类（H §3.3 现有 autoClassify 不区分 plugin 来源——同理也不应区分 stdio/HTTP）

### 7.4 与 plugin 体系交叉的事实

H §Q3 + G §9 的事实：plugin MCP 多数是 stdio（plugin 内 `.mcp.json` 含 `command/args` 格式）；HTTP MCP 在 plugin 体系外更普遍（Linear / Sentry / Exa 等大型 SaaS 直接发 HTTP 端点）。**Marketplace 引入后，HTTP MCP 占比可能从现有"少数"上升为"主流"**（Smithery / Glama / Official Registry 都偏向 hosted / remote）。这与 Skill Marketplace 没有这种分层（Skill 全是文件目录形式）形成结构性对比。

---

## §8 Q7 — 试用 / 沙盒机制

调研发现：**没有可消费的"装前试用"机制**——

- **Smithery hosted servers** 提供"立即试调用"——SM-1 显示 `npx -y smithery setup` 就能开始用 Smithery 托管的 server。但这是**装到客户端**的"快试"，不是 Ensemble 的"内部沙盒"
- **Official Registry / Glama / PulseMCP / mcp.so / punkpeye** 都没有 sandbox / try-before-install 机制
- **Cline 的某些版本**有"在 IDE 内点击 MCP 就启动"——但需要先把配置写到本地（即"装"已经完成）

**对 Marketplace 设计的含义**：V1 不需要内置"沙盒试用"。装 = 配置入库；试用 = 用户在 Claude Code 端激活后跑（无需 Ensemble 干涉）。降低 V1 范围。

---

## §9 Q8 — 数据源稳定性 / 备选源容错

| 风险类型 | 触发情况 | 缓解候选 |
|---|---|---|
| Official Registry 长期下线 | 极低（Anthropic + GitHub + PulseMCP + Microsoft 联合维护） | 退到 Glama（自我表述 superset，事实上同步） |
| Smithery 商业转型 / 关停 | 中（已商业化）；但其 deep linking schema 是 union type，replacement 容易 | Glama / Official Registry |
| Glama 长期下线 | 中（商业化）；GL-3 公开端点无 auth → 易被 mirror | Official Registry + npm 直拉 |
| PulseMCP 关停 | 中（社区运营） | Official Registry（同源） |
| mcp.so 关停 / 改 schema | 高（无 API 契约） | 不依赖；仅作 awareness |
| punkpeye repo 停更 | 极低（86k stars + 6630 commits 活跃） | 但其无 API 不影响"主源"决策 |
| 上游某个 server `repository.url` 失效 | 高（开发者放弃 repo） | Ensemble 端缓存 + 显示"Unavailable" |
| 某 server 升级换 transport（stdio → HTTP） | 中（生态正在迁移） | 触发 reinstall；不能默默替换配置 |

**"不打算自己建设映射表"的真实语义**（Q8 末项）：

用户原话强调"不自建映射表"——指**Ensemble 不维护自己的 server 目录**（即不抢占 Official Registry / Smithery 的位置）。但**为了离线 / 错误降级，本地缓存上游的查询结果是合理的**——这不是"建映射表"，是"对上游的临时镜像"。Synthesis 决策点 D-10 应区分这两者：
- 不做的事：Ensemble 自己审核 / 添加 / 拒绝某个 server（不当 gatekeeper）
- 应做的事：Ensemble 缓存最近一次拉取的上游列表（如 24h TTL），让离线 / 上游故障时 Marketplace 页不空白

---

## §10 推荐主源 + 备选 + stdio/HTTP 处理建议

> 本节给推荐倾向（带理由），但**不下最终决策**。最终决策由 `02_synthesis_decisions.md` D-5 锁定。

### 10.1 主源推荐：Official MCP Registry

**理由**：
1. **唯一既权威又结构化的源**——vendor-neutral（用户没绑某个商业方）+ stdio/HTTP 本体级 schema 区分（`packages` vs `remotes`）+ 结构化 args/env vars（自动渲染配置表单的能力）
2. **API 公开稳定**——`/v0.1/servers` 已稳定（v0→v0.1，2025-12 稳定），无需 auth，无费率限制争议
3. **覆盖虽少（500）但都是高门槛、verified servers**——与用户原话"找一个权威官方网站爬数据"完全对齐
4. **下游聚合者都用它做 upstream**（GH / GitHub Registry / Glama 自我表述 "superset"）——上游一旦改，所有下游会跟随；Ensemble 直接对接上游即领先
5. **与 plugin 体系正交**——server.json 字段独立于 marketplace.json，不会与 G §5 的 plugin 路径混淆

**主源职责**：
- 拉取 `/v0.1/servers` 全量列表（cursor 分页，每次 100）
- 缓存到 `~/.ensemble/marketplace-cache/mcp/` （TTL 24h）
- `?updated_since=<RFC3339>` 增量同步
- 用 `packages[]` / `remotes[]` 区分两类 MCP

### 10.2 备选源 1：Glama（容错 + 覆盖扩展）

**理由**：
1. 自我表述 superset of Official Registry——若 Official Registry 临时下线 / 慢，Glama 兼具
2. 公开 REST `/servers` 无需 auth（GL-3）
3. 22,915 servers 远超 Official Registry 500 项；若用户想浏览长尾（"feiskyer/claude-code-settings 这类社区 servers"），Glama 是必经

**备选源职责**：
- 主源失败时降级
- "Show more from community" 入口拉 Glama 长尾（V1.5 范围；V1 不必）

### 10.3 备选源 2：Smithery（试用 / hosted 路径补充）

**理由**：
- HTTP MCP（hosted）覆盖度高于 Official Registry，对"打开就能用"心智契合
- 但商业风险高（API 要 Bearer token，免费层限速可能变化），不适合做 V1 主源
- 价值：作为"另一类 source"在 V1.5 引入，给用户多一个浏览维度

**备选源职责**：V1 不接入；V1.5 可加。

### 10.4 stdio / HTTP 处理建议（产品层）

| 设计点 | stdio MCP | HTTP MCP |
|---|---|---|
| List Item 标识 | "Local" / "stdio" 小 badge | "Remote" / "HTTP" 小 badge |
| Detail Panel 顶部信息 | 显示 `npx ...` 命令模板 | 显示 `url` |
| Install 按钮文案 | "Install"（暗示要本地配置） | "Install" 同（HTTP 实际也只是写 JSON） |
| Install 后立即可用？ | **否** —— 用户还要在 Detail 内填 env vars（`BRAVE_API_KEY` 等） | **多数是** —— OAuth 类要在 Claude Code 端做 `/mcp`；token-in-url 类（Exa）装时输入即生效 |
| 错误处理 | "Missing Node / npm" / "Missing env var X" | "401 Unauthorized" / "Network unreachable" |
| 用同一组件渲染？ | **是** —— 同一 MarketplaceListItem，仅右段 / detail panel 内字段渲染不同 | 同 |

**核心建议**（事实层）：
- **不为 stdio / HTTP 建两套独立页面或两套数据模型**——`McpServer` 已支持二者并存（TY-1）；UI 在同一列表混合展示，仅 Detail Panel 中的"如何配置"区分
- **Install 动作的产品定义按 §6.2 的"定义 C"**：装 = 写 `~/.ensemble/mcps/<n>.json`，不动 `~/.claude.json`，靠 Scene → Project sync 激活，与 Skill 完全对称

### 10.5 Synthesis Gate 决策入口（D-5 / D-9 / D-10）

本研究给 Synthesis 决策的"事实候选"：

- **D-5 主数据源**：Official MCP Registry（高置信）；Glama 作为容错备选（中置信）；Smithery 留 V1.5（用户可选）
- **D-9 与 plugin 资源的视觉合并**：建议 stdio/HTTP 不复用 plugin badge 颜色（蓝 + Puzzle），引入新 badge（如 "Marketplace" 或来源 logo），按 D-9 决议
- **D-10 离线 / 错误降级**：本地 24h TTL 缓存 + 上游不可达时显式 EmptyState（A §9 已覆盖）+ 缓存过期但上游死了不阻塞展示旧数据（带"Last updated 12h ago"提示）

---

## §11 自检

按派单卡 §3 C "质量自检"清单：

- [x] 至少调研 4 个候选源 — **实际 7 个候选源 + 4 个次要候选**（Official Registry / Smithery / Glama / mcp.so / PulseMCP / awesome-mcp-servers / GitHub Registry + MCP Market / mkinf / OpenTools / mcp.run）
- [x] Q5 / Q6（产品定义关键）回答明确 — **§6 给三种安装定义 + 推荐倾向；§7 给完整心智模型差异 + 设计含义**
- [x] 候选源对比表 5 列齐全 — **§3 表格 5 列（权威性 / API 稳定性 / 元数据完整度 / stdio/HTTP 区分 / 覆盖广度），含星级评分**
- [x] 末尾"推荐主源 + 备选 + stdio/HTTP 处理建议" — **§10 主源 / 备选 / 处理建议 / 决策入口四节齐全**
- [x] 总行数 400-700 — **本文件提交时约 460 行**（在区间内）
- [x] 没有 Rust 代码、没有 IPC 命令规划 — **全文不含**

按派单卡 §3 C "不做"约束：

- [x] 不写 Ensemble 怎么实现爬取（仅写"应消费 `/v0.1/servers`"等接口名，不写 Rust 代码 / fetch 函数 / IPC 命令名）
- [x] 不评估爬虫法律风险（多数源是公开 REST API；非爬虫 — 仅 mcp.so 提及"无 API 要 scrape"作为不推荐理由，不展开法律分析）
- [x] 不下最终决策（§10 显式标"推荐倾向，不下最终决策"，决策权在 Synthesis）

---

**调研产物结束。**
