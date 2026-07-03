# Operations Changelog

This file records meaningful operational changes in running environments.
It is intended for future operators and AI agents that need a compact history of what changed in production and on the managed hosts.
It is chronological history, not the current topology source; use `docs/operations/production-topology.md` for current host roles and trusted agent inventory.

## 2026-07-03

### `ruvdsekb` returned to live agent service

Host:
- `ruvdsekb`

Changes:
- verified SSH access to `170.168.1.74:2332`
- backed up the agent install dir and checkout:
  - `/home/skris/uptime-agent-opt-backup-20260703T084032Z.tgz`
  - `/home/skris/uptime-agent-checkout-backup-20260703T084032Z.tgz`
- synced the current agent code subset into `/home/skris/uptime-agent`
- generated a fresh agent token on the host and wrote it to `/opt/uptime-agent/.env`
- updated the control-plane `ruvdsekb` token hash and cleared `revokedAt`
- recorded an `AGENT_TOKEN_ROTATED` audit entry with reason `ruvdsekb-reprovision`
- rebuilt and restarted the local-build `uptime-agent:local` container

Operational result:
- `ruvdsekb` reports `ONLINE` with `agentVersion=1.0.0`
- `/health/runtime` reports `streams.agentSse.currentClients=2`
- the agent currently loads `0` jobs because its only assigned monitor, `Портал дилера`, is inactive
- do not reuse the old revoked token; the live host now uses the fresh token provisioned during this recovery

### `ruvdsekb` snapshot migration rename

Host:
- `ruvdsekb`

Previous identity:
- legacy pre-migration name

Changes:
- verified SSH access on the new IP `170.168.1.74:2332` using the existing admin key
- renamed the guest OS hostname from provider-generated `ruvds-na2tq` to `ruvdsekb`
- updated `/etc/hostname`, `/etc/hosts`, and the local admin key comment
- renamed the local operator SSH alias/key to `ruvdsekb`
- took a control-plane SQLite backup before the production DB rename:
  - `/data/backups/uptime-before-ruvdsekb-rename-20260703T082035Z.db`
- renamed the retained control-plane agent record to `ruvdsekb`
- updated the retained control-plane agent IP to `170.168.1.74`
- recorded an `AGENT_RENAMED` audit entry
- updated repository docs and test fixtures to use `ruvdsekb`

Operational result:
- host-level storage/boot symptoms were no longer present after migration:
  - boot time: `7.290s`
  - IO PSI `full avg10`: `1.88`
  - disk write latency sample: `1.4ms`
- UFW still exposes only `2332/tcp`
- systemd state: `running`
- failed units: `0`
- Docker and `uptime-agent.service` are active locally
- the `uptime-agent` container still restarts because the old token remains revoked and receives `403 {"error":"Agent token revoked"}`
- control-plane record remains `OFFLINE` and revoked; do not reuse the old token

## 2026-06-24

### Security audit and host patch pass

Hosts:
- `onedashmsk`
- `cloudruvm1`
- `ruvdsekb`
- `vultr`

Changes:
- patched `onedashmsk` with `apt-get update`, `full-upgrade`, `autoremove`, and `autoclean`
- installed `onedashmsk` phased `kpartx` and `multipath-tools` updates with `APT::Get::Always-Include-Phased-Updates=true`
- verified `onedashmsk` split-runtime services and `/health/runtime`
- patched `cloudruvm1` with `apt-get update`, `full-upgrade`, `autoremove`, and `autoclean`
- verified `cloudruvm1` `uptime-agent` after the control-plane Docker restart backoff cleared
- checked `ruvdsekb`; it initially timed out, then came back after an apparent hard power-on, was patched to `0` pending apt upgrades, rebooted, and remained revoked/not trusted
- verified `ruvdsekb` after slow boot: reboot required `no`, `dpkg --audit` empty, UFW/fail2ban active, SSH hardening intact, public listener only `2332/tcp`
- found `ruvdsekb` local `uptime-agent.service` failed with timeout after reboot; no agent container was running, and control-plane revoke remained in force
- measured `ruvdsekb` boot at `13min 42.169s` and observed intermittent SSH banner timeouts after boot; do not return it to live use without provider/storage health confirmation, stable boot/SSH behavior, and fresh agent token provisioning
- patched `vultr`; did not reboot it because it was the active operator/Codex runtime host

Operational result:
- `onedashmsk`: pending apt upgrades `0`, reboot required `no`, UFW active and enabled, expected public ports only
- `cloudruvm1`: pending apt upgrades `0`, reboot required `no`, UFW active, `uptime-agent` running
- `ruvdsekb`: pending apt upgrades `0`, reboot required `no`, still revoked in the control plane, slow/unstable SSH behavior observed, local agent service failed timeout
- `vultr`: pending apt upgrades `0`, reboot required `yes`
- public `https://ping-agent.ru/status` and `/api/public/status` returned `200`
- external `/health/runtime` remained denied with `403`

Audit artifact:
- `docs/operations/security-audit-2026-06-24.md`

## 2026-06-12

### Security audit and host patch pass

Hosts:
- `onedashmsk`
- `cloudruvm1`
- `ruvdsekb`
- `vultr`

Changes:
- patched `onedashmsk` with `apt-get update`, `full-upgrade`, `autoremove`, and `autoclean`
- rebooted `onedashmsk` and verified split-runtime services plus `/health/runtime`
- found that `ufw.service` was masked on `onedashmsk` by old cloud-init user-data
- unmasked, enabled, and started UFW on `onedashmsk`
- rebooted `onedashmsk` a second time to prove UFW persistence
- patched `cloudruvm1` with `apt-get update`, `full-upgrade`, `autoremove`, and `autoclean`
- rebooted `cloudruvm1` and verified `uptime-agent`
- checked `ruvdsekb`; SSH to `170.168.1.74:2332` timed out, matching the current revoked/lost host boundary
- patched `vultr`; did not reboot it because it was the active operator/Codex runtime host

Operational result:
- `onedashmsk`: pending apt upgrades `0`, reboot required `no`, UFW active and enabled, expected public ports only
- `cloudruvm1`: pending apt upgrades `0`, reboot required `no`, UFW active, `uptime-agent` running
- public `https://ping-agent.ru/status` and `/api/public/status` returned `200`
- external `/health/runtime` remained denied with `403`

Audit artifact:
- `docs/operations/security-audit-2026-06-12.md`

## 2026-06-11

### `ruvdsekb` agent emergency revoke

Host:
- `onedashmsk`

Affected agent host:
- `ruvdsekb`

Reason:
- `ruvdsekb` should be treated as physically lost and no longer trusted.

Changes:
- took a control-plane SQLite backup before the live DB write:
  - `/data/backups/uptime-20260611T142517Z.db`
- revoked the `ruvdsekb` control-plane agent by setting `revokedAt`
- kept the agent record present for investigation/history
- recorded an `AGENT_REVOKED` audit entry with `manual-incident-response`
- wrote the incident audit:
  - `docs/operations/incident-audit-2026-06-11-ruvdsekb-afc.md`

Production state after revoke:
- agent id: `aeddef30-9d3e-4340-a36c-9183aa13f34f`
- agent status: `OFFLINE`
- `revokedAt`: `2026-06-11T14:26:07.360Z`
- last seen before revoke: `2026-06-11T06:54:26.231Z`
- last seen IP: `170.168.1.74`

Affected monitor inventory:
- one assigned monitor remained on `ruvdsekb`:
  - `Портал дилера`
  - `https://dealer.alutech24.com/ru/orders`
  - `isActive=false`
  - auth method: `CSRF_FORM_LOGIN`
  - stored auth payload contains username/password fields

Operational result:
- the old `ruvdsekb` agent token should now receive `403` on agent routes
- no `CheckResult` rows were present for this agent at the time of review

Follow-up required:
- rotate the external Dealer Portal credentials used by the affected monitor
- provision a replacement agent host before reassigning live monitors to the Kazan location again

## 2026-05-14

### Infrastructure health check and documentation refresh

Hosts:
- `onedashmsk`
- `cloudruvm1`
- `ruvdsekb`

Repository:
- `uptime-monitor-v2`

What was checked:
- all 5 split-runtime services on the control plane: Up + healthy (34h uptime)
- both remote agents: Up 2 weeks, SSE-connected to the control plane
- `/health/runtime` cluster telemetry: all 4 roles present and fresh
- worker: 2 builtin monitors running (`auth.alutech24.com`, `auth.alutech24.by`), all checks passing
- retention: running with 5-day window, 953 records cleaned in last cycle, 0 SQLite busy retries
- agent-offline-monitor: running, 0 agents marked offline
- disk: 76G / 97G (79%) on control plane data volume

Documentation updates:
- `production-topology.md`: added compose project location (`/root/uptime-monitor`), docker volumes, cluster telemetry schema, observed production env vars, claudeops-compatible diagnostic commands
- `runbook.md`: expanded runtime health interpretation with full cluster/stats/caches field reference, added claudeops-specific health check commands
- `docs/historical/architectural-review-2026-05-14.md`: new architectural review with 9 prioritized recommendations

### Claude Code VPS ops access

Hosts:
- `onedashmsk`
- `cloudruvm1`
- `ruvdsekb`

Changes:
- created a dedicated Pi-side SSH key for Claude Code uptime operations
- created the `claudeops` user on all three uptime VPS hosts
- granted `claudeops` `NOPASSWD:ALL` through `/etc/sudoers.d/90-claudeops`
- allowed `claudeops` through the existing `AllowUsers` SSH policy with `/etc/ssh/sshd_config.d/98-claudeops-allowusers.conf`
- added Pi SSH aliases for `uptime-main`, `uptime-agent-cloudruvm1`, and `uptime-agent-ruvdsekb`

Operational result:
- Claude Code on the Pi can deploy and maintain the control plane and remote agents without using the human admin SSH keys
- access remains intentionally broad because these VPS nodes are service nodes without critical local data and can be reprovisioned

Verification:
- `ssh uptime-main 'hostname; whoami; sudo -n true && echo sudo_ok'`
- `ssh uptime-agent-cloudruvm1 'hostname; whoami; sudo -n true && echo sudo_ok'`
- `ssh uptime-agent-ruvdsekb 'hostname; whoami; sudo -n true && echo sudo_ok'`

## 2026-04-20

### Public status latency optimization

Host:
- `onedashmsk`

Repository:
- `uptime-monitor-v2`

Changes:
- moved `/api/public/status` assembly behind a dedicated server-side snapshot service
- replaced raw 24h public-history row replay with hourly SQL aggregation
- added a `5s` in-process cache for the anonymous public payload with stale-while-refresh behavior
- exposed public-status cache telemetry via `/health/runtime`

Operational result:
- anonymous public status requests no longer rebuild the full 24h monitor history on every hit
- operators can distinguish cache hits, cold misses, stale serves, and refresh errors from runtime health data

Verification:
- `server` public-status and contract tests passed
- `server build` passed

### Split-runtime SQLite startup fix

Host:
- `onedashmsk`

Repository:
- `uptime-monitor-v2`

Changes:
- changed the shared server image entrypoint so Prisma migrate + seed run only when `DB_INIT_ON_START=true` or when auto-resolved for `SERVER_ROLE=api/all`
- pinned split-runtime compose defaults to:
  - `server` -> `DB_INIT_ON_START=true`
  - `worker` -> `DB_INIT_ON_START=false`
  - `retention` -> `DB_INIT_ON_START=false`
  - `agent-offline-monitor` -> `DB_INIT_ON_START=false`
- changed split-runtime startup ordering so background roles wait for `server` health before startup
- documented the SQLite split-runtime rule in the README and operations runbook

Operational result:
- background roles no longer fight over SQLite migration locks during container startup
- `worker`, `retention`, and `agent-offline-monitor` can stay up instead of entering restart loops
- builtin-worker history and offline-agent detection can resume normally after rollout

Verification:
- `server` targeted compose/role tests passed
- split compose config rendered successfully

## 2026-03-19

## 2026-03-20

## 2026-03-23

## 2026-04-02

### Monitor history range and chart responsiveness pass

Host:
- `onedashmsk`

Changes:
- fixed monitor-history range correctness for long windows by removing the old effective `1000`-row cap from `/api/monitors/:id/stats`
- kept the monitor history page on the same relative/absolute time-range model instead of forcing applied relative ranges into absolute-only editing on reopen
- restored explicit `Rows` selection for `Check Results`
- added optional server-side sampling for history chart consumers so long windows such as `7 days` stay responsive without changing pagination totals
- kept drag-to-zoom and reset behavior on the response-time chart while reducing browser-side rendering pressure

Operational result:
- `Last 7 days` and other long windows now request the full selected time window instead of silently collapsing to only the newest few hours
- chart rendering stays significantly lighter on long intervals because the browser no longer receives or renders every raw point
- operators can still inspect raw history through paginated ledger rows with a configurable page size

Verification:
- `server` targeted integration and contract tests passed
- `client` targeted `TimeRangeFilter` and `MonitorHistory` tests passed
- `server build` and `client build` passed
- live rollout completed on `onedashmsk`

### Deployment zoo hygiene pass

Repository:
- `uptime-monitor-v2`

Changes:
- removed the legacy root-level `deploy.sh` script so the repository no longer advertises an outdated single-process deployment path
- moved the old root `CODE_REVIEW.md` into `docs/historical/code-review-2026-03-11.md`
- updated agent-facing and operator-facing docs so current deployment truth points only to:
  - `docker-compose.split.yml`
  - `docs/operations/production-topology.md`
  - `docs/operations/runbook.md`

Operational result:
- future operators and AI agents now have one clear deployment story instead of a mixed live/legacy surface
- older technical critique remains available as history without competing with current operational guidance

### Runtime telemetry pass

Host:
- `onedashmsk`

Changes:
- extended internal `/health/runtime` with lightweight operational telemetry instead of introducing a separate metrics stack
- added in-memory browser SSE and agent SSE counters:
  - current clients
  - accepted/rejected/disconnected totals
  - failed writes
  - recent heartbeat/broadcast or publish timestamps
- added recent execution metadata for background roles:
  - worker latest refresh/check status
  - retention latest run/deleted-count status
  - agent-offline monitor latest run/offline-marking status
- documented the new runtime-health payload as part of normal diagnostics

Operational result:
- the operator can now inspect control-plane activity from `/health/runtime` instead of relying only on logs
- the split-runtime control plane remains lean while exposing enough context to investigate reconnect churn or stale background loops

Verification:
- `server` contract tests passed with updated `/health/runtime` shape
- `server build` passed

### SQLite retention pressure mitigation

Host:
- `onedashmsk`

Changes:
- reviewed the split-runtime SQLite write pattern with focus on retention cleanup
- added process-level SQLite session pragmas:
  - `journal_mode=WAL`
  - `synchronous=NORMAL`
  - `busy_timeout=5000`
  - `foreign_keys=ON`
- changed retention cleanup from one large per-table delete to smaller batched deletes
- added bounded retry/backoff on short-lived `SQLITE_BUSY` lock collisions
- extended retention runtime status with:
  - latest delete batch count
  - latest SQLite busy-retry count

Operational result:
- the control plane remains on SQLite but now yields more gracefully during retention cleanup
- lock contention during retention should be easier to survive and easier to diagnose from `/health/runtime`

Verification:
- `server` retention tests passed with batched cleanup and busy-retry coverage
- `server` contract tests passed with the extended retention status shape
- `server build` passed

### SSE hardening pass

Host:
- `onedashmsk`

Changes:
- added SSE-specific nginx proxy handling for:
  - `/api/monitors/stream`
  - `/api/agent/stream`
- disabled proxy buffering and cache for SSE paths
- extended SSE proxy timeouts for long-lived connections
- added route-level SSE headers:
  - `Cache-Control: no-cache, no-transform`
  - `X-Accel-Buffering: no`
- changed agent reconnect behavior from fixed delay to bounded backoff with jitter
- extended runtime telemetry with SSE churn indicators:
  - latest accept/reject/disconnect timestamps
  - replay request counts
  - stale replay counts

Operational result:
- long-lived SSE connections should be less vulnerable to proxy buffering and timeout surprises
- reconnect storms are easier to identify from `/health/runtime`
- remote agents no longer retry SSE in a tight fixed loop during transient failures

Verification:
- `edge-config` tests passed with explicit SSE proxy expectations
- `server` contract tests passed with extended SSE runtime telemetry shape
- `server` build and `agent` build passed

### Design System v1 rollout close-out

Host:
- `onedashmsk`

Changes:
- completed the first cohesive `Design System v1` rollout across authenticated UI and public status surfaces
- unified the app shell, top navigation, monitor dashboard, monitor history, agents, settings, users, audit log, notification history, and login under the same light `calm ops` language
- reworked monitor cards multiple times to improve operator scanability:
  - grouped actions into a dedicated utility rail
  - reduced action and metadata noise
  - made monitor name and URL readability explicit design goals
  - compacted service sections and summary pills
- promoted the finished design language into durable documentation and moved the original execution doc into `docs/plans/completed/`

Operational result:
- the main operator surfaces now feel like one product instead of a mix of legacy dashboard styles
- client-only design rollouts continued to avoid recreating `uptime-server-api`

Verification:
- repeated `client` test/build passes remained green during the redesign sequence
- each rollout was performed with `docker compose -f docker-compose.split.yml up -d --build client`
- `uptime-server-api` container identity remained unchanged during client-only deploys

### TCP and DNS monitor rollout

Host:
- `onedashmsk`

Related agent hosts:
- `cloudruvm1`
- `ruvdsekb`

Changes:
- deployed first-class monitor `type` support with `HTTP`, `TCP`, and `DNS`
- added `dnsRecordType` to monitor configuration
- extended shared checker, builtin worker, remote-agent jobs, and public status payloads to carry the new monitor contract
- updated monitor form and cards so protocol-specific settings are shown conditionally instead of mixing HTTP-only fields into all monitors

Operational result:
- operators can now create compact `TCP` checks using `tcp://host:port`
- operators can now create `DNS` checks using `dns://hostname` plus a record type
- builtin worker and remote agents execute the same protocol-specific check logic

Verification:
- local builds passed for `packages/shared`, `packages/checker`, `apps/agent`, `server`, and `client`
- full test suites passed for `server` and `client`
- contract snapshots updated to include `type` and `dnsRecordType`

## 2026-03-19

### Synthetic request body rollout

Host:
- `onedashmsk`

Related agent hosts:
- `cloudruvm1`
- `ruvdsekb`

Changes:
- deployed monitor-level raw `requestBody` support for ordinary synthetic HTTP/HTTPS checks
- extended control-plane CRUD, validation, builtin worker, remote-agent jobs, and shared checker contract
- enabled JSON validation when monitors declare `Content-Type: application/json`
- updated the live `https://stat.alutech24.com/api/send` monitor to use a JSON payload plus JSON-path response assertion

Backups taken before rollout:
- `/var/lib/docker/volumes/uptime-monitor_db-data/_data/backups/uptime-20260319T124117Z-request-body.db`
- `/var/lib/docker/volumes/uptime-monitor_db-data/_data/backups/uptime-20260319T124756Z-request-body-retry.db`

Operational result:
- body-capable monitors can now send raw request payloads instead of method-only probes
- the `stat.alutech24.com/api/send` monitor moved from repeated `400` responses to successful `200` checks after payload rollout and agent job refresh
- both remote agent hosts were rebuilt so their local checker contract matches the control plane

Verification:
- `Monitor.requestBody` exists in the production SQLite schema
- `uptime-server-api` returned to `healthy`
- direct `performCheck(...)` on `cloudruvm1` returned `200`
- latest production `CheckResult` rows for `https://stat.alutech24.com/api/send` show `isUp=1`, `statusCode=200`

## 2026-03-13

### SSL expiry monitoring rollout

Host:
- `onedashmsk`

Changes:
- deployed HTTPS certificate expiry monitoring for ordinary HTTPS monitors
- added persisted SSL snapshot fields to `CheckResult`
- enabled warning and recovery notifications for expiring certificates
- updated builtin worker and remote agent runtime to report the same SSL metadata contract

Backup taken before rollout:
- `/data/backups/uptime-20260313T095257Z.db`

Operational result:
- HTTPS monitors can now warn before certificate expiration without being forced into `DOWN`
- both remote agent hosts were updated to the matching result payload shape
- control plane continues to accept `/api/agent/results`, `/api/agent/heartbeat`, and `/api/agent/stream` after the rollout

Verification:
- `uptime-server-api` returned to `healthy`
- `server` and `client` builds/tests passed before rollout
- both agent hosts restarted successfully and resumed `200` traffic to `/api/agent/*`

### Public status page rollout and follow-up fixes

Host:
- `onedashmsk`

Changes:
- deployed public status page at `/status`
- exposed anonymous payload at `/api/public/status`
- added selected-monitor visibility controls, 24h availability aggregation, and a derived incident timeline
- fixed the first-navigation React hook-order crash that occurred when opening `/status` from the authenticated UI without a full page reload
- removed the compose dependency that caused `client` rollouts to recreate `uptime-server-api`

Operational result:
- public status page now works on both direct load and in-app navigation
- `client`-only rollouts now rebuild and recreate only `uptime-client`
- `uptime-server-api` remains running during UI-only rollouts

Verification:
- `/status` serves the current public bundle
- `/api/public/status` returns the expected public payload with 24 hourly buckets
- `docker compose -f docker-compose.split.yml up -d --build client` no longer changes the `uptime-server-api` container ID or start time

## 2026-03-12

### Remote agent dockerization rollout

Hosts:
- `cloudruvm1`
- `ruvdsekb`

Changes:
- migrated both live agent hosts from native `node + systemd` to `docker compose + systemd`
- standardized both hosts on the repository deployment kit with `AGENT_DEPLOYMENT_MODE=local-build`
- preserved existing `MAIN_SERVER_URL=https://ping-agent.ru`
- preserved existing agent tokens during migration

Backups taken before migration:
- `cloudruvm1`: `/home/skris/uptime-agent-backup-20260312T102320Z.tgz`
- `cloudruvm1`: `/etc/uptime-agent.env.20260312T102320Z.bak`
- `cloudruvm1`: `/etc/systemd/system/uptime-agent.service.20260312T102320Z.bak`
- `ruvdsekb`: `/home/skris/uptime-agent-backup-20260312T102720Z.tgz`
- `ruvdsekb`: `/etc/uptime-agent.env.20260312T102720Z.bak`
- `ruvdsekb`: `/etc/systemd/system/uptime-agent.service.20260312T102720Z.bak`

Post-migration runtime:
- `uptime-agent.service` is now the docker/systemd unit on both hosts
- `/opt/uptime-agent/.env` is the active runtime env on both hosts
- `/home/skris/uptime-agent` remains as the local-build source checkout on both hosts

Operational result:
- both agents reconnected successfully after sequential host migration
- control plane resumed receiving `/api/agent/heartbeat`, `/api/agent/results`, and `/api/agent/stream`

### Control-plane TLS rollout

Host:
- `onedashmsk`

Changes:
- deployed split-runtime `client` TLS bootstrap and renewal automation
- enabled public domain routing for `ping-agent.ru` and `www.ping-agent.ru`
- opened production control plane on HTTPS with automatic HTTP to HTTPS redirect
- added long-running `certbot` compose service with shared ACME webroot and certificate storage
- configured client container to switch from HTTP bootstrap mode to HTTPS automatically after first certificate issuance

Certificate state:
- issuer: Let's Encrypt `E7`
- subject: `ping-agent.ru`
- SANs: `ping-agent.ru`, `www.ping-agent.ru`
- initial expiration: `2026-06-10`

Backup taken before rollout:
- `/data/backups/uptime-20260312T085930Z.db`

Operational notes:
- at the time of this rollout the local control-plane compose working directory was `/root/uptime-monitor`
- firewall already allowed `80/tcp` and `443/tcp`
- a brief API reconnect window occurred during `server` recreate; services recovered after rollout

### 2026-03-26

#### Fake staging checkout removed from live host

To keep the deployment path unambiguous on the control-plane host:

- the unused `/home/ubuntu/uptime-monitor-staging` checkout on `onedashmsk` was removed
- the current workflow remains direct-to-live after local verification
- there is no supported staging promotion step today
- any future staging environment must be a fully isolated stack, not an extra checkout on the live host

#### Local runtime checkout retired on workspace host

To prevent accidental local `80/tcp` and `443/tcp` exposure on the workspace host:

- the stale non-git runtime checkout under `/root/uptime-monitor` was archived and removed
- the only repository checkout on the workspace host is now `/home/skris/uptime-monitor-v2`
- local work must happen from `/home/skris/uptime-monitor-v2`
- the workspace host must not be treated as an approved local control-plane runtime without an explicit, reviewed deployment decision

## 2026-03-11

### Documentation refresh

Updated the documentation set to reflect the current real topology and working procedures.

Source-of-truth docs now are:
- `AGENTS.md`
- `README.md`
- `docs/index.md`
- `docs/architecture/system-overview.md`
- `docs/operations/production-topology.md`
- `docs/operations/runbook.md`
- `docs/operations/agent-deployment-kit.md`

Historical/template docs were explicitly marked as such:
- `docs/historical/v2-task-tracker.md`
- `docs/historical/v2-rollout-plan.md`
- `docs/historical/v2-rollback-runbook.md`
- `docs/historical/v2-canary-signoff.md`
- `docs/historical/v2-issues-seed.md`

### Agent management and version visibility

Control-plane changes shipped:
- agent deletion endpoint added
- agent deletion is blocked when monitors are still assigned
- agent version is persisted from heartbeat payload
- agent version is shown in the UI

### Control-plane rollout

Host:
- `onedashmsk`

Changes:
- control plane rolled in split-runtime mode using `docker-compose.split.yml`
- migration `20260311061500_add_agent_version` applied
- API, worker, retention, agent-offline-monitor, and client containers rebuilt and restarted

Backup taken before rollout:
- `/data/backups/uptime-before-agent-delete-version-20260311T062338Z.db`

### Remote agent rollout

Hosts:
- `cloudruvm1`
- `ruvdsekb`

Changes:
- agent runtime updated to report `agentVersion=1.0.0`
- current host deployment model remains native `node + systemd`
- runtime path remains `/home/skris/uptime-agent`

Backups taken before update:
- `cloudruvm1`: `/home/skris/uptime-agent-backup-20260311T063226Z.tgz`
- `ruvdsekb`: `/home/skris/uptime-agent-backup-20260311T063301Z.tgz`

Post-update control-plane state:
- `cloudruvm1` -> `ONLINE`, `agentVersion=1.0.0`
- `ruvdsekb` -> `ONLINE`, `agentVersion=1.0.0`

### Agent inventory cleanup

Deleted stale control-plane agent record:
- `епкрке`

Reason:
- stale record
- no assigned monitors
- safe to delete under current delete semantics

Result:
- control-plane agent inventory reduced to the two active agents:
  - `cloudruvm1`
  - `ruvdsekb`

### SSH access normalization

Operational rule confirmed:
- production SSH is expected on port `2332`
- port `22` should not be assumed available

Known host aliases in active use:
- `onedashmsk`
- `cloudruvm1`
- `ruvdsekb`

## Usage Rules

Add a new entry when any of the following happens:
- production control-plane rollout
- agent host rollout
- database restore or migration with operational impact
- host role change
- SSH/firewall access change
- deployment model change
- agent inventory cleanup with production impact

Do not use this file for code-only changes with no operational consequence.
