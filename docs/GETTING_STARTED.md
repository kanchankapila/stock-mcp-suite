# Getting Started

This guide walks you through setting up the full stack — server, jobs (BullMQ/Redis), frontend, and the optional ML service — so you can use all features: ingest, RAG, Trendlyne/Moneycontrol/Yahoo integrations, backtests, stored features, and the Health/Strategy Lab UIs.

## 1) Prerequisites

- Node.js 20+ and npm 10+
- Python 3.10+ (for the optional ML service)
- Redis (for BullMQ jobs)
- Git (to clone)

Optional:
- None — Docker is not required.

## 2) Clone and Install

```bash
# Clone
git clone <repo-url>
cd stock-mcp-suite

# Install server deps
cd server
npm install

# Install frontend deps
cd ../frontend
npm install
```

## 3) Configure Environment

Copy the example env and set required values. At minimum, fill `REDIS_URL` to run jobs. Provider keys are optional; the app falls back to sample data where supported.

```bash
# In repo root
cp .env.example server/.env
```

Edit `server/.env`:

- Feature flags
  - `ENABLE_JOBS=true` (to run scheduled/queued work)
  - `ENABLE_ML=true` (to proxy ML endpoints to the ML service)
- Redis / Jobs
  - `REDIS_URL=redis://localhost:6379`
  - (Optional) `JOB_BATCH`, `JOB_ATTEMPTS`, `JOB_BACKOFF_MS`, `JOB_CONCURRENCY_*`
- Providers (optional but recommended)
  - `NEWS_API_KEY` (NewsAPI)
  - `TRENDLYNE_EMAIL`, `TRENDLYNE_PASSWORD` (to refresh TL cookie automatically)
  - `ALPHAVANTAGE_API_KEY` (fallback prices)
- Ticker mapping overrides (optional)
  - `TICKER_YAHOO_SUFFIX=.NS` etc.

See `.env.example` for the full list.

## 4) Start Redis

Install Redis natively and start the service:

- macOS (Homebrew): `brew install redis && brew services start redis`
- Ubuntu/Debian: `sudo apt-get update && sudo apt-get install -y redis-server && sudo service redis-server start`
- Windows: Use Redis for Windows (e.g., via winget/choco) or WSL Redis and ensure it listens on `localhost:6379`.

## 5) Start the Optional ML Service

The ML service powers `/api/features`, `/api/predict/:symbol`, `/api/backtest/*`, and `/api/walkforward/:symbol`.

```bash
# In repo root
cd ml-svc
python -m pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 5001
```

Set in `server/.env`:
```
ENABLE_ML=true
ML_BASE_URL=http://localhost:5001
```

## 6) Run the Server

```bash
cd server
npm run dev
# or build + start
npm run build && npm start
```

Server defaults:
- Base: `http://localhost:4010`
- DB: `server/stock.db` (migrations run automatically)

Health checks:
- `GET /health`
- `GET /api/health/providers`
- `GET /api/jobs/status` (requires ENABLE_JOBS and Redis)

## 7) Run the Frontend

```bash
cd ../frontend
npm start
```

Frontend dev server:
- `http://localhost:5173` (Vite default)

## 8) Use the App

- Insight page (Stock selection):
  - Ingest, Yahoo data, News, Moneycontrol/Trendlyne cards.
  - TL Cache card (cached TL SMA/ADV summaries).
  - Stored Features card (plots SMA20/EMA50 and RSI/Momentum over time).
- Strategy Lab:
  - Choose strategy (MA Crossover/Momentum), set fast/slow, symbols/date range.
  - Run and view equity curve, drawdown, benchmark overlay, Sharpe/MaxDD, export JSON.
  - Walk-forward: click “Walk-forward” to evaluate per-fold Sharpe/MaxDD (requires ML service).
- Health tab:
  - Provider mapping and BullMQ job metrics (runs/latency) in a simple panel.

## 9) Populate TL Cache and Features (jobs)

With `ENABLE_JOBS=true` and Redis running, queues process on schedule. To seed specific symbols immediately:

```bash
# Enqueue one-off jobs
curl -X POST http://localhost:4010/api/jobs/enqueue \
  -H 'Content-Type: application/json' \
  -d '{"symbols":["BEL","DABUR"],"targets":["ingest:tl","features:build"]}'
```

Verify job status:
- `GET http://localhost:4010/api/jobs/status`

## 10) Stored Features API

- `GET /api/features-stored/:symbol?days=180`
- `GET /api/features-stored/:symbol?from=YYYY-MM-DD&to=YYYY-MM-DD`

Returned rows include: `date, ret1, ret5, ret20, vol, rsi, sma20, ema50, momentum, sent_avg, pcr, pvr`.

## 11) Provider Fixtures Tests (sanity checks)

```bash
cd server
node scripts/run-tests.cjs
```

This verifies sample Yahoo/News fixtures still parse with expected shapes.

## 12) Troubleshooting

- Jobs show empty caches (tl_cache/features):
  - Ensure `ENABLE_JOBS=true`, `REDIS_URL` set, Redis running.
  - Hit `/api/jobs/status` to confirm queues are active.
  - Enqueue one-off jobs as shown above.
- Trendlyne returns empty SMA/ADV:
  - Provide `TRENDLYNE_EMAIL`/`TRENDLYNE_PASSWORD` for cookie refresh or `TL_COOKIE` directly.
- ML endpoints disabled:
  - Set `ENABLE_ML=true`, `ML_BASE_URL=http://localhost:5001` and start `ml-svc`.
- Missing provider keys:
  - News and some external calls will fall back to sample data when possible.

## 13) Useful Scripts

- Print DB schema: `cd server && node scripts/schema-dump.cjs`
- Count table rows: `cd server && node scripts/table-counts.cjs`
- Run migrations manually: `cd server && node scripts/run-migrations.cjs`

---

You’re ready to use the full suite: ingest data, explore cards, run backtests, evaluate walk‑forward, and monitor provider/job health. If you want a one‑command setup without Docker, we can add cross‑platform scripts to start Redis, server, ML, and frontend together.

## 14) Onboard a New Data Source (card + fetch)

You can add a new external source URL (e.g., Yahoo/Moneycontrol/your API) and have a card appear automatically on a page with the correct ticker mapping.

Steps:

1. Declare the source in `server/src/config/sources.ts`
   - Add an object with fields:
     - `name`: unique id (e.g., `yahoo_key_stats`)
     - `label`: card title (e.g., `Yahoo Key Stats`)
     - `urlTemplate`: full URL with `{symbol}` placeholder (e.g., `https://query1.finance.yahoo.com/v10/finance/quoteSummary/{symbol}?modules=defaultKeyStatistics`)
     - `tickerProvider`: which mapping to use (`'yahoo'|'mc'|'trendlyne'|'news'|'alpha'|'yFin'`)
     - `page`: which page to show on (`'insight'|'overview'|'ai'|'watchlist'|'portfolio'|'alerts'|'settings'|'health'`)
     - `cardId`: DOM id (e.g., `src_yahoo_keystats`)

   Example:

   ```ts
   {
     name: 'yahoo_key_stats',
     label: 'Yahoo Key Stats',
     urlTemplate: 'https://query1.finance.yahoo.com/v10/finance/quoteSummary/{symbol}?modules=defaultKeyStatistics',
     tickerProvider: 'yahoo',
     page: 'insight',
     cardId: 'src_yahoo_keystats'
   }
   ```

2. Allow the host (security)
   - In the same file, update `allowedHost(u: URL)` to include the domain of your new source (e.g., `finance.yahoo.com`, `api.moneycontrol.com`).
   - This prevents SSRF and ensures only whitelisted hosts are fetched by the server.

3. Restart server
   - The server exposes:
     - `GET /api/sources/list` → list of sources
     - `GET /api/sources/fetch?name=...&symbol=...` → fetch JSON for a source, resolving ticker via the chosen provider mapping

4. Frontend card appears automatically
   - The frontend auto‑creates a JSON card per source on its target page and renders the fetched payload.
   - File: `frontend/src/cards/json-source-cards.ts`
   - On symbol change, it refetches using `/api/sources/fetch` and updates the card.

5. Optional: custom renderer
   - If you want a richer UI instead of raw JSON, you can add a specific card module for your source (e.g., `frontend/src/cards/my-source.ts`) and render KPIs/graphs using the same API endpoint.

Ticker mapping reminder:
- The `tickerProvider` chooses which mapping key/resolution to use (e.g., Yahoo with `.NS` suffix, MC `mcsymbol`, Trendlyne `tlid`).
- Override mappings in `server/.env` (see `.env.example`) if needed.

## 15) Testing & Validation Plan

This section outlines how to verify that all major subsystems work together. It complements existing docs (API reference, DB schema) and is designed for incremental automation.

### 15.1 Scope Overview
Components covered:
1. Core server & health (/health, /health/rag)
2. Ingestion pipeline (prices via Stooq, News (live or sample), Moneycontrol insights)
3. Stocks analytics (overview, history, analyze)
4. RAG (indexing & retrieval)
5. Options metrics (options_metrics table + APIs)
6. Top Picks & history snapshots
7. Features (stored vs ML proxy)
8. Portfolio, watchlist, alerts lifecycle
9. RSS & external indices/sectors & marketStatus
10. Provider framework (providers, provider_runs, errors)
11. Technical line cache (tl_cache)
12. Jobs (BullMQ) & schedulers
13. MCP / agent routes (basic availability)

### 15.2 Environment Matrix
| Feature | Required ENV / Service | Optional/Fallback |
|---------|------------------------|-------------------|
| Jobs / queues | REDIS_URL, ENABLE_JOBS=true | Without Redis: jobs disabled |
| ML proxy | ENABLE_ML=true, ML_BASE_URL | Without: /features returns placeholder |
| News ingestion | NEWS_API_KEY | Without: sample news used |
| Trendlyne cookie refresh | TL creds or TL_COOKIE | Without: related data empty |
| RAG vector store | chromadb / hnswlib deps | If failure: /health/rag may 503 |
| Puppeteer providers | System libs (headless) | If missing: provider failures logged |

### 15.3 Test Layers
1. Static: build (tsc), optional ESLint.
2. Unit: pure analytics helpers (sentiment, prediction, SMA backtest, scoring, ticker resolution, feature row upsert idempotence).
3. Integration (in‑process Supertest) against ephemeral SQLite file.
4. End‑to‑End (manual or Cypress/Playwright) with frontend + server + Redis + ML.
5. Non‑functional: performance (ingest latency), resilience (port auto-increment), rate limiting.

### 15.4 Quick Smoke (Manual)
Order:
1. Start Redis, ML (optional), server (npm run dev), frontend.
2. POST /api/ingest/TESTSYM
3. GET /api/stocks/TESTSYM/overview (expect lastClose)
4. POST /api/stocks/TESTSYM/analyze (expect recommendation)
5. GET /api/rag/TESTSYM/search?q=profit (allow empty if little text)
6. GET /api/top-picks
7. POST /api/top-picks/snapshot then GET /api/top-picks/history
8. Portfolio add/delete cycle
9. Watchlist add/delete
10. Alerts add + evaluate (manually adjust prices for trigger)
11. GET /api/marketStatus
12. GET /api/jobs/status (if jobs enabled)
13. GET /api/sources/list & fetch one source.

### 15.5 Integration Test Blueprint (Supertest)
Setup:
- Create temp dir; set process.env.DB_PATH to temp (or chdir).
- Disable heavy providers (e.g., set PREFETCH_DISABLED=true, omit TL creds).
- Mock network for deterministic ingestion (inject sample JSON for news & MC).

Test cases (suggested files):
- health.test.ts: /health 200, /health/rag tolerant of 200|503
- ingest.test.ts: POST /api/ingest/SYMA -> insertedPrices>0; re-run idempotence
- overview_history.test.ts: ascending dates, changePct numeric
- analyze.test.ts: POST analyze persists analyses row (query DB)
- rag.test.ts: after ingest, embeddings or docs row count >0; search returns array
- options.test.ts: seed options_metrics row then GET latest
- top-picks.test.ts: GET list + POST snapshot -> history contains inserted date
- features-stored.test.ts: insert manual rows then GET filtered by days
- portfolio_watchlist_alerts.test.ts: full CRUD + alert trigger simulation
- provider-data.test.ts: insert provider_data row -> GET returns parsed payload
- rate-limit.test.ts: exceed 60 writes/10min returns 429
- errors.test.ts: unknown path -> 404 JSON shape

### 15.6 DB Seeding Helpers
Use direct db.prepare(...).run(...) inside beforeAll hooks for deterministic fixtures (prices spanning >30 days to exercise momentum & returns).

### 15.7 RAG Verification
1. After ingestion verify rag_embeddings count (SELECT COUNT(*)).
2. Search keyword known in sample news returns at least one result.
3. Namespace isolation: ingest SYMA & SYMB; queries should not cross-contaminate.

### 15.8 Alerts Evaluation Logic Test
- Add price_drop alert with baseline.
- Insert new price row lower than baseline by > level%.
- Run POST /api/alerts/evaluate -> alert triggered_at set, active=0.

### 15.9 Performance Spot Checks
- Time ingestion (target <3s without external API, <6s with live news).
- Insert 10k price rows -> /history limited to configured cap (verify no memory blowup).

### 15.10 Resilience & Safety
- Simulate EADDRINUSE: start dummy server on 4010 then start app (if PORT_AUTOINC=true expects jump to 4011).
- Force unhandled rejection inside a route; confirm process does not exit (logged).

### 15.11 Suggested Scripts (Add Later)
Add to server/package.json:
- "test": "vitest run" (after adding Vitest + config)
- "test:watch": "vitest"
- "lint": "eslint 'src/**/*.{ts,js}'" (after adding ESLint)

### 15.12 CI Recommendations
GitHub Actions workflow steps:
1. Checkout
2. Setup Node 20
3. npm ci (server)
4. npm run build
5. Start Redis service (services: redis)
6. Run test suite
7. (Optional) Upload coverage artifact

### 15.13 Coverage Priorities
Aim for >80% statements on: analytics/, services/topPicks.ts, services/alertsEvaluator.ts, utils/ticker.ts, db.ts helper branches (options_metrics, features, alerts paths).

### 15.14 Manual Regression Checklist (Release)
- Ingest 3 symbols
- Snapshot top picks
- Run analyze on each
- Add + trigger an alert
- Portfolio & watchlist reflect correct PnL
- RAG search returns deterministic entry
- Features-stored endpoints return recent rows
- Jobs status shows active queues (if enabled)
- No sensitive envs leaked in /api/health/providers

### 15.15 Known Gaps / Future
- Add auth (API key/JWT) if exposed externally
- Add distributed rate limiting (Redis token bucket) for multi-instance
- Add load tests (k6 / autocannon) for ingestion & top-picks
- Add provider run simulation tests for failure escalation logic
- Add snapshot diff test for /api/top-picks scoring stability

### 15.16 Quick Curl Reference
```bash
curl -X POST http://localhost:4010/api/ingest/INFY -H 'Content-Type: application/json' -d '{"name":"Infosys"}'
curl http://localhost:4010/api/stocks/INFY/overview
curl -X POST http://localhost:4010/api/stocks/INFY/analyze
curl "http://localhost:4010/api/rag/INFY/search?q=earnings"
curl http://localhost:4010/api/top-picks
curl -X POST http://localhost:4010/api/top-picks/snapshot
curl http://localhost:4010/api/features-stored/INFY?days=60
curl -X POST http://localhost:4010/api/portfolio/add -H 'Content-Type: application/json' -d '{"symbol":"INFY","buyDate":"2024-09-01","buyPrice":1500,"quantity":10}'
curl http://localhost:4010/api/portfolio/summary
curl -X POST http://localhost:4010/api/alerts/add -H 'Content-Type: application/json' -d '{"symbol":"INFY","kind":"price_drop","level":5}'
curl -X POST http://localhost:4010/api/alerts/evaluate
```

---
This test plan can be iteratively automated; start with ingestion + analytics + top-picks integration tests for fastest feedback.
