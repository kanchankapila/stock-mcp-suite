/**
 * Comprehensive visualization library for stock analytics
 * Supports: Line charts, Candlestick, Gauges, Heatmaps, Radar charts, etc.
 */

import { Chart, ChartConfiguration, registerables } from 'chart.js';

// Register Chart.js components
Chart.register(...registerables);

// Color palettes for different chart types
const COLORS = {
  bull: '#26A69A',
  bear: '#EF5350',
  neutral: '#FFB74D',
  primary: '#2E86AB',
  secondary: '#A23B72',
  accent: '#F18F01',
  danger: '#C73E1D',
  success: '#00C851',
  warning: '#FFB300',
  gradient: {
    bull: ['#26A69A', '#4DB6AC'],
    bear: ['#EF5350', '#E57373'],
    primary: ['#2E86AB', '#5DADE2'],
    surface: ['#1E2328', '#2A2F36']
  }
};

export class StockVisualizations {
  private charts: Map<string, Chart> = new Map();

  /**
   * Create price chart with technical indicators
   */
  createPriceChart(canvasId: string, data: PriceData[], options: PriceChartOptions = {}): Chart {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) throw new Error(`Canvas ${canvasId} not found`);

    // Destroy existing chart
    this.destroyChart(canvasId);

    const prices = data.map(d => d.close);
    const labels = data.map(d => new Date(d.date).toLocaleDateString());
    
    // Calculate moving averages
    const sma20 = this.calculateSMA(prices, 20);
    const sma50 = this.calculateSMA(prices, 50);
    const ema12 = this.calculateEMA(prices, 12);

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Price',
            data: prices,
            borderColor: COLORS.primary,
            backgroundColor: this.createGradient(canvas, COLORS.gradient.primary),
            borderWidth: 3,
            fill: true,
            tension: 0.1
          },
          {
            label: 'SMA 20',
            data: sma20,
            borderColor: COLORS.warning,
            borderWidth: 2,
            fill: false,
            pointRadius: 0
          },
          {
            label: 'SMA 50',
            data: sma50,
            borderColor: COLORS.danger,
            borderWidth: 2,
            fill: false,
            pointRadius: 0
          },
          {
            label: 'EMA 12',
            data: ema12,
            borderColor: COLORS.success,
            borderWidth: 2,
            fill: false,
            pointRadius: 0,
            borderDash: [5, 5]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: '#E8EAED',
              font: { size: 12 }
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: 'rgba(30, 35, 40, 0.95)',
            titleColor: '#E8EAED',
            bodyColor: '#E8EAED',
            borderColor: COLORS.primary,
            borderWidth: 1
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#9AA0A6' }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#9AA0A6' }
          }
        },
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false
        },
        ...options.chartOptions
      }
    };

    const chart = new Chart(canvas, config);
    this.charts.set(canvasId, chart);
    return chart;
  }

  /**
   * Create candlestick chart for OHLC data
   */
  createCandlestickChart(canvasId: string, data: OHLCData[]): Chart {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) throw new Error(`Canvas ${canvasId} not found`);

    this.destroyChart(canvasId);

    // Custom candlestick drawing
    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: data.map(d => new Date(d.date).toLocaleDateString()),
        datasets: [
          {
            label: 'OHLC',
            data: data.map(d => ({
              x: d.date,
              o: d.open,
              h: d.high,
              l: d.low,
              c: d.close
            })),
            backgroundColor: data.map(d => d.close >= d.open ? COLORS.bull : COLORS.bear),
            borderColor: data.map(d => d.close >= d.open ? COLORS.bull : COLORS.bear),
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(30, 35, 40, 0.95)',
            titleColor: '#E8EAED',
            bodyColor: '#E8EAED',
            callbacks: {
              label: (context) => {
                const data = context.raw as any;
                return [
                  `Open: ${data.o?.toFixed(2)}`,
                  `High: ${data.h?.toFixed(2)}`,
                  `Low: ${data.l?.toFixed(2)}`,
                  `Close: ${data.c?.toFixed(2)}`,
                  `Change: ${((data.c - data.o) / data.o * 100).toFixed(2)}%`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#9AA0A6' }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#9AA0A6' }
          }
        }
      }
    };

    const chart = new Chart(canvas, config);
    this.charts.set(canvasId, chart);
    return chart;
  }

  /**
   * Create sentiment gauge
   */
  createSentimentGauge(containerId: string, value: number, label: string = 'Sentiment'): void {
    const container = document.getElementById(containerId);
    if (!container) return;

    const normalizedValue = Math.max(-1, Math.min(1, value)); // Clamp between -1 and 1
    const percentage = ((normalizedValue + 1) / 2) * 100;
    
    const color = normalizedValue > 0.2 ? COLORS.success : 
                  normalizedValue < -0.2 ? COLORS.danger : 
                  COLORS.warning;

    container.innerHTML = `
      <div class="gauge-container">
        <svg class="gauge-svg" viewBox="0 0 200 120">
          <!-- Background arc -->
          <path class="gauge-background" 
                d="M 20 100 A 80 80 0 0 1 180 100" 
                stroke="rgba(255,255,255,0.1)" 
                stroke-width="12" 
                fill="none"/>
          
          <!-- Progress arc -->
          <path class="gauge-progress" 
                d="M 20 100 A 80 80 0 0 1 180 100" 
                stroke="${color}" 
                stroke-width="12" 
                fill="none"
                stroke-linecap="round"
                stroke-dasharray="${percentage * 2.51}, 251"/>
          
          <!-- Center text -->
          <text class="gauge-text" x="100" y="85" text-anchor="middle" fill="#E8EAED">
            ${normalizedValue.toFixed(2)}
          </text>
          <text x="100" y="105" text-anchor="middle" fill="#9AA0A6" font-size="12">
            ${label}
          </text>
        </svg>
      </div>
    `;
  }

  /**
   * Create performance heatmap
   */
  createPerformanceHeatmap(containerId: string, data: HeatmapData[]): void {
    const container = document.getElementById(containerId);
    if (!container) return;

    const cells = data.map(item => {
      const intensity = Math.abs(item.value) / Math.max(...data.map(d => Math.abs(d.value)));
      const isPositive = item.value >= 0;
      
      const backgroundColor = isPositive ? 
        `rgba(38, 166, 154, ${0.2 + intensity * 0.6})` : 
        `rgba(239, 83, 80, ${0.2 + intensity * 0.6})`;
      
      const textColor = intensity > 0.6 ? '#FFFFFF' : '#E8EAED';
      
      return `
        <div class="heatmap-cell" style="background-color: ${backgroundColor}; color: ${textColor};" 
             title="${item.label}: ${item.value.toFixed(2)}%">
          <div class="heatmap-symbol">${item.symbol}</div>
          <div class="heatmap-value">${item.value >= 0 ? '+' : ''}${item.value.toFixed(1)}%</div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="heatmap-container">
        ${cells}
      </div>
    `;
  }

  /**
   * Create volume analysis chart
   */
  createVolumeChart(canvasId: string, data: VolumeData[]): Chart {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) throw new Error(`Canvas ${canvasId} not found`);

    this.destroyChart(canvasId);

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: data.map(d => new Date(d.date).toLocaleDateString()),
        datasets: [
          {
            label: 'Volume',
            data: data.map(d => d.volume),
            backgroundColor: data.map(d => 
              d.priceChange >= 0 ? COLORS.bull + '80' : COLORS.bear + '80'
            ),
            borderColor: data.map(d => 
              d.priceChange >= 0 ? COLORS.bull : COLORS.bear
            ),
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(30, 35, 40, 0.95)',
            titleColor: '#E8EAED',
            bodyColor: '#E8EAED',
            callbacks: {
              label: (context) => {
                const index = context.dataIndex;
                const volume = data[index].volume;
                const change = data[index].priceChange;
                return [
                  `Volume: ${this.formatNumber(volume)}`,
                  `Price Change: ${change >= 0 ? '+' : ''}${change.toFixed(2)}%`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#9AA0A6' }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { 
              color: '#9AA0A6',
              callback: (value) => this.formatNumber(Number(value))
            }
          }
        }
      }
    };

    const chart = new Chart(canvas, config);
    this.charts.set(canvasId, chart);
    return chart;
  }

  /**
   * Create radar chart for technical analysis
   */
  createTechnicalRadar(canvasId: string, data: TechnicalData): Chart {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) throw new Error(`Canvas ${canvasId} not found`);

    this.destroyChart(canvasId);

    const indicators = Object.keys(data);
    const values = Object.values(data).map(v => Math.max(0, Math.min(100, v))); // Normalize 0-100

    const config: ChartConfiguration = {
      type: 'radar',
      data: {
        labels: indicators.map(i => i.toUpperCase()),
        datasets: [
          {
            label: 'Technical Strength',
            data: values,
            backgroundColor: COLORS.primary + '40',
            borderColor: COLORS.primary,
            borderWidth: 2,
            pointBackgroundColor: COLORS.primary,
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: COLORS.primary
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(30, 35, 40, 0.95)',
            titleColor: '#E8EAED',
            bodyColor: '#E8EAED'
          }
        },
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            grid: { color: 'rgba(255,255,255,0.2)' },
            angleLines: { color: 'rgba(255,255,255,0.2)' },
            pointLabels: {
              color: '#E8EAED',
              font: { size: 11 }
            },
            ticks: {
              color: '#9AA0A6',
              backdropColor: 'transparent'
            }
          }
        }
      }
    };

    const chart = new Chart(canvas, config);
    this.charts.set(canvasId, chart);
    return chart;
  }

  /**
   * Create portfolio allocation donut chart
   */
  createPortfolioChart(canvasId: string, data: PortfolioData[]): Chart {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) throw new Error(`Canvas ${canvasId} not found`);

    this.destroyChart(canvasId);

    const colors = this.generateColorPalette(data.length);

    const config: ChartConfiguration = {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.symbol),
        datasets: [
          {
            data: data.map(d => d.value),
            backgroundColor: colors,
            borderColor: colors.map(c => c.replace('0.8', '1')),
            borderWidth: 2,
            hoverBorderWidth: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: '#E8EAED',
              font: { size: 12 },
              usePointStyle: true,
              padding: 20
            }
          },
          tooltip: {
            backgroundColor: 'rgba(30, 35, 40, 0.95)',
            titleColor: '#E8EAED',
            bodyColor: '#E8EAED',
            callbacks: {
              label: (context) => {
                const total = data.reduce((sum, item) => sum + item.value, 0);
                const percentage = ((context.parsed / total) * 100).toFixed(1);
                return `${context.label}: ₹${this.formatNumber(context.parsed)} (${percentage}%)`;
              }
            }
          }
        }
      }
    };

    const chart = new Chart(canvas, config);
    this.charts.set(canvasId, chart);
    return chart;
  }

  /**
   * Create RSI oscillator chart
   */
  createRSIChart(canvasId: string, data: RSIData[]): Chart {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) throw new Error(`Canvas ${canvasId} not found`);

    this.destroyChart(canvasId);

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: data.map(d => new Date(d.date).toLocaleDateString()),
        datasets: [
          {
            label: 'RSI',
            data: data.map(d => d.rsi),
            borderColor: COLORS.accent,
            backgroundColor: COLORS.accent + '20',
            borderWidth: 2,
            fill: true,
            tension: 0.1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(30, 35, 40, 0.95)',
            titleColor: '#E8EAED',
            bodyColor: '#E8EAED'
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#9AA0A6' }
          },
          y: {
            min: 0,
            max: 100,
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#9AA0A6' }
          }
        },
        annotation: {
          annotations: {
            overbought: {
              type: 'line',
              yMin: 70,
              yMax: 70,
              borderColor: COLORS.danger,
              borderWidth: 2,
              borderDash: [6, 6]
            },
            oversold: {
              type: 'line',
              yMin: 30,
              yMax: 30,
              borderColor: COLORS.success,
              borderWidth: 2,
              borderDash: [6, 6]
            }
          }
        }
      }
    };

    const chart = new Chart(canvas, config);
    this.charts.set(canvasId, chart);
    return chart;
  }

  /**
   * Create news sentiment timeline
   */
  createSentimentTimeline(canvasId: string, data: SentimentData[]): Chart {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) throw new Error(`Canvas ${canvasId} not found`);

    this.destroyChart(canvasId);

    const config: ChartConfiguration = {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Positive',
            data: data.filter(d => d.sentiment > 0).map(d => ({
              x: new Date(d.date).getTime(),
              y: d.sentiment
            })),
            backgroundColor: COLORS.success,
            borderColor: COLORS.success,
            pointRadius: 6,
            pointHoverRadius: 8
          },
          {
            label: 'Negative',
            data: data.filter(d => d.sentiment < 0).map(d => ({
              x: new Date(d.date).getTime(),
              y: d.sentiment
            })),
            backgroundColor: COLORS.danger,
            borderColor: COLORS.danger,
            pointRadius: 6,
            pointHoverRadius: 8
          },
          {
            label: 'Neutral',
            data: data.filter(d => d.sentiment === 0).map(d => ({
              x: new Date(d.date).getTime(),
              y: d.sentiment
            })),
            backgroundColor: COLORS.neutral,
            borderColor: COLORS.neutral,
            pointRadius: 4,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#E8EAED' }
          },
          tooltip: {
            backgroundColor: 'rgba(30, 35, 40, 0.95)',
            titleColor: '#E8EAED',
            bodyColor: '#E8EAED',
            callbacks: {
              label: (context) => {
                const dataIndex = data.findIndex(d => 
                  new Date(d.date).getTime() === context.parsed.x
                );
                const item = data[dataIndex];
                return [
                  `Sentiment: ${context.parsed.y.toFixed(3)}`,
                  `Title: ${item?.title?.slice(0, 50) || 'N/A'}...`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: { unit: 'day' },
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#9AA0A6' }
          },
          y: {
            min: -1,
            max: 1,
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#9AA0A6' }
          }
        }
      }
    };

    const chart = new Chart(canvas, config);
    this.charts.set(canvasId, chart);
    return chart;
  }

  /**
   * Create metric comparison chart
   */
  createMetricComparison(canvasId: string, symbols: string[], metrics: MetricData[]): Chart {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) throw new Error(`Canvas ${canvasId} not found`);

    this.destroyChart(canvasId);

    const datasets = symbols.map((symbol, index) => {
      const symbolData = metrics.filter(m => m.symbol === symbol);
      const color = this.generateColorPalette(symbols.length)[index];
      
      return {
        label: symbol,
        data: symbolData.map(d => d.value),
        borderColor: color,
        backgroundColor: color + '20',
        borderWidth: 3,
        fill: false,
        tension: 0.1
      };
    });

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: metrics.filter(m => m.symbol === symbols[0]).map(m => 
          new Date(m.date).toLocaleDateString()
        ),
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#E8EAED' }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: 'rgba(30, 35, 40, 0.95)',
            titleColor: '#E8EAED',
            bodyColor: '#E8EAED'
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#9AA0A6' }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#9AA0A6' }
          }
        },
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false
        }
      }
    };

    const chart = new Chart(canvas, config);
    this.charts.set(canvasId, chart);
    return chart;
  }

  /**
   * Create correlation matrix heatmap
   */
  createCorrelationMatrix(containerId: string, data: CorrelationData[]): void {
    const container = document.getElementById(containerId);
    if (!container) return;

    const symbols = [...new Set(data.map(d => d.symbol1).concat(data.map(d => d.symbol2)))];
    const size = symbols.length;
    
    let html = '<div style="display: grid; grid-template-columns: repeat(' + size + ', 1fr); gap: 2px;">';
    
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const symbol1 = symbols[i];
        const symbol2 = symbols[j];
        
        let correlation = 0;
        if (i === j) {
          correlation = 1; // Self correlation
        } else {
          const item = data.find(d => 
            (d.symbol1 === symbol1 && d.symbol2 === symbol2) ||
            (d.symbol1 === symbol2 && d.symbol2 === symbol1)
          );
          correlation = item ? item.correlation : 0;
        }
        
        const intensity = Math.abs(correlation);
        const color = correlation > 0 ? COLORS.bull : COLORS.bear;
        const backgroundColor = `${color}${Math.floor(intensity * 255).toString(16).padStart(2, '0')}`;
        const textColor = intensity > 0.5 ? '#FFFFFF' : '#E8EAED';
        
        html += `
          <div style="
            aspect-ratio: 1;
            background-color: ${backgroundColor};
            color: ${textColor};
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.7rem;
            font-weight: 600;
            border-radius: 4px;
            cursor: pointer;
          " title="${symbol1} vs ${symbol2}: ${correlation.toFixed(3)}">
            ${correlation.toFixed(2)}
          </div>
        `;
      }
    }
    
    html += '</div>';
    
    // Add legend
    html += `
      <div style="display: flex; justify-content: space-between; margin-top: 1rem; font-size: 0.8rem; color: #9AA0A6;">
        <span>Strong Negative</span>
        <span>Weak</span>
        <span>Strong Positive</span>
      </div>
    `;
    
    container.innerHTML = html;
  }

  /**
   * Create risk-reward scatter plot
   */
  createRiskRewardChart(canvasId: string, data: RiskRewardData[]): Chart {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) throw new Error(`Canvas ${canvasId} not found`);

    this.destroyChart(canvasId);

    const config: ChartConfiguration = {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Stocks',
            data: data.map(d => ({
              x: d.risk,
              y: d.reward
            })),
            backgroundColor: data.map(d => 
              d.reward > d.risk ? COLORS.bull : COLORS.bear
            ),
            borderColor: data.map(d => 
              d.reward > d.risk ? COLORS.bull : COLORS.bear
            ),
            pointRadius: 8,
            pointHoverRadius: 12
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(30, 35, 40, 0.95)',
            titleColor: '#E8EAED',
            bodyColor: '#E8EAED',
            callbacks: {
              title: (context) => {
                const index = context[0].dataIndex;
                return data[index].symbol;
              },
              label: (context) => {
                return [
                  `Risk: ${context.parsed.x.toFixed(2)}%`,
                  `Reward: ${context.parsed.y.toFixed(2)}%`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Risk (%)',
              color: '#E8EAED'
            },
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#9AA0A6' }
          },
          y: {
            title: {
              display: true,
              text: 'Expected Return (%)',
              color: '#E8EAED'
            },
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: { color: '#9AA0A6' }
          }
        }
      }
    };

    const chart = new Chart(canvas, config);
    this.charts.set(canvasId, chart);
    return chart;
  }

  /**
   * Utility: Calculate Simple Moving Average
   */
  private calculateSMA(prices: number[], period: number): (number | null)[] {
    const sma: (number | null)[] = [];
    
    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) {
        sma.push(null);
      } else {
        const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        sma.push(sum / period);
      }
    }
    
    return sma;
  }

  /**
   * Utility: Calculate Exponential Moving Average
   */
  private calculateEMA(prices: number[], period: number): (number | null)[] {
    const ema: (number | null)[] = [];
    const k = 2 / (period + 1);
    
    for (let i = 0; i < prices.length; i++) {
      if (i === 0) {
        ema.push(prices[i]);
      } else {
        const prevEma = ema[i - 1] || prices[i];
        ema.push(prices[i] * k + prevEma * (1 - k));
      }
    }
    
    return ema;
  }

  /**
   * Utility: Create gradient
   */
  private createGradient(canvas: HTMLCanvasElement, colors: string[]): CanvasGradient {
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    
    colors.forEach((color, index) => {
      gradient.addColorStop(index / (colors.length - 1), color);
    });
    
    return gradient;
  }

  /**
   * Utility: Generate color palette
   */
  private generateColorPalette(count: number): string[] {
    const baseColors = [
      COLORS.primary,
      COLORS.secondary,
      COLORS.accent,
      COLORS.success,
      COLORS.warning,
      COLORS.bull,
      COLORS.bear,
      '#9C27B0',
      '#607D8B',
      '#795548'
    ];
    
    const colors: string[] = [];
    for (let i = 0; i < count; i++) {
      if (i < baseColors.length) {
        colors.push(baseColors[i] + 'CC'); // Add alpha
      } else {
        // Generate additional colors using HSL
        const hue = (i * 137.508) % 360; // Golden angle approximation
        colors.push(`hsla(${hue}, 70%, 60%, 0.8)`);
      }
    }
    
    return colors;
  }

  /**
   * Utility: Format numbers for display
   */
  private formatNumber(num: number): string {
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return num.toFixed(0);
  }

  /**
   * Destroy specific chart
   */
  destroyChart(canvasId: string): void {
    const existingChart = this.charts.get(canvasId);
    if (existingChart) {
      existingChart.destroy();
      this.charts.delete(canvasId);
    }
  }

  /**
   * Destroy all charts
   */
  destroyAllCharts(): void {
    for (const chart of this.charts.values()) {
      chart.destroy();
    }
    this.charts.clear();
  }

  /**
   * Update chart data
   */
  updateChart(canvasId: string, newData: any): void {
    const chart = this.charts.get(canvasId);
    if (chart) {
      chart.data = newData;
      chart.update('active');
    }
  }

  /**
   * Get chart instance
   */
  getChart(canvasId: string): Chart | undefined {
    return this.charts.get(canvasId);
  }
}

// Type definitions
export interface PriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OHLCData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface VolumeData {
  date: string;
  volume: number;
  priceChange: number;
}

export interface TechnicalData {
  rsi: number;
  macd: number;
  stochastic: number;
  adx: number;
  momentum: number;
  [key: string]: number;
}

export interface RSIData {
  date: string;
  rsi: number;
}

export interface SentimentData {
  date: string;
  sentiment: number;
  title: string;
}

export interface HeatmapData {
  symbol: string;
  label: string;
  value: number;
}

export interface PortfolioData {
  symbol: string;
  value: number;
  percentage: number;
}

export interface CorrelationData {
  symbol1: string;
  symbol2: string;
  correlation: number;
}

export interface RiskRewardData {
  symbol: string;
  risk: number;
  reward: number;
}

export interface MetricData {
  symbol: string;
  date: string;
  value: number;
  metric: string;
}

export interface PriceChartOptions {
  showVolume?: boolean;
  showIndicators?: boolean;
  chartOptions?: any;
}

// Global instance
export const stockVisualizations = new StockVisualizations();
