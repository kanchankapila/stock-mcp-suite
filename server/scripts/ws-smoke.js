import WebSocket from 'ws';

const URL = process.env.WS_URL || 'ws://localhost:4010/ws';
const symbols = (process.env.WS_SYMBOLS || 'BEL,BE03,INFY').split(',').map(s=>s.trim()).filter(Boolean);
const timeoutMs = Number(process.env.WS_TIMEOUT_MS || 20000);

console.log('[ws-smoke] Connecting to', URL, 'symbols:', symbols.join(','));
const ws = new WebSocket(URL);

const seen = new Map();
let timer;

function finish(code = 0) {
  clearTimeout(timer);
  try { ws.close(); } catch {}
  const msgs = Array.from(seen.entries()).map(([k,v])=>({ symbol:k, count:v.count, lastPrice:v.lastPrice }));
  console.log('[ws-smoke] Summary:', JSON.stringify(msgs, null, 2));
  if (!msgs.length) {
    console.error('[ws-smoke] No quotes received');
    process.exitCode = 1;
  } else {
    process.exitCode = code;
  }
  // Give ws a moment to close
  setTimeout(()=>process.exit(), 200);
}

ws.on('open', () => {
  console.log('[ws-smoke] Connected');
  for (const s of symbols) {
    ws.send(JSON.stringify({ type: 'subscribe', symbol: s }));
  }
  timer = setTimeout(() => {
    console.warn('[ws-smoke] Timeout waiting for quotes');
    finish(1);
  }, timeoutMs);
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(String(data));
    if (msg?.type === 'subscribed') {
      console.log('[subscribed]', msg.symbol);
    } else if (msg?.type === 'quote') {
      const { symbol, price, time } = msg;
      const e = seen.get(symbol) || { count:0, lastPrice:null };
      e.count += 1; e.lastPrice = price;
      seen.set(symbol, e);
      console.log('[quote]', symbol, price, time);
      const allSeen = symbols.every(sym => (seen.get(sym) || seen.get(sym + '.NS') || { count:0 }).count > 0);
      if (allSeen) {
        // Received at least one quote per symbol; finish early
        finish(0);
      }
    }
  } catch {}
});

ws.on('error', (err) => {
  console.error('[ws-smoke] Error:', err);
});

ws.on('close', () => {
  console.log('[ws-smoke] Closed');
});
