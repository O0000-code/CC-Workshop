# Category Hierarchy — Implementation Plan V2

> **Decisional 文档**。任务方向、范围、依赖、风险。
> 实施细节由 SubAgent 在执行期间凭 `02_design_spec.md` V2 + `03_tech_plan.md` V2 自驱；本文档不复制其内容。
> 沿用 `.dev/sidebar-reorder/04_implementation_plan.md` V3 的"方向性"风格（不写代码）；遵守 `.claude/rules/plan-document-style.md`。

## Revision History

**V2（基于 6 评审 P0/P1 + `_v2_patch_plan.md` 主 Agent 锁定决议）**：

- 全 plan 重写为方向性风格，去除 V1 的代码级细节（首版 1794 行 → V2 ≤ 800 行）。
- 任务卡补全 T6a-T6d（V1 漏 — Reviewer E P1-2）。
- T3e dropdown 改造覆盖 9 处（V1 仅 5 — Reviewer F P0-F4）。
- T1d 加 cascade-promote 同名碰撞 disambiguation + parent 删除 confirmation（Reviewer C P0-2 + B P0-4）。
- T1e migration flag 写入 `AppData`（不是 `AppSettings`）+ 失败不写 flag（Reviewer C P0-1 + F P0-F3）。
- 全部 V3 不变量引用编号 23 项（与 02 V2 §7 / 03 V2 §12 一致 — Reviewer E P1-1）。
- T5c 用户验收清单引用 02 V2 §9 全套 42 项（27 客观 + 12 V3 行为零回归 + 3 主观 — Reviewer E P1-9）。

**Cascade footprint**：仅吸收 02 V2 / 03 V2 / `_v2_patch_plan` 的修订，不向回影响其它 Decisional 文档。

## Document Authority Ranking

| Level | Document | Last Modified | Purpose |
|---|---|---|---|
| Decisional | `_synthesis_decisions.md` | 2026-05-04 | 14 决策定锤 |
| Decisional | `_v2_patch_plan.md` | 2026-05-04 | V1 → V2 修订决议 |
| Decisional | `02_design_spec.md` V2 | 2026-05-04 | 视觉/动效/交互 |
| Decisional | `03_tech_plan.md` V2 | 2026-05-04 | 技术架构 |
| Decisional | `04_implementation_plan.md` V2（本文档） | 2026-05-04 | 任务拆分与依赖 |
| Decisional | `.claude/rules/design-language.md` | 2026-05-04 | 设计哲学 Rule |
| Decisional | `.claude/rules/plan-document-style.md` | 2026-05-04 | 本文档遵循的风格 Rule |
| Referential | V3 sidebar-reorder spec / tech plan | 2026-05-03 | V3 不变量基线 |
| Referential | `00_understanding.md` / `01_research/r1-r7` / `05_review/01-06` | 2026-05-04 | 论据 |

冲突：跨级以高层为准；同级提问。

---

## 1. 共同必读（每个 SubAgent 必读，不重复列在各任务卡）

按顺序：
1. `_synthesis_decisions.md`
2. `_v2_patch_plan.md`
3. `02_design_spec.md` V2
4. `03_tech_plan.md` V2
5. 本文档对应任务卡
6. `.claude/rules/design-language.md`
7. `.claude/rules/plan-document-style.md`
8. `.claude/rules/cross-document-cascade-discipline.md`
9. `.claude/rules/verify-third-party-behavior-firsthand.md`
10. `.claude/rules/validate-numerical-equivalence-claims.md`
11. `.claude/rules/grep-before-enumerate-shared-resource.md`
12. `.claude/rules/fallback-path-must-be-unreachable-in-test.md`
13. `.dev/sidebar-reorder/02_design_spec.md` V3 §V3 不变量段
14. `.dev/sidebar-reorder/03_tech_plan.md` V3 §DATA_MUTEX / version 协议段

每条任务卡只在"额外必读"段列任务专属补充材料。

---

## 2. 依赖图

```
Phase 0  T0 概念对齐                                        (1 SubAgent，blocking)

Phase 1  T1a types 字段加法            ─┐
         T1b hierarchy validator       ─┤
         T1c set_category_parent IPC   ─┼─ 5 SubAgent 并行
         T1d delete cascade + 命名碰撞 ─┤
         T1e migration IPC + flag      ─┤
         T1f 测试 + DATA_MUTEX 全枚举  ─┘  (依赖 T1a-T1e 后跑)

Phase 2  T2a appStore + migration 触发  ─┐
         T2b autoClassify parent_id=None─┤
         T2c categoryTree.ts             ─┼─ 4 SubAgent 并行
         T2d treeUtilities + keyboard    ─┘

Phase 3  T3a SortableCategoriesList     ← T2c + T2d
         T3b Row + RowContent + Overlay ← T2c    (T3a / T3b 串行：T3a 调 T3b)
         T3c CategoryPage 聚合          ─┐
         T3d MainLayout count 聚合      ─┼─ 3 SubAgent 并行（依赖 T3a/T3b）
         T3e 9 处 dropdown 改造         ─┘

Phase 4  T4 CSS 增量                                        (1 SubAgent)

Phase 5  T5a 单元 + 集成 + 并发测试                         (1 SubAgent)
         T5b 自动化 gate（tsc + tests + clippy）            (主 Agent 自跑)
         T5c dev server + 用户视觉验证                      (主 Agent + 用户)

Phase 6  T6a 代码审计    ─┐
         T6b 设计还原    ─┼─ 3 SubAgent 并行
         T6c 回归扫描    ─┘
         T6d commit + push                                  (主 Agent，single-developer 直奔 main)
```

每 Phase 之间必跑：`npx tsc --noEmit && npm run test && cd src-tauri && cargo test && cargo clippy -- -D warnings`。任一不绿停下修复。

---

## 3. 任务卡

> 每张卡只列：**前置 / 输出 / 范围 / 关注点 / 验证**。  
> 实现细节让 SubAgent 凭 02 V2 + 03 V2 自驱，不在卡内重复 spec。

### T0 — 概念对齐

- **前置**：无
- **输出**：`05_review/00_v2_alignment_check.md`
- **范围**：通读 V2 全套 + V1→V2 cascade footprint 验证
- **关注点**：14 决策三处一致 / V3 不变量 23 项编号一致 / token 命名一致 / 引用章节真实存在
- **验证**：报告 P0/P1 残留矛盾；任一 P0 → 停下修文档；零 P0 → 进 Phase 1

### T1a — Rust types 字段加法

- **前置**：T0
- **输出**：`src-tauri/src/types.rs` + serde roundtrip 测试
- **范围**：`Category.parent_id` / `Skill.category_id` / `McpServer.category_id` / `SkillMetadata.category_id` / `McpMetadata.category_id` / `AppData.has_completed_category_id_migration`（按 03 V2 §2 + §3.5）
- **关注点**：全部 `Option<String>` + `#[serde(default, skip_serializing_if = "Option::is_none")]`；保留旧 `category: String` 兼容期；旧 data.json 反序列化无异常
- **验证**：`cargo test` 全绿；旧 fixture 反序列化测试通过

### T1b — Hierarchy validator

- **前置**：T1a
- **输出**：`data.rs::validate_hierarchy` + 5+ pure tests
- **范围**：cycle / max-depth / orphan / cannot-demote-with-children 四种错误（按 03 V2 §3.2）
- **关注点**：纯函数；50 categories 性能 < 1ms
- **验证**：5+ unit tests 全绿

### T1c — set_category_parent IPC

- **前置**：T1b
- **输出**：data.rs IPC + lib.rs 注册 + integration test
- **范围**：`set_category_parent(id, new_parent_id: Option<Option<String>>)`（按 03 V2 §3.3 + P1-6 三态语义）
- **关注点**：DATA_MUTEX 持锁；调 validator；返回 `Vec<Category>` 给前端 calibrate
- **验证**：integration test（set parent + read back）

### T1d — delete_category cascade + 命名碰撞 + confirmation 任务前置

- **前置**：T1b
- **输出**：data.rs 修订 + 2 NEW integration tests
- **范围**：cascade-promote 子类到根 + 同名碰撞 disambiguation `<原名> (<父类名>)`（按 `_v2_patch_plan` §3.5 + 03 V2 §3.6）；ContextMenu Delete 弹 confirmation dialog 任务前置（按 02 V2 §2.21 + `_v2_patch_plan` §3.6）
- **关注点**：disambiguation 写日志；冲突时数字后缀 fallback；confirmation dialog 用 NSAlert / React Modal（与现有项目一致）
- **验证**：父类有子类 + 子类与根重名 → 删除后两根名互不冲突；UI confirmation dialog 弹出 + 取消按钮工作

### T1e — Migration IPC + flag

- **前置**：T1a
- **输出**：data.rs `migrate_category_id_for_skills_mcps` + AppData flag + integration test
- **范围**：按 name 找 category_id 写回 metadata；flag 在 `AppData`（不是 `AppSettings`，按 `_v2_patch_plan` §3.3）；失败**不写 flag**（按 §3.4）
- **关注点**：幂等 / 失败回滚 / orphan 处理 / atomic write
- **验证**：旧 data.json fixture → migrate → 全部 metadata.category_id 正确；失败注入 → flag 仍 false

### T1f — 测试 + DATA_MUTEX 全 callsite 核查

- **前置**：T1a-T1e
- **输出**：补 pure / integration / concurrency / migration 测试 + 漏锁 mutator 加锁
- **范围**：grep `read_app_data|write_app_data` 重新枚举（按 03 V2 §3.1 + grep-before-enumerate Rule）；P1-5 `update_skill_metadata` / `update_mcp_metadata` 加 DATA_MUTEX
- **关注点**：所有 mutator 持锁；并发 reorder + add + set_parent + migrate 无 lost update；fallback-path-must-be-unreachable-in-test 仍生效
- **验证**：cargo test 全绿 + cargo clippy zero warnings + 并发测试通过

### T2a — appStore + migration 触发

- **前置**：T1c + T1e
- **输出**：`src/stores/appStore.ts` 修订
- **范围**：`moveCategoryToParent` action（two-phase commit + enqueueReorder）；initApp 检测 `data.hasCompletedCategoryIdMigration` 触发 migration（按 03 V2 §4）
- **关注点**：保留 V3 categoriesVersion 协议；reorderCategories 失败 fallback 优先 `get_categories`（P1-7）；async/await 双 IPC 顺序（P0-ARCH-3）
- **验证**：vitest 全绿；categoriesVersion 自增；并发 reorder + setParent 顺序保持

### T2b — autoClassify parent_id=None

- **前置**：T1a
- **输出**：`skillsStore.ts` / `mcpsStore.ts` / `claudeMdStore.ts` 各 1-2 行
- **范围**：addCategory call 显式 parent_id=None（按 03 V2 §9）
- **关注点**：prompt 不变（D14=A）
- **验证**：单测 mock IPC payload 含 parent_id=None

### T2c — categoryTree.ts

- **前置**：无（独立工具）
- **输出**：`src/utils/categoryTree.ts` + tests
- **范围**：`collectDescendantIds` / `isAncestorOf` / `findRootOf`（按 03 V2 §4.5）
- **关注点**：max depth=2 时 O(n) 即可
- **验证**：单测覆盖 cycle / 多父 / 空树 / 单节点

### T2d — treeUtilities + treeKeyboardCoordinates

- **前置**：无
- **输出**：`src/components/sidebar/dnd/treeUtilities.ts` + `treeKeyboardCoordinates.ts` + tests
- **范围**：flattenTree / buildTree / getProjection / removeChildrenOf（按 03 V2 §6）；keyboard ←/→ promote/demote
- **关注点**：max depth=1 clamp；keyboardCoordinates 用 `MutableRefObject<TreeSensorContext>` + `event.preventDefault()`（P0-ARCH-1）；引证 dnd-kit 官方 Tree example
- **验证**：单测 + 键盘流 mock test

### T3a — SortableCategoriesList

- **前置**：T2c + T2d
- **输出**：`src/components/sidebar/SortableCategoriesList.tsx` 修订
- **范围**：flatten + onDragMove projection + dwell timer + onDragEnd subtree splice + chevron 折叠/展开 + localStorage `expandedCategories`（按 02 V2 + 03 V2 §5.2）
- **关注点**：handleDragEnd `async` + 双 IPC 顺序（P0-ARCH-3）；subtree splice on baseFlat 不用 `arrayMove(flattened)`（P0-ARCH-2）；dwell 状态机三态（02 V2 §2.14）；保留全部 V3 不变量
- **验证**：dev mode 实测拖动 / 折叠 / promote / demote 全路径

### T3b — Row + RowContent + DragOverlay

- **前置**：T2c
- **输出**：`SortableCategoryRow.tsx` / `CategoryRowContent.tsx` / `DragOverlayCategoryRow.tsx` 修订
- **范围**：depth prop + padding-left + chevron 渲染（仅父类有子类）+ DragOverlay 与 inline row 同 padding（按 02 V2 §2.5 / §2.4 / §2.3）
- **关注点**：chevron 三层防御（data-no-dnd + onMouseDown stopPropagation + button native）；listeners chain 不抢占 keyboard（P0-VIZ-2）；CSS.Translate（不能 Transform）；padding-left 220ms transition（P1-10）
- **验证**：单测 + dev mode 实测

### T3c — CategoryPage 聚合

- **前置**：T2c + T1a
- **输出**：`src/pages/CategoryPage.tsx` 修订
- **范围**：collectDescendantIds 计算 visibleIds → filter（按 03 V2 §5.8）
- **关注点**：兼容期 dual-read（category_id 优先，name fallback）
- **验证**：父类视图含所有子类内容；子类视图仅自身

### T3d — MainLayout count 聚合

- **前置**：T2c
- **输出**：`MainLayout.tsx:96-104` 修订
- **范围**：categoriesWithCounts 用 collectDescendantIds 聚合（D8=B，按 `_synthesis_decisions` §2.1）
- **关注点**：父类 count = 自身 + 所有子级；子类 count = 自身
- **验证**：sidebar 数字 = CategoryPage 内可见项目数

### T3e — Dropdown 树形改造（9 处）

- **前置**：T1a + T2a
- **输出**：6 dropdown + 3 display fallback 修订
- **范围**：按 03 V2 §5.9 完整 9 处清单（**含 `CreateSceneModal.tsx:447, 487, 865`** — P0-DATA-4）
- **关注点**：缩进 16px + 父类可选；value 改为 categoryId（D1=A）；考虑抽 `<CategoryTreeDropdown>` 共享组件
- **验证**：每个 dropdown 视觉树形；选中后 metadata.category_id 写入正确

### T4 — CSS 增量

- **前置**：无
- **输出**：`src/index.css` 追加段
- **范围**：`--indent-step: 16px` + chevron rotation + reduced-motion 增量（按 03 V2 §7）
- **关注点**：不修改 V3 已有 token；chevron 120ms 复用 `--ease-drag`（不引入新曲线）
- **验证**：浏览器中 V3 既有动画无回归

### T5a — 测试

- **前置**：T3 + T4
- **输出**：`__tests__/` 下若干新文件
- **范围**：treeUtilities / categoryTree / appStore reorder + setParent / SortableCategoriesList / migration roundtrip
- **关注点**：mock IPC；jsdom 不支持 PointerEvent → 拖动手势改主 Agent dev mode 验
- **验证**：vitest 全绿

### T5b — 自动化 gate

- **前置**：T5a
- **操作**：`npx tsc --noEmit && npm run test && cd src-tauri && cargo test && cargo clippy -- -D warnings`
- **验证**：全绿才进 T5c

### T5c — dev server + 用户视觉验证

- **前置**：T5b
- **操作**：主 Agent 启 `npm run tauri dev`，给用户 02 V2 §9 完整 acceptance 清单（27 客观 + 12 V3 行为零回归 + 3 主观，共 42 项）
- **验证**：用户逐项打勾；任何 P0 → 回 Phase 修复

### T6a — 代码审计

- **前置**：T5c
- **输出**：`05_review/07_post_impl_code_audit.md`
- **范围**：所有改动文件 vs 03 V2 / V3 不变量 23 项；DATA_MUTEX 持锁核查；TS 类型安全
- **验证**：零 P0/P1

### T6b — 设计还原度审计

- **前置**：T5c
- **输出**：`05_review/08_post_impl_design_audit.md`
- **范围**：vs 02 V2 视觉规格逐项；token 化纪律；anti-pattern 检查
- **验证**：零 P0/P1

### T6c — 回归扫描

- **前置**：T5c
- **输出**：`05_review/09_post_impl_regression_audit.md`
- **范围**：grep 全 codebase 隐藏地雷（含 R5 列出 10 项 + 测试 fixture / mock）；现有功能 ≥ 20 个核心场景逐项验
- **验证**：零 P0/P1

### T6d — Commit + Push

- **前置**：T6a + T6b + T6c 全过
- **操作**：按 phase 分 commit（直奔 main，按 MEMORY"feedback_no_pr_for_personal_changes"）
- **Commit messages**：Conventional Commits，例如 `feat(sidebar): hierarchical (depth-2) Categories with drop-into nesting`、`feat(data): introduce category_id reference + parent_id with one-shot migration`

---

## 4. 风险登记

> 每条标 (P)概率 / (I)影响 / 缓解。

1. (低/高) DATA_MUTEX 死锁 — 单锁非递归 + 并发测试
2. (中/中) 父类拖动时 children Vec 顺序错乱 (P0-ARCH-2) — subtree splice on baseFlat
3. (中/中) 双 IPC stale ordered_ids (P0-ARCH-3) — async/await + setParent 后才计算 reorder
4. (低/高) Migration 失败仍写 flag — 03 V2 §3.4 atomic + transaction
5. (低/高) Cascade-promote 同名冲突 — disambiguation 重命名
6. (中/低) localStorage 跨 worktree — 单机本地，非协作
7. (低/中) chevron click 抢占 row click — 三层防御 + listeners chain
8. (中/低) dwell 80ms 体感偏长 — dev mode 微调到 50-100ms
9. (低/低) treeKeyboardCoordinates 与 dnd-kit 默认 ←/→ 冲突 — 替换 coordinateGetter 而非链式
10. (低/中) 5+ dropdown 风格漂移 — 抽 `<CategoryTreeDropdown>` 共享
11. (低/高) update_skill_metadata 漏锁 — P1-5 加锁 + 并发测试
12. (低/中) 旧 data.json 反序列化失败 — 6 个 fixture 测试覆盖
13. (中/低) reduced-motion 退化未覆盖新动效 — 02 V2 §2.18 全套 + grep 验证
14. (低/低) autoClassify race 过 version 协议 — 已有 V3 协议保护
15. (低/低) Trash 恢复孤儿子类 — restore 时按 root 处理
16. **V3 不变量 23 项**：每张任务卡末尾"V3 不变量回归核对"必须列至少受影响项；任何破坏 = P0

---

## 5. SubAgent 投递策略

按 `~/.claude/CLAUDE.md` 第二章：

| Phase | 投递方式 |
|---|---|
| T0 | 1 SubAgent，blocking |
| T1a-T1f | T1a 单发 → T1b/c/d/e 4 并行 → T1f 单发 |
| T2a-T2d | 4 并行（T2a 依赖 T1c/T1e；T2b 依赖 T1a；T2c/T2d 独立） |
| T3a/T3b | 串行（T3a 调用 T3b 产物） |
| T3c-T3e | 3 并行 |
| T4 | 单发（可与 T3 并行） |
| T5a | 单发 |
| T5b | 主 Agent 自跑 |
| T5c | 主 Agent + 用户 |
| T6a-T6c | 3 并行 |
| T6d | 主 Agent 自跑 |

每 SubAgent：Opus / blocking / 自包含 prompt（必读 §1 共同必读 + 任务卡 + 任务专属补充）。

---

## 6. 退场条件

1. ☐ T0 无 P0 残留矛盾
2. ☐ T1-T5b 自动化 gate 全绿
3. ☐ T5c 用户验证 02 V2 §9 全过
4. ☐ T6a/b/c 三审计零 P0/P1
5. ☐ T6d commit 完成

任一未达 → 回对应 Phase 修复 + 重跑全套 gate。
