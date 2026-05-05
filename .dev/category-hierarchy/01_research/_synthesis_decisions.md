# Wave 1 Synthesis — 主 Agent 跨报告冲突解决与决议

> **作者**：主 Agent（不外包）。  
> **位置**：Decisional 等级（与 02_design_spec / 03_tech_plan 同级，但限于本任务的 14 个决策点）。  
> **用途**：让 wave 2 / 3 SubAgent 不需要重新读 7 份报告就能直接作业。

## 0. 主 Agent 已读 checklist

- [x] R1 r1_data_model.md — D1=A 推荐、D2=A 推荐、D13=A+B 推荐、迁移 ~365 LoC + ~120 测试
- [x] R2 r2_dnd_tree_architecture.md — 单 SortableContext + 投影深度、官方 example 解构、20 V3 不变量回归核对、D5=B-1 / D6=C+E
- [x] R3 r3_visual_interaction_design.md — 16px 缩进、padding-only、chevron + 默认展开、8px X 阈值 + 80ms dwell
- [x] R4 r4_hci_evaluation.md — D7=A 聚合、D8=A 仅自身、12px X 阈值、L/R 方向键、删 chevron 候选清单
- [x] R5 r5_impact_enumeration.md — 0 新依赖、5 dropdown / 3 autoClassify 必改清单、隐藏地雷 10 项
- [x] R6 r6_classification_count_filter.md — D14=A 落根、D8=B 聚合 count、filter 解析在 CategoryPage 层、collectDescendantIds helper
- [x] R7 r7_design_philosophy_distillation.md — 3 层蒸馏完成、design-language.md 候选大纲、3 处现状不一致项

## 1. 已识别的跨报告冲突（4 项）

| # | 主题 | 冲突方 A | 冲突方 B | 解决 |
|---|---|---|---|---|
| C1 | D8 父类 count 数字 | R4: 仅自身（极简） | R6: 自身+子级总和（聚合一致性） | 选 B（详见 §2.1） |
| C2 | D4 drop-into X 阈值 | R3: 8px + 80ms dwell | R4: 12px（复用 SNAP_RANGE token） | 选 12px + 80ms dwell（详见 §2.2） |
| C3 | chevron 存在性 | R3: 保留 + 默认展开 + 持久化 | R4: "极简下应删"候选 | 选 R3（详见 §2.3） |
| C4 | MainLayout filter sync | R6: 建议删除 setSkillsFilter / setMcpsFilter useEffect | 范围外（任务只动 hierarchy） | 不采纳，仅采用 collectDescendantIds helper 思路（详见 §2.4） |

每条冲突的解决在 §2 中各给独立小节，附论据。

## 2. 冲突解决详解

### 2.1 C1：D8 父类 count 应为"自身 + 所有子级总和"（取 R6=B）

**决策**：父类 count 显示 `self_count + sum(descendant.count)`；子类（叶子）count 仅为 self_count。

**论据**：

1. **与 D7 决策（父类聚合视图）的一致性是硬约束**。R4 R6 R1 都同意 D7=A 聚合，意味着用户点父类 → 看到包含子类内容的列表。如果 sidebar 上显示 count=5，但点进去看到 8 项，违反 Norman 的"系统状态可见性"原则——这是 **bug 级 UX 问题**，比"极简多一个数字"严重得多。
2. **行业基准**：R4 自己的统计中，多数主流应用（Apple Reminders、Things 3 Project、Todoist parent project、Notion）父级 count 默认聚合，与 D7 聚合视图 行为一致。
3. **极简哲学的正确解读**：极简 ≠ 隐藏关键信息；极简 = 不用装饰。一个数字不是装饰。R4 提议的"仅自身"反而需要 `X (+N)` 那种 split 标记或 zero-count 父类来对齐，反而**破坏极简**。
4. **R4 的"极简"论据虽然部分成立**，但限定在"父类没有 children 的情况"上（无聚合争议）；hierarchy 是"父类有 children"的场景，本来就引入了一层信息密度。

**实现伪代码**（R6 §3 已给出）：

```ts
// MainLayout.tsx 改 categoriesWithCounts useMemo
const collectDescendantIds = (parentId: string, all: Category[]): Set<string> => {
  const descendants = new Set<string>();
  const stack = [parentId];
  while (stack.length) {
    const id = stack.pop()!;
    descendants.add(id);
    for (const c of all) {
      if (c.parent_id === id) stack.push(c.id);
    }
  }
  return descendants; // includes self
};

const categoriesWithCounts = useMemo(() => {
  return categories.map((cat) => {
    const idSet = collectDescendantIds(cat.id, categories);
    const nameSet = new Set(categories.filter(c => idSet.has(c.id)).map(c => c.name));
    return {
      ...cat,
      count:
        skills.filter((s) => nameSet.has(s.category)).length +
        mcpServers.filter((m) => nameSet.has(m.category)).length +
        claudeMdFiles.filter((f) => f.categoryId !== undefined && idSet.has(f.categoryId)).length,
    };
  });
}, [categories, skills, mcpServers, claudeMdFiles]);
```

> **注**：在 R1 D1=A 落地后，Skills/MCPs 也用 categoryId 引用，filter 改为 `idSet.has(s.category_id)`。但完整迁移期间需要双路径兼容（详见 §3.2 backward compat）。

`collectDescendantIds` helper 抽到 `src/utils/categoryTree.ts`（新建），CategoryPage 也复用。

### 2.2 C2：D4 drop-into 横向阈值 = 12px + 80ms dwell

**决策**：当被拖项中心在 X 方向上偏移 ≥ 12px 进入 over row 后**且** dwell 时间 ≥ 80ms，触发"成为该 row 的子类"语义。

**论据**：

1. **token 复用**：12px 与现有 `SNAP_DISTANCE_PX` 一致——同一个 token 双用（Y 轴磁吸 + X 轴 hierarchy 阈值）。R3 担心两者混淆，但 R4 已经论证"X 横向 vs Y 吸附"维度互斥。
2. **Fitts's Law**：R4 §3 计算（鼠标精度 σ ≈ 1.5px、阈值 = 8σ）下误触概率 < 0.01%。8px 在精确鼠标下也安全，但 trackpad / 抖手场景 12px 更稳。
3. **80ms dwell**：R3 的 80ms dwell 是优秀补充——纯阈值在用户"扫过"时容易误触发；dwell 等价"用户停下来"信号。80ms 跟 V3 的吸盘 lift 时长一致（项目语言一致性）。
4. **关键细节**：dwell 计时器在 hover 离开 over row 时立即清零；进入新 row 重新开始。

**实现 hint**：`SortableCategoriesList.tsx` 在 `onDragMove` 维持 `dwellTimerRef` + `dwellOverRef` 两个 ref；timer 触发时 set 一个 hierarchy `projected` state，调整 indicator 视觉。

### 2.3 C3：保留 chevron + 默认展开 + 持久化

**决策**：父类有子类时显示 chevron；默认展开；用户折叠状态持久化到 localStorage。chevron 仅在父类有子类时显示，**无子类不显示**（这是 R4 极简担忧的关键吸收点）。

**论据**：

1. **HIG 明文支持**：R3 引证 Apple HIG "Group hierarchy with disclosure controls" + "Retain people's expansion choices"。
2. **项目已接受 disclosure 视觉语言**：当前 sidebar 的 "Show X more" 折叠是 ChevronRight/ChevronDown，复用 = 一致 = 项目已有的极简精神。
3. **R4 的极简担忧**通过设计选择吸收：
   - chevron 仅在父类**有子类时**显示（无子类不显示，避免视觉噪音）
   - chevron 尺寸 10×10px（极小，与"Show X more"一致）
   - 颜色 `#A1A1AA`（与 secondary 文字同级，不抢主元素）
   - 旋转动效 120ms `--ease-drag`（已有 token，不引入新动效）
4. **持久化**：localStorage key `ensemble.sidebar.collapsedCategories`（Set<string>）。WSL/worktree 隔离不影响本机持久化，符合"机器本地"哲学（同 Memory）。

**Anti-pattern 锁定**：chevron 不允许在 hover 时变色或放大；不允许在折叠/展开时整行 flash；只允许 transform: rotate。

### 2.4 C4：不采纳 R6 删 MainLayout filter sync 的建议

**决策**：保留 `MainLayout.tsx:236-239` 的 `setSkillsFilter` / `setMcpsFilter` useEffect 现状不变。仅采用 R6 提出的 `collectDescendantIds` helper 思路（与 §2.1 一致）。

**论据**：

1. **超范围**：本任务原话仅说"加二级分类"，删除 store filter sync 属于 architectural cleanup，应单独 PR。
2. **风险**：删除会改变 SkillsPage / McpServersPage / ScenesPage 的 filter 行为，触发未列入任务范围的回归。
3. **可后续做**：若实施期间发现 filter sync 与 hierarchy 聚合冲突，再单独评估。**当前的解决方案是 CategoryPage 层用 collectDescendantIds 自洽**，不依赖 store filter 改造。

## 3. 14 个决策的最终汇总（带置信度）

| ID | 决策 | 选定 | 置信度 | 主要论据来源 |
|---|---|---|---|---|
| **D1** | category 引用方案 | A：迁移 Skills/MCPs 到 `category_id` UUID，保留 `category` (name) 作为 cached display + backward compat | 88 | R1 §2 候选评估矩阵 + R5 grep 显示 5 dropdown 全可统一 |
| **D2** | 数据模型形状 | A：`Category` 加 `parent_id: Option<String>` + 现有 `Vec<Category>` 不变 | 94 | R1 §3 + R2 dnd-kit 单 SortableContext 模式自然适配 flat Vec |
| **D3** | dnd-kit 模式 | A：单 SortableContext + 投影深度（dnd-kit 官方 Sortable Tree pattern） | 94 | R2 §4 候选评估矩阵 + 官方 example 一手源码 |
| **D4** | drop-into 激活区与视觉 | 12px X 阈值 + 80ms dwell + drop indicator 缩进表达 + DragOverlay 严格跟手不引入水平磁吸 | 88 | R3 §6 + R4 §3 + 主 Agent §2.2 解决 |
| **D5** | 父类拖拽语义 | B-1：父类只能 reorder 父类层、不可成另一父类的子（避免撕散子树+绕过 max depth=2） | 90 | R2 §6 + R1 D13 hierarchy validation 协同 |
| **D6** | 子→根 promote 路径 | C + E：水平向左拖（dnd-kit 投影深度负方向）+ ContextMenu 兜底 | 88 | R2 §7 + R4 键盘流设计 |
| **D7** | 父类聚合视图 | A：CategoryPage 显示父类自身 + 所有子级内容 | 92 | R1 R4 R6 一致 |
| **D8** | 父类 count 数字 | B：自身 + 所有子级总和（与 D7 聚合一致）；子类（叶）= 仅自身 | 85 | 主 Agent §2.1 解决（R6 主张胜 R4） |
| **D9** | dropdown 树形渲染 | 缩进 16px + 父类可选 + chevron 不可点（dropdown 内不折叠） | 80 | 与 sidebar 视觉一致；父类可选 = D7 聚合一致 |
| **D10** | 视觉缩进量 | 16px / level | 90 | R3 §5 HIG / Finder / Notes / Things 三标杆 |
| **D11** | 缩进表达介质 | 仅 padding-left（无 indent guide line、无子类 dot 颜色淡化） | 88 | R3 §5 + R4 同意 |
| **D12** | 二级展开/折叠 | 默认展开；有子类的父类显示 chevron 10×10；用户状态持久化 localStorage `ensemble.sidebar.collapsedCategories` | 85 | R3 §6 + 主 Agent §2.3 解决 |
| **D13** | hierarchy 失败模式 | A + B：后端硬验证（cycle / depth>2 / orphan / demote-with-children）；前端 prevent 非法 drop；`delete_category` cascade-promote children to root | 90 | R1 §4 |
| **D14** | autoClassify 父级感知 | A：暂不感知，新分类一律落根（prompt 不变）；v2 候选不在本范围 | 85 | R1 R6 一致 |

## 4. 14 个决策对依赖文档的级联

按 `cross-document-cascade-discipline.md` 要求声明 cascade footprint：

| 决策 | 02_design_spec V1 影响 | 03_tech_plan V1 影响 | 04_implementation_plan V1 影响 | .claude/rules/design-language.md 影响 |
|---|---|---|---|---|
| D1 | 弱（仅 dropdown value 由 name → id） | 强（types.rs / 全 store / 一次性 migration） | 强（迁移任务卡） | 无 |
| D2 | 中（缩进表达 = 数据 hierarchy） | 强（apply_reorder hierarchy-aware + parent_id 新字段） | 强 | 无 |
| D3 | 强（单 SortableContext 决定 indicator 实现路径） | 强（SortableCategoriesList 重构） | 强 | 无 |
| D4 | 强（视觉/动效规格） | 中（dwell timer 实现） | 中 | 弱（drop-into 范式可记到 design-language） |
| D5 | 中（父类拖拽视觉提示） | 中（项目内 hierarchy validator） | 中 | 无 |
| D6 | 中（promote 视觉） | 中 | 中 | 无 |
| D7 | 中（父类视图聚合行为） | 中（filter 解析） | 中 | 无 |
| D8 | 弱（count 数字仅显示） | 中（categoriesWithCounts 改造） | 中 | 无 |
| D9 | 强（dropdown 视觉规格） | 中（Dropdown 组件改造或新 prop） | 中 | 无 |
| D10 | 强（核心视觉规格） | 弱（CSS） | 弱 | 中（设计 token 添加 `--indent-step` 可选） |
| D11 | 强 | 弱 | 弱 | 弱 |
| D12 | 强（chevron + 持久化） | 中（localStorage hook） | 中 | 无 |
| D13 | 弱（错误反馈视觉） | 强（backend 校验 + 测试） | 强 | 无 |
| D14 | 无 | 弱（autoClassify chain 只需写入 parent_id=None） | 弱 | 无 |

## 5. wave 2/3 SubAgent 必读清单（强制）

任何后续 SubAgent 在写 02 / 03 / 04 / design-language.md 之前必读：

1. `00_understanding.md`（任务边界）
2. `01_research/_dispatch_plan.md`（wave 1 概览）
3. `01_research/_synthesis_decisions.md`（**本文档** — 14 决策定锤）
4. 各自任务专属的 R*.md（02 作者优先 R3 R4；03 作者优先 R1 R2 R5 R6；04 作者优先 R5；design-language.md 作者优先 R7）
5. `.dev/sidebar-reorder/02_design_spec.md` V3 / `03_tech_plan.md` V3 / `04_implementation_plan.md` V3（V3 不变量必背）
6. `~/.claude/rules/document-authority-ranking.md`、`~/.claude/rules/plan-as-research-design.md`、`~/.claude/rules/hard-constraints-before-soft-evaluation.md`
7. 项目级：`cross-document-cascade-discipline.md`、`verify-third-party-behavior-firsthand.md`、`validate-numerical-equivalence-claims.md`、`grep-before-enumerate-shared-resource.md`、`fallback-path-must-be-unreachable-in-test.md`

## 6. 不能下放的判断（主 Agent 必复核）

下列工作完成后，必须由主 Agent 亲眼复核（不得仅信任 SubAgent 自评）：

1. ☐ 02_design_spec V1 中"V3 不变量保留"的逐项核对（参 R2 §10 的 20 项清单）
2. ☐ 03_tech_plan V1 中迁移路径的"backward compat"细节（旧 data.json 还能反序列化）
3. ☐ 03_tech_plan V1 中 `delete_category cascade-promote` 的具体语义（避免子类丢失）
4. ☐ 04_implementation_plan V1 中"概念对齐 SubAgent T0"是否包含本 _synthesis_decisions.md
5. ☐ design-language.md 是否声明范围（应是项目级/不带 paths frontmatter，每 session 自动加载）
6. ☐ 跨 02/03 的"等价"声称必须 reproduce（参 validate-numerical-equivalence-claims）
7. ☐ 跨 02/03 的第三方库声称必须 link 源码（参 verify-third-party-behavior-firsthand）

## 7. 给 wave 2/3 SubAgent 的关键 takeaway

- **D1+D2 是改造心脏**：所有 wave 2/3 任务都假定 categoryId 迁移已落地。02_design_spec 主要聚焦视觉与交互；03_tech_plan 必须包含完整迁移规划 + backward compat 反序列化保证。
- **chevron 不是装饰，是 disclosure control**：HIG 明文 endorse；R4 的"极简删除"被吸收为"仅有子类时显示 + 极小尺寸 + 极淡颜色"。
- **count 必须聚合**：sidebar 显示数字 = CategoryPage 内可见项目数。violation = bug。
- **drop-into 12px + 80ms dwell**：12px 复用 SNAP_RANGE_PX token；dwell 等价用户"停下来"信号。
- **hierarchy 是 max depth=2 硬约束**：必须在 4 处同步 clamp（R2 §10 已枚举）：getProjection / 键盘协调 / apply_reorder backend / autoClassify 创建。
- **填漏的 categoryId 迁移路径**：必须有一次性 migration 命令 `migrate_category_id_for_skills_mcps`，由首次启动 / settings flag 触发，name → id 映射 backfill；旧 data.json 仍能加载（serde default + Optional 字段）。
- **不要重新评估 14 个决策**：除非发现关键事实错误（必须显式标记 P0 与 _synthesis_decisions 矛盾），否则按本文件落地。
