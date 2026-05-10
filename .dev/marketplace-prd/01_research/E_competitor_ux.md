# 调研 E — 同类产品 Marketplace UX 模式（横向对比）

> **派单**：`.dev/marketplace-prd/01_research_plan.md` §3 E
> **范围**：4 款同类产品的 marketplace 集成 UX 模式横向对比 → 抽象出可移植到 Ensemble 的设计模式 ≥ 5 条
> **不做**：不写 Ensemble 应该长什么样（PRD 的事）；不画线框图；不照搬某一款产品的整套方案
> **产物用途**：作为 PRD 阶段"信息架构 / 关键交互 / 安装反馈 / 已安装状态"决策的 UX 弹药

---

## 章节速览

- §1 4 款产品基础形态速览（一句话定位 + 与 Ensemble 的关系）
- §2 9 个核心问题的横向回答
- §3 5-7 维度横向对比表
- §4 详细单产品 UX 节奏（每款 ≤ 80 行）
  - §4.1 Raycast Store
  - §4.2 Obsidian Community Plugins
  - §4.3 VSCode Extensions Marketplace
  - §4.4 Linear / Things 3（sidebar 设计参考）
- §5 对 Ensemble Marketplace UX 的可移植设计模式（≥ 5 条）
- §6 调研边界与未覆盖

---

## §1 4 款产品基础形态速览

| 产品 | 一句话定位 | 与 Ensemble 的关系 |
|---|---|---|
| **Raycast Store** | macOS-native launcher 的内置 extension 商店；in-app + web 双入口；keyboard-first | 最近邻：同样 macOS-only、Apple 风、insertion 而非全屏；Ensemble 与 Raycast 的设计语言同源（Apple HIG / 极简 / 物理级动效） |
| **Obsidian Community Plugins** | 笔记 App 的内置社区插件浏览器；sidebar 设置项进入 → modal 浏览 → 安装 → 启用分离；安全模式（Restricted Mode） | 数据模型最近邻：Skill / MCP 的"安装到本地路径 + 元数据登记"与 Obsidian plugin 的"装到 vault/.obsidian/plugins/"高度同构 |
| **VSCode Extensions Marketplace** | 开发者工具的内置 marketplace；Activity Bar 主入口；过滤词 `@installed` `@enabled` `@updates` 显式区分状态 | 信息架构最近邻：Sidebar 顶部独立分组 + List + Detail；过滤器系统比 Raycast / Obsidian 更工程化 |
| **Linear / Things 3** | 没有 marketplace；作为 sidebar 设计语言对标 | sidebar 顶部独立分组、克制的分隔、组与组之间的视觉间距（gap-based 而非 line-based）—— 这是用户原话"在 Skill 上面再加一个分隔线"是否字面理解的关键参考 |

---

## §2 9 个核心问题的横向回答

**Q1 macOS-native 桌面工具：Raycast Store 的发现 / 安装 / 管理 UX；Setapp 的 sidebar 入口模式**

- Raycast：双入口（in-app `Store` 命令 + web `raycast.com/store`）。in-app 是在 launcher 主窗口内打开 Store 命令、键盘 ↑↓ 选择、`⌘↵` 安装、`↵` 看详情；安装动作零模态（按下 `⌘↵` 后 Store 行就地变成 Installed，不弹窗、不进度条）。Web Store 用 `Install Extension` 按钮触发 `raycast://` 深链跳回 in-app 完成安装。
- Setapp：sidebar 顶部"Recommended / Discover / Recent"分组 + 各分组下平铺 App 卡片；安装动作是 `Open` 按钮（一键，App 已下载到 `/Applications/Setapp/`）。Setapp 的关键是：marketplace 与"已安装应用"在同一个 sidebar 中分组共存，不是两套页面。

**Q2 开发者工具：VSCode Extensions Marketplace 的页面结构、详情页元数据、一键安装提示**

- 入口：Activity Bar 左侧固定 icon（Extensions 视图），快捷键 `⇧⌘X`。点击后 Primary Sidebar 渲染搜索框 + 列表（默认显示 INSTALLED + RECOMMENDED 两组）。列表项展示：图标、name、publisher、download count、5 星评分、简短 description。
- 详情页：点击列表项后右侧 Editor 区打开 README + 元数据右栏（categories / tags / version / publisher / download / dependencies / Feature Contributions / Changelog / Extension Pack 子项）。
- 一键安装：列表项内 `Install` 按钮。安装完成后按钮变成 `Manage` 齿轮（uninstall / disable / disable-workspace / install-another-version / auto-update toggle 全在这一个齿轮里）。无进度条 / 无模态。安装后提示 `Restart Extensions` 重启 extension host（不重启整个 IDE）。
- 第三方发布者首装弹 trust dialog（VSCode 1.97+）。这是"破坏极简的合理代价"——安全 prompt 不能被纯 UX 简化掉。

**Q3 桌面笔记 / 知识工具：Obsidian Community Plugins 的 sidebar 入口、列表筛选、安装 / 启用分离**

- 入口：Settings（齿轮）→ Settings 弹窗内左栏 "Community plugins" 项 → 主区显示 Restricted Mode 警告 + Browse 按钮。**没有专属 sidebar Marketplace 入口**——marketplace 在 Settings 内深一层。
- Restricted Mode：默认开（任何 community plugin 不可运行）。用户必须显式 `Turn on community plugins` 才能进入 Browse。这是 macOS-style "explicit consent over implicit permission"。
- Browse 后 modal 内列表（筛选：popular / new / by-name；搜索框）。详情面板含 README + repo 链接 + Install 按钮。
- 关键模式：**安装 ≠ 启用**。点击 Install 后，plugin 文件下载到 `vault/.obsidian/plugins/<plugin-name>/`，但**不自动 enable**。回到 Settings → Community plugins 主页有"Installed plugins"列表，每项一个 toggle，用户必须显式 toggle ON 才让 plugin 实际运行。这种"download → enable"两步分离模式与 VSCode `@disabled` 是同构的，但 VSCode 默认安装即启用，Obsidian 默认安装不启用——更保守。

**Q4 设计参考：Linear 的 sidebar 分组方式、Things 3 的极简密度对比**

- **Linear sidebar 分组**：自上而下 `Inbox / My issues / Pulse / Reviews / Favorites（用户加 star 后才出现）/ Workspace（含 Teams、Customers、Views、Initiatives 等链接）/ Your Teams（按 team 名分组，每组下 issue / project / cycle 等子项）`。分组之间**用空行 gap 而非 hairline divider**。组标题（Workspace / Your Teams）uppercase 11-12 px 灰色，与组内项形成视觉层级。Linear 2024-12 changelog 明确："you can reorder items, hide items you don't use often"——分组本身是可定制的。
- **Things 3 sidebar**：自上而下 `Inbox / Today / Upcoming / Anytime / Someday / Logbook（Trash）/ Areas（用户自定义）/ Projects（嵌套在 Areas 下）`。**没有显式 hairline divider**——所有分组通过"组与组之间的空行间距 + 组内极小行距"形成视觉对比。事实证据：Things 3 用户社区讨论 "There's no way of visually distinguishing areas in the sidebar, which is why I have created two fake areas which are just dividers"——即用户把空名 area 当 divider 用，证明 Things 3 自身不提供 hairline divider，分组靠 gap。
- **共同语言**：Linear / Things 3 均靠 **gap + uppercase section header**（不是 1px 横线）实现分组。这与 Apple Music / Apple Notes / Finder sidebar 的语言一致。

**Q5 ★ 这些产品如何处理"已安装 vs 未安装"状态在同一列表中的视觉区分？**

| 产品 | 已安装 vs 未安装的视觉区分方式 |
|---|---|
| **Raycast** | Store 列表在 in-app Store 命令中可同时呈现 popular / recently-added / installed extensions；列表项右侧 accessory 区放 `Installed` 灰色文字 / 已安装项 enter 不再触发安装而是进入命令；in-app Store 列表中 installed 与未安装混排，靠右侧文字区分。Web Store 的列表项点击后看详情，按钮文案在已安装时变 `Open Extension` |
| **Obsidian** | 严格的"两个不同列表"分离：Settings → Community plugins 主页只显示 **Installed plugins**（每项带 toggle）；Browse modal 内只显示 **未安装 plugins**（每项带 Install 按钮）。Browse 中如果 plugin 已安装，按钮变成 `Installed` 灰态，且无 toggle（toggle 在主页处理） |
| **VSCode** | 同一 Extensions 视图通过过滤词 `@installed` / `@disabled` / `@enabled` / `@updates` 切换。默认视图把已安装的 INSTALLED 组放顶部、RECOMMENDED 组放底部。已安装项的按钮变成 `Manage` 齿轮（包 disable / uninstall / install-another-version）。**关键**：同一列表，分组通过 group header 而非两个页面区分 |
| **Linear / Things 3** | 不适用（无 marketplace） |

**结论**：三种模式可选——
1. 同一列表 + 分组 + 状态文字 / 按钮变态（VSCode、Raycast in-app）
2. 严格分离两个列表 / 两个页面（Obsidian）
3. 仅按钮变态、不分组（Web Store 风格）

Ensemble 的事实约束是：**已安装的 Skill 已经在 SkillsPage 列表里了，Marketplace 列表不需要重新展示已安装项；但需要让用户在 Marketplace 列表上一眼看到"哪些我已经装过"，避免重复点击 Install 触发"已存在"错误**。这暗示模式 1（同一列表 + 状态变态）或弱化版的模式 3（按钮变态）最契合。

**Q6 这些产品的"详情页"展示什么内容？描述长度、截图、版本、作者、用户评价**

| 产品 | 详情页元数据 | 详情面板渲染位置 |
|---|---|---|
| **Raycast** | README markdown + 右侧 metadata 面板（categories / tags / commands list / author + avatar / install count / last updated）。Detail API 文档证实右侧 metadata panel 支持 labels / 彩色 tags / links / separators 四种 item 类型 | 右侧 Detail Panel |
| **Obsidian** | README + repo URL + Install / Uninstall 按钮 + (如已 enable) Settings link | Modal 内右栏 |
| **VSCode** | README（README.md 直接渲染）+ 元数据右栏（identifier、version、publisher、release-date、categories、tags、download count、rating、Feature Contributions list、Changelog tab、Dependencies、Extension Pack 子项列表）+ Install button + Manage gear（已装时） | Editor 区（不是 sidebar）打开标签页式 |

**共同模式**：左 README（产品描述长文）+ 右元数据（结构化字段）+ 顶部 Install / Manage 按钮。元数据字段集合相对稳定：**作者 / 版本 / 描述 / 分类 / 下载量（或安装数）/ 提供的命令 / 链接 / 更新时间**。用户评价（star rating）只有 VSCode 显示，Raycast / Obsidian 都没有——评分系统是商增重区域。

**Q7 ★ 一键安装的反馈：是否有进度条？模态？默认在哪儿写入？怎么处理失败？**

| 产品 | 安装反馈形态 |
|---|---|
| **Raycast** | 零模态。Store 行就地变成 Installed；in-app 顶部偶尔显示 spinner 圈但不强调；失败时一行红色 banner 提示 + 重试按钮。安装写入 `~/Library/Application Support/com.raycast.macos/extensions/<name>/` |
| **Obsidian** | 安装阶段：modal 内按钮文案 `Install` → `Installing...`（无百分比进度）→ `Installed`。完成后用户回主 Settings 页手动 toggle ON。失败：modal 内红字提示 |
| **VSCode** | Install 按钮文案变化（`Install` → `Installing` → `Manage`）+ 整个 IDE 右下角 toast `Restart Extensions` 提示。失败时弹出 `Cannot install extension because Visual Studio Code cannot verify the extension signature` 或 timeout 错误对话框 |
| **Linear / Things 3** | 不适用 |

**共同模式**：
- **优先就地按钮变态**（Install → Installing → Installed），而非弹模态
- **失败用 toast / banner / dialog**——失败必须显式可见，但成功是默静默
- **进度条只在确实长任务时出现**（Obsidian 有时显示百分比因为 plugin 包可能 MB 级；Raycast extension 通常 < 100 KB 安装秒完）
- **安装目标路径不向用户透露**（Raycast 没说装在哪，Obsidian 也没；用户心智模型是"装到这个 App 内部"）

对 Ensemble 的事实启示：Skill / MCP 安装应当**优先就地按钮变态**，**避免新弹一个 ImportXxxModal 的体量**——A 调研 §10 N5 已经标注 ImportSkillsModal 只支持 Detecting / Importing / Done 三态，没有进度条；marketplace 安装可以**不进度条、不模态、就在详情面板内 Install 按钮就地变态**，与 Raycast / VSCode 的做法对齐。

**Q8 离线 / 网络故障的降级**

- **Raycast**：in-app Store 离线时显示空状态 + 重试按钮。已安装的 extensions 不受影响。
- **Obsidian**：Browse modal 离线时显示 "Could not load community plugins" + 重试。Restricted Mode 的安全提示与离线无关。
- **VSCode**：Extensions 视图离线时只显示 INSTALLED 组（已缓存），RECOMMENDED 组消失或显示 "Could not connect to Marketplace"。`code --install-extension` CLI 离线必失败。
- **Linear / Things 3**：不适用。

**共同模式**：离线降级 = "已安装项不受影响 + marketplace 列表显示 Empty State + 重试按钮"。这与 Ensemble 的 `<EmptyState>` 组件天然契合（A §2.4）。

**Q9 ★ "Marketplace" 入口在 sidebar 中的位置 — 与本任务的字面要求"在 Skill 上面再加一个分隔线"的契合度**

| 产品 | Marketplace 入口在 sidebar 中的位置 | 与 Ensemble 的契合度 |
|---|---|---|
| **Raycast** | **没有 sidebar marketplace**——通过 Store 命令进入（与其他命令同级在 Root Search 中）。这是 launcher 形态决定的，与 Ensemble 的 sidebar 形态不可类比 | 不契合（形态不同） |
| **Obsidian** | **没有 sidebar marketplace**——marketplace 在 Settings → Community plugins 内。Settings 是 modal 而非 sidebar item | 不契合（marketplace 深一层） |
| **VSCode** | Activity Bar 左侧 **第三个固定 icon**（Files / Search / Source Control / **Run & Debug** / **Extensions**）。Extensions 与 Files / Search 同级，是 sidebar 顶层入口 | **强契合**——VSCode 的 Activity Bar = Ensemble 的 sidebar Navigation 段。把 "Skill Marketplace" / "MCP Marketplace" 加到 Ensemble sidebar 顶部独立分组，与 VSCode 把 Extensions 加到 Activity Bar 的做法同构 |
| **Linear sidebar 分组语言** | sidebar 自上而下分组：`Inbox / My issues / ... / Workspace / Your Teams`，**组与组之间用空行 gap 而非 1px hairline**。组标题 uppercase 灰色 | **强契合**——Ensemble 现有 sidebar 已使用 uppercase 10 px 段标题（CATEGORIES / TAGS）+ Divider hairline。Marketplace 分组可以在 Header 与 Navigation 之间插入，**保留现有 Divider 形态**（Ensemble 的 Sidebar.tsx 现在已有 Divider 在 Navigation 与 CATEGORIES 之间） |
| **Things 3 sidebar 分组语言** | 自上而下分组：`Inbox / Today / Upcoming / Anytime / Someday / Logbook / Areas...`，**完全靠 gap，无 hairline**。社区证据：Things 3 没有 divider，用户用空 area 自造 divider 解决 | 提供反例：极致极简下可以省 hairline，靠 gap + 字体重量区分。但 Ensemble 现有 sidebar 已存在 hairline divider 模式（A §2.2 显示），无需改变 |

**字面要求"在 Skill 上面再加一个分隔线"的解读**：

- 用户原话明确是"加一个分隔线"——Ensemble 现有 sidebar.tsx 已经在 Navigation 与 CATEGORIES 之间、CATEGORIES 与 TAGS 之间使用 hairline divider（borderTop `#E5E5E5`，A §2.2）。沿用这个语言、在 Header 与 Navigation 之间增加同款 divider + 在 divider 上方放 Marketplace 分组，是**对现有 sidebar 语言最忠实的延伸**。
- VSCode Activity Bar 的"顶部独立分组"模式是字面要求的产品级先例（"Extensions 与 Files / Search 同级在顶部独立分组")。
- Linear 的 gap-based 分组是反例：如果 Ensemble 决定"不用 hairline 而用 gap"，那 sidebar 全局都得改，是更大改动。**保留现有 hairline + 新增顶部 Marketplace 分组**，是商减最优解。

---

## §3 横向对比表（5-7 维度）

| 维度 | Raycast Store | Obsidian Community Plugins | VSCode Extensions | Linear / Things 3 (sidebar 参考) |
|---|---|---|---|---|
| **入口位置** | in-app `Store` 命令（与其他命令并列）+ web | Settings → Community plugins（深一层） | Activity Bar 顶部固定 icon（与 Files / Search 同级） | sidebar 顶部独立分组（gap 分隔） |
| **已安装 vs 未安装区分** | 同一列表、右侧文字 + 按钮文案变化 | 严格两个列表（Installed 在主页、未装在 Browse modal） | 同一视图、`@installed` 过滤词 + INSTALLED / RECOMMENDED 组分组 | n/a |
| **详情页位置** | 右侧 Detail Panel（README + 右栏 metadata） | Modal 内（README + Install 按钮 + repo link） | Editor 区标签页（README + 右栏 metadata） | n/a |
| **一键安装反馈** | 零模态、就地按钮变态、失败 banner | 按钮 `Install` → `Installing...` → `Installed`，安装后需手动 enable | 按钮 `Install` → `Manage`，需 `Restart Extensions` | n/a |
| **安装 vs 启用** | 一步（装即用） | **两步**（download + enable 分离），默认安装不启用 | 一步默认（装即启用），可后续 `@disabled` | n/a |
| **离线降级** | EmptyState + Retry；已装项不受影响 | "Could not load" + Retry | 仅 INSTALLED 组、RECOMMENDED 组消失 | n/a |
| **sidebar 分组语言** | n/a（无 sidebar） | n/a | Activity Bar：固定 icon、点击切 Primary Sidebar | uppercase 段标题 + gap（Linear 用 gap，Things 3 完全靠 gap） |
| **与 Ensemble 设计语言契合度** | **高**（macOS-native、键盘 first、零模态、Apple 风） | 中（modal 较重、但 download/enable 分离对 Skill 启用模型有启发） | **高**（信息架构最近邻、Activity Bar = Ensemble sidebar 顶部分组的产品级先例） | **高**（sidebar 分组的最终美学锚点） |

**对比表读法说明**：上表用作 PRD / Synthesis 决策时的"模式来源 vs 设计语言契合度"快速参考——列代表产品，行代表 9 个核心问题中提取出的最有产品意义的 8 个维度。某一维度上多款产品给出同向答案时，该模式可信度高（如"详情页位置 = 详情面板 + Install 按钮"在 3 款都成立）；不同向时（如"安装 vs 启用"中 Obsidian 两步、其他一步），需在 PRD 阶段做单独决策。

---

## §4 详细单产品 UX 节奏

### §4.1 Raycast Store

**入口形态**：双入口对称——
- **In-app**：Raycast 主窗（一个浮在屏幕中央的 launcher 窗口，~ 750×500 px）打开后输入 `Store`，或 `⌘+,` Settings 内 Extensions tab。Store 命令本身就是一条 command，与其他 130+ built-in command 同级。
- **Web**：`raycast.com/store`，用 `⌘K` 快捷搜索。Install 按钮触发 `raycast://` 深链，跳回 in-app 完成安装。

**列表节奏**：
- 顶部分类按钮组（All / Recent / Popular / Recently Added 四个 tab）
- 列表项：图标（32×32）+ name（粗）+ description（细）+ 右侧 author avatar + commands count + install count
- 视觉密度极高（一屏 12-15 项），keyboard-first（↑↓ 选择、`↵` 详情、`⌘↵` 直接安装）
- 列表项右侧的 install count 是 social proof，非评分

**详情节奏**：
- 左 README markdown + 右 metadata panel（labels / tags / links / separators 四种 item type，对应 categories / tags / repo link / 分割线）
- 不展示用户评价、不展示截图（README 内可以有但不强制）
- 评论 / 评分系统不存在——这是 Raycast 团队的明确选择（避免商增）

**安装反馈**：
- 选择某 extension → `⌘↵` → 行就地变 Installed → 不弹任何模态
- 安装失败 → 顶部 banner 红色短文 + Retry
- 安装目标 `~/Library/Application Support/com.raycast.macos/extensions/<id>/`，不向用户透露

**Raycast 设计语言切片**（与 Ensemble 同源的可观察证据）：
- 主窗口宽度固定（~ 750 px），高度按内容自适应；列表项行高约 40-44 px，与 Ensemble SkillListItem 容器 `px-5 py-4`（约 56 px 行高）同量级
- 列表项无悬浮 grab cursor（macOS-native 拒绝装饰性 affordance，与 Ensemble design-language 同语言）
- macOS 13+ only（与 Ensemble macOS-only 同分布）
- 字体使用 `-apple-system`（San Francisco），与 Ensemble Font fallback chain 一致（design-language Constraints / macOS-native 节）

**对 Ensemble 启示**：零模态 + 就地按钮变态是 Ensemble 应当沿用的"安装反馈"模式。Raycast 的"评分系统不存在"是**商减的产品级证据**——不需要为"完整性"加评分。Raycast 主窗口是浮空 launcher 形态，Ensemble 是固定窗口管理工具——形态差异决定 Ensemble 不能直接复制 Raycast 的"in-app Store 命令"模式，应改用 sidebar 顶部分组入口（参见 §5 模式 1）。

### §4.2 Obsidian Community Plugins

**入口节奏**：
- Settings 入口（`⌘,` 或左下齿轮）→ Settings modal（Obsidian 整个 modal 大约 90% 全屏）
- 左栏 nav items：Editor / Files & Links / **Community plugins** / Hotkeys / About / etc
- 选中 Community plugins → 主区显示三块：
  1. **Restricted Mode warning**（红色背景框 + Turn on community plugins 按钮）—— 用户必须显式同意才能装
  2. **Installed plugins** 列表（每项带 toggle ON/OFF + 齿轮设置 + 卸载按钮）
  3. **Browse 按钮** —— 点击打开 Browse modal

**Browse modal 节奏**：
- Modal 内顶部：搜索框 + 排序（popular / new / by-name）
- 列表：每项图标 + name + author + description + Install 按钮 + download count
- 点击列表项 → modal 内详情视图（README + Install / Installed 按钮 + repo link / report-issue link）

**安装 / 启用分离机制**（这是 Obsidian 的核心 UX 决策）：
- 在 Browse modal 内点 Install → 按钮变 `Installing...` → 完成变 `Installed` 灰态（不可重复点）
- 关闭 Browse modal、回到 Community plugins 主页 → Installed plugins 列表多了一项，但 toggle 是 OFF
- 用户必须显式 toggle ON 才让 plugin 实际加载并运行
- toggle ON 后才出现"齿轮 Settings"入口（plugin 内部设置）

**为什么分离**：安全。一个 community plugin 拥有完整的 Node API 访问，可以读写文件系统、网络请求。"装即跑"语义上等同于"任意 git clone + npm install + 立即执行任意代码"。分离后，"装"只是把代码下载到 `vault/.obsidian/plugins/<name>/`，"启用"才是允许运行。这与 macOS 的 "Open" / "Open Anyway" 在 Gatekeeper 中的二段确认是同构思想。

**安装目标路径**（事实记录）：`vault/.obsidian/plugins/<plugin-id>/`，每个 plugin 一个子目录，含 `main.js` / `manifest.json` / `styles.css` / `data.json`。这与 Ensemble 的 `~/.ensemble/skills/{name}/` 结构（A §5）几乎完全同构——都是"每资源一子目录、扁平在统一管理目录下"。Ensemble 的安装路径设计已经领先 Obsidian（Skill 与 MCP 分目录管理而非混排）。

**Browse modal 反例细节**：用户点 Settings 齿轮 → modal A 打开 → modal A 内点 Browse 按钮 → modal B 打开（覆盖在 modal A 上）→ modal B 内点列表项 → modal B 内切换到详情视图（不是 modal C 但视图切换覆盖原列表）。这是**4 层视觉栈**（Obsidian 主窗 + Settings modal + Browse modal + 详情视图），Obsidian 用户社区中关于 modal 嵌套深度的吐槽常态化。

**对 Ensemble 启示**：
- Ensemble 的 Skill 不会执行任意代码（仅 Markdown 文档），MCP 才会执行（spawn 子进程或 HTTP 调用）。**MCP 安装是否需要类似"download + enable 分离"是 PRD 决策点**——但 Skill 不需要。
- Browse modal 形态本身是反面教材：modal 内嵌列表是双层堆叠（modal 上又嵌 modal 详情），违反 Ensemble design-language "Visual hierarchy ≤ 3 layers" 约束。Ensemble 应使用**全页 Marketplace + SlidePanel 详情**（与 SkillsPage 完全同构），不学 Obsidian 的 modal-on-modal。
- Restricted Mode 的"显式 consent"思想可在 Ensemble 中弱化复用：当用户首次进入 MCP Marketplace 时，**可在页面顶部 banner 提示"安装 MCP 会运行外部进程；已自动选择安全源（如官方 registry）"**——但不阻断动作，仅提示。这是商减语境下的"知情但不强迫"。

### §4.3 VSCode Extensions Marketplace

**入口节奏**：
- Activity Bar（VSCode 最左侧 ~ 48 px 宽固定栏）展示固定 icons：Files / Search / Source Control / Run & Debug / **Extensions** / 用户加的其他 view container
- 点 Extensions icon → Primary Sidebar（左侧 ~ 250-300 px 宽）展示 Extensions 视图
- Extensions 视图顶部：搜索框（支持 `@installed` / `@enabled` / `@disabled` / `@updates` 等过滤词）
- 默认列表：INSTALLED 组（折叠头）+ RECOMMENDED 组（折叠头）

**列表项**：
- 图标 + name + publisher + version + Install 按钮（或 Manage 齿轮）
- 第二行：description（一行省略号截断）
- 第三行（可选）：download count / rating

**详情节奏**：
- 点列表项 → Editor 区（VSCode 中央代码编辑区）打开新标签页
- 标签页内容：README 主区 + 右栏 metadata（identifier / version / publisher / release-date / categories / tags / download count / rating）+ tabs（Feature Contributions / Changelog / Dependencies）
- Install 按钮在标签页顶部

**已安装项的状态切换**：
- Install 按钮 → `Installing` → 完成后变 **Manage 齿轮**
- Manage 齿轮 dropdown：`Disable` / `Disable (Workspace)` / `Uninstall` / `Install Another Version` / `Auto Update toggle` / `Extension Settings`
- 安装后下方 toast `Restart Extensions` 提示重启 extension host（不重启整个 IDE）
- `@updates` 过滤词查看可升级 extension

**过滤词系统**（VSCode 独有的工程化方案）：
- `@installed` 已安装、`@enabled` 启用、`@disabled` 禁用、`@updates` 可升级、`@builtin` 内置、`@featured` 推荐、`@popular` 流行、`@recentlyPublished` 新发布、`@workspaceUnsupported` 不支持当前 workspace
- 还可与 category / tag 组合：`@installed @category:themes`

**对 Ensemble 启示**：
- **Activity Bar 顶部固定 icon = Ensemble sidebar 顶部独立分组的最强产品级先例**。两者形态高度同构（都是侧栏顶部入口、点击进入对应内容区）。
- 详情页打开"标签页"是 VSCode 的 IDE 形态决定的（VSCode 中央就是 editor，开标签页天然），不适合 Ensemble（Ensemble 中央是 list+SlidePanel，A §1.4）。Ensemble 应当走**SlidePanel 详情 + 全页列表**模式，不学 VSCode 的标签页。
- 过滤词系统是工程师向产品；Ensemble 的目标用户与 VSCode 用户重合度高，**简化版的过滤系统（搜索 + 1-2 个分组下拉）值得借鉴**，但不必复刻 `@`-prefix 的命令式过滤。
- Manage 齿轮 dropdown 把 disable / uninstall / install-another-version / settings 全收纳，是**已安装项的"少 = 多"实践**。Ensemble 现有 SkillListItem 的 More menu 已经是同形态（A §3.1），可以直接沿用。
- VSCode "extension signature verification" 失败时弹 dialog 阻断安装——Ensemble 的安装失败处理可以更轻：用顶部 error banner（SkillsPage 现有，A §1.1）+ Retry 按钮，不阻断用户其他操作。
- VSCode 的 `Restart Extensions` 提示是 IDE 形态决定的（extension host 进程隔离）；Ensemble 的 Skill 是 Markdown 文件、MCP 是配置 JSON，安装后无需重启——Skill 安装后 `loadSkills()` 重扫即生效（A §4.4），MCP 安装后下次 Claude Code 启动生效。这是 Ensemble 比 VSCode 更轻的事实优势，应在 PRD 阶段强调。

### §4.4 Linear / Things 3（sidebar 设计参考）

**Linear sidebar 自上而下结构**：
- **Header 区**：workspace name + avatar + dropdown
- **Workspace section**：Inbox / My issues / Pulse / Reviews / Customers / Initiatives / Projects / Views（默认收起在 More 内）
- **Favorites**（用户加 star 后才出现）
- **Your Teams**（每个 team 一个折叠组，组内 issue / project / cycle 等子项）

**分组语言**：
- 组之间空行 gap（约 12-16 px）
- 组标题 uppercase 11-12 px 灰色
- **没有 hairline divider**——纯靠 gap + 字体颜色 / 重量区分
- 2024-12 changelog："right-click on a specific item to update it or select Customize sidebar to show all options. You can also drag & drop to reorder items"——分组本身是用户可定制的

**Things 3 sidebar 自上而下**：
- **Header 区**：avatar + workspace name
- **Default lists**：Inbox / Today / Upcoming / Anytime / Someday / Logbook（不可重排、不可重命名、不可删除）
- **Trash**（特殊位置）
- **Areas**（用户自定义，每个 Area 下嵌套 Projects）

**分组语言**：
- 完全靠 gap（无 hairline divider）
- 用户社区证据（johnny.chadda.se）："There's no way of visually distinguishing areas in the sidebar, which is why I have created two fake areas which are just dividers"——证明 Things 3 不提供 divider 是设计选择，用户用空名 area 自造 divider 是 workaround

**Linear 与 Things 3 的共同语言**：
- 顶部分组是固定 default 项（Inbox 类全局视图），底部分组是用户自定义（Teams / Areas）
- 段落之间用 gap 与 uppercase 标题区分；不用 line
- 这与 Apple Music / Apple Notes / Finder sidebar（macOS Finder sidebar 也是 gap-based 分组：Favorites / Locations / Tags 之间靠 uppercase + gap）完全一致

**对 Ensemble 启示**：
- Ensemble 现有 sidebar 已使用 uppercase 段标题（CATEGORIES / TAGS）+ hairline divider（A §2.2 中明确）。这是**Ensemble-particular**的设计选择，与 Linear / Things 3 略有偏差但不违反 macOS-native（Finder sidebar 也是 gap，但 Ensemble sidebar 现状是 line）。
- 用户原话"加一个分隔线"明确是 line 模式——**沿用 Ensemble 现有 sidebar 的 hairline divider 语言、新增顶部 Marketplace 分组**，是字面契合 + 商减最优。
- 顶部"固定 default 项"（Inbox / Skills / MCPs）+ 中部"用户自定义内容"（Categories / Tags）的层级，是 Linear / Things 3 共同验证过的信息架构。Ensemble 把 Marketplace 放在顶部"固定 default 项"之上是合理的——marketplace 是"系统级入口"，与 Inbox / Today 同级。
- Linear 的"sidebar 可定制（拖拽重排、隐藏次要项）"在 Ensemble V1 不必复制——Ensemble 用户群规模小、配置简单，sidebar 项数少（< 10 项），定制收益低于商减成本。但**保留可定制空间**（数据模型不写死顺序）是低成本未来选项。
- Things 3 的"default 列表不可重命名 / 不可重排"对 Ensemble 顶部 Marketplace 分组也适用——Marketplace 顶部分组本身不应被用户隐藏 / 重排，保证入口稳定性。

**Sidebar 入口字面 vs 美学权衡**（综合 Q9 + §4.4）：

| 选项 | 字面契合度 | 美学契合度（macOS-native） | 实施成本 |
|---|---|---|---|
| (A) 在 Header 与 Navigation 之间加 hairline divider + 顶部 Marketplace 分组（uppercase 段标题 + 2 nav items） | **高**（用户原话"加一个分隔线" + Ensemble 现有 sidebar 已用 hairline） | 中（hairline 比 gap 略重，但 Finder 也有 line-based 分组的先例） | 低 |
| (B) 用 gap 替代 hairline、整个 sidebar 改为 Linear / Things 3 风格 | 低（违反字面要求"加一个分隔线"） | 高 | 高（牵动 sidebar 所有分组重写） |
| (C) Marketplace 作为 Navigation 内的两个并列项（与 Skills / MCP Servers 同级，不顶部分组） | 中（仍然在 Skills 上方，但没有"分隔线"） | 中 | 极低 |

**结论倾向**：选项 (A) 字面 + 实施成本最优，是 Ensemble 应当走的路径。本调研不下决策（PRD 决策权）；但提供事实证据让 D-1 决策容易。

---

## §5 对 Ensemble Marketplace UX 的可移植设计模式（≥ 5 条）

每条注明：(a) 模式名 (b) 源产品 (c) 适用 Ensemble 的理由 (d) 与 Ensemble design-language 的兼容性。

### 模式 1：Sidebar 顶部独立分组作为 Marketplace 入口

- **(a) 模式名**：Top-of-sidebar Marketplace section（顶部独立分组入口）
- **(b) 源产品**：VSCode Activity Bar（Extensions 与 Files / Search 同级）+ Linear / Things 3 sidebar 顶部分组语言
- **(c) 适用 Ensemble 的理由**：
  - 用户字面要求"在 Skill 上面再加一个分隔线"——VSCode Activity Bar 把 Extensions 作为顶部 sidebar item 是这一字面要求的产品级先例
  - Ensemble 现有 sidebar.tsx 已有 hairline divider（Navigation 与 CATEGORIES 之间、CATEGORIES 与 TAGS 之间），新增 Header 与 Navigation 之间的 divider 同款，零新视觉语言
  - Marketplace 是"系统级入口"，与 Skills / MCP Servers 同级或更上一层是 Linear / Things 3 共同验证过的"顶部 default 项"模式
- **(d) 设计语言兼容性**：**完全兼容**。沿用现有 sidebar 的 hairline divider 模式 + uppercase 10 px 段标题（如 "MARKETPLACE"）+ 列表项 gap-2 间距即可。不引入新 token、不引入新分组形态

### 模式 2：就地按钮状态机替代模态进度

- **(a) 模式名**：In-place install button state machine（按钮文案三态：Install → Installing → Installed/Manage）
- **(b) 源产品**：Raycast（零模态、Install → Installed 行就地变态）+ VSCode（Install → Manage 齿轮）+ Obsidian（Install → Installing → Installed）
- **(c) 适用 Ensemble 的理由**：
  - A §10 N5 已识别现有 ImportSkillsModal 不支持单项进度反馈；marketplace 安装如果新建一个进度 Modal 是商增（增加 Modal 数量、增加 visual hierarchy 层级）
  - Ensemble 现有 `<Button>` 组件已支持 4 variant × 3 size + `disabled` 态（A §9）；按钮文案就地变态是零新组件、零新动效
  - 与 Raycast 零模态 / Apple HIG"成功默静默"思想一致；失败时用 EmptyState 或顶部 error banner（已有 SkillsPage 错误条机制，A §1.1）
- **(d) 设计语言兼容性**：**完全兼容**。文案变化使用 250 ms cubic-bezier（与 SkillListItem bg 切换同节奏，A §3.1），无新动效。按钮 disabled 态使用现有 zinc-500 灰态。不引入新 spinner / 新 progress bar

### 模式 3：详情页就地操作而非"安装是另一个流程"

- **(a) 模式名**：Detail-as-action surface（详情面板内嵌 Install 按钮 + 元数据 + README）
- **(b) 源产品**：Raycast Detail Panel（左 README + 右 metadata + 顶部 Install）+ VSCode Editor 区标签页详情
- **(c) 适用 Ensemble 的理由**：
  - Ensemble SkillsPage 已使用 `<SlidePanel width={800}>` 渲染详情（A §1.1）；Marketplace 详情应**完全沿用此 SlidePanel** —— 用户从列表点击 → SlidePanel 滑入 → 顶部 Install 按钮 + 中区 README + 底区元数据
  - 不新建 Modal、不新建标签页、不新建第二种详情形态
  - 与 Raycast Detail API 的"右侧 metadata panel + labels / tags / links / separators"形态高度同构——Ensemble 已有 `<Badge>` / `<CategoryTreeDropdown>` / `<Tooltip>` 全可用
- **(d) 设计语言兼容性**：**完全兼容**。SlidePanel + IconPicker + Badge + Button 全是现有组件；250 ms 滑入动效无新增。Visual hierarchy 保持 3 层（Page → List + SlidePanel → 详情内容）

### 模式 4：已安装态在列表中以"按钮变态 + 灰色文字"区分（不再两个页面）

- **(a) 模式名**：Single-list with installed-state affordance（同一列表混排已装与未装，按钮文案区分）
- **(b) 源产品**：VSCode INSTALLED / RECOMMENDED 同视图分组 + Raycast in-app Store installed 灰文字标识；反例：Obsidian 严格两个列表（违反极简）
- **(c) 适用 Ensemble 的理由**：
  - Ensemble 已经有 SkillsPage 列表（已装 Skill 的归宿），Marketplace 列表的角色是"未装 Skill 的浏览"——但用户在 Marketplace 中浏览时仍需识别"哪些我已装过"，避免重复点击触发"已存在"错误
  - 同一列表 + 按钮变态是商减最优解（不开两个页面、不开 modal、不开标签页）
  - Ensemble 现有 SkillListItem 已有 `installSource: 'plugin'` 蓝点 badge（A §3.1，§7.1）——Marketplace 列表项中"已在 Ensemble 中安装"可以使用相同位置的不同色（如灰色 + Check icon）作为 affordance
- **(d) 设计语言兼容性**：**兼容（需小幅扩展）**。需要为 plugin badge 位置增加一种已安装态颜色——此为 PRD 决策点 D-9（A §7.4 / §11 第 3 条）。无新动效、无新位置、无新尺寸

### 模式 5：离线降级到"已安装项不受影响 + 列表显示 EmptyState + Retry 按钮"

- **(a) 模式名**：Offline-graceful degradation（离线时已装项依然可用、列表显示空态）
- **(b) 源产品**：VSCode（离线时仅 INSTALLED 组、RECOMMENDED 组消失）+ Raycast / Obsidian（EmptyState + Retry）
- **(c) 适用 Ensemble 的理由**：
  - Ensemble 已有 `<EmptyState>` 组件（A §2.4）；marketplace 列表离线时直接渲染 EmptyState（icon "WifiOff" + title "Marketplace unavailable" + description "Check your connection" + action "Retry"）
  - 已安装的 Skill / MCP 不依赖网络（已落到 `~/.ensemble/`，A §5）；Marketplace 离线不影响已装资源使用
  - 这是用户原话"闭环"的隐含约束——闭环不能因为网络断而断开
- **(d) 设计语言兼容性**：**完全兼容**。EmptyState 是现有组件、icon 用 lucide-react WifiOff（已有库）、Retry 按钮用 Button secondary

### 模式 6（额外）：分类筛选用"现有 Categories / Tags 模式"而非新建过滤器系统

- **(a) 模式名**：Reuse existing taxonomy as marketplace filter（用现有分类系统作 marketplace 过滤）
- **(b) 源产品**：Raycast（categories tab 简化筛选）+ VSCode（`@category:themes` 过滤词，但简化版即可，不必复刻 `@` 命令式）+ 反例：VSCode 的过滤词系统过于工程化、不适合非开发者用户
- **(c) 适用 Ensemble 的理由**：
  - Ensemble 已有 Categories（带颜色、带父子层级、max depth 2）+ Tags 模型（A §2.4）+ `<CategoryTreeDropdown>` 组件
  - Marketplace 列表上方放 `<CategoryTreeDropdown>` 作为筛选器、Tag 作为多选 pill，与 SkillsPage 现有 Auto-Classify 后的视觉一致性形成闭环
  - 上游数据源（如 skills.sh）的分类标签可能不一致；Ensemble 可直接 ignore 上游分类、用自己的 Categories 系统筛选（这与用户原话"不打算自己建设映射表"不冲突——本地分类 ≠ 资源映射表）
- **(d) 设计语言兼容性**：**完全兼容**。复用 CategoryTreeDropdown / Tag pill 全部现有组件、零新视觉

### 模式 7（额外）：评分 / 用户评价系统不引入

- **(a) 模式名**：No ratings / no reviews（不引入评分系统）
- **(b) 源产品**：Raycast（无评分）+ Obsidian（无评分；只有 download count）+ 反例：VSCode 5 星评分（VSCode 是工业级产品、用户量级足够支撑评分；Ensemble 不是）
- **(c) 适用 Ensemble 的理由**：
  - 用户原话"商减"明确反对"塞一堆用不到的功能"——评分系统是商增重区域（需要评论后端、防刷、举报机制）
  - 上游数据源（skills.sh / mcp registry）当前不提供评分；Ensemble 自建评分等于"建映射表"，违反用户原话"不打算自己建设映射表"
  - download count / install count（如上游提供）是足够的 social proof
- **(d) 设计语言兼容性**：**完全兼容**（不引入即兼容）

---

## §6 调研边界与未覆盖

按派单卡 §3 E "不做"约束，本调研：

- **不写 Ensemble Marketplace 页面应该长什么样**——§5 给的是"可移植模式"，最终落地由 PRD 决策
- **不画线框图**——所有 UX 描述都是文字
- **不照搬某一款产品的整套方案**——§5 的 7 条模式分别来自 4 款不同产品，组合而非复制
- **没有安装并实测这 4 款产品**——以官方文档（developers.raycast.com、code.visualstudio.com、obsidian.md/help、linear.app/docs）+ 社区评论 + 社区截图描述为准；如 PRD 阶段对某一款产品有更细的事实需求（如 VSCode Extension 详情页右栏元数据字段精确清单），可派遣轻量补研

后续在 PRD / Synthesis 阶段需要决策的开放点：

1. Marketplace 入口位置最终落到 sidebar 顶部独立分组还是 Navigation 内并列（用户字面要求倾向前者，本调研支持前者；PRD 锁定）
2. "安装"是否区分 Skill 与 MCP 的反馈强度（Skill 是 markdown 复制、< 100 KB 秒完；MCP 可能涉及 npm install / docker pull 慢）—— Obsidian 风格的 download/enable 分离对 MCP 是否适用（D-7 / D-8 决策）
3. 列表中"已安装 vs 未安装"的视觉 affordance 精确形态（左段 plugin badge 同位置不同色 / detail 中 Source 行 / 按钮文案；A §7.4 也已识别此为 D-9）
4. 是否提供"卸载 / Disable"在 Marketplace 列表项的 More menu 中（已装态）—— Raycast / VSCode 提供，Obsidian 在主 Settings 处理
5. 详情页右栏元数据字段精确清单（必选：作者 / 描述 / 分类；可选：版本 / 更新时间 / 下载量 / 依赖 / 提供的命令）
6. Marketplace 顶部分组的命名（"MARKETPLACE" 单数 vs "Skill Marketplace / MCP Marketplace" 两个独立 nav item 并列；事实层面 Ensemble sidebar Navigation 区已是平铺 5 项，新增 2 个 marketplace nav item 平铺更轻量；段标题"MARKETPLACE" + 2 nav items 在视觉上略重但可识别度更高 —— 此为 D-1 决策点的子项）

---

## §7 信息源与可信度

本调研引用的事实来源（按可信度排序）：

| 事实类别 | 来源 | 可信度 |
|---|---|---|
| Raycast Store 入口 / 安装流程 | developers.raycast.com 官方文档（Install an Extension / Detail API / Changelog） | 一手（官方） |
| VSCode Extensions Marketplace UX | code.visualstudio.com 官方文档（Extension Marketplace / UX Guidelines / Activity Bar） | 一手（官方） |
| Obsidian Community Plugins 安装 / 启用分离 | obsidian.md/help/community-plugins + obsidian.rocks（高信誉社区） + obsidian forum | 一手 + 高信誉二手 |
| Linear sidebar 可定制 + 分组 | linear.app/changelog/2024-12-18-personalized-sidebar + linear.app/docs/favorites（官方） | 一手（官方） |
| Things 3 sidebar 无 divider 设计选择 | culturedcode.com/things/support 官方文档 + accordingtoandrea.com（社区记录"用空 area 自造 divider"workaround） | 一手 + 高信誉二手 |
| Raycast 与 macOS-native 设计语言关系 | developers.raycast.com 多处 + reddit /r/macapps 用户评价 | 一手 + 社区共识 |

未使用一手实测（如本机安装 4 款产品逐项截屏）的原因：派单卡 §3 E "必读上下文清单"明确"不需要安装这些产品来跑（成本过高）；以官方文档 + 社区评论 + 截图为准"。本调研严格遵守此约束。

---

**调研产物结束。** §3 表格与 §5 7 条可移植模式是 PRD 撰写"信息架构 / 关键交互 / 安装反馈"章节的最直接 UX 弹药；§4 的单产品 UX 节奏作为"为什么这条模式来自这个产品"的事实证据；§7 让下游 SubAgent 可以追溯到一手源做二次核对。
