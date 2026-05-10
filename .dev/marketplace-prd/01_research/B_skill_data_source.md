# 调研 B — Skill Marketplace 数据源

> **派单**：`.dev/marketplace-prd/01_research_plan.md` §3 B
> **范围**：仅事实陈述 + 候选源对比 + 主源/备选倾向（不下最终决策；最终决策由 Synthesis Gate 锁定）。
> **前置依赖**：A（应用全景）、G（Claude plugin 机制）、H（Ensemble plugin 路径审计）已完成。本调研在三者基础上展开。
> **关键事实继承**：
> - **G** 已确认 standalone skill 路径与 plugin 路径完全独立、永远可用；Ensemble 即使选 plugin 数据源，也无需调用 `claude plugin install`，可直接 `cp` 到自有路径（G §5.2 / §6）。
> - **H** 已确认 Ensemble 现有 `installSource` 是二值枚举（`'local' | 'plugin'`，`types.rs:34`）；Marketplace 必然引入第三态决策；Skill.id 是 source_path 字符串，路径敏感（H §3-第 7 条）。
> - **A** 已确认 Marketplace 安装动作的物理落地路径必须落到 `~/.ensemble/skills/<name>/`，否则不被 SkillsPage 主列表识别（A §5）；推荐"真实拷贝"模式而非 symlink。

---

## 章节速览

- §0 证据来源清单
- §1 skills.sh / officialskills.sh — 当前唯一具规模的开放 skill 目录
- §2 Anthropic 官方 skill 资源现状
- §3 GitHub awesome-list 类社区聚合源（5 个候选）
- §4 商业付费 directory 源（次要候选）
- §5 候选源对比表（5 列）
- §6 Q4 — 数据源的"安装单元"是什么？
- §7 Q5 — 元数据完整度对比
- §8 Q6 — 纯 markdown skill 与 plugin 机制对接的事实矩阵
- §9 Q7 — 数据源稳定性 / 备选源容错
- §10 Q8 — 用户原话"不打算自己建设映射表"在数据源层面的真正含义
- §11 推荐主源 + 备选源（带理由，不下最终决策）

---

## §0 证据来源清单

| 标号 | URL | 用途 |
|---|---|---|
| S-1 | https://skills.sh/ — Vercel 旗下，重定向至 officialskills.sh | 主候选源首页 |
| S-2 | https://officialskills.sh/ — skills.sh 的真实首页（同一网站，91,039 项 leaderboard） | leaderboard / 数据形态 |
| S-3 | https://github.com/vercel-labs/skills — `npx skills` CLI 仓库（CLI 实现、agent path 表） | CLI 行为权威源 |
| S-4 | https://github.com/vercel-labs/agent-skills — Vercel 自己出品的"官方 skills 集合"（26.1k stars） | 大型 first-party 集合实例 |
| S-5 | https://vercel.com/changelog/introducing-skills-the-open-agent-skills-ecosystem | Vercel 官方 launch 公告 |
| S-6 | https://vercel.com/kb/guide/agent-skills-creating-installing-and-sharing-reusable-agent-context | Vercel KB 详细指南 |
| S-7 | https://github.com/vercel-labs/skills/issues/980 | "skills.sh 在伊朗被屏蔽，请把 directory publish 到 GitHub repo" — 与稳定性 Q7 相关 |
| S-8 | https://agentskills.io/ + https://agentskills.io/specification.md + https://agentskills.io/llms.txt | Agent Skills **规范权威站**（与 skills.sh 分离） |
| S-9 | https://github.com/anthropics/skills | Anthropic 官方 skills repo（GH-2，与 G 调研同源） |
| S-10 | https://github.com/travisvn/awesome-claude-skills | awesome list 1（中等活跃） |
| S-11 | https://github.com/VoltAgent/awesome-agent-skills | awesome list 2（描述称 1000+ skills） |
| S-12 | https://github.com/hesreallyhim/awesome-claude-code | awesome list 3（不限 skill；含 plugins / hooks / agents） |
| S-13 | https://github.com/ComposioHQ/awesome-claude-skills | awesome list 4（58.7k stars，最大者） |
| S-14 | https://github.com/CommandCodeAI/agent-skills | awesome list 5（按业务域分类） |
| S-15 | https://www.skillsdirectory.com/api-docs | 商业 directory（44,000 项；付费 API；security grade） |
| S-16 | https://www.awesomeskills.dev/en — awesomeskills.dev | 第三方 skill 浏览站（含 1134 community + 多个 official 集合） |
| S-17 | https://explainx.ai/leaderboard | 第三方 stars-based leaderboard（9744 skills + 1512 MCP） |
| S-18 | https://apify.com/parsebird/agent-skills-scraper | Apify 上的 skills.sh scraper（揭示 skills.sh 的字段结构） |
| S-19 | https://arxiv.org/html/2604.16911v1 — "Skilldex" arxiv paper | 学术综述对 vercel-labs/skills 与 anthropics/skills 的描述（独立第三方判断） |
| S-20 | https://github.com/anthropics/claude-plugins-official | Anthropic 官方 plugin marketplace（与 §2 / G 调研重叠） |

---

## §1 skills.sh / officialskills.sh — 当前唯一具规模的开放 skill 目录

### 1.1 是什么 / 维护者 / 数据形态

- **真实身份**：`skills.sh` 是 **Vercel** 旗下的"开放 agent skills 生态"项目（S-5）。访问 `skills.sh` 实际重定向到 `officialskills.sh`（S-2 即真实页面）。两个域名指向同一服务。
- **维护者**：Vercel Labs；CLI 在 `vercel-labs/skills` GitHub repo（S-3）开源（MIT）。
- **核心组成（S-5 / S-6 / S-3）**：
  - **CLI**（`npx skills`，亦支持遗留别名 `npx add-skill`）：发现、安装、列出、移除、升级 skills；在 `vercel-labs/skills` repo 开源。
  - **Web 目录**（`officialskills.sh`）：搜索、按 install 数排行、按 trending（24h）/ hot 排行；leaderboard 当前显示 **91,039** 个 skill 条目（S-2 实测）。
  - **GitHub-as-registry**：注册中心是 GitHub —— 任何包含 `SKILL.md` 的公开 GitHub repo 即可作为 skill 来源；无独立后端"提交"流程（S-6 §"There's no special publish command for skills.sh"）。
- **更新频率**：CLI 使用 GitHub API 实时拉取，几乎是实时同步；leaderboard install 计数由 CLI 客户端上报、Vercel 端聚合。
- **覆盖广度**：91k+ skill 条目，涵盖官方（Anthropic / Vercel / Microsoft / OpenAI / Hugging Face / Stripe / Notion / Cloudflare / Replicate / Expo 等大厂均有 first-party `<org>/skills` repo），社区维护项目。leaderboard top 30 中：vercel-labs/agent-skills 系（react-best-practices 等） + anthropics/skills 系（frontend-design / pdf 等） + microsoft/azure-skills 系占绝对多数（S-2 / S-4 leaderboard 实测）。
- **是否官方背书**：Vercel 自己开源、自己维护；**与 Anthropic 无官方关系**（与 G §4 一致）。但 Anthropic 自己也以 `anthropics/skills` 形式与 skills.sh 兼容（"first-party 但被聚合"）。

### 1.2 是否提供公开 API

**事实**：**没有公开文档化的 REST API**。所有"客户端访问 registry"的代码路径只有 CLI（`npx skills add` / `npx skills find`）一条。Web 目录（leaderboard）使用 Next.js 前端，数据通过私有内部 endpoint 渲染，无 OpenAPI / SDK。

证据：
- S-3 / S-6 通篇仅描述 CLI 用法，没有 REST endpoint 文档。
- S-18（Apify 上的第三方 scraper）证明数据需要"刮取"——若有公开 API，scraper 不会存在。
- S-7（issue #980 "Publish full skills.sh directory in GitHub repository for restricted regions"）由用户因伊朗封锁请求把目录开放为 git repo —— 进一步证明当前不存在公开机器可读的 directory dump。
- S-19（Skilldex arxiv 论文）将 vercel-labs/skills 描述为"open agent skills CLI 与 community registry"，未提及任何 REST API。

**Ensemble 的可用接入路径**（事实层面，不下决策）：

| 路径 | 难度 | 风险 |
|---|---|---|
| **路径 A — 调用 CLI subprocess**（在 Ensemble 内调 `npx skills find <q> --json`） | 低 | 受 CLI 输出格式变更影响；需要 Node 环境；用户机器需要 npm |
| **路径 B — HTML 刮取 officialskills.sh** | 中 | Vercel 改前端结构即破；leaderboard 滚动加载需要 headless 处理 |
| **路径 C — GitHub API 直接拉取 `<owner>/<repo>` 的 SKILL.md** | 低 | 需要 GitHub API token；GitHub rate limit；需要先有 owner/repo 列表（来自 leaderboard 或 awesome list） |
| **路径 D — 复用第三方 scraper（如 S-18 Apify）** | 低（API） | 商业第三方依赖；月费 |

最务实组合（仍是事实陈述）：**主依赖路径 C（GitHub API 取 SKILL.md 与 metadata）+ 辅助路径 B（首次拉取 leaderboard 获得 top-N owner/repo 名单）**。Ensemble 不需要调用 `npx skills add` —— 安装动作完全可由 Ensemble 自己 `git clone` + `cp` 落到 `~/.ensemble/skills/<name>/`。

### 1.3 leaderboard 实际数据形态（来自 S-18 Apify scraper 字段反推）

scraper 输出字段揭示了 detail 页面真实可抓取的元数据：

```
{
  "skillName": "frontend-design",
  "owner": "anthropics",
  "repo": "skills",
  "url": "https://officialskills.sh/...",
  "installCommand": "npx skills add anthropics/skills --skill frontend-design",
  "summary": "Distinctive, production-grade frontend interfaces that reject generic AI aesthetics.",
  "summaryBullets": ["..."],

  // 以下来自 Apify scraper 的"detail mode"
  "weeklyInstalls": ...,
  "totalInstalls": ...,
  "githubStars": ...,
  "securityAudits": ...,        // skills.sh 自己做的安全标记
  "agentAdoption": {...},       // 哪些 agent CLI 装过这个 skill
  "skillMdContent": "..."       // 完整 SKILL.md
}
```

**对 Ensemble 的事实意义**：
- 即使没有 REST API，可抓取的 detail 元数据已**远超** Ensemble 渲染列表所需（name / description / summary / installs / stars / source repo / 完整 SKILL.md）
- 元数据可用 GitHub API 直查（star / repo last updated / SKILL.md 原文 + frontmatter）+ leaderboard install 数补充
- "weekly installs" 与 "agentAdoption" 是 skills.sh 私有数据，GitHub API 无法替代——若需要这两项，必须依赖 skills.sh 网页 / scraper

---

## §2 Anthropic 官方 skill 资源现状

### 2.1 `anthropics/skills` repo（S-9 + G §4）

- 17 个 first-party demo / 教学性质 skill：`pdf` / `xlsx` / `docx` / `pptx` / `frontend-design` / `skill-creator` / `slack-gif-creator` / `theme-factory` / `webapp-testing` / `mcp-builder` / 等。
- **该 repo 同时是一个 Claude Code plugin marketplace**（含 `.claude-plugin/marketplace.json`，把内部 skills 包成 `document-skills` + `example-skills` 两个 plugin）—— 即"一个 repo 同时是 standalone skill 集合 + plugin marketplace"，G §5.2 已详述。
- 无 REST API；典型 GitHub repo 形态。

### 2.2 `claude-plugins-official` repo（与 G §4 一致；S-20）

- Anthropic 维护的官方 plugin marketplace，包含 35+ plugins（Linear / Sentry / GitHub / Figma 等大厂集成）。
- 部分 plugin 含 skill（如 `skill-creator` plugin 内嵌 `skills/skill-creator/SKILL.md`）。
- 默认在 Claude Code 启动时自动注册（FS-3 in G 调研），不需要用户主动 add。

### 2.3 Anthropic 是否有"独立的 skill API 索引"？

**事实**：**没有跨 marketplace 的 Anthropic 官方 skill discovery API**（与 G §8 一致）。`platform.claude.com/docs/.../skills-guide` 提到的 `GET /v1/skills` 是 **Claude API 自己的 managed-skills 列表**（用户在 Claude API workspace 里上传的 skills），与"公共可发现的 skill 索引"是不同概念。

**对 Ensemble 的事实意义**：Anthropic 不是一个能直接拉的 skill 数据源。但 **`anthropics/skills` 仓库本身是 skills.sh 上 install 数最高的来源之一**（S-2 leaderboard 实测：`anthropics/skills` 系 skill 多次进入 top 10）—— 通过 skills.sh 间接覆盖了 Anthropic first-party 内容。

---

## §3 GitHub awesome-list 类社区聚合源

| 仓库 | Stars / 状态 | 内容形式 | 元数据完整度 | 是否结构化 |
|---|---|---|---|---|
| `travisvn/awesome-claude-skills`（S-10） | 中等 | 表格行，按主题分类 | 仅 name + 1 行描述 + 链接 | 否（README 表格） |
| `VoltAgent/awesome-agent-skills`（S-11） | 中等；自称 1000+ | 表格 + 短描述；同时 `git clone <repo> ~/.claude/skills/awesome-agent-skills` 整 repo 安装模式 | 仅 name + 1 行描述 + GitHub 链接 + tag | 否（但有分类 tag） |
| `hesreallyhim/awesome-claude-code`（S-12） | 中高 | 表格行；内容包括 skill / plugin / hook / agent / orchestrator —— **不仅限 skill** | 仅 name + 描述 | 否（README 表格） |
| `ComposioHQ/awesome-claude-skills`（S-13） | **58.7k stars 最高**；6.4k forks | 表格行；按主题分类；包含 prompt-engineering、PICT、Septim Agents Pack 等 | 仅 name + 1 行描述 + 链接 | 否（README 表格） |
| `CommandCodeAI/agent-skills`（S-14） | 中低 | 按业务域分类（Software Dev / Cloud / Cloudflare / Content / Visual Design / Business Ops / Document Mgmt / Data / Workflow） | 仅 name + 描述 | 否 |

**共同特征**：
- 全部以 **markdown README 表格**形式存在；**没有 yaml / json index**。
- 元数据极度稀薄：仅 name + 一行描述 + 仓库链接；不含 install 数 / star / 更新时间 / SKILL.md 原文。
- "去重"靠人工 PR；同一个 skill 可能在多个 awesome list 同时出现，作者无法跨 list 同步。
- 几乎所有条目最终都是 `<owner>/<repo>` 形式 —— 与 skills.sh 的 GitHub-as-registry 完全同构，意味着 **awesome list 本质上是 skills.sh 的低保真子集**。

**对 Ensemble 的事实意义**：
- awesome list 不适合作 **主**数据源（元数据不足、无 install 数、无搜索）。
- 但作 **种子（seed）数据源** 有用：当 skills.sh 不可用时，可从 awesome list README 解析出 owner/repo 列表，再用 GitHub API 取每个 SKILL.md 元数据。
- ComposioHQ 与 VoltAgent 两个 list 体量最大，可作首选 seed。

---

## §4 商业付费 directory 源（次要候选）

### 4.1 `skillsdirectory.com`（S-15）

- 自称 44,000 项 skills；提供**结构化 REST API**：
  - `GET /api/v1/skills?q=&category=&sort=&verified=&securityGrade=` — 列表 / 过滤 / 排序
  - `GET /api/v1/skills/:slug` — 单项详情
  - `GET /api/v1/skills/search` — Pro+ 提供 AI 语义搜索（embedding）
  - `GET /api/v1/categories` / `GET /api/v1/stats`
- 鉴权：API key（Bearer / x-api-key header）
- 价格：Free 100 req/day / Pro $29 月 1k req/day / Enterprise $199 月 10k req/day
- 提供 **security grade** A-F 字段（其它源没有）
- 提供 **verified** 标签过滤

### 4.2 `awesomeskills.dev`（S-16）

- 第三方浏览站；声称收录 1134 community + N 官方集合
- **没有公开 API**（前端站点）；可刮取
- 数据形态接近 skills.sh，但分类更明显（Art & Design / Image / Video / Writing / Browser / Deployment / Utility 等）
- 商业模式不清晰；不是 first-party

### 4.3 `explainx.ai/leaderboard`（S-17）

- "stars 加权" leaderboard（9744 skills + 1512 MCP）
- 子域名 `</skills>`、`</mcp-servers>` 提供完整列表（非 API）
- 与 `clawhub` 等较小 CLI 同源（不属于 skills.sh 体系，是分裂尝试）

### 4.4 `tessl.io`（S-3 第二条结果）

- 自称"package manager for agent skills"
- 似乎以 GitHub repo 路径形式映射（`/registry/skills/github/<owner>/<repo>/<name>`）
- 与 skills.sh 重叠较大；商业化定位不清

**对 Ensemble 的事实意义**：
- skillsdirectory.com 是**唯一明确提供文档化 REST API** 的源——若需要"开箱即用的 API + 严格 SLA"，这是技术最低成本路径；但需要付费 + 引入"商业三方依赖"风险。
- 其他三方均为聚合站；用作"数据稳定性容错"可，但不是好的 **主**源。

---

## §5 候选源对比表（5 列）

按派单卡 §3 B 强约束的 5 列：权威性 / API 稳定性 / 元数据完整度 / 安装单元类型 / 覆盖广度。

| 源 | 权威性 | API 稳定性 | 元数据完整度 | 安装单元类型 | 覆盖广度 |
|---|---|---|---|---|---|
| **skills.sh / officialskills.sh** | 高（Vercel 维护，事实标准；Anthropic 自有 skills 也通过其 leaderboard 暴露） | **中**：无文档化 REST API；CLI 输出与网页结构都是私有契约，可能变更；`vercel-labs/skills` repo 开源可读 | **高**：name / description / summary / install count / weekly install / star / agent compat / 完整 SKILL.md 全可得（部分需 detail page） | **GitHub repo（多 skill）+ skill 名（指 repo 内某个子目录）**。命令模板 `npx skills add <owner>/<repo> --skill <name>` 暴露这一组合 | **极广**：91k+ leaderboard，含所有大厂 first-party + 长尾社区 |
| **Anthropic `anthropics/skills`**（S-9） | **极高**（Anthropic 一手） | 高（GitHub repo 稳定；同时是 plugin marketplace） | 高（标准 SKILL.md frontmatter） | **GitHub repo**（17 个内置 skill + 同时是 plugin marketplace） | 窄（仅 Anthropic demo skills） |
| **`claude-plugins-official`**（S-20） | **极高**（Anthropic 一手） | 高（GitHub repo） | 中（`marketplace.json` 提供 plugin 级元数据；skill 级要进 plugin 内部读） | **plugin（含 skills 子目录）** | 窄（35+ 官方 plugin，含 skill 的更少） |
| **awesome-claude-skills 类 GitHub list（5 个）** | 中（社区策划，主观） | 中（README 格式可被改写） | **低**（仅 name + 1 行描述 + 链接） | **GitHub repo 链接（外部依赖）** | 中（500-2000 项；有重复） |
| **skillsdirectory.com**（S-15） | 中（独立第三方，盈利动机） | **高**（文档化 REST API + tier） | 中高（含 security grade 等独家字段；但有 free tier 字段裁剪） | 与 skills.sh 同（外部 GitHub） | 中高（44k 项） |
| **awesomeskills.dev**（S-16） | 中（独立第三方） | 中（无 API；前端可刮） | 中（按分类组织） | GitHub repo | 中（1134 community + 多个 official） |
| **explainx.ai 等其他 leaderboard**（S-17） | 中低 | 中 | 低（仅 star count） | GitHub repo | 中 |

**事实结论（不下决策）**：
- 唯一同时满足"权威 + 覆盖广度 + 元数据足够丰富"的源是 **skills.sh**。其唯一弱点是没有文档化 REST API（这是接入工程问题，不是产品问题）。
- 其他源都是 skills.sh 的子集或衍生，作为**容错备选**或**种子**有意义，作为**主**源不充分。

---

## §6 Q4 — 数据源的"安装单元"是什么？

这是闭环设计的关键问题，单独成节。

### 6.1 安装单元的事实形态

skills.sh 与 awesome list 一致：**安装单元 = `<owner>/<repo>` GitHub repo + 可选的 `--skill <name>` 限定到 repo 内某个子目录**。

支持的形式（来自 S-3 / S-6）：

```
# 1. GitHub 简写（整个 repo 内所有 skill）
npx skills add vercel-labs/agent-skills

# 2. GitHub 简写 + 限定一个 skill
npx skills add vercel-labs/agent-skills --skill frontend-design

# 3. 完整 GitHub URL
npx skills add https://github.com/vercel-labs/agent-skills

# 4. 直接路径到 repo 内某 skill 子目录（罕见，但 CLI 支持）
npx skills add https://github.com/vercel-labs/agent-skills/tree/main/skills/frontend-design

# 5. GitLab / 任意 git URL
npx skills add https://gitlab.com/foo/bar
npx skills add git@github.com:vercel-labs/agent-skills.git

# 6. 本地路径
npx skills add ./my-local-skills
```

### 6.2 一个 `<owner>/<repo>` 内的 skill 数量分布

来自 S-3 的 "Skill Discovery" 节：CLI 在 repo 内按以下模式搜索 SKILL.md：

```
<repo-root>/SKILL.md
<repo-root>/skills/<name>/SKILL.md
<repo-root>/.<agent>/skills/<name>/SKILL.md
<repo-root>/.github/skills/<name>/SKILL.md
```

实测分布（基于 S-2 leaderboard 多个条目验证）：
- **小型 repo（1 个 skill）**：约一半。如 `find-skills`（独占 repo）、`fitbit`（独占）、`govee-lights`（独占）。
- **中型 repo（5-15 个 skill）**：常见。如 `anthropics/skills`（17 个）、`anthropics/claude-plugins-official` 内嵌 plugins（每个 plugin 含 1-N 个 skill）。
- **大型 repo（数十至 100+ skill）**：少数大厂。如 `microsoft/azure-skills`（上百个 azure-* skill 子项目）。

### 6.3 安装动作落地到 Ensemble 自有路径的事实定义

基于 A §5 + H §3-条款 1：

**Ensemble Marketplace 的安装单元 = 一个 skill（=`<owner>/<repo>` + `<skill-name>` 二元组），物理落地到 `~/.ensemble/skills/<skill-name>/`，含 SKILL.md + scripts/ + references/ + assets/ 等子目录的真实拷贝**。

具体步骤事实（不写 IPC / Rust 代码）：
1. 输入：`<owner>/<repo>/<skill-name>` 三元组（用户在 Marketplace 列表点 Install 时确定）
2. 拉取：通过 GitHub API（`GET /repos/<owner>/<repo>/contents/skills/<skill-name>` 或 sparse git clone）获取该 skill 子目录的全部内容
3. 写入：把内容真实拷贝到 `~/.ensemble/skills/<skill-name>/`（与 `taste-skill` / `youtube-clipper` 等 A §5.1 描述的"真实拷贝模式"对齐；不是 symlink，因为 marketplace 源在远程而非 `~/.agents/skills/`）
4. 元数据：写入 `data.json.skillMetadata[id]` 时，`id` 取 `~/.ensemble/skills/<skill-name>` 路径（与现有 `Skill.id = source_path` 一致，types.rs:21-43）；同时记录"上游来源"（`<owner>/<repo>/<skill-name>`）
5. 列表立即可见：触发 `loadSkills()` 重扫 `~/.ensemble/skills/`（与现有 import 链同款，参见 A §4.4）

**多 skill repo 的产品决策点（留 Synthesis）**：当一个 repo 含 15 个 skill，用户能否"一键装全部"？还是只能逐项装？这与 ImportSkillsModal 的"批量勾选"模式 vs"单项 Install"模式相关。**事实**：skills.sh CLI 自身两者都支持（`--all` vs `--skill <name>`）；Ensemble Marketplace 选哪种是 PRD 决策。

### 6.4 安装单元与 Ensemble 现有 `installSource` 字段的冲突

H §3 已点明：现有 `installSource: 'local' | 'plugin'` 是二值枚举。Marketplace 引入新单元类型必然涉及：
- (a) 复用 `'local'`（认为 Marketplace 是"用户自助安装到本地"，不区分）
- (b) 复用 `'plugin'`（强行套 plugin 体系；与 G §6 的"无需 claude plugin install"对立）
- (c) 新增 `'marketplace'` 第三态

事实意义（不下决策）：选 (a) 失去"哪些是用户从 Marketplace 装的"可追溯性；选 (c) 涉及数据模型扩展 + UI 条件分支。这是 D-3 / D-9 决策，不是数据源调研要回答的事。

---

## §7 Q5 — 元数据完整度对比

候选源各自能给出的字段一览（Y/N/部分）：

| 字段 | skills.sh | anthropics/skills | awesome-list | skillsdirectory.com |
|---|---|---|---|---|
| **name** | Y | Y（frontmatter） | Y | Y |
| **description**（人类可读） | Y | Y（frontmatter） | Y（README 表格） | Y |
| **summary / 长描述** | Y（detail page） | Y（SKILL.md body） | N | Y |
| **author / owner** | Y（owner 字段） | Y | Y（GitHub） | Y |
| **version** | 部分（仅 git commit sha） | N（除非 frontmatter 显式带） | N | 部分 |
| **license** | 部分（frontmatter） | Y | N | 部分 |
| **install count（total）** | **Y** | N | N | 部分 |
| **weekly install** | **Y**（detail page） | N | N | N |
| **GitHub stars** | **Y** | N（需查 repo） | N | 部分 |
| **last updated** | 部分（commit sha 时间） | Y（git） | N | Y |
| **依赖（runtime）** | 部分（compat field） | Y（compat field） | N | N |
| **截图 / 示例** | N（仅文字） | 部分（README） | N | N |
| **评分 / 评论** | N | N | N | 部分 |
| **agent 兼容**（与 codex / cursor / gemini-cli 等） | **Y**（agentAdoption 字段） | N | N | N |
| **security grade（独家）** | N | N | N | **Y** |
| **完整 SKILL.md 原文** | Y（detail page） | Y（GitHub） | N（需跳转） | 部分 |

**最丰富者** = skills.sh（独有：install 数 + agent 兼容矩阵）+ skillsdirectory.com（独有：security grade + verified flag）。

**对 PRD 列表 / 详情页的事实意义**：
- 列表页（密度参照 SkillListItem）需要：name + description + 来源 owner + install 数（用作"流行度"信号）+ 安装状态（已装 / 未装）。这些 skills.sh 全部覆盖。
- 详情页（密度参照 SkillDetailPanel）需要：长描述 + 完整 SKILL.md 预览 + 来源 GitHub 链接 + last updated + license。skills.sh + GitHub API 组合完全覆盖。
- "评分 / 评论"在所有源都缺失 —— 这是**用户上传 / 双向 marketplace** 范畴，已被用户 Q4 锁定不进 V1（00_understanding §4.5）。

---

## §8 Q6 — 纯 markdown skill 与 plugin 机制对接的事实矩阵

**核心问题**：数据源的内容是否包含"非 plugin 形式的纯 markdown skill"？怎么和 G 调研出的 plugin 机制对接（或不对接）？

### 8.1 事实矩阵（含 G §5 调研结论）

| 数据源条目类型 | 是否含 marketplace.json | 是否含 plugin.json | Ensemble 的可行接入路径 |
|---|---|---|---|
| **裸 skill repo**（含 SKILL.md，无 plugin 包装；如 `anthropics/skills` 顶层 + 大量社区 repo） | 部分有 marketplace.json，但 plugin 内部是 strict:false + skills 数组（G §3 / §5） | 通常无 | `cp` skill 子目录到 `~/.ensemble/skills/<name>/`（路径 D，绕开 plugin） |
| **plugin repo**（如 `anthropics/claude-plugins-official` 系） | Y | Y | 同样可 `cp` plugin 内 `skills/<name>/` 到 `~/.ensemble/skills/<name>/`；不需要触发 `claude plugin install`（G §5 / §6） |
| **MCP-only plugin**（如 `discord` external_plugin，G §3） | Y | Y | 不在 Skill 数据源调研范围（属 C 调研） |
| **awesome-list 表格行（无 SKILL.md）** | N | N | 仅是种子；最终拉取的 repo 仍走前面两类 |

**关键事实（来自 G §5.3）**：

> 任何 markdown skill 都能 `cp` 到 `~/.claude/skills/<name>/` 直接被识别。把 raw skill 转 plugin 的成本极低（一个 `marketplace.json` + 一个 `plugin.json`），但需要"上游或中间人"完成包装。

转译到 Ensemble 上下文：**从 skills.sh 装的 skill，绝大多数不需要走 plugin 包装路径，直接 `cp` 到 `~/.ensemble/skills/<name>/` 即可**。这与 A §5 推荐的"真实拷贝"路径完全契合。

### 8.2 对 Ensemble 数据源策略的事实意义

skills.sh 收录的 skill **全部都是兼容 standalone 路径的 SKILL.md 目录**（来自 S-3 CLI 的 Skill Discovery 设计：CLI 自己就是把内容 `cp` 到 `<agent>/skills/`）。这意味着：

- **skills.sh 的内容与 plugin 机制完全解耦**——不需要 Ensemble 触碰 `~/.claude/plugins/cache/`、不需要写 `enabledPlugins`、不会与现有 plugin-sourced 资源在视觉 / 数据上撞车（H §3-条款 4）。
- 同时，由于 skills.sh leaderboard 上 Anthropic / Vercel 等大厂 first-party 集合也以 plugin marketplace 形式存在（如 `anthropics/skills` 同时是 marketplace），Ensemble 选 skills.sh 数据源**不会损失**这些 first-party 内容——只是从"plugin 视角"切到了"裸 SKILL.md 视角"。
- **二者不是替代关系**：用户可继续在 Claude Code 里用 `claude plugin install` 装 plugin（H Q6 实测：用户已装 16+ plugin），与 Ensemble Marketplace 装的 skill 互不冲突——前者落 `~/.claude/plugins/cache/`，后者落 `~/.ensemble/skills/`，两条路径独立。

**事实结论**：Skill Marketplace 的数据源（无论选 skills.sh 还是其他）**与 plugin 机制的对接关系是"可独立、可共存、不需对接"**。这也呼应 A §10 N4 提到的"marketplaceStore 与 importStore 状态机不同"——是两条平行的安装通道。

---

## §9 Q7 — 数据源稳定性 / 备选源容错

### 9.1 上游消失 / 改 API 的现实风险

| 风险事件 | skills.sh 视角 | 缓解途径 |
|---|---|---|
| Vercel 取消项目 / 站点下线 | leaderboard / web 不可达；`vercel-labs/skills` CLI repo 可能存档 | CLI 已开源（S-3 MIT），fork 自维护可行；SKILL.md 内容仍在各 repo |
| skills.sh 改前端结构 | HTML 刮取破裂；CLI 仍可用（私有契约） | 若依赖 GitHub API + leaderboard 名单，影响小 |
| GitHub Rate Limit | 影响所有 GitHub 派生源 | 请求需要 token；可缓存 |
| 单一 repo 被作者删除 | skills.sh 列表与 awesome-list 都失效；本地已装的 skill 不影响（已 `cp`） | Ensemble 已装的 skill 不依赖远端 |
| 网络封锁（如 S-7 伊朗案例） | 整个站点不可达 | 如能抓 leaderboard 名单导出 git repo 即可绕过；纯 GitHub API 可被封 |

### 9.2 多源容错的现实可能

事实 disposition（不下决策）：

- **完全单源（skills.sh only）**：风险集中。Vercel 决策可单点击穿。
- **skills.sh + GitHub API 混合**：主链路 skills.sh 取 leaderboard 与 install 数；GitHub API 取 SKILL.md 内容、star、last updated。任一通道挂了，可降级。
- **skills.sh + skillsdirectory.com（付费 API）双轨**：覆盖 + SLA。引入商业依赖。
- **skills.sh + awesome-list（GitHub README seed）**：免费容错。元数据稀薄但能保最小可用。

### 9.3 离线降级的事实约束

A §5 + 现有 importStore 模式：Ensemble 当前没有"远程数据源缓存"概念。Marketplace 必然引入"缓存层"。事实层面（不写实现）：
- 缓存最近一次 leaderboard 的 N 条到 `data.json.marketplaceCache` 或独立文件，让 Marketplace 页面在离线时仍可显示已缓存内容（标灰 + "上次更新于 X"）
- 已**安装**的 skill 完全不依赖远端可达性（已 `cp` 到 `~/.ensemble/skills/<name>/`）—— 这与 A §5.2 的"mcps/ 目录的 JSON schema"事实一致：本地化资源不依赖上游

---

## §10 Q8 — 用户原话"不打算自己建设映射表"在数据源层面的真正含义

### 10.1 用户原话回看

> Skill Marketing 应该就有 skills.sh 这个网站，是不是直接进去或者从它里面爬数据就可以了？这样做会好一点。
> ...
> 如果我们是看软件，我们也不打算自己去建设这种映射表，就直接用别人的权威一点就好。

### 10.2 字面拆解

"映射表"的字面含义是"我自己维护一份 skill 清单 / 自己审稿 / 自己排序"。用户的拒绝点：**Ensemble 不应做"内容编辑器"角色**——不出"Ensemble 推荐 skills"清单、不做"Ensemble 自评分"、不做"Ensemble Verified" badge。

### 10.3 这与"是否能缓存上游"的关系（事实层面，不下决策）

**不能完全等同**。三种可能解读：

| 解读 | 含义 | 是否符合用户语义 |
|---|---|---|
| **解读 A — 严格不缓存任何上游数据** | 每次进 Marketplace 页面都现拉 skills.sh / GitHub API；离线时空白 | 字面与原话不冲突；但与"闭环 + 用户体验"诉求矛盾（离线卡死） |
| **解读 B — 缓存上游但不维护自己的目录** | Ensemble 缓存最近 N 条 leaderboard 用于离线降级 + 列表加速；缓存内容是上游原貌（不二次审稿、不重排） | 与原话不冲突 —— 用户拒绝的是"自建映射表（编辑器）"，不是"性能缓存（搬运工）" |
| **解读 C — 缓存 + 自建索引** | 缓存 + Ensemble 自己加分类 / Featured / Verified | 违反原话 —— 这是"自建映射表" |

事实 disposition：**解读 B 是与用户原话一致的、且能支持闭环 / 离线降级 / 列表性能三个产品诉求的最经济解读**。Ensemble 的角色是"上游目录的 GUI client + 安装到本地的执行器"，不是"目录维护者"。但**最终决策（要不要缓存 / 缓存 TTL / 缓存内容范围）属 Synthesis Gate D-10 / 闭环设计层面**，不是数据源调研结论。

### 10.4 对 PRD"信息架构"章节的事实意义

- Marketplace 列表的渲染必须以**上游 leaderboard / search 为序**，不是 Ensemble 自创顺序
- "Featured / Editor's Pick / Verified" 这类标签（如 skillsdirectory.com 的 Verified）只能用上游字段，不能 Ensemble 自评
- 用户搜索 / 过滤可以做（这是 client-side 行为，不是"维护映射表"），但搜索结果排序必须是上游字段（install 数 / star / 字母序）

---

## §11 推荐主源 + 备选源（带理由，不下最终决策）

### 11.1 推荐主源：**skills.sh / officialskills.sh**

理由（按重要性递减）：

1. **覆盖广度压倒性优势**：91k+ leaderboard，事实上是当前唯一的"开放 skill 生态目录"；同时把 Anthropic first-party / Vercel first-party / Microsoft / OpenAI / 大量社区一手抓——选了 skills.sh 几乎不会"漏掉重要 skill"。
2. **元数据丰度足以渲染 SkillsPage 同密度的列表与详情**：name / description / summary / install count / weekly install / star / agent compat / 完整 SKILL.md 全可得（§7）——不需要 Ensemble 二次填料。
3. **与 plugin 机制完全解耦**（§8 / G §5）：装 skills.sh 的 skill 不触发 plugin 路径、不撞车现有 `installSource: 'plugin'` UI、不需要 `claude plugin install` 调用——闭环边界最干净。
4. **CLI 开源可降级**（S-3 MIT）：即便 skills.sh 站点不可用，`vercel-labs/skills` CLI 与 GitHub API 仍可工作；fork 维护可行。
5. **与用户原话契合**：用户原话明确点名 "skills.sh 这个网站"——选这个源是对原话的最直接回应。

**主源的工程不确定性**（非 product 层风险，列在此供 PRD"开放问题"参考）：
- 没有公开 REST API（§1.2）；接入需要 GitHub API + 网页刮取 / CLI subprocess 组合，工程复杂度比"调一个 REST API"高
- "weekly installs"、"agentAdoption" 是 skills.sh 私有数据，纯 GitHub API 无法替代——若 PRD 要展示这两项，必须 fall back 到网页刮取

### 11.2 备选源（按使用场景，不是排序）

| 场景 | 备选源 | 用途 |
|---|---|---|
| **skills.sh 站点不可达 / 限流** | **GitHub API 直查 + leaderboard 名单缓存** | 主源降级；在已知 owner/repo 名单（来自最近一次 leaderboard 缓存）的前提下，纯走 GitHub API |
| **GitHub API 也限流 / 用户机器无网** | 本地缓存 `data.json.marketplaceCache` | 离线降级；展示最近一次缓存内容 + "上次更新于 X" 标记 |
| **想引入"安全审计 / Verified"等独家信号** | **skillsdirectory.com**（S-15）付费 API | 仅 Pro 以上账户值得；商业三方依赖；非 V1 必需 |
| **想做"种子发现"（早期补全 leaderboard 之外的长尾）** | `ComposioHQ/awesome-claude-skills` 与 `VoltAgent/awesome-agent-skills` 两个 awesome-list README 解析 | 补盲；非主用 |
| **Anthropic first-party 强保证** | **`anthropics/skills` repo + `claude-plugins-official` repo 的直查** | 只想要"绝对官方"内容时；事实上 skills.sh 已覆盖，不需要单独走 |

### 11.3 显式不推荐的源

| 源 | 不推荐理由 |
|---|---|
| `awesomeskills.dev` / `explainx.ai` 等三方聚合站 | 数据形态与 skills.sh 同构但元数据更稀；商业模式不清晰；当作主源是"换个不那么权威的 skills.sh" |
| `claude-plugins-official` 作为 Skill 主源 | 主要是 plugin 集合而非 skill 集合；接入会被迫走 plugin 路径，与"装到 `~/.ensemble/`"的产品定义违背 |
| Tessl.io 等新生 skill registry | 不成熟；与 skills.sh 高度重叠；引入"再多一层第三方"无收益 |

### 11.4 一句话总结（给 Synthesis Gate / PRD 撰写者）

**Skill Marketplace 主源 = skills.sh（事实标准 + 与用户原话一致）；接入路径 = GitHub API 取内容 + 网页/CLI 取 install 数；安装单元 = `<owner>/<repo>/<skill-name>` 三元组真实拷贝到 `~/.ensemble/skills/<skill-name>/`；与 plugin 机制完全解耦——不调 `claude plugin install`、不走 `~/.claude/plugins/cache/`。备选 = GitHub API 直查 + 本地缓存的二段降级。**

---

## §12 调研边界与未覆盖

按派单卡 §3 B "不做"约束，本调研：

- 不写 Ensemble 怎么实现爬取（无 Rust struct / IPC 命令 / scraper 实现细节）
- 不评估爬虫法律风险（skills.sh 的 robots.txt / 服务条款未深查；如 PRD / Synthesis 阶段需要再补，在此处的"工程不确定性"只一行注明：依赖 Vercel ToS 是否允许程序化访问）
- 不下"V1 选哪个源"的最终决策（只给推荐 + 理由）；这是 D-3 / D-4 决策的输入，不是结论
- 不深入"安装失败 / 重试 / 校验" 的产品行为定义（是 PRD §闭环 / §错误处理章节的事）
- 不调研 Subagent 数据源（Agent Marketplace 已被 V1.1 用户对齐降级，不在 V1 范围）

后续 Synthesis Gate / PRD 撰写阶段需要决策的开放点（B 调研已暴露但不闭合）：

1. 主源 skills.sh 的接入路径具体选哪个组合（GitHub API + 网页刮 / GitHub API + CLI subprocess / 全网页刮）—— §1.2
2. 是否引入二段降级（GitHub API → 本地缓存）/ 缓存 TTL 的产品口径 —— §9 / §10.3
3. 安装单元颗粒度（"一键装整 repo 多 skill" vs "仅装单个 skill"）的产品决策 —— §6.3
4. 数据源是否在 Marketplace UI 中"显式标注"（"Source: skills.sh / GitHub direct / 缓存"）还是统一不显（用户视角"它就是个目录"）—— §10.4

---

**调研产物结束。** 提交时全文行数 = 532（在 400-700 区间）。
