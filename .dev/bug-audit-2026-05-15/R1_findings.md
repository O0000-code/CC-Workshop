# R1 — Data Integrity / Concurrency / Sync Deployment Findings

## 复核结果

按 02_known_risk_surfaces.md 中归 R1 角度的 candidate 顺序逐条复核。引用而非重复 candidate 描述。

---

### A1. clear_project_config 无差别删除 3 处 CLAUDE.md → **CONFIRMED P0**

- **置信度**: High
- **代码位置**: `src-tauri/src/commands/config.rs:162-179`
- **校正**: 严重度保持 P0,但要更精确:这条问题与 A8 重合(distributionPath 失效),其实就是同一 bug。Clear 写死三条删除路径。
- **用户可见 (User does X / sees Y / does NOT see Z)**:
  - User 在 Project root 下手写 `<project>/CLAUDE.md`(非 Ensemble managed),然后在 Ensemble 中对该 Project 点 "Clear Configuration"
  - User sees: 自己的 `CLAUDE.md` 消失
  - User does NOT see: 任何 warning / confirmation / undo
- **不可见后果**: 文件物理删除(不进 Ensemble trash,fs::remove_file 直接干掉),无可恢复路径
- **根因**: 三处 `if path.exists() { let _ = fs::remove_file(&path); }`,既不读 `settings.json::claudeMdDistributionPath`,也不 hash-compare 是否与 Ensemble-managed 任一 CLAUDE.md 内容一致。Rules 清理走的是"只删 managed filename 集合"的保守路径(line 189-219),但 CLAUDE.md 完全没这层防护。
- **建议修复**: 至少做一层 hash 对比 — 读 `data.json::claude_md_files` 中每个 `managed_path` 文件的内容,与 project 内 3 处文件内容做精确字节对比,只删与某个 managed 文件**完全一致**的。退一步:至少只删用户设置的 `claudeMdDistributionPath` 那一处。
- **修复保守度**: Medium — hash 对比的代价是每条 file IO(数量小,可控);改成读 distributionPath 的方案更轻但放弃了"用户切换过 distributionPath"的 cleanup 能力
- **复核状态**: self-confirmed

---

### A2. list_trashed_items 不读 trashed_scenes / trashed_projects → **CONFIRMED P1**

- **置信度**: High
- **代码位置**:
  - `src-tauri/src/commands/trash.rs:122-337`(list_trashed_items 只扫四个磁盘目录)
  - `src-tauri/src/commands/data.rs:1064`(delete_scene push 到 `data.trashed_scenes`)
  - `src-tauri/src/commands/data.rs:1168`(delete_project push 到 `data.trashed_projects`)
  - `src-tauri/src/lib.rs:179-183`(只注册 restore_skill/mcp/claude_md/rule,**没有** restore_scene/restore_project)
- **grep 验证**(用 `trashed_scenes|trashed_projects|restore_scene|restore_project`):全代码库只有上述写入路径和 default 初始化,**零读取路径**,零 frontend 引用。
- **用户可见**:
  - User does X: 在 Scenes 页删除一个 Scene(误删)
  - User sees Y(预期): 去 Settings → Trash Recovery 应能找到该 Scene 恢复
  - User sees Y(实际): Trash Recovery 界面只有 Skills / MCPs / CLAUDE.md / Rules 四个 tab,**没有 Scenes / Projects 区域**
  - User does NOT see: 任何途径找回被删 Scene
- **不可见后果**: `data.trashed_scenes` 与 `trashed_projects` 数组在 data.json 里永久增长,永不被消费。备份与碎片化都靠它累积。
- **建议修复**: 两选一
  - (A) 把 trashed_scenes / trashed_projects 表暴露到 trash UI:加 `list_trashed_scenes` / `list_trashed_projects` / `restore_scene` / `restore_project` IPC + 前端 Trash Tab
  - (B) 既然没人读,改为硬删除(retain),并废弃 TrashedScene / TrashedProject 类型 + clear 历史数据
- **个人倾向**: (A),因为 Scene / Project 误删后果重(Scene 含 30+ ids,Project 含 path/sceneId)。但若维护成本太高,(B) + 一次性 confirm dialog 也可接受。
- **修复保守度**: A 是 Medium(新 IPC + 新 UI);B 是 Safe(去掉冗余路径)
- **复核状态**: self-confirmed

---

### A3. restore_skill / restore_mcp 不恢复 metadata → **CONFIRMED P1**

- **置信度**: High
- **代码位置**:
  - `trash.rs:343-376`(restore_skill — 只 fs::rename,无 metadata 写回)
  - `trash.rs:382-415`(restore_mcp — 同样)
  - `marketplace.rs:526-548`(consume_skill_metadata_snapshot — 读 snapshot + 删 snapshot)
  - `marketplace.rs:2964`(finalize_skill_install 内 `let recovered = consume_skill_metadata_snapshot(&target_dir);` — 这才是 snapshot 被消费的路径)
- **两条 restore 路径对照**:
  - 路径 1 (marketplace 冲突 → RestoreFromTrash modal):用户在 marketplace 安装时遇到 trash 里有同名旧条目 → `install_skill_via_codeload` → 把 trash 目录 rename 到 live → `finalize_skill_install` → **consume_skill_metadata_snapshot** → 把 metadata 与新数据合并写回 data.json ✅ category/tags/icon 都保留
  - 路径 2 (Settings → Trash Recovery → Restore 按钮):用户在 trash UI 主动恢复 → `restore_skill` → 只 fs::rename → **不读 snapshot 文件**(snapshot 文件物理上还在 live 目录里,变成垃圾)→ 下次 `scan_skills` 跑时,skill 出现但 metadata 为空 ❌
- **用户可见**:
  - User does X: 在 Skill 列表给某个 Skill 设置 Category="AI"、Tags=["mcp","claude"]、Icon=🤖,然后删除它,再去 Trash Recovery 主动恢复
  - User sees Y(预期):恢复后 Skill 回到列表,带 Category="AI"、tag 仍在
  - User sees Y(实际):Skill 回到列表,Category 是空、tags 为空、icon 默认
  - User does NOT see: snapshot 文件 `_ensemble_metadata.json` 残留在 skill 目录内(可见但用户不会去看)
- **不可见后果**: snapshot 文件物理残留;data.json::skill_metadata 没有该条目;前端 scan_skills 走 fallback 路径生成默认值。
- **建议修复**: 复用 marketplace.rs 已有的 `consume_skill_metadata_snapshot` / `consume_mcp_metadata_snapshot` 函数 — 把它们改成 `pub(crate)`(已经是了)然后在 trash.rs::restore_skill / restore_mcp 里:
  1. fs::rename 到 live
  2. consume snapshot
  3. 在 DATA_MUTEX 保护下写回 data.json::skill_metadata / mcp_metadata
- **修复保守度**: Safe — snapshot 机制已经存在并被 marketplace 路径用过,复用即可。注意 restore_skill 当前**没有** DATA_MUTEX,需要加。
- **复核状态**: self-confirmed

---

### A4. delete_category / delete_tag 不 cascade Rules → **CONFIRMED, ADJUST 至 P1(原 P2)**

- **置信度**: High
- **代码位置**:
  - `data.rs:514-616` (delete_category):cascade 处理了 skill_metadata、mcp_metadata、claude_md_files,**没处理** rules
  - `data.rs:853-887` (delete_tag):cascade 处理了 skill_metadata.tags、mcp_metadata.tags、claude_md_files.tag_ids,**没处理** rules.tag_ids
- **grep 验证**(在 delete_category 函数体内 grep `rules`):零命中。在 delete_tag 函数体内:零命中。
- **严重度调整理由**: 02 列为 P2,但考虑到 Rule 的 `category_id` 是 String,删除 category 后变 dangling pointer;CategoryPage 通过 `category_id` 筛选 Rule,**该 Rule 在筛选中既不出现在原 category 也不出现在 Uncategorized**(取决于前端如何处理 dangling)。具体表现需 lead-agent 在 UI 确认,但风险表面足够大 → P1。
- **用户可见**:
  - User does X: 创建 Category "AI",把 Rule R1 分到该 Category;然后删除 Category "AI"
  - User sees Y(预期):R1 自动归到 Uncategorized(像 Skill/MCP 的 cascade 行为)
  - User sees Y(实际)**待 lead-agent verify**:R1 的 category_id 仍指向已删除 Category id。CategoryPage 走 `rules.filter(r => r.category_id === categoryId)`,R1 在该 page 不出现(category 已不存在);Uncategorized page 走 `rules.filter(r => !r.category_id || category 不在 active list)`,如果前端只检 `!r.category_id`,R1 也不出现。
  - User does NOT see: R1 出现在任何 sidebar Category 项下
- **不可见后果**: R1 处于"幽灵态" — data.json 有,UI 不出现,直到用户点详情面板手动改 category_id 才被发现。
- **建议修复**: 在 delete_category / delete_tag 中分别加:
  ```rust
  for rule in data.rules.iter_mut() {
      if rule.category_id.as_deref() == Some(&id) {
          rule.category_id = None;
      }
  }
  // 类似地 cascade tag_ids
  for rule in data.rules.iter_mut() {
      rule.tag_ids.retain(|t| t != &id);
  }
  ```
- **修复保守度**: Safe — 与既有 cascade 完全同构
- **复核状态**: self-confirmed(实际 UI 表现需 lead-agent verify),但**修复方向无歧义**

---

### A5. fs::rename 跨 filesystem 失败无 fallback → **CONFIRMED P2**

- **置信度**: High
- **代码位置**:
  - `skills.rs:371` `fs::rename(skill_path, &dest_path)` 无 fallback
  - `mcps.rs:542` `fs::rename(mcp_path, &dest_path)` 无 fallback
  - `trash.rs:372, 411, 452, 566` 同样无 fallback
  - 对比:`claude_md.rs:618-623` 有 fallback `fs::remove_dir_all`(但 fallback 是**永久删除**,不是 trash);`rules.rs:630-634` 类似
- **用户可见**:
  - User does X: 用户在 Settings 里把 `skillSourceDir` 设到外接磁盘(`/Volumes/Data/skills`),然后从 Skills page 删除一个 Skill
  - User sees Y(实际):红色 toast "Failed to move skill to trash: invalid cross-device link" 或类似 EXDEV 错误
  - User does NOT see: Skill 实际被删除(操作完全 abort);也不会 retry。
- **不可见后果**: delete operation 整个 abort,user 必须手动 mv 或者放弃删除。Skill 仍占用 sidebar count。
- **建议修复**: `fs::rename` 失败且 errno == EXDEV(`std::io::ErrorKind::CrossesDevices`,Rust 1.82+ 有)时,fallback 到 `fs::copy + fs::remove_file`(或 `copy_dir + remove_dir_all` 用于目录)。**注意 fallback 必须保证 atomicity**:copy 完成前不删除源。
- **修复保守度**: Medium — copy fallback 路径需要单独测试 EXDEV 路径(cargo test 可在 mock 中模拟,但实际跨 fs 需要外接磁盘手动验证)
- **复核状态**: self-confirmed

---

### A6. add_project 接受空 sceneId → **CONFIRMED P3**

- **置信度**: High
- **代码位置**:
  - `data.rs:1105` `scene_id: sceneId.unwrap_or_default()` — None 变 `""`
  - `src/stores/projectsStore.ts:152` `sceneId: newProject.sceneId || null` — UI 空串变 null
  - `src/pages/ProjectsPage.tsx:248` 创建按钮 disabled 仅看 `!newProject.name || !newProject.path`,**不要求 sceneId**
- **用户可见**:
  - User does X: New Project,只填 name + path,不选 Scene,点 Create
  - User sees Y:Project 创建成功,进入 detail panel,Scene dropdown 显示 "No scene selected"
  - User does NOT see: 任何阻断或 warning
- **不可见后果**: `project.scene_id = ""`(空串,不是 null)。后续:
  - syncProject 在 line 203 `scenes.find((s) => s.id === project.sceneId)` 返回 undefined → 设 error "Scene not found" 并 return(不抛错,只显示错误条) → User 可后续选 Scene 后重试。**Recoverable**。
  - data.json 的 `scene_id: ""` 也不是大问题,后续 set 即可。
- **建议修复**: 把 ProjectsPage 创建按钮 disabled 加上 `!newProject.sceneId`。或者后端 add_project 拒绝空 sceneId(更保守)。
- **CLAUDE.md 易错点之一说"project.sceneId 不会悬垂"** — 这个不变式被破了。建议至少加 UI 阻断。
- **修复保守度**: Safe (前端阻断);Medium (后端校验,影响 add IPC 契约)
- **复核状态**: self-confirmed

---

### A7. syncProject 四段串联无 atomicity / rollback → **CONFIRMED P1**

- **置信度**: High
- **代码位置**: `src/stores/projectsStore.ts:227-269`
- **用户可见**:
  - User does X: 对一个含 Skills + MCPs + CLAUDE.md + Rules 的 Scene sync 到一个新 Project,假设 distribute_scene_claude_md 步骤失败(例:目标盘满,或目标路径权限不足)
  - User sees Y(实际):红色 toast 显示 catch 的 error 字符串。状态:
    - `<project>/.claude/skills/*` 已建好 symlinks ✓
    - `<project>/.mcp.json` 已写成功 ✓
    - `<project>/.claude/CLAUDE.md` 不存在 ✗
    - `<project>/.claude/rules/*.md` 不存在 ✗
    - `project.lastSynced` 不更新(仍为旧值)
  - User does NOT see: 哪一步失败、是否需要再次 Clear + Sync、哪部分残留;UI 列表仍显示"未同步"。
- **不可见后果**: 项目处于"半同步"状态。用户可以点 Clear,Clear 会清除所有 4 类。但用户如果直接 retry Sync,前 2 步会被重复执行(因 sync_project_config 本身幂等:先 remove existing symlinks 再创建)。Race 不会爆炸但状态不透明。
- **建议修复**: 两选一
  - (A) 把 4 步合并到 1 个后端 IPC `sync_project_full(project_path, skills, mcps, claude_mds, rules)`,后端按"先准备临时目录 → 全部成功后 atomic swap"模式做。技术上复杂(symlink、多文件)。
  - (B) 在前端 catch 时记录哪些步成功、提示"前 N 步成功,第 N+1 步失败,请 Clear 后重试"。Lazy 但实用。
- **个人倾向**: (B)。Sync 本身是用户主动操作,粒度可见也行,但需要把"哪一步失败"告诉用户。
- **修复保守度**: B 是 Safe(纯前端);A 是 Risky
- **复核状态**: self-confirmed

---

### A8. clear_project_config 缺与 sync 的对称性 → **MERGED with A1**

- 与 A1 实质上是同一 bug — clear 不读 distributionPath 设置。当 sync 写 `.claude/CLAUDE.md` 时,clear 同时删 root `CLAUDE.md` 和 `CLAUDE.local.md` — 这部分恰好就是 A1 的核心 — "可能误删用户手写的 CLAUDE.md"。
- 修复策略合并到 A1。

---

### C4. read_app_data on fs error → 默认空 AppData → **CONFIRMED P2**

- **置信度**: High
- **代码位置**: `data.rs:243-252`
- **复核结果**:与 02 描述完全一致。read 错误 propagate;file missing 走 default。但 default 路径**也会触发**当 file 存在但权限拒绝时 — 等等,我需要 verify 这点。
- 实际看 code:`if data_path.exists() { let content = fs::read_to_string(...).map_err(|e| e.to_string())?; ... } else { Ok(AppData::default()) }`。**`exists()` 返回 false 时**走 default;**`fs::read_to_string` 失败时**(权限/IO)用 `?` propagate。所以 02 描述"fs::read 错误也走 default 路径"是**错的**。
- **校正**: 02 描述有误。fs::read 错误**会** propagate Err 到调用方。但调用方多数是 `read_app_data().unwrap_or_default()`(skills.rs:328、mcps.rs:268、claude_md.rs:107 等),那些位置才是真正的"silent fallback to empty"。
- **真正的 P2 风险面**: scan_skills/scan_mcps/scan_claude_md_files 在启动时调 `load_skill_metadata` / `load_mcp_metadata` / `read_app_data().unwrap_or_default()`,如果磁盘瞬时 IO 错误,会走 default → UI 显示所有 skills/mcps **without categories/tags**(metadata 全空)。用户以为 Category 设置丢了。
- **用户可见**:
  - User does X: 磁盘瞬时压力(Time Machine 备份中、Spotlight 重建索引等)时打开 Ensemble
  - User sees Y: Skills 列表有 skill 但 category 全空(从 SKILL.md frontmatter 推断的)、tags 空、icon 默认
  - User does NOT see: 任何 error 提示
- **建议修复**: 把 load_skill_metadata / load_mcp_metadata 的 fallback 从 silent-empty 改成 propagate Err。scan_skills 等命令可以接受这条错误后**部分显示**(已 scan 到的 skill)+ warning。
- **修复保守度**: Medium — 改 fallback 行为后,所有 caller 需要适配 Result。
- **复核状态**: self-confirmed,但 02 描述需校正

---

### C7. delete_skill / delete_mcp 写 data.json 错误被吞 → **CONFIRMED P3**

- **置信度**: High
- **代码位置**: `skills.rs:384` `let _ = write_app_data(app_data);`;`mcps.rs:572` 同。
- **复核**: comment 明确说"trash move 已成功,这里只是 metadata 清理"是务实选择。但确实有副作用:
  - User does X: 删 Skill,trash move 成功,但 metadata 写回 data.json 在写时磁盘满
  - User sees Y: Toast "Success" — 但**下一次启动**(重新 scan)会看到该 skill 在 trash 而 data.json 里仍有它的 metadata。`scan_skills` 不再能 enum 出该 skill(实际目录不在 source_dir),所以 metadata 是 orphan。data.json 里多了一条无主条目,Categories sidebar 的 count 偏高 1。
  - 但下次启动重新 scan + 一次 update 任何 skill 会触发 write_app_data 覆盖,**自愈**。
- **不可见后果**: 短暂 count 偏差。**不是 P0/P1**。02 描述是准确的。
- **建议修复**: 不修。已有 comment 解释设计。但可以加 telemetry / log 落到 stderr 警告(目前一字不报)。
- **复核状态**: self-confirmed,P3 保持

---

## 新发现

按 P0 → P1 → P2 → P3 排序。

---

### F1. write_mcp_config 在空 MCP 列表时静默删除 .mcp.json — 用户手写的也会被删

- **置信度**: High
- **严重度**: P0
- **代码位置**: `src-tauri/src/commands/config.rs:15-20`
- **触发条件 (User does X)**:
  - 用户在 Project root 下手写 `<project>/.mcp.json`(非 Ensemble managed)
  - 然后在 Ensemble 中对该 Project 选择一个 **没有 MCP** 的 Scene,然后点 Sync
- **用户可见后果 (User sees Y)**: 用户手写的 `.mcp.json` 消失。无 warning,无 confirmation,无 trash 备份(直接 `fs::remove_file`,不是 trash)
- **不可见后果**: 文件物理删除,Claude Code 在该 project 下读不到 MCP 配置;.mcp.json 不在 Ensemble trash 里所以无法恢复
- **根因**:
  ```rust
  if mcp_servers.is_empty() {
      if mcp_path.exists() {
          fs::remove_file(&mcp_path).map_err(|e| e.to_string())?;
      }
      return Ok(());
  }
  ```
  与 distribute_claude_md 的设计完全不一致 — distribute_claude_md 不会"如果 ids 为空就删除目标文件",但 write_mcp_config 会。这破坏了"用户可以混用 Ensemble-managed 与 hand-written 配置"的预期。同时这是与 A1 同源的问题:Ensemble 假定整个文件属于自己,忽略文件来源。
- **建议修复**: 三选一
  - (A) 删除前 hash-compare:读取 `.mcp.json` 内容,只有当 mcpServers 与 data.json 中某些 mcp_metadata 完全 match 时才删除;否则保留并 warning
  - (B) 不删除,只把 Ensemble managed 部分从文件中**移除**:读 `.mcp.json` → 解析 → 只删 mcp_servers HashMap 里属于 data.json::mcp_metadata 的 key → 写回(或当 HashMap 空时再删)
  - (C) Sync 操作要求至少有一个 MCP(空 Scene 时 syncProject 跳过 write_mcp_config) — 最保守但治标不治本(Clear 走另一条路径,见 A1 同源)
- **个人倾向**: (B),与 Rules 清理逻辑(config.rs:189-219)的"只删 managed filenames"思路一致
- **修复保守度**: Medium(B 方案)/ Safe(A 方案)
- **复核状态**: self-confirmed

---

### F2. config.rs 直接读 data.json bypass DATA_MUTEX(在 clear_project_config rule 清理路径)

- **置信度**: High
- **严重度**: P2
- **代码位置**: `src-tauri/src/commands/config.rs:193-218`
- **触发条件 (User does X)**: 用户对 Project A 点 Clear 的**同时**,在另一个窗口或在快速点击中触发 import_rule / update_rule / delete_rule(任何会 write_app_data 的操作)
- **用户可见后果 (User sees Y)**: 大概率没事 — 但**罕见情况下**:
  - clear_project_config 在 fs::read_to_string 时读到了 fs::write 半写状态(`fs::write` 不是原子的,做 open(O_TRUNC) + write + close)→ `serde_json::from_str::<Value>` 解析失败
  - 解析失败走 silent skip(line 196 `if let Ok(value)`),Rules 清理整段不执行
  - User 看到 `<project>/.claude/rules/*.md` 残留,虽然 .mcp.json + 3 处 CLAUDE.md 已经删
- **不可见后果**: Rule 文件残留在 project 内。下次 Clear 重跑会成功,但本次"半 cleared 状态"用户察觉不到。
- **根因**: clear_project_config 既不 lock DATA_MUTEX,也不走 `read_app_data` 这条规范化通道,而是直接 `fs::read_to_string(.../data.json)` + 临时 `Value` 解析。违反 `grep-before-enumerate-shared-resource.md` Rule(直接 fs 操作绕开 canonical helper)。
- **建议修复**: 改用 `read_app_data()` 获取 AppData,锁住 DATA_MUTEX 直到 Rules 清理完成。
  ```rust
  let _guard = crate::commands::data::DATA_MUTEX.lock().map_err(|e| e.to_string())?;
  let app_data = crate::commands::data::read_app_data()?;
  let managed_filenames: HashSet<&String> = app_data.rules.iter()
      .map(|r| &r.filename).collect();
  // ... 用 managed_filenames 删
  ```
  注意:必须放在 clear_project_config 的最末段,且只锁这一小段(不要从函数开头就锁,clear 的前半部分都是 IO 不涉及 data.json)。
- **修复保守度**: Medium — DATA_MUTEX 用法变化轻微但需要审查 deadlock 风险(clear_project_config 当前不调用任何会再次取 DATA_MUTEX 的函数,所以安全)
- **复核状态**: self-confirmed

---

### F3. delete_skill / delete_mcp 不 cascade Scene.skill_ids / mcp_ids — Scene 显示腐烂 count

- **置信度**: High
- **严重度**: P2
- **代码位置**:
  - `skills.rs:336-388` (delete_skill 函数体内)零 Scene 引用 cascade
  - `mcps.rs:507-576` 同样
  - 对比:`claude_md.rs:593-594` 和 `rules.rs:604-606` 都做了 cascade
- **触发条件 (User does X)**:
  - 创建 Scene "Coding Boost",加入 Skill "code-reviewer"
  - 在 Skills 页面删除 "code-reviewer"
  - 回到 Scenes 页查看 "Coding Boost"
- **用户可见后果 (User sees Y)**:
  - SceneCard 上 "X Skills" 的 count 仍包括已删除的 skill_id
  - 进 SceneDetail / SceneEditor,scene.skillIds 仍含 dangling id,前端 `.find(s => s.id === skillId)` 返回 undefined,filter 后空气化(但 count 不变,因为 count 取 ids.length)
  - Sync 该 Scene 到一个 Project — sync 跑 OK(`sync_project_config` 接收的 skillPaths 列表已被前端 filter 掉了),但 user 看到 Project 部署的 skills 比 Scene 显示的少
- **User does NOT see**: 哪个 skill_id 是孤儿;Scene 的"X items"与"实际部署"不一致的原因
- **不可见后果**: data.json::scenes[*].skill_ids 长期积累孤儿 id。每次 import 新 skill 都得过滤孤儿,但他们永远在那。
- **根因**: CLAUDE.md 易错点 #1 明确说"删除 Skill / MCP / CLAUDE.md / Rule 时**不**级联清理 Scene 的 `*Ids`,sync 时通过 `find(...)` 过滤,找不到的 id 默默跳过"。但**实际**:claude_md.rs 和 rules.rs 都做了 cascade(593, 604),只有 skills.rs / mcps.rs 没做。这是设计与实现的不一致:要么全做,要么全不做。
- **建议修复**: 给 delete_skill / delete_mcp 加 cascade,与 claude_md.rs:593-594 同构。这也让 CLAUDE.md 易错点 #1 的描述不再 misleading(它当前描述的"全不级联"实际是部分级联)。
- **修复保守度**: Safe — 与既有 cascade 完全对称
- **复核状态**: self-confirmed

---

### F4. clear_project_config 错误处理不一致 — skill symlinks 失败会 propagate 但 CLAUDE.md / .mcp.json 失败被 swallow

- **置信度**: High
- **严重度**: P2
- **代码位置**: `config.rs:131-138`(skill symlinks 用 `?`) vs `config.rs:147-179`(settings.local.json 整段 silent,CLAUDE.md 三处 `let _ = fs::remove_file`)
- **触发条件 (User does X)**: 对 Project root 设了"只读"权限的某个文件(例:`.claude/CLAUDE.md` 不可写),然后点 Clear
- **用户可见后果 (User sees Y)**:
  - 如果 fs::remove_file 在第一个 skill symlink 上失败 → `?` 抛错 → 红色 toast "Failed to ..."
  - 如果 fs::remove_file 在 CLAUDE.md / .mcp.json / settings.local.json 上失败 → `let _ = ...` 静默 → toast 报"Success"但文件残留
- **User does NOT see**: 部分残留 — UI 显示 lastSynced 已 clear,但实际项目内还有 Ensemble 写的 CLAUDE.md / .mcp.json
- **不可见后果**: 文件残留,但下次 Clear 再 retry 时如果权限修复,会清掉。
- **根因**: 错误处理风格不一致 — 同一函数内既有 `?` 又有 `let _ = ...`。设计意图不清。
- **建议修复**: 统一为收集 errors Vec 并返回为 `Result<Vec<String>, _>` 或 `Result<ClearProjectResult, _>`(部分失败时返回 Ok 但 result.errors 有内容,前端按需展示)。
- **修复保守度**: Medium — 返回类型变化影响前端契约
- **复核状态**: self-confirmed

---

### F5. distribute_scene_rules / distribute_scene_claude_md 单条失败不中断,但 syncProject 不读 result.errors

- **置信度**: High
- **严重度**: P2
- **代码位置**:
  - `claude_md.rs:912-922` distribute_scene_claude_md 内 catch 单条失败,push 到 results
  - `rules.rs:878-888` 同样
  - `src/stores/projectsStore.ts:237-255` syncProject 调用这两个 batch 但**不检查** results 里是否有 `success: false` 条目
- **触发条件 (User does X)**: Scene 里有 3 个 Rules,其中 R2 因为某种原因 distribute_rule 抛错(比如 R2 的 filename 与 project 下 .claude/rules/ 里某个 read-only 文件冲突,conflict_resolution="backup" 但 backup 失败)
- **用户可见后果 (User sees Y)**:
  - safeInvoke('distribute_scene_rules') 返回 Vec<RuleDistributionResult>,**整体 Ok**(因为 distribute_scene_rules 函数总是返回 Ok(results))
  - 前端不读 results 数组,直接进入下一步 update_project lastSynced
  - User 看到 Sync 成功,但 R2 没有被部署到项目里
- **User does NOT see**: 哪条 Rule 失败、Project 里 Rules 不完整
- **不可见后果**: Project 的 `.claude/rules/` 缺一条 Rule,Claude Code 实际加载的 Rules 与 Scene 配置不一致
- **根因**: backend 设计是"batch 不 throw,在 result 里报 per-item error"(合理),但前端没消费这个语义,假定 Ok = 全成功。
- **建议修复**: projectsStore.syncProject 在调用后加:
  ```ts
  const claudeMdResults = await safeInvoke<...>('distribute_scene_claude_md', ...);
  const claudeMdErrors = claudeMdResults?.filter(r => !r.success) ?? [];
  if (claudeMdErrors.length > 0) {
    throw new Error(`Failed to distribute ${claudeMdErrors.length} CLAUDE.md file(s): ${claudeMdErrors.map(e => e.error).join(', ')}`);
  }
  // 同样处理 ruleResults
  ```
- **修复保守度**: Safe — 纯前端逻辑
- **复核状态**: self-confirmed

---

### F6. write_mcp_config 当 mcp_path 在 read-only dir 时,sync 写入失败 abort,但 sync_project_config 已建好 skills/

- **置信度**: Medium(具体场景需 lead-agent verify)
- **严重度**: P2
- **代码位置**: `config.rs:69-72` `fs::write(&mcp_path, json)?` + 调用方 `config.rs:115` `write_mcp_config(projectPath, mcpServers)?`
- **触发条件 (User does X)**: project 路径在 read-only mount(如 SMB 临时挂载)上,但 .claude/ 子目录因为某些 ACL 可写
- **用户可见后果 (User sees Y)**: sync_project_config 内 skills 部分成功创建,write_mcp_config 失败,red toast。状态:`.claude/skills/` 已建,`.mcp.json` 未写。
- **不可见后果**: 半同步状态。但用户大概率会知道是 IO 错误(toast 内容)。
- **建议修复**: 与 A7 重合 — 都靠 transactional sync 或者前端 step-by-step 报告解决。本条本身不需要独立 fix。
- **修复保守度**: 同 A7
- **复核状态**: self-confirmed,但 needs lead-agent verify 实际 mount 行为

---

### F7. set_global_rule 优先级歧义可能误判 — auto-import 跳过 → 用户原 ~/.claude/rules/<filename>.md 被覆盖

- **置信度**: Medium
- **严重度**: P1
- **代码位置**: `rules.rs:691-693`
  ```rust
  let is_already_managed = app_data.rules.iter().any(|r|
      r.source_path == path_str || r.filename == target_rule.filename && r.is_global);
  ```
  Rust 优先级:`&&` > `||` → `r.source_path == path_str || (r.filename == target_rule.filename && r.is_global)`
- **复核**: 02 描述这是 B5 在 R2 角度,但我注意这条 bug 直接影响数据保护(auto-import 是用户 ~/.claude/rules/<filename>.md 内容备份的最后防线),所以归 R1。
- **触发条件 (User does X)**:
  - User 之前在 ~/.claude/rules/foo.md 手写了内容
  - User 在 Ensemble 中创建一个 filename="foo.md" 的 Rule(不同 source_path,例如 import from /tmp/foo.md)
  - User 在 Ensemble 中点该 Rule 的 "Set Global"
- **用户可见后果 (User sees Y)**:
  - is_already_managed 计算:`r.source_path == path_str`(false,source_path 不同) `|| (r.filename == target_rule.filename && r.is_global)`(filename 匹配但 r.is_global 还是 **false**,因为这是第一次 set_global) → false
  - 所以走 auto-import 分支 — **这次安全**
- **但反向场景**:
  - User 第一次 set_global Rule X(filename=foo.md)成功;User 后来手动改了 ~/.claude/rules/foo.md;User 在 Ensemble 中创建另一个 Rule Y(filename=foo.md),点 Set Global
  - is_already_managed 评估:`r=X (is_global=true, filename=foo.md, source_path=/some/X/path)` → `source_path` 不匹配 user 手改后的 ~/.claude/rules/foo.md path → **左半假;右半:filename 匹配 && is_global=true → 右半真** → `is_already_managed = true` → 不 auto-import
  - User 手改的 ~/.claude/rules/foo.md(可能与 X 完全不同的内容)被 Y 覆盖,无 backup
- **User does NOT see**: 自己手改的内容
- **根因**: 优先级歧义 + 短路求值。意图大概是 `(source_path == path_str || r.filename == target_rule.filename) && r.is_global`,但写法是 `source_path == path_str || (filename match && is_global)`。
- **建议修复**: 加括号,明确意图。但 intent 本身需要 lead-agent 决断 — 是
  - (A) "如果该 filename 已 global 过任何一次,跳过 auto-import"(当前实际行为,可能丢数据)
  - (B) "只有当前 path 的内容确实是某条 managed rule 写过的,才跳过 auto-import"(更严格,需要 hash 对比)
- **修复保守度**: Risky — 需要 lead-agent 确认 intent
- **复核状态**: needs lead-agent verify(intent + 优先级双重歧义)

---

### F8. restore_rule 不 reset is_global 时若 trash 里 info.json 损坏,fallback 路径无 source_path 校验

- **置信度**: Medium
- **严重度**: P3
- **代码位置**: `trash.rs:601-650`(restore_rule 的 fallback 分支)
- **触发条件 (User does X)**: trash 里的 rule 目录的 info.json 损坏(serde_json 解析失败)
- **用户可见后果 (User sees Y)**: 走 fallback 路径,从 .md 文件名推断,创建一个新的 Rule 行,name="Restored <X>"、source_path=""、is_global=false ✓(已经强制 false,line 639)
- **本条复核**: restore_rule 已经做对了 is_global=false 强制 reset(line 590 + 639)。问题不大。
- **小问题**: fallback 时 inferred_filename 可能是 `<id>.md`,目录里的真正 .md 名可能与之不同 — 但 line 615 已经做了从目录里取第一个 .md 的处理,fallback 安全。
- **建议修复**: 不修。current 已足够防御。
- **复核状态**: self-confirmed

---

### F9. apply_reorder 算法正确,**已 verify** — 但 update_category(parentId) 三态边界需 verify

- **置信度**: High
- **严重度**: N/A (verify-only)
- **代码位置**: `data.rs:54-89` apply_reorder
- **Verify**: 实测 apply_reorder 测试覆盖完整(line 1201-1257 共 7 个测试,覆盖 basic / empty / partial / unknown / duplicate / preserves-order / Tag 泛型),HashMap 迭代不变性已修(line 51-58 comment + impl)。reorder_categories / reorder_tags 行号正确取 DATA_MUTEX。**这条 explore 报告说"OK"**,我同意。
- **但 update_category 三态**:
  - `parentId: Option<Option<String>>`(line 462)
  - 外层 `Some(None)` 清空 parent;`Some(Some(id))` 设 parent;`None` 不动
  - 测试覆盖在 line 1954, 1974, 2000 三个测试 ✓
- **Verify 结果**: 当前实现正确。无 finding。
- **复核状态**: self-confirmed

---

### F10. delete_scene 不清理 Project.sceneId 引用 — 借由 ScenesPage UI 防御,但 ScenesPage 调用 deleteScene 后 frontend project list 不同步

- **置信度**: Medium
- **严重度**: P3
- **代码位置**:
  - `data.rs:1041-1083` delete_scene 内零 Project cascade
  - `src/pages/ScenesPage.tsx:368` UI 防御 `projectsUsingScene.length > 0` 时 alert + 阻止删除
- **触发条件 (User does X)**: 通过非 ScenesPage 的途径(future code、绕路 IPC、bug)调用 `delete_scene`,绕过 UI 防御
- **用户可见后果 (User sees Y)**: 当前没有这样的途径,所以**实际 User does NOT see 任何**异常
- **不可见后果**: data.json 中 project.scene_id 变 dangling。syncProject 时 `scenes.find(...)` 返回 undefined → "Scene not found" error。
- **建议修复**: 不修,但加一行注释/test 提醒"future code 不能绕过 ScenesPage 防御"。或者在 delete_scene 后端也加 cascade(把 affected projects 的 scene_id 设为某种 sentinel)— 但当前 UI 防御已经够强。
- **修复保守度**: Safe(加注释);Medium(后端加 cascade,影响 IPC 契约)
- **复核状态**: self-confirmed

---

## 总结

### 最关注的 3 条(若用户只修这 3 条,影响最大)

1. **F1 (P0): write_mcp_config 静默删用户手写 `.mcp.json`** — 与 A1 同源(Ensemble 假设整个文件是自己的)。两者一起修:用 hash-compare 或 "只删 managed key" 策略。**这是数据丢失,优先级最高。**

2. **A2 (P1): trashed_scenes / trashed_projects 永远不被读取** — 用户误删 Scene 后**完全没有恢复路径**,而 delete_scene 又是常见操作。Scene 含 30+ ids 引用,误删后重建成本极高。

3. **A3 (P1): trash UI restore_skill/mcp 丢 metadata** — 用户从 Trash Recovery 主动恢复(这是 Trash Recovery 的存在意义)反而比 marketplace 冲突路径功能弱。snapshot 机制已经存在,只是 restore_skill / restore_mcp 没用。修复 ≤ 30 行代码。

### 我觉得不必修的 0-3 条

1. **A6 (P3): add_project 空 sceneId** — 可恢复,前端阻断即可,backend 改契约风险大于收益。最多加 UI 阻断。

2. **C7 (P3): delete_skill / delete_mcp data.json 写错误被吞** — comment 已解释,有自愈路径,不修。最多加 eprintln 日志。

3. **F10 (P3): delete_scene 不 cascade Project** — 当前 UI 防御充分,后端 cascade 反而引入 sentinel 值复杂度,不修。

### 总体观察

- 这次审查发现的 **P0 / P1 集中在数据保护边界**:Ensemble 编排 Claude Code 配置时,默认假定所有相关路径属于自己,**忽略用户在同一目录手写的内容**。这是一个**类别 bug**(A1 / F1 / 同源)而不是孤立 bug,修复时建议统一原则:"先 hash-compare,不 match 不删"或"只删 data.json::xxx_metadata.contains() 里的 key"。
- **Trash 系统是一致性最薄弱的子系统**:list_trashed_items 漏 Scene/Project (A2);restore_skill/mcp 不消费 snapshot (A3);各 restore 路径取 DATA_MUTEX 不一致(restore_claude_md 取,restore_skill 不取);各 delete 写 metadata 时错误处理不一致(claude_md.rs 报错,skills.rs/mcps.rs 吞错)。建议把 trash 子系统作为整块审视。
- **DATA_MUTEX 覆盖在 config.rs 有空缺**(F2):违反 `grep-before-enumerate-shared-resource.md`。修复轻,加进既有 lock 边界即可。
