# Angle Cross-Validation — Expert A vs B vs 已派 R1-R4

## 上下文

用户指出主 Agent 在 Phase 2 跳过"angle 专家分析"是方法论错误。补救:派 2 个完全独立的 Opus angle expert(A/B),不预设视角、不互相可见、不读 .dev/bug-audit/ 已有文档。两人独立产出后做交叉验证。

## 交叉验证表

| Expert A (N=7) | Expert B (N=8) | 已派 R1-R4 覆盖情况 | 决定 |
|---|---|---|---|
| A1 Disk↔Memory 一致性 | B2 持久化 & 不变式 & 并发完整性 | R1 主要覆盖 | 已覆盖,R1 finding 有效 |
| A2 对外写入(用户文件破坏面) | B4 下游分发 / Project sync / Clear | R1(sync/clear) + R4(injection 部分) | 已覆盖 |
| A3 外部上游信任边界 | B1 上游采集 & 外部 trust | R2 主要覆盖 | 已覆盖 |
| A4 并发与状态一致性 | (合并进 B2) | R1 部分(DATA_MUTEX 边界) | 已覆盖 |
| **A5 生命周期 / 启动 / 迁移 / Trash 永久删除** | **B7 启动、迁移、升级、cleanup、长期演化** | **完全没覆盖** | **补派 R5** |
| A6 前端渲染 & 交互 | B5 IPC契约 + B6 UI 状态 / 错误反馈 | R3 主要覆盖 IPC 契约,UI 视觉层漏 | **补派 R7**(只覆盖 UI 视觉层,IPC 契约 R3 已扫) |
| **A7 环境与边缘部署 / NFD / multi-user** | **B8 macOS 系统集成 / FS 怪异性 / 与 Claude Code 并发** | 只 R4 边缘碰到(Shell 注入面),核心未覆盖 | **补派 R6** |

## 关键观察

1. **两位 expert 高度收敛**:除了 A 把"并发"独立成 angle、B 把"实体生命周期/软删除"独立成 angle 这两处划分差异外,其余 angle 边界基本一致。这是高置信度的交叉验证。

2. **expert 都点出的两个 critical 漏角**:
   - **B7 / A5(时间维度横切)**:Trash 长期累积、migration partial-state、第一次启动 corrupted ~/.ensemble/、cleanup_legacy_mcp_cache 边缘
   - **B8 / A7(环境维度横切)**:与 Claude Code 并发写 ~/.claude.json、NFC vs NFD、多 user 机器、TCC 权限、Network volume、不支持 symlink 的 FS

3. **如果不补这两个 reviewer 直接交付,等于无视 expert 提示的盲区** —— 用户的"准 + 有把握"标准做不到。

## 补派 Reviewer 划分

### R5 — 生命周期 / 启动 / 迁移 / cleanup / Trash 累积
对应 expert A5 + B7。

### R6 — macOS 系统集成 / 文件系统怪异性 / 与 Claude Code 并发共存
对应 expert A7 + B8。

### R7 — UI 视觉层 / 交互 / 错误反馈 / 大数据量
对应 expert A6 / B6 中 R3 没扫的部分(IPC 契约部分已由 R3 覆盖)。

## 不补派(已覆盖,Phase 5 复核 R1-R4 即可)

- A1/B2(数据一致性):R1 主要覆盖
- A2/B4(对外写入):R1 + R4 覆盖
- A3/B1(上游信任):R2 主要覆盖
- A4/B2(并发):R1 部分覆盖(DATA_MUTEX 边界)
- B3(实体生命周期 & 软删除 & 引用悬垂):R1 + R2 覆盖(A2 trashed_scenes、A3 restore 失 metadata、A4 cascade 漏 Rules 等)
- B5(IPC 契约):R3 主要覆盖
- B6 IPC 部分:R3 覆盖,UI 视觉层由 R7 补

## 模型 / 并发设置

- 全部 Reviewer 使用 **Opus**(per 用户偏好,质量优先)
- 3 个新 Reviewer 在同一条消息内 **并行**(blocking)
- R1-R4 之前已派且 Opus,findings 保留待 Phase 5 复核
