# Known Risk Surfaces — 主 Agent Phase 1 一手发现

主 Agent 在 Phase 1 已经亲自读了核心后端代码 + 关键前端 stores + Project sync 链路 + 3 份大文件 Explore 摘要 + bugfix-archive 历史 + project-understanding。下列是已经发现的 candidate 列表。

**Reviewer 必须**:
- 对**归自己角度**的 candidate **复核**:读代码 → confirm / refute / adjust 严重度 → 用 finding 格式写在 `Rx_findings.md::复核结果` 部分
- 不要重复列(可引用)
- 在角度内**新发现**未列出的问题

格式简短(完整 finding 格式在 reviewer's findings.md 里展开)。

---

## A 类:数据完整性 / Sync 部署(R1 负责)

### A1. clear_project_config 无差别删除 3 处 CLAUDE.md 文件 ★P0 candidate
- `config.rs:162-179`
- 删除 `<project>/CLAUDE.md`、`<project>/.claude/CLAUDE.md`、`<project>/CLAUDE.local.md` 全部,不读 distributionPath setting,不验证文件是否 Ensemble managed(只对比内容?没有)
- 与 Rules 处理(`config.rs:189-219`,只删 ensemble managed filename)极其不一致
- **后果**:用户在 project root 手写非 Ensemble 管理的 `CLAUDE.md`,Sync Clear 后被静默删除
- 用户语言:"我项目根目录的 CLAUDE.md 没了"

### A2. list_trashed_items 不读 trashed_scenes / trashed_projects ★P1 candidate
- `trash.rs:122-337` 只扫 trash/skills, trash/mcps, trash/claude-md, trash/rules 四个磁盘目录
- 但 `delete_scene` / `delete_project` 把数据塞进 `data.json::trashed_scenes` / `trashed_projects`(`data.rs`)
- 也没有 `restore_scene` / `restore_project` IPC(`lib.rs` 没注册,explore 报告也确认)
- **后果**:用户 delete Scene/Project 后无法 restore;数据塞在 data.json 里永远占地方
- 用户语言:"我误删了一个 Scene,Trash 里看不到,恢复不了"

### A3. restore_skill / restore_mcp 不恢复 metadata 到 data.json ★P1 candidate
- `trash.rs:343-376`(restore_skill)/ `trash.rs:382-415`(restore_mcp)
- 只 fs::rename 把文件移回去,不读 metadata snapshot(`_ensemble_metadata.json` / `<path>.metadata.json`),不写回 data.json::skill_metadata / mcp_metadata
- **不对称**:marketplace conflict modal 的 RestoreFromTrash 流程经过 `finalize_skill_install`/`finalize_mcp_install` 会 consume snapshot;但 trash.rs 这条路径不会
- **后果**:用户从 Trash Recovery 主动恢复后,skill/mcp 失去 category / tags / icon / usage_count / last_used
- 用户语言:"从废纸篓恢复的 Skill 没有分类标签了"

### A4. delete_category / delete_tag 不 cascade Rules ★P2 candidate
- 根据 Explore data.rs 报告,delete_category cascade 到 skill_metadata + mcp_metadata + claude_md_files,**没列 rules**
- Rule 有 `category_id` 和 `tag_ids` 字段
- **后果**:rule 的 category_id 变孤儿 → UI 上 rule 显示为 "Uncategorized"(具体行为需复核)

### A5. fs::rename 跨 filesystem 失败无 fallback ★P2 candidate
- `skills.rs::delete_skill` line 337,`mcps.rs::delete_mcp` line 538,`trash.rs::restore_*`,`rules.rs::delete_rule` line 630,`claude_md.rs::delete_claude_md` line 618
- 用户的 skillSourceDir 如果配置在另一磁盘,trash 在 `~/.ensemble/trash/` 在另一磁盘,EXDEV 错误
- rules.rs / claude_md.rs 有 remove_dir_all fallback;skills.rs / mcps.rs **没有 fallback**
- **后果**:删除失败,用户 retry 也不能成功

### A6. add_project 接受空 sceneId(unwrap_or_default → "")★P3 candidate
- Explore 报告 line 1105 `unwrap_or_default()` on sceneId
- **后果**:project 可以创建但永远没 Scene 绑定;CLAUDE.md 已记录"project.sceneId 不会悬垂"是设计假设,这里破了
- 实际 ProjectsPage 应该强制 sceneId,需复核前端是否真传

### A7. syncProject 四段串联无 atomicity 无 rollback ★P1 candidate
- `projectsStore.ts:227-269`:`sync_project_config` → `distribute_scene_claude_md` → `distribute_scene_rules` → `update_project(lastSynced)`
- 任一步失败 throw error,partial state 残留(symlink 已建但 CLAUDE.md 没分发,或 CLAUDE.md 已分发但 Rules 没,或 Rules 已分发但 lastSynced 没更新)
- **后果**:UI 显示"未同步"但实际项目里有半套配置,clearProjectConfig 走"全删"路径覆盖问题不大,但 partial sync 期间用户看不到状态

### A8. clear_project_config 缺与 sync 的对称性(distributionPath 设置失效)★P2 candidate
- sync 写到 `claudeMdDistributionPath`(用户选定),clear 删 3 处全部
- 如果用户 sync 写 `.claude/CLAUDE.md`,然后 clear 也会删 `CLAUDE.md` / `CLAUDE.local.md`(用户根目录的)— 与 A1 重合

---

## B 类:安装 / 三种来源 / Restore 一致性(R2 负责)

### B1. skills.rs::scan_skills 硬编码 scope="user" ★P1 candidate
- `skills.rs:257` `scope: "user".to_string()` 硬编码
- mcps.rs 是 derive_mcp_scope(),skills 没 derive
- 前端 `Skill.scope: 'global' | 'project'` 与 backend 返回 "user" 不一致
- `loadSkills` 传 `claudeConfigDir` 但 `scan_skills(source_dir: String)` 只 1 参,**Tauri serde 默默忽略 unknown**
- **后果**:Skills 页"global/project" UI 显示永远是同一个值;updateSkillScope 改 symlink 但 scope 字段不变

### B2. claude_md.rs::is_excluded_dir 排除所有 `.starts_with('.')` 目录 ★P0 candidate
- `claude_md.rs:297-304`,与 rules.rs:351(`name != ".claude"` 例外)不一致
- scan_claude_md_files 会过滤掉所有 `.claude/` 目录,但 type 推断逻辑(`infer_claude_md_type` line 407)又说 `.claude/CLAUDE.md` 是 Project 类型
- **后果**:用户的 `<project>/.claude/CLAUDE.md` 不会出现在 Scan 列表里,无法 import
- 这与 distribute 默认写 `.claude/CLAUDE.md` 矛盾

### B3. detect_plugin_mcps 用 existing_mcp_names 判 is_imported ★P2 candidate
- `plugins.rs:662-663` `is_imported = imported_set.contains(&import_key) || existing_mcp_names.contains(&mcp_name)`
- existing_mcp_names 包括用户本地自建的同名 MCP,不止 plugin import
- **后果**:用户本地有 `playwright` MCP,plugin 列表中的 `playwright` plugin MCP 被误标"已导入"

### B4. import_plugin_skills (symlink) vs import_plugin_mcps (copy) 不一致 ★P2 candidate
- `plugins.rs:735-741` skills 用 symlink → plugin 更新自动跟着
- `plugins.rs:822-863` MCPs 用 copy → plugin 更新不跟着
- **后果**:plugin 升级后,MCP 用旧配置,需要 user 手动 re-import

### B5. set_global_rule is_already_managed 运算符优先级歧义 ★P3 candidate
- `rules.rs:693`:`r.source_path == path_str || r.filename == target_rule.filename && r.is_global`
- `&&` > `||`,实际是 `source_path 匹配 || (filename 匹配 AND is_global)`
- **后果**:取决于 intent,可能误判 already_managed,跳过 auto-import → 用户原有 `~/.claude/rules/<filename>.md` 内容被覆盖

### B6. install_marketplace_mcp 空 url 写到 .mcp.json ★P2 candidate
- `config.rs:30` HTTP MCP `mcp.url.as_deref().unwrap_or("")` 写空字符串
- **后果**:Claude Code 拿到空 URL,在 stderr 报错但用户不知道

### B7. marketplace_source 三元组持久但从不重新校验 ★P3 candidate
- `marketplace.rs:3001-3008` 记录 owner/repo/name + last_synced_at
- 用户 update / 后续 sync 后,upstream 改名 / 移动,本地 marketplace_source 一直引用旧 location
- **后果**:detail panel "From GitHub" 链接 404

### B8. scenesStore.deleteScene 不防御 Project sceneId 引用 ★P3 candidate
- ScenesPage 层有 alert,Store 没。绕路调用会留悬空 sceneId
- 实际只有 ScenesPage 调用,但 future code 可能绕

---

## C 类:错误处理 / 前后端契约(R3 负责)

### C1. scan_skills 多余参数 claudeConfigDir 静默丢弃 ★P1 candidate
- `skillsStore.ts:116` 传 sourceDir + claudeConfigDir
- backend `scan_skills(source_dir: String)` 只接收 1 个,Tauri serde 默默忽略
- 前端注释说"backend can derive each Skill's scope by checking <claudeConfigDir>/skills/<name>",**但 backend 没用**
- 关联到 B1

### C2. create_symlinks / remove_symlinks 错误用 Ok 包装 ★P2 candidate
- `symlink.rs:91-105, 109-123` 错误也 `Ok(errors_vec)`,前端用 try/catch 检测不到
- **后果**:UI 看到 success 但实际部分 symlink 没建

### C3. import_plugin_skills / import_plugin_mcps eprintln 错误不返回 ★P2 candidate
- `plugins.rs:764, 874`:errors 只 eprintln 不返回前端
- **后果**:UI"全部导入成功",实际部分失败

### C4. read_app_data on parse failure: propagate;on missing: default ★P2 candidate
- `data.rs:243-251`(从 Explore 报告)
- parse 失败传错误,missing 默认 — 这是合理的;但**fs::read 错误**(权限、IO)也走"default"路径,会**静默回到 empty AppData**,用户 categories/tags/scenes/projects 全消失
- **后果**:磁盘瞬时不可读时,UI 显示空,用户以为数据没了

### C5. fetch_mcp_tools 丢弃 stderr ★P2 candidate
- `mcps.rs:314` `stderr(Stdio::null())`
- MCP server 启动失败的 stderr 完全消失,前端拿到的 error 只有"No response from MCP server"
- **后果**:用户 debug MCP 启动失败没头绪

### C6. update_rule 缺 category_id "clear" 路径 ★P3 candidate
- `rules.rs:547`:`if let Some(cid) = category_id { rule.category_id = Some(cid); }`
- 只 set,不 clear。Skill/MCP 用 Option<Option<String>> 三态,Rule 不一致
- **后果**:用户清空 rule category 无法生效,需要重新设别的 category

### C7. delete_skill / delete_mcp 写 data.json 错误被吞 ★P3 candidate
- `skills.rs:350` `let _ = write_app_data(app_data);`
- comment 说"trash move 已成功,这里只是 metadata 清理"
- 但用户看不到 data.json 写失败,下一次启动可能 metadata 还在(skill 已删但 metadata 残留)

### C8. SubAgent 报告中提到的 data.rs `unwrap_or_default()` on sceneId / orphan id 在 frontend 行为 ★P2 candidate
- 见 A6,但前端如何处理空 sceneId 的 project 需要 R3 复核

---

## D 类:安全 / 输入验证 / Shell 注入(R4 负责)

### D1. launch_claude_for_folder AppleScript / shell 注入 ★P1 candidate
- `import.rs:1459,1607` AppleScript 字符串插值 folder_path_str + claude_command
- 路径含 `"`、`\` 会破坏 AppleScript
- **后果**:含特殊字符的 project 路径无法 launch / 极端时执行任意 shell

### D2. Warp YAML 注入 ★P1 candidate
- `import.rs:1524-1537` YAML 插值
- folder_path_str + claude_command 直接插入 YAML 不引用
- **后果**:破坏 YAML 解析 / 跨字段污染

### D3. install_quick_action 硬编码 `/Applications/Ensemble.app/` ★P3 candidate
- `import.rs:1048-1051`
- 用户安装在 `~/Applications/` 或 `/Volumes/...` 则失败
- **后果**:Quick Action 不能 launch

### D4. fs::rename 跨 fs 失败(与 A5 重合) ★P2 candidate
- 已在 A5 列出

### D5. tarball extraction path traversal — 已 sanitize ★P0-good
- `marketplace.rs::install_skill_via_codeload` 已 sanitize_resource_name + starts_with(dest_dir)
- 不算 finding,但**复核**确认 ok

### D6. fetch_mcp_tools 继承全部 env 变量 ★P3 candidate
- `mcps.rs:318` `cmd.envs(std::env::vars())` 把当前进程所有 env 传给 MCP server
- 包含 ANTHROPIC_API_KEY 等敏感 token
- **后果**:malicious MCP 可读 API key

### D7. symlink.rs::create_symlink 不验证 source path 不在系统目录 ★P3 candidate
- `symlink.rs:9-43` 任意路径可创建 symlink
- 但 source 路径来自前端,如果前端被注入可能造成系统目录被链接
- 实际 IPC 调用者只有 store,前端不接受用户任意输入,**Low risk**

### D8. read_app_data unwrap_or_default 静默回退(与 C4 重合)
- 已在 C4 列出

### D9. claude_md.rs migrate_claude_md_storage 启动跑 ★P3 candidate
- `claude_md.rs:935-963` 启动时跑 mutex lock + 改 data.json
- 如果在 app 刚启动时 mutex 出问题(theoretically only)会让 app 启动慢
- **Low risk**

---

## 主 Agent 自己已 ruled out(不需要 reviewer 再扫)

- `marketplace.rs::install_skill_via_codeload` codeload streaming + describe_reqwest_error + 120s timeout **已 fix**(`marketplace.rs:2500-2528, 2569-2606`),只剩 broad sample test 验证还没跑
- `auto_classify_new_items` flag gate **已 fix**(`marketplace.rs:3352, 3383`)— project-understanding 文档过时
- tar 提取的 path traversal **已 mitigate**(sanitize + starts_with)
- DATA_MUTEX coverage **基本完整**(Explore 报告确认所有 mutator 都 lock)
- ENSEMBLE_DATA_DIR test isolation **已 hard-protect**(`path.rs:46-52` panic)

## 主 Agent 已 verify 但需要 reviewer 给出更精确判断

- **scope 字段的实际 UI 行为**:Skill.scope 始终硬编码 "user",前端的 'global'|'project' 与之不匹配,UI 上显示什么?需要 R2 / R3 找到 SkillDetailPanel / SkillListItem 看 scope 字段使用情况
- **SceneDetailPage 死代码 vs 内嵌使用**:`SceneDetailPage.tsx` 有 component 定义 + export,App.tsx 没注册路由。需要 R3 grep 是否在 ScenesPage 内联用
- **set_global_rule 优先级歧义**(B5)实际触发场景需要走流程推演
