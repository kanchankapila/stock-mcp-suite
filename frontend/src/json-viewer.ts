// Lightweight JSON viewer for existing cards: validate, summarize and render
// a collapsible tree. Enhances any <pre class="mono json-source"> elements.

type Node = { k: string; v: any; path: string };

function isObject(v: any) { return v && typeof v === 'object' && !Array.isArray(v); }
function isArray(v: any) { return Array.isArray(v); }

function summarize(obj: any) {
  let keys = 0, depth = 0;
  const walk = (v: any, d: number) => {
    depth = Math.max(depth, d);
    if (isObject(v)) {
      keys += Object.keys(v).length;
      for (const k of Object.keys(v)) walk(v[k], d + 1);
    } else if (isArray(v)) {
      keys += v.length;
      for (const x of v) walk(x, d + 1);
    }
  };
  walk(obj, 1);
  return { keys, depth };
}

function createTree(obj: any, path = ''): HTMLElement {
  const root = document.createElement('div');
  root.className = 'json-tree';
  const entries: Array<[string, any]> = isObject(obj) ? Object.entries(obj) : isArray(obj) ? (obj as any[]).map((v,i)=>[String(i),v]) : [];
  for (const [k, v] of entries) {
    const p = path ? (isNaN(Number(k)) ? `${path}.${k}` : `${path}[${k}]`) : (isNaN(Number(k)) ? k : `[${k}]`);
    const wrap = document.createElement('div');
    wrap.className = 'json-node';
    const det = document.createElement('details');
    det.open = false;
    const sum = document.createElement('summary');
    sum.textContent = `${k}: ${formatPreview(v)}`;
    sum.title = p;
    const actions = document.createElement('span');
    actions.style.marginLeft = '6px';
    actions.innerHTML = `<button class="btn-sm" data-copy-path>Copy path</button> <button class="btn-sm" data-copy-json>Copy</button>`;
    sum.appendChild(actions);
    det.appendChild(sum);
    if (isObject(v) || isArray(v)) {
      det.appendChild(createTree(v, p));
    }
    wrap.appendChild(det);
    root.appendChild(wrap);
  }
  root.addEventListener('click', (ev) => {
    const el = ev.target as HTMLElement;
    if (el?.matches('[data-copy-path]')) {
      ev.preventDefault(); ev.stopPropagation();
      const s = el.closest('summary');
      const title = s?.getAttribute('title') || '';
      try { navigator.clipboard.writeText(title); } catch {}
    }
    if (el?.matches('[data-copy-json]')) {
      ev.preventDefault(); ev.stopPropagation();
      const s = el.closest('summary');
      const title = s?.getAttribute('title') || '';
      const v = getByPath(obj, title);
      try { navigator.clipboard.writeText(JSON.stringify(v, null, 2)); } catch {}
    }
  });
  return root;
}

function formatPreview(v: any): string {
  if (v == null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v.length > 40 ? v.slice(0, 40) + '…' : v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (isArray(v)) return `[Array(${v.length})]`;
  if (isObject(v)) return '{…}';
  return String(v);
}

function getByPath(obj: any, path: string) {
  if (!path) return obj;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) { if (cur==null) return undefined; cur = cur[p]; }
  return cur;
}

function enhancePre(pre: HTMLPreElement) {
  const raw = pre.textContent || '';
  let json: any = null;
  try { json = JSON.parse(raw); } catch {}
  if (!json) return;
  const { keys, depth } = summarize(json);
  const card = pre.closest('.card') as HTMLElement | null;
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.gap = '8px';
  header.innerHTML = `<div class="muted">JSON (${keys} keys, depth ${depth})</div>
  <div>
    <button class="btn-sm" data-json-raw>Raw</button>
    <button class="btn-sm" data-json-pretty>Pretty</button>
    <button class="btn-sm" data-json-download>Download</button>
  </div>`;

  const tree = createTree(json);
  const container = document.createElement('div');
  container.style.marginTop = '6px';
  container.appendChild(tree);

  pre.style.display = 'none';
  pre.insertAdjacentElement('beforebegin', header);
  pre.insertAdjacentElement('afterend', container);

  header.addEventListener('click', (ev) => {
    const el = ev.target as HTMLElement;
    if (el?.matches('[data-json-raw]')) { pre.style.display = 'block'; container.style.display = 'none'; }
    if (el?.matches('[data-json-pretty]')) { pre.style.display = 'none'; container.style.display = 'block'; }
    if (el?.matches('[data-json-download]')) {
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'data.json';
      a.click();
      URL.revokeObjectURL(a.href);
    }
  });

  // Reflow masonry if present
  try { (window as any).dispatchEvent(new Event('masonry-reflow')); } catch {}
}

function initJsonViewer() {
  const els = Array.from(document.querySelectorAll<HTMLPreElement>('pre.mono.json-source, pre.mono.json, pre.mono'));
  for (const pre of els) {
    const txt = (pre.textContent || '').trim();
    if (!txt) continue;
    if (/^\{[\s\S]*\}$|^\[[\s\S]*\]$/.test(txt)) {
      enhancePre(pre);
    }
  }
}

window.addEventListener('DOMContentLoaded', initJsonViewer);

