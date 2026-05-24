# zovii Command Reference

All 11 commands. Global flag: `-f json` / `-f table` (default `table`).

---

## zovii login \<username\> \<password\>

Authenticate with username and password. Token saved to `~/.config/zovii/auth.json`.

Output columns: `username`, `credits_balance`, `expires_at`

---

## zovii logout

Clear local token.

---

## zovii list-projects

List all projects for the current account.

Output columns: `projectId`, `projectName`, `createdAt`, `updatedAt`

---

## zovii create-project \<name\>

Create a new project. Returns the new project ID.

Output columns: `projectId`, `projectName`, `createdAt`

---

## zovii list-assets \<projectId\>

List assets in a project.

| Option | Values | Default |
|--------|--------|---------|
| `--type` | `image` / `video` / `audio` | all types |
| `--limit` | number | `100` |

Output columns: `assetId`, `assetName`, `assetType`, `fileUrl`, `width`, `height`, `duration`

---

## zovii upload-asset \<projectId\> \<file\>

Upload a local file as a project asset. Max size: **80 MB**.

| Option | Description |
|--------|-------------|
| `--tool-type` | Optional usage tag; affects server-side processing |

Output columns: `assetId`, `assetName`, `assetType`, `fileUrl`

---

## zovii download-asset \<assetId\>

Download an asset file to local disk.

| Option | Default |
|--------|---------|
| `--out <path>` | Current directory, using the asset's original filename |

Output columns: `assetId`, `assetName`, `localPath`, `bytes`

---

## zovii generate-image \<projectId\>

Generate an AI image (text-to-image or image-to-image). `--prompt` is required.

| Option | Values | Default |
|--------|--------|---------|
| `--prompt` | text | **required** |
| `--model` | `ws-nano-banana-2-fast` / `ws-nano-banana-2` / `ws-nano-banana-pro` / `ws-nano-banana-pro-ultra` / `doubao-seedream-4-5-251128` / `doubao-seedream-5-0-260128` / `midjourney-fast` / `ws-gpt-image-2` | `ws-nano-banana-2-fast` |
| `--aspect-ratio` | `1:1` / `2:3` / `3:2` / `3:4` / `4:3` / `4:5` / `5:4` / `9:16` / `16:9` / `21:9` | `1:1` |
| `--size` | `2K` / `4K` | `2K` |
| `--count` | 1–20 | `1` |
| `--image-input` | asset ID or local path; comma-separated for multiple | — |
| `--timeout` | seconds | `300` |
| `--no-wait` | flag — submit and return immediately | off |

Output columns: `taskId`, `status`, `creditCost`, `assetId`, `fileUrl`, `width`, `height`

---

## zovii generate-video \<projectId\>

Generate an AI video (text-to-video / first-last frame / reference assets).

| Option | Values | Default |
|--------|--------|---------|
| `--prompt` | text | empty |
| `--model` | `doubao-seedance-2-0-260128` / `doubao-seedance-2-0-fast-260128` / `doubao-seedance-1-5-pro-251215` / `kling-o3` / `ws-veo-3.1` | `doubao-seedance-2-0-260128` |
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

Output columns: `taskId`, `status`, `creditCost`, `assetId`, `fileUrl`, `duration`

---

## zovii remove-background \<projectId\> \<image\>

Remove the background from an image; returns a transparent-background PNG.

`<image>` accepts: asset ID or local file path.

| Option | Default |
|--------|---------|
| `--timeout` | `300` |
| `--no-wait` | off |

Output columns: `taskId`, `status`, `creditCost`, `assetId`, `fileUrl`

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

Output columns: `taskId`, `status`, `creditCost`, `assetId`, `fileUrl`
