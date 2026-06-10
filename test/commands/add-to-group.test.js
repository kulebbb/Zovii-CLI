import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { register } from '../../src/commands/add-to-group.js';

function makeProgram(deps) {
  const program = new Command();
  program.exitOverride();
  program.option('-f, --format <fmt>', '', 'json');
  register(program, deps);
  return program;
}

const UUID = '22222222-2222-2222-2222-222222222222';

function baseDeps(overrides = {}) {
  return {
    getToken: async () => 'tok',
    getCanvasLayout: async () => ({
      nodes: {},
      groups: [{ id: 'g1', name: 'g', memberOrder: [] }],
      nextGroupNumber: 2,
    }),
    saveCanvasLayout: async () => ({ ok: true }),
    resolveAssetSizes: async (_t, ids) => ids.map((id) => ({ id, width: 100, height: 100 })),
    ...overrides,
  };
}

test('add-to-group 追加成员并保存', async () => {
  const saved = [];
  const deps = baseDeps({ saveCanvasLayout: async (_t, _p, layout) => { saved.push(layout); return {}; } });
  const program = makeProgram(deps);
  const origStdout = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    await program.parseAsync(['node', 'zovii', 'add-to-group', 'proj1', 'g1', '--assets', UUID]);
    assert.equal(saved[0].groups[0].memberOrder.length, 1);
    assert.ok(saved[0].nodes[`asset_${UUID}`].groupId === 'g1');
  } finally {
    process.stdout.write = origStdout;
  }
});

test('add-to-group 缺 --assets 抛 ArgumentError', async () => {
  const program = makeProgram(baseDeps());
  let stderrBuf = '';
  const origStderr = process.stderr.write.bind(process.stderr);
  const origExit = process.exit;
  process.stderr.write = (s) => { stderrBuf += s; return true; };
  process.exit = () => { throw new Error('__exit__'); };
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'add-to-group', 'proj1', 'g1']),
      /__exit__/,
    );
    assert.match(stderrBuf, /至少指定一个 asset/);
  } finally {
    process.stderr.write = origStderr;
    process.exit = origExit;
  }
});

test('add-to-group 组不存在抛 ArgumentError', async () => {
  const deps = baseDeps({
    getCanvasLayout: async () => ({ nodes: {}, groups: [], nextGroupNumber: 1 }),
  });
  const program = makeProgram(deps);
  let stderrBuf = '';
  const origStderr = process.stderr.write.bind(process.stderr);
  const origExit = process.exit;
  process.stderr.write = (s) => { stderrBuf += s; return true; };
  process.exit = () => { throw new Error('__exit__'); };
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'add-to-group', 'proj1', 'nope', '--assets', UUID]),
      /__exit__/,
    );
    assert.match(stderrBuf, /分组不存在/);
  } finally {
    process.stderr.write = origStderr;
    process.exit = origExit;
  }
});
