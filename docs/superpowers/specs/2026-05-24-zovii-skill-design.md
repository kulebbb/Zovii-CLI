# zovii Skill 设计文档

- 日期：2026-05-24
- 范围：为 zovii CLI 创建一个发布到 skills.sh 的 AI agent skill
- 状态：已确认设计，待转实现计划

## 1. 目标

创建一个标准 SKILL.md 格式的 skill，发布到 skills.sh，让使用 Claude Code 或其他 AI agent 的开发者可以通过 `npx skills add <name>` 安装后，让 agent 完整掌握 zovii CLI 的使用方法。

## 2. Skill 基本信息

- **name**：`zovii`
- **description**：Use when the user wants to generate AI images or videos, manage assets, or work with Zovii Studio projects from the command line
- **发布平台**：skills.sh
- **文件位置**：`skills/zovii/SKILL.md`（当前 opencli 仓库内）

## 3. 整体结构（三层）

```
SKILL.md
├── 触发时机
├── 第一层：Setup 检查
│   ├── 检测安装状态
│   └── 检测登录状态
├── 第二层：命令参考（11 个命令）
│   ├── 每命令：用途 / 必填 / 所有选项含完整可选值 / 示例
│   └── Agent 决策规则
└── 第三层：常见工作流（4 条）
    ├── 工作流 1：生图
    ├── 工作流 2：生视频（3 个变体）
    ├── 工作流 3：素材管理
    └── 工作流 4：图像/视频处理
```

## 4. 触发时机

Agent 在以下情况应主动加载此 skill：
- 用户提到"zovii"、"生成图片"、"生成视频"、"AI 生图/生视频"
- 用户提到"上传素材"、"下载素材"、"项目素材"
- 用户要求"去除背景"、"视频放大"、"upscale"

## 5. 第一层：Setup 检查

每次使用 zovii 命令前，agent 必须先完成以下检查：

### 5.1 安装检测
```bash
which zovii
```
- 成功：继续
- 失败：执行 `npm install -g zovii`，等待完成后继续

### 5.2 登录检测
```bash
cat ~/.config/zovii/auth.json
```
- 文件存在且含 `access_token`：继续
- 不存在或为空：告知用户需要登录，请用户提供账号密码，执行 `zovii login <username> <password>`

## 6. 第二层：命令参考

### 6.1 Agent 全局决策规则

- **缺少项目 ID**：先运行 `zovii list-projects`，让用户从结果中选择
- **本地文件路径**：直接传路径，CLI 自动上传，无需手动 upload-asset
- **等待结果**：默认等待（不加 `--no-wait`），除非用户明确要求异步
- **输出格式**：默认 table；用户要程序消费时加 `-f json`
- **超时**：生图默认 300s，生视频默认 600s；长任务可加大 `--timeout`

### 6.2 所有命令

#### `zovii login <username> <password>`
- 用途：账号密码登录，token 自动保存到 `~/.config/zovii/auth.json`
- 输出列：username, credits_balance, expires_at

#### `zovii logout`
- 用途：清除本地 token

#### `zovii list-projects`
- 用途：列出当前账号所有项目
- 输出列：projectId, projectName, createdAt, updatedAt

#### `zovii create-project <name>`
- 用途：新建项目，返回 project ID
- 输出列：projectId, projectName, createdAt

#### `zovii list-assets <project>`
- 用途：列出项目素材
- 选项：
  - `--type`：过滤类型，可选值：`image` / `video` / `audio`
  - `--limit`：最多返回条数，默认 100
- 输出列：assetId, assetName, assetType, fileUrl, width, height, duration

#### `zovii upload-asset <project> <file>`
- 用途：上传本地文件为项目 asset
- 选项：
  - `--tool-type`：用途标记（可选），影响服务端处理方式
- 文件大小上限：80MB
- 输出列：assetId, assetName, assetType, fileUrl

#### `zovii download-asset <asset>`
- 用途：下载 asset 文件到本地
- 选项：
  - `--out <path>`：指定保存路径，默认用素材文件名存当前目录
- 输出列：assetId, assetName, localPath, bytes

#### `zovii generate-image <project>`
- 用途：AI 文生图 / 图生图
- 必填：`--prompt <text>`
- 选项：
  - `--model`：默认 `ws-nano-banana-2-fast`
    可选值：`ws-nano-banana-2-fast` / `ws-nano-banana-2` / `ws-nano-banana-pro` / `ws-nano-banana-pro-ultra` / `doubao-seedream-4-5-251128` / `doubao-seedream-5-0-260128` / `midjourney-fast` / `ws-gpt-image-2`
  - `--aspect-ratio`：默认 `1:1`，可选：`1:1` / `2:3` / `3:2` / `3:4` / `4:3` / `4:5` / `5:4` / `9:16` / `16:9` / `21:9`
  - `--size`：默认 `2K`，可选：`2K` / `4K`
  - `--count`：生成数量，默认 1，范围 1-20
  - `--image-input`：参考图（asset ID 或本地路径，多个逗号分隔）
  - `--timeout`：超时秒数，默认 300
  - `--no-wait`：提交后不等待
- 输出列：taskId, status, creditCost, assetId, fileUrl, width, height

#### `zovii generate-video <project>`
- 用途：AI 生视频（文生视频 / 首尾帧 / 参考素材）
- 选项：
  - `--prompt`：提示词，默认空（可与参考素材组合使用）
  - `--model`：默认 `doubao-seedance-2-0-260128`
    可选值：`doubao-seedance-2-0-260128` / `doubao-seedance-2-0-fast-260128` / `doubao-seedance-1-5-pro-251215` / `kling-o3` / `ws-veo-3.1`
  - `--ratio`：画面比例，默认 `16:9`，可选：`16:9` / `9:16` / `1:1` / `4:3` / `3:4` / `21:9`
  - `--duration`：时长，默认 `8`，可选：`8` / `12`
  - `--resolution`：分辨率，默认 `720p`，可选：`480p` / `720p` / `1080p`
  - `--image-input`：首帧图（asset ID 或本地路径）
  - `--end-frame`：尾帧图（需同时提供 `--image-input`）
  - `--ref-image`：参考图，多个逗号分隔
  - `--ref-video`：参考视频（asset ID 或本地路径）
  - `--ref-audio`：参考音频，多个逗号分隔
  - `--keep-original-audio`：保留参考视频原声（仅 `--ref-video` 时有效）
  - `--no-audio`：不生成音频
  - `--timeout`：超时秒数，默认 600
  - `--no-wait`：提交后不等待
- 输出列：taskId, status, creditCost, assetId, fileUrl, duration

#### `zovii remove-background <project> <image>`
- 用途：图片去除背景，返回透明背景图片
- `<image>` 接受：asset ID 或本地文件路径
- 选项：
  - `--timeout`：超时秒数，默认 300
  - `--no-wait`：提交后不等待
- 输出列：taskId, status, creditCost, assetId, fileUrl

#### `zovii upscale-video <project> <video>`
- 用途：视频高清放大
- `<video>` 接受：asset ID 或本地文件路径
- 选项：
  - `--resolution`：目标分辨率，默认 `1080p`，可选：`1080p` / `2k` / `4k`
  - `--duration`：处理时长（秒），默认 `0`（整段）
  - `--timeout`：超时秒数，默认 600
  - `--no-wait`：提交后不等待
- 输出列：taskId, status, creditCost, assetId, fileUrl

## 7. 第三层：常见工作流

### 工作流 1：生成图片

```
1. 确认项目 → 没有则 zovii list-projects，让用户选择
2. 收集必填参数：prompt
3. 询问（可选）：模型偏好、比例、数量、是否有参考图
4. 执行 zovii generate-image <project> --prompt "..." [其他选项]
5. 等待完成，展示 fileUrl
6. 询问是否下载 → 是则 zovii download-asset <assetId>
```

### 工作流 2：生成视频

根据用户描述选择变体：

**变体 A：纯文生视频**（用户只给 prompt）
```
1. 确认项目
2. 收集：prompt、ratio、duration、model
3. 执行 zovii generate-video <project> --prompt "..."
```

**变体 B：首尾帧视频**（用户提供首帧或首尾帧图片）
```
1. 确认项目
2. 收集首帧（--image-input），询问是否有尾帧（--end-frame）
3. 收集：prompt（可选）、ratio、duration
4. 执行 zovii generate-video <project> --image-input <ref> [--end-frame <ref>]
```

**变体 C：参考素材视频**（用户提供参考图/视频/音频）
```
1. 确认项目
2. 识别参考类型：图片（--ref-image）/ 视频（--ref-video）/ 音频（--ref-audio）
3. 询问是否需要 prompt 补充描述
4. 执行 zovii generate-video <project> --ref-* <ref> [--prompt "..."]
```

所有变体最后：等待完成 → 展示 fileUrl → 询问是否下载

### 工作流 3：素材管理

```
查看素材：zovii list-assets <project> [--type image/video/audio] [--limit n]
上传素材：zovii upload-asset <project> <本地路径>
下载素材：zovii download-asset <assetId> [--out <保存路径>]
```

Agent 注意：
- 用户说"帮我上传 xxx 文件"→ 直接 upload-asset，不需要先 list
- 用户说"帮我下载刚生成的图"→ 从上一步输出中取 assetId，直接 download-asset

### 工作流 4：图像/视频处理

**去除背景**
```
1. 确认项目
2. 用户提供图片（本地路径或 asset ID）
3. 执行 zovii remove-background <project> <image>
4. 等待完成 → 展示透明背景图 fileUrl → 询问是否下载
```

**视频放大**
```
1. 确认项目
2. 用户提供视频（本地路径或 asset ID）
3. 询问目标分辨率（1080p / 2k / 4k）
4. 执行 zovii upscale-video <project> <video> --resolution <res>
5. 等待完成 → 展示 fileUrl → 询问是否下载
```

## 8. 不在本次范围

- 多语言版本（只做中英混合，命令全英文）
- 批量操作工作流
- 错误恢复自动重试逻辑（agent 遇错按错误信息提示用户即可）
