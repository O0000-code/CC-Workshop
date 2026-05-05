# R6 — Auto-classify / Count 派生 / Filter 在 hierarchy 下的行为分析

> Referential 调研产出。本文不直接做决策——决策在 02_design_spec / 03_tech_plan。本文给出三大行为路径（autoClassify / count / filter）在 hierarchy 引入后的最终行为方案、伪代码、和回归边界。

---

## 已读基线 checklist

共同必读（10 项）：

- [x] `.dev/category-hierarchy/00_understanding.md`（**§4.3 autoClassify 现状画像** + §6 D7/D8/D14 决策表）
- [x] `~/.claude/rules/document-authority-ranking.md`
- [x] `~/.claude/rules/plan-as-research-design.md`
- [x] `~/.claude/rules/hard-constraints-before-soft-evaluation.md`
- [x] `.claude/rules/cross-document-cascade-discipline.md`
- [x] `.claude/rules/verify-third-party-behavior-firsthand.md`
- [x] `.claude/rules/validate-numerical-equivalence-claims.md`
- [x] `.claude/rules/grep-before-enumerate-shared-resource.md`
- [x] `.dev/sidebar-reorder/02_design_spec.md` V3（不变量：snap / 220ms cascade / KeyboardSensor / categoriesVersion 协议）
- [x] `.dev/sidebar-reorder/03_tech_plan.md` V3（DATA_MUTEX、apply_reorder、版本协议背景）

任务专属必读：

- [x] `src/stores/skillsStore.ts:305-422`（autoClassify 整段 + setFilter）
- [x] `src/stores/mcpsStore.ts:332-463`（autoClassify 同构副本 + setFilter）
- [x] `src/stores/claudeMdStore.ts:1-100,390-588`（filter 字段是 categoryId; autoClassify 用 name→id 二跳）
- [x] `src/stores/scenesStore.ts`（categoryFilter 字段）
- [x] `src/components/scenes/CreateSceneModal.tsx:365-512`（store.categoryFilter 实际是死字段，组件内 useState 才是真活路径）
- [x] `src-tauri/src/commands/classify.rs`（prompt + JSON schema + 调用 `claude` CLI）
- [x] `src/components/layout/MainLayout.tsx:96-115`（categoriesWithCounts 派生）
- [x] `src/components/layout/MainLayout.tsx:236-239`（filter sync 到 skillsStore + mcpsStore）
- [x] `src/components/layout/MainLayout.tsx:322-327, 567-577`（URL→activeCategory 双源；CategoryPage 路由）
- [x] `src/components/layout/Sidebar.tsx:184-201`（点击 → navigate(/category/:id)）
- [x] `src/pages/CategoryPage.tsx:39-93`（filter 主逻辑：categoryName 匹配 Skill.category + categoryId 匹配 ClaudeMdFile.categoryId）
- [x] `src/pages/SkillsPage.tsx:209`（filteredSkills 从 store 取）
- [x] `src/pages/McpServersPage.tsx:190, 219-228`（同上）
- [x] `src/pages/ClaudeMdPage.tsx:130-170`（filter.categoryId 直读，**未挂 sidebar sync**）
- [x] `src/components/skills/SkillDetailPanel.tsx:238-247`（dropdown value=name）
- [x] `src/stores/appStore.ts:120-310`（categoriesVersion 协议 + addCategory append-to-end）
- [x] `src/utils/constants.ts`（getCategoryColor 兜底）

---

## 1. autoClassify 现状链路图

```
┌──────────────────┐
│  User clicks     │
│ "Auto Classify"  │
│  (CategoryPage / │
│   SkillsPage /   │
│   McpServersPage │
│   ClaudeMdPage)  │
└────────┬─────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────┐
│ {skills,mcps,claudeMd}Store.autoClassify()                 │
│   1. Build items: ClassifyItem[] (id/name/desc + source-   │
│      specific extras: instructions / tools / content)      │
│   2. existingCategories = categories.map(c => c.name)      │
│   3. existingTags       = tags.map(t => t.name)            │
│   4. await safeInvoke('auto_classify', { items,            │
│        existingCategories, existingTags, availableIcons }) │
└────────┬───────────────────────────────────────────────────┘
         │ IPC
         ▼
┌──────────────────────────────────────────────────────────┐
│ src-tauri/src/commands/classify.rs::auto_classify       │
│   - build_classification_prompt(items, cats, tags, icons)│
│   - Spawn `claude -p <prompt> --json-schema <S>`        │
│       (--model sonnet --dangerously-skip-permissions)   │
│   - JSON schema constrains tags to ^[a-z]+$, 1..2 items │
│   - Parse `structured_output.classifications[]`          │
│   - Return Vec<ClassifyResult>                          │
│       { id, suggested_category: String,                 │
│         suggested_tags: Vec<String>,                    │
│         suggested_icon: Option<String> }                │
└────────┬─────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────┐
│ store.autoClassify (cont'd):                                │
│   5. For each result.suggested_category not in existing:    │
│        await addCategory(name, predefinedColor)             │
│        → appStore.addCategory invokes 'add_category' IPC    │
│        → backend pushes to data.categories Vec END          │
│        → bumps categoriesVersion (frontend), returns Cat    │
│   6. For each result.suggested_tag not in existing:         │
│        await addTag(name)                                   │
│   7. For each result:                                       │
│        await update_{skill,mcp}_metadata IPC with           │
│          category: result.suggested_category   ← STRING NAME│
│        OR for ClaudeMd: name → id resolve, then             │
│          update_claude_md IPC with categoryId: id           │
│   8. Promise.all([loadCategories(), loadTags(),             │
│                   loadSkills/Mcps/Files()])                 │
│   9. classifySuccess animation (1.5s + fade 200ms)          │
└─────────────────────────────────────────────────────────────┘
```

### Prompt 关键事实

`classify.rs:34-145` 的 `build_classification_prompt` 喂给 LLM 的"已存在分类"片段：

```rust
let categories_list = if categories.is_empty() {
    "(No existing categories)".to_string()
} else {
    categories.join(", ")        // ← 一句话逗号串接，没有任何结构
};
```

返回 schema 强制：

```json
{
  "type": "object",
  "properties": {
    "classifications": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "category": { "type": "string" },           // ← string 单值，无 path
          "tags": { ... "pattern": "^[a-z]+$", 1..2 },
          "icon": { "type": "string" }
        }
      }
    }
  }
}
```

**Prompt 现状只产出 `category: string` 单 name**，没有"父子"概念，且 prompt body（`classify.rs:50-138`）通篇没有任何 hierarchy 词汇。

### 创建 category 时 push 到末尾

`addCategory(name, color)` → backend `add_category` → `data.categories.push(category)` → 末尾。新分类落在 sidebar 列表底部，由现有 V3 reorder 协议管理。**没有 parentId 概念**。

---

## 2. autoClassify 三种 hierarchy 候选

> 按 `~/.claude/rules/hard-constraints-before-soft-evaluation.md` 先列硬约束，再做软评估。

### 硬约束（任何候选必须通过）

| HC# | 约束 | 来源 |
|---|---|---|
| HC1 | classify.rs 不破坏现有 prompt 输出格式 → backend 反向兼容 | classify.rs:163-189 schema |
| HC2 | autoClassify 创建新 category 不破坏 V3 reorder 不变量（categoriesVersion 协议、append-to-end 语义） | appStore.ts:237-260 |
| HC3 | LLM 失败/降级时（如 prompt 太长、cli 不可用）必须 graceful degrade 到"全落根" | classify.rs:201-213 错误处理 |
| HC4 | 单次 autoClassify 调用的 `claude -p` 命令行长度 ≤ macOS ARG_MAX (256KB)；prompt 喂入 hierarchy 必须保证不超 | macOS `getconf ARG_MAX` |
| HC5 | 不引入新 IPC、不引入新数据库表（保持本任务范围聚焦） | 项目原则 |

### 候选 A：暂不感知，新分类一律落根（最简）

**改动**：

- prompt 不变。`existingCategories` 仍为扁平 `name[]`，无父子概念。
- LLM 仍输出 `suggested_category: string`。
- frontend store 在创建新 category 时调 `addCategory(name, color)`，新 category 写入 backend 时 `parent_id: None`（取决于 D2 选 A 形态）。
- 用户后续可手动从 sidebar 拖拽新分类成为某个父类的子类。

**伪代码改动 = 0**（除了 backend Category 结构体加 `parent_id: Option<String>` 字段并 `#[serde(default)]`，但这是 R1/R2/R3 的事，不是 R6 范围）。

**用户视角**：
- 第一次 autoClassify 之后：所有新分类落 sidebar 末尾，作为根级 category。
- 与现状一致，零学习成本。
- 想形成层级 → 手动拖拽（这正是用户原话要求的"拖入即子类、拖出即独立"，本来就是核心交互之一）。

**失败模式**：
- LLM 给出"Web Frontend"和"Frontend"两个新分类 → 都成为根级，不会因为人类直觉把"Frontend"嵌入"Web Frontend"。这是**特性而非 bug**——hierarchy 决策权 100% 在用户手上。
- 与 v2 升级路径相容（v2 想让 LLM 建议父类时，prompt + schema 都可以增量改）。

**论据**：
- `00_understanding §5.9` 已显式声明"自动分类暂不感知父子，落到根级，用户后续手动拖入"，这是用户隐含意图。
- 完全 0 风险破坏 V3 不变量（categoriesVersion 协议、reorder 队列、磁吸时序均不触及）。
- HC1-HC5 全部满足。

### 候选 B：prompt 喂入完整树，LLM 建议父类（path 形式）

**prompt 改动**：

```rust
// classify.rs build_classification_prompt
// CHANGED: categories_list 不再是简单 join，而是树形 indent
let categories_list = if categories.is_empty() {
    "(No existing categories)".to_string()
} else {
    // categories 改为接收 (name, parent_name?) 元组
    format_category_tree(&categories)  // 输出形如:
    // - Development
    //   - Frontend
    //   - Backend
    // - Productivity
    //   - Notes
};
```

prompt 文案需新增：

```
### Hierarchy Decision
- Existing categories may have parent → child relationships (max depth 2)
- When suggesting an existing child category, use path form: "Parent > Child"
- When suggesting a NEW category, you may suggest a parent for it: "ParentName > NewChildName"
- If unsure, just give a single name and it will be created at root
- Max depth is 2; never propose 3 levels
```

JSON schema 改：

```json
"category": {
  "type": "string",
  "description": "Single name (root) or 'Parent > Child' for nested. Max one '>' separator."
}
```

**frontend 改动**（`{skills,mcps,claudeMd}Store.autoClassify`）：

```ts
// 解析 suggested_category
function parseCategoryPath(s: string): { parentName: string | null; name: string } {
  const parts = s.split(' > ').map(p => p.trim()).filter(Boolean);
  if (parts.length === 1) return { parentName: null, name: parts[0] };
  if (parts.length === 2) return { parentName: parts[0], name: parts[1] };
  // depth > 2 → degrade: take last as name, second-to-last as parent
  return { parentName: parts[parts.length - 2], name: parts[parts.length - 1] };
}

// 创建新分类时
for (const result of results) {
  const { parentName, name } = parseCategoryPath(result.suggested_category);
  let parentId: string | null = null;
  if (parentName) {
    const existingParent = currentCategories.find(c => c.name === parentName && c.parentId === null);
    if (existingParent) {
      parentId = existingParent.id;
    } else {
      // Parent 也是新分类 — 先创建 parent 在 root，再创建 child
      const newParent = await addCategory(parentName, randomColor(), null);
      parentId = newParent.id;
    }
  }
  if (!existingCategoryNames.has(name)) {
    await addCategory(name, randomColor(), parentId);
  }
  // metadata 写入照旧（写 name；如选 D1=A，则写 categoryId）
}
```

**用户视角**：
- 第一次 autoClassify：直接生成两层结构（"Development > Frontend"、"Development > Backend"）。
- LLM 偶尔建议怪异父类（如把"Notes"放到"AI"下）→ 用户拖出修复。误触误分类回收成本 = 一次拖拽。
- 信号增强：sidebar 一开始就有结构，新用户不用理解 reorder 才能感受到 hierarchy。

**失败模式**：
- LLM 选 path 时与 existing 树不对齐：如已有 "Productivity > Notes"，LLM 输出"Notes > Productivity"颠倒。需要 prompt 强调"如果路径错配，与已有树对齐"。
- LLM 输出 "Development > Frontend > React"（depth 3）→ 上述 parseCategoryPath 兜底到 depth 2。
- prompt 长度膨胀：树形 indent 比 join 长 1.5-2 倍，但每层 ≤ 4 字 + 缩进 ≤ 64 字符 / 行；100 个分类 = 6.4KB。HC4 仍满足。
- LLM 模型变化：sonnet 表现稳定但更换模型时 path 解析鲁棒性需复测。

**风险**：
- **prompt 改动 = 02_design_spec V1 → V2 cascade**（cross-document-cascade-discipline）。candidate B 一旦选用，必须更新 03_tech_plan classify section + 04_implementation_plan 加 task 卡。
- 一次性改动 = 1-2 LoC schema + 30-40 LoC prompt + 60-80 LoC frontend parser → 总 LoC ≈ 100-130，中等改动。
- LLM 一致性测试需要新增 fixture（不同输入下输出 path 形式）。

### 候选 C：v2 候选（先不动）

含义：**本期不做** autoClassify hierarchy 感知，留给后续版本。等同候选 A 的执行结果，但语义上明确"未来会做"。

实际操作：与 A 完全一致；区别只在文档措辞。

### 推荐：A（暂不感知，落根）

**论据**：

1. `~/.claude/rules/plan-as-research-design.md` §"研究深度与决策影响成正比" — autoClassify hierarchy 是低决策影响（用户拖一下就能修复）但中等实现复杂度（B 候选 100+ LoC + cascade 文档维护）。
2. `00_understanding §5.9` 已显式将其归为"v2 候选"。
3. 用户原话第 1-3 项强调的是"拖拽 + 极简"，没有提"自动分类智能化"。over-deliver 反而违反"如无必要勿增实体"。
4. 与 V3 reorder 不变量 0 冲突 → HC2 satisfied with margin。
5. backward compat 0 改动（不需要更改 prompt，不需要更改 schema，不需要更改前端解析逻辑）。
6. 升级路径开放：v2 想做时直接增量改 prompt + schema + parser，A → B 是单调增功能不破坏 B 之前已存在的数据。

**反对声音**：

- "B 一次到位更优雅" — 反驳：B 多出来的 100 LoC 在用户拖拽完成后看不出区别；优雅 ≠ 多事。
- "用户可能预期 LLM 应该也建议父类" — 反驳：用户没有这么说；现状是无 hierarchy，引入 hierarchy 后第一版让用户掌控全部分级位置，是低风险路径。

**置信度**：85（剩 15% 给"用户实际试用后说我希望 LLM 也建议父类"的可能性）。

**Prompt 改动**：**0 行**。

---

## 3. count 派生策略（D8）

### 现状（`src/components/layout/MainLayout.tsx:96-104`）

```ts
const categoriesWithCounts = useMemo(() => {
  return categories.map((cat) => ({
    ...cat,
    count:
      skills.filter((s) => s.category === cat.name).length +
      mcpServers.filter((m) => m.category === cat.name).length +
      claudeMdFiles.filter((f) => f.categoryId === cat.id).length,
  }));
}, [categories, skills, mcpServers, claudeMdFiles]);
```

每个 cat 的 count = 自身 name 匹配的 skills + mcps + 自身 id 匹配的 claudeMd。**O(N × M)**，N = categories, M = skills+mcps+claudeMd。当前 N、M 量级（< 100 / < 1000）下零问题。

### 候选

| 候选 | 含义 | 极简哲学契合度 | 实现复杂度 | 信息密度 |
|---|---|---|---|---|
| **A** 仅自身 | 父类 count = 父类自己被赋值的 item 数（不含子类内的） | 5/5（保留现状语义） | LoC 0 | 父类点击聚合视图后看到 N 个，但 sidebar count 只显示一个数字 → 不一致 |
| **B** 自身 + 所有子级 | 父类 count = self + 所有子类的总和 | 4/5（极简，单数字） | +20 LoC | sidebar 与聚合视图一致；与 D7 选 A（聚合）天然契合 |
| **C** 显示 split `X (+N)` | sidebar 显示两个数字（父自身 / 子合计） | 2/5（违反"如无必要勿增实体"） | +35 LoC + 视觉规格 | 信息分离但增加视觉噪声 |

### 推荐：B（自身 + 所有子级）

**论据**：

1. **D7 与 D8 是耦合决策** — 必须按 `~/.claude/rules/hard-constraints-before-soft-evaluation.md` 先确认 D7 = A（聚合视图）这个硬前提。R4 调研已倾向 D7=A（基于 ToDoList 行业标准）。在 D7=A 前提下，sidebar count 必须等于聚合视图的实际 count，否则视觉与内容矛盾（"这里写 5，但点进去看到 12 个"）。
2. **极简优先** — `00_understanding §5.4` 列出明令禁止的元素中包含"父类的 X children 计数 badge"。候选 C 等同此模式，应排除。
3. **Apple/Linear 标杆** — Things 3 父 Project 的 task count 包含所有 sub-task（Things 3 的 inspector 显示 "X to-dos"）；Linear 父 issue 的 sub-issue count 同样汇总。
4. **零回退风险** — 子类删除时父 count 自动减少（reactive 派生）；子类拖到根 promote 时父 count 自动减少（同上）。

**伪代码（直接落 useMemo）**：

```ts
// src/components/layout/MainLayout.tsx — categoriesWithCounts useMemo 内

const categoriesWithCounts = useMemo(() => {
  // Step 1: 计算每个 category 的"自身" count（与现状同）
  const selfCount = (cat: Category) =>
    skills.filter((s) => s.category === cat.name).length +
    mcpServers.filter((m) => m.category === cat.name).length +
    claudeMdFiles.filter((f) => f.categoryId === cat.id).length;

  // Step 2: 建立 children map（O(N)）
  // categories[i].parentId 形式（取决于 R1 的 D2 决策；此处假设 D2=A）
  const childrenByParentId = new Map<string, Category[]>();
  for (const cat of categories) {
    if (cat.parentId) {
      if (!childrenByParentId.has(cat.parentId)) {
        childrenByParentId.set(cat.parentId, []);
      }
      childrenByParentId.get(cat.parentId)!.push(cat);
    }
  }

  // Step 3: 对每个 category 计算 aggregateCount = self + sum of all descendants' self
  // max depth = 2 → 最多两层递归，不需要通用 DFS，但写成函数也无妨
  const computeAggregate = (cat: Category): number => {
    const children = childrenByParentId.get(cat.id) || [];
    return selfCount(cat) + children.reduce((sum, child) => sum + selfCount(child), 0);
    // 注意：max depth = 2，所以 children 不会再有自己的 children；不需要更深递归。
    // 若未来允许 depth > 2，把上式改成 sum + computeAggregate(child) 即可。
  };

  return categories.map((cat) => ({
    ...cat,
    count: computeAggregate(cat),
  }));
}, [categories, skills, mcpServers, claudeMdFiles]);
```

**复杂度**：O(N + M)（N categories, M items），与现状同 order，常数项略增。**100 cat × 1000 item 实测**预期 < 1ms（与现状 0.x ms 同 order）。

**反例处理**：
- "孤儿子类"（parentId 指向不存在的 cat） → `childrenByParentId.get(orphanedParentId)` 返回 undefined，无副作用；该 orphan 自身仍是叶子，按 selfCount 处理。这与 R1 的 D13 失败模式决议相容。
- "max depth 2 强制" → 后端 D13 强制；前端不必额外校验，但 `computeAggregate` 不递归到第三层（`children.reduce` 不递归），所以即使后端生成 depth 3 也只汇总到 2 层，安全降级。

---

## 4. filter 语义（D7 详化）

### 现状（路由 → 行为）

| URL | 触发位置 | 行为 |
|---|---|---|
| `/skills` | sidebar nav | SkillsPage 用 `getFilteredSkills()`，应用 `skillsStore.filter`（含 sidebar 同步的 activeCategory + activeTags） |
| `/mcp-servers` | sidebar nav | 同上 → McpServersPage |
| `/claude-md` | sidebar nav | ClaudeMdPage 用 `claudeMdStore.filter.categoryId`（**未同步 sidebar**——所以从 sidebar 点 category 时进入的是 CategoryPage 路由，不是 /claude-md） |
| `/category/:id` | sidebar 点 category row | CategoryPage **聚合视图**：skills + mcps + claudeMd 三段，全部按 categoryId 过滤 |
| `/tag/:id` | sidebar 点 tag pill | TagPage（结构与 CategoryPage 类似） |

`MainLayout.tsx:236-239` 的 filter sync：

```ts
useEffect(() => {
  setSkillsFilter({ category: activeCategory, tags: activeTags });
  setMcpsFilter({ category: activeCategory, tags: activeTags });
}, [activeCategory, activeTags, setSkillsFilter, setMcpsFilter]);
```

`MainLayout.tsx:570`：`activeCategory={currentCategoryId || activeCategory}` ——**URL 是 single source of truth**（在 /category/:id 路由下 currentCategoryId 优先），sidebar active state 跟随 URL。

### hierarchy 下的目标行为

按硬约束：

| HC# | 约束 |
|---|---|
| HC1 | sidebar 点击行为不变（4px activation 不破坏，KeyboardSensor 不破坏） |
| HC2 | URL 仍然是 SSOT；`/category/:id` 直接定位到任意层级 |
| HC3 | active state 持久化（点击父类 → URL → reload 仍能定位） |
| HC4 | filter 语义与 D7（聚合视图） + D8（汇总 count）一致 |

### 推荐方案

#### 4.1 sidebar 点击 = navigate(/category/:id)（**不变**）

无论父类还是子类，点击行为统一：`navigate('/category/${categoryId}')`。Sidebar.tsx:191 不需要修改。

#### 4.2 CategoryPage 在 hierarchy 下的 filter 逻辑

```ts
// src/pages/CategoryPage.tsx — filteredData useMemo 内

// 新增 helper（可放 src/utils/categoryTree.ts）
function collectDescendantIds(rootCategoryId: string, allCategories: Category[]): Set<string> {
  // 返回 self + 所有 descendants 的 id 集合（max depth 2 → 一次扫描足够）
  const result = new Set<string>([rootCategoryId]);
  for (const cat of allCategories) {
    if (cat.parentId === rootCategoryId) {
      result.add(cat.id);
      // 若未来允许 depth > 2，递归 collectDescendantIds(cat.id, allCategories) 即可。
      // 当前 max depth = 2，子类不会再有 children。
    }
  }
  return result;
}

// 计算"参与本视图过滤的 category id 集合"
const visibleCategoryIds = useMemo(
  () => collectDescendantIds(categoryId!, categories),
  [categoryId, categories]
);

// 名字集合（Skill/MCP 仍用 name 引用，必须 name → id 反映射 OR 直接用 name 集合）
// 假设 D1 仍维持 name 引用：
const visibleCategoryNames = useMemo(
  () => new Set(
    Array.from(visibleCategoryIds)
      .map(id => categories.find(c => c.id === id)?.name)
      .filter((n): n is string => !!n)
  ),
  [visibleCategoryIds, categories]
);

// filter
const filteredData = useMemo(() => {
  const categorySkills    = skills.filter((s) => visibleCategoryNames.has(s.category));
  const categoryMcps      = mcpServers.filter((m) => visibleCategoryNames.has(m.category));
  const categoryClaudeMd  = claudeMdFiles.filter((f) => f.categoryId && visibleCategoryIds.has(f.categoryId));

  if (!search) return { skills: categorySkills, mcps: categoryMcps, claudeMd: categoryClaudeMd };
  // ... 现有 search filter 不变
}, [skills, mcpServers, claudeMdFiles, visibleCategoryNames, visibleCategoryIds, search]);
```

**点击父类**：`visibleCategoryIds = {父id, 子1id, 子2id, ...}` → 聚合视图显示所有子类内容 + 父自己的内容。
**点击子类**：`visibleCategoryIds = {子id}`（max depth 2，子类无 children）→ 仅子类内容。

#### 4.3 子类内容是否需要 group header？

**不需要**。`00_understanding §5.4` 强调"不要任何过多的元素"。CategoryPage 现有的 section header（"Skills (X)"、"MCP Servers (X)"、"CLAUDE.md Files (X)"）已经够用。

如果用户聚合视图下想看到"哪个 item 来自哪个子类"，可以靠 SkillListItem 上的 category badge 体现（不需要新增层级 header）——这个 badge 已经在 V3 之前的实现里展示子分类名，免费就支持 hierarchy。

**反例考虑**：用户在父类视图下看到"5 个 item 来自 Frontend 子类、3 个来自 Backend 子类"——目前的 PageHeader 只显示父类名。若需要"子类名 chip 横排"作 quick filter → 不在本任务范围（参 §8 不在范围）。

#### 4.4 SkillsPage / McpServersPage 的 sidebar filter sync

`MainLayout.tsx:236-239` 现状是 `setSkillsFilter({ category: activeCategory, tags: activeTags })`，这是为了 sidebar 点 category 的 active state 显示在 SkillsPage 列表（少见路径）。在 hierarchy 下需修改：

```ts
// src/components/layout/MainLayout.tsx — filter sync useEffect
useEffect(() => {
  // hierarchy: activeCategory 是 categoryId（URL 来源是 :id）
  // skillsStore.filter.category 仍然是 name string（与 Skill.category 字段对齐）
  // → 需要 id → name → set 转换；但聚合语义：选父类应包含所有子类
  let categoryNamesToFilter: string[] = [];
  if (activeCategory) {
    const visibleIds = collectDescendantIds(activeCategory, categories);
    categoryNamesToFilter = Array.from(visibleIds)
      .map(id => categories.find(c => c.id === id)?.name)
      .filter((n): n is string => !!n);
  }
  // skillsStore.filter.category 是 string | null 单值，不能装数组
  // 选择：保持单值 = 父 category 的 name；filter 逻辑改 includes
  // OR 改 store filter shape 为 string[] | null
  // 方案 P1：保持单值（最小改动）— filter logic 改读 categories 树自己解析
  // 方案 P2：改为 string[]（更清晰但破坏现有 setFilter 调用）
  // 推荐 P1；详见下方"补充"
  setSkillsFilter({ category: activeCategory, tags: activeTags });
  setMcpsFilter({ category: activeCategory, tags: activeTags });
}, [activeCategory, activeTags, categories, setSkillsFilter, setMcpsFilter]);
```

**P1 决议**（store filter shape 不动，filter 逻辑动）：

`src/stores/skillsStore.ts:466-468` 现有：

```ts
if (filter.category) {
  filtered = filtered.filter((skill) => skill.category === filter.category);
}
```

改为：

```ts
if (filter.category) {
  // filter.category 是 categoryId（来自 sidebar URL 同步）；
  // 需在运行时从 appStore 读 categories 树，扩展到所有 descendants 的 names
  const allCategories = useAppStore.getState().categories;
  const visibleIds = collectDescendantIds(filter.category, allCategories);
  const visibleNames = new Set(
    Array.from(visibleIds).map(id => allCategories.find(c => c.id === id)?.name).filter(Boolean)
  );
  filtered = filtered.filter((skill) => visibleNames.has(skill.category));
}
```

**注意冲突**：`filter.category` 历史字段含义是 "category name"（与 `s.category` 直接 `===`）。改为 categoryId 后，需要在所有调用方（CategoryPage `setSkillsFilter` / 其他 set 路径）一致化。这是一个 P0 隐藏需求，必须由 R1 的 D1 决策（统一引用）配套解决。**R6 范围内**：标记此点为待 R1 仲裁。

**冗余路径检查**：`getFilteredSkills` 用于 `/skills` 页，`/category/:id` 已经走 CategoryPage 自己的 filter（不依赖 store filter）。所以 sidebar filter sync 主要影响是：用户在 /skills 页时 sidebar 点了一个 category → URL 不变（仍 /skills），但列表 filter 应当变化吗？现状是会变化。hierarchy 引入后这条路径若仍存在，须按上述 P1 重写。

**简化建议**：删除 `MainLayout.tsx:236-239` 的 filter sync useEffect，改为"sidebar 点 category 始终走 navigate(/category/:id)"，让 SkillsPage 不再受 sidebar 影响。这等同行业标准（Things 3 / Linear / Notion 都是这种交互模式：sidebar = navigation, list = page-local filter）。

我**强烈建议**这条简化（删 sync useEffect），但是属于行为变更，需要 02_design_spec 确认。R6 仅记录建议，不替 designer 决策。

#### 4.5 ClaudeMdPage 的 filter

`/claude-md` 路由下的 ClaudeMdPage 现在**不响应 sidebar nav**——sidebar 点 category → 不会进 `/claude-md`，而是进 `/category/:id`（聚合视图）。所以 ClaudeMdPage 上点击的 sidebar category 影响只在它的 page-local filter（filter.categoryId 字段，但目前没有 UI 调用 setFilter({categoryId})）。

**hierarchy 下行为不变**——CategoryPage 已经覆盖父类聚合需求；ClaudeMdPage 的 filter.categoryId 若未来加 UI 入口，也只需做 `f.categoryId === filter.categoryId` 单值匹配，不涉及 hierarchy 解析。

#### 4.6 active state 视觉

sidebar 点击父类 → URL `/category/<父id>` → `currentCategoryId = 父id` → `activeCategory = 父id`。SortableCategoryRow active state 显示为父类高亮。

子类同理。

**子类高亮时父类是否要"半亮"？** 这是 R3 视觉设计决策（违反"如无必要勿增实体"则不要做）。R6 不替 R3 决策，但记录两种候选：

- 候选 1：子类高亮时父类正常态（**推荐**，最简）。
- 候选 2：子类高亮时父类显示淡 dot 高亮。

我倾向候选 1。理由：子类已经在父类下方缩进展示，视觉关联已经成立；多加父类高亮反而冗余。

### 4.7 URL 持久化

`/category/<id>` 兼容父子两层。reload 直接定位无问题。`<id>` 是 UUID（与现状一致），换名/换层级不影响 URL（id 稳定）。

---

## 5. scenesStore.categoryFilter 语义

### 当前用法 grep 结果

```
src/stores/scenesStore.ts:21:    categoryFilter: string;
src/stores/scenesStore.ts:81:    categoryFilter: '',
src/components/scenes/CreateSceneModal.tsx:371:  const [categoryFilter, setCategoryFilter] = useState('');
src/components/scenes/CreateSceneModal.tsx:487:  if (categoryFilter && item.category !== categoryFilter) { ... }
```

**关键发现**：

`scenesStore.createModal.categoryFilter`（type: `string`）**实际是死字段**。`CreateSceneModal.tsx:371` 用 `useState` 创建了**同名局部 state**，整个组件都用局部 state，从来不读 store 字段。store 字段从未被任何组件 setter 修改。

证据：
- `rg -n 'updateCreateModal.*categoryFilter' src/` 返回空。
- `rg -n 'categoryFilter:' src/components/` 返回空（除 type 定义和初始值）。
- 唯一用法是 CreateSceneModal 内部自闭环。

### hierarchy 下推荐

由于 store 字段是死代码，hierarchy 引入对它**无影响**。但有两种处理方式：

| 候选 | 含义 | 推荐 |
|---|---|---|
| 留死字段 | scenesStore 中仍保留 categoryFilter 字段 | 不推荐（技术债） |
| 删除 | 删 scenesStore 中的 categoryFilter 字段（同时删 initialCreateModalState 中的字段） | **推荐**——属顺手清理 |

**实际改动**（删除）：

- `src/stores/scenesStore.ts:21`：删 `categoryFilter: string;`
- `src/stores/scenesStore.ts:81`：删 `categoryFilter: '',`
- 验证：`npx tsc --noEmit` 通过；`npm test` 通过。

**注意**：`CreateSceneModal.tsx:371` 局部 state 的 `categoryFilter: useState('')` **本身不需要 hierarchy 改动**。因为 Scene 组合 Skills/MCPs 时 filter 仍是单值 name 匹配，跟 sidebar 不关联。如果未来希望 Scene 创建时也支持父类聚合 filter（点 Frontend 父类 → 显示所有子类下的 skills），需要在 CreateSceneModal 内部加 collectDescendantIds 解析。但这超出本期范围，留待用户反馈触发。

### "scenes.categoryFilter" 不要与 "Scene.id 上的字段" 混淆

`Scene` 类型本身**没有 categoryFilter 字段**——它只有 skillIds / mcpIds / claudeMdIds。`createModal.categoryFilter` 仅用于"创建时筛选可选 item 列表"。

所以 hierarchy 引入后：
- `Scene` 数据结构不变（HC5 满足）。
- 创建/编辑 Scene 时的可选列表过滤由 CreateSceneModal 自己负责，目前不响应 hierarchy → 不破坏。

**置信度**：95（非常确定 store 字段是死代码）。

---

## 6. 存量 metadata 的 backward compat

### 假设 D1 选 A（迁移到 categoryId）

R1 的 D1 决策落 A：**Skills/MCPs 全迁移到 `category_id: Option<String>`，跟 ClaudeMd 一致**。

#### 6.1 autoClassify 写入路径

```ts
// 旧（写 name）
await safeInvoke('update_skill_metadata', {
  skillId: result.id,
  category: result.suggested_category,  // ← name string
  tags: result.suggested_tags,
  icon: result.suggested_icon,
});

// 新（D1=A 后；写 id）
const updatedCategories = useAppStore.getState().categories;
const categoryId = updatedCategories.find(c => c.name === result.suggested_category)?.id;
// ↑ 候选 A（autoClassify 不感知 hierarchy） → 路径单 name；name → id 单跳即可
// 候选 B 需要 parseCategoryPath 取 child name；如有 parent，按 (parent_id + name) 找 id 唯一定位

await safeInvoke('update_skill_metadata', {
  skillId: result.id,
  categoryId: categoryId,    // ← Option<String>; 新字段
  tags: result.suggested_tags,
  icon: result.suggested_icon,
});
```

backend Rust 端的 `update_skill_metadata` command 需要：
- 接受新参数 `category_id: Option<Option<String>>`（Tauri serde： None 表示"不更新", Some(None) 表示"清空", Some(Some(id)) 表示"设为 id"）。
- 旧参数 `category: Option<Option<String>>` 短期保留作 backward compat（旧前端 binary 装新后端时仍能工作）；新前端必须走 categoryId。最终下个 major release 删除 `category` 参数。

具体 backward compat 实现属于 R1 范围。R6 仅给出"必须如此"的边界。

#### 6.2 旧 data.json 反向解析

旧 data.json 中：

```json
{
  "skills": [
    { "id": "...", "category": "Web", ... }   // ← name 字段
  ]
}
```

新 data.json 中：

```json
{
  "skills": [
    { "id": "...", "category_id": "uuid-of-Web", ... }  // ← id 字段
  ]
}
```

迁移有两条路径：

**路径 1：lazy migration on load**

`scan_skills` 加载 metadata 时，读到 `category` 字段且 `category_id` 缺失，则在 `categories` Vec 中按 name 匹配 → 找到 id → 写入 metadata.json 并重新 scan。

**路径 2：one-shot migration on app startup**

App init 时检查 schema 版本字段（如 `data.json.schemaVersion`）；旧版本走一次性迁移函数，把所有 Skill/Mcp metadata 的 `category` → `category_id` 转换。失败则回退（不删除原 `category` 字段）。

**推荐路径 2**（更可靠且只跑一次）。具体落地由 R1 拍板。

#### 6.3 同名子类的歧义性

如果选 D1=A（id 引用），就解决了 P0 设计冲突点（"同名子类无法区分"），因为 id 始终唯一。

如果维持 D1=D（保留 name + 同 parent 下唯一），autoClassify 的 backward compat 也成立——但 SkillDetailPanel 的 dropdown 必须显示完整 path（"Development > Frontend"）以让用户区分两个 "Frontend"。这是 D9 决策。

### 假设 D1 选 D（维持 name + 同 parent 下唯一）

autoClassify 路径基本不变，只需新增**同名校验**：

```ts
// 创建新 category 时
const conflictingSibling = currentCategories.find(c =>
  c.parentId === parentId && c.name === name
);
if (conflictingSibling) {
  // 用现有的而非创建（合并语义）
  // OR 报错让用户重命名
  // 推荐：使用现有（与现状"name 已存在则跳过"一致）
}
```

---

## 7. 回归测试清单（≥ 8 项）

| # | 测试 | 验证目标 |
|---|---|---|
| T1 | autoClassify 在空树（categories.length === 0）下创建新分类，全部落 root（parentId === null） | 候选 A 行为 + 不破坏现有"append to end" |
| T2 | autoClassify 创建新 cat 后 categoriesVersion 正确 bump | V3 categoriesVersion 协议不破坏 |
| T3 | 在 autoClassify 进行中（isClassifying=true）拖动 reorder → reorder 入队，autoClassify 完成后正确顺序 | 与 V3 reorder 队列协同 |
| T4 | categoriesWithCounts 在父类 ID 下展开计算 = self + 子级总和（max depth 2 不溢出） | D8 候选 B 实现正确 |
| T5 | categoriesWithCounts 在孤儿子类（parentId 指向不存在 cat）下不抛异常，孤儿被当作 root | D13 失败模式兜底 |
| T6 | CategoryPage 在父类 URL 下显示 self + 所有 descendants 的 skills + mcps + claudeMd | D7 聚合视图 |
| T7 | CategoryPage 在子类 URL 下仅显示该子类（不上溯父类） | filter 不污染 |
| T8 | sidebar 点击父类 row → URL → CategoryPage → reload URL → 仍能定位到父类聚合视图 | URL 持久化 |
| T9 | 删 scenesStore.categoryFilter 死字段后 `npx tsc --noEmit` 通过 + 所有 vitest pass | 死代码清理 |
| T10 | 旧 data.json（含 `Skill.category: "Web"`）启动 app → migration → metadata 变为 `category_id`，sidebar / CategoryPage 仍正常显示 | backward compat（如 D1=A） |
| T11 | autoClassify 失败（claude CLI 不可用）→ error message 显示在 UI，未污染 categories Vec（不创建半成品 category） | HC3 错误处理 |
| T12 | autoClassify 多次连续点击 → 后端 DATA_MUTEX 串行，前端 isClassifying 防 double-fire | 并发安全 |
| T13 | autoClassify 创建新 category 时，appStore.addCategory IPC 调用对 backend `add_category` 持锁（DATA_MUTEX）正确 | V3 lock 协议不破坏 |
| T14 | autoClassify 创建新 cat 写入到末尾 → sidebar 渲染顺序与 categories Vec 顺序一致（apply_reorder 不被绕过） | V3 reorder 与 autoClassify 边界正确 |
| T15 | 候选 A 下 prompt 喂入的 `existingCategories` 是扁平 name 列表（无树形 indent）→ classify.rs 不需要修改 | HC1 prompt 反向兼容 |

---

## 8. 不确定性 + 风险

| # | 风险 | 缓解 |
|---|---|---|
| U1 | D1 决策（id vs name）会影响所有 filter / autoClassify 实现细节。R6 给的伪代码假设 D1=A（id），但若 D1=D（name + 同 parent 唯一），autoClassify 路径会更简单（不需要 name → id 解析）。 | R6 同时给两种方案；具体取决于 R1 决策；02_design_spec 必须显式 cite。 |
| U2 | `MainLayout.tsx:236-239` filter sync 是否保留？我倾向删除（与行业模式对齐），但属行为变更，需 02_design_spec 确认。 | 列入 02 确认 list。 |
| U3 | autoClassify 当前在 CategoryPage / SkillsPage 等多入口都可触发；hierarchy 引入后用户在某个父类聚合视图下点 Auto Classify → 应该只 classify 该聚合视图内的 items 还是全部？目前是全部（store.skills 整集）。 | 候选 A 不需要改；候选 B 需要决议是否传子集。R6 不替决策——属 R3/R4 体验问题。 |
| U4 | parseCategoryPath（候选 B）的 robustness：LLM 偶尔输出 "Development／Frontend"（中文斜杠）等；需要 sanitize | 候选 A 不存在此风险；候选 B 须 fixture 测试。 |
| U5 | `claudeMdStore.filter.categoryId` 字段未 sync sidebar — 如果以后想让 ClaudeMdPage 也响应 sidebar，需要补 sync useEffect；hierarchy 下需走 collectDescendantIds 同样逻辑。 | 列入未来改造计划。 |
| U6 | CategoryPage 在父类视图下"Auto Classify" 按钮的语义：是 classify 当前父类下所有 items 还是全 store？现状是全 store，hierarchy 下需明确 | 02_design_spec 确认；倾向"不变"——保持简单。 |
| U7 | T4-T7 测试涉及 hierarchy 数据 fixture，目前 `src/test/helpers/tauriMock.ts` 没有 parentId 字段；需要 R5 的 mock 改造同步落地 | R5 已捕获 mock 改造；R6 仅引用。 |

---

## 9. 关键 takeaway 给 03_tech_plan / 04_impl_plan 作者

1. **autoClassify 取候选 A（不感知 hierarchy）** — prompt 改动 0 行，frontend 改动仅在 D1=A 时新增 name→id 单跳；分担到 04_impl 的 task 卡为"修改 update_skill_metadata IPC 接受 categoryId 参数"，**不需要新建 task 卡处理 LLM prompt**。
2. **count 取候选 B（自身 + 所有子级）** — 实现就是 `collectDescendantIds + reduce`，已落 §3 useMemo 伪代码，可直接抄入 MainLayout.tsx。复杂度 O(N+M)，对当前数据量级零性能担忧。
3. **filter 在 CategoryPage 层级解析** — 不要试图把 hierarchy 推到 store 层；让 CategoryPage 自己用 collectDescendantIds(categoryId) 计算 visibleIds 集合，filter 时 `.has()` 检查。这样 store filter shape 不破，store 仍单值。
4. **强烈建议删除 `MainLayout.tsx:236-239` 的 filter sync useEffect** — 改为 sidebar = navigation only，让 SkillsPage / McpServersPage / ClaudeMdPage 仅响应自己的局部 filter UI（PageHeader 上的 search + 未来可加 chip）。这是行业标准模式，避免 hierarchy 引入时 store filter shape 撞上"单 name 装多个 descendants"的麻烦。需 02_design_spec 一句话确认。
5. **scenesStore.createModal.categoryFilter 是死代码，顺手删掉**（4-LoC 改动）；不参与 hierarchy 任何决策。
6. **collectDescendantIds 工具函数应放 `src/utils/categoryTree.ts`**（新建），同时 export 给 MainLayout (count) + CategoryPage (filter) + skillsStore (filter, 若保留 sync) 共用。max depth 2 决议在该函数内文档化。

---

**confidence**：80（D7/D8 候选选定置信高；autoClassify 候选 A 置信高；filter 简化建议（删 sync useEffect）置信中等，依赖 02_design_spec 确认；backward compat 路径依赖 R1 的 D1 决策）。

**takeaway**：autoClassify 选 A、count 选 B、filter 在 CategoryPage 层用 `collectDescendantIds` 解析；强烈建议删 MainLayout filter sync useEffect 简化交互模型；scenesStore.categoryFilter 死代码顺手删。
