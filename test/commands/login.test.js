import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { register } from '../../src/commands/login.js';

function captureIO() {
  const origExit = process.exit;
  const origStdout = process.stdout.write.bind(process.stdout);
  const origStderr = process.stderr.write.bind(process.stderr);
  let stdout = '', stderr = '', exitCode = null;
  process.stdout.write = (s) => { stdout += s; return true; };
  process.stderr.write = (s) => { stderr += s; return true; };
  process.exit = (code) => { exitCode = code; throw new Error('__exit__'); };
  return {
    get stdout() { return stdout; },
    get stderr() { return stderr; },
    get exitCode() { return exitCode; },
    restore: () => {
      process.exit = origExit;
      process.stdout.write = origStdout;
      process.stderr.write = origStderr;
    },
  };
}

function makeProgram(deps) {
  const program = new Command();
  program.exitOverride();
  program.option('-f, --format <fmt>', '', 'json');
  register(program, deps);
  return program;
}

function fakeUser() {
  return { user: { username: 'tester', credits_balance: 100 }, expires_at: 2000000000 };
}

test('login -u alice -p secret → 走 loginWithPassword', async () => {
  const calls = { pw: [], code: [], send: [], prompt: { phone: 0, code: 0 } };
  const program = makeProgram({
    loginWithPassword: async (u, p) => { calls.pw.push([u, p]); return fakeUser(); },
    loginWithPhoneCode: async (...a) => { calls.code.push(a); return fakeUser(); },
    sendCode: async (...a) => { calls.send.push(a); return { ok: true }; },
    promptPhone: async () => { calls.prompt.phone++; return '13800000000'; },
    promptCode: async () => { calls.prompt.code++; return '123456'; },
  });
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'login', '-u', 'alice', '-p', 'secret']);
    assert.deepEqual(calls.pw, [['alice', 'secret']]);
    assert.equal(calls.code.length, 0);
    assert.equal(calls.send.length, 0);
    assert.equal(calls.prompt.phone, 0);
    assert.equal(calls.prompt.code, 0);
  } finally { io.restore(); }
});

test('login 只给 -u → ArgumentError', async () => {
  const program = makeProgram({
    loginWithPassword: async () => fakeUser(),
    loginWithPhoneCode: async () => fakeUser(),
    sendCode: async () => ({ ok: true }),
    promptPhone: async () => '',
    promptCode: async () => '',
  });
  const io = captureIO();
  try {
    await assert.rejects(program.parseAsync(['node', 'zovii', 'login', '-u', 'alice']), /__exit__/);
    assert.match(io.stderr, /-u 和 -p 必须同时提供/);
    assert.equal(io.exitCode, 1);
  } finally { io.restore(); }
});

test('login -u alice -p secret 13800000000 → ArgumentError 不能混用', async () => {
  const program = makeProgram({
    loginWithPassword: async () => fakeUser(),
    loginWithPhoneCode: async () => fakeUser(),
    sendCode: async () => ({ ok: true }),
    promptPhone: async () => '', promptCode: async () => '',
  });
  const io = captureIO();
  try {
    await assert.rejects(program.parseAsync(['node', 'zovii', 'login', '13800000000', '-u', 'alice', '-p', 'secret']), /__exit__/);
    assert.match(io.stderr, /不能与手机号或 --code 混用/);
  } finally { io.restore(); }
});

test('login 13800000000 --code 123456 → loginWithPhoneCode 不调 sendCode', async () => {
  const calls = { code: [], send: 0 };
  const program = makeProgram({
    loginWithPassword: async () => fakeUser(),
    loginWithPhoneCode: async (...a) => { calls.code.push(a); return fakeUser(); },
    sendCode: async () => { calls.send++; return { ok: true }; },
    promptPhone: async () => '', promptCode: async () => '',
  });
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'login', '13800000000', '--code', '123456']);
    assert.deepEqual(calls.code, [['13800000000', '123456']]);
    assert.equal(calls.send, 0);
  } finally { io.restore(); }
});

test('login 13800000000 → sendCode + promptCode + loginWithPhoneCode', async () => {
  const calls = { code: [], send: [], promptCode: 0 };
  const program = makeProgram({
    loginWithPassword: async () => fakeUser(),
    loginWithPhoneCode: async (...a) => { calls.code.push(a); return fakeUser(); },
    sendCode: async (...a) => { calls.send.push(a); return { ok: true }; },
    promptPhone: async () => '13900000000',
    promptCode: async () => { calls.promptCode++; return '654321'; },
  });
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'login', '13800000000']);
    assert.deepEqual(calls.send, [['13800000000', { purpose: 'login' }]]);
    assert.equal(calls.promptCode, 1);
    assert.deepEqual(calls.code, [['13800000000', '654321']]);
  } finally { io.restore(); }
});

test('login 无参 → promptPhone + sendCode + promptCode + loginWithPhoneCode', async () => {
  const calls = { code: [], send: [], promptPhone: 0, promptCode: 0 };
  const program = makeProgram({
    loginWithPassword: async () => fakeUser(),
    loginWithPhoneCode: async (...a) => { calls.code.push(a); return fakeUser(); },
    sendCode: async (...a) => { calls.send.push(a); return { ok: true }; },
    promptPhone: async () => { calls.promptPhone++; return '13900000000'; },
    promptCode: async () => { calls.promptCode++; return '654321'; },
  });
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'login']);
    assert.equal(calls.promptPhone, 1);
    assert.deepEqual(calls.send, [['13900000000', { purpose: 'login' }]]);
    assert.equal(calls.promptCode, 1);
    assert.deepEqual(calls.code, [['13900000000', '654321']]);
  } finally { io.restore(); }
});

test('login alice secret → ArgumentError 提示迁移', async () => {
  const program = makeProgram({
    loginWithPassword: async () => fakeUser(),
    loginWithPhoneCode: async () => fakeUser(),
    sendCode: async () => ({ ok: true }),
    promptPhone: async () => '', promptCode: async () => '',
  });
  const io = captureIO();
  try {
    await assert.rejects(program.parseAsync(['node', 'zovii', 'login', 'alice', 'secret']), /__exit__/);
    assert.match(io.stderr, /命令格式已变更/);
    assert.match(io.stderr, /zovii login -u/);
  } finally { io.restore(); }
});

test('login 13800000000 --code abc → ArgumentError 验证码格式', async () => {
  const program = makeProgram({
    loginWithPassword: async () => fakeUser(),
    loginWithPhoneCode: async () => fakeUser(),
    sendCode: async () => ({ ok: true }),
    promptPhone: async () => '', promptCode: async () => '',
  });
  const io = captureIO();
  try {
    await assert.rejects(program.parseAsync(['node', 'zovii', 'login', '13800000000', '--code', 'abc']), /__exit__/);
    assert.match(io.stderr, /验证码应为 6 位数字/);
  } finally { io.restore(); }
});

test('login 单参非手机号 → ArgumentError 手机号格式（不报旧式调用）', async () => {
  const program = makeProgram({
    loginWithPassword: async () => fakeUser(),
    loginWithPhoneCode: async () => fakeUser(),
    sendCode: async () => ({ ok: true }),
    promptPhone: async () => '', promptCode: async () => '',
  });
  const io = captureIO();
  try {
    await assert.rejects(program.parseAsync(['node', 'zovii', 'login', 'alice']), /__exit__/);
    assert.match(io.stderr, /手机号格式不正确/);
    assert.doesNotMatch(io.stderr, /命令格式已变更/);
  } finally { io.restore(); }
});
