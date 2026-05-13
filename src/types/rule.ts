// src/types/rule.ts
//
// Type mirrors of `src-tauri/src/types.rs` Rule family. All fields are
// camelCase to match the Rust `#[serde(rename_all = "camelCase")]` wire
// shape. Six deliberate deviations from the CLAUDE.md type family (see
// `.dev/rule-management/01_design.md`):
//   1. Scene `ruleIds: string[]` (multi-select); see `src/types/index.ts`.
//   2. Per-rule `isGlobal` flag — multiple rules can be global simultaneously.
//   3. `filename` is persisted and immutable after import.
//   4. Distribution path is fixed to `<project>/.claude/rules/<filename>.md`.
//   5. No `sourceType` enum — Rules have no Global/Project/Local trichotomy.
//   6. `distributeSceneRules` is a real batch operation.

/**
 * Conflict resolution strategy when a target rule file already exists.
 * Shared with CLAUDE.md distribution (wire shape matches Rust
 * `ClaudeMdConflictResolution`).
 */
export type RuleConflictResolution = 'overwrite' | 'backup' | 'skip';

/**
 * Managed Rule file. Mirror of Rust `Rule` in `src-tauri/src/types.rs`.
 */
export interface Rule {
  /** Unique identifier (UUID). */
  id: string;

  /** Display name (user-editable). */
  name: string;

  /** Description (user-editable). */
  description: string;

  /**
   * Original `.md` filename, e.g. `validate-no-public-api-claim.md`.
   * **Immutable** after import — Claude Code indexes rules by filename.
   */
  filename: string;

  /** Original source path. */
  sourcePath: string;

  /** File content (runtime-populated; empty string in persisted form). */
  content: string;

  /** Managed file path (`~/.ensemble/rules/{id}/<filename>.md`). */
  managedPath?: string;

  /**
   * Whether this Rule is currently set as global. Multiple Rules may be
   * global simultaneously; each writes its own `~/.claude/rules/<filename>.md`.
   */
  isGlobal: boolean;

  /** Category ID. */
  categoryId?: string;

  /** Tag ID list. */
  tagIds: string[];

  /** Created time (ISO 8601). */
  createdAt: string;

  /** Updated time (ISO 8601). */
  updatedAt: string;

  /** Size in bytes. */
  size: number;

  /** Custom icon name. */
  icon?: string;
}

/**
 * Scan result item — one discovered `.claude/rules/*.md` file on disk.
 */
export interface RuleScanItem {
  /** File path. */
  path: string;

  /** File size (bytes). */
  size: number;

  /** Last modified time (ISO 8601). */
  modifiedAt: string;

  /** Whether already imported into Ensemble. */
  isImported: boolean;

  /** Corresponding `Rule.id` if imported. */
  importedId?: string;

  /** Content preview (first 500 chars). */
  preview?: string;

  /** Project name (only set for `sourceScope === 'project'`). */
  projectName?: string;

  /**
   * Where this rule was discovered. UI uses this to group scan results into
   * "user-global" vs "project-local" sections.
   */
  sourceScope: 'user' | 'project';
}

/** Scan result. */
export interface RuleScanResult {
  items: RuleScanItem[];
  scannedDirs: number;
  duration: number;
  errors: string[];
}

/** Import options. */
export interface RuleImportOptions {
  /** Source file path. */
  sourcePath: string;

  /** Custom name (defaults to filename stem). */
  name?: string;

  /** Custom description. */
  description?: string;

  /** Category ID. */
  categoryId?: string;

  /** Tag ID list. */
  tagIds?: string[];
}

/** Import result. */
export interface RuleImportResult {
  success: boolean;
  file?: Rule;
  error?: string;
}

/**
 * Distribution options. Target path is implicit and fixed at
 * `<project>/.claude/rules/<filename>.md`, so there is NO `targetPath` field
 * (this is a deliberate deviation from `ClaudeMdDistributionOptions`).
 */
export interface RuleDistributionOptions {
  /** Rule ID to distribute. */
  ruleId: string;

  /** Target project path. */
  projectPath: string;

  /** Conflict resolution strategy. */
  conflictResolution: RuleConflictResolution;
}

/** Distribution result. */
export interface RuleDistributionResult {
  success: boolean;
  targetPath: string;
  action: 'created' | 'overwritten' | 'backed_up' | 'skipped' | 'failed';
  backupPath?: string;
  error?: string;
}

/** Result of `setGlobalRule`. */
export interface SetGlobalRuleResult {
  success: boolean;

  /**
   * Backup path of the prior unmanaged `~/.claude/rules/<filename>.md` if one
   * existed.
   */
  backupPath?: string;

  /**
   * ID of the auto-imported "Original" Rule if an existing unmanaged file was
   * preserved.
   */
  autoImportedId?: string;

  error?: string;
}
