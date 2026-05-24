import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendCode } from '../../src/auth/phone.js';

function withFetch(handler) {
  const orig = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return handler(url, opts);
  };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}

function ok(json) {
  return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
}

function fail(status, json) {
  return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
}

test('sendCode 成功调用后端并返回 { ok: true }', async () => {
  const stub = withFetch(() => ok({ ok: true }));
  try {
    const result = await sendCode('13800000000');
    assert.deepEqual(result, { ok: true });
    assert.equal(stub.calls.length, 1);
    assert.match(stub.calls[0].url, /\/auth\/send-code$/);
    assert.equal(stub.calls[0].opts.method, 'POST');
    assert.equal(stub.calls[0].opts.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(stub.calls[0].opts.body), { phone: '13800000000', purpose: 'login' });
  } finally { stub.restore(); }
});

test('sendCode 允许覆盖 purpose', async () => {
  const stub = withFetch(() => ok({ ok: true }));
  try {
    await sendCode('13800000000', { purpose: 'reset_password' });
    assert.deepEqual(JSON.parse(stub.calls[0].opts.body), { phone: '13800000000', purpose: 'reset_password' });
  } finally { stub.restore(); }
});

test('sendCode 429 抛 CommandError 带"过于频繁"提示', async () => {
  const stub = withFetch(() => fail(429, { detail: '60 秒后重试' }));
  try {
    await assert.rejects(sendCode('13800000000'), (err) => {
      assert.equal(err.name, 'CommandError');
      assert.match(err.message, /过于频繁/);
      assert.match(err.message, /60 秒后重试/);
      assert.match(err.message, /HTTP 429/);
      return true;
    });
  } finally { stub.restore(); }
});

test('sendCode 422 抛 CommandError 带"格式被后端拒绝"', async () => {
  const stub = withFetch(() => fail(422, { detail: '手机号无效' }));
  try {
    await assert.rejects(sendCode('13800000000'), /格式被后端拒绝.*HTTP 422.*手机号无效/);
  } finally { stub.restore(); }
});

test('sendCode 5xx 抛 CommandError 带通用消息', async () => {
  const stub = withFetch(() => fail(500, { detail: '内部错误' }));
  try {
    await assert.rejects(sendCode('13800000000'), /发送失败.*HTTP 500.*内部错误/);
  } finally { stub.restore(); }
});

test('sendCode fetch 抛异常时透传 message', async () => {
  const stub = withFetch(() => { throw new Error('ENOTFOUND'); });
  try {
    await assert.rejects(sendCode('13800000000'), /ENOTFOUND/);
  } finally { stub.restore(); }
});
