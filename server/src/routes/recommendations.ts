// Advanced Stock Recommendation API Routes
// RESTful endpoints for intelligent stock recommendation system

import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { recommendationEngine, RecommendationType, RecommendationAction } from '../intelligence/recommendationEngine.js';
import db from '../db.js';

const router = Router();

// Generate Stock Recommendation
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { symbol, type = 'hybrid', timeHorizon = 'medium' } = req.body;
    
    if (!symbol) {
      return res.status(400).json({
        ok: false,
        error: 'Stock symbol is required'
      });
    }

    logger.info({ symbol, type, timeHorizon }, 'generating_stock_recommendation');

    // Validate inputs
    const validTypes = Object.values(RecommendationType);
    const validHorizons = ['short', 'medium', 'long'];

    if (!validTypes.includes(type)) {
      return res.status(400).json({
        ok: false,
        error: `Invalid recommendation type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    if (!validHorizons.includes(timeHorizon)) {
      return res.status(400).json({
        ok: false,
        error: `Invalid time horizon. Must be one of: ${validHorizons.join(', ')}`
      });
    }

    // Generate recommendation
    const recommendation = await recommendationEngine.generateRecommendation(
      symbol.toUpperCase(),
      type as RecommendationType,
      timeHorizon as 'short' | 'medium' | 'long'
    );

    logger.info(
      { 
        symbol, 
        action: recommendation.action, 
        score: recommendation.score,
        confidence: recommendation.confidence 
      }, 
      'recommendation_generated'
    );

    res.json({
      ok: true,
      data: recommendation
    });

  } catch (error: any) {
    logger.error({ error: error.message, symbol: req.body.symbol }, 'recommendation_generation_failed');
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to generate recommendation'
    });
  }
});

// Get Portfolio Recommendations
router.post('/portfolio', async (req: Request, res: Response) => {
  try {
    const { 
      symbols, 
      currentAllocation = {}, 
      riskTolerance = 'moderate' 
    } = req.body;
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'Array of stock symbols is required'
      });
    }

    if (!['conservative', 'moderate', 'aggressive'].includes(riskTolerance)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid risk tolerance. Must be conservative, moderate, or aggressive'
      });
    }

    logger.info({ 
      symbolCount: symbols.length, 
      riskTolerance 
    }, 'generating_portfolio_recommendations');

    // Generate portfolio recommendations
    const portfolioRecommendations = await recommendationEngine.generatePortfolioRecommendations(
      symbols.map((s: string) => s.toUpperCase()),
      currentAllocation,
      riskTolerance as 'conservative' | 'moderate' | 'aggressive'
    );

    logger.info(
      { 
        portfolioScore: portfolioRecommendations.portfolioScore,
        diversificationScore: portfolioRecommendations.diversificationScore
      }, 
      'portfolio_recommendations_generated'
    );

    res.json({
      ok: true,
      data: portfolioRecommendations
    });

  } catch (error: any) {
    logger.error({ error: error.message }, 'portfolio_recommendation_failed');
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to generate portfolio recommendations'
    });
  }
});

// Get Similar Stocks
router.post('/similar', async (req: Request, res: Response) => {
  try {
    const { symbol, limit = 5 } = req.body;
    
    if (!symbol) {
      return res.status(400).json({
        ok: false,
        error: 'Stock symbol is required'
      });
    }

    if (limit < 1 || limit > 20) {
      return res.status(400).json({
        ok: false,
        error: 'Limit must be between 1 and 20'
      });
    }

    logger.info({ symbol, limit }, 'finding_similar_stocks');

    // Get similar stocks
    const similarStocks = await recommendationEngine.getSimilarStockRecommendations(
      symbol.toUpperCase(),
      limit
    );

    res.json({
      ok: true,
      data: similarStocks
    });

  } catch (error: any) {
    logger.error({ error: error.message, symbol: req.body.symbol }, 'similar_stocks_failed');
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to find similar stocks'
    });
  }
});

// Get Historical Recommendations
router.get('/history/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const { limit = 10, days = 30 } = req.query;
    
    const cutoffDate = new Date(Date.now() - parseInt(days as string) * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);

    const query = `
      SELECT * FROM stock_recommendations 
      WHERE symbol = ? AND created_at >= ?
      ORDER BY created_at DESC 
      LIMIT ?
    `;
    
    const recommendations = db.prepare(query).all(
      symbol.toUpperCase(), 
      cutoffDate, 
      parseInt(limit as string)
    );

    // Parse JSON fields
    const processedRecommendations = recommendations.map(rec => ({
      ...rec,
      reasoning: rec.reasoning ? JSON.parse(rec.reasoning) : [],
      metadata: rec.metadata ? JSON.parse(rec.metadata) : {},
      factors: {
        technical: rec.technical_score,
        fundamental: rec.fundamental_score,
        sentiment: rec.sentiment_score,
        momentum: rec.momentum_score
      }
    }));

    res.json({
      ok: true,
      data: processedRecommendations
    });

  } catch (error: any) {
    logger.error({ error: error.message, symbol: req.params.symbol }, 'recommendation_history_failed');
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to retrieve recommendation history'
    });
  }
});

// Get Recommendation Performance
router.get('/performance/:symbol?', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const { days = 30 } = req.query;

    let query = `
      SELECT 
        rp.*,
        sr.action as original_action,
        sr.score as original_score,
        sr.confidence
      FROM recommendation_performance rp
      JOIN stock_recommendations sr ON rp.recommendation_id = sr.id
      WHERE rp.recommendation_date >= date('now', '-${days} days')
    `;
    
    const params: any[] = [];
    
    if (symbol) {
      query += ' AND rp.symbol = ?';
      params.push(symbol.toUpperCase());
    }
    
    query += ' ORDER BY rp.recommendation_date DESC';

    const performance = db.prepare(query).all(...params);

    // Calculate aggregate statistics
    const stats = {
      totalRecommendations: performance.length,
      profitableRecommendations: performance.filter(p => p.actual_return > 0).length,
      avgReturn: performance.reduce((sum, p) => sum + (p.actual_return || 0), 0) / performance.length || 0,
      maxReturn: Math.max(...performance.map(p => p.actual_return || 0), 0),
      minReturn: Math.min(...performance.map(p => p.actual_return || 0), 0),
      accuracyRate: performance.filter(p => p.direction_correct === 1).length / performance.length || 0,
      targetHitRate: performance.filter(p => p.target_achieved === 1).length / performance.length || 0
    };

    res.json({
      ok: true,
      data: {
        performance,
        statistics: stats
      }
    });

  } catch (error: any) {
    logger.error({ error: error.message }, 'recommendation_performance_failed');
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to retrieve recommendation performance'
    });
  }
});

// Get Top Recommendations
router.get('/top', async (req: Request, res: Response) => {
  try {
    const { 
      action, 
      timeHorizon,
      riskLevel,
      limit = 20,
      minScore = -100,
      minConfidence = 0
    } = req.query;

    let query = `
      SELECT 
        sr.*,
        CASE 
          WHEN sr.score >= 60 THEN 'Strong'
          WHEN sr.score >= 20 THEN 'Moderate'
          WHEN sr.score >= -20 THEN 'Weak'
          ELSE 'Very Weak'
        END as strength,
        ROUND((julianday('now') - julianday(sr.created_at)) * 24, 2) as hours_old
      FROM stock_recommendations sr
      WHERE sr.created_at >= datetime('now', '-7 days')
        AND sr.score >= ?
        AND sr.confidence >= ?
    `;
    
    const params: any[] = [parseFloat(minScore as string), parseFloat(minConfidence as string)];
    
    if (action) {
      query += ' AND sr.action = ?';
      params.push(action);
    }
    
    if (timeHorizon) {
      query += ' AND sr.time_horizon = ?';
      params.push(timeHorizon);
    }
    
    if (riskLevel) {
      query += ' AND sr.risk_level = ?';
      params.push(riskLevel);
    }
    
    query += ' ORDER BY sr.score DESC, sr.confidence DESC LIMIT ?';
    params.push(parseInt(limit as string));

    const recommendations = db.prepare(query).all(...params);

    // Process results
    const processedRecommendations = recommendations.map(rec => ({
      ...rec,
      reasoning: rec.reasoning ? JSON.parse(rec.reasoning) : [],
      metadata: rec.metadata ? JSON.parse(rec.metadata) : {},
      factors: {
        technical: rec.technical_score,
        fundamental: rec.fundamental_score,
        sentiment: rec.sentiment_score,
        momentum: rec.momentum_score
      }
    }));

    res.json({
      ok: true,
      data: processedRecommendations
    });

  } catch (error: any) {
    logger.error({ error: error.message }, 'top_recommendations_failed');
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to retrieve top recommendations'
    });
  }
});

// Update Recommendation Performance (for tracking)
router.put('/performance/:recommendationId', async (req: Request, res: Response) => {
  try {
    const { recommendationId } = req.params;
    const { 
      currentPrice,
      status,
      actualReturn,
      directionCorrect,
      targetAchieved 
    } = req.body;

    // First, get the original recommendation
    const recommendation = db.prepare(
      'SELECT * FROM stock_recommendations WHERE id = ?'
    ).get(recommendationId);

    if (!recommendation) {
      return res.status(404).json({
        ok: false,
        error: 'Recommendation not found'
      });
    }

    // Calculate days since recommendation
    const daysSince = Math.floor(
      (Date.now() - new Date(recommendation.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Calculate price change if current price provided
    let priceChangePercent = null;
    if (currentPrice && recommendation.target_price) {
      priceChangePercent = ((currentPrice - recommendation.target_price) / recommendation.target_price) * 100;
    }

    // Insert or update performance record
    const upsertQuery = `
      INSERT INTO recommendation_performance (
        recommendation_id, symbol, recommendation_date, original_price, recommended_action,
        target_price, stop_loss, time_horizon, current_price, price_change_percent,
        days_since_recommendation, status, actual_return, direction_correct, target_achieved
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(recommendation_id) DO UPDATE SET
        current_price = excluded.current_price,
        price_change_percent = excluded.price_change_percent,
        days_since_recommendation = excluded.days_since_recommendation,
        status = excluded.status,
        actual_return = excluded.actual_return,
        direction_correct = excluded.direction_correct,
        target_achieved = excluded.target_achieved,
        last_updated = datetime('now')
    `;

    db.prepare(upsertQuery).run(
      recommendationId,
      recommendation.symbol,
      recommendation.created_at,
      recommendation.target_price, // Using target_price as original_price placeholder
      recommendation.action,
      recommendation.target_price,
      recommendation.stop_loss,
      recommendation.time_horizon,
      currentPrice,
      priceChangePercent,
      daysSince,
      status,
      actualReturn,
      directionCorrect ? 1 : 0,
      targetAchieved ? 1 : 0
    );

    logger.info({ recommendationId, status, actualReturn }, 'recommendation_performance_updated');

    res.json({
      ok: true,
      message: 'Recommendation performance updated successfully'
    });

  } catch (error: any) {
    logger.error({ error: error.message, recommendationId: req.params.recommendationId }, 'performance_update_failed');
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to update recommendation performance'
    });
  }
});

// Get Model Performance Statistics
router.get('/model-performance', async (req: Request, res: Response) => {
  try {
    const { days = 30, modelName } = req.query;

    let query = `
      SELECT * FROM model_performance
      WHERE date >= date('now', '-${days} days')
    `;
    
    const params: any[] = [];
    
    if (modelName) {
      query += ' AND model_name = ?';
      params.push(modelName);
    }
    
    query += ' ORDER BY date DESC';

    const performance = db.prepare(query).all(...params);

    // Calculate aggregate statistics
    const aggregateStats = {
      avgAccuracy: performance.reduce((sum, p) => sum + p.accuracy, 0) / performance.length || 0,
      avgReturn: performance.reduce((sum, p) => sum + p.avg_return, 0) / performance.length || 0,
      totalRecommendations: performance.reduce((sum, p) => sum + p.total_recommendations, 0),
      totalProfitable: performance.reduce((sum, p) => sum + p.profitable_recommendations, 0),
      avgSharpeRatio: performance.reduce((sum, p) => sum + (p.sharpe_ratio || 0), 0) / performance.length || 0
    };

    res.json({
      ok: true,
      data: {
        dailyPerformance: performance,
        aggregateStatistics: aggregateStats
      }
    });

  } catch (error: any) {
    logger.error({ error: error.message }, 'model_performance_failed');
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to retrieve model performance'
    });
  }
});

// Bulk Generate Recommendations
router.post('/bulk-generate', async (req: Request, res: Response) => {
  try {
    const { symbols, type = 'hybrid', timeHorizon = 'medium' } = req.body;
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'Array of stock symbols is required'
      });
    }

    if (symbols.length > 50) {
      return res.status(400).json({
        ok: false,
        error: 'Maximum 50 symbols allowed per bulk request'
      });
    }

    logger.info({ symbolCount: symbols.length, type, timeHorizon }, 'bulk_generating_recommendations');

    // Generate recommendations in parallel with limited concurrency
    const concurrency = 5;
    const results = [];
    
    for (let i = 0; i < symbols.length; i += concurrency) {
      const batch = symbols.slice(i, i + concurrency);
      const batchPromises = batch.map(async (symbol: string) => {
        try {
          const recommendation = await recommendationEngine.generateRecommendation(
            symbol.toUpperCase(),
            type as RecommendationType,
            timeHorizon as 'short' | 'medium' | 'long'
          );
          return { symbol: symbol.toUpperCase(), success: true, data: recommendation };
        } catch (error: any) {
          return { symbol: symbol.toUpperCase(), success: false, error: error.message };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    logger.info({ 
      total: symbols.length, 
      successful: successful.length, 
      failed: failed.length 
    }, 'bulk_recommendations_completed');

    res.json({
      ok: true,
      data: {
        results,
        summary: {
          total: symbols.length,
          successful: successful.length,
          failed: failed.length
        }
      }
    });

  } catch (error: any) {
    logger.error({ error: error.message }, 'bulk_recommendation_failed');
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to generate bulk recommendations'
    });
  }
});

// Health check for recommendation system
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Check database connectivity
    const recentCount = db.prepare(
      "SELECT COUNT(*) as count FROM stock_recommendations WHERE created_at >= datetime('now', '-24 hours')"
    ).get();

    // Check recommendation engine status
    const engineStatus = {
      initialized: !!recommendationEngine,
      recentRecommendations: recentCount?.count || 0,
      cacheSize: 0, // Would implement actual cache size check
      lastUpdate: new Date().toISOString()
    };

    res.json({
      ok: true,
      status: 'healthy',
      data: engineStatus
    });

  } catch (error: any) {
    logger.error({ error: error.message }, 'recommendation_health_check_failed');
    res.status(500).json({
      ok: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

export default router;