# Uptime Monitor v2

Self-hosted uptime monitoring with a split control plane, optional remote agents, a React UI, and Fastify-based APIs.

This README is the human-facing entry point.
For implementation and operator truth, read:
- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/PRODUCTION_TOPOLOGY.md`
- `docs/OPERATIONS_RUNBOOK.md`

## What It Does

- monitors HTTP/HTTPS endpoints
- validates response status and optional body expectations
- supports authenticated checks including multi-step flows
- sends notifications through Telegram and Zulip
- tracks audit history and notification history
- supports remote execution through registered agents
- supports builtin worker execution when `agentId` is not assigned
- exposes one public status page at `/status` for a curated subset of monitors

## Current State

Implemented and working:
- split backend runtime via `SERVER_ROLE`
- agent registration, token rotation, revocation, deletion, and version tracking
- agent job bootstrap, SSE updates, heartbeats, and batched result ingestion
- agent offline and recovery notifications through the shared notification stack
- public status page with per-monitor exposure, 24h availability buckets, and a derived incident timeline
- production JSON logging
- centralized env validation
- backup/restore scripts for SQLite compose deployments
- CI parity across server, client, agent, and e2e

Not yet implemented:
- Postgres production path
- full observability stack
- formal protocol versioning beyond `agentVersion`

## Repository Layout

```text
client/                 React + Vite UI
server/                 Fastify + Prisma backend
apps/agent/             Remote agent runtime
packages/checker/       Shared check engine
packages/shared/        Shared types/constants
deployment/agent/       Docker/systemd deployment kit for new agent hosts
docs/                   Architecture, topology, runbook, rollout references
scripts/                Backup/restore, runtime diagnostics, agent install/update helpers
```

## Local Development

### Install

```bash
npm install
```

### Server

```bash
cd server
npx prisma migrate dev
node prisma/seed.js
npm run dev
```

### Client

```bash
cd client
npm run dev
```

Default local endpoints:
- server: `http://localhost:3000`
- client: `http://localhost:5173`

## Backend Runtime Modes

The backend supports these runtime roles:
- `all`
- `api`
- `worker`
- `retention`
- `agent-offline-monitor`

Development examples:

```bash
npm --prefix server run dev:api
npm --prefix server run dev:worker
npm --prefix server run dev:retention
npm --prefix server run dev:agent-offline-monitor
```

Production recommendation:
- use `docker-compose.split.yml`
- do not use `SERVER_ROLE=all` for the main control plane unless you explicitly want the compatibility mode

## Main Compose Files

### `docker-compose.yml`
Legacy single-process compose.
Includes:
- one server container
- one client container
- one local agent container

Good for:
- local demos
- simplified environments

### `docker-compose.split.yml`
Current recommended control-plane deployment.
Includes:
- `server` (`SERVER_ROLE=api`)
- `worker`
- `retention`
- `agent-offline-monitor`
- `client`

This is the current production pattern for the control plane.

Operational note:
- `docker compose -f docker-compose.split.yml up -d --build client` is the intended UI/nginx-only rollout path and should not recreate `uptime-server-api`

## Environment Variables

### Server

Defined and validated in `server/src/lib/env.ts`.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | currently expected to be SQLite in production compose |
| `JWT_SECRET` | yes in production | required fail-closed in prod |
| `CORS_ORIGINS` | no | comma-separated |
| `HOST` | no | default `0.0.0.0` |
| `PORT` | no | default `3000` |
| `ENABLE_AGENT_API` | no | default `true` |
| `AGENT_SSE_ENABLED` | no | default `true` |
| `ENABLE_BUILTIN_WORKER` | no | default `true` |
| `LOG_LEVEL` | no | default `info`, `warn` in tests |
| `LOG_FORMAT` | no | `pretty` in dev, `json` in prod |
| `SERVER_ROLE` | no | default `all` |
| `ENCRYPTION_KEY` | operationally required in production | used for secret encryption |

### Agent

Defined and validated in `apps/agent/src/config.ts`.

| Variable | Required | Default |
|---|---|---|
| `MAIN_SERVER_URL` | yes | none |
| `AGENT_TOKEN` | yes | none |
| `AGENT_HTTP_TIMEOUT_MS` | no | `7000` |
| `AGENT_BUFFER_MAX` | no | `200` |
| `AGENT_RESULT_MAX_BATCH` | no | `50` |
| `AGENT_MAX_CONCURRENCY` | no | `6` |
| `ENCRYPTION_KEY_1` | optional but required for encrypted monitor auth payloads | none |

## Agent Lifecycle

Important distinction:
- registering an agent in the UI does not deploy anything
- it only creates the control-plane record and returns a one-time token

Operator flow:
1. register agent in UI
2. receive one-time token
3. deploy token to a real host
4. restart agent runtime on that host
5. wait for heartbeat and version to appear

Supported UI actions:
- register
- rotate token
- revoke access
- delete agent

Delete rules:
- deletion is allowed only if the agent has no assigned monitors
- historical results are preserved with `agentId = null`

## Public Status Page

Public route:
- `/status`

Public payload:
- `GET /api/public/status`

Current behavior:
- one shared public page for the whole monitored estate
- no auth required
- only monitors explicitly marked public are shown
- page shows current monitor status, simple 24h uptime summary, and a 24-hour derived incident timeline
- the public timeline is currently derived from hourly check-result buckets, not from the future formal incident model

Operator flow:
1. choose a monitor in the dashboard
2. toggle public visibility
3. open `/status`
4. verify only the intended monitors are shown

Current scope:
- one public page only
- same main domain as the operator UI
- no multi-page status configuration yet
- no dedicated incident object model in the public payload yet

## Tests And Verification

### Local CI parity

```bash
npm --prefix server run test:integration
npm --prefix server run build
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
CI=1 npm --prefix e2e run test
npm --prefix apps/agent run build
```

### Runtime diagnostics

```bash
./scripts/runtime-status.sh
COMPOSE_FILE=docker-compose.split.yml ./scripts/runtime-status.sh
```

### Backup and restore

```bash
./scripts/backup-db.sh
COMPOSE_FILE=docker-compose.split.yml DB_SERVICE=server ./scripts/backup-db.sh
./scripts/restore-db.sh /data/backups/uptime-YYYYMMDDTHHMMSSZ.db
```

## Production Notes

Read `docs/PRODUCTION_TOPOLOGY.md` before touching production.

Important current facts:
- SSH is expected on port `2332`
- current control plane is deployed in split-runtime compose mode
- current production agents are dockerized and managed by `systemd + docker compose`
- public status page is served from the same `client` container as the main UI
- the same repository deployment kit is used for future greenfield agent hosts

## Agent Deployment

For agent hosts, read:
- `docs/AGENT_DEPLOYMENT_KIT.md`

That kit is now both the canonical greenfield path and the current production pattern.

## Operations

For runbook-style instructions, use:
- `docs/OPERATIONS_RUNBOOK.md`

It covers:
- health checks
- split runtime operations
- backup and restore
- agent troubleshooting
- recovery workflow

## Legacy Script Warning

`deploy.sh` still exists, but it should be treated as a legacy helper.
It is not the preferred current production procedure for the split control plane.
Review it before using it on any real host.
