# E4 — 范围控制 / 商减 评审

> **角色**:E4 SubAgent(Opus 4.7)。独立评审 Marketplace V2.0 实施产物在"商减、不埋点、不未来铺垫"维度的合规性。
> **时间**:2026-05-09
> **依据**:PRD V2 §9.1/§9.2/§9.3、`02_synthesis_decisions.md` D-2/D-11/D-13、`02_risk_distillation.md` R-5/R-19/R-33/R-41/R-49/R-51、`00_round_plan.md` §6 D-Imp-1 ~ D-Imp-12、`04_implementation_log.md`。
> **评审方式**:全 codebase grep + 关键文件 Read,只读、不改。
> **范围**:不重复 Phase D 已做的"V1 Out 0 埋点 grep";本评审深入 D-Imp 偏离实施完整性 + 文案-实现一致性 + R-22 端到端等"看似已完成但断链"的边角。

---

## TL;DR

| 严重度 | 数量 | 主题 |
|---|---|---|
| **P0** | **3** | (1) `MarketplaceCollisionModal` "Restore from Trash" 文案承诺 vs 实现不一致;(2) `auto_classify` icon 大小写错位导致 marketplace 装的资源永远拿不到自定义 icon;(3) R-22 `autoClassifyNewItems` 默认 OFF on fresh install,违反 D-Imp-12 / 02_tech_spec L193 |
| **P1** | **4** | D-Imp-9 stdio env vars Save 按钮**不写后端**(仅前端假反馈);`imported_marketplace_skills` 写入但永远不读(R-36 数据膨胀);marketplace.rs 与 in-progress sidebar-hierarchy-fix 紧耦合(PR-1 mitigation 未达成);MCP `marketplace_source.repo = author`(语义错位但不影响 SSoT 命中) |
| **P2** | **5** | `MarketplaceCollisionModal` 双页面双挂载(略浪费,无功能影响);`ensure_category` helper 单一 callsite(轻量过度抽象);MCP `license` 字段从未渲染;Skill page 无条件挂载 vs MCP page 条件挂载 modal,挂载策略不一致;`MarketplaceSourceKind` 第三态 `'agent_registry'` 未预留(✅ 正确,这是 anti-埋点确认而非问题) |

V1 Out 8 项 grep 全部 0 命中(已二次确认);未抽象 `BaseListItem` / `MarketplaceTab` / `BaseStore` / `MarketplaceProvider` / 等(✅ 符合 D-13);sidebar `marketplaceItems` 数组只有 2 项(✅ 无 Agent 入口预留);`installSource` 字面 `'local' | 'plugin' | 'marketplace'` 三态(✅ 无 agent slot);`MarketplaceSourceKind` 仅 `'skills_sh' | 'mcp_registry'`(✅ 无 agent_registry)。

V1 范围本身控制良好;主要问题集中在**实施层断链**(spec 说要做 X,但代码只做了 X 的"前 80%",剩下 20% 用占位符或文案掩饰)。

---

## P0(必须修复后再 ship)

### P0-1 `MarketplaceCollisionModal` "Restore from Trash" 文案承诺与实现不符

**症状**

`src/components/marketplace/MarketplaceCollisionModal.tsx:48-49`:

```
const DESCRIPTION_HAS_TRASHED =
  'A previously deleted version exists in Trash. Restoring will recover your category, tags, and custom icon.';
```

但 `src-tauri/src/commands/marketplace.rs:1200-1215` 的 RestoreFromTrash 实现:

```rust
fs::rename(&src, &target_dir).map_err(|e| format!("restore from trash: {}", e))?;
return finalize_skill_install(app, &item, target_dir).await;
```

`finalize_skill_install` 用 marketplace 上游元数据 **重建** `data.skill_metadata[skill_id]`(只写 `install_source`、`marketplace_source`、`scope`),**完全不读取**任何"原 metadata"。原因是 `delete_skill`(`skills.rs`)在删除时已 `app_data.skill_metadata.remove(&skill_id)` 把 metadata 抹掉,trash 文件夹只保留文件本体不持久化 metadata。

**用户实际看到**:点 Restore → skill 文件回来了 → 但 category 空、tags 空、icon 默认。Modal 文案说会"recover",实际什么 metadata 都没 recover。

**影响**:用户信任违反。这是产品契约层的 false promise,比"功能没实现"更坏。比 R-3(metadata 孤儿)更具体——R-3 描述了风险,本评审是它落地的 P0。

**建议修复**(择一):

- **(a) 修文案**(零工程成本):把 `DESCRIPTION_HAS_TRASHED` 改为 `'A previously deleted version exists in Trash. Restoring will reuse the local files (category and tags will be re-suggested by Auto-Classify).'`,这是 V1 实际行为的诚实描述。
- **(b) 修实现**:让 `delete_skill` / `delete_mcp` 在移到 trash 时把对应 metadata snapshot 到 trash 子目录(如 `~/.ensemble/trash/skills/<name>/.ensemble-meta.json`),restore 时读取并写回。这工程成本高于本轮预算。

**推荐**:V1 走 (a)。OQ-3(R-3)继承到 V1.5 时再走 (b)。

**严重度依据**:`fix-must-define-user-observable-success.md` Rule 中"用户做 X → 看到 Y"的契约违反,且这是 modal 写在屏幕上的产品承诺。R-1 P0 风险登记的延伸落地。

---

### P0-2 Auto-Classify icon 大小写错位 — Marketplace 资源永远拿不到自定义 icon

**症状**

`src-tauri/src/commands/marketplace.rs:1544-1559` 中 `run_auto_classify` 传给 LLM 的 `available_icons`:

```rust
let available_icons: Vec<String> = vec![
    "Sparkles".to_string(),
    "Code".to_string(),
    "Database".to_string(),
    "Globe".to_string(),
    "Box".to_string(),
    // ...
];
```

但前端 `src/components/common/IconPicker.tsx:221-433` 的 PRESET_ICONS 用 **kebab-case** 名:`'sparkles'` / `'code'` / `'database'` / `'globe'` / `'box'` / `'message-square'` 等。`ICON_MAP` 的 key 沿用 PascalCase 还是 kebab-case 取决于 `PRESET_ICONS` 中 `name` 字段——是 lowercase。

`SkillsPage.tsx:72-73`:`if (skill.icon && ICON_MAP[skill.icon]) { return ICON_MAP[skill.icon]; }`,`McpListItem.tsx:38-39`:同款大小写敏感查找。

**结果**:LLM 从 `["Sparkles", "Code", ...]` 中选一个 PascalCase 名,Rust 把它写到 `entry.icon = "Sparkles"`。Front-end 渲染 list item 时 `ICON_MAP["Sparkles"]` 返回 `undefined`,fallback 走 category-icon → 用户永远看不到 auto-classify 推荐的 icon。

**对比**:存量 `claudeMdStore` / `mcpsStore` / `skillsStore` 在调 `auto_classify` IPC 时传 `availableIcons: ICON_NAMES`(`IconPicker` export 的 lowercase 列表),所以**存量 auto-classify 工作**;只有 marketplace 路径走的是 marketplace.rs 内嵌的 PascalCase 硬编码列表。

**Phase A SubAgent 笔记原文**:

> **auto_classify 用 `Sparkles, Code, Database, Globe, Box, Bot, Brain, BookOpen, FileText, Wrench, Zap, Plug, MessageSquare, Cog, FlaskConical` 15 个 icon**,如果前端 ColorPicker / IconPicker 列表不一致,在 Phase B 中对齐 — 当前选了一组覆盖度合理但偏保守的子集

Phase B 没有对齐。Phase D grep 说 "0 自创 token"——但 token 不等于 icon name 大小写。

**影响**:R-22 端到端启用失败的具体落地。"用户装一个 marketplace skill → 5s 后看到 row 收到 category / tags / icon"——**icon 这一步永远不生效**,违反 PRD §3.2 [5.5] 描述的"安装到分类的视觉闭环"。

**建议修复**:把 marketplace.rs L1544-1559 改为用 kebab-case 字面值(`"sparkles"`、`"code"`、`"database"` ...)。这是 1 行 sed 替换。或者更稳妥:在 IPC 层接收 `available_icons` 参数(像 SkillsStore 一样),让前端传 `ICON_NAMES` 给 marketplace 路径。

**严重度依据**:R-15(P0 风险)直接落地 — 安装与分类不同步的具体形态。`02_tech_spec §3.5` 把 auto-classify 闭环列为 V1 In #5 的核心。

---

### P0-3 `autoClassifyNewItems` 默认值 fresh-user 走 `false`,违反 D-Imp-12 / 02_tech_spec

**症状**

- TS 端 `src/stores/settingsStore.ts:81`:`autoClassifyNewItems: true,`(✅ 已翻 V2 默认值)
- Rust 端 `src-tauri/src/types.rs:361`:`auto_classify_new_items: false,`(❌ 仍是 V1 默认值)
- `read_settings()`(`data.rs:280-282`)在 settings.json 不存在时返回 `Ok(AppSettings::default())`,这就是 fresh-user 路径。

**Phase A SubAgent 后续修复笔记**说:

> `read_settings` 失败时按 flag = `true` 处理(默认开启,符合 `Default for AppSettings`)。

但 `Default for AppSettings` **不是 true**,是 `false`。注释撒谎。

**实际 fresh-user 旅程**:

1. 用户首次启动 app,`~/.ensemble/settings.json` 不存在
2. `loadSettings` IPC `read_settings()` → fs read 失败 → 走 else 分支返回 `AppSettings::default()`,`auto_classify_new_items: false`
3. settingsStore set `autoClassifyNewItems: false`(覆盖 TS 默认 true)
4. 用户进 Settings 页 → Toggle 显示 OFF(违反 PRD §5.0 / 02_tech_spec L193 的"默认 true")
5. 用户装 marketplace 资源 → `spawn_auto_classify` 读 `auto_classify_new_items=false` → 不分类
6. 用户什么都没看到,以为是 bug

**对比**:已存在 settings.json 的老用户,假设之前没勾过,字段缺失走 serde 解析 → fail or default。如果走 default 就也是 `false`。两个老用户路径都拿到 `false`。

**严重度依据**:R-22(P1)+ 02_tech_spec L193(spec 明文)+ D-Imp-12 全部落空。"V1 端到端启用 `autoClassifyNewItems`" 是 Phase A6 / B3 共同声明完成的,但端到端这一头没接通。Phase B 改了 TS 默认值 + 测试,Rust 端没改,任意一端单边升级不构成"端到端"。

**建议修复**:`src-tauri/src/types.rs:361` 改为 `auto_classify_new_items: true,`。改 `Default::default` 是单点修复,不需要数据迁移(已有 settings.json 的用户字段已显式 false 或显式 true,不依赖 default)。

---

## P1(应在 Phase F 一并修复)

### P1-1 D-Imp-9 stdio env vars `Save environment variables` 按钮不写后端

**症状**

`src/pages/McpMarketplacePage.tsx:356-374` 的 `handleSaveEnv`:

```tsx
const handleSaveEnv = (item: MarketplaceMcpItem) => {
  const values = envValues[item.id] ?? {};
  const missing = requiredEnvVars.filter(
    (spec) => !values[spec.name] || values[spec.name].trim().length === 0,
  );
  if (missing.length > 0) {
    setShowValidation((prev) => ({ ...prev, [item.id]: true }));
    return;
  }
  setShowValidation((prev) => ({ ...prev, [item.id]: false }));
  setSavedFeedback((prev) => ({ ...prev, [item.id]: true }));
  window.setTimeout(() => {
    setSavedFeedback((prev) => ({ ...prev, [item.id]: false }));
  }, 2000);
};
```

**完全不调任何 IPC**。前端 component state 存了 envValues,显示 "✓ Saved" 2 秒钟后回到 idle。后端 `~/.ensemble/mcps/<name>.json` 的 `env` 字段在 install 时被预填空字符串,**Save 后没有任何数据写到磁盘**。

**Phase C3 SubAgent 笔记自认**:

> 项目当前 `update_mcp_metadata` IPC 不接受 env 字段...本卡选择**纯前端持久化**...这满足"用户感知填了就保存"的 PRD §5.4 (b) 契约(后端真正写...需要 `update_mcp_env_vars` IPC,留给 V1.5 或 backend 增量补)。

**问题**:

- D-Imp-9 spec 原文:"onSave 写入 `~/.ensemble/mcps/<name>.json` 的 `env` 字段;成功后按钮 200ms checkmark 反馈"。"写入"不是"假装写入"。
- PRD §5.5(`Installed (configure env)` chip)产品语义:用户填完 env vars + Save → 资源可用 → chip 切到 `Installed`。当前实现 chip 切了,但环境变量在 `~/.ensemble/mcps/` JSON 里还是空字符串,Scene sync 到 Project 时 `.mcp.json` 也是空字符串,Claude Code 拉起 MCP 时配置缺失启动失败。
- 用户首次填了 API key 重启 app:envValues 是 component state,re-mount 即清空。下次进 marketplace 详情面板看到所有 env 输入框还是空的,但按钮显示 `Installed` 让人以为是"已配置好的"——再次违反 fix-must-define-user-observable-success Rule(用户做 X = 填 env + Save,看到 Y = 持久化的 env)。

**严重度判定**:这是 D-Imp-9 spec 偏离 + PRD §5.5 闭环断裂 + 用户信任损害的复合。**升 P0 仍可辩**;暂列 P1 是因为用户在 marketplace 装完后**也可以**通过 McpServersPage 的 `update_mcp_metadata` 之外的路径手填 env(打开 ~/.ensemble/mcps/<name>.json 编辑)——但这是 V1 用户**不该**被推到的角落。

**建议修复**:

- **(a) 短路径(P1 但充分)**:扩展 `update_mcp_metadata` IPC 接受 `env: Option<HashMap<String, String>>` 字段,Save 调它。V1 工程量 ≤ 1 day。
- **(b) 临时**:Save 按钮文案改为 `Save (V1 only saves locally)` 并加 hint,V1.5 再补 IPC。这是诚实选项,但比 (a) 难看。

---

### P1-2 `imported_marketplace_skills` 字段写但永不读(R-36 数据膨胀落地)

**症状**

`src-tauri/src/types.rs:233`:`pub imported_marketplace_skills: Vec<String>`

`src-tauri/src/commands/marketplace.rs:1257-1260`:

```rust
if !data.imported_marketplace_skills.contains(&item.id) {
    data.imported_marketplace_skills.push(item.id.clone());
}
```

每装一个 skill 就 push;无任何代码 **读** 此字段(grep 全 codebase 仅有写 + 初始化 + 类型定义)。

**对比 `imported_plugin_skills`**:存在合法 reader `getUnimportedPluginSkills`(用于 ImportSkillsModal),plugin 路径有"已 imported / 未 imported"二态需要列表式跟踪。Marketplace 路径**没有这种二态**——SSoT 由 `Skill.installSource === 'marketplace'` + `marketplaceSource` 三元组派生,`imported_marketplace_skills` 在 SSoT 角色上多余。

**R-36 P1 风险登记原文**:

> `imported_plugin_skills/mcps` 列表当前只跟踪显式 import,若 marketplace 也走类似列表(如 `imported_marketplace_skills`)需避免膨胀

— 实施直接走了 R-36 警告的路。data.json 会随每次 marketplace 装资源单调增长,卸载也不清(`delete_skill` 不知道这个字段)。久而久之 data.json 里堆一个永远不读的 string 数组。

**建议修复**:

- 删 `AppData.imported_marketplace_skills` 字段(types.rs / data.rs::init / marketplace.rs::push)。零业务逻辑影响——SSoT 完全不依赖它。
- 顺手加 `data.rs::cleanup_legacy_marketplace_imported_list()` 在 init 时清掉历史用户已写入的旧字段(`#[serde(default)]` 容许 missing,删字段不破坏存量 data.json 反序列化)。

**估时 ≤ 30 min**。

---

### P1-3 `classify.rs` 的 in-progress sidebar-hierarchy-fix 改动被 marketplace.rs 紧耦合

**症状**

`00_round_plan §8 PR-1` 警告:

> classify.rs / types/index.ts / store 文件已有 in-progress 改动(sidebar-hierarchy-fix);本轮改这些文件需避免冲撞...最终 commit 只 stage 本轮新改动,不动 in-progress 残留;交付检查阶段提醒用户处理

但实际 `marketplace.rs:57` 直接 import 自 in-progress 改动:

```rust
use crate::commands::classify::{auto_classify, ClassifyItem, ClassifyResult, ExistingCategory};
```

`ExistingCategory` 是 sidebar-hierarchy-fix 在 `classify.rs` 新加的 struct(用于 depth-2 category 重构 prompt),`ClassifyResult.suggested_parent_category` 同款。

`marketplace.rs:1525-1535` 构造 `ExistingCategory` 列表喂给 auto_classify;`marketplace.rs:1577` 用 `result.suggested_parent_category` 作 ensure_category 第三参;`marketplace.rs:1633` event payload 的 `parentCategory` 字段。

**结果**:本轮 marketplace 工作**不能独立 commit**,必须与 sidebar-hierarchy-fix 一起 ship。如果 sidebar-hierarchy-fix 在 commit 阶段被 revert / 进一步重构,marketplace 会立即编译失败。

**严重度判定**:不是代码 bug,是 commit 边界规划失败。Phase D 自检"in-progress 残留 0 触动"声明 (line 542) 误导——marketplace 没改 in-progress 文件主体,但 marketplace 业务逻辑**消费**了 in-progress 类型,等价于"间接触动"。

**建议处理**:

- 主 Agent 在 Phase G 交付检查时显式向用户披露此耦合;让用户决定是 (a) 同时 commit 两批 (b) sidebar-hierarchy-fix 单独先 ship、本轮 marketplace 后 ship、还是 (c) marketplace 内嵌一个本地 lightweight `MarketplaceExistingCategory` struct 解耦(工程成本 ≤ 1h)。
- 选 (a) 是默认推荐,因为 marketplace 在 fresh-classify 上就需要 depth-2 category 支持(auto_classify 给 marketplace 资源建二级分类)。

---

### P1-4 MCP `marketplace_source.repo = author`(语义错位)

**症状**

`src-tauri/src/commands/marketplace.rs:1330-1336`:

```rust
let marketplace_source = MarketplaceSource {
    source: "mcp_registry".to_string(),
    owner: item.author.clone(),
    repo: item.author.clone(),  // ← repo == owner == author,语义错位
    name: item.name.clone(),
    last_synced_at: now,
};
```

`MarketplaceSource` 数据模型语义是 `(owner, repo, name)` 三元组。MCP 用 `repo = author` 让"三元组"实际是"二元组",且 `repo` 字段值无意义。

**为什么不直接 P0**:`marketplaceStore.ts:843-852` 的 SSoT selector(isMcpInstalled)只比 `owner` + `name`,**不比 `repo`**(因为这种错位被故意 workaround 了)。所以 SSoT 命中正确。

**为什么 P1**:数据模型完整性损害 + 日后某 V1.5 SubAgent 看到 `marketplace_source.repo` 字段以为它真是 GitHub repo 名(它不是),会写出错误代码。spec D-Imp-4 也含糊地说"三元组",没明确 MCP 用什么。

**建议修复**:

- 短路径:`MarketplaceMcpItem` 已有 `repositoryUrl: String`(catalog 字段),解析这个 URL 提取真实 owner/repo:
  ```rust
  let (owner, repo) = parse_owner_repo_from_url(&item.repository_url)
      .unwrap_or_else(|| (item.author.clone(), item.name.clone()));
  ```
  `parse_owner_repo` 函数 `marketplace.rs:617` 已存在,可直接复用。
- 同步更新 `marketplaceStore.ts:843-852` 在 triple-match 阶段也比 `repo`,移除 workaround 注释。

**估时 ≤ 1h**。

---

## P2(可在 V1.5 评估或留命名建议)

### P2-1 `MarketplaceCollisionModal` 在 SkillMarketplacePage / McpMarketplacePage 双挂载

**症状**

- `SkillMarketplacePage.tsx:482`:`<MarketplaceCollisionModal />` 无条件挂载
- `McpMarketplacePage.tsx:858`:`{collisionModalState.open && collisionModalState.itemType === 'mcp' && <MarketplaceCollisionModal />}` 条件挂载

两个挂载点策略**不一致**(Skill 无条件 vs MCP 条件)。功能上无问题——modal 内部自己订阅 store state,只在 `open === true` 时显示——但两个 React mount 两次订阅同一 state slice。

**建议**:同 ShortcutBanner 模式,把 `<MarketplaceCollisionModal />` 提到 `MainLayout.tsx` 顶层挂载一次。同时让两个 page 删掉自己的挂载点。

**估时 ≤ 30 min**。

---

### P2-2 `ensure_category` helper 仅一处调用

**症状**

`src-tauri/src/commands/marketplace.rs:1648` 定义 `ensure_category`,只在 L1577 调用一次。Helper 内含 13 行 parent 解析 + child 创建逻辑,本身有复杂度,extract 不算明显反模式;但若未来不复用,inline 也行。

**建议**:暂不改;若 V1.5 有第二处 ensure_category 需求(如 marketplace 元素手动加新 category),自然回到 helper 的合理性。当前留观察。

---

### P2-3 MCP `license` catalog 字段在 MCP marketplace 详情面板未渲染

**症状**

- `src/types/marketplace.ts:59`:`MarketplaceMcpItem.license?: string`
- Skill 详情(`SkillMarketplacePage.tsx:662`):`<InfoItem label="License" value={item.license || '—'} />`
- MCP 详情:0 hits — 字段定义但从未渲染。

**为什么 P2**:不是 spec 强制要求(spec §10.3 Block 1 只列 4 列:Author / Last Updated / Stars / Type),但与 Skill 详情 UX 不对齐造成"为什么 Skill 显示 License、MCP 不显示?"用户疑问。

**建议**:V1.5 在 MCP Block 1 加第 5 列 License(若覆盖率高);V1 接受不一致。

---

### P2-4 `MarketplaceCatalog<T>` 泛型仅 2 instantiation(SkillItem + McpItem)

**症状**

`src-tauri/src/types.rs:1202-...` 定义泛型 `MarketplaceCatalog<T>`,使用点 `marketplace.rs:156/165/172/181/748/923/1054`。所有 instantiation 是 `MarketplaceSkillItem` 或 `MarketplaceMcpItem`,没有第三种。

**为什么 P2**:2 instantiation 是抽象的最低门槛——可以辩护为"DRY 必要",也可以辩护为"未来多源时这就是 BaseStore-style 抽象的种子"。当前实施处于灰色地带。

**建议**:暂不动;若未来 catalog schema 在 Skill / MCP 间分化(如 weekly_installs、agentAdoption),回归把 `MarketplaceCatalog<T>` inline 到两个具体 struct 也容易。当前不构成 D-13 违反(D-13 限制的是 ListItem / Page 层抽象,不是数据模型层)。

---

### P2-5 `MarketplaceSourceKind` 仅 2 字面值 — anti-埋点确认

**症状**(实际是合规确认)

`src/types/marketplace.ts:9`:

```ts
export type MarketplaceSourceKind = 'skills_sh' | 'mcp_registry';
```

无 `'agent_registry'` / `'agents'` / `'subagent_market'` 等第三态预留。✅ 符合 D-2(用户锁,V1 不预留 Agent)。

`Sidebar.tsx:54-63`:`activeNav` 联合也只有 `'marketplace-skills' | 'marketplace-mcps'` 两态,无第三 marketplace nav,✅ 符合。

**说明**:列在 P2 不是为了"修",是为了在 review 中显式确认,future review 不重新审。

---

## D-Imp 偏离合规检查表

| D-Imp | 实施状态 | 备注 |
|---|---|---|
| **D-Imp-1**(seed + 异步爬虫) | ✅ 实现 | 51 个 seed 条目(spec 范围 40-60);`fetch_skills_sh_top(100)` 后台 30s timeout |
| **D-Imp-2**(MCP Registry 全量 + 24h cache) | ✅ 实现 | `CACHE_TTL_SECS = 24 * 60 * 60` |
| **D-Imp-3**(扁平 cache 结构) | ✅ 实现 | `~/.ensemble/marketplace-cache/{skills,mcps}-catalog.json` 各一个文件 |
| **D-Imp-4**(`marketplace_source` 子对象 + 三元组 SSoT) | ⚠️ 实现但 MCP 错位 | 见 P1-4 |
| **D-Imp-5**(Sort 文案统一 `By Popularity`) | ✅ 实现 | Skill / MCP 两页一致 |
| **D-Imp-6**(active Scene + popover) | ✅ 实现 | `last_edited_scene_id` 字段 + `getActiveScene()` selector + `AddToScenePopover` 完整 diff-save |
| **D-Imp-7**(URL query param `?selected=`) | ✅ 实现 | SkillsPage / McpServersPage useSearchParams + replace history |
| **D-Imp-8**(三元组优先 + name fallback) | ✅ 实现 | marketplaceStore.ts:824-855 |
| **D-Imp-9**(显式 Save 按钮) | ❌ **不写后端** | 见 P1-1(假反馈) |
| **D-Imp-10**(std OnceLock 无新依赖) | ✅ 实现 | tokio features 增加 `sync` `rt`,无 `once_cell` |
| **D-Imp-11**(不显示 "recently installed") | ✅ 合规 | grep "recently installed" / "just installed" 全 0 |
| **D-Imp-12**(autoClassifyNewItems flag UI) | ⚠️ Toggle 存在,但 fresh user 走 false | 见 P0-3 |

---

## V1 Out 8 项零埋点 grep 表(Phase D 已查,本轮二次确认)

| Out 项 | grep pattern | hits | 状态 |
|---|---|---|---|
| #1 Agent Marketplace | `agent.*marketplace\|claude-code-agent\|marketplace-?agents\|agentMetadata\|agentSource\|subagent` | 0 marketplace-related | ✅ 仅 usage.rs 现有 `subagents/` 目录扫描(non-marketplace) |
| #2 用户上传 / 评论 | `userUpload\|user_upload\|userContrib\|contribution` | 0 | ✅ |
| #3 评分 | `\brating\b\|reviews?[_-]?count\|reviewScore\|comment[s]?[_-]?count\|vote_count\|feedback_score` | 0 | ✅ |
| #4 团队同步 | `team[_-]?[A-Z]\|teamSync\|cloudSync\|share_with_team\|account[_-]?id` | 0 | ✅ |
| #5 私有 / 企业 | `enterprise\|private[_-]?marketplace\|org[_-]?id` | 0 | ✅ |
| #6 自动更新 | `autoUpdate\|update[_-]?available\|pull[_-]?latest` | 0 | ✅ |
| #7 沙盒 | `sandbox\|tryBeforeInstall\|preview[_-]?mode` | 0 | ✅ |
| #8 Featured / Editor pick | `featured\|editor[_-]?pick\|verified[_-]?badge` | 0 | ✅ 仅 marketplace.rs:48 GitHub API "official recommendation" 注释,非产品概念 |

---

## 范围红线(项目层)

| 红线 | 状态 |
|---|---|
| 不写 `~/.claude.json` | ✅ marketplace.rs grep 0 hits |
| 不动 `~/.claude/plugins/` | ✅ marketplace.rs grep 0 hits |
| 不修改 `import.rs::copy_skill` 短路逻辑 | ✅ git diff 仅 `marketplace_source: None` 字段添加 |
| 不绕过 Scene 模型 | ✅ install 仅写 `~/.ensemble/`;Scene 加入仍走 `useScenesStore.updateScene` |
| 不修改 `trash.rs` 主体 | ✅ git diff 0 |

---

## 抽象边界(D-13 复用模式)

| 抽象 | 是否存在 | 评估 |
|---|---|---|
| `BaseListItem` | ❌ 不存在 | ✅ 符合 D-13 反向("复制骨架 + 替换右段"模式) |
| `MarketplaceTab` 第三标签预留 | ❌ 不存在 | ✅ Sidebar 只有 2 marketplace nav |
| `BaseStore` / `BaseList` | ❌ 不存在 | ✅ |
| `MarketplaceProvider` / `MarketplaceStrategy` | ❌ 不存在 | ✅ |
| `MarketplaceCatalog<T>` | ✅ 存在 | ⚠️ P2-4(2 instantiation 灰色地带) |
| `installSource` 第四态 | ❌ 不存在 | ✅ 严格 `'local' \| 'plugin' \| 'marketplace'` |
| `MarketplaceSourceKind` 第三态 | ❌ 不存在 | ✅ 严格 `'skills_sh' \| 'mcp_registry'` |

---

## 死代码 / 未用字段

| 项 | 状态 |
|---|---|
| `InstallSource` alias 已删 | ✅ grep 0 hits |
| `imported_marketplace_skills` | ❌ P1-2 写但永不读 |
| `MarketplaceMcpItem.license` | ⚠️ P2-3 字段定义但 UI 未渲染 |
| `cargo build` warnings | ✅ 0 |
| `npx tsc --noEmit` errors | ✅ 0 |
| `npx eslint marketplace files` warnings | ✅ 0 |

---

## 总结

V1 范围控制总体良好——V1 Out 8 项零埋点(Phase D + 本轮二次确认)、抽象边界严守 D-13、`installSource` / `MarketplaceSourceKind` 都是字面三态/二态、Sidebar 只有 2 marketplace nav。

**然而**,实施层有 3 处 P0 是"看起来已完成、实际断链":

1. **CollisionModal 文案谎言**:Modal 写"会 recover metadata",代码不 recover。
2. **Auto-classify icon 大小写错位**:LLM 拿到 PascalCase 列表,前端 ICON_MAP 用 kebab-case key,marketplace 资源永远拿不到 icon。
3. **Fresh-user 默认 OFF**:Rust default 仍是 `false`,违反 D-Imp-12 / 02_tech_spec L193 / Phase A 自己的注释承诺。

P1 的 4 处都是"实施捷径未补完":

1. **D-Imp-9 Save 按钮假反馈**(env vars 不持久化)
2. **R-36 dead 数据膨胀**(`imported_marketplace_skills` 写而不读)
3. **PR-1 in-progress 耦合未隔离**(marketplace 业务逻辑消费 sidebar-hierarchy-fix 类型)
4. **MCP `marketplace_source.repo = author` 语义错位**

修复成本:P0 三条合计 ≤ 2 hours(其中 P0-1 短路径 1 行文案 + P0-2 1 行 sed + P0-3 1 行 default 翻转);P1 四条合计 ≤ 4 hours。Phase F 一并处理可在半天内关掉所有 P0 + P1。

**P2 五条**包含 4 条建议性 + 1 条合规确认(`MarketplaceSourceKind` 仅 2 态),不阻塞 ship,可纳入 V1.5 backlog。

**评审结论**:V1 Out 项零埋点 ✅;抽象边界 ✅;实施层断链 P0×3、P1×4;ship 前需关 P0,P1 强烈推荐一并修。

---

**E4 评审完成,P0=3 / P1=4 / P2=5,产物已落盘。**
