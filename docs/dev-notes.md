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

## 4. 模型配置运行时拉取

生图 / 生视频命令不再内置模型白名单和参数枚举，全部来自 `GET https://zovii.studio/api/v1/tools`：

- 实现：`src/tools-config.js`（`getToolsConfig` / `findTool` / `findModel` / `getDefaultModel` / `resolveFields` / `matchOption` / `createParams` / `estimateCost` / `estimateTotal`）
- 缓存路径：`~/.config/zovii/tools-cache.json`，结构 `{ fetched_at, tools }`
- TTL：1 小时；`zovii list-models --refresh` 强制刷新；拉取失败且有缓存时降级用缓存并在 stderr 提示
- 参数解析口径：模型 `sub_feature_form_schemas` 优先，再用 `field_overrides` 浅覆盖（与产品前端一致）。字段 `visible === false` 或不存在时用户显式传参 → 报错；用户不传则回填 `default`（`null` 则不下发）
- 分辨率字段名随模型而异（`image_size` 或 `size`），只能发存在的那一个，否则 seedream 的 4K 会被静默降级
- 行为变更：生图默认分辨率现在随产品默认走（当前默认模型 `ws-nano-banana-pro` 的默认值是 `1k`），旧版本 CLI 固定发 2K。用户想要 2K 必须显式传 `--size 2k`；改动前先确认这条不会被误当成回归

测试全部走本地快照，不联网。更新快照：

```bash
curl https://zovii.studio/api/v1/tools > test/fixtures/tools.json
```

更新后跑 `npm test`：若断言（默认模型、枚举取值、预估积分）失败，说明产品配置有变，按新配置调整测试而不是改回硬编码。
