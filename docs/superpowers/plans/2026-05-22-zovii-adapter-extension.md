# zovii 适配器功能扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 opencli 的 zovii 适配器新增上传/下载/列出素材、移除背景、视频高清放大三类命令，并扩展 generate-video 支持首尾帧与参考图/视频/音频，所有素材入参同时支持 asset ID 与本地路径自动上传。

**Architecture:** 改动全部位于 `~/.opencli/clis/zovii/`。纯函数抽到无框架依赖的 `helpers.js`（可 `node --test` 单测）；框架耦合的上传/下载/解析逻辑集中在 `utils.js` 的共享导出；5 个新命令文件与 2 个扩展命令统一经 `resolveAssetRef(s)` 处理素材入参，上传逻辑只此一份。

**Tech Stack:** Node.js ESM、`@jackwener/opencli` 适配器框架（`cli()` / `Strategy.COOKIE` / `browser:true`）、Node 内置 `node:test` 测试运行器、opencli 浏览器桥（CDP `page.evaluate`）。

**关键约定：**
- 适配器目录：`~/.opencli/clis/zovii/`
- 现有共享文件 `utils.js` 提供 `HOST / readToken / createTask / pollTask / resolveAssets / toRows`，内部有 `pageFetch`、`throwHttpError`、`API` 常量
- zovii API base `/api/v1`，鉴权 `Authorization: Bearer <accessToken>`
- 实测用项目「桃园」：`eaf8d90f-44ab-4870-942d-d97089e85eef`
- commit message 用中文，结尾带 `Co-Authored-By` trailer

---

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `~/.opencli/clis/zovii/helpers.js` | 新建 | 纯函数：`looksLikeUuid` / `isLocalFilePath` / `guessMimeType`，无框架依赖 |
| `~/.opencli/clis/zovii/helpers.test.js` | 新建 | `helpers.js` 的 `node --test` 单测 |
| `~/.opencli/clis/zovii/utils.js` | 修改 | 新增 `uploadAsset / resolveAssetRef / resolveAssetRefs / getAsset / downloadAsset / listAssets / assetRow` |
| `~/.opencli/clis/zovii/upload-asset.js` | 新建 | `upload-asset` 命令 |
| `~/.opencli/clis/zovii/list-assets.js` | 新建 | `list-assets` 命令 |
| `~/.opencli/clis/zovii/download-asset.js` | 新建 | `download-asset` 命令 |
| `~/.opencli/clis/zovii/remove-background.js` | 新建 | `remove-background` 命令 |
| `~/.opencli/clis/zovii/upscale-video.js` | 新建 | `upscale-video` 命令 |
| `~/.opencli/clis/zovii/generate-image.js` | 修改 | `--image-input` 经 `resolveAssetRefs` 支持本地路径 |
| `~/.opencli/clis/zovii/generate-video.js` | 修改 | 新增首尾帧/参考素材选项 |

---

## Task 1: 初始化 git + 基线提交

适配器目录当前无版本控制，先建仓固定回滚点。

**Files:**
- Create: `~/.opencli/clis/zovii/.git/`（仓库）

- [ ] **Step 1: 初始化仓库**

```bash
git -C ~/.opencli/clis/zovii init
```

Expected: `Initialized empty Git repository in .../.opencli/clis/zovii/.git/`

- [ ] **Step 2: 提交当前三个文件作为基线**

```bash
git -C ~/.opencli/clis/zovii add -A
git -C ~/.opencli/clis/zovii commit -m "chore: zovii 适配器基线（generate-image / generate-video / utils）" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected: 提交成功，包含 `generate-image.js`、`generate-video.js`、`utils.js` 三个文件。

- [ ] **Step 3: 确认基线可用**

```bash
opencli validate zovii
```

Expected: 校验通过，无报错。

---

## Task 2: helpers.js 纯函数（TDD）

**Files:**
- Create: `~/.opencli/clis/zovii/helpers.js`
- Test: `~/.opencli/clis/zovii/helpers.test.js`

- [ ] **Step 1: 写失败测试**

写入 `~/.opencli/clis/zovii/helpers.test.js`：

```js
// helpers.js 纯函数单测 —— 运行：node --test helpers.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { looksLikeUuid, isLocalFilePath, guessMimeType } from './helpers.js';

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

- [ ] **Step 2: 运行测试，确认失败**

```bash
node --test ~/.opencli/clis/zovii/helpers.test.js
```

Expected: FAIL —— 报无法解析 `./helpers.js`（文件尚不存在）。

- [ ] **Step 3: 写 helpers.js 实现**

写入 `~/.opencli/clis/zovii/helpers.js`：

```js
// zovii 适配器纯工具函数 —— 无框架依赖，可用 `node --test` 独立单测。
import { existsSync } from 'node:fs';

/** 判断字符串是否为 UUID 形态（asset id / project id 均为 UUID）。 */
export function looksLikeUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(s ?? '').trim(),
  );
}

/** 判断 ref 是否应按本地文件处理：非 UUID 形态、且磁盘上确实存在。 */
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

/** 由文件扩展名猜 MIME 类型，未知返回 application/octet-stream。 */
export function guessMimeType(filePath) {
  const ext = String(filePath ?? '').split('.').pop().toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
node --test ~/.opencli/clis/zovii/helpers.test.js
```

Expected: PASS —— 6 个测试全部通过（`# pass 6` `# fail 0`）。

- [ ] **Step 5: 确认 opencli 不被新文件干扰**

```bash
opencli validate zovii && opencli list 2>/dev/null | grep -c "zovii"
```

Expected: `validate` 通过；zovii 命令数仍为 2（`helpers.js` / `helpers.test.js` 不含 `cli()`，不会注册成命令）。
若 `validate` 因 `helpers.test.js` 报错，把测试文件移到 `/Users/zhaoliang/Documents/coding/opencli/test/zovii-helpers.test.js`，并将其 import 改为绝对路径 `/Users/zhaoliang/.opencli/clis/zovii/helpers.js`。

- [ ] **Step 6: 提交**

```bash
git -C ~/.opencli/clis/zovii add -A
git -C ~/.opencli/clis/zovii commit -m "feat: 新增 helpers.js 纯函数（UUID/路径/MIME 判定）及单测" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected: 提交成功。

---

## Task 2 后续说明：utils.js 共享 helper

Task 3 给 `utils.js` 增加 7 个导出函数。这些函数需要 `page` 句柄（浏览器上下文），无法脱离 opencli 框架单测；其正确性由 Task 4–10 的命令级 `opencli validate` + 实跑验证覆盖。

---

## Task 3: utils.js 新增上传/下载/解析共享函数

**Files:**
- Modify: `~/.opencli/clis/zovii/utils.js`

- [ ] **Step 1: 改 import 区**

把 `utils.js` 顶部的 import 块（第 8–12 行，从 `import {` 到 `} from '@jackwener/opencli/errors';`）替换为：

```js
import {
  ArgumentError,
  AuthRequiredError,
  CommandExecutionError,
  TimeoutError,
} from '@jackwener/opencli/errors';
import { readFile, writeFile } from 'node:fs/promises';
import { statSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { isLocalFilePath, guessMimeType } from './helpers.js';
```

- [ ] **Step 2: 追加共享函数**

在 `utils.js` 末尾（`toRows` 函数之后）追加：

```js

// ===== 素材：上传 / 下载 / 解析 / 列表 =====

/** 本地文件上传体积上限（80MB）；超限建议改用网页上传后传 asset id。 */
const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;

/** 上传本地文件为项目 asset，返回 asset 对象。 */
export async function uploadAsset(page, token, projectId, filePath, toolType) {
  if (!existsSync(filePath)) {
    throw new ArgumentError(`文件不存在：${filePath}`);
  }
  const size = statSync(filePath).size;
  if (size > MAX_UPLOAD_BYTES) {
    throw new CommandExecutionError(
      `文件过大（${(size / 1048576).toFixed(1)}MB，超过 80MB 上限）`,
      '请在 https://zovii.studio 网页端上传后，改用 asset id 传入',
    );
  }
  const fileB64 = (await readFile(filePath)).toString('base64');
  const qs = toolType ? `?tool_type=${encodeURIComponent(toolType)}` : '';
  const req = {
    url: `${API}/projects/${projectId}/assets/upload${qs}`,
    token,
    fileB64,
    fileName: basename(filePath),
    mimeType: guessMimeType(filePath),
  };
  const js = `(async (req) => {
    try {
      const bin = atob(req.fileB64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], req.fileName, { type: req.mimeType });
      const fd = new FormData();
      fd.append('file', file);
      const resp = await fetch(req.url, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + req.token },
        body: fd,
      });
      const text = await resp.text();
      return { ok: resp.ok, status: resp.status, text };
    } catch (e) {
      return { ok: false, status: 0, text: '', error: (e && e.message) || String(e) };
    }
  })(${JSON.stringify(req)})`;

  const result = await page.evaluate(js);
  if (result && result.error) {
    throw new CommandExecutionError(`上传失败：${result.error}`);
  }
  if (!result || !result.ok) {
    const err = new Error(`HTTP ${result ? result.status : 0}`);
    err.status = result ? result.status : 0;
    throwHttpError(err, '上传素材');
  }
  let asset;
  try {
    asset = JSON.parse(result.text);
  } catch {
    throw new CommandExecutionError(`上传响应不是合法 JSON：${result.text.slice(0, 200)}`);
  }
  if (!asset || !asset.id) {
    throw new CommandExecutionError('上传失败：响应缺少 asset id');
  }
  return asset;
}

/** ref 是本地文件则上传换成 asset id，否则原样作为 asset id 返回。 */
export async function resolveAssetRef(page, token, projectId, ref, toolType) {
  const s = String(ref ?? '').trim();
  if (!s) return '';
  if (isLocalFilePath(s)) {
    const asset = await uploadAsset(page, token, projectId, s, toolType);
    return asset.id;
  }
  return s;
}

/** 逗号分隔的多个 ref 逐个解析，返回 asset id 数组。 */
export async function resolveAssetRefs(page, token, projectId, refsCsv, toolType) {
  const parts = String(refsCsv ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const ids = [];
  for (const p of parts) {
    ids.push(await resolveAssetRef(page, token, projectId, p, toolType));
  }
  return ids;
}

/** GET /assets/{id}，失败抛 typed error。 */
export async function getAsset(page, token, assetId) {
  try {
    return await pageFetch(page, `${API}/assets/${assetId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throwHttpError(err, '获取素材');
  }
}

/** 分页拉取项目素材，可按 type 过滤，最多 limit 条。 */
export async function listAssets(page, token, projectId, { type, limit = 100 } = {}) {
  const out = [];
  let offset = 0;
  const pageSize = 500;
  while (out.length < limit + (type ? 10000 : 0)) {
    let batch;
    try {
      batch = await pageFetch(
        page,
        `${API}/projects/${projectId}/assets?limit=${pageSize}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (err) {
      throwHttpError(err, '获取素材列表');
    }
    const arr = Array.isArray(batch) ? batch : (batch && batch.items) || [];
    if (!arr.length) break;
    out.push(...arr);
    if (arr.length < pageSize) break;
    offset += pageSize;
  }
  const filtered = type ? out.filter((a) => a.type === type) : out;
  return filtered.slice(0, limit);
}

/** 下载 asset 文件到本地路径，返回 {localPath, bytes}。 */
export async function downloadAsset(page, token, assetId, outPath) {
  const req = { url: `${API}/assets/${assetId}/download`, token };
  const js = `(async (req) => {
    try {
      const resp = await fetch(req.url, {
        credentials: 'include',
        headers: { Authorization: 'Bearer ' + req.token },
      });
      if (!resp.ok) return { ok: false, status: resp.status };
      const buf = await resp.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      const CHUNK = 8192;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
      }
      return { ok: true, status: resp.status, b64: btoa(bin) };
    } catch (e) {
      return { ok: false, status: 0, error: (e && e.message) || String(e) };
    }
  })(${JSON.stringify(req)})`;
  const result = await page.evaluate(js);
  if (!result || !result.ok) {
    const err = new Error(`HTTP ${result ? result.status : 0}`);
    err.status = result ? result.status : 0;
    throwHttpError(err, '下载素材');
  }
  const buf = Buffer.from(result.b64, 'base64');
  await writeFile(outPath, buf);
  return { localPath: outPath, bytes: buf.length };
}

/** 把单个 asset 拍平成素材输出行。 */
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
```

- [ ] **Step 3: 校验语法**

```bash
node --check ~/.opencli/clis/zovii/utils.js && opencli validate zovii
```

Expected: `node --check` 无输出（语法正确）；`opencli validate zovii` 通过。

- [ ] **Step 4: 提交**

```bash
git -C ~/.opencli/clis/zovii add -A
git -C ~/.opencli/clis/zovii commit -m "feat: utils.js 新增素材上传/下载/解析/列表共享函数" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected: 提交成功。

---

## Task 4: upload-asset 命令

**Files:**
- Create: `~/.opencli/clis/zovii/upload-asset.js`

- [ ] **Step 1: 确认命令尚不存在**

```bash
opencli zovii upload-asset --help 2>&1 | head -3
```

Expected: 报未知命令 / 不在 zovii 命令列表。

- [ ] **Step 2: 创建命令文件**

写入 `~/.opencli/clis/zovii/upload-asset.js`：

```js
// zovii 上传素材 —— 把本地文件上传为项目 asset。
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import { existsSync } from 'node:fs';
import { HOST, readToken, uploadAsset, assetRow } from './utils.js';

cli({
  site: 'zovii',
  name: 'upload-asset',
  description: 'Zovii 上传素材：把本地图片/视频/音频上传为项目 asset，返回 asset ID',
  access: 'write',
  example: 'opencli zovii upload-asset <project_id> ./photo.png',
  domain: HOST,
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'project', type: 'string', required: true, positional: true, help: '项目 ID（studio URL 里的 UUID）' },
    { name: 'file', type: 'string', required: true, positional: true, help: '本地文件路径' },
    { name: 'tool-type', type: 'string', default: '', help: '上传用途标记（可选，透传 tool_type）' },
  ],
  columns: ['assetId', 'assetName', 'assetType', 'fileUrl', 'thumbnailUrl', 'width', 'height', 'duration'],
  func: async (page, args) => {
    const filePath = String(args.file ?? '').trim();
    if (!filePath) throw new ArgumentError('file 不能为空');
    if (!existsSync(filePath)) throw new ArgumentError(`文件不存在：${filePath}`);

    const token = await readToken(page);
    const toolType = String(args['tool-type'] ?? '').trim() || undefined;
    const asset = await uploadAsset(page, token, String(args.project), filePath, toolType);
    return [assetRow(asset)];
  },
});
```

- [ ] **Step 3: 校验定义**

```bash
opencli validate zovii && opencli zovii upload-asset --help -f yaml 2>&1 | head -25
```

Expected: `validate` 通过；help 输出含 `name: upload-asset`、positionals `project` 与 `file`、option `tool-type`。

- [ ] **Step 4: 准备测试图片**

```bash
python3 -c "
import struct, zlib
def png(w,h,rgb):
    def chunk(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    raw=b''.join(b'\x00'+bytes(rgb)*w for _ in range(h))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
open('/tmp/zovii-test-upload.png','wb').write(png(64,64,(80,160,255)))
print('created /tmp/zovii-test-upload.png')
"
```

Expected: `created /tmp/zovii-test-upload.png`

- [ ] **Step 5: 实跑验证（免费）**

```bash
opencli zovii upload-asset eaf8d90f-44ab-4870-942d-d97089e85eef /tmp/zovii-test-upload.png -f json
```

Expected: 返回 JSON，含非空 `assetId`、`assetType: "image"`、非空 `fileUrl`。**记下这个 `assetId`，Task 6 与 Task 11 要用。**
若报 `Not allowed` 或上传失败，先 `opencli doctor` 确认浏览器桥已连接、且已登录 zovii.studio。

- [ ] **Step 6: 提交**

```bash
git -C ~/.opencli/clis/zovii add -A
git -C ~/.opencli/clis/zovii commit -m "feat: 新增 upload-asset 命令（本地文件上传为 asset）" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected: 提交成功。

---

## Task 5: list-assets 命令

**Files:**
- Create: `~/.opencli/clis/zovii/list-assets.js`

- [ ] **Step 1: 确认命令尚不存在**

```bash
opencli zovii list-assets --help 2>&1 | head -3
```

Expected: 报未知命令。

- [ ] **Step 2: 创建命令文件**

写入 `~/.opencli/clis/zovii/list-assets.js`：

```js
// zovii 列出素材 —— 分页拉取项目 asset 列表。
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import { HOST, readToken, listAssets, assetRow } from './utils.js';

const TYPES = ['image', 'video', 'audio'];

cli({
  site: 'zovii',
  name: 'list-assets',
  description: 'Zovii 列出项目素材：返回素材 ID、名称、类型、URL',
  access: 'read',
  example: 'opencli zovii list-assets <project_id> --type video',
  domain: HOST,
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'project', type: 'string', required: true, positional: true, help: '项目 ID（studio URL 里的 UUID）' },
    { name: 'type', type: 'string', default: '', help: '按类型过滤：image / video / audio（可选）' },
    { name: 'limit', type: 'int', default: 100, help: '最多返回多少条' },
  ],
  columns: ['assetId', 'assetName', 'assetType', 'fileUrl', 'thumbnailUrl', 'width', 'height', 'duration'],
  func: async (page, args) => {
    const type = String(args.type ?? '').trim();
    if (type && !TYPES.includes(type)) {
      throw new ArgumentError(`--type 只能是 ${TYPES.join(' / ')}`);
    }
    const limit = Number(args.limit ?? 100);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new ArgumentError('--limit 必须是正整数');
    }
    const token = await readToken(page);
    const assets = await listAssets(page, token, String(args.project), {
      type: type || undefined,
      limit,
    });
    return assets.map(assetRow);
  },
});
```

- [ ] **Step 3: 校验定义**

```bash
opencli validate zovii && opencli zovii list-assets --help -f yaml 2>&1 | head -25
```

Expected: `validate` 通过；help 含 `name: list-assets`、option `type` 与 `limit`。

- [ ] **Step 4: 实跑验证（免费）**

```bash
opencli zovii list-assets eaf8d90f-44ab-4870-942d-d97089e85eef --type image --limit 5 -f json
```

Expected: 返回最多 5 条 image 类型素材，每条含 `assetId`、`assetType: "image"`。

- [ ] **Step 5: 提交**

```bash
git -C ~/.opencli/clis/zovii add -A
git -C ~/.opencli/clis/zovii commit -m "feat: 新增 list-assets 命令（列出项目素材）" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected: 提交成功。

---

## Task 6: download-asset 命令

**Files:**
- Create: `~/.opencli/clis/zovii/download-asset.js`

- [ ] **Step 1: 确认命令尚不存在**

```bash
opencli zovii download-asset --help 2>&1 | head -3
```

Expected: 报未知命令。

- [ ] **Step 2: 创建命令文件**

写入 `~/.opencli/clis/zovii/download-asset.js`：

```js
// zovii 下载素材 —— 把项目 asset 的文件保存到本地。
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import { resolve } from 'node:path';
import { HOST, readToken, getAsset, downloadAsset } from './utils.js';

cli({
  site: 'zovii',
  name: 'download-asset',
  description: 'Zovii 下载素材：把项目 asset 的文件保存到本地',
  access: 'read',
  example: 'opencli zovii download-asset <project_id> <asset_id> --out ./result.mp4',
  domain: HOST,
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'project', type: 'string', required: true, positional: true, help: '项目 ID（studio URL 里的 UUID）' },
    { name: 'asset', type: 'string', required: true, positional: true, help: '素材 asset ID' },
    { name: 'out', type: 'string', default: '', help: '保存路径（缺省用素材文件名存当前目录）' },
  ],
  columns: ['assetId', 'assetName', 'assetType', 'localPath', 'bytes'],
  func: async (page, args) => {
    const assetId = String(args.asset ?? '').trim();
    if (!assetId) throw new ArgumentError('asset 不能为空');

    const token = await readToken(page);
    const asset = await getAsset(page, token, assetId);
    const outArg = String(args.out ?? '').trim();
    const outPath = resolve(outArg || asset.name || `${assetId}.bin`);
    const { localPath, bytes } = await downloadAsset(page, token, assetId, outPath);
    return [
      {
        assetId: asset.id ?? assetId,
        assetName: asset.name ?? '',
        assetType: asset.type ?? '',
        localPath,
        bytes,
      },
    ];
  },
});
```

- [ ] **Step 3: 校验定义**

```bash
opencli validate zovii && opencli zovii download-asset --help -f yaml 2>&1 | head -25
```

Expected: `validate` 通过；help 含 `name: download-asset`、positionals `project`/`asset`、option `out`。

- [ ] **Step 4: 实跑验证（免费）**

用 Task 4 Step 5 记下的 `assetId` 替换下面的 `<UPLOAD_ASSET_ID>`：

```bash
opencli zovii download-asset eaf8d90f-44ab-4870-942d-d97089e85eef <UPLOAD_ASSET_ID> --out /tmp/zovii-download-check.png -f json
ls -la /tmp/zovii-download-check.png
```

Expected: 返回含 `localPath: /tmp/zovii-download-check.png` 与 `bytes` > 0；`ls` 显示文件已存在。

- [ ] **Step 5: 提交**

```bash
git -C ~/.opencli/clis/zovii add -A
git -C ~/.opencli/clis/zovii commit -m "feat: 新增 download-asset 命令（下载素材到本地）" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected: 提交成功。

---

## Task 7: remove-background 命令

**Files:**
- Create: `~/.opencli/clis/zovii/remove-background.js`

- [ ] **Step 1: 确认命令尚不存在**

```bash
opencli zovii remove-background --help 2>&1 | head -3
```

Expected: 报未知命令。

- [ ] **Step 2: 创建命令文件**

写入 `~/.opencli/clis/zovii/remove-background.js`：

```js
// zovii 移除背景 —— 对图片素材去除背景（隐藏工具 remove_bg）。
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import {
  HOST,
  readToken,
  resolveAssetRef,
  getAsset,
  createTask,
  pollTask,
  resolveAssets,
  toRows,
} from './utils.js';

cli({
  site: 'zovii',
  name: 'remove-background',
  description: 'Zovii 移除背景：对图片素材去除背景，返回透明背景图片 URL',
  access: 'write',
  example: 'opencli zovii remove-background <project_id> <image_asset_id>',
  domain: HOST,
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'project', type: 'string', required: true, positional: true, help: '项目 ID（studio URL 里的 UUID）' },
    { name: 'image', type: 'string', required: true, positional: true, help: '图片 asset ID 或本地图片路径' },
    { name: 'timeout', type: 'int', default: 300, help: '等待处理完成的最长秒数' },
    { name: 'wait', type: 'bool', default: true, help: 'false 则提交后立即返回 task id，不等待结果' },
  ],
  columns: ['taskId', 'status', 'creditCost', 'assetId', 'assetName', 'assetType', 'fileUrl', 'thumbnailUrl', 'width', 'height', 'duration'],
  func: async (page, args) => {
    const imageRef = String(args.image ?? '').trim();
    if (!imageRef) throw new ArgumentError('image 不能为空');

    const timeoutSec = Number(args.timeout ?? 300);
    if (!Number.isInteger(timeoutSec) || timeoutSec <= 0) {
      throw new ArgumentError('--timeout 必须是正整数');
    }
    const wait = args.wait !== false && args.wait !== 'false';

    const token = await readToken(page);
    const projectId = String(args.project);
    const assetId = await resolveAssetRef(page, token, projectId, imageRef, 'remove_bg');
    const asset = await getAsset(page, token, assetId);
    if (!asset.file_url) {
      throw new ArgumentError('该素材缺少 file_url，无法移除背景');
    }

    const payload = {
      project_id: projectId,
      tool_id: 'remove_bg',
      sub_feature_id: 'remove_bg',
      model_id: 'wavespeed-rmbg',
      params: { image_url: asset.file_url, source_asset_id: asset.id },
    };

    const task = await createTask(page, token, payload);
    if (!wait) return toRows(task, []);

    const done = await pollTask(page, token, task.id, { timeoutSec, label: 'zovii 移除背景' });
    const assets = await resolveAssets(page, token, done.result_asset_ids || []);
    return toRows(done, assets);
  },
});
```

- [ ] **Step 3: 校验定义**

```bash
opencli validate zovii && opencli zovii remove-background --help -f yaml 2>&1 | head -25
```

Expected: `validate` 通过；help 含 `name: remove-background`、positionals `project`/`image`。

- [ ] **Step 4: 实跑验证（消耗少量积分，用户已授权）**

用 Task 4 Step 5 记下的 `assetId` 替换 `<UPLOAD_ASSET_ID>`：

```bash
opencli zovii remove-background eaf8d90f-44ab-4870-942d-d97089e85eef <UPLOAD_ASSET_ID> -f json
```

Expected: 返回 `status: "completed"`、非空 `taskId`、非空结果 `assetId` 与 `fileUrl`。**记下结果 `assetId`，Task 11 清理要用。**
若返回 `failed`，把完整错误贴出来再排查（按 CLAUDE.md：未确认根因前不改代码）。

- [ ] **Step 5: 提交**

```bash
git -C ~/.opencli/clis/zovii add -A
git -C ~/.opencli/clis/zovii commit -m "feat: 新增 remove-background 命令（图片移除背景）" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected: 提交成功。

---

## Task 8: upscale-video 命令

**Files:**
- Create: `~/.opencli/clis/zovii/upscale-video.js`

- [ ] **Step 1: 确认命令尚不存在**

```bash
opencli zovii upscale-video --help 2>&1 | head -3
```

Expected: 报未知命令。

- [ ] **Step 2: 创建命令文件**

写入 `~/.opencli/clis/zovii/upscale-video.js`：

```js
// zovii 视频高清放大 —— video_upscale 工具。
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import {
  HOST,
  readToken,
  resolveAssetRef,
  createTask,
  pollTask,
  resolveAssets,
  toRows,
} from './utils.js';

const RESOLUTIONS = ['1080p', '2k', '4k'];

cli({
  site: 'zovii',
  name: 'upscale-video',
  description: 'Zovii 视频高清放大：把视频素材放大到 1080p / 2K / 4K',
  access: 'write',
  example: 'opencli zovii upscale-video <project_id> <video_asset_id> --resolution 4k',
  domain: HOST,
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'project', type: 'string', required: true, positional: true, help: '项目 ID（studio URL 里的 UUID）' },
    { name: 'video', type: 'string', required: true, positional: true, help: '视频 asset ID 或本地视频路径' },
    { name: 'resolution', type: 'string', default: '1080p', help: '目标分辨率：1080p / 2k / 4k' },
    { name: 'duration', type: 'int', default: 0, help: '处理时长（秒），0 表示整段' },
    { name: 'timeout', type: 'int', default: 600, help: '等待处理完成的最长秒数' },
    { name: 'wait', type: 'bool', default: true, help: 'false 则提交后立即返回 task id，不等待结果' },
  ],
  columns: ['taskId', 'status', 'creditCost', 'assetId', 'assetName', 'assetType', 'fileUrl', 'thumbnailUrl', 'width', 'height', 'duration'],
  func: async (page, args) => {
    const videoRef = String(args.video ?? '').trim();
    if (!videoRef) throw new ArgumentError('video 不能为空');

    const resolution = String(args.resolution ?? '1080p').trim().toLowerCase();
    if (!RESOLUTIONS.includes(resolution)) {
      throw new ArgumentError(`--resolution 只能是 ${RESOLUTIONS.join(' / ')}`);
    }
    const duration = Number(args.duration ?? 0);
    if (!Number.isInteger(duration) || duration < 0) {
      throw new ArgumentError('--duration 必须是 >= 0 的整数');
    }
    const timeoutSec = Number(args.timeout ?? 600);
    if (!Number.isInteger(timeoutSec) || timeoutSec <= 0) {
      throw new ArgumentError('--timeout 必须是正整数');
    }
    const wait = args.wait !== false && args.wait !== 'false';

    const token = await readToken(page);
    const projectId = String(args.project);
    const videoId = await resolveAssetRef(page, token, projectId, videoRef, 'video_upscale');

    const payload = {
      project_id: projectId,
      tool_id: 'video_upscale',
      sub_feature_id: 'video_upscale',
      model_id: 'wavespeed-video-upscaler',
      params: { video_input: videoId, target_resolution: resolution, duration },
    };

    const task = await createTask(page, token, payload);
    if (!wait) return toRows(task, []);

    const done = await pollTask(page, token, task.id, { timeoutSec, label: 'zovii 视频放大' });
    const assets = await resolveAssets(page, token, done.result_asset_ids || []);
    return toRows(done, assets);
  },
});
```

- [ ] **Step 3: 校验定义**

```bash
opencli validate zovii && opencli zovii upscale-video --help -f yaml 2>&1 | head -28
```

Expected: `validate` 通过；help 含 `name: upscale-video`、option `resolution`（默认 `1080p`）与 `duration`。

- [ ] **Step 4: 提交**

```bash
git -C ~/.opencli/clis/zovii add -A
git -C ~/.opencli/clis/zovii commit -m "feat: 新增 upscale-video 命令（视频高清放大）" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected: 提交成功。

> **实跑说明：** `upscale-video` 实跑会消耗 7+ 积分（1080p 起步，按分辨率/时长计费），未在本次授权范围内。结构校验通过即可；端到端实跑需另行征得用户同意。

---

## Task 9: 扩展 generate-image 支持本地路径

**Files:**
- Modify: `~/.opencli/clis/zovii/generate-image.js`

- [ ] **Step 1: 改 utils import**

把 `generate-image.js` 第 4 行：

```js
import { HOST, readToken, createTask, pollTask, resolveAssets, toRows } from './utils.js';
```

替换为：

```js
import { HOST, readToken, resolveAssetRefs, createTask, pollTask, resolveAssets, toRows } from './utils.js';
```

- [ ] **Step 2: 改 func 里的 image-input 解析**

把 `generate-image.js` `func` 中这一段：

```js
    const wait = args.wait !== false && args.wait !== 'false';
    const imageInput = String(args['image-input'] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const token = await readToken(page);

    const payload = {
      project_id: String(args.project),
```

替换为：

```js
    const wait = args.wait !== false && args.wait !== 'false';

    const token = await readToken(page);
    const projectId = String(args.project);
    const imageInput = await resolveAssetRefs(page, token, projectId, args['image-input'], 'ai_image');

    const payload = {
      project_id: projectId,
```

- [ ] **Step 3: 更新 image-input 的 help 文案**

把 `args` 数组里 `image-input` 那一行：

```js
    { name: 'image-input', type: 'string', default: '', help: '参考图 asset ID，多个用逗号分隔（图生图，可选）' },
```

替换为：

```js
    { name: 'image-input', type: 'string', default: '', help: '参考图 asset ID 或本地路径，多个用逗号分隔（图生图，可选）' },
```

- [ ] **Step 4: 校验**

```bash
node --check ~/.opencli/clis/zovii/generate-image.js && opencli validate zovii && opencli zovii generate-image --help -f yaml 2>&1 | grep -A1 image-input
```

Expected: `node --check` 无输出；`validate` 通过；help 中 `image-input` 文案已含「或本地路径」。

- [ ] **Step 5: 提交**

```bash
git -C ~/.opencli/clis/zovii add -A
git -C ~/.opencli/clis/zovii commit -m "feat: generate-image 的 --image-input 支持本地路径自动上传" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected: 提交成功。

---

## Task 10: 扩展 generate-video 支持首尾帧与参考素材

**Files:**
- Modify: `~/.opencli/clis/zovii/generate-video.js`（整文件替换）

- [ ] **Step 1: 整文件替换**

把 `~/.opencli/clis/zovii/generate-video.js` 全部内容替换为：

```js
// zovii AI 生视频 —— 提交 ai_video 任务，支持文生视频 / 首尾帧 / 参考图·视频·音频生视频。
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import {
  HOST,
  readToken,
  resolveAssetRef,
  resolveAssetRefs,
  createTask,
  pollTask,
  resolveAssets,
  toRows,
} from './utils.js';

const TOOL_ID = 'ai_video';
const SUB_FEATURE = 'video_generation';
const DEFAULT_MODEL = 'doubao-seedance-2-0-260128';
const MODELS = [
  'doubao-seedance-2-0-260128',
  'doubao-seedance-2-0-fast-260128',
  'doubao-seedance-1-5-pro-251215',
  'kling-o3',
  'ws-veo-3.1',
];

cli({
  site: 'zovii',
  name: 'generate-video',
  description: 'Zovii AI 生视频：文生视频 / 首尾帧 / 参考图·视频·音频生视频，等待并返回视频 URL',
  access: 'write',
  example: 'opencli zovii generate-video <project_id> --prompt "桃花飘落的庭院，电影运镜" --duration 8',
  domain: HOST,
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'project', type: 'string', required: true, positional: true, help: '项目 ID（studio URL 里的 UUID）' },
    { name: 'prompt', type: 'string', default: '', help: '提示词（无参考素材时必填）' },
    { name: 'model', type: 'string', default: DEFAULT_MODEL, help: `模型：${MODELS.join(' / ')}` },
    { name: 'ratio', type: 'string', default: '16:9', help: '画面比例：adaptive / 16:9 / 4:3 / 1:1 / 3:4 / 9:16 / 21:9' },
    { name: 'duration', type: 'string', default: '8', help: '时长（秒）：8 / 12（部分模型支持更长）' },
    { name: 'resolution', type: 'string', default: '720p', help: '分辨率：480p / 720p / 1080p' },
    { name: 'image-input', type: 'string', default: '', help: '首帧图 asset ID 或本地路径（图生视频，可选）' },
    { name: 'end-frame', type: 'string', default: '', help: '尾帧图 asset ID 或本地路径（首尾帧生视频，需配合 --image-input）' },
    { name: 'ref-image', type: 'string', default: '', help: '参考图 asset ID 或本地路径，多个用逗号分隔（可选）' },
    { name: 'ref-video', type: 'string', default: '', help: '参考视频 asset ID 或本地路径（可选）' },
    { name: 'ref-audio', type: 'string', default: '', help: '参考音频 asset ID 或本地路径，多个用逗号分隔（可选）' },
    { name: 'keep-original-audio', type: 'bool', default: false, help: '保留参考视频原声（仅 --ref-video 时有效）' },
    { name: 'audio', type: 'bool', default: true, help: '是否生成音频' },
    { name: 'timeout', type: 'int', default: 600, help: '等待生成完成的最长秒数' },
    { name: 'wait', type: 'bool', default: true, help: 'false 则提交后立即返回 task id，不等待结果' },
  ],
  columns: ['taskId', 'status', 'creditCost', 'assetId', 'assetName', 'assetType', 'fileUrl', 'thumbnailUrl', 'width', 'height', 'duration'],
  func: async (page, args) => {
    const prompt = String(args.prompt ?? '').trim();
    const imageRef = String(args['image-input'] ?? '').trim();
    const endFrameRef = String(args['end-frame'] ?? '').trim();
    const refVideoRef = String(args['ref-video'] ?? '').trim();
    const refImageRefs = String(args['ref-image'] ?? '').trim();
    const refAudioRefs = String(args['ref-audio'] ?? '').trim();

    const hasInput = imageRef || endFrameRef || refVideoRef || refImageRefs || refAudioRefs;
    if (!prompt && !hasInput) {
      throw new ArgumentError('--prompt 与参考素材（--image-input / --ref-* 等）至少提供一个');
    }
    if (endFrameRef && !imageRef) {
      throw new ArgumentError('--end-frame 需要同时提供 --image-input（首帧）');
    }

    const model = String(args.model ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    if (!MODELS.includes(model)) {
      throw new ArgumentError(`未知模型 "${model}"，可选：${MODELS.join(' / ')}`);
    }

    const timeoutSec = Number(args.timeout ?? 600);
    if (!Number.isInteger(timeoutSec) || timeoutSec <= 0) {
      throw new ArgumentError('--timeout 必须是正整数');
    }

    const wait = args.wait !== false && args.wait !== 'false';
    const generateAudio = args.audio !== false && args.audio !== 'false';
    const keepOriginalAudio =
      args['keep-original-audio'] === true || args['keep-original-audio'] === 'true';

    const token = await readToken(page);
    const projectId = String(args.project);

    const imageInput = imageRef
      ? await resolveAssetRef(page, token, projectId, imageRef, 'ai_video')
      : '';
    const endFrameInput = endFrameRef
      ? await resolveAssetRef(page, token, projectId, endFrameRef, 'ai_video')
      : '';
    const referenceVideoInput = refVideoRef
      ? await resolveAssetRef(page, token, projectId, refVideoRef, 'ai_video')
      : '';
    const referenceImageInputs = await resolveAssetRefs(page, token, projectId, refImageRefs, 'ai_video');
    const referenceAudioInputs = await resolveAssetRefs(page, token, projectId, refAudioRefs, 'ai_video');

    const payload = {
      project_id: projectId,
      tool_id: TOOL_ID,
      sub_feature_id: SUB_FEATURE,
      model_id: model,
      params: {
        prompt,
        model_id: model,
        ratio: String(args.ratio ?? '16:9'),
        duration: String(args.duration ?? '8'),
        resolution: String(args.resolution ?? '720p'),
        generate_audio: generateAudio,
        generation_count: 1,
        camera_fixed: false,
        shot_type: 'customize',
        image_input: imageInput,
        end_frame_input: endFrameInput,
        reference_image_inputs: referenceImageInputs,
        reference_video_input: referenceVideoInput,
        reference_audio_inputs: referenceAudioInputs,
        keep_original_audio: keepOriginalAudio,
      },
    };

    const task = await createTask(page, token, payload);
    if (!wait) return toRows(task, []);

    const done = await pollTask(page, token, task.id, { timeoutSec, label: 'zovii 生视频' });
    const assets = await resolveAssets(page, token, done.result_asset_ids || []);
    return toRows(done, assets);
  },
});
```

- [ ] **Step 2: 校验**

```bash
node --check ~/.opencli/clis/zovii/generate-video.js && opencli validate zovii && opencli zovii generate-video --help -f yaml 2>&1 | grep -E 'end-frame|ref-image|ref-video|ref-audio|keep-original-audio'
```

Expected: `node --check` 无输出；`validate` 通过；help 列出 `end-frame`、`ref-image`、`ref-video`、`ref-audio`、`keep-original-audio` 五个新选项。

- [ ] **Step 3: 校验参数依赖错误信息**

```bash
opencli zovii generate-video eaf8d90f-44ab-4870-942d-d97089e85eef --end-frame some-id 2>&1 | head -3
```

Expected: 报 `--end-frame 需要同时提供 --image-input（首帧）`（未触发任何网络请求）。

- [ ] **Step 4: 提交**

```bash
git -C ~/.opencli/clis/zovii add -A
git -C ~/.opencli/clis/zovii commit -m "feat: generate-video 支持首尾帧与参考图/视频/音频生视频" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected: 提交成功。

---

## Task 11: 全量校验与收尾

**Files:** 无（仅校验与清理）

- [ ] **Step 1: 全量校验**

```bash
opencli validate zovii
opencli zovii --help -f yaml 2>&1 | grep -E 'command_count|name:'
node --test ~/.opencli/clis/zovii/helpers.test.js
```

Expected: `validate` 通过；`command_count: 7`，命令含 `generate-image`、`generate-video`、`upload-asset`、`download-asset`、`list-assets`、`remove-background`、`upscale-video`；helpers 单测 6/6 通过。

- [ ] **Step 2: 清理实测产生的素材**

用 Task 4 Step 5 的上传 `assetId` 和 Task 7 Step 4 的移除背景结果 `assetId`，替换下面数组里的两个占位：

```bash
opencli browser zovii open "https://zovii.studio" >/dev/null 2>&1
opencli browser zovii eval "(async()=>{const t=JSON.parse(localStorage.getItem('auth-store')).state.accessToken;const ids=['<UPLOAD_ASSET_ID>','<RMBG_RESULT_ASSET_ID>'];const r=[];for(const id of ids){const x=await fetch('/api/v1/assets/'+id,{method:'DELETE',credentials:'include',headers:{Authorization:'Bearer '+t}});r.push(id+':'+x.status);}return r.join(', ');})()"
opencli browser zovii close
rm -f /tmp/zovii-test-upload.png /tmp/zovii-download-check.png
```

Expected: eval 返回两个 id 的删除状态（200/204）；临时文件已删除。

- [ ] **Step 3: 收尾提交**

```bash
git -C ~/.opencli/clis/zovii add -A
git -C ~/.opencli/clis/zovii commit --allow-empty -m "chore: zovii 适配器扩展完成，全量校验通过" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git -C ~/.opencli/clis/zovii log --oneline
```

Expected: 提交成功；`git log` 显示完整提交历史（基线 + 各功能 + 收尾）。

---

## Self-Review

**1. 规格覆盖（对照 spec 各节）**
- 上传素材 → Task 3（`uploadAsset`）+ Task 4（`upload-asset`）✓
- 下载素材 → Task 3（`downloadAsset`）+ Task 6（`download-asset`）✓
- 列出素材 → Task 3（`listAssets`）+ Task 5（`list-assets`）✓
- 图生图 / 本地路径自动上传 → Task 3（`resolveAssetRef(s)`）+ Task 9（generate-image）✓
- 首尾帧生视频 → Task 10（`--image-input` + `--end-frame`）✓
- 参考图/视频/音频生视频 → Task 10（`--ref-image` / `--ref-video` / `--ref-audio` / `--keep-original-audio`）✓
- 移除背景 → Task 7（`remove-background`）✓
- 视频高清放大 → Task 8（`upscale-video`）✓
- 80MB 软上限 → Task 3（`MAX_UPLOAD_BYTES`）✓
- git 版本控制（spec 未列但 spec §8 验证依赖、且适配器目录原本无 git）→ Task 1 ✓

**2. 占位符扫描：** 无 TBD/TODO；所有代码步骤含完整代码。Task 6/7/11 中 `<UPLOAD_ASSET_ID>` / `<RMBG_RESULT_ASSET_ID>` 是上游任务的运行时输出，已明确指明来源，非待补内容。

**3. 类型/命名一致性：** `resolveAssetRef` / `resolveAssetRefs` / `uploadAsset` / `getAsset` / `downloadAsset` / `listAssets` / `assetRow` 在 Task 3 定义，Task 4–10 引用拼写一致；`assetRow` 输出列与各命令 `columns` 一致；`looksLikeUuid` / `isLocalFilePath` / `guessMimeType` 在 Task 2 定义并被 Task 3 import。

**4. 已知风险（spec §7 已记录）：** 大文件 base64 经 CDP 传输有上限 → 80MB 软上限拦截；视频模型与模式兼容性 → 错误透传服务端，不做硬校验。
