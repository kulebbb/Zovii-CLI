const TRUNC = 60;

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

  const cell = (v) => String(v ?? '').slice(0, TRUNC);
  const widths = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => cell(r[c]).length)),
  );

  console.log(cols.map((c, i) => c.padEnd(widths[i])).join('  '));
  console.log(cols.map((_, i) => '─'.repeat(widths[i])).join('  '));
  for (const row of rows) {
    console.log(cols.map((c, i) => cell(row[c]).padEnd(widths[i])).join('  '));
  }
}

export function handleError(err) {
  const name = err.name || 'Error';
  process.stderr.write(`\x1b[31m${name}\x1b[0m: ${err.message}\n`);
  process.exit(1);
}
