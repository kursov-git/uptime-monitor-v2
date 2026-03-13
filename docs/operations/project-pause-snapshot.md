# Project Pause Snapshot

This document is a compact snapshot of the repository and production shape at the time the project was intentionally parked.

Snapshot date:
- `2026-03-13`

Snapshot commit:
- `45d448c2397d8157d2a86fa95fb6e49ed4e8e4e4`

Current project mode:
- active codebase
- production deployed
- intentionally paused for a period

## Why This Exists

When returning after a pause, the hardest part is often not the code.
It is reconstructing:
- what was already deployed
- what the product mode was
- which docs are authoritative
- what was intentionally left unfinished

This file is the short answer to those questions.

## Current Product Shape

The project currently is:
- a self-hosted uptime monitor
- split control plane
- optional remote agents
- lean operator-oriented product with a preserved strategic roadmap

Already shipped:
- split-runtime control plane
- remote dockerized agents
- public status page at `/status`
- SSL expiry monitoring inside HTTPS monitors
- cookie-based browser auth
- hashed API keys
- security hardening for the currently public internet-facing control plane

## Documentation Entry Points

Read in this order when returning:
1. `AGENTS.md`
2. `README.md`
3. `docs/index.md`
4. `docs/architecture/harness-documentation-model.md`
5. `docs/operations/production-topology.md`
6. `docs/operations/runbook.md`
7. `docs/operations/returning-to-project.md`
8. `docs/product/lean-roadmap.md`
9. `docs/product/strategic-roadmap.md`

## Product Mode At Pause Time

Lean/current mode:
- single operator or very small trusted circle
- avoid unnecessary workflow objects
- prioritize clarity, safety, and practical value

Strategic mode:
- still preserved and documented
- used to remember growth paths without forcing them into the lean backlog

Important product rule already recorded:
- do not promote a strategic epic without at least a lightweight competitor scan and an explicit differentiator

## Current Production Topology

Control plane:
- host alias: `onedashmsk`
- public domain: `ping-agent.ru`
- compose mode: `docker-compose.split.yml`
- public surfaces:
  - browser UI
  - `/status`
  - `/api/public/status`
  - `/api/*`
  - `/api/agent/*`

Restricted surfaces:
- `/health`
- `/health/runtime`

Current remote agents:
- `cloudruvm1`
- `ruvdskzn`

Agent runtime model:
- docker compose + systemd
- `local-build` deployment kit
- expected `MAIN_SERVER_URL=https://ping-agent.ru`

## Current Operational Facts

- SSH is expected on port `2332`
- `client`-only rollout should not recreate `uptime-server-api`
- control-plane DB is still SQLite
- `deploy.sh` remains legacy and is not the preferred production path
- Tailscale for admin access is still a preferred future path, but not yet enabled
- `AGENT_ALLOWLIST` is still available but not yet enforced in production
- latest pause-time control-plane DB backup:
  - `/data/backups/uptime-20260313T125318Z.db`

## Current Known Deliberate Gaps

These are not surprises.
They were intentionally left for later or for strategic mode:
- Tailscale / private admin access is not yet enabled
- `/api/agent/*` is not yet restricted by final source network policy
- maintenance windows are not implemented
- incident objects are not implemented
- service rollups are not implemented
- multiple public status pages are not implemented

## Recommended First Actions After Returning

1. Read `docs/operations/returning-to-project.md`.
2. Run `scripts/resume-smoke-check.sh`.
3. Confirm the docs still match reality.
4. Decide whether the project is resuming in lean mode or strategic mode.
5. Only then reopen backlog work.
