ML Service (Sprint 2)

This repository includes a scaffolded FastAPI microservice under `ml-svc/` with stub endpoints:

- `GET /features?symbol=XYZ&days=60` → computed features (stub)
- `POST /predict/{symbol}` → baseline prediction with confidence (stub)
- `POST /backtest` → run a backtest (stub)
- `GET /backtest/{id}` → fetch backtest results (stub)
- `GET /models` and `GET /models/{id}` → model registry (stub)

Run locally
```
cd ml-svc
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 5001
```

Server Integration
- Set `ENABLE_ML=true` and `ML_BASE_URL=http://localhost:5001` to enable server proxy routes.
- New server endpoints:
  - `GET /api/features/:symbol?days=N`
  - `POST /api/predict/:symbol`
  - `POST /api/backtest/run`, `GET /api/backtest/:id`
  - `GET /api/models`, `GET /api/models/:id`

Next Steps
- Implement real feature engineering, baseline models (persistence/SMA), walk-forward validation, and backtesting.

