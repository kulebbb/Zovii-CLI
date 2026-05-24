import * as phoneApi from '../auth/phone.js';
import * as promptApi from '../auth/prompt.js';
import { loginWithPassword as loginPw } from '../token.js';
import { assertPhone, assertCode } from '../auth/validate.js';
import { ArgumentError } from '../errors.js';
import { printOutput, handleError } from '../output.js';

const realDeps = {
  loginWithPassword: loginPw,
  loginWithPhoneCode: phoneApi.loginWithPhoneCode,
  sendCode: phoneApi.sendCode,
  promptPhone: promptApi.promptPhone,
  promptCode: promptApi.promptCode,
};

export function register(program, deps = realDeps) {
  program
    .command('login [phone] [extra...]')
    .description('登录 Zovii Studio（默认手机号验证码；-u/-p 走账密旧路）')
    .option('-c, --code <code>', '手机号验证码（非交互模式）')
    .option('-u, --username <user>', '账密登录的用户名（兼容旧路）')
    .option('-p, --password <pass>', '账密登录的密码（兼容旧路）')
    .action(async (phone, extra, options) => {
      const fmt = program.opts().format;
      try {
        const hasU = options.username !== undefined;
        const hasP = options.password !== undefined;
        const hasPhone = phone !== undefined;
        const hasCode = options.code !== undefined;

        // 规则 2：只给 -u 或只给 -p
        if (hasU !== hasP) {
          throw new ArgumentError('-u 和 -p 必须同时提供');
        }

        // 规则 3：-u/-p 与 phone/--code 混用
        if (hasU && (hasPhone || hasCode || extra.length > 0)) {
          throw new ArgumentError('账密登录不能与手机号或 --code 混用');
        }

        // 早期拒绝：只给 --code 不给 phone（且不是 -u/-p 路径）是无意义组合
        if (!hasPhone && hasCode) {
          throw new ArgumentError("--code 必须配合手机号使用，请改用 'zovii login <手机号> --code <验证码>'");
        }

        // 规则 1：账密旧路
        if (hasU) {
          const { user, expires_at } = await deps.loginWithPassword(options.username, options.password);
          printResult(user, expires_at, fmt);
          return;
        }

        // 规则 4c：phone 没给但出现旧式两位置参
        if (!hasPhone && extra.length > 0) {
          throw new ArgumentError(
            "命令格式已变更：账密登录请用 'zovii login -u <用户名> -p <密码>'，手机号登录请用 'zovii login [手机号]'",
          );
        }

        // phone 给了但同时有 extra（如 `login 138 abc`）—— 同样视为旧式调用
        if (hasPhone && extra.length > 0) {
          throw new ArgumentError(
            "命令格式已变更：账密登录请用 'zovii login -u <用户名> -p <密码>'，手机号登录请用 'zovii login [手机号]'",
          );
        }

        // 规则 4a：phone + code 都给
        if (hasPhone && hasCode) {
          const p = assertPhone(phone);
          const c = assertCode(options.code);
          const { user, expires_at } = await deps.loginWithPhoneCode(p, c);
          printResult(user, expires_at, fmt);
          return;
        }

        // 规则 4b：phone 给但 code 没给
        if (hasPhone && !hasCode) {
          const p = assertPhone(phone);
          await deps.sendCode(p, { purpose: 'login' });
          process.stderr.write('验证码已发送，5 分钟内有效。\n');
          const c = await deps.promptCode();
          const { user, expires_at } = await deps.loginWithPhoneCode(p, c);
          printResult(user, expires_at, fmt);
          return;
        }

        // 规则 4d：phone / code / -u / -p 都没给 → 全交互
        const p = await deps.promptPhone();
        await deps.sendCode(p, { purpose: 'login' });
        process.stderr.write('验证码已发送，5 分钟内有效。\n');
        const c = await deps.promptCode();
        const { user, expires_at } = await deps.loginWithPhoneCode(p, c);
        printResult(user, expires_at, fmt);
      } catch (err) {
        handleError(err);
      }
    });
}

function printResult(user, expires_at, fmt) {
  printOutput(
    [{
      username: user.username,
      credits_balance: user.credits_balance,
      expires_at: expires_at ? new Date(expires_at * 1000).toISOString() : '',
    }],
    ['username', 'credits_balance', 'expires_at'],
    fmt,
  );
}
