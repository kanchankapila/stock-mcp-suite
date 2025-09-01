import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

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
    const res = await fetch(url, { headers: { 'Accept': 'application/json,*/*' } });
    if (!res.ok) throw new Error(`Moneycontrol error: ${res.status}`);
    const json: any = await res.json();
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

