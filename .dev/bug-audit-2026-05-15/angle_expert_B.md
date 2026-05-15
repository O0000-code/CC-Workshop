# Angle Expert B — Bug Audit 评审角度建议

## 我的分析方法

我没有套"安全/性能/可用性"这种通用模板。我从这个 app 的**具体物理结构**反推:Ensemble 不是一个独立运行的系统,而是一个**坐在两个文件系统中间的转译器** —— 上游是 5 个外部源(skills.sh / MCP registry / GitHub codeload / Claude Code plugins / 用户 ~/.claude),下游是 N 个用户项目目录;中间在 `~/.ensemble/` 维护一个 canonical store。

我从 app 物理结构(7 个层面)逐一推导:数据**从哪里来**、**怎么进来**、**怎么持久化**、**怎么演化**、**怎么出去**、**怎么显示**、**怎么消失**。每一层都对应一类不可替代的失败模式 —— 任一层出错,用户都会"丢数据 / 卡死 / 误删 / 出错"。

我额外问了一遍:**单纯按"数据流的某一段"切分够不够?** 不够 —— 还有两类问题不属于任何"段",而是横跨所有段的系统属性:**生命周期事件**(启动、升级、cleanup)和**外部环境**(macOS 系统集成、并发、文件系统怪事)。这两类我单独成立 angle。

最后我用三个反向验证 —— 完整性论证、易遗漏类、能否去掉一个 angle 而不漏覆盖 —— 校验本文末尾的 angle 集合。

---

## 我建议的评审角度

### Angle 1 — 上游采集 & 外部 trust boundary

**核心问题**:进入 `~/.ensemble/` 之前的所有源是**不可信、易变、有时无文档**的。任何一个源的格式 / 行为 / 网络条件偏离假设,采集就会失败或导入错误数据。

**覆盖代码范围**:
- `commands/import.rs`(`~/.claude/skills/`、`~/.claude.json` 解析,~/.agents/skills/ 兼容)
- `commands/plugins.rs`(`~/.claude/plugins/cache/...` 扫描 + symlink 处理)
- `commands/marketplace.rs`(skills.sh + registry.modelcontextprotocol.io HTTP + GitHub codeload + 缓存 + 速率限制)
- `commands/marketplace_seed.rs`(已知曾大面积 hallucinate)
- `commands/claude_md.rs::scan_claude_md_files`(用户磁盘 WalkDir 扫描)
- `commands/rules.rs::scan_rules`(`~/.claude/rules/` 扫描)

**代表性 bug 类型**(至少 3 个):
1. **格式/字段假设错误**:HTTP MCP 无 `command` 字段曾导致整个 `mcpServers` HashMap 解析全废(memory.md 已记录)。同类:upstream 新增字段、必填字段缺失、`type: "sse"` 这类未枚举值、`url` 含模板变量、`env` 值是 number 而非 string。
2. **trust boundary 越界写**:`import.rs::write_claude_json` 会把整个 `~/.claude.json` 反序列化后整文件 rewrite —— 任何未声明字段都依赖 `#[serde(flatten)]` 保留;一旦 Tauri 版本变 / serde 行为变,用户的 Claude Code 其他配置可能丢失。
3. **网络/缓存失败**:marketplace HTTP 失败、速率限制、缓存损坏 JSON、stale cache、cache 文件被外部进程写半空,刷新逻辑没有原子写。
4. **路径 trust**:plugin symlink 目标已不存在(Claude Code 卸载了某 plugin)、相对 symlink、循环 symlink、symlink 跨 volume。
5. **hallucinated curated 数据**:`marketplace_seed.rs` 曾被记录大量伪 upstream identifier 进入产品(memory + validate-curated-upstream-ids Rule)。
6. **跨平台路径**:`expand_tilde` / `expand_path` 对含空格 / Unicode / 大小写敏感的非 APFS volume / 网络挂载行为。

**与其他 angle 的边界**:本 angle **只**覆盖"数据进入 Ensemble 之前"的检查。一旦数据进了 `~/.ensemble/`,转交 Angle 2。

---

### Angle 2 — 持久化 & 不变式 & 并发完整性

**核心问题**:`~/.ensemble/data.json` 是唯一 canonical state,但 metadata 指针与实体文件(独立的 skill 目录 / mcp json / claude-md / rule 文件)是**两个落盘单元**。任何写失败、并发交错、id 偏移、原子性缺失,都会让 metadata 与实际文件 drift。

**覆盖代码范围**:
- `commands/data.rs`(`DATA_MUTEX`、`apply_reorder`、所有 categories/tags/scenes/projects CRUD、hierarchy 验证)
- `commands/skills.rs`、`commands/mcps.rs`、`commands/rules.rs`、`commands/claude_md.rs` 的 update/delete/create 路径
- `types.rs` 关键不变式(`id == sourcePath` 警告区、`AppData` 字段 `#[serde(default)]` 覆盖)
- 前端 stores `reorder` 的 two-phase commit + version counter 逻辑(`skillsStore`、`mcpsStore`、`appStore` reorder)
- 命名冲突 / 重命名后 id 偏移(改 skill 目录名后 sourcePath 变,marketplace 短链失效)

**代表性 bug 类型**:
1. **`id == sourcePath` 不变式破裂**:用户在 Finder 手动把 `~/.ensemble/skills/foo` 重命名为 `bar`、移到别处、删了再放回 —— metadata key 仍是旧 path,scan 时变孤儿;Scene 引用悬空但 sync 静默跳过。
2. **DATA_MUTEX 覆盖盲区**:本项目 `grep-before-enumerate-shared-resource` Rule 就是从这个 angle 长出来的 —— V3 tech plan 漏锁 `claude_md.rs` / `trash.rs` / `import.rs` 直写 `data_path` 的辅助函数。任何"绕过 `read_app_data` / `write_app_data` 直接 `fs::write(data_path)`"或"修改 `app_data.skill_metadata` 字段不走 helper"都是潜在丢更新点。
3. **两个落盘单元间的撕裂**:`update_claude_md` 先写文件后写 data.json,如果中间 power loss,文件存在但 metadata 指针没了(或反过来);delete 同理(metadata 删了文件还在,反之亦然)。
4. **`apply_reorder` 上游契约错误**:前端 reorder version counter 错位时,后端可能基于陈旧 order 计算结果;HashMap 随机化已写在 memory.md 中。
5. **HashMap 解析容错性**:任意一条 entry 解析失败整个 HashMap 全废(`#[serde(default)]` 在 String 上只挡 missing 不挡 type-mismatch)。
6. **Trash 恢复期的 id 冲突**:trash 里有 `~/.ensemble/skills/foo`,用户又装了新的同名,然后从 trash restore —— 覆盖?报错?悬空?
7. **migration flag 一次性破坏**:`hasCompletedCategoryIdMigration` flag 出现 partial migration 后被设为 true,半套数据永久无法再 migrate。

**与其他 angle 的边界**:本 angle 覆盖**已落盘** Ensemble 数据的内部一致性。如果错误源在采集进来之前,属于 Angle 1;如果错误体现在导出到 project,属于 Angle 4。

---

### Angle 3 — 实体生命周期 & 软删除 & 引用悬垂

**核心问题**:Ensemble 有 5 个核心实体(Skill / MCP / CLAUDE.md / Rule / Scene)+ 2 个层级实体(Category / Tag)+ 1 个外向实体(Project)。每一对都有引用关系,但删除路径**不级联**(CLAUDE.md 明确说"orphan id 静默忽略");加上软删除 trash 层,引用 + 恢复 + 重复创建可能产生悬空、重复、错位。

**覆盖代码范围**:
- `commands/trash.rs`(4 个 restore 命令,trash 目录管理)
- 所有 delete 路径(`delete_skill / delete_mcp / delete_claude_md / delete_rule / delete_scene / delete_project / delete_category / delete_tag`)
- Scene 的 `skillIds / mcpIds / claudeMdIds / ruleIds`(以及 trash 镜像 `TrashedScene`)
- Project 的 `sceneId` 反向防御
- Category 父子关系(V1 hierarchy,`set_category_parent` 验证器)
- 前端 `ScenesPage` / `ProjectsPage` 删除阻塞 alert

**代表性 bug 类型**:
1. **悬空 id 静默吞噬**:Skill A 被删 → Scene X 仍含 `skillId: A` → sync 时 `find()` 找不到,**用户毫无感知**他的 Scene 里少了一个 skill。
2. **Trash restore 后 id 冲突**:删除 Skill A → 同名重新创建 Skill A → trash 里 restore → 两个并存?覆盖?
3. **Trash 中 Scene 的 id 引用错位**:Scene 进 trash,期间它引用的 Skill 也被删 / 重命名 / 改 id;restore 时怎么处理?
4. **CLAUDE.md 单选语义破坏**:`global_claude_md_id` 指向已删除/已 trash 的 file → app 启动后 global 状态错。
5. **Rule `is_global` 镜像漂移**:删除 Rule 时是否 cleanup `~/.claude/rules/<filename>.md` 镜像?如果 filename 改过(注意 filename 不可改但有 UI name 双轨)是否清旧 filename 的镜像?
6. **Category hierarchy 父删子留 / 子删父留**:父 category 进 trash 时子 category 的 `parentId` 是否清?重新激活父时是否恢复?
7. **跨 trash 类型的依赖**:Project 引用 Scene,Scene 进 trash 时 Project 仍可能保有 `sceneId` —— 前端 alert 阻断只在主路径,trash 路径是否漏防御?
8. **`imported_plugin_skills` / `imported_plugin_mcps` 持久 marker**:plugin 被 Claude Code 卸载后,Ensemble 中的 marker 是否清?会不会下次扫描以为"已导入"而漏报?

**与其他 angle 的边界**:本 angle 关注**实体之间的引用关系**。具体 metadata 字段一致性归 Angle 2,导出到 project 归 Angle 4。

---

### Angle 4 — 下游分发 & Project sync / clear / distribute

**核心问题**:Ensemble 写到用户的**项目目录**的内容(symlink、.mcp.json、CLAUDE.md、`<filename>.md`)和写到用户的 `~/.claude/`(global Rule、global CLAUDE.md backup)都是**对外部世界的副作用**,一旦错误,影响用户的真实项目或与 Claude Code 的共存。

**覆盖代码范围**:
- `commands/config.rs`(sync_project_config / clear_project_config / write_mcp_config)
- `commands/symlink.rs`(create / remove / batch)
- `commands/claude_md.rs::distribute_claude_md / distribute_scene_claude_md / set_global_claude_md`(及全局 backup 机制)
- `commands/rules.rs::distribute_rule / distribute_scene_rules / set_global_rule / unset_global_rule`
- 前端 sync 触发(`ProjectsPage`、SceneDetailPage)
- 三条 CLAUDE.md 路径互斥逻辑、`.claude/rules/` 命中过滤逻辑(已知 Clear 比 Sync 保守)

**代表性 bug 类型**:
1. **覆盖用户的非 Ensemble 文件**:用户在项目根写了 `CLAUDE.md`,sync 时按"先删再写"覆盖了 —— 是 Ensemble 的责任吗?有备份吗?
2. **distributionPath 切换未清旧**:用户从 `CLAUDE.md` 切到 `.claude/CLAUDE.md`,旧位置 `CLAUDE.md` 是否保留(Claude Code 会读两份)?
3. **Rule filename 冲突**:Scene 含两个 Rule 同 filename(数据层应禁止,但是否真的禁止?import / restore 路径有验证吗?)。
4. **Symlink target 不存在**:`~/.ensemble/skills/foo` 已被删但 Scene 仍含,sync 创建指向不存在路径的 symlink,Claude Code 读会报错。
5. **Project path 不存在 / 是文件 / 是只读**:`sync_project_config` 拿到无效 path 时是 `create_dir_all` 还是失败?权限怎么处理?
6. **Clear 删多删少**:Clear 对三条 CLAUDE.md 路径无差别全删 —— 如果用户有未管理的 `CLAUDE.local.md` 会被误删;只删命中 filename 的 rules,但如果 filename 有大小写差异、symlink、CRLF 等边界情况?
7. **Set/unset global CLAUDE.md / Rule 写 `~/.claude/`**:这是侵入用户全局配置;backup 机制是否真的 roundtrip 回来?backup 目录满了 / 损坏会怎样?
8. **`.mcp.json` headers / env 泄露**:HTTP MCP 的 Authorization header 写进 project `.mcp.json` 后,如果用户把项目推到 GitHub —— Ensemble 是否提醒 / 加 .gitignore 建议?(borderline 安全 angle,但属于 sync 流程的产物)
9. **Concurrent sync 同一 project**:两次快速点 sync,symlink 重复创建 / Clear-then-Sync 时序穿插。
10. **`sceneId` 已删但 project 仍引用**:正常路径 alert 阻断,但 trash 恢复 / 异常路径下 sync 走的是哪种行为?

**与其他 angle 的边界**:本 angle 是**写到用户其他位置**的所有路径。`~/.ensemble/` 内部更新归 Angle 2;UI 触发归 Angle 6;升级期的 cleanup 归 Angle 7。

---

### Angle 5 — IPC 边界 & 前端 store 一致性

**核心问题**:~98 个 IPC commands 是前后端契约;前端用 Zustand 做 optimistic + version counter,后端用 DATA_MUTEX 串行化。**契约不一致**(命名、camelCase 漏配、类型缺字段、错误反向回滚不全)会导致前端状态与后端永久 drift,用户操作"成功"但实际没生效。

**覆盖代码范围**:
- `src/utils/tauri.ts::safeInvoke`(环境检测、错误包装)
- 所有 stores 的 IPC 调用 + 错误回滚 + 乐观更新(`skillsStore`、`mcpsStore`、`scenesStore`、`appStore`、`marketplaceStore`、`claudeMdStore`、`rulesStore`、`projectsStore`)
- 类型同步:`src-tauri/src/types.rs` ↔ `src/types/*.ts`(camelCase rename_all、Option/undefined、空数组与 None)
- IPC 参数命名混乱:既有 snake_case 也有 camelCase + `#[allow(non_snake_case)]`(`sync_project_config` 用 camelCase 形参,大多数其他命令用 snake_case)
- 乐观更新失败回滚:网络/IPC fail 后 store 是否真的回到原状态;是否会同时有"两个 inflight 操作"
- 详情面板**双实现并存**:Skills/MCPs 主页 inline detail vs SkillDetailPanel/McpDetailPanel(CategoryPage/TagPage) —— 两条路径维护一致性

**代表性 bug 类型**:
1. **camelCase/snake_case 不对齐**:Rust 命令参数命名规约不一致(部分 `#[allow(non_snake_case)]` 直接用 camelCase),任何漏标注的命令前端传 camelCase 后端要 snake_case → 静默失败或 deserialize error 体现为"功能不响应"。
2. **乐观更新成功 + 后端失败 + 回滚错位**:reorder 失败后前端没回滚 / 部分回滚,UI 与 data.json 永远不一致。
3. **Stale response 检测漏洞**:version counter 在某些 store(`appStore` 已知有,其他?)未实现,reorder + 同时 add 一个新 category 时 race 导致顺序丢失。
4. **Plugin 路径 vs Marketplace 路径细节字段缺失**:`scan_skills` 用 symlink 探测**区分不了** marketplace 与 local —— 任何依赖 `install_source` 的 UI 分支(不能 update、不能 modify env 等)如果 metadata 丢失就 fallback 错。
5. **详情面板双实现 drift**:Skills inline detail vs SkillDetailPanel 行为差异(已在 CLAUDE.md 警告)、字段显示差异、操作权限差异。
6. **类型字段缺失**:Rust 加了 `marketplace_source` 但 TS 类型没更新 → 前端读 undefined → 显示空白或抛 runtime error。
7. **错误信息泄露/丢失**:Rust `.map_err(|e| e.to_string())` → 前端只看到字符串,无法区分错误类型,无法决定是否提示用户。

**与其他 angle 的边界**:本 angle 只覆盖**前后端契约本身** + **store 状态一致性**。UI 渲染归 Angle 6;backend 内部一致性归 Angle 2。

---

### Angle 6 — UI 状态 / 交互 / 错误反馈

**核心问题**:即使后端正确,UI 错的状态、错的提示、错的引导,会让用户**误以为**操作失败/丢数据/无法继续,或者**误以为**操作成功而其实没发生。

**覆盖代码范围**:
- 13 个 page 文件(总 ~10k LoC,SkillsPage / McpServersPage / ScenesPage / SettingsPage / 两个 Marketplace page 都超过 800 行)
- 8 个 modal(Import*、Scan*、TrashRecovery)
- 6 个 components 子目录(launcher / claude-md / mcps / projects / rules / scenes / sidebar / skills + common + layout / marketplace)
- Sidebar(category hierarchy + drag/drop + 状态徽章)
- Loading / Empty / Error 状态(loading 卡死、empty 提示用错路径、错误提示拷贝引导)
- Marketplace 大数据量分页 / 无限滚动 / 搜索过滤(`McpMarketplacePage` 1246 行 / `SkillMarketplacePage` 958 行)
- 详情面板 / inline detail 切换 / SlidePanel
- Form 验证(命名冲突、特殊字符、超长输入、空白)
- Drag-and-drop reorder(已知 dnd-kit 怪异性 + 本项目设计语言强约束)

**代表性 bug 类型**:
1. **Loading 永远不结束**:scan 失败时 store 没把 `isLoading` set false。
2. **Empty 状态文案误导**:用户在没装 Claude Code 的机器上看到"暂无配置",而真实原因是 `~/.claude/` 不存在。
3. **错误提示用 Rust error string**:`Failed to read ~/.claude.json: Permission denied (os error 13)` 直接弹给用户。
4. **冲突命名静默接受**:create category / tag / Scene 同名后端可能允许,前端没去重 → 列表里两条同名,排序不稳定。
5. **超长 input / 特殊字符**:Skill name 含 `/` 或换行 → sourcePath 含 `/` → 路径解析 / sync 出错。
6. **Reorder 拖到非法位置**:Category hierarchy 拖父进自己子(已有 hierarchy validator,但 UI 是否阻止 / 反馈友好?)。
7. **关闭 modal 时未取消 inflight 操作**:Import scan 时关闭 modal,scan 完成后 store update 触发已 unmount 组件警告 / state 漂移。
8. **多 tab / 多窗口**:Tauri single-instance 但理论上仍有 quick action 触发 launch + 已开 UI 并存场景。
9. **快捷键 / accessibility / 中文输入法 composition** 触发 IME 时 enter 提交。
10. **Drag overlay 与 Project sync 状态联动**:reorder 期间触发 sync。

**与其他 angle 的边界**:本 angle 关注用户**看见**和**操作**的层。任何错误起源在后端的归对应数据流 angle;本 angle 只看 UI **怎么呈现 / 怎么响应**。

---

### Angle 7 — 启动、迁移、升级、cleanup、长期演化

**核心问题**:Ensemble 已经从 V1 → V2.0 → V2.1.2 演化过多次。每一次都意味着:旧数据格式要被 V_n+1 兼容(`#[serde(default)]` 蛛网)、一次性 migration 要正确且幂等、legacy cache 要 cleanup、未来字段要 forward-compatible。**升级期是用户最容易丢数据的窗口**。

**覆盖代码范围**:
- `lib.rs::setup`(启动期 migration 调度、legacy cleanup、single-instance、`--launch` 参数)
- `commands/claude_md.rs::migrate_claude_md_storage`(从 embedded content → 独立文件)
- `commands/data.rs::migrate_category_id_for_skills_mcps` + `hasCompletedCategoryIdMigration` flag
- 所有 `#[serde(default)]` 字段(`AppData` 的 9+ 个、`Skill` / `McpServer` 的 plugin/marketplace 字段、`Scene::rule_ids / claude_md_ids`)
- `commands/marketplace.rs::cleanup_legacy_mcp_cache`
- `~/.ensemble/` 第一次创建 / 已存在但损坏 / 已存在但是旧版本结构
- 启动期错误恢复:`migrate_claude_md_storage` 失败时 lib.rs 写"don't fail startup on migration error, just log it"
- 版本号检测 / 自更新 / Tauri updater(虽然 IPC list 没显式但通常 Tauri 提供)

**代表性 bug 类型**:
1. **migration 未完成但 flag 已 true**:一次性 migration 中途 panic,`hasCompletedCategoryIdMigration: true` 已写,数据停留在半套状态永远无法 migrate。
2. **`#[serde(default)]` 对未来字段不安全**:V3.0 新增 `Skill::someNewField`,V2.x 数据加载后写回会丢字段?(forward compat 一般 OK,但回滚 V2 时丢字段是 bug)
3. **legacy cleanup 删了不该删的**:`cleanup_legacy_mcp_cache` 用了 best-effort delete —— 路径假设错时会删什么?
4. **第一次启动**:`~/.ensemble/` 不存在时,`init_app_data` 是否原子地创建所有子目录?权限怎样?如果失败 app 是否进入死循环?
5. **`~/.ensemble/data.json` 已存在但被 vim/macOS Finder 锁定/正在被 git 跟踪/在 Dropbox 同步中**:write 失败时数据丢失。
6. **多版本 .app 并存**:`/Applications/Ensemble.app` 是 v2.1.2,但 `~/Applications/Ensemble.app` 是 v1.x 老版本启动 —— 触发降版本 migration 灾难。(本项目已有 replace-installed-app-in-place Rule 但这是"安装期"反向 fail mode)
7. **TimeMachine / iCloud Drive 同步**:`~/.ensemble/` 被 iCloud 同步导致跨机器冲突。
8. **single-instance + --launch**:Quick Action 在 app 已开启时触发,但参数 emit 失败 / window 隐藏期点击 Dock 行为(memory 已知)。
9. **Trash 目录持续增长**:trash 没有 retention policy / 自动 vacuum,长期使用后 `~/.ensemble/trash/` 占用极大磁盘。
10. **崩溃恢复**:写 data.json 时 power loss,部分写入产生坏 JSON,下次启动是否能 recover(有 backup?自动 backup 在哪 trigger?)。

**与其他 angle 的边界**:本 angle 是**时间维度的横切** —— 任何只在"启动期 / 升级期 / 长期运行后"才发生的问题。稳态期的同类 bug 归对应的数据流 angle。

---

### Angle 8 — macOS 系统集成 & 文件系统怪异性 & 外部进程共存

**核心问题**:Ensemble 不是孤立运行 —— 它依赖 macOS 原生能力(Finder Quick Action、Automator、symlink 语义、Spotlight、Gatekeeper、TCC 权限),与 Claude Code 自身**共享** `~/.claude/` 和 `~/.claude.json`,与多个 terminal app(iTerm/Warp/Alacritty/Ghostty/Terminal.app)集成。这是一个高度异质的运行环境,容易出"在我机器上没事但在用户那里全坏"。

**覆盖代码范围**:
- `commands/dialog.rs`(select_folder / select_file / reveal_in_finder / bring_window_to_front)
- `commands/import.rs::install_quick_action / launch_claude_for_folder / open_accessibility_settings`(macOS Automator 集成)
- `commands/symlink.rs`(Unix symlink + Windows cfg)
- `lib.rs::on_window_event`(关闭窗口 hide 而不 quit)+ `RunEvent::Reopen`(Dock icon)
- `lib.rs::single_instance` + `--launch` flag
- Terminal app launching(从 import.rs / settingsStore 触发,涉及多种终端)
- 路径含 Unicode / 空格 / NFD-vs-NFC normalization(macOS 用 NFD,Linux/git 多用 NFC)
- 与 Claude Code 同时写 `~/.claude.json` 的 race
- 与 git / iCloud / Dropbox / Spotlight indexer 对 `~/.ensemble/` 的并发访问

**代表性 bug 类型**:
1. **`~/.claude.json` 与 Claude Code 同时写**:Claude Code 启动后会重写自己的 `.claude.json`;Ensemble 的 `write_claude_json` 是整文件 rewrite,**两个进程同时写 = 后写者赢 + 数据丢失**。是否有 fcntl lock / 检测 mtime / 写前 backup?
2. **TCC / Accessibility 权限缺失**:Quick Action 需要 Accessibility,用户未授权时 fallback 行为是什么?引导是否好?
3. **Gatekeeper / Notarization / xattr quarantine**:`.app` 第一次启动报"无法打开来自身份不明开发者"。
4. **路径 normalization 不一致**:macOS APFS 默认 case-insensitive,用户输入 `Foo` vs `foo` 触发的 sourcePath 不同 → metadata key 不同 → 同一文件被识别为两个。
5. **Unicode normalization (NFD vs NFC)**:用户 skill 目录名含中文 / emoji,Finder 显示 NFC,实际文件名 NFD,任何字符串比较失败。
6. **Symlink 行为差异**:`fs::canonicalize` 在 symlink target 不存在时报错;`is_symlink` + `path.is_dir()`(后者 follows)逻辑容易写反(已在 `import.rs` 看到 follow_symlink 处理,但还有其他点)。
7. **Quick Action / Automator workflow 损坏**:用户更新 macOS 后 Quick Action 失效。
8. **终端 app 启动**:用户没装 iTerm,只有 Terminal.app —— launcher 是否能 fallback?Warp/Alacritty 的 deeplink 协议 ?
9. **App 隐藏期 Dock icon 状态**:关闭窗口 hide,但用户期望 "我以为关了" → 删 app 时仍在跑。已有 Rule `replace-installed-app-in-place` 但这是反向行为。
10. **Multi-user machine**:`~/.ensemble/` 是 user-scope,在共享机器多 user 切换正常,但如果用户用 `sudo` 启动一次,`~/.ensemble/` owner 变 root,后续普通启动写失败。
11. **External Drive / Network volume**:用户 project 在 NAS 上,`sync_project_config` 写 symlink 失败(NAS 不支持 symlink)、写 `.mcp.json` 慢、文件锁定。
12. **`reveal_in_finder` 接受任意 path**:命令行注入风险?(虽然 Tauri 通常包了 shell args)

**与其他 angle 的边界**:本 angle 是**外部环境**层。所有 "Ensemble 自身代码错误"归对应数据流 / 持久化 / UI angle;本 angle 只关注"外部环境与 Ensemble 假设的偏离"。

---

## 完整性论证

### 为什么这 8 个加起来 cover 完整?

我用三个独立的覆盖维度反向验证:

**维度 A — 数据流的每一段都有 angle 覆盖**:
```
[外部源] --Angle 1--> [~/.ensemble/ 内] --Angle 2--> [data.json 一致性]
                                |
                                v (Angle 3 实体生命周期 — 横跨"在 ensemble 内"的整个生命周期)
                                |
                                v Angle 4 (导出到 project / 写 ~/.claude/)
                                |
                                ^ Angle 5 (IPC + Store)
                                ^ Angle 6 (UI)
```
+ 横切两个维度:**Angle 7** 时间维度(启动/升级/长期演化)、**Angle 8** 环境维度(macOS / 外部进程 / 文件系统)。

**维度 B — 用户旅程的每一阶段都有 angle 覆盖**:
1. 第一次启动 → Angle 7、8
2. 导入既有配置 → Angle 1、5、6
3. 安装 marketplace 项 → Angle 1、2、5
4. 编辑 / 重命名 / 移动实体 → Angle 2、3、6
5. 创建 Scene 把多个实体打包 → Angle 3、6
6. 关联到 Project 并 sync → Angle 4、5、6
7. 长期使用后清理 / 升级 → Angle 3、7
8. 误删恢复 / Trash → Angle 3

**维度 C — 失败现象的每一类都有 angle 覆盖**:
- **丢数据**:Angle 1(导入丢)、Angle 2(写盘丢)、Angle 3(级联误删)、Angle 4(覆盖用户文件)、Angle 7(migration 丢)、Angle 8(并发写 `.claude.json` 丢)
- **卡死/无响应**:Angle 5(IPC 失败前端 loading 卡)、Angle 6(state 不更新)、Angle 7(启动 migration hang)、Angle 8(网络 volume 慢)
- **误删**:Angle 3(级联静默)、Angle 4(Clear 误删用户文件)、Angle 7(legacy cleanup 误删)
- **出错(silent)**:Angle 2(serde 容错过度)、Angle 3(悬空 id 静默)、Angle 4(symlink target 不存在)、Angle 5(camelCase 错位)
- **出错(显式)**:Angle 1(网络/格式失败)、Angle 6(UI 错误显示)、Angle 8(macOS 权限)

每一种"用户失望"的类型都至少落在 1 个 angle 上,且没有失败类只能落在 1 个 angle —— 满足 fault tolerance(reviewer 之一漏掉,另一个还能 catch)。

---

### 哪些 bug 类别最容易被遗漏?

我特别列出**单看 angle 名字会以为不重要**的几类:

1. **冷启动 / 首次启动的 happy path 之外**:`~/.ensemble/` 不存在、损坏、partial、被外部进程占用 —— 几乎所有测试都假设它存在,首次启动的失败模式没有测试覆盖。**(归 Angle 7)**

2. **互斥/并发写 `~/.claude.json` 与 Claude Code**:整篇代码假设只有 Ensemble 在写,但 Claude Code 自身**频繁**改写该文件 —— 这是用户最容易丢全局 MCP 配置的窗口。**(归 Angle 8)**

3. **Trash 长期累积**:trash 没有 retention 自动清理,用户用半年后 `~/.ensemble/trash/` 占几 GB,删除变慢、备份慢、磁盘满。**(归 Angle 3 + Angle 7)**

4. **Unicode / 大小写 / NFD 边界**:macOS 用户 skill 目录名含中文是非常常见的,任何字符串比较都可能 silently 错。**(归 Angle 8 + Angle 2)**

5. **手动外部编辑后的 reconciliation**:用户在 Finder 里手动改了 `~/.ensemble/skills/foo/`,scan 时 metadata 不更新?新增字段?orphan?**(归 Angle 2 + Angle 3)**

6. **HTTP MCP 的 Authorization header 被 sync 进项目 `.mcp.json` 然后 push 到 GitHub**:用户隐私/凭证泄露。**(归 Angle 4,borderline 安全 angle)**

7. **新增字段的 forward / backward compat**:每次 release 加一个 `#[serde(default)]`,但 V2.x → V1.x 降级(用户不小心装了旧版)会丢字段。**(归 Angle 7)**

8. **error message 全是 raw Rust error**:`Failed to read ~/.claude.json: Permission denied (os error 13)` —— 用户看不懂、无法 actionable。**(归 Angle 6 + 跨 Angle 5)**

9. **multi-user / sudo / 权限错位**:`~/.ensemble/` owner 变 root 后用户启动失败。**(归 Angle 8)**

10. **External marketplace 的 hallucinated upstream**:已经在 memory.md 留下血泪教训,但 audit 时仍可能因为"上次已发现就不再看了"心态遗漏剩余的伪 entry。**(归 Angle 1)**

---

### 如果只能选 N-1 = 7 个 angle 不影响覆盖,会是哪个?

每个 angle 我都问"去掉它,这一类 bug 真的能被其他 angle 覆盖吗?":

- 去 Angle 1:**不能**。其他 angle 都假设数据已在 `~/.ensemble/` 内。
- 去 Angle 2:**不能**。data.json 一致性是系统脊柱,没人替补。
- 去 Angle 3:**部分能**。实体引用关系部分可由 Angle 2 + Angle 4 间接 catch,但软删除 / trash / 跨实体引用是独立失败模式。如果 N 必须降为 7,**Angle 3 是最可能被 Angle 2 + 4 部分覆盖的**,但代价是 trash / 软删除场景的盲区扩大。
- 去 Angle 4:**不能**。是写出 Ensemble 的唯一 angle。
- 去 Angle 5:**部分能**。契约错误在 Angle 6(UI 表现)+ Angle 2(后端写错)间接体现。但 IPC 命名 / camelCase / 错误反向回滚是独立失败模式。
- 去 Angle 6:**不能**。UI 是用户唯一接触面。
- 去 Angle 7:**不能**。时间维度横切,稳态视角看不见。
- 去 Angle 8:**不能**。环境维度横切,稳态视角看不见。

**结论:8 个都不可省略;Angle 3 是最接近"可压缩"的边缘**,但压缩后软删除场景的盲区代价偏大。**保留 8 个**。

---

## 我的判断:N 的合理取值

**建议 N = 8**(本文末尾给出的方案)。

少于 8(尤其少于 7)会让"启动/升级"或"macOS 环境"这两个横切维度无主 —— 这两类 bug **不会**在稳态数据流 angle 里被发现,因为它们不是稳态问题;reviewer 在做稳态扫描时根本不会去想这些。

多于 8(我考虑过把"安全"单列、把"marketplace"从 Angle 1 拆出来)会产生重叠 —— 安全问题(凭证泄露、命令注入、权限提升)在本 app 上其实都嵌在已有 angle 里(`.mcp.json` headers 泄露在 Angle 4,`reveal_in_finder` 注入在 Angle 8,`auto_classify` 调 Anthropic API 上传隐私在 Angle 1)。把 marketplace 拆出来则会和 Angle 1 重复 70% 代码范围。**专门拆"安全"或"marketplace"会带来 reviewer 重复扫描的浪费**,不如保持现状。

8 个 angle 加 8 个 reviewer(每人一个 angle)是合理的并行规模 —— 既覆盖完整,也没有 reviewer 之间的多余重叠(每个 angle 都有独立的代表性 bug 类型,边界已在每个 angle 末尾显式划清)。
