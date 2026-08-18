# Redis Setup — Alyah Smart Attendance

Redis enables two production features:
- **Socket.IO multi-instance adapter** — events fan out across multiple backend pods
- **Missed-event replay** — clients that reconnect receive events they missed while offline

Without Redis the system runs in single-instance mode with no replay.
With Redis both features activate automatically on startup.

---

## Local Development

### Option A — Docker (recommended)

```bash
docker run -d \
  --name apf-redis \
  -p 6379:6379 \
  -v apf-redis-data:/data \
  redis:7-alpine \
  redis-server --appendonly yes --appendfsync everysec
```

Then add to `api/.env`:

```
REDIS_URL=redis://127.0.0.1:6379
```

### Option B — WSL 2 (Windows)

```bash
# Inside WSL terminal
sudo apt update && sudo apt install -y redis-server
sudo service redis-server start
redis-cli ping   # should return PONG
```

`REDIS_URL=redis://127.0.0.1:6379` works from Windows because WSL 2 bridges localhost.

### Option C — Windows native (Memurai)

Download Memurai (Redis-compatible for Windows):
https://www.memurai.com/get-memurai

After install it runs as a Windows service on port 6379 automatically.

---

## Verify Redis is Active

Start the backend and check the startup log:

```
✅ Socket.IO Redis adapter initialized
✅ [Socket] Redis event store connected
```

Or hit the health endpoint:

```bash
curl http://localhost:5000/api/health
```

Expected response:

```json
{
  "status": "ok",
  "database": "ok",
  "redis": "ok",
  "uptime": 42
}
```

If `redis` is `"not_configured"` → `REDIS_URL` is missing from `.env`.
If `redis` is `"error"` → Redis process is not running.

---

## Production (Managed Redis)

For cloud deployments use a managed Redis service and set `REDIS_URL` in your environment:

| Provider | Example URL |
|----------|-------------|
| Redis Cloud | `redis://:<password>@<host>:6379` |
| AWS ElastiCache | `redis://<host>:6379` |
| Upstash | `rediss://<user>:<password>@<host>:6379` (TLS) |
| Railway | set via Railway dashboard → auto-injected |

For TLS URLs (`rediss://`) ioredis handles TLS automatically.

---

## Missed-Event Replay — How It Works

1. Every emitted event is written to a Redis Stream keyed by `socket:event_log:<userId>`
2. Streams are capped at 500 events per user and expire after 1 hour
3. On reconnect the client emits `sync_missed_events` with its `lastEventTime`
4. The server reads the stream from that timestamp and replays any missed events
5. The client deduplicates replayed events via its `processedEvents` Set

---

## Load Test

With the backend running:

```bash
node load-test.js --users 100 --base http://localhost:5000
```

Expected output with Redis active:

```
✅ PASS — system stable under load
  AUTH     Success: 100/100 (100.0%)  p95: <200ms
  SOCKET   Connected: 100/100  ACK ok: 100
```
