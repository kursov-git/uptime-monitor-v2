# AFC Baseline Completion Audit

Date: 2026-06-12

Current-status note:
- This is a point-in-time AFC audit. Its `ruvdsekb` revoked-agent statements were superseded on `2026-07-03`; use `docs/operations/production-topology.md` for the current trusted agent inventory and `docs/operations/changelog-operations.md` for the recovery history.

Scope:
- repository: `uptime-monitor-v2`
- standard: `$agent-friendly-code` Baseline
- goal: make the repository safe for an AI coding agent to enter, navigate, change, and verify without relying on long chat handoffs

## Baseline Definition Of Done

The project is considered AFC Baseline complete when:
1. `AGENTS.md`, `README.md`, and `docs/index.md` provide one current entry route.
2. Current topology, runtime, agents, deploy, and verification docs do not conflict.
3. Historical, completed, dated snapshot, generated, and local artifacts do not pollute default search.
4. Focused verification commands and the full local gate are documented.
5. Env, config, runtime, and shared contract boundaries are explicit.
6. Deploy, rollback, secrets, live-host, revoked-agent, and SQLite constraints are in durable ops docs.
7. No open `critical` or `high` AFC findings remain.
8. Low-risk quick wins are closed or listed as non-blocking residual risk.
9. Fresh verification gates pass.
10. This audit artifact exists in the repository.

## Result

Status: complete for AFC Baseline.

Open AFC findings:
- `critical`: 0
- `high`: 0

Non-blocking residual risks are listed at the end of this file.

## Requirement Evidence

### 1. Entry Surface

Evidence:
- `AGENTS.md` is the agent entry point and names the reading order.
- `README.md` is the human-facing entry point.
- `docs/index.md` routes architecture, operations, product, active plans, completed plans, and historical material.

Assessment: complete.

### 2. Current Truth

Evidence:
- `docs/operations/production-topology.md` is the current host and trusted-agent inventory source.
- `README.md` and `AGENTS.md` now say trusted live agents, not all historical agent records.
- `docs/operations/project-pause-snapshot.md` is explicitly dated context, not current topology.
- `docs/operations/changelog-operations.md` says it is chronological history, not the current topology source.

Assessment: complete.

### 3. Search Hygiene

Evidence:
- `.rgignore` excludes:
  - `docs/historical/`
  - `docs/plans/completed/`
  - `docs/operations/project-pause-snapshot.md`
- `.gitignore` excludes generated/runtime artifacts including:
  - `node_modules/`
  - `dist/`
  - `*.tsbuildinfo`
  - SQLite databases and sidecars
  - coverage, logs, `.run/`, deployment bundles, and deploy tools
- `docs/historical/architectural-review-2026-05-14.md` is quarantined outside current architecture docs.
- `docs/plans/active/.gitkeep` keeps the active-plans route present even when no active plans exist.

Assessment: complete.

### 4. Verification Surface

Evidence:
- `package.json` defines:
  - `check:paths`
  - `check:contracts`
  - `test:checker`
  - `test:server`
  - `test:client`
  - `test:agent`
  - `test:e2e`
  - `lint:client`
  - `ci:local`
- `AGENTS.md` and `README.md` document focused verification commands and when to run e2e.

Assessment: complete.

### 5. Contract Surface

Evidence:
- Server env schema lives in `server/src/lib/env.ts`.
- Server encryption validation lives in `server/src/lib/crypto.ts`.
- Agent runtime env and encryption key parsing live in `apps/agent/src/config.ts`.
- Telegram-specific env overrides live in `server/src/services/telegram.ts`.
- Shared API/runtime types live under `packages/shared`.
- The contract scan is `npm run check:contracts`.

Assessment: complete.

### 6. Runtime And Ops Boundary

Evidence:
- `docs/operations/production-topology.md` documents current control-plane and agent topology, trusted vs revoked agents, split runtime, backups, and live checks.
- `docs/operations/runbook.md` documents runtime health, backup/restore, deploy/update, env and secret handling, and revoked historical agent rules.
- `docs/operations/agent-deployment-kit.md` documents the canonical agent deployment kit.
- `docs/operations/incident-audit-2026-06-11-ruvdsekb-afc.md` documents the `ruvdsekb` revoke and incident boundary.

Assessment: complete.

### 7. Critical And High Findings

Evidence:
- No remaining current-doc conflict was found for the former architecture review snapshot path.
- As of this audit date, no current entry doc treated `ruvdsekb` as a trusted live agent.
- Generated/cache/database artifacts are ignored and no tracked ignored artifacts remain.

Assessment: complete.

### 8. Quick Wins

Closed quick wins:
- SQLite sidecars and TypeScript build info are ignored.
- `server/tsconfig.tsbuildinfo` was removed from tracked files.
- Expected test log noise was suppressed through test env configuration.
- README and AGENTS document `npm run ci:local`.
- Historical and dated docs are quarantined from default search.
- Agent env docs are aligned to `apps/agent/src/config.ts`.
- `apps/agent/test/config.test.ts` covers agent config behavior.
- As of this audit date, `ruvdsekb` was documented as revoked historical inventory, not a trusted live agent.

Assessment: complete.

### 9. Fresh Verification

Fresh verification on 2026-06-12:
- `git diff --check`: passed
- `npm run check:paths -- all`: passed, `Path validation passed.`
- `npm run check:contracts`: passed, `TypeScript contract scan passed.`
- `npm run ci:local`: passed, exit 0

`npm run ci:local` covered:
- TypeScript contract scan
- shared package builds
- checker tests: 2 files, 8 tests
- server tests: 27 files, 160 tests
- server build
- client tests: 21 files, 56 tests
- client lint
- client production build
- agent tests: 2 files, 13 tests
- agent build

Assessment: complete.

### 10. Audit Artifact

Evidence:
- `docs/operations/afc-completion-audit-2026-06-12.md`

Assessment: complete.

## Residual Risk

These are intentionally non-blocking for AFC Baseline:
- `docs/operations/changelog-operations.md` still contains historical statements such as older two-agent runtime state. It now says explicitly that changelog is chronological history and not the current topology source.
- Several TypeScript/TSX files are large. They are visible navigation friction candidates for AFC Strong, but no current `critical` or `high` AFC risk was proven from size alone.
- Formal protocol versioning, Postgres, metrics, and agent token TTL remain product/architecture backlog items, not AFC Baseline blockers.
- Browser e2e is documented but not part of the ordinary `ci:local` gate; it should run when a change touches deployed UI flows or public status behavior.

## AFC Strong Backlog

Future stronger alignment can include:
- review and split oversized TS/TSX files where a real boundary appears;
- add a docs link checker;
- add a lightweight package/interface inventory command;
- convert selected strategic architecture debt into explicit product or ops backlog items;
- run e2e on a scheduled or release-oriented cadence.
