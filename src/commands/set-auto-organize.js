import { getToken as realGetToken } from '../token.js';
import {
  getCanvasLayout as realGetCanvasLayout,
  saveCanvasLayout as realSaveCanvasLayout,
} from '../utils.js';
import { setAutoOrganizeInLayout, listGroupsFromLayout } from '../canvas-layout.js';
import { printOutput, handleError } from '../output.js';
import { ArgumentError } from '../errors.js';

const COLUMNS = ['groupId', 'name', 'autoOrganize', 'memberCount', 'color'];
const realDeps = {
  getToken: realGetToken,
  getCanvasLayout: realGetCanvasLayout,
  saveCanvasLayout: realSaveCanvasLayout,
};

export function register(program, deps = realDeps) {
  program
    .command('set-auto-organize <projectId> <groupId> <state>')
    .description('开/关画布分组的自动整理（state = on | off）')
    .action(async (projectId, groupId, state) => {
      const fmt = program.opts().format;
      try {
        const s = String(state).trim().toLowerCase();
        if (s !== 'on' && s !== 'off') {
          throw new ArgumentError(`状态只能是 on 或 off，收到：${state}`);
        }
        const token = await deps.getToken();
        const layout = await deps.getCanvasLayout(token, projectId);
        const next = setAutoOrganizeInLayout(layout, groupId, s === 'on');
        await deps.saveCanvasLayout(token, projectId, next);
        const row = listGroupsFromLayout(next).find((g) => g.groupId === groupId);
        printOutput([row], COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
