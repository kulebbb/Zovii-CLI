import { getToken as realGetToken } from '../token.js';
import {
  resolveAssetRefs as realResolveAssetRefs,
  createBatchTasks as realCreateBatchTasks,
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
const SUB_FEATURE_ID = 'batch_text_to_image';
const MAX_PROMPTS = 20;

const realDeps = {
  getToolsConfig: realGetToolsConfig,
  getToken: realGetToken,
  resolveAssetRefs: realResolveAssetRefs,
  createBatchTasks: realCreateBatchTasks,
  pollTasks: realPollTasks,
  resolveAssets: realResolveAssets,
};

function collectPrompt(value, acc) {
  return acc.concat([value]);
}

function splitRefs(csv) {
  return String(csv ?? '').split(',').map((x) => x.trim()).filter(Boolean);
}

export function register(program, deps = realDeps) {
  program
    .command('batch-generate-image <project>')
    .description('批量生图：多个不同 prompt 一次提交，每条生成 1 张')
    .option('--prompt <text>', `提示词，可重复传入 1-${MAX_PROMPTS} 条（必填）`, collectPrompt, [])
    .option('--model <model>', '模型 id（缺省用产品默认模型），运行 zovii list-models ai_image 查看')
    .option('--aspect-ratio <ratio>', '宽高比（缺省用模型默认值），取值见 zovii list-models ai_image')
    .option('--size <size>', '分辨率（缺省用模型默认值），取值见 zovii list-models ai_image')
    .option('--image-input <refs>', '参考图 asset ID 或本地路径，逗号分隔，所有 prompt 共用（可选）', '')
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
        const timeoutSec = parseInt(opts.timeout, 10);
        if (!Number.isInteger(timeoutSec) || timeoutSec <= 0) {
          throw new ArgumentError('--timeout 必须是正整数');
        }

        const tools = await deps.getToolsConfig();
        const tool = findTool(tools, TOOL_ID);
        const model = opts.model ? findModel(tool, opts.model) : getDefaultModel(tool);
        const fields = resolveFields(tool, SUB_FEATURE_ID, model.id);

        const builder = createParams(model, fields);
        // image_input 必须先写入 params：aspect_ratio 的 auto_value_when 依赖它判断非空
        // 先按 schema 校验参考图数量，再上传，避免白传
        const refs = splitRefs(opts.imageInput);
        builder.input('image_input', refs, '--image-input');
        builder.option('aspect_ratio', opts.aspectRatio, '--aspect-ratio');
        // 分辨率字段名随模型而异：image_size 或 size，只发其中存在的那一个
        builder.option(fields.has('image_size') ? 'image_size' : 'size', opts.size, '--size');

        const token = await deps.getToken();
        if (refs.length) {
          builder.params.image_input =
            await deps.resolveAssetRefs(token, project, opts.imageInput, TOOL_ID);
        }

        const estimated = estimateTotal(
          tool, SUB_FEATURE_ID, model, builder.params, prompts.length,
        );
        if (estimated !== null) {
          process.stderr.write(`预估消耗 ${estimated} 积分（以实际账单为准）\n`);
        }

        // tool_id 必须是 ai_image：服务端 provider 工厂未注册 batch_image，
        // 发 batch_image 会 generation_failed（registry.py 只注册了 ai_image 通道）
        const payload = {
          project_id: project,
          tool_id: TOOL_ID,
          sub_feature_id: SUB_FEATURE_ID,
          model_id: model.id,
          mode: 'multi_prompt',
          prompts,
          count: prompts.length,
          shared_params: builder.params,
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
