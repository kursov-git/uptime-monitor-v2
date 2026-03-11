# AGENTS.md

This file is the primary source of truth for AI coding agents working in this repository.
Read this first, then follow the linked documents.

## Purpose

`uptime-monitor-v2` is a self-hosted uptime monitoring system with a split control plane and optional remote agents.

The repository contains:
- control-plane API and UI
- builtin monitor worker
- remote agent runtime
- deployment and operational tooling
- tests and CI for all major paths

This document is optimized for agents that need to understand:
- what is running now
- which documents are authoritative
- how to make safe changes without damaging production
- how the codebase is laid out

## Current State Summary

As of 2026-03-11:
- control plane is production-ready and deployed in split-runtime mode
- remote agents are deployed and reporting version `1.0.0`
- agent UI supports register, rotate token, revoke, delete, and version visibility
- split runtime, backup/restore, runtime diagnostics, and CI parity across server/client/agent/e2e are implemented
- SQLite is still the production database
- Postgres, observability, and a formal versioned protocol remain future work

## Source Of Truth

Read documents in this order.

1. `AGENTS.md`
2. `README.md`
3. `docs/ARCHITECTURE.md`
4. `docs/PRODUCTION_TOPOLOGY.md`
5. `docs/OPERATIONS_RUNBOOK.md`
6. `docs/AGENT_DEPLOYMENT_KIT.md`
7. `ROADMAP.md`
8. `CODE_REVIEW.md`

Historical or template documents are not the primary source of truth:
- `ROADMAP_NEW.md`
- `docs/V2_TASK_TRACKER.md`
- `docs/V2_ROLLOUT_PLAN.md`
- `docs/V2_ROLLBACK_RUNBOOK.md`
- `docs/V2_CANARY_SIGNOFF.md`
- `docs/V2_ISSUES_SEED.md`

Use them only for historical context, not for current operational decisions.

## Repository Map

```text
.
├── AGENTS.md
├── README.md
├── ROADMAP.md
├── ROADMAP_NEW.md
├── CODE_REVIEW.md
├── docker-compose.yml                  # legacy single-process compose
├── docker-compose.split.yml            # current recommended control-plane compose
├── deploy.sh                           # legacy deploy script, not the current preferred prod path
├── docs/
│   ├── ARCHITECTURE.md
│   ├── PRODUCTION_TOPOLOGY.md
│   ├── OPERATIONS_RUNBOOK.md
│   ├── AGENT_DEPLOYMENT_KIT.md
│   └── V2_*.md                         # historical rollout/planning templates
├── apps/
│   └── agent/                          # remote agent runtime
├── client/                             # React + Vite UI
├── server/                             # Fastify + Prisma backend
├── packages/
│   ├── checker/                        # shared HTTP check engine
│   └── shared/                         # shared TS types/constants
├── deployment/
│   └── agent/                          # docker/systemd deployment kit for agents
├── scripts/
│   ├── backup-db.sh
│   ├── restore-db.sh
│   ├── runtime-status.sh
│   ├── install-agent.sh
│   ├── update-agent.sh
│   ├── uninstall-agent.sh
│   └── loadtest-agent-results.mjs
└── e2e/
```

## Runtime Topology

There are two distinct runtime surfaces.

### Control Plane

Implemented in `server/` and `client/`.

Supported modes:
- `SERVER_ROLE=all`
- `SERVER_ROLE=api`
- `SERVER_ROLE=worker`
- `SERVER_ROLE=retention`
- `SERVER_ROLE=agent-offline-monitor`

Current recommended production mode:
- split runtime using `docker-compose.split.yml`
- separate services for API, worker, retention, and agent-offline-monitor

### Remote Agents

Implemented in `apps/agent/`.

Agent responsibilities:
- bootstrap monitor jobs from `/api/agent/jobs`
- subscribe to `/api/agent/stream`
- execute checks via `@uptime-monitor/checker`
- buffer and batch result delivery to `/api/agent/results`
- send heartbeat to `/api/agent/heartbeat`
- report `agentVersion`

## Production Topology

For current production details, read `docs/PRODUCTION_TOPOLOGY.md`.

Important operational facts:
- SSH is expected on port `2332`, not `22`
- current operator workstation uses SSH aliases for the main hosts
- control plane is currently deployed in split-runtime compose mode
- current remote production agents are running as native Node.js + systemd services under a repo checkout, not via the docker-based deployment kit
- the docker-based deployment kit remains the canonical greenfield install path for future agent hosts

## Safe Workflow For AI Agents

When making changes, follow this sequence.

1. Read `AGENTS.md` and the relevant specific doc.
2. Inspect current code before assuming the docs are still correct.
3. Prefer the split-runtime architecture in new work.
4. Preserve backward compatibility unless the user explicitly requests a breaking change.
5. Run the smallest relevant verification commands locally.
6. Update documentation when behavior, deployment, or operations change.

## Hard Rules

### Never do these blindly

- Do not use `deploy.sh` as the default production path without reviewing it.
  Reason: it is a legacy script oriented around single-process compose and broad container stops.
- Do not assume port `22` is available on production hosts.
  Use `2332`.
- Do not delete an agent that still has assigned monitors.
  The backend now blocks this for a reason.
- Do not replace split-runtime production with `SERVER_ROLE=all` unless explicitly requested.
- Do not assume docker-based agent deployment matches the current production hosts.
  Current prod agents are native Node.js + systemd.
- Do not add Prisma enums for SQLite-backed domain values.
  Use strings.
- Do not add new `console.*` in server code.
  Use the shared Pino logger.

### Always do these

- Validate env changes against `server/src/lib/env.ts` and `apps/agent/src/config.ts`.
- Keep API contracts aligned with `packages/shared` when appropriate.
- Keep agent and server behavior aligned when touching heartbeat, jobs, results, or SSE.
- Keep docs current when touching runtime roles, routes, scripts, migrations, or deployment behavior.
- Use `fastify.inject()` in server tests.
- Preserve SQLite compatibility unless a deliberate migration plan is part of the task.

## High-Risk Areas

Review these carefully before touching them.

- `server/prisma/schema.prisma`
- `server/src/index.ts`
- `server/src/routes/agent.ts`
- `server/src/routes/agents.ts`
- `server/src/services/agentResults.ts`
- `server/src/services/agentSse.ts`
- `server/src/lib/crypto.ts`
- `docker-compose.split.yml`
- `deployment/agent/*`

## Current API Surface That Matters Most

### Control-plane admin APIs
- `/api/auth/*`
- `/api/monitors/*`
- `/api/users/*`
- `/api/apikeys/*`
- `/api/audit`
- `/api/notifications/*`
- `/api/agents/*`

### Agent APIs
- `GET /api/agent/jobs`
- `GET /api/agent/stream`
- `POST /api/agent/results`
- `POST /api/agent/heartbeat`

### Health
- `GET /health`
- `GET /health/runtime`

## Agent Lifecycle Semantics

The UI and API now distinguish between these operations.

- Register agent:
  - creates agent record
  - returns one-time token
  - does not deploy anything to a host
- Rotate token:
  - invalidates current token
  - returns a new one-time token
- Revoke access:
  - sets `revokedAt`
  - forces the agent effectively offline until re-registered or token-rotated
- Delete agent:
  - allowed only when the agent has no assigned monitors
  - preserves historical results by nulling `agentId` through the DB relation behavior
- Heartbeat:
  - updates `lastSeen`
  - marks agent `ONLINE`
  - persists `agentVersion` when provided

## Current Verification Commands

Use these commands after meaningful changes.

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

### DB operations

```bash
./scripts/backup-db.sh
COMPOSE_FILE=docker-compose.split.yml DB_SERVICE=server ./scripts/backup-db.sh
./scripts/restore-db.sh /data/backups/uptime-YYYYMMDDTHHMMSSZ.db
```

## Known Gaps

These are real remaining gaps, not hypothetical ones.

- production still runs on SQLite
- no full metrics/observability stack yet
- no Postgres deployment path yet
- remote agent deployment is not standardized on one single method across all hosts
- `deploy.sh` is still present and useful for history, but should be treated as legacy

## Documentation Maintenance Rules

When you change any of these, update docs in the same work unit.

- routes or API contracts
- runtime roles
- health endpoints
- env variables
- deployment method
- backup/restore behavior
- agent lifecycle semantics
- production topology
- roadmap status

Minimum docs update set by change type:
- API/runtime change: `AGENTS.md`, `README.md`, `docs/ARCHITECTURE.md`
- ops/deploy change: `AGENTS.md`, `docs/PRODUCTION_TOPOLOGY.md`, `docs/OPERATIONS_RUNBOOK.md`
- roadmap/status change: `ROADMAP.md`, possibly `CODE_REVIEW.md`

## If You Are Unsure

If a document conflicts with code:
- trust code first
- then update the document
- then mention the mismatch in the final response
