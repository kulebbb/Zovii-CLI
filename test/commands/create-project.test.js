import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { register } from '../../src/commands/create-project.js';

function makeProgram(deps) {
  const program = new Command();
  program.exitOverride();
  program.option('-f, --format <fmt>', '', 'json');
  register(program, deps);
  return program;
}

function baseDeps(overrides = {}) {
  const calls = { createProject: [], getMe: 0, prompt: 0 };
  const deps = {
    getToken: async () => 'tok',
    getMe: async () => { calls.getMe += 1; return { id: 'u1', enterprise_id: null }; },
    createProject: async (_t, name, opts) => {
      calls.createProject.push({ name, opts });
      return { id: 'p1', name, enterprise_id: opts?.personalProject === false ? 'ent1' : null, created_at: 't' };
    },
    promptLine: async () => { calls.prompt += 1; return ''; },
    isTTY: () => true,
    ...overrides,
  };
  return { deps, calls };
}

async function run(deps, argv) {
  const program = makeProgram(deps);
  const origStdout = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    await program.parseAsync(['node', 'zovii', 'create-project', ...argv]);
  } finally {
    process.stdout.write = origStdout;
  }
}

test('非企业用户：不查交互、直接个人项目(personalProject=true)', async () => {
  const { deps, calls } = baseDeps();
  await run(deps, ['我的项目']);
  assert.equal(calls.getMe, 1);
  assert.equal(calls.prompt, 0);
  assert.equal(calls.createProject[0].opts.personalProject, true);
});

test('企业成员 + TTY：交互选 2 → 企业项目(personalProject=false)', async () => {
  const { deps, calls } = baseDeps({
    getMe: async () => ({ id: 'u1', enterprise_id: 'ent1' }),
    promptLine: async () => '2',
  });
  await run(deps, ['企业项目']);
  assert.equal(calls.createProject[0].opts.personalProject, false);
});

test('企业成员 + TTY：直接回车（空）→ 默认个人项目', async () => {
  const { deps, calls } = baseDeps({
    getMe: async () => ({ id: 'u1', enterprise_id: 'ent1' }),
    promptLine: async () => '',
  });
  await run(deps, ['x']);
  assert.equal(calls.createProject[0].opts.personalProject, true);
});

test('企业成员 + 非 TTY：不交互，默认个人项目', async () => {
  const promptCalls = [];
  const { deps, calls } = baseDeps({
    getMe: async () => ({ id: 'u1', enterprise_id: 'ent1' }),
    isTTY: () => false,
    promptLine: async () => { promptCalls.push(1); return '2'; },
  });
  await run(deps, ['x']);
  assert.equal(promptCalls.length, 0);
  assert.equal(calls.createProject[0].opts.personalProject, true);
});

test('--type enterprise：跳过 /me 与交互，直接企业项目', async () => {
  const { deps, calls } = baseDeps();
  await run(deps, ['x', '--type', 'enterprise']);
  assert.equal(calls.getMe, 0);
  assert.equal(calls.prompt, 0);
  assert.equal(calls.createProject[0].opts.personalProject, false);
});

test('--type personal：跳过 /me 与交互，直接个人项目', async () => {
  const { deps, calls } = baseDeps();
  await run(deps, ['x', '--type', 'personal']);
  assert.equal(calls.getMe, 0);
  assert.equal(calls.createProject[0].opts.personalProject, true);
});

test('--type 非法值 → 报错且不创建', async () => {
  const { deps, calls } = baseDeps();
  const origExit = process.exit;
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stderr.write = () => true;
  process.exit = () => { throw new Error('__exit__'); };
  try {
    await assert.rejects(run(deps, ['x', '--type', 'team']));
  } finally {
    process.exit = origExit;
    process.stderr.write = origStderr;
  }
  assert.equal(calls.createProject.length, 0);
});
