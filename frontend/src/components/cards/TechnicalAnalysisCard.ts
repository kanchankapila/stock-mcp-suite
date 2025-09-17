/**
 * Technical Analysis Card with interactive candlestick charts and indicators
 */

import { ChartUtils, StockData, TechnicalIndicator } from '../../utils/ChartUtils.js';
import { apiService } from '../../services/ApiService.js';

export interface TechnicalAnalysisData {
  symbol: string;
  ohlcData: StockData[];
  indicators: {
    sma20?: number[];
    sma50?: number[];
    rsi?: number[];
  };
  signals: {
    trend: 'bullish' | 'bearish' | 'neutral';
    strength: number;
    support: number;
    resistance: number;
  };
}

export class TechnicalAnalysisCard {
  private container: HTMLElement;
  private data: TechnicalAnalysisData | null = null;
  private mainChart?: any;
  private volumeChart?: any;
  private isLoading = false;
  private activeIndicators = new Set<string>(['sma20', 'sma50']);

  constructor(container: HTMLElement | string) {
    this.container = typeof container === 'string'
      ? document.getElementById(container)!
      : container;
    
    this.initialize();
  }

  private initialize(): void {
    this.container.className = 'technical-analysis-card glass-card';
    this.render();
  }

  async loadData(symbol: string): Promise<void> {
    if (this.isLoading) return;
    
    this.isLoading = true;
    this.showLoadingState();

    try {
      const [history, features] = await Promise.all([
        apiService.getStockHistory(symbol, 60),
        apiService.fetch(`/stocks/${symbol}/technical-features?days=60`)
      ]);

      this.data = this.processData(symbol, history.data, features.data);
      this.render();
      this.renderCharts();
    } catch (error) {
      console.error('Failed to load technical analysis data:', error);
      this.showErrorState(error as Error);
    } finally {
      this.isLoading = false;
    }
  }

  private processData(symbol: string, historyData: any[], featuresData: any[]): TechnicalAnalysisData {
    const ohlcData: StockData[] = historyData.map(d => ({
      date: d.date,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume
    }));

    const indicators = {
      sma20: featuresData.map(f => f.sma20).filter(v => v != null),
      sma50: featuresData.map(f => f.sma50).filter(v => v != null),
      rsi: featuresData.map(f => f.rsi).filter(v => v != null)
    };

    // Calculate support/resistance and trend
    const closes = ohlcData.map(d => d.close);
    const highs = ohlcData.map(d => d.high);
    const lows = ohlcData.map(d => d.low);
    
    const support = Math.min(...lows.slice(-20));
    const resistance = Math.max(...highs.slice(-20));
    
    const sma20Current = indicators.sma20[indicators.sma20.length - 1];
    const sma50Current = indicators.sma50[indicators.sma50.length - 1];
    const currentPrice = closes[closes.length - 1];
    
    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let strength = 0.5;
    
    if (sma20Current && sma50Current && currentPrice) {
      if (sma20Current > sma50Current && currentPrice > sma20Current) {
        trend = 'bullish';
        strength = 0.7;
      } else if (sma20Current < sma50Current && currentPrice < sma20Current) {
        trend = 'bearish';
        strength = 0.7;
      }
    }

    return {
      symbol,
      ohlcData,
      indicators,
      signals: { trend, strength, support, resistance }
    };
  }

  private render(): void {
    if (!this.data) {
      this.renderEmptyState();
      return;
    }

    const html = `
      <div class="card-header">
        <div class="title-section">
          <h3 class="card-title">
            <i class="fas fa-chart-line"></i>
            Technical Analysis - ${this.data.symbol}
          </h3>
          <div class="trend-indicator ${this.data.signals.trend}">
            <span class="trend-text">${this.data.signals.trend.toUpperCase()}</span>
            <div class="strength-bar">
              <div class="strength-fill" style="width: ${this.data.signals.strength * 100}%"></div>
            </div>
          </div>
        </div>
        
        <div class="controls">
          <div class="indicator-toggles">
            ${this.renderIndicatorToggles()}
          </div>
        </div>
      </div>

      <div class="charts-container">
        <div class="main-chart-section">
          <canvas id="main-chart-${this.data.symbol}" class="main-chart"></canvas>
        </div>
        <div class="volume-chart-section">
          <canvas id="volume-chart-${this.data.symbol}" class="volume-chart"></canvas>
        </div>
      </div>

      <div class="analysis-summary">
        <div class="summary-grid">
          <div class="summary-item">
            <span class="summary-label">Trend</span>
            <span class="summary-value ${this.data.signals.trend}">
              ${this.data.signals.trend.charAt(0).toUpperCase() + this.data.signals.trend.slice(1)}
            </span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Support</span>
            <span class="summary-value">$${this.data.signals.support.toFixed(2)}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Resistance</span>
            <span class="summary-value">$${this.data.signals.resistance.toFixed(2)}</span>
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    this.attachEventListeners();
  }

  private renderIndicatorToggles(): string {
    const indicators = [
      { id: 'sma20', label: 'SMA 20', color: '#3b82f6' },
      { id: 'sma50', label: 'SMA 50', color: '#f59e0b' },
      { id: 'rsi', label: 'RSI', color: '#ef4444' }
    ];

    return indicators.map(ind => `
      <label class="indicator-toggle ${this.activeIndicators.has(ind.id) ? 'active' : ''}">
        <input type="checkbox" value="${ind.id}" ${this.activeIndicators.has(ind.id) ? 'checked' : ''}>
        <span class="indicator-color" style="background-color: ${ind.color}"></span>
        <span class="indicator-label">${ind.label}</span>
      </label>
    `).join('');
  }

  private renderCharts(): void {
    if (!this.data) return;
    this.renderMainChart();
    this.renderVolumeChart();
  }

  private renderMainChart(): void {
    if (!this.data) return;

    const canvas = document.getElementById(`main-chart-${this.data.symbol}`) as HTMLCanvasElement;
    if (!canvas) return;

    const indicators: TechnicalIndicator[] = [];

    if (this.activeIndicators.has('sma20') && this.data.indicators.sma20) {
      indicators.push({
        name: 'SMA 20',
        data: this.data.ohlcData.slice(-this.data.indicators.sma20.length).map((d, i) => ({
          x: d.date,
          y: this.data!.indicators.sma20![i]
        })),
        color: '#3b82f6',
        type: 'line'
      });
    }

    if (this.activeIndicators.has('sma50') && this.data.indicators.sma50) {
      indicators.push({
        name: 'SMA 50',
        data: this.data.ohlcData.slice(-this.data.indicators.sma50.length).map((d, i) => ({
          x: d.date,
          y: this.data!.indicators.sma50![i]
        })),
        color: '#f59e0b',
        type: 'line'
      });
    }

    this.mainChart = ChartUtils.createStockChart(canvas, this.data.ohlcData, indicators);
  }

  private renderVolumeChart(): void {
    if (!this.data) return;

    const canvas = document.getElementById(`volume-chart-${this.data.symbol}`) as HTMLCanvasElement;
    if (!canvas) return;

    this.volumeChart = ChartUtils.createVolumeChart(canvas, this.data.ohlcData);
  }

  private attachEventListeners(): void {
    const toggles = this.container.querySelectorAll('.indicator-toggle input[type="checkbox"]');
    toggles.forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        const checkbox = e.target as HTMLInputElement;
        const indicatorId = checkbox.value;
        
        if (checkbox.checked) {
          this.activeIndicators.add(indicatorId);
        } else {
          this.activeIndicators.delete(indicatorId);
        }
        
        const label = checkbox.closest('.indicator-toggle');
        label?.classList.toggle('active', checkbox.checked);
        
        this.renderCharts();
      });
    });
  }

  private renderEmptyState(): void {
    this.container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-chart-line fa-3x"></i>
        <h4>No Technical Data</h4>
        <p>Select a stock to view technical analysis</p>
      </div>
    `;
  }

  private showLoadingState(): void {
    this.container.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>Loading technical analysis...</p>
      </div>
    `;
  }

  private showErrorState(error: Error): void {
    this.container.innerHTML = `
      <div class="error-state">
        <i class="fas fa-exclamation-triangle fa-2x"></i>
        <h4>Failed to Load Technical Data</h4>
        <p>${error.message}</p>
        <button class="retry-btn">Retry</button>
      </div>
    `;
  }

  public destroy(): void {
    if (this.mainChart) ChartUtils.destroyChart(`main-chart-${this.data?.symbol}`);
    if (this.volumeChart) ChartUtils.destroyChart(`volume-chart-${this.data?.symbol}`);
    this.container.innerHTML = '';
  }
}
