# 调研 A — Ensemble 当前应用全景（Marketplace 接入基线）

> **派单**：`.dev/marketplace-prd/01_research_plan.md` §3 A
> **范围**：仅事实陈述。不写 PRD 内容、不写技术实现、不评价架构好坏。所有引用带文件行号。
> **产物用途**：作为 B / C / D / E 调研的"项目侧前提"，作为 Synthesis Gate 决策"复用还是新建"的事实依据。

---

## 章节速览

- §1 `SkillsPage` / `McpServersPage` / `ScenesPage` 的页面结构骨架
- §2 `ListDetailLayout` / `PageHeader` / `SlidePanel` / `EmptyState` / `SearchInput` 实际 props 与使用模式
- §3 `SkillListItem` / `McpListItem` 视觉密度与 Marketplace List Item 的"沿用还是变体"判断
- §4 现有"导入"路径的事实：`ImportSkillsModal` / `ImportMcpModal` 的进度、错误、撤销
- §5 `~/.ensemble/` 的实际安装路径与文件结构
- §6 Auto-Classify 流程的触发与时机
- §7 `installSource: 'plugin'` 的 Skill / MCP 在 UI 中的标识与展示
- §8 必须保持一致的现有交互（双击编辑、右键菜单、SlidePanel 出场动效）
- §9 可复用资产清单（Layout / List / Detail / Modal / Common）
- §10 需要新建清单（≤ 5 项）

---

## §1 三页页面结构骨架（Header / List / Detail / Modal）

### 1.1 SkillsPage（`src/pages/SkillsPage.tsx`）

骨架（按 JSX 自顶向下）：

- 容器：`relative flex h-full flex-col overflow-hidden`（行 678-679）
- `<PageHeader>`：title + searchValue + searchPlaceholder + actions(Import / Auto Classify) — 行 681-729
- 错误条：`mx-7 mt-4 ...` 红色卡（行 732-742），可 dismiss
- Main 滚动区：`flex-1 overflow-y-auto px-7 py-6` + 详情打开时整体 `mr-[800px]` 收缩（行 745-751），动效 `transition-[margin-right] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]`
- 列表：`<EmptyState>`（filteredSkills 为空，行 752-762）/ 或 `<SkillListItem>` 列表 `flex flex-col gap-3`（行 766-778）
- 右侧 800 px：`<SlidePanel isOpen={!!selectedSkillId} width={800} header={detailHeader}>` 内嵌 `detailContent`（行 783-791）
- `<IconPicker>` 锚点弹层（行 794-802）
- `<ImportSkillsModal>`（行 805-812）

**关键事实**：SkillsPage **不使用 `ListDetailLayout`**——它用"全宽 List + 右侧 SlidePanel"模式（详情打开时主区右收 `mr-[800px]`）。这与 `ListDetailLayout`（左固定 380/400 px，右剩余）是**两种不同布局模式**。

### 1.2 McpServersPage（`src/pages/McpServersPage.tsx`）

与 SkillsPage 完全同构：`<PageHeader>` + 滚动列表 + `<SlidePanel width={800}>`（行 137-145 注释明确）。`McpListItem` 与 `SkillListItem` 几乎对称（详 §3）。Detail header 同样含 `IconPicker` 锚点（行 249）。`ToolItem`（行 110-130）作为"Provided Tools"行内子组件。

### 1.3 ScenesPage（`src/pages/ScenesPage.tsx`）

骨架同 SkillsPage：`<PageHeader>` + List + `<SlidePanel>`（行 26-30 import 一致）。差异：使用 `SceneListItem`（卡片形态略有不同，含 IconPicker），创建用 `<CreateSceneModal>`（行 32）而非 ImportXxxModal。

### 1.4 跨三页一致的骨架抽象

所有三页都是同一种"页面壳"：
1. 顶部 `<PageHeader>` 56 px（title / search / actions 三段）
2. 中间 `flex-1 overflow-y-auto px-7 py-6` 列表区
3. 右侧 `<SlidePanel width={800}>` 详情，主区 `mr-[800px]` 收缩动效
4. 配套 `IconPicker`（锚点定位）+ 主导入/创建 Modal

**结论**：Marketplace 页面（Skill Marketplace / MCP Marketplace）只需复制这种骨架即可视觉一致。无需引入新页面布局原语。

---

## §2 关键 Layout 组件实际 props 与使用模式

### 2.1 `<PageHeader>`（`src/components/layout/PageHeader.tsx`）

Props（行 39-54）：
- `title: string`
- `badge?: ReactNode`
- `searchValue?: string` + `onSearchChange?: (value: string) => void` + `searchPlaceholder?: string`
- `actions?: ReactNode`（右侧按钮区）

实现细节（行 84-120）：
- 高度 `h-14`（56 px），左右 `px-7`（28 px），白底，下边框 `border-b border-[#E5E5E5]`
- 整 header `onMouseDown={startDrag}` 用于窗口拖拽（行 86）
- Title 字号 `text-base font-semibold text-[#18181B]`（行 102-103，即 16 px / 600）
- Search 显式条件：`searchValue !== undefined && onSearchChange !== undefined`（行 82）

**Marketplace 复用判断**：直接传 title="Skill Marketplace"、search 与 SkillsPage 同样接 filter.search、actions 放"Refresh / Source 切换"按钮即可。无需修改组件。

### 2.2 `<ListDetailLayout>`（`src/components/layout/ListDetailLayout.tsx`）

Props（行 20-34）：listWidth(默认 380)、listHeader、listContent、detailHeader?、detailContent?、emptyDetail?、className?。

实现：左 380 px 固定列 + 右 flex-1 列；左右各有 56 px header；detailHeader/Content 为空时显示 emptyDetail（行 107-115）。

**Marketplace 复用判断**：MCP/Skill List 主页**不使用** ListDetailLayout（见 §1.1-1.3）。**但是**如果 Marketplace 决定用"List + Detail 同时可见"模式（如 VSCode Extensions），ListDetailLayout 可直接复用。这是 PRD 阶段一个产品决策点（保持与 Skills 一致用 SlidePanel 模式 / 改用 ListDetail 双栏共存模式）。

### 2.3 `<SlidePanel>`（`src/components/layout/SlidePanel.tsx`）

Props（行 27-46）：isOpen、width(默认 800)、header、headerRight、children、onClose、duration(默认 250)、showCloseButton(默认 true)、className。

实现要点：
- 绝对定位 `absolute top-0 right-0 h-full bg-white border-l`（行 73-75）
- 滑入：`transition-transform`，`translate-x-0` ↔ `translate-x-full`（行 77-79）
- 缓动：`cubic-bezier(0.4, 0, 0.2, 1)`，250 ms（行 84）
- Header 56 px、`px-7`、`onMouseDown={startDrag}`（行 89-91）
- Header 左中右三段（content / headerRight / Close X 按钮）
- Content 滚动 `overflow-y-auto pt-3 pr-7 pb-7 pl-7`（行 115）

**Marketplace 复用判断**：SlidePanel 完全沿用，`width=800` 与 SkillsPage / McpServersPage 一致。Marketplace 详情页（一个 marketplace item 的详情）应在右侧 SlidePanel 渲染，与现有 Skill 详情同视觉密度。

### 2.4 `<EmptyState>`（`src/components/common/EmptyState.tsx`）

Props（行 3-8）：icon、title、description?、action?。Container `flex flex-col items-center justify-center text-center p-12`（行 28），icon 32×32 #D4D4D8，title 14 px / 500 #71717A，description 13 px / normal #D4D4D8 max-width 280 px。

**Marketplace 复用判断**：列表过滤后无结果、上游不可达、网络异常等所有空态都直接复用 EmptyState。

### 2.5 `<SearchInput>`（`src/components/common/SearchInput.tsx`）

Props（行 8-12）：value、onChange、placeholder?、className?。固定宽 220 px（行 26），高 32 px、`rounded-md`、左 Search icon 14 px、focus-within border #18181B（行 22-37）。SearchInput 已被 PageHeader 内置使用（PageHeader.tsx:111-115），Marketplace 沿用 PageHeader 即自动有同样的 Search 体验。

---

## §3 List Item 视觉密度判断（Marketplace List Item 完全沿用还是变体？）

### 3.1 `SkillListItem` 视觉规格（`src/components/skills/SkillListItem.tsx`）

容器（行 127-145）：
- `flex w-full items-center justify-between rounded-lg border border-[#E5E5E5] px-5 py-4`
- bg：未选 `white hover:bg-[#FAFAFA]` / 选中 `bg-[#FAFAFA]`
- 整体 `transition: background-color 250ms cubic-bezier(0.4, 0, 0.2, 1)`（行 19-21, 142-144）

左段（行 147-193）：
- Icon 容器 40×40 `rounded-lg`，bg 未选 `#FAFAFA` / 选中 `#F4F4F5`，icon 20 px，颜色 `#52525B`（选中 `#18181B`）
- Plugin badge：当 `installSource === 'plugin'` 时叠 16×16 蓝点（`#3B82F6`，含 `Puzzle` icon），右上 -4/-4 偏移（行 171-178）
- Info 列：name 13 px / `font-medium`（选中 600），description 12 px `text-[#71717A]`，`truncateToFirstSentence(description, 100)`（行 189-191）

右段（行 196-206）：Category Badge + TagsWithTooltip。`compact` 时整段 `opacity: 0; max-width: 0`，反向带 150 ms 延迟（行 117-124）。

末段：More menu 32×32 button + dropdown（仅 Delete，行 209-228）。

### 3.2 `McpListItem`（`src/components/mcps/McpListItem.tsx`）

与 SkillListItem **几乎完全镜像**：相同的容器尺寸、相同的 icon 处理、相同的 plugin badge、相同的 compact 折叠逻辑、相同的 Right section（Category + Tags）、相同的 More menu（行 138-243）。差异仅在：右段 max-width 300 px 而非 400 px（行 131），icon 选择回退 `categoryIconMap`（行 37-42）。

### 3.3 Marketplace List Item 应该怎么处理

**核心判断**：**完全沿用 SkillListItem / McpListItem 的容器、字号、间距、icon 处理，只替换右段操作区与左段 plugin badge 语义**。

理由：

1. **视觉密度必须完全一致**——用户原话"风格和功能完全一致"，且这两个组件已经定义了"40 px icon + 13 px name + 12 px desc + 右段元数据 + More menu"的模式。
2. **右段在 Marketplace 上下文不再是 Category + Tags**（因为 marketplace item 还没分类）。改为"Source Badge"（如来自 skills.sh / mcp registry）和"Install / Installed 状态"。
3. **"More menu"在 Marketplace 上下文应改为"Install"按钮**（已安装时改为 Installed 灰态 + 仅可移除）；More menu 在已安装态可能仍需出现（Open in source、View on web）。
4. **左段 plugin badge** 在 Marketplace 上下文可改为"已安装到 Ensemble"标识（同样 16 px 蓝点位置，但颜色 / icon 替换为 ✔），让用户在浏览 marketplace 时一眼看到哪些已经装过。

实际可行的做法：**抽出 `BaseListItem` 公共结构**（容器 + 左段 icon + Info），让 SkillListItem / McpListItem / MarketplaceListItem 三者共享。**或者**：直接复制 SkillListItem 的 JSX 骨架，仅替换右段渲染逻辑——这与现有 SkillListItem ↔ McpListItem 的关系（已经是镜像复制）一致。

### 3.4 List Item 与详情面板的"压缩动效"必须一并保留

SkillListItem 的 `compact` 模式（行 117-124）+ SkillsPage 的 `mr-[800px]` 主区收缩（行 749），共同构成了"列表压窄 + 右段隐藏 + 详情滑入"的同步舞蹈。如果 Marketplace List Item 没有 compact 模式，用户从 marketplace 详情切回列表时会感到节奏断层（详情滑出但列表已经在全宽，与现有模式不符）。

事实约束：
- compact=true 时 right section 立即隐藏（`opacity 250ms / max-width 250ms`，无延迟）
- compact=false 时 right section 延迟 150 ms 再淡入（与列表宽度恢复同步，避免抖动）
- bg 色切换 250 ms 与上述同节奏

Marketplace List Item 的 compact 模式应**完全镜像**这一时序——不能只复制视觉结构而漏掉动效细节。

---

## §4 现有"安装/导入"路径的事实

### 4.1 ImportSkillsModal（`src/components/modals/ImportSkillsModal.tsx`）

形态（行 247）：
- 弹窗 520×580 px、`rounded-[16px]` bg-white、阴影 `0 25px 50px rgba(0,0,0,0.1)`、overlay `bg-black/40`
- Header 80 px 含标题 + 子标题 + 关闭 X（行 249-265）
- Tab 行 justify-between：左侧两个 Tab（"Local" 本地系统 / "Plugin" 已安装的 Claude plugin），右侧选择计数 + All 全选 checkbox（行 268-360）
- Body：扫描态文字 / 空态文字 / 多行 checkbox 列表（行 366-405、453-510）
- Footer：左 Tooltip Info 按钮（含警示文案"导入会移走原文件"），右 Cancel + 主动作 Import Selected（行 408-445、513-546）

进度反馈：
- "Detecting skills..."（扫描进行中，行 369）/ "Importing..."（导入按钮文案，行 442）
- 主按钮在导入时禁用 + 文字切换（行 433-443）
- **没有进度条 / 没有逐项进度**——是 batch fire-and-await 模式
- 没有取消机制（一旦点击 Import Selected 就不能撤销当前批次）

错误处理：通过 `importStore.error` 字符串保存错误，但**这个 modal 不渲染 error**（错误展示在 SkillsPage 顶部错误条 `mx-7 mt-4 ...`）。

撤销 / 回滚：**没有"撤销最近一次导入"按钮**。但导入前会自动备份（`backupBeforeImport()`，importStore.ts 行 342）：备份在 `~/.ensemble/backups/`（数据是从前文 ls 输出确认目录存在）。备份路径 → 用户需要手动从备份恢复。

### 4.2 ImportMcpModal（`src/components/modals/ImportMcpModal.tsx`）

结构与 ImportSkillsModal **几乎完全一致**：相同 520×580 弹窗、相同 Local / Plugin 双 tab、相同的 selection 模型、相同的 Import Selected 按钮（行 1-200 看到的部分）。差异仅在：MCP 项展示 scope（user / local 项目路径）、key 用 `name|scope|projectPath` 三元组组合（行 78-79）。

### 4.3 Marketplace 安装流程的复用基础

**正面信号**：
- 已有"批量勾选 + 一键安装"的交互模式（ImportSkillsModal Tab 切换式 / 全选 / 计数显示）
- 已有"Detecting → Importing → Done"三态文案
- 已有"导入前备份"机制（`~/.ensemble/backups/`）
- 已有"自动从 Claude / Plugins 来源识别同名物"的逻辑（`getMcpKey`、`importedPluginSkills` 防重）

**待补的事项**（不是缺陷，是 Marketplace 与 Import 的功能差异）：
- Marketplace 安装是**单次单项**还是**批量**？（用户原话"一键安装"暗示单项即可，但 ImportSkillsModal 已经支持批量勾选）
- Marketplace 安装动作的**真实进度** —— 网络下载 / 解压 / 写入需要逐项可见进度，不能像 import 那样只显示一次"Importing..."
- **撤销 / 卸载入口** —— 已经在 SkillListItem More menu 中有 Delete，复用即可（但需要补"安装后立即卸载"的零成本路径）

### 4.4 importStore.importSkills 实际执行顺序（事实陈述）

`src/stores/importStore.ts:324-381` 给出"导入"的物理动作链：

1. `backupBeforeImport()`（行 342-346）—— 失败立即终止，错误回流 set state
2. `import_existing_config` IPC 调用（行 349-353）—— 后端 `import.rs:527-578` 的入口，Rust 端实际拷贝 / 写入
3. 成功后，`remove_imported_skills` IPC（行 362-366）—— 从 ~/.claude 源位置物理移除（因此 ImportSkillsModal Tooltip 警告"会移走原文件"）
4. `useSkillsStore.getState().loadSkills()`（行 368）—— 重新扫描列表，让 UI 出现新 skills

Marketplace 安装链对应映射（事实层面，不是 PRD 决策）：
- 不需要 `backupBeforeImport`（marketplace 安装是新增，不影响现有数据）
- 需要新建一组"下载 + 解压 + 写入 ~/.ensemble/skills/"的 IPC（替换 `import_existing_config`）
- 不需要 `remove_imported_skills`（源不在用户机器上）
- **必须** `loadSkills()`（让 SkillsPage 立即显示新装项）—— 这是闭环的"立即可见"环节，不可省

### 4.5 importStore 的"Plugin Tab" 与 Marketplace 的语义边界

ImportSkillsModal 的 Plugin tab（行 449-510）展示的是 **已经安装到 Claude Code（`~/.claude/plugins/`）的 plugin 中包含的 skills**。这与"从 marketplace 浏览并安装"是两个不同动作：

- Plugin Tab：用户已经在 Claude Code 端跑过 `claude plugin install`，这里只是把 plugin 内的 skill 元数据**导入到 Ensemble 的管理范围**（"我承认这个 plugin skill 也归我管"）
- Marketplace（待建）：用户在 Ensemble 内浏览**未安装**的资源，一键安装到 `~/.ensemble/skills/`

两者在数据持久化上**完全不交叉**：Plugin Tab 安装后写入 `data.json.importedPluginSkills`；Marketplace 安装后写入（建议）`data.json.skillMetadata`。Marketplace 的事实约束是：**不修改 plugin 体系**，只走 Ensemble 自有路径。

---

## §5 `~/.ensemble/` 实际安装路径与文件结构

实际目录（用户机器）：
```
~/.ensemble/
├── data.json           # 元数据：categories / scenes / projects / skillMetadata / mcpMetadata / 已导入 plugin 列表 / 迁移 flag
├── settings.json       # 用户配置
├── backups/            # 导入前自动备份的快照
├── claude-md/{uuid}/   # CLAUDE.md 文件按 UUID 子目录存（每个一个文件夹，子目录里放 CLAUDE.md）
├── mcps/{name}.json    # 每个 MCP 一个 JSON 文件，扁平在该目录下
├── skills/{name|symlink}/  # 每个 Skill 一个子目录(本地拷贝)或 symlink(链接到 ~/.agents/skills/)
└── trash/              # 软删除恢复目录
```

来自 `import.rs:535-541` 的事实：
- skills 目标目录：`~/.ensemble/skills/{item.name}/`
- mcps 目标目录：`~/.ensemble/mcps/{item.name}.json`

`copy_skill`（`import.rs:580-651`）策略 B：来自 `~/.agents/skills/` 的 source 用 symlink，否则复制目录。这意味着 **Marketplace 安装的 Skill 应该作为 Ensemble 自有目录复制到 `~/.ensemble/skills/{name}/`**（不是 symlink；外部下载源不存在 Ensemble 之外的稳定目录）。

`extract_mcp_config`（`import.rs:658-740`）：MCP **不是从源文件复制**而是从 `~/.claude.json` / `~/.claude/settings.json` 读取已有配置，序列化成 `McpConfigFile` JSON 写到 `~/.ensemble/mcps/{name}.json`（行 678-697）。换言之 MCP 的"安装单元"是**JSON 配置**（`command + args + env + url + mcp_type`），不是文件。

**对 Marketplace 闭环设计的事实约束**：
1. Marketplace Skill 安装的物理落地路径 **必须是** `~/.ensemble/skills/{name}/`，否则不会出现在 SkillsPage（因 `scan_skills` 扫描这个目录）
2. Marketplace MCP 安装的物理落地是 **写入** `~/.ensemble/mcps/{name}.json`，由 Ensemble 自行构造一个 `McpConfigFile`（包含 `installSource`/`marketplace` 等元数据字段，types.ts 行 32-36 / 70-74 已存在这些字段）
3. data.json 的 `importedPluginSkills` / `importedPluginMcps`（types.ts 行 325-326）已是"已从 plugin 导入"的去重表；Marketplace 来源的安装可能也需要类似机制（`importedMarketplaceSkills` 等），让重复安装时有 fact-of-truth 可查
4. Marketplace 来源的元数据要写入 `data.json` 的 `skillMetadata` / `mcpMetadata`（包含 `category` / `tags` / `categoryId`，data.json 实际样本可见），让 Auto-Classify 后的分类持久化

### 5.1 现有 ~/.ensemble/skills/ 中的 symlink 模式

实际机器扫描显示（`ls -la ~/.ensemble/skills/`）：约 17 个 skill 子项中，**大部分是 symlink 指向 `~/.agents/skills/`**（如 `agent-browser → /Users/bo/.agents/skills/agent-browser`），**少数是真实子目录**（如 `taste-skill`、`x-article-publisher-skill`、`youtube-clipper`、`skill-from-masters`）。这与 `import.rs:585-651` 的"Strategy B"实现一致：来自 `~/.agents/skills/` 的源用 symlink，否则真实拷贝。

**事实约束**：Marketplace 安装的 Skill 不会复用 symlink 路径（因 marketplace 源是远程 git/zip，不是 `~/.agents/skills/` 的本地目录）。所以 marketplace 安装一律落到**真实拷贝**（与 `taste-skill` / `youtube-clipper` 同模式）。

### 5.2 mcps/ 目录的 JSON schema 真实样例

`~/.ensemble/mcps/` 中实际看到 30+ 个 JSON 文件（`agentation.json`、`tavily.json` 等），文件大小 199-421 字节区间，对应一组扁平 JSON。从 `extract_mcp_config`（`import.rs:678-697`）反推 schema：`{ name, description?, command, args, env?, providedTools?, url?, mcpType?, installSource?, pluginId?, pluginName?, marketplace? }`。**marketplace 字段已存在**（行 691, 716）—— Marketplace 安装的 MCP 只需正确填这一字段，元数据闭环已具备。

---

## §6 Auto-Classify 流程的触发与时机

`autoClassify` 实现（`src/stores/skillsStore.ts:319-413`）：
- 触发：用户点击 SkillsPage header "Auto Classify" 按钮（SkillsPage.tsx:697-726）；MCP 同样有 "Auto Classify"（McpServersPage.tsx:163）
- 逻辑：所有 skills 全量传给后端 `auto_classify` IPC（行 339-358），含 items + 现有 categories + 现有 tags + 可用 icons
- 后端返回 `ClassifyResult[]`（`{ id, suggested_category, suggested_parent_category?, suggested_tags, suggested_icon }`，types.ts:167-173）
- 前端按结果 `addCategory` / `addTag`（含 parentId 嵌套），然后 `update_skill_metadata` 持久化（行 365-393）
- 视觉：spinner → checkmark → fade-out → restore（行 399-411，状态机由 `isClassifying` / `classifySuccess` / `isFadingOut` / `showRestoreAnimation` 驱动）

**关键事实**：Auto-Classify 是**用户显式触发的全量批处理**，不是新安装时自动触发。但**重要**：用户原话"安装到管理路径，能直接被分类"暗示 Marketplace 安装后**应当**自动触发 Auto-Classify（至少对新装的那一项），而不是要求用户额外点一次按钮。这是 PRD 决策点之一（D-8 in 01_research_plan.md §4.2）。

settings 中已有 `autoClassifyNewItems: boolean`（types.ts:131），暗示"新增项自动分类"已是预设的产品意图，但目前**没有任何代码消费这个 flag**（没有 IPC / store 用它 — 通过 grep 验证）。Marketplace 闭环设计可启用此 flag。

---

## §7 `installSource: 'plugin'` 的视觉与数据展示

### 7.1 List Item 上的展示

SkillListItem（行 86-87, 171-178）和 McpListItem（行 95-96, 184-191）的处理完全镜像：
- 检测：`isPluginSource = installSource === 'plugin'`
- 渲染：在 icon 容器右上角叠 16×16 圆角方块，bg `#3B82F6`（Apple 蓝）、内嵌 8×8 白色 Puzzle icon、`border-2 border-white`，绝对定位 -4/-4

视觉信号：plugin 来源的 Skill / MCP 在列表中能被立即识别。

### 7.2 Detail Panel 上的展示

SkillsPage Scope 行（行 617-634）：当 `installSource === 'plugin'` 时不展示 ScopeSelector，而是渲染一个浅蓝标签：`bg-[#EFF6FF] text-[#3B82F6]` "Plugin"（行 620-624）。这表明 plugin 来源的 Skill **没有 user/project scope 概念**（由 plugin 自身管理）。

### 7.3 Import Modal 上的展示

ImportSkillsModal Plugin Tab（行 449-510）：每个 plugin skill 行展示 `Store icon + marketplace 名` 作为来源标签（行 491-498），与 SkillListItem 上的 plugin badge 形成"导入前 → 导入后"的视觉一致性。

### 7.4 Marketplace 安装来源标识对策

**事实约束**：当前 plugin badge 的位置、颜色、icon 已被占用（蓝 + Puzzle = "来自 Claude Code plugin"）。Marketplace 安装的 Skill / MCP 如果再叠一个 badge，会冲突。

**可行做法**：复用相同位置但用不同颜色 / icon（如绿色 + Store）；或用 detail 中的 "Source" 行展示 marketplace 来源，list item 不加额外 badge（保持视觉简洁）。这是 PRD 决策点（D-9 in 01_research_plan.md §4.2）。

---

## §8 必须保持一致的现有交互

### 8.1 双击编辑

Sidebar 中的 Category / Tag 双击进入重命名（Sidebar.tsx:70-73 props，MainLayout.tsx:387-389 handler）。SkillListItem / McpListItem **本身没有双击** —— 单击是选中（行 128 onClick → setSelectedSkillId），双击没有专门 handler。**Marketplace List Item 应继承单击=选中、双击无副作用**（避免引入新交互范式）。

### 8.2 右键菜单

Sidebar Category 行右键 → ContextMenu（Rename / Delete / Promote to Root，MainLayout.tsx:699-726）。SkillListItem **没有右键** —— 只有 More menu (`...`) 按钮（行 209-228）触发 dropdown。**Marketplace List Item 应继承"More menu 而非右键"模式**（与现有列表项一致，与 Sidebar 这种"组织实体"区分）。

### 8.3 拖拽

Sidebar Categories / Tags 用 dnd-kit（`SortableCategoriesList`、`SortableTagsList`，Sidebar.tsx:5）。SkillListItem / McpListItem **不可拖拽**。**Marketplace List Item 沿用"不可拖拽"**——marketplace 列表是"上游展示"，不是"用户组织对象"。

### 8.4 SlidePanel 出场动效

`SlidePanel`（SlidePanel.tsx:77-85）：滑入 250 ms `cubic-bezier(0.4, 0, 0.2, 1)`，translate-x。**Marketplace 详情面板必须沿用同样的 250 ms cubic-bezier**（即直接复用 SlidePanel 组件，不传自定义 duration）。

### 8.5 列表 ↔ 详情的"压缩 / 展开"动效

SkillListItem 在 `compact=true` 时，右段 `opacity → 0 + max-width → 0`（行 117-124）；展开时同 transition 但延迟 150 ms（避免列表宽度还在变化时右段又冒出来）。**Marketplace List Item 必须实现同款 compact 动效**——否则用户从 marketplace 详情切回列表时会感到节奏断层。

### 8.6 macOS 窗口拖拽

PageHeader / SlidePanel header / ListDetailLayout header 都有 `onMouseDown={startDrag}` 处理（PageHeader.tsx:86, SlidePanel.tsx:91, ListDetailLayout.tsx:71）。**Marketplace 页面顶部必须保留这一交互**（直接通过复用 PageHeader 自动获得）。

### 8.7 全局动效 / Token

`src/index.css:30-55, 599-680` 已锁定全部 design tokens（color / radius / shadow / drag tokens）；DragOverlay 三层 hsl 阴影、磁性吸附、distance-aware settle 都已规范化。**Marketplace 不引入任何新 token**（参考 `.claude/rules/design-language.md`）。

---

## §9 可复用资产清单（按类别）

| 类别 | 资产 | 路径 / 行号 | Marketplace 复用判定 |
|---|---|---|---|
| Layout | `<MainLayout>` | `src/components/layout/MainLayout.tsx` | 整个 App 壳层；Marketplace 的页面在 `<Outlet />` 内渲染（MainLayout.tsx:691），无需改动 |
| Layout | `<Sidebar>` | `src/components/layout/Sidebar.tsx` | **需扩展**——在 Header 与 navItems 之间插入新 Marketplace 分组（顶部独立分组，已由 §9.1 用户对齐 Q3=(a) 决定） |
| Layout | `<PageHeader>` | `src/components/layout/PageHeader.tsx:73-121` | 完全沿用：title / search / actions 三段足够 |
| Layout | `<ListDetailLayout>` | `src/components/layout/ListDetailLayout.tsx:50-120` | 备选——若 Marketplace 决定双栏共存而非 SlidePanel；当前判断**不使用**，与 SkillsPage 保持模式一致 |
| Layout | `<SlidePanel>` | `src/components/layout/SlidePanel.tsx:60-120` | 完全沿用，width=800 ms duration=250 |
| List | `<SkillListItem>` 模式 | `src/components/skills/SkillListItem.tsx:60-232` | **复制骨架 + 替换右段**（详 §3.3）；不抽象公共组件以保持灵活 |
| List | `<McpListItem>` 模式 | `src/components/mcps/McpListItem.tsx:68-244` | 同上，MCP Marketplace List Item 复制此骨架 |
| Common | `<EmptyState>` | `src/components/common/EmptyState.tsx:22-55` | 完全沿用（空列表 / 网络故障 / 搜索无结果） |
| Common | `<SearchInput>` | `src/components/common/SearchInput.tsx:15-58` | 完全沿用（已被 PageHeader 内置） |
| Common | `<Badge>` | `src/components/common/Badge.tsx:25-68` | 完全沿用，5 种 variant（status / count / category / tag）已覆盖 marketplace 元数据展示需求 |
| Common | `<Button>` | `src/components/common/Button.tsx:64-127` | 完全沿用（4 variant × 3 size）；"Install" 用 `variant="primary" size="small"`，"Installed" 用 `variant="secondary"` 灰态 |
| Common | `<Tooltip>` | `src/components/common/Tooltip.tsx` | 完全沿用（marketplace 安装风险提示、缩短文案的悬浮全文等） |
| Common | `<IconPicker>` | `src/components/common/IconPicker.tsx` | 完全沿用（Marketplace 安装后默认 icon → 用户可改）；用 `triggerRef` 锚点定位（同 SkillsPage:794-802） |
| Common | `<CategoryTreeDropdown>` | `src/components/common/CategoryTreeDropdown.tsx` | 完全沿用（Marketplace 安装后立即可在详情中改 category） |
| Common | `<ContextMenu>` | `src/components/common/ContextMenu.tsx` | 完全沿用（用于 Sidebar Marketplace 子项右键，如有） |
| Modal | `<ImportSkillsModal>` 形态 | `src/components/modals/ImportSkillsModal.tsx:35-554` | **形态借鉴**——520×580 弹窗、Tab 切换、全选 checkbox、Footer 三段；Marketplace 浏览**不应**用 modal（会与 marketplace 全页浏览体验冲突），但**安装确认**和**冲突解决**可用 Modal 复用此骨架 |
| Modal | `<Modal>`（公共基类） | `src/components/common/Modal.tsx` | 完全沿用，作为所有 marketplace 中转弹窗的基础 |
| Animation | drag tokens / overlay shadow | `src/index.css:599-680` | 完全沿用（marketplace 内不需新增 motion） |
| Data flow | importStore + skillsStore + mcpsStore | `src/stores/*.ts` | **类比新建** marketplaceStore（state + actions），但模式照搬：optimistic update + safeInvoke + error string；不引入新模式 |
| Data flow | `data.json` 元数据持久化（categoryId / tags） | `~/.ensemble/data.json` | 完全沿用——marketplace 安装后写入 `skillMetadata` / `mcpMetadata` 即与现有列表项一视同仁 |

---

## §10 需要新建清单（≤ 5 项）

| 编号 | 新建项 | 理由（"现有的不够用，因为 X"） |
|---|---|---|
| N1 | Sidebar 顶部 Marketplace 分组（Skill Marketplace / MCP Marketplace 两个 nav 项 + 视觉分组与 5 项 Navigation 间的分隔线） | Sidebar.tsx 当前 navItems（行 119-125）是固定 5 项；用户原话"在 Skill 上面再加一个分隔线"+ Q3=(a) 已对齐为顶部独立分组。这部分**需要扩展 navItems 数组与 JSX 结构**，但不改组件本质，是 Sidebar 内的局部新建 |
| N2 | MarketplaceListItem 渲染骨架（沿用 SkillListItem 的容器 / icon / Info / More menu，替换右段为 Source + Install/Installed 状态） | SkillListItem 右段写死渲染 Category Badge + TagsWithTooltip，无法直接传入"Install 按钮"或"Source 标签"。需要新建一个并行组件文件，而不是在 SkillListItem 中加分支（避免污染现有组件）。选择"复制骨架"而非"抽公共抽象"——与现有 SkillListItem ↔ McpListItem 已镜像复制的模式一致 |
| N3 | MarketplacePage（一个或两个：Skill Marketplace / MCP Marketplace） | 两个新路由：`/marketplace/skills`、`/marketplace/mcps`（与现有 `/skills`、`/mcp-servers` 同级）。复用 PageHeader + SlidePanel + 新建 MarketplaceListItem 即可。无需 ListDetailLayout |
| N4 | marketplaceStore（仅一个全新的 Zustand store：浏览列表 / 详情缓存 / 安装状态 / 网络错误）+ Rust 端配套的 `fetch_marketplace_index` / `install_marketplace_item` IPC | 现有 importStore 是"Claude Code → Ensemble"的本地 ETL；Marketplace 是"远程 → Ensemble"的网络拉取 + 安装。状态机不同（has loading / has network error / has cache TTL），不能复用 importStore。**注意**：本研究产物不写 IPC 命令名，此处仅说明"需要一个新的 store + 一组配套 IPC"；具体形态留 PRD / spec 阶段决策 |
| N5 | Marketplace 安装进度反馈（单项进度条 / 多步骤指示：Downloading → Extracting → Writing → Classifying） | ImportSkillsModal 只有"Detecting → Importing → Done"三态文案、没有逐项 / 逐步骤进度。Marketplace 安装是网络密集 + 文件操作，单态 spinner 不够。可在 SlidePanel 详情面板的 Install 按钮区域内嵌进度（不另开 Modal），保持"详情即操作"的极简心智 |

**没有新建的项**：

- 没有新 design tokens（按 design-language.md 强约束）
- 没有新动效曲线（沿用 250 ms cubic-bezier(0.4, 0, 0.2, 1) / drag 系列 token）
- 没有新色板（沿用 zinc + accent + status set）
- 没有新组件原语（Button / Badge / Modal / Tooltip / IconPicker 全可复用）
- 没有新分类系统（沿用 Categories + Tags + Auto-Classify）
- 没有新数据持久化层（沿用 data.json + skillMetadata/mcpMetadata 模式）

---

## §11 调研边界与未覆盖

按派单卡 §3 A "不做"约束，本调研：

- **不写 PRD 内容**——上文所有"复用 / 新建"判断都是事实推断 + 设计语言一致性判断；最终决策由 Synthesis 决策登记锁定
- **不预设 Marketplace 应该长什么样**——只列出"如果用户选择某种形态，可以复用什么"
- **不评论现有架构好坏**——例如 SkillsPage 不用 ListDetailLayout、SkillListItem 与 McpListItem 镜像复制等事实，仅作为事实陈述，不作为优劣判断
- **不下决策**："Marketplace List Item 完全沿用还是变体" 在 §3.3 给了倾向（沿用骨架 + 替换右段），但最终由 Synthesis Gate 锁
- **不写 Rust struct / IPC 命令名 / TS 接口** ——按派单卡硬约束

后续在 Synthesis Gate 和 PRD 阶段需要决策的开放点：

1. Marketplace 是否使用 SlidePanel 模式（与 Skills 一致）还是 ListDetailLayout 模式（双栏共存）—— §1.4 / §2.2
2. Marketplace List Item 右段操作区的精确形态（一个 Install 按钮 / 一组按钮 / Toggle）—— §3.3 / §10 N2
3. Marketplace 安装来源的视觉标识（plugin badge 同位置不同色 / Source 行 only / Both）—— §7.4
4. 安装后是否自动触发 Auto-Classify（已有 `autoClassifyNewItems` flag，但当前未消费）—— §6
5. Marketplace 安装进度反馈的具体形态（行内进度条 / Modal / Toast）—— §10 N5

---

**调研产物结束。** 主 Agent / Synthesis SubAgent 阅读时，§9 表格与 §10 清单是最直接的"复用 vs 新建" decision-support；§3 / §4 / §5 是 PRD 撰写"信息架构 / 闭环 / 数据源"章节的事实弹药；§7 是与现有 plugin 体系协调的关键事实点。
