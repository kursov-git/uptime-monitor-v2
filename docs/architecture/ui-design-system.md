# UI Design System

This document is the durable source of truth for the current UI language of `uptime-monitor-v2`.

It supersedes the temporary execution sequencing that originally lived in `docs/plans/active/design-system-v1.md`.
The completed execution record now lives in `docs/plans/completed/design-system-v1.md`.

## Status

As of 2026-03-20, the first full UI design-system rollout is implemented across the main product surfaces.

Covered surfaces:
- app shell and top navigation
- monitor dashboard
- monitor form modal
- monitor history
- agents
- settings
- users
- audit log
- notification history
- login
- public status page

## Design Direction

Working direction: `light calm ops`

The UI should feel like an operator tool first:
- quiet surfaces
- clear hierarchy
- low visual noise
- fast scanability
- explicit semantics for health and danger states

It should not feel like:
- a dark analytics dashboard
- a marketing site
- an enterprise control matrix with overloaded chrome

## Core Rules

### 1. One Product

All authenticated pages and the public status page should feel like the same product.

That means shared rules for:
- page headers
- section cards
- summary cards
- monitor and agent cards
- chips
- buttons
- forms and modals

### 2. Soft Surfaces, Sharp States

Base surfaces stay light and restrained.
Operational meaning comes from state treatment, not from decorative styling.

Rules:
- green is the healthy/product accent
- red is reserved for destructive or down states
- amber is reserved for warning or degraded states
- neutral gray covers paused, unknown, and support text

### 3. Scan First

Every major page should let an operator answer these quickly:
- what is healthy
- what needs attention
- what belongs together
- what action is safe to take next

### 4. Quiet Controls

Controls should be readable but not louder than the data they act on.

Rules:
- icon actions should be grouped
- destructive actions must remain visually distinct
- compact action rails are preferred over scattered buttons
- text labels should be short and calm

### 5. Progressive Density

Overview screens stay readable.
Details expand into:
- a lower panel
- a detail page
- a modal

Do not front-load all depth into first glance.

## Visual Tokens

These are implementation-level rules, not a marketing palette.

### Backgrounds

- app shell background: light gray-green
- primary surface: white / near-white
- grouped section surface: soft tinted white
- elevated surface: white with stronger shadow

### Structure

- radii favor `14 / 16 / 20 / 24 / 28`
- borders stay low-contrast
- shadows stay soft and broad, not sharp
- spacing should prefer tighter vertical rhythm over oversized whitespace

### Typography

- page titles are large and compact
- section titles are strong but quieter than page titles
- support copy stays muted
- labels and chips use smaller uppercase or near-uppercase utility styling sparingly

## Current Component Grammar

### App Shell

The authenticated shell consists of:
- a light header block
- a small product kicker
- a compact user/meta area
- a pill-based nav row

### Summary Cards

Used for:
- monitor totals
- healthy vs attention counts
- public checks
- SSL watched
- agent totals

Rules:
- small muted label
- one dominant number
- minimal supporting copy

### Section Cards

Used for:
- monitor service groups
- settings sections
- history panels
- agent/operator blocks

Rules:
- rounded
- softly elevated
- compact header
- lightweight summary pills

### Entity Cards

Used for:
- monitor cards
- agent cards

Rules:
- entity name remains the primary readable text
- operational state is visible but not visually noisy
- actions are grouped
- metadata chips are secondary
- metrics are compact and readable

### Forms and Modals

Rules:
- sectioned form layout
- visible helper text where needed
- safe footer actions
- closing outside the modal must not discard work

### Time Range Controls

Rules:
- time range controls should keep relative and absolute editing as first-class modes
- applying a relative window should preserve the relative inputs when the control is reopened
- primary apply actions must remain visually obvious next to dismissive actions such as `Close`
- quick ranges can coexist with custom `From` and `To`, but the control should not silently switch input modes after apply
- chart-driven zoom should update the same range model instead of creating a parallel filter state

## Monitor Dashboard Rules

The monitor dashboard is the canonical authenticated overview surface.

Rules:
- monitors are grouped by lightweight `serviceName`
- section headers stay compact
- summary pills stay quiet
- monitor name must remain readable
- monitor URL should remain visible as a single-line support field where possible
- actions should live in a grouped utility rail
- monitor status can be represented by compact semaphores or dots when text is redundant

## Public Status Rules

The public status page is the visual reference for calm presentation, but not every internal page should copy it literally.

Carry over:
- light shell
- soft cards
- compact summary
- strong spacing rhythm
- clear status semantics

Do not copy blindly:
- public wording into internal operator flows
- status-only layouts where internal pages need management controls

## Monitor History Rules

The monitor history page is the canonical detail surface for operational investigation.

Rules:
- the top range control supports both relative and absolute `From`/`To` inputs
- drag on the response-time chart should zoom the same range state used by the picker
- double-click on the chart should reset zoom
- long windows should stay responsive by sampling chart data before rendering, while tabular check results remain paginated separately
- `Check Results` should expose an explicit `Rows` selector alongside page navigation
- chart labels should get sparser and more semantic as the window expands

## Delivered Rollout Result

The first full pass delivered:
- unified light app shell
- public and authenticated surfaces with one visual grammar
- redesigned monitor dashboard and monitor cards
- redesigned detail/admin pages
- aligned login surface

Remaining changes should be treated as normal incremental polish, not as a second foundational redesign.

## Change Rules

When updating UI after this point:
- reuse the existing component grammar first
- avoid page-local one-off styles unless necessary
- prefer tightening spacing and hierarchy over adding new decorative treatment
- update this document only when the durable visual rules change

If a change is only an implementation sequence or temporary redesign step, document it in a plan file instead of here.
