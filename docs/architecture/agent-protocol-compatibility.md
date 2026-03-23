# Agent Protocol Compatibility

This document defines the default compatibility rule for the remote-agent
protocol used by `uptime-monitor-v2`.

It exists to keep the current lean control-plane and agent model safe without
introducing formal version negotiation too early.

## Scope

This policy applies to the authenticated agent-facing routes:
- `GET /api/agent/jobs`
- `GET /api/agent/stream`
- `POST /api/agent/results`
- `POST /api/agent/heartbeat`

It also applies to the corresponding shared TypeScript payload shapes and the
agent runtime implementation in `apps/agent/`.

## Default Rule

Agent protocol changes are **additive-only by default**.

That means:
- existing response fields may gain new optional siblings
- existing request payloads may gain new optional fields
- existing enum-like string fields may gain new values only when older agents
  can safely ignore them
- existing fields must not silently change meaning

## Changes That Are Allowed Without A Migration Plan

- add a new optional response field
- add a new optional request field
- add a new optional nested metadata field
- add a new command or flag that older agents can ignore safely
- add new telemetry or counters that do not change command semantics

## Changes That Require An Explicit Compatibility Decision

- renaming an existing field
- removing an existing field
- making an optional field required
- changing the type of an existing field
- changing units or semantics of an existing field
- changing batching, deduplication, or auth expectations in a way that older
  agents would mis-handle
- changing SSE event names or meanings

When one of these is necessary, the change must include:
- an explicit compatibility note in docs
- updated contract tests
- a rollout note covering control plane and existing agents

## Operational Rule

Do not assume all agents can be updated at the exact same time.

Even in a single-operator deployment, different agent hosts may reconnect or be
updated at different moments. The control plane should therefore prefer
backward-compatible contract evolution unless a breaking change is deliberate
and operationally justified.

## Contract Discipline

Whenever the agent protocol changes:
1. update route-level validation and runtime behavior
2. update any affected shared types
3. update contract tests and snapshots
4. update this document or `system-overview.md` when semantics changed

Contract tests are the enforcement point for payload stability.
They do not replace reasoning, but they prevent accidental silent drift.

## Current Practical Implication

The repository does **not** currently implement formal protocol negotiation
beyond `agentVersion`.

Therefore:
- the protocol must evolve conservatively
- additive change is the safe default
- breaking changes must be rare and explicit
