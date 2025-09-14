-- Trendlyne cache for SMA/Advanced Technicals
CREATE TABLE IF NOT EXISTS tl_cache (
  tlid TEXT NOT NULL,
  kind TEXT NOT NULL, -- 'sma' | 'adv'
  data TEXT,
  updated_at TEXT,
  PRIMARY KEY(tlid, kind)
);
CREATE INDEX IF NOT EXISTS tl_cache_tlid_idx ON tl_cache(tlid);

