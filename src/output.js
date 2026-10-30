const TRUNC = 60;
// 只对 URL / 自由文本类长字段做截断；身份字段（id / 路径 / 名称等）始终完整显示。
const TRUNCATE_COLS = new Set(['fileUrl', 'thumbnailUrl', 'prompt', 'error']);

// 终端里中日韩文字、全角符号和 emoji 占两格，按字符数对齐会把后面的列挤歪
const WIDE_CHAR =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u;

export function displayWidth(s) {
  let w = 0;
  for (const ch of s) w += WIDE_CHAR.test(ch) ? 2 : 1;
  return w;
}

function pad(s, width) {
  return s + ' '.repeat(Math.max(0, width - displayWidth(s)));
}

export function printOutput(rows, columns, format = 'table') {
  if (format === 'json') {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (!rows || rows.length === 0) {
    console.log('(no results)');
    return;
  }

  // 跳过所有行中均为 null/undefined/'' 的列
  const cols = columns.filter((c) =>
    rows.some((r) => r[c] !== null && r[c] !== undefined && r[c] !== ''),
  );

  const cell = (v, col) => {
    const s = String(v ?? '');
    return TRUNCATE_COLS.has(col) ? [...s].slice(0, TRUNC).join('') : s;
  };
  const widths = cols.map((c) =>
    Math.max(displayWidth(c), ...rows.map((r) => displayWidth(cell(r[c], c)))),
  );

  console.log(cols.map((c, i) => pad(c, widths[i])).join('  '));
  console.log(cols.map((_, i) => '─'.repeat(widths[i])).join('  '));
  for (const row of rows) {
    console.log(cols.map((c, i) => pad(cell(row[c], c), widths[i])).join('  '));
  }
}

export function handleError(err) {
  const name = err.name || 'Error';
  process.stderr.write(`\x1b[31m${name}\x1b[0m: ${err.message}\n`);
  process.exit(1);
}
