-- Performance optimization indexes
-- Created: 2025-09-17
-- Purpose: Add missing composite indexes for frequently queried columns

-- Critical indexes for prices table
CREATE INDEX IF NOT EXISTS idx_prices_symbol_date_desc ON prices(symbol, date DESC);
CREATE INDEX IF NOT EXISTS idx_prices_symbol_date_close ON prices(symbol, date DESC, close);
CREATE INDEX IF NOT EXISTS idx_prices_date_symbol ON prices(date, symbol);

-- News table performance indexes
CREATE INDEX IF NOT EXISTS idx_news_symbol_date_sent ON news(symbol, date DESC, sentiment);
CREATE INDEX IF NOT EXISTS idx_news_date_symbol ON news(date DESC, symbol);
CREATE INDEX IF NOT EXISTS idx_news_sentiment_symbol ON news(sentiment, symbol);

-- Provider data optimization
CREATE INDEX IF NOT EXISTS idx_provider_data_symbol_captured ON provider_data(symbol, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_data_provider_captured ON provider_data(provider_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_data_captured_provider ON provider_data(captured_at DESC, provider_id);

-- Features table optimization
CREATE INDEX IF NOT EXISTS idx_features_symbol_date_desc ON features(symbol, date DESC);
CREATE INDEX IF NOT EXISTS idx_features_date_symbol ON features(date DESC, symbol);

-- RAG embeddings performance
CREATE INDEX IF NOT EXISTS idx_rag_embeddings_ns_id ON rag_embeddings(ns, id);
CREATE INDEX IF NOT EXISTS idx_rag_embeddings_ns_vector ON rag_embeddings(ns, vector);

-- Provider runs optimization
CREATE INDEX IF NOT EXISTS idx_provider_runs_success_duration ON provider_runs(success, duration_ms);
CREATE INDEX IF NOT EXISTS idx_provider_runs_provider_started ON provider_runs(provider_id, started_at DESC, success);

-- Options metrics optimization
CREATE INDEX IF NOT EXISTS idx_options_metrics_symbol_date_desc ON options_metrics(symbol, date DESC);
CREATE INDEX IF NOT EXISTS idx_options_metrics_date_symbol ON options_metrics(date DESC, symbol);

-- Analysis optimization
CREATE INDEX IF NOT EXISTS idx_analyses_symbol_created ON analyses(symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_created_symbol ON analyses(created_at DESC, symbol);

-- Watchlist and portfolio optimization
CREATE INDEX IF NOT EXISTS idx_watchlist_added_symbol ON watchlist(added_at DESC, symbol);
CREATE INDEX IF NOT EXISTS idx_portfolio_symbol_buy_date ON portfolio(symbol, buy_date DESC);
CREATE INDEX IF NOT EXISTS idx_portfolio_buy_date_symbol ON portfolio(buy_date DESC, symbol);

-- Alerts optimization
CREATE INDEX IF NOT EXISTS idx_alerts_active_symbol ON alerts(active, symbol);
CREATE INDEX IF NOT EXISTS idx_alerts_symbol_active ON alerts(symbol, active, created_at DESC);

-- RSS news optimization
CREATE INDEX IF NOT EXISTS idx_rss_news_symbol_published ON rss_news(symbol, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_rss_news_published_symbol ON rss_news(published_at DESC, symbol);
