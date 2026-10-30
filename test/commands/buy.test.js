import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { register } from '../../src/commands/buy.js';

const PLANS = [{ id: 'pro', name: 'Pro', monthly_price: 12500, yearly_price: 125000 }];
const PACKS = [{ id: 'pack_100', credits: 100, price: 3000 }];

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
  const calls = { createOrder: [], saveQrPng: [], renderQr: 0, logs: [] };
  const deps = {
    getToken: async () => 'tok',
    listPlans: async () => PLANS,
    listPacks: async () => PACKS,
    getBalance: async () => 600,
    createOrder: async (_t, body) => {
      calls.createOrder.push(body);
      return { order_id: 'ORD-1', product_name: '100 积分包', final_amount: 3000, original_amount: 3000, discount_amount: 0, status: 'pending' };
    },
    createWechatQrcode: async () => ({ order_id: 'ORD-1', code_url: 'weixin://wxpay/x', expires_at: new Date(Date.now() + 60000).toISOString() }),
    getOrderStatus: async () => ({ status: 'fulfilled' }),
    saveQrPng: async (path, text) => { calls.saveQrPng.push({ path, text }); },
    renderQrTerminal: async () => { calls.renderQr += 1; return '[QR]'; },
    isTTY: () => false,
    log: (msg) => { calls.logs.push(msg); },
    pollIntervalMs: 0,
    ...overrides,
  };
  return { deps, calls };
}

async function run(deps, argv) {
  const program = new Command();
  program.exitOverride();
  program.option('-f, --format <fmt>', '', 'json');
  register(program, deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'buy', ...argv]);
  } catch (err) {
    if (err.message !== '__exit__') throw err;
  } finally {
    io.restore();
  }
  return io;
}

test('订阅默认月付，--yearly 改年付，券码透传', async () => {
  const { deps, calls } = fakeDeps();
  await run(deps, ['pro', '--no-wait']);
  await run(deps, ['pro', '--yearly', '--coupon', 'SAVE10', '--no-wait']);
  assert.deepEqual(calls.createOrder[0], { orderType: 'subscription', productId: 'pro', billingCycle: 'monthly', couponCode: undefined });
  assert.equal(calls.createOrder[1].billingCycle, 'yearly');
  assert.equal(calls.createOrder[1].couponCode, 'SAVE10');
});

test('积分包不带 billing_cycle；加 --yearly 报参数错误且不下单', async () => {
  const { deps, calls } = fakeDeps();
  await run(deps, ['pack_100', '--no-wait']);
  assert.equal(calls.createOrder[0].orderType, 'credit_pack');
  assert.equal(calls.createOrder[0].billingCycle, undefined);
  const io = await run(deps, ['pack_100', '--yearly']);
  assert.match(io.stderr, /--yearly 只适用于订阅套餐/);
  assert.equal(calls.createOrder.length, 1);
});

test('未知商品：列出可选 productId，不下单', async () => {
  const { deps, calls } = fakeDeps();
  const io = await run(deps, ['nope']);
  assert.match(io.stderr, /可选：pro, pack_100/);
  assert.equal(calls.createOrder.length, 0);
});

test('--no-wait：保存 PNG 后立即返回 pending，不轮询', async () => {
  let polled = 0;
  const { deps, calls } = fakeDeps({ getOrderStatus: async () => { polled += 1; return { status: 'fulfilled' }; } });
  const io = await run(deps, ['pack_100', '--no-wait', '--qr-out', '/tmp/x.png']);
  const [row] = JSON.parse(io.stdout);
  assert.equal(row.status, 'pending');
  assert.equal(row.amount, 30);
  assert.equal(row.qrPath, '/tmp/x.png');
  assert.deepEqual(calls.saveQrPng[0], { path: '/tmp/x.png', text: 'weixin://wxpay/x' });
  assert.equal(polled, 0);
});

test('非 TTY 不画字符二维码，TTY 才画', async () => {
  const a = fakeDeps();
  await run(a.deps, ['pack_100', '--no-wait']);
  assert.equal(a.calls.renderQr, 0);
  const b = fakeDeps({ isTTY: () => true });
  await run(b.deps, ['pack_100', '--no-wait']);
  assert.equal(b.calls.renderQr, 1);
});

test('等待到账后输出 fulfilled 与新余额', async () => {
  const { deps } = fakeDeps();
  const io = await run(deps, ['pack_100']);
  const [row] = JSON.parse(io.stdout);
  assert.equal(row.status, 'fulfilled');
  assert.equal(row.balance, 600);
});

test('全额抵扣券：后端直接 fulfilled，不取二维码', async () => {
  let qrCalls = 0;
  const { deps } = fakeDeps({
    createOrder: async () => ({ order_id: 'ORD-2', final_amount: 0, status: 'fulfilled' }),
    createWechatQrcode: async () => { qrCalls += 1; return {}; },
  });
  const io = await run(deps, ['pack_100', '--coupon', 'FREE']);
  assert.equal(JSON.parse(io.stdout)[0].status, 'fulfilled');
  assert.equal(qrCalls, 0);
});

test('--timeout 非法：下单前就报错', async () => {
  const { deps, calls } = fakeDeps();
  const io = await run(deps, ['pack_100', '--timeout', 'abc']);
  assert.match(io.stderr, /--timeout 须为正数/);
  assert.equal(calls.createOrder.length, 0);
});

test('等待超时时已是 paid：提示勿重复购买', async () => {
  const { deps } = fakeDeps({ getOrderStatus: async () => ({ status: 'paid' }) });
  const io = await run(deps, ['pack_100', '--timeout', '0.01']);
  assert.match(io.stderr, /已收到付款.*zovii order ORD-1.*请勿重复购买/);
});

test('商品名取下单接口返回的 product_name，订阅附带付费周期', async () => {
  const { deps } = fakeDeps({
    createOrder: async () => ({ order_id: 'ORD-3', product_name: 'Pro', final_amount: 125000, status: 'pending' }),
  });
  const io = await run(deps, ['pro', '--yearly', '--no-wait']);
  assert.equal(JSON.parse(io.stdout)[0].product, 'Pro（年付）');
});
