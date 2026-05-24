import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidPhone,
  assertPhone,
  isValidCode,
  assertCode,
} from '../../src/auth/validate.js';
import { ArgumentError } from '../../src/errors.js';

test('isValidPhone 接受 11 位国内手机号', () => {
  assert.equal(isValidPhone('13800000000'), true);
  assert.equal(isValidPhone('15912345678'), true);
  assert.equal(isValidPhone('19999999999'), true);
});

test('isValidPhone 拒绝非法格式', () => {
  assert.equal(isValidPhone('1380000000'), false);   // 10 位
  assert.equal(isValidPhone('138000000000'), false); // 12 位
  assert.equal(isValidPhone('12345678901'), false);  // 第二位 2
  assert.equal(isValidPhone('10345678901'), false);  // 第二位 0
  assert.equal(isValidPhone('23800000000'), false);  // 首位非 1
  assert.equal(isValidPhone('+8613800000000'), false); // 含前缀
  assert.equal(isValidPhone('138 0000 0000'), false);  // 含空格
  assert.equal(isValidPhone(''), false);
  assert.equal(isValidPhone(null), false);
  assert.equal(isValidPhone(undefined), false);
});

test('assertPhone 返回 trim 后的值', () => {
  assert.equal(assertPhone('  13800000000  '), '13800000000');
});

test('assertPhone 非法时抛 ArgumentError', () => {
  assert.throws(() => assertPhone('abc'), (err) => {
    assert.equal(err.name, 'ArgumentError');
    assert.match(err.message, /手机号格式不正确/);
    return true;
  });
});

test('isValidCode 接受 6 位纯数字', () => {
  assert.equal(isValidCode('000000'), true);
  assert.equal(isValidCode('123456'), true);
  assert.equal(isValidCode('999999'), true);
});

test('isValidCode 拒绝非 6 位或含非数字', () => {
  assert.equal(isValidCode('12345'), false);
  assert.equal(isValidCode('1234567'), false);
  assert.equal(isValidCode('12345a'), false);
  assert.equal(isValidCode(' 123456'), false);
  assert.equal(isValidCode(''), false);
  assert.equal(isValidCode(null), false);
});

test('assertCode 返回 trim 后的值', () => {
  assert.equal(assertCode('  123456  '), '123456');
});

test('assertCode 非法时抛 ArgumentError', () => {
  assert.throws(() => assertCode('xx'), (err) => {
    assert.equal(err.name, 'ArgumentError');
    assert.match(err.message, /验证码应为 6 位数字/);
    return true;
  });
});
