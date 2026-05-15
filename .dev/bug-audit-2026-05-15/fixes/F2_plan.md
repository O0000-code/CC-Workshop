# F2 Implementation Plan — Trash Subsystem Completion

Owner: Fix Agent F2 (Opus). Scope: A3 (UI restore metadata recovery), A4 (Rules tab in TrashRecoveryModal), A5 (Scene / Project trash restore path). No other findings, no scope creep.

## Findings under this plan

| ID | File:Line | Issue | Severity |
|---|---|---|---|
| A3 (R1 A3, R2 F6+F7+F10, R5 F5) | `trash.rs:343-376` + `trash.rs:382-415` | UI restore_skill / restore_mcp drops metadata + leaves orphan snapshot | P0 |
| A4 (R3 F3, R7 F7-4) | `TrashRecoveryModal.tsx:8` + `trashStore.ts:1-141` | Missing Rules tab in UI; backend `restore_rule` IPC + `list_trashed_items::rules` already wired | P1 |
| A5 (R1 A2, R5 F4 partial) | `data.rs::delete_scene/delete_project` + `lib.rs:179-183` | `trashed_scenes` / `trashed_projects` arrays receive writes but have zero readers; no `restore_scene` / `restore_project` IPCs | P1 |

## Pre-fix grep audit

Per `.claude/rules/grep-before-enumerate-shared-resource.md`, before adding new functions / IPCs I enumerate the touch surfaces.

### Callsite enumeration of `consume_skill_metadata_snapshot` / `consume_mcp_metadata_snapshot` (A3)

```
rg -n 'consume_skill_metadata_snapshot|consume_mcp_metadata_snapshot' src-tauri/src/
```

Hits today:
- `marketplace.rs:526` (definition, module-private `fn`)
- `marketplace.rs:552` (definition, module-private `fn`)
- `marketplace.rs:2964` (finalize_skill_install call)
- `marketplace.rs:3260` (finalize_mcp_install call)

**Action**: change `fn` → `pub(crate) fn` for both so `trash.rs` can call them. No semantic change to existing callers. The "snapshot file is auto-removed by consume_*" invariant (`marketplace.rs:542,546,566,570`) is verified — both functions `fs::remove_file` on success AND on parse-failure, so trash restore inherits the same orphan cleanup behaviour.

### Callsite enumeration of `trashed_scenes` / `trashed_projects` / `TrashedScene` / `TrashedProject` (A5)

```
rg -n 'trashed_scenes|trashed_projects|TrashedScene|TrashedProject' src-tauri/src/
```

Hits today:
- `types.rs:169` — `TrashedScene` struct definition (with `rule_ids`, `claude_md_ids`, etc — full Scene fields plus `deleted_at`)
- `types.rs:198` — `TrashedProject` struct definition
- `types.rs:240/242` — `AppData::trashed_scenes` / `trashed_projects` Vec fields with `#[serde(default)]`
- `data.rs:432-433` — `init_app_data` default empty vecs
- `data.rs:1135` — write in `delete_scene`
- `data.rs:1149` — push in `delete_scene`
- `data.rs:1244` — write in `delete_project`
- `data.rs:1253` — push in `delete_project`
- `types.rs:1741-1742, 2109` — tests asserting empty default

**Zero readers**: no `TrashedScene` field consumer in code. `TrashedItems` struct (`types.rs:1315`) only contains `skills/mcps/claude_md_files/rules` — must extend with `scenes` and `projects` fields. Frontend `src/types/trash.ts` mirrors and likewise needs new fields.

### Callsite enumeration of `restore_*` IPC registrations (A5)

```
rg -n 'restore_skill|restore_mcp|restore_claude_md|restore_rule|restore_scene|restore_project' src-tauri/src/
```

Hits: `lib.rs:180-183` registers 4 existing restore IPCs. `restore_scene` / `restore_project` zero hits. New IPC additions required — explicitly in the task scope.

### `TabType` consumers (A4)

```
rg -n "TabType\|'skills' \| 'mcps' \| 'claudemd'" src/components/modals/TrashRecoveryModal.tsx
```

Hit: `src/components/modals/TrashRecoveryModal.tsx:8` is the only place. After my change, the literal union extends to 6 variants.

### `restoreSkill` / `restoreMcp` / `restoreClaudeMd` action consumers (A4 mirror)

```
rg -n 'restoreSkill\|restoreMcp\|restoreClaudeMd\|useTrashStore' src/
```

Hits: only inside `trashStore.ts` (definitions) and `TrashRecoveryModal.tsx` (consumers). No other UI surface uses these actions. Adding `restoreRule` / `restoreScene` / `restoreProject` is purely additive and breaks no existing caller.

---

## A3 — restore_skill / restore_mcp metadata recovery

### Decision: build a small helper inside trash.rs rather than directly call `consume_*` from marketplace.rs at every fix-point

Rationale: trash-side restore has its own additional concerns that don't apply to the marketplace finalize path:

1. **Reference validity**: per R5 F5, snapshots can outlive their referenced `category_id` / `tag_ids` (user deleted the category / tag while the item sat in trash). We must filter snapshot fields against the *current* `AppData::categories` / `AppData::tags` and drop dangling pointers before persisting. Marketplace finalize does not face this case because the snapshot was just written within a single user action.
2. **Preserve `install_source` from snapshot**: marketplace finalize forcibly overwrites `install_source = "marketplace"` (line 2997, 3288) because the user is at that moment performing a marketplace install. Trash UI restore is a different intent — the user is *reverting* a delete. The snapshot's `install_source` is the truth (`"local"` / `"plugin"` / `"marketplace"`) and must be preserved as-is (this is R2 F7's data-loss vector).

These two differences mean a wrapper inside trash.rs is correct, not a directly-shared helper in marketplace.rs.

### Implementation

**`marketplace.rs` change (necessary precondition)**:
- Change `fn consume_skill_metadata_snapshot` → `pub(crate) fn consume_skill_metadata_snapshot` (line 526)
- Change `fn consume_mcp_metadata_snapshot` → `pub(crate) fn consume_mcp_metadata_snapshot` (line 552)
- No body changes. No other call sites or signatures.

**`trash.rs::restore_skill` — current body (lines 343-376)**:

```rust
pub fn restore_skill(trash_path: String, ensemble_dir: String) -> Result<(), String> {
    // expand paths, parse name, dest path collision check, mkdir, fs::rename
}
```

**New body**:

1. Same path expansion + collision check + mkdir (unchanged).
2. `fs::rename(&trash_path, &target_path)` (unchanged).
3. **NEW** — under DATA_MUTEX, attempt metadata recovery:
   ```rust
   let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
   let mut app_data = read_app_data()?;
   let new_skill_id = target_path.to_string_lossy().to_string();
   if let Some(snap) = crate::commands::marketplace::consume_skill_metadata_snapshot(&target_path) {
       let validated = sanitize_skill_metadata_against_data(snap, &app_data);
       app_data.skill_metadata.insert(new_skill_id, validated);
       write_app_data(app_data)?;
   }
   ```
4. Return Ok.

If snapshot is absent (delete pre-dates snapshot infra, OR snapshot file was hand-deleted, OR consume_* failed parse) → no metadata write; skill appears with default metadata (same as today's behavior — safe degradation).

Failure of `consume_skill_metadata_snapshot` parse is non-fatal (best-effort — same convention as marketplace finalize). Failure of `read_app_data` / `write_app_data` propagates an Err — this matches `restore_claude_md` semantics. The fs::rename has already succeeded; the user can manually re-set metadata if write fails (rare edge case).

**`trash.rs::restore_mcp` — current body (lines 382-415)**:

Same shape, plus an additional concern: the MCP metadata snapshot is a **sibling** file (`<mcp>.json.metadata.json`), and `delete_mcp` (mcps.rs:548-560) explicitly moves the sibling into trash alongside the `.json`. So at trash-time the layout is:

```
~/.ensemble/trash/mcps/foo_20260301_120000.json
~/.ensemble/trash/mcps/foo_20260301_120000.json.metadata.json
```

`fs::rename` of just the `.json` does not move the sibling. The restore path must move both atomically (or as-best-effort-as-possible).

**Implementation**:

1. Compute `trash_sibling_path = trash_path + ".metadata.json"` (PathBuf with appended OsStr suffix — exact mirror of mcps.rs:548-560 logic).
2. `fs::rename(&trash_path, &target_path)` — primary `.json` first.
3. If `trash_sibling_path.exists()`, compute `target_sibling_path` (same suffix on target). Best-effort `fs::rename`; on failure, log via `eprintln!` (consistent with snapshot_* convention) but proceed.
4. Under DATA_MUTEX: call `consume_mcp_metadata_snapshot(&target_path)` — internally walks to `target_path + ".metadata.json"` and consumes it. Returns Option<McpMetadata>.
5. If snapshot recovered: validate against AppData (drop dangling category_id / filter tag_ids); insert into `app_data.mcp_metadata`.

### Reference-validity helper

New private helpers in `trash.rs`:

```rust
/// Filter a SkillMetadata snapshot against current AppData state, dropping
/// references to categories / tags that no longer exist. The user-curated
/// fields (icon, usage_count, last_used, etc.) survive intact.
fn sanitize_skill_metadata_against_data(
    mut snap: SkillMetadata,
    data: &AppData,
) -> SkillMetadata {
    // Drop dangling category_id pointer.
    if let Some(cat_id) = snap.category_id.as_deref() {
        if !data.categories.iter().any(|c| c.id == cat_id) {
            snap.category_id = None;
            // The cached `category` (name) string is left untouched as a
            // best-effort display hint. The user can re-assign manually
            // (same as legacy "orphan" rows from migrate_category_id_for_skills_mcps).
        }
    }
    // Filter dangling tag_ids — match against tag NAMES because
    // SkillMetadata.tags is a Vec<String> of names (not ids).
    let valid_tag_names: std::collections::HashSet<&str> = data
        .tags
        .iter()
        .map(|t| t.name.as_str())
        .collect();
    snap.tags.retain(|t| valid_tag_names.contains(t.as_str()));
    snap
}

/// Mirror for McpMetadata.
fn sanitize_mcp_metadata_against_data(
    mut snap: McpMetadata,
    data: &AppData,
) -> McpMetadata {
    if let Some(cat_id) = snap.category_id.as_deref() {
        if !data.categories.iter().any(|c| c.id == cat_id) {
            snap.category_id = None;
        }
    }
    let valid_tag_names: std::collections::HashSet<&str> = data
        .tags
        .iter()
        .map(|t| t.name.as_str())
        .collect();
    snap.tags.retain(|t| valid_tag_names.contains(t.as_str()));
    snap
}
```

**Note on `tags` semantics**: I verified that `SkillMetadata::tags` is `Vec<String>` of NAMES (not ids). See `types.rs:298`. The frontend `tagFilter` uses ids, but `metadata.tags` carries names — preserving this pattern. Tag NAMES are stable as the user-facing identity; ids would be a refactor outside scope.

### User-observable success

- **User does X**: User imports skill `foo` (local), sets Category="AI", Tags=["mcp","claude"], Icon=🤖, uses it 5 times. Then deletes `foo` from Skills page. Opens Trash Recovery, restores `foo`.
- **User sees Y**: `foo` returns to Skills list with Category="AI", Tags=["mcp","claude"], Icon=🤖, usage_count=5 preserved. Skill detail panel "Source" shows "Local" (not regressed to default).
- **User does NOT see**: Category empty, tags empty, icon default, usage_count=0 (today's broken behavior).
- **Additional invariant**: snapshot file `_ensemble_metadata.json` (skill) / `foo.json.metadata.json` (MCP) is NOT left in the restored item's directory. The Finder view is clean. (Verified: `consume_*` always `fs::remove_file` after read.)

---

## A4 — Rules tab in TrashRecoveryModal

### Backend verification: no changes needed

- `list_trashed_items` (trash.rs:260-323) already scans `trash/rules/` and returns `TrashedRule` in `TrashedItems::rules`. **Verified by reading lines 260-323 in full.**
- `restore_rule` IPC is registered (`lib.rs:183`).
- `TrashedItems::rules` field already has `#[serde(default)]` for backward compat.

### Frontend changes

**1. `trashStore.ts`** — add `restoreRule` action mirroring `restoreSkill` pattern.

The new action mirrors `restoreClaudeMd` (closest analog — no `ensembleDir` needed because `restore_rule` IPC uses `get_app_data_dir()` internally):

```ts
restoreRule: async (path: string) => {
  if (!isTauri()) {
    console.warn('TrashStore: Cannot restore Rule in browser mode');
    return false;
  }
  set({ isRestoring: true, error: null });
  try {
    await safeInvoke('restore_rule', { trashPath: path });
    await get().loadTrashedItems();
    set({ isRestoring: false });
    return true;
  } catch (error) {
    const message = typeof error === 'string' ? error : String(error);
    set({ error: message, isRestoring: false });
    return false;
  }
},
```

Update the `TrashState` interface signature line to include this action.

**2. `TrashRecoveryModal.tsx`** — add Rules tab.

Changes:
- `TabType` literal union: add `'rules'`.
- Import `Sliders` from `lucide-react` for the rules tab icon. (Decision rationale: I checked existing icon usage — Skills=`Wand2`, MCPs=`Server`, CLAUDE.md=`FileText`. Rules need a distinct icon. `Sliders` is the same icon used by RulesPage according to the codebase convention. Verify before implementation.)
- Add `TrashedRule` to type imports.
- Add `selectedRules` state Set.
- Extend counts: `rulesCount`, `currentTotal`, `currentSelected`, `totalCount` arithmetic.
- Extend `handleSelectAll` switch with 'rules' branch.
- Add `handleToggleRule` callback (mirror `handleToggleClaudeMd`).
- Extend `handleRestore` with rules loop (calls `restoreRule`).
- Reset `setSelectedRules(new Set())` in modal-close effect.
- Add the Rules tab button between CLAUDE.md and the right-side count (or after — design decision: keep tabs in the same order as the sidebar app structure: Skills → MCPs → CLAUDE.md → Rules).
- Add the Rules tab content block (mirror CLAUDE.md content; show name + filename in info area to give the user disambiguation when multiple rules share a name).

### Verification before implementation: confirm Rules icon

I will grep the codebase for the Rules page icon:

```
rg -n 'Sliders|FileSliders|Settings2|Cog' src/pages/RulesPage.tsx
```

If `Sliders` is used → reuse. If a different icon → reuse that. (Hard constraint: must use lucide-react functional icon per design-language Rule, not Unicode emoji.)

### User-observable success

- **User does X**: User deletes Rule "my-coding-conventions.md" from Rules page. Opens Trash Recovery.
- **User sees Y**: Modal shows 4 tabs: Skills | MCPs | CLAUDE.md | Rules. "Rules" tab shows the deleted rule with name + filename + deleted_at. User selects + clicks "Recover Selected".
- **User does NOT see**: "Rules I deleted are gone forever, no way to recover."
- **Additional invariant**: After restore, Rule appears in the Rules page list, `is_global = false` (per trash.rs:590 — already correct).

---

## A5 — Scene / Project Trash full restore path

### Backend changes

#### Type additions: `TrashedItems` field extension

`types.rs:1315-1321` adds two fields:

```rust
pub struct TrashedItems {
    pub skills: Vec<TrashedSkill>,
    pub mcps: Vec<TrashedMcp>,
    pub claude_md_files: Vec<TrashedClaudeMd>,
    #[serde(default)]
    pub rules: Vec<TrashedRule>,
    /// V2.2 — Scene / Project trash exposure (A5). Backward compat: empty Vec
    /// when serde deserialises from older payloads via `#[serde(default)]`.
    #[serde(default)]
    pub scenes: Vec<TrashedScene>,
    #[serde(default)]
    pub projects: Vec<TrashedProject>,
}
```

The `TrashedScene` and `TrashedProject` structs are pre-existing (`types.rs:169` / `:198`) and used directly — no field changes inside them.

#### `trash.rs::list_trashed_items` modification

Insert at end of function (before sort/return):

```rust
// Scene / Project trash live in data.json (not on disk), so read them
// once under DATA_MUTEX and pass through. Same display-sort ordering
// (newest deleted_at first).
let mut scenes: Vec<TrashedScene>;
let mut projects: Vec<TrashedProject>;
{
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let data = read_app_data()?;
    scenes = data.trashed_scenes.clone();
    projects = data.trashed_projects.clone();
}
scenes.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
projects.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
```

Then construct `TrashedItems { skills, mcps, claude_md_files, rules, scenes, projects }`.

**Why DATA_MUTEX**: `list_trashed_items` already does pure-disk reads; adding the lock for the data.json portion is consistent with `restore_claude_md` / `restore_rule` (lines 423 / 542) which already lock when reading AppData. Cost: one extra mutex acquisition per list call. The lock is held only for the clone, not across `fs::*` calls.

#### `trash.rs::restore_scene` — new IPC

```rust
#[tauri::command]
pub fn restore_scene(id: String) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    // Find and remove from trashed_scenes
    let index = data
        .trashed_scenes
        .iter()
        .position(|t| t.id == id)
        .ok_or_else(|| format!("Trashed scene not found: {}", id))?;

    let trashed = data.trashed_scenes.remove(index);

    // Guard against id collision (shouldn't happen, but be safe)
    if data.scenes.iter().any(|s| s.id == trashed.id) {
        // Put it back into trash and bail so user data is not silently merged.
        data.trashed_scenes.insert(index, trashed);
        write_app_data(data)?;
        return Err("A Scene with the same ID already exists".to_string());
    }

    // R5 F5 / spec — reference validity: filter dangling skill_ids / mcp_ids /
    // claude_md_ids / rule_ids against current AppData. The original Scene's
    // intent (the bundle) is best-effort restored; references that disappeared
    // are dropped so syncProject doesn't trip on dangling ids later.
    let skill_id_set: std::collections::HashSet<&str> =
        data.skill_metadata.keys().map(|s| s.as_str()).collect();
    let mcp_id_set: std::collections::HashSet<&str> =
        data.mcp_metadata.keys().map(|s| s.as_str()).collect();
    let claude_md_id_set: std::collections::HashSet<&str> =
        data.claude_md_files.iter().map(|f| f.id.as_str()).collect();
    let rule_id_set: std::collections::HashSet<&str> =
        data.rules.iter().map(|r| r.id.as_str()).collect();

    let restored = Scene {
        id: trashed.id,
        name: trashed.name,
        description: trashed.description,
        icon: trashed.icon,
        skill_ids: trashed
            .skill_ids
            .into_iter()
            .filter(|s| skill_id_set.contains(s.as_str()))
            .collect(),
        mcp_ids: trashed
            .mcp_ids
            .into_iter()
            .filter(|s| mcp_id_set.contains(s.as_str()))
            .collect(),
        claude_md_ids: trashed
            .claude_md_ids
            .into_iter()
            .filter(|s| claude_md_id_set.contains(s.as_str()))
            .collect(),
        rule_ids: trashed
            .rule_ids
            .into_iter()
            .filter(|s| rule_id_set.contains(s.as_str()))
            .collect(),
        created_at: trashed.created_at,
        last_used: trashed.last_used,
    };

    data.scenes.push(restored);
    write_app_data(data)?;
    Ok(())
}
```

#### `trash.rs::restore_project` — new IPC

```rust
#[tauri::command]
pub fn restore_project(id: String) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    let index = data
        .trashed_projects
        .iter()
        .position(|t| t.id == id)
        .ok_or_else(|| format!("Trashed project not found: {}", id))?;

    let trashed = data.trashed_projects.remove(index);

    if data.projects.iter().any(|p| p.id == trashed.id) {
        data.trashed_projects.insert(index, trashed);
        write_app_data(data)?;
        return Err("A Project with the same ID already exists".to_string());
    }

    // Validate scene_id reference. Per task instructions: "选简单的:**清空
    // scene_id** 让用户重新选". When the referenced Scene no longer exists
    // we drop the pointer to empty string; ProjectsPage / syncProject already
    // handle empty scene_id gracefully (existing code path treats it as
    // "Scene not found" with a clear error rather than crashing).
    let scene_id = if !trashed.scene_id.is_empty()
        && data.scenes.iter().any(|s| s.id == trashed.scene_id)
    {
        trashed.scene_id
    } else {
        String::new()
    };

    let restored = Project {
        id: trashed.id,
        name: trashed.name,
        path: trashed.path,
        scene_id,
        last_synced: trashed.last_synced,
    };

    data.projects.push(restored);
    write_app_data(data)?;
    Ok(())
}
```

#### `lib.rs` IPC registration

Insert after line 183 (`trash::restore_rule`):

```rust
trash::restore_scene,
trash::restore_project,
```

#### `commands/data.rs` imports for trash.rs new code

`trash.rs` needs `Scene` and `Project` from types — current imports already cover most types but I need to verify `Scene` / `Project` are reachable. The `use crate::types::{...}` at line 2 already imports `ClaudeMdFile, McpConfigFile, Rule, TrashedClaudeMd, TrashedItems, TrashedMcp, TrashedRule, TrashedSkill`. I will extend it to include `Scene`, `Project`, `TrashedScene`, `TrashedProject`, `AppData`.

### Frontend changes

#### `src/types/trash.ts` — extend types

Add (mirror of Rust):

```ts
export interface TrashedScene {
  id: string;
  name: string;
  description: string;
  icon: string;
  skillIds: string[];
  mcpIds: string[];
  createdAt: string;
  lastUsed?: string;
  claudeMdIds: string[];
  ruleIds: string[];
  deletedAt: string;
}

export interface TrashedProject {
  id: string;
  name: string;
  path: string;
  sceneId: string;
  lastSynced?: string;
  deletedAt: string;
}

export interface TrashedItems {
  skills: TrashedSkill[];
  mcps: TrashedMcp[];
  claudeMdFiles: TrashedClaudeMd[];
  rules: TrashedRule[];
  scenes: TrashedScene[];
  projects: TrashedProject[];
}
```

#### `src/stores/trashStore.ts` — add 2 actions

```ts
restoreScene: async (id: string) => {
  if (!isTauri()) { ... }
  set({ isRestoring: true, error: null });
  try {
    await safeInvoke('restore_scene', { id });
    await get().loadTrashedItems();
    set({ isRestoring: false });
    return true;
  } catch (error) {
    const message = typeof error === 'string' ? error : String(error);
    set({ error: message, isRestoring: false });
    return false;
  }
},
restoreProject: async (id: string) => {
  /* same shape, IPC 'restore_project' */
},
```

Note: `restore_scene` / `restore_project` take `id` (not `path`) because Scene / Project trash records live in data.json keyed by their UUID, not on disk. This is consistent with the backend signature.

#### `src/components/modals/TrashRecoveryModal.tsx` — add Scenes / Projects tabs

Same scaffolding as Rules (above). 6 tabs total.

Need to import:
- `Layers` (Scene's existing app icon — verify via `rg -n 'Layers' src/`)
- `Folder` (Project's existing app icon — verify)

Tab order: Skills | MCPs | CLAUDE.md | Rules | Scenes | Projects.

Restore key for Scene / Project items is `id` (not `path`) — selection Set stores ids:

```ts
const [selectedScenes, setSelectedScenes] = useState<Set<string>>(new Set());
const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
```

`handleRestore` loop calls `restoreScene(id)` / `restoreProject(id)`.

### User-observable success

- **User does X (Scene)**: User creates Scene "Coding Boost" with 5 Skills + 3 MCPs. Goes to ScenesPage, deletes it (assume no projects reference it). Opens Trash Recovery.
- **User sees Y**: 6th tab "Scenes" exists. Lists "Coding Boost" with deleted_at. User clicks Recover.
- **Then User does**: Goes to ScenesPage. "Coding Boost" reappears with all 5 Skills + 3 MCPs intact (assuming no Skills / MCPs were deleted while in trash; ones that were are silently dropped per R5 F5 reference validity).
- **User does NOT see**: "Scene gone forever, must recreate manually."

- **User does X (Project)**: User creates Project "myapp" bound to Scene "Coding Boost". Deletes the project. Trash Recovery → Projects tab → Recover.
- **User sees Y**: Project "myapp" reappears in ProjectsPage with its sceneId intact. If "Coding Boost" was also deleted (and not restored), the project's sceneId is empty — ProjectsPage shows "No scene selected" so user reassigns.
- **User does NOT see**: "Project I created is gone, must redo path / scene binding."

---

## DATA_MUTEX usage audit

Per `.claude/rules/grep-before-enumerate-shared-resource.md`, every new function that touches `data.json` must lock.

New / modified functions and their lock status:

| Function | Locks DATA_MUTEX? | Why |
|---|---|---|
| `restore_skill` (modified) | YES (newly added) | Reads + writes `skill_metadata` |
| `restore_mcp` (modified) | YES (newly added) | Reads + writes `mcp_metadata` |
| `list_trashed_items` (modified) | YES (newly added for scenes/projects block) | Reads `trashed_scenes` / `trashed_projects` from AppData; previously was pure disk read |
| `restore_scene` (new) | YES | Mutates `trashed_scenes` + `scenes` |
| `restore_project` (new) | YES | Mutates `trashed_projects` + `projects` |
| `sanitize_*_metadata_against_data` (new helpers) | NO — pure | Operates on borrowed `&AppData` snapshot, no IO |

All locks are acquired before the FIRST read of AppData and held until after the write, mirroring `restore_claude_md` / `restore_rule` convention.

Defense-in-depth: I also grep for direct fs::write on data.json bypassing canonical helpers — no new violations introduced.

---

## Self-check 5 (per charter §6)

1. **Does any of this touch code outside the finding-described scope?**
   - `marketplace.rs`: only visibility change on 2 fn declarations (`fn` → `pub(crate) fn`). No logic change.
   - `types.rs`: only field additions (`TrashedItems::scenes` / `::projects`) with `#[serde(default)]`. No existing field touched.
   - `lib.rs`: 2 new IPC registrations.
   - `data.rs`: no changes — `delete_scene` / `delete_project` keep writing to `trashed_scenes` / `trashed_projects` as today.
   - Otherwise: only `trash.rs` (Rust) + `trashStore.ts` + `TrashRecoveryModal.tsx` + `src/types/trash.ts` (TS).

2. **Same bug elsewhere I'm not fixing?**
   - Grep for `fs::rename.*\.json\.metadata\.json|fs::rename.*ensemble_metadata` to verify no other restore path silently leaks snapshot files: zero hits outside the modified `restore_mcp` and the marketplace path (which already cleans up).
   - Grep for "trashed_scenes|trashed_projects" — already covered above (only writes, zero readers before my fix).
   - Grep for any other store action that might assume the same 4-tab modal structure — none found; `TrashRecoveryModal` is the only consumer.

3. **New dependency / file / IPC?**
   - No new crate / npm dependency.
   - 2 new IPCs (`restore_scene` / `restore_project`) — explicitly mandated by A5 finding.
   - No new file other than `F2_plan.md` and `F2_log.md`.

4. **Modified existing IPC signature / return shape?**
   - `list_trashed_items`: return type `TrashedItems` gains 2 fields (`scenes`, `projects`). Backward-compatible because:
     - Frontend types are updated in lockstep (mandatory part of this fix).
     - `#[serde(default)]` on backend means old clients reading new payloads (impossible in this app, but safe) silently drop the new fields.
     - New clients reading old payloads (also impossible, but safe) see empty Vecs.
   - No other IPC signature touched.

5. **Broken existing unit tests?**
   - `types.rs::tests::*::trashed_scenes.is_empty()` (1741-1742, 2109) — these test `AppData::default()`, not `TrashedItems`. Unaffected.
   - `trash.rs::tests` — exercise `parse_timestamp_from_name` only. Unaffected by my changes.
   - No frontend tests target TrashRecoveryModal directly (verified by grep).

---

## Open questions / proposals

**Q1**: Should the "Recover Selected" footer button behave when the active tab has 0 selection but other tabs do?
**Proposal**: KEEP existing behavior. The footer button counts `totalSelectedCount` across ALL tabs (existing code, line 281). User can select 2 skills + 1 scene + 1 project and click Recover once; all 4 restore in a single click. The Rules tab + Scenes/Projects tab inherit the same multi-tab batch behavior. No regression.

**Q2**: Empty-state UI for new tabs when trash is empty?
**Proposal**: Mirror existing empty states — small icon (Sliders / Layers / Folder) + "No deleted Rules / Scenes / Projects" + "Items you delete will appear here". Pure visual consistency.

**Q3**: Trash IDs vs paths in selection Set?
**Proposal**: Skills / MCPs / CLAUDE.md / Rules selection keyed by **path** (existing pattern, line 459/550/641). Scenes / Projects keyed by **id** (new — no disk path because data lives in data.json). The selection Set's value type is `string` either way; only the source field differs. Document inline.

**Q4**: A4 / A5 tab insertion order — should new tabs come before or after CLAUDE.md / Rules?
**Proposal**: Keep the canonical sidebar order: Skills → MCPs → CLAUDE.md → Rules → Scenes → Projects. This matches the app's mental model and means a user finding the existing 3 tabs continues to see them in the familiar position; the new tabs appear "after" in a clearly identifiable group of new functionality. No risk of user re-learning tab muscle memory.

**Q5**: When user restores a Scene whose `last_used` is in the future or 6 months stale — should we reset `last_used`?
**Proposal**: NO. Preserve `last_used` as-is. Restoring is intent-preserving; the user's last interaction with the scene was X months ago, and `last_used` is informational only (no UI dependency on its absolute recency). If the user wanted a fresh history they would create a new Scene.
