# Harness Documentation Template

This document is a reusable template for repositories that want a repository-backed documentation model for human and AI contributors.

It is intentionally generic.
For the concrete implementation used in this repository, read:
- `docs/architecture/harness-documentation-model.md`

## Goal

The goal of a harness-style documentation tree is to keep important repository knowledge:
- close to the code
- versioned with the code
- easy to route
- split by document role instead of growing accidentally

The model is useful when a repository wants:
- external AI agents to orient themselves safely
- humans to find durable truth quickly
- product and operational decisions to live next to code instead of in chat or private notes

## Core Principles

### 1. Keep routing docs short

Use:
- `AGENTS.md` for agent routing and safety
- `README.md` for humans and local setup
- `docs/index.md` for documentation navigation

Do not turn routing docs into encyclopedias.

### 2. Split `docs/` by role

A good default shape is:

```text
docs/
  index.md
  architecture/
  operations/
  product/
  plans/
    active/
    completed/
  historical/
```

Suggested roles:
- `architecture/`
  - durable technical truth
- `operations/`
  - live deployment and operational truth
- `product/`
  - prioritization, scope, and product policy
- `plans/`
  - temporary execution documents
- `historical/`
  - quarantined old material that should not drive current decisions

### 3. Durable truth belongs in the repository

If a fact is required to:
- change code safely
- operate production safely
- make product decisions consistently

then it should exist in the repository in a durable document.

If the fact exists only in:
- chat
- memory
- an external note no contributor can reliably discover

then it is not a safe source of truth for agentic work.

### 4. Product thinking is part of the harness

If the repository tracks roadmap and scope in-repo, preserve decision quality too.

That means:
- product assumptions should be written down
- strategic epics should be informed by a lightweight competitor scan
- backlog changes should capture why the feature belongs in this repository

## Source-Of-Truth Precedence

Use this order when sources disagree:

1. code and executable configuration
2. the most specific durable document for the topic
3. the more general routing or summary document
4. historical material

Examples:
- runtime config beats README text
- a deployment runbook beats a product roadmap for operational behavior
- a specific architecture doc beats a broad overview page

## Documentation Update Policy

Use this default rule:

### Update docs in the same work unit when:
- behavior changes
- an API contract changes
- runtime topology changes
- deployment or rollback steps change
- security boundaries change
- product scope or prioritization changes

### Usually do not require doc updates for:
- typo-only code changes
- behavior-neutral refactors
- local test-only cleanup with no repository-wide impact

### Completion rule

If the task changes durable behavior and no durable doc is updated, the task is usually incomplete.

## Change Granularity Rules

Avoid duplication by giving each file a specific job.

### `AGENTS.md`

Good for:
- route-in instructions
- safety rules
- current state snapshot
- authoritative document order

Not good for:
- full architecture explanations
- full runbooks
- full product specs

### `README.md`

Good for:
- what the project is
- how to run it locally
- what is implemented
- where to read more

Not good for:
- live production truth
- detailed migration procedure

### `docs/index.md`

Good for:
- documentation navigation
- section responsibilities
- section-level policy

### Specific durable docs

Good for:
- the actual detailed truth

Rule:
- explain once in the most specific durable document
- summarize elsewhere only when routing requires it

## Plan Lifecycle

Plans should exist, but stay temporary.

### `docs/plans/active/`

Use for:
- in-flight implementation plans
- migration sequences
- staged rollout checklists

### `docs/plans/completed/`

Move a plan here when:
- work is done
- the plan still has reference value
- durable conclusions are already preserved elsewhere

### Delete a plan when:
- it has no lasting reference value
- it was only scratch coordination
- its content has been fully absorbed into durable docs

### Garbage-collection rule

Do not leave stale plans in `active/`.

## Conflict Resolution

If code and docs disagree:
- trust code first
- identify the most specific durable document that should own the truth
- repair that document
- then repair routing docs if needed

If two docs disagree:
- prefer the more specific durable doc

If a plan disagrees with a durable doc:
- treat the plan as temporary execution guidance only while the change is actively in flight
- once complete, update the durable doc and stop relying on the plan

## Product Discovery Rule

Before promoting a new strategic epic, use a lightweight competitor scan.

Minimum rule:
1. inspect direct or adjacent tools
2. identify what is already commodity
3. identify where this repository can differentiate
4. record whether the right move is:
   - build
   - narrow
   - postpone
   - or deliberately not build

This prevents repositories from growing by imitation instead of by purpose.

## Recommended Reading Order For External Agents

1. `AGENTS.md`
2. `README.md`
3. `docs/index.md`
4. the relevant durable source-of-truth document
5. plans or historical docs only if needed

Do not start from historical docs.
Do not treat a roadmap as implementation truth.
Do not treat README as the final authority when a more specific doc exists.
