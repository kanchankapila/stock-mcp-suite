-- ...new migration file...
CREATE TABLE IF NOT EXISTS provider_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  success INTEGER NOT NULL,
  error_count INTEGER NOT NULL DEFAULT 0,
  items_json TEXT,
  rag_indexed INTEGER DEFAULT 0,
  meta_json TEXT
);
CREATE INDEX IF NOT EXISTS provider_runs_provider_idx ON provider_runs(provider_id, started_at DESC);

CREATE TABLE IF NOT EXISTS provider_run_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  symbol TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES provider_runs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS provider_run_errors_run_idx ON provider_run_errors(run_id);
