-- Additional helpful indexes
CREATE INDEX IF NOT EXISTS prices_symbol_date ON prices(symbol, date);
-- yahoo_cache removed
CREATE INDEX IF NOT EXISTS options_metrics_symbol_date ON options_metrics(symbol, date);
