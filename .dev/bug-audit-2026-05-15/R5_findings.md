# R5 — 生命周期 / 启动 / 迁移 / Cleanup / Trash 长期累积 Findings

**Scope**: time-axis 横切维度。Expert A5 + Expert B7 共同点出的盲区。R1-R4 都站在"稳态"视角扫描,本 reviewer 站在"启动 / 升级 / 第一次 / 长期累积"视角补盲。

**审查范围**:
- `lib.rs::run` setup + on_window_event + RunEvent::Reopen + single_instance + `--launch` 解析
- `init_app_data` 第一次启动子目录创建 + 权限假设
- 三条 migration 路径(`migrate_claude_md_storage` / `migrate_category_id_for_skills_mcps` / `cleanup_legacy_mcp_cache`)
- `trash.rs` 4 个 restore 函数 + trash 长期累积
- `AppData` 的 `#[serde(default)]` 蛛网 forward / backward compat
- `scan_usage_stats` 大数据量阻塞
- 持久 marker (`imported_plugin_skills` / `imported_plugin_mcps` / `imported_marketplace_skills`)的 cleanup

**说明**: R1-R4 已扫数据一致性 / 对外写入 / IPC 契约 / 安全注入。我只关注**时间维度**——任一 bug 只在"启动期 / 升级期 / 长期运行后"才发生。

---

## 复核结果(对 02_known_risk_surfaces.md 中归我角度的 candidates)

R5 angle 与主 Agent 已 flag 的 candidate 重叠较少,但以下三条与时间维度强相关:

### A2 复核 (list_trashed_items 不读 trashed_scenes / trashed_projects) — **CONFIRM + 升级**
主 Agent 已识别"删 Scene/Project 永远占 data.json"——这是稳态 angle。**时间维度叠加后果**:
- 没有任何 GC 路径,5 个月后 `data.trashed_scenes` 增长无界,影响所有 read_app_data 的 latency。
- 而且 `delete_scene` 把整个 Scene 对象塞 `TrashedScene` (含 skill_ids / mcp_ids / claude_md_ids / rule_ids),不去重——同一 Scene 编辑 → 删除 → 重建 → 再删除会累积多个 trashed 副本。
- 加上 A3(restore 不恢复 metadata)是 **B7 中的 Angle 3**,见 F4 / F5。

### A6 复核 (add_project 接受空 sceneId) — **CONFIRM,时间维度补充**
`data.rs:1105` `sceneId.unwrap_or_default()`。空字符串持久后,Scene 删除时也不会清空它(`delete_scene` 没碰 `Project.scene_id`)。**这是孤儿 sceneId**——一旦累积,Project 列表里出现"Unknown Scene"。

### D9 复核 (migrate_claude_md_storage 启动跑) — **CONFIRM 但严重度不止 P3**
主 Agent 标 P3 / Low risk。**时间维度推演后,实际是 P1**——见 F3 + F6。

---

## 新发现

### F1. `init_app_data` 子目录创建非原子 + 错误吞掉 ★P0

- **置信度**: High
- **严重度**: P0
- **代码位置**: `src-tauri/src/commands/data.rs:303-368` + `lib.rs:23-54`
- **触发条件 (User does X)**: 首次启动 app,且 `~/.ensemble/` 不存在;或 home dir 满 / 只读 / 权限缺失。也包括"用户用 `sudo` 启过一次让 `~/.ensemble/` owner 变 root,后续普通用户启动时 `ensure_dir` 在 `skills/` 失败"。
- **用户可见后果 (User sees Y)**: app 启动后看到空白页面,toast 报"Failed to create directory: Permission denied"。多次点击重启依然空白。
- **不可见后果**: `init_app_data` 是前端在 `initApp` 主动调,但 `lib.rs::setup` 不依赖它——所以 `migrate_claude_md_storage()` 已在 setup 阶段跑了,内部 `read_app_data()` 触达 `~/.ensemble/data.json`(不存在则返回 default,OK),但**它不创建 skills/ 或 mcps/ 目录**。setup 完成后 single-instance handler、`--launch` 处理、第一个 IPC 调用都在前端 `init_app_data` 之前。任一路径先用了 `~/.ensemble/skills/<x>/` 都会失败。
- **根因**: `init_app_data` 有三个独立 `ensure_dir` 调用 + 一个 `write_app_data`(line 305、309、313、358)。任一失败 `?` 早 return,其他子目录不创建。没有 transactional 语义。更深层:**setup 调用 `migrate_claude_md_storage()` 在 `init_app_data` 之前,但 migration 写文件到 `~/.ensemble/claude-md/{id}/CLAUDE.md`——`get_claude_md_storage_dir()` 内部 `create_dir_all` 兜底,所以 migration 阶段会**先于 init_app_data 创建 `~/.ensemble/`**;一旦 migration 后 init_app_data 跑失败,部分目录已存在、部分不存在,且 `init_app_data` 看到 `data.json` 已被 migration 创建,**会跳过默认 categories 创建**(`if !data_path.exists()` 在 line 317)。用户看到的 sidebar 没有默认 Development / Writing / Analysis 三条分类。
- **建议修复**: setup 阶段统一调一次 `ensure_dir(get_app_data_dir())` + 创建 `skills/ mcps/ claude-md/ rules/ trash/ marketplace-cache/` 所有子目录,然后才跑 migration。default Categories 的创建需要解耦——目前的"data.json 不存在则创建默认"逻辑,如果 migration 先创建了 data.json(写入空 categories),用户永远看不到默认分类。
- **修复保守度**: Medium(影响 startup 顺序,需测三种 fresh / partial / corrupt home 场景)
- **复核状态**: self-confirmed

---

### F2. `migrate_claude_md_storage` 在 setup 阶段无 panic guard + idempotency 锚定错位 ★P1

- **置信度**: High
- **严重度**: P1
- **代码位置**: `src-tauri/src/commands/claude_md.rs:935-963` + `lib.rs:32-36`
- **触发条件 (User does X)**: 用户在 v2.0.x(用 embedded content 模型)使用半年累积了 50+ CLAUDE.md 文件,升级到 v2.1.2。第一次启动时 migration loop 在第 30 个 file 上 panic(disk full / permission)或被用户强杀(app 卡 10 秒没启动用户 force-quit)。
- **用户可见后果 (User sees Y)**: 重启 app,看 CLAUDE.md 列表——前 29 条显示正常,第 30 条**显示为空白预览**(因为 `read_claude_md_content` 失败时 fallback 是 `String::new()`)。剩余 file 也是空白。点开任意一条 CLAUDE.md,detail panel 显示空内容。
- **不可见后果**: 已 migrate 的 30 条文件 `~/.ensemble/claude-md/{id}/CLAUDE.md` 已写盘,但 `data.json` 没更新——第 30 条之后的 `file.content` 仍是 embedded 状态。Migration **下次启动会重跑**(`for file in app_data.claude_md_files.iter_mut() { if !file.content.is_empty() && file.managed_path.is_none() }`),前 29 条会再写一次(idempotent,因为 content 仍 embedded 在 data.json 里),所以会自愈。
  - **但**:idempotency 的锚定是 "`content.is_empty()`"。如果 migration loop 中第 30 条 `write_claude_md_content` 失败前已经把 file #30 的 `content` 清空了——等等,**让我再读一遍**:line 944 写文件,line 947 set managed_path,line 950 清空 content。三步顺序是 write → set managed_path → clear content。任一步 `?` 抛错 unwind 前,**已经在 in-memory 改了 file 但还没 write_app_data**——`write_app_data` 在 loop 之外,line 958。所以 panic 时 in-memory 改动全 discard,文件落盘和 data.json 永久不一致——只是 `data.json` 里的 `file.content` 仍为旧值。下次启动 re-migrate **会再写一次 same content**——idempotent。✓
  - 真正的隐患在 partial-success + `write_app_data` 失败:loop 全部成功 → `write_app_data` 失败(写 data.json 时 disk full)→ 重启 → migration 再跑 → 又把 content 重写到 `~/.ensemble/claude-md/{id}/CLAUDE.md`(已存在,内容应一样)→ data.json 又写一次。无限重跑直到 disk 有空间。无害但**每次启动都会跑一遍 migration**——大数据用户每次 startup 慢。
- **根因**: setup 在主线程同步调 migration(`lib.rs:33`),没有 `tokio::spawn`,没有 timeout,没有 progress 反馈。`if let Err(e) = ... { eprintln!(...) }` 容错,但不区分"OK,什么都没干"和"OK,写了 N 次"——idempotency 的判断锚在 `file.content.is_empty()`,这意味着只要 content 被清空就算"已 migrated"。一旦未来某个新增路径让 `file.content` 在没有 managed_path 的情况下也变空,migration 永远不会再跑——dangerous coupling。
- **建议修复**:
  1. Migration 改为按 file 检查 `target file 存在 + size > 0` 而非 `file.content.is_empty()`;
  2. 单 file 失败时记到 vec,而非整体 `?`;
  3. setup 中 migration 包成 spawn_blocking,主线程不阻塞;
  4. 给用户一个 toast"Migrating 50 CLAUDE.md files... please wait",大数据时有体感反馈。
- **修复保守度**: Safe(纯并发性增强,无 schema 改动)
- **复核状态**: self-confirmed

---

### F3. `migrate_category_id_for_skills_mcps` 在前端 init flow 中 not awaited atomically — partial migration 可以"提前看到" ★P1

- **置信度**: High
- **严重度**: P1
- **代码位置**: `src/stores/appStore.ts:832-866`(initApp)+ `src-tauri/src/commands/data.rs:722-807`(migration)
- **触发条件 (User does X)**: 用户启动 app 时本地有 500 个 skill。`initApp` 在 line 832 调 `init_app_data`,line 833 并行调 `loadCategories` + `loadTags`,line 855 才调 `read_app_data` 检查 `hasCompletedCategoryIdMigration`,然后 line 857 调 `migrate_category_id_for_skills_mcps`(大数据时可能 5-10 秒)。期间用户已经看到 sidebar、点开 Skills 页面、按 category filter——但前端拿到的 `Skill.category_id` 是 migration 前的状态(`None`),fallback to name lookup;Category filter 失败概率高(用户看到"No skills in this category")。
- **用户可见后果 (User sees Y)**: 启动 app 后 5 秒内,Skills 页面按 category 过滤显示**空**(应该有 30 个匹配的 skill)。Re-click 或 F5 刷新后才出现。用户疑惑"我的 skill 哪去了?"。
- **不可见后果**: migration 持 DATA_MUTEX,所以 scan_skills / scan_mcps 在 migration 期间阻塞——但这些是前端 `loadSkills` 调用,会卡在 IPC 上 5-10 秒,UI 显示 loading 但用户感受是"卡死"。
- **根因**: `initApp` 是 `await safeInvoke('init_app_data')` 后 `Promise.all([loadCategories, loadTags])`,然后再串行查 migration flag + 触发 migration。期间没 block sidebar 渲染。这是设计选择(让用户不等 migration 看到 UI),但代价是**显示假数据**(legacy `category` name 字段)。
- **建议修复**: migration 改为前端启动 init flow 的**第一步**(在 init_app_data 之后立即跑),并展示 splash screen"Updating data... 30%"。500 skill 大概 200ms,真实痛点是 setup 已经跑了 `migrate_claude_md_storage` 一次后,前端再跑这个,体感累计。或者后端把 migration 合并到 `init_app_data` 内部一次性完成。
- **修复保守度**: Medium(前端 init 顺序调整 + splash UX)
- **复核状态**: self-confirmed

---

### F4. Trash 永不自动清理 — `~/.ensemble/trash/` 长期累积 GB 级 ★P1

- **置信度**: High
- **严重度**: P1
- **代码位置**: `src-tauri/src/commands/{trash, skills, mcps, rules, claude_md}.rs` 各 delete 路径全部 move 到 trash;**没有任何 retention / purge / vacuum IPC**。
- **触发条件 (User does X)**: 用户用 Ensemble 半年到一年。期间多次 marketplace 浏览 + 删除 + 重装。某个 skill 的体积 ~20MB(尤其那些含 PDF / 大文档的 marketplace skill),删 → 装 → 删 100 次 = ~2GB trash。
- **用户可见后果 (User sees Y)**: 用户在 Trash Recovery modal 看到几百条 trashed items,滚动列表卡顿(`list_trashed_items` 同步 `fs::read_dir` + `parse_skill_md` 每个 trash 目录)。点开 Trash Recovery 时 modal **延迟 3-5 秒**才打开。
- **不可见后果**:
  - `~/.ensemble/trash/` 占数 GB 磁盘——用户在 Finder 里看 disk usage 才发现。
  - Time Machine / iCloud sync 把 trash 也同步过去,网络带宽与远程存储被吃。
  - `list_trashed_items` 在 trash 大时每次启动 Trash modal 阻塞 IPC worker 数秒。
- **根因**: design intent 是"永久保留 trash 直到用户手动操作",但 UI 没有"Empty Trash" 按钮(grep `Empty Trash` 验证),也没有 retention setting。Trash 是只增不减的池。
- **建议修复**:
  1. 最小:加 "Empty Trash" 按钮 + per-row "Delete Permanently" 操作;
  2. 进阶:settings 加"Auto-delete trash older than N days"(默认 30);
  3. 极端:trash 总大小超 500MB 时启动 toast 提醒用户清理。
  4. 关键不变量:**自动清理必须用户可见可关**——历史教训 (memory `feedback_subagent_hallucinated_curated_list`)证明静默后台操作伤害大。
- **修复保守度**: Safe(纯增量功能,不动现有数据)
- **复核状态**: self-confirmed

---

### F5. `restore_skill` / `restore_mcp` 跳过 metadata 恢复(已 list 为 A3),**叠加时间维度后**:trash 中 metadata snapshot 会随时间过期 ★P1

- **置信度**: High
- **严重度**: P1 (同 A3,但加时间维度恶化)
- **代码位置**: `trash.rs:343-376` + `trash.rs:382-415`
- **触发条件 (User does X)**: 用户删 skill "foo"(skills.rs:368 已 snapshot metadata 到 `<skill_dir>/_ensemble_metadata.json`),3 个月后想恢复:打开 Trash Recovery,点 Restore。
- **用户可见后果 (User sees Y)**: skill 出现在 Skills 列表,但**category 显示为空 / tags 显示为空 / icon 没了 / usage_count 归零**。用户语言:"我恢复了 skill 但分类标签全丢了"。
- **不可见后果**: snapshot 文件 `<skill_dir>/_ensemble_metadata.json` 仍在 restore 后的 skill 目录里,**永久遗留**——但没有任何路径会读取它(只有 marketplace finalize_skill_install 这条路径 consume)。变成幽灵文件。
  - **时间维度叠加**:trash 中 skill 的 snapshot metadata 中引用的 `category_id` 在 3 个月里可能已被用户删除——restore 后即使 metadata 被消费,`category_id` 也指向 nowhere。
- **根因**: A3 已识别。time-axis 补充:trash 长留意味着 metadata snapshot 可能在 restore 时已经引用消失的 category / tag,所以 metadata 恢复路径必须做 reference-validity 检查(category 已删 → clear category_id;tag 已删 → 从 tags Vec 移除)。
- **建议修复**: restore_skill / restore_mcp 读 `_ensemble_metadata.json` → 验证 category_id / tag_ids 在 data.json 还在 → 把验证过的 metadata 写回 data.json::skill_metadata。
- **修复保守度**: Safe(纯增量,没有破坏)
- **复核状态**: self-confirmed

---

### F6. `restore_claude_md` / `restore_rule` info.json 解析失败 → 永久 fallback,但 fallback 名称 / 分类 / 用户偏好全丢 ★P1

- **置信度**: High
- **严重度**: P1
- **代码位置**: `trash.rs:422-532` (restore_claude_md) + `trash.rs:540-653` (restore_rule)
- **触发条件 (User does X)**: 用户 v2.0.x 用了 6 个月,期间 trash 了几个 CLAUDE.md / Rule。v2.0.x → v2.1.2 升级期间 `ClaudeMdFile` / `Rule` 加了字段(例如 `tag_ids`)。3 个月后用户回 Trash Recovery restore 一个 6 个月前删的 CLAUDE.md。`info.json` 是 6 个月前的 schema,**缺少新字段**——但实际看代码 line 465-466:`serde_json::from_str::<ClaudeMdFile>(&info_content)`,只要字段 marked `#[serde(default)]` 就 OK,新字段会用 default。
- **更严重的场景**: info.json 不是缺字段 而是 **字段类型变了**(例:`source_type: String` 改为 `source_type: ClaudeMdType`,反序列化失败)。Line 465 `.map_err(|e| format!("Failed to parse info.json: {}", e))?` 直接 return error——但**此时 line 452 `fs::rename` 已经把目录移出 trash 了**。trash 里没了,target_path 里有了,但 data.json 没注册——用户在 Skill 页面看不到这条 CLAUDE.md,在 Trash 页面也看不到,**实体凭空消失**。
- **用户可见后果 (User sees Y)**: 点 Restore,toast 报"Failed to parse info.json: invalid type..."。用户回 Trash Recovery 找不到,回 CLAUDE.md 页找不到。
- **不可见后果**:文件目录在 `~/.ensemble/claude-md/{original_id}/` 物理存在,但 data.json 没引用——成为彻底 orphan,占磁盘且永远无法被 UI 触达。
- **根因**:`fs::rename` 在 `serde_json::from_str` 之前(line 452 在 460 之前)。一旦解析失败,move 已发生且不可逆。
- **建议修复**:
  1. **rename 前先 validate info.json**——读 + parse OK 再 rename;
  2. parse 失败时 fallback 到"无 info.json"分支(已存在 line 494-528),用 default metadata 创建条目,而不是抛错;
  3. 整个 restore 路径包成 transaction:rename + write_app_data 任一失败回滚 rename。
- **修复保守度**: Medium(改 restore 路径的 control flow)
- **复核状态**: self-confirmed

---

### F7. `AppData` 没有 `#[serde(flatten)] other` — 用户回滚旧版本会丢未来字段 ★P1

- **置信度**: High
- **严重度**: P1
- **代码位置**: `src-tauri/src/types.rs:230-286` (AppData),对比 `:627-654`(ClaudeJson / ClaudeProjectConfig 都有 `#[serde(flatten)] other`)
- **触发条件 (User does X)**: 用户装 v2.1.2 → 用了 1 周加了 30 个 Rules + 创建了几个 last_edited_scene_id;然后误装 v2.0.x(旧 dmg 还在 Downloads / Time Machine restore / Spotlight 找错版本)。旧版启动读 data.json,反序列化 V2.1.2 多出来的字段(`rules`, `last_edited_scene_id`, `imported_marketplace_skills`)——`#[serde(default)]` 让它能解析,但 AppData 没有 `flatten other`,**字段 silently dropped**。旧版做任何 mutate(reorder category 都行)→ `write_app_data(data)` → V2.1.2 字段全消失。
- **用户可见后果 (User sees Y)**: 回到 V2.1.2 后,所有 Rules 不见了,Scene 的 rule_ids 字段全空,Marketplace 卸载-重装会丢"曾经装过"hint。用户语言:"我的 30 条 Rules 全没了"。
- **不可见后果**: `~/.ensemble/rules/{id}/<filename>.md` 物理文件还在,但 data.json 没引用——orphan。
- **根因**: AppData 是 Ensemble 全权拥有的 state,但向后兼容设计不彻底——ClaudeJson 因为是用户共享空间所以加了 flatten;AppData 被假设"只有 Ensemble 自己读",但忽略了"用户装了多个版本"的真实情况。
- **建议修复**: AppData 加 `#[serde(flatten)] pub other: HashMap<String, serde_json::Value>`,保留未来字段。即使旧版无法识别,也不会 silently 丢。这是 V2 → V3 的关键准备。
- **修复保守度**: Safe(纯加字段,所有现有 data.json 兼容)
- **复核状态**: self-confirmed

---

### F8. 多版本 `.app` 共存触发 schema 倒退 + replace-installed-app-in-place 反向 fail mode ★P1

- **置信度**: Medium(代码路径正确,但用户实际操作概率需 lead-agent verify)
- **严重度**: P1
- **代码位置**: 跨模块——`lib.rs` 启动 + `data.rs::read_app_data` + project Rule `replace-installed-app-in-place.md`
- **触发条件 (User does X)**:
  1. 用户在 `/Applications/Ensemble.app` 是 v2.1.2,`~/Downloads/Ensemble_2.0.0_aarch64.dmg` 还在;
  2. 用户双击 dmg,挂载,从 dmg 内的 `Ensemble.app` 启动(macOS 不阻止);
  3. 旧 v2.0.x 启动,读到 v2.1.2 的 data.json + settings.json,反序列化 OK(字段 default),但任一 mutate 都丢字段(F7 已分析)。
- **用户可见后果 (User sees Y)**: 用户关掉 dmg 版本,从正常 /Applications 启动 v2.1.2——Rules 不见了 / Marketplace 状态丢失。
- **不可见后果**: data.json 字段被覆盖。`~/.ensemble/rules/` 目录里的 Rule 文件物理存在,但 data.json 没引用。
- **根因**: `replace-installed-app-in-place` Rule 关心**安装时的覆盖**,但用户从 dmg 直接启动旧版**根本不经过安装**——Rule 的反向 fail mode。
- **建议修复**:
  1. 写一个 schema version 字段到 `~/.ensemble/data.json`(例:`schemaVersion: 4`),启动时 read_app_data 检测——如果 disk 上的 version 高于本进程支持的 version,refuse to mutate + 弹"This app version is older than your data; please use newer version";
  2. 文档化:用户文档 README + UI About 页面提示"Always use the latest version. Do not run older versions on your data"。
- **修复保守度**: Medium(schema version check 是新机制,需 V3.0 才能引入,但 V2.x 加 read-only check 也可)
- **复核状态**: needs lead-agent verify(用户行为概率)

---

### F9. `migrate_claude_md_storage` 在 setup 阻塞主线程 — 50+ CLAUDE.md 用户首次升级启动卡 5+ 秒 ★P2

- **置信度**: High
- **严重度**: P2(performance / first-launch UX)
- **代码位置**: `lib.rs:33`(同步调用)+ `claude_md.rs:935-963`
- **触发条件 (User does X)**: 用户从 v2.0.x 升级 v2.1.2,本地有 50 个 CLAUDE.md(50 × ~5KB 写盘 + 1 次 data.json write)。
- **用户可见后果 (User sees Y)**: 启动后,Dock icon 出现 → app window 5 秒后才出现(因为 setup 在同步等 migration 完成)。用户以为没启动,double-click 第二次——single_instance 触发,前端 emit second-instance-launch,但**前端还没初始化**,event 丢失。
- **不可见后果**: 第二次启动尝试因为 single_instance 是 no-op,但用户进一步 double-click 第三次第四次,可能积累多个 emit 都没人接收。
- **根因**: setup 函数是 sync,migration 直接调用。Tauri 推荐对 expensive setup 用 `tokio::spawn`。
- **建议修复**: migration 改 `tauri::async_runtime::spawn` 后台跑;启动 splash UI 显示"Updating data..."。
- **修复保守度**: Medium(并发性改动)
- **复核状态**: self-confirmed

---

### F10. `scan_usage_stats` 大数据量阻塞 tokio worker — async 但用 sync I/O ★P2

- **置信度**: High
- **严重度**: P2 (perf)
- **代码位置**: `src-tauri/src/commands/usage.rs:79`(`pub async fn scan_usage_stats`)+ `:103`(`fs::read_dir`)+ `:181`(`File::open` + `BufReader`)
- **触发条件 (User does X)**: 用户用 Claude Code 半年,`~/.claude/projects/` 含 50+ project 目录,每 project 含 100+ session 目录,每 session 几十个 jsonl(总文件 5000+)。打开 Skills 或 MCPs 页面,前端调 `scan_usage_stats`。
- **用户可见后果 (User sees Y)**: Skills 页面 loading spinner 转 10-30 秒。期间 sidebar 和 sidebar 的 reorder / category 切换都**没响应**——因为 tokio runtime 是有限 worker pool,这个 `async fn` 实际是 sync,占满 worker。
- **不可见后果**: 期间其他 IPC 排队等待 worker。用户感受是"app 整体冻死"。
- **根因**:函数标记 `async` 但函数体里全是 `std::fs::read_dir` / `File::open` / `BufReader::read_line`——sync I/O 在 async runtime 上执行 = 阻塞 worker。Tauri 标准做法是 `tauri::async_runtime::spawn_blocking` 包整个 scan 函数。
- **建议修复**: 把整个 `scan_usage_stats` 主体 wrap 进 `tauri::async_runtime::spawn_blocking`,或者改为 sync command(Tauri 自动用 blocking pool 跑 sync command)。也可以加 progress event,前端展示"Scanning N/M files"。
- **修复保守度**: Safe(纯并发性 wrapper)
- **复核状态**: self-confirmed

---

### F11. `cleanup_legacy_mcp_cache` 删的路径假设——但每次启动都查 ★P3

- **置信度**: High
- **严重度**: P3
- **代码位置**: `marketplace.rs:301-308`
- **触发条件 (User does X)**: 任何启动,无论是否需要 cleanup。
- **用户可见后果 (User sees Y)**: 无。silent。
- **不可见后果**: 每次启动多一次 `path.exists()` 检查(廉价但累积无意义)。文件被删后,后续启动 `path.exists()` returns false,空转。
- **根因**: V2 升级后没有 idempotent flag——`has_completed_legacy_mcp_cache_cleanup` 不存在,每次启动都查。
- **建议修复**: 加一个 `AppData::has_completed_legacy_mcp_cache_cleanup: bool` flag,或更简单地让 cleanup 直接 try-once 后不再 check。或最简单:接受目前现状(检查极廉价,代码已经简洁)。
- **修复保守度**: Safe
- **复核状态**: self-confirmed

---

### F12. `imported_plugin_skills` / `imported_plugin_mcps` 持久 marker:plugin 卸载后永不清 ★P2

- **置信度**: High
- **严重度**: P2
- **代码位置**: `types.rs:243-248` (AppData) + `plugins.rs:394`(detect_plugin_skills,line 403 `imported_set.contains(&import_key)`)
- **触发条件 (User does X)**: 用户从 Claude Code marketplace 装一个 plugin "claude-skills",含 10 个 Skills。在 Ensemble 里 import 全部 → `imported_plugin_skills` 多 10 条 (`{pluginId, skillName}` import keys)。然后用户在 Claude Code 里**卸载** "claude-skills" plugin。再次打开 Ensemble Skills > Import from Plugins,**detect 看不到任何 plugin**(plugin 目录消失),但 `imported_plugin_skills` 里的 10 条永远不清。3 个月后用户重装 "claude-skills" plugin——detect 出现这 10 条,但**全部标 `is_imported=true`**——用户被告知"已导入",但实际 `~/.ensemble/skills/` 里那 10 个 symlink 已 broken(因为 plugin 之前卸过,symlink target 不存在)。
- **用户可见后果 (User sees Y)**: Import Plugin Skills modal 显示 10 条 skill 名,**全部 disabled "Already imported"**。用户**没有任何路径**重新 import 这些 skill(只能手动 delete 每条 broken skill 再重 import)。
- **不可见后果**: Ensemble Skill 列表里 10 条 broken-symlink skill,scan_skills 时报错(`fs::read_dir` 返回 broken symlink → `is_dir` returns false → 静默丢弃)。Skills 页面少了 10 条,无任何提示。
- **根因**: `imported_plugin_skills` 是单向递增数组,没有"plugin 已不存在 → 清条目"路径。`detect_installed_plugins` 知道哪些 plugin 还在,但 detect 函数与 cleanup 解耦。
- **建议修复**: `detect_installed_plugins` 之后,计算 `installed_plugin_ids` set;在 `read_app_data` mutation 路径(或一个新的 `cleanup_orphan_plugin_imports` IPC)里,从 `imported_plugin_skills` 删除引用已不存在 plugin 的条目。
- **修复保守度**: Medium(改 detect → 自动 cleanup,可能影响 import 检测语义)
- **复核状态**: self-confirmed

---

### F13. `--launch` 参数无路径时 setup 已 hide window,frontend 检测不到 path → 用户卡在隐藏窗口 ★P3

- **置信度**: High
- **严重度**: P3
- **代码位置**: `lib.rs:46-51`(setup 阶段 `args.iter().any(|a| a == "--launch")` 就 hide)+ `src/components/layout/MainLayout.tsx:312-317`(`launchIndex !== -1 && args[launchIndex + 1]` 必须同时满足)
- **触发条件 (User does X)**: 用户从命令行手动跑 `Ensemble.app --launch`(没有跟 path)——例如 shell 脚本 bug、Automator workflow 失败注入空 path。setup 看到 `--launch`,window hide;前端 `args[launchIndex + 1]` 是 undefined,什么都不做。Window 一直 hidden。
- **用户可见后果 (User sees Y)**: app icon 在 Dock 显示,点击 Dock icon 调起 `RunEvent::Reopen`,**window.show()** 恢复——其实**有救**。但用户可能不知道点 Dock 即可恢复——他只看到 Dock icon 出现又没有窗口,认为"启动失败",force quit。
- **不可见后果**: 无数据损坏,纯 UX 卡死。
- **根因**: setup 阶段 hide 是"为 Quick Action 优化"——预期 frontend 会决定是否需要 show。但 frontend 决定 show 的条件依赖 path 存在,空 path 时不 show。
- **建议修复**: setup 阶段把 hide 条件改为 `args.iter().any(|a| a == "--launch") && args.windows(2).any(|w| w[0] == "--launch" && !w[1].is_empty())`,即只有 path 非空时才 hide。或者前端在没 path 时主动 show。
- **修复保守度**: Safe
- **复核状态**: self-confirmed

---

### F14. data.json write 非原子 — 磁盘满 / power loss 期间产生 0 字节 data.json ★P1

- **置信度**: High
- **严重度**: P1
- **代码位置**: `data.rs:257-269` (write_app_data: 直接 `fs::write(&data_path, json)`)
- **触发条件 (User does X)**: 用户用了半年,data.json 增长到 5MB。某天 disk 100% full,用户做了 reorder + scene update 一连串操作——`fs::write` 写一半 ENOSPC。或 power loss / OS kill 期间写一半。
- **用户可见后果 (User sees Y)**: 下次启动,app 打开看到**完全空白**——`read_app_data` 抛 serde parse error(parse 失败传错误 — 见 C4 candidate),前端 `appStore` catch 后 set isLoading false 但 categories/tags/scenes 全空。
- **不可见后果**: data.json 文件是 truncated JSON,无 backup。用户 categories、scenes、所有 metadata 全丢失——只有独立文件夹(skills / mcps / claude-md / rules)里的实体物理存在,但 metadata 完全消失。
- **根因**: 没有 atomic write pattern。标准做法:写到 `data.json.tmp` → fsync → rename 覆盖 `data.json`。Rename 是 atomic;`fs::write` 不是。
- **建议修复**:
  ```rust
  let tmp = data_path.with_extension("json.tmp");
  fs::write(&tmp, json)?;
  fs::rename(&tmp, &data_path)?;
  ```
  + 保留滚动 backup(`data.json.bak` 在每次写之前从当前 data.json 拷贝)。
- **修复保守度**: Safe(纯防御加固,不动 logic)
- **复核状态**: self-confirmed

---

### F15. `~/.ensemble/data.json` 损坏 → read_app_data 抛 error → app 全瘫 ★P0

- **置信度**: High
- **严重度**: P0
- **代码位置**: `data.rs:243-253` (read_app_data 在 parse 失败时返回 Err)
- **触发条件 (User does X)**: F14 已造成的 truncated json,或用户手动用 vim 编辑 data.json 后手抖没补全大括号,或 Time Machine 部分 restore。
- **用户可见后果 (User sees Y)**: app 启动看到 **白屏 + 错误 toast**,所有 IPC 失败"failed to read data.json: missing field ..."。用户每次重启同样状态——**no recovery path**。用户必须用 Finder 找到 `~/.ensemble/data.json` 删除,重启 app 重新创建。
- **不可见后果**: Categories / Scenes / Projects metadata 全丢失。Skills / MCPs / CLAUDE.md / Rules 文件仍在但完全断关联。
- **根因**: `read_app_data` 失败直接抛 error,没有任何 recovery 机制。app 在 setup 阶段就调 migration→read_app_data,失败时 setup 不 fail,但每个后续 IPC 都失败。
- **建议修复**:
  1. F14 解决了"写"的损坏,接下来"读"也要有 recovery;
  2. read_app_data parse 失败时:try `data.json.bak`;还失败 try `data.json.tmp`;都失败 fallback to default + 重命名损坏文件为 `data.json.corrupt.{timestamp}` 留存证据;
  3. 前端见 corrupt fallback 时显示 banner"Data file was corrupted; backed up to data.json.corrupt.{timestamp}. Default state restored."
- **修复保守度**: Medium(改 read path control flow,但只在 error 分支)
- **复核状态**: self-confirmed

---

### F16. `has_completed_category_id_migration` flag 一旦 true 永不回退 — partial migration 后 schema mismatch 无法 retry ★P2

- **置信度**: High
- **严重度**: P2
- **代码位置**: `data.rs:728-731`(check)+ `data.rs:804`(set true)
- **触发条件 (User does X)**: 用户首次升级 V2.1.2,500 个 skill。`migrate_category_id_for_skills_mcps` 跑了——loop 处理完所有 `skill_metadata` + `mcp_metadata` → 设 `data.has_completed_category_id_migration = true` → 写盘成功。**但** 在此期间用户某条 skill 的 metadata 是损坏的(过去某次 write 失败留下空 `category` string)——按 Layer 3 guard (`meta.category.is_empty()`) 直接 skip 该条。Flag 仍然推到 true。
  - 之后用户编辑该 skill 改 `category`(legacy path 写 `category` name 字段而非 `category_id`),migration 不再跑——`category_id` 永远是 None。
- **用户可见后果 (User sees Y)**: 该 skill 在 sidebar category filter 下出现/不出现的行为不一致——它走 fallback name lookup,只在恰好 category name 完全匹配时显示。改 category 名后 skill 消失。
- **不可见后果**: 数据连续不一致,但用户察觉概率低。
- **根因**: 一次性 migration + 终态 flag 是常见模式,但 `category_id` 是用户后续编辑也可能引入的脏字段——需要的不是"启动一次性 migration"而是"每个 update 路径都设 category_id"。当前 update_skill_metadata 应已正确设;但 marketplace 安装路径 / restore 路径若忽略可能漏。
- **建议修复**:
  1. 验证所有写 SkillMetadata.category 字段的路径都同步写 category_id(grep);
  2. flag 改为不是 "boolean 已 completed",而是 "schema version" — 当前 schema_version = 4 时已迁移过 #4;V5 加新 migration → 反 set flag 触发新 migration。
- **修复保守度**: Medium(需要 schema version 模型)
- **复核状态**: self-confirmed

---

### F17. `~/.claude.json` 被 Claude Code 同时写 — Ensemble 整文件 rewrite 模式丢失对方更新 ★P0

- **置信度**: High
- **严重度**: P0
- **代码位置**: `import.rs::write_claude_json` / `update_mcp_scope` 等各种修改 `~/.claude.json` 的路径
- **触发条件 (User does X)**: 用户同时开着 Claude Code(在 terminal 里活跃使用)和 Ensemble。在 Ensemble 里改一个 MCP scope global→project,触发 write_claude_json。**同时**,Claude Code 在某个 conversation 后自己更新 `~/.claude.json`(更新 `tipsHistory` 或 `numStartups`)。
- **用户可见后果 (User sees Y)**: Claude Code 后写赢 → Ensemble 改的 MCP scope 静默消失;或 Ensemble 后写赢 → Claude Code 的 tipsHistory 改动丢失。用户语言:"我改了 MCP scope 但下次重启 Claude Code 还是旧的"。
- **不可见后果**: 没有 fcntl lock / mtime check / atomic write。`#[serde(flatten)] other` 保护了 schema-level 的"未知字段",但**read → modify → write 三步之间** Claude Code 写的更新会被覆盖。
- **根因**: Ensemble 的 write_claude_json 是 read full → mutate → write full。这是 last-write-wins,不是 transactional。Claude Code 用的写策略未知(可能也是 last-write-wins),两边各自 happy 但 lost update。
- **建议修复**:
  1. write 前 check mtime,如果在 read 之后被改过,refuse + 让用户 retry(简单但 UX 一般);
  2. fcntl 文件锁(`flock`)—— Claude Code 是否也用 flock 需先调研(see `verify-third-party-behavior-firsthand.md`,grep claude code 源代码或文档);
  3. 最安全:把 Ensemble 写入限制到 `mcpServers` 子树,用 jq-style patch 而非整文件 rewrite。
- **修复保守度**: Risky(需要先了解 Claude Code 的写策略)
- **复核状态**: needs lead-agent verify(R5 没扫 Claude Code 源代码,只看 Ensemble 侧)

---

## 总结

### 我个人最关注的 3 条(若用户只修这 3 条,影响最大)

1. **F15 + F14 (data.json 损坏 unrecoverable)** — P0 数据完整性。任何 power loss / disk full / 用户 vim 手抖都让 app 整体瘫痪、无 recovery。Atomic write + bak 恢复链是基础设施级 fix,implementation 简单,blast radius 最大。
2. **F1 (init_app_data 非原子 + 错误吞掉)** — P0 首次启动失败。新用户体验关键路径,小概率但触发即"app 装上不能用"。修起来不复杂。
3. **F7 (AppData 缺 flatten other)** — P1 未来 forward-compat 准备。V3.0 一定会加字段;现在加 flatten 让任何 V2.x → V3.x → V2.x → V3.x 来回切换都不丢字段。修复=1 行,代价=0。

### 我觉得不必修的 1 条

- **F11 (cleanup_legacy_mcp_cache 每次启动 idempotent check)** — P3。代码极简,廉价,加 flag 反而引入新 schema 复杂度。接受现状即可。

### Cross-reference with known candidates(避免重复)

- F4(Trash 长期累积)与 A2 是同一 root cause 但不同维度:A2 是"Scene/Project trash 不 list"(缺 IPC),F4 是"所有 trash 没有 retention"(缺 GC)。两条都成立但解药一致——加 retention 模块同时解 4 条 entity types。
- F5 与 A3 同一 path 但叠加时间维度。F5 强调:即使按 A3 修复 metadata 恢复,3 个月后 metadata 中 category_id 已 stale 需要 reference-validity 校验。
- F8 与 `replace-installed-app-in-place.md` Rule 是同一 root cause 的不同 side。Rule 关注"安装时不留旧版";F8 关注"用户用旧 dmg 启动"——Rule 没覆盖的 fail mode。

### 时间维度补盲完成度

我重点扫描了:
- ✓ Startup migration paths (F1 / F2 / F3 / F9)
- ✓ Trash 长期累积 + restore reference 一致性 (F4 / F5 / F6)
- ✓ Schema forward-compat / 版本回滚 (F7 / F8 / F16)
- ✓ Power loss / 写中断 recovery (F14 / F15)
- ✓ 持久 marker 跨 plugin 卸载的清理 (F12)
- ✓ Cleanup 路径的 idempotency (F11)
- ✓ `--launch` 启动期边缘 (F13)
- ✓ `~/.claude.json` 跨进程并发 (F17)
- ✓ 大数据量启动慢 / async 阻塞 worker (F9 / F10)

未覆盖(scope 外):
- HashMap 反序列化失败"整盘空"——R1 / R2 angle 1 已涵盖
- Concurrency / DATA_MUTEX 覆盖 gaps——R1 已扫
- IPC contract / camelCase 不对齐——R3 已扫
- Shell injection / path traversal——R4 已扫

整体感觉:Ensemble 在稳态有较高质量,但**时间横切维度**(尤其首次启动、partial migration、长期 trash 累积、跨版本 / 跨进程协调)缺少防御。F14 + F15 + F7 + F1 是最值得在下一个 release 之前 land 的 4 条。F4 + F12 是 quality-of-life,可以下一版 land。
