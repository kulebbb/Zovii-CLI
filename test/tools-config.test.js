import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, existsSync, readFileSync as read } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeOptions,
  resolveFields,
  findTool,
  findModel,
  getDefaultModel,
  visibleModels,
  matchOption,
  estimateCost,
  fetchTools,
  getToolsConfig,
} from '../src/tools-config.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/tools.json', import.meta.url));
const TOOLS = JSON.parse(readFileSync(FIXTURE, 'utf8'));

const imgTool = () => findTool(TOOLS, 'ai_image');
const vidTool = () => findTool(TOOLS, 'ai_video');

// ---------- normalizeOptions ----------

test('normalizeOptions: null / undefined 返回空数组', () => {
  assert.deepEqual(normalizeOptions(null), []);
  assert.deepEqual(normalizeOptions(undefined), []);
  assert.deepEqual(normalizeOptions([]), []);
});

test('normalizeOptions: 混合裸字符串与 {value,label} 对象', () => {
  const opts = [{ value: 'adaptive', label: '智能匹配' }, '16:9', '4:3'];
  assert.deepEqual(normalizeOptions(opts), ['adaptive', '16:9', '4:3']);
});

test('normalizeOptions: 数值 value 转字符串', () => {
  assert.deepEqual(normalizeOptions([1, { value: 2 }]), ['1', '2']);
});

// ---------- resolveFields ----------

test('resolveFields: nano-banana-pro 用 sub_feature_form_schemas（image_size 小写 1k/2k）', () => {
  const fields = resolveFields(imgTool(), 'image_generation', 'ws-nano-banana-pro');
  const size = fields.get('image_size');
  assert.deepEqual(size.options, ['1k', '2k']);
  assert.equal(size.default, '1k');
  assert.equal(size.visible, true);
  // 基础 schema 里的 quality 字段不在模型 schema 中 → 不应出现
  assert.equal(fields.has('quality'), false);
  assert.equal(fields.get('image_input').maxCount, 10);
});

test('resolveFields: seedream-4-5 用 size 字段而非 image_size', () => {
  const fields = resolveFields(imgTool(), 'image_generation', 'doubao-seedream-4-5-251128');
  assert.equal(fields.has('image_size'), false);
  assert.deepEqual(fields.get('size').options, ['2K', '4K']);
  assert.equal(fields.get('size').default, '2K');
});

test('resolveFields: gpt-image-2 走 field_overrides 覆盖基础 schema', () => {
  const fields = resolveFields(imgTool(), 'image_generation', 'ws-gpt-image-2');
  assert.deepEqual(fields.get('image_size').options, ['1K', '2K', '4K']);
  assert.equal(fields.get('image_size').default, '1K');
  // quality 基础 visible=false，被 override 成 true
  assert.equal(fields.get('quality').visible, true);
  assert.deepEqual(fields.get('quality').options, ['low', 'medium', 'high']);
  assert.equal(normalizeOptions(fields.get('aspect_ratio').options)[0], 'auto');
});

test('resolveFields: gpt-image-2 的 aspect_ratio 带出 autoValueWhen 规则', () => {
  const fields = resolveFields(imgTool(), 'image_generation', 'ws-gpt-image-2');
  assert.deepEqual(fields.get('aspect_ratio').autoValueWhen, {
    source_field: 'image_input',
    condition: 'not_empty',
    value: 'auto',
  });
  // 没有该规则的模型字段上应为 null，避免下游误判
  const nano = resolveFields(imgTool(), 'image_generation', 'ws-nano-banana-pro');
  assert.equal(nano.get('aspect_ratio').autoValueWhen, null);
});

test('resolveFields: midjourney-fast 既无 image_size 也无 size', () => {
  const fields = resolveFields(imgTool(), 'image_generation', 'midjourney-fast');
  assert.equal(fields.has('image_size'), false);
  assert.equal(fields.has('size'), false);
  assert.deepEqual(fields.get('version').options, ['7', '8.1']);
});

test('resolveFields: seedance-2.5 duration 含 -1，resolution 只有 480p/720p，ratio 默认 adaptive', () => {
  const fields = resolveFields(vidTool(), 'video_generation', 'doubao-seedance-2-5-260628');
  const dur = fields.get('duration');
  assert.equal(dur.default, '-1');
  assert.equal(dur.options[0], '-1');
  assert.equal(dur.options.includes('30'), true);
  assert.deepEqual(fields.get('resolution').options, ['480p', '720p']);
  assert.equal(fields.get('ratio').default, 'adaptive');
  // max_count / type 覆盖
  assert.equal(fields.get('reference_video_input').maxCount, 10);
  assert.equal(fields.get('reference_video_input').type, 'image_input');
  assert.equal(fields.get('negative_prompt').visible, false);
});

test('resolveFields: seedance-1.5-pro 无 duration override，沿用基础 8/12', () => {
  const fields = resolveFields(vidTool(), 'video_generation', 'doubao-seedance-1-5-pro-251215');
  assert.deepEqual(fields.get('duration').options, ['8', '12']);
  assert.equal(fields.get('duration').default, '8');
  assert.deepEqual(fields.get('resolution').options, ['480p', '720p', '1080p']);
  assert.equal(fields.get('reference_image_inputs').visible, false);
});

test('resolveFields: kling-o3 duration 5/10/15', () => {
  const fields = resolveFields(vidTool(), 'video_generation', 'kling-o3');
  assert.deepEqual(fields.get('duration').options, ['5', '10', '15']);
  assert.deepEqual(fields.get('resolution').options, ['720p', '1080p']);
});

test('resolveFields: required 与 visible 缺省为 true', () => {
  const fields = resolveFields(vidTool(), 'video_generation', 'kling-o3');
  assert.equal(fields.get('prompt').visible, true);
  // kling-o3 的 field_overrides.prompt.required = true，应覆盖基础 schema 的 false
  assert.equal(fields.get('prompt').required, true);
  const img = resolveFields(imgTool(), 'image_generation', 'ws-gpt-image-2');
  assert.equal(img.get('prompt').required, true);
});

test('resolveFields: field_overrides.required 可把 required 覆盖为 false', () => {
  const tool = {
    id: 't',
    sub_features: [
      { id: 'sf', form_schema: { fields: [{ key: 'prompt', required: true }] } },
    ],
    models: [{ id: 'm', field_overrides: { prompt: { required: false } } }],
  };
  assert.equal(resolveFields(tool, 'sf', 'm').get('prompt').required, false);
});

test('resolveFields: 未知 sub_feature / model 抛 ArgumentError', () => {
  assert.throws(() => resolveFields(imgTool(), 'nope', 'ws-gpt-image-2'), {
    name: 'ArgumentError',
  });
  assert.throws(() => resolveFields(imgTool(), 'image_generation', 'nope'), {
    name: 'ArgumentError',
  });
});

// ---------- findTool / findModel / getDefaultModel ----------

test('findTool: 命中与未命中', () => {
  assert.equal(findTool(TOOLS, 'ai_video').id, 'ai_video');
  assert.throws(() => findTool(TOOLS, 'ai_music'), (err) => {
    assert.equal(err.name, 'ArgumentError');
    assert.match(err.message, /未知工具 "ai_music"/);
    assert.match(err.message, /ai_image/);
    return true;
  });
});

test('findModel: 未命中时列出可用 id', () => {
  assert.equal(findModel(imgTool(), 'midjourney-fast').id, 'midjourney-fast');
  assert.throws(() => findModel(imgTool(), 'x'), (err) => {
    assert.equal(err.name, 'ArgumentError');
    assert.match(err.message, /未知模型 "x"/);
    assert.match(err.message, /ws-nano-banana-pro/);
    return true;
  });
});

test('getDefaultModel: 取 default:true，否则第一个', () => {
  assert.equal(getDefaultModel(imgTool()).id, 'ws-nano-banana-pro');
  const noDefault = { id: 't', models: [{ id: 'a' }, { id: 'b', default: true }] };
  assert.equal(getDefaultModel(noDefault).id, 'b');
  assert.equal(getDefaultModel({ id: 't', models: [{ id: 'a' }] }).id, 'a');
});

// ---------- hidden 模型 ----------

const hiddenTool = () => ({
  id: 't',
  models: [
    { id: 'hidden-default', default: true, hidden: true },
    { id: 'visible-a' },
    { id: 'visible-b' },
  ],
});

test('visibleModels: 过滤 hidden === true', () => {
  assert.deepEqual(visibleModels(hiddenTool()).map((m) => m.id), ['visible-a', 'visible-b']);
  assert.deepEqual(visibleModels(null), []);
});

test('getDefaultModel: 忽略 hidden 模型（即使它标了 default）', () => {
  assert.equal(getDefaultModel(hiddenTool()).id, 'visible-a');
});

test('findModel: hidden 模型等同不存在，且不出现在可选列表里', () => {
  assert.throws(() => findModel(hiddenTool(), 'hidden-default'), (err) => {
    assert.equal(err.name, 'ArgumentError');
    assert.match(err.message, /未知模型 "hidden-default"/);
    assert.equal(err.message.split('可选：')[1], 'visible-a / visible-b');
    return true;
  });
});

// ---------- matchOption ----------

test('matchOption: 不区分大小写匹配并返回 schema 规范值', () => {
  const field = { key: 'image_size', options: ['1k', '2k'] };
  assert.equal(matchOption(field, '2K'), '2k');
  assert.equal(matchOption(field, '1k'), '1k');
  assert.equal(matchOption(field, '4k'), null);
});

test('matchOption: options 为空时不做枚举约束', () => {
  assert.equal(matchOption({ key: 'prompt', options: [] }, 'hello'), 'hello');
  assert.equal(matchOption({ key: 'n', options: [] }, 3), '3');
});

test('matchOption: 数值 value 也能匹配', () => {
  assert.equal(matchOption({ key: 'duration', options: ['5', '10'] }, 10), '10');
});

test('matchOption: 先 trim 再匹配', () => {
  assert.equal(matchOption({ key: 'duration', options: ['5', '10'] }, ' 10 '), '10');
  assert.equal(matchOption({ key: 'image_size', options: ['1k', '2k'] }, ' 2K'), '2k');
  // 无枚举约束时也返回 trim 后的值
  assert.equal(matchOption({ key: 'prompt', options: [] }, '  hi  '), 'hi');
});

// ---------- estimateCost ----------

test('estimateCost: rate 为 null 返回 null', () => {
  assert.equal(estimateCost({ id: 'x', rate: null }, {}), null);
  assert.equal(estimateCost({ id: 'x' }, {}), null);
});

test('estimateCost: per_call 直接返回', () => {
  const m = findModel(imgTool(), 'ws-nano-banana-pro');
  assert.equal(estimateCost(m, { image_size: '2k' }), 5.5);
});

test('estimateCost: image matrix 按 image_size + quality（大小写无关）', () => {
  const m = findModel(imgTool(), 'ws-gpt-image-2');
  assert.equal(estimateCost(m, { image_size: '2K', quality: 'medium' }), 5);
  assert.equal(estimateCost(m, { image_size: '4k', quality: 'high' }), 23);
  assert.equal(estimateCost(m, { size: '1K', quality: 'low' }), 1);
  assert.equal(estimateCost(m, { image_size: '8K', quality: 'low' }), null);
  assert.equal(estimateCost(m, { image_size: '2K' }), null);
});

test('estimateCost: video matrix 按 resolution + duration', () => {
  const m = findModel(vidTool(), 'doubao-seedance-2-5-260628');
  assert.equal(estimateCost(m, { resolution: '720p', duration: 5 }), 38);
  assert.equal(estimateCost(m, { resolution: '480p', duration: '10' }), 34);
  assert.equal(estimateCost(m, { resolution: '1080p', duration: 5 }), null);
  assert.equal(estimateCost(m, { resolution: '720p', duration: '-1' }), null);
});

test('estimateCost: video generate_audio=true 走 <res>_sound 行', () => {
  const m = findModel(vidTool(), 'kling-o3');
  assert.equal(estimateCost(m, { resolution: '720p', duration: 5 }), 20);
  assert.equal(estimateCost(m, { resolution: '720p', duration: 5, generate_audio: true }), 26);
  // generate_audio=false 仍走裸分辨率
  assert.equal(estimateCost(m, { resolution: '720p', duration: 5, generate_audio: false }), 20);
});

test('estimateCost: video 有参考视频走 <res>_refvideo 行', () => {
  const m = findModel(vidTool(), 'doubao-seedance-2-0-260128');
  const expected = m.rate.matrix['720p_refvideo']['8'];
  assert.equal(
    estimateCost(m, { resolution: '720p', duration: 8, reference_video_input: 'asset-1' }),
    expected,
  );
  assert.equal(estimateCost(m, { resolution: '720p', duration: 8 }), m.rate.matrix['720p']['8']);
  // 空值不算有参考视频
  assert.equal(
    estimateCost(m, { resolution: '720p', duration: 8, reference_video_input: '' }),
    m.rate.matrix['720p']['8'],
  );
});

test('estimateCost: 参考视频 + 音频优先 <res>_refvideo_sound，缺行时逐级回退', () => {
  const m = findModel(vidTool(), 'kling-o3');
  const params = { resolution: '720p', duration: 5, reference_video_input: 'a', generate_audio: true };
  assert.equal(estimateCost(m, params), 39);
  // 只有 _refvideo 行的模型：带音频时回退到 _refvideo
  const m2 = findModel(vidTool(), 'doubao-seedance-2-0-260128');
  assert.equal(
    estimateCost(m2, { resolution: '720p', duration: 8, reference_video_input: 'a', generate_audio: true }),
    m2.rate.matrix['720p_refvideo']['8'],
  );
  // 后缀行都不存在时回退裸分辨率
  const m3 = findModel(vidTool(), 'doubao-seedance-1-5-pro-251215');
  assert.equal(
    estimateCost(m3, { resolution: '720p', duration: 8, reference_video_input: 'a', generate_audio: true }),
    32,
  );
});

test('estimateCost: image matrix 单档位且无 quality 时直接取该值', () => {
  const m = findModel(imgTool(), 'doubao-seedream-5-0-pro-260628');
  assert.equal(estimateCost(m, { image_size: '1k' }), 1.5);
  assert.equal(estimateCost(m, { image_size: '2K' }), 3);
  // 显式传 quality 仍按 quality 匹配
  assert.equal(estimateCost(m, { image_size: '1k', quality: 'medium' }), 1.5);
  assert.equal(estimateCost(m, { image_size: '1k', quality: 'high' }), null);
  // 多档位模型不受影响
  const gpt = findModel(imgTool(), 'ws-gpt-image-2');
  assert.equal(estimateCost(gpt, { image_size: '2K' }), null);
});

// ---------- fetchTools ----------

test('fetchTools: 成功返回 tools 数组', async () => {
  let calledUrl = '';
  const fetchImpl = async (url) => {
    calledUrl = url;
    return { ok: true, status: 200, json: async () => TOOLS };
  };
  const tools = await fetchTools({ fetchImpl });
  assert.equal(tools.length, TOOLS.length);
  assert.equal(calledUrl, 'https://zovii.studio/api/v1/tools');
});

test('fetchTools: 非 2xx 抛 CommandError', async () => {
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(fetchTools({ fetchImpl }), (err) => {
    assert.equal(err.name, 'CommandError');
    assert.match(err.message, /获取模型配置失败：HTTP 503/);
    return true;
  });
});

// ---------- getToolsConfig ----------

function tmpCacheFile() {
  return join(mkdtempSync(join(tmpdir(), 'zovii-tools-')), 'tools-cache.json');
}

const okFetch = (tools = TOOLS) => async () => ({ ok: true, status: 200, json: async () => tools });
const failFetch = () => {
  throw new Error('network down');
};

test('getToolsConfig: 缓存未过期直接命中，不发请求', async () => {
  const cacheFile = tmpCacheFile();
  writeFileSync(cacheFile, JSON.stringify({ fetched_at: 1000, tools: [{ id: 'cached' }] }));
  let called = false;
  const tools = await getToolsConfig({
    cacheFile,
    now: () => 1000 + 60_000,
    ttlMs: 3600_000,
    fetchImpl: async () => {
      called = true;
      return { ok: true, status: 200, json: async () => TOOLS };
    },
  });
  assert.deepEqual(tools, [{ id: 'cached' }]);
  assert.equal(called, false);
});

test('getToolsConfig: 缓存过期则刷新并写回', async () => {
  const cacheFile = tmpCacheFile();
  writeFileSync(cacheFile, JSON.stringify({ fetched_at: 1000, tools: [{ id: 'old' }] }));
  const now = () => 1000 + 7200_000;
  const tools = await getToolsConfig({ cacheFile, now, fetchImpl: okFetch([{ id: 'fresh' }]) });
  assert.deepEqual(tools, [{ id: 'fresh' }]);
  const saved = JSON.parse(read(cacheFile, 'utf8'));
  assert.equal(saved.fetched_at, now());
  assert.deepEqual(saved.tools, [{ id: 'fresh' }]);
});

test('getToolsConfig: 缓存写入失败不影响结果，只 warn', async () => {
  // 把已存在的普通文件当成目录用 → mkdir 必然 ENOTDIR
  const blocker = join(mkdtempSync(join(tmpdir(), 'zovii-tools-')), 'not-a-dir');
  writeFileSync(blocker, 'x');
  const cacheFile = join(blocker, 'sub', 'tools-cache.json');
  const warns = [];
  const tools = await getToolsConfig({
    cacheFile,
    now: () => 1000,
    fetchImpl: okFetch([{ id: 'fresh' }]),
    warn: (m) => warns.push(m),
  });
  assert.deepEqual(tools, [{ id: 'fresh' }]);
  assert.equal(warns.length, 1);
  assert.match(warns[0], /模型配置缓存写入失败：/);
});

test('getToolsConfig: 写缓存是原子的，不留下 .tmp 文件', async () => {
  const cacheFile = tmpCacheFile();
  await getToolsConfig({ cacheFile, now: () => 1000, fetchImpl: okFetch([{ id: 'fresh' }]) });
  assert.equal(existsSync(cacheFile), true);
  assert.equal(existsSync(`${cacheFile}.tmp`), false);
});

test('getToolsConfig: refresh=true 强制刷新', async () => {
  const cacheFile = tmpCacheFile();
  writeFileSync(cacheFile, JSON.stringify({ fetched_at: 1000, tools: [{ id: 'old' }] }));
  const tools = await getToolsConfig({
    cacheFile,
    refresh: true,
    now: () => 1000,
    fetchImpl: okFetch([{ id: 'fresh' }]),
  });
  assert.deepEqual(tools, [{ id: 'fresh' }]);
});

test('getToolsConfig: 刷新失败回退过期缓存并 warn', async () => {
  const cacheFile = tmpCacheFile();
  writeFileSync(cacheFile, JSON.stringify({ fetched_at: 1000, tools: [{ id: 'old' }] }));
  const warns = [];
  const tools = await getToolsConfig({
    cacheFile,
    now: () => 1000 + 7200_000,
    fetchImpl: failFetch,
    warn: (m) => warns.push(m),
  });
  assert.deepEqual(tools, [{ id: 'old' }]);
  assert.equal(warns.length, 1);
  assert.match(warns[0], /模型配置刷新失败，使用本地缓存/);
});

test('getToolsConfig: 无缓存且刷新失败抛 CommandError', async () => {
  const cacheFile = tmpCacheFile();
  await assert.rejects(
    getToolsConfig({ cacheFile, now: () => 1000, fetchImpl: failFetch, warn: () => {} }),
    (err) => {
      assert.equal(err.name, 'CommandError');
      assert.match(err.message, /无法获取模型配置：network down/);
      assert.match(err.message, /请检查网络后重试/);
      return true;
    },
  );
});

test('getToolsConfig: 缓存损坏等同不存在', async () => {
  const cacheFile = tmpCacheFile();
  writeFileSync(cacheFile, '{ not json');
  const tools = await getToolsConfig({
    cacheFile,
    now: () => 1000,
    fetchImpl: okFetch([{ id: 'fresh' }]),
  });
  assert.deepEqual(tools, [{ id: 'fresh' }]);
});

test('getToolsConfig: 缓存结构不对等同不存在', async () => {
  const cacheFile = tmpCacheFile();
  writeFileSync(cacheFile, JSON.stringify({ tools: 'nope' }));
  const tools = await getToolsConfig({
    cacheFile,
    now: () => 1000,
    fetchImpl: okFetch([{ id: 'fresh' }]),
  });
  assert.deepEqual(tools, [{ id: 'fresh' }]);
});

test('getToolsConfig: 缺省缓存路径在 ~/.config/zovii 下', async () => {
  const home = mkdtempSync(join(tmpdir(), 'zovii-home-'));
  const prevHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const tools = await getToolsConfig({ now: () => 1000, fetchImpl: okFetch([{ id: 'fresh' }]) });
    assert.deepEqual(tools, [{ id: 'fresh' }]);
    assert.equal(existsSync(join(home, '.config', 'zovii', 'tools-cache.json')), true);
  } finally {
    process.env.HOME = prevHome;
  }
});
