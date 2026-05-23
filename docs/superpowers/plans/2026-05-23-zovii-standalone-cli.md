# zovii 独立 CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 zovii opencli 适配器重构为完全独立的 npm CLI 包（包名 `zovii`，命令 `zovii`），无浏览器依赖，账密登录，token 自动刷新。

**Architecture:** 项目根目录为 `/Users/zhaoliang/Documents/coding/opencli/`。认证层 `src/token.js` 管理 `~/.config/zovii/auth.json`；API 层 `src/utils.js` 用 Node 内置 `fetch` 直接调 zovii.studio API；10 个命令各自 `src/commands/*.js` 导出 `register(program)` 函数，由 `bin/zovii.js` 用 commander 统一挂载。

**Tech Stack:** Node.js >=18 ESM，commander ^12，node:test（单测）。Node 18+ 内置 fetch / FormData，无额外网络依赖。

---

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `package.json` | 新建 | 包元数据、bin 入口、依赖 |
| `bin/zovii.js` | 新建 | CLI 入口，commander 注册所有命令 |
| `src/errors.js` | 新建 | 自定义错误类 |
| `src/helpers.js` | 新建 | 纯函数：UUID/路径/MIME 判定（从适配器迁移） |
| `src/output.js` | 新建 | 表格/JSON 输出 + handleError |
| `src/token.js` | 新建 | 认证核心：login/logout/getToken/refresh |
| `src/utils.js` | 新建 | API 工具：apiFetch + 所有业务函数 |
| `src/commands/login.js` | 新建 | login 命令 |
| `src/commands/logout.js` | 新建 | logout 命令 |
| `src/commands/create-project.js` | 新建 | create-project 命令 |
| `src/commands/generate-image.js` | 新建 | generate-image 命令 |
| `src/commands/generate-video.js` | 新建 | generate-video 命令 |
| `src/commands/upload-asset.js` | 新建 | upload-asset 命令 |
| `src/commands/download-asset.js` | 新建 | download-asset 命令 |
| `src/commands/list-assets.js` | 新建 | list-assets 命令 |
| `src/commands/remove-background.js` | 新建 | remove-background 命令 |
| `src/commands/upscale-video.js` | 新建 | upscale-video 命令 |
| `test/errors.test.js` | 新建 | errors.js 单测 |
| `test/helpers.test.js` | 新建 | helpers.js 单测（从适配器迁移） |
| `test/output.test.js` | 新建 | output.js 单测 |
| `test/token.test.js` | 新建 | token.js parseJwtExp 单测 |
| `README.md` | 新建 | 安装 + 使用说明 |
| `.npmignore` | 新建 | 排除 test/ docs/ 等 |

---

## Task 1: 项目脚手架

**Files:**
- Create: `package.json`
- Create: `bin/zovii.js`（骨架）
- Create: 目录结构

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p /Users/zhaoliang/Documents/coding/opencli/bin \
         /Users/zhaoliang/Documents/coding/opencli/src/commands \
         /Users/zhaoliang/Documents/coding/opencli/test
```

Expected: 命令无报错

- [ ] **Step 2: 写 package.json**

写入 `/Users/zhaoliang/Documents/coding/opencli/package.json`：

```json
{
  "name": "zovii",
  "version": "0.1.0",
  "type": "module",
  "description": "Zovii Studio CLI — AI image & video generation from the command line",
  "bin": { "zovii": "./bin/zovii.js" },
  "files": ["bin/", "src/"],
  "dependencies": {
    "commander": "^12"
  },
  "engines": { "node": ">=18" },
  "license": "MIT"
}
```

- [ ] **Step 3: 安装依赖**

```bash
cd /Users/zhaoliang/Documents/coding/opencli && npm install
```

Expected: `node_modules/` 创建，`package-lock.json` 生成，无 warning。

- [ ] **Step 4: 写 bin/zovii.js 骨架**

写入 `/Users/zhaoliang/Documents/coding/opencli/bin/zovii.js`：

```js
#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('zovii')
  .description('Zovii Studio CLI — AI image & video generation from the command line')
  .version('0.1.0')
  .option('-f, --format <fmt>', '输出格式：table / json', 'table');

program.parse();
```

- [ ] **Step 5: 验证入口可运行**

```bash
node /Users/zhaoliang/Documents/coding/opencli/bin/zovii.js --help
```

Expected: 输出 `Usage: zovii [options]`，含 `--format` 和 `--version` 选项。

- [ ] **Step 6: 提交**

```bash
cd /Users/zhaoliang/Documents/coding/opencli
git add package.json package-lock.json bin/zovii.js
git commit -m "chore: 项目脚手架，commander 入口骨架"
```

---

## Task 2: src/errors.js（TDD）

**Files:**
- Create: `src/errors.js`
- Test: `test/errors.test.js`

- [ ] **Step 1: 写失败测试**

写入 `/Users/zhaoliang/Documents/coding/opencli/test/errors.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AuthRequiredError,
  ArgumentError,
  CommandError,
  TimeoutError,
} from '../src/errors.js';

test('AuthRequiredError 有默认提示语（含 zovii login）', () => {
  const err = new AuthRequiredError();
  assert.equal(err.name, 'AuthRequiredError');
  assert.match(err.message, /zovii login/);
  assert.ok(err instanceof Error);
});

test('AuthRequiredError 接受自定义消息', () => {
  const err = new AuthRequiredError('custom');
  assert.equal(err.message, 'custom');
});

test('ArgumentError 记录消息和 name', () => {
  const err = new ArgumentError('bad arg');
  assert.equal(err.name, 'ArgumentError');
  assert.equal(err.message, 'bad arg');
  assert.ok(err instanceof Error);
});

test('CommandError 记录消息和 name', () => {
  const err = new CommandError('failed');
  assert.equal(err.name, 'CommandError');
  assert.equal(err.message, 'failed');
});

test('TimeoutError 消息含 label 和秒数', () => {
  const err = new TimeoutError('生图', 300);
  assert.equal(err.name, 'TimeoutError');
  assert.match(err.message, /生图/);
  assert.match(err.message, /300/);
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
node --test /Users/zhaoliang/Documents/coding/opencli/test/errors.test.js
```

Expected: FAIL — 报无法解析 `../src/errors.js`

- [ ] **Step 3: 写 src/errors.js 实现**

写入 `/Users/zhaoliang/Documents/coding/opencli/src/errors.js`：

```js
export class AuthRequiredError extends Error {
  constructor(msg = '未登录，请先运行: zovii login <username> <password>') {
    super(msg);
    this.name = 'AuthRequiredError';
  }
}

export class ArgumentError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'ArgumentError';
  }
}

export class CommandError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'CommandError';
  }
}

export class TimeoutError extends Error {
  constructor(label, sec) {
    super(`${label} 超时（${sec}s），可加大 --timeout`);
    this.name = 'TimeoutError';
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
node --test /Users/zhaoliang/Documents/coding/opencli/test/errors.test.js
```

Expected: `# pass 5`，`# fail 0`

- [ ] **Step 5: 提交**

```bash
cd /Users/zhaoliang/Documents/coding/opencli
git add src/errors.js test/errors.test.js
git commit -m "feat: src/errors.js 自定义错误类及单测"
```

---

## Task 3: src/helpers.js（迁移 + 测试）

**Files:**
- Create: `src/helpers.js`
- Test: `test/helpers.test.js`

- [ ] **Step 1: 写 src/helpers.js**

写入 `/Users/zhaoliang/Documents/coding/opencli/src/helpers.js`：

```js
import { existsSync } from 'node:fs';

export function looksLikeUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(s ?? '').trim(),
  );
}

export function isLocalFilePath(ref) {
  const s = String(ref ?? '').trim();
  if (!s || looksLikeUuid(s)) return false;
  return existsSync(s);
}

const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

export function guessMimeType(filePath) {
  const ext = String(filePath ?? '').split('.').pop().toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}
```

- [ ] **Step 2: 写 test/helpers.test.js**

写入 `/Users/zhaoliang/Documents/coding/opencli/test/helpers.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { looksLikeUuid, isLocalFilePath, guessMimeType } from '../src/helpers.js';

test('looksLikeUuid 识别真 UUID', () => {
  assert.equal(looksLikeUuid('eaf8d90f-44ab-4870-942d-d97089e85eef'), true);
  assert.equal(looksLikeUuid('EAF8D90F-44AB-4870-942D-D97089E85EEF'), true);
});

test('looksLikeUuid 拒绝非 UUID', () => {
  assert.equal(looksLikeUuid('./photo.png'), false);
  assert.equal(looksLikeUuid('hello'), false);
  assert.equal(looksLikeUuid(''), false);
  assert.equal(looksLikeUuid('eaf8d90f-44ab-4870-942d'), false);
});

test('guessMimeType 按扩展名映射', () => {
  assert.equal(guessMimeType('a.png'), 'image/png');
  assert.equal(guessMimeType('a.JPG'), 'image/jpeg');
  assert.equal(guessMimeType('dir/b.jpeg'), 'image/jpeg');
  assert.equal(guessMimeType('a.webp'), 'image/webp');
  assert.equal(guessMimeType('a.mp4'), 'video/mp4');
  assert.equal(guessMimeType('a.mov'), 'video/quicktime');
  assert.equal(guessMimeType('a.mp3'), 'audio/mpeg');
  assert.equal(guessMimeType('a.wav'), 'audio/wav');
  assert.equal(guessMimeType('a.unknown'), 'application/octet-stream');
});

test('isLocalFilePath: 存在的文件为真', () => {
  const f = join(tmpdir(), `zovii-helper-test-${Date.now()}.png`);
  writeFileSync(f, 'x');
  try {
    assert.equal(isLocalFilePath(f), true);
  } finally {
    rmSync(f);
  }
});

test('isLocalFilePath: UUID 形态为假', () => {
  assert.equal(isLocalFilePath('eaf8d90f-44ab-4870-942d-d97089e85eef'), false);
});

test('isLocalFilePath: 不存在的路径为假', () => {
  assert.equal(isLocalFilePath('/no/such/file/zzz.png'), false);
});
```

- [ ] **Step 3: 运行测试**

```bash
node --test /Users/zhaoliang/Documents/coding/opencli/test/helpers.test.js
```

Expected: `# pass 6`，`# fail 0`

- [ ] **Step 4: 提交**

```bash
cd /Users/zhaoliang/Documents/coding/opencli
git add src/helpers.js test/helpers.test.js
git commit -m "feat: src/helpers.js 纯函数及单测（从适配器迁移）"
```

---

## Task 4: src/output.js（TDD）

**Files:**
- Create: `src/output.js`
- Test: `test/output.test.js`

- [ ] **Step 1: 写失败测试**

写入 `/Users/zhaoliang/Documents/coding/opencli/test/output.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { printOutput } from '../src/output.js';

function capture(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...a) => lines.push(a.join(' '));
  fn();
  console.log = orig;
  return lines.join('\n');
}

test('json 格式输出合法 JSON 数组', () => {
  const out = capture(() =>
    printOutput([{ id: '123', name: 'foo' }], ['id', 'name'], 'json')
  );
  const parsed = JSON.parse(out);
  assert.equal(parsed[0].id, '123');
  assert.equal(parsed[0].name, 'foo');
});

test('json 格式空数组输出 []', () => {
  const out = capture(() => printOutput([], ['id'], 'json'));
  assert.equal(out.trim(), '[]');
});

test('table 格式包含列标题和数据', () => {
  const out = capture(() =>
    printOutput([{ id: '123', name: 'foo' }], ['id', 'name'], 'table')
  );
  assert.match(out, /id/);
  assert.match(out, /name/);
  assert.match(out, /123/);
  assert.match(out, /foo/);
});

test('table 格式截断超过 60 字符的值', () => {
  const long = 'a'.repeat(80);
  const out = capture(() =>
    printOutput([{ id: long }], ['id'], 'table')
  );
  assert.ok(!out.includes(long), '超长值应被截断');
  assert.match(out, /aaaaaaaaaa/);
});

test('table 格式跳过全为 null 的列', () => {
  const out = capture(() =>
    printOutput([{ id: '1', width: null }], ['id', 'width'], 'table')
  );
  assert.ok(!out.includes('width'), '全 null 列不应出现');
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
node --test /Users/zhaoliang/Documents/coding/opencli/test/output.test.js
```

Expected: FAIL

- [ ] **Step 3: 写 src/output.js 实现**

写入 `/Users/zhaoliang/Documents/coding/opencli/src/output.js`：

```js
const TRUNC = 60;

export function printOutput(rows, columns, format = 'table') {
  if (format === 'json') {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (!rows || rows.length === 0) {
    console.log('(no results)');
    return;
  }

  // 跳过所有行中均为 null/undefined/'' 的列
  const cols = columns.filter((c) =>
    rows.some((r) => r[c] !== null && r[c] !== undefined && r[c] !== ''),
  );

  const cell = (v) => String(v ?? '').slice(0, TRUNC);
  const widths = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => cell(r[c]).length)),
  );

  console.log(cols.map((c, i) => c.padEnd(widths[i])).join('  '));
  console.log(cols.map((_, i) => '─'.repeat(widths[i])).join('  '));
  for (const row of rows) {
    console.log(cols.map((c, i) => cell(row[c]).padEnd(widths[i])).join('  '));
  }
}

export function handleError(err) {
  const name = err.name || 'Error';
  process.stderr.write(`\x1b[31m${name}\x1b[0m: ${err.message}\n`);
  process.exit(1);
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
node --test /Users/zhaoliang/Documents/coding/opencli/test/output.test.js
```

Expected: `# pass 5`，`# fail 0`

- [ ] **Step 5: 提交**

```bash
cd /Users/zhaoliang/Documents/coding/opencli
git add src/output.js test/output.test.js
git commit -m "feat: src/output.js 表格/JSON 输出及单测"
```

---

## Task 5: src/token.js（parseJwtExp TDD + 完整实现）

**Files:**
- Create: `src/token.js`
- Test: `test/token.test.js`

- [ ] **Step 1: 写 parseJwtExp 失败测试**

写入 `/Users/zhaoliang/Documents/coding/opencli/test/token.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJwtExp } from '../src/token.js';

function makeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesig`;
}

test('parseJwtExp 从 JWT payload 中提取 exp', () => {
  const exp = 1748000000;
  const token = makeJwt({ sub: 'user1', exp });
  assert.equal(parseJwtExp(token), exp);
});

test('parseJwtExp 对无效 token 返回 null', () => {
  assert.equal(parseJwtExp('not.a.jwt'), null);
  assert.equal(parseJwtExp(''), null);
  assert.equal(parseJwtExp('a.b'), null);
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
node --test /Users/zhaoliang/Documents/coding/opencli/test/token.test.js
```

Expected: FAIL

- [ ] **Step 3: 写 src/token.js 完整实现**

写入 `/Users/zhaoliang/Documents/coding/opencli/src/token.js`：

```js
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { AuthRequiredError, CommandError } from './errors.js';

const AUTH_FILE = join(homedir(), '.config', 'zovii', 'auth.json');
const API = 'https://zovii.studio/api/v1';
const REFRESH_THRESHOLD = 300;

export function parseJwtExp(token) {
  try {
    const part = String(token ?? '').split('.')[1];
    if (!part) return null;
    const pad = part + '='.repeat((4 - (part.length % 4)) % 4);
    const decoded = Buffer.from(pad, 'base64url').toString('utf8');
    return JSON.parse(decoded).exp ?? null;
  } catch {
    return null;
  }
}

export async function loadAuth() {
  try {
    const raw = await readFile(AUTH_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveAuth(data) {
  await mkdir(dirname(AUTH_FILE), { recursive: true });
  await writeFile(AUTH_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export async function clearAuth() {
  try {
    await unlink(AUTH_FILE);
  } catch {}
}

export async function loginWithPassword(username, password) {
  const body = new URLSearchParams({ username, password });
  const resp = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    let detail = text;
    try {
      detail = JSON.parse(text).detail || text;
    } catch {}
    throw new CommandError(`登录失败（HTTP ${resp.status}）：${detail}`);
  }
  const data = await resp.json();
  const expires_at = parseJwtExp(data.access_token);
  await saveAuth({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at,
  });
  return { user: data.user, expires_at };
}

export async function refreshAccessToken(refresh_token) {
  const resp = await fetch(`${API}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token }),
  });
  if (!resp.ok) {
    await clearAuth();
    throw new AuthRequiredError('Token 已过期，请重新运行 zovii login');
  }
  const data = await resp.json();
  const expires_at = parseJwtExp(data.access_token);
  const auth = await loadAuth();
  await saveAuth({ ...auth, access_token: data.access_token, expires_at });
  return data.access_token;
}

export async function getToken() {
  const auth = await loadAuth();
  if (!auth?.access_token) throw new AuthRequiredError();
  const now = Math.floor(Date.now() / 1000);
  if (auth.expires_at && auth.expires_at - now < REFRESH_THRESHOLD) {
    return refreshAccessToken(auth.refresh_token);
  }
  return auth.access_token;
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
node --test /Users/zhaoliang/Documents/coding/opencli/test/token.test.js
```

Expected: `# pass 2`，`# fail 0`

- [ ] **Step 5: 语法检查**

```bash
node --check /Users/zhaoliang/Documents/coding/opencli/src/token.js
```

Expected: 无输出（语法正确）

- [ ] **Step 6: 提交**

```bash
cd /Users/zhaoliang/Documents/coding/opencli
git add src/token.js test/token.test.js
git commit -m "feat: src/token.js 认证核心（login/logout/getToken/autoRefresh）及单测"
```

---

## Task 6: src/utils.js（API 工具层）

**Files:**
- Create: `src/utils.js`

- [ ] **Step 1: 写 src/utils.js**

写入 `/Users/zhaoliang/Documents/coding/opencli/src/utils.js`：

```js
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { statSync, existsSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { ArgumentError, AuthRequiredError, CommandError, TimeoutError } from './errors.js';
import { isLocalFilePath, guessMimeType, looksLikeUuid } from './helpers.js';

const API = 'https://zovii.studio/api/v1';
const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;

function throwHttpError(status, context = '') {
  if (status >= 200 && status < 300) return;
  if (status === 401 || status === 403) {
    throw new AuthRequiredError('登录态已失效，请重新运行 zovii login');
  }
  if (status === 402) {
    throw new CommandError('积分不足，请前往 https://zovii.studio/pricing 充值');
  }
  if (status === 404) {
    throw new CommandError(`资源不存在${context ? `（${context}）` : ''}，请检查 ID 是否正确`);
  }
  if (status === 429) {
    throw new CommandError('请求过于频繁，请稍后重试');
  }
  throw new CommandError(`请求失败：HTTP ${status}${context ? ` (${context})` : ''}`);
}

async function apiFetch(path, { method = 'GET', token, body, timeoutMs = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const resp = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    throwHttpError(resp.status, path);
    const text = await resp.text();
    if (!text.trim()) return null;
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

export async function createTask(token, payload) {
  const task = await apiFetch('/tasks', { method: 'POST', token, body: payload });
  if (!task?.id) throw new CommandError('创建任务失败：响应缺少 task id');
  return task;
}

export async function pollTask(token, taskId, { timeoutSec, label }) {
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const task = await apiFetch(`/tasks/${taskId}`, { token });
    if (task.status === 'completed') return task;
    if (task.status === 'failed') {
      throw new CommandError(`生成失败：${task.error || '未知错误'}`);
    }
    if (task.status === 'dismissed') throw new CommandError('任务已被取消');
  }
  throw new TimeoutError(label, timeoutSec);
}

export async function resolveAssets(token, assetIds) {
  const assets = [];
  for (const id of assetIds) {
    try {
      assets.push(await apiFetch(`/assets/${id}`, { token }));
    } catch {
      assets.push({ id });
    }
  }
  return assets;
}

export async function getAsset(token, assetId) {
  return apiFetch(`/assets/${assetId}`, { token });
}

export async function listAssets(token, projectId, { type, limit = 100 } = {}) {
  const out = [];
  let offset = 0;
  const pageSize = 500;
  while (true) {
    const batch = await apiFetch(
      `/projects/${projectId}/assets?limit=${pageSize}&offset=${offset}`,
      { token },
    );
    const arr = Array.isArray(batch) ? batch : (batch?.items ?? []);
    if (!arr.length) break;
    out.push(...arr);
    if (arr.length < pageSize) break;
    if (!type && out.length >= limit) break;
    offset += pageSize;
  }
  const filtered = type ? out.filter((a) => a.type === type) : out;
  return filtered.slice(0, limit);
}

export async function uploadAsset(token, projectId, filePath, toolType) {
  if (!existsSync(filePath)) throw new ArgumentError(`文件不存在：${filePath}`);
  const size = statSync(filePath).size;
  if (size > MAX_UPLOAD_BYTES) {
    throw new CommandError(
      `文件过大（${(size / 1048576).toFixed(1)}MB，超过 80MB 上限），请在网页端上传后传 asset id`,
    );
  }
  const qs = toolType ? `?tool_type=${encodeURIComponent(toolType)}` : '';
  const url = `${API}/projects/${projectId}/assets/upload${qs}`;
  const fileBuffer = await readFile(filePath);
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([fileBuffer], { type: guessMimeType(filePath) }),
    basename(filePath),
  );
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  throwHttpError(resp.status, '上传素材');
  const asset = await resp.json();
  if (!asset?.id) throw new CommandError('上传失败：响应缺少 asset id');
  return asset;
}

export async function resolveAssetRef(token, projectId, ref, toolType) {
  const s = String(ref ?? '').trim();
  if (!s) return '';
  if (isLocalFilePath(s)) {
    const asset = await uploadAsset(token, projectId, s, toolType);
    return asset.id;
  }
  if (!looksLikeUuid(s)) {
    throw new ArgumentError(
      `"${s}" 既不是有效的 asset id（UUID 形态），也不是本地存在的文件路径`,
    );
  }
  return s;
}

export async function resolveAssetRefs(token, projectId, refsCsv, toolType) {
  const parts = String(refsCsv ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const ids = [];
  for (const p of parts) {
    ids.push(await resolveAssetRef(token, projectId, p, toolType));
  }
  return ids;
}

export async function downloadAsset(asset, outPath) {
  const fileUrl = asset?.file_url;
  if (!fileUrl) throw new CommandError('该素材没有可下载的 file_url');
  const resp = await fetch(fileUrl);
  if (!resp.ok) throw new CommandError(`下载失败：HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
  return { localPath: outPath, bytes: buf.length };
}

export async function createProject(token, name) {
  const project = await apiFetch('/projects', { method: 'POST', token, body: { name } });
  if (!project?.id) throw new CommandError('新建项目失败：响应缺少 project id');
  return project;
}

export function assetRow(asset) {
  return {
    assetId: asset.id ?? '',
    assetName: asset.name ?? '',
    assetType: asset.type ?? '',
    fileUrl: asset.file_url ?? '',
    thumbnailUrl: asset.thumbnail_url ?? '',
    width: asset.metadata?.width ?? null,
    height: asset.metadata?.height ?? null,
    duration: asset.metadata?.duration ?? null,
  };
}

export function toRows(task, assets) {
  const base = {
    taskId: task.id,
    status: task.status,
    creditCost: task.credit_cost ?? 0,
  };
  if (!assets.length) {
    return [{ ...base, assetId: '', assetName: '', assetType: '', fileUrl: '', thumbnailUrl: '', width: null, height: null, duration: null }];
  }
  return assets.map((asset) => ({ ...base, ...assetRow(asset) }));
}
```

- [ ] **Step 2: 语法检查**

```bash
node --check /Users/zhaoliang/Documents/coding/opencli/src/utils.js
```

Expected: 无输出

- [ ] **Step 3: 提交**

```bash
cd /Users/zhaoliang/Documents/coding/opencli
git add src/utils.js
git commit -m "feat: src/utils.js API 工具层（Node fetch，无浏览器依赖）"
```

---

## Task 7: login + logout 命令

**Files:**
- Create: `src/commands/login.js`
- Create: `src/commands/logout.js`

- [ ] **Step 1: 写 src/commands/login.js**

写入 `/Users/zhaoliang/Documents/coding/opencli/src/commands/login.js`：

```js
import { loginWithPassword } from '../token.js';
import { printOutput, handleError } from '../output.js';

export function register(program) {
  program
    .command('login <username> <password>')
    .description('用账号密码登录 Zovii Studio，token 保存到 ~/.config/zovii/auth.json')
    .action(async (username, password) => {
      const fmt = program.opts().format;
      try {
        const { user, expires_at } = await loginWithPassword(username, password);
        printOutput(
          [{
            username: user.username,
            credits_balance: user.credits_balance,
            expires_at: expires_at ? new Date(expires_at * 1000).toISOString() : '',
          }],
          ['username', 'credits_balance', 'expires_at'],
          fmt,
        );
      } catch (err) {
        handleError(err);
      }
    });
}
```

- [ ] **Step 2: 写 src/commands/logout.js**

写入 `/Users/zhaoliang/Documents/coding/opencli/src/commands/logout.js`：

```js
import { clearAuth } from '../token.js';
import { printOutput, handleError } from '../output.js';

export function register(program) {
  program
    .command('logout')
    .description('清除本地保存的 token')
    .action(async () => {
      const fmt = program.opts().format;
      try {
        await clearAuth();
        printOutput([{ status: '已登出，本地 token 已清除' }], ['status'], fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
```

- [ ] **Step 3: 更新 bin/zovii.js 注册 login / logout**

替换 `/Users/zhaoliang/Documents/coding/opencli/bin/zovii.js` 全部内容：

```js
#!/usr/bin/env node
import { Command } from 'commander';
import { register as registerLogin } from '../src/commands/login.js';
import { register as registerLogout } from '../src/commands/logout.js';

const program = new Command();

program
  .name('zovii')
  .description('Zovii Studio CLI — AI image & video generation from the command line')
  .version('0.1.0')
  .option('-f, --format <fmt>', '输出格式：table / json', 'table');

registerLogin(program);
registerLogout(program);

program.parse();
```

- [ ] **Step 4: 验证 help 输出**

```bash
node /Users/zhaoliang/Documents/coding/opencli/bin/zovii.js --help
```

Expected: 输出含 `login` 和 `logout` 两个命令。

```bash
node /Users/zhaoliang/Documents/coding/opencli/bin/zovii.js login --help
```

Expected: 含 `<username>` 和 `<password>` 位置参数。

- [ ] **Step 5: 提交**

```bash
cd /Users/zhaoliang/Documents/coding/opencli
git add src/commands/login.js src/commands/logout.js bin/zovii.js
git commit -m "feat: login / logout 命令"
```

---

## Task 8: create-project 命令

**Files:**
- Create: `src/commands/create-project.js`

- [ ] **Step 1: 写 src/commands/create-project.js**

写入 `/Users/zhaoliang/Documents/coding/opencli/src/commands/create-project.js`：

```js
import { getToken } from '../token.js';
import { createProject } from '../utils.js';
import { printOutput, handleError } from '../output.js';

const COLUMNS = ['projectId', 'projectName', 'createdAt'];

export function register(program) {
  program
    .command('create-project <name>')
    .description('新建项目，返回 project ID')
    .action(async (name) => {
      const fmt = program.opts().format;
      try {
        const token = await getToken();
        const project = await createProject(token, name.trim());
        printOutput(
          [{
            projectId: project.id ?? '',
            projectName: project.name ?? '',
            createdAt: project.created_at ?? '',
          }],
          COLUMNS,
          fmt,
        );
      } catch (err) {
        handleError(err);
      }
    });
}
```

- [ ] **Step 2: 注册到 bin/zovii.js**

在 `/Users/zhaoliang/Documents/coding/opencli/bin/zovii.js` 中添加 import 和注册（在 `registerLogout` 之后）：

```js
#!/usr/bin/env node
import { Command } from 'commander';
import { register as registerLogin } from '../src/commands/login.js';
import { register as registerLogout } from '../src/commands/logout.js';
import { register as registerCreateProject } from '../src/commands/create-project.js';

const program = new Command();

program
  .name('zovii')
  .description('Zovii Studio CLI — AI image & video generation from the command line')
  .version('0.1.0')
  .option('-f, --format <fmt>', '输出格式：table / json', 'table');

registerLogin(program);
registerLogout(program);
registerCreateProject(program);

program.parse();
```

- [ ] **Step 3: 验证 help**

```bash
node /Users/zhaoliang/Documents/coding/opencli/bin/zovii.js create-project --help
```

Expected: 含 `<name>` 位置参数。

- [ ] **Step 4: 提交**

```bash
cd /Users/zhaoliang/Documents/coding/opencli
git add src/commands/create-project.js bin/zovii.js
git commit -m "feat: create-project 命令"
```

---

## Task 9: generate-image 命令

**Files:**
- Create: `src/commands/generate-image.js`

- [ ] **Step 1: 写 src/commands/generate-image.js**

写入 `/Users/zhaoliang/Documents/coding/opencli/src/commands/generate-image.js`：

```js
import { getToken } from '../token.js';
import { resolveAssetRefs, createTask, pollTask, resolveAssets, toRows } from '../utils.js';
import { printOutput, handleError } from '../output.js';
import { ArgumentError } from '../errors.js';

const COLUMNS = ['taskId', 'status', 'creditCost', 'assetId', 'assetName', 'assetType', 'fileUrl', 'thumbnailUrl', 'width', 'height', 'duration'];
const MODELS = [
  'ws-nano-banana-2-fast',
  'ws-nano-banana-2',
  'ws-nano-banana-pro',
  'ws-nano-banana-pro-ultra',
  'doubao-seedream-4-5-251128',
  'doubao-seedream-5-0-260128',
  'midjourney-fast',
  'ws-gpt-image-2',
];
const DEFAULT_MODEL = 'ws-nano-banana-2-fast';

export function register(program) {
  program
    .command('generate-image <project>')
    .description('AI 生图：文生图 / 图生图，等待并返回图片 URL')
    .option('--prompt <text>', '提示词（必填）')
    .option('--model <model>', `模型：${MODELS.join(' / ')}`, DEFAULT_MODEL)
    .option('--aspect-ratio <ratio>', '宽高比：1:1 / 2:3 / 4:3 / 16:9 等', '1:1')
    .option('--size <size>', '分辨率：2K / 4K', '2K')
    .option('--count <n>', '生成数量 1-20', '1')
    .option('--image-input <refs>', '参考图 asset ID 或本地路径，多个逗号分隔（可选）', '')
    .option('--timeout <s>', '超时秒数', '300')
    .option('--no-wait', '提交后立即返回 task id，不等待结果')
    .action(async (project, opts) => {
      const fmt = program.opts().format;
      try {
        const prompt = String(opts.prompt ?? '').trim();
        if (!prompt) throw new ArgumentError('--prompt 不能为空');

        const model = opts.model;
        if (!MODELS.includes(model)) {
          throw new ArgumentError(`未知模型 "${model}"，可选：${MODELS.join(' / ')}`);
        }
        const count = parseInt(opts.count, 10);
        if (!Number.isInteger(count) || count < 1 || count > 20) {
          throw new ArgumentError('--count 必须是 1-20 的整数');
        }
        const timeoutSec = parseInt(opts.timeout, 10);
        if (!Number.isInteger(timeoutSec) || timeoutSec <= 0) {
          throw new ArgumentError('--timeout 必须是正整数');
        }

        const token = await getToken();
        const imageInput = await resolveAssetRefs(token, project, opts.imageInput, 'ai_image');

        const payload = {
          project_id: project,
          tool_id: 'ai_image',
          sub_feature_id: 'image_generation',
          model_id: model,
          params: {
            prompt,
            aspect_ratio: opts.aspectRatio,
            image_size: opts.size,
            generation_count: count,
            quality: 'medium',
            image_input: imageInput,
          },
        };

        const task = await createTask(token, payload);
        if (!opts.wait) {
          printOutput(toRows(task, []), COLUMNS, fmt);
          return;
        }
        const done = await pollTask(token, task.id, { timeoutSec, label: 'zovii 生图' });
        const assets = await resolveAssets(token, done.result_asset_ids || []);
        printOutput(toRows(done, assets), COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
```

- [ ] **Step 2: 注册到 bin/zovii.js**

替换 `/Users/zhaoliang/Documents/coding/opencli/bin/zovii.js` 全部内容：

```js
#!/usr/bin/env node
import { Command } from 'commander';
import { register as registerLogin } from '../src/commands/login.js';
import { register as registerLogout } from '../src/commands/logout.js';
import { register as registerCreateProject } from '../src/commands/create-project.js';
import { register as registerGenerateImage } from '../src/commands/generate-image.js';

const program = new Command();

program
  .name('zovii')
  .description('Zovii Studio CLI — AI image & video generation from the command line')
  .version('0.1.0')
  .option('-f, --format <fmt>', '输出格式：table / json', 'table');

registerLogin(program);
registerLogout(program);
registerCreateProject(program);
registerGenerateImage(program);

program.parse();
```

- [ ] **Step 3: 验证 help 及参数校验**

```bash
node /Users/zhaoliang/Documents/coding/opencli/bin/zovii.js generate-image --help
```

Expected: 含 `--prompt`、`--model`、`--no-wait` 等所有选项。

```bash
node /Users/zhaoliang/Documents/coding/opencli/bin/zovii.js generate-image some-project-id 2>&1 | head -3
```

Expected: 报 `ArgumentError: --prompt 不能为空`

- [ ] **Step 4: 提交**

```bash
cd /Users/zhaoliang/Documents/coding/opencli
git add src/commands/generate-image.js bin/zovii.js
git commit -m "feat: generate-image 命令（文生图/图生图）"
```

---

## Task 10: generate-video 命令

**Files:**
- Create: `src/commands/generate-video.js`

- [ ] **Step 1: 写 src/commands/generate-video.js**

写入 `/Users/zhaoliang/Documents/coding/opencli/src/commands/generate-video.js`：

```js
import { getToken } from '../token.js';
import { resolveAssetRef, resolveAssetRefs, createTask, pollTask, resolveAssets, toRows } from '../utils.js';
import { printOutput, handleError } from '../output.js';
import { ArgumentError } from '../errors.js';

const COLUMNS = ['taskId', 'status', 'creditCost', 'assetId', 'assetName', 'assetType', 'fileUrl', 'thumbnailUrl', 'width', 'height', 'duration'];
const MODELS = [
  'doubao-seedance-2-0-260128',
  'doubao-seedance-2-0-fast-260128',
  'doubao-seedance-1-5-pro-251215',
  'kling-o3',
  'ws-veo-3.1',
];
const DEFAULT_MODEL = 'doubao-seedance-2-0-260128';

export function register(program) {
  program
    .command('generate-video <project>')
    .description('AI 生视频：文生视频 / 首尾帧 / 参考图·视频·音频生视频')
    .option('--prompt <text>', '提示词', '')
    .option('--model <model>', `模型：${MODELS.join(' / ')}`, DEFAULT_MODEL)
    .option('--ratio <ratio>', '画面比例：16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 21:9', '16:9')
    .option('--duration <s>', '时长（秒）：8 / 12', '8')
    .option('--resolution <res>', '分辨率：480p / 720p / 1080p', '720p')
    .option('--image-input <ref>', '首帧图 asset ID 或本地路径（可选）', '')
    .option('--end-frame <ref>', '尾帧图 asset ID 或本地路径（需配合 --image-input）', '')
    .option('--ref-image <refs>', '参考图 asset ID 或本地路径，多个逗号分隔（可选）', '')
    .option('--ref-video <ref>', '参考视频 asset ID 或本地路径（可选）', '')
    .option('--ref-audio <refs>', '参考音频 asset ID 或本地路径，多个逗号分隔（可选）', '')
    .option('--keep-original-audio', '保留参考视频原声（仅 --ref-video 时有效）')
    .option('--no-audio', '不生成音频')
    .option('--timeout <s>', '超时秒数', '600')
    .option('--no-wait', '提交后立即返回 task id，不等待结果')
    .action(async (project, opts) => {
      const fmt = program.opts().format;
      try {
        const prompt = String(opts.prompt ?? '').trim();
        const imageRef = String(opts.imageInput ?? '').trim();
        const endFrameRef = String(opts.endFrame ?? '').trim();
        const refVideoRef = String(opts.refVideo ?? '').trim();
        const refImageRefs = String(opts.refImage ?? '').trim();
        const refAudioRefs = String(opts.refAudio ?? '').trim();

        const hasInput = imageRef || endFrameRef || refVideoRef || refImageRefs || refAudioRefs;
        if (!prompt && !hasInput) {
          throw new ArgumentError('--prompt 与参考素材（--image-input / --ref-* 等）至少提供一个');
        }
        if (endFrameRef && !imageRef) {
          throw new ArgumentError('--end-frame 需要同时提供 --image-input（首帧）');
        }

        const model = opts.model;
        if (!MODELS.includes(model)) {
          throw new ArgumentError(`未知模型 "${model}"，可选：${MODELS.join(' / ')}`);
        }
        const timeoutSec = parseInt(opts.timeout, 10);
        if (!Number.isInteger(timeoutSec) || timeoutSec <= 0) {
          throw new ArgumentError('--timeout 必须是正整数');
        }

        const token = await getToken();
        const imageInput = imageRef
          ? await resolveAssetRef(token, project, imageRef, 'ai_video') : '';
        const endFrameInput = endFrameRef
          ? await resolveAssetRef(token, project, endFrameRef, 'ai_video') : '';
        const referenceVideoInput = refVideoRef
          ? await resolveAssetRef(token, project, refVideoRef, 'ai_video') : '';
        const referenceImageInputs = await resolveAssetRefs(token, project, refImageRefs, 'ai_video');
        const referenceAudioInputs = await resolveAssetRefs(token, project, refAudioRefs, 'ai_video');

        const payload = {
          project_id: project,
          tool_id: 'ai_video',
          sub_feature_id: 'video_generation',
          model_id: model,
          params: {
            prompt,
            model_id: model,
            ratio: opts.ratio,
            duration: opts.duration,
            resolution: opts.resolution,
            generate_audio: opts.audio !== false,
            generation_count: 1,
            camera_fixed: false,
            shot_type: 'customize',
            image_input: imageInput,
            end_frame_input: endFrameInput,
            reference_image_inputs: referenceImageInputs,
            reference_video_input: referenceVideoInput,
            reference_audio_inputs: referenceAudioInputs,
            keep_original_audio: opts.keepOriginalAudio ?? false,
          },
        };

        const task = await createTask(token, payload);
        if (!opts.wait) {
          printOutput(toRows(task, []), COLUMNS, fmt);
          return;
        }
        const done = await pollTask(token, task.id, { timeoutSec, label: 'zovii 生视频' });
        const assets = await resolveAssets(token, done.result_asset_ids || []);
        printOutput(toRows(done, assets), COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
```

- [ ] **Step 2: 注册到 bin/zovii.js（追加 generateVideo）**

替换 `/Users/zhaoliang/Documents/coding/opencli/bin/zovii.js`：

```js
#!/usr/bin/env node
import { Command } from 'commander';
import { register as registerLogin } from '../src/commands/login.js';
import { register as registerLogout } from '../src/commands/logout.js';
import { register as registerCreateProject } from '../src/commands/create-project.js';
import { register as registerGenerateImage } from '../src/commands/generate-image.js';
import { register as registerGenerateVideo } from '../src/commands/generate-video.js';

const program = new Command();

program
  .name('zovii')
  .description('Zovii Studio CLI — AI image & video generation from the command line')
  .version('0.1.0')
  .option('-f, --format <fmt>', '输出格式：table / json', 'table');

registerLogin(program);
registerLogout(program);
registerCreateProject(program);
registerGenerateImage(program);
registerGenerateVideo(program);

program.parse();
```

- [ ] **Step 3: 验证参数依赖校验**

```bash
node /Users/zhaoliang/Documents/coding/opencli/bin/zovii.js generate-video some-id --end-frame abc 2>&1 | head -3
```

Expected: 报 `ArgumentError: --end-frame 需要同时提供 --image-input（首帧）`

- [ ] **Step 4: 提交**

```bash
cd /Users/zhaoliang/Documents/coding/opencli
git add src/commands/generate-video.js bin/zovii.js
git commit -m "feat: generate-video 命令（支持首尾帧/参考图·视频·音频）"
```

---

## Task 11: upload-asset + download-asset + list-assets 命令

**Files:**
- Create: `src/commands/upload-asset.js`
- Create: `src/commands/download-asset.js`
- Create: `src/commands/list-assets.js`

- [ ] **Step 1: 写 src/commands/upload-asset.js**

写入 `/Users/zhaoliang/Documents/coding/opencli/src/commands/upload-asset.js`：

```js
import { getToken } from '../token.js';
import { uploadAsset, assetRow } from '../utils.js';
import { printOutput, handleError } from '../output.js';
import { ArgumentError } from '../errors.js';
import { existsSync } from 'node:fs';

const COLUMNS = ['assetId', 'assetName', 'assetType', 'fileUrl', 'thumbnailUrl', 'width', 'height', 'duration'];

export function register(program) {
  program
    .command('upload-asset <project> <file>')
    .description('上传本地图片/视频/音频为项目 asset，返回 asset ID')
    .option('--tool-type <type>', '上传用途标记（可选，透传 tool_type）', '')
    .action(async (project, file, opts) => {
      const fmt = program.opts().format;
      try {
        if (!file.trim()) throw new ArgumentError('file 不能为空');
        if (!existsSync(file)) throw new ArgumentError(`文件不存在：${file}`);
        const token = await getToken();
        const toolType = opts.toolType || undefined;
        const asset = await uploadAsset(token, project, file, toolType);
        printOutput([assetRow(asset)], COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
```

- [ ] **Step 2: 写 src/commands/download-asset.js**

写入 `/Users/zhaoliang/Documents/coding/opencli/src/commands/download-asset.js`：

```js
import { getToken } from '../token.js';
import { getAsset, downloadAsset } from '../utils.js';
import { printOutput, handleError } from '../output.js';
import { ArgumentError } from '../errors.js';
import { resolve } from 'node:path';

const COLUMNS = ['assetId', 'assetName', 'assetType', 'localPath', 'bytes'];

export function register(program) {
  program
    .command('download-asset <project> <asset>')
    .description('下载项目 asset 文件到本地')
    .option('--out <path>', '保存路径（缺省用素材文件名存当前目录）', '')
    .action(async (project, assetId, opts) => {
      const fmt = program.opts().format;
      try {
        if (!assetId.trim()) throw new ArgumentError('asset 不能为空');
        const token = await getToken();
        const asset = await getAsset(token, assetId);
        const outArg = opts.out.trim();
        const outPath = resolve(outArg || asset.name || `${assetId}.bin`);
        const { localPath, bytes } = await downloadAsset(asset, outPath);
        printOutput(
          [{
            assetId: asset.id ?? assetId,
            assetName: asset.name ?? '',
            assetType: asset.type ?? '',
            localPath,
            bytes,
          }],
          COLUMNS,
          fmt,
        );
      } catch (err) {
        handleError(err);
      }
    });
}
```

- [ ] **Step 3: 写 src/commands/list-assets.js**

写入 `/Users/zhaoliang/Documents/coding/opencli/src/commands/list-assets.js`：

```js
import { getToken } from '../token.js';
import { listAssets, assetRow } from '../utils.js';
import { printOutput, handleError } from '../output.js';
import { ArgumentError } from '../errors.js';

const COLUMNS = ['assetId', 'assetName', 'assetType', 'fileUrl', 'thumbnailUrl', 'width', 'height', 'duration'];
const VALID_TYPES = ['image', 'video', 'audio'];

export function register(program) {
  program
    .command('list-assets <project>')
    .description('列出项目素材（支持按类型过滤）')
    .option('--type <type>', '按类型过滤：image / video / audio', '')
    .option('--limit <n>', '最多返回多少条', '100')
    .action(async (project, opts) => {
      const fmt = program.opts().format;
      try {
        const type = opts.type.trim();
        if (type && !VALID_TYPES.includes(type)) {
          throw new ArgumentError(`--type 只能是 ${VALID_TYPES.join(' / ')}`);
        }
        const limit = parseInt(opts.limit, 10);
        if (!Number.isInteger(limit) || limit < 1) {
          throw new ArgumentError('--limit 必须是正整数');
        }
        const token = await getToken();
        const assets = await listAssets(token, project, { type: type || undefined, limit });
        printOutput(assets.map(assetRow), COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
```

- [ ] **Step 4: 注册三个命令到 bin/zovii.js**

替换 `/Users/zhaoliang/Documents/coding/opencli/bin/zovii.js`：

```js
#!/usr/bin/env node
import { Command } from 'commander';
import { register as registerLogin } from '../src/commands/login.js';
import { register as registerLogout } from '../src/commands/logout.js';
import { register as registerCreateProject } from '../src/commands/create-project.js';
import { register as registerGenerateImage } from '../src/commands/generate-image.js';
import { register as registerGenerateVideo } from '../src/commands/generate-video.js';
import { register as registerUploadAsset } from '../src/commands/upload-asset.js';
import { register as registerDownloadAsset } from '../src/commands/download-asset.js';
import { register as registerListAssets } from '../src/commands/list-assets.js';

const program = new Command();

program
  .name('zovii')
  .description('Zovii Studio CLI — AI image & video generation from the command line')
  .version('0.1.0')
  .option('-f, --format <fmt>', '输出格式：table / json', 'table');

registerLogin(program);
registerLogout(program);
registerCreateProject(program);
registerGenerateImage(program);
registerGenerateVideo(program);
registerUploadAsset(program);
registerDownloadAsset(program);
registerListAssets(program);

program.parse();
```

- [ ] **Step 5: 验证三个命令出现在 help**

```bash
node /Users/zhaoliang/Documents/coding/opencli/bin/zovii.js --help 2>&1 | grep -E "upload|download|list"
```

Expected: 三行各含对应命令名。

- [ ] **Step 6: 提交**

```bash
cd /Users/zhaoliang/Documents/coding/opencli
git add src/commands/upload-asset.js src/commands/download-asset.js src/commands/list-assets.js bin/zovii.js
git commit -m "feat: upload-asset / download-asset / list-assets 命令"
```

---

## Task 12: remove-background + upscale-video 命令

**Files:**
- Create: `src/commands/remove-background.js`
- Create: `src/commands/upscale-video.js`

- [ ] **Step 1: 写 src/commands/remove-background.js**

写入 `/Users/zhaoliang/Documents/coding/opencli/src/commands/remove-background.js`：

```js
import { getToken } from '../token.js';
import { resolveAssetRef, getAsset, createTask, pollTask, resolveAssets, toRows } from '../utils.js';
import { printOutput, handleError } from '../output.js';
import { ArgumentError } from '../errors.js';

const COLUMNS = ['taskId', 'status', 'creditCost', 'assetId', 'assetName', 'assetType', 'fileUrl', 'thumbnailUrl', 'width', 'height', 'duration'];

export function register(program) {
  program
    .command('remove-background <project> <image>')
    .description('图片去除背景，返回透明背景图片 URL')
    .option('--timeout <s>', '超时秒数', '300')
    .option('--no-wait', '提交后立即返回 task id，不等待结果')
    .action(async (project, imageRef, opts) => {
      const fmt = program.opts().format;
      try {
        if (!imageRef.trim()) throw new ArgumentError('image 不能为空');
        const timeoutSec = parseInt(opts.timeout, 10);
        if (!Number.isInteger(timeoutSec) || timeoutSec <= 0) {
          throw new ArgumentError('--timeout 必须是正整数');
        }

        const token = await getToken();
        const assetId = await resolveAssetRef(token, project, imageRef, 'remove_bg');
        const asset = await getAsset(token, assetId);
        if (!asset.file_url) throw new ArgumentError('该素材缺少 file_url，无法移除背景');

        const payload = {
          project_id: project,
          tool_id: 'remove_bg',
          sub_feature_id: 'remove_bg',
          model_id: 'wavespeed-rmbg',
          params: { image_url: asset.file_url, source_asset_id: asset.id },
        };

        const task = await createTask(token, payload);
        if (!opts.wait) {
          printOutput(toRows(task, []), COLUMNS, fmt);
          return;
        }
        const done = await pollTask(token, task.id, { timeoutSec, label: 'zovii 移除背景' });
        const assets = await resolveAssets(token, done.result_asset_ids || []);
        printOutput(toRows(done, assets), COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
```

- [ ] **Step 2: 写 src/commands/upscale-video.js**

写入 `/Users/zhaoliang/Documents/coding/opencli/src/commands/upscale-video.js`：

```js
import { getToken } from '../token.js';
import { resolveAssetRef, createTask, pollTask, resolveAssets, toRows } from '../utils.js';
import { printOutput, handleError } from '../output.js';
import { ArgumentError } from '../errors.js';

const COLUMNS = ['taskId', 'status', 'creditCost', 'assetId', 'assetName', 'assetType', 'fileUrl', 'thumbnailUrl', 'width', 'height', 'duration'];
const RESOLUTIONS = ['1080p', '2k', '4k'];

export function register(program) {
  program
    .command('upscale-video <project> <video>')
    .description('视频高清放大：1080p / 2K / 4K')
    .option('--resolution <res>', '目标分辨率：1080p / 2k / 4k', '1080p')
    .option('--duration <s>', '处理时长（秒），0 表示整段', '0')
    .option('--timeout <s>', '超时秒数', '600')
    .option('--no-wait', '提交后立即返回 task id，不等待结果')
    .action(async (project, videoRef, opts) => {
      const fmt = program.opts().format;
      try {
        if (!videoRef.trim()) throw new ArgumentError('video 不能为空');

        const resolution = opts.resolution.trim().toLowerCase();
        if (!RESOLUTIONS.includes(resolution)) {
          throw new ArgumentError(`--resolution 只能是 ${RESOLUTIONS.join(' / ')}`);
        }
        const duration = parseInt(opts.duration, 10);
        if (!Number.isInteger(duration) || duration < 0) {
          throw new ArgumentError('--duration 必须是 >= 0 的整数');
        }
        const timeoutSec = parseInt(opts.timeout, 10);
        if (!Number.isInteger(timeoutSec) || timeoutSec <= 0) {
          throw new ArgumentError('--timeout 必须是正整数');
        }

        const token = await getToken();
        const videoId = await resolveAssetRef(token, project, videoRef, 'video_upscale');

        const payload = {
          project_id: project,
          tool_id: 'video_upscale',
          sub_feature_id: 'video_upscale',
          model_id: 'wavespeed-video-upscaler',
          params: { video_input: videoId, target_resolution: resolution, duration },
        };

        const task = await createTask(token, payload);
        if (!opts.wait) {
          printOutput(toRows(task, []), COLUMNS, fmt);
          return;
        }
        const done = await pollTask(token, task.id, { timeoutSec, label: 'zovii 视频放大' });
        const assets = await resolveAssets(token, done.result_asset_ids || []);
        printOutput(toRows(done, assets), COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
```

- [ ] **Step 3: 写最终版 bin/zovii.js（所有命令）**

替换 `/Users/zhaoliang/Documents/coding/opencli/bin/zovii.js`：

```js
#!/usr/bin/env node
import { Command } from 'commander';
import { register as registerLogin } from '../src/commands/login.js';
import { register as registerLogout } from '../src/commands/logout.js';
import { register as registerCreateProject } from '../src/commands/create-project.js';
import { register as registerGenerateImage } from '../src/commands/generate-image.js';
import { register as registerGenerateVideo } from '../src/commands/generate-video.js';
import { register as registerUploadAsset } from '../src/commands/upload-asset.js';
import { register as registerDownloadAsset } from '../src/commands/download-asset.js';
import { register as registerListAssets } from '../src/commands/list-assets.js';
import { register as registerRemoveBackground } from '../src/commands/remove-background.js';
import { register as registerUpscaleVideo } from '../src/commands/upscale-video.js';

const program = new Command();

program
  .name('zovii')
  .description('Zovii Studio CLI — AI image & video generation from the command line')
  .version('0.1.0')
  .option('-f, --format <fmt>', '输出格式：table / json', 'table');

registerLogin(program);
registerLogout(program);
registerCreateProject(program);
registerGenerateImage(program);
registerGenerateVideo(program);
registerUploadAsset(program);
registerDownloadAsset(program);
registerListAssets(program);
registerRemoveBackground(program);
registerUpscaleVideo(program);

program.parse();
```

- [ ] **Step 4: 验证所有 10 个命令**

```bash
node /Users/zhaoliang/Documents/coding/opencli/bin/zovii.js --help
```

Expected: 输出列出所有 10 个命令（login、logout、create-project、generate-image、generate-video、upload-asset、download-asset、list-assets、remove-background、upscale-video）。

- [ ] **Step 5: 提交**

```bash
cd /Users/zhaoliang/Documents/coding/opencli
git add src/commands/remove-background.js src/commands/upscale-video.js bin/zovii.js
git commit -m "feat: remove-background / upscale-video 命令，bin/zovii.js 完整注册所有命令"
```

---

## Task 13: 全量单测 + 语法检查

**Files:** 无新增，只执行验证

- [ ] **Step 1: 运行所有单测**

```bash
node --test /Users/zhaoliang/Documents/coding/opencli/test/*.test.js
```

Expected: 全部 PASS（errors: 5, helpers: 6, output: 5, token: 2，共 18 个测试）。

- [ ] **Step 2: 语法检查所有 src 文件**

```bash
for f in /Users/zhaoliang/Documents/coding/opencli/src/**/*.js \
          /Users/zhaoliang/Documents/coding/opencli/bin/zovii.js; do
  node --check "$f" && echo "OK: $f"
done
```

Expected: 每行输出 `OK: <path>`，无报错。

- [ ] **Step 3: 提交（若有测试修复）**

如有任何测试失败，先修复再提交：
```bash
cd /Users/zhaoliang/Documents/coding/opencli
git add -A
git commit -m "fix: 单测与语法问题修复"
```

---

## Task 14: README.md + .npmignore

**Files:**
- Create: `README.md`
- Create: `.npmignore`

- [ ] **Step 1: 写 README.md**

写入 `/Users/zhaoliang/Documents/coding/opencli/README.md`：

```markdown
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
```

- [ ] **Step 2: 写 .npmignore**

写入 `/Users/zhaoliang/Documents/coding/opencli/.npmignore`：

```
test/
docs/
e2e-out/
.claude/
*.jpg
*.png
*.mp4
*.webp
.git/
node_modules/
```

- [ ] **Step 3: 验证 npm pack 包含正确文件**

```bash
cd /Users/zhaoliang/Documents/coding/opencli && npm pack --dry-run 2>&1 | grep -E "^npm notice"
```

Expected: 列出 `bin/zovii.js`、`src/` 下所有文件、`README.md`、`package.json`；不含 `test/`、`docs/`、`*.jpg`。

- [ ] **Step 4: 提交**

```bash
cd /Users/zhaoliang/Documents/coding/opencli
git add README.md .npmignore
git commit -m "docs: README 安装与使用说明，.npmignore 排除非发布文件"
```

---

## Task 15: 端到端验证

**Files:** 无，只执行验证

- [ ] **Step 1: npm link 本地安装**

```bash
cd /Users/zhaoliang/Documents/coding/opencli && npm link
```

Expected: 成功，无报错。

- [ ] **Step 2: 验证 zovii 命令可用**

```bash
zovii --version
```

Expected: `0.1.0`

```bash
zovii --help
```

Expected: 列出所有 10 个命令。

- [ ] **Step 3: 验证未登录时报错**

```bash
zovii list-assets some-project-id 2>&1 | head -3
```

Expected: 报 `AuthRequiredError: 未登录，请先运行: zovii login ...`

- [ ] **Step 4: 实跑登录**

```bash
zovii login <your_username> <your_password>
```

Expected: 输出包含 `username`、`credits_balance`、`expires_at` 三列，token 写入 `~/.config/zovii/auth.json`。

- [ ] **Step 5: 验证 auth.json 生成**

```bash
cat ~/.config/zovii/auth.json | python3 -m json.tool | grep -E "expires_at|access_token" | head -3
```

Expected: 显示 `access_token`（eyJ 开头）和 `expires_at`（Unix 时间戳）。

- [ ] **Step 6: 实跑 list-assets（免费）**

```bash
zovii list-assets eaf8d90f-44ab-4870-942d-d97089e85eef --limit 3
```

Expected: 返回最多 3 条素材，表格显示 assetId / assetName / assetType 等列。

- [ ] **Step 7: 验证 --format json**

```bash
zovii list-assets eaf8d90f-44ab-4870-942d-d97089e85eef --limit 1 -f json
```

Expected: 输出合法 JSON 数组。

- [ ] **Step 8: 收尾提交**

```bash
cd /Users/zhaoliang/Documents/coding/opencli
git log --oneline
```

Expected: 显示完整提交历史（脚手架 → errors → helpers → output → token → utils → 各命令 → README）。

---

## Self-Review

**1. Spec 覆盖检查：**
- `zovii login / logout` → Task 7 ✓
- `create-project` → Task 8 ✓
- `generate-image` → Task 9 ✓
- `generate-video`（首尾帧/参考素材）→ Task 10 ✓
- `upload-asset / download-asset / list-assets` → Task 11 ✓
- `remove-background / upscale-video` → Task 12 ✓
- `token.js` 自动刷新 → Task 5 ✓
- `utils.js` Node FormData 上传 → Task 6 ✓
- `output.js` table/json → Task 4 ✓
- `errors.js` → Task 2 ✓
- `helpers.js` → Task 3 ✓
- `package.json` + npm 发布配置 → Task 1 + Task 14 ✓

**2. 占位符扫描：** 无 TBD/TODO，所有步骤含完整代码。

**3. 类型一致性：**
- `getToken()` 在 token.js 定义，所有命令文件 import 拼写一致 ✓
- `apiFetch` 为 utils.js 内部私有函数，外部不引用 ✓
- `toRows(task, assets)` / `assetRow(asset)` 在 utils.js 定义，命令文件引用一致 ✓
- `printOutput(rows, columns, format)` / `handleError(err)` 在 output.js 定义，所有命令引用一致 ✓
- COLUMNS 常量在每个命令文件独立定义（无跨文件依赖），拼写来自设计文档 ✓
