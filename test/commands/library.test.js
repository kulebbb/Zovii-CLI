import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { register } from '../../src/commands/library.js';

const LIB_ID = '44444444-4444-4444-4444-444444444444';
const OWNER = { ownerType: 'user', ownerId: 'u1' };

function makeProgram(deps) {
  const program = new Command();
  program.exitOverride();
  program.option('-f, --format <fmt>', '', 'json');
  register(program, deps);
  return program;
}

function baseDeps(overrides = {}) {
  return {
    getToken: async () => 'tok',
    resolveLibraryOwner: async () => OWNER,
    ...overrides,
  };
}

// 跑一条命令，返回 stdout 解析出的 JSON 与 stderr 文本
async function run(deps, argv) {
  let out = '';
  let err = '';
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  const origExit = process.exit;
  const origLog = console.log;
  console.log = (s) => { out += `${s}\n`; };
  process.stderr.write = (s) => { err += s; return true; };
  process.exit = () => { throw new Error('__exit__'); };
  try {
    await makeProgram(deps).parseAsync(['node', 'zovii', 'library', ...argv]);
  } catch (e) {
    if (e.message !== '__exit__') throw e;
  } finally {
    console.log = origLog;
    process.stdout.write = origOut;
    process.stderr.write = origErr;
    process.exit = origExit;
  }
  return { json: out ? JSON.parse(out) : undefined, err };
}

test('library list 透传筛选条件并输出 libraryAssetId', async () => {
  let seen;
  const deps = baseDeps({
    resolveLibraryOwner: async (_t, o) => { seen = { owner: o }; return OWNER; },
    listLibraryAssets: async (_t, owner, opts) => {
      Object.assign(seen, { opts });
      return [{ id: LIB_ID, name: 'cat', type: 'image', owner_type: 'enterprise', tags: ['a'], is_pinned: true }];
    },
  });
  const { json } = await run(deps, ['list', '--enterprise', '--type', 'image', '--tag', 'a', '--limit', '5']);
  assert.deepEqual(seen.owner, { enterprise: true });
  assert.deepEqual(seen.opts, { type: 'image', tag: 'a', q: undefined, pinned: false, trash: false, limit: 5 });
  assert.equal(json[0].libraryAssetId, LIB_ID);
  assert.equal(json[0].library, 'enterprise');
  assert.deepEqual(json[0].tags, ['a']);
});

test('library trash 走回收站列表', async () => {
  let trash;
  const deps = baseDeps({ listLibraryAssets: async (_t, _o, opts) => { trash = opts.trash; return []; } });
  await run(deps, ['trash']);
  assert.equal(trash, true);
});

test('library list 非法 --type 报错', async () => {
  const { err } = await run(baseDeps(), ['list', '--type', 'doc']);
  assert.match(err, /--type 只能是/);
});

test('library export 逐个导出并对应资产库 ID → 项目素材 ID，接受 lib: 前缀', async () => {
  const exported = [];
  const deps = baseDeps({
    exportLibraryAsset: async (_t, project, id) => { exported.push([project, id]); return { id: `p-${exported.length}`, type: 'image' }; },
  });
  const { json } = await run(deps, ['export', 'proj', `lib:${LIB_ID},${LIB_ID}`]);
  assert.deepEqual(exported, [['proj', LIB_ID], ['proj', LIB_ID]]);
  assert.deepEqual(json.map((r) => [r.libraryAssetId, r.assetId]), [[LIB_ID, 'p-1'], [LIB_ID, 'p-2']]);
});

test('library import 把跳过的素材写到 stderr', async () => {
  const deps = baseDeps({
    importToLibrary: async (_t, _o, project, ids) => ({ items: [{ id: LIB_ID }], skipped: [ids[1]] }),
  });
  const { json, err } = await run(deps, ['import', 'proj', 'a1,a2']);
  assert.equal(json[0].libraryAssetId, LIB_ID);
  assert.match(err, /未收入.*a2/);
});

test('library upload 拆分标签', async () => {
  let tags;
  const deps = baseDeps({ uploadLibraryAsset: async (_t, _o, _f, opts) => { tags = opts.tags; return { id: LIB_ID }; } });
  await run(deps, ['upload', 'x.png', '--tags', 'cat, dog ,']);
  assert.deepEqual(tags, ['cat', 'dog']);
});

test('library tag 多个标签逐个添加', async () => {
  const added = [];
  const deps = baseDeps({ addLibraryTag: async (_t, id, tag) => { added.push(tag); return { id, tags: [...added] }; } });
  const { json } = await run(deps, ['tag', LIB_ID, 'a,b']);
  assert.deepEqual(added, ['a', 'b']);
  assert.deepEqual(json[0].tags, ['a', 'b']);
});

test('library pin / delete 校验 ID 形态', async () => {
  const { err } = await run(baseDeps(), ['pin', 'not-a-uuid']);
  assert.match(err, /不是有效的资产库素材 ID/);
  let deleted;
  await run(baseDeps({ deleteLibraryAsset: async (_t, id) => { deleted = id; return { id }; } }), ['delete', LIB_ID]);
  assert.equal(deleted, LIB_ID);
});
