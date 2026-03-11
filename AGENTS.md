# AGENTS.md — Uptime Monitor

> This file is for AI coding agents (Cursor, Copilot, Windsurf, Antigravity, ChatGPT, etc.).
> It describes the project architecture, conventions, and strict rules to follow.

---

## Project Overview

**Uptime Monitor** — self-hosted service for monitoring HTTP/HTTPS endpoint availability.
Checks status codes, response bodies (regex/substring), supports multi-step authentication, and sends notifications via Telegram/Zulip with flapping protection.

**Current version:** v1.2

---

## Tech Stack

| Layer        | Technology                                        |
|--------------|---------------------------------------------------|
| Backend      | Node.js (v20+), **Fastify** (NOT Express!), TypeScript, Pino logger |
| Database     | **SQLite** via **Prisma ORM**                     |
| Frontend     | React 18, Vite, TypeScript, Recharts, Lucide React |
| Testing      | Vitest (unit), Playwright (E2E)                   |
| Deployment   | Docker + Docker Compose, Nginx reverse proxy      |
| Monorepo     | npm workspaces (`client`, `server`, `e2e`, `packages/*`) |

---

## Project Structure

```
/
├── client/                    # React frontend (Vite)
│   ├── src/
│   │   ├── App.tsx            # Main app with routing
│   │   ├── api.ts             # Singleton Axios client
│   │   ├── components/        # Reusable UI components
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── MonitorCard.tsx
│   │   │   ├── MonitorForm.tsx
│   │   │   └── TimeRangeFilter.tsx
│   │   ├── contexts/          # React contexts (AuthContext)
│   │   └── pages/             # Route pages
│   │       ├── LoginPage.tsx
│   │       ├── MonitorHistory.tsx
│   │       ├── NotificationSettings.tsx
│   │       ├── NotificationHistoryPage.tsx
│   │       ├── AuditLogPage.tsx
│   │       └── UsersPage.tsx
│   ├── nginx.conf             # Production Nginx config
│   └── Dockerfile
│
├── server/                    # Fastify backend
│   ├── src/
│   │   ├── index.ts           # Runtime entry point; starts API or background role based on SERVER_ROLE
│   │   ├── worker.ts          # CheckWorker — scheduler-based monitor execution
│   │   ├── lib/
│   │   │   ├── prisma.ts      # Singleton PrismaClient
│   │   │   ├── auth.ts        # JWT/API key auth middleware
│   │   │   ├── crypto.ts      # AES-256-GCM encryption for secrets
│   │   │   ├── env.ts         # Centralized server env parsing/validation
│   │   │   ├── logger.ts      # Shared Pino/Fastify logger config
│   │   │   ├── serverRoles.ts # Allowed runtime roles: api/worker/retention/agent-offline-monitor/all
│   │   │   └── validation.ts  # Shared validation logic (unit tested)
│   │   ├── routes/
│   │   │   ├── auth.ts        # /api/auth/*
│   │   │   ├── monitors.ts    # /api/monitors/* — CRUD, toggle, stats, SSE
│   │   │   ├── users.ts       # /api/users/*
│   │   │   ├── apikeys.ts     # /api/apikeys/*
│   │   │   ├── audit.ts       # /api/audit
│   │   │   └── notifications.ts # /api/notifications/*
│   │   └── services/
│   │       ├── flapping.ts       # FlappingService — core anti-oscillation logic
│   │       ├── agentResults.ts   # Batched agent result persistence with duplicate handling
│   │       ├── retentionService.ts # Auto-cleanup of old CheckResults
│   │       ├── sse.ts            # Server-Sent Events for real-time dashboard
│   │       ├── telegram.ts       # Telegram notifications
│   │       ├── zulip.ts          # Zulip notifications
│   │       └── auditService.ts   # Audit log helper
│   ├── prisma/
│   │   ├── schema.prisma      # Database schema (READ THIS FIRST!)
│   │   ├── seed.js            # Production seed (plain JS, no tsx)
│   │   └── migrations/
│   ├── Dockerfile
│   └── vitest.config.ts
│
├── packages/
│   └── shared/                # @uptime-monitor/shared — shared TypeScript types
│       └── src/index.ts
│
├── e2e/                       # Playwright E2E tests
│   ├── tests/
│   └── playwright.config.ts
│
├── docker-compose.yml
├── .github/workflows/ci.yml    # GitHub Actions CI (server/client checks)
├── deploy.sh                  # One-command SSH deployment script
├── harden.sh                  # Server hardening script
├── .env.example
├── CODE_REVIEW.md             # Technical audit & scorecard
├── docs/OPERATIONS_RUNBOOK.md # Backup/restore, health checks, split runtime ops
└── ROADMAP.md                 # Product roadmap & backlog
```

---

## Essential Commands

### Development

```bash
# Backend dev server (hot reload)
cd server && npm run dev

# Backend API only
cd server && npm run dev:api

# Background roles
cd server && npm run dev:worker
cd server && npm run dev:retention
cd server && npm run dev:agent-offline-monitor

# Frontend dev server
cd client && npm run dev
```

Server: `http://localhost:3000` | Client: `http://localhost:5173`

### Testing

```bash
# Backend unit tests
cd server && npm test

# Backend tests with coverage
cd server && npm run test:integration

# Frontend unit tests
cd client && npm test

# E2E tests (Playwright)
cd e2e && npx playwright test

# CI parity (same core checks as GitHub Actions)
npm --prefix server run test:integration
npm --prefix server run build
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
CI=1 npm --prefix e2e run test
```

### CI (GitHub Actions)

- Workflow file: `.github/workflows/ci.yml`
- Triggers: `push`, `pull_request`, `workflow_dispatch`
- Jobs:
  - `server`: `npm --prefix server run test:integration` + `npm --prefix server run build`
  - `client`: `npm --prefix client test` + `npm --prefix client run lint` + `npm --prefix client run build`
  - `e2e`: `npm --prefix e2e run test` on Chromium in CI mode
- Safety defaults:
  - minimal token permissions (`contents: read`, `actions: write` for artifact upload)
  - `concurrency` with `cancel-in-progress: true`
  - `timeout-minutes: 20` per job

### Runtime Roles

- Default mode is `all`: API + builtin worker + retention + agent offline monitor in one process.
- `SERVER_ROLE=api`: only Fastify API server listens on `HOST`/`PORT`.
- `SERVER_ROLE=worker`: only the builtin monitor scheduler runs.
- `SERVER_ROLE=retention`: only retention cleanup loop runs.
- `SERVER_ROLE=agent-offline-monitor`: only agent offline reconciliation loop runs.
- For production split-process deployment, prefer separate services over `all`.

### Logging

- Development defaults to `LOG_FORMAT=pretty`.
- Production defaults to `LOG_FORMAT=json`.
- `LOG_LEVEL` defaults to `info` (`warn` in tests).
- Server code should use the shared Pino logger from `server/src/lib/logger.ts`; do not add new `console.*` calls.

### Database

```bash
cd server
npx prisma migrate dev       # Apply migrations
npx prisma db push           # Push schema without migration
npx prisma studio            # Visual DB explorer
node prisma/seed.js           # Seed initial data
```

### Build & Deploy

```bash
# Local Docker
docker compose up -d --build

# Production (VPS via SSH keys)
bash deploy.sh
```

### Backups and Diagnostics

```bash
./scripts/backup-db.sh
./scripts/restore-db.sh /data/backups/uptime-YYYYMMDDTHHMMSSZ.db
./scripts/runtime-status.sh
```

---

## Strict Rules for AI Agents

### 🔴 NEVER DO

1. **NEVER use `Enum` in Prisma schema** — SQLite does not support enums. Use `String` type with comments indicating valid values (e.g., `// "NONE", "BASIC", "FORM_LOGIN"`).
2. **NEVER use Express patterns** — the backend is Fastify. Use `request`/`reply` (not `req`/`res`), use `fastify.register()` for plugins, and `fastify.inject()` for testing.
3. **NEVER add interactive steps** (password prompts, confirmations) to `deploy.sh` — deployment is fully automated over SSH keys.
4. **NEVER create multiple PrismaClient instances** — import the singleton from `server/src/lib/prisma.ts`.
5. **NEVER use `seed.ts` in production Docker** — `tsx` is not available in the prod image. Use `seed.js` (plain JS).
6. **NEVER store secrets in plaintext in the DB** — use `lib/crypto.ts` (AES-256-GCM) for bot tokens, API keys, etc.

### 🟡 ASK FIRST

1. Before modifying `schema.prisma` — changing the DB schema affects migrations and may require data migration.
2. Before modifying `docker-compose.yml` or `Dockerfile` — changes affect production deployment.
3. Before modifying `FlappingService` — this is the core anti-oscillation algorithm with specific business logic.
4. Before adding new npm dependencies — check if existing packages cover the need.

### 🟢 ALWAYS DO

1. **Use TypeScript strict mode** — both `server/` and `client/` have strict TS configs.
2. **Run tests after changes** — `cd server && npm test` and `cd client && npm test`.
3. **Use existing patterns** — follow the route/service/lib structure already established.
4. **Import shared types** from `@uptime-monitor/shared` (not relative paths).
5. **Use Pino logger** (not `console.log`) in server code for structured logging.
6. **Update `CODE_REVIEW.md`** and **`ROADMAP.md`** when making significant changes.
7. **Keep the Fastify `.inject()` pattern** for integration tests — don't spin up a real server.
8. **If CI-related code is changed**, run CI parity commands locally before finishing.

---

## Architecture Decisions

### Backend

- **Scheduler-based CheckWorker**: Each monitor gets its own `setTimeout` based on `intervalSeconds`. A `syncSchedule()` runs every 30s to reconcile with DB state. No busy-polling.
- **Split runtime roles**: `SERVER_ROLE` allows the API and each background loop to run in separate processes while keeping `all` as a compatibility mode.
- **Centralized env parsing**: runtime flags and required server settings are validated in `server/src/lib/env.ts`; the agent validates its own env in `apps/agent/src/config.ts`.
- **FlappingService**: Tracks rapid UP↔DOWN oscillations. Configurable `flappingFailCount` and `flappingIntervalSec`. State persisted in DB. Suppresses flood notifications.
- **RetentionService**: Hourly job deletes `CheckResult` records older than `retentionDays` (default 30).
- **Agent result ingestion**: `/api/agent/results` prefilters assigned monitors, deduplicates idempotency keys, then writes batched rows via `createMany` with recursive duplicate fallback for SQLite-safe behavior.
- **SSE (Server-Sent Events)**: Real-time dashboard updates. JWT auth via query param for SSE streams.
- **JWT boundary**: Query-token auth is allowed only for SSE endpoints; REST API requires `Authorization` header or API key.
- **Auth methods**: `NONE`, `BASIC`, `FORM_LOGIN`, `CSRF_FORM_LOGIN`. CSRF variant fetches login page, extracts CSRF token + cookies via `CookieJar`, then submits form.

### Frontend

- **AuthContext**: Manages JWT tokens and session expiry (intercepting 401 responses with "Session Expired" modal instead of hard reload).
- **ErrorBoundary**: Global React error boundary for graceful crash handling.
- **Dark theme**: Currently forced dark mode (no toggle yet).

### Database

- SQLite — lightweight, no separate DB server needed.
- All enums stored as `String` (SQLite limitation).
- `headers` and `authPayload` stored as JSON strings.
- Secrets encrypted with AES-256-GCM via `ENCRYPTION_KEY` env var.

---

## Environment Variables

| Variable         | Required          | Default                  | Description                          |
|------------------|-------------------|--------------------------|--------------------------------------|
| `JWT_SECRET`     | Yes (production)  | auto-generated           | JWT signing secret                   |
| `ADMIN_PASSWORD` | No                | random                   | Initial admin password               |
| `DATABASE_URL`   | Yes               | —                        | SQLite/Postgres connection string    |
| `CORS_ORIGINS`   | No                | `http://localhost:5173`  | Comma-separated allowed origins      |
| `PORT`           | No                | `3000`                   | Server port                          |
| `HOST`           | No                | `0.0.0.0`                | Server bind host                     |
| `ENCRYPTION_KEY` | Yes (production)  | —                        | 32-byte hex for AES-256-GCM secrets  |
| `LOG_LEVEL`      | No                | `info` / `warn` in test  | Pino log level                       |
| `LOG_FORMAT`     | No                | `pretty` / `json` in prod| Logger output mode                   |
| `SERVER_ROLE`    | No                | `all`                    | `all`, `api`, `worker`, `retention`, `agent-offline-monitor` |

---

## Code Style

- **TypeScript strict** in both client and server
- **Single quotes** for strings
- **Semicolons** at end of statements
- **Functional components** (React) — no class components
- **`async/await`** over raw Promises
- **Named exports** for services and utilities; **default exports** for Fastify route plugins
- **Consistent error handling**: routes return `{ error: string }` with appropriate HTTP status codes

---

## Key Files to Read First

1. `server/prisma/schema.prisma` — the data model (source of truth)
2. `server/src/index.ts` — app bootstrap, plugin registration, route mounting
3. `server/src/worker.ts` — the CheckWorker scheduling and check execution logic
4. `server/src/services/flapping.ts` — core flapping detection algorithm
5. `client/src/App.tsx` — frontend routing and layout
6. `client/src/api.ts` — Axios client configuration and interceptors
