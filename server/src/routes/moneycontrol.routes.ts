import { Router } from 'express';
import { indicesProvider, stocksProvider, defaultSymbols } from '../providers/moneycontrol/index.js';

const router = Router();

// =============================================================================
// 📊 INDICES ROUTES
// =============================================================================

// GET /api/mc/indices/indian - Get Indian indices overview
router.get('/indices/indian', async (req, res) => {
  try {
    const result = await indicesProvider.getIndianIndices();
    res.json({ 
      success: true, 
      data: result, 
      endpoint: 'Indian Indices',
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      endpoint: 'Indian Indices',
      source: 'moneycontrol-indices',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/indices/details - Get specific index details
router.get('/indices/details', async (req, res) => {
  try {
    const { indexId = defaultSymbols.INDEX_ID } = req.query;
    const result = await indicesProvider.getIndicesDetails(indexId as string);
    res.json({ 
      success: true, 
      data: result, 
      indexId: indexId as string,
      endpoint: 'Indices Details',
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      indexId: req.query.indexId || defaultSymbols.INDEX_ID,
      endpoint: 'Indices Details',
      source: 'moneycontrol-indices',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/indices/list - Get indices list with app version
router.get('/indices/list', async (req, res) => {
  try {
    const { appVersion } = req.query;
    const result = await indicesProvider.getIndicesList(appVersion as string);
    res.json({ 
      success: true, 
      data: result, 
      appVersion: appVersion as string,
      endpoint: 'Indices List',
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      appVersion: req.query.appVersion,
      endpoint: 'Indices List',
      source: 'moneycontrol-indices',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/indices/list-basic - Get basic indices list
router.get('/indices/list-basic', async (req, res) => {
  try {
    const result = await indicesProvider.getIndicesListBasic();
    res.json({ 
      success: true, 
      data: result,
      endpoint: 'Indices List Basic',
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      endpoint: 'Indices List Basic',
      source: 'moneycontrol-indices',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/indices/advance-decline - Get exchange advance decline data
router.get('/indices/advance-decline', async (req, res) => {
  try {
    const { exchange = defaultSymbols.EXCHANGE } = req.query;
    const result = await indicesProvider.getAdvanceDecline(exchange as string);
    res.json({ 
      success: true, 
      data: result, 
      exchange: exchange as string,
      endpoint: 'Advance Decline',
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      exchange: req.query.exchange || defaultSymbols.EXCHANGE,
      endpoint: 'Advance Decline',
      source: 'moneycontrol-indices',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/indices/all - Get all indices data
router.get('/indices/all', async (req, res) => {
  try {
    const result = await indicesProvider.getAllIndicesData();
    res.json({ 
      success: true, 
      data: result,
      endpoint: 'All Indices Data',
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      endpoint: 'All Indices Data',
      source: 'moneycontrol-indices',
      timestamp: new Date().toISOString()
    });
  }
});

// =============================================================================
// 📈 STOCKS ROUTES
// =============================================================================

// GET /api/mc/stocks/price - Get stock price (supports dynamic symbol from stocklist.ts dropdown)
router.get('/stocks/price', async (req, res) => {
  try {
    const { symbol = defaultSymbols.MC_SYMBOL } = req.query;
    const result = await stocksProvider.getStockPrice(symbol as string);
    res.json({ 
      success: true, 
      data: result, 
      symbol: symbol as string,
      endpoint: 'Stock Price',
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      symbol: req.query.symbol || defaultSymbols.MC_SYMBOL,
      endpoint: 'Stock Price',
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/price-volume - Get stock price and volume data
router.get('/stocks/price-volume', async (req, res) => {
  try {
    const { symbol = defaultSymbols.MC_SYMBOL } = req.query;
    const result = await stocksProvider.getStockPriceVolume(symbol as string);
    res.json({ 
      success: true, 
      data: result, 
      symbol: symbol as string,
      endpoint: 'Price Volume',
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      symbol: req.query.symbol || defaultSymbols.MC_SYMBOL,
      endpoint: 'Price Volume',
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/vwap - Get VWAP chart data
router.get('/stocks/vwap', async (req, res) => {
  try {
    const { symbol = defaultSymbols.MC_SYMBOL } = req.query;
    const result = await stocksProvider.getStockVWAP(symbol as string);
    res.json({ 
      success: true, 
      data: result, 
      symbol: symbol as string,
      endpoint: 'VWAP',
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      symbol: req.query.symbol || defaultSymbols.MC_SYMBOL,
      endpoint: 'VWAP',
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/financial-overview - Get financial overview
router.get('/stocks/financial-overview', async (req, res) => {
  try {
    const { symbol = defaultSymbols.MC_SYMBOL } = req.query;
    const result = await stocksProvider.getFinancialOverview(symbol as string);
    res.json({ 
      success: true, 
      data: result, 
      symbol: symbol as string,
      endpoint: 'Financial Overview',
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      symbol: req.query.symbol || defaultSymbols.MC_SYMBOL,
      endpoint: 'Financial Overview',
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/price-forecast - Get price forecast
router.get('/stocks/price-forecast', async (req, res) => {
  try {
    const { symbol = defaultSymbols.MC_SYMBOL } = req.query;
    const result = await stocksProvider.getPriceForecast(symbol as string);
    res.json({ 
      success: true, 
      data: result, 
      symbol: symbol as string,
      endpoint: 'Price Forecast',
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      symbol: req.query.symbol || defaultSymbols.MC_SYMBOL,
      endpoint: 'Price Forecast',
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/consensus - Get analyst consensus
router.get('/stocks/consensus', async (req, res) => {
  try {
    const { symbol = defaultSymbols.MC_SYMBOL } = req.query;
    const result = await stocksProvider.getConsensus(symbol as string);
    res.json({ 
      success: true, 
      data: result, 
      symbol: symbol as string,
      endpoint: 'Consensus',
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      symbol: req.query.symbol || defaultSymbols.MC_SYMBOL,
      endpoint: 'Consensus',
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/analyst-rating - Get analyst ratings
router.get('/stocks/analyst-rating', async (req, res) => {
  try {
    const { symbol = defaultSymbols.MC_SYMBOL } = req.query;
    const result = await stocksProvider.getAnalystRating(symbol as string);
    res.json({ 
      success: true, 
      data: result, 
      symbol: symbol as string,
      endpoint: 'Analyst Rating',
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      symbol: req.query.symbol || defaultSymbols.MC_SYMBOL,
      endpoint: 'Analyst Rating',
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/earning-forecast - Get earnings forecast
router.get('/stocks/earning-forecast', async (req, res) => {
  try {
    const { symbol = defaultSymbols.MC_SYMBOL } = req.query;
    const result = await stocksProvider.getEarningForecast(symbol as string);
    res.json({ 
      success: true, 
      data: result, 
      symbol: symbol as string,
      endpoint: 'Earning Forecast',
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      symbol: req.query.symbol || defaultSymbols.MC_SYMBOL,
      endpoint: 'Earning Forecast',
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/valuation - Get stock valuation
router.get('/stocks/valuation', async (req, res) => {
  try {
    const { symbol = defaultSymbols.MC_SYMBOL } = req.query;
    const result = await stocksProvider.getValuation(symbol as string);
    res.json({ 
      success: true, 
      data: result, 
      symbol: symbol as string,
      endpoint: 'Valuation',
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      symbol: req.query.symbol || defaultSymbols.MC_SYMBOL,
      endpoint: 'Valuation',
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/hits-misses - Get earnings hits and misses
router.get('/stocks/hits-misses', async (req, res) => {
  try {
    const { symbol = defaultSymbols.MC_SYMBOL } = req.query;
    const result = await stocksProvider.getHitsMisses(symbol as string);
    res.json({ 
      success: true, 
      data: result, 
      symbol: symbol as string,
      endpoint: 'Hits Misses',
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      symbol: req.query.symbol || defaultSymbols.MC_SYMBOL,
      endpoint: 'Hits Misses',
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/all-prices - Get all stock prices
router.get('/stocks/all-prices', async (req, res) => {
  try {
    const result = await stocksProvider.getAllStocksPrice();
    res.json({ 
      success: true, 
      data: result,
      symbols: defaultSymbols.PORTFOLIO_SYMBOLS,
      count: defaultSymbols.PORTFOLIO_SYMBOLS.length,
      endpoint: 'All Stock Prices',
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      endpoint: 'All Stock Prices',
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/all-price-volume - Get all stock price-volume data
router.get('/stocks/all-price-volume', async (req, res) => {
  try {
    const result = await stocksProvider.getAllStocksPriceVolume();
    res.json({ 
      success: true, 
      data: result,
      symbols: defaultSymbols.PORTFOLIO_SYMBOLS,
      count: defaultSymbols.PORTFOLIO_SYMBOLS.length,
      endpoint: 'All Stock Price Volume',
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      endpoint: 'All Stock Price Volume',
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/complete/:symbol - Get complete stock data
router.get('/stocks/complete/:symbol', async (req, res) => {
  try {
    const { symbol = defaultSymbols.MC_SYMBOL } = req.params;
    const result = await stocksProvider.getCompleteStockData(symbol);
    res.json({ 
      success: true, 
      data: result,
      symbol,
      endpoint: 'Complete Stock Data',
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      symbol: req.params.symbol || defaultSymbols.MC_SYMBOL,
      endpoint: 'Complete Stock Data',
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// =============================================================================
// 🔍 HEALTH CHECK & INFO ROUTES
// =============================================================================

// GET /api/mc/health - Health check endpoint
router.get('/health', async (req, res) => {
  res.json({
    success: true,
    service: 'MoneyControl API Integration',
    status: 'active',
    version: '2.0.0',
    endpoints: {
      indices: 6,
      stocks: 12,
      total: 18
    },
    features: {
      stockDropdownIntegration: true,
      dynamicSymbolReplacement: true,
      stocklistTsSupport: true,
      environmentConfiguration: true,
      comprehensiveErrorHandling: true
    },
    defaultSymbols,
    timestamp: new Date().toISOString()
  });
});

// GET /api/mc/config - Get current configuration
router.get('/config', async (req, res) => {
  res.json({
    success: true,
    indicesConfig: indicesProvider.getConfig(),
    stocksConfig: stocksProvider.getConfig(),
    defaultSymbols,
    timestamp: new Date().toISOString()
  });
});

export default router;
