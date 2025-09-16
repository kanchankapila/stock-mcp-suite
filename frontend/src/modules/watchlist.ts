import { fetchJson, loadInto, escapeHtml } from './fetch';
import { Api } from '../app/services/api.service';
import { AppState } from '../state/store';
import { emit } from '../lib/events';

interface WatchlistEntry { symbol: string; added_at?: string; last?: number; changePct?: number; }

export class WatchlistComponent {
  private root: HTMLElement;
  private listEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private addBtn: HTMLButtonElement;
  private api = new Api();
  private inited = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'card';
    this.root.id = 'watchlistCard';
    this.root.innerHTML = `
      <div class="muted">Watchlist</div>
      <div class="flex" style="gap:6px; margin-top:6px; flex-wrap:wrap">
        <input id="wlAddInput" placeholder="Symbol" style="width:120px" aria-label="Add symbol" />
        <button id="wlAddBtn" class="btn-sm" aria-label="Add to watchlist">Add</button>
        <button id="wlRefresh" class="btn-sm" aria-label="Refresh watchlist">Refresh</button>
      </div>
      <div id="wlBody" class="mono" style="margin-top:6px; white-space:pre-wrap"></div>`;
    this.listEl = this.root.querySelector('#wlBody') as HTMLElement;
    this.inputEl = this.root.querySelector('#wlAddInput') as HTMLInputElement;
    this.addBtn = this.root.querySelector('#wlAddBtn') as HTMLButtonElement;
    (this.root.querySelector('#wlAddBtn') as HTMLButtonElement).addEventListener('click', ()=> this.handleAdd());
    (this.root.querySelector('#wlRefresh') as HTMLButtonElement).addEventListener('click', ()=> this.render(true));
    this.inputEl.addEventListener('keydown', (e)=> { if (e.key === 'Enter') this.handleAdd(); });
  }

  getElement(){ return this.root; }

  private async handleAdd() {
    const sym = (this.inputEl.value||'').trim().toUpperCase();
    if (!sym) return;
    try {
      await fetchJson('/api/watchlist/add', { method:'POST', body:{ symbol: sym }});
      this.inputEl.value='';
      this.render(true);
    } catch (err:any) {
      this.listEl.innerHTML = `<div>${escapeHtml(String(err?.message||err))}</div>`;
    }
  }

  async render(force=false) {
    if (this.inited && !force) return;
    this.inited = true;
    await loadInto(this.listEl, async ()=>{
      const data = await fetchJson<{ data?: any[]; ok?: boolean }>('/api/watchlist');
      const rows: WatchlistEntry[] = Array.isArray((data as any)?.data) ? (data as any).data : Array.isArray(data) ? (data as any) : [];
      if (!rows.length) return '<div class="muted">(empty)</div>';
      const frag = document.createDocumentFragment();
      const ul = document.createElement('ul');
      ul.style.listStyle='none'; ul.style.padding='0'; ul.style.margin='0';
      ul.setAttribute('role','listbox');
      rows.forEach(r => {
        const li = document.createElement('li');
        li.tabIndex = 0;
        li.dataset.symbol = r.symbol;
        li.setAttribute('role','option');
        li.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:4px 6px;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;gap:6px;';
        li.innerHTML = `<span style="font-weight:600">${escapeHtml(r.symbol)}</span>` +
          `<span style="font-size:11px;color:var(--muted)">${r.changePct!==undefined? (r.changePct>0?'+':'')+r.changePct?.toFixed(2)+'%':''}</span>` +
          `<button class="btn-sm" data-del="1" aria-label="Delete ${escapeHtml(r.symbol)}" style="margin-left:auto">✕</button>`;
        li.addEventListener('click', (e)=> { if ((e.target as HTMLElement).dataset.del==='1') return; AppState.setSymbol(r.symbol); emit('symbol:select', r.symbol); });
        li.addEventListener('keydown', (e)=> {
          if (e.key === 'Delete') { this.deleteSymbol(r.symbol); }
          if (e.key === 'Enter') { AppState.setSymbol(r.symbol); emit('symbol:select', r.symbol); }
          if (e.key === 'ArrowDown') { (li.nextElementSibling as HTMLElement)?.focus(); }
          if (e.key === 'ArrowUp') { (li.previousElementSibling as HTMLElement)?.focus(); }
        });
        li.querySelector('[data-del]')?.addEventListener('click', ()=> this.deleteSymbol(r.symbol));
        ul.appendChild(li);
      });
      frag.appendChild(ul);
      this.listEl.innerHTML='';
      this.listEl.appendChild(frag);
    });
  }

  private async deleteSymbol(symbol: string) {
    try { await fetchJson(`/api/watchlist/${encodeURIComponent(symbol)}`, { method:'DELETE' }); this.render(true); } catch {}
  }
}

let _instance: WatchlistComponent | null = null;
export function getWatchlistComponent() { if (!_instance) _instance = new WatchlistComponent(); return _instance; }
