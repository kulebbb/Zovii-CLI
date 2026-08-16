import { getToken as realGetToken } from '../token.js';
import {
  resolveAssetRefs as realResolveAssetRefs,
  createTask as realCreateTask,
  createBatchTasks as realCreateBatchTasks,
  pollTask as realPollTask,
  pollTasks as realPollTasks,
  resolveAssets as realResolveAssets,
  toRows,
} from '../utils.js';
import {
  getToolsConfig as realGetToolsConfig,
  findTool,
  findModel,
  getDefaultModel,
  resolveFields,
  createParams,
  estimateTotal,
} from '../tools-config.js';
import { printOutput, handleError } from '../output.js';
import { ArgumentError } from '../errors.js';

const COLUMNS = ['taskId', 'status', 'creditCost', 'assetId', 'assetName', 'assetType', 'fileUrl', 'thumbnailUrl', 'width', 'height', 'duration'];
const TOOL_ID = 'ai_image';
const SUB_FEATURE_ID = 'image_generation';

const realDeps = {
  getToolsConfig: realGetToolsConfig,
  getToken: realGetToken,
  resolveAssetRefs: realResolveAssetRefs,
  createTask: realCreateTask,
  createBatchTasks: realCreateBatchTasks,
  pollTask: realPollTask,
  pollTasks: realPollTasks,
  resolveAssets: realResolveAssets,
};

function splitRefs(csv) {
  return String(csv ?? '').split(',').map((x) => x.trim()).filter(Boolean);
}

export function register(program, deps = realDeps) {
  program
    .command('generate-image <project>')
    .description('AI 生图：文生图 / 图生图，等待并返回图片 URL')
    .option('--prompt <text>', '提示词（必填）')
    .option('--model <model>', '模型 id（缺省用产品默认模型），运行 zovii list-models ai_image 查看')
    .option('--aspect-ratio <ratio>', '宽高比（缺省用模型默认值），取值见 zovii list-models ai_image')
    .option('--size <size>', '分辨率（缺省用模型默认值），取值见 zovii list-models ai_image')
    .option('--quality <quality>', '画质（仅部分模型支持），取值见 zovii list-models ai_image')
    .option('--count <n>', '生成数量 1-20', '1')
    .option('--image-input <refs>', '参考图 asset ID 或本地路径，多个逗号分隔（可选）', '')
    .option('--timeout <s>', '超时秒数', '300')
    .option('--no-wait', '提交后立即返回 task id，不等待结果')
    .action(async (project, opts) => {
      const fmt = program.opts().format;
      try {
        const prompt = String(opts.prompt ?? '').trim();
        if (!prompt) throw new ArgumentError('--prompt 不能为空');

        const count = parseInt(opts.count, 10);
        if (!Number.isInteger(count) || count < 1 || count > 20) {
          throw new ArgumentError('--count 必须是 1-20 的整数');
        }
        const timeoutSec = parseInt(opts.timeout, 10);
        if (!Number.isInteger(timeoutSec) || timeoutSec <= 0) {
          throw new ArgumentError('--timeout 必须是正整数');
        }

        const tools = await deps.getToolsConfig();
        const tool = findTool(tools, TOOL_ID);
        const model = opts.model ? findModel(tool, opts.model) : getDefaultModel(tool);
        const fields = resolveFields(tool, SUB_FEATURE_ID, model.id);

        const builder = createParams(model, fields);
        builder.option('aspect_ratio', opts.aspectRatio, '--aspect-ratio');
        // 分辨率字段名随模型而异：image_size 或 size，只发其中存在的那一个
        builder.option(fields.has('image_size') ? 'image_size' : 'size', opts.size, '--size');
        builder.option('quality', opts.quality, '--quality');
        // 先按 schema 校验参考图数量，再上传，避免白传
        const refs = splitRefs(opts.imageInput);
        builder.input('image_input', refs, '--image-input');

        const token = await deps.getToken();
        if (refs.length) {
          builder.params.image_input =
            await deps.resolveAssetRefs(token, project, opts.imageInput, TOOL_ID);
        }
        const sharedParams = builder.params;

        const estimated = estimateTotal(tool, SUB_FEATURE_ID, model, sharedParams, count);
        if (estimated !== null) {
          process.stderr.write(`预估消耗 ${estimated} 积分（以实际账单为准）\n`);
        }

        if (count === 1) {
          // 单张：走 POST /tasks
          const payload = {
            project_id: project,
            tool_id: TOOL_ID,
            sub_feature_id: SUB_FEATURE_ID,
            model_id: model.id,
            params: { prompt, ...sharedParams },
          };
          const task = await deps.createTask(token, payload);
          if (!opts.wait) {
            printOutput(toRows(task, []), COLUMNS, fmt);
            return;
          }
          const done = await deps.pollTask(token, task.id, { timeoutSec, label: 'zovii 生图' });
          const assets = await deps.resolveAssets(token, done.result_asset_ids || []);
          printOutput(toRows(done, assets), COLUMNS, fmt);
          return;
        }

        // 多张：走 POST /tasks/batch，mode=multi_variation 给每个 task 注入随机 seed
        const payload = {
          project_id: project,
          tool_id: TOOL_ID,
          sub_feature_id: SUB_FEATURE_ID,
          model_id: model.id,
          mode: 'multi_variation',
          prompts: [prompt],
          count,
          shared_params: sharedParams,
        };
        const batch = await deps.createBatchTasks(token, payload);
        if (!opts.wait) {
          const rows = batch.tasks.flatMap((t) => toRows(t, []));
          printOutput(rows, COLUMNS, fmt);
          return;
        }
        const taskIds = batch.tasks.map((t) => t.id);
        const dones = await deps.pollTasks(token, taskIds, { timeoutSec, label: 'zovii 批量生图' });
        const allRows = [];
        for (const done of dones) {
          const assets = await deps.resolveAssets(token, done.result_asset_ids || []);
          allRows.push(...toRows(done, assets));
        }
        printOutput(allRows, COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
