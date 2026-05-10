# E1 — 代码质量与架构评审

> 评审 SubAgent:Opus 4.7
> Scope:Phase A 后端 (`marketplace.rs` 1781 行 + `types.rs` 扩展 + `skills.rs` / `mcps.rs` 注入逻辑) + Phase B 前端 stores (`marketplaceStore.ts` 1003 行 + `marketplace.ts` types) + Phase C UI 集成
> 评审日期:2026-05-09
> 评审角度:静态自动化 gate 之外的逻辑正确性 / 错误处理 / 可测性 / 安全性 / race condition / 资源泄漏

## 0. 评审摘要

**P0 = 5,P1 = 8,P2 = 6**。

整体架构判断:**结构合理,DATA_MUTEX 纪律完整,SSoT 派生模式干净,分层清晰**。但有 **3 个会"破坏 V1 In 8 项功能或导致用户文件被误装到非 skills 目录"的硬伤** + **2 个语义性数据正确性 bug**(其中一个会让 MCP 三元组匹配持续误命中或漏命中,直接破坏 D-Imp-8 SSoT 派生)。auto_classify_new_items 默认值前后端不一致是 D-Imp-12 契约最显眼的违反点。

**修了 P0 后,Phase G 才能宣告交付。** P1 / P2 大多数可在 V1.1 处理。

---

## 1. P0 问题(必修)

### P0-E1-1 路径遍历:`item.name` 直接 join 到 skills/mcps 目录,无任何 sanitisation

- **位置**:
  - `src-tauri/src/commands/marketplace.rs:1166` `let target_dir = skills_dir.join(&item.name);`
  - `src-tauri/src/commands/marketplace.rs:1186` `let mut dest = trash_dir.join(&item.name);`
  - `src-tauri/src/commands/marketplace.rs:1283` `let target_path = mcps_dir.join(format!("{}.json", item.name));`
  - `src-tauri/src/commands/marketplace.rs:1300, 1302` 同 mcps trash 路径
  - `src-tauri/src/commands/marketplace.rs:1125` `let target = dest_dir.join(&entry.name);`(每个 GitHub 子目录条目同样直接 join `entry.name`,无 sanitise)
- **问题描述**:`item.name` 来自 SKILL.md frontmatter `name:` 字段,或 H1 fallback,或 GitHub `full_name.rsplit('/').next()`。三条来源**全部不可信** — frontmatter 是任意 YAML 字符串,GitHub 仓库可由任何人创建。如果上游传 `name = "../../../tmp/x"` 或 `name = "../../../etc/passwd"` 或 Windows 风格 `name = "..\\..\\evil"`,`PathBuf::join` 会顺利解析并跳出 `~/.ensemble/skills/` 目录;`fs::create_dir_all` / `fs::write` 会把文件写到任意位置。`download_skill_recursive` 的 `entry.name` 同样不 sanitise — GitHub 树里可以放 `../foo` 子目录(罕见但 API 不会拒绝)。在 marketplace 已知是用户**主动安装的 untrusted 源**的前提下,这是产品级别的安全问题。
- **影响**:用户在 marketplace 装了一个看似无害的 skill,实际向 `~/Library/LaunchAgents/` 或 `~/.ssh/` 等敏感位置写入文件。此外,`fs::rename(&target_dir, &dest)` 在 Replace 路径下也会按 `item.name` 操作,可能把用户其他 ensemble 子目录(如 `~/.ensemble/data.json` 在 join `../data.json` 时)整个搬到 trash。
- **建议修复**:新增 `sanitize_resource_name()` helper,保留 `[A-Za-z0-9_\-.]`,拒绝包含 `/` `\` `..` 或以 `.` 开头的名字;`install_marketplace_skill` / `install_marketplace_mcp` 入口先校验 `item.name`(及详情中递归用到的 `entry.name`),拒绝则返回 `InstallOutcome::Failed { reason: "Invalid resource name" }`。`download_skill_recursive` 内每个 `entry.name` 也单独校验。(Defense in depth:再加 `.canonicalize()` 后比较是否仍在 `skills_dir` 之内。)

### P0-E1-2 后端 / 前端 `auto_classify_new_items` 默认值不一致 — D-Imp-12 实测会失效

- **位置**:
  - `src-tauri/src/types.rs:361` `auto_classify_new_items: false`(`Default for AppSettings`)
  - `src/stores/settingsStore.ts:81` `autoClassifyNewItems: true`(前端 default)
  - `src-tauri/src/commands/marketplace.rs:1438-1450` 注释声称 "default `true`,符合 `Default for AppSettings`"(注释错的)
- **问题描述**:Phase A 修复日志(implementation_log:80-101)写明"`read_settings 失败时按 flag = `true` 处理(默认开启,符合 `Default for AppSettings`)`",但实际 `Default for AppSettings::auto_classify_new_items = false`(types.rs:361,旧测试 types.rs:1251 也断言 `assert!(!settings.auto_classify_new_items)`)。`spawn_auto_classify` 当前逻辑(marketplace.rs:1446-1449)是:**read_settings 成功且 flag = false 时跳过;失败时不跳过(认为 flag = true)**。但 read_settings **不会失败** — `read_settings()` 在 `~/.ensemble/settings.json` 不存在时返回 `Ok(AppSettings::default())`(data.rs:280-281),而 default 是 false。结果就是:**全新用户(从未打开过 Settings 页)装 marketplace 资源会跳过 auto-classify,而前端 UI 显示 toggle 是开启状态**(因为前端 default 是 true 且 loadSettings 不会写后端的实际 false 值)。用户视角:开关亮着,但功能不生效 → 直观 bug。
  - 反方向:用户在前端关掉 toggle → setAutoClassifyNewItems(false) → settingsStore.saveSettings 写后端 = false → 此时后端跳过 auto-classify(正确)→ 用户重启 app → loadSettings 读到 false → 前端正确显示 off。一旦用户**显式**操作过一次 settings,行为是一致的;但**首次安装**到 settings 写盘前的窗口期里,用户感觉到的是 "开关亮但不工作"。
- **影响**:违反 D-Imp-12 与 PRD §5.5.1。"auto-classify 默认开启"是产品契约;实际默认关闭(直到用户意外打开 Settings 触发一次 saveSettings)。这是 V1 In 8 项之一的功能在用户实测下会被报告为 "不工作"。
- **建议修复**:把 `Default for AppSettings::auto_classify_new_items` 改为 `true`(types.rs:361)+ 更新 types.rs:1251 测试断言。同时把 marketplace.rs:1446-1449 的注释改写为忠实描述当前行为("flag = true 时 spawn,flag = false 时跳过";读 settings 失败时安全选择跳过)。如果担心存量用户被默认翻转打扰,可以加迁移 sentinel:`AppData.has_seen_marketplace_v2` flag,首次进 marketplace 页设 true 并触发 settings.json 写一次默认值。

### P0-E1-3 MCP 三元组匹配的 `repo` 字段被错填为 `author`,使得 SSoT 派生在客户端表面正确但语义错乱

- **位置**:
  - `src-tauri/src/commands/marketplace.rs:1330-1336`(install 写 metadata 时 `marketplace_source.repo = item.author`)
  - `src-tauri/src/commands/marketplace.rs:1414-1415`(`finalize_mcp_install` 同样写 `repo: item.author`)
  - 上游解析:`marketplace.rs:865` `author: owner.clone()` — 解析 GitHub URL 后只用 owner 填 author,**repo 字段被显式 `let _ = repo;` 丢弃**(:877)
- **问题描述**:`MarketplaceMcpItem` schema 不含 `repo` 字段,只有 `author`(= URL 解析 owner)。install 时构造 `MarketplaceSource { owner: item.author, repo: item.author, ... }` 把 owner 重复填到 repo 上。本仓库 SSoT 客户端选择器 `isMcpInstalled`(marketplaceStore.ts:843-851)只检查 `marketplaceSource.owner === item.author && marketplaceSource.name === item.name`,所以**当前 SSoT 派生表面工作**,但有两个隐患:
  1. **当 catalog item 的 repository_url 为空时**(MCP Registry v0.1 完全允许 — 不少 server 没有 GitHub repo,只有 NPM 包名 + 远端 URL),`parse_owner_repo_from_url("") = ("", "")`,导致 `item.author = ""`。装多个无 repository_url 的 MCP 后,`marketplaceSource = { owner: "", repo: "", name: <distinct> }` — name 仍能区分,但任何 selector 通过 owner+repo 都会冲突。
  2. **未来如果任何代码读 `marketplace_source.repo` 用于 sync / restore / open-on-github**,会拿到 author owner 字符串当 repo 用,生成形如 `https://github.com/anthropics/anthropics` 的死链或同款误判。
- **影响**:数据正确性 bug,会污染 `~/.ensemble/data.json::mcp_metadata[*].marketplace_source.repo` 字段,成为永久性脏数据 — 即使将来修了代码,旧装的 MCP 还需要迁移。SSoT 派生**目前**正确;一旦未来其他 surface 用 repo 字段就立即变错。
- **建议修复**:三选一:
  1. 简单方案:`MarketplaceMcpItem` 增加 `repo: String` 字段,在 fetch 阶段把 `parse_owner_repo_from_url(&repo_url).1` 填进去;install 时用真实 repo。
  2. 更克制:`MarketplaceSource.repo` 在 MCP 路径下设为 `Option<String>` 或空串(显式表达 "MCP 没有 repo 概念"),selector 不再要求 repo 三元组,只用 (source, name) 做 unique key。
  3. 重命名:把 `MarketplaceSource` 拆成 `SkillMarketplaceSource`(三元组)和 `McpMarketplaceSource`(双元组 source + name)。

### P0-E1-4 `auto_classify_marketplace_item` IPC 内部双重 gate 让 `read_settings` 失败时行为不一致

- **位置**:`src-tauri/src/commands/marketplace.rs:1464-1478`(IPC 直接 `read_settings()?`)vs `marketplace.rs:1446-1449`(`spawn_auto_classify` 内 `if let Ok(settings)` 容错)
- **问题描述**:`auto_classify_marketplace_item` IPC 第一行 `let settings = read_settings()?;` — read_settings 失败时整个 IPC 返回 Err。如果用户磁盘有问题或 settings.json 损坏,前端调显式 `auto_classify_marketplace_item` IPC 拿到 Err,但同样情况下 install 路径走的 `spawn_auto_classify`(:1446-1450)用 `if let Ok(settings)` 容错 — read_settings 失败时不跳过、继续 spawn。两条路径在错误场景下行为相反。
- **影响**:可观测性差(用户报 "auto-classify failed" 时,实际是 install 路径的 spawn 仍在跑、但显式 IPC 报错),更糟的是 `auto_classify_marketplace_item` IPC 还会把内部错误透传到前端 — 但前端 store 没消费它(没有这条 IPC 的 caller 在 retry 路径里),所以错误被静默吞掉。**结果是 D-Imp-12 toggle 关闭这一动作在 read_settings 失败时**:install 路径继续触发分类(违反 toggle off 契约)→ 用户的 metadata 被写入了非预期的 category/tags → 数据完整性问题。
- **建议修复**:把 `spawn_auto_classify` 内 read_settings 失败时的策略改为"跳过(保守)";`auto_classify_marketplace_item` IPC 内的显式错误传播是合理的,保留即可。两边语义对齐为"read_settings 不可达 = flag 视为 false"(配合 P0-E1-2 修后默认 true 时,这一选择最不破坏用户预期)。

### P0-E1-5 install 完成 → loadSkills/loadMcps → showShortcutBanner 的 IPC 名 vs id 数据流契约不严格

- **位置**:
  - `src-tauri/src/commands/marketplace.rs:1228-1268` `finalize_skill_install` 返回 `InstallOutcome::Installed { skill_id }`,其中 `skill_id = target_dir.to_string_lossy().to_string()`(完整文件系统路径)
  - 同 mcps:1396-1427,`mcp_id = target_path.to_string_lossy().to_string()`
  - 前端 marketplaceStore.ts:467-468 `get().showShortcutBanner(outcome.skillId, 'skill')` — 传入的是后端返回的 path string
- **问题描述**:`outcome.skillId` 字面是文件路径(`~/.ensemble/skills/<name>` 字符串),不是 `Skill.id`(虽然在 scan_skills 实现里 Skill.id 就是 source_path,所以在当前实现下两者等价)。但 banner 的 `targetItemId`、AddToScenePopover 的 `targetItemId`、useScenesStore.scenes[i].skillIds 三处的"id"语义彼此一致依赖于 "Skill.id 永远 == source_path",这是**当前 scan_skills 的偶然实现细节**,不是 schema 契约。`Skill` 的 doc 没说 id 必须是路径;一旦未来 scan_skills 改用 hash / UUID(完全合理重构),整条短路 banner 的 ID 流断链。
  - 同样问题在 isSkillInstalled / isMcpInstalled 的回调:它们派生的命中逻辑,也没用 `outcome.skillId`,但 SkillMarketplacePage 的"已装" badge 必须确认 outcome.skillId 命中已装列表 — 当前依赖 `useSkillsStore.skills.find(s => s.id === outcome.skillId)`(即依赖 source_path 等于 id 等于"返回的字符串")。
  - 这不是当前的可见 bug(因为契约目前满足),但是隐式契约,且由 implementation_log:55-58 已经登记为 "如有歧义可后续重命名为 `id`,但当前与 spec §3.3 / §5.3 保持一致"。
- **影响**:架构脆弱性,Phase G 用户实测可见(MCP 装完后 banner 的"Add to Scene" 按钮如果传错 id 类型,Scene 添加会写入错的字符串,导致后续 useScenesStore 解析失效)→ Add to Scene 在 MCP 路径下无法正确加入 scene。需要在 V1 验收前实测验证。
- **建议修复**:
  1. 显式记录 "Skill.id == source_path" 与 "MCP.id == config_file_path" 这两条不变量到 `src/types/index.ts` 的 doc comment,并在 `scan_skills` / `scan_mcps` 顶部 assert。
  2. 后端把 `InstallOutcome::Installed` 的字段重命名为 `id`(同时 TS discriminated union 也改),消除"skillId 在 MCP 路径下承载 mcp_id"的反直觉。
  3. 前端 marketplaceStore.installSkill/installMcp 入 `showShortcutBanner` 之前,先**显式从 `useSkillsStore.skills` 查找 owner+repo+name 三元组对应的 skill.id**(即:不信任 outcome.skillId,信任 SSoT),再传给 banner;这样即使后端返回字段语义未来改变也不破。

---

## 2. P1 问题(应修)

### P1-E1-1 `download_skill_recursive` 失败时仅 rollback `target_dir`,留 trash 旁路残留

- **位置**:`marketplace.rs:1219-1222`,Replace 路径下若已经把旧版本搬到 trash 但下载失败 → 仅 `fs::remove_dir_all(&target_dir)`,**trash 中的旧版仍在**(用户视角:Skills 列表那一项消失了,只能从 Trash 恢复)。
- **建议**:Replace 路径在下载完成后才 commit 到 trash,而不是 download 之前;或下载失败时把 trash 的旧版恢复到 target_dir(原子化)。

### P1-E1-2 `download_skill_recursive` 大文件 fallback 走 `download_url` 但**不带 GitHub headers**

- **位置**:`marketplace.rs:1130-1141`,`marketplace_http().get(&url).send()` 直接打 `download_url`(GitHub raw.githubusercontent.com 域名)— 不加 `Accept` / `X-GitHub-Api-Version`,且不复用 `github_get_json` 的 rate-limit / 403 处理。
- **影响**:大于 1MB 的文件下载时不走 rate-limit 检测,失败错误信息含义不清;且若该 URL 是私有 fork,需要 token 才能访问,但当前不传 token。
- **建议**:抽出 `github_get_bytes(url) -> Result<Vec<u8>>` 同款 helper,统一 rate-limit / 403 / Network Error 文案。

### P1-E1-3 reqwest Client `.expect("reqwest Client builds with no failures from constants")` 的潜在 panic

- **位置**:`marketplace.rs:111-128` `MARKETPLACE_HTTP.get_or_init(|| { reqwest::Client::builder()...build().expect(...) })`
- **问题**:`reqwest::Client::builder().build()` 可以失败(系统缺 TLS 库 / 平台原因);`OnceLock::get_or_init` 内 panic 会让整个 marketplace 模块失效,且后续任何 IPC 调用都会重新尝试 init 并 panic — Tauri 的 panic boundary 行为对 `tokio` 任务**不友好**。
- **建议**:改为 `try_init` + 在 IPC 入口返回 `Err("HTTP client init failed: ...")`,而不是 panic。

### P1-E1-4 skills.sh scrape 的正则可能匹配到 GitHub URL 中的 readme 链接,产生大量 false positive

- **位置**:`marketplace.rs:714-742`,正则 `https?://github\.com/([\w.-]+)/([\w.-]+)` 会命中 `https://github.com/foo/bar/issues/123`(被 `repo == "issues"` 过滤,但不全)、`https://github.com/foo/bar.git`(repo 含 `.git`)、`https://github.com/foo/bar#section`(repo 含 `#`)等。当前过滤了 `issues`、`github`、`.png`、`.jpg`,但完全不抗 `bar.git` / `bar/blob/main/...`(blob 会被当作 repo 名)。
- **影响**:scrape 出来一堆假 owner/repo 三元组;后续 metadata fetch 100% 404,白费 GitHub API quota;`marketplace:catalog-enhanced` 事件触发的 reload 也带着假数据。
- **建议**:正则约束 `repo` 必须 `[\w-]+(?!/)`(非 slash 结尾)+ trim `.git` / `#anchor` / `?query` 后比较;或更严格的 GitHub URL parser(`url::Url`)然后只接 path 长度恰好为 2 的(`/{owner}/{repo}` 而不是 `/{owner}/{repo}/foo`)。

### P1-E1-5 `regex` crate 在 marketplace.rs 内首次使用,`Cargo.toml` 未在 implementation log 中明确登记

- **位置**:`marketplace.rs:714` `regex::Regex::new(...)`
- **问题**:implementation_log:32 提到 "Cargo.toml 改动:tokio features 增加 sync 与 rt",**未提 regex 依赖来源**。需要确认 `regex` crate 已经在依赖图里(一般 Tauri 项目通过其他依赖传递引入,但本项目应显式登记)。
- **建议**:`grep -n '^regex' src-tauri/Cargo.toml` 验证;若是传递依赖,Cargo.toml 加显式直接依赖,以免传递依赖未来去除导致编译失败。

### P1-E1-6 `Default for SkillMetadata` 派生 → `enabled: false`(`Default::default()` 对 bool 是 false),与 install 路径预期 `enabled: true` 不一致

- **位置**:`marketplace.rs:1240-1254` `data.skill_metadata.entry(...).or_insert_with(SkillMetadata::default)` — 新建条目时 `enabled` = false。但所有现有 marketplace 装的 skill 出现在 Skills 列表后,默认 `enabled=false` → 用户在 Skills 页面看到刚装的 skill 灰色状态,需要手动开启。R3 §3 / scan_skills:255 `enabled: metadata.map(|m| m.enabled).unwrap_or(true)` 设了 fallback,但**有 metadata 时**用 metadata 的值(即 false)。
- **影响**:用户装完 marketplace skill,默认不可用 → 必须再点"启用"开关。违反 V1 In "装完即用" 直觉。
- **建议**:`finalize_skill_install` / `finalize_mcp_install` 在 `or_insert_with(default)` 后,显式设 `entry.enabled = true`(若是新建)或保留旧值(若已存在)。同时 `Default for SkillMetadata` 加 `enabled: true` 也行 — 但要排查所有 caller(例如 import.rs)是否会受影响。

### P1-E1-7 `addToActiveScene` 把 `scene.skillIds`/`scene.mcpIds` 传 spread shallow copy,但读端是 mutate 引用

- **位置**:`marketplaceStore.ts:727-734` `const skillIds = itemType === 'skill' ? [...scene.skillIds] : scene.skillIds;` — `itemType === 'skill'` 拷贝;否则**直接传引用**给 `scenesStore.updateScene`。如果 `updateScene` 内部对入参 mutate(虽然不应该),会污染 store state。
- **建议**:`scenesStore.updateScene` 入参用 readonly,或两路径都用 shallow copy。

### P1-E1-8 marketplaceStore.installSkill / installMcp 在 `await safeInvoke<InstallOutcome>(...)` 返回 null 时(浏览器模式)直接抛 throw

- **位置**:`marketplaceStore.ts:442-444` `if (!outcome) { throw new Error('Backend returned no install outcome'); }`
- **问题**:isTauri() 检查在 :415-417 已经短路;理论上 :437 到 :440 不会拿到 null。但 `safeInvoke` 还有一种返回 null 路径:`await import('@tauri-apps/api/core')` 失败(罕见,但会发生在 Tauri 包加载后被 unload 的极端场景)。当前 throw 进 catch (:501),写 installFailedItems,行为 OK,但 message = "Backend returned no install outcome" 对用户不友好。
- **建议**:throw 之前判断是否仍 isTauri(),如果在浏览器,silent return;否则记 friendly error。

---

## 3. P2 问题(后续迭代)

### P2-E1-1 base64_simple 内联实现接受 `+` `-` `/` `_` 同视为 62 / 63,**不验证标准 vs url-safe 一致性**

- **位置**:`marketplace.rs:351-352` `'+' | '-' => 62, '/' | '_' => 63,`
- **观察**:RFC 4648 把标准 alphabet 的 `+` 和 url-safe 的 `-` 视为 disjoint,实际不应该混用。GitHub Contents API 始终返回标准 base64,所以这只是过度宽容,不会产生错误结果(标准 alphabet 不会出现 `-`/`_`),但混用看起来奇怪。
- **建议**:V1 不修;若未来加自动签名 / OAuth callback 处理 url-safe payload,严格分两条路径。

### P2-E1-2 `auto_classify` 调用的 `claude` CLI 子进程不在 marketplace.rs 直接看到失败模式

- **位置**:`marketplace.rs:1562-1564` `auto_classify(...).await?` — 该函数(classify.rs 实现)spawn `claude` CLI;如果用户机器 PATH 没有 `claude`,失败会被 `?` 上抛,然后 `marketplace:classify-failed` event 派出。
- **观察**:这是已知降级路径(R-3),implementation_log:172 也记了。但前端 listener 当前只 set `classifyFailedItemIds`,不显示具体 error,用户不知道是 PATH 问题还是其他。
- **建议**:UI 在 inline "Auto-classify failed — assign manually" 文案下加一个折叠展开,显示后端 error 字段(R1-P0-4 已部分覆盖,但 V1 没真做)。

### P2-E1-3 `tokio::spawn(async move { ... })` 内 panic 不会被 caller 看到

- **位置**:`spawn_skills_scrape_enhancement` (`marketplace.rs:938`) / `spawn_auto_classify` (`marketplace.rs:1440`)
- **观察**:tokio JoinHandle 默认丢弃,panic 仅记录到 stderr。当前所有 spawn 内的逻辑都用 Result<> + `let _ = app.emit(...)`,但只要任何一处 unwrap / array index OOB / 未来加的 `.expect`,panic 就会静默吞掉,前端永远看不到。
- **建议**:V1 不修;V1.1 加 `tokio::spawn` 的统一 wrapper,catch_unwind 后 emit 一个 `marketplace:internal-error` event 用于 debug build 显示。

### P2-E1-4 `parse_owner_repo_from_url` 不处理 `.git` 后缀 / `git@github.com:` ssh 前缀

- **位置**:`marketplace.rs:767-775`
- **观察**:MCP Registry 中很多 server 写 `repository.url = "git@github.com:foo/bar.git"`(SSH URL)或 `https://github.com/foo/bar.git`,当前 strip_prefix 只识别 `https://github.com/` 前缀,SSH 形式直接 fallback `("", "")`;`bar.git` 形式 repo 字段保留 `.git`。
- **建议**:strip 多种前缀(`https://`、`http://`、`git@github.com:`、`ssh://git@github.com/`),repo 末尾 trim `.git`。

### P2-E1-5 `MarketplaceCatalog<T>` 没 schema version 字段 — 未来格式变更需要 migration 但没钩子

- **位置**:`types.rs` `MarketplaceCatalog` + `marketplace.rs:923-927` 写时只填 `items / last_synced_at / source`
- **观察**:cache 文件 schema 一旦改(V1.1 加 `weekly_installs` 字段)→ 旧 cache 反序列化要兼容,目前依赖 serde `#[serde(default)]` 但没显式 version 字段。
- **建议**:V1 不修;V1.1 加 `version: u32` 字段 + 反序列化时 version mismatch → 视为 cache miss + delete 旧文件。

### P2-E1-6 `download_skill_recursive` 无文件大小 / 总大小限制

- **位置**:`marketplace.rs:1108-1156`
- **观察**:GitHub Contents API 单文件 1MB 限制 + repo 大小理论无限。下载一个 skill 整个目录可能拉下数十 MB(如果 repo 在 skill 路径下塞了大资产);`fs::write` 一次性写完,无 progress feedback,超大文件 + 慢网络 = 用户感觉卡死。
- **建议**:V1 不修,catalog 设计已经选小型 skill;V1.1 加 download size 守门(检测 entry size > N MB 时 abort + 友好提示),并 emit `marketplace:download-progress` event 让 UI 显示进度。

---

## 4. 质量评估总结

### 正面观察

1. **DATA_MUTEX 纪律完整**。grep 的 7 处 read_app_data + 5 处 write_app_data 全部在 `DATA_MUTEX.lock()` 内;唯一例外是 `run_auto_classify:1486` 的纯读路径(当前 Phase A 笔记已说明,符合现有 `get_categories` 不锁惯例)。defense-in-depth grep `data_path|app_data\.\w+_metadata|fs::write.*data\.json` 在 marketplace.rs 内**0 hits**,无 bypass 通道。
2. **cfg(test) panic guard 间接覆盖到位**。所有 marketplace 路径函数走 `get_app_data_dir()`,自动继承 path.rs:46-52 的 `cfg(test)` panic;`#[should_panic]` 正向测试存在(path.rs:227-251)。
3. **HTTP Client OnceLock 单例正确**,User-Agent 与 GitHub 的 `Accept` / `X-GitHub-Api-Version` headers 都从 spec 验证过来,15s timeout 合理。
4. **scrape 永远不阻塞 IPC** 的契约确实落地 — `tokio::spawn` 在 spawn_skills_scrape_enhancement 内 fire-and-forget,30s timeout 后丢弃,任何 scrape 失败仅 emit `marketplace:scrape-degraded`,不影响 seed IPC 返回。
5. **McpConfigFile 五处构造点字段一致** — 通过 grep 验证 `marketplace_source: ...` 在 marketplace.rs:1376 / import.rs:692,718,755 / plugins.rs 全部 present。R-57 关切已闭环。
6. **SSoT 客户端不缓存 installedSet** 设计干净 — `isSkillInstalled` / `isMcpInstalled` 现场派生,zustand 不发生 stale state。三元组优先 + name fallback 双路径都在(marketplaceStore.ts:824-855)。
7. **Tauri event listener unsubscribe 正确**:`initEventListeners` 返回单 unlisten 函数收敛 6 个 listener;MainLayout 顶层 mount 一次 + StrictMode 双跑保护(implementation_log:118)。
8. **install / collision / SSoT-reload 三阶段流转干净**:`installSkill` 成功 → loadSkills → showShortcutBanner,顺序符合 spec §6.4。

### 整体架构判断

**质量约 7.5 / 10**:核心 happy path 与 SSoT 契约扎实,DATA_MUTEX 纪律和单例模式都对。**最大风险集中在三处** —

1. **路径未 sanitise**(P0-E1-1):安全级别问题,在 marketplace 这种"装第三方资源"产品里**必须修**。GitHub repo 名规则不允许 `..`,但 SKILL.md frontmatter 完全能放任意字符串,不能依赖上游善意。
2. **default 不一致 + read_settings 失败处理不一致**(P0-E1-2 / P0-E1-4):D-Imp-12 契约在前端 / 后端 / 注释三处描述不同,实际 runtime 行为依赖于哪条路径先触发。修法很简单(types.rs:361 改 true + 注释说真话)但必须在 Phase G 用户实测前修。
3. **MCP 三元组语义错乱**(P0-E1-3):当前 SSoT 派生表面工作,但写入的 metadata 是脏数据,任何未来读取 marketplace_source.repo 的代码都会撞坑。这是会污染数据 forever 的 bug,优先级高于纯 UX 问题。

**修了 5 个 P0 后,V1 In 8 项功能在静态层面通过。** UI 视觉与跨视图切换、reduced-motion fallback 的实际行为留给 E2 视觉评审与 Phase G 用户实测兜底,本评审角度不涵盖。
