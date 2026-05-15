# Master Findings — Phase 5 主 Agent 复核

Phase 1-4 一共得到 7 份 reviewer findings(R1-R7,~2700 行)。主 Agent Phase 5 复核任务:去重、cross-confirm、自己 verify 关键 single-reviewer P0。

## Cross-Confirmation 标尺

- **HIGH confidence**:≥2 reviewer 命中同一处 + 我亲自代码层 verify
- **MEDIUM confidence**:single reviewer 但代码层证据明确,主 Agent verify 通过
- **LOW confidence**:single reviewer + 需要实际 measurement 或 UI 实测确认

## 主 Agent 亲自 verify 的关键单 reviewer P0(全部 CONFIRMED)

| Finding | File:Line | Verify 结论 |
|---|---|---|
| R4 D1 AppleScript 注入 (iTerm / Terminal.app) | import.rs:1459-1467, 1607-1614 | TRUE。escape 函数只防 AppleScript 字面量,不防 shell `$()` / 反引号。同模块 `shell_quote` 已存在(line 1261),Ghostty 路径已正确使用,iTerm/Terminal.app 路径**未使用** |
| R4 F1 install_skill_via_codeload 不 sanitize owner/repo | marketplace.rs:2567, 2776-2797 | TRUE。`derive_install_triple` 直接返回 owner/repo 不 sanitize。同模块其它 3 处 GitHub URL 路径(fetch_github_repo_stars / fetch_skill_summary_github / fetch_mcp_readme_github)都已 sanitize。**漏的就这一处** |
| R4 F2 derive_stdio_command unknown registry_type | marketplace.rs:1328-1339 | TRUE。`_` 分支注释直白承认"use the identifier as the command and the extra args verbatim"。MCP Registry 一条 envelope `registryType: "evilfoo", identifier: "/usr/bin/curl"` 即 Ensemble spawn 任意 binary |

## P0 Master List(数据丢失 / 安全)

| ID | 描述 | 命中 reviewer | Confidence |
|---|---|---|---|
| P0-1 | **clear_project_config / write_mcp_config 无差别删用户手写 CLAUDE.md 和 .mcp.json** | R1 A1, R1 F1 | HIGH(主 Agent 也独立发现) |
| P0-2 | **Trash UI restore_skill / restore_mcp 不恢复 metadata + 留 orphan snapshot** | R1 A3, R2 F6, R5 F5 | HIGH(3 reviewer cross-confirm) |
| P0-3 | **claude_md scan 排除所有 `.starts_with('.')` 包括 `.claude/`** | R2 F1/B2 | HIGH(主 Agent 也独立发现 + 与 rules.rs 不一致) |
| P0-4 | **AppleScript 注入(iTerm / Terminal.app)** | R4 D1 | HIGH(verify 通过) |
| P0-5 | **install_marketplace_skill 不 sanitize owner/repo** | R4 F1 | HIGH(verify 通过) |
| P0-6 | **derive_stdio_command unknown registry_type 把 identifier 当 binary** | R4 F2 | HIGH(verify 通过) |
| P0-7 | **data.json fs::write 非原子 + 无 backup**(power loss / 磁盘满 = data 全失) | R5 F14, R5 F15, R6 F6 | HIGH(3 hit) |
| P0-8 | **~/.claude.json 与 Claude Code 并发写无锁**(用户 token / 全局 MCP 丢失) | R5 F17, R6 F1 | HIGH(2 hit) |
| P0-9 | **init_app_data setup 顺序错 + 非原子**(fresh user 看不到默认 categories) | R5 F1 | MEDIUM(单 reviewer 但代码推演清晰) |
| P0-10 | **~/.ensemble/ owner 错配 silent fall back**(sudo open 过 app 的用户) | R6 F2 | MEDIUM(单 reviewer 但代码层确认) |

## P1 Master List

| ID | 描述 | 命中 reviewer | Confidence |
|---|---|---|---|
| P1-1 | **list_trashed_items 不含 Scene / Project**(误删 Scene 不可恢复) | R1 A2, R5 F4 | HIGH |
| P1-2 | **delete_category / delete_tag 不 cascade Rules**(悬空 category_id / tag_ids) | R1 A4, R3 F2 | HIGH |
| P1-3 | **syncProject 四段串联无 rollback**(部分 sync 状态用户不见) | R1 A7, R7 F7-3 | HIGH |
| P1-4 | **HTTP MCP install/update 不验证 URL 非空 / 未替换 placeholder** | R2 F4 | MEDIUM |
| P1-5 | **update_rule + update_claude_md 缺 categoryId clear 路径** | R3 C6 | MEDIUM(verify 通过) |
| P1-6 | **trashStore 无 restoreRule + TrashRecoveryModal 无 Rules tab** | R3 F3, R7 F7-4 | HIGH |
| P1-7 | **fetch_mcp_tools 继承全 env vars 给 child**(API key 泄露给 third-party MCP) | R4 D6 | MEDIUM(supply chain 攻击面) |
| P1-8 | **import_existing_config 处理 project-scope MCP 不闭环** | R2 F8 | MEDIUM |
| P1-9 | **import_plugin_skills / import_plugin_mcps eprintln 错误不返回** | R2 F9, R3 C3 | HIGH |
| P1-10 | **migrate_claude_md_storage 在 setup 阻塞主线程 + partial-state** | R5 F2 | MEDIUM |
| P1-11 | **migrate_category_id_for_skills_mcps 大数据用户 UI 看到不一致** | R5 F3 | MEDIUM |
| P1-12 | **AppData 缺 #[serde(flatten) other]**(用户回滚旧版会丢未来字段) | R5 F7 | MEDIUM |
| P1-13 | **多版本 .app 共存触发 schema 倒退** | R5 F8 | LOW(场景概率需 verify) |
| P1-14 | **launch_claude_for_folder 终端未装时 fallback 全失败 + Warp silent fail** | R6 F3 | MEDIUM |
| P1-15 | **NFC vs NFD 边界 id 字节比较 fail**(中文 / 带音标 skill 名 metadata reset) | R6 F5 | MEDIUM(实测频率需 verify) |
| P1-16 | **sync_project_config 在不支持 symlink 的 FS 上 silent fail** | R6 F9 | MEDIUM |
| P1-17 | **删除 SkillsPage/McpServersPage 选中项后 SlidePanel 残留空白打开** | R7 F7-1 | HIGH(高频触发) |
| P1-18 | **Modal 无 a11y(无 role=dialog / focus trap)** | R7 F7-2 | MEDIUM |
| P1-19 | **importStore.importMcps 用错 dir 推导**(自定义 mcpSourceDir 用户 MCP 写错位置) | R7 F7-5 | HIGH(明显 copy-paste bug) |
| P1-20 | **addCategory / addTag / addScene 完全无重名校验** | R7 F7-6 | MEDIUM |
| P1-21 | **所有 Enter handler 无 IME composition 守卫**(中文 / 日 / 韩 用户) | R7 F7-7 | MEDIUM |
| P1-22 | **AppData data.json 损坏后无 recovery 路径** | R5 F15 | HIGH(配 P0-7 一起修) |

## P2 Master List(总数 14+,只列代表)

- restore_claude_md / restore_rule 在 rename 前不 validate info.json,parse 失败时实体凭空消失(R5 F6)
- read_app_data 在 load_skill_metadata / load_mcp_metadata 用 `if let Ok` silently swallow 解析错误(R3 C4)
- scan_usage_stats async 但用 sync IO 阻塞 tokio worker(R3 F8, R5 F10)
- fetch_mcp_tools stderr 完全丢弃,用户无法 debug MCP 启动失败(R3 C5)
- delete_skill / delete_mcp 不 cascade Scene.skill_ids / mcp_ids 与 claude_md / rules cascade 不一致(R1 F3)
- AppleScript Warp YAML 不 escape `\n` `\r` `\t` `\\` 等(R4 D2,降级 P2)
- install_quick_action 硬编码 `/Applications/Ensemble.app/`(R4 D3 + R6 F4 升 P2)
- Trash 长期累积无 retention / 无 Empty Trash 按钮(R5 F4)
- imported_plugin_skills / imported_plugin_mcps marker 永不 cleanup(R5 F12)
- 多个 store action 错误后只 setError 不 rollback optimistic(R3 F5)
- Markdown body 无 memo 无 size limit(R7 F7-10)
- detect_plugin_mcps is_imported 误判同名本地 MCP(R2 F2)
- import_plugin_skills (symlink) vs import_plugin_mcps (copy) 不一致(R2 confirm,设计性)
- `~/.claude.json` 写时 HashMap 顺序非确定,git diff 噪声(R6 F7)
- McpDetailPanel 双实现缺 HTTP / failed 守卫(R7 F7-8)
- reveal_in_finder 不查 exit code 失败 silent(R6 F8)
- ClaudeJson.other HashMap 应该用 Map / IndexMap 保序(R6 F7)
- ColorPicker / IconPicker / Dropdown 嵌套 Modal 时 Escape 同关两层(R7 F7-9)
- appStore.error 在 UI 完全不显示(R7 F7-11)
- text input 无 maxLength(R7 F7-13)
- mcpsStore.updateMcpTags / Icon 不 optimistic-first(R7 F7-14)
- Marketplace install 失败错误只在 title tooltip(R7 F7-15)
- raw Rust error 直接显示给用户(R7 F7-16)
- ~/.claude.json 不存在时 Ensemble 创建 minimal 文件(R6 F10)
- restore_rule 中 info.json schema drift 无 fallback(R5 F6)
- has_completed_category_id_migration 一次性 flag(R5 F16)
- detail panel 双实现长期维护负担(R7 F7-17)

## P3 Master List(已 verify 不必修 + 维护类)

- C7 delete_skill 写 data.json 错误被吞(已有 self-heal,改 comment 即可)
- C2 create_symlinks errors-in-Ok(死代码,删 IPC 注册而非修语义)
- SceneDetailPage.tsx 整 498 行死代码(R3 F4, R7 F7-12,删即可)
- 32 处 println! 调试日志污染 stderr(R3 F7,改 log::warn!)
- 错误信息泄露 /Users/<name>/ 绝对路径(R3 F9)
- update_project sceneId Option<String> 同 C6 模式(R3 F10)
- F8 update_mcp_* hold DATA_MUTEX 期间做 IO(R4 F6)
- expand_path 对 `~name` 不按 POSIX(R4 F5)
- import_plugin_skills item_name 不 sanitize(R4 F7)
- parse_plugin_id rfind('@') marketplace 默认 "unknown"(R2 F13)
- F11 cleanup_legacy_mcp_cache 每次启动 idempotent check 廉价(R5 F11)
- F13 --launch 空 path 卡隐藏窗口(R5 F13)
- F18 modal close 不取消 inflight detect(R7 F7-18)
- F19 大数据 marketplace 无 virtualization(R7 F7-19,需测量)
- mcpFetchErrors 永不 manual clear(R3 F11,设计合理)
- B7 marketplace_source 三元组从不再校验(R2 F5,需求低)
- F12 Spotlight / TM / Dropbox 索引 partial read(R6 F12,理论)

## REFUTED(02 candidate 已修 / 不是 bug)

- B1: scan_skills 硬编码 scope="user" — 已修(`derive_skill_scope` 存在)
- C1: scan_skills 多余参数 — 已修
- C2: create_symlinks errors-in-Ok — 死代码(降 P3)
- D5: tar path traversal — 4 层防御 verify 通过
- B4: import_plugin_skills symlink vs MCPs copy — 结构性差异,不修
- B5: set_global_rule 优先级歧义 — R2 推演实际 OK,只是可读性
- F6 R3: safeInvoke null 后 .map 不防御 — 实测无未防御点
- F11 R5: cleanup_legacy_mcp_cache 每次启动检查 — 廉价,不修

## 总数统计

- **P0**: 10 条(数据丢失 + 安全)
- **P1**: 22 条(功能错 / 用户失望)
- **P2**: 27+ 条(UX / 边界 / 性能)
- **P3**: 17+ 条(代码质量 / 维护 / 罕见 case)
- **REFUTED**: 8 条(已修或非 bug)
