import { getToken } from '../token.js';
import { createProject } from '../utils.js';
import { printOutput, handleError } from '../output.js';

const COLUMNS = ['projectId', 'projectName', 'createdAt'];

export function register(program) {
  program
    .command('create-project <name>')
    .description('新建项目，返回 project ID')
    .action(async (name) => {
      const fmt = program.opts().format;
      try {
        const token = await getToken();
        const project = await createProject(token, name.trim());
        printOutput(
          [{
            projectId: project.id ?? '',
            projectName: project.name ?? '',
            createdAt: project.created_at ?? '',
          }],
          COLUMNS,
          fmt,
        );
      } catch (err) {
        handleError(err);
      }
    });
}
