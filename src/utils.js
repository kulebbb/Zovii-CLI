import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { statSync, existsSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { ArgumentError, AuthRequiredError, CommandError, TimeoutError } from './errors.js';
import { isLocalFilePath, guessMimeType, looksLikeUuid } from './helpers.js';

export const API = 'https://zovii.studio/api/v1';
const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;

// 后端 400 的业务错误码 → 面向用户的中文说明
const DETAIL_CODE_MESSAGES = {
  model_not_available:
    '该模型不支持所选参数组合（模型/分辨率/时长），运行 zovii list-models <tool> 查看可用取值',
  prompt_required: '该模型要求提供提示词 --prompt',
  duration_unavailable: '该模型不支持所选时长',
};

export function throwHttpError(status, context = '', detail) {
  if (status >= 200 && status < 300) return;
  // 后端鉴权失败一律 401；带 detail 的 403 是业务无权限（如企业库改他人素材），不能误导用户去重登
  if (status === 403 && detail) {
    const msg = typeof detail === 'string' ? detail : (detail.message ?? JSON.stringify(detail));
    throw new CommandError(`无权限：${msg}`);
  }
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
  if (status === 400 && detail) {
    if (typeof detail === 'string') {
      throw new CommandError(`请求失败：${detail}`);
    }
    if (detail.code) {
      // 未知 code 时把后端 message 一并带出，便于用户自查
      const extra = detail.message ? `：${detail.message}` : '';
      const err = new CommandError(
        DETAIL_CODE_MESSAGES[detail.code] ?? `请求失败：${detail.code}${extra}`,
      );
      err.code = detail.code;
      throw err;
    }
    // 非 code 结构（如字段校验数组）原样截断透出，避免只剩 HTTP 400
    if (typeof detail === 'object') {
      throw new CommandError(`请求失败：${JSON.stringify(detail).slice(0, 200)}`);
    }
  }
  throw new CommandError(`请求失败：HTTP ${status}${context ? ` (${context})` : ''}`);
}

export async function apiFetch(
  path,
  { method = 'GET', token, body, timeoutMs = 20000, fetchImpl = fetch } = {},
) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const resp = await fetchImpl(`${API}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    // 先读 body，让后端 {detail:{code}} 能透传给用户，而不是只剩 HTTP 4xx
    const text = await resp.text();
    if (resp.status < 200 || resp.status >= 300) {
      let detail;
      try {
        detail = JSON.parse(text).detail;
      } catch {}
      throwHttpError(resp.status, path, detail);
    }
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

export async function createBatchTasks(token, payload) {
  // POST /tasks/batch 后端接口，用于一次创建 N 个 task（多张图 / 多个 prompt 等场景）
  const resp = await apiFetch('/tasks/batch', { method: 'POST', token, body: payload });
  if (!resp?.tasks?.length) throw new CommandError('创建批量任务失败：响应缺少 tasks');
  return resp;
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

export async function pollTasks(token, taskIds, { timeoutSec, label }) {
  // 并行轮询多个 task，全部 completed 才返回（按原顺序）；任一 failed/dismissed 立刻抛错
  const deadline = Date.now() + timeoutSec * 1000;
  const remaining = new Set(taskIds);
  const results = {};
  while (Date.now() < deadline && remaining.size > 0) {
    await new Promise((r) => setTimeout(r, 3000));
    const tasks = await Promise.all(
      [...remaining].map(async (id) => {
        try {
          return [id, await apiFetch(`/tasks/${id}`, { token })];
        } catch {
          return [id, null];
        }
      }),
    );
    for (const [id, task] of tasks) {
      if (!task) continue;
      if (task.status === 'completed') {
        results[id] = task;
        remaining.delete(id);
      } else if (task.status === 'failed') {
        throw new CommandError(`生成失败（task ${id}）：${task.error || '未知错误'}`);
      } else if (task.status === 'dismissed') {
        throw new CommandError(`任务已被取消（task ${id}）`);
      }
    }
  }
  if (remaining.size > 0) throw new TimeoutError(label, timeoutSec);
  return taskIds.map((id) => results[id]);
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
  // lib:<id> = 资产库素材：生成接口只认项目素材，先复制进项目再用
  if (s.startsWith(LIBRARY_REF_PREFIX)) {
    const libId = s.slice(LIBRARY_REF_PREFIX.length).trim();
    if (!looksLikeUuid(libId)) {
      throw new ArgumentError(`"${s}" 不是有效的资产库引用，格式为 lib:<资产库ID>`);
    }
    const asset = await exportLibraryAsset(token, projectId, libId);
    return asset.id;
  }
  if (isLocalFilePath(s)) {
    const asset = await uploadAsset(token, projectId, s, toolType);
    return asset.id;
  }
  if (!looksLikeUuid(s)) {
    throw new ArgumentError(
      `"${s}" 既不是有效的 asset id（UUID 形态），也不是本地存在的文件路径或 lib:<资产库ID>`,
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

export async function createProject(token, name, { personalProject } = {}) {
  const body = { name };
  // personal_project=true → 个人项目；false → 企业成员盖企业戳。仅在显式给出时传，否则用后端默认
  if (personalProject !== undefined) body.personal_project = personalProject;
  const project = await apiFetch('/projects', { method: 'POST', token, body });
  if (!project?.id) throw new CommandError('新建项目失败：响应缺少 project id');
  return project;
}

// 当前用户信息（含 enterprise_id：非空即企业成员）
export async function getMe(token) {
  return apiFetch('/auth/me', { token });
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

export async function getCanvasLayout(token, projectId) {
  // 空布局时后端返回 null；归一化交给 canvas-layout.js
  return apiFetch(`/projects/${projectId}/canvas-layout`, { token });
}

export async function saveCanvasLayout(token, projectId, layout) {
  return apiFetch(`/projects/${projectId}/canvas-layout`, {
    method: 'PATCH',
    token,
    body: {
      nodes: layout.nodes ?? {},
      groups: layout.groups ?? [],
      nextGroupNumber: layout.nextGroupNumber ?? 1,
    },
  });
}

// 拉取资产尺寸用于节点计算；单个失败回退为 { id }（computeNodeSize 会用默认尺寸）
export async function resolveAssetSizes(token, assetIds) {
  const out = [];
  for (const id of assetIds) {
    try {
      const a = await getAsset(token, id);
      out.push({ id, width: a?.metadata?.width, height: a?.metadata?.height, type: a?.type });
    } catch {
      out.push({ id });
    }
  }
  return out;
}

// ---------- 资产库（跨项目长期素材库，分个人库 / 企业库） ----------

export const LIBRARY_REF_PREFIX = 'lib:';
const LIBRARY_PAGE_MAX = 200; // 后端单页上限

// 先读 body 再判状态，让后端 detail 透传（multipart / 二进制请求不走 apiFetch 时用）
async function checkResponse(resp, context) {
  if (resp.ok) return;
  let detail;
  try {
    detail = JSON.parse(await resp.text()).detail;
  } catch {}
  throwHttpError(resp.status, context, detail);
}

// 个人库 owner = 本人 user id；企业库 owner = 所属企业 id
export async function resolveLibraryOwner(token, { enterprise = false } = {}) {
  const me = await getMe(token);
  if (!enterprise) return { ownerType: 'user', ownerId: me.id };
  if (!me?.enterprise_id) throw new ArgumentError('当前账号不是企业成员，不能使用 --enterprise');
  return { ownerType: 'enterprise', ownerId: me.enterprise_id };
}

function ownerParams(owner) {
  return { owner_type: owner.ownerType, owner_id: owner.ownerId };
}

export async function listLibraryAssets(
  token,
  owner,
  { type, tag, q, pinned = false, trash = false, limit = 100 } = {},
) {
  const params = new URLSearchParams(ownerParams(owner));
  if (type) params.set('type', type);
  if (tag) params.set('tag', tag);
  if (q) params.set('q', q);
  if (pinned) params.set('pinned', 'true');
  const base = trash ? '/library/trash' : '/library/assets';
  const out = [];
  while (out.length < limit) {
    const size = Math.min(LIBRARY_PAGE_MAX, limit - out.length);
    params.set('limit', String(size));
    params.set('offset', String(out.length));
    const page = await apiFetch(`${base}?${params}`, { token });
    const items = page?.items ?? [];
    out.push(...items);
    if (items.length < size) break;
  }
  return out;
}

export async function listLibraryTags(token, owner) {
  const data = await apiFetch(`/library/tags?${new URLSearchParams(ownerParams(owner))}`, { token });
  return Array.isArray(data) ? data : [];
}

export async function uploadLibraryAsset(token, owner, filePath, { tags = [] } = {}) {
  if (!existsSync(filePath)) throw new ArgumentError(`文件不存在：${filePath}`);
  const size = statSync(filePath).size;
  if (size > MAX_UPLOAD_BYTES) {
    throw new CommandError(
      `文件过大（${(size / 1048576).toFixed(1)}MB，超过 80MB 上限），请在网页端上传`,
    );
  }
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([await readFile(filePath)], { type: guessMimeType(filePath) }),
    basename(filePath),
  );
  for (const t of tags) formData.append('tags', t);
  const resp = await fetch(
    `${API}/library/assets/upload?${new URLSearchParams(ownerParams(owner))}`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData },
  );
  await checkResponse(resp, '上传到资产库');
  const asset = await resp.json();
  if (!asset?.id) throw new CommandError('上传失败：响应缺少资产库素材 id');
  return asset;
}

// 项目素材收进资产库；返回 { items: 新资产库素材[], skipped: 未收入的项目素材 id[] }
export async function importToLibrary(token, owner, projectId, assetIds) {
  const data = await apiFetch('/library/assets/import-from-project', {
    method: 'POST',
    token,
    body: { project_id: projectId, asset_ids: assetIds, ...ownerParams(owner) },
    timeoutMs: 120000,
  });
  return { items: data?.items ?? [], skipped: data?.skipped ?? [] };
}

/**
 * 资产库素材复制进项目，返回新建的项目素材。
 * 调用方不必知道素材在哪个库：先试个人库再试企业库——后端对不属于该库的 ID 静默跳过、返回空数组。
 */
export async function exportLibraryAsset(token, projectId, libraryAssetId) {
  const me = await getMe(token);
  const owners = [{ ownerType: 'user', ownerId: me.id }];
  if (me?.enterprise_id) owners.push({ ownerType: 'enterprise', ownerId: me.enterprise_id });
  for (const owner of owners) {
    const created = await apiFetch('/library/assets/export-to-project', {
      method: 'POST',
      token,
      body: { asset_ids: [libraryAssetId], project_id: projectId, ...ownerParams(owner) },
      timeoutMs: 60000,
    });
    if (Array.isArray(created) && created[0]?.id) return created[0];
  }
  throw new CommandError(`资产库素材不存在或已删除：${libraryAssetId}`);
}

function safeFileName(name) {
  return String(name ?? '').replace(/[\\/]/g, '_').trim();
}

// 只看 URL 最后一段路径里的扩展名（同后端 _asset_ext），域名和 query 里的点不算
export function urlExtension(url) {
  const last = new URL(url).pathname.split('/').pop() ?? '';
  return last.includes('.') ? last.split('.').pop().toLowerCase() : '';
}

function withExtension(name, ext) {
  const safe = safeFileName(name);
  if (!ext || safe.toLowerCase().endsWith(`.${ext}`)) return safe;
  return `${safe}.${ext}`;
}

function dispositionFileName(header) {
  const m = /filename\*=UTF-8''([^;]+)/i.exec(header ?? '');
  if (!m) return '';
  try {
    return safeFileName(decodeURIComponent(m[1]));
  } catch {
    return '';
  }
}

/**
 * 下载资产库素材。后端 /download 有两种返回：
 * - 图片且用户关了 AI 水印 → 直接回剥离元数据后的字节，文件名在 Content-Disposition
 * - 其余 → 302 到 COS 直链；手动跟随，避免把登录 token 带去第三方域名
 * 成功后再调 mark-downloaded 记一条下载动态，并顺带拿到素材名用作默认文件名。
 */
export async function downloadLibraryAsset(token, libraryAssetId, outPath) {
  const resp = await fetch(`${API}/library/assets/${libraryAssetId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'manual',
  });
  const location = resp.status >= 300 && resp.status < 400 ? resp.headers.get('location') : null;
  let fileResp = resp;
  if (location) {
    fileResp = await fetch(location);
    if (!fileResp.ok) throw new CommandError(`下载失败：HTTP ${fileResp.status}`);
  } else {
    await checkResponse(resp, '下载资产库素材');
  }
  const buf = Buffer.from(await fileResp.arrayBuffer());
  const asset = await apiFetch(`/library/assets/${libraryAssetId}/mark-downloaded`, {
    method: 'POST',
    token,
  });
  let target = outPath;
  if (!target) {
    target =
      dispositionFileName(resp.headers.get('content-disposition')) ||
      withExtension(asset?.name || libraryAssetId, location ? urlExtension(location) : '');
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, buf);
  return { asset, localPath: target, bytes: buf.length };
}

export async function renameLibraryAsset(token, id, name) {
  return apiFetch(`/library/assets/${id}`, { method: 'PATCH', token, body: { name } });
}

export async function addLibraryTag(token, id, tag) {
  return apiFetch(`/library/assets/${id}/tags`, { method: 'POST', token, body: { tag } });
}

export async function removeLibraryTag(token, id, tag) {
  return apiFetch(`/library/assets/${id}/tags/${encodeURIComponent(tag)}`, {
    method: 'DELETE',
    token,
  });
}

export async function setLibraryPinned(token, id, pinned) {
  return apiFetch(`/library/assets/${id}/${pinned ? 'pin' : 'unpin'}`, { method: 'POST', token });
}

// 软删除：进回收站，可 restore
export async function deleteLibraryAsset(token, id) {
  return apiFetch(`/library/assets/${id}`, { method: 'DELETE', token });
}

export async function restoreLibraryAsset(token, id) {
  return apiFetch(`/library/assets/${id}/restore`, { method: 'POST', token });
}

export function libraryRow(asset) {
  return {
    libraryAssetId: asset.id ?? '',
    name: asset.name ?? '',
    type: asset.type ?? '',
    library: asset.owner_type === 'enterprise' ? 'enterprise' : 'personal',
    tags: asset.tags ?? [],
    pinned: Boolean(asset.is_pinned),
    creatorDisplayId: asset.creator_display_id ?? '',
    fileUrl: asset.file_url ?? '',
    thumbnailUrl: asset.thumbnail_url ?? '',
    url: asset.url ?? '',
    width: asset.metadata_width ?? null,
    height: asset.metadata_height ?? null,
    duration: asset.metadata_duration ?? null,
    createdAt: asset.created_at ?? '',
  };
}
