# Design System v1

Status: completed execution record

Owner: control-plane UI

Scope: app shell, monitor dashboard, monitor detail surfaces, forms, agent/admin pages

This document records the execution plan that delivered the first cohesive design system for `uptime-monitor-v2`.

It is intentionally practical:
- it exists to guide implementation in this repository
- it is not a marketing brand deck
- it is not a generic UI philosophy document
- it is no longer the durable source of truth after rollout completion

Durable follow-up documents:
- `docs/architecture/ui-design-system.md`
- `docs/architecture/system-overview.md`

## Goals

`uptime-monitor-v2` should feel like one product across:
- `Monitors`
- `Monitor History`
- `Agents`
- `Settings`
- `Users`
- `Audit Log`
- `Login`
- public status page at `/status`

The redesign target is not "modern dashboard" in the abstract.
The target is a calm operational interface that is:
- faster to scan
- easier to trust
- easier to extend without page-specific styling hacks

## Product Intent

The product is an operator tool first.

That means the UI should optimize for:
1. status clarity
2. action clarity
3. information hierarchy
4. low visual noise
5. consistency between overview and detail surfaces

It should not optimize for:
- visual novelty for its own sake
- dark-theme aesthetic density
- analytics-dashboard clutter
- enterprise-style control overload

## Design Direction

Working direction: `light calm ops`

Characteristics:
- soft light background instead of heavy dark chrome
- white or near-white surfaces with low-contrast borders
- green as the primary healthy/product accent
- red and amber reserved for operational semantics
- large radii and gentle shadows
- sparse but clear typography hierarchy
- card and section systems that resemble the current public status page more than the older internal dashboard

## Core Principles

### 1. Scan First

Every major screen should let an operator answer these questions quickly:
- what is healthy
- what needs attention
- what belongs together
- what action is safe to take next

### 2. One Visual Grammar

The same visual rules should apply everywhere:
- headers
- cards
- section containers
- chips
- status badges
- action buttons
- forms
- detail panels

### 3. Soft Surfaces, Sharp Semantics

Surfaces should be quiet.
States should be explicit.

This means:
- panels are soft and restrained
- status colors are not decorative
- destructive controls never blend into neutral controls

### 4. Progressive Density

Overview pages should stay readable.
Details should open in:
- a lower section
- a detail page
- a modal

Do not put all operational depth into the first glance.

### 5. Reuse Before Special-Case

When a new page needs a card, panel, chip, or section header:
- reuse an existing primitive
- extend the primitive if necessary
- do not add an ad-hoc local style unless the page is truly unique

## Token Model

Design tokens should be codified in CSS variables and reused, not re-picked per page.

### Backgrounds

- app background: light cool gray-green
- primary surface: white / near-white
- secondary surface: slightly tinted white
- subtle raised surface: soft white with stronger shadow

### Text

- primary text: dark ink
- secondary text: muted slate-green/gray
- muted text: support labels only

### Semantic Colors

- success: green
- danger: red
- warning: amber
- paused: neutral gray
- public/info: mint/soft green

Rules:
- do not use blue as the primary brand accent for new surfaces
- use red only for true destructive/error states
- use amber only for degraded or warning states
- use gray only for paused, unknown, or support states

### Structure

- radius scale: `14 / 16 / 20 / 24 / 28`
- shadow scale:
  - low: light card lift
  - medium: section card
  - high: modal / hero / raised overview
- border color: low-contrast neutral line

### Spacing

- page shell: `24-32px`
- section gap: `16-24px`
- card padding: `16-24px`
- chip gap: `8px`
- form section gap: `18-24px`

### Typography

- page title
- section title
- card title
- body
- support text
- micro label
- metric value

Typography should feel operational and clean, not editorial.

## Primitive Inventory

These are the primitives the redesign should converge toward.

### `PageHeader`

Contains:
- title
- subtitle
- primary action
- optional secondary actions

Used by:
- monitors
- agents
- settings
- users
- audit

### `SummaryCard`

Contains:
- short label
- single strong value
- optional supporting context

Used for:
- total monitors
- need attention
- public checks
- ssl watched
- agent totals

### `SectionCard`

Large rounded container with:
- header
- optional summary chips
- content region

This is the main grouping primitive for:
- service sections
- settings sections
- history panels

### `StatusBadge`

Standard badge for:
- up
- down
- paused
- flapping
- warning
- public

Rules:
- consistent padding
- consistent font weight
- consistent semantic mapping

### `MetaChip`

Short contextual chip for:
- service
- type
- executor
- public visibility
- SSL state
- DNS/TCP/HTTP metadata

### `ActionIconButton`

Quiet by default, readable on light surfaces, visually distinct on hover.

Variants:
- neutral
- success/public
- destructive

### `MetricTile`

Short label plus readable value.

Used inside:
- monitor cards
- agent cards
- detail pages
- form option panels

### `AppModal`

Common modal system for:
- monitor form
- future create/edit flows

Must include:
- stable header
- readable sectioned body
- consistent footer actions
- safe close behavior

### `FormSection`

Common container for a group of related fields.

Contains:
- section title
- optional description
- grouped rows/fields
- optional note/warning/toggle

## Page Patterns

### Overview Pattern

Structure:
1. `PageHeader`
2. `SummaryCards`
3. grouped `SectionCards`
4. entity cards or rows

Used by:
- monitors
- agents

### Detail Pattern

Structure:
1. entity header
2. key stats
3. chart/timeline section
4. secondary event/history sections

Used by:
- monitor history

### Management Pattern

Structure:
1. page header
2. optional filters/actions
3. main table/list card
4. secondary forms or detail panels

Used by:
- users
- audit
- settings

## Page-by-Page Direction

### Monitors

Target:
- the canonical internal overview page
- the page where the new system becomes visually authoritative

Requirements:
- service-grouped sections
- summary row
- readable cards
- clear action hierarchy
- empty states that feel part of the same system

### Monitor History

Target:
- align with public status in clarity
- charts should feel embedded, not pasted in

Requirements:
- clean header
- chart section card
- result rows/tables in the same language as monitor cards
- notifications visually secondary

### Agents

Target:
- management page with attention-first scanning

Requirements:
- summary row
- clear status treatment
- strong grouping of version/ip/geo/load
- less visual clutter than current text-heavy cards

### Settings

Target:
- quiet configuration surface

Requirements:
- section cards
- concise help text
- consistent form hierarchy
- safer button placement

### Users

Target:
- compact administrative list

Requirements:
- table or list-card hybrid
- readable roles and action buttons
- avoid oversized dashboard-style cards unless needed

### Audit

Target:
- high information density without visual chaos

Requirements:
- readable event rows
- clear actor/action/target grouping
- timestamps prominent

### Login

Target:
- belongs to the same product as `/status` and the internal UI

Requirements:
- lighter visual direction
- consistent brand block
- no heavy dark standalone feel

## Interaction Rules

- hover must be visible but quiet
- selected state must be obvious
- destructive actions must never blend into neutral actions
- clicking outside a form modal must not discard work
- chart and timeline hover states must be readable
- mobile layouts must preserve hierarchy, not just avoid overflow

## Phase Plan

### Phase 1: Foundation + Monitors

Deliver:
- tokens and primitive direction in code
- monitor dashboard refinement
- monitor form redesign

### Phase 2: Agents + Monitor History

Deliver:
- shared detail-page pattern
- aligned management surfaces for agents and history

### Phase 3: Settings + Users + Audit + Login

Deliver:
- admin/config pages aligned to the same system

## Current Execution Focus

Active implementation start:
1. codify `Design System v1`
2. redesign `MonitorForm`
3. continue refining `Monitors`
4. use that as the baseline before touching `Agents` or `History`

## Definition Of Done

A page is considered aligned with `Design System v1` when:
- it visually belongs to the same product as `/status`
- status and actions are immediately readable
- no page-specific ad-hoc color system is required
- spacing and hierarchy feel intentional
- mobile layout still communicates priority
- tests are updated for any changed interaction contract

## Non-Goals

Not part of `v1`:
- dark theme
- marketing-site style art direction
- multiple visual themes
- page-specific novelty layouts
- redesigning every charting primitive at once

The goal is a coherent product system, not a style experiment.
