import { listActiveAlerts, latestFeature, latestPrice, triggerAlert, markAlertEvaluated } from '../db.js';
import { logger } from '../utils/logger.js';

export type AlertEvalResult = { total:number; evaluated:number; triggered:number; details:Array<{ id:number; triggered:boolean; reason?:string }>; ts:string };

export async function evaluateAlerts(): Promise<AlertEvalResult> {
  const alerts = listActiveAlerts();
  const details: AlertEvalResult['details'] = [];
  let triggered = 0; let evaluated = 0;
  for (const a of alerts) {
    evaluated += 1;
    let didTrigger = false; let reason: string | undefined;
    try {
      const symbol = String(a.symbol).toUpperCase();
      if (a.kind === 'rsi') {
        const feat = latestFeature(symbol);
        if (feat && feat.rsi !== null) {
          const rsiVal = feat.rsi;
            if (rsiVal <= a.level) { // oversold style trigger
              didTrigger = true;
              reason = `RSI ${rsiVal.toFixed(2)} <= level ${a.level}`;
            }
        }
      } else if (a.kind === 'price_drop') {
        let baseline = a.baseline_price; let baselineDate = a.baseline_date;
        if (!baseline) { // fallback: set first observation implicitly
          const lp = latestPrice(symbol);
          if (lp) { baseline = lp.close; baselineDate = lp.date; }
        }
        const lp = latestPrice(symbol);
        if (baseline && lp) {
          const pct = ((baseline - lp.close) / baseline) * 100;
          if (pct >= a.level) { didTrigger = true; reason = `Price drop ${(pct).toFixed(2)}% >= level ${a.level}% (baseline ${baseline} @ ${baselineDate})`; }
        }
      } else {
        // custom kinds not yet implemented
      }
      if (didTrigger) {
        triggerAlert(a.id, { note: reason });
        triggered += 1;
      }
    } catch (err) {
      logger.warn({ err, id: a.id }, 'alert_eval_failed');
    } finally {
      try { markAlertEvaluated(a.id); } catch {}
      details.push({ id: a.id, triggered: didTrigger, reason });
    }
  }
  const result: AlertEvalResult = { total: alerts.length, evaluated, triggered, details, ts: new Date().toISOString() };
  if (triggered) logger.info(result, 'alerts_evaluated');
  else logger.debug(result, 'alerts_evaluated');
  return result;
}
