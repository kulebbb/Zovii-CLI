import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { AuthRequiredError, CommandError } from './errors.js';

const AUTH_FILE = join(homedir(), '.config', 'zovii', 'auth.json');
const API = 'https://zovii.studio/api/v1';
const REFRESH_THRESHOLD = 300;

export function parseJwtExp(token) {
  try {
    const part = String(token ?? '').split('.')[1];
    if (!part) return null;
    const pad = part + '='.repeat((4 - (part.length % 4)) % 4);
    const decoded = Buffer.from(pad, 'base64url').toString('utf8');
    return JSON.parse(decoded).exp ?? null;
  } catch {
    return null;
  }
}

export async function loadAuth() {
  try {
    const raw = await readFile(AUTH_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveAuth(data) {
  await mkdir(dirname(AUTH_FILE), { recursive: true });
  await writeFile(AUTH_FILE, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
}

export async function clearAuth() {
  try {
    await unlink(AUTH_FILE);
  } catch {}
}

export async function loginWithPassword(username, password) {
  const body = new URLSearchParams({ username, password });
  const resp = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    let detail = text;
    try {
      detail = JSON.parse(text).detail || text;
    } catch {}
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

export async function refreshAccessToken(refresh_token) {
  const resp = await fetch(`${API}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token }),
  });
  if (!resp.ok) {
    await clearAuth();
    throw new AuthRequiredError('Token 已过期，请重新运行 zovii login');
  }
  const data = await resp.json();
  const expires_at = parseJwtExp(data.access_token);
  const existing = (await loadAuth()) ?? {};
  await saveAuth({ ...existing, access_token: data.access_token, expires_at });
  return data.access_token;
}

export async function getToken() {
  const auth = await loadAuth();
  if (!auth?.access_token) throw new AuthRequiredError();
  const now = Math.floor(Date.now() / 1000);
  if (auth.expires_at && auth.expires_at - now < REFRESH_THRESHOLD) {
    return refreshAccessToken(auth.refresh_token);
  }
  return auth.access_token;
}
