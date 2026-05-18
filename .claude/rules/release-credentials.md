# Release Credentials Location

## When This Applies

CC Workshop 发布 / Apple 公证 / 任何带公证的 `npm run tauri build` 任务。

## The Rule

公证凭据（`APPLE_API_KEY` / `APPLE_API_ISSUER` / `APPLE_API_KEY_PATH`）唯一 source-of-truth: `~/.config/cc-workshop-notarize.env`（git-ignored, chmod 600）。发布前先 `source ~/.config/cc-workshop-notarize.env`，再跑 `npm run tauri build`。文件不存在 → 停下问 user；**不要**自己去 shell config / keychain / memory / 历史 commit 重新搜或重新创建，那条路被反复证明会"找不到"。

## Why

凭据散落在 session memory 里 cross-agent / cross-session 不可见，反复浪费时间找。固定单一路径 + 强制不可绕过，把搜索成本归零。
