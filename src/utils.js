import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { statSync, existsSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { ArgumentError, AuthRequiredError, CommandError, TimeoutError } from './errors.js';
import { isLocalFilePath, guessMimeType, looksLikeUuid } from './helpers.js';

const API = 'https://zovii.studio/api/v1';
const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;

function throwHttpError(status, context = '') {
  if (status >= 200 && status < 300) return;
  if (status === 401 || status === 403) {
    throw new AuthRequiredError('登录态已失效，请重新运行 zovii login');
  }
  if (status === 402) {
    throw new CommandError('积分不足，请前往 https://zovii.studio/pricing 充值');
  }
  if (status === 404) {
    throw new CommandError(`资源不存在${context ? `（${context}）` : ''}，请检查 ID 是否正确`);
  }
  if (status === 429) {
    throw new CommandError('请求过于频繁，请稍后重试');
  }
  throw new CommandError(`请求失败：HTTP ${status}${context ? ` (${context})` : ''}`);
}

async function apiFetch(path, { method = 'GET', token, body, timeoutMs = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const resp = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    throwHttpError(resp.status, path);
    const text = await resp.text();
    if (!text.trim()) return null;
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

export async function createTask(token, payload) {
  const task = await apiFetch('/tasks', { method: 'POST', token, body: payload });
  if (!task?.id) throw new CommandError('创建任务失败：响应缺少 task id');
  return task;
}

export async function pollTask(token, taskId, { timeoutSec, label }) {
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const task = await apiFetch(`/tasks/${taskId}`, { token });
    if (task.status === 'completed') return task;
    if (task.status === 'failed') {
      throw new CommandError(`生成失败：${task.error || '未知错误'}`);
    }
    if (task.status === 'dismissed') throw new CommandError('任务已被取消');
  }
  throw new TimeoutError(label, timeoutSec);
}

export async function resolveAssets(token, assetIds) {
  const assets = [];
  for (const id of assetIds) {
    try {
      assets.push(await apiFetch(`/assets/${id}`, { token }));
    } catch {
      assets.push({ id });
    }
  }
  return assets;
}

export async function getAsset(token, assetId) {
  return apiFetch(`/assets/${assetId}`, { token });
}

export async function listAssets(token, projectId, { type, limit = 100 } = {}) {
  const out = [];
  let offset = 0;
  const pageSize = 500;
  while (true) {
    const batch = await apiFetch(
      `/projects/${projectId}/assets?limit=${pageSize}&offset=${offset}`,
      { token },
    );
    const arr = Array.isArray(batch) ? batch : (batch?.items ?? []);
    if (!arr.length) break;
    out.push(...arr);
    if (arr.length < pageSize) break;
    if (!type && out.length >= limit) break;
    offset += pageSize;
  }
  const filtered = type ? out.filter((a) => a.type === type) : out;
  return filtered.slice(0, limit);
}

export async function uploadAsset(token, projectId, filePath, toolType) {
  if (!existsSync(filePath)) throw new ArgumentError(`文件不存在：${filePath}`);
  const size = statSync(filePath).size;
  if (size > MAX_UPLOAD_BYTES) {
    throw new CommandError(
      `文件过大（${(size / 1048576).toFixed(1)}MB，超过 80MB 上限），请在网页端上传后传 asset id`,
    );
  }
  const qs = toolType ? `?tool_type=${encodeURIComponent(toolType)}` : '';
  const url = `${API}/projects/${projectId}/assets/upload${qs}`;
  const fileBuffer = await readFile(filePath);
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([fileBuffer], { type: guessMimeType(filePath) }),
    basename(filePath),
  );
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  throwHttpError(resp.status, '上传素材');
  const asset = await resp.json();
  if (!asset?.id) throw new CommandError('上传失败：响应缺少 asset id');
  return asset;
}

export async function resolveAssetRef(token, projectId, ref, toolType) {
  const s = String(ref ?? '').trim();
  if (!s) return '';
  if (isLocalFilePath(s)) {
    const asset = await uploadAsset(token, projectId, s, toolType);
    return asset.id;
  }
  if (!looksLikeUuid(s)) {
    throw new ArgumentError(
      `"${s}" 既不是有效的 asset id（UUID 形态），也不是本地存在的文件路径`,
    );
  }
  return s;
}

export async function resolveAssetRefs(token, projectId, refsCsv, toolType) {
  const parts = String(refsCsv ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const ids = [];
  for (const p of parts) {
    ids.push(await resolveAssetRef(token, projectId, p, toolType));
  }
  return ids;
}

export async function downloadAsset(asset, outPath) {
  const fileUrl = asset?.file_url;
  if (!fileUrl) throw new CommandError('该素材没有可下载的 file_url');
  const resp = await fetch(fileUrl);
  if (!resp.ok) throw new CommandError(`下载失败：HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
  return { localPath: outPath, bytes: buf.length };
}

export async function createProject(token, name) {
  const project = await apiFetch('/projects', { method: 'POST', token, body: { name } });
  if (!project?.id) throw new CommandError('新建项目失败：响应缺少 project id');
  return project;
}

export async function listProjects(token) {
  const data = await apiFetch('/projects', { token });
  return Array.isArray(data) ? data : (data?.items ?? []);
}

export function assetRow(asset) {
  return {
    assetId: asset.id ?? '',
    assetName: asset.name ?? '',
    assetType: asset.type ?? '',
    fileUrl: asset.file_url ?? '',
    thumbnailUrl: asset.thumbnail_url ?? '',
    width: asset.metadata?.width ?? null,
    height: asset.metadata?.height ?? null,
    duration: asset.metadata?.duration ?? null,
  };
}

export function toRows(task, assets) {
  const base = {
    taskId: task.id,
    status: task.status,
    creditCost: task.credit_cost ?? 0,
  };
  if (!assets.length) {
    return [{ ...base, assetId: '', assetName: '', assetType: '', fileUrl: '', thumbnailUrl: '', width: null, height: null, duration: null }];
  }
  return assets.map((asset) => ({ ...base, ...assetRow(asset) }));
}
