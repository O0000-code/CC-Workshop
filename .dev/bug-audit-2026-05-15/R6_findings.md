# R6 — macOS 系统集成 / 文件系统怪异性 / 与 Claude Code 并发共存 Findings

**Reviewer**: R6 (补派)
**Angle**: Expert A Angle 7 + Expert B Angle 8 — 环境横切维度。
**Scope reminder**: 只扫"非 default 假设下 Ensemble 怎么坏"——不重复 R1-R4 已扫面;**专门**不扫 R4 的 Shell 注入(D1/D2/D6/F1/F2 等)。

---

## 复核结果(对 02_known_risk_surfaces.md 中归本 angle 的 candidate)

### D3 复核:install_quick_action 硬编码 `/Applications/Ensemble.app/`

- **结论**: **CONFIRM,严重度调整 P3 → P2**
- **代码位置**: `src-tauri/src/commands/import.rs:1050`
- **复核**: 用户在 `~/Applications/Ensemble.app` 或非 `/Applications` 安装时,Quick Action workflow 嵌入的 `for f in "$@"; do "/Applications/Ensemble.app/Contents/MacOS/Ensemble" --launch "$f"; done` shell 字符串始终指向 `/Applications/...`。即使 `/Applications/Ensemble.app/Contents/MacOS/Ensemble` 不存在,Automator 也只在用户从 Finder 触发 Quick Action 时报"command not found"(zsh stderr),Finder 不弹任何 UI 错误。
- **用户可见后果**: User does:`Finder 右键 → 服务 → Open with Ensemble`;User sees:**什么也没发生**(Ensemble 窗口不打开);User does NOT see:任何错误提示。
- **不可见后果**: workflow 已注册成功(Services/ 下文件存在),用户以为安装成功;每次右键 fail 后 zsh 进程瞬即退出,无日志可查。
- **建议**: 在 `install_quick_action` 中用 `std::env::current_exe()` 获取当前运行的 Ensemble 路径 (Apple 推荐做法 — `Contents/MacOS/Ensemble`),写入 wflow 时插值真实路径。**严重度调高**:用户报"Quick Action 不响应"现场无法 debug,因 fail mode 是 silent。
- **修复保守度**: Safe — 一处插值替换,无副作用。
- **复核状态**: self-confirmed

---

## 新发现(P0 → P1 → P2 → P3)

### F1. ~/.claude.json 整文件 rewrite 与 Claude Code 并发写,无任何锁

- **置信度**: High
- **严重度**: **P0**
- **代码位置**: `src-tauri/src/commands/import.rs:60-67`(write_claude_json)+ 调用点 `import.rs:920`(update_mcp_scope)/ `import.rs:1714`(remove_imported_mcps)/ `import.rs:1692`(parallel) + `types.rs:629-641`(ClaudeJson struct)
- **触发条件 (User does X)**:
  1. 用户在 Ensemble 中 toggle 某 MCP 的 scope(global / project)→ `update_mcp_scope`
  2. **与此同时**,用户在 Terminal 启动 Claude Code(或 Claude Code 已运行后做任何会写 `.claude.json` 的操作:numStartups++、tipsHistory 更新、autoUpdaterStatus、`/login` 改 token、新建一个 project 配置块、`/mcp install` 在另一 project 添加 server,等等)。
- **用户可见后果 (User sees Y)**:
  - 路径 a:User opens Claude Code → 看到 ANTHROPIC API token / oauthAccount 字段消失,被要求重新登录;或某些 project 级 `mcpServers` 全部消失;或 IDE 的 `numStartups`、`tipsHistory`、`firstStartTime` 之类设置回归默认。
  - 路径 b:User opens Ensemble → MCP Servers 列表显示该 MCP 已切到 global,但 Claude Code 实际没看到它(因为后写者用 Ensemble 写之前的快照覆盖了 Ensemble 的写入)。
  - 路径 c:文件被截断 / JSON 部分写入(power loss 期 fs::write 不是原子的)→ Claude Code 启动报"Cannot parse ~/.claude.json",所有 MCP / 项目配置不可用。
- **User does NOT see**: 任何 Ensemble 警告"~/.claude.json 在 Ensemble 上次读后被改过"。
- **不可见后果**:
  1. **read → mutate → write 间没有 mtime 验证**:`read_claude_json` (line 49) 读完后无快照 hash;`write_claude_json` (line 61) 不检查文件是否在 read 之后被改过。两进程同时读、各自 mutate 各自的 in-memory,后 write 者赢 → **lost-update**。
  2. **fs::write 在 macOS 上不是原子的**:Tokio / std 的 `fs::write` 是 `open(O_WRONLY|O_CREAT|O_TRUNC)` + `write` + `close`,不走 `rename`。Claude Code 在 truncate-and-write 中点读会读到 partial。
  3. **`#[serde(flatten) other: HashMap<String, Value>`** 在 deserialize→serialize 路径会**重排** JSON keys(HashMap 顺序非确定),即使没 race 也会让 `.claude.json` 每次 Ensemble 写完都"git diff dirty"——更糟的是给"Claude Code 改动 vs Ensemble 改动"互相打补丁制造视觉混乱。
  4. **fs::write 失败不回滚**:line 65-66 `fs::write(&path, json).map_err(...)` 若中途失败(磁盘满 / 权限突变 / 网络盘 disconnect),`~/.claude.json` 已被 truncate 一半,**用户全部 Claude Code 全局配置丢失**。
- **根因**:`~/.claude.json` 是 Ensemble 与 Claude Code 的**共享可变状态**,但 Ensemble 用纯 `fs::write` 整文件覆盖,既无 advisory lock(`flock(2)`)、无 mtime check、无 atomic rename(`tempfile + fs::rename` 跨同 FS),也不 backup-before-mutate。这是本审计中最大 P0 候选——Claude Code 用户的所有"我的 token 怎么没了 / MCP 配置怎么乱了"故事都可能来自这一条。
- **建议修复**:
  1. **最小化**:每次 `write_claude_json` 前 `fs::copy` 到 `~/.ensemble/backups/claude.json.last-ensemble-write` (轮转 5 份);写完后保留 mtime+size 快照,下次读时若 mtime 比快照新则记入 audit log,提示用户"上次写后被外部进程改过"。
  2. **更稳**:用 `tempfile + rename` 原子化(同 FS):写 `~/.claude.json.ensemble.tmp` → `fs::rename(.tmp, .claude.json)`,POSIX 保证 rename 在同 FS 原子。
  3. **最稳**:取消"整文件 rewrite"模式;改"读 → 修改特定 path → 写"用 `serde_json::Value` 增量编辑,只 touch `mcpServers` 子树,保留其他 key 字节级不变。这需要相当重写,但是与 Claude Code 长期共存的正确方式。
  4. **报警 channel**:Ensemble 每次 write_claude_json 前后记录 mtime;若 mtime 在 Ensemble 一次会话期间被外部改动(说明 Claude Code 在跑),弹 toast 提示"Claude Code 正在运行;建议关闭后再修改 MCP scope"。
- **修复保守度**: Medium——backup + atomic rename 安全,Medium 风险来自 backup 目录管理。
- **复核状态**: needs lead-agent verify(verify 通过实测:1. Claude Code 跑起来,2. 同时 Ensemble UI toggle MCP scope,3. observe `.claude.json` 是否 lose-update)

---

### F2. ~/.ensemble/ 第一次写失败时未检测 owner / 权限,silent fall back 到 read-only 状态

- **置信度**: High
- **严重度**: **P0**
- **代码位置**: `src-tauri/src/utils/path.rs:55-60`(get_app_data_dir non-test fallback)+ `src-tauri/src/commands/data.rs:303-360`(init_app_data)
- **触发条件 (User does X)**:
  - 路径 a:用户**曾用 `sudo open /Applications/Ensemble.app`** 启动过一次(常见原因:Gatekeeper 警告时按住 ctrl 点 Open 失败后求助 ChatGPT 给的 sudo 命令),导致 `~/.ensemble/` 整个目录 owner 变成 root:wheel。下次普通用户启动 Ensemble,写 data.json 失败。
  - 路径 b:`/Users/bo/.ensemble/` 是 read-only 挂载(罕见,例如用户把 home 放到只读 mount 测试)。
  - 路径 c:用户 ENSEMBLE_DATA_DIR 指向不存在 / 无权限路径。
- **用户可见后果 (User sees Y)**:
  - Ensemble 启动成功(因为 init_app_data 失败 IPC 错误,前端 store 用 in-memory empty AppData);
  - 所有 categories/tags/scenes/projects 显示空白;用户以为"配置全没了";
  - 用户点击"添加 category" → 后端 `add_category` 调 `write_app_data`,fs::write fail,IPC 返回 error string;前端只 toast"Failed to write data: permission denied",**用户不知道根因**。
- **User does NOT see**: "你的 ~/.ensemble/ 目录 owner 是 root(或不可写),Ensemble 无法持久化任何修改" 这一明确诊断。
- **不可见后果**:
  - migrate_claude_md_storage 在启动期 fail silently(lib.rs:33-36 已说"Don't fail startup on migration error, just log it")——但 silent log 在 release build 看不见,用户没办法发现。
  - 多次重启都是空白状态;用户可能误以为 app 损坏,删 `~/.ensemble/` (用 sudo)反而消除问题——但用户也可能因此**丢失之前正确写入的数据**。
- **根因**: Ensemble 不在启动早期主动**写一个 sentinel 文件**(`~/.ensemble/.write-check`)来验证目录可写;permission/owner 错配只在第一次 mutation IPC 时被发现,且 error 不提供 actionable 引导。
- **建议修复**:
  1. `init_app_data` 末尾追加 `fs::write(get_app_data_dir().join(".health-check"), env!("CARGO_PKG_VERSION"))` + 删除;失败时返回结构化 error 含 `kind: "EnsembleDirUnwritable"` + diagnostic("用 `ls -la ~/.ensemble/` 检查 owner")。
  2. 前端首屏检测该 error 类,弹大模态指引"修复命令:`sudo chown -R $(whoami):staff ~/.ensemble/`"。
  3. 若 ENSEMBLE_DATA_DIR 在 production 下指向不存在路径,改为 fail-loud(panic + 弹错)而非 silent fallback 到 `dirs::home_dir() / ".ensemble"`——production 与 cfg(test) 应该对**异常配置**有相似的 loud 行为,不只是 cfg(test) panic。
- **修复保守度**: Medium——加诊断 surface 安全;改 fallback panic 行为可能在用户特殊配置下意外失败,需要更细分(env 设了但路径不存在 vs env 未设)。
- **复核状态**: self-confirmed(static code 推演已足,不需要复现)

---

### F3. 终端启动 launch_claude_for_folder 无 fallback:用户没装 iTerm/Warp/Alacritty/Ghostty 时唯一 fallback 是 Terminal.app,但 SettingsPage 不验证

- **置信度**: High
- **严重度**: **P1**
- **代码位置**: `src-tauri/src/commands/import.rs:1455-1623`(launch_claude_for_folder)+ `src-tauri/src/commands/import.rs:1392-1406`(installed_ghostty_version,**硬编码** `/Applications/Ghostty.app/Contents/Info.plist`)+ `src/pages/SettingsPage.tsx`(terminalApp dropdown)
- **触发条件 (User does X)**:
  - 路径 a:用户在 SettingsPage 选择 `Alacritty`(因为以前装过)→ 卸载 Alacritty 后未改设置 → 从 Quick Action / LauncherModal 启动 → backend `Command::new("alacritty").spawn()` failed("No such file or directory")。
  - 路径 b:用户选 `Ghostty` → 真实 Ghostty 装在 `~/Applications/Ghostty.app` 或通过 Homebrew Cask 安装到 `/opt/homebrew/Cellar/...` → `installed_ghostty_version()` 走 `/Applications/Ghostty.app` 硬编码路径 → 返回 None → `supports_native_applescript` 走 `unwrap_or(true)` → 强行执行原生 AppleScript → Ghostty 实例不存在,osascript 报"Application is not running" stderr → Error 通过 IPC 抛给前端。
  - 路径 c:用户选 `Warp`,但 Warp 没装 → `open warp://...` 触发 macOS 系统弹窗"没有应用程序设置为打开该 URL"——同时 IPC `Command::new("open").spawn()` 因为 open 自身返回 0,**Ensemble 误以为成功**。
- **用户可见后果 (User sees Y)**:
  - 路径 a:LauncherModal 显示 error:`Failed to launch Alacritty: No such file or directory (os error 2)` —— 用户看到 Rust error,没人引导"请安装 Alacritty 或换其它终端"。
  - 路径 b:类似的 osascript error 字符串。
  - 路径 c:**Ensemble silently 报"成功",LauncherModal 关闭,但用户什么也没看到** ——这是最坏的 case:Quick Action 触发后没有反馈,用户**反复点击 5-10 次**,每次都开启一个失败的 `open warp://...` 弹窗。
- **User does NOT see**: 一个"请选择已安装的终端 / 检测到您选择的终端未安装"的指导。
- **不可见后果**: 
  - Warp launch (case c) 在 New Window mode 下还会**写 `~/.warp/launch_configurations/ensemble-launch-{ts}.yaml`** (line 1539);Warp 没装时这文件写完后**没有 10s 后的清理 thread 失败**(thread 还是会跑),但文件无意义占盘——直到用户手动清。
  - 在 Ghostty 老版本下尝试 fallback 到 keyboard automation (line 1582-1589) 走 System Events keystroke——若 Accessibility 未授权,osascript 返回特定 stderr,代码 catch 了"ACCESSIBILITY_PERMISSION_REQUIRED"(只在 Warp tab 模式 line 1493-1500),**但 Ghostty 路径没 catch 这个错误**,return 给前端 "Ghostty launch failed: System Events got an error..." —— 用户无法分辨"Ghostty 没装 vs 权限未给"。
- **根因**: 终端启动逻辑做了完整 5 个分支但没有"用户选了 X、但 X 不存在"的 pre-flight check;Settings UI 也不在选择时实测(`std::process::Command::new("alacritty").arg("--version").output()` 之类的 health check)。
- **建议修复**:
  1. SettingsPage 加 `validate_terminal_app(name: &str)` IPC,选中下拉时立刻调,显示绿点 / 红叉。
  2. `launch_claude_for_folder` 入口加同样 pre-flight,失败时返回结构化 error `{kind: "TerminalNotInstalled", terminal: "Alacritty"}`,前端弹"看上去 Alacritty 未安装,点击切换终端"。
  3. `installed_ghostty_version`:除了 `/Applications/Ghostty.app`,fallback `~/Applications/Ghostty.app`;再 fallback `which ghostty`(brew install ghostty 走 CLI)。
  4. Warp `open warp://...` 检测:`open` 命令 stderr 含 "Unable to find application" 时认作"没装"。
- **修复保守度**: Medium——pre-flight 安全;判定 Warp 没装的 stderr regex 需要小心。
- **复核状态**: self-confirmed

---

### F4. install_quick_action 硬编码 /Applications/Ensemble.app + 无 self-validation(D3 升级版)

- **置信度**: High
- **严重度**: **P2**(从 02_known_risk_surfaces D3 的 P3 调升)
- **代码位置**: `src-tauri/src/commands/import.rs:1048-1051`
- **触发条件 (User does X)**: 用户安装 Ensemble 到 `~/Applications/Ensemble.app`(无管理员权限的工作机最常见路径)→ Settings 中点"Install Quick Action" → 安装 silent 成功 → 在 Finder 右键文件夹 → "Open with Ensemble"。
- **用户可见后果 (User sees Y)**: 什么都没发生(zsh 实际报 `/Applications/Ensemble.app/Contents/MacOS/Ensemble: No such file or directory`,但 Finder 不显示)。User 反复尝试无反馈。
- **User does NOT see**: 任何关于"安装路径不对"的指引。
- **不可见后果**: workflow plist 写入了错误的硬编码路径;每次 Quick Action 触发都开启一个失败的 zsh shell;Spotlight 已索引 workflow 但实际无效。
- **根因**: install_quick_action 用字符串字面量 `"/Applications/Ensemble.app/Contents/MacOS/Ensemble"`,不查询 `std::env::current_exe()`。
- **建议修复**: 用 `std::env::current_exe()?.to_string_lossy()` 动态生成 COMMAND_STRING。可加 self-validation:安装完后 spawn `<current_exe> --version` 1 秒超时 check exit 0,失败则报错。
- **修复保守度**: Safe——单一插值替换。
- **复核状态**: self-confirmed

---

### F5. NFC vs NFD 边界:metadata HashMap key 用磁盘原始字节序,Finder/git/Linux 来回拷贝的 skill 失同步

- **置信度**: High(代码层确认)/ Medium(实测影响范围)
- **严重度**: **P1**
- **代码位置**:
  - skill id 生成:`skills.rs:212` `let id = skill_dir.to_string_lossy().to_string();` 和 `skills.rs:281` `source_path: skill_dir.to_string_lossy().to_string()`
  - metadata 查找:`skills.rs:215` `metadata_map.get(&id)`,HashMap key 是 `String`
  - MCP 同样:`mcps.rs`(scan 函数)用 sourcePath 做 key
  - `types.rs:13-15` `id == sourcePath` 不变式
- **触发条件 (User does X)**:
  - 路径 a:用户在 Finder 中 rename 一个含中文/带音标 / emoji 的 skill 目录(如`「数学专家」/`);macOS Finder 输入时是 NFC(预组合字符),但 APFS 写盘是 NFD(分解形式)。新拷贝/移动操作可能保留 NFC(从 Linux scp / git checkout 来的目录)。
  - 路径 b:用户在 git 里 clone 一个 plugin marketplace repo (containing 含 Unicode 的 skill 目录),git 默认按 NFC 存储;macOS 上 git checkout 时根据 `core.precomposeUnicode` 配置可能保留 NFC 或转 NFD。
  - 路径 c:用户从 iCloud Drive 同步过来一个 skill;iCloud 内部用 NFC normalization,落到本地 APFS 可能是 NFC 或 NFD。
- **用户可见后果 (User sees Y)**:
  - 用户在 Ensemble UI 中给"「数学专家」" skill 设定 category 为"Productivity"——保存后 ✅;
  - 关闭/重启 Ensemble 或者切到 CategoryPage 再回来,**category 显示为 Uncategorized**;
  - 重新分类——保存——重启——还是 Uncategorized——loop forever。
  - 严重 case:Scene 引用该 skill 的 `skillIds[]`(也是 NFC sourcePath),sync 到 project 时 `find(&id)` 找不到 ⇒ silent skip ⇒ project 缺该 skill ⇒ Claude Code 不加载。
- **User does NOT see**: 任何"name 看起来一样但实际是两个不同 id 的 skill"提示。
- **不可见后果**:
  - **每次 scan_skills** 用 `skill_dir.to_string_lossy()`(line 281)从 OsStr 拿到当前磁盘字节(可能 NFD);
  - **metadata 在 data.json 里**是上次 scan 写入时的字节(可能 NFC,如果 skill 是从 git clone 来的);
  - 两者不等 → metadata_map.get(&id) 返回 None → metadata fallback 为 default(category=""、tags=[]、enabled=true),覆盖用户改动。
  - 也会导致 `existing_mcp_names`(`plugins.rs:662-663`)对 NFC/NFD 同名 plugin MCP 的对比假阳/假阴。
- **根因**: Rust `String` 比较是字节比较(没有 unicode normalization);macOS 文件系统层不保证一致的 normalization(HFS+ 强制 NFD,但 APFS 是 normalization-insensitive **但 normalization-preserving** —— `readdir` 返回的字节就是创建时的字节,可能 NFC 也可能 NFD)。Ensemble 全代码都用 `to_string_lossy` + 字节比较,没有 unicode normalize step。
- **建议修复**:
  1. 引入 `unicode-normalization` crate;在 scan_skills / scan_mcps / detect_existing_config 中 normalize 所有 path component 为 NFC(行业惯例),写盘前 normalize、读盘后 normalize 一致。
  2. Migration 一次性扫 `~/.ensemble/data.json`,对 skill_metadata / mcp_metadata 的 keys 跑 NFC normalize;重复 key 合并到最新 mtime 的。
  3. Acceptance:含中文的 skill 目录从 git checkout 后,sourcePath 与 metadata key 必须 byte-equal。
- **修复保守度**: Medium——normalization 整个项目要扫一遍,但都是单向(写时 normalize)就 OK。已存在 data.json 数据要 migration。
- **复核状态**: self-confirmed code-level,needs lead-agent verify 实际触发频率(取决于用户基数是否有 i18n 名字)

---

### F6. ~/.ensemble/data.json fs::write 非原子 + 无 backup,power loss / 磁盘满 = 整个 AppData 丢失

- **置信度**: High
- **严重度**: **P0**
- **代码位置**:
  - `src-tauri/src/commands/data.rs::write_app_data`(grep 找位置,典型在 ~270 行)
  - `src-tauri/src/commands/import.rs:65-66`(write_claude_json 同问题,在 F1 已列)
- **触发条件 (User does X)**:
  - 路径 a:用户在 Ensemble UI 中点 reorder categories / add scene / update_skill_metadata —— 触发 write_app_data —— 此时 macOS 进入 forced shutdown(电源故障 / kernel panic / 用户 hold 电源键)。
  - 路径 b:磁盘满(`~/.ensemble/` 所在分区 < 1MB free)— `fs::write` 写到一半 ENOSPC,中断,但已经 `truncate` 完文件。
  - 路径 c:用户的 `~/.ensemble/data.json` 在 Dropbox / iCloud Drive 同步路径中(用户自己改了 ENSEMBLE_DATA_DIR),同步器在 Ensemble 写到一半时**也**在读 → 同步器可能传输 partial → 跨设备 corruption。
- **用户可见后果 (User sees Y)**:
  - 重启 Ensemble → `read_app_data` 失败(parse error)→ 主 Agent 已查阅 C4: `read_app_data` parse fail propagate,missing default — 但**partial fs::write 后剩下半个文件**是 parse fail 路径(不是 missing);Ensemble 启动失败,前端 retry,**用户看不到 categories/tags/scenes 任何一项**。
- **User does NOT see**: "你的 data.json 损坏,这是上次启动的 backup,要恢复吗?" 之类的引导。
- **不可见后果**: 
  - 因为没有 backup rotate(grep 全代码无 `data.json.backup`),用户**只能从 Time Machine** 恢复——而 Time Machine 默认 ~/.ensemble 也可能被排除。
  - 用户的 categories 排序、scene 定义、project association、所有 skill_metadata/mcp_metadata 全失。
- **根因**: `write_app_data` 用 `fs::write(&data_path, json)`,不是 `tempfile + fsync + rename` 原子模式;无 N-roll backup rotation。data.json 是用户最重要的 single canonical state(CLAUDE.md 明示),保护级别应该最高。
- **建议修复**:
  1. Atomic write:写 `data.json.tmp` → `fsync` → `fs::rename("data.json.tmp", "data.json")`。POSIX rename 在同 FS 原子。
  2. N-rotate backup:每次 write 前 `fs::copy("data.json", "data.json.backup.<ts>")`,保留最近 5 份;启动时若主 file parse 失败,自动尝试加载最新 backup 并弹"使用 backup 启动了"提示。
  3. 同样 pattern 应用到 `~/.claude.json` 写入(F1)。
- **修复保守度**: Safe——原子 rename + rotate 是行业标准,无副作用。
- **复核状态**: needs lead-agent verify(确认 write_app_data 的实际实现位置和当前是否已有 atomic 保护)

---

### F7. ~/.claude.json 与 Claude Code 互写,#[serde(flatten) other: HashMap] 写时丢字段顺序导致 git diff 噪声 + 助攻 race

- **置信度**: High
- **严重度**: **P2**
- **代码位置**: `src-tauri/src/types.rs:639-640` `#[serde(flatten)] pub other: HashMap<String, serde_json::Value>`
- **触发条件 (User does X)**: 任何 Ensemble 写 `~/.claude.json` 的操作。
- **用户可见后果 (User sees Y)**: 用户在 `~` 目录跑 `git diff .claude.json`(假设用户把 home 跟踪到 dotfiles repo),会看到**整个 JSON 文件被 reorder** ——`numStartups` 跳到顶 / `theme` 跳到尾 / 顺序乱来——但实际只 toggle 了一个 MCP。
- **User does NOT see**: "Ensemble 只动了 mcpServers"这一明显事实。
- **不可见后果**:
  - 与 Claude Code 自己写入对比时,人眼难以辨别"是 Claude Code 写的 vs Ensemble 写的";加大 F1 lost-update 复现难度。
  - 用户 review 文件时看不出 Ensemble 写入对比 prior state 的真实 delta。
- **根因**: Rust `HashMap` iteration order 是非确定的(memory.md 已记录这个 trap)。`serde_json::to_string_pretty` 序列化 HashMap<String, Value> 时按 HashMap 迭代顺序输出。
- **建议修复**: 把 `other: HashMap<String, serde_json::Value>` 改成 `other: serde_json::Map<String, serde_json::Value>` (BTreeMap-backed,保持插入顺序 — 等同 IndexMap),或显式用 `indexmap::IndexMap`。
- **修复保守度**: Safe — `serde_json::Map` 是 stdlib 一等公民,序列化行为完全一致。
- **复核状态**: self-confirmed

---

### F8. reveal_in_finder 无 path sanitization,用户路径含 shell meta 字符时仍调 `open -R <path>`,且 `Command::spawn` 不等待 — 失败 silent

- **置信度**: High(safety 上 OK,UX 上有 silent fail 问题)
- **严重度**: **P2**
- **代码位置**: `src-tauri/src/commands/dialog.rs:23-32`
- **触发条件 (User does X)**:
  - 路径 a(safety):用户(或恶意 import 数据)传 path 为 `; rm -rf ~/Documents`。
  - 路径 b(UX):用户 reveal 一个已被外部删除 / 在 unmounted volume 上的 path,例如 sourcePath 是 `/Volumes/UserDrive/skill-foo/` 但 USB drive 已拔。
  - 路径 c:用户 reveal 一个 broken symlink。
- **用户可见后果 (User sees Y)**:
  - 路径 a:**安全**:`Command::new("open").arg("-R").arg(&path)` 用 argv 而非 shell,不会 expand metachar——这条**不是真问题**,但因为 launch_claude_for_folder 是 shell 注入面(R4 D1/D2 扫过),这里需要 explicit 确认 — 我**确认** dialog::reveal_in_finder 不受 R4 D1/D2 同类问题。
  - 路径 b/c:User 点 "Show in Finder" → 什么也没发生(`open -R` 在 path 不存在时 exit 非 0,但 `Command::spawn().map_err(...)` 只在 spawn 失败时返回 err,**进程退出码不查**);Ensemble 不弹任何提示。
- **User does NOT see**: "该路径不存在或所在卷未挂载"。
- **不可见后果**: 用户尝试多次后可能怀疑 Ensemble 坏掉,实际是路径已无效——而 sourcePath 在 data.json 里**仍存在**,无 self-healing。
- **根因**:
  1. shell injection 上**已 safe**(用 argv 不走 shell)——记录在此供 R4 cross-check。
  2. UX 上:`spawn()` 模式拿不到 exit code;改 `output()` 才有 stderr。
- **建议修复**:
  - 改 `.output()` 拿 exit code + stderr;exit != 0 时把 stderr 转成 user-facing toast。
  - 调用前先 `path.exists() || path.symlink_metadata().is_ok()` check;不存在则不 spawn,直接 IPC err 让前端显示"路径已失效"。
- **修复保守度**: Safe — output() 替换 spawn(),check existence。
- **复核状态**: self-confirmed

---

### F9. sync_project_config 写 .mcp.json + symlink 在不支持 symlink 的 FS(SMB / NFS / FAT32 / 某些 NAS)silent fail

- **置信度**: High
- **严重度**: **P1**
- **代码位置**: `src-tauri/src/commands/config.rs:77-118`(sync_project_config)+ 106-107(symlink call)
- **触发条件 (User does X)**: 用户 Scene 关联到一个 project,project path 在 NAS / SMB mount / 网络盘 / iCloud Drive 文件夹 / Time Machine 备份卷上;点击 "Sync"。
- **用户可见后果 (User sees Y)**:
  - SMB / NFS:`std::os::unix::fs::symlink` 调用通常 fail with `EOPNOTSUPP` 或 `EPERM` → IPC 返回 error → 前端显示 Rust error 字符串"Operation not supported";
  - iCloud Drive:symlink 创建似乎成功,但 iCloud 同步引擎可能 demote 它为占位文件或拒绝同步(macOS 14+ 行为不稳定)→ 用户在另一台 Mac 上打开同 project 看不到 skill;
  - FAT32 USB drive(罕见 project 场景):symlink 不被支持,fail。
- **User does NOT see**: "你的项目路径不支持 symlink,Ensemble 无法 sync skill。请用 copy 模式或换路径。"
- **不可见后果**:
  - Sync 部分完成(line 87 `create_dir_all` 已创建 `.claude/skills/`,line 100-112 第一个 symlink 失败时整体 abort,**但前面创建的目录留着**)。
  - `.mcp.json` 写入在 symlink 失败后也走 line 115(因为 `?` 抛上去后没走到 115)— 这点 OK,abort 是 early return。
  - 但 partial state(空 `.claude/skills/` dir + 无 `.mcp.json`)用户不知道,看到 sync 红字 error 后**已经污染了 project**。
- **根因**: 
  1. 无 pre-flight check FS 是否支持 symlink(macOS 上 `statfs` 可以查 fs type,但 Rust 标准库需要 nix crate)。
  2. 无 fallback 到 copy 模式(可选 sync 策略)。
  3. 错误 propagate 是 Rust error string,不是 user-actionable。
- **建议修复**:
  1. sync_project_config 加 pre-flight:试 `std::os::unix::fs::symlink("/dev/null", "<project>/.claude/skills/.ensemble-symlink-probe")`,失败 → 返回结构化 error `{kind: "FsDoesNotSupportSymlinks"}`,前端弹"项目位于不支持 symlink 的文件系统(NAS / 网络盘),建议改用本地路径"。
  2. 长期:增加 "copy mode" 设置,让用户在 NAS 上 sync 时改用 fs::copy(损失更新自动跟随,但能用)。
- **修复保守度**: Medium — pre-flight 探针安全;copy mode 是大改不必现做。
- **复核状态**: self-confirmed

---

### F10. ~/.claude.json 不存在但 Claude Code 还没第一次启动过时,Ensemble import 写入会创建空白文件,Claude Code 后续 init 行为未知

- **置信度**: Medium
- **严重度**: **P2**
- **代码位置**: `src-tauri/src/commands/import.rs:48-58`(read_claude_json default fallback)+ line 61-67(write_claude_json 无条件创建文件)
- **触发条件 (User does X)**:用户**先装了 Ensemble、还没装/启动过 Claude Code**(罕见但可能,因为 Ensemble 是 standalone app,marketing 强调"管理你的 Claude Code 配置"——用户可能先装 Ensemble 试试),然后:
  1. user 在 Ensemble UI 中 import 一个 marketplace MCP → finalize → 写入 `~/.claude.json::mcpServers` →
  2. user 启动 Claude Code 第一次 → Claude Code init 时若发现 `~/.claude.json` 已存在,可能跳过自己的 init logic 或 merge 出 unexpected state。
- **用户可见后果 (User sees Y)**: Claude Code 没正常初始化 `oauthAccount` / `numStartups` / `firstStartTime` 等字段——具体取决于 Claude Code 的 init merge 逻辑(我无法 verify Claude Code 源)。
- **User does NOT see**: 任何"Ensemble 创建了 ~/.claude.json,Claude Code 可能需要 reinit" 提示。
- **不可见后果**:
  - read_claude_json 当 path 不存在返回 `ClaudeJson::default()`(line 51-53),其后 mutate + write 会创建一个 minimal `~/.claude.json`,只有 mcpServers / projects 两个 key(+ flatten 的空 other)。
  - Claude Code 期望的字段(firstStartTime / oauthAccount / theme / numStartups …)全缺,需要 Claude Code 内部 default fill。
- **根因**: Ensemble 的 import 假设 `~/.claude.json` 由 Claude Code 拥有,但 fallback 允许在 Claude Code 缺席时仍创建文件。
- **建议修复**: write_claude_json 加守卫:若 `read_claude_json` 返回 default(原文件不存在),则**先 spawn Claude Code init**(若 `claude` CLI 存在) 或弹模态"建议先启动一次 Claude Code 完成初始化"。
- **修复保守度**: Risky — 介入 Claude Code 生命周期容易冲突;可能更稳的做法是"refuse to write if file doesn't exist + 弹 UI 模态"。
- **复核状态**: needs lead-agent verify(verify Claude Code 实际 init 行为)

---

### F11. lib.rs::run on_window_event hide-on-close + RunEvent::Reopen 在 second-instance --launch 时序竞争

- **置信度**: Medium
- **严重度**: **P2**
- **代码位置**: `src-tauri/src/lib.rs:15-22`(on_window_event hide-on-close)+ `lib.rs:55-71`(single_instance plugin emit second-instance-launch)+ `lib.rs:210-218`(RunEvent::Reopen on Dock click)
- **触发条件 (User does X)**:
  1. 用户启动 Ensemble,关闭窗口(进入隐藏状态,app 进程不退);
  2. 用户在 Finder 右键文件夹 → Quick Action → "Open with Ensemble";
  3. Quick Action 执行 `Ensemble --launch <path>` —— second-instance plugin fires →
  4. `app.get_webview_window("main")` 返回的是隐藏窗口 → `window.emit("second-instance-launch", path)` 触发前端但**窗口仍 hidden**;
  5. lib.rs:55-71 plugin handler 注释明确说"不调用 set_focus(),让前端决定是否需要显示窗口"——但前端 logic(`useFolderLaunch.ts` / `MainLayout.tsx`)是否 reliably show window?
- **用户可见后果 (User sees Y)**: User 点 Quick Action 后什么都没发生(窗口仍隐藏);Dock 上 Ensemble 图标可能闪一次也可能不闪;Cmd-Tab 切到 Ensemble 才发现窗口已经"路由"到 launch 目标。
- **User does NOT see**: 一个 reliable "Ensemble 已收到你的 Quick Action 请求"反馈。
- **不可见后果**: 在隐藏期 emit 的 event 前端**接得到吗**?Tauri 文档说 emit 是 fire-and-forget,接收方需要已 mount 监听器——若前端 listener 在 `useEffect` 中 attach,隐藏期 webview process 仍活,理论上能接到。但 race window 存在(emit 比 listener mount 早)。
- **根因**: Quick Action 路径下,backend 不主动 show window;依赖前端在收到 event 后自己 show。这条 chain 没有 explicit verify。
- **建议修复**: 
  1. lib.rs:55-71 改为 always `window.show()` + `window.set_focus()` 后再 emit(per Quick Action 业务语义,该 case 用户**明确**想看到 app);
  2. 加 ACK 机制:前端收到 event 后 emit "second-instance-ack",backend timeout 800ms 收不到则 force show + show 一个 fallback page("收到 Quick Action 请求,正在加载...")。
- **修复保守度**: Medium — show() 行为改变可能让"用户只想后台 sync"的场景被打断,但 Quick Action 默认应 user-facing。
- **复核状态**: needs lead-agent verify(verify 前端 useFolderLaunch.ts 现行 show 逻辑;可能这点已经在前端处理)

---

### F12. Spotlight / Time Machine / Dropbox 索引访问 ~/.ensemble/ 期间的 partial read

- **置信度**: Low(理论性强)
- **严重度**: **P3**
- **代码位置**: 所有 `read_app_data` / `write_app_data` 直接 read / write `data.json`
- **触发条件 (User does X)**: 用户的 `~/.ensemble/data.json` 被 Spotlight `mdimport` / Time Machine snapshot 进程 / 第三方 cloud sync (Dropbox / Google Drive) 持续打开读取期间,Ensemble 同时 `fs::write(.., truncate)`。
- **用户可见后果 (User sees Y)**: macOS 上一般无影响——APFS 的 read 是 COW snapshot,write `truncate` 创建新 inode,reader 读旧 inode。但若用户用过老 `tar` / `rsync` 工具持续 read,行为可能不一致(read 拿到 partial 新内容)。
- **User does NOT see**: 任何冲突警告。
- **不可见后果**: 一般 macOS 上 APFS COW 自动隔离,Ensemble 端不会 corrupt;但 Dropbox 同步引擎可能上传 partial 文件到云,跨设备拉到 corrupted data.json。
- **根因**: Ensemble 不假设 `~/.ensemble/data.json` 是私有(任何用户都可能把 ENSEMBLE_DATA_DIR 指向云同步目录)。
- **建议修复**: 文档明确建议 ENSEMBLE_DATA_DIR 不要指向 cloud-synced 目录;或检测云同步目录(`~/Dropbox`、`~/Library/CloudStorage/...`)在 init 时 warn user。
- **修复保守度**: Safe — 仅文档 / 检测 warn。
- **复核状态**: self-confirmed(low-impact)

---

## 总结

### 我个人最关注的 3 条(若用户只修这 3 条,影响最大):

1. **F1 — `~/.claude.json` 整文件 rewrite 与 Claude Code 并发写无任何锁 (P0)** —— 这是本审计最大的 P0 候选。Ensemble 自定位为"Claude Code 配置管理工具",但实际与 Claude Code **共享同一可变文件**且**无任何并发保护**。用户报"我的 ANTHROPIC_API_KEY 没了 / 我的 MCP 又消失了"的故事很多都可以归到这里。最低成本 fix:每次 write 前 `fs::copy` 到 backup,出问题用户能 recover。最稳 fix:atomic rename + mtime check。

2. **F6 — `~/.ensemble/data.json` fs::write 非原子 + 无 backup (P0)** —— Ensemble 自己的脊柱状态,power loss / 磁盘满即丢全。fix 极简(tempfile + rename + rotate 5 份 backup),收益极大。

3. **F2 — `~/.ensemble/` owner 错配 / 不可写时 silent fall back (P0)** —— 用户 sudo 启动过一次后,后续启动 silently 失败,categories 全空白,用户 panic 删 dir。可加 startup health check + actionable diagnostic 引导。修复成本低。

### 我觉得不必修的 0 条

R6 范围内没有"列出但建议不修"的 candidate;F8 (reveal_in_finder) 一开始我怀疑 shell injection 但 verify 后**安全**(用 argv 不走 shell),保留 finding 但只作为 UX 改进 P2。F12 (Spotlight/TM 索引) 是 Low/P3 — 理论性强、用户主动配置才会触发,不影响默认场景,可不修。

### 关键提醒给主 Agent

- **F1 + F6 配对修复**:`tempfile + atomic rename` 是同一个 pattern,可以一次实现一个 `atomic_write_json<T>(path, data) -> Result` helper 共用,无需各处重复实现。
- **F1 vs F10**: F10 是 F1 的特殊子集(claude.json 不存在时的行为);F1 fix 中可顺带 cover。
- **F4 + D3(已知)**:同一处硬编码,本 reviewer 把 D3 从 P3 调升到 P2 并具体化为 F4。
- **F5 (NFC/NFD)**:用户基数中是否真有中文 skill 名是个 empirical question;建议用户测试时刻意造一个含中文的 skill 试 reorder 看是否 silent reset。如果该 case 频繁,从 P1 → P0。
- **环境 bug 触发画像**:F1 / F6 在任何 macOS 上都可能;F2 需要用户曾用 sudo;F3 需要用户终端选错;F5 需要 i18n skill 名;F9 需要 NAS / iCloud project path。`02_known_risk_surfaces.md` 已知 candidate 都是**默认假设下**就能复现,本 review 补的是**非默认环境**的破坏。Ensemble 已经 ship 多版本,这些环境 bug 用户报过的可能性已经存在;主 Agent 若想验证 prevalence,可去 GitHub issues 搜"data.json gone / MCP gone / login lost"。
