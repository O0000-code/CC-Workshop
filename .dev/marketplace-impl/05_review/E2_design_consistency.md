# E2 — 设计一致性评审(视觉与动效)

> **评审角度**:Phase C UI 产物对 design-language Rule 与 Skills/MCP 视觉密度并排基线的符合度。
> **评审范围**:Sidebar Marketplace 段、SkillMarketplacePage、McpMarketplacePage、6 个新组件(MarketplaceListItem、MarketplaceCollisionModal、MarketplaceShortcutBanner + AddToSceneTriggerButton、AddToScenePopover、MarketplaceSourceBadge、SettingsPage Marketplace section)。
> **方法**:文件全文 Read + 关键 grep(hex token、cubic-bezier、stagger、reduced-motion);只读评审。
> **基线**:`.claude/rules/design-language.md` + `src/index.css`(行 30-55, 597-754)+ SkillsPage / SkillListItem 容器骨架。

---

## TL;DR

- **P0 = 3**:Badge `status` variant 作为中性灰使用导致 "Installed" + "stdio/HTTP" 全部渲染**绿底绿字**(D-12 / R2 §10.2 / D-language Rule 明确要求 zinc 系中性灰);自创 amber `#B45309` 在 stale-cache 文案;reduced-motion 覆盖严重欠缺,只覆盖 `[data-marketplace-shortcut-banner]`,MarketplaceListItem 的 5 处 inline transition / Modal `modal-overlay-animate` + `modal-dialog-animate` / Popover hover transition / onboarding banner transition / SlidePanel margin-right + transform 全部无 reduced-motion 兜底。
- **P1 = 6**:McpMarketplacePage 改用 inline className 替代 Badge tag/category variant 导致与 Skill 页跨页 inconsistency;McpMarketplacePage 详情 Install button 缺 Retry 分支(SkillMarketplacePage 有);CollisionModal 同时显示两个 primary 按钮反 macOS-native;Onboarding banner 与 ShortcutBanner 容器视觉一模一样导致信息层级模糊;McpMarketplacePage stale-cache 没视觉切换(Skill 切色 amber);Sidebar `<nav>` 同时 `aria-label` + `aria-labelledby` 冗余(后者优先,前者忽略)。
- **P2 = 5**:SkillMarketplagePage 与 McpMarketplagePage 各自定义同名 `formatRelativeTime` 助手但 thresholds 微差异;Marketplace 顶部段标题 `<h3 id="marketplace-section-label">` 用硬编码 ID(单实例 OK);Modal 全局 200ms `modal-*-animate` 动画自始无 reduced-motion 兜底(historical,Marketplace 是又一受害者);跨页 maxWidth 240px / 400px 是 spec 决策但 stdio badge 占用 ~52px 导致右段实际可用文字宽度仅 ~60px,popularity 数字 + Install button 必须挤压;ShortcutBanner 中段 2-3 个 BannerLink + 一个 Plus button 并列,文本 link 与按钮视觉权重不均(secondary button 比 text link 更醒目)。

**视觉关键测试**(用户原话:"Skills 列表与 Marketplace 列表并排,应该感觉是同一产品的两个区域"):
- **左段 / 容器** ✓:className 完全镜像、icon 容器 / name / description 字号字重 / `gap-3.5` / `rounded-lg border border-[#E5E5E5] px-5 py-4` 字面一致。
- **右段** ✗:Skill 右段是 `<Badge variant="category">` + `<TagsWithTooltip>`(中性灰底);Marketplace 右段第二个槽是 `<Badge variant="status">stdio</Badge>` 渲染**绿底绿字**(P0-1)。在并排视觉中右段色彩不一致是最显眼的语言断层 — 用户原话直接命中这一点。
- **行高 / 节奏** ✓:三个 compact 动效常量字面镜像、font-weight 切换 transition 同款。

并排视觉**整体可识别为同一产品两个区域**,但右段 status badge 绿色让 Marketplace 列表在视觉上与 Skill 列表"主色调"分离。这是阻断"同一产品"心智的硬违例。

---

## P0 — 硬约束违例 / 视觉断层

### P0-1 — Badge `status` variant 是绿色(`#DCFCE7` / `#16A34A`),被当作中性灰用

**违例位置**:
- `src/components/marketplace/MarketplaceListItem.tsx:172-178` — `<Badge variant="status" showDot={false}><Check className="h-3 w-3" />Installed</Badge>`
- `src/components/marketplace/MarketplaceListItem.tsx:294-298` — `<Badge variant="status" showDot={false}>{mcpType === 'stdio' ? 'stdio' : 'HTTP'}</Badge>`

**事实**:Badge.tsx:37 `status: 'bg-[#DCFCE7] text-[#16A34A] px-2 py-1 rounded gap-1 text-[11px] leading-none'` — Badge 组件 status variant 字面渲染绿底绿字(`#DCFCE7` 是 success-bg、`#16A34A` 是 success)。

**Spec / Rule 期望**:
- `02_tech_spec.md` §9 文案表 "stdio MCP button(installed without env): `Installed — needs setup`" + "Installed badge: `Installed`(Badge status variant + Check 12px icon)" — 指 Badge status 用作"已装"状态标记是合规的,但 D-12 / PRD §5.3 / R1 §通用组件清单"§Badge"显式写道"MCP 类型 stdio/HTTP badge → 用 status variant + 中性 zinc 色 override(D-12 决策),或新增 status 变体的 zinc 灰版本"。
- design-language Rule §Anti-patterns "Self-invented hex colors, radii, durations, or curves. Anything outside the documented sets above is forbidden — extend the Rule first, then use it." 反向推论 = 用现成 success 色把 stdio/HTTP 染绿同等违例(色与语义解耦)。

**用户感知**:列表向下滚一屏,所有"Installed"项 + 所有 stdio MCP + 所有 HTTP MCP 都是绿色,Skills 列表 / 详情 / 其他状态都不是绿色 — Marketplace 列表的视觉主色调与产品其他区域分离。绿色在 Ensemble 现有语言里是"async / AI 成功瞬态反馈"的瞬时色(`classify-success-bloom` / `Saved` 200ms 反馈),不是"持久态"的颜色。把绿色用在持久 badge = 误用语义。

**修复方向**(评审不修代码,仅指方向):
- (a) Badge 组件新增 `variant="neutral"` 或 `status-zinc` 灰版本(`bg-[#F4F4F5] text-[#52525B] gap-1 text-[11px]`,与 category variant 接近但无 dot/swatch),Marketplace 全量切换。
- (b) 或 MarketplaceListItem 直接 inline 中性 className(放弃 Badge 共用)。(b) 简单但跨组件 inconsistency 风险高。(a) 推荐。

---

### P0-2 — 自创 amber `#B45309` 在 SkillMarketplacePage stale-cache 文案

**违例位置**:`src/pages/SkillMarketplacePage.tsx:401-405`

```tsx
<span
  className={`text-[11px] ${
    staleCache ? 'text-[#B45309]' : 'text-[#A1A1AA]'
  }`}
>
  {lastSyncedHint}
</span>
```

**事实**:`#B45309` 是 amber-700,不在 design-language Rule §Constraints "Color tokens" 允许的 zinc / accent / status 集。design-language Rule §Anti-patterns 第 5 条 "Self-invented hex colors, radii, durations, or curves. Anything outside the documented sets above is forbidden — extend the Rule first, then use it."

**对比**:McpMarketplacePage:259-261 处理同语义只改文案(`Last synced ${ageHours}h ago (stale)`),不切色 — McpMarketplacePage 这条做法符合 Rule。两页不一致 + Skill 那边违例。

**修复方向**:删除 amber 切色,只用文案差异(McpMarketplacePage 模式)。或如果一定要视觉切换,用 `var(--color-warning)` (`#D97706`,已有 token)— 但 design-language 没把 warning 色登记成 caption 字号档使用,需扩 Rule。

---

### P0-3 — reduced-motion 覆盖严重欠缺

**Rule 要求**:design-language Rule "`prefers-reduced-motion: reduce` MUST be honored. Any new animation or transition needs a reduced-motion fallback degrading to instant."

**实施现状**(`src/index.css:748-754`):

```css
@media (prefers-reduced-motion: reduce) {
  [data-marketplace-shortcut-banner],
  [data-marketplace-shortcut-banner] * {
    transition: none !important;
    animation: none !important;
  }
}
```

只覆盖 ShortcutBanner。**未覆盖的 marketplace 引入 transition/animation**:

1. **MarketplaceListItem 的 5 处 inline transition**(`src/components/marketplace/MarketplaceListItem.tsx`):
   - :142-149 `rightSectionStyle.transition` — opacity + max-width(250ms cubic-bezier compact 折叠)
   - :242 row container `transition: background-color ${TRANSITION_BASE}`
   - :256 icon container `background-color, box-shadow`
   - :261 icon color
   - :271 name font-weight
   - 这些都需要在 `[data-marketplace-list-item]` 选择器下 reduced-motion 兜底。
2. **Modal 全局 `modal-overlay-animate` + `modal-dialog-animate`**(index.css:88-94, 200ms fade + zoom):MarketplaceCollisionModal 是新 Modal 实例,继承全局 Modal 动画,reduced-motion 没有兜底。这是 historical 问题,但 Marketplace 实施不在 reduced-motion 选择器中扩展承担覆盖责任也是问题。
3. **AddToScenePopover 的 hover transitions**(`src/components/marketplace/AddToScenePopover.tsx:280` `transition-colors`):没在 `[role="dialog"]` / data-attr selector 下兜底,实施日志承认"V1 trade-off"但实际 design-language Rule 是硬约束。
4. **Onboarding banner**(`src/pages/SkillMarketplacePage.tsx:376` close button `transition-colors` + `:354-358` 主区 `transition-[margin-right]`)— 主区 transition 是 SlidePanel 配套节奏的关键,reduced-motion 无兜底则 SlidePanel 滑入瞬间主区也会"闪缩",这是物理感断层。
5. **MarketplaceCollisionModal 的 inline transitions**(无显式 transition 属性,但 Modal overlay/dialog 动画继承)。
6. **McpMarketplacePage Refresh button 的 `Loader2 className="animate-spin"`**(:756 + SkillMarketplacePage:318/432)— `animate-spin` 是 Tailwind 类,reduced-motion 通过 Tailwind 的全局 `*` 选择器在 src/index.css 没显式定义。

**实施日志声明**(C2 完成日志):"本卡未引入新 transition / animation(所有过渡都来自现有组件 — SlidePanel 自带 250ms,主区 mr- 用 inline transition class,Onboarding banner 是静态 layout 无 transition)" — 这是不准确的,onboarding banner close button 有 `transition-colors`,主区 wrapper 有 `transition-[margin-right] duration-[250ms]` 也是 transition。

**修复方向**:`src/index.css:748-754` 的 `@media (prefers-reduced-motion: reduce)` block 扩展选择器到:
```css
@media (prefers-reduced-motion: reduce) {
  [data-marketplace-shortcut-banner],
  [data-marketplace-shortcut-banner] *,
  [data-marketplace-list-item],
  [data-marketplace-list-item] *,
  [data-marketplace-onboarding-banner],
  [data-marketplace-onboarding-banner] *,
  .modal-overlay-animate,
  .modal-dialog-animate {
    transition: none !important;
    animation: none !important;
  }
}
```
(McpMarketplacePage / SkillMarketplacePage 主区 wrapper 也需加 `data-*` 选择器,详情面板 SlidePanel transition 在 SlidePanel 组件层级 — historical,但加 marketplace 时是修补的合理时机。)

---

## P1 — 细节视觉精度差 / 跨页 inconsistency

### P1-1 — McpMarketplacePage 用 inline className 替代 Badge tag/category variant,SkillMarketplacePage 用 Badge

**违例位置 vs 对比**:
- SkillMarketplacePage:676-695 — `<Badge variant="category">{c}</Badge>` + `<Badge variant="tag">{t}</Badge>`(✓ 复用通用 Badge)
- McpMarketplacePage:632-657 — `<span className="rounded-md border border-[#E5E5E5] px-2 py-0.5 text-[11px] font-medium text-[#52525B]">{c}</span>`(自定义 inline,不用 Badge)

**问题**:同一语义("upstream Categories / Tags")在两个 Marketplace 页面的视觉**完全不同**:
- Skill 页 Badge category = `bg-[#F4F4F5] text-[#52525B] px-2 py-[3px] rounded-[3px] gap-1.5 text-[11px]`
- Skill 页 Badge tag = `bg-[#FAFAFA] text-[#71717A] border border-[#E5E5E5] px-2 py-[3px] rounded-[3px] text-[11px] font-medium`
- MCP 页 inline = `border border-[#E5E5E5] px-2 py-0.5 rounded-md text-[#52525B] text-[11px] font-medium`(无 bg、text-[#52525B] 不区分 category/tag、`rounded-md=6px` 不是 Badge `rounded-[3px]`、`py-0.5=2px` 不是 Badge `py-[3px]`)

**修复方向**:McpMarketplacePage:632-657 改用 `<Badge variant="category">{c}</Badge>` / `<Badge variant="tag">{t}</Badge>`。简单 1:1 替换。

---

### P1-2 — McpMarketplacePage 详情 Install button 缺 Retry 失败分支

**违例位置**:`src/pages/McpMarketplacePage.tsx:415-446` `detailHeaderRight`

**事实**:McpMarketplacePage 的 detailHeaderRight 三态:
- `isCurrentInstalled === true` → `Installed` chip + AddToSceneTriggerButton
- 否则 → `<Button variant="primary">Install</Button>`(disabled 仅靠 `isLoadingMcps`)

但 SkillMarketplacePage:594-606 在 isInstalled === false 分支检查 `installFailure` → 显示 `<Button>Retry</Button>` + `title={installFailure.error}`。

**问题**:用户在 MCP 详情面板 Install 失败后(installFailedItems 写入)button 文案不变 `Install`,只有 row 内 button 走 Retry 路径(MarketplaceListItem 内部正确处理)。详情面板 vs 列表行 Install 状态不同步 → 同一资源同一态在两处 UI 显示不同。

**修复方向**:McpMarketplacePage detailHeaderRight 添加 Retry 分支(镜像 SkillMarketplacePage:594-606)。

---

### P1-3 — CollisionModal 两个 primary button 并列违反 macOS-native 模式

**违例位置**:`src/components/marketplace/MarketplaceCollisionModal.tsx:222-256`

**事实**:hasLocal + hasTrashed 情形下渲染 [Cancel(secondary)][Replace existing(primary)][Restore from Trash(primary)]。

**问题**:macOS Native AlertDialog(Apple HIG)常见模式 = 一个 primary(默认/safe action)+ 一个 secondary(取消/次要)+ 可选 destructive(红色 / pull-quote)。两个 primary 并列 = 两个深底白字按钮挨在一起 — 用户视觉上无法判断哪个是默认聚焦的(focus ring 只有 keyboard 时才出现,鼠标用户看不出哪个是"默认")。

**对比**:macOS Finder 删除文件碰撞时是 `[Cancel] [Replace]` (Cancel secondary, Replace primary) 或 `[Don't Replace] [Replace]`(两个 secondary 中一个加 destructive 红 — 让 Replace 视觉上明显是 destructive)。

**Spec 期望**:02_tech_spec §9 文案表 + R3-P1-4 "按钮档位:`Replace existing` 用 Button primary、`Restore from Trash` 与 `Cancel` 用 secondary;默认焦点在 Cancel" — **Spec 写的是 Restore secondary**,但实施日志(C5)说 "default focus Restore (least surprise)" 配 primary variant — 实施偏离 spec 文案表。

**修复方向**:Restore button 改 `variant="secondary"` 或加 `<Badge>Recommended</Badge>` 视觉权重。或采用 macOS HIG 模式:Replace 改 `variant="danger"`(destructive 红边框)+ Restore 是唯一 primary + Cancel secondary。具体取舍由后续 spec 阶段。

---

### P1-4 — Onboarding banner 与 ShortcutBanner 容器视觉一模一样

**违例位置**:
- SkillMarketplacePage:362-382 onboarding `bg-[#FAFAFA] border border-[#E5E5E5] rounded-lg px-4 py-3` + Sparkles icon + 一句文案 + × 关闭
- MarketplaceShortcutBanner:139 `bg-[#FAFAFA] border border-[#E5E5E5] rounded-lg px-4 py-3` + Check icon + 文案 + 链接 + × 关闭

**问题**:两个 banner 容器 className 字面一致,但语义优先级完全不同:
- Onboarding = "新手提示 / 可有可无"(信息层级低)
- Shortcut = "刚装完资源 / 引导后续"(信息层级高,有时间窗口)

用户首次访问 Marketplace 装一个 skill 时,两个 banner**同时**出现在主区顶部(onboarding 在列表上方 mb-5,shortcut 在 layout 内 main `<Outlet />` 之前) — 视觉权重一致 → 用户分不清"哪个该先看"。

**对比**:macOS Finder 升级后会显示一个**蓝边 / 浅蓝底**的 alert banner(`info`),与下方的常规白底列表区分;这是 Apple HIG "alert vs note" 视觉差异。Ensemble 没有这套差异,但应至少让两个 banner 视觉重量分级。

**修复方向**:
- Onboarding 用更轻的容器(无 border、`bg-[#FAFAFA]` 占位整行 + 内层"hint"性文字小字号);或纯 inline hint 不加容器。
- 或 ShortcutBanner 加左侧 accent bar(`border-l-4 border-l-[var(--color-accent)]`)区分。

---

### P1-5 — McpMarketplacePage stale-cache 没视觉切换

**对比**:
- SkillMarketplacePage:401-405 stale 时切色 `text-[#B45309]`(虽是 P0-2 违例,但有视觉切换意图)
- McpMarketplacePage:259-261 stale 时只改文案 `Last synced ${ageHours}h ago (stale)`,文字色不变 `text-[#A1A1AA]`

**问题**:两页对同语义"stale cache"的视觉处理不一致。McpMarketplagePage 改文案 + 不切色 — 用户扫一眼看不到 cache 是 stale 的视觉锚点(11px 灰字加括号副词需要二读)。

**修复方向**:统一处理。两页都用 design-language token 内的颜色(如 `--color-warning #D97706` 但需要 Rule 扩展登记)或都改成纯文案差异(McpMarketplacePage 当前模式但视觉权重不足)。最稳妥:文案改为 `Last synced 36h ago — refresh recommended` + 配 `RotateCw` icon → Refresh button (邻接),让"陈旧度"的视觉锚点是 Refresh button 自身的高亮态(disabled when fresh,enabled & 略 highlight when stale)。

---

### P1-6 — Sidebar `<nav>` 同时 `aria-label` + `aria-labelledby` 冗余

**违例位置**:`src/components/layout/Sidebar.tsx:312-315`

```tsx
<nav
  aria-label="Marketplace"
  aria-labelledby="marketplace-section-label"
  className="flex flex-col flex-shrink-0"
>
```

**事实**:ARIA 规范明确 `aria-labelledby` 优先级高于 `aria-label`。两者同时存在时 `aria-label` 被忽略 — 这是 ARIA Best Practices 反例(WAI-ARIA Recommendation 4.1.2 "name must come from one source")。

**对比**:Sidebar 现有 NAVIGATION 段(`Sidebar.tsx:365`)是裸 `<nav className="flex flex-col gap-0.5 flex-shrink-0">`,无 aria-label 也无 aria-labelledby — 两段 ARIA 规格不一致。

**修复方向**:删除 `aria-label="Marketplace"`,保留 `aria-labelledby="marketplace-section-label"`。或两者都删,沿用 NAVIGATION 段裸 `<nav>` 模式。

---

## P2 — 文案微调 / 命名建议

### P2-1 — `formatRelativeTime` 在两文件各自定义,thresholds 微差异

- SkillMarketplacePage:68-89 — `< 1min "Just now"` / `< 60min "Xm ago"` / `< 24h "Xh ago"` / `< 30d "Xd ago"` / locale string
- McpMarketplacePage:79-92 — `< 60min "Xm ago"` / `< 24h "Xh ago"` / `< 7d "Xd ago"` / `formatDate`(MMM d, yyyy)

两套 helper threshold 不同 → 同一 ISO 时间字符串在 Skill 详情显示 `8d ago`、在 MCP 详情显示 `Aug 1, 2026`。命名建议:抽到 `src/utils/formatTime.ts` 共享,统一阈值。

### P2-2 — Marketplace 段标题 `<h3 id="marketplace-section-label">` 硬编码 ID

实际 Sidebar 是单实例(MainLayout 渲染一次),硬编码 ID 不冲突。但与 codebase 其他地方使用 `useId()`(如 MarketplaceCollisionModal:74-76)的模式不一致。低优 backlog 改 `useId()` 即可。

### P2-3 — Modal 全局 `modal-overlay-animate` / `modal-dialog-animate` 200ms 无 reduced-motion 兜底

P0-3 提到。这是 historical 问题(Modal 是项目老组件),Marketplace 引入 MarketplaceCollisionModal 是又一受害者。修复时机随 P0-3 一并处理(在 reduced-motion 选择器扩展时把这两个 class 也加上)。

### P2-4 — MarketplaceListItem 右段 maxWidth=240px 在 stdio MCP 实际可用宽度紧

McpListItem.tsx 用 maxWidth=300px 是 MCP 列表的现有基线。Marketplace MCP 列表 maxWidth=240px(spec / R2 §3.2 决策)— 但右段实际包含 popularity(数字 +/- 50px)+ stdio Badge(~42px)+ Install button(~74px)+ gap-2.5×2(20px) ≈ 186-210px,接近上限。stars 大数(`10,000`)tabular-nums 后 popularity 字段会撑到 60-65px,超出 maxWidth → 触发右段 overflow:hidden 截断。

修复方向:或扩大到 280px,或缩 popularity 字段(去 toLocaleString 改 `1.2k` 简写)。

### P2-5 — ShortcutBanner 中段 BannerLink 视觉权重不均

`MarketplaceShortcutBanner.tsx:153-181`:`<BannerLink>` 是 inline button 但视觉是文本链接(13px font-medium underline-on-hover);`Add to Scene...` 是 secondary Button(h-32px 加 border + bg)。三个并列时 Button 比两个 BannerLink 视觉权重明显高 → "Add to Scene..." 抢了 "View in Skills →" 与 "Add to active Scene: Foo →" 的视觉锚点。

修复方向:`Add to Scene...` 也用 BannerLink 风格(text + Plus icon inline);或所有三个都用 secondary Button。

---

## 视觉密度并排比对结果

| 维度 | Skills 列表(SkillListItem) | Marketplace 列表(MarketplaceListItem) | 一致性 |
|---|---|---|---|
| 容器 className | `flex w-full items-center justify-between rounded-lg border border-[#E5E5E5] px-5 py-4` | 同款字面一致 | ✓ |
| 行高 / padding | `px-5 py-4` + icon h-10 ⇒ ~72px | 同款 | ✓ |
| left section gap | `gap-3.5` | `gap-3.5` | ✓ |
| icon container | `h-10 w-10 rounded-lg` + bg #F4F4F5/#FAFAFA | 同款 | ✓ |
| icon size / color | `h-5 w-5` + `text-[#18181B]/[#52525B]` | 同款 | ✓ |
| name 字号字重 | `text-[13px] font-medium`/`font-semibold` + transition | 同款 | ✓ |
| description | `text-xs font-normal text-[#71717A] truncate max-w-[600px]` | 同款 | ✓ |
| 右段 maxWidth | 400px(Skill)/ 300px(MCP)| 240px(R2 §3.2 spec) | spec 决策,接受 |
| 右段 transition | 250ms cubic-bezier(0.4,0,0.2,1) collapse 即时 / expand 150ms 延迟 | 字面镜像 | ✓ |
| **右段 badge 颜色** | category #F4F4F5/#52525B(中性灰)+ tag #FAFAFA/#71717A(灰底浅灰边) | **status #DCFCE7/#16A34A(绿底绿字)** | ✗ **P0-1 违例** |
| selected font-weight 切换 | `font-medium → font-semibold` 250ms transition | 同款 | ✓ |
| hover bg | `bg-[#FAFAFA]` | 同款 | ✓ |
| selected bg | `bg-[#FAFAFA]` | 同款 | ✓ |
| icon container selected bg | `bg-[#F4F4F5]` | 同款 | ✓ |
| Plugin badge | left icon corner 16×16 蓝点 + Puzzle | **不显示**(D-9 / R-11 决策) | spec ✓ |
| More menu | 右端 32×32 button | **无**(R-19 决策) | spec ✓ |

**结论**:容器骨架与左段视觉密度**字面镜像 SkillListItem**,Skills + Marketplace 列表并排能够立即识别为"同一组件家族"。但右段 status badge 的绿色染色违反 design-language Rule 中性灰要求,是用户原话"应该感觉是同一产品的两个区域"的硬断层。修复 P0-1 后并排视觉一致性达标。

---

## SlidePanel 详情面板节奏 / 文案 / Install 控件

| 维度 | 期望(R2 §4.4 / Spec §10.3) | 实施 | 一致性 |
|---|---|---|---|
| SlidePanel width | 800 + 250ms cubic-bezier(0.4,0,0.2,1) | ✓ 两页都正确传 | ✓ |
| 主区右收 `mr-[800px]` | 同款 250ms cubic-bezier(0.4,0,0.2,1) | ✓ 两页同写 | ✓ |
| Header h-14 + px-7 + border-b #E5E5E5 | SlidePanel 自带 | ✓ | ✓ |
| Header 槽 icon 36×36 + name 16/600 + description xs | R2 §4.1 镜像 SkillsPage | ✓ | ✓ |
| HeaderRight Install button | primary small | ✓ Skill 页;McpMarketplagePage:421-433 用 inline chip 不复用 Badge variant | P1-2 偏离 |
| Block 1 决策必读 4 列 InfoItem | R2 §4.4 | ✓ | ✓ |
| Block 2 参考信息 + Source | upstream tags + MarketplaceSourceBadge | ✓ Skill 用 Badge / ✗ McpMarketplagePage 用自定义 inline | P1-1 |
| Block 3 README scroll 480px maxHeight | `whitespace-pre-wrap text-xs leading-relaxed text-[#52525B]` | ✓ | ✓ |
| Block 4(MCP)Configuration | stdio 必填字段 + HTTP url + OAuth | ✓ McpMarketplacePage 实现 | ✓ |
| Install button 三态 | Install / Installing / Retry / Installed | ✓ Skill 三态 / ✗ MCP 缺 Retry | P1-2 |

---

## Sidebar Marketplace 段视觉

| 元素 | 期望(R1 §1.2 镜像 CATEGORIES 段标题模式) | 实施 | 一致性 |
|---|---|---|---|
| 段标题 className | `text-[10px] font-semibold text-[#A1A1AA] uppercase tracking-[0.8px]` | ✓ Sidebar.tsx:320 字面一致 | ✓ |
| 段标题行 | `flex items-center justify-between flex-shrink-0 mb-3` | ✓ Sidebar.tsx:317 字面一致 | ✓ |
| 段尾 hairline | `<div className="h-px bg-[#E4E4E7] my-4 flex-shrink-0" />`(divider token) | ✓ Sidebar.tsx:362 字面一致 | ✓ |
| nav button | `h-9 px-2.5 flex items-center gap-2.5 rounded-[6px] cursor-pointer transition-colors duration-150 border` | ✓ Sidebar.tsx:331-353 字面一致 | ✓ |
| nav icon | `size={16}` lucide(`Store` + `Package`) | ✓ | ✓ |
| nav active state | `bg-white border-[#E5E5E5]` 文字 `text-[#18181B] font-medium` | ✓ | ✓ |
| nav inactive state | `border-transparent hover:bg-[#F4F4F5]` 文字 `text-[#71717A] font-normal` | ✓ | ✓ |
| Count badge | 不显示(D-1:marketplace 数量上游驱动,sidebar 计数无意义) | ✓ 不显示 | ✓ |
| ARIA `<nav>` | aria-labelledby="marketplace-section-label" | ⚠ 同时有 aria-label="Marketplace" 冗余 | P1-6 |

Sidebar Marketplace 段视觉**完美镜像 CATEGORIES 段模式** — 与现有 5 项 NAVIGATION 视觉密度连续,无断层。仅 ARIA 一个 P1 微调。

---

## 评审总结

| 严重度 | 数量 | 修复优先级 |
|---|---|---|
| **P0**(硬约束违例)| 3 | 必修 |
| **P1**(细节精度 / 跨页 inconsistency)| 6 | 推荐修 |
| **P2**(文案微调 / 历史问题)| 5 | 后续 backlog |

**关键 P0**(用户实测前必须修):
1. Badge `status` variant 染绿问题 — 影响视觉关键测试 + 阻断"同一产品"心智
2. `#B45309` 自创色 — 直接违反 design-language Rule §Anti-patterns
3. reduced-motion 覆盖欠缺 — accessibility / Rule 硬约束

**关键 P1**(强烈建议)`:
- McpMarketplacePage Badge tag/category 改用 Badge 通用组件(P1-1)
- McpMarketplagePage detailHeaderRight 加 Retry 分支(P1-2)

修复 3 项 P0 + 2 项 P1(P1-1 + P1-2)后,Marketplace 视觉与 Skills/McpServers 并排可达 design-language Rule 标准。

---

**评审结束。产物长度 ~410 行**(目标 250-450 行,满足)。
