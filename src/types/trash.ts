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

export interface TrashedItems {
  skills: TrashedSkill[];
  mcps: TrashedMcp[];
  claudeMdFiles: TrashedClaudeMd[];
  rules: TrashedRule[];
}
