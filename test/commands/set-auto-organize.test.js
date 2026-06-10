import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { register } from '../../src/commands/set-auto-organize.js';

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
      groups: [{ id: 'g1', name: 'g', layoutMode: 'free', memberOrder: [] }],
      nextGroupNumber: 2,
    }),
    saveCanvasLayout: async () => ({ ok: true }),
    ...overrides,
  };
}

test('set-auto-organize on → layoutMode tiled', async () => {
  const saved = [];
  const deps = baseDeps({ saveCanvasLayout: async (_t, _p, layout) => { saved.push(layout); return {}; } });
  const program = makeProgram(deps);
  const origStdout = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    await program.parseAsync(['node', 'zovii', 'set-auto-organize', 'proj1', 'g1', 'on']);
    assert.equal(saved[0].groups[0].layoutMode, 'tiled');
  } finally {
    process.stdout.write = origStdout;
  }
});

test('set-auto-organize off → layoutMode free', async () => {
  const saved = [];
  const deps = baseDeps({
    getCanvasLayout: async () => ({ nodes: {}, groups: [{ id: 'g1', name: 'g', layoutMode: 'tiled', memberOrder: [] }], nextGroupNumber: 2 }),
    saveCanvasLayout: async (_t, _p, layout) => { saved.push(layout); return {}; },
  });
  const program = makeProgram(deps);
  const origStdout = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    await program.parseAsync(['node', 'zovii', 'set-auto-organize', 'proj1', 'g1', 'off']);
    assert.equal(saved[0].groups[0].layoutMode, 'free');
  } finally {
    process.stdout.write = origStdout;
  }
});

test('set-auto-organize 非法状态值抛 ArgumentError 且不保存', async () => {
  const saved = [];
  const deps = baseDeps({ saveCanvasLayout: async () => { saved.push(1); return {}; } });
  const program = makeProgram(deps);
  let stderrBuf = '';
  const origStderr = process.stderr.write.bind(process.stderr);
  const origExit = process.exit;
  process.stderr.write = (s) => { stderrBuf += s; return true; };
  process.exit = () => { throw new Error('__exit__'); };
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'set-auto-organize', 'proj1', 'g1', 'maybe']),
      /__exit__/,
    );
    assert.match(stderrBuf, /on.*off|状态/);
    assert.equal(saved.length, 0);
  } finally {
    process.stderr.write = origStderr;
    process.exit = origExit;
  }
});
