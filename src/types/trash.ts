export interface TrashedSkill {
  id: string;
  name: string;
  path: string;
  deletedAt: string;
  description: string;
}

export interface TrashedMcp {
  id: string;
  name: string;
  path: string;
  deletedAt: string;
  description: string;
}

export interface TrashedClaudeMd {
  id: string;
  name: string;
  path: string;
  deletedAt: string;
}

/**
 * Trashed Rule. Mirrors Rust `TrashedRule`. `filename` is preserved through
 * trash because Claude Code indexes Rules by filename — restore must put the
 * file back with the original `.md` name.
 */
export interface TrashedRule {
  id: string;
  name: string;
  filename: string;
  path: string;
  deletedAt: string;
  description: string;
}

/**
 * Trashed Scene. Mirrors Rust `TrashedScene`. Lives in `AppData::trashed_scenes`
 * (data.json), not on disk — so restore is keyed by `id`, not by `path`. The
 * full bundle (skillIds / mcpIds / claudeMdIds / ruleIds) round-trips through
 * trash; references that no longer resolve are filtered out at restore time
 * (R5 F5 reference-validity discipline).
 */
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

/**
 * Trashed Project. Mirrors Rust `TrashedProject`. Like `TrashedScene`,
 * stored in `data.json::trashed_projects` and restore is id-keyed.
 */
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
