# Operations Runbook

This runbook describes the current supported operational workflows.
Use this file together with `docs/PRODUCTION_TOPOLOGY.md`.

## Deployment Modes

### Legacy single-process mode

Compose file:
- `docker-compose.yml`

Characteristics:
- `SERVER_ROLE=all`
- includes local `agent` container
- easiest path for local or simple deployments
- not the current recommended control-plane production layout

### Current split-runtime mode

Compose file:
- `docker-compose.split.yml`

Services:
- `server` -> `SERVER_ROLE=api`
- `worker` -> `SERVER_ROLE=worker`
- `retention` -> `SERVER_ROLE=retention`
- `agent-offline-monitor` -> `SERVER_ROLE=agent-offline-monitor`
- `client`

Recommended defaults:
- `LOG_FORMAT=json`
- `LOG_LEVEL=info`
- explicit `JWT_SECRET`
- explicit `ENCRYPTION_KEY`
- explicit `DATABASE_URL`

## Health Checks

### API liveness

```bash
docker compose -f docker-compose.split.yml exec -T server \
  node -e "fetch('http://127.0.0.1:3000/health').then(r=>r.text()).then(console.log)"
```

### Runtime health

```bash
docker compose -f docker-compose.split.yml exec -T server \
  node -e "fetch('http://127.0.0.1:3000/health/runtime').then(r=>r.text()).then(console.log)"
```

Interpretation:
- `serverRole` shows the active role of the API container
- background service states in `/health/runtime` are per-process
- in split runtime mode, the API process will correctly report worker/retention/offline-monitor as not running in that process
- use compose status to verify those dedicated services separately

### Compose health snapshot

```bash
./scripts/runtime-status.sh
COMPOSE_FILE=docker-compose.split.yml ./scripts/runtime-status.sh
```

## Compose Operations

### Check service state

```bash
docker compose -f docker-compose.split.yml ps
```

### Restart API only

```bash
docker compose -f docker-compose.split.yml restart server
```

### Restart worker only

```bash
docker compose -f docker-compose.split.yml restart worker
```

### Restart retention only

```bash
docker compose -f docker-compose.split.yml restart retention
```

### Restart agent-offline-monitor only

```bash
docker compose -f docker-compose.split.yml restart agent-offline-monitor
```

### Rebuild and restart the whole split stack

```bash
docker compose -f docker-compose.split.yml up -d --build
```

## Backups

Current repository scripts support SQLite compose deployments.

### Create backup

```bash
./scripts/backup-db.sh
COMPOSE_FILE=docker-compose.split.yml DB_SERVICE=server ./scripts/backup-db.sh
```

Behavior:
- runs `VACUUM INTO` inside the compose service
- stores backup inside `/data/backups`
- requires SQLite `DATABASE_URL`

### Restore backup

```bash
./scripts/restore-db.sh /data/backups/uptime-YYYYMMDDTHHMMSSZ.db
COMPOSE_FILE=docker-compose.split.yml DB_SERVICE=server ./scripts/restore-db.sh /data/backups/uptime-YYYYMMDDTHHMMSSZ.db
```

Behavior:
- stops the compose stack
- copies the backup into `/data/uptime.db`
- restarts the stack

### Backup policy recommendation

For the current control plane:
- take a DB backup before every rollout
- keep recurring backups on schedule outside of ad hoc changes
- validate restore on staging or disposable hosts before relying on it in production

## Preferred Control-Plane Rollout Pattern

Use this flow for the current production control plane.

1. run local verification
2. create a DB backup
3. sync code to the control-plane host
4. run `docker compose -f docker-compose.split.yml up -d --build`
5. wait for API health to go green
6. verify `runtime-status.sh`
7. verify agent heartbeat/results continue

## Agent Operations

There are two operationally different agent deployment styles.

### A. Canonical greenfield docker/systemd kit

Reference:
- `docs/AGENT_DEPLOYMENT_KIT.md`

Expected files:
- `/opt/uptime-agent/.env`
- `/opt/uptime-agent/docker-compose.yml`
- `uptime-agent.service`

### B. Current existing production agent hosts

Current production agent hosts use:
- systemd service `uptime-agent.service`
- repo checkout under `/home/skris/uptime-agent`
- env file `/etc/uptime-agent.env`
- direct Node.js execution of `apps/agent/dist/index.js`

Do not mix the two procedures accidentally.

## Current Native Agent Update Flow

For the current production agent hosts:

1. back up `/home/skris/uptime-agent`
2. sync updated repo subset:
   - `package.json`
   - `package-lock.json`
   - `apps/agent`
   - `packages/checker`
   - `packages/shared`
3. run:

```bash
npm ci --workspace apps/agent --workspace packages/checker --workspace packages/shared --include-workspace-root=false
npm --prefix packages/shared run build
npm --prefix packages/checker run build
npm --prefix apps/agent run build
```

4. restart service:

```bash
sudo systemctl restart uptime-agent
```

5. verify:

```bash
systemctl status uptime-agent
journalctl -u uptime-agent -n 100 --no-pager
```

6. verify from control plane that:
- agent is `ONLINE`
- `lastSeen` updates
- `agentVersion` updates as expected

## Agent Token Operations

### Rotate token

1. use `Agents -> Rotate Agent Token` in UI
2. update the host env file
3. restart the agent runtime

### Revoke access

Use when:
- agent host is compromised
- token leaked
- agent should stop connecting immediately

### Delete agent

Allowed only when:
- the agent has no assigned monitors

Effect:
- deletes control-plane agent record
- preserves historical results with null agent relation

## Troubleshooting

### Agent is `OFFLINE`

Check in this order.

1. Agent host service:

```bash
systemctl status uptime-agent
journalctl -u uptime-agent -n 100 --no-pager
```

2. Control-plane health:

```bash
docker compose -f docker-compose.split.yml exec -T server \
  node -e "fetch('http://127.0.0.1:3000/health/runtime').then(r=>r.text()).then(console.log)"
```

3. API logs for agent endpoints:

```bash
docker compose -f docker-compose.split.yml logs --since=10m server
```

4. Host env values:
- `MAIN_SERVER_URL`
- `AGENT_TOKEN`
- `ENCRYPTION_KEY_1` when encrypted auth payloads exist

5. Check whether the control plane recently rolled and agents saw transient `502` or HTML error pages during restart.
Transient reconnect noise around the rollout window is expected; sustained errors are not.

### API is healthy but agents do not update

Check:
- `ENABLE_AGENT_API=true`
- `AGENT_SSE_ENABLED=true`
- nginx/proxy path for `/api/agent/*`
- whether the agent token was revoked or rotated without updating the host env

### Need to remove a stale agent row

Rules:
- if assigned monitor count is greater than zero, do not delete; reassign first
- if assigned monitor count is zero, deletion is safe and now supported through the API/UI

## Environment Audit Checklist

Server:
- `DATABASE_URL`
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `SERVER_ROLE`
- `LOG_FORMAT=json`
- `LOG_LEVEL=info`

Agent:
- `MAIN_SERVER_URL`
- `AGENT_TOKEN`
- `AGENT_HTTP_TIMEOUT_MS`
- `AGENT_BUFFER_MAX`
- `AGENT_RESULT_MAX_BATCH`
- `AGENT_MAX_CONCURRENCY`
- `ENCRYPTION_KEY_1` where needed

## Legacy Warnings

- `deploy.sh` is not the canonical current production procedure
- the current agent deployment kit in `deployment/agent/` does not exactly match the two already-running production agent hosts
- do not assume port `22`; use `2332`
