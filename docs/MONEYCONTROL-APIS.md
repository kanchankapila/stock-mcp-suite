# MoneyControl API Integration Guide

This document outlines all the MoneyControl API endpoints that should be integrated into the stock MCP suite for comprehensive Indian stock market data.

## 🎯 **API Categories**

### 1. **Indices APIs**

#### Base URLs:
- `https://api.moneycontrol.com/mcapi/v1/indices/`

#### Endpoints:
```
GET /get-indian-indices
GET /get-indices-details?indexId={id}
GET /get-indices-list?appVersion=136
GET /chart/exchange-advdec?ex=N
```

#### Implementation Priority: **HIGH**
- Essential for market overview and sentiment analysis
- Provides real-time index values and changes
- Advance/decline data for market breadth analysis

---

### 2. **Stock Data APIs**

#### Base URLs:
- `https://priceapi.moneycontrol.com/pricefeed/nse/equitycash/`
- `https://api.moneycontrol.com/mcapi/v1/stock/`
- `https://www.moneycontrol.com/stocks/company_info/`

#### Endpoints:
```
GET /pricefeed/nse/equitycash/{mcsymbol}
GET /price-volume?scId={symbol}&ex=&appVersion=175
GET /get_vwap_chart_data.php?classic=true&sc_did={symbol}
GET /financial-historical/overview?scId={symbol}&ex=N
GET /estimates/price-forecast?scId={symbol}&ex=N&deviceType=W
GET /estimates/consensus?scId={symbol}&ex=N&deviceType=W
GET /estimates/analyst-rating?deviceType=W&scId={symbol}&ex=N
GET /estimates/earning-forecast?scId={symbol}&ex=N&deviceType=W&frequency=12&financialType=C
GET /estimates/valuation?deviceType=W&scId={symbol}&ex=N&financialType=C
GET /estimates/hits-misses?deviceType=W&scId={symbol}&ex=N&type=eps&financialType=C
```

#### Implementation Priority: **HIGH**
- Core stock data for analysis
- Price forecasts and analyst ratings
- Financial metrics and valuations

---

### 3. **Futures & Options APIs**

#### Base URL:
- `https://api.moneycontrol.com/mcapi/v1/fno/`

#### Endpoints:
```
GET /futures/getFuturesData?fut=FUTSTK&id={symbol}&expirydate=2025-10-28
GET /options/getOptionsData?opt=OPTSTK&id={symbol}&expirydate=2025-09-30&optiontype=CE&strikeprice=405.00
GET /options/getStrikePrice?id={symbol}&expirydate=2025-09-30&optiontype=CE
GET /futures/getExpDts?id={symbol}
```

#### Implementation Priority: **MEDIUM**
- Essential for options analysis and PCR calculations
- Futures data for momentum analysis
- Strike price and expiry data

---

### 4. **Technical Analysis APIs**

#### Base URLs:
- `https://www.moneycontrol.com/mc/widget/pricechart_technicals/`
- `https://api.moneycontrol.com/mcapi/v1/technical-trends/`
- `https://api.moneycontrol.com/mcapi/technicals/v2/`

#### Endpoints:
```
GET /technical_rating_summary?sc_did={symbol}&page=mc_technicals&period=D&classic=true
GET /moving_average?sc_did={symbol}&page=mc_technicals&period=D&classic=true
GET /technical_indicator?sc_did={symbol}&page=mc_technicals&period=D&classic=true
GET /moving_average_crossovers?sc_did={symbol}&page=mc_technicals&period=D&classic=true
GET /pivot_level?sc_did={symbol}&page=mc_technicals&classic=true&period=W
GET /uptrend/bullish?ex=N&index=7&page=1&order=desc&deviceType=W&sort=performance&appVersion=142
GET /uptrend/turning-bullish?ex=N&index=7&page=1&order=desc&deviceType=W&sort=changeDate&appVersion=142
GET /downtrend/bearish?ex=N&index=7&page=1&order=asc&deviceType=W&sort=performance&appVersion=142
GET /downtrend/turning-bearish?ex=N&index=7&page=1&order=desc&deviceType=W&sort=changeDate&appVersion=142
GET /details?scId={symbol}&dur=D&deviceType=W
```

#### Implementation Priority: **HIGH**
- Critical for technical analysis and signals
- Moving averages, RSI, MACD indicators
- Bullish/bearish trend identification
- Pivot levels for support/resistance

---

### 5. **Widgets & Ratings APIs**

#### Base URL:
- `https://www.moneycontrol.com/mc/widget/historicalrating/`

#### Endpoints:
```
GET /ratingPro?classic=true&type=gson&sc_did={symbol}&period=D&dur=6m
GET /ratingPro?classic=true&type=gson&sc_did={symbol}&period=W&dur=6m
```

#### Implementation Priority: **MEDIUM**
- Historical rating trends
- Professional analysis ratings

---

### 6. **Earnings APIs**

#### Base URL:
- `https://api.moneycontrol.com/mcapi/v1/earnings/`

#### Endpoints:
```
GET /inc-widget?indexId=all
GET /price-shockers?limit=8&page=1
GET /actual-estimate?page=1&limit=6
GET /rapid-results?limit=9&page=1&type=LR&subType=yoy
GET /get-earnings-data?indexId=All&page=1&startDate=2025-09-16&endDate=2025-09-16&sector=&limit=18
GET /result-calendar?indexId=All&fromDate=2025-09-16&toDate=2025-09-21&sector=
GET /result-dashboard
GET /rapid-results?limit=21&page=1&type=BP&subType=yoy&category=all&sortBy=growth&indexId=N&sector=&search=&seq=desc
```

#### Implementation Priority: **HIGH**
- Earnings calendar and results
- Price shockers after earnings
- Actual vs estimate comparisons

---

### 7. **Forecasts & Insights APIs**

#### Base URL:
- `https://api.moneycontrol.com/mcapi/extdata/v2/`

#### Endpoints:
```
GET /mc-insights?scId={symbol}&type=c&deviceType=W&appVersion=185
GET /mc-essentials?scId={symbol}&type=ed&deviceType=W
```

#### Implementation Priority: **HIGH**
- MoneyControl's proprietary insights
- Essential stock recommendations
- Target prices and ratings

---

### 8. **Deals APIs**

#### Base URL:
- `https://api.moneycontrol.com/mcapi/v1/deals/`

#### Endpoints:
```
GET /insight?start=0&limit=3&value=value&range=1W&action=buy
GET /insight?start=0&limit=9&value=value&range=1W&action=buy&dealsType=topDeal
GET /insight?start=0&limit=9&value=value&range=1W&action=buy&dealsType=topInsider
GET /insight?start=0&limit=9&value=value&range=1W&action=buy&dealsType=topInvestor
GET /list?start=0&limit=24&orderBy=deal_date&sortBy=DESC&deviceType=W
GET /largedeals-insight?start=0&limit=3&orderBy=dealsValue&deviceType=W
GET /list?start=0&limit=24&orderBy=deal_date&sortBy=DESC&dealType=large&deviceType=W&apiVersion=177
GET /list?start=0&limit=24&orderBy=dealsValue&sortBy=DESC&dealType=topStock&deviceType=W&apiVersion=177
GET /list?start=0&limit=24&orderBy=dealsValue&sortBy=DESC&dealType=topStockSectorWise&deviceType=W&apiVersion=177
```

#### Implementation Priority: **MEDIUM**
- Institutional deals and insider trading
- Large deals analysis
- Investment pattern insights

---

### 9. **News APIs**

#### Base URLs:
- `https://api.moneycontrol.com/mcapi/v1/deals/`
- `https://www.moneycontrol.com/newsapi/`

#### Endpoints:
```
GET /get-stock-news
GET /mc_news.php?query=tags_slug:("results" "result-poll" "brokerage-results-estimates" "result-analysis")&start=0&limit=8&sortby=creation_date&sortorder=desc
```

#### Implementation Priority: **MEDIUM**
- Stock-specific news
- Results and analysis news

---

### 10. **Premarket & Activity APIs**

#### Base URL:
- `https://api.moneycontrol.com/mcapi/v1/premarket/`

#### Endpoints:
```
GET /getBrokerResearchReco?sublevel=stocks&start=0&limit=6
GET /getFllActivityData?type=cash
```

#### Implementation Priority: **HIGH**
- FII/DII activity data
- Broker research recommendations
- Premarket sentiment indicators

---

## 🔧 **Implementation Strategy**

### Phase 1: Core Data (Week 1)
1. **Indices APIs** - Market overview
2. **Stock Data APIs** - Basic price and volume
3. **Technical Analysis APIs** - Key indicators
4. **Insights APIs** - MoneyControl recommendations

### Phase 2: Advanced Analysis (Week 2)
1. **Earnings APIs** - Results and forecasts
2. **Premarket APIs** - FII/DII activity
3. **Options APIs** - F&O data

### Phase 3: Additional Features (Week 3)
1. **Deals APIs** - Institutional activity
2. **News APIs** - Sentiment analysis
3. **Widgets APIs** - Historical ratings

---

## 📋 **Provider Structure**

### Recommended File Organization:
```
server/src/providers/
├── moneycontrol/
│   ├── mc-indices.ts       # Indices and market data
│   ├── mc-stocks.ts        # Stock price and fundamentals
│   ├── mc-technical.ts     # Technical analysis
│   ├── mc-options.ts       # Futures & Options
│   ├── mc-earnings.ts      # Earnings and results
│   ├── mc-insights.ts      # Forecasts and recommendations
│   ├── mc-deals.ts         # Institutional deals
│   ├── mc-news.ts          # News and sentiment
│   ├── mc-premarket.ts     # Premarket and FII activity
│   └── mc-client.ts        # Base client with auth
```

---

## 🔐 **Authentication & Headers**

### Required Headers:
```javascript
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
};
```

### Rate Limiting:
- Implement exponential backoff
- Respect HTTP 429 responses
- Cache responses for 30-60 seconds where appropriate

---

## 🎯 **Integration Points**

### Database Integration:
- Store indices data in `indices` table
- Store stock insights in `news` table with source='moneycontrol'
- Store technical ratings in `features` table
- Store earnings data in dedicated `earnings` table

### API Endpoints:
- `GET /api/mc/indices` - All Indian indices
- `GET /api/mc/stock/{symbol}/insights` - Stock insights
- `GET /api/mc/stock/{symbol}/technical` - Technical analysis
- `GET /api/mc/earnings/calendar` - Earnings calendar
- `GET /api/mc/market/overview` - Complete market overview

### Visual Dashboard Integration:
- **Indices Heatmap** - Real-time index performance
- **Sector Performance** - Sectoral indices visualization
- **Earnings Calendar** - Upcoming results timeline
- **FII/DII Activity** - Institutional flow charts
- **Technical Signals** - Bullish/bearish trend indicators

---

## 🚀 **Expected Benefits**

1. **Comprehensive Indian Market Data** - Complete coverage of NSE/BSE
2. **Real-time Analysis** - Live technical and fundamental signals
3. **Institutional Insights** - FII/DII activity and large deals
4. **Earnings Intelligence** - Results calendar and forecasts
5. **Professional Recommendations** - MoneyControl's proprietary insights

---

**Ready to implement comprehensive MoneyControl integration! 📊🇮🇳**
