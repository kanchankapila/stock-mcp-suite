-- Backfill migration for portfolio, watchlist, alerts, rss_news, provider_data tables
-- Idempotent: uses IF NOT EXISTS and safe index creation

CREATE TABLE IF NOT EXISTS watchlist(
  symbol TEXT PRIMARY KEY,
  added_at TEXT
);

CREATE TABLE IF NOT EXISTS portfolio(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT,
  buy_date TEXT,
  buy_price REAL,
  quantity REAL,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS portfolio_symbol_idx ON portfolio(symbol);
CREATE INDEX IF NOT EXISTS portfolio_buy_date_idx ON portfolio(buy_date);

CREATE TABLE IF NOT EXISTS alerts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT,
  kind TEXT,
  level REAL,
  triggered_at TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS alerts_symbol_idx ON alerts(symbol);

CREATE TABLE IF NOT EXISTS rss_news(
  id TEXT PRIMARY KEY,
  symbol TEXT,
  title TEXT,
  summary TEXT,
  url TEXT,
  published_at TEXT,
  sentiment REAL
);
CREATE INDEX IF NOT EXISTS rss_symbol_idx ON rss_news(symbol);
CREATE INDEX IF NOT EXISTS rss_published_idx ON rss_news(published_at);

CREATE TABLE IF NOT EXISTS provider_data(
  provider_id TEXT,
  symbol TEXT,
  captured_at TEXT,
  payload TEXT,
  PRIMARY KEY(provider_id, symbol, captured_at)
);
CREATE INDEX IF NOT EXISTS provider_data_symbol_idx ON provider_data(symbol);
