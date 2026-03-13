# Returning To Project

This document is the short resume checklist for coming back to `uptime-monitor-v2` after a pause.

Use it before writing new code.

## 1. Rebuild Context

Read these files first:
1. `AGENTS.md`
2. `README.md`
3. `docs/index.md`
4. `docs/architecture/harness-documentation-model.md`
5. `docs/operations/project-pause-snapshot.md`
6. `docs/operations/production-topology.md`
7. `docs/operations/runbook.md`
8. `docs/product/lean-roadmap.md`
9. `docs/product/strategic-roadmap.md`

Goal:
- restore repo context
- restore production context
- restore product-mode context

## 2. Verify The Repository State

From the repository root:

```bash
git status --short
git log --oneline -n 10
git tag --list | tail -n 20
```

Questions to answer:
- are there local changes?
- what is the current `HEAD`?
- what stable or pause tag was left behind?

## 3. Run Smoke Verification

Use the repository script:

```bash
./scripts/resume-smoke-check.sh
```

What it checks:
- local git state
- current `HEAD`
- compose service state
- internal `/health`
- internal `/health/runtime`
- external `/status`
- external `/api/public/status`
- external `/health` and `/health/runtime` should remain restricted

If production context or domain changes, adjust the env vars described in the script header.

## 4. Reconfirm Production Topology

Before touching infra or rollout logic, reconfirm:
- current public domain
- current control-plane host
- current remote agent inventory
- current deployment mode for control plane and agents

Primary references:
- `docs/operations/project-pause-snapshot.md`
- `docs/operations/production-topology.md`
- `docs/operations/runbook.md`

## 5. Reconfirm Product Mode

Decide explicitly which mode applies now:

- lean mode:
  - use `docs/product/lean-roadmap.md`
  - keep the product cognitively light
  - prioritize real operator value

- strategic mode:
  - use `docs/product/strategic-roadmap.md`
  - only for work that is intentionally about product growth
  - require competitor scan before promoting a strategic epic

Do not mix these implicitly.

## 6. Reconfirm Security Posture

Before new public-surface work, re-check:
- browser auth still cookie-based
- `/health` and `/health/runtime` still edge-restricted
- agent tokens remain hashed-only
- current admin-access plan:
  - no Tailscale yet
  - no final `AGENT_ALLOWLIST` enforcement yet

If any of those assumptions changed outside the repo, update docs first.

## 7. Decide The Type Of Next Work

Choose one:
- `stability only`
- `lean product work`
- `strategic product work`
- `ops/security hardening`

This is important because it determines which doc set is authoritative.

## 8. Before First New Commit

Do these checks:
- docs still match reality
- current tag/branch state is understood
- smoke verification passed
- backlog source is explicit
- production assumptions are explicit

If any of those are unclear, fix the docs before adding new code.
