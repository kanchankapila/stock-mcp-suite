# Database Schema (SQLite: `stock.db`)

- stocks(symbol TEXT PRIMARY KEY, name TEXT)
- prices(symbol TEXT, date TEXT, open REAL, high REAL, low REAL, close REAL, volume INTEGER, PRIMARY KEY(symbol,date))
- news(id TEXT PRIMARY KEY, symbol TEXT, date TEXT, title TEXT, summary TEXT, url TEXT, sentiment REAL)
- mc_tech(symbol TEXT, freq TEXT, data TEXT, updated_at TEXT, PRIMARY KEY(symbol,freq))
- docs(id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, chunk TEXT, terms TEXT)
- rag_embeddings(ns TEXT, id TEXT, text TEXT, metadata TEXT, vector TEXT, PRIMARY KEY(ns,id))
- rag_url_status(ns TEXT, url TEXT, last_indexed TEXT, status TEXT, note TEXT, PRIMARY KEY(ns,url))
- analyses(id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, created_at TEXT, sentiment_score REAL, predicted_close REAL, strategy JSON, score REAL, recommendation TEXT)
- top_picks_history(snapshot_date TEXT, symbol TEXT, score REAL, momentum REAL, sentiment REAL, mc_score REAL, recommendation TEXT, created_at TEXT, PRIMARY KEY(snapshot_date,symbol))

Source: `server/src/db.ts:6` (table DDL starts at the lines noted above).
