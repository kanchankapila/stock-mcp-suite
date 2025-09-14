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
