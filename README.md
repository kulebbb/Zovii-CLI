# zovii

Zovii Studio CLI — AI image & video generation from the command line.

## Installation

```bash
npm install -g zovii
```

Requires Node.js >= 18.

## Quick Start

```bash
# 登录
zovii login <username> <password>

# 生成图片
zovii generate-image <project_id> --prompt "一只柴犬宇航员，电影质感"

# 生成视频
zovii generate-video <project_id> --prompt "桃花飘落的庭院，电影运镜" --duration 8

# 登出
zovii logout
```

## Commands

| 命令 | 说明 |
|---|---|
| `login <username> <password>` | 账密登录，token 保存到 ~/.config/zovii/auth.json |
| `logout` | 清除本地 token |
| `create-project <name>` | 新建项目 |
| `generate-image <project> --prompt <text>` | AI 文生图 / 图生图 |
| `generate-video <project> --prompt <text>` | AI 生视频（支持首尾帧/参考素材） |
| `upload-asset <project> <file>` | 上传本地文件为 asset |
| `download-asset <project> <asset>` | 下载 asset 到本地 |
| `list-assets <project>` | 列出项目素材 |
| `remove-background <project> <image>` | 图片去背景 |
| `upscale-video <project> <video>` | 视频高清放大 |

## Output Format

所有命令支持 `-f json` 输出：

```bash
zovii list-assets <project_id> -f json
```

## Authentication

Token 自动保存在 `~/.config/zovii/auth.json`，过期前 5 分钟自动刷新，无需手动重新登录。
