import { on } from '../lib/events';

class TelemetryPanel {
  private root: HTMLElement;
  private list: HTMLElement;
  private open = false;
  private max = 200;
  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'telemetryPanel';
    this.root.style.cssText = 'position:fixed;bottom:8px;right:8px;width:320px;max-height:40vh;display:flex;flex-direction:column;font:11px system-ui;border:1px solid var(--border,#d1d5db);background:rgba(255,255,255,0.95);backdrop-filter:blur(4px);border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,0.12);z-index:9999;';
    const header = document.createElement('div');
    header.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:4px 8px;font-weight:600;cursor:pointer;background:linear-gradient(90deg,#fff,#f1f5f9);border-bottom:1px solid var(--border,#d1d5db);border-radius:10px 10px 0 0;';
    header.innerHTML = '<span>API Telemetry</span><button aria-label="Toggle" style="font-size:11px;padding:2px 6px">Hide</button>';
    this.list = document.createElement('div');
    this.list.setAttribute('role','log');
    this.list.setAttribute('aria-live','polite');
    this.list.style.cssText='overflow:auto;padding:6px;display:flex;flex-direction:column;gap:4px;font-family:ui-monospace,monospace;';
    this.root.appendChild(header); this.root.appendChild(this.list);
    document.body.appendChild(this.root);
    header.addEventListener('click', ()=> this.toggle());
    window.addEventListener('keydown',(e)=>{ if(e.altKey && e.key.toLowerCase()==='t'){ this.toggle(true); }});
    this.appendLine('Ready. Alt+T to toggle.');
  }
  toggle(force?: boolean){ this.open = force !== undefined ? force : !this.open; this.list.style.display = this.open ? 'flex':'none'; }
  appendLine(line: string, kind: 'info'|'error'='info'){
    const el = document.createElement('div');
    el.textContent = line;
    el.style.whiteSpace='pre-wrap';
    el.style.color = kind==='error' ? 'var(--danger,#b91c1c)':'#334155';
    this.list.appendChild(el);
    while (this.list.children.length > this.max) this.list.removeChild(this.list.firstChild!);
    this.list.scrollTop = this.list.scrollHeight;
  }
}

const panel = new TelemetryPanel();

// Track attempt start times for duration (key=url#attempt)
const startTimes = new Map<string, number>();

on('api:attempt', (p)=> { if(!p) return; const key = `${p.url}#${p.attempt}`; startTimes.set(key, performance.now?.()||Date.now()); panel.appendLine(`TRY ${p.attempt} ${p.url}`); });
on('api:success', (p)=> { if(!p) return; const key = `${p.url}#${p.attempt}`; const t0 = startTimes.get(key); const dt = t0? ((performance.now?.()||Date.now())-t0).toFixed(0):'?'; panel.appendLine(`OK  ${p.attempt} ${p.url} ${dt}ms`); startTimes.delete(key); });
on('api:error', (p)=> { if(!p) return; const key = `${p.url}#${p.attempt}`; const t0 = startTimes.get(key); const dt = t0? ((performance.now?.()||Date.now())-t0).toFixed(0):'?'; panel.appendLine(`ERR ${p.attempt} ${p.url} ${dt}ms :: ${p.error}`,'error'); startTimes.delete(key); });
on('cache:hit', (p)=> { if(!p) return; panel.appendLine(`CACHE ${p.key}`); });
