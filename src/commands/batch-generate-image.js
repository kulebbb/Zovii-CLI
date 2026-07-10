import { getToken as realGetToken } from '../token.js';
import {
  resolveAssetRefs as realResolveAssetRefs,
  createBatchTasks as realCreateBatchTasks,
  pollTasks as realPollTasks,
  resolveAssets as realResolveAssets,
  toRows,
} from '../utils.js';
import { printOutput, handleError } from '../output.js';
import { ArgumentError } from '../errors.js';

const COLUMNS = ['taskId', 'status', 'creditCost', 'assetId', 'assetName', 'assetType', 'fileUrl', 'thumbnailUrl', 'width', 'height', 'duration'];
// 与 zovii.studio「批量图像」工具（batch_image）web 表单可见模型一致
const MODELS = [
  'doubao-seedream-4-5-251128',
  'doubao-seedream-5-0-260128',
  'doubao-seedream-5-0-pro-260628',
  'midjourney-fast',
];
const DEFAULT_MODEL = 'doubao-seedream-4-5-251128';
const RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
const SIZES = ['2K', '4K'];
const MAX_PROMPTS = 20;
const MAX_IMAGE_INPUT = 10;

const realDeps = {
  getToken: realGetToken,
  resolveAssetRefs: realResolveAssetRefs,
  createBatchTasks: realCreateBatchTasks,
  pollTasks: realPollTasks,
  resolveAssets: realResolveAssets,
};

function collectPrompt(value, acc) {
  return acc.concat([value]);
}

export function register(program, deps = realDeps) {
  program
    .command('batch-generate-image <project>')
    .description('批量生图：多个不同 prompt 一次提交，每条生成 1 张')
    .option('--prompt <text>', `提示词，可重复传入 1-${MAX_PROMPTS} 条（必填）`, collectPrompt, [])
    .option('--model <model>', `模型：${MODELS.join(' / ')}`, DEFAULT_MODEL)
    .option('--aspect-ratio <ratio>', `宽高比：${RATIOS.join(' / ')}`, '1:1')
    .option('--size <size>', '分辨率：2K / 4K', '2K')
    .option('--image-input <refs>', `参考图 asset ID 或本地路径，逗号分隔，最多 ${MAX_IMAGE_INPUT} 张，所有 prompt 共用（可选）`, '')
    .option('--timeout <s>', '超时秒数', '300')
    .option('--no-wait', '提交后立即返回 task id，不等待结果')
    .action(async (project, opts) => {
      const fmt = program.opts().format;
      try {
        const prompts = (opts.prompt ?? []).map((p) => String(p).trim()).filter(Boolean);
        if (!prompts.length) throw new ArgumentError('--prompt 不能为空，至少传 1 条');
        if (prompts.length > MAX_PROMPTS) {
          throw new ArgumentError(`--prompt 最多 ${MAX_PROMPTS} 条（当前 ${prompts.length} 条）`);
        }
        if (!MODELS.includes(opts.model)) {
          throw new ArgumentError(`未知模型 "${opts.model}"，可选：${MODELS.join(' / ')}`);
        }
        if (!RATIOS.includes(opts.aspectRatio)) {
          throw new ArgumentError(`--aspect-ratio 只能是 ${RATIOS.join(' / ')}`);
        }
        if (!SIZES.includes(opts.size)) {
          throw new ArgumentError(`--size 只能是 ${SIZES.join(' / ')}`);
        }
        const timeoutSec = parseInt(opts.timeout, 10);
        if (!Number.isInteger(timeoutSec) || timeoutSec <= 0) {
          throw new ArgumentError('--timeout 必须是正整数');
        }
        // 在解析/上传之前先校验数量，避免白上传
        const refCount = String(opts.imageInput ?? '')
          .split(',').map((x) => x.trim()).filter(Boolean).length;
        if (refCount > MAX_IMAGE_INPUT) {
          throw new ArgumentError(`--image-input 最多 ${MAX_IMAGE_INPUT} 张（当前 ${refCount} 张）`);
        }

        const token = await deps.getToken();
        const imageInput = await deps.resolveAssetRefs(token, project, opts.imageInput, 'ai_image');
        // tool_id 必须是 ai_image：服务端 provider 工厂未注册 batch_image，
        // 发 batch_image 会 generation_failed（registry.py 只注册了 ai_image 通道）
        const payload = {
          project_id: project,
          tool_id: 'ai_image',
          sub_feature_id: 'batch_text_to_image',
          model_id: opts.model,
          mode: 'multi_prompt',
          prompts,
          count: prompts.length,
          shared_params: {
            aspect_ratio: opts.aspectRatio,
            image_size: opts.size,
            quality: 'medium',
            image_input: imageInput,
          },
        };
        const batch = await deps.createBatchTasks(token, payload);
        if (!opts.wait) {
          printOutput(batch.tasks.flatMap((t) => toRows(t, [])), COLUMNS, fmt);
          return;
        }
        const taskIds = batch.tasks.map((t) => t.id);
        const dones = await deps.pollTasks(token, taskIds, { timeoutSec, label: 'zovii 批量生图' });
        const rows = [];
        for (const done of dones) {
          const assets = await deps.resolveAssets(token, done.result_asset_ids || []);
          rows.push(...toRows(done, assets));
        }
        printOutput(rows, COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
