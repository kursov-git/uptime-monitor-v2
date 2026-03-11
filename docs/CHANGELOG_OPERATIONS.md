# Operations Changelog

This file records meaningful operational changes in running environments.
It is intended for future operators and AI agents that need a compact history of what changed in production and on the managed hosts.

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
