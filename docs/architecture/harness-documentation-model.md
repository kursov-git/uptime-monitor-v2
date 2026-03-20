# Harness Documentation Model For This Repository

This document explains the project-specific documentation model used in `uptime-monitor-v2`.

It is written for:
- AI coding agents that were not created specifically for this project
- human contributors who need to understand why the documentation tree is structured this way

It is not intended to be a universal standard by itself.
For a reusable cross-project version, read:
- `docs/architecture/harness-documentation-template.md`

The goal is not to copy a vendor-specific internal process.
The goal is to keep repository knowledge:
- close to the code
- versioned with the code
- easy to route
- split by document type rather than by accident

## Why This Exists

This repository uses a repository-backed documentation tree instead of treating `docs/` as a loose pile of markdown files.

The main principle is:
- if knowledge matters to implementation or operations, it should live in the repository near the code that depends on it

This is the local `harness` idea used here:
- `AGENTS.md` stays short and routing-focused
- `README.md` stays human-facing and high-level
- durable truth is pushed into stable documents under `docs/`
- temporary plans are separated from durable truth
- historical material is preserved without pretending it is current

This repository also treats product thinking as part of the harness.
That means:
- product assumptions should be documented, not kept implicit
- strategic backlog expansion should be informed by competitor research
- the repository should preserve not only code decisions, but also good decision-making rules

## Scope

This file describes:
- the actual documentation contract currently used in this repository
- the current directory split and routing rules
- the precedence and lifecycle rules that contributors should follow here

This file does not try to be:
- a generic documentation handbook for every repository
- a substitute for `AGENTS.md`
- a substitute for the durable documents it routes to

## Core Rules

### 1. `AGENTS.md` is a router, not an encyclopedia

Use `AGENTS.md` to answer:
- what this repository is
- what is running now
- which documents are authoritative
- which files are dangerous to change
- how an incoming agent should orient itself

Do not turn `AGENTS.md` into:
- a complete architecture document
- a changelog
- a product spec archive
- a dump of every operational edge case

If a topic starts growing, move the durable detail into the right document under `docs/`.

### 2. `README.md` is for humans first

Use `README.md` to give a high-level entry point:
- what the system does
- what is already implemented
- how to run it locally
- where to find deeper truth

Do not use `README.md` as the primary operational source of truth.

### 2a. Change granularity matters

Different root documents have different jobs.

- `AGENTS.md`
  - routing
  - safety rules
  - current-state summary
- `README.md`
  - human entry point
  - local setup
  - feature overview
- `docs/index.md`
  - documentation navigation
  - section rules
- `docs/architecture/*`
  - durable technical truth
- `docs/operations/*`
  - live operational truth
- `docs/product/*`
  - prioritization and product intent

Do not copy the same explanation into all of them.

Use this rule:
- explain once in the most specific durable doc
- summarize briefly in routing docs only when needed

### 3. `docs/` is split by document role

The top-level sections are intentional:

- `docs/architecture/`
  Durable implementation truth.
- `docs/operations/`
  Live production and deployment truth.
- `docs/product/`
  Prioritization and scope.
- `docs/plans/`
  Temporary execution documents.
- `docs/historical/`
  Old references that must not drive current decisions.

This prevents several common failures:
- product backlog mixed with operational runbooks
- historical rollout notes treated as current procedure
- temporary plans fossilizing into fake source-of-truth docs

### 4. Durable truth lives beside the codebase, not outside it

If a contributor or agent needs a fact to safely change code, that fact should be representable in the repository.

Examples:
- runtime topology
- health endpoint semantics
- rollout procedure
- agent lifecycle semantics
- current product mode and roadmap split

If the fact only lives in chat, memory, or an external note, it is not reliable enough for automated contributors.

### 5. Temporary plans must not pretend to be permanent truth

Use `docs/plans/active/` for:
- implementation plans
- migration sequences
- staged rollout checklists

When a plan is no longer active:
- move it to `docs/plans/completed/` if it still has reference value
- or delete it after durable conclusions have been absorbed into architecture, operations, or product docs

### 6. Historical documents must be explicitly quarantined

Historical files stay in `docs/historical/`.

They may be useful for:
- context
- templates
- understanding prior rollout phases

They must not be treated as active operating instructions.

## Source-Of-Truth Precedence

When sources disagree, use this order.

1. code and executable config
2. the most specific durable document for that topic
3. the more general routing or summary document
4. historical documents

In practice:
- Prisma schema beats architecture prose about stored fields
- `docs/operations/production-topology.md` beats `README.md`
- `docs/operations/runbook.md` beats changelog prose for current procedure
- `docs/product/lean-roadmap.md` beats a stale task note in `historical/`

Routing rule:
- specific durable docs beat general durable docs
- durable docs beat plans after the plan has been absorbed
- plans beat nothing by default; they are temporary working documents

## Reading Strategy For External Agents

If you are an external AI agent entering this repository, read in this order:

1. `AGENTS.md`
2. `README.md`
3. `docs/index.md`
4. the relevant durable source-of-truth file for the task

Then narrow further:

- architecture question:
  - `docs/architecture/system-overview.md`
- live production or deployment question:
  - `docs/operations/production-topology.md`
  - `docs/operations/runbook.md`
  - `docs/operations/agent-deployment-kit.md`
- prioritization question:
  - `docs/product/lean-roadmap.md`
  - `docs/product/strategic-roadmap.md`
- historical context only:
  - `docs/historical/*`

Do not start from historical docs.
Do not treat roadmap docs as implementation truth.
Do not treat README as the final source when a more specific document exists.

## Update Rules

When code changes, update the matching document type in the same work unit.

Examples:

- API shape, execution flow, protocol semantics:
  - update `docs/architecture/`
- rollout steps, host roles, backup/restore, edge restrictions:
  - update `docs/operations/`
- priority, scope, product-mode decision:
  - update `docs/product/`
- temporary implementation sequencing:
  - create or update a doc in `docs/plans/`

The minimum standard is:
- if behavior changed, the durable doc must change
- if operating procedure changed, the runbook/topology doc must change
- if product priority changed, the roadmap doc must change
- if a strategic feature is proposed, the relevant product doc should record why existing tools do not already solve the problem well enough

## Documentation Update Policy

The minimum acceptable update policy in this repository is:

### Required updates

Update docs in the same change when:
- an API shape changes
- a runtime role changes
- deploy or rollback procedure changes
- operational ownership or host topology changes
- a new monitor capability or protocol behavior is introduced
- product prioritization or product-mode policy changes
- a temporary plan becomes completed and its conclusions become durable truth

### Usually not required

Documentation updates are usually not required for:
- typo-only code changes
- refactors with no behavior, contract, or operational impact
- purely local test maintenance with no new repository rule

### Required follow-through

If a task changes behavior and no durable doc is updated, the task is incomplete.

## What Belongs Where

### Put it in `docs/architecture/` when it answers:
- how does the system work
- what are the runtime responsibilities
- what data is stored
- what does this protocol/flow mean
- what are the security boundaries

### Put it in `docs/operations/` when it answers:
- what is deployed right now
- how do we roll it out or back
- how do we verify health
- how do we back up or restore
- what host plays what role

### Put it in `docs/product/` when it answers:
- what should be built next
- what is intentionally postponed
- what is in lean mode vs strategic mode
- what scope belongs to the product

### Put it in `docs/plans/` when it answers:
- how exactly are we going to do this specific change
- what is the staged sequence for this active body of work

## Plan Lifecycle

Plans are allowed, but they must stay temporary.

### `docs/plans/active/`

Put a plan here when:
- the work is currently in progress
- the staged sequence matters to execution
- the document still influences what happens next

### `docs/plans/completed/`

Move a plan here when:
- the execution is finished
- the plan still has reference value
- durable conclusions have already been copied into architecture, operations, or product docs

### Delete the plan instead of archiving it when:
- it has no lasting reference value
- it was only scratch coordination
- all meaningful decisions are already preserved elsewhere

### Garbage-collection rule

Do not leave old plans in `active/`.
If a plan is no longer driving work, either:
- move it to `completed/`
- or delete it

### Put it in `docs/historical/` when it answers:
- how was an older migration handled
- what template existed before the current model

## Anti-Patterns

Do not do these:

- add new root-level roadmap files casually
- leave active truth in a historical document
- duplicate the same rules in `AGENTS.md`, `README.md`, and `docs/operations/runbook.md`
- store an execution plan forever in the same place as durable architecture docs
- keep stale file names after a structural move
- expand the strategic roadmap only from internal enthusiasm without checking competitors or adjacent open-source tools first

## Conflict Resolution

If code and docs disagree:
- trust code first
- identify the most specific durable document that should own the truth
- repair that document
- then repair routing documents like `AGENTS.md` or `docs/index.md` if needed

If two docs disagree:
- prefer the more specific durable doc over the more general one
- example:
  - `docs/operations/production-topology.md` beats `README.md`
  - `docs/architecture/system-overview.md` beats a roadmap document

If a plan and a durable doc disagree:
- prefer the durable doc unless the plan is the explicit active migration authority for an in-flight change
- once the change is complete, repair the durable doc and stop relying on the plan

## Current Applied Shape In This Repository

The current structure is:

- `AGENTS.md`
  top-level routing and safety rules
- `README.md`
  human entry point
- `docs/index.md`
  documentation index and section policy
- `docs/architecture/system-overview.md`
  durable system behavior
- `docs/operations/*`
  live production and operational truth
- `docs/product/*`
  lean and strategic product direction
- `docs/historical/*`
  quarantined older rollout material

This is the documentation contract that future contributors should preserve unless there is a strong reason to evolve it.

## Product Discovery Rule

Strategic product work in this repository should start with market context, not just invention.

Minimum rule before adding or promoting a strategic epic:
1. inspect direct or adjacent competitors
2. identify what is already commodity
3. identify what this repository can differentiate on
4. record whether the right move is:
   - build
   - postpone
   - narrow the scope
   - or avoid building because the market already solved it well enough

This rule exists because the project is partly educational.
It is meant to preserve good product-owner behavior for future contributors, not just good code hygiene.
