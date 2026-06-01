import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { register } from '../../src/commands/create-group.js';

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
    getCanvasLayout: async () => null,
    saveCanvasLayout: async () => ({ ok: true }),
    resolveAssetSizes: async (_t, ids) => ids.map((id) => ({ id, width: 100, height: 100 })),
    ...overrides,
  };
}

test('create-group 带成员：保存的布局含分组与成员节点', async () => {
  const saved = [];
  const deps = baseDeps({ saveCanvasLayout: async (_t, _p, layout) => { saved.push(layout); return { ok: true }; } });
  const program = makeProgram(deps);
  process.stdout.write = () => true;
  await program.parseAsync([
    'node', 'zovii', 'create-group', 'proj1', '我的组',
    '--assets', '11111111-1111-1111-1111-111111111111', '--auto-organize',
  ]);
  assert.equal(saved.length, 1);
  const g = saved[0].groups[0];
  assert.equal(g.name, '我的组');
  assert.equal(g.layoutMode, 'tiled');
  assert.equal(g.memberOrder.length, 1);
  assert.ok(saved[0].nodes['asset_11111111-1111-1111-1111-111111111111'].groupId);
});

test('create-group 非法 asset id 抛 ArgumentError 且不保存', async () => {
  const saved = [];
  const deps = baseDeps({ saveCanvasLayout: async (..._a) => { saved.push(1); return {}; } });
  const program = makeProgram(deps);
  const origExit = process.exit;
  let stderrBuf = '';
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (s) => { stderrBuf += s; return true; };
  process.exit = () => { throw new Error('__exit__'); };
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'create-group', 'proj1', 'g', '--assets', 'not-a-uuid']),
      /__exit__/,
    );
    assert.match(stderrBuf, /asset id 非法/);
    assert.equal(saved.length, 0);
  } finally {
    process.exit = origExit;
    process.stderr.write = origStderr;
  }
});

test('create-group 不带成员：建空组', async () => {
  const saved = [];
  const deps = baseDeps({ saveCanvasLayout: async (_t, _p, layout) => { saved.push(layout); return {}; } });
  const program = makeProgram(deps);
  process.stdout.write = () => true;
  await program.parseAsync(['node', 'zovii', 'create-group', 'proj1', '空组']);
  assert.equal(saved[0].groups[0].memberOrder.length, 0);
  assert.equal(saved[0].groups[0].layoutMode, 'free');
});
