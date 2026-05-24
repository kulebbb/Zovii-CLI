# zovii — Zovii Studio CLI

[![npm version](https://img.shields.io/npm/v/zovii.svg)](https://www.npmjs.com/package/zovii)
[![node](https://img.shields.io/node/v/zovii.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/zovii.svg)](LICENSE)

AI image & video generation from the command line, powered by [Zovii Studio](https://zovii.studio).

**[English](#english) | [中文](#中文)**

---

## English

### Installation

```bash
npm install -g zovii
```

Requires **Node.js ≥ 18**. No browser dependency.

### Quick Start

```bash
# Log in (token is saved locally and auto-refreshed)
zovii login <username> <password>

# List your projects
zovii list-projects

# Generate an image
zovii generate-image <projectId> --prompt "a corgi astronaut, cinematic"

# Generate a video
zovii generate-video <projectId> --prompt "cherry blossoms falling, slow pan" --duration 8

# Download an asset
zovii download-asset <assetId>
```

### Commands

| Command | Description |
|---|---|
| `login <username> <password>` | Authenticate; token saved to `~/.config/zovii/auth.json` |
| `logout` | Clear local token |
| `list-projects` | List all projects on your account |
| `create-project <name>` | Create a new project |
| `list-assets <projectId>` | List assets in a project (`--type image\|video\|audio`, `--limit n`) |
| `upload-asset <projectId> <file>` | Upload a local file as a project asset (≤ 80 MB) |
| `download-asset <assetId>` | Download an asset to local disk (`--out <path>`) |
| `generate-image <projectId> --prompt <text>` | Text-to-image / image-to-image |
| `generate-video <projectId>` | Text-to-video / first-last-frame / reference-based video |
| `remove-background <projectId> <image>` | Remove background from an image |
| `upscale-video <projectId> <video>` | Upscale a video to higher resolution |

Run `zovii <command> --help` for full option lists.

### Local Files as Input

Any command that accepts an asset (`--image-input`, `--ref-video`, `<image>`, `<video>`, …) also accepts a local file path. The CLI uploads it automatically — no need to call `upload-asset` first.

```bash
zovii remove-background <projectId> ./my-photo.jpg
zovii generate-video <projectId> --image-input ./first-frame.png --prompt "zoom out"
```

### Output Format

Default output is a table. Add `-f json` for machine-readable output:

```bash
zovii list-projects -f json
zovii generate-image <projectId> --prompt "..." -f json
```

### Authentication

Tokens are stored at `~/.config/zovii/auth.json` (mode `0600`) and refreshed automatically when within 5 minutes of expiry. No need to log in again until your refresh token expires.

### AI Agent Skill

This CLI ships with a [SKILL.md](skills/zovii/SKILL.md) following the [skills.sh](https://www.skills.sh) standard. AI agents (Claude Code, etc.) can install it to operate the CLI on your behalf:

```bash
npx skills add zovii
```

### Links

- npm: https://www.npmjs.com/package/zovii
- Zovii Studio: https://zovii.studio
- Pricing: https://zovii.studio/pricing

---

## 中文

### 安装

```bash
npm install -g zovii
```

需要 **Node.js ≥ 18**，无浏览器依赖。

### 快速开始

```bash
# 登录（token 本地保存，自动刷新）
zovii login <username> <password>

# 列出项目
zovii list-projects

# 生成图片
zovii generate-image <projectId> --prompt "一只柯基宇航员，电影质感"

# 生成视频
zovii generate-video <projectId> --prompt "桃花飘落，慢镜头平移" --duration 8

# 下载素材
zovii download-asset <assetId>
```

### 命令列表

| 命令 | 说明 |
|---|---|
| `login <username> <password>` | 账密登录，token 保存到 `~/.config/zovii/auth.json` |
| `logout` | 清除本地 token |
| `list-projects` | 列出当前账号所有项目 |
| `create-project <name>` | 新建项目 |
| `list-assets <projectId>` | 列出项目素材（`--type image\|video\|audio`，`--limit n`） |
| `upload-asset <projectId> <file>` | 上传本地文件为项目 asset（上限 80 MB） |
| `download-asset <assetId>` | 下载素材到本地（`--out <path>` 指定路径） |
| `generate-image <projectId> --prompt <text>` | AI 文生图 / 图生图 |
| `generate-video <projectId>` | AI 文生视频 / 首尾帧 / 参考素材 |
| `remove-background <projectId> <image>` | 图片去除背景 |
| `upscale-video <projectId> <video>` | 视频高清放大 |

执行 `zovii <command> --help` 查看完整参数。

### 本地文件直接传入

所有接受素材的参数（`--image-input`、`--ref-video`、`<image>`、`<video>` 等）都支持直接传本地文件路径，CLI 会自动上传，无需先 `upload-asset`：

```bash
zovii remove-background <projectId> ./my-photo.jpg
zovii generate-video <projectId> --image-input ./first-frame.png --prompt "镜头拉远"
```

### 输出格式

默认输出表格，加 `-f json` 输出 JSON：

```bash
zovii list-projects -f json
zovii generate-image <projectId> --prompt "..." -f json
```

### 登录态

Token 保存在 `~/.config/zovii/auth.json`（权限 `0600`），临过期 5 分钟内自动刷新，无需手动重登录。

### AI Agent Skill

仓库内附带符合 [skills.sh](https://www.skills.sh) 标准的 [SKILL.md](skills/zovii/SKILL.md)，可被 AI agent（Claude Code 等）安装后调用本 CLI：

```bash
npx skills add zovii
```

### 链接

- npm 包：https://www.npmjs.com/package/zovii
- Zovii Studio：https://zovii.studio
- 价格：https://zovii.studio/pricing

---

## License

MIT
