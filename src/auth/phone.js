import { CommandError } from '../errors.js';
import { saveAuth, parseJwtExp } from '../token.js';

const API = 'https://zovii.studio/api/v1';

async function parseDetail(resp) {
  const text = await resp.text().catch(() => '');
  try {
    return JSON.parse(text).detail || text;
  } catch {
    return text;
  }
}

export async function sendCode(phone, { purpose = 'login' } = {}) {
  const resp = await fetch(`${API}/auth/send-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, purpose }),
  });
  if (!resp.ok) {
    const detail = await parseDetail(resp);
    if (resp.status === 429) {
      throw new CommandError(`验证码发送过于频繁，请稍后再试（HTTP 429）：${detail}`);
    }
    if (resp.status === 422) {
      throw new CommandError(`手机号格式被后端拒绝（HTTP 422）：${detail}`);
    }
    throw new CommandError(`验证码发送失败（HTTP ${resp.status}）：${detail}`);
  }
  return resp.json();
}

export async function loginWithPhoneCode(phone, code) {
  const resp = await fetch(`${API}/auth/phone-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  if (!resp.ok) {
    const detail = await parseDetail(resp);
    if (resp.status === 400 || resp.status === 401) {
      throw new CommandError(
        `验证码错误或已过期，请重新运行 'zovii send-code <手机号>' 获取新验证码`,
      );
    }
    if (resp.status === 403) {
      throw new CommandError(
        '当前暂时无法登录，请约 15 分钟后再尝试。如确认手机号无误仍持续遇到，请访问 https://zovii.studio 检查账号状态。',
      );
    }
    if (resp.status === 404) {
      throw new CommandError(
        '该手机号尚未注册，请先在 https://zovii.studio 注册账号',
      );
    }
    throw new CommandError(`登录失败（HTTP ${resp.status}）：${detail}`);
  }
  const data = await resp.json();
  const expires_at = parseJwtExp(data.access_token);
  await saveAuth({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at,
  });
  return { user: data.user, expires_at };
}
