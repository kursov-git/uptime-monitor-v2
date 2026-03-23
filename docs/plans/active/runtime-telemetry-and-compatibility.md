# Runtime Telemetry And Protocol Compatibility

This plan captures the lean operational hardening work that follows the current
control-plane split runtime.

It is intentionally narrow:
- no Prometheus/Grafana stack
- no Redis/broker adoption
- no database migration as part of this plan

## Why This Exists

The current system is intentionally lean, but split-runtime operation on top of
SQLite and SSE means the operator needs a little more internal visibility and a
little more protocol discipline.

The goal is not enterprise observability.
The goal is to make the current architecture easier to trust and easier to
debug while preserving the self-hosted single-operator model.

## Scope

### 1. Lightweight Runtime Telemetry

Add low-cost runtime visibility to the existing internal health surface.

Telemetry should cover:
- current browser SSE clients
- current agent SSE clients
- connection accept/reject/disconnect counters
- recent broadcast/publish heartbeat timestamps
- worker scheduling and latest refresh/check metadata
- retention latest run metadata
- agent-offline latest run metadata

Preferred surface:
- extend existing `/health/runtime`

Constraints:
- in-memory counters and status objects are preferred
- do not introduce a new metrics database
- do not add a new public endpoint

### 2. Agent Protocol Compatibility Policy

Define a strict default rule for the agent contract:
- additive changes only by default
- do not silently change field meaning
- contract tests must move with payload changes

This is a docs + contract-discipline task, not a full version-negotiation
project.

Status:
- implemented in `docs/architecture/agent-protocol-compatibility.md`
- backed by explicit contract coverage for `jobs`, `results`, and `heartbeat`

### 3. SQLite / Retention Pressure Review

Review the current write pressure around:
- agent result batches
- retention cleanup
- split-runtime concurrency

This phase should produce:
- explicit measurements or error evidence
- small mitigations if needed

It should not automatically trigger:
- PostgreSQL migration
- queue/broker introduction

## Execution Order

1. Lightweight runtime telemetry
2. Agent protocol compatibility policy
3. SQLite / retention pressure review

## Definition Of Done

The plan is complete when:
- `/health/runtime` exposes enough runtime context to explain recent internal
  activity
- the agent contract has an explicit compatibility rule in repo docs
- SQLite/retention pressure has been reviewed based on evidence rather than
  guesswork
