import { Router } from 'express';
import { indicesProvider, stocksProvider } from '../providers/moneycontrol';

const router = Router();

// =============================================================================
// INDICES ROUTES
// =============================================================================

// GET /api/mc/indices/indian - Get Indian indices overview
router.get('/indices/indian', async (req, res) => {
  try {
    const result = await indicesProvider.getIndianIndices();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      source: 'moneycontrol-indices',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/indices/details - Get specific index details
router.get('/indices/details', async (req, res) => {
  try {
    const { indexId } = req.query;
    const result = await indicesProvider.getIndicesDetails(indexId as string);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
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
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      source: 'moneycontrol-indices',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/indices/list-basic - Get basic indices list
router.get('/indices/list-basic', async (req, res) => {
  try {
    const result = await indicesProvider.getIndicesListBasic();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      source: 'moneycontrol-indices',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/indices/advance-decline - Get exchange advance decline data
router.get('/indices/advance-decline', async (req, res) => {
  try {
    const { exchange } = req.query;
    const result = await indicesProvider.getExchangeAdvDec(exchange as string);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      source: 'moneycontrol-indices',
      timestamp: new Date().toISOString()
    });
  }
});

// =============================================================================
// STOCKS ROUTES
// =============================================================================

// GET /api/mc/stocks/price - Get stock price
router.get('/stocks/price', async (req, res) => {
  try {
    const { symbol } = req.query;
    const result = await stocksProvider.getStockPrice(symbol as string);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/price-volume - Get stock price and volume data
router.get('/stocks/price-volume', async (req, res) => {
  try {
    const { symbol, exchange, appVersion } = req.query;
    const result = await stocksProvider.getStockPriceVolume(
      symbol as string,
      exchange as string,
      appVersion as string
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/vwap - Get VWAP chart data
router.get('/stocks/vwap', async (req, res) => {
  try {
    const { symbol } = req.query;
    const result = await stocksProvider.getVWAPChart(symbol as string);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/financial-overview - Get financial overview
router.get('/stocks/financial-overview', async (req, res) => {
  try {
    const { symbol, exchange } = req.query;
    const result = await stocksProvider.getFinancialOverview(
      symbol as string,
      exchange as string
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/price-forecast - Get price forecast
router.get('/stocks/price-forecast', async (req, res) => {
  try {
    const { symbol, exchange, deviceType } = req.query;
    const result = await stocksProvider.getPriceForecast(
      symbol as string,
      exchange as string,
      deviceType as string
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/consensus - Get analyst consensus
router.get('/stocks/consensus', async (req, res) => {
  try {
    const { symbol, exchange, deviceType } = req.query;
    const result = await stocksProvider.getConsensus(
      symbol as string,
      exchange as string,
      deviceType as string
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/analyst-rating - Get analyst ratings
router.get('/stocks/analyst-rating', async (req, res) => {
  try {
    const { symbol, exchange, deviceType } = req.query;
    const result = await stocksProvider.getAnalystRating(
      symbol as string,
      exchange as string,
      deviceType as string
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/earning-forecast - Get earnings forecast
router.get('/stocks/earning-forecast', async (req, res) => {
  try {
    const { symbol, exchange, deviceType, frequency, financialType } = req.query;
    const result = await stocksProvider.getEarningForecast(
      symbol as string,
      exchange as string,
      deviceType as string,
      frequency as string,
      financialType as string
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/valuation - Get stock valuation
router.get('/stocks/valuation', async (req, res) => {
  try {
    const { symbol, exchange, deviceType, financialType } = req.query;
    const result = await stocksProvider.getValuation(
      symbol as string,
      exchange as string,
      deviceType as string,
      financialType as string
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/hits-misses - Get earnings hits and misses
router.get('/stocks/hits-misses', async (req, res) => {
  try {
    const { symbol, exchange, deviceType, type, financialType } = req.query;
    const result = await stocksProvider.getHitsMisses(
      symbol as string,
      exchange as string,
      deviceType as string,
      type as string,
      financialType as string
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/all-prices - Get all stock prices
router.get('/stocks/all-prices', async (req, res) => {
  try {
    const result = await stocksProvider.getAllStocksPrice();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/mc/stocks/all-price-volume - Get all stock price-volume data
router.get('/stocks/all-price-volume', async (req, res) => {
  try {
    const result = await stocksProvider.getAllStocksPriceVolume();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      source: 'moneycontrol-stocks',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;