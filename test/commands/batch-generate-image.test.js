import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { register } from '../../src/commands/batch-generate-image.js';

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
    resolveAssetRefs: [], createBatchTasks: [], pollTasks: [], resolveAssets: [],
  };
  const deps = {
    getToken: async () => 'fake-token',
    resolveAssetRefs: async (token, project, refsCsv) => {
      calls.resolveAssetRefs.push(refsCsv);
      return [];
    },
    createBatchTasks: async (token, payload) => {
      calls.createBatchTasks.push(payload);
      const tasks = payload.prompts.map((_, i) => ({
        id: `task-${i + 1}`,
        status: 'pending',
        credit_cost: 1,
        result_asset_ids: [],
      }));
      return { batch_group_id: 'batch-1', tasks, total_credit_cost: tasks.length };
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

test('不传 --prompt → ArgumentError', async () => {
  const { deps } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'batch-generate-image', 'proj-1']),
      /__exit__/,
    );
    assert.match(io.stderr, /--prompt 不能为空/);
  } finally { io.restore(); }
});

test('--prompt 全是空白 → ArgumentError', async () => {
  const { deps } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'batch-generate-image', 'proj-1',
        '--prompt', '   ', '--prompt', '']),
      /__exit__/,
    );
    assert.match(io.stderr, /--prompt 不能为空/);
  } finally { io.restore(); }
});

test('--prompt 21 条 → ArgumentError', async () => {
  const { deps } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  const args = ['node', 'zovii', 'batch-generate-image', 'proj-1'];
  for (let i = 0; i < 21; i++) args.push('--prompt', `p${i}`);
  try {
    await assert.rejects(program.parseAsync(args), /__exit__/);
    assert.match(io.stderr, /--prompt 最多 20 条/);
  } finally { io.restore(); }
});

test('模型白名单：generate-image 可用但 batch 不可用的模型 → 报错', async () => {
  // web「批量图像」工具仅 4 模型，ws-gpt-image-2 / ws-nano-banana-pro 都不在内
  for (const m of ['ws-gpt-image-2', 'ws-nano-banana-pro']) {
    const { deps } = fakeDeps();
    const program = makeProgram(deps);
    const io = captureIO();
    try {
      await assert.rejects(
        program.parseAsync(['node', 'zovii', 'batch-generate-image', 'proj-1',
          '--prompt', 'x', '--model', m]),
        /__exit__/,
      );
      assert.match(io.stderr, /未知模型/);
    } finally { io.restore(); }
  }
});

test('--aspect-ratio 非法值 → ArgumentError', async () => {
  const { deps } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'batch-generate-image', 'proj-1',
        '--prompt', 'x', '--aspect-ratio', '7:5']),
      /__exit__/,
    );
    assert.match(io.stderr, /--aspect-ratio 只能是/);
  } finally { io.restore(); }
});

test('--size 非法值 → ArgumentError', async () => {
  const { deps } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'batch-generate-image', 'proj-1',
        '--prompt', 'x', '--size', '8K']),
      /__exit__/,
    );
    assert.match(io.stderr, /--size 只能是/);
  } finally { io.restore(); }
});

test('--image-input 超过 10 个 → ArgumentError', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  const refs = Array.from({ length: 11 }, (_, i) => `ref${i}`).join(',');
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'batch-generate-image', 'proj-1',
        '--prompt', 'x', '--image-input', refs]),
      /__exit__/,
    );
    assert.match(io.stderr, /--image-input 最多 10 张/);
    assert.equal(calls.resolveAssetRefs.length, 0, '校验应在解析/上传之前');
  } finally { io.restore(); }
});

test('payload 走 ai_image 通道的 batch_text_to_image（tool_id/sub_feature_id/mode/prompts/count）', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'batch-generate-image', 'proj-1',
      '--prompt', '赛博朋克城市夜景',
      '--prompt', '  雪山下的湖泊  ',
      '--prompt', '森林里的木屋',
      '--aspect-ratio', '3:4',
      '--size', '4K',
    ]);
    assert.equal(calls.createBatchTasks.length, 1, '应调 createBatchTasks 一次');
    const p = calls.createBatchTasks[0];
    assert.equal(p.project_id, 'proj-1');
    // 必须是 ai_image：服务端 provider 工厂未注册 batch_image，发 batch_image 会 generation_failed
    assert.equal(p.tool_id, 'ai_image');
    assert.equal(p.sub_feature_id, 'batch_text_to_image');
    assert.equal(p.mode, 'multi_prompt');
    assert.equal(p.model_id, 'doubao-seedream-4-5-251128', '默认模型');
    assert.deepEqual(p.prompts, ['赛博朋克城市夜景', '雪山下的湖泊', '森林里的木屋'], '顺序保持、逐条 trim');
    assert.equal(p.count, 3, 'count = prompts.length（对齐 web 语义）');
    assert.equal(p.shared_params.aspect_ratio, '3:4');
    assert.equal(p.shared_params.image_size, '4K');
    assert.equal(p.shared_params.quality, 'medium');
    assert.ok(!('prompt' in p.shared_params), 'shared_params 不应包含 prompt');
    // 等待路径：轮询 3 个 task，逐 task 解析 asset，输出 3 行
    assert.equal(calls.pollTasks.length, 1);
    assert.deepEqual(calls.pollTasks[0], ['task-1', 'task-2', 'task-3']);
    assert.equal(calls.resolveAssets.length, 3);
    const out = JSON.parse(io.stdout);
    assert.equal(out.length, 3);
    assert.equal(out[0].status, 'completed');
    assert.ok(out[0].fileUrl);
  } finally { io.restore(); }
});

test('空白 prompt 被过滤，仅提交非空项', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'batch-generate-image', 'proj-1',
      '--prompt', 'a', '--prompt', '   ', '--prompt', 'b']);
    assert.deepEqual(calls.createBatchTasks[0].prompts, ['a', 'b']);
    assert.equal(calls.createBatchTasks[0].count, 2);
  } finally { io.restore(); }
});

test('指定 4 模型内的合法模型 → 透传到 payload', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'batch-generate-image', 'proj-1',
      '--prompt', 'x', '--model', 'midjourney-fast']);
    assert.equal(calls.createBatchTasks[0].model_id, 'midjourney-fast');
  } finally { io.restore(); }
});

test('--no-wait → 不轮询，直接输出 N 个 taskId', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'batch-generate-image', 'proj-1',
      '--prompt', 'a', '--prompt', 'b', '--no-wait']);
    assert.equal(calls.createBatchTasks.length, 1);
    assert.equal(calls.pollTasks.length, 0, '不应轮询');
    const out = JSON.parse(io.stdout);
    assert.equal(out.length, 2, '输出 2 行（每个 task 1 行）');
    assert.equal(out[0].taskId, 'task-1');
  } finally { io.restore(); }
});
