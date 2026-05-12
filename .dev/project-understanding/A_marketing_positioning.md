# A. 产品定位与营销推广策略

> 来源：Explore Sonnet SubAgent A（2026-05-12）
> 覆盖：产品定位 / 文案 / 用户画像 / 推广手段 / 品牌资产 / 版本节奏 / 推广完成度

## 1. 产品定位

### 一句话定位

"A macOS desktop application for managing Claude Code configurations — Skills, MCP Servers, and CLAUDE.md files — with visual organization, one-click project deployment, and Finder integration." (README.md:7)

**内部产品愿景（V2.0 Marketplace PRD）**：
> "让'发现资源'成为 Ensemble 闭环的一环，而不是离开 Ensemble 才能完成的外部动作" (.dev/marketplace-prd/03_PRD_v1.md:38)

### 目标用户画像（来自 .dev/marketplace-prd/03_PRD_v1.md §2.1）

- **专业开发者 / 内容创作者**：使用 Claude Code 处理代码、写作、研究、产品设计，已有成熟工作流偏好
- **多项目工作模式**：同时管理 5–20 个 Project，不同 Project 需要不同 Skill/MCP/CLAUDE.md 组合
- **macOS-native 审美用户**：审美锚点 Apple HIG / Linear / Things 3，重视视觉一致、键盘友好、低认知负担
- **配置重度用户**：现有用户机器扫描显示 30+ MCP、17+ Skill、16+ Claude plugin（.dev/marketplace-prd/00_understanding.md §2.1）

### 核心 Use Case（README:13-19）

5 步核心工作流：**Import → Organize → Bundle → Deploy → Launch**
1. 从 `~/.claude/` 导入 Skills 和 MCPs
2. 用 categories/tags 组织（含 AI 辅助分类）
3. 打包成 Scenes（可复用配置预设）
4. 一键部署到 Project 文件夹（Skills 用 symlink，MCPs 写 .mcp.json）
5. 从 Finder 右键菜单直接启动对应配置的 Claude Code

### 与竞品差异

- vs. 直接编辑 JSON/文件：解决"50+ Skills + 多项目不同组合"规模下的管理熵增问题
- vs. Electron 桌面应用：Tauri 2，.dmg ~12MB，内存占用低，原生 macOS 窗口
- vs. Claude Code 自带 CLI：GUI 可视化、拖拽、一键操作
- **Scene 概念是独特核心**：无同类工具有此抽象层，是主要护城河

## 2. 价值主张与文案

### 关键 Hook 语句

**Reddit r/ClaudeCode 版本（个人叙事）**：
> "Made a thing for fellow Claude Code users."
> "Once you have a few dozen Skills, a handful of MCP servers, and CLAUDE.md files across projects, managing them through config files gets tedious." (launch-posts-reddit.md:16-19)

**HN Show HN 版本（量化规模 + 工程叙事）**：
> "I built a Tauri app to manage my 100+ Claude Code skills and MCPs"
> "For a handful of Skills and 2-3 MCPs, editing JSON is fine. The problem creeps up on you." (launch-posts-hn.md:5, :47)

**Twitter/X 主帖（精炼版）**：
> "I built a macOS app to manage Claude Code configs — Skills, MCPs, and CLAUDE.md files — without editing JSON."
> "Scenes let you bundle configs into presets and deploy to any project in one click." (launch-posts-twitter.md:13-17)

**小红书标题（中文社区版）**：
> "🛠️ 写了个 macOS 原生 App，专治 Claude Code 配置管理强迫症" (launch-posts-xiaohongshu.md:7)

**技术差异化 Bullet（多平台一致）**：
- "Designed in Pencil.dev, coded with Claude Code, built with Tauri 2 (Rust backend, React frontend). Not Electron."
- "Native macOS window, ~12MB install"
- "Everything local — no accounts, no telemetry."
- "Open source, MIT licensed, free forever."

### 语调分析

- **个人化、低调**（"I built a thing"，"Made a thing for fellow..."）—— 避免营销腔
- **量化具体**（"50+"、"100+"、"~12MB"）—— HN/Reddit 读者偏好
- **自我使用者身份**（"I hit a point where..."）—— 产品诚意感
- **技术细节作背书**（Tauri vs Electron、symlink、MCP 协议）—— 面向懂行受众
- **中文版更口语化**（"专治配置管理强迫症"）—— 适配小红书调性

## 3. 目标用户与场景

### 预设身份

- 已经日常使用 Claude Code 的开发者（非入门）
- 主力机为 macOS
- 已积累一定数量 Skills/MCPs（HN 文案"100+"，实际用户 30+/17+）
- 对 Tauri/Rust/React 技术栈有认知或好感

### 使用环境

- 纯本地运行（`~/.ensemble/` 存储，无云端）
- macOS 12.0+
- 已安装 Claude Code CLI（README:79）
- 推荐 iTerm2、Warp、Alacritty 用户（Finder 集成支持多终端）

### 痛点（文案原文）

> "managing them through ~/.claude.json and manual file editing gets old fast" (HN)
> "每次开新项目都要翻 JSON 配置文件手动复制粘贴，改完还经常出错" (小红书)
> "keeping track of which Skills go where... that's where the JSON editing starts to feel like busywork" (Reddit)

核心痛点：**多项目 × 多配置项 × 不同组合需求**形成的管理熵增。阈值具体化为"50+"。

## 4. 已采用的推广手段

### 已完成（有文档证据）

1. **GitHub Release v1.0.0**：2026-02-06 发布，tauri.conf.json 已配置 DMG 打包，README 有 Releases 链接
2. **README 截图嵌入**：commit `54fa8e8`、`9a284d6`、`f0b950f`；嵌入 `skill-detail.png` 作为 Hero + 三张缩略图
3. **Reddit 发布文案**：`launch-posts-reddit.md` 覆盖 r/ClaudeCode、r/ClaudeAI、r/macapps + 5 条预备回复
4. **Hacker News Show HN 文案**：`launch-posts-hn.md` 含 3 个标题选项 + 正文 + 6 条预备回复（含"Why Tauri vs Electron"等技术问题）
5. **Twitter/X 文案**：`launch-posts-twitter.md` 主帖 + 4 条线程回复 + 时间策略（周二至周四 9-11am PT）
6. **小红书文案**：`launch-posts-xiaohongshu.md` 中文 + 6 张图片说明 + 15 个标签
7. **Apple 代码签名 + 公证**：tauri.conf.json 配置 Developer ID（BoZhi Yuan / 4WZ6SMP55G）；commit `9b3b83c` notarization 完成
8. **GitHub 仓库元数据**：README Badges（License/Release/macOS 12.0+），CODEOWNERS、ISSUE TEMPLATE、PR TEMPLATE 就绪
9. **Demo 视频规划**：Twitter 和小红书文案均提到 `~/Documents/Ensemble.mp4`，展示 Finder 右键工作流

### 已规划但未确认执行

10. **GitHub Topics 设置**：release-readiness-analysis.md §四 建议 topics: tauri, react, typescript, macos, claude-code, mcp, skills
11. **Product Hunt 页面**：列为"可选"项，无实质规划
12. **GitHub Actions CI**：ci.yml 已配置（前端 TS + Rust 双 job），pr-check.yml 也已就绪，**但 release.yml 不存在**，DMG 构建+GitHub Release 创建是手动操作

## 5. 品牌资产盘点

### 应用名称含义

"Ensemble" — 音乐术语"合奏" / "整体搭配"。与产品核心功能高度契合：将多个 Skill/MCP/CLAUDE.md 编排成协调工作的 Scene。文档中未做显式说明。

### Logo 与图标

已存在于 `src-tauri/icons/`：`icon-source.svg`、`icon.png`、`icon.icns`、`icon.ico`、多尺寸 PNG、Windows 磁贴系列、StoreLogo.png

**注意**：release-readiness-analysis.md §四 "可选"项明确列出"设计项目 Logo"，说明**发布规划时 Logo 被认为尚不完备**，有改进空间。

### Screenshots（`docs/screenshots/`，12 张）

- `skill-detail.png`（Hero 图，所有平台主视觉，完整三栏 UI）
- `skills-list.png`、`mcp-servers-list.png`、`claude-md-list.png`
- `scenes-list.png`、`projects-list.png`
- `category-filter.png`、`mcp-detail.png`、`claude-md-detail.png`
- `scene-detail.png`、`project-config.png`
- `finder-integration.png`（后补，commit `f0b950f`）

### 设计工具与风格关键词

- 设计工具：**Pencil.dev**（公开文案均提及，品牌叙事一部分）
- 设计风格：macOS-native，严格遵循 `.claude/rules/design-language.md`
- UI 锚点：Apple HIG、Linear、Things 3
- 风格关键词：质感高级、细腻、精致、低认知负担、键盘友好

### 技术品牌叙事

固定组合："Designed in Pencil.dev, coded with Claude Code, built with Tauri 2"

## 6. Release 节奏与版本管理

### CHANGELOG 体现的节奏

- **v1.0.0**：2026-02-06 发布，单次大版本含全部功能（Skills、MCPs、CLAUDE.md、Scenes、Projects、Finder、Auto-Classify、Trash）
- **[Unreleased]**：当前 main 有大量 feature commit 但未标版本（Marketplace V2.0 实施中）

### CI 自动化程度

- **CI**（ci.yml）：PR + main push 自动触发，覆盖 TS 类型检查、ESLint、Vitest、Rust cargo fmt/clippy/test/build
- **PR Quality Gate**（pr-check.yml）：commit message lint、PR description check
- **Release 自动化**：**无**。无 release.yml，DMG 构建和 GitHub Release 创建是手动
- **Codex CI**（codex.yml）：autonomous coding agent，非发布相关

### 最新版本号

v1.0.0（package.json:3、CHANGELOG.md:10、tauri.conf.json:3、Cargo.toml:2 全部一致）

## 7. 当前推广完成度评估

### 已完成

- GitHub 仓库公开，README 带截图和 Badge
- DMG 通过 Apple Developer ID 签名并公证
- GitHub Release v1.0.0 已创建并上传 DMG
- 4 个平台文案（Reddit / HN / Twitter / 小红书）全部完整
- 11-12 张截图就绪（Retina 2x）
- Demo 视频规划（视频文件在工作树外）

### 未完成 / 未确认

- **实际发帖动作**：所有文案均为"准备好但待发布"状态，无任何帖子 URL 或发帖确认记录
- **Product Hunt 页面**：可选项，无规划文档，无上架证据
- **官方 Landing Page / 官网**：不存在（GitHub README 即主页面）
- **社交账号**：无项目专属 Twitter/X 账号
- **GitHub Topics 设置**：建议已列出但无执行确认
- **Demo 视频**：引用路径 `~/Documents/Ensemble.mp4`，在项目仓库外，无法确认是否已录制
- **Release 自动化**：无 release.yml，发布流程全手动

## 8. 主 Agent 应知的"非显然"事实

### 8.1 产品在中文社区有明确传播规划

小红书文案完整存在，是首批发布平台之一，针对性使用小红书传播语言（"强迫症"、"如果你也是 Claude Code 重度用户"）。目标受众明确包含中文 Claude Code 用户圈。

### 8.2 Twitter 文案明确指导"零粉丝冷启动"策略

> "Video is more effective than static screenshots for a zero-follower account"
> "Launch sequence: Reddit (r/ClaudeAI, r/ClaudeCode) + Show HN first, then tweet with social proof."

**有意识的冷启动序列**：先 Reddit/HN 积累讨论和 GitHub Star，再用社会证明加持 Twitter 发帖。

### 8.3 无 Landing Page，GitHub README 是唯一公开入口

无独立官网，所有外链均指向 `https://github.com/O0000-code/Ensemble`。README 承担 landing page 全部功能。转化漏斗非常短（GitHub → DMG 下载）。

### 8.4 产品由 Claude Code 生成自身代码（"反身性营销"）

所有平台文案主动声明 "coded with Claude Code"——用 Anthropic 的工具管理 Anthropic 的工具配置，由 Anthropic 的 AI 编写代码。在 r/ClaudeAI 和 r/ClaudeCode 社区中有特殊共鸣价值。

### 8.5 Twitter/小红书文案曾丢失后重建

release-readiness-analysis.md §1.3：原始文案在 `open-source-prep/marketing/content/` 目录下，在 docs 清理过程中被删除。当前两份文案是重建版本，**原始版本中是否有细节差异未知**。

### 8.6 签名身份信息已公开

`tauri.conf.json:47` 明文：`"signingIdentity": "Developer ID Application: BoZhi Yuan (4WZ6SMP55G)"`。开发者真实姓名暴露。Cargo.toml authors 仅 `["O0000-code"]` 匿名，但 macOS 签名证书不可匿名。**如果匿名发布是诉求，需关注此点**。

### 8.7 V2.0 Marketplace 功能已在 main 分支实装（未版本化）

`feat(marketplace):` 系列 commit 已 merge 到 main，包括完整的 skills.sh mirror + MCP Registry mirror + 一键安装。但 CHANGELOG 仍只有 v1.0.0。**目前处于"代码领先文档/版本号"状态**。

### 8.8 多个未合并 worktree 含历史营销资产

父目录下 `Ensemble2-open-source-prep`、`Ensemble2-open-source-v2`、`Ensemble2-release` 等多个 worktree，含截图指南（Xnapper 推荐、渐变背景方案）、演示数据规划等**在主工作树中不可见的历史资产**。清理前可作参考。

### 8.9 Product Hunt 被明确标为"可选"

Product Hunt 放入"可选"渠道，创作者目前不认为 PH 是优先渠道。**HN Show HN + Reddit + 小红书是当前实际规划的三轴传播**。

### 8.10 Ghostty 终端是社区参与的第一条证据

git log 显示 Ghostty 支持通过 external PR 合入。说明已有外部贡献者。**可作为"社区正在参与"的真实数据点用于推广叙事**。

---

*主要引用文件*：README.md, CHANGELOG.md, .dev/release-execution-plan.md, .dev/release-readiness-analysis.md, .dev/marketplace-prd/00_understanding.md, .dev/marketplace-prd/03_PRD_v1.md, /Users/bo/Documents/Development/Ensemble/launch-posts-{reddit,hn,twitter,xiaohongshu}.md, src-tauri/tauri.conf.json, `git log --oneline --all | head -100`
