import { createInterface } from 'node:readline';
import { CommandError } from '../errors.js';
import { isValidPhone, isValidCode } from './validate.js';

const NON_TTY_HINTS = {
  phone: "请改用 'zovii login <手机号> --code <验证码>'",
  code: '请改用 --code 传入，或先在交互终端登录',
  generic: '请改用命令行参数传入',
};

/**
 * 读取一行输入。可注入 input/output/isTTY，便于测试。
 * @param {string} label 提示符（写入 output）
 * @param {{ input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream, isTTY?: boolean, field?: 'phone'|'code' }} opts
 * @returns {Promise<string>} trim 后的值
 */
export function promptLine(label, opts = {}) {
  const {
    input = process.stdin,
    output = process.stderr,
    isTTY = process.stdin.isTTY,
    field = 'generic',
  } = opts;
  if (!isTTY) {
    const hint = NON_TTY_HINTS[field] || NON_TTY_HINTS.generic;
    const subject = field === 'phone' ? '手机号' : field === 'code' ? '验证码' : '输入';
    return Promise.reject(
      new CommandError(`当前为非交互终端，无法读取${subject}。${hint}`),
    );
  }
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input, output, terminal: false });
    output.write(label);
    let resolved = false;
    rl.once('line', (line) => {
      resolved = true;
      rl.close();
      resolve(String(line).trim());
    });
    rl.once('close', () => {
      if (!resolved) reject(new CommandError('输入已结束，登录取消'));
    });
  });
}

async function promptWithRetry(label, opts, isValid, errMsg) {
  for (let i = 0; i < 3; i++) {
    const value = await promptLine(label, opts);
    if (isValid(value)) return value;
    const out = opts.output ?? process.stderr;
    out.write(`\x1b[31m${errMsg}\x1b[0m\n`);
  }
  throw new CommandError('连续 3 次输入不合法，已取消登录');
}

export function promptPhone(opts = {}) {
  return promptWithRetry(
    '请输入手机号: ',
    { ...opts, field: 'phone' },
    isValidPhone,
    '手机号格式不正确，应为 11 位国内号码（如 13800000000）',
  );
}

export function promptCode(opts = {}) {
  return promptWithRetry(
    '请输入验证码: ',
    { ...opts, field: 'code' },
    isValidCode,
    '验证码应为 6 位数字',
  );
}
