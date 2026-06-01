import { getToken as realGetToken } from '../token.js';
import { getCanvasLayout as realGetCanvasLayout } from '../utils.js';
import { listGroupsFromLayout } from '../canvas-layout.js';
import { printOutput, handleError } from '../output.js';

const COLUMNS = ['groupId', 'name', 'autoOrganize', 'memberCount', 'color'];
const realDeps = { getToken: realGetToken, getCanvasLayout: realGetCanvasLayout };

export function register(program, deps = realDeps) {
  program
    .command('list-groups <projectId>')
    .description('列出项目的画布分组（id / 名字 / 自动整理状态 / 成员数）')
    .action(async (projectId) => {
      const fmt = program.opts().format;
      try {
        const token = await deps.getToken();
        const layout = await deps.getCanvasLayout(token, projectId);
        printOutput(listGroupsFromLayout(layout), COLUMNS, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
