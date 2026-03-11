# Production Topology

This document records the current operational topology and the intended operator workflow.
It is the canonical production reference for future AI agents.

## Important Access Rule

SSH is expected on port `2332`.
Do not assume port `22` is available.

## Host Roles

### Control Plane

Operator alias:
- `onedashmsk`

Role:
- primary control plane

Current deployment mode:
- `docker-compose.split.yml`

Services expected there:
- `uptime-server-api`
- `uptime-server-worker`
- `uptime-server-retention`
- `uptime-server-agent-offline`
- `uptime-client`

Public responsibilities:
- browser UI
- `/api/*`
- `/api/agent/*`
- split background runtime
- SQLite database storage in docker volume

### Agent Host: `cloudruvm1`

Operator alias:
- `cloudruvm1`

Role:
- remote agent host

Current deployment mode:
- native Node.js + systemd

Current runtime characteristics:
- service: `uptime-agent.service`
- working tree: `/home/skris/uptime-agent`
- env file: `/etc/uptime-agent.env`
- SSH port: `2332`

### Agent Host: `ruvdskzn`

Operator alias:
- `ruvdskzn`

Role:
- remote agent host

Current deployment mode:
- native Node.js + systemd

Current runtime characteristics:
- service: `uptime-agent.service`
- working tree: `/home/skris/uptime-agent`
- env file: `/etc/uptime-agent.env`
- SSH port: `2332`

## Current Expected Agent Inventory

Expected live agents in the control plane:
- `cloudruvm1`
- `ruvdskzn`

Both should normally report:
- `status=ONLINE`
- `agentVersion=1.0.0`

If a third unknown or stale agent appears:
- verify whether it has assigned monitors
- if it has no assigned monitors and is stale, deletion is allowed
- if it still has monitors, reassign first

## Deployment Reality vs Canonical Kit

There are two different truths that must be kept separate.

### Canonical greenfield method
For future new hosts, the repo ships a docker/systemd deployment kit under:
- `deployment/agent/`
- `scripts/install-agent.sh`
- `scripts/update-agent.sh`
- `scripts/uninstall-agent.sh`

### Current existing production hosts
The two current production agent hosts are not using that docker kit.
They are running a native Node.js + systemd deployment from `/home/skris/uptime-agent`.

This matters because:
- update steps are different
- diagnostics are different
- uninstall/reinstall expectations are different

Do not assume you can run the docker deployment scripts on those two hosts without migration work.

## Control-Plane Deployment Workflow

Current preferred workflow:
1. update code locally
2. run local verification
3. back up control-plane SQLite DB
4. sync code to control-plane host
5. run `docker compose -f docker-compose.split.yml up -d --build`
6. verify `/health/runtime`
7. verify compose service state
8. verify agent heartbeat/results continue

## Agent Update Workflow On Current Hosts

For `cloudruvm1` and `ruvdskzn` today:
1. back up `/home/skris/uptime-agent`
2. sync updated repo subset:
   - `package.json`
   - `package-lock.json`
   - `apps/agent`
   - `packages/checker`
   - `packages/shared`
3. run:
   - `npm ci --workspace apps/agent --workspace packages/checker --workspace packages/shared --include-workspace-root=false`
   - `npm --prefix packages/shared run build`
   - `npm --prefix packages/checker run build`
   - `npm --prefix apps/agent run build`
4. restart `uptime-agent.service`
5. verify logs and control-plane `agentVersion`

## Backups

### Control plane
Use the repository scripts:
- `./scripts/backup-db.sh`
- `./scripts/restore-db.sh`

For split runtime:
- `COMPOSE_FILE=docker-compose.split.yml DB_SERVICE=server`

### Agent hosts
Before updating native agents, create a tar backup of `/home/skris/uptime-agent`.

## Diagnostics Checklist

### Control plane
- `docker compose -f docker-compose.split.yml ps`
- `./scripts/runtime-status.sh`
- `/health`
- `/health/runtime`
- recent `server` logs for `/api/agent/*`

### Agent hosts
- `systemctl status uptime-agent`
- `journalctl -u uptime-agent -n 100 --no-pager`
- confirm no repeated SSE timeout or `502` spam after the control plane is healthy

## Operational Invariants

- keep SSH on `2332`
- keep the control plane in split runtime unless explicitly rolling back
- do not use `deploy.sh` as the default production procedure
- do not delete agents with assigned monitors
- keep DB backups before control-plane rollouts
- keep working tree backups before native agent rollouts
