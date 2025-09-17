/**
 * Centralized chart utilities with performance optimization and consistent styling
 */

import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';
import 'chartjs-adapter-date-fns';

// Register Chart.js components
Chart.register(...registerables);

export interface ChartTheme {
  primary: string;
  success: string;
  danger: string;
  warning: string;
  info: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
}

export interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalIndicator {
  name: string;
  data: Array<{ x: string; y: number }>;
  color: string;
  type: 'line' | 'area';
}

export class ChartUtils {
  private static chartInstances = new Map<string, Chart>();
  private static theme: ChartTheme = ChartUtils.getTheme();
  
  /**
   * Get current theme colors
   */
  private static getTheme(): ChartTheme {
    const root = getComputedStyle(document.documentElement);
    return {
      primary: root.getPropertyValue('--primary-500')?.trim() || '#3b82f6',
      success: root.getPropertyValue('--success-500')?.trim() || '#22c55e',
      danger: root.getPropertyValue('--danger-500')?.trim() || '#ef4444',
      warning: root.getPropertyValue('--warning-500')?.trim() || '#f59e0b',
      info: root.getPropertyValue('--info-500')?.trim() || '#0ea5e9',
      background: root.getPropertyValue('--bg')?.trim() || '#ffffff',
      surface: root.getPropertyValue('--surface')?.trim() || '#f8fafc',
      text: root.getPropertyValue('--text')?.trim() || '#1f2937',
      muted: root.getPropertyValue('--text-muted')?.trim() || '#6b7280',
      border: root.getPropertyValue('--border')?.trim() || '#e5e7eb'
    };
  }

  /**
   * Create responsive chart with optimizations
   */
  static createChart(canvas: HTMLCanvasElement | string, config: ChartConfiguration): Chart {
    const canvasElement = typeof canvas === 'string' 
      ? document.getElementById(canvas) as HTMLCanvasElement
      : canvas;
    
    if (!canvasElement) {
      throw new Error('Canvas element not found');
    }

    const chartId = canvasElement.id || `chart-${Date.now()}`;
    
    // Destroy existing chart if it exists
    ChartUtils.destroyChart(chartId);
    
    const optimizedConfig = ChartUtils.applyOptimizations(config);
    const chart = new Chart(canvasElement, optimizedConfig);
    
    ChartUtils.chartInstances.set(chartId, chart);
    return chart;
  }

  /**
   * Apply performance optimizations to chart config
   */
  private static applyOptimizations(config: ChartConfiguration): ChartConfiguration {
    return {
      ...config,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        animation: {
          duration: 300, // Reduced animation time
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: ChartUtils.theme.text,
              usePointStyle: true,
              padding: 20
            }
          },
          tooltip: {
            enabled: true,
            backgroundColor: ChartUtils.theme.surface,
            titleColor: ChartUtils.theme.text,
            bodyColor: ChartUtils.theme.text,
            borderColor: ChartUtils.theme.border,
            borderWidth: 1,
            cornerRadius: 8,
            displayColors: false
          },
          ...config.options?.plugins
        },
        scales: {
          x: {
            grid: {
              color: ChartUtils.theme.border,
              drawBorder: false
            },
            ticks: {
              color: ChartUtils.theme.muted
            }
          },
          y: {
            grid: {
              color: ChartUtils.theme.border,
              drawBorder: false
            },
            ticks: {
              color: ChartUtils.theme.muted
            }
          },
          ...config.options?.scales
        },
        ...config.options
      }
    };
  }

  /**
   * Create stock price chart with candlesticks
   */
  static createStockChart(canvas: HTMLCanvasElement | string, data: StockData[], indicators: TechnicalIndicator[] = []): Chart {
    const datasets = [
      {
        label: 'Price',
        data: data.map(d => ({
          x: d.date,
          o: d.open,
          h: d.high,
          l: d.low,
          c: d.close
        })),
        borderColor: ChartUtils.theme.primary,
        backgroundColor: ChartUtils.withAlpha(ChartUtils.theme.primary, 0.1)
      },
      ...indicators.map(indicator => ({
        label: indicator.name,
        data: indicator.data,
        borderColor: indicator.color,
        backgroundColor: indicator.type === 'area' 
          ? ChartUtils.withAlpha(indicator.color, 0.1)
          : 'transparent',
        type: 'line' as const,
        fill: indicator.type === 'area'
      }))
    ];

    return ChartUtils.createChart(canvas, {
      type: 'candlestick' as ChartType,
      data: { datasets },
      options: {
        plugins: {
          tooltip: {
            callbacks: {
              title: (ctx) => ChartUtils.formatDate(ctx[0].label),
              label: (ctx) => {
                if (ctx.dataset.label === 'Price') {
                  const data = ctx.raw as any;
                  return [
                    `Open: ${ChartUtils.formatCurrency(data.o)}`,
                    `High: ${ChartUtils.formatCurrency(data.h)}`,
                    `Low: ${ChartUtils.formatCurrency(data.l)}`,
                    `Close: ${ChartUtils.formatCurrency(data.c)}`
                  ];
                }
                return `${ctx.dataset.label}: ${ChartUtils.formatNumber(ctx.parsed.y)}`;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'day'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Price ($)',
              color: ChartUtils.theme.text
            }
          }
        }
      }
    });
  }

  /**
   * Create volume chart
   */
  static createVolumeChart(canvas: HTMLCanvasElement | string, data: StockData[]): Chart {
    return ChartUtils.createChart(canvas, {
      type: 'bar',
      data: {
        labels: data.map(d => d.date),
        datasets: [{
          label: 'Volume',
          data: data.map(d => d.volume),
          backgroundColor: data.map(d => 
            d.close > d.open 
              ? ChartUtils.withAlpha(ChartUtils.theme.success, 0.6)
              : ChartUtils.withAlpha(ChartUtils.theme.danger, 0.6)
          ),
          borderColor: data.map(d => 
            d.close > d.open ? ChartUtils.theme.success : ChartUtils.theme.danger
          ),
          borderWidth: 1
        }]
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Volume: ${ChartUtils.formatNumber(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          y: {
            title: {
              display: true,
              text: 'Volume',
              color: ChartUtils.theme.text
            }
          }
        }
      }
    });
  }

  /**
   * Create sparkline chart
   */
  static createSparkline(canvas: HTMLCanvasElement | string, data: number[], positive: boolean = true): Chart {
    const color = positive ? ChartUtils.theme.success : ChartUtils.theme.danger;
    
    return ChartUtils.createChart(canvas, {
      type: 'line',
      data: {
        labels: data.map((_, i) => i),
        datasets: [{
          data,
          borderColor: color,
          backgroundColor: ChartUtils.withAlpha(color, 0.1),
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        elements: {
          point: {
            hoverRadius: 4
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        scales: {
          x: { display: false },
          y: { display: false }
        },
        animation: { duration: 0 } // No animation for sparklines
      }
    });
  }

  /**
   * Create sentiment gauge
   */
  static createSentimentGauge(canvas: HTMLCanvasElement | string, sentiment: number): Chart {
    const getColor = (value: number) => {
      if (value > 0.6) return ChartUtils.theme.success;
      if (value < 0.4) return ChartUtils.theme.danger;
      return ChartUtils.theme.warning;
    };

    return ChartUtils.createChart(canvas, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [sentiment, 1 - sentiment],
          backgroundColor: [
            getColor(sentiment),
            ChartUtils.withAlpha(ChartUtils.theme.border, 0.3)
          ],
          borderWidth: 0
        }]
      },
      options: {
        circumference: 180,
        rotation: 270,
        cutout: '75%',
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        }
      }
    });
  }

  /**
   * Create heatmap chart
   */
  static createHeatmap(canvas: HTMLCanvasElement | string, data: Array<{x: string, y: string, v: number}>): Chart {
    return ChartUtils.createChart(canvas, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Heatmap',
          data: data.map(d => ({ x: d.x, y: d.y })),
          backgroundColor: data.map(d => ChartUtils.getHeatmapColor(d.v)),
          pointRadius: 15
        }]
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const point = data[ctx.dataIndex];
                return `${point.x}, ${point.y}: ${point.v.toFixed(2)}`;
              }
            }
          }
        }
      }
    });
  }

  /**
   * Utility methods
   */
  static formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  static formatNumber(value: number): string {
    if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
    return value.toFixed(2);
  }

  static formatPercentage(value: number): string {
    return `${(value * 100).toFixed(2)}%`;
  }

  static formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  static withAlpha(color: string, alpha: number): string {
    if (color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return color;
  }

  private static getHeatmapColor(value: number): string {
    const colors = [
      ChartUtils.theme.danger,
      ChartUtils.theme.warning,
      ChartUtils.theme.success
    ];
    const index = Math.floor(value * (colors.length - 1));
    return colors[Math.max(0, Math.min(index, colors.length - 1))];
  }

  /**
   * Chart management
   */
  static destroyChart(chartId: string): void {
    const chart = ChartUtils.chartInstances.get(chartId);
    if (chart) {
      chart.destroy();
      ChartUtils.chartInstances.delete(chartId);
    }
  }

  static destroyAllCharts(): void {
    for (const [id, chart] of ChartUtils.chartInstances) {
      chart.destroy();
    }
    ChartUtils.chartInstances.clear();
  }

  static updateTheme(): void {
    ChartUtils.theme = ChartUtils.getTheme();
    // Update existing charts with new theme
    for (const chart of ChartUtils.chartInstances.values()) {
      chart.update('none');
    }
  }

  static getChartInstance(chartId: string): Chart | undefined {
    return ChartUtils.chartInstances.get(chartId);
  }
}

// Export Chart.js for advanced usage
export { Chart, ChartConfiguration, ChartType };
