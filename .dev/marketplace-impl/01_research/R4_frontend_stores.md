# R4 — Frontend Stores / Types / IPC 调研

> **角色**: Referential（事实陈述）— 调研当前前端 store / type / IPC / 跨页面同步现状，为 marketplaceStore + 三态 installSource + 客户端 SSoT 镜像 + 单项 auto-classify 提供事实基础。**不写设计**。
> **来源**: 现行 baseline + sidebar-hierarchy-fix 的 in-progress 改动。所有引用带 `file:line`。

---

## 0. TL;DR — 下游必看 5 条事实

1. **`installSource` 是真二态、未抽出共用 union**：`Skill.installSource?: 'local' | 'plugin'`（`src/types/index.ts:32`）+ `McpServer.installSource?: 'local' | 'plugin'`（`src/types/index.ts:70`）。`src/types/index.ts:2` 还有一个**死代码** `export type InstallSource = 'manual' | 'import' | 'npx' | 'plugin'`，**没有任何 import 引用**（grep 全部为 0）。R-2 三态扩展的真实改造点 = **2 个 Skill/Mcp 字面量 + 11 处 `=== 'plugin'` callsite** + Rust `pub install_source: Option<String>`（types.rs:34, 81, 347 三处）。死的 `InstallSource` alias 应该顺手删除（避免误导）。
2. **`safeInvoke` 在浏览器模式静默 return null** — `src/utils/tauri.ts:23-34` 不抛错只 `console.warn`。所有 store 第一句都 `if (!isTauri()) { console.warn; return; }` 自卫。Marketplace store 必须延续这一约定，否则浏览器预览模式（vite dev no-tauri）会卡 spinner。
3. **每个域 store 都自己持有 list + filter + isLoading + error + selectedId**，无统一基类；`skillsStore` / `mcpsStore` / `claudeMdStore` **三个 store 独立含一份完整 Auto-Classify 流程**（150+ 行重复）。Auto-Classify **当前只支持全量批处理**，无单项触发 IPC（D-8 V1 单项异步触发**必须新增 IPC** 或扩展 `auto_classify` 接受单 item 并复用 1.5s + 200ms 动效）。
4. **plugin "全局沉底" 排序硬编码在 `getFilteredSkills` / `getFilteredMcps` 末尾**（`src/stores/skillsStore.ts:469-478`、`src/stores/mcpsStore.ts:503-512`），`a.installSource === 'plugin'` 直接判断。R-4 P0 风险（marketplace 不沉底）的具体硬约束代码就在这两处 — 三态扩展时 **必须只让 `'plugin'` 沉底，`'marketplace'` 与 `'local'` 同优先级**。
5. **客户端**没有"已装"独立 store；Skill/Mcp 列表唯一来源 = 后端 `scan_skills` / `scan_mcps` 扫盘 + metadata 合并的结果（即 `~/.ensemble/skills/` 真实目录列表）。**SSoT 第 3 条件（"不在 Trash"）当前隐式由 scan 不包含 trash 子目录实现** — Marketplace 列表判定"已装"必须通过 `useSkillsStore.skills` / `useMcpsStore.mcpServers` 的 selector 推导，不能查 `data.json` 字段。跨页面同步因此天然由 `loadSkills` / `loadMcps` reload 驱动；marketplace store 的"安装成功 → 跨视图同步"的契约 = 调 `useSkillsStore.getState().loadSkills()`。

---

## 1. safeInvoke 与 IPC 边界

**单一入口**: `src/utils/tauri.ts:23-34`。
- 环境检测两路: `__TAURI_INTERNALS__`（Tauri 2.x，主路径）+ `__TAURI__`（1.x 兼容）— `src/utils/tauri.ts:7-17`。
- 不在 Tauri 中 → `console.warn(...)` + 返回 `null`，**不抛错**。
- 浏览器横幅: `src/components/layout/MainLayout.tsx:638-` 检测 `!isTauri()` 显示 amber 提示条；`BROWSER_MODE_MESSAGE` 常量 `src/utils/tauri.ts:39`。

**所有 store 自卫模式**（重复 ~30 处）:
```ts
if (!isTauri()) { console.warn('XStore: Cannot ... in browser mode'); return; }
```
具体例: `src/stores/skillsStore.ts:96-101`、`src/stores/mcpsStore.ts:95-99`、`src/stores/claudeMdStore.ts:142-145`。

**没有统一错误转型**：每个 store 在 catch 内做 `typeof error === 'string' ? error : String(error)` 转 string（`src/stores/skillsStore.ts:111`、`src/stores/mcpsStore.ts:147` 等），结果写入 `error: string | null`。**没有结构化 error code** — UI 只能展示文本。

**没有取消机制 / 超时**：`safeInvoke` 是 `Promise<T | null>`，无 abort signal，无 timeout 参数。Marketplace 长链 git clone 类型操作**目前依赖后端实现超时**；前端无主动取消能力。

---

## 2. Skill / McpServer TS 类型（installSource 完整链路 + 三态扩展点）

### 2.1 Skill 类型

`src/types/index.ts:4-37`:
```ts
export interface Skill {
  id: string;                           // = sourcePath（H §3-条款 7 已识别风险）
  name, description, category, categoryId?, tags, enabled, sourcePath,
  scope: 'global' | 'project',
  invocation?, allowedTools?, instructions, createdAt, lastUsed?, usageCount,
  icon?, installedAt?,
  // 插件相关字段（V1 二态）
  installSource?: 'local' | 'plugin';  // 第 32 行 — R-2 扩展点 #1
  pluginId?: string;                    // 第 33 行
  pluginName?: string;                  // 第 34 行
  marketplace?: string;                 // 第 35 行 — plugin 来源里的"marketplace 名"，名字将与 V2 marketplace 概念冲突
  pluginEnabled?: boolean;              // 第 36 行 — runtime 状态，不持久化（H §Q4）
}
```

### 2.2 McpServer 类型

`src/types/index.ts:39-75`:
```ts
export interface McpServer {
  id, name, description, category, categoryId?, tags, enabled, sourcePath,
  scope: 'global' | 'project',
  command, args, env?,                  // stdio
  providedTools, createdAt, lastUsed?, usageCount, icon?, installedAt?,
  url?, mcpType?,                        // HTTP（67-68 行；HTTP MCP 的 command 是空串）
  installSource?: 'local' | 'plugin';   // 第 70 行 — R-2 扩展点 #2
  pluginId?, pluginName?, marketplace?, pluginEnabled?,  // 71-74 行
}
```

### 2.3 死代码 / 命名冲突警告

`src/types/index.ts:2`:
```ts
export type InstallSource = 'manual' | 'import' | 'npx' | 'plugin';
```
**zero usage**（grep `InstallSource\b` 全部命中只有这一处定义，无任何 import）。建议本轮顺手 prune；否则三态扩展时若有人无意 import 这个 alias 会引入第二个错误的二态 union。

**命名空间冲突**：现有 plugin 字段已有 `marketplace?: string`（plugin 来源的"marketplace ID"如 `claude-code-settings`）。V2 marketplace 的"上游来源"字段命名要避开 — 例如 `marketplaceSource?: 'skills_sh' | 'mcp_registry'` 或新建独立 `MarketplaceMetadata` 子对象，不要直接复用 `marketplace`。

### 2.4 全部 `installSource === 'plugin'` callsite（grep 落点）

11 处（搜索 `'installSource' && '=== '\''plugin'\'`'`）：
| 文件:行 | 用途 |
|---|---|
| `src/stores/skillsStore.ts:471-472` | 排序时 plugin 沉底 |
| `src/stores/mcpsStore.ts:505-506` | 排序时 plugin 沉底 |
| `src/components/scenes/CreateSceneModal.tsx:421` | Scene 模态过滤 plugin skill |
| `src/components/scenes/CreateSceneModal.tsx:431` | Scene 模态过滤 plugin mcp |
| `src/components/skills/SkillListItem.tsx:87` | 列表项渲染 plugin badge |
| `src/components/mcps/McpListItem.tsx:95` | 列表项渲染 plugin badge |
| `src/components/skills/SkillDetailPanel.tsx:586` | 详情 Source section 分支 |
| `src/components/mcps/McpDetailPanel.tsx:538` | 详情 Source section 分支 |
| `src/pages/SkillsPage.tsx:620` | 内嵌 Source 渲染 |
| `src/pages/SkillDetailPage.tsx:450` | 独立详情页 |
| `src/pages/McpServersPage.tsx:611` | 内嵌 Source 渲染 |
| `src/pages/McpDetailPage.tsx:361` | 独立详情页 |

**三态扩展的工程边界**：
- 类型字面量改 `'local' | 'plugin' | 'marketplace'`（2 处）
- 排序逻辑只让 `=== 'plugin'` 沉底（不动 marketplace），`a.installSource === 'plugin'` 表达式语义保留正确，但 marketplace items 走默认 `localeCompare(name)` 同 local
- UI 分支：plugin badge 渲染（11 行 174 行的 `isPluginSource`）保持 `=== 'plugin'`；marketplace 来源**列表项不加 badge**（D-9）— 不需要新增 UI 分支，详情面板的 Source 行在原有分支的 else 内追加 marketplace 来源展示
- Scene 模态 `CreateSceneModal.tsx:421/431` 的 "filter plugin only" 是 plugin 启用状态门槛 — marketplace items 不需要这个门槛（D-9：marketplace 与 local 平等）

### 2.5 plugin 来源字段在前端的语义

`pluginEnabled` 来自 runtime 而非 metadata（每次 scan 时由后端从 `~/.claude/settings.json` 实时读，H §Q4）。**marketplace 资源不涉及此字段**（marketplace 没有 enable/disable 概念，由 Scene 控制激活）。前端要避免在 marketplace 资源上读写 `pluginEnabled`。

`pluginId` 用于 `deleteSkill` / `deleteMcp` 中清理 import record（`src/stores/skillsStore.ts:131-136`、`mcpsStore.ts:124-129`）— marketplace 资源**没有 pluginId**，删除路径走默认分支即可（不调 `setImportedPluginSkills`）。

---

## 3. AppData / Settings TS 镜像

### 3.1 AppData

`src/types/index.ts:317-338`:
```ts
export interface AppData {
  skills?, mcpServers?,                 // 注释明确：runtime-derived，read_app_data 不返回
  scenes, projects, categories, tags,
  settings?,
  importedPluginSkills?: string[],       // pluginId 列表（plugin 已被 import 的）
  importedPluginMcps?: string[],
  hasCompletedCategoryIdMigration?,
}
```

**marketplace 字段空缺**：当前 AppData 没有 `imported_marketplace_skills` / `imported_marketplace_mcps` / `marketplaceCache` / `marketplaceSeenAt` 等字段。R-49 P2（上游来源是否进 `data.json.skillMetadata` 还是新建 `marketplaceMetadata`）的客户端解读 = 选其一前必须先在 `AppData` TS 接口扩展，并同步 `src-tauri/src/types.rs` 的 `AppData` struct（CLAUDE.md key patterns 段：跨语言类型镜像）。

### 3.2 Settings

`src/types/index.ts:126-138`:
```ts
export interface AppSettings {
  skillSourceDir, mcpSourceDir, claudeConfigDir,
  anthropicApiKey,
  autoClassifyNewItems: boolean,         // R-22 — 已存在，未消费
  terminalApp, claudeCommand, hasCompletedImport, warpOpenMode,
  claudeMdDistributionPath?,
}
```

`autoClassifyNewItems` 现状：
- store 中有 setter `src/stores/settingsStore.ts:118-121` 与持久化 `src/stores/settingsStore.ts:189-217`
- **没有任何 UI 暴露**（grep `autoClassifyNewItems` 在 `src/components/` 与 `src/pages/` 下零结果）
- **没有任何代码消费**（grep `autoClassifyNewItems` 全 codebase 仅 6 处定义/getter，无 reader）

D-8 V1 启用：marketplace 安装成功后**主动调用**单项 auto-classify；是否检查 `autoClassifyNewItems === true` 由 spec 决定 — PRD §7.2 写的是"V1 启用该 flag 并默认 true"，需要把 `defaultSettings.autoClassifyNewItems` 从 `false`（`src/stores/settingsStore.ts:77`）改为 `true`，并在 marketplace install 完成后判断该 flag。

### 3.3 ClaudeMd / Plugin / Trash 类型

- `src/types/claudeMd.ts` — 完整领域类型（ClaudeMdFile / ClaudeMdScanItem / ClaudeMdImportOptions / ClaudeMdImportResult / ClaudeMdDistributionOptions / ClaudeMdDistributionResult / SetGlobalResult），不参与 marketplace。
- `src/types/plugin.ts` — `DetectedPluginSkill` / `DetectedPluginMcp` / `InstalledPlugin` / `PluginImportItem`。Marketplace 的"上游条目"类型不能复用这些 — 上游 marketplace **不分发 plugin**（D-3）。
- `src/types/trash.ts:1-28` — 极简：每条 trashed item 只有 `{ id, name, path, deletedAt, description }`，`TrashedItems = { skills, mcps, claudeMdFiles }`。**没有 trashed item 的 metadata 镜像**（无 category/tag/icon），因此 §7.6 PRD "Restore from Trash 时 metadata 全部继承"必须在后端实现保留 metadata（前端的 trash store 看不到）。

---

## 4. Store 模式与各 Store 现状

### 4.1 通用模式

每 store 都是单一 zustand `create<>()` 工厂，包含：
- `data: Item[]` + `selectedId: string | null` + `filter: { search, category, tags }`
- `isLoading: boolean` + `error: string | null`
- 如域内有动效驱动 → `isClassifying / classifySuccess / isFadingOut / showRestoreAnimation`
- 同步动作 setter / 异步 IPC 动作（带乐观更新 + 回滚）
- Computed selectors: `getFilteredX()` / `getEnabledCount()` / `getSelectedX()`

**乐观更新 + 回滚标准模式**（`src/stores/skillsStore.ts:160-209`，updateSkillCategory 是教科书例）：
1. snapshot oldValue
2. set 局部更新（optimistic）
3. await safeInvoke
4. catch → set 恢复 oldValue + error: message

**版本计数**：仅 `appStore.categoriesVersion` / `tagsVersion` 用于 reorder 期间防 stale snapshot 覆盖（`src/stores/appStore.ts:99-100, 256-273`）— 域 store（skills / mcps / claudeMd）**没有版本计数**，因为它们的写操作是单点 metadata 更新，不存在 reorder 类的"重叠 IPC"。Marketplace store 的写操作（install）也是单点，**不需要引入版本计数**。

### 4.2 skillsStore（493 行，sidebar-hierarchy-fix 简化重构 -73 行）

`src/stores/skillsStore.ts`：
- `loadSkills` (95-114) → `safeInvoke('scan_skills', { sourceDir: skillSourceDir })`
- `deleteSkill` (120-158) → 乐观删除 + 回滚通过 `loadSkills()` 全量 reload；同时清理 `pluginId` import record
- `updateSkillCategory` / `updateSkillTags` / `updateSkillIcon` / `updateSkillScope` — 标准乐观更新模式
- `autoClassify` (319-415) — **全量批处理流程**：
  1. 收集 `skills` 全量 → `ClassifyItem[]`
  2. 调 `buildExistingCategoriesPayload(categories)`（`src/utils/classifyHelpers.ts:19-27`）
  3. `safeInvoke('auto_classify', { items, existingCategories, existingTags, availableIcons: ICON_NAMES })`
  4. `applyClassifyResultsToCategories` 创建新 cat/tag（含 depth-2 子分类支持，sidebar-hierarchy-fix 产物）
  5. 逐项 `update_skill_metadata` 应用结果
  6. 三个 store reload + 1.5s + 200ms fade-out 动效（`set({ classifySuccess: true })` → `setTimeout` 链）
- `getFilteredSkills` (445-481) — 末段 `filtered.sort` plugin 沉底（**R-4 修改点**）

**simplification 后被删除**：之前有 `applyAutoClassifyResults` 内联实现（约 73 行），被 sidebar-hierarchy-fix 抽到 `src/utils/classifyHelpers.ts` 共享。

### 4.3 mcpsStore（526 行，-72 行简化）

`src/stores/mcpsStore.ts`：
- 与 skillsStore 镜像，差别在：
  - `fetchMcpTools` (278-353) — runtime 探测 stdio MCP 提供的 tools；HTTP MCP 直接拒绝（291-293 行）
  - `mcpFetchErrors: Record<string, string>` — per-MCP fetch error，不污染全局 error
  - 排序沉底逻辑同 skillsStore (503-513)
- `autoClassify` (382-472) 镜像 skillsStore，items 含 `tools: m.providedTools.map(t => t.name)`

### 4.4 claudeMdStore（592 行，-88 行简化）

`src/stores/claudeMdStore.ts`：
- 含 `globalFileId` + `setGlobal` / `unsetGlobal`（与 marketplace 无关）
- `scanFiles` / `importFile` / `distributeToProject` — 复杂域操作
- `autoClassify` (412-511) 镜像 skills/mcps，items 含 `content: f.content.substring(0, 500)`

### 4.5 categoriesStore / tagsStore — **不存在独立 store**

类目和标签数据 + 操作都在 `appStore.ts`（920 行）。Marketplace 不动 categories/tags 数据层 — **只读 selector**（`useAppStore.getState().categories` / `tags`）作为分类筛选数据源。

### 4.6 classifyStore — 不存在独立 store

Auto-Classify 状态分散在三个域 store 内（`isClassifying` / `classifySuccess` / `isFadingOut` / `showRestoreAnimation`）。**marketplace 单项分类的视觉反馈契约**有两个选项：
- 复用 `useSkillsStore.isClassifying` 等同名旗标（语义略改：从"全量"扩到"含 marketplace 单项触发"）— 简单，风险是单项跑期间隐藏全量按钮
- 新增 `marketplaceStore.classifyingItemIds: Set<string>` 局部到 row — 干净，需要 list 项内绑定该 set
spec 阶段决，本轮调研只列两条事实路径。

### 4.7 trashStore（141 行）

`src/stores/trashStore.ts`：
- `loadTrashedItems` → `list_trashed_items` IPC
- `restoreSkill(path)` / `restoreMcp(path)` / `restoreClaudeMd(path)` — 三种 restore IPC
- restore 后 reload trashed items，**但不 reload skills/mcps** — UI 须自己再触发 `useSkillsStore.loadSkills()`

§5.6 同名碰撞 Modal "Restore from Trash" 的客户端流程：
1. marketplace store 查 `useTrashStore.trashedItems?.skills.find(s => s.name === name)` 判定 Trash 中是否存在
2. 用户点 Restore → `useTrashStore.restoreSkill(trashedSkill.path)`
3. restore 成功后 marketplace store 主动调 `useSkillsStore.loadSkills()` 让 SSoT 同步

### 4.8 sceneStore / projectsStore / appStore

- `sceneStore` — 有 `CreateModalState`（含跨 tab 选中态），有 `addScene` / `updateScene` IPC（`src/stores/scenesStore.ts:127-211`）
- `projectsStore` — 有 `syncProject` 复杂流程（`src/stores/projectsStore.ts:195-261`）
- `appStore` — categories/tags + version counters + 复杂 reorder 队列 + V1 hierarchy migration（不与 marketplace 交集）

---

## 5. Classify 客户端流程（单项 vs 全量；D-8 V1 单项触发可行性）

### 5.1 当前 IPC

后端 IPC `auto_classify` 的客户端调用接口：
```ts
safeInvoke<ClassifyResult[]>('auto_classify', {
  items: ClassifyItem[],          // 任意条目，类型见 src/types/index.ts:153-160
  existingCategories: ExistingCategoryPayload[],  // 含 parentName，src/types/index.ts:180-183
  existingTags: string[],
  availableIcons: string[],       // ICON_NAMES from IconPicker
})
```

`ClassifyItem` 接受 1 项或 N 项均可（后端 prompt 设计支持，参 sidebar-hierarchy-fix 改动的 `src-tauri/src/commands/classify.rs`）。**D-8 V1 单项异步触发可以直接复用此 IPC 传单元素数组**，无需新增后端 IPC。

### 5.2 客户端单项流程（marketplaceStore 内的伪代码语义）

可行性结论：**直接复用 `auto_classify` IPC，传 `[singleItem]` 即可**。配套客户端步骤（marketplace install 完成的"安装成功"分支内）：
1. 安装成功 → 拉一次 `useSkillsStore.getState().loadSkills()` 让新装项进入 list
2. 在 marketplace store 里以新装项 id 触发 `auto_classify(items=[oneItem], existingCategories, existingTags, availableIcons)`
3. 调 `applyClassifyResultsToCategories` 处理可能的新建 cat/tag
4. 调 `update_skill_metadata` 应用结果
5. 再次 `loadSkills()` 让 categoryId 同步到 skill row
6. 失败时 R1-P0-4 — 不影响"装"成功，前端在 marketplace store 设 `classifyFailedItemIds: Set<string>`，列表 / 详情据此显示 "Auto-classify failed — assign manually"

### 5.3 动效驱动现状

CSS 动画在 `src/index.css:494-575`（`ai-spinner`、`ai-classifying`、`classify-success-bg`、`classify-fading-out`、`classify-fade-in`、`classify-success-bloom` 等）。Auto-Classify 按钮外观 = `disabled + className 三态切换`（`src/pages/SkillsPage.tsx:700-726`）。

**spinner → checkmark → fade-out** 视觉的真实驱动 = store 内 `setTimeout` 链（`src/stores/skillsStore.ts:401-410`）：1500 ms 显示 success → set isFadingOut → 200ms 后 reset + showRestoreAnimation → 200ms 后 reset。**没有 framer / RAF**，纯 React state + CSS keyframe。Marketplace 单项触发若复用同套 className（`ai-spinner` 等），需要把动效作用域**限定到 row** — list 项 `[data-classifying-id="x"]` selector 或在 row 组件内置 className。

---

## 6. Trash 客户端表达（SSoT 第 3 条件）

### 6.1 SSoT 第 3 条件 = "不在 Trash" 的客户端实现

PRD §7.4 三个条件：
1. 自有路径下存在该资源条目
2. data.json 中存在该资源的 metadata entry
3. 该资源不在 Trash 中

**客户端的真实数据形态**：
- 条件 1+2 的合并结果 = `useSkillsStore.skills` / `useMcpsStore.mcpServers`（`scan_skills` / `scan_mcps` 已合并这两层 — 见 `src-tauri/src/commands/skills.rs:10` 与 `mcps.rs:14`，scan 不返回 trash 子目录里的条目）
- 条件 3 通过"scan 不包含 trash"已经隐式排除（trash 物理在 `~/.ensemble/trash/` 子目录）

**等价于：客户端"已装" = `skills.find(s => s.name === marketplaceItem.name)` 命中** — Marketplace store 不需要查 `trashedItems`、不需要查 `data.json`。

### 6.2 同名碰撞判定

§5.6 三选项 Modal 触发条件：
- `useSkillsStore.skills.find(s => s.name === name)` 命中 → "本地已存在"
- `useTrashStore.trashedItems?.skills.find(s => s.name === name)` 命中 → "Trash 中存在"
- 两者并存 → 三选项 Modal；只有 Trash → 三选项 + 默认 Restore；只有本地 → 二选项

**注意**：`trashedItems` 默认未加载 — `loadTrashedItems` 只在 Trash 页面入口或用户主动 `useTrashStore.loadTrashedItems()` 时才执行。Marketplace install 流程**必须在判定前主动 ensure-load**：
```ts
if (!useTrashStore.getState().trashedItems) await useTrashStore.getState().loadTrashedItems();
```
否则首次安装时 `trashedItems` 为 null，会误把 Trash 中存在的视为不存在，导致直接 Replace 走 Trash 第二次。

---

## 7. 跨页面状态同步现状（R1-P0-5 失败态绑定参考）

### 7.1 现有"全局 state 跨页"模式

无统一 event bus。同步靠两条路径：
1. **共享 zustand store** — 任何 page 调 `useSkillsStore` 看到同一份 skills；mutation 后所有订阅者 re-render
2. **手动 reload 触发** — 一个 store 的写操作完成后调另一 store 的 `loadX()`，例：`importStore.importSkills` 完成后 `await useSkillsStore.getState().loadSkills()`（`src/stores/importStore.ts:368`）

无 React Query / SWR / 服务端事件流；都是命令式拉取。

### 7.2 R1-P0-5 "失败态绑定到资源 entry 而非视图位置"

**当前没有这种绑定**。所有 store 的 `error: string | null` 是**全局唯一字段**，UI 显示 = 顶部 banner（如 `src/pages/SkillsPage.tsx:732-742`：`{error && <div>{error}<button>Dismiss</button></div>}`）。`mcpsStore.mcpFetchErrors: Record<string, string>` 是 R-impl 仅有的"per-resource error"前例（`src/stores/mcpsStore.ts:34, 79`）。

**marketplace 失败态绑定的实现路径** = 镜像 `mcpFetchErrors` 模式，在 marketplace store 中加：
```ts
installFailedItems: Record<string, { error: string; attemptedAt: string }>;
```
key 为资源 stable id（owner/repo/skill-name 三元组哈希或上游 itemId）。failure 后写入；用户切去其他页再回来读 store 仍有此态；`Retry` 时清除该 key。**这是 R1-P0-5 的客户端契约直接落点**。

### 7.3 跨 store 触发约定

`importStore` → `skillsStore.loadSkills()`（`src/stores/importStore.ts:368, 426`）
`pluginsStore.importPluginSkills` → `skillsStore.loadSkills()`（`src/stores/pluginsStore.ts:237`）
`pluginsStore.importPluginMcps` → `mcpsStore.loadMcps()`（`src/stores/pluginsStore.ts:278`）

**marketplace store 必须延续此约定**：install 成功后立即 `loadSkills` / `loadMcps`，否则 Skills 页和 Marketplace 页之间状态不一致。

### 7.4 Settings 页的"全量重新扫"

`src/pages/SettingsPage.tsx:213-228`：用户改设置（路径等）后调 `loadSkills + loadMcps + loadClaudeMdFiles` 全量重新扫。这是**目前唯一显式承认"数据漂移可能性"并主动同步**的页面。

---

## 8. plugin 来源在前端的处理（grep 全部 callsite）

### 8.1 `installSource === 'plugin'` 共 11 处（已在 §2.4 列出）

### 8.2 `pluginId` 业务用途

- 删除时清理 import record：`src/stores/skillsStore.ts:131-136`、`mcpsStore.ts:124-129`
- Scene 创建模态过滤 disabled plugins：`src/components/scenes/CreateSceneModal.tsx:421-435`（`pluginEnabledStatus[skill.pluginId] === true`）
- ImportSkillsModal/ImportMcpModal 的勾选 key：`src/components/modals/ImportSkillsModal.tsx:106-170`、`ImportMcpModal.tsx:117-180`

### 8.3 `pluginEnabled` runtime status

`pluginsStore.pluginEnabledStatus: Record<string, boolean>`（`src/stores/pluginsStore.ts:36, 105`）— 由 `loadInstalledPlugins`（`src/stores/pluginsStore.ts:128-134`）和 `refreshPluginEnabledStatus`（`src/stores/pluginsStore.ts:294-320`）填。Skill/Mcp 上的 `pluginEnabled` 字段在 UI 多数时候用 `pluginEnabledStatus[skill.pluginId]` 读（不读 skill 实例字段）— 因为字段不持久化，scan 时填一次就过期。**marketplace 资源永不读这个 map**。

### 8.4 plugin 沉底排序的精确语义

`src/stores/skillsStore.ts:469-478`:
```ts
filtered.sort((a, b) => {
  const aIsPlugin = a.installSource === 'plugin';
  const bIsPlugin = b.installSource === 'plugin';
  if (aIsPlugin === bIsPlugin) return a.name.localeCompare(b.name);
  return aIsPlugin ? 1 : -1;
});
```
**关键**：这段保持不动后，`installSource === 'marketplace'` 自动归入"非 plugin"分支（`aIsPlugin === false`），与 `'local'` 同级 alphabetic — 与 D-9（marketplace 与 local 平等）天然一致，**不需要修改这段排序**。

---

## 9. 加 Scene 客户端流程（短链引导参考）

### 9.1 主要入口

唯一入口 = `CreateSceneModal`（`src/components/scenes/CreateSceneModal.tsx`），通过 `ScenesPage` 的 New 按钮或 SceneListItem 的 Edit 触发（`isEditMode` 切换）。**没有"在 Skill/Mcp 详情中直接 add to Scene"的 UI**。

### 9.2 add to Scene 的 IPC 形态

不存在 `addSkillToScene` 类原子 IPC。Scene 的 skill/mcp 列表是 `Scene.skillIds` / `Scene.mcpIds: string[]`，更新通过 `updateScene(id, { skillIds, mcpIds })`：
- 客户端：`src/stores/scenesStore.ts:193-211` `updateScene` action
- 后端 IPC: `update_scene` 接受任意字段更新

§5.5.1 short-cut "Add to active Scene →"的客户端实现路径：
1. 找到 active scene（PRD 未定义"active"概念 — 候选：最近 sync 的 / sidebar 高亮的 / 用户手动标记的；本调研不裁决）
2. 拿当前 scene 的 `skillIds` / `mcpIds`
3. 调 `updateScene(activeSceneId, { skillIds: [...skillIds, newId] })`（或 mcpIds）
4. UI feedback：跳到 ScenesPage + 高亮该 scene（`useScenesStore.selectScene(activeSceneId)` 已存在）

**注意命名**：Scene 内含的资源 id = `Skill.id`（即 `sourcePath`），与 marketplace 上游的 itemId 是不同 namespace。Add to Scene 必须用"已装后的 Skill.id"（即 `~/.ensemble/skills/<name>/SKILL.md` 的路径），**不是上游 marketplace itemId**。

### 9.3 Scenes 列表的 "View in Skills →" 路径（[5.5.1] 短链）

跳转到 Skills 页 + 选中该项 = router 跳转 `/skills` + 用 location state 传 selectedId 或在 `useSkillsStore.selectSkill(id)` 然后 navigate。前端**没有 selectSkill 接口**，但有 `selectedSkillId` state（`src/pages/SkillsPage.tsx:219`）— 这是 page-local state，不在 store。Marketplace short-cut 需要把 selectedId 提升到 `skillsStore.selectedSkillId`（已在 store 接口里：`src/stores/skillsStore.ts:53`，名为 `selectSkill: (id) => set({ selectedSkillId: id })`）— 但 `SkillsPage` 当前用自己的 useState 而不是 store 字段（`src/pages/SkillsPage.tsx:219`）。**这是隐藏的实施风险**：要么 marketplace 短链改成 navigate + URL query param + page 内读 query，要么把 SkillsPage 的 selectedSkillId 真正 hoist 到 store。

---

## 10. 给下游的扩展点清单（marketplaceStore 设计 / SSoT 客户端镜像 / 跨页面同步契约）

### 10.1 `installSource` 三态扩展点（最小改动包）

- `src/types/index.ts:32` `Skill.installSource?: 'local' | 'plugin' | 'marketplace'`
- `src/types/index.ts:70` `McpServer.installSource?: 'local' | 'plugin' | 'marketplace'`
- `src/types/index.ts:2` 死的 `InstallSource` alias 删除（或重写为同三态）
- Rust `src-tauri/src/types.rs:34, 81, 347` 三处 `install_source: Option<String>` 注释更新（值仍是 String，不影响序列化）
- 11 处 `=== 'plugin'` callsite **不需要改**（marketplace 走默认分支即正确）
- 排序沉底逻辑 `skillsStore.ts:469-478` / `mcpsStore.ts:503-513` **不需要改**（aIsPlugin 单条件，marketplace 天然与 local 同级）
- Plugin badge 渲染 `SkillListItem.tsx:171-178` / `McpListItem.tsx` **不需要改**（仅 plugin 走 isPluginSource 分支）

### 10.2 marketplaceStore 接口契约（建议形态，spec 决定细节）

下游 spec 应定义的最小接口：
```ts
interface MarketplaceState {
  // 数据
  skillsCatalog: MarketplaceSkillItem[];      // upstream skills.sh
  mcpsCatalog: MarketplaceMcpItem[];          // upstream MCP Registry
  lastSyncedSkills?: string;                   // ISO，§5.7 "Last synced X ago"
  lastSyncedMcps?: string;
  filter: { search, category, tags, sort: 'popularity' | 'alphabet' | 'updated' };

  // 状态
  isLoadingSkills, isLoadingMcps,
  upstreamErrorSkills, upstreamErrorMcps: string | null,    // EmptyState 触发
  installingItemIds: Set<string>,                            // R3-P0-2 按钮态
  installFailedItems: Record<string, { error, attemptedAt }>, // R1-P0-5 持久化失败态
  classifyingItemIds: Set<string>,                           // 单项 auto-classify
  classifyFailedItemIds: Set<string>,                        // R1-P0-4 inline 提示

  // 选择
  selectedItemId: string | null,

  // Actions
  loadSkillsCatalog(refresh?: boolean): Promise<void>,        // 24h 缓存内不发请求
  loadMcpsCatalog(refresh?: boolean): Promise<void>,
  installSkill(item: MarketplaceSkillItem, conflictAction?): Promise<InstallOutcome>,
  installMcp(item: MarketplaceMcpItem, conflictAction?): Promise<InstallOutcome>,
  // 内含：1) 后端 install IPC  2) loadSkills/loadMcps  3) auto-classify 单项  4) 跨 store reload

  // Computed
  isInstalledSkill(item): boolean,        // 通过 useSkillsStore selector 派生（SSoT 客户端镜像）
  isInstalledMcp(item): boolean,
}
```

**SSoT 客户端镜像的位置**：`isInstalled*` selectors **必须从 `useSkillsStore.skills` 派生**（避免在 marketplaceStore 自己保存 installedSet 后又与 skillsStore 漂移）。selector 例：
```ts
isInstalledSkill: (item) => {
  const skills = useSkillsStore.getState().skills;
  // 上游 item 的 stable identity 当前是 owner/repo/skill-name；本地 Skill.id = sourcePath
  return skills.some(s => s.name === item.name);  // V1 简化：靠 name 匹配
}
```

**name 匹配的脆弱性**：marketplace 上游 itemName 与本地 `Skill.name`（来自 SKILL.md frontmatter）可能存在大小写 / 空格差异。Spec 必须明确 normalization 规则；R-1 P0 同名碰撞精确判定也需此规则。

### 10.3 IPC 待新增 / 已有清单

**已有可复用**：
- `auto_classify` — 传单元素数组即可（§5.2）
- `read_app_data` / `write_app_data` — 持久化 marketplace cache 字段（如选择走 AppData 而非新文件）
- `restore_skill` / `restore_mcp` — Trash 恢复
- `update_skill_metadata` / `update_mcp_metadata` — 写 metadata（marketplace metadata 字段若新增需同步扩展）
- `get_categories` / `get_tags` — 读现有 cat/tag

**必须新增**（Phase A 调研 R3 应给出后端契约）：
- `install_marketplace_skill(item: MarketplaceSkillItem)` — 写 `~/.ensemble/skills/<name>/`
- `install_marketplace_mcp(item: MarketplaceMcpItem, configOverride?)` — 写 `~/.ensemble/mcps/<name>.json`
- `fetch_skills_marketplace(refresh: bool)` — 拉上游 + 24h 缓存
- `fetch_mcps_marketplace(refresh: bool)` — 同上
- `replace_existing_skill(item, oldSkillId)` — §5.6 "Replace existing"原子化（旧版进 Trash + 装新版 + metadata 继承）
- `restore_and_install_skill(trashPath, item)` — §5.6 "Restore from Trash" 路径

### 10.4 跨页面同步契约（marketplace 与现有页面的关系）

**强契约**：
1. install 成功 → marketplace store 必须调用 `useSkillsStore.getState().loadSkills()`（或 `loadMcps`），否则 SSoT 不同步、Skills 页看不到新装项
2. install 失败态 → 写 `installFailedItems[itemId]`；列表 UI 与详情按钮均订阅此 map（不写在 page-local state）— 满足 R1-P0-5
3. delete 资源 → 由 `useSkillsStore.deleteSkill(id)` 完成；marketplace selectors 自动从已订阅的 `useSkillsStore.skills` 派生新值，无需主动 invalidate marketplace store
4. Trash restore → `useTrashStore.restoreSkill(path)` 完成 → marketplace store 主动 `useSkillsStore.loadSkills()` ensure SSoT 同步
5. SettingsPage 改 `skillSourceDir` → 现有 SettingsPage 调 `loadSkills + loadMcps`（`src/pages/SettingsPage.tsx:213-228`）— marketplace 24h 缓存的本地存放路径若依赖此 dir 也要 invalidate

**弱契约**（可选）：
- marketplace 列表项的 hover / 详情打开**不主动 reload**（不主动触发 24h 缓存击穿）
- Refresh 按钮独立触发刷新（不 link 到 sidebar Header 的 Refresh — sidebar 那个是"app 全量数据"，marketplace 是"上游目录"，两者隔离）

### 10.5 视觉资源（动效 / Empty / Loading / Error）

- **EmptyState**: `src/components/common/EmptyState.tsx:1-58` 接 `{ icon, title, description?, action? }` — marketplace 离线 EmptyState 直接用，参 `src/pages/SkillsPage.tsx:754-762` 的实例。WifiOff icon 选 `lucide-react` 同库的 `WifiOff`。
- **错误条**: 沿用 `SkillsPage.tsx:732-742` 的红色顶部条形态 — 全局 error；marketplace 须避免与 install 失败态重叠（PRD R-37：详情面板停留时不显示 banner，关闭后才显示）。
- **Loading**: `Loader2` from lucide + `animate-spin`（`src/pages/SkillsPage.tsx:691`）；按钮 loading prop `Button` 内置（`src/components/common/Button.tsx:85`）。
- **Auto-Classify 动效**: `src/index.css:494-575` 的 className（`ai-spinner` / `ai-classifying` / `classify-success-bg` / `classify-fading-out` 等）已就绪 — marketplace 单项触发只需把作用域绑到 row 而非 page 顶部 button。
- **Refresh 按钮**: 沿用 `RotateCw` / `RefreshCw` icon + Button secondary variant（`src/pages/McpServersPage.tsx:19, 552`）。
- **Last synced 文案**: 当前没有此组件；marketplace 新增时位于 PageHeader actions 槽外侧或上方（spec 阶段决定）。

---

**End of R4. 文件长度 ~520 行。Referential 调研产物，无设计判断。**
