# R2 — 安装 / 三种来源 / Restore 一致性 Findings

**Reviewer**: R2 (Opus)
**Scope**: marketplace / import / plugins / trash / scope / install_source / restore consistency
**Audited at**: 2026-05-15

---

## 关键参考图(回顾我的 scope)

### 三种 install 来源(skill / mcp 共有)

| Source | 落盘形式 | metadata 来源 | install_source 推导优先级 |
|---|---|---|---|
| `local` | 真实目录 / JSON | data.json 用户填或为空 | `metadata.install_source == "local"` 或 fallback 探测 symlink → 非 plugin → "local" |
| `plugin` | symlink 指向 `~/.claude/plugins/cache/<mp>/<name>/<ver>/...` | `import_plugin_*` 写入 | metadata 无值时 fallback,fs::read_link 命中 plugin 路径模式 |
| `marketplace` | 真实目录 / JSON(从 codeload 解压) | `finalize_*_install` 写入 marketplace_source | **必须**靠 `metadata.install_source == "marketplace"`,fs 看不出来 |

### 五条 restore 路径

| Path | 入口 | metadata 恢复? | 备注 |
|---|---|---|---|
| 1. marketplace install + Replace conflict | `install_marketplace_skill(conflict_action=Replace)` | 旧的进 trash 带 snapshot;新装从 marketplace fresh,**不恢复**(intentional)| comment line 2864 |
| 2. marketplace install + RestoreFromTrash | `install_marketplace_skill(conflict_action=RestoreFromTrash{trash_path})` | ✓ 恢复(`finalize_skill_install` 读 snapshot)| 含 metadata + tags + icon + usage |
| 3. UI Trash Recovery → restore_skill | TrashRecoveryModal → `trash.rs::restore_skill` | **✗ 不恢复**(A3)| 只 fs::rename,不读 snapshot,snapshot 残留 |
| 4. UI Trash Recovery → restore_claude_md | TrashRecoveryModal → `trash.rs::restore_claude_md` | ✓ 恢复(读 info.json)| 但 is_global 永远 reset 为 false |
| 5. UI Trash Recovery → restore_rule | TrashRecoveryModal → `trash.rs::restore_rule` | ✓ 恢复(读 info.json)| is_global 永远 reset 为 false |

**关键不对称**:Skill/MCP 走两条 restore 路径,行为不一致。Path 2 完整,Path 3 残缺。CLAUDE.md / Rule 没有"Path 2",所以 TrashRecoveryModal 是唯一路径,反而恢复得很完整。

---

## 复核结果

### B1. `scan_skills` 硬编码 scope="user" → **REFUTE(已修)**

- **代码现状**: `skills.rs:75-82` 实现了 `derive_skill_scope`,根据 `<claude_config_dir>/skills/<name>` 是否存在返回 "global" / "project"。`scan_skills` 在 line 50 调用 `parse_skill_file(...&claude_skills_dir)`,line 288-291 写 `scope: derive_skill_scope(...)`
- **前端**: `ScopeSelector.tsx:65` 已经做了 `normalizedValue: Scope = value === 'global' ? 'global' : 'project'`,comment 明确说"硬编码 'user' + UI hack 已移除"
- **跨层一致**: backend "global" / "project" ↔ frontend `Scope = 'global' | 'project'`,一致
- **结论**: 02_known_risk_surfaces.md B1 描述已过时;该 candidate 引用的源码状态在某次 commit 后已被替换。无需任何修复。
- **复核状态**: self-confirmed

### B2. `claude_md.rs::is_excluded_dir` 排除所有 `.starts_with('.')` 目录 → **CONFIRM ★P0**

### F1. 用户的 `<project>/.claude/CLAUDE.md` 在 Scan 列表中永远不出现

- **置信度**: High
- **严重度**: P0(功能不可用 + 与 sync 路径默认值矛盾)
- **代码位置**:
  - `claude_md.rs:297-304` is_excluded_dir 用 `name.starts_with('.')`(包含 `.claude`)
  - `claude_md.rs:402-417` infer_claude_md_type 明确说"`.claude/CLAUDE.md` 是 Project 类型"
  - `rules.rs:345-353` is_excluded_dir 写 `name.starts_with('.') && name != ".claude"` —— **明确 except `.claude`**
- **触发条件**: 用户打开 Scan CLAUDE.md 弹窗,指定项目目录扫描
- **用户可见后果**: 用户在 SkillsPage → "Scan CLAUDE.md" → 选项目根 → 列表里有 `<project>/CLAUDE.md` 和 `<project>/CLAUDE.local.md`,但**没有** `<project>/.claude/CLAUDE.md`。用户找不到要 import 的那个 `.claude/CLAUDE.md`
- **不可见后果**: 项目实际依赖的 `.claude/CLAUDE.md`(Claude Code 实际加载的默认路径)无法被 Ensemble 管理;sync 时 Ensemble 反而会写到 `.claude/CLAUDE.md`(distributionPath 默认)——一处不能读、一处会写,完全不对称
- **根因**: claude_md.rs 与 rules.rs 的 is_excluded_dir 出现了过滤口径分歧;rules.rs 已为 `.claude` 开口子,claude_md.rs 没有
- **建议修复**: 把 claude_md.rs:302 的 closure 改为与 rules.rs 一致:
  ```rust
  .map(|name| EXCLUDED_DIRS.contains(&name) || (name.starts_with('.') && name != ".claude"))
  ```
- **修复保守度**: Safe(rules.rs 已经这么用一段时间了,行为已知)
- **复核状态**: self-confirmed

### B3. `detect_plugin_mcps::is_imported` 误判同名本地 MCP → **CONFIRM ★P2**

### F2. plugin 列表把本地同名 MCP 当成"已导入"

- **置信度**: High
- **严重度**: P2(UX 错误,不阻塞主流程)
- **代码位置**: `plugins.rs:660-663`
  ```rust
  let is_imported = imported_set.contains(&import_key)
      || existing_mcp_names.contains(&mcp_name);
  ```
- **触发条件**: 用户有 `~/.ensemble/mcps/playwright.json`(自己创建),plugin marketplace 也有 `playwright` MCP
- **用户可见后果**: ImportMcpModal "Plugin MCPs" tab 显示 `playwright` 行 opacity-50 + 灰 checkbox + 不可点(`ImportMcpModal.tsx:496-512`),用户找不到原因为何不能 import
- **不可见后果**: pluginsStore.importedPluginMcps 中并没有对应的 `pluginId|playwright` key,但 UI 永远显示已导入。用户重命名本地 playwright.json 或删除本地后,UI 会突然能 import
- **根因**: `existing_mcp_names` 来自 fs::read_dir(mcps_dir),不区分 source。**Skills 一侧没有这个 bug**(plugins.rs:512 `is_imported = imported_set.contains(&import_key)`,只看 plugin tracking)
- **建议修复**: 移除 `|| existing_mcp_names.contains(...)` 短路,只保留 `imported_set.contains(&import_key)`,与 skills 对称。代价:若用户曾经手动 import 过 plugin MCP 但 `imported_set` 丢失,可能重复 import → 但 plugins.rs:824-829 的 `dest_mcp_path.exists()` 早就阻挡了实际写入,只是 UI 让用户尝试
- **修复保守度**: Safe(skills 已用同样逻辑无副作用)
- **复核状态**: self-confirmed

### B4. `import_plugin_skills` symlink vs `import_plugin_mcps` copy 不一致 → **CONFIRM ★P2**

- **代码现状**: skills.rs symlink(`plugins.rs:735-741`)/ mcps copy 后写独立 JSON(`plugins.rs:830-869`)
- **结论**: confirmed,严重度合理。这是 schema 限制(MCP 是 JSON 配置,symlink 形式不可行;plugin 的 `.mcp.json` 含多个 entry,Ensemble 单文件模型只能拷其中一个 entry)
- **结论**: confirmed P2;无须新写一条 finding。**建议不修**——这是结构性差异,fix 需要重写 plugin .mcp.json 的解构模型。**Trade-off**: 接受"plugin 升级后 MCP 配置过期,用户重新 import";在 detail panel 可加"refresh from plugin"按钮
- **复核状态**: self-confirmed,不写新 finding

### B5. `set_global_rule::is_already_managed` 运算符优先级 → **CONFIRM ★P3,但场景比 candidate 描述的更安全**

### F3. `set_global_rule` 运算符优先级分析(细化)

- **置信度**: High
- **严重度**: P3(可观察到但无害)
- **代码位置**: `rules.rs:693`
- **精确推演**: `r.source_path == path_str || r.filename == target_rule.filename && r.is_global` 因 `&&` > `||`,等价于:
  `r.source_path == path_str || (r.filename == target_rule.filename && r.is_global)`
- **场景 (a)**: 用户之前 import 了 `~/.claude/rules/foo.md`,但**没有** set_global → 这条 rule 在 data.json 中 source_path=`<some-import-path-or-empty>`,filename=`foo.md`,is_global=`false`。现在用户对**另一条**(本来在 Ensemble 内的)同名 filename Rule 调 set_global:
  - is_already_managed 检查 path_str = `~/.claude/rules/foo.md`
  - 第一个 disjunct 看是否有任何 rule 的 source_path 完全等于该 path(已 import 的那条会命中)
  - 命中 ⇒ is_already_managed=true ⇒ 跳过 auto-import 备份
  - 然后 line 749 直接覆盖 `~/.claude/rules/foo.md`
  - **用户原 import 的那一份在 Ensemble 里仍然存在(数据未丢)**,只是 `~/.claude/rules/foo.md` 被新 Rule 覆盖。这其实是 by design(用户的旧 import 拷贝在 Ensemble 内)
- **场景 (b)**: 用户从未 import,只是 `~/.claude/rules/foo.md` 本来就存在 → is_already_managed=false ⇒ 走 auto-import 备份分支 ⇒ 正确
- **场景 (c)**: 用户之前对另一条同名 filename 的 Rule set_global 过(filename 撞了)→ 第二个 disjunct 命中 ⇒ 跳过 auto-import → 用户原文件**已被前一次 set_global 替换过**,is_global=true 在 data.json 里,这次再 set_global 覆盖同一文件,无需再备份。**也是 by design**
- **结论**: 运算符优先级在所有场景中都给出了**用户预期**的行为。candidate 描述的"覆盖用户原内容"问题不会发生——因为第二个 disjunct 要求 `is_global=true`,这意味着 Ensemble 已经备份过原文件。
- **建议修复**: 不必。但代码可读性建议加括号:`r.source_path == path_str || (r.filename == target_rule.filename && r.is_global)` —— 这样未来 reviewer 读起来不需要推演优先级
- **复核状态**: self-confirmed,降级为 P3 code-clarity

### B6. `install_marketplace_mcp` 空 url 写到 .mcp.json → **CONFIRM ★P1(原 P2 升级)**

### F4. HTTP MCP 缺 url_variables 默认值时 .mcp.json 写空字符串

- **置信度**: High
- **严重度**: **P1**(主流程失败,无错误提示)
- **代码位置**:
  - `marketplace.rs:3149-3155` HTTP 配置缺省 url = String::new()
  - `marketplace.rs:3147-3191` 不验证 final_url 非空
  - `marketplace.rs:2430-2459` update_mcp_http_config 也不验证
  - `config.rs:23-31` sync 写 `"url": mcp.url.as_deref().unwrap_or("")` 进 `.mcp.json`
- **触发条件**: 用户从 marketplace install 一个 HTTP MCP,该 MCP 的 url 含 `{VAR}` 占位但用户没填 url_variables(或填了但没填关键的某个)
- **用户可见后果**: install 成功 toast → Ensemble 显示 MCP 在列表 → sync 到 project → Claude Code 启动尝试连接空 URL → stderr 报错 → 用户看不到。或者用户填了部分变量但漏了一个,`final_url` 含未替换的 `{XYZ}` 文本,Claude Code 把字面字符串当 URL
- **不可见后果**: `.mcp.json` 含损坏的 MCP entry,文件结构有效但语义损坏。Claude Code 加载这个 MCP 会失败,而 Ensemble UI 显示一切正常
- **根因**: install / update 路径都没有 url 非空校验,且不识别未替换的 `{VAR}` 残留占位符
- **建议修复**: 在 install_marketplace_mcp HTTP 分支(line 3147-3191 之后,write 之前)加:
  ```rust
  if mcp_type.as_deref() == Some("http") {
      if final_url.is_empty() {
          return Ok(InstallOutcome::Failed { reason: "HTTP MCP requires a non-empty URL".to_string() });
      }
      if final_url.contains('{') && final_url.contains('}') {
          // Heuristic: looks like unresolved placeholder
          return Ok(InstallOutcome::Failed { reason: format!("URL still contains placeholders: {}", final_url) });
      }
  }
  ```
  对应在 update_mcp_http_config 也加同样校验(line 2449 之前)
- **修复保守度**: Medium(改变 install API surface,需要前端 toast 显示 reason;但 install 走 InstallOutcome 已有 Failed variant,前端 modal 应已处理)
- **复核状态**: self-confirmed,**严重度上调到 P1**——这是用户 install 后看似成功但实际不可用的隐藏失败

### B7. `marketplace_source` 三元组持久但从不重新校验 → **CONFIRM ★P3**

### F5. 上游 repo 改名 / 移动后 Source 链接 404,无机制刷新

- **置信度**: High
- **严重度**: P3(罕见,可手动恢复)
- **代码位置**:
  - `marketplace.rs:3001-3008` finalize_skill_install 写 marketplace_source(owner/repo/name/repo_subpath/last_synced_at)
  - `marketplace.rs:3301-3308` finalize_mcp_install 同理
  - `MarketplaceSourceBadge.tsx:38-50` 读取上述字段渲染 URL
  - **没有任何 IPC** 重新校验
- **触发条件**: 用户 install 后,marketplace 上游 repo 改名 / 移动(如 `vercel-labs/skills` → `vercel/skills`)
- **用户可见后果**: 用户点击 detail panel "From GitHub" 链接 → 跳转 → 404 页
- **不可见后果**: 本地 marketplace_source 永远是 stale 数据;若用户再次去 marketplace 安装同名 skill,会从新 owner/repo 下载,但旧 metadata 不更新
- **根因**: 缺一个 verify+refresh IPC + 自动定期刷新机制
- **建议修复 / 不修复**: **不建议立即修**——成本高(需要 HEAD 检测 + UI 刷新按钮),收益低(罕见场景)。但 detail panel 可加"Verify source"按钮做 lazy revalidate,点击后触发 `verify_marketplace_source(skill_id)` IPC,返回新 URL 或 not_found 状态
- **修复保守度**: Risky(不修)/ Medium(若修)
- **复核状态**: self-confirmed,**保持 P3**

### B8. `scenesStore.deleteScene` 不防御 Project sceneId 引用 → **REFUTE(R1 scope,不属于我)**

- **结论**: 这是 R1(Scene cascade)的关注点,我的 scope 不覆盖。跳过。

---

## 新发现(按 P0 → P1 → P2 → P3)

### F6 ★P0. TrashRecoveryModal → restore_skill / restore_mcp 路径不恢复 metadata + 留下孤儿 snapshot

- **置信度**: High
- **严重度**: **P0**(数据丢失:用户花时间标的 category / tags / icon / usage 一次性消失)
- **代码位置**:
  - `trash.rs:343-376` restore_skill(只 fs::rename,无 metadata 处理)
  - `trash.rs:382-415` restore_mcp(同上)
  - 对比:`trash.rs:421-532` restore_claude_md / `trash.rs:540-653` restore_rule 都从 info.json 恢复完整记录
  - `marketplace.rs:526-548` consume_skill_metadata_snapshot 只被 finalize_skill_install 调用
- **触发条件 (User does X)**: 用户在 Ensemble UI Skills 页删除一条 skill(已分类、有 tags、icon),后悔了,从主菜单或 TrashRecoveryModal 选择 Restore
- **用户可见后果 (User sees Y)**: skill 重新出现在列表里,但显示 category=空、tags=空、icon=空、usage_count=0、last_used=null,**作为一个全新 skill 一样**。用户重新分类
- **不可见后果**: `_ensemble_metadata.json`(skill case)或 `<id>.json.metadata.json`(MCP case)**仍然存在**在恢复的目录 / 旁边,永远不会被清理。用户在 Finder 打开 skill 文件夹会看到这个隐藏 metadata 文件
- **根因**: 这是 02_known_risk_surfaces.md A3 candidate 的根本。设计上**两条 restore 路径行为不一致**:marketplace conflict modal 的 RestoreFromTrash 走 `consume_skill_metadata_snapshot`,但 trash.rs::restore_skill 不走。这违反"asymmetric data loss"——一个入口能恢复,另一个不能,且用户无法分辨哪个能
- **建议修复**:
  1. trash.rs::restore_skill 在 fs::rename 之后,加入 metadata 恢复:
     ```rust
     // After rename, before Ok(()):
     let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
     let mut app_data = read_app_data()?;
     let new_id = target_path.to_string_lossy().to_string();
     // Try to consume snapshot
     let snapshot_path = target_path.join("_ensemble_metadata.json");
     if snapshot_path.exists() {
         if let Ok(content) = fs::read_to_string(&snapshot_path) {
             if let Ok(snap) = serde_json::from_str::<SkillMetadata>(&content) {
                 app_data.skill_metadata.insert(new_id, snap);
                 write_app_data(app_data)?;
             }
         }
         let _ = fs::remove_file(&snapshot_path);  // Always clean up
     }
     ```
  2. trash.rs::restore_mcp 类似处理(snapshot 是 sibling `.metadata.json`)
  3. **更彻底**:把 consume_*_metadata_snapshot 提取为 trash.rs / marketplace.rs 共用的 helper(放到 utils 或 marketplace.rs::pub(crate)),两边都调用
- **修复保守度**: Medium(touches trash.rs core flow;需要测试 ID rebinding,因为 trashed name 可能与 live name 不同——但 restore 已经把 file move 回 ensemble_dir/skills/<original_name>,id = ensemble_dir/skills/<original_name>,与 snapshot 内 skill_id 一致除非 snapshot 老旧)
- **复核状态**: needs lead-agent verify(实测一下 snapshot key 的稳定性)

### F7 ★P0. 跨 install_source 状态机:marketplace skill 经 trash + UI restore 后被错误识别为 local

- **置信度**: High
- **严重度**: **P0**(数据完整性:install_source provenance 永久丢失)
- **代码位置**:
  - `skills.rs:230-269` parse_skill_file 推导 install_source
  - 关键逻辑:`metadata.install_source == Some("marketplace")` ⇒ 标记为 marketplace。**没有 metadata** ⇒ fallback fs::read_link 探测
  - `trash.rs:343-376` restore_skill 不重建 metadata(F6)
- **触发条件 (User does X)**: 用户从 marketplace install 一个 skill → 删除 → 从 TrashRecoveryModal restore
- **用户可见后果 (User sees Y)**: skill 列表中,该 skill 的 detail panel 显示:
  - install_source = "local"(因为 metadata 已被 delete_skill 清除,restore 不重建,parse_skill_file fallback 路径走 fs::read_link → 失败 → "local")
  - "From GitHub" badge 不再出现
  - 用户看不到这个 skill 是从哪里来的
- **不可见后果**: marketplace_source 数据永久丢失;若用户后来再次 install 同名 marketplace skill,会触发 NameCollision modal,但 trash brief 不会被检测因为 trash 在不同处。Provenance 链断裂
- **根因**: F6 的衍生。修复 F6 顺带解决这个 — snapshot 含 install_source 字段(由 finalize_skill_install line 3001 写入)
- **建议修复**: 同 F6 — 修复 F6 后,install_source 自动恢复
- **修复保守度**: Safe(F6 修复后自动 cover)
- **复核状态**: self-confirmed

### F8 ★P1. import_existing_config 对项目级 MCP 的处理不闭合 + remove_imported 只清 user scope

- **置信度**: High
- **严重度**: P1(orphan 状态难恢复)
- **代码位置**:
  - `import.rs:274-288` detect_existing_config 扫 `projects[*].mcpServers` 标记为 `scope="local"`
  - `import.rs:704-728` extract_mcp_config 第二个 for 循环匹配 project-scope MCP 并写入 Ensemble,标记为 `install_source: "local"`(**没有 project_path 记录**)
  - `import.rs:1682-1717` remove_imported_mcps **只清 top-level `~/.claude.json::mcpServers`**,完全不动 projects[*].mcpServers
- **触发条件 (User does X)**:
  - 用户在项目 A 中创建了一个 project-scope MCP(在 A 的 `.mcp.json` 或 `~/.claude.json::projects[A].mcpServers`)
  - 通过 Ensemble import dialog 导入此 MCP
  - 想"取消导入"或 remove
- **用户可见后果 (User sees Y)**:
  - Import 后:Ensemble MCPs 页显示该 MCP,scope 显示 "project"(因为 derive_mcp_scope 检查 `~/.claude.json::mcpServers` 中是否有 mcpName,这里没有 → "project")
  - 用户切换 Ensemble scope 到 "global":写入 `~/.claude.json::mcpServers`(top-level)。**但原 project-scope 的 MCP 仍存在!** 现在 Claude Code 看到两个同名 MCP(user + project),其行为未定义/可能拒绝
  - 用户在 Settings → Remove imported MCPs:remove_imported_mcps 只清 user scope,**project-scope 原 entry 仍在**。重新打开 import dialog 又看到它,陷入循环
- **不可见后果**: project-scope MCP entry 在 `~/.claude.json::projects[<path>].mcpServers` 中永远残留;用户认为"已 remove"但实际未清理
- **根因**:
  1. extract_mcp_config 不记录 origin scope/project_path(只写 install_source="local")
  2. remove_imported_mcps 只覆盖 user scope
  3. update_mcp_scope 不感知原 entry 来自哪个 project
- **建议修复 / 不修复**:
  - **保守修法**:remove_imported_mcps 也扫 `projects[*].mcpServers` 删除同名 entry
  - **更完整**:McpMetadata 加一个 `imported_from_project: Option<String>` 字段记录来源,remove 时根据该字段精确清理
- **修复保守度**: Medium(动 ~/.claude.json 的 nested structure,需要谨慎;但 remove_imported_mcps 已经在动它了)
- **复核状态**: needs lead-agent verify(需要实测 project-scope MCP 的 Claude Code 行为)

### F9 ★P1. import_plugin_skills / import_plugin_mcps eprintln 错误,前端看不到

- **置信度**: High
- **严重度**: P1(silent partial failure)
- **代码位置**:
  - `plugins.rs:762-765` import_plugin_skills:errors 只 eprintln,return Ok(imported_plugin_ids)
  - `plugins.rs:872-875` import_plugin_mcps:同
- **触发条件 (User does X)**: 用户在 ImportSkillsModal 选 5 个 plugin skills,点 "Import"
- **用户可见后果 (User sees Y)**: modal 关闭,5 个 plugin keys 加入 importedPluginSkills(因为 imported_plugin_ids 只包含成功的 + 已存在的);但实际可能只有 3 个真正落盘
- **不可见后果**: 用户以为全部 import 完成。下次打开 SkillsPage 会发现少了 2 条,但已经看不到 import 错误信息
- **根因**: 返回 Vec<String> 而非 Vec<ImportResult>;errors 被丢弃。这也是 02 中 C3 candidate 提到的,但跨 R3 / R2 scope
- **建议修复**: 改返回 `{ imported: Vec<String>, errors: Vec<String> }` 结构;前端在 toast 显示部分失败
- **修复保守度**: Medium(改 IPC 返回类型,前端要适配)
- **复核状态**: self-confirmed,**与 R3::C3 重叠 — 我标 P1,他们可能有不同视角**

### F10 ★P2. consume_skill_metadata_snapshot orphan file 残留在恢复后的 skill 目录

- **置信度**: High
- **严重度**: P2(UX 污染,不影响功能)
- **代码位置**:
  - `marketplace.rs:546` 仅在 consume_skill_metadata_snapshot 内 fs::remove_file
  - **没有任何其它 callsite 清理**
- **触发条件 (User does X)**: 用户 delete skill → 通过 TrashRecoveryModal restore(非 marketplace 路径)→ 打开 skill 文件夹
- **用户可见后果 (User sees Y)**: Finder 中看到 `_ensemble_metadata.json` 文件躺在 SKILL.md 旁边
- **不可见后果**: 文件累积。每次 delete + restore 都留一个(虽然 delete 时只写最新的,但 restore 不清理)
- **根因**: F6 的延伸。修 F6 时顺便 fs::remove_file 即可
- **建议修复**: F6 修复时一并处理
- **修复保守度**: Safe
- **复核状态**: self-confirmed

### F11 ★P2. install_skill_via_codeload 静默丢弃所有 dotfile 组件

- **置信度**: High
- **严重度**: P2(罕见场景,但完全静默)
- **代码位置**: `marketplace.rs:2710-2716`
  ```rust
  for comp in rel_path.components() {
      if let std::path::Component::Normal(s) = comp {
          let name = s.to_string_lossy();
          if name.starts_with('.') {
              skip = true;
              break;
          }
          ...
  ```
  注释说"matches V1 behaviour for `.gitignore` / `.DS_Store`",但实际**所有** dotfile / dot-dir 都被静默 drop
- **触发条件 (User does X)**: 用户 install 一个 marketplace skill 该 skill 上游含 `.scripts/` / `.config/` / `.eslintrc.json` / `.claude/` 等
- **用户可见后果 (User sees Y)**: install 显示成功,但 skill 缺关键文件。用户可能要等 skill 实际运行时才发现 ".scripts/build.sh" 没下载
- **不可见后果**: 上游本来可能依赖 `.config/foo.json`,Ensemble 这边没有,运行错误
- **根因**: dot-filtering 是过激的安全防御(实际只想 drop `.git/` 和 `.DS_Store`,但用了 starts_with('.') 大网捕)
- **建议修复 / 不修复**:
  - **保守**:加白名单,只 skip `.git`, `.gitignore`, `.gitattributes`, `.DS_Store`, `.hg`, `.svn`, `.cache`, `.idea`, `.vscode`
  - **不修**:这只在罕见 skill 中触发,而且 SKILL.md 里通常会标 "requires .scripts/" 的依赖,用户能自己 debug
- **修复保守度**: Medium(改 sanitization 规则可能让恶意 dotfile 滑过;需要白名单而非黑名单思路)
- **复核状态**: self-confirmed,**建议保留 P2 但暂不修**(等真实用户反馈)

### F12 ★P3. update_mcp_http_config 不验证 URL 有效性

- **置信度**: High
- **严重度**: P3(与 F4 同根因)
- **代码位置**: `marketplace.rs:2430-2459` update_mcp_http_config
- **触发条件**: 用户在 McpDetailPanel 编辑 url_variables,留空某个必填变量
- **用户可见后果**: 保存成功,但 substituted url 含未替换的 `{VAR}` 占位
- **建议修复**: 与 F4 同时修
- **复核状态**: self-confirmed,**合并到 F4 一起 fix**

### F13 ★P3. parse_plugin_id rfind('@') marketplace="unknown" 默认值污染

- **置信度**: Low
- **严重度**: P3(极罕见)
- **代码位置**: `plugins.rs:130-143`
- **触发条件**: plugin 名字本身不含 `@`(如某些手动 install 的本地 plugin)
- **用户可见后果**: detail panel "Plugin" 标识可能显示为 "<name>@unknown"
- **建议修复 / 不修复**: **不修**(实际 plugin 都用 `name@marketplace` 命名规范,不太可能命中)
- **复核状态**: self-confirmed,**保持 P3**

---

## 总结

### 我个人最关注的 1-3 条(优先修)

1. **F1(B2,P0):claude_md.rs 排除 `.claude/`** — 一行 fix,用户最常用的"扫描项目"功能直接缺漏关键文件,与 sync 的默认写路径完全反向。用户语言:"我想 import 项目里的 CLAUDE.md,但 Scan 找不到它"
2. **F6(A3,P0):TrashRecoveryModal 路径不恢复 skill / mcp metadata + 留 orphan 文件** — 用户花时间分类、加 tag、配 icon、积累 usage_count 全部一删一恢复后归零。两条 restore 路径行为不对称,用户没办法选哪条
3. **F4(B6 升级,P1):HTTP MCP install / update 不验证 URL** — install 显示成功但 .mcp.json 写空 url,Claude Code 加载失败,用户在 Ensemble 看一切正常。最难 debug 的"看似成功"

修这三条,Ensemble 安装 / 三种来源 / restore 完整闭环就 90% 达标了。

### 我觉得不必修的 0-3 条

- **B4(plugin skills symlink vs MCPs copy)**:结构性差异,不是 bug
- **F11(dotfile 静默 drop)**:暂不修,等真实用户反馈;白名单方案有引入风险
- **F13(parse_plugin_id "unknown")**:罕见,且行为已经 graceful

### 设计建议(架构层,非 finding)

**统一 restore 入口**:目前有两条 restore 路径(marketplace conflict modal RestoreFromTrash vs UI TrashRecoveryModal),行为不一致。建议将 marketplace 的 RestoreFromTrash 内部也改为复用 trash.rs::restore_skill,并把 metadata 恢复逻辑下沉到 trash.rs,让 marketplace finalize_*_install 仅处理新 install(无 trash)的场景。这样代码路径单一,行为对称,F6/F7 自动闭合。

