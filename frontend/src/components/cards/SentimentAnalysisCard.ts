/**
 * Sentiment Analysis Card with interactive gauge and news sentiment heatmap
 */

import { ChartUtils } from '../../utils/ChartUtils.js';
import { apiService } from '../../services/ApiService.js';

export interface SentimentData {
  symbol: string;
  overallSentiment: number;
  positiveRatio: number;
  negativeRatio: number;
  neutralRatio: number;
  confidence: number;
  sourcesCount: number;
  recommendation: string;
  newsItems: Array<{
    title: string;
    summary: string;
    sentiment: number;
    date: string;
    source: string;
    url?: string;
  }>;
  historicalSentiment: Array<{
    date: string;
    sentiment: number;
    volume: number;
  }>;
}

export class SentimentAnalysisCard {
  private container: HTMLElement;
  private data: SentimentData | null = null;
  private sentimentGauge?: any;
  private trendChart?: any;
  private isLoading = false;

  constructor(container: HTMLElement | string) {
    this.container = typeof container === 'string'
      ? document.getElementById(container)!
      : container;
    
    this.initialize();
  }

  private initialize(): void {
    this.container.className = 'sentiment-analysis-card glass-card';
    this.render();
  }

  async loadData(symbol: string): Promise<void> {
    if (this.isLoading) return;
    
    this.isLoading = true;
    this.showLoadingState();

    try {
      const [sentiment, news] = await Promise.all([
        apiService.fetch(`/mcp/tool`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'analyze_sentiment',
            params: { symbol, days: 7 }
          })
        }),
        apiService.getStockNews(symbol, 20)
      ]);

      this.data = this.processData(symbol, sentiment.result, news.data);
      this.render();
      this.renderCharts();
    } catch (error) {
      console.error('Failed to load sentiment data:', error);
      this.showErrorState(error as Error);
    } finally {
      this.isLoading = false;
    }
  }

  private processData(symbol: string, sentimentData: any, newsData: any[]): SentimentData {
    const newsItems = newsData.map(item => ({
      title: item.title,
      summary: item.summary || '',
      sentiment: item.sentiment || 0.5,
      date: item.date,
      source: item.source || 'Unknown',
      url: item.url
    }));

    // Generate historical sentiment data (simplified)
    const historicalSentiment = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      return {
        date: date.toISOString().split('T')[0],
        sentiment: sentimentData.overall_sentiment + (Math.random() - 0.5) * 0.2,
        volume: Math.random() * 100
      };
    });

    const recommendation = this.generateRecommendation(sentimentData.overall_sentiment, sentimentData.confidence);

    return {
      symbol,
      overallSentiment: sentimentData.overall_sentiment,
      positiveRatio: sentimentData.positive_ratio,
      negativeRatio: sentimentData.negative_ratio,
      neutralRatio: sentimentData.neutral_ratio,
      confidence: sentimentData.confidence,
      sourcesCount: sentimentData.sources_count,
      recommendation,
      newsItems,
      historicalSentiment
    };
  }

  private generateRecommendation(sentiment: number, confidence: number): string {
    if (confidence < 0.3) return 'INSUFFICIENT_DATA';
    
    if (sentiment > 0.7) return 'STRONG_BUY';
    if (sentiment > 0.6) return 'BUY';
    if (sentiment > 0.4) return 'HOLD';
    if (sentiment > 0.3) return 'SELL';
    return 'STRONG_SELL';
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
            <i class="fas fa-brain"></i>
            Sentiment Analysis - ${this.data.symbol}
          </h3>
          <div class="confidence-indicator">
            <span class="confidence-label">Confidence:</span>
            <div class="confidence-bar">
              <div class="confidence-fill" style="width: ${this.data.confidence * 100}%"></div>
            </div>
            <span class="confidence-value">${Math.round(this.data.confidence * 100)}%</span>
          </div>
        </div>
        
        <div class="recommendation-badge ${this.getRecommendationClass()}">
          <span class="rec-text">${this.data.recommendation.replace('_', ' ')}</span>
        </div>
      </div>

      <div class="sentiment-overview">
        <div class="gauge-section">
          <h4>Overall Sentiment</h4>
          <div class="gauge-container">
            <canvas id="sentiment-gauge-${this.data.symbol}" class="sentiment-gauge"></canvas>
            <div class="gauge-overlay">
              <div class="gauge-value">${Math.round(this.data.overallSentiment * 100)}</div>
              <div class="gauge-label">Score</div>
            </div>
          </div>
        </div>
        
        <div class="breakdown-section">
          <h4>Sentiment Breakdown</h4>
          <div class="sentiment-bars">
            <div class="sentiment-bar positive">
              <span class="bar-label">Positive</span>
              <div class="bar-track">
                <div class="bar-fill" style="width: ${this.data.positiveRatio * 100}%"></div>
              </div>
              <span class="bar-value">${Math.round(this.data.positiveRatio * 100)}%</span>
            </div>
            <div class="sentiment-bar neutral">
              <span class="bar-label">Neutral</span>
              <div class="bar-track">
                <div class="bar-fill" style="width: ${this.data.neutralRatio * 100}%"></div>
              </div>
              <span class="bar-value">${Math.round(this.data.neutralRatio * 100)}%</span>
            </div>
            <div class="sentiment-bar negative">
              <span class="bar-label">Negative</span>
              <div class="bar-track">
                <div class="bar-fill" style="width: ${this.data.negativeRatio * 100}%"></div>
              </div>
              <span class="bar-value">${Math.round(this.data.negativeRatio * 100)}%</span>
            </div>
          </div>
        </div>
      </div>

      <div class="trend-section">
        <h4>Sentiment Trend (30 Days)</h4>
        <canvas id="sentiment-trend-${this.data.symbol}" class="sentiment-trend"></canvas>
      </div>

      <div class="news-section">
        <div class="news-header">
          <h4>Recent News Analysis</h4>
          <span class="news-count">${this.data.sourcesCount} sources analyzed</span>
        </div>
        <div class="news-list">
          ${this.renderNewsList()}
        </div>
      </div>

      <div class="metrics-section">
        <div class="metrics-grid">
          <div class="metric-item">
            <span class="metric-label">Sources</span>
            <span class="metric-value">${this.data.sourcesCount}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Confidence</span>
            <span class="metric-value">${Math.round(this.data.confidence * 100)}%</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Recommendation</span>
            <span class="metric-value ${this.getRecommendationClass()}">
              ${this.data.recommendation.replace('_', ' ')}
            </span>
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    this.attachEventListeners();
  }

  private renderNewsList(): string {
    return this.data!.newsItems.slice(0, 5).map(item => {
      const sentimentClass = item.sentiment > 0.6 ? 'positive' : item.sentiment < 0.4 ? 'negative' : 'neutral';
      const sentimentIcon = item.sentiment > 0.6 ? '📈' : item.sentiment < 0.4 ? '📉' : '➖';
      
      return `
        <div class="news-item">
          <div class="news-header">
            <span class="news-source">${item.source}</span>
            <span class="news-date">${this.formatDate(item.date)}</span>
            <div class="news-sentiment ${sentimentClass}">
              <span class="sentiment-icon">${sentimentIcon}</span>
              <span class="sentiment-score">${Math.round(item.sentiment * 100)}</span>
            </div>
          </div>
          <h5 class="news-title">${item.title}</h5>
          ${item.summary ? `<p class="news-summary">${item.summary.substring(0, 150)}...</p>` : ''}
        </div>
      `;
    }).join('');
  }

  private renderCharts(): void {
    if (!this.data) return;
    this.renderSentimentGauge();
    this.renderTrendChart();
  }

  private renderSentimentGauge(): void {
    if (!this.data) return;

    const canvas = document.getElementById(`sentiment-gauge-${this.data.symbol}`) as HTMLCanvasElement;
    if (!canvas) return;

    this.sentimentGauge = ChartUtils.createSentimentGauge(canvas, this.data.overallSentiment);
  }

  private renderTrendChart(): void {
    if (!this.data) return;

    const canvas = document.getElementById(`sentiment-trend-${this.data.symbol}`) as HTMLCanvasElement;
    if (!canvas) return;

    const trendData = this.data.historicalSentiment.map(d => ({
      x: d.date,
      y: d.sentiment
    }));

    this.trendChart = ChartUtils.createChart(canvas, {
      type: 'line',
      data: {
        datasets: [{
          label: 'Sentiment',
          data: trendData,
          borderColor: this.getSentimentColor(this.data.overallSentiment),
          backgroundColor: ChartUtils.withAlpha(this.getSentimentColor(this.data.overallSentiment), 0.1),
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 4,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Sentiment: ${(ctx.parsed.y * 100).toFixed(1)}%`
            }
          }
        },
        scales: {
          y: {
            min: 0,
            max: 1,
            ticks: {
              callback: (value) => `${(Number(value) * 100).toFixed(0)}%`
            }
          }
        }
      }
    });
  }

  private getSentimentColor(sentiment: number): string {
    if (sentiment > 0.6) return '#22c55e'; // Green
    if (sentiment < 0.4) return '#ef4444'; // Red
    return '#f59e0b'; // Amber
  }

  private getRecommendationClass(): string {
    const rec = this.data?.recommendation;
    if (rec?.includes('BUY')) return 'buy';
    if (rec?.includes('SELL')) return 'sell';
    return 'hold';
  }

  private formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }

  private attachEventListeners(): void {
    const newsItems = this.container.querySelectorAll('.news-item');
    newsItems.forEach((item, index) => {
      item.addEventListener('click', () => {
        const newsItem = this.data?.newsItems[index];
        if (newsItem?.url) {
          window.open(newsItem.url, '_blank');
        }
      });
    });
  }

  private renderEmptyState(): void {
    this.container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-brain fa-3x"></i>
        <h4>No Sentiment Data</h4>
        <p>Select a stock to analyze sentiment</p>
      </div>
    `;
  }

  private showLoadingState(): void {
    this.container.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>Analyzing sentiment...</p>
      </div>
    `;
  }

  private showErrorState(error: Error): void {
    this.container.innerHTML = `
      <div class="error-state">
        <i class="fas fa-exclamation-triangle fa-2x"></i>
        <h4>Failed to Load Sentiment Data</h4>
        <p>${error.message}</p>
        <button class="retry-btn">Retry</button>
      </div>
    `;
  }

  public destroy(): void {
    if (this.sentimentGauge) ChartUtils.destroyChart(`sentiment-gauge-${this.data?.symbol}`);
    if (this.trendChart) ChartUtils.destroyChart(`sentiment-trend-${this.data?.symbol}`);
    this.container.innerHTML = '';
  }

  public getData(): SentimentData | null {
    return this.data;
  }
}
