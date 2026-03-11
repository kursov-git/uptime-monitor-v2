# Roadmap

This is the active product roadmap for `uptime-monitor-v2`.

It reflects the current product direction:
- primary focus: uptime monitoring
- secondary focus: light operational context around hosts and agents
- target usage: personal operations and internal demo to management
- complexity bias: keep the product sharp and useful, avoid early enterprise sprawl

For implementation and operational truth, also read:
- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/PRODUCTION_TOPOLOGY.md`
- `docs/OPERATIONS_RUNBOOK.md`

## Product Direction

The product is evolving from a basic internal uptime dashboard into a compact monitoring platform with:
- remote execution through agents
- cleaner operations and incident handling
- a public-facing status surface
- richer alerting

The product is not currently aiming to become:
- a full CMDB
- an enterprise multi-tenant SaaS
- an incident management suite on the level of PagerDuty/Jira/Statuspage

## Current Baseline

Already delivered:
- monitor CRUD and history
- builtin worker and remote agent execution
- split control-plane runtime
- agent registration, rotation, revocation, deletion
- agent version reporting
- Telegram and Zulip notifications
- audit log and notification history
- runtime health endpoints
- SQLite backup/restore scripts
- production-ready split control plane

This baseline is good enough to build product-facing features on top without more foundational rewrites first.

## Recently Delivered

### Rich Telegram Notifications

Status:
- delivered

Delivered scope:
- monitor alerts include clearer state transitions
- monitor alerts include agent attribution or `builtin worker`
- deep links use configurable `appBaseUrl`
- agent OFFLINE alerts are sent through the same notification stack
- notification settings update responses no longer leak raw secrets
- end-to-end flow was verified against a real remote agent in production

## Now

These are the highest-priority roadmap items for the next iteration.

### 1. Scheduled Maintenance Windows

Goal:
- suppress alerts and clearly mark monitors/services during planned work

Why now:
- monitoring without maintenance windows becomes noisy quickly
- necessary for real operational use
- highest operator value among the remaining `Now` items

Scope:
- create maintenance windows manually
- support scheduled windows
- support recurring windows
- show maintenance state in the internal UI
- suppress or alter alert behavior during maintenance
- record changes in audit log

Out of scope for this phase:
- highly complex calendars
- approval workflows

Success criteria:
- operators can schedule windows in advance
- alerts are suppressed correctly during those windows
- monitor state remains understandable in the UI

### 2. Incident Management Lite

Goal:
- make outages and recoveries first-class product events

Why now:
- status pages and alerting become much more coherent with incident objects
- this adds visible product maturity without becoming heavy process software
- more leverage after maintenance semantics are in place

Scope:
- auto-open incident on DOWN
- auto-close on recovery
- timeline of important events:
  - incident opened
  - notifications sent
  - agent/source context
  - recovery
  - acknowledge event
- simple incident list and detail page

Out of scope for this phase:
- postmortem workflows
- deep collaboration tooling
- severity matrices and escalation engines

Success criteria:
- every meaningful outage can be inspected as one coherent event
- operator no longer has to reconstruct history from raw check rows only

### 3. Public Status Page

Goal:
- one public status page for the whole monitored estate

Why now:
- strong demo value
- immediately understandable to non-technical stakeholders
- natural external-facing companion to the internal dashboard
- best built after maintenance and incidents exist

Scope:
- one shared public page, not multiple status pages
- selected monitors only
- current status by monitor/service
- simple uptime summary
- recent incidents or recent status changes
- stable public slug

Out of scope for this phase:
- multiple status pages
- custom domains
- advanced branding

Success criteria:
- an operator can choose what is visible publicly
- a public viewer can see current service health without auth
- page remains usable on mobile and desktop

## Now: Epics And User Stories

This section turns the `Now` block into delivery-ready product epics.

### Epic B: Scheduled Maintenance Windows

Outcome:
- operators can plan maintenance without generating false or noisy alerts

Primary user stories:
- as an operator, I want to schedule a maintenance window ahead of time so alerts are suppressed during planned work
- as an operator, I want recurring maintenance windows so I do not recreate routine maintenance manually
- as an operator, I want monitors in maintenance to be visibly marked so the current state is understandable
- as an auditor, I want maintenance actions logged so I can see who changed what

Acceptance shape:
- one-time and recurring windows
- monitor or monitor-group assignment model to be decided during design
- alert suppression must be deterministic

### Epic D: Incident Management Lite

Outcome:
- downtime becomes a first-class product object instead of being reconstructed from raw checks

Primary user stories:
- as an operator, I want an incident to open automatically on downtime so I do not need to track outages manually
- as an operator, I want the incident to close automatically on recovery so the lifecycle is complete
- as an operator, I want a simple timeline of what happened so I can understand the outage quickly
- as an operator, I want to acknowledge an incident so I know it has been seen

Acceptance shape:
- auto-open
- auto-close
- timeline
- acknowledge
- no heavy collaboration workflow yet

### Epic A: Public Status Page

Outcome:
- external viewers can see one clean public status page without authentication

Primary user stories:
- as an operator, I want to choose which monitors appear on the public page so I can control what is exposed
- as a viewer, I want to see current service health quickly so I understand whether the platform is healthy
- as a viewer, I want to see recent incidents or recent state changes so I understand whether there was a recent disruption
- as an operator, I want a stable public link so I can share it internally or in demos

Acceptance shape:
- one public page only
- no login required
- selected monitors only
- mobile-usable layout

## Now: Implementation Backlog

This section is delivery-oriented.
Each epic is broken down into backend, frontend, data, notifications, and testing workstreams.

### Epic B Backlog: Scheduled Maintenance Windows

#### Product decisions
- support one-time windows
- support recurring windows
- decide exact target scope:
  - monitor-level only
  - monitor groups/tags later

#### Backend
- add maintenance window model and recurrence fields
- implement maintenance matching logic against current time
- make alerting aware of maintenance windows
- decide monitor status semantics during maintenance:
  - suppressed alert only
  - visible maintenance state in status outputs
- add audit events for create/update/delete

#### Frontend
- add maintenance window CRUD UI
- show active/upcoming maintenance in operator views
- visually mark monitors under active maintenance

#### Data / schema
- maintenance window table
- recurrence representation
- possibly future-proof with timezone-safe storage rules

#### Tests
- recurrence evaluation tests
- suppression behavior tests
- audit tests
- UI tests for create/edit/delete flows

#### Docs
- runbook instructions for planned maintenance usage

### Epic D Backlog: Incident Management Lite

#### Product decisions
- incident lifecycle is automatic
- acknowledgement is manual
- no complex severity/escalation yet

#### Backend
- add incident model
- open incident when a monitor transitions into downtime
- close incident on recovery
- attach important timeline events
- add acknowledge endpoint and audit event
- connect incidents to public status page payload and monitor detail views

#### Frontend
- add incident list page
- add incident detail page
- add acknowledge action
- show incident snippets on monitor views where useful

#### Data / schema
- incident table
- incident event table or timeline structure
- recovery timestamps and acknowledgement metadata

#### Tests
- incident open/close lifecycle tests
- no-duplicate-open-incident tests
- acknowledge tests
- UI rendering tests

#### Docs
- update architecture and runbook once the incident model exists

### Epic A Backlog: Public Status Page

#### Product decisions
- one public page only
- curated subset of monitors
- no auth
- one stable slug or public path

#### Backend
- add public status page configuration model or settings fields
- add API to manage which monitors are exposed publicly
- add public read-only endpoint for status page payload
- expose current state, simple uptime summary, and recent incidents/state changes
- ensure public endpoint does not leak internal fields

#### Frontend
- add admin UI for choosing public monitors
- add public-facing page with a separate unauthenticated route
- optimize for clean demo presentation and mobile readability

#### Data / schema
- add fields or table for public status page configuration
- define whether monitor exposure is boolean flag or relation-backed selection

#### Tests
- public endpoint contract tests
- auth boundary tests to ensure only the public page is exposed anonymously
- UI tests for monitor selection and public rendering

#### Docs
- update README and runbook when public route is finalized

## Suggested Delivery Sequence

This is the recommended implementation order inside the `Now` bucket.

### Sequence 1
- Scheduled Maintenance Windows

Reason:
- directly reduces false alert fatigue
- highest operational leverage
- clean prerequisite for incident semantics

### Sequence 2
- Incident Management Lite

Reason:
- gives outages a first-class model
- improves operator UX and future demo value

### Sequence 3
- Public Status Page

Reason:
- highest demo value
- benefits from incident and maintenance concepts already existing

## Delivery Slicing Recommendation

To avoid overloading one release, use this slice order.

### Slice 1
- one-time maintenance windows

### Slice 2
- recurring maintenance windows

### Slice 3
- incident open/close lifecycle

### Slice 4
- incident timeline + acknowledge

### Slice 5
- public status page using incidents and selected monitors

## Numbered Execution Backlog

This is the concrete task list for the current `Now` roadmap.
It is meant to be used as a lightweight delivery board.

### Completed: Epic C Rich Telegram Notifications

- [x] T001 Define final Telegram message spec for DOWN / RECOVERED / FLAPPING / AGENT OFFLINE
- [x] T002 Choose canonical deep-link source (`APP_BASE_URL` or equivalent setting)
- [x] T003 Add configuration support for operator-facing base URL
- [x] T004 Implement shared Telegram message builder for monitor events
- [x] T005 Inject agent context into monitor event notifications
- [x] T006 Implement dedicated agent-offline Telegram notification format
- [x] T007 Add or update notification settings UI for link/base URL configuration
- [x] T008 Add unit/integration tests for Telegram message variants
- [x] T009 Update notification documentation with examples

### Epic B: Scheduled Maintenance Windows

- [ ] T010 Finalize maintenance scope for v1: monitor-level windows only
- [ ] T011 Add maintenance window data model
- [ ] T012 Implement one-time maintenance window evaluation
- [ ] T013 Implement recurring maintenance window evaluation
- [ ] T014 Make alerting suppression maintenance-aware
- [ ] T015 Define and implement monitor state rendering during maintenance
- [ ] T016 Add maintenance CRUD API
- [ ] T017 Add maintenance management UI
- [ ] T018 Add audit events for maintenance lifecycle
- [ ] T019 Add recurrence/suppression tests
- [ ] T020 Update ops documentation for maintenance behavior

### Epic D: Incident Management Lite

- [ ] T021 Define incident lifecycle and no-duplicate-open rule
- [ ] T022 Add incident schema and incident event schema
- [ ] T023 Implement auto-open on downtime transition
- [ ] T024 Implement auto-close on recovery
- [ ] T025 Record incident timeline events
- [ ] T026 Add acknowledge endpoint and audit event
- [ ] T027 Add incident list API and detail API
- [ ] T028 Add incident list UI
- [ ] T029 Add incident detail UI with timeline
- [ ] T030 Add incident lifecycle and acknowledgement tests
- [ ] T031 Update architecture and runbook docs for incident model

### Epic A: Public Status Page

- [ ] T032 Finalize public page data model and public route shape
- [ ] T033 Add public visibility configuration for monitors
- [ ] T034 Add public status payload endpoint
- [ ] T035 Add simple uptime summary aggregation for public payload
- [ ] T036 Include recent incidents or recent state changes in public payload
- [ ] T037 Add admin UI for choosing public monitors
- [ ] T038 Build unauthenticated public status page UI
- [ ] T039 Add public endpoint auth-boundary and contract tests
- [ ] T040 Update README and runbook with public page behavior

## Recommended First Sprint

If work starts immediately, the most pragmatic first sprint is:
- T010-T012
- T014-T018

This gives:
- maintenance-window foundation
- first real alert-suppression behavior
- clear operator-facing value without status-page surface area

## Recommended Second Sprint

- T013-T020
- T021-T026

This gives:
- complete scheduled maintenance behavior
- basic incident lifecycle

## Recommended Third Sprint

- T027-T040

This gives:
- incident UI
- public status page
- demo-ready external surface

## Next

These are the next most valuable product features after the `Now` group lands.

### 1. SSL Expiry Monitoring

Goal:
- monitor certificate validity and alert before expiry

Why:
- common real-world operational need
- easy to explain in demos
- complements uptime checks well

Scope:
- days-to-expiry tracking
- warning thresholds
- UI visibility
- alert integration

### 2. TCP Checks

Goal:
- monitor basic service reachability beyond HTTP/HTTPS

Why:
- broadens product usefulness with moderate implementation cost

Scope:
- TCP connect success/failure
- timeout-based result
- port-level monitoring

### 3. Better Assertions

Goal:
- make monitor validation more expressive

Scope:
- better body matching UX
- JSON-focused assertions
- basic field/path assertions

### 4. Agent Fleet Basics

Goal:
- improve operator understanding of remote execution health

Scope:
- desired version vs actual version
- outdated agent indicator
- improved offline diagnostics
- list monitors assigned to an agent
- safe reassignment UX

### 5. DNS / Domain Monitoring

Goal:
- detect DNS and domain-level failures beyond HTTP path checks

Scope:
- DNS resolution failures
- domain expiry later if still justified

## Later

These are valid future directions, but not immediate priorities.

### 1. Lightweight Host / Service Context

Goal:
- preserve just enough infrastructure memory to answer “what runs where”

Important boundary:
- this is support-layer context for monitoring
- it is not a separate infrastructure inventory platform

Possible scope:
- host card
- provider
- geo region
- SSH alias
- notes
- linked agent
- linked monitors

### 2. More Alert Channels

Likely additions:
- email / SMTP
- Slack webhook
- Discord webhook
- generic webhook

### 3. Better Reporting

Possible scope:
- weekly summaries
- monthly summaries
- monitor export
- simple uptime summaries

Note:
- formal SLA reporting is intentionally not near-term

### 4. Broader Check Types

Possible scope:
- DNS deeper checks
- domain expiry
- more advanced auth flows
- richer synthetic-style multi-step checks

## Not Doing Now

These are explicitly not current priorities.

### 1. Full SLA Reporting

Reason:
- too much product and reporting complexity for current stage

### 2. Multi-Tenant / Workspace Platform

Reason:
- the product is currently for single-operator use and internal demo

### 3. Advanced RBAC

Reason:
- current `ADMIN / VIEWER` model is sufficient for now

### 4. Telegram Bot Console

Reason:
- Telegram is valuable as a notification surface now
- a control console adds complexity and product surface too early

### 5. Full Inventory / CMDB Product

Reason:
- monitoring remains the primary product
- operational context should stay lightweight and supportive

### 6. Heavy Browser Synthetic Monitoring

Reason:
- not the right cost/complexity tradeoff yet

## Prioritization Principles

When choosing what to build next, prefer features that:
- improve operator clarity during incidents
- improve demo value without fake polish
- make monitoring more trustworthy
- avoid large architectural rewrites
- keep the product compact

Avoid features that:
- create large operational burden
- require enterprise process before there is demand
- turn the product into a second unrelated product

## Current Suggested Build Order

1. Scheduled maintenance windows
2. Incident management lite
3. Public status page
4. SSL expiry monitoring
5. TCP checks
6. Agent fleet basics
7. Lightweight host/service context
