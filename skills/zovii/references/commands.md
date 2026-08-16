# zovii Command Reference

All 19 commands. Global flag: `-f json` / `-f table` (default `table`).

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

## zovii list-models [tool]

列出产品当前可用的工具与模型。模型清单、可选参数和默认值都由 zovii.studio 的产品配置动态下发（本地缓存 1 小时），所以生图/生视频命令不再内置任何模型白名单。

> 注意：生图默认分辨率随产品默认走（当前默认模型 `ws-nano-banana-pro` 为 `1k`），旧版本 CLI 固定发 2K。需要 2K 时显式传 `--size 2k`。

```bash
zovii list-models                 # 所有工具：toolId / name / models / default
zovii list-models ai_image        # 该工具下每个模型一行
zovii list-models ai_video --refresh   # 强制刷新缓存
```

| Option | Values | Default |
|--------|--------|---------|
| `--refresh` | flag — bypass the local cache and refetch | off |

Output columns (no argument): `toolId`, `name`, `models`, `default`
Output columns (with tool): `modelId`, `name`, `default`, `minCost`, `options`

`options` 是紧凑摘要，`*` 标注默认值，选项过多时折叠成 `首个…末个(N 项，默认 X)`。

---

## zovii generate-image \<projectId\>

Generate an AI image (text-to-image or image-to-image). `--prompt` is required.

| Option | Values | Default |
|--------|--------|---------|
| `--prompt` | text | **required** |
| `--model` | Determined by the product config — run `zovii list-models ai_image` | product default model |
| `--aspect-ratio` | Determined by the product config — run `zovii list-models ai_image` | model default (`ws-gpt-image-2` with reference images and no explicit value: `auto`) |
| `--size` | Determined by the product config — run `zovii list-models ai_image` | model default |
| `--quality` | Only for models that expose it (e.g. `ws-gpt-image-2`: `low` / `medium` / `high`) | model default |
| `--count` | 1–20 | `1` |
| `--image-input` | asset ID or local path; comma-separated for multiple (max count per the model schema) | — |
| `--timeout` | seconds | `300` |
| `--no-wait` | flag — submit and return immediately | off |

Output columns: `taskId`, `status`, `creditCost`, `assetId`, `assetName`, `assetType`, `fileUrl`, `thumbnailUrl`, `width`, `height`, `duration`

---

## zovii batch-generate-image \<projectId\>

Batch text-to-image: submit multiple different prompts in one call; each prompt generates one image (matches the web "Batch Image Generation" tool). `--prompt` is repeatable.

| Option | Values | Default |
|--------|--------|---------|
| `--prompt` | text, repeatable (1–20 prompts) | **required** |
| `--model` | Determined by the product config — run `zovii list-models ai_image` | product default model |
| `--aspect-ratio` | Determined by the product config — run `zovii list-models ai_image` | model default (`ws-gpt-image-2` with reference images and no explicit value: `auto`) |
| `--size` | Determined by the product config — run `zovii list-models ai_image` | model default |
| `--image-input` | asset ID or local path; comma-separated, shared across all prompts (max count per the model schema) | — |
| `--timeout` | seconds | `300` |
| `--no-wait` | flag — submit and return immediately | off |

Output columns: `taskId`, `status`, `creditCost`, `assetId`, `assetName`, `assetType`, `fileUrl`, `thumbnailUrl`, `width`, `height`, `duration`

---

## zovii generate-video \<projectId\>

Generate an AI video (text-to-video / first-last frame / reference assets).

| Option | Values | Default |
|--------|--------|---------|
| `--prompt` | text | empty |
| `--model` | Determined by the product config — run `zovii list-models ai_video` | product default model |
| `--ratio` | Determined by the product config — run `zovii list-models ai_video` | model default |
| `--duration` | Determined by the product config — run `zovii list-models ai_video` | model default |
| `--resolution` | Determined by the product config — run `zovii list-models ai_video` | model default |
| `--image-input` | asset ID or local path (first frame) | — |
| `--end-frame` | asset ID or local path; requires `--image-input` | — |
| `--ref-image` | asset ID or local path; comma-separated for multiple | — |
| `--ref-video` | asset ID or local path | — |
| `--ref-audio` | asset ID or local path; comma-separated for multiple | — |
| `--keep-original-audio` | flag — preserve audio from `--ref-video`. 仅部分模型支持，不支持时报错（运行 `zovii list-models ai_video` 确认） | off |
| `--no-audio` | flag — generate video without audio. 仅部分模型支持，不支持时报错（运行 `zovii list-models ai_video` 确认） | off |
| `--timeout` | seconds | `600` |
| `--no-wait` | flag — submit and return immediately | off |

Output columns: `taskId`, `status`, `creditCost`, `assetId`, `assetName`, `assetType`, `fileUrl`, `thumbnailUrl`, `width`, `height`, `duration`

---

## zovii list-groups \<projectId\>

列出项目的画布分组（id / 名字 / 自动整理状态 / 成员数）。

Output columns: `groupId`, `name`, `autoOrganize`, `memberCount`, `color`

---

## zovii create-group \<projectId\> \<name\>

新建画布分组，可选带成员资产 / 直接开自动整理。

| Option | Values | Default |
|--------|--------|---------|
| `--assets` | 逗号分隔的 asset id（UUID），作为初始成员 | — |
| `--auto-organize` | flag — 创建时即开启自动整理（layoutMode=tiled） | off |
| `--color` | `blue` / `green` / `orange` / `purple` / `red` / `yellow` / `cyan` / `gray` | — |

Output columns: `groupId`, `name`, `autoOrganize`, `memberCount`, `color`

---

## zovii add-to-group \<projectId\> \<groupId\>

给已有画布分组追加成员资产。

| Option | Description |
|--------|-------------|
| `--assets` | 逗号分隔的 asset id（UUID），**必填**，至少一个 |

Output columns: `groupId`, `name`, `autoOrganize`, `memberCount`, `color`

---

## zovii rename-group \<projectId\> \<groupId\> \<newName\>

重命名画布分组。

Output columns: `groupId`, `name`, `autoOrganize`, `memberCount`, `color`

---

## zovii set-auto-organize \<projectId\> \<groupId\> \<state\>

开/关画布分组的自动整理。`state` 只接受 `on` / `off`。

Output columns: `groupId`, `name`, `autoOrganize`, `memberCount`, `color`

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
