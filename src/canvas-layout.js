import { ArgumentError } from './errors.js';
import { randomUUID } from 'node:crypto';

const NODE_TARGET = 640;
const GAP = 24;
const GROUP_COLORS = new Set([
  'blue', 'green', 'orange', 'purple', 'red', 'yellow', 'cyan', 'gray',
]);

export function normalizeLayout(layout) {
  return {
    nodes: layout?.nodes ?? {},
    groups: Array.isArray(layout?.groups) ? layout.groups : [],
    nextGroupNumber: layout?.nextGroupNumber ?? 1,
  };
}

export function assetNodeId(assetId) {
  return `asset_${assetId}`;
}

// 复刻前端 studioHelpers.computeNodeSize：有尺寸等比缩放到 640，否则按类型回退
export function computeNodeSize({ width, height, type } = {}) {
  if (width > 0 && height > 0) {
    return width >= height
      ? { w: NODE_TARGET, h: Math.round(NODE_TARGET * (height / width)) }
      : { w: Math.round(NODE_TARGET * (width / height)), h: NODE_TARGET };
  }
  if (type === 'video') return { w: NODE_TARGET, h: 360 };
  if (type === 'markdown' || type === 'pdf') return { w: 320, h: 240 };
  return { w: NODE_TARGET, h: NODE_TARGET };
}

function findGroupIndex(groups, groupId) {
  const idx = groups.findIndex((g) => g.id === groupId);
  if (idx === -1) throw new ArgumentError(`分组不存在：${groupId}`);
  return idx;
}

export function listGroupsFromLayout(layout) {
  const L = normalizeLayout(layout);
  return L.groups.map((g) => ({
    groupId: g.id,
    name: g.name ?? '',
    autoOrganize: g.layoutMode === 'tiled' ? 'on' : 'off',
    memberCount: (g.memberOrder ?? []).length,
    color: g.color ?? '',
  }));
}

export function renameGroupInLayout(layout, groupId, name) {
  const L = normalizeLayout(layout);
  const idx = findGroupIndex(L.groups, groupId);
  const groups = L.groups.map((g, i) => (i === idx ? { ...g, name } : g));
  return { ...L, groups };
}

export function setAutoOrganizeInLayout(layout, groupId, on) {
  const L = normalizeLayout(layout);
  const idx = findGroupIndex(L.groups, groupId);
  const layoutMode = on ? 'tiled' : 'free';
  const groups = L.groups.map((g, i) => (i === idx ? { ...g, layoutMode } : g));
  return { ...L, groups };
}

// 把资产挂到某分组：已有节点只改 groupId，新节点按网格摆放；返回 { nodes, memberNodeIds }
function attachAssetsToGroup(nodes, groupId, assetSizes) {
  const next = { ...nodes };
  const allNodes = Object.values(next);
  let bottomY = allNodes.length
    ? Math.max(...allNodes.map((n) => (n.y ?? 0) + (n.height ?? 0))) + GAP
    : 0;
  let maxZ = allNodes.reduce((m, n) => Math.max(m, n.zIndex ?? 0), 0);

  const memberNodeIds = [];
  const newAssets = [];
  for (const a of assetSizes) {
    const nodeId = assetNodeId(a.id);
    memberNodeIds.push(nodeId);
    if (next[nodeId]) {
      next[nodeId] = { ...next[nodeId], groupId };
    } else {
      newAssets.push(a);
    }
  }
  const cols = Math.max(1, Math.ceil(Math.sqrt(newAssets.length)));
  const cell = NODE_TARGET + GAP;
  newAssets.forEach((a, i) => {
    const { w, h } = computeNodeSize(a);
    next[assetNodeId(a.id)] = {
      x: (i % cols) * cell,
      y: bottomY + Math.floor(i / cols) * cell,
      width: w,
      height: h,
      zIndex: ++maxZ,
      groupId,
    };
  });
  return { nodes: next, memberNodeIds };
}

export function createGroupInLayout(layout, {
  name,
  color,
  autoOrganize = false,
  assetSizes = [],
  idGen = randomUUID,
} = {}) {
  const L = normalizeLayout(layout);
  if (color !== undefined && color !== '' && !GROUP_COLORS.has(color)) {
    throw new ArgumentError(`颜色非法：${color}（可选 ${[...GROUP_COLORS].join('/')}）`);
  }
  const id = idGen();
  const { nodes, memberNodeIds } = attachAssetsToGroup(L.nodes, id, assetSizes);
  const group = {
    id,
    name,
    layoutMode: autoOrganize ? 'tiled' : 'free',
    memberOrder: memberNodeIds,
    ...(color ? { color } : {}),
  };
  return {
    layout: { nodes, groups: [...L.groups, group], nextGroupNumber: L.nextGroupNumber + 1 },
    groupId: id,
  };
}

export function addMembersInLayout(layout, groupId, assetSizes) {
  const L = normalizeLayout(layout);
  const idx = findGroupIndex(L.groups, groupId);
  const { nodes, memberNodeIds } = attachAssetsToGroup(L.nodes, groupId, assetSizes);
  const existing = L.groups[idx].memberOrder ?? [];
  const merged = [...existing.filter((x) => !memberNodeIds.includes(x)), ...memberNodeIds];
  const groups = L.groups.map((g, i) => (i === idx ? { ...g, memberOrder: merged } : g));
  return { ...L, nodes, groups };
}
