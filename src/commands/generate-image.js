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

const realDeps = {
  getToken: realGetToken,
  resolveAssetRefs: realResolveAssetRefs,
  createTask: realCreateTask,
  createBatchTasks: realCreateBatchTasks,
  pollTask: realPollTask,
  pollTasks: realPollTasks,
  resolveAssets: realResolveAssets,
};

export function register(program, deps = realDeps) {
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
        const SIZES = ['2K', '4K'];
        if (!SIZES.includes(opts.size)) {
          throw new ArgumentError(`--size 只能是 ${SIZES.join(' / ')}`);
        }
        const timeoutSec = parseInt(opts.timeout, 10);
        if (!Number.isInteger(timeoutSec) || timeoutSec <= 0) {
          throw new ArgumentError('--timeout 必须是正整数');
        }

        const token = await deps.getToken();
        const imageInput = await deps.resolveAssetRefs(token, project, opts.imageInput, 'ai_image');
        const sharedParams = {
          aspect_ratio: opts.aspectRatio,
          image_size: opts.size,
          quality: 'medium',
          image_input: imageInput,
        };

        if (count === 1) {
          // 单张：走 POST /tasks
          const payload = {
            project_id: project,
            tool_id: 'ai_image',
            sub_feature_id: 'image_generation',
            model_id: model,
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
          tool_id: 'ai_image',
          sub_feature_id: 'image_generation',
          model_id: model,
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
