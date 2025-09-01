import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function resolveStocklistPath(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.STOCKLIST_PATH && path.resolve(String(process.env.STOCKLIST_PATH)),
    path.resolve(process.cwd(), 'stocklist.ts'),
    path.resolve(process.cwd(), 'server', 'stocklist.ts'),
    path.resolve(here, '..', '..', 'stocklist.ts'),
    path.resolve(here, '..', '..', '..', 'server', 'stocklist.ts')
  ].filter(Boolean) as string[];
  for (const p of candidates) { if (fs.existsSync(p)) return p; }
  return null;
}

export type StockEntry = { name?: string; symbol?: string; mcsymbol?: string; isin?: string; tlid?: string };

export function loadStocklist(): StockEntry[] {
  const p = resolveStocklistPath();
  if (!p) return [];
  const txt = fs.readFileSync(p, 'utf8');
  const entries: StockEntry[] = [];
  // Match each object chunk roughly
  const objRe = /\{[^}]*\}/gms;
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(txt))) {
    const chunk = m[0];
    const get = (key: string) => {
      // Anchor key so 'symbol' does not match 'mcsymbol'
      const r = new RegExp(`(?:^|[\\s,{])${key}\\s*:\\s*'([^']*)'`, 'i');
      const mm = r.exec(chunk);
      return mm ? mm[1].trim() : undefined;
    };
    const e: StockEntry = {
      name: get('name'),
      symbol: get('symbol')?.toUpperCase(),
      mcsymbol: get('mcsymbol')?.toUpperCase(),
      isin: get('isin'),
      tlid: get('tlid')
    };
    if (e.symbol || e.mcsymbol || e.name) entries.push(e);
  }
  return entries;
}
