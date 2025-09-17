/**
 * Modern Stock Overview Card with real-time updates and interactive features
 */

import { ChartUtils } from '../../utils/ChartUtils.js';
import { apiService } from '../../services/ApiService.js';

export interface StockOverviewData {
  symbol: string;
  name?: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  peRatio?: number;
  high52Week?: number;
  low52Week?: number;
  sparklineData: number[];
  lastUpdated?: string;
}

export interface StockOverviewCardOptions {
  showSparkline?: boolean;
  showMetrics?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
  compact?: boolean;
}

export class StockOverviewCard {
  private container: HTMLElement;
  private data: StockOverviewData | null = null;
  private options: Required<StockOverviewCardOptions>;
  private refreshTimer?: NodeJS.Timeout;
  private sparklineChart?: any;
  private isLoading = false;

  constructor(container: HTMLElement | string, options: StockOverviewCardOptions = {}) {
    this.container = typeof container === 'string'
      ? document.getElementById(container)!
      : container;
    
    this.options = {
      showSparkline: options.showSparkline ?? true,
      showMetrics: options.showMetrics ?? true,
      autoRefresh: options.autoRefresh ?? true,
      refreshInterval: options.refreshInterval ?? 30000, // 30 seconds
      compact: options.compact ?? false
    };

    this.initialize();
  }

  private initialize(): void {
    this.container.className = 'stock-overview-card glass-card';
    this.render();
  }

  async loadData(symbol: string): Promise<void> {
    if (this.isLoading) return;
    
    this.isLoading = true;
    this.showLoadingState();

    try {
      const [overview, history] = await Promise.all([
        apiService.getStockOverview(symbol),
        apiService.getStockHistory(symbol, 30)
      ]);

      const sparklineData = history.data?.slice(-30).map((d: any) => d.close) || [];
      
      this.data = {
        symbol: overview.data?.symbol || symbol,
        name: overview.data?.name,
        currentPrice: overview.data?.currentPrice || overview.data?.close || 0,
        change: overview.data?.change || 0,
        changePercent: overview.data?.changePercent || 0,
        volume: overview.data?.volume || 0,
        marketCap: overview.data?.marketCap,
        peRatio: overview.data?.peRatio,
        high52Week: overview.data?.high52Week,
        low52Week: overview.data?.low52Week,
        sparklineData,
        lastUpdated: new Date().toISOString()
      };

      this.render();
      this.startAutoRefresh();
    } catch (error) {
      console.error('Failed to load stock data:', error);
      this.showErrorState(error as Error);
    } finally {
      this.isLoading = false;
    }
  }

  private render(): void {
    const html = this.data ? this.renderCard() : this.renderEmptyState();
    this.container.innerHTML = html;
    
    if (this.data && this.options.showSparkline) {
      this.renderSparkline();
    }

    this.attachEventListeners();
  }

  private renderCard(): string {
    const data = this.data!;
    const isPositive = data.change >= 0;
    const changeClass = isPositive ? 'positive' : 'negative';
    const changeIcon = isPositive ? '↗️' : '↘️';

    return `
      <div class="card-header">
        <div class="stock-info">
          <div class="symbol-section">
            <h3 class="symbol">${data.symbol}</h3>
            ${data.name ? `<p class="company-name">${data.name}</p>` : ''}
          </div>
          <div class="price-badge ${changeClass}">
            <span class="change-icon">${changeIcon}</span>
            <span class="change-percent">${Math.abs(data.changePercent).toFixed(2)}%</span>
          </div>
        </div>
        
        <div class="price-display">
          <span class="current-price">$${data.currentPrice.toFixed(2)}</span>
          <div class="price-change ${changeClass}">
            <span class="change-amount">
              ${isPositive ? '+' : ''}${data.change.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      ${this.options.showSparkline ? `
        <div class="sparkline-section">
          <canvas id="sparkline-${data.symbol}" class="sparkline-canvas"></canvas>
        </div>
      ` : ''}

      ${this.options.showMetrics && !this.options.compact ? this.renderMetrics() : ''}
      
      <div class="card-footer">
        <div class="last-updated">
          <i class="fas fa-clock"></i>
          <span>Updated ${this.formatLastUpdated(data.lastUpdated!)}</span>
        </div>
        <div class="card-actions">
          <button class="refresh-btn" title="Refresh data">
            <i class="fas fa-sync-alt"></i>
          </button>
          <button class="expand-btn" title="View details">
            <i class="fas fa-expand-alt"></i>
          </button>
        </div>
      </div>
    `;
  }

  private renderMetrics(): string {
    const data = this.data!;
    
    return `
      <div class="metrics-grid">
        <div class="metric-item">
          <span class="metric-label">Volume</span>
          <span class="metric-value">${this.formatVolume(data.volume)}</span>
        </div>
        ${data.marketCap ? `
          <div class="metric-item">
            <span class="metric-label">Market Cap</span>
            <span class="metric-value">${this.formatMarketCap(data.marketCap)}</span>
          </div>
        ` : ''}
        ${data.peRatio ? `
          <div class="metric-item">
            <span class="metric-label">P/E Ratio</span>
            <span class="metric-value">${data.peRatio.toFixed(2)}</span>
          </div>
        ` : ''}
        ${data.high52Week && data.low52Week ? `
          <div class="metric-item range-metric">
            <span class="metric-label">52W Range</span>
            <div class="range-display">
              <span class="range-value">${data.low52Week.toFixed(2)} - ${data.high52Week.toFixed(2)}</span>
              <div class="range-bar">
                <div class="range-indicator" style="left: ${this.calculateRangePosition()}%"></div>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderSparkline(): void {
    if (!this.data?.sparklineData.length) return;

    const canvas = document.getElementById(`sparkline-${this.data.symbol}`) as HTMLCanvasElement;
    if (!canvas) return;

    const isPositive = this.data.changePercent >= 0;
    this.sparklineChart = ChartUtils.createSparkline(canvas, this.data.sparklineData, isPositive);
  }

  private renderEmptyState(): string {
    return `
      <div class="empty-state">
        <div class="empty-icon">
          <i class="fas fa-chart-line"></i>
        </div>
        <h4>No Stock Selected</h4>
        <p>Select a stock symbol to view overview</p>
      </div>
    `;
  }

  private showLoadingState(): void {
    this.container.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>Loading stock data...</p>
      </div>
    `;
  }

  private showErrorState(error: Error): void {
    this.container.innerHTML = `
      <div class="error-state">
        <div class="error-icon">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h4>Failed to Load Data</h4>
        <p>${error.message}</p>
        <button class="retry-btn" onclick="this.retry()">Retry</button>
      </div>
    `;
  }

  private attachEventListeners(): void {
    const refreshBtn = this.container.querySelector('.refresh-btn');
    const expandBtn = this.container.querySelector('.expand-btn');

    refreshBtn?.addEventListener('click', () => {
      if (this.data) {
        this.loadData(this.data.symbol);
      }
    });

    expandBtn?.addEventListener('click', () => {
      this.toggleExpanded();
    });
  }

  private startAutoRefresh(): void {
    if (!this.options.autoRefresh || this.refreshTimer) return;

    this.refreshTimer = setInterval(() => {
      if (this.data && !this.isLoading) {
        this.loadData(this.data.symbol);
      }
    }, this.options.refreshInterval);
  }

  private stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  private toggleExpanded(): void {
    this.container.classList.toggle('expanded');
    const expandBtn = this.container.querySelector('.expand-btn i');
    if (expandBtn) {
      expandBtn.className = this.container.classList.contains('expanded')
        ? 'fas fa-compress-alt'
        : 'fas fa-expand-alt';
    }
  }

  private calculateRangePosition(): number {
    if (!this.data?.high52Week || !this.data?.low52Week) return 0;
    const { currentPrice, high52Week, low52Week } = this.data;
    return ((currentPrice - low52Week) / (high52Week - low52Week)) * 100;
  }

  private formatVolume(volume: number): string {
    return ChartUtils.formatNumber(volume);
  }

  private formatMarketCap(marketCap: number): string {
    return ChartUtils.formatNumber(marketCap);
  }

  private formatLastUpdated(timestamp: string): string {
    const now = Date.now();
    const updated = new Date(timestamp).getTime();
    const diff = Math.floor((now - updated) / 1000);

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  /**
   * Public API
   */
  public updateData(data: Partial<StockOverviewData>): void {
    if (this.data) {
      this.data = { ...this.data, ...data };
      this.render();
    }
  }

  public setAutoRefresh(enabled: boolean, interval?: number): void {
    this.options.autoRefresh = enabled;
    if (interval) this.options.refreshInterval = interval;
    
    if (enabled) {
      this.startAutoRefresh();
    } else {
      this.stopAutoRefresh();
    }
  }

  public destroy(): void {
    this.stopAutoRefresh();
    if (this.sparklineChart) {
      ChartUtils.destroyChart(`sparkline-${this.data?.symbol}`);
    }
    this.container.innerHTML = '';
  }

  public getData(): StockOverviewData | null {
    return this.data;
  }

  public getContainer(): HTMLElement {
    return this.container;
  }
}

// CSS styles (to be included in the main stylesheet)
export const StockOverviewCardStyles = `
.stock-overview-card {
  padding: 1.5rem;
  background: var(--glass-bg);
  backdrop-filter: blur(10px);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  transition: all 0.3s ease;
  min-height: 280px;
  position: relative;
  overflow: hidden;
}

.stock-overview-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  border-color: rgba(255, 255, 255, 0.3);
}

.stock-overview-card.expanded {
  min-height: 400px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.stock-info {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  width: 100%;
}

.symbol {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}

.company-name {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin: 0.25rem 0 0 0;
}

.price-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  font-weight: 600;
}

.price-badge.positive {
  background: linear-gradient(135deg, var(--success-400), var(--success-500));
  color: white;
}

.price-badge.negative {
  background: linear-gradient(135deg, var(--danger-400), var(--danger-500));
  color: white;
}

.change-icon {
  font-size: 1.2rem;
}

.price-display {
  text-align: right;
  margin-top: 1rem;
}

.current-price {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--text);
  display: block;
}

.price-change {
  margin-top: 0.5rem;
}

.change-amount {
  font-size: 1.1rem;
  font-weight: 600;
}

.price-change.positive .change-amount {
  color: var(--success-500);
}

.price-change.negative .change-amount {
  color: var(--danger-500);
}

.sparkline-section {
  margin: 1rem 0;
  height: 60px;
}

.sparkline-canvas {
  width: 100%;
  height: 100%;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 1rem;
  margin: 1.5rem 0;
}

.metric-item {
  text-align: center;
}

.metric-label {
  display: block;
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 0.25rem;
}

.metric-value {
  display: block;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
}

.range-metric {
  grid-column: span 2;
}

.range-display {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.range-bar {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  position: relative;
}

.range-indicator {
  position: absolute;
  top: -2px;
  width: 8px;
  height: 8px;
  background: var(--primary-500);
  border-radius: 50%;
  transform: translateX(-50%);
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

.last-updated {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.card-actions {
  display: flex;
  gap: 0.5rem;
}

.card-actions button {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5rem;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}

.card-actions button:hover {
  background: var(--surface);
  color: var(--text);
  border-color: var(--primary-500);
}

.loading-state, .error-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  text-align: center;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border);
  border-top-color: var(--primary-500);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-icon, .error-icon {
  font-size: 3rem;
  color: var(--text-muted);
  margin-bottom: 1rem;
}

.error-icon {
  color: var(--danger-500);
}

.retry-btn {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background: var(--primary-500);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.retry-btn:hover {
  background: var(--primary-600);
}

@media (max-width: 768px) {
  .stock-overview-card {
    padding: 1rem;
  }
  
  .current-price {
    font-size: 2rem;
  }
  
  .metrics-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .range-metric {
    grid-column: span 2;
  }
}
`;
