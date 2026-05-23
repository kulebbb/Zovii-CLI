import { getToken } from '../token.js';
import { listProjects } from '../utils.js';
import { printOutput, handleError } from '../output.js';

const COLUMNS = ['projectId', 'projectName', 'createdAt', 'updatedAt'];

export function register(program) {
  program
    .command('list-projects')
    .description('列出当前账号的所有项目')
    .action(async () => {
      const fmt = program.opts().format;
      try {
        const token = await getToken();
        const projects = await listProjects(token);
        printOutput(
          projects.map((p) => ({
            projectId: p.id ?? '',
            projectName: p.name ?? '',
            createdAt: p.created_at ?? '',
            updatedAt: p.updated_at ?? '',
          })),
          COLUMNS,
          fmt,
        );
      } catch (err) {
        handleError(err);
      }
    });
}
