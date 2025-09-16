/**
 * Centralized stock service with improved error handling and validation
 */

import { BaseService } from './base.service.js';
import { ApiResponse } from '../utils/response.utils.js';
import db, { 
  upsertStock, 
  insertPriceRow, 
  insertNewsRow, 
  listPrices, 
  listNews, 
  saveAnalysis,
  getMcTech,
  upsertMcTech
} from '../../db.js';
import { fetchDailyTimeSeries, parseAlphaDaily } from '../../providers/alphaVantage.js';
import { fetchNews, parseNews } from '../../providers/news.js';
import { fetchMcInsights, fetchMcTech } from '../../providers/moneycontrol.js';
import { fetchStooqDaily } from '../../providers/stooq.js';
import { sentimentScore } from '../../analytics/sentiment.js';
import { predictNextClose } from '../../analytics/predict.js';
import { backtestSMA, scoreStrategy } from '../../analytics/backtest.js';
import { indexDocs } from '../../rag/indexer.js';
import { indexNamespace } from '../../rag/langchain.js';
import { retrieve } from '../../rag/retriever.js';
import { resolveTicker } from '../../utils/ticker.js';

export interface StockOverview {
  symbol: string;
  name?: string;
  lastClose?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  marketCap?: number;
}

export interface StockAnalysis {
  symbol: string;
  sentiment: number;
  prediction: number;
  recommendation: string;
  score: number;
  confidence: number;
  factors: {
    momentum: number;
    sentiment: number;
    technical: number;
    options: number;
  };
}

export class StockService extends BaseService {
  public async getOverview(symbol: string): Promise<ApiResponse<StockOverview>> {
    try {
      this.validateSymbol(symbol);
      
      const prices = listPrices(symbol, 1);
      if (prices.length === 0) {
        return this.success({
          symbol,
          lastClose: 0,
          change: 0,
          changePercent: 0,
          volume: 0
        });
      }

      const latest = prices[0];
      const previous = prices[1];
      
      const change = previous ? latest.close - previous.close : 0;
      const changePercent = previous ? (change / previous.close) * 100 : 0;

      return this.success({
        symbol,
        name: latest.name,
        lastClose: latest.close,
        change,
        changePercent,
        volume: latest.volume,
        marketCap: latest.marketCap
      });

    } catch (error) {
      return this.handleError(error, 'getOverview');
    }
  }

  public async getHistory(symbol: string, days: number = 30): Promise<ApiResponse<any[]>> {
    try {
      this.validateSymbol(symbol);
      
      const prices = listPrices(symbol, days);
      const formatted = prices.map(p => ({
        date: p.date,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume,
        adjustedClose: p.adjustedClose
      }));

      return this.success(formatted);

    } catch (error) {
      return this.handleError(error, 'getHistory');
    }
  }

  public async getNews(symbol: string, limit: number = 10): Promise<ApiResponse<any[]>> {
    try {
      this.validateSymbol(symbol);
      
      const news = listNews(symbol, limit);
      const formatted = news.map(n => ({
        id: n.id,
        date: n.date,
        title: n.title,
        summary: n.summary,
        url: n.url,
        sentiment: n.sentiment
      }));

      return this.success(formatted);

    } catch (error) {
      return this.handleError(error, 'getNews');
    }
  }

  public async getAnalysis(symbol: string): Promise<ApiResponse<StockAnalysis>> {
    try {
      this.validateSymbol(symbol);
      
      // Get sentiment
      const news = listNews(symbol, 20);
      const sentiment = news.length > 0 ? sentimentScore(news.map(n => n.title + ' ' + n.summary)) : 0;

      // Get prediction
      const prices = listPrices(symbol, 20);
      const prediction = prices.length >= 5 ? predictNextClose(prices) : 0;

      // Pre-compute momentum once (used by strategy scoring + factors)
      const momentum = this.calculateMomentum(prices);

      // Get technical backtest (not directly fed into score yet; reserved for future enhancement)
      const backtest = prices.length >= 20 ? backtestSMA(prices, 10, 20) : null;

      // Strategy score (sentiment + momentum). Previously incorrectly passed backtest object.
      const strat = scoreStrategy(sentiment, momentum); // returns { score, recommendation, components }
      const score = strat.score;

      // Calculate recommendation (kept for now; could unify with strat.recommendation later)
      const recommendation = this.calculateRecommendation(sentiment, prediction, score);

      // Calculate factors (reuse momentum; technical currently uses strategy score as before)
      const factors = {
        momentum,         // already computed
        sentiment,
        technical: score, // placeholder until separate technical metric (e.g., from backtest) added
        options: 0        // Placeholder for options data
      };

      const analysis: StockAnalysis = {
        symbol,
        sentiment,
        prediction,
        recommendation,
        score: this.calculateOverallScore(factors),
        confidence: this.calculateConfidence(prices.length, news.length),
        factors
      };

      // Save analysis (fix: provide proper object per saveAnalysis signature)
      try {
        saveAnalysis({
          symbol,
          created_at: new Date().toISOString(),
            sentiment_score: sentiment,
            predicted_close: prediction,
            strategy: { factors, confidence: analysis.confidence },
            score: analysis.score,
            recommendation: analysis.recommendation
        });
      } catch (e) {
        this.logger.warn({ symbol, e }, 'save_analysis_failed');
      }

      return this.success(analysis);

    } catch (error) {
      return this.handleError(error, 'getAnalysis');
    }
  }

  public async ingestData(symbol: string, name?: string): Promise<ApiResponse<{ message: string; data: any }>> {
    try {
      this.validateSymbol(symbol);
      
      const messages: string[] = [];
      const newsQuery = resolveTicker(symbol, 'news');

      this.logger.info({ symbol, newsQuery }, 'ingest_start');

      // Fetch prices from Stooq
      const priceRows = await this.withRetry(() => fetchStooqDaily(symbol));
      if (priceRows.length === 0) {
        throw new Error('No price data returned from Stooq');
      }

      priceRows.forEach(row => insertPriceRow(row));
      messages.push(`Ingested ${priceRows.length} price records`);

      // Fetch news
      const newsApiKey = process.env.NEWS_API_KEY;
      let news: any[] = [];
      
      try {
        const newsJson = await fetchNews(newsQuery, newsApiKey);
        news = parseNews(symbol, newsJson);
        messages.push(`Ingested ${news.length} news articles`);
      } catch (error: any) {
        const isRateLimited = String(error?.message || '').includes('429');
        if (isRateLimited) {
          const useFallback = process.env.NEWS_FALLBACK_TO_SAMPLE_ON_429 === 'true';
          if (useFallback) {
            try {
              const sampleJson = await fetchNews(newsQuery, undefined);
              news = parseNews(symbol, sampleJson);
              messages.push('NewsAPI rate limited, used sample data');
            } catch (e) {
              messages.push('NewsAPI rate limited, no news data');
            }
          } else {
            messages.push('NewsAPI rate limited, skipped news');
          }
        } else {
          throw error;
        }
      }

      news.forEach(row => insertNewsRow(row));

      // Fetch Moneycontrol insights
      try {
        const mcInsights = await fetchMcInsights(symbol);
        if (mcInsights) {
          // fix: upsertMcTech requires freq argument
          upsertMcTech(symbol, 'D', mcInsights);
          messages.push('Updated Moneycontrol insights');
        }
      } catch (error) {
        this.logger.warn({ symbol, error }, 'mc_insights_failed');
        messages.push('Moneycontrol insights unavailable');
      }

      // Index news for RAG
      if (news.length > 0) {
        try {
          // fix: indexDocs expects docs with title/summary fields; pass raw news entries
          await indexDocs(symbol, news);
          messages.push('Indexed news for RAG');
        } catch (error) {
          this.logger.warn({ symbol, error }, 'rag_indexing_failed');
          messages.push('RAG indexing failed');
        }
      }

      // Upsert stock record (fix: remove unsupported extra params)
      upsertStock(symbol, name || symbol);

      return this.success({
        message: messages.join('; '),
        data: {
          prices: priceRows.length,
          news: news.length,
          symbol
        }
      });

    } catch (error) {
      return this.handleError(error, 'ingestData');
    }
  }

  private calculateRecommendation(sentiment: number, prediction: number, score: number): string {
    const overallScore = (sentiment * 0.3) + (prediction * 0.4) + (score * 0.3);
    
    if (overallScore > 0.6) return 'BUY';
    if (overallScore < -0.6) return 'SELL';
    return 'HOLD';
  }

  private calculateMomentum(prices: any[]): number {
    if (prices.length < 2) return 0;
    
    const recent = prices.slice(0, 5);
    const older = prices.slice(5, 10);
    
    if (older.length === 0) return 0;
    
    const recentAvg = recent.reduce((sum, p) => sum + p.close, 0) / recent.length;
    const olderAvg = older.reduce((sum, p) => sum + p.close, 0) / older.length;
    
    return (recentAvg - olderAvg) / olderAvg;
  }

  private calculateOverallScore(factors: any): number {
    return (
      factors.momentum * 0.3 +
      factors.sentiment * 0.3 +
      factors.technical * 0.3 +
      factors.options * 0.1
    );
  }

  private calculateConfidence(priceCount: number, newsCount: number): number {
    const priceConfidence = Math.min(1, priceCount / 20);
    const newsConfidence = Math.min(1, newsCount / 10);
    return (priceConfidence + newsConfidence) / 2;
  }
}
