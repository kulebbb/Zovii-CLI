import { test } from 'node:test';
import assert from 'node:assert/strict';
import { printOutput } from '../src/output.js';

function capture(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...a) => lines.push(a.join(' '));
  fn();
  console.log = orig;
  return lines.join('\n');
}

test('json 格式输出合法 JSON 数组', () => {
  const out = capture(() =>
    printOutput([{ id: '123', name: 'foo' }], ['id', 'name'], 'json')
  );
  const parsed = JSON.parse(out);
  assert.equal(parsed[0].id, '123');
  assert.equal(parsed[0].name, 'foo');
});

test('json 格式空数组输出 []', () => {
  const out = capture(() => printOutput([], ['id'], 'json'));
  assert.equal(out.trim(), '[]');
});

test('table 格式包含列标题和数据', () => {
  const out = capture(() =>
    printOutput([{ id: '123', name: 'foo' }], ['id', 'name'], 'table')
  );
  assert.match(out, /id/);
  assert.match(out, /name/);
  assert.match(out, /123/);
  assert.match(out, /foo/);
});

test('table 格式截断白名单内的长字段 (fileUrl)', () => {
  const long = 'https://example.com/' + 'a'.repeat(200);
  const out = capture(() =>
    printOutput([{ fileUrl: long }], ['fileUrl'], 'table')
  );
  assert.ok(!out.includes(long), 'fileUrl 这类长 URL 应被截断');
  assert.match(out, /https:\/\/example\.com\//);
});

test('table 格式不截断身份字段 (assetId / localPath / assetName)', () => {
  const longPath = '/Users/test/' + 'a'.repeat(80) + '.jpg';
  const longId = 'asset-' + 'b'.repeat(80);
  const longName = 'name-' + 'c'.repeat(80) + '.png';
  const out = capture(() =>
    printOutput(
      [{ assetId: longId, localPath: longPath, assetName: longName }],
      ['assetId', 'localPath', 'assetName'],
      'table',
    ),
  );
  assert.ok(out.includes(longPath), 'localPath 完整保留');
  assert.ok(out.includes(longId), 'assetId 完整保留');
  assert.ok(out.includes(longName), 'assetName 完整保留');
});

test('table 格式跳过全为 null 的列', () => {
  const out = capture(() =>
    printOutput([{ id: '1', width: null }], ['id', 'width'], 'table')
  );
  assert.ok(!out.includes('width'), '全 null 列不应出现');
});
