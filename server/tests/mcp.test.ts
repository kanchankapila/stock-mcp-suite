import request from 'supertest';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../src/app.ts';
import db from '../src/db.js';

// Seed helper
function seedPrices(symbol: string, days = 40) {
  const base = new Date();
  const stmt = db.prepare(`INSERT OR REPLACE INTO prices(symbol,date,open,high,low,close,volume) VALUES(?,?,?,?,?,?,?)`);
  const tx = db.transaction(()=> {
    for (let i=days; i>=1; i--) {
      const d = new Date(base.getTime() - i*86400000);
      const date = d.toISOString().slice(0,10);
      const close = 100 + i * 0.5 + (i%5===0? 2: 0); // gentle trend
      stmt.run(symbol, date, close-1, close+1, close-2, close, 100000 + i*1000);
    }
  });
  tx();
}

function seedNews(symbol: string) {
  const stmt = db.prepare(`INSERT OR REPLACE INTO news(id,symbol,date,title,summary,url,sentiment) VALUES(?,?,?,?,?,?,?)`);
  const today = new Date().toISOString().slice(0,10);
  const rows = [
    { id: `n_${symbol}_1`, title: `${symbol} beats earnings expectations with strong growth`, summary: 'Robust revenue and profit beat analyst forecasts', sent: 0.6 },
    { id: `n_${symbol}_2`, title: `${symbol} faces minor regulatory fine`, summary: 'Market impact expected to be limited', sent: -0.2 },
    { id: `n_${symbol}_3`, title: `${symbol} announces new product expansion`, summary: 'Investors react positively to strategic roadmap', sent: 0.4 }
  ];
  const tx = db.transaction(()=> {
    for (const r of rows) stmt.run(r.id, symbol, today, r.title, r.summary, `https://example.com/${r.id}`, r.sent);
  });
  tx();
}

// Ensure seeds exist
seedPrices('AAPL');
seedNews('AAPL');

const app = createApp();

describe('MCP API', () => {
  it('returns schema with tools', async () => {
    const res = await request(app).get('/mcp/schema');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.ok);
    const toolNames = (res.body.tools||[]).map((t:any)=>t.name);
    assert.ok(toolNames.includes('run_backtest'));
    assert.ok(toolNames.includes('analyze_sentiment'));
  });

  it('validates missing params', async () => {
    const res = await request(app).post('/mcp/tool').send({ tool: 'run_backtest', params: {} });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'validation_failed');
  });

  it('runs sentiment analysis', async () => {
    const res = await request(app).post('/mcp/tool').send({ tool: 'analyze_sentiment', params: { symbol: 'AAPL', days: 7 } });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.ok);
    assert.strictEqual(res.body.result.symbol, 'AAPL');
    assert.strictEqual(typeof res.body.result.overall_sentiment, 'number');
    assert.ok(res.body.result.sources_count > 0);
  });

  it('runs backtest with default strategy', async () => {
    const res = await request(app).post('/mcp/tool').send({ tool: 'run_backtest', params: { symbol: 'AAPL' } });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.ok);
    const m = res.body.result;
    assert.strictEqual(m.symbol, 'AAPL');
    assert.ok(['sma_cross','momentum','mean_reversion'].includes(m.strategy));
    assert.strictEqual(typeof m.total_return, 'number');
    assert.ok(m.final_capital > 0);
  });

  it('rejects unsupported strategy', async () => {
    const res = await request(app).post('/mcp/tool').send({ tool: 'run_backtest', params: { symbol: 'AAPL', strategy: 'unknown_strat' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, false);
  });

  it('returns performance report', async () => {
    const res = await request(app).get('/mcp/perf');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.ok);
    assert.ok(res.body.report);
  });
});
