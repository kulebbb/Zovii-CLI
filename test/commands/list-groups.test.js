import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { register } from '../../src/commands/list-groups.js';

function makeProgram(deps) {
  const program = new Command();
  program.exitOverride();
  program.option('-f, --format <fmt>', '', 'json');
  register(program, deps);
  return program;
}

test('list-groups 输出分组行（JSON）', async () => {
  const deps = {
    getToken: async () => 'tok',
    getCanvasLayout: async () => ({
      nodes: {},
      groups: [{ id: 'g1', name: '组一', layoutMode: 'tiled', memberOrder: ['asset_a'] }],
      nextGroupNumber: 2,
    }),
  };
  const program = makeProgram(deps);
  const origStdout = process.stdout.write.bind(process.stdout);
  let buf = '';
  process.stdout.write = (s) => { buf += s; return true; };
  try {
    await program.parseAsync(['node', 'zovii', 'list-groups', 'proj1']);
    const rows = JSON.parse(buf);
    assert.equal(rows[0].groupId, 'g1');
    assert.equal(rows[0].autoOrganize, 'on');
    assert.equal(rows[0].memberCount, 1);
  } finally {
    process.stdout.write = origStdout;
  }
});
