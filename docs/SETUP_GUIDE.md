# Stock MCP Suite - Setup Guide

## 🚀 Quick Start

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 20.0 or higher
- **npm** 10.0 or higher
- **Git** (for cloning the repository)

### Optional API Keys

For full functionality, you'll need API keys for external services:

- **Alpha Vantage** - For stock price data
- **NewsAPI** - For news and sentiment analysis
- **OpenAI** - For RAG and AI features
- **Hugging Face** - Alternative AI provider

## 📦 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/stock-mcp-suite.git
cd stock-mcp-suite
```

### 2. Install Dependencies

Install root dependencies:
```bash
npm install
```

Install server dependencies:
```bash
cd server
npm install
cd ..
```

Install frontend dependencies:
```bash
cd frontend
npm install
cd ..
```

### 3. Environment Configuration

Create environment file:
```bash
cp server/.env.example server/.env
```

Edit the environment file with your API keys:
```bash
nano server/.env
```

#### Environment Variables

```env
# Server Configuration
PORT=4010
LOG_LEVEL=info

# External API Keys (Optional)
ALPHA_VANTAGE_KEY=your_alpha_vantage_key_here
NEWS_API_KEY=your_newsapi_key_here
OPENAI_API_KEY=your_openai_key_here
HUGGINGFACEHUB_API_KEY=your_huggingface_key_here

# Database Configuration
DB_PATH=./stock.db

# RAG Configuration
RAG_STORE=memory
RAG_DIR=./data/rag

# Provider Configuration
TICKER_YAHOO_KEY=symbol
TICKER_YAHOO_SUFFIX=.NS
TICKER_NEWS_KEY=name
TICKER_ALPHA_KEY=symbol
TICKER_MC_KEY=mcsymbol

# Prefetch Configuration
PREFETCH_BATCH=100
PREFETCH_INTERVAL_MS=600000
PREFETCH_NEWS_ENABLE=true
PREFETCH_MC_TECH_ENABLE=true

# Trendlyne Configuration (Optional)
TRENDLYNE_EMAIL=your_email@example.com
TRENDLYNE_PASSWORD=your_password
TL_COOKIE_CACHE_PATH=./tl-cookie.json

# Jobs Configuration (Optional)
ENABLE_JOBS=false
REDIS_URL=redis://localhost:6379
```

### 4. Start the Application

#### Option 1: Start All Services
```bash
npm run dev
```

#### Option 2: Start Services Individually

Start the server:
```bash
npm run dev:server
```

In a new terminal, start the frontend:
```bash
npm run dev:frontend
```

#### Option 3: Start with ML Service
```bash
npm run dev:ml
```

## 🔧 Configuration

### Server Configuration

The server runs on `http://localhost:4010` by default. You can change this by setting the `PORT` environment variable.

### Frontend Configuration

The frontend runs on `http://localhost:4200` by default. The Vite configuration can be modified in `frontend/vite.config.ts`.

### Database Configuration

The application uses SQLite by default. The database file is created at `server/stock.db`. For production, consider migrating to PostgreSQL.

## 📊 Usage

### 1. Access the Application

Open your browser and navigate to:
- **Frontend**: http://localhost:4200
- **API**: http://localhost:4010/api

### 2. Basic Workflow

1. **Search for a Stock**: Use the search bar to find stocks by symbol
2. **Ingest Data**: Click "Ingest" to fetch latest data for a stock
3. **View Analysis**: Check the various cards for insights, sentiment, and predictions
4. **Explore AI Features**: Use the AI tab for RAG-powered insights

### 3. Available Features

#### Market Overview
- Top Picks with rankings and changes
- Market suggestions based on performance
- Historical top picks data

#### Stock Insight
- Detailed stock analysis
- Price charts and technical indicators
- News sentiment analysis
- Moneycontrol insights

#### AI Features
- RAG-powered Q&A
- Natural language stock queries
- Document indexing and retrieval

#### Watchlist & Alerts
- Personal stock watchlist
- Price and sentiment alerts
- Portfolio tracking

## 🛠️ Development

### Project Structure

```
stock-mcp-suite/
├── server/                 # Backend Node.js application
│   ├── src/
│   │   ├── shared/        # Shared utilities and services
│   │   ├── routes/        # API endpoints
│   │   ├── providers/     # External data sources
│   │   ├── analytics/     # Analysis algorithms
│   │   └── rag/          # RAG functionality
│   └── package.json
├── frontend/              # Frontend Angular/Vite application
│   ├── src/
│   │   ├── shared/       # Shared components and utilities
│   │   ├── components/   # Feature components
│   │   └── styles/       # CSS and styling
│   └── package.json
├── ml-svc/               # Machine learning service
├── docs/                 # Documentation
└── scripts/              # Build and deployment scripts
```

### Available Scripts

#### Root Scripts
```bash
npm run dev              # Start all services
npm run dev:server       # Start server only
npm run dev:frontend     # Start frontend only
npm run dev:ml          # Start ML service
npm run dev:all         # Start all services with Redis
npm run build           # Build all services
npm run start:prod      # Start production build
```

#### Server Scripts
```bash
cd server
npm run dev             # Start development server
npm run build           # Build TypeScript
npm run start           # Start production server
npm run test:fixtures   # Run test fixtures
npm run rag:reindex     # Reindex RAG data
npm run rag:migrate     # Migrate RAG data
```

#### Frontend Scripts
```bash
cd frontend
npm run start           # Start development server
npm run dev             # Start with hot reload
npm run build           # Build for production
```

### Adding New Features

#### Frontend Components

1. Create component in `frontend/src/components/`
2. Use shared utilities from `frontend/src/shared/`
3. Follow the BaseCard pattern for consistency
4. Add proper TypeScript types

#### Backend Services

1. Create service in `server/src/shared/services/`
2. Extend BaseService for common functionality
3. Add validation using ValidationUtils
4. Use ResponseUtils for consistent API responses

#### API Endpoints

1. Create route in `server/src/routes/`
2. Use asyncHandler for error handling
3. Validate inputs with ValidationUtils
4. Return consistent responses with ResponseUtils

## 🐛 Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Kill process using port 4010
lsof -ti:4010 | xargs kill -9

# Or change port in .env
PORT=4011
```

#### Database Issues
```bash
# Reset database
rm server/stock.db
npm run dev:server
```

#### Frontend Build Issues
```bash
# Clear node_modules and reinstall
rm -rf frontend/node_modules
cd frontend
npm install
```

#### API Key Issues
- Verify API keys are correctly set in `.env`
- Check API key permissions and quotas
- Review server logs for specific error messages

### Logs and Debugging

#### Server Logs
```bash
# View server logs
tail -f server/server.out.log

# View error logs
tail -f server/server.err.log
```

#### Frontend Logs
Check browser console for frontend errors and warnings.

#### Debug Mode
Set `LOG_LEVEL=debug` in `.env` for verbose logging.

## 🚀 Production Deployment

### Environment Setup

1. **Set Production Environment Variables**
   ```env
   NODE_ENV=production
   PORT=4010
   LOG_LEVEL=warn
   ```

2. **Build Applications**
   ```bash
   # Build server
   cd server
   npm run build
   
   # Build frontend
   cd ../frontend
   npm run build
   ```

3. **Start Production Server**
   ```bash
   cd server
   npm start
   ```

### Docker Deployment

```dockerfile
# Dockerfile example
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 4010
CMD ["npm", "start"]
```

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:4010;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /api {
        proxy_pass http://localhost:4010;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 📚 Additional Resources

- [API Reference](API_REFERENCE.md)
- [Component Library](COMPONENT_LIBRARY.md)
- [Architecture Guide](architecture.md)
- [Improvements Summary](IMPROVEMENTS.md)

## 🤝 Support

If you encounter any issues:

1. Check the troubleshooting section above
2. Review the logs for error messages
3. Create an issue on GitHub with:
   - Error messages
   - Steps to reproduce
   - Environment details
   - Log files (if applicable)

## 📄 License

This project is licensed under the MIT License. See the LICENSE file for details.

---

*This setup guide provides comprehensive instructions for getting the Stock MCP Suite up and running. For additional help, refer to the other documentation files or create an issue on GitHub.*
