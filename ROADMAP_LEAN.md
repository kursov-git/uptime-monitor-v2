# Lean Roadmap

This is the current single-operator roadmap for `uptime-monitor-v2`.

It does not replace `ROADMAP.md`.
Instead:
- `ROADMAP_LEAN.md` is the current operating-mode roadmap
- `ROADMAP.md` is the strategic and growth-oriented roadmap

Use this document when the product is being prioritized as:
- a tool for one operator or a very small trusted circle
- a self-hosted utility first, not a process platform
- a product that should stay cognitively light

## Prioritization Rules

An item belongs in the lean roadmap when:
- it improves the day-to-day operator experience in the next few weeks
- it does not require introducing a heavy new domain model unless the value is immediate
- it keeps the product easy to explain and easy to use

An item belongs in the strategic roadmap instead when:
- it becomes much more valuable with multiple operators
- it primarily serves public-facing growth, not the current operator
- it adds process layers such as incidents, acknowledgements, maintenance workflows, or richer public configuration

## Current Product Mode

Assumptions for this roadmap:
- primary real user: one operator
- public exposure exists, but the service is still intentionally compact
- reliability, clarity, and low-friction operations matter more than feature breadth

## Current Baseline

Already good enough:
- split control-plane runtime
- remote agents with dockerized deployment
- public HTTPS domain
- public status page at `/status`
- alert delivery through Telegram and Zulip
- monitor history and public uptime visualization
- current security hardening baseline for a public internet-facing service

This means the next lean work should be incremental and practical, not structural.

## Now

### 1. Security Follow-Through

Goal:
- finish the remaining high-ROI hardening work without turning the product into an IAM project

Keep in `Now`:
- `T048` Add production edge restriction for admin UI and admin APIs
- `T049` Restrict `/api/agent/*` to expected source networks or private paths where feasible

Recently completed:
- `T051` Remove legacy plaintext agent-token compatibility after migration verification
- `T052` Restrict `/health` and `/health/runtime` behind the runtime-health allowlist at the edge
- `T053` Add regression coverage for SSE auth boundaries, cookie-auth flow, and raw-key non-disclosure
- `T054` Refresh architecture, topology, and runbook docs with the current public threat model and edge controls

Why this stays:
- the control plane is already public
- this is real risk reduction, not speculative platform work

### 2. Public Status Page Polish

Goal:
- keep `/status` useful, stable, and presentable without adding a big new model

Focus:
- fix real UX defects quickly
- improve wording and readability when needed
- keep mobile rendering solid
- keep public payload narrow and non-sensitive

What belongs here:
- visual polish
- better empty and degraded states
- making the current derived incident timeline clearer
- keeping navigation and first-load behavior stable

Recently completed:
- clearer public status headline and degraded/empty messaging
- more readable public incident strip and chart presentation
- first-load route stability fix for `/status`

What does not belong here yet:
- multiple public pages
- custom domains
- public-page permissions model
- formal incident integration if it requires introducing incidents first

### 3. Agent Fleet Clarity

Goal:
- make it faster to understand what is happening with remote execution

Use the existing strategic item in a lean way:
- desired version vs actual version
- outdated agent indicator
- improved offline diagnostics
- clearer assigned-monitor visibility

Recently completed:
- top-level agent summary cards
- attention-first sorting for offline / revoked / outdated agents
- clearer status badges, version drift signal, and monitor assignment visibility

Why this is lean:
- it improves operator clarity directly
- it does not require inventing a new product layer

### 4. Small Capability Expansions With Clear ROI

These remain valid if they solve an immediate personal or narrow-circle need:
- SSL expiry monitoring
- TCP checks
- better assertions

Recently completed:
- better body assertion UX
- explicit assertion modes: `contains`, `regex`, `JSON path equals`, `JSON path contains`
- assertion validation and checker coverage across builtin worker and remote agents

Rule:
- take these one at a time, only when there is a concrete monitoring need

#### SSL Expiry Monitoring Backlog

Goal:
- warn about expiring TLS certificates without turning the product into a generic SSL scanner

Why this fits lean mode:
- common real-world operational need
- easy to explain and immediately useful
- complements existing HTTPS monitors without introducing a new heavy domain model

What v1 should do:
- allow an HTTPS monitor to opt into certificate expiry checks
- record certificate expiry date and days remaining during checks
- surface an `SSL warning` state in monitor UI while leaving the monitor logically `UP` if the HTTP check still passes
- alert when remaining lifetime drops below a configured threshold
- avoid notification spam with simple dedupe / re-notify behavior

What v1 should not do:
- full certificate-chain diagnostics
- OCSP / CRL checks
- cipher / protocol scanning
- SAN / wildcard analysis UI
- a brand-new monitor type if an HTTPS monitor can carry this cleanly

Proposed operator UX:
- monitor form:
  - `Check SSL expiry` toggle
  - `Warn when <= N days` threshold
- monitor card / history:
  - `SSL valid for 23 days`
  - or `SSL expires in 5 days`
  - clear warning badge when below threshold
- notifications:
  - dedicated `SSL_EXPIRING` message
  - recovery when the certificate is renewed and exits the warning threshold

Backlog:
- `L001` Add monitor-level config for SSL expiry checks and warning threshold
- `L002` Extend checker to read peer certificate metadata for HTTPS targets
- `L003` Persist TLS snapshot fields needed for UI and alerting
- `L004` Show SSL expiry state on monitor cards and monitor history
- `L005` Add alerting for threshold entry with basic dedupe / re-notify behavior
- `L006` Add recovery behavior when the certificate is renewed and exits threshold
- `L007` Add tests for checker, persistence, UI rendering, and notification flow

Acceptance criteria:
- HTTPS monitors can display `days remaining`
- expiring certificates do not incorrectly flip the monitor to `DOWN`
- alerts fire when the threshold is crossed
- recovery is visible after renewal
- HTTP monitors without TLS continue to behave exactly as before

## Later

These are still reasonable in lean mode, but not urgent:
- DNS / domain monitoring
- better reporting and compact summaries
- more alert channels only if a real delivery need appears

These should enter active work only after the `Now` items stop yielding obvious value.

## Explicitly Not Now

The following are not deleted.
They stay in `ROADMAP.md`, not here.

### 1. Scheduled Maintenance Windows

Reason:
- valuable in broader operational maturity
- currently adds workflow and domain complexity beyond the immediate needs of one operator

### 2. Incident Management Lite

Reason:
- useful later, especially for public-facing maturity
- currently risks adding a whole new object model before it is truly needed

### 3. Richer Public Status Configuration

Reason:
- current single public page is enough for now
- more configuration creates admin surface without immediate operator value

### 4. Lightweight Host / Service Context

Reason:
- can be useful later
- not necessary while the monitored estate is still understandable without another abstraction layer

### 5. Any Multi-User or Process-Heavy Expansion

Examples:
- multi-tenant or workspace ideas
- advanced RBAC
- acknowledgement workflows
- maintenance approval flows
- collaboration-heavy incident handling

Reason:
- these solve a different stage of product maturity

## Current Lean Build Order

1. Finish remaining security follow-through
2. Keep the public status page stable and polished
3. Improve agent fleet clarity
4. Add one small capability at a time only when there is a real monitoring need

## Relationship To `ROADMAP.md`

Use `ROADMAP.md` when discussing:
- where the product can grow
- what should exist in a broader internal or public-facing version
- which bigger concepts should not be forgotten

Use `ROADMAP_LEAN.md` when deciding:
- what to build next
- what to postpone deliberately
- how to keep the product useful without bloating it
