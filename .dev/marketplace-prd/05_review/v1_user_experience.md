# PRD V1 评审报告 — 用户体验（Reviewer 2）

> **角度**：用户旅程的真实可信度。每一步的认知负担、决策点、错误路径、可逆性。
> **不评审**：闭环成立性 / 设计一致性 / 视觉描述 / 商减 / 范围控制（Reviewer 1/3/4）。
> **基线**：`00_understanding.md` + `02_synthesis_decisions.md` + `02_risk_distillation.md` + `03_PRD_v1.md`。

---

## 执行摘要

PRD V1 的用户旅程地图（§3）在"已经知道自己要装什么"的老用户场景下成立，
三段式契约（装 → 选 → 部署）的口号也清晰；但站在**真正的首次用户**视角通读下来，
多处用户感知缺口暴露：(1) 首次进入 Marketplace 的 0 状态没有引导设计，
新用户看到的是一个 100 项 leaderboard，没有"从哪里开始"的 cue；
(2) §7.1 三段式契约其实**反直觉**——用户原话"安装到管理路径，能直接被分类、使用"
按字面理解就是"装完即用"，PRD 强行把它解读为"装完仅进 Skills 列表，用还要走 Scene+Sync"，
这是产品契约对用户原话的**重述**而非**回应**；
(3) stdio MCP "装完不能即用"的引导仅靠按钮文案 `Installed (configure env)` 6 个字承担，
对一个未读过 README 的用户严重不足；
(4) 错误状态在两处同时反馈（详情按钮变红 + 顶部 error banner），
与"一处展示不重复"互相矛盾。
本评审给出 4 P0、6 P1、3 P2，总体判断 **Pass with revisions**。

---

## 专项检查结果

### 检查 1：首次进入 Marketplace 用户引导 — **Fail**

PRD §3 旅程地图直接从"[2] 进入 Marketplace → [3] 浏览/搜索"过渡，
但没有任何"首次空白态 / 引导卡片 / 第一次该看什么"的设计。
新用户看到的是一个 100 项 leaderboard 列表（OQ-1 已确认），
没有"从哪里开始""我应该先装什么"的 cue。
§5.7 表格只覆盖"加载中 / 已加载 / 上游不可达"三态，**漏掉首次首屏**这一最重要状态。
Marketplace 不是一个供熟手浏览的工具——它的 V1 价值就在于让"刚装 Ensemble 的新用户"
也能立刻发现资源；首次态缺失等于丢掉了 V1 最重要的用户群之一。

### 检查 2：列表与详情的信息密度 — **Pass with notes**

§5.3 列表项右段（type badge + Install 按钮 + 上游 popularity 数字）
信息量适中，与决策需要匹配。
§5.4 详情面板的 Header / Source / README / 元数据栏分块合理。
但 §5.4 元数据栏堆了**作者 / 上次更新时间 / 上游分类与 tag / 安装数 / MCP 配置区**五项，
没有定义视觉优先级——用户决策时哪些是 must-see、哪些是 nice-to-have 不清晰。
MCP 配置区与"上游分类与 tag"在同一栏中混排，
用户认知容易混淆"哪些是输入项、哪些是只读元数据"——
前者是用户必须填的、后者是上游元数据，混在同一栏违反"输入与展示分离"的可用性原则。

### 检查 3：安装动作的不可逆性处理 — **Fail**

§5.6 同名碰撞 Modal 的 `Replace` 选项是高破坏性动作
（"旧版本不保留备份；与现有 Import 模式一致"），默认选项是 Cancel——这是对的——
然而 PRD **没有定义 Replace 后的撤销路径**。
如果用户误点了 Replace，Marketplace 资源已经覆盖本地，
原有 Skill 内容（用户自己改过的）丢失。
"与现有 Import 模式一致"不等于这里的产品决策合理；
Marketplace 的批量发现属性会**显著放大**这个风险——
Import 是"用户主动找一个文件导入"，需要前置认知；
Marketplace 是"用户在浏览中点击多个 Install"，前置认知低、误点率高。

### 检查 4：离线 / 网络故障的降级友好度 — **Pass with notes**

§5.7 表格定义了四个降级状态，
文案"Marketplace unavailable" + "Check your connection" + Retry 按钮组合
在同类产品中标准。**但**：
(a) "Last synced 12h ago" 顶部提示位置（PageHeader 右段）的视觉权重在 PRD 中未定义，
可能被用户忽视；
(b) 缓存命中时"列表渲染（来自上游或缓存，不区分）"——
这句"不区分"是反用户视角的，
用户应该能感知"我看到的是新鲜数据还是 12h 前的快照"；
(c) EmptyState 文案"Check your connection"暗示问题在用户网络，
但实际 R-8 也包含"Vercel 单点击穿"——
如果是 skills.sh 服务侧故障，用户检查自家 wifi 不会改变什么，
反而会浪费时间和增加挫败感。文案应该更中立。

### 检查 5：stdio MCP 的"装完不能即用"如何说清 — **Fail**

§3.2 [5] 说"stdio 类型变 `Installed (configure env)`，提示用户去详情填环境变量"，
§5.4 说"详情面板显示 command/args/env vars 占位"。
**这两点对一个不知道 stdio MCP 需要 env vars 的新用户严重不足**：
(1) 按钮文案 `Installed (configure env)` 中的"configure env"是技术黑话，
新手不知道什么是 env；
(2) 用户的 next action 是什么没说清——他点了那个按钮还是回到详情？
详情里那个"配置区"具体允许填还是只是预览？
(3) §7.5 "stdio 类装完按钮变 `Installed (configure env)`"是产品反馈
但**没有定义"如果用户不填 env vars 会发生什么"**——
是 Sync 时报错？还是 Claude Code 启动时报错？
用户应该被提前告知，而不是在闭环末端碰墙。
R-13 已识别"stdio MCP 装完即可用是误导"是 P0 风险，
但 PRD 的回应仅停留在按钮文案层面，
未触及"用户如何被引导完成 setup"这个真正的用户行为问题。

### 检查 6：认知负担（三段式契约 vs 用户原话） — **Fail (P0)**

**最关键的发现**。用户原话：
"核心想要做到就是能够直接安装到我们的管理路径，
然后直接能够分发、使用、分类，让它系统的闭环。"
这句话的字面用户期望是"装 → 即用（自动分类 + 自动可被 Scene 引用 + 自动部署）"。
PRD §7.1 三段式契约（装 → 选 → 部署）实际上
**把用户原话中的"直接能够分发、使用"拆成了两个用户必须主动做的步骤**：
装完后用户还要 (a) 主动加进 Scene、(b) 主动 Sync 到 Project，才能"用上"。
PRD §7.1 的关键产品契约："装 ≠ 在 Claude Code 全局启用"——
这是把已有的 Scene 模型强加给 Marketplace 用户，是**系统视角**而非**用户视角**。
对一个刚装了 Skill 的用户，他点完 Install 看到的是"Skills 列表里出现了"——
他自然会以为"装好了，现在可以用了"，
结果实际上还要回到 Scene 页面手动添加才能在某个 Project 里启用。
这个心智落差 PRD 没有任何引导处理。
R-20 已点名此风险，但 PRD §7.1 的回应只是"显式定义三段式"——
这是把契约写下来给开发者看，不是把心智落差对用户翻译。

### 检查 7：错误状态的用户感知 — **Fail**

§5.5 说"失败时按钮就地变红 + 一行短文 `Installation failed. Retry?`，
并触发 SkillsPage 现有的顶部 error banner（一处展示，不重复，R-37）"。
但同一节又说"详情按钮就地变红 + 短文"——
这是 Marketplace 详情面板的按钮，不是 SkillsPage 的。
§5.7 错误一行又写"详情按钮就地变红 + 短文 `Installation failed. Retry?`；
顶部 error banner 显示一次（dismiss 后不再显示）"——
所以错误同时在**详情按钮**+**顶部 error banner**两处展示。
"一处展示"和"两处展示"在同一份 PRD 里互相矛盾。
另外 EmptyState（§5.7）只在"上游不可达 + 缓存为空"时出现，
不与 install error 路径重叠——
但用户不知道这种区分逻辑，可能在某些边界状态（缓存命中但 install 失败）感到反馈不一致——
比如"我能看到列表 = 上游可达，所以为什么 install 还失败？"。

### 检查 8：可达性 vs Obsidian 反例 — **Pass with notes**

§5.1 引用 Obsidian Settings 反例论证"sidebar 顶部 1-click 优于现有 ImportSkillsModal Plugin tab"——
这个论证站得住：H §Q6 的事实数据（用户已装 16 个 plugin / 0 个被显式 import）
证明**入口深度对采用率有决定性影响**。
Marketplace 顶部独立分组的可达性确实优于现状。
**但**论证中遗漏了一层：
"为什么用户从未用 ImportSkillsModal Plugin tab"也可能是因为
Plugin tab 本身的功能定位与 Marketplace 不同
（plugin 是已装的，marketplace 是未装的）——
把两者直接拿来比可达性是**类比不严谨**。
结论正确，论证不完全严谨，建议在 PRD 中弱化这种对比，
改以"sidebar 顶部入口符合用户预期"的正向论证。

---

## 发现清单

### P0（必须修才能发布）

**[P0-1] 三段式契约（§7.1）是对用户原话的重述而非回应**

- 影响：用户原话"装到管理路径 → 直接能分发、使用、分类、闭环"按字面是"装完即用"，
  PRD 把它强行拆成"装 + 主动选 Scene + 主动 Sync"三步，认知落差未被引导处理。
- 真实场景：新用户从 Marketplace 装了一个 PDF-to-Markdown Skill，
  回到 Skills 列表看到它出现了，关闭 Ensemble 进入终端 `claude code`，
  发现这个 Skill 没有生效——因为他没把它加进当前 Project 关联的 Scene。
  他不知道自己漏了一步，会感到"装了但没用"。
- 修订建议：(a) 在 §3 旅程地图 [5.5] 之后增加"[5.6] 装完后用户的下一步"，
  明确告知"已加入 Skills 列表，可在 Scenes 中组合使用"；
  (b) Marketplace 安装成功的反馈加 short-cut "View in Skills →" / "Add to active Scene →"；
  (c) 考虑 V1 引入"Default Scene"概念，让用户勾选"Add to my default Scene on install"
  消除三段式认知负担——把心智差距由 PRD 主动承担。

**[P0-2] 首次进入 Marketplace 的 0 状态完全缺失**

- 影响：§3 / §5 假设用户进入即看到列表，
  没有"我刚来该看什么 / 推荐先看什么 / 没装过任何东西时的引导"设计。
- 用户群定位：Marketplace 的 V1 用户是 Ensemble 的新用户
  （H §Q6 表明老用户已习惯外部 git clone 路径）。
  首次态是 V1 最重要的用户感知节点之一，缺失等于丢掉 V1 最重要的用户群。
- 修订建议：在 §5 增加"首次进入态"小节，至少定义：
  (a) 首屏顶部是否有 onboarding banner（如 "New here? Try these popular Skills"）；
  (b) 是否高亮某些"入门必备"资源（沿用上游 popularity 排序，但前 3 项视觉强调）；
  (c) 首次安装成功后是否有一次性提示告知用户后续路径——这与 P0-1 协同回应三段式落差。
  **不要做大量 onboarding tooltip 走马灯**——一次性、可 dismiss、不阻塞主流程的提示足矣。

**[P0-3] stdio MCP "装完不能即用"的用户引导仅靠 6 字按钮文案承担**

- 影响：`Installed (configure env)` 中"configure env"是技术黑话，
  §5.4 / §7.5 也未定义"用户不填 env vars 会怎样"的下游错误反馈。
- 真实场景：用户从 Marketplace 装了一个 puppeteer MCP，
  看到按钮变 `Installed (configure env)` 但他不懂——他可能以为是版本号或注释；
  之后他把这个 MCP 加进 Scene → Sync 到 Project → 在 Claude Code 里发现 MCP 不工作，
  错误信息可能在 Claude Code 终端深处的日志中，与 Ensemble 完全脱节。
- 修订建议：
  (a) 详情面板"配置区"必须明确写 "Required environment variables (this MCP won't work without them)"
  + 字段名 + 字段说明 + "Where to find this" 链接（如有）；
  (b) 按钮文案改为更直白的 "Installed — needs setup" 或 "Installed — finish in details"；
  (c) §7.5 增加"用户跳过 env 配置直接 Sync 到 Project，应在 Project 层面有可见提示"
  （如 Project 详情面板显示该 MCP 状态为 "Missing required env vars"），
  而不是用户在 Claude Code 终端遇到 cryptic 错误；
  (d) 详情面板"配置区"打开时如果 env vars 还未填，主操作按钮应保持可见提示状态。

**[P0-4] 同名碰撞 Replace 后无撤销路径**

- 影响：§5.6 Replace 选项是覆盖本地（旧版本不保留备份），用户误点后原有 Skill 用户改动丢失。
  Marketplace 的批量浏览属性显著放大误点风险。
- 真实场景：用户在浏览 Marketplace 时连续点了 5 个 Install，
  其中第 3 个弹出 Replace Modal（因为他自己之前用 git clone 装过同名 Skill 并改过内容），
  他在浏览节奏中习惯性按 Enter（或者快速点 Replace 以为"覆盖才是装上"），
  瞬间丢失自己的改动。
- 修订建议：**首选方案是 Trash 路径**——
  Replace 时把旧版本写入 Trash（沿用现有 Trash 流程，30 天后清除），让用户可恢复；
  把"撤销"从用户的认知负担变成系统的兜底能力。
  备选方案：在 Modal 中显式警告 "Replace will permanently overwrite your local changes.
  This cannot be undone." 加上 secondary 红色按钮，把 Replace 提升到"明确的破坏性操作"。
  Cancel 默认是必要但不充分的保护——用户在浏览节奏中不会读 Modal 文字。

### P1（应修）

**[P1-1] §5.5 与 §5.7 关于错误反馈的描述互相矛盾**

- 影响：§5.5 说"一处展示，不重复 R-37"，
  §5.7 又写"详情按钮就地变红 + 顶部 error banner 显示一次"——
  两处展示同一错误，用户感知到同一错误在按钮和顶部同时出现，
  可能误以为是两个不同的错误。
- 修订建议：定义清楚"按钮变红 = 局部反馈（用户在哪里点击就在哪里反馈），
  error banner = 全局反馈（用户离开当前 SlidePanel 也能看到）"，两者职责不重叠；
  如果用户停留在详情面板，banner 不出现；
  用户关闭 SlidePanel 才出现 banner（避免叠加）。

**[P1-2] §5.4 详情面板元数据栏 5 项内容没有视觉优先级**

- 影响：作者 / 更新时间 / 上游分类 / 安装数 / MCP 配置区五项混排，
  用户决策时不知道哪些是 must-see。
  MCP 配置区是用户必须交互的（输入），与上游分类（只读元数据）混排
  会让用户感到"我应该编辑哪些字段不应该编辑哪些"不清晰。
- 修订建议：定义二级层次：
  "决策必读"（描述、安装数、上次更新——这三项决定用户是否相信这个资源）一级显著；
  "参考信息"（作者、上游分类）二级低饱和；
  "配置项"（仅 MCP）独立块（不与元数据混排）。

**[P1-3] EmptyState 文案 "Check your connection" 暗示问题在用户网络**

- 影响：实际可能是上游单点击穿（R-8——Vercel 决策可单点击穿 skills.sh）。
  如果是 skills.sh 服务侧故障，用户检查自家 wifi 不会改变什么，
  反而会浪费时间和增加挫败感。
- 修订建议：改为更中立的 "Marketplace temporarily unavailable.
  This may be a network issue or upstream service outage. [Retry]"——
  让用户既能尝试又不被误导。
  如果 Ensemble 端能区分网络层失败 vs HTTP 5xx，可以给两条不同文案。

**[P1-4] 缓存命中时"列表渲染（来自上游或缓存，不区分）"是反用户视角**

- 影响：§5.7 表格的"上游可达、已加载"和"上游不可达、缓存命中"两行的用户体验是不同的——
  前者数据是新鲜的，后者最长可能 24h 旧。
  "不区分"的设计是为减少视觉杂乱，
  但隐藏的代价是用户无法知道"我看到的资源信息是不是最新的"。
- 修订建议：保留"Last synced X ago"提示但把它移到列表上方一行（不是 PageHeader 角落），
  用更显眼的低饱和提示文字；加 `Refresh` 按钮就近放置，让用户可主动获取新数据。
  视觉成本低、信息收益高。

**[P1-5] 自动分类完成的跨页反馈不清晰**

- 影响：§3.2 [5.5] 说"分类完成后该项在 Skills / MCP Servers 列表中出现"——
  但用户当时**不在** Skills 列表（在 Marketplace），他怎么感知分类完成？
  是要他自己回到 Skills 看？还是有跨页通知？
  如果用户不知道自动分类成功了，他可能下意识跑回 Skills 列表确认，
  破坏 Marketplace 浏览节奏。
- 修订建议：明确定义跨页反馈机制——
  Marketplace 列表项右段从 Install → Installing → Installed 的三态转换，
  最后转为带 checkmark 的 Installed 灰态；
  可选：在 Installed 状态 hover 时显示 tooltip "Categorized as: [category]"
  让用户即时看到分类结果；
  可选附文 "View in Skills →" 跳转链接（不强求）。

**[P1-6] 详情面板与列表项 Install 按钮并存导致用户可"不读 README 即装"**

- 影响：§5.4 详情面板 Header 区主操作按钮 `Install`
  与列表项右段也接受点击安装（§5.5），两者并存导致用户不必看 README 即可装。
  这与 §5.5 描述的"用户先看 README 再决定装"理想路径冲突，
  也增加了 P0-4 误点 Replace 的风险。
- 修订建议：保留双入口（高效路径，老用户值得这个 short-cut），
  但在列表项 Install 按钮旁加一行小字 "View details"
  或让 Install 按钮的左侧 hover 提示 "You haven't viewed the details. Install anyway?"——
  给"未读详情就安装"的用户一次温和的二次确认（不是 Modal，是行内 hover 提示）。
  或者更简洁的方案：列表项 Install 按钮 hover 显示 README 第一行作为预览。

### P2（可修）

**[P2-1] OAuth 类 HTTP MCP 装完后还要在 Claude Code 内 `/mcp` 完成认证**

- 影响：PRD §5.4 / §7.5 仅提一句"安装后在 Claude Code 内 `/mcp` 完成认证"——
  但 Ensemble 用户当下不在 Claude Code 终端，
  他要么自己记住这个命令，要么之后跑 Claude Code 时遇到错误才回想。
- 修订建议：在 Marketplace 详情面板提示
  "After installing, run `/mcp` in your Claude Code session to complete authentication.
  [Copy command]"——让用户能复制命令而非凭记忆。
  配 Sync 后的 Project 详情中加一行 "Pending OAuth authentication for: [mcp-name]" 提示。

**[P2-2] §5.8 列表筛选默认排序"by upstream popularity"口径不一**

- 影响：OQ-7 已识别"什么是 popularity"在不同上游不同
  （skills.sh 的 weekly install vs MCP Registry 的 stars）。
  用户在 Skill Marketplace 看到的 top 10 排序逻辑
  与 MCP Marketplace 的 top 10 排序逻辑不同，
  但 PRD 中文案都是"By upstream popularity"。
- 修订建议：在排序下拉中显示具体口径，
  如 "By weekly installs"（Skill）/ "By GitHub stars"（MCP），
  让用户知道排序依据。两个 marketplace 的排序文案不同是正确的——
  它反映了上游本身的差异。

**[P2-3] §3.2 [4] 详情面板"图片懒加载"未定义图片加载失败的占位符**

- 影响：上游 README 含图片是常见情况，加载失败可能让详情面板看起来像"坏掉了"。
  R-38 提到"上游 README 异常 markdown 安全降级"
  但图片加载失败是更具体的子情形。
- 修订建议：定义图片加载失败的占位符
  （沿用现有 IconPicker 默认 icon 或一个 zinc 灰色 placeholder）+ alt text fallback，
  让 README 主体不因图片失败而视觉断层。

---

## 总体判断

**Pass with revisions**

PRD V1 的整体用户旅程框架（§3）、关键交互（§5）、闭环定义（§7）逻辑清晰、决策有据，
是一份高质量的产品视角文档。
**但站在真实首次用户视角通读，4 处 P0 缺口足以让 V1 在用户实测时暴露认知断层**——
尤其 P0-1（三段式契约对用户原话的重述）和 P0-3（stdio MCP 引导不足）必须在 V2 显式回应；
不修将让用户原话"让它一整个闭环、更方便一点"在 V1 落地后被打折扣。

建议 V2 修订聚焦于"把已隐藏在系统模型中的产品契约显式翻译给用户"，而不是再增章节。

具体优先级：
- 先 P0-1 + P0-2（影响 V1 用户群最大）
- 再 P0-3 + P0-4（影响 stdio + 高破坏性场景）
- 然后 P1（润色）→ P2（边界 case）

所有 P1 / P2 项**都不需要新建组件或新视觉语言**，
绝大多数是现有 PRD 章节内的文案、视觉权重、状态机定义补充——
与 PRD V1 的"严格不引入新 token"原则完全相容。

---

## 不在本评审角度的发现

观察到但不属于本评审角度，转交相关 Reviewer 注意：

- §5.4 详情面板的图标 / 名称 / 主操作按钮 Header 区的具体视觉布局
  （56 px 高、字号、按钮位置）——属 Reviewer 3 设计一致性范围
- §6.5 24h 缓存 TTL 是产品决策但具体 TTL 选择的合理性
  （是否过长 / 过短）属 Reviewer 1 闭环可靠性范围
- §10.4 V1.5/V2 路线图占位是否过于具体（已列 6 项）——属 Reviewer 4 商减范围
- P0-1 修订建议中提到的"Default Scene"概念若被采纳，
  会触及 Scene 模型的产品语义扩展——属 Reviewer 1 闭环范围
  （V1 是否引入 Default Scene 是范围决策，需 Reviewer 4 评估）
