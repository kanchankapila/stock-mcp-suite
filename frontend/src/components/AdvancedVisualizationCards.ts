/**
 * Advanced Visualization Components for Stock Analytics
 * Modern, interactive charts with professional financial design
 */

import chartManager from '../services/ChartManager';
import enhancedApiService, { MarketData, StockOverview } from '../services/EnhancedApiService';

export class MarketHeatmapCard {
  private container: HTMLElement;
  private data: MarketData | null = null;
  private resizeObserver: ResizeObserver;
  
  constructor(containerId: string) {
    const element = document.getElementById(containerId);
    if (!element) throw new Error(`Container ${containerId} not found`);
    
    this.container = element;
    this.initializeCard();
    this.setupResizeObserver();
  }
  
  private initializeCard(): void {
    this.container.innerHTML = `
      <div class="glass-card p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-white">Market Heatmap</h3>
          <div class="flex items-center space-x-2">
            <select id="heatmapTimeframe" class="bg-gray-800 text-white px-3 py-1 rounded border border-gray-600">
              <option value="1D">1 Day</option>
              <option value="1W" selected>1 Week</option>
              <option value="1M">1 Month</option>
              <option value="3M">3 Months</option>
            </select>
            <button id="heatmapRefresh" class="text-blue-400 hover:text-blue-300 p-1" title="Refresh">
              <i class="fas fa-sync-alt"></i>
            </button>
          </div>
        </div>
        <div id="heatmapContainer" class="relative">
          <div class="flex items-center justify-center h-64 text-gray-400">
            <div class="text-center">
              <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-4"></div>
              <p>Loading market data...</p>
            </div>
          </div>
        </div>
        <div class="flex items-center justify-between mt-4 text-xs">
          <div class="flex items-center space-x-4">
            <div class="flex items-center space-x-1">
              <div class="w-3 h-3 bg-red-500 rounded"></div>
              <span class="text-gray-400">Losers</span>
            </div>
            <div class="flex items-center space-x-1">
              <div class="w-3 h-3 bg-gray-500 rounded"></div>
              <span class="text-gray-400">Neutral</span>
            </div>
            <div class="flex items-center space-x-1">
              <div class="w-3 h-3 bg-green-500 rounded"></div>
              <span class="text-gray-400">Winners</span>
            </div>
          </div>
          <span class="text-gray-500" id="lastUpdated">Last updated: --</span>
        </div>
      </div>
    `;
    
    this.attachEventListeners();
  }
  
  private attachEventListeners(): void {
    const refreshBtn = this.container.querySelector('#heatmapRefresh') as HTMLButtonElement;
    const timeframeSelect = this.container.querySelector('#heatmapTimeframe') as HTMLSelectElement;
    
    refreshBtn?.addEventListener('click', () => this.refresh());
    timeframeSelect?.addEventListener('change', () => this.refresh());
  }
  
  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      if (this.data) {
        this.renderHeatmap();
      }
    });
    
    this.resizeObserver.observe(this.container);
  }
  
  async refresh(): Promise<void> {
    const container = this.container.querySelector('#heatmapContainer');
    if (!container) return;
    
    try {
      // Show loading state
      container.innerHTML = `
        <div class="flex items-center justify-center h-64 text-gray-400">
          <div class="text-center">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-4"></div>
            <p>Loading market data...</p>
          </div>
        </div>
      `;
      
      // Fetch fresh data
      this.data = await enhancedApiService.getMarketData();
      
      // Render heatmap
      this.renderHeatmap();
      
      // Update timestamp
      const lastUpdatedEl = this.container.querySelector('#lastUpdated');
      if (lastUpdatedEl) {
        lastUpdatedEl.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
      }
      
    } catch (error) {
      console.error('Failed to refresh heatmap:', error);
      container.innerHTML = `
        <div class="flex items-center justify-center h-64 text-red-400">
          <div class="text-center">
            <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
            <p>Failed to load market data</p>
            <button class="text-blue-400 hover:text-blue-300 mt-2 underline" onclick="this.closest('.glass-card').querySelector('#heatmapRefresh').click()">
              Try again
            </button>
          </div>
        </div>
      `;
    }
  }
  
  private renderHeatmap(): void {
    if (!this.data?.sectors) return;
    
    const container = this.container.querySelector('#heatmapContainer') as HTMLElement;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const width = rect.width || 400;
    const height = 300;
    
    // Use D3.js for treemap visualization
    const sectors = this.data.sectors.filter(s => s.marketCap > 0).slice(0, 20);
    
    container.innerHTML = '';
    
    // Create SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width.toString());
    svg.setAttribute('height', height.toString());
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.maxWidth = '100%';
    svg.style.height = 'auto';
    
    // Create treemap layout manually (simplified D3 treemap)
    const treemapData = this.createTreemapLayout(sectors, width, height);
    
    // Render rectangles
    treemapData.forEach((item, index) => {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', item.x.toString());
      rect.setAttribute('y', item.y.toString());
      rect.setAttribute('width', item.width.toString());
      rect.setAttribute('height', item.height.toString());
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', this.getPerformanceColor(item.data.performance));
      rect.setAttribute('stroke', '#374151');
      rect.setAttribute('stroke-width', '1');
      rect.style.cursor = 'pointer';
      
      // Add hover effects
      rect.addEventListener('mouseenter', (e) => {
        rect.style.opacity = '0.8';
        this.showTooltip(e, item.data);
      });
      
      rect.addEventListener('mouseleave', () => {
        rect.style.opacity = '1';
        this.hideTooltip();
      });
      
      svg.appendChild(rect);
      
      // Add text label for larger rectangles
      if (item.width > 60 && item.height > 30) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', (item.x + item.width / 2).toString());
        text.setAttribute('y', (item.y + item.height / 2).toString());
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('fill', 'white');
        text.setAttribute('font-size', '12');
        text.setAttribute('font-weight', '500');
        text.style.pointerEvents = 'none';
        text.textContent = item.data.name.length > 8 ? 
          item.data.name.substring(0, 8) + '...' : item.data.name;
        
        svg.appendChild(text);
        
        // Add performance percentage
        if (item.height > 50) {
          const perfText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          perfText.setAttribute('x', (item.x + item.width / 2).toString());
          perfText.setAttribute('y', (item.y + item.height / 2 + 16).toString());
          perfText.setAttribute('text-anchor', 'middle');
          perfText.setAttribute('dominant-baseline', 'middle');
          perfText.setAttribute('fill', 'rgba(255, 255, 255, 0.8)');
          perfText.setAttribute('font-size', '10');
          perfText.style.pointerEvents = 'none';
          perfText.textContent = `${item.data.performance.toFixed(1)}%`;
          
          svg.appendChild(perfText);
        }
      }
    });
    
    container.appendChild(svg);
  }
  
  private createTreemapLayout(data: any[], width: number, height: number): any[] {
    // Simplified treemap algorithm
    const totalValue = data.reduce((sum, item) => sum + Math.abs(item.marketCap || 1), 0);
    const result: any[] = [];
    
    let currentX = 0;
    let currentY = 0;
    let rowHeight = 0;
    let remainingWidth = width;
    let remainingArea = width * height;
    
    data.forEach((item, index) => {
      const value = Math.abs(item.marketCap || 1);
      const area = (value / totalValue) * width * height;
      
      // Simple row-based layout
      const itemWidth = Math.min(Math.sqrt(area * 1.5), remainingWidth);
      const itemHeight = area / itemWidth;
      
      if (currentX + itemWidth > width) {
        // Move to next row
        currentX = 0;
        currentY += rowHeight;
        rowHeight = 0;
      }
      
      result.push({
        x: currentX,
        y: currentY,
        width: Math.min(itemWidth, width - currentX),
        height: Math.min(itemHeight, height - currentY),
        data: item
      });
      
      currentX += itemWidth;
      rowHeight = Math.max(rowHeight, itemHeight);
    });
    
    return result;
  }
  
  private getPerformanceColor(performance: number): string {
    if (performance > 2) return '#10b981'; // Strong green
    if (performance > 0.5) return '#34d399'; // Light green
    if (performance > -0.5) return '#6b7280'; // Gray
    if (performance > -2) return '#f87171'; // Light red
    return '#ef4444'; // Strong red
  }
  
  private showTooltip(event: MouseEvent, data: any): void {
    const tooltip = document.createElement('div');
    tooltip.id = 'heatmapTooltip';
    tooltip.className = 'fixed z-50 bg-gray-900 text-white p-3 rounded-lg border border-gray-600 shadow-xl';
    tooltip.style.pointerEvents = 'none';
    
    tooltip.innerHTML = `
      <div class="font-semibold">${data.name}</div>
      <div class="text-sm text-gray-300 mt-1">
        <div>Performance: <span class="${data.performance >= 0 ? 'text-green-400' : 'text-red-400'}">
          ${data.performance >= 0 ? '+' : ''}${data.performance.toFixed(2)}%
        </span></div>
        <div>Market Cap: $${(data.marketCap / 1e9).toFixed(2)}B</div>
        <div>Volume: ${data.volume.toLocaleString()}</div>
      </div>
    `;
    
    document.body.appendChild(tooltip);
    
    const rect = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.min(event.clientX + 10, window.innerWidth - rect.width - 10)}px`;
    tooltip.style.top = `${Math.max(event.clientY - rect.height - 10, 10)}px`;
  }
  
  private hideTooltip(): void {
    const tooltip = document.getElementById('heatmapTooltip');
    if (tooltip) {
      tooltip.remove();
    }
  }
  
  destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    this.hideTooltip();
  }
}

export class RealTimeGaugeCard {
  private container: HTMLElement;
  private gaugeChart: any;
  private currentValue: number = 0;
  private animationId: number | null = null;
  
  constructor(containerId: string, private label: string, private maxValue: number = 100) {
    const element = document.getElementById(containerId);
    if (!element) throw new Error(`Container ${containerId} not found`);
    
    this.container = element;
    this.initializeCard();
  }
  
  private initializeCard(): void {
    this.container.innerHTML = `
      <div class="glass-card p-6">
        <div class="text-center mb-4">
          <h3 class="text-lg font-semibold text-white mb-2">${this.label}</h3>
          <div class="text-3xl font-bold" id="gaugeValue" style="background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
            ${this.currentValue.toFixed(1)}
          </div>
        </div>
        <div class="relative h-32">
          <canvas id="gaugeCanvas" class="w-full h-full"></canvas>
        </div>
        <div class="flex justify-between text-xs text-gray-400 mt-2">
          <span>0</span>
          <span>${this.maxValue}</span>
        </div>
      </div>
    `;
    
    this.initializeGauge();
  }
  
  private initializeGauge(): void {
    const canvas = this.container.querySelector('#gaugeCanvas') as HTMLCanvasElement;
    if (!canvas) return;
    
    this.gaugeChart = chartManager.createGauge(
      canvas.id,
      this.currentValue,
      this.maxValue,
      '',
      '#3b82f6'
    );
  }
  
  updateValue(newValue: number, animate: boolean = true): void {
    if (animate) {
      this.animateToValue(newValue);
    } else {
      this.currentValue = newValue;
      this.updateDisplay();
    }
  }
  
  private animateToValue(targetValue: number): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    
    const startValue = this.currentValue;
    const difference = targetValue - startValue;
    const duration = 1000; // 1 second
    const startTime = performance.now();
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (easeOutCubic)
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      
      this.currentValue = startValue + (difference * easedProgress);
      this.updateDisplay();
      
      if (progress < 1) {
        this.animationId = requestAnimationFrame(animate);
      }
    };
    
    this.animationId = requestAnimationFrame(animate);
  }
  
  private updateDisplay(): void {
    const valueElement = this.container.querySelector('#gaugeValue');
    if (valueElement) {
      valueElement.textContent = this.currentValue.toFixed(1);
    }
    
    if (this.gaugeChart) {
      chartManager.updateChart(this.gaugeChart.canvas.id, {
        datasets: [{
          data: [this.currentValue, this.maxValue - this.currentValue],
          backgroundColor: [
            this.getValueColor(this.currentValue),
            'rgba(229, 231, 235, 0.3)'
          ],
          borderWidth: 0,
          cutout: '80%'
        }]
      });
    }
  }
  
  private getValueColor(value: number): string {
    const percentage = value / this.maxValue;
    
    if (percentage < 0.3) return '#ef4444'; // Red
    if (percentage < 0.6) return '#f59e0b'; // Yellow
    if (percentage < 0.8) return '#3b82f6'; // Blue
    return '#10b981'; // Green
  }
  
  destroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.gaugeChart) {
      chartManager.destroyChart(this.gaugeChart.canvas.id);
    }
  }
}

export class InteractiveCandlestickCard {
  private container: HTMLElement;
  private chart: any;
  private symbol: string = '';
  
  constructor(containerId: string) {
    const element = document.getElementById(containerId);
    if (!element) throw new Error(`Container ${containerId} not found`);
    
    this.container = element;
    this.initializeCard();
  }
  
  private initializeCard(): void {
    this.container.innerHTML = `
      <div class="glass-card p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-white">Price Chart</h3>
          <div class="flex items-center space-x-2">
            <select id="chartTimeframe" class="bg-gray-800 text-white px-3 py-1 rounded border border-gray-600">
              <option value="1D">1 Day</option>
              <option value="1W">1 Week</option>
              <option value="1M" selected>1 Month</option>
              <option value="3M">3 Months</option>
              <option value="1Y">1 Year</option>
            </select>
            <div class="flex items-center space-x-1">
              <label class="flex items-center space-x-1">
                <input type="checkbox" id="showVolume" checked class="w-3 h-3">
                <span class="text-xs text-gray-400">Volume</span>
              </label>
            </div>
          </div>
        </div>
        <div class="relative">
          <canvas id="candlestickChart" class="w-full" style="height: 300px;"></canvas>
        </div>
        <div class="flex justify-center mt-4 space-x-4 text-xs">
          <div class="flex items-center space-x-1">
            <div class="w-3 h-1 bg-green-500"></div>
            <span class="text-gray-400">Bullish</span>
          </div>
          <div class="flex items-center space-x-1">
            <div class="w-3 h-1 bg-red-500"></div>
            <span class="text-gray-400">Bearish</span>
          </div>
          <div class="flex items-center space-x-1">
            <div class="w-3 h-1 bg-blue-500"></div>
            <span class="text-gray-400">Volume</span>
          </div>
        </div>
      </div>
    `;
    
    this.attachEventListeners();
  }
  
  private attachEventListeners(): void {
    const timeframeSelect = this.container.querySelector('#chartTimeframe') as HTMLSelectElement;
    const volumeToggle = this.container.querySelector('#showVolume') as HTMLInputElement;
    
    timeframeSelect?.addEventListener('change', () => this.updateChart());
    volumeToggle?.addEventListener('change', () => this.updateChart());
  }
  
  async loadSymbol(symbol: string): Promise<void> {
    this.symbol = symbol;
    await this.updateChart();
  }
  
  private async updateChart(): Promise<void> {
    if (!this.symbol) return;
    
    try {
      const history = await enhancedApiService.historySeriesCached(this.symbol, 60);
      
      if (history.length === 0) return;
      
      // Transform data for candlestick chart (simplified)
      const chartData = {
        labels: history.map(h => h.t),
        datasets: [
          {
            label: 'Price',
            data: history.map(h => h.c),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.1
          }
        ]
      };
      
      if (this.chart) {
        chartManager.updateChart('candlestickChart', chartData);
      } else {
        this.chart = chartManager.createChart(
          'candlestickChart',
          'line',
          chartData,
          {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: {
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: '#9ca3af' }
              },
              y: {
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: '#9ca3af' }
              }
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                titleColor: '#fff',
                bodyColor: '#fff'
              }
            }
          }
        );
      }
    } catch (error) {
      console.error('Failed to update candlestick chart:', error);
    }
  }
  
  destroy(): void {
    if (this.chart) {
      chartManager.destroyChart('candlestickChart');
    }
  }
}

// Export factory functions for easy instantiation
export function createMarketHeatmap(containerId: string): MarketHeatmapCard {
  return new MarketHeatmapCard(containerId);
}

export function createRealTimeGauge(containerId: string, label: string, maxValue: number = 100): RealTimeGaugeCard {
  return new RealTimeGaugeCard(containerId, label, maxValue);
}

export function createInteractiveCandlestick(containerId: string): InteractiveCandlestickCard {
  return new InteractiveCandlestickCard(containerId);
}