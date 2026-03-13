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
- `T051` Remove legacy plaintext agent-token compatibility after migration verification
- `T052` Re-evaluate public exposure of `/health` and `/health/runtime`
- `T053` Add regression tests for cookie auth, SSE auth boundaries, and non-disclosure of raw keys
- `T054` Update architecture and runbook docs with the current public threat model and recommended edge controls

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

Why this is lean:
- it improves operator clarity directly
- it does not require inventing a new product layer

### 4. Small Capability Expansions With Clear ROI

These remain valid if they solve an immediate personal or narrow-circle need:
- SSL expiry monitoring
- TCP checks
- better assertions

Rule:
- take these one at a time, only when there is a concrete monitoring need

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
