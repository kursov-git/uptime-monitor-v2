# Uptime Monitor

Self-hosted uptime monitoring service with a modern dashboard.

## Features

- **Monitor HTTP endpoints** with configurable intervals and timeouts
- **Status validation** — expected status code and response body (regex/substring)
- **Advanced Authentication** — Basic auth, JSON Form Login, and `CSRF_FORM_LOGIN` support
- **Custom headers** for authenticated endpoints
- **Pause/Resume** individual monitors
- **Notifications** via Telegram and Zulip with flapping protection
- **Advanced Flapping Diagnostics** in the UI with detailed state tooltips
- **Per-monitor notification overrides**
- **User management** with Admin/Viewer roles
- **API key authentication** for read-only access
- **Audit logging** of all administrative actions
- **Automatic data retention** cleanup
- **Batched agent result ingestion** with idempotency handling
- **Dark theme UI** with responsive design
- **Docker deployment** ready

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js + Fastify + TypeScript |
| Database | SQLite via Prisma ORM |
| Frontend | React 18 + Vite |
| Deployment | Docker + Docker Compose + Nginx |

## Quick Start

### Local Development

```bash
# Server
cd server
npm install
npx prisma migrate dev
node prisma/seed.js
npm run dev

# Client (separate terminal)
cd client
npm install
npm run dev
```

Server runs on `http://localhost:3000`, client on `http://localhost:5173`.

### Split Server Runtime

The backend can now run as separate processes:

```bash
cd server
npm run dev:api
npm run dev:worker
npm run dev:retention
npm run dev:agent-offline-monitor
```

Production role selection is controlled with `SERVER_ROLE`:

- `all` — API + worker + retention + agent offline monitor
- `api`
- `worker`
- `retention`
- `agent-offline-monitor`

Logging defaults:

- development: `LOG_FORMAT=pretty`
- production: `LOG_FORMAT=json`
- override level with `LOG_LEVEL=info|warn|error|debug|trace`

### Docker (Local)

```bash
cp .env.example .env
# Set JWT_SECRET and ADMIN_PASSWORD in .env
docker compose up -d --build
```

Application will be available at `http://localhost`.

### Backups and Ops

SQLite compose backup:

```bash
./scripts/backup-db.sh
COMPOSE_FILE=docker-compose.split.yml DB_SERVICE=server ./scripts/backup-db.sh
```

Restore:

```bash
./scripts/restore-db.sh /data/backups/uptime-YYYYMMDDTHHMMSSZ.db
```

Runtime diagnostics:

```bash
./scripts/runtime-status.sh
COMPOSE_FILE=docker-compose.split.yml ./scripts/runtime-status.sh
```

Operational reference:
- [docs/OPERATIONS_RUNBOOK.md](/home/skris/uptime-monitor-v2/docs/OPERATIONS_RUNBOOK.md)

### Production Deployment (VPS)

Requires one-time SSH key setup:

```bash
# Generate key and copy to server
ssh-keygen -t ed25519 -f ~/.ssh/onedashmsk_admin
ssh-copy-id -i ~/.ssh/onedashmsk_admin root@YOUR_SERVER_IP

# Add to ~/.ssh/config:
# Host uptime
#     HostName YOUR_SERVER_IP
#     User root
#     IdentityFile ~/.ssh/onedashmsk_admin
```

Then deploy with one command:

```bash
bash deploy.sh
```

The `.env` file on the server is preserved across deploys. Set `ADMIN_PASSWORD` on the server before the first deploy.

## CI (GitHub Actions)

Workflow: `.github/workflows/ci.yml`

- Triggers: `push`, `pull_request`, manual `workflow_dispatch`
- Server job:
  - `npm --prefix server run test:integration`
  - `npm --prefix server run build`
- Client job:
  - `npm --prefix client test`
  - `npm --prefix client run lint`
  - `npm --prefix client run build`
- E2E job:
  - `CI=1 npm --prefix e2e run test` (Chromium only in CI)
- Security/operational defaults:
  - minimal token permissions (`contents: read`, `actions: write`)
  - concurrency cancel for stale runs
  - `timeout-minutes: 20` on each job

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | — | Login |
| GET | `/api/auth/me` | JWT | Current user |
| GET | `/api/monitors` | JWT/Key | List monitors |
| GET | `/api/monitors/:id` | JWT/Key | Monitor details |
| GET | `/api/monitors/:id/stats` | JWT/Key | Check history |
| POST | `/api/monitors` | Admin | Create monitor |
| PUT | `/api/monitors/:id` | Admin | Update monitor |
| PATCH | `/api/monitors/:id/toggle` | Admin | Pause/Resume |
| DELETE | `/api/monitors/:id` | Admin | Delete monitor |
| GET | `/api/users` | Admin | List users |
| POST | `/api/users` | Admin | Create user |
| DELETE | `/api/users/:id` | Admin | Delete user |
| PATCH | `/api/users/:id/password` | Admin | Change password |
| GET | `/api/apikeys/me` | JWT | Get API key |
| POST | `/api/apikeys/generate` | JWT | Generate key |
| DELETE | `/api/apikeys/revoke` | JWT | Revoke key |
| GET | `/api/audit` | Admin | Audit log |
| GET | `/api/notifications/settings` | Admin | Get settings |
| PUT | `/api/notifications/settings` | Admin | Update settings |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes (production) | auto | JWT signing secret |
| `ADMIN_PASSWORD` | No | random | Initial admin password |
| `DATABASE_URL` | Yes | — | SQLite/Postgres connection string |
| `CORS_ORIGINS` | No | `http://localhost:5173` | Allowed origins |
| `PORT` | No | `3000` | Server port |
| `HOST` | No | `0.0.0.0` | Server host |
| `ENCRYPTION_KEY` | Yes (production) | — | 64-char hex key for AES-256-GCM secret storage |
| `LOG_LEVEL` | No | `info` | Pino log level |
| `LOG_FORMAT` | No | `pretty` in dev, `json` in prod | Log output mode |
| `SERVER_ROLE` | No | `all` | Backend runtime role |
