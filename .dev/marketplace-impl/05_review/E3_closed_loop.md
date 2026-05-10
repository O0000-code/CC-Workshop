# E3 闭环完整性评审

> **角色**:闭环评审 SubAgent(独立,Opus 4.7)
> **日期**:2026-05-09
> **范围**:Marketplace V2.0 三段式契约(装 → 选 → 部署)、SSoT §7.4、跨页面状态同步、Trash restore 语义、stdio MCP 配置区、active Scene + AddToScenePopover、失败态绑定到资源 entry、同名碰撞 Modal 三选项、`?selected=` 短链、HTTP MCP OAuth Copy command。
> **方法**:逐一 trace 每一段闭环、每一个状态切换、每一个跨页面同步;对照 PRD V2 §3.2 单步详述、§7 闭环定义、§8 失败信号契约、`fix-must-define-user-observable-success` Rule。
> **态度**:不重复 Phase D 已验证的"路径接通",只评估**用户视角的"装-选-部署"是否真正闭合 + 失败模式是否在产品层兑现承诺**。

---

## 0. TL;DR

- **P0 = 6**:每一条都让 PRD 的某条用户契约在用户视角下不成立(看到承诺 X,实际行为不是 X)
- **P1 = 8**:错误处理细节、跨页面瞬时不一致、轻度产品契约偏差
- **P2 = 7**:体验微调、文案不严格、死字段
- **整体判断**:**不可发布**。P0-1 / P0-2 是闭环承诺击穿,P0-3 / P0-4 是用户最频繁动作的负预期,均必须修复。

---

## P0 — 闭环逻辑断点 / SSoT 违规 / 用户契约击穿

### P0-1:stdio MCP env vars **填了不写盘**,Sync 后 Project 拿不到 env

**证据**
- `src/pages/McpMarketplacePage.tsx:356-374` `handleSaveEnv`:仅 `setSavedFeedback` 200ms `Saved` 反馈 + `setShowValidation` 红字标识,**0 IPC 调用**
- 实施日志原文(`04_implementation_log.md` 第 655 行 C3 笔记)直接承认:"`update_mcp_metadata` IPC 不接受 env 字段(只接 category/categoryId/tags/enabled),且本卡范围禁止改后端。本卡选择**纯前端持久化**:env values 存在 component state(`envValues[itemId]`)"
- 后端 `install_marketplace_mcp` 在 `marketplace.rs:1352-1361` 把 stdio `required_env_vars` 各项预填空字符串到 `McpConfigFile.env`,写入 `~/.ensemble/mcps/<name>.json`
- 用户在详情面板填的 env values 永远停留在 `envValues[itemId]` 这个 component state — 切换到其他 marketplace 项再回来,值还在(component state 在);**关闭 SlidePanel / 切去其他页 / 刷新应用 / 重启 Ensemble → 全部丢失**
- Sync 走 `config.rs::write_mcp_config`,从 `~/.ensemble/mcps/<name>.json` 读 `env` 字段,**永远是空对象**

**用户视角**
- 用户做 X:进 stdio MCP 详情面板填 `ANTHROPIC_API_KEY=sk-...` + 点 `Save environment variables` → 看到 `✓ Saved` 200ms 反馈
- 用户期望 Y(PRD §5.4(c)):"用户感知'填了就保存'"
- **实际**:`Saved` 是骗人的;关闭面板再打开,值仍在 component state(同一会话)看似"保存"了;但**重启 app 或 Sync 后 env 都不存在**
- PRD §7.5 / R1-P0-3 / R2-P0-3 明确"按钮状态映射 = 用户已填全部必填字段时,按钮从 `Installed — needs setup` 变 `Installed`" — 当前依赖 `allEnvFilled` 派生(`McpMarketplacePage.tsx:289-307`),从 component state 读 `envValues` + 已装 mcp.env(SSoT 永远空) → 用户重启后回来,按钮又变 `Installed — needs setup`,**永远不会变 `Installed`**

**严重度**:P0
- 这是 V2.0 In #3 "MCP Marketplace 一键安装" 的**核心承诺破坏**
- stdio MCP 占 Official MCP Registry 大多数(R3 §1.2 推算)
- Sync 到 Project 后 Claude Code 跑 `command + args` 缺 env → cryptic 错误,用户在 Project 详情面板**也看不到 `Missing required env vars` 提示**(P0-2)

**修复方向**:新增 `update_mcp_env_vars(mcp_id, env)` IPC,在 marketplace.rs 内或 mcps.rs 内实现:DATA_MUTEX 持锁 → 读 `~/.ensemble/mcps/<name>.json` → 反序列化 `McpConfigFile` → 更新 `env` 字段 → 写回。前端 `handleSaveEnv` 调此 IPC。

---

### P0-2:**Project 详情面板未显示 `Missing required env vars` 提示**

**证据**
- 全 codebase grep `Missing required env vars` / `missing_required_env` / `missingRequiredEnv` 命中 0
- PRD §3.2 [7] / §7.5 / R2-P0-3 / R1-P0-3 明确要求:"stdio MCP 若用户未填环境变量就 Sync,Project 详情面板显示该 MCP 状态为 'Missing required env vars'(产品层可见提示),让用户在 Ensemble 端就知道哪个 MCP 配置不全,而不是在 Claude Code 终端遇到 cryptic 错误"
- `src/pages/ProjectsPage.tsx` / `src/components/projects/*` 0 实现该提示

**用户视角**
- 用户做 X:跳过 env 填写 → 直接加 Scene → Sync 到 Project
- 用户期望 Y:Project 详情面板看到该 MCP "Missing required env vars" 红字
- **实际**:Project 详情面板与未装 marketplace 之前完全相同,用户不知道哪里出错。下次跑 Claude Code 才看到 stderr 报错。

**严重度**:P0
- 这是 PRD §8.4 反向信号 "stdio MCP 若用户未填 env 就 Sync,Project 详情面板显示该 MCP 状态为 Missing required env vars"的具体兑现
- R-13 P0 "stdio 装完不能即用" 的产品层缓解失效
- 与 P0-1 一起,让 stdio MCP 体验链完全断掉

**修复方向**:Project 详情面板的 MCP 列表项检查 `mcp.env` 是否包含原始 catalog `requiredEnvVars` 名称(且非空字符串)— 缺则渲染 inline 红字提示。需要前端 ProjectDetail 增逻辑 + 后端 store 携带 marketplace catalog item 的 requiredEnvVars 引用(可在 `McpConfigFile` 或 `marketplace_source` 内备份 required_env_vars)。

---

### P0-3:**RestoreFromTrash 路径不保留用户原 metadata**(category / tag / icon **全部丢失**)

**证据**
- `MarketplaceCollisionModal.tsx:48` 描述文案:`A previously deleted version exists in Trash. Restoring will recover your category, tags, and custom icon.`
- 后端实现 `marketplace.rs:1228-1268` `finalize_skill_install`:
  1. 用 `or_insert_with(SkillMetadata::default)` 取 entry — 如果之前 metadata 不存在,**新建空 SkillMetadata**
  2. 仅设 `install_source` / `marketplace_source` / `scope`(若空)
  3. 不读旧 metadata,不继承 category / categoryId / tags / icon
- `delete_skill` 在 `skills.rs:330` 时 `app_data.skill_metadata.remove(&skill_id)` 已清空 metadata
- 所以 `RestoreFromTrash` 路径(line 1213-1215)走 `fs::rename` 把 trash 物理目录搬回 → `finalize_skill_install` → 给 entry 写入只含 install_source / marketplace_source 的 SkillMetadata,**用户原 category / tag / icon 全部丢失**
- 实施日志中 Phase A 笔记(`04_implementation_log.md:69`)写"实际 trash skill 没有 metadata,所以 V1 用户从 Trash 恢复只能拿物理文件,metadata 用 marketplace 的元数据填" — 这与 Modal 文案"recover your category, tags, and custom icon"直接矛盾。代码与产品契约不一致

**用户视角**
- 用户做 X:从 Skills 列表 Delete 一个用户精心分类的 marketplace skill(category="开发", tag=["frontend"], icon="Code")→ 进 Trash → 在 Marketplace 重装同名 → 弹 Modal,看到承诺 "Restoring will recover your category, tags, and custom icon"
- 用户做 Y:点 Restore from Trash
- **实际**:文件回来,但 category="未分类" / tags=[] / icon=Sparkles(默认) — 用户的工作全丢

**严重度**:P0
- 直接违反 PRD §7.6 文字契约 + Modal 文案对用户的承诺
- R1-P0-2 "Trash 期间的重装语义"明确"`Restore from Trash` = 把 Trash 中条目恢复到原路径,metadata 全部继承(Category / Tag / 自定义图标完整保留)"
- "Replace 时 metadata 不继承" + "Restore 时 metadata 全部继承" 是设计文档专门构建的对比;Restore 不继承 metadata = 设计意图全丢

**修复方向**:有两种修复路径:
1. **修后端**:`delete_skill` 在 trash 时把 metadata snapshot 写到 trash 子目录的 `_metadata.json` 同伴文件 → `finalize_skill_install` 在 RestoreFromTrash 路径优先恢复 snapshot 的 metadata 再填 install_source / marketplace_source
2. **修文案**:Modal 描述改为 "Restoring will move the trashed copy back. (Category / tags / icon will need to be reset.)" — 但这等于退守(违反 PRD §7.6)

PRD §7.6 是 Decisional,应走方案 1。

---

### P0-4:**`Auto-classify failed — assign manually` inline 提示 0 实现**

**证据**
- `marketplaceStore.ts:921` 在 `marketplace:classify-failed` event handler 写 `classifyFailedItemIds.add(id)` — store 字段已就绪
- 全 codebase grep `classifyFailedItemIds` 仅在 `marketplaceStore.ts` 内部 6 处出现,**前端 UI 0 消费**
- `SkillsPage.tsx` / `SkillListItem.tsx` / `McpServersPage.tsx` / `McpListItem.tsx` 全部 0 命中 `classifyFailedItemIds` / `Auto-classify failed`
- PRD §3.2 [5.5] 失败处理:"该项 row 显示一个非阻断 inline 提示(如 `Auto-classify failed — assign manually`),用户点击展开手动分类入口"
- spec §8.2 "Skills 列表 row 显示 inline `Auto-classify failed — assign manually`"
- spec §9 文案表第 51 行:`Auto-classify failure inline(Skills 列表 row 内)` `Auto-classify failed — assign manually` + click → 展开手动分类入口  | R1-P0-4

**用户视角**
- 用户做 X:装 marketplace skill / mcp,后台 auto-classify 失败(如 PATH 无 `claude` CLI / API key 缺失)
- 用户期望 Y:Skills 列表的该项 row inline 看到 "Auto-classify failed — assign manually" + 可点击展开手动分类
- **实际**:用户**完全无法感知** auto-classify 失败 — backend emit 了 event,前端 store 收了 event 写了 set,但没有任何 UI 渲染该 set。Skills 列表上该项就是"未分类",用户以为是产品分类不准

**严重度**:P0
- R1-P0-4 / PRD §3.2 [5.5] 明确不允许 silent failure
- PRD §8.4 反向信号 "**Auto-Classify 安装时不触发** — 用户安装后 Skills 列表不出现新项或出现但永远在'未分类'" — 当前实现命中此反向信号
- backend 已经做完工(emit failed event),前端只差最后一步 inline 提示,任务完成度 ~95% 但用户视角看是 100% 失败

**修复方向**:`SkillListItem.tsx` / `McpListItem.tsx` 内订阅 `useMarketplaceStore((s) => s.classifyFailedItemIds.has(item.id))`,命中时在 row 底部渲染 inline 红字提示 + 点击展开 CategoryTreeDropdown / TagInput 让用户立即手动分类。或在 row 内嵌入小的 "fix it" Button。

---

### P0-5:**MCP Marketplace 没有 Onboarding banner**

**证据**
- `marketplaceStore.ts:170-171` 定义 `onboardingDismissedSkills` + `onboardingDismissedMcps` 双字段
- `SkillMarketplacePage.tsx:362-382` 渲染 onboarding banner — 仅订阅 `onboardingDismissedSkills`
- `McpMarketplacePage.tsx` 全文 0 命中 `onboarding`,**McpMarketplacePage 没有 onboarding banner**
- PRD §5.0 / §9 文案表第 60 行:"Onboarding banner(首次)`New here? These are popular Skills others are using.` / `... popular MCP servers.`" — 双 marketplace 都要

**用户视角**
- 用户做 X:第一次进 MCP Marketplace
- 用户期望 Y(PRD §5.0):看到 onboarding banner "New here? These are popular MCP servers others are using."
- **实际**:无 banner;用户直接进列表无 cue 提示

**严重度**:P0
- 直接违反 PRD §5.0 用户契约
- Onboarding 是 V1 重点产品翻译之一,缺一个 marketplace 等于一半用户体验缺失

**修复方向**:McpMarketplacePage 镜像 SkillMarketplacePage:362-382 onboarding banner 实现,使用 `onboardingDismissedMcps` + `dismissOnboarding('mcps')`。文案 `New here? These are popular MCP servers others are using.`。

---

### P0-6:**MCP Marketplace 列表上方没有 Filter row**(CategoryTreeDropdown + Last synced hint **不展示**)

**证据**
- `SkillMarketplacePage.tsx:388-410` 在 `skillsCatalog.length > 0` 时渲染 Filter row(CategoryTreeDropdown + Last synced hint)
- `McpMarketplacePage.tsx:737-840` 主区代码 0 命中 CategoryTreeDropdown,Filter row 不在主区(虽然 `lastSyncedLabel` 在 PageHeader actions 槽,这是部分实现)
- PRD §3.2 [3] / §5.8 / spec §9 文案表都要求 Marketplace 列表上方有 CategoryTreeDropdown + Last synced(就近放置 Refresh)
- McpMarketplacePage 的 `Last synced` label 放在 PageHeader actions 槽(line 747-751),不在主区列表上方;**CategoryTreeDropdown 完全缺失**
- 实施日志(C3 笔记 第 661 行)写"如 C2 产出后续要求,可在主区列表上方追加 CategoryTreeDropdown,但 V1 不强制 — 这避免本页 vs Skill 页布局割裂(并行 SubAgent 时序里 C2 形态尚未确定)" — 这是**主动豁免** PRD §5.8 的硬契约(V1 In 部分)

**用户视角**
- 用户做 X:在 MCP Marketplace 想按 Ensemble Categories 过滤
- 用户期望 Y(PRD §3.2 [3]):列表上方 CategoryTreeDropdown
- **实际**:无 dropdown,只能搜索

**严重度**:P0
- PRD V1 In #3 明确"用现有 Categories / Tags 作辅助筛选" — 双 marketplace 都需
- PRD §5.8 是 Decisional 文档,任何"V1 不强制"的偏离需在 03_task_cards 或本任务的 patch 文档明确登记;C3 实施日志的"V1 不强制"是 SubAgent 自行豁免,**无产品决策授权**

**修复方向**:McpMarketplacePage 镜像 SkillMarketplacePage:388-410 的 Filter row 实现 — CategoryTreeDropdown(左)+ Last synced label(右)。Last synced 同时从 PageHeader actions 槽移到主区(避免在两处显示)。

---

## P1 — 错误处理 / 跨页面瞬时不一致 / 产品契约偏差

### P1-1:**MarketplaceCollisionModal 在 SkillMarketplacePage 无条件渲染,可能在 MCP collision 时双 mount**

**证据**
- `SkillMarketplacePage.tsx:482` `<MarketplaceCollisionModal />` 无条件渲染(组件内部根据 `collisionState.open` 自闭)
- `McpMarketplacePage.tsx:857-858` 用 `collisionModalState.open && collisionModalState.itemType === 'mcp' && <MarketplaceCollisionModal />` 条件渲染
- 两个 marketplace 页面任一时刻仅一个挂载(用户在 Skill marketplace 时 McpMarketplacePage 不 render,反之亦然),所以**不会真双 mount**;但代码不对称是定时炸弹 — 未来若两个页面共存(如 tab),collision Modal 会 double mount(双 alertdialog,Esc/overlay click 双重闭合,焦点错乱)

**修复方向**:统一在 MainLayout 顶层挂一个,移除两个页面内的 mount。这与 ShortcutBanner / Popover 已 mount 在 MainLayout 一致。

### P1-2:**`addToActiveScene` 的失败处理静默 console.error,banner 不变**

**证据**
- `marketplaceStore.ts:736-742`:`scenesStore.updateScene` 抛错 → console.error + return,不调 dismiss(banner 留着) — 实施日志称之为"用户可重试 / 选别的路径"
- 但用户在 banner 上点了"Add to active Scene: <name> →" 后没有 toast / inline error / 重试按钮,**完全不知道失败**(PRD §3.2 [5.5] 失败感知契约)
- banner 文本仍是 "Installed in your library." 看似成功 → 用户离开,Scene 内实际没加上

**修复方向**:失败时在 banner 内 inline 渲染红字 "Failed to add to scene. Try again." 或者直接静态 `installFailedItems`-style 失败态,允许用户重试。

### P1-3:**`saveSceneAssignments` 部分成功后 `loadScenes` 但失败原因被吞**

**证据**
- `marketplaceStore.ts:769-820` `saveSceneAssignments`:`for...of` 串行 `updateScene`,任一抛错后续不再执行
- `try/catch` 在 `updateScene` 内部由 `scenesStore.updateScene` 自捕(scenesStore.ts:267-281) — 但 `scenesStore.updateScene` 调 `safeInvoke('update_scene', ...)` 失败时只 `set({ error: String(error) }); throw error`
- `marketplaceStore.saveSceneAssignments` 不 try/catch 该 throw,会一路冒泡到 `AddToScenePopover.handleSave`
- `AddToScenePopover.tsx:204-217`:`try/catch` 内部 console.error + `setIsSaving(false)`,popover 不关 — 但**用户看到的就是 popover 不关**,无任何错误信息显示
- 部分 toAdd / toRemove 已成功落库 — 用户取消后状态半调子

**修复方向**:popover 内显式 inline 错误条 + toast;或者把跨 Scene 操作改为原子化 `update_scene_assignments(scenes, itemId, itemType)` 后端 IPC。

### P1-4:**`installSkill` 的 RestoreFromTrash 路径在 outcome 是 `nameCollision` 时未处理**

**证据**
- `marketplaceStore.ts:471-481` switch case `nameCollision` 直接 openCollisionModal — 但当 `conflictAction = RestoreFromTrash` 已经传给 backend 时,**backend `install_marketplace_skill` 没有重新检查 collision 是否仍然存在**(因为 `conflict_action.is_some()` 跳过 collision 检测,直接走 Replace / RestoreFromTrash 路径)
- 但若 trash 路径已被并发清理(用户在 Trash Recovery Modal 中清空 trash),`finalize_skill_install` 会得到 `Failed { reason: "Trash path no longer exists" }`(line 1204-1207),前端 store handle 走 `case 'failed'` 写 `installFailedItems[item.id]`
- 这个失败反馈走的是列表 row 的 Retry — 但**列表 row Retry 是无条件 install,不会重弹 Modal** — 用户必须再次撞同名才能弹 Modal
- 还有一个边界:RestoreFromTrash 路径返回 NameCollision 永不发生(因 backend 跳过 detection),但前端 switch case 仍然写了 `case 'nameCollision'` 处理 — 这是死代码或者说漏判一个 case 的潜在 bug

**修复方向**:在 backend 的 RestoreFromTrash 路径里,如果 trash_path 不存在,改为返回 `NameCollision { has_local: false, has_trashed: None }` 让前端重新弹 Modal — 或者前端 install action 监测 `failed` outcome 的 reason 字符串,智能 fallback 到重新检测。

### P1-5:**`?selected=` 短链对 marketplace 资源的本地 id 失败**

**证据**
- `MarketplaceShortcutBanner.tsx:39-45` `navTargetForItem` 用 `targetItemId`(local Skill.id = source_path) 编码到 URL
- `SkillsPage.tsx:230-240` 监听 `?selected=`,直接 `setSelectedSkillId(value)` — 不 trim / 解码
- `targetItemId` 是 marketplace install 后的 outcome.skillId(`marketplace.rs:1268` `Ok(InstallOutcome::Installed { skill_id })` 内容 = `target_dir.to_string_lossy().to_string()` = `~/.ensemble/skills/<name>`)
- `Skill.id = source_path`(Rust runtime),scan_skills 写入(skills.rs:206 等)
- `~` 在 Rust path 不展开,所以 `target_dir.to_string_lossy()` 大概率是绝对路径 `/Users/bo/.ensemble/skills/<name>` — 与 `Skill.id` 一致 — 但 V1 实测**未在跨平台环境验证**
- **更严重**:`encodeURIComponent("/Users/bo/.ensemble/skills/foo")` = `%2FUsers%2Fbo%2F.ensemble%2Fskills%2Ffoo`(URL 看起来很丑;但功能上 useSearchParams.get 会自动解码,**功能上能跑**)

**严重度**:P1 — 功能上能跑但 URL 质量差,且 `/skills?selected=%2FUsers%2Fbo%2F.ensemble%2Fskills%2Ffoo` 这种 URL 不该出现在产品中,容易被用户复制分享后发现路径泄漏(隐私轻泄)

**修复方向**:用 marketplace 三元组 hash 或 `name` 作短链 token,SkillsPage 内查询 `skills.find(s => s.marketplaceSource?.name === name || s.name === name)?.id` 派生本地 id。

### P1-6:**Marketplace HTTP MCP OAuth Copy command 仅复制 `/mcp`,不包含 server name**

**证据**
- `McpMarketplacePage.tsx:378` `await navigator.clipboard.writeText('/mcp')` — 仅复制 `/mcp`
- 实际 Claude Code 的 OAuth 流程命令是 `/mcp <server-name>`(在 `/mcp` 之后选择具体 server,或 `/mcp authenticate <name>`)
- 用户复制 `/mcp` 后到 Claude Code 还要再选择 — 不是"装完即可粘贴运行"

**修复方向**:复制 `/mcp <server-name>` 或 `/mcp authenticate <server-name>`(具体串由 Claude Code 文档确认)。

### P1-7:**`installingItemIds` 在 collision Modal Cancel 时清除 — 但 SubAgent 笔记说"installingItemIds 持续命中驱动按钮 Installing"**

**证据**
- `marketplaceStore.ts:628-642` `closeCollisionModal`:Cancel 时 delete 该 itemId — 行为正确(用户取消 → 按钮回 Install)
- 但 C5 实施笔记(`04_implementation_log.md:209` 用户可观测成功 5)写"列表项与详情面板的安装按钮在弹出 Modal 期间保持 `Installing...` 状态(由 `installingItemIds` 持续命中驱动)"
- 实际:用户点 Install → 按钮 Installing → backend 返回 NameCollision → store 已经在 `case 'nameCollision'` 后**没有清除 installingItemIds**(line 471-481 仅 openCollisionModal),所以 button 此时是 Installing — 与笔记一致
- 但用户看到 Modal 弹出时,后台的 row 按钮是 `Installing...` — 这是不正确的提示("Installing" 但实际暂停等用户决策);spec §8.1 要求"NameCollision → button stays Installing... 不变"(line 791),所以**实施符合 spec**,但 spec 自身可能反产品直觉

**严重度**:P1(spec/实现一致,但 UX 上可能误导用户认为后台仍在尝试)

**修复方向**:讨论是否 spec §8.1 的 "Installing... 不变" 应改成 "Awaiting confirmation"。低优。

### P1-8:**Last synced 标签在 SkillMarketplacePage 与 McpMarketplacePage 显示位置不一致**

**证据**
- `SkillMarketplacePage.tsx:400-408` `lastSyncedHint` 在主区 Filter row 右侧,与 CategoryTreeDropdown 同行
- `McpMarketplacePage.tsx:747-751` `lastSyncedLabel` 在 PageHeader actions 槽内,Refresh 按钮左边
- 双 marketplace 行为不一致,违反 PRD §5.7 "Last synced 标签 + Refresh 按钮就近放置"对位置一致性的隐含要求(PRD §5.4 / §5.7 都是"列表上方")
- `Last synced N hours ago (cache may be stale)` (Skill) vs `Last synced N hours ago (stale)` (MCP) — 文案也不一致

**修复方向**:与 P0-6 修复一同处理:McpMarketplacePage 把 lastSyncedLabel 移到主区 Filter row(配合 CategoryTreeDropdown 添加),从 PageHeader actions 移除。文案统一。

---

## P2 — 体验微调 / 死字段 / 文案不严格

### P2-1:**`imported_marketplace_skills` 后端写入但前端 0 消费**

**证据**:`finalize_skill_install:1256-1261` 写入 `data.imported_marketplace_skills.push(item.id)`,但前端全 codebase grep `importedMarketplaceSkills` 0 命中;TS `AppData.importedMarketplaceSkills?: string[]` 类型存在但无 reader。R-49 / R-36 已记此风险;V1 应避免膨胀。属于 V1.5 评估或现在删除的死字段。

### P2-2:**"View in Skills →" 默认走 `/skills?selected=<id>`,但 SkillsPage useSearchParams 会立即剥离 query**(replace history),用户回退浏览器后退按钮**不能回到带 query 的 URL**

**证据**:`SkillsPage.tsx:236-240` 用 `setSearchParams(next, { replace: true })`,这是为了不留 history hop,但用户从 Marketplace 点 "View in Skills →" 后想"我刚来的那个 query 是什么"无法看到。轻度产品体验问题,V1.5 评估。

### P2-3:**stdio MCP env vars 详情面板的 "Save environment variables" 按钮在 `requiredEnvVars.length === 0` 时仍渲染但无意义**

**证据**:`McpMarketplacePage.tsx:462-467` 在 `requiredEnvVars.length === 0` 时显示 "No environment variables required." 静态消息,**不渲染 Save 按钮**(逻辑上合理) — 但 `mcpType === 'stdio'` 但 `requiredEnvVars` 真实为空的 MCP(罕见)用户看到 section 头 "Required environment variables / This MCP won't work without them." + "No environment variables required." — 这两句矛盾。文案不严格。

### P2-4:**`MarketplaceMcpItem.author` 同时被用作 `marketplaceSource.owner` 和 `marketplaceSource.repo`(`marketplace.rs:1330-1336`)**

**证据**:`marketplace.rs:1330` `repo: item.author.clone()` — 把 author 字符串塞进 repo 字段,语义错乱。SSoT `isMcpInstalled`(`marketplaceStore.ts:843-852`)只用 `owner === item.author && name === item.name` 派生,所以 `repo` 字段从不被用。但 GitHub URL 显示(`MarketplaceSourceBadge`)若使用 `<owner>/<repo>` 模式将显示 `<author>/<author>` — 错误展示。

### P2-5:**Onboarding banner dismiss 不持久化** — 切换页面再回来,onboarding 仍 dismissed(component 状态在 store);**但重启 app 后 banner 重新出现** — PRD §5.0 "dismiss 后不再显示"在 V1 文字 verify。当前实现是会话级,符合 PRD 但不严格"不再显示"。

### P2-6:**`navTargetForItem` 对 MCP 用 `/mcp-servers?selected=<id>`,但 sidebar 路由是 `/mcp-servers`**(grep 已确认 McpServersPage 监听 `selected` query) — 路由一致。不过 marketplace nav item 是 `/marketplace-mcps`,**命名不对称**(skills 都是 plural,mcp 又是 plural — 但 `mcp-servers` 这个 hyphen 与 `marketplace-mcps` 的 hyphen 风格不一致):`/skills` ↔ `/marketplace-skills`(都简单)、`/mcp-servers` ↔ `/marketplace-mcps`(简化的 mcps 与完整的 mcp-servers)。低优。

### P2-7:**`navTargetForItem` 在 banner 内 navigate 后立即 dismiss,但若 SkillsPage useSearchParams 还没读到 query 就 dismiss → banner 闪烁?**

**证据**:`MarketplaceShortcutBanner.tsx:97-103` `handleViewInList`:navigate + dismiss synchronous。React Router navigate 是 sync,但 SkillsPage 的 useEffect 在 next render fire,所以 dismiss 在 useEffect 之前完成。banner 隐藏 + selectedSkillId 设置应同时发生 — 不会有视觉断层。属于 OK,记录此 trace 完整。

---

## 评估总结

| 段 | 闭环逻辑 | 用户视角承诺 | 当前实现 | 评估 |
|---|---|---|---|---|
| **装(Install)** | ~/.ensemble/ + auto_classify event + reload skillsStore | "装完看到分类好" | 装完 ✓;auto-classify 失败时无反馈(P0-4) | **断点** |
| **选(Compose)** | AddToScenePopover diff-save 多次 updateScene | "勾选 Scene → Save → ScenesPage 立即生效" | popover 路径 OK;失败处理静默(P1-2 / P1-3) | 接通 |
| **部署(Sync)** | symlink + .mcp.json | "marketplace 与 local 行为完全一致" | symlink OK;**stdio env 不写盘 P0-1**;Project missing env 提示 P0-2 | **断点** |
| **SSoT §7.4** | 路径 + metadata + not in trash 三条件 | "delete 后立切回 Install" | 派生 OK;Trash restore metadata 丢 P0-3 | **击穿** |
| **跨页面同步** | install → loadSkills | "切去再回来失败态仍在" | OK | 接通 |
| **Trash restore** | metadata 全部继承 | Modal 文案承诺 recover | **完全没继承 P0-3** | **击穿** |
| **stdio config** | 填 env → Save 写盘 → Sync OK | "感知保存了" | "Saved" 反馈 + 不写盘 P0-1 | **欺骗** |
| **active Scene** | lastEditedSceneId snapshot | "banner 抬起瞬间快照" | OK | 接通 |
| **同名碰撞 Modal** | 三选项动态 | local/trashed 双态正确 | OK + 双 mount 隐患 P1-1 | 接通 |
| **`?selected=`** | 短链 navigate + 命中 selectedXId | "回 Skills 详情滑入" | path 一致但 URL 丑 P1-5 | 接通 |
| **OAuth Copy** | 复制 `/mcp` | "复制即可粘贴运行" | 仅复制 `/mcp` 不带 name P1-6 | 接通 |
| **Onboarding** | 双 marketplace 都有 banner | PRD §5.0 | **MCP 没 banner P0-5** | **断点** |
| **Filter row** | 双 marketplace 列表上方 CategoryTreeDropdown + Last synced | PRD §5.8 | **MCP 没 Filter row P0-6** | **断点** |
| **失败态绑定到资源 entry** | installFailedItems[itemId] 持久跨页 | R1-P0-5 | OK(installingItemIds 持续命中驱动 P1-7 OK 但 UX 待商榷) | 接通 |
| **classify failed inline** | Skills 列表 row 显示提示 | R1-P0-4 / PRD §3.2 [5.5] | **0 实现 P0-4** | **断点** |

---

## 修复优先级建议

**必须 V1 修复(P0)**:
1. **P0-1** 新增 `update_mcp_env_vars` IPC,前端 handleSaveEnv 调用 — env vars 真实写盘
2. **P0-2** Project 详情面板增 stdio MCP 缺 env 检测 + 红字提示
3. **P0-3** delete_skill / delete_mcp 在 trash 时 snapshot metadata;finalize_skill_install / finalize_mcp_install 的 RestoreFromTrash 路径恢复 snapshot
4. **P0-4** SkillListItem / McpListItem 订阅 classifyFailedItemIds + inline 提示渲染
5. **P0-5** McpMarketplacePage 加 onboarding banner
6. **P0-6** McpMarketplacePage 加 Filter row(CategoryTreeDropdown + Last synced)

**应当修复(P1)**:统一 collisionModal mount 位置(P1-1);saveSceneAssignments 错误显式反馈(P1-3);addToActiveScene 错误显式反馈(P1-2)

**V1.5 评估(P2)**:imported_marketplace_skills 死字段清理;短链 URL 丑陋;OAuth 命令 server name;Onboarding 跨会话持久化

---

**评审结束。**
