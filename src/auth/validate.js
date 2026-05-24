import { ArgumentError } from '../errors.js';

const PHONE_RE = /^1[3-9]\d{9}$/;
const CODE_RE = /^\d{6}$/;

export function isValidPhone(s) {
  return PHONE_RE.test(String(s ?? ''));
}

export function assertPhone(s) {
  const trimmed = String(s ?? '').trim();
  if (!isValidPhone(trimmed)) {
    throw new ArgumentError('手机号格式不正确，应为 11 位国内号码（如 13800000000）');
  }
  return trimmed;
}

export function isValidCode(s) {
  return CODE_RE.test(String(s ?? ''));
}

export function assertCode(s) {
  const trimmed = String(s ?? '').trim();
  if (!isValidCode(trimmed)) {
    throw new ArgumentError('验证码应为 6 位数字');
  }
  return trimmed;
}
