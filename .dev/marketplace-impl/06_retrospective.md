# Ensemble V2.0 Marketplace — 全任务复盘(2026-05-09 → 2026-05-10)

> **角色**:本次完整任务的深度复盘。
> **聚焦**:为什么 Phase A 的 SubAgent 给了错误方向、绕了大圈、最后由 Phase I 的 chrome-devtools 逆向真正解决,以及如何避免下次重蹈。
> **态度**:不掩饰、不推卸。明确说主 Agent 漏掉了什么、SubAgent 的 hallucination 模式如何成功穿透了 4 重防御。
> **不写**:实施细节(已在 04_implementation_log)、PRD 决策(已在 02_synthesis_decisions)、commit history。

---

## 1. 任务全貌

| 阶段 | 内容 | 产物 |
|---|---|---|
| 0 | 4 份代码现状调研(R1-R4) | 2035 行 |
| 1 | 本轮规划 + 技术 spec + 任务卡 | ~1700 行 |
| A-G | Marketplace V2.0 主体实施 + 4 专家评审 + 15 P0 修复 + release build 部署 | ~5800 行新代码 + commit `b61d6b5` |
| H1 | 用户实测发现 fetch 失败,修 MCP envelope + SKILL_SEED 缩到 10 真实条目 | ~150 行 fix |
| H2 | 用户实测发现 MCP 重复 + reverse-DNS 前缀 + 缺 well-known,修 dedupe + name strip + MCP_SEED 10 条 | ~200 行 fix |
| **I** | 用户原话"现在的预览版本基本没法用,只有 12 个 Skill",**chrome-devtools 逆向 skills.sh internal API**,实现真实 91k items + 真分页 + 真搜索 | ~600 行 + 删 ~400 行废弃 |

**核心数字**:
- Phase A-H 累计 SubAgent 调用 ≈ 25 个
- Phase I 仅用 2 个 SubAgent(backend + frontend)+ 30 分钟主 Agent 调研
- Phase I 一次到位的产品质量 > Phase A-H 累计修复后的状态(12 项 → 91,028 项,差 7,500 倍)

如果 Phase A 用对方法,Phase H1 / H2 / I 全部都不必要。**估算节省工作量 ≈ 60-70%**。

---

## 2. 核心失败模式

### 2.1 SKILL_SEED 的 80% hallucination

**事实**:Phase A SubAgent 在 `marketplace_seed.rs` 里写了 50 条 `(owner, repo, skill_path)` 三元组作为 Skill marketplace 的 baseline。事后用 GitHub HTML scrape 验证:

| 仓库主 | 真实 | 评估 |
|---|---|---|
| `obra/superpowers` | ✅ 仓库真实存在 | 但 5 条具体 path 中只 1 条(`test-driven-development`)真实;其余 `feature-development` / `debugging` / `refactoring` / `spec-driven-development` 全部 **hallucinated** |
| `anthropics/skills` | ✅ 仓库真实存在 | 4 条 path 全部"路径前缀少 `skills/`" — `skill-creator` 应是 `skills/skill-creator`,导致 100% 404 |
| `anthropics/claude-code-action` | ⚠️ 仓库存在 | path `.claude/skills/code-review` 未验证 |
| `anthropic-experimental/skill-library` | ❌ 不知道 | 仓库存在性未验证 |
| `tomatyss/*` 3 条 | ❌ | 未验证 |
| `ananis25/claude-skills-collection` 3 条 | ❌ | 未验证 |
| `rohitg00/claude-skills-devops` 3 条 | ❌ | 未验证 |
| `shadcn/ui-skills` 2 条 | ❌ | "shadcn" 是真人但 `ui-skills` 仓库**不存在** |
| `academic-skills/claude-academic` 3 条 | ❌ | 组织名 hallucinated |
| `vibing-os/productivity-skills` 3 条 | ❌ | 组织名 hallucinated |
| `skills-hub/multimodal-skills` 3 条 | ❌ | 组织名 hallucinated |
| `db-skills/claude-db` 3 条 | ❌ | 组织名 hallucinated |
| `agent-skills/claude-workflows` 2 条 | ❌ | 组织名 hallucinated |
| `edu-skills/claude-tutor` 2 条 | ❌ | 组织名 hallucinated |
| `write-skills/claude-edit` 3 条 | ❌ | 组织名 hallucinated |

**hallucination 率 ≈ 80%**。用户实测结果直接对应:50 条中只 1 条工作 = 用户看到 1 个 skill。

**为什么这种 hallucination 发生?**

LLM 写"~50 条 skill 仓库的 owner/repo/path"被理解为**生成式创作任务**:模型从训练数据 distribution 中采样"看起来像合理 owner/repo 名"的字符串。"academic-skills/claude-academic" 在训练数据从未出现,但**它符合采样的语义模式**(主题名 + claude- 前缀),所以被生成。

这是 LLM 的**默认行为**,不是边角 case。任何让 LLM 写"~N 条上游 catalog ID"的任务,在没有验证步骤时都会有 ~30-90% 的 hallucination 率,具体取决于训练数据覆盖度。

**为什么 4 重防御都没拦住?**

| 防御层 | 应该拦住吗 | 实际拦住了吗 |
|---|---|---|
| **任务卡 spec**(03_task_cards.md) | 应当强制 "每条 entry 必须 curl 验证 200" | ❌ 只写"~40-60 条 owner/repo,基于 skills.sh leaderboard 选取";没强制验证 |
| **cargo build / cargo test** | 永远绿 — fixture 用 mock JSON,never 调真实 endpoint | ❌ 结构上无能为力 |
| **Phase E 4 专家评审** | E1 代码质量 / E2 设计 / E3 闭环 / E4 范围 — 假设代码逻辑正确即可 | ❌ 4 reviewer 全部默认上游数据真实,**没人 curl 任何一条 seed entry** |
| **Phase D 主 Agent 自检** | 写明"主 Agent 静态自检 + build verify";自我承认无 GUI 点击能力 | ❌ static analysis 看不到 hallucinated 数据 |

**结构性盲区**:**所有现有防御层都是基于"代码逻辑层"的检查,没有"数据真实性层"的检查**。Hallucinated `&'static str` 在编译期 + 运行期 + 评审期都看起来正确,只在用户真实使用时才暴露。

### 2.2 "无 API" 假设的自我封闭

**事实**:PRD V2 调研阶段的 SubAgent B(Skill 数据源)在 `01_research/B_skill_data_source.md` 给出结论:"skills.sh 没有公开文档化 REST API,接入需 GitHub API + 网页/CLI 组合"(R-7 P0)。这条结论被写入决策登记 D-4 + 风险登记 R-7,成为不可逆的设计前提。

但**事实是**:
1. skills.sh 有 `/docs/api` 页 documented v1 API(需邮件申请 key)
2. **更关键** — skills.sh 有 **internal API** `/api/skills/{view}/{page}` + `/api/search`,**完全 unauth + 只需 5 个 browser headers**:91,028 项真实分页 + 真实 fuzzy/semantic 搜索

这两条 API endpoint 在 Phase I 用 chrome-devtools 30 秒内发现:
- 打开 https://skills.sh/
- 滚到底
- network panel 看到 `reqid=266 GET /api/skills/all-time/3 [pending]`(这就是滚动加载的真实 endpoint)
- curl 加全 headers 验证 → HTTP 200

**为什么调研 SubAgent 没发现?**

调研 B 几乎确定**没真实打开 skills.sh 网站**。它读了:
- skills.sh 主页(可能 wget 一次)
- GitHub awesome-skill 列表
- 模糊回忆训练数据中的 Vercel Labs 项目

它没用浏览器自动化(chrome-devtools / Playwright)。

**这是文本调研的结构性盲区**:
- 文本调研能发现 docs / README / wiki / awesome-list 里的信息
- 文本调研发现不了 **未文档化的 internal API**(它只在浏览器 network 流量中存在)
- 文本调研发现不了 **frontend 调用模式**(server-rendered? RSC? client-side fetch?)

PRD V2 整轮(00_understanding → 01_research → 02_decisions → 03_PRD_v1 → 04_PRD_v2 → 05_review)**都基于文本调研**。"无 API"被反复引用 14 次以上,成了不可质疑的前提。

**用户的产品哲学 push 是关键转折点**:
> "我搞不懂你为什么要做双阶段...如果我拿不到 key,是不是完全没有办法进行真实的操作、真实的事实的调研和获取?"

用户拒绝接受"双阶段 fallback",逼我重新审视"无 API"的真实性。**chrome-devtools network panel 是 30 秒就能否定这个前提的工具**,但它从未在调研阶段被用过。

### 2.3 Phase E 4 专家评审的产品价值盲区

**事实**:Phase E 4 个并行专家评审产出 17 个独立 P0,涵盖:
- E1 代码质量 / 架构(5 P0):路径遍历 / settings flag default / MCP repo 字段 / gate 一致性 / InstallOutcome 命名
- E2 设计一致性(3 P0):Badge 绿色违例 / 自创 amber / reduced-motion 覆盖
- E3 闭环完整性(6 P0):stdio env 不写盘 / Project missing-env / Trash metadata / Auto-classify failed inline / MCP onboarding / MCP filter row
- E4 范围控制(3 P0):CollisionModal 文案谎言 / icon 大小写 / settings default

**0 个 P0 涉及"产品价值层"**。0 个评审问"用户进 marketplace 实际看到几条?这个数量是 marketplace 的合理状态吗?"

用户原话立刻击穿这层盲区:
> "现在的预览版本基本是没法用的,只有 12 个 Skill,也没地方拉取新内容,搜索也只能搜本地,没有什么意义"

用户从 PM 视角 5 秒判断"12 项不是 marketplace,是 stub"。4 个专家评审 + 主 Agent 自检 + 我自己看截图都没识别出。

**为什么?**

| Reviewer | Perspective | 问的问题 |
|---|---|---|
| E1 代码质量 | 代码工匠 | "DATA_MUTEX 全包了吗?reqwest Client 是单例吗?" |
| E2 设计一致性 | 视觉评审师 | "Badge 颜色对吗?reduced-motion 覆盖了吗?" |
| E3 闭环完整性 | 流程审计师 | "三段式契约真闭合?跨页同步对?" |
| E4 范围控制 | 范围警察 | "V1 Out 项零埋点?有过度抽象?" |

**没有任何一个 Reviewer 站在用户角度问"这个产品现在能用吗?"**

这不是 reviewer 失职 — 是评审矩阵设计盲区。我作为主 Agent 设计 4 个 reviewer prompts 时,把"产品价值"当作隐含前提,而非显式 review item。

`fix-must-define-user-observable-success` Rule 锁定"修 fix 要有用户可观测成功" — 但这是 fix 阶段的 Rule。**初次实施阶段**没有对应 Rule。

---

## 3. 转折点 — chrome-devtools 怎么救场

Phase I 30 分钟内完成的调研路径:

```
1. 打开 https://skills.sh/                      [chrome-devtools navigate_page]
2. 看 network requests                          [list_network_requests]
   → 看到 130+ 请求,找有意义的 /api 请求
3. evaluate_script: window.scrollTo(0, doc.height)  [模拟滚到底]
4. 再看 network                                  
   → 发现 reqid=266 GET /api/skills/all-time/3 [pending]
5. curl 加完整 browser headers
   → 60s timeout(无 Origin/Referer)
   → 加 Origin/Referer/Sec-Fetch-Mode → HTTP 200 ✅
6. curl 'https://skills.sh/api/search?q=playwright' 
   → HTTP 200 + searchType: "fuzzy" + 100 results ✅
7. 决策:用 internal API,不需要邮件申请 key,不需要 SSR scrape fallback
```

**关键工具技能**:
1. **chrome-devtools network panel** = 看真实前端 ↔ 后端通讯,**任何前端的 fetch / XHR / RSC 请求都看得到**
2. **evaluate_script 触发 lazy-load** = 模拟滚动 / 点击触发新请求,无须真实 UI 操作
3. **curl 加完整 browser headers** = `User-Agent / Accept / Origin / Referer / Sec-Fetch-Mode` 五件套,90% 的"未文档化 internal API"加这个就能 unauth 调通

这些都不是新技术 — 是任何前端 reverse-engineering 的基本动作。但**调研 SubAgent 们没用过**。

---

## 4. 教训 → 持久化决策

按 `persistence-system.md` Rule:

### Project Rule(`.claude/rules/`,git-tracked)

#### Rule A:`validate-curated-upstream-ids.md`

**核心**:任何 LLM 写"~N 条上游 catalog ID"(npm package / GitHub repo / API endpoint id / domain name)的工作,在合并前必须**逐条**对真实上游验证 200(或等价存在性证明)。**不接受"我相信这是对的"作为合并依据。**

**触发条件**:
- 文件含 `const SEED: &[...]` / `const CURATED_LIST: ...` / `const KNOWN_REPOS: ...` 类静态 ID 名单
- 任何 SubAgent 输出的 fixture / seed / 配置含上游 owner/repo/package 字符串

**验证方式**:
- npm package:`curl https://registry.npmjs.org/<package>` → 200
- GitHub repo:scrape `https://github.com/<owner>/<repo>/tree/main/<path>` HTML(避开 60 req/h API rate limit)
- API endpoint:curl + 加 browser headers
- 在 PR description 引用验证 evidence(curl 输出 / HTML grep 命中)

**为什么 project scope 而非 global**:Multi-project evidence = 1 例(本次)。按 retrospective-to-global anti-pattern,第一次出现就 promote 是错误。等下次跨项目复现再考虑。

#### Rule B:`validate-no-public-api-claim.md`

**核心**:任何"上游无公开 API"的调研结论,必须基于**浏览器 network panel 逆向证据**,不能仅基于文档 / awesome-list 文本调研。

**触发条件**:
- PRD / 调研产物中出现"无 REST API" / "no public API" / "无文档化端点"等结论
- 上游有**用户可访问的网站**(任何 URL 用户能在浏览器打开)

**验证方式**:
1. chrome-devtools / Playwright 真实打开上游网站
2. 浏览相关功能(滚动、搜索、切换分类)触发 lazy-load
3. network panel 列出所有 fetch / XHR endpoint
4. 对每个候选 endpoint:curl + 五件套 headers(User-Agent / Accept / Origin / Referer / Sec-Fetch-Mode)
5. 加 `--compressed` 或在 Rust 端用 reqwest `gzip` feature
6. 确认 unauth 可用 + 响应 schema

"无 API"必须基于上述 evidence。文本调研给出的"无 API"是**未完成的调研**,不是合法结论。

**为什么 project scope**:同上,1 例 evidence。

### Project Memory(`~/.claude/projects/<project>/memory/`,机器本地不版本控制)

#### Memory C:`feedback_no_fallback_phasing.md`(feedback 类)

用户在本任务 Phase I 触发点 explicit 反对"双阶段 fallback / 现做半成品 + 后续做完整版"实施提议:
> "我搞不懂你为什么要做双阶段...我觉得这个还是一定要是真实的才行...如果我拿不到 key,是不是完全没有办法?"

**用户产品哲学**:要么真到位,要么不做。半成品 fallback 在用户视角等于"没法用"。

**何时应用**:面对"P0 立即做 vs P1 全功能后做"决策时,默认问用户先;若主 Agent 自己 propose 方案,**必须以"完整方案 vs 折中方案"两选项**给用户,不能默认走折中。

**何时不适用**:用户 explicit 接受过临时方案的特定项(如 GitHub PAT V1.5 评估)。

#### Memory D:`reference_skills_sh_internal_api.md`(reference 类)

skills.sh 内部 API 端点 + 必需 browser headers + 验证模板。这是项目特定上游知识(下次任何 Skill marketplace / 类似 catalog 工作要用)。

记 endpoint URL pattern + 必需 headers + curl 验证模板,不记 schema 字段(那在代码里)。

### CLAUDE.md(项目级)?

**不更新**:本次教训不属于"基础项目指引"(架构 / 命令 / 设计原则),属于行为约束(Rule)+ 经验观察(Memory),按 persistence-system.md 决策表分流到 Rule + Memory。

### CLAUDE.md(用户级 `~/.claude/CLAUDE.md`)?

**不更新**:同上。用户级 CLAUDE.md 是用户写给自己的稳定偏好,不应被 session 修改。

---

## 5. 数字层面的 cost / benefit

| 阶段 | SubAgent 数 | 主 Agent token | 价值 |
|---|---|---|---|
| Phase A-G(原 7 阶段) | ~20 | ~70% session quota | 5800 行代码 + 评审 + 部署 |
| Phase H1 | 0(主 Agent) | ~5% | MCP envelope 修 + SKILL_SEED 缩 |
| Phase H2 | 0(主 Agent) | ~5% | dedupe + name strip + MCP_SEED 加 |
| **Phase I** | **2(backend + frontend)** | **~10%** | **真实镜像:91k items + 真分页 + 真搜索** |

**净观察**:
- Phase A 投入(spec + SubAgent + 评审 + 修复)在最终产物中的存活率 ≈ 50%
  - 后端 marketplace.rs 主体仍在(SSoT helpers / sanitize / collision / install pipeline)
  - 前端 marketplace 主体仍在(store / pages / components)
  - **被淘汰**:SKILL_SEED 整段 + fetch_skills_seed + scrape enhancement + cache helpers + 整个 Skills cache 流(因 internal API 快足够无需 cache)
- Phase I 用 0.5 倍 Phase A 投入产出 10 倍 Phase A 价值

**根因**:Phase A 的 50% 投入(seed list + GitHub Contents API 路径)是基于**错误前提**(无公开 API)的工程化。**前提验证错过 → 工程投入打折**。

---

## 6. 防御性 mitigation 表

| 失败模式 | 影响 | 防御措施 | 落地 |
|---|---|---|---|
| LLM 写 curated ID list 80% hallucination | Phase H1 + H2 + I 三轮 rework | Rule:逐条验证 200 才合并 | `.claude/rules/validate-curated-upstream-ids.md` |
| "无 API"作为不可逆调研结论 | Phase A 走 GitHub API + seed 弯路 | Rule:必须 browser network panel 逆向证据 | `.claude/rules/validate-no-public-api-claim.md` |
| 4 评审矩阵无 PM 视角 | 12 项 stub 通过评审 | Rule(已有 fix-must-define-user-observable-success)扩展应用到初次实施;主 Agent 派 reviewer 时手动加 PM perspective | (已有 Rule;此处不新建) |
| 文本调研盲区 | "无 API"传播 14+ 次 | Rule B 配套:调研 SubAgent prompt 内强制 chrome-devtools 步骤 | Rule B 文件已含模式 |
| 用户产品哲学未提前对齐 | 双阶段 fallback 提议被打回 | Memory:用户偏好"要么真到位"已记 | `~/.claude/projects/.../memory/feedback_no_fallback_phasing.md` |

---

## 7. 不写到 Rule / Memory 的(已被代码 / commit / log 覆盖)

- Phase A-I 实施细节 → 在代码 + commit message + 04_implementation_log
- 具体技术选型(reqwest gzip 等)→ Cargo.toml 直接看
- 具体 SubAgent prompt → 04_implementation_log
- skills.sh API 字段 schema → types.rs / marketplace.ts
- 当前 marketplace 行为状态 → app 启动看

---

## 8. 一句话结论

**LLM 自由生成"上游 ID 名单"=hallucination 默认行为。任何"无 API"判断 = 必须 browser network panel 实证。任何"产品价值"判断 = 必须用户视角 / 数据规模 sanity check,不能交给静态 reviewer。** 三条 mitigation 落到 2 个 Project Rule + 2 个 Memory entry,执行严谨度交给后续 session。
