# zovii Command Reference

All 12 commands. Global flag: `-f json` / `-f table` (default `table`).

---

## zovii login

登录 Zovii Studio。默认走手机号 + 验证码；保留账密兼容路径。

```bash
zovii login                                   # 全交互
zovii login 13800000000                       # 半交互（自动发码 + prompt 验证码）
zovii login 13800000000 --code 123456         # 完全非交互
zovii login -u <用户名> -p <密码>             # 账密兼容旧路
```

旧式 `zovii login <用户名> <密码>` 两位置参写法已变更，会给出迁移提示。

成功后 token 保存到 `~/.config/zovii/auth.json`。

输出列：`username` / `credits_balance` / `expires_at`（ISO）

---

## zovii logout

清除本地 token。

---

## zovii send-code \<phone\>

单独发送手机号验证码，用于"重发"或"先发后登"场景。

```bash
zovii send-code 13800000000
zovii send-code 13800000000 -P reset_password  # 切换 purpose（默认 login）
```

输出列：`phone` / `status`（已发送）/ `expires_in`（5 分钟）

后端限流：同手机号 60 秒内只能发一次，同一日上限 10 次。

---

## zovii list-projects

List all projects for the current account.

Output columns: `projectId`, `projectName`, `createdAt`, `updatedAt`

---

## zovii create-project \<name\>

Create a new project. Returns the new project ID.

Defaults to a personal project. Enterprise members are asked (in an interactive terminal) to choose personal or enterprise; non-enterprise users skip the prompt and always get a personal project. Pass `--type` to skip the prompt (useful for scripts).

| Option | Values | Default |
|--------|--------|---------|
| `--type` | `personal` / `enterprise` | `personal` |

Output columns: `projectId`, `projectName`, `enterpriseId`, `createdAt`

---

## zovii list-assets \<projectId\>

List assets in a project.

| Option | Values | Default |
|--------|--------|---------|
| `--type` | `image` / `video` / `audio` | all types |
| `--limit` | number | `100` |

Output columns: `assetId`, `assetName`, `assetType`, `fileUrl`, `thumbnailUrl`, `width`, `height`, `duration`

---

## zovii upload-asset \<projectId\> \<file\>

Upload a local file as a project asset. Max size: **80 MB**.

| Option | Description |
|--------|-------------|
| `--tool-type` | Optional usage tag; affects server-side processing |

Output columns: `assetId`, `assetName`, `assetType`, `fileUrl`, `thumbnailUrl`, `width`, `height`, `duration`

---

## zovii download-asset \<assetId\>

Download an asset file to local disk.

| Option | Default |
|--------|---------|
| `--out <path>` | Current directory, using the asset's original filename |

Output columns: `assetId`, `assetName`, `assetType`, `localPath`, `bytes`

---

## zovii generate-image \<projectId\>

Generate an AI image (text-to-image or image-to-image). `--prompt` is required.

| Option | Values | Default |
|--------|--------|---------|
| `--prompt` | text | **required** |
| `--model` | `ws-nano-banana-pro` / `ws-nano-banana-pro-ultra` / `doubao-seedream-4-5-251128` / `doubao-seedream-5-0-260128` / `doubao-seedream-5-0-pro-260628` / `midjourney-fast` / `ws-gpt-image-2` | `ws-nano-banana-pro` |
| `--aspect-ratio` | `1:1` / `2:3` / `3:2` / `3:4` / `4:3` / `4:5` / `5:4` / `9:16` / `16:9` / `21:9` | `1:1` |
| `--size` | `2K` / `4K` | `2K` |
| `--count` | 1–20 | `1` |
| `--image-input` | asset ID or local path; comma-separated for multiple | — |
| `--timeout` | seconds | `300` |
| `--no-wait` | flag — submit and return immediately | off |

Output columns: `taskId`, `status`, `creditCost`, `assetId`, `assetName`, `assetType`, `fileUrl`, `thumbnailUrl`, `width`, `height`, `duration`

---

## zovii batch-generate-image \<projectId\>

Batch text-to-image: submit multiple different prompts in one call; each prompt generates one image (matches the web "Batch Image Generation" tool). `--prompt` is repeatable.

| Option | Values | Default |
|--------|--------|---------|
| `--prompt` | text, repeatable (1–20 prompts) | **required** |
| `--model` | `doubao-seedream-4-5-251128` / `doubao-seedream-5-0-260128` / `doubao-seedream-5-0-pro-260628` / `midjourney-fast` | `doubao-seedream-4-5-251128` |
| `--aspect-ratio` | `1:1` / `2:3` / `3:2` / `3:4` / `4:3` / `4:5` / `5:4` / `9:16` / `16:9` / `21:9` | `1:1` |
| `--size` | `2K` / `4K` | `2K` |
| `--image-input` | asset ID or local path; comma-separated, max 10, shared across all prompts | — |
| `--timeout` | seconds | `300` |
| `--no-wait` | flag — submit and return immediately | off |

Output columns: `taskId`, `status`, `creditCost`, `assetId`, `assetName`, `assetType`, `fileUrl`, `thumbnailUrl`, `width`, `height`, `duration`

---

## zovii generate-video \<projectId\>

Generate an AI video (text-to-video / first-last frame / reference assets).

| Option | Values | Default |
|--------|--------|---------|
| `--prompt` | text | empty |
| `--model` | `doubao-seedance-2-0-260128` / `doubao-seedance-2-0-fast-260128` / `doubao-seedance-2-0-mini-260615` / `doubao-seedance-1-5-pro-251215` / `kling-o3` / `ws-veo-3.1` / `grok-imagine-video-v1.5` | `doubao-seedance-2-0-260128` |
| `--ratio` | `16:9` / `9:16` / `1:1` / `4:3` / `3:4` / `21:9` | `16:9` |
| `--duration` | `8` / `12` | `8` |
| `--resolution` | `480p` / `720p` / `1080p` | `720p` |
| `--image-input` | asset ID or local path (first frame) | — |
| `--end-frame` | asset ID or local path; requires `--image-input` | — |
| `--ref-image` | asset ID or local path; comma-separated for multiple | — |
| `--ref-video` | asset ID or local path | — |
| `--ref-audio` | asset ID or local path; comma-separated for multiple | — |
| `--keep-original-audio` | flag — preserve audio from `--ref-video` | off |
| `--no-audio` | flag — generate video without audio | off |
| `--timeout` | seconds | `600` |
| `--no-wait` | flag — submit and return immediately | off |

Output columns: `taskId`, `status`, `creditCost`, `assetId`, `assetName`, `assetType`, `fileUrl`, `thumbnailUrl`, `width`, `height`, `duration`

---

## zovii remove-background \<projectId\> \<image\>

Remove the background from an image; returns a transparent-background PNG.

`<image>` accepts: asset ID or local file path.

| Option | Default |
|--------|---------|
| `--timeout` | `300` |
| `--no-wait` | off |

Output columns: `taskId`, `status`, `creditCost`, `assetId`, `assetName`, `assetType`, `fileUrl`, `thumbnailUrl`, `width`, `height`, `duration`

---

## zovii upscale-video \<projectId\> \<video\>

Upscale a video to a higher resolution.

`<video>` accepts: asset ID or local file path.

| Option | Values | Default |
|--------|--------|---------|
| `--resolution` | `1080p` / `2k` / `4k` | `1080p` |
| `--duration` | seconds to process; `0` = full video | `0` |
| `--timeout` | seconds | `600` |
| `--no-wait` | flag — submit and return immediately | off |

Output columns: `taskId`, `status`, `creditCost`, `assetId`, `assetName`, `assetType`, `fileUrl`, `thumbnailUrl`, `width`, `height`, `duration`
