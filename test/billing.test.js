import { test } from 'node:test';
import assert from 'node:assert/strict';
import { money, approxImages, findProduct, pollOrder } from '../src/billing.js';
import { AuthRequiredError } from '../src/errors.js';

test('money：分 → table 用 ¥ 字符串，json 用元', () => {
  assert.equal(money(5000), '¥50');
  assert.equal(money(4990), '¥49.90');
  assert.equal(money(5000, 'json'), 50);
  assert.equal(money(null), null);
});

test('approxImages：按最低单图积分折算，基数缺失返回 null', () => {
  assert.equal(approxImages(500, 2), 250);
  assert.equal(approxImages(500, 0), null);
});

test('findProduct：套餐 → subscription，积分包 → credit_pack，大小写不敏感', () => {
  const plans = [{ id: 'pro', name: 'Pro' }];
  const packs = [{ id: 'pack_100', credits: 100 }];
  assert.equal(findProduct(plans, packs, 'PRO').orderType, 'subscription');
  assert.equal(findProduct(plans, packs, 'pack_100').orderType, 'credit_pack');
  assert.equal(findProduct(plans, packs, 'nope'), null);
});

const noSleep = async () => {};

test('pollOrder：paid 继续等，fulfilled 返回', async () => {
  const seq = ['pending', 'paid', 'fulfilled'];
  const done = await pollOrder(async () => ({ status: seq.shift() }), 'o1', {
    deadline: Date.now() + 60000,
    sleep: noSleep,
  });
  assert.equal(done.status, 'fulfilled');
});

test('pollOrder：cancelled / expired 抛错', async () => {
  for (const status of ['cancelled', 'expired']) {
    await assert.rejects(
      pollOrder(async () => ({ status }), 'o1', { deadline: Date.now() + 60000, sleep: noSleep }),
      /重新运行 zovii buy/,
    );
  }
});

test('pollOrder：到 deadline 未到账，返回最后一次状态（含 paid）', async () => {
  const done = await pollOrder(async () => ({ status: 'paid' }), 'o1', {
    deadline: Date.now() + 5,
    sleep: () => new Promise((r) => setTimeout(r, 10)),
  });
  assert.equal(done.status, 'paid');
});

test('pollOrder：单次查询失败继续轮询，登录失效直接抛出', async () => {
  let n = 0;
  const done = await pollOrder(
    async () => { n += 1; if (n === 1) throw new Error('network'); return { status: 'fulfilled' }; },
    'o1',
    { deadline: Date.now() + 60000, sleep: noSleep },
  );
  assert.equal(done.status, 'fulfilled');
  await assert.rejects(
    pollOrder(async () => { throw new AuthRequiredError(); }, 'o1', { deadline: Date.now() + 60000, sleep: noSleep }),
    AuthRequiredError,
  );
});
