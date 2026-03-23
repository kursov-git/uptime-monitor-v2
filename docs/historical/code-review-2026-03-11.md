# Historical Code Review

Last updated: 2026-03-11

This file is retained only as historical context from an earlier repository state.
It is not a current source of truth for production topology or deployment.

At the time of writing, this review captured the project before:
- the agent deployment model was fully standardized on docker compose + systemd
- the split-runtime control plane became the explicit canonical production path
- later runtime telemetry, SSE hardening, and SQLite-pressure mitigation work landed

Keep this file only for historical comparison.
Use the current operational docs instead:
- `AGENTS.md`
- `README.md`
- `docs/index.md`
- `docs/operations/production-topology.md`
- `docs/operations/runbook.md`

---

# Code Review

Last updated: 2026-03-11

This file is the current high-level technical assessment.
It is not a line-by-line audit log; it captures the important remaining risks after the recent hardening and rollout work.

## Current Assessment

Overall state:
- the project is in workable production shape
- core control-plane and agent-plane flows are implemented and deployed
- CI is meaningful
- operational docs now exist for split runtime and backups

Strong areas:
- modular Fastify backend
- split runtime support
- centralized env validation
- batched/idempotent agent ingestion
- shared checker package
- agent lifecycle APIs and UI
- production logging discipline
- healthy test coverage in the important paths

## Remaining Findings

### High

#### 1. SQLite is still the production database
Impact:
- limited write concurrency
- more operational fragility during scale-up
- backup/restore discipline matters more

Recommendation:
- implement a Postgres deployment path before significant growth in agent count or check volume

#### 2. Observability is still log-first, not metrics-first
Impact:
- diagnosing lag, queue growth, or partial degradation still requires manual log inspection

Recommendation:
- add explicit metrics or at least structured counters for:
  - worker lag
  - agent heartbeat lag
  - dropped results
  - queue depth
  - ingestion latency

### Medium

#### 3. Deployment methods are mixed across production
Current state:
- control plane uses split docker compose
- existing production agents use native Node.js + systemd
- repo also ships a docker-based agent deployment kit

Impact:
- more operator context needed
- future changes must remember which hosts use which model

Recommendation:
- either standardize on one agent deployment model or keep the distinction explicitly documented and tested

#### 4. `deploy.sh` is legacy but still present
Impact:
- future operators or AI agents may use it incorrectly for the split control plane

Recommendation:
- either replace it with a split-aware deploy path or clearly keep it documented as legacy-only

### Low

#### 5. No formal protocol version negotiation yet
Current state:
- agents report `agentVersion`
- control plane stores and displays it
- no explicit protocol compatibility enforcement

Recommendation:
- add a protocol version field and upgrade policy when Postgres/observability work is tackled

## What Is No Longer A Primary Concern

These were previously meaningful risks and have been materially improved:
- weak CI gate
- worker/checker test boundary confusion
- generic JWT query token on REST APIs
- fail-open secret handling in production
- unstable agent SSE timeout behavior
- lack of split runtime
- lack of safe agent deletion semantics
- lack of version visibility for deployed agents

## Recommended Next Technical Moves

1. add observability for the agent plane and worker lag
2. introduce a Postgres deployment path
3. formalize server-agent protocol compatibility
4. standardize or explicitly codify agent deployment modes further
