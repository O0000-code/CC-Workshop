# R7 — UI 视觉层 / 交互 / 错误反馈 / 大数据量 Findings

Scope:Expert A Angle 6 + Expert B Angle 6 中**非 IPC 契约**的 UI 层 — 即"用户看见和操作"的层。R3 已扫 IPC 契约(F1-F11),本 reviewer 不重复,只填补 R3 漏的 UI 表现 + 错误反馈链路 + 大数据 / 交互细节。

阅读了:`pages/*.tsx` 12 个、`stores/*.ts` 11 个、`components/{skills,mcps,modals,common,marketplace,sidebar}/*.tsx`、`utils/tauri.ts`、`MarkdownBody.tsx`、`Modal.tsx`、`ErrorBoundary.tsx`。

---

## 复核结果(对 02_known_risk_surfaces.md 中归 UI 层负责的 candidates)

无单独"归 R7 的 candidate"。主 Agent 的 surface list 中 **B1 (scan_skills 硬编码 scope="user")** 涉及到 UI 显示的下游效应:Skill 详情面板的 scope 切换器始终显示同一值。

### B1 复核 — Skill scope 字段在 UI 的下游表现 — Confirmed P1

- 主 Agent 已查清根因(`skills.rs:257` 硬编码 "user")。UI 表现:`SkillDetailPanel.tsx:594` 和 `SkillsPage.tsx:874` 的 `<ScopeSelector value={selectedSkill.scope} ...>` 永远传入相同值
- **User does**: 用户在 Skills 详情面板 toggle scope `global ↔ project`
- **User sees**: 点击后 UI 显示新 scope(因为 `optimistic update` 在 `skillsStore.updateSkillScope:298-300`)。但调用完 backend 后,`get().loadSkills()` 重新拉取 → backend 返回 `scope: "user"` → UI **回退到 "user"**。但 ScopeSelector 的 prop 是字符串映射 `'global' | 'project'`,backend 返回 `"user"` → ScopeSelector 的判断逻辑(R7 verify 下面)
- **User does NOT see**: 没有任何 toast 或提示说"scope 切换实际状态由文件系统决定"

verify: `src/components/common/ScopeSelector.tsx` 接收 `value: 'global' | 'project'`,backend 返回 "user" → TypeScript runtime 不会报错,但 ScopeSelector 内部的 `value === 'global'` / `value === 'project'` 比较全 false → 哪个 toggle 状态也不亮。整个 toggle 看起来"无状态"。

修复时机:跟 B1 主 fix 一起,不单独 finding。

---

## 新发现

### F7-1. SkillsPage / McpServersPage 删除当前选中项时 SlidePanel 残留打开

- **置信度**: High
- **严重度**: P1
- **代码位置**:
  - `src/pages/SkillsPage.tsx:448`(local `selectedSkillId` useState)、`:538-540`(`handleDelete` 不重置)、`:1084`(`isOpen={!!selectedSkillId}`)
  - `src/pages/McpServersPage.tsx:343` 同款 local state、handleDelete + SlidePanel isOpen 同款
  - `src/components/skills/SkillDetailPanel.tsx:349-355` 用 `selectedSkill` null 时 render 空 SlidePanel(CategoryPage 路径同款)
- **触发条件 (User does X)**:
  1. 用户在 Skills 主页选中 Skill A → 右侧 detail panel 打开
  2. 用户在主列表上的 Skill A 卡片点击 dropdown → "Delete"
- **用户可见后果 (User sees Y)**: Skill A 从列表消失,但 **右侧 detail panel 仍然占据 800px 屏宽,显示空白(header / content 都为 null)**。Page 主区被 panel 推到左半边。
- **不可见后果**: 局部 `selectedSkillId` state 持续指向 'A',但 `selectedSkill` 在 `useMemo` 返回 null。任何依赖 `selectedSkillId` truthy 但 `selectedSkill` falsy 的逻辑路径都不一致。
- **根因**: page 用 **local useState** 维护 `selectedSkillId`,但 store 的 `deleteSkill`(`skillsStore:152`)只重置 **store 的** `selectedSkillId`,不知道 page 的 local state。`isOpen={!!selectedSkillId}` 用 local state 决定 SlidePanel 是否打开;`detailHeader` / `detailContent` 用 `selectedSkill = useMemo(skills.find(...))` 决定渲染内容;两者解耦后产生空 panel。
- **建议修复**: 三种选项,按 invasive 排序:
  1. **Safe**: `handleDelete` 内同时调用 `setSelectedSkillId(null)`(显式联动)
  2. **Safe**: 改 `isOpen={!!selectedSkill}` 让"是否打开"和"是否有数据"用同一信号
  3. **Medium**: 弃用 page local state,改用 store 的 selectedSkillId(但 marketplace deep link `?selected=` 流程要并轨,工作量大)。推荐 #1 + #2 双保险。
- **修复保守度**: Safe
- **复核状态**: self-confirmed(读了 SkillsPage / McpServersPage / SkillDetailPanel / skillsStore.deleteSkill 的全部对应代码段)

---

### F7-2. Modal.tsx 无 focus trap / 无 `role="dialog"` / 无 `aria-modal` — 全部 8 个 modal 受影响

- **置信度**: High
- **严重度**: P1
- **代码位置**: `src/components/common/Modal.tsx`(全文 103 行,没有任何 a11y 属性、focus trap、initial focus 管理);`src/components/modals/{ImportSkillsModal,ImportMcpModal,ImportClaudeMdModal,ImportRuleModal,ScanClaudeMdModal,ScanRuleModal,TrashRecoveryModal}.tsx`(全部直接渲染 modal-class portal, 同样无 a11y);`src/components/scenes/CreateSceneModal.tsx`(也无)
- **触发条件 (User does X)**:
  1. 用户打开任一 Modal(例 ImportSkillsModal)
  2. 按 Tab 多次循环
- **用户可见后果 (User sees Y)**: 焦点会**走出 modal 的可见 DOM 子树**到背景的 Sidebar / 主区列表 / 当前激活的页面元素 — 用户看不出焦点在哪。Tab 一直按下去,焦点跑遍整个页面。屏幕阅读器不会播报"对话框",用户(尤其依赖 a11y)分不清当前 modal 和背景。
- **不可见后果**: VoiceOver / 屏幕阅读器把 modal 当作普通 page content,完全失去对话框语义。
- **根因**: Modal.tsx 实现包括: Escape ✓、bg 滚动锁 ✓、overlay click 关闭 ✓ — 但缺**最基本的两条**:`role="dialog"` + `aria-modal="true"` 都没有;没有 focusTrap(没 trap-focus 库,也没手写 sentinel)。`aria-label="Close modal"` 只在关闭按钮上,根容器没 `aria-labelledby` 指向 `title`。
- **建议修复 (Safe)**: 三步,都改一处文件:
  1. 在 dialog div 上加 `role="dialog" aria-modal="true" aria-labelledby={titleId}`,给 title h2 加 id
  2. 在 useEffect open 时:`dialogRef.current?.focus()`(配合 `tabIndex={-1}`)实现 initial focus
  3. 加 focus-trap:cheapest 写法 — 在 dialog 内首尾插不可见 `<div tabIndex={0} onFocus={() => loopBack}>` sentinel;成本 ~30 行。或直接用 `focus-trap-react` (~3KB)。
- **修复保守度**: Safe(纯 a11y 增量,无功能变更)
- **复核状态**: self-confirmed(grep 整个 src/ 找不到任何 `role="dialog"` 或 `aria-modal`)

---

### F7-3. Project sync handleSceneChange / clearProjectConfig / syncProject 串联失败仅 `console.error`,UI 完全无反馈

- **置信度**: High
- **严重度**: P1
- **代码位置**:
  - `src/pages/ProjectsPage.tsx:113-130` `handleSceneChange`
  - `src/stores/projectsStore.ts:227-269` `syncProject`(四段串联 `safeInvoke`)
- **触发条件 (User does X)**:
  1. 用户在 Projects page 选某 project 详情,点击"Change Scene"切到另一个 Scene
  2. 任一步失败 — 比如 `.claude/skills/` 目录权限不足(symlink 失败),或 distribute_scene_rules 写入失败
- **用户可见后果 (User sees Y)**: **什么都看不见**。无 toast、无 alert、无 inline error。Detail panel 上的 scene name 已经改为新 scene(因为 `updateProject` 在第 2 步执行),但 lastSynced 未更新,project 处于"被声称切换但实际是半套配置"的状态。控制台有 `Failed to change scene: ...` 但用户看不到。
- **不可见后果**:
  - `<project>/.claude/skills/` 可能有部分新 scene 的 symlink + 旧 scene 的残留(`clear_project_config` step 1 完成、`sync_project_config` step 3 半完成)
  - `<project>/CLAUDE.md` 可能是旧 scene 的、新 scene 的、或被覆盖到 backup 然后没接续(取决于失败点)
- **根因**: `handleSceneChange` 用 `try { ... } catch (error) { console.error('Failed to change scene:', error); }` —— 不设 store error,不弹 toast,不更新 UI。`syncProject` store 内 line 266 `set({ error: String(error), ... })`,但 `ProjectsPage` 不读 store 的 error 字段。
- **建议修复 (Safe)**: 在 `handleSceneChange` catch 块内调用一个 toast / Sticky banner / setError-style hook,把失败原因展示给用户;或至少在 ProjectsPage 里挂一个 `{error && <ErrorBanner />}` 显示 `projectsStore.error`(同款 SkillsPage:986 风格)。
- **修复保守度**: Safe
- **复核状态**: self-confirmed

---

### F7-4. TrashRecoveryModal 缺 Rules tab — 删除的 Rule 用户无法 restore

- **置信度**: High
- **严重度**: P1
- **代码位置**:
  - `src/components/modals/TrashRecoveryModal.tsx:8` `type TabType = 'skills' | 'mcps' | 'claudemd';`(只 3 个 tab,无 'rules')
  - `src-tauri/src/commands/trash.rs:128` backend `rules: Vec<TrashedRule>` 已收集
  - `src-tauri/src/commands/trash.rs:541` `restore_rule` IPC 已注册
  - `src-tauri/src/types.rs:1302/1320` `TrashedRule` / `TrashedItems::rules` 已定义
- **触发条件 (User does X)**:
  1. 用户在 Rules page 删除一个 Rule(进 trash,backend 把磁盘文件移到 `~/.ensemble/trash/rules/`,在 data.json `trashed_rules` 加记录)
  2. 用户点击 sidebar 的 "Trash" / 任何打开 TrashRecoveryModal 的入口
- **用户可见后果 (User sees Y)**: Modal 展示 Skills / MCPs / CLAUDE.md 三个 tab,**没有 Rules tab**。被删除的 Rule 不可见、不可恢复。
- **不可见后果**: 用户必须手动从 `~/.ensemble/trash/rules/` 拷文件 + 编辑 `~/.ensemble/data.json` 才能恢复 — 普通用户不会做。Rule 长期堆积在 trash 目录(R5 范围:Trash 累积也归 R5,但 UI 层"看不到 Rules"是 R7)。
- **根因**: Modal 写 3-tab 时 Rules feature 还没 ship;Rules feature ship 后没回头加 tab。`trashStore` 也只 load skills/mcps/claudemd 列表(verify `src/stores/trashStore.ts:46-52` 用的 `loadTrashedItems` IPC `list_trashed_items` 返回的是 `TrashedItems` 全部 4 类,只是 UI 不渲染 rules 这一类)。
- **建议修复 (Medium)**: 加第 4 个 tab "Rules",mirror claudemd tab 的 list + checkbox + restore 逻辑;trashStore 可能需要加 `restoreRule` action(verify 是否已有 — `src/stores/trashStore.ts` 中现在没 `restoreRule`,需加)。
- **修复保守度**: Medium(纯加功能,无既有路径变更)
- **复核状态**: self-confirmed

---

### F7-5. importStore.importMcps 用 `skillSourceDir.replace('/skills', '')` 推导 ensembleDir — 自定义路径下 MCP 写错位置

- **置信度**: High
- **严重度**: P1
- **代码位置**: `src/stores/importStore.ts:394-395`
  ```ts
  const { claudeConfigDir, skillSourceDir } = useSettingsStore.getState();
  const ensembleDir = skillSourceDir.replace('/skills', '');
  ```
- **触发条件 (User does X)**:
  1. 用户在 Settings page 把 `mcpSourceDir` 自定义到非默认路径(例 `/Volumes/External/ensemble-mcps`),保持 `skillSourceDir` 默认 `~/.ensemble/skills`
  2. 用户打开 ImportMcpModal 导入 MCP
- **用户可见后果 (User sees Y)**: Import 完成、Modal 关闭、列表里出现新 MCP — 看起来一切正常
- **不可见后果**: MCP 的 JSON 实际上**写在 `~/.ensemble/mcps/`**(从 skillSourceDir 推导出来的 ensembleDir),而不是用户自定义的 `/Volumes/External/ensemble-mcps`。`mcpsStore.loadMcps` 用的是 `mcpSourceDir`(verify settingsStore:111),所以下次启动用户配置的 mcpSourceDir 路径不会显示新导入的 MCP — 用户以为 MCP 没了。同时 `~/.ensemble/mcps/` 多出文件用户不知道。
- **根因**: 一致性 / copy-paste — `importSkills` 用 `skillSourceDir.replace('/skills', '')`(正确,因为 skill 数据本就读 skillSourceDir);`importMcps` 把整段代码复制过来没改用 `mcpSourceDir`。在默认情况下两者都 `~/.ensemble/`,所以测试时不暴露。
- **建议修复 (Safe)**:
  ```ts
  const { claudeConfigDir, mcpSourceDir } = useSettingsStore.getState();
  const ensembleDir = mcpSourceDir.replace('/mcps', '');
  ```
- **修复保守度**: Safe
- **复核状态**: self-confirmed

---

### F7-6. addCategory / addTag / addScene 三处入口完全无重名去重,前端后端都允许

- **置信度**: High
- **严重度**: P1
- **代码位置**:
  - frontend: `src/components/layout/MainLayout.tsx:461`(handleCategorySave 直接 `addCategory(name, '#A1A1AA')`)、`:579`(handleTagSave 直接 `addTag(name)`)、`src/components/scenes/CreateSceneModal.tsx:793-795`
  - backend: `src-tauri/src/commands/data.rs:405-438`(`add_category` 直接 push)、`:820-834`(`add_tag` 直接 push)、`:956-990`(`add_scene` 直接 push)
- **触发条件 (User does X)**:
  1. 用户在 sidebar 新建 category "Development"
  2. 不切走,再次点击"+"输入 "Development"
- **用户可见后果 (User sees Y)**: Sidebar 出现**两个同名 category**,都显示 "Development",同一灰色 color dot。鼠标 hover / 点击进入 `/category/<id>` 时两条 url 不同(uuid),但 sidebar 上视觉无差。点击进入第一个 vs 第二个看到的内容也不同(各自 metadata)。
- **不可见后果**: data.json 里两条 record,uuid 不同;后续 `delete_category` 时通过 id 区分但用户不知 id;Skill 上 `category: 'Development'`(legacy 字段)分不清属于哪条;`categoryId` 字段(canonical)指明具体一条。
- **根因**: 无去重逻辑。`CategoryInlineInput.tsx:46-50` 只 `value.trim()`,不查现有列表;backend `add_category` 也 push 而不查。Tag 同款。Scene 同款。
- **建议修复 (Safe)**:
  - frontend: `handleCategorySave` / `handleTagSave` / CreateSceneModal `handleSave` 入口处检查 `categories.find(c => c.name.toLowerCase() === name.toLowerCase() && c.parentId === parentId)`,若已存在则: (a) toast "已存在同名分类" 阻止创建,或 (b) silently switch 到那条
  - 优先 (a)。backend 防御性也加,但 UI 拦在前端已经足够防误操作。
- **修复保守度**: Safe(前端不破现有数据 / 后端可选)
- **复核状态**: self-confirmed(三处都读了)

---

### F7-7. 所有 Enter-key 短捷在 IME composition 时误触发(中文输入法用户)

- **置信度**: High
- **严重度**: P1(对中文 / 日文 / 韩文输入用户;英文用户无感)
- **代码位置**: 19 处用 `e.key === 'Enter'`,无一处检查 `e.nativeEvent.isComposing` 或 `keyCode === 229`。代表性:
  - `src/components/sidebar/CategoryInlineInput.tsx:47`
  - `src/components/sidebar/TagInlineInput.tsx:43`
  - `src/components/mcps/McpDetailPanel.tsx:270-273` (tag input)
  - `src/components/scenes/CreateSceneModal.tsx`(名字输入)
  - `src/pages/SkillsPage.tsx:619`(tag input)
  - `src/components/common/ColorPicker.tsx:165`(hex input)
- **触发条件 (User does X)**:
  1. 用户在 sidebar 点击 "Add Category" 输入框
  2. 切到拼音输入法,打字 "fenlei"(分类)
  3. 弹出候选词列表,按 **Enter 选词**(IME 标准行为)
- **用户可见后果 (User sees Y)**: 一按 Enter — **分类立刻被创建为 "fenlei"**(未转码的拼音),输入框关闭。用户预期是"确认中文",得到的是"提交创建"。
- **不可见后果**: 一条乱码 category 进 data.json,用户必须手动编辑或删除。
- **根因**: 整个 codebase grep 不到 `isComposing` 任何 reference。所有 inline input / modal text input 的 Enter 处理都没 IME 守卫。
- **建议修复 (Safe)**: 在每个 `handleKeyDown` 加守卫:
  ```ts
  if (e.key === 'Enter' && !e.nativeEvent.isComposing) { ... }
  // or
  if (e.key === 'Enter' && e.keyCode !== 229) { ... }
  ```
  推荐封装成共享 helper `function isEnterCommit(e: React.KeyboardEvent) {...}`。19 处都改。
- **修复保守度**: Safe(只过滤一种已知 bug 触发条件)
- **复核状态**: self-confirmed(grep 全 src/)

---

### F7-8. McpDetailPanel auto-fetch tools 缺 mcpType + mcpFetchErrors 守卫 — HTTP MCP / 已失败 MCP 每次打开都触发 fetch

- **置信度**: High
- **严重度**: P2(功能不破,但带 transient UI loading flicker + 浪费 IPC)
- **代码位置**:
  - `src/components/mcps/McpDetailPanel.tsx:197-206` 守卫只有 `isOpen + selectedMcp + 空 providedTools + 未在 fetching`
  - `src/pages/McpServersPage.tsx:425-435` 同一逻辑的 inline 实现**多了 2 个守卫**:`mcpType !== 'http'` + `!mcpFetchErrors[selectedMcp.id]`
- **触发条件 (User does X)**:
  1. 用户在 CategoryPage 进入分类 → 点 HTTP MCP 的卡片打开 McpDetailPanel
- **用户可见后果 (User sees Y)**: Detail panel header 闪一下 "fetching..." 状态,然后变回 "No tools available"。`mcpsStore.fetchMcpTools` 第 297 行短路 HTTP MCP 直接返回 error,但 UI 闪一下 loading 状态。每次重新打开都触发。
- **不可见后果**: 已失败的 MCP(`mcpFetchErrors[id]` 已记录失败),每次打开 detail 都重试,产生 IPC 噪音 + console 噪音。
- **根因**: SkillsPage/McpServersPage 主页 inline detail 是更新过的版本(加了守卫),`McpDetailPanel`(CategoryPage / TagPage 用)是旧版没同步 — 典型的 CLAUDE.md 易错点 #5"双实现并存,改一处别忘另一处"。
- **建议修复 (Safe)**: 把 `McpDetailPanel:197-206` 的守卫表达式同步成 `McpServersPage:426-431` 那样的 5 个条件 AND,加 `mcpFetchErrors` 到 hook 依赖列表。
- **修复保守度**: Safe
- **复核状态**: self-confirmed

---

### F7-9. ColorPicker / IconPicker / Dropdown 的 Escape handler 不 stopPropagation — 嵌套在 Modal 内时按 Esc 同时关闭两层

- **置信度**: High
- **严重度**: P2
- **代码位置**:
  - `src/components/common/ColorPicker.tsx:130-134`
  - `src/components/common/IconPicker.tsx:614-619`
  - `src/components/common/Dropdown.tsx:130-137`
  - 三处都 `document.addEventListener('keydown', ...)` 监听 Esc,但 handler 内只 `setIsOpen(false)`,没 `event.stopPropagation()`,**也不能 stop**(因为 listener 是 document-level)。`Modal.tsx:30-37` 同样 document-level 监听 Esc → 两个 handler 都触发 → 都关闭。
- **触发条件 (User does X)**:
  1. 用户打开 ImportSkillsModal(任一 modal)
  2. 在 modal 内点 ColorPicker 弹出色板(假想的 ColorPicker 嵌套在 modal — 实际项目中 CategoryInlineInput 的 ColorPicker 不在 modal,但 IconPicker 在 ScenesPage / CreateSceneModal 内)
  3. 按 Escape
- **用户可见后果 (User sees Y)**: 既关闭 ColorPicker **又关闭 Modal**。用户预期是"先关 ColorPicker,Modal 留着"。
- **不可见后果**: 用户在 Modal 里填了一半的表单数据 — Modal 关闭就丢了。
- **根因**: document-level Escape 监听,两层都监听,内层未阻止冒泡(且 document-level listener 本来也没法阻止 sibling listener,需要用 capture 模式 + stopImmediatePropagation,或者改用元素级 onKeyDown 加 stopPropagation)。
- **建议修复 (Medium)**: 改用元素级 `onKeyDown` + `event.stopPropagation()`。或在最内层加 `event.stopImmediatePropagation()`(但要求 Modal 是后注册的 listener — 取决于注册顺序,脆弱)。最干净的修复:用一个 "modal stack" context 让最外层的 Escape 只关闭栈顶。但成本中等,需要重构 listener 架构。
- **修复保守度**: Medium(改善体验,但需要测试嵌套场景)
- **复核状态**: self-confirmed,但 trigger 场景需 lead-agent verify(实际项目中 IconPicker 嵌在 CreateSceneModal 内会被触发)

---

### F7-10. MarkdownBody 无 size limit / 无 useMemo / 无 lazy — 大 CLAUDE.md / Skill instructions 阻塞主线程

- **置信度**: High
- **严重度**: P2(典型用户的 SKILL.md 多在 10K 以内,但 CLAUDE.md 易增长到 50K)
- **代码位置**: `src/components/marketplace/MarkdownBody.tsx:162-171`
  ```ts
  export function MarkdownBody({ source, className }: MarkdownBodyProps) {
    if (!source || source.trim().length === 0) return null;
    return (
      <div className={className}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {source}
        </ReactMarkdown>
      </div>
    );
  }
  ```
  使用点 7 处,关键的两处:`SkillsPage.tsx:817`(Skill instructions)、`ClaudeMdDetailPanel.tsx:391`(CLAUDE.md content)。
- **触发条件 (User does X)**:
  1. 用户的 CLAUDE.md 文件较大(>30KB, 含很多 GFM 表格 / 代码块)
  2. 用户在 ClaudeMdPage 切换文件 — 比如快速点 detail 列表
- **用户可见后果 (User sees Y)**: 每次切换 detail panel,UI 卡顿 200-500ms;切换期间窗口拖动 / 滚动无响应。
- **不可见后果**: react-markdown 同步解析 + remark-gfm 解析全在主线程。每次 source prop 变化(父 component re-render 也会触发,即便内容相同)都重新 parse — 没 `useMemo`、没 `React.memo`。
- **根因**: `MarkdownBody` 是 functional component 无 memo;`<ReactMarkdown>` 接受 `children` 字符串没缓存。父组件如 SkillsPage 每次任何 state 变化都重新创建 JSX,导致重新 parse。
- **建议修复 (Safe)**:
  1. `export const MarkdownBody = React.memo(function MarkdownBody(...) {...})`
  2. 内部用 `const tree = useMemo(() => <ReactMarkdown ...>{source}</ReactMarkdown>, [source, className])` 缓存
  3. 可选:增加 `if (source.length > 100000) return <TruncatedNotice />` size guard
- **修复保守度**: Safe(memoization 不改语义)
- **复核状态**: self-confirmed for code shape,**performance 数据需 lead-agent 实测**(per measure-before-iterative-tuning Rule)。当前评定 P2 而非 P1 是因为 measurement 缺失。

---

### F7-11. appStore.error 永远不被 UI 渲染 — sidebar reorder / category / tag 操作失败用户毫无感知

- **置信度**: High
- **严重度**: P2
- **代码位置**:
  - `src/stores/appStore.ts:277, 307, 331, 356, 379, 401, 416, 793-817` — 多处 `set({ error: message })`(包括 setCategoryParent rollback、addCategory/deleteCategory、addTag/deleteTag)
  - 全 src/ 内 grep `useAppStore.*error` / `appStore.error` 只命中 test 文件 — **零 production UI 读取**
- **触发条件 (User does X)**:
  1. 用户拖动一个 category 到自己的子(造成 circular reference)— backend 验证 reject
  2. backend 返回 `HierarchyError` 字符串
- **用户可见后果 (User sees Y)**: Sidebar 看到 category 跳回原位置(rollback animation 正常),**没有任何提示告诉用户为什么失败**。用户重试时也不知道哪些位置是合法的。
- **不可见后果**: error message 写到 `appStore.error` 但没人显示。第二次操作再失败,error 被覆盖,前一次彻底丢失。
- **根因**: `appStore` 的 error 字段没有任何 consumer。其它 store(skillsStore, mcpsStore, claudeMdStore, rulesStore)都有 page 在主区显示 `{error && <div>{error}</div>}`,sidebar 没。
- **建议修复 (Safe)**: 在 sidebar 或全局 layout 内挂一个 toast 系统,订阅 `appStore.error` 显示;最小化方案是 `MainLayout` 内加 `{appError && <Banner />}` mirror SkillsPage 风格(虽然位置不理想)。
- **修复保守度**: Safe
- **复核状态**: self-confirmed

---

### F7-12. SceneDetailPage.tsx 死代码 498 行 — 维护成本 / 误导新开发者 / 增加 bundle

- **置信度**: High
- **严重度**: P2
- **代码位置**: `src/pages/SceneDetailPage.tsx`(全文 498 行)、`src/pages/index.ts:5` `export { default as SceneDetailPage } from './SceneDetailPage';`
- **触发条件 / 用户可见后果**: 用户不会触发(没路由)。但开发者会:任何新加入的 SubAgent 或 maintainer 第一次进 `src/pages/` 会看到 `SceneDetailPage` 这个 498 行文件,正确推断"应该是 scene detail 用的",**改这里的代码不会有任何效果**(同款 spec 在文件头 line 1-3 已 comment 警告)。
- **不可见后果**:
  - **R3 已 flag F4 但只说"零 import"**,R7 进一步 verify:`grep -rn 'SceneDetail' src/` 仅命中自身 + index.ts 导出。无 `<SceneDetailPage>` JSX 使用,App.tsx 路由表 line 25-35 无 `scene-detail` 或类似 path
  - 文件内 `mockProjects` 数组(line 73-79)硬编码 `sceneId: 'scene-1'` 等 fake id,显示这是 V0 prototype 代码遗留
  - 引用了 `IconPicker` / `ListDetailLayout` / `SceneItem` / `CreateSceneModal` 等其他组件,删它们 import 计数会下降,可能触发 dead-code elimination
  - bundle 体积:498 行 + 全部 lucide icon import,估算 +5-10 KB gzipped
- **根因**: 历史遗留 — 早期可能用过 `/scenes/:id` route,后改用 ScenesPage + SlidePanel 而忘清理
- **建议修复 (Safe)**: 直接 `rm src/pages/SceneDetailPage.tsx`,同步删 `src/pages/index.ts:5` 这一行。如果担心未来需要,git 历史可恢复(`replace-installed-app-in-place` Rule 同理"靠 git 不靠本地保留")。
- **修复保守度**: Safe(零 consumer,git 可回滚)
- **复核状态**: self-confirmed

---

### F7-13. CategoryInlineInput / 所有文本输入都无 maxLength / 无字符过滤 — 5000 字 name 直接写库

- **置信度**: High
- **严重度**: P2
- **代码位置**:
  - `src/components/sidebar/CategoryInlineInput.tsx:76-86` `<input type="text">` 无 `maxLength`
  - `src/components/sidebar/TagInlineInput.tsx` 同款
  - `src/components/scenes/CreateSceneModal.tsx` Scene 名输入同款
  - backend `add_category` / `add_tag` / `add_scene` 接收 `String` 不 length-check
- **触发条件 (User does X)**:
  1. 用户用快捷键粘贴 5000 字到 category name input
  2. 按 Enter
- **用户可见后果 (User sees Y)**: Sidebar 出现一条占满整列宽 + 上下严重 overflow 的 category 行,挤掉其他 row 的可视空间;tooltip 显示截断;点击导航到 `/category/<id>`,PageHeader 显示 5000 字 page title 把整个 header 撑成多行 wrap。
- **不可见后果**: data.json 中真的存了 5000 字符。File system 端:Skills/MCPs 的 `category` 字段保存这 5000 字 dual-write,膨胀 metadata。
- **根因**: 无任何 input length 限制,前后端都无校验
- **建议修复 (Safe)**: 前端加 `maxLength={64}`(category / tag) 或 `100`(scene name);trim 后比较;若超长 toast 提示。Backend 可不改(用户自定义脚本理论上也能创建超长名,但 UI 输入是主要 vector)。
- **修复保守度**: Safe
- **复核状态**: self-confirmed

---

### F7-14. mcpsStore.updateMcpTags / updateMcpIcon 写后端先于 optimistic 更新 — 与 updateSkillTags / updateSkillIcon 不一致

- **置信度**: High
- **严重度**: P2
- **代码位置**:
  - `src/stores/mcpsStore.ts:200-218` `updateMcpTags`(先 `await safeInvoke`,后 `set state`)
  - `src/stores/mcpsStore.ts:220-242` `updateMcpIcon` 同款
  - `src/stores/skillsStore.ts:222-252` `updateSkillTags`(**optimistic-first**,后 `await safeInvoke`,失败 rollback)
- **触发条件 (User does X)**:
  1. 用户在 MCP detail panel 点 tag chip "X" 删除标签
- **用户可见后果 (User sees Y)**: chip 看起来"卡住" — 没立即消失,等 IPC roundtrip 结束才消失(MCP IPC 通常 < 100ms,但磁盘繁忙时可能 500ms+,用户体感 lag)。
- **不可见后果**:
  - 若用户在 IPC 期间快速点第二个 chip:第二个 update 也发出去,backend 串行处理(DATA_MUTEX),两条 IPC 顺序不确定。第一次的"减去 tag A"和第二次的"减去 tag B"如果以"基于当前快照"方式工作可能漏掉某一个。
  - 与 skills 体感不一致 — UI 同样的位置同样的操作不同响应。
- **根因**: 早期写法不一致,后续没 alignment audit
- **建议修复 (Safe)**: 把 `updateMcpTags` / `updateMcpIcon` 改成 optimistic-first + rollback on error,mirror `updateMcpCategory`(line 154-198)和 `updateSkillTags`。
- **修复保守度**: Safe
- **复核状态**: self-confirmed

---

### F7-15. Marketplace install 失败错误只在 button title attribute(hover tooltip)中显示

- **置信度**: High
- **严重度**: P2
- **代码位置**: `src/pages/SkillMarketplacePage.tsx:638-650`
  ```tsx
  if (installFailure) {
    return (
      <Button variant="primary" size="small" onClick={handleClick}
        disabled={isInstalling} loading={isInstalling}
        title={installFailure.error}
      >
        Retry
      </Button>
    );
  }
  ```
- **触发条件 (User does X)**:
  1. 用户在 Marketplace 点击某个 Skill 的 "Install" 按钮
  2. Install 失败(网络、tarball corruption、disk full)
- **用户可见后果 (User sees Y)**: Install 按钮变成 "Retry"。**鼠标 hover 时**才显示原因(浏览器原生 title tooltip,800ms 延迟、外观随系统而异、移动端不显示)。用户大概率点 Retry 反复失败,完全不知道 root cause。
- **不可见后果**: error 已在 `marketplaceStore.installFailedItems` 但 UI 不"主动"显示。
- **根因**: 设计选择 — 列表很多 install 按钮,每条独立 banner 视觉太挤。但 title 属性不可发现性极差。
- **建议修复 (Medium)**: 失败时改成 inline error message(列表项下方的 1-2 行红色 message + Retry button),mirror SkillsPage 的 error banner 风格;或失败时在 detail panel(用户点了 retry 时)展开 error。
- **修复保守度**: Medium(改 UI 布局)
- **复核状态**: self-confirmed

---

### F7-16. 错误信息全是 raw Rust string — "Permission denied (os error 13)" / "No such file or directory (os error 2)" 直接出现在 toast

- **置信度**: High
- **严重度**: P2(典型的 angle 6 expert B 代表性 bug #3 列出过,R7 verify 实测路径)
- **代码位置**:
  - backend: `commands/claude_md.rs:47, 54, 58, 689, 716, 725, 729, 747, 750, 794, 844, 866, 877` 等大量 `.map_err(|e| format!("Failed to read CLAUDE.md content: {}", e))?` 或更糟的 `.map_err(|e| e.to_string())?`
  - frontend: `src/pages/SkillsPage.tsx:986-996` 用 `<p className="text-sm text-red-700">{error}</p>` 直接显示
- **触发条件 (User does X)**:
  1. 用户磁盘 `~/.ensemble/` 权限错(比如曾经 `sudo` 创建过)
  2. 用户尝试更新某个 Skill 的 metadata
- **用户可见后果 (User sees Y)**: SkillsPage 顶部红色 banner 显示:
  ```
  Failed to write content: Permission denied (os error 13)
  ```
  普通用户不知道 "os error 13" 是什么,不知道怎么解决。
- **不可见后果**: 用户重启 app / 重启 mac 都没用,根因是 file ownership,但没引导。
- **根因**: backend 错误格式化是直接 `format!("{}", e)`,没有 mapping 到 user-friendly category("permission" / "disk space" / "file not found" / "network")。前端 toast 也没有 mapping。
- **建议修复 (Medium)**: 引入一层 error mapping(前端 helper `humanizeError(rawError: string): { title, hint, action }`),识别 "Permission denied" / "No such file" / "Connection refused" 等常见模式,转为带操作建议的友好文案。Backend 也可引入 typed error enum 让 UI 能稳定分类。
- **修复保守度**: Medium(新增功能不破现有)
- **复核状态**: self-confirmed(读 backend + 前端两端代码 + 走流程推演)

---

### F7-17. Sidebar Skills/MCPs 主页 inline detail 与 SkillDetailPanel/McpDetailPanel 双实现 — 当前是 codeload-install-fix 跟 mcp/skills-detail-audit 修过的相对齐状态,但维护负担在累积

- **置信度**: High
- **严重度**: P2(当前无 functional 漂移,但**未来回归窗口**已经被 F7-8 命中过)
- **代码位置**:
  - `src/pages/SkillsPage.tsx:634-929`(inline detail JSX,~300 行)
  - `src/components/skills/SkillDetailPanel.tsx:357-650`(SkillDetailPanel JSX,~290 行)
  - `src/pages/McpServersPage.tsx`(对应 inline)
  - `src/components/mcps/McpDetailPanel.tsx`(对应 panel)
- **触发条件 (User does X)**: 维护者改一处忘改另一处时
- **用户可见后果 (User sees Y)**: 同款 Skill 在 SkillsPage 看到字段 X,切去 CategoryPage 看到字段 X 形态不同/缺失。F7-8 就是这种漂移的现行实例(auto-fetch 守卫差异)。
- **不可见后果**: 600 行重复代码,每改一处都需要 mirror;PR review 容易漏。
- **根因**: 历史上 SkillDetailPanel / McpDetailPanel 是独立组件给 CategoryPage / TagPage 用,SkillsPage / McpServersPage 后来直接内联了相同 UI 没复用组件。CLAUDE.md 易错点 #5 显式警告过。
- **建议修复 (Risky)**: 把 SkillsPage / McpServersPage 的 inline detail **复用** SkillDetailPanel / McpDetailPanel。但 SkillsPage 内联 detail 复制粘贴时可能埋了 page-specific 行为(deep link `?selected=`,IconPicker positioning),需要小心。短期 alt:加 lint 规则 / PR template / cross-document-cascade-discipline 一样的 grep gate 强制 mirror。
- **修复保守度**: Risky(重构 600 行 UI)
- **复核状态**: self-confirmed for code shape,具体重构可行性需 lead-agent decide

---

### F7-18. 关闭 Import / Scan modal 时不取消 inflight detect IPC — store 仍 set state 触发已 unmount 组件警告

- **置信度**: Medium
- **严重度**: P3
- **代码位置**:
  - `src/components/modals/ImportSkillsModal.tsx:216-220` modal 打开时调 `detectPluginSkillsForImport()` —— 这是 inflight async,无 abort signal
  - `src/stores/importStore.ts:154-173`(detectSkillsOnly)、`pluginsStore.ts:154-174`(detectPluginSkillsForImport)
- **触发条件 (User does X)**:
  1. 用户打开 ImportSkillsModal,detect 开始
  2. 用户立刻点 Close / Escape 关闭 modal,detect 还没回来
- **用户可见后果 (User sees Y)**: 看起来一切正常,但**控制台**可能出现 React `Warning: Can't perform a React state update on an unmounted component`(取决于 React 版本 / 是否 strict mode)
- **不可见后果**: store state 仍被 setState,如果用户立刻重新打开 modal,可能看到上次 detect 结果的瞬间残留。
- **根因**: 无 AbortController 链路,无 mounted ref guard
- **建议修复 (Safe but moderate effort)**: 给 detect IPC 加 abort signal / 在 modal close 时 store reset state。
- **修复保守度**: Safe
- **复核状态**: self-confirmed code shape,实际是否触发 warning 需 lead-agent verify in actual build

---

### F7-19. SkillMarketplacePage / McpMarketplacePage 不做列表虚拟化 — 1000+ items 时 DOM 节点累计

- **置信度**: Medium
- **严重度**: P3
- **代码位置**: `src/pages/SkillMarketplacePage.tsx:201-227`(IntersectionObserver-based infinite scroll,无 react-window / react-virtuoso);grep 全 src 无虚拟化库
- **触发条件 (User does X)**:
  1. 用户在 Skill marketplace 滚到底
  2. Infinite scroll 加载 800+ 条
- **用户可见后果 (User sees Y)**: 滚动可能轻微卡(随机器)。scroll position 长 — 调到中间再切去其他页面,无 scroll restoration(F7-A11),回来从头开始。
- **不可见后果**: ~800 row 都驻留 DOM(无 windowing),每行带 icon + 多个 badge。Memory 占用与 row 数线性增。
- **根因**: 实现选择 — infinite scroll 但无 windowing(react-window 等)。Skills.sh 当前规模(~700 skills)实际还能撑;3-5 年后 marketplace 增长可能需要 windowing。
- **建议修复 (Medium)**: 引入 react-virtuoso(轻量,无侵入)。但这是**预防性**修复,当前测量需 lead-agent 用 1000+ 数据集实测才能定论(per measure-before-iterative-tuning Rule,P3 而非 P2 是因为缺测量)
- **修复保守度**: Medium
- **复核状态**: needs lead-agent verify with real-data measurement

---

## 总结

### 个人最关注的 3 条(if 用户只修 3 条,影响最大)

1. **F7-3 Project sync 部分失败 0 反馈** — 用户的最常用操作链路(sync project)失败时用户看不见,容易产生"我以为同步了但实际半套"的混乱状态。修复成本 Safe + 极低。
2. **F7-1 删除选中项 detail panel 残留打开** — 高频可触发(每个删除都可能),用户立即看见"空白 panel 占据屏幕一半",观感 confusion 强。Safe 修。
3. **F7-4 TrashRecoveryModal 缺 Rules tab** — Rules 是项目新加的实体,backend / store 都齐了,**modal 漏了一个 tab** = Rule 删错完全无法恢复。Medium 修但绝对值得做。

### 我觉得不必修(或可降级)的(0-3 条)

1. **F7-9 (Picker Escape 嵌套)** — 实际 trigger 场景在生产中比较窄(CreateSceneModal 内的 IconPicker),且修起来要重构 listener 架构。可以加到 backlog 但不必 immediate。
2. **F7-18 (modal close 不取消 inflight)** — 实际 user impact 极小(只是 console warning),除非引入 strict mode + 用户感知,可降 P3 不修。
3. **F7-19 (virtualization)** — 当前数据规模(~700 skills)实测前可能根本不需要,典型 measure-before-iterative-tuning,等 marketplace 涨到 1500+ 再回来看测量数据。
