# Operations Runbook

## Deployment Modes

### Single-process compatibility mode

- Compose file: `docker-compose.yml`
- Runtime: `SERVER_ROLE=all`
- Use for simplest deployments only.

### Split-process production mode

- Compose file: `docker-compose.split.yml`
- Services:
  - `server` -> `SERVER_ROLE=api`
  - `worker` -> `SERVER_ROLE=worker`
  - `retention` -> `SERVER_ROLE=retention`
  - `agent-offline-monitor` -> `SERVER_ROLE=agent-offline-monitor`
- Recommended defaults:
  - `LOG_FORMAT=json`
  - `LOG_LEVEL=info`
  - explicit `JWT_SECRET`, `ENCRYPTION_KEY`, `DATABASE_URL`

## Health Checks

### API

```bash
docker compose exec -T server node -e "fetch('http://127.0.0.1:3000/health').then(r=>r.text()).then(console.log)"
docker compose exec -T server node -e "fetch('http://127.0.0.1:3000/health/runtime').then(r=>r.text()).then(console.log)"
```

`/health/runtime` returns:
- active `SERVER_ROLE`
- runtime feature flags
- background loop status:
  - worker
  - retention
  - agent offline monitor

### Compose runtime

```bash
./scripts/runtime-status.sh
COMPOSE_FILE=docker-compose.split.yml ./scripts/runtime-status.sh
```

## Backups

Current backup scripts support SQLite compose deployments.

### Create backup

```bash
./scripts/backup-db.sh
COMPOSE_FILE=docker-compose.split.yml DB_SERVICE=server ./scripts/backup-db.sh
```

Backups are stored in `/data/backups` inside the compose volume.

### Restore backup

```bash
./scripts/restore-db.sh /data/backups/uptime-YYYYMMDDTHHMMSSZ.db
COMPOSE_FILE=docker-compose.split.yml DB_SERVICE=server ./scripts/restore-db.sh /data/backups/uptime-YYYYMMDDTHHMMSSZ.db
```

Restore currently performs a full compose stop/start to avoid concurrent SQLite writes.

## Core Operations

### Restart API only

```bash
docker compose -f docker-compose.split.yml restart server
```

### Restart worker only

```bash
docker compose -f docker-compose.split.yml restart worker
```

### Restart retention loop

```bash
docker compose -f docker-compose.split.yml restart retention
```

### Restart agent offline monitor

```bash
docker compose -f docker-compose.split.yml restart agent-offline-monitor
```

### Rotate agent token

1. Rotate token in UI: `Agents -> Rotate Agent Token`
2. Update agent host env:
   - `/opt/uptime-agent/.env`
   - or `/etc/uptime-agent.env`
3. Restart remote agent:

```bash
systemctl restart uptime-agent
```

## Agent Troubleshooting

### Agent shows `OFFLINE`

Check in this order:

1. Agent host service:
```bash
systemctl status uptime-agent
docker logs --tail=100 uptime-agent
```

2. Control-plane runtime:
```bash
curl -fsS http://127.0.0.1:3000/health/runtime
```

3. Agent API enabled:
- `ENABLE_AGENT_API=true`
- `AGENT_SSE_ENABLED=true` if using SSE commands

4. Token/env on agent host:
- `MAIN_SERVER_URL`
- `AGENT_TOKEN`
- `ENCRYPTION_KEY_1` if monitor auth payloads are encrypted

## Minimal Production Env Audit

Verify these explicitly:

- `DATABASE_URL`
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `SERVER_ROLE`
- `LOG_FORMAT=json`
- `LOG_LEVEL=info`

## Recovery Drill

1. Create backup.
2. Validate `/health` and `/health/runtime`.
3. Restart one split role at a time.
4. Restore latest backup on staging or disposable host before touching production restore.
