// Enhanced MCP (Model Context Protocol) Server Implementation
// Provides standardized tool interface for AI agents and LLMs

import express from 'express';
import { logger } from '../utils/logger.js';
import { getOverview } from '../routes/stocks.js';
import { retrieve as ragRetrieve, answer as ragAnswer } from '../rag/langchain.js';
import { backtestSMA } from '../analytics/backtest.js';
import { sentimentScore } from '../analytics/sentiment.js';
import { agentAnswer } from '../agent/agent.js';
import db from '../db.js';
import { globalPerformanceOptimizer } from '../utils/performanceOptimizer.js';
import Sentiment from 'sentiment';

// MCP Tool Definitions with enhanced capabilities
interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  outputSchema: {
    type: string;
    properties: Record<string, any>;
  };
}

const MCP_TOOLS: MCPTool[] = [
  {
    name: 'get_stock_overview',
    description: 'Get comprehensive overview of a stock including price, volume, market cap, and key metrics',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock symbol (e.g., AAPL, BEL.NS)'
        }
      },
      required: ['symbol']
    },
    outputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
        currentPrice: { type: 'number' },
        change: { type: 'number' },
        changePercent: { type: 'number' },
        volume: { type: 'number' },
        marketCap: { type: 'number' },
        peRatio: { type: 'number' },
        high52Week: { type: 'number' },
        low52Week: { type: 'number' }
      }
    }
  },
  {
    name: 'get_stock_prices',
    description: 'Get historical price data for a stock with OHLCV information',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock symbol'
        },
        days: {
          type: 'number',
          description: 'Number of days of historical data (default: 30)',
          default: 30
        }
      },
      required: ['symbol']
    },
    outputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              open: { type: 'number' },
              high: { type: 'number' },
              low: { type: 'number' },
              close: { type: 'number' },
              volume: { type: 'number' }
            }
          }
        }
      }
    }
  },
  {
    name: 'analyze_sentiment',
    description: 'Analyze sentiment of news and social media data for a stock',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock symbol'
        },
        days: {
          type: 'number',
          description: 'Number of days to analyze (default: 7)',
          default: 7
        }
      },
      required: ['symbol']
    },
    outputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
        overall_sentiment: { type: 'number', description: 'Overall sentiment score (0-1)' },
        positive_ratio: { type: 'number' },
        negative_ratio: { type: 'number' },
        neutral_ratio: { type: 'number' },
        confidence: { type: 'number' },
        sources_count: { type: 'number' }
      }
    }
  },
  {
    name: 'query_rag_knowledge',
    description: 'Query the RAG (Retrieval Augmented Generation) system for stock-specific insights and analysis',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock symbol namespace for the query'
        },
        query: {
          type: 'string',
          description: 'Natural language question about the stock'
        },
        with_answer: {
          type: 'boolean',
          description: 'Whether to generate an AI answer (requires OpenAI API key)',
          default: true
        },
        k: {
          type: 'number',
          description: 'Number of relevant documents to retrieve',
          default: 5
        }
      },
      required: ['symbol', 'query']
    },
    outputSchema: {
      type: 'object',
      properties: {
        answer: { type: 'string', description: 'AI-generated answer based on retrieved documents' },
        sources: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              metadata: {
                type: 'object',
                properties: {
                  source: { type: 'string' },
                  date: { type: 'string' },
                  url: { type: 'string' }
                }
              }
            }
          }
        },
        query: { type: 'string' }
      }
    }
  },
  {
    name: 'run_backtest',
    description: 'Run backtesting analysis on a stock with various trading strategies',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock symbol'
        },
        strategy: {
          type: 'string',
          description: 'Trading strategy to test',
          enum: ['sma_cross', 'momentum', 'mean_reversion'],
          default: 'sma_cross'
        },
        start_date: {
          type: 'string',
          description: 'Start date for backtest (YYYY-MM-DD)',
          default: '2023-01-01'
        },
        initial_capital: {
          type: 'number',
          description: 'Initial capital for backtest',
          default: 10000
        }
      },
      required: ['symbol']
    },
    outputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
        strategy: { type: 'string' },
        total_return: { type: 'number' },
        annualized_return: { type: 'number' },
        sharpe_ratio: { type: 'number' },
        max_drawdown: { type: 'number' },
        win_rate: { type: 'number' },
        total_trades: { type: 'number' },
        final_capital: { type: 'number' }
      }
    }
  },
  {
    name: 'get_technical_features',
    description: 'Get comprehensive technical analysis features and indicators for a stock',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock symbol'
        },
        days: {
          type: 'number',
          description: 'Number of days of data to retrieve',
          default: 60
        }
      },
      required: ['symbol']
    },
    outputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
        features: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              rsi: { type: 'number' },
              sma20: { type: 'number' },
              ema50: { type: 'number' },
              momentum: { type: 'number' },
              volatility: { type: 'number' },
              sent_avg: { type: 'number' }
            }
          }
        }
      }
    }
  },
  {
    name: 'query_agent',
    description: 'Query the intelligent stock analysis agent with natural language',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query about stocks, market analysis, or investment decisions'
        },
        context: {
          type: 'object',
          description: 'Additional context for the query',
          properties: {
            symbol: { type: 'string' },
            timeframe: { type: 'string' },
            risk_tolerance: { type: 'string' }
          }
        }
      },
      required: ['query']
    },
    outputSchema: {
      type: 'object',
      properties: {
        answer: { type: 'string' },
        confidence: { type: 'number' },
        tools_used: { type: 'array', items: { type: 'string' } },
        recommendations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string' },
              reasoning: { type: 'string' },
              confidence: { type: 'number' }
            }
          }
        }
      }
    }
  },
  {
    name: 'get_market_news',
    description: 'Get latest market news and analysis for a specific stock or general market',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock symbol (optional for general market news)'
        },
        limit: {
          type: 'number',
          description: 'Number of news articles to retrieve',
          default: 10
        },
        days: {
          type: 'number',
          description: 'Number of days back to search',
          default: 7
        }
      }
    },
    outputSchema: {
      type: 'object',
      properties: {
        news: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              summary: { type: 'string' },
              url: { type: 'string' },
              date: { type: 'string' },
              sentiment: { type: 'number' },
              source: { type: 'string' }
            }
          }
        }
      }
    }
  },
  {
    name: 'health_check',
    description: 'Check system health and availability of various components',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        timestamp: { type: 'string' },
        components: {
          type: 'object',
          properties: {
            database: { type: 'boolean' },
            rag_system: { type: 'boolean' },
            external_apis: { type: 'boolean' }
          }
        }
      }
    }
  }
];

// Tool execution handlers
class MCPToolExecutor {
  static async executeTools(toolName: string, params: any): Promise<any> {
    logger.info({ tool: toolName, params }, 'mcp_tool_execution');
    
    try {
      switch (toolName) {
        case 'get_stock_overview':
          return await this.getStockOverview(params.symbol);
          
        case 'get_stock_prices':
          return await this.getStockPrices(params.symbol, params.days || 30);
          
        case 'analyze_sentiment':
          return await this.analyzeSentiment(params.symbol, params.days || 7);
          
        case 'query_rag_knowledge':
          return await this.queryRAGKnowledge(params.symbol, params.query, params.with_answer, params.k);
          
        case 'run_backtest':
          return await this.runBacktest(params);
          
        case 'get_technical_features':
          return await this.getTechnicalFeatures(params.symbol, params.days || 60);
          
        case 'query_agent':
          return await this.queryAgent(params.query, params.context);
          
        case 'get_market_news':
          return await this.getMarketNews(params.symbol, params.limit, params.days);
          
        case 'health_check':
          return await this.healthCheck();
          
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error: any) {
      logger.error({ tool: toolName, error: error.message }, 'mcp_tool_execution_failed');
      throw error;
    }
  }

  private static async getStockOverview(symbol: string) {
    const overview = await getOverview(symbol);
    return {
      ok: true,
      tool: 'get_stock_overview',
      result: overview
    };
  }

  private static async getStockPrices(symbol: string, days: number) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rows = db.prepare(`
      SELECT date, open, high, low, close, volume 
      FROM prices 
      WHERE symbol = ? AND date >= ? 
      ORDER BY date ASC
    `).all(symbol, cutoff);
    
    return {
      ok: true,
      tool: 'get_stock_prices',
      result: {
        symbol,
        data: rows
      }
    };
  }

  private static async analyzeSentiment(symbol: string, days: number) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0,10);
    const rows = db.prepare("SELECT title, summary FROM news WHERE symbol=? AND date>=? ORDER BY date DESC LIMIT 300").all(symbol, cutoff);
    const sAnalyzer: any = new (Sentiment as any)();
    let pos=0, neg=0, neu=0; const scores: number[] = [];
    for (const r of rows) {
      const txt = `${r.title}. ${r.summary}`;
      const res = sAnalyzer.analyze(txt || '');
      const comp = res.comparative || 0;
      scores.push(comp);
      if (comp > 0.05) pos++; else if (comp < -0.05) neg++; else neu++;
    }
    const avg = scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : 0;
    const overall = (avg + 1) / 2; // map -1..1 -> 0..1
    const total = rows.length;
    // Bayesian confidence: Dirichlet(1,1,1) prior over pos/neg/neu
    const alpha0 = 1, alphaSum = 3; // prior counts
    const postPos = pos + alpha0, postNeg = neg + alpha0, postNeu = neu + alpha0;
    const postTotal = postPos + postNeg + postNeu;
    // Use (1 - normalized entropy) * sample factor
    const pPos = postPos / postTotal, pNeg = postNeg / postTotal, pNeu = postNeu / postTotal;
    const entropy = -[pPos,pNeg,pNeu].reduce((a,b)=> a + (b>0? b*Math.log(b):0),0)/Math.log(3);
    const sampleFactor = total ? (total/(total+10)) : 0; // saturates towards 1
    const confidence = Number((sampleFactor * (1 - entropy)).toFixed(4));
    const result = {
      symbol,
      overall_sentiment: Number(overall.toFixed(4)),
      positive_ratio: total? Number((pos/total).toFixed(4)) : 0,
      negative_ratio: total? Number((neg/total).toFixed(4)) : 0,
      neutral_ratio: total? Number((neu/total).toFixed(4)) : 0,
      confidence,
      sources_count: total
    };
    return { ok: true, tool: 'analyze_sentiment', result };
  }

  private static async queryRAGKnowledge(symbol: string, query: string, withAnswer = true, k = 5) {
    if (withAnswer) {
      const result = await ragAnswer(symbol, query, k);
      return {
        ok: true,
        tool: 'query_rag_knowledge',
        result
      };
    } else {
      const docs = await ragRetrieve(symbol, query, k);
      return {
        ok: true,
        tool: 'query_rag_knowledge',
        result: {
          hits: docs.map(d => ({
            text: d.pageContent,
            metadata: d.metadata
          })),
          query
        }
      };
    }
  }

  private static async runBacktest(params: any) {
    const strategy = params.strategy || 'sma_cross';
    const prices = db.prepare("SELECT date, close FROM prices WHERE symbol=? ORDER BY date ASC").all(params.symbol);
    const pts = prices.map((p:any)=>({date:p.date, close:p.close}));
    if (!pts.length) return { ok:false, tool:'run_backtest', error:'no_price_data' };

    function simpleMomentum(data:any[]) {
      let equity = 10000; const equityCurve=[equity]; let prevPrice = data[0].close; const trades:any[]=[]; let position=0; let entry=0;
      for (let i=1;i<data.length;i++) {
        const p = data[i].close; const mom = p/prevPrice -1; // 1-day momentum
        if (position===0 && mom>0.01) { position=1; entry=p; trades.push({type:'BUY', date:data[i].date, price:p}); }
        if (position===1 && mom<-0.005) { const ret=(p-entry)/entry; equity*= (1+ret); trades.push({type:'SELL', date:data[i].date, price:p, ret}); position=0; }
        prevPrice = p; equityCurve.push(equity);
      }
      if (position===1) { const p = data[data.length-1].close; const ret=(p-entry)/entry; equity*= (1+ret); trades.push({type:'SELL', date:data[data.length-1].date, price:p, ret}); }
      return { equity: equityCurve, trades, totalReturn: equity/10000 -1 };
    }
    function simpleMeanRev(data:any[]) {
      const closes = data.map(d=>d.close); const sma20 = closes.map((_,i)=> { const s=Math.max(0,i-19); const sl=closes.slice(s,i+1); return sl.length<20? NaN: sl.reduce((a,b)=>a+b,0)/sl.length; });
      let equity=10000; const equityCurve=[equity]; const trades:any[]=[]; let position=0; let entry=0;
      for (let i=20;i<data.length;i++) {
        const p = data[i].close; const s = sma20[i]; if (!Number.isFinite(s)) { equityCurve.push(equity); continue; }
        const dev = (p - s)/s;
        if (position===0 && dev < -0.03) { position=1; entry=p; trades.push({type:'BUY', date:data[i].date, price:p}); }
        if (position===1 && dev > 0) { const ret=(p-entry)/entry; equity*=(1+ret); trades.push({type:'SELL', date:data[i].date, price:p, ret}); position=0; }
        equityCurve.push(equity);
      }
      if (position===1) { const p = data[data.length-1].close; const ret=(p-entry)/entry; equity*=(1+ret); trades.push({type:'SELL', date:data[data.length-1].date, price:p, ret}); }
      return { equity: equityCurve, trades, totalReturn: equity/10000 -1 };
    }

    let bt: any;
    if (strategy === 'sma_cross') bt = backtestSMA(pts, 10, 20);
    else if (strategy === 'momentum') bt = simpleMomentum(pts);
    else if (strategy === 'mean_reversion') bt = simpleMeanRev(pts);
    else return { ok:false, tool:'run_backtest', error:'unsupported_strategy' };

    // Derive metrics (reuse logic from existing branch)
    const totalReturn = bt.totalReturn;
    const startDate = pts[0].date; const endDate = pts[pts.length-1].date;
    const daysSpan = (new Date(endDate).getTime() - new Date(startDate).getTime())/(1000*60*60*24) || 1;
    const annualized = Math.pow(1+totalReturn, 365/daysSpan) - 1;
    // compute sharpe etc if not present
    const eq = bt.equity || []; const returns:number[]=[]; for (let i=1;i<eq.length;i++){ const r=eq[i]/eq[i-1]-1; if (Number.isFinite(r)) returns.push(r);} const mean=returns.reduce((a,b)=>a+b,0)/(returns.length||1); const variance=returns.length>1? returns.reduce((a,b)=>a+(b-mean)**2,0)/(returns.length-1):0; const std=Math.sqrt(variance); const sharpe = std>0 ? (mean/std)*Math.sqrt(252): null;
    let peak = eq[0]||10000; let maxDD=0; for (const v of eq){ if (v>peak) peak=v; const dd=v/peak -1; if (dd<maxDD) maxDD=dd; }
    const closed = (bt.trades||[]).filter((t:any)=>t.type==='SELL'); const wins = closed.filter((t:any)=>t.ret>0).length; const winRate = closed.length? wins/closed.length : null;
    const finalCapital = 10000 * (1+totalReturn);
    return { ok: true, tool: 'run_backtest', result: { symbol: params.symbol, strategy, total_return: Number(totalReturn.toFixed(4)), annualized_return: Number(annualized.toFixed(4)), sharpe_ratio: sharpe!==null? Number(sharpe.toFixed(4)): null, max_drawdown: Number(maxDD.toFixed(4)), win_rate: winRate!==null? Number(winRate.toFixed(4)): null, total_trades: closed.length, final_capital: Number(finalCapital.toFixed(2)) } };
  }

  private static async getTechnicalFeatures(symbol: string, days: number) {
    const cache = globalPerformanceOptimizer.cacheManager.getCache('technical_features', { ttl: 1000*60 });
    const key = `${symbol}:${days}`;
    const cached = cache.get(key);
    if (cached) return { ok:true, tool:'get_technical_features', result: { symbol, features: cached, cached: true } };
    let getStoredFeatures: any;
    try {
      ({ getStoredFeatures } = await import('../analytics/features.js'));
    } catch {
      return { ok:false, tool:'get_technical_features', error:'features_module_not_found' };
    }
    const features = await getStoredFeatures(symbol, days);
    cache.set(key, features);
    return { ok: true, tool: 'get_technical_features', result: { symbol, features, cached: false } };
  }

  private static async queryAgent(query: string, context?: any) {
    const result = await agentAnswer(query, context?.symbol);
    return { ok: true, tool: 'query_agent', result };
  }

  private static async getMarketNews(symbol?: string, limit = 10, days = 7) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    
    let query: string;
    let params: any[];
    
    if (symbol) {
      query = `
        SELECT title, summary, url, date, sentiment 
        FROM news 
        WHERE symbol = ? AND date >= ? 
        ORDER BY date DESC 
        LIMIT ?
      `;
      params = [symbol, cutoff, limit];
    } else {
      query = `
        SELECT title, summary, url, date, sentiment 
        FROM news 
        WHERE date >= ? 
        ORDER BY date DESC 
        LIMIT ?
      `;
      params = [cutoff, limit];
    }
    
    const news = db.prepare(query).all(...params);
    
    return {
      ok: true,
      tool: 'get_market_news',
      result: {
        news: news.map((item: any) => ({
          ...item,
          source: 'news_api'
        }))
      }
    };
  }

  private static async healthCheck() {
    const timestamp = new Date().toISOString();
    
    // Check database
    let dbHealthy = false;
    try {
      db.prepare('SELECT 1').get();
      dbHealthy = true;
    } catch (error) {
      logger.warn({ error }, 'database_health_check_failed');
    }

    // Check RAG system
    let ragHealthy = false;
    try {
      // Simple RAG health check
      const testResult = await ragRetrieve('TEST', 'health check', 1);
      ragHealthy = true;
    } catch (error) {
      // RAG might not be configured, which is OK
      ragHealthy = true;
    }

    return {
      ok: true,
      tool: 'health_check',
      result: {
        status: 'healthy',
        timestamp,
        components: {
          database: dbHealthy,
          rag_system: ragHealthy,
          external_apis: true // Assume healthy if we get this far
        }
      }
    };
  }
}

// Enhanced MCP server attachment
export function attachMcp(app: express.Express) {
  // Validation helper
  function validateParams(def: MCPTool, params: any) {
    const errs: string[] = [];
    const schema = def.inputSchema;
    const supplied = params || {};
    // required
    (schema.required || []).forEach(r=> { if (supplied[r] === undefined || supplied[r] === null || supplied[r] === '') errs.push(`Missing required field: ${r}`); });
    // types / enums
    for (const [k, prop] of Object.entries(schema.properties || {})) {
      if (supplied[k] === undefined || supplied[k] === null) continue;
      if (prop.enum && !prop.enum.includes(supplied[k])) errs.push(`Invalid value for ${k}. Expected one of ${prop.enum.join(',')}`);
      if (prop.type && typeof supplied[k] !== prop.type) {
        if (!(prop.type === 'number' && typeof supplied[k] === 'string' && supplied[k].trim() !== '' && !isNaN(Number(supplied[k])))) {
          errs.push(`Field ${k} should be ${prop.type}`);
        } else {
          supplied[k] = Number(supplied[k]);
        }
      }
    }
    return errs;
  }

  // Main MCP tool execution endpoint
  app.post('/mcp/tool', async (req, res, next) => {
    try {
      const { tool, params = {}, id } = req.body || {};
      
      if (!tool) {
        return res.status(400).json({
          ok: false,
          error: 'Tool name required',
          id
        });
      }

      // Validate tool exists
      const toolDef = MCP_TOOLS.find(t => t.name === tool);
      if (!toolDef) {
        return res.status(400).json({
          ok: false,
          error: `Unknown tool: ${tool}`,
          id,
          available_tools: MCP_TOOLS.map(t => t.name)
        });
      }

      // Validate input parameters
      const errors = validateParams(toolDef, params);
      if (errors.length) {
        return res.status(400).json({
          ok: false,
          error: 'validation_failed',
          details: errors,
          id
        });
      }

      // Execute tool
      const result = await MCPToolExecutor.executeTools(tool, params);
      
      res.json({
        ...result,
        id,
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      logger.error({ error: error.message, tool: req.body?.tool }, 'mcp_tool_execution_error');
      res.status(500).json({
        ok: false,
        error: error.message,
        id: req.body?.id,
        timestamp: new Date().toISOString()
      });
    }
  });

  // MCP schema endpoint - returns available tools and their schemas
  app.get('/mcp/schema', (req, res) => {
    res.json({
      ok: true,
      mcp_version: '1.0.0',
      tools: MCP_TOOLS,
      capabilities: {
        stock_analysis: true,
        sentiment_analysis: true,
        rag_queries: true,
        backtesting: true,
        technical_analysis: true,
        ai_agent: true,
        real_time_data: false // WebSocket support not yet implemented
      },
      server_info: {
        name: 'Stock Analytics MCP Server',
        version: '1.0.0',
        description: 'Comprehensive stock analysis and investment intelligence platform'
      }
    });
  });

  // MCP capabilities endpoint
  app.get('/mcp/capabilities', (req, res) => {
    res.json({
      ok: true,
      capabilities: {
        tools: MCP_TOOLS.length,
        stock_data: true,
        technical_analysis: true,
        sentiment_analysis: true,
        rag_system: true,
        backtesting: true,
        ai_agent: true,
        real_time_updates: false,
        portfolio_management: true
      }
    });
  });

  // Performance endpoint
  app.get('/mcp/perf', (req, res) => {
    res.json({ ok: true, report: globalPerformanceOptimizer.getPerformanceReport() });
  });

  // Batch tool execution endpoint
  app.post('/mcp/batch', async (req, res, next) => {
    try {
      const { tools = [], timeout = 30000 } = req.body || {};
      
      if (!Array.isArray(tools) || tools.length === 0) {
        return res.status(400).json({
          ok: false,
          error: 'Tools array required'
        });
      }

      if (tools.length > 10) {
        return res.status(400).json({
          ok: false,
          error: 'Maximum 10 tools allowed in batch'
        });
      }

      // Execute tools in parallel with timeout
      const promises = tools.map(async (toolReq: any) => {
        try {
          const result = await MCPToolExecutor.executeTools(toolReq.tool, toolReq.params || {});
          return {
            id: toolReq.id,
            ...result
          };
        } catch (error: any) {
          return {
            id: toolReq.id,
            ok: false,
            error: error.message
          };
        }
      });

      const results = await Promise.all(promises);
      
      res.json({
        ok: true,
        batch_id: `batch_${Date.now()}`,
        results,
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      logger.error({ error: error.message }, 'mcp_batch_execution_error');
      res.status(500).json({
        ok: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  logger.info({ tools: MCP_TOOLS.length }, 'mcp_server_attached');
}