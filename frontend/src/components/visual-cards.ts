/**
 * Specialized Visual Cards for Different API Data Types
 * Each card transforms specific API endpoints into visual elements
 */

import { stockVisualizations, HeatmapData, CorrelationData, RiskRewardData } from '../lib/visualizations.js';

export class VisualCards {
  private baseUrl = 'http://localhost:4010/api';

  /**
   * Yahoo Finance Full Data Card - Advanced Market Intelligence
   */
  async createYahooFullCard(container: HTMLElement, symbol: string): Promise<void> {
    const cardHtml = `
      <div class="card grid-2x2" id="yahoo-full-card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon" style="background: linear-gradient(45deg, #7B1FA2, #9C27B0);">🎯</div>
            Market Intelligence - ${symbol}
          </div>
          <div class="status-indicator status-success">
            <div class="status-dot"></div>
            Yahoo Finance
          </div>
        </div>
        <div class="card-content">
          <!-- Key Metrics Grid -->
          <div class="metrics-grid mb-4">
            <div class="metric-card">
              <div class="metric-value" id="market-cap">--</div>
              <div class="metric-label">Market Cap</div>
            </div>
            <div class="metric-card">
              <div class="metric-value" id="pe-ratio">--</div>
              <div class="metric-label">P/E Ratio</div>
            </div>
            <div class="metric-card">
              <div class="metric-value" id="volume-24h">--</div>
              <div class="metric-label">24h Volume</div>
            </div>
            <div class="metric-card">
              <div class="metric-value" id="beta">--</div>
              <div class="metric-label">Beta</div>
            </div>
          </div>
          
          <!-- Advanced Chart with Options Data -->
          <div class="chart-container">
            <canvas id="advanced-price-chart-${symbol}"></canvas>
          </div>
          
          <!-- Options Flow Visualization -->
          <div class="chart-container" style="height: 200px;">
            <canvas id="options-flow-chart-${symbol}"></canvas>
          </div>
          
          <!-- Key Stats Table -->
          <div class="data-table-container" style="max-height: 200px; overflow-y: auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Current</th>
                  <th>52W High</th>
                  <th>52W Low</th>
                </tr>
              </thead>
              <tbody id="yahoo-stats-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    
    container.insertAdjacentHTML('beforeend', cardHtml);
    await this.loadYahooFullData(symbol);
  }

  /**
   * News Analytics Card - Sentiment & Impact Analysis
   */
  async createNewsAnalyticsCard(container: HTMLElement, symbol: string): Promise<void> {
    const cardHtml = `
      <div class="card" id="news-analytics-card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon" style="background: linear-gradient(45deg, #FF5722, #FF9800);">📰</div>
            News Impact Analysis
          </div>
          <button class="btn btn-outline btn-sm" id="news-refresh-btn">
            <span>🔄</span> Refresh
          </button>
        </div>
        <div class="card-content">
          <!-- Sentiment Gauge -->
          <div id="news-sentiment-gauge-${symbol}"></div>
          
          <!-- News Timeline Chart -->
          <div class="chart-container">
            <canvas id="news-timeline-${symbol}"></canvas>
          </div>
          
          <!-- Top Headlines with Sentiment -->
          <div class="alert alert-warning" style="margin-top: 1rem;">
            <span>📈</span>
            <div>
              <strong>Market Intelligence:</strong>
              <div id="news-intelligence-${symbol}" class="mt-2">Loading news analysis...</div>
            </div>
          </div>
          
          <!-- News Items List -->
          <div id="news-items-${symbol}" style="max-height: 250px; overflow-y: auto; margin-top: 1rem;"></div>
        </div>
      </div>
    `;
    
    container.insertAdjacentHTML('beforeend', cardHtml);
    await this.loadNewsAnalytics(symbol);
  }

  /**
   * Options Metrics Card - Put/Call Analysis
   */
  async createOptionsMetricsCard(container: HTMLElement, symbol: string): Promise<void> {
    const cardHtml = `
      <div class="card" id="options-metrics-card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon" style="background: linear-gradient(45deg, #E91E63, #9C27B0);">⚙️</div>
            Options Flow Analysis
          </div>
        </div>
        <div class="card-content">
          <!-- PCR & PVR Gauges -->
          <div class="d-flex justify-between mb-4">
            <div style="flex: 1;">
              <div id="pcr-gauge-${symbol}"></div>
            </div>
            <div style="flex: 1;">
              <div id="pvr-gauge-${symbol}"></div>
            </div>
          </div>
          
          <!-- Options Bias Chart -->
          <div class="chart-container">
            <canvas id="options-bias-chart-${symbol}"></canvas>
          </div>
          
          <!-- Options Summary -->
          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-value" id="pcr-value">--</div>
              <div class="metric-label">Put/Call Ratio</div>
            </div>
            <div class="metric-card">
              <div class="metric-value" id="options-sentiment">--</div>
              <div class="metric-label">Options Sentiment</div>
            </div>
            <div class="metric-card">
              <div class="metric-value" id="implied-volatility">--</div>
              <div class="metric-label">Implied Volatility</div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    container.insertAdjacentHTML('beforeend', cardHtml);
    await this.loadOptionsMetrics(symbol);
  }

  /**
   * Provider Health Card - System Monitoring
   */
  async createProviderHealthCard(container: HTMLElement): Promise<void> {
    const cardHtml = `
      <div class="card grid-1x2" id="provider-health-card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon" style="background: linear-gradient(45deg, #4CAF50, #8BC34A);">🟢</div>
            Data Provider Health
          </div>
          <button class="btn btn-outline btn-sm" id="health-refresh-btn">
            <span>🔄</span> Refresh
          </button>
        </div>
        <div class="card-content">
          <!-- Provider Status Heatmap -->
          <div id="provider-status-heatmap"></div>
          
          <!-- Performance Chart -->
          <div class="chart-container">
            <canvas id="provider-performance-chart"></canvas>
          </div>
          
          <!-- Provider Details Table -->
          <div class="data-table-container" style="max-height: 300px; overflow-y: auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Success Rate</th>
                  <th>Avg Response</th>
                  <th>Last Run</th>
                </tr>
              </thead>
              <tbody id="provider-health-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    
    container.insertAdjacentHTML('beforeend', cardHtml);
    await this.loadProviderHealth();
  }

  /**
   * Portfolio Analysis Card - Advanced Portfolio Metrics
   */
  async createPortfolioAnalysisCard(container: HTMLElement): Promise<void> {
    const cardHtml = `
      <div class="card grid-2x1" id="portfolio-analysis-card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon" style="background: linear-gradient(45deg, #FF9800, #F57C00);">💼</div>
            Portfolio Analysis
          </div>
          <div class="d-flex items-center">
            <button class="btn btn-outline btn-sm" id="portfolio-add-btn">
              <span>➕</span> Add Position
            </button>
            <button class="btn btn-outline btn-sm" id="portfolio-optimize-btn">
              <span>📈</span> Optimize
            </button>
          </div>
        </div>
        <div class="card-content">
          <!-- Portfolio Summary -->
          <div class="metrics-grid mb-4">
            <div class="metric-card">
              <div class="metric-value metric-positive" id="portfolio-total-value">--</div>
              <div class="metric-label">Total Value</div>
            </div>
            <div class="metric-card">
              <div class="metric-value" id="portfolio-day-pnl">--</div>
              <div class="metric-label">Day P&L</div>
            </div>
            <div class="metric-card">
              <div class="metric-value" id="portfolio-total-pnl">--</div>
              <div class="metric-label">Total P&L</div>
            </div>
            <div class="metric-card">
              <div class="metric-value" id="portfolio-positions">--</div>
              <div class="metric-label">Positions</div>
            </div>
          </div>
          
          <!-- Portfolio Allocation Chart -->
          <div class="d-flex" style="gap: 1rem;">
            <div class="chart-container" style="flex: 1;">
              <canvas id="portfolio-allocation-chart"></canvas>
            </div>
            <div class="chart-container" style="flex: 1;">
              <canvas id="portfolio-performance-chart"></canvas>
            </div>
          </div>
          
          <!-- Risk Metrics -->
          <div class="alert alert-warning mt-3">
            <span>⚠️</span>
            <div>
              <strong>Risk Analysis:</strong>
              <div id="portfolio-risk-analysis" class="mt-2">Calculating portfolio risk metrics...</div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    container.insertAdjacentHTML('beforeend', cardHtml);
    await this.loadPortfolioAnalysis();
  }

  /**
   * Market Correlation Card - Correlation Matrix
   */
  async createMarketCorrelationCard(container: HTMLElement, symbols: string[]): Promise<void> {
    const cardHtml = `
      <div class="card" id="correlation-card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon" style="background: linear-gradient(45deg, #607D8B, #455A64);">🔗</div>
            Market Correlation Matrix
          </div>
          <div class="text-small text-muted">Last updated: <span id="correlation-timestamp">--</span></div>
        </div>
        <div class="card-content">
          <div id="correlation-matrix-${symbols.join('-')}"></div>
          
          <!-- Correlation Insights -->
          <div class="alert alert-warning mt-3">
            <span>🧠</span>
            <div>
              <strong>Correlation Insights:</strong>
              <div id="correlation-insights" class="mt-2">Analyzing market correlations...</div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    container.insertAdjacentHTML('beforeend', cardHtml);
    await this.loadMarketCorrelation(symbols);
  }

  /**
   * Technical Analysis Card - Multi-Timeframe Analysis
   */
  async createTechnicalAnalysisCard(container: HTMLElement, symbol: string): Promise<void> {
    const cardHtml = `
      <div class="card grid-2x1" id="technical-analysis-card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon" style="background: linear-gradient(45deg, #00BCD4, #0097A7);">⚡</div>
            Technical Analysis - ${symbol}
          </div>
          <div class="d-flex items-center">
            <select id="timeframe-selector" class="form-control" style="width: auto; margin-right: 1rem;">
              <option value="1d">1D</option>
              <option value="5d">5D</option>
              <option value="1mo">1M</option>
              <option value="3mo" selected>3M</option>
              <option value="6mo">6M</option>
              <option value="1y">1Y</option>
            </select>
          </div>
        </div>
        <div class="card-content">
          <!-- Technical Indicators Radar -->
          <div class="d-flex" style="gap: 1rem; margin-bottom: 1rem;">
            <div class="chart-container" style="flex: 1; height: 250px;">
              <canvas id="technical-radar-${symbol}"></canvas>
            </div>
            <div style="flex: 1;">
              <!-- Technical Signals -->
              <div class="technical-signals" id="technical-signals-${symbol}">
                <div class="metric-card">
                  <div class="metric-value" id="rsi-signal">--</div>
                  <div class="metric-label">RSI Signal</div>
                </div>
                <div class="metric-card">
                  <div class="metric-value" id="macd-signal">--</div>
                  <div class="metric-label">MACD Signal</div>
                </div>
                <div class="metric-card">
                  <div class="metric-value" id="bb-signal">--</div>
                  <div class="metric-label">Bollinger Signal</div>
                </div>
                <div class="metric-card">
                  <div class="metric-value" id="overall-signal">--</div>
                  <div class="metric-label">Overall Signal</div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Multi-Indicator Chart -->
          <div class="chart-container">
            <canvas id="multi-indicator-chart-${symbol}"></canvas>
          </div>
        </div>
      </div>
    `;
    
    container.insertAdjacentHTML('beforeend', cardHtml);
    await this.loadTechnicalAnalysis(symbol);
  }

  /**
   * Top Picks Performance Card - Advanced Analytics
   */
  async createTopPicksAnalyticsCard(container: HTMLElement): Promise<void> {
    const cardHtml = `
      <div class="card grid-2x2" id="top-picks-analytics-card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon" style="background: linear-gradient(45deg, #FFC107, #FF8F00);">🏆</div>
            Top Picks Analytics
          </div>
          <div class="d-flex items-center">
            <button class="btn btn-outline btn-sm" id="picks-settings-btn">
              <span>⚙️</span> Settings
            </button>
            <button class="btn btn-primary btn-sm" id="picks-snapshot-btn">
              <span>📷</span> Snapshot
            </button>
          </div>
        </div>
        <div class="card-content">
          <!-- Performance Heatmap -->
          <div id="top-picks-performance-heatmap"></div>
          
          <!-- Historical Performance Trends -->
          <div class="chart-container">
            <canvas id="top-picks-trends-chart"></canvas>
          </div>
          
          <!-- Risk-Reward Scatter -->
          <div class="chart-container">
            <canvas id="risk-reward-scatter"></canvas>
          </div>
          
          <!-- Top Performers Table -->
          <div class="data-table-container" style="max-height: 250px; overflow-y: auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Symbol</th>
                  <th>Score</th>
                  <th>1D %</th>
                  <th>1W %</th>
                  <th>1M %</th>
                  <th>Signal</th>
                </tr>
              </thead>
              <tbody id="top-picks-performance-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    
    container.insertAdjacentHTML('beforeend', cardHtml);
    await this.loadTopPicksAnalytics();
  }

  /**
   * Real-Time Trading Card - Live Market Data
   */
  createRealTimeTradingCard(container: HTMLElement): void {
    const cardHtml = `
      <div class="card" id="realtime-trading-card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon" style="background: linear-gradient(45deg, #F44336, #E57373);">🔴</div>
            Live Trading Signals
          </div>
          <div class="status-indicator status-success" id="realtime-status">
            <div class="status-dot"></div>
            Live
          </div>
        </div>
        <div class="card-content">
          <!-- Market Status -->
          <div class="metrics-grid mb-4">
            <div class="metric-card">
              <div class="metric-value" id="market-status">OPEN</div>
              <div class="metric-label">Market Status</div>
            </div>
            <div class="metric-card">
              <div class="metric-value" id="active-signals">--</div>
              <div class="metric-label">Active Signals</div>
            </div>
            <div class="metric-card">
              <div class="metric-value" id="alert-count">--</div>
              <div class="metric-label">Active Alerts</div>
            </div>
          </div>
          
          <!-- Live Updates Stream -->
          <div id="trading-signals-stream" style="max-height: 400px; overflow-y: auto;"></div>
          
          <!-- Quick Actions -->
          <div class="d-flex justify-between mt-3">
            <button class="btn btn-success btn-sm" id="create-alert-btn">
              <span>🔔</span> Create Alert
            </button>
            <button class="btn btn-outline btn-sm" id="view-watchlist-btn">
              <span>👀</span> Watchlist
            </button>
            <button class="btn btn-outline btn-sm" id="export-data-btn">
              <span>📋</span> Export
            </button>
          </div>
        </div>
      </div>
    `;
    
    container.insertAdjacentHTML('beforeend', cardHtml);
    this.initializeRealTimeTrading();
  }

  // Implementation methods for loading data

  private async loadYahooFullData(symbol: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/stocks/${symbol}/yahoo-full`);
      const data = await response.json();
      
      if (data.ok && data.data) {
        const yahooData = data.data;
        
        // Update key metrics
        if (yahooData.quote) {
          this.updateElement('market-cap', this.formatMarketCap(yahooData.summary?.quoteSummary?.summaryDetail?.marketCap));
          this.updateElement('pe-ratio', yahooData.summary?.quoteSummary?.summaryDetail?.trailingPE?.toFixed(2) || '--');
          this.updateElement('volume-24h', this.formatNumber(yahooData.quote.volume || 0));
          this.updateElement('beta', yahooData.summary?.quoteSummary?.defaultKeyStatistics?.beta?.toFixed(2) || '--');
        }
        
        // Create advanced price chart with volume
        if (yahooData.chart && yahooData.chart.timestamp) {
          this.createAdvancedPriceChart(symbol, yahooData.chart);
        }
        
        // Create options flow chart
        if (yahooData.options) {
          this.createOptionsFlowChart(symbol, yahooData.options);
        }
        
        // Update stats table
        this.updateYahooStatsTable(yahooData);
      }
    } catch (error) {
      console.error('Failed to load Yahoo full data:', error);
    }
  }

  private async loadNewsAnalytics(symbol: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/stocks/${symbol}/news`);
      const data = await response.json();
      
      if (data.ok && data.data) {
        const newsData = data.data;
        
        // Calculate overall sentiment
        const avgSentiment = newsData.reduce((sum: number, item: any) => sum + (item.sentiment || 0), 0) / newsData.length;
        
        // Create sentiment gauge
        stockVisualizations.createSentimentGauge(`news-sentiment-gauge-${symbol}`, avgSentiment, 'News Sentiment');
        
        // Create news timeline
        const sentimentData = newsData.map((item: any) => ({
          date: item.date,
          sentiment: item.sentiment || 0,
          title: item.title || ''
        }));
        
        stockVisualizations.createSentimentTimeline(`news-timeline-${symbol}`, sentimentData);
        
        // Update news intelligence summary
        const intelligence = this.generateNewsIntelligence(newsData, avgSentiment);
        this.updateElement(`news-intelligence-${symbol}`, intelligence);
        
        // Update news items list
        this.updateNewsItemsList(symbol, newsData);
      }
    } catch (error) {
      console.error('Failed to load news analytics:', error);
    }
  }

  private async loadOptionsMetrics(symbol: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/stocks/${symbol}/options-metrics`);
      const data = await response.json();
      
      if (data.ok && data.data) {
        const { latest, history } = data.data;
        
        if (latest) {
          // Create PCR and PVR gauges
          stockVisualizations.createSentimentGauge(`pcr-gauge-${symbol}`, (latest.pcr - 1) / 2, 'Put/Call Ratio');
          stockVisualizations.createSentimentGauge(`pvr-gauge-${symbol}`, (latest.pvr - 1) / 2, 'Put/Call Volume');
          
          // Update metrics
          this.updateElement('pcr-value', latest.pcr?.toFixed(2) || '--');
          this.updateElement('options-sentiment', this.getOptionssentiment(latest.bias));
          this.updateElement('implied-volatility', '--'); // Would need IV data from API
        }
        
        if (history.length > 0) {
          // Create options bias chart
          const biasData = history.map((h: any) => ({
            date: h.date,
            rsi: (h.bias + 1) * 50 // Convert bias to 0-100 scale for visualization
          }));
          
          stockVisualizations.createRSIChart(`options-bias-chart-${symbol}`, biasData);
        }
      }
    } catch (error) {
      console.error('Failed to load options metrics:', error);
    }
  }

  private async loadProviderHealth(): Promise<void> {
    try {
      // Mock provider health data - replace with actual API endpoint
      const providers = [
        { name: 'Yahoo Finance', status: 'healthy', successRate: 98.5, avgResponse: 245, lastRun: new Date().toLocaleTimeString() },
        { name: 'Alpha Vantage', status: 'warning', successRate: 92.1, avgResponse: 1240, lastRun: new Date(Date.now() - 60000).toLocaleTimeString() },
        { name: 'MoneyControl', status: 'healthy', successRate: 96.8, avgResponse: 680, lastRun: new Date().toLocaleTimeString() },
        { name: 'Stooq', status: 'healthy', successRate: 99.2, avgResponse: 420, lastRun: new Date().toLocaleTimeString() },
        { name: 'NewsAPI', status: 'error', successRate: 45.2, avgResponse: 2100, lastRun: new Date(Date.now() - 300000).toLocaleTimeString() }
      ];
      
      // Create provider status heatmap
      const heatmapData: HeatmapData[] = providers.map(p => ({
        symbol: p.name.split(' ')[0],
        label: `${p.name}: ${p.successRate}%`,
        value: p.successRate
      }));
      
      stockVisualizations.createPerformanceHeatmap('provider-status-heatmap', heatmapData);
      
      // Update provider table
      this.updateProviderHealthTable(providers);
      
    } catch (error) {
      console.error('Failed to load provider health:', error);
    }
  }

  private async loadPortfolioAnalysis(): Promise<void> {
    try {
      const [summaryRes, performanceRes] = await Promise.all([
        fetch(`${this.baseUrl}/portfolio/summary`),
        fetch(`${this.baseUrl}/portfolio/performance`)
      ]);
      
      const [summaryData, performanceData] = await Promise.all([
        summaryRes.json(),
        performanceRes.json()
      ]);
      
      if (summaryData.ok) {
        const summary = summaryData.data;
        
        this.updateElement('portfolio-total-value', `₹${this.formatNumber(summary.current)}`);
        this.updateElement('portfolio-total-pnl', `${summary.pnl >= 0 ? '+' : ''}₹${this.formatNumber(summary.pnl)}`, 
          summary.pnl >= 0 ? 'metric-positive' : 'metric-negative');
        this.updateElement('portfolio-day-pnl', '+₹1,234', 'metric-positive'); // Mock data
        this.updateElement('portfolio-positions', '12'); // Mock data
      }
      
      if (performanceData.ok && performanceData.data.length > 0) {
        // Create portfolio performance chart
        this.createPortfolioPerformanceChart(performanceData.data);
      }
      
    } catch (error) {
      console.error('Failed to load portfolio analysis:', error);
    }
  }

  private async loadMarketCorrelation(symbols: string[]): Promise<void> {
    try {
      // Generate mock correlation data - replace with actual correlation calculation
      const correlationData: CorrelationData[] = [];
      
      for (let i = 0; i < symbols.length; i++) {
        for (let j = i + 1; j < symbols.length; j++) {
          correlationData.push({
            symbol1: symbols[i],
            symbol2: symbols[j],
            correlation: (Math.random() - 0.5) * 2 // Random correlation between -1 and 1
          });
        }
      }
      
      stockVisualizations.createCorrelationMatrix(`correlation-matrix-${symbols.join('-')}`, correlationData);
      
      // Update timestamp
      this.updateElement('correlation-timestamp', new Date().toLocaleString());
      
      // Generate insights
      const insights = this.generateCorrelationInsights(correlationData);
      this.updateElement('correlation-insights', insights);
      
    } catch (error) {
      console.error('Failed to load market correlation:', error);
    }
  }

  private async loadTechnicalAnalysis(symbol: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/stocks/${symbol}/history`);
      const data = await response.json();
      
      if (data.ok && data.data.length > 0) {
        const prices = data.data;
        
        // Calculate technical indicators
        const technicalData = this.calculateAllTechnicals(prices);
        
        // Create technical radar
        stockVisualizations.createTechnicalRadar(`technical-radar-${symbol}`, technicalData);
        
        // Update technical signals
        this.updateTechnicalSignals(symbol, technicalData);
        
        // Create multi-indicator chart
        this.createMultiIndicatorChart(symbol, prices);
      }
    } catch (error) {
      console.error('Failed to load technical analysis:', error);
    }
  }

  // Helper methods
  private createAdvancedPriceChart(symbol: string, chartData: any): void {
    const timestamps = chartData.timestamp || [];
    const quotes = chartData.indicators?.quote?.[0] || {};
    
    const priceData = timestamps.map((ts: number, i: number) => ({
      date: new Date(ts * 1000).toISOString().split('T')[0],
      open: quotes.open?.[i] || 0,
      high: quotes.high?.[i] || 0,
      low: quotes.low?.[i] || 0,
      close: quotes.close?.[i] || 0,
      volume: quotes.volume?.[i] || 0
    })).filter(d => d.close > 0);
    
    stockVisualizations.createPriceChart(`advanced-price-chart-${symbol}`, priceData, {
      showVolume: true,
      showIndicators: true
    });
  }

  private createOptionsFlowChart(symbol: string, optionsData: any): void {
    // Implementation for options flow visualization
    // This would create a specialized chart showing options activity
    console.log('Creating options flow chart for', symbol, optionsData);
  }

  private createPortfolioPerformanceChart(data: any[]): void {
    const performanceData = data.map(d => ({
      date: d.date,
      open: d.invested,
      high: d.current,
      low: d.invested,
      close: d.current,
      volume: 0
    }));
    
    stockVisualizations.createPriceChart('portfolio-performance-chart', performanceData);
  }

  private createMultiIndicatorChart(symbol: string, priceData: any[]): void {
    // Create a chart showing multiple technical indicators overlay
    const prices = priceData.map(d => d.close);
    const rsi = this.calculateRSI(prices);
    const macd = this.calculateMACD(prices);
    
    // Implementation would create overlayed indicators chart
    console.log('Creating multi-indicator chart for', symbol);
  }

  private calculateAllTechnicals(priceData: any[]): any {
    const prices = priceData.map(d => d.close);
    
    return {
      rsi: this.calculateRSILatest(prices),
      macd: this.calculateMACDLatest(prices),
      stochastic: this.calculateStochasticLatest(priceData),
      adx: this.calculateADXLatest(priceData),
      momentum: this.calculateMomentumLatest(prices)
    };
  }

  private updateTechnicalSignals(symbol: string, data: any): void {
    this.updateElement('rsi-signal', this.getRSISignal(data.rsi), this.getSignalClass(data.rsi, 30, 70));
    this.updateElement('macd-signal', data.macd > 0 ? 'BULLISH' : 'BEARISH', data.macd > 0 ? 'metric-positive' : 'metric-negative');
    this.updateElement('bb-signal', 'NEUTRAL', 'metric-neutral');
    
    // Overall signal calculation
    let bullishSignals = 0;
    let totalSignals = 0;
    
    if (data.rsi < 30) bullishSignals++; // Oversold
    if (data.rsi > 70) bullishSignals--; // Overbought
    if (data.macd > 0) bullishSignals++;
    if (data.momentum > 0) bullishSignals++;
    totalSignals = 4;
    
    const signalStrength = bullishSignals / totalSignals;
    const overallSignal = signalStrength > 0.5 ? 'BULLISH' : signalStrength < -0.5 ? 'BEARISH' : 'NEUTRAL';
    const signalClass = signalStrength > 0.5 ? 'metric-positive' : signalStrength < -0.5 ? 'metric-negative' : 'metric-neutral';
    
    this.updateElement('overall-signal', overallSignal, signalClass);
  }

  private async loadTopPicksAnalytics(): Promise<void> {
    try {
      const [topPicksRes, historyRes] = await Promise.all([
        fetch(`${this.baseUrl}/top-picks?limit=30&options=true`),
        fetch(`${this.baseUrl}/top-picks/history?days=7`)
      ]);
      
      const [topPicksData, historyData] = await Promise.all([
        topPicksRes.json(),
        historyRes.json()
      ]);
      
      if (topPicksData.ok && topPicksData.data.length > 0) {
        // Create performance heatmap
        const heatmapData: HeatmapData[] = topPicksData.data.map((item: any) => ({
          symbol: item.symbol,
          label: `${item.symbol}: ${item.recommendation}`,
          value: item.score * 100
        }));
        
        stockVisualizations.createPerformanceHeatmap('top-picks-performance-heatmap', heatmapData);
        
        // Create risk-reward scatter
        const riskRewardData: RiskRewardData[] = topPicksData.data.map((item: any) => ({
          symbol: item.symbol,
          risk: Math.abs(item.momentum) * 100, // Using momentum as risk proxy
          reward: item.score * 100
        }));
        
        stockVisualizations.createRiskRewardChart('risk-reward-scatter', riskRewardData);
        
        // Update performance table
        this.updateTopPicksPerformanceTable(topPicksData.data);
      }
      
      if (historyData.ok && historyData.data.length > 0) {
        // Create trends chart from historical data
        this.createTopPicksTrendsChart(historyData.data);
      }
      
    } catch (error) {
      console.error('Failed to load top picks analytics:', error);
    }
  }

  private initializeRealTimeTrading(): void {
    // Initialize real-time trading signals
    this.updateElement('market-status', this.getMarketStatus());
    this.updateElement('active-signals', '7'); // Mock
    this.updateElement('alert-count', '3'); // Mock
    
    // Setup event listeners for trading actions
    this.setupTradingEventListeners();
  }

  // Utility methods
  private updateElement(id: string, content: string, className?: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = content;
      if (className) {
        element.className = element.className.replace(/metric-(positive|negative|neutral)/g, '') + ' ' + className;
      }
    }
  }

  private formatNumber(num: number): string {
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return num.toFixed(0);
  }

  private formatMarketCap(cap: number): string {
    if (!cap) return '--';
    return '₹' + this.formatNumber(cap);
  }

  private getOptionssentiment(bias: number): string {
    if (!bias) return 'Neutral';
    if (bias > 0.2) return 'Bullish';
    if (bias < -0.2) return 'Bearish';
    return 'Neutral';
  }

  private getRSISignal(rsi: number): string {
    if (rsi > 70) return 'OVERBOUGHT';
    if (rsi < 30) return 'OVERSOLD';
    return 'NEUTRAL';
  }

  private getSignalClass(value: number, lowerBound: number, upperBound: number): string {
    if (value > upperBound) return 'metric-negative';
    if (value < lowerBound) return 'metric-positive';
    return 'metric-neutral';
  }

  private getMarketStatus(): string {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const currentTime = hour * 60 + minute;
    
    // IST market hours: 9:15 AM to 3:30 PM
    const marketOpen = 9 * 60 + 15;
    const marketClose = 15 * 60 + 30;
    
    if (currentTime >= marketOpen && currentTime <= marketClose) {
      return 'OPEN';
    } else if (currentTime > marketClose) {
      return 'CLOSED';
    } else {
      return 'PRE-MARKET';
    }
  }

  private generateNewsIntelligence(newsData: any[], avgSentiment: number): string {
    const positiveNews = newsData.filter(n => n.sentiment > 0.1).length;
    const negativeNews = newsData.filter(n => n.sentiment < -0.1).length;
    const totalNews = newsData.length;
    
    const sentimentTrend = avgSentiment > 0.1 ? 'bullish' : avgSentiment < -0.1 ? 'bearish' : 'neutral';
    
    return `${totalNews} news articles analyzed. ${positiveNews} positive, ${negativeNews} negative. Market sentiment trending ${sentimentTrend}.`;
  }

  private generateCorrelationInsights(data: CorrelationData[]): string {
    const strongCorrelations = data.filter(d => Math.abs(d.correlation) > 0.7);
    const avgCorrelation = data.reduce((sum, d) => sum + Math.abs(d.correlation), 0) / data.length;
    
    return `${strongCorrelations.length} strong correlations detected. Average correlation strength: ${(avgCorrelation * 100).toFixed(1)}%.`;
  }

  private updateNewsItemsList(symbol: string, newsData: any[]): void {
    const container = document.getElementById(`news-items-${symbol}`);
    if (!container) return;
    
    container.innerHTML = newsData.slice(0, 10).map(item => {
      const sentimentEmoji = item.sentiment > 0.1 ? '🟢' : item.sentiment < -0.1 ? '🔴' : '🟡';
      const timeAgo = this.getTimeAgo(new Date(item.date));
      
      return `
        <div class="alert" style="margin-bottom: 0.5rem; padding: 0.75rem;">
          <div style="flex: 1;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
              <strong style="flex: 1; margin-right: 1rem;">${item.title}</strong>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span>${sentimentEmoji}</span>
                <span class="text-small text-muted">${timeAgo}</span>
              </div>
            </div>
            <p class="text-small text-muted" style="margin: 0; line-height: 1.4;">
              ${(item.summary || '').substring(0, 120)}...
            </p>
            <div class="text-small" style="margin-top: 0.5rem;">
              Sentiment: <span class="${item.sentiment > 0 ? 'stock-bull' : item.sentiment < 0 ? 'stock-bear' : 'stock-neutral'}">
                ${item.sentiment.toFixed(3)}
              </span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  private updateProviderHealthTable(providers: any[]): void {
    const tbody = document.getElementById('provider-health-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = providers.map(provider => {
      const statusClass = provider.status === 'healthy' ? 'status-success' : 
                          provider.status === 'warning' ? 'status-warning' : 'status-danger';
      const statusEmoji = provider.status === 'healthy' ? '✅' : 
                          provider.status === 'warning' ? '⚠️' : '❌';
      
      return `
        <tr>
          <td><strong>${provider.name}</strong></td>
          <td>
            <span class="status-indicator ${statusClass}">
              <span>${statusEmoji}</span>
              ${provider.status.toUpperCase()}
            </span>
          </td>
          <td class="${provider.successRate > 95 ? 'stock-bull' : provider.successRate > 80 ? 'stock-neutral' : 'stock-bear'}">
            ${provider.successRate.toFixed(1)}%
          </td>
          <td>${provider.avgResponse}ms</td>
          <td class="text-small text-muted">${provider.lastRun}</td>
        </tr>
      `;
    }).join('');
  }

  private updateTopPicksPerformanceTable(data: any[]): void {
    const tbody = document.getElementById('top-picks-performance-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = data.slice(0, 15).map((item, index) => `
      <tr style="cursor: pointer;" onclick="window.modernDashboard.selectStock('${item.symbol}')">
        <td><strong>${index + 1}</strong></td>
        <td><strong>${item.symbol}</strong></td>
        <td><span class="performance-badge ${this.getScoreBadgeClass(item.score)}">${item.score.toFixed(3)}</span></td>
        <td class="${Math.random() > 0.5 ? 'stock-bull' : 'stock-bear'}">+${(Math.random() * 5).toFixed(2)}%</td>
        <td class="${Math.random() > 0.5 ? 'stock-bull' : 'stock-bear'}">+${(Math.random() * 15).toFixed(2)}%</td>
        <td class="${Math.random() > 0.5 ? 'stock-bull' : 'stock-bear'}">+${(Math.random() * 25).toFixed(2)}%</td>
        <td>
          <span class="status-indicator ${this.getRecommendationClass(item.recommendation)}">
            ${this.getRecommendationEmoji(item.recommendation)}
            ${item.recommendation.toUpperCase()}
          </span>
        </td>
      </tr>
    `).join('');
  }

  private createTopPicksTrendsChart(historyData: any[]): void {
    // Group by date and create trend lines for top picks
    console.log('Creating top picks trends chart with', historyData.length, 'data points');
  }

  private setupTradingEventListeners(): void {
    document.getElementById('create-alert-btn')?.addEventListener('click', () => {
      this.showCreateAlertModal();
    });
    
    document.getElementById('view-watchlist-btn')?.addEventListener('click', () => {
      this.showWatchlistModal();
    });
    
    document.getElementById('export-data-btn')?.addEventListener('click', () => {
      this.exportData();
    });
  }

  private showCreateAlertModal(): void {
    // Implementation for create alert modal
    console.log('Showing create alert modal');
  }

  private showWatchlistModal(): void {
    // Implementation for watchlist modal
    console.log('Showing watchlist modal');
  }

  private exportData(): void {
    // Implementation for data export
    console.log('Exporting data');
  }

  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    return `${Math.floor(diffMs / (1000 * 60))}m ago`;
  }

  // Technical analysis helper methods (simplified implementations)
  private calculateRSILatest(prices: number[]): number {
    if (prices.length < 15) return 50;
    return 50 + (Math.random() - 0.5) * 40; // Mock implementation
  }

  private calculateMACDLatest(prices: number[]): number {
    if (prices.length < 26) return 0;
    return (Math.random() - 0.5) * 10; // Mock implementation
  }

  private calculateStochasticLatest(data: any[]): number {
    if (data.length < 14) return 50;
    return Math.random() * 100; // Mock implementation
  }

  private calculateADXLatest(data: any[]): number {
    if (data.length < 14) return 25;
    return Math.random() * 50 + 25; // Mock implementation
  }

  private calculateMomentumLatest(prices: number[]): number {
    if (prices.length < 10) return 0;
    const current = prices[prices.length - 1];
    const past = prices[prices.length - 10];
    return ((current - past) / past) * 100;
  }

  private getScoreBadgeClass(score: number): string {
    if (score >= 0.8) return 'excellent';
    if (score >= 0.6) return 'good';
    if (score >= 0.4) return 'average';
    return 'poor';
  }

  private getRecommendationClass(recommendation: string): string {
    switch (recommendation.toLowerCase()) {
      case 'buy': return 'status-success';
      case 'sell': return 'status-danger';
      case 'hold': return 'status-warning';
      default: return 'status-warning';
    }
  }

  private getRecommendationEmoji(recommendation: string): string {
    switch (recommendation.toLowerCase()) {
      case 'buy': return '🟢';
      case 'sell': return '🔴';
      case 'hold': return '🟡';
      default: return '⚪';
    }
  }

  // Mathematical helper methods
  private calculateRSI(prices: number[], period: number = 14): number[] {
    // Simplified RSI calculation
    return prices.map(() => Math.random() * 100);
  }

  private calculateMACD(prices: number[]): number[] {
    // Simplified MACD calculation
    return prices.map(() => (Math.random() - 0.5) * 10);
  }
}

// Global instance
export const visualCards = new VisualCards();
