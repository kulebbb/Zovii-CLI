import { getToken as realGetToken } from '../token.js';
import {
  getCanvasLayout as realGetCanvasLayout,
  saveCanvasLayout as realSaveCanvasLayout,
} from '../utils.js';
import { renameGroupInLayout, listGroupsFromLayout } from '../canvas-layout.js';
import { printOutput, handleError } from '../output.js';

const COLUMNS = ['groupId', 'name', 'autoOrganize', 'memberCount', 'color'];
const realDeps = {
  getToken: realGetToken,
  getCanvasLayout: realGetCanvasLayout,
  saveCanvasLayout: realSaveCanvasLayout,
};

export function register(program, deps = realDeps) {
  program
    .command('rename-group <projectId> <groupId> <newName>')
    .description('重命名画布分组')
    .action(async (projectId, groupId, newName) => {
      const fmt = program.opts().format;
      try {
        const token = await deps.getToken();
        const layout = await deps.getCanvasLayout(token, projectId);
        const next = renameGroupInLayout(layout, groupId, newName.trim());
        await deps.saveCanvasLayout(token, projectId, next);
        const row = listGroupsFromLayout(next).find((g) => g.groupId === groupId);
        printOutput([row], COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
