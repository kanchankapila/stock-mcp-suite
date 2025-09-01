# Architecture

This document illustrates the system components and data flow of the stock-mcp-suite.

```mermaid
flowchart LR
  user[User/Browser]

  subgraph FE[Frontend (Vite/Angular)]
    FE_APP[App + UI]
    FE_API[`frontend/src/app/services/api.service.ts`]
  end

  subgraph SRV[Server (Express)]
    subgraph API[/REST API/]
      STK[`server/src/routes/stocks.ts`]
      RAG[`server/src/routes/rag.ts`]
      AGT[`server/src/agent/agent.ts`]
      MCP[`server/src/mcp/mcp-server.ts`]
    end
    subgraph LIVE[Live + Background]
      WS[`server/src/ws/live.ts`]
      PREF[`server/src/providers/prefetch.ts`]
    end
    subgraph RAGC[RAG Engine]
      LC[`server/src/rag/langchain.ts`]
      RET[`server/src/rag/retriever.ts`]
      IDX[`server/src/rag/indexer.ts`]
    end
    DB[`server/src/db.ts (SQLite)`]
    SIDX[Tables: stocks, prices, news, docs, rag_embeddings, analyses]
  end

  subgraph EXT[External Providers]
    YF[Yahoo Finance]
    STQ[Stooq]
    NEWS[NewsAPI]
    MC[Moneycontrol]
    AV[Alpha Vantage]
    LLM[(OpenAI / HF Embeddings + LLM)]
  end

  user --> FE_APP
  FE_APP --> FE_API

  FE_API -- REST --> STK
  FE_API -- REST --> RAG
  FE_API -- REST --> AGT
  FE_APP -- SSE --> RAG
  FE_APP -- SSE --> AGT
  FE_APP -- WS (/ws) --> WS

  STK <--> DB
  AGT <--> DB
  RAG <--> LC
  LC <-- embeds/query --> LLM
  LC <--> DB
  RET <--> DB
  IDX --> DB

  STK -- ingest/fetch --> YF
  STK -- fallback --> STQ
  STK -- news --> NEWS
  STK -- insights --> MC
  STK -- optional --> AV

  WS -- poll quotes --> YF
  PREF -- batch quotes --> YF
  PREF -- fallback --> STQ
  PREF -- news batch --> NEWS
  PREF -- insights batch --> MC

  WS --> DB
  PREF --> DB

  click DB href "server/src/db.ts"
  click STK href "server/src/routes/stocks.ts"
  click RAG href "server/src/routes/rag.ts"
  click AGT href "server/src/agent/agent.ts"
  click WS href "server/src/ws/live.ts"
  click PREF href "server/src/providers/prefetch.ts"
  click LC href "server/src/rag/langchain.ts"
  click RET href "server/src/rag/retriever.ts"
  click IDX href "server/src/rag/indexer.ts"
  click FE_API href "frontend/src/app/services/api.service.ts"
```

Notes:
- The server mounts REST APIs and SSE at `server/src/index.ts`, attaches WebSocket live quotes, and starts the background prefetcher.
- RAG supports both a legacy TF‑IDF retriever and a LangChain vector store (memory/HNSW/SQLite) with OpenAI/HF embeddings.
- Providers include Yahoo (primary), Stooq (fallback), NewsAPI, Moneycontrol, and optional Alpha Vantage.
# Architecture

This document illustrates the system components and data flow of the stock-mcp-suite.

```mermaid
flowchart LR
  user[User/Browser]

  subgraph FE [Frontend (Vite/Angular)]
    FE_APP[App + UI]
    FE_API[frontend/src/app/services/api.service.ts]
  end

  subgraph SRV [Server (Express)]
    subgraph API [/REST API/]
      STK[server/src/routes/stocks.ts]
      RAG[server/src/routes/rag.ts]
      AGT[server/src/agent/agent.ts]
      MCP[server/src/mcp/mcp-server.ts]
    end
    subgraph LIVE [Live + Background]
      WS[server/src/ws/live.ts]
      PREF[server/src/providers/prefetch.ts]
    end
    subgraph RAGC [RAG Engine]
      LC[server/src/rag/langchain.ts]
      RET[server/src/rag/retriever.ts]
      IDX[server/src/rag/indexer.ts]
    end
    DB[server/src/db.ts (SQLite)]
    SIDX[Tables: stocks, prices, news, docs, rag_embeddings, analyses]
  end

  subgraph EXT [External Providers]
    YF[Yahoo Finance]
    STQ[Stooq]
    NEWS[NewsAPI]
    MC[Moneycontrol]
    AV[Alpha Vantage]
    LLM[(OpenAI / HF Embeddings + LLM)]
  end

  user --> FE_APP
  FE_APP --> FE_API

  FE_API -- REST --> STK
  FE_API -- REST --> RAG
  FE_API -- REST --> AGT
  FE_APP -- SSE --> RAG
  FE_APP -- SSE --> AGT
  FE_APP -- WS (/ws) --> WS

  STK <--> DB
  AGT <--> DB
  RAG <--> LC
  LC <-- embeds/query --> LLM
  LC <--> DB
  RET <--> DB
  IDX --> DB

  STK -- ingest/fetch --> YF
  STK -- fallback --> STQ
  STK -- news --> NEWS
  STK -- insights --> MC
  STK -- optional --> AV

  WS -- poll quotes --> YF
  PREF -- batch quotes --> YF
  PREF -- fallback --> STQ
  PREF -- news batch --> NEWS
  PREF -- insights batch --> MC

  WS --> DB
  PREF --> DB

  click DB href "server/src/db.ts"
  click STK href "server/src/routes/stocks.ts"
  click RAG href "server/src/routes/rag.ts"
  click AGT href "server/src/agent/agent.ts"
  click WS href "server/src/ws/live.ts"
  click PREF href "server/src/providers/prefetch.ts"
  click LC href "server/src/rag/langchain.ts"
  click RET href "server/src/rag/retriever.ts"
  click IDX href "server/src/rag/indexer.ts"
  click FE_API href "frontend/src/app/services/api.service.ts"
```

Notes:
- The server mounts REST APIs and SSE at `server/src/index.ts`, attaches WebSocket live quotes, and starts the background prefetcher.
- RAG supports both a legacy TF-IDF retriever and a LangChain vector store (memory/HNSW/SQLite) with OpenAI/HF embeddings.
- Providers include Yahoo (primary), Stooq (fallback), NewsAPI, Moneycontrol, and optional Alpha Vantage.

