from fastapi import FastAPI, Body
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import math
import statistics
import requests

SERVER_BASE = os.getenv('SERVER_BASE_URL', 'http://localhost:4010')

app = FastAPI(title="ML Service", version="0.1.0")

class BacktestConfig(BaseModel):
    symbols: List[str] = []
    start: Optional[str] = None
    end: Optional[str] = None
    strategy: str = "ma_crossover"
    params: Dict[str, Any] = {}

def _get_history(symbol: str, days: int = 365):
    try:
        r = requests.get(f"{SERVER_BASE}/api/stocks/{symbol}/history", timeout=10)
        r.raise_for_status()
        js = r.json()
        data = js.get('data', [])
        closes = [float(row.get('close')) for row in data][-days:]
        return closes
    except Exception:
        return []

def _sma(arr, n):
    out = []
    s = 0.0
    q = []
    for v in arr:
        q.append(v)
        s += v
        if len(q) > n:
            s -= q.pop(0)
        out.append(s/len(q))
    return out

def _ema(arr, n):
    out = []
    k = 2/(n+1)
    ema = None
    for v in arr:
        ema = (v if ema is None else (v - ema) * k + ema)
        out.append(ema)
    return out

def _rsi(arr, n=14):
    gains = []
    losses = []
    rsis = []
    prev = None
    for v in arr:
        if prev is None:
            gains.append(0.0); losses.append(0.0)
        else:
            ch = v - prev
            gains.append(max(0.0, ch))
            losses.append(max(0.0, -ch))
        prev = v
        if len(gains) < n:
            rsis.append(50.0)
        else:
            ag = sum(gains[-n:]) / n
            al = sum(losses[-n:]) / n
            rs = (ag / al) if al != 0 else 0
            rsi = 100 - (100/(1+rs))
            rsis.append(rsi)
    return rsis

@app.get("/features")
def features(symbol: str, days: int = 60):
    closes = _get_history(symbol, max(60, days+60))
    if not closes:
        return {"ok": True, "data": {"symbol": symbol, "days": days, "features": None, "note": "no history"}}
    ret1 = [0.0] + [ (closes[i]-closes[i-1])/(closes[i-1] or 1) for i in range(1,len(closes)) ]
    ret5 = [0.0]*5 + [ (closes[i]-closes[i-5])/(closes[i-5] or 1) for i in range(5,len(closes)) ]
    ret20 = [0.0]*20 + [ (closes[i]-closes[i-20])/(closes[i-20] or 1) for i in range(20,len(closes)) ]
    vol = statistics.pstdev(ret1[-days:]) if len(ret1) >= days else statistics.pstdev(ret1)
    sma20 = _sma(closes, 20)[-1]
    ema50 = _ema(closes, 50)[-1]
    mom = (closes[-1] - closes[-min(len(closes), 20)]) / (closes[-min(len(closes), 20)] or 1)
    rsi = _rsi(closes, 14)[-1]
    feats = {"ret1": ret1[-1], "ret5": ret5[-1], "ret20": ret20[-1], "vol": vol, "sma20": sma20, "ema50": ema50, "momentum": mom, "rsi": rsi}
    return {"ok": True, "data": {"symbol": symbol, "days": days, "features": feats}}

@app.post("/predict/{symbol}")
def predict(symbol: str, body: Dict[str, Any] = Body(default={})):
    horizon = int(body.get("horizon", 1))
    closes = _get_history(symbol, 200)
    if not closes:
        return {"ok": True, "data": {"symbol": symbol, "horizon": horizon, "prediction": None, "confidence": 0.0, "note": "no history"}}
    s20 = _sma(closes, 20)[-1]
    s50 = _sma(closes, 50)[-1]
    direction = 1 if s20 >= s50 else -1
    pred = closes[-1] * (1 + 0.002 * direction * max(1, min(5, horizon)))
    conf = 0.55 if direction == 1 else 0.45
    return {"ok": True, "data": {"symbol": symbol, "horizon": horizon, "prediction": pred, "confidence": conf, "model": "sma_crossover"}}

def _backtest_ma_crossover(closes, fast=20, slow=50):
    fasts = _sma(closes, fast)
    slows = _sma(closes, slow)
    pos = 0
    equity = [1.0]
    for i in range(1, len(closes)):
        if fasts[i] >= slows[i]:
            pos = 1
        else:
            pos = 0
        r = (closes[i] - closes[i-1])/(closes[i-1] or 1)
        equity.append(equity[-1] * (1 + pos * r))
    returns = [equity[i]/equity[i-1]-1 for i in range(1,len(equity))]
    sharpe = (statistics.mean(returns) / (statistics.pstdev(returns) or 1e-9)) * math.sqrt(252) if returns else 0.0
    peak = equity[0]
    maxdd = 0.0
    for v in equity:
        peak = max(peak, v)
        dd = (v/peak) - 1.0
        maxdd = min(maxdd, dd)
    return equity, {"sharpe": sharpe, "maxdd": maxdd}

@app.post("/backtest")
def backtest(cfg: BacktestConfig):
    symbols = cfg.symbols or []
    if not symbols:
        return {"ok": True, "data": {"id": "bt-0001", "status": "done", "metrics": {}, "equity": []}}
    closes = _get_history(symbols[0], 400)
    if not closes:
        return {"ok": True, "data": {"id": "bt-0001", "status": "done", "metrics": {}, "equity": []}}
    if cfg.strategy == 'momentum':
        # simple momentum: invest if 20-bar momentum positive
        mom = [(closes[i]-closes[i-20])/(closes[i-20] or 1) if i>=20 else 0 for i in range(len(closes))]
        pos = 0
        equity = [1.0]
        for i in range(1,len(closes)):
            pos = 1 if mom[i] > 0 else 0
            r = (closes[i]-closes[i-1])/(closes[i-1] or 1)
            equity.append(equity[-1]*(1+pos*r))
        returns = [equity[i]/equity[i-1]-1 for i in range(1,len(equity))]
        sharpe = (statistics.mean(returns) / (statistics.pstdev(returns) or 1e-9)) * math.sqrt(252) if returns else 0.0
        peak = 1.0
        maxdd = 0.0
        for v in equity:
            peak = max(peak, v)
            dd = (v/peak) - 1.0
            maxdd = min(maxdd, dd)
        metrics = {"sharpe": sharpe, "maxdd": maxdd}
        return {"ok": True, "data": {"id": "bt-0001", "status": "done", "metrics": metrics, "equity": equity}}
    else:
        equity, metrics = _backtest_ma_crossover(closes, int(cfg.params.get('fast', 20)), int(cfg.params.get('slow', 50)))
        return {"ok": True, "data": {"id": "bt-0001", "status": "done", "metrics": metrics, "equity": equity}}

@app.post("/walkforward/{symbol}")
def walkforward(symbol: str, body: Dict[str, Any] = Body(default={})):
    """Simple walk-forward evaluation for MA crossover.
    Splits the series into k folds by time, trains params (fast/slow) fixed,
    and returns per-fold metrics and averages.
    """
    k = int(body.get('folds', 5))
    fast = int((body.get('params') or {}).get('fast', 20))
    slow = int((body.get('params') or {}).get('slow', 50))
    closes = _get_history(symbol, 800)
    if len(closes) < (slow + 50):
        return {"ok": True, "data": {"folds": [], "avg": {"sharpe": 0.0, "maxdd": 0.0}}}
    n = len(closes)
    fold_size = max(50, n // k)
    results = []
    for i in range(k):
        start = i * fold_size
        end = min(n, (i+1) * fold_size)
        if end - start < (slow + 5):
            continue
        seg = closes[start:end]
        eq, met = _backtest_ma_crossover(seg, fast, slow)
        results.append({"fold": i+1, "start": start, "end": end, "metrics": met})
    if not results:
        return {"ok": True, "data": {"folds": [], "avg": {"sharpe": 0.0, "maxdd": 0.0}}}
    avg_sharpe = sum([r['metrics']['sharpe'] for r in results]) / len(results)
    avg_maxdd = sum([r['metrics']['maxdd'] for r in results]) / len(results)
    return {"ok": True, "data": {"folds": results, "avg": {"sharpe": avg_sharpe, "maxdd": avg_maxdd}}}

@app.get("/backtest/{id}")
def backtest_get(id: str):
    return {"ok": True, "data": {"id": id, "status": "done", "metrics": {"sharpe": 0.0, "maxdd": 0.0}}}

@app.get("/models")
def models():
    return {"ok": True, "data": [{"id": "baseline", "type": "sma", "version": "0.0.1"}]}

@app.get("/models/{id}")
def model_by_id(id: str):
    return {"ok": True, "data": {"id": id, "type": "sma", "version": "0.0.1"}}
