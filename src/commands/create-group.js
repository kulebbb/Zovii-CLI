import { getToken as realGetToken } from '../token.js';
import {
  getCanvasLayout as realGetCanvasLayout,
  saveCanvasLayout as realSaveCanvasLayout,
  resolveAssetSizes as realResolveAssetSizes,
} from '../utils.js';
import { createGroupInLayout, listGroupsFromLayout, assertGroupColor } from '../canvas-layout.js';
import { looksLikeUuid } from '../helpers.js';
import { printOutput, handleError } from '../output.js';
import { ArgumentError } from '../errors.js';

const COLUMNS = ['groupId', 'name', 'autoOrganize', 'memberCount', 'color'];
const realDeps = {
  getToken: realGetToken,
  getCanvasLayout: realGetCanvasLayout,
  saveCanvasLayout: realSaveCanvasLayout,
  resolveAssetSizes: realResolveAssetSizes,
};

// 解析逗号分隔的 asset id，逐个校验 UUID 形态
export function parseAssetIds(csv) {
  const ids = String(csv ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const id of ids) {
    if (!looksLikeUuid(id)) throw new ArgumentError(`asset id 非法（需 UUID 形态）：${id}`);
  }
  return ids;
}

export function register(program, deps = realDeps) {
  program
    .command('create-group <projectId> <name>')
    .description('新建画布分组，可选带成员资产 / 直接开自动整理')
    .option('--assets <ids>', '逗号分隔的 asset id，作为初始成员')
    .option('--auto-organize', '创建时即开启自动整理（layoutMode=tiled）', false)
    .option('--color <color>', '分组颜色：blue/green/orange/purple/red/yellow/cyan/gray')
    .action(async (projectId, name, options) => {
      const fmt = program.opts().format;
      try {
        const assetIds = parseAssetIds(options.assets);
        assertGroupColor(options.color);
        const token = await deps.getToken();
        const assetSizes = assetIds.length ? await deps.resolveAssetSizes(token, assetIds) : [];
        const layout = await deps.getCanvasLayout(token, projectId);
        const { layout: next, groupId } = createGroupInLayout(layout, {
          name: name.trim(),
          color: options.color,
          autoOrganize: Boolean(options.autoOrganize),
          assetSizes,
        });
        await deps.saveCanvasLayout(token, projectId, next);
        const row = listGroupsFromLayout(next).find((g) => g.groupId === groupId);
        printOutput([row], COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
