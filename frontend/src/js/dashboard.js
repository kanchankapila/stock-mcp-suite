// Main Dashboard Controller for Stock Analytics Hub
class StockDashboard {
  constructor() {
    this.currentSymbol = null;
    this.wsConnection = null;
    this.updateInterval = null;
    this.isLoading = false;
    
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.initializeWebSocket();
    this.loadDefaultData();
    
    // Auto-refresh data every 30 seconds
    this.updateInterval = setInterval(() => {
      if (this.currentSymbol && !this.isLoading) {
        this.refreshCurrentData();
      }
    }, 30000);
  }

  setupEventListeners() {
    // Stock search and analysis
    const stockInput = document.getElementById('stock-input');
    const analyzeBtn = document.getElementById('analyze-btn');
    const ingestBtn = document.getElementById('ingest-btn');
    const ragBtn = document.getElementById('rag-btn');
    const portfolioBtn = document.getElementById('portfolio-btn');

    // Enter key support for stock input
    stockInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.analyzeStock();
      }
    });

    analyzeBtn?.addEventListener('click', () => this.analyzeStock());
    ingestBtn?.addEventListener('click', () => this.ingestStockData());
    ragBtn?.addEventListener('click', () => this.toggleRAGPanel());
    portfolioBtn?.addEventListener('click', () => this.loadPortfolio());

    // RAG query submission
    const submitRagBtn = document.getElementById('submit-rag-query');
    const ragQueryInput = document.getElementById('rag-query');
    
    ragQueryInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        this.submitRAGQuery();
      }
    });

    submitRagBtn?.addEventListener('click', () => this.submitRAGQuery());

    // Timeframe buttons
    document.querySelectorAll('[data-timeframe]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.changeTimeframe(e.target.dataset.timeframe);
      });
    });
  }

  // Initialize WebSocket connection
  initializeWebSocket() {
    if (window.stockAPI && typeof window.stockAPI.connectWebSocket === 'function') {
      this.wsConnection = window.stockAPI.connectWebSocket((data) => {
        this.handleWebSocketMessage(data);
      });
    }
  }

  // Handle WebSocket messages
  handleWebSocketMessage(data) {
    if (data.type === 'price_update' && data.symbol === this.currentSymbol) {
      this.updateRealTimePrices(data.prices);
    } else if (data.type === 'news_update' && data.symbol === this.currentSymbol) {
      this.updateNewsFeeds(data.news);
    } else if (data.type === 'sentiment_update' && data.symbol === this.currentSymbol) {
      this.updateSentimentDisplay(data.sentiment);
    }
  }

  // Load default data on dashboard initialization
  async loadDefaultData() {
    try {
      // Load a default symbol for demonstration
      const defaultSymbol = 'AAPL';
      document.getElementById('stock-input').value = defaultSymbol;
      await this.analyzeStock(defaultSymbol, false);
      
      // Load portfolio data
      await this.loadPortfolio();
    } catch (error) {
      console.error('Error loading default data:', error);
      this.showErrorMessage('Failed to load default data');
    }
  }

  // Main stock analysis function
  async analyzeStock(symbol = null, showLoading = true) {
    const stockInput = document.getElementById('stock-input');
    const targetSymbol = symbol || stockInput?.value?.trim().toUpperCase();
    
    if (!targetSymbol) {
      this.showErrorMessage('Please enter a stock symbol');
      return;
    }

    this.currentSymbol = targetSymbol;
    
    if (showLoading) {
      this.setLoadingState(true);
    }

    try {
      // Parallel API calls for better performance
      const [overview, prices, sentiment, news, technical] = await Promise.allSettled([
        window.stockAPI.getStockOverview(targetSymbol),
        window.stockAPI.getStockPrices(targetSymbol, 30),
        window.stockAPI.getStockSentiment(targetSymbol),
        window.stockAPI.getStockNews(targetSymbol, 5),
        window.stockAPI.getTechnicalIndicators(targetSymbol)
      ]);

      // Handle results and update UI
      await this.updateDashboard({
        symbol: targetSymbol,
        overview: overview.status === 'fulfilled' ? overview.value : null,
        prices: prices.status === 'fulfilled' ? prices.value : null,
        sentiment: sentiment.status === 'fulfilled' ? sentiment.value : null,
        news: news.status === 'fulfilled' ? news.value : null,
        technical: technical.status === 'fulfilled' ? technical.value : null
      });

      // Update document title
      document.title = `${targetSymbol} - Stock Analytics Hub`;

    } catch (error) {
      console.error('Analysis error:', error);
      this.showErrorMessage(`Failed to analyze ${targetSymbol}: ${error.message}`);
    } finally {
      this.setLoadingState(false);
    }
  }

  // Update dashboard with new data
  async updateDashboard(data) {
    const { symbol, overview, prices, sentiment, news, technical } = data;

    // Update price chart
    if (prices && prices.data) {
      window.stockVisualizations.createPriceChart('price-chart', prices.data);
    }

    // Update volume chart
    if (prices && prices.data) {
      window.stockVisualizations.createVolumeChart('volume-chart', prices.data);
    }

    // Update metrics
    if (overview && overview.data) {
      window.stockVisualizations.updateMetrics({
        currentPrice: overview.data.currentPrice || overview.data.price,
        change: overview.data.changePercent || overview.data.change,
        volume: overview.data.volume,
        marketCap: overview.data.marketCap,
        peRatio: overview.data.peRatio,
        high52w: overview.data.high52Week,
        low52w: overview.data.low52Week,
        rsi: technical?.data?.rsi || null
      });
    }

    // Update sentiment gauge
    if (sentiment && sentiment.data) {
      const sentimentScore = sentiment.data.score || sentiment.data.sentiment;
      window.stockVisualizations.createSentimentGauge('sentiment-gauge', sentimentScore);
    }

    // Update technical indicators
    if (technical && technical.data) {
      window.stockVisualizations.updateTechnicalIndicators({
        rsi: technical.data.rsi,
        macd: technical.data.macd,
        sma20: technical.data.sma20,
        ema50: technical.data.ema50,
        currentPrice: overview?.data?.currentPrice || overview?.data?.price
      });
    }

    // Update news feed
    if (news && news.data) {
      this.updateNewsFeeds(news.data);
    }

    // Update AI insights
    await this.updateAIInsights(symbol);

    // Create performance heatmap
    window.stockVisualizations.createPerformanceHeatmap('heatmap-chart');
  }

  // Refresh current stock data
  async refreshCurrentData() {
    if (!this.currentSymbol) return;
    
    try {
      await this.analyzeStock(this.currentSymbol, false);
    } catch (error) {
      console.error('Refresh error:', error);
    }
  }

  // Ingest stock data
  async ingestStockData() {
    const symbol = this.currentSymbol || document.getElementById('stock-input')?.value?.trim().toUpperCase();
    
    if (!symbol) {
      this.showErrorMessage('Please select a stock first');
      return;
    }

    try {
      this.setLoadingState(true, 'Ingesting data...');
      
      const result = await window.stockAPI.ingestStock(symbol);
      
      if (result.ok) {
        this.showSuccessMessage(`Data ingested successfully for ${symbol}`);
        // Refresh the analysis with new data
        setTimeout(() => this.analyzeStock(symbol), 2000);
      } else {
        throw new Error(result.error || 'Ingestion failed');
      }
    } catch (error) {
      console.error('Ingestion error:', error);
      this.showErrorMessage(`Failed to ingest data: ${error.message}`);
    } finally {
      this.setLoadingState(false);
    }
  }

  // Submit RAG query
  async submitRAGQuery() {
    const queryInput = document.getElementById('rag-query');
    const responseDiv = document.getElementById('rag-response');
    const query = queryInput?.value?.trim();
    const symbol = this.currentSymbol;

    if (!query) {
      this.showErrorMessage('Please enter a query');
      return;
    }

    if (!symbol) {
      this.showErrorMessage('Please select a stock first');
      return;
    }

    try {
      responseDiv.innerHTML = '<div class="flex items-center space-x-2"><div class="loading-spinner w-4 h-4"></div><span>Processing query...</span></div>';
      
      const result = await window.stockAPI.queryRAG(symbol, query, true);
      
      if (result.ok) {
        const answer = result.answer || 'No answer available';
        const sources = result.sources || [];
        
        responseDiv.innerHTML = `
          <div class="space-y-3">
            <div class="font-medium text-green-400">RAG Response:</div>
            <div class="text-gray-200">${this.escapeHtml(answer)}</div>
            ${sources.length ? `
              <div class="mt-2">
                <div class="text-xs text-gray-400 mb-1">Sources (${sources.length}):</div>
                <div class="text-xs text-gray-500">
                  ${sources.slice(0, 3).map((s, i) => `• Source ${i + 1}: ${s.metadata?.source || 'Unknown'}`).join('<br>')}
                </div>
              </div>
            ` : ''}
          </div>
        `;
        
        // Clear the input
        queryInput.value = '';
      } else {
        throw new Error(result.error || 'Query failed');
      }
    } catch (error) {
      console.error('RAG query error:', error);
      responseDiv.innerHTML = `<div class="text-red-400">Error: ${this.escapeHtml(error.message)}</div>`;
    }
  }

  // Load and display portfolio
  async loadPortfolio() {
    try {
      const result = await window.stockAPI.getPortfolio();
      
      if (result.ok && result.data) {
        window.stockVisualizations.createPortfolioChart('portfolio-chart', result.data);
      } else {
        // Create sample portfolio for demo
        const samplePortfolio = [
          { symbol: 'AAPL', value: 15000 },
          { symbol: 'BEL.NS', value: 8000 },
          { symbol: 'MSFT', value: 12000 },
          { symbol: 'GOOGL', value: 6000 }
        ];
        window.stockVisualizations.createPortfolioChart('portfolio-chart', samplePortfolio);
      }
    } catch (error) {
      console.error('Portfolio error:', error);
      document.getElementById('portfolio-chart').innerHTML = '<p class="text-red-400 text-center">Failed to load portfolio</p>';
    }
  }

  // Update AI insights
  async updateAIInsights(symbol) {
    const insightsDiv = document.getElementById('ai-insights');
    if (!insightsDiv || !symbol) return;

    try {
      // Try to get prediction data
      const prediction = await window.stockAPI.getPrediction(symbol);
      
      if (prediction.ok && prediction.data) {
        const confidence = prediction.data.confidence || 0;
        const direction = prediction.data.direction || 'neutral';
        const price = prediction.data.predictedPrice || 'N/A';
        
        insightsDiv.innerHTML = `
          <div class="space-y-2">
            <div class="flex items-center space-x-2">
              <i class="fas fa-brain text-purple-400"></i>
              <span class="text-sm font-medium">AI Prediction</span>
            </div>
            <div class="text-xs space-y-1">
              <div>Direction: <span class="${direction === 'up' ? 'text-green-400' : direction === 'down' ? 'text-red-400' : 'text-gray-400'}">${direction.toUpperCase()}</span></div>
              <div>Confidence: <span class="text-yellow-400">${Math.round(confidence * 100)}%</span></div>
              <div>Target: <span class="text-blue-400">$${price}</span></div>
            </div>
          </div>
        `;
      } else {
        insightsDiv.innerHTML = `
          <div class="space-y-2">
            <div class="flex items-center space-x-2">
              <i class="fas fa-lightbulb text-purple-400"></i>
              <span class="text-sm font-medium">AI Analysis</span>
            </div>
            <div class="text-xs text-gray-400">
              Enable ML features for AI-powered predictions and insights.
            </div>
          </div>
        `;
      }
    } catch (error) {
      console.error('AI insights error:', error);
      insightsDiv.innerHTML = '<div class="text-xs text-gray-400">AI insights unavailable</div>';
    }
  }

  // Update news feeds
  updateNewsFeeds(newsData) {
    const newsDiv = document.getElementById('news-feed');
    if (!newsDiv) return;

    if (!newsData || !newsData.length) {
      newsDiv.innerHTML = '<p class="text-xs text-gray-400">No recent news</p>';
      return;
    }

    const newsItems = newsData.slice(0, 3).map(item => `
      <div class="text-xs space-y-1">
        <div class="text-gray-200 line-clamp-2">${this.escapeHtml(item.title || item.headline)}</div>
        <div class="text-gray-500">${this.formatDate(item.date || item.publishedAt)}</div>
      </div>
    `).join('<div class="border-b border-gray-700 my-2"></div>');

    newsDiv.innerHTML = newsItems;
  }

  // Change chart timeframe
  async changeTimeframe(timeframe) {
    if (!this.currentSymbol) return;

    // Update button states
    document.querySelectorAll('[data-timeframe]').forEach(btn => {
      btn.className = btn.className.replace('bg-blue-600', 'bg-gray-700 hover:bg-gray-600');
    });
    document.querySelector(`[data-timeframe="${timeframe}"]`).className = 
      document.querySelector(`[data-timeframe="${timeframe}"]`).className.replace('bg-gray-700 hover:bg-gray-600', 'bg-blue-600');

    // Map timeframes to days
    const timeframeDays = {
      '1D': 1,
      '1W': 7,
      '1M': 30,
      '3M': 90,
      '1Y': 365
    };

    const days = timeframeDays[timeframe] || 30;
    
    try {
      const prices = await window.stockAPI.getStockPrices(this.currentSymbol, days);
      if (prices && prices.data) {
        window.stockVisualizations.createPriceChart('price-chart', prices.data);
        window.stockVisualizations.createVolumeChart('volume-chart', prices.data);
      }
    } catch (error) {
      console.error('Timeframe change error:', error);
      this.showErrorMessage('Failed to update chart timeframe');
    }
  }

  // Toggle RAG panel visibility
  toggleRAGPanel() {
    const ragPanel = document.querySelector('.glass-card:has(#rag-query)');
    if (ragPanel) {
      ragPanel.style.display = ragPanel.style.display === 'none' ? 'block' : 'none';
    }
  }

  // Utility methods
  setLoadingState(loading, message = 'Loading...') {
    this.isLoading = loading;
    const buttons = document.querySelectorAll('button');
    
    buttons.forEach(btn => {
      if (loading) {
        btn.disabled = true;
        btn.style.opacity = '0.6';
      } else {
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    });

    if (loading) {
      this.showStatusMessage(message, 'info');
    }
  }

  showErrorMessage(message) {
    this.showStatusMessage(message, 'error');
  }

  showSuccessMessage(message) {
    this.showStatusMessage(message, 'success');
  }

  showStatusMessage(message, type = 'info') {
    // Create or update status message element
    let statusEl = document.getElementById('status-message');
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.id = 'status-message';
      statusEl.className = 'fixed top-4 right-4 z-50 px-4 py-2 rounded-lg transition-all duration-300';
      document.body.appendChild(statusEl);
    }

    const colors = {
      error: 'bg-red-600 text-white',
      success: 'bg-green-600 text-white',
      info: 'bg-blue-600 text-white',
      warning: 'bg-yellow-600 text-white'
    };

    statusEl.className = `fixed top-4 right-4 z-50 px-4 py-2 rounded-lg transition-all duration-300 ${colors[type] || colors.info}`;
    statusEl.textContent = message;
    statusEl.style.display = 'block';

    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (statusEl) {
        statusEl.style.display = 'none';
      }
    }, 5000);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatDate(dateString) {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  }

  // Cleanup method
  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    if (this.wsConnection) {
      this.wsConnection.close();
    }
    if (window.stockVisualizations) {
      window.stockVisualizations.destroy();
    }
  }
}

// Initialize dashboard when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.stockDashboard = new StockDashboard();
  });
} else {
  window.stockDashboard = new StockDashboard();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (window.stockDashboard) {
    window.stockDashboard.destroy();
  }
});

export default StockDashboard;