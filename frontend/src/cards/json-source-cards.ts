import { registerCard } from './registry';
import { onSymbolChange } from '../lib/events';

type SourceMeta = { name:string; label:string; page:string; cardId:string; tickerProvider:string };
let sources: SourceMeta[] = [];
const OVERRIDES = new Set<string>(['src_yahoo_price']);

async function ensureCards() {
  const container = document.querySelector('main.content .container') || document.body;
  if (!container) return;
  try {
    if (!sources.length) {
      const res = await fetch('/api/sources/list').then(r=>r.json());
      sources = Array.isArray(res?.data) ? res.data : [];
    }
  } catch {}
  for (const s of sources) {
    if (OVERRIDES.has(s.cardId)) continue;
    if (s.page !== 'insight') continue;
    if (!document.getElementById(s.cardId)) {
      const card = document.createElement('div'); card.className='card'; card.id = s.cardId;
      card.innerHTML = `<div class="muted">${s.label}</div><div id="${s.cardId}_body" class="mono" style="margin-top:6px; white-space:pre-wrap"></div>`;
      container.appendChild(card);
    }
  }
}

async function renderSource(s: SourceMeta, symbol: string) {
  const body = document.getElementById(`${s.cardId}_body`); if (!body) return;
  body.textContent = 'Loading...';
  try {
    const data = await fetch(`/api/sources/fetch?name=${encodeURIComponent(s.name)}&symbol=${encodeURIComponent(symbol)}`).then(r=>r.json());
    const json = data?.data ?? data;
    body.textContent = JSON.stringify(json, null, 2);
  } catch (e:any) { body.textContent = String(e?.message || e); }
}

async function renderAll(symbol?: string) {
  const sel = symbol || (document.getElementById('stockSelect') as HTMLSelectElement | null)?.value || '';
  if (!sel) return;
  for (const s of sources) { if (s.page==='insight' && !OVERRIDES.has(s.cardId)) renderSource(s, sel); }
}

if (!OVERRIDES.has('src_yahoo_price')) {
  registerCard({ id:'src_yahoo_price', page:'insight', init: ensureCards, render: ()=> renderAll() });
}
onSymbolChange((s)=> renderAll(s));
