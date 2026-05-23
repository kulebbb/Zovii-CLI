import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { looksLikeUuid, isLocalFilePath, guessMimeType } from '../src/helpers.js';

test('looksLikeUuid 识别真 UUID', () => {
  assert.equal(looksLikeUuid('eaf8d90f-44ab-4870-942d-d97089e85eef'), true);
  assert.equal(looksLikeUuid('EAF8D90F-44AB-4870-942D-D97089E85EEF'), true);
});

test('looksLikeUuid 拒绝非 UUID', () => {
  assert.equal(looksLikeUuid('./photo.png'), false);
  assert.equal(looksLikeUuid('hello'), false);
  assert.equal(looksLikeUuid(''), false);
  assert.equal(looksLikeUuid('eaf8d90f-44ab-4870-942d'), false);
});

test('guessMimeType 按扩展名映射', () => {
  assert.equal(guessMimeType('a.png'), 'image/png');
  assert.equal(guessMimeType('a.JPG'), 'image/jpeg');
  assert.equal(guessMimeType('dir/b.jpeg'), 'image/jpeg');
  assert.equal(guessMimeType('a.webp'), 'image/webp');
  assert.equal(guessMimeType('a.mp4'), 'video/mp4');
  assert.equal(guessMimeType('a.mov'), 'video/quicktime');
  assert.equal(guessMimeType('a.mp3'), 'audio/mpeg');
  assert.equal(guessMimeType('a.wav'), 'audio/wav');
  assert.equal(guessMimeType('a.unknown'), 'application/octet-stream');
});

test('isLocalFilePath: 存在的文件为真', () => {
  const f = join(tmpdir(), `zovii-helper-test-${Date.now()}.png`);
  writeFileSync(f, 'x');
  try {
    assert.equal(isLocalFilePath(f), true);
  } finally {
    rmSync(f);
  }
});

test('isLocalFilePath: UUID 形态为假', () => {
  assert.equal(isLocalFilePath('eaf8d90f-44ab-4870-942d-d97089e85eef'), false);
});

test('isLocalFilePath: 不存在的路径为假', () => {
  assert.equal(isLocalFilePath('/no/such/file/zzz.png'), false);
});
