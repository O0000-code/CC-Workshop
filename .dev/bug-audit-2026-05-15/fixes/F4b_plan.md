# F4b Implementation Plan — A7 / A9 / A10 / A11 (frontend only)

Owner: F4b Agent (Opus 4.7). Reviewers: V1 / V2.

Scope: four frontend-only findings. No backend changes. No new dependencies. No new IPC.

---

## A7 — `importStore.importMcps` 用错路径推导(P1)

### 当前 (`src/stores/importStore.ts:394-395`)
```ts
const { claudeConfigDir, skillSourceDir } = useSettingsStore.getState();
const ensembleDir = skillSourceDir.replace('/skills', '');
```

### 修改后
```ts
const { claudeConfigDir, mcpSourceDir } = useSettingsStore.getState();
const ensembleDir = mcpSourceDir.replace('/mcps', '');
```

### Verification

- **Grep**: `rg -n "skillSourceDir.replace\\('/skills', ''\\)" src/stores/importStore.ts`
  - Expect 2 hits: line 131 (backupBeforeImport — applies to both skills+MCPs backup, leave as-is per existing convention), line 157 (importConfig — combined path, leave), line 336 (importSkills — correct), line 394 (importMcps — fix).
  - Only line 394 is the bug.
- **mcpSourceDir** existence: confirmed at `src/stores/settingsStore.ts:21` (state field) + line 76 default `~/.ensemble/mcps`.
- **Backend ensemble_dir contract**: `src-tauri/src/commands/import.rs:527-541` — backend computes `mcps_dest = ensemble_dir/mcps`, so the front-end must strip the `/mcps` suffix to align.

### User-observable success
- User does X: in Settings change `MCP source directory` to `/Volumes/External/ensemble-mcps`, then open Import MCPs modal and import an MCP detected from `~/.claude.json`.
- User sees Y: the imported MCP's JSON file ends up in `/Volumes/External/ensemble-mcps/`.
- User does NOT see Z: a fresh `~/.ensemble/mcps/<name>.json` file appearing (under the default Ensemble dir) while the user's custom dir stays empty.

### Risk surface
- One line touched (variable name + replace argument). No new IPC; backend signature unchanged.
- Default users (skill+mcp both `~/.ensemble/{skills,mcps}`) see identical behavior — `ensembleDir` evaluates to `~/.ensemble` either way.

---

## A9 — addCategory / addTag / addScene 重名校验(P1)

### Strategy — 纯前端 trim + case-insensitive 检查

校验放在 **handler 层**(handler 已经能拿到 categories / tags / scenes 数组),不改 inline input / modal 内部:

| Handler | 校验对象 | 比较 key |
|---|---|---|
| `MainLayout.handleCategorySave` (line 454) | `categories` from `useAppStore` | `name.toLowerCase().trim()` 且 **同 parent** |
| `MainLayout.handleTagSave` (line 572) | `tags` from `useAppStore` | `name.toLowerCase().trim()` |
| `ScenesPage.handleCreateScene` (line 274) + `handleUpdateScene` (line 310) | `scenes` already in scope | `name.toLowerCase().trim()` |

只在 **add 模式**(`id === null`)和 **edit 模式改名**(`name !== currentName`)时校验,避免误拦"编辑同一条不改名"。

Category 同 parent 限制:DnD 后台允许同根分类下重名(因为 hierarchy 的展开 path 不同),但 UI 上看不出来。**保守做法**:同 parent 也算重复。当前 Add Category 路径只在 root 层 add(MainLayout 没有"加子分类"入口);所以 parentId 为 `undefined`,对照其他 root categories。

### 错误反馈机制

错误信息通过 `appStore.error` 显示(配合 A10 全局 banner)。需要给 appStore 加两个最小 action:

```ts
// appStore.ts
setError: (message: string) => set({ error: message });
clearError: () => set({ error: null });
```

dedup 检测到重复:

```ts
useAppStore.getState().setError('A category named "..." already exists.');
return;  // 不调 addCategory
```

### Verification

- **Grep**: `rg -n 'addCategory\\(\\|addTag\\(\\|add_scene\\b' src/`
  - addCategory caller(无 ` /\` ): `MainLayout.tsx::handleCategorySave` 唯一。
  - addTag caller: `MainLayout.tsx::handleTagSave` 唯一。
  - add_scene caller: `ScenesPage.tsx::handleCreateScene` 唯一。
- 不动 `appStore.addCategory` / `addTag` 内部 — 后端依然可能 push 重复,但前端拦在 handler 层(charter "前端拦住即可")。

### User-observable success
- **Category**: User does X: 创建分类 "Dev",再次点击 "+" 输入 "Dev" 或 "dev"。 User sees Y: 顶部 banner 显示 "A category named 'Dev' already exists." 第二条分类不出现。User does NOT see Z: 侧栏同名重复行。
- **Tag**: 同上,tag 版本。
- **Scene**: User does X: 创建 Scene "Frontend",再次新建 Scene 时输入 "Frontend"。User sees Y: banner 提示并保留 modal 状态(modal 不关闭),用户可以改名。 User does NOT see Z: scenes 列表新增同名条目。

### Risk surface
- 全部命中现有 store action 调用前(夹击在调用前),不破坏现有错误处理路径。
- Scene 仅在 add+edit handler 层判断,不进 modal,modal 保持 stateless 不动。
- `appStore.setError` / `clearError` 新增,但 type signature 是 store 内 action,前端 caller 0 影响。
- **关键**:scene dedup 失败时,modal 应该保留打开状态供用户改名 — 不能 onClose。

---

## A10 — `appStore.error` 显示(P2)

### 实施

1. `appStore.ts` 加 `setError` + `clearError` action(已经包含在 A9 实施中)。
2. `MainLayout.tsx` 在 main content 顶部加一个 conditional banner,订阅 `useAppStore((s) => s.error)`:
   ```tsx
   const appError = useAppStore((s) => s.error);
   const clearError = useAppStore((s) => s.clearError);
   ...
   <main className="flex-1 overflow-hidden flex flex-col">
     {appError && (
       <div
         role="alert"
         className="mx-7 mt-4 flex items-center justify-between rounded-md px-4 py-3 border"
         style={{
           backgroundColor: 'var(--color-error-bg)',
           borderColor: 'var(--color-error)',
         }}
       >
         <p className="text-[13px] font-medium" style={{ color: 'var(--color-error)' }}>
           {appError}
         </p>
         <button
           onClick={clearError}
           className="text-[13px] font-medium hover:opacity-80"
           style={{ color: 'var(--color-error)' }}
         >
           Dismiss
         </button>
       </div>
     )}
     <ErrorBoundary>
       <Outlet />
     </ErrorBoundary>
   </main>
   ```

### Verification — design tokens compliance

- Uses `var(--color-error)` / `var(--color-error-bg)` (canonical status tokens from `src/index.css:43-44`)
- Font size 13 (允许 — design Constraints "Font sizes" allowed 13)
- Font weight `medium` = 500(允许 — Constraints "Font weights" 500)
- Radius `rounded-md` = 6px(令牌 `--radius-md`,允许)
- Padding `px-4 py-3` = Tailwind tokens(allowed)
- `role="alert"`(a11y — 不破任何既有 modal a11y issue,只增 alert role for assistive technology)

### User-observable success
- User does X: 拖动 sidebar 父 Category "A" 进自己的子(造成 circular reference)。Backend reject `set_category_parent` 抛 `HierarchyError`。`appStore.moveCategoryToParent` 的 catch 块写 `error: message` 进 store。
- User sees Y: main content 顶部出现红色 banner "Setting parent would create a cycle"(或 backend 实际返回的字符串)。用户按 Dismiss 关闭。
- User does NOT see Z: category 弹回原位但完全没有任何错误反馈。

### Risk surface
- `MainLayout` 新增 2 行订阅 + 1 块 conditional banner JSX。
- 现有 SkillsPage / McpServersPage 等 page-level error banner 不动 — 它们订阅各自 store error,与 appStore.error 不冲突。
- 若 banner 与既有 SkillsPage banner 同时出现,各自独立显示;两个错误共存可接受(分别来自不同子系统)。

---

## A11 — SlidePanel 删除选中项不关闭(P1)

### 实施(SkillsPage + McpServersPage 两处对称)

**两层保险**:

1. `handleDelete` 内 **删除前** 清 local state:
   ```tsx
   const handleDelete = (skillId: string) => {
     if (selectedSkillId === skillId) {
       setSelectedSkillId(null);
     }
     deleteSkill(skillId);
   };
   ```

2. `SlidePanel.isOpen` 用 **数据驱动**:
   ```tsx
   <SlidePanel isOpen={!!selectedSkill} onClose={handleCloseDetail} ...>
   ```

### Position references

- SkillsPage:
  - line 471 `selectedSkill = useMemo(...)` 已存在,直接复用
  - line 538 `handleDelete` — 加 1 行 setSelectedSkillId(null)
  - line 1084 `<SlidePanel isOpen={!!selectedSkillId}` — 改为 `isOpen={!!selectedSkill}`
- McpServersPage:
  - line 411 `selectedMcp = useMemo(...)` 已存在
  - line 483 `handleDelete` — 加 1 行 setSelectedMcpId(null)
  - line 1114 `<SlidePanel isOpen={!!selectedMcpId}` — 改为 `isOpen={!!selectedMcp}`

### Verification

- **Grep**: `rg -n "selectedSkillId|selectedMcpId" src/pages/{SkillsPage,McpServersPage}.tsx`
  - SkillsPage: 共 14 处使用 selectedSkillId,但只有 `handleDelete` (line 538) 和 `<SlidePanel isOpen=` (line 1084) 是 A11 改点
  - McpServersPage: 同
- skillsStore `deleteSkill` 已经 reset `selectedSkillId` in store (line 152) — store local state 与 page local state 现在解耦,这是 finding 的根因。
- **CategoryPage / TagPage** 路径用 `SkillDetailPanel` 组件(line 35 R7 提到),这是 **另一条路径**,不是 A11 scope。本任务只动 SkillsPage / McpServersPage。

### Risk surface
- 4 处改动(SkillsPage handleDelete 1 行 + isOpen 1 处,McpServersPage 同 2 处)。
- `selectedSkill` 是 `useMemo` 既存,`!!selectedSkill` 是 truthy check,行为完全等价于 "如果 skills.find 返回 null 则关闭"。当删除发生时:
  1. `setSelectedSkillId(null)` 同步触发(双保险层)
  2. 即使 step 1 漏了,`deleteSkill` 后 skills 数组少一条 → `selectedSkill = useMemo(skills.find(...))` 返回 null → `!!selectedSkill === false` → 自动关闭
- 不影响 `handleCloseDetail` 路径(用户主动点叉,行为不变)
- 不影响 marketplace deep link `?selected=` 流程(只在 useEffect 内 setSelectedSkillId,不走 handleDelete)
- 边缘 case:用户已选中 A,然后通过 dropdown 删除 B(非选中)— 不触发 if 条件,行为不变(SlidePanel 仍打开显示 A)。

### User-observable success
- User does X: 用户点击 Skills 主页 Skill A → 右侧 SlidePanel 打开 → 点 Skill A 卡片右上 dropdown → "Delete"。
- User sees Y: Skill A 从主列表消失,**SlidePanel 同时关闭**,主区恢复全宽。
- User does NOT see Z: 屏幕右侧 800px 空白 panel 继续占屏,主区被推到左半边。

---

## 全部改动 footprint

| 文件 | 改动行数 | 涉及 finding |
|---|---|---|
| `src/stores/importStore.ts` | 2 lines | A7 |
| `src/stores/appStore.ts` | +2 actions + 2 interface entries (`setError` / `clearError`) | A9, A10 |
| `src/components/layout/MainLayout.tsx` | +2 subscribe + 1 banner JSX (~20 lines) + 2 dedup checks in handleCategorySave/handleTagSave (~12 lines) | A9, A10 |
| `src/pages/ScenesPage.tsx` | 2 dedup checks in handleCreateScene/handleUpdateScene (~12 lines) | A9 |
| `src/pages/SkillsPage.tsx` | 2 lines (handleDelete reset + SlidePanel isOpen swap) | A11 |
| `src/pages/McpServersPage.tsx` | 2 lines (handleDelete reset + SlidePanel isOpen swap) | A11 |

## 自检 5 问

1. **改动是否触及 finding 外**? 否。所有改动锁定在 task spec 列出的 4 个文件 / 6 个 handler / 2 个 SlidePanel / 1 个 banner / 2 个 store actions。
2. **同款问题是否在其他地方未改**? grep 验证:
   - importMcps 路径推导:全 src grep `skillSourceDir.replace('/skills','')` 命中合法处(importSkills line 336,importConfig line 157,backupBeforeImport line 131)+ 已修复的 line 394。其他无。
   - 重名校验:三个入口已覆盖 — CategoryInlineInput 和 TagInlineInput 的 onSave 都路由到 MainLayout 这 2 个 handler;CreateSceneModal 的 onCreateScene/onUpdateScene 都路由到 ScenesPage 这 2 个 handler。
   - SlidePanel detach:CategoryPage / TagPage 用 SkillDetailPanel 组件(R7 F7-1 提到),不在本 task scope(charter 明确 "不要 touch SkillDetailPanel")。
3. **新依赖 / 新 IPC**? 0。`setError` / `clearError` 是 store 内 action,不出 store 边界。
4. **改了已有 IPC signature**? 没。所有 IPC 不动。
5. **破坏既有 unit test**? `appStore.error` 字段不动,仅追加 actions — `setError` / `clearError`。既有测试 (`appStore.moveCategoryToParent.test.ts`) 不依赖这两个 action,无 regress。

## 注意

- 不引入 toast / dialog 系统(charter 明确)
- 不修改后端 — A9 不去 dedup 后端
- 使用 design language tokens(`var(--color-error)` 等)而非 Tailwind `red-*`(尽管现有 SkillsPage banner 用 red-*,但本次新增 banner 遵循当下 design-language.md)
- Categories dedup 范围在 root 层(因为现有 UI 不支持 add 子分类)
- Scene dedup 失败保持 modal 开启,允许用户改名
