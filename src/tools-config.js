import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { ArgumentError, CommandError } from './errors.js';
import { API } from './utils.js';

// 缓存路径用 getter 取，便于测试改 HOME
const getCacheFile = () => join(homedir(), '.config', 'zovii', 'tools-cache.json');
const DEFAULT_TTL_MS = 3600_000;

// options 元素混用裸字符串与 {value,label,label_en} 对象，统一成字符串数组
export function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.map((opt) =>
    opt && typeof opt === 'object' ? String(opt.value) : String(opt),
  );
}

export function findTool(tools, toolId) {
  const list = Array.isArray(tools) ? tools : [];
  const tool = list.find((t) => t.id === toolId);
  if (!tool) {
    throw new ArgumentError(
      `未知工具 "${toolId}"，可选：${list.map((t) => t.id).join(' / ')}`,
    );
  }
  return tool;
}

// 产品端标记 hidden 的模型不对外暴露，CLI 一律当作不存在
export function visibleModels(tool) {
  return (tool?.models ?? []).filter((m) => m?.hidden !== true);
}

export function findModel(tool, modelId) {
  const models = visibleModels(tool);
  const model = models.find((m) => m.id === modelId);
  if (!model) {
    throw new ArgumentError(
      `未知模型 "${modelId}"，可选：${models.map((m) => m.id).join(' / ')}`,
    );
  }
  return model;
}

export function getDefaultModel(tool) {
  const models = visibleModels(tool);
  return models.find((m) => m.default === true) ?? models[0] ?? null;
}

// 与产品前端一致的 schema 合并：模型专属 schema 优先，再用 field_overrides 浅覆盖
export function resolveFields(tool, subFeatureId, modelId) {
  const subFeature = (tool?.sub_features ?? []).find((s) => s.id === subFeatureId);
  if (!subFeature) {
    throw new ArgumentError(
      `工具 "${tool?.id}" 没有子功能 "${subFeatureId}"，可选：${(tool?.sub_features ?? [])
        .map((s) => s.id)
        .join(' / ')}`,
    );
  }
  const model = findModel(tool, modelId);
  const baseFields =
    model.sub_feature_form_schemas?.[subFeatureId]?.fields ?? subFeature.form_schema?.fields ?? [];

  const out = new Map();
  for (const field of baseFields) {
    const ov = model.field_overrides?.[field.key] ?? {};
    const visible = ov.visible ?? field.visible;
    out.set(field.key, {
      key: field.key,
      type: ov.type ?? field.type,
      options: normalizeOptions(ov.options ?? field.options),
      default: ov.default ?? field.default,
      visible: visible !== false,
      maxCount: ov.max_count ?? field.max_count ?? null,
      // 动态默认值规则：源字段非空时该字段改用 auto_value_when.value（产品前端 useResolvedFields 语义）
      autoValueWhen: ov.auto_value_when ?? field.auto_value_when ?? null,
      // field_overrides.required 可以把基础 schema 的 required 覆盖掉
      required: ov.required ?? field.required === true,
    });
  }
  return out;
}

// 在字段枚举中不区分大小写地匹配用户输入，返回 schema 的规范值；无枚举约束时原样返回
export function matchOption(field, value) {
  // 用户输入可能带首尾空格（如 --duration " 5"），先 trim 再匹配
  const s = String(value).trim();
  const options = normalizeOptions(field?.options);
  if (!options.length) return s;
  return options.find((opt) => opt.toLowerCase() === s.toLowerCase()) ?? null;
}

// auto_value_when 的 not_empty 判定：空字符串 / 空数组 / null / undefined 都算空
function isNotEmpty(value) {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

// 按模型 schema 组装任务参数：未传的字段回填 schema 默认值，传了的字段按 schema 校验
export function createParams(model, fields) {
  const params = {};
  const unsupported = (label) => new ArgumentError(`模型 ${model.id} 不支持 ${label}`);
  // 用户没显式传值时的回填：优先命中 auto_value_when 动态默认值，否则用 schema 静态 default
  const fillDefault = (key, field) => {
    if (!field) return;
    const rule = field.autoValueWhen;
    if (rule?.condition === 'not_empty' && isNotEmpty(params[rule.source_field])) {
      params[key] = rule.value;
      return;
    }
    if (field.default !== null && field.default !== undefined) params[key] = field.default;
  };
  return {
    params,
    // 枚举参数：大小写不敏感匹配，写入 schema 的规范值
    option(key, value, label) {
      const field = fields.get(key);
      if (value === undefined || value === '') {
        fillDefault(key, field);
        return;
      }
      if (!field) throw unsupported(label);
      const canonical = matchOption(field, value);
      if (canonical === null) {
        throw new ArgumentError(
          `模型 ${model.id} 的 ${label} 不支持 "${value}"，可选：${field.options.join(' / ')}`,
        );
      }
      params[key] = canonical;
    },
    // 素材参数：字段不存在或产品端不可见时，用户显式传入即报错；数组按 max_count 限量
    input(key, value, label) {
      const field = fields.get(key);
      const empty = value === undefined || value === '' || (Array.isArray(value) && !value.length);
      if (empty) {
        fillDefault(key, field);
        return;
      }
      if (!field || !field.visible) throw unsupported(label);
      if (Array.isArray(value) && field.maxCount && value.length > field.maxCount) {
        throw new ArgumentError(`${label} 最多 ${field.maxCount} 个（当前 ${value.length} 个）`);
      }
      params[key] = value;
    },
    // 开关参数：provided 表示用户是否显式指定，未指定则用 schema 默认值
    flag(key, provided, value, label) {
      const field = fields.get(key);
      if (!provided) {
        fillDefault(key, field);
        return;
      }
      if (!field || !field.visible) throw unsupported(label);
      params[key] = value;
    },
  };
}

// matrix 的 key 大小写可能与用户输入不一致（如 1k vs 1K）
function pickKey(obj, key) {
  if (!obj || key === undefined || key === null) return undefined;
  const s = String(key);
  if (Object.prototype.hasOwnProperty.call(obj, s)) return obj[s];
  const hit = Object.keys(obj).find((k) => k.toLowerCase() === s.toLowerCase());
  return hit === undefined ? undefined : obj[hit];
}

// 估算单次调用积分；不含 surcharge（额外参考图等由调用方处理）
export function estimateCost(model, params = {}) {
  const rate = model?.rate;
  if (!rate) return null;
  if (typeof rate.per_call === 'number') return rate.per_call;
  const matrix = rate.matrix;
  if (!matrix) return null;
  if (rate.type === 'video') {
    // 参考视频 / 生成音频会走带后缀的计价行（如 720p_refvideo_sound），按优先级回退到裸分辨率
    const res = params.resolution;
    const rv = params.reference_video_input;
    const hasRefVideo = Array.isArray(rv) ? rv.length > 0 : rv !== undefined && rv !== null && rv !== '';
    const hasAudio = params.generate_audio === true;
    const keys = [];
    if (res !== undefined && res !== null) {
      if (hasRefVideo && hasAudio) keys.push(`${res}_refvideo_sound`);
      if (hasRefVideo) keys.push(`${res}_refvideo`);
      if (hasAudio) keys.push(`${res}_sound`);
    }
    keys.push(res);
    for (const key of keys) {
      const cost = pickKey(pickKey(matrix, key), params.duration);
      if (typeof cost === 'number') return cost;
    }
    return null;
  }
  const row = pickKey(matrix, params.image_size ?? params.size);
  let cost = pickKey(row, params.quality);
  // 只有唯一档位的模型（如 seedream-5-0-pro）不暴露 quality 参数，直接取该档
  if (cost === undefined && params.quality === undefined && row && typeof row === 'object') {
    const values = Object.values(row);
    if (values.length === 1) cost = values[0];
  }
  return typeof cost === 'number' ? cost : null;
}

// 提交前的预估积分：单次估价 + 子功能附加费，按张数累计；无法估算时返回 null
export function estimateTotal(tool, subFeatureId, model, params, count = 1) {
  const est = estimateCost(model, params);
  if (est === null) return null;
  const sub = (tool?.sub_features ?? []).find((s) => s.id === subFeatureId);
  const surcharge = typeof sub?.surcharge === 'number' ? sub.surcharge : 0;
  return Math.round((est + surcharge) * count * 100) / 100;
}

export async function fetchTools({ fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetchImpl(`${API}/tools`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (resp.status < 200 || resp.status >= 300) {
      throw new CommandError(`获取模型配置失败：HTTP ${resp.status}`);
    }
    const tools = await resp.json();
    if (!Array.isArray(tools)) throw new CommandError('获取模型配置失败：响应格式不是数组');
    return tools;
  } finally {
    clearTimeout(timer);
  }
}

async function readCache(cacheFile) {
  try {
    const parsed = JSON.parse(await readFile(cacheFile, 'utf8'));
    if (!Array.isArray(parsed?.tools) || typeof parsed.fetched_at !== 'number') return null;
    return parsed;
  } catch {
    // 文件不存在或内容损坏，等同于没有缓存
    return null;
  }
}

async function writeCache(cacheFile, payload) {
  await mkdir(dirname(cacheFile), { recursive: true });
  // 原子写：先落临时文件再 rename，避免中途失败留下半截 JSON
  const tmp = `${cacheFile}.tmp`;
  await writeFile(tmp, JSON.stringify(payload), 'utf8');
  await rename(tmp, cacheFile);
}

export async function getToolsConfig({
  refresh = false,
  ttlMs = DEFAULT_TTL_MS,
  cacheFile = getCacheFile(),
  fetchImpl,
  now = Date.now,
  warn = (msg) => process.stderr.write(msg + '\n'),
} = {}) {
  const cached = await readCache(cacheFile);
  if (!refresh && cached && now() - cached.fetched_at < ttlMs) return cached.tools;

  let tools;
  try {
    tools = await fetchTools(fetchImpl ? { fetchImpl } : {});
  } catch (err) {
    if (cached) {
      warn(`模型配置刷新失败，使用本地缓存（${new Date(cached.fetched_at).toLocaleString()}）`);
      return cached.tools;
    }
    throw new CommandError(`无法获取模型配置：${err.message}；请检查网络后重试`);
  }

  // 缓存写入失败不影响本次结果，只提示
  try {
    await writeCache(cacheFile, { fetched_at: now(), tools });
  } catch (err) {
    warn(`模型配置缓存写入失败：${err.message}`);
  }
  return tools;
}
