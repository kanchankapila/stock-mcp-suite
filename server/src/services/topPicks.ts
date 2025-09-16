import db, { getMcTech, getLatestOptionsBias } from '../db.js';

export interface TopPickWeights {
  momentum: number; // price momentum
  sentiment: number; // news sentiment
  tech: number; // Moneycontrol technical / score
  options?: number; // options bias (optional)
}

export interface ComputeTopPicksParams {
  days?: number; // lookback window
  limit?: number; // number of results to return
  includeOptionsBias?: boolean; // whether to include options bias in scoring
  weights?: Partial<TopPickWeights>; // override default weights
}

export interface TopPickResult {
  symbol: string;
  momentum: number;
  sentiment: number;
  mcScore: number | null;
  rsi: number | null;
  pivot: number | null;
  optionsBias: number | null;
  score: number;
  recommendation: 'BUY' | 'HOLD' | 'SELL';
  contrib: {
    momentum: number;
    sentiment: number;
    tech: number;
    options: number;
  };
}

function clampNorm(x: number) { return Math.max(-1, Math.min(1, x)); }
function safeNumber(v: any, def = 0) { const n = Number(v); return Number.isFinite(n) ? n : def; }

export function parseWeights(raw?: string): Partial<TopPickWeights> | undefined {
  if (!raw) return undefined;
  const out: Partial<TopPickWeights> = {};
  raw.split(',').forEach(pair => {
    const [k,v] = pair.split(':');
    const key = k?.trim() as keyof TopPickWeights;
    const num = Number(v);
    if (['momentum','sentiment','tech','options'].includes(key) && Number.isFinite(num)) {
      (out as any)[key] = num;
    }
  });
  return out;
}

export function normalizeWeights(w: TopPickWeights): TopPickWeights {
  const sum = w.momentum + w.sentiment + w.tech + (w.options ?? 0);
  if (!sum || sum <= 0) return w;
  return {
    momentum: w.momentum / sum,
    sentiment: w.sentiment / sum,
    tech: w.tech / sum,
    options: (w.options ?? 0) / sum
  };
}

export function getDefaultWeights(includeOptionsBias: boolean): TopPickWeights {
  if (includeOptionsBias) {
    return { momentum: 0.35, sentiment: 0.30, tech: 0.20, options: 0.15 };
  }
  return { momentum: 0.40, sentiment: 0.35, tech: 0.25, options: 0 };
}

export function computeTopPicks(params: ComputeTopPicksParams = {}): { data: TopPickResult[]; meta: any; weights: TopPickWeights } {
  const days = Number.isFinite(params.days) ? Math.max(5, params.days!) : 60;
  const limit = Number.isFinite(params.limit) ? params.limit! : 10;
  const includeOptions = Boolean(params.includeOptionsBias);
  const cutoff = new Date(Date.now() - days*24*60*60*1000).toISOString();

  const baseWeights = getDefaultWeights(includeOptions);
  const merged: TopPickWeights = { ...baseWeights, ...(params.weights || {}) } as TopPickWeights;
  const weights = normalizeWeights(merged);

  const rows = db.prepare(`SELECT DISTINCT symbol FROM prices WHERE date>=? ORDER BY symbol`).all(cutoff) as Array<{symbol:string}>;
  const symbols = rows.map(r => String(r.symbol || '').toUpperCase());
  if (!symbols.length) return { data: [], meta: { days, total: 0 }, weights };

  const results: TopPickResult[] = [];
  for (const s of symbols) {
    try {
      const pr = db.prepare(`SELECT date, close FROM prices WHERE symbol=? AND date>=? ORDER BY date ASC`).all(s, cutoff) as Array<{date:string, close:number}>;
      if (!pr.length) continue;
      const momentum = pr.length > 1 ? (safeNumber(pr[pr.length-1].close) - safeNumber(pr[0].close)) / Math.max(1e-9, safeNumber(pr[0].close)) : 0;

      const nsr = db.prepare(`SELECT AVG(sentiment) as avg FROM news WHERE symbol=? AND date>=?`).get(s, cutoff) as {avg:number}|undefined;
      const sentiment = safeNumber(nsr?.avg, 0);

      const techD = getMcTech(s, 'D') as any;
      let rsi = NaN, pivot = NaN, mcScore = NaN;
      try { rsi = safeNumber(techD?.oscillators?.find?.((o:any)=> /rsi/i.test(o?.name||''))?.value, NaN); } catch {}
      try { const pv = techD?.pivot_level?.pivot ?? techD?.pivots?.pivot ?? techD?.pivot ?? null; pivot = safeNumber(pv, NaN); } catch {}
      try { mcScore = safeNumber(techD?.score ?? techD?.stockScore, NaN); } catch {}

      const momentumN = clampNorm(momentum);
      const sentimentN = clampNorm(sentiment);
      const techN = Number.isFinite(mcScore) ? clampNorm((mcScore - 50)/50) : 0;

      let optionsBias: number | null = null;
      let optionsN = 0;
      if (includeOptions) {
        const ob = getLatestOptionsBias(s);
        if (Number.isFinite(Number(ob))) {
          optionsBias = clampNorm(Number(ob));
          optionsN = optionsBias;
        }
      }

      const composite = momentumN*weights.momentum + sentimentN*weights.sentiment + techN*weights.tech + optionsN*(weights.options || 0);

      let recommendation: TopPickResult['recommendation'] = 'HOLD';
      if (composite >= 0.25) recommendation = 'BUY';
      else if (composite <= -0.25) recommendation = 'SELL';

      results.push({
        symbol: s,
        momentum,
        sentiment,
        mcScore: Number.isFinite(mcScore) ? mcScore : null,
        rsi: Number.isFinite(rsi) ? rsi : null,
        pivot: Number.isFinite(pivot) ? pivot : null,
        optionsBias,
        score: Number(composite.toFixed(3)),
        recommendation,
        contrib: {
          momentum: Number((momentumN*weights.momentum).toFixed(3)),
          sentiment: Number((sentimentN*weights.sentiment).toFixed(3)),
          tech: Number((techN*weights.tech).toFixed(3)),
          options: Number(((optionsN)*(weights.options||0)).toFixed(3))
        }
      });
    } catch {
      // ignore per-symbol errors
    }
  }

  const top = results.sort((a,b)=> b.score - a.score).slice(0, Math.max(1, Math.min(100, Number.isFinite(limit)? limit : 10)));
  return { data: top, meta: { days, total: results.length }, weights };
}
