# Operations Changelog

This file records meaningful operational changes in running environments.
It is intended for future operators and AI agents that need a compact history of what changed in production and on the managed hosts.

## 2026-03-19

### Synthetic request body rollout

Host:
- `onedashmsk`

Related agent hosts:
- `cloudruvm1`
- `ruvdskzn`

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
- `ruvdskzn`

Changes:
- migrated both live agent hosts from native `node + systemd` to `docker compose + systemd`
- standardized both hosts on the repository deployment kit with `AGENT_DEPLOYMENT_MODE=local-build`
- preserved existing `MAIN_SERVER_URL=https://ping-agent.ru`
- preserved existing agent tokens during migration

Backups taken before migration:
- `cloudruvm1`: `/home/skris/uptime-agent-backup-20260312T102320Z.tgz`
- `cloudruvm1`: `/etc/uptime-agent.env.20260312T102320Z.bak`
- `cloudruvm1`: `/etc/systemd/system/uptime-agent.service.20260312T102320Z.bak`
- `ruvdskzn`: `/home/skris/uptime-agent-backup-20260312T102720Z.tgz`
- `ruvdskzn`: `/etc/uptime-agent.env.20260312T102720Z.bak`
- `ruvdskzn`: `/etc/systemd/system/uptime-agent.service.20260312T102720Z.bak`

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
- production compose working directory remains `/root/uptime-monitor`
- firewall already allowed `80/tcp` and `443/tcp`
- a brief API reconnect window occurred during `server` recreate; services recovered after rollout

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
- `ruvdskzn`

Changes:
- agent runtime updated to report `agentVersion=1.0.0`
- current host deployment model remains native `node + systemd`
- runtime path remains `/home/skris/uptime-agent`

Backups taken before update:
- `cloudruvm1`: `/home/skris/uptime-agent-backup-20260311T063226Z.tgz`
- `ruvdskzn`: `/home/skris/uptime-agent-backup-20260311T063301Z.tgz`

Post-update control-plane state:
- `cloudruvm1` -> `ONLINE`, `agentVersion=1.0.0`
- `ruvdskzn` -> `ONLINE`, `agentVersion=1.0.0`

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
  - `ruvdskzn`

### SSH access normalization

Operational rule confirmed:
- production SSH is expected on port `2332`
- port `22` should not be assumed available

Known host aliases in active use:
- `onedashmsk`
- `cloudruvm1`
- `ruvdskzn`

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
