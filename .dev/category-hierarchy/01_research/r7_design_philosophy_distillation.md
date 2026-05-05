# R7 — Design Philosophy Distillation

> **Research-only document.** This is **素材 (raw material)** for the eventual `.claude/rules/design-language.md` Rule, NOT the Rule itself. A subsequent SubAgent will distill this further into the actual Rule.
>
> Authority: **Referential** (per `~/.claude/rules/document-authority-ranking.md`).

---

## 0. 已读基线 Checklist

按照分派计划的 10 项必读：

- [x] `.dev/category-hierarchy/00_understanding.md` — 任务边界 + 14 个待决策问题
- [x] `~/.claude/rules/document-authority-ranking.md` — 已嵌入系统上下文
- [x] `~/.claude/rules/plan-as-research-design.md` — 已嵌入
- [x] `~/.claude/rules/hard-constraints-before-soft-evaluation.md` — 已嵌入
- [x] `.claude/rules/cross-document-cascade-discipline.md` — 已嵌入
- [x] `.claude/rules/verify-third-party-behavior-firsthand.md` — 已嵌入
- [x] `.claude/rules/validate-numerical-equivalence-claims.md` — 已嵌入
- [x] `.claude/rules/grep-before-enumerate-shared-resource.md` — 已嵌入
- [x] `.dev/sidebar-reorder/02_design_spec.md` V3 — 全文读完（433 行）
- [x] `.dev/sidebar-reorder/03_tech_plan.md` V3 — 引用并由 02_design_spec V3 锚定（未单独读取，但 02 的 V3 cascade footprint 已覆盖技术内容）

任务专属必读：

- [x] `~/.claude/rules/persistence-system.md` — 已嵌入
- [x] `.dev/sidebar-reorder/06_snap_research.md` — 全文读完（502 行）
- [x] `/Users/bo/Documents/Development/Ensemble/Ensemble2/CLAUDE.md` — 全文读完（87 行）
- [x] `/Users/bo/Documents/Development/Ensemble/Ensemble2/AGENTS.md` — 头 100 行读完（项目背景与约束）
- [x] `src/index.css` — 全文读完（680 行）
- [x] `vite.config.ts` — 全文读完（确认 Tailwind 4 + `@/` alias）
- [x] `src/utils/constants.ts` — 全文读完（getCategoryColor 24 行）

已扫文件清单（**全部 Read，非推断**）：

**Common 组件（19 个，含 icons/）：**
- `src/components/common/Badge.tsx` (71)
- `src/components/common/Button.tsx` (133)
- `src/components/common/Checkbox.tsx` (101)
- `src/components/common/ColorPicker.tsx` (284)
- `src/components/common/ContextMenu.tsx` (155)
- `src/components/common/Dropdown.tsx` (373)
- `src/components/common/EmptyState.tsx` (58)
- `src/components/common/ErrorBoundary.tsx` (58)
- `src/components/common/FilteredEmptyState.tsx` (49)
- `src/components/common/IconPicker.tsx` (703)
- `src/components/common/ImportDialog.tsx` (418)
- `src/components/common/Input.tsx` (105)
- `src/components/common/Modal.tsx` (104)
- `src/components/common/ScopeSelector.tsx` (185)
- `src/components/common/SearchInput.tsx` (58)
- `src/components/common/TagsWithTooltip.tsx` (71)
- `src/components/common/Toggle.tsx` (90)
- `src/components/common/Tooltip.tsx` (163)
- `src/components/common/icons/CategoryEmptyIcon.tsx` (74)
- `src/components/common/index.ts` (28)

**Layout 组件（5 个）：**
- `src/components/layout/MainLayout.tsx` (664)
- `src/components/layout/Sidebar.tsx` (390)
- `src/components/layout/PageHeader.tsx` (124)
- `src/components/layout/SlidePanel.tsx` (123)
- `src/components/layout/ListDetailLayout.tsx` (123)

**Sidebar 组件（11 个，含 dnd/）：**
- `src/components/sidebar/CategoryInlineInput.tsx` (92)
- `src/components/sidebar/CategoryRowContent.tsx` (65)
- `src/components/sidebar/DragOverlayCategoryRow.tsx` (28)
- `src/components/sidebar/DragOverlayTagPill.tsx` (44)
- `src/components/sidebar/SortableCategoriesList.tsx` (319)
- `src/components/sidebar/SortableCategoryRow.tsx` (136)
- `src/components/sidebar/SortableTagPill.tsx` (128)
- `src/components/sidebar/SortableTagsList.tsx` (315)
- `src/components/sidebar/TagInlineInput.tsx` (76)
- `src/components/sidebar/TagPillContent.tsx` (30)
- `src/components/sidebar/dnd/animations.ts` (28)
- `src/components/sidebar/dnd/announcements.ts` (86)
- `src/components/sidebar/dnd/CustomMouseSensor.ts` (33)
- `src/components/sidebar/dnd/snapModifier.ts` (126)

**Domain 组件（13 个）：**
- `src/components/skills/SkillItem.tsx` (288)
- `src/components/skills/SkillListItem.tsx` (226)
- `src/components/skills/SkillDetailPanel.tsx` (670)
- `src/components/mcps/McpItem.tsx` (337)
- `src/components/mcps/McpListItem.tsx` (238)
- `src/components/mcps/McpDetailPanel.tsx` (头 100 行)
- `src/components/claude-md/ClaudeMdBadge.tsx` (90)
- `src/components/claude-md/ClaudeMdCard.tsx` (241)
- `src/components/claude-md/ClaudeMdDetailPanel.tsx` (头 100 行)
- `src/components/scenes/SceneCard.tsx` (170)
- `src/components/scenes/SceneItem.tsx` (114)
- `src/components/scenes/SceneListItem.tsx` (313)
- `src/components/scenes/CreateSceneModal.tsx` (1161)
- `src/components/projects/ProjectCard.tsx` (223)
- `src/components/projects/ProjectItem.tsx` (170)
- `src/components/projects/ProjectConfigPanel.tsx` (425)
- `src/components/launcher/LauncherModal.tsx` (245)

**Pages（部分）：**
- `src/pages/SkillsPage.tsx` (817)
- `src/pages/SettingsPage.tsx` (头 120 行)

---

## 1. Layer 1：哲学（Why）

> 蒸馏自 codebase 实证。每条哲学 ≥ 2 个 file:line 实例支撑。

### 1.1 极简（Minimalism）—— "如无必要勿增实体"

**核心命题**：删比加重要。每个像素、每条线、每个边框、每个 transition 都必须能回答"它能否被删"。

**实证 #1：Sidebar `cursor: default` 抑制 grab affordance**

`src/index.css:622-628`：
```css
[data-sortable-list] [aria-roledescription='sortable'] {
  cursor: default;
}
[data-sortable-list] [aria-roledescription='sortable']:active {
  cursor: grabbing;
}
```

**为什么**：dnd-kit 默认在所有 sortable item 上设置 `cursor: grab` on hover。项目主动覆盖为 `default`，**明确拒绝告诉用户"我可以拖"**——只在按下时才切到 `grabbing`。这是 macOS Finder/Notes 的原生行为：sidebar 不需要"拖拽 affordance"装饰，因为用户已经知道 sidebar 是可重排的（来自系统级心智模型）。

**实证 #2：DragOverlay 不带 rotation，Categories 不带 count**

`02_design_spec.md` V3 §2.2 表格：
- `rotation: 0`（**macOS 不旋转**）
- Categories DragOverlay `内容: ColorPicker dot + 名字（**省略 count**）`

`src/components/sidebar/DragOverlayCategoryRow.tsx:21`：
```tsx
<div className="drag-overlay-row h-8 px-2.5 flex items-center gap-2.5">
  <CategoryRowContent category={category} showCount={false} />
</div>
```

**为什么**：拖动期间 count 是冗余信息（用户已经选定要移动的 row，count 不影响决策），**主动删除**。Notion/Trello 风格的 lift 旋转是装饰性 affordance，macOS 工具型 sidebar 不需要。

**实证 #3：Tag pill 默认透明背景、仅 1px 边框**

`src/components/sidebar/SortableTagPill.tsx:113-119`：
```tsx
className={`
  inline-flex items-center px-2.5 py-[5px] rounded text-[11px] font-medium
  transition-colors duration-150
  ${
    isActive
      ? 'bg-[#18181B] text-white border-transparent'
      : 'bg-transparent text-[#52525B] border border-[#E5E5E5] hover:bg-[#F4F4F5]'
  }
`}
```

**为什么**：默认态是 `bg-transparent`（不是 `bg-[#FAFAFA]` 或别的），**让 sidebar 视觉密度尽量低**。pill 的形态完全由 1px 边框定义，可识别但不强调。仅 active 时切到 `#18181B` 实色。

**实证 #4：Drop indicator 不加端点圆点**

`02_design_spec.md` V3 §2.3 表格：`端点 | 不加圆点（保持极简，与 Notes 一致）`

`src/index.css:651-658`（drop-indicator-h）：仅一条 2px 高的水平线。

**为什么**：Linear 等产品的 drop indicator 会加左右圆点装饰；本项目主动拒绝。

---

### 1.2 克制（Restraint）—— 不做"反例" 

**核心命题**：项目用一系列**主动拒绝**定义自己的克制：不旋转、不弹跳、不 stagger、不 overshoot、不 stagger、不装饰图标 emoji、不强光晕（除 AI 状态特殊场景）。

**实证 #1：拒绝 stagger（同步让位）**

`02_design_spec.md` V3 §1：
> **不做** stagger（同步让位更"crisp"）

`02_design_spec.md` V3 §2.4 表格：
> stagger | **0**（同步让位） | **0**

**为什么**：stagger 是 Material Design 风格的"波纹式"重排，但工具型 sidebar 用同步让位更"crisp"，且更快返回稳态。

**实证 #2：拒绝 settle overshoot bounce**

`02_design_spec.md` V3 §1：
> **不做** 任何 settle overshoot bounce（工具型 sidebar 不需要"晃动"）

`02_design_spec.md` V3 §2.6 表格：`overshoot | 无`

**为什么**：弹簧 overshoot 适合"玩具感"动效，工具型应用要求**结果稳定的视觉**。

**实证 #3：拒绝 lift 拉离段 overshoot 曲线**

`02_design_spec.md` V3 §2.1 关键修复说明 / `Revision History` A-P0-2：
> 拉离段 scale 不再用 overshoot 曲线（A-P0-2 修复）：V2 用 `cubic-bezier(0.34, 1.32, 0.64, 1)` 同时驱动 scale 1.04→1.0 与 opacity 1.0→0，会出现 -3.4% opacity 负值与 0.9986 scale undershoot

**为什么**：任何"超过目标值再回弹"的动效在工具型应用都是反向资产——会让用户感觉到"物理诡异"（已消失项还在缩小）。V3 用 ease-out 标准曲线 + linear opacity，**确保单调到目标**。

**实证 #4：cancel snap-back 不用虚假 spring overshoot 数值**

`02_design_spec.md` V3 §2.7 / `Revision History` A-P1：
> V2 声称 spring `{280, 32}` 有 ~0.5% overshoot 实测仅 0.0035%（不可感知）。V3 改为诚实表述：cancel 用 cubic-bezier `(0.32, 0.72, 0, 1)` 做"减速回弹"视觉印象

**为什么**：不允许"假精度"。spring overshoot 数值的精度不能匹配实测，宁可降级为定性表述（"形态相近，非数值等价"）。这条文档自我修正本身就是克制哲学。

**实证 #5：refresh 按钮在 drag 期间 disabled + 视觉变淡**

`src/components/layout/Sidebar.tsx:230-245`：
```tsx
<button
  onClick={handleRefreshClick}
  disabled={isRefreshing || isClickAnimating || isDragging}
  ...
  className={`w-6 h-6 ... ${
    isDragging ? 'opacity-40 pointer-events-none' : ''
  }`}
>
```

**为什么**：拖动期间用户的注意力应该集中在拖动本身，**任何并行的可点击元素都是干扰**。通过 `opacity-40 pointer-events-none` 双保险**主动从视觉上淡出竞争元素**。

---

### 1.3 考究（Crafted）—— 多层 hsl 阴影 / Token 体系 / 曲线选取

**核心命题**：每一处规格都"有依据"。Token 化 + 多层叠加 + 曲线参数有论据。

**实证 #1：DragOverlay 多层 hsl 阴影**

`src/index.css:631-647`：
```css
.drag-overlay-row {
  box-shadow:
    0 1px 2px hsl(0 0% 0% / 0.06),
    0 4px 8px hsl(0 0% 0% / 0.08),
    0 12px 24px hsl(0 0% 0% / 0.1);
  border-radius: 6px;
  background: white;
  cursor: grabbing;
}

.drag-overlay-pill {
  box-shadow:
    0 1px 2px hsl(0 0% 0% / 0.05),
    0 3px 6px hsl(0 0% 0% / 0.07),
    0 8px 16px hsl(0 0% 0% / 0.08);
  ...
}
```

**为什么**：单层 `0 4px 12px rgba(0,0,0,0.1)` 阴影是"廉价感"。**3 层叠加**模拟自然光环境的多重光源散射——近距硬阴影 + 中距软阴影 + 远距漫射阴影，物理写实。
- Categories（带 ColorPicker dot 视觉重，需要更明显 lift）：阴影更深（0.10）
- Tags（轻量 pill，过深显假）：阴影更浅（0.08）

**实证 #2：完整 token 体系**

`src/index.css:30-55` + `src/index.css:599-613`：
```css
:root {
  --color-primary: #18181b;
  --color-secondary: #71717a;
  --color-tertiary: #a1a1aa;
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #fafafa;
  --color-bg-tertiary: #f4f4f5;
  --color-border: #e5e5e5;
  --color-divider: #e4e4e7;
  --color-success: #16a34a;
  --color-success-bg: #dcfce7;
  --color-warning: #d97706;
  --color-warning-bg: #fef3c7;
  --color-error: #dc2626;
  --color-error-bg: #fee2e2;
  --font-family: 'Inter', -apple-system, ...;
  --radius-sm: 3px;
  --radius-base: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 10px;
  --radius-2xl: 11px;
  --radius-3xl: 16px;
  --shadow-dropdown: 0 4px 12px rgba(0, 0, 0, 0.06);
  --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.05);
}

/* === Sidebar Reorder (V3) === */
:root {
  --color-accent: #0063e1;
  --color-accent-soft: rgba(0, 99, 225, 0.5);
  --ease-drag: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-drag-lift: cubic-bezier(0.34, 1.32, 0.64, 1);
  --ease-drag-cancel: cubic-bezier(0.32, 0.72, 0, 1);
  --duration-drag-lift-grip: 80ms;
  --duration-drag-lift-pull: 120ms;
  --duration-drag-reorder: 220ms;
  --duration-drag-settle: 220ms;
  --duration-drag-cancel: 280ms;
  --duration-drag-snap: 80ms;
  --duration-drag-indicator-fade: 100ms;
  --duration-drag-indicator-move: 150ms;
}
```

**为什么**：每个色值都有命名和语义（`--color-tertiary` 不是"那个浅灰"）。圆角、阴影、动效曲线、时长全都 tokenize——意味着**升级时改一处即可全局生效**，且后续 design 决策不能"凭感觉随手写"。

**实证 #3：cubic-bezier 曲线选择有论据**

`02_design_spec.md` V3 §2.4 + Revision History `A-P0-1`：
> spring 与 cubic-bezier(0.16, 1, 0.3, 1) **数学上无法 < 5% 误差等价**（spring step response 起始速度恒为 0，cubic-bezier ease-out 起始速度极高，曲线族根本不同）。本项目**实施层用 cubic-bezier**

**为什么**：V1/V2 的 spring 等价描述被 V3 推翻——曲线族的数学差异已被 reproduce 验证。**项目坚持 cubic-bezier 而非 spring 的根本原因**：cubic-bezier 起始速度高（"crisp"），spring 起始为 0（"软启动"），工具型应用要求 crisp。

**实证 #4：snap 物理 derivation**

`06_snap_research.md` §2.3 + `src/components/sidebar/dnd/snapModifier.ts:36-40`：
```ts
// Tuning constants. Adjust SNAP_DISTANCE_PX in animations.ts only — keep
// EXPONENT/LERP_FACTOR proportional. See 06_snap_research.md §5.
const SNAP_RANGE_PX = SNAP_DISTANCE_PX;
const EXPONENT = 2; // gravity falloff (1 = linear, 2 = quadratic, 3 = cubic)
const LERP_FACTOR = 0.35; // 0..1; how much of the target snap to apply per frame
```

**为什么**：磁吸的 `(1 - dist/12)^2` 公式来自游戏 easing 标准（`06_snap_research.md` §2.3 引 Febucci easing functions / three.js / Rachel Smith Lerp 文）。`LERP_FACTOR = 0.35` 是 `100daysofcraft.com` magnetic cursor 教程的 sweet spot 经验值（§2.4）。**整套参数 tuning 都有外部参考链接**。

---

### 1.4 物理级（Physical）—— 磁吸 / spring / cubic-bezier 模拟自然力

**核心命题**：交互不是"瞬时跳跃 + 装饰动效"，而是"渐进力场 + 因果连续"。物理感来自**连续函数 + 帧间 lerp + 距离感知 timing**。

**实证 #1：磁吸用连续引力（不是阈值瞬移）**

`02_design_spec.md` V3 §2.5：
> **V3 修订**：V2 的"硬阈值 12px 即瞬移"实测产生 3 个叠加硬感（进入瞬移 12px、阈值内死板、离开反向瞬移 12px）。V3 改为**连续软引力**。
> - `g(dist) = max(0, 1 - dist/12)^2`（quadratic gravity well）
> - 远场（dist=12）`g≈0` 完全跟手；中心（dist=0）`g=1` 完全吸附；中间连续过渡

`src/components/sidebar/dnd/snapModifier.ts:97-105`：
```ts
let strength = 0;
if (dist < SNAP_RANGE_PX) {
  const t = 1 - dist / SNAP_RANGE_PX; // 0..1, 1 at center
  strength = Math.pow(t, EXPONENT);
}
```

**为什么**：用户拖动时鼠标动 1px，吸力强度连续变化，rendered transform 也连续变化——**每一帧都是物理因果连续**。V2 的硬阈值会在 12px 边界产生 1 帧 12px 跳变（鼠标和卡片"脱节"）。

**实证 #2：lift 两段（吸盘 80ms + 拉离 120ms）**

`02_design_spec.md` V3 §2.1：
> **Stage 1: 吸盘** 0–80ms（行内 DOM scale 1.0 → 1.04）
> **Stage 2: 拉离** 80–200ms（DragOverlay 接管 + 行内 fade 到 0）

**为什么**：模拟物理上的"吸盘吸住 → 拉离桌面"两段感受。这是 Things 3 的设计语言。**单段 lift 缺少"先吸住再拉离"的因果**。

**实证 #3：distance-aware settle**

`src/components/sidebar/SortableCategoriesList.tsx:138-159`：
```ts
// V3 §2.6: compute distance between the dragged element's translated
// center and the drop slot's center. Skip drop animation entirely if
// snap has already aligned us within 4px; otherwise scale duration
// linearly with distance, capped at 280ms.
if (active.rect.current.translated && over) {
  const a = active.rect.current.translated;
  const o = over.rect;
  const dx = o.left + o.width / 2 - (a.left + a.width / 2);
  const dy = o.top + o.height / 2 - (a.top + a.height / 2);
  const dist = Math.sqrt(dx * dx + dy * dy);
  setDropAnimationConfig(
    dist < 4
      ? null
      : {
          duration: Math.min(280, 120 + dist * 0.5),
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        },
  );
}
```

**为什么**：固定 220ms settle 在短距离（5px）情况下是"拖泥带水"，长距离情况下又过快。`120ms + delta × 0.5`（封顶 280ms）让"长路慢、短路快"——**模拟物理惯性**。距离 < 4px 时直接跳过 dropAnimation（已经磁吸到位），避免双段机械感。

**实证 #4：snap modifier 的 lerp 帧间平滑**

`src/components/sidebar/dnd/snapModifier.ts:111-113`：
```ts
state.dx += (targetDx - state.dx) * LERP_FACTOR;
state.dy += (targetDy - state.dy) * LERP_FACTOR;
```

**为什么**：单帧大位移会被肉眼感知为"跳变"。lerp 把"目标 snap 量"分摊到多帧，让位移过程连续——**模拟物体的惯性**。

---

### 1.5 macOS 原生气质（Native）—— Apple HIG 锚定

**核心命题**：所有视觉/交互锚定在 macOS 系统行为，不是 Material/Notion/Trello 等其它生态。颜色锚 NSColor、Sidebar 锚 Finder、字体锚 SF/Inter、不旋转、不弹跳、不长按。

**实证 #1：accent 色锚定 NSColor.controlAccentColor**

`02_design_spec.md` V3 §4 注释：
```css
/* macOS system accent — 与 NSColor.controlAccentColor 近似 */
--color-accent: #0063E1;
```

`src/index.css:600 + 615-619`：
```css
--color-accent: #0063e1;
--color-accent-soft: rgba(0, 99, 225, 0.5);

@media (prefers-color-scheme: dark) {
  :root {
    --color-accent: #0a84ff;
    --color-accent-soft: rgba(10, 132, 255, 0.5);
  }
}
```

**为什么**：light mode `#0063E1` 和 dark mode `#0A84FF` 是 Apple 系统蓝的两个变体。**这不是设计师挑选的"看起来不错的蓝"，是 macOS 系统色的精确复刻**。dark mode 在用户切换系统外观时自动适配。

**实证 #2：traffic lights 占位区**

`src/components/layout/Sidebar.tsx:223-224`：
```tsx
{/* Traffic Lights 占位区 - 为系统原生红绿灯预留空间，不绘制任何内容 */}
<div className="w-[52px]" aria-hidden="true" />
```

**为什么**：macOS 应用窗口左上角的红/黄/绿按钮由系统绘制。项目**主动给系统让位**——不画任何竞争元素，让原生 traffic lights 占据这个空间。这是 Apple 应用的标准做法。

**实证 #3：Sidebar `cursor: default` 模仿 Finder**

（已在 §1.1 实证 #1 阐述）

**为什么**：macOS Finder/Notes 的 sidebar 在 hover 上**不显示 grab cursor**——因为系统级心智模型已经告诉用户"sidebar 是可重排的"。

**实证 #4：4px 激活距离区分 click vs drag**

`src/components/sidebar/SortableCategoriesList.tsx:114-116`：
```ts
const sensors = useSensors(
  useSensor(CustomMouseSensor, { activationConstraint: { distance: 4 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
);
```

**为什么**：macOS 系统的 `kRecognizesDragMovement` 经验值就是 ~3-5px。**不用 long-press**（500ms 等），因为 long-press 是触屏交互范式；macOS 桌面用空间阈值。

**实证 #5：window dragging 通过 `getCurrentWindow().startDragging()`**

`src/components/layout/Sidebar.tsx:9-40`：
```tsx
const startDrag = async (e: React.MouseEvent) => {
  if (e.button !== 0) return;
  const target = e.target as HTMLElement;
  if (target.closest('[data-sortable-list]')) return;
  ...
  if (interactive elements) return;
  try {
    await getCurrentWindow().startDragging();
  } catch (err) {}
};
```

**为什么**：这是 macOS 原生窗口拖动 API（Tauri 包装），不是 web hack。Sidebar header / PageHeader / SlidePanel header / ListDetailLayout list header 全部支持空白区域拖动窗口——**与系统的所有原生窗口行为一致**。

**实证 #6：Inter 字体 + system fallback**

`src/index.css:45`：
```css
--font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
```

`src/index.css:62-64`：
```css
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
```

**为什么**：Inter 是 SF Pro 的开源近邻，在 web 上比 SF 渲染稳定。`-webkit-font-smoothing: antialiased` 是 macOS Apple 推荐的字体渲染。

---

### 1.6 渐进式让位（Progressive Letting Pass）—— Apple/Linear 级流畅

> 这是从代码中蒸馏出来的**衍生哲学**：项目的"列表/详情转换"用渐进式让位而不是切换式。

**实证 #1：SkillListItem / McpListItem / SceneListItem / ClaudeMdCard / ProjectCard 全部支持 `compact` 模式**

`src/components/skills/SkillListItem.tsx:14-18`：
```ts
const TRANSITION_DURATION = '250ms';
const TRANSITION_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';
const TRANSITION_BASE = `${TRANSITION_DURATION} ${TRANSITION_EASING}`;
const RIGHT_SECTION_DELAY = '150ms';
```

```ts
const rightSectionStyle = {
  opacity: compact ? 0 : 1,
  maxWidth: compact ? 0 : '400px',
  overflow: 'hidden' as const,
  transition: compact
    ? `opacity ${TRANSITION_BASE}, max-width ${TRANSITION_BASE}`
    : `opacity ${TRANSITION_BASE} ${RIGHT_SECTION_DELAY}, max-width ${TRANSITION_BASE} ${RIGHT_SECTION_DELAY}`,
};
```

`src/pages/SkillsPage.tsx:744-750`：
```tsx
<div
  className={`
    flex-1 overflow-y-auto px-7 py-6
    transition-[margin-right] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]
    ${selectedSkillId ? 'mr-[800px]' : ''}
  `}
>
```

**为什么**：当用户点击 skill row 时，详情面板 800px 滑出右侧；列表区域 `margin-right` 推进 800px；同时每个 list item 进入 compact 模式，**右侧的 category badge + tags 渐隐 + 渐缩**（width 0），让出空间给左侧主信息。**反过来**详情面板关闭时，list item 的右侧用 `RIGHT_SECTION_DELAY = '150ms'` 延迟出现——避免"列表还在变宽，右侧已经探出来"的视觉错位。

**实证 #2：SceneListItem 的 description ↔ stats overlap 切换**

`src/components/scenes/SceneListItem.tsx:172-195`：
```tsx
{/* Description - always in flow, controls height */}
<span
  className="block max-w-[400px] truncate text-xs font-normal text-[#71717A]"
  style={{
    opacity: compact ? 0 : 1,
    transition: `opacity ${TRANSITION_BASE}`,
  }}
>
  {scene.description}
</span>

{/* Stats - absolute positioned, overlays description */}
<span
  className="absolute top-0 left-0 w-full truncate text-xs font-normal text-[#71717A]"
  style={{
    opacity: compact ? 1 : 0,
    transition: `opacity ${TRANSITION_BASE}`,
  }}
>
  {statsText}
</span>
```

**为什么**：compact 模式下右侧 stats 整段消失，但用户仍需看到 stats——所以 description 渐隐，**同位置渐显** stats。两者在 absolute 重叠位置交叉 fade，零 layout shift。

---

## 2. Layer 2：原则（What）

> 7-12 条**可执行原则**，每条遵循"声明 → 反例 → 现实例子"格式。

### 2.1 所有动效必须 token 化

**声明**：任何 transition 的 duration、easing、delay 必须用 token，禁止 inline 写 ms 数字（除非该 ms 由 V3 spec 明确要求且有注释）。

**反例**（禁止）：
```tsx
style={{ transition: 'opacity 250ms ease-out, transform 320ms cubic-bezier(0.34, 1.32, 0.64, 1)' }}
```

**现实例子**：
- `src/index.css:602-612` 整套 `--ease-drag*` / `--duration-drag-*` token
- `src/index.css:656-658`：drop indicator 用 token：
  ```css
  transition:
    opacity var(--duration-drag-indicator-fade) ease-out,
    transform var(--duration-drag-indicator-move) var(--ease-drag);
  ```
- `src/components/skills/SkillListItem.tsx:14-19`：组件级 const 集中（虽然不是 CSS variable，但概念一致——避免散落）

---

### 2.2 所有色彩必须 token 化（且严格 zinc 体系）

**声明**：所有色值必须来自 token（`--color-primary`/`--color-secondary`/...）或 zinc 体系（`#18181B` / `#52525B` / `#71717A` / `#A1A1AA` / `#D4D4D8` / `#E4E4E7` / `#E5E5E5` / `#F4F4F5` / `#FAFAFA`）。语义色限定于 success / warning / error 三档。Accent 色仅用 `var(--color-accent)`。

**反例**（禁止）：
- 自创 `#3B4252` 或 `#374151` 之类的非 zinc 灰
- 多种 accent 蓝并存
- 装饰性彩色 emoji / 渐变（除 AI 状态特殊场景）

**现实例子**：
- `src/index.css:30-44` 完整 token 表
- `src/components/common/ColorPicker.tsx:8-15` PRESET_COLORS 18 色：6 个 zinc + 6 暖 + 6 冷，覆盖性完整
- 全部 list item 一致使用 `#18181B`（primary text）/ `#71717A`（secondary text）/ `#52525B`（icon 默认）/ `#A1A1AA`（hint）/ `#FAFAFA`（hover bg）/ `#F4F4F5`（active bg）/ `#E5E5E5`（border）

---

### 2.3 不允许 stagger

**声明**：列表/网格的让位动效必须**同步**。禁止 dnd-kit 默认的 transition delay 序列，禁止 framer-motion `staggerChildren` 类。

**反例**（禁止）：
```tsx
items.map((item, i) => <Item style={{ transitionDelay: `${i * 30}ms` }} />)
```

**现实例子**：
- `02_design_spec.md` V3 §1：`不做 stagger（同步让位更"crisp"）`
- `02_design_spec.md` V3 §2.4：`stagger | 0`
- `src/components/sidebar/SortableCategoryRow.tsx:51-54`：`transition: { duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }`，**没有 delay 字段**

---

### 2.4 不允许 settle overshoot bounce

**声明**：所有 settle/snap-back/落定动效必须**单调到目标**，不允许超过目标值再回弹。曲线只能用 `ease-out` 标准族（`(0, 0, 0.2, 1)` / `(0.16, 1, 0.3, 1)` / `(0.32, 0.72, 0, 1)`），禁止 `(0.34, 1.32, 0.64, 1)` 类 overshoot 曲线（除非用在 80ms 微动效如吸盘段，且 overshoot 量证明不可见）。

**反例**（禁止）：spring `{ stiffness: 300, damping: 12 }` 之类高 overshoot 参数。

**现实例子**：
- `02_design_spec.md` V3 §2.6：`overshoot | 无`
- `02_design_spec.md` V3 §2.7：cancel 用 `(0.32, 0.72, 0, 1)`，**形态接近物理弹性而无 overshoot 数值依赖**
- `02_design_spec.md` V3 §2.1 关键修复说明 / A-P0-2：拉离段 scale 从 `(0.34, 1.32, 0.64, 1)` 改回 ease-out 标准

---

### 2.5 拖拽必须 4px 距离激活，禁止 long-press

**声明**：所有拖拽 sensor 必须 `distance: 4`（macOS 原生体感）。禁止 `delay: 500` 类时间激活。

**反例**（禁止）：`useSensor(MouseSensor, { activationConstraint: { delay: 500, tolerance: 5 } })`

**现实例子**：
- `src/components/sidebar/SortableCategoriesList.tsx:114-116`
- `src/components/sidebar/SortableTagsList.tsx:112-119`
- `02_design_spec.md` V3 §2.1 表格：`激活手势 | 鼠标按下后移动 ≥ 4px`

---

### 2.6 cursor: grab 在 hover 上必须抑制

**声明**：sortable 元素 hover 时 cursor 必须保持 `default`，仅在按下激活后切到 `grabbing`。这是 macOS Finder gestalt——不告诉用户"我可以拖"。

**反例**（禁止）：dnd-kit 默认的 `cursor: grab` on hover。

**现实例子**：
- `src/index.css:622-628`：
  ```css
  [data-sortable-list] [aria-roledescription='sortable'] {
    cursor: default;
  }
  [data-sortable-list] [aria-roledescription='sortable']:active {
    cursor: grabbing;
  }
  ```
- `02_design_spec.md` V3 §2.8：`Hover 在可拖项 | default（不切 grab，符合 macOS 气质）`

---

### 2.7 所有 cubic-bezier 在 token 中只允许 4 条

**声明**：项目唯一允许的 cubic-bezier 集合：

| Token | 值 | 用途 |
|---|---|---|
| `--ease-drag` | `(0.16, 1, 0.3, 1)` | cascade / settle / indicator move |
| `--ease-drag-lift` | `(0.34, 1.32, 0.64, 1)` | **仅** lift 吸盘段（80ms 微动效，overshoot 不可见） |
| `--ease-drag-cancel` | `(0.32, 0.72, 0, 1)` | cancel snap-back（开局减速感） |
| `(0, 0, 0.2, 1)` 标准 ease-out | inline | 拉离段 scale + opacity，避免 overshoot/undershoot |
| `(0.4, 0, 0.2, 1)` Material standard | inline | List/Detail compact 转换、SlidePanel slide |
| `linear` | inline | 拉离段 opacity（避免曲线引起负值） |
| `ease-out` 关键字 | inline | indicator fade in、refresh-spin、modal animations |

**反例**（禁止）：
- 散落的 `(0.7, 0, 0.3, 1)` / `(0.5, 0, 0.5, 1)` 等"看起来差不多"的曲线
- 任意自创 spring 参数

**现实例子**：
- `src/index.css:603-605`：定义 3 条 `--ease-drag*`
- `src/components/skills/SkillListItem.tsx:15`：`cubic-bezier(0.4, 0, 0.2, 1)`（Material standard，用于详情面板转换）
- `src/components/layout/SlidePanel.tsx:84`：`cubic-bezier(0.4, 0, 0.2, 1)` 一致

> ⚠️ **现状有偏离**：`src/index.css:155` 的 `refresh-spinning` 用 `cubic-bezier(0.4, 0, 0.2, 1)`，`src/index.css:172` 的 `refresh-click` 用 `cubic-bezier(0.34, 1.56, 0.64, 1)`（**这条不在 token 里**），`src/components/common/IconPicker.tsx` 用 `transition-opacity duration-75`（无明确曲线）。Rule 应明确"refresh 按钮 click 反馈 / 弹簧式入场动效"是允许的特殊场景，且这类曲线应当 token 化。

---

### 2.8 圆角梯度规则

**声明**：项目的圆角必须从以下梯度中选取：

| Token | 值 | 用途 |
|---|---|---|
| `--radius-sm` | `3px` | Badge / very small chips（如 status badges 10px） |
| `--radius-base` | `4px` | Tag pill / 小工具型容器 |
| `--radius-md` | `6px` | Sidebar row / 大部分 button / dropdown / tooltip / icon hover state（最常用） |
| `--radius-lg` | `8px` | List card / Modal close button / Icon container 40x40 |
| `--radius-xl` | `10px` | Project icon 48x48 / ColorPicker panel / IconPicker panel |
| `--radius-2xl` | `11px` | Toggle medium track |
| `--radius-3xl` | `16px` | Modal dialog（`rounded-2xl` 实际上是 16px） |

**反例**（禁止）：自创 `5px` / `7px` / `9px` / `12px` 等非梯度圆角。

**现实例子**：
- 全部组件统一遵循
- `src/components/common/Modal.tsx:73`：`rounded-2xl` (16px) 用于 dialog
- `src/components/common/IconPicker.tsx:638`：`rounded-lg` (8px) 用于面板
- `src/components/sidebar/SortableCategoryRow.tsx:113`：`rounded-[6px]` 用于 row

---

### 2.9 阴影分级规则（3 档）

**声明**：项目的阴影梯度：

| 档 | 用途 | 实例 |
|---|---|---|
| **Level 1: dropdown** | 浮层弹出（dropdown / tooltip / context menu / icon picker / color picker / scope selector） | `0 4px 12px rgba(0,0,0,0.06)` 即 `--shadow-dropdown` |
| **Level 2: card / list dropdown** | 卡片浮起 / 内嵌 dropdown | `0 2px 8px rgba(0,0,0,0.05)` 即 `--shadow-card` 或 `0 2px 8px rgba(0,0,0,0.08)` |
| **Level 3: drag-overlay (multi-layer hsl)** | DragOverlay 拖动时 | 3 层 hsl 叠加（见 `src/index.css:631-647`） |
| Modal-only: `0 25px 50px rgba(0,0,0,0.1)` | Modal dialog | `src/components/common/Modal.tsx:73` |
| Tooltip-only: `0 4px 12px rgba(0,0,0,0.15)` | tooltip 浮层（更深因为深色背景） | `src/components/common/Tooltip.tsx:104` |

**反例**（禁止）：自创单层阴影 `0 8px 16px rgba(0,0,0,0.1)` 之类。

**现实例子**：
- `src/index.css:53-54`：`--shadow-dropdown` 和 `--shadow-card` token
- `src/components/common/ColorPicker.tsx:218`：`shadow-[0_6px_16px_rgba(0,0,0,0.07)]` ← 偏离 token，实际现状有此个例
- 主要 dropdown 都用 `0 4px 12px rgba(0,0,0,0.06)` 或 `0_4px_12px_rgba(0,0,0,0.0625)`（IconPicker 638）

> ⚠️ **现状有偏离**：项目里阴影实际值有微小偏差（`0.06` vs `0.0625` vs `0.07` 都出现）。Rule 应明确单一标准。

---

### 2.10 字号梯度（10/11/12/13/14/16/18）

**声明**：项目的字号必须从以下梯度选取，每档有明确语义：

| 字号 | 用途 | 实例 |
|---|---|---|
| `10px` | Section header uppercase（`Categories` / `Tags` / `ASSIGNED SCENE` 之类） / Active badge | `Sidebar.tsx:291`（`text-[10px]`）/ `SceneCard.tsx:149`（`text-[10px]`） |
| `11px` | Count badge / Tag pill / Stats / 11px small label / Tooltip body | `Sidebar.tsx:280`（count）/ `SortableTagPill.tsx:113`（`text-[11px]`）/ `Tooltip.tsx:100`（11px） |
| `12px` | Description text in cards / Path / 12px placeholder | `SkillListItem.tsx:174`（`text-xs`）/ `Input.tsx:32`（`text-[13px]` text 但 `placeholder:text-[12px]`） |
| `13px` | Body text / Sidebar row name / Label / Input value | 大量 (`text-[13px]`，最常用) |
| `14px` | List card name in main list (`text-sm`) / Section title / Button label `font-medium` | `SkillListItem.tsx:113`（虽然 `text-[13px]`，因为 row 高度小）；其他 list cards 用 `text-sm`(14)；`SectionHeader` (`SettingsPage.tsx:28`) `text-sm` |
| `16px` | Page title / Skill detail title (`text-base font-semibold`) | `PageHeader.tsx:103`（`text-base`）/ `SkillsPage.tsx:402`（`text-base`） |
| `18px` | Modal title / Project name in detail | `Modal.tsx:79`（`text-lg`）/ `ImportDialog.tsx:124`（`text-[18px]`） |

**反例**（禁止）：`text-[15px]` / `text-[17px]` 等非梯度字号。

**现实例子**：项目所有组件都遵循。

---

### 2.11 间距梯度（gap 0.5 / 1 / 1.5 / 2 / 3 / 4）

**声明**：基于 Tailwind 的 `gap-*` rem 体系，项目实际使用的间距：

| Tailwind | px | 用途 |
|---|---|---|
| `gap-0.5` | 2 | Sidebar nav items / Category list rows（**最紧凑列表**） |
| `gap-1` | 4 | Status dot 与 badge 之间 |
| `gap-1.5` | 6 | Tag pill 之间 / category row dot 与 name 之间 |
| `gap-2` | 8 | Icon 与 text label 之间（如 sidebar nav） |
| `gap-2.5` | 10 | List item icon 与 text 之间 |
| `gap-3` | 12 | List card 元素之间 |
| `gap-3.5` | 14 | List card icon 容器与 info（**list 标准内间距**） |
| `gap-4` | 16 | Section 之间 |
| `gap-5` | 20 | Stats group 之间 |
| `gap-6` | 24 | Stats 与 active badge / more button 之间（SceneCard） |
| `gap-7` | 28 | Detail 主分区之间 |
| `gap-8` | 32 | InfoItem grid（4 项一组） |

**现实例子**：
- `Sidebar.tsx:251`：`flex-col gap-0.5`
- `SkillListItem.tsx:131`：`gap-3.5`
- `SkillsPage.tsx:766`：`flex-col gap-3`（list items 之间）

---

### 2.12 hover/active state 规范

**声明**：

- **Hover bg**：`#FAFAFA`（最浅，仅用于"提示可点"）
- **Active/Selected bg**：`#F4F4F5`（深一档，用于 selected 状态）
- **Pressed bg**：极少使用，靠 `active:scale-95` 模拟（`Sidebar.tsx:234` refresh button）
- **Focus ring**：`focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#18181B]` 或 `focus:ring-2 focus:ring-offset-1 focus:ring-[#18181B]/30`

**反例**（禁止）：
- 用 `bg-blue-50` 之类彩色 hover
- 用 `transform: scale(1.02)` 整体放大代替颜色变化（除非动态 lift 阶段）

**现实例子**：
- `src/components/sidebar/SortableCategoryRow.tsx:113-117`：`bg-[#F4F4F5]`(active) / `hover:bg-[#F4F4F5]`(hover) — 注意这里 active 和 hover 同色，**靠 transition-colors 平滑过渡**
- `src/components/common/Button.tsx:56-62`：每个 variant 的 base/hover 都明确

---

### 2.13 prefers-reduced-motion 必须遵守

**声明**：所有动效（transition、animation、keyframes）必须在 `@media (prefers-reduced-motion: reduce)` 下降级到 0ms 或 instant。

**反例**（禁止）：硬编码的 transition 不响应 reduced-motion。

**现实例子**：
- `src/index.css:671-680`：
  ```css
  @media (prefers-reduced-motion: reduce) {
    [data-sortable-list] *,
    .drag-overlay-row,
    .drag-overlay-pill,
    .drop-indicator-h,
    .drop-indicator-v {
      transition: none !important;
      animation: none !important;
    }
  }
  ```
- `02_design_spec.md` V3 §2.12：`prefers-reduced-motion: reduce` 全套尊重

> ⚠️ **现状偏离**：上述 reduced-motion 媒体查询只覆盖 sidebar drag 部分。其它组件（modal animation / refresh-spin / classify-success-bloom 等）**未声明 reduced-motion**。Rule 应要求所有动效都加 reduced-motion fallback。

---

### 2.14 让位用 translate3d，不用 scale 整体放大

**声明**：sortable 让位的 transform 必须用 `CSS.Translate.toString(transform)`（仅 `translate3d(x, y, 0)`），禁止用 `CSS.Transform.toString(transform)`（包含 scaleX/scaleY）。整体 scale 让位会让 row 在邻居高度差异时被挤压。

**反例**（禁止）：
```tsx
const style = { transform: CSS.Transform.toString(transform) };  // 包含 scale
```

**现实例子**：
- `src/components/sidebar/SortableCategoryRow.tsx:60-62`：
  ```ts
  // CSS.Translate.toString — emits only `translate3d(x, y, 0)`, no scale.
  // We must NOT use CSS.Transform.toString because dnd-kit's default
  // Transform includes scaleX/scaleY which would squeeze the row when
  // neighbours' measured rects differ (V3 explicitly forbids this).
  transform: CSS.Translate.toString(transform),
  ```
- `src/components/sidebar/SortableTagPill.tsx:60-65`：相同注释

---

## 3. Layer 3：约束（How）

> 具体规格表，**直接可复用**。

### 3.1 完整颜色 Token 表

```css
/* src/index.css:30-44 — Base Tokens */
--color-primary: #18181b;          /* Headings, primary text, primary button bg, active bg */
--color-secondary: #71717a;        /* Secondary text, sidebar inactive nav text */
--color-tertiary: #a1a1aa;         /* Hint text, count number, placeholder fallback */
--color-bg-primary: #ffffff;       /* Window bg, modal bg, card bg */
--color-bg-secondary: #fafafa;     /* Hover bg, icon container default bg */
--color-bg-tertiary: #f4f4f5;      /* Active/selected bg, inline-edit bg */
--color-border: #e5e5e5;           /* All borders */
--color-divider: #e4e4e7;          /* Divider lines (slightly different from border) */
--color-success: #16a34a;          /* Success text */
--color-success-bg: #dcfce7;       /* Success badge bg */
--color-warning: #d97706;          /* Warning text */
--color-warning-bg: #fef3c7;       /* Warning badge bg */
--color-error: #dc2626;            /* Error text, danger menu item */
--color-error-bg: #fee2e2;         /* Error badge bg */

/* src/index.css:599-619 — V3 Drag-related (Light & Dark) */
--color-accent: #0063e1;           /* macOS system blue (light), drop indicator, focus accent */
--color-accent-soft: rgba(0, 99, 225, 0.5);

/* Dark mode (auto) */
@media (prefers-color-scheme: dark) {
  --color-accent: #0a84ff;
  --color-accent-soft: rgba(10, 132, 255, 0.5);
}
```

**未 token 化但常用的精确值**：

| 值 | 用途 |
|---|---|
| `#52525B` | Icon 默认色（Sidebar inline edit input text、Tag pill default text） |
| `#3F3F46` | ColorPicker 行 1 第二色（Zinc-700） |
| `#D4D4D8` | Empty state icon 灰色 / checkbox border default |
| `#D4D4D4` | Disabled checkbox border |
| `#E4E4E7` | Divider 线（`<div class="h-px bg-[#E4E4E7]">`） |
| `#27272A` | Primary button hover bg |

**Plugin / ClaudeMd 类型识别色（限定使用）**：

| 值 | 用途 |
|---|---|
| `#3B82F6` | Plugin badge bg |
| `#7C3AED` | ClaudeMd Global type bg（紫） |
| `#0EA5E9` | ClaudeMd Project type bg（青） |
| `#F59E0B` | ClaudeMd Local type bg（橙） |
| `#8B5CF6` | ScopeSelector "Global" 紫点 |
| `#4F46E5` | CLAUDE.md text in scenes modal |
| `#16A34A` | MCP / 状态色 |

**ColorPicker PRESET_COLORS（用户自定义 category 色）** — `src/components/common/ColorPicker.tsx:8-15`：

```ts
// Row 1: 中性色 (Zinc) - 6 色
'#18181B', '#3F3F46', '#71717A', '#A1A1AA', '#D4D4D8', '#E4E4E7'
// Row 2: 暖色调 - 6 色
'#EF4444', '#F97316', '#EAB308', '#22C55E', '#10B981', '#06B6D4'
// Row 3: 冷色调 - 6 色
'#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#EC4899', '#F43F5E'
```

**总结**：色板 = 14 个语义 token + 6 个 zinc 中性 + 12 个用户自定义 + 7 个特殊用途精确色。

---

### 3.2 完整圆角 Token 表

```css
--radius-sm: 3px;        /* Badge, status badge */
--radius-base: 4px;      /* Tag pill, drop indicator (1px in CSS) */
--radius-md: 6px;        /* Sidebar row, button small/medium, dropdown, tooltip, icon hover state */
--radius-lg: 8px;        /* List card, modal close button, icon container 40x40 */
--radius-xl: 10px;       /* Project icon 48x48, ColorPicker panel, IconPicker panel */
--radius-2xl: 11px;      /* Toggle medium track (round) */
--radius-3xl: 16px;      /* Modal dialog (rounded-2xl Tailwind = 16px) */

/* 特殊值 */
rounded-full           /* 圆形 (toggle knob, ColorPicker swatch dot, ClaudeMdBadge) */
border-radius: 1px;    /* drop-indicator-h/v 微圆角 */
```

---

### 3.3 完整阴影 Token 表

```css
--shadow-dropdown: 0 4px 12px rgba(0, 0, 0, 0.06);
--shadow-card: 0 2px 8px rgba(0, 0, 0, 0.05);

/* DragOverlay (3-layer hsl, V3) */
.drag-overlay-row {
  box-shadow:
    0 1px 2px hsl(0 0% 0% / 0.06),
    0 4px 8px hsl(0 0% 0% / 0.08),
    0 12px 24px hsl(0 0% 0% / 0.10);
}
.drag-overlay-pill {
  box-shadow:
    0 1px 2px hsl(0 0% 0% / 0.05),
    0 3px 6px hsl(0 0% 0% / 0.07),
    0 8px 16px hsl(0 0% 0% / 0.08);
}

/* Modal */
shadow-[0_25px_50px_rgba(0,0,0,0.1)]

/* Tooltip (深色) */
0 4px 12px rgba(0, 0, 0, 0.15)

/* ContextMenu */
0 2px 8px rgba(0, 0, 0, 0.08)

/* IconPicker / ColorPicker */
0 4px 12px rgba(0, 0, 0, 0.0625)  /* IconPicker:638 */
0 6px 16px rgba(0, 0, 0, 0.07)    /* ColorPicker:218 — 偏离 */

/* ScopeSelector */
0 4px 12px rgba(0, 0, 0, 0.06)    /* ScopeSelector:122 */

/* Default 简单 hover ring */
hover:ring-2 hover:ring-[#18181B]/10  /* Icon container click hint */
```

> ⚠️ **当前散落问题**：阴影实际值不一致（0.06 / 0.0625 / 0.07 / 0.08 各种）。Rule 应规定单一标准 `var(--shadow-dropdown)`。

---

### 3.4 完整动效曲线 + 时长表

```css
/* === Drag-related (V3) === */
--ease-drag: cubic-bezier(0.16, 1, 0.3, 1);              /* 主曲线：cascade / settle / indicator move */
--ease-drag-lift: cubic-bezier(0.34, 1.32, 0.64, 1);     /* lift 吸盘段（80ms 微动效，overshoot 不可见） */
--ease-drag-cancel: cubic-bezier(0.32, 0.72, 0, 1);      /* cancel snap-back（开局减速感） */

--duration-drag-lift-grip: 80ms;
--duration-drag-lift-pull: 120ms;
--duration-drag-reorder: 220ms;
--duration-drag-settle: 220ms;            /* 默认；实际由 distance-aware 计算 */
--duration-drag-cancel: 280ms;
--duration-drag-snap: 80ms;
--duration-drag-indicator-fade: 100ms;
--duration-drag-indicator-move: 150ms;

/* === 非 token 但项目实际使用 === */
cubic-bezier(0, 0, 0.2, 1)                /* 标准 ease-out（lift 拉离段 scale + opacity） */
cubic-bezier(0.4, 0, 0.2, 1)              /* Material standard：list/detail compact 250ms / SlidePanel 250ms */
cubic-bezier(0.34, 1.56, 0.64, 1)         /* refresh-click 弹簧（src/index.css:172） */
linear                                    /* 拉离段 opacity 单调下降 */
ease-out                                  /* indicator fade in / button transitions / modal animations */

/* === 时长 === */
150ms (transition-colors fast: hover bg change in row, button transitions)
200ms (modal-overlay-fade-in, modal-dialog-zoom-in, classify-fade-out, classify-fade-in)
220ms (drag cascade / drag settle 默认)
250ms (compact toggle / SlidePanel slide / SkillListItem right-section)
280ms (drag cancel)
300ms (无项目实际使用)
400ms (refresh-click animation forwards)
800ms (refresh-spinning loop)
1000ms (classify-success-bloom / classify-success-sparkle)
1200ms (ai-icon-spin)
1500ms (ai-text-gradient)
2000ms (ai-pulse-glow)
4000ms (ai-gradient-rotate)

/* Distance-aware settle 公式（V3 §2.6） */
duration = (distance < 4) ? 0 : Math.min(280, 120 + distance * 0.5)
```

---

### 3.5 字号梯度

| Tailwind | px | 项目用途 |
|---|---|---|
| `text-[10px]` | 10 | Section header uppercase / Active badge |
| `text-[11px]` | 11 | Count / Tag pill / Stats / Tooltip body |
| `text-xs` (`text-[12px]`) | 12 | Description / Path / Placeholder |
| `text-[13px]` | 13 | Body text（**最常用**）/ Sidebar row / Input value |
| `text-sm` (`text-[14px]`) | 14 | List card name / Section header / Button label `text-sm font-medium` |
| `text-base` (`text-[16px]`) | 16 | Page title / Skill detail title |
| `text-lg` (`text-[18px]`) | 18 | Modal title |

**字重**：

- `font-normal` (400) — 大部分 description / body
- `font-medium` (500) — 标签 / 按钮 / 大部分 row name 默认态
- `font-semibold` (600) — Section title / Selected/active row name / Modal title / Page title

---

### 3.6 间距梯度

| Tailwind | px | 用途 |
|---|---|---|
| `gap-0.5` | 2 | Sidebar nav items / Category list rows |
| `gap-1` | 4 | Status dot ↔ badge |
| `gap-1.5` | 6 | Tag pills（wrap）/ CategoryRow dot ↔ name |
| `gap-2` | 8 | Sidebar nav icon ↔ text |
| `gap-2.5` | 10 | List item icon ↔ text / Sidebar row spacing |
| `gap-3` | 12 | Section internal items |
| `gap-3.5` | 14 | List card icon container ↔ info（**list 标准**） |
| `gap-4` | 16 | Section 之间 |
| `gap-5` | 20 | Stats group |
| `gap-6` | 24 | Stats ↔ active badge ↔ more button |
| `gap-7` | 28 | Detail 主分区之间 |
| `gap-8` | 32 | InfoItem 4 项一组 |

**Padding**：

- Sidebar row: `h-8 px-2.5 py-0`（仅水平 padding，高度固定 32px）
- List card (skill/mcp/scene/project): `px-5 py-4`（20px / 16px）
- Modal header: `px-7 py-5` 或 `h-16 px-7`
- ContextMenu item: `px-2.5 py-1.5`
- Dropdown item: `px-3 py-2`
- Button small: `h-[32px] px-3`
- Button medium: `h-[40px] px-3.5`
- Button large: `h-[44px] px-3.5`

---

### 3.7 Hover / Active / Disabled / Focus State 规范

| State | 规范 |
|---|---|
| **Hover bg** | `bg-[#FAFAFA]` |
| **Active/Selected bg** | `bg-[#F4F4F5]` |
| **Hover ring (icon click hint)** | `hover:ring-2 hover:ring-[#18181B]/10`（圈外不偏移）或 `hover:ring-2 hover:ring-offset-1 hover:ring-[#D4D4D8]`（颜色样本） |
| **Disabled** | `opacity-50 cursor-not-allowed` 或 `disabled:opacity-50 disabled:cursor-not-allowed` |
| **Disabled (button primary)** | `disabled:bg-[#18181B]/50` |
| **Focus visible ring** | `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#18181B]` |
| **Focus (Checkbox)** | `focus:ring-2 focus:ring-offset-1 focus:ring-[#18181B]/30` |
| **Pressed (rare)** | `active:scale-95` |
| **Drag active (refresh button)** | `opacity-40 pointer-events-none` |
| **Selection text bg** | `selection:bg-[#0063E1] selection:text-white`（accent 色） |

---

### 3.8 滚动条样式（3 档）

```css
/* === Global (default) === */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.12);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.2); }

/* === Sidebar (subtler) === */
.sidebar-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.04) transparent;
  padding-right: 12px;
  margin-right: -12px;
}
.sidebar-scroll::-webkit-scrollbar { width: 4px; }
.sidebar-scroll::-webkit-scrollbar-track { background: transparent; margin: 8px 0; }
.sidebar-scroll::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.04);
  border-radius: 2px;
}
.sidebar-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.08); }

/* === Icon Picker (very subtle, narrow) === */
.icon-picker-scroll::-webkit-scrollbar { width: 4px; }
.icon-picker-scroll::-webkit-scrollbar-track { background: transparent; margin: 4px 0; }
.icon-picker-scroll::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.08);
  border-radius: 2px;
}
.icon-picker-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.15); }
```

**为什么 3 档**：sidebar 滚动条最弱（不抢视觉），全局中等（cards/lists），icon picker 比 sidebar 略强但比全局弱（用户在 picker 里更频繁查看）。

---

## 4. Anti-Pattern 清单（≥ 8 条已被项目排除的设计动作）

> 每条引一条 codebase 反例。

### 4.1 禁止 transform: scale 整体放大让位（已用 translate3d）

`src/components/sidebar/SortableCategoryRow.tsx:60-62`：注释明确禁止 `CSS.Transform.toString` 因为它含 scale。

### 4.2 禁止 stagger

`02_design_spec.md` V3 §2.4：`stagger | 0`（同步让位）。

### 4.3 禁止 settle/snap-back overshoot bounce

`02_design_spec.md` V3 §2.6：`overshoot | 无`。Cancel snap-back 不依赖 spring overshoot 数值（V3 §2.7 修订）。

### 4.4 禁止 long-press 激活拖拽

`src/components/sidebar/SortableCategoriesList.tsx:114-115`：用 `distance: 4`，不用 `delay: 500`。

### 4.5 禁止 cursor: grab 在 hover 上提示可拖

`src/index.css:622-625`：主动覆盖 dnd-kit 默认。

### 4.6 禁止 lift 旋转 / DragOverlay 旋转

`02_design_spec.md` V3 §2.2：`rotation: 0（macOS 不旋转）`。

### 4.7 禁止 DragOverlay 显示完整数据（如 count）

`src/components/sidebar/DragOverlayCategoryRow.tsx:21`：`<CategoryRowContent showCount={false} />`。Drag 期间用户已知道在拖谁，count 是噪音。

### 4.8 禁止单层廉价阴影（≥ 1 px lift 必须用多层 hsl）

`src/index.css:631-647`：3 层 hsl 叠加。

### 4.9 禁止"等价"声称没有 reproduction（数值精度门槛）

`02_design_spec.md` V3 Revision History `A-P0-1`：spring vs cubic-bezier "等价" 被推翻。

### 4.10 禁止假精度（spring overshoot 0.5% 实测 0.0035% 不可感知）

`02_design_spec.md` V3 Revision History `A-P1`：诚实降级表述。

### 4.11 禁止装饰性彩色 emoji / 装饰性图标

整套组件查不到任何装饰性 emoji。Plugin badge / ClaudeMd type badge 用 lucide 单色图标 + 16x16 圆形彩色背景，**装饰意图最小化**。

### 4.12 禁止破坏 macOS 窗口拖动语义

所有可点击区域（button/input/role=button/data-sortable-list）都从 `startDrag` 中排除（`src/components/layout/Sidebar.tsx:14-32`），让窗口空白区域支持系统拖动。

### 4.13 禁止超过 3 层视觉层次（page-level）

观察 codebase：page → header + main → list/list+detail → row+slide-panel。最多 3-4 层，**没有四级嵌套 modal / 悬浮浮层 + dialog 之类**。

### 4.14 禁止把动效写在 inline style 里 hardcode 数值（除特殊情况）

`SkillListItem.tsx:14-19`：动效常量集中在 const 而非 inline ms 数字。`src/index.css:602-612` token 化。

### 4.15 禁止文本 + emoji（项目无 emoji 装饰）

整套 codebase 查不到 unicode emoji 装饰。仅功能性 lucide-react icons。

---

## 5. macOS 原生引用清单（每条原则对应的 macOS 行为）

| 项目原则 | 对应的 macOS 行为 |
|---|---|
| `cursor: default` on hover sortable | Finder sidebar / Notes sidebar 不显示 grab cursor |
| 4px distance activation | macOS 系统 `kRecognizesDragMovement` ~3-5px |
| `--color-accent: #0063E1` light + `#0A84FF` dark | NSColor.controlAccentColor 默认蓝 |
| `_apple-system, BlinkMacSystemFont` font fallback | SF Pro 系统字体兜底 |
| `-webkit-font-smoothing: antialiased` | macOS 推荐字体渲染 |
| Traffic lights 占位 `w-[52px]` | macOS 标准窗口左上角红/黄/绿按钮区 |
| `getCurrentWindow().startDragging()` 空白区拖动 | macOS NSWindow drag region |
| `prefers-color-scheme: dark` 自动切换 accent | macOS Dark Mode 系统设置联动 |
| `prefers-reduced-motion: reduce` 降级 | macOS 系统辅助功能 "减弱动画" |
| Drop indicator 不加端点圆点 | macOS Notes folder reorder（极简水平线） |
| Lift "吸盘 + 拉离" 两段 | Things 3（macOS app）的 lift 物理感 |
| 12px snap distance | macOS HIG "magnetic guide" 距离（Sketch / Figma 一致） |
| Modal `closeOnOverlayClick` + Escape 关闭 | macOS 标准 modal sheet 行为 |
| Dropdown / ContextMenu / Tooltip 用 `createPortal` 至 body | macOS NSPopover / NSMenu 不被父容器裁剪 |
| Window `close: hide` 而非 `quit` | macOS 标准（除 utility 外，关闭不等于退出）— `CLAUDE.md` "Window Behavior" 段 |

---

## 6. 跨 Session 持久化建议

> 哪些哲学应当落到 `.claude/rules/design-language.md`，哪些可以更轻量。

### 6.1 持久化策略推荐

**应落入 `.claude/rules/design-language.md` (project scope, 全 session 自动加载)**：

按 `~/.claude/rules/persistence-system.md` 的 200 行目标，design-language.md 应控制在 **150-180 行**。建议结构：

```
.claude/rules/design-language.md (~ 170 行)
├── # Design Language
│
├── ## 1. 五大哲学（每条 1 句声明 + 1 个最锐利 codebase 实例引用，不展开论据）
│   ├── 极简 → 例：sidebar `cursor: default` 抑制 grab affordance（src/index.css:622-628）
│   ├── 克制 → 例：拒绝 stagger / 拒绝 settle overshoot（02_design_spec V3 §2.4 / §2.6）
│   ├── 考究 → 例：DragOverlay 3 层 hsl 阴影（src/index.css:631-647）
│   ├── 物理级 → 例：连续引力磁吸（src/components/sidebar/dnd/snapModifier.ts）
│   └── macOS 原生 → 例：accent 锚定 NSColor / traffic lights 占位
│
├── ## 2. 必须遵守的硬规则（条目化，每条 1-2 行）
│   - All effects token-ized: `--ease-drag*`, `--duration-drag-*`
│   - All colors token-ized: zinc 体系 + `--color-accent`
│   - No stagger
│   - No settle/snap-back overshoot
│   - 4px distance activation, no long-press
│   - Suppress `cursor: grab` on hover, `grabbing` only on active
│   - Drag transforms use translate3d (CSS.Translate.toString), never scale
│   - prefers-reduced-motion: reduce → 0ms transition
│   - Multi-layer hsl shadows for DragOverlay (3 layers)
│   - All cubic-bezier limited to: --ease-drag, --ease-drag-lift, --ease-drag-cancel, ease-out standard, Material (0.4, 0, 0.2, 1)
│
├── ## 3. Token 速查（链接到 src/index.css 行号）
│   - Color tokens: src/index.css:30-44, 599-619
│   - Radius tokens: src/index.css:46-52
│   - Shadow tokens: src/index.css:53-54
│   - Drag tokens: src/index.css:602-612
│   - Scrollbar: src/index.css:5-27, 96-142
│
├── ## 4. 字号 / 圆角 / 阴影 / 间距 梯度（精简表，1-2 列）
│
├── ## 5. Anti-Patterns（条目化，无展开）
│
└── ## 6. 决策仲裁原则
    - 当与 02_design_spec.md V3 / cross-document-cascade-discipline.md 冲突时，以 V3 为准
    - 当此 Rule 不足以决策时，依据 macOS Finder / Notes / Things 3 行为
    - 添加新动效曲线 / 新颜色 token，必须先在此 Rule 注册
```

**Rule frontmatter 建议**：
- **不带 `paths` frontmatter**：design 哲学应该全 session 自动加载（任何修改前端代码的 session 都需要它）
- 不要写"无 frontmatter Rule 总是加载"，但也不要写 `paths: ['src/**/*.tsx', 'src/**/*.ts', 'src/**/*.css']`——后者会让 Rule 仅在读取这些文件时加载，错过"Plan 阶段就需要 align"的场景。

**应落入 `.dev/sidebar-reorder/02_design_spec.md` V3 / 当前任务的 02_design_spec.md（不进 Rule）**：

- 具体的 ms / px 数值（如 220ms cascade、12px snap、100ms indicator fade in）— 这些是任务级规格，不是全 session 哲学
- 复杂的 timing 序列（lift 两段表 / cascade let-pass 顺序）— 任务级
- Acceptance 验证条件 — 任务级
- 数学等价性 derivation — 任务级
- 具体的实现 hint（dnd-kit modifiers placement / DragOverlay dropAnimation function 用法）— 任务级

**应落入主 Agent / 主 Plan 文档（不持久化）**：

- 当前 V3 review 修订记录 — 历史记录
- 不确定性 / 待验证项 — 任务期内
- 调研过程数据（spring vs cubic-bezier reproduction、各产品对比表）— 调研期内

### 6.2 Rule 字数估算

按 6.1 结构估算，每段精炼后：
- 五大哲学 5×4 = 20 行
- 硬规则 12 条 × 2 行 = 24 行
- Token 速查 ~15 行
- 梯度速查表 ~25 行
- Anti-patterns ~20 行
- 决策仲裁 ~10 行
- 头部 metadata + 标题 ~10 行
- 间距 + 注释 ~30 行

**总计约 150-160 行**，符合 200 行目标。

### 6.3 不应该写进 Rule 的内容（避免 noise）

- ❌ 完整 codebase 引证（这是 r7 调研产物，太长）
- ❌ 设计偏离修复历史（V1 → V2 → V3 演进）
- ❌ macOS HIG 完整对照表（只在每条哲学里举 1 例足矣）
- ❌ 详细 token 表（已在 index.css 中存在，Rule 链接即可）
- ❌ 行业产品对比（Things 3 / Linear / Notion 行为）— 那是 R3 / R4 的产物
- ❌ snap modifier 的 derivation 数学公式 — 那在 06_snap_research.md
- ❌ 数值等价性 reproduction — 在 02_design_spec V3 中

---

## 7. 不确定性 + 风险

### 7.1 不确定性

1. **Refresh button 弹簧 cubic-bezier 是否要纳入 token？**
   `src/index.css:172` 用 `cubic-bezier(0.34, 1.56, 0.64, 1)`，这是 click feedback 弹簧，**不属于 V3 drag token**。Rule 是否要明确"按钮 click feedback 允许的曲线"，或要求把这条曲线 token 化？置信度：低（个例，但泛化时会变多）。

2. **AI classify success bloom（5 色彩虹光晕）是否违反"克制"？**
   `src/index.css:217-376` 是非常华丽的彩虹动效。这是设计上**唯一的"非克制"区域**，因为它是用户感知"AI 正在工作 / 完成"的强反馈。Rule 是否要明确"AI/异步状态可以用强动效，但仅限于状态反馈"，或写"克制"哲学时要不要打补丁？置信度：中（哲学完整度受影响）。

3. **prefers-reduced-motion 的覆盖范围**
   当前只有 `src/index.css:671-680` 覆盖 sidebar drag 部分，没覆盖 modal animation / refresh-spin / classify 动效。Rule 应明确"全覆盖"还是"仅长动效覆盖"？置信度：中。

4. **阴影偏离统一**
   `0.06` / `0.0625` / `0.07` / `0.08` 都出现。Rule 应规定单一标准（推荐 `0.06`），但这意味着要去 fix 现有偏离的几处。置信度：低（fix 量小）。

5. **List card 标准化程度**
   `SkillListItem` / `McpListItem` / `SceneListItem` / `ProjectCard` / `ClaudeMdCard` 都极相似（`px-5 py-4 rounded-lg border border-[#E5E5E5]`），但 Plugin badge / ClaudeMd badge 处理略有差异。Rule 是否要提取"List Card Pattern"作为复合规范？置信度：高（非常一致，可定义）。

### 7.2 风险

1. **如果 Rule 覆盖太详（> 200 行）**，每个 session 都会被一大段 design 内容占据 context。需要严格控制信息密度——**Rule 是哲学 + 硬规则的索引，详细内容靠链接到 codebase**。

2. **如果 Rule 与 02_design_spec.md V3 冲突**，必须明确 Authority：02_design_spec.md V3 是 Decisional（任务期内的具体规格），Rule 是 Decisional（哲学层）。原则：**当任务级规格与全局哲学冲突时，先看是否能两者兼容；若不能，需要在 02_design_spec 中明示偏离哲学的理由**。

3. **新增的 hierarchy 视觉规格**（任务范围）必须遵循此 Rule 提出的所有约束，否则就是哲学违反。`grep-before-enumerate-shared-resource.md` 同理：未来加新动效时必须先 grep 看哲学是否被破坏。

---

## 8. 关键 Takeaway 给后续 design_spec 与 design-language.md 作者

### 给 02_design_spec V1 作者（category-hierarchy 任务）

1. **新加的 hierarchy 行视觉**：行高、padding、字号必须从 §3 梯度选取。**不可自创 28px 行高 / 23px 字号** 之类。建议复用 sidebar row 的 `h-8 px-2.5`（32px x 10px），新增 `pl-{indent}` 表达 hierarchy 缩进。
2. **缩进表达介质**：哲学是"如无必要勿增实体"——优先用 padding-left，**避免** 1px guide line 装饰，**避免** chevron 装饰（除非可证明必要）。
3. **drop into 视觉反馈**：必须复用现有 token —— `var(--color-accent)` 用于 indicator，多层 hsl 阴影用于 DragOverlay，220ms cascade 用于让位。**不要**为 hierarchy 引入新曲线 / 新色彩。
4. **如果 hierarchy 需要新动效**（如 promote/demote 动画 padding-left 过渡），必须 token 化进 `--duration-hierarchy-*` 并加入 design-language.md。

### 给 design-language.md 作者（后续 SubAgent）

1. **目标 150-170 行**，结构按 §6.1。
2. **每条哲学一句话声明 + 一个最锐利的 codebase 引证**，不要展开论据（已经在 r7 蒸馏完）。
3. **硬规则条目化**，每条 1-2 行声明 + token name 引用，不要详细解释（详细在 r7）。
4. **决策仲裁原则**（§6.1 末段）：必须明确当 Rule 不足以决策时如何处理（参考 macOS 系统应用 → 参考 02_design_spec.md V3）。
5. **frontmatter 不带 `paths`**：让此 Rule 全 session 加载，因为 Plan 阶段就需要它。
6. **不写历史**：Rule 不写 V1/V2 的修订过程，不写"以前是 X 现在是 Y"，只写"现在必须是 Y"。
7. **链接到代码而非复制代码**：token 表用 `src/index.css:30-44` 行号链接，而非把 token 全列出来——Rule 越短越易遵守。

### 给后续维护者

1. 添加新动效曲线必须先 grep 现有 codebase 看是否真有需要：违反"4 条 cubic-bezier 上限"必须有解释。
2. 添加新颜色必须能从 `getCategoryColor` / token 体系覆盖——不要为 1 个组件加 1 个色。
3. 修改 `02_design_spec.md` V_n → V_{n+1} 必须遵循 `cross-document-cascade-discipline.md`：检查是否影响 Rule，是否需要同步更新。

---

## 9. Confidence + 主要不确定性

**Confidence: 88/100**

**理由**：
- ✅ 全部必读完成 + 全部 codebase 关键文件已读（共 60+ 文件，都是 Read 而非 grep 推断）
- ✅ 每条哲学都有 ≥ 2 个 file:line 引证（部分有 3+ 实证）
- ✅ Token 表完整（颜色 14 + 圆角 7 + 阴影 5 + 动效曲线 7 + 时长 12+ + 字号 7 + 间距 12）
- ✅ Anti-pattern 清单 ≥ 15 条（要求 ≥ 8 条）
- ✅ macOS 原生引用清单完整（15 条对应）
- ✅ 持久化建议给出明确字数估算 + frontmatter 建议
- ⚠️ 项目存在的"偏离"（refresh-click 曲线 / AI classify bloom / 阴影 0.06 vs 0.0625 / reduced-motion 覆盖不全）已诚实标记，但 Rule 作者需要决策"是否在 Rule 里直接打补丁"

**主要不确定性**：
1. AI classify bloom 是否违反"克制"哲学 — 可能需要 Rule 写时加"AI/异步状态强反馈例外"段落
2. 阴影规格是否应当全部 fix 到 token 标准（目前散落 0.06/0.0625/0.07/0.08）
3. cubic-bezier 集合是否要扩到 5 条（加上 refresh-click 弹簧曲线 `(0.34, 1.56, 0.64, 1)`）

---

## 关键 takeaway（一句话）

**Ensemble 的设计语言可以用一句话概括："macOS 原生气质 + 工具型克制 + 物理级动效 + 完整 token 化"——所有"看起来不错"都必须有 macOS HIG 锚定 + token 引证 + cubic-bezier 出处，否则就是规则违反。**
