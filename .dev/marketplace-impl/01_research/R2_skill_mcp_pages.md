# R2 — SkillsPage / McpServersPage 全栈调研

> **角色**：调研产物（事实陈述，不是设计）。
> **服务对象**：marketplace-impl 02_tech_spec / 03_task_cards 的"复用基线"决策。
> **范围**：列表页骨架、ListItem、SlidePanel 详情、ImportModal、Trash UX、Auto-Classify、同名碰撞、加 Scene 入口。
> **方法**：Read 所有相关 .tsx 全文 + grep 验证；引用一律 `path:line`。

---

## 0. TL;DR — 下游必看 5 条事实

1. **SkillsPage / McpServersPage 是 inline 实现**（不调用 `SkillDetailPanel` / `McpDetailPanel`）。`SkillDetailPanel.tsx:1-7` 的注释明确写道 "NOT used by SkillsPage.tsx! SkillsPage has its own inline detail panel"；DetailPanel 组件目前只服务 CategoryPage / TagPage。Marketplace 必须自己 inline 一份（或抽 SkillsPage 主体复用），不能假设 DetailPanel 是公共复用点。
2. **页面骨架是高度对称的双胞胎**（`SkillsPage.tsx:678-815` vs `McpServersPage.tsx:735-869`）：`relative flex h-full flex-col overflow-hidden` 外层 + `PageHeader` + 可选 error banner + 内容区 `flex-1 overflow-y-auto px-7 py-6` 配 `transition-[margin-right] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]` + `${selectedId ? 'mr-[800px]' : ''}` + 末尾 `<SlidePanel width=800>`。Marketplace 直接镜像即可。
3. **ListItem 的 compact 动效是 inline 实现**（`SkillListItem.tsx:117-124` / `McpListItem.tsx:128-136`），不是 CSS class。三个魔数：`TRANSITION_DURATION = '250ms'`、`TRANSITION_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'`、`RIGHT_SECTION_DELAY = '150ms'`。规则：collapse 立即（无 delay），expand 走 150ms delay 等待主区收缩。Marketplace ListItem 必须把这些常量原样镜像，否则节奏断层（R-23）。
4. **Plugin badge 的具体形态是左段右上角 16×16 蓝点 + Puzzle icon**，不是空蓝点（`SkillListItem.tsx:171-178`、`McpListItem.tsx:182-190`，硬编码 `bg-[#3B82F6]`、`Puzzle icon w-2 h-2`）。R-11 / D-9 限制 marketplace 不能在同位置叠加 — D-9 决策正是把 marketplace 来源信息推到 SlidePanel 详情面板"Source"行 + 列表内 Install/Installed 按钮区分。
5. **同名碰撞目前是后端硬错（无 UI Modal）**：`import.rs:620-626`（Skill）/ `import.rs:663-670`（MCP）的 `dest.exists()` 短路返回字符串 `"... already exists in destination"`。前端没有 confirm Modal、没有 Restore 选项、没有 Trash 联动。R-1 + D-10 要求 marketplace 引入新的 small Confirm Modal；本仓库的 `Modal.tsx` 通用组件 `src/components/common/Modal.tsx`（见 `src/components/common/index.ts`）已存在,可直接 mount。

---

## 1. 页面骨架对比

### 1.1 PageHeader actions 槽

| 项 | SkillsPage | McpServersPage |
|---|---|---|
| Title | "Skills" `SkillsPage.tsx:682` | "MCP Servers" `McpServersPage.tsx:739, 665` |
| SearchInput placeholder | "Search skills..." `:685` | "Search servers..." `:741, 667` |
| actions Button #1 | Import — `Button secondary small icon=Download/Loader2` `:688-696` | Import — 同款 `:671-679, 745-753` |
| actions Button #2 | Auto Classify — 132px 宽，三态 `:697-727` | 同款 `:681-712, 754-784` |
| 错误条 | `bg-red-50 border-red-200 mx-7 mt-4` 内嵌 Dismiss button `:732-742` | 同款（结构一致）`:789-799` |

**关键差异**：McpServersPage 在 `filteredMcps.length === 0 && !filter.search` 时 **早返回一个独立的 EmptyState 渲染**（`McpServersPage.tsx:661-733`），把 PageHeader 复制了一份。SkillsPage **不**早返回 — 它把 EmptyState 内联在主区（`SkillsPage.tsx:752-763`）。Marketplace 必须**两种之一选定**，不能混。**用户实测前推荐学 SkillsPage 的内联模式**（更紧凑、PageHeader 只渲染一次、错误态共用同一处 banner）。

### 1.2 List 容器 className

两页一致：`flex flex-col gap-3` 装 ListItem（`SkillsPage.tsx:766` / `McpServersPage.tsx:820`）。Marketplace 直接复用同款 `gap-3`。

### 1.3 SlidePanel 触发逻辑

两页一致 — `useState<string | null>(null)` 持 `selected*Id`，点击 ListItem 调 setter；`SlidePanel isOpen={!!selectedId} width={800}`。详情数据通过 `useMemo` 根据 selectedId 从 store 解（`SkillsPage.tsx:222-225` / `McpServersPage.tsx:193-196`）。

**主区收缩**：内容区 wrapper 加 `transition-[margin-right] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]` + `${selectedId ? 'mr-[800px]' : ''}`。**这条 transition 与 ListItem compact 动效共享同一组 250ms / cubic-bezier(0.4,0,0.2,1) — 节奏对齐是用户感知"丝滑"的关键**。

### 1.4 SearchInput 行为

`SkillsPage.tsx:276-278` / `McpServersPage.tsx:251-253`：`handleSearchChange(value) { setFilter({search: value}) }` — **即时过滤,无 debounce/throttle**。SearchInput 本体（`SearchInput.tsx:21-56`）是 220×32 px 的 input + Search icon，无内置节流。Marketplace 列表用同款"即时过滤已加载列表项"完全合理（PRD §3.2 [3] 明文）。

### 1.5 加载/错误/空态

- **加载态**：两页都没有自己的 loading skeleton — store 里 `loadSkills` / `loadMcps` 在 `useEffect` 里跑（`SkillsPage.tsx:212-216` / `McpServersPage.tsx:184-188`），加载期间列表是空的、看到的是 EmptyState"No skills"。Marketplace 需新增"加载中"态（PRD §5.7 第 1 行"加载中（沿用 SkillsPage 加载态）→ 列表渲染" — 这里 PRD 说的"沿用"实际是"目前没有,要新建一个一致风格的 loading 态"）。
- **错误态**：单一红色 banner（`SkillsPage.tsx:732-742`）— 只显示 `error: string | null`，无 retry 按钮、无 dismiss 持久化。
- **空态**：`<EmptyState icon title description />`（`SkillsPage.tsx:752-763` / `McpServersPage.tsx:716-721, 810-817`），icon 是 `Sparkles h-12 w-12` 或 `Server h-12 w-12`。EmptyState 组件（`EmptyState.tsx:22-55`）有 `action` 槽位但当前未用,可放 Retry 按钮。

### 1.6 Auto Classify 全量按钮位置

两页一致 — actions 槽内第 2 按钮，**132px 固定宽度**（`SkillsPage.tsx:713` / `McpServersPage.tsx:696, 770`），文案在 `Auto Classify` / `Classifying...` / `Done!` 三态切换，禁用条件：`isClassifying || classifySuccess || items.length === 0`。

---

## 2. ListItem 复用基线

### 2.1 容器骨架（Skill / MCP 完全一致）

```tsx
// SkillListItem.tsx:126-145 / McpListItem.tsx:138-157
<div className="flex w-full items-center justify-between rounded-lg border border-[#E5E5E5] px-5 py-4 ...">
```

- 高度由 `px-5 py-4` 控制,内含 icon 容器 `h-10 w-10` → 行高 ~72px
- Background：`selected ? bg-[#FAFAFA] : bg-white hover:bg-[#FAFAFA]`
- `transition: background-color 250ms cubic-bezier(0.4,0,0.2,1)` inline style

### 2.2 左段视觉密度

| 元素 | 规格 | file:line |
|---|---|---|
| icon 容器 | `h-10 w-10 rounded-lg`,bg `selected ? #F4F4F5 : #FAFAFA` | `SkillListItem.tsx:156-160` / `McpListItem.tsx:168-172` |
| icon 本体 | `h-5 w-5`,color `selected ? #18181B : #52525B` | `:165-168` / `:177-180` |
| icon hover ring | `hover:ring-2 hover:ring-[#18181B]/10`（仅 onIconClick 提供时） | `:159` / `:171` |
| name | `text-[13px] truncate`,weight `selected ? font-semibold : font-medium` | `:182-188` / `:194-200` |
| description | `text-xs font-normal text-[#71717A] truncate max-w-[600px]` + `truncateToFirstSentence(desc, 100)` | `:189-191` / `:201-203` |
| left section gap | `gap-3.5 min-w-0 flex-1` | `:147` / `:159` |

### 2.3 右段操作区结构差异

**Skill 列表**右段：
```tsx
// SkillListItem.tsx:196-206 (Right Section: Category + Tags)
<div style={rightSectionStyle}>
  {displayCategoryName && <Badge variant="category" color={categoryColor}>...</Badge>}
  <TagsWithTooltip tags={skill.tags} />
</div>
// + More menu (always visible) at :209-229
```

**MCP 列表**右段：与 Skill **结构完全一致**（`McpListItem.tsx:208-218` Category + Tags；`:221-241` More menu）。**当前没有 stdio/HTTP type badge 显示在 ListItem 右段** — 类型 badge 只在 ImportMcpModal 用 `scopeLabel = "HTTP · {url}" / "User scope" / "Local · {projectPath}"` 文字描述（`ImportMcpModal.tsx:391-397`）。

**More menu**（两侧一致）：32px 圆形 button,`MoreHorizontal w-4 h-4 text-[#71717A]`,展开后 `w-32 mt-1` 下拉,只含 `Delete`（`Trash2 + text-[#DC2626]` red）。Marketplace 列表项的"More menu" 暂不需要 — Install/Installed 按钮 + 无 More 即可（与 ImportSkillsModal 的 plugin tab 已经省略 More 一致）。

### 2.4 compact 模式触发条件

`compact` 由父组件传入：`SkillsPage.tsx:771` 和 `McpServersPage.tsx:825` 都是 `compact={!!selectedId}`。**只要 SlidePanel 打开就 compact**,没有过渡区间。

### 2.5 Plugin badge 渲染位置（R-11 必读）

```tsx
// SkillListItem.tsx:170-178 / McpListItem.tsx:182-190
{isPluginSource && (
  <div
    className="absolute flex items-center justify-center w-4 h-4 bg-[#3B82F6] rounded-lg border-2 border-white"
    style={{ right: '-4px', top: '-4px' }}
  >
    <Puzzle className="w-2 h-2 text-white" />
  </div>
)}
```

**位置已被 plugin 占用**（左段 icon 容器右上角 16×16 蓝点 + Puzzle icon w-2 h-2 + 2px 白边）。Marketplace 来源**不能在同位置再叠** — D-9 决策已选"marketplace 来源信息走详情面板 Source 行"。**蓝色 #3B82F6 是当前代码库唯一硬编码颜色,不在 design-language 色板** — R-21 说明这是先存语言违例（属现状,不要在 marketplace 工作中扩散）。

### 2.6 hover/active/selected 态切换

- **hover bg**：`#FAFAFA`
- **selected bg**：`#FAFAFA`（与 hover 同色）
- **selected name weight**：`font-semibold`（vs `font-medium` 默认）
- **selected icon container bg**：`#F4F4F5`（vs `#FAFAFA` 默认）
- **selected icon color**：`#18181B`（vs `#52525B` 默认）
- 这些差异**全部走 inline style 的 250ms cubic-bezier(0.4,0,0.2,1)** 过渡（`SkillListItem.tsx:142-144, 162, 167`）

### 2.7 键盘事件

**没有键盘事件** — `onClick` 是唯一交互入口。`More` button 用 `e.stopPropagation()` 阻止冒泡到 row click。Marketplace 列表项可遵循同样模式（不引入新键盘逻辑）。

---

## 3. compact 动效实现位置

### 3.1 三个常量

```tsx
// SkillListItem.tsx:19-23 / McpListItem.tsx:19-23
const TRANSITION_DURATION = '250ms';
const TRANSITION_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';
const TRANSITION_BASE = `${TRANSITION_DURATION} ${TRANSITION_EASING}`;
const RIGHT_SECTION_DELAY = '150ms';
```

### 3.2 rightSectionStyle 物件

```tsx
// SkillListItem.tsx:117-124 / McpListItem.tsx:128-136
const rightSectionStyle = {
  opacity: compact ? 0 : 1,
  maxWidth: compact ? 0 : '400px',  // McpListItem 用 '300px'
  overflow: 'hidden' as const,
  transition: compact
    ? `opacity ${TRANSITION_BASE}, max-width ${TRANSITION_BASE}`           // collapse: 立即
    : `opacity ${TRANSITION_BASE} ${RIGHT_SECTION_DELAY}, max-width ${TRANSITION_BASE} ${RIGHT_SECTION_DELAY}`,  // expand: 150ms 延迟
};
```

**Skill maxWidth='400px' / Mcp maxWidth='300px'** — 这是 Skill 右段 Category+Tags 比 MCP 通常更长的折中。Marketplace 右段 Install/Installed 按钮 + popularity 数字宽度较窄,**建议用 200-250px 范围**（待 spec 阶段确定具体值）。

### 3.3 触发时机

`compact = !!selectedId` — 父级状态变更触发 React re-render → inline style 走 transition。**重要：要让 transition 真的跑,父级 wrapper 的 `mr-[800px]` 与 ListItem 的 `rightSectionStyle` 必须用相同 250ms / cubic-bezier — 这是当前设计**（PRD §5.4 R3-P1-6 强调要"用同一缓动"）。

### 3.4 字号字重过渡

selected name 从 `font-medium` 到 `font-semibold`,通过 `style={{ transition: 'font-weight 250ms cubic-bezier(0.4,0,0.2,1)' }}` 平滑（`SkillListItem.tsx:184-186`）。**font-weight 是可动画 CSS 属性当且仅当浏览器支持可变字体** — Safari/macOS 系统字体支持。Marketplace 镜像同样写法即可。

---

## 4. DetailPanel 三块布局

### 4.1 SlidePanel 容器

`SlidePanel.tsx:71-119`：`absolute top-0 right-0 h-full bg-white border-l border-[#E5E5E5]`,通过 `transition-transform translate-x-0/translate-x-full` + 自定义 `transitionDuration: 250ms` + `transitionTimingFunction: cubic-bezier(0.4, 0, 0.2, 1)` 滑入。Header 56px 含 close button（icon X 18×18 in 32×32 button）;主区 `flex-1 overflow-y-auto pt-3 pr-7 pb-7 pl-7`。

### 4.2 SkillsPage 详情主区 7 个 section（top-down）

参考 `SkillsPage.tsx:422-676`：

1. **Detail Header (在 SlidePanel header 槽内)** — `:387-416`：icon 36×36 圆角 + name `text-base font-semibold` + description first-sentence `text-xs text-[#71717A] truncate`。**这一块是 PRD 要的"决策必读"层** — marketplace 需在这里加 Install button。
2. **Info Section (4 列,平铺)** — `:425-442`：Installed / Usage / Last Used / Scenes。每列 InfoItem = label `text-[11px] font-medium text-[#71717A]` + value `text-[13px] font-medium text-[#18181B]`。**Marketplace 可改为 Author / Last Updated / Installs / Source** 4 列。
3. **Category & Tags Section** — `:444-554`：CategoryTreeDropdown (compact, w-40) + Tag chips with input + suggestions popover。
4. **Instructions Section** — `:556-572`：title `text-sm font-semibold` + 480px max-h scroll 区,`whitespace-pre-wrap text-xs leading-relaxed text-[#52525B]`。Marketplace README 渲染对应这一块（PRD §5.4 #3）。
5. **Configuration Section** — `:574-636`：3 行 ConfigItem (Invocation / Allowed Tools / Scope)。每行 `flex items-center gap-3 px-3.5 py-3 border-b border-[#E5E5E5]`,label 24-char wide。**Marketplace MCP 类型的"必填字段"区可仿这个样式**。
6. **Source Section** — `:638-655`：title + Path 行 + "Open in Finder" Button secondary small。**这就是 R2-P2-4 所说的"扩展 Source section,新增上游来源标签 + owner/repo link" 的锚点 — marketplace skill 可以在这一节追加 `<a href="https://github.com/{owner}/{repo}">{owner}/{repo}</a>`**。
7. **Used in Scenes Section** — `:657-674`：chip 列表（无 Add 按钮）。

### 4.3 McpServersPage 详情主区 4 个 section

参考 `McpServersPage.tsx:384-657`：

1. **Detail Header** `:355-373`：icon 36×36 + name + description（**McpServersPage 用 full description,不 truncate first sentence**;`SkillsPage` truncate）。
2. **Info Section** `:387-419`：4 列 — Installed / Tools / Total Calls / Scenes。
3. **Category & Tags** `:421-528`：与 Skill 一致。
4. **Provided Tools Section** `:531-590`：title + Fetch button（HTTP 显示 "HTTP MCP" 文字,stdio 显示 Fetch button 三态）;主区 `overflow-hidden rounded-lg border` 内套 ToolItem 列表（`McpServersPage.tsx:110-130` ToolItem 实现）。
5. **Source Configuration** `:593-630`：Config Path + Install Scope + Open in Finder。
6. **Used in Scenes** `:632-656`：与 Skill 一致。

### 4.4 给 marketplace 详情设计参考

| PRD §5.4 三块 | 复用基线 |
|---|---|
| 决策必读 | SkillsPage Detail Header 模式 + SlidePanel headerRight 槽放 Install Button（参考 `McpDetailPanel.tsx:535-555` 的 Fetch button 嵌入位置） |
| 参考信息 | Info Section 4 列结构（Author / Last Updated / Installs / Source） |
| README 主区 | Instructions Section 的"480px max-h + overflow-y-auto + 圆角 border + bg-white" 容器 |
| 配置项（仅 MCP） | Configuration Section 的 ConfigItem 表格样式;OAuth 提示用 `Button secondary small icon={<Copy />}` 形态 |

**`headerRight` 槽**（`SlidePanel.tsx:99-110`）：`SlidePanel` 已经预留了 close button **左侧**的 right-content 槽,marketplace 详情可以**把 Install button 放在 headerRight**(用户视线立即可达,不需要滚动到主区)。当前 SkillsPage / McpServersPage 都把 `detailHeaderRight = null`。

---

## 5. ImportModal Plugin tab 现状

### 5.1 Modal 骨架（D-3 平行体系契约证据）

ImportSkillsModal (`ImportSkillsModal.tsx:241-553`):
- **520×580 px**,`rounded-[16px] bg-white shadow-[0_25px_50px_rgba(0,0,0,0.1)]`
- **Tab Row** `:268-360`：左 2 tabs (`Local` / `Plugins`) + 右 `count/total` + All checkbox。Active tab `border-b-2 border-[#18181B] font-semibold`;inactive `border-transparent text-[#71717A]`。Tab 内含 icon 14×14 + label + count badge（`bg-[#F4F4F5] text-[11px]`）。
- **Body** `:362-510`：scrollable list,每行 `gap-3 py-2.5 px-3 rounded-[6px] hover:bg-[#FAFAFA]` + Checkbox (16×16, `bg-[#18181B]` when selected) + name + secondary text。
- **Footer** `:407-446`：Info button (左) + Cancel + Import Selected (`bg-[#18181B]`)。

### 5.2 Plugin tab 与 Local tab 的差异

- **Plugin item 多一行 marketplace 标签**（`ImportSkillsModal.tsx:485-498`：name + Store icon + marketplace 名 + 描述）
- **Plugin "已 imported" 灰态**（`ImportMcpModal.tsx:495-525`：`opacity-50 cursor-default`,checkbox 灰色,有 "Imported" 小标）。Marketplace 里"已 Installed"态视觉与此不同 — D-9 要求 marketplace 列表用 button text `Installed` ✓ 而非 modal-style 灰 row。

### 5.3 D-3 契约证据

ImportSkillsModal 的 Plugin tab 当前**只能选,不能搜索** — 没有 SearchInput,没有 filter,没有 sort。Marketplace **不会**走这个 Modal —— PRD 决策是 marketplace 是"页面级"入口（D-1）,不是"按钮触发的 Modal"。两者并行,plugin tab 保留不动。

---

## 6. Trash / Delete / Restore UX 现状

### 6.1 Delete 入口

**列表项 More menu**（`SkillListItem.tsx:209-229` / `McpListItem.tsx:221-241`）— `MoreHorizontal` 32×32 button,点开下拉 32×128 含单项 `Delete`(`Trash2 + text-[#DC2626]` 红)。**没有"Move to Trash"语义 banner — 用户点 Delete 直接调 `deleteSkill(id)` / `deleteMcp(id)`,后端走 trashStore。**

### 6.2 Restore 入口

**仅在 Settings 页**（`SettingsPage.tsx:316`：`<ActionButton onClick={() => setShowTrashModal(true)}>` 触发 `TrashRecoveryModal`）。Marketplace 同名碰撞时若要"Restore from Trash" 选项（D-10 / R-1）,**不需要打开 TrashRecoveryModal,而是在 Confirm Modal 里直接显示三按钮**(`Restore from Trash` / `Replace existing` / `Cancel`)。

### 6.3 TrashRecoveryModal 结构

参考 `TrashRecoveryModal.tsx:1-150`（与 ImportSkillsModal 同款 520×580 三 tab Modal）。**当前是"全量列表 + checkbox 批量恢复",没有"按 name 查询单项"API**。Marketplace 同名 confirm 需要后端新增 `find_trashed_by_name(name: string, type: 'skill'|'mcp') -> Option<TrashedItem>` 类似命令（R3 后端调研覆盖）。

---

## 7. Auto Classify 现状

### 7.1 全量按钮位置

`SkillsPage.tsx:697-727` / `McpServersPage.tsx:681-712`：actions 槽内第 2 按钮,**132px 固定宽度**。`disabled={isClassifying || classifySuccess || items.length === 0}`。

### 7.2 三态视觉

| 态 | icon | text | className overlay |
|---|---|---|---|
| idle | `<Sparkles>` (with optional `classify-fade-in` re-entry) | "Auto Classify" | none |
| classifying | `<span className="ai-spinner">` | `<span className="ai-classifying-text">Classifying...` | `ai-classifying`（彩虹 conic 边框 + pulse glow） |
| success | `<Check className="classify-success-icon">` | `<span className="ai-classifying-text">Done!` | `classify-success-bg`（spring 进入 + bloom + sparkle） |
| fading-out | (上面一态) | (上面一态) | `+ classify-fading-out`（200ms ease-out fade） |

### 7.3 CSS 锚点

`src/index.css:190-468` 整段 "Auto Classify Success Animation - Vivid Rainbow Theme":
- `@keyframes classify-success-icon` `:197-215` — 400ms cubic-bezier(0.34,1.56,0.64,1) spring 进入
- `.classify-success-bg` `:218-237` — 1000ms bloom + sparkle
- `@keyframes classify-success-bloom` `:272-377` — 90 帧颜色 box-shadow（高内存动画）
- `.classify-fading-out` `:262-264` — 200ms fade-out wrapper class
- `.ai-spinner` `:494-504` — 14×14 conic border 0.8s linear spin
- `.ai-classifying` `:525-545` — 4s gradient-rotate + 2s pulse-glow（彩虹 conic 边框）

**给 marketplace 单项触发的参考**（D-8）：marketplace ListItem 安装成功后的 row level 反馈可以**复用 `.ai-spinner`** + 一个小 Check icon 用 `.classify-success-icon`,但**不要叠 1000ms bloom box-shadow**（那是给 132px 按钮的全屏强调动效;在 ListItem 行级别会显得过载）。spec 阶段建议：单项使用 200-400ms 简化版 fade-in checkmark + 0.8s text fade-out,匹配现有 `<RefreshCw>→<Check h-3.5 w-3.5 animate-[scale-in_0.2s_ease-out]>` 模式（`McpServersPage.tsx:548-553` 的 Fetch tools 轻量成功动画）。

---

## 8. 同名碰撞现状（R-1）

### 8.1 后端短路（无 UI）

`import.rs:617-626`(Skill):
```rust
let skill_dest = dest_dir.join(&item.name);
if skill_dest.exists() || skill_dest.symlink_metadata().is_ok() {
    return Err(format!("Skill '{}' already exists in destination", item.name));
}
```

`import.rs:663-670`(MCP):
```rust
let dest_path = dest_dir.join(format!("{}.json", item.name));
if dest_path.exists() {
    return Err(format!("MCP config '{}' already exists in destination", item.name));
}
```

**前端表现**：`importStore` 把 Err 字符串塞进 `error` state → SkillsPage 红色 error banner 显示该字符串,用户**无法选择 Replace 或 Restore**,只能 Dismiss + 重命名/手动删旧版后再 Import。

### 8.2 Marketplace 必须新建的 Modal

PRD §5.6 + D-10 / R-1 要求 marketplace 引入新 Confirm Modal:
- 沿用现有 `Modal.tsx` 通用组件 + small size
- 三按钮分别 Button primary（`Replace existing`）+ Button secondary（`Restore from Trash`/`Cancel`）
- 默认焦点 Cancel（除非 Trash 中存在条目时默认 Restore from Trash）
- Replace 时把旧版本写入 Trash（沿用现有 trashStore 流程）

---

## 9. 加 Scene 入口现状

### 9.1 当前路径

**没有"从 Skill / MCP 详情面板加 Scene"的入口**。`SkillsPage.tsx:657-674` 的 "Used in Scenes" section 只**展示** scene chips（`SceneChip` 是简单 div,**没有 onClick**）。`McpServersPage.tsx:632-656` 的 "Used in Scenes" 是 `<button>` 但**没有任何 onClick handler 实现**（line 638-645）— 只是视觉 button,点了无反应。

**唯一的 add-to-Scene 入口**是 ScenesPage / SceneDetailPage 的"管理 scene 内容"模式（`ScenesPage.tsx:185, 213, 222`：通过编辑 Scene 的 `skillIds` / `mcpIds` 数组）。

### 9.2 Marketplace [5.6] short-cut 引导参考

PRD §5.5.1 提供 "View in Skills →" / "Add to active Scene →" 两条短链。**"Add to active Scene" 在当前 codebase 没有现成 UX 可复用** — 必须新建一个 mini-dropdown / 选择 Scene 的 popover。最简化的做法（spec 阶段决策）：

- "View in Skills →" — `useNavigate('/skills')` + 设置 `selectedSkillId` 到 query param,沿用 `App.tsx` Router 的 path
- "Add to active Scene →" — 引入"active scene" 概念（当前不存在）。**或者直接**降级为"Open Scenes →" 一键导航,用户自己在 Scene 编辑器里加。spec 阶段评估两条路径的接入成本。

---

## 10. 给下游的复用建议

> 下面"复用建议"是事实陈述（"X 在 file:line 已存在,可如此调用"）,不是设计决策。

### 10.1 列表页骨架

**可直接复用** `SkillsPage.tsx:678-815` 的 page-level 骨架。改造点：

1. 导入 `MarketplaceSkillsStore`（新建）替代 `useSkillsStore`
2. PageHeader actions 槽改为 `[Refresh button + Sort dropdown]`(去掉 Auto Classify 全量按钮)
3. List 容器改用新 `MarketplaceListItem`(下面 §10.2)
4. SlidePanel 内容替换为新 `MarketplaceSkillDetailPanel`(下面 §10.3)
5. 错误条复用同款 `:732-742`,文案改为网络/上游错误

**结构示例**：
```tsx
<div className="relative flex h-full flex-col overflow-hidden">
  <PageHeader title="Skill Marketplace" searchValue={...} actions={
    <div className="flex items-center gap-2.5">
      <Button variant="secondary" size="small" icon={<RotateCw />} onClick={refresh}>Refresh</Button>
      <Dropdown options={SORT_OPTIONS} ... />  {/* 沿用 src/components/common/Dropdown.tsx */}
    </div>
  } />
  {error && <Banner ... />}  {/* 同款 mx-7 mt-4 banner */}
  <div className={`flex-1 overflow-y-auto px-7 py-6 transition-[margin-right] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${selectedId ? 'mr-[800px]' : ''}`}>
    {/* CategoryTreeDropdown + Tag pill + Sort 行 */}
    {/* 列表 gap-3 */}
  </div>
  <SlidePanel isOpen={!!selectedId} width={800} ...>...</SlidePanel>
</div>
```

### 10.2 ListItem — 复用 SkillListItem 容器骨架,改右段

**新建** `MarketplaceSkillListItem.tsx`,**结构按 `SkillListItem.tsx:126-231` 镜像**,改三处:

1. **保留** 左段 icon/name/description 三件套,**不显示 plugin badge**(marketplace 资源 `installSource` 是新值 `'marketplace'`,没有蓝点 — 来源信息走详情面板)
2. **改右段** rightSectionStyle 内容(:196-206)从 Category+Tags 换成:
   ```tsx
   <div style={rightSectionStyle}>
     <span className="text-[11px] font-normal text-[#A1A1AA]">{popularity}</span>
     {/* MCP 才有: <Badge variant="status">stdio</Badge> 或 HTTP */}
     {isInstalled
       ? <Badge variant="status" showDot={false}><Check className="h-3 w-3" /> Installed</Badge>
       : <Button variant="primary" size="small" loading={isInstalling}>{isInstalling ? 'Installing...' : 'Install'}</Button>}
   </div>
   ```
3. **去掉** More menu(:209-229)— marketplace 列表项不需要 Delete

**镜像 compact 动效**：`TRANSITION_DURATION` / `TRANSITION_EASING` / `RIGHT_SECTION_DELAY` 三常量从 `SkillListItem.tsx:19-23` 原样搬。**maxWidth 建议改 240px**（按钮+badge+popularity 不需要 400px）。

### 10.3 DetailPanel — inline 实现,模仿 SkillsPage 主区

**不要**复用 `SkillDetailPanel.tsx`（它是 CategoryPage / TagPage 的私有组件,Marketplace 用会引入跨页污染）。**直接 inline** 在 `MarketplaceSkillsPage.tsx` 主体,模仿 `SkillsPage.tsx:422-676` 的 7 section 结构,改为 PRD §5.4 的三块:

```tsx
const detailContent = selectedItem && (
  <div className="flex flex-col gap-7">
    {/* Block 1: Decision-critical Info row (4 InfoItem 列) */}
    <div className="flex gap-8">
      <InfoItem label="Author" value={item.author} />
      <InfoItem label="Last Updated" value={formatRelativeTime(item.updatedAt)} />
      <InfoItem label="Installs" value={...} />
      <InfoItem label="Source" value={...} />
    </div>

    {/* Block 2: Reference info (上游 category/tag 仅展示;Source row 含 owner/repo link) */}
    <div className="flex flex-col gap-4">
      <span className="text-[11px] font-medium text-[#71717A]">Categories (upstream)</span>
      <div className="flex gap-2">
        {upstreamCategories.map(c => <Badge variant="category">{c}</Badge>)}
      </div>
      {/* Source row — 沿用 SkillsPage:638-655 的 Source section */}
      <div className="flex flex-col gap-3 rounded-lg border border-[#E5E5E5] p-4">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-medium text-[#71717A]">Repository</span>
          <a href={`https://github.com/${owner}/${repo}`} className="font-mono text-xs text-[#18181B] hover:underline">
            {owner}/{repo}
          </a>
        </div>
      </div>
    </div>

    {/* Block 3: README 主区 — 沿用 Instructions section 的容器形态(SkillsPage:556-572) */}
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-[#18181B]">README</h3>
      <div className="overflow-y-auto rounded-lg border border-[#E5E5E5] bg-white p-4" style={{ maxHeight: '480px' }}>
        <ReactMarkdown ...>{item.readmeMarkdown}</ReactMarkdown>
      </div>
    </div>

    {/* Block 4 (仅 MCP): Configuration — 沿用 SkillsPage:574-636 ConfigItem 表格 */}
    {isMcp && (
      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-[#18181B]">
          {mcpType === 'stdio' ? "Required environment variables" : "Connection"}
        </h3>
        <div className="overflow-hidden rounded-lg border border-[#E5E5E5]">
          {mcpType === 'stdio' ? (
            envVars.map(v => (
              <ConfigItem key={v.name} label={v.name} value={
                <input ... className="rounded-md border ..." />
              } />
            ))
          ) : (
            <>
              <ConfigItem label="URL" value={<code>{url}</code>} />
              {isOAuth && <ConfigItem label="OAuth" value={
                <div className="flex items-center gap-2">
                  <span className="text-xs">After installing, run /mcp in Claude Code</span>
                  <Button variant="secondary" size="small" icon={<Copy />}>Copy</Button>
                </div>
              } />}
            </>
          )}
        </div>
      </div>
    )}
  </div>
);
```

**Install button 位置**：建议放在 SlidePanel 的 `headerRight` 槽（`SkillsPage.tsx:419` 是 `null`,可换为 `<Button variant="primary" size="small">Install</Button>`）— 用户视线立刻可达,不需滚动。

### 10.4 IconPicker 锚点定位

`IconPicker.tsx:465-624`,API:
```tsx
<IconPicker
  value={iconName}
  onChange={(name) => updateIcon(name)}
  triggerRef={iconRef}
  isOpen={isOpen}
  onClose={onClose}
/>
```

`triggerRef.current.getBoundingClientRect()` 用于定位（`:485`）。**Marketplace 详情面板可直接复用** — 把 IconPicker mount 到详情主区根 div,锚点 ref 指向 detailIconRef。**已安装的 marketplace 资源用户改图标后** 持久化由 `useMarketplaceStore.updateInstalledIcon` 处理,与现有 SkillsPage `updateSkillIcon` 同模式。

### 10.5 EmptyState 用法

`EmptyState.tsx:22-55`：
```tsx
<EmptyState
  icon={<WifiOff className="h-12 w-12" />}
  title="Marketplace temporarily unavailable"
  description="This may be a network issue or upstream service outage."
  action={<Button variant="secondary" size="small">Retry</Button>}
/>
```

**`action` 槽位现存但 SkillsPage / McpServersPage 都没用** — Marketplace 是首位用户。`WifiOff` 已在 lucide-react 中可用。

### 10.6 同名碰撞 Confirm Modal

**通用 Modal 组件** `src/components/common/Modal.tsx` 存在(在 common/index.ts 中导出 — 见 §5.1 的"沿用现有 Modal 组件 + small size")。Marketplace 应**新建** `MarketplaceCollisionModal.tsx`，sources 模式参考:

- 结构：520×中等高度（不需要 580 的 list scroll）
- 三按钮：根据 `trashItem` 是否存在切两态
  - 无 Trash 条目：`[Replace existing] [Cancel]` — Replace 走 Button primary
  - 有 Trash 条目：`[Restore from Trash] [Replace existing] [Cancel]` — 默认 focus Restore（最低惊讶）
- 选 Replace 时走 trashStore,把旧版本 move to trash 后再覆盖
- 沿用现有的 Modal 关闭机制（Esc + 点击 overlay）和 z-index 50

### 10.7 关键复用清单（一行总结）

| 来源 | 复用为 | 复用方式 |
|---|---|---|
| `SkillsPage.tsx:678-815` 主体 | MarketplacePage 骨架 | 复制结构,替换 store/数据源,改 actions |
| `SkillListItem.tsx:117-124` rightSectionStyle | MarketplaceListItem compact 动效 | 原样镜像 3 个常量 |
| `SkillListItem.tsx:126-145` 容器 + `:147-193` 左段 | MarketplaceListItem 容器+左段 | 原样镜像（不要 plugin badge） |
| `SlidePanel.tsx:71-119` | 详情面板容器 | 直接 import 用 |
| `SkillsPage.tsx:574-636` ConfigItem 表格 | MCP 配置区 | 原样调用,改 label/value 内容 |
| `EmptyState.tsx:22-55` | EmptyState（含 action 槽） | 直接 import 用 |
| `Button.tsx:64-128` primary/secondary/small | Install / Refresh / Cancel | 直接 import 用 |
| `Badge.tsx:25-68` status variant | "Installed ✓" / "stdio" / "HTTP" badge | 直接 import 用 |
| `Modal.tsx`(通用) | MarketplaceCollisionModal 容器 | 沿用 + small size |
| `index.css:494-504` `.ai-spinner` | 单项 Installing... spinner | 加 `<span className="ai-spinner" />` |
| `IconPicker.tsx:465-624` | 详情面板 icon 改图标 | 原样调用 API |
| `CategoryTreeDropdown` (compact, w-40) | marketplace 内 Categories 筛选 | 原样调用 |

---

**调研结束。** 行数 ~480。下游 spec 阶段可凭此文档直接列复用清单 + 改造点,不再需要二次调研代码现状。
