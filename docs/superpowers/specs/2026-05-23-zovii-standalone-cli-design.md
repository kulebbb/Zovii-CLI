# zovii 独立 CLI 设计文档

- 日期：2026-05-23
- 范围：将 zovii opencli 适配器重构为完全独立的 npm CLI 包
- 状态：已与用户确认，待转实现计划

## 1. 目标

将现有 `~/.opencli/clis/zovii/` 适配器重构为独立 CLI 包，发布到 npm，包名 `zovii`，命令入口 `zovii`。

- 完全脱离 `@jackwener/opencli` 框架
- 无浏览器依赖（去掉 `browser: true` / `Strategy.COOKIE`）
- 账密登录，token 本地持久化，自动刷新
- `npm install -g zovii` 后即可使用

## 2. 项目位置

在 `/Users/zhaoliang/Documents/coding/opencli/` 目录内构建（即当前工作区），原 opencli 适配器保留不动。

## 3. 项目结构

```
/Users/zhaoliang/Documents/coding/opencli/
├── package.json
├── bin/
│   └── zovii.js                  ← CLI 入口，commander 注册所有命令
├── src/
│   ├── errors.js                 ← 自定义错误类
│   ├── output.js                 ← 表格/JSON 输出
│   ├── token.js                  ← 认证核心
│   ├── utils.js                  ← API 工具函数
│   ├── helpers.js                ← 纯函数（UUID/路径/MIME）
│   └── commands/
│       ├── login.js
│       ├── logout.js
│       ├── create-project.js
│       ├── generate-image.js
│       ├── generate-video.js
│       ├── upload-asset.js
│       ├── download-asset.js
│       ├── list-assets.js
│       ├── remove-background.js
│       └── upscale-video.js
├── test/
│   └── helpers.test.js           ← 从原适配器迁移
├── README.md
└── .npmignore
```

## 4. package.json

```json
{
  "name": "zovii",
  "version": "0.1.0",
  "type": "module",
  "description": "Zovii Studio CLI — AI image & video generation from the command line",
  "bin": { "zovii": "./bin/zovii.js" },
  "files": ["bin/", "src/"],
  "dependencies": { "commander": "^12" },
  "engines": { "node": ">=18" }
}
```

依赖只有 `commander`。Node 18+ 内置 `fetch` 和 `FormData`，无需额外依赖。

## 5. 认证方案

### 5.1 登录接口

`POST https://zovii.studio/api/v1/auth/login`（OAuth2 表单）
- 入参：`username`（用户名或手机号）、`password`
- 出参：`{access_token, refresh_token, user: {username, credits_balance, ...}}`

### 5.2 token 本地存储

路径：`~/.config/zovii/auth.json`

```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_at": 1748000000
}
```

`expires_at` 从 JWT payload 的 `exp` 字段解析（base64url decode，无第三方依赖）。

### 5.3 自动刷新

`getToken()` 逻辑：

1. 读 `auth.json`，不存在 → 抛 `AuthRequiredError`
2. `expires_at - now < 300s` → 调 `POST /api/v1/auth/refresh`，更新 `access_token` + `expires_at`
3. refresh 失败（401）→ 清除 `auth.json`，抛 `AuthRequiredError` 提示重新登录
4. 返回有效 `access_token`

### 5.4 token.js 导出函数

| 函数 | 说明 |
|---|---|
| `getToken()` | 主入口，自动刷新，返回 access_token |
| `loginWithPassword(username, password)` | POST /auth/login，保存 auth.json |
| `refreshAccessToken(refresh_token)` | POST /auth/refresh，更新 access_token |
| `clearAuth()` | 删除 auth.json |
| `parseJwtExp(token)` | base64url decode JWT payload 取 exp |

## 6. API 层（utils.js）

### 6.1 核心 HTTP 函数

```js
async function apiFetch(path, { method = 'GET', token, body } = {})
```

直接使用 Node.js 内置 `fetch`，无浏览器上下文。非 2xx 状态码通过 `throwHttpError` 映射为类型化错误。

### 6.2 导出函数（去掉原有 `page` 参数）

| 函数 | 说明 |
|---|---|
| `createTask(token, payload)` | POST /tasks |
| `pollTask(token, taskId, {timeoutSec, label})` | 轮询任务直到完成/失败 |
| `resolveAssets(token, assetIds)` | 批量 GET /assets/{id} |
| `getAsset(token, assetId)` | GET /assets/{id} |
| `listAssets(token, projectId, {type, limit})` | 分页拉取项目素材 |
| `uploadAsset(token, projectId, filePath, toolType)` | Node FormData 上传 |
| `resolveAssetRef(token, projectId, ref, toolType)` | 本地路径自动上传换 id |
| `resolveAssetRefs(token, projectId, refsCsv, toolType)` | 逗号分隔批量版 |
| `downloadAsset(asset, outPath)` | 直接 fetch file_url 写盘 |
| `createProject(token, name)` | POST /projects |
| `toRows(task, assets)` | task + assets 拍平为输出行 |
| `assetRow(asset)` | 单个 asset 拍平 |

### 6.3 uploadAsset 改造

原实现通过 `page.evaluate` 在浏览器内完成 base64 → FormData 上传，改为 Node.js 原生：

```js
const formData = new FormData();
formData.append('file',
  new Blob([await readFile(filePath)], { type: guessMimeType(filePath) }),
  basename(filePath)
);
const resp = await fetch(url, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: formData,
});
```

## 7. 错误处理（errors.js）

```js
export class AuthRequiredError extends Error { ... }  // 未登录
export class ArgumentError extends Error { ... }       // 参数错误
export class CommandError extends Error { ... }        // 执行失败
export class TimeoutError extends Error { ... }        // 任务超时
```

所有命令统一调用 `handleError(err)` 打印错误信息并以非零退出码退出。

## 8. 输出格式（output.js）

全局 `-f, --format <fmt>` 选项，支持 `table`（默认）和 `json`：

```bash
zovii list-assets <pid>                   # 表格输出
zovii list-assets <pid> --format json     # JSON 输出
zovii list-assets <pid> -f json           # 简写
```

table 实现为纯字符串拼接（无依赖），超长值截断到 60 字符，null 值显示为空。

## 9. 命令注册模式

每个命令文件 export `register(program)` 函数，`bin/zovii.js` 统一挂载：

```js
#!/usr/bin/env node
import { Command } from 'commander';
import { register as login } from '../src/commands/login.js';
// ...

const program = new Command('zovii')
  .version('0.1.0')
  .option('-f, --format <fmt>', '输出格式：table / json', 'table');

[login, logout, createProject, generateImage, generateVideo,
 uploadAsset, downloadAsset, listAssets, removeBackground, upscaleVideo]
  .forEach(r => r(program));

program.parse();
```

## 10. 命令列表

| 命令 | 说明 |
|---|---|
| `zovii login <username> <password>` | 账密登录，保存 token |
| `zovii logout` | 清除本地 token |
| `zovii create-project <name>` | 新建项目 |
| `zovii generate-image <project> --prompt <text>` | AI 文生图 / 图生图 |
| `zovii generate-video <project> --prompt <text>` | AI 生视频（支持首尾帧/参考素材） |
| `zovii upload-asset <project> <file>` | 上传本地文件为 asset |
| `zovii download-asset <project> <asset>` | 下载 asset 到本地 |
| `zovii list-assets <project>` | 列出项目素材 |
| `zovii remove-background <project> <image>` | 图片去背景 |
| `zovii upscale-video <project> <video>` | 视频高清放大 |

## 11. 不在本次范围（YAGNI）

- 交互式密码输入（readline）
- Token 加密存储（Keychain）
- 命令自动补全
- 配置文件（自定义 API base URL 等）
- 批量操作命令
