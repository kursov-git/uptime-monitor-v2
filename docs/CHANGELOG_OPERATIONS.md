# Operations Changelog

This file records meaningful operational changes in running environments.
It is intended for future operators and AI agents that need a compact history of what changed in production and on the managed hosts.

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
- `docs/ARCHITECTURE.md`
- `docs/PRODUCTION_TOPOLOGY.md`
- `docs/OPERATIONS_RUNBOOK.md`
- `docs/AGENT_DEPLOYMENT_KIT.md`

Historical/template docs were explicitly marked as such:
- `ROADMAP_NEW.md`
- `docs/V2_TASK_TRACKER.md`
- `docs/V2_ROLLOUT_PLAN.md`
- `docs/V2_ROLLBACK_RUNBOOK.md`
- `docs/V2_CANARY_SIGNOFF.md`
- `docs/V2_ISSUES_SEED.md`

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
