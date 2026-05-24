import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendCode, loginWithPhoneCode } from '../../src/auth/phone.js';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

function withTmpHome() {
  const dir = mkdtempSync(join(tmpdir(), 'zovii-test-home-'));
  const origHome = process.env.HOME;
  process.env.HOME = dir;
  return {
    dir,
    authFile: join(dir, '.config', 'zovii', 'auth.json'),
    restore: () => {
      process.env.HOME = origHome;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

// 一个最小 JWT（payload.exp=2000000000，HS256 header 是占位）
const FAKE_JWT = (() => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'u1', exp: 2000000000 })).toString('base64url');
  return `${header}.${payload}.fakesig`;
})();

function tokenResponse() {
  return ok({
    access_token: FAKE_JWT,
    refresh_token: 'refresh-xxx',
    token_type: 'bearer',
    user: { id: 'u1', username: 'tester', credits_balance: 100 },
  });
}

test('loginWithPhoneCode 成功后写 auth.json 并返回 user/expires_at', async () => {
  const home = withTmpHome();
  const stub = withFetch(() => tokenResponse());
  try {
    const result = await loginWithPhoneCode('13800000000', '123456');
    assert.equal(stub.calls.length, 1);
    assert.match(stub.calls[0].url, /\/auth\/phone-login$/);
    assert.deepEqual(JSON.parse(stub.calls[0].opts.body), { phone: '13800000000', code: '123456' });
    assert.equal(result.user.username, 'tester');
    assert.equal(result.expires_at, 2000000000);
    // 落盘
    assert.equal(existsSync(home.authFile), true);
    const saved = JSON.parse(readFileSync(home.authFile, 'utf8'));
    assert.equal(saved.access_token, FAKE_JWT);
    assert.equal(saved.refresh_token, 'refresh-xxx');
    assert.equal(saved.expires_at, 2000000000);
  } finally { stub.restore(); home.restore(); }
});

test('loginWithPhoneCode 400 抛"验证码错误或已过期"', async () => {
  const stub = withFetch(() => fail(400, { detail: 'invalid code' }));
  try {
    await assert.rejects(loginWithPhoneCode('13800000000', '123456'),
      (err) => { assert.equal(err.name, 'CommandError'); assert.match(err.message, /验证码错误或已过期/); return true; });
  } finally { stub.restore(); }
});

test('loginWithPhoneCode 401 同上', async () => {
  const stub = withFetch(() => fail(401, { detail: 'unauthorized' }));
  try {
    await assert.rejects(loginWithPhoneCode('13800000000', '123456'), /验证码错误或已过期/);
  } finally { stub.restore(); }
});

test('loginWithPhoneCode 403 抛温和的账号限制提示', async () => {
  const stub = withFetch(() => fail(403, { detail: 'locked' }));
  try {
    await assert.rejects(loginWithPhoneCode('13800000000', '123456'),
      (err) => {
        assert.equal(err.name, 'CommandError');
        assert.match(err.message, /暂时无法登录/);
        assert.match(err.message, /约 15 分钟/);
        assert.doesNotMatch(err.message, /锁定|被锁|过多/);
        return true;
      });
  } finally { stub.restore(); }
});

test('loginWithPhoneCode 404 抛"尚未注册"提示', async () => {
  const stub = withFetch(() => fail(404, { detail: 'user not found' }));
  try {
    await assert.rejects(loginWithPhoneCode('13800000000', '123456'),
      (err) => { assert.match(err.message, /尚未注册/); assert.match(err.message, /zovii\.studio/); return true; });
  } finally { stub.restore(); }
});

test('loginWithPhoneCode 5xx 抛通用消息', async () => {
  const stub = withFetch(() => fail(500, { detail: 'oops' }));
  try {
    await assert.rejects(loginWithPhoneCode('13800000000', '123456'), /登录失败.*HTTP 500.*oops/);
  } finally { stub.restore(); }
});
