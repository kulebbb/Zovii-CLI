import { ArgumentError } from './errors.js';

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
