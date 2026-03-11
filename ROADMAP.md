# Roadmap

This file tracks the current state and the remaining practical backlog.
It is the active roadmap.

For architecture and operations, use:
- `docs/ARCHITECTURE.md`
- `docs/PRODUCTION_TOPOLOGY.md`
- `docs/OPERATIONS_RUNBOOK.md`

## Current Delivery Status

### Control Plane

Done:
- Fastify API with JWT auth, API keys, RBAC, audit log
- monitor CRUD, stats, SSE dashboard updates
- Telegram and Zulip notifications
- flapping protection
- notification history
- SQLite + Prisma schema and migrations
- split runtime via `SERVER_ROLE`
- production JSON logging
- centralized env validation
- runtime health endpoint `/health/runtime`
- backup/restore/runtime-status scripts

### Agent Plane

Done:
- agent registration UI and API
- one-time token reveal on create/rotate
- token revocation
- agent deletion with monitor-assignment guard
- agent version persistence and UI visibility
- agent job bootstrap via `/api/agent/jobs`
- SSE stream via `/api/agent/stream`
- batched result ingestion with idempotency
- heartbeat updates and offline reconciliation
- shared `@uptime-monitor/checker`
- lightweight remote runtime with bounded buffer/concurrency

### Delivery And Quality

Done:
- server integration tests
- client tests and lint
- chromium e2e in CI
- local CI parity commands documented
- split control-plane deployment in production
- live remote agents reporting version `1.0.0`

## Completed Hardening

### P0
- [x] fix worker/checker test boundary
- [x] remove generic JWT query-token auth from REST API
- [x] make secret encryption fail-closed in production
- [x] remove absolute timeout from agent SSE stream
- [x] make CI a real quality gate

### P1
- [x] split API and background jobs into separate runtime roles
- [x] batch agent result ingestion
- [x] add production logging mode
- [x] centralize environment validation
- [x] ship operational runbook and backup/restore scripts
- [x] expose agent version and safe deletion flow

## Remaining Backlog

### P2: Reliability And Scale

#### 1. Postgres deployment path
Status:
- not started

Needed work:
- Postgres compose or deployment profile
- migration/testing path from SQLite
- operational docs update

#### 2. Observability
Status:
- partial only

Current state:
- logs and health endpoints exist
- no real metrics pipeline yet

Needed work:
- worker lag metric
- agent lag metric
- dropped results metric
- queue depth visibility
- ingestion latency visibility

#### 3. Protocol versioning
Status:
- partial only

Current state:
- agent reports `agentVersion`
- no explicit protocol negotiation/version contract

Needed work:
- formal server-agent protocol version
- compatibility policy
- upgrade/rollback semantics

### Product Backlog

#### Near-term practical features
- SMTP/email notifications
- public status pages
- maintenance windows
- export/import of monitors
- SLA reporting

#### Longer-term features
- organizations/teams
- granular permissions
- incident management
- extra check types: TCP, ping, SSL expiry

## Recommended Order Of Next Work

1. observability for agent plane and worker lag
2. Postgres deployment path
3. protocol/version compatibility rules
4. maintenance windows
5. email notifications

## Notable Operational Truths

- split runtime is now the preferred control-plane deployment
- SQLite is still the live database
- `deploy.sh` is legacy and should not be treated as the default production path
- current production agent hosts are native Node.js + systemd, while the repo also ships a docker-based agent deployment kit for future greenfield hosts
- SSH access is expected on port `2332`
