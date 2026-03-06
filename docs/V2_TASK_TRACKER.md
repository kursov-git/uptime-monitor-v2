# Uptime Monitor v2 Task Tracker

Источник: `ROADMAP_NEW.md`.
Цель: разложить roadmap на эпики и атомарные задачи для GitHub Project.

## Milestones

### M1 - Foundation
- [ ] T001 DB migration: `Agent`, `Monitor.agentId`, `CheckResult.agentId`, indexes
- [ ] T002 Server flags: `ENABLE_AGENT_API`, `AGENT_SSE_ENABLED`
- [ ] T003 Agent auth service: token hash verify + revoke check
- [ ] T004 `GET /api/agent/jobs` (zod contract + tests)
- [ ] T005 `POST /api/agent/heartbeat` (update `lastSeen` + tests)
- [ ] T006 Offline monitor cron/service (`ONLINE -> OFFLINE`) + tests

### M2 - Checker + Agent Runtime
- [ ] T007 Create `packages/checker` and move `performCheck()`
- [ ] T008 Integrate checker into server worker
- [ ] T009 Bootstrap `apps/agent` (env/config/logging)
- [ ] T010 Agent scheduler for monitor intervals
- [ ] T011 `POST /api/agent/results` with `idempotencyKey` dedupe
- [ ] T012 In-memory buffer + reconnect flush + overflow policy
- [ ] T013 SSE stream endpoint + `Last-Event-ID` + re-sync command

### M3 - UI + Hardening + Observability
- [ ] T014 UI Agents page (list/status/lastSeen)
- [ ] T015 UI token actions (create/rotate/revoke)
- [ ] T016 Monitor form: executor select (builtin/agent)
- [ ] T017 Show `agentName` in results/incidents/notifications
- [ ] T018 API rate limits + payload limits + secure logging
- [ ] T019 Metrics: heartbeat lag, ingest qps, dropped/duplicates, buffer size
- [ ] T020 Audit events for agent lifecycle

### M4 - Rollout
- [ ] T021 Staging load test for `/api/agent/results`
- [ ] T022 Canary rollout 10% -> 50% -> 100%
- [ ] T023 Rollback drill and runbook validation
- [ ] T024 24h canary stability signoff

## Epics

### E1 Control Plane Foundation (M1)
Tasks: T001-T006
Acceptance:
- DB schema backward compatible.
- Agent auth and core endpoints operational.
- Offline transition works and covered by tests.

### E2 Checker Extraction (M2)
Tasks: T007-T008
Acceptance:
- Shared checker package used by server worker.
- No heavy checker deps leaked into frontend/shared runtime.

### E3 Agent Runtime (M2)
Tasks: T009-T013
Acceptance:
- Agent can bootstrap, schedule checks, send batched results.
- SSE reconnect and full re-sync are functional.
- Buffer overflow policy observable via metrics/logs.

### E4 UI and Operability (M3)
Tasks: T014-T020
Acceptance:
- Agents manageable from UI.
- Executor assignment visible and editable.
- Security/observability controls enabled and tested.

### E5 Rollout and Reliability (M4)
Tasks: T021-T024
Acceptance:
- Canary and rollback validated on staging.
- SLO and alerts green before 100% traffic.

## Priority Backlog (p0 first)

### p0
- [ ] T001
- [ ] T003
- [ ] T004
- [ ] T005
- [ ] T006
- [ ] T007
- [ ] T011
- [ ] T013

### p1
- [ ] T008
- [ ] T009
- [ ] T010
- [ ] T012
- [ ] T014
- [ ] T016
- [ ] T018
- [ ] T019

### p2
- [ ] T015
- [ ] T017
- [ ] T020
- [ ] T021
- [ ] T022
- [ ] T023
- [ ] T024

## Definition of Ready (DoR) for each task
- [ ] Scope is explicit.
- [ ] Dependencies listed.
- [ ] Acceptance criteria measurable.
- [ ] Test plan written.
- [ ] Rollback impact noted.

## Definition of Done (DoD) for each task
- [ ] Code merged.
- [ ] Tests added/updated and passing in CI.
- [ ] Docs updated (if API/flags/ops changed).
- [ ] Observability updated (logs/metrics where relevant).
- [ ] Feature flag strategy documented (if applicable).
