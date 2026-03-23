# Architecture

This document describes the current architecture of `uptime-monitor-v2`.
It is written as an implementation-facing reference, not a marketing overview.

## System Shape

The system has two planes.

### 1. Control Plane

The control plane lives in this repository and consists of:
- Fastify API in `server/`
- React UI in `client/`
- SQLite database managed by Prisma
- optional builtin scheduler worker
- background services for retention and agent offline detection

### 2. Execution Plane

The execution plane consists of remote agents built from `apps/agent/`.
Each agent pulls assigned monitor jobs from the control plane and reports results back.

## Main Components

### Server

Key files:
- `server/src/index.ts`
- `server/src/worker.ts`
- `server/src/routes/*.ts`
- `server/src/services/*.ts`
- `server/src/lib/*.ts`

Key responsibilities:
- auth and RBAC
- monitor CRUD and stats
- SSL expiry warning evaluation and notification dispatch for HTTPS monitors
- notification settings and history
- agent registration and lifecycle management
- public monitor exposure and public status payload generation
- agent jobs, heartbeat, results, SSE stream
- builtin worker execution for unassigned monitors or single-process mode
- retention cleanup
- agent offline reconciliation

### Client

Key files:
- `client/src/App.tsx`
- `client/src/pages/*.tsx`
- `client/src/components/*.tsx`
- `client/src/api.ts`

Key responsibilities:
- operator UI
- auth session handling
- monitor CRUD and history views
- user and notification management
- agent registration and lifecycle management
- unauthenticated public status page rendering at `/status`

Current UI rule:
- durable visual and interaction rules now live in `docs/architecture/ui-design-system.md`
- temporary redesign sequencing should live in `docs/plans/`, not in this architecture document

### Shared Packages

#### `packages/checker`
Shared check engine used by:
- builtin server worker
- remote agent

Current extra responsibility:
- collect HTTPS certificate metadata when SSL expiry monitoring is enabled on a monitor
- execute configured synthetic HTTP checks including raw request bodies for body-capable methods
- execute `TCP` port checks and `DNS` record checks with the same result contract

#### `packages/shared`
Shared TypeScript types and constants used by:
- client
- server
- agent

## Runtime Roles

The backend supports explicit runtime separation through `SERVER_ROLE`.

Allowed values:
- `all`
- `api`
- `worker`
- `retention`
- `agent-offline-monitor`

### `all`
Single-process compatibility mode.
Runs:
- Fastify API
- builtin worker if enabled
- retention service
- agent offline monitor if agent API enabled

### `api`
Runs only:
- Fastify API
- health endpoints
- route handlers

### `worker`
Runs only:
- builtin check scheduler and executor

### `retention`
Runs only:
- retention cleanup loop

### `agent-offline-monitor`
Runs only:
- stale agent reconciliation

## Data Model

Core entities:
- `Monitor`
- `CheckResult`
- `Agent`
- `User`
- `ApiKey`
- `AuditLog`
- `NotificationSettings`
- `MonitorNotificationOverride`
- `NotificationHistory`

Important relationships:
- `Monitor.agentId` is nullable
  - `null` means builtin worker
  - non-null means assigned to a remote agent
- `Monitor` also carries synthetic request configuration for ordinary HTTP/HTTPS checks:
  - `serviceName`
  - `type`
  - `method`
  - `headers`
  - `requestBody`
  - `expectedStatus`
  - `expectedBody`
  - `bodyAssertionType`
  - `bodyAssertionPath`
- `Monitor` also carries a protocol-specific DNS knob:
  - `dnsRecordType`
- `Monitor` also carries optional SSL expiry monitoring config:
  - `sslExpiryEnabled`
  - `sslExpiryThresholdDays`
- `CheckResult.agentId` is nullable
  - preserved historical results survive agent deletion by nulling the relation
- `CheckResult` stores the latest SSL snapshot for the individual execution when available:
  - `sslExpiresAt`
  - `sslDaysRemaining`
  - `sslIssuer`
  - `sslSubject`
- `Agent` has `status`, `lastSeen`, `revokedAt`, and `agentVersion`

## Execution Flow

### Public Status Flow

1. Operator marks a monitor public from the authenticated dashboard.
2. Control plane persists that flag on the `Monitor` record.
3. Anonymous viewers request `GET /api/public/status`.
4. Server returns a read-only payload for public monitors only.
5. Payload includes:
   - current monitor state
   - latest check snapshot
   - 24-hour uptime summary
   - 24 hourly availability buckets
   - lightweight grouping by monitor `serviceName`
6. Client renders `/status` without auth and uses those buckets for:
   - summary pills
   - the 24h availability chart
   - the derived incident timeline strip
   - lightweight service sections
   - per-monitor sparkline and incident strip

### Builtin Worker Flow

1. Server starts with builtin worker enabled.
2. `CheckWorker` schedules active monitors with `agentId = null`.
3. Each check uses `@uptime-monitor/checker` with the monitor's configured type and protocol-specific settings.
4. For `HTTP` monitors, the checker uses the configured method, headers, and raw `requestBody` when the method allows a body.
5. For `TCP` monitors, the checker attempts a socket connection to `tcp://host:port`.
6. For `DNS` monitors, the checker resolves the configured `dnsRecordType` against `dns://hostname`.
7. For HTTPS monitors with SSL expiry enabled, the checker also extracts certificate expiry metadata.
8. Results are stored in `CheckResult`.
9. Flapping and notification logic runs from server-side services.
10. UI receives updates through monitor APIs and SSE.

### Remote Agent Flow

1. Operator registers an agent in the UI.
2. Control plane creates an `Agent` record and returns a one-time token.
3. Operator deploys that token to a real host manually.
4. Agent starts and calls `GET /api/agent/jobs`.
5. Agent opens `GET /api/agent/stream` for live updates.
6. Agent executes assigned checks via `@uptime-monitor/checker`, including protocol-specific handling for `HTTP`, `TCP`, and `DNS`.
7. For HTTP body-capable methods, the agent passes through raw `requestBody` exactly as configured.
8. For HTTPS monitors with SSL expiry enabled, the agent includes certificate expiry metadata in the result payload.
9. Agent batches results to `POST /api/agent/results`.
10. Agent sends liveness to `POST /api/agent/heartbeat`.
11. Server updates `lastSeen`, `status`, and `agentVersion`.
12. Offline monitor service marks stale agents `OFFLINE`.

### SSL Expiry Monitoring Flow

1. Operator enables SSL expiry monitoring on an HTTPS monitor and chooses a threshold in days.
2. Builtin worker or remote agent performs the ordinary HTTP/HTTPS check.
3. If the target uses HTTPS, the checker reads the peer certificate metadata from the TLS socket.
4. Result ingestion persists expiry date, remaining lifetime, issuer, and subject on the related `CheckResult`.
5. Notification logic compares `sslDaysRemaining` to `Monitor.sslExpiryThresholdDays`.
6. When the threshold is crossed, the monitor stays `UP` if the endpoint still passes, but an SSL warning notification is emitted.
7. After certificate renewal, the warning clears and a recovery notification is emitted.

### Synthetic Request Body Flow

1. Operator configures an HTTP/HTTPS monitor with a body-capable method such as `POST`, `PUT`, or `PATCH`.
2. Operator optionally sets:
   - custom headers
   - raw request body
   - body assertion mode and value
3. Validation treats the request body as a plain string and only performs JSON validation when headers explicitly declare `Content-Type: application/json`.
4. Builtin worker or remote agent sends the request body exactly as configured; the checker does not JSON-stringify it a second time.
5. `GET` and `HEAD` monitors do not carry request bodies and clear that field on save.
6. Result evaluation continues to use the ordinary expected-status and body-assertion pipeline.

## Agent Protocol Details

### Jobs bootstrap
Endpoint:
- `GET /api/agent/jobs`

Returns:
- assigned monitors only
- heartbeat interval
- monitor configuration including auth fields and key version

### Results ingestion
Endpoint:
- `POST /api/agent/results`

Behavior:
- validates payload with zod
- enforces rate limiting
- enforces body size limit
- accepts up to 500 results per request
- filters out monitors not assigned to the agent
- deduplicates by `idempotencyKey`
- stores via batched `createMany` with duplicate-safe fallback logic
- accepts optional SSL snapshot metadata for HTTPS checks

### Heartbeat
Endpoint:
- `POST /api/agent/heartbeat`

Behavior:
- updates `lastSeen`
- sets `status=ONLINE`
- persists `agentVersion` when provided
- returns `heartbeatIntervalSec`

### SSE stream
Endpoint:
- `GET /api/agent/stream`

Behavior:
- authenticated per agent token
- supports `Last-Event-ID`
- can request `RESYNC_JOBS`
- used for near-real-time job updates

## Security Model

### User auth
- JWT auth for browser/admin sessions
- browser sessions are carried by `HttpOnly` auth cookies; bearer session tokens remain valid for non-browser tooling
- API keys for read-only access
- admin-only writes for sensitive endpoints
- public status route is intentionally anonymous but must remain read-only and non-sensitive

### Agent auth
- one-time registration token shown only at create/rotate time
- database stores only `tokenHash`
- revoked tokens receive `403`

### HTTPS certificate semantics
- SSL expiry monitoring is advisory and notification-oriented, not a separate availability state machine
- an expiring certificate can produce a warning while the monitor itself remains `UP`
- this keeps certificate hygiene distinct from transport or application outages

### Secret handling
- notification secrets use AES-256-GCM via `server/src/lib/crypto.ts`
- production requires valid encryption configuration
- monitor auth payloads are transmitted to agents in encrypted form when applicable

### JWT boundary
- browser SSE uses the same session boundary as the rest of the web UI: auth cookie or bearer session token
- API keys are valid for ordinary read-only REST APIs but are intentionally rejected for browser SSE endpoints
- `/api/public/status` is intentionally sessionless and must not depend on browser auth

## Logging

Server logging uses Pino.

Current policy:
- development defaults to `pretty`
- production defaults to `json`
- server code should not introduce new `console.*`

Agent logging is still stdout/stderr oriented and systemd/docker captures it.

## Health and Diagnostics

### `/health`
Basic liveness endpoint.
It exists for internal process checks and should be edge-restricted in internet-facing deployments.

### `/health/runtime`
Returns:
- active server role
- runtime feature flags
- status of worker, retention, and agent-offline-monitor services inside the current process
- lightweight runtime telemetry for:
  - browser SSE connections
  - agent SSE connections
  - recent worker scheduling/check activity
  - recent retention cleanup activity
  - recent agent-offline monitor activity

In split runtime mode, the API process reports background roles as not running in that process. That is expected.
External role health should be checked with compose or systemd status.
Like `/health`, this endpoint is operationally useful but not intended to stay publicly reachable from the open internet.

## Deployment Modes

### Legacy single-process compose
- file: `docker-compose.yml`
- includes local `agent` container
- useful for local/demo setups
- not the current recommended production topology

### Current recommended control-plane deployment
- file: `docker-compose.split.yml`
- split services for API, worker, retention, agent-offline-monitor, and client
- this is the current production pattern for the control plane
- `client` rollouts are intentionally decoupled from the API container; `docker compose -f docker-compose.split.yml up -d --build client` should not recreate `server`

### Remote agent deployment
Two patterns exist.

Canonical repository kit:
- docker compose + systemd under `/opt/uptime-agent`
- files under `deployment/agent/`
- scripts under `scripts/install-agent.sh`, `scripts/update-agent.sh`, `scripts/uninstall-agent.sh`
- supports `local-build` and registry-image modes

Current production reality on agent hosts:
- docker compose + systemd in `local-build` mode
- runtime state under `/opt/uptime-agent`
- source checkout on host may be kept under `/home/skris/uptime-agent` for updates

## Known Architectural Constraints

- SQLite remains the production DB
- no Postgres migration path implemented yet
- no full metrics stack yet
- no persistent on-disk queue for agent results
- registry-image mode still depends on an actually reachable image registry

## Main Architectural Invariants

Do not violate these without explicit migration work.

- one monitor has one executor at a time
- `agentId = null` means builtin worker
- agent deletion must not destroy historical results
- split runtime must remain supported
- production env validation must fail early on bad config
- remote agents must remain lightweight in resource usage
