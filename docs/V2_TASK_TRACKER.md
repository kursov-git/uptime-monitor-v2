# V2 Task Tracker

Status: historical rollout tracker with updated completion marks.
Use `ROADMAP.md` for the active backlog.

## Milestones

### M1 - Foundation
- [x] T001 DB migration: `Agent`, `Monitor.agentId`, `CheckResult.agentId`, indexes
- [x] T002 Server flags: `ENABLE_AGENT_API`, `AGENT_SSE_ENABLED`
- [x] T003 Agent auth service: token hash verify + revoke check
- [x] T004 `GET /api/agent/jobs` (zod contract + tests)
- [x] T005 `POST /api/agent/heartbeat` (update `lastSeen` + tests)
- [x] T006 Offline monitor service (`ONLINE -> OFFLINE`) + tests

### M2 - Checker + Agent Runtime
- [x] T007 Create `packages/checker` and move `performCheck()`
- [x] T008 Integrate checker into server worker
- [x] T009 Bootstrap `apps/agent` (env/config/logging baseline)
- [x] T010 Agent scheduler for monitor intervals
- [x] T011 `POST /api/agent/results` with `idempotencyKey` dedupe
- [x] T012 In-memory buffer + reconnect flush + overflow policy
- [x] T013 SSE stream endpoint + `Last-Event-ID` + re-sync command

### M3 - UI + Hardening + Observability
- [x] T014 UI Agents page (list/status/lastSeen)
- [x] T015 UI token actions (register/rotate/revoke)
- [x] T016 Monitor form: executor select (builtin/agent)
- [x] T017 Show `agentName` in results/incidents/notifications
- [x] T018 API rate limits + payload limits + secure logging
- [ ] T019 Metrics: heartbeat lag, ingest qps, dropped/duplicates, buffer size
- [x] T020 Audit events for agent lifecycle

### M4 - Rollout
- [ ] T021 Staging load test for `/api/agent/results`
- [ ] T022 Canary rollout 10% -> 50% -> 100%
- [ ] T023 Rollback drill and runbook validation
- [ ] T024 24h canary stability signoff

## Notes

Current reality beyond the original tracker:
- agent deletion with assignment guard is implemented
- agent version persistence and UI display are implemented
- split-runtime control plane is deployed in production
- backup/restore/runtime-status operational scripts are implemented

## Source Of Truth

For current planning and remaining backlog, use `ROADMAP.md`.
