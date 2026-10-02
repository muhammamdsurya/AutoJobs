// Spreadsheet downloads: tab-separated UTF-16LE with a BOM, the one CSV flavour Excel opens correctly in any locale
// (Indonesian Windows expects ";" for comma-separated files).
// Text starting with = + - @ is a formula to Excel (CSV injection): such cells get a leading ' so text from portals or
// user names stays text. Numbers are left as numbers.
const cell = (v: string | number | null | undefined) => {
  if (typeof v === 'number') return String(v);
  const s = String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
};

export const excelCsv = (rows: (string | number | null | undefined)[][]) =>
  Buffer.from('﻿' + rows.map((r) => r.map(cell).join('\t')).join('\r\n'), 'utf16le');

export const csvHeaders = (filename: string) => ({
  'content-type': 'text/csv; charset=utf-16le',
  'content-disposition': `attachment; filename="${filename}"`,
  'cache-control': 'private, no-store',
});

// 2026-09-30 01:23 (WIB)
export const wib = (d: Date | string) => new Date(d).toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 16);
