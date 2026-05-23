import { getToken } from '../token.js';
import { uploadAsset, assetRow } from '../utils.js';
import { printOutput, handleError } from '../output.js';
import { ArgumentError } from '../errors.js';
import { existsSync } from 'node:fs';

const COLUMNS = ['assetId', 'assetName', 'assetType', 'fileUrl', 'thumbnailUrl', 'width', 'height', 'duration'];

export function register(program) {
  program
    .command('upload-asset <project> <file>')
    .description('上传本地图片/视频/音频为项目 asset，返回 asset ID')
    .option('--tool-type <type>', '上传用途标记（可选，透传 tool_type）', '')
    .action(async (project, file, opts) => {
      const fmt = program.opts().format;
      try {
        if (!file.trim()) throw new ArgumentError('file 不能为空');
        if (!existsSync(file)) throw new ArgumentError(`文件不存在：${file}`);
        const token = await getToken();
        const toolType = opts.toolType || undefined;
        const asset = await uploadAsset(token, project, file, toolType);
        printOutput([assetRow(asset)], COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
