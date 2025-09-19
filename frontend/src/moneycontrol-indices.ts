import { createCard, updateCardContent, showError } from './live-cards';

interface IndicesCardData {
  title: string;
  endpoint: string;
  description: string;
  icon: string;
  category: string;
  refreshInterval?: number;
}

export class MoneyControlIndicesCards {
  private container: HTMLElement;
  private cards: Map<string, HTMLElement> = new Map();
  private refreshIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async initialize() {
    this.container.innerHTML = `
      <div class="mc-indices-header">
        <h2 class="section-title">
          <span class="section-icon">📊</span>
          MoneyControl Indices
        </h2>
        <p class="section-description">Live market indices data and analytics</p>
      </div>
      <div id="mc-indices-grid" class="cards-grid">
        <!-- Cards will be inserted here -->
      </div>
    `;

    const cardsGrid = document.getElementById('mc-indices-grid')!;
    await this.createIndicesCards(cardsGrid);
  }

  private async createIndicesCards(container: HTMLElement) {
    const cardsData: IndicesCardData[] = [
      {
        title: 'Indian Indices Overview',
        endpoint: '/api/mc/indices/indian',
        description: 'Complete overview of major Indian stock market indices',
        icon: '🇮🇳',
        category: 'indices',
        refreshInterval: 30000
      },
      {
        title: 'Index Details',
        endpoint: '/api/mc/indices/details',
        description: 'Detailed information about specific market indices',
        icon: '📈',
        category: 'indices',
        refreshInterval: 60000
      },
      {
        title: 'Indices List (Full)',
        endpoint: '/api/mc/indices/list',
        description: 'Complete list of available indices with versions',
        icon: '📋',
        category: 'indices',
        refreshInterval: 300000
      },
      {
        title: 'Indices List (Basic)',
        endpoint: '/api/mc/indices/list-basic',
        description: 'Basic indices listing without version parameters',
        icon: '📝',
        category: 'indices',
        refreshInterval: 300000
      },
      {
        title: 'Advance Decline Ratio',
        endpoint: '/api/mc/indices/advance-decline',
        description: 'Market breadth analysis - advancing vs declining stocks',
        icon: '⚖️',
        category: 'indices',
        refreshInterval: 30000
      }
    ];

    for (const cardData of cardsData) {
      const card = this.createIndicesCard(cardData);
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

  private createIndicesCard(data: IndicesCardData): HTMLElement {
    const card = createCard({
      title: `${data.icon} ${data.title}`,
      subtitle: data.description,
      category: data.category,
      loading: true
    });

    // Add refresh button
    const header = card.querySelector('.card-header');
    if (header) {
      const refreshBtn = document.createElement('button');
      refreshBtn.className = 'refresh-btn';
      refreshBtn.innerHTML = '🔄';
      refreshBtn.title = 'Refresh data';
      refreshBtn.onclick = () => this.loadCardData(data.endpoint);
      header.appendChild(refreshBtn);
    }

    return card;
  }

  private async loadCardData(endpoint: string) {
    const card = this.cards.get(endpoint);
    if (!card) return;

    try {
      // Show loading state
      const content = card.querySelector('.card-content');
      if (content) {
        content.innerHTML = '<div class="loading-spinner">Loading...</div>';
      }

      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Update card with data
      updateCardContent(card, {
        data: data.data || data,
        timestamp: data.timestamp || new Date().toISOString(),
        source: data.source || 'moneycontrol',
        success: data.success !== false
      });

      // Update last updated time
      const footer = card.querySelector('.card-footer');
      if (footer) {
        const timeElement = footer.querySelector('.update-time') || document.createElement('span');
        timeElement.className = 'update-time';
        timeElement.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
        if (!footer.contains(timeElement)) {
          footer.appendChild(timeElement);
        }
      }

    } catch (error: any) {
      console.error(`Error loading data for ${endpoint}:`, error);
      showError(card, `Failed to load data: ${error.message}`);
    }
  }

  // Method to refresh all cards
  async refreshAll() {
    const promises = Array.from(this.cards.keys()).map(endpoint => 
      this.loadCardData(endpoint)
    );
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

// Export function to initialize indices cards
export async function initializeMoneyControlIndicesCards(container: HTMLElement) {
  const indicesCards = new MoneyControlIndicesCards(container);
  await indicesCards.initialize();
  return indicesCards;
}