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
- `/status`
- `/api/public/status`
- `/api/*`
- `/api/agent/*`
- split background runtime
- SQLite database storage in docker volume

Edge hardening capabilities now available in the `client` nginx container:
- `ADMIN_ALLOWLIST` for browser UI and non-agent `/api/*`
- `AGENT_ALLOWLIST` for `/api/agent/*`
- `RUNTIME_HEALTH_ALLOWLIST` for `/health/runtime`

Current production setting:
- allowlists are implemented in code but not enabled by default until operator source IP policy is finalized
- preferred future admin hardening path is Tailscale for operator-only access, with `ADMIN_ALLOWLIST` kept as the low-friction fallback
- `/api/agent/*` currently remains public-by-necessity for the two public VPS agents; `AGENT_ALLOWLIST` is the next practical tightening step

Current public domain:
- `ping-agent.ru`
- `www.ping-agent.ru`

Current public status behavior:
- one shared public page lives on the same `client` container and domain as the operator UI
- only selected monitors are exposed
- page currently shows a 24h uptime summary plus a derived incident timeline from check-result buckets
- current public link is `https://ping-agent.ru/status`

### Agent Host: `cloudruvm1`

Operator alias:
- `cloudruvm1`

Role:
- remote agent host

Current deployment mode:
- docker compose + systemd (`local-build`)

Current runtime characteristics:
- service: `uptime-agent.service`
- install dir: `/opt/uptime-agent`
- env file: `/opt/uptime-agent/.env`
- compose file: `/opt/uptime-agent/docker-compose.yml`
- container: `uptime-agent`
- local update checkout: `/home/skris/uptime-agent`
- expected `MAIN_SERVER_URL=https://ping-agent.ru`
- SSH port: `2332`

### Agent Host: `ruvdskzn`

Operator alias:
- `ruvdskzn`

Role:
- remote agent host

Current deployment mode:
- docker compose + systemd (`local-build`)

Current runtime characteristics:
- service: `uptime-agent.service`
- install dir: `/opt/uptime-agent`
- env file: `/opt/uptime-agent/.env`
- compose file: `/opt/uptime-agent/docker-compose.yml`
- container: `uptime-agent`
- local update checkout: `/home/skris/uptime-agent`
- expected `MAIN_SERVER_URL=https://ping-agent.ru`
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

## Agent Deployment Standard

Current production and the canonical repository kit are now aligned.

For new and existing agent hosts, the standard deployment assets are:
- `deployment/agent/`
- `scripts/install-agent.sh`
- `scripts/update-agent.sh`
- `scripts/uninstall-agent.sh`

Current production agents use:
- docker compose + systemd
- `AGENT_DEPLOYMENT_MODE=local-build`
- runtime state under `/opt/uptime-agent`
- a local repo checkout under `/home/skris/uptime-agent` as the update source

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
1. back up:
   - `/opt/uptime-agent`
   - `/home/skris/uptime-agent`
2. sync updated repo subset:
   - `package.json`
   - `package-lock.json`
   - `apps/`
   - `packages/`
   - `deployment/agent`
   - `scripts`
3. run:
   - `cd /home/skris/uptime-agent`
   - `sudo bash scripts/update-agent.sh`
4. verify:
   - `systemctl status uptime-agent`
   - `docker compose -f /opt/uptime-agent/docker-compose.yml --env-file /opt/uptime-agent/.env ps`
   - `docker logs --tail=100 uptime-agent`
5. verify control-plane heartbeat, results, and `agentVersion`

## Backups

### Control plane
Use the repository scripts:
- `./scripts/backup-db.sh`
- `./scripts/restore-db.sh`

For split runtime:
- `COMPOSE_FILE=docker-compose.split.yml DB_SERVICE=server`

### Agent hosts
Before updating dockerized agents, create tar backups of:
- `/opt/uptime-agent`
- `/home/skris/uptime-agent` when that checkout is the local-build source tree

## Diagnostics Checklist

### Control plane
- `docker compose -f docker-compose.split.yml ps`
- `./scripts/runtime-status.sh`
- `/health`
- `/health/runtime`
- recent `server` logs for `/api/agent/*`
- recent `server` logs for `SECURITY_LOGIN_*` markers when investigating login abuse

### Agent hosts
- `systemctl status uptime-agent`
- `journalctl -u uptime-agent -n 100 --no-pager`
- `docker compose -f /opt/uptime-agent/docker-compose.yml --env-file /opt/uptime-agent/.env ps`
- `docker logs --tail=100 uptime-agent`
- confirm no repeated SSE timeout or `502` spam after the control plane is healthy

## Operational Invariants

- keep SSH on `2332`
- keep the control plane in split runtime unless explicitly rolling back
- do not use `deploy.sh` as the default production procedure
- use `docker compose -f docker-compose.split.yml up -d --build client` for UI/nginx-only rollouts; it should not recreate `uptime-server-api`
- do not delete agents with assigned monitors
- keep DB backups before control-plane rollouts
- keep `/opt/uptime-agent` and source-checkout backups before agent rollouts
