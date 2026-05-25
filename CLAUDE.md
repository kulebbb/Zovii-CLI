# CLAUDE.md — zovii CLI 项目协作约定

## 项目身份

- 仓库根 = npm 包 `zovii` 源码（**不是 monorepo**，没有 `packages/zovii-cli/` 子目录）
- 入口：`bin/zovii.js`（`package.json` 的 `bin.zovii` 指向它）
- npm 包名：`zovii` · 维护账号：`kulebbb`
- 远端：`https://github.com/kulebbb/Zovii-CLI`
- 后端在 `/Users/zhaoliang/Documents/coding/zovii/backend/`（Python/FastAPI），接口与 schema 见 user memory `zovii-cli-status.md`

## 发版

用户说"发版 / publish / 升 vX.Y.Z" → 运行 `/release patch|minor|major`。完整 7 步流程在 `.claude/commands/release.md`。

## Commit / PR 规范

- commit message **中文**，首行 `<type>: <简述>`（release / fix / feat / refactor / docs / chore），空行后接中文 body
- PR title **中文**，release 类统一 `release: zovii vX.Y.Z`
- PR body 三段式：① 变更 ② 发布状态（npm 版本 / tag） ③ 验证步骤（带命令）

> **以下规则已通过 PreToolUse hook 强制执行（见 `.claude/hooks/guard-git.sh`），无需依赖记忆：**
> - 禁止直接 `git push origin main`（main 受 auto-classifier 保护），必须走 `release/vX.Y.Z` 分支 + PR
> - 禁止 `Co-Authored-By: Claude` trailer（会被 auto-classifier 判定为伪造作者归属）

## 历史坑速查

代码级历史坑（bin 字段格式、`.version()` 动态读取、stale version 排查）见 `docs/dev-notes.md`，发版/改 CLI 入口前对照检查。
