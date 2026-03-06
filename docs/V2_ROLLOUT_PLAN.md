# Uptime Monitor v2 Rollout Plan

## Preconditions
- `server` and `client` CI green.
- `/api/agent/results` load test baseline recorded.
- At least one canary agent provisioned.
- Rollback runbook validated on staging.

## Stage 1 (10%)
- Assign 10% of monitors to remote agents.
- Duration: minimum 2 hours.
- Watch:
  - agent OFFLINE transitions
  - dropped results counter
  - results ingest latency
  - alert noise/regression
- Exit criteria:
  - no p0 incidents
  - error rate < 1%

## Stage 2 (50%)
- Increase assignment to 50%.
- Duration: minimum 8 hours.
- Repeat same SLO checks.
- Exit criteria:
  - stable trend vs stage 1
  - no sustained queue growth

## Stage 3 (100%)
- Move all designated monitors to agents.
- Keep builtin worker enabled for unassigned monitors.
- Duration: 24h observation window.

## Halt Conditions
- OFFLINE agents > 20% for > 10 min.
- Result ingest p99 > 1000ms for > 15 min.
- Dropped results increasing continuously for > 5 min.
- Repeated false-positive incidents.

## Rollback Trigger
- Any halt condition breach with user-facing impact.
- Execute rollback runbook immediately.
