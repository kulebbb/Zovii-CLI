import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLayout,
  assetNodeId,
  computeNodeSize,
} from '../src/canvas-layout.js';

test('normalizeLayout 把 null 归一化为完整空布局', () => {
  assert.deepEqual(normalizeLayout(null), { nodes: {}, groups: [], nextGroupNumber: 1 });
});

test('normalizeLayout 补全缺失字段、保留已有字段', () => {
  const out = normalizeLayout({ groups: [{ id: 'g1' }] });
  assert.deepEqual(out.nodes, {});
  assert.deepEqual(out.groups, [{ id: 'g1' }]);
  assert.equal(out.nextGroupNumber, 1);
});

test('assetNodeId 返回 asset_<id> 约定', () => {
  assert.equal(assetNodeId('abc'), 'asset_abc');
});

test('computeNodeSize 横图等比缩放到 640 宽', () => {
  assert.deepEqual(computeNodeSize({ width: 1000, height: 500 }), { w: 640, h: 320 });
});

test('computeNodeSize 竖图等比缩放到 640 高', () => {
  assert.deepEqual(computeNodeSize({ width: 500, height: 1000 }), { w: 320, h: 640 });
});

test('computeNodeSize 正方形图走 >= 分支返回 640x640', () => {
  assert.deepEqual(computeNodeSize({ width: 800, height: 800 }), { w: 640, h: 640 });
});

test('computeNodeSize 无尺寸时按类型回退', () => {
  assert.deepEqual(computeNodeSize({ type: 'video' }), { w: 640, h: 360 });
  assert.deepEqual(computeNodeSize({ type: 'markdown' }), { w: 320, h: 240 });
  assert.deepEqual(computeNodeSize({}), { w: 640, h: 640 });
});
