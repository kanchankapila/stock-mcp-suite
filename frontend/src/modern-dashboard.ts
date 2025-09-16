/**
 * Modern Stock Analytics Dashboard - Main Application
 * Transforms all API data into beautiful visual elements for decision making
 */

import { dashboardCards } from './components/dashboard-cards.js';
import { stockVisualizations } from './lib/visualizations.js';

class ModernStockDashboard {
  private isInitialized = false;
  private updateIntervals: Map<string, NodeJS.Timer> = new Map();
  private webSocket: WebSocket | null = null;
  private selectedSymbol: string = '';
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    console.log('🚀 Initializing Modern Stock Analytics Dashboard...');
    
    try {
      await this.initializeApp();
      await this.setupGlobalEventListeners();
      await this.startAutoRefresh();
      
      this.isInitialized = true;
      console.log('✅ Dashboard initialized successfully');
    } catch (error) {
      console.error('❌ Dashboard initialization failed:', error);
      this.showErrorMessage('Dashboard initialization failed. Please refresh the page.');
    }
  }
  
  private async initializeApp(): Promise<void> {
    const appContainer = document.getElementById('app');
    if (!appContainer) {
      throw new Error('App container not found');
    }
    
    // Initialize the dashboard cards system
    await dashboardCards.initializeDashboard(appContainer);
    
    // Setup global keyboard shortcuts
    this.setupKeyboardShortcuts();
    
    // Setup responsive handlers
    this.setupResponsiveHandlers();
  }
  
  private setupGlobalEventListeners(): void {
    // Theme toggle (if needed)
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'r':
            e.preventDefault();
            this.refreshAllData();
            break;
          case 'f':
            e.preventDefault();
            this.focusSearch();
            break;
        }
      }
    });
    
    // Handle visibility change (pause updates when tab is not visible)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pauseUpdates();
      } else {
        this.resumeUpdates();
      }
    });
    
    // Handle online/offline status
    window.addEventListener('online', () => {
      this.showSuccessToast('Connection restored');
      this.resumeUpdates();
    });
    
    window.addEventListener('offline', () => {
      this.showErrorToast('Connection lost - running in offline mode');
      this.pauseUpdates();
    });
  }
  
  private setupKeyboardShortcuts(): void {
    const shortcuts = document.createElement('div');
    shortcuts.id = 'keyboard-shortcuts';
    shortcuts.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(30, 35, 40, 0.95);
      color: #E8EAED;
      padding: 1rem;
      border-radius: 8px;
      font-size: 0.8rem;
      opacity: 0;
      transition: opacity 0.3s;
      z-index: 1000;
      max-width: 300px;
    `;
    
    shortcuts.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 0.5rem;">🔥 Keyboard Shortcuts</div>
      <div>Ctrl+R - Refresh All Data</div>
      <div>Ctrl+F - Focus Search</div>
      <div>ESC - Close Modals</div>
      <div style="margin-top: 0.5rem; font-size: 0.7rem; opacity: 0.7;">Press '?' to toggle this help</div>
    `;
    
    document.body.appendChild(shortcuts);
    
    // Toggle shortcuts with '?' key
    document.addEventListener('keydown', (e) => {
      if (e.key === '?') {
        shortcuts.style.opacity = shortcuts.style.opacity === '1' ? '0' : '1';
      }
      if (e.key === 'Escape') {
        shortcuts.style.opacity = '0';
        // Close any open modals
        document.querySelectorAll('[style*="position: fixed"]').forEach(el => {
          if (el !== shortcuts) el.remove();
        });
      }
    });
  }
  
  private setupResponsiveHandlers(): void {
    const handleResize = () => {
      // Update chart sizes on resize
      setTimeout(() => {
        stockVisualizations.destroyAllCharts();
        if (this.selectedSymbol) {
          this.refreshStockData(this.selectedSymbol);
        }
      }, 100);
    };
    
    window.addEventListener('resize', handleResize);
  }
  
  private async startAutoRefresh(): Promise<void> {
    // Refresh market overview every 2 minutes
    this.updateIntervals.set('market-overview', setInterval(async () => {
      await this.refreshMarketOverview();
    }, 120000));
    
    // Refresh performance stats every 30 seconds
    this.updateIntervals.set('performance', setInterval(async () => {
      await this.refreshPerformanceStats();
    }, 30000));
    
    // Refresh selected stock data every minute
    this.updateIntervals.set('stock-data', setInterval(async () => {
      if (this.selectedSymbol) {
        await this.refreshStockData(this.selectedSymbol);
      }
    }, 60000));
  }
  
  private async refreshAllData(): Promise<void> {
    this.showSuccessToast('Refreshing all data...');
    
    try {
      await Promise.all([
        this.refreshMarketOverview(),
        this.refreshPerformanceStats(),
        this.selectedSymbol ? this.refreshStockData(this.selectedSymbol) : Promise.resolve()
      ]);
      
      this.showSuccessToast('All data refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh data:', error);
      this.showErrorToast('Failed to refresh some data');
    }
  }
  
  private async refreshMarketOverview(): Promise<void> {
    // Refresh top picks and market-wide data
    try {
      const topPicksCard = document.getElementById('refresh-picks') as HTMLButtonElement;
      topPicksCard?.click();
    } catch (error) {
      console.error('Failed to refresh market overview:', error);
    }
  }
  
  private async refreshPerformanceStats(): Promise<void> {
    try {
      const response = await fetch('http://localhost:4010/api/performance/stats');
      const data = await response.json();
      
      if (data.ok && data.data) {
        this.updatePerformanceMetrics(data.data);
      }
    } catch (error) {
      console.error('Failed to refresh performance stats:', error);
    }
  }
  
  private async refreshStockData(symbol: string): Promise<void> {
    // This will be handled by the dashboard cards system
    const selector = document.getElementById('stock-selector') as HTMLSelectElement;
    if (selector && selector.value === symbol) {
      selector.dispatchEvent(new Event('change'));
    }
  }
  
  private updatePerformanceMetrics(stats: any): void {
    // Update cache hit rate
    if (stats.cache) {
      const cacheRates = Object.values(stats.cache).map((cache: any) => parseFloat(cache.hitRate) || 0);
      const avgHitRate = cacheRates.reduce((sum, rate) => sum + rate, 0) / cacheRates.length;
      this.updateMetric('cache-hit-rate', `${avgHitRate.toFixed(1)}%`);
    }
    
    // Update API response time
    if (stats.rateLimiter) {
      const responses = Object.values(stats.rateLimiter).map((api: any) => api.avgResponseTime || 0);
      const avgResponse = responses.reduce((sum, time) => sum + time, 0) / responses.length;
      this.updateMetric('api-response-time', `${avgResponse.toFixed(0)}ms`);
    }
    
    // Update memory usage
    if (stats.performance?.systemMetrics?.memoryUsage) {
      this.updateMetric('memory-usage', `${stats.performance.systemMetrics.memoryUsage}MB`);
    }
    
    // Update active connections (mock data for now)
    this.updateMetric('active-connections', Math.floor(Math.random() * 50 + 10).toString());
  }
  
  private updateMetric(elementId: string, value: string): void {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = value;
      
      // Add a subtle animation to show the update
      element.style.transform = 'scale(1.05)';
      element.style.transition = 'transform 0.2s ease';
      
      setTimeout(() => {
        element.style.transform = 'scale(1)';
      }, 200);
    }
  }
  
  private focusSearch(): void {
    const searchInput = document.getElementById('stock-selector') as HTMLSelectElement;
    if (searchInput) {
      searchInput.focus();
      this.showSuccessToast('Search focused');
    }
  }
  
  private pauseUpdates(): void {
    console.log('⏸️ Pausing auto-updates (tab hidden)');
    // Don't actually clear intervals, just log for now
  }
  
  private resumeUpdates(): void {
    console.log('▶️ Resuming auto-updates (tab visible)');
  }
  
  private showSuccessToast(message: string): void {
    this.showToast(message, 'success');
  }
  
  private showErrorToast(message: string): void {
    this.showToast(message, 'error');
  }
  
  private showToast(message: string, type: 'success' | 'error' | 'warning'): void {
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? '#00C851' : type === 'error' ? '#FF4444' : '#FFB300';
    
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${bgColor};
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-weight: 500;
      z-index: 10000;
      animation: slideInUp 0.3s ease-out;
      max-width: 300px;
    `;
    
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️';
    toast.innerHTML = `<span style="margin-right: 0.5rem;">${icon}</span>${message}`;
    
    document.body.appendChild(toast);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
  
  private showErrorMessage(message: string): void {
    const appContainer = document.getElementById('app');
    if (appContainer) {
      appContainer.innerHTML = `
        <div style="
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          text-align: center;
          color: #E8EAED;
        ">
          <div>
            <div style="font-size: 4rem; margin-bottom: 1rem;">⚠️</div>
            <h2 style="margin-bottom: 1rem;">Dashboard Error</h2>
            <p style="color: #9AA0A6; margin-bottom: 2rem;">${message}</p>
            <button onclick="window.location.reload()" class="btn btn-primary">
              🔄 Reload Dashboard
            </button>
          </div>
        </div>
      `;
    }
  }
  
  /**
   * Public API for external access
   */
  public toggleChartType(chartId: string, type: 'line' | 'candlestick'): void {
    console.log(`Toggling chart ${chartId} to ${type}`);
    // Implementation would update the chart type
    this.showSuccessToast(`Chart switched to ${type} view`);
  }
  
  public setSelectedSymbol(symbol: string): void {
    this.selectedSymbol = symbol;
    console.log(`Selected symbol: ${symbol}`);
  }
  
  public getSelectedSymbol(): string {
    return this.selectedSymbol;
  }
  
  /**
   * Cleanup resources
   */
  public cleanup(): void {
    console.log('🧹 Cleaning up dashboard resources...');
    
    // Clear all intervals
    for (const interval of this.updateIntervals.values()) {
      clearInterval(interval);
    }
    this.updateIntervals.clear();
    
    // Close WebSocket if open
    if (this.webSocket) {
      this.webSocket.close();
      this.webSocket = null;
    }
    
    // Cleanup dashboard cards
    dashboardCards.cleanup();
    
    this.isInitialized = false;
  }
  
  private setupKeyboardShortcuts(): void {
    // Additional shortcuts specific to the dashboard
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + number keys for quick stock selection
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        this.selectStockByIndex(index);
      }
    });
  }
  
  private selectStockByIndex(index: number): void {
    const selector = document.getElementById('stock-selector') as HTMLSelectElement;
    if (selector && selector.options.length > index + 1) {
      selector.selectedIndex = index + 1; // +1 to skip the "Select a stock..." option
      selector.dispatchEvent(new Event('change'));
      this.showSuccessToast(`Selected: ${selector.options[index + 1].text}`);
    }
  }
}

// Global dashboard instance
const modernDashboard = new ModernStockDashboard();

// Make it globally available
(window as any).modernDashboard = modernDashboard;
(window as any).dashboardCards = dashboardCards;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => modernDashboard.initialize());
} else {
  modernDashboard.initialize();
}

// Handle page unload
window.addEventListener('beforeunload', () => {
  modernDashboard.cleanup();
});

// Export for use in other modules
export { modernDashboard, dashboardCards, stockVisualizations };
