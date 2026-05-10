# G — Claude Code Plugin 机制调研

> **角色**：调研 SubAgent G。**不下决策**，仅汇集事实；最终的"Ensemble 是否复用 / 怎样复用 plugin 体系"由 Synthesis Gate 决定。
> **范围约束**（来自 V1.1 Revision History）：V1 范围 = Skill + MCP；Agent Marketplace 不在 V1。本调研在末尾的"对下游影响"小节中只讨论 B（Skill 数据源）/ C（MCP 数据源）。
> **证据原则**：每条事实带证据来源（官方文档 URL / 命令输出 / 文件路径 + 行号 / repo URL）。本调研所有"实地证据"来自调研机所在用户的实际机器（claude 2.1.133，2026-05-09）。

---

## 0. 证据来源清单

| 标号 | 来源 | 用途 |
|---|---|---|
| OD-1 | https://docs.claude.com/en/docs/claude-code/plugins | 官方"创建 plugin" |
| OD-2 | https://docs.claude.com/en/docs/claude-code/discover-plugins | 官方"发现/安装 plugin" |
| OD-3 | https://docs.claude.com/en/docs/claude-code/plugin-marketplaces | 官方"创建/分发 marketplace" |
| OD-4 | https://docs.claude.com/en/docs/claude-code/plugins-reference | 官方完整 schema |
| OD-5 | https://docs.claude.com/en/docs/claude-code/settings | settings.json 中的 plugin 字段 |
| OD-6 | https://docs.claude.com/en/docs/claude-code/headless | `-p` 与 plugin 安装 headless 状态 |
| GH-1 | https://github.com/anthropics/claude-plugins-official | 官方 marketplace repo |
| GH-2 | https://github.com/anthropics/skills | 官方"Anthropic Agent Skills" marketplace（即 OD-1 中的 demo skills marketplace 之一） |
| GH-3 | https://github.com/anthropics/claude-code/tree/main/plugins | 官方"demo" marketplace（`claude-code-plugins`） |
| GH-4 | https://github.com/anthropics/life-sciences | 官方 life-sciences marketplace |
| GH-5 | https://github.com/anthropics/claude-code/issues/12840 | "Headless plugin install" 功能请求（Critical, 未关闭） |
| CMD-1 | `claude --version` → `2.1.133 (Claude Code)` | 实测的 Claude Code 版本 |
| CMD-2 | `claude plugin --help` 输出 | CLI 子命令枚举 |
| CMD-3 | `claude plugin marketplace add --help` 输出 | marketplace add 选项 |
| CMD-4 | `claude plugin install --help` 输出 | install 选项与 scope |
| CMD-5 | `claude plugin marketplace list --json` 输出（4 个 marketplace） | 现网 marketplace 数据形态 |
| CMD-6 | `claude plugin list --json` 输出（35+ 条） | 已装 plugin 数据形态 |
| FS-1 | `~/.claude/plugins/marketplaces/<name>/.claude-plugin/marketplace.json` | 4 个真实 marketplace 文件 |
| FS-2 | `~/.claude/plugins/installed_plugins.json` | 已装清单文件结构 |
| FS-3 | `~/.claude/plugins/known_marketplaces.json` | 已注册 marketplace 清单 |
| FS-4 | `~/.claude/projects/settings.json` 中的 `enabledPlugins` map | enabled 状态实际存储位置 |
| FS-5 | `~/.claude.json` 中 `enabledPlugins: null` | 推翻一种常见误解的反证 |
| FS-6 | `src-tauri/src/commands/plugins.rs` | Ensemble 现有 plugin 处理代码 |
| TR-1 | https://just-be.dev/blog/why-i-built-a-claude-code-plugin-marketplace/ | 第三方实践复述 marketplace 字段 |
| TR-2 | https://chris-ayers.com/posts/agent-skills-plugins-marketplace/ | Skill / plugin / marketplace 概念分层 |
| TR-3 | https://claudemarketplaces.com/about | 第三方聚合站点（500+ install 阈值） |

---

## 1. Q1 — `claude plugin marketplace add <git-url>` 的实际机制

**事实**：Marketplace 是一个**包含 `.claude-plugin/marketplace.json` 文件的 git 仓库（或本地目录、远端 JSON 文件）**。"Add" 动作 = 把这个仓库 clone 到本地缓存 + 把元数据登记进 `known_marketplaces.json`。**不安装任何 plugin**。OD-2 把它类比为"adding an app store"。

**支持的 source 形式**（CMD-3 + OD-2）：

| 形式 | 命令例 |
|---|---|
| GitHub `owner/repo` | `claude plugin marketplace add anthropics/claude-code` |
| 任意 git URL（含 SSH / GitLab / Bitbucket / 自托管） | `claude plugin marketplace add https://gitlab.com/company/plugins.git` |
| 指定分支 / tag | `... .git#v1.0.0` |
| 本地目录 | `claude plugin marketplace add ./my-marketplace` |
| 远端 JSON URL | `claude plugin marketplace add https://example.com/marketplace.json`（受限：相对路径 plugin 可能 fail） |

CMD-3 显示 `--scope user|project|local` 选项，决定声明位置；以及 `--sparse <paths>` 做 monorepo 稀疏 checkout。

**`marketplace.json` 的最小骨架**（FS-1，与 OD-3 一致）：

```jsonc
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "marketplace-name",         // 必填
  "owner": { "name": "...", "email": "..." },  // 必填
  "description": "...",                // 可选
  "metadata": { "version": "1.0.0", "pluginRoot": "./plugins" },  // 可选；pluginRoot 是相对 source 的前缀
  "plugins": [ /* plugin 条目数组 */ ]
}
```

**plugin 条目的最小骨架**（OD-3 / FS-1）：

```jsonc
{
  "name": "plugin-name",          // 必填，与 .claude-plugin/plugin.json.name 应一致
  "source": "./relative/path",     // 必填；string 或 object，5 种形式见下表
  "description": "...",            // 可选但实际所有官方 marketplace 都填
  "category": "...", "tags": [...], "author": {}, "homepage": "...", "version": "..."
}
```

**实地证据**（CMD-5）：本机当前已注册 4 个 marketplace：
- `claude-plugins-official`（github: `anthropics/claude-plugins-official`，35+ plugin）
- `anthropic-agent-skills`（github: `anthropics/skills`）
- `life-sciences`（git: `https://github.com/anthropics/life-sciences.git`）
- `claude-code-settings`（github: `feiskyer/claude-code-settings`，社区 marketplace）

**`add` 动作的副作用清单**：clone 到 `~/.claude/plugins/marketplaces/<name>/`（注意：路径中**不含** `cache/`，与 plugin 安装目录不同；后者在 `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`）+ 写入 `~/.claude/plugins/known_marketplaces.json`（FS-3）。

---

## 2. Q2 — `claude plugin install` 的下载、解压、安装流程

**事实**：`install` 从已注册的某个 marketplace 中按 plugin 名 `<name>@<marketplace>` 取 plugin 条目，按其 `source` 字段下载到本地 cache 目录，并标记为已装。**enable 是另一个动作**，install 不自动 enable（见 §7）。

**CMD-4 输出**：

```
Usage: claude plugin install|i [options] <plugin>
Options:
  -s, --scope <scope>  Installation scope: user, project, or local (default: "user")
```

**`source` 的 5 种形式**（OD-3 + TR-1）：

| `source` 类型 | 字段 | 实际下载行为 |
|---|---|---|
| 相对路径 string `"./formatter"` | — | marketplace repo 内的子目录；不额外下载，从已 clone 的 marketplace 中复制到 cache |
| `{"source": "github", "repo": "..."}` | `repo`, `ref?`, `sha?` | git clone 该 repo（如 sha 给定，会 checkout 到 sha） |
| `{"source": "url", "url": "...git", "sha": "..."}` | `url`, `ref?`, `sha?` | git clone（任意 git host） |
| `{"source": "git-subdir", "url": "...", "path": "...", "ref?", "sha?"}` | `url`, `path`, `ref?`, `sha?` | sparse-clone 后取子目录（monorepo 友好） |
| `{"source": "npm", "package": "...", "version?", "registry?"}` | `package`, `version?`, `registry?` | 通过 `npm install` 拉取 |

**实地证据**（FS-1，`claude-plugins-official` 中混用三种 source）：
- `42crunch-api-security-testing` 用 `git-subdir`（指向 `42Crunch-AI/claude-plugins.git` 的 `plugins/api-security-testing` 子目录 + 钉 `sha` + `ref: v1.0.1`）
- `agent-sdk-dev` 用相对路径 string `"./plugins/agent-sdk-dev"`（在同一 repo 内）
- `aikido` 用 `{"source": "url", "url": "...", "sha": "..."}`

**安装落地路径**（FS-2 + 实测）：

```
~/.claude/plugins/cache/<marketplace>/<plugin-name>/<version>/
```

举例：
- `nanobanana-skill@claude-code-settings` 1.0.0 装在 `/Users/bo/.claude/projects/plugins/cache/claude-code-settings/nanobanana-skill/1.0.0`（注意 `installed_plugins.json` 中的 `installPath` 字段实际指向 `~/.claude/projects/plugins/cache/...` 与 `~/.claude/plugins/cache/...` 两种路径并存——是历史迁移痕迹，但实际 plugin 文件都在 `~/.claude/plugins/cache/...`）
- `claude-md-management@claude-plugins-official` 1.0.0 装在 `~/.claude/plugins/cache/claude-plugins-official/claude-md-management/1.0.0`

**FS-2 中的字段**（`installed_plugins.json`）：

```jsonc
{
  "version": 2,
  "plugins": {
    "<plugin-name>@<marketplace>": [
      {
        "scope": "user|project|local",
        "installPath": "/abs/path/to/cache/.../<version>",
        "version": "1.0.0",
        "installedAt": "ISO-8601",
        "lastUpdated": "ISO-8601",
        "gitCommitSha": "..."
      }
    ]
  }
}
```

**重要**：**`scope` 与 `enabled` 是两件事**。`scope` 决定声明位置（user / project / local），`enabled` 决定是否运行时加载（见 §7）。

---

## 3. Q3 — Plugin 内部结构与支持的资源类型

**事实**：plugin 内部支持 **8 大类资源**，按目录约定自动发现，亦可在 `plugin.json` 中显式声明路径覆盖默认。

**默认目录结构**（OD-1，全部位于 plugin root，**不允许放在 `.claude-plugin/` 里**）：

| 目录 / 文件 | 资源类型 | 备注 |
|---|---|---|
| `.claude-plugin/plugin.json` | 必备 manifest | 仅此一文件可放在 `.claude-plugin/` |
| `skills/<name>/SKILL.md` | Skill | 与 standalone `~/.claude/skills/<name>/SKILL.md` 同格式 |
| `commands/*.md` | flat 命令文件 | 老式；新 plugin 用 `skills/` |
| `agents/*.md` | Subagent | 与 standalone `~/.claude/agents/*.md` 同格式 |
| `hooks/hooks.json` | Hook 事件 | 同 settings.json 中 `hooks` 字段格式 |
| `.mcp.json` | MCP server config | 与 `claude_desktop_config.json` / `.mcp.json` 项目级文件同格式 |
| `.lsp.json` | LSP server config | 代码智能 |
| `monitors/monitors.json` | 后台监视器 | 实验特性 |
| `bin/` | 可执行文件 | 加入 PATH |
| `settings.json` | plugin 内置默认 settings | 仅 `agent` 和 `subagentStatusLine` 键被识别 |

**`plugin.json` 完整 schema**（OD-4）：必填 `name`；可选 `version`、`description`、`author`、`homepage`、`repository`、`license`、`keywords`、`skills`、`commands`、`agents`、`hooks`、`mcpServers`、`outputStyles`、`lspServers`、`experimental.{themes, monitors}`、`dependencies`。

**实地证据**：
- `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/code-simplifier/` 仅含 `agents/code-simplifier.md` + `.claude-plugin/plugin.json` → **agents-only plugin**
- `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/` 含 `skills/skill-creator/{SKILL.md, scripts, references, agents}` → **嵌套 skill plugin**
- `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/hookify/` 含 `hooks/hooks.json` 注册 PreToolUse / PostToolUse / Stop → **hooks-only plugin**
- `~/.claude/plugins/marketplaces/claude-plugins-official/external_plugins/discord/.mcp.json` 仅含 `mcpServers: { discord: {...} }` → **MCP-only plugin**

**关键：`anthropic-agent-skills` 这个 marketplace 是"纯 skills 集合"**（FS-1）。其 `marketplace.json` 中 plugin 条目使用 `"strict": false` 字段 + `"skills": ["./skills/xlsx", ...]` 显式列表：

```jsonc
{
  "name": "document-skills",
  "source": "./",
  "strict": false,
  "skills": ["./skills/xlsx", "./skills/docx", "./skills/pptx", "./skills/pdf"]
}
```

→ 这是把 standalone skill 仓库（`anthropics/skills`）打包成 plugin 的标准做法：单个 plugin 可声明任意一组 skill 路径，无需在 plugin 内重复 `.claude-plugin/plugin.json` 文件。

---

## 4. Q4 — 是否存在权威 Anthropic 官方 marketplace？社区 marketplace？

**事实**：**存在两个 Anthropic 官方 marketplace + 一个 demo marketplace + 大量社区 marketplace**。"Anthropic 官方"明确以 owner / repo 为准。

**Anthropic 官方 marketplace**（OD-2 / OD-3 / GH-1 / GH-2 / GH-4）：

| Marketplace 名 | Repo | 默认是否注册 | 内容范围 |
|---|---|---|---|
| `claude-plugins-official` | `anthropics/claude-plugins-official` | **自动可用**（OD-2："automatically available when you start Claude Code"）；本机 FS-3 显示 `officialMarketplaceAutoInstalled: true` 与 `lastUpdated: 2026-05-08` | 35+ 通用 plugin（GitHub、GitLab、Atlan、Sentry、Linear、Figma、Notion 等 + 所有官方 LSP） |
| `anthropic-agent-skills` | `anthropics/skills` | **需手动 add**；浏览：`/plugin marketplace add anthropics/skills` | 12 个 Anthropic 示例 skill（pdf, xlsx, docx, pptx, slack-gif-creator, theme-factory 等）；以"document-skills" 与"example-skills" 两个 plugin 容器组织 |
| `claude-code-plugins`（demo） | `anthropics/claude-code` | 需手动 add（OD-2 §"Try it"） | demo 性质 |

**第三方 marketplace 的发现路径**（OD-2 + TR-3）：
- 官方 plugin 提交入口：claude.ai/settings/plugins/submit + platform.claude.com/plugins/submit。提交后被审核后纳入 `claude-plugins-official` 这个 repo。Anthropic 不维护"独立 plugin 市场前端"——`claude.com/plugins` 页面就是这个 repo 的可视化展示。
- **claudemarketplaces.com**（TR-3）是**独立社区聚合站**（与 Anthropic 无官方关系；其 disclaimer 明示），用 500+ install 阈值过滤；爬多源。
- 个人开发者在 GitHub 自建 marketplace（如本机注册的 `feiskyer/claude-code-settings`）；用户自行 `claude plugin marketplace add owner/repo` 即可。

**discovery 入口的事实**（OD-2）：

> "Run `/plugin` and go to the **Discover** tab to browse what's available, or view the catalog at [claude.com/plugins](https://claude.com/plugins)."

→ 浏览界面在 CLI 内（4 个 tab：Discover / Installed / Marketplaces / Errors）。Web 端 `claude.com/plugins` 提供仅 official marketplace 的目录视图。**没有跨 marketplace 的统一索引 API**——发现需要用户先 add 各自的 marketplace 才能搜索其内容。

---

## 5. Q5 — Plugin 形式 vs 纯 markdown skill 能否互通？非 plugin 资源能否通过 plugin 机制安装？【最关键】

### 5.1 答复要点

**两条独立路径并存，二者格式同一但安装机制不同**：

1. **Standalone（无 plugin 包装）**：用户/工具直接把 `SKILL.md` 文件夹丢到 `~/.claude/skills/<name>/` 或 `<project>/.claude/skills/<name>/`。**Claude Code 不需要 plugin 机制**就能加载这些 skill。
2. **Plugin 形式**：把同一份 `SKILL.md` 文件夹放进一个含 `.claude-plugin/plugin.json` 的目录里，再通过 marketplace + `claude plugin install` 流程安装到 `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/skills/<name>/`。

**关键事实链**：

- **`SKILL.md` 格式两条路径完全一致**（OD-1 §"When to use plugins vs standalone configuration"）：
  > "Plugins (directories with `.claude-plugin/plugin.json`) ... Use plugins when ... You're okay with namespaced skills like `/my-plugin:hello` (namespacing prevents conflicts between plugins)"
  → standalone skill 命令名 `/hello`，plugin skill 命令名 `/plugin-name:hello`。文件格式同。
- **同一份 skill 可同时以两种形式存在**（OD-1 §"Convert existing configurations to plugins" 的 migration 步骤就是 `cp -r .claude/skills my-plugin/`）。
- **`claude plugin install` 只接受"已注册在某 marketplace.json 中"的 plugin name**（OD-2 + CMD-4）。**没有 `claude plugin install <git-url>` 这种"直接安装一个 raw skill"语法**。换言之，**"非 plugin 形式"的资源不能通过 `claude plugin install` 安装**——但可以通过普通文件操作（cp / git clone / symlink 到 `~/.claude/skills/<name>/`）安装到 standalone 路径。
- **绕道：把 raw skill 包装成"最小 plugin"再通过 marketplace 安装**（OD-3 §"Quickstart" + `anthropic-agent-skills` 的 `document-skills` 实例 FS-1）。代价 = 原始作者要发布 marketplace.json + plugin.json 两个文件。
- **`anthropic-agent-skills` marketplace 的实际操作就是这条绕道**（FS-1）：`anthropics/skills` repo 顶层只有 `.claude-plugin/marketplace.json` + `skills/` 目录；marketplace.json 用 `"strict": false` + `"skills": [...]` 数组把它们打包成 2 个名义 plugin（`document-skills`、`example-skills`）。从用户视角，这是 plugin 安装；从 repo 文件视角，纯 skill repo 没改动。

### 5.2 互通性矩阵

| 来源形式 | `claude plugin install` 可装？ | 直接 `cp` 到 `~/.claude/skills/`？ | Claude Code 启动时识别？ |
|---|---|---|---|
| 含 `marketplace.json` 的 git repo（如 `anthropics/claude-plugins-official`） | ✅（按官方流程） | 不直接（要先看到内容） | ✅ install 后自动识别（需 enable） |
| 含 `marketplace.json` 但内部 plugin 仅 `.claude-plugin/plugin.json` + `skills/` 的 repo（如 `anthropics/skills`） | ✅ | ⚠️ 也可（`cp -r repo/skills/<name> ~/.claude/skills/`） | 两条路径都识别 |
| **裸 skill repo**（无 marketplace.json，只有 `SKILL.md` 文件夹集合，例如 `awesome-claude-skills` 类） | ❌ | ✅（这是 standalone 安装的标准做法） | standalone 路径识别 |
| 单文件 `SKILL.md` Gist | ❌ | ✅（在本地造目录） | standalone 路径识别 |
| `.mcp.json` 片段（无 plugin 包装） | ❌ | N/A — 不写入 `~/.claude/skills`；要写入 `~/.claude.json` 或项目 `.mcp.json` | ✅（MCP 单独识别，不经 plugin 路径） |

### 5.3 一句话答复

**非 plugin 资源不能经 `claude plugin install` 安装；但 standalone 安装路径完全独立、永远可用——任何 markdown skill 都能 `cp` 到 `~/.claude/skills/<name>/` 直接被识别。把 raw skill 转 plugin 的成本极低（一个 `marketplace.json` + 一个 `plugin.json`），但需要"上游或中间人"完成包装。**

→ **对 Ensemble 的事实意义**：在不依赖 Claude Code plugin 体系的情况下，Ensemble 完全有能力把任意来源的 skill / mcp 装到 `~/.ensemble/skills/` + `~/.claude/skills/` symlink，或写 `.mcp.json` 到 `~/.claude.json`，**绕开 plugin 机制**。但若选择"复用 plugin 体系"，则受限于"上游必须以 plugin/marketplace 形式发布"。Skill 数据源（B）和 MCP 数据源（C）的"可用源宽度"差异因此而生。

---

## 6. Q6 — Ensemble 能否在 GUI 中调用 `claude plugin install`【关键】

### 6.1 当前能力（CLI 真实性）

**CMD-2** `claude plugin --help` 的子命令清单 = `disable | enable | help | install | list | marketplace | prune | tag | uninstall | update | validate`。这些在交互 UI（`/plugin`）外**全部可作为 shell 命令直接调用**（如 `claude plugin install <name>@<marketplace>`、`claude plugin marketplace add <source>`、`claude plugin list --json`）。

**CMD-6** 实测 `claude plugin list --json` 给出结构化 JSON 数组，每条含 `id`、`version`、`scope`、`enabled`、`installPath`、`installedAt`、`lastUpdated`。**意味着 Ensemble 可通过 subprocess 调用获取标准化数据**。

### 6.2 但是：Headless install 路径并非完全 ready

**GH-5**（GitHub issue #12840，**仍开放**，标 "Critical"）：

> "Claude Code supports headless/programmatic prompting via `-p` ... There should be a way to install and manage plugins in headless/non-interactive mode. This would allow you to install and use plugins programmatically and within CI/CD pipelines."

提议方案：`claude -p "/plugin install my-plugin@my-plugins"`。该 issue 截至调研日（2026-05-09）未关闭，意味着**"GUI / 自动化场景下调用 install"目前不是头等支持的路径**——有以下几种现实做法：

| 做法 | 可行性 | 备注 |
|---|---|---|
| **直接调 `claude plugin install <name>@<marketplace>`**（subprocess） | ✅ 可行（CMD-2 / CMD-4 都是顶层 CLI 子命令，非交互） | 但默认 `--scope user`（→ 写入 `~/.claude.json` / 全局），非 Ensemble 控制范围；无明确返回码契约文档 |
| **调 `claude -p "/plugin install ..."`** | ❌ 据 GH-5 未支持 | issue 中提到此即 user 想要但目前不通的路径 |
| **OD-6 `headless` 模式中提到的 `system/plugin_install` 事件** | 仅作"装载新增 plugin 时报告事件"用 | 不是"install 触发器"，是"已 install 后的状态广播" |
| **手动复制 + 写 settings**：Ensemble 自己 git clone marketplace → 自己执行 `cp -r` → 自己写 `enabledPlugins` 到 settings.json | ✅ 完全可行 | 等于"重实现 plugin install 流程"；优势：完全可控 + 不依赖 CLI 行为契约；劣势：需要复制 Anthropic 的 source 解析逻辑（5 种 source 类型） |
| **直接绕开 plugin 路径**：Ensemble 把 skill 直接放 `~/.ensemble/skills/<name>/`，再 symlink 到 `~/.claude/skills/<name>/`（standalone 路径） | ✅ 完全可行 | 与现有 Ensemble 架构同质（CLAUDE.md L99 已有 "Skills: symlinked into `<project>/.claude/skills/`" 同款）；不依赖 plugin 体系 |

### 6.3 一句话答复

**`claude plugin install` 作为 shell 命令 100% 可被 subprocess 调用；但作为"GUI 一键安装"的实现支柱，存在两点风险**：(a) 无明确头部 / 返回值契约（issue #12840 是这一缺口的官方承认），(b) 默认写入路径在 Claude Code 全局（`~/.claude/plugins/cache/`），不在 Ensemble 管控的 `~/.ensemble/`。**Ensemble 自行实现 plugin 内容的下载 + 落到自己路径，是更可控的方案**——但要付出"重实现 source 解析"的成本。这是产品决策点，不是技术不可行。

---

## 7. Q7 — Plugin 安装后是否需要"启用"？`enabled: false` 状态？

**事实**：**install ≠ enable**。两个动作明确分离。

**数据证据**：
- CMD-6（本机 35+ plugin 全部 install 完成）显示：每条都有 `"enabled": false`，因为本机的"启用记录"未在 `~/.claude.json` 而在另一个文件。
- FS-5：`~/.claude.json` 的 `enabledPlugins: null`（即 null，不是 `{}`，也不是 absent）
- **FS-4：实际 14 个 enabledPlugins 在 `~/.claude/projects/settings.json`**（非 `~/.claude/settings.json`，也非 `~/.claude.json`）。其中：

  ```jsonc
  {
    "enabledPlugins": {
      "nanobanana-skill@claude-code-settings": true,
      "autonomous-skill@claude-code-settings": true,
      "codex-skill@claude-code-settings": true,
      // ... 14 entries total
    }
  }
  ```

- **CRITICAL — 实测发现 Ensemble 现有代码 BUG（H 调研会复用此线索）**：FS-6 中 `commands/plugins.rs:107-127` 的 `read_enabled_plugins()` 从 `~/.claude/settings.json` 读取 `enabledPlugins` 字段。但本机 `~/.claude/settings.json` 的 keys 是 `[cleanupPeriodDays, env, permissions, hooks, statusLine, ...]`——**没有 enabledPlugins**。该字段实际在 `~/.claude/projects/settings.json`。Ensemble 当前 `enabled` 字段始终为 `false`（默认值），与 Claude Code 实际状态不符。

**正式 schema（OD-5）**：

> `enabledPlugins`: 一个 `<plugin@marketplace>: bool` 的 map，可在多个 settings.json 中出现（managed / user / project / local），按 Claude Code 标准 settings 优先级合并。

OD-5 还指出 settings 中可声明 `extraKnownMarketplaces`（含一个 `source: "settings"` 的特殊形式，让"无 marketplace repo"的人也能内联声明 plugin 列表）和 `strictKnownMarketplaces`（managed-settings 专用，强制 allowlist）。

**enable / disable 的产品语义**：plugin 内容已下载到 cache，但 enable=false 时其 skills / mcps / hooks **不会**被加载到当前 Claude Code 会话。CLI 操作：`/plugin enable <name>@<mp>` 或 `claude plugin enable ...`。

---

## 8. Q8 — Anthropic 是否有官方 marketplace 列表 / discovery 入口？

**事实**：

- **唯一受 Anthropic 维护、默认即可见的 marketplace**：`claude-plugins-official`（GH-1）。这是"Anthropic 官方目录"。
- **官方维护但需要手动 add**：`anthropic-agent-skills`（GH-2）、`life-sciences`（GH-4）、`anthropics/claude-code` demo marketplace（GH-3）。
- **没有 Anthropic 官方维护的"跨 marketplace 全局索引"**。OD-2 §"Discover" 明确说 discover tab 只搜你已 add 的 marketplace 内容。
- **第三方 discovery**：claudemarketplaces.com（TR-3）由社区独立维护、500+ install 阈值过滤；Skills marketplace 类聚合（如 mcpmarket.com、lobehub.com 出现在搜索结果）。
- **无统一 schema / API endpoint**：Anthropic 文档提到 `marketplace.schema.json` 的 URL（FS-1 中 `claude-plugins-official` 顶部就是 `"$schema": "https://anthropic.com/claude-code/marketplace.schema.json"`），但 TR-1（just-be.dev 博客作者实测）指出 **"if you check their official marketplace you'll see a link to it ... but it doesn't actually exist. I think it's just a hallucination"**——schema URL 实际 404。文档中只有人类可读的字段说明（OD-3 / OD-4）。

---

## 9. 对 B / C 调研的影响（≤ 30 行，不下定论）

> 本节列出"基于 G 事实，B / C 在选源时面临的策略空间分布"，**不裁定任何结论**——后续 Synthesis Gate 决定。

**对 B（Skill 数据源）**：

- **路径一**：完全用 plugin 体系。即源限制为"已发布 `.claude-plugin/marketplace.json` 的 git repo"。Anthropic 官方有 2 个（`claude-plugins-official` 中的 skill 子集 + `anthropic-agent-skills`）；社区有若干（如 `feiskyer/claude-code-settings` 已被本机用户使用，证明社区生态活跃）。skills.sh 是**否**符合此格式需 B 调研验证（很可能不是——skills.sh 据用户描述是聚合站，不是 marketplace repo）。
- **路径二**：用 standalone 路径绕过 plugin。源宽度无限制（任何 `SKILL.md` 都可用），但失去 marketplace.json 的元数据（version / source / category / homepage / author 都要 Ensemble 自行从源页面爬取或推断）。
- **路径三**：双轨并存。UI 统一展示，安装时 Ensemble 内部按源类型走两条不同代码路径。
- **关键互通点（来自 §5）**：从 plugin 体系中"提取"skill 等于 `cp -r .../plugin/skills/<name> ~/.ensemble/skills/`——技术上完全可行，等于把 plugin 内容"标准化"成 standalone 形式。这条路径让"即便选 plugin 数据源、Ensemble 也无需依赖 `claude plugin install`"成为可能。

**对 C（MCP 数据源）**：

- 与 B 同样的三条路径。但 MCP 的"安装动作"本质是把 `command + args + env` 写入某个 `.mcp.json` 或 `~/.claude.json`——**和 plugin 机制天然解耦**。
- 即便从 plugin 安装一个 MCP（如本机已装的 `discord` external_plugin、其 `.mcp.json` 仅 4 行），实际"激活"还是要把 entry 写到 `~/.claude.json` 或项目 `.mcp.json`。Ensemble 已有 `commands/import.rs` 路径在做这件事。
- MCP 候选数据源（Smithery、Glama、mcp.so、awesome-mcp-servers）多数**不是** marketplace.json 形式，而是聚合站爬出来的索引。C 调研需要分别查它们是否有 API、是否提供 stdio vs HTTP 区分。

**共同的 Ensemble 已有约束**：
- Ensemble 现已扫描 `~/.claude/plugins/cache/` 并把里面的 skill / mcp 标 `installSource: 'plugin'`（FS-6 `detect_plugin_skills` / `detect_plugin_mcps`）。"Marketplace 入口安装的 skill / mcp"和"现有 plugin-sourced 资源"会不会在 UI 中产生混淆，是闭环设计要回答的问题（属于 H 调研 + Synthesis）。
- Ensemble 现有 `enabled` 字段读错位置（§7）。任何依赖"plugin enable 状态"的 UI 逻辑当前都不可信，需先修。这是现状事实，不是本调研的产出建议。

---

**本文件结束。本调研提交时全文 ≈ 360 行。**
