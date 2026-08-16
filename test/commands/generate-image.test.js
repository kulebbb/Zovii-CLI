import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { register } from '../../src/commands/generate-image.js';

// 线上真实 GET /api/v1/tools 响应快照，测试全程不联网
const FIXTURE_TOOLS = JSON.parse(
  readFileSync(new URL('../fixtures/tools.json', import.meta.url), 'utf8'),
);

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
    resolveAssetRefs: [],
  };
  const deps = {
    getToolsConfig: async () => FIXTURE_TOOLS,
    getToken: async () => 'fake-token',
    resolveAssetRefs: async (token, project, refsCsv) => {
      calls.resolveAssetRefs.push(refsCsv);
      return String(refsCsv ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    },
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
      '--size', '2K',
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
    // schema 里 nano-banana-pro 的枚举是小写 1k/2k，落库要用规范值
    assert.equal(p.params.image_size, '2k');
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

test('未传 --model → 用产品默认模型 ws-nano-banana-pro', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1', '--prompt', 'x']);
    assert.equal(calls.createTask[0].model_id, 'ws-nano-banana-pro');
  } finally { io.restore(); }
});

test('未知模型 → 报错并列出可选模型', async () => {
  const { deps } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1',
        '--prompt', 'x', '--model', 'no-such-model']),
      /__exit__/,
    );
    assert.match(io.stderr, /未知模型 "no-such-model"/);
    assert.match(io.stderr, /doubao-seedream-4-5-251128/);
  } finally { io.restore(); }
});

test('seedream --size 4K → 发 size 字段，不发 image_size', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1',
      '--prompt', 'x', '--model', 'doubao-seedream-4-5-251128', '--size', '4K']);
    const p = calls.createTask[0].params;
    assert.equal(p.size, '4K');
    assert.ok(!('image_size' in p), '不应再恒发 image_size（否则 4K 会被静默降级）');
  } finally { io.restore(); }
});

test('nano-banana-pro --size 4K → 报错并列出 1k / 2k', async () => {
  const { deps } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1',
        '--prompt', 'x', '--model', 'ws-nano-banana-pro', '--size', '4K']),
      /__exit__/,
    );
    assert.match(io.stderr, /--size 不支持 "4K"/);
    assert.match(io.stderr, /1k \/ 2k/);
  } finally { io.restore(); }
});

test('midjourney-fast 带 --image-input → 报错（该模型无参考图字段）', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1',
        '--prompt', 'x', '--model', 'midjourney-fast', '--image-input', 'asset-1']),
      /__exit__/,
    );
    assert.match(io.stderr, /不支持 --image-input/);
    assert.equal(calls.resolveAssetRefs.length, 0, '校验应在上传之前');
  } finally { io.restore(); }
});

test('--image-input 超过 max_count（10）→ 报错且不上传', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  const refs = Array.from({ length: 11 }, (_, i) => `ref${i}`).join(',');
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1',
        '--prompt', 'x', '--image-input', refs]),
      /__exit__/,
    );
    assert.match(io.stderr, /--image-input 最多 10 个/);
    assert.equal(calls.resolveAssetRefs.length, 0);
  } finally { io.restore(); }
});

test('gpt-image-2 --quality high 通过；seedream --quality high 报错', async () => {
  const ok = fakeDeps();
  let program = makeProgram(ok.deps);
  let io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1',
      '--prompt', 'x', '--model', 'ws-gpt-image-2', '--quality', 'high']);
    assert.equal(ok.calls.createTask[0].params.quality, 'high');
  } finally { io.restore(); }

  const bad = fakeDeps();
  program = makeProgram(bad.deps);
  io = captureIO();
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1',
        '--prompt', 'x', '--model', 'doubao-seedream-4-5-251128', '--quality', 'high']),
      /__exit__/,
    );
    assert.match(io.stderr, /不支持 --quality/);
  } finally { io.restore(); }
});

test('不再硬编码 quality=medium：nano-banana-pro 的 payload 不含 quality', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1', '--prompt', 'x']);
    assert.ok(!('quality' in calls.createTask[0].params));
  } finally { io.restore(); }
});

test('提交前把预估积分打到 stderr', async () => {
  const { deps } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1', '--prompt', 'x']);
    assert.match(io.stderr, /预估消耗 5.5 积分/);
  } finally { io.restore(); }
});

test('count=3 时预估积分按张数累计', async () => {
  const { deps } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1',
      '--prompt', 'x', '--count', '3']);
    assert.match(io.stderr, /预估消耗 16.5 积分/);
  } finally { io.restore(); }
});

// ---------- auto_value_when：gpt-image-2 带参考图时 aspect_ratio 自动为 auto ----------

test('gpt-image-2 + 参考图 + 未传 --aspect-ratio → aspect_ratio 自动为 auto', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1',
      '--prompt', '一只猫',
      '--model', 'ws-gpt-image-2',
      '--image-input', 'asset-1',
    ]);
    assert.equal(calls.createTask[0].params.aspect_ratio, 'auto');
  } finally { io.restore(); }
});

test('gpt-image-2 + 参考图 + 显式 --aspect-ratio 16:9 → 尊重用户值', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1',
      '--prompt', '一只猫',
      '--model', 'ws-gpt-image-2',
      '--image-input', 'asset-1',
      '--aspect-ratio', '16:9',
    ]);
    assert.equal(calls.createTask[0].params.aspect_ratio, '16:9');
  } finally { io.restore(); }
});

test('gpt-image-2 无参考图 → aspect_ratio 用 schema 默认值 1:1', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1',
      '--prompt', '一只猫',
      '--model', 'ws-gpt-image-2',
    ]);
    assert.equal(calls.createTask[0].params.aspect_ratio, '1:1');
  } finally { io.restore(); }
});

test('gpt-image-2 + 参考图 + count=3（batch 路径）→ shared_params.aspect_ratio 为 auto', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1',
      '--prompt', '一只猫',
      '--model', 'ws-gpt-image-2',
      '--image-input', 'asset-1',
      '--count', '3',
    ]);
    assert.equal(calls.createBatchTasks[0].shared_params.aspect_ratio, 'auto');
  } finally { io.restore(); }
});

test('nano-banana-pro + 参考图 → 无 auto 规则，aspect_ratio 仍是默认 1:1', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'generate-image', 'proj-1',
      '--prompt', '一只猫',
      '--model', 'ws-nano-banana-pro',
      '--image-input', 'asset-1',
    ]);
    assert.equal(calls.createTask[0].params.aspect_ratio, '1:1');
  } finally { io.restore(); }
});
