# R1 — Data Model & Reference Strategy & Migration Architecture

> **角色**：R1 SubAgent。负责回答 D1（引用统一 id 还是保留 name）+ D2（数据模型形状）+ D13（hierarchy 失败模式），并产出可由 02_design_spec / 03_tech_plan 直接落地的迁移架构。
> **产物等级**：Referential（调研）。最终决定权在 02/03。

---

## 0. 已读基线 Checklist

按 `_dispatch_plan.md` 共同必读 + 任务专属必读全部读完：

- [x] `.dev/category-hierarchy/00_understanding.md` — 任务边界 + 14 决策清单 + 风险登记
- [x] `~/.claude/rules/document-authority-ranking.md`
- [x] `~/.claude/rules/plan-as-research-design.md`
- [x] `~/.claude/rules/hard-constraints-before-soft-evaluation.md`
- [x] `.claude/rules/cross-document-cascade-discipline.md`
- [x] `.claude/rules/verify-third-party-behavior-firsthand.md`
- [x] `.claude/rules/validate-numerical-equivalence-claims.md`
- [x] `.claude/rules/grep-before-enumerate-shared-resource.md`
- [x] `.dev/sidebar-reorder/02_design_spec.md` V3（全文，已熟悉 V3 不变量）
- [x] `.dev/sidebar-reorder/03_tech_plan.md` V3（全文，已熟悉 DATA_MUTEX/apply_reorder/version 协议）

任务专属必读：

- [x] `src-tauri/src/types.rs:1-1003`（Skill / McpServer / Category / Tag / SkillMetadata / McpMetadata / ClaudeMdFile / AppData 等）
- [x] `src-tauri/src/commands/data.rs`（categories CRUD + apply_reorder + DATA_MUTEX + 测试套件）
- [x] `src-tauri/src/commands/skills.rs`（metadata.category 行为）
- [x] `src-tauri/src/commands/mcps.rs`（metadata.category 行为）
- [x] `src-tauri/src/commands/claude_md.rs`（categoryId 引用）
- [x] `src-tauri/src/commands/classify.rs`（autoClassify prompt）
- [x] `src-tauri/src/commands/trash.rs`（restore_claude_md 路径下的 category_id 处理）
- [x] `src/types/index.ts` & `src/types/claudeMd.ts`
- [x] `src/stores/appStore.ts`（categories CRUD + reorder + version 协议）
- [x] `src/stores/skillsStore.ts:300-410`（autoClassify chain）
- [x] `src/stores/mcpsStore.ts:350-460`
- [x] `src/stores/claudeMdStore.ts:400-510`
- [x] `src/utils/constants.ts`（getCategoryColor）
- [x] `src/pages/CategoryPage.tsx`（filter 逻辑）
- [x] `src/components/layout/MainLayout.tsx:96-115`（categoriesWithCounts 派生）
- [x] `src/components/layout/Sidebar.tsx:187-201`（routing）
- [x] `src/App.tsx:23`（route `/category/:categoryId`）
- [x] `src/components/skills/SkillDetailPanel.tsx:238-247, 414`（dropdown）
- [x] `src/components/mcps/McpDetailPanel.tsx:219-228, 378`（dropdown）
- [x] `src/components/claude-md/ClaudeMdDetailPanel.tsx:148-157, 310`（dropdown — **value 是 id 不是 name**）

---

## 1. 现状画像（grep 原始证据）

### 1.1 grep 1: `.category` / `.categoryId` / `.category_id` 使用

```
$ rg -n --no-heading '\.category\b|\.categoryId\b|\.category_id\b' src/ src-tauri/src/
```

完整原始输出（未压缩）：

```
src-tauri/src/commands/trash.rs:401:                category_id: file_info.category_id,
src/pages/CategoryPage.tsx:41:  // Get category name for filtering (skill.category stores name, not id)
src/pages/CategoryPage.tsx:60:    // First filter by category name (skill.category stores the category name, not id)
src/pages/CategoryPage.tsx:62:    const categorySkills = skills.filter((s) => s.category === categoryName);
src/pages/CategoryPage.tsx:63:    const categoryMcps = mcpServers.filter((m) => m.category === categoryName);
src/pages/CategoryPage.tsx:64:    const categoryClaudeMd = claudeMdFiles.filter((f) => f.categoryId === categoryId);
src/pages/SkillDetailPage.tsx:77:  if (categoryIconMap[skill.category]) {
src/pages/SkillDetailPage.tsx:78:    return categoryIconMap[skill.category];
src/pages/SkillDetailPage.tsx:337:              style={{ backgroundColor: categoryColors[selectedSkill.category] || '#71717A' }}
src/pages/SkillDetailPage.tsx:340:              {selectedSkill.category.charAt(0).toUpperCase() + selectedSkill.category.slice(1)}
src/pages/ClaudeMdPage.tsx:148:    if (filter.categoryId) {
src/pages/ClaudeMdPage.tsx:149:      filtered = filtered.filter((file) => file.categoryId === filter.categoryId);
src/pages/SceneDetailPage.tsx:382:                      const SkillIcon = getSkillIcon(skill.category);
src/pages/SceneDetailPage.tsx:410:                      const McpIcon = getMcpIcon(mcp.category);
src-tauri/src/commands/mcps.rs:72:        metadata.category = cat;
src-tauri/src/commands/mcps.rs:144:        category: metadata.map(|m| m.category.clone()).unwrap_or_default(),
src-tauri/src/commands/skills.rs:83:        metadata.category = cat;
src-tauri/src/commands/skills.rs:208:        category: metadata.map(|m| m.category.clone()).unwrap_or_default(),
src/pages/McpDetailPage.tsx:44:  return getIcon(mcp.category);
src/pages/McpDetailPage.tsx:296:            {selectedMcp.category}
src/pages/SkillsPage.tsx:81:  if (categoryIconMap[skill.category]) {
src/pages/SkillsPage.tsx:82:    return categoryIconMap[skill.category];
src/pages/SkillsPage.tsx:451:            value={selectedSkill.category || ''}
src/pages/ScenesPage.tsx:524:                    const SkillIcon = getSkillIcon(skill.category);
src/pages/ScenesPage.tsx:552:                    const McpIcon = getMcpIcon(mcp.category);
src/components/skills/SkillItem.tsx:77:  if (categoryIconMap[skill.category]) {
src/components/skills/SkillItem.tsx:78:    return categoryIconMap[skill.category];
src/components/skills/SkillItem.tsx:113:  const categoryColor = categoryColors[skill.category] || '#71717A';
src/components/skills/SkillItem.tsx:182:            {skill.category ? skill.category.charAt(0).toUpperCase() + skill.category.slice(1) : 'Uncategorized'}
src/pages/McpServersPage.tsx:68:  return getIcon(mcp.category);
src/pages/McpServersPage.tsx:429:            value={selectedMcp.category || ''}
src/components/skills/SkillListItem.tsx:68:  const categoryColor = getCategoryColor(skill.category);
src/components/skills/SkillListItem.tsx:186:        {skill.category && (
src/components/skills/SkillListItem.tsx:188:            {skill.category.charAt(0).toUpperCase() + skill.category.slice(1)}
src-tauri/src/commands/claude_md.rs:371:        category_id: options.category_id,
src-tauri/src/commands/claude_md.rs:542:        file.category_id = Some(cid);
src/stores/skillsStore.ts:168:    const oldCategory = skill.category;
src/stores/skillsStore.ts:467:    if (filter.category) {
src/stores/skillsStore.ts:468:      filtered = filtered.filter((skill) => skill.category === filter.category);
src/components/skills/SkillDetailPanel.tsx:80:  if (categoryIconMap[skill.category]) {
src/components/skills/SkillDetailPanel.tsx:81:    return categoryIconMap[skill.category];
src/components/skills/SkillDetailPanel.tsx:414:            value={selectedSkill.category || ''}
src/components/layout/MainLayout.tsx:100:        skills.filter((s) => s.category === cat.name).length +
src/components/layout/MainLayout.tsx:101:        mcpServers.filter((m) => m.category === cat.name).length +
src/components/layout/MainLayout.tsx:102:        claudeMdFiles.filter((f) => f.categoryId === cat.id).length,
src/components/layout/MainLayout.tsx:399:    if (contextMenu?.category) {
src/components/layout/MainLayout.tsx:400:      startEditingCategory(contextMenu.category.id);
src/components/layout/MainLayout.tsx:406:    if (contextMenu?.category) {
src/components/layout/MainLayout.tsx:408:        await deleteCategory(contextMenu.category.id);
src/components/scenes/CreateSceneModal.tsx:449:    const uniqueCategories = [...new Set(items.map((item) => item.category))];
src/components/scenes/CreateSceneModal.tsx:453:      count: items.filter((item) => item.category === cat).length,
src/components/scenes/CreateSceneModal.tsx:487:      if (categoryFilter && item.category !== categoryFilter) {
src/components/scenes/CreateSceneModal.tsx:916:                          category={item.category}
src/stores/mcpsStore.ts:485:    if (state.filter.category) {
src/stores/mcpsStore.ts:486:      filtered = filtered.filter((mcp) => mcp.category === state.filter.category);
src/components/claude-md/ClaudeMdDetailPanel.tsx:310:            value={selectedFile.categoryId || ''}
src/components/claude-md/ClaudeMdCard.tsx:85:  const category = file.categoryId
src/components/claude-md/ClaudeMdCard.tsx:86:    ? categories.find((c) => c.id === file.categoryId)
src/stores/claudeMdStore.ts:258:        categoryId: updates.categoryId,
src/stores/claudeMdStore.ts:563:    if (filter.categoryId) {
src/stores/claudeMdStore.ts:564:      filtered = filtered.filter((file) => file.categoryId === filter.categoryId);
src/components/mcps/McpListItem.tsx:36:  return categoryIconMap[mcp.category] || ICON_MAP['plug'];
src/components/mcps/McpListItem.tsx:76:  const categoryColor = getCategoryColor(mcp.category);
src/components/mcps/McpListItem.tsx:198:        {mcp.category && (
src/components/mcps/McpListItem.tsx:200:            {mcp.category.charAt(0).toUpperCase() + mcp.category.slice(1)}
src/components/mcps/McpItem.tsx:28:  return getIcon(mcp.category);
src/components/mcps/McpDetailPanel.tsx:52:  return getIcon(mcp.category);
src/components/mcps/McpDetailPanel.tsx:378:            value={selectedMcp.category || ''}
```

### 1.2 grep 2: `metadata.category` / `skill.category` / `mcp.category`

```
$ rg -n --no-heading 'metadata\.category|skill\.category|mcp\.category' src/ src-tauri/src/
```

```
src/pages/SceneDetailPage.tsx:382:                      const SkillIcon = getSkillIcon(skill.category);
src/pages/SceneDetailPage.tsx:410:                      const McpIcon = getMcpIcon(mcp.category);
src-tauri/src/commands/mcps.rs:72:        metadata.category = cat;
src/pages/CategoryPage.tsx:41:  // Get category name for filtering (skill.category stores name, not id)
src/pages/CategoryPage.tsx:60:    // First filter by category name (skill.category stores the category name, not id)
src/pages/McpDetailPage.tsx:44:  return getIcon(mcp.category);
src/pages/McpServersPage.tsx:68:  return getIcon(mcp.category);
src/pages/SkillDetailPage.tsx:77:  if (categoryIconMap[skill.category]) {
src/pages/SkillDetailPage.tsx:78:    return categoryIconMap[skill.category];
src-tauri/src/commands/skills.rs:83:        metadata.category = cat;
src/pages/SkillsPage.tsx:81:  if (categoryIconMap[skill.category]) {
src/pages/SkillsPage.tsx:82:    return categoryIconMap[skill.category];
src/pages/ScenesPage.tsx:524:                    const SkillIcon = getSkillIcon(skill.category);
src/pages/ScenesPage.tsx:552:                    const McpIcon = getMcpIcon(mcp.category);
src/components/skills/SkillItem.tsx:77:  if (categoryIconMap[skill.category]) {
src/components/skills/SkillItem.tsx:78:    return categoryIconMap[skill.category];
src/components/skills/SkillItem.tsx:113:  const categoryColor = categoryColors[skill.category] || '#71717A';
src/components/skills/SkillItem.tsx:182:            {skill.category ? skill.category.charAt(0).toUpperCase() + skill.category.slice(1) : 'Uncategorized'}
src/components/skills/SkillListItem.tsx:68:  const categoryColor = getCategoryColor(skill.category);
src/components/skills/SkillListItem.tsx:186:        {skill.category && (
src/components/skills/SkillListItem.tsx:188:            {skill.category.charAt(0).toUpperCase() + skill.category.slice(1)}
src/components/skills/SkillDetailPanel.tsx:80:  if (categoryIconMap[skill.category]) {
src/components/skills/SkillDetailPanel.tsx:81:    return categoryIconMap[skill.category];
src/components/mcps/McpDetailPanel.tsx:52:  return getIcon(mcp.category);
src/components/mcps/McpListItem.tsx:36:  return categoryIconMap[mcp.category] || ICON_MAP['plug'];
src/components/mcps/McpListItem.tsx:76:  const categoryColor = getCategoryColor(mcp.category);
src/components/mcps/McpListItem.tsx:198:        {mcp.category && (
src/components/mcps/McpListItem.tsx:200:            {mcp.category.charAt(0).toUpperCase() + mcp.category.slice(1)}
src/stores/skillsStore.ts:168:    const oldCategory = skill.category;
src/stores/skillsStore.ts:468:      filtered = filtered.filter((skill) => skill.category === filter.category);
src/components/mcps/McpItem.tsx:28:  return getIcon(mcp.category);
src/stores/mcpsStore.ts:486:      filtered = filtered.filter((mcp) => mcp.category === state.filter.category);
```

### 1.3 grep 3: CRUD 函数

```
$ rg -n --no-heading 'addCategory|updateCategory|deleteCategory|reorderCategories' src/ src-tauri/src/
```

```
src/stores/skillsStore.ts:359:      const { addCategory, addTag, loadCategories, loadTags } = useAppStore.getState();
src/stores/skillsStore.ts:381:        await addCategory(categoryName, categoryColors[colorIndex % categoryColors.length]);
src/stores/claudeMdStore.ts:453:      const { addCategory, addTag, loadCategories, loadTags } = useAppStore.getState();
src/stores/claudeMdStore.ts:475:        await addCategory(categoryName, categoryColors[colorIndex % categoryColors.length]);
src/stores/appStore.ts:103:  addCategory: (name: string, color: string) => Promise<Category>;
src/stores/appStore.ts:104:  updateCategory: (id: string, name?: string, color?: string) => Promise<void>;
src/stores/appStore.ts:105:  deleteCategory: (id: string) => Promise<void>;
src/stores/appStore.ts:109:  reorderCategories: (orderedIds: string[]) => Promise<void>;
src/stores/appStore.ts:237:  addCategory: async (name: string, color: string) => {
src/stores/appStore.ts:262:  updateCategory: async (id: string, name?: string, color?: string) => {
src/stores/appStore.ts:287:  deleteCategory: async (id: string) => {
src/stores/appStore.ts:390:  reorderCategories: (orderedIds: string[]) => {
src/stores/mcpsStore.ts:401:      const { addCategory, addTag, loadCategories, loadTags } = useAppStore.getState();
src/stores/mcpsStore.ts:423:        await addCategory(categoryName, categoryColors[colorIndex % categoryColors.length]);
src/components/layout/MainLayout.tsx:59:    addCategory,
src/components/layout/MainLayout.tsx:60:    updateCategory,
src/components/layout/MainLayout.tsx:61:    deleteCategory,
src/components/layout/MainLayout.tsx:66:    reorderCategories,
src/components/layout/MainLayout.tsx:372:        await updateCategory(id, name);
src/components/layout/MainLayout.tsx:375:        await addCategory(name, '#A1A1AA');
src/components/layout/MainLayout.tsx:392:      await updateCategory(categoryId, undefined, color);
src/components/layout/MainLayout.tsx:408:        await deleteCategory(contextMenu.category.id);
src/components/layout/MainLayout.tsx:486:        await reorderCategories(orderedIds);
src/components/layout/MainLayout.tsx:491:    [reorderCategories],
```

### 1.4 grep 4: Rust 字段定义

```
$ rg -n --no-heading 'pub category|pub category_id|category: String|category_id:' src-tauri/src
```

```
src-tauri/src/commands/trash.rs:401:                category_id: file_info.category_id,
src-tauri/src/commands/trash.rs:436:                category_id: None,
src-tauri/src/commands/claude_md.rs:371:        category_id: options.category_id,
src-tauri/src/commands/claude_md.rs:506:    category_id: Option<String>,
src-tauri/src/commands/claude_md.rs:704:                category_id: None,
src-tauri/src/commands/classify.rs:22:    pub suggested_category: String,
src-tauri/src/types.rs:10:    pub category: String,           // Skill
src-tauri/src/types.rs:42:    pub category: String,           // McpServer
src-tauri/src/types.rs:181:    pub category: String,          // SkillMetadata
src-tauri/src/types.rs:193:    pub category: String,          // McpMetadata
src-tauri/src/types.rs:653:    pub category_id: Option<String>,  // ClaudeMdFile
src-tauri/src/types.rs:741:    pub category_id: Option<String>,  // ClaudeMdImportOptions
```

### 1.5 grep 5: getCategoryColor / categoryColors

```
$ rg -n --no-heading 'getCategoryColor|categoryColors' src/
```

```
src/pages/SkillDetailPage.tsx:89:const categoryColors: Record<string, string> = {
src/pages/SkillDetailPage.tsx:337:              style={{ backgroundColor: categoryColors[selectedSkill.category] || '#71717A' }}
src/components/skills/SkillItem.tsx:89:const categoryColors: Record<string, string> = {
src/components/skills/SkillItem.tsx:113:  const categoryColor = categoryColors[skill.category] || '#71717A';
src/components/skills/SkillListItem.tsx:7:import { getCategoryColor } from '@/utils/constants';
src/components/skills/SkillListItem.tsx:68:  const categoryColor = getCategoryColor(skill.category);
src/utils/constants.ts:7:export const categoryColors: Record<string, string> = {
src/utils/constants.ts:20:export const getCategoryColor = (category: string): string => {
src/utils/constants.ts:21:  return categoryColors[category?.toLowerCase()] || categoryColors.other;
src/components/mcps/McpListItem.tsx:6:import { getCategoryColor } from '@/utils/constants';
src/components/mcps/McpListItem.tsx:76:  const categoryColor = getCategoryColor(mcp.category);
src/utils/__tests__/constants.test.ts:2: ... 测试文件 ...
src/stores/claudeMdStore.ts:472:      const categoryColors = ['#3B82F6', ...];
src/stores/skillsStore.ts:378:      const categoryColors = ['#3B82F6', ...];
src/stores/mcpsStore.ts:420:      const categoryColors = ['#3B82F6', ...];
```

### 1.6 引用方式分布表（每处用 name 还是 id）

> 关键事实：本项目内的 category 引用模型是**异构**的——两种引用语义并存。

| 文件:行 | 引用方 | 字段 | 引用方式 | 备注 |
|---|---|---|---|---|
| `types.rs:10` | `Skill` | `category` | **String name** | snake_case → camelCase serde |
| `types.rs:42` | `McpServer` | `category` | **String name** | 同上 |
| `types.rs:181` | `SkillMetadata` | `category` | **String name** | 持久化字段，写入 `data.json` 的 `skillMetadata` map |
| `types.rs:193` | `McpMetadata` | `category` | **String name** | 同上，`mcpMetadata` map |
| `types.rs:653` | `ClaudeMdFile` | `category_id` | **UUID id**（`Option<String>`） | `#[serde(skip_serializing_if = "Option::is_none")]` |
| `types.rs:741` | `ClaudeMdImportOptions` | `category_id` | **UUID id**（`Option<String>`） | 同上 |
| `commands/claude_md.rs:506` | `update_claude_md` arg | `category_id` | **UUID id** | |
| `commands/skills.rs:60-83` | `update_skill_metadata` | `category` | **String name** | |
| `commands/mcps.rs:50-72` | `update_mcp_metadata` | `category` | **String name** | |
| `classify.rs:22` | `ClassifyResult` | `suggested_category` | **String name** | LLM 输出 name |
| `pages/CategoryPage.tsx:62` | filter | Skill→cat | **`s.category === categoryName`** | name 比对 |
| `pages/CategoryPage.tsx:63` | filter | McpServer→cat | **`m.category === categoryName`** | name 比对 |
| `pages/CategoryPage.tsx:64` | filter | ClaudeMdFile→cat | **`f.categoryId === categoryId`** | id 比对 |
| `MainLayout.tsx:100-102` | counts 派生 | mixed | **Skills/MCPs 用 name，CLAUDE.md 用 id** | 二元逻辑 |
| `appStore.ts:96, 161` | `setCategories` | — | id 操作；store 持有 `Category[]` |
| `Sidebar.tsx:191` | navigate | — | `/category/${categoryId}` — **route 用 id** |
| `SkillDetailPanel.tsx:240, 414` | dropdown options | — | **option.value = cat.name** |
| `McpDetailPanel.tsx:222, 378` | dropdown options | — | **option.value = cat.name** |
| `ClaudeMdDetailPanel.tsx:151, 310` | dropdown options | — | **option.value = cat.id**（与 Skills/MCPs 不一致！） |
| `utils/constants.ts:20-22` | `getCategoryColor` | — | **接收 name（小写比对）**，与 user `Category.color` 完全独立的兜底 fallback |

**P0 关键事实**：

1. **三种实体三种引用方式不统一**：
   - Skills / MCPs 把 category **name** 存进 metadata（同时存进 `Skill.category` runtime 字段，是同一个 string）
   - ClaudeMdFile 把 category **id (UUID)** 存进 `category_id`
   - dropdown UI 也跟着分裂：Skills/MCPs dropdown `value=cat.name`，ClaudeMd dropdown `value=cat.id`

2. **重命名 category 的当前后果**：
   - 重命名 → `Category.name` 改了
   - **Skills/MCPs 的 metadata.category 字段不会自动同步**——下次 scan 时 metadata 还是旧 name，但旧 name 已不在 `categories[]` 里 → Skill 显示成"unmatched"，filter 失效。**这是已存在的 bug 等价物**（user 不常 rename 所以未爆雷）
   - ClaudeMd 不受影响（id 永远不变）

3. **同名 category 在当前 flat 模型下不会出现**：UI 阻止用户起重名（参 `MainLayout.tsx` 没有 unique check 但单层下用户自然避开）。一旦 hierarchy 引入，**两个不同父类下同名子类是合法的**——这是 D1 的核心动机。

4. **`getCategoryColor` 与 `Category.color` 独立**：`utils/constants.ts` 是**static fallback**，仅用 5 个内置 keys（development / design / research / productivity / other）。它不依赖 `Category.color`；它在用户 Category 没匹配上时兜底。任何 hierarchy 改造都**不需要改这个函数**，但其调用点（SkillListItem / McpListItem）的语义是"用 skill.category 的 name 找 fallback color"，hierarchy 后这个 name 仍然存在。

---

## 2. 决策维度：硬约束 vs 软评估（先于候选评估）

按 `~/.claude/rules/hard-constraints-before-soft-evaluation.md`，先列硬约束（pass/fail），再做软评分。

### 2.1 硬约束（candidates 必须全部通过）

| ID | 硬约束 | 来源 |
|---|---|---|
| H1 | **旧 data.json 反序列化必须不报错**（用户已有 categories/skills/mcps/claudemd） | 00_understanding §5.7、风险登记 #2 |
| H2 | **不能破坏 V3 Reorder 不变量**（DATA_MUTEX、apply_reorder pure、version 协议、autoClassify race 防护、enqueueReorder 队列） | 03_tech_plan V3 §3-§4，00_understanding §4.4 |
| H3 | **autoClassify 链路必须仍然可用**（不能让 LLM 返回 name 后无法落地） | classify.rs:22 + skillsStore.ts:381 + mcpsStore.ts:423 + claudeMdStore.ts:475 |
| H4 | **新增字段必须 backward-compatible**（旧字段不删，新字段 `Option`/有 default） | serde + 用户已有数据 |
| H5 | **SkillMetadata / McpMetadata 持久化形态必须保持**（这是 user 的真实数据） | types.rs:178-199 |

### 2.2 软评估维度（candidates 通过硬约束后做评分 0-5）

- S1: 数据迁移成本（一次性 LoC + 风险）
- S2: 重命名 category 后引用一致性
- S3: hierarchy 下两个子类同名的歧义化解
- S4: 与现有 dnd-kit + DATA_MUTEX + version 架构契合度
- S5: 未来扩展性（v2 让 LLM 感知父类、未来支持 export/import 等）
- S6: 代码改动面积 LoC 估算
- S7: 用户视角故障可见性（rename 后哪些 Skills 看起来错了？）

---

## 3. D1 候选评估（引用方案：name vs id vs path vs status quo）

### 3.1 候选 A：Skills/MCPs 全迁移到 categoryId（与 ClaudeMd 一致）

**做法**：
- `Skill.category: String` → `Skill.category_id: Option<String>`（也可保留 `category` 字段做派生 / 显示，但**真值是 id**）
- 同样改 `McpServer`、`SkillMetadata`、`McpMetadata`
- AutoClassify chain：LLM 仍返回 name → 在 frontend store 里查 id → 写入 `category_id`
- 一次性迁移：将所有 metadata 中现存 name 在新 schema 下查到对应 id 写入；name 字段保留做兜底（旧数据保 backward）

**硬约束评估**：

| 硬约束 | 通过？ | 说明 |
|---|---|---|
| H1 旧 data.json 反序列化 | **PASS**（条件：保留 `category: String` field，新增 `category_id: Option<String>` 用 `#[serde(default)]`） | 必须双字段共存一段时间，参 §6 迁移规划 |
| H2 V3 Reorder | **PASS** | 引用迁移与 reorder 正交 |
| H3 autoClassify 链路 | **PASS**（条件：在 store 层 LLM name → id 转换，与现 claudeMdStore.ts:496 同模式） | claudeMdStore 已有这个 pattern：`updatedCategories.find(c => c.name === result.suggested_category)?.id` |
| H4 backward-compat | **PASS**（条件：双字段共存，旧 metadata 写入时 dual-write） | |
| H5 metadata 持久化 | **PASS**（条件：增 `category_id`，旧 `category` 字段不删） | |

**软评分**：

| 维度 | 分数 | 说明 |
|---|---|---|
| S1 迁移成本 | 2 | Rust 端：types.rs +6 行（Skill / McpServer / SkillMetadata / McpMetadata 各加一个 Option<String>），commands/skills.rs / mcps.rs 增加双字段写入与读取（约 +20 行）；Frontend：types/index.ts +2 行，stores 写入逻辑改 +约 30 行；新增一次性迁移 helper（runtime first-launch）+约 40 行 |
| S2 重命名一致性 | **5** | 重命名仅改 `Category.name`，所有引用通过 id 立即看到新名字 |
| S3 同名子类歧义 | **5** | 引用是 id，根本不存在歧义（这是 D1 选 A 的核心动机） |
| S4 现架构契合度 | **5** | 与 ClaudeMd 完全一致，autoClassify chain 在 claudeMdStore 已经是 name→id 模式（claudeMdStore.ts:495-509），可作模板 |
| S5 扩展性 | **5** | export/import / 未来跨设备 sync / hierarchy 任意层级都不受名字变化影响 |
| S6 LoC | 3 | 估算总 +120 LoC（最大头是迁移 helper + 测试），不算大 |
| S7 故障可见性 | **5** | 重命名后无任何"unmatched"项；LLM 返回了不存在 name 时仍会 fallback 创建（与现状一致） |

**总评**：硬约束全 PASS，软评 30/35。**这是数据层的最优解**。

**反对声音**：
- "增加复杂度——双字段共存"。回应：双字段是迁移期 transient 状态（一次完整 migration 后可只保留 `category_id`，但即使保留 `category` 字段也无害——它就是 SoT 的 cached display name）；ClaudeMd 模式已经成熟，不是新发明
- "LLM 输出 name → 转 id，多一步映射"。回应：claudeMdStore 已经在做（成本：1 行 `find`），可接受

### 3.2 候选 B：保留 name + 全树名字唯一约束

**做法**：
- 数据模型不动（Skill.category / McpServer.category 保持 name string）
- 在 add/update/rename 时强制全局唯一（即使 hierarchy 下两个子类也不能同名）

**硬约束评估**：

| 硬约束 | 通过？ | 说明 |
|---|---|---|
| H1 旧 data.json | PASS | 不变 |
| H2 V3 Reorder | PASS | |
| H3 autoClassify | PASS | |
| H4 backward-compat | PASS | |
| H5 metadata 持久化 | PASS | |

**软评分**：

| 维度 | 分数 | 说明 |
|---|---|---|
| S1 迁移成本 | 4 | 仅在 add_category / update_category 增加唯一性校验 +约 30 LoC；UI 显示冲突错误 +约 20 LoC |
| S2 重命名一致性 | 1 | rename 后 Skills/MCPs metadata 仍指向旧名字 → 看起来 broken（**等同当前已存在的 bug**）；唯一性校验只在前向防止 conflict，不解决后向 broken refs |
| S3 同名子类歧义 | **0**（HARD FAIL of UX）| **核心问题没解决**：用户不能在 Web>Stripe 下加 child "API"，又在 Stripe>Stripe 下加 child "API"——这违反极简哲学（"无必要勿增实体"），用户会被 "name conflict" 错误打断 |
| S4 现架构契合度 | 3 | 与现 Skills/MCPs 一致，但与 ClaudeMd 仍不统一 |
| S5 扩展性 | 1 | 永远只能全树唯一，未来如果想 path-based 也要再迁移 |
| S6 LoC | 4 | 改动小 |
| S7 故障可见性 | 2 | 重命名仍 broken；唯一性 conflict 是 UX disruption |

**总评**：硬约束 PASS 但 S2/S3/S5 重大缺陷。**用户体验上是 D1 最差选项**。极简哲学要求"hidden complexity"——唯一性校验是可见复杂度。

**反对声音**：
- "大多数 ToDoList App 都允许同名子类"——这是行业惯例（Things 3 的 Inbox / Today / Anytime / Someday 是 reserved，但 user-defined Project 可以同名；Notion/Linear 都允许同名 sub-page）
- D1 = B 在 hierarchy 下产生新的 UX 摩擦

### 3.3 候选 C：复合 path 字符串 `parent/child`

**做法**：
- `Skill.category` 仍是 String，但内容改为 path：`"Web/API"`
- 解析时按 `/` 分隔
- 重命名时需要更新所有 metadata 中相关 path

**硬约束评估**：

| 硬约束 | 通过？ | 说明 |
|---|---|---|
| H1 旧 data.json | PASS（旧值是单层 name，自然兼容 root-level path） | |
| H2 V3 Reorder | PASS | |
| H3 autoClassify | PASS（条件：LLM prompt 教它返回 path 形式，或暂不感知） | |
| H4 backward-compat | PASS（条件：no `/` = root） | |
| H5 metadata 持久化 | PASS | |

**软评分**：

| 维度 | 分数 | 说明 |
|---|---|---|
| S1 迁移成本 | 3 | 数据模型不动，但每个 read/write 都要做 path encoding/decoding +约 60 LoC；filter 逻辑改 +约 30 LoC |
| S2 重命名一致性 | **0**（HARD FAIL practical）| **Cascade rename**：重命名父类 "Web" → "Network"，需要遍历每个 Skill/MCP/ClaudeMd 把所有 `Web/*` 改成 `Network/*`——这是 grep-and-rewrite，必须在 backend command 里实现。极易出错。如果中途崩溃，data 半改半未改，数据损坏 |
| S3 同名子类歧义 | **5**（path 区分） | path "A/X" vs "B/X" 不冲突 |
| S4 现架构契合度 | 1 | 与 ClaudeMd 的 id 引用又不一样；产生第三种引用方式 |
| S5 扩展性 | 2 | 三级嵌套时 path "A/B/C" 解析复杂，但本任务硬限 max depth=2 不会三级 |
| S6 LoC | 2 | rename cascade migration 是 60+ LoC 的 read-modify-write 循环 + 测试 |
| S7 故障可见性 | 1 | path 中含 `/` 字符要 escape，否则用户起 "I/O" 类型 name 直接崩 |

**总评**：硬约束 PASS 但 S2 实际崩盘。**reject**。

### 3.4 候选 D：维持现状 + 同 parent 下名字唯一（但全树允许同名）

**做法**：
- 数据模型不动（Skill.category 仍 name string）
- 唯一性约束放宽：只在同 parent 下唯一
- **后果**：当两个不同父类下都有名为 "API" 的子类，Skill.category="API" 就 ambiguous

**硬约束评估**：

| 硬约束 | 通过？ | 说明 |
|---|---|---|
| H1-H5 | PASS | 不动数据 |

**软评分**：

| 维度 | 分数 | 说明 |
|---|---|---|
| S1 迁移成本 | **5** | 几乎为零 |
| S2 重命名一致性 | 1 | 同 B（rename 后 metadata broken） |
| S3 同名子类歧义 | **0**（HARD FAIL semantic）| Skill.category="API" 无法分辨来自哪个父；filter / count / navigation 全部错位 |
| S4 现架构契合度 | 2 | 加深异构 |
| S5 扩展性 | 0 | 永远无法 disambiguate |
| S6 LoC | 5 | 几乎不改 |
| S7 故障可见性 | **0** | 用户看不出哪个 API 是哪个父的；每个组件都得自己写 disambiguation 逻辑 |

**总评**：硬约束 PASS 但 S3/S5/S7 直接崩溃。**reject**。

### 3.5 D1 候选汇总评分表

| 候选 | 硬约束 | S1 | S2 | S3 | S4 | S5 | S6 | S7 | 总分（35）| 决策 |
|---|---|---|---|---|---|---|---|---|---|---|
| **A** id 化 | PASS | 2 | **5** | **5** | **5** | **5** | 3 | **5** | **30** | **选 A** |
| B 全树唯一 | PASS | 4 | 1 | 0 | 3 | 1 | 4 | 2 | 15 | reject |
| C path 字符串 | PASS | 3 | 0 | 5 | 1 | 2 | 2 | 1 | 14 | reject |
| D 同 parent 唯一 | PASS | 5 | 1 | 0 | 2 | 0 | 5 | 0 | 13 | reject |

**D1 决策：A — Skills/MCPs 全迁移到 categoryId 与 ClaudeMd 一致**。

---

## 4. D2 候选评估（数据模型形状）

### 4.1 候选 A：`parent_id: Option<String>` 字段加到现有 Vec<Category>

**做法**：

```rust
pub struct Category {
    pub id: String,
    pub name: String,
    pub color: String,
    pub count: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,  // None = root
}
```

依然是 `Vec<Category>`，扁平存储；前端从 flat list 派生 tree。

**硬约束评估**：

| 硬约束 | 通过？ | 说明 |
|---|---|---|
| H1 旧 data.json | **PASS** | 旧数据没有 `parentId` 字段，serde `#[serde(default)]` 让它反序列化为 `None` → root |
| H2 V3 Reorder | **PASS** | apply_reorder 是 generic over `HasId`（data.rs:51），添加 parent_id 字段不影响。可在前端 derive tree 后再发 IPC |
| H3 autoClassify | **PASS** | LLM 仍返回 name；新建 category 时 parent_id=None（root）落地 |
| H4 backward-compat | **PASS**（用 `#[serde(default)]`） | |
| H5 metadata 持久化 | **PASS** | metadata 不变 |

**软评分**：

| 维度 | 分数 | 说明 |
|---|---|---|
| S1 迁移成本 | **5** | Rust 加 1 字段 + camelCase rename_all 自动；TS 加 1 字段；旧 data.json 不需 migration |
| S2 数据完整性 | **5** | flat Vec 是 SoT，避免嵌套结构同步问题 |
| S3 reorder 算法 | **5** | apply_reorder 完全不变；前端 reorder 时按 parent 分组生成 orderedIds（顺序在 Vec 中) |
| S4 序列化简洁 | **5** | 无嵌套 |
| S5 查询性能 | 4 | 树构造为 O(n)（一次 pass 建 child map） |
| S6 LoC | **5** | 极小 |

**总评**：硬约束全 PASS，软评 29/30。**简单优雅**。

### 4.2 候选 B：双层 Vec（root categories + 嵌套 children）

**做法**：

```rust
pub struct Category {
    pub id: String,
    pub name: String,
    pub color: String,
    pub count: u32,
    #[serde(default)]
    pub children: Vec<Category>,  // 嵌套
}
```

**硬约束评估**：

| 硬约束 | 通过？ | 说明 |
|---|---|---|
| H1 旧 data.json | **PASS**（用 `#[serde(default)]` Vec） | |
| H2 V3 Reorder | **FAIL** | apply_reorder 操作 flat Vec；嵌套后需要分别 reorder root 与 children，apply_reorder 不能跨层级。需要重写 reorder 算法 |
| H3-H5 | PASS | |

**软评分**：

| 维度 | 分数 | 说明 |
|---|---|---|
| S1 迁移成本 | 2 | apply_reorder 重写、所有 reorder integration tests 重写、frontend store 改 +约 80 LoC |
| S2 数据完整性 | 2 | 嵌套带来"父类被删时 orphan child" 处理复杂 |
| S3 reorder 算法 | 1 | 跨层 reorder（promote / demote）需特殊处理 |
| S4 序列化简洁 | 2 | 嵌套 |
| S5 查询性能 | 5 | 自然分层 |
| S6 LoC | 2 | reorder 改写 |

**总评**：H2 实际不通过（破坏 V3 reorder 不变量），**reject**。

### 4.3 候选 C：树字段 `path: Vec<String>` materialized

**做法**：每个 Category 有 `path: Vec<String>` 表示从 root 到自身的 id 链；root 的 path 是 `[id]`，child 是 `[parent_id, id]`。

**硬约束评估**：

| 硬约束 | 通过？ |
|---|---|
| H1-H5 | PASS |

**软评分**：

| 维度 | 分数 | 说明 |
|---|---|---|
| S1 迁移成本 | 2 | 每个旧 Category 都要补 `path: [id]`，需要一次性 migration |
| S2 数据完整性 | 2 | 改父时 path 要重写，多余 invariant |
| S3 reorder | 4 | 还能用 apply_reorder，但 reorder 时不能改 path（必须分开 reorder + reparent commands） |
| S4 序列化简洁 | 2 | path 字段冗余 |
| S5 查询性能 | 5 | path 直接 |
| S6 LoC | 3 | |

**总评**：可工作但冗余。**reject**。

### 4.4 D2 候选汇总评分

| 候选 | 硬约束 | 软评（30）| 决策 |
|---|---|---|---|
| **A** parent_id field | PASS | **29** | **选 A** |
| B 嵌套 children | **FAIL（H2）** | 14 | reject |
| C materialized path | PASS | 18 | reject |

**D2 决策：A — `parent_id: Option<String>` 字段加到现有 Vec<Category>**。

---

## 5. D13 候选评估（hierarchy 失败模式）

> 本节回答："如果用户/前端/LLM 试图制造一个不合法的 hierarchy（自循环、超 depth、parent_id 指向不存在的 id），后端应该怎么处理？"

### 5.1 三种失败模式

- **F1: Cycle**（A 的 parent 是 B，B 的 parent 是 A）
- **F2: Depth > 2**（任何 child 又被设为另一个 child 的 parent）
- **F3: Orphan**（parent_id 指向不存在的 id；或父类被删除后 child 仍持有失效 parent_id）

### 5.2 候选 A：后端拒绝（reject with err）

**做法**：所有 mutating commands（add_category / update_category / 新的 set_category_parent）都做合法性校验；不合法直接 `Err(...)`。

| 失败模式 | 处理 | 说明 |
|---|---|---|
| F1 cycle | reject `"Cycle detected"` | 校验：从 new parent 一直追溯 parent_id 链，碰到 self 即拒绝 |
| F2 depth>2 | reject `"Hierarchy depth limit exceeded"` | 校验：parent.parent_id != None → 拒绝（hard cap=2） |
| F3 orphan | 删父时 cascade-promote children to root（`parent_id = None`）| 删除是 ContextMenu 操作，必须在 delete_category 命令里清理 |

**评分**：robustness 高，complexity 中。

### 5.3 候选 B：前端 prevent + 后端宽松接收

**做法**：前端 dnd-kit 拖拽时拒绝非法 drop（hover 在 invalid target 上时 cursor: not-allowed）；后端不做强校验。

**评分**：实现简单但不防御 IPC 恶意/bug 调用；不可作 SoT。

### 5.4 候选 C：自动平摊到根

**做法**：non-validating，后端碰到 cycle 时把 child 的 parent_id 设为 None。

**评分**：silent data corruption，**reject**。

### 5.5 D13 决策

**A + B 双层防御**：

- **后端 hard validate**（candidate A）作 SoT 闸门——任何 IPC 不论来源都安全
- **前端 prevent**（candidate B）作 UX 闸门——不让 bad drop 到达 IPC

两者**叠加不冲突**。具体规则：

- F1 cycle: backend reject + frontend `closestCenter` 排除子树
- F2 depth>2: backend reject + frontend "drop into" 在 child row 上 disabled（参 R2 / R3 的 D3/D4）
- F3 orphan: 删除父类时 backend `delete_category` cascade-promote 所有 `parent_id == deleted_id` 的子项到 root（`parent_id = None`），返回更新后的 categories 给前端校准

**额外约束**：`delete_category` 需要在 DATA_MUTEX 持锁内做 promote（不能 split），否则 lost update。

---

## 6. 最终建议（D1 + D2 + D13 综合）

### 6.1 最终决策

| 决策 | 选定 | 置信度 |
|---|---|---|
| **D1** category 引用方案 | **A — Skills/MCPs 迁移到 category_id（与 ClaudeMd 一致），保留 category（name）做 cached display + backward compat** | **88/100** |
| **D2** 数据模型形状 | **A — Category 加 `parent_id: Option<String>` 字段，仍是 flat Vec<Category>** | **94/100** |
| **D13** hierarchy 失败模式 | **A+B 双层防御（backend hard validate + frontend prevent + delete cascade-promote）** | **90/100** |

### 6.2 主要反对声音（持续记录）

1. **D1-A：双字段共存"冗余"**
   - 立场：保留 `Skill.category: String` 作 backup display + LLM 训练 sample，新增 `category_id: Option<String>` 作 SoT
   - 反对：维护两个字段难
   - 回应：`category` 字段在新 schema 下变成"上次写入时的快照名字"，类似缓存。Read 时优先 `category_id` → 查 categories 找 name → 兜底用 `category` 字段（旧数据未迁移时）。**这个 dual-write/dual-read 的复杂度被限定在 commands/skills.rs 与 commands/mcps.rs 内部，frontend 看到的只有 `categoryId`**

2. **D2-A：flat Vec 让 children 排序不直观**
   - 立场：所有 categories 在一个 Vec 里，要前端 group by parent_id 后渲染
   - 反对：渲染复杂度上升
   - 回应：渲染层 O(n) one-pass 建 children map（Map<parent_id|null, Category[]>），渲染时按 root → children 顺序展开。这是 R2 的事——R1 不接管渲染算法

3. **D13：删父类时 cascade-promote 而非 cascade-delete**
   - 立场：删除父类时把 children 提到 root（保留 children）
   - 反对：用户可能期望"删父类一并删 children"
   - 回应：与 macOS Finder / Things 3 / Notion 的"删除文件夹问 confirm"行为不同。本任务**强烈倾向 promote**——它符合极简哲学（"无必要勿增实体"），且 delete-cascade 影响 Skills/MCPs/ClaudeMd 引用的 category_id 全失效（必须二次删除元数据，复杂）。**最终该决定属于 02_design_spec / 04_implementation_plan 范围**，本文档建议 promote 但不强求

### 6.3 不确定性 / 主要风险

| 编号 | 不确定性 | 影响 | 缓解 |
|---|---|---|---|
| U1 | LLM autoClassify 是否仍能感知 hierarchy（D14）—— R1 不负责，但本设计要求 autoClassify chain 在新 category 落地时 `parent_id=None`，R6 必须确认 prompt 改造方案 | 中 | R6 报告决定。本文档假设 D14=A（不感知，落根），与建议兼容 |
| U2 | 双字段 dual-write 期间，并发 reorder 与 metadata 更新——`Skill.category` 是否要随 Category.name rename 跟随更新 | 低 | 不更新；read 时优先 `category_id` 解析得到当前 name |
| U3 | 旧用户 data.json 中 Skill.category 是 "Web"，但用户重命名 "Web" → "Network" 后 Skill.category 还是 "Web"（这是已有 bug）。新 schema 引入 `category_id` 后必须做"orphan name → 创建 / 关联到 id" 的迁移 | 中 | 一次性迁移：first-launch 时遍历 metadata，name→id 查表，找到则写 `category_id`，找不到则保留 name 为孤儿（兜底显示为 "Uncategorized"，参 §7）|
| U4 | parent_id 指向已删除 id（race：删父和重命名子并发） | 低 | DATA_MUTEX 已串行（V3 §3.1），不会并发 |
| U5 | 旧 Category 没有 parentId 字段；如果旧 user 有"Coding > API"语义但还是 flat 结构存的，迁移后会全部变 root。这是预期行为（不算回归） | 低 | 文档化预期 |

### 6.4 置信度分项

- D1-A 选择：**88**（数据迁移有非平凡迁移成本——见 §6.5；id-based 是行业最佳实践，ClaudeMd 已经是这样做的）
- D2-A 选择：**94**（serde `#[serde(default)]` 反序列化已验证；数据模型最简）
- D13 选择：**90**（双层防御标准做法，cascade-promote 偏好需 02 确认）
- 整体：**90**

---

## 7. 完整迁移规划（如选 D1-A + D2-A）

> 这是给 03_tech_plan 的执行清单。不是任务卡（属于 04_implementation_plan）；这里**只列改动点 + 估算 LoC**。

### 7.1 Rust 后端改动

#### 7.1.1 `src-tauri/src/types.rs`（+约 8 行）

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub name: String,
    pub color: String,
    pub count: u32,
    /// Parent category id. `None` = root level. Max depth = 2 (root + children).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,  // NEW
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,                         // KEEP (cached display name + backward compat)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,              // NEW (SoT)
    pub tags: Vec<String>,
    // ... 其余不变
}

// McpServer / SkillMetadata / McpMetadata 同样的字段加法
```

**关键 serde 行为**（已读 types.rs 全文 + cargo test 测过的：`test_category_serde_roundtrip` line 947）：

- `#[serde(default)]` on `Option<String>` field：旧 JSON 无此 key → 反序列化为 `None`（不报错）；这是 `serde-rs/serde@1.0.219` 标准行为。证据：`types.rs:653-654` 中 `ClaudeMdFile.category_id` 已用同模式且 working
- `#[serde(skip_serializing_if = "Option::is_none")]`：序列化时若为 `None` 不写入 key — 让旧用户的新写入 data.json 也不污染（保持简洁）
- `rename_all = "camelCase"`：`parent_id` → `parentId`（types.rs:5 已设全局）

#### 7.1.2 `src-tauri/src/commands/data.rs`

**新增 `update_category` 支持改 parentId**（+约 12 行）：

```rust
#[tauri::command]
pub fn update_category(
    id: String,
    name: Option<String>,
    color: Option<String>,
    parent_id: Option<Option<String>>,  // NEW: outer Option=请求是否要改；inner Option=新值（None=set to root）
) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    // Validate hierarchy if parent_id is being changed (D13-A)
    if let Some(ref new_parent_id_opt) = parent_id {
        if let Some(new_parent_id) = new_parent_id_opt {
            // F1: cycle detection
            if new_parent_id == &id {
                return Err("Cannot set category as its own parent".into());
            }
            // F2: depth limit
            if let Some(new_parent) = data.categories.iter().find(|c| &c.id == new_parent_id) {
                if new_parent.parent_id.is_some() {
                    return Err("Hierarchy depth limit exceeded (max 2)".into());
                }
            } else {
                // F3: orphan (parent doesn't exist)
                return Err(format!("Parent category {new_parent_id} not found"));
            }
            // Also: if `id` itself has any children, it cannot become a child (would push depth > 2)
            if data.categories.iter().any(|c| c.parent_id.as_deref() == Some(&id)) {
                return Err("Cannot demote a category that has children".into());
            }
        }
    }

    if let Some(category) = data.categories.iter_mut().find(|c| c.id == id) {
        if let Some(n) = name { category.name = n; }
        if let Some(c) = color { category.color = c; }
        if let Some(pid_opt) = parent_id { category.parent_id = pid_opt; }
        write_app_data(data)?;
        Ok(())
    } else {
        Err("Category not found".to_string())
    }
}
```

**新增 `delete_category` 的 cascade-promote 行为**（+约 6 行）：

```rust
#[tauri::command]
pub fn delete_category(id: String) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    // Cascade-promote: any child whose parent_id == deleted id becomes root
    for cat in data.categories.iter_mut() {
        if cat.parent_id.as_deref() == Some(&id) {
            cat.parent_id = None;  // promote to root
        }
    }

    data.categories.retain(|c| c.id != id);
    write_app_data(data)?;
    Ok(())
}
```

**新增 unit tests**（estimate +30 LoC）：
- `update_category_rejects_cycle`
- `update_category_rejects_depth_3`
- `update_category_rejects_orphan_parent`
- `update_category_rejects_demoting_with_children`
- `delete_category_promotes_children_to_root`

#### 7.1.3 `src-tauri/src/commands/skills.rs`（+约 8 行）

`update_skill_metadata` 接受新 `category_id` 参数：

```rust
#[tauri::command]
pub fn update_skill_metadata(
    skill_id: String,
    category: Option<String>,        // KEEP (cached display name)
    category_id: Option<String>,     // NEW (SoT)
    tags: Option<Vec<String>>,
    enabled: Option<bool>,
    icon: Option<String>,
) -> Result<(), String> {
    // ...
    if let Some(cat) = category { metadata.category = cat; }
    // 如果 category_id 改了，相应同步 cached name
    if let Some(cid) = category_id {
        metadata.category_id = Some(cid.clone());
        // 可选：从 categories 查 name 写入 metadata.category 作为 cache
        // 这步在 frontend 做更直观（frontend 已有 categories list）
    }
    // ...
}
```

`SkillMetadata` 加 `category_id: Option<String>` 字段（types.rs:178+）。

#### 7.1.4 `src-tauri/src/commands/mcps.rs`（+约 8 行）

对称改 `update_mcp_metadata` 与 `McpMetadata`。

#### 7.1.5 一次性迁移命令（+约 50 LoC）

新 `migrate_category_id_for_skills_mcps` 命令（首次升级时由前端触发；幂等）：

```rust
/// One-time migration: backfill `category_id` for skill_metadata / mcp_metadata
/// based on existing `category` (name) field. Idempotent — runs only when
/// category_id is None.
#[tauri::command]
pub fn migrate_category_id_for_skills_mcps() -> Result<MigrateReport, String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;
    let categories_by_name: HashMap<&str, &str> = data.categories.iter()
        .map(|c| (c.name.as_str(), c.id.as_str()))
        .collect();

    let mut migrated_skills = 0;
    let mut orphan_skills = 0;
    for meta in data.skill_metadata.values_mut() {
        if meta.category_id.is_some() { continue; }  // already migrated
        if meta.category.is_empty() { continue; }
        match categories_by_name.get(meta.category.as_str()) {
            Some(id) => {
                meta.category_id = Some(id.to_string());
                migrated_skills += 1;
            }
            None => {
                // Orphan: name doesn't match any current category — leave as-is, UI shows Uncategorized fallback
                orphan_skills += 1;
            }
        }
    }
    // 同样对 mcp_metadata
    write_app_data(data)?;
    Ok(MigrateReport { migrated_skills, orphan_skills, /* ... */ })
}
```

#### 7.1.6 lib.rs 注册（+约 3 行）

`tauri::generate_handler![...]` 增加 `migrate_category_id_for_skills_mcps`。`update_category` 与 `delete_category` 已注册（args 改了不需重注）。

#### 7.1.7 `commands/data.rs` 总集成测试（+约 30 LoC）

仿照 `reorder_integration_tests`：
- `update_category_with_parent_id_persists`
- `delete_category_promotes_grandchildren_to_root`（虽然 hard-cap=2 不存在 grandchildren，但作为 defense-in-depth）
- `migrate_category_id_idempotent`
- `migrate_category_id_orphan_left_unchanged`

**估算 Rust 总 LoC：+200**

### 7.2 Frontend 改动

#### 7.2.1 `src/types/index.ts`（+约 4 行）

```ts
export interface Category {
  id: string;
  name: string;
  color: string;
  count: number;
  parentId?: string;  // NEW: undefined = root
}

export interface Skill {
  // ...
  category: string;         // KEEP (cached display name + backward compat)
  categoryId?: string;      // NEW (SoT)
  // ...
}

export interface McpServer {
  // 同上
  category: string;
  categoryId?: string;
}
```

#### 7.2.2 `src/stores/appStore.ts`（+约 25 行）

`updateCategory` 加 `parentId` 参数 + version bump：

```ts
updateCategory: async (id: string, name?: string, color?: string, parentId?: string | null) => {
  // ...
  await safeInvoke('update_category', { id, name, color, parentId: parentId === undefined ? undefined : { Some: parentId } });
  // ⚠ 实际 IPC 类型注意：Tauri 把 Rust Option<Option<String>> 序列化成 nested
  set((state) => ({
    categories: state.categories.map((c) =>
      c.id === id
        ? { ...c, ...(name !== undefined && { name }), ...(color !== undefined && { color }), ...(parentId !== undefined && { parentId: parentId ?? undefined }) }
        : c,
    ),
    categoriesVersion: state.categoriesVersion + 1,
  }));
}
```

> **注意**：Rust `Option<Option<String>>` 在 Tauri IPC 表达不直观。**实际推荐**：用两个独立命令 `set_category_parent(id, parent_id: Option<String>)` 和 `update_category(id, name, color)`，避免 nested Option。这是 03_tech_plan 设计权衡。

#### 7.2.3 三个 store 的 `autoClassify` chain 改造（每个 +约 10 行）

`skillsStore.ts:381-401` 改造：

```ts
// 原代码
await safeInvoke('update_skill_metadata', {
  skillId: result.id,
  category: result.suggested_category,  // name
  tags: result.suggested_tags,
  icon: result.suggested_icon,
});

// 新代码
const updatedCategories = useAppStore.getState().categories;
const categoryId = updatedCategories.find(c => c.name === result.suggested_category)?.id;
await safeInvoke('update_skill_metadata', {
  skillId: result.id,
  category: result.suggested_category,  // 仍写 name 作 cached display
  categoryId,                           // NEW: SoT
  tags: result.suggested_tags,
  icon: result.suggested_icon,
});
```

> autoClassify 创建新 category 时（`addCategory` 调用），新 category 是 root（parent_id=None）—— 见 D14=A 假设。

`mcpsStore.ts` 与 `claudeMdStore.ts` 对称改（claudeMdStore 已经是 id 模式 line 496，**无需改**）。

#### 7.2.4 `src/components/layout/MainLayout.tsx:96-104` 派生改造（+约 4 行）

```ts
const categoriesWithCounts = useMemo(() => {
  // Build child→parent index for aggregation (D7=父类聚合：含子类总和)
  // 假设 D7 决定为 "父类显示自己 + 所有子类聚合"。如果 D7 选其他方案需改这里
  const childIdsByParent = new Map<string, string[]>();
  for (const cat of categories) {
    if (cat.parentId) {
      childIdsByParent.set(cat.parentId, [...(childIdsByParent.get(cat.parentId) ?? []), cat.id]);
    }
  }

  return categories.map((cat) => {
    const ownIds = [cat.id];
    const allIds = cat.parentId ? ownIds : [...ownIds, ...(childIdsByParent.get(cat.id) ?? [])];
    const allCats = allIds.map(id => categories.find(c => c.id === id)).filter(Boolean) as Category[];
    const allNames = new Set(allCats.map(c => c.name));
    return {
      ...cat,
      count:
        // 优先用 categoryId（新 SoT），fallback 用 name（旧/未迁移）
        skills.filter((s) => (s.categoryId ? allIds.includes(s.categoryId) : allNames.has(s.category))).length +
        mcpServers.filter((m) => (m.categoryId ? allIds.includes(m.categoryId) : allNames.has(m.category))).length +
        claudeMdFiles.filter((f) => f.categoryId && allIds.includes(f.categoryId)).length,
    };
  });
}, [categories, skills, mcpServers, claudeMdFiles]);
```

> **注**：D7（父类聚合视图）的最终决策由 R4/02_design_spec 决定。本 R1 给 default 实现（聚合）作 placeholder。如果选不聚合，去除 `childIdsByParent` 构建即可。

#### 7.2.5 `src/pages/CategoryPage.tsx:62-64` filter 改造（+约 8 行）

```ts
// 假设 D7 = 聚合
const collectIds = (root: string): string[] => {
  const out = [root];
  for (const c of categories) if (c.parentId === root) out.push(c.id);
  return out;
};
const allCategoryIds = useMemo(() => category ? collectIds(category.id) : [], [categories, category]);
const allCategoryNames = useMemo(() => allCategoryIds.map(id => categories.find(c => c.id === id)?.name).filter(Boolean), [categories, allCategoryIds]);

const categorySkills = skills.filter((s) =>
  s.categoryId ? allCategoryIds.includes(s.categoryId) : allCategoryNames.includes(s.category)
);
const categoryMcps = mcpServers.filter((m) =>
  m.categoryId ? allCategoryIds.includes(m.categoryId) : allCategoryNames.includes(m.category)
);
const categoryClaudeMd = claudeMdFiles.filter((f) => f.categoryId && allCategoryIds.includes(f.categoryId));
```

#### 7.2.6 `src/components/skills/SkillDetailPanel.tsx:240-247, 414` dropdown 改造（+约 10 行）

```ts
// 旧 categoryOptions
const categoryOptions = useMemo(() => {
  // 树形：root + children indented
  const roots = categories.filter(c => !c.parentId);
  const childrenByParent = /* derive */;
  const options: { value: string; label: string; color: string; depth: number }[] = [];
  for (const root of roots) {
    options.push({ value: root.id, label: root.name, color: root.color || '#71717A', depth: 0 });
    for (const child of childrenByParent.get(root.id) ?? []) {
      options.push({ value: child.id, label: child.name, color: child.color || '#71717A', depth: 1 });
    }
  }
  return [{ value: '', label: 'Uncategorized', color: '#71717A', depth: 0 }, ...options];
}, [categories]);

// dropdown value 改为 selectedSkill.categoryId 或 (兜底)从 name 反查 id
<Dropdown
  value={selectedSkill.categoryId ?? categories.find(c => c.name === selectedSkill.category)?.id ?? ''}
  onChange={(newCategoryId) => updateSkillCategory(selectedSkill.id, newCategoryId)}
  ...
/>
```

> 实际 dropdown 视觉规格（缩进表达）由 R3 决定。本文不绑定。

`McpDetailPanel.tsx` 对称改。

#### 7.2.7 `src/components/skills/SkillItem.tsx` / `SkillListItem.tsx` 显示改造（约 +10 行总）

display 优先用 `categoryId` resolve 当前 name，fallback 用 `skill.category`：

```ts
const displayCategory = useMemo(() => {
  if (skill.categoryId) {
    const cat = categories.find(c => c.id === skill.categoryId);
    if (cat) return cat.name;
  }
  return skill.category;  // 兜底（未迁移 / orphan）
}, [skill, categories]);
```

#### 7.2.8 stores updateSkillCategory / updateMcpCategory 改造（每个 +约 6 行）

`skillsStore.ts:158-192` 当前签名 `updateSkillCategory: (id, category)` —— 现在内涵需切换到 categoryId：

```ts
updateSkillCategory: async (id, categoryId) => {
  const skill = get().skills.find((s) => s.id === id);
  if (!skill) return;
  const oldCategoryId = skill.categoryId;
  const newCategory = useAppStore.getState().categories.find(c => c.id === categoryId);
  const newName = newCategory?.name ?? '';

  // Optimistic
  set((state) => ({
    skills: state.skills.map((s) =>
      s.id === id ? { ...s, categoryId, category: newName } : s
    ),
  }));

  try {
    await safeInvoke('update_skill_metadata', {
      skillId: id,
      categoryId,
      category: newName,  // dual-write
    });
  } catch (e) { /* rollback to oldCategoryId / oldCategory */ }
}
```

#### 7.2.9 删除关注 `Skill.category` 唯一来源（**不删除字段**）

确认在最终 02/03 文档中：**`Skill.category` / `McpServer.category` 字段仍保留**，作为 cached display name + LLM training sample + 旧数据 backward compat 渠道。**未来某次升级**才考虑彻底删除。

**估算 Frontend 总 LoC：+150**

### 7.3 一次性迁移触发点

`MainLayout.tsx:initApp` 或 `appStore.ts:initApp`（line ~125）首次启动 detect：

```ts
// In initApp or first-launch hook
const settings = await safeInvoke<AppSettings>('read_settings');
if (!settings.hasCompletedCategoryIdMigration /* new flag */) {
  await safeInvoke('migrate_category_id_for_skills_mcps');
  await safeInvoke('write_settings', { settings: { ...settings, hasCompletedCategoryIdMigration: true } });
}
```

新增 `AppSettings.has_completed_category_id_migration: bool` field（types.rs:202）。

**估算迁移触发 LoC：+15**

### 7.4 总 LoC 估算

- Rust 后端：+200
- Frontend：+150
- 迁移触发：+15
- **合计：约 +365 LoC（不含测试约 +120 LoC）**

### 7.5 改动文件清单（grep 验证）

每条 grep 命中点都需在 04_implementation_plan 中分配任务卡。本表是 grep 结果合集后筛选了 hierarchy 相关的：

| 类别 | 文件 | 改 / 不改 | 备注 |
|---|---|---|---|
| Rust types | `src-tauri/src/types.rs` | 改 | Category +parentId；Skill / McpServer / SkillMetadata / McpMetadata +categoryId |
| Rust commands | `src-tauri/src/commands/data.rs` | 改 | update_category +parentId 校验；delete_category +cascade-promote |
| Rust commands | `src-tauri/src/commands/skills.rs` | 改 | update_skill_metadata +categoryId |
| Rust commands | `src-tauri/src/commands/mcps.rs` | 改 | update_mcp_metadata +categoryId |
| Rust commands | `src-tauri/src/commands/claude_md.rs` | **不改** | 已是 id 引用 |
| Rust commands | `src-tauri/src/commands/classify.rs` | **不改**（D14=A 假设）| LLM prompt 不变；新分类落根（parent_id=None）由 frontend 处理 |
| Rust commands | `src-tauri/src/commands/trash.rs` | **不改** | category_id 字段语义不变 |
| Rust lib | `src-tauri/src/lib.rs` | 改 | +migrate_category_id_for_skills_mcps 注册 |
| Frontend types | `src/types/index.ts` | 改 | Category / Skill / McpServer 加 parentId / categoryId |
| Frontend types | `src/types/claudeMd.ts` | 不改 | 已正确 |
| Frontend store | `src/stores/appStore.ts` | 改 | updateCategory +parentId（或新 set_category_parent） |
| Frontend store | `src/stores/skillsStore.ts` | 改 | updateSkillCategory +categoryId；autoClassify name→id 映射 |
| Frontend store | `src/stores/mcpsStore.ts` | 改 | 同上 |
| Frontend store | `src/stores/claudeMdStore.ts` | **不改** | 已是 id |
| Frontend layout | `src/components/layout/MainLayout.tsx` | 改 | categoriesWithCounts 加 hierarchy 聚合（D7） |
| Frontend layout | `src/components/layout/Sidebar.tsx` | 改（视觉/树）—— 由 R2/R3 主导 | route 仍 `/category/${id}`（不动）|
| Frontend pages | `src/pages/CategoryPage.tsx` | 改 | filter 加聚合（D7） |
| Frontend pages | `src/pages/SkillsPage.tsx`, `McpServersPage.tsx`, `ClaudeMdPage.tsx`, `SceneDetailPage.tsx`, `ScenesPage.tsx`, `SkillDetailPage.tsx`, `McpDetailPage.tsx` | 改（dropdown 选项树形） | 由 R3 / R4 主导 dropdown 视觉 |
| Frontend skill comp | `src/components/skills/SkillDetailPanel.tsx`, `SkillItem.tsx`, `SkillListItem.tsx` | 改 | display fallback for categoryId |
| Frontend mcp comp | `src/components/mcps/McpDetailPanel.tsx`, `McpItem.tsx`, `McpListItem.tsx` | 改 | 同上 |
| Frontend claudeMd comp | `src/components/claude-md/ClaudeMdDetailPanel.tsx`, `ClaudeMdCard.tsx` | 改（dropdown 树形） | dropdown options |
| Scenes / CreateSceneModal | `src/components/scenes/CreateSceneModal.tsx` | 改 | categoryFilter（line 487）现在 `item.category` 是 name string，新模型下需要 fallback resolve from categoryId |
| Scenes store | `src/stores/scenesStore.ts:21,81` | **可能不改** | `categoryFilter: string` 当前 store 在 CreateSceneModal 中是 local state，**不是 sceneStore 的 field**——line 21 应是另一字段（scene 的 categoryFilter），需确认；R5 Impact 报告会进一步确认 |
| Frontend constants | `src/utils/constants.ts` | **不改** | getCategoryColor 依赖 `Category.color`，name 仍存在 |
| Tests | `src/utils/__tests__/constants.test.ts` | 不改 | |
| Tests | `src-tauri/src/commands/data.rs::tests` | **加** | hierarchy validation tests |

### 7.6 grep 重新执行（plan 末尾）

```
$ rg -n --no-heading 'category_id|categoryId' src-tauri/src
src-tauri/src/commands/trash.rs:401:                category_id: file_info.category_id,
src-tauri/src/commands/trash.rs:436:                category_id: None,
src-tauri/src/commands/claude_md.rs:371:        category_id: options.category_id,
src-tauri/src/commands/claude_md.rs:497:/// * `category_id` - New category (optional)
src-tauri/src/commands/claude_md.rs:506:    category_id: Option<String>,
src-tauri/src/commands/claude_md.rs:541:    if let Some(cid) = category_id {
src-tauri/src/commands/claude_md.rs:542:        file.category_id = Some(cid);
src-tauri/src/commands/claude_md.rs:704:                category_id: None,
src-tauri/src/types.rs:653:    pub category_id: Option<String>,
src-tauri/src/types.rs:741:    pub category_id: Option<String>,
```

**新模型下需新增 `category_id` 命中点**（plan 实施后可重 grep 验证）：
- `types.rs`：Skill / McpServer / SkillMetadata / McpMetadata +1 each = 4 新行
- `commands/skills.rs::update_skill_metadata` +1
- `commands/mcps.rs::update_mcp_metadata` +1
- `commands/data.rs::migrate_category_id_for_skills_mcps` +N
- `commands/data.rs::update_category` 涉及 parent_id +N
- 总新增引用：>= 8 行

---

## 8. 回归测试清单（≥ 12 项）

> 参 `.claude/rules/grep-before-enumerate-shared-resource.md`：测试覆盖必须从 grep 验证、不靠脑补。本清单按 grep 命中点分类，每行 grep 都有对应测试覆盖。

### 8.1 Rust 后端测试（新加 + 现有不破坏）

1. **现有 apply_reorder 测试 6 个仍 100% 通过**（data.rs:555-633；改 Category struct 不破坏 `HasId trait`）
2. **现有 reorder_integration_tests 5 个仍通过**（data.rs:636-815；ScopedDataDir 模式继续 work）
3. **新增 `update_category_with_parent_id_persists`** — 设 parent_id 后 read 回来正确
4. **新增 `update_category_rejects_self_as_parent`** — F1 cycle
5. **新增 `update_category_rejects_grandchild_attempt`** — F2 depth>2
6. **新增 `update_category_rejects_parent_with_children`**（防止 demote 已有子类的项）
7. **新增 `update_category_rejects_orphan_parent`** — F3 orphan
8. **新增 `delete_category_promotes_children_to_root`** — D13 cascade
9. **新增 `migrate_category_id_idempotent`**（第二次跑不重复迁移）
10. **新增 `migrate_category_id_orphan_left_unchanged`** — name 找不到对应 category 时 metadata 保 category_id=None

### 8.2 Rust 后端并发测试

11. **新增 `concurrent_update_category_parent_and_add_child_no_orphan`** — 模拟用户并发 promote 父和新增子，DATA_MUTEX 保证不出 orphan

### 8.3 Frontend 测试（vitest）

12. **新增 `appStore.reorder.test.ts::reorder_categories_preserves_parent_id`**（reorder root 不影响 children parent_id）
13. **新增 `appStore.test.ts::updateCategory_with_parentId_optimistic_update`** + version bump
14. **新增 `MainLayout.categoriesWithCounts.test.tsx`** — 父类显示自己 + 所有子类聚合
15. **新增 `CategoryPage.filter.test.tsx`** — filter 在 hierarchy 下正确（categoryId 优先；fallback name 命中）
16. **新增 `skillsStore.autoClassify.test.ts::categoryId_set_after_classify`** — LLM 返回 name → store 找到 categoryId 写入

### 8.4 集成测试（E2E type）

17. **新增 type round-trip test in `src-tauri/src/types.rs`**：`test_category_with_parent_id_serde`（包括 `parentId: null` 与 `parentId: "abc"` 两个方向）
18. **新增**: 检验旧 data.json（无 `parentId` 字段）反序列化后 categories 全部为 root

### 8.5 手动 / 主 Agent dev mode 验证（jsdom 不支持 PointerEvent）

19. 拖拽 Skill / MCP / ClaudeMd category dropdown 选 child category，detail panel 显示正确 name
20. 删除父类 → children 提到 root（dnd 视觉 confirm）
21. 重命名父类 → 所有 Skill/MCP/ClaudeMd 显示新名字（categoryId 解析路径）

---

## 9. 主要风险与缓解

| 风险 | 严重度 | 缓解 |
|---|---|---|
| **dual-write race** between Skill.category and Skill.categoryId | 中 | DATA_MUTEX 已串行；Frontend store 优化先做 optimistic（dual-write 同帧），不引入新 race |
| 用户旧 `Category.name`（用于 metadata）含 `/` 字符 | 低（D1=A 不需 path）| 选 D1=A 后此类问题不存在；如果 D1=C 则严重 |
| **autoClassify cycle bug**（autoClassify reload categories → version mismatch → 跳过 set，新 category_id 看不到）| 中 | 现在 stores 已有 `loadCategories` + version check（appStore.ts:184-194）。autoClassify 改造后，仍依赖 `useAppStore.getState().categories` 的最新 snapshot——这部分**主 Agent + R6 必须复测** |
| **D7 决策（聚合 yes/no）影响 §7.2.4 / 7.2.5** —— 我现在写的是聚合 default，万一选 not-aggregate 需重写 | 中 | R4 报告决定后 02_design_spec 同步；本 R1 §7 只是 placeholder，Real implementation 在 04_impl 落地 |
| **依赖 R2 决定 dnd-kit 怎么拖父子**——R1 提供了 set_category_parent 命令；但 R2 决定的"拖入"语义与本文档描述的 update_category(parent_id) IPC 必须对齐 | 高 | 02_design_spec 锁 D3-D6 后 04_impl 与 R1 IPC 锁同步 |

---

## 10. 给 02_design_spec / 03_tech_plan 作者的关键 takeaway

### 给 02_design_spec 的 5 个关键事实

1. **Category 多了一个 `parentId?: string` 字段**（depth=2 硬限）；UI 区分 root vs child 只需读这个字段
2. **Skills/MCPs 引用 category 的 SoT 从 name string 切换到 categoryId UUID**；UI dropdown / filter / count 都以 categoryId 为主，name 仅作 cached display
3. **重命名父类 → 所有子项视觉立即同步**（无需 cascade migration），原因：id 引用
4. **删除父类 → 子类自动 promote 到 root**（D13），不删除 Skills/MCPs（它们仍指向"已晋升"的 child）
5. **autoClassify 创建的新分类落到 root**（D14=A 假设；待 R6 确认）

### 给 03_tech_plan 的 5 个关键事实

1. **Category +parent_id 字段使用 `#[serde(default, skip_serializing_if = "Option::is_none")]`**；旧 data.json 反序列化为 None；新写入若 None 不污染 JSON
2. **`update_category` 命令必须 hard validate hierarchy**（D13-A：cycle / depth>2 / orphan / demote-with-children），所有校验在 DATA_MUTEX 持锁内完成
3. **`delete_category` 必须 cascade-promote children**（在持锁内）；别让 frontend 做这件事，否则并发不 safe
4. **新增一次性迁移命令 `migrate_category_id_for_skills_mcps`**，幂等；首次启动由 frontend 触发；伴随 `AppSettings.has_completed_category_id_migration` flag
5. **现有 V3 不变量全部不受影响**（DATA_MUTEX、apply_reorder pure 不变、enqueueReorder 队列、categoriesVersion 协议、ENSEMBLE_DATA_DIR test 隔离）；本文 §7 总改动 +200 Rust LoC + 150 Frontend LoC，规模可控

### 给 04_implementation_plan 作者的 takeaway

任务卡建议至少拆成 5 个：
- T-DM-1：Rust types.rs +parent_id / +category_id（含 unit roundtrip tests）
- T-DM-2：Rust update_category + delete_category + apply_reorder 校验（含 hierarchy unit + integration tests）
- T-DM-3：Rust migrate_category_id 命令 + AppSettings flag（含 idempotent / orphan 测试）
- T-DM-4：Frontend types/index.ts + appStore + 三个 store 的 categoryId 改造（含 reorder_test / autoClassify_test）
- T-DM-5：Frontend MainLayout / CategoryPage / dropdowns / display components（含 categories aggregation 测试）

依赖关系：T-DM-1 → T-DM-2/3 并行 → T-DM-4 → T-DM-5。

---

## 11. Confidence

- **D1-A 选择**：88/100（数据迁移路径清晰，与 ClaudeMd 现有模式完全一致；唯一不确定是双字段共存期间的 read priority bug 需谨慎）
- **D2-A 选择**：94/100（serde behavior 已 cargo test 验证；`#[serde(default)]` on `Option<String>` 是项目已用过 7 次的稳定模式 — 见 types.rs grep 结果）
- **D13 选择**：90/100（双层防御 + cascade-promote 是行业标准；唯一不确定是用户对 promote vs cascade-delete 的偏好——属于 02_design_spec 范围）
- **整体置信度**：**90/100**

主要不确定来源：
- D14（autoClassify 是否感知 hierarchy）—— 由 R6 报告
- D7（父类聚合视图）—— 由 R4 报告
- R3 决定的 dropdown 视觉是否需要单独 dropdown component / 是否限制只能选 leaf

---

## 12. 一句话给 02_design_spec / 03_tech_plan 作者

**把 Skills/MCPs 的 category 引用统一迁到 categoryId（与 ClaudeMd 一致），Category 加 `parentId?: string` 字段保持 flat Vec 不嵌套；所有 hierarchy 合法性校验放在 backend `update_category` / `delete_category` 持 DATA_MUTEX 内做，frontend 只负责拒绝非法 drop —— 总改动 ~365 LoC，不破坏任何 V3 Reorder 不变量。**
