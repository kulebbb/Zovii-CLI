import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { register } from '../../src/commands/list-models.js';

// 线上真实 GET /api/v1/tools 响应快照，测试全程不联网
const FIXTURE_TOOLS = JSON.parse(
  readFileSync(new URL('../fixtures/tools.json', import.meta.url), 'utf8'),
);

function captureIO() {
  const origExit = process.exit;
  const origLog = console.log;
  const origStderr = process.stderr.write.bind(process.stderr);
  let stdout = '', stderr = '';
  console.log = (s) => { stdout += `${s}\n`; };
  process.stderr.write = (s) => { stderr += s; return true; };
  process.exit = () => { throw new Error('__exit__'); };
  return {
    get stdout() { return stdout; },
    get stderr() { return stderr; },
    restore: () => {
      process.exit = origExit;
      console.log = origLog;
      process.stderr.write = origStderr;
    },
  };
}

function makeProgram(deps, format = 'json') {
  const program = new Command();
  program.exitOverride();
  program.option('-f, --format <fmt>', '', format);
  register(program, deps);
  return program;
}

function fakeDeps() {
  const calls = { getToolsConfig: [] };
  const deps = {
    getToolsConfig: async (o) => { calls.getToolsConfig.push(o); return FIXTURE_TOOLS; },
  };
  return { deps, calls };
}

test('无参数 → 列出所有工具及其默认模型', async () => {
  const { deps } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'list-models']);
    const rows = JSON.parse(io.stdout);
    const img = rows.find((r) => r.toolId === 'ai_image');
    assert.equal(img.default, 'ws-nano-banana-pro');
    assert.equal(img.models, 7);
    assert.ok(rows.some((r) => r.toolId === 'ai_video'));
  } finally { io.restore(); }
});

test('带 tool → 每个模型一行，标出默认模型与最低积分', async () => {
  const { deps } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'list-models', 'ai_video']);
    const rows = JSON.parse(io.stdout);
    // json 输出里 default 是布尔
    const def = rows.find((r) => r.default === true);
    assert.equal(rows.filter((r) => r.default === true).length, 1);
    assert.equal(rows.every((r) => typeof r.default === 'boolean'), true);
    assert.equal(def.modelId, 'doubao-seedance-2-0-260128');
    assert.equal(def.minCost, 9);
    // 枚举摘要：默认值带 *，选项过多时折叠
    assert.match(def.options, /ratio=adaptive\*/);
    assert.match(def.options, /duration=4…15\(12 项，默认 5\)/);
    assert.match(def.options, /resolution=480p\|720p\*\|1080p\|4k/);
  } finally { io.restore(); }
});

test('ai_image 的摘要用 image_generation 的字段名（image_size / size 各随模型）', async () => {
  const { deps } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'list-models', 'ai_image']);
    const rows = JSON.parse(io.stdout);
    assert.match(rows.find((r) => r.modelId === 'ws-nano-banana-pro').options, /image_size=1k\*\|2k/);
    assert.match(rows.find((r) => r.modelId === 'doubao-seedream-4-5-251128').options, /size=2K\*\|4K/);
    assert.match(rows.find((r) => r.modelId === 'ws-gpt-image-2').options, /quality=low\|medium\*\|high/);
    // 隐藏字段不出现在摘要里
    assert.ok(!rows.find((r) => r.modelId === 'doubao-seedream-5-0-260128').options.includes('output_format'));
  } finally { io.restore(); }
});

test('未知 tool → 报错并列出可用工具', async () => {
  const { deps } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await assert.rejects(
      program.parseAsync(['node', 'zovii', 'list-models', 'no-such-tool']),
      /__exit__/,
    );
    assert.match(io.stderr, /未知工具 "no-such-tool"/);
    assert.match(io.stderr, /ai_image/);
  } finally { io.restore(); }
});

test('--refresh → 透传强制刷新', async () => {
  const { deps, calls } = fakeDeps();
  const program = makeProgram(deps);
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'list-models', '--refresh']);
    assert.deepEqual(calls.getToolsConfig[0], { refresh: true });
  } finally { io.restore(); }
});

test('table 格式也能输出', async () => {
  const { deps } = fakeDeps();
  const program = makeProgram(deps, 'table');
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'list-models']);
    assert.match(io.stdout, /toolId/);
    assert.match(io.stdout, /ai_video/);
  } finally { io.restore(); }
});

test('table 格式的模型列表仍用 ✓ 标默认模型', async () => {
  const { deps } = fakeDeps();
  const program = makeProgram(deps, 'table');
  const io = captureIO();
  try {
    await program.parseAsync(['node', 'zovii', 'list-models', 'ai_video']);
    assert.match(io.stdout, /doubao-seedance-2-0-260128\s+[^\n]*✓/);
    assert.ok(!io.stdout.includes('false'));
  } finally { io.restore(); }
});

test('hidden 模型不出现在列表与计数里', async () => {
  const tools = [
    {
      id: 'ai_image',
      name: '图片',
      sub_features: [],
      models: [
        { id: 'shown', default: true },
        { id: 'secret', hidden: true },
      ],
    },
  ];
  const deps = { getToolsConfig: async () => tools };
  const io = captureIO();
  try {
    await makeProgram(deps).parseAsync(['node', 'zovii', 'list-models']);
    assert.equal(JSON.parse(io.stdout)[0].models, 1);
  } finally { io.restore(); }

  const io2 = captureIO();
  try {
    await makeProgram(deps).parseAsync(['node', 'zovii', 'list-models', 'ai_image']);
    const rows = JSON.parse(io2.stdout);
    assert.deepEqual(rows.map((r) => r.modelId), ['shown']);
  } finally { io2.restore(); }
});
