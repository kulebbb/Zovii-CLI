import { getToken } from '../token.js';
import { resolveAssetRef, resolveAssetRefs, createTask, pollTask, resolveAssets, toRows } from '../utils.js';
import { printOutput, handleError } from '../output.js';
import { ArgumentError } from '../errors.js';

const COLUMNS = ['taskId', 'status', 'creditCost', 'assetId', 'assetName', 'assetType', 'fileUrl', 'thumbnailUrl', 'width', 'height', 'duration'];
const MODELS = [
  'doubao-seedance-2-0-260128',
  'doubao-seedance-2-0-fast-260128',
  'doubao-seedance-1-5-pro-251215',
  'kling-o3',
  'ws-veo-3.1',
];
const DEFAULT_MODEL = 'doubao-seedance-2-0-260128';

export function register(program) {
  program
    .command('generate-video <project>')
    .description('AI 生视频：文生视频 / 首尾帧 / 参考图·视频·音频生视频')
    .option('--prompt <text>', '提示词', '')
    .option('--model <model>', `模型：${MODELS.join(' / ')}`, DEFAULT_MODEL)
    .option('--ratio <ratio>', '画面比例：16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 21:9', '16:9')
    .option('--duration <s>', '时长（秒）：8 / 12', '8')
    .option('--resolution <res>', '分辨率：480p / 720p / 1080p', '720p')
    .option('--image-input <ref>', '首帧图 asset ID 或本地路径（可选）', '')
    .option('--end-frame <ref>', '尾帧图 asset ID 或本地路径（需配合 --image-input）', '')
    .option('--ref-image <refs>', '参考图 asset ID 或本地路径，多个逗号分隔（可选）', '')
    .option('--ref-video <ref>', '参考视频 asset ID 或本地路径（可选）', '')
    .option('--ref-audio <refs>', '参考音频 asset ID 或本地路径，多个逗号分隔（可选）', '')
    .option('--keep-original-audio', '保留参考视频原声（仅 --ref-video 时有效）')
    .option('--no-audio', '不生成音频')
    .option('--timeout <s>', '超时秒数', '600')
    .option('--no-wait', '提交后立即返回 task id，不等待结果')
    .action(async (project, opts) => {
      const fmt = program.opts().format;
      try {
        const prompt = String(opts.prompt ?? '').trim();
        const imageRef = String(opts.imageInput ?? '').trim();
        const endFrameRef = String(opts.endFrame ?? '').trim();
        const refVideoRef = String(opts.refVideo ?? '').trim();
        const refImageRefs = String(opts.refImage ?? '').trim();
        const refAudioRefs = String(opts.refAudio ?? '').trim();

        const hasInput = imageRef || endFrameRef || refVideoRef || refImageRefs || refAudioRefs;
        if (!prompt && !hasInput) {
          throw new ArgumentError('--prompt 与参考素材（--image-input / --ref-* 等）至少提供一个');
        }
        if (endFrameRef && !imageRef) {
          throw new ArgumentError('--end-frame 需要同时提供 --image-input（首帧）');
        }

        const model = opts.model;
        if (!MODELS.includes(model)) {
          throw new ArgumentError(`未知模型 "${model}"，可选：${MODELS.join(' / ')}`);
        }
        const timeoutSec = parseInt(opts.timeout, 10);
        if (!Number.isInteger(timeoutSec) || timeoutSec <= 0) {
          throw new ArgumentError('--timeout 必须是正整数');
        }

        const token = await getToken();
        const imageInput = imageRef
          ? await resolveAssetRef(token, project, imageRef, 'ai_video') : '';
        const endFrameInput = endFrameRef
          ? await resolveAssetRef(token, project, endFrameRef, 'ai_video') : '';
        const referenceVideoInput = refVideoRef
          ? await resolveAssetRef(token, project, refVideoRef, 'ai_video') : '';
        const referenceImageInputs = await resolveAssetRefs(token, project, refImageRefs, 'ai_video');
        const referenceAudioInputs = await resolveAssetRefs(token, project, refAudioRefs, 'ai_video');

        const payload = {
          project_id: project,
          tool_id: 'ai_video',
          sub_feature_id: 'video_generation',
          model_id: model,
          params: {
            prompt,
            model_id: model,
            ratio: opts.ratio,
            duration: opts.duration,
            resolution: opts.resolution,
            generate_audio: opts.audio !== false,
            generation_count: 1,
            camera_fixed: false,
            shot_type: 'customize',
            image_input: imageInput,
            end_frame_input: endFrameInput,
            reference_image_inputs: referenceImageInputs,
            reference_video_input: referenceVideoInput,
            reference_audio_inputs: referenceAudioInputs,
            keep_original_audio: opts.keepOriginalAudio ?? false,
          },
        };

        const task = await createTask(token, payload);
        if (!opts.wait) {
          printOutput(toRows(task, []), COLUMNS, fmt);
          return;
        }
        const done = await pollTask(token, task.id, { timeoutSec, label: 'zovii 生视频' });
        const assets = await resolveAssets(token, done.result_asset_ids || []);
        printOutput(toRows(done, assets), COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
