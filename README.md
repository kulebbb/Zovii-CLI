# zovii — Zovii Studio CLI

[![npm version](https://img.shields.io/npm/v/zovii.svg)](https://www.npmjs.com/package/zovii)
[![node](https://img.shields.io/node/v/zovii.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/zovii.svg)](LICENSE)

命令行调用 [Zovii Studio](https://zovii.studio) 的 AI 文生图 / 文生视频能力。

**[English](README.en.md)**

---

## 🤖 让 AI Agent 帮你安装（推荐）

复制下面这行发送给你的 AI agent（Claude Code、Cursor、Codex、Warp 等）：

```
帮我安装 zovii CLI：https://raw.githubusercontent.com/kulebbb/Zovii-CLI/main/docs/agent-install.md
```

agent 会自动 fetch 这份运行手册，依次完成：装 CLI → 装 agent skill → 引导登录 → 验证可用。你不需要再敲任何命令。

装好后用自然语言就能驱动："生成一只柯基宇航员的图"、"列出我的项目"、"把 `./photo.jpg` 去掉背景" 等等。

---

## 手动安装

```bash
npm install -g zovii
```

需要 **Node.js ≥ 18**，无浏览器依赖。

## 快速开始

```bash
# 登录（默认手机号 + 验证码；token 本地保存，自动刷新）
zovii login

# 列出项目
zovii list-projects

# 生成图片
zovii generate-image <projectId> --prompt "一只柯基宇航员，电影质感"

# 生成视频
zovii generate-video <projectId> --prompt "桃花飘落，慢镜头平移" --duration 8

# 下载素材
zovii download-asset <assetId>
```

## 命令列表

| 命令 | 说明 |
|---|---|
| `login` | 手机号 + 验证码交互登录（默认） |
| `login <phone> [--code <code>]` | 半交互 / 完全非交互登录 |
| `login -u <user> -p <pass>` | 账密登录（兼容旧路） |
| `logout` | 清除本地 token |
| `send-code <phone>` | 单独发送登录验证码（5 分钟有效） |
| `list-projects` | 列出当前账号所有项目 |
| `list-models [tool]` | 列出产品当前可用的工具 / 模型及其可选参数（`--refresh` 强制刷新缓存） |
| `create-project <name>` | 新建项目（默认个人项目；企业成员可 `--type personal\|enterprise`，交互终端会询问） |
| `list-assets <projectId>` | 列出项目素材（`--type image\|video\|audio`，`--limit n`） |
| `upload-asset <projectId> <file>` | 上传本地文件为项目 asset（上限 80 MB） |
| `download-asset <assetId>` | 下载素材到本地（`--out <path>` 指定路径） |
| `generate-image <projectId> --prompt <text>` | AI 文生图 / 图生图 |
| `batch-generate-image <projectId> --prompt <a> --prompt <b>` | 批量文生图：多个不同 prompt 一次提交，每条生成 1 张（上限 20 条） |
| `generate-video <projectId>` | AI 文生视频 / 首尾帧 / 参考素材 |
| `remove-background <projectId> <image>` | 图片去除背景 |
| `upscale-video <projectId> <video>` | 视频高清放大 |
| `list-groups <projectId>` | 列出项目的画布分组 |
| `create-group <projectId> <name>` | 新建画布分组（`--assets id,id` 带成员，`--auto-organize` 开自动整理，`--color <c>` 颜色） |
| `add-to-group <projectId> <groupId> --assets id,id` | 给已有分组追加成员资产 |
| `rename-group <projectId> <groupId> <newName>` | 重命名分组 |
| `set-auto-organize <projectId> <groupId> <on\|off>` | 开/关分组自动整理 |

执行 `zovii <command> --help` 查看完整参数。

可用模型及其参数取值（`--model`、`--aspect-ratio`、`--size`、`--ratio`、`--duration`、`--resolution` 等）由 zovii.studio 的产品配置在运行时拉取并本地缓存 1 小时，CLI 不再内置任何模型白名单。运行 `zovii list-models ai_image` / `zovii list-models ai_video` 查看当前可用取值；不传对应参数即使用该模型的默认值。

> 生图默认分辨率随产品默认走（当前默认模型 `ws-nano-banana-pro` 为 `1k`），旧版本 CLI 固定发 2K。需要 2K 请显式传 `--size 2k`（字段名随模型而异，以 `zovii list-models ai_image` 为准）。

> **画布分组注意事项**：分组数据存于项目画布布局，CLI 每次操作会整块读-改-写。请在该项目的网页画布**关闭时**运行这些命令，否则网页端自动保存可能覆盖 CLI 改动。开启自动整理只置标志位，真正的节点重排会在下次网页打开该分组时由前端完成。

## 本地文件直接传入

所有接受素材的参数（`--image-input`、`--ref-video`、`<image>`、`<video>` 等）都支持直接传本地文件路径，CLI 会自动上传，无需先 `upload-asset`：

```bash
zovii remove-background <projectId> ./my-photo.jpg
zovii generate-video <projectId> --image-input ./first-frame.png --prompt "镜头拉远"
```

## 输出格式

默认输出表格，加 `-f json` 输出 JSON：

```bash
zovii list-projects -f json
zovii generate-image <projectId> --prompt "..." -f json
```

## 登录方式

默认走 **手机号 + 验证码**：

```bash
zovii login                                   # 全交互：输入手机号 → 收码 → 输入验证码
zovii login 13800000000                       # 半交互：自动发码 → 输入验证码
zovii login 13800000000 --code 123456         # 完全非交互（验证码需另行获取）
zovii send-code 13800000000                   # 单独发码（重发或先发后登）
```

老的 **账密登录** 仍然可用：

```bash
zovii login -u <用户名> -p <密码>
```

> 注意：原 `zovii login <用户名> <密码>` 的两位置参写法已变更，CLI 会给出迁移提示。

## 登录态

Token 保存在 `~/.config/zovii/auth.json`（权限 `0600`），临过期 5 分钟内自动刷新，无需手动重登录。

## Agent Skill

仓库内附带符合 [skills.sh](https://www.skills.sh) 标准的 [SKILL.md](skills/zovii/SKILL.md)。上面的 agent 安装流程会自动装好它。如果 CLI 已装好，只想单独装 skill：

```bash
npx skills add kulebbb/Zovii-CLI
```

## 链接

- npm 包：https://www.npmjs.com/package/zovii
- Zovii Studio：https://zovii.studio
- 价格：https://zovii.studio/pricing

## 许可证

MIT
