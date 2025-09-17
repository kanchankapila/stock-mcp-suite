-- Enhanced Database Schema for Advanced Stock Recommendation System
-- This migration adds tables for sophisticated recommendation engine functionality

-- Stock Recommendations Table
CREATE TABLE IF NOT EXISTS stock_recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('STRONG_BUY', 'BUY', 'HOLD', 'SELL', 'STRONG_SELL', 'WATCH')),
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    score INTEGER NOT NULL CHECK (score >= -100 AND score <= 100),
    recommendation_type TEXT NOT NULL CHECK (recommendation_type IN ('technical', 'fundamental', 'sentiment', 'momentum', 'collaborative', 'hybrid')),
    time_horizon TEXT NOT NULL CHECK (time_horizon IN ('short', 'medium', 'long')),
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
    target_price REAL,
    stop_loss REAL,
    
    -- Factor scores
    technical_score INTEGER,
    fundamental_score INTEGER,
    sentiment_score INTEGER,
    momentum_score INTEGER,
    
    -- Additional data
    reasoning TEXT, -- JSON array of reasoning strings
    metadata TEXT,  -- JSON object with additional metadata
    
    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,
    
    -- Indexing
    UNIQUE(symbol, recommendation_type, time_horizon, created_at)
);

CREATE INDEX IF NOT EXISTS idx_recommendations_symbol ON stock_recommendations(symbol);
CREATE INDEX IF NOT EXISTS idx_recommendations_action ON stock_recommendations(action);
CREATE INDEX IF NOT EXISTS idx_recommendations_created ON stock_recommendations(created_at);
CREATE INDEX IF NOT EXISTS idx_recommendations_score ON stock_recommendations(score DESC);

-- Similar Stocks Table (for collaborative filtering)
CREATE TABLE IF NOT EXISTS similar_stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    base_symbol TEXT NOT NULL,
    similar_symbol TEXT NOT NULL,
    similarity_score REAL NOT NULL CHECK (similarity_score >= 0 AND similarity_score <= 1),
    correlation_type TEXT NOT NULL CHECK (correlation_type IN ('technical', 'fundamental', 'sector', 'behavioral')),
    calculation_date TEXT NOT NULL DEFAULT (datetime('now')),
    metadata TEXT, -- JSON with calculation details
    
    UNIQUE(base_symbol, similar_symbol, correlation_type)
);

CREATE INDEX IF NOT EXISTS idx_similar_stocks_base ON similar_stocks(base_symbol);
CREATE INDEX IF NOT EXISTS idx_similar_stocks_similarity ON similar_stocks(similarity_score DESC);

-- Portfolio Recommendations Table
CREATE TABLE IF NOT EXISTS portfolio_recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id TEXT NOT NULL,
    symbols TEXT NOT NULL, -- JSON array of symbols
    risk_tolerance TEXT NOT NULL CHECK (risk_tolerance IN ('conservative', 'moderate', 'aggressive')),
    
    -- Portfolio metrics
    portfolio_score REAL,
    diversification_score REAL,
    risk_adjusted_return REAL,
    
    -- Allocation suggestions
    current_allocation TEXT, -- JSON object
    suggested_allocation TEXT, -- JSON object
    rebalance_actions TEXT, -- JSON array of actions
    
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    UNIQUE(portfolio_id, created_at)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_recommendations_id ON portfolio_recommendations(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_recommendations_score ON portfolio_recommendations(portfolio_score DESC);

-- User Watchlists Table
CREATE TABLE IF NOT EXISTS user_watchlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    symbols TEXT NOT NULL, -- JSON array of symbols
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_watchlists_user ON user_watchlists(user_id);

-- Stock Alerts Table
CREATE TABLE IF NOT EXISTS stock_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'default',
    symbol TEXT NOT NULL,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('price_above', 'price_below', 'volume_spike', 'sentiment_change', 'recommendation_change')),
    threshold_value REAL,
    comparison_operator TEXT CHECK (comparison_operator IN ('>', '<', '>=', '<=', '=')),
    is_active INTEGER DEFAULT 1 CHECK (is_active IN (0, 1)),
    triggered_count INTEGER DEFAULT 0,
    last_triggered TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    UNIQUE(user_id, symbol, alert_type)
);

CREATE INDEX IF NOT EXISTS idx_alerts_active ON stock_alerts(is_active, symbol);
CREATE INDEX IF NOT EXISTS idx_alerts_user ON stock_alerts(user_id);

-- Fundamentals Data Table (Enhanced)
CREATE TABLE IF NOT EXISTS fundamentals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    date TEXT NOT NULL,
    
    -- Valuation Metrics
    pe_ratio REAL,
    pb_ratio REAL,
    ps_ratio REAL,
    peg_ratio REAL,
    ev_ebitda REAL,
    market_cap REAL,
    enterprise_value REAL,
    
    -- Profitability Metrics
    roe REAL, -- Return on Equity
    roa REAL, -- Return on Assets
    roic REAL, -- Return on Invested Capital
    gross_margin REAL,
    operating_margin REAL,
    net_margin REAL,
    
    -- Financial Health
    debt_to_equity REAL,
    current_ratio REAL,
    quick_ratio REAL,
    interest_coverage REAL,
    
    -- Growth Metrics
    revenue_growth REAL,
    earnings_growth REAL,
    eps_growth REAL,
    book_value_growth REAL,
    
    -- Per Share Data
    eps REAL, -- Earnings Per Share
    book_value_per_share REAL,
    revenue_per_share REAL,
    free_cash_flow_per_share REAL,
    
    -- Industry Comparisons
    industry_pe REAL,
    industry_pb REAL,
    industry_roe REAL,
    
    -- Quality Scores
    piotroski_score INTEGER CHECK (piotroski_score >= 0 AND piotroski_score <= 9),
    altman_z_score REAL,
    
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    UNIQUE(symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_fundamentals_symbol ON fundamentals(symbol);
CREATE INDEX IF NOT EXISTS idx_fundamentals_date ON fundamentals(date);
CREATE INDEX IF NOT EXISTS idx_fundamentals_pe ON fundamentals(pe_ratio);
CREATE INDEX IF NOT EXISTS idx_fundamentals_roe ON fundamentals(roe);

-- Sector Performance Table
CREATE TABLE IF NOT EXISTS sector_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sector TEXT NOT NULL,
    date TEXT NOT NULL,
    
    -- Performance Metrics
    price_return_1d REAL,
    price_return_1w REAL,
    price_return_1m REAL,
    price_return_3m REAL,
    price_return_1y REAL,
    
    -- Volume and Volatility
    avg_volume REAL,
    volatility REAL,
    
    -- Sentiment
    sector_sentiment REAL CHECK (sector_sentiment >= 0 AND sector_sentiment <= 1),
    news_count INTEGER DEFAULT 0,
    
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    UNIQUE(sector, date)
);

CREATE INDEX IF NOT EXISTS idx_sector_performance_sector ON sector_performance(sector);
CREATE INDEX IF NOT EXISTS idx_sector_performance_date ON sector_performance(date);

-- Market Indicators Table
CREATE TABLE IF NOT EXISTS market_indicators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    
    -- Major Indices
    sp500_close REAL,
    nasdaq_close REAL,
    dow_close REAL,
    nifty50_close REAL,
    sensex_close REAL,
    
    -- Market Breadth
    advance_decline_ratio REAL,
    new_highs INTEGER,
    new_lows INTEGER,
    
    -- Volatility
    vix_close REAL,
    india_vix_close REAL,
    
    -- Economic Indicators
    ten_year_yield REAL,
    dollar_index REAL,
    crude_oil_price REAL,
    gold_price REAL,
    
    -- Market Sentiment
    fear_greed_index REAL CHECK (fear_greed_index >= 0 AND fear_greed_index <= 100),
    put_call_ratio REAL,
    
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    UNIQUE(date)
);

CREATE INDEX IF NOT EXISTS idx_market_indicators_date ON market_indicators(date);

-- Recommendation Performance Tracking
CREATE TABLE IF NOT EXISTS recommendation_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recommendation_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    recommendation_date TEXT NOT NULL,
    
    -- Original Recommendation Details
    original_price REAL,
    recommended_action TEXT,
    target_price REAL,
    stop_loss REAL,
    time_horizon TEXT,
    
    -- Performance Tracking
    current_price REAL,
    price_change_percent REAL,
    days_since_recommendation INTEGER,
    
    -- Status
    status TEXT CHECK (status IN ('active', 'target_hit', 'stop_loss_hit', 'time_expired', 'manual_close')),
    actual_return REAL,
    
    -- Accuracy Metrics
    direction_correct INTEGER CHECK (direction_correct IN (0, 1)),
    target_achieved INTEGER CHECK (target_achieved IN (0, 1)),
    
    last_updated TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (recommendation_id) REFERENCES stock_recommendations(id)
);

CREATE INDEX IF NOT EXISTS idx_rec_performance_symbol ON recommendation_performance(symbol);
CREATE INDEX IF NOT EXISTS idx_rec_performance_status ON recommendation_performance(status);
CREATE INDEX IF NOT EXISTS idx_rec_performance_return ON recommendation_performance(actual_return DESC);

-- Model Performance Metrics
CREATE TABLE IF NOT EXISTS model_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_name TEXT NOT NULL,
    date TEXT NOT NULL,
    
    -- Performance Metrics
    accuracy REAL CHECK (accuracy >= 0 AND accuracy <= 1),
    precision_score REAL CHECK (precision_score >= 0 AND precision_score <= 1),
    recall REAL CHECK (recall >= 0 AND recall <= 1),
    f1_score REAL CHECK (f1_score >= 0 AND f1_score <= 1),
    
    -- Financial Performance
    total_recommendations INTEGER,
    profitable_recommendations INTEGER,
    avg_return REAL,
    max_return REAL,
    min_return REAL,
    
    -- Risk Metrics
    sharpe_ratio REAL,
    max_drawdown REAL,
    volatility REAL,
    
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    UNIQUE(model_name, date)
);

CREATE INDEX IF NOT EXISTS idx_model_performance_name ON model_performance(model_name);
CREATE INDEX IF NOT EXISTS idx_model_performance_accuracy ON model_performance(accuracy DESC);

-- Create views for easy querying

-- Recent Recommendations View
CREATE VIEW IF NOT EXISTS recent_recommendations AS
SELECT 
    sr.*,
    CASE 
        WHEN sr.score >= 60 THEN 'Strong'
        WHEN sr.score >= 20 THEN 'Moderate'
        WHEN sr.score >= -20 THEN 'Weak'
        ELSE 'Very Weak'
    END as strength,
    ROUND((julianday('now') - julianday(sr.created_at)) * 24, 2) as hours_old
FROM stock_recommendations sr
WHERE sr.created_at >= datetime('now', '-7 days')
ORDER BY sr.created_at DESC;

-- Top Performers View
CREATE VIEW IF NOT EXISTS top_performing_stocks AS
SELECT 
    sr.symbol,
    sr.action,
    sr.score,
    sr.confidence,
    sr.created_at,
    rp.actual_return,
    rp.status
FROM stock_recommendations sr
JOIN recommendation_performance rp ON sr.id = rp.recommendation_id
WHERE rp.actual_return IS NOT NULL
ORDER BY rp.actual_return DESC
LIMIT 20;

-- Portfolio Summary View
CREATE VIEW IF NOT EXISTS portfolio_summary AS
SELECT 
    pr.portfolio_id,
    pr.portfolio_score,
    pr.diversification_score,
    pr.risk_adjusted_return,
    COUNT(*) as recommendation_count,
    pr.created_at
FROM portfolio_recommendations pr
GROUP BY pr.portfolio_id
ORDER BY pr.portfolio_score DESC;

-- Insert sample data for testing

-- Sample market indicators
INSERT OR IGNORE INTO market_indicators (date, sp500_close, vix_close, fear_greed_index, put_call_ratio) 
VALUES 
    (date('now'), 4200.0, 18.5, 65.0, 0.85),
    (date('now', '-1 day'), 4180.0, 19.2, 62.0, 0.88),
    (date('now', '-2 days'), 4160.0, 20.1, 58.0, 0.92);

-- Sample sector performance
INSERT OR IGNORE INTO sector_performance (sector, date, price_return_1d, price_return_1w, price_return_1m, sector_sentiment) 
VALUES 
    ('Technology', date('now'), 1.2, 3.5, 8.2, 0.72),
    ('Healthcare', date('now'), 0.8, 2.1, 4.5, 0.65),
    ('Finance', date('now'), -0.5, -1.2, 2.3, 0.58),
    ('Energy', date('now'), 2.1, 5.8, 12.1, 0.78),
    ('Consumer', date('now'), 0.3, 1.8, 3.9, 0.62);

-- Sample fundamentals for BEL (your preferred stock)
INSERT OR IGNORE INTO fundamentals (
    symbol, date, pe_ratio, pb_ratio, roe, debt_to_equity, revenue_growth, eps_growth,
    industry_pe, piotroski_score, market_cap
) VALUES (
    'BEL.NS', date('now'), 18.5, 2.3, 0.15, 0.25, 0.12, 0.18, 
    22.1, 7, 85000000000
);

-- Commit the transaction
COMMIT;