// API Client for Stock Analytics Hub
class StockAPIClient {
  constructor(baseURL = 'http://localhost:4010') {
    this.baseURL = baseURL;
    this.cache = new Map();
    this.cacheTimeout = 30000; // 30 seconds
  }

  // Generic API request with caching
  async request(endpoint, options = {}) {
    const cacheKey = `${endpoint}-${JSON.stringify(options)}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Cache successful responses
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      return data;
    } catch (error) {
      console.error('API Request failed:', error);
      throw error;
    }
  }

  // Health check
  async getHealth() {
    return this.request('/health');
  }

  // Stock data methods
  async getStockOverview(symbol) {
    return this.request(`/api/stocks/${symbol}/overview`);
  }

  async getStockPrices(symbol, days = 30) {
    return this.request(`/api/stocks/${symbol}/prices?days=${days}`);
  }

  async ingestStock(symbol) {
    return this.request(`/api/stocks/${symbol}/ingest`, {
      method: 'POST'
    });
  }

  async getStockSentiment(symbol) {
    return this.request(`/api/stocks/${symbol}/sentiment`);
  }

  async getStockNews(symbol, limit = 10) {
    return this.request(`/api/stocks/${symbol}/news?limit=${limit}`);
  }

  async getTechnicalIndicators(symbol) {
    return this.request(`/api/stocks/${symbol}/technical`);
  }

  // RAG methods
  async queryRAG(namespace, query, withAnswer = true) {
    return this.request('/api/rag/query', {
      method: 'POST',
      body: JSON.stringify({
        namespace,
        query,
        withAnswer,
        k: 5
      })
    });
  }

  async indexRAG(namespace, urls = [], texts = []) {
    return this.request('/api/rag/index', {
      method: 'POST',
      body: JSON.stringify({
        namespace,
        urls,
        texts
      })
    });
  }

  async reindexRAG(symbol, days = 60) {
    return this.request(`/api/rag/reindex/${symbol}`, {
      method: 'POST',
      body: JSON.stringify({ days })
    });
  }

  // Portfolio methods
  async getPortfolio() {
    return this.request('/api/portfolio');
  }

  async addToPortfolio(symbol, quantity, price) {
    return this.request('/api/portfolio', {
      method: 'POST',
      body: JSON.stringify({
        symbol,
        quantity,
        price
      })
    });
  }

  // Prediction and ML methods
  async getPrediction(symbol) {
    return this.request(`/api/predict/${symbol}`);
  }

  async getBacktest(symbol, strategy = 'sma_cross') {
    return this.request(`/api/backtest/${symbol}?strategy=${strategy}`);
  }

  // Provider health
  async getProviderHealth() {
    return this.request('/api/health/providers');
  }

  // Features API
  async getStoredFeatures(symbol, days = 60) {
    return this.request(`/api/features-stored/${symbol}?days=${days}`);
  }

  // Moneycontrol API
  async getMoneycontrolData(symbol) {
    return this.request(`/api/mc/${symbol}`);
  }

  // Agent queries
  async queryAgent(query) {
    return this.request('/api/agent/query', {
      method: 'POST',
      body: JSON.stringify({ query })
    });
  }

  // Utility methods
  clearCache() {
    this.cache.clear();
  }

  // WebSocket connection for real-time updates
  connectWebSocket(onMessage) {
    try {
      const wsURL = this.baseURL.replace('http', 'ws') + '/ws';
      const ws = new WebSocket(wsURL);
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(data);
        } catch (error) {
          console.error('WebSocket message parse error:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('WebSocket connection closed');
        // Auto-reconnect after 5 seconds
        setTimeout(() => this.connectWebSocket(onMessage), 5000);
      };

      return ws;
    } catch (error) {
      console.error('WebSocket connection failed:', error);
      return null;
    }
  }
}

// Global API client instance
window.stockAPI = new StockAPIClient();

// Test server connectivity on load
window.stockAPI.getHealth()
  .then(response => {
    console.log('✅ Server connectivity test passed:', response);
    document.getElementById('server-status').innerHTML = `
      <div class="pulse-dot bg-green-500"></div>
      <span class="text-sm text-green-400">Server Online</span>
    `;
  })
  .catch(error => {
    console.error('❌ Server connectivity test failed:', error);
    document.getElementById('server-status').innerHTML = `
      <div class="pulse-dot bg-red-500"></div>
      <span class="text-sm text-red-400">Server Offline</span>
    `;
  });

export default StockAPIClient;