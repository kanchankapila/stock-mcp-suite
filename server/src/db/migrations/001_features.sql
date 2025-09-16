-- Features table for ML pipeline
CREATE TABLE IF NOT EXISTS features (
  symbol TEXT NOT NULL,
  date   TEXT NOT NULL,
  ret1   REAL,
  ret5   REAL,
  ret20  REAL,
  vol    REAL,
  rsi    REAL,
  sma20  REAL,
  ema50  REAL,
  momentum REAL,
  sent_avg REAL,
  pcr REAL,
  pvr REAL,
  PRIMARY KEY(symbol, date)
);
CREATE INDEX IF NOT EXISTS features_symbol_date ON features(symbol, date);

