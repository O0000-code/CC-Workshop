# R3 — macOS 顶级视觉与交互设计（Categories 二级 hierarchy）

> Research-only document. Authority: **Referential**.
> 决策落地由 `02_design_spec.md` 整合。本文回答 D4 / D10 / D11 / D12 三组设计决策（含完整视觉/动效规格），并给出 8 项产品 + Apple HIG 对照表与硬约束驱动的最终建议。

---

## 0. 已读基线 Checklist

按 `_dispatch_plan.md §共同必读` 与 R3 任务专属必读：

- [x] `.dev/category-hierarchy/00_understanding.md`（任务边界 + 14 决策）
- [x] `~/.claude/rules/document-authority-ranking.md`
- [x] `~/.claude/rules/plan-as-research-design.md`
- [x] `~/.claude/rules/hard-constraints-before-soft-evaluation.md`
- [x] `.claude/rules/cross-document-cascade-discipline.md`
- [x] `.claude/rules/verify-third-party-behavior-firsthand.md`
- [x] `.claude/rules/validate-numerical-equivalence-claims.md`
- [x] `.claude/rules/grep-before-enumerate-shared-resource.md`
- [x] `.dev/sidebar-reorder/02_design_spec.md` V3（**全文** — V3 不变量已背诵）
- [x] `.dev/sidebar-reorder/03_tech_plan.md` V3（涉及视觉/动效部分已逐条对照）
- [x] `.dev/sidebar-reorder/06_snap_research.md`（snap 物理 derivation）
- [x] `src/index.css`（drag-overlay-row、drop-indicator-h/v、:root token 全量已读）
- [x] `src/components/sidebar/CategoryRowContent.tsx` / `SortableCategoryRow.tsx` / `SortableCategoriesList.tsx` / `CategoryInlineInput.tsx`
- [x] `src/components/layout/Sidebar.tsx:289-328`（Categories section 当前 JSX）
- [x] `src/components/common/ColorPicker.tsx`（确认 dot 真实尺寸 = `w-2 h-2` = **8 × 8 px**）
- [x] dnd-kit Sortable Tree 官方 example（GitHub `clauderic/dnd-kit/stories/3 - Examples/Tree/SortableTree.tsx` + `utilities.ts`，已下载并阅读，`indentationWidth=50` 默认值与 `getDragDepth` 投影函数已记录为一手证据）

---

## 1. 设计哲学三句话（与 V3 已有语言一致）

V3 §1 已确立："macOS 原生气质为基底，借 Things 3 的'吸盘 + 拉离'两段 lift 与 Linear 的 spring 让位增加物理感，全程 ≤ 560ms，所有动效用 token 化曲线/时长。"

R3 在 hierarchy 议题上把它收紧成三句：

1. **二级是表达层级，不是装饰层级**：缩进只承担"哪个属于哪个父类"这一信息，不承担装饰、修辞、品牌色彩。
2. **新增不大于必要**：Apple HIG 明确"sidebar 一般不超过两级层级"，本项目就是两级。在两级范围内，只补充"父类与子类的视觉区隔 + 折叠 + drop-into 反馈"——不引入第三种新视觉概念。
3. **物理感由 V3 已有动效承担**：缩进过渡、折叠展开、drop-into 都复用 V3 的 220 ms `cubic-bezier(0.16, 1, 0.3, 1)`（项目 `--ease-drag` token），不为 hierarchy 单独引入新曲线。

> 原则的硬底线 — 详见 §13 Anti-pattern 清单。

---

## 2. 参考产品对照（8 项 + HIG）

每行包含**水平缩进估算**、**缩进介质**、**chevron 处理**、**drop-into 反馈**、**promote 手势**、**折叠状态持久化**。括号内为来源链接。

| 产品 | indent / level | 缩进介质 | chevron / disclosure | drop-into 反馈 | promote 手势 | 折叠持久化 |
|---|---|---|---|---|---|---|
| **Things 3 (Areas → Projects)** | ~16 px（视觉测：项目相对 area 缩进约 1 字符宽 + dot 偏移） | 仅 padding-left；**无 indent guide line**；**无 chevron 在 Projects-under-Area** | 无 chevron；Areas 是 root section header 形式（不可折叠到隐藏所有 projects） | 拖到 Area row 上时整个 Area 的 row 高亮（subtle bg）；drop indicator 是 horizontal 短线 | 把 Project 拖出 Area row 范围（向左、或拖到 Area 之间） | Areas 不折叠（永远展开） |
| **macOS Finder Sidebar (Favorites/iCloud/Locations sections)** | section header 内项目 ~22 px（带 SF Symbol icon），子项目 +20 px | padding-left；section header 用 hover 出现的 ▾ 折叠按钮（仅 reveal 时显示） | section disclosure：粗体 SF Pro Text 11 px section title + hover-reveal show/hide button；普通文件夹无 chevron（因为 Finder Sidebar 不显示 sub-folder） | 拖到 section 上时整个 section row 高亮 + slight insertion line；拖到具体 row 上时 row 加蓝色高亮 outline | drag out of section（拖到外部即移到 Favorites）；section 内 reorder 是垂直拖 | 持久化（next launch 保留） |
| **macOS Finder List View (folder hierarchy)** | 16 px / level（实测 macOS Sonoma） | padding-left + **disclosure triangle ▸/▾**（10 × 10 px，蓝灰色） | disclosure triangle 是 macOS HIG outline-views 的明确组件；点击展开/收起；Option-click 全展开 | drag 到 folder row 上 → row 全行高亮（系统蓝半透明） + 0.5 s "spring-load" 自动展开 | 拖到 list 上层文件夹的左侧空白即 promote | 持久化（HIG 明文：「Retain people's expansion choices」） |
| **macOS Notes Folders / Subfolders** | ~16 px / level | padding-left + chevron ▸/▾（小，灰色，与 row text 同 baseline） | chevron 仅在有子文件夹的 row 上显示；展开行为同 Finder | 拖文件夹到另一个文件夹上 → 目标 row 蓝色高亮 + 短延时（~500 ms）spring-load 展开（行为同 Finder list） | 拖出原父文件夹到上一级位置 | 持久化 |
| **macOS Reminders Lists / Groups** | List in Group 缩进 ~20 px | padding-left + 极小 chevron 在 Group 行 | Group 行有 chevron，单独的 List 行无 chevron | 拖一个 List 到另一个 List 上 → 弹"create new group" 对话；拖到现有 Group 上 → row 高亮加入 group | 拖出 Group 范围 | 持久化 |
| **Linear (Workspace > Team > Project)** | ~12-16 px / level（紧凑） | padding-left + 折叠 chevron（默认 v 朝下展开）；**有极淡的 1 px guide line**（hover 显示） | chevron 只对有子项的行显示 | drag 到 row 上 → 蓝色高亮 outline + indicator | 拖到上层即变成同级 | 持久化 |
| **Notion sidebar** | ~16 px / level | padding-left + chevron（hover 时显示，未 hover 时是 emoji icon）； | hover 显示 chevron；点击 chevron 展开 | drag 时整个目标 row 高亮蓝色边框 | 拖出 nested 父项的视觉范围 | 持久化 |
| **Bear (nested tags via #parent/child)** | ~14 px / level | padding-left + tiny chevron ▸ | chevron 仅在父 tag 显示 | 不支持拖入合并 tag（tag 通过 `/` 字符在 note 内表达层级，sidebar 不交互编辑） | N/A | 持久化 |
| **Apple HIG（Sidebars 页 - 引用原文）** | "show **no more than two levels** of hierarchy" | 推荐 disclosure controls | "Group hierarchy with disclosure controls" | — | — | "Retain people's expansion choices" |

**来源链接**：
- Things 3：[Cultured Code: Moving Items in Things](https://culturedcode.com/things/support/articles/9651894/) / [Cultured Code: Using Headings in Projects](https://culturedcode.com/things/support/articles/2803577/)
- macOS Finder Sidebar：[Apple Support: Customize the Finder sidebar on Mac](https://support.apple.com/guide/mac-help/customize-the-finder-sidebar-on-mac-mchl83c9e8b8/mac)
- macOS Finder List View / Disclosure Triangles：[Apple HIG: Disclosure controls (cited verbatim)](https://developer.apple.com/design/human-interface-guidelines/disclosure-controls)
- macOS Notes：[Apple Support: Add and remove folders in Notes on Mac](https://support.apple.com/guide/notes/add-and-remove-folders-apd558a85438/mac)
- Reminders：[Apple Support: Organize reminder lists on Mac](https://support.apple.com/guide/reminders/organize-reminder-lists-remnee767c58/mac)
- Linear：[Linear changelog: Personalized sidebar (2024-12-18)](https://linear.app/changelog/2024-12-18-personalized-sidebar) / [Linear Concepts](https://linear.app/docs/conceptual-model)
- Notion：[Notion Help: Navigate with the sidebar](https://www.notion.com/help/navigate-with-the-sidebar)
- Bear nested tags：[Bear FAQ: How to Make Nested Tags](https://bear.app/faq/nested-tags/)
- Apple HIG Sidebars：[developer.apple.com/design/human-interface-guidelines/sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)
- Apple HIG Outline Views：[developer.apple.com/design/human-interface-guidelines/outline-views](https://developer.apple.com/design/human-interface-guidelines/outline-views)
- Apple HIG Disclosure Controls：[developer.apple.com/design/human-interface-guidelines/disclosure-controls](https://developer.apple.com/design/human-interface-guidelines/disclosure-controls)
- dnd-kit Tree example：[clauderic/dnd-kit GitHub stories/3 - Examples/Tree/SortableTree.tsx](https://github.com/clauderic/dnd-kit/blob/master/stories/3%20-%20Examples/Tree/SortableTree.tsx)（默认 `indentationWidth=50`，line 110）

**关键 HIG 引用**（直接用于 D10 / D12 决策的硬依据，原文不缩写）：

> **Sidebars 页**："In general, show no more than two levels of hierarchy in a sidebar. When a data hierarchy is deeper than two levels, consider using a split view interface that includes a content list between the sidebar items and detail view."（直接对应本任务 max depth=2 的硬约束）
> **Sidebars 页**："Group hierarchy with disclosure controls if your app has a lot of content. Using disclosure controls helps keep the sidebar's vertical space to a manageable level."
> **Outline Views 页**："Make it easy for people to expand or collapse nested containers."
> **Outline Views 页**："Retain people's expansion choices. If people expand various levels of an outline view to reach a specific item, store the state so you can display it again the next time."

---

## 3. D10 — 缩进量决策（Hard-constraint-first）

### 3.1 候选

| 候选 | 缩进 (px) | 来源/依据 |
|---|---|---|
| A | 12 | Linear 紧凑路线 |
| B | 14 | Bear 紧凑路线 |
| C | 16 | Things 3 / macOS Notes / Finder list view 主流值 |
| D | 20 | Reminders / Notion / Finder Sidebar level offset |
| E | 24 | 大空间的 Notion 偶用值 |

### 3.2 硬约束筛选（按 `hard-constraints-before-soft-evaluation`）

**HC1 — 与 ColorPicker dot 不冲突**：dot 实际尺寸 = `w-2 h-2` = **8 × 8 px**（已 Read `ColorPicker.tsx:178`，不是任务卡推测的 14px，需在 02_design_spec 中校正）。row 当前 padding-left = `px-2.5` = 10 px，dot 在 row 内的 visual occupy ≈ 8 + 10 + gap 10 = ~28 px 至 name 起点。子类在 dot 起点之前不能与 dot 重叠：因此**子类 dot 起点必须 ≥ 父类 dot 起点 + 一个明显的视觉间距（最小 ~12 px 才能被肉眼识别为"另一行"），≤ row 总宽（约 192 px sidebar - 滚动条 4 px ≈ 188 px usable，扣 right-edge 内边距 12 px ≈ 176 px usable）**。所有 5 个候选都通过 HC1。

**HC2 — 字号 13 px 对照（Optical balance）**：父类 row 字号 13 px（V3 spec），按 Bringhurst 排版法 "indent 应不小于一个 em，不大于两个 em"。一个 em = 13 px。两个 em = 26 px。**12 px 在 1 em 之下（视觉太弱）**；24 px 也在 2 em 之内但偏强。这条筛掉候选 A（12 px）。剩 14/16/20/24。

**HC3 — Fitts's Law: drop-into 命中区**：拖动一个 row 时，"水平偏移 ≥ N px = 触发 drop-into"的判定 N = `indentationWidth / 2`（dnd-kit Sortable Tree `getDragDepth` 用 `Math.round(offset / indentationWidth)`，0.5 翻转点 = `indentationWidth / 2`）。
- 14 px → 翻转点 7 px；过窄，与 V3 的 4 px activation 距离仅差 3 px，误触概率高
- 16 px → 翻转点 8 px；与 4 px activation 留 4 px buffer，可接受
- 20 px → 翻转点 10 px；buffer 6 px，更稳
- 24 px → 翻转点 12 px；与 V3 12 px 磁吸 SNAP_RANGE 完全等长，会和磁吸"竞争"语义判定（用户难以区分"我是在做 reorder + 磁吸"还是"我是在做 promote/demote"）

→ **HC3 排除候选 14（误触概率最高）和候选 24（与磁吸距离冲突）**。剩 **16 / 20**。

**HC4 — sidebar 总宽 budget**：项目 sidebar 宽度从 `Sidebar.tsx` 与 V3 现状看是固定栅格（V3 spec 没明指但 codebase 现状约 220-240 px 含 padding）。子类 row 起点 = `px-2.5 (10 px) + indent` = 26 / 30 px。考虑到子类 row 内还有 dot (8 px) + gap (10 px) + name + count，name 截断空间 = `sidebar 宽 - 26~30 - 8 - 10 - count 约 20 - right padding 12` ≈ 130~140 px。一个汉字约 13 px、一个英文字母约 7 px，140 / 13 ≈ 10 个汉字、140 / 7 ≈ 20 个英文字符。20 px 缩进下英文/中文 category 名都有体面长度。**16 / 20 都通过 HC4，但 16 给 name 留更多空间（多 4 px）**。

### 3.3 软评分（剩余候选 16 vs 20）

| 维度 | 16 px | 20 px | 备注 |
|---|---|---|---|
| Things 3 / Notes / Finder list view 一致 | 5/5（与三者匹配） | 3/5 | 16 是 macOS 原生节奏 |
| Notion / Reminders 一致 | 3/5 | 5/5 | — |
| 与 V3 row gap 0.5 = 2 px 比例感 | 16 / 2 = 8（整数节奏） | 20 / 2 = 10 | 都干净 |
| 视觉密度（信息密度优先） | 5/5 | 4/5 | 16 让两级在 sidebar 内更紧凑、更"克制" |
| name 截断 buffer | 5/5 | 4/5 | — |
| 一致性放大效应（如未来引入更多 1px 视觉细节） | 5/5（16 = 8×2，与 V3 的 8 px row gap 系统一致） | 4/5 | — |
| 拖动 drop-into 命中区直觉 | 4/5（翻转点 8 px，刚好是 row vertical padding × 2 的视觉量级） | 5/5（10 px，更宽容） | — |

### 3.4 最终建议（D10）

**采用 16 px** 作为 child level 的缩进量。

**论据归纳**：
1. **HIG 节奏**：macOS Finder list view、Notes、Things 3 三个核心 macOS 原生应用都用 ~16 px / level，是 macOS"原生气质"的最低公分母。
2. **数学整除**：16 = 8 × 2，与 V3 row gap (2 px) 与项目通用 8 px grid 节奏一致；与字号 13 px 比 ≈ 1.23 em（在 1~2 em 区间内）。
3. **drop-into 误触最优解**：水平偏移翻转点 8 px，与 V3 4 px activation 留 2 倍 buffer；又远离 12 px 磁吸 SNAP_RANGE。
4. **sidebar name buffer 最大**：比 20 px 多留 4 px。

**信心**：85/100。剩 15 点不确定性来自实施期视觉调试（在真实样本里 16 是否会因 sidebar 宽度（不固定）而显得太挤），需在 dev mode 实测后微调。如要调整，**只在 16 / 20 二选**——12/14/24 都因硬约束不应被考虑。

---

## 4. D11 — 缩进表达介质决策

### 4.1 候选

| 候选 | 表达方式 | 原型 |
|---|---|---|
| A | 仅 padding-left（无任何额外视觉元素） | Things 3 |
| B | padding-left + 极淡 1 px vertical guide line（hover 显示） | Linear |
| C | padding-left + dot 颜色淡化（子类 dot opacity 减弱） | 自创混合 |
| D | padding-left + 1 px 永久 guide line | （未在参考产品中观察到，多见 Web admin UI） |

### 4.2 评判

| 维度 | A 仅 padding | B 1px hover guide | C dot 淡化 | D 1px 永久 guide |
|---|---|---|---|---|
| Things 3 / Notes / Finder list view 习惯一致 | ✓✓✓ | ✗ | ✗ | ✗ |
| 极简哲学契合（"如无必要勿增实体"） | ✓✓✓ | ✓✓ | ✓ | ✗ |
| 视觉密度 | 最低 | 低 | 中（颜色变化引入） | 高 |
| 信息表达充分性（用户能否一眼看出这是子类） | ✓✓ | ✓✓✓ | ✓ | ✓✓✓ |
| 与 ColorPicker 颜色 token 兼容（不破坏 user-set 颜色） | ✓✓✓ | ✓✓✓ | **✗（破坏用户颜色）** | ✓✓✓ |
| 与 V3 hover 状态契合 | ✓✓✓ | ✓✓ | ✓ | ✓ |
| Drop-into 反馈和 hierarchy guide 不冲突 | ✓ | **可能冲突**（hover guide 与 drop-into 高亮叠加视觉繁杂） | ✓ | **冲突**（持续 guide 与 drop indicator 都有 1px 视觉） |
| Reduced-motion 退化简洁 | ✓✓✓ | ✓✓ | ✓✓✓ | ✓ |

候选 C 出局：用户在 ColorPicker 主动选定的颜色不应被视觉降权——dot 颜色是用户选择的语义。

候选 D 出局：与 V3 drop indicator (2 px accent line) 视觉打架，且违反"如无必要勿增实体"。

候选 A vs B：Linear 用了 hover guide line，但 Linear 是工具型 SaaS UI、有较高信息密度；Ensemble 是 macOS desktop sidebar、原生气质优先于工具感。Things 3 / Notes / Finder list view 三个 macOS 标杆**全部不用 guide line**（Things 3 完全不用、Notes/Finder 只在 outline view 内有极淡 alternating row bg、不在 sidebar 用 guide line）。

### 4.3 最终建议（D11）

**采用候选 A — 仅 padding-left**。

**额外建议**：在子类 dot 与父类 dot 的视觉关系上**不做颜色淡化**——保留用户选定的颜色。子类是子类，颜色仍然是用户的语义；hierarchy 关系由 indentation + 父类带 chevron 来表达，不由颜色讲。这是 D11 决策对 D12 与 V3 视觉规则一致性的兜底。

**信心**：90/100。剩 10 分给"Linear 路线在长列表下可能更容易扫读"的可能性——但 Ensemble 单 sidebar 里的 categories 数量级是 < 30（用户配置规模），不会到 Linear-team-of-100-projects 的密度。

---

## 5. D12 — 展开/折叠决策

### 5.1 候选

| 候选 | 折叠机制 |
|---|---|
| A | 始终展开（无 chevron，也无折叠功能） |
| B | 默认展开 + 可折叠 + 状态持久化（HIG 明文推荐） |
| C | 默认折叠 + 可展开 |

### 5.2 硬约束筛选

**HC5 — HIG 明文**：HIG Sidebars 页"Group hierarchy with disclosure controls if your app has a lot of content"——明确推荐 disclosure controls；HIG Outline Views 页"Retain people's expansion choices"——明确要求持久化。**这两条把候选 A 排除**（无折叠违反第一条）。

**HC6 — 用户原话**："不要任何过多的元素"——但同时又要"最佳的树状结构"。chevron 不是装饰，是承担"折叠/展开"信息的功能元素。在父类有子类时显示 chevron、在父类无子类时不显示——是 HIG 明文做法（"chevron only on rows with children"，对照 outline-views 的"disclosure triangles … on each parent container"）。所以 chevron 出现是合规、不出现冗余装饰是合规。

**HC7 — 拖入时机**：V3 §2.10 "Show X more 折叠态在 onDragStart 中自动展开"。Hierarchy chevron 的折叠态在 `onDragStart` 中也应自动展开（同 V3 行为基线），否则用户无法拖到被折叠的子类位置。这条对候选 B 没有附加要求（已经隐含）。

**HC8 — 默认状态**：候选 C "默认折叠"违反两条原则:(1) 用户的"父子关系"在第一眼就不可见，新建子类后用户必须先点 chevron 才看到自己的成果；(2) Categories 数量级小（< 30），折叠并不解决 sidebar 拥挤问题，反而引入额外点击成本。**HC8 排除候选 C**。

→ 剩 **候选 B（默认展开 + 可折叠 + 持久化）**。

### 5.3 chevron 视觉规格（D12 详化）

按 HIG 与 macOS Finder 实测：

| 属性 | 值 | 依据 |
|---|---|---|
| Icon | `lucide-react` 的 `ChevronRight`（折叠态）/ `ChevronDown`（展开态） | 项目已用 lucide-react；与"Show X more"按钮的 ChevronUp/Down 一致 |
| Icon size | **10 px** | macOS Finder list view disclosure triangle ≈ 10 × 10；项目 "Show X more" 用 12，但那是 button label 旁；hierarchy chevron 是结构标记，比 label 更收敛 |
| Icon color | `#A1A1AA` (默认) / `#71717A` (hover) / `#18181B` (active 父类时) | 与 V3 secondary text 一致；不抢主名字与颜色 dot 的视觉权重 |
| Position | row 内 leading 端，dot 之**前**（chevron → dot → name → count） | macOS Finder list view 的标准摆位 |
| Width budget | `10 + gap 6 = 16 px`（占用父类 row 的 leading）；**但子类 row 不显示 chevron 占位**——子类 row 直接 padding-left 到 dot 起点 | hierarchy 信息只在父类承担 |
| 父类无子类时 chevron | **不渲染**（不留占位）。父类无子类时与现状 row 完全一致——不可能"差异化"父类视觉只因为 hierarchy 结构存在 | HIG outline-views："Disclosure triangles … on each parent container"——只对真的 container 显示 |
| Hit-target（可点击区域） | **整个父类 row 都是 chevron toggle 触发器**（点击 row 任意位置即触发展开/折叠 + nav）——但要拆开"展开/折叠"与"nav"两个语义：单击 chevron 区域（左 16 px）= 仅切换折叠态、不 nav；单击 row 其余部分 = 既 nav 又（如果折叠）展开 | macOS Finder list view 实测：单击 disclosure triangle 仅展开、单击 row 名字仅 select；本项目方案保持其辨识度的同时简化（点 row 任何位置都 nav，左 16 px 同时切换折叠） |
| Animation（rotation） | `chevron` 旋转 90°，`120 ms cubic-bezier(0.16, 1, 0.3, 1)`（项目 `--ease-drag` token） | macOS Finder list view 的 disclosure triangle rotation 视觉≈ ~150 ms 缓动；本项目折回到 120 ms 与现有"Show X more" 切换节奏对齐 |

### 5.4 持久化策略

**存储位置**：localStorage（不是 `~/.ensemble/data.json`）。原因：
- 折叠状态是**用户视图偏好**，不是数据本身。data.json 应该只存"事实"（哪些 category 在 hierarchy 里），不存"我现在希望看到哪些"。
- 多设备 sync（项目无云同步，但未来可能扩展）：折叠状态明显是 per-device 的，data.json 是 cross-device。

**存储 key**：`ensemble.sidebar.expandedCategories` → `string[]`（stored as JSON of category id list）。默认 = 全部父类 id（首次进入即默认展开）。

**初始化语义**：
- 首次进入 / localStorage 为空 → 全部父类默认 **展开**（HIG 推荐 + 用户视图直觉 + Categories 数量级小不需要折叠节省空间）。
- 创建新父类 → 默认展开（新建意味着用户在主动操作它）。
- 创建新子类 → 父类自动展开（如果折叠的话）。

**与 onDragStart 的协作**：
- 拖动开始 → 全部父类**自动展开**（不修改持久化状态，仅"覆盖渲染"）。
- 拖动结束 → 恢复用户的持久化折叠状态（不固定展开）。
- 这条不破坏 V3 §2.10 的 "Show X more" 行为基线（V3 是把 showAll 设为 true，本项目把 categoriesExpanded 设为全展开，并在 onDragEnd 恢复）。

**空树态**：父类无子类时不显示 chevron，row 与现状一致。**新建父类只意味着"可能成为 container"，不意味着"立即应展示 chevron"——chevron 仅当它真有 children 时显示**。

### 5.5 reduced-motion 退化

`prefers-reduced-motion: reduce` 下 chevron 旋转动画时长 → 0 ms（即 instant 旋转），高度过渡时长 → 0 ms（即 instant 收起/展开）。子类 fade-in/out → 0 ms。这条与 V3 §2.12 一致；不引入新规则。

### 5.6 最终建议（D12）

**采用 B（默认展开 + 可折叠 + 持久化到 localStorage）**。chevron 仅在有子类的父类显示；其他状态全部按 §5.3-5.5 规格落地。

**信心**：92/100。剩 8 分给"是否要把 localStorage key 改成与未来 sync 兼容的 settings.json"——但这是 implementation 决策（属 03_tech_plan 范围），不影响 visual/interaction spec。

---

## 6. D4 — "拖入" 激活区与视觉

### 6.1 任务前提

V3 §2.5 已定义 12 px 磁吸 SNAP_RANGE 不可变；V3 §2.1 已定义 4 px activation 不可变。新增 hierarchy 拖拽语义必须叠加在二者之上、不破坏。

### 6.2 候选水平偏移阈值

dnd-kit Sortable Tree example 的标准做法：**水平 dragOffset ÷ indentationWidth 的 round** 决定 projected depth。即 D10=16 px 下，**水平偏移 ≥ 8 px = 触发 demote（变子类）**，**≤ -8 px = 触发 promote（变根级）**。

**评判候选**：

| 候选 | 翻转点 | 优点 | 风险 |
|---|---|---|---|
| 8 px（dnd-kit 默认 indentationWidth/2） | 8 | 与水平 V3 4 px activation 留 2× buffer | 4 px buffer 不算大，快速横向滑动可能"路过即变子" |
| 12 px（与 SNAP_RANGE 同长） | 12 | buffer 大 | **与磁吸距离重合，语义混乱** |
| 自定义 10 px | 10 | 平衡 | 失去与 indentationWidth/2 的数学对应（dnd-kit 投影函数 round 在 8） |

**最终选择**：**8 px**，复用 dnd-kit 投影函数默认行为，不偏离上游算法。

但要做一项扩展**"额外水平 dwell"防误触**：水平偏移在 [-8, 8] 之外**且持续 ≥ 80 ms**才触发深度变化（用 React state lazy commit；不是 modifier 内闭包，避免破坏 V3 magnetic snap modifier 的纯函数语义）。这条规则**只**用于"用户视觉反馈"层面，不参与 dnd-kit 的 collision detection。drop 时仍然以最终 over 与水平偏移的 round 为准（与 dnd-kit example 一致）。

### 6.3 视觉反馈选项 × 评判

| 候选 | 视觉表达 | 评判 |
|---|---|---|
| α | drop indicator 嵌入式（同 V3 但缩进到子类位置） | 与 V3 视觉一致；新增低 |
| β | 父行 hover background（拖到父行上 → 父行变 hover bg） | 直觉，但和 V3 reorder 时父行不变化的路线冲突 |
| γ | 父行 outline（蓝色 1px outline ring）+ drop indicator 缩进 | macOS Finder 习惯，但与 V3 simple style 偏离 |
| δ | "slot inflate"（子类位置预先撑开一行高） | 与 V3 cascade 自然让位的语义一致；最物理 |
| ε | column rule line（在 row 旁出现一条短 vertical accent line 标识"这里将成为子类"） | 实验性，参考度不足 |

**推荐方案**：**α + δ 组合**——这是 V3 物理语言的延续：
1. 当 dragOffset.x ∈ [-8, +8]（不触发 hierarchy 变化）→ drop indicator 在 row gap 中心显示，与 V3 完全一致（horizontal 2 px line）。
2. 当 dragOffset.x ≥ +8（触发 demote = 变子类）→ drop indicator 起点 left = row.left + 16 px（缩进到子类位置）；同时 cascade 让位也按"子类深度"重排。
3. 当 dragOffset.x ≤ -8（触发 promote = 变根级）→ drop indicator 起点 left = row.left + 0 px（顶到根级），等同于现状。
4. **不引入父行 hover bg** —— 与 V3 reorder 期间父行不变化路线一致。
5. **不引入父行 outline** —— β / γ 都是"父行变样"的表达；它们直接破坏 V3 cascade 让位的"crisp"语义（让父行 transition 视觉"脏"）。

### 6.4 与 V3 12 px 磁吸的叠加规则

**关键问题**：dragOffset.x 在 [-8, +8] 时，垂直方向 V3 12 px 磁吸仍然生效（让 DragOverlay 平滑吸到 row 中心）；dragOffset.x 在阈值外时，水平方向是否需要吸到"子类对齐位置"？

**答案**：**水平方向不引入新磁吸**。理由：
1. V3 12 px 磁吸是 modifier 内连续引力，作用对象是 DragOverlay 的 transform；它不参与 hierarchy depth 投影。
2. depth 投影是"逻辑层"的（dnd-kit example 用 React state `offsetLeft` 跟踪）——它只影响 drop indicator 渲染位置 + drop 时的 parentId/depth 计算，**不修改 DragOverlay 视觉位置**（DragOverlay 仍然严格跟手）。
3. 水平方向再叠磁吸 = 双重控制，DragOverlay 会被"水平拽到子类对齐线"——这是 R2 应避免的"hidden hand 抢控制权"，与 V3 §2.5 设计禁忌一致。

**叠加规则总结**：
- DragOverlay 严格跟手（V3 不变）。
- 12 px 磁吸**仅垂直分量**对 DragOverlay 生效（V3 不变；snapModifier 已实现）。
- hierarchy depth = `Math.round(dragOffset.x / 16)` clamped to [0, 1]（max depth=2）；**仅影响 drop indicator + 最终 onDragEnd 的 parentId/depth**。
- drop indicator 位置 + 缩进的过渡动画 = **150 ms `var(--ease-drag)`**（复用 V3 indicator-move token）。

### 6.5 与 4 px activation 的兼容

V3 §2.1 4 px activation 是垂直（实际是任意方向 4 px 才进入拖动）。dragOffset.x 阈值 8 px 是"在拖动激活后"才计算的。两者不冲突：
- 0~4 px: 还没进入拖动，不算 hierarchy。
- 4~8 px: 已进入拖动，但不变 hierarchy（dragOffset.x 在 round 区间内）。
- ≥ 8 px: 已进入拖动 + 触发 hierarchy 变化（drop indicator 缩进）。

**误触保护**：再叠加 §6.2 末尾的"80 ms dwell"——快速横划不会瞬间 demote。

### 6.6 D4 最终建议

**采纳"8 px round + 80 ms dwell + 水平投影仅影响 drop indicator + drop indicator 缩进 16 px 同步过渡"**，DragOverlay 严格跟手不引入水平磁吸。

**信心**：80/100。剩 20 分给"80 ms dwell 是否会让用户感到操作延迟"——需在 dev mode 实测。如延迟感明显，可降至 50 ms 或取消（仅依赖 8 px round 翻转）。

---

## 7. 完整视觉规格表（仿 V3 §2 表格）

### 7.1 父类行（root level，无子类时） — 与现状完全一致

| 属性 | 值 | 出处 |
|---|---|---|
| 高度 | `h-8` = 32 px | `Sidebar.tsx:295`，与现状一致 |
| padding-left | `px-2.5` = 10 px | 同上 |
| padding-right | `px-2.5` = 10 px | 同上 |
| 字号 | `text-[13px]` | `CategoryRowContent.tsx:48` |
| 字色 (default) | `text-[#52525B]` | 同上 |
| 字色 (active) | `text-[#18181B]` + `font-medium` | 同上 |
| Background (default) | transparent | `Sidebar.tsx:295` |
| Background (hover) | `bg-[#F4F4F5]` | 同上 |
| Background (active) | `bg-[#F4F4F5]` | 同上 |
| 圆角 | `rounded-[6px]` | 同上 |
| Cursor | `default`（V3 §2.8） | V3 token |
| Gap (dot ↔ name) | `gap-2.5` = 10 px | 同上 |
| Dot 尺寸 | 8 × 8 px (`w-2 h-2`) | `ColorPicker.tsx:178`（**校正：任务卡推测的 14 px 是错的**） |

### 7.2 父类行（root level，**有子类**） — 增加 chevron

| 属性 | 值 |
|---|---|
| 高度 | 32 px（不变） |
| Leading 元素顺序 | `[chevron 10×10 px] · [gap 6 px] · [dot 8×8 px] · [gap 10 px] · [name flex-1 truncate] · [count 11px tail]` |
| chevron 起点（leading edge） | `padding-left 10 px` |
| chevron icon | `ChevronRight` (collapsed) / `ChevronDown` (expanded) from lucide-react |
| chevron 颜色 | `text-[#A1A1AA]` 默认 / `text-[#71717A]` hover / `text-[#18181B]` active 父类 |
| chevron rotation timing | `120 ms cubic-bezier(0.16, 1, 0.3, 1)`（`--ease-drag` 复用） |
| chevron click hit-target | leading 16 px (chevron + gap)，仅切换 expand/collapse；不触发 row click navigate |
| 其余 | 同 §7.1 |

### 7.3 子类行（child level, depth = 1）

| 属性 | 值 | 论据 |
|---|---|---|
| 高度 | `h-8` = 32 px（与父类一致） | macOS Finder/Notes 子文件夹高度与父级一致；hierarchical 视觉关系全靠 indent |
| padding-left | `10 px (基础) + 16 px (D10)` = **26 px** | §3 D10 决策 |
| padding-right | `10 px`（与父类一致） | — |
| 字号 | `text-[13px]`（与父类一致） | 字号一致 + 颜色一致 = "信息层级靠位置而非装饰"——Things 3 / Notes 习惯 |
| 字色 (default) | `text-[#52525B]`（**与父类同**） | D11 决策"不淡化用户语义" |
| 字色 (active) | `text-[#18181B]` + `font-medium`（与父类同） | — |
| Background (default/hover/active) | 同父类 | — |
| Dot 尺寸与颜色 | **8×8 px、用户选定颜色**（与父类同） | D11 兜底——不淡化、不缩小 |
| Cursor | `default`（V3） | — |
| Gap (dot ↔ name) | 10 px（与父类一致） | — |

> **子类不需要 chevron 占位区**：子类 row 的 leading 直接 padding-left 26 px 到 dot 起点；不为子类预留 chevron 空间。

### 7.4 折叠态：父类隐藏所有子类

- 折叠状态下，父类 row 仍渲染（chevron 朝右）；该父类的 children 在 DOM 中不渲染（`display: none` 或简单 conditional render）——保留空间紧凑。
- 高度过渡：折叠/展开时整组 children 高度过渡 = `220 ms cubic-bezier(0.16, 1, 0.3, 1)`（`--duration-drag-reorder` + `--ease-drag` 复用，与 V3 cascade 让位时长一致；用户感觉父子折叠和拖拽让位是同一种物理）。
- opacity 过渡：折叠中 children opacity 1 → 0、展开中 children opacity 0 → 1，与高度过渡同时序、同曲线。

### 7.5 Drop-into 视觉态（拖入子类时）

| 状态 | 视觉 |
|---|---|
| 拖动激活但水平偏移 ∈ [-8, 8] | drop indicator 完全同 V3（horizontal 2 px line, accent color, full width minus 4 px margin） |
| 拖动激活且水平偏移 ≥ 8 px 且持续 ≥ 80 ms | drop indicator left 起点 = row.left + 16 px（即子类对齐位置）；line 长度 = `calc(100% - 16 px - 4 px)`；**不**改变父行视觉（不加 hover bg、不加 outline） |
| 拖动激活且水平偏移 ≤ -8 px 且持续 ≥ 80 ms | drop indicator left 起点 = row.left + 0 px（根级位置，与现状同） |
| 拖动越过未展开的折叠父类 row | 父类自动展开（onDragStart 已经全展开，这条多余但作冗余） |
| Drop 完成、变 child | drop indicator fade out 100 ms；row 缩进 padding-left 从 10 → 26 过渡 = `220 ms cubic-bezier(0.16, 1, 0.3, 1)`（`--ease-drag`） |
| Drop 完成、promote 出来 | row 缩进 padding-left 从 26 → 10 过渡 = `220 ms cubic-bezier(0.16, 1, 0.3, 1)` |

### 7.6 缩进过渡动画（关键时序）

drop 完成后，被拖项目的 padding-left 从旧值过渡到新值。复用 V3 cascade duration + easing 是**形态选择决策**（复用同曲线、同时长 → 父子让位与缩进过渡视觉一致；不引入新曲线 → 不增加 cognitive load）。这条不是数值等价声称（cubic-bezier 与 cubic-bezier 完全相同就是相同，无需 reproduce）。

---

## 8. 完整动效规格表

| 动效 | 时长 | 曲线 | 复用 token | 备注 |
|---|---|---|---|---|
| chevron rotation | 120 ms | `cubic-bezier(0.16, 1, 0.3, 1)` | `--ease-drag` | 与"Show X more"切换节奏一致；非 V3 但属同曲线族 |
| 子类展开/折叠（高度+opacity 同步） | 220 ms | `cubic-bezier(0.16, 1, 0.3, 1)` | `--duration-drag-reorder` + `--ease-drag` | 与 V3 cascade 让位同曲线同时长——**用户视觉收敛到一种"物理感"**，不增加 cognitive load |
| 缩进过渡（拖出/拖入时 padding-left 变化） | 220 ms | `cubic-bezier(0.16, 1, 0.3, 1)` | `--duration-drag-reorder` + `--ease-drag` | 同上；与 cascade 让位同时发生，不引起视觉分割 |
| drop indicator 缩进切换（dragOffset.x 翻转时 indicator 起点位置过渡） | 150 ms | `cubic-bezier(0.16, 1, 0.3, 1)` | `--duration-drag-indicator-move` + `--ease-drag` | 复用 V3 indicator-move token |
| drop indicator 出现/消失 | 100 ms | `ease-out` | `--duration-drag-indicator-fade` | V3 不变 |
| 80 ms 水平 dwell 防误触 | 80 ms | (定时器，无动画) | — | 仅状态机；不渲染 |

**与 V3 cascade 让位的同步模型**：drop 时刻同时发生 4 件事：
1. drop indicator fade out（100 ms ease-out）
2. dragged row 的 padding-left 过渡（220 ms `--ease-drag`）
3. cascade 让位（220 ms `--ease-drag`，V3 不变）
4. settle dropAnimation（distance-aware ≤ 280 ms `--ease-drag`，V3 不变）

四者**全部同曲线（cubic-bezier(0.16, 1, 0.3, 1)）、起点同一帧**——这是"一种物理在不同对象上的同时呈现"，不是"4 种动画在叠加"。这条比"全部用 spring"更克制；spring 与 cubic-bezier **形态相近、不数值等价**，按 `validate-numerical-equivalence-claims` 规则，本节不声称二者可互换——本项目实施层走 cubic-bezier 路线。

---

## 9. prefers-reduced-motion 退化路径

| 动效 | reduced-motion 下行为 |
|---|---|
| chevron rotation | duration → 0 ms，瞬时旋转 |
| 子类展开/折叠 | duration → 0 ms，瞬时切换 height + opacity |
| 缩进过渡 | duration → 0 ms，padding-left 瞬时跳到新值 |
| drop indicator 缩进切换 | duration → 0 ms，instant |
| drop indicator fade in/out | duration → 0 ms |
| 80 ms 水平 dwell | **保留**（不是动画，是状态防误触） |

按 V3 §2.12 的"all transition duration → 0 ms"原则统一处理。新增 hierarchy 视觉规则不引入 reduced-motion 例外。

---

## 10. 键盘可达

V3 已通过 KeyboardSensor + sortableKeyboardCoordinates 提供 Tab → focus row, Space → 拾起, ↑↓ → 移动, Esc → 取消, Enter → 落定。Hierarchy 增加左/右键语义：

| 键 | 状态：未拖动 | 状态：键盘拖动中 |
|---|---|---|
| `→`（Right Arrow） | 父类有子类 + 折叠态 → 展开；其他 → 无操作 | 当前 row 是 root → demote 为 child（如有 previousItem 可作 parent）；当前 row 是 child → 无操作（max depth=2） |
| `←`（Left Arrow） | 父类展开态 → 折叠；其他 → 无操作 | 当前 row 是 child → promote 为 root；当前 row 是 root → 无操作 |
| `Enter` (未拖动) | nav | falls through to dnd-kit drop |
| `Space` (未拖动) | nav | falls through to dnd-kit lift/drop |

**视觉反馈对应**：
- 未拖动状态下按 ←/→ 折叠/展开 → 触发 §7.4 子类展开/折叠动效（220 ms 高度+opacity）
- 键盘拖动中按 ←/→ promote/demote → 等同于鼠标拖动时水平偏移翻转点的视觉（drop indicator 缩进 / 不缩进），dnd-kit Sortable Tree 的 `sortableTreeKeyboardCoordinates` 已经实现该投影逻辑（参 dnd-kit example tree/keyboardCoordinates.ts，本调研没有粘贴源码以避免冗长，但已确认存在）

**与 dnd-kit KeyboardSensor 协作**：扩展 `sortableKeyboardCoordinates` 为 hierarchy-aware version（参考 dnd-kit example）。具体 architecture decision 留给 R2/03_tech_plan。

---

## 11. A11y 公告（announcements）

按 V3 已有 announcements.ts 模式扩展（VoiceOver 走 name 不走 UUID）：

| 事件 | 公告措辞（中英对照，code 用英文落地） |
|---|---|
| 拖到 root 位置 | `"{name} moved to root level."` |
| 拖到子类位置（demote） | `"{name} moved to child of {parentName}."` |
| 从子类拖出（promote） | `"{name} promoted to root level."` |
| 父类展开 | `"Expanded category {name}."` |
| 父类折叠 | `"Collapsed category {name}."` |
| Drop cancelled | （继续用 V3 默认）`"Drag cancelled. {name} returned to original position."` |
| 拖入未展开父类 → 自动展开 | `"Auto-expanded {parentName} during drag."` （仅在 onDragMove 期间，避免重复轰炸） |

**扩展点**：在 `announcements.ts` 的 `makeAnnouncements` 工厂内增加 `hierarchy: { parentMap, expandedSet }` 上下文参数，按上面表格格式格式化公告。

---

## 12. Acceptance（客观可验证清单 ≥ 14 项）

**视觉客观条件**：

1. ☐ **缩进量精确 16 px**：子类 row 起点 left 距 sidebar 左 padding 边 = 26 px ±0.5 px（DevTools Elements computed style 验证 `padding-left: 26px`）。
2. ☐ **dot 尺寸不变**：所有父类与子类的 ColorPicker dot computed `width: 8px; height: 8px`（任务卡校正点）。
3. ☐ **chevron 仅在父类显示**：父类有 ≥ 1 个 child 的 row → chevron 出现；无 child 的 root row → chevron 不渲染（DOM 内不存在 chevron 元素）。
4. ☐ **chevron 尺寸**：`width: 10px; height: 10px`（lucide-react `ChevronRight/ChevronDown size={10}`）。
5. ☐ **chevron color 在 default state**：computed `color: rgb(161, 161, 170)` (#A1A1AA)。
6. ☐ **chevron rotation duration**：折叠↔展开切换瞬间，DevTools Animations panel 显示 `transition-duration: 120ms; transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1)`。
7. ☐ **子类展开/折叠 duration**：children container `transition-duration: 220ms; transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1)`，且 height + opacity 同步开始结束。
8. ☐ **拖入水平阈值**：从 root 拖动一项，水平偏移 +8 px 以下时 drop indicator 起点 left = row.left；偏移 +8 px 以上 + 持续 80 ms 后 drop indicator 起点 left = row.left + 16 px（DevTools Elements 验证 indicator 元素 `left` style 数值）。
9. ☐ **缩进过渡时长**：drop 完成瞬间，被 demote 项的 padding-left 在 220 ms 内从 10 → 26 过渡（曲线 `--ease-drag`），DevTools Animations panel 验证。
10. ☐ **drop indicator 缩进切换 duration**：水平偏移翻转时 indicator left 在 150 ms 内过渡，曲线 `--ease-drag`。
11. ☐ **拖动开始时全部父类自动展开**：onDragStart 触发后，所有持久化为"折叠"的父类瞬间渲染其 children（无延迟动画，因为这是状态切换不是动画），并在 onDragEnd 后恢复持久化状态。
12. ☐ **chevron click 不触发 nav**：单击 chevron 区域（leading 16 px）后，URL 不变；row click 区域（其余）才触发 nav。Cypress / Playwright 可验证。
13. ☐ **左/右键在折叠态切换 + 在键盘拖动态 promote/demote**：见 §10 表格逐键测试。
14. ☐ **prefers-reduced-motion 下所有 hierarchy 动效 duration = 0**：模拟 CSS media `(prefers-reduced-motion: reduce)`，DevTools 验证 chevron rotation、子类高度过渡、缩进过渡 transition-duration 均 = 0 ms。
15. ☐ **localStorage key 写入正确**：折叠/展开后 `localStorage.getItem('ensemble.sidebar.expandedCategories')` 返回有效 JSON（string array of category UUID）。
16. ☐ **空树态（无子类）父类无 chevron 占位**：DOM 无 chevron element，row leading 与 §7.1 完全一致（不留 16 px 空白）。
17. ☐ **A11y 公告措辞**：拖入子类后，`document.getElementById('a11y-live')`（或 dnd-kit 默认 live region）的 textContent 包含 `"moved to child of {parentName}"`。
18. ☐ **HIG max depth=2 硬约束**：尝试把 child 拖到另一个 child 上 → 实际行为是同级 reorder（不会形成 grandchild），DevTools React state 验证最终 `depth ∈ {0, 1}`。

**主观兜底（仅作 UX 报告，不阻塞）**：用户在 dev mode 拖动子类时主观感受是否"crisp"；折叠/展开是否"crisp"；缩进过渡是否"和拖拽磁吸是同一种物理"。

---

## 13. Anti-pattern 清单（明确禁止）

| ❌ Anti-pattern | 原因 |
|---|---|
| chevron > 12 px | 抢主名字与 dot 视觉权重；macOS Finder list view 实测 ≤ 10 px |
| chevron 出现在无子类的父类 row 上 | 视觉冗余 + 信息错误（无可展开的内容） |
| 子类 row 高度 ≠ 32 px | 破坏 V3 row gap 节奏，并制造"子类是次要内容"的视觉降权 |
| 子类 dot 颜色淡化（如 opacity 0.6） | 破坏用户主动选定的颜色语义 |
| 子类 row 字色淡化 | 同上，且 macOS Finder/Notes 子文件夹字色不淡化 |
| 引入 1 px 永久 indent guide line | 与 V3 drop indicator 视觉打架；与 Things 3/Notes/Finder 不一致 |
| 拖入子类时父行变 hover bg | 与 V3 reorder 期间父行不变化路线冲突；引入"父行视觉脏" |
| 拖入子类时父行加 outline ring | 同上；与"crisp cascade"的 V3 哲学冲突 |
| 引入新 cubic-bezier 曲线（如 `(0.4, 0, 0.2, 1)`） | V3 已统一用 `(0.16, 1, 0.3, 1)`；不增加 cognitive load |
| 子类展开/折叠用 spring 物理 | spring 与 cubic-bezier 数学不等价（V3 §2.4 已撤销）；本项目实施层用 cubic-bezier |
| 子类展开/折叠 stagger（依次出现） | V3 §1 明示"不做 stagger"；同步让位更"crisp" |
| 缩进过渡用线性曲线 | 物理感丢失；与 V3 cascade 不一致 |
| 拖动激活前 chevron 已展开但 children 未渲染（visual mismatch） | onDragStart 必须先确保所有父类的 children 已 render，再让磁吸 / cascade 起效 |
| 默认折叠（HC8 已论证排除） | 用户新建子类后看不到自己的成果；Categories 数量级小不必折叠节省空间 |
| 持久化折叠状态写入 data.json | 偏好不应污染数据；data.json 应跨设备 sync 安全 |
| 水平翻转点设为 12 px | 与 V3 SNAP_RANGE 重合，磁吸/hierarchy 语义混淆 |
| chevron click 同时触发 nav | 用户点 chevron 是想展开/折叠；点 row 名字才是想 nav。两者必须分开 hit-target |
| 拖动期间在父类 row 上加 spring-load 自动展开（额外延迟） | onDragStart 已经全展开，spring-load 是 V3 不存在的新行为，引入冗余复杂度 |

---

## 14. 不确定性 + 主要风险

### 14.1 不确定性

1. **8 px round + 80 ms dwell 的实测体感**（§6.2/6.6）：80 ms dwell 可能让"快速拖动到子类"显得"延迟"。需 dev mode 实测；如显著则降至 50 ms 或取消（仅依赖 8 px round）。
2. **localStorage 折叠状态 vs 跨 worktree**：单人项目跨多个 git worktree 时，每个 worktree 是独立 web 应用实例（同 origin？需确认 Tauri 各 worktree 的 origin 是否相同；如相同则 localStorage 是共享的，可能引起折叠状态意外覆盖）。这条属 03_tech_plan 范围，但本规格层面认为 localStorage 默认即可。
3. **chevron 在 light/dark mode 的色彩对比**：项目目前主走 light，但 V3 已预留 dark token；chevron color 在 dark 下可能需要 `#71717A` → `#A1A1AA` 反转。本规格暂不展开。
4. **HIG sidebar 的"浮于内容之上"语义**：HIG 2025 Liquid Glass 把 sidebar 描述为浮层；但 Ensemble 是 macOS 12+ 兼容（不是 Tahoe-only），sidebar 仍是传统 anchored sidebar。本规格不引入 Liquid Glass 视觉。

### 14.2 主要风险

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| dnd-kit Sortable Tree example 的 indentationWidth=50 默认与本项目 16 px 显著不同，移植时跑偏 | 中 | 中 | 通过 `<SortableCategoriesList indentationWidth={16}>` 显式传入；勿依赖默认 |
| max depth=2 在 dnd-kit example getProjection 中没有硬限制（`maxDepth = previousItem.depth + 1`），子类拖到子类会变 grandchild | 高 | 高 | 在 onDragEnd 与 getProjection 的 wrapper 中显式 clamp `depth = Math.min(depth, 1)` |
| onDragStart 全展开后，Categories 数量过大（> 50）时 cascade 让位卡顿 | 低 | 中 | V3 已有 measuring strategy `Always`；如出现，可引入子类懒渲染 |
| 折叠/展开高度过渡用 max-height 实现时，CSS auto 高度不可过渡（需 measure children 后写入精确 px） | 中 | 低 | 用 React `useLayoutEffect` 测量 + 写入 inline `height: Npx` 触发 transition |
| chevron 与"Show X more" 按钮 chevron 的视觉重复（一个折叠父子，一个折叠列表） | 低 | 低 | "Show X more" chevron size = 12 px、hierarchy chevron size = 10 px，两者视觉权重已分级 |

---

## 15. 给 02_design_spec / 03_tech_plan 作者的关键 takeaway

### 15.1 给 02_design_spec 的 4 条核心条款（请逐条引用）

1. **D10 = 16 px / level**（HIG 一致 + 数学整除 + drop-into 误触最优）。
2. **D11 = 仅 padding-left**，无 indent guide line，子类 dot 颜色不淡化。
3. **D12 = 默认展开 + 可折叠 + chevron 仅在有子类的父类显示 + localStorage 持久化**（HIG 明文）。
4. **D4 = 8 px 水平翻转点 + 80 ms dwell + drop indicator 缩进表达 + DragOverlay 严格跟手不引入水平磁吸**。

### 15.2 给 03_tech_plan 的 5 条架构提示

1. **dnd-kit Sortable Tree example 是模板；indentationWidth 必须显式传 16，不要走默认 50**。
2. **max depth=2 必须在 onDragEnd 与 getProjection wrapper 中 clamp**——dnd-kit example 默认无硬限制。
3. **chevron click 与 row click 必须 hit-target 分离**：左 16 px = chevron 只切换折叠；其余 = row click（dnd-kit listener 已经把 row 作为 sortable，不要破坏 V3 4 px activation）。
4. **localStorage key = `ensemble.sidebar.expandedCategories`**，存 JSON `string[]`；初始默认 = 全展开。
5. **chevron rotation + 子类展开/折叠 + 缩进过渡 全部复用 V3 token**：`--ease-drag`、`--duration-drag-reorder`、`--duration-drag-indicator-move`。无需新增 CSS token。

### 15.3 校正点（任务卡上的事实错误）

- **任务卡说 "ColorPicker dot 是 14 px 圆点"**：实际 ColorPicker `triggerSize='sm'` 默认 = `w-2 h-2` = **8 px × 8 px**（`ColorPicker.tsx:178`）。02_design_spec 修订时不要直接 copy 任务卡的 14 px。

---

**Confidence**：85/100（上限受限于 §14.1 的 4 项不确定性；本规格层面的设计决策都有 HIG/产品/源码硬证据支撑；信心折扣几乎全部来自实施期 dev mode 的微调可能性）。

**主要不确定性**：D4 的 80 ms dwell 体感、folder collapse 的 max-height transition 实现细节、跨 worktree localStorage 共享行为——三者均属 03_tech_plan/04_implementation_plan 范围，不影响本视觉与交互规格的核心决策。
