import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJwtExp } from '../src/token.js';

function makeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesig`;
}

test('parseJwtExp 从 JWT payload 中提取 exp', () => {
  const exp = 1748000000;
  const token = makeJwt({ sub: 'user1', exp });
  assert.equal(parseJwtExp(token), exp);
});

test('parseJwtExp 对无效 token 返回 null', () => {
  assert.equal(parseJwtExp('not.a.jwt'), null);
  assert.equal(parseJwtExp(''), null);
  assert.equal(parseJwtExp('a.b'), null);
});
