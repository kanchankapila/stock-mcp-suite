import db, { getMcTech, getLatestOptionsBias } from '../db.js';
import { logger } from '../utils/logger.js';
import { indexNamespace } from './langchain.js';
import { loadStocklist } from '../utils/stocklist.js';
import { resolveTicker } from '../utils/ticker.js';

function getBoolEnv(key: string, def = false) {
  const v = String(process.env[key] ?? '').toLowerCase();
  if (!v) return def;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export async function ragAutoMigrate(): Promise<{ namespaces: number; migrated: number }> {
  const nss = db.prepare(`SELECT DISTINCT ns FROM rag_embeddings ORDER BY ns`).all() as Array<{ ns: string }>;
  let namespaces = 0, migrated = 0;
  for (const r of nss) {
    const ns = String(r.ns || '').toUpperCase();
    try {
      const rows = db.prepare(`SELECT text, metadata FROM rag_embeddings WHERE ns=?`).all(ns) as Array<{ text: string, metadata: string }>;
      if (!rows.length) continue;
      const texts = rows.map(rw => { let md: any = {}; try { md = JSON.parse(rw.metadata || '{}'); } catch {} return { text: rw.text, metadata: md }; }).filter(t => t.text);
      if (!texts.length) continue;
      const out = await indexNamespace(ns, { texts });
      namespaces += 1; migrated += Number(out?.added || 0);
      logger.info({ ns, added: out.added }, 'rag_auto_migrate_ns_done');
    } catch (err) {
      logger.warn({ err, ns }, 'rag_auto_migrate_ns_failed');
    }
  }
  return { namespaces, migrated };
}

export async function ragAutoBuildBatch(days = 60): Promise<{ namespaces: number; added: number; cutoff: string }> {
  const cutoff = new Date(Date.now() - Math.max(1, Number.isFinite(days) ? days : 60) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const entries = loadStocklist();
  const seen = new Set<string>();
  let namespaces = 0, added = 0;
  for (const e of entries) {
    const base = String((e as any).symbol || (e as any).mcsymbol || (e as any).name || '').toUpperCase();
    if (!base) continue;
    let ns = '';
    try { ns = resolveTicker(base, 'yahoo'); } catch { ns = ''; }
    if (!ns || seen.has(ns)) continue;
    seen.add(ns);
    try {
      const rows = db.prepare(`SELECT date, title, summary, url FROM news WHERE symbol=? AND date>=? ORDER BY date DESC LIMIT 1000`).all(ns, cutoff) as Array<{ date: string, title: string, summary: string, url: string }>;
      const texts = rows.map(r => ({ text: `${r.title?.trim() || ''}. ${r.summary?.trim() || ''}`.trim(), metadata: { date: String(r.date || '').slice(0, 10), source: 'news', url: r.url || '' } })).filter(t => t.text);
      if (!texts.length) continue;
      const out = await indexNamespace(ns, { texts });
      namespaces += 1; added += Number(out?.added || 0);
      logger.info({ ns, added: out.added }, 'rag_auto_build_ns_done');
    } catch (err) {
      logger.warn({ err, ns }, 'rag_auto_build_ns_failed');
    }
  }
  return { namespaces, added, cutoff };
}

export function startRagAutoTasks() {
  const doMigrate = getBoolEnv('RAG_AUTO_MIGRATE', true);
  const doBuild = getBoolEnv('RAG_AUTO_BUILD_BATCH', true);
  const days = Number(process.env.RAG_AUTO_BUILD_DAYS || 60);
  const doSnapshot = getBoolEnv('RAG_AUTO_SNAPSHOT', true);
  const snapDays = Number(process.env.RAG_AUTO_SNAPSHOT_DAYS || process.env.RAG_AUTO_BUILD_DAYS || 60);
  const snapLimit = Number(process.env.RAG_AUTO_SNAPSHOT_LIMIT || 10);
  // Schedule in background so server starts quickly
  setTimeout(async () => {
    try {
      if (doMigrate) {
        const r = await ragAutoMigrate();
        logger.info({ namespaces: r.namespaces, migrated: r.migrated }, 'rag_auto_migrate_complete');
      }
    } catch (err) { logger.warn({ err }, 'rag_auto_migrate_error'); }
    try {
      if (doBuild) {
        const r = await ragAutoBuildBatch(days);
        logger.info({ namespaces: r.namespaces, added: r.added, cutoff: r.cutoff }, 'rag_auto_build_complete');
      }
    } catch (err) { logger.warn({ err }, 'rag_auto_build_error'); }
    try {
      if (doSnapshot) {
        const r = await ragAutoSnapshotTopPicks(snapDays, snapLimit);
        logger.info({ saved: r.saved, date: r.date }, 'rag_auto_snapshot_complete');
      }
    } catch (err) { logger.warn({ err }, 'rag_auto_snapshot_error'); }
  }, 1500);
}

export async function ragAutoSnapshotTopPicks(days = 60, limit = 10): Promise<{ saved: number; date: string }> {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const exists = db.prepare(`SELECT 1 FROM top_picks_history WHERE snapshot_date=? LIMIT 1`).get(date);
  if (exists) return { saved: 0, date };

  const lookback = Math.max(5, Number.isFinite(days) ? days : 60);
  const cutoff = new Date(Date.now() - lookback * 24 * 60 * 60 * 1000).toISOString();
  const symRows = db.prepare(`SELECT DISTINCT symbol FROM prices WHERE date>=? ORDER BY symbol`).all(cutoff) as Array<{ symbol: string }>;
  const symbols = symRows.map(r => String(r.symbol || '').toUpperCase());
  if (!symbols.length) return { saved: 0, date };

  function safeNumber(v: any, def = 0) { const n = Number(v); return Number.isFinite(n) ? n : def; }
  const results: Array<any> = [];
  for (const s of symbols) {
    try {
      const pr = db.prepare(`SELECT date, close FROM prices WHERE symbol=? AND date>=? ORDER BY date ASC`).all(s, cutoff) as Array<{ date: string, close: number }>;
      if (!pr.length) continue;
      const mom = pr.length > 1 ? (safeNumber(pr[pr.length - 1].close) - safeNumber(pr[0].close)) / Math.max(1e-9, safeNumber(pr[0].close)) : 0;
      const nsr = db.prepare(`SELECT AVG(sentiment) as avg FROM news WHERE symbol=? AND date>=?`).get(s, cutoff) as { avg: number } | undefined;
      const sent = safeNumber(nsr?.avg, 0);
      const techD = getMcTech(s, 'D') as any;
      let mcs = NaN;
      try { mcs = safeNumber(techD?.score ?? techD?.stockScore, NaN); } catch {}
      const ob = getLatestOptionsBias(s);
      const optBias = Number.isFinite(Number(ob)) ? Math.max(-1, Math.min(1, Number(ob))) : 0;
      const momN = Math.max(-1, Math.min(1, mom));
      const sentN = Math.max(-1, Math.min(1, sent));
      const scoreN = Number.isFinite(mcs) ? Math.max(-1, Math.min(1, (mcs - 50) / 50)) : 0;
      const composite = 0.35 * momN + 0.30 * sentN + 0.20 * scoreN + 0.15 * optBias;
      let reco = 'HOLD';
      if (composite >= 0.25) reco = 'BUY'; else if (composite <= -0.25) reco = 'SELL';
      results.push({ symbol: s, score: Number(composite.toFixed(3)), momentum: mom, sentiment: sent, mcScore: Number.isFinite(mcs) ? mcs : null, optionsBias: Number.isFinite(optBias) ? optBias : null, recommendation: reco });
    } catch {}
  }
  const top = results.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(100, Number.isFinite(limit) ? limit : 10)));
  const stmt = db.prepare(`INSERT OR REPLACE INTO top_picks_history(snapshot_date, symbol, score, momentum, sentiment, mc_score, recommendation, created_at)
                           VALUES(?,?,?,?,?,?,?,?)`);
  const createdAt = now.toISOString();
  db.transaction(() => { for (const p of top) stmt.run(date, p.symbol, p.score, p.momentum, p.sentiment, (p.mcScore ?? null), p.recommendation, createdAt); })();
  return { saved: top.length, date };
}
