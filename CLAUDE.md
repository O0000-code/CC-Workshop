# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Ensemble is a macOS desktop app for managing Claude Code configurations (Skills, MCP Servers, CLAUDE.md files, Rules). Built with Tauri 2 (Rust backend) + React/TypeScript frontend. It imports configs from `~/.claude/` and `~/.claude.json`, organizes them with categories/tags, bundles them into Scenes, and deploys Scenes to projects via symlinks and `.mcp.json` files.

## Commands

```bash
# Development (runs Vite frontend + Rust backend concurrently)
npm run tauri dev

# Production build (outputs .app to src-tauri/target/release/bundle/macos/)
npm run tauri build

# Frontend-only dev server (no Tauri IPC — limited functionality)
npm run dev

# Tests
npm test                          # Frontend (vitest)
npm run test:watch                # Frontend watch mode
cd src-tauri && cargo test        # Rust backend
npm run test:all                  # Both frontend + backend

# Lint
npx eslint src/                   # ESLint (flat config)
```

## Architecture

### IPC Boundary

Frontend calls Rust via `safeInvoke()` (`src/utils/tauri.ts`), which wraps Tauri's `invoke()` with environment detection. All backend commands are registered in `src-tauri/src/lib.rs` via `tauri::generate_handler![]`. The Rust command modules live in `src-tauri/src/commands/` — one file per domain (skills, mcps, config, data, etc.).

Types must stay in sync across the boundary:
- Rust: `src-tauri/src/types.rs` (all types use `#[serde(rename_all = "camelCase")]`)
- TypeScript: `src/types/index.ts`, `src/types/claudeMd.ts`, `src/types/rule.ts`, `src/types/plugin.ts`, `src/types/trash.ts`

### State Management

Each domain has its own Zustand store (`src/stores/`). Stores call `safeInvoke()` for persistence and apply optimistic updates. The `appStore` handles categories, tags, and cross-cutting UI state; domain stores (skillsStore, mcpsStore, scenesStore, etc.) handle their respective entities.

Reorder operations use a two-phase commit: synchronous optimistic update + queued async IPC, with version counters to detect stale responses.

### Data Storage

All app data lives in `~/.ensemble/`:
- `data.json` — categories, tags, scenes, projects, metadata (canonical backend state, protected by `DATA_MUTEX`)
- `settings.json` — user preferences
- `skills/` — managed skill directories
- `mcps/` — MCP config JSON files
- `claude-md/{id}/CLAUDE.md` — managed CLAUDE.md files (content stored as independent files, not in data.json)
- `rules/{id}/<filename>.md` — managed Rule files (independent files; `filename` is persisted because Claude Code indexes rules by filename)
- `trash/` — soft-deleted items (recoverable)

`ENSEMBLE_DATA_DIR` env var overrides the data directory (used for test isolation).

### MCP Configuration Locations

Claude Code reads MCP config from `~/.claude.json` (NOT `~/.claude/settings.json`). The `ClaudeJson` type in `types.rs` models this: user-scope MCPs at `mcpServers`, project-scope at `projects[path].mcpServers`. Project-level deployment writes `.mcp.json` in the project root.

Both stdio MCPs (command + args) and HTTP MCPs (url, no command) are supported. `ClaudeMcpConfig.command` defaults to `""` via `#[serde(default)]` to handle HTTP MCPs that lack a command field.

### Project Deployment (Sync)

When a Scene is synced to a project:
1. Skills: symlinked into `<project>/.claude/skills/`
2. MCPs: written to `<project>/.mcp.json`
3. CLAUDE.md: copied to configurable path (`.claude/CLAUDE.md`, `CLAUDE.md`, or `CLAUDE.local.md`)
4. Rules: copied to `<project>/.claude/rules/<filename>.md` (path fixed; per-rule `is_global` toggle is independent of Scene assignment)

### Routing

React Router in `src/App.tsx`. `MainLayout` wraps all pages with a sidebar. Pages: Skills, MCP Servers, CLAUDE.md, Rules, Scenes, Projects, Settings, plus dynamic Category/Tag filter pages.

### Window Behavior

macOS-standard: close hides the window (app stays in background). Dock icon click restores it. The `--launch` CLI flag starts hidden — used by the Finder Quick Action integration.

## Core Entities & Mental Model

Ensemble 是 Claude Code 配置的**编排层**——不解析也不运行 Skill / MCP,只做"采集 → 管理 → 重新部署"。

### 三条数据流

- **采集**: `~/.claude/skills/`、`~/.claude.json`、`~/.claude/plugins/cache/...`、`~/.claude/rules/`、Marketplace upstream
- **管理与存储**: `~/.ensemble/`(data.json + 独立的 skill 目录 / mcp 文件 / claude-md 文件 / rule 文件)
- **重新部署**: Scene 打包 → 写入 Project 的 `.claude/skills/`(symlink)+ `.mcp.json` + 一个 CLAUDE.md + N 个 Rule 文件

`~/.ensemble/data.json` 是唯一持久化的 canonical state(由 `DATA_MUTEX` 串行化写入);Skill 目录 / MCP JSON / CLAUDE.md / Rule 内容都以**独立文件**落盘,data.json 只存元数据指针。

### 五个核心实体

| 实体 | 持久位置 | id 形式 | Page |
|---|---|---|---|
| **Skill** | `data.json::skillMetadata` HashMap + `~/.ensemble/skills/<name>/` | `id == sourcePath`(**不变式**)| `/skills` |
| **MCP Server** | `data.json::mcpMetadata` HashMap + `~/.ensemble/mcps/<name>.json` | `id == sourcePath`(**不变式**)| `/mcp-servers` |
| **CLAUDE.md** | `data.json::claudeMdFiles` 数组 + `~/.ensemble/claude-md/{uuid}/CLAUDE.md` | UUID | `/claude-md` |
| **Rule** | `data.json::rules` 数组 + `~/.ensemble/rules/{uuid}/<filename>.md` | UUID(+ 持久 `filename` 字段)| `/rules` |
| **Scene** | `data.json::scenes` 数组 | UUID | `/scenes` |

Skill / MCP 的 `id == sourcePath` **不变式**是系统脊柱——marketplace 短链、Scene 引用、Project sync 全部依赖(`types.rs:13-15` + `64-68` 警告若改 UUID 必须全量审计)。CLAUDE.md / Rule 用 UUID 是因为 sourcePath 来自用户磁盘不稳定且可重名;Rule 额外持久 `filename` 字段(Claude Code 按 filename 索引),UI `name` 可改,filename 不可改。

Scene 持四种引用列表:`skillIds`、`mcpIds`、`claudeMdIds`(单选语义)、`ruleIds`(多选)。

### 三种 install 来源(Skill / MCP 共有维度)

`installSource: 'local' | 'plugin' | 'marketplace'`,落盘形式不同:
- **local**: 实体目录 / JSON
- **plugin**: `~/.ensemble/` 内是 **symlink**,目标在 `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/...`。删除 plugin 即失效
- **marketplace**: 实体目录(GitHub codeload 解压拷贝),`marketplaceSource` 记 `{owner, repo, name, lastSyncedAt}` 溯源。`scan_skills` 用 symlink 探测**区分不出** marketplace 与 local,所以 `install_source` 必须持久化在 metadata

CLAUDE.md / Rule 没有这一维度,只有 "managed" 和 "global" 两态。**Rule 的 `is_global` 每条独立**(可同时多条 global,AppData 不存全局指针);`update_rule` 在 `is_global=true` 时镜像写入 `~/.claude/rules/<filename>.md`,改动即时生效。

### 几个易错点

- **Orphan id 静默忽略**: 删除 Skill / MCP / CLAUDE.md / Rule 时**不**级联清理 Scene 的 `*Ids`,sync 时通过 `find(...)` 过滤,找不到的 id 默默跳过(出错与正常都看不见)
- **Scene → Project 的反向防御**: ScenesPage 删 Scene 前查 `projects.filter(p => p.sceneId === id)`,有引用就 alert 阻止 — 正常情况下 `project.sceneId` 不会悬垂
- **Markdown 渲染统一**: Skill instructions / CLAUDE.md content / Rule content 都走 `MarkdownBody`(react-markdown + remark-gfm,无 syntax highlight)
- **HTTP MCP `command` 缺失**: 靠 `#[serde(default)]` 容忍,保住整个 `mcpServers` HashMap 解析(任何一条 entry 解析失败整个 HashMap 全废)
- **MCP scope 两套语义**: `~/.claude.json` 里的 `user / local` **不等于** Ensemble 的 `global / project`——`update_mcp_scope` 控制是否写入 `~/.claude.json::mcpServers`
- **详情面板双实现并存**: Skills / MCPs 主页是 inline detail,`SkillDetailPanel` / `McpDetailPanel` 组件只服务 CategoryPage / TagPage —— 改一处别忘另一处
- **Clear 比 Sync 保守**: 三条 CLAUDE.md 路径无差别全删(与 distributionPath 设置无关);`.claude/rules/` 只删 filename 命中 `data.json::rules` 集合的文件(不误删用户手写 .md);并兼容清理 legacy `settings.local.json::mcpServers`

## Key Patterns

- **Path handling**: `expand_path()` / `expand_tilde()` in `src-tauri/src/utils/path.rs` expand `~` to home dir. `collapse_tilde()` does the reverse for display.
- **Frontend path alias**: `@/` maps to `src/` (configured in both `vite.config.ts` and `vitest.config.ts`).
- **Serde `#[serde(default)]` on String** = empty string when key missing, not when parse fails. Serde HashMap: if ANY entry fails to deserialize, the entire HashMap fails.
- **Plugin support**: Skills/MCPs can come from Claude Code marketplace plugins (`~/.claude/plugins/`). Plugin-sourced items have `installSource: "plugin"` with `pluginId`, `pluginName`, `marketplace` fields.
- **`McpConfigFile`** is constructed in both `import.rs` and `plugins.rs` — when adding fields to it, update both.
- **Husky + lint-staged**: pre-commit runs ESLint + Prettier on staged `src/` files.
