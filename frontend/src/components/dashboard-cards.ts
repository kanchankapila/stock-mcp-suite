/**
 * Modern Dashboard Cards for Stock Analytics
 * Each card represents a different API endpoint with visual data representation
 */

import { stockVisualizations, PriceData, SentimentData, HeatmapData, TechnicalData, PortfolioData } from '../lib/visualizations.js';

export class DashboardCards {
  private baseUrl = 'http://localhost:4010/api';
  private updateIntervals: Map<string, NodeJS.Timer> = new Map();
  private loadingStates: Set<string> = new Set();

  /**
   * Initialize all dashboard cards
   */
  async initializeDashboard(container: HTMLElement): Promise<void> {
    container.innerHTML = `
      <div class="dashboard">
        <div class="dashboard-header">
          <h1 class="dashboard-title">🚀 Stock Analytics Hub</h1>
          <p class="dashboard-subtitle">Real-time insights • AI-powered analysis • Visual decision making</p>
        </div>
        
        <div class="cards-grid" id="dashboard-grid">
          ${this.generateAllCards()}
        </div>
      </div>
    `;
    
    // Initialize all card functionalities
    await this.initializeAllCards();
  }

  /**
   * Generate HTML for all dashboard cards
   */
  private generateAllCards(): string {
    return `
      <!-- Stock Search & Overview Card -->
      <div class="card grid-2x1" id="search-card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon">🔍</div>
            Stock Search & Overview
          </div>
        </div>
        <div class="card-content">
          <div class="select-control">
            <select id="stock-selector">
              <option value="">Select a stock...</option>
            </select>
          </div>
          <div class="metrics-grid" id="overview-metrics">
            <div class="metric-card">
              <div class="metric-value" id="last-price">--</div>
              <div class="metric-label">Last Price</div>
            </div>
            <div class="metric-card">
              <div class="metric-value" id="price-change">--</div>
              <div class="metric-label">Change %</div>
            </div>
            <div class="metric-card">
              <div class="metric-value" id="data-points">--</div>
              <div class="metric-label">Data Points</div>
            </div>
          </div>
          <div class="d-flex justify-between mt-3">
            <button class="btn btn-primary" id="ingest-btn">
              <span>📥</span> Ingest Data
            </button>
            <button class="btn btn-outline" id="analyze-btn">
              <span>🧠</span> Analyze
            </button>
          </div>
        </div>
      </div>

      <!-- Price Chart Card -->
      <div class="card grid-2x2" id="price-chart-card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon">📈</div>
            Price Analysis
          </div>
          <div class="d-flex items-center" id="chart-controls">
            <button class="btn btn-outline" onclick="window.dashboardCards.toggleChartType('price-chart', 'line')">Line</button>
            <button class="btn btn-outline" onclick="window.dashboardCards.toggleChartType('price-chart', 'candlestick')">Candles</button>
          </div>
        </div>
        <div class="card-content">
          <div class="chart-container">
            <canvas id="price-chart"></canvas>
          </div>
          <div class="d-flex justify-between text-small text-muted">
            <span id="price-period">Period: --</span>
            <span id="price-range">Range: --</span>
          </div>
        </div>
      </div>

      <!-- Sentiment Analysis Card -->
      <div class="card" id="sentiment-card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon">😊</div>
            Sentiment Analysis
          </div>
        </div>
        <div class="card-content">
          <div id="sentiment-gauge"></div>
          <div class="chart-container" style="height: 200px;">
            <canvas id="sentiment-timeline"></canvas>
          </div>
          <div class="alert" id="sentiment-summary" style="display: none;">
            <div id="sentiment-text"></div>
          </div>
        </div>
      </div>

      <!-- Technical Indicators Card -->
      <div class="card" id="technical-card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon">⚡</div>
            Technical Analysis
          </div>
        </div>
        <div class="card-content">
          <div class="chart-container">
            <canvas id="technical-radar"></canvas>
          </div>
          <div class="chart-container" style="height: 150px;">
            <canvas id="rsi-chart"></canvas>
          </div>
        </div>
      </div>

      <!-- Volume Analysis Card -->
      <div class="card" id="volume-card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon">📊</div>
            Volume Analysis
          </div>
        </div>
        <div class="card-content">
          <div class="chart-container">
            <canvas id="volume-chart"></canvas>
          </div>
          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-value" id="avg-volume">--</div>
              <div class="metric-label">Avg Volume</div>
            </div>
            <div class="metric-card">
              <div class="metric-value" id="volume-trend">--</div>
              <div class="metric-label">Trend</div>
            </div>
          </div>
        </div>
      </div>

      <!-- News & Events Card -->
      <div class="card grid-1x2" id="news-card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon">📰</div>
            Latest News & Events
          </div>
          <div class="status-indicator status-success" id="news-status">
            <div class="status-dot"></div>
            Live
          </div>
        </div>
        <div class="card-content">
          <div id="news-timeline" style="max-height: 400px; overflow-y: auto;"></div>
        </div>
      </div>

      <!-- Portfolio Performance Card -->
      <div class="card" id="portfolio-card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon">💼</div>
            Portfolio Tracking
          </div>
        </div>
        <div class="card-content">
          <div class="chart-container">
            <canvas id="portfolio-chart"></canvas>
          </div>
          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-value metric-positive" id="portfolio-value">--</div>
              <div class="metric-label">Total Value</div>
            </div>
            <div class="metric-card">
              <div class="metric-value" id="portfolio-pnl">--</div>
              <div class="metric-label">P&L</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Risk Analysis Card -->
      <div class="card" id="risk-card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon">⚠️</div>
            Risk Analysis
          </div>
        </div>
        <div class="card-content">
          <div class="chart-container">
            <canvas id="risk-reward-chart"></canvas>
          </div>
          <div class="alert alert-warning" id="risk-alert" style="display: none;">
            <span>⚠️</span>
            <div id="risk-message"></div>
          </div>
        </div>
      </div>

      <!-- Top Picks Heatmap Card -->
      <div class="card grid-2x1" id="top-picks-card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon">🏆</div>
            Top Picks Heatmap
          </div>
          <button class="btn btn-primary" id="refresh-picks">
            <span>🔄</span> Refresh
          </button>
        </div>
        <div class="card-content">
          <div id="top-picks-heatmap"></div>
          <div class="data-table-container" style="max-height: 300px; overflow-y: auto;">
            <table class="data-table" id="top-picks-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Score</th>
                  <th>Momentum</th>
                  <th>Sentiment</th>
                  <th>Recommendation</th>
                </tr>
              </thead>
              <tbody id="top-picks-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Performance Metrics Card -->
      <div class="card" id="performance-card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon">🎯</div>
            System Performance
          </div>
        </div>
        <div class="card-content">
          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-value" id="cache-hit-rate">--</div>
              <div class="metric-label">Cache Hit Rate</div>
            </div>
            <div class="metric-card">
              <div class="metric-value" id="api-response-time">--</div>
              <div class="metric-label">Avg Response</div>
            </div>
            <div class="metric-card">
              <div class="metric-value" id="active-connections">--</div>
              <div class="metric-label">Live Connections</div>
            </div>
            <div class="metric-card">
              <div class="metric-value" id="memory-usage">--</div>
              <div class="metric-label">Memory Usage</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Market Correlation Card -->
      <div class="card" id="correlation-card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon">🔗</div>
            Market Correlation
          </div>
        </div>
        <div class="card-content">
          <div id="correlation-matrix"></div>
        </div>
      </div>

      <!-- Live Data Stream Card -->
      <div class="card" id="live-data-card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon">🔴</div>
            Live Data Stream
          </div>
          <div class="status-indicator" id="ws-status">
            <div class="status-dot"></div>
            <span id="ws-status-text">Connecting...</span>
          </div>
        </div>
        <div class="card-content">
          <div id="live-updates" style="max-height: 300px; overflow-y: auto;"></div>
        </div>
      </div>
    `;
  }

  /**
   * Initialize all card functionalities
   */
  private async initializeAllCards(): Promise<void> {
    await Promise.all([
      this.initializeSearchCard(),
      this.initializeTopPicksCard(),
      this.initializePerformanceCard(),
      this.initializeLiveDataCard(),
      this.initializeWebSocket()
    ]);
  }

  /**
   * Initialize stock search and overview card
   */
  private async initializeSearchCard(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/stocks/list`);
      const data = await response.json();
      
      if (data.ok && data.data) {
        const selector = document.getElementById('stock-selector') as HTMLSelectElement;
        if (selector) {
          data.data.forEach((stock: any) => {
            const option = document.createElement('option');
            option.value = stock.symbol;
            option.textContent = `${stock.symbol} - ${stock.name}`;
            selector.appendChild(option);
          });
        }
      }
    } catch (error) {
      console.error('Failed to load stock list:', error);
    }

    // Event listeners
    this.setupSearchCardEvents();
  }

  /**
   * Setup event listeners for search card
   */
  private setupSearchCardEvents(): void {
    const selector = document.getElementById('stock-selector') as HTMLSelectElement;
    const ingestBtn = document.getElementById('ingest-btn') as HTMLButtonElement;
    const analyzeBtn = document.getElementById('analyze-btn') as HTMLButtonElement;

    selector?.addEventListener('change', (e) => {
      const symbol = (e.target as HTMLSelectElement).value;
      if (symbol) {
        this.loadStockOverview(symbol);
        this.loadStockData(symbol);
      }
    });

    ingestBtn?.addEventListener('click', () => {
      const symbol = selector.value;
      if (symbol) {
        this.ingestStockData(symbol);
      }
    });

    analyzeBtn?.addEventListener('click', () => {
      const symbol = selector.value;
      if (symbol) {
        this.analyzeStock(symbol);
      }
    });
  }

  /**
   * Load stock overview data
   */
  private async loadStockOverview(symbol: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/stocks/${symbol}/overview`);
      const data = await response.json();
      
      if (data.ok && data.data) {
        const overview = data.data;
        
        this.updateElement('last-price', `₹${overview.lastClose.toFixed(2)}`);
        this.updateElement('price-change', `${overview.periodChangePct >= 0 ? '+' : ''}${overview.periodChangePct.toFixed(2)}%`, 
          overview.periodChangePct >= 0 ? 'metric-positive' : 'metric-negative');
        this.updateElement('data-points', overview.nPrices.toLocaleString());
      }
    } catch (error) {
      console.error('Failed to load overview:', error);
    }
  }

  /**
   * Load comprehensive stock data and update all relevant cards
   */
  private async loadStockData(symbol: string): Promise<void> {
    // Show loading states
    this.setLoadingState('price-chart-card', true);
    this.setLoadingState('sentiment-card', true);
    this.setLoadingState('technical-card', true);
    this.setLoadingState('volume-card', true);

    try {
      // Parallel data fetching for performance
      const [historyRes, newsRes, optionsRes] = await Promise.all([
        fetch(`${this.baseUrl}/stocks/${symbol}/history`),
        fetch(`${this.baseUrl}/stocks/${symbol}/news`),
        fetch(`${this.baseUrl}/stocks/${symbol}/options-metrics`)
      ]);

      const [historyData, newsData, optionsData] = await Promise.all([
        historyRes.json(),
        newsRes.json(),
        optionsRes.json()
      ]);

      // Update price chart
      if (historyData.ok && historyData.data.length > 0) {
        this.updatePriceChart(symbol, historyData.data);
      }

      // Update sentiment analysis
      if (newsData.ok && newsData.data.length > 0) {
        this.updateSentimentAnalysis(symbol, newsData.data);
      }

      // Update technical analysis
      this.updateTechnicalAnalysis(symbol, historyData.data || []);

      // Update volume analysis
      if (historyData.ok && historyData.data.length > 0) {
        this.updateVolumeAnalysis(symbol, historyData.data);
      }

    } catch (error) {
      console.error('Failed to load stock data:', error);
      this.showError('Failed to load stock data. Please try again.');
    } finally {
      // Hide loading states
      this.setLoadingState('price-chart-card', false);
      this.setLoadingState('sentiment-card', false);
      this.setLoadingState('technical-card', false);
      this.setLoadingState('volume-card', false);
    }
  }

  /**
   * Update price chart with data
   */
  private updatePriceChart(symbol: string, data: PriceData[]): void {
    if (data.length === 0) return;

    stockVisualizations.createPriceChart('price-chart', data, {
      showIndicators: true,
      showVolume: false
    });

    // Update chart metadata
    const firstDate = new Date(data[0].date).toLocaleDateString();
    const lastDate = new Date(data[data.length - 1].date).toLocaleDateString();
    const priceRange = Math.max(...data.map(d => d.high)) - Math.min(...data.map(d => d.low));
    
    this.updateElement('price-period', `Period: ${data.length} days`);
    this.updateElement('price-range', `Range: ₹${priceRange.toFixed(2)}`);
  }

  /**
   * Update sentiment analysis
   */
  private updateSentimentAnalysis(symbol: string, newsData: any[]): void {
    if (newsData.length === 0) return;

    // Calculate overall sentiment
    const avgSentiment = newsData.reduce((sum, item) => sum + (item.sentiment || 0), 0) / newsData.length;
    
    // Create sentiment gauge
    stockVisualizations.createSentimentGauge('sentiment-gauge', avgSentiment);

    // Create sentiment timeline
    const sentimentData: SentimentData[] = newsData.map(item => ({
      date: item.date,
      sentiment: item.sentiment || 0,
      title: item.title || ''
    }));

    stockVisualizations.createSentimentTimeline('sentiment-timeline', sentimentData);

    // Update sentiment summary
    const summaryElement = document.getElementById('sentiment-summary');
    const textElement = document.getElementById('sentiment-text');
    
    if (summaryElement && textElement) {
      const sentimentText = avgSentiment > 0.1 ? 'Positive market sentiment detected 🟢' : 
                           avgSentiment < -0.1 ? 'Negative market sentiment detected 🔴' : 
                           'Neutral market sentiment 🟡';
      
      const alertClass = avgSentiment > 0.1 ? 'alert-success' : 
                        avgSentiment < -0.1 ? 'alert-danger' : 
                        'alert-warning';
      
      summaryElement.className = `alert ${alertClass}`;
      summaryElement.style.display = 'flex';
      textElement.textContent = sentimentText;
    }
  }

  /**
   * Update technical analysis
   */
  private updateTechnicalAnalysis(symbol: string, priceData: PriceData[]): void {
    if (priceData.length < 50) return;

    const prices = priceData.map(d => d.close);
    const volumes = priceData.map(d => d.volume);
    
    // Calculate technical indicators
    const rsi = this.calculateRSI(prices, 14);
    const macd = this.calculateMACD(prices);
    const stochastic = this.calculateStochastic(priceData, 14);
    const adx = this.calculateADX(priceData, 14);
    const momentum = this.calculateMomentum(prices, 10);
    
    // Create technical radar
    const technicalData: TechnicalData = {
      rsi: rsi[rsi.length - 1] || 50,
      macd: Math.max(0, Math.min(100, (macd + 1) * 50)),
      stochastic: stochastic[stochastic.length - 1] || 50,
      adx: adx[adx.length - 1] || 25,
      momentum: Math.max(0, Math.min(100, (momentum + 1) * 50))
    };
    
    stockVisualizations.createTechnicalRadar('technical-radar', technicalData);
    
    // Create RSI chart
    const rsiData = priceData.slice(-50).map((d, i) => ({
      date: d.date,
      rsi: rsi[rsi.length - 50 + i] || 50
    })).filter(d => d.rsi !== undefined);
    
    stockVisualizations.createRSIChart('rsi-chart', rsiData);
  }

  /**
   * Update volume analysis
   */
  private updateVolumeAnalysis(symbol: string, data: PriceData[]): void {
    if (data.length === 0) return;

    const volumeData = data.map((d, i) => {
      const priceChange = i > 0 ? ((d.close - data[i-1].close) / data[i-1].close) * 100 : 0;
      return {
        date: d.date,
        volume: d.volume,
        priceChange
      };
    });

    stockVisualizations.createVolumeChart('volume-chart', volumeData);

    // Calculate volume metrics
    const avgVolume = volumeData.reduce((sum, d) => sum + d.volume, 0) / volumeData.length;
    const recentVolume = volumeData.slice(-10).reduce((sum, d) => sum + d.volume, 0) / 10;
    const volumeTrend = ((recentVolume - avgVolume) / avgVolume) * 100;

    this.updateElement('avg-volume', this.formatNumber(avgVolume));
    this.updateElement('volume-trend', `${volumeTrend >= 0 ? '+' : ''}${volumeTrend.toFixed(1)}%`,
      volumeTrend >= 0 ? 'metric-positive' : 'metric-negative');
  }

  /**
   * Initialize top picks card
   */
  private async initializeTopPicksCard(): Promise<void> {
    await this.loadTopPicks();
    
    const refreshBtn = document.getElementById('refresh-picks');
    refreshBtn?.addEventListener('click', () => {
      this.loadTopPicks();
    });
    
    // Auto-refresh every 5 minutes
    this.updateIntervals.set('top-picks', setInterval(() => {
      this.loadTopPicks();
    }, 300000));
  }

  /**
   * Load and display top picks
   */
  private async loadTopPicks(): Promise<void> {
    this.setLoadingState('top-picks-card', true);
    
    try {
      const response = await fetch(`${this.baseUrl}/top-picks?limit=20&options=true`);
      const data = await response.json();
      
      if (data.ok && data.data.length > 0) {
        // Create heatmap
        const heatmapData: HeatmapData[] = data.data.map((item: any) => ({
          symbol: item.symbol,
          label: `${item.symbol}: ${item.recommendation}`,
          value: item.score * 100
        }));
        
        stockVisualizations.createPerformanceHeatmap('top-picks-heatmap', heatmapData);
        
        // Update table
        this.updateTopPicksTable(data.data);
      }
    } catch (error) {
      console.error('Failed to load top picks:', error);
    } finally {
      this.setLoadingState('top-picks-card', false);
    }
  }

  /**
   * Update top picks table
   */
  private updateTopPicksTable(data: any[]): void {
    const tbody = document.getElementById('top-picks-tbody');
    if (!tbody) return;

    tbody.innerHTML = data.map(item => `
      <tr style="cursor: pointer;" onclick="document.getElementById('stock-selector').value='${item.symbol}'; document.getElementById('stock-selector').dispatchEvent(new Event('change'))">
        <td><strong>${item.symbol}</strong></td>
        <td><span class="performance-badge ${this.getScoreBadgeClass(item.score)}">${item.score.toFixed(3)}</span></td>
        <td class="${item.momentum >= 0 ? 'stock-bull' : 'stock-bear'}">${item.momentum >= 0 ? '+' : ''}${(item.momentum * 100).toFixed(2)}%</td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            ${this.getSentimentEmoji(item.sentiment)}
            <span class="${this.getSentimentClass(item.sentiment)}">${item.sentiment.toFixed(3)}</span>
          </div>
        </td>
        <td>
          <span class="status-indicator ${this.getRecommendationClass(item.recommendation)}">
            ${this.getRecommendationEmoji(item.recommendation)}
            ${item.recommendation.toUpperCase()}
          </span>
        </td>
      </tr>
    `).join('');
  }

  /**
   * Initialize performance monitoring card
   */
  private async initializePerformanceCard(): Promise<void> {
    // Load initial performance stats
    await this.loadPerformanceStats();
    
    // Auto-refresh every 30 seconds
    this.updateIntervals.set('performance', setInterval(() => {
      this.loadPerformanceStats();
    }, 30000));
  }

  /**
   * Load performance statistics
   */
  private async loadPerformanceStats(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/performance/stats`);
      const data = await response.json();
      
      if (data.ok && data.data) {
        const stats = data.data;
        
        // Update cache hit rate
        if (stats.cache) {
          const totalHits = Object.values(stats.cache).reduce((sum: number, cache: any) => sum + (parseFloat(cache.hitRate) || 0), 0);
          const avgHitRate = totalHits / Object.keys(stats.cache).length;
          this.updateElement('cache-hit-rate', `${avgHitRate.toFixed(1)}%`);
        }
        
        // Update API response time
        if (stats.rateLimiter) {
          const avgResponseTime = Object.values(stats.rateLimiter).reduce((sum: number, api: any) => sum + (api.avgResponseTime || 0), 0) / Object.keys(stats.rateLimiter).length;
          this.updateElement('api-response-time', `${avgResponseTime.toFixed(0)}ms`);
        }
        
        // Update memory usage
        if (stats.performance && stats.performance.systemMetrics) {
          this.updateElement('memory-usage', `${stats.performance.systemMetrics.memoryUsage}MB`);
        }
      }
    } catch (error) {
      console.error('Failed to load performance stats:', error);
    }
  }

  /**
   * Initialize live data WebSocket connection
   */
  private initializeWebSocket(): void {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.hostname}:4010`;
      
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        this.updateWebSocketStatus('connected', 'Connected');
        console.log('WebSocket connected');
      };
      
      ws.onmessage = (event) => {
        this.handleWebSocketMessage(JSON.parse(event.data));
      };
      
      ws.onclose = () => {
        this.updateWebSocketStatus('disconnected', 'Disconnected');
        // Attempt reconnection after 5 seconds
        setTimeout(() => this.initializeWebSocket(), 5000);
      };
      
      ws.onerror = (error) => {
        this.updateWebSocketStatus('error', 'Error');
        console.error('WebSocket error:', error);
      };
      
    } catch (error) {
      this.updateWebSocketStatus('error', 'Connection Failed');
      console.error('WebSocket initialization failed:', error);
    }
  }

  /**
   * Initialize live data card
   */
  private initializeLiveDataCard(): void {
    const container = document.getElementById('live-updates');
    if (container) {
      container.innerHTML = `
        <div class="text-center text-muted p-4">
          <div class="spinner"></div>
          Waiting for live updates...
        </div>
      `;
    }
  }

  /**
   * Handle WebSocket messages
   */
  private handleWebSocketMessage(message: any): void {
    const container = document.getElementById('live-updates');
    if (!container) return;

    const timestamp = new Date().toLocaleTimeString();
    
    switch (message.type) {
      case 'price_update':
        this.addLiveUpdate(container, {
          type: 'price',
          symbol: message.symbol,
          data: message.data,
          timestamp
        });
        break;
        
      case 'batch':
        message.messages?.forEach((msg: any) => this.handleWebSocketMessage(msg));
        break;
        
      default:
        console.log('Unknown WebSocket message:', message);
    }
  }

  /**
   * Add live update to the live data card
   */
  private addLiveUpdate(container: HTMLElement, update: any): void {
    const updateElement = document.createElement('div');
    updateElement.className = 'alert alert-success animate-slide-up';
    updateElement.style.marginBottom = '0.5rem';
    
    const changeClass = update.data.price >= 0 ? 'stock-bull' : 'stock-bear';
    
    updateElement.innerHTML = `
      <div style="flex: 1;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong>${update.symbol}</strong>
          <span class="${changeClass}">₹${update.data.price?.toFixed(2) || '--'}</span>
        </div>
        <div class="text-small text-muted">${update.timestamp}</div>
      </div>
    `;
    
    container.insertBefore(updateElement, container.firstChild);
    
    // Keep only last 20 updates
    while (container.children.length > 20) {
      container.removeChild(container.lastChild!);
    }
  }

  /**
   * Ingest stock data
   */
  private async ingestStockData(symbol: string): Promise<void> {
    const btn = document.getElementById('ingest-btn') as HTMLButtonElement;
    if (!btn) return;
    
    const originalText = btn.innerHTML;
    btn.innerHTML = '<div class="spinner" style="width: 16px; height: 16px; margin: 0;"></div> Ingesting...';
    btn.disabled = true;
    
    try {
      const response = await fetch(`${this.baseUrl}/ingest/${symbol}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: symbol })
      });
      
      const data = await response.json();
      
      if (data.ok) {
        this.showSuccess(`Successfully ingested ${data.data.insertedPrices} prices and ${data.data.insertedNews} news items`);
        // Refresh data after successful ingestion
        setTimeout(() => this.loadStockData(symbol), 1000);
      } else {
        this.showError(data.error || 'Ingestion failed');
      }
    } catch (error) {
      console.error('Ingestion failed:', error);
      this.showError('Ingestion failed. Please try again.');
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }

  /**
   * Analyze stock
   */
  private async analyzeStock(symbol: string): Promise<void> {
    const btn = document.getElementById('analyze-btn') as HTMLButtonElement;
    if (!btn) return;
    
    const originalText = btn.innerHTML;
    btn.innerHTML = '<div class="spinner" style="width: 16px; height: 16px; margin: 0;"></div> Analyzing...';
    btn.disabled = true;
    
    try {
      const response = await fetch(`${this.baseUrl}/stocks/${symbol}/analyze`, {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (data.ok) {
        this.showAnalysisResults(data.data);
      } else {
        this.showError(data.error || 'Analysis failed');
      }
    } catch (error) {
      console.error('Analysis failed:', error);
      this.showError('Analysis failed. Please try again.');
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }

  /**
   * Show analysis results
   */
  private showAnalysisResults(data: any): void {
    const modal = this.createModal('Analysis Results', `
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-value ${data.sentiment >= 0 ? 'metric-positive' : 'metric-negative'}">
            ${data.sentiment.toFixed(3)}
          </div>
          <div class="metric-label">Sentiment Score</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">₹${data.predictedClose.toFixed(2)}</div>
          <div class="metric-label">Predicted Close</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${data.score.toFixed(3)}</div>
          <div class="metric-label">Strategy Score</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">
            <span class="status-indicator ${this.getRecommendationClass(data.recommendation)}">
              ${this.getRecommendationEmoji(data.recommendation)}
              ${data.recommendation.toUpperCase()}
            </span>
          </div>
          <div class="metric-label">Recommendation</div>
        </div>
      </div>
      
      <div class="alert alert-success mt-3">
        <span>✅</span>
        <div>Analysis completed successfully. Data has been saved to the database.</div>
      </div>
    `);
    
    document.body.appendChild(modal);
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

  private setLoadingState(cardId: string, loading: boolean): void {
    const card = document.getElementById(cardId);
    if (!card) return;
    
    if (loading) {
      this.loadingStates.add(cardId);
      const content = card.querySelector('.card-content');
      if (content) {
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'loading';
        loadingOverlay.innerHTML = '<div class="spinner"></div>Loading...';
        loadingOverlay.id = `${cardId}-loading`;
        content.appendChild(loadingOverlay);
      }
    } else {
      this.loadingStates.delete(cardId);
      const loadingOverlay = document.getElementById(`${cardId}-loading`);
      if (loadingOverlay) {
        loadingOverlay.remove();
      }
    }
  }

  private showSuccess(message: string): void {
    this.showToast(message, 'success');
  }

  private showError(message: string): void {
    this.showToast(message, 'error');
  }

  private showToast(message: string, type: 'success' | 'error' | 'warning'): void {
    const toast = document.createElement('div');
    toast.className = `alert alert-${type === 'error' ? 'danger' : type} animate-slide-up`;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
      max-width: 400px;
      animation: slideInUp 0.3s ease-out;
    `;
    
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️';
    toast.innerHTML = `<span>${icon}</span><div>${message}</div>`;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  private createModal(title: string, content: string): HTMLElement {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      animation: fadeIn 0.3s ease-out;
    `;
    
    modal.innerHTML = `
      <div class="card" style="max-width: 600px; max-height: 80vh; overflow-y: auto; margin: 2rem;">
        <div class="card-header">
          <div class="card-title">${title}</div>
          <button onclick="this.closest('[style*=position]').remove()" style="
            background: none;
            border: none;
            color: #9AA0A6;
            font-size: 1.5rem;
            cursor: pointer;
            line-height: 1;
          ">&times;</button>
        </div>
        <div class="card-content">
          ${content}
        </div>
      </div>
    `;
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
    
    return modal;
  }

  private updateWebSocketStatus(status: string, text: string): void {
    const statusElement = document.getElementById('ws-status');
    const textElement = document.getElementById('ws-status-text');
    
    if (statusElement && textElement) {
      statusElement.className = `status-indicator ${
        status === 'connected' ? 'status-success' : 
        status === 'error' ? 'status-danger' : 'status-warning'
      }`;
      textElement.textContent = text;
    }
  }

  private formatNumber(num: number): string {
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return num.toFixed(0);
  }

  // Helper methods for styling
  private getScoreBadgeClass(score: number): string {
    if (score >= 0.8) return 'excellent';
    if (score >= 0.6) return 'good';
    if (score >= 0.4) return 'average';
    return 'poor';
  }

  private getSentimentClass(sentiment: number): string {
    if (sentiment > 0.1) return 'stock-bull';
    if (sentiment < -0.1) return 'stock-bear';
    return 'stock-neutral';
  }

  private getSentimentEmoji(sentiment: number): string {
    if (sentiment > 0.3) return '😊';
    if (sentiment > 0.1) return '🙂';
    if (sentiment > -0.1) return '😐';
    if (sentiment > -0.3) return '🙁';
    return '😢';
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

  // Technical indicator calculations
  private calculateRSI(prices: number[], period: number = 14): number[] {
    const rsi: number[] = [];
    
    for (let i = period; i < prices.length; i++) {
      let gain = 0, loss = 0;
      
      for (let j = i - period + 1; j <= i; j++) {
        const change = prices[j] - prices[j - 1];
        if (change > 0) gain += change;
        else loss -= change;
      }
      
      const avgGain = gain / period;
      const avgLoss = loss / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
    
    return rsi;
  }

  private calculateMACD(prices: number[]): number {
    if (prices.length < 26) return 0;
    
    const ema12 = this.calculateEMAValue(prices, 12);
    const ema26 = this.calculateEMAValue(prices, 26);
    
    return ema12 - ema26;
  }

  private calculateEMAValue(prices: number[], period: number): number {
    if (prices.length === 0) return 0;
    
    const k = 2 / (period + 1);
    let ema = prices[0];
    
    for (let i = 1; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }
    
    return ema;
  }

  private calculateStochastic(data: PriceData[], period: number = 14): number[] {
    const stochastic: number[] = [];
    
    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const lowest = Math.min(...slice.map(d => d.low));
      const highest = Math.max(...slice.map(d => d.high));
      const current = data[i].close;
      
      const k = highest === lowest ? 50 : ((current - lowest) / (highest - lowest)) * 100;
      stochastic.push(k);
    }
    
    return stochastic;
  }

  private calculateADX(data: PriceData[], period: number = 14): number[] {
    // Simplified ADX calculation
    const adx: number[] = [];
    
    for (let i = period; i < data.length; i++) {
      let dmPlus = 0, dmMinus = 0;
      
      for (let j = i - period + 1; j <= i; j++) {
        const highDiff = data[j].high - data[j-1].high;
        const lowDiff = data[j-1].low - data[j].low;
        
        if (highDiff > lowDiff && highDiff > 0) dmPlus += highDiff;
        if (lowDiff > highDiff && lowDiff > 0) dmMinus += lowDiff;
      }
      
      const adxValue = Math.abs(dmPlus - dmMinus) / (dmPlus + dmMinus) * 100;
      adx.push(isNaN(adxValue) ? 25 : adxValue);
    }
    
    return adx;
  }

  private calculateMomentum(prices: number[], period: number = 10): number {
    if (prices.length < period + 1) return 0;
    
    const current = prices[prices.length - 1];
    const past = prices[prices.length - 1 - period];
    
    return (current - past) / past;
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    // Clear all intervals
    for (const interval of this.updateIntervals.values()) {
      clearInterval(interval);
    }
    this.updateIntervals.clear();
    
    // Destroy all charts
    stockVisualizations.destroyAllCharts();
    
    // Clear loading states
    this.loadingStates.clear();
  }
}

// Global instance
export const dashboardCards = new DashboardCards();

// Make it available globally for onclick handlers
(window as any).dashboardCards = dashboardCards;
