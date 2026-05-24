# zovii CLI — Install & Setup Runbook (for AI Agents)

You are helping a user install and start using the [zovii](https://www.npmjs.com/package/zovii) CLI. Follow these steps in order. Do not skip steps. Report progress to the user after each step so they know what's happening.

---

## Step 1 — Check Node.js

Run:
```bash
node --version
```

- **≥ v18.0.0** → continue to Step 2
- **< v18 or `command not found`** → stop and tell the user:
  > "zovii requires Node.js 18 or newer. Please install Node 18+ (recommended: use [nvm](https://github.com/nvm-sh/nvm) and run `nvm install 20`), then re-send your request."

---

## Step 2 — Install the CLI

Run:
```bash
npm install -g zovii
```

If you get `EACCES` permission denied:
- macOS/Linux without nvm: suggest `sudo npm install -g zovii`
- Better long-term fix: install Node via nvm so global npm packages don't need sudo

Verify the install:
```bash
which zovii && zovii --version
```
Expect output like `/usr/local/bin/zovii` and a version number (e.g. `0.1.2`). If verification fails, debug before continuing — do not proceed with broken install.

---

## Step 3 — Install the Zovii Skill

Run:
```bash
npx --yes skills add kulebbb/Zovii-CLI -g -y
```

This installs the [zovii skill](https://github.com/kulebbb/Zovii-CLI/tree/main/skills/zovii) into `~/.agents/skills/zovii/`, where most agents (Claude Code, Cursor, Codex, Warp, etc.) will auto-discover it.

After this step you do **not** need to memorize the CLI surface — the skill ships a full command reference at `skills/zovii/references/commands.md` that you can read on demand.

---

## Step 4 — Check Login Status

Run:
```bash
test -s ~/.config/zovii/auth.json && grep -q access_token ~/.config/zovii/auth.json && echo LOGGED_IN || echo NOT_LOGGED_IN
```

- **`LOGGED_IN`** → continue to Step 5
- **`NOT_LOGGED_IN`** → ask the user:
  > "I need to log into your Zovii Studio account. Please reply with your username and password in the format `username password` (separated by a space). If you don't have an account yet, sign up at https://zovii.studio first."

  When the user replies, run:
  ```bash
  zovii login <username> <password>
  ```
  Expect output showing `username`, `credits_balance`, and `expires_at`. If login fails (`401`/`403`), tell the user the credentials were rejected and ask them to retry or sign up.

---

## Step 5 — Verify Everything Works

Run:
```bash
zovii list-projects
```

You should see a table of the user's projects (or an empty result if they have none). If this command fails, fall back to Step 4.

---

## Step 6 — Tell the User What's Available

Send the user this exact message:

> ✅ **zovii CLI is installed and ready.** You can now ask me to do things like:
>
> - "Generate an image of a corgi astronaut, cinematic"
> - "Make an 8-second video of cherry blossoms falling, slow pan"
> - "List my projects" / "Create a project called X"
> - "Remove the background from `./photo.jpg`"
> - "Upload `./clip.mp4` to project X"
> - "Upscale this video to 4K"
>
> Local files (paths) work directly — I'll upload them for you. Just say what you want.

Then stop and wait for the user's next request. From this point on, follow the workflows in the installed `zovii` skill for any zovii-related task.

---

## Troubleshooting Reference

| Symptom | Cause | Fix |
|---|---|---|
| `command not found: node` | Node.js not installed | Step 1 |
| `command not found: zovii` after Step 2 | npm global bin not in PATH | Reload shell or check `npm config get prefix` |
| `command not found: npx` | Node < 5.2 or broken install | Reinstall Node 18+ |
| `EACCES` during `npm install -g` | Permission on system npm prefix | `sudo` or switch to nvm |
| `登录态已失效` / `Authentication required` | Token expired or invalid | Re-run `zovii login` (Step 4) |
| `积分不足` / `Insufficient credits` | Out of credits | Direct user to https://zovii.studio/pricing |
| `请求过于频繁` / `Too many requests` | Rate limited | Wait 60s and retry |
| Skill not auto-discovered by agent | Agent doesn't read `~/.agents/skills/` | Restart the agent / check agent docs |

---

**Repo:** https://github.com/kulebbb/Zovii-CLI · **npm:** https://www.npmjs.com/package/zovii · **Studio:** https://zovii.studio
