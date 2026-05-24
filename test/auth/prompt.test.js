import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { promptLine, promptPhone, promptCode } from '../../src/auth/prompt.js';

function makeIO(lines) {
  const input = new PassThrough();
  const output = new PassThrough();
  // 异步注入用户输入
  setImmediate(() => {
    for (const line of lines) input.write(line + '\n');
    input.end();
  });
  return { input, output };
}

test('promptLine 返回首行输入（trim）', async () => {
  const io = makeIO(['  hello  ']);
  const got = await promptLine('label: ', { input: io.input, output: io.output, isTTY: true });
  assert.equal(got, 'hello');
});

test('promptLine 非 TTY 抛 CommandError 带建议', async () => {
  const io = makeIO([]);
  await assert.rejects(
    promptLine('请输入手机号: ', { input: io.input, output: io.output, isTTY: false, field: 'phone' }),
    (err) => {
      assert.equal(err.name, 'CommandError');
      assert.match(err.message, /非交互终端/);
      assert.match(err.message, /zovii login/);
      return true;
    },
  );
});

test('promptPhone 输入合法立即返回', async () => {
  const io = makeIO(['13800000000']);
  const got = await promptPhone({ input: io.input, output: io.output, isTTY: true });
  assert.equal(got, '13800000000');
});

test('promptPhone 输入非法重试，第 2 次合法返回', async () => {
  const io = makeIO(['abc', '13800000000']);
  const got = await promptPhone({ input: io.input, output: io.output, isTTY: true });
  assert.equal(got, '13800000000');
});

test('promptPhone 连续 3 次非法抛 CommandError', async () => {
  const io = makeIO(['abc', 'def', 'ghi']);
  await assert.rejects(
    promptPhone({ input: io.input, output: io.output, isTTY: true }),
    (err) => { assert.equal(err.name, 'CommandError'); assert.match(err.message, /3 次输入不合法/); return true; },
  );
});

test('promptCode 输入合法立即返回', async () => {
  const io = makeIO(['123456']);
  const got = await promptCode({ input: io.input, output: io.output, isTTY: true });
  assert.equal(got, '123456');
});

test('promptCode 非 TTY 抛带 --code 建议', async () => {
  const io = makeIO([]);
  await assert.rejects(
    promptCode({ input: io.input, output: io.output, isTTY: false }),
    (err) => { assert.match(err.message, /--code/); return true; },
  );
});
