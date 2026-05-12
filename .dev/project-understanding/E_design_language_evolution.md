# E. 设计语言与历史决策演进

> 来源：Explore Sonnet SubAgent E（2026-05-12）
> 覆盖：哲学 / Token / 硬约束 / 动效系统 / .dev 迭代地图 / 方法论 Rule / 品牌 / WIP / 改 UI 须知

## 1. 设计哲学 — 五大 Philosophy

来源：`.claude/rules/design-language.md:15-25`

### 1.1 Minimalism — "如无必要勿增实体"
每一个像素/线条/边框/过渡都必须回答"能删吗"。默认是删；增加需要理由。锚定点：sidebar 的 `cursor: default`（而不是 grab）——**refuse decorative affordance**，系统级心智模型已经暗示了可拖动性。

### 1.2 Restraint — 由"拒绝"定义
不旋转、不 stagger、不 overshoot bounce、不长按、不装饰 emoji、不 grab 光标、不 spring overshoot 精度声称。这些拒绝本身构成语言。

### 1.3 Crafted — 每个 spec 都有来源
没有 magic number。曲线/时长/圆角/阴影来自命名 token；token 来自外部参考（macOS HIG、NSColor、easing 文献）。DragOverlay 三层 hsl 叠加阴影，单层是 "cheap lift"。spring vs cubic-bezier 由**可复现性**决定，不由感觉决定。

### 1.4 Physical — 连续作用力，非离散跳变
磁吸是连续引力场 `(1 - dist/12)²`，而非二元阈值。settle 时长距离感知（`120 + Δ × 0.5`，封顶 280ms）。Lift 两段（吸盘 80ms → 拉离 120ms）模拟"先粘附手指，再剥离桌面"。每帧 lerp 保证运动与输入的因果连续。

### 1.5 macOS-native — 锚定系统
Accent color `#0063E1`（light）/ `#0A84FF`（dark）= **NSColor.controlAccentColor** 近似，不是"一个好看的蓝"。激活距离 4px 对齐 `kRecognizesDragMovement`。流量灯区 52px 占位不绘制。窗口拖动用 `getCurrentWindow().startDragging()`。字体回退链 `-apple-system, BlinkMacSystemFont`。

## 2. Design Token 体系

### 2.1 Color Tokens（`src/index.css:30-54`）

| Token | 值 | 用途 |
|---|---|---|
| `--color-primary` | `#18181B` | 主文字 |
| `--color-secondary` | `#71717A` | 次要文字 |
| `--color-tertiary` | `#A1A1AA` | 辅助/占位 |
| `--color-bg-primary` | `#FFFFFF` | 主背景 |
| `--color-bg-secondary` | `#FAFAFA` | 次背景/hover |
| `--color-bg-tertiary` | `#F4F4F5` | active/selected 背景 |
| `--color-border` | `#E5E5E5` | 边框 |
| `--color-divider` | `#E4E4E7` | 分隔线 |
| `--color-success(-bg)` | `#16A34A` / `#DCFCE7` | 成功 |
| `--color-warning(-bg)` | `#D97706` / `#FEF3C7` | 警告 |
| `--color-error(-bg)` | `#DC2626` / `#FEE2E2` | 错误 |
| `--color-accent` | `#0063E1` / `#0A84FF` | 拖拽指示线/焦点环/accent |
| `--color-accent-soft` | `rgba(0,99,225,0.5)` / `rgba(10,132,255,0.5)` | accent 柔化 |

**Zinc Palette（强制集合）**：`#18181B / #3F3F46 / #52525B / #71717A / #A1A1AA / #D4D4D8 / #E4E4E7 / #E5E5E5 / #F4F4F5 / #FAFAFA`。**任何自造灰色是违规**。

### 2.2 Easing Tokens（`src/index.css:614-616`）

| Token | 值 | 用途 |
|---|---|---|
| `--ease-drag` | `cubic-bezier(0.16, 1, 0.3, 1)` | cascade / settle / indicator |
| `--ease-drag-lift` | `cubic-bezier(0.34, 1.32, 0.64, 1)` | 吸盘段（≤80ms，亚像素 overshoot 不可感知） |
| `--ease-drag-cancel` | `cubic-bezier(0.32, 0.72, 0, 1)` | cancel snap-back |

**白名单内联 easing**：
- `cubic-bezier(0, 0, 0.2, 1)`：标准 ease-out，lift 拉离段 + DragOverlay drop fade
- `cubic-bezier(0.4, 0, 0.2, 1)`：Material standard，list↔detail / SlidePanel
- `linear`：lift opacity only
- `ease-out` keyword：indicator fade / button transitions

**Chevron 旋转**：`transition: transform 120ms var(--ease-drag)`（时长内联但曲线必须复用 `--ease-drag`）

### 2.3 Duration Tokens（`src/index.css:617-624`）

`--duration-drag-lift-grip` 80ms · `--duration-drag-lift-pull` 120ms · `--duration-drag-reorder` 220ms · `--duration-drag-settle` 220ms（实际按公式）· `--duration-drag-cancel` 280ms · `--duration-drag-snap` 80ms · `--duration-drag-indicator-fade` 100ms · `--duration-drag-indicator-move` 150ms

### 2.4 Radius Tokens（`src/index.css:46-52`）

`--radius-sm` 3 · `--radius-base` 4 · `--radius-md` 6 · `--radius-lg` 8 · `--radius-xl` 10 · `--radius-2xl` 11 · `--radius-3xl` 16

**禁止自造 5/7/9/12/14 px**。

### 2.5 Shadow Tokens

| 用途 | 值 |
|---|---|
| `--shadow-dropdown` | `0 4px 12px rgba(0,0,0,0.06)` |
| `--shadow-card` | `0 2px 8px rgba(0,0,0,0.05)` |
| DragOverlay row（3 层 hsl） | `0 1px 2px hsl(0 0% 0% / 0.06), 0 4px 8px hsl(0 0% 0% / 0.08), 0 12px 24px hsl(0 0% 0% / 0.10)` |
| DragOverlay pill（3 层 hsl） | `0 1px 2px hsl(0 0% 0% / 0.05), 0 3px 6px hsl(0 0% 0% / 0.07), 0 8px 16px hsl(0 0% 0% / 0.08)` |
| Modal | `0 25px 50px rgba(0,0,0,0.1)` |

### 2.6 Spacing Scale（Tailwind gap-*）

`0.5`(2) sidebar nav · `1`(4) dot↔badge · `1.5`(6) tag wrap · `2`(8) icon↔text · `2.5`(10) row 内部 · `3`(12) section 内部 · `3.5`(14) list-card · `4`(16) section 间 · `5,6,7,8`

**层级缩进**：parent row 基准 + `padding-left: depth × 16px`（唯一层级视觉差异）

### 2.7 Font Size & Weight

**字号（禁止自造 15/17px）**：10（大写 section header/active badge）· 11（count/tag pill/stats/tooltip）· 12（描述/路径/placeholder）· 13（body/sidebar row/input，最常用）· 14（list-card name/section title/button）· 16（page title/detail title）· 18（modal title）

**字重**：400（body）· 500（label/row name default）· 600（section title/selected row name/page/modal title）

## 3. 硬约束 — 改 UI 的不可越线清单（design-language.md:63-108）

1. **Animation tokens 强制**：所有 transition 必须引用 `--ease-drag*` / `--duration-drag-*` 或白名单
2. **Color tokens 强制**：所有颜色必须是 CSS variable 或 zinc/accent/status；`text-[#3B4252]` 违规
3. **No stagger**：`transitionDelay` 基于 index、`staggerChildren` 全部禁止；同步让位是设计语言
4. **No settle/snap-back overshoot**：settle/drop/cancel/indicator 必须单调收敛；overshoot 仅允许 ≤80ms 亚像素不可感知
5. **4 px distance activation，禁止长按**：`activationConstraint: { distance: 4 }`；`delay: 500` 是 touch 范式
6. **Suppress `cursor: grab` on hover**：sortable 悬停保持 `cursor: default`，仅 `:active` 切 `grabbing`
7. **Drag transform 只用 translate3d**：`CSS.Translate.toString` 而非 `CSS.Transform.toString`（后者含 scale 会挤压）
8. **DragOverlay 必须三层 hsl 阴影**：单层 `box-shadow: 0 4px 12px rgba(0,0,0,0.1)` 是 "cheap lift"
9. **prefers-reduced-motion 必须覆盖**：任何新动画加 `@media (prefers-reduced-motion: reduce)` fallback
10. **No decorative emoji / icons / gradient**：仅 `lucide-react`；装饰渐变仅 AI/async 反馈
11. **Visual hierarchy ≤ 3 层**：Page → header+main → list → row+slide-panel
12. **Hierarchy by position only**：父子关系只用 `padding-left: depth × 16px`。**禁止缩进引导线（`border-l`）、字重减弱、ColorPicker dot opacity < 1**
13. **Chevron 只能是真 `<button>` 元素**：`<div role="button">` 破坏 Tab order 和 aria-expanded
14. **DragOverlay 不显示 rotation / scale-up / count badge**：`showCount={false}` 是强制，`rotate(2deg)` 禁止

## 4. 关键动效系统 — Sidebar Reorder V3

来源：`.dev/sidebar-reorder/02_design_spec.md` V3 + `06_snap_research.md`

### 4.1 Lift 两段（"吸盘 + 拉离"）

**Stage 1 吸盘（0–80ms，行内 DOM）**：
- 主视觉是行内 DOM，DragOverlay 尚未挂载
- Categories: scale 1.0 → 1.04，ease-out 标准；opacity 保持 1.0
- Tags: scale 1.0 → 1.06

**t=80ms 切换**：DragOverlay 挂载，scale 1.05 + opacity 0 出现于指针位置

**Stage 2 拉离（80–200ms，DragOverlay 接管）**：
- 行内 DOM ≤ 16ms 淡出至 opacity 0
- DragOverlay: scale 1.05 → 1.03（ease-out 标准），opacity 0 → 0.95（linear）
- **scale 必须用 `cubic-bezier(0, 0, 0.2, 1)`**（无 undershoot），opacity 用 `linear`（避免负值）

V3 关键修复（A-P0-2）：V2 用 `cubic-bezier(0.34, 1.32, 0.64, 1)` 同时驱动 scale 和 opacity 导致 opacity 负值（-3.4%）和 scale undershoot（"已消失项还在缩小"）。V3 拆开。

### 4.2 DragOverlay 三层阴影

`src/index.css:642-660`，类名 `.drag-overlay-row` / `.drag-overlay-pill`。Drop 时加 `.is-dropping` className，CSS 120ms fade `box-shadow: none`。

### 4.3 磁吸 Continuous Force

`02_design_spec.md:2.5` + `06_snap_research.md §4.1`，实现 `src/components/sidebar/dnd/snapModifier.ts`

**作用半径**：`SNAP_RANGE_PX = 12`

**引力模型**（方案 E+C）：
```
g(dist) = max(0, 1 - dist/12)^2   // quadratic gravity well
state.dx += (targetDx - state.dx) * 0.35   // LERP_FACTOR
```

远场 g≈0 完全跟手；中心 g=1 完全吸附；**无阈值切换，无视觉跳变**。

V3 修复根因：V2 硬阈值 "dist ≤ 12 → 瞬移到中心" 产生 3 个叠加硬感（进入瞬移 12px、阈值内死板、离开反向瞬移 12px）。`06_snap_research.md §1.4` 核心发现：**`DragOverlay` 没有任何 "intrinsic CSS transition on transform"**——这是 snapModifier.ts 注释撒谎导致的 1.5h 返工（`verify-third-party-behavior-firsthand.md` Rule 的起源事件）。

**Hierarchy override（V2.2 D5）**：CHILD active 的 snap 强度设为 0（严格跟手），因 snap → collisionRect → closestCenter 形成反馈环（`core.esm.js:2984`）。ROOT active 完全保留 1.0。

### 4.4 Distance-Aware Settle

```
delta = |finalRect.center - DragOverlayRect.center|
if (delta < 4) settleDuration = 0   // 已磁吸，跳过 dropAnimation
else settleDuration = min(220, 100 + dist * 0.4)   // V2.3 D10 收紧
```

曲线：`cubic-bezier(0, 0, 0.2, 1)`（V2.3 D10 解决 V3 原曲线末段 38% 时长仅完成 1% 进度的"悬浮感"）。

## 5. `.dev/` 迭代历史地图

### sidebar-reorder
位置：`.dev/sidebar-reorder/` · 阶段：PRD → research → spec V3 → tech plan V3 → impl plan V3 → review + snap physics research · 状态：已完结（commit `17a2e62`）
**核心决策**：两段 lift、连续磁吸 (方案 E+C)、distance-aware settle、全套 CSS token、`cursor: default`、DragOverlay 三层 hsl、`--color-accent` token、dark mode 预留。**最高分辨率参考——整个项目设计语言的最完整活样本**。

### category-hierarchy
位置：`.dev/category-hierarchy/` · 阶段：00→01→02 V2.3→03/04/05 · 状态：已完结（commits `a4cdcf7` → `611c21c` → `7b90e76`，V2.1/V2.2/V2.3 三轮修复）
**V2.2 D1–D8 决策**：混合碰撞检测（`pointerWithin → closestCenter`）解决 snap 反馈环；child active 磁吸强度设 0（D5）；`getProjection` short-circuit；合并双 IPC 到 atomic store；5+29 新单测
**V2.3 D9–D12 决策**：DragOverlay 携带 pre-drag depth padding（D9）；drop 曲线改 std ease-out + 时长公式收紧（D10）；opacity/shadow 同步 fade（D11）；cross-depth padding 插值（D12 WAAPI keyframes）

### sidebar-hierarchy-fix
位置：`.dev/sidebar-hierarchy-fix/` · 阶段：00→01_research（r1-r3）→ 02_research（r4） · 状态：成果已合入 category-hierarchy V2.2/V2.3
**核心发现**：r2 `core.esm.js:2984` 一手证明 snap→collisionRect 反馈环；r4 数值分析证明 `cubic-bezier(0.16, 1, 0.3, 1)` @ 220ms 末段 38% 时长仅完成 1% 进度

### marketplace-prd
位置：`.dev/marketplace-prd/` · 阶段：PRD V1 → V2 + risk distillation + synthesis decisions · 状态：已完结
**核心决策**：Marketplace 独立 nav 分组；安装即接入 Ensemble 闭环（auto-classify + Scene）；V1 Out = Agent Marketplace / 用户上传 / 评分

### marketplace-impl
位置：`.dev/marketplace-impl/` · 阶段：00→01_research(R1-R4)→02_tech_spec→03_task_cards→04_log→05_review · 状态：已完结
**核心决策**：skills.sh 通过 internal API mirror（浏览器 network panel 调研→`validate-no-public-api-claim` Rule）；MCP 走 `registry.modelcontextprotocol.io`；codeload tarball 绕过 GitHub API 限速

### mcp-marketplace-impl
位置：`.dev/mcp-marketplace-impl/` · 阶段：PRD V1→V2→01_log · 状态：已完结
**V2 决策**：cursor-paginated realtime mirror 替代 V1 全量+24h cache；UX 镜像 Registry 网站（Previous/Next，无无限滚动）

### auto-classify-context-overflow
位置：`.dev/auto-classify-context-overflow/` · 阶段：research（04_metrics + 05_recommendation）→ 06_plan · 状态：**plan 完成，实施 pending**
**决策**：Strategy A（仅 description）—— token 从 ~210K 降至 ~22K；新增 `classify_model` 设置；autoClassify 加 `scopeFilter` 供 CategoryPage/TagPage

### mcp-detail-audit / skills-detail-audit
位置：`.dev/{mcp,skills}-detail-audit/` · 状态：工作目录 + 截图存在，实施 commit 已有 `05f1dc8`
**决策**：detail panel Scope/Source 分离（commit `31f8cc1`）；`de81e53` 移除 dead pages；`05f1dc8` chevron/dot/name/count 对齐（measurement 驱动）

### session-review
位置：`.dev/session-review/` · 状态：历史产物，含 auto-classify 不同策略实测截图

## 6. 方法论 Rule 总览（`.claude/rules/`）

| Rule 文件 | 约束内容 |
|---|---|
| `design-language.md` | 设计语言全体：哲学/token/constraints/anti-patterns |
| `measure-before-iterative-tuning.md` | **第一次 guess 失败后必须 measure**，禁止继续猜（DevTools / getBoundingClientRect / getComputedStyle） |
| `validate-numerical-equivalence-claims.md` | 声称两数值"等价"必须 reproduction 证明 RMSE<5%、max<10%。起源：spring vs cubic-bezier 虚假等价 2h 返工 |
| `verify-third-party-behavior-firsthand.md` | 引用第三方行为必须提供 `node_modules/...:<line>` 或 .d.ts。起源：snapModifier 注释谎言 1.5h 返工 |
| `cross-document-cascade-discipline.md` | 多 Decisional 文档修订后声明 cascade footprint；阶段前跑独立对齐 SubAgent |
| `plan-document-style.md` | 02 spec ≤ 1500 行，03 tech plan ≤ 1500 行，04 impl plan ≤ 800 行。不写代码示例 |
| `fix-must-define-user-observable-success.md` | fix 提交前写：用户动作/用户看到什么/用户不应再看到什么 |
| `grep-before-enumerate-shared-resource.md` | "对每个 X..."计划必先 grep 真实代码。双重 grep（canonical + 绕过路径） |
| `replace-installed-app-in-place.md` | 安装 .app 到 /Applications/ 原地覆盖，禁止时间戳备份 |
| `fallback-path-must-be-unreachable-in-test.md` | 测试路径不能触及 ~/.ensemble/，cfg(test) panic guard |
| `validate-curated-upstream-ids.md` | 静态 ids 列表每条必须实际验证（HTTP 200） |
| `validate-no-public-api-claim.md` | "上游无公开 API"必经浏览器 Network Panel 实测。起源：skills.sh 内部 API 发现 |

## 7. 品牌视觉 & 命名

### 字体栈（`src/index.css:45`）
```css
--font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
```
全局 `-webkit-font-smoothing: antialiased`，`-moz-osx-font-smoothing: grayscale`

### Accent Color
- Light: `#0063E1`（NSColor.controlAccentColor 近似）
- Dark: `#0A84FF`（iOS/macOS dark mode 系统蓝）

### Scrollbar
6×6px，thumb `rgba(0,0,0,0.12)` / hover `rgba(0,0,0,0.2)`，3px radius，track transparent

### 应用角色命名
- Production: `/Applications/Ensemble.app`
- Dev/Test: `/Applications/Ensemble Dev.app`（不同 CFBundleIdentifier）

### 交互状态颜色
- hover bg: `#FAFAFA`
- active/selected bg: `#F4F4F5`
- focus ring: `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#18181B]`
- drag-period sibling fade: `opacity-40 pointer-events-none`

## 8. 当前未结案 / WIP 议题

### 8.1 auto-classify-context-overflow — **实施 pending**
`06_plan.md` 写明 6 个并行任务（classifyModel 设置/dropdown、移除 instructions、三 store scopeFilter、CategoryPage/TagPage scope），但 git log 无对应 commit

### 8.2 mcp-detail-audit / skills-detail-audit — 截图阶段
工作目录 + 截图存在但无 design spec 文档；最新 commit `05f1dc8` 是该方向实施，但 audit 是否收口不确定

### 8.3 session-review — 结构存在但内容稀薄
01/02_working 仅有截图，无文字总结；auto-classify 策略对比实验截图

### 8.4 design-language.md 覆盖缺口
`design-language.md:51` 指出 `prefers-reduced-motion` 现有覆盖（`src/index.css:671-680`）是 sidebar-only。Marketplace / detail panels 的新 motion（modal/AI gradient）**可能尚未添加 reduced-motion fallback**

### 8.5 未来开放项
- Force Touch / 三指拖（V3 §2.13"本期不做"）
- autoClassify 父类感知 Path B（v2 候选）
- TagPage/CategoryPage scoped auto-classify（pending）
- Dark mode 全面适配（`--color-accent` dark token 已预留，但目前"只有 light 模式"）

## 9. 给主 Agent 的"非显然"建议

### 9.1 改 UI 时务必先读

1. **`.claude/rules/design-language.md`**（全文）—— 每次开始 visual/motion 工作都必须作为"唯一权威"重新读一遍
2. **`.dev/sidebar-reorder/02_design_spec.md` V3** —— 有新动效或拖拽时全文读完。"当 Rule 沉默时，回退到 sidebar-reorder V3"（design-language.md:122）
3. **`src/index.css`** —— 任何 color/easing/duration/radius/shadow 更改前先确认 token 是否已存在

### 9.2 绝对不能做

- spec 或 comment 写"X ≈ Y"（数值等价）而不 reproduce
- spec 写"库自动处理 X"而不附 `node_modules/...:<line>`
- 向已有颜色集合外的任何颜色（包括自造灰色）
- DragOverlay 加 rotation 或 count badge
- 层级关系加 border-left 缩进线

### 9.3 何时 measure-before-tune
第一次 guess 没达期望，准备"再试一个值"的那一刻——立刻停，改用 DevTools / `getBoundingClientRect` / `getComputedStyle` 或数据 logging 测量。`05f1dc8` 是依靠测量驱动的活样本。

### 9.4 何时 grep 蔓延
任何"对每个 X..."、"所有路径..."的语句，先 grep 真实代码。**双重 grep**（canonical API + 绕过路径）是标准操作。

### 9.5 跨文档修改的级联纪律
修改 02 spec 时必须在 Revision History 写明 cascade footprint（哪些 03/04 章节被影响）。cascade 的 grep 必须覆盖 `.md`、源码 doc comments、测试函数名。

### 9.6 Marketplace / Detail Panel 设计约束
Marketplace 实施全程严格遵守 design-language——不引入新 token/颜色/曲线。detail panels 的 Scope/Source 分离是 detail audit 的核心产出。

### 9.7 文档膨胀是 P0 信号
来自真实经历：category-hierarchy `03 V2` 写到 3602 行（2.4x 上限），SubAgent 跳读，6 个 reviewer 找到 22 P0——长 spec → 多 reviewer → 更多 P0 → spec 更长的正反馈循环。02/03 超 1500 行、04 超 800 行触发膨胀自检。

---

*主要引用*：.claude/rules/design-language.md, .claude/rules/measure-before-iterative-tuning.md, .claude/rules/validate-numerical-equivalence-claims.md, .claude/rules/verify-third-party-behavior-firsthand.md, src/index.css:1-100, :595-700, .dev/sidebar-reorder/{02_design_spec,06_snap_research}.md, .dev/category-hierarchy/{00_understanding,02_design_spec}.md, .dev/sidebar-hierarchy-fix/00_understanding.md, .dev/marketplace-{prd/03_PRD_v1,impl/README,mcp-marketplace-impl/01_implementation_log}.md, .dev/auto-classify-context-overflow/{05_recommendation,06_plan}.md
