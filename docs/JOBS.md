Jobs & Scheduling (Sprint 1)

- Feature flag: set `ENABLE_JOBS=true` to enable lightweight in-process jobs (placeholder). For production, replace with BullMQ + Redis.
- Env crons (used for reference/documentation):
  - `CRON_PRICES` (default: `0 */2 * * *`)
  - `CRON_NEWS` (default: `15 */2 * * *`)
  - `CRON_TRENDLYNE` (default: `30 */4 * * *`)
  - `CRON_RAG` (default: `0 */6 * * *`)

Endpoints
- `GET /api/health/queue` → { enabled }
- `GET /api/jobs/status` (TODO: add detailed stats if BullMQ integrated)

Notes
- The current scaffold marks lastRun timestamps via setInterval placeholders. Swap to BullMQ processors in `server/src/jobs` as a follow-up.

