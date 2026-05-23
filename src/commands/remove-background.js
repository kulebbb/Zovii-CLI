import { getToken } from '../token.js';
import { resolveAssetRef, getAsset, createTask, pollTask, resolveAssets, toRows } from '../utils.js';
import { printOutput, handleError } from '../output.js';
import { ArgumentError } from '../errors.js';

const COLUMNS = ['taskId', 'status', 'creditCost', 'assetId', 'assetName', 'assetType', 'fileUrl', 'thumbnailUrl', 'width', 'height', 'duration'];

export function register(program) {
  program
    .command('remove-background <project> <image>')
    .description('图片去除背景，返回透明背景图片 URL')
    .option('--timeout <s>', '超时秒数', '300')
    .option('--no-wait', '提交后立即返回 task id，不等待结果')
    .action(async (project, imageRef, opts) => {
      const fmt = program.opts().format;
      try {
        if (!imageRef.trim()) throw new ArgumentError('image 不能为空');
        const timeoutSec = parseInt(opts.timeout, 10);
        if (!Number.isInteger(timeoutSec) || timeoutSec <= 0) {
          throw new ArgumentError('--timeout 必须是正整数');
        }

        const token = await getToken();
        const assetId = await resolveAssetRef(token, project, imageRef, 'remove_bg');
        const asset = await getAsset(token, assetId);
        if (!asset.file_url) throw new ArgumentError('该素材缺少 file_url，无法移除背景');

        const payload = {
          project_id: project,
          tool_id: 'remove_bg',
          sub_feature_id: 'remove_bg',
          model_id: 'wavespeed-rmbg',
          params: { image_url: asset.file_url, source_asset_id: asset.id },
        };

        const task = await createTask(token, payload);
        if (!opts.wait) {
          printOutput(toRows(task, []), COLUMNS, fmt);
          return;
        }
        const done = await pollTask(token, task.id, { timeoutSec, label: 'zovii 移除背景' });
        const assets = await resolveAssets(token, done.result_asset_ids || []);
        printOutput(toRows(done, assets), COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
