# Angle Expert A — Bug Audit 评审角度建议

## 我的分析方法

我在阅读 `CLAUDE.md`、`src-tauri/src/lib.rs`(98 个 IPC commands)、`types.rs:1-300`(核心实体)、`App.tsx`、`commands/config.rs`(SYNC 写入)、`commands/claude_md.rs:1-200`(scan + 独立文件存储)后,刻意没有套"安全/性能/可用性"这种通用模板,而是用两个互相正交的维度去 inventory 这个 app 实际发生的工作:

**维度 1 — 数据流(this app does what)**

我数出 5 条 qualitatively distinct 的数据流:
1. **INGEST**: scan 用户磁盘 (`~/.claude/skills/`、`~/.claude.json`、plugin cache、本地任意目录) → 构造运行时实体
2. **STORE**: 持久到 `~/.ensemble/`(data.json + 独立 skill 目录 / mcp json / claude-md 文件 / rule 文件),由 `DATA_MUTEX` 串行化
3. **SYNC OUT**: 把 Scene 落到 Project (`<project>/.claude/skills/` symlink、`.mcp.json`、CLAUDE.md 三种路径、`.claude/rules/<filename>.md`),把 global CLAUDE.md / Rules 写到 `~/.claude/`,把 MCP scope 写到 `~/.claude.json`
4. **EXTERNAL FETCH**: skills.sh marketplace、registry.modelcontextprotocol.io、GitHub codeload zip、plugin cache discovery
5. **PRESENT**: Zustand stores + 优化更新 + version counter + UI tree(Skills/MCP/CLAUDE.md/Rules/Scenes/Projects/Categories/Tags + 两套 detail panel)

**维度 2 — 生命周期阶段(when)**

- **STARTUP**: single-instance 检查 + `--launch` 参数解析 + migration (`migrate_claude_md_storage`、`migrate_category_id_for_skills_mcps`、legacy MCP cache 清理) + 第一次 scan + window hide-on-launch
- **STEADY-STATE**: 用户 CRUD、reorder、sync、import、auto-classify、marketplace browsing
- **CLEANUP / RECOVERY**: delete → trash、restore from trash、clear project config、uninstall plugin、退出 app

把每个 bug 想象成落在 (flow × stage) 网格上,我观察到 cluster 而非 uniform 分布 — 有几个 cluster 各自有自己的失败原理、自己的攻击者(用户?磁盘?上游?并发?),把它们各自当一个 angle 比按文件分组更不冗余。我反复测试了"如果只能砍一个 angle,哪个砍掉损失最小",每砍一个都会丢失一个独立的 bug 类别 — 这是 N 的 floor。

我额外的判断:**angle 不需要互斥** — 一个 bug 可以同时被两个 lens 看见,反而是健壮性。Completeness 的真正定义不是"angles partition all bugs",而是"every important bug class is visible through at least one lens"。我的论证沿这条线建立。

## 我建议的评审角度

### Angle 1: Disk ↔ Memory 一致性 (Ingest + Persistence Consistency)

**核心问题**: 磁盘真实文件状态、`data.json` 元数据、运行时实体(`Skill` / `McpServer`)三方是否始终一致?

**覆盖代码范围**:
- `commands/skills.rs` (scan_skills, get_skill, update_skill_metadata, delete_skill)
- `commands/mcps.rs` (scan_mcps + 衍生 scope 逻辑 + provided tools)
- `commands/claude_md.rs` (scan_claude_md_files, get_claude_md_files, read_claude_md_content)
- `commands/rules.rs` (scan_rules, get_rules, set_global_rule, update_rule 的 `is_global` 镜像)
- `commands/data.rs::DATA_MUTEX` 覆盖面 + 所有 `read_app_data` → mutate → `write_app_data` 的 helper
- `commands/plugins.rs` 的双重 install_source 标记
- `utils/path.rs` (expand_path / expand_tilde / collapse_tilde, 影响 id 比较)

**代表性 bug 类型**:
1. **id == sourcePath 不变式破裂**: 同一磁盘 path 在不同地方走 expand_tilde / collapse_tilde / canonicalize / OS NFC vs NFD 的差异,导致 `sceneId` 引用找不到 `skill_metadata` 中的 entry — 静默 fallback 为 "orphan id 忽略",用户看不到自己的 skill 已经掉队
2. **Scan 与 metadata 失同步**: 用户在 Finder 里 rename 一个 skill 目录,scan_skills 把 new path 当作新 skill 加进来,旧 metadata 留下成幽灵(category / tags / usage 全丢)— `data.json::skill_metadata` 永远不收敛
3. **HashMap 反序列化破裂**: 某条 mcp metadata 的字段在新版本里改了类型(例:`required_env_vars` 从 `Vec<String>` 变 `Vec<EnvVarSpec>`),导致整个 `mcp_metadata` HashMap 反序列化失败 — 后续 write 把空 HashMap 写回,所有 metadata 一次性消失(见 CLAUDE.md "Serde HashMap" 警告)
4. **Plugin symlink 的源被删**: plugin 卸载后 `~/.ensemble/skills/<x>` 是 broken symlink,scan 可能 silently 丢弃,也可能报错冒泡到用户;两种行为都没有"清理 metadata"的路径
5. **Marketplace install 留下半成品**: codeload 下载后解压一半失败,`~/.ensemble/skills/<x>/` 目录已存在但内容不完整,但 scan 仍然识别 — 用户看到 skill 但 sync 时崩
6. **Provided tools cache stale**: `scan_mcps` 衍生 `provided_tools` 是否每次都重读?若缓存,MCP 升级后 tool list 仍是旧的

**与其他 angle 的边界**: 这个 angle 关注 *Ensemble 自己看到的状态* 是否自洽。SYNC 之后写到 project / `~/.claude.json` 的破坏归 Angle 2。Marketplace HTTP 抓回来的字段 schema drift 归 Angle 3 直到 it lands on disk,然后 Angle 1 接管。

---

### Angle 2: 对外写入 — 用户文件的破坏面 (Outward Writes to User-Owned Files)

**核心问题**: 当 Ensemble 写到 *它不拥有* 的位置时,是否可能丢失或污染用户已有的数据? Clear / Sync / global toggle / scope toggle 的 blast radius 多大?

**覆盖代码范围**:
- `commands/config.rs` (write_mcp_config, sync_project_config, clear_project_config) — 写 `.mcp.json` / symlink / 三种 CLAUDE.md 路径
- `commands/claude_md.rs::set_global_claude_md / unset_global_claude_md / distribute_*` — 写 `~/.claude/CLAUDE.md` + `~/.ensemble/claude-md/global-backup/`
- `commands/rules.rs::set_global_rule / unset_global_rule / update_rule` 在 `is_global=true` 时镜像写 `~/.claude/rules/<filename>.md`
- `commands/import.rs::update_mcp_scope / update_skill_scope` — 修改 `~/.claude.json::mcpServers` 或 `~/.claude/skills/`
- `commands/symlink.rs` — symlink 创建 / 删除策略
- `commands/import.rs::backup_claude_json` / `backup_before_import` — 导入前 backup 是否真的保护住了
- `commands/marketplace.rs` 的安装 IPC — codeload 解压时是否可能 path traversal 出 ensemble dir

**代表性 bug 类型**:
1. **`clear_project_config` 误删用户手写文件**: 三种 CLAUDE.md 路径无差别全删(CLAUDE.md 的 inline 注释承认这一点);如果用户在 project root 有自己手写的 `CLAUDE.md`,Clear 会一并干掉而无任何 backup
2. **`sync_project_config` 在符号链接的 project 上踩自己**: 用户 project path 本身是个 symlink 到另一目录,`expand_path` 不做 canonicalize,后续 `fs::remove_file` 可能影响真实路径或留下 dangling
3. **Global Rule filename 冲突**: 两条 Rule 的 `filename` 字段相同,both `is_global=true`,第二个 set_global 静默覆盖第一个的 `~/.claude/rules/<filename>.md` — 用户以为两条都生效,实际只有一条
4. **MCP scope 切换写错文件**: `update_mcp_scope("global")` 应该写 `~/.claude.json::mcpServers`,但若用户的 `~/.claude.json` 里有 unparseable 字段(老 Claude Code 版本),写回时整个文件被 reformat 或破坏其他 keys
5. **`backup_before_import` 是否原子**: 写 backup 文件 + 后续 mutate 之间若 app 崩溃,用户重启后既没有 backup(写一半)也没有原始(覆盖了一半),数据双重丢失
6. **Distribute CLAUDE.md 时三路径冲突**: project 同时存在 `CLAUDE.md` 和 `.claude/CLAUDE.md`,distribute 写其中一个但保留另一个 — Claude Code 实际读哪一个不确定,用户期望失效
7. **删 Scene 时 trash 写满磁盘**: trash 不限大小,deletion 也写文件;在用户磁盘已满时 trash 写失败,但 data.json 已经把 entry 移到了 trashed list — recover 路径失效
8. **Codeload zip 含 `../` 导致写出 `~/.ensemble/` 外**: marketplace 安装解压时是否 sanitize path?攻击 marketplace 上传一个恶意 zip,可以写到任意 user-writable 路径
9. **Symlink 删除把目标文件也删掉**: `fs::remove_file` 在 symlink 上正确,但若代码错用 `fs::remove_dir_all` 或先 follow 再 remove,会删掉真实 skill 内容

**与其他 angle 的边界**: 这个 angle 是 Ensemble 对用户世界的 *destructive surface*。Angle 1 关注 Ensemble 自己看到的内部一致性;Angle 2 关注 Ensemble 是否在让用户世界变坏。"sync 写到错位置但 Ensemble 自己以为成功"这类 bug 主要落 Angle 2(用户感知的损失),次落 Angle 1(自检失败)。

---

### Angle 3: 外部上游信任边界 (External Upstream Trust)

**核心问题**: skills.sh、registry.modelcontextprotocol.io、GitHub codeload、Claude Code plugin marketplace 这些 *Ensemble 无法控制* 的字节流,在被消化的全过程中,是否做了足够的输入验证、错误恢复、schema-drift 容忍?

**覆盖代码范围**:
- `commands/marketplace.rs` (~4554 行 — list_marketplace_skills、search、get_readme、install_marketplace_*、list_marketplace_mcps_page、search_marketplace_mcps、refresh_marketplace_cache、update_mcp_env_vars、update_mcp_http_config、auto_classify_marketplace_item)
- `commands/marketplace_seed.rs` (validate-curated-upstream-ids.md 历史 case)
- `commands/plugins.rs` (detect_installed_plugins、detect_plugin_skills、detect_plugin_mcps、check_plugins_enabled)
- `commands/import.rs::detect_existing_config` 对 `~/.claude.json` 的容忍度
- `commands/classify.rs` 对 Anthropic API 的调用 + 错误处理
- skills.sh internal API 的实际响应行为(reference memory 有记录)

**代表性 bug 类型**:
1. **Schema drift 让整个 marketplace page 空白**: registry.modelcontextprotocol.io 加了一个新字段或改了字段类型,Rust 端 `serde::Deserialize` 失败,整页 list 返回 empty 而不是"部分可见 + 错误标记"
2. **Codeload zip 带 archive bomb**: 一个 1KB 的 zip 解压成 10GB,占满磁盘
3. **Marketplace pagination 无限循环**: 上游返回 `next_page` 总是 truthy,Ensemble 无 max iteration guard,内存增长 unbounded
4. **HTTP 超时无反馈**: refresh_marketplace_cache 在 hotspot 网络下 hang 30s,前端无 cancel,用户以为卡死
5. **Auto-classify 把 API key 留给 plain HTTP**: classify.rs 调用 Anthropic 时是否走 https + 是否泄漏到日志
6. **Hallucinated curated list 不再 hallucinated 但失效**: marketplace_seed.rs 的 50 条历史上 80% 假货(memory 中有记录),但即使是真货也会随时间失效(repo deleted / renamed),无 health check
7. **Plugin cache scan 撞 symlink loop**: `~/.claude/plugins/cache/...` 是 Claude Code 维护的,Ensemble 只是 follow;若 plugin 安装失败留下循环 symlink,WalkDir 是否 stack overflow
8. **Marketplace HTTP 不发 Origin/Referer**: validate-no-public-api-claim Rule 提到的,某些 endpoint 不带 browser header bundle 就 401,Ensemble 看到 401 误判为"不存在"
9. **install_marketplace_mcp 没拿到 env var spec**: 上游已经更新 env requirement,但 Ensemble 装的是旧版本本地缓存,user 不知道少了哪个环境变量
10. **rate limit / 429 处理**: GitHub codeload 在大批量安装时 429,Ensemble 是否退避还是直接报错

**与其他 angle 的边界**: 数据一旦落到 `~/.ensemble/` 之后,后续 bug 归 Angle 1(consistency)和 Angle 2(outward write)。Angle 3 严格守在 HTTP / 解压 / 第一次入库 *之前* 这段路径。auto-classify 算 Angle 3(对 Anthropic API 的调用),但 classify 结果 *写回 metadata* 的 race condition 算 Angle 4。

---

### Angle 4: 并发与状态一致性 (Concurrency, Ordering, State Coherence)

**核心问题**: 多个 IPC 同时飞、frontend optimistic update 与 backend 真实状态错位、`DATA_MUTEX` 覆盖不全的 helper、version counter 的 stale-response 检测,是否真的能 hold 住?

**覆盖代码范围**:
- `commands/data.rs::DATA_MUTEX` + 所有 `read_app_data` / `write_app_data` callsite(`grep-before-enumerate-shared-resource` Rule 的具体目标)
- 所有跨文件的 helper(如 `import.rs::update_mcp_scope_in_metadata`、`trash.rs::restore_*`、`claude_md.rs` / `rules.rs` 各 mutator)是否都过 mutex
- 所有 `src/stores/*.ts` 的 optimistic update + version counter 模式
- `data::reorder_categories` / `reorder_tags` 与 sidebar drag UI 的 two-phase commit
- `tauri_plugin_single_instance` 二次启动事件处理 + `--launch` 参数 routing
- `appStore::saveSettings` 与其他 mutator 的相互覆盖(memory 中提到 enumerate 风险)

**代表性 bug 类型**:
1. **Helper 绕过 mutex**: `import.rs` / `trash.rs` 的某些 helper 直接 `fs::write(data.json)` 而不走 `write_app_data`,与正在进行的 reorder 并发写 → lost update(grep-before-enumerate Rule 的精确触发场景)
2. **Frontend race: delete 与 reorder 同时发起**: 用户右键 delete category A 时仍在 drag B,delete IPC 先到、reorder IPC 后到、reorder 用的是 pre-delete 的 order — silent 还原 deleted entry
3. **`auto_classify` 返回 vs 用户已 manual classify**: classify 是长 IPC,期间用户已经手动改 category,classify 返回后覆盖 user choice
4. **Migration on startup + 用户立即操作**: app 第一次 launch,migration 还在跑,前端已经发了 scan_skills,scan 看到 migrate 半完成的 data.json,行为未定义
5. **Single-instance second-launch 与现 active modal**: 用户正在 Skill 编辑 modal 里,Finder Quick Action 发来 second-instance event,前端 navigate 走,modal 关闭丢失编辑
6. **Reorder version counter 不 increment 的 case**: optimistic update 收到 stale response 时只在 reorder 路径有 guard,普通 update_metadata 没有 — 用户快连改两次 description,后到的请求覆盖先到的
7. **Trash restore + 同名新 Skill**: 用户删了 skill X,又装了 marketplace skill 同名 X,sourcePath 相同 → restore 是覆盖、报错、还是 silently no-op?
8. **DATA_MUTEX deadlock**: 一个 command 持锁时调用另一个 helper,helper 也试图持锁

**与其他 angle 的边界**: Angle 4 关注 *操作顺序与同步*,Angle 1 关注 *steady-state 两个 store 的对账*。一旦操作完成,谁赢谁输是 Angle 1 的事;操作进行中谁应该等谁是 Angle 4。

---

### Angle 5: 生命周期 — 启动 / 迁移 / 关闭 / 恢复 (Temporal Edges)

**核心问题**: 这个 app *最不像 steady-state* 的几个时刻 — 第一次启动、版本升级后的 migration、Finder Quick Action 唤起、window close 但进程留存、trash 永久删除 — 是否都处理得严密?这些路径运行频率低 → bug 难暴露 → 一旦触发后果重(用户数据 / 用户错觉 app 没启动 / migration 写坏 data.json)。

**覆盖代码范围**:
- `lib.rs::run` 整个 setup + on_window_event + RunEvent::Reopen + single_instance plugin + tauri_plugin_log 初始化
- `claude_md::migrate_claude_md_storage` (内嵌 content → 独立文件)
- `data::migrate_category_id_for_skills_mcps`
- `marketplace::cleanup_legacy_mcp_cache`
- `commands/trash.rs` 全部(list_trashed_items / restore_* / permanent delete 路径)
- `import::install_quick_action / launch_claude_for_folder / get_launch_args` Automator 集成
- `--launch` argument 的解析 + 路由
- `commands/usage.rs::scan_usage_stats`(扫历史 token usage,运行频率低)
- `replace-installed-app-in-place.md` Rule 涉及的 install 时序

**代表性 bug 类型**:
1. **Migration 中途崩**: `migrate_claude_md_storage` 在 100 个文件迁移到一半时 panic,下次启动如何检测半完成状态?有没有 idempotent guard?
2. **`migrate_category_id_for_skills_mcps` 在大数据上慢**: 用户 500 个 skill,启动卡 10 秒,无进度条,用户以为冻死、强杀 → migration 半完成 + 下次启动重跑 + 重复半完成
3. **`has_completed_category_id_migration` flag 写到 settings 还是 AppData**: CLAUDE.md 提到刻意放 AppData 以躲 settingsStore enumerate 风险 — 如果回归到 settings,migration 每次启动重跑
4. **`--launch <path>` 路径 contains spaces / unicode**: shell 转义不当时,arg index+1 拿到的是被切断的 path
5. **Second-instance 在主 instance 启动到一半时收到**: setup 还没跑完,migration 没结束,emit `second-instance-launch` 给前端,前端开始 navigate,backend 还没 ready
6. **window.hide 与 dock-click reopen 时无窗口可显示**: 比如全部 webview windows 都 closed,RunEvent::Reopen 拿不到 window
7. **Trash recovery 时引用的 category 已被删**: skill 在 trash 里,restore 后它的 category_id 在主 data 里已经不存在 → 静默成 "Uncategorized" 还是报错?
8. **Trash 永久删除时还有别处引用**: 例如 Trashed Scene 里的 skill_ids 已经被永久删,但 Trashed Scene 自己还活着,restore Scene 后引用全 orphan
9. **App 升级后 data.json schema 倒退**: 新版加了 default 字段,反序列化 OK;但用户回滚到旧版,旧版不识别新字段、写回时丢字段 → 再升回新版数据已损
10. **`.app` 替换流程留下双进程**: replace-installed-app-in-place Rule 关心 install 时序,但若 dock 里的 app 仍在跑而 `/Applications/Ensemble.app` 已被替换,下次窗口 reopen 行为如何?

**与其他 angle 的边界**: 我把 startup / migration / restore 单独切出来,是因为它们 *只在低频时机运行*,reviewer 在常规 happy-path 测试中根本不会经过,但 bug 一旦发生 blast radius 极大(data.json 损坏、用户 panic)。Angle 4 的并发问题如果发生在 *startup 期间* (migration 与 user IPC race) 我也归 Angle 5 — 因为 trigger 是"什么时候发生"而非"做了什么"。

---

### Angle 6: 前端渲染、用户交互、可用性 (Frontend & Interaction)

**核心问题**: React tree 在 ~13k LoC、16 个 store、~12 个 page、两套 detail panel(主页 inline + Category/Tag page 独立组件,CLAUDE.md 易错点 #5 强调过)的体量下,是否存在 stale closure、列表 key 冲突、focus 丢失、modal 焦点陷阱、键盘可达、reorder UI 与 backend version counter 错位、a11y 回归?

**覆盖代码范围**:
- 全部 `src/pages/*.tsx`(尤其 `SkillsPage` / `McpServersPage` / `CategoryPage` / `TagPage` 的双实现并存)
- 全部 `src/stores/*.ts` 中的 optimistic update / selector 编写
- `src/components/` 下的 modal、sidebar、drag-reorder UI(`SortableCategoryRow`、`DragOverlayCategoryRow`)
- `src/utils/tauri.ts::safeInvoke` 错误处理向 UI 的回流
- `MarkdownBody` 的 render path(三种实体共用,XSS / 大文档卡顿)
- Reorder 的 two-phase commit 在 UI 上的体感

**代表性 bug 类型**:
1. **Detail panel 双实现漂移**: inline detail 在 SkillsPage 加了字段,SkillDetailPanel(CategoryPage 用)没加,用户切换页面看到字段时有时无
2. **Markdown 大文档冻 UI**: CLAUDE.md 内容 50K 字时 react-markdown 同步 parse 阻塞主线程
3. **Modal 焦点陷阱遗漏**: 编辑 skill modal 内 Tab 跳出到背景元素,用户回不来
4. **List key 用 array index**: scene reorder 时 React 误认 row identity,DragOverlay 显示错误内容
5. **safeInvoke 错误吃掉**: 某些 IPC 失败 toast 没出,store state 半 mutated,UI 显示假成功
6. **Optimistic update 不回滚**: IPC 失败后 frontend store 没 revert,刷新页面才发现状态错
7. **Sidebar tree 渲染层级超 2 层**: 父子规约要求 max depth 2(types.rs),若数据被外部破坏成 depth 3,UI render 会怎样
8. **Page navigation 丢失 pending IPC**: 用户在 SkillsPage 发了 update,立刻切去 MCPs,update 失败 toast 出在哪一页?
9. **A11y 回归**: design-language Rule 提到 disclosure 必须是 real `<button>` 而非 `<div role="button">`,改 UI 时易回归
10. **重启后未持久化的 UI 状态**: scroll position、展开的 category、选中的 detail panel — 全丢失,中断工作流

**与其他 angle 的边界**: Angle 6 的失败 *用户看得见但状态未必坏*(toast 没出 vs data.json 坏掉是两回事);Angle 1 / 4 的失败 *底层错* 但 UI 可能仍显示成功 — 两者互补不互替。

---

### Angle 7: 环境与边缘部署 (Host & Environmental Edge Cases)

**核心问题**: 用户的 macOS 环境不是 developer 的开发机。多用户机、iCloud 镜像 Documents、locale 非 UTF-8 / NFC vs NFD、磁盘满、permission denied、accessibility 未授权、terminal app 不是默认的、网络代理、Time Machine restore — 任何一个非 default 假设都可能让 happy path 崩。

**覆盖代码范围**:
- 所有调用 `dirs::home_dir()` / `expand_tilde()` 的代码(home dir 为空 / 在 sandbox 下不可写时)
- `commands/skills.rs / mcps.rs` 的 scan 路径假设 `~/.claude/` 存在
- `commands/dialog.rs::select_folder` 在 sandbox / accessibility 下的失败模式
- `commands/import.rs::install_quick_action / open_accessibility_settings` — Automator 集成,需要用户授权
- `commands/usage.rs::scan_usage_stats` 处理用户从未跑过 Claude Code 的情况
- terminal app launcher (`launch_claude_for_folder`) — 支持 iTerm/Warp/Alacritty/Ghostty/Terminal.app,各家 URL scheme / process spawn 行为不同
- 任意大数据规模(memory 提到的大数量 skill / MCP 场景)
- Locale-sensitive 比较(filename 大小写、NFC vs NFD on APFS)

**代表性 bug 类型**:
1. **多用户机器**: 同一台 Mac 两个 user 各自有 `~/.ensemble/`,但若 app sandbox 配置让一个 user 看到另一个 user 的 data,leak / corrupt
2. **iCloud Documents 同步**: 用户的 ~/.ensemble 不在 iCloud 但 ~/.claude 在 iCloud(罕见但可能),iCloud 异步 reformat path / 改 inode,Ensemble 的 sourcePath 失效
3. **NFC vs NFD**: macOS APFS 默认 NFD,用户从 Linux 拷过来一个 skill 是 NFC 命名,`source_path` 字段不一致,`id == source_path` 不变式视角下是两个不同 skill
4. **磁盘满时 sync**: `fs::write(.mcp.json)` 写到一半失败,partial file 留在 project,Claude Code 解析坏 JSON 报错,用户找不到原因
5. **未授权 Accessibility**: Quick Action 注册需要 Automator,若用户没给权限,`install_quick_action` 返回错误的处理方式?有没有引导 `open_accessibility_settings`?
6. **Terminal app 不在 /Applications**: 用户的 iTerm 在 `~/Applications/`,`launch_claude_for_folder` 用硬编码路径会 fail
7. **`~/.claude.json` 来自旧 Claude Code 版本**: 字段缺失或类型不同,Ensemble 反序列化失败但用户不知道 — 之前 HTTP MCP `command` 缺失就是这一类(已修)
8. **网络代理 / 公司 SSL inspection**: marketplace HTTP 走 HTTPS 公司 MITM CA,Ensemble 不信任 → user 看到全空白页
9. **App 在 Time Machine restore 后**: ~/.ensemble 是 restored 版本,~/.claude 是另一时刻的 restored 版本,两边状态不匹配
10. **Permission denied on `~/.claude/skills/`**: 用户用 root 修改过 ownership,Ensemble 写 skill 失败但 metadata 仍写成功
11. **Locale 影响 sort**: 用户系统 locale 是 zh_CN,Skill name 排序与英文 default 不同,UI 显示与 reorder 持久状态不一致

**与其他 angle 的边界**: Angle 7 的 trigger 来自 *用户主机环境*,而非 Ensemble 代码逻辑。修复通常不是改逻辑,而是加 graceful degradation + 用户引导。Angle 3 是上游服务端边缘,Angle 7 是本地主机边缘;两者都是"非 Ensemble 控制",但攻击面截然不同。

---

## 完整性论证

### 为什么这 7 个加起来覆盖完整?

我用两个互不依赖的论证去 cross-check:

**论证 1 — 数据流路径覆盖**

任何用户可观察的 bug 一定发生在某条数据流的某个 segment 上:

| 数据流 segment | 主要 angle | 次要 angle |
|---|---|---|
| 外部上游 → bytes → Ensemble disk | 3 (trust) | 1 (一旦入库) |
| Disk → 运行时实体 | 1 (consistency) | 7 (host edge) |
| 运行时实体 → IPC → frontend store | 4 (concurrency) | 6 (frontend) |
| Store → UI render | 6 (frontend) | 4 (race) |
| 用户操作 → IPC mutation | 4 (concurrency) | 1 (post-state) |
| Ensemble → 用户文件 (project / `~/.claude/`) | 2 (outward write) | 4 (race during sync) |
| App lifecycle (startup / 升级 / restore) | 5 (temporal) | 1, 2, 4 (各自的 startup 变体) |

每个 segment 至少有一个主要 angle,且不同 segment 的主要 angle 不重复 — 这表明 7 个 angle 不是冗余的"7 个看同一段路"。

**论证 2 — Failure-mode 类型覆盖**

我列出常见 macOS / Tauri / 编排型 app 的失败 mode,逐个匹配到 angle:

- 数据丢失 / 损坏 → 1 (Ensemble 自检失败), 2 (用户文件被破坏), 5 (migration / restore 时机)
- 数据撒谎(UI 与 disk 不符) → 1, 6
- 操作无效 / panic / hang → 3 (上游卡), 4 (deadlock / race), 6 (UI hang), 7 (env edge)
- 安全 / 注入 / 越权 → 3 (codeload zip path traversal), 7 (sandbox / permission)
- 用户体验 regression → 6 (UI), 5 (startup 慢)
- Cleanup 不完整(orphan / leak) → 1 (Ensemble 内 orphan id), 2 (project 残留), 5 (trash recovery)
- 性能爆 → 6 (UI block), 3 (marketplace pagination), 7 (大数据规模)

每种失败 mode 都有 angle 接住,且通常有 2-3 个互补 lens — 这是冗余保障,不是浪费。

### 哪些 bug 类别最容易被遗漏?

我特别警示以下四类,因为它们 *看起来在某个 angle 里,实则被忽略的概率最高*:

1. **Migration / Startup 期 bug** — Angle 5。原因:reviewer 测试时往往 `~/.ensemble/` 已经被自己测试过 N 次,不再 trigger 第一次 migration。需要刻意准备"全新 home dir" + "上一大版本 data.json"两套 fixture 才能 cover。

2. **Trash + Restore 路径的 orphan 引用** — Angle 5,有 Angle 1 的 flavor。原因:用户使用 trash 的频率低,reviewer 测试同样低。但一旦 restore 把已不存在的 category 引回来,数据连锁损坏。

3. **HashMap 整体反序列化失败 → 整盘空** — Angle 1。原因:好 path test 不会触发,需要刻意构造 "一条 mcp metadata 字段类型错" 的 fixture。CLAUDE.md 已经警告这是 Serde HashMap 的特性,但容易在 reviewer "看代码" 模式下被忽略。

4. **Locale / NFC vs NFD / 多 user 机器** — Angle 7。原因:开发机几乎不会有这些条件,reviewer 在自己 macOS 上跑测试根本不暴露。需要 reviewer 主动构造或刻意推演。

### 如果只能选 N-1 个 angle 不影响覆盖,会是哪个?

逐个测试"砍掉它会丢失哪一类 bug":

- 砍 1 → 失去"Ensemble 内部自检"层。"id 不变式破裂 + scan 与 metadata 失同步"这类核心数据病无人查。**不能砍**
- 砍 2 → 失去"用户文件被破坏"评估。"clear 误删用户 CLAUDE.md / codeload path traversal"这类高影响 bug 无人查。**不能砍**
- 砍 3 → 失去"上游 trust boundary"。schema drift / archive bomb / hallucinated id 类的 bug 无人查。**不能砍**
- 砍 4 → 失去"并发与状态"。race / mutex 覆盖 / optimistic update 类 bug 大幅遗漏。**不能砍**
- 砍 5 → 失去"低频时机"。migration / startup / trash restore 路径 *看似工作*,实际半坏。**最危险的一砍**
- 砍 6 → 失去"用户交互"。后端可能全对但 UI 卡 / 错 / 焦点丢,用户感知极差。**不能砍**
- 砍 7 → 失去"环境边缘"。多数 bug 仍能在其他 angle 部分覆盖(Angle 1/2 会偶尔触及 path 问题),损失最小。**最不可惜的一砍**,但仍然会让 NFC/locale/iCloud 类 bug 全漏

结论:每个 angle 都有不可替代的覆盖区域,N-1 都会留下盲区。如果资源极度紧张被迫砍,**砍 Angle 7**,但代价是接受"非 default 环境下用户报 bug 我们才知道"。

## 我的判断:N 的合理取值

**N = 7**。

更少(5-6)会被迫合并 Angle 5 进 1+2+4,或砍 Angle 7,代价是丢失低频高破坏路径的覆盖。更多(8+)会引入"安全"、"性能"这类与已有 angle 强相关但缺独立失败原理的 lens,导致 reviewer 之间互相抢 bug、findings 大量重复。
