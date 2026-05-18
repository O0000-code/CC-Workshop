// src/types/claudeMd.ts

/**
 * CLAUDE.md 文件类型
 * - global: 用户级全局 (~/.claude/CLAUDE.md)
 * - project: 项目级 (./CLAUDE.md 或 ./.claude/CLAUDE.md)
 * - local: 本地级 (./CLAUDE.local.md)
 */
export type ClaudeMdType = 'global' | 'project' | 'local';

/**
 * CLAUDE.md 分发目标路径
 */
export type ClaudeMdDistributionPath =
  | '.claude/CLAUDE.md' // 默认
  | 'CLAUDE.md'
  | 'CLAUDE.local.md';

/**
 * 冲突解决策略
 */
export type ClaudeMdConflictResolution =
  | 'overwrite' // 覆盖
  | 'backup' // 备份后覆盖
  | 'skip'; // 跳过

/**
 * CLAUDE.md 文件信息
 * 存储在 ~/.cc-workshop/claude-md/ 中的被管理文件
 */
export interface ClaudeMdFile {
  /** 唯一标识 (UUID) */
  id: string;

  /** 显示名称 (用户可编辑) */
  name: string;

  /** 描述 (用户可编辑) */
  description: string;

  /** 原始来源路径 (扫描时的路径) */
  sourcePath: string;

  /** 原始来源类型 */
  sourceType: ClaudeMdType;

  /** 文件内容 */
  content: string;

  /** 是否设为全局 */
  isGlobal: boolean;

  /** 分类 ID */
  categoryId?: string;

  /** 标签 ID 列表 */
  tagIds: string[];

  /** 创建时间 (ISO 8601) */
  createdAt: string;

  /** 更新时间 (ISO 8601) */
  updatedAt: string;

  /** 字节大小 */
  size: number;

  /** 自定义图标名称 */
  icon?: string;
}

/**
 * 扫描结果项
 * 扫描时发现的 CLAUDE.md 文件
 */
export interface ClaudeMdScanItem {
  /** 文件路径 */
  path: string;

  /** 文件类型 */
  type: ClaudeMdType;

  /** 文件大小 (字节) */
  size: number;

  /** 最后修改时间 (ISO 8601) */
  modifiedAt: string;

  /** 是否已导入 (在 CC Workshop 管理中) */
  isImported: boolean;

  /** 如果已导入，对应的 ClaudeMdFile ID */
  importedId?: string;

  /** 内容预览 (前 500 字符) */
  preview?: string;

  /** 所属项目名称 (从路径推断) */
  projectName?: string;
}

/**
 * 扫描结果
 */
export interface ClaudeMdScanResult {
  /** 扫描到的文件列表 */
  items: ClaudeMdScanItem[];

  /** 扫描的目录数量 */
  scannedDirs: number;

  /** 扫描耗时 (毫秒) */
  duration: number;

  /** 错误信息 (如果有) */
  errors: string[];
}

/**
 * 导入选项
 */
export interface ClaudeMdImportOptions {
  /** 源文件路径 */
  sourcePath: string;

  /** 自定义名称 (可选，默认从文件名/路径推断) */
  name?: string;

  /** 自定义描述 (可选) */
  description?: string;

  /** 分类 ID (可选) */
  categoryId?: string;

  /** 标签 ID 列表 (可选) */
  tagIds?: string[];
}

/**
 * 导入结果
 */
export interface ClaudeMdImportResult {
  /** 是否成功 */
  success: boolean;

  /** 导入的文件 (成功时) */
  file?: ClaudeMdFile;

  /** 错误信息 (失败时) */
  error?: string;
}

/**
 * 分发选项
 */
export interface ClaudeMdDistributionOptions {
  /** 要分发的 ClaudeMdFile ID */
  claudeMdId: string;

  /** 目标项目路径 */
  projectPath: string;

  /** 目标文件路径 (相对于项目根目录) */
  targetPath: ClaudeMdDistributionPath;

  /** 冲突解决策略 */
  conflictResolution: ClaudeMdConflictResolution;
}

/**
 * 分发结果
 */
export interface ClaudeMdDistributionResult {
  /** 是否成功 */
  success: boolean;

  /** 目标文件完整路径 */
  targetPath: string;

  /** 执行的操作 */
  action: 'created' | 'overwritten' | 'backed_up' | 'skipped';

  /** 备份路径 (如果有备份) */
  backupPath?: string;

  /** 错误信息 (失败时) */
  error?: string;
}

/**
 * 设置全局结果
 */
export interface SetGlobalResult {
  /** 是否成功 */
  success: boolean;

  /** 之前的全局文件 ID (如果有) */
  previousGlobalId?: string;

  /** 原有 ~/.claude/CLAUDE.md 的备份路径 (如果需要备份) */
  backupPath?: string;

  /** 错误信息 (失败时) */
  error?: string;
}
