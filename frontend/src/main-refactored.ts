/**
 * Enhanced Stock Analytics Dashboard - Modern UI with Visual Data Cards
 * Optimized for performance and decision-making with interactive visualizations
 */

import { Api } from './app/services/api.service';
import { Chart, registerables } from 'chart.js';
import 'chartjs-adapter-date-fns';

// Register Chart.js components
Chart.register(...registerables);

// Global services and state
const api = new Api();
const chartInstances = new Map<string, Chart>();
let currentSymbol: string | null = null;
let currentPage: 'dashboard' | 'analysis' | 'watchlist' | 'portfolio' | 'health' = 'dashboard';
let theme: 'light' | 'dark' = (localStorage.getItem('theme') as any) || 'dark';

// Performance optimization: Request cache with TTL
const requestCache = new Map<string, { data: any; expiry: number }>();
function getCachedRequest<T>(key: string, fetcher: () => Promise<T>, ttl: number = 300000): Promise<T> {
  const cached = requestCache.get(key);
  if (cached && cached.expiry > Date.now()) {
    return Promise.resolve(cached.data);
  }
  
  return fetcher().then(data => {
    requestCache.set(key, { data, expiry: Date.now() + ttl });
    return data;
  });
}

// Utility functions for visual enhancement
function createCard(title: string, icon: string, content: string = '', className: string = ''): HTMLElement {
  const card = document.createElement('div');
  card.className = `modern-card glass-card fade-in ${className}`;
  card.innerHTML = `
    <div class="card-header">
      <div class="card-title">
        <i class="${icon} card-icon"></i>
        <h3>${title}</h3>
      </div>
      <div class="card-status" id="status-${title.toLowerCase().replace(/\s+/g, '-')}">
        <div class="status-dot pulse"></div>
      </div>
    </div>
    <div class="card-content">${content}</div>
  `;
  return card;
}

function formatNumber(num: number): string {
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toFixed(2);
}

function formatCurrency(num: number): string {
  return `₹${formatNumber(num)}`;
}

function formatPercent(num: number): string {
  return `${(num * 100).toFixed(2)}%`;
}

function getChangeColor(change: number): string {
  return change >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
}

// Enhanced chart creation with performance optimization
function createOptimizedChart(canvasId: string, config: any): Chart {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) throw new Error(`Canvas ${canvasId} not found`);
  
  // Destroy existing chart
  const existingChart = chartInstances.get(canvasId);
  if (existingChart) {
    existingChart.destroy();
  }
  
  // Apply performance optimizations
  const optimizedConfig = {
    ...config,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 }, // Reduced animation time
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: 'var(--text-color)', usePointStyle: true }
        },
        tooltip: {
          backgroundColor: 'var(--surface-color)',
          titleColor: 'var(--text-color)',
          bodyColor: 'var(--text-color)',
          borderColor: 'var(--border-color)',
          cornerRadius: 8
        },
        ...config.options?.plugins
      },
      scales: {
        x: {
          grid: { color: 'var(--border-color)', drawBorder: false },
          ticks: { color: 'var(--text-muted)' }
        },
        y: {
          grid: { color: 'var(--border-color)', drawBorder: false },
          ticks: { color: 'var(--text-muted)' }
        },
        ...config.options?.scales
      },
      ...config.options
    }
  };
  
  const chart = new Chart(canvas, optimizedConfig);
  chartInstances.set(canvasId, chart);
  return chart;
}

// Initialize the enhanced application
document.addEventListener('DOMContentLoaded', () => {
  initializeEnhancedApp();
});

function initializeEnhancedApp() {
  createModernLayout();
  setupThemeSystem();
  setupNavigation();
  setupSearchFunctionality();
  loadInitialData();
  startPerformanceMonitoring();
}

function createModernLayout() {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="app-container" data-theme="${theme}">
      <!-- Modern Header -->
      <header class="modern-header glass-surface">
        <div class="header-content">
          <div class="brand-section">
            <div class="brand-logo">
              <i class="fas fa-chart-line gradient-icon"></i>
              <h1 class="brand-title gradient-text">Stock Analytics Hub</h1>
            </div>
            <div class="status-indicators">
              <div class="indicator" id="api-status">
                <div class="dot success"></div>
                <span>API</span>
              </div>
              <div class="indicator" id="rag-status">
                <div class="dot success"></div>
                <span>RAG</span>
              </div>
              <div class="indicator" id="mcp-status">
                <div class="dot success"></div>
                <span>MCP</span>
              </div>
            </div>
          </div>
          
          <div class="search-section">
            <div class="search-container">
              <i class="fas fa-search search-icon"></i>
              <input id="enhanced-search" type="text" placeholder="Search stocks (e.g., BEL, AAPL)..." 
                     class="search-input" list="stock-suggestions" autocomplete="off">
              <datalist id="stock-suggestions"></datalist>
              <button id="analyze-btn" class="analyze-btn gradient-btn">
                <i class="fas fa-microscope"></i>
                <span>Analyze</span>
              </button>
            </div>
          </div>
          
          <div class="header-controls">
            <div class="control-group">
              <button id="theme-toggle" class="control-btn" title="Toggle Theme">
                <i class="fas fa-moon"></i>
              </button>
              <button id="refresh-data" class="control-btn" title="Refresh All Data">
                <i class="fas fa-sync-alt"></i>
              </button>
              <button id="export-data" class="control-btn" title="Export Analysis">
                <i class="fas fa-download"></i>
              </button>
            </div>
          </div>
        </div>
        
        <!-- Progress Bar for Loading States -->
        <div id="progress-bar" class="progress-bar hidden">
          <div class="progress-fill"></div>
        </div>
      </header>

      <!-- Navigation Sidebar -->
      <div class="layout-container">
        <nav class="sidebar glass-surface">
          <div class="nav-section">
            <h4 class="nav-title">Analytics</h4>
            <a href="#dashboard" class="nav-item active" data-page="dashboard">
              <i class="fas fa-tachometer-alt"></i>
              <span>Dashboard</span>
            </a>
            <a href="#analysis" class="nav-item" data-page="analysis">
              <i class="fas fa-chart-candlestick"></i>
              <span>Technical Analysis</span>
            </a>
            <a href="#sentiment" class="nav-item" data-page="sentiment">
              <i class="fas fa-brain"></i>
              <span>Sentiment</span>
            </a>
          </div>
          
          <div class="nav-section">
            <h4 class="nav-title">Tools</h4>
            <a href="#watchlist" class="nav-item" data-page="watchlist">
              <i class="fas fa-star"></i>
              <span>Watchlist</span>
            </a>
            <a href="#portfolio" class="nav-item" data-page="portfolio">
              <i class="fas fa-briefcase"></i>
              <span>Portfolio</span>
            </a>
            <a href="#alerts" class="nav-item" data-page="alerts">
              <i class="fas fa-bell"></i>
              <span>Alerts</span>
            </a>
          </div>
          
          <div class="nav-section">
            <h4 class="nav-title">System</h4>
            <a href="#health" class="nav-item" data-page="health">
              <i class="fas fa-heartbeat"></i>
              <span>Health</span>
            </a>
          </div>
        </nav>

        <!-- Main Content Area -->
        <main class="main-content">
          <!-- Dashboard Page -->
          <div id="dashboard-page" class="page-content active">
            <div class="page-header">
              <h2 class="page-title gradient-text">Market Dashboard</h2>
              <div class="page-subtitle">AI-powered stock analysis and decision support</div>
            </div>
            
            <div class="dashboard-grid">
              <!-- Stock Overview Card -->
              <div id="stock-overview-section" class="grid-item span-2">
                <div class="section-title">
                  <i class="fas fa-chart-line"></i>
                  Stock Overview
                </div>
                <div id="stock-overview-card" class="card-container"></div>
              </div>
              
              <!-- Market Metrics Card -->
              <div id="market-metrics-section" class="grid-item">
                <div class="section-title">
                  <i class="fas fa-globe"></i>
                  Market Metrics
                </div>
                <div id="market-metrics-card" class="card-container"></div>
              </div>
              
              <!-- Sentiment Analysis Card -->
              <div id="sentiment-section" class="grid-item">
                <div class="section-title">
                  <i class="fas fa-brain"></i>
                  Sentiment Analysis
                </div>
                <div id="sentiment-card" class="card-container"></div>
              </div>
              
              <!-- Technical Indicators Preview -->
              <div id="technical-preview-section" class="grid-item span-2">
                <div class="section-title">
                  <i class="fas fa-chart-candlestick"></i>
                  Technical Indicators Preview
                </div>
                <div id="technical-preview-card" class="card-container"></div>
              </div>
              
              <!-- News & RAG Insights -->
              <div id="news-insights-section" class="grid-item span-3">
                <div class="section-title">
                  <i class="fas fa-newspaper"></i>
                  Latest News & AI Insights
                </div>
                <div id="news-insights-card" class="card-container"></div>
              </div>
            </div>
          </div>

          <!-- Analysis Page -->
          <div id="analysis-page" class="page-content">
            <div class="page-header">
              <h2 class="page-title gradient-text">Technical Analysis</h2>
              <div class="page-subtitle">Comprehensive technical analysis and trading signals</div>
            </div>
            
            <div class="analysis-grid">
              <div id="candlestick-chart-section" class="grid-item span-full">
                <div class="section-title">
                  <i class="fas fa-chart-candlestick"></i>
                  Interactive Price Chart
                </div>
                <div id="candlestick-card" class="card-container"></div>
              </div>
              
              <div id="volume-analysis-section" class="grid-item span-2">
                <div class="section-title">
                  <i class="fas fa-chart-bar"></i>
                  Volume Analysis
                </div>
                <div id="volume-card" class="card-container"></div>
              </div>
              
              <div id="indicators-panel-section" class="grid-item">
                <div class="section-title">
                  <i class="fas fa-sliders-h"></i>
                  Technical Indicators
                </div>
                <div id="indicators-panel-card" class="card-container"></div>
              </div>
            </div>
          </div>

          <!-- Other Pages -->
          <div id="watchlist-page" class="page-content">
            <div class="page-header">
              <h2 class="page-title gradient-text">Watchlist</h2>
            </div>
            <div id="watchlist-content" class="page-grid"></div>
          </div>
          
          <div id="portfolio-page" class="page-content">
            <div class="page-header">
              <h2 class="page-title gradient-text">Portfolio</h2>
            </div>
            <div id="portfolio-content" class="page-grid"></div>
          </div>
          
          <div id="health-page" class="page-content">
            <div class="page-header">
              <h2 class="page-title gradient-text">System Health</h2>
            </div>
            <div id="health-content" class="page-grid"></div>
          </div>
        </main>
      </div>
      
      <!-- Floating Action Button for AI Assistant -->
      <button id="ai-fab" class="fab gradient-btn" title="AI Assistant">
        <i class="fas fa-robot"></i>
      </button>
      
      <!-- Toast Notifications -->
      <div id="toast-container" class="toast-container"></div>
    </div>
  `;

  // Apply theme
  applyTheme();
}

// Modern Stock Overview Card with Visual Elements
async function renderStockOverviewCard(symbol: string) {
  const container = document.getElementById('stock-overview-card')!;
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div>Loading overview...</div>';
  
  try {
    const overview = await getCachedRequest(`overview-${symbol}`, () => api.overview(symbol));
    const data = overview?.data || overview;
    
    if (!data) {
      container.innerHTML = '<div class="error-state">No data available</div>';
      return;
    }
    
    const change = data.change || 0;
    const changePercent = data.changePercent || 0;
    const isPositive = change >= 0;
    
    container.innerHTML = `
      <div class="stock-overview-card">
        <div class="overview-header">
          <div class="stock-info">
            <h2 class="stock-symbol">${symbol}</h2>
            <p class="stock-name">${data.name || 'Loading...'}</p>
          </div>
          <div class="price-badge ${isPositive ? 'positive' : 'negative'}">
            <span class="price">${formatCurrency(data.currentPrice || data.close || 0)}</span>
            <div class="change-info">
              <span class="change">${isPositive ? '+' : ''}${formatCurrency(change)}</span>
              <span class="change-percent">(${formatPercent(changePercent / 100)})</span>
            </div>
          </div>
        </div>
        
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-icon"><i class="fas fa-chart-bar"></i></div>
            <div class="metric-info">
              <span class="metric-value">${formatNumber(data.volume || 0)}</span>
              <span class="metric-label">Volume</span>
            </div>
          </div>
          
          <div class="metric-card">
            <div class="metric-icon"><i class="fas fa-coins"></i></div>
            <div class="metric-info">
              <span class="metric-value">${formatNumber(data.marketCap || 0)}</span>
              <span class="metric-label">Market Cap</span>
            </div>
          </div>
          
          <div class="metric-card">
            <div class="metric-icon"><i class="fas fa-percentage"></i></div>
            <div class="metric-info">
              <span class="metric-value">${(data.peRatio || 0).toFixed(1)}</span>
              <span class="metric-label">P/E Ratio</span>
            </div>
          </div>
        </div>
        
        <div class="sparkline-section">
          <canvas id="overview-sparkline" class="sparkline-canvas"></canvas>
        </div>
      </div>
    `;
    
    // Render sparkline chart
    await renderSparkline(symbol);
    
    updateStatusIndicator('stock-overview', 'success');
  } catch (error) {
    console.error('Failed to render stock overview:', error);
    container.innerHTML = `<div class="error-state">Failed to load data: ${error.message}</div>`;
    updateStatusIndicator('stock-overview', 'error');
  }
}

// Sentiment Analysis Card with Gauge
async function renderSentimentCard(symbol: string) {
  const container = document.getElementById('sentiment-card')!;
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div>Analyzing sentiment...</div>';
  
  try {
    const sentiment = await getCachedRequest(`sentiment-${symbol}`, () => api.analyze(symbol));
    const data = sentiment?.data || sentiment;
    
    const sentimentScore = data?.sentiment || 0.5;
    const recommendation = data?.recommendation || 'HOLD';
    
    container.innerHTML = `
      <div class="sentiment-card">
        <div class="sentiment-gauge-container">
          <canvas id="sentiment-gauge" class="sentiment-gauge"></canvas>
          <div class="gauge-overlay">
            <div class="sentiment-score">${Math.round(sentimentScore * 100)}</div>
            <div class="sentiment-label">Sentiment</div>
          </div>
        </div>
        
        <div class="sentiment-details">
          <div class="recommendation-badge ${getRecommendationClass(recommendation)}">
            <i class="${getRecommendationIcon(recommendation)}"></i>
            <span>${recommendation}</span>
          </div>
          
          <div class="sentiment-breakdown">
            <div class="breakdown-item positive">
              <span class="label">Positive</span>
              <div class="bar">
                <div class="fill" style="width: ${(data?.positiveRatio || 0) * 100}%"></div>
              </div>
              <span class="value">${Math.round((data?.positiveRatio || 0) * 100)}%</span>
            </div>
            
            <div class="breakdown-item negative">
              <span class="label">Negative</span>
              <div class="bar">
                <div class="fill" style="width: ${(data?.negativeRatio || 0) * 100}%"></div>
              </div>
              <span class="value">${Math.round((data?.negativeRatio || 0) * 100)}%</span>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Render sentiment gauge
    renderSentimentGauge(sentimentScore);
    updateStatusIndicator('sentiment-analysis', 'success');
  } catch (error) {
    console.error('Failed to render sentiment:', error);
    container.innerHTML = `<div class="error-state">Failed to analyze sentiment: ${error.message}</div>`;
    updateStatusIndicator('sentiment-analysis', 'error');
  }
}

// Technical Analysis Preview Card
async function renderTechnicalPreviewCard(symbol: string) {
  const container = document.getElementById('technical-preview-card')!;
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div>Loading technical data...</div>';
  
  try {
    const [history, features] = await Promise.all([
      getCachedRequest(`history-${symbol}`, () => api.history(symbol)),
      getCachedRequest(`features-${symbol}`, () => api.featuresStored(symbol, { days: 30 }))
    ]);
    
    const historyData = history?.data || [];
    const featuresData = features?.data || [];
    
    container.innerHTML = `
      <div class="technical-preview">
        <div class="chart-section">
          <canvas id="technical-preview-chart" class="preview-chart"></canvas>
        </div>
        
        <div class="indicators-summary">
          <div class="indicator-row">
            <span class="indicator-name">RSI (14)</span>
            <div class="indicator-gauge">
              <div class="gauge-track">
                <div class="gauge-fill rsi" style="width: ${(featuresData[0]?.rsi || 50)}%"></div>
              </div>
              <span class="gauge-value">${(featuresData[0]?.rsi || 50).toFixed(1)}</span>
            </div>
          </div>
          
          <div class="indicator-row">
            <span class="indicator-name">SMA 20</span>
            <div class="indicator-status ${(historyData[0]?.close || 0) > (featuresData[0]?.sma20 || 0) ? 'bullish' : 'bearish'}">
              <i class="fas fa-arrow-${(historyData[0]?.close || 0) > (featuresData[0]?.sma20 || 0) ? 'up' : 'down'}"></i>
              <span>${(historyData[0]?.close || 0) > (featuresData[0]?.sma20 || 0) ? 'Above' : 'Below'}</span>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Render preview chart
    renderTechnicalPreviewChart(historyData.slice(-30), featuresData.slice(-30));
    updateStatusIndicator('technical-indicators-preview', 'success');
  } catch (error) {
    console.error('Failed to render technical preview:', error);
    container.innerHTML = `<div class="error-state">Failed to load technical data</div>`;
    updateStatusIndicator('technical-indicators-preview', 'error');
  }
}

// News & RAG Insights Card
async function renderNewsInsightsCard(symbol: string) {
  const container = document.getElementById('news-insights-card')!;
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div>Loading news and insights...</div>';
  
  try {
    const [news, ragAnswer] = await Promise.all([
      getCachedRequest(`news-${symbol}`, () => api.news(symbol)),
      getCachedRequest(`rag-${symbol}`, () => 
        api.ragQuery(symbol, `What are the latest developments and outlook for ${symbol}?`, { k: 3, withAnswer: true })
      )
    ]);
    
    const newsData = news?.data || [];
    const ragData = ragAnswer?.data || {};
    
    container.innerHTML = `
      <div class="news-insights-card">
        <div class="insights-header">
          <div class="ai-insights">
            <h4><i class="fas fa-robot"></i> AI Analysis</h4>
            <div class="rag-answer">
              ${ragData.answer || 'No AI analysis available. Add data sources to RAG for insights.'}
            </div>
          </div>
        </div>
        
        <div class="news-section">
          <h4><i class="fas fa-newspaper"></i> Latest News</h4>
          <div class="news-grid">
            ${newsData.slice(0, 6).map((item: any) => `
              <div class="news-item">
                <div class="news-header">
                  <span class="news-source">${item.source || 'News'}</span>
                  <span class="news-date">${new Date(item.date).toLocaleDateString()}</span>
                  <div class="news-sentiment ${getSentimentClass(item.sentiment || 0.5)}">
                    ${getSentimentEmoji(item.sentiment || 0.5)}
                  </div>
                </div>
                <h5 class="news-title">${item.title}</h5>
                <p class="news-summary">${(item.summary || '').substring(0, 120)}...</p>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    
    updateStatusIndicator('news-rag-insights', 'success');
  } catch (error) {
    console.error('Failed to render news insights:', error);
    container.innerHTML = `<div class="error-state">Failed to load news and insights</div>`;
    updateStatusIndicator('news-rag-insights', 'error');
  }
}

// Chart rendering functions
async function renderSparkline(symbol: string) {
  try {
    const history = await getCachedRequest(`sparkline-${symbol}`, () => api.history(symbol));
    const data = history?.data || [];
    const prices = data.slice(-30).map((d: any) => d.close).filter((p: any) => p != null);
    
    if (prices.length === 0) return;
    
    const canvas = document.getElementById('overview-sparkline') as HTMLCanvasElement;
    if (!canvas) return;
    
    const isPositive = prices[prices.length - 1] >= prices[0];
    const color = isPositive ? '#22c55e' : '#ef4444';
    
    createOptimizedChart('overview-sparkline', {
      type: 'line',
      data: {
        labels: prices.map((_, i) => i),
        datasets: [{
          data: prices,
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        animation: { duration: 0 }
      }
    });
  } catch (error) {
    console.error('Failed to render sparkline:', error);
  }
}

function renderSentimentGauge(sentiment: number) {
  const canvas = document.getElementById('sentiment-gauge') as HTMLCanvasElement;
  if (!canvas) return;
  
  const getColor = (value: number) => {
    if (value > 0.6) return '#22c55e'; // Green
    if (value < 0.4) return '#ef4444'; // Red
    return '#f59e0b'; // Yellow
  };
  
  createOptimizedChart('sentiment-gauge', {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [sentiment, 1 - sentiment],
        backgroundColor: [getColor(sentiment), '#374151'],
        borderWidth: 0
      }]
    },
    options: {
      circumference: 180,
      rotation: 270,
      cutout: '75%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } }
    }
  });
}

function renderTechnicalPreviewChart(historyData: any[], featuresData: any[]) {
  const canvas = document.getElementById('technical-preview-chart') as HTMLCanvasElement;
  if (!canvas) return;
  
  const prices = historyData.map(d => d.close);
  const sma20 = featuresData.map(f => f.sma20).filter(v => v != null);
  
  createOptimizedChart('technical-preview-chart', {
    type: 'line',
    data: {
      labels: historyData.map(d => d.date),
      datasets: [
        {
          label: 'Price',
          data: prices,
          borderColor: '#3b82f6',
          backgroundColor: '#3b82f620',
          borderWidth: 2,
          fill: true
        },
        {
          label: 'SMA 20',
          data: sma20,
          borderColor: '#f59e0b',
          backgroundColor: 'transparent',
          borderWidth: 1
        }
      ]
    },
    options: {
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`
          }
        }
      }
    }
  });
}

// Utility functions
function getSentimentClass(sentiment: number): string {
  if (sentiment > 0.6) return 'positive';
  if (sentiment < 0.4) return 'negative';
  return 'neutral';
}

function getSentimentEmoji(sentiment: number): string {
  if (sentiment > 0.6) return '📈';
  if (sentiment < 0.4) return '📉';
  return '➖';
}

function getRecommendationClass(rec: string): string {
  if (rec.includes('BUY')) return 'buy';
  if (rec.includes('SELL')) return 'sell';
  return 'hold';
}

function getRecommendationIcon(rec: string): string {
  if (rec.includes('BUY')) return 'fas fa-arrow-up';
  if (rec.includes('SELL')) return 'fas fa-arrow-down';
  return 'fas fa-minus';
}

function updateStatusIndicator(cardType: string, status: 'loading' | 'success' | 'error') {
  const indicator = document.getElementById(`status-${cardType}`);
  if (!indicator) return;
  
  const dot = indicator.querySelector('.status-dot');
  if (!dot) return;
  
  dot.className = `status-dot ${status}`;
}

// Theme system
function setupThemeSystem() {
  const themeToggle = document.getElementById('theme-toggle')!;
  
  themeToggle.addEventListener('click', () => {
    theme = theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', theme);
    applyTheme();
    updateAllCharts();
  });
}

function applyTheme() {
  const app = document.querySelector('.app-container')!;
  app.setAttribute('data-theme', theme);
  
  const themeIcon = document.querySelector('#theme-toggle i')!;
  themeIcon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

function updateAllCharts() {
  for (const chart of chartInstances.values()) {
    chart.update('none');
  }
}

// Navigation system
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = (item as HTMLElement).dataset.page as any;
      navigateToPage(page);
    });
  });
  
  // Handle browser back/forward
  window.addEventListener('hashchange', () => {
    const page = parseHashPage();
    navigateToPage(page);
  });
}

function navigateToPage(page: string) {
  currentPage = page as any;
  
  // Update active nav item
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', (item as HTMLElement).dataset.page === page);
  });
  
  // Show/hide pages
  document.querySelectorAll('.page-content').forEach(pageEl => {
    pageEl.classList.toggle('active', pageEl.id === `${page}-page`);
  });
  
  // Update URL
  history.pushState({}, '', `#${page}`);
  
  // Load page-specific data
  loadPageData();
}

function parseHashPage(): string {
  const hash = location.hash.slice(1) || 'dashboard';
  return hash;
}

// Enhanced search functionality
function setupSearchFunctionality() {
  const searchInput = document.getElementById('enhanced-search') as HTMLInputElement;
  const analyzeBtn = document.getElementById('analyze-btn')!;
  
  let searchTimeout: NodeJS.Timeout;
  
  // Debounced search with suggestions
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      updateSearchSuggestions(searchInput.value);
    }, 300);
  });
  
  // Analyze button
  analyzeBtn.addEventListener('click', () => {
    const symbol = searchInput.value.trim().toUpperCase();
    if (symbol) {
      analyzeStock(symbol);
    }
  });
  
  // Enter key
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const symbol = searchInput.value.trim().toUpperCase();
      if (symbol) {
        analyzeStock(symbol);
      }
    }
  });
}

async function updateSearchSuggestions(query: string) {
  if (!query || query.length < 2) return;
  
  try {
    const stocks = await getCachedRequest('stock-list', () => api.listStocks(), 3600000); // 1 hour cache
    const matches = (stocks?.data || []).filter((stock: any) => 
      stock.symbol.toLowerCase().includes(query.toLowerCase()) ||
      (stock.name && stock.name.toLowerCase().includes(query.toLowerCase()))
    ).slice(0, 10);
    
    const datalist = document.getElementById('stock-suggestions')!;
    datalist.innerHTML = matches.map((stock: any) => 
      `<option value="${stock.symbol}">${stock.name || stock.symbol}</option>`
    ).join('');
  } catch (error) {
    console.error('Failed to update search suggestions:', error);
  }
}

async function analyzeStock(symbol: string) {
  if (currentSymbol === symbol) return;
  
  currentSymbol = symbol;
  showProgress(true);
  
  try {
    // Load all card data in parallel
    await Promise.all([
      renderStockOverviewCard(symbol),
      renderSentimentCard(symbol),
      renderTechnicalPreviewCard(symbol),
      renderNewsInsightsCard(symbol)
    ]);
    
    showToast(`Analysis complete for ${symbol}`, 'success');
  } catch (error) {
    console.error('Failed to analyze stock:', error);
    showToast('Failed to analyze stock', 'error');
  } finally {
    showProgress(false);
  }
}

// Load page-specific data
function loadPageData() {
  if (!currentSymbol) return;
  
  switch (currentPage) {
    case 'dashboard':
      // Dashboard data is already loaded
      break;
    case 'analysis':
      loadAdvancedAnalysis();
      break;
    case 'health':
      loadSystemHealth();
      break;
  }
}

async function loadAdvancedAnalysis() {
  if (!currentSymbol) return;
  
  // Load advanced technical analysis for the analysis page
  // This would include candlestick charts, volume analysis, etc.
}

async function loadSystemHealth() {
  const container = document.getElementById('health-content')!;
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div>Checking system health...</div>';
  
  try {
    const health = await api.ragHealth();
    
    container.innerHTML = `
      <div class="health-dashboard">
        <div class="health-card">
          <h4><i class="fas fa-database"></i> RAG System</h4>
          <div class="status ${health?.data?.ok ? 'healthy' : 'error'}">
            ${health?.data?.ok ? 'Operational' : 'Error'}
          </div>
        </div>
        
        <div class="health-card">
          <h4><i class="fas fa-server"></i> MCP Server</h4>
          <div class="status healthy">Operational</div>
        </div>
        
        <div class="health-card">
          <h4><i class="fas fa-brain"></i> AI Agent</h4>
          <div class="status ${health?.data?.llm?.enabled ? 'healthy' : 'warning'}">
            ${health?.data?.llm?.enabled ? 'Enabled' : 'Limited (No API Key)'}
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    container.innerHTML = '<div class="error-state">Failed to check system health</div>';
  }
}

// UI feedback functions
function showProgress(show: boolean) {
  const progressBar = document.getElementById('progress-bar')!;
  progressBar.classList.toggle('hidden', !show);
  progressBar.classList.toggle('loading', show);
}

function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  const container = document.getElementById('toast-container')!;
  const toast = document.createElement('div');
  toast.className = `toast ${type} fade-in`;
  toast.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'times' : 'info'}"></i>
    <span>${message}</span>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Performance monitoring
function startPerformanceMonitoring() {
  // Monitor memory usage and cache performance
  setInterval(() => {
    const cacheSize = requestCache.size;
    const now = Date.now();
    
    // Clean expired cache entries
    for (const [key, entry] of requestCache.entries()) {
      if (entry.expiry < now) {
        requestCache.delete(key);
      }
    }
    
    console.debug(`Cache: ${cacheSize} entries, ${requestCache.size} active`);
  }, 60000); // Check every minute
}

// Load initial data
function loadInitialData() {
  // Load stock suggestions
  updateSearchSuggestions('');
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    // Hide loading screen
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.classList.add('fade-out');
      setTimeout(() => loadingScreen.remove(), 500);
    }
    
    // Initialize app
    initializeEnhancedApp();
  }, 1500);
});

function initializeEnhancedApp() {
  createModernLayout();
  setupThemeSystem();
  setupNavigation();
  setupSearchFunctionality();
  loadInitialData();
  startPerformanceMonitoring();
}

// Export for debugging
(window as any).stockApp = {
  api,
  analyzeStock,
  navigateToPage,
  theme: () => theme,
  currentSymbol: () => currentSymbol,
  chartInstances
};
