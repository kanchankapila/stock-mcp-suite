# Architecture

## Current Architecture

```mermaid
flowchart LR
  FE[Frontend (Angular)] -- REST /api --> API[Express Server (Node.js + TS)]
  FE -- WS /ws --> API

  subgraph Server
    API --> DB[(SQLite: stock.db)]
    API --> RAG[[RAG Store\n(memory | hnsw | sqlite | chroma)]]
    API -. puppeteer .-> TLH[Trendlyne Headless Login]

    subgraph Background Tasks
      PREF[Yahoo Prefetcher] --> API
      NEWS[News Prefetcher] --> API
      MCT[MC Tech Prefetcher] --> API
      RAGAUTO[RAG Auto Tasks (migrate/build)] --> RAG
    end
  end

  API -- HTTP --> YF[Yahoo Finance APIs]
  API -- HTTP --> STQ[Stooq CSV]
  API -- HTTP --> NEWSAPI[NewsAPI]
  API -- HTTP --> MC[Moneycontrol APIs]
  API -- HTTP --> TL[Trendlyne APIs]
  API -- HTTP --> ET[ET Markets APIs]
  API -- HTTP --> TT[Tickertape API]
  API -- HTTP --> MM[MarketsMojo API]
```

- Server: `express` app (see `server/src/index.ts`), routes under `server/src/routes/*`.
- Data store: SQLite `stock.db` (`server/src/db.ts`). Tables: `prices`, `news`, `mc_tech`, `stocks`, `rag_embeddings`, `rag_url_status`, `analyses`, `top_picks_history`.
- RAG: pluggable store via `RAG_STORE` env; embeds/indexes via `server/src/rag/langchain.ts`.
- Live quotes: WebSocket `/ws` polls Yahoo quotes in batches (`server/src/ws/live.ts`).
- Background:
  - Yahoo Prefetcher: quotes→`prices`, optional Stooq/Yahoo chart fallback (`server/src/providers/prefetch.ts`).
  - News Prefetcher: NewsAPI→`news` with sentiment (`server/src/providers/prefetch.ts`).
  - MC Tech Prefetcher: Moneycontrol Tech→`mc_tech` cache.
  - Trendlyne cookie auto-refresh (headless) for SMA and other endpoints (`server/src/providers/trendlyneHeadless.ts`).
  - RAG auto-migrate/build and daily Top Picks snapshot (`server/src/rag/auto.ts`).

## Recommended Architecture

```mermaid
flowchart LR
  FE[Frontend] --> GW[API Gateway / Backend]

  subgraph Services
    ING[Ingestion Service]
    RT[Realtime Service]
    RAG[Vector/RAG Service]
    ANA[Analysis Service]
  end

  subgraph Infra
    Q[(Queue: Redis/BullMQ or Kafka)]
    C[(Cache: Redis)]
    OLTP[(PostgreSQL)]
    VDB[(Vector DB: Chroma / pgvector / Weaviate)]
    OBS[Monitoring: Prometheus + Grafana + OTel]
    SEC[Secrets: Vault / Cloud KMS]
  end

  GW -- REST --> ING
  GW -- REST/SSE --> RAG
  GW -- REST --> ANA
  FE -- WS --> RT

  SCH[Scheduler (BullMQ/Temporal)] --> Q
  GW --> C
  GW --> OLTP

  ING --> Q
  ING -- Providers --> YF[Yahoo] & STQ[Stooq] & NEWSAPI[NewsAPI] & MC[Moneycontrol] & TL[Trendlyne] & ET[ET Markets] & TT[Tickertape] & MM[MarketsMojo]
  ING --> OLTP
  ING --> VDB
  ING --> C

  RT --> OLTP
  RT --> C

  RAG --> VDB
  ANA --> OLTP

  subgraph Ops
    OBS -.-> GW & ING & RT & RAG & ANA
    SEC -.-> GW & ING & RT & RAG & ANA
  end
```

Key improvements
- Replace SQLite with PostgreSQL for concurrency, durability, and migrations.
- Introduce a scheduler + queue (BullMQ/Redis or Temporal/Kafka) for resilient, rate‑limited ingestion and retries.
- Move vector store to a managed or scalable option (Chroma server, pgvector, Weaviate) with per‑ns collections.
- Add Redis for caching hot reads and live price fan‑out; use pub/sub for WS updates.
- Split concerns into services (ingestion, realtime, RAG, analysis) behind an API gateway; keep monolith option for small scale.
- Centralize secrets and rotate cookies/keys using Vault/KMS; remove headless where possible in favor of official APIs.
- Add observability: tracing (OpenTelemetry), metrics (Prometheus), logs; alerts on provider errors/429s.
- Harden network calls with circuit breakers, exponential backoff, and per‑provider quotas.
- Use background workers for Top Picks snapshots and RAG batch tasks instead of in‑process timers.

Migration path
- Phase 1: Keep monolith; swap SQLite→PostgreSQL and RAG sqlite→pgvector/Chroma. Introduce BullMQ + Redis; move prefetchers to queued jobs.
- Phase 2: Extract ingestion and realtime into separate workers/services; add API gateway and shared Redis/Postgres.
- Phase 3: Add full observability, secrets management, and autoscaling.

