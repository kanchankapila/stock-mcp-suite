/**
 * Modern dashboard component with improved UX
 */

import { BaseCard, CardConfig } from '../../shared/components/base-card';
import { createElement, createFlexContainer, createButton, debounce } from '../../shared/utils/dom-utils';
import { Api } from '../../app/services/api.service';
import { CacheService } from '../../shared/services/cache.service';

export interface DashboardConfig {
  title: string;
  description?: string;
  showSearch?: boolean;
  showFilters?: boolean;
  cards: DashboardCard[];
}

export interface DashboardCard {
  id: string;
  title: string;
  type: 'chart' | 'table' | 'metric' | 'list';
  data?: any;
  config?: any;
}

export class DashboardComponent {
  private element: HTMLElement;
  private config: DashboardConfig;
  private api: Api;
  private cache: CacheService;
  private cards: Map<string, BaseCard> = new Map();

  constructor(config: DashboardConfig) {
    this.config = config;
    this.api = new Api();
    this.cache = CacheService.getInstance();
    this.element = this.createElement();
  }

  private createElement(): HTMLElement {
    const container = createElement('div', 'dashboard');
    
    // Header
    const header = this.createHeader();
    container.appendChild(header);

    // Search and filters
    if (this.config.showSearch || this.config.showFilters) {
      const controls = this.createControls();
      container.appendChild(controls);
    }

    // Cards grid
    const cardsGrid = createElement('div', 'row');
    this.config.cards.forEach(cardConfig => {
      const card = this.createCard(cardConfig);
      cardsGrid.appendChild(card);
      this.cards.set(cardConfig.id, card);
    });
    container.appendChild(cardsGrid);

    return container;
  }

  private createHeader(): HTMLElement {
    const header = createElement('div', 'card-header');
    
    const titleSection = createElement('div');
    const title = createElement('h1', 'card-title', this.config.title);
    titleSection.appendChild(title);
    
    if (this.config.description) {
      const description = createElement('p', 'card-subtitle', this.config.description);
      titleSection.appendChild(description);
    }
    
    header.appendChild(titleSection);

    // Action buttons
    const actions = createElement('div', 'flex');
    const refreshBtn = createButton('Refresh', 'btn btn-secondary', 'dashboard-refresh');
    refreshBtn.addEventListener('click', () => this.refreshAll());
    actions.appendChild(refreshBtn);
    
    header.appendChild(actions);

    return header;
  }

  private createControls(): HTMLElement {
    const controls = createElement('div', 'card');
    controls.style.marginBottom = 'var(--space-6)';
    
    const controlsContent = createElement('div', 'flex');
    controlsContent.style.gap = 'var(--space-4)';
    controlsContent.style.flexWrap = 'wrap';

    if (this.config.showSearch) {
      const searchContainer = createElement('div', 'flex');
      searchContainer.style.flex = '1';
      searchContainer.style.minWidth = '300px';
      
      const searchInput = createElement('input') as HTMLInputElement;
      searchInput.type = 'text';
      searchInput.placeholder = 'Search stocks...';
      searchInput.id = 'dashboard-search';
      searchInput.style.flex = '1';
      
      const searchBtn = createButton('Search', 'btn btn-primary', 'dashboard-search-btn');
      
      searchContainer.appendChild(searchInput);
      searchContainer.appendChild(searchBtn);
      controlsContent.appendChild(searchContainer);
    }

    if (this.config.showFilters) {
      const filtersContainer = createElement('div', 'flex');
      filtersContainer.style.gap = 'var(--space-2)';
      filtersContainer.style.flexWrap = 'wrap';

      // Time range filter
      const timeRangeSelect = createElement('select') as HTMLSelectElement;
      timeRangeSelect.id = 'dashboard-time-range';
      timeRangeSelect.innerHTML = `
        <option value="1d">1 Day</option>
        <option value="1w">1 Week</option>
        <option value="1m" selected>1 Month</option>
        <option value="3m">3 Months</option>
        <option value="1y">1 Year</option>
      `;
      filtersContainer.appendChild(timeRangeSelect);

      // Market filter
      const marketSelect = createElement('select') as HTMLSelectElement;
      marketSelect.id = 'dashboard-market';
      marketSelect.innerHTML = `
        <option value="all">All Markets</option>
        <option value="us">US Market</option>
        <option value="nse">NSE</option>
        <option value="bse">BSE</option>
      `;
      filtersContainer.appendChild(marketSelect);

      controlsContent.appendChild(filtersContainer);
    }

    controls.appendChild(controlsContent);
    return controls;
  }

  private createCard(cardConfig: DashboardCard): BaseCard {
    const config: CardConfig = {
      id: cardConfig.id,
      title: cardConfig.title,
      showRefresh: true,
      showFilters: false
    };

    const card = new BaseCard(config);
    
    // Set up card-specific functionality
    card.setRefreshCallback(() => this.refreshCard(cardConfig.id));
    
    // Load initial data
    this.loadCardData(cardConfig.id);

    return card;
  }

  private async loadCardData(cardId: string): Promise<void> {
    const card = this.cards.get(cardId);
    if (!card) return;

    card.showLoading();

    try {
      const cardConfig = this.config.cards.find(c => c.id === cardId);
      if (!cardConfig) return;

      let data: any;
      
      switch (cardConfig.type) {
        case 'metric':
          data = await this.loadMetricData(cardConfig);
          break;
        case 'table':
          data = await this.loadTableData(cardConfig);
          break;
        case 'chart':
          data = await this.loadChartData(cardConfig);
          break;
        case 'list':
          data = await this.loadListData(cardConfig);
          break;
        default:
          data = null;
      }

      if (data) {
        this.renderCardData(cardId, data, cardConfig.type);
      } else {
        card.showEmpty('No data available');
      }

    } catch (error: any) {
      card.showError(String(error?.message || error));
    }
  }

  private async loadMetricData(cardConfig: DashboardCard): Promise<any> {
    // Implement metric data loading
    return { value: '0', change: '0%', trend: 'neutral' };
  }

  private async loadTableData(cardConfig: DashboardCard): Promise<any> {
    // Implement table data loading
    return [];
  }

  private async loadChartData(cardConfig: DashboardCard): Promise<any> {
    // Implement chart data loading
    return { labels: [], datasets: [] };
  }

  private async loadListData(cardConfig: DashboardCard): Promise<any> {
    // Implement list data loading
    return [];
  }

  private renderCardData(cardId: string, data: any, type: string): void {
    const card = this.cards.get(cardId);
    if (!card) return;

    let html = '';

    switch (type) {
      case 'metric':
        html = this.renderMetric(data);
        break;
      case 'table':
        html = this.renderTable(data);
        break;
      case 'chart':
        html = this.renderChart(data);
        break;
      case 'list':
        html = this.renderList(data);
        break;
    }

    card.setBodyContent(html);
  }

  private renderMetric(data: any): string {
    const trendIcon = data.trend === 'up' ? '↗️' : data.trend === 'down' ? '↘️' : '→';
    const trendColor = data.trend === 'up' ? 'var(--success)' : data.trend === 'down' ? 'var(--danger)' : 'var(--text-muted)';
    
    return `
      <div class="text-center">
        <div class="text-3xl font-bold mb-2">${data.value}</div>
        <div class="text-sm" style="color: ${trendColor}">
          ${trendIcon} ${data.change}
        </div>
      </div>
    `;
  }

  private renderTable(data: any[]): string {
    if (data.length === 0) return '<div class="text-muted">No data available</div>';
    
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(header => row[header]));
    
    const table = createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    
    // Header
    const thead = createElement('thead');
    const headerRow = createElement('tr');
    headers.forEach(header => {
      const th = createElement('th');
      th.textContent = header;
      th.style.padding = 'var(--space-2)';
      th.style.borderBottom = '1px solid var(--border)';
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Body
    const tbody = createElement('tbody');
    rows.forEach(row => {
      const tr = createElement('tr');
      row.forEach(cell => {
        const td = createElement('td');
        td.innerHTML = cell;
        td.style.padding = 'var(--space-2)';
        td.style.borderBottom = '1px solid var(--border)';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    
    return table.outerHTML;
  }

  private renderChart(data: any): string {
    return `
      <div class="chart-container" style="height: 300px; position: relative;">
        <canvas id="chart-${Date.now()}" width="400" height="300"></canvas>
      </div>
    `;
  }

  private renderList(data: any[]): string {
    if (data.length === 0) return '<div class="text-muted">No items available</div>';
    
    const items = data.map(item => `
      <div class="flex items-center justify-between p-3 border-b border-gray-200 last:border-b-0">
        <div>
          <div class="font-medium">${item.title || item.name}</div>
          <div class="text-sm text-muted">${item.description || item.subtitle}</div>
        </div>
        <div class="text-right">
          <div class="font-medium">${item.value || item.amount}</div>
          <div class="text-sm text-muted">${item.change || item.delta}</div>
        </div>
      </div>
    `).join('');
    
    return `<div class="space-y-0">${items}</div>`;
  }

  private async refreshCard(cardId: string): Promise<void> {
    await this.loadCardData(cardId);
  }

  private async refreshAll(): Promise<void> {
    const refreshPromises = this.config.cards.map(card => this.refreshCard(card.id));
    await Promise.all(refreshPromises);
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public async refresh(): Promise<void> {
    await this.refreshAll();
  }
}
