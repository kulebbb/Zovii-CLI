import { getToken as realGetToken } from '../token.js';
import {
  getCanvasLayout as realGetCanvasLayout,
  saveCanvasLayout as realSaveCanvasLayout,
  resolveAssetSizes as realResolveAssetSizes,
} from '../utils.js';
import { addMembersInLayout, listGroupsFromLayout } from '../canvas-layout.js';
import { parseAssetIds } from './create-group.js';
import { printOutput, handleError } from '../output.js';
import { ArgumentError } from '../errors.js';

const COLUMNS = ['groupId', 'name', 'autoOrganize', 'memberCount', 'color'];
const realDeps = {
  getToken: realGetToken,
  getCanvasLayout: realGetCanvasLayout,
  saveCanvasLayout: realSaveCanvasLayout,
  resolveAssetSizes: realResolveAssetSizes,
};

export function register(program, deps = realDeps) {
  program
    .command('add-to-group <projectId> <groupId>')
    .description('给已有画布分组追加成员资产')
    .option('--assets <ids>', '逗号分隔的 asset id（必填）')
    .action(async (projectId, groupId, options) => {
      const fmt = program.opts().format;
      try {
        const assetIds = parseAssetIds(options.assets);
        if (assetIds.length === 0) throw new ArgumentError('请用 --assets 至少指定一个 asset id');
        const token = await deps.getToken();
        const assetSizes = await deps.resolveAssetSizes(token, assetIds);
        const layout = await deps.getCanvasLayout(token, projectId);
        const next = addMembersInLayout(layout, groupId, assetSizes);
        await deps.saveCanvasLayout(token, projectId, next);
        const row = listGroupsFromLayout(next).find((g) => g.groupId === groupId);
        printOutput([row], COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
