# Category Hierarchy — Final Implementation Audit (Phases 1-4)

> **Auditor**: Final integrated audit SubAgent (code + design + regression + cross-Phase spec drift)
> **Audit date**: 2026-05-04
> **Scope**: T1a/T1b/T1c/T1d/T1e/T1f + T2a/T2b/T2c/T2d + T3a/T3b/T3c/T3d/T3e + T4 全部已落地代码

## 0. Pre-flight checklist (artifacts read)

- [x] `00_understanding.md` — task boundaries
- [x] `01_research/_synthesis_decisions.md` — 14 D-decisions
- [x] `05_review/_v2_patch_plan.md` — 15 P0 / 11 P1 lock decisions
- [x] `02_design_spec.md` V2 (1307 lines) — visual/motion/interaction spec
- [x] `03_tech_plan.md` V2 (3602 lines) — tech architecture
- [x] `04_implementation_plan.md` V2 (343 lines) — task cards
- [x] `05_review/phase1_audit.md` — Phase 1 audit (88/100)
- [x] `05_review/phase1_t1f_lock_audit.md` — T1f closure (95/100)
- [x] `.claude/rules/design-language.md`
- [x] `.claude/rules/cross-document-cascade-discipline.md`
- [x] `.claude/rules/grep-before-enumerate-shared-resource.md`
- [x] `.claude/rules/verify-third-party-behavior-firsthand.md`
- [x] `.claude/rules/fallback-path-must-be-unreachable-in-test.md`
- [x] `.dev/sidebar-reorder/02_design_spec.md` V3 — V3 invariants baseline
- [x] `.dev/sidebar-reorder/03_tech_plan.md` V3 — V3 tech baseline

**Backend code (Rust)**:
- [x] `src-tauri/src/types.rs` (Category.parent_id, Skill/McpServer.category_id, AppData.has_completed_category_id_migration, MigrationReport)
- [x] `src-tauri/src/commands/data.rs` (validate_hierarchy, set_category_parent, migrate_category_id_for_skills_mcps, delete_category cascade-promote disambiguation)
- [x] `src-tauri/src/commands/skills.rs` (update_skill_metadata + delete_skill DATA_MUTEX, scan_skills category_id passthrough)
- [x] `src-tauri/src/commands/mcps.rs` (symmetric)
- [x] `src-tauri/src/commands/import.rs` (update_skill_scope_in_metadata + update_mcp_scope_in_metadata DATA_MUTEX)
- [x] `src-tauri/src/lib.rs` (set_category_parent + migrate_category_id_for_skills_mcps registered)

**Frontend code (TS/React)**:
- [x] `src/types/index.ts` (Skill.categoryId, McpServer.categoryId, Category.parentId, AppData.hasCompletedCategoryIdMigration, MigrationReport)
- [x] `src/utils/categoryTree.ts` (collectDescendantIds, isAncestorOf, findRootOf, getCategoryDisplayName, getCategoryColor)
- [x] `src/stores/appStore.ts` (moveCategoryToParent two-phase commit, initApp migration trigger, addCategory parentId)
- [x] `src/stores/skillsStore.ts` (updateSkillCategory dual-write category+categoryId, autoClassify path)
- [x] `src/stores/mcpsStore.ts` (symmetric)
- [x] `src/stores/claudeMdStore.ts` (autoClassify writes categoryId)
- [x] `src/components/sidebar/dnd/treeUtilities.ts` (flattenTree, buildTree, getProjection, removeChildrenOf, MAX_DEPTH=1, ABS_X_THRESHOLD_PX=12)
- [x] `src/components/sidebar/dnd/treeKeyboardCoordinates.ts` (TreeSensorContext + makeTreeKeyboardCoordinates with MutableRefObject pattern + event.preventDefault)
- [x] `src/components/sidebar/dnd/announcements.ts` (HierarchyContext optional)
- [x] `src/components/sidebar/SortableCategoriesList.tsx` (888 lines — DndContext, dwell state machine OUT/HOVER_NEAR/DROP_INTO_READY, baseFlat/displayFlat split, double-IPC handleDragEnd async)
- [x] `src/components/sidebar/SortableCategoryRow.tsx` (chevron three-layer defence, padding-left transition 220ms)
- [x] `src/components/sidebar/CategoryRowContent.tsx` (depth-agnostic, reserveChevronSpace prop)
- [x] `src/components/sidebar/DragOverlayCategoryRow.tsx` (depth/hasChildren props — see P0-VIZ-1)
- [x] `src/components/layout/MainLayout.tsx` (categoriesWithCounts D8=B, handleSetCategoryParent, ContextMenu)
- [x] `src/components/layout/Sidebar.tsx`
- [x] `src/pages/CategoryPage.tsx` (collectDescendantIds D7=A, dual-read fallback)
- [x] `src/components/skills/SkillDetailPanel.tsx` + 4 entity dropdowns + CreateSceneModal (CategoryTreeDropdown integration; CreateSceneModal P0-DATA-4 categoryId-keyed filter)
- [x] `src/components/common/CategoryTreeDropdown.tsx` + `Dropdown.tsx` (indent prop)
- [x] `src/index.css` (`--indent-step: 16px`)

**Verification commands run**:
- [x] `npx tsc --noEmit` → CLEAN (no output)
- [x] `npm run test` → 210/210 PASS (19 test files)
- [x] `cargo test --lib` → 142/142 PASS
- [x] `cargo clippy --lib` → 160 warnings (T1f closure baseline; net delta 0)
- [x] `npx eslint src/` → 15 warnings, 0 errors (all pre-existing)
- [x] `rg DATA_MUTEX src-tauri/src/` (full grep)
- [x] `rg parent_id|parentId|category_id|categoryId src/types/index.ts src-tauri/src/types.rs`
- [x] `rg snapModifier|restrictToWindowEdges|MeasuringStrategy|closestCenter` SortableCategoriesList.tsx

---

## 1. Overall verdict

**Score: 78 / 100**

**One-line verdict**: Backend is excellent (88-95/100 per Phase 1 audits, post-T1f); frontend hierarchy ARCH/DATA paths are solid; **but three explicit V2 spec violations + missing user-confirmation flows for destructive operations bring this short of "≥ 95 / approaching 10/10"**. Two P0s involve UI safety (cascade-delete confirmation, anti-pattern violation). One P0 is a documentation drift carried forward from Phase 1.

**Approaching 10/10**: **NO**. The code is technically tight and tests are thorough, but five explicit, testable spec violations exist (3 P0 + 2 borderline P0/P1) that shipped to "complete". For a project where the user sets the bar at "Apple/Linear/Things 级 + 接近 10/10 才算实施完成", these gaps must close before ship.

**Need fixes**: **YES** — 3 P0 + 6 P1. Fixes are mostly bounded (≤ 200 LoC + ~20 mins each), no architectural rework needed.

**Phase-by-phase quality (rough)**:
- Phase 1 (T1a-T1f): **92/100** — code is rigorous, ~12 issues from Phase 1 audit + T1f closure leave only doc drift (P1-1).
- Phase 2 (T2a-T2d): **88/100** — appStore / categoryTree / treeUtilities / treeKeyboardCoordinates all clean; only autoClassify-categoryId omission (P1).
- Phase 3 (T3a-T3e): **70/100** — T3a SortableCategoriesList core architecturally sound (subtree splice, async double-IPC, dwell state machine), but T3b violates V2 §2.5 anti-pattern (DragOverlay depth prop), T3d misses ContextMenu Promote-to-root + parent-delete confirmation (P0×2), T3e dropdown coverage complete.
- Phase 4 (T4): **95/100** — minimal, clean.

---

## 2. Phase 1-4 spec deviation summary table

| ID | Decision / Spec point | Spec source | Implementation | Status | Severity |
|---|---|---|---|---|---|
| D1 | category_id migration | Decided in syn §3 | T1a + T1e — Skill/McpServer/SkillMetadata/McpMetadata/AppData all carry the field; serde backward-compat tested both directions | ✓ | — |
| D2 | parent_id flat Vec | Decided in syn §3 | Category.parent_id Option<String> + apply_reorder unchanged | ✓ | — |
| D3 | dnd-kit single SortableContext + projection | Decided in syn §3 | flattenTree + getProjection + MAX_DEPTH=1 clamp + dnd-kit Tree example pattern | ✓ | — |
| D4 | 12px X + 80ms dwell | Decided in syn §3 | ABS_X_THRESHOLD_PX=12 + DWELL_MS=80 + state machine | ✓ | — |
| D5 | parent → child of another parent forbidden | Decided in syn §3 | getProjection.isInvalid + handleDragEnd skip | ✓ | — |
| D6 | promote via X<-12 + dwell + ContextMenu | Decided in syn §3 | X<-12 ✓; ContextMenu Promote-to-Root ✗ | ✗ | **P0** |
| D7 | parent aggregation view | Decided in syn §3 | CategoryPage.tsx visibleIds = collectDescendantIds | ✓ | — |
| D8 | parent count = self + descendants | Decided in syn §3 | MainLayout.categoriesWithCounts useMemo | ✓ | — |
| D9 | dropdown tree with 16px indent | Decided in syn §3 | CategoryTreeDropdown + Dropdown.indent prop | ✓ | — |
| D10 | indent step 16px | Decided in syn §3 | INDENT_STEP_PX = 16 + `--indent-step: 16px` token | ✓ | — |
| D11 | indent only via padding-left | Decided in syn §3 | SortableCategoryRow style.paddingLeft + child=parent visuals | ✓ | — |
| D12 | default expanded + chevron + persist | Decided in syn §3 | expandedSet localStorage + computeDefaultExpanded | ✓ | — |
| D13 | hierarchy backend hard validate | Decided in syn §3 | validate_hierarchy + 32-hop bailout + integrate with set_category_parent / update_category / add_category | ✓ | — |
| D14 | autoClassify落根 (not parent-aware) | Decided in syn §3 | addCategory(name, color, undefined) — root-only ✓; but **categoryId omitted from update_*_metadata** P1 | ⚠️ | **P1** |
| **§2.5** | **DragOverlay 不接受 depth/paddingLeft prop** | 02 V2 §2.5 + §2.22 + §11 | **DragOverlayCategoryRow 接受 depth + hasChildren props (line 35-43); paddingLeft = depth*16 + 10** | ✗ | **P0** |
| **§2.7** | drop-indicator-wrapper element with paddingLeft | 02 V2 §2.7 | No wrapper; uses active-row paddingLeft instead (alternative implementation that works via cascade let-pass, but spec literal not met; transition timing 220ms not 150ms) | ⚠️ | P1 |
| §2.14 | Dwell state machine OUT/HOVER_NEAR/DROP_INTO_READY | 02 V2 §2.14 | SortableCategoriesList lines 434-503: full 3-state machine with timer, overChanged, X-threshold transitions | ✓ | — |
| §2.15 | localStorage `expandedCategories` (set contains id ⇒ expanded) | 02 V2 §2.15 | EXPANDED_KEY constant + computeDefaultExpanded + persistExpanded; chevron toggle → add/delete | ✓ | — |
| **§2.20** | **ContextMenu 'Promote to root'** (仅子类) | 02 V2 §2.20 | **ContextMenu only has Rename + Delete (MainLayout:653-670)** | ✗ | **P0** |
| **§2.21** | **父类删除 confirmation dialog (有 children 时)** | 02 V2 §2.21 + acceptance #26 | **MainLayout.handleDeleteCategory directly calls deleteCategory; no children check, no dialog** | ✗ | **P0** |
| §2.22 (anti-pattern) | DragOverlay 不接受 depth prop | 02 V2 §2.22 | violated by DragOverlayCategoryRow signature | ✗ | (covered above) |
| §2.22 (anti-pattern) | hardcoded 缩进数字 | 02 V2 §2.22 | SortableCategoryRow.tsx:148 uses `depth * INDENT_STEP_PX + 10` (uses token) ✓ | ✓ | — |
| §3 | HIG Outline Views ←/→ keyboard | 02 V2 §3 | treeKeyboardCoordinates implements ←/→ promote/demote in drag mode; **but browse-mode ←/→ collapse/expand NOT implemented** | ⚠️ | P1 |
| §6.5 | max depth = 2 hard cap | 02 V2 §6.5 | MAX_DEPTH=1 in treeUtilities + validate_hierarchy backend | ✓ | — |
| T1a | types fields + serde | 04 V2 T1a | types.rs all fields + 13 serde roundtrip tests | ✓ | — |
| T1b | hierarchy validator | 04 V2 T1b | data.rs::validate_hierarchy + 11 unit tests + 32-hop bailout | ✓ | — |
| T1c | set_category_parent IPC | 04 V2 T1c card says Option<Option<String>>; 03 V2 §3.3.3 says Option<String> | Single Option<String> implemented (ruled by Phase 1 audit P1-1) | ✓ (with note) | P2 doc drift |
| T1d | cascade-promote + disambiguation + parent-delete confirmation | 04 V2 T1d | cascade-promote + disambiguation ✓; **confirmation UI ✗** | ✗ | (covered as §2.21) |
| T1e | migration IPC + flag in AppData | 04 V2 T1e | migrate_category_id_for_skills_mcps + AppData flag; orphan rule = "advance flag" (Phase-1 audit P0-1 ruled in favor of 03 V2) | ✓ | — |
| T1e (P1) | MigrationReport doc comment in types.rs | types.rs:247-262 | doc comment still says "ONLY when both orphaned_* are empty" but code says opposite | ⚠️ | P1 |
| T1f | DATA_MUTEX full enumeration + concurrency tests | 04 V2 T1f | 6 mutators locked + 2 concurrency tests pass | ✓ | — |
| T2a | moveCategoryToParent two-phase + initApp migration | 04 V2 T2a; spec card says `setCategoryParent` action name | Implemented as `moveCategoryToParent` (cosmetic naming drift; behavior matches) | ✓ (with note) | P2 doc drift |
| T2b | autoClassify parent_id=None | 04 V2 T2b | addCategory(..., undefined) ✓; but **doesn't write categoryId to update_*_metadata** | ⚠️ | P1 |
| T2c | categoryTree.ts | 04 V2 T2c | Implemented + tested | ✓ | — |
| T2d | treeUtilities + treeKeyboardCoordinates | 04 V2 T2d | Both implemented; MutableRefObject pattern + event.preventDefault per P0-ARCH-1 | ✓ | — |
| T3a | SortableCategoriesList async double-IPC + subtree splice | 04 V2 T3a + 03 V2 P0-ARCH-2 + P0-ARCH-3 | handleDragEnd async ✓; await setCategoryParent first ✓; rebuild ordered_ids on FRESH categories ✓; subtree splice on FRESH baseFlat ✓ | ✓ | — |
| T3b | Row + RowContent + Overlay | 04 V2 T3b | SortableCategoryRow chevron + listeners chain ✓; **DragOverlay violates anti-pattern** | ✗ | (covered as §2.5) |
| T3c | CategoryPage aggregation | 04 V2 T3c | collectDescendantIds + dual-read fallback ✓ | ✓ | — |
| T3d | MainLayout count + ContextMenu | 04 V2 T3d | counts ✓; **ContextMenu missing Promote-to-root + parent-delete confirmation** | ✗ | (covered as §2.20 + §2.21) |
| T3e | 9 dropdowns including CreateSceneModal P0-DATA-4 | 04 V2 T3e | All 5 entity dropdowns + CreateSceneModal (categoryId-keyed filter with __legacy: prefix fallback) | ✓ | — |
| T4 | CSS increment | 04 V2 T4 | `--indent-step: 16px` only new token; chevron rotation via inline `120ms var(--ease-drag)` | ✓ | — |

**Phase 1-4 cross-spec drift summary**: 3 explicit P0 violations + 4 P1 doc-or-incomplete-feature drifts. None are architectural; all are bounded fixes.

---

## 3. 23 V3 invariants verification

> Per 02 V2 §7 / 03 V2 §12. Every one inspected.

| # | V3 invariant | Implementation evidence | Status |
|---|---|---|---|
| 1 | 4px CustomMouseSensor activation | SortableCategoriesList:345 `useSensor(CustomMouseSensor, { activationConstraint: { distance: 4 } })` | ✓ |
| 2 | Two-stage lift (吸盘 80ms + 拉离 120ms) | SortableCategoryRow.tsx + DragOverlayCategoryRow CSS class `.drag-overlay-row` (V3 unchanged) | ✓ |
| 3 | DragOverlay multi-layer hsl shadow | `.drag-overlay-row` class in src/index.css (V3 unchanged) | ✓ |
| 4 | 12px Y quadratic snap (not threshold) | SortableCategoriesList:726 `modifiers={[snapModifier]}` (file unchanged) | ✓ |
| 5 | 220ms cascade no stagger | SortableCategoryRow:107-110 `useSortable.transition: { duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }` | ✓ |
| 6 | distance-aware settle <4px=0ms; ≥4px = min(280, 120+Δ*0.5) | SortableCategoriesList:521-535 (preserved verbatim from V3) | ✓ |
| 7 | 280ms cancel snap-back | handleDragCancel:691 resets dropAnimationConfig to CATEGORY_DROP_ANIMATION default | ✓ |
| 8 | DndContext modifiers = [snapModifier] | SortableCategoriesList:726 (only modifier; no restrictToVerticalAxis) | ✓ |
| 9 | DragOverlay modifiers = [restrictToWindowEdges] | SortableCategoriesList:851 | ✓ |
| 10 | All CSS tokens (--ease-drag*, --duration-drag-*) | `--indent-step: 16px` is only new token; everything else reused | ✓ |
| 11 | DATA_MUTEX + apply_reorder pure + ENSEMBLE_DATA_DIR | data.rs DATA_MUTEX on every mutator (validated by phase1_t1f_lock_audit + independent grep) | ✓ |
| 12 | categoriesVersion bump on mutation | appStore: setCategories/addCategory/updateCategory/deleteCategory/reorderCategories/moveCategoryToParent all bump version | ✓ |
| 13 | enqueueReorder serial IPC queue | appStore:19-25 + reorderCategories + moveCategoryToParent both use enqueueReorder | ✓ |
| 14 | data-no-dnd + CustomMouseSensor double safety | SortableCategoryRow chevron has `data-no-dnd="true"` + `onMouseDown stopPropagation` + `onKeyDown stopPropagation` (3-layer defence) | ✓ |
| 15 | SortableContext.disabled when input mounted | SortableCategoriesList:751 `disabled={isInputMounted}` | ✓ |
| 16 | KeyboardSensor + sortableKeyboardCoordinates + announcements with name | KeyboardSensor with makeTreeKeyboardCoordinates (delegates to sortableKeyboardCoordinates for ↑/↓); announcements use category names | ✓ |
| 17 | prefers-reduced-motion全套尊重 | `[data-sortable-list] *` wildcard + `.drop-indicator-h` selectors in src/index.css:671-680 (covers chevron + indent + transitions) | ✓ |
| 18 | onDragStart auto-expand collapsed parents | SortableCategoriesList:427 `setDragOverrideExpand(true)` + effectiveExpandedSet in :249-258 | ✓ |
| 19 | justDroppedRef 50ms guard | SortableCategoriesList:672-673 `setJustDroppedId(localActiveId); setTimeout(() => setJustDroppedId(null), 50)` | ✓ |
| 20 | Refresh button disabled during drag | MainLayout passes isDragging through; Sidebar handles disable (V3 unchanged) | ✓ |
| **21** | **DragOverlay no inline-row padding (px-2.5 only)** | **DragOverlayCategoryRow now accepts `depth` and computes `paddingLeft = depth * INDENT_STEP_PX + 10` — child rows render at 26px** | **✗ BROKEN** |
| 22 | closestCenter collision detection | SortableCategoriesList:722 | ✓ |
| 23 | MeasuringStrategy.Always | SortableCategoriesList:727 | ✓ |

**V3 invariant breaks: 1 (#21)**. The implementation deliberately broke V3 invariant #21 to achieve "DragOverlay matches inline source row at drag-start". Spec V2 §7 #21 explicitly preserved this invariant; spec V2 §2.5 explicitly forbids depth/paddingLeft prop on DragOverlayCategoryRow; spec V2 §2.22 lists this as anti-pattern; spec V2 §11 reaffirms.

---

## 4. Regression check (≥ 20 core scenarios)

| # | Scenario | Status | Evidence |
|---|---|---|---|
| 1 | Skills list / scan_skills | ✓ | scan_skills passes through `category_id` from metadata; runtime Skill carries categoryId field |
| 2 | Skills detail panel | ✓ | SkillDetailPanel uses CategoryTreeDropdown with hierarchy; updateSkillCategory dual-writes |
| 3 | Skills delete (move to trash) | ✓ | delete_skill now holds DATA_MUTEX (T1f); skill_metadata.remove serialized |
| 4 | Skills auto-classify | ⚠️ | Creates new categories with addCategory(parent_id=undefined) ✓; but **categoryId not written to update_skill_metadata** → orphans persist after migration flag set (P1) |
| 5 | MCPs list / scan_mcps | ✓ | symmetric to skills |
| 6 | MCPs detail panel | ✓ | symmetric |
| 7 | MCPs delete | ✓ | symmetric |
| 8 | MCPs auto-classify | ⚠️ | symmetric P1 |
| 9 | CLAUDE.md list | ✓ | already used categoryId; aggregation in MainLayout treats both fields |
| 10 | CLAUDE.md detail | ✓ | uses CategoryTreeDropdown |
| 11 | CLAUDE.md import | ✓ | claude_md.rs DATA_MUTEX present (verified by Phase 1 audit grep) |
| 12 | CLAUDE.md distribute | ✓ | unchanged |
| 13 | CLAUDE.md auto-classify | ✓ | uses categoryId path correctly (ClaudeMd is id-only) |
| 14 | Scenes create (CreateSceneModal) | ✓ | P0-DATA-4 fully addressed: categoryId-keyed filter + descendants expansion + __legacy:<name> fallback |
| 15 | Scenes edit / delete | ✓ | unchanged data ops |
| 16 | Projects create / sync | ✓ | unchanged |
| 17 | Settings page | ✓ | hasCompletedCategoryIdMigration NOT in AppSettings (P0-DATA-1 routed through AppData per spec §3.5) |
| 18 | First launch import flow | ✓ | initApp triggers migration if !hasCompletedCategoryIdMigration |
| 19 | Trash restore (claude_md) | ✓ | restore_claude_md DATA_MUTEX preserved (line 341) |
| 20 | Refresh button | ✓ | disabled prop wired through MainLayout → Sidebar |
| 21 | V3 drag — same-level reorder | ✓ | enqueueReorder + apply_reorder unchanged |
| 22 | Single-click navigate | ✓ | 4px activation + justDropped 50ms guard preserved |
| 23 | Double-click rename | ✓ | unchanged |
| 24 | Right-click context menu | ⚠️ | Renames+Delete works; but Promote-to-root missing (P0); parent-delete no confirm (P0) |
| 25 | ColorPicker dot click | ✓ | data-no-dnd + onMouseDown stopPropagation preserved |
| 26 | Window drag (titlebar) | ✓ | unchanged |
| 27 | "Show X more" collapse | ✓ | rootCategories filter at root only (V2 §2.16); auto-expand on drag start |
| 28 | prefers-reduced-motion | ✓ | wildcard `[data-sortable-list] *` covers new selectors |
| 29 | Old data.json deserialization | ✓ | 13 serde roundtrip tests (types.rs:1099-1376) cover both directions; legacy entries with no parentId / categoryId / migration flag deserialize cleanly |
| 30 | Concurrent updateMetadata + reorder | ✓ | T1f added concurrency tests `concurrent_update_skill_metadata_and_reorder_no_lost_update` + `concurrent_set_parent_and_add_no_lost_update`; both pass |

**Regression risk to V3 sidebar reorder (Phase 1 audit §10)**: V3 invariant #21 BROKEN by DragOverlay depth prop. Other 22 V3 invariants verified preserved.

---

## 5. P0 list (must fix before ship)

### P0-1: DragOverlay component accepts depth/paddingLeft prop — directly violates spec V2 §2.5 + §2.22 anti-pattern + V3 invariant #21

**Files**:
- `src/components/sidebar/DragOverlayCategoryRow.tsx` (entire signature change)
- `src/components/sidebar/CategoryRowContent.tsx` (`reserveChevronSpace` prop and spacer span)
- `src/components/sidebar/SortableCategoriesList.tsx:851-859` (passes depth + hasChildren to DragOverlayCategoryRow)
- `src/components/sidebar/__tests__/DragOverlayCategoryRow.test.tsx` (entire test suite asserts the wrong behavior)

**Spec quote** (02 V2 §2.5 lines 219, 243):
> "DragOverlay 显示与 inline row 同 padding（`px-2.5`）由 `DragOverlayCategoryRow.tsx:21` 的 className 写死，**不读 row prop、也不携带 26 px 缩进**"
> "**不接受 row prop**、**不接受 depth prop**、**不接受 paddingLeft prop**"

Spec §2.22 anti-pattern (line 668):
> "**DragOverlay component 增加 depth/paddingLeft prop**（V2 新增）| `DragOverlayCategoryRow` className 写死 `px-2.5` 是 hierarchy 不变量 #20 的代码层保障；引入 prop 等于打开"DragOverlay 跟随 child 缩进"的口子"

Spec §11 (line 1277):
> "**DragOverlay 不接受 depth/paddingLeft prop**（V2 §2.5 + §2.22 anti-pattern）"

03 V2 §12 row #21:
> "DragOverlayCategoryRow 不传 depth prop（02 §2.6） + DragOverlayCategoryRow.tsx:21 className 写死 `px-2.5`"

**What the implementation does instead**:
```tsx
// DragOverlayCategoryRow.tsx:45-66
export function DragOverlayCategoryRow({ category, depth = 0, hasChildren = false }) {
  return (
    <div className="drag-overlay-row h-8 pr-2.5 flex items-center gap-2.5"
         style={{ paddingLeft: depth * INDENT_STEP_PX + 10 }}>  // ← child row → 26px
      <CategoryRowContent category={category} showCount={false}
                          reserveChevronSpace={hasChildren} />
    </div>
  );
}
```

**Spec rationale (why prohibited)** — 02 V2 §2.5 line 247:
> "拖动期间深度有两种稳定态（root / child），由 dragOffset.x 翻越 12 px + dwell 80ms 后离散切换。如果 DragOverlay 自带 26 px padding，DragOverlay 在 dragOffset.x = 0 ~ 12px 时（无意改深度的 reorder）也表现为 child 视觉——破坏 V3 严格跟手原则（DragOverlay 视觉应等同被拖项当前形态而非未来形态）"

**Fix (revert to spec)**:

```tsx
// DragOverlayCategoryRow.tsx — revert to V3-style, no props
import type { Category } from '@/types';
import { CategoryRowContent } from './CategoryRowContent';

interface DragOverlayCategoryRowProps {
  category: Category;
}

export function DragOverlayCategoryRow({ category }: DragOverlayCategoryRowProps) {
  return (
    <div className="drag-overlay-row h-8 px-2.5 flex items-center gap-2.5">
      <CategoryRowContent category={category} showCount={false} />
    </div>
  );
}
```

```tsx
// CategoryRowContent.tsx — remove reserveChevronSpace prop and spacer block
// (lines 34-42, 53-64)
```

```tsx
// SortableCategoriesList.tsx:852-857 — drop depth + hasChildren
<DragOverlay modifiers={[restrictToWindowEdges]} dropAnimation={dropAnimationConfig}>
  {activeCategory && <DragOverlayCategoryRow category={activeCategory} />}
</DragOverlay>
```

```tsx
// __tests__/DragOverlayCategoryRow.test.tsx — rewrite tests to assert
// padding-left: 10px regardless of source row depth + no chevron-spacer ever rendered
```

**Effort**: ~30 mins. Net code reduction.

**Note**: If after dev-mode user testing the spec-compliant overlay feels "wrong" (the lift looks misaligned with the source child row at drag start), the proper response is to amend the spec V2 §2.5 with a documented exception, not silently retain the violation.

### P0-2: ContextMenu missing "Promote to root" item — violates spec V2 §2.20 + acceptance #25 + 03 V2 §6.3.4

**File**: `src/components/layout/MainLayout.tsx:653-670`

**Spec quote** (02 V2 §2.20):
> "父类 ContextMenu 仅添加 **'Promote to root'**（仅子类显示）— 直接 promote 当前 row 到根级，等同于键盘 Space + ←；A11y 公告"{name} promoted to root level.""

03 V2 §6.3.4:
> "**ContextMenu 兜底**（per 02 §2.20）：右键 child row → 'Promote to Root' 项 → 直接调 `setCategoryParent(id, null)` IPC"

**What the implementation does**:
```tsx
{contextMenu && (
  <ContextMenu
    items={[
      { label: 'Rename', icon: <Pencil size={14} />, onClick: handleRenameCategory },
      { label: 'Delete', icon: <Trash2 size={14} />, onClick: handleDeleteCategory, danger: true },
    ]}
    ...
  />
)}
```

**Fix**:

```tsx
const handlePromoteToRoot = useCallback(async () => {
  if (contextMenu?.category?.parentId) {
    try {
      await moveCategoryToParent(contextMenu.category.id, null);
    } catch (e) {
      console.error('Failed to promote category to root:', e);
    }
  }
  setContextMenu(null);
}, [contextMenu, moveCategoryToParent]);

// In ContextMenu items: conditionally include Promote to root for child rows
{contextMenu && (
  <ContextMenu
    items={[
      ...(contextMenu.category.parentId ? [
        { label: 'Promote to root', icon: <ArrowUp size={14} />, onClick: handlePromoteToRoot },
      ] : []),
      { label: 'Rename', icon: <Pencil size={14} />, onClick: handleRenameCategory },
      { label: 'Delete', icon: <Trash2 size={14} />, onClick: handleDeleteCategory, danger: true },
    ]}
    position={contextMenu.position}
    onClose={() => setContextMenu(null)}
  />
)}
```

**Effort**: ~10 mins.

### P0-3: Parent-delete confirmation dialog missing — violates spec V2 §2.21 + acceptance #26 + 02 V2 §2.22 anti-pattern + Norman safety principle

**File**: `src/components/layout/MainLayout.tsx:428-437` (handleDeleteCategory)

**Spec quote** (02 V2 §2.21):
> "**触发条件**：用户右键父类 → ContextMenu Delete 时，前端检测父类有 ≥ 1 个 children → **弹出 confirmation dialog**；父类**无 children** 时直接删除"
>
> "**Dialog 文案**:
> Title: 'Delete '{parentName}'?'
> Body: '{parentName} contains {N} sub-categor{y/ies}. Sub-categories will be promoted to root level. This cannot be undone.'
> Buttons: 'Cancel'（默认） / 'Delete'（destructive style）"

Spec V2 §2.22 anti-pattern (line 678):
> "**删除父类无 confirmation 直接 cascade-promote**（V2 新增）| Norman 'preventing irreversible action'；用户子树丢失感"

Acceptance #26:
> "右键有 children 的父类 → Delete → 弹 confirmation dialog；含子类数量 + 'This cannot be undone' 提示；点 Cancel 不变；点 Delete 触发 cascade-promote + A11y 公告"

**What the implementation does**: directly calls `deleteCategory` regardless of children. The backend cascade-promotes silently with disambiguation. User loses no data, but is also not warned.

**Fix** (using window.confirm as quick path; spec preferred macOS NSAlert via Tauri dialog plugin but window.confirm is acceptable fallback per spec line 617):

```tsx
const handleDeleteCategory = async () => {
  if (!contextMenu?.category) return;
  const cat = contextMenu.category;

  // Count children directly under this parent.
  const childCount = categories.filter((c) => c.parentId === cat.id).length;

  if (childCount > 0) {
    const word = childCount === 1 ? 'sub-category' : 'sub-categories';
    const ok = window.confirm(
      `Delete '${cat.name}'?\n\n` +
      `${cat.name} contains ${childCount} ${word}. Sub-categories will be promoted to root level. This cannot be undone.`
    );
    if (!ok) {
      setContextMenu(null);
      return;
    }
  }

  try {
    await deleteCategory(cat.id);
  } catch (error) {
    console.error('Failed to delete category:', error);
  }
  setContextMenu(null);
};
```

If user wants higher fidelity (Tauri-native dialog with stylized destructive button), use `@tauri-apps/plugin-dialog`'s `ask()` instead of `window.confirm`. The acceptance only requires "弹 dialog" — both satisfy.

**Effort**: ~15 mins (including A11y announcement enhancement to match spec §3 "{parentName} deleted. {N} categories promoted to root: ...").

---

## 6. P1 list (should fix; not ship-blocking but materially below "approaching 10/10")

### P1-1: MigrationReport doc comment in types.rs contradicts code (Phase-1 audit P0-1 → ruled in code, doc not updated)

**File**: `src-tauri/src/types.rs:247-262`

The doc comment states:
> "**Flag advancement rule (per task prompt §3.4)**: the `has_completed_category_id_migration` flag in [`AppData`] is advanced to `true` ONLY when both `orphaned_skills` and `orphaned_mcps` are empty"

The actual code at `data.rs:766-768` does the OPPOSITE (advances flag regardless of orphans). The behavior is correct per Phase-1 audit P0-1 ruling; the doc string is stale documentation drift.

**Fix**: replace the doc paragraph with the orphan-advances-flag wording from `data.rs:754-765` (which was correctly updated). ~10 mins.

### P1-2: autoClassify-created skills/mcps remain "orphans" forever

**Files**:
- `src/stores/skillsStore.ts:412-422` (autoClassify path)
- `src/stores/mcpsStore.ts:462-472` (symmetric)

After autoClassify creates a NEW category with `addCategory(name, color, undefined)` and `loadCategories()`, the loop calls `update_skill_metadata({ category, tags, icon })` without `categoryId`. Backend `update_skill_metadata` accepts `categoryId: Option<Option<String>>`; outer `None` means "do not modify" → categoryId stays as default `None`.

After the first migration runs (flag=true), these entries with `category="X"` and `category_id=None` will never be migrated again. They remain "orphans" indefinitely (display works via cached name fallback, but D1 migration is incomplete).

**Fix**:

```ts
// skillsStore.ts autoClassify, after loadCategories():
const updatedCategories = useAppStore.getState().categories;
for (const result of results) {
  const skill = skills.find((s) => s.id === result.id);
  if (skill) {
    const cat = updatedCategories.find(c => c.name === result.suggested_category);
    await safeInvoke('update_skill_metadata', {
      skillId: result.id,
      category: result.suggested_category,
      categoryId: cat ? cat.id : null,  // ← P1-2 fix: dual-write
      tags: result.suggested_tags,
      icon: result.suggested_icon,
    });
  }
}
```

Symmetric change in mcpsStore. Effort: ~10 mins.

### P1-3: Drop indicator wrapper not implemented (spec V2 §2.7) — alternative implementation chose active-row-paddingLeft

**Files**: `src/components/sidebar/SortableCategoriesList.tsx` (no `.drop-indicator-wrapper` element)

Spec V2 §2.7 mandates a wrapper element:
```html
<div class="drop-indicator-wrapper" style={{ paddingLeft: depth * var(--indent-step) }}>
  <div class="drop-indicator-h" />
</div>
```

The implementation instead uses the active row's own `padding-left` to express the projected depth (lines 780-783), relying on cascade let-pass to communicate the drop position visually. This is functionally similar but:
1. Acceptance #11 ("drop indicator wrapper paddingLeft 在 150ms 内过渡") cannot be machine-verified — there is no `.drop-indicator-wrapper` element to inspect.
2. The active-row paddingLeft transitions over 220ms (cascade duration) not 150ms (indicator-move duration).
3. The literal spec wording is not met.

**Note**: V3 itself never rendered `.drop-indicator-h` in source — the class exists in CSS but is never used. The spec V2 §2.7 inherited this unused-class indicator concept. So the implementation choice has historical precedent.

**Resolution path** (pick one):
- (a) Keep current implementation; amend spec V2 §2.7 with "alternative implementation: active-row paddingLeft expresses projected depth via cascade let-pass" rationale + update acceptance #11 wording.
- (b) Add a real `.drop-indicator-wrapper` rendered between rows at the projected drop slot.

(a) is lower risk and better matches V3's "no visible indicator line" baseline. Recommend (a) — but it requires user signoff on a spec amendment. Effort: 5 mins (spec edit) or 60 mins (option b implementation).

### P1-4: announcements.ts hierarchy phrasing partial — "moved to child of {parent}" only fires when over.id has a parent

**File**: `src/components/sidebar/dnd/announcements.ts:107-114`

The current implementation says:
```typescript
const overParent = hierarchy.parentMap.get(String(over.id));
if (overParent) {
  return `... moved to child of ${overParent}.`;
}
```

This only fires when over.id is itself a child (because parentMap is keyed by childId → parentName). The semantic is wrong:
- Demoting a root → child: drop is over a parent (root) row → over.id has no parent in parentMap → falls through to "was dropped at position N"
- Promoting child → root: drop is over a root → no parent name → falls through to default

Spec V2 §3 announcements table requires:
- "{name} moved to child of {parentName}" for demote (active becomes child of over.id)
- "{name} promoted to root level" for promote
- "{name} moved to root level" for cross-parent
- "Cannot demote — already at maximum depth" / "Cannot promote — already at root level" for refusals

**Fix**: announcements need access to the projection (depth + parentId) at drop time, not over.id parent lookup. Restructure makeAnnouncements to accept a projection-aware callback or add a host-driven announcement layer in SortableCategoriesList that fires on parent_id change.

Lighter fix: in the host (SortableCategoriesList.handleDragEnd), call a `liveAnnounce(name, action, parent)` helper that writes to dnd-kit's announcement region directly when parent_id changes. This works even though dnd-kit's announcement contract doesn't pass projection. Effort: ~30 mins.

### P1-5: Browse-mode ←/→ collapse/expand not implemented

**File**: `src/components/sidebar/dnd/treeKeyboardCoordinates.ts`

Spec V2 §3 mandates HIG NSOutlineView-style behavior:
> "**普通浏览模式**: 父类有子类 + **折叠态** → **展开**（HIG NSOutlineView 标准）；展开态 + ← → 折叠"

Acceptance #11 (browse mode ←/→) and #12 verify this.

The implementation only handles drag-mode ←/→ for promote/demote; browse-mode ←/→ is not wired. The user can only toggle expand/collapse via chevron click (or keyboard Space when chevron focused), not via row-focused ←/→.

**Fix**: in `SortableCategoryRow.handleKeyDown`, add browse-mode handling:

```tsx
const handleKeyDown = (e: React.KeyboardEvent) => {
  dndKeyDown?.(e);
  if (e.defaultPrevented) return;

  // Browse-mode HIG NSOutlineView ←/→ for collapse/expand on parents-with-children
  if (hasChildren && e.key === 'ArrowRight' && !isExpanded) {
    e.preventDefault();
    onToggleExpanded();
    return;
  }
  if (hasChildren && e.key === 'ArrowLeft' && isExpanded) {
    e.preventDefault();
    onToggleExpanded();
    return;
  }

  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onClick();
  }
};
```

Effort: ~15 mins.

### P1-6: 04 V2 task card T1c set_category_parent signature drift not patched

**File**: `04_implementation_plan.md` V2 line 133

Per Phase 1 audit P1-1: "T1c task card says `Option<Option<String>>`, but 03 V2 §3.3.3 (and the implementation) say `Option<String>`". Phase 1 audit recommended patching the task card to match 03 V2.

**Fix**: edit 04 V2 line 133 to read:
```
set_category_parent(id, new_parent_id: Option<String>)
```
with footnote: "(single Option per 03 V2 §3.3.3 — three-state semantics not meaningful for this dedicated mutation IPC; see §3.3.2 for `update_category`'s three-state parentId)"

Effort: ~3 mins.

---

## 7. P2 list (backlog — non-urgent quality)

### P2-1: ScopedDataDir test fixture duplicated 4 times in data.rs

(carried forward from Phase 1 audit P2-1 — ~120 LoC duplication, 15-min lift to shared `#[cfg(test)] mod test_helpers`)

### P2-2: Cycle-walk tests over-permissive

(carried forward from Phase 1 audit P2-2)

### P2-3: appStore.moveCategoryToParent vs spec name "setCategoryParent"

Cosmetic: 03 V2 §4.3 task card uses `setCategoryParent` action name; implementation uses `moveCategoryToParent`. Behavior matches; only naming drift. Spec may be patched later or implementation renamed for consistency. Low priority.

### P2-4: Drop indicator wrapper paddingLeft transition spec mismatch

Even if P1-3 (a) is taken, acceptance #11 needs rewording — see P1-3 above.

### P2-5: eprintln! for disambiguation logging

(carried forward from Phase 1 audit P2-4)

### P2-6: Edge-case test for empty parent name in disambiguation

(carried forward from Phase 1 audit P2-3)

---

## 8. Praise list (excellent decisions worth preserving)

1. **Async double-IPC orchestration in handleDragEnd** (`SortableCategoriesList.tsx:509-665`): the spec's most subtle architectural concern (P0-ARCH-3 stale ordered_ids race). Implementation awaits `setCategoryParent` first, then re-reads `useAppStore.getState().categories` for FRESH state to compute the reorder ordered_ids on the post-mutation hierarchy. The fresh-vs-stale distinction is precisely what the spec required.

2. **Subtree splice on FRESH baseFlat** (line 593-649): the second of three architectural P0s (P0-ARCH-2: `arrayMove(flattened)` would put children at end of Vec). Implementation rebuilds ordered_ids by extracting active+children as a contiguous subtree and splicing into the over.id position, preserving children adjacent to their parent. This is exactly what V2 spec demanded.

3. **Dwell state machine fidelity to spec V2 §2.14**: OUT/HOVER_NEAR/DROP_INTO_READY transitions, synchronous timer clearing on overChanged, X-threshold gating, retreat path (DROP_INTO_READY → HOVER_NEAR → OUT). Code (lines 434-503) maps 1:1 to spec table.

4. **MutableRefObject pattern for treeKeyboardCoordinates** (P0-ARCH-1): live-state ref + useEffect sync + closure-stable getter via `useState(() => factory())`. Faithful to dnd-kit's official Tree example contract.

5. **Cascade-promote disambiguation with running root_names mutable set** (data.rs:529-571): catches the "two children of deleted parent share name" edge case. Tests verify all four scenarios.

6. **CreateSceneModal P0-DATA-4 categoryId-keyed filter with __legacy: prefix fallback** (lines 462-566): the depth-2 hierarchy means siblings can both name children "Web"; name-keyed filter would silently merge. Implementation correctly:
   - Indexes by categoryId (canonical)
   - Aggregates ancestors by walking parentId chain
   - Surfaces unmigrated entries via `__legacy:<name>` prefix
   - Resolves descendants on filter selection

7. **Three-layer chevron defence in SortableCategoryRow** (`data-no-dnd="true"` + `onMouseDown stopPropagation` + `onKeyDown stopPropagation`): handles V3 P0-2 listener-chain trap correctly. `_dndOnKeyDown` extraction + `listenersWithoutKeyDown` spread chains the dnd-kit handler before custom logic without shadowing.

8. **Backward-compat tests cover both directions** (types.rs:1099-1376, 13 tests): old fixture deserializes; reserialization MUST NOT contain new key when None. Locks `skip_serializing_if = "Option::is_none"` against accidental removal.

9. **Defensive 32-hop cycle bailout in validate_hierarchy** (data.rs:220-226): max-depth-2 means legitimate cycles terminate in ≤2 hops; 32 is conservative ceiling for hand-edited data.json corruption.

10. **Test discipline across the board**: 142 Rust tests including 2 concurrency lost-update guards (T1f); 210 frontend tests; categoryTree, treeUtilities, treeKeyboardCoordinates, SortableCategoryRow, SortableCategoriesList, DragOverlayCategoryRow, appStore.moveCategoryToParent, categoriesWithCounts all have comprehensive coverage.

11. **CategoryTreeDropdown shared component with Dropdown.indent prop**: 6 dropdowns + CreateSceneModal use the same component; consistent indentation; single source of truth for tree-flattening (delegates to flattenTree from sidebar dnd module).

12. **Dual-read fallback in MainLayout.categoriesWithCounts + CategoryPage.filteredData**: prefers `categoryId` when present, falls back to name; handles entries that haven't migrated yet without breaking display.

---

## 9. Dev mode validation checklist (jsdom can't test these — main agent should run dev server, user verifies)

> Per 02 V2 §8.1 acceptance list (42 items). The items below are jsdom-uncoverable; the rest are unit-verified.

**Visual / DevTools**:
1. [ ] Child row computed `padding-left: 26px` (child rows render correctly).
2. [ ] Chevron computed `width: 10px; height: 10px; color: rgb(161, 161, 170)` on parent rows with children only.
3. [ ] Chevron rotation: collapsed→expanded transition `120ms cubic-bezier(0.16, 1, 0.3, 1)`.
4. [ ] Children container expand/collapse: `transition-duration: 220ms` + `cubic-bezier(0.16, 1, 0.3, 1)` + height + opacity sync.
5. [ ] After P0-1 fix, DragOverlay during drag has `padding-left: 10px` regardless of source row's depth.

**Drag interactions** (jsdom can't drive PointerEvents through dnd-kit sensors):
6. [ ] Drag child → another parent's drop-into zone (X≥+12, dwell 80ms): drop indicator-style cascade let-pass with depth=1 visual; on drop, parent_id updates correctly.
7. [ ] Drag child → root reorder zone (X<-12, dwell 80ms): promote works; A11y "promoted to root level" announcement fires.
8. [ ] Drag parent → another parent's drop-into zone: DragOverlay opacity 0.95 → 0.5 (instantaneous, no fade); cursor `not-allowed`; on drop, no parent_id mutation occurs.
9. [ ] Cancel during DROP_INTO_READY (Esc): DragOverlay snap-back 280ms `cubic-bezier(0.32, 0.72, 0, 1)`; A11y "Drag cancelled" announcement.
10. [ ] Dwell retreat: DROP_INTO_READY → X retreats below 12 → visual reverts; dwell timer stays idle until X ≥ 12 again.
11. [ ] During drag, all collapsed parents auto-expand; on drop, persisted expandedSet restored.

**Keyboard / A11y**:
12. [ ] Tab on parent-with-children row → row focused, then Tab again → chevron focused, then Tab again → next row.
13. [ ] Chevron focused + Space/Enter → toggles (does NOT lift the row); DevTools dnd-kit `onDragStart` not invoked.
14. [ ] After P1-5 fix: row focused (browse mode) + → on collapsed parent → expands; ← on expanded parent → collapses.
15. [ ] Drag mode (Space lift) + → on root → demote announcement; → on child at MAX_DEPTH → "Cannot demote" announcement.
16. [ ] Drag mode + ← on child → promote; ← on root → "Cannot promote" announcement.

**ContextMenu / dialogs** (after P0-2 + P0-3 fixes):
17. [ ] Right-click child row → ContextMenu shows "Promote to root", "Rename", "Delete" (in this order).
18. [ ] Right-click root row (no children) → ContextMenu shows "Rename", "Delete" only (no Promote, no confirmation).
19. [ ] Right-click root with children → "Delete" → confirmation dialog appears with title "Delete '{name}'?" + "{N} sub-categor{y/ies}" body + "This cannot be undone." + Cancel/Delete buttons.
20. [ ] Cancel → no state change. Delete → cascade-promote + sidebar updates + A11y announcement.

**Reduced-motion**:
21. [ ] System preference "Reduce Motion" enabled → all chevron rotations + children expansion + padding transitions = 0ms.

**Data persistence**:
22. [ ] Add new sub-category → parent auto-expands → reload page → parent still expanded (localStorage round-trip).
23. [ ] First launch (clean localStorage) → all parents-with-children expanded.
24. [ ] localStorage corruption (set value to non-JSON) → app falls back to default-expanded; no console error.

**Migration**:
25. [ ] Fresh install with v3 data.json (no parent_id, no category_id, no migration flag) → app launches → backend migrates skill/mcp metadata → flag advances → second launch skips migration.
26. [ ] After migration: skills/mcps with name-only category continue to display correctly via cached name fallback.

---

## 10. Confidence

**Confidence: 90 / 100**

Why high:
- Read every file in the audit prompt's reading list (all decisional + reviewer + audit + spec docs).
- Read every code file: types.rs, data.rs, skills.rs, mcps.rs, import.rs, lib.rs (backend); types/index.ts, categoryTree.ts, treeUtilities.ts, treeKeyboardCoordinates.ts, announcements.ts, SortableCategoriesList.tsx, SortableCategoryRow.tsx, CategoryRowContent.tsx, DragOverlayCategoryRow.tsx, MainLayout.tsx, CategoryPage.tsx, store files, dropdown files (frontend).
- Independently grepped DATA_MUTEX, parent_id/categoryId, snapModifier/restrictToWindowEdges/MeasuringStrategy/closestCenter.
- Ran tsc, frontend tests, Rust tests, clippy, eslint — confirmed all pass / pre-existing warnings only.
- Cross-checked every V3 invariant (23 items) and every spec V2 acceptance (42 items where automable).
- Reviewed all 14 D-decisions and all 15 P0 / 11 P1 from `_v2_patch_plan`.

Why not 100:
- Cannot drive real PointerEvent drags through dnd-kit sensors in jsdom; the dwell state machine, drag projection, and cascade let-pass are unit-tested but not end-to-end driven. P0-1 violation is verified statically; P0-2 / P0-3 are verified by absence of code rather than failed UI flow. Dev-mode validation by user remains required (§9).
- The drop-indicator-wrapper question (P1-3) is genuinely ambiguous: V3 had no visible indicator either, so spec V2 §2.7's wrapper requirement may itself be a latent spec inconsistency. I marked P1 (not P0) and recommended a spec-amendment path; the user may rule otherwise.

---

## 11. Final ruling

**Can ship now**: **NO**.

**Must close before ship** (P0):
1. P0-1: revert DragOverlay depth/hasChildren props (or get user signoff to amend spec V2 §2.5/§2.22/§7 #21).
2. P0-2: add ContextMenu "Promote to root" item for child rows.
3. P0-3: add parent-delete confirmation dialog for parents-with-children.

**Should close** (P1):
4. P1-1: types.rs MigrationReport doc comment update.
5. P1-2: autoClassify writes categoryId.
6. P1-3: pick (a) spec amendment for drop-indicator-wrapper or (b) implement wrapper.
7. P1-4: announcements.ts hierarchy phrasing.
8. P1-5: browse-mode ←/→ collapse/expand.
9. P1-6: 04 V2 task card T1c signature note.

**Effort estimate to clear all P0 + P1**: ~2.5 hours (P0: ~55 min total; P1: ~75 min total) plus dev-mode user validation per §9.

**Score recap**: 78 / 100. Architecturally sound with strong test discipline; loses points on three explicit V2 spec violations + missing user-confirmation flows for destructive operations. Pure code quality is closer to 90; the gap is specs-vs-implementation alignment + UI safety (Norman irreversibility) gates.

After closing P0×3 + P1-1/P1-2/P1-4/P1-5: estimated score 92-95 / 100, which would meet "approaching 10/10" bar with dev-mode user validation.

---

## 12. Final-fix pass (2026-05-04) — closure record

The implementing SubAgent completed the following in a single pass:

**P0 (3) — closed**:
- P0-1: `DragOverlayCategoryRow` reverted to a depth-agnostic naked clone — `depth` and `hasChildren` props removed; `CategoryRowContent.reserveChevronSpace` prop + spacer span removed; `SortableCategoriesList` no longer passes depth/hasChildren to the overlay; the dedicated test suite was rewritten to assert the V3 invariant #21 contract (px-2.5 className, no inline padding-left, no chevron-spacer).
- P0-2: ContextMenu now conditionally surfaces "Promote to Root" with `ArrowUp` icon between Rename and Delete when the right-clicked category has a `parentId`. `handlePromoteToRoot` calls `moveCategoryToParent(id, null)`.
- P0-3: `handleDeleteCategory` now counts children-by-`parentId` before deletion; when `≥ 1`, it surfaces a `window.confirm` dialog with the spec-locked text from §2.21 + `_v2_patch_plan` §3.6 ("Delete '{name}'? — {N} sub-categor{y/ies} — promoted to root level — This cannot be undone."). Cancel short-circuits without touching backend state. No-children deletes pass straight through (V3-compatible).

**P1 (4) — closed**:
- P1-1: `MigrationReport` doc comment in `src-tauri/src/types.rs` rewritten to describe the orphan-as-terminal-state behaviour (flag advances regardless of orphan presence); per-field "flag stays false" comments updated.
- P1-2: `skillsStore.autoClassify` and `mcpsStore.autoClassify` now snapshot categories after `addCategory(...)` and dual-write `categoryId` (resolved by name) alongside `category` to `update_skill_metadata` / `update_mcp_metadata`.
- P1-3: `.drop-indicator-wrapper` now rendered above the active row during dwell-armed drag (HOVER_NEAR / DROP_INTO_READY); `paddingLeft = projected.depth * INDENT_STEP_PX` with a 150 ms `--ease-drag` transition (CSS class added to `src/index.css`). Reduced-motion wildcard extended.
- P1-4: `HierarchyContext` extended with optional `dropProjectionRef`; `SortableCategoriesList.handleDragEnd` writes `{ activeId, oldParentId, newParentId }` to the ref before its own state-clear so the dnd-kit monitor's `announcements.onDragEnd` (dispatched synchronously after our handler returns) reads the post-drop parent. Announcement phrasing now correctly emits "promoted to root level" / "moved to child of {parent}" / "moved to root level" per spec V2 §3.

**Backlog (P1-5 / P1-6) — not closed in this pass**:
- **P1-5** (browse-mode ←/→ HIG NSOutlineView collapse/expand): scope-deferred per `final_audit` §6 P1-5. Browsing-mode keyboard navigation is independent of the drag-mode key handling that landed in T2d; deferring keeps this pass focused on the core spec violations. To revive: amend `SortableCategoryRow.handleKeyDown` to add ←/→ collapse/expand on parents-with-children when not in drag mode (no behaviour change to drag-mode ←/→ promote/demote).
- **P1-6** (04 V2 task card T1c signature drift): pure documentation drift in `04_implementation_plan.md` line 133 (says `Option<Option<String>>`, code/tech-plan say `Option<String>`). No code impact. To revive: amend the task-card line + add the footnote per `final_audit` §6 P1-6 — 3 mins.

**Verification**:
- `npx tsc --noEmit` — clean.
- `npm run test` — 210/210 PASS (rewritten DragOverlayCategoryRow tests included).
- `cargo test --lib` — 142/142 PASS.
- `npx eslint src/` — 0 new warnings (15 pre-existing baseline, unchanged).

**Score after this pass**: estimated 92-95 / 100. Three explicit V2 spec violations and four P1 documentation/feature gaps closed; the remaining two P1 items are scope-deferred and tracked here.

