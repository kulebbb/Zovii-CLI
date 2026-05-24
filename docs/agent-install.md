# zovii CLI — 安装与配置运行手册（给 AI Agent 看的）

你正在帮用户安装并使用 [zovii](https://www.npmjs.com/package/zovii) CLI。请按顺序执行下面的步骤，不要跳过。每一步完成后向用户简短汇报进度，让 ta 知道你在做什么。

---

## 步骤 1 — 检查 Node.js

执行：
```bash
node --version
```

- **≥ v18.0.0** → 进入步骤 2
- **< v18 或 `command not found`** → 停下并告诉用户：
  > "zovii 需要 Node.js 18 或更高版本。请先安装 Node 18+（推荐用 [nvm](https://github.com/nvm-sh/nvm) 跑 `nvm install 20`），装好后重新发送请求。"

---

## 步骤 2 — 安装 CLI

执行：
```bash
npm install -g zovii
```

如果遇到 `EACCES` 权限错误：
- macOS/Linux 没装 nvm：建议 `sudo npm install -g zovii`
- 长期来看：用 nvm 装 Node，避免全局 npm 包要 sudo

验证安装：
```bash
which zovii && zovii --version
```
应该输出类似 `/usr/local/bin/zovii` 和一个版本号（如 `0.1.3`）。如果验证失败，先排查再继续——不要带着坏环境往后走。

---

## 步骤 3 — 安装 zovii skill

执行：
```bash
npx --yes skills add kulebbb/Zovii-CLI -g -y
```

这会把 [zovii skill](https://github.com/kulebbb/Zovii-CLI/tree/main/skills/zovii) 装到 `~/.agents/skills/zovii/`，大多数 agent（Claude Code、Cursor、Codex、Warp 等）会自动发现它。

装完之后你不需要把 CLI 全部记下来——skill 里有完整命令参考（`skills/zovii/references/commands.md`），按需阅读即可。

---

## 步骤 4 — 检查登录状态

执行：
```bash
test -s ~/.config/zovii/auth.json && grep -q access_token ~/.config/zovii/auth.json && echo LOGGED_IN || echo NOT_LOGGED_IN
```

- **`LOGGED_IN`** → 进入步骤 5
- **`NOT_LOGGED_IN`** → 登录 zovii：

  1. 询问用户的手机号（中国大陆 11 位，如 13800000000）。
  2. 用户告知后，执行 `zovii send-code <手机号>`（或直接进入第 3 步让 CLI 自动发码）。
  3. 询问用户从短信收到的 6 位验证码。
  4. 执行 `zovii login <手机号> --code <验证码>`。
  5. 若用户更习惯账密登录，执行 `zovii login -u <用户名> -p <密码>`。

  应该输出 `username`、`credits_balance`、`expires_at`。如果登录失败（`401`/`403`），告诉用户凭据不对，让 ta 重试或注册。

---

## 步骤 5 — 验证整体可用

执行：
```bash
zovii list-projects
```

应该看到用户的项目表格（没项目就是空）。如果命令报错，回到步骤 4 检查登录。

---

## 步骤 6 — 告诉用户能用了

把下面这段话原样发给用户：

> ✅ **zovii CLI 已装好，可以用了。** 现在你可以让我做这些事：
>
> - "生成一只柯基宇航员的图，电影质感"
> - "做一个 8 秒视频：桃花飘落，慢镜头平移"
> - "列出我的项目" / "新建一个叫 X 的项目"
> - "把 `./photo.jpg` 去掉背景"
> - "把 `./clip.mp4` 上传到项目 X"
> - "把这个视频放大到 4K"
>
> 本地文件路径直接传就行——我会帮你上传。说人话即可。

然后停下来等用户的下一步请求。从此以后，所有 zovii 相关的任务都按已装好的 `zovii` skill 里的 workflow 走。

---

## 故障速查

| 现象 | 原因 | 处理 |
|---|---|---|
| `command not found: node` | 没装 Node.js | 步骤 1 |
| 步骤 2 完成后 `command not found: zovii` | npm 全局 bin 不在 PATH | 重新 source 一下 shell 或检查 `npm config get prefix` |
| `command not found: npx` | Node < 5.2 或环境坏了 | 重装 Node 18+ |
| `npm install -g` 报 `EACCES` | 系统 npm prefix 没权限 | 用 `sudo` 或换成 nvm |
| `登录态已失效` / `Authentication required` | token 过期或失效 | 重跑 `zovii login`（步骤 4） |
| `积分不足` / `Insufficient credits` | 积分用完 | 引导用户去 https://zovii.studio/pricing |
| `请求过于频繁` / `Too many requests` | 触发限流 | 等 60 秒再试 |
| Skill 没被 agent 自动识别 | agent 没扫 `~/.agents/skills/` | 重启 agent / 查 agent 文档 |

---

**仓库：** https://github.com/kulebbb/Zovii-CLI · **npm：** https://www.npmjs.com/package/zovii · **Studio：** https://zovii.studio
