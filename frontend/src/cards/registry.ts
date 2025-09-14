import { emitPageChange } from '../lib/events';

type Card = {
  id: string;              // DOM id of the card container
  page: 'overview'|'insight'|'ai'|'watchlist'|'portfolio'|'alerts'|'settings'|'health';
  init?: () => void;       // optional one-time init
  render?: () => void;     // optional render when page is shown
};

const cards: Card[] = [];
let inited = new Set<string>();

export function registerCard(c: Card) {
  cards.push(c);
}

export function showPage(page: Card['page']) {
  // show only cards registered for this page
  const ids = cards.filter(c => c.page === page).map(c => c.id);
  const set = new Set(ids);
  const allIds = Array.from(new Set(cards.map(c => c.id)));
  for (const id of allIds) {
    const el = document.getElementById(id) as HTMLElement | null;
    if (!el) continue;
    el.style.display = set.has(id) ? '' : 'none';
  }
  // run init/render for matching cards
  for (const c of cards.filter(c => c.page === page)) {
    try {
      if (c.init && !inited.has(c.id)) { c.init(); inited.add(c.id); }
      if (c.render) c.render();
    } catch {}
  }
  try { emitPageChange(page); } catch {}
}

