import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLayout,
  assetNodeId,
  computeNodeSize,
  listGroupsFromLayout,
  renameGroupInLayout,
  setAutoOrganizeInLayout,
} from '../src/canvas-layout.js';
import { ArgumentError } from '../src/errors.js';

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

const SAMPLE = Object.freeze({
  nodes: Object.freeze({}),
  groups: Object.freeze([
    Object.freeze({ id: 'g1', name: '组一', layoutMode: 'tiled', memberOrder: Object.freeze(['asset_a', 'asset_b']), color: 'blue' }),
    Object.freeze({ id: 'g2', name: '组二', memberOrder: Object.freeze([]) }),
  ]),
  nextGroupNumber: 3,
});

test('listGroupsFromLayout 派生 autoOrganize 与 memberCount', () => {
  const rows = listGroupsFromLayout(SAMPLE);
  assert.deepEqual(rows, [
    { groupId: 'g1', name: '组一', autoOrganize: 'on', memberCount: 2, color: 'blue' },
    { groupId: 'g2', name: '组二', autoOrganize: 'off', memberCount: 0, color: '' },
  ]);
});

test('listGroupsFromLayout 对 null 布局返回空数组', () => {
  assert.deepEqual(listGroupsFromLayout(null), []);
});

test('renameGroupInLayout 只改目标组名字', () => {
  const out = renameGroupInLayout(SAMPLE, 'g2', '新名字');
  assert.equal(out.groups.find((g) => g.id === 'g2').name, '新名字');
  assert.equal(out.groups.find((g) => g.id === 'g1').name, '组一');
});

test('renameGroupInLayout 找不到组抛 ArgumentError', () => {
  assert.throws(() => renameGroupInLayout(SAMPLE, 'nope', 'x'), ArgumentError);
});

test('setAutoOrganizeInLayout on→tiled / off→free', () => {
  assert.equal(setAutoOrganizeInLayout(SAMPLE, 'g2', true).groups.find((g) => g.id === 'g2').layoutMode, 'tiled');
  assert.equal(setAutoOrganizeInLayout(SAMPLE, 'g1', false).groups.find((g) => g.id === 'g1').layoutMode, 'free');
});

test('setAutoOrganizeInLayout 找不到组抛 ArgumentError', () => {
  assert.throws(() => setAutoOrganizeInLayout(SAMPLE, 'nope', true), ArgumentError);
});
