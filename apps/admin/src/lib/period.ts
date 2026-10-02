// Report periods in WIB calendar days (YYYY-MM-DD), for the revenue page and its download.
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const todayWib = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

export function presets() {
  const today = todayWib();
  const [y, m] = today.split('-').map(Number);
  return {
    'Bulan ini': [`${today.slice(0, 8)}01`, today],
    'Bulan lalu': [iso(new Date(Date.UTC(y, m - 2, 1))), iso(new Date(Date.UTC(y, m - 1, 0)))],
    '30 hari': [iso(new Date(Date.parse(today) - 29 * 86400_000)), today],
    'Tahun ini': [`${y}-01-01`, today],
  } as Record<string, [string, string]>;
}

// ?from=&to= (inclusive), this month by default; swapped when given backwards.
export function period(sp: { from?: string; to?: string }): [string, string] {
  const [dFrom, dTo] = presets()['Bulan ini'];
  const from = isDate(sp.from) ? sp.from : dFrom;
  const to = isDate(sp.to) ? sp.to : dTo;
  return from <= to ? [from, to] : [to, from];
}
