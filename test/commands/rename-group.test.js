import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { register } from '../../src/commands/rename-group.js';

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
    getCanvasLayout: async () => ({
      nodes: {},
      groups: [{ id: 'g1', name: '旧名', memberOrder: [] }],
      nextGroupNumber: 2,
    }),
    saveCanvasLayout: async () => ({ ok: true }),
    ...overrides,
  };
}

test('rename-group 改名并保存', async () => {
  const saved = [];
  const deps = baseDeps({ saveCanvasLayout: async (_t, _p, layout) => { saved.push(layout); return {}; } });
  const program = makeProgram(deps);
  const origStdout = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    await program.parseAsync(['node', 'zovii', 'rename-group', 'proj1', 'g1', '新名']);
    assert.equal(saved[0].groups[0].name, '新名');
  } finally {
    process.stdout.write = origStdout;
  }
});

test('rename-group 组不存在抛 ArgumentError', async () => {
  const program = makeProgram(baseDeps());
  let stderrBuf = '';
  const origStderr = process.stderr.write.bind(process.stderr);
  const origExit = process.exit;
  process.stderr.write = (s) => { stderrBuf += s; return true; };
  process.exit = () => { throw new Error('__exit__'); };
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'rename-group', 'proj1', 'nope', 'x']),
      /__exit__/,
    );
    assert.match(stderrBuf, /分组不存在/);
  } finally {
    process.stderr.write = origStderr;
    process.exit = origExit;
  }
});
