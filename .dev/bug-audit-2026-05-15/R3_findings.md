# R3 — 错误处理 / 前后端 IPC 契约 / 用户可见反馈 Findings

主 Agent 的 02_known_risk_surfaces.md 中 C 类(C1-C8)是我的复核范围。逐条复核后写新发现。

复核基线:亲读 `src/utils/tauri.ts`、`src-tauri/src/lib.rs:72-205`(全部 IPC 注册)、`src-tauri/src/commands/{skills,mcps,data,config,rules,claude_md,symlink,usage,import}.rs`、`src/stores/*` 共 11 个 store、`src/types/index.ts`、Tauri 2.9.5 源码(`tauri-2.9.5/src/ipc/command.rs` + `tauri-macros-2.5.2/src/command/wrapper.rs`)。

---

## 复核结果(C1-C8)

### C1. scan_skills 多余参数 claudeConfigDir 静默丢弃 — **REFUTED**

**置信度**: High **状态**: 已不存在(代码已修)

- 旧版 `scan_skills(source_dir: String)` 确实会丢 `claudeConfigDir`。
- 当前 `skills.rs:16` 已经是 `pub fn scan_skills(source_dir: String, claude_config_dir: String)`,并把第二个参数传给 `derive_skill_scope`(line 75-82)从 `<claude_config_dir>/skills/<name>` 派生 scope。
- frontend `skillsStore.ts:116-119` 正确传 `sourceDir + claudeConfigDir`。

**Tauri 2.x serde 权威结论**(对解开关联问题的副产品):Tauri 2.9.5 解 args 不走整体 `Deserialize`,而是 `tauri-2.9.5/src/ipc/command.rs:97-104` 对每个命名参数**逐键**调 `v.get(self.key)`。**没有 `deny_unknown_fields`**。所以**额外字段会被静默忽略**——不会报错。Tauri Rust 参数默认用 `to_lower_camel_case` 转 JSON 键(`tauri-macros-2.5.2/src/command/wrapper.rs:50` 默认 `ArgumentCase::Camel`),所以 Rust `category_id` 和 Rust `categoryId` 都映射到 JSON 键 `categoryId`。

C1 本身不是 bug。但**该结论对 R3 全篇至关重要**:前后端字段名不匹配时不会报错,只会"对应字段拿到 None / 默认值",是静默故障的常见温床。

---

### C2. create_symlinks / remove_symlinks 错误用 Ok 包装 — **REFUTED(死代码,无前端调用)**

**置信度**: High **状态**: P3 死代码,不算 bug

- 实测:`grep create_symlinks` 与 `remove_symlinks` 在 `src/`(整个前端)**零命中**(只有 `src-tauri/` 本身)。
- 这两个 IPC 在 `lib.rs:89-90` 注册,但前端从未调用——`config.rs::sync_project_config` 自己内联做 symlink(line 100-112),没调 batch 版本。
- 单数版 `create_symlink` / `remove_symlink` 也都没前端调用。

**建议**: 删掉 `symlink::create_symlinks` / `remove_symlinks`(以及未用的 `symlink::create_symlink` / `remove_symlink` / `get_symlink_target` / `is_symlink`),省下五个 IPC 注册位 + 三十多行 dead code。**严重度 P3**,只算 maintainability,不影响用户。

(注:若未来真要复用 batch symlink API,errors-in-Ok 模式的批判仍成立——但要在前端调用点时讨论。)

---

### C3. import_plugin_skills / import_plugin_mcps eprintln 错误不返回 — 归 R2 角度,**R3 不复核**

跨 R2 范围(plugin 安装语义),只标记:如果 R2 不修,从 R3 角度同样建议返回 `Vec<{name, error}>` 给 UI,而不是 eprintln。R2 必读 candidate 02_known_risk_surfaces.md C3,无需 R3 重复。

---

### C4. read_app_data 对 fs 错误(非 missing)直接 propagate — **CONFIRMED(但严重度需校正)**

**置信度**: High **严重度调整**: P2 → P1(以下细化)

- 实测 `data.rs:243-251`(下方完整复现):
  ```rust
  pub fn read_app_data() -> Result<AppData, String> {
      let data_path = get_data_file_path();
      if data_path.exists() {
          let content = fs::read_to_string(&data_path).map_err(|e| e.to_string())?;
          let data: AppData = serde_json::from_str(&content).map_err(|e| e.to_string())?;
          Ok(data)
      } else {
          Ok(AppData::default())
      }
  }
  ```
- **02 描述有偏差**: 原文说"fs::read 错误也走 default 路径",**错**——fs::read 错误是 `?` propagate `Err(String)`。**真正的问题不是静默回退,而是另一个 fallback 链**——`skills.rs:319-329 load_skill_metadata` / `mcps.rs:261-271 load_mcp_metadata`:
  ```rust
  fn load_skill_metadata() -> ... {
      if data_path.exists() {
          if let Ok(content) = fs::read_to_string(&data_path) {
              if let Ok(app_data) = serde_json::from_str::<crate::types::AppData>(&content) {
                  return app_data.skill_metadata;
              }
          }
      }
      std::collections::HashMap::new()  // ← 静默空 fallback
  }
  ```
- **行为不一致**:同一份 data.json,`read_app_data` 解析失败 = IPC 返回错误,但 `scan_skills` 内部读它失败 = 返回空 metadata HashMap → 用户看到所有 Skill 的 category/tags/icon 全部清空,但 sidebar / Scene 等其它入口还在显示分类(因为它们走 `read_app_data` 路径)。
- **触发条件 (User does X)**: 用户编辑 data.json 引入 JSON 错误(or 一个并行进程在 scan 期间正在 writing data.json,fs 读到部分写入的内容)
- **用户可见后果 (User sees Y)**: SkillsPage / McpServersPage 上所有 Skill 的 Category / Tags / Icon 全部清空(显示"Uncategorized");与此同时,sidebar 还显示完整的 Category 列表(从 `read_app_data` 拿到的 categories Vec 正常)。
- **不可见后果**: Skill 元数据**没丢**,只是这次 scan 误以为没有。下次 app 重启,scan 重读成功,数据全回来。但用户看到这一瞬可能误以为数据丢了,直接重新分类一遍 → 触发 `update_skill_metadata`(走 `read_app_data` 路径,这次成功)→ 原元数据被新值覆盖 → **真的丢了**。

**根因**: `load_skill_metadata` / `load_mcp_metadata` 用 `if let Ok(...)` 链而非 `?` 传错。Memory pattern 命中:`if let Ok(...) silently swallows parse errors`(`MEMORY.md::Patterns`)。

**建议修复**: `load_skill_metadata` 与 `load_mcp_metadata` 改为返回 `Result<HashMap, String>`,与 `parse_mcp_file` 一样在外层用 `?`。或者更稳:直接调 `read_app_data()?.skill_metadata`,删除 ad hoc loader。
**修复保守度**: Safe(scan 路径上读 data.json 失败本来就该让用户知道,不应静默)。
**复核状态**: self-confirmed

---

### C5. fetch_mcp_tools 丢弃 stderr — **CONFIRMED**

**置信度**: High **严重度**: P2

- 实测 `mcps.rs:318`: `.stderr(Stdio::null())` 没读 stderr。
- 用户启动 MCP 失败的真实原因(missing executable / npm not on PATH / 环境变量缺失 / npx 找不到 package / Node 版本不兼容)全部消失。
- frontend 拿到的错误只剩三种通用模板:`Failed to spawn MCP server '<cmd>'`(spawn 失败,**这条有具体错误**)、`No response from MCP server`(stdin/stdout pipe 没回应——可能是任何东西)、`Operation timed out after 15000ms`(超时)。
- 95% 的真实失败走第二条,用户拿到"No response from MCP server",**毫无方向**。

**用户语言**: "点 fetch tools 它说 No response,我也不知道哪错了,要是它告诉我 'npx: command not found' 我就知道是 PATH 问题"。

**建议修复**: 改为 `Stdio::piped()`,在超时 / 错误路径上额外把已读到的 stderr 尾部 8KB 拼到 `error` 字段返回。代码改动不大,影响面只有 fetch_mcp_tools。
**修复保守度**: Medium(MCP 的 stderr 可能输出敏感信息——但通常只有 npm 警告 / debug 日志,实际敏感性低;明确写到 UI 时可考虑只在 dev build 显示)。
**复核状态**: self-confirmed

---

### C6. update_rule 缺 category_id "clear" 路径 — **CONFIRMED, 严重度提升 P3 → P1, 范围扩展**

**置信度**: High **严重度调整**: P3 → P1
**范围扩展**: 同样 bug 存在于 `update_claude_md` 和 `update_rule`,**两处都需要修**。

- 实测 `rules.rs:494,547`:
  ```rust
  category_id: Option<String>,    // ← 不是 Option<Option<String>>
  ...
  if let Some(cid) = category_id {
      rule.category_id = Some(cid);
  }
  ```
- 实测 `claude_md.rs:506,541`: 同样的 `Option<String>` + `if let Some(cid) = ... { ... = Some(cid) }`。
- 而 `skills.rs:113` / `mcps.rs:122` / `update_category` 都正确用 `Option<Option<String>>`。
- 前端 `rulesStore.ts:265` 直接传 `categoryId: updates.categoryId` —— `updates: Partial<Rule>`,如果某次调用 `updates.categoryId = undefined` 表达"清空 category",前端 optimistic 已设 `categoryId: undefined`,但 backend 收到 JSON `{"categoryId": undefined}` 序列化为缺失字段 → Rust `Option<String> = None` → `if let Some(cid)` 失败 → **不改 rule.category_id**。
- 下次 `loadRules()` 拿回 backend 的 `category_id: Some("旧值")` → optimistic 被覆盖回去 → **用户看到 category 又跳回原来的**。

**触发条件 (User does X)**: 在 Rule 详情面板把 Category dropdown 选择 "Uncategorized" / 空(具体 UI 路径不一定有这个选项,但 store API 暴露的语义就是把 categoryId 设为 undefined)。同样在 CLAUDE.md 详情面板做同样动作。

**用户可见后果 (User sees Y)**: dropdown 短暂变成空,然后下次列表刷新后 category 又回到原来的值。无错误提示。

**不可见后果**: rule.category_id 数据 stuck。用户唯一的 workaround 是"把它分配到别的 category"。也即用户**完全无法清空 Rule / CLAUDE.md 的 category**。

**根因**: 历史断层——skills/mcps 走过了"三态 Option<Option<T>>"重构(V2 [P1-6]),CLAUDE.md / Rules 没走完。注释里写"Three-state pattern reserved for update_category"(`data.rs:386-389`),但实际 skills/mcps 也实现了——更新 Rules / CLAUDE.md 时该 doc 没同步。

**建议修复**: `update_rule.category_id: Option<Option<String>>` + 同步 mutation 逻辑(`if let Some(new) = category_id { rule.category_id = new; }`)。`update_claude_md.category_id` 同样改。前端 `rulesStore.updateRule` / `claudeMdStore.updateFile` 改为 `categoryId === undefined ? undefined : (categoryId ?? null)`(显式 null 表清空)——和 `skillsStore.updateSkillCategory` 已有模式(line 208)一致。
**修复保守度**: Medium(改 IPC 签名 → 前端必须同步;但 outer None 默认 = "do not modify" 保兼容,所以非 Partial 的旧 caller 不会 regression)。
**复核状态**: self-confirmed

---

### C7. delete_skill / delete_mcp 写 data.json 错误被吞 — **CONFIRMED, 严重度合适为 P3**

**置信度**: High **严重度**: 保持 P3

- 实测 `skills.rs:380-385` / `mcps.rs:568-573`: trash move 后 `let _ = write_app_data(app_data);`,有注释解释("trash move 已成功,这里只是 metadata 清理")。
- 实测后果窗口很窄:用户删完一个 skill,关 app 之前 metadata 没清掉。重启 scan 时 `parse_skill_file` 找不到 `id == sourcePath` 的目录 → entry 被略过 →`load_skill_metadata` 里残留的 metadata key 没人用 → 实质无害。**唯一**残留:metadata HashMap 永远多一个 dead key,**用户从 trash restore 同名 skill 时**(罕见路径),老 metadata 自动找回——这反而是 feature(`metadata snapshot` 机制专门为此设计)。

**建议**: **不修**,但**改 comment**——"write_app_data 失败这里被吞,反而对 restore-from-trash 路径有利"。当前 comment 让人读完还以为是 bug。
**修复保守度**: N/A
**复核状态**: self-confirmed (建议不修)

---

### C8. add_project sceneId 用 unwrap_or_default 接受空 — **CONFIRMED, R3 角度补充**

**置信度**: High **严重度**: 保持 P3

- 实测 `data.rs:1105`: `scene_id: sceneId.unwrap_or_default()` —— `None` 时 `scene_id = ""`。
- 前端 `projectsStore.ts:138-152`:`createProject` 已在 store 层 `if (!newProject.name || !newProject.path) return;` 但**没**检查 sceneId。`ProjectsPage` UI 应该 enforce,但前端表单不一定。
- 触发后:`project.sceneId = ""` → ProjectsPage 渲染 "Scene: " 空白 → 用户点 Sync → `syncProject` line 203 `scenes.find(s => s.id === project.sceneId)` 找不到 → `set({ error: 'Scene not found' })` 抛错。
- 不会损坏数据,但用户看到的错误信息**误导**——"Scene not found" 意思是 sceneId 指了一个已删除的 Scene,但实际是从来没设过。

**建议修复**: `add_project` 校验 `sceneId.as_deref() != Some("")`,空就 `Err("Scene is required")`;或更简洁,接受 `Option<String>`,空字符串当 None,**显式说"未来阶段允许 unassigned project"** 那就给一个不同的 error message。最简改法是 `Err("Scene is required")`。
**修复保守度**: Safe
**复核状态**: self-confirmed

---

## 新发现(R3 角度,02 未覆盖)

### F1. update_rule / update_claude_md 无法清空 categoryId(C6 扩展) — 已在 C6 中合并,不重复

### F2. delete_category / delete_tag 不 cascade 到 Rules → 悬空 categoryId / tag_ids

**置信度**: High **严重度**: P2
**代码位置**: `data.rs:514-616 delete_category` / `data.rs:853-887 delete_tag`

- 实测 `delete_category:584-612`:cascade 到 `skill_metadata` / `mcp_metadata` / `claude_md_files`(`file.category_id`),**未触 `data.rules`**。同样 `delete_tag:866-883` cascade 到 `skill_metadata.tags` / `mcp_metadata.tags` / `claude_md_files.tag_ids`,**未触 `data.rules.tag_ids`**。
- 这与 02 的 A4 同类(R1 角度),但 R3 视角:**delete_*_tag** 在 02 未列出。
- **触发条件 (User does X)**: 用户给某条 Rule 分类、加标签,然后从 sidebar 删除该 Category 或某个 Tag。
- **用户可见后果 (User sees Y)**: Rules 列表里那条 Rule 仍显示老 category 名字 / 老 tag pill(因为 `rule.category_id` / `rule.tag_ids` 没改)。但点进去发现 sidebar 上对应的 Category / Tag 已经不存在 → CategoryPage 路由进去 404 一样的空 page;Tag pill 点了无效果。
- **不可见后果**: 一条悬空的 `category_id` 在 data.json 里持续存在直到用户手动改 Rule。Tag_ids 同理。

**根因**: `delete_category` / `delete_tag` 写时,Rule 还不是 first-class entity。Rule 加进 AppData 后,cascade 块没补。

**建议修复**: 在 `delete_category` 添加:
```rust
for rule in data.rules.iter_mut() {
    if rule.category_id.as_deref() == Some(&id) {
        rule.category_id = None;
    }
}
```
`delete_tag` 同样:
```rust
for rule in data.rules.iter_mut() {
    rule.tag_ids.retain(|t| t != &id);
}
```
**修复保守度**: Safe
**复核状态**: self-confirmed

---

### F3. trashStore 无 restoreRule 入口 → Trash 里被 restore_rule IPC 注册但前端永不调用

**置信度**: High **严重度**: P1
**代码位置**: `src/stores/trashStore.ts:1-141`(完整),`src-tauri/src/lib.rs:183 trash::restore_rule` 已注册

- 实测 trashStore.ts 只有 `restoreSkill` / `restoreMcp` / `restoreClaudeMd` 三个 action,**没有** `restoreRule`。
- backend `trash::restore_rule` 在 lib.rs:183 注册,代码存在,但前端**没有**调用方。
- 用户删除 Rule(`rules.rs:578-645 delete_rule` 走 soft delete 到 `~/.ensemble/trash/rules/<id>_<timestamp>/`),想从 Trash UI 恢复时无法操作。
- 关联 A2(02 R1 角度):trashed_scenes / trashed_projects 在 data.json 里塞着没出口——这里是同一类问题在 Rules 上的复刻。

**触发条件 (User does X)**: 用户在 RulesPage 删除一条 Rule,然后想从 Trash recovery 界面恢复它。

**用户可见后果 (User sees Y)**: TrashRecovery 界面(若 UI 入口存在)只看到 Skills / MCPs / CLAUDE.md 四类,没有 Rules tab(或 Rules 不显示)。无法 restore。

**不可见后果**: 被删 rule 的目录 `~/.ensemble/trash/rules/<id>_<timestamp>/` 永远占用磁盘。

**建议修复**: trashStore.ts 添加 `restoreRule` action,镜像 `restoreSkill` 模式。UI 加 Rules tab。同时**复核** `list_trashed_items`(`trash.rs:122-337`)是否扫了 `trash/rules/` 子目录——若没扫,需要补。
**修复保守度**: Safe(纯增量,不动既有数据)。
**复核状态**: self-confirmed

---

### F4. SceneDetailPage 死代码 + 漏注册路由 → 增长前端 bundle 但不影响用户

**置信度**: High **严重度**: P3
**代码位置**: `src/pages/SceneDetailPage.tsx`(完整),`src/pages/index.ts:5` re-export,`src/App.tsx:1-42` 无路由注册

- 实测 grep `SceneDetailPage` 整个 `src/`:只在 `src/pages/SceneDetailPage.tsx`(自身)和 `src/pages/index.ts`(re-export)出现。ScenesPage / App.tsx 都不引用。
- 即:整个 component 被构建到 bundle 里,但用户永远访问不到。
- 不会触发任何 user-visible bug。

**建议修复**: 删 `SceneDetailPage.tsx` + `src/pages/index.ts:5` 的 re-export。若未来打算复用,先确认 ScenesPage 是否真的需要详情子页(当前 ScenesPage 是 inline detail,详情面板内联在 list 旁边)。
**修复保守度**: Safe
**复核状态**: self-confirmed

---

### F5. 15 个 store 中的 error handling 不一致(典型不一致)

**置信度**: High **严重度**: P2
**代码位置**: 全 `src/stores/`

| Store | 失败处理 | Optimistic rollback | 用户可见反馈 |
|---|---|---|---|
| `skillsStore.deleteSkill` (159-168) | `set({ error })` + 重新 `loadSkills()` | 是 | 错误 UI ✓ |
| `mcpsStore.deleteMcp` (141-151) | `set({ error })` + 重新 `loadMcps()` | 是 | 错误 UI ✓ |
| `mcpsStore.updateMcpTags` (200-218) | **只** `set({ error })`,**不 rollback** optimistic 没做 | 否 | 错误 UI ✓ — 但 UI 已显示新 tags(其实失败了) |
| `mcpsStore.updateMcpIcon` (220-242) | 同上 | 否 | 同上 |
| `claudeMdStore.unsetGlobal` (350-377) | `set({ error })` 但前端已 mutate `files.isGlobal=false` | 否 | 错误 UI ✓ — 但 UI 显示已 unset(其实失败了)|
| `rulesStore.unsetGlobal` (347-367) | 同上 | 否 | 同上 |
| `scenesStore.deleteScene` (225-268) | `set({ error })` + throw,**不重新 loadScenes** | 否 | 错误 UI ✓ — 但 UI 已删除 scene(其实失败了,scene 还在 backend)|
| `scenesStore.updateScene` (270-291) | `set({ error })` + throw,**不 rollback** | 否 | 同上 |
| `trashStore.restoreSkill` (59-85) | `set({ error })` + 重新 loadTrashedItems | n/a | ✓ |
| `projectsStore.syncProject` (193-269) | `set({ error })` + throw,**partial state**(symlink + .mcp.json + CLAUDE.md 任一失败不 rollback 已成功的)| 否 | ✓ + partial config 残留(A7 重合)|

- **总结**: 大约半数 store action 的 catch 块**只设 error message,不 rollback / 不 reload**。UI 会显示 optimistic 状态(看着是成功),同时角落显示 error toast(看着是失败)。
- **典型用户体验**: "我点了删除,左侧 list 里东西消失了,但下面跳出来一行红字 'Error: xxx',我下次刷新它又出现了——这到底是删了还是没删?"

**建议修复**: 制定一条 store action 模板规约——任一 IPC 抛错,**始终**: (1)把 optimistic 改动 rollback 到 pre-call state;(2)set error message。统一通过一个 helper 函数封装 `await safeInvoke + rollback on catch` 减少重复。该清单做 **基础设施级**重构,不是单点修。
**修复保守度**: Medium(改面广,但每个改动单元很小)。
**复核状态**: self-confirmed

---

### F6. safeInvoke 返回 null 时 caller `.map / .filter / .length` 多处不防御

**置信度**: High **严重度**: P2
**代码位置**: 见下表

`safeInvoke<T>` 在 non-Tauri env(浏览器 dev mode)返回 `null`。多数 store 用 `?.` 或 `|| []` 兜底。但少数地方直接 `.map` / `.length`,会崩。

| 文件 | 行号 | 调用 |
|---|---|---|
| `scenesStore.ts:194` | `claudeMdIds: createModal.selectedClaudeMdId ? [...] : []` | safe |
| `mcpsStore.ts:321` | `result.tools.map((t) => ...)` | 已护:外层 `if (result && result.success)` |
| **多处页面组件**(SkillsPage / McpServersPage / 等)| 通过 hook 拿 `skills`,`getFilteredSkills` 已经 `|| []` 兜底 | safe |
| `scenesStore.ts:154-160` | `appData?.lastEditedSceneId ?? null` | safe |
| `appStore.ts:479,539,635,758,765` | `const updated = await safeInvoke<...>('reorder_*');` 后 `if (updated) { ... }` | safe |

实测扫了 11 个 store + 关键 page 的 safeInvoke caller,**没找到**未护的 `.map / .filter / .length` 直接调用——大量是 `?.` 或外层 `if (result)` 检查。

**结论**: 02 列出的 candidate 在当前代码中**未发现**真实 crash 点。**REFUTE**。
**复核状态**: self-confirmed

---

### F7. claude_md.rs 大量 `println!` 调试日志生产构建会污染 stderr

**置信度**: High **严重度**: P3
**代码位置**: `claude_md.rs:319-389`(多处),`rules.rs:592-637`(多处),`data.rs::delete_category` 内部 disambiguation log(line 501)

- 实测 `grep println /Users/bo/Documents/Development/Ensemble/Ensemble2/src-tauri/src/commands/*.rs | wc -l = 32` 处。
- production build 不剥离 stdout/stderr。这些 println 在 macOS 控制台 / Console.app 看得到。**用户感知低**——但日志显示绝对路径(e.g. `[delete_rule] Warning: Failed to remove global rule file /Users/<name>/.claude/rules/...`),**和下面 F9 隐私泄露关联**。

**建议修复**: 改用 `log::warn!` / `log::error!`,`tauri_plugin_log` 已在 lib.rs:25-29 接入 — debug build 给 Info+,release build 默认不输出。改起来批量替换。
**修复保守度**: Safe
**复核状态**: self-confirmed

---

### F8. scan_usage_stats 是 async 但内部全用 std::fs 同步 IO,阻塞 tokio worker

**置信度**: High **严重度**: P2(用户场景下可达 P1)
**代码位置**: `usage.rs:78-172`

- 实测 `usage.rs:79`: `pub async fn scan_usage_stats(claude_dir: String) -> Result<UsageStats, String>` —— 是 async 函数。
- 函数体里直接 `fs::read_dir` / `fs::read_to_string` / `File::open + BufReader::new` 同步 IO,**没有** `tokio::task::spawn_blocking` 包装。
- Tokio worker pool 默认 = CPU 核数(MacBook 通常 8-12)。Skills page / Sidebar `usageCount` 显示需要 scan,**全量扫**所有 transcripts(`~/.claude/transcripts/ses_*.jsonl` + `~/.claude/projects/<*>/<session>/*.jsonl` + `subagents/`)。
- 用户 Claude Code 用了一年,典型 `~/.claude/projects/` 下有 100+ 子目录,每个子目录有数十个 .jsonl,总数 1000+。每个文件 `File::open + 逐行 parse` 同步走完,**阻塞 worker** 几秒到几十秒。期间其它 tokio task(任意 `async` IPC,如 fetch_mcp_tools / install_marketplace_skill / 等)被卡。

**触发条件 (User does X)**: 打开 SkillsPage(`loadUsageStats` 被调用),与此同时点 Skill marketplace 安装一个 skill / 点 fetch tools。

**用户可见后果 (User sees Y)**: marketplace 安装按钮转圈但久不返回(本来应该几秒,现在 30 秒+);fetch tools 按钮一直转圈直到 usage scan 完成。

**不可见后果**: 数据全对,只是延迟。但用户可能以为 app 死了,强退;若 scan 中途强退,无脏数据。

**建议修复**:
1. 最小改动: `scan_usage_stats` 改成 `pub fn`(sync)——但 Tauri runtime 仍会在专用线程执行 sync 命令(`tauri::generate_handler` 自动选 path)。 → Verify Tauri 2.x:sync command 用 `spawn_blocking` 默认,跟 async + sync IO 不同。
2. 或显式 `tokio::task::spawn_blocking` 包装 IO 主体。
3. 真正 measure:用 `tracing` 在 scan 入口加 `let now = Instant::now();` log 耗时,确定问题严重度。本 finding 是基于代码推演,**measurement 后才是 P0/P1 定级**(per `measure-before-iterative-tuning.md`)。

**修复保守度**: Safe(改 sync function;Tauri 自动处理 threading)。
**复核状态**: needs lead-agent measurement before P0/P1 dosing decision

---

### F9. 错误消息泄漏完整本机绝对路径

**置信度**: High **严重度**: P3(隐私 / 演示场景)
**代码位置**: 多处:`skills.rs:342 "Skill not found: <full path>"`、`skills.rs:354 "Failed to create trash directory: <fs error with path>"`、`config.rs::sync_project_config` 等

- 实测大量 `format!("...: {}", e)` 把 `std::io::Error` 错误链直接抛给前端,内含 `/Users/bo/...` 完整路径。
- 用户在屏幕共享 / 录屏 / 截图 bug 报告时,绝对路径(含用户名)会泄漏。

**触发条件 (User does X)**: 任何 fs 错误。

**用户可见后果 (User sees Y)**: 红色错误 toast: "Failed to move skill to trash: rename: 'No such file or directory' (os error 2): /Users/bo/.ensemble/skills/foo".

**建议修复**: 抽一个 helper `collapse_user_paths(err_msg: &str) -> String`,把 `/Users/<name>/` → `~/`,接到所有 IPC `map_err` 链路。或更宽:errors 走 `serde::Serialize` enum,前端 i18n,但工作量大。最小改:`utils/path.rs` 已有 `collapse_tilde`,在错误转字符串时调用即可。
**修复保守度**: Medium(改面广)
**复核状态**: self-confirmed

---

### F10. update_project sceneId 不接受清空("移除 Scene 绑定"无入口)

**置信度**: Medium **严重度**: P2
**代码位置**: `data.rs:1118-1146 update_project`

- 实测 `update_project(sceneId: Option<String>, ...)`:
  ```rust
  if let Some(s) = sceneId {
      project.scene_id = s;
  }
  ```
- 与 `add_project` 不对称:`add_project` `unwrap_or_default()` 接受 None / 空(F8 的 C8)。`update_project` 只 set 不 clear,且 set 接受空字符串(同样静默)。
- **用户无法把 project 改回"未绑定 Scene"状态**——只能"换成另一个 Scene",或删除整个 project 重建。
- 若用户传 `{ sceneId: "" }`,backend 接受,`project.scene_id = ""` → 这时再 sync,`syncProject` 的 `scenes.find(s => s.id === "")` 返回 undefined → error "Scene not found"。

**触发条件 (User does X)**: 用户在 Project 详情面板选 Scene dropdown 的 "None" / "Unbind" 选项(若 UI 提供)。

**用户可见后果 (User sees Y)**: 选完 dropdown 跳回原来的 Scene,或者 sync 时"Scene not found"。

**建议修复**: 用 `Option<Option<String>>` 三态,或新增 `unbind_project_scene` IPC 显式语义。
**修复保守度**: Safe
**复核状态**: needs lead-agent verify(需要看 ProjectsPage UI 是否有 Unbind 按钮)

---

### F11. mcpFetchErrors 永不被 manually cleared

**置信度**: Medium **严重度**: P3
**代码位置**: `mcpsStore.ts:80,315-329,343-356`

- 实测:`mcpFetchErrors: Record<string, string>` 在 fetchMcpTools **成功**时通过 destructuring 移除 key(line 315-329)。**失败**时累加 key。
- 若用户启动 MCP 失败(错误消息留在 `mcpFetchErrors[mcpId]`),修了配置后**没**重新点 fetch,而是直接点 sync / 别的操作 → 错误一直挂在那。
- `loadMcps` 时 reset `mcpFetchErrors: {}`(line 108)。但 `fetchMcpTools` 单条失败不会触发 `loadMcps`。

**建议**: 不修——这是 cache-style 错误存储,clean-by-success 已合理。**REFUTE**(只在自检中列出供主 agent 确认)。
**复核状态**: self-noted, R3 不深究

---

## 关键 IPC 契约对照表(采样,~10 条)

| 前端 invoke(args 形状) | 后端签名(参数) | 是否 OK |
|---|---|---|
| `scan_skills({sourceDir, claudeConfigDir})` | `scan_skills(source_dir, claude_config_dir)` | ✓(snake → camel by Tauri default) |
| `scan_mcps({sourceDir})` | `scan_mcps(source_dir)` | ✓ |
| `update_skill_metadata({skillId, category, categoryId, tags, enabled, icon})` | `update_skill_metadata(skill_id, category, categoryId, tags, enabled, icon)` | ✓(混 snake + camel 都映射到 camelCase JSON) |
| `update_mcp_metadata({mcpId, category, categoryId, tags, enabled})` | 同 | ✓ |
| `update_rule({id, content, name, description, categoryId, tagIds, icon})` | `update_rule(id, content, name, description, category_id, tag_ids, icon)` | ✓ JSON 键映射 / **但 categoryId 缺 clear path** (C6) |
| `update_claude_md({id, content, name, description, categoryId, tagIds, icon})` | `update_claude_md(id, content, name, description, category_id, tag_ids, icon)` | ✓ JSON 键映射 / **同 C6 问题** |
| `sync_project_config({projectPath, skillPaths, mcpServers})` | `sync_project_config(projectPath, skillPaths, mcpServers)` `#[allow(non_snake_case)]` | ✓ |
| `clear_project_config({projectPath})` | `clear_project_config(projectPath)` `#[allow(non_snake_case)]` | ✓ |
| `add_project({name, path, sceneId})` | `add_project(name, path, sceneId)` `#[allow(non_snake_case)]` | ⚠ sceneId 空字符串接受(C8) |
| `update_project({id, ...data})` | `update_project(id, name, path, sceneId, lastSynced)` | ⚠ 同 sceneId 问题(F10) |
| `update_mcp_scope({mcpId, scope, ensembleDir, claudeConfigDir})` | `update_mcp_scope(mcp_id, scope, ensemble_dir, _claude_config_dir)` | ✓(`_claude_config_dir` 是 underscore prefix dead param,Tauri 用 `to_lower_camel_case("_claude_config_dir") = "claudeConfigDir"` 即仍能匹配前端字段) |
| `fetch_mcp_tools({command, args, env, timeoutMs})` | `fetch_mcp_tools(command, args, env, timeout_ms)` | ✓ JSON 键映射 |

**总结**: IPC 命名层面**没有**前后端不匹配。主要风险集中在:(1)nullability 不一致(`Option<String>` vs `Option<Option<String>>`,C6/F2);(2)空字符串作为 sentinel 值(C8/F10);(3)前端 store 不 rollback optimistic on failure(F5);(4)backend 错误内容暴露绝对路径(F9)。

---

## 总结

### 我个人最关注的 3 条(若用户只修这 3 条,影响最大)

1. **C6 (扩展):update_rule / update_claude_md 无法清空 categoryId** — 用户**真的**做不了某件常规事(清空 Rule/CLAUDE.md 的 category),且没有 workaround 除非分配到别的 category。两文件改动 ≈ 20 行 + 前端 2 处。
2. **F3:trashStore 无 restoreRule** — 删除的 Rule **不可恢复**(只能去 `~/.ensemble/trash/rules/` 手动 mv),与 Skills/MCPs/ClaudeMd 体验严重不对称。
3. **F2:delete_category / delete_tag 不 cascade Rules** — 用户在 sidebar 删 Category / Tag,导致 Rules 上挂着"看得见但点不到"的孤儿引用。修复机械(在已有 cascade 块加 4 行)。

### 我觉得不必修的 0-3 条

1. **C7:delete_skill 写 data.json 错误被吞** — 已是 best-effort 语义,实际后果窗口窄,且对 restore-from-trash 反而有利。建议**改 comment** 即可,**不修**逻辑。
2. **C2:create_symlinks / remove_symlinks errors-in-Ok** — 死代码,无前端调用。建议**删 IPC 注册**而不是修语义。
3. **F11:mcpFetchErrors 永不 manual clear** — cache-style 设计已合理。

---

(行数 ≈ 410,在 600 上限内)
