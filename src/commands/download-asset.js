import { getToken } from '../token.js';
import { getAsset, downloadAsset } from '../utils.js';
import { printOutput, handleError } from '../output.js';
import { ArgumentError } from '../errors.js';
import { resolve } from 'node:path';

const COLUMNS = ['assetId', 'assetName', 'assetType', 'localPath', 'bytes'];

export function register(program) {
  program
    .command('download-asset <project> <asset>')
    .description('下载项目 asset 文件到本地')
    .option('--out <path>', '保存路径（缺省用素材文件名存当前目录）', '')
    .action(async (project, assetId, opts) => {
      const fmt = program.opts().format;
      try {
        if (!assetId.trim()) throw new ArgumentError('asset 不能为空');
        const token = await getToken();
        const asset = await getAsset(token, assetId);
        const outArg = opts.out.trim();
        const outPath = resolve(outArg || asset.name || `${assetId}.bin`);
        const { localPath, bytes } = await downloadAsset(asset, outPath);
        printOutput(
          [{
            assetId: asset.id ?? assetId,
            assetName: asset.name ?? '',
            assetType: asset.type ?? '',
            localPath,
            bytes,
          }],
          COLUMNS,
          fmt,
        );
      } catch (err) {
        handleError(err);
      }
    });
}
