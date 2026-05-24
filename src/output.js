const TRUNC = 60;
// 只对 URL / 自由文本类长字段做截断；身份字段（id / 路径 / 名称等）始终完整显示。
const TRUNCATE_COLS = new Set(['fileUrl', 'thumbnailUrl', 'prompt', 'error']);

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
    return TRUNCATE_COLS.has(col) ? s.slice(0, TRUNC) : s;
  };
  const widths = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => cell(r[c], c).length)),
  );

  console.log(cols.map((c, i) => c.padEnd(widths[i])).join('  '));
  console.log(cols.map((_, i) => '─'.repeat(widths[i])).join('  '));
  for (const row of rows) {
    console.log(cols.map((c, i) => cell(row[c], c).padEnd(widths[i])).join('  '));
  }
}

export function handleError(err) {
  const name = err.name || 'Error';
  process.stderr.write(`\x1b[31m${name}\x1b[0m: ${err.message}\n`);
  process.exit(1);
}
