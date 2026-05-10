# PRD V1 评审报告 — 设计一致性（Reviewer 3）

> **角度**：PRD 中所有视觉与交互描述是否完全沿用现有设计语言；是否潜伏新 token / 新组件 / 新动效。基准 = `.claude/rules/design-language.md`（Decisional Rule）+ 现有代码现状（SkillsPage / McpServersPage / Sidebar / Button / SkillListItem 实现事实）。
> **评审范围严格限定**：仅视觉一致性。不评审闭环成立性（Reviewer 1）、用户体验（Reviewer 2）、商减范围（Reviewer 4）。
> **评审方法**：用 PRD 章节文字与（a）design-language Rule 条款、（b）现有代码具体行号事实做双向比对，差异处必须有明确依据。

---

## 执行摘要

PRD V1 在视觉一致性总则（§5.9）层面声明良好——明确"不新建颜色 / 不新建动效曲线 / 不新建 Modal / 不新建分组形态"，且把 design-language Rule 列为硬约束。**整体方向正确，但分散在多个章节的具体视觉描述中存在 9 处与"现有代码事实"或"design-language Rule"不一致的违例**，其中 4 处 P0、4 处 P1、3 处 P2。最严重的偏差有三类：

1. **直接的事实错误**：sidebar 顶部新分组的 hairline 颜色被指定为 `#E5E5E5`（§3.2 [2], §5.1），但现有 Sidebar.tsx:314, :360 的两条分组 hairline 实际是 `#E4E4E7`，PRD 声明"同款"但写错颜色。
2. **声明性引用未落到组件 API**：`Install / Installing / Installed` 按钮通篇描述但未声明使用现有 `<Button variant="primary" size="small">` + 已有 `loading` / `disabled` 状态；按钮失败态"变红"未绑定 `--color-error` token 或 `Button variant="danger"`；Confirm Modal 形态未绑定到现有 `<Modal>` 组件 size 档位；checkmark + `Installed` 文字标签未绑定到 Badge variant 或字号档位。
3. **动效曲线 / 时长字面值与现有代码不一致**：§5.9 写"按钮变态使用 250 ms cubic-bezier"，但现有 Button.tsx:111-113 实际是 `transition-colors duration-150 ease-out`——PRD 把 list↔detail compact 的 250 ms 误代到按钮态切换上。

§5.9 把 `#3B82F6` plugin badge 蓝点声明为"现状违例不引入第二个"是好的——但 PRD 自己在多处具体描述中又埋了潜在违例（红色 / 文字标签灰色 / "Last synced 12h ago" 新 PageHeader 元素等），属于"原则正确但执行未到位"。

**总体判断：Pass with revisions** — 视觉哲学方向正确，但 9 处具体偏差必须在 V2 修订时显式收齐到现有 token 与组件 API，否则 V1 实施阶段会在多处自创视觉。

---

## 专项检查结果

### [1] PRD 是否引用而非重写 `design-language.md`：**Pass**

§5.9 明确"严格按 `.claude/rules/design-language.md`"，§5.1 / §5.2 / §5.3 / §5.4 / §5.7 也都用"沿用 SkillsPage 模式"" "现有 SlidePanel 同动效""现有 SkillsPage 错误条机制"等引用语，没有重写 Rule 内容。优点：通篇没有自定义任何 px / ms / 缓动 token。但落实粒度上有两处例外——§5.1 重复写 `#E5E5E5`、§5.9 写"按钮变态使用 250 ms cubic-bezier"——这两处是把"沿用"声明落到具体数字时偏离了现有事实，但属于个别违例（计入下方 P0 / P1），不构成"重写 Rule"。

### [2] List / Detail / Modal 描述对齐 SkillsPage / McpServersPage：**Pass with caveat**

布局骨架（PageHeader + 列表 + SlidePanel(800)）与详情面板的"图标 + 名称 + 主操作"结构（§5.4）与 SkillDetailPanel 同构。但 §3.2 [3] 与 §5.2 描述 Marketplace PageHeader 的 actions 是 `Refresh`——SkillsPage.tsx:686-720 actions 是 `Import + Auto Classify`，McpServersPage.tsx:664-738 actions 是 `Import` 系列；现有页面**不存在** Refresh 这个 PageHeader action（Refresh 在 Sidebar header 而非 PageHeader）。这不是不能加，但 PRD 应该说清"Refresh 复用 Button `secondary` size `small` + RotateCw icon"或同等程度的对齐声明，否则实施时容易自创新形态。见 P1-2。另外，§5.7 表格写"上游不可达、缓存命中"时"顶部 PageHeader 右段显示一个小的 'Last synced 12h ago' 提示"——这是另一个**新的** PageHeader 元素，未声明是 Tooltip / inline label / Badge 哪种形态，也未声明字号。见 P1-5。

### [3] sidebar 顶部 marketplace 分组与现有分组同构：**Fail**

§3.2 [2] 与 §5.1 都说新 hairline 用 `#E5E5E5`、与"Navigation/CATEGORIES/TAGS 之间的 divider 同款"。但事实上现有 Sidebar.tsx:314（Nav→Categories）与 :360（Categories→Tags）两条分组 hairline 用的是 `#E4E4E7`；`#E5E5E5` 仅用于 Header 与 sidebar 右边框（:244, :247）。PRD 的"同款"声明本意正确，但具体颜色写错；这是 PRD 直接引入的事实错误。此外，PRD §5.1 ASCII 把"MARKETPLACE"段标题放在 hairline **之下** + Navigation 之上——但现有 Sidebar.tsx:314-318 的结构是 `<div hairline /><h3 CATEGORIES />`、:360-363 的结构是 `<section border-t><h3 TAGS /></section>`——两种结构都把 hairline + 段标题作为一个区段的"开头"。新 Marketplace 分组插在 Header 与 Navigation 之间，需要镜像哪个先例？PRD 未明示。见 P0-1。

### [4] 是否新建 marketplace badge / 新颜色 / 新动效：**Pass with caveat**

§5.9 明确反对引入第二个硬编码颜色违例；§5.3 明确"不在列表项左段叠 marketplace badge"；§7.3 明确 marketplace 不沉底排序。这三条原则都正确。但 §5.3 还引入了一个 badge 形态："Skill 列表项右段 `[已安装 ✓]` 灰色文字标签"——未声明这个 checkmark + 文字标签的视觉形态是复用现有 Badge variant（`Badge variant="status"`？）还是新建文字标签；§5.3 还提了"上游 popularity 数字（小字，作为 social proof）"——未声明字号档位。design-language Rule 字号档位明确禁止"自创 15/17"等档外字号；PRD 必须明示"小字" = `text-[11px]`（与 sidebar count、tooltip body 同档）或 `text-[12px]`（与 description 同档）。两处都属于"声明 badge 形态但未绑定到现有组件 / 字号档"，是潜在违例风险。见 P1-1。

### [5] `Install / Installing / Installed` 按钮形态复用现有 Button 组件 + variant：**Fail**

PRD 多处描述按钮状态机（§4 V1 In #8、§5.3、§5.5、§5.6、§7.5），但**通篇未声明**该按钮使用现有 `<Button variant="primary" size="small">` + Button 已有的 `loading` / `disabled` 状态实现 `Install → Installing... → Installed`。Button.tsx:1-120 已具备：4 variants（primary / secondary / danger / ghost）+ size 档位（small/medium/large）+ `loading` prop 自带 Loader2 旋转图标 + `disabled` 灰态——完整覆盖此 state machine。但 PRD 没说"复用 Button 组件 + 哪个 variant"，导致实施 SubAgent 必须自行决定，自创视觉概率上升。还有：`Installed (configure env)` 怎么放——是 Button 内文（按钮变长）还是 Button + 注释（按钮 + 旁注）？这影响列表项右段宽度预算，PRD 应明示。见 P0-2。是否符合 design-language §Anti-patterns "active:scale-95 (rare)" 的按钮按下反馈也未声明——按钮 disabled 后是否仍保留 `:active` 反馈？现有 Button.tsx 的 disabled 态没有 `active:scale-95`，PRD 应保持沉默或明确声明"沿用现有 Button 行为"。

### [6] 错误反馈（按钮变红 + error banner + EmptyState）：**Fail**

§3.2 [5]、§5.5、§5.7 多处出现"详情按钮就地变红 + 一行短文 `Installation failed. Retry?`"——红色未绑定 token。Button.tsx 已有 `danger` variant（`bg-transparent text-[#DC2626] border border-[#FEE2E2]`，对应 `--color-error: #DC2626` + `--color-error-bg: #FEE2E2`，index.css:43-44），但"按钮就地变红"语句未声明使用 `Button variant="danger"`，且现有 `danger` variant 是 transparent bg + 红色 text + 红色 border 的次级形态——一个原本是 `primary`（黑底白字）的"主操作"按钮直接变成 `danger`（透明底红字红框）会产生视觉跳层。错误 banner 的描述（"沿用 SkillsPage 现有错误条"）正确——SkillsPage.tsx:731-742 的错误条用了 `border-red-200 / bg-red-50 / text-red-700`，这些 Tailwind 类不是 token；不过它是现有违例的承袭，PRD 不引入新违例。EmptyState 描述（icon `WifiOff` + title + description + Retry 按钮）与现有 EmptyState 组件 API 是否完全对齐 PRD 也未声明。见 P0-3。

### [7] ASCII 图（§5.1）是否构成"画线框"违例：**Pass**

派单卡明确"不画线框图、不嵌入截图"。§5.1 的 ASCII 示意画的是 sidebar 区段顺序（header → MARKETPLACE → Navigation → CATEGORIES → TAGS → Settings），不画 px、不画间距、不画字号、不画交互态。这属于**结构示意**而非视觉线框，与"不画线框"原则不冲突——它的产品价值是"用户读懂新分组在哪里"。轻微缺陷：§3.2 [2] 用文字描述了同一结构 + §5.1 用 ASCII 又描述了一次，违反 plan-document-style"同一信息不在多处重复"，但这是 plan-style 而非 design-consistency 范畴，按规则不展开评审。

### [8] List Item compact 模式动效要求：**Pass with caveat**

§5.3 显式提到"列表项 compact 模式动效必须保留——SkillListItem 的 250 ms cubic-bezier opacity / max-width 折叠（A §3.4）必须在 marketplace 列表项中镜像，否则用户从详情切回列表时会感到节奏断层"。这是好的——明确点名复用 SkillListItem.tsx:19-20 的 `TRANSITION_DURATION = '250ms'` + `TRANSITION_EASING = cubic-bezier(0.4, 0, 0.2, 1)`，并声明"折叠动效不能漏"。但 §5.4 的"详情面板节奏"也写了"250 ms cubic-bezier `SlidePanel` 滑入"——同一数字 250 ms 重复出现两次，而 design-language Rule §Constraints "Allowed inline easing" 中 `cubic-bezier(0.4, 0, 0.2, 1)` 已被列为"list↔detail compact / SlidePanel" 通用 inline easing，PRD 应该一处引用 Rule 而非两处重复 250 ms 字面值。更严重的问题：§5.9 第 2 项把"按钮变态"也写成"250 ms cubic-bezier"——但 Button.tsx:111-113 实际使用 `transition-colors duration-150 ease-out`，这是 design-language Rule §Constraints 中"ease-out keyword (indicator fade in / **button transitions**)"的明确归属。PRD 把 list↔detail 缓动误用到按钮态切换，是真实的曲线 / 时长偏差。见 P1-6。

---

## 发现清单（按 P0 / P1 / P2 排序）

### [P0-1] sidebar 新 hairline 颜色写错（§3.2 [2], §5.1）

PRD 写 `#E5E5E5`，现有 Sidebar Nav→Categories 与 Categories→Tags 两条 hairline 实际为 `#E4E4E7`（Sidebar.tsx:314, :360）。`#E5E5E5` 仅用于 Header 底边与 Sidebar 右边框（:244, :247）。PRD 声明"同款"但写错颜色 = 直接引入事实错误。
**修订建议**：把 `#E5E5E5` 改为 `#E4E4E7`，且在 §5.1 ASCII 图旁注明"hairline = `#E4E4E7`（与 Nav→CATEGORIES、CATEGORIES→TAGS 同款，区别于 Header 边框的 `#E5E5E5`）"。同时明示 MARKETPLACE 段标题与 hairline 的位置关系（参照现有 Categories / Tags 段标题"在 hairline 之下"的先例）。

### [P0-2] `Install / Installing / Installed` 按钮未绑定到现有 Button 组件（§4 #8, §5.3, §5.5, §5.6, §7.5）

PRD 通篇描述按钮状态机但未声明使用 `<Button variant="primary" size="small">` + Button 已有的 `loading` / `disabled` 状态实现 `Installing...` / `Installed`。Button 组件已具备 4 variants + loading + disabled 完整覆盖此机制（Button.tsx:1-120）。`Installed (configure env)` 的呈现位置（Button 内文 vs 旁注）影响列表项右段宽度，PRD 必须明示。
**修订建议**：在 §4 #8 或 §5.5 加一句"按钮形态：`<Button variant="primary" size="small">`；`Installing...` 用 Button 内置 `loading` prop（自带 Loader2 旋转图标，沿用 SkillsPage `Detect/Classify` 同款 spinner）；`Installed` 用 `disabled` 灰态。`Installed (configure env)` 的 `(configure env)` 是 inline secondary 文字（`text-[11px] text-[#A1A1AA]`），不是 Button 内文。"

### [P0-3] "按钮变红"未绑定 token / variant（§3.2 [5], §5.5, §5.7）

"Installation failed" 时按钮"就地变红 + 短文"——红色未声明使用 `--color-error` 或 `Button variant="danger"`，且 `danger` variant 实际是 transparent bg + 红色 text + 红色 border（次级形态）；把一个 primary 按钮直接换成 danger variant 会跳级。PRD 应明示"失败态使用 Button `danger` variant + `Retry?` 短文 inline 在按钮右侧"，或声明"沿用 SkillsPage 现有错误反馈语言"（按钮保持 primary、错误信息只在 banner 内）以避免新视觉态。
**修订建议**：在 §5.5 与 §5.7 统一为"失败态：(a) 顶部 error banner 沿用 SkillsPage.tsx:731-742 现有形态；(b) 详情按钮恢复为 `primary` 可点击态、文案改为 `Retry`；不引入'按钮变红'的新视觉态。"

### [P0-4] §5.9 "按钮变态使用 250 ms cubic-bezier" 与现有 Button.tsx 事实冲突（§5.9）

§5.9 第 2 项写"动效曲线（使用现有 `--ease-drag*` / `--duration-drag-*` token；按钮变态使用 250 ms cubic-bezier）"。但现有 Button.tsx:111-113 实际使用 `transition-colors duration-150 ease-out`——这是 design-language Rule §Constraints "Allowed inline easing" 中明确归属"button transitions"的 `ease-out` keyword。PRD 把 list↔detail compact 的 250 ms `cubic-bezier(0.4, 0, 0.2, 1)` 误代到按钮态切换上，会让实施 SubAgent 产生新视觉。
**修订建议**：把 §5.9 第 2 项中"按钮变态使用 250 ms cubic-bezier"改为"按钮变态沿用 Button.tsx 现有 `transition-colors duration-150 ease-out`（design-language Rule §Constraints"button transitions"归属）"。

### [P1-1] `Installed ✓` 文字标签 + popularity 数字未绑定到现有组件 / 字号档位（§5.3）

§5.3 写"右段 = [已安装 ✓] / [Install 按钮]" + "popularity 数字（小字，作为 social proof）"。`已安装 ✓` 与 `Installed` 的术语在 §5.3 与 §4 #8 间未统一（中英混用）；checkmark 文字标签是新形态，未说复用 `Badge variant="status"` 或现有 `Check` icon。"小字"未指定为字号 11（count / stats）还是 12（description）—— design-language Rule 明确禁止"自创 15/17"等档外字号。
**修订建议**：(a) 统一术语为 `Installed`（与 Button 文案一致）；(b) checkmark + 文字标签复用 `<Badge variant="status">` + `<Check />` icon（lucide-react，与 SkillsPage 的 `classify-success-icon` 同源）；(c) popularity 数字明示为 `text-[11px]`（与 sidebar count、tooltip body 同档）。

### [P1-2] PageHeader `Refresh` actions 未声明形态（§3.2 [3], §5.2）

SkillsPage / McpServersPage 当前 PageHeader actions 不含 `Refresh`（SkillsPage.tsx:686-720 是 Import + Classify）；Marketplace 引入 Refresh 是新增内容，但 PRD 没有声明"使用 Button `secondary` size `small` + RotateCw icon"或同等程度的复用对齐。McpServersPage.tsx:552 已用 RotateCw 做内联刷新，但不在 PageHeader actions 槽。
**修订建议**：在 §5.2 加一句"PageHeader actions 槽内放 `<Button variant=\"secondary\" size=\"small\" icon={<RotateCw />}>Refresh</Button>`，与现有 Sidebar header Refresh 语义同构（不是新形态）"。

### [P1-3] `stdio / HTTP` type badge 未指定 Badge variant（§3.2 [3], §5.3）

§5.3 写 "stdio / HTTP type badge"——Badge 组件已有 5 个 variant（status / category / tag / count / plugin 等），PRD 未指定使用哪个。也没说类型 badge 的颜色映射——是中性灰还是 stdio = warm / HTTP = cool？无声明会让实施者自创色映射，违反 design-language Rule"不新建颜色"。
**修订建议**：明示"`<Badge variant=\"status\">stdio</Badge>` / `<Badge variant=\"status\">HTTP</Badge>`，使用 zinc 系中性灰（`text-[#52525B] bg-[#F4F4F5]` 或现有 status variant 的统一映射），不引入第三方色彩"。

### [P1-4] 同名碰撞 Confirm Modal 形态未声明复用 Modal 组件（§5.6）

"弹小型 Confirm Modal"——未声明使用现有 `<Modal>` 组件（基础 ImportSkillsModal / ImportMcpModal 等都基于这个组件）。"小型"未对应 Modal 已有的 size 档位。三按钮 `Replace existing / Skip / Cancel` 的视觉档位（哪个是 primary、哪个是 ghost）未声明。
**修订建议**：明示"使用现有 `<Modal>` 组件 size `small`；按钮档位：`Replace existing` 用 `Button variant=\"primary\"`（强调"覆盖是用户已显式确认的破坏性"）、`Skip` 与 `Cancel` 用 `variant=\"secondary\"`；默认焦点在 `Cancel`（与 §5.6 默认 Cancel 一致）"。

### [P1-5] "Last synced 12h ago" 提示形态未声明（§5.7）

§5.7 表格写"上游不可达、缓存命中"时"顶部 PageHeader 右段显示一个小的 'Last synced 12h ago' 提示"。这是一个新的 PageHeader 元素，未声明是 Tooltip / inline label / Badge / 文字注释哪种形态，也未声明字号、颜色、与 Refresh 按钮的相对位置（左 / 右 / 上 / 下）。"小的"是定性描述，需要落到现有字号档（11/12）。
**修订建议**：声明"`Last synced 12h ago` 是 PageHeader actions 槽内 Refresh 按钮**左侧** inline 文字（`text-[11px] text-[#A1A1AA]`），仅在缓存命中且当前未触发刷新时显示；与 Refresh 按钮共用 actions 槽，不增加新视觉层"。

### [P1-6] §5.4 详情面板"250 ms cubic-bezier" 字面值复述（§5.3, §5.4）

design-language Rule 已把 `cubic-bezier(0.4, 0, 0.2, 1)` 列为"list↔detail compact / SlidePanel" 通用 inline easing；PRD 在 §5.3 与 §5.4 两处复述"250 ms cubic-bezier"。这违反 plan-document-style"同一信息不在多处重复"原则（属于次要，不影响实施正确性）。
**修订建议**：把 §5.3 与 §5.4 的"250 ms cubic-bezier"统一替换为"沿用 design-language Rule 'list↔detail compact / SlidePanel' 缓动（详见 Rule §Constraints）"。

### [P2-1] `小型 Confirm Modal` 与 design-language Rule "Visual hierarchy ≤ 3 layers" 的关系未澄清（§5.6）

PRD 在 SlidePanel(详情) 上叠 Modal(同名碰撞 confirm)——这是 page → header + main → list + slide-panel → modal 的第 4 层。design-language Rule §Visual hierarchy 明确"≤ 3 layers"。SlidePanel 是不是被算作 detail panel 而 Modal 算 layer 4？现有 SkillsPage 是否已有"在 SlidePanel 内继续弹 Modal"先例 PRD 应主动引用并声明"沿用现有先例"。
**修订建议**：检查现有 SkillsPage / SkillDetailPanel 是否有 SlidePanel 内弹 Modal 的先例（例如 ConfirmDelete）；有则引用并声明"沿用同先例"；无则改为"SlidePanel 内 inline confirm 区"（避免 4 层栈）。

### [P2-2] §5.4 详情面板"Header 区（56 px）" 数字硬编码（§5.4）

§5.4 写 "Header 区（56 px）"。56 px 是 sidebar Header 的 `h-14` 实测值，与 PageHeader 同高——这是事实，但 PRD 直接写数字而非引用现有 token / 类。design-language Rule §Constraints 字号 / 字重表中明确 16 px / 600 是 page title / detail title 的标准；"56 px" 不在 token 列表中，应该用"沿用 SkillsPage / Sidebar header 高（`h-14`）"代替。
**修订建议**：把"Header 区（56 px）"改为"Header 区高度沿用 SkillsPage PageHeader 与 Sidebar header（`h-14` / 56 px）"，让事实而非数字成为引用依据。

### [P2-3] "Last updated 12h ago" 相对时间格式属新文案模式（§5.4 [4]）

§5.4 [4] 元数据栏写 `Last updated 12h ago` 等相对时间——这种"X 前"的相对时间格式在现有 Ensemble UI 中是否已有先例 PRD 未声明。"12h ago" 与 "12 hours ago" / "12 hr ago" / "12 小时前" 的口径不一致会出现 i18n 隐患（§10.4 提到 i18n 留 V1.5）。
**修订建议**：声明"沿用 lucide-react 生态常见的英文相对时间格式（`12h ago` / `3d ago`）；i18n 时机参考 §10.4"，或简化为绝对时间（`Last updated 2026-05-08`，更符合 macOS-native 简洁审美）。

### [P2-4] 详情面板"Source 行"未引用 SkillDetailPanel 现有 Source section（§5.4 [2]）

§5.4 [2] 描述 "Source 行：上游来源标签（'From skills.sh' / 'From Official MCP Registry'）+ owner/repo 链接（点击在系统浏览器打开）"。但 SkillDetailPanel.tsx:604-610 已有现成的 `Source` section（`<h3 class="text-sm font-semibold text-[#18181B]">Source</h3>` + 内嵌 `font-mono text-xs` 路径文本 + Reveal in Finder 操作）。PRD 的"Source 行"应明示是对 SkillDetailPanel 现有 Source section 的扩展（增加上游 link 行）还是新建独立"Source 行"——两者视觉差异显著。
**修订建议**：声明"扩展 SkillDetailPanel 现有 Source section（保留 sourcePath / Reveal 行 + 新增上游 'From skills.sh / Official MCP Registry' + owner/repo link 行），不新建独立行；上游 link 用现有 anchor 样式（`text-[#0063E1] underline-offset-2 hover:underline`，沿用 design-language Rule `--color-accent`）"。

### [P2-5] §5.7 EmptyState 描述与现有 EmptyState 组件 API 是否对齐未声明（§5.7）

§5.7 表格描述"EmptyState：`WifiOff` icon + `Marketplace unavailable` title + `Check your connection` description + `Retry` 按钮"——四元组与现有 EmptyState 组件（`<EmptyState icon title description action />`）的 API 看似匹配，但 PRD 未明示"完全沿用现有 `<EmptyState>` 组件而不是自建 EmptyState 内容容器"。`Retry` 按钮的形态（primary / secondary / ghost）也未声明。
**修订建议**：明示"使用现有 `<EmptyState>` 组件，`icon={<WifiOff />}`、`title='Marketplace unavailable'`、`description='Check your connection'`、`action={<Button variant=\"secondary\" size=\"small\">Retry</Button>}`，不引入新 EmptyState 形态"。

---

## 总体判断

**Pass with revisions**

PRD V1 的视觉哲学方向正确——§5.9 把 design-language Rule 列为视觉硬约束、明确反对引入新颜色 / 动效曲线 / Modal 形态 / 分组形态，且大量章节使用"沿用 SkillsPage 现有"等引用语。但分散在 §3.2 / §5.1 / §5.3 / §5.4 / §5.5 / §5.6 / §5.7 / §5.9 的具体描述中，存在 4 处 P0 与 4 处 P1 偏差——核心问题是**"PRD 在文字层面声明了沿用，但具体到颜色 hex / Button variant / Badge variant / Modal size / 缓动曲线 / 时长字面值时未明示复用 / 写错事实"**，导致实施 SubAgent 在 V1 spec / 实施阶段需要在多处自行决定，自创视觉的概率显著上升。

V2 修订时把 11 处具体偏差收齐到现有 token 与组件 API 即可达到 Pass 阈值；不存在结构性违例需要返回 Synthesis Gate 重做（决策层的视觉总则 D-13 / D-9 / D-14 / D-1 都正确，问题仅在 PRD 表述粒度）。最关键的两个 P0 是：(1) `#E5E5E5` 写错（直接事实错误），(2) `Install` 按钮通篇未绑定到 `<Button variant=\"primary\">` 组件 API（让实施者自创视觉的最大入口）。

---

## 不在本评审角度的发现（如有）

- §3.2 的旅程地图与 §5.1 ASCII 图存在结构信息重复——属于 plan-document-style"同一信息不在多处重复"问题，按 Reviewer 4（商减 / 范围控制）评审角度更恰当。
- §10.1 的 R-21 标记 plugin badge 的 `#3B82F6` 为"现状语言违例"——这是真实的现状违例（Rule 明确反对自创蓝色），但属于既有代码库技术债务，不在本次 PRD 评审角度。
- §10.4 提到的 `Install / Installing / Installed` 文案 i18n 字符宽度问题（中文版"已安装 / 安装中 / 安装"宽度差异）—— 属于 i18n 实施层，不在 V1 PRD 设计一致性范畴。
- "Installed" 按钮 disabled 后 `cursor: not-allowed` 是否与 design-language Rule "`cursor: default` on hover"原则冲突——属于细颗粒交互态，留给 02 design spec 阶段澄清。
- §3.2 [4] 详情面板的"图标懒加载 + 异常 markdown 安全降级"是产品行为而非视觉一致性问题，留给 Reviewer 1（闭环）或 Reviewer 2（用户体验）评审。

---

## 附录：审查依据汇总表（验证用）

下表列出本评审每条发现对应的现有代码事实 / Rule 条款，便于 V2 修订 SubAgent 与对齐审计 SubAgent 验证：

| 发现 ID | PRD 章节 | 对应事实依据 | 期望修订指向 |
|---|---|---|---|
| P0-1 | §3.2 [2], §5.1 | Sidebar.tsx:314 `bg-[#E4E4E7]` (Nav→Categories) + :360 `border-t border-[#E4E4E7]` (Categories→Tags); :244, :247 `border-[#E5E5E5]` (Header / sidebar 右边框) | hairline 一律 `#E4E4E7`；段标题位于 hairline 之下 |
| P0-2 | §4 #8, §5.3, §5.5, §5.6, §7.5 | Button.tsx:1-120（4 variants + loading + disabled 完整覆盖） | `<Button variant="primary" size="small" loading={isInstalling} disabled={isInstalled}>` |
| P0-3 | §3.2 [5], §5.5, §5.7 | Button.tsx:53-56 `danger` variant; index.css:43-44 `--color-error` `--color-error-bg`; SkillsPage.tsx:731-742 错误条 | 失败态保持 primary，错误信息只在 banner 内；不引入按钮变红 |
| P0-4 | §5.9 第 2 项 | Button.tsx:111-113 `transition-colors duration-150 ease-out`; design-language Rule §Constraints "ease-out keyword (button transitions)" | "按钮变态" 用 `duration-150 ease-out`，不用 250 ms cubic-bezier |
| P1-1 | §5.3 | design-language Rule §Constraints 字号档位 11/12/13/14/16/18 | popularity = `text-[11px]`；checkmark + 标签复用 Badge variant |
| P1-2 | §3.2 [3], §5.2 | SkillsPage.tsx:686-720（actions = Import + Classify，不含 Refresh）；McpServersPage.tsx:552 RotateCw | `<Button variant="secondary" size="small" icon={<RotateCw />}>Refresh</Button>` |
| P1-3 | §3.2 [3], §5.3 | Badge.tsx 5 variants；design-language Rule "不新建颜色" | `<Badge variant="status">stdio/HTTP</Badge>` 中性灰 |
| P1-4 | §5.6 | Modal.tsx `maxWidth` prop 默认 640 px | `<Modal maxWidth="400px">`；按钮 primary/secondary 档位 |
| P1-5 | §5.7 | design-language Rule 字号 11；现有 PageHeader actions 槽 | inline `text-[11px] text-[#A1A1AA]` 在 Refresh 左侧 |
| P1-6 | §5.3, §5.4 | design-language Rule §Constraints "list↔detail compact / SlidePanel" 缓动 | 引用 Rule 而非复述 250 ms 字面 |
| P2-1 | §5.6 | design-language Rule "Visual hierarchy ≤ 3 layers" | 检查 SlidePanel + Modal 是否已有先例 |
| P2-2 | §5.4 | Sidebar.tsx:247 `h-14`（=56 px）；SkillsPage PageHeader 同高 | "沿用 PageHeader / Sidebar header 高（h-14）" 替代 56 px 字面 |
| P2-3 | §5.4 [4] | i18n 在 §10.4 留 V1.5 | 沿用英文相对时间或改绝对时间 |
| P2-4 | §5.4 [2] | SkillDetailPanel.tsx:604-610 `Source` section + sourcePath 行 | 扩展现有 Source section，不新建独立行 |
| P2-5 | §5.7 | EmptyState 组件 API（icon + title + description + action） | "使用现有 `<EmptyState>` 组件" 显式声明 |

### 修订工作量估算

P0 4 处偏差中：
- P0-1（hairline 颜色）= 改 1 个 hex，2 处出现，工作量 < 5 分钟
- P0-2（Button 组件绑定）= 在 §4 #8 / §5.5 添加 1 段约 30 字声明，工作量 ~ 10 分钟
- P0-3（按钮变红 → 沿用 banner）= §5.5 / §5.7 删 / 替换 2 处描述，工作量 ~ 10 分钟
- P0-4（按钮缓动事实修正）= §5.9 改 1 句，工作量 < 5 分钟

P1 6 处偏差大多是 §5 章节内的 1-2 句声明补充，单条 5-10 分钟；P2 5 处偏差可作为"V2 修订时顺手清理"处理。总体 V2 修订设计一致性方向预计耗时 < 1 小时，不会触发膨胀风险。

### V2 修订时**不要做**的事（防止过度修订）

下面列出本评审虽然发现但**不应**通过 V2 修订引入的方向——避免修订把 PRD 本身变成 spec，违反 plan-document-style"PRD 不写技术实现 / 不重写 Rule"原则：

1. **不要把整套 design-language Rule 内容粘进 PRD**。修订只需"在原句中补一句组件 API 引用"或"改 1 个 hex / 1 个时长字面"，不需重写章节段落。如果发现自己在补 30 行以上视觉描述，停下——这说明已偏离 PRD 角色，回到只引用 Rule 的方式。
2. **不要为了消除"未声明"而创建新的视觉细节文档段落**。例如 P1-3 的 stdio/HTTP badge variant 应在原句"stdio / HTTP type badge"后括号补 `<Badge variant="status">`，不需要新建一个 "MCP type badge 视觉规范" 子节。
3. **不要在 V2 中尝试解决 R-21 plugin badge 蓝点 `#3B82F6` 现状违例**。这是既有代码库技术债务，超出 PRD 设计一致性评审角度（Out of scope）；尝试在 V2 解决会扩范围、违反 §9.3 范围控制硬约束。
4. **不要把"PRD 应明示沿用"变成"PRD 应规定每个 px"**。本评审反对的是"在 PRD 中说红色但不绑定 token"，不是"PRD 必须列出每个组件每个像素"——后者是 02 design spec 阶段的事。修订时如果不确定某个细节是否应在 PRD 中明示，参考标准：**该细节是否影响实施 SubAgent 的"自创视觉风险"**——影响则明示，不影响则保持沉默。
5. **不要修改决策层（D-1 / D-9 / D-13 / D-14 等）**。本评审的所有发现都在"PRD 表述粒度"层面，与 02_synthesis_decisions.md 的决策结论一致；不存在需要回 Synthesis Gate 重做的违例。修订 SubAgent 不需要触碰决策登记。

---

**报告结束。**
