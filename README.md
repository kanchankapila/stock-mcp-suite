# Stock RAG MCP Suite

End-to-end demo project:

- **Server (Node.js + TypeScript)**: "MCP-style" tool server exposing REST endpoints, local RAG index, sentiment analysis, price prediction (SMA forecast), strategy analysis, scoring and buy/sell/hold recommendation, and backtesting. Uses SQLite via `better-sqlite3`.
- **Agent**: A lightweight rule-based agent that interprets natural-language prompts about a stock and calls the server's tools (sentiment, prediction, backtesting) + RAG retrieval to answer.
- **Frontend (Angular)**: Attractive, Material-styled dashboard to search a stock, trigger ingest, and view metrics/charts/recommendations.

> Notes
> - External market/news APIs are *optional*. If keys are not provided, the server falls back to sample data under `server/sample-data`.
> - "MCP-style": this repo implements an MCP-inspired tool server over HTTP/JSON with clearly declared tools and schemas. If you need strict **Model Context Protocol** (JSON-RPC over stdio/websocket), you can adapt `server/src/mcp/mcp-server.ts` which exposes a minimal MCP JSON-RPC tool surface.

## Architecture

- High-level diagram with components and data flow: `docs/architecture.md`
- The diagram is rendered with Mermaid; many IDEs and GitHub previewers support it.

## Quick Start

### 1) Prereqs
- Node.js 20+
- npm 10+
- (Optional) API keys if you want live data:
  - `ALPHA_VANTAGE_KEY` for prices
  - `NEWS_API_KEY` for headlines

### 2) Install & Run — Server
```bash
cd server
npm install
npm run dev
# or build & run
npm run build && npm start
```

The server listens on `http://localhost:4010` by default and initializes `stock.db` in the project root.

### 3) Install & Run — Frontend (Angular)
```bash
cd ../frontend
npm install
npm start
# Angular dev server: http://localhost:4200
```

### 4) Try it
1. Open the frontend: `http://localhost:4200`
2. Search for a symbol (e.g., `AAPL`), click **Ingest** to pull data (uses API keys if provided; otherwise sample data).
3. View overview, price chart, sentiment, RAG answers, strategy score, backtest & recommendation.

### Environment
Create `server/.env` to enable live data:
```
PORT=4010
ALPHA_VANTAGE_KEY=your_alpha_vantage_key
NEWS_API_KEY=your_newsapi_key
```

### Provider Ticker Mapping
The server resolves identifiers per provider using `server/stocklist.ts` and env-configurable rules. By default:

- Yahoo Finance: uses `symbol` with `.NS` suffix (e.g., `BEL` -> `BEL.NS`).
- News API: uses `name` (e.g., `Bharat Electronics`).
- AlphaVantage: uses `symbol` with no suffix.
 - Moneycontrol (MC Insights): uses `mcsymbol` with no suffix (e.g., `BEL` -> `BE03`).

Override via `server/.env` (examples shown commented in that file):

- `TICKER_YAHOO_KEY`: which key from `stocklist.ts` to use (e.g., `symbol`, `mcsymbol`, `isin`, `tlid`, `name`).
- `TICKER_YAHOO_SUFFIX`: suffix to append (e.g., `.NS`).
- `TICKER_NEWS_KEY`, `TICKER_NEWS_SUFFIX` for News API.
- `TICKER_ALPHA_KEY`, `TICKER_ALPHA_SUFFIX` for AlphaVantage.
- `TICKER_MC_KEY`, `TICKER_MC_SUFFIX` for Moneycontrol insights.
- `STOCKLIST_PATH`: explicit path to `stocklist.ts` if not in the default location.

Under the hood, the resolver maps any input (name/symbol/mcsymbol/isin/tlid) to the configured provider ticker. See `server/src/utils/ticker.ts`.

Examples
- Use NSE Yahoo suffix and News by name (defaults):
  - `TICKER_YAHOO_KEY=symbol`, `TICKER_YAHOO_SUFFIX=.NS`
  - `TICKER_NEWS_KEY=name`, `TICKER_NEWS_SUFFIX=`
- Use Moneycontrol mcsymbol BE03:
  - `TICKER_MC_KEY=mcsymbol`, `TICKER_MC_SUFFIX=`

### RAG (LangChain)

The server exposes a minimal LangChain-powered RAG to index external web pages and query them per-namespace (e.g., a stock symbol).

Env (optional):
- `RAG_STORE`: `memory` (default), `hnsw`, or `sqlite` for persistence.
- `RAG_DIR`: base dir for `hnsw` persistence (default `./data/rag`).
- `OPENAI_API_KEY`: enable OpenAI embeddings and LLM answers.
- `OPENAI_EMBEDDING_MODEL` (default `text-embedding-3-small`).
- `HUGGINGFACEHUB_API_KEY`: use HF embeddings when OpenAI is unavailable.
- `HF_EMBEDDING_MODEL` (default `sentence-transformers/all-MiniLM-L6-v2`).
- `OPENAI_MODEL` (default `gpt-4o-mini`).

Routes:
- `POST /api/rag/index`
  - Body: `{ "namespace": "BEL", "urls": ["https://example.com/a", "https://example.com/b" ] }`
  - Or: `{ "namespace":"BEL", "texts": [{"text":"some content", "metadata": {"source":"manual"}}] }`
  - Response: `{ ok: true, added: <chunks> }`
- `POST /api/rag/query`
  - Body: `{ "namespace": "BEL", "query": "latest guidance?", "k": 5, "withAnswer": true }`
  - Response with `withAnswer=true`: `{ ok:true, answer: string|null, sources: [{ text, metadata }] }`
  - Without `withAnswer`: `{ ok:true, hits: [{ text, metadata }] }`

Notes:
- If `OPENAI_API_KEY` is not set, retrieval still works and returns contexts; `answer` will be `null`. With `HUGGINGFACEHUB_API_KEY`, embeddings fall back to HF.
- Indexing uses a Cheerio web loader and a recursive splitter (1k chars, 150 overlap).
- Persistence:
  - `RAG_STORE=hnsw`: per-namespace HNSW index stored under `RAG_DIR/<ns>`.
  - `RAG_STORE=sqlite`: embeddings stored in `rag_embeddings` SQLite table; retrieval computes cosine in-process.

### Live Prefetch and WebSocket
The server runs a background prefetcher that batches Yahoo quote requests and writes to the DB. It adapts with backoff and falls back to Yahoo chart and then Stooq if needed. WebSocket polling for active subscriptions uses the same batching/backoff. Tunables (commented in `server/.env`):

- `PREFETCH_*`: batch sizes, intervals, backoff, fallbacks.
- `LIVE_*`: polling cadence, batch size, fallbacks.
- `INGEST_USE_STOOQ_FALLBACK`: enable Stooq fallback during ingest.

---

## Project Layout

```
stock-mcp-suite/
├─ server/                  # Node + TS app
│  ├─ src/
│  │  ├─ index.ts
│  │  ├─ db.ts
│  │  ├─ routes/
│  │  │  └─ stocks.ts
│  │  ├─ analytics/
│  │  │  ├─ sentiment.ts
│  │  │  ├─ predict.ts
│  │  │  └─ backtest.ts
│  │  ├─ rag/
│  │  │  ├─ indexer.ts
│  │  │  └─ retriever.ts
│  │  ├─ agent/agent.ts
│  │  ├─ providers/
│  │  │  ├─ alphaVantage.ts
│  │  │  └─ news.ts
│  │  └─ mcp/
│  │     └─ mcp-server.ts
│  ├─ sample-data/
│  │  ├─ AAPL_prices.json
│  │  └─ AAPL_news.json
│  ├─ package.json
│  ├─ tsconfig.json
│  └─ .env.example
└─ frontend/                # Angular app
   ├─ src/
   │  ├─ app/
   │  │  ├─ app.component.ts
   │  │  ├─ app.component.html
   │  │  ├─ app.component.css
   │  │  ├─ services/api.service.ts
   │  │  └─ models.ts
   │  ├─ index.html
   │  └─ main.ts
   ├─ angular.json
   ├─ package.json
   ├─ tsconfig.app.json
   └─ tsconfig.json
```

---

## MCP Prompt (for ChatGPT/Claude)

Use the prompt in `PROMPT_FOR_CHATGPT.txt` to ask a coding model to implement/extend this stack as an expert in Angular, JavaScript, and AI.

### Logging & Errors
- Requests are logged with JSON lines including method, URL, status, and duration.
- Centralized error middleware returns `{ ok:false, error }` with 500 masking internals.
- Process-level handlers capture unhandled rejections/exceptions.
- Set `LOG_LEVEL=debug` to enable verbose logs.

## Run Both (Root)

From the repo root you can start both backend and frontend together:

```
npm run dev
```

This runs `server` via `npm run dev` and `frontend` via `npm start` concurrently. Logs are prefixed with `[server]` and `[frontend]`.
