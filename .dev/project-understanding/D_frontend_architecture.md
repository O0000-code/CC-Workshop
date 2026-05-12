# D. React 前端架构

> 来源：Explore Sonnet SubAgent D（2026-05-12）
> 覆盖：渲染链 / 依赖 / 路由 / Stores / 组件 / 构建 / UI 模式 / i18n / 测试 / 复杂度

## 1. 架构总览

### 渲染链

```
src/main.tsx
  └─ React.StrictMode
      └─ <App />
          └─ <BrowserRouter>
              └─ <Routes>
                  └─ <Route path="/">
                      └─ <MainLayout />
                          ├─ <Sidebar />
                          └─ <Outlet />   → Page Component
```

`main.tsx` 无任何 Provider 包装。Zustand store 是模块级单例，无需 Context。

`MainLayout` 是应用中枢神经：
- 启动时串行加载：`loadSettings()` → `initApp()` → 并行加载 skills/mcps/claudeMd/scenes/projects
- 注册 Tauri 事件监听（marketplace 事件、second-instance 启动事件）
- 持有 Sidebar 的所有回调 props（30+ 个），包括 DnD 回调
- 渲染 ContextMenu、LauncherModal、MarketplaceShortcutBanner 等跨页面 overlay

### 每页关联 Stores

| Page | 主要 Store | 附加 |
|---|---|---|
| SkillMarketplacePage | marketplaceStore | skillsStore |
| McpMarketplacePage | marketplaceStore | mcpsStore |
| SkillsPage | skillsStore | appStore, importStore, scenesStore, pluginsStore, sortPreferencesStore |
| McpServersPage | mcpsStore | appStore, importStore, sortPreferencesStore |
| ClaudeMdPage | claudeMdStore | appStore, sortPreferencesStore |
| ScenesPage | scenesStore | skillsStore, mcpsStore, sortPreferencesStore |
| ProjectsPage | projectsStore | scenesStore, skillsStore, mcpsStore, settingsStore, sortPreferencesStore |
| CategoryPage / TagPage | appStore | skillsStore, mcpsStore, claudeMdStore |
| SettingsPage | settingsStore | skillsStore, mcpsStore, appStore, claudeMdStore |

## 2. package.json 依赖地图

### 核心框架
- **React 18.3.1** + react-dom
- **TypeScript 5.9.3**（devDependencies）
- **Vite 6.4.1** + @vitejs/plugin-react 4.7.0
- **Tauri 2.x**: `@tauri-apps/api ^2.9.1`，`@tauri-apps/cli ^2.9.6`，`@tauri-apps/plugin-dialog ^2.6.0`

### 路由
- **react-router-dom 7.13.0**（v7，但用法是标准 BrowserRouter/Routes/Route/Outlet）

### 状态管理
- **zustand 5.0.10**；部分 store 用 `zustand/middleware persist` + `createJSONStorage`

### UI 图标
- **lucide-react 0.500.0**（大量使用，无其他图标库）

### Drag-and-Drop
- **@dnd-kit/core ^6.3.1** + **@dnd-kit/sortable ^10.0.0** + **@dnd-kit/modifiers ^9.0.0** + **@dnd-kit/utilities ^3.2.2**

### 样式
- **tailwindcss ^4.1.18** + **@tailwindcss/vite ^4.1.18**（Tailwind v4，Vite plugin 集成，无 postcss 配置）

### Markdown
- **react-markdown ^10.1.0** + **remark-gfm ^4.0.1**（Marketplace detail panel）

### **无 framer-motion，无 i18n 框架，无 MUI/Shadcn/Radix**

### 工具链
- **husky 9.1.7** + **lint-staged 16.3.1**：pre-commit `eslint --fix` + `prettier --write`
- **vitest 4.0.18** + **@testing-library/react 16.3.2** + jsdom

## 3. 路由表（src/App.tsx:1-41）

| Route | Page | 说明 |
|---|---|---|
| `/` (index) | `<Navigate to="/marketplace-skills" replace />` | 默认跳转 |
| `/marketplace-skills` | SkillMarketplacePage | **默认落地页**，V2 |
| `/marketplace-mcps` | McpMarketplacePage | V2 |
| `/skills` | SkillsPage | |
| `/mcp-servers` | McpServersPage | |
| `/claude-md` | ClaudeMdPage | |
| `/scenes` | ScenesPage | |
| `/projects` | ProjectsPage | |
| `/category/:categoryId` | CategoryPage | 动态路由 |
| `/tag/:tagId` | TagPage | 动态路由 |
| `/settings` | SettingsPage | |

所有 Route 嵌套在 `<MainLayout />` 下，通过 `<Outlet />` 渲染。导航逻辑在 MainLayout，通过 `useLocation().pathname` 派生 active 状态。

## 4. Zustand Store 清单

### 4.1 appStore（src/stores/appStore.ts，919 行）

**State**：`categories[]`, `tags[]`, `categoriesVersion: number`, `tagsVersion: number`, `counts{skills,mcpServers,scenes,projects}`, `activeCategory`, `activeTags`, `isLoading`, `error`, `editingCategoryId`, `isAddingCategory`, `editingTagId`, `isAddingTag`

**Action**：`initApp()`, `loadCategories/Tags()`, `addCategory/Tag()`, `updateCategory/Tag()`, `deleteCategory/Tag()`, `reorderCategories/Tags()`, `moveCategoryToParent()`, `moveCategoryToParentAtPosition()`

**特殊模式**：模块级 `reorderQueue: Promise` 串行队列（`appStore.ts:20-26`），并发 reorder/setParent 的 IPC 顺序严格对应用户操作顺序。

**Version Counter 模式**（`appStore.ts:95-99, 256-278`）：每次本地突变 `categoriesVersion + 1`；IPC 回调前读 `versionBefore`，回调后比较；不一致则丢弃 IPC 响应保留乐观状态。

**Persist**：无。所有数据通过 IPC 持久化到后端。

### 4.2 skillsStore / mcpsStore（对称）

**State**：`items[]`, `selectedId`, `filter`, `isLoading`, `error`, `isClassifying`, `classifySuccess`, `usageStats`

**乐观更新+失败回滚**：先 set 本地，IPC 失败则 revert（`skillsStore.ts:145-165`）

### 4.3 scenesStore

`scenes[]`, `selectedSceneId`, `lastEditedSceneId`, `filter`, `createModal{...}`

调 `get_scenes`, `add_scene`, `update_scene`, `delete_scene`, `read_app_data`/`write_app_data`（lastEditedSceneId 持久化）

### 4.4 settingsStore

`skillSourceDir`, `mcpSourceDir`, `claudeConfigDir`, `anthropicApiKey`, `autoClassifyNewItems`, `classifyModel`, `terminalApp`, `claudeCommand`, `warpOpenMode`, `claudeMdDistributionPath`, `hasCompletedImport`, `stats`

通过 Tauri `read_settings`/`write_settings` 持久化；无 Zustand persist。

### 4.5 marketplaceStore（src/stores/marketplaceStore.ts，2064 行 ⚠️ 最大文件）

**唯一使用 `zustand/middleware persist` 的数据 store**，`createJSONStorage(() => localStorage)`（`marketplaceStore.ts:531`）。

**SWR 模式**：5 分钟 TTL（`marketplaceStore.ts:500`），`mode: 'auto'` mount 时检查缓存：< 5min 不发请求，≥ 5min 发静默后台请求（icon 脉冲）但 UI 继续展示旧数据。persist 让缓存跨重启存活。

**Tauri 事件监听**：6 个通道（`marketplace:catalog:enhanced`, `marketplace:scrape:degraded`, `marketplace:upstream:error`, `marketplace:stale_cache`, `marketplace:classify:result`, `marketplace:classify:failed`），在 MainLayout 中通过 `initEventListeners()` 一次性建立。

### 4.6 sortPreferencesStore

**唯一使用 `persist + localStorage` 的 UI 偏好 store**，key = `ensemble-sort-preferences`，version 3（有跨版本 migrate 函数）。

### 4.7 其余

- **claudeMdStore**：CLAUDE.md 文件列表、全局 ID、扫描/导入/分发状态
- **projectsStore**：projects + selected + isCreating
- **importStore**：首次导入 flow
- **pluginsStore**：Claude Code plugin 集成
- **launcherStore**：纯前端，无 IPC（isOpen + folderPath）
- **trashStore**：list_trashed_items

## 5. 核心组件分层

### 5.1 布局层（src/components/layout/）

**MainLayout.tsx**（833 行）— 应用壳层；订阅所有 store 并下传 Props；主区 `<Outlet />`

**Sidebar.tsx** — 纯展示，接收 30+ props；窗口拖拽通过 `startDrag()` 调 `getCurrentWindow().startDragging()`，跳过 `[data-sortable-list]` 内区域避免与 dnd-kit 竞争

**ListDetailLayout.tsx** — 双栏：左 List（380px 固定）+ 右 Detail（flex-1）；两栏 header 均 `onMouseDown={startDrag}`

**PageHeader.tsx** — 56px 高，title/badge/SearchInput/actions

**SlidePanel.tsx** — 从右滑入；绝对定位 `translate-x-full / translate-x-0`，250ms `cubic-bezier(0.4, 0, 0.2, 1)`。SkillsPage/McpServersPage 用 SlidePanel 而非 ListDetailLayout。

### 5.2 Sidebar DnD 组件树

```
SortableCategoriesList   (1432 行)
  └─ DndContext
      ├─ sensors: [CustomMouseSensor(4px activation), KeyboardSensor(treeKeyboard)]
      ├─ collisionDetection: sidebarCollisionDetection (自定义)
      ├─ modifiers: [snapModifier]   (12px Y轴 quadratic snap)
      └─ SortableContext (verticalListSortingStrategy)
          ├─ SortableCategoryRow × N
          │    └─ CategoryRowContent
          └─ DragOverlay
               └─ DragOverlayCategoryRow
```

### 5.3 Page 模板类型

**SlidePanel 模式**：SkillsPage / McpServersPage / SkillMarketplacePage / McpMarketplacePage / ScenesPage —— 列表 + `<SlidePanel>` 由 `selectedId !== null` 驱动

**ListDetailLayout 模式**：ProjectsPage / ClaudeMdPage / CategoryPage / TagPage —— 显式分割双栏

**ScenesPage 特殊**：用 SlidePanel 详情 + `CreateSceneModal`（portal）

### 5.4 Modal 族（src/components/modals/）

`ImportSkillsModal`, `ImportMcpModal`, `ImportClaudeMdModal`, `ScanClaudeMdModal`, `TrashRecoveryModal`

基础组件 `Modal.tsx` 配合 `modal-overlay-animate` / `modal-dialog-animate` CSS（200ms 淡入+缩放）。SettingsPage 直接用 `createPortal` 内联确认弹窗。

### 5.5 通用组件（src/components/common/）

Badge, Button, CategoryTreeDropdown, Checkbox, ColorPicker, ContextMenu, Dropdown, EmptyState, ErrorBoundary, FilteredEmptyState, IconPicker, Input, Modal, ScopeSelector, SearchInput, TagsWithTooltip, Toggle, Tooltip, ViewOptionsMenu

`ErrorBoundary`（class component）包裹 `<Outlet />`，隔离 Page 级渲染错误。

## 6. 路径别名与构建

### `@/` 别名

`vite.config.ts:17`：`"@": resolve(__dirname, "./src")` — 解析到 `src/`。`vitest.config.ts:27` 同步配置。

### Vite 配置

- 端口固定 1420（`strictPort: true`）
- watch 忽略 `src-tauri/`
- Plugins：`react()` + `tailwindcss()`（Tailwind v4 Vite plugin 模式，无 postcss.config.js）

### Tauri dev vs 纯前端 dev

| 命令 | 环境 | Tauri IPC |
|---|---|---|
| `npm run dev` | 浏览器，Vite port 1420 | 不可用，`safeInvoke` 返回 null + console.warn |
| `npm run tauri` | macOS 原生窗口 + WebView | 完整 IPC |

`isTauri()` 检测 `window.__TAURI_INTERNALS__`（v2）或 `window.__TAURI__`（v1 fallback）（`tauri.ts:7-17`）。所有 store action 在浏览器模式下短路。

### vitest

- env: jsdom，globals: true
- setupFiles: `src/test/setup.ts`
- coverage: v8

## 7. 关键 UI 模式

### 7.1 Drag-and-Drop（dnd-kit + 自定义扩展）

**`CustomMouseSensor`** 继承 dnd-kit MouseSensor，4px 激活，`data-no-dnd="true"` 排除交互子元素（如 ColorPicker 圆点）

**层级树算法**：`treeUtilities.ts` 实现 `flattenTree()` + `getProjection()`（从水平拖拽偏移量计算目标深度），硬限 MAX_DEPTH=1

**Drop-into vs Reorder**：12px 水平 X 阈值 + 80ms dwell 触发"放入成为子分类"；无水平位移为同级 reorder

**Tags 列表**：`SortableTagsList` 是平层 sortable（无层级），结构简单得多

### 7.2 乐观更新 + Version Counter

`appStore` 每次本地突变 `categoriesVersion + 1`；IPC 回调比较 `versionBefore !== versionAfter` → 不一致则丢弃 IPC 响应。
三级回退：①读后端 canonical (`get_categories`) → ②revert 到调用时快照 → ③set error

Skills/MCP 乐观更新更简单：先 set，失败则用旧值 revert

### 7.3 SlidePanel 模式

`absolute top-0 right-0 h-full`，默认 800px；`translate-x-full ↔ translate-x-0`，250ms ease-in-out。Header `onMouseDown={startDrag}` 支持窗口拖拽（pointer-events: none，子交互通过 `[&_button]:pointer-events-auto` 恢复）。

### 7.4 CSS Variables 设计 Token

`src/index.css:30-55` 定义完整 token（颜色/字体/圆角/阴影）。组件内混合 Tailwind utility（颜色用 `text-[#71717A]` 内联 hex）和 CSS variable，**不完全统一**。

### 7.5 Focus/Hover/Active 风格

- hover: `hover:bg-[#F4F4F5]`
- active/selected: `bg-[#F4F4F5]` / `bg-zinc-100`
- border: `border-[#E5E5E5]`
- 按钮圆角: `rounded-md`（6px）

### 7.6 Marketplace SWR 缓存

`mode: 'auto'` mount 时检查缓存年龄：< 5min 不发，≥ 5min 静默后台请求；persist 跨重启存活。

## 8. i18n / 文案

**UI 语言全部为英文**。无 i18n 框架（无 react-i18next/i18next/lingui）。

**中文仅出现在代码注释**（设计备注、JSDoc 技术说明、TS 字段说明），不影响 UI。

文案分散在各组件内联硬编码，无集中文案文件。

## 9. 测试覆盖

共 **22 个测试文件**，Vitest + @testing-library/react + jsdom。

### Store 测试（src/stores/__tests__/）
- `appStore.test.ts`
- `appStore.moveCategoryToParent.test.ts` — 层级移动的 6 条校验
- `appStore.moveCategoryToParentAtPosition.test.ts`
- `appStore.migration.test.ts`
- `settingsStore.test.ts`

**注意**：skillsStore、mcpsStore、scenesStore、projectsStore、marketplaceStore 无专属测试（IPC 路径难以 jsdom mock）。

### Sidebar DnD 密集测试（src/components/sidebar/__tests__/）
- SortableCategoriesList.test.tsx（13 testing targets）
- SortableCategoryRow.test.tsx
- DragOverlayCategoryRow.test.tsx

### Sidebar DnD 算法测试（src/components/sidebar/dnd/__tests__/）
- treeUtilities.test.ts
- collisionDetection.test.ts
- snapModifier.test.ts
- treeKeyboardCoordinates.test.ts

### 其他
- 公共组件：Badge / EmptyState / Toggle
- Layout 计算：`categoriesWithCounts.test.ts`（descendant 累加）
- Page 测试：CategoryPage.test.tsx
- Utils：categoryTree, constants, parseDescription, tauri, text

**无 E2E 测试**（无 Playwright 配置）。

## 10. 复杂度热点

### 大文件

| 文件 | 行数 | 说明 |
|---|---|---|
| `src/stores/marketplaceStore.ts` | **2064** | 最大，SWR + 事件 + collision + install flow |
| `src/components/sidebar/SortableCategoriesList.tsx` | **1432** | 层级 DnD 算法，23 条 V3 invariant |
| `src/pages/McpMarketplacePage.tsx` | **1128** | Marketplace 页内嵌复杂逻辑 |
| `src/pages/SkillMarketplacePage.tsx` | **958** | 同上 |
| `src/components/layout/MainLayout.tsx` | **833** | 应用中枢 |
| `src/stores/appStore.ts` | **919** | 三级回退 + serial queue + validation |

### 架构耦合点

1. **MainLayout 是大型协调器（"上帝组件"）**：订阅 9 个 store，手工传 30+ props 给 Sidebar，单一组件承担初始化、事件注册、全局 overlay。当前最明显的耦合点。

2. **Sidebar Props 数量爆炸**：30+ 字段，DnD 任何变更需同时改 MainLayout、Sidebar、SortableCategoriesList 三个文件。

3. **Store 间直接 `getState()` 调用**：skillsStore 在 `deleteSkill()` 中 `usePluginsStore.getState()`；`updateSkillCategory` 读 `useAppStore.getState().categories`。运行时无循环依赖，但测试需额外 mock。

4. **marketplaceStore 的 Tauri 事件耦合**：6 个监听器生命周期由 MainLayout 的 useEffect 管理，存在 unmount 时 Promise 已解析但 `cancelled` flag 先置 true 的微妙竞态。

5. **`SceneDetailPage.tsx` 是死代码**：文件存在但 `App.tsx` 没注册路由——已是死代码或待接入功能。

6. **最近高频改动**：`SortableCategoriesList.tsx`（连续 10+ commit 修复 hierarchy DnD，V2.0→V2.3 迭代），`marketplaceStore.ts`（Marketplace Phase I/II 密集开发），`MainLayout.tsx`（每次 Marketplace 新功能都需改事件注册）。
