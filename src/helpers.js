import { existsSync } from 'node:fs';

export function looksLikeUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(s ?? '').trim(),
  );
}

export function isLocalFilePath(ref) {
  const s = String(ref ?? '').trim();
  if (!s || looksLikeUuid(s)) return false;
  return existsSync(s);
}

const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

export function guessMimeType(filePath) {
  const ext = String(filePath ?? '').split('.').pop().toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}
