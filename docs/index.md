# Docs Index

This directory is the repository-backed documentation tree for `uptime-monitor-v2`.

Use it as the stable navigation layer between the short root documents and the detailed source-of-truth references that live beside the code.

## Reading Order

For an AI agent or operator entering the repository:
1. `AGENTS.md`
2. `README.md`
3. `docs/index.md`
4. `docs/architecture/harness-documentation-model.md`
5. `docs/architecture/harness-documentation-template.md` when you need the reusable pattern rather than this repository's exact implementation
6. the specific document for the current task

## Sections

### `architecture/`

Long-lived technical truth about how the system works.

Current source-of-truth documents:
- `docs/architecture/harness-documentation-model.md`
- `docs/architecture/harness-documentation-template.md`
- `docs/architecture/system-overview.md`
- `docs/architecture/ui-design-system.md`

Use this section for:
- runtime model
- execution flow
- data model
- security boundaries
- protocol semantics

### `operations/`

Live operational truth for production and managed hosts.

Current source-of-truth documents:
- `docs/operations/production-topology.md`
- `docs/operations/runbook.md`
- `docs/operations/agent-deployment-kit.md`
- `docs/operations/changelog-operations.md`
- `docs/operations/project-pause-snapshot.md`
- `docs/operations/returning-to-project.md`

Use this section for:
- current host roles
- rollout and rollback procedures
- backup and restore
- TLS, edge, and runtime operations
- returning after a pause
- operational history with real production impact

### `product/`

Current and future product direction.

Current documents:
- `docs/product/lean-roadmap.md`
- `docs/product/strategic-roadmap.md`

Use this section for:
- prioritization
- scope boundaries
- lean vs growth mode

### `plans/`

Temporary execution plans.

Structure:
- `docs/plans/active/`
- `docs/plans/completed/`

Use this section for:
- feature execution plans
- migration checklists
- temporary implementation sequencing

Rules:
- keep plans short-lived
- move completed plans to `completed/` or delete them once absorbed into durable docs

Current active plans:
- none at the moment

Current completed plans:
- `docs/plans/completed/design-system-v1.md`

### `historical/`

Historical references that should not drive current decisions.

Current contents:
- `docs/historical/v2-task-tracker.md`
- `docs/historical/v2-rollout-plan.md`
- `docs/historical/v2-rollback-runbook.md`
- `docs/historical/v2-canary-signoff.md`
- `docs/historical/v2-issues-seed.md`

Use this section only for:
- historical context
- template reuse
- understanding how older rollout phases were approached

## Documentation Policy

- Keep `AGENTS.md` short and routing-focused.
- Keep `README.md` human-facing and high-level.
- Put durable implementation truth in `docs/architecture/`.
- Put live operational truth in `docs/operations/`.
- Put prioritization and scope in `docs/product/`.
- Put temporary work planning in `docs/plans/`.
- Put outdated but potentially useful material in `docs/historical/`.

If code and docs disagree:
- trust code first
- then repair the relevant source-of-truth document
