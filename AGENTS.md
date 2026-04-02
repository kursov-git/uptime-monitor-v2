# AGENTS.md

This file is the primary source of truth for AI coding agents working in this repository.
Read this first, then follow the linked documents.

## Purpose

`uptime-monitor-v2` is a self-hosted uptime monitoring system with a split control plane and optional remote agents.

This repository is also intentionally a learning project.
It is used to:
- test the practical limits of AI-assisted engineering work
- preserve correct development and documentation patterns in-repo
- preserve correct product-discovery and backlog-shaping patterns in-repo

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

Roadmap policy:
- `docs/product/lean-roadmap.md` is the current single-operator and narrow-circle prioritization document
- `docs/product/strategic-roadmap.md` preserves the broader strategic and growth-oriented product direction
- do not delete or rewrite strategic ideas just because they are not in the current lean mode
- do not promote a strategic epic without at least a basic competitor scan and an explicit reason the feature should exist in this product

## Current State Summary

As of 2026-04-02:
- control plane is production-ready and deployed in split-runtime mode
- remote agents are deployed and reporting version `1.0.0`
- public status page is live at `/status` with selected monitors, 24h uptime summary, and a derived incident timeline
- HTTPS monitors can optionally track certificate expiry and emit warning/recovery notifications without marking the monitor `DOWN`
- ordinary HTTP/HTTPS monitors can now send raw request bodies for body-capable methods, with parity between builtin worker and remote agents
- monitors can now be configured as `HTTP`, `TCP`, or `DNS` with shared execution support across builtin worker and remote agents
- monitors can now optionally carry a lightweight `serviceName` used for dashboard and public status grouping without introducing a separate service domain model
- the first `Design System v1` rollout is complete and the authenticated UI plus `/status` now share one light `calm ops` visual language
- agent UI supports register, rotate token, revoke, delete, and version visibility
- split runtime, backup/restore, runtime diagnostics, and CI parity across server/client/agent/e2e are implemented
- SQLite is still the production database
- Postgres, observability, and a formal versioned protocol remain future work

## Source Of Truth

Read documents in this order.

1. `AGENTS.md`
2. `README.md`
3. `docs/index.md`
4. `docs/architecture/harness-documentation-model.md`
5. `docs/architecture/harness-documentation-template.md` if you need the reusable cross-project pattern
6. `docs/architecture/system-overview.md`
7. `docs/architecture/agent-protocol-compatibility.md`
8. `docs/architecture/ui-design-system.md`
9. `docs/operations/production-topology.md`
10. `docs/operations/runbook.md`
11. `docs/operations/agent-deployment-kit.md`
12. `docs/product/lean-roadmap.md`
13. `docs/product/strategic-roadmap.md`
14. `docs/historical/code-review-2026-03-11.md` only if you need earlier technical critique context

Historical or template documents are not the primary source of truth:
- `docs/historical/v2-task-tracker.md`
- `docs/historical/v2-rollout-plan.md`
- `docs/historical/v2-rollback-runbook.md`
- `docs/historical/v2-canary-signoff.md`
- `docs/historical/v2-issues-seed.md`
- `docs/historical/code-review-2026-03-11.md`

Use them only for historical context, not for current operational decisions.

## Repository Map

```text
.
├── AGENTS.md
├── README.md
├── docker-compose.yml                  # legacy single-process compose
├── docker-compose.split.yml            # current recommended control-plane compose
├── docs/
│   ├── index.md
│   ├── architecture/
│   │   ├── harness-documentation-model.md
│   │   ├── harness-documentation-template.md
│   │   ├── system-overview.md
│   │   ├── agent-protocol-compatibility.md
│   │   └── ui-design-system.md
│   ├── operations/
│   │   ├── production-topology.md
│   │   ├── runbook.md
│   │   ├── agent-deployment-kit.md
│   │   └── changelog-operations.md
│   ├── product/
│   │   ├── lean-roadmap.md
│   │   └── strategic-roadmap.md
│   ├── historical/
│   │   ├── v2-*.md                     # historical rollout/planning templates
│   │   └── code-review-2026-03-11.md   # historical technical assessment, not current truth
│   └── plans/
│       ├── active/
│       └── completed/                  # includes completed design-system rollout record
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
- collect HTTPS certificate expiry metadata for monitors with SSL expiry monitoring enabled
- execute configured raw request bodies for assigned `POST`/`PUT`/`PATCH`-style synthetic checks
- execute `TCP` and `DNS` monitor jobs with the same shared checker contract used by the builtin worker

## Production Topology

For current production details, read `docs/operations/production-topology.md`.

Important operational facts:
- SSH is expected on port `2332`, not `22`
- current operator workstation uses SSH aliases for the main hosts
- control plane is currently deployed in split-runtime compose mode
- current remote production agents are running as dockerized `systemd + docker compose` services using the repository deployment kit in `local-build` mode
- the same docker-based deployment kit is the canonical path for future agent hosts as well

## Safe Workflow For AI Agents

When making changes, follow this sequence.

1. Read `AGENTS.md` and the relevant specific doc.
2. Inspect current code before assuming the docs are still correct.
3. Prefer the split-runtime architecture in new work.
4. Preserve backward compatibility unless the user explicitly requests a breaking change.
5. Run the smallest relevant verification commands locally.
6. Update documentation when behavior, deployment, or operations change.

## Screenshot Workflow

For visual review and screenshot-based feedback:
- use `/home/skris/screenshots` as the shared screenshot drop zone
- do not create or rely on `uptime-monitor-v2/screenshots`
- treat `/home/skris/screenshots` as operator-owned workspace state, not repository content
- do not commit screenshot review artifacts into this repository unless the user explicitly asks for that

## Hard Rules

### Never do these blindly

- Do not assume port `22` is available on production hosts.
  Use `2332`.
- Do not delete an agent that still has assigned monitors.
  The backend now blocks this for a reason.
- Do not replace split-runtime production with `SERVER_ROLE=all` unless explicitly requested.
- Do not assume a `client` rollout needs to recreate `uptime-server-api`.
  Current split compose is wired so `docker compose -f docker-compose.split.yml up -d --build client` should be a true UI/nginx-only rollout.
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
- `server/src/services/flapping.ts`
- `server/src/lib/crypto.ts`
- `docker-compose.split.yml`
- `packages/checker/src/index.ts`
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

### Public status
- `GET /api/public/status`
- `GET /status`

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
- remote agent deployment now uses one canonical docker/systemd repository kit, though individual hosts can still differ in infrastructure provider and network shape

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
- API/runtime change: `AGENTS.md`, `README.md`, `docs/architecture/system-overview.md`
- ops/deploy change: `AGENTS.md`, `docs/operations/production-topology.md`, `docs/operations/runbook.md`
- roadmap/status change: `docs/product/strategic-roadmap.md`

## If You Are Unsure

If a document conflicts with code:
- trust code first
- then update the document
- then mention the mismatch in the final response
