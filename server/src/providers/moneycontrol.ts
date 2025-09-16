import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';
import { fetchJson } from '../utils/http.js';
import { resolveTicker } from '../utils/ticker.js';

export type McInsight = {
  scId: string;
  type: string; // usually 'c'
  shortDesc?: string;
  longDesc?: string;
  stockScore?: number;
  name?: string;
};

export async function fetchMcInsights(scId: string, type: string = 'c'): Promise<McInsight | null> {
  const id = scId.toUpperCase();
  const url = `https://api.moneycontrol.com//mcapi//v1//extdata//mc-insights?scId=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}`;
  try {
    logger.info({ url }, 'mc_fetch_insights_start');
    const json: any = await fetchJson(url, { headers: { 'Accept': 'application/json,*/*' }, timeoutMs: 8000, retries: 2, retryDelayMs: 300 });
    logger.info({ url }, 'mc_fetch_insights_ok');
    const cls = json?.data?.classification || {};
    const out: McInsight = {
      scId: id,
      type,
      shortDesc: cls.shortDesc || '',
      longDesc: cls.longDesc || '',
      stockScore: Number(cls.stockScore ?? 0),
      name: cls.name || ''
    };
    return out;
  } catch (err) {
    logger.error({ err, scId: id }, 'moneycontrol_insights_failed');
    return null;
  }
}

// Convenience: accept any user input (name/symbol/yahoo like BEL.NS) and resolve to mcsymbol from stocklist.ts
export async function fetchMcInsightsForInput(input: string, type: string = 'c'): Promise<McInsight | null> {
  try {
    const base = String(input || '').toUpperCase();
    // Use resolver configured for provider 'mc' which defaults to stocklist mcsymbol
    const mcid = resolveTicker(base.includes('.') ? base.split('.')[0] : base, 'mc');
    if (!mcid) return null;
    return await fetchMcInsights(mcid, type);
  } catch (err) {
    logger.error({ err, input }, 'moneycontrol_resolve_or_fetch_failed');
    return null;
  }
}

// Moneycontrol Technical Indicator API
// Example: https://priceapi.moneycontrol.com//pricefeed//techindicator//D//BE03
export type McTech = {
  scId: string;
  freq: 'D'|'W'|'M';
  reqDate?: string;
  open?: number; high?: number; low?: number; close?: number; volume?: number;
  sentiments?: { indication?: string; totalBearish?: number; totalBullish?: number; totalNeutral?: number };
  indicators?: Array<{ id: string; displayName: string; value: any; indication?: string }>;
  pivotLevels?: Array<{ key: string; pivotLevel: { pivotPoint?: string; r1?: string; r2?: string; r3?: string; s1?: string; s2?: string; s3?: string } }>;
  sma?: Array<{ key: string; value: string; indication?: string }>;
  ema?: Array<{ key: string; value: string; indication?: string }>;
  crossover?: Array<{ key?: string; displayValue?: string; indication?: string; period?: string }>;
};

export async function fetchMcTech(scId: string, freq: 'D'|'W'|'M'='D'): Promise<McTech | null> {
  const id = scId.toUpperCase();
  const f = (String(freq || 'D').toUpperCase() as 'D'|'W'|'M');
  const url = `https://priceapi.moneycontrol.com//pricefeed//techindicator//${encodeURIComponent(f)}//${encodeURIComponent(id)}`;
  try {
    logger.info({ url }, 'mc_fetch_tech_start');
    const json: any = await fetchJson(url, { headers: { 'Accept': 'application/json,*/*' }, timeoutMs: 8000, retries: 2, retryDelayMs: 300 });
    logger.info({ url }, 'mc_fetch_tech_ok');
    const d = json?.data || {};
    const out: McTech = {
      scId: id,
      freq: f,
      reqDate: d.reqDate,
      open: Number(d.open ?? 0),
      high: Number(d.high ?? 0),
      low: Number(d.low ?? 0),
      close: Number(d.close ?? 0),
      volume: Number(d.volume ?? 0),
      sentiments: d?.sentiments ? {
        indication: d.sentiments.indication,
        totalBearish: Number(d.sentiments.totalBearish ?? 0),
        totalBullish: Number(d.sentiments.totalBullish ?? 0),
        totalNeutral: Number(d.sentiments.totalNeutral ?? 0),
      } : undefined,
      indicators: Array.isArray(d.indicators) ? d.indicators.map((x:any)=>({ id: String(x.id||''), displayName: String(x.displayName||''), value: x.value, indication: x.indication })) : [],
      pivotLevels: Array.isArray(d.pivotLevels) ? d.pivotLevels.map((p:any)=>({ key: String(p.key||''), pivotLevel: { pivotPoint: p.pivotLevel?.pivotPoint, r1: p.pivotLevel?.r1, r2: p.pivotLevel?.r2, r3: p.pivotLevel?.r3, s1: p.pivotLevel?.s1, s2: p.pivotLevel?.s2, s3: p.pivotLevel?.s3 } })) : [],
      sma: Array.isArray(d.sma) ? d.sma.map((s:any)=>({ key: String(s.key||''), value: String(s.value||''), indication: s.indication })) : [],
      ema: Array.isArray(d.ema) ? d.ema.map((s:any)=>({ key: String(s.key||''), value: String(s.value||''), indication: s.indication })) : [],
      crossover: Array.isArray(d.crossover) ? d.crossover.map((c:any)=>({ key: c.key, displayValue: c.displayValue, indication: c.indication, period: c.period })) : [],
    };
    return out;
  } catch (err) {
    logger.error({ err, scId: id, freq: f }, 'moneycontrol_tech_failed');
    return null;
  }
}

export async function fetchMcTechForInput(input: string, freq: 'D'|'W'|'M'='D'): Promise<McTech | null> {
  try {
    const base = String(input || '').toUpperCase();
    const mcid = resolveTicker(base.includes('.') ? base.split('.')[0] : base, 'mc');
    if (!mcid) return null;
    return await fetchMcTech(mcid, freq);
  } catch (err) {
    logger.error({ err, input, freq }, 'moneycontrol_tech_resolve_or_fetch_failed');
    return null;
  }
}
