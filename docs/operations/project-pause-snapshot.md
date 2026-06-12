# Project Pause Snapshot

This document is a compact snapshot of the repository and production shape at the time the project was intentionally parked.

Snapshot date:
- `2026-03-13`

Snapshot commit:
- `45d448c2397d8157d2a86fa95fb6e49ed4e8e4e4`

**Project resumed on 2026-05-14.**
- resume commit: `45442c2`
- infrastructure health check at resume time: all 5 control-plane services healthy; then-known agents `cloudruvm1` and `ruvdskzn` were ONLINE
- new docs since resume: `docs/historical/architectural-review-2026-05-14.md`, claudeops access section in topology, cluster telemetry reference in runbook
- latest changelog: `docs/operations/changelog-operations.md` (2026-05-14 entries)

This file is a dated return-from-pause snapshot, not the current operational
source of truth. For current host roles and agent inventory, read
`docs/operations/production-topology.md` and then
`docs/operations/changelog-operations.md`.

Project mode at resume:
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

## Product Shape At Resume

At resume, the project was:
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

## Production Topology At Resume

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

Remote agents at resume:
- `cloudruvm1`
- `ruvdskzn`

Agent runtime model:
- docker compose + systemd
- `local-build` deployment kit
- expected `MAIN_SERVER_URL=https://ping-agent.ru`

## Operational Facts At Resume

- SSH is expected on port `2332`
- `client`-only rollout should not recreate `uptime-server-api`
- control-plane DB is still SQLite
- Tailscale for admin access is still a preferred future path, but not yet enabled
- `AGENT_ALLOWLIST` is still available but not yet enforced in production
- latest pause-time control-plane DB backup:
  - `/data/backups/uptime-20260313T125318Z.db`

## Known Deliberate Gaps At Resume

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
