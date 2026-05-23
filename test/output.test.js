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

test('table 格式截断超过 60 字符的值', () => {
  const long = 'a'.repeat(80);
  const out = capture(() =>
    printOutput([{ id: long }], ['id'], 'table')
  );
  assert.ok(!out.includes(long), '超长值应被截断');
  assert.match(out, /aaaaaaaaaa/);
});

test('table 格式跳过全为 null 的列', () => {
  const out = capture(() =>
    printOutput([{ id: '1', width: null }], ['id', 'width'], 'table')
  );
  assert.ok(!out.includes('width'), '全 null 列不应出现');
});
