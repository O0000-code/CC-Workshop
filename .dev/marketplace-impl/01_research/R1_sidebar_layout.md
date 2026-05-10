# R1 — Sidebar / Layout / Routing 调研

> **角色**:R1 调研 SubAgent。事实陈述,不写改造方案。
> **配套**:R2 / R3 / R4 (其他维度)。
> **下游消费**:`02_tech_spec.md` 撰写者、UI 实施 SubAgent。
> **代码 baseline**:`main` 分支 + 上一轮 sidebar-hierarchy-fix 的 in-progress 改动 (与 marketplace 实施无功能冲突)。

---

## 0. TL;DR — 下游必看 5 条事实

1. **Sidebar 现有分组结构 = "Header + 5-item Navigation + Categories + Tags + Settings"**(`Sidebar.tsx:243-414`)。Marketplace 分组要插入 **Header (`<header>`) 与 Navigation `<nav>` 之间**(`Sidebar.tsx:273` 与 `:278` 之间),沿用 NAVIGATION→CATEGORIES 现有过渡的 hairline + 段标题 + count 形态。但**现状 NAV→CATEGORIES 的 divider 在 `:314` 处用 `bg-[#E4E4E7]`(divider token),而 Header→NAV 之间没有显式 divider**——Header 自带 `border-b border-[#E5E5E5]`(`:247`,border token)。新 Marketplace 段要靠**Header 的 border-b 作为顶部分隔线**+ Marketplace 段尾部新增 `bg-[#E4E4E7]` 的 hairline 作为底部分隔(与 NAV→CATEGORIES 镜像)。
2. **Routing = 平面化 React Router 6**(`App.tsx:14-29`),所有路由直接在 `<MainLayout />` 下 lazy 加载——**没有 lazy load,全部 import 直链**。新增 `marketplace/skills` 与 `marketplace/mcps` 两路由按现有模式直接挂在 `App.tsx`。`MainLayout.getActiveNav()`(`MainLayout.tsx:354-372`) 是 path → activeNav 的源头,`SidebarProps.activeNav` 类型联合(`Sidebar.tsx:43`)需要扩展,二者必须同步改。
3. **PageHeader / SlidePanel / ListDetailLayout 三件套全可复用**——PageHeader 56px 高、内置 SearchInput、`actions` 槽接受任意 ReactNode(`PageHeader.tsx:73-121`);SlidePanel 默认 width=800、`transition-transform` + `cubic-bezier(0.4, 0, 0.2, 1)` + 250ms 与 design-language Rule "list↔detail compact / SlidePanel" 通用 inline easing **完全一致**(`SlidePanel.tsx:71-86`);ListDetailLayout 存在但 **D-13 决策不用,SkillsPage 也不用**(SkillsPage 用 PageHeader+SlidePanel)。
4. **通用组件清单已覆盖 marketplace 所有 V1 需求**:Badge(status / count / category / tag 4 个 variant)、Button(primary / secondary / danger / ghost × small / medium / large + loading prop)、Modal(可定义 maxWidth)、SearchInput(220px 固定宽)、CategoryTreeDropdown(已支持 indent)、Tooltip、EmptyState、IconPicker、Dropdown(支持 multiple + searchable)、Toggle、Input、Textarea。**Toast 不存在**——D-14 决策"不开 Toast 通知"与现状一致。
5. **设计 token 全部锚定到 `src/index.css` 三处**:零散颜色/字体在 `:30-55` (radii 与 shadow-dropdown / -card)、accent 在 `:600-601`、动效 token 在 `:602-613`(--ease-drag* / --duration-drag-*)、`--indent-step: 16px` 在 `:740`。**Marketplace 不需要新增任何 token**,所有现状可覆盖。Plugin badge 蓝色 `#3B82F6` 是 R-21 登记的"色板外硬编码"(SkillListItem 内,不在本 R1 调研范围,R2 会确认)。

---

## 1. Sidebar 现状

### 1.1 结构骨架(`Sidebar.tsx:243-414`)

```
<aside w=260 bg-white border-r [#E5E5E5] flex flex-col>            // :244
  <header h=14 pl=5 pr=3 border-b [#E5E5E5] onMouseDown=startDrag>  // :246-249
    <div w=52 aria-hidden />                                         // :251 traffic-light 占位
    <button refresh size=24 hover [#F4F4F5] />                       // :257-272
  </header>

  <div flex-1 flex-col p=4 pb=2 overflow-hidden>                    // :276
    <nav flex-col gap=0.5 flex-shrink-0>                             // :278 NAV 段(无段标题)
      {navItems.map((item) => <button h=9 px=2.5 ... />)}            // :279-310 5 个 nav item
    </nav>

    <div h=px bg-[#E4E4E7] my=4 />                                   // :314 NAV→CATEGORIES divider

    <div flex justify-between mb=3>                                  // :317 CATEGORIES 段标题行
      <h3 text=10 font-semibold text-[#A1A1AA] uppercase
          tracking-[0.8px]>Categories</h3>                            // :318-320
      <button onClick={onAddCategory} w=5 h=5>+</button>             // :321-329
    </div>

    <div flex-1 overflow-y-auto sidebar-scroll>                      // :333 滚动区
      <SortableCategoriesList ... />                                 // :338-357
      <section pt=4 border-t [#E4E4E7] mt=4>                         // :360 TAGS 段
        <div flex justify-between>                                   // :362
          <h3 ...uppercase tracking-[0.8px]>Tags</h3>                // :363-365
          <button onClick={onAddTag} ... />
        </div>
        <SortableTagsList ... />                                     // :379-395
      </section>
    </div>

    <footer pt=2 -ml=1.5>                                            // :400 Settings 齿轮
      <button w=8 h=8 ...><Settings size=18 /></button>              // :401-411
    </footer>
  </div>
</aside>
```

### 1.2 分组语言精准 spec(用于 Marketplace 段镜像)

| 元素 | className 来源 | token |
|---|---|---|
| 段标题 | `Sidebar.tsx:318-320` 与 `:363-365` 完全镜像 | `text-[10px] font-semibold text-[#A1A1AA] uppercase tracking-[0.8px]` |
| 段标题行 | `Sidebar.tsx:317` (`flex items-center justify-between flex-shrink-0 mb-3`) | mb-3 = 12px,与 row gap-0.5 的 nav 段对齐 |
| Hairline divider(NAV↔CATEGORIES) | `Sidebar.tsx:314` | `<div className="h-px bg-[#E4E4E7] my-4 flex-shrink-0" />`,**用 divider token #E4E4E7,不是 border #E5E5E5** |
| Hairline divider(CATEGORIES↔TAGS) | `Sidebar.tsx:360` | `border-t border-[#E4E4E7]` 在 `<section>`,搭配 `pt-4 mt-4`(8 + 8 = 16px gap) |
| Header 下 border | `Sidebar.tsx:247` | `border-b border-[#E5E5E5]`(用 border token,不是 divider token——历史差异,R-16 确认要保持) |
| Nav item button | `Sidebar.tsx:285-308` | `h-9 px-2.5 flex items-center gap-2.5 rounded-[6px]`;active = `bg-white border-[#E5E5E5]`,inactive = `border-transparent hover:bg-[#F4F4F5]` |
| Nav item icon | `Sidebar.tsx:298` | `size={16}` lucide;active `text-[#18181B]`,inactive `text-[#71717A]` |
| Nav item label | `Sidebar.tsx:299-306` | `text-[13px] flex-1 text-left`;active `font-medium text-[#18181B]`,inactive `font-normal text-[#71717A]` |
| Nav item count badge | `Sidebar.tsx:307` | `text-[11px] font-medium text-[#A1A1AA]`(无背景,纯数字) |
| nav `<nav>` 容器 | `Sidebar.tsx:278` | `flex flex-col gap-0.5 flex-shrink-0`(gap-0.5 = 2px,极致紧凑) |

**关键 anchor**:NAV 段 **没有段标题**(只有 5 个 nav item 直接堆叠);CATEGORIES / TAGS 才有段标题。Marketplace 因为是"独立分组",PRD §5.1 ASCII 图示要求 `─ MARKETPLACE ─` 段标题,所以**镜像 CATEGORIES 段的"段标题 + 内容"模式**,不镜像 NAV 段的"无段标题"模式。

### 1.3 Marketplace 插入点(精确到行)

PRD §5.1 决定 Marketplace 是 Header 与 NAVIGATION 之间的"上一段"。代码插入位置:

```
Sidebar.tsx:275  <div className="flex-1 flex flex-col p-4 pb-2 overflow-hidden">
                 │
Sidebar.tsx:278     <nav className="flex flex-col gap-0.5 flex-shrink-0">  ← NAVIGATION 段
                 │  ↑
                 │  ↑ ⬅️ 在 :276 与 :278 之间插入 Marketplace 段
                 │  ↑    顺序:[段标题行] + [2 个 nav item button] + [hairline divider]
                 │  ↑    然后 NAVIGATION 段紧跟其后
                 │
Sidebar.tsx:311     </nav>
Sidebar.tsx:314     <div className="h-px bg-[#E4E4E7] my-4 flex-shrink-0" />  ← 现有 NAV→CATEGORIES divider
```

**注意 PRD §5.1 ASCII 图与现状代码的 hairline 数量**:PRD 图示在 Header↔Marketplace 之间画了一条 hairline(注释"新增 hairline divider"),Marketplace↔NAVIGATION 之间画了"现有 hairline divider(保留)"。但**现状代码的 Header↔NAV 之间没有独立的 hairline**——Header 自带 `border-b border-[#E5E5E5]` 已起到分隔作用。为保持 hairline 一致语言(R-16),**Marketplace 段应该把现有 Header `border-b` 当顶部分隔(无需新增),自己尾部新增 `<div className="h-px bg-[#E4E4E7] my-4 flex-shrink-0" />` 作为 Marketplace→NAV 分隔**。这样:Header(border-b #E5E5E5)→ Marketplace 内容 → 新增 hairline #E4E4E7 → NAVIGATION → 现有 hairline #E4E4E7(`:314`) → CATEGORIES。

**现有 Header `border-b` 用 #E5E5E5(border token)而其他 sidebar hairline 用 #E4E4E7(divider token) 是历史现状**——是否统一不在本 R1 范围,但 spec 阶段需要决定 Marketplace 段的两端分隔线分别用哪个,默认建议 Marketplace 段尾部 hairline 用 `#E4E4E7` 与 NAV→CATEGORIES `:314` 镜像。

### 1.4 SidebarProps 类型扩展点(`Sidebar.tsx:42-116`)

`activeNav` 当前是 `'skills' | 'mcp-servers' | 'claude-md' | 'scenes' | 'projects' | 'settings' | null`(`Sidebar.tsx:43`)。Marketplace 实施需扩展为联合追加 `'marketplace-skills' | 'marketplace-mcps'`(或类似命名)。`navItems` 数组 `Sidebar.tsx:119-125` 是 NAVIGATION 段的硬编码列表;marketplace 的 2 个 nav item 应该用**单独数组**(如 `marketplaceItems`),不混入 navItems(D-1 决策 sidebar 顶部独立分组)。`counts` prop `:48-54` 需扩展添加 marketplace 相关计数(如已安装数 / 上游列表大小,具体由 PRD §3-§5 决定,本 R1 不预设)。

### 1.5 Sidebar Header 现状(`Sidebar.tsx:246-273`)

Header 高度 56px(`h-14`),包含:左侧 52px traffic-light 占位、右侧 24×24 Refresh 按钮。Refresh 按钮 onClick 触发 `onRefresh` prop(MainLayout 实施为重新拉取所有 stores 数据)。**Marketplace 不影响 Header,Header 现状即可作 Marketplace 顶部分隔**——但若 Marketplace 自己的 PageHeader 也要 Refresh actions(PRD §3.3 提到 Refresh 按钮),那是 PageHeader 内的 actions 槽,与 Sidebar Header 的 Refresh 是两套独立按钮。

---

## 2. Routing 配置

### 2.1 现有 (`App.tsx:1-32`)

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import SkillsPage from './pages/SkillsPage';
// ...另外 7 个直接 import(无 lazy)

<BrowserRouter>
  <Routes>
    <Route path="/" element={<MainLayout />}>
      <Route index element={<Navigate to="/skills" replace />} />
      <Route path="skills" element={<SkillsPage />} />
      <Route path="mcp-servers" element={<McpServersPage />} />
      <Route path="claude-md" element={<ClaudeMdPage />} />
      <Route path="scenes" element={<ScenesPage />} />
      <Route path="projects" element={<ProjectsPage />} />
      <Route path="category/:categoryId" element={<CategoryPage />} />
      <Route path="tag/:tagId" element={<TagPage />} />
      <Route path="settings" element={<SettingsPage />} />
    </Route>
  </Routes>
</BrowserRouter>
```

### 2.2 关键事实

- **没有 lazy load**——所有页面 component 直接 `import` 在文件顶部,App 启动时全部 bundled。Marketplace 页面遵循同模式即可,不引入 lazy(与设计一致性优先)。
- **路由命名风格 = kebab-case**(`mcp-servers` / `claude-md`)。Marketplace 路由建议 `marketplace-skills` / `marketplace-mcps`(与现有命名风格一致)或更结构化的 `marketplace/skills` / `marketplace/mcps`(更可扩展但当前无嵌套路由先例)。spec 阶段决定。
- **`<Outlet />`** 在 MainLayout `:691` 实例化,Marketplace 页面只需注册 `<Route>` 即可作为子路由 render 到 outlet。
- **path → activeNav** 在 `MainLayout.getActiveNav()` `:354-372`:`location.pathname` 前缀匹配 → return 对应字面量字符串(或 null)。新增 marketplace 路由必须**同时**在此函数追加 `if (path.startsWith('/marketplace-skills')) return 'marketplace-skills'`(或对应字面量)。
- **`handleNavChange`** 在 `MainLayout` `:374-376` 调用 `navigate(\`/${nav}\`)`,Sidebar `Sidebar.tsx:196-203` 也直接 `navigate(\`/${navId}\`)`——nav id 必须与路由 path 一致(去掉前导斜杠后)。Marketplace 段的两个 nav item id 应直接是路由名(如 `marketplace-skills`)。

### 2.3 不存在的路由 / 无关路由

`/category/:categoryId` 与 `/tag/:tagId` 是动态参数路由(`MainLayout.tsx:346-350` 用正则解析)。Marketplace 不需要动态参数(详情面板用 SlidePanel 内嵌 state,不走路由),所以 marketplace 路由保持静态。**不要为 Marketplace 详情面板新建路由**(D-13 决策"完全沿用 SkillsPage / SlidePanel 模式")。

---

## 3. PageHeader / SlidePanel / ListDetailLayout

### 3.1 PageHeader(`PageHeader.tsx:33-121`)

**props**:
- `title: string`(必填)
- `badge?: ReactNode`
- `searchValue?: string` + `onSearchChange?: (value: string) => void`(必须成对出现才会渲染 SearchInput)
- `searchPlaceholder?: string`(默认 `"Search..."`)
- `actions?: ReactNode`(右侧任意 ReactNode 槽)
- `className?: string`

**布局事实**:
- 高度 `h-14`(56px),与 Sidebar Header / SlidePanel Header 完全一致(三高同款,设计语言极简一致性)。
- `border-b border-[#E5E5E5]`(用 border token,不是 divider token——与 Sidebar Header 镜像,但与 sidebar 内段间分隔不同)。
- `px-7`(28px 左右 padding),`bg-white`,`flex items-center justify-between`。
- `onMouseDown={startDrag}` 整 header 是 macOS window-drag 区域(与 Sidebar Header 同模式)。
- 左侧 `gap-3`(12px) 容纳 title + badge,title 是 `text-base font-semibold text-[#18181B]`(`text-base` = 16px,与 design-language Rule "page title / detail title" 16/600 完全一致)。
- 右侧 `gap-3`(12px) 容纳 SearchInput + actions。**SearchInput 与 actions 之间天然有 12px 间隔——actions 槽内自己用 `gap-2.5` 即可**(与 SkillsPage `:687` 现实做法一致)。

**SkillsPage 实战用法**(`SkillsPage.tsx:681-729`):

```tsx
<PageHeader
  title="Skills"
  searchValue={filter.search}
  onSearchChange={handleSearchChange}
  searchPlaceholder="Search skills..."
  actions={
    <div className="flex items-center gap-2.5">
      <Button variant="secondary" size="small" icon={<Download />}>Import</Button>
      <Button variant="secondary" size="small" icon={<Sparkles />}>Auto Classify</Button>
    </div>
  }
/>
```

Marketplace Refresh 按钮(PRD §3.3 + §5.7)直接镜像此模式:`<Button variant="secondary" size="small" icon={<RotateCw />}>Refresh</Button>`(注意 lucide 名 `RotateCw`,不是 `Repeat`——`Repeat` 是 Sidebar Header refresh `Sidebar.tsx:266` 的 icon,语义更接近"循环",与 PageHeader 的"刷新数据"语义不完全等价。Spec 阶段决定。设计语言 Rule 没强制 icon 选择,只强制 functional lucide-react)。

### 3.2 SlidePanel(`SlidePanel.tsx:60-119`)

**props**:
- `isOpen: boolean`
- `width?: number`(默认 800)
- `header?: ReactNode`(左侧)
- `headerRight?: ReactNode`(右侧 close 按钮之前)
- `children: ReactNode`(主内容)
- `onClose: () => void`
- `duration?: number`(默认 250 ms)
- `showCloseButton?: boolean`(默认 true)
- `className?: string`

**动效现状**(`SlidePanel.tsx:71-86`):

```tsx
<div
  className={`
    absolute top-0 right-0 h-full bg-white border-l border-[#E5E5E5]
    flex flex-col transition-transform
    ${isOpen ? 'translate-x-0' : 'translate-x-full'}
  `}
  style={{
    width: `${width}px`,
    transitionDuration: `${duration}ms`,
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
  }}
>
```

**与 design-language Rule "list↔detail compact / SlidePanel"通用 inline easing 一致性验证**:
- design-language Rule §Constraints "Allowed inline easing":`cubic-bezier(0.4, 0, 0.2, 1)` (Material standard, list↔detail compact / SlidePanel)。
- SlidePanel.tsx 实际 `:84` 使用:`cubic-bezier(0.4, 0, 0.2, 1)`。
- **完全一致**——Marketplace 复用 SlidePanel 即自动符合 Rule。
- 250 ms duration 是默认值,Rule 没有强制 SlidePanel 时长 token,250 ms 与 SkillsPage 主区右收 `mr-[800px]` 同 250ms(`SkillsPage.tsx:748`)是镜像配套。

**关键事实**:
- SlidePanel 是 `absolute top-0 right-0 h-full`——它需要一个 `position: relative` 的父容器,SkillsPage 在最外层 `<div className="relative flex h-full flex-col overflow-hidden">`(`SkillsPage.tsx:679`)。Marketplace 页面顶层 wrapper 必须镜像。
- Header 56px、`px-7`、`gap-4`、`border-b border-[#E5E5E5]`,与 PageHeader 完全同高同 padding。
- Close 按钮 `h-8 w-8 rounded-md border border-[#E5E5E5] hover:bg-[#F4F4F5]`(`:104-108`),lucide `X size=18`。
- `pointer-events-none` + `[&_button]:pointer-events-auto` 是 macOS window drag 兼容(`:94 :99`),left/right 双区都套此 trick。

### 3.3 ListDetailLayout(`ListDetailLayout.tsx:50-120`)

**props**:`listWidth?` (默认 380)、`listHeader`、`listContent`、`detailHeader?`、`detailContent?`、`emptyDetail?`。

**用法实事求是**:
- 现状项目 ListDetailLayout 真实使用者 = SceneDetailPage / McpDetailPage / SkillDetailPage / ProjectsPage(根据组件描述 comment)。
- **SkillsPage / McpServersPage 不用 ListDetailLayout**——它们用 PageHeader(全宽列表)+ SlidePanel(right slide-in 详情)模式。
- D-13 决策 marketplace 页面 = "完全沿用 SkillsPage / McpServersPage 的全宽 List + SlidePanel 模式"。**ListDetailLayout 存在但 marketplace 不用**——这是有意的(保持心智一致)。

### 3.4 PageHeader / SlidePanel / Sidebar Header / Modal Header 统一高度

| 容器 | 高度 | padding-x | border |
|---|---|---|---|
| Sidebar Header (`Sidebar.tsx:247`) | h-14 (56px) | pl-5 pr-3 | border-b #E5E5E5 |
| PageHeader (`PageHeader.tsx:90`) | h-14 (56px) | px-7 (28px) | border-b #E5E5E5 |
| SlidePanel Header (`SlidePanel.tsx:91`) | h-14 (56px) | px-7 (28px) | border-b #E5E5E5 |
| ListDetailLayout List Header (`ListDetailLayout.tsx:71`) | h-14 (56px) | px-5 (20px) | border-b #E5E5E5 |
| ListDetailLayout Detail Header (`ListDetailLayout.tsx:93`) | h-14 (56px) | px-7 (28px) | border-b #E5E5E5 |
| Modal Header (`Modal.tsx:77`) | h-16 (64px) | px-7 (28px) | border-b #E5E5E5 |

**所有 56px 高的 header 内 border 都用 `#E5E5E5`(border token,不是 divider token)**——这是 Ensemble 的横向"page chrome"语言。Sidebar 内的段间分隔才用 #E4E4E7 divider token。Marketplace 实施保持此区分。

---

## 4. 通用组件清单 + 锚点

| 组件 | 文件 | 关键 props / variants | 用法锚点 |
|---|---|---|---|
| **Badge** | `common/Badge.tsx:1-70` | variant: `'status' \| 'count' \| 'category' \| 'tag'`;color、showDot、children | status = `bg-[#DCFCE7] text-[#16A34A] px-2 py-1 rounded text-[11px]`;count = `bg-[#F4F4F5] text-[#71717A] px-2 py-0.5 rounded-[10px] text-[11px]`;category = `bg-[#F4F4F5] text-[#52525B] py-[3px] rounded-[3px] gap-1.5`;tag = `bg-[#FAFAFA] text-[#71717A] border-[#E5E5E5] py-[3px] rounded-[3px]`。**MCP 类型 stdio/HTTP badge → 用 status variant + 中性 zinc 色 override**(D-12 决策),或新增 status 变体的 zinc 灰版本(spec 阶段决定;design-language Rule §Constraints 没禁止 status 复用,只禁止新色值)。 |
| **Button** | `common/Button.tsx:1-132` | variant: `'primary' \| 'secondary' \| 'danger' \| 'ghost'`;size: `'small' \| 'medium' \| 'large'`;icon、iconOnly、loading | small h-32 px-3 rounded-6 icon-14 gap-1.5;medium h-40;large h-44。primary `bg-[#18181B] text-white hover:bg-[#27272A]`;secondary `bg-transparent text-[#71717A] border-[#E5E5E5] hover:bg-[#FAFAFA]`。**loading=true 时自动渲染 `<Loader2 className="animate-spin" />`** 替代 icon(D-14 "Installing..." 灰态直接靠 `loading={true}` + `disabled={true}`)。文字字号 12px(行 `:107` `text-[12px]`)——这是 Button 内文字通用字号,与 design-language Rule "button label 14px" 不一致(实际为 12px;如发现需要更大字号,sec 阶段需协调)。 |
| **Modal** | `common/Modal.tsx:1-103` | isOpen、onClose、title、subtitle?、children、maxWidth(默认 640px)、showHeader、closeOnOverlayClick | Header 64px(`h-16`,与其他 header 不同);portal 到 body;`shadow-[0_25px_50px_rgba(0,0,0,0.1)]`(modal 专属 shadow,Rule 已注册);`modal-overlay-animate` 200ms fade + `modal-dialog-animate` 200ms zoom-in(`index.css:88-94`)。同名碰撞 Confirm Modal 用此组件(D-10 / R-1 / R2-P0-4)。 |
| **Input / Textarea** | `common/Input.tsx:1-105` | label?、error?、所有原生 input/textarea HTML attrs;forwardRef | h-10 rounded-md border-[#E5E5E5] px-3 text-[13px];focus-border #18181B;error border #DC2626。stdio MCP env vars 输入(PRD §5.4)用 Input。 |
| **SearchInput** | `common/SearchInput.tsx:1-57` | value、onChange、placeholder、className | h-8 w-220 固定;`Search` icon 14×14 `text-[#A1A1AA]`;input `text-[13px]` placeholder `text-[12px]`;focus-within border #18181B。**PageHeader 内置使用,Marketplace 直接复用 PageHeader.searchValue / onSearchChange 即可**。 |
| **Dropdown** | `common/Dropdown.tsx:1-377` | options、value、onChange、placeholder、multiple、searchable、compact、disabled、triggerClassName | compact=true h-8;portal 到 body;options 支持 `indent`(每级 16px,与 sidebar `--indent-step` 一致)。**Sort dropdown(PRD §5.8 排序)直接用 Dropdown(单选,不需 multiple)**。 |
| **CategoryTreeDropdown** | `common/CategoryTreeDropdown.tsx:1-132` | categories、value(单 string)、onChange、placeholder、compact、disabled、includeUncategorized、prefixOptions | 已实现层级 indent;`flattenTree(categories, allRootIds)` 生成扁平 options;`indent: cat.depth`。**marketplace 列表 Category 筛选(PRD §5.8 D-15)直接复用**——marketplace 页面 import + 传 `categories=appStore.categories` 即可。 |
| **Tooltip** | `common/Tooltip.tsx:1-163` | content、children(单 ReactElement)、position(`'top' \| 'bottom'`)、maxWidth | bg-#18181B text-#FFF 11px rounded-6 padding-8/12;portal,fixed positioning;150ms ease-out fade。**列表项 Install 按钮 hover 显示 README 第一行(PRD §5.5 "二次确认")用 Tooltip + maxWidth=320(防过宽)**。 |
| **EmptyState** | `common/EmptyState.tsx:1-58` | icon、title、description?、action? | flex-col centered p-12;icon `w-8 h-8 text-[#D4D4D8]`;title `text-sm font-medium text-[#71717A]`;description `text-[13px] text-[#D4D4D8] max-w-[280px]`;action `mt-4`。**marketplace 离线 EmptyState(PRD §5.7) + No results 形态**(D-10 / R-30) 直接 import:`<EmptyState icon={<WifiOff />} title="Marketplace temporarily unavailable" action={<Button>Retry</Button>} />`。 |
| **FilteredEmptyState** | `common/FilteredEmptyState.tsx:1-49` | type: `'category' \| 'tag'` | 与 EmptyState 不同,用于 sidebar Category/Tag filter 空状态;预制 icon + 文案。**marketplace No results 形态不复用此组件**(语义不匹配),用 EmptyState 自定义。 |
| **Toggle** | `common/Toggle.tsx:1-89` | checked、onChange、size、disabled | small h-20 / medium h-22 / large h-24。Settings page 的 `autoClassifyNewItems`(D-8 / R-22)Toggle 已存在,但因为 D-8 决策默认 true 自动分类,marketplace 实施可能不暴露 Toggle 给用户;具体由 PRD §6 / settings 决定。 |
| **IconPicker** | `common/IconPicker.tsx:1-702` | value、onChange、triggerRef、isOpen、onClose、disabled | 提供 `ICON_MAP` (140+ lucide 图标) 与 `ICON_NAMES`;portal popover;搜索 + 网格选择。**marketplace 详情面板顶部图标(PRD §5.4 "决策必读"段)沿用 SkillsPage 模式**(`SkillsPage.tsx:794-802`):state 中保存 `iconPickerState = {triggerRef, skillId, isOpen}`,onIconClick 触发,IconPicker render 在页面顶层。 |
| **ContextMenu** | `common/ContextMenu.tsx`(未在本研究内逐行展开) | items: `ContextMenuItem[]`、position、onClose | MainLayout `:699-725` 已有 Category/Tag 用法。marketplace 列表项 More menu(R-19 决策不在 V1 提供卸载,已安装直接用 SkillsPage/McpServersPage 的 More menu)。 |
| **ColorPicker** | `common/ColorPicker.tsx`(未深读) | PRESET_COLORS 18 swatches | category 颜色选择;marketplace 不直接用,因为 marketplace 资源不引入新 category(D-15 / R-33) |
| **ScopeSelector** | `common/ScopeSelector.tsx`(未深读) | user / project scope | 不在 marketplace V1 范围(D-7 决策装到 ~/.ensemble/) |
| **ImportDialog** | `common/ImportDialog.tsx`(未深读) | 现有 ImportSkillsModal 的关联组件 | marketplace D-14 决策不弹 Modal(就地按钮状态机),不复用 |
| **TagsWithTooltip** | `common/TagsWithTooltip.tsx`(未深读) | 在列表项内多 tag 折叠展示 | marketplace 列表项展示上游 tag 时(PRD §5.4 "参考信息")可能复用 |
| **Checkbox** | `common/Checkbox.tsx`(未深读) | 通用 checkbox | marketplace V1 不直接用 |

**Toast 不存在**——D-14 决策"不开 Toast 通知"与现状一致;无需为此实现新组件。

---

## 5. design tokens 锚定

### 5.1 现状 token 一览(`src/index.css`)

**颜色 token**(`:30-44, :600-619`):

```
--color-primary: #18181B;
--color-secondary: #71717A;
--color-tertiary: #A1A1AA;
--color-bg-primary: #FFFFFF;
--color-bg-secondary: #FAFAFA;
--color-bg-tertiary: #F4F4F5;
--color-border: #E5E5E5;       ← page chrome border (header/page wrapper border)
--color-divider: #E4E4E7;      ← sidebar 段间 hairline
--color-success: #16A34A;
--color-success-bg: #DCFCE7;
--color-warning: #D97706;
--color-warning-bg: #FEF3C7;
--color-error: #DC2626;
--color-error-bg: #FEE2E2;
--color-accent: #0063E1;       ← 浅色 NSColor.controlAccentColor
--color-accent-soft: rgba(0, 99, 225, 0.5);
[dark prefers-color-scheme]:
--color-accent: #0A84FF;       ← 深色 NSColor.controlAccentColor
```

**Zinc 系颜色直接用十六进制**(design-language Rule §Constraints):`#18181B / #3F3F46 / #52525B / #71717A / #A1A1AA / #D4D4D8 / #E4E4E7 / #E5E5E5 / #F4F4F5 / #FAFAFA`——已在代码中以 `text-[#71717A]` 等 Tailwind 任意值出现。

**Radius**(`:46-52`):`--radius-sm: 3px / --radius-base: 4px / --radius-md: 6px / --radius-lg: 8px / --radius-xl: 10px / --radius-2xl: 11px / --radius-3xl: 16px`。

**Shadow**(`:53-54`):`--shadow-dropdown: 0 4px 12px rgba(0,0,0,0.06)`、`--shadow-card: 0 2px 8px rgba(0,0,0,0.05)`。Modal `0_25px_50px_rgba(0,0,0,0.1)` 是 inline。

**Easing token**(`:602-604`):
- `--ease-drag: cubic-bezier(0.16, 1, 0.3, 1)` — cascade / settle / indicator move
- `--ease-drag-lift: cubic-bezier(0.34, 1.32, 0.64, 1)` — lift 吸盘 only ≤ 80ms
- `--ease-drag-cancel: cubic-bezier(0.32, 0.72, 0, 1)` — cancel snap-back

**Allowed inline easing**(design-language Rule §Constraints):
- `cubic-bezier(0, 0, 0.2, 1)` — 标准 ease-out / lift 拉离
- `cubic-bezier(0.4, 0, 0.2, 1)` — Material standard / **list↔detail compact / SlidePanel**
- `linear` — lift opacity only
- `ease-out` — indicator fade in / button transitions

**Duration token**(`:605-612`):`--duration-drag-lift-grip: 80ms / -lift-pull: 120ms / -reorder: 220ms / -settle: 220ms / -cancel: 280ms / -snap: 80ms / -indicator-fade: 100ms / -indicator-move: 150ms`。

**Indent token**(`:740`):`--indent-step: 16px`(与 CategoryTreeDropdown / SortableCategoryRow 共用)。

### 5.2 SlidePanel "list↔detail compact / SlidePanel" inline easing 代码现状

design-language Rule §Constraints 明文允许 `cubic-bezier(0.4, 0, 0.2, 1)` 用于 SlidePanel。SlidePanel.tsx `:84` 实际:`transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'`。SkillsPage.tsx `:748` 主区右收:`ease-[cubic-bezier(0.4,0,0.2,1)]`。**完全一致,Marketplace 直接复用 SlidePanel 即守 Rule**。

### 5.3 reduced-motion 现状(`:709-728`)

```css
@media (prefers-reduced-motion: reduce) {
  [data-sortable-list] *,
  .drag-overlay-row, .drag-overlay-pill,
  .drop-indicator-h, .drop-indicator-v, .drop-indicator-wrapper {
    transition: none !important;
    animation: none !important;
  }
  ...
}
```

**关键事实**:reduced-motion 当前**只覆盖 sidebar drag**(`[data-sortable-list]`)+ DragOverlay + drop-indicator。**SlidePanel 的 transition-transform 没有 reduced-motion 兜底**;`classify-success-bg` / `ai-classifying` 等 marketplace 无关动画也没有。

design-language Rule "Principles": "`prefers-reduced-motion: reduce` MUST be honored. Any new animation or transition needs a reduced-motion fallback degrading to instant."

**结论**:Marketplace 引入新动效(即使是复用 SlidePanel transition-transform)**应在新建组件 / 新建 className 时同步追加 reduced-motion fallback**。SlidePanel 本身的 reduced-motion 缺失是历史现状,marketplace 实施不直接修复(超范围),但若 marketplace 自身新增任何 transition / animation,必须按 Rule 追加 reduced-motion 选择器。

---

## 6. 给下游的复用建议

下面建议精确到具体复用点,**不涉及改造方案**(改造方案由 02 spec 阶段定义)。

1. **Marketplace 页面顶层 wrapper** 镜像 `SkillsPage.tsx:679` 的 `<div className="relative flex h-full flex-col overflow-hidden">`——`relative` 给 SlidePanel 定位;`flex-col` 让 PageHeader + main 垂直堆;`overflow-hidden` 让 SlidePanel 滑入超出不溢出。
2. **PageHeader 直接 import** `from '@/components/layout'`,actions 槽用一个 `<div className="flex items-center gap-2.5">` 容纳 Refresh + (可选)其他按钮——与 `SkillsPage.tsx:686-728` 完全镜像。
3. **SlidePanel 直接 import** `from '@/components/layout'`,`isOpen={!!selectedItem}` + `width={800}` + `header` `headerRight` `children` 三段——与 `SkillsPage.tsx:783-791` 完全镜像。**不重写,不包装**。
4. **Sidebar 改造** 在 `Sidebar.tsx:276` 与 `:278` 之间新增一段(段标题 + 2 个 nav button + tail divider),段标题镜像 `:317-330` 模式,nav button 镜像 `:285-308` 模式。**不重写 Sidebar,不抽象 NavGroup 组件**——直接 inline 增加(与 R-11 P0-1 决策一致:Marketplace 是顶部独立分组,语义层面就该 inline 写明)。
5. **SidebarProps 类型扩展** `Sidebar.tsx:43`:`activeNav` 联合追加 `'marketplace-skills' | 'marketplace-mcps'`(具体字面值由 02 spec 决定)。同步 `MainLayout.getActiveNav()` `:354-372` 与 `App.tsx` 路由 path。
6. **Routing** 在 `App.tsx:18-25` 之前(在 Skills 路由之前,与 sidebar 顺序一致)插入 2 个 `<Route>`,无 lazy load。
7. **CategoryTreeDropdown 直接复用**——marketplace 列表上方筛选(PRD §5.8)用 `<CategoryTreeDropdown categories={categories} value={selectedCatId} onChange={setSelectedCatId} compact={true} />`,`categories` 来自 `appStore.categories`。
8. **EmptyState 直接复用**——marketplace 离线 / 上游不可达 / 缓存空状态(PRD §5.7),`<EmptyState icon={<WifiOff size=32 />} title="..." description="..." action={<Button variant="secondary" size="small">Retry</Button>} />`。
9. **Modal 直接复用**——同名碰撞 confirm Modal(PRD §5.6 / D-10 / R-1),`<Modal isOpen onClose title=... maxWidth="480px">` 内自定义 body 与按钮;按钮档位用现有 Button primary / secondary。
10. **Tooltip 直接复用**——列表项 Install 按钮 hover README 第一行(PRD §5.5 "二次确认"),`<Tooltip content={readmeFirstLine} maxWidth={320}>`。
11. **IconPicker 直接复用**——marketplace 详情面板顶部图标(PRD §5.4),沿用 `SkillsPage.tsx:794-802` 的 iconPickerState 模式。
12. **Button loading + disabled 直接复用**——`<Button variant="primary" size="small" loading={isInstalling} disabled={isInstalling || isInstalled}>{label}</Button>`,无需自建 Installing... 状态机。

---

**本文件结束。R1 调研产物 = `01_research/R1_sidebar_layout.md`,共约 410 行。**
