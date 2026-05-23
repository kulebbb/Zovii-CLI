import { getToken } from '../token.js';
import { resolveAssetRef, createTask, pollTask, resolveAssets, toRows } from '../utils.js';
import { printOutput, handleError } from '../output.js';
import { ArgumentError } from '../errors.js';

const COLUMNS = ['taskId', 'status', 'creditCost', 'assetId', 'assetName', 'assetType', 'fileUrl', 'thumbnailUrl', 'width', 'height', 'duration'];
const RESOLUTIONS = ['1080p', '2k', '4k'];

export function register(program) {
  program
    .command('upscale-video <project> <video>')
    .description('视频高清放大：1080p / 2K / 4K')
    .option('--resolution <res>', '目标分辨率：1080p / 2k / 4k', '1080p')
    .option('--duration <s>', '处理时长（秒），0 表示整段', '0')
    .option('--timeout <s>', '超时秒数', '600')
    .option('--no-wait', '提交后立即返回 task id，不等待结果')
    .action(async (project, videoRef, opts) => {
      const fmt = program.opts().format;
      try {
        if (!videoRef.trim()) throw new ArgumentError('video 不能为空');

        const resolution = opts.resolution.trim().toLowerCase();
        if (!RESOLUTIONS.includes(resolution)) {
          throw new ArgumentError(`--resolution 只能是 ${RESOLUTIONS.join(' / ')}`);
        }
        const duration = parseInt(opts.duration, 10);
        if (!Number.isInteger(duration) || duration < 0) {
          throw new ArgumentError('--duration 必须是 >= 0 的整数');
        }
        const timeoutSec = parseInt(opts.timeout, 10);
        if (!Number.isInteger(timeoutSec) || timeoutSec <= 0) {
          throw new ArgumentError('--timeout 必须是正整数');
        }

        const token = await getToken();
        const videoId = await resolveAssetRef(token, project, videoRef, 'video_upscale');

        const payload = {
          project_id: project,
          tool_id: 'video_upscale',
          sub_feature_id: 'video_upscale',
          model_id: 'wavespeed-video-upscaler',
          params: { video_input: videoId, target_resolution: resolution, duration },
        };

        const task = await createTask(token, payload);
        if (!opts.wait) {
          printOutput(toRows(task, []), COLUMNS, fmt);
          return;
        }
        const done = await pollTask(token, task.id, { timeoutSec, label: 'zovii 视频放大' });
        const assets = await resolveAssets(token, done.result_asset_ids || []);
        printOutput(toRows(done, assets), COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
