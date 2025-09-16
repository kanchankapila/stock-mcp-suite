# Stock MCP Suite - API Reference

## Overview

The Stock MCP Suite provides a comprehensive REST API for stock market analysis, sentiment analysis, and AI-powered insights. All API endpoints return JSON responses with a consistent format.

## Base URL

```
http://localhost:4010/api
```

## Response Format

All API responses follow this format:

```json
{
  "ok": boolean,
  "data": any,
  "error": string,
  "message": string,
  "meta": {
    "total": number,
    "page": number,
    "limit": number
  }
}
```

## Authentication

Currently, no authentication is required. All endpoints are publicly accessible.

## Rate Limiting

- **Default**: 100 requests per minute per IP
- **Burst**: 10 requests per second
- **Headers**: Rate limit information is included in response headers

## Error Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request - Invalid input |
| 404 | Not Found - Resource not found |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |
| 502 | Bad Gateway - External service error |

## Endpoints

### Stock Data

#### Get Stock Overview
```http
GET /api/stocks/:symbol/overview
```

**Parameters:**
- `symbol` (string, required): Stock symbol (e.g., "AAPL", "DABUR.NS")

**Response:**
```json
{
  "ok": true,
  "data": {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "lastClose": 175.43,
    "change": 2.15,
    "changePercent": 1.24,
    "volume": 45678900,
    "marketCap": 2800000000000
  }
}
```

#### Get Stock History
```http
GET /api/stocks/:symbol/history?days=30
```

**Parameters:**
- `symbol` (string, required): Stock symbol
- `days` (number, optional): Number of days (default: 30, max: 365)

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "date": "2024-01-15",
      "open": 173.50,
      "high": 176.20,
      "low": 172.80,
      "close": 175.43,
      "volume": 45678900,
      "adjustedClose": 175.43
    }
  ]
}
```

#### Ingest Stock Data
```http
POST /api/stocks/ingest/:symbol
```

**Parameters:**
- `symbol` (string, required): Stock symbol

**Request Body:**
```json
{
  "name": "Apple Inc."
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "message": "Ingested 30 price records; 15 news articles; Updated Moneycontrol insights; Indexed news for RAG",
    "data": {
      "prices": 30,
      "news": 15,
      "symbol": "AAPL"
    }
  }
}
```

### News and Sentiment

#### Get Stock News
```http
GET /api/stocks/:symbol/news?limit=10
```

**Parameters:**
- `symbol` (string, required): Stock symbol
- `limit` (number, optional): Number of articles (default: 10, max: 100)

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "news_123",
      "date": "2024-01-15T10:30:00Z",
      "title": "Apple Reports Strong Q4 Earnings",
      "summary": "Apple Inc. reported better-than-expected earnings...",
      "url": "https://example.com/news/apple-earnings",
      "sentiment": 0.75
    }
  ]
}
```

#### Get Sentiment Analysis
```http
GET /api/stocks/sentiment/:symbol
```

**Parameters:**
- `symbol` (string, required): Stock symbol

**Response:**
```json
{
  "ok": true,
  "data": {
    "symbol": "AAPL",
    "sentiment": 0.65,
    "confidence": 0.82,
    "sources": 15,
    "lastUpdated": "2024-01-15T10:30:00Z"
  }
}
```

### Analysis and Predictions

#### Get Stock Analysis
```http
GET /api/stocks/analysis/:symbol
```

**Parameters:**
- `symbol` (string, required): Stock symbol

**Response:**
```json
{
  "ok": true,
  "data": {
    "symbol": "AAPL",
    "sentiment": 0.65,
    "prediction": 180.25,
    "recommendation": "BUY",
    "score": 0.75,
    "confidence": 0.82,
    "factors": {
      "momentum": 0.15,
      "sentiment": 0.65,
      "technical": 0.80,
      "options": 0.00
    }
  }
}
```

#### Get Price Prediction
```http
GET /api/stocks/predict/:symbol
```

**Parameters:**
- `symbol` (string, required): Stock symbol

**Response:**
```json
{
  "ok": true,
  "data": {
    "symbol": "AAPL",
    "currentPrice": 175.43,
    "predictedPrice": 180.25,
    "confidence": 0.75,
    "timeframe": "1d",
    "factors": ["momentum", "sentiment", "technical"]
  }
}
```

### Options / Derivatives Metrics

Returns Put/Call ratios and computed bias (if available) for a symbol.
```http
GET /api/stocks/:symbol/options-metrics?days=60&limit=90
```
Response:
```json
{
  "ok": true,
  "data": {
    "latest": { "date": "2025-09-12", "pcr": 0.92, "pvr": 1.05, "bias": 0.18 },
    "history": [ { "date": "2025-09-01", "pcr": 0.88, "pvr": 1.10, "bias": 0.12 } ]
  }
}
```

### Portfolio

```http
GET /api/portfolio               # List holdings with PnL snapshot
POST /api/portfolio/add          # Body: { symbol, buyDate, buyPrice, quantity }
GET /api/portfolio/summary       # Aggregate invested/current/pnl
GET /api/portfolio/performance   # Time series cumulative invested vs current value
```
Response example (GET /api/portfolio):
```json
{
  "ok": true,
  "data": [
    {
      "id": 1,
      "symbol": "AAPL",
      "buy_date": "2025-09-01",
      "buy_price": 175.5,
      "quantity": 10,
      "currentPrice": 178.2,
      "invested": 1755,
      "currentValue": 1782,
      "pnl": 27,
      "pnlPct": 1.54
    }
  ]
}
```

### Watchlist
```http
GET /api/watchlist        # Symbols added
POST /api/watchlist/add   # Body: { symbol }
GET /api/defaultWatchlist # Predefined indices & sector representatives
```

### Alerts
```http
GET /api/alerts?limit=100
```
(Write endpoint TBD; current implementation lists stored alert triggers.)

### RSS News (Supplemental)
```http
GET /api/rss?limit=50
```

### Provider Data (Generic Capture)
```http
GET /api/provider-data/:symbol?provider=trendlyne&limit=20
```
Returns raw JSON payload snapshots ingested for flexible new providers.

### Indices & Sectors (Preview)
```http
GET /api/indices
GET /api/sectors
```
Lightweight placeholder aggregation; subject to change.

### Market Status
```http
GET /api/marketStatus
```
Response:
```json
{
  "ok": true,
  "data": {
    "istIso": "2025-09-14T07:05:12.345Z",
    "status": "CLOSED",
    "isOpen": false,
    "nextOpen": "2025-09-15T03:45:00.000Z",
    "nextClose": null
  }
}
```

### F&O (Alias) Metrics
```http
GET /api/fo/:symbol
```
Equivalent to options metrics convenience alias.

### Top Picks

#### Get Top Picks
```http
GET /api/top-picks?days=60&limit=10
```

**Parameters:**
- `days` (number, optional): Lookback period in days (default: 60)
- `limit` (number, optional): Number of picks (default: 10, max: 100)

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "symbol": "AAPL",
      "score": 0.85,
      "momentum": 0.15,
      "sentiment": 0.65,
      "mcScore": 78,
      "recommendation": "BUY",
      "contrib": {
        "momentum": 0.15,
        "sentiment": 0.65,
        "tech": 0.80,
        "options": 0.00
      }
    }
  ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 10
  }
}
```

#### Get Top Picks History
```http
GET /api/top-picks/history?days=7
```

**Parameters:**
- `days` (number, optional): History period in days (default: 7)

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "snapshot_date": "2024-01-15",
      "symbol": "AAPL",
      "score": 0.85,
      "rank": 1
    }
  ]
}
```

### RAG (Retrieval-Augmented Generation)

#### Index Documents
```http
POST /api/rag/index
```

**Request Body:**
```json
{
  "namespace": "AAPL",
  "urls": [
    "https://example.com/apple-news-1",
    "https://example.com/apple-news-2"
  ]
}
```

**Alternative with text:**
```json
{
  "namespace": "AAPL",
  "texts": [
    {
      "text": "Apple Inc. reported strong quarterly earnings...",
      "metadata": {
        "source": "manual",
        "date": "2024-01-15"
      }
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "added": 15,
    "namespace": "AAPL"
  }
}
```

#### Query RAG
```http
POST /api/rag/query
```

**Request Body:**
```json
{
  "namespace": "AAPL",
  "query": "What are Apple's latest earnings?",
  "k": 5,
  "withAnswer": true
}
```

**Parameters:**
- `namespace` (string, required): Document namespace
- `query` (string, required): Search query
- `k` (number, optional): Number of results (default: 5)
- `withAnswer` (boolean, optional): Generate AI answer (default: false)

**Response:**
```json
{
  "ok": true,
  "data": {
    "answer": "Based on the latest reports, Apple Inc. reported strong quarterly earnings...",
    "sources": [
      {
        "text": "Apple Inc. reported strong quarterly earnings...",
        "metadata": {
          "source": "news",
          "date": "2024-01-15",
          "url": "https://example.com/news"
        }
      }
    ]
  }
}
```

### Agent

#### Ask Agent
```http
POST /api/agent/ask
```

**Request Body:**
```json
{
  "prompt": "What's the sentiment for AAPL?",
  "symbol": "AAPL"
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "answer": "Based on recent news analysis, AAPL has a positive sentiment of 0.65...",
    "intents": {
      "wantSentiment": true,
      "wantPrediction": false,
      "wantBacktest": false
    },
    "sources": ["news", "analysis"]
  }
}
```

### Health and Status

#### Health Check
```http
GET /api/health
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00Z",
    "version": "1.0.0",
    "uptime": 3600
  }
}
```

#### Provider Health
```http
GET /api/health/providers
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "yahoo": {
      "status": "healthy",
      "lastCheck": "2024-01-15T10:30:00Z",
      "responseTime": 150
    },
    "newsapi": {
      "status": "healthy",
      "lastCheck": "2024-01-15T10:30:00Z",
      "responseTime": 200
    }
  }
}
```

### External Data

#### Resolve Ticker
```http
GET /api/resolve/:input
```

**Parameters:**
- `input` (string, required): Stock symbol, name, or identifier

**Response:**
```json
{
  "ok": true,
  "data": {
    "input": "DABUR",
    "entry": {
      "name": "Dabur India",
      "symbol": "DABUR",
      "mcsymbol": "DI",
      "isin": "INE016A01026",
      "tlid": "303"
    },
    "providers": ["alpha", "mc", "news", "trendlyne", "yahoo"],
    "resolved": {
      "alpha": "DABUR",
      "mc": "DI",
      "news": "DABUR INDIA",
      "trendlyne": "303",
      "yahoo": "DABUR.NS"
    }
  }
}
```

#### Get Provider Mappings
```http
GET /api/resolve/providers
```

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "provider": "alpha",
      "key": "symbol",
      "suffix": ""
    },
    {
      "provider": "yahoo",
      "key": "symbol",
      "suffix": ".NS"
    }
  ]
}
```

## Error Responses

### Validation Error
```json
{
  "ok": false,
  "error": "Validation failed for symbol",
  "message": "Symbol must be 1-10 characters long and contain only letters, numbers, and dots"
}
```

### Not Found Error
```json
{
  "ok": false,
  "error": "Stock not found",
  "message": "The requested stock symbol could not be found"
}
```

### Rate Limit Error
```json
{
  "ok": false,
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please try again later."
}
```

### Internal Server Error
```json
{
  "ok": false,
  "error": "Internal server error",
  "message": "An unexpected error occurred. Please try again later."
}
```

## SDK Examples

### JavaScript/TypeScript

```typescript
class StockAPI {
  private baseUrl: string;
  
  constructor(baseUrl = 'http://localhost:4010/api') {
    this.baseUrl = baseUrl;
  }
  
  async getOverview(symbol: string) {
    const response = await fetch(`${this.baseUrl}/stocks/overview/${symbol}`);
    return response.json();
  }
  
  async ingestData(symbol: string, name?: string) {
    const response = await fetch(`${this.baseUrl}/stocks/ingest/${symbol}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    return response.json();
  }
}

// Usage
const api = new StockAPI();
const overview = await api.getOverview('AAPL');
```

### Python

```python
import requests
import json

class StockAPI:
    def __init__(self, base_url='http://localhost:4010/api'):
        self.base_url = base_url
    
    def get_overview(self, symbol):
        response = requests.get(f'{self.base_url}/stocks/overview/{symbol}')
        return response.json()
    
    def ingest_data(self, symbol, name=None):
        data = {'name': name} if name else {}
        response = requests.post(
            f'{self.base_url}/stocks/ingest/{symbol}',
            json=data
        )
        return response.json()

# Usage
api = StockAPI()
overview = api.get_overview('AAPL')
```

### cURL Examples

```bash
# Get stock overview
curl -X GET "http://localhost:4010/api/stocks/overview/AAPL"

# Ingest stock data
curl -X POST "http://localhost:4010/api/stocks/ingest/AAPL" \
  -H "Content-Type: application/json" \
  -d '{"name": "Apple Inc."}'

# Query RAG
curl -X POST "http://localhost:4010/api/rag/query" \
  -H "Content-Type: application/json" \
  -d '{
    "namespace": "AAPL",
    "query": "What are Apple'\''s latest earnings?",
    "withAnswer": true
  }'
```

## Rate Limiting

The API implements rate limiting to ensure fair usage:

- **Default Limit**: 100 requests per minute per IP
- **Burst Limit**: 10 requests per second
- **Headers**: Rate limit information is included in response headers:
  - `X-RateLimit-Limit`: Request limit per window
  - `X-RateLimit-Remaining`: Remaining requests in current window
  - `X-RateLimit-Reset`: Time when the rate limit resets

## WebSocket Support

For real-time data, WebSocket connections are available at:

```
ws://localhost:4010/ws
```

### WebSocket Messages

**Subscribe to stock updates:**
```json
{
  "type": "subscribe",
  "symbol": "AAPL"
}
```

**Unsubscribe from stock updates:**
```json
{
  "type": "unsubscribe",
  "symbol": "AAPL"
}
```

**Received quote update:**
```json
{
  "type": "quote",
  "symbol": "AAPL",
  "price": 175.43,
  "time": "2024-01-15T10:30:00Z"
}
```

---

*This API reference provides comprehensive documentation for all available endpoints. For additional help or examples, refer to the setup guide or create an issue on GitHub.*

### Deprecations / Removed
- Yahoo ingestion & WebSocket quote streaming endpoints removed (legacy Yahoo provider retired).
- Any previously documented `/api/stocks/yahoo/*` routes should be considered deprecated.
