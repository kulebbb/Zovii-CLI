import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  throwHttpError,
  resolveAssetRef,
  exportLibraryAsset,
  resolveLibraryOwner,
  listLibraryAssets,
  downloadLibraryAsset,
} from '../src/utils.js';

const LIB_ID = '33333333-3333-3333-3333-333333333333';

function resp(status, body) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}

// 按「方法 + 路径前缀」依次匹配假响应，记录每次请求便于断言
async function withFetch(handler, fn) {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const call = { method: opts.method ?? 'GET', path: u.pathname.replace('/api/v1', ''), query: u.searchParams, body: opts.body ? JSON.parse(opts.body) : undefined };
    calls.push(call);
    return handler(call);
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = orig;
  }
}

const ME_ENT = { id: 'u1', enterprise_id: 'e1' };

test('throwHttpError: 带 detail 的 403 是无权限，不提示重登', () => {
  assert.throws(() => throwHttpError(403, '/x', 'No permission to modify this asset'), {
    name: 'CommandError',
    message: /无权限：No permission/,
  });
  assert.throws(
    () => throwHttpError(403, '/x', { code: 'enterprise_inactive', message: '企业已停用' }),
    /无权限：企业已停用/,
  );
});

test('resolveLibraryOwner: 默认个人库；非企业成员用 --enterprise 报错', async () => {
  await withFetch(() => resp(200, { id: 'u1', enterprise_id: null }), async () => {
    assert.deepEqual(await resolveLibraryOwner('t'), { ownerType: 'user', ownerId: 'u1' });
    await assert.rejects(resolveLibraryOwner('t', { enterprise: true }), /不是企业成员/);
  });
  await withFetch(() => resp(200, ME_ENT), async () => {
    assert.deepEqual(await resolveLibraryOwner('t', { enterprise: true }), {
      ownerType: 'enterprise',
      ownerId: 'e1',
    });
  });
});

test('listLibraryAssets: 超过单页上限时按 offset 翻页，取够 limit 为止', async () => {
  const page = (n, start) => Array.from({ length: n }, (_, i) => ({ id: `a${start + i}` }));
  await withFetch(
    (c) => resp(200, { items: page(Number(c.query.get('limit')), Number(c.query.get('offset'))) }),
    async (calls) => {
      const items = await listLibraryAssets('t', { ownerType: 'user', ownerId: 'u1' }, { limit: 250, tag: 'cat' });
      assert.equal(items.length, 250);
      assert.deepEqual(calls.map((c) => [c.query.get('limit'), c.query.get('offset')]), [['200', '0'], ['50', '200']]);
      assert.equal(calls[0].query.get('tag'), 'cat');
      assert.equal(calls[0].query.get('owner_type'), 'user');
    },
  );
});

test('exportLibraryAsset: 个人库没有则转试企业库', async () => {
  await withFetch(
    (c) => {
      if (c.path === '/auth/me') return resp(200, ME_ENT);
      return resp(200, c.body.owner_type === 'enterprise' ? [{ id: 'p-new' }] : []);
    },
    async (calls) => {
      const asset = await exportLibraryAsset('t', 'proj', LIB_ID);
      assert.equal(asset.id, 'p-new');
      const exports = calls.filter((c) => c.path === '/library/assets/export-to-project');
      assert.deepEqual(exports.map((c) => c.body.owner_type), ['user', 'enterprise']);
      assert.deepEqual(exports[1].body, { asset_ids: [LIB_ID], project_id: 'proj', owner_type: 'enterprise', owner_id: 'e1' });
    },
  );
});

test('exportLibraryAsset: 两个库都没有则报不存在', async () => {
  await withFetch((c) => (c.path === '/auth/me' ? resp(200, ME_ENT) : resp(200, [])), async () => {
    await assert.rejects(exportLibraryAsset('t', 'proj', LIB_ID), /资产库素材不存在或已删除/);
  });
});

test('resolveAssetRef: lib: 前缀先导出到项目，返回项目素材 ID', async () => {
  await withFetch(
    (c) => (c.path === '/auth/me' ? resp(200, { id: 'u1' }) : resp(200, [{ id: 'p-new' }])),
    async () => {
      assert.equal(await resolveAssetRef('t', 'proj', ` lib:${LIB_ID} `), 'p-new');
    },
  );
});

test('resolveAssetRef: lib: 后不是 UUID 直接报参数错', async () => {
  await assert.rejects(resolveAssetRef('t', 'proj', 'lib:abc'), { name: 'ArgumentError' });
});

// download 的两种后端返回：302 到 COS 直链 / 直接回剥离元数据后的字节
async function withDownloadFetch(downloadResp, fn) {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    if (String(url).endsWith('/download')) return downloadResp();
    if (String(url).endsWith('/mark-downloaded')) return resp(200, { id: LIB_ID, name: 'cat' });
    return new Response('BYTES', { status: 200 }); // COS 直链
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = orig;
  }
}

test('downloadLibraryAsset: 302 时手动跟随，不把 token 带到直链，扩展名取自直链', async () => {
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'zovii-lib-'));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    await withDownloadFetch(
      () => new Response(null, { status: 302, headers: { location: 'https://cos.example.com/library/user/u1/x.png?sign=1' } }),
      async (calls) => {
        const r = await downloadLibraryAsset('t', LIB_ID);
        assert.equal(r.localPath, 'cat.png');
        assert.equal(r.bytes, 5);
        assert.equal(calls[0].opts.redirect, 'manual');
        const cos = calls.find((c) => c.url.startsWith('https://cos.example.com'));
        assert.equal(cos.opts.headers, undefined);
      },
    );
  } finally {
    process.chdir(cwd);
  }
});

test('downloadLibraryAsset: 直接回字节时文件名取 Content-Disposition，不建嵌套目录', async () => {
  const { mkdtemp, readdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'zovii-lib-'));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    await withDownloadFetch(
      () => new Response('STRIPPED', {
        status: 200,
        headers: { 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent('猫图.png')}` },
      }),
      async () => {
        const r = await downloadLibraryAsset('t', LIB_ID);
        assert.equal(r.localPath, '猫图.png');
        assert.deepEqual(await readdir('.'), ['猫图.png']);
      },
    );
  } finally {
    process.chdir(cwd);
  }
});
