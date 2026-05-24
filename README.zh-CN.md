# zovii — Zovii Studio CLI

[![npm version](https://img.shields.io/npm/v/zovii.svg)](https://www.npmjs.com/package/zovii)
[![node](https://img.shields.io/node/v/zovii.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/zovii.svg)](LICENSE)

命令行调用 [Zovii Studio](https://zovii.studio) 的 AI 文生图 / 文生视频能力。

**[English](README.md)**

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

## 命令列表

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
