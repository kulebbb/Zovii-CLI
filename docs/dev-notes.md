# zovii 开发笔记 — 历史坑

记录已修复但容易回退的代码级问题，发版/重构前对照检查。

## 1. `package.json` 的 `bin` 字段不要加 `./` 前缀

- ❌ `"zovii": "./bin/zovii.js"` → `npm publish --dry-run` 会报 `"bin[zovii]" script name ... was invalid and removed`，发出去用户装完**没有 zovii 命令**
- ✅ `"zovii": "bin/zovii.js"`

发版时跑 `npm publish --dry-run` 看 warning 即可发现回退。

## 2. `bin/zovii.js` 的 `.version()` 必须动态读 `package.json`

v0.3.1 起的正确实现（参考 `bin/zovii.js` 顶部）：

```js
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
program.version(pkg.version);
```

❌ 不要回退到硬编码 `.version('0.x.y')` —— 每次 bump 都得改两处，必忘。

## 3. 用户报"装了新版但 `zovii --version` 还是旧版"

```bash
cat $(npm root -g)/zovii/package.json | grep version
```

- 实际装的是新版 → CLI 源码硬编码了旧版本号（见 #2）
- 实际装的是旧版 → npm 本地缓存了旧 tarball：
  ```bash
  npm cache clean --force && npm install -g zovii@latest
  ```
