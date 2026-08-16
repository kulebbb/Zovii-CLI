import { getToken as realGetToken } from '../token.js';
import {
  resolveAssetRef as realResolveAssetRef,
  resolveAssetRefs as realResolveAssetRefs,
  createTask as realCreateTask,
  pollTask as realPollTask,
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
const TOOL_ID = 'ai_video';
const SUB_FEATURE_ID = 'video_generation';

const realDeps = {
  getToolsConfig: realGetToolsConfig,
  getToken: realGetToken,
  resolveAssetRef: realResolveAssetRef,
  resolveAssetRefs: realResolveAssetRefs,
  createTask: realCreateTask,
  pollTask: realPollTask,
  resolveAssets: realResolveAssets,
};

function splitRefs(csv) {
  return String(csv ?? '').split(',').map((x) => x.trim()).filter(Boolean);
}

export function register(program, deps = realDeps) {
  program
    .command('generate-video <project>')
    .description('AI 生视频：文生视频 / 首尾帧 / 参考图·视频·音频生视频')
    .option('--prompt <text>', '提示词', '')
    .option('--model <model>', '模型 id（缺省用产品默认模型），运行 zovii list-models ai_video 查看')
    .option('--ratio <ratio>', '画面比例（缺省用模型默认值），取值见 zovii list-models ai_video')
    .option('--duration <s>', '时长秒数（缺省用模型默认值），取值见 zovii list-models ai_video')
    .option('--resolution <res>', '分辨率（缺省用模型默认值），取值见 zovii list-models ai_video')
    .option('--image-input <ref>', '首帧图 asset ID 或本地路径（可选）', '')
    .option('--end-frame <ref>', '尾帧图 asset ID 或本地路径（需配合 --image-input）', '')
    .option('--ref-image <refs>', '参考图 asset ID 或本地路径，多个逗号分隔（可选）', '')
    .option('--ref-video <ref>', '参考视频 asset ID 或本地路径（可选）', '')
    .option('--ref-audio <refs>', '参考音频 asset ID 或本地路径，多个逗号分隔（可选）', '')
    .option(
      '--keep-original-audio',
      '保留参考视频原声（仅 --ref-video 时有效；仅部分模型支持，不支持时报错）',
    )
    .option('--no-audio', '不生成音频（仅部分模型支持，不支持时报错）')
    .option('--timeout <s>', '超时秒数', '600')
    .option('--no-wait', '提交后立即返回 task id，不等待结果')
    .action(async (project, opts) => {
      const fmt = program.opts().format;
      try {
        const prompt = String(opts.prompt ?? '').trim();
        const imageRef = String(opts.imageInput ?? '').trim();
        const endFrameRef = String(opts.endFrame ?? '').trim();
        const refVideoRef = String(opts.refVideo ?? '').trim();
        const refImageRefs = splitRefs(opts.refImage);
        const refAudioRefs = splitRefs(opts.refAudio);

        const hasInput = imageRef || endFrameRef || refVideoRef
          || refImageRefs.length || refAudioRefs.length;
        if (!prompt && !hasInput) {
          throw new ArgumentError('--prompt 与参考素材（--image-input / --ref-* 等）至少提供一个');
        }
        if (endFrameRef && !imageRef) {
          throw new ArgumentError('--end-frame 需要同时提供 --image-input（首帧）');
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
        const params = builder.params;
        params.prompt = prompt;
        builder.option('ratio', opts.ratio, '--ratio');
        builder.option('duration', opts.duration, '--duration');
        builder.option('resolution', opts.resolution, '--resolution');
        // schema 里 duration 是字符串枚举，后端要数字
        if (params.duration !== undefined) params.duration = Number(params.duration);
        builder.flag('generate_audio', opts.audio === false, false, '--no-audio');
        builder.flag(
          'keep_original_audio', opts.keepOriginalAudio === true, true, '--keep-original-audio',
        );
        // 先按 schema 校验素材字段（是否支持 / 数量上限），再上传，避免白传
        builder.input('image_input', imageRef, '--image-input');
        builder.input('end_frame_input', endFrameRef, '--end-frame');
        builder.input('reference_image_inputs', refImageRefs, '--ref-image');
        builder.input('reference_video_input', refVideoRef, '--ref-video');
        builder.input('reference_audio_inputs', refAudioRefs, '--ref-audio');
        params.generation_count = 1;
        params.camera_fixed = false;
        params.shot_type = 'customize';

        const token = await deps.getToken();
        if (imageRef) {
          params.image_input = await deps.resolveAssetRef(token, project, imageRef, TOOL_ID);
        }
        if (endFrameRef) {
          params.end_frame_input = await deps.resolveAssetRef(token, project, endFrameRef, TOOL_ID);
        }
        if (refVideoRef) {
          params.reference_video_input =
            await deps.resolveAssetRef(token, project, refVideoRef, TOOL_ID);
        }
        if (refImageRefs.length) {
          params.reference_image_inputs =
            await deps.resolveAssetRefs(token, project, opts.refImage, TOOL_ID);
        }
        if (refAudioRefs.length) {
          params.reference_audio_inputs =
            await deps.resolveAssetRefs(token, project, opts.refAudio, TOOL_ID);
        }

        const estimated = estimateTotal(tool, SUB_FEATURE_ID, model, params);
        if (estimated !== null) {
          process.stderr.write(`预估消耗 ${estimated} 积分（以实际账单为准）\n`);
        }

        const payload = {
          project_id: project,
          tool_id: TOOL_ID,
          sub_feature_id: SUB_FEATURE_ID,
          model_id: model.id,
          params,
        };

        const task = await deps.createTask(token, payload);
        if (!opts.wait) {
          printOutput(toRows(task, []), COLUMNS, fmt);
          return;
        }
        const done = await deps.pollTask(token, task.id, { timeoutSec, label: 'zovii 生视频' });
        const assets = await deps.resolveAssets(token, done.result_asset_ids || []);
        printOutput(toRows(done, assets), COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
