import { loginWithPassword } from '../token.js';
import { printOutput, handleError } from '../output.js';

export function register(program) {
  program
    .command('login <username> <password>')
    .description('用账号密码登录 Zovii Studio，token 保存到 ~/.config/zovii/auth.json')
    .action(async (username, password) => {
      const fmt = program.opts().format;
      try {
        const { user, expires_at } = await loginWithPassword(username, password);
        printOutput(
          [{
            username: user.username,
            credits_balance: user.credits_balance,
            expires_at: expires_at ? new Date(expires_at * 1000).toISOString() : '',
          }],
          ['username', 'credits_balance', 'expires_at'],
          fmt,
        );
      } catch (err) {
        handleError(err);
      }
    });
}
