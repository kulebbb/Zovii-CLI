import { clearAuth } from '../token.js';
import { printOutput, handleError } from '../output.js';

export function register(program) {
  program
    .command('logout')
    .description('清除本地保存的 token')
    .action(async () => {
      const fmt = program.opts().format;
      try {
        await clearAuth();
        printOutput([{ status: '已登出，本地 token 已清除' }], ['status'], fmt);
      } catch (err) {
        handleError(err);
      }
    });
}
