// Advanced API Client for Stock Intelligence Hub
// Centralized communication with backend services

class StockAPIClient {
  constructor(baseURL = 'http://localhost:4010') {
    this.baseURL = baseURL;
    this.cache = new Map();
    this.requestQueue = new Map();
    this.retryCount = 3;
    this.retryDelay = 1000;
    this.timeouts = {
      default: 10000,
      analysis: 30000,
      ingest: 60000,
      recommendation: 30000
    };
    
    this.initializeEventListeners();
    console.log('🚀 Stock API Client initialized with base URL:', baseURL);
  }

  initializeEventListeners() {
    // Listen for network status changes
    window.addEventListener('online', () => {
      this.handleNetworkChange(true);
    });
    
    window.addEventListener('offline', () => {
      this.handleNetworkChange(false);
    });
    
    // Initialize connection test
    this.testConnection();
  }

  async testConnection() {
    try {
      const response = await this.makeRequest('/api/health', { timeout: 5000 });
      if (response.ok) {
        this.updateServerStatus(true);
        console.log('✅ API connection established successfully');
      } else {
        this.updateServerStatus(false);
      }
    } catch (error) {
      this.updateServerStatus(false);
      console.warn('⚠️ API connection failed:', error.message);
    }
  }

  updateServerStatus(isOnline) {
    const statusElement = document.getElementById('server-status');
    if (statusElement) {
      const dot = statusElement.querySelector('.pulse-dot');
      const text = statusElement.querySelector('span');
      
      if (isOnline) {
        dot.className = 'pulse-dot status-online';
        text.textContent = 'System Online';
        text.className = 'text-sm font-medium text-green-400';
      } else {
        dot.className = 'pulse-dot status-error';
        text.textContent = 'System Offline';
        text.className = 'text-sm font-medium text-red-400';
      }
    }
  }

  handleNetworkChange(isOnline) {
    this.updateServerStatus(isOnline);
    
    if (isOnline) {
      window.notyf?.success('🌐 Connection restored');
      // Retry failed requests
      this.retryFailedRequests();
    } else {
      window.notyf?.error('🚫 Connection lost - working offline');
    }
  }

  // Core HTTP request method with advanced features
  async makeRequest(endpoint, options = {}) {
    const {
      method = 'GET',
      data = null,
      headers = {},
      timeout = this.timeouts.default,
      useCache = true,
      skipQueue = false
    } = options;

    const url = `${this.baseURL}${endpoint}`;
    const requestKey = `${method}:${url}:${JSON.stringify(data)}`;

    // Check cache for GET requests
    if (method === 'GET' && useCache && this.cache.has(requestKey)) {
      const cachedData = this.cache.get(requestKey);
      if (Date.now() - cachedData.timestamp < 300000) { // 5 minutes
        console.log('💾 Using cached data for:', endpoint);
        return cachedData.data;
      } else {
        this.cache.delete(requestKey);
      }
    }

    // Check if request is already in progress
    if (!skipQueue && this.requestQueue.has(requestKey)) {
      console.log('⏳ Request already in progress for:', endpoint);
      return await this.requestQueue.get(requestKey);
    }

    // Create request promise
    const requestPromise = this.executeRequest(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(timeout)
    });

    // Add to queue
    if (!skipQueue) {
      this.requestQueue.set(requestKey, requestPromise);
    }

    try {
      const response = await requestPromise;
      
      // Cache successful GET responses
      if (method === 'GET' && useCache && response.ok) {
        this.cache.set(requestKey, {
          data: response,
          timestamp: Date.now()
        });
      }

      return response;
    } catch (error) {
      console.error(`Request failed for ${endpoint}:`, error);
      throw error;
    } finally {
      // Remove from queue
      if (!skipQueue) {
        this.requestQueue.delete(requestKey);
      }
    }
  }

  async executeRequest(url, options) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        console.log(`📞 Making request to ${url} (attempt ${attempt})`);
        
        const response = await fetch(url, options);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text();
        }

        return { ok: true, data, status: response.status, headers: response.headers };
      } catch (error) {
        lastError = error;
        
        if (attempt < this.retryCount && this.shouldRetry(error)) {
          console.log(`🔄 Retrying request in ${this.retryDelay}ms...`);
          await this.sleep(this.retryDelay * attempt);
        } else {
          break;
        }
      }
    }

    return { ok: false, error: lastError.message, status: 0 };
  }

  shouldRetry(error) {
    // Retry on network errors, timeout, or server errors (5xx)
    return (
      error.name === 'AbortError' ||
      error.name === 'TypeError' ||
      (error.message.includes('HTTP 5'))
    );
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  retryFailedRequests() {
    // Implementation for retrying failed requests when connection is restored
    console.log('Connection restored - retrying failed requests');
  }

  // Stock Analysis Methods
  async getStockOverview(symbol) {
    try {
      const response = await this.makeRequest(`/api/overview/${symbol}`, {
        timeout: this.timeouts.analysis
      });
      
      if (response.ok) {
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to fetch stock overview');
      }
    } catch (error) {
      console.error('Error fetching stock overview:', error);
      window.notyf?.error(`Failed to load overview for ${symbol}`);
      throw error;
    }
  }

  async getStockPrices(symbol, days = 30) {
    try {
      const response = await this.makeRequest(`/api/prices/${symbol}?days=${days}`);
      
      if (response.ok) {
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to fetch price data');
      }
    } catch (error) {
      console.error('Error fetching stock prices:', error);
      window.notyf?.error(`Failed to load price data for ${symbol}`);
      throw error;
    }
  }

  async getTechnicalIndicators(symbol) {
    try {
      const response = await this.makeRequest(`/api/features-stored/${symbol}?days=30`);
      
      if (response.ok && response.data.length > 0) {
        return response.data[response.data.length - 1]; // Latest indicators
      } else {
        throw new Error('No technical data available');
      }
    } catch (error) {
      console.error('Error fetching technical indicators:', error);
      return {}; // Return empty object instead of throwing
    }
  }

  async getSentimentAnalysis(symbol) {
    try {
      const response = await this.makeRequest(`/api/sentiment/${symbol}`, {
        timeout: this.timeouts.analysis
      });
      
      if (response.ok) {
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to fetch sentiment data');
      }
    } catch (error) {
      console.error('Error fetching sentiment analysis:', error);
      window.notyf?.warning(`Sentiment data unavailable for ${symbol}`);
      return { overall_sentiment: 0.5 }; // Default neutral sentiment
    }
  }

  async getMarketNews(symbol, limit = 10) {
    try {
      const response = await this.makeRequest(`/api/news/${symbol}?limit=${limit}`);
      
      if (response.ok) {
        return response.data;
      } else {
        return []; // Return empty array if no news
      }
    } catch (error) {
      console.error('Error fetching market news:', error);
      return [];
    }
  }

  // Data Ingestion
  async ingestStockData(symbol) {
    try {
      window.notyf?.info(`📎 Starting data ingestion for ${symbol}...`);
      
      const response = await this.makeRequest(`/api/ingest/${symbol}`, {
        method: 'POST',
        timeout: this.timeouts.ingest
      });
      
      if (response.ok) {
        window.notyf?.success(`✅ Data ingestion completed for ${symbol}`);
        
        // Clear cache to force fresh data
        this.clearCacheForSymbol(symbol);
        
        return response.data;
      } else {
        throw new Error(response.error || 'Ingestion failed');
      }
    } catch (error) {
      console.error('Error during data ingestion:', error);
      window.notyf?.error(`❌ Failed to ingest data for ${symbol}`);
      throw error;
    }
  }

  // Advanced Recommendation Methods
  async getStockRecommendation(symbol, timeHorizon = 'medium') {
    try {
      window.notyf?.info(`🤖 Generating AI recommendation for ${symbol}...`);
      
      const response = await this.makeRequest('/api/recommendations/generate', {
        method: 'POST',
        data: {
          symbol,
          timeHorizon,
          type: 'hybrid'
        },
        timeout: this.timeouts.recommendation
      });
      
      if (response.ok) {
        window.notyf?.success(`✨ AI recommendation ready for ${symbol}`);
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to generate recommendation');
      }
    } catch (error) {
      console.error('Error generating recommendation:', error);
      window.notyf?.error(`Failed to generate recommendation for ${symbol}`);
      throw error;
    }
  }

  async getSimilarStocks(symbol, limit = 5) {
    try {
      const response = await this.makeRequest('/api/recommendations/similar', {
        method: 'POST',
        data: { symbol, limit }
      });
      
      if (response.ok) {
        return response.data;
      } else {
        return [];
      }
    } catch (error) {
      console.error('Error fetching similar stocks:', error);
      return [];
    }
  }

  async getPortfolioRecommendations(symbols, currentAllocation = {}, riskTolerance = 'moderate') {
    try {
      const response = await this.makeRequest('/api/recommendations/portfolio', {
        method: 'POST',
        data: {
          symbols,
          currentAllocation,
          riskTolerance
        },
        timeout: this.timeouts.recommendation
      });
      
      if (response.ok) {
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to generate portfolio recommendations');
      }
    } catch (error) {
      console.error('Error generating portfolio recommendations:', error);
      throw error;
    }
  }

  // RAG (Retrieval Augmented Generation) Methods
  async queryRAG(symbol, query, withAnswer = true) {
    try {
      window.notyf?.info('🤖 Consulting AI assistant...');
      
      const response = await this.makeRequest('/api/rag/query', {
        method: 'POST',
        data: {
          namespace: symbol,
          query,
          k: 5,
          withAnswer
        },
        timeout: this.timeouts.analysis
      });
      
      if (response.ok) {
        window.notyf?.success('✨ AI assistant responded');
        return response.data;
      } else {
        throw new Error(response.error || 'RAG query failed');
      }
    } catch (error) {
      console.error('Error querying RAG:', error);
      window.notyf?.error('AI assistant is currently unavailable');
      throw error;
    }
  }

  async indexRAGContent(symbol, urls) {
    try {
      const response = await this.makeRequest('/api/rag/index', {
        method: 'POST',
        data: {
          namespace: symbol,
          urls
        },
        timeout: this.timeouts.analysis
      });
      
      return response.ok ? response.data : null;
    } catch (error) {
      console.error('Error indexing RAG content:', error);
      return null;
    }
  }

  // MCP Tool Integration
  async callMCPTool(toolName, params = {}) {
    try {
      const response = await this.makeRequest('/mcp/tool', {
        method: 'POST',
        data: {
          tool: toolName,
          params,
          id: `req_${Date.now()}`
        },
        timeout: this.timeouts.analysis
      });
      
      if (response.ok && response.data.ok) {
        return response.data.result;
      } else {
        throw new Error(response.data?.error || response.error || 'MCP tool call failed');
      }
    } catch (error) {
      console.error(`Error calling MCP tool ${toolName}:`, error);
      throw error;
    }
  }

  async getMCPSchema() {
    try {
      const response = await this.makeRequest('/mcp/schema');
      return response.ok ? response.data : null;
    } catch (error) {
      console.error('Error fetching MCP schema:', error);
      return null;
    }
  }

  // Batch Operations
  async batchRequest(requests) {
    try {
      const promises = requests.map(req => 
        this.makeRequest(req.endpoint, {
          ...req.options,
          skipQueue: true // Don't queue individual requests in batch
        })
      );
      
      const results = await Promise.allSettled(promises);
      
      return results.map((result, index) => ({
        success: result.status === 'fulfilled' && result.value.ok,
        data: result.status === 'fulfilled' ? result.value.data : null,
        error: result.status === 'rejected' ? result.reason : 
               (result.value?.error || null),
        request: requests[index]
      }));
    } catch (error) {
      console.error('Error in batch request:', error);
      throw error;
    }
  }

  // Performance Monitoring
  async getPerformanceMetrics() {
    try {
      const response = await this.makeRequest('/api/performance');
      return response.ok ? response.data : null;
    } catch (error) {
      console.error('Error fetching performance metrics:', error);
      return null;
    }
  }

  // Utility Methods
  clearCache() {
    this.cache.clear();
    console.log('🗑️ API cache cleared');
  }

  clearCacheForSymbol(symbol) {
    const keysToDelete = [];
    for (const key of this.cache.keys()) {
      if (key.includes(symbol)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
    console.log(`🗑️ Cache cleared for ${symbol}`);
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  getActiveRequests() {
    return {
      count: this.requestQueue.size,
      requests: Array.from(this.requestQueue.keys())
    };
  }

  // Health Check Methods
  async getSystemHealth() {
    try {
      const response = await this.makeRequest('/api/health');
      return response.ok ? response.data : { status: 'error' };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  async getProviderHealth() {
    try {
      const response = await this.makeRequest('/api/health/providers');
      return response.ok ? response.data : [];
    } catch (error) {
      console.error('Error fetching provider health:', error);
      return [];
    }
  }

  // WebSocket connection for real-time updates (future enhancement)
  initializeWebSocket() {
    // TODO: Implement WebSocket connection for real-time data
    console.log('WebSocket initialization (future enhancement)');
  }
}

// Error handling utilities
class APIError extends Error {
  constructor(message, status = 0, response = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.response = response;
  }
}

// Create and export global instance
const apiClient = new StockAPIClient();
window.apiClient = apiClient;

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StockAPIClient, APIError };
}

export { StockAPIClient, APIError };
export default apiClient;