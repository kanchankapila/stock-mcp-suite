/**
 * ChartManager - Centralized chart management system for performance optimization
 * Handles chart creation, updates, cleanup, and memory management
 */

import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';

// Register Chart.js components
Chart.register(...registerables);

export interface ChartOptions {
  responsive?: boolean;
  maintainAspectRatio?: boolean;
  animation?: {
    duration: number;
    easing: string;
  };
  plugins?: any;
  scales?: any;
}

export interface StockData {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change?: number;
  changePercent?: number;
}

class ChartManager {
  private static instance: ChartManager;
  private charts = new Map<string, Chart>();
  private observers = new Map<string, IntersectionObserver>();
  private resizeObserver: ResizeObserver;
  private animationFrameId: number | null = null;
  
  // Performance monitoring
  private renderTimes: number[] = [];
  private lastCleanup = Date.now();
  
  // Theme configuration
  private theme = {
    colors: {
      primary: '#3b82f6',
      success: '#10b981',
      danger: '#ef4444',
      warning: '#f59e0b',
      info: '#0ea5e9',
      muted: '#6b7280'
    },
    gradients: {
      bull: ['#10b981', '#34d399'],
      bear: ['#ef4444', '#f87171'],
      neutral: ['#6b7280', '#9ca3af'],
      primary: ['#3b82f6', '#8b5cf6']
    }
  };
  
  private constructor() {
    this.initializeResizeObserver();
    this.scheduleCleanup();
  }
  
  static getInstance(): ChartManager {
    if (!ChartManager.instance) {
      ChartManager.instance = new ChartManager();
    }
    return ChartManager.instance;
  }
  
  /**
   * Create or update a chart with performance optimizations
   */
  createChart(
    id: string,
    type: ChartType,
    data: any,
    options: ChartOptions = {},
    lazy: boolean = true
  ): Chart | null {
    const startTime = performance.now();
    
    try {
      // Clean up existing chart
      this.destroyChart(id);
      
      const canvas = document.getElementById(id) as HTMLCanvasElement;
      if (!canvas) {
        console.warn(`Canvas with id '${id}' not found`);
        return null;
      }
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.warn(`Could not get 2D context for canvas '${id}'`);
        return null;
      }
      
      // Merge default options
      const chartOptions = this.mergeDefaultOptions(options);
      
      const config: ChartConfiguration = {
        type,
        data,
        options: chartOptions
      };
      
      // Create chart
      const chart = new Chart(ctx, config);
      this.charts.set(id, chart);
      
      // Add intersection observer for lazy loading
      if (lazy) {
        this.addIntersectionObserver(id, chart);
      }
      
      // Track performance
      const renderTime = performance.now() - startTime;
      this.renderTimes.push(renderTime);
      
      console.debug(`Chart '${id}' created in ${renderTime.toFixed(2)}ms`);
      return chart;
      
    } catch (error) {
      console.error(`Failed to create chart '${id}':`, error);
      return null;
    }
  }
  
  /**
   * Create animated gauge chart
   */
  createGauge(
    id: string,
    value: number,
    max: number = 100,
    label: string = '',
    color: string = this.theme.colors.primary
  ): Chart | null {
    const data = {
      datasets: [{
        data: [value, max - value],
        backgroundColor: [
          color,
          'rgba(229, 231, 235, 0.3)'
        ],
        borderWidth: 0,
        cutout: '80%'
      }]
    };
    
    const options: ChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      },
      animation: {
        duration: 1500,
        easing: 'easeOutCubic'
      }
    };
    
    const chart = this.createChart(id, 'doughnut', data, options, false);
    
    if (chart) {
      // Add custom plugin for center text
      Chart.register({
        id: 'centerText',
        afterDraw: (chart) => {
          const ctx = chart.ctx;
          const centerX = chart.width / 2;
          const centerY = chart.height / 2;
          
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Value
          ctx.font = 'bold 24px Inter, system-ui';
          ctx.fillStyle = color;
          ctx.fillText(`${value.toFixed(1)}`, centerX, centerY - 8);
          
          // Label
          if (label) {
            ctx.font = '12px Inter, system-ui';
            ctx.fillStyle = this.theme.colors.muted;
            ctx.fillText(label, centerX, centerY + 16);
          }
          
          ctx.restore();
        }
      });
    }
    
    return chart;
  }
  
  /**
   * Update chart data with animation
   */
  updateChart(id: string, newData: any): void {
    const chart = this.charts.get(id);
    if (!chart) return;
    
    const startTime = performance.now();
    
    chart.data = newData;
    chart.update('active');
    
    const updateTime = performance.now() - startTime;
    console.debug(`Chart '${id}' updated in ${updateTime.toFixed(2)}ms`);
  }
  
  /**
   * Destroy chart and cleanup resources
   */
  destroyChart(id: string): void {
    const chart = this.charts.get(id);
    const observer = this.observers.get(id);
    
    if (chart) {
      chart.destroy();
      this.charts.delete(id);
    }
    
    if (observer) {
      observer.disconnect();
      this.observers.delete(id);
    }
  }
  
  /**
   * Cleanup all charts and observers
   */
  cleanup(): void {
    this.charts.forEach(chart => chart.destroy());
    this.observers.forEach(observer => observer.disconnect());
    
    this.charts.clear();
    this.observers.clear();
    
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }
  
  /**
   * Get performance metrics
   */
  getMetrics() {
    const avgRenderTime = this.renderTimes.length > 0 ? 
      this.renderTimes.reduce((a, b) => a + b) / this.renderTimes.length : 0;
    
    return {
      totalCharts: this.charts.size,
      avgRenderTime: avgRenderTime.toFixed(2),
      memoryUsage: this.charts.size * 0.1, // Rough estimate in MB
      lastCleanup: new Date(this.lastCleanup).toISOString()
    };
  }
  
  // Private methods
  
  private mergeDefaultOptions(options: ChartOptions): any {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 750,
        easing: 'easeOutQuart'
      },
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: this.theme.colors.primary,
          borderWidth: 1
        }
      },
      ...options
    };
  }
  
  private addIntersectionObserver(id: string, chart: Chart): void {
    const element = document.getElementById(id)?.parentElement;
    if (!element) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            // Trigger chart update when visible
            if (this.animationFrameId) {
              cancelAnimationFrame(this.animationFrameId);
            }
            this.animationFrameId = requestAnimationFrame(() => {
              chart.update('none');
            });
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '50px'
      }
    );
    
    observer.observe(element);
    this.observers.set(id, observer);
  }
  
  private initializeResizeObserver(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      entries.forEach(entry => {
        const canvas = entry.target.querySelector('canvas');
        if (canvas && canvas.id) {
          const chart = this.charts.get(canvas.id);
          if (chart) {
            chart.resize();
          }
        }
      });
    });
  }
  
  private scheduleCleanup(): void {
    // Periodic cleanup every 5 minutes
    setInterval(() => {
      // Clear old render times
      if (this.renderTimes.length > 100) {
        this.renderTimes = this.renderTimes.slice(-50);
      }
      
      // Update last cleanup time
      this.lastCleanup = Date.now();
      
      console.debug('ChartManager cleanup completed');
    }, 5 * 60 * 1000);
  }
}

// Export singleton instance
export const chartManager = ChartManager.getInstance();
export default chartManager;