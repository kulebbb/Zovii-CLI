---
name: xhs-image-set
description: 小红书组图生成：从飞书电子表格读取笔记标题和正文，拆解成 1 张封面 + n 张副图的提示词（总数 ≤18），按预设风格或参考图风格用 zovii CLI 生成组图（副图以封面为参考图保持风格一致），并把图片逐格回写到表格对应行后的空列。Use when 用户提到"小红书组图"、"组图生成"、"笔记配图"、"封面图加副图"、"从飞书表格生成小红书图片"。
---

# xhs-image-set — 小红书组图生成

飞书表格（标题+正文）→ 拆解提示词 → zovii 生成组图（封面定风格，副图跟随）→ 图片回写表格。

## 依赖与前置（每次必查）

1. **zovii**：按 zovii skill 的 Layer 1 检查——`which zovii`（缺则 `npm install -g zovii`）；`cat ~/.config/zovii/auth.json` 有 `access_token`（缺则引导 `zovii login`）
2. **lark-cli**：`which lark-cli`；认证与权限处理先读 `~/.claude/skills/lark-shared/SKILL.md`
3. **zovii project**：用户未指定 → `zovii list-projects` 列出让用户选

## 全局决策规则

- 默认：模型 `ws-gpt-image-2`、比例 `3:4`；仅在首行确认卡让用户确认/修改一次，之后全程沿用
- 组图总数 = 1 封面 + n 副图，**n ≤ 17**（小红书单篇 ≤18 张）
- **仅首行交互**（风格选择、确认卡、封面确认）；批量时后续行全自动复用配置
- 风格库按需读取 `references/styles.md`（本 skill 目录下），不要凭记忆编风格
- 生图失败/超时：**先 `zovii list-assets <projectId> --limit 5` 查任务是否实际已完成**——客户端报错/超时的任务常在服务端照常完成并扣费，有新资产就直接复用其 assetId，别盲目重生成（重复扣费）；确实没有 → 自动重试 1 次，仍失败 → 跳过该张，记入最终报告（副图适用；**封面**仍失败 → 该行整行跳过记报告，若是首行则停下询问用户）
- `download-asset` / `+cells-set-image` 失败 → 重试 1 次；仍失败 → 保留 `temp/xhs-image-set/row<行号>/` 本地文件，报告中给出本地路径与未写入格位
- 行缺标题或正文 → 跳过该行，记入报告
- zovii 报 credit 不足 → 立即终止，汇报已完成进度和已回写的行
- 中间文件统一放 `temp/xhs-image-set/`（已 gitignore）

## Phase 1 读表

1. 用户提供飞书电子表格链接 `<URL>`（`?sheet=` 参数即子表 id）。**若是 wiki 链接**（`/wiki/<token>`），sheets 命令不接受，先解析底层对象：`lark-cli wiki spaces get_node --params '{"token":"<wiki_token>"}' --as user` → 确认 `obj_type` 为 `sheet`，取 `obj_token`，后续 `<URL>` 用 `https://<同域名>/sheets/<obj_token>`
2. `lark-cli sheets +workbook-info --url "<URL>"` → 确认目标子表 `sheet_id`（链接带 `?sheet=` 用之；否则用户未指明取第一个子表并告知）；顺手记录该子表的 `column_count`，换算出网格末列字母 `<末列>`（如 20→T、27→AA），后续读表与插列判断都用它
3. 读表头定位列：

```bash
lark-cli sheets +csv-get --url "<URL>" --sheet-id <sid> --range "A1:<末列>1" --rows-json
```

   - 标题列：表头含「标题 / 题目 / title」；正文列：表头含「正文 / 内容 / 文案 / body / content」；列字母直接取返回 `rows[].values` 的 key
   - 顺带识别**参考图列**（表头含「参考图 / 风格图 / reference」）与**产品图列**（表头含「产品图 / 素材图 / product」）：注意单元格图片在 `+csv-get` 里读出来是**空值**，列空不代表没图，Phase 2.2 用 `+cells-get` 确认
   - 任一列识别不到 → 把表头列出来问用户哪列是标题、哪列是正文
4. 问用户处理行范围（如"第 2 行"/"2-6 行"/"全部数据行"）。"全部数据行"的边界以上一步返回的 `current_region` 为准（它是实际数据区域，**不要**用子表 `row_count`——那是网格物理行数）；再读 `current_region` 末尾几行排除汇总/签名等非数据行，得到真实末行
5. 读数据行（JSON 行模式，**禁止解析裸 CSV 判断列位**——正文含逗号/换行时目测判列必错位）：

```bash
lark-cli sheets +csv-get --url "<URL>" --sheet-id <sid> --range "A<起>:<末列><止>" --rows-json
```

   逐行从返回 `rows` 取：行号 = `row_number`；标题/正文 = `values` 中对应列字母的值；**该行最后一个非空列** = `values` 映射中最大的列字母。若返回 `data_not_fully_read`，按其 `reread_range` 重读补全
6. 起始写入列 = **「该行最后非空列」与「表头行最后非空列」取较大者**的下一列（列字母顺延：D→E，Z→AA）——表头可能定义了该行恰好为空的输入列（如「参考图」列），不可写入覆盖。回写前用 Phase 1.2 记录的 `column_count` 判断：若「起始列序号 + 本行图片数 - 1」超出现有列数，先在表尾插足够的列（表尾追加 = 在"现末列+1"位置插入，`--position` 列场景传字母、新列插在该位置之前）：

```bash
lark-cli sheets +dim-insert --url "<URL>" --sheet-id <sid> --position <现末列+1的列字母> --count <缺口列数>
```

## Phase 2 拆解与风格（仅首行交互）

1. 理解标题与正文，拆解：
   - **封面**：主文案（≤12 字，从标题提炼、保留钩子词）+ 副文案（≤20 字，可空）+ 高亮词（主文案中 1 个）；若所选风格骨架含 {目录预览}，确认卡的封面文案行需一并列出目录预览内容
   - **副图**：正文拆成 n 个独立要点，每个要点 = 要点标题（≤10 字）+ 要点内容（1-3 条短句）；**用户给了期望张数 → 严格按期望数拆**（要点合并/拆分到正好 n 条）；未给 → n 取内容自然要点数；上限均为 17
2. 问用户（一轮问齐四件事）：①**是否有风格参考图**？②**是否有产品图/必现素材**（画面中必须出现的产品或物件）？③**副图张数有无期望**（默认按内容拆解）？④**有无额外诉求**（突出卖点 / 画面氛围 / 文案语气等，自由描述）
   **风格参考图**分支：
   - 表格有参考图列（用户答"在表里"或 Phase 1 已识别）→ 读单元格图片：

```bash
lark-cli sheets +cells-get --url "<URL>" --sheet-id <sid> --range "<参考图列><起>:<参考图列><止>" --include value
```

   单元格图片在返回 `rich_text` 中 `type:"embed-image"`，取 `image_token` 下载（这是 media 资源，**不能**用 `drive +download`，会 403）：

```bash
lark-cli api GET "/open-apis/drive/v1/medias/<image_token>/download" --as user -o temp/xhs-image-set/ref-row<行号>.png
```

   每行有各自参考图时，逐行用**该行自己的参考图**生成该行封面
   - 有（本地/URL）→ 本地路径直接用；URL 先下载 `curl -L -o temp/xhs-image-set/ref.png "<url>"`
   - 以上两种都用 Read 工具看图，拆解出文案风格/背景/元素三变量；该图作对应封面生图的 `--image-input`
   - 无 → Read `references/styles.md`（风格库共 8 种），按其中「风格推荐规则」结合内容类型推荐 2-3 种（一句话说明为什么适合），用户选 1 种

   **产品图/必现素材**分支：产品图**不作风格拆解**，只作画面保真素材（生成时随图输入 + 提示词保真句）
   - 表格有产品图列 → 读法同参考图列（`+cells-get` 取 `image_token` → media 下载，存 `temp/xhs-image-set/prod-row<行号>.png`），每行用各自的
   - 本地路径 / URL → 全局沿用一张（URL 先 curl 下载到 `temp/xhs-image-set/prod.png`）
   - 无 → 跳过保真句与产品图输入

   **额外诉求**：转译成 1-3 条可入提示词的画面/文案要素（确认卡展示「原话 → 转译」，理解偏了由用户当场纠正）；诉求是全局级，批量时所有行沿用
3. 输出**确认卡**等用户确认/调整（调整后重新出卡；用户改张数 n → 按新 n 重新拆解要点，并同步 {目录预览} 后重新出卡）：

```
| 项 | 值 |
| 风格 | <风格名>（参考图模式填"参考图风格"） |
| 配色 | {背景色} / {高亮色}（按 styles.md 配色口诀与垂类映射定） |
| 模型 | ws-gpt-image-2（可换：见 zovii generate-image --model 取值） |
| 比例 | 3:4 |
| 张数 | 1 封面 + n 副图（标注 n 来源：用户期望 / 默认拆解） |
| 必现素材 | 产品图来源（表格列 / 本地 / 无）；每张图生成都随图输入 |
| 诉求理解 | 用户原话 → 转译后的提示词要素（无诉求填"—"） |
| 封面文案 | 主文案 / 副文案 / 高亮词 |
| 副图 1..n | 要点标题：要点内容摘要 |
```

## Phase 3 封面（首行需用户确认）

1. 取所选风格的**封面版骨架**，按该骨架实际出现的占位符填入（占位符填法、{副文案} 空值降级、{目录预览} 取各副图要点标题等规则见 styles.md 开头约定区），再按统一顺序追加：**诉求转译句（如有）→ 产品保真句（有产品图时）→ 负面清单句 → 统一尾句**
   - 参考图模式（无预设风格）：用 Phase 2 拆解出的文案风格/背景/元素三变量组装提示词，文案要素（{主文案} 等）照常填入，追加顺序同上
   - 产品保真句固定为："画面中必须出现与产品参考图完全一致的产品，包装、配色、文字细节保持不变，不得变形或虚构"
2. 生成（`--image-input` 支持逗号分隔多图；**有产品图就必须传**——预设风格模式下无参考图时单传产品图 `--image-input <产品图>`，参考图模式下两者同传）：

```bash
zovii generate-image <projectId> --prompt "<封面prompt>" --model <model> --aspect-ratio 3:4 [--image-input <风格参考图>[,<产品图>] | <产品图>]
```

3. 把 `fileUrl` 给用户看，等确认；不满意 → 按反馈改 prompt 或换风格，重新生成再确认
4. 记录封面 `assetId`

## Phase 4 副图（不逐张确认）

对每个要点 i = 1..n，取**副图版骨架**填入 {要点标题}/{要点内容}，提示词按统一顺序追加：诉求转译句（如有）→ 产品保真句（有产品图时）→ 负面清单句 → 统一尾句，逐张串行生成：

```bash
zovii generate-image <projectId> --prompt "<副图i prompt>" --model <model> --aspect-ratio 3:4 --image-input <封面assetId>[,<产品图>]
```

- **必带封面 assetId 作 `--image-input`**——这是组图风格一致性的关键，不可省略
- 有产品图时**每张副图都要同传产品图**——只靠封面中转会在 image-to-image 链路里发生产品细节漂移
- 记录每张的 assetId；失败重试 1 次，仍失败跳过并记录

## Phase 5 回写飞书

1. `mkdir -p temp/xhs-image-set/row<行号>`
2. 逐张下载（01 = 封面，02.. = 副图按序）：

```bash
zovii download-asset <assetId> --out temp/xhs-image-set/row<行号>/<序号>.png
```

3. 逐格写入，一图一单元格（`--range` 必须是单格）：

```bash
lark-cli sheets +cells-set-image --url "<URL>" --sheet-id <sid> --range "<列><行号>" --image temp/xhs-image-set/row<行号>/01.png
```

   封面写入起始列，副图依次写右侧相邻列。⚠️ `--image` 必须传**相对当前工作目录**的路径（lark-cli 安全约束，绝对路径会被拒，报 "must be a relative path within the current directory"）；在仓库根目录执行并传 `temp/xhs-image-set/...` 即可。
4. 报告该行：行号、写入列区间、成功图片数

## Phase 6 批量循环（多行时）

- 第 2 行起每行自动执行：拆解（Phase 2.1，不交互）→ 封面（Phase 3，不确认；该行参考图列有图 → 用该行自己的参考图作 `--image-input`）→ 副图（Phase 4，用**该行自己的封面**作参考）→ 回写（Phase 5）
- 风格、模型、比例、**诉求、副图张数期望、全局产品图**沿用首行确认结果；「产品图」列有图的行改用该行自己的产品图
- 单行失败不阻塞后续行
- 全部结束输出汇总：

```
| 行号 | 状态 | 图片数 | 备注 |
| 2 | ✅ 成功 | 1+5 | — |
| 3 | ⚠️ 部分 | 1+3（1 张生成失败） | 副图2 重试后仍超时 |
| 4 | ⏭️ 跳过 | — | 正文为空 |
```
