import * as phoneApi from '../auth/phone.js';
import { assertPhone } from '../auth/validate.js';
import { printOutput, handleError } from '../output.js';

const realDeps = { sendCode: phoneApi.sendCode };

export function register(program, deps = realDeps) {
  program
    .command('send-code <phone>')
    .description('发送手机号验证码（默认 purpose=login，5 分钟有效）')
    .option('-P, --purpose <kind>', 'login / register / reset_password', 'login')
    .action(async (phone, options) => {
      const fmt = program.opts().format;
      try {
        const cleaned = assertPhone(phone);
        await deps.sendCode(cleaned, { purpose: options.purpose });
        printOutput(
          [{ phone: cleaned, status: '已发送', expires_in: '5 分钟' }],
          ['phone', 'status', 'expires_in'],
          fmt,
        );
      } catch (err) {
        handleError(err);
      }
    });
}
