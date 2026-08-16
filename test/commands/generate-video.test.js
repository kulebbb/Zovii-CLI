import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { register } from '../../src/commands/generate-video.js';

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
    name: `Generated_${id}.mp4`,
    type: 'video',
    file_url: `https://cdn.example.com/${id}.mp4`,
    thumbnail_url: `https://cdn.example.com/${id}_t.webp`,
    metadata: { width: 1280, height: 720, duration: 5 },
  };
}

function fakeDeps(overrides = {}) {
  const calls = {
    resolveAssetRef: [], resolveAssetRefs: [], createTask: [], pollTask: [], resolveAssets: [],
  };
  const deps = {
    getToolsConfig: async () => FIXTURE_TOOLS,
    getToken: async () => 'fake-token',
    resolveAssetRef: async (token, project, ref) => {
      calls.resolveAssetRef.push(ref);
      return `asset-${ref}`;
    },
    resolveAssetRefs: async (token, project, refsCsv) => {
      calls.resolveAssetRefs.push(refsCsv);
      return String(refsCsv ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    },
    createTask: async (token, payload) => {
      calls.createTask.push(payload);
      return { id: 'task-1', status: 'pending', credit_cost: 1, result_asset_ids: [] };
    },
    pollTask: async (token, id) => {
      calls.pollTask.push(id);
      return { id, status: 'completed', credit_cost: 1, result_asset_ids: [`asset-${id}`] };
    },
    resolveAssets: async (token, ids) => {
      calls.resolveAssets.push(ids);
      return ids.map(fakeAsset);
    },
    ...overrides,
  };
  return { deps, calls };
}

test('未传 --model → 用产品默认模型与模型默认参数', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'generate-video', 'proj-1', '--prompt', '一只猫']);
    const p = calls.createTask[0];
    assert.equal(p.tool_id, 'ai_video');
    assert.equal(p.sub_feature_id, 'video_generation');
    assert.equal(p.model_id, 'doubao-seedance-2-0-260128');
    assert.equal(p.params.ratio, 'adaptive');
    assert.equal(p.params.duration, 5);
    assert.equal(p.params.resolution, '720p');
    assert.equal(p.params.generate_audio, true);
    // 未提供的素材字段不下发
    assert.ok(!('image_input' in p.params));
    assert.ok(!('reference_image_inputs' in p.params));
  } finally { io.restore(); }
});

test('未知模型 → 报错并列出可选模型', async () => {
  const { deps } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'generate-video', 'proj-1',
        '--prompt', 'x', '--model', 'no-such-model']),
      /__exit__/,
    );
    assert.match(io.stderr, /未知模型 "no-such-model"/);
    assert.match(io.stderr, /kling-o3/);
  } finally { io.restore(); }
});

test('kling-o3 --duration 8 → 报错并列出 5 / 10 / 15', async () => {
  const { deps } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'generate-video', 'proj-1',
        '--prompt', 'x', '--model', 'kling-o3', '--duration', '8']),
      /__exit__/,
    );
    assert.match(io.stderr, /--duration 不支持 "8"/);
    assert.match(io.stderr, /5 \/ 10 \/ 15/);
  } finally { io.restore(); }
});

test('kling-o3 未传参数 → 用模型默认 ratio 16:9、duration 5', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'generate-video', 'proj-1',
      '--prompt', 'x', '--model', 'kling-o3']);
    assert.equal(calls.createTask[0].params.ratio, '16:9');
    assert.equal(calls.createTask[0].params.duration, 5);
  } finally { io.restore(); }
});

test('seedance-2.5 --duration -1（自动）→ 通过，payload 里是数字 -1', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'generate-video', 'proj-1',
      '--prompt', 'x', '--model', 'doubao-seedance-2-5-260628', '--duration=-1']);
    assert.equal(calls.createTask[0].params.duration, -1);
  } finally { io.restore(); }
});

test('ws-minimax-h3 --resolution 720p 报错、2k 通过', async () => {
  const bad = fakeDeps();
  let program = makeProgram(bad.deps);
  let io = captureIO();
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'generate-video', 'proj-1',
        '--prompt', 'x', '--model', 'ws-minimax-h3', '--resolution', '720p']),
      /__exit__/,
    );
    assert.match(io.stderr, /--resolution 不支持 "720p"/);
  } finally { io.restore(); }

  const ok = fakeDeps();
  program = makeProgram(ok.deps);
  io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'generate-video', 'proj-1',
      '--prompt', 'x', '--model', 'ws-minimax-h3', '--resolution', '2k']);
    assert.equal(ok.calls.createTask[0].params.resolution, '2k');
  } finally { io.restore(); }
});

test('ws-gemini-omni-flash 带 --image-input → 报错（该模型图片输入不可用）', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'generate-video', 'proj-1',
        '--prompt', 'x', '--model', 'ws-gemini-omni-flash', '--image-input', 'ref-1']),
      /__exit__/,
    );
    assert.match(io.stderr, /不支持 --image-input/);
    assert.equal(calls.resolveAssetRef.length, 0, '校验应在上传之前');
  } finally { io.restore(); }
});

test('--ref-image 超过 max_count（默认模型 9 张）→ 报错且不上传', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  const refs = Array.from({ length: 10 }, (_, i) => `ref${i}`).join(',');
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'generate-video', 'proj-1',
        '--prompt', 'x', '--ref-image', refs]),
      /__exit__/,
    );
    assert.match(io.stderr, /--ref-image 最多 9 个/);
    assert.equal(calls.resolveAssetRefs.length, 0);
  } finally { io.restore(); }
});

test('--end-frame 缺 --image-input → ArgumentError', async () => {
  const { deps } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'generate-video', 'proj-1',
        '--prompt', 'x', '--end-frame', 'ref-1']),
      /__exit__/,
    );
    assert.match(io.stderr, /--end-frame 需要同时提供 --image-input/);
  } finally { io.restore(); }
});

test('--prompt 与素材都没有 → ArgumentError', async () => {
  const { deps } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'generate-video', 'proj-1']),
      /__exit__/,
    );
    assert.match(io.stderr, /至少提供一个/);
  } finally { io.restore(); }
});

test('提交前把预估积分打到 stderr', async () => {
  const { deps } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'generate-video', 'proj-1', '--prompt', 'x']);
    // seedance-2.0 720p / 5 秒 = 23 积分
    assert.match(io.stderr, /预估消耗 23 积分/);
  } finally { io.restore(); }
});

test('--no-wait → 不轮询，直接输出 taskId', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'generate-video', 'proj-1',
      '--prompt', 'x', '--no-wait']);
    assert.equal(calls.createTask.length, 1);
    assert.equal(calls.pollTask.length, 0, '不应轮询');
    const out = JSON.parse(io.stdout);
    assert.equal(out[0].taskId, 'task-1');
  } finally { io.restore(); }
});
