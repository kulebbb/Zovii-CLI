import { getToken } from '../token.js';
import { listAssets, assetRow } from '../utils.js';
import { printOutput, handleError } from '../output.js';
import { ArgumentError } from '../errors.js';

const COLUMNS = ['assetId', 'assetName', 'assetType', 'fileUrl', 'thumbnailUrl', 'width', 'height', 'duration'];
const VALID_TYPES = ['image', 'video', 'audio'];

export function register(program) {
  program
    .command('list-assets <project>')
    .description('列出项目素材（支持按类型过滤）')
    .option('--type <type>', '按类型过滤：image / video / audio', '')
    .option('--limit <n>', '最多返回多少条', '100')
    .action(async (project, opts) => {
      const fmt = program.opts().format;
      try {
        const type = opts.type.trim();
        if (type && !VALID_TYPES.includes(type)) {
          throw new ArgumentError(`--type 只能是 ${VALID_TYPES.join(' / ')}`);
        }
        const limit = parseInt(opts.limit, 10);
        if (!Number.isInteger(limit) || limit < 1) {
          throw new ArgumentError('--limit 必须是正整数');
        }
        const token = await getToken();
        const assets = await listAssets(token, project, { type: type || undefined, limit });
        printOutput(assets.map(assetRow), COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
