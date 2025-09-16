import { on, emit } from '../lib/events';
import { AppState } from '../state/store';

let _inited = false;
let card: HTMLElement | null = null;

export function initAgent(){
  if (_inited) return; _inited = true;
  const container = document.querySelector('main.content .container');
  if (!container) return;
  card = document.createElement('div');
  card.className = 'card';
  card.id = 'agentCard';
  card.style.display = 'none';
  card.innerHTML = `
    <div class="muted">AI Agent</div>
    <form id="agentForm" style="margin-top:6px; display:flex; flex-direction:column; gap:6px">
      <textarea id="agentQ" placeholder="Ask about selected symbol or general market..." rows="3" aria-label="Agent question"></textarea>
      <div class="flex" style="justify-content:space-between;align-items:center;gap:8px">
        <div style="font-size:11px;color:var(--muted)">Symbol: <span id="agentSym">(none)</span></div>
        <div class="flex" style="gap:6px">
          <label style="font-size:11px;display:flex;align-items:center;gap:4px"><input type="checkbox" id="agentUseSym" checked /> Use symbol</label>
          <button class="btn-sm" type="submit">Run</button>
        </div>
      </div>
    </form>
    <div id="agentOut" style="margin-top:8px;font-size:13px;line-height:1.4;white-space:pre-wrap;border:1px solid var(--border);border-radius:8px;padding:8px;min-height:60px" aria-live="polite"></div>`;
  container.appendChild(card);

  const form = card.querySelector('#agentForm') as HTMLFormElement;
  const qEl = card.querySelector('#agentQ') as HTMLTextAreaElement;
  const out = card.querySelector('#agentOut') as HTMLElement;
  const symEl = card.querySelector('#agentSym') as HTMLElement;
  const useSymEl = card.querySelector('#agentUseSym') as HTMLInputElement;

  function updateSymbol(){ const sym = AppState.snapshot().symbol; symEl.textContent = sym || '(none)'; }
  updateSymbol();

  on('symbol:changed', ()=> updateSymbol());
  on('page:change', (p)=> { if (card) card.style.display = p==='insight' ? '' : 'none'; });
  // initial visibility
  if (AppState.snapshot().page === 'insight') card.style.display='';

  form.addEventListener('submit', async (e)=> {
    e.preventDefault();
    const q = (qEl.value||'').trim(); if(!q) return;
    out.textContent = ''; out.setAttribute('data-running','1');
    const sym = AppState.snapshot().symbol;
    let body: any = { q };
    if (useSymEl.checked && sym) body.symbol = sym;
    try {
      const resp = await fetch('/api/agent/stream', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      if (!resp.ok || !resp.body) { out.textContent = 'Request failed'; return; }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        // Expect SSE style events; accumulate only data: lines with type=token or final answer
        chunk.split(/\n\n/).forEach(block => {
          const lines = block.split('\n');
            let ev=''; let data='';
            for (const l of lines) {
              if (l.startsWith('event:')) ev = l.slice(6).trim();
              if (l.startsWith('data:')) data = l.slice(5).trim();
            }
            if (!ev || !data) return;
            if (ev === 'token') {
              try { const obj = JSON.parse(data); if (obj?.token) out.textContent += obj.token; } catch {}
            }
            if (ev === 'done') {
              try { const obj = JSON.parse(data); if (obj?.answer) out.textContent = obj.answer; } catch {}
            }
        });
      }
    } catch (err:any) {
      out.textContent = 'Error: ' + (err?.message||String(err));
    } finally { out.removeAttribute('data-running'); }
  });
}
