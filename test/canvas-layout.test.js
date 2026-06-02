import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLayout,
  assetNodeId,
  computeNodeSize,
  listGroupsFromLayout,
  renameGroupInLayout,
  setAutoOrganizeInLayout,
  createGroupInLayout,
  addMembersInLayout,
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

// 固定 id 生成器，保证测试确定性
const fixedId = (() => { let n = 0; return () => `gid${++n}`; })();

test('createGroupInLayout 写入成员节点(含 groupId)+追加分组+bump', () => {
  const { layout, groupId } = createGroupInLayout(
    { nodes: {}, groups: [], nextGroupNumber: 1 },
    {
      name: '我的组',
      autoOrganize: true,
      assetSizes: [
        { id: 'a', width: 1000, height: 500 },
        { id: 'b', width: 500, height: 1000 },
      ],
      idGen: () => 'gidX',
    },
  );
  assert.equal(groupId, 'gidX');
  assert.equal(layout.nodes['asset_a'].groupId, 'gidX');
  assert.deepEqual(
    { w: layout.nodes['asset_a'].width, h: layout.nodes['asset_a'].height },
    { w: 640, h: 320 },
  );
  assert.equal(layout.nodes['asset_b'].groupId, 'gidX');
  assert.equal(layout.groups.length, 1);
  assert.equal(layout.groups[0].layoutMode, 'tiled');
  assert.deepEqual(layout.groups[0].memberOrder, ['asset_a', 'asset_b']);
  assert.equal(layout.groups[0].bbox, undefined);
  assert.equal(layout.nextGroupNumber, 2);
});

test('create/add 不丢失已有 nodes 与 groups', () => {
  const existing = {
    nodes: { asset_old: { x: 10, y: 20, width: 100, height: 100, zIndex: 5, groupId: 'g1' } },
    groups: [{ id: 'g1', name: '老组', memberOrder: ['asset_old'] }],
    nextGroupNumber: 2,
  };
  // create-group：新建组后老组与老节点原样保留
  const { layout } = createGroupInLayout(existing, {
    name: '新组', assetSizes: [{ id: 'new', width: 200, height: 200 }], idGen: () => 'g2',
  });
  assert.deepEqual(layout.nodes['asset_old'], { x: 10, y: 20, width: 100, height: 100, zIndex: 5, groupId: 'g1' });
  assert.ok(layout.groups.find((g) => g.id === 'g1'));
  assert.ok(layout.groups.find((g) => g.id === 'g2'));
  // add-to-group：给 g1 加成员后老节点位置不变、其它 group 不受影响
  const next = addMembersInLayout(existing, 'g1', [{ id: 'extra', width: 200, height: 200 }]);
  assert.deepEqual(next.nodes['asset_old'], { x: 10, y: 20, width: 100, height: 100, zIndex: 5, groupId: 'g1' });
  assert.equal(next.groups.length, 1);
});

test('createGroupInLayout 空成员=空组，layoutMode=free', () => {
  const { layout } = createGroupInLayout(null, { name: '空组', idGen: fixedId });
  assert.equal(layout.groups[0].layoutMode, 'free');
  assert.deepEqual(layout.groups[0].memberOrder, []);
});

test('createGroupInLayout 非法颜色抛 ArgumentError', () => {
  assert.throws(
    () => createGroupInLayout(null, { name: 'x', color: 'pink', idGen: fixedId }),
    ArgumentError,
  );
});

test('createGroupInLayout 合法颜色写入 color', () => {
  const { layout } = createGroupInLayout(null, { name: 'x', color: 'red', idGen: fixedId });
  assert.equal(layout.groups[0].color, 'red');
});

test('addMembersInLayout 保留已有节点位置、只改 groupId，并入 memberOrder', () => {
  const start = {
    nodes: { asset_a: { x: 10, y: 20, width: 100, height: 100, zIndex: 5 } },
    groups: [{ id: 'g1', name: 'g', memberOrder: ['asset_x'] }],
    nextGroupNumber: 2,
  };
  const out = addMembersInLayout(start, 'g1', [{ id: 'a', width: 100, height: 100 }]);
  assert.deepEqual(out.nodes['asset_a'], { x: 10, y: 20, width: 100, height: 100, zIndex: 5, groupId: 'g1' });
  assert.deepEqual(out.groups[0].memberOrder, ['asset_x', 'asset_a']);
});

test('addMembersInLayout 去重不重复追加 memberOrder', () => {
  const start = {
    nodes: { asset_a: { x: 0, y: 0, width: 1, height: 1, zIndex: 1, groupId: 'g1' } },
    groups: [{ id: 'g1', name: 'g', memberOrder: ['asset_a'] }],
    nextGroupNumber: 2,
  };
  const out = addMembersInLayout(start, 'g1', [{ id: 'a' }]);
  assert.deepEqual(out.groups[0].memberOrder, ['asset_a']);
});

test('addMembersInLayout 找不到组抛 ArgumentError', () => {
  assert.throws(() => addMembersInLayout(null, 'nope', [{ id: 'a' }]), ArgumentError);
});

test('createGroupInLayout 单次调用内重复 asset id 去重', () => {
  const { layout } = createGroupInLayout(null, {
    name: 'dup',
    assetSizes: [{ id: 'a' }, { id: 'a' }],
    idGen: () => 'gidDup',
  });
  assert.deepEqual(layout.groups[0].memberOrder, ['asset_a']);
});

test('createGroupInLayout 多成员按网格摆放坐标正确', () => {
  // 2 个成员 → cols=ceil(sqrt(2))=2，cell=NODE_TARGET+GAP=664，bottomY=0
  const { layout } = createGroupInLayout(
    { nodes: {}, groups: [], nextGroupNumber: 1 },
    {
      name: 'grid',
      assetSizes: [{ id: 'a', width: 100, height: 100 }, { id: 'b', width: 100, height: 100 }],
      idGen: () => 'gidGrid',
    },
  );
  assert.equal(layout.nodes['asset_a'].x, 0);
  assert.equal(layout.nodes['asset_a'].y, 0);
  assert.equal(layout.nodes['asset_b'].x, 664);
  assert.equal(layout.nodes['asset_b'].y, 0);
});
