import { createCard, updateCardContent, showError } from './live-cards';

interface StockCardData {
  title: string;
  endpoint: string;
  description: string;
  icon: string;
  category: string;
  refreshInterval?: number;
  priority?: 'high' | 'medium' | 'low';
}

export class MoneyControlStocksCards {
  private container: HTMLElement;
  private cards: Map<string, HTMLElement> = new Map();
  private refreshIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async initialize() {
    this.container.innerHTML = `
      <div class="mc-stocks-header">
        <h2 class="section-title">
          <span class="section-icon">📈</span>
          MoneyControl Stocks Data
        </h2>
        <p class="section-description">Real-time stock prices, analysis, and forecasts</p>
      </div>
      <div id="mc-stocks-grid" class="cards-grid">
        <!-- Cards will be inserted here -->
      </div>
    `;

    const cardsGrid = document.getElementById('mc-stocks-grid')!;
    await this.createStockCards(cardsGrid);
  }

  private async createStockCards(container: HTMLElement) {
    const cardsData: StockCardData[] = [
      {
        title: 'Live Stock Prices',
        endpoint: '/api/mc/stocks/price',
        description: 'Real-time NSE equity cash prices',
        icon: '💰',
        category: 'stocks',
        refreshInterval: 5000,
        priority: 'high'
      },
      {
        title: 'Price & Volume Analysis',
        endpoint: '/api/mc/stocks/price-volume',
        description: 'Comprehensive price and volume data',
        icon: '📊',
        category: 'stocks',
        refreshInterval: 30000,
        priority: 'high'
      },
      {
        title: 'VWAP Chart Data',
        endpoint: '/api/mc/stocks/vwap',
        description: 'Volume Weighted Average Price chart information',
        icon: '📈',
        category: 'stocks',
        refreshInterval: 60000,
        priority: 'medium'
      },
      {
        title: 'Financial Overview',
        endpoint: '/api/mc/stocks/financial-overview',
        description: 'Historical financial data and key metrics',
        icon: '📋',
        category: 'stocks',
        refreshInterval: 300000,
        priority: 'medium'
      },
      {
        title: 'Price Forecast',
        endpoint: '/api/mc/stocks/price-forecast',
        description: 'AI-powered price predictions and estimates',
        icon: '🔮',
        category: 'stocks',
        refreshInterval: 300000,
        priority: 'medium'
      },
      {
        title: 'Analyst Consensus',
        endpoint: '/api/mc/stocks/consensus',
        description: 'Market consensus and analyst opinions',
        icon: '🎯',
        category: 'stocks',
        refreshInterval: 300000,
        priority: 'medium'
      },
      {
        title: 'Analyst Ratings',
        endpoint: '/api/mc/stocks/analyst-rating',
        description: 'Professional analyst recommendations and ratings',
        icon: '⭐',
        category: 'stocks',
        refreshInterval: 300000,
        priority: 'medium'
      },
      {
        title: 'Earnings Forecast',
        endpoint: '/api/mc/stocks/earning-forecast',
        description: 'Future earnings predictions and estimates',
        icon: '📊',
        category: 'stocks',
        refreshInterval: 600000,
        priority: 'low'
      },
      {
        title: 'Stock Valuation',
        endpoint: '/api/mc/stocks/valuation',
        description: 'Valuation metrics and financial ratios',
        icon: '💎',
        category: 'stocks',
        refreshInterval: 600000,
        priority: 'low'
      },
      {
        title: 'Earnings Hits & Misses',
        endpoint: '/api/mc/stocks/hits-misses',
        description: 'Track record of earnings estimates vs actuals',
        icon: '🎯',
        category: 'stocks',
        refreshInterval: 600000,
        priority: 'low'
      },
      {
        title: 'All Stocks Overview',
        endpoint: '/api/mc/stocks/all-prices',
        description: 'Consolidated view of all configured stock prices',
        icon: '📊',
        category: 'stocks',
        refreshInterval: 10000,
        priority: 'high'
      }
    ];

    // Sort by priority (high -> medium -> low)
    const priorityOrder = { high: 1, medium: 2, low: 3 };
    cardsData.sort((a, b) => 
      (priorityOrder[a.priority || 'medium']) - (priorityOrder[b.priority || 'medium'])
    );

    for (const cardData of cardsData) {
      const card = this.createStockCard(cardData);
      container.appendChild(card);
      this.cards.set(cardData.endpoint, card);
      
      // Initial load
      await this.loadCardData(cardData.endpoint);
      
      // Setup auto-refresh if specified
      if (cardData.refreshInterval) {
        const interval = setInterval(() => {
          this.loadCardData(cardData.endpoint);
        }, cardData.refreshInterval);
        this.refreshIntervals.set(cardData.endpoint, interval);
      }
    }
  }

  private createStockCard(data: StockCardData): HTMLElement {
    const card = createCard({
      title: `${data.icon} ${data.title}`,
      subtitle: data.description,
      category: data.category,
      loading: true
    });

    // Add priority indicator
    if (data.priority) {
      card.classList.add(`priority-${data.priority}`);
    }

    // Add refresh button and stock selector
    const header = card.querySelector('.card-header');
    if (header) {
      const controls = document.createElement('div');
      controls.className = 'card-controls';
      
      // Stock symbol selector (for single stock endpoints)
      if (!data.endpoint.includes('all-')) {
        const selector = document.createElement('select');
        selector.className = 'stock-selector';
        selector.title = 'Select stock symbol';
        
        const stockSymbols = ['BE03', 'TCS', 'INFY', 'RELIANCE', 'HDFCBANK'];
        stockSymbols.forEach(symbol => {
          const option = document.createElement('option');
          option.value = symbol;
          option.textContent = symbol;
          selector.appendChild(option);
        });
        
        selector.onchange = () => {
          const newEndpoint = `${data.endpoint}?symbol=${selector.value}`;
          this.loadCardData(newEndpoint, card);
        };
        
        controls.appendChild(selector);
      }
      
      // Refresh button
      const refreshBtn = document.createElement('button');
      refreshBtn.className = 'refresh-btn';
      refreshBtn.innerHTML = '🔄';
      refreshBtn.title = 'Refresh data';
      refreshBtn.onclick = () => this.loadCardData(data.endpoint);
      controls.appendChild(refreshBtn);
      
      header.appendChild(controls);
    }

    return card;
  }

  private async loadCardData(endpoint: string, card?: HTMLElement) {
    const targetCard = card || this.cards.get(endpoint.split('?')[0]);
    if (!targetCard) return;

    try {
      // Show loading state
      const content = targetCard.querySelector('.card-content');
      if (content) {
        content.innerHTML = '<div class="loading-spinner">Loading...</div>';
      }

      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Format data for better display
      let displayData = data.data || data;
      
      // Special formatting for stock price data
      if (endpoint.includes('/price') && displayData) {
        displayData = this.formatStockPriceData(displayData);
      }
      
      // Update card with data
      updateCardContent(targetCard, {
        data: displayData,
        timestamp: data.timestamp || new Date().toISOString(),
        source: data.source || 'moneycontrol-stocks',
        success: data.success !== false
      });

      // Update last updated time
      this.updateCardFooter(targetCard);

    } catch (error: any) {
      console.error(`Error loading data for ${endpoint}:`, error);
      showError(targetCard, `Failed to load data: ${error.message}`);
    }
  }

  private formatStockPriceData(data: any) {
    if (Array.isArray(data)) {
      return data.map(item => this.formatSingleStockData(item));
    }
    return this.formatSingleStockData(data);
  }

  private formatSingleStockData(item: any) {
    if (!item || typeof item !== 'object') return item;
    
    // Common stock data formatting
    const formatted: any = { ...item };
    
    if (item.price) formatted.price = `₹${parseFloat(item.price).toFixed(2)}`;
    if (item.change) formatted.change = `${item.change > 0 ? '+' : ''}${item.change}`;
    if (item.changePercent) formatted.changePercent = `${item.changePercent > 0 ? '+' : ''}${item.changePercent}%`;
    if (item.volume) formatted.volume = this.formatVolume(item.volume);
    
    return formatted;
  }

  private formatVolume(volume: number): string {
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(2)}M`;
    } else if (volume >= 1000) {
      return `${(volume / 1000).toFixed(2)}K`;
    }
    return volume.toString();
  }

  private updateCardFooter(card: HTMLElement) {
    const footer = card.querySelector('.card-footer');
    if (footer) {
      const timeElement = footer.querySelector('.update-time') || document.createElement('span');
      timeElement.className = 'update-time';
      timeElement.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
      if (!footer.contains(timeElement)) {
        footer.appendChild(timeElement);
      }
    }
  }

  // Method to refresh all cards
  async refreshAll() {
    const promises = Array.from(this.cards.keys()).map(endpoint => 
      this.loadCardData(endpoint)
    );
    await Promise.allSettled(promises);
  }

  // Method to refresh high priority cards only
  async refreshHighPriority() {
    const highPriorityEndpoints = ['/api/mc/stocks/price', '/api/mc/stocks/price-volume', '/api/mc/stocks/all-prices'];
    const promises = highPriorityEndpoints
      .filter(endpoint => this.cards.has(endpoint))
      .map(endpoint => this.loadCardData(endpoint));
    await Promise.allSettled(promises);
  }

  // Cleanup method
  destroy() {
    // Clear all intervals
    this.refreshIntervals.forEach(interval => clearInterval(interval));
    this.refreshIntervals.clear();
    this.cards.clear();
  }
}

// Export function to initialize stock cards
export async function initializeMoneyControlStocksCards(container: HTMLElement) {
  const stocksCards = new MoneyControlStocksCards(container);
  await stocksCards.initialize();
  return stocksCards;
}