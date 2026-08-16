import test from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch, throwHttpError } from '../src/utils.js';

const resp = (status, bodyText) => ({
  status,
  text: async () => bodyText,
});

// ---------- throwHttpError ----------

test('throwHttpError: 2xx 不抛', () => {
  assert.doesNotThrow(() => throwHttpError(204, '/x'));
});

test('throwHttpError: 401/403/402/404/429 分支保持不变', () => {
  assert.throws(() => throwHttpError(401, '/x'), { name: 'AuthRequiredError' });
  assert.throws(() => throwHttpError(403, '/x'), { name: 'AuthRequiredError' });
  assert.throws(() => throwHttpError(402, '/x'), /积分不足/);
  assert.throws(() => throwHttpError(404, '/x'), /资源不存在/);
  assert.throws(() => throwHttpError(429, '/x'), /请求过于频繁/);
});

test('throwHttpError: 400 已知 code 转中文并挂 err.code', () => {
  assert.throws(() => throwHttpError(400, '/tasks', { code: 'model_not_available' }), (err) => {
    assert.equal(err.name, 'CommandError');
    assert.match(err.message, /该模型不支持所选参数组合/);
    assert.match(err.message, /zovii list-models/);
    assert.equal(err.code, 'model_not_available');
    return true;
  });
  assert.throws(() => throwHttpError(400, '/tasks', { code: 'prompt_required' }), /--prompt/);
  assert.throws(() => throwHttpError(400, '/tasks', { code: 'duration_unavailable' }), /时长/);
});

test('throwHttpError: 400 未知 code 原样附上', () => {
  assert.throws(() => throwHttpError(400, '/tasks', { code: 'weird_thing' }), (err) => {
    assert.equal(err.message, '请求失败：weird_thing');
    assert.equal(err.code, 'weird_thing');
    return true;
  });
});

test('throwHttpError: 400 未知 code 附带 detail.message', () => {
  assert.throws(
    () => throwHttpError(400, '/tasks', { code: 'weird_thing', message: 'duration 超出上限' }),
    (err) => {
      assert.equal(err.message, '请求失败：weird_thing：duration 超出上限');
      assert.equal(err.code, 'weird_thing');
      return true;
    },
  );
});

test('throwHttpError: 400 已知 code 不受 detail.message 影响', () => {
  assert.throws(
    () => throwHttpError(400, '/tasks', { code: 'prompt_required', message: 'noise' }),
    (err) => {
      assert.equal(err.message, '该模型要求提供提示词 --prompt');
      return true;
    },
  );
});

test('throwHttpError: 400 detail 是无 code 的对象/数组则序列化截断附上', () => {
  assert.throws(() => throwHttpError(400, '/tasks', { loc: ['body', 'duration'], msg: 'bad' }), (err) => {
    assert.equal(err.message, '请求失败：{"loc":["body","duration"],"msg":"bad"}');
    return true;
  });
  assert.throws(() => throwHttpError(400, '/tasks', [{ msg: 'bad' }]), (err) => {
    assert.equal(err.message, '请求失败：[{"msg":"bad"}]');
    return true;
  });
  // 超长内容截断到 200 字符
  assert.throws(() => throwHttpError(400, '/tasks', { msg: 'x'.repeat(500) }), (err) => {
    assert.equal(err.message.length, '请求失败：'.length + 200);
    return true;
  });
});

test('throwHttpError: detail 是字符串则原样附上', () => {
  assert.throws(() => throwHttpError(400, '/tasks', '参数 duration 非法'), (err) => {
    assert.equal(err.message, '请求失败：参数 duration 非法');
    return true;
  });
});

test('throwHttpError: 400 无 detail 回落到 HTTP 文案', () => {
  assert.throws(() => throwHttpError(400, '/tasks'), /请求失败：HTTP 400 \(\/tasks\)/);
});

// ---------- apiFetch ----------

test('apiFetch: 正常返回 JSON', async () => {
  const data = await apiFetch('/ping', {
    fetchImpl: async () => resp(200, JSON.stringify({ ok: 1 })),
  });
  assert.deepEqual(data, { ok: 1 });
});

test('apiFetch: 空 body 返回 null', async () => {
  const data = await apiFetch('/ping', { fetchImpl: async () => resp(200, '  ') });
  assert.equal(data, null);
});

test('apiFetch: 透传后端 400 的 detail.code', async () => {
  await assert.rejects(
    apiFetch('/tasks', {
      method: 'POST',
      body: {},
      fetchImpl: async () =>
        resp(400, JSON.stringify({ detail: { code: 'model_not_available', foo: 1 } })),
    }),
    (err) => {
      assert.equal(err.code, 'model_not_available');
      assert.match(err.message, /该模型不支持所选参数组合/);
      return true;
    },
  );
});

test('apiFetch: 400 body 非 JSON 时回落到 HTTP 文案', async () => {
  await assert.rejects(apiFetch('/tasks', { fetchImpl: async () => resp(400, '<html>') }), {
    name: 'CommandError',
    message: /HTTP 400/,
  });
});

test('apiFetch: 请求头与 URL 正确', async () => {
  let seen;
  await apiFetch('/tasks', {
    method: 'POST',
    token: 'tk',
    body: { a: 1 },
    fetchImpl: async (url, opts) => {
      seen = { url, opts };
      return resp(200, '{}');
    },
  });
  assert.equal(seen.url, 'https://zovii.studio/api/v1/tasks');
  assert.equal(seen.opts.headers.Authorization, 'Bearer tk');
  assert.equal(seen.opts.headers['Content-Type'], 'application/json');
  assert.equal(seen.opts.body, '{"a":1}');
});
