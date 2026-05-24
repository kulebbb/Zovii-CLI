# zovii 适配器功能扩展 — 设计文档

- 日期：2026-05-22
- 范围：opencli 自定义站点适配器 `~/.opencli/clis/zovii/`
- 状态：已与用户确认，待转实现计划

## 1. 目标

在现有 zovii 适配器（`generate-image` / `generate-video`）基础上新增以下能力：

1. 上传 / 下载素材
2. 图生图（已由 `generate-image --image-input` 支持，本次仅补充本地路径自动上传）
3. 首尾帧生视频
4. 参考图 / 参考视频 / 参考音频生视频
5. 图片移除背景
6. 视频高清放大

## 2. 已确认的真实接口

来源：`GET /api/v1/tools` 工具目录 + 前端 JS bundle（`index-COlYAcvW.js`、`index-DKlRKAL-.js`）静态分析。**未经猜测，未消耗积分。**

- API base：`/api/v1`
- 鉴权：`Authorization: Bearer <accessToken>`；token 在页面 `localStorage["auth-store"]` 的 `state.accessToken`（已有 `readToken()`）

### 素材服务

| 操作 | 接口 |
|---|---|
| 列出 | `GET /projects/{pid}/assets?limit=500&offset=N`，分页 500/页 |
| 上传 | `POST /projects/{pid}/assets/upload[?tool_type=X]`，multipart/form-data，字段名 `file`，返回 asset 对象 |
| 详情 | `GET /assets/{id}` |
| 下载 | `GET /assets/{id}/download`（带 Bearer）；asset 对象也含 `file_url` |

### 任务服务

`POST /tasks`，body `{project_id, tool_id, sub_feature_id, model_id, params}`；轮询 `GET /tasks/{id}` 直到 `completed/failed/dismissed`（已有 `createTask()` / `pollTask()`）。

### 移除背景（隐藏工具，不在 /tools 目录）

```
tool_id: "remove_bg"
sub_feature_id: "remove_bg"
model_id: "wavespeed-rmbg"
params: { image_url: <asset.file_url>, source_asset_id: <asset.id> }
```

### 视频高清放大（/tools 目录工具 video_upscale）

```
tool_id: "video_upscale"
sub_feature_id: "video_upscale"
model_id: "wavespeed-video-upscaler"
params: { video_input: <video asset id>, target_resolution: "1080p"|"2k"|"4k", duration: <number, 0=整段> }
```

- 计费矩阵（每 5 秒）：1080p=7、2k=11、4k=17 积分
- 约束：视频 ≤ 10 分钟、仅 MP4/MOV、≤ 500MB

### 视频生成新模式字段（ai_video / video_generation 的 params key）

| params key | 类型 | 含义 |
|---|---|---|
| `image_input` | 单个 asset id | 首帧（已支持） |
| `end_frame_input` | 单个 asset id | 尾帧；需 `image_input` 同时存在 |
| `reference_image_inputs` | asset id 数组 | 参考图 |
| `reference_video_input` | 单个 asset id | 参考视频 |
| `reference_audio_inputs` | asset id 数组 | 参考音频 |
| `keep_original_audio` | bool | 保留参考视频原声；仅在有参考视频时有效 |

模型差异（来自各模型 `field_overrides`，仅作 `--help` 文档说明，不做硬校验）：

- `doubao-seedance-2-0-260128` / `-fast`：支持参考视频/图/音频、首尾帧
- `doubao-seedance-1-5-pro-251215`：不支持参考视频、参考图
- `kling-o3`：基础模式
- `ws-veo-3.1`：不支持参考视频；参考图最多 3 张

## 3. 命令规格

改动全部位于 `~/.opencli/clis/zovii/`。

### 3.1 新增命令

#### `upload-asset <project> <file>`
- access: write（产生素材，但不耗积分）
- 位置参数：`project`（项目 UUID）、`file`（本地文件路径）
- 选项：`--tool-type <str>`（可选，透传 upload 的 `tool_type` query）
- 行为：读取本地文件 → 上传 → 输出 asset
- 输出列：`assetId, assetName, assetType, fileUrl, thumbnailUrl, width, height, duration`

#### `download-asset <project> <asset>`
- access: read
- 位置参数：`project`、`asset`（asset id）
- 选项：`--out <path>`（保存路径，缺省用 asset 文件名存当前目录）
- 行为：`GET /assets/{id}` 取 `file_url` → 下载写盘
- 输出列：`assetId, assetName, assetType, localPath, bytes`

#### `list-assets <project>`
- access: read
- 位置参数：`project`
- 选项：`--type <image|video|audio>`（可选过滤）、`--limit <int>`（默认 100）
- 行为：分页拉取项目素材
- 输出列：`assetId, assetName, assetType, fileUrl, thumbnailUrl, width, height, duration`

#### `remove-background <project> <image>`
- access: write
- 位置参数：`project`、`image`（asset id 或本地图片路径）
- 选项：`--timeout <int>`（默认 300）、`--wait <bool>`（默认 true）
- 行为：解析 image → 取 asset 详情拿 `file_url` 与 `id` → 创建 `remove_bg` 任务 → 轮询 → 返回结果
- 输出列：同 generate（`taskId, status, creditCost, assetId, assetName, assetType, fileUrl, thumbnailUrl, width, height, duration`）

#### `upscale-video <project> <video>`
- access: write
- 位置参数：`project`、`video`（asset id 或本地视频路径）
- 选项：`--resolution <1080p|2k|4k>`（默认 1080p）、`--duration <int>`（默认 0=整段）、`--timeout <int>`（默认 600）、`--wait <bool>`（默认 true）
- 行为：解析 video → 创建 `video_upscale` 任务 → 轮询 → 返回结果
- 输出列：同 generate

### 3.2 扩展现有命令

#### `generate-video` 新增选项
- `--end-frame <id|path>` → params `end_frame_input`（需配合 `--image-input`，否则抛 `ArgumentError`）
- `--ref-image <id|path,...>` → params `reference_image_inputs`（逗号分隔）
- `--ref-video <id|path>` → params `reference_video_input`
- `--ref-audio <id|path,...>` → params `reference_audio_inputs`（逗号分隔）
- `--keep-original-audio <bool>` → params `keep_original_audio`（默认 false）

#### `generate-image` / `generate-video` 既有素材入参
- `--image-input` 等所有 asset 入参，值若为「本地存在的文件路径」则自动上传换成 asset id，否则当 asset id 透传。

## 4. 架构（方案 A：薄命令 + utils.js 统一资源解析）

### utils.js 新增导出

- `uploadAsset(page, token, projectId, filePath, toolType?)` → 返回 asset 对象
- `resolveAssetRef(page, token, projectId, ref, toolType?)` → ref 是本地存在文件则 `uploadAsset` 返回新 id；否则原样返回（视为 asset id）
- `resolveAssetRefs(page, token, projectId, refsCsv, toolType?)` → 逗号分隔批量版，返回 id 数组
- `getAsset(page, token, assetId)` → `GET /assets/{id}`
- `downloadAsset(page, token, asset, outPath)` → 取 file_url 写盘，返回 `{localPath, bytes}`
- `listAssets(page, token, projectId, {type, limit})` → 分页拉取

所有 generate / remove-background / upscale-video 的素材入参统一经 `resolveAssetRef(s)`，上传逻辑只此一份。

### 判定「本地路径 vs asset id」

asset id 是 UUID 格式。判定规则：先看字符串是否为 UUID 形态；非 UUID 且 `fs.existsSync()` 为真 → 当本地文件上传；否则当 asset id 透传（错误 id 由服务端 404 反馈）。

## 5. 上传机制（Node → 浏览器）

适配器 `func` 运行在 Node，文件字节在 Node 侧；`page.evaluate` 在浏览器侧执行。流程：

1. Node `fs.readFile` 读文件 → base64
2. 用「字符串 IIFE + 函数参数注入」（沿用 utils.js 已有反全局污染写法）把 `{url, token, fileB64, fileName, mimeType}` 传入页面
3. 页面内：base64 → `Uint8Array` → `Blob` → `File` → `FormData.append('file', file)` → `fetch(url, {method:'POST', credentials:'include', headers:{Authorization}, body: formData})`
4. 返回 asset JSON

mimeType 由扩展名推断（png/jpg/jpeg/webp/gif、mp4/mov、mp3/wav）。

## 6. 校验规则（轻量，服务端为准）

- `upload-asset` / `remove-background` / `upscale-video` / `--end-frame` 等：本地路径不存在且非 UUID 形态 → `ArgumentError`
- `--end-frame` 无 `--image-input` → `ArgumentError`
- 文件 > 80MB → 抛错并提示「改用网页上传后传 asset id」
- `upscale-video --resolution` 限 `1080p/2k/4k`
- 模型 / 模式组合不做硬校验，错误透传服务端响应

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| base64 经 CDP 传大文件可能失败 | 软上限 80MB；图片(<10MB)无忧；实现时先验证 opencli 原生 `browser upload`（CDP setFileInputFiles）能否走通，能则作大文件优选路径 |
| 模型不支持某模式 | `--help` 标注差异；错误透传 |
| 移除背景为隐藏工具，接口可能变动 | 已从 JS 取得确切 payload；实跑一次验证 |

## 8. 验证

- `opencli zovii verify` / `opencli validate zovii` 静态校验命令定义
- `opencli zovii <cmd> --help -f yaml` 检查参数结构
- 实跑：一次 `upload-asset`（免费）+ 一次 `remove-background`（少量积分，已授权）做端到端验证

## 9. 不在本次范围（YAGNI）

- 批量图片生成（`batch_text_to_image`）
- 产品文字修复（`detail_migration`）
- 提示词反推（`prompt_reverse`）
- 素材删除 / 复制 / 重命名
