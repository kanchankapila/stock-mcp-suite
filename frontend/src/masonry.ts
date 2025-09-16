// Masonry grid enhancer for existing layout (no Angular refactor required)
// Applies a gapless CSS Grid masonry to each ".row" container and resizes
// each ".card" to span computed rows via ResizeObserver.

type ObsEntry = { el: HTMLElement; ro: ResizeObserver };

const BASE_ROW = 8; // px
const GAP = 16; // px (keep in sync with CSS gap)
const observed = new Map<HTMLElement, ResizeObserver>();

function isSSR() {
  return typeof window === 'undefined' || typeof document === 'undefined';
}

function styleRowGrid(row: HTMLElement) {
  const s = row.style;
  s.display = 'grid';
  s.gridTemplateColumns = 'repeat(auto-fill, minmax(320px, 1fr))';
  s.gap = `${GAP}px`;
  s.gridAutoRows = `${BASE_ROW}px`;
  (s as any)['gridAutoFlow'] = 'dense';
}

function calcSpan(h: number) {
  return Math.ceil((h + GAP) / (BASE_ROW + GAP));
}

function observeCard(card: HTMLElement) {
  if (observed.has(card)) return;
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const target = e.target as HTMLElement;
      const h = Math.ceil(target.getBoundingClientRect().height);
      const rows = calcSpan(h);
      target.style.gridRowEnd = `span ${rows}`;
      target.style.breakInside = 'avoid';
    }
  });
  ro.observe(card);
  observed.set(card, ro);
}

function enhanceRow(row: HTMLElement) {
  try { styleRowGrid(row); } catch {}
  const cards = Array.from(row.querySelectorAll<HTMLElement>(":scope > .card, :scope .card"));
  for (const c of cards) observeCard(c);
}

function initMasonry() {
  if (isSSR()) return;
  const rows = Array.from(document.querySelectorAll<HTMLElement>('.row'));
  rows.forEach(enhanceRow);
  // Watch DOM changes to attach to future cards
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (!(m.target instanceof HTMLElement)) continue;
      if (m.type === 'childList') {
        const row = m.target.closest('.row') as HTMLElement | null;
        if (row) enhanceRow(row);
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
  // Debounce window resize reflow
  let t: any = null;
  window.addEventListener('resize', () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => rows.forEach(enhanceRow), 120);
  });
}

window.addEventListener('DOMContentLoaded', initMasonry);

