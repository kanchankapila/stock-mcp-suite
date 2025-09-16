// Shared lightweight formatting helpers
export function escapeHtml(s: unknown): string {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
export function fmtNum(x: unknown, d=2): string {
  const n = Number(x);
  return Number.isFinite(n) ? n.toFixed(d) : '—';
}
export function fmtPct(x: unknown, d=2): string {
  const n = Number(x);
  return Number.isFinite(n) ? (n*100).toFixed(d)+'%' : '—';
}
