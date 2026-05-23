import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AuthRequiredError,
  ArgumentError,
  CommandError,
  TimeoutError,
} from '../src/errors.js';

test('AuthRequiredError 有默认提示语（含 zovii login）', () => {
  const err = new AuthRequiredError();
  assert.equal(err.name, 'AuthRequiredError');
  assert.match(err.message, /zovii login/);
  assert.ok(err instanceof Error);
});

test('AuthRequiredError 接受自定义消息', () => {
  const err = new AuthRequiredError('custom');
  assert.equal(err.message, 'custom');
});

test('ArgumentError 记录消息和 name', () => {
  const err = new ArgumentError('bad arg');
  assert.equal(err.name, 'ArgumentError');
  assert.equal(err.message, 'bad arg');
  assert.ok(err instanceof Error);
});

test('CommandError 记录消息和 name', () => {
  const err = new CommandError('failed');
  assert.equal(err.name, 'CommandError');
  assert.equal(err.message, 'failed');
});

test('TimeoutError 消息含 label 和秒数', () => {
  const err = new TimeoutError('生图', 300);
  assert.equal(err.name, 'TimeoutError');
  assert.match(err.message, /生图/);
  assert.match(err.message, /300/);
});
