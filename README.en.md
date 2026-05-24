# zovii — Zovii Studio CLI

[![npm version](https://img.shields.io/npm/v/zovii.svg)](https://www.npmjs.com/package/zovii)
[![node](https://img.shields.io/node/v/zovii.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/zovii.svg)](LICENSE)

AI image & video generation from the command line, powered by [Zovii Studio](https://zovii.studio).

**[中文文档](README.md)**

---

## 🤖 Install via Your AI Agent (Recommended)

Copy this line and paste it to your AI agent (Claude Code, Cursor, Codex, Warp, etc.):

```
Install zovii CLI for me by following this runbook: https://raw.githubusercontent.com/kulebbb/Zovii-CLI/main/docs/agent-install.en.md
```

The agent will fetch the runbook, install the CLI, install the agent skill, walk you through login, and confirm everything works. You don't need to type any other commands.

After that, just talk to your agent in plain language — "generate an image of a corgi astronaut", "list my projects", "remove the background from `./photo.jpg`", etc.

---

## Manual Installation

```bash
npm install -g zovii
```

Requires **Node.js ≥ 18**. No browser dependency.

## Quick Start

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

## Commands

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

## Local Files as Input

Any command that accepts an asset (`--image-input`, `--ref-video`, `<image>`, `<video>`, …) also accepts a local file path. The CLI uploads it automatically — no need to call `upload-asset` first.

```bash
zovii remove-background <projectId> ./my-photo.jpg
zovii generate-video <projectId> --image-input ./first-frame.png --prompt "zoom out"
```

## Output Format

Default output is a table. Add `-f json` for machine-readable output:

```bash
zovii list-projects -f json
zovii generate-image <projectId> --prompt "..." -f json
```

## Authentication

Tokens are stored at `~/.config/zovii/auth.json` (mode `0600`) and refreshed automatically when within 5 minutes of expiry. No need to log in again until your refresh token expires.

## Agent Skill

The CLI ships with a [SKILL.md](skills/zovii/SKILL.md) following the [skills.sh](https://www.skills.sh) standard. The agent-install flow above sets this up automatically. To install the skill on its own (assuming the CLI is already installed):

```bash
npx skills add kulebbb/Zovii-CLI
```

## Links

- npm: https://www.npmjs.com/package/zovii
- Zovii Studio: https://zovii.studio
- Pricing: https://zovii.studio/pricing

## License

MIT
