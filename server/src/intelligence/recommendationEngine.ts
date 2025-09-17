// Advanced Stock Recommendation Engine
// Inspired by state-of-the-art recommendation systems for financial markets

import { logger } from '../utils/logger.js';
import db from '../db.js';
import { analyzeSentiment } from '../analytics/sentiment.js';
import { getStoredFeatures } from '../analytics/features.js';

// Recommendation types based on different algorithmic approaches
export enum RecommendationType {
  TECHNICAL = 'technical',
  FUNDAMENTAL = 'fundamental', 
  SENTIMENT = 'sentiment',
  MOMENTUM = 'momentum',
  COLLABORATIVE = 'collaborative',
  HYBRID = 'hybrid'
}

export enum RecommendationAction {
  STRONG_BUY = 'STRONG_BUY',
  BUY = 'BUY', 
  HOLD = 'HOLD',
  SELL = 'SELL',
  STRONG_SELL = 'STRONG_SELL',
  WATCH = 'WATCH'
}

export interface StockRecommendation {
  symbol: string;
  action: RecommendationAction;
  confidence: number; // 0-1 scale
  score: number; // -100 to +100 scale
  reasoning: string[];
  type: RecommendationType;
  targetPrice?: number;
  stopLoss?: number;
  timeHorizon: 'short' | 'medium' | 'long'; // 1-7 days, 1-3 months, 3+ months
  riskLevel: 'low' | 'medium' | 'high';
  factors: {
    technical: number;
    fundamental: number;
    sentiment: number;
    momentum: number;
  };
  metadata: {
    generatedAt: string;
    dataQuality: number;
    marketCondition: string;
    volatilityIndex: number;
  };
}

export interface PortfolioRecommendation {
  recommendations: StockRecommendation[];
  portfolioScore: number;
  diversificationScore: number;
  riskAdjustedReturn: number;
  suggestedAllocation: Record<string, number>;
  rebalanceActions: {
    symbol: string;
    currentWeight: number;
    targetWeight: number;
    action: 'increase' | 'decrease' | 'maintain';
  }[];
}

// Advanced Stock Recommendation Engine
export class StockRecommendationEngine {
  private readonly technicalWeights = {
    rsi: 0.25,
    macd: 0.2,
    sma: 0.15,
    ema: 0.15,
    bollinger: 0.1,
    momentum: 0.15
  };

  private readonly sentimentWeights = {
    news: 0.4,
    social: 0.3,
    analyst: 0.3
  };

  private readonly marketConditions = {
    bull: { threshold: 0.6, multiplier: 1.2 },
    bear: { threshold: -0.6, multiplier: 0.8 },
    sideways: { threshold: 0.1, multiplier: 1.0 }
  };

  constructor() {
    logger.info('Stock Recommendation Engine initialized');
  }

  // Main recommendation generation method
  async generateRecommendation(
    symbol: string,
    type: RecommendationType = RecommendationType.HYBRID,
    timeHorizon: 'short' | 'medium' | 'long' = 'medium'
  ): Promise<StockRecommendation> {
    try {
      logger.info({ symbol, type, timeHorizon }, 'generating_stock_recommendation');

      // Gather all required data
      const [technicalData, sentimentData, fundamentalData, priceData] = await Promise.all([
        this.getTechnicalAnalysis(symbol),
        this.getSentimentAnalysis(symbol),
        this.getFundamentalData(symbol),
        this.getPriceHistory(symbol, this.getHistoryDays(timeHorizon))
      ]);

      // Calculate individual scores
      const technicalScore = await this.calculateTechnicalScore(technicalData);
      const sentimentScore = await this.calculateSentimentScore(sentimentData);
      const fundamentalScore = await this.calculateFundamentalScore(fundamentalData);
      const momentumScore = await this.calculateMomentumScore(priceData);

      // Generate hybrid recommendation
      const recommendation = await this.generateHybridRecommendation({
        symbol,
        timeHorizon,
        scores: {
          technical: technicalScore,
          sentiment: sentimentScore,
          fundamental: fundamentalScore,
          momentum: momentumScore
        },
        data: {
          technical: technicalData,
          sentiment: sentimentData,
          fundamental: fundamentalData,
          prices: priceData
        }
      });

      // Store recommendation for collaborative filtering
      await this.storeRecommendation(recommendation);

      return recommendation;

    } catch (error: any) {
      logger.error({ error: error.message, symbol }, 'recommendation_generation_failed');
      throw new Error(`Failed to generate recommendation for ${symbol}: ${error.message}`);
    }
  }

  // Technical Analysis Scoring
  private async calculateTechnicalScore(data: any): Promise<number> {
    if (!data || Object.keys(data).length === 0) return 0;

    let score = 0;
    let totalWeight = 0;

    // RSI Analysis (14-day)
    if (data.rsi !== undefined) {
      const rsiScore = this.calculateRSIScore(data.rsi);
      score += rsiScore * this.technicalWeights.rsi;
      totalWeight += this.technicalWeights.rsi;
    }

    // MACD Analysis
    if (data.macd !== undefined) {
      const macdScore = this.calculateMACDScore(data.macd, data.macdSignal, data.macdHistogram);
      score += macdScore * this.technicalWeights.macd;
      totalWeight += this.technicalWeights.macd;
    }

    // Moving Averages
    if (data.sma20 && data.sma50 && data.currentPrice) {
      const smaScore = this.calculateSMAScore(data.currentPrice, data.sma20, data.sma50);
      score += smaScore * this.technicalWeights.sma;
      totalWeight += this.technicalWeights.sma;
    }

    // EMA Analysis
    if (data.ema12 && data.ema26 && data.currentPrice) {
      const emaScore = this.calculateEMAScore(data.currentPrice, data.ema12, data.ema26);
      score += emaScore * this.technicalWeights.ema;
      totalWeight += this.technicalWeights.ema;
    }

    // Bollinger Bands
    if (data.bollingerUpper && data.bollingerLower && data.currentPrice) {
      const bbScore = this.calculateBollingerScore(data.currentPrice, data.bollingerUpper, data.bollingerLower);
      score += bbScore * this.technicalWeights.bollinger;
      totalWeight += this.technicalWeights.bollinger;
    }

    return totalWeight > 0 ? (score / totalWeight) * 100 : 0;
  }

  // Sentiment Analysis Scoring
  private async calculateSentimentScore(data: any): Promise<number> {
    if (!data) return 0;

    let score = 0;
    let totalWeight = 0;

    // News sentiment
    if (data.newsSentiment !== undefined) {
      const newsScore = (data.newsSentiment - 0.5) * 200; // Convert 0-1 to -100 to +100
      score += newsScore * this.sentimentWeights.news;
      totalWeight += this.sentimentWeights.news;
    }

    // Social media sentiment
    if (data.socialSentiment !== undefined) {
      const socialScore = (data.socialSentiment - 0.5) * 200;
      score += socialScore * this.sentimentWeights.social;
      totalWeight += this.sentimentWeights.social;
    }

    // Analyst sentiment
    if (data.analystSentiment !== undefined) {
      const analystScore = (data.analystSentiment - 0.5) * 200;
      score += analystScore * this.sentimentWeights.analyst;
      totalWeight += this.sentimentWeights.analyst;
    }

    return totalWeight > 0 ? score / totalWeight : 0;
  }

  // Fundamental Analysis Scoring
  private async calculateFundamentalScore(data: any): Promise<number> {
    if (!data) return 0;

    let score = 0;
    let factors = 0;

    // P/E Ratio Analysis
    if (data.peRatio && data.industryPE) {
      if (data.peRatio < data.industryPE * 0.8) score += 20; // Undervalued
      else if (data.peRatio > data.industryPE * 1.3) score -= 20; // Overvalued
      factors++;
    }

    // Debt-to-Equity Analysis
    if (data.debtToEquity !== undefined) {
      if (data.debtToEquity < 0.3) score += 15; // Low debt
      else if (data.debtToEquity > 1.0) score -= 15; // High debt
      factors++;
    }

    // ROE Analysis
    if (data.roe !== undefined) {
      if (data.roe > 0.15) score += 20; // Excellent ROE
      else if (data.roe < 0.05) score -= 20; // Poor ROE
      factors++;
    }

    // Revenue Growth
    if (data.revenueGrowth !== undefined) {
      if (data.revenueGrowth > 0.1) score += 15; // Strong growth
      else if (data.revenueGrowth < 0) score -= 15; // Declining revenue
      factors++;
    }

    return factors > 0 ? score / factors : 0;
  }

  // Momentum Analysis
  private async calculateMomentumScore(priceData: any[]): Promise<number> {
    if (!priceData || priceData.length < 20) return 0;

    const prices = priceData.map(d => d.close).slice(-20);
    const latest = prices[prices.length - 1];
    const week = prices[prices.length - 5];
    const month = prices[0];

    let score = 0;

    // Short-term momentum (1 week)
    const weeklyMomentum = ((latest - week) / week) * 100;
    if (weeklyMomentum > 5) score += 30;
    else if (weeklyMomentum < -5) score -= 30;
    else score += weeklyMomentum * 3;

    // Medium-term momentum (1 month)
    const monthlyMomentum = ((latest - month) / month) * 100;
    if (monthlyMomentum > 10) score += 20;
    else if (monthlyMomentum < -10) score -= 20;
    else score += monthlyMomentum * 1.5;

    // Volume-Price Relationship
    const recentVolumes = priceData.slice(-5).map(d => d.volume);
    const avgRecentVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const historicalAvgVolume = priceData.slice(-20, -5).map(d => d.volume).reduce((a, b) => a + b, 0) / 15;
    
    if (weeklyMomentum > 0 && avgRecentVolume > historicalAvgVolume * 1.2) {
      score += 20; // Strong bullish momentum with volume
    } else if (weeklyMomentum < 0 && avgRecentVolume > historicalAvgVolume * 1.2) {
      score -= 20; // Strong bearish momentum with volume
    }

    return Math.max(-100, Math.min(100, score));
  }

  // Generate comprehensive hybrid recommendation
  private async generateHybridRecommendation(params: {
    symbol: string;
    timeHorizon: 'short' | 'medium' | 'long';
    scores: {
      technical: number;
      sentiment: number;
      fundamental: number;
      momentum: number;
    };
    data: any;
  }): Promise<StockRecommendation> {
    const { symbol, timeHorizon, scores, data } = params;

    // Calculate weighted composite score based on time horizon
    const weights = this.getTimeHorizonWeights(timeHorizon);
    const compositeScore = 
      scores.technical * weights.technical +
      scores.sentiment * weights.sentiment +
      scores.fundamental * weights.fundamental +
      scores.momentum * weights.momentum;

    // Determine action and confidence
    const { action, confidence } = this.determineActionAndConfidence(compositeScore, scores);

    // Calculate risk level
    const riskLevel = this.calculateRiskLevel(data.prices, scores);

    // Generate reasoning
    const reasoning = this.generateReasoning(scores, action, data);

    // Calculate target price and stop loss
    const currentPrice = data.prices[data.prices.length - 1]?.close || 0;
    const { targetPrice, stopLoss } = this.calculatePriceTargets(
      currentPrice,
      compositeScore,
      action,
      riskLevel,
      timeHorizon
    );

    // Market condition analysis
    const marketCondition = this.analyzeMarketCondition(data.prices);
    const volatilityIndex = this.calculateVolatility(data.prices);

    return {
      symbol,
      action,
      confidence,
      score: Math.round(compositeScore),
      reasoning,
      type: RecommendationType.HYBRID,
      targetPrice,
      stopLoss,
      timeHorizon,
      riskLevel,
      factors: {
        technical: Math.round(scores.technical),
        fundamental: Math.round(scores.fundamental),
        sentiment: Math.round(scores.sentiment),
        momentum: Math.round(scores.momentum)
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        dataQuality: this.assessDataQuality(data),
        marketCondition,
        volatilityIndex
      }
    };
  }

  // Portfolio-level recommendations with diversification
  async generatePortfolioRecommendations(
    symbols: string[],
    currentAllocation: Record<string, number> = {},
    riskTolerance: 'conservative' | 'moderate' | 'aggressive' = 'moderate'
  ): Promise<PortfolioRecommendation> {
    try {
      logger.info({ symbolCount: symbols.length, riskTolerance }, 'generating_portfolio_recommendations');

      // Generate individual recommendations
      const individualRecommendations = await Promise.all(
        symbols.map(symbol => this.generateRecommendation(symbol))
      );

      // Calculate portfolio-level metrics
      const portfolioScore = this.calculatePortfolioScore(individualRecommendations);
      const diversificationScore = this.calculateDiversificationScore(symbols, individualRecommendations);
      const riskAdjustedReturn = this.calculateRiskAdjustedReturn(individualRecommendations);

      // Generate optimal allocation
      const suggestedAllocation = this.optimizePortfolioAllocation(
        individualRecommendations,
        riskTolerance
      );

      // Generate rebalancing actions
      const rebalanceActions = this.generateRebalanceActions(
        currentAllocation,
        suggestedAllocation
      );

      return {
        recommendations: individualRecommendations,
        portfolioScore,
        diversificationScore,
        riskAdjustedReturn,
        suggestedAllocation,
        rebalanceActions
      };

    } catch (error: any) {
      logger.error({ error: error.message }, 'portfolio_recommendation_failed');
      throw new Error(`Failed to generate portfolio recommendations: ${error.message}`);
    }
  }

  // Collaborative Filtering for similar stocks
  async getSimilarStockRecommendations(
    symbol: string,
    limit: number = 5
  ): Promise<{ symbol: string; similarity: number; recommendation: StockRecommendation }[]> {
    try {
      // Get similar stocks based on technical patterns, sector, and historical correlations
      const similarStocks = await this.findSimilarStocks(symbol);
      
      const recommendations = await Promise.all(
        similarStocks.slice(0, limit).map(async (similar) => {
          const recommendation = await this.generateRecommendation(similar.symbol);
          return {
            symbol: similar.symbol,
            similarity: similar.similarity,
            recommendation
          };
        })
      );

      return recommendations.sort((a, b) => b.similarity - a.similarity);

    } catch (error: any) {
      logger.error({ error: error.message, symbol }, 'similar_stocks_recommendation_failed');
      return [];
    }
  }

  // Utility methods for technical indicators
  private calculateRSIScore(rsi: number): number {
    if (rsi <= 30) return 80; // Oversold - strong buy signal
    if (rsi <= 40) return 40; // Approaching oversold
    if (rsi >= 70) return -80; // Overbought - strong sell signal
    if (rsi >= 60) return -40; // Approaching overbought
    return 0; // Neutral zone
  }

  private calculateMACDScore(macd: number, signal: number, histogram: number): number {
    let score = 0;
    
    // MACD line crossing signal line
    if (macd > signal && histogram > 0) score += 40; // Bullish crossover
    if (macd < signal && histogram < 0) score -= 40; // Bearish crossover
    
    // MACD above/below zero line
    if (macd > 0) score += 20; // Above zero - bullish momentum
    if (macd < 0) score -= 20; // Below zero - bearish momentum
    
    return score;
  }

  private calculateSMAScore(price: number, sma20: number, sma50: number): number {
    let score = 0;
    
    // Price vs SMA20
    if (price > sma20 * 1.02) score += 30; // Price well above SMA20
    else if (price < sma20 * 0.98) score -= 30; // Price well below SMA20
    
    // SMA20 vs SMA50 (Golden/Death Cross)
    if (sma20 > sma50) score += 20; // Golden cross territory
    else score -= 20; // Death cross territory
    
    return score;
  }

  private calculateEMAScore(price: number, ema12: number, ema26: number): number {
    let score = 0;
    
    // Price relative to EMAs
    if (price > Math.max(ema12, ema26)) score += 30;
    else if (price < Math.min(ema12, ema26)) score -= 30;
    
    // EMA alignment
    if (ema12 > ema26) score += 20; // Bullish alignment
    else score -= 20; // Bearish alignment
    
    return score;
  }

  private calculateBollingerScore(price: number, upper: number, lower: number): number {
    const position = (price - lower) / (upper - lower);
    
    if (position <= 0.1) return 60; // Near lower band - potential buy
    if (position >= 0.9) return -60; // Near upper band - potential sell
    if (position > 0.4 && position < 0.6) return 0; // Middle of bands - neutral
    
    return (position - 0.5) * -40; // Linear scoring from center
  }

  private getTimeHorizonWeights(timeHorizon: 'short' | 'medium' | 'long') {
    switch (timeHorizon) {
      case 'short':
        return { technical: 0.4, sentiment: 0.3, momentum: 0.25, fundamental: 0.05 };
      case 'medium':
        return { technical: 0.3, sentiment: 0.2, momentum: 0.2, fundamental: 0.3 };
      case 'long':
        return { technical: 0.15, sentiment: 0.1, momentum: 0.15, fundamental: 0.6 };
    }
  }

  private determineActionAndConfidence(compositeScore: number, scores: any): { action: RecommendationAction; confidence: number } {
    const absScore = Math.abs(compositeScore);
    
    // Calculate confidence based on score consistency
    const scoreArray = Object.values(scores) as number[];
    const scoreVariance = this.calculateVariance(scoreArray);
    const baseConfidence = Math.min(absScore / 80, 1.0); // Max confidence at score >= 80
    const consistencyFactor = Math.max(0.5, 1 - (scoreVariance / 10000)); // Reduce confidence for inconsistent scores
    const confidence = baseConfidence * consistencyFactor;
    
    if (compositeScore >= 60) return { action: RecommendationAction.STRONG_BUY, confidence };
    if (compositeScore >= 20) return { action: RecommendationAction.BUY, confidence };
    if (compositeScore >= -20) return { action: RecommendationAction.HOLD, confidence };
    if (compositeScore >= -60) return { action: RecommendationAction.SELL, confidence };
    return { action: RecommendationAction.STRONG_SELL, confidence };
  }

  private calculateRiskLevel(prices: any[], scores: any): 'low' | 'medium' | 'high' {
    const volatility = this.calculateVolatility(prices);
    const scoreVariance = this.calculateVariance(Object.values(scores) as number[]);
    
    if (volatility > 0.4 || scoreVariance > 5000) return 'high';
    if (volatility > 0.2 || scoreVariance > 2000) return 'medium';
    return 'low';
  }

  private generateReasoning(scores: any, action: RecommendationAction, data: any): string[] {
    const reasoning: string[] = [];
    
    // Technical reasoning
    if (scores.technical > 30) {
      reasoning.push('Strong technical indicators suggest upward price momentum');
    } else if (scores.technical < -30) {
      reasoning.push('Technical indicators show bearish signals and potential downside');
    }
    
    // Sentiment reasoning
    if (scores.sentiment > 20) {
      reasoning.push('Positive market sentiment and news coverage support bullish outlook');
    } else if (scores.sentiment < -20) {
      reasoning.push('Negative sentiment and news flow create headwinds for price appreciation');
    }
    
    // Momentum reasoning
    if (scores.momentum > 30) {
      reasoning.push('Strong price momentum with increasing volume confirms trend strength');
    } else if (scores.momentum < -30) {
      reasoning.push('Weakening momentum and declining volume suggest trend exhaustion');
    }
    
    // Fundamental reasoning
    if (scores.fundamental > 25) {
      reasoning.push('Strong fundamentals including earnings growth and healthy balance sheet');
    } else if (scores.fundamental < -25) {
      reasoning.push('Weak fundamentals raise concerns about long-term value proposition');
    }
    
    if (reasoning.length === 0) {
      reasoning.push('Mixed signals across technical, fundamental, and sentiment analysis');
    }
    
    return reasoning;
  }

  private calculatePriceTargets(
    currentPrice: number,
    score: number,
    action: RecommendationAction,
    riskLevel: 'low' | 'medium' | 'high',
    timeHorizon: 'short' | 'medium' | 'long'
  ): { targetPrice?: number; stopLoss?: number } {
    if (!currentPrice || currentPrice === 0) return {};
    
    const riskMultipliers = { low: 0.8, medium: 1.0, high: 1.3 };
    const timeMultipliers = { short: 0.5, medium: 1.0, long: 1.8 };
    
    const baseMultiplier = riskMultipliers[riskLevel] * timeMultipliers[timeHorizon];
    
    let targetPrice: number | undefined;
    let stopLoss: number | undefined;
    
    if (action === RecommendationAction.STRONG_BUY || action === RecommendationAction.BUY) {
      const upside = (Math.abs(score) / 100) * 0.3 * baseMultiplier;
      targetPrice = currentPrice * (1 + upside);
      stopLoss = currentPrice * (1 - (upside * 0.5)); // 50% of upside as downside protection
    } else if (action === RecommendationAction.SELL || action === RecommendationAction.STRONG_SELL) {
      const downside = (Math.abs(score) / 100) * 0.3 * baseMultiplier;
      targetPrice = currentPrice * (1 - downside);
      stopLoss = currentPrice * (1 + (downside * 0.3)); // 30% of downside as upside protection
    }
    
    return { targetPrice, stopLoss };
  }

  // Helper methods for data retrieval and calculations
  private async getTechnicalAnalysis(symbol: string): Promise<any> {
    try {
      const features = await getStoredFeatures(symbol, 30);
      if (!features || features.length === 0) return {};
      
      const latest = features[features.length - 1];
      const prices = await this.getPriceHistory(symbol, 5);
      const currentPrice = prices[prices.length - 1]?.close || 0;
      
      return {
        rsi: latest.rsi,
        macd: latest.macd,
        macdSignal: latest.macdSignal,
        macdHistogram: latest.macdHistogram,
        sma20: latest.sma20,
        sma50: latest.sma50,
        ema12: latest.ema12,
        ema26: latest.ema26,
        bollingerUpper: latest.bollingerUpper,
        bollingerLower: latest.bollingerLower,
        currentPrice
      };
    } catch (error) {
      logger.warn({ error, symbol }, 'technical_analysis_retrieval_failed');
      return {};
    }
  }

  private async getSentimentAnalysis(symbol: string): Promise<any> {
    try {
      const sentiment = await analyzeSentiment(symbol, 7);
      return {
        newsSentiment: sentiment.overall_sentiment,
        socialSentiment: sentiment.social_sentiment || sentiment.overall_sentiment,
        analystSentiment: sentiment.analyst_sentiment || sentiment.overall_sentiment
      };
    } catch (error) {
      logger.warn({ error, symbol }, 'sentiment_analysis_retrieval_failed');
      return {};
    }
  }

  private async getFundamentalData(symbol: string): Promise<any> {
    try {
      const query = `
        SELECT 
          pe_ratio as peRatio,
          debt_to_equity as debtToEquity,
          roe,
          revenue_growth as revenueGrowth,
          industry_pe as industryPE
        FROM fundamentals 
        WHERE symbol = ?
        ORDER BY date DESC 
        LIMIT 1
      `;
      
      const result = db.prepare(query).get(symbol);
      return result || {};
    } catch (error) {
      logger.warn({ error, symbol }, 'fundamental_data_retrieval_failed');
      return {};
    }
  }

  private async getPriceHistory(symbol: string, days: number): Promise<any[]> {
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const query = `
        SELECT date, open, high, low, close, volume
        FROM prices 
        WHERE symbol = ? AND date >= ?
        ORDER BY date ASC
      `;
      
      return db.prepare(query).all(symbol, cutoff) || [];
    } catch (error) {
      logger.warn({ error, symbol }, 'price_history_retrieval_failed');
      return [];
    }
  }

  private getHistoryDays(timeHorizon: 'short' | 'medium' | 'long'): number {
    switch (timeHorizon) {
      case 'short': return 30;
      case 'medium': return 90;
      case 'long': return 252;
    }
  }

  private analyzeMarketCondition(prices: any[]): string {
    if (!prices || prices.length < 20) return 'unknown';
    
    const recent = prices.slice(-20).map(p => p.close);
    const trend = (recent[recent.length - 1] - recent[0]) / recent[0];
    
    if (trend > 0.1) return 'bull';
    if (trend < -0.1) return 'bear';
    return 'sideways';
  }

  private calculateVolatility(prices: any[]): number {
    if (!prices || prices.length < 2) return 0;
    
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i].close - prices[i-1].close) / prices[i-1].close);
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance) * Math.sqrt(252); // Annualized volatility
  }

  private calculateVariance(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    return numbers.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numbers.length;
  }

  private assessDataQuality(data: any): number {
    let quality = 0;
    let factors = 0;
    
    if (data.technical && Object.keys(data.technical).length > 5) { quality += 25; factors++; }
    if (data.sentiment && Object.keys(data.sentiment).length > 0) { quality += 25; factors++; }
    if (data.fundamental && Object.keys(data.fundamental).length > 3) { quality += 25; factors++; }
    if (data.prices && data.prices.length >= 20) { quality += 25; factors++; }
    
    return factors > 0 ? quality / factors : 0;
  }

  // Portfolio optimization methods
  private calculatePortfolioScore(recommendations: StockRecommendation[]): number {
    if (recommendations.length === 0) return 0;
    
    const weightedScore = recommendations.reduce((sum, rec) => {
      return sum + (rec.score * rec.confidence);
    }, 0);
    
    const totalConfidence = recommendations.reduce((sum, rec) => sum + rec.confidence, 0);
    
    return totalConfidence > 0 ? weightedScore / totalConfidence : 0;
  }

  private calculateDiversificationScore(symbols: string[], recommendations: StockRecommendation[]): number {
    // Simple diversification based on number of stocks and risk distribution
    const riskDistribution = {
      low: recommendations.filter(r => r.riskLevel === 'low').length,
      medium: recommendations.filter(r => r.riskLevel === 'medium').length,
      high: recommendations.filter(r => r.riskLevel === 'high').length
    };
    
    const total = recommendations.length;
    if (total === 0) return 0;
    
    // Ideal distribution: 40% low, 40% medium, 20% high risk
    const idealLow = 0.4, idealMedium = 0.4, idealHigh = 0.2;
    const actualLow = riskDistribution.low / total;
    const actualMedium = riskDistribution.medium / total;
    const actualHigh = riskDistribution.high / total;
    
    const deviation = Math.abs(actualLow - idealLow) + Math.abs(actualMedium - idealMedium) + Math.abs(actualHigh - idealHigh);
    
    return Math.max(0, (1 - deviation) * 100);
  }

  private calculateRiskAdjustedReturn(recommendations: StockRecommendation[]): number {
    if (recommendations.length === 0) return 0;
    
    const totalReturn = recommendations.reduce((sum, rec) => sum + rec.score, 0);
    const avgVolatility = recommendations.reduce((sum, rec) => sum + rec.metadata.volatilityIndex, 0) / recommendations.length;
    
    return avgVolatility > 0 ? totalReturn / avgVolatility : 0;
  }

  private optimizePortfolioAllocation(
    recommendations: StockRecommendation[],
    riskTolerance: 'conservative' | 'moderate' | 'aggressive'
  ): Record<string, number> {
    const allocation: Record<string, number> = {};
    
    // Risk tolerance multipliers
    const riskMultipliers = {
      conservative: { low: 1.5, medium: 1.0, high: 0.5 },
      moderate: { low: 1.0, medium: 1.2, high: 0.8 },
      aggressive: { low: 0.7, medium: 1.0, high: 1.5 }
    };
    
    const multipliers = riskMultipliers[riskTolerance];
    
    // Calculate base weights using confidence and scores
    let totalWeight = 0;
    const weights: Record<string, number> = {};
    
    for (const rec of recommendations) {
      const riskMultiplier = multipliers[rec.riskLevel];
      const baseWeight = rec.confidence * Math.max(0, rec.score / 100) * riskMultiplier;
      weights[rec.symbol] = baseWeight;
      totalWeight += baseWeight;
    }
    
    // Normalize to percentages
    if (totalWeight > 0) {
      for (const symbol in weights) {
        allocation[symbol] = (weights[symbol] / totalWeight) * 100;
      }
    } else {
      // Equal weight if no positive scores
      const equalWeight = 100 / recommendations.length;
      for (const rec of recommendations) {
        allocation[rec.symbol] = equalWeight;
      }
    }
    
    return allocation;
  }

  private generateRebalanceActions(
    currentAllocation: Record<string, number>,
    suggestedAllocation: Record<string, number>
  ): { symbol: string; currentWeight: number; targetWeight: number; action: 'increase' | 'decrease' | 'maintain' }[] {
    const actions = [];
    const threshold = 5; // 5% difference threshold for rebalancing
    
    for (const symbol in suggestedAllocation) {
      const current = currentAllocation[symbol] || 0;
      const target = suggestedAllocation[symbol];
      const difference = Math.abs(target - current);
      
      let action: 'increase' | 'decrease' | 'maintain' = 'maintain';
      
      if (difference > threshold) {
        action = target > current ? 'increase' : 'decrease';
      }
      
      actions.push({
        symbol,
        currentWeight: current,
        targetWeight: target,
        action
      });
    }
    
    return actions;
  }

  private async findSimilarStocks(symbol: string): Promise<{ symbol: string; similarity: number }[]> {
    // This would implement collaborative filtering based on:
    // 1. Technical pattern similarity
    // 2. Sector/industry correlation
    // 3. Historical price correlation
    // 4. User behavior patterns
    
    // For now, return a simplified implementation
    try {
      const query = `
        SELECT DISTINCT symbol
        FROM prices 
        WHERE symbol != ? 
        AND symbol IN (SELECT symbol FROM prices GROUP BY symbol HAVING COUNT(*) > 50)
        LIMIT 20
      `;
      
      const similarSymbols = db.prepare(query).all(symbol) as { symbol: string }[];
      
      // Calculate simple correlation-based similarity (placeholder)
      return similarSymbols.map(s => ({
        symbol: s.symbol,
        similarity: Math.random() * 0.5 + 0.5 // Placeholder similarity score
      })).sort((a, b) => b.similarity - a.similarity);
      
    } catch (error) {
      logger.warn({ error, symbol }, 'similar_stocks_calculation_failed');
      return [];
    }
  }

  private async storeRecommendation(recommendation: StockRecommendation): Promise<void> {
    try {
      const insertQuery = `
        INSERT OR REPLACE INTO stock_recommendations (
          symbol, action, confidence, score, recommendation_type, 
          time_horizon, risk_level, target_price, stop_loss,
          technical_score, fundamental_score, sentiment_score, momentum_score,
          reasoning, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      db.prepare(insertQuery).run(
        recommendation.symbol,
        recommendation.action,
        recommendation.confidence,
        recommendation.score,
        recommendation.type,
        recommendation.timeHorizon,
        recommendation.riskLevel,
        recommendation.targetPrice || null,
        recommendation.stopLoss || null,
        recommendation.factors.technical,
        recommendation.factors.fundamental,
        recommendation.factors.sentiment,
        recommendation.factors.momentum,
        JSON.stringify(recommendation.reasoning),
        JSON.stringify(recommendation.metadata),
        new Date().toISOString()
      );
      
    } catch (error) {
      logger.warn({ error, symbol: recommendation.symbol }, 'recommendation_storage_failed');
    }
  }
}

// Export singleton instance
export const recommendationEngine = new StockRecommendationEngine();