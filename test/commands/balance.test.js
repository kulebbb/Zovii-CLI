import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { balanceRow, register } from '../../src/commands/balance.js';
import { AuthRequiredError } from '../../src/errors.js';

function captureIO() {
  const origExit = process.exit;
  const origLog = console.log;
  const origStderr = process.stderr.write.bind(process.stderr);
  let stdout = '', stderr = '';
  console.log = (s) => { stdout += `${s}\n`; };
  process.stderr.write = (s) => { stderr += s; return true; };
  process.exit = () => { throw new Error('__exit__'); };
  return {
    get stdout() { return stdout; },
    get stderr() { return stderr; },
    restore: () => {
      process.exit = origExit;
      console.log = origLog;
      process.stderr.write = origStderr;
    },
  };
}

function fakeDeps(overrides = {}) {
  const logs = [];
  return {
    logs,
    deps: {
      getToken: async () => 'tok',
      getBalance: async () => 12.5,
      getEnterpriseBalance: async () => ({ enterpriseId: 'ent-1', balance: 200 }),
      log: (msg) => { logs.push(msg); },
      ...overrides,
    },
  };
}

async function run(deps, argv = []) {
  const program = new Command();
  program.exitOverride();
  program.option('-f, --format <fmt>', '', 'table');
  register(program, deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'balance', ...argv]);
  } catch (err) {
    if (err.message !== '__exit__') throw err;
  } finally {
    io.restore();
  }
  return io;
}

test('企业成员：表格同时给出个人余额与企业可用额度', async () => {
  const { deps } = fakeDeps();
  const io = await run(deps);
  assert.match(io.stdout, /personalBalance/);
  assert.match(io.stdout, /enterpriseId/);
  assert.match(io.stdout, /enterpriseBalance/);
  assert.match(io.stdout, /12\.5/);
  assert.match(io.stdout, /ent-1/);
  assert.match(io.stdout, /200/);
});

test('非企业成员：企业两列整列隐藏，只剩个人余额', async () => {
  const { deps } = fakeDeps({
    getEnterpriseBalance: async () => ({ enterpriseId: null, balance: 0 }),
  });
  const io = await run(deps);
  assert.match(io.stdout, /personalBalance/);
  assert.doesNotMatch(io.stdout, /enterprise/i);
});

test('企业接口失败：降级只显示个人余额，并在 stderr 说明该列已隐藏', async () => {
  const { deps, logs } = fakeDeps({
    getEnterpriseBalance: async () => { throw new Error('HTTP 500'); },
  });
  const io = await run(deps);
  assert.match(io.stdout, /personalBalance/);
  assert.doesNotMatch(io.stdout, /enterprise/i);
  assert.ok(logs.some((m) => /企业余额查询失败（HTTP 500），已隐藏企业列/.test(m)));
});

test('个人余额缺失：明确报错而不是显示 0', async () => {
  const { deps } = fakeDeps({ getBalance: async () => null });
  const io = await run(deps);
  assert.match(io.stderr, /查询余额失败：响应缺少 balance/);
  assert.equal(io.stdout, '');
});

test('json 格式：企业成员输出企业字段', async () => {
  const { deps } = fakeDeps();
  const io = await run(deps, ['-f', 'json']);
  const [row] = JSON.parse(io.stdout);
  assert.deepEqual(row, { personalBalance: 12.5, enterpriseId: 'ent-1', enterpriseBalance: 200 });
});

test('json 格式：非企业成员企业字段为 null（不冒充 0 或空串）', async () => {
  const { deps } = fakeDeps({
    getEnterpriseBalance: async () => ({ enterpriseId: null, balance: 0 }),
  });
  const io = await run(deps, ['-f', 'json']);
  const [row] = JSON.parse(io.stdout);
  assert.deepEqual(row, { personalBalance: 12.5, enterpriseId: null, enterpriseBalance: null });
});

test('企业成员额度为 0：如实显示 0，不当空列隐藏', async () => {
  const { deps } = fakeDeps({
    getEnterpriseBalance: async () => ({ enterpriseId: 'ent-1', balance: 0 }),
  });
  const io = await run(deps);
  // 列必须还在，且值确实是 0（不是空字符串被跳过）
  assert.match(io.stdout, /enterpriseBalance/);
  assert.match(io.stdout, /\b0\b/);
  const [row] = JSON.parse((await run(deps, ['-f', 'json'])).stdout);
  assert.deepEqual(row, { personalBalance: 12.5, enterpriseId: 'ent-1', enterpriseBalance: 0 });
});

test('企业余额响应缺字段：降级隐藏企业列，不伪造 0', async () => {
  const { deps, logs } = fakeDeps({
    getEnterpriseBalance: async () => { throw new Error('查询企业余额失败：响应缺少 balance'); },
  });
  const io = await run(deps);
  assert.match(io.stdout, /12\.5/);
  assert.doesNotMatch(io.stdout, /enterprise/i);
  assert.ok(logs.some((m) => /企业余额查询失败.*响应缺少 balance.*已隐藏企业列/.test(m)));
});

test('企业余额查询时登录态失效：不降级，直接报鉴权错误', async () => {
  const err = new AuthRequiredError('登录态已失效，请重新运行 zovii login');
  const { deps } = fakeDeps({ getEnterpriseBalance: async () => { throw err; } });
  const io = await run(deps);
  assert.match(io.stderr, /AuthRequiredError/);
  assert.equal(io.stdout, '');
});

test('balanceRow：企业成员带出 enterpriseId 与额度', () => {
  assert.deepEqual(balanceRow(1, { enterpriseId: 'e1', balance: 2 }), {
    personalBalance: 1,
    enterpriseId: 'e1',
    enterpriseBalance: 2,
  });
});
