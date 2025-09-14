-- Persist backtest runs and results
CREATE TABLE IF NOT EXISTS backtests (
  id TEXT PRIMARY KEY,
  status TEXT,
  cfg TEXT,
  metrics TEXT,
  equity TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS backtests_status_idx ON backtests(status);

