export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false, closed = false;
  function finishCell() { row.push(cell); cell = ""; closed = false; }
  function finishRow() { finishCell(); if (row.some((v) => v.trim())) rows.push(row); row = []; if (rows.length > 501) throw new Error("একসঙ্গে সর্বোচ্চ ৫০০টি বই দিন।"); }
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) { if (c === '"') { if (input[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } } else cell += c; continue; }
    if (c === ',') finishCell();
    else if (c === '\r' || c === '\n') { if (c === '\r' && input[i + 1] === '\n') i++; finishRow(); }
    else if (c === '"' && !cell && !closed) quoted = true;
    else { if (closed || c === '"') throw new Error("CSV-তে উদ্ধৃতি চিহ্নের ফরম্যাট সঠিক নয়।"); cell += c; }
  }
  if (quoted) throw new Error("CSV-তে উদ্ধৃতি চিহ্ন বন্ধ হয়নি।");
  if (cell || row.length || closed) finishRow();
  return rows;
}
export function makeCsv(rows: (string | number | boolean | undefined)[][]) {
  return '\uFEFF' + rows.map((row) => row.map((raw) => {
    let value = String(raw ?? "");
    if (typeof raw === "string" && /^[\s]*[=+\-@]|^[\t\r\n]/.test(value)) value = "'" + value;
    return '"' + value.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
}
