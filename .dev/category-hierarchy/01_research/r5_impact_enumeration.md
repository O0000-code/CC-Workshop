# R5 — 全 codebase 影响面 grep 枚举（防遗漏的兜底闸）

> **Referential 文档**。任何处理意图与 02/03 决议冲突时以高层级 Decisional 为准。
> 本报告的产物来源是 ripgrep 输出，非主观 file-shaped 心智模型。
> 履行规则：`.claude/rules/grep-before-enumerate-shared-resource.md`。

---

## 0. 已读基线 checklist

- [x] `.dev/category-hierarchy/00_understanding.md`（任务边界 + 14 决策清单 + 风险登记 §7）
- [x] `.dev/category-hierarchy/01_research/_dispatch_plan.md`（R5 任务规格）
- [x] `.claude/rules/grep-before-enumerate-shared-resource.md`（核心规则）
- [x] `.dev/sidebar-reorder/03_tech_plan.md` V3（V3 不变量必背）
- [x] `~/.claude/rules/document-authority-ranking.md`
- [x] `~/.claude/rules/plan-as-research-design.md`
- [x] `~/.claude/rules/hard-constraints-before-soft-evaluation.md`
- [x] `.claude/rules/cross-document-cascade-discipline.md`
- [x] `.claude/rules/verify-third-party-behavior-firsthand.md`
- [x] `.claude/rules/validate-numerical-equivalence-claims.md`

---

## 1. 执行的全部 grep 命令（按 dispatch plan §R5 顺序）

```bash
# G1
rg -n --no-heading 'categor' src/ src-tauri/src/
# G2
rg -n --no-heading '\.category\b' src/ src-tauri/src/
# G3
rg -n --no-heading '\.categoryId\b' src/
# G4
rg -n --no-heading 'category_id' src-tauri/src/
# G5
rg -n --no-heading 'categories' src/ src-tauri/src/
# G6
rg -n --no-heading 'parentId|parent_id' src/ src-tauri/src/
# G7
rg -n --no-heading 'hierarchy|hierar|nested|depth|parent|child' src/components/sidebar
# G8
rg -n --no-heading 'getCategoryColor|categoryColors' src/
# G9
rg -n --no-heading 'CategoryPage|category/:|/category/' src/
# G10
rg -n --no-heading 'SortableCategor' src/
# G11
rg -n --no-heading 'reorder_categor|reorderCategor' src/ src-tauri/src/
# G12
rg -n --no-heading 'setCategoriesFilter|categoryFilter' src/
# G13
rg -n --no-heading 'add_category|update_category|delete_category|get_categories' src-tauri/src/
# G14
rg -n --no-heading 'categoryOptions' src/
# G15
rg -n --no-heading 'categories: \[' src/ src-tauri/src/

# 额外补扫
# G16  category in tauriMock + tests + trash.rs
rg -n --no-heading 'category|Category' src/test/helpers/tauriMock.ts src/components/__tests__ src/utils/__tests__ src/stores/__tests__ src-tauri/src/commands/trash.rs
# G17 docs / agents / changelog / readme
rg -n --no-heading 'category|Category' docs/ AGENTS.md CHANGELOG.md CONTRIBUTING.md README.md CLAUDE.md
# G18 dynamic url string
rg -n --no-heading "'/category/" src/
# G19 active / editing / adding category state
rg -n --no-heading 'active.category|activeCategory' src/
rg -n --no-heading 'editingCategoryId|isAddingCategory|startEditingCategory|stopEditingCategory|startAddingCategory|stopAddingCategory' src/
# G20 announcements / a11y / aria
rg -n --no-heading 'aria-label.*category|"category"' src/components/sidebar/dnd
# G21 import.rs / plugins.rs / config.rs (real category refs only)
rg -n --no-heading 'category|Category' src-tauri/src/commands/import.rs src-tauri/src/commands/plugins.rs src-tauri/src/commands/config.rs
```

行数总览（每命令的 rg 原始 stdout 行数）：

| Cmd | Lines |
|---|---|
| G1 `categor` | 569 |
| G2 `\.category\b` | 55 |
| G3 `\.categoryId\b` | 10 |
| G4 `category_id` | 10 |
| G5 `categories` | 171 |
| G6 `parentId\|parent_id` | **0** |
| G7 hierarchy/nested/parent/child in sidebar | 15 |
| G8 `getCategoryColor\|categoryColors` | 36 |
| G9 `CategoryPage\|category/:\|/category/` | 9 |
| G10 `SortableCategor` | 19 |
| G11 `reorder_categor\|reorderCategor` | 19 |
| G12 `setCategoriesFilter\|categoryFilter` | 6 |
| G13 `add_category\|update_category\|delete_category\|get_categories` | 13 |
| G14 `categoryOptions` | 10 |
| G15 `categories: [` | 3 |

> G6 = 0 行：codebase 当前**没有任何** `parentId`/`parent_id` 字段；引入 hierarchy = 全新增字段（无 collision 风险）。

下面 §2 是每个 grep 命令原始输出的完整粘贴；§3 是按文件分组的 impact 表与决议；§4-7 是配套清单。

---

## 2. 每个 grep 命令的完整原始输出

### G1：`rg -n --no-heading 'categor' src/ src-tauri/src/`（569 行 — 所有 categor 出现）

```text
src-tauri/src/commands/trash.rs:401:                category_id: file_info.category_id,
src-tauri/src/commands/trash.rs:436:                category_id: None,
src/pages/SceneDetailPage.tsx:69:const getSkillIcon = (category: string) => skillIconMap[category] || skillIconMap.default;
src/pages/SceneDetailPage.tsx:70:const getMcpIcon = (category: string) => mcpIconMap[category] || mcpIconMap.default;
src/pages/SceneDetailPage.tsx:382:                      const SkillIcon = getSkillIcon(skill.category);
src/pages/SceneDetailPage.tsx:410:                      const McpIcon = getMcpIcon(mcp.category);
src-tauri/src/commands/mcps.rs:49:/// Update MCP metadata (category, tags, enabled status)
src-tauri/src/commands/mcps.rs:53:    category: Option<String>,
src-tauri/src/commands/mcps.rs:71:    if let Some(cat) = category {
src-tauri/src/commands/mcps.rs:72:        metadata.category = cat;
src-tauri/src/commands/mcps.rs:144:        category: metadata.map(|m| m.category.clone()).unwrap_or_default(),
src/pages/CategoryPage.tsx:25:  const { categoryId } = useParams<{ categoryId: string }>();
src/pages/CategoryPage.tsx:34:  const { categories } = useAppStore();
src/pages/CategoryPage.tsx:39:  // Find current category
src/pages/CategoryPage.tsx:40:  const category = categories.find((c) => c.id === categoryId);
src/pages/CategoryPage.tsx:41:  // Get category name for filtering (skill.category stores name, not id)
src/pages/CategoryPage.tsx:42:  const categoryName = category?.name;
src/pages/CategoryPage.tsx:58:  // Filter skills, mcps, and claudeMd by category, then by search
src/pages/CategoryPage.tsx:60:    // First filter by category name (skill.category stores the category name, not id)
src/pages/CategoryPage.tsx:61:    // For claudeMd, filter by categoryId (claudeMd uses ID, not name)
src/pages/CategoryPage.tsx:62:    const categorySkills = skills.filter((s) => s.category === categoryName);
src/pages/CategoryPage.tsx:63:    const categoryMcps = mcpServers.filter((m) => m.category === categoryName);
src/pages/CategoryPage.tsx:64:    const categoryClaudeMd = claudeMdFiles.filter((f) => f.categoryId === categoryId);
src/pages/CategoryPage.tsx:69:        skills: categorySkills,
src/pages/CategoryPage.tsx:70:        mcps: categoryMcps,
src/pages/CategoryPage.tsx:71:        claudeMd: categoryClaudeMd,
src/pages/CategoryPage.tsx:77:      skills: categorySkills.filter(
src/pages/CategoryPage.tsx:82:      mcps: categoryMcps.filter(
src/pages/CategoryPage.tsx:87:      claudeMd: categoryClaudeMd.filter(
src/pages/CategoryPage.tsx:93:  }, [skills, mcpServers, claudeMdFiles, categoryName, categoryId, search]);
src/pages/CategoryPage.tsx:158:  const displayCategoryName = categoryName || 'Unknown Category';
src/pages/CategoryPage.tsx:190:          <FilteredEmptyState type="category" />
src/pages/CategoryPage.tsx:232:          <FilteredEmptyState type="category" />
src-tauri/src/commands/data.rs:10:/// concurrent `reorder_categories` + `add_category` invocations can lose
src-tauri/src/commands/data.rs:15:/// Pure read commands (`get_categories`, `get_tags`, ...) do not acquire
src-tauri/src/commands/data.rs:166:            categories: vec![
src-tauri/src/commands/data.rs:212:/// Get all categories
src-tauri/src/commands/data.rs:214:pub fn get_categories() -> Result<Vec<Category>, String> {
src-tauri/src/commands/data.rs:216:    Ok(data.categories)
src-tauri/src/commands/data.rs:219:/// Add a new category
src-tauri/src/commands/data.rs:221:pub fn add_category(name: String, color: String) -> Result<Category, String> {
src-tauri/src/commands/data.rs:225:    let category = Category {
src-tauri/src/commands/data.rs:232:    data.categories.push(category.clone());
src-tauri/src/commands/data.rs:235:    Ok(category)
src-tauri/src/commands/data.rs:238:/// Update a category
src-tauri/src/commands/data.rs:240:pub fn update_category(id: String, name: Option<String>, color: Option<String>) -> Result<(), String> {
src-tauri/src/commands/data.rs:244:    if let Some(category) = data.categories.iter_mut().find(|c| c.id == id) {
src-tauri/src/commands/data.rs:246:            category.name = n;
src-tauri/src/commands/data.rs:249:            category.color = c;
src-tauri/src/commands/data.rs:258:/// Delete a category
src-tauri/src/commands/data.rs:260:pub fn delete_category(id: String) -> Result<(), String> {
src-tauri/src/commands/data.rs:263:    data.categories.retain(|c| c.id != id);
src-tauri/src/commands/data.rs:268:/// Reorder categories. Returns the resulting `Vec<Category>` for client-side
src-tauri/src/commands/data.rs:273:pub fn reorder_categories(orderedIds: Vec<String>) -> Result<Vec<Category>, String> {
src-tauri/src/commands/data.rs:276:    data.categories = apply_reorder(data.categories, &orderedIds);
src-tauri/src/commands/data.rs:277:    let result = data.categories.clone();
src-tauri/src/commands/data.rs:696:    fn seed(categories: Vec<Category>, tags: Vec<Tag>) {
src-tauri/src/commands/data.rs:698:            categories,
src-tauri/src/commands/data.rs:706:    fn reorder_categories_persists_order() {
src-tauri/src/commands/data.rs:710:        let result = reorder_categories(vec!["C".into(), "A".into(), "B".into()])
src-tauri/src/commands/data.rs:711:            .expect("reorder_categories");
src-tauri/src/commands/data.rs:720:            reloaded.categories.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(),
src-tauri/src/commands/data.rs:726:    fn reorder_categories_returns_canonical_vec() {
src-tauri/src/commands/data.rs:731:        let result = reorder_categories(vec!["B".into()]).expect("reorder_categories");
src-tauri/src/commands/data.rs:758:    fn reorder_categories_unknown_id_is_skipped() {
src-tauri/src/commands/data.rs:762:        let result = reorder_categories(vec!["X".into(), "B".into(), "A".into()])
src-tauri/src/commands/data.rs:763:            .expect("reorder_categories");
src-tauri/src/commands/data.rs:775:        // that all 10 added categories survive in the final on-disk state.
src-tauri/src/commands/data.rs:781:        // 10 add_category threads.
src-tauri/src/commands/data.rs:784:                add_category(format!("new-{i}"), "#FFFFFF".to_string())
src-tauri/src/commands/data.rs:785:                    .expect("add_category");
src-tauri/src/commands/data.rs:789:        // 10 reorder_categories threads (no-op orderings drawn from the seed).
src-tauri/src/commands/data.rs:792:                let _ = reorder_categories(vec!["C".into(), "A".into(), "B".into()]);
src-tauri/src/commands/data.rs:800:        // After all threads join, every added category must be present.
src-tauri/src/commands/data.rs:803:        assert_eq!(final_data.categories.len(), 13, "lost updates detected");
src-tauri/src/commands/data.rs:805:        // Verify all 10 newly added categories are present (any order).
src-tauri/src/commands/data.rs:807:            final_data.categories.iter().map(|c| c.name.as_str()).collect();
src-tauri/src/commands/data.rs:812:                "added category {expected_name} was lost — DATA_MUTEX did not serialise mutations",
src/pages/McpDetailPage.tsx:33:const getIcon = (category: string): React.ElementType => {
src/pages/McpDetailPage.tsx:34:  return iconMap[category] || iconMap.default;
src/pages/McpDetailPage.tsx:37:// Get icon for MCP server - prioritizes custom icon over category-based icon
src/pages/McpDetailPage.tsx:38:const getMcpIcon = (mcp: { icon?: string; category: string }): React.ElementType => {
src/pages/McpDetailPage.tsx:43:  // 回退到原有逻辑（根据 category 或默认图标）
src/pages/McpDetailPage.tsx:44:  return getIcon(mcp.category);
src/pages/McpDetailPage.tsx:295:          <Badge variant="category" color="#18181B">
src/pages/McpDetailPage.tsx:296:            {selectedMcp.category}
src/pages/McpServersPage.tsx:57:const getIcon = (category: string): React.ElementType => {
src/pages/McpServersPage.tsx:58:  return iconMap[category] || iconMap.default;
src/pages/McpServersPage.tsx:61:// Get icon for MCP server - prioritizes custom icon over category-based icon
src/pages/McpServersPage.tsx:62:const getMcpIcon = (mcp: { icon?: string; category: string }): React.ElementType => {
src/pages/McpServersPage.tsx:67:  // 回退到原有逻辑（根据 category 或默认图标）
src/pages/McpServersPage.tsx:68:  return getIcon(mcp.category);
src/pages/McpServersPage.tsx:172:  const { categories, tags: appTags, addTag: addGlobalTag } = useAppStore();
src/pages/McpServersPage.tsx:219:  // Category dropdown options - only use categories from appStore
src/pages/McpServersPage.tsx:220:  const categoryOptions = useMemo(() => {
src/pages/McpServersPage.tsx:221:    const options = categories.map((cat) => ({
src/pages/McpServersPage.tsx:226:    // Add Uncategorized option at the beginning
src/pages/McpServersPage.tsx:227:    return [{ value: '', label: 'Uncategorized', color: '#71717A' }, ...options];
src/pages/McpServersPage.tsx:228:  }, [categories]);
src/pages/McpServersPage.tsx:290:  // Handle category change
src/pages/McpServersPage.tsx:291:  const handleCategoryChange = (category: string | string[]) => {
src/pages/McpServersPage.tsx:292:    if (selectedMcpId && typeof category === 'string') {
src/pages/McpServersPage.tsx:293:      updateMcpCategory(selectedMcpId, category);
src/pages/McpServersPage.tsx:428:            options={categoryOptions}
src/pages/McpServersPage.tsx:429:            value={selectedMcp.category || ''}
src/pages/McpServersPage.tsx:431:            placeholder="Select category"
src/pages/SkillDetailPage.tsx:56:const categoryIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
src/pages/SkillDetailPage.tsx:76:  // Priority 3: Fall back to category icon
src/pages/SkillDetailPage.tsx:77:  if (categoryIconMap[skill.category]) {
src/pages/SkillDetailPage.tsx:78:    return categoryIconMap[skill.category];
src/pages/SkillDetailPage.tsx:89:const categoryColors: Record<string, string> = {
src/pages/SkillDetailPage.tsx:337:              style={{ backgroundColor: categoryColors[selectedSkill.category] || '#71717A' }}
src/pages/SkillDetailPage.tsx:340:              {selectedSkill.category.charAt(0).toUpperCase() + selectedSkill.category.slice(1)}
src-tauri/src/commands/skills.rs:59:/// Update skill metadata (category, tags, enabled status, icon)
src-tauri/src/commands/skills.rs:63:    category: Option<String>,
src-tauri/src/commands/skills.rs:82:    if let Some(cat) = category {
src-tauri/src/commands/skills.rs:83:        metadata.category = cat;
src-tauri/src/commands/skills.rs:208:        category: metadata.map(|m| m.category.clone()).unwrap_or_default(),
src/pages/SkillsPage.tsx:60:const categoryIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
src/pages/SkillsPage.tsx:80:  // Priority 3: Fall back to category icon
src/pages/SkillsPage.tsx:81:  if (categoryIconMap[skill.category]) {
src/pages/SkillsPage.tsx:82:    return categoryIconMap[skill.category];
src/pages/SkillsPage.tsx:200:  const { categories, tags: appTags, addTag: addGlobalTag } = useAppStore();
src/pages/SkillsPage.tsx:218:  // Category dropdown options - only use categories from appStore
src/pages/SkillsPage.tsx:219:  const categoryOptions = useMemo(() => {
src/pages/SkillsPage.tsx:220:    const options = categories.map((cat) => ({
src/pages/SkillsPage.tsx:225:    // Add Uncategorized option at the beginning
src/pages/SkillsPage.tsx:226:    return [{ value: '', label: 'Uncategorized', color: '#71717A' }, ...options];
src/pages/SkillsPage.tsx:227:  }, [categories]);
src/pages/SkillsPage.tsx:330:  // Handle category change
src/pages/SkillsPage.tsx:331:  const handleCategoryChange = (category: string | string[]) => {
src/pages/SkillsPage.tsx:332:    if (selectedSkillId && typeof category === 'string') {
src/pages/SkillsPage.tsx:333:      updateSkillCategory(selectedSkillId, category);
src/pages/SkillsPage.tsx:450:            options={categoryOptions}
src/pages/SkillsPage.tsx:451:            value={selectedSkill.category || ''}
src/pages/SkillsPage.tsx:453:            placeholder="Select category"
src/pages/ClaudeMdPage.tsx:148:    if (filter.categoryId) {
src/pages/ClaudeMdPage.tsx:149:      filtered = filtered.filter((file) => file.categoryId === filter.categoryId);
src/pages/ScenesPage.tsx:69:const getSkillIcon = (category: string) => skillIconMap[category] || skillIconMap.default;
src/pages/ScenesPage.tsx:70:const getMcpIcon = (category: string) => mcpIconMap[category] || mcpIconMap.default;
src/pages/ScenesPage.tsx:524:                    const SkillIcon = getSkillIcon(skill.category);
src/pages/ScenesPage.tsx:552:                    const McpIcon = getMcpIcon(mcp.category);
src-tauri/src/commands/skills.rs:59:/// Update skill metadata (category, tags, enabled status, icon)
src-tauri/src/commands/skills.rs:63:    category: Option<String>,
src-tauri/src/commands/skills.rs:82:    if let Some(cat) = category {
src-tauri/src/commands/skills.rs:83:        metadata.category = cat;
src-tauri/src/commands/skills.rs:208:        category: metadata.map(|m| m.category.clone()).unwrap_or_default(),
src-tauri/src/commands/claude_md.rs:371:        category_id: options.category_id,
src-tauri/src/commands/claude_md.rs:497:/// * `category_id` - New category (optional)
src-tauri/src/commands/claude_md.rs:506:    category_id: Option<String>,
src-tauri/src/commands/claude_md.rs:541:    if let Some(cid) = category_id {
src-tauri/src/commands/claude_md.rs:542:        file.category_id = Some(cid);
src-tauri/src/commands/claude_md.rs:704:                category_id: None,
src/components/skills/SkillItem.tsx:56:const categoryIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
src/components/skills/SkillItem.tsx:76:  // Priority 3: Fall back to category icon
src/components/skills/SkillItem.tsx:77:  if (categoryIconMap[skill.category]) {
src/components/skills/SkillItem.tsx:78:    return categoryIconMap[skill.category];
src/components/skills/SkillItem.tsx:89:const categoryColors: Record<string, string> = {
src/components/skills/SkillItem.tsx:113:  const categoryColor = categoryColors[skill.category] || '#71717A';
src/components/skills/SkillItem.tsx:181:          <Badge variant="category" color={categoryColor}>
src/components/skills/SkillItem.tsx:182:            {skill.category ? skill.category.charAt(0).toUpperCase() + skill.category.slice(1) : 'Uncategorized'}
src-tauri/src/commands/classify.rs:22:    pub suggested_category: String,
src-tauri/src/commands/classify.rs:30:    categories: &[String],
src-tauri/src/commands/classify.rs:35:    let categories_list = if categories.is_empty() {
src-tauri/src/commands/classify.rs:36:        "(No existing categories)".to_string()
src-tauri/src/commands/classify.rs:38:        categories.join(", ")
src-tauri/src/commands/classify.rs:50:**Primary Goal**: ENTROPY REDUCTION - fewer, meaningful categories and tags that are consistently reused.
src-tauri/src/commands/classify.rs:58:Before using any existing category, check if it's VALID:
src-tauri/src/commands/classify.rs:60:**INVALID categories (never use these):**
src-tauri/src/commands/classify.rs:68:**VALID categories have:**
src-tauri/src/commands/classify.rs:77:| A VALID existing category fits well | USE IT |
src-tauri/src/commands/classify.rs:78:| A VALID existing category is close enough | USE IT (prefer consistency) |
src-tauri/src/commands/classify.rs:79:| Only INVALID categories exist | CREATE a new meaningful one |
src-tauri/src/commands/classify.rs:80:| No category covers this domain | CREATE a new one |
src-tauri/src/commands/classify.rs:95:{categories_list}
src-tauri/src/commands/classify.rs:140:        categories_list = categories_list,
src-tauri/src/commands/classify.rs:151:    existing_categories: Vec<String>,
src-tauri/src/commands/classify.rs:160:    let prompt = build_classification_prompt(&items, &existing_categories, &existing_tags, &available_icons);
src-tauri/src/commands/classify.rs:172:                        "category": { "type": "string" },
src-tauri/src/commands/classify.rs:184:                    "required": ["id", "category", "tags", "icon"]
src-tauri/src/commands/classify.rs:234:                suggested_category: c["category"].as_str()?.to_string(),
src/components/skills/SkillListItem.tsx:48: * Full mode (compact=false): Shows category badge and tags
src/components/skills/SkillListItem.tsx:68:  const categoryColor = getCategoryColor(skill.category);
src/components/skills/SkillListItem.tsx:185:        {/* Category Badge - only show if category exists */}
src/components/skills/SkillListItem.tsx:186:        {skill.category && (
src/components/skills/SkillListItem.tsx:187:          <Badge variant="category" color={categoryColor}>
src/components/skills/SkillListItem.tsx:188:            {skill.category.charAt(0).toUpperCase() + skill.category.slice(1)}
src/components/skills/SkillDetailPanel.tsx:59:const categoryIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
src/components/skills/SkillDetailPanel.tsx:79:  // Priority 3: Fall back to category icon
src/components/skills/SkillDetailPanel.tsx:80:  if (categoryIconMap[skill.category]) {
src/components/skills/SkillDetailPanel.tsx:81:    return categoryIconMap[skill.category];
src/components/skills/SkillDetailPanel.tsx:199:  const { categories, tags: appTags, addTag: addGlobalTag } = useAppStore();
src/components/skills/SkillDetailPanel.tsx:238:  // Category dropdown options - only use categories from appStore
src/components/skills/SkillDetailPanel.tsx:239:  const categoryOptions = useMemo(() => {
src/components/skills/SkillDetailPanel.tsx:240:    const options = categories.map(cat => ({
src/components/skills/SkillDetailPanel.tsx:245:    // Add Uncategorized option at the beginning
src/components/skills/SkillDetailPanel.tsx:246:    return [{ value: '', label: 'Uncategorized', color: '#71717A' }, ...options];
src/components/skills/SkillDetailPanel.tsx:247:  }, [categories]);
src/components/skills/SkillDetailPanel.tsx:296:  const handleCategoryChange = (category: string | string[]) => {
src/components/skills/SkillDetailPanel.tsx:297:    if (selectedSkill && typeof category === 'string') {
src/components/skills/SkillDetailPanel.tsx:298:      updateSkillCategory(selectedSkill.id, category);
src/components/skills/SkillDetailPanel.tsx:413:            options={categoryOptions}
src/components/skills/SkillDetailPanel.tsx:414:            value={selectedSkill.category || ''}
src/components/skills/SkillDetailPanel.tsx:416:            placeholder="Select category"
src/components/claude-md/ClaudeMdCard.tsx:61: * - Tags: category + tags
src/components/claude-md/ClaudeMdCard.tsx:74:  const { tags: appTags, categories } = useAppStore();
src/components/claude-md/ClaudeMdCard.tsx:84:  // Get category name and color from category ID
src/components/claude-md/ClaudeMdCard.tsx:85:  const category = file.categoryId
src/components/claude-md/ClaudeMdCard.tsx:86:    ? categories.find((c) => c.id === file.categoryId)
src/components/claude-md/ClaudeMdCard.tsx:88:  const categoryName = category?.name;
src/components/claude-md/ClaudeMdCard.tsx:89:  const categoryColor = category?.color || '#71717A';
src/components/claude-md/ClaudeMdCard.tsx:202:        {/* Category Badge - only show if category exists */}
src/components/claude-md/ClaudeMdCard.tsx:203:        {categoryName && (
src/components/claude-md/ClaudeMdCard.tsx:204:          <Badge variant="category" color={categoryColor}>
src/components/claude-md/ClaudeMdCard.tsx:205:            {categoryName.charAt(0).toUpperCase() + categoryName.slice(1)}
src-tauri/src/utils/path.rs:38:/// `~/.ensemble/data.json`, replacing real categories/tags. The silent fallback
src/components/claude-md/ClaudeMdDetailPanel.tsx:128:  const { categories, tags: appTags, addTag: addGlobalTag } = useAppStore();
src/components/claude-md/ClaudeMdDetailPanel.tsx:149:  const categoryOptions = useMemo(() => {
src/components/claude-md/ClaudeMdDetailPanel.tsx:150:    const options = categories.map(cat => ({
src/components/claude-md/ClaudeMdDetailPanel.tsx:155:    // Add Uncategorized option at the beginning
src/components/claude-md/ClaudeMdDetailPanel.tsx:156:    return [{ value: '', label: 'Uncategorized', color: '#71717A' }, ...options];
src/components/claude-md/ClaudeMdDetailPanel.tsx:157:  }, [categories]);
src/components/claude-md/ClaudeMdDetailPanel.tsx:186:  const handleCategoryChange = (categoryId: string | string[]) => {
src/components/claude-md/ClaudeMdDetailPanel.tsx:187:    if (selectedFile && typeof categoryId === 'string') {
src/components/claude-md/ClaudeMdDetailPanel.tsx:188:      updateFile(selectedFile.id, { categoryId: categoryId || undefined });
src/components/claude-md/ClaudeMdDetailPanel.tsx:309:            options={categoryOptions}
src/components/claude-md/ClaudeMdDetailPanel.tsx:310:            value={selectedFile.categoryId || ''}
src/components/claude-md/ClaudeMdDetailPanel.tsx:312:            placeholder="Select category"
src-tauri/src/lib.rs:97:            data::get_categories,
src-tauri/src/lib.rs:98:            data::add_category,
src-tauri/src/lib.rs:99:            data::update_category,
src-tauri/src/lib.rs:100:            data::delete_category,
src-tauri/src/lib.rs:101:            data::reorder_categories,
src-tauri/src/types.rs:10:    pub category: String,
src-tauri/src/types.rs:42:    pub category: String,
src-tauri/src/types.rs:154:    pub categories: Vec<Category>,
src-tauri/src/types.rs:181:    pub category: String,
src-tauri/src/types.rs:193:    pub category: String,
src-tauri/src/types.rs:653:    pub category_id: Option<String>,
src-tauri/src/types.rs:741:    pub category_id: Option<String>,
src-tauri/src/types.rs:921:        assert!(data.categories.is_empty());
src-tauri/src/types.rs:948:    fn test_category_serde_roundtrip() {
src-tauri/src/types.rs:949:        let category = Category {
src-tauri/src/types.rs:955:        let json = serde_json::to_string(&category).unwrap();
src/components/__tests__/Badge.test.tsx:27:  it('renders category variant with color dot', () => {
src/components/__tests__/Badge.test.tsx:29:      <Badge variant="category" color="#8B5CF6">
src/components/sidebar/CategoryInlineInput.tsx:7:  category?: Category;  // 编辑模式必需
src/components/sidebar/CategoryInlineInput.tsx:15:  category,
src/components/sidebar/CategoryInlineInput.tsx:20:  const [value, setValue] = useState(mode === 'edit' ? category?.name || '' : '');
src/components/sidebar/CategoryInlineInput.tsx:21:  const [currentColor, setCurrentColor] = useState(mode === 'edit' ? category?.color || '#A1A1AA' : '#A1A1AA');
src/components/sidebar/CategoryRowContent.tsx:5: * Shared inner content of a category row — used by both the inline sortable
src/components/sidebar/CategoryRowContent.tsx:17:  category: Category;
src/components/sidebar/CategoryRowContent.tsx:27:  category,
src/components/sidebar/CategoryRowContent.tsx:43:        <ColorPicker value={category.color} onChange={(color) => onColorChange?.(color)} />
src/components/sidebar/CategoryRowContent.tsx:53:        {category.name}
src/components/sidebar/CategoryRowContent.tsx:58:        <span className="text-[11px] font-medium text-[#A1A1AA]">{category.count}</span>
src/components/sidebar/SortableCategoryRow.tsx:8: * Sortable wrapper around a category row. Lives inside `SortableContext`
src/components/sidebar/SortableCategoryRow.tsx:18:  category: Category;
src/components/sidebar/SortableCategoryRow.tsx:35:  category,
src/components/sidebar/SortableCategoryRow.tsx:45:    id: category.id,
src/components/sidebar/SortableCategoryRow.tsx:126:        category={category}
src/components/common/FilteredEmptyState.tsx:5:  type: 'category' | 'tag';
src/components/common/FilteredEmptyState.tsx:20:  const Icon = type === 'category' ? CategoryEmptyIcon : TagEmptyIcon;
src/components/common/FilteredEmptyState.tsx:23:    category: {
src/components/common/FilteredEmptyState.tsx:24:      title: 'No items in this category',
src/components/common/FilteredEmptyState.tsx:25:      description: 'Try selecting a different category or add items to this one',
src/components/sidebar/DragOverlayCategoryRow.tsx:5: * Visible drag clone shown inside `<DragOverlay>` while a category row is
src/components/sidebar/DragOverlayCategoryRow.tsx:16:  category: Category;
src/components/sidebar/DragOverlayCategoryRow.tsx:19:export function DragOverlayCategoryRow({ category }: DragOverlayCategoryRowProps) {
src/components/sidebar/DragOverlayCategoryRow.tsx:22:      <CategoryRowContent category={category} showCount={false} />
src/components/sidebar/SortableCategoriesList.tsx:50: * - `SortableContext.items` only contains category ids — the
src/components/sidebar/SortableCategoriesList.tsx:60:  categories: Category[];
src/components/sidebar/SortableCategoriesList.tsx:71:  onCategoryClick: (categoryId: string) => void;
src/components/sidebar/SortableCategoriesList.tsx:72:  onCategoryDoubleClick: (categoryId: string) => void;
src/components/sidebar/SortableCategoriesList.tsx:73:  onCategoryContextMenu: (category: Category, e: React.MouseEvent) => void;
src/components/sidebar/SortableCategoriesList.tsx:74:  onCategoryColorChange: (categoryId: string, color: string) => void;
src/components/sidebar/SortableCategoriesList.tsx:80:  categories,
src/components/sidebar/SortableCategoriesList.tsx:110:    activeId !== null ? (categories.find((c) => c.id === activeId) ?? null) : null;
src/components/sidebar/SortableCategoriesList.tsx:125:  const visibleCategories = showAll ? categories : categories.slice(0, maxVisible);
src/components/sidebar/SortableCategoriesList.tsx:126:  const remainingCount = categories.length - maxVisible;
src/components/sidebar/SortableCategoriesList.tsx:131:    if (!showAll && categories.length > maxVisible) {
src/components/sidebar/SortableCategoriesList.tsx:165:      const oldIdx = categories.findIndex((c) => c.id === active.id);
src/components/sidebar/SortableCategoriesList.tsx:166:      const newIdx = categories.findIndex((c) => c.id === over.id);
src/components/sidebar/SortableCategoriesList.tsx:168:        onReorder(arrayMove(categories, oldIdx, newIdx).map((c) => c.id));
src/components/sidebar/SortableCategoriesList.tsx:191:  if (categories.length === 0) {
src/components/sidebar/SortableCategoriesList.tsx:203:          <p className="text-xs text-[#A1A1AA] px-2.5">No categories</p>
src/components/sidebar/SortableCategoriesList.tsx:218:        announcements: makeAnnouncements(categories, 'category'),
src/components/sidebar/SortableCategoriesList.tsx:226:        // Only category ids participate in sorting. The inline input and the
src/components/sidebar/SortableCategoriesList.tsx:229:        items={categories.map((c) => c.id)}
src/components/sidebar/SortableCategoriesList.tsx:234:          {visibleCategories.map((category) => {
src/components/sidebar/SortableCategoriesList.tsx:235:            const isEditing = editingCategoryId === category.id;
src/components/sidebar/SortableCategoriesList.tsx:243:                <div key={category.id} data-no-dnd="true">
src/components/sidebar/SortableCategoriesList.tsx:246:                    category={category}
src/components/sidebar/SortableCategoriesList.tsx:247:                    onSave={(name) => onCategorySave(category.id, name)}
src/components/sidebar/SortableCategoriesList.tsx:256:                key={category.id}
src/components/sidebar/SortableCategoriesList.tsx:257:                category={category}
src/components/sidebar/SortableCategoriesList.tsx:258:                isActive={activeCategoryId === category.id}
src/components/sidebar/SortableCategoriesList.tsx:260:                justDropped={justDroppedId === category.id}
src/components/sidebar/SortableCategoriesList.tsx:261:                onClick={() => onCategoryClick(category.id)}
src/components/sidebar/SortableCategoriesList.tsx:262:                onDoubleClick={() => onCategoryDoubleClick(category.id)}
src/components/sidebar/SortableCategoriesList.tsx:263:                onContextMenu={(e) => onCategoryContextMenu(category, e)}
src/components/sidebar/SortableCategoriesList.tsx:264:                onColorChange={(color) => onCategoryColorChange(category.id, color)}
src/components/sidebar/SortableCategoriesList.tsx:312:        {activeCategory && <DragOverlayCategoryRow category={activeCategory} />}
src/App.tsx:23:          <Route path="category/:categoryId" element={<CategoryPage />} />
src/components/common/Badge.tsx:5:  variant: 'status' | 'count' | 'category' | 'tag';
src/components/common/Badge.tsx:8:  /** Dot color for category badge, or status dot color */
src/components/common/Badge.tsx:10:  /** Show dot indicator (default: false for category, true for status with color) */
src/components/common/Badge.tsx:17: * Badge component for displaying status, counts, categories, and tags.
src/components/common/Badge.tsx:22: * - category: Gray badge for categories (bg: #F4F4F5, text: #52525B)
src/components/common/Badge.tsx:39:    category: 'bg-[#F4F4F5] text-[#52525B] px-2 py-[3px] rounded-[3px] gap-1.5 text-[11px] leading-none',
src/components/common/Badge.tsx:44:  const shouldShowDot = showDot !== undefined ? showDot : (variant === 'status' || (variant === 'category' && color));
src/components/common/Badge.tsx:51:    if (variant === 'category' && color) {
src/components/common/Badge.tsx:62:          style={variant === 'category' && color ? { backgroundColor: color } : undefined}
src/types/claudeMd.ts:54:  categoryId?: string;
src/types/claudeMd.ts:133:  categoryId?: string;
src/components/common/Dropdown.tsx:297:  const isUncategorized = option.label.toLowerCase() === 'uncategorized';
src/components/common/Dropdown.tsx:343:            ${isUncategorized ? 'text-[#71717A]' : 'text-[#18181B]'}
src/components/sidebar/dnd/animations.ts:12: * Base drop animation for category rows. 220ms matches the cascade duration
src/components/sidebar/dnd/animations.ts:24: * Tag drop animation. Identical to category — kept as separate symbol so
src/types/index.ts:8:  category: string;
src/types/index.ts:33:  category: string;
src/types/index.ts:141:  suggested_category: string;
src/types/index.ts:278:  categories: Category[];
src/utils/constants.ts:7:export const categoryColors: Record<string, string> = {
src/utils/constants.ts:17: * @param category 分类名称
src/utils/constants.ts:20:export const getCategoryColor = (category: string): string => {
src/utils/constants.ts:21:  return categoryColors[category?.toLowerCase()] || categoryColors.other;
src/stores/scenesStore.ts:21:  categoryFilter: string;
src/stores/scenesStore.ts:81:  categoryFilter: '',
src/stores/__tests__/appStore.test.ts:11:      categories: [],
src/stores/__tests__/appStore.test.ts:24:    it('sets the active category', () => {
src/stores/__tests__/appStore.test.ts:29:    it('clears active category when set to null', () => {
src/stores/__tests__/appStore.test.ts:65:    it('sets categories array', () => {
src/stores/__tests__/appStore.test.ts:66:      const categories = [{ id: '1', name: 'Dev', color: '#000', count: 3 }];
src/stores/__tests__/appStore.test.ts:67:      useAppStore.getState().setCategories(categories);
src/stores/__tests__/appStore.test.ts:68:      expect(useAppStore.getState().categories).toEqual(categories);
src/stores/__tests__/appStore.test.ts:88:    it('starts and stops editing category', () => {
src/stores/__tests__/appStore.test.ts:96:    it('starts and stops adding category', () => {
src/stores/__tests__/appStore.test.ts:113:      // Start editing a category
src/stores/__tests__/appStore.test.ts:115:      // Now start editing a tag - should clear category editing
src/stores/claudeMdStore.ts:25:  categoryId: string | null;
src/stores/claudeMdStore.ts:105:  categoryId: null,
src/stores/claudeMdStore.ts:258:        categoryId: updates.categoryId,
src/stores/claudeMdStore.ts:418:    const { categories, tags } = useAppStore.getState();
src/stores/claudeMdStore.ts:437:      const existingCategories = categories.map((c) => c.name);
src/stores/claudeMdStore.ts:452:      // Collect new categories and tags that need to be created
src/stores/claudeMdStore.ts:454:      const existingCategoryNames = new Set(categories.map(c => c.name));
src/stores/claudeMdStore.ts:461:        if (!existingCategoryNames.has(result.suggested_category)) {
src/stores/claudeMdStore.ts:462:          newCategories.add(result.suggested_category);
src/stores/claudeMdStore.ts:471:      // Create new categories
src/stores/claudeMdStore.ts:472:      const categoryColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
src/stores/claudeMdStore.ts:473:      let colorIndex = categories.length;
src/stores/claudeMdStore.ts:474:      for (const categoryName of newCategories) {
src/stores/claudeMdStore.ts:475:        await addCategory(categoryName, categoryColors[colorIndex % categoryColors.length]);
src/stores/claudeMdStore.ts:484:      // Reload categories and tags to get the newly created entities
src/stores/claudeMdStore.ts:488:      const updatedCategories = updatedState.categories;
src/stores/claudeMdStore.ts:491:      // Apply results - use updated categories/tags to find IDs
src/stores/claudeMdStore.ts:495:          // Find category ID by name
src/stores/claudeMdStore.ts:496:          const categoryId = updatedCategories.find(c => c.name === result.suggested_category)?.id;
src/stores/claudeMdStore.ts:505:            categoryId: categoryId,
src/stores/claudeMdStore.ts:563:    if (filter.categoryId) {
src/stores/claudeMdStore.ts:564:      filtered = filtered.filter((file) => file.categoryId === filter.categoryId);
src/components/sidebar/dnd/announcements.ts:25: * - `label`: the kind of item being announced ("category" | "tag"); shapes
src/components/sidebar/dnd/announcements.ts:28:export function makeAnnouncements(items: NamedItem[], label: 'category' | 'tag'): Announcements {
src/stores/mcpsStore.ts:11:  category: string | null;
src/stores/mcpsStore.ts:41:  updateMcpCategory: (id: string, category: string) => Promise<void>;
src/stores/mcpsStore.ts:61:    category: null,
src/stores/mcpsStore.ts:144:  updateMcpCategory: async (id, category) => {
src/stores/mcpsStore.ts:147:      console.warn('McpsStore: Cannot update MCP category in browser mode');
src/stores/mcpsStore.ts:154:        category,
src/stores/mcpsStore.ts:158:          m.id === id ? { ...m, category } : m
src/stores/mcpsStore.ts:367:    const { categories, tags } = useAppStore.getState();
src/stores/mcpsStore.ts:385:      const existingCategories = categories.map((c) => c.name);
src/stores/mcpsStore.ts:400:      // Collect new categories and tags that need to be created
src/stores/mcpsStore.ts:402:      const existingCategoryNames = new Set(categories.map(c => c.name));
src/stores/mcpsStore.ts:409:        if (result.suggested_category && !existingCategoryNames.has(result.suggested_category)) {
src/stores/mcpsStore.ts:410:          newCategories.add(result.suggested_category);
src/stores/mcpsStore.ts:419:      // Create new categories (using predefined colors)
src/stores/mcpsStore.ts:420:      const categoryColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
src/stores/mcpsStore.ts:421:      let colorIndex = categories.length;
src/stores/mcpsStore.ts:422:      for (const categoryName of newCategories) {
src/stores/mcpsStore.ts:423:        await addCategory(categoryName, categoryColors[colorIndex % categoryColors.length]);
src/stores/mcpsStore.ts:438:            category: result.suggested_category,
src/stores/mcpsStore.ts:445:      // Reload categories, tags, and MCPs
src/stores/mcpsStore.ts:484:    // Filter by category
src/stores/mcpsStore.ts:485:    if (state.filter.category) {
src/stores/mcpsStore.ts:486:      filtered = filtered.filter((mcp) => mcp.category === state.filter.category);
src/stores/skillsStore.ts:15:  category: string | null;
src/stores/skillsStore.ts:50:  updateSkillCategory: (id: string, category: string) => Promise<void>;
src/stores/skillsStore.ts:72:  category: null,
src/stores/skillsStore.ts:144:  updateSkillCategory: async (id, category) => {
src/stores/skillsStore.ts:158:  updateSkillCategory: async (id, category) => {
src/stores/skillsStore.ts:161:      console.warn('SkillsStore: Cannot update skill category in browser mode');
src/stores/skillsStore.ts:168:    const oldCategory = skill.category;
src/stores/skillsStore.ts:173:        s.id === id ? { ...s, category } : s
src/stores/skillsStore.ts:180:        category,
src/stores/skillsStore.ts:187:          s.id === id ? { ...s, category: oldCategory } : s
src/stores/skillsStore.ts:323:    const { categories, tags } = useAppStore.getState();
src/stores/skillsStore.ts:341:      // Get existing categories and tags
src/stores/skillsStore.ts:342:      const existingCategories = categories.map((c) => c.name);
src/stores/skillsStore.ts:358:      // Collect new categories and tags that need to be created
src/stores/skillsStore.ts:360:      const existingCategoryNames = new Set(categories.map(c => c.name));
src/stores/skillsStore.ts:367:        if (!existingCategoryNames.has(result.suggested_category)) {
src/stores/skillsStore.ts:368:          newCategories.add(result.suggested_category);
src/stores/skillsStore.ts:377:      // Create new categories with predefined colors
src/stores/skillsStore.ts:378:      const categoryColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
src/stores/skillsStore.ts:379:      let colorIndex = categories.length;
src/stores/skillsStore.ts:380:      for (const categoryName of newCategories) {
src/stores/skillsStore.ts:381:        await addCategory(categoryName, categoryColors[colorIndex % categoryColors.length]);
src/stores/skillsStore.ts:394:          // Update category, tags, and icon
src/stores/skillsStore.ts:397:            category: result.suggested_category,
src/stores/skillsStore.ts:404:      // Reload categories, tags, and skills to get updated data
src/stores/skillsStore.ts:467:    if (filter.category) {
src/stores/skillsStore.ts:468:      filtered = filtered.filter((skill) => skill.category === filter.category);
src/stores/appStore.ts:60:  categories: Category[];
src/stores/appStore.ts:63:  // Version counters — bumped on every mutation to categories/tags.
src/stores/appStore.ts:67:  categoriesVersion: number;
src/stores/appStore.ts:91:  setActiveCategory: (categoryId: string | null) => void;
src/stores/appStore.ts:96:  setCategories: (categories: Category[]) => void;
src/stores/appStore.ts:129:  categories: [],
src/stores/appStore.ts:131:  categoriesVersion: 0,
src/stores/appStore.ts:149:  setActiveCategory: (categoryId) => set({ activeCategory: categoryId }),
src/stores/appStore.ts:161:  setCategories: (categories) =>
src/stores/appStore.ts:163:      categories,
src/stores/appStore.ts:164:      categoriesVersion: state.categoriesVersion + 1,
src/stores/appStore.ts:177:      console.warn('AppStore: Cannot load categories in browser mode');
src/stores/appStore.ts:184:    const versionBefore = get().categoriesVersion;
src/stores/appStore.ts:187:      const categories = await safeInvoke<Category[]>('get_categories');
src/stores/appStore.ts:188:      if (!categories) return;
src/stores/appStore.ts:190:      const versionAfter = get().categoriesVersion;
src/stores/appStore.ts:197:        categories,
src/stores/appStore.ts:198:        categoriesVersion: state.categoriesVersion + 1,
src/stores/appStore.ts:201:      console.error('Failed to load categories:', error);
src/stores/appStore.ts:240:      console.warn('AppStore: Cannot add category in browser mode');
src/stores/appStore.ts:245:      const category = await safeInvoke<Category>('add_category', { name, color });
src/stores/appStore.ts:246:      if (category) {
src/stores/appStore.ts:248:          categories: [...state.categories, category],
src/stores/appStore.ts:249:          categoriesVersion: state.categoriesVersion + 1,
src/stores/appStore.ts:251:        return category;
src/stores/appStore.ts:253:      throw new Error('Failed to create category');
src/stores/appStore.ts:255:      console.error('Failed to add category:', error);
src/stores/appStore.ts:265:      console.warn('AppStore: Cannot update category in browser mode');
src/stores/appStore.ts:270:      await safeInvoke('update_category', { id, name, color });
src/stores/appStore.ts:272:        categories: state.categories.map((c) =>
src/stores/appStore.ts:277:        categoriesVersion: state.categoriesVersion + 1,
src/stores/appStore.ts:280:      console.error('Failed to update category:', error);
src/stores/appStore.ts:290:      console.warn('AppStore: Cannot delete category in browser mode');
src/stores/appStore.ts:295:      await safeInvoke('delete_category', { id });
src/stores/appStore.ts:297:        categories: state.categories.filter((c) => c.id !== id),
src/stores/appStore.ts:298:        categoriesVersion: state.categoriesVersion + 1,
src/stores/appStore.ts:302:      console.error('Failed to delete category:', error);
src/stores/appStore.ts:386:  // Failure: try `get_categories` to pull canonical state; if that
src/stores/appStore.ts:394:    const snapshotForFallback = get().categories;
src/stores/appStore.ts:398:      categories: reordered,
src/stores/appStore.ts:399:      categoriesVersion: state.categoriesVersion + 1,
src/stores/appStore.ts:405:        const updated = await safeInvoke<Category[]>('reorder_categories', { orderedIds });
src/stores/appStore.ts:411:          const current = get().categories;
src/stores/appStore.ts:416:              categories: updated,
src/stores/appStore.ts:417:              categoriesVersion: state.categoriesVersion + 1,
src/stores/appStore.ts:422:        console.error('Failed to reorder categories:', error);
src/stores/appStore.ts:427:          const real = await safeInvoke<Category[]>('get_categories');
src/stores/appStore.ts:430:              categories: real,
src/stores/appStore.ts:431:              categoriesVersion: state.categoriesVersion + 1,
src/stores/appStore.ts:437:          console.error('Failed to recover canonical categories:', recoverError);
src/stores/appStore.ts:442:          categories: snapshotForFallback,
src/stores/appStore.ts:443:          categoriesVersion: state.categoriesVersion + 1,
src/components/layout/Sidebar.tsx:46:  categories: Category[];
src/components/layout/Sidebar.tsx:56:  onCategoryChange: (categoryId: string | null) => void;
src/components/layout/Sidebar.tsx:60:  onCategoryContextMenu?: (category: Category, position: { x: number; y: number }) => void;
src/components/layout/Sidebar.tsx:61:  onCategoryColorChange?: (categoryId: string, color: string) => void;
src/components/layout/Sidebar.tsx:70:  onCategoryDoubleClick?: (categoryId: string) => void;
src/components/layout/Sidebar.tsx:102:// Maximum categories to display before showing "Show X more"
src/components/layout/Sidebar.tsx:112:  categories,
src/components/layout/Sidebar.tsx:187:  const handleCategoryRowClick = (categoryId: string) => {
src/components/layout/Sidebar.tsx:188:    if (activeCategory === categoryId) {
src/components/layout/Sidebar.tsx:191:      navigate(`/category/${categoryId}`);
src/components/layout/Sidebar.tsx:206:  const handleCategoryContextMenu = (category: Category, e: React.MouseEvent) => {
src/components/layout/Sidebar.tsx:208:    onCategoryContextMenu?.(category, { x: e.clientX, y: e.clientY });
src/components/layout/Sidebar.tsx:298:              aria-label="Add category"
src/components/layout/Sidebar.tsx:308:              Pass the FULL `categories` array (not pre-sliced) so the list
src/components/layout/Sidebar.tsx:312:            categories={categories}
src/utils/__tests__/constants.test.ts:2:import { categoryColors, getCategoryColor } from '../constants';
src/utils/__tests__/constants.test.ts:4:describe('categoryColors', () => {
src/utils/__tests__/constants.test.ts:5:  it('contains expected category keys', () => {
src/utils/__tests__/constants.test.ts:6:    expect(categoryColors).toHaveProperty('development');
src/utils/__tests__/constants.test.ts:7:    expect(categoryColors).toHaveProperty('design');
src/utils/__tests__/constants.test.ts:8:    expect(categoryColors).toHaveProperty('research');
src/utils/__tests__/constants.test.ts:9:    expect(categoryColors).toHaveProperty('productivity');
src/utils/__tests__/constants.test.ts:10:    expect(categoryColors).toHaveProperty('other');
src/utils/__tests__/constants.test.ts:14:    Object.values(categoryColors).forEach((color) => {
src/utils/__tests__/constants.test.ts:21:  it('returns correct color for known categories', () => {
src/utils/__tests__/constants.test.ts:33:  it('returns "other" color for unknown categories', () => {
src/utils/__tests__/constants.test.ts:34:    expect(getCategoryColor('nonexistent')).toBe(categoryColors.other);
src/utils/__tests__/constants.test.ts:35:    expect(getCategoryColor('')).toBe(categoryColors.other);
src/utils/__tests__/constants.test.ts:39:    expect(getCategoryColor(null as unknown as string)).toBe(categoryColors.other);
src/utils/__tests__/constants.test.ts:40:    expect(getCategoryColor(undefined as unknown as string)).toBe(categoryColors.other);
src/components/scenes/CreateSceneModal.tsx:75:const getSkillIcon = (category: string) => skillIconMap[category] || skillIconMap.default;
src/components/scenes/CreateSceneModal.tsx:76:const getMcpIcon = (category: string) => mcpIconMap[category] || mcpIconMap.default;
src/components/scenes/CreateSceneModal.tsx:86:  category: string;
src/components/scenes/CreateSceneModal.tsx:99:  category,
src/components/scenes/CreateSceneModal.tsx:106:  const IconComponent = type === 'skill' ? getSkillIcon(category) : getMcpIcon(category);
src/components/scenes/CreateSceneModal.tsx:371:  const [categoryFilter, setCategoryFilter] = useState('');
src/components/scenes/CreateSceneModal.tsx:446:  // Get unique categories and tags
src/components/scenes/CreateSceneModal.tsx:447:  const categories = useMemo(() => {
src/components/scenes/CreateSceneModal.tsx:449:    const uniqueCategories = [...new Set(items.map((item) => item.category))];
src/components/scenes/CreateSceneModal.tsx:453:      count: items.filter((item) => item.category === cat).length,
src/components/scenes/CreateSceneModal.tsx:487:      if (categoryFilter && item.category !== categoryFilter) {
src/components/scenes/CreateSceneModal.tsx:512:  }, [activeTab, skills, mcpServers, searchQuery, categoryFilter, tagFilter, isSkillDisabled, isMcpDisabled]);
src/components/scenes/CreateSceneModal.tsx:865:                  options={[{ value: '', label: 'All Categories' }, ...categories]}
src/components/scenes/CreateSceneModal.tsx:866:                  value={categoryFilter}
src/components/scenes/CreateSceneModal.tsx:916:                          category={item.category}
src/components/mcps/McpDetailPanel.tsx:42:const getIcon = (category: string): React.ElementType => {
src/components/mcps/McpDetailPanel.tsx:43:  return iconMap[category] || iconMap.default;
src/components/mcps/McpDetailPanel.tsx:46:// Get icon for MCP server - prioritizes custom icon over category-based icon
src/components/mcps/McpDetailPanel.tsx:47:const getMcpIcon = (mcp: { icon?: string; category: string }): React.ElementType => {
src/components/mcps/McpDetailPanel.tsx:52:  return getIcon(mcp.category);
src/components/mcps/McpDetailPanel.tsx:147:  const { categories, tags: appTags, addTag: addGlobalTag } = useAppStore();
src/components/mcps/McpDetailPanel.tsx:176:  // Category dropdown options - only use categories from appStore
src/components/mcps/McpDetailPanel.tsx:177:  const categoryOptions = useMemo(() => {
src/components/mcps/McpDetailPanel.tsx:178:    const options = categories.map(cat => ({
src/components/mcps/McpDetailPanel.tsx:183:    // Add Uncategorized option at the beginning
src/components/mcps/McpDetailPanel.tsx:184:    return [{ value: '', label: 'Uncategorized', color: '#71717A' }, ...options];
src/components/mcps/McpDetailPanel.tsx:185:  }, [categories]);
src/components/mcps/McpDetailPanel.tsx:234:  const handleCategoryChange = (category: string | string[]) => {
src/components/mcps/McpDetailPanel.tsx:235:    if (selectedMcp && typeof category === 'string') {
src/components/mcps/McpDetailPanel.tsx:236:      updateMcpCategory(selectedMcp.id, category);
src/components/mcps/McpDetailPanel.tsx:377:            options={categoryOptions}
src/components/mcps/McpDetailPanel.tsx:378:            value={selectedMcp.category || ''}
src/components/mcps/McpDetailPanel.tsx:380:            placeholder="Select category"
src/components/mcps/McpListItem.tsx:24:const categoryIconMap: Record<string, React.ElementType> = {
src/components/mcps/McpListItem.tsx:36:  return categoryIconMap[mcp.category] || ICON_MAP['plug'];
src/components/mcps/McpListItem.tsx:56: * Full mode (compact=false): Shows category badge and tags
src/components/mcps/McpListItem.tsx:76:  const categoryColor = getCategoryColor(mcp.category);
src/components/mcps/McpListItem.tsx:197:        {/* Category Badge - only show if category exists */}
src/components/mcps/McpListItem.tsx:198:        {mcp.category && (
src/components/mcps/McpListItem.tsx:199:          <Badge variant="category" color={categoryColor}>
src/components/mcps/McpListItem.tsx:200:            {mcp.category.charAt(0).toUpperCase() + mcp.category.slice(1)}
src/components/mcps/McpItem.tsx:16:// Get icon component based on category
src/components/mcps/McpItem.tsx:17:const getIcon = (category: string): React.ElementType => {
src/components/mcps/McpItem.tsx:21:// Get icon for MCP server - prioritizes custom icon over category-based icon
src/components/mcps/McpItem.tsx:27:  // 回退到原有逻辑（根据 category 或默认图标）
src/components/mcps/McpItem.tsx:28:  return getIcon(mcp.category);
src/components/layout/MainLayout.tsx:39:    categories,
src/components/layout/MainLayout.tsx:95:  // Dynamically calculate category counts from skills, mcps, and claudeMd files
src/components/layout/MainLayout.tsx:96:  const categoriesWithCounts = useMemo(() => {
src/components/layout/MainLayout.tsx:97:    return categories.map((cat) => ({
src/components/layout/MainLayout.tsx:100:        skills.filter((s) => s.category === cat.name).length +
src/components/layout/MainLayout.tsx:101:        mcpServers.filter((m) => m.category === cat.name).length +
src/components/layout/MainLayout.tsx:102:        claudeMdFiles.filter((f) => f.categoryId === cat.id).length,
src/components/layout/MainLayout.tsx:104:  }, [categories, skills, mcpServers, claudeMdFiles]);
src/components/layout/MainLayout.tsx:212:        // Initialize app data (categories, tags)
src/components/layout/MainLayout.tsx:237:    setSkillsFilter({ category: activeCategory, tags: activeTags });
src/components/layout/MainLayout.tsx:238:    setMcpsFilter({ category: activeCategory, tags: activeTags });
src/components/layout/MainLayout.tsx:312:    category: Category;
src/components/layout/MainLayout.tsx:323:  const categoryMatch = location.pathname.match(/^\/category\/(.+)$/);
src/components/layout/MainLayout.tsx:326:  const currentCategoryId = categoryMatch ? decodeURIComponent(categoryMatch[1]) : null;
src/components/layout/MainLayout.tsx:341:    if (path.startsWith('/category/') || path.startsWith('/tag/')) return null;
src/components/layout/MainLayout.tsx:355:  const handleCategoryContextMenu = (category: Category, position: { x: number; y: number }) => {
src/components/layout/MainLayout.tsx:356:    setContextMenu({ category, position });
src/components/layout/MainLayout.tsx:364:  const handleCategoryDoubleClick = (categoryId: string) => {
src/components/layout/MainLayout.tsx:365:    startEditingCategory(categoryId);
src/components/layout/MainLayout.tsx:380:      console.error('Failed to save category:', error);
src/components/layout/MainLayout.tsx:390:  const handleCategoryColorChange = async (categoryId: string, color: string) => {
src/components/layout/MainLayout.tsx:392:      await updateCategory(categoryId, undefined, color);
src/components/layout/MainLayout.tsx:394:      console.error('Failed to update category color:', error);
src/components/layout/MainLayout.tsx:399:    if (contextMenu?.category) {
src/components/layout/MainLayout.tsx:400:      startEditingCategory(contextMenu.category.id);
src/components/layout/MainLayout.tsx:406:    if (contextMenu?.category) {
src/components/layout/MainLayout.tsx:408:        await deleteCategory(contextMenu.category.id);
src/components/layout/MainLayout.tsx:410:        console.error('Failed to delete category:', error);
src/components/layout/MainLayout.tsx:488:        console.error('Failed to reorder categories:', e);
src/components/layout/MainLayout.tsx:572:          categories={categoriesWithCounts}
src/test/helpers/tauriMock.ts:30: * registerMockCommand('get_categories', () => [
```

> 注：上述 G1 中包含部分 G2-G15 的同源行（grep 模式有交集）。这是 dispatch_plan 要求的"原始输出贴入产物，不允许压缩"。

### G2：`rg -n --no-heading '\.category\b' src/ src-tauri/src/`（55 行）

```text
src/pages/SceneDetailPage.tsx:382:                      const SkillIcon = getSkillIcon(skill.category);
src/pages/SceneDetailPage.tsx:410:                      const McpIcon = getMcpIcon(mcp.category);
src-tauri/src/commands/mcps.rs:72:        metadata.category = cat;
src-tauri/src/commands/mcps.rs:144:        category: metadata.map(|m| m.category.clone()).unwrap_or_default(),
src/pages/CategoryPage.tsx:41:  // Get category name for filtering (skill.category stores name, not id)
src/pages/CategoryPage.tsx:60:    // First filter by category name (skill.category stores the category name, not id)
src/pages/CategoryPage.tsx:62:    const categorySkills = skills.filter((s) => s.category === categoryName);
src/pages/CategoryPage.tsx:63:    const categoryMcps = mcpServers.filter((m) => m.category === categoryName);
src/pages/McpDetailPage.tsx:44:  return getIcon(mcp.category);
src/pages/McpDetailPage.tsx:296:            {selectedMcp.category}
src/pages/McpServersPage.tsx:68:  return getIcon(mcp.category);
src/pages/McpServersPage.tsx:429:            value={selectedMcp.category || ''}
src/pages/SkillDetailPage.tsx:77:  if (categoryIconMap[skill.category]) {
src/pages/SkillDetailPage.tsx:78:    return categoryIconMap[skill.category];
src/pages/SkillDetailPage.tsx:337:              style={{ backgroundColor: categoryColors[selectedSkill.category] || '#71717A' }}
src/pages/SkillDetailPage.tsx:340:              {selectedSkill.category.charAt(0).toUpperCase() + selectedSkill.category.slice(1)}
src-tauri/src/commands/skills.rs:83:        metadata.category = cat;
src-tauri/src/commands/skills.rs:208:        category: metadata.map(|m| m.category.clone()).unwrap_or_default(),
src/pages/SkillsPage.tsx:81:  if (categoryIconMap[skill.category]) {
src/pages/SkillsPage.tsx:82:    return categoryIconMap[skill.category];
src/pages/SkillsPage.tsx:451:            value={selectedSkill.category || ''}
src/pages/ScenesPage.tsx:524:                    const SkillIcon = getSkillIcon(skill.category);
src/pages/ScenesPage.tsx:552:                    const McpIcon = getMcpIcon(mcp.category);
src/components/skills/SkillItem.tsx:77:  if (categoryIconMap[skill.category]) {
src/components/skills/SkillItem.tsx:78:    return categoryIconMap[skill.category];
src/components/skills/SkillItem.tsx:113:  const categoryColor = categoryColors[skill.category] || '#71717A';
src/components/skills/SkillItem.tsx:182:            {skill.category ? skill.category.charAt(0).toUpperCase() + skill.category.slice(1) : 'Uncategorized'}
src/components/skills/SkillListItem.tsx:68:  const categoryColor = getCategoryColor(skill.category);
src/components/skills/SkillListItem.tsx:186:        {skill.category && (
src/components/skills/SkillListItem.tsx:188:            {skill.category.charAt(0).toUpperCase() + skill.category.slice(1)}
src/components/scenes/CreateSceneModal.tsx:449:    const uniqueCategories = [...new Set(items.map((item) => item.category))];
src/components/scenes/CreateSceneModal.tsx:453:      count: items.filter((item) => item.category === cat).length,
src/components/scenes/CreateSceneModal.tsx:487:      if (categoryFilter && item.category !== categoryFilter) {
src/components/scenes/CreateSceneModal.tsx:916:                          category={item.category}
src/components/skills/SkillDetailPanel.tsx:80:  if (categoryIconMap[skill.category]) {
src/components/skills/SkillDetailPanel.tsx:81:    return categoryIconMap[skill.category];
src/components/skills/SkillDetailPanel.tsx:414:            value={selectedSkill.category || ''}
src/stores/skillsStore.ts:168:    const oldCategory = skill.category;
src/stores/skillsStore.ts:467:    if (filter.category) {
src/stores/skillsStore.ts:468:      filtered = filtered.filter((skill) => skill.category === filter.category);
src/components/mcps/McpDetailPanel.tsx:52:  return getIcon(mcp.category);
src/components/mcps/McpDetailPanel.tsx:378:            value={selectedMcp.category || ''}
src/components/mcps/McpItem.tsx:28:  return getIcon(mcp.category);
src/stores/mcpsStore.ts:485:    if (state.filter.category) {
src/stores/mcpsStore.ts:486:      filtered = filtered.filter((mcp) => mcp.category === state.filter.category);
src/components/mcps/McpListItem.tsx:36:  return categoryIconMap[mcp.category] || ICON_MAP['plug'];
src/components/mcps/McpListItem.tsx:76:  const categoryColor = getCategoryColor(mcp.category);
src/components/mcps/McpListItem.tsx:198:        {mcp.category && (
src/components/mcps/McpListItem.tsx:200:            {mcp.category.charAt(0).toUpperCase() + mcp.category.slice(1)}
src/components/layout/MainLayout.tsx:100:        skills.filter((s) => s.category === cat.name).length +
src/components/layout/MainLayout.tsx:101:        mcpServers.filter((m) => m.category === cat.name).length +
src/components/layout/MainLayout.tsx:399:    if (contextMenu?.category) {
src/components/layout/MainLayout.tsx:400:      startEditingCategory(contextMenu.category.id);
src/components/layout/MainLayout.tsx:406:    if (contextMenu?.category) {
src/components/layout/MainLayout.tsx:408:        await deleteCategory(contextMenu.category.id);
```

### G3：`rg -n --no-heading '\.categoryId\b' src/`（10 行）

```text
src/pages/CategoryPage.tsx:64:    const categoryClaudeMd = claudeMdFiles.filter((f) => f.categoryId === categoryId);
src/pages/ClaudeMdPage.tsx:148:    if (filter.categoryId) {
src/pages/ClaudeMdPage.tsx:149:      filtered = filtered.filter((file) => file.categoryId === filter.categoryId);
src/components/claude-md/ClaudeMdCard.tsx:85:  const category = file.categoryId
src/components/claude-md/ClaudeMdCard.tsx:86:    ? categories.find((c) => c.id === file.categoryId)
src/components/claude-md/ClaudeMdDetailPanel.tsx:310:            value={selectedFile.categoryId || ''}
src/components/layout/MainLayout.tsx:102:        claudeMdFiles.filter((f) => f.categoryId === cat.id).length,
src/stores/claudeMdStore.ts:258:        categoryId: updates.categoryId,
src/stores/claudeMdStore.ts:563:    if (filter.categoryId) {
src/stores/claudeMdStore.ts:564:      filtered = filtered.filter((file) => file.categoryId === filter.categoryId);
```

### G4：`rg -n --no-heading 'category_id' src-tauri/src/`（10 行）

```text
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

### G5：`rg -n --no-heading 'categories' src/ src-tauri/src/`（171 行 — 见 §2.G1 中已包含的大部分；此处单独贴出 G5 全部）

```text
src/pages/CategoryPage.tsx:34:  const { categories } = useAppStore();
src/pages/CategoryPage.tsx:40:  const category = categories.find((c) => c.id === categoryId);
src-tauri/src/commands/data.rs:10:/// concurrent `reorder_categories` + `add_category` invocations can lose
src-tauri/src/commands/data.rs:15:/// Pure read commands (`get_categories`, `get_tags`, ...) do not acquire
src-tauri/src/commands/data.rs:166:            categories: vec![
src-tauri/src/commands/data.rs:212:/// Get all categories
src-tauri/src/commands/data.rs:214:pub fn get_categories() -> Result<Vec<Category>, String> {
src-tauri/src/commands/data.rs:216:    Ok(data.categories)
src-tauri/src/commands/data.rs:232:    data.categories.push(category.clone());
src-tauri/src/commands/data.rs:244:    if let Some(category) = data.categories.iter_mut().find(|c| c.id == id) {
src-tauri/src/commands/data.rs:263:    data.categories.retain(|c| c.id != id);
src-tauri/src/commands/data.rs:268:/// Reorder categories. Returns the resulting `Vec<Category>` for client-side
src-tauri/src/commands/data.rs:273:pub fn reorder_categories(orderedIds: Vec<String>) -> Result<Vec<Category>, String> {
src-tauri/src/commands/data.rs:276:    data.categories = apply_reorder(data.categories, &orderedIds);
src-tauri/src/commands/data.rs:277:    let result = data.categories.clone();
src-tauri/src/commands/data.rs:696:    fn seed(categories: Vec<Category>, tags: Vec<Tag>) {
src-tauri/src/commands/data.rs:698:            categories,
src-tauri/src/commands/data.rs:706:    fn reorder_categories_persists_order() {
src-tauri/src/commands/data.rs:710:        let result = reorder_categories(vec!["C".into(), "A".into(), "B".into()])
src-tauri/src/commands/data.rs:711:            .expect("reorder_categories");
src-tauri/src/commands/data.rs:720:            reloaded.categories.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(),
src-tauri/src/commands/data.rs:726:    fn reorder_categories_returns_canonical_vec() {
src-tauri/src/commands/data.rs:731:        let result = reorder_categories(vec!["B".into()]).expect("reorder_categories");
src-tauri/src/commands/data.rs:758:    fn reorder_categories_unknown_id_is_skipped() {
src-tauri/src/commands/data.rs:762:        let result = reorder_categories(vec!["X".into(), "B".into(), "A".into()])
src-tauri/src/commands/data.rs:763:            .expect("reorder_categories");
src-tauri/src/commands/data.rs:789:        // 10 reorder_categories threads (no-op orderings drawn from the seed).
src-tauri/src/commands/data.rs:792:                let _ = reorder_categories(vec!["C".into(), "A".into(), "B".into()]);
src-tauri/src/commands/data.rs:803:        assert_eq!(final_data.categories.len(), 13, "lost updates detected");
src-tauri/src/commands/data.rs:807:            final_data.categories.iter().map(|c| c.name.as_str()).collect();
src/pages/McpServersPage.tsx:172:  const { categories, tags: appTags, addTag: addGlobalTag } = useAppStore();
src/pages/McpServersPage.tsx:219:  // Category dropdown options - only use categories from appStore
src/pages/McpServersPage.tsx:221:    const options = categories.map((cat) => ({
src/pages/McpServersPage.tsx:228:  }, [categories]);
src/pages/SkillsPage.tsx:200:  const { categories, tags: appTags, addTag: addGlobalTag } = useAppStore();
src/pages/SkillsPage.tsx:218:  // Category dropdown options - only use categories from appStore
src/pages/SkillsPage.tsx:220:    const options = categories.map((cat) => ({
src/pages/SkillsPage.tsx:227:  }, [categories]);
src-tauri/src/commands/classify.rs:30:    categories: &[String],
src-tauri/src/commands/classify.rs:35:    let categories_list = if categories.is_empty() {
src-tauri/src/commands/classify.rs:36:        "(No existing categories)".to_string()
src-tauri/src/commands/classify.rs:38:        categories.join(", ")
src-tauri/src/commands/classify.rs:50:**Primary Goal**: ENTROPY REDUCTION - fewer, meaningful categories and tags that are consistently reused.
src-tauri/src/commands/classify.rs:60:**INVALID categories (never use these):**
src-tauri/src/commands/classify.rs:68:**VALID categories have:**
src-tauri/src/commands/classify.rs:79:| Only INVALID categories exist | CREATE a new meaningful one |
src-tauri/src/commands/classify.rs:95:{categories_list}
src-tauri/src/commands/classify.rs:140:        categories_list = categories_list,
src-tauri/src/commands/classify.rs:151:    existing_categories: Vec<String>,
src-tauri/src/commands/classify.rs:160:    let prompt = build_classification_prompt(&items, &existing_categories, &existing_tags, &available_icons);
src/components/skills/SkillDetailPanel.tsx:199:  const { categories, tags: appTags, addTag: addGlobalTag } = useAppStore();
src/components/skills/SkillDetailPanel.tsx:238:  // Category dropdown options - only use categories from appStore
src/components/skills/SkillDetailPanel.tsx:240:    const options = categories.map(cat => ({
src/components/skills/SkillDetailPanel.tsx:247:  }, [categories]);
src-tauri/src/utils/path.rs:38:/// `~/.ensemble/data.json`, replacing real categories/tags. The silent fallback
src-tauri/src/lib.rs:97:            data::get_categories,
src-tauri/src/lib.rs:101:            data::reorder_categories,
src-tauri/src/types.rs:154:    pub categories: Vec<Category>,
src-tauri/src/types.rs:921:        assert!(data.categories.is_empty());
src/components/claude-md/ClaudeMdCard.tsx:74:  const { tags: appTags, categories } = useAppStore();
src/components/claude-md/ClaudeMdCard.tsx:86:    ? categories.find((c) => c.id === file.categoryId)
src/components/claude-md/ClaudeMdDetailPanel.tsx:128:  const { categories, tags: appTags, addTag: addGlobalTag } = useAppStore();
src/components/claude-md/ClaudeMdDetailPanel.tsx:150:    const options = categories.map(cat => ({
src/components/claude-md/ClaudeMdDetailPanel.tsx:157:  }, [categories]);
src/components/sidebar/SortableCategoriesList.tsx:60:  categories: Category[];
src/components/sidebar/SortableCategoriesList.tsx:80:  categories,
src/components/sidebar/SortableCategoriesList.tsx:110:    activeId !== null ? (categories.find((c) => c.id === activeId) ?? null) : null;
src/components/sidebar/SortableCategoriesList.tsx:125:  const visibleCategories = showAll ? categories : categories.slice(0, maxVisible);
src/components/sidebar/SortableCategoriesList.tsx:126:  const remainingCount = categories.length - maxVisible;
src/components/sidebar/SortableCategoriesList.tsx:131:    if (!showAll && categories.length > maxVisible) {
src/components/sidebar/SortableCategoriesList.tsx:165:      const oldIdx = categories.findIndex((c) => c.id === active.id);
src/components/sidebar/SortableCategoriesList.tsx:166:      const newIdx = categories.findIndex((c) => c.id === over.id);
src/components/sidebar/SortableCategoriesList.tsx:168:        onReorder(arrayMove(categories, oldIdx, newIdx).map((c) => c.id));
src/components/sidebar/SortableCategoriesList.tsx:191:  if (categories.length === 0) {
src/components/sidebar/SortableCategoriesList.tsx:203:          <p className="text-xs text-[#A1A1AA] px-2.5">No categories</p>
src/components/sidebar/SortableCategoriesList.tsx:218:        announcements: makeAnnouncements(categories, 'category'),
src/components/sidebar/SortableCategoriesList.tsx:229:        items={categories.map((c) => c.id)}
src/components/common/Badge.tsx:17: * Badge component for displaying status, counts, categories, and tags.
src/components/common/Badge.tsx:22: * - category: Gray badge for categories (bg: #F4F4F5, text: #52525B)
src/utils/__tests__/constants.test.ts:21:  it('returns correct color for known categories', () => {
src/utils/__tests__/constants.test.ts:33:  it('returns "other" color for unknown categories', () => {
src/components/mcps/McpDetailPanel.tsx:147:  const { categories, tags: appTags, addTag: addGlobalTag } = useAppStore();
src/components/mcps/McpDetailPanel.tsx:176:  // Category dropdown options - only use categories from appStore
src/components/mcps/McpDetailPanel.tsx:178:    const options = categories.map(cat => ({
src/components/mcps/McpDetailPanel.tsx:185:  }, [categories]);
src/stores/__tests__/appStore.test.ts:11:      categories: [],
src/stores/__tests__/appStore.test.ts:65:    it('sets categories array', () => {
src/stores/__tests__/appStore.test.ts:66:      const categories = [{ id: '1', name: 'Dev', color: '#000', count: 3 }];
src/stores/__tests__/appStore.test.ts:67:      useAppStore.getState().setCategories(categories);
src/stores/__tests__/appStore.test.ts:68:      expect(useAppStore.getState().categories).toEqual(categories);
src/stores/skillsStore.ts:323:    const { categories, tags } = useAppStore.getState();
src/stores/skillsStore.ts:341:      // Get existing categories and tags
src/stores/skillsStore.ts:342:      const existingCategories = categories.map((c) => c.name);
src/stores/skillsStore.ts:358:      // Collect new categories and tags that need to be created
src/stores/skillsStore.ts:360:      const existingCategoryNames = new Set(categories.map(c => c.name));
src/stores/skillsStore.ts:377:      // Create new categories with predefined colors
src/stores/skillsStore.ts:379:      let colorIndex = categories.length;
src/stores/skillsStore.ts:404:      // Reload categories, tags, and skills to get updated data
src/stores/mcpsStore.ts:367:    const { categories, tags } = useAppStore.getState();
src/stores/mcpsStore.ts:385:      const existingCategories = categories.map((c) => c.name);
src/stores/mcpsStore.ts:400:      // Collect new categories and tags that need to be created
src/stores/mcpsStore.ts:402:      const existingCategoryNames = new Set(categories.map(c => c.name));
src/stores/mcpsStore.ts:419:      // Create new categories (using predefined colors)
src/stores/mcpsStore.ts:421:      let colorIndex = categories.length;
src/stores/mcpsStore.ts:445:      // Reload categories, tags, and MCPs
src/stores/appStore.ts:60:  categories: Category[];
src/stores/appStore.ts:63:  // Version counters — bumped on every mutation to categories/tags.
src/stores/appStore.ts:67:  categoriesVersion: number;
src/stores/appStore.ts:96:  setCategories: (categories: Category[]) => void;
src/stores/appStore.ts:129:  categories: [],
src/stores/appStore.ts:131:  categoriesVersion: 0,
src/stores/appStore.ts:161:  setCategories: (categories) =>
src/stores/appStore.ts:163:      categories,
src/stores/appStore.ts:164:      categoriesVersion: state.categoriesVersion + 1,
src/stores/appStore.ts:177:      console.warn('AppStore: Cannot load categories in browser mode');
src/stores/appStore.ts:184:    const versionBefore = get().categoriesVersion;
src/stores/appStore.ts:187:      const categories = await safeInvoke<Category[]>('get_categories');
src/stores/appStore.ts:188:      if (!categories) return;
src/stores/appStore.ts:190:      const versionAfter = get().categoriesVersion;
src/stores/appStore.ts:197:        categories,
src/stores/appStore.ts:198:        categoriesVersion: state.categoriesVersion + 1,
src/stores/appStore.ts:201:      console.error('Failed to load categories:', error);
src/stores/appStore.ts:248:          categories: [...state.categories, category],
src/stores/appStore.ts:249:          categoriesVersion: state.categoriesVersion + 1,
src/stores/appStore.ts:272:        categories: state.categories.map((c) =>
src/stores/appStore.ts:277:        categoriesVersion: state.categoriesVersion + 1,
src/stores/appStore.ts:297:        categories: state.categories.filter((c) => c.id !== id),
src/stores/appStore.ts:298:        categoriesVersion: state.categoriesVersion + 1,
src/stores/appStore.ts:386:  // Failure: try `get_categories` to pull canonical state; if that
src/stores/appStore.ts:394:    const snapshotForFallback = get().categories;
src/stores/appStore.ts:398:      categories: reordered,
src/stores/appStore.ts:399:      categoriesVersion: state.categoriesVersion + 1,
src/stores/appStore.ts:405:        const updated = await safeInvoke<Category[]>('reorder_categories', { orderedIds });
src/stores/appStore.ts:411:          const current = get().categories;
src/stores/appStore.ts:416:              categories: updated,
src/stores/appStore.ts:417:              categoriesVersion: state.categoriesVersion + 1,
src/stores/appStore.ts:422:        console.error('Failed to reorder categories:', error);
src/stores/appStore.ts:427:          const real = await safeInvoke<Category[]>('get_categories');
src/stores/appStore.ts:430:              categories: real,
src/stores/appStore.ts:431:              categoriesVersion: state.categoriesVersion + 1,
src/stores/appStore.ts:437:          console.error('Failed to recover canonical categories:', recoverError);
src/stores/appStore.ts:442:          categories: snapshotForFallback,
src/stores/appStore.ts:443:          categoriesVersion: state.categoriesVersion + 1,
src/stores/claudeMdStore.ts:418:    const { categories, tags } = useAppStore.getState();
src/stores/claudeMdStore.ts:437:      const existingCategories = categories.map((c) => c.name);
src/stores/claudeMdStore.ts:452:      // Collect new categories and tags that need to be created
src/stores/claudeMdStore.ts:454:      const existingCategoryNames = new Set(categories.map(c => c.name));
src/stores/claudeMdStore.ts:471:      // Create new categories
src/stores/claudeMdStore.ts:473:      let colorIndex = categories.length;
src/stores/claudeMdStore.ts:484:      // Reload categories and tags to get the newly created entities
src/stores/claudeMdStore.ts:488:      const updatedCategories = updatedState.categories;
src/stores/claudeMdStore.ts:491:      // Apply results - use updated categories/tags to find IDs
src/components/layout/Sidebar.tsx:46:  categories: Category[];
src/components/layout/Sidebar.tsx:102:// Maximum categories to display before showing "Show X more"
src/components/layout/Sidebar.tsx:112:  categories,
src/components/layout/Sidebar.tsx:308:              Pass the FULL `categories` array (not pre-sliced) so the list
src/components/layout/Sidebar.tsx:312:            categories={categories}
src/components/layout/MainLayout.tsx:39:    categories,
src/components/layout/MainLayout.tsx:96:  const categoriesWithCounts = useMemo(() => {
src/components/layout/MainLayout.tsx:97:    return categories.map((cat) => ({
src/components/layout/MainLayout.tsx:104:  }, [categories, skills, mcpServers, claudeMdFiles]);
src/components/layout/MainLayout.tsx:212:        // Initialize app data (categories, tags)
src/components/layout/MainLayout.tsx:488:        console.error('Failed to reorder categories:', e);
src/components/layout/MainLayout.tsx:572:          categories={categoriesWithCounts}
src/test/helpers/tauriMock.ts:30: * registerMockCommand('get_categories', () => [
src/components/scenes/CreateSceneModal.tsx:446:  // Get unique categories and tags
src/components/scenes/CreateSceneModal.tsx:447:  const categories = useMemo(() => {
src/components/scenes/CreateSceneModal.tsx:865:                  options={[{ value: '', label: 'All Categories' }, ...categories]}
src/types/index.ts:278:  categories: Category[];
```

### G6：`rg -n --no-heading 'parentId|parent_id' src/ src-tauri/src/`（**0 行**）

```text
(no output)
```

> **关键事实**：codebase 当前没有任何 `parentId` 或 `parent_id` 字段。引入 hierarchy 是全新增 schema 字段，不与既有命名冲突。

### G7：`rg -n --no-heading 'hierarchy|hierar|nested|depth|parent|child' src/components/sidebar`（15 行）

```text
src/components/sidebar/SortableTagPill.tsx:117:            ? 'bg-[#18181B] text-white border-transparent'
src/components/sidebar/SortableTagPill.tsx:118:            : 'bg-transparent text-[#52525B] border border-[#E5E5E5] hover:bg-[#F4F4F5]'
src/components/sidebar/CategoryInlineInput.tsx:83:        className="flex-1 bg-transparent text-[13px] outline-none border-none
src/components/sidebar/SortableCategoriesList.tsx:56: *   (defence-in-depth against the input-eats-drag class of bugs). The
src/components/sidebar/SortableCategoriesList.tsx:239:            // defence-in-depth (the parent SortableContext is also disabled
src/components/sidebar/DragOverlayTagPill.tsx:15: *   default uses `#FAFAFA` (NOT transparent like the in-place pill, since the
src/components/sidebar/TagPillContent.tsx:8: * radius / text color) is provided entirely by the parent container, so this
src/components/sidebar/TagPillContent.tsx:9: * component does not re-style the text — `color` cascades from the parent
src/components/sidebar/dnd/CustomMouseSensor.ts:13:    cur = cur.parentElement;
src/components/sidebar/dnd/CustomMouseSensor.ts:21: * us preserve interactive children like ColorPicker swatches inside an
src/components/sidebar/TagInlineInput.tsx:66:        className="bg-transparent text-[11px] font-medium outline-none border-none
src/components/sidebar/SortableCategoryRow.tsx:24:   * mouseup at drop position. Cleared by parent ~50ms later.
src/components/sidebar/SortableCategoryRow.tsx:46:    // Editing-mode rows must not be draggable (defence-in-depth — the parent
src/components/sidebar/SortableCategoryRow.tsx:74:    // parent covers the React render after onDragEnd.
src/components/sidebar/SortableCategoryRow.tsx:83:  // The sensor (configured with sortableKeyboardCoordinates in the parent
```

> 这些命中全是"defence-in-depth"、"parent SortableContext"、"parentElement"、"transparent"、"interactive children"等词中的子串，**没有一处是父子层级语义**。命名空间清空 — 引入 `parentId`/`parentCategoryId` 不会产生 lint 噪音。

### G8：`rg -n --no-heading 'getCategoryColor|categoryColors' src/`（36 行）

```text
src/pages/SkillDetailPage.tsx:89:const categoryColors: Record<string, string> = {
src/pages/SkillDetailPage.tsx:337:              style={{ backgroundColor: categoryColors[selectedSkill.category] || '#71717A' }}
src/components/skills/SkillItem.tsx:89:const categoryColors: Record<string, string> = {
src/components/skills/SkillItem.tsx:113:  const categoryColor = categoryColors[skill.category] || '#71717A';
src/utils/constants.ts:7:export const categoryColors: Record<string, string> = {
src/utils/constants.ts:20:export const getCategoryColor = (category: string): string => {
src/utils/constants.ts:21:  return categoryColors[category?.toLowerCase()] || categoryColors.other;
src/components/skills/SkillListItem.tsx:7:import { getCategoryColor } from '@/utils/constants';
src/components/skills/SkillListItem.tsx:68:  const categoryColor = getCategoryColor(skill.category);
src/stores/claudeMdStore.ts:472:      const categoryColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
src/stores/claudeMdStore.ts:475:        await addCategory(categoryName, categoryColors[colorIndex % categoryColors.length]);
src/stores/mcpsStore.ts:420:      const categoryColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
src/stores/mcpsStore.ts:423:        await addCategory(categoryName, categoryColors[colorIndex % categoryColors.length]);
src/stores/skillsStore.ts:378:      const categoryColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
src/stores/skillsStore.ts:381:        await addCategory(categoryName, categoryColors[colorIndex % categoryColors.length]);
src/components/mcps/McpListItem.tsx:6:import { getCategoryColor } from '@/utils/constants';
src/components/mcps/McpListItem.tsx:76:  const categoryColor = getCategoryColor(mcp.category);
src/utils/__tests__/constants.test.ts:2:import { categoryColors, getCategoryColor } from '../constants';
src/utils/__tests__/constants.test.ts:4:describe('categoryColors', () => {
src/utils/__tests__/constants.test.ts:6:    expect(categoryColors).toHaveProperty('development');
src/utils/__tests__/constants.test.ts:7:    expect(categoryColors).toHaveProperty('design');
src/utils/__tests__/constants.test.ts:8:    expect(categoryColors).toHaveProperty('research');
src/utils/__tests__/constants.test.ts:9:    expect(categoryColors).toHaveProperty('productivity');
src/utils/__tests__/constants.test.ts:10:    expect(categoryColors).toHaveProperty('other');
src/utils/__tests__/constants.test.ts:14:    Object.values(categoryColors).forEach((color) => {
src/utils/__tests__/constants.test.ts:20:describe('getCategoryColor', () => {
src/utils/__tests__/constants.test.ts:22:    expect(getCategoryColor('development')).toBe('#18181B');
src/utils/__tests__/constants.test.ts:23:    expect(getCategoryColor('design')).toBe('#8B5CF6');
src/utils/__tests__/constants.test.ts:24:    expect(getCategoryColor('research')).toBe('#3B82F6');
src/utils/__tests__/constants.test.ts:25:    expect(getCategoryColor('productivity')).toBe('#10B981');
src/utils/__tests__/constants.test.ts:29:    expect(getCategoryColor('Development')).toBe('#18181B');
src/utils/__tests__/constants.test.ts:30:    expect(getCategoryColor('DESIGN')).toBe('#8B5CF6');
src/utils/__tests__/constants.test.ts:34:    expect(getCategoryColor('nonexistent')).toBe(categoryColors.other);
src/utils/__tests__/constants.test.ts:35:    expect(getCategoryColor('')).toBe(categoryColors.other);
src/utils/__tests__/constants.test.ts:39:    expect(getCategoryColor(null as unknown as string)).toBe(categoryColors.other);
src/utils/__tests__/constants.test.ts:40:    expect(getCategoryColor(undefined as unknown as string)).toBe(categoryColors.other);
```

### G9：`rg -n --no-heading 'CategoryPage|category/:|/category/' src/`（9 行）

```text
src/pages/index.ts:10:export { default as CategoryPage } from './CategoryPage';
src/pages/CategoryPage.tsx:20:// CategoryPage Component
src/pages/CategoryPage.tsx:24:export function CategoryPage() {
src/pages/CategoryPage.tsx:335:export default CategoryPage;
src/components/skills/SkillDetailPanel.tsx:4: * This component is only used by CategoryPage and TagPage.
src/components/layout/Sidebar.tsx:191:      navigate(`/category/${categoryId}`);
src/components/layout/MainLayout.tsx:341:    if (path.startsWith('/category/') || path.startsWith('/tag/')) return null;
src/App.tsx:9:import CategoryPage from './pages/CategoryPage';
src/App.tsx:23:          <Route path="category/:categoryId" element={<CategoryPage />} />
```

### G10：`rg -n --no-heading 'SortableCategor' src/`（19 行）

```text
src/components/layout/Sidebar.tsx:5:import { SortableCategoriesList, SortableTagsList } from '@/components/sidebar';
src/components/layout/Sidebar.tsx:311:          <SortableCategoriesList
src/components/sidebar/SortableTagPill.tsx:8: * Sortable tag pill for the Sidebar Tags section. Mirrors `SortableCategoryRow`
src/components/sidebar/CategoryRowContent.tsx:6: * row (`SortableCategoryRow`) and the floating drag clone
src/components/sidebar/index.ts:4:export { SortableCategoryRow } from './SortableCategoryRow';
src/components/sidebar/index.ts:9:export { SortableCategoriesList } from './SortableCategoriesList';
src/components/sidebar/SortableTagsList.tsx:32: * `SortableCategoriesList` (T8) but uses `rectSortingStrategy` because tags
src/components/sidebar/SortableCategoriesList.tsx:22:import { SortableCategoryRow } from './SortableCategoryRow';
src/components/sidebar/SortableCategoriesList.tsx:59:interface SortableCategoriesListProps {
src/components/sidebar/SortableCategoriesList.tsx:79:export function SortableCategoriesList({
src/components/sidebar/SortableCategoriesList.tsx:96:}: SortableCategoriesListProps) {
src/components/sidebar/SortableCategoriesList.tsx:173:    // synthetic click that fires on mouseup. SortableCategoryRow checks this
src/components/sidebar/SortableCategoriesList.tsx:255:              <SortableCategoryRow
src/components/sidebar/SortableCategoriesList.tsx:318:export default SortableCategoriesList;
src/components/sidebar/SortableCategoryRow.tsx:9: * (set by `SortableCategoriesList`). When a drag is active for this row,
src/components/sidebar/SortableCategoryRow.tsx:17:interface SortableCategoryRowProps {
src/components/sidebar/SortableCategoryRow.tsx:34:export function SortableCategoryRow({
src/components/sidebar/SortableCategoryRow.tsx:43:}: SortableCategoryRowProps) {
src/components/sidebar/SortableCategoryRow.tsx:135:export default SortableCategoryRow;
```

### G11：`rg -n --no-heading 'reorder_categor|reorderCategor' src/ src-tauri/src/`（19 行）

```text
src-tauri/src/commands/data.rs:10:/// concurrent `reorder_categories` + `add_category` invocations can lose
src-tauri/src/commands/data.rs:273:pub fn reorder_categories(orderedIds: Vec<String>) -> Result<Vec<Category>, String> {
src-tauri/src/commands/data.rs:706:    fn reorder_categories_persists_order() {
src-tauri/src/commands/data.rs:710:        let result = reorder_categories(vec!["C".into(), "A".into(), "B".into()])
src-tauri/src/commands/data.rs:711:            .expect("reorder_categories");
src-tauri/src/commands/data.rs:726:    fn reorder_categories_returns_canonical_vec() {
src-tauri/src/commands/data.rs:731:        let result = reorder_categories(vec!["B".into()]).expect("reorder_categories");
src-tauri/src/commands/data.rs:758:    fn reorder_categories_unknown_id_is_skipped() {
src-tauri/src/commands/data.rs:762:        let result = reorder_categories(vec!["X".into(), "B".into(), "A".into()])
src-tauri/src/commands/data.rs:763:            .expect("reorder_categories");
src-tauri/src/commands/data.rs:789:        // 10 reorder_categories threads (no-op orderings drawn from the seed).
src-tauri/src/commands/data.rs:792:                let _ = reorder_categories(vec!["C".into(), "A".into(), "B".into()]);
src-tauri/src/lib.rs:101:            data::reorder_categories,
src/stores/appStore.ts:109:  reorderCategories: (orderedIds: string[]) => Promise<void>;
src/stores/appStore.ts:390:  reorderCategories: (orderedIds: string[]) => {
src/stores/appStore.ts:405:        const updated = await safeInvoke<Category[]>('reorder_categories', { orderedIds });
src/components/layout/MainLayout.tsx:66:    reorderCategories,
src/components/layout/MainLayout.tsx:486:        await reorderCategories(orderedIds);
src/components/layout/MainLayout.tsx:491:    [reorderCategories],
```

### G12：`rg -n --no-heading 'setCategoriesFilter|categoryFilter' src/`（6 行）

```text
src/components/scenes/CreateSceneModal.tsx:371:  const [categoryFilter, setCategoryFilter] = useState('');
src/components/scenes/CreateSceneModal.tsx:487:      if (categoryFilter && item.category !== categoryFilter) {
src/components/scenes/CreateSceneModal.tsx:512:  }, [activeTab, skills, mcpServers, searchQuery, categoryFilter, tagFilter, isSkillDisabled, isMcpDisabled]);
src/components/scenes/CreateSceneModal.tsx:866:                  value={categoryFilter}
src/stores/scenesStore.ts:21:  categoryFilter: string;
src/stores/scenesStore.ts:81:  categoryFilter: '',
```

> `setCategoriesFilter`（带 `s`）= 0 命中。`categoryFilter` 仅在 `CreateSceneModal`（弹窗中按 category name 筛选 skills/mcps）+ `scenesStore`（state slot，但**未被任何代码读写**——遗孤字段，详见 §6 与 R6）。

### G13：`rg -n --no-heading 'add_category|update_category|delete_category|get_categories' src-tauri/src/`（13 行）

```text
src-tauri/src/commands/data.rs:10:/// concurrent `reorder_categories` + `add_category` invocations can lose
src-tauri/src/commands/data.rs:15:/// Pure read commands (`get_categories`, `get_tags`, ...) do not acquire
src-tauri/src/commands/data.rs:214:pub fn get_categories() -> Result<Vec<Category>, String> {
src-tauri/src/commands/data.rs:221:pub fn add_category(name: String, color: String) -> Result<Category, String> {
src-tauri/src/commands/data.rs:240:pub fn update_category(id: String, name: Option<String>, color: Option<String>) -> Result<(), String> {
src-tauri/src/commands/data.rs:260:pub fn delete_category(id: String) -> Result<(), String> {
src-tauri/src/commands/data.rs:781:        // 10 add_category threads.
src-tauri/src/commands/data.rs:784:                add_category(format!("new-{i}"), "#FFFFFF".to_string())
src-tauri/src/commands/data.rs:785:                    .expect("add_category");
src-tauri/src/lib.rs:97:            data::get_categories,
src-tauri/src/lib.rs:98:            data::add_category,
src-tauri/src/lib.rs:99:            data::update_category,
src-tauri/src/lib.rs:100:            data::delete_category,
```

### G14：`rg -n --no-heading 'categoryOptions' src/`（10 行）

```text
src/pages/McpServersPage.tsx:220:  const categoryOptions = useMemo(() => {
src/pages/McpServersPage.tsx:428:            options={categoryOptions}
src/pages/SkillsPage.tsx:219:  const categoryOptions = useMemo(() => {
src/pages/SkillsPage.tsx:450:            options={categoryOptions}
src/components/skills/SkillDetailPanel.tsx:239:  const categoryOptions = useMemo(() => {
src/components/skills/SkillDetailPanel.tsx:413:            options={categoryOptions}
src/components/claude-md/ClaudeMdDetailPanel.tsx:149:  const categoryOptions = useMemo(() => {
src/components/claude-md/ClaudeMdDetailPanel.tsx:309:            options={categoryOptions}
src/components/mcps/McpDetailPanel.tsx:177:  const categoryOptions = useMemo(() => {
src/components/mcps/McpDetailPanel.tsx:377:            options={categoryOptions}
```

> **5 处 dropdown** — 都是 `categories.map(c => ({ value, label, color }))`，引入 hierarchy 后 D9（dropdown 是否树形）一旦确定就需 5 处统一改造。

### G15：`rg -n --no-heading "categories: \[" src/ src-tauri/src/`（3 行）

```text
src/stores/__tests__/appStore.test.ts:11:      categories: [],
src/stores/appStore.ts:129:  categories: [],
src/stores/appStore.ts:248:          categories: [...state.categories, category],
```

### G16：测试 mock + tauriMock + trash.rs（额外补扫）

```text
# tauriMock.ts
src/test/helpers/tauriMock.ts:30: * registerMockCommand('get_categories', () => [
src/test/helpers/tauriMock.ts:35:export function registerMockCommand(command: string, handler: CommandHandler): void {

# stores/__tests__/appStore.test.ts (重要 — 全部 category 相关 cases)
src/stores/__tests__/appStore.test.ts:9:      activeCategory: null,
src/stores/__tests__/appStore.test.ts:11:      categories: [],
src/stores/__tests__/appStore.test.ts:16:      editingCategoryId: null,
src/stores/__tests__/appStore.test.ts:17:      isAddingCategory: false,
src/stores/__tests__/appStore.test.ts:23:  describe('setActiveCategory', () => {
src/stores/__tests__/appStore.test.ts:24:    it('sets the active category', () => {
src/stores/__tests__/appStore.test.ts:25:      useAppStore.getState().setActiveCategory('cat-1');
src/stores/__tests__/appStore.test.ts:26:      expect(useAppStore.getState().activeCategory).toBe('cat-1');
src/stores/__tests__/appStore.test.ts:29:    it('clears active category when set to null', () => {
src/stores/__tests__/appStore.test.ts:30:      useAppStore.getState().setActiveCategory('cat-1');
src/stores/__tests__/appStore.test.ts:31:      useAppStore.getState().setActiveCategory(null);
src/stores/__tests__/appStore.test.ts:32:      expect(useAppStore.getState().activeCategory).toBeNull();
src/stores/__tests__/appStore.test.ts:65:    it('sets categories array', () => {
src/stores/__tests__/appStore.test.ts:66:      const categories = [{ id: '1', name: 'Dev', color: '#000', count: 3 }];
src/stores/__tests__/appStore.test.ts:67:      useAppStore.getState().setCategories(categories);
src/stores/__tests__/appStore.test.ts:68:      expect(useAppStore.getState().categories).toEqual(categories);
src/stores/__tests__/appStore.test.ts:88:    it('starts and stops editing category', () => {
src/stores/__tests__/appStore.test.ts:89:      useAppStore.getState().startEditingCategory('cat-1');
src/stores/__tests__/appStore.test.ts:90:      expect(useAppStore.getState().editingCategoryId).toBe('cat-1');
src/stores/__tests__/appStore.test.ts:92:      useAppStore.getState().stopEditingCategory();
src/stores/__tests__/appStore.test.ts:93:      expect(useAppStore.getState().editingCategoryId).toBeNull();
src/stores/__tests__/appStore.test.ts:96:    it('starts and stops adding category', () => {
src/stores/__tests__/appStore.test.ts:97:      useAppStore.getState().startAddingCategory();
src/stores/__tests__/appStore.test.ts:98:      expect(useAppStore.getState().isAddingCategory).toBe(true);
src/stores/__tests__/appStore.test.ts:100:      useAppStore.getState().stopAddingCategory();
src/stores/__tests__/appStore.test.ts:101:      expect(useAppStore.getState().isAddingCategory).toBe(false);
src/stores/__tests__/appStore.test.ts:113:      // Start editing a category
src/stores/__tests__/appStore.test.ts:114:      useAppStore.getState().startEditingCategory('cat-1');
src/stores/__tests__/appStore.test.ts:115:      // Now start editing a tag - should clear category editing
src/stores/__tests__/appStore.test.ts:118:      expect(useAppStore.getState().editingCategoryId).toBeNull();
src/stores/__tests__/appStore.test.ts:119:      expect(useAppStore.getState().isAddingCategory).toBe(false);
src/stores/__tests__/appStore.test.ts:124:      useAppStore.getState().startEditingCategory('cat-1');
src/stores/__tests__/appStore.test.ts:127:      expect(useAppStore.getState().editingCategoryId).toBeNull();
src/stores/__tests__/appStore.test.ts:128:      expect(useAppStore.getState().isAddingCategory).toBe(false);

# components/__tests__/Badge.test.tsx
src/components/__tests__/Badge.test.tsx:27:  it('renders category variant with color dot', () => {
src/components/__tests__/Badge.test.tsx:29:      <Badge variant="category" color="#8B5CF6">
src/components/__tests__/Badge.test.tsx:34:    // Category with color shows a dot

# utils/__tests__/constants.test.ts (见 G8 完整 31 行)

# trash.rs（实际行 401, 436）
src-tauri/src/commands/trash.rs:401:                category_id: file_info.category_id,
src-tauri/src/commands/trash.rs:436:                category_id: None,
```

### G17：docs / AGENTS / CHANGELOG / README / CLAUDE.md（额外补扫）

```text
# README.md
README.md:16:2. **Organize** with categories and tags (manual or AI-assisted)
README.md:26:  <a href="docs/screenshots/category-filter.png"><img src="docs/screenshots/category-filter.png" width="32%" alt="Category Filter" /></a>
README.md:63:- Sidebar filtering by category and tag
README.md:108:2. **Organize** -- add categories and tags, or use Auto Classify
README.md:118:├── data.json           # Application data (skills, MCPs, scenes, projects, categories, tags)

# CHANGELOG.md
CHANGELOG.md:18:  - Category and tag organization with custom icons
CHANGELOG.md:26:  - Category and tag organization
CHANGELOG.md:38:- **Categories**: Create and manage categories with custom colors
CHANGELOG.md:40:- **Category View**: Aggregate view of Skills, MCPs, and CLAUDE.md by category
CHANGELOG.md:57:- Search and filter with category/tag sidebar

# CONTRIBUTING.md / AGENTS.md = 0 命中

# CLAUDE.md (项目)
CLAUDE.md:74:React Router in `src/App.tsx`. `MainLayout` wraps all pages with a sidebar. Pages: Skills, MCP Servers, CLAUDE.md, Scenes, Projects, Settings, plus dynamic Category/Tag filter pages.

# docs/installation.md
docs/installation.md:97:├── data.json           # Application data (categories, tags, scenes, projects)
docs/installation.md:108:On first launch, Ensemble will also create default categories (Development, Writing, Analysis) and offer to import any existing Skills and MCP configurations from your Claude Code setup (`~/.claude/` and `~/.claude.json`).
docs/installation.md:131:**Warning**: Removing `~/.ensemble` will permanently delete all your managed Skills, MCP configurations, CLAUDE.md files, categories, tags, scenes, and project associations. This action cannot be undone.

# docs/development.md
docs/development.md:144:│   │   │   ├── CategoryEmptyIcon.tsx
docs/development.md:182:│   │   ├── CategoryInlineInput.tsx
docs/development.md:192:│   ├── CategoryPage.tsx             # Category filter page
docs/development.md:206:│   ├── appStore.ts                  # Global app state (categories, tags, initialization)
docs/development.md:245:│   │   ├── data.rs                  # App data persistence (categories, tags, scenes, projects)
docs/development.md:274:| `/category/:categoryId` | `CategoryPage` | Items filtered by category |
docs/development.md:311:    category: Option<String>,
docs/development.md:476:`get_categories`, `add_category`, `update_category`, `delete_category`,

# docs/usage.md (8 处) — 全是面向用户的功能说明
docs/usage.md:30:2. Use the search bar, category filter, or tag filter to find specific skills.
docs/usage.md:31:3. Click on a skill to view its details (name, description, instructions, category, tags, icon, scope, usage stats).
docs/usage.md:33:5. Edit category, tags, and icon directly in the detail panel.
docs/usage.md:53:2. Click on an MCP to view its details (name, description, command, args, environment variables, provided tools, category, tags, icon, scope).
docs/usage.md:56:5. Edit category, tags, and icon in the detail panel.
docs/usage.md:158:- Click on a CLAUDE.md file to view and edit its content, name, description, category, tags, and icon.
docs/usage.md:163:Ensemble supports organizing Skills, MCPs, and CLAUDE.md files with categories and tags.
docs/usage.md:165:- **Categories** -- Each item can belong to one category. Categories have names and colors. Navigate to a category in the sidebar to view all items in that category.
docs/usage.md:171:Ensemble can automatically categorize your Skills, MCPs, and CLAUDE.md files using AI.
docs/usage.md:175:- Auto-classification uses the **Claude CLI** (`claude` command) to analyze items and suggest categories, tags, and icons.
docs/usage.md:182:- A **suggested category** (e.g., "Development", "Database", "Web", "DevOps")
docs/usage.md:190:- New categories and tags are automatically created as needed.
docs/usage.md:191:- Existing valid categories and tags are reused for consistency.
docs/usage.md:253:3. **Organize with categories and tags** -- Use the auto-classification feature to quickly organize large collections, then refine manually as needed.

# docs/README.md (1 处)
docs/README.md:45:| **AI Auto-Classification** | Use the Claude CLI to automatically categorize, tag, and assign icons to Skills, MCPs, and CLAUDE.md files. | [Usage Guide -- Auto-Classification](./usage.md#auto-classification) |
```

### G18：dynamic url string `'/category/`（2 行）

```text
src/components/layout/Sidebar.tsx:191:      navigate(`/category/${categoryId}`);
src/components/layout/MainLayout.tsx:341:    if (path.startsWith('/category/') || path.startsWith('/tag/')) return null;
```

### G19：activeCategory + editingCategoryId + isAddingCategory state（25 处）

```text
# activeCategory
src/components/layout/Sidebar.tsx:44:  activeCategory?: string | null;
src/components/layout/Sidebar.tsx:110:  activeCategory,
src/components/layout/Sidebar.tsx:188:    if (activeCategory === categoryId) {
src/components/layout/Sidebar.tsx:313:            activeCategoryId={activeCategory ?? null}
src/components/sidebar/SortableCategoriesList.tsx:61:  activeCategoryId: string | null;
src/components/sidebar/SortableCategoriesList.tsx:81:  activeCategoryId,
src/components/sidebar/SortableCategoriesList.tsx:109:  const activeCategory =
src/components/sidebar/SortableCategoriesList.tsx:258:                isActive={activeCategoryId === category.id}
src/components/sidebar/SortableCategoriesList.tsx:312:        {activeCategory && <DragOverlayCategoryRow category={activeCategory} />}
src/components/layout/MainLayout.tsx:37:    activeCategory,
src/components/layout/MainLayout.tsx:237:    setSkillsFilter({ category: activeCategory, tags: activeTags });
src/components/layout/MainLayout.tsx:238:    setMcpsFilter({ category: activeCategory, tags: activeTags });
src/components/layout/MainLayout.tsx:239:  }, [activeCategory, activeTags, setSkillsFilter, setMcpsFilter]);
src/components/layout/MainLayout.tsx:570:          activeCategory={currentCategoryId || activeCategory}
src/stores/appStore.ts:56:  activeCategory: string | null;
src/stores/appStore.ts:127:  activeCategory: null,
src/stores/appStore.ts:149:  setActiveCategory: (categoryId) => set({ activeCategory: categoryId }),
src/stores/appStore.ts:299:        activeCategory: state.activeCategory === id ? null : state.activeCategory,

# editing/adding state
src/components/layout/Sidebar.tsx:64:  editingCategoryId?: string | null;
src/components/layout/Sidebar.tsx:65:  isAddingCategory?: boolean;
src/components/layout/Sidebar.tsx:123:  editingCategoryId,
src/components/layout/Sidebar.tsx:124:  isAddingCategory,
src/components/layout/Sidebar.tsx:314:            editingCategoryId={editingCategoryId ?? null}
src/components/layout/Sidebar.tsx:315:            isAddingCategory={isAddingCategory ?? false}
src/components/layout/MainLayout.tsx:45:    editingCategoryId,
src/components/layout/MainLayout.tsx:46:    isAddingCategory,
src/components/layout/MainLayout.tsx:50:    startEditingCategory,
src/components/layout/MainLayout.tsx:51:    stopEditingCategory,
src/components/layout/MainLayout.tsx:52:    startAddingCategory,
src/components/layout/MainLayout.tsx:53:    stopAddingCategory,
src/components/layout/MainLayout.tsx:361:    startAddingCategory();
src/components/layout/MainLayout.tsx:365:    startEditingCategory(categoryId);
src/components/layout/MainLayout.tsx:377:      stopEditingCategory();
src/components/layout/MainLayout.tsx:378:    stopAddingCategory();
src/components/layout/MainLayout.tsx:385:    stopEditingCategory();
src/components/layout/MainLayout.tsx:386:    stopAddingCategory();
src/components/layout/MainLayout.tsx:400:      startEditingCategory(contextMenu.category.id);
src/components/layout/MainLayout.tsx:509:    if (s.editingCategoryId || s.isAddingCategory || s.editingTagId || s.isAddingTag) {
src/components/layout/MainLayout.tsx:583:          editingCategoryId={editingCategoryId}
src/components/layout/MainLayout.tsx:584:          isAddingCategory={isAddingCategory}
src/stores/appStore.ts:83:  editingCategoryId: string | null;
src/stores/appStore.ts:84:  isAddingCategory: boolean;
src/stores/appStore.ts:115:  startEditingCategory: (id: string) => void;
src/stores/appStore.ts:116:  stopEditingCategory: () => void;
src/stores/appStore.ts:117:  startAddingCategory: () => void;
src/stores/appStore.ts:118:  stopAddingCategory: () => void;
src/stores/appStore.ts:143:  editingCategoryId: null,
src/stores/appStore.ts:144:  isAddingCategory: false,
src/stores/appStore.ts:528:      editingCategoryId: null,
src/stores/appStore.ts:529:      isAddingCategory: false,
src/stores/appStore.ts:535:  startEditingCategory: (id: string) => {
src/stores/appStore.ts:537:    set({ editingCategoryId: id });
src/stores/appStore.ts:540:  stopEditingCategory: () => set({ editingCategoryId: null }),
src/stores/appStore.ts:542:  startAddingCategory: () => {
src/stores/appStore.ts:544:    set({ isAddingCategory: true });
src/stores/appStore.ts:547:  stopAddingCategory: () => set({ isAddingCategory: false }),
```

### G20：announcements / aria（4 行）

```text
src/components/sidebar/dnd/announcements.ts:25: * - `label`: the kind of item being announced ("category" | "tag"); shapes
src/components/sidebar/dnd/announcements.ts:28:export function makeAnnouncements(items: NamedItem[], label: 'category' | 'tag'): Announcements {
src/components/layout/Sidebar.tsx:298:              aria-label="Add category"
# `aria-label`/`aria-roledescription` 中其他 sortable 标签由 dnd-kit 默认 'sortable' 提供（announcements.ts onDragStart/onDragOver/onDragEnd/onDragCancel 中 `${label} ${activeName}` 措辞）
```

### G21：import.rs / plugins.rs / config.rs 的 category 引用（**0 真实命中**）

```text
src-tauri/src/commands/import.rs:1049:				<key>AMCategory</key>
src-tauri/src/commands/import.rs:1051:					<string>AMCategoryUtilities</string>
src-tauri/src/commands/import.rs:1107:				<key>Category</key>
src-tauri/src/commands/import.rs:1109:					<string>AMCategoryUtilities</string>
```

> 这 4 行是 macOS Finder Quick Action `.workflow` 的 plist `AMCategory` / `Category` 字段（与 Skills/MCPs/categories 数据模型**完全无关**），不计入 impact。`plugins.rs` / `config.rs` 真实 0 命中。


---

## 3. 完整 impact 表（按文件分组，逐行决议）

> 决议类别：
> - **MUST_CHANGE**：本任务必改，附改动方向
> - **MAY_CHANGE**：依赖某 D 决策结果，明确依赖项
> - **NO_CHANGE**：保留现状

### 3.1 数据形状层（types.rs / types/index.ts / types/claudeMd.ts）

| file:line | 当前 code 摘录 | 引用类型 | 决议 |
|---|---|---|---|
| `src-tauri/src/types.rs:10` | `pub category: String,` (Skill) | name 字段 | **MAY_CHANGE** — 依赖 D1。若 D1=A（统一 id），改为 `pub category_id: Option<String>` 或并存过渡字段 |
| `src-tauri/src/types.rs:42` | `pub category: String,` (McpServer) | name 字段 | **MAY_CHANGE** — 同上 |
| `src-tauri/src/types.rs:136-141` | `pub struct Category { id, name, color, count }` | Category struct | **MUST_CHANGE** — 必须新增 `pub parent_id: Option<String>` (D2=A) 或同义形状（D2=B/C 替代）。需 `#[serde(default, skip_serializing_if = "Option::is_none")]` 保证旧 data.json 反序列化兼容 |
| `src-tauri/src/types.rs:154` | `pub categories: Vec<Category>,` (AppData) | 容器 | **NO_CHANGE**（D2=A）/ **MAY_CHANGE**（D2=B/C 嵌套形状） |
| `src-tauri/src/types.rs:181` | `pub category: String,` (SkillMetadata) | name 字段 | **MAY_CHANGE** — 依赖 D1，与 Skill struct 同步 |
| `src-tauri/src/types.rs:193` | `pub category: String,` (McpMetadata) | name 字段 | **MAY_CHANGE** — 依赖 D1，与 McpServer struct 同步 |
| `src-tauri/src/types.rs:653` | `pub category_id: Option<String>,` (ClaudeMdFile) | id 字段 | **NO_CHANGE** — 已是 id-based，无需改 |
| `src-tauri/src/types.rs:741` | `pub category_id: Option<String>,` (ClaudeMdImportOptions) | id 字段 | **NO_CHANGE** |
| `src-tauri/src/types.rs:921` | `assert!(data.categories.is_empty());` (test) | 测试断言 | **NO_CHANGE** |
| `src-tauri/src/types.rs:948-961` | `fn test_category_serde_roundtrip()` | serde test | **MUST_CHANGE** — 新增 `parent_id` 字段后 roundtrip 必须包含该字段，并新增"旧 JSON（无 parent_id）能正确反序列化"专项测试 |
| `src/types/index.ts:8` | `category: string;` (Skill) | TS name 字段 | **MAY_CHANGE** — 依赖 D1，与 Rust 同步 |
| `src/types/index.ts:33` | `category: string;` (McpServer) | TS name 字段 | **MAY_CHANGE** — 依赖 D1，与 Rust 同步 |
| `src/types/index.ts:84-89` | `interface Category { id, name, color, count }` | TS Category | **MUST_CHANGE** — 必须新增 `parentId?: string`（与 Rust `parent_id` camelCase 对齐，serde rename_all=camelCase 已自动转换） |
| `src/types/index.ts:141` | `suggested_category: string;` (ClassifyResult) | LLM 返回字段 | **MAY_CHANGE** — 依赖 D14。若 D14=B（LLM 建议父类），需新增 `suggested_parent_category?: string` |
| `src/types/index.ts:278` | `categories: Category[];` (AppData) | TS 容器 | **NO_CHANGE**（D2=A）/ **MAY_CHANGE**（D2=B/C） |
| `src/types/claudeMd.ts:54` | `categoryId?: string;` (ClaudeMdFile) | id 字段 | **NO_CHANGE** |
| `src/types/claudeMd.ts:133` | `categoryId?: string;` (ClaudeMdImportOptions) | id 字段 | **NO_CHANGE** |

### 3.2 Rust 后端 — 数据 / 命令层

| file:line | 当前 code 摘录 | 引用类型 | 决议 |
|---|---|---|---|
| `src-tauri/src/commands/data.rs:10` | doc comment "concurrent reorder_categories + add_category..." | 注释 | **NO_CHANGE** |
| `src-tauri/src/commands/data.rs:15` | doc "Pure read commands (get_categories, get_tags...)" | 注释 | **NO_CHANGE** |
| `src-tauri/src/commands/data.rs:166` | `categories: vec![ ... ]` (default seed) | 默认数据 | **MAY_CHANGE** — 默认 seed 是否要带 parent_id 示例（依赖 D2 形状），通常无需改 |
| `src-tauri/src/commands/data.rs:212-216` | `pub fn get_categories() -> Result<Vec<Category>, String>` | API | **NO_CHANGE** — 返回 Vec 平铺，前端按 parent_id 自行重建树 |
| `src-tauri/src/commands/data.rs:219-235` | `pub fn add_category(name, color)` | API | **MUST_CHANGE** — 签名扩展为 `add_category(name, color, parent_id: Option<String>)`，并校验 parent_id 不指向 child（max depth=2 闸门，详见 §6 D13） |
| `src-tauri/src/commands/data.rs:238-254` | `pub fn update_category(id, name, color)` | API | **MUST_CHANGE** — 增加 optional `parent_id: Option<Option<String>>` 参数（嵌套 Option 区分"不修改"vs"清空 parent"），同样要校验 max depth + cycle |
| `src-tauri/src/commands/data.rs:258-264` | `pub fn delete_category(id)` | API | **MUST_CHANGE** — 删除父类时必须决定子类归宿：<br>(a) 拒绝删除（要求先迁移子）；<br>(b) 子类自动 promote 到根；<br>(c) 级联删除子类。依赖 D13 决议。**默认 (b) promote**（HCI 友好）|
| `src-tauri/src/commands/data.rs:268-280` | `pub fn reorder_categories(orderedIds)` | API | **MUST_CHANGE** — V3 现有契约只支持单层 id 序列。hierarchy 后语义模糊。两条路：<br>(1) **保留单层**：orderedIds 仅描述根级 reorder，子类各自有独立 reorder API；<br>(2) **扩展契约**：传 `(parentId, orderedIds)` 元组，按 parent 分桶 reorder。<br>选 (1) 改动小、与 V3 不变量冲突最小；选 (2) 一次 IPC 完成，但需重写 apply_reorder。**推荐 (1)** 并新增 `reorder_categories_within_parent(parentId, orderedIds)` |
| `src-tauri/src/commands/data.rs:696-700` | `fn seed(categories, tags)` (test helper) | 测试 helper | **MAY_CHANGE** — 测试用例若涵盖 hierarchy 需扩展 helper |
| `src-tauri/src/commands/data.rs:706-723` | `reorder_categories_persists_order` test | 测试 | **MUST_CHANGE** — 新增 hierarchy reorder 测试（同 parent 内 reorder + 跨 parent move 行为） |
| `src-tauri/src/commands/data.rs:726-736` | `reorder_categories_returns_canonical_vec` | 测试 | **NO_CHANGE** — 但 hierarchy 后需补一个 returns_canonical_vec_with_hierarchy 同向测试 |
| `src-tauri/src/commands/data.rs:758-768` | `reorder_categories_unknown_id_is_skipped` | 测试 | **NO_CHANGE** |
| `src-tauri/src/commands/data.rs:775-815` | concurrent `add_category + reorder` test | 测试 | **MUST_CHANGE** — 并发集中加入"add_category with parent_id"路径验证 |
| `src-tauri/src/commands/skills.rs:49-90` | `update_skill_metadata(category: Option<String>)` | metadata.category 写入 | **MAY_CHANGE** — 依赖 D1。若 D1=A，改为 `category_id: Option<String>` |
| `src-tauri/src/commands/skills.rs:144` (经 G1 推断含 `metadata.category` 间接引用) | metadata 反查 | metadata 读 | **MAY_CHANGE** — 依赖 D1 |
| `src-tauri/src/commands/skills.rs:208` | `category: metadata.map(|m| m.category.clone()).unwrap_or_default()` | metadata 读 | **MAY_CHANGE** — 依赖 D1 |
| `src-tauri/src/commands/mcps.rs:49-72` | `update_mcp_metadata(category: Option<String>)` | metadata.category 写入 | **MAY_CHANGE** — 同 skills |
| `src-tauri/src/commands/mcps.rs:144` | `category: metadata.map(\|m\| m.category.clone()).unwrap_or_default()` | metadata 读 | **MAY_CHANGE** — 同 skills |
| `src-tauri/src/commands/claude_md.rs:371` | `category_id: options.category_id` | 导入 | **NO_CHANGE** — 已是 id |
| `src-tauri/src/commands/claude_md.rs:497` | doc "category_id - New category (optional)" | 注释 | **NO_CHANGE** |
| `src-tauri/src/commands/claude_md.rs:506` | `category_id: Option<String>` (update_claude_md 参数) | 参数 | **NO_CHANGE** — 但若 D7（聚合视图）要求父类下展示子类内容，需文档说明 categoryId 可指向叶子或父级 |
| `src-tauri/src/commands/claude_md.rs:541-542` | `if let Some(cid) = category_id { file.category_id = Some(cid); }` | 更新逻辑 | **NO_CHANGE** |
| `src-tauri/src/commands/claude_md.rs:704` | `category_id: None` (test fixture) | 测试 fixture | **NO_CHANGE** |
| `src-tauri/src/commands/classify.rs:22` | `pub suggested_category: String` | LLM 输出结构 | **MAY_CHANGE** — 依赖 D14。若 D14=B，新增 `suggested_parent_category: Option<String>` |
| `src-tauri/src/commands/classify.rs:30-38` | `categories: &[String]` (build_classification_prompt 入参) | prompt 构造 | **MAY_CHANGE** — 依赖 D14。若 D14=B，需改成 `categories: &[(String, Option<String>)]` 表达 (name, parent) |
| `src-tauri/src/commands/classify.rs:50-95` | prompt 文本 "ENTROPY REDUCTION" / category list | prompt 文本 | **MAY_CHANGE** — 依赖 D14。若 D14=A（不感知）保持；D14=B 需新增父类指示 |
| `src-tauri/src/commands/classify.rs:140` | `categories_list = categories_list` | format args | **MAY_CHANGE** — 同上 |
| `src-tauri/src/commands/classify.rs:151-160` | `existing_categories: Vec<String>` (run_claude_classify) | IPC 入参 | **MAY_CHANGE** — 依赖 D14 |
| `src-tauri/src/commands/classify.rs:172-184` | JSON schema `"category": {...}, required: ["id","category","tags","icon"]` | LLM 输出 schema | **MAY_CHANGE** — D14=B 需新增 `parent_category` 字段到 schema |
| `src-tauri/src/commands/classify.rs:234` | `suggested_category: c["category"].as_str()?.to_string()` | LLM 输出解析 | **MAY_CHANGE** — D14=B 需附加解析 |
| `src-tauri/src/commands/trash.rs:401` | `category_id: file_info.category_id` (恢复 ClaudeMdFile) | 恢复 | **NO_CHANGE** — 已是 id 路径，但需新增"恢复时父类已被删除"的孤儿子的 fallback（详见 §6 D13） |
| `src-tauri/src/commands/trash.rs:436` | `category_id: None` (恢复时清空 — 需查上下文确认) | 恢复 fallback | **MAY_CHANGE** — 若父级缺失要 fallback 到 None，需对子类等同处理 |
| `src-tauri/src/lib.rs:97-101` | `tauri::generate_handler![data::get_categories, add_category, update_category, delete_category, reorder_categories]` | command registry | **MAY_CHANGE** — 若新增 `reorder_categories_within_parent` 需注册；其他签名扩展不影响注册形式 |
| `src-tauri/src/utils/path.rs:38` | doc "replacing real categories/tags" | 注释 | **NO_CHANGE** |

### 3.3 前端 stores

| file:line | 当前 code 摘录 | 引用类型 | 决议 |
|---|---|---|---|
| `src/stores/appStore.ts:56` | `activeCategory: string \| null` | state | **NO_CHANGE** — 仍是单 id；点击父类时 activeCategory 等于父 id |
| `src/stores/appStore.ts:60` | `categories: Category[]` | state（含新 parentId 字段后形状自动跟随） | **NO_CHANGE** |
| `src/stores/appStore.ts:63-67` | `categoriesVersion: number` | reorder version 协议 | **NO_CHANGE** — 协议保持 |
| `src/stores/appStore.ts:83-84` | `editingCategoryId, isAddingCategory` | edit 态 | **MAY_CHANGE** — 若 D 决议要求"在父类下新增子类"，新增 inline 输入需多一个 `addingChildOfCategoryId: string \| null` 状态以区分"加根"vs"加子" |
| `src/stores/appStore.ts:91, 149` | `setActiveCategory: (categoryId)` | 现有 setter | **NO_CHANGE** |
| `src/stores/appStore.ts:96, 161-164` | `setCategories(categories)` + bump version | bulk setter | **NO_CHANGE** |
| `src/stores/appStore.ts:115-118, 535-547` | `startEditingCategory/stop... + startAddingCategory/stop...` | edit 态 mutator | **MAY_CHANGE** — 若新增 `addingChild` 状态，需 startAddingChildCategory(parentId) / stopAddingChildCategory mutator |
| `src/stores/appStore.ts:127, 143-144` | initial state `activeCategory: null, editingCategoryId: null, isAddingCategory: false` | initial state | **MAY_CHANGE** — addingChildOfCategoryId 初值 |
| `src/stores/appStore.ts:184-201` | `loadCategories` (version-aware) | IPC | **NO_CHANGE** — protocol 不动 |
| `src/stores/appStore.ts:240-258` | `addCategory(name, color)` (IPC) | IPC | **MUST_CHANGE** — 签名扩展为 `addCategory(name, color, parentId?: string)` |
| `src/stores/appStore.ts:265-281` | `updateCategory(id, name, color)` | IPC | **MUST_CHANGE** — 增加 `parentId?: string \| null` 参数（null 表示 promote 到根） |
| `src/stores/appStore.ts:290-303` | `deleteCategory(id)` (含 activeCategory 重置) | IPC | **MUST_CHANGE** — 父类删除时 active 子类亦失效；需配合 D13 决议处理孤儿 |
| `src/stores/appStore.ts:299` | `activeCategory: state.activeCategory === id ? null : state.activeCategory` | active 重置 | **MUST_CHANGE** — 删除父类时其下所有子类也都被 promote/cascade，子 id 等于 active 时也要重置 active |
| `src/stores/appStore.ts:386-444` | `reorderCategories` 完整两阶段提交逻辑 | reorder | **MUST_CHANGE** — 若选择"reorder API 按 parent 分桶"，需要按 parent 分别 enqueue + 后端调用 `reorder_categories_within_parent`；优化项是"将 hierarchy reorder 拆分为 within-parent reorder + cross-parent move"两个独立 mutator |
| `src/stores/skillsStore.ts:11-15, 50, 61, 72` | `category: string \| null` (filter) / `updateSkillCategory` | filter & mutator | **MAY_CHANGE** — D1=A 时 filter.category 改为 categoryId |
| `src/stores/skillsStore.ts:144, 158-187` | `updateSkillCategory: async (id, category)` 含 IPC + 乐观更新 + 回滚 | mutator | **MAY_CHANGE** — D1=A 时改为 `updateSkillCategoryId(id, categoryId)` |
| `src/stores/skillsStore.ts:323-410` | `autoClassify` 路径（`existing_categories: categories.map(c => c.name)`、新建 category） | autoClassify | **MAY_CHANGE** — D14=A 时不变，新建仍在根；D14=B 时需传 hierarchy snapshot + 解析 parent_category 后调用 addCategory(name, color, parentId) |
| `src/stores/skillsStore.ts:467-468` | `if (filter.category) { filtered = filtered.filter(skill => skill.category === filter.category); }` | filter | **MAY_CHANGE** — D7（父类聚合视图）+ D1。若聚合 + name 引用，需将"父类的所有子类 names"全部纳入 filter；推荐改为 `filter.categoryId` + `categoryIdMatches(skill, [activeCategoryId, ...descendantIds])`  |
| `src/stores/mcpsStore.ts:11, 41, 61, 144-158, 367-460, 484-487` | 完全镜像 skillsStore.ts | 同上 | **MAY_CHANGE** — 同 skillsStore |
| `src/stores/claudeMdStore.ts:25, 105` | `categoryId: string \| null` (filter) | filter | **NO_CHANGE** — 已 id 形式 |
| `src/stores/claudeMdStore.ts:258` | `categoryId: updates.categoryId` | passthrough | **NO_CHANGE** |
| `src/stores/claudeMdStore.ts:418-510` | `autoClassify` (查 name → 找 id) | autoClassify | **MAY_CHANGE** — 同 skills/mcps，D14 决定 |
| `src/stores/claudeMdStore.ts:563-564` | `if (filter.categoryId) { filtered = filtered.filter(file => file.categoryId === filter.categoryId); }` | filter | **MUST_CHANGE** — D7（聚合）确认后改为 "categoryId === active OR descendant ids 之一" |
| `src/stores/scenesStore.ts:21, 81` | `categoryFilter: string` (state slot) | scenes filter | **NO_CHANGE** — **遗孤字段**（无任何代码 write 它，无任何代码 read 它）；R6 将提议删除或重新激活 |

### 3.4 前端 — Sidebar 渲染（Layer 1）

| file:line | 当前 code 摘录 | 引用类型 | 决议 |
|---|---|---|---|
| `src/components/layout/Sidebar.tsx:5` | `import { SortableCategoriesList, SortableTagsList }` | import | **NO_CHANGE** |
| `src/components/layout/Sidebar.tsx:44, 110` | `activeCategory?: string \| null` (props) | props | **NO_CHANGE** |
| `src/components/layout/Sidebar.tsx:46, 112` | `categories: Category[]` (props) | props | **NO_CHANGE** — 形状改变后自动同步 |
| `src/components/layout/Sidebar.tsx:56` | `onCategoryChange: (categoryId: string \| null) => void` | callback | **NO_CHANGE** |
| `src/components/layout/Sidebar.tsx:60-61, 70` | `onCategoryContextMenu / onCategoryColorChange / onCategoryDoubleClick` | callbacks | **NO_CHANGE** — handler 仍按 categoryId/Category 引用 |
| `src/components/layout/Sidebar.tsx:64-65, 123-124` | `editingCategoryId, isAddingCategory` (props) | props | **MAY_CHANGE** — 若新增 addingChildOfCategoryId 状态，传递新 prop |
| `src/components/layout/Sidebar.tsx:102` | comment "Maximum categories to display before showing 'Show X more'" | 注释 | **NO_CHANGE** |
| `src/components/layout/Sidebar.tsx:187-208` | `handleCategoryRowClick`, `handleCategoryContextMenu` | handlers | **NO_CHANGE** |
| `src/components/layout/Sidebar.tsx:191` | `navigate(`/category/${categoryId}`)` | router nav | **NO_CHANGE** — URL 不变；CategoryPage 内部按 D7 决定聚合行为 |
| `src/components/layout/Sidebar.tsx:289-303` | Categories Section Header `aria-label="Add category"` + Plus button | section header | **MAY_CHANGE** — D12（展开折叠）若需 chevron 全局 toggle 在此处加按钮；通常不动 |
| `src/components/layout/Sidebar.tsx:311-328` | `<SortableCategoriesList ... />` invocation | render | **MAY_CHANGE** — 新增 hierarchy 相关 props 透传 |
| `src/components/sidebar/index.ts:1-9` | barrel `CategoryInlineInput / CategoryRowContent / SortableCategoryRow / DragOverlayCategoryRow / SortableCategoriesList` | exports | **MAY_CHANGE** — 若新增组件（如 `CategoryGroup`、`CategoryChevron`、`SortableSubCategoryRow`）需导出 |
| `src/components/sidebar/CategoryInlineInput.tsx:7-21` | `category?: Category;` 编辑模式必需 | input | **MAY_CHANGE** — 若新增子类时也走相同 input，需可选传入 `parentId` 用于颜色继承（继承父类色 vs 独立色，依赖 D11） |
| `src/components/sidebar/CategoryRowContent.tsx:5-58` | shared row content (ColorPicker + name + count) | shared render | **MAY_CHANGE** — D8（父 count 算法）若选 sum 子级，count 数字源不同；D11 决定 dot 是否为 parent 色 |
| `src/components/sidebar/SortableCategoryRow.tsx:1-135` | 单行 sortable wrapper（V3 不变量） | row | **MAY_CHANGE** — D3 决定 dnd-kit 模式：<br>(A) 单 SortableContext + 投影：本组件内新增 paddingLeft 与 depth 渲染；保持 useSortable 不变；<br>(B) 嵌套 SortableContext：本组件不动，外层多包一层；<br>D4 / D5 决定是否在 onDragOver/onDragEnd 处理"drop into" 语义。**注意保留 V3 不变量**（4px 激活、220ms cascade、distance-aware settle、justDropped 50ms guard、shadow listeners chain、CSS.Translate.toString）|
| `src/components/sidebar/DragOverlayCategoryRow.tsx:5-22` | DragOverlay clone | clone | **MAY_CHANGE** — 拖父类时 clone 是否带子树预览：<br>(A) 仅显示父行（默认）；<br>(B) 显示父+折叠 N 子（D5=B 时）|
| `src/components/sidebar/SortableCategoriesList.tsx:50-318` | DndContext + SortableContext 容器 | 容器 | **MUST_CHANGE** — 核心改造点。需引入：<br>1. tree → flat 函数（生成 sortable items 列表）<br>2. projected depth 计算（D3=A）或多 SortableContext 嵌套（D3=B）<br>3. 新 modifier or 扩展 `snapModifier` 同时处理 indent 投影（**不能破坏 V3 12px 磁吸**）<br>4. onDragOver 检测水平偏移以判 "drop into" vs reorder（依赖 D4）<br>5. flatten/restore 与 V3 distance-aware settle 协调<br>6. announcements 措辞扩展（"moved to child of X" / "promoted to root"，G20 announcements.ts 也要扩展） |
| `src/components/sidebar/SortableCategoriesList.tsx:165-168` | `arrayMove(categories, oldIdx, newIdx).map(c => c.id)` | reorder 计算 | **MUST_CHANGE** — hierarchy 后 arrayMove 需感知 depth；推荐改为完整 flatten + 二次 group 算法 |
| `src/components/sidebar/SortableCategoriesList.tsx:218` | `announcements: makeAnnouncements(categories, 'category')` | a11y | **MAY_CHANGE** — `makeAnnouncements` 签名需支持 hierarchy 措辞 |
| `src/components/sidebar/SortableCategoriesList.tsx:229` | `items={categories.map(c => c.id)}` | SortableContext.items | **MUST_CHANGE** — 若 D3=A，items 应是 flatten 后的 id 序列；若 D3=B，每个 SortableContext 各自的 ids |
| `src/components/sidebar/SortableCategoriesList.tsx:234-267` | `visibleCategories.map((category) => { isEditing? ... : <SortableCategoryRow /> })` | render loop | **MUST_CHANGE** — 渲染 loop 需考虑 depth（缩进 / 折叠）；折叠展开下子类应当从渲染中过滤；D12 决定 |
| `src/components/sidebar/dnd/animations.ts:12-27` | `CATEGORY_DROP_ANIMATION` / `TAG_DROP_ANIMATION` / `SNAP_DISTANCE_PX = 12` | tokens | **NO_CHANGE** — V3 不变量 |
| `src/components/sidebar/dnd/announcements.ts:7-85` | `makeAnnouncements(items, label)` | a11y | **MUST_CHANGE** — 增加"父→子"、"子→根"、"父类内 reorder"措辞分支 |
| `src/components/sidebar/dnd/CustomMouseSensor.ts` | `data-no-dnd` 跳过逻辑 | sensor | **NO_CHANGE** — V3 不变量 |
| `src/components/sidebar/dnd/snapModifier.ts` | 12px 磁吸 modifier | modifier | **MAY_CHANGE** — 若 D3=A 投影深度方案，可能需扩展为同时处理 horizontal indent；**禁止覆盖 V3 12px 磁吸语义** |

### 3.5 前端 — MainLayout / 路由

| file:line | 当前 code 摘录 | 引用类型 | 决议 |
|---|---|---|---|
| `src/App.tsx:9` | `import CategoryPage from './pages/CategoryPage'` | route import | **NO_CHANGE** |
| `src/App.tsx:23` | `<Route path="category/:categoryId" element={<CategoryPage />} />` | route | **NO_CHANGE** — URL 不变；语义改为 D7（聚合 vs 独立）|
| `src/components/layout/MainLayout.tsx:19, 39` | `import { Category } from @/types`, `categories` | import / state pull | **NO_CHANGE** |
| `src/components/layout/MainLayout.tsx:37, 45-53, 66` | pull edit state + reorder mutator | wiring | **NO_CHANGE** |
| `src/components/layout/MainLayout.tsx:95-104` | `categoriesWithCounts = useMemo(...)` (注入 count) | derived state | **MUST_CHANGE** — D8 决议：<br>(A) 仅自身 = 当前不变；<br>(B) 自身 + 子级总和 = 必须先按 parent 分组并累加；推荐 helper `aggregateCount(category, allItems)` 递归一层（max depth=2 不会爆栈） |
| `src/components/layout/MainLayout.tsx:212` | comment "Initialize app data (categories, tags)" | 注释 | **NO_CHANGE** |
| `src/components/layout/MainLayout.tsx:237-239` | `setSkillsFilter({ category: activeCategory, tags: activeTags })` | filter wiring | **MUST_CHANGE** — D1=A 时 `category` 字段名改 categoryId；D7（父聚合）时 `category` 不再是单值而是 "active + descendant ids" 集合，filter 需扩展 |
| `src/components/layout/MainLayout.tsx:312` | type `category: Category` (contextMenu state) | local state | **NO_CHANGE** |
| `src/components/layout/MainLayout.tsx:323-326` | `categoryMatch = location.pathname.match(/^\/category\/(.+)$/)` | route match | **NO_CHANGE** |
| `src/components/layout/MainLayout.tsx:341` | `if (path.startsWith('/category/') ...) return null` | route guard | **NO_CHANGE** |
| `src/components/layout/MainLayout.tsx:355-356, 364-365, 380, 385, 386` | `handleCategoryContextMenu/DoubleClick + start/stopEditingCategory` | handlers | **NO_CHANGE** |
| `src/components/layout/MainLayout.tsx:390-394` | `handleCategoryColorChange` | handler | **NO_CHANGE** — 仅触发 updateCategory(id, undefined, color)；颜色改变不影响 hierarchy |
| `src/components/layout/MainLayout.tsx:399-411` | context menu Rename/Delete | handler | **MUST_CHANGE** — D13 决议落实在 handleDeleteCategory：父类删除时弹"子类去哪里"对话或自动 promote |
| `src/components/layout/MainLayout.tsx:486-491` | `handleReorderCategories(orderedIds) → reorderCategories` | reorder wiring | **MUST_CHANGE** — 若选 reorder API 拆分（within-parent / cross-parent move），handler 也要相应分裂或合并 |
| `src/components/layout/MainLayout.tsx:509` | `if (s.editingCategoryId \|\| s.isAddingCategory \|\| s.editingTagId \|\| s.isAddingTag) return` | drag start guard | **MAY_CHANGE** — 若新增 `addingChildOfCategoryId`，guard 条件中需加入此 |
| `src/components/layout/MainLayout.tsx:570` | `activeCategory={currentCategoryId \|\| activeCategory}` | propagation | **NO_CHANGE** |
| `src/components/layout/MainLayout.tsx:572` | `categories={categoriesWithCounts}` | render | **NO_CHANGE** |
| `src/components/layout/MainLayout.tsx:583-584` | `editingCategoryId / isAddingCategory` (transit) | props transit | **MAY_CHANGE** — 同 §3.4 Sidebar |
| `src/components/layout/MainLayout.tsx:613-632` | Category ContextMenu items (Rename, Delete) | render | **MAY_CHANGE** — D5（父拖语义）/ D13（删除策略）若决定加 "Promote to root" / "Move to..." 菜单项，新增 ContextMenu items |

### 3.6 前端 — CategoryPage / 路由聚合视图

| file:line | 当前 code 摘录 | 引用类型 | 决议 |
|---|---|---|---|
| `src/pages/CategoryPage.tsx:25` | `const { categoryId } = useParams<{ categoryId: string }>()` | param | **NO_CHANGE** |
| `src/pages/CategoryPage.tsx:34` | `const { categories } = useAppStore()` | data pull | **NO_CHANGE** |
| `src/pages/CategoryPage.tsx:39-42` | `category = categories.find(c.id === categoryId); categoryName = category?.name` | lookup | **NO_CHANGE** |
| `src/pages/CategoryPage.tsx:58-93` | `filteredData = useMemo(...)` 过滤 skills/mcps/claudeMd | aggregation | **MUST_CHANGE** — D7 决议核心点：<br>(A) 父类 + 子类全聚合：filter 由 "name === categoryName" 改为 "name ∈ (categoryName + childCategoryNames)"，并 claudeMd 同步改 categoryId ∈ (categoryId + childCategoryIds)；<br>(B) 仅父自身：保持现状；<br>**默认 (A)**（HCI 行业标准） |
| `src/pages/CategoryPage.tsx:62` | `categorySkills = skills.filter(s.category === categoryName)` | name filter | **MUST_CHANGE** — 同上 |
| `src/pages/CategoryPage.tsx:63` | `categoryMcps = mcpServers.filter(m.category === categoryName)` | name filter | **MUST_CHANGE** — 同上 |
| `src/pages/CategoryPage.tsx:64` | `categoryClaudeMd = claudeMdFiles.filter(f.categoryId === categoryId)` | id filter | **MUST_CHANGE** — 同上（id 集合） |
| `src/pages/CategoryPage.tsx:158` | `displayCategoryName = categoryName \|\| 'Unknown Category'` | header title | **MAY_CHANGE** — D7=A 时父类 title 是否要在父名后加"(含子类)"提示语；推荐不加（极简） |
| `src/pages/CategoryPage.tsx:190, 232` | `<FilteredEmptyState type="category" />` | empty state | **NO_CHANGE** |
| `src/pages/CategoryPage.tsx:317-330` | SkillDetailPanel / McpDetailPanel / ClaudeMdDetailPanel render | render | **NO_CHANGE** |

### 3.7 前端 — 其他 page 与列表组件

| file:line | 当前 code 摘录 | 引用类型 | 决议 |
|---|---|---|---|
| `src/pages/SkillsPage.tsx:60-82` | `categoryIconMap[skill.category]` (icon fallback) | name lookup | **NO_CHANGE** — 内置 icon map 仍用静态 name 词典；D1 不影响 |
| `src/pages/SkillsPage.tsx:172, 200, 218-227, 330-333, 450-453` | category dropdown + handler + value | dropdown | **MAY_CHANGE** — D9（dropdown 树形）若确定，5 处 dropdown 全要按统一模板改造 |
| `src/pages/SkillDetailPage.tsx:56, 76-78, 89, 337-340` | categoryIconMap + categoryColors（local copy） | local color/icon dict | **NO_CHANGE** — 内置词典；后续可考虑统一到 utils/constants（与 hierarchy 解耦）|
| `src/pages/McpServersPage.tsx:57-68, 172, 219-228, 290-293, 428-431` | category dropdown + handler | dropdown | **MAY_CHANGE** — 同 SkillsPage |
| `src/pages/McpDetailPage.tsx:33-44, 295-296` | `getIcon(mcp.category)`, Badge selectedMcp.category | name 渲染 | **NO_CHANGE** |
| `src/pages/SceneDetailPage.tsx:69-70, 382, 410` | `getSkillIcon(skill.category) / getMcpIcon(mcp.category)` | name → icon | **NO_CHANGE** |
| `src/pages/ScenesPage.tsx:69-70, 524, 552` | 同 SceneDetailPage | name → icon | **NO_CHANGE** |
| `src/pages/ClaudeMdPage.tsx:148-149` | `if (filter.categoryId) { filtered = filtered.filter(file.categoryId === filter.categoryId) }` | filter | **MUST_CHANGE** — D7=A 时改为 id ∈ {active+descendants}；与 stores/claudeMdStore.ts 同步 |
| `src/pages/index.ts:10` | `export { default as CategoryPage } from './CategoryPage'` | barrel | **NO_CHANGE** |
| `src/components/skills/SkillItem.tsx:56, 76-78, 89, 113, 181-182` | local categoryIconMap / categoryColors | name 词典 | **NO_CHANGE** |
| `src/components/skills/SkillListItem.tsx:7, 68, 186-188` | `getCategoryColor(skill.category)`, Badge | name 渲染 | **NO_CHANGE** |
| `src/components/skills/SkillDetailPanel.tsx:4, 59, 79-81, 199, 238-247, 296-298, 413-416` | dropdown + handler | dropdown | **MAY_CHANGE** — D9 |
| `src/components/mcps/McpItem.tsx:16-28` | `getIcon(mcp.category)` | name → icon | **NO_CHANGE** |
| `src/components/mcps/McpListItem.tsx:6, 24, 36, 56, 76, 197-200` | local categoryIconMap + getCategoryColor + Badge | render | **NO_CHANGE** |
| `src/components/mcps/McpDetailPanel.tsx:42-52, 147, 176-185, 234-236, 377-380` | dropdown + handler | dropdown | **MAY_CHANGE** — D9 |
| `src/components/claude-md/ClaudeMdCard.tsx:61, 74, 84-89, 202-205` | category lookup by id, Badge | id-based render | **NO_CHANGE** |
| `src/components/claude-md/ClaudeMdDetailPanel.tsx:128, 149-157, 186-188, 309-312` | dropdown + handler (id-based) | dropdown | **MAY_CHANGE** — D9 |
| `src/components/scenes/CreateSceneModal.tsx:75-76, 86, 99, 106, 371, 446-453, 487, 512, 865-866, 916` | local categoryFilter + 按 name 聚合 | local filter | **MAY_CHANGE** — D7 决定 modal 是否聚合父+子；通常**不动**因 modal 内 categoryFilter 是基于 items 实际 category names 而非 categories store，hierarchy 引入后 items 仍只携带 name（D1=B）或 id（D1=A），filter 模型不变 |

### 3.8 通用组件 / 静态词典

| file:line | 当前 code 摘录 | 引用类型 | 决议 |
|---|---|---|---|
| `src/components/common/Badge.tsx:5, 8, 10, 17-22, 39, 44-62` | `variant: 'category' \| ...`, category style | Badge variant | **NO_CHANGE** — Badge variant=category 与 hierarchy 无直接关系 |
| `src/components/common/Dropdown.tsx:297, 343` | `isUncategorized = option.label.toLowerCase() === 'uncategorized'` | special-case "Uncategorized" | **NO_CHANGE** — Uncategorized 仍是特殊标签；hierarchy 不影响 |
| `src/components/common/FilteredEmptyState.tsx:5, 20, 23-25` | `type: 'category' \| 'tag'` | empty state type | **NO_CHANGE** |
| `src/components/common/icons/CategoryEmptyIcon.tsx` (G0 推断) / `src/components/common/icons/index.ts:1` | `CategoryEmptyIcon` | icon | **NO_CHANGE** |
| `src/utils/constants.ts:7-21` | `categoryColors` 静态词典 + `getCategoryColor(category)` | name → color fallback | **NO_CHANGE** — 旧 fallback 仍以 name 查；D1 不破坏；可保留作为 v2 deprecate 候选 |

### 3.9 测试 / mock / fixture

| file:line | 当前 code 摘录 | 引用类型 | 决议 |
|---|---|---|---|
| `src/test/helpers/tauriMock.ts:30, 35` | doc `registerMockCommand('get_categories', ...)` + helper | mock helper | **NO_CHANGE** — 注册 helper 不动；具体 mock fixture 在 test 文件中提供 |
| `src/stores/__tests__/appStore.test.ts:9-11, 16-17` | initial state `activeCategory, categories, editingCategoryId, isAddingCategory` | initial state assertion | **MAY_CHANGE** — 若新增 addingChildOfCategoryId，需加初值断言 |
| `src/stores/__tests__/appStore.test.ts:23-32` | setActiveCategory tests | tests | **NO_CHANGE** |
| `src/stores/__tests__/appStore.test.ts:65-68` | setCategories test, fixture `[{ id: '1', name: 'Dev', color: '#000', count: 3 }]` | fixture | **MAY_CHANGE** — Category 形状新增 parentId 后 fixture 需加 `parentId: undefined`（serde optional 反序列化无 parent_id 时 = None；前端 setCategories 接收的对象会自动有 undefined） |
| `src/stores/__tests__/appStore.test.ts:88-128` | start/stopEditing/Adding tests | tests | **MAY_CHANGE** — 新增 startAddingChildCategory / stopAddingChildCategory tests |
| `src/components/__tests__/Badge.test.tsx:27-34` | `<Badge variant="category" color="#8B5CF6">` | render test | **NO_CHANGE** |
| `src/utils/__tests__/constants.test.ts:2-40` | `categoryColors / getCategoryColor` 全套 tests | name → color fallback tests | **NO_CHANGE** — 兜底逻辑不变 |
| `src-tauri/src/types.rs:921` | `assert!(data.categories.is_empty())` (default test) | default test | **NO_CHANGE** |
| `src-tauri/src/types.rs:948-961` | `test_category_serde_roundtrip` | serde test | **MUST_CHANGE** — 加 `parent_id: None` field in fixture, plus 新增 "old JSON without parent_id deserializes correctly" 测试 |
| `src-tauri/src/commands/data.rs:706-723` | `reorder_categories_persists_order` | reorder test | **MUST_CHANGE** — 加 hierarchy reorder 测试 |
| `src-tauri/src/commands/data.rs:726-736` | `reorder_categories_returns_canonical_vec` | reorder test | **NO_CHANGE** — 单层正反例已覆盖 |
| `src-tauri/src/commands/data.rs:758-768` | `reorder_categories_unknown_id_is_skipped` | reorder test | **NO_CHANGE** |
| `src-tauri/src/commands/data.rs:775-815` | `concurrent reorder + add` | concurrency | **MUST_CHANGE** — 增加"add_category with parent_id concurrent with reorder of other parent" 路径 |

### 3.10 文档（docs / README / CHANGELOG）

| file:line | 当前 code 摘录 | 引用类型 | 决议 |
|---|---|---|---|
| `README.md:16, 26, 63, 108, 118` | "Organize with categories and tags" / sidebar filtering / data.json | 描述 | **MAY_CHANGE** — 如果功能合入主线 README 推荐补充一句"Categories support 2-level hierarchy"；不阻塞实施 |
| `CHANGELOG.md:18, 26, 38, 40, 57` | category 历史条目 | 版本历史 | **MUST_CHANGE** — 实施完成后新增 release note："Categories now support a single sub-category level" |
| `CLAUDE.md:74` | "Categories/Tag filter pages" | 项目文档 | **MAY_CHANGE** — 可补一句 hierarchy 说明 |
| `docs/usage.md:30-191` (8 处) | 用户使用文档 | 用户文档 | **MUST_CHANGE** — 实施完成后需补"Sub-category drag/drop"使用说明 + 截图（不阻塞实施） |
| `docs/installation.md:97, 108, 131` | data.json 提及 categories | 安装文档 | **NO_CHANGE** |
| `docs/development.md:144, 182, 192, 206, 245, 274, 311, 476` | dev docs (CategoryPage / data.rs / route 表 / commands list) | dev 文档 | **MAY_CHANGE** — 实施完成后更新 commands list（如新增 reorder_categories_within_parent）+ schema 描述 |
| `docs/README.md:45` | AI Auto-Classification 描述 | 用户文档 | **MAY_CHANGE** — D14 决议影响（B 时需更新文案） |


---

## 4. 测试 / mock / fixture 改动汇总清单

合并 §3.9 + §3.2 测试相关行；按"必改 / 可能改"分组。

### 4.1 必改（MUST_CHANGE）

| 测试 | 改动方向 |
|---|---|
| `src-tauri/src/types.rs::test_category_serde_roundtrip` | (1) fixture 加 `parent_id: None`；(2) 新增 case：`{"id":"x","name":"y","color":"#000","count":0}` 旧 JSON 反序列化 → `parent_id == None` |
| `src-tauri/src/commands/data.rs::reorder_categories_persists_order` | 增加 hierarchy reorder 用例（同 parent 内 reorder + 跨 parent move） |
| `src-tauri/src/commands/data.rs::concurrent_reorder_and_add_no_lost_update` | 加入 `add_category(name, color, parent_id=Some("X"))` 路径并发 |
| `src-tauri/src/commands/data.rs` 新增 | `add_category_rejects_grandchild_parent`（max depth=2 闸门）<br>`add_category_rejects_self_parent`（cycle 闸门）<br>`update_category_rejects_grandchild_parent`<br>`update_category_rejects_cycle`<br>`delete_parent_promotes_children` 或 `delete_parent_cascades`（按 D13 决议）<br>`reorder_categories_within_parent_persists_order` |
| `src-tauri/src/commands/trash.rs` 新增 | `restore_claude_md_with_orphan_category_falls_back_to_none` |

### 4.2 可能改（MAY_CHANGE）

| 测试 | 依赖 |
|---|---|
| `src/stores/__tests__/appStore.test.ts:9-128` | D2 / 新增 addingChildOfCategoryId state — 加初值与 mutator tests |
| `src/stores/__tests__/appStore.test.ts:66` 的 fixture | Category 形状变化（自动跟随 TS interface） |
| 任何与 D9 dropdown 树形展示相关的 UI snapshot/render 测试 | D9 |

### 4.3 mock 形状（tauriMock）

`src/test/helpers/tauriMock.ts` 注册 helper 本身不变。**实施时**编写新 store unit test 需要在测试文件内手动 `registerMockCommand('get_categories', () => [{id, name, color, count, parentId}])`，新增 `registerMockCommand('reorder_categories_within_parent', ...)` 等。

---

## 5. Cargo / npm 依赖影响

### 5.1 Cargo（Rust 后端）

**0 新增依赖**。`parent_id: Option<String>` 由现有 `serde` + `serde_json` 处理；max depth / cycle 校验为本地 graph 算法（max depth=2 平铺判断 = O(1) 查父再查父父）。

可能用到：
- 标准库 `std::collections::HashMap` / `HashSet`（已有）
- `serde::{Serialize, Deserialize}`（已有）

### 5.2 npm（前端）

**0 新增依赖**。所有 hierarchy 相关代码用现有 `@dnd-kit/*` (`6.3.1` / `10.0.0` / `9.0.0` / `3.2.2`) + 自写 utility。
- 投影深度算法（D3=A）：自写，参考 dnd-kit 官方 Sortable/Tree story 源码（节略移植）
- flatten/restore：自写
- announcements 扩展：自写

如果 R2 调研结论强烈推荐使用第三方 sortable-tree 包（高风险且与 V3 不变量冲突），那才需要新增依赖；目前 R2 未给出结论，**默认无新增**。

### 5.3 Tauri 命令注册

`src-tauri/src/lib.rs` 现有 `tauri::generate_handler![]` 中可能新增：
- `data::reorder_categories_within_parent`（如选 reorder API 拆分）

无破坏性变更。

---

## 6. 遗漏风险（grep 不可能 100% 覆盖的隐性路径）

按概率从高到低排：

### R1：Sidebar PageHeader title 在 hierarchy 路径下显示
- 命中：`src/pages/CategoryPage.tsx:158` `displayCategoryName = categoryName || 'Unknown Category'`
- 风险：D7=A 时父类标题是否要标记"含子类"（极简哲学下不加）；如果未来加面包屑 "Parent / Child"，PageHeader 也得改（当前不在范围）

### R2：ContextMenu items 新增动作
- 命中：`src/components/layout/MainLayout.tsx:613-632` Rename / Delete
- 风险：D5（父类拖语义）/ D13（删除策略）若决定加 "Promote to root" / "Move under..." 菜单项，ContextMenu items 数组变长；目前未在 grep 表内强制改

### R3：动态 string 拼接路由（已查 — 无遗漏）
- 命中：`Sidebar.tsx:191 navigate(`/category/${categoryId}`)`、`MainLayout.tsx:341 path.startsWith('/category/')`
- 风险：未发现其他动态拼接 `/category/`，已被 grep 覆盖

### R4：CSS 选择器 / data attribute 与 hierarchy 视觉
- 当前 `data-sortable-list`、`data-no-dnd`、`[aria-roledescription='sortable']`（CSS index.css 中）
- 风险：D11（缩进表达）若引入 `data-depth="0|1"` 之类 attribute，CSS 需新增 selector；新增 indent 不会 break 现有 selector

### R5：Plugin 扫描路径下 categories 引用
- 命中：`src-tauri/src/commands/plugins.rs` = 0 真实命中（详 G21）
- 风险：plugins 扫描出来的 SkillMetadata / McpMetadata 写入 data.json 时也会覆盖 `category` 字段；如果 D1=A，metadata 写入路径需同步切到 `category_id`（在 G1 已涵盖 mcps.rs/skills.rs，但 plugins.rs 内若有间接构造路径需 manual review）

### R6：scenesStore.categoryFilter 遗孤字段
- 命中：`src/stores/scenesStore.ts:21, 81` 仅声明 + 初值，**全 codebase 无 setter / 无 reader**（grep G12 已确认 scenesStore 无 setCategoryFilter / 无任何 read）
- 风险：原本是 dead code；hierarchy 引入后是否激活该字段 = R6（auto-classify SubAgent）的范围；本任务保持现状

### R7：CreateSceneModal 内部的 categories useMemo
- 命中：`src/components/scenes/CreateSceneModal.tsx:447-453` `categories = uniqueCategories from items`
- 风险：modal 是基于 items 实际 category 名字生成的过滤选项，**与 categories store 不直连**；如果 D1=A，items 携带 categoryId 后这里需要查 categories store 翻译为 name；若 D1=B 不变。当前归 MAY_CHANGE

### R8：Skills/MCPs 静态 categoryIconMap（多份重复）
- 命中：`SkillItem.tsx:56`、`SkillDetailPanel.tsx:59`、`SkillDetailPage.tsx:56`、`SkillsPage.tsx:60`、`McpListItem.tsx:24`（5 份重复）
- 风险：这些 icon map 用 hard-coded 名字（如 `development`, `web`）当 key；不依赖 hierarchy 形状；不变。但如果 D9（dropdown 树形）需要在 dropdown 内显示 icon，可能复用 map 名字 → 子类名字若不在 map 中会 fallback 默认。**保留现状**

### R9：Settings 页面（如有 category 引用）
- grep G1 中无 Settings 命中；当前 Settings 不接触 category；**无风险**

### R10：i18n / 文案
- 当前项目无 i18n（仅 EN 用户文案）；新增 hierarchy 相关文案（如 ContextMenu "Move to..."）需在 04_implementation_plan 中显式列出；本表无该项

### R11：新建子类的入口
- 当前 `Plus` 按钮只在 Sidebar Categories Section header（`Sidebar.tsx:294-303`）唯一一处，触发 `startAddingCategory()` 创建根级
- 风险：hierarchy 后用户期望"右键父类→New Sub-Category"或"父类内联 + 子按钮"。grep 未识别（无对应代码），需 04_impl 显式新增；属于 §3.5 MainLayout ContextMenu 的延伸

### R12：onDragOver 阶段的视觉反馈
- 当前 `SortableCategoriesList.tsx:218 announcements`（a11y）+ V3 cascade（视觉让位）
- 风险：D4 hover-into 视觉（父行 hover bg / drop indicator inside）需在 onDragOver 中追加状态，grep 未有命中（功能不存在）；属于 §3.4 SortableCategoriesList MUST_CHANGE 的延伸

### R13：Sidebar 已展开 / 折叠状态的持久化
- 当前 `showAllCategories` 是 local state（Sidebar 顶层）
- 风险：D12=B（折叠 + 持久化）需新 settings 字段或 localStorage；grep 无命中；属于新增范围

### R14：在 Sidebar 顶部"All"或"Uncategorized"虚拟节点
- 当前无此节点；hierarchy 后是否新增 "Uncategorized" virtual node 由 D 决定
- 风险：grep 无命中；属于新增范围

### R15：Drag → Sidebar 滚动容器边缘 auto-scroll
- 现有 V3 dnd-kit 默认 auto-scroll 仍生效；hierarchy 后子类增加可能拉长列表，但行为不变

### R16：CSS index.css 中 indent 相关样式
- grep 未扫 src/index.css；可能已有 `padding-left` token；新增 indent 不破坏；属于实施时 hand-add

### R17：Tauri command 错误信息文本
- `add_category` / `update_category` / `delete_category` 错误信息（"already exists" 等）当前为字符串字面量；hierarchy 引入后新错误（"max depth exceeded" / "cycle detected"）属于新文本，grep 无命中

### R18：Symbol Skill plugin path 的 category 间接路径
- `src-tauri/src/commands/plugins.rs` 真实 0 命中；plugin 路径可能通过 `import.rs::detect_skills/detect_mcps` 路径写入 metadata.category — 已被 G1/G2 覆盖

---

## 7. 重点关注的"隐藏地雷"（≥ 5 个）

按风险等级排序：

### 地雷 1（**P0**）：DATA_MUTEX 仍需覆盖 hierarchy 写路径
**位置**：`src-tauri/src/commands/data.rs::add_category / update_category / delete_category`（V3 已加 `_guard = DATA_MUTEX.lock()`）
**风险**：本任务扩展签名 + max depth 校验后，如果忘记保留 `_guard`，则破坏 V3 的并发安全协议（`DATA_MUTEX` 是 `~/.claude/rules/grep-before-enumerate-shared-resource.md` rule 的核心修复标的）
**对策**：04_implementation_plan 必须**显式 grep** `read_app_data|write_app_data` 重新枚举所有 mutator，每条带 `_guard` 校验；继承 V3 sidebar-reorder rule 的纪律

### 地雷 2（**P0**）：旧 data.json 反序列化
**位置**：`src-tauri/src/types.rs::Category` 新增 `pub parent_id: Option<String>`
**风险**：必须用 `#[serde(default)]` 或 `#[serde(skip_serializing_if = "Option::is_none")]`（详细规则参 `~/.claude/projects/.../memory/MEMORY.md` "Patterns" — `#[serde(default)] on String = empty string when key missing"）；忘了 default 会导致旧 data.json 反序列化失败
**对策**：types.rs 新增字段时**强制** `#[serde(default, skip_serializing_if = "Option::is_none")]`，并新增"old JSON deserializes" 专项测试

### 地雷 3（**P0**）：autoClassify 创建 category 路径
**位置**：`src/stores/skillsStore.ts:381` / `mcpsStore.ts:423` / `claudeMdStore.ts:475` 三处都调用 `addCategory(categoryName, categoryColors[colorIndex % ...])`
**风险**：本任务扩展 `addCategory(name, color, parentId?)` 签名后，三处调用如果不更新会传少一个参数（TS 会过；运行时可选）；但若选 D14=B（LLM 建议父类），需要三处都接入新 prompt
**对策**：04_implementation_plan T-class 任务里把这三处明确列在改动清单（grep 已找出）

### 地雷 4（**P0**）：reorder API 契约破坏
**位置**：`src-tauri/src/commands/data.rs::reorder_categories(orderedIds: Vec<String>)`
**风险**：V3 不变量包括"两阶段提交 + DATA_MUTEX + version 协议"。如果 reorder API 改成接受 `(parentId, orderedIds)` 元组，前端 enqueueReorder 串行队列、版本协议、optimistic update 都需要重新对齐；如果选保留单层 reorder + 新增 within-parent reorder，则两套 API 都要走 DATA_MUTEX 与 version 协议
**对策**：03_tech_plan 必须做"reorder API 边界设计"专章；T 任务对每个 API 各自有覆盖测试

### 地雷 5（**P1**）：CategoryPage 聚合算法递归基线
**位置**：`src/pages/CategoryPage.tsx:62-64` filter
**风险**：D7=A 聚合时如果用 `categories.filter(c.parentId === categoryId).flatMap(...)`，**max depth=2** 已限定不会递归爆栈；但若未来扩展深度则需重写。把"max depth=2"写入注释 + 用 `for (const child of children)` 显式只走一层
**对策**：注释中写明 max depth = 2 假设 + 在 helper 函数签名中通过 type 限制（如 `getDescendantIds(category): string[]` 名字暗示只一层）

### 地雷 6（**P1**）：Sidebar 折叠/展开 与 V3 "Show X more" 共存
**位置**：`src/components/layout/Sidebar.tsx`（`MAX_VISIBLE_CATEGORIES` + `showAllCategories`）+ `src/components/sidebar/SortableCategoriesList.tsx:125-126` `visibleCategories = showAll ? categories : categories.slice(0, maxVisible)`
**风险**：现有 "Show X more" 按"前 N 项"切片，hierarchy 后 N 项可能切到一半子类（父显示子不显示，视觉 broken）
**对策**：R3 视觉调研需明确"前 N 项"的语义 — 推荐"前 N 个根级 + 它们的所有子"；slicing 算法重写

### 地雷 7（**P1**）：拖父类时拖动整棵子树的 DragOverlay 表现
**位置**：`src/components/sidebar/DragOverlayCategoryRow.tsx`
**风险**：D5=B（父拖整子树跟随）时，DragOverlay 应显示父行 + 折叠 N 子的 stacked card，仅显示父行会与"子树跟随"的实际行为不一致；用户感觉"我搬动的不只是父行"
**对策**：R3 视觉调研给出 stacked card 规格；DragOverlayCategoryRow 改造

### 地雷 8（**P1**）：删除父类时的 active 重置
**位置**：`src/stores/appStore.ts:299` `activeCategory: state.activeCategory === id ? null : state.activeCategory`
**风险**：当前只在删除的 id == active 时重置；hierarchy 后如果删除父类 X，且 active 是 X 的子 Y，Y 跟随 X 处理（promote 或 cascade 删除），但 `activeCategory` 仍是 Y 的 id；UI 可能渲染失败
**对策**：deleteCategory 内部记录"被影响的所有 ids"（删除集合），在 set 时若 active ∈ 影响集合则重置 active

### 地雷 9（**P2**）：scenesStore.categoryFilter 遗孤
**位置**：`src/stores/scenesStore.ts:21, 81`
**风险**：声明了 state 但 codebase 无 read/write；hierarchy 引入后如果错误地"激活"它（接到 hierarchy 路径），会产生死字段被赋值但仍无 reader
**对策**：本任务保持现状；R6 SubAgent 决议是否清理

### 地雷 10（**P2**）：announcements 扩展 vs VoiceOver 兼容
**位置**：`src/components/sidebar/dnd/announcements.ts:28-85`
**风险**：现有 announcements 只覆盖"reorder"语义。hierarchy 引入"drop into" / "promote out" 后，新增措辞如果没有 fallback 到 reorder 文案，旧的位置变化通报会丢失
**对策**：`makeAnnouncements` 改造时保留所有原 onDragStart/Over/End/Cancel 路径，**只追加** drop-into / promote 分支；测试需含 fallback path

---

## 8. confidence + takeaway

**Confidence**: 90/100（grep 完成度 + 决议落实度）
- grep 端：100% 覆盖 dispatch_plan 的 15 条命令 + 6 条额外补扫，原始输出全部贴出（500+ 行实际命中）
- 决议端：80%（D1/D2/D3/D5/D7/D9/D11/D12/D13/D14 落实到具体改动文件，但**最终方向以 R1-R4 的决议**为准；本表格中 MAY_CHANGE 标注了所有依赖项）
- **不确定性**：dnd-kit Sortable Tree 模式选择（D3）会影响 SortableCategoriesList 改造的具体形态；需要 R2 的源码验证产物锁定后才能给出 SortableContext.items 的最终签名

**Takeaways for 02_design_spec / 03_tech_plan**：

1. **零新依赖**：本任务不需要新增 Cargo / npm 依赖；可在 03_tech_plan §1 库选型中明确写"沿用 V3 选型，无新增"
2. **数据形状改动局部化**：types.rs Category struct 仅 +1 字段（`parent_id: Option<String>`）；旧 data.json 反序列化要靠 `#[serde(default)]`，必加"old JSON deserializes" 专项测试
3. **核心改造点 = SortableCategoriesList.tsx 一个文件 + appStore.ts 几个 mutator**；其他都是 cascade
4. **5 处 dropdown** 必须按 D9 决议**统一**改造（McpServersPage、SkillsPage、SkillDetailPanel、ClaudeMdDetailPanel、McpDetailPanel），不能漏一处
5. **3 处 autoClassify** 必须在 D14 决议下**统一**改造（skillsStore、mcpsStore、claudeMdStore），可写共享 helper
6. **CategoryPage 聚合算法**是 D7 决议的核心代码体现；max depth=2 一定要写进注释和 helper 签名
7. **DATA_MUTEX 覆盖** 与 V3 sidebar-reorder rule 同构 — 03_tech_plan 必须 `rg 'read_app_data|write_app_data'` 重新枚举一次
8. **scenesStore.categoryFilter** 是死字段 — 03_tech_plan 写一句"本任务不激活；R6 决议"
