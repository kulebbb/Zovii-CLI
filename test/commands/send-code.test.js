import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { register } from '../../src/commands/send-code.js';

function makeProgram(deps) {
  const program = new Command();
  program.exitOverride();
  program.option('-f, --format <fmt>', '', 'json'); // 用 json 便于断言
  register(program, deps);
  return program;
}

test('send-code 校验 phone 格式，非法时抛 ArgumentError', async () => {
  const calls = [];
  const program = makeProgram({ sendCode: async (...args) => { calls.push(args); return { ok: true }; } });
  const origExit = process.exit;
  const origStderr = process.stderr.write.bind(process.stderr);
  let stderrBuf = '';
  process.stderr.write = (s) => { stderrBuf += s; return true; };
  let exitCode = null;
  process.exit = (code) => { exitCode = code; throw new Error('__exit__'); };
  try {
    await assert.rejects(program.parseAsync(['node', 'zovii', 'send-code', 'abc']), /__exit__/);
    assert.equal(exitCode, 1);
    assert.match(stderrBuf, /手机号格式不正确/);
    assert.equal(calls.length, 0);
  } finally {
    process.exit = origExit;
    process.stderr.write = origStderr;
  }
});

test('send-code 成功调用 sendCode 并以 JSON 输出', async () => {
  const calls = [];
  const program = makeProgram({ sendCode: async (...args) => { calls.push(args); return { ok: true }; } });
  const origStdout = process.stdout.write.bind(process.stdout);
  let stdoutBuf = '';
  process.stdout.write = (s) => { stdoutBuf += s; return true; };
  try {
    await program.parseAsync(['node', 'zovii', 'send-code', '13800000000']);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], '13800000000');
    assert.deepEqual(calls[0][1], { purpose: 'login' });
    const parsed = JSON.parse(stdoutBuf);
    assert.equal(parsed[0].phone, '13800000000');
    assert.equal(parsed[0].status, '已发送');
    assert.equal(parsed[0].expires_in, '5 分钟');
  } finally {
    process.stdout.write = origStdout;
  }
});

test('send-code 允许 --purpose 覆盖', async () => {
  const calls = [];
  const program = makeProgram({ sendCode: async (...args) => { calls.push(args); return { ok: true }; } });
  const origStdout = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    await program.parseAsync(['node', 'zovii', 'send-code', '13800000000', '-P', 'reset_password']);
    assert.deepEqual(calls[0][1], { purpose: 'reset_password' });
  } finally {
    process.stdout.write = origStdout;
  }
});
