import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { register } from '../../src/commands/generate-image.js';

function captureIO() {
  const origExit = process.exit;
  const origStdout = process.stdout.write.bind(process.stdout);
  const origStderr = process.stderr.write.bind(process.stderr);
  let stdout = '', stderr = '', exitCode = null;
  process.stdout.write = (s) => { stdout += s; return true; };
  process.stderr.write = (s) => { stderr += s; return true; };
  process.exit = (code) => { exitCode = code; throw new Error('__exit__'); };
  return {
    get stdout() { return stdout; },
    get stderr() { return stderr; },
    get exitCode() { return exitCode; },
    restore: () => {
      process.exit = origExit;
      process.stdout.write = origStdout;
      process.stderr.write = origStderr;
    },
  };
}

function makeProgram(deps) {
  const program = new Command();
  program.exitOverride();
  program.option('-f, --format <fmt>', '', 'json');
  register(program, deps);
  return program;
}

function fakeAsset(id) {
  return {
    id,
    name: `Generated_${id}.jpg`,
    type: 'image',
    file_url: `https://cdn.example.com/${id}.jpg`,
    thumbnail_url: `https://cdn.example.com/${id}_t.webp`,
    metadata: { width: 1024, height: 1024 },
  };
}

function fakeDeps(overrides = {}) {
  const calls = {
    createTask: [], createBatchTasks: [], pollTask: [], pollTasks: [], resolveAssets: [],
  };
  const deps = {
    getToken: async () => 'fake-token',
    resolveAssetRefs: async () => [],
    createTask: async (token, payload) => {
      calls.createTask.push(payload);
      return { id: 'task-1', status: 'pending', credit_cost: 1, result_asset_ids: [] };
    },
    createBatchTasks: async (token, payload) => {
      calls.createBatchTasks.push(payload);
      const tasks = Array.from({ length: payload.count }, (_, i) => ({
        id: `task-${i + 1}`,
        status: 'pending',
        credit_cost: 1,
        result_asset_ids: [],
      }));
      return { batch_group_id: 'batch-1', tasks, total_credit_cost: payload.count };
    },
    pollTask: async (token, id) => {
      calls.pollTask.push(id);
      return { id, status: 'completed', credit_cost: 1, result_asset_ids: [`asset-${id}`] };
    },
    pollTasks: async (token, ids) => {
      calls.pollTasks.push(ids);
      return ids.map((id) => ({
        id, status: 'completed', credit_cost: 1, result_asset_ids: [`asset-${id}`],
      }));
    },
    resolveAssets: async (token, ids) => {
      calls.resolveAssets.push(ids);
      return ids.map(fakeAsset);
    },
    ...overrides,
  };
  return { deps, calls };
}

test('--prompt 空 → ArgumentError', async () => {
  const { deps } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1', '--prompt', '   ']),
      /__exit__/,
    );
    assert.match(io.stderr, /--prompt 不能为空/);
  } finally { io.restore(); }
});

test('--count 0 / 21 → ArgumentError', async () => {
  for (const n of ['0', '21', 'abc']) {
    const { deps } = fakeDeps();
    const program = makeProgram(deps);
    const io = captureIO();
    try {
      await assert.rejects(
        program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1', '--prompt', 'x', '--count', n]),
        /__exit__/,
      );
      assert.match(io.stderr, /--count 必须是 1-20 的整数/);
    } finally { io.restore(); }
  }
});

test('count=1 → 走 POST /tasks（createTask），payload 字段名对得上后端', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1',
      '--prompt', '一只猫',
      '--model', 'ws-nano-banana-pro',
      '--aspect-ratio', '3:4',
      '--size', '4K',
      '--count', '1',
    ]);
    assert.equal(calls.createTask.length, 1, '应调 createTask 一次');
    assert.equal(calls.createBatchTasks.length, 0, '不应调 createBatchTasks');
    const p = calls.createTask[0];
    assert.equal(p.project_id, 'proj-1');
    assert.equal(p.tool_id, 'ai_image');
    assert.equal(p.sub_feature_id, 'image_generation');
    assert.equal(p.model_id, 'ws-nano-banana-pro');
    assert.equal(p.params.prompt, '一只猫');
    assert.equal(p.params.aspect_ratio, '3:4');
    assert.equal(p.params.image_size, '4K');
    // 关键：单任务路径不再带 generation_count（后端不识别这个字段）
    assert.ok(!('generation_count' in p.params), 'params 不应包含 generation_count');
    // pollTask 被调用一次
    assert.deepEqual(calls.pollTask, ['task-1']);
  } finally { io.restore(); }
});

test('count=3 → 走 POST /tasks/batch（createBatchTasks），payload 是 BatchTaskCreate 格式', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1',
      '--prompt', '一只猫',
      '--aspect-ratio', '3:4',
      '--count', '3',
    ]);
    assert.equal(calls.createBatchTasks.length, 1, '应调 createBatchTasks 一次');
    assert.equal(calls.createTask.length, 0, '不应调 createTask');
    const p = calls.createBatchTasks[0];
    assert.equal(p.project_id, 'proj-1');
    assert.equal(p.tool_id, 'ai_image');
    assert.equal(p.sub_feature_id, 'image_generation');
    assert.equal(p.mode, 'multi_variation', 'mode 必须是 multi_variation 才能给每个 task 注入随机 seed → 出真正不同的图');
    assert.deepEqual(p.prompts, ['一只猫']);
    assert.equal(p.count, 3);
    assert.equal(p.shared_params.aspect_ratio, '3:4');
    // shared_params 不应包含 prompt（prompt 在 prompts 数组里）
    assert.ok(!('prompt' in p.shared_params), 'shared_params 不应包含 prompt');
    // pollTasks 被调用一次，传入 3 个 task id
    assert.equal(calls.pollTasks.length, 1);
    assert.equal(calls.pollTasks[0].length, 3);
  } finally { io.restore(); }
});

test('count=3 + --no-wait → 不轮询，直接输出 3 个 taskId', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1',
      '--prompt', '一只猫', '--count', '3', '--no-wait',
    ]);
    assert.equal(calls.createBatchTasks.length, 1);
    assert.equal(calls.pollTasks.length, 0, '不应轮询');
    const out = JSON.parse(io.stdout);
    assert.equal(out.length, 3, '输出 3 行（每个 task 1 行）');
  } finally { io.restore(); }
});

test('count=1 + --no-wait → 不轮询，直接输出 taskId', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1',
      '--prompt', '一只猫', '--no-wait',
    ]);
    assert.equal(calls.createTask.length, 1);
    assert.equal(calls.pollTask.length, 0, '不应轮询');
  } finally { io.restore(); }
});
