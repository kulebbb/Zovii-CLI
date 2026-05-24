# zovii Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `skills/zovii/SKILL.md` conforming to the skills.sh standard and publish it so any developer can install it with `npx skills add zovii`.

**Architecture:** Two-file layout — `SKILL.md` holds frontmatter + setup + agent rules + workflows (≤500 lines); detailed per-command option tables live in `references/commands.md` to keep the main file lean and enable progressive loading.

**Tech Stack:** Markdown, YAML frontmatter (skills.sh spec), skills.sh web publish UI.

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `skills/zovii/SKILL.md` | Main skill: frontmatter, setup, agent rules, workflows |
| Create | `skills/zovii/references/commands.md` | Full command reference (11 commands, all options/values) |

---

### Task 1: Write `skills/zovii/SKILL.md`

**Files:**
- Create: `skills/zovii/SKILL.md`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p skills/zovii
```

- [ ] **Step 2: Write `skills/zovii/SKILL.md`**

```markdown
---
name: zovii
description: Use when the user wants to generate AI images or videos, manage assets, or work with Zovii Studio projects from the command line. Triggers on: "zovii", "generate image", "generate video", "AI image", "AI video", "upload asset", "download asset", "remove background", "upscale video".
---

# zovii CLI

AI image & video generation from the command line via [Zovii Studio](https://zovii.studio).

## When to Load This Skill

Load this skill when the user mentions:
- "zovii", "generate image", "generate video", "AI image/video generation"
- "upload asset", "download asset", "project assets"
- "remove background", "upscale video", "upscale"

Full command reference: [references/commands.md](references/commands.md)

---

## Layer 1 — Setup

Run these two checks before every zovii command.

### 1.1 Install Check

```bash
which zovii
```

- ✅ Found → continue
- ❌ Not found → run `npm install -g zovii`, wait for it to finish, then continue

### 1.2 Login Check

```bash
cat ~/.config/zovii/auth.json
```

- ✅ File exists and contains `access_token` → continue
- ❌ Missing or empty → tell the user login is required, ask for username and password, then run:

```bash
zovii login <username> <password>
```

---

## Layer 2 — Agent Decision Rules

These rules apply to every command:

- **No project ID?** Run `zovii list-projects` first and ask the user to pick one.
- **Local file path as input?** Pass it directly — the CLI auto-uploads it. No need to call `upload-asset` manually.
- **Waiting for results?** Default: wait (omit `--no-wait`). Only go async when the user explicitly requests it.
- **Output format?** Default: `table`. Add `-f json` when the output will be consumed programmatically.
- **Timeouts?** Image tasks default to 300 s; video tasks default to 600 s. Use `--timeout <seconds>` for long-running jobs.

---

## Layer 3 — Workflows

### Workflow 1: Generate Image

```
1. Confirm project → if unknown, run: zovii list-projects, let user pick
2. Collect: --prompt (required)
3. Ask (optional): model, aspect ratio, count, reference image
4. Run: zovii generate-image <projectId> --prompt "..." [options]
5. Wait → display fileUrl
6. Ask if user wants to download → yes: zovii download-asset <assetId>
```

### Workflow 2: Generate Video

Choose the variant that matches what the user described:

**Variant A — Text to video** (user provides only a prompt)
```
1. Confirm project
2. Collect: --prompt, --ratio, --duration, --model
3. Run: zovii generate-video <projectId> --prompt "..."
4. Wait → display fileUrl → ask if user wants to download
```

**Variant B — First / last frame** (user provides image(s))
```
1. Confirm project
2. Collect first frame (--image-input); ask if there is an end frame (--end-frame)
3. Collect: --prompt (optional), --ratio, --duration
4. Run: zovii generate-video <projectId> --image-input <ref> [--end-frame <ref>]
5. Wait → display fileUrl → ask if user wants to download
```

**Variant C — Reference assets** (user provides reference image / video / audio)
```
1. Confirm project
2. Identify reference type → image (--ref-image) / video (--ref-video) / audio (--ref-audio)
3. Ask if a prompt is needed for additional description
4. Run: zovii generate-video <projectId> --ref-* <ref> [--prompt "..."]
5. Wait → display fileUrl → ask if user wants to download
```

### Workflow 3: Asset Management

```
List assets:    zovii list-assets <projectId> [--type image|video|audio] [--limit n]
Upload asset:   zovii upload-asset <projectId> <local-path>
Download asset: zovii download-asset <assetId> [--out <save-path>]
```

Agent notes:
- "Upload file X" → run `upload-asset` directly, no need to list first.
- "Download the image I just generated" → extract `assetId` from previous output, run `download-asset` directly.

### Workflow 4: Image / Video Processing

**Remove background**
```
1. Confirm project
2. User provides image (local path or asset ID)
3. Run: zovii remove-background <projectId> <image>
4. Wait → display transparent-background fileUrl → ask if user wants to download
```

**Upscale video**
```
1. Confirm project
2. User provides video (local path or asset ID)
3. Ask target resolution: 1080p / 2k / 4k
4. Run: zovii upscale-video <projectId> <video> --resolution <res>
5. Wait → display fileUrl → ask if user wants to download
```
```

- [ ] **Step 3: Verify line count is under 500**

```bash
wc -l skills/zovii/SKILL.md
```

Expected: output shows a number ≤ 500.

- [ ] **Step 4: Commit**

```bash
git add skills/zovii/SKILL.md
git commit -m "feat: 新增 skills/zovii/SKILL.md 主文件"
```

---

### Task 2: Write `skills/zovii/references/commands.md`

**Files:**
- Create: `skills/zovii/references/commands.md`

- [ ] **Step 1: Create the references directory**

```bash
mkdir -p skills/zovii/references
```

- [ ] **Step 2: Write `skills/zovii/references/commands.md`**

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add skills/zovii/references/commands.md
git commit -m "feat: 新增 skills/zovii/references/commands.md 完整命令参考"
```

---

### Task 3: Publish to skills.sh

**Files:** No code changes — this is a manual publish step.

- [ ] **Step 1: Verify the skill structure looks correct**

```bash
find skills/zovii -type f
```

Expected output:
```
skills/zovii/SKILL.md
skills/zovii/references/commands.md
```

- [ ] **Step 2: Tell the user to publish via skills.sh**

There is no CLI for skills.sh publishing. Walk the user through the web UI:

1. Go to **https://www.skills.sh** and sign in (or create an account)
2. Click **"Publish a skill"** (or the equivalent upload button)
3. Upload the contents of `skills/zovii/` — either by pointing to this repo or pasting the file contents
4. Confirm the skill name is `zovii` and the description matches the frontmatter

- [ ] **Step 3: Verify installation after publish**

Once published, test that it installs:

```bash
npx skills add zovii
```

Expected: skill installed without errors.

- [ ] **Step 4: Final commit (tag the release)**

```bash
git add skills/
git commit -m "feat: 发布 zovii skill 到 skills.sh v1.0.0"
```
