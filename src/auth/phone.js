import { CommandError } from '../errors.js';

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
