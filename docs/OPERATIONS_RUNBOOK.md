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
- `TRUST_PROXY=true` when the API sits behind the `client` nginx reverse proxy
- explicit edge allowlists once trusted operator/agent source ranges are known

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

## TLS And Let's Encrypt

The split-runtime compose stack now supports a two-stage TLS bootstrap for the `client` service.

Behavior:
- `client` starts in HTTP-only mode when no certificate exists yet
- `certbot` can issue the first certificate through the shared ACME webroot
- once certificate files appear, `client` switches itself to HTTPS and reloads `nginx`
- later renewals are also detected and reloaded automatically by the `client` container

Required env for first issuance:
- `SSL_DOMAINS`
- `SSL_CERT_NAME`
- `LETSENCRYPT_EMAIL`

Recommended first rollout:

```bash
docker compose -f docker-compose.split.yml up -d --build client certbot
```

Before relying on issuance, verify:
- DNS for every name in `SSL_DOMAINS` points to the control-plane host
- inbound ports `80` and `443` are open
- `client` answers `/.well-known/acme-challenge/*` over plain HTTP

Useful checks:

```bash
docker compose -f docker-compose.split.yml logs -f client certbot
docker compose -f docker-compose.split.yml exec -T client ls -la /etc/letsencrypt/live
```

Staging dry-run option:
- set `CERTBOT_STAGING=true` before the first request to avoid Let's Encrypt rate limits while validating DNS/firewall behavior
- switch it back to `false` before requesting the real certificate

## Edge Restriction Minimum

The `client` nginx layer now supports configurable allowlists without code changes.

Supported env vars:
- `ADMIN_ALLOWLIST`
  Comma-separated IPs/CIDRs allowed to reach the browser UI and non-agent `/api/*`.
- `AGENT_ALLOWLIST`
  Comma-separated IPs/CIDRs allowed to reach `/api/agent/*`.
- `RUNTIME_HEALTH_ALLOWLIST`
  Comma-separated IPs/CIDRs allowed to reach `/health/runtime`.
  If unset, external `/health/runtime` is denied by default.

Recommended operator flow:
1. Identify stable operator source IPs or put the admin UI behind a Zero Trust/VPN layer.
   For a single-operator deployment, Tailscale is the preferred long-lived option because it removes dependence on changing public IPs.
2. Set `ADMIN_ALLOWLIST` to those trusted ranges.
3. Inventory current agent egress IPs, then set `AGENT_ALLOWLIST`.
4. If remote runtime health must be queried externally, set `RUNTIME_HEALTH_ALLOWLIST` to a narrow ops range.
5. Recreate `client` after env changes:

```bash
docker compose -f docker-compose.split.yml up -d --build client
```

This is now a true client-only rollout path:
- `client` no longer declares a compose dependency on `server`
- rebuilding `client` should not recreate `uptime-server-api`
- use full-stack `up -d --build` only when the API or worker images really changed

Example:

```bash
ADMIN_ALLOWLIST=203.0.113.10,198.51.100.0/24
AGENT_ALLOWLIST=82.202.137.51,193.124.118.92
RUNTIME_HEALTH_ALLOWLIST=203.0.113.10
```

Notes:
- leave the values empty only when the edge is protected elsewhere
- `ADMIN_ALLOWLIST` affects the SPA and non-agent APIs together
- these controls are intentionally opt-in so rollout does not accidentally lock out the current operator
- if admin access moves behind Tailscale, `ADMIN_ALLOWLIST` can stay empty while the public edge blocks that hostname or path entirely
- `AGENT_ALLOWLIST` is still the practical control for the current public-agent topology; private-network agent access is a later option, not a current requirement

## Public Status Page

Public routes:
- browser page: `/status`
- payload: `/api/public/status`

Current behavior:
- one shared public page only
- no authentication
- only monitors explicitly marked public are returned
- page shows:
  - current monitor state
  - latest check snapshot
  - 24h summary pills
  - 24h availability chart
  - derived incident timeline strip
  - per-monitor incident strip and sparkline

Current implementation notes:
- monitor exposure is currently a boolean flag on `Monitor`
- the public timeline is derived from hourly check-result buckets
- it is not yet backed by the future incident model from the roadmap
- the page must work both on direct reload and on in-app navigation from the authenticated UI

Operator workflow:
1. Open the dashboard.
2. Toggle public visibility for the monitors that should be exposed.
3. Open `https://ping-agent.ru/status`.
4. Verify that only the intended monitors are visible.

Operational guardrails:
- do not expose sensitive internal-only monitors accidentally; the public page is intentionally anonymous
- treat `/api/public/status` as a read-only contract and avoid leaking internal monitor metadata there
- when changing public-page UI only, use the client-only rollout path below rather than a full control-plane recreate

## Login Abuse Signals

The API now emits stable security log markers for login abuse handling:
- `SECURITY_LOGIN_FAILED`
- `SECURITY_LOGIN_ACCOUNT_LOCKED`
- `SECURITY_LOGIN_RATE_LIMITED`
- `SECURITY_LOGIN_IP_BLOCKED`
- `SECURITY_LOGIN_BANNED`

These are intended for:
- fail2ban
- log-based alerting
- manual incident investigation

Example:

```bash
docker compose -f docker-compose.split.yml logs --tail=200 server | grep SECURITY_LOGIN_
```

## Monitor Target Guardrails

HTTP checks now block these target categories by default:
- loopback
- RFC1918 private IPv4
- IPv6 ULA/private
- link-local
- cloud metadata endpoints

This applies to:
- builtin worker checks
- remote agent checks
- monitor creation/update validation for obvious blocked targets

Escape hatch:
- set `ALLOW_PRIVATE_MONITOR_TARGETS=true` only when private/internal monitoring is an intentional requirement
- if you enable it, compensate with network isolation and a stricter trust model for who can create monitors

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

## Control-Plane Host Migration

This section covers moving the split-runtime control plane to a different host.

Goal:
- keep the same product behavior
- keep agents reconnecting to the new control plane
- avoid losing SQLite data
- preserve HTTPS for the public domain

There are two materially different migration cases.

### Case A: Same public domain on the new host

Example:
- old host serves `https://ping-agent.ru`
- new host will also serve `https://ping-agent.ru`

Effects:
- browser URLs do not change
- agents do not need config changes if they already use the domain
- TLS certificate remains logically valid for the same hostname

Current production expectation:
- remote agents should use `MAIN_SERVER_URL=https://ping-agent.ru`

### Case B: Different public domain on the new host

Example:
- old host serves `https://ping-agent.ru`
- new host will serve `https://new-monitor.example.com`

Effects:
- browser URLs change
- all remote agents must update `MAIN_SERVER_URL`
- CORS, app links, and TLS env must be updated for the new domain

### Risks To Control Before Migration

- SQLite is local to the control-plane host and must be backed up and restored explicitly.
- The current TLS flow uses HTTP-01 webroot validation through `certbot`.
- If the new host does not already have a valid certificate for the production domain, HTTPS clients and agents will fail until certificate issuance finishes.
- Agents now use HTTPS and do not follow this migration for free if the new host only serves HTTP during cutover.

### Recommended Migration Strategy

For minimal disruption when keeping the same domain:
- pre-stage the new host
- copy current TLS state from the old host to the new host
- stop writes on the old host
- take a final SQLite backup
- restore the DB on the new host
- bring up the new stack
- switch DNS to the new host
- verify agents stay or return `ONLINE`
- shut down the old host only after verification

### Preparation Checklist

On the new host, prepare:
- Docker and Docker Compose
- repository checkout with the current code
- `.env` containing the same `JWT_SECRET` and `ENCRYPTION_KEY`
- inbound `80/tcp` and `443/tcp`
- SSH access on the expected port

Before migration, reduce DNS TTL if possible.

Recommended env parity on the new host:
- same `JWT_SECRET`
- same `ENCRYPTION_KEY`
- same `SSL_DOMAINS`
- same `SSL_CERT_NAME`
- same `LETSENCRYPT_EMAIL`
- same public `CORS_ORIGINS`

Do not rotate these during the host migration itself unless that is part of a separate deliberate change.

### Step 1: Pre-Stage Code And Env On The New Host

Copy the current repository contents needed for runtime:
- `docker-compose.split.yml`
- `client/`
- `server/`
- `packages/`
- `scripts/`
- root `package.json`
- root `package-lock.json`
- `.env`

Confirm the compose file renders correctly:

```bash
docker compose -f docker-compose.split.yml config
```

### Step 2: Decide TLS Transfer Method

#### Preferred: Copy existing Let’s Encrypt state

Use this when:
- the public domain stays the same
- you want agents and browsers to keep working over HTTPS immediately after DNS cutover

Why this is preferred:
- the certificate is already valid for the domain
- the new host can start directly in HTTPS mode
- agents using `https://...` do not have to wait for a new issuance cycle

Data to copy from the old host:
- `certbot-etc` volume
- `certbot-var` volume

Practical note:
- the exact volume names depend on the compose project name
- in the current production layout they are named like:
  - `uptime-monitor_certbot-etc`
  - `uptime-monitor_certbot-var`

Example export on the old host:

```bash
docker run --rm \
  -v uptime-monitor_certbot-etc:/from \
  -v "$PWD:/backup" \
  alpine sh -lc 'cd /from && tar czf /backup/certbot-etc.tgz .'

docker run --rm \
  -v uptime-monitor_certbot-var:/from \
  -v "$PWD:/backup" \
  alpine sh -lc 'cd /from && tar czf /backup/certbot-var.tgz .'
```

Example import on the new host:

```bash
docker volume create uptime-monitor_certbot-etc
docker volume create uptime-monitor_certbot-var

docker run --rm \
  -v uptime-monitor_certbot-etc:/to \
  -v "$PWD:/backup" \
  alpine sh -lc 'cd /to && tar xzf /backup/certbot-etc.tgz'

docker run --rm \
  -v uptime-monitor_certbot-var:/to \
  -v "$PWD:/backup" \
  alpine sh -lc 'cd /to && tar xzf /backup/certbot-var.tgz'
```

After import, the new host can start `client` with HTTPS immediately.

#### Fallback: Re-issue certificate on the new host

Use this when:
- you cannot or do not want to copy TLS state

Tradeoff:
- after DNS cutover, the new host must complete ACME issuance before HTTPS is usable
- browsers may see an HTTP-only window
- agents using `https://...` will fail until the new certificate exists

This fallback is acceptable only if a short HTTPS interruption is acceptable.

### Step 3: Take The Final SQLite Backup On The Old Host

On the old control-plane host:

```bash
COMPOSE_FILE=docker-compose.split.yml DB_SERVICE=server ./scripts/backup-db.sh
```

Record the exact backup path under `/data/backups`.

### Step 4: Stop Writes On The Old Host

For a clean cutover, stop the old control plane before the final restore on the new host.

Example:

```bash
docker compose -f docker-compose.split.yml down
```

Reason:
- SQLite is not multi-writer across hosts
- a backup taken before shutdown must remain the final source of truth

### Step 5: Move The SQLite Backup To The New Host

Copy the chosen backup file to the new host.

Example:

```bash
scp /data/backups/uptime-YYYYMMDDTHHMMSSZ.db new-host:/data/backups/
```

Ensure the destination path matches what `restore-db.sh` expects.

### Step 6: Restore The DB On The New Host

On the new host:

```bash
COMPOSE_FILE=docker-compose.split.yml DB_SERVICE=server ./scripts/restore-db.sh /data/backups/uptime-YYYYMMDDTHHMMSSZ.db
```

This script:
- stops the compose stack
- copies the chosen backup into `/data/uptime.db`
- starts the compose stack again

### Step 7: Start The New Stack

If TLS state was copied already:

```bash
docker compose -f docker-compose.split.yml up -d --build
```

If TLS state was not copied:

```bash
docker compose -f docker-compose.split.yml up -d --build client certbot server worker retention agent-offline-monitor
```

Watch:
- `client`
- `server`
- `certbot` if reissuing on the new host

### Step 8: Switch DNS

Update `A` and `AAAA` records for the public domain to the new host IP.

For the same-domain migration:
- agents continue using the same URL
- no agent env change is required

For the new-domain migration:
- update DNS for the new domain
- keep the old domain available until agents are migrated

### Step 9: Verify Runtime On The New Host

Check compose:

```bash
docker compose -f docker-compose.split.yml ps
```

Check runtime health:

```bash
docker compose -f docker-compose.split.yml exec -T server \
  node -e "fetch('http://127.0.0.1:3000/health/runtime').then(r=>r.text()).then(console.log)"
```

Check public HTTPS:

```bash
curl -I http://your-domain
curl -I https://your-domain
```

Check certificate details:

```bash
echo | openssl s_client -servername your-domain -connect your-domain:443 2>/dev/null | \
  openssl x509 -noout -subject -issuer -dates
```

### Step 10: Verify Agents

If the public domain stayed the same and agents already use the domain:
- no agent restart should be necessary
- verify they continue sending heartbeat and results

If the public domain changed, or agents still use the old IP:
- update `/etc/uptime-agent.env`
- set `MAIN_SERVER_URL` to the new HTTPS URL
- restart `uptime-agent.service`

Verification on the control plane:
- agents should become or remain `ONLINE`
- `lastSeen` should advance
- `/api/agent/heartbeat` and `/api/agent/results` should return `200`

Verification on each agent host:

```bash
systemctl status uptime-agent
journalctl -u uptime-agent -n 100 --no-pager
```

Look specifically for:
- repeated `301` on `/api/agent/heartbeat` or `/api/agent/results`
- TLS hostname mismatch errors
- repeated SSE reconnect loops

### Step 11: Decommission The Old Host

Do not remove the old host immediately.

Wait until:
- DNS has propagated sufficiently
- the new control plane is healthy
- agents are `ONLINE`
- monitor results continue flowing
- TLS works from the public domain

Only then:
- stop old containers if still running
- archive old backups
- document the host role change in `docs/CHANGELOG_OPERATIONS.md`

### Decision Table

If the domain stays the same:
- agents do not need config changes
- copying TLS state is the safest path

If the domain changes:
- agents must update `MAIN_SERVER_URL`
- browser links and CORS must be updated too

If you cannot copy TLS state:
- expect a temporary HTTPS interruption during re-issuance

If you cannot tolerate agent interruption:
- do not rely on HTTP bootstrap alone
- pre-seed valid TLS material on the new host before DNS cutover

## Agent Operations

Current production and the canonical repository kit now use the same dockerized agent pattern.

Reference:
- `docs/AGENT_DEPLOYMENT_KIT.md`

Current production expectation:
- `/opt/uptime-agent/.env`
- `/opt/uptime-agent/docker-compose.yml`
- `/opt/uptime-agent/src`
- `uptime-agent.service`
 
Current production hosts also keep a repo checkout under `/home/skris/uptime-agent` as the update source for `local-build` mode.

## Current Agent Update Flow

For the current production agent hosts:

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

```bash
cd /home/skris/uptime-agent
sudo bash scripts/update-agent.sh
```

4. verify service and container state:

```bash
systemctl status uptime-agent
sudo docker compose -f /opt/uptime-agent/docker-compose.yml --env-file /opt/uptime-agent/.env ps
sudo docker logs --tail=100 uptime-agent
```

5. verify from control plane that:
- agent is `ONLINE`
- `lastSeen` updates
- `agentVersion` updates as expected

## Rollback: Agent Dockerization To Native Runtime

Use this only if a host was migrated to the dockerized agent flow and must be returned to the previous native Node.js service.

Preconditions:
- you have the pre-migration backups of:
  - `/etc/uptime-agent.env`
  - `/etc/systemd/system/uptime-agent.service`
  - the old working tree such as `/home/skris/uptime-agent-backup-YYYYMMDDTHHMMSSZ.tgz`
- the old native working tree still contains built agent artifacts or can be rebuilt

For the current production migration on `2026-03-12`, the recorded backup filenames are listed in `docs/CHANGELOG_OPERATIONS.md`.

### Step 1: Stop The Dockerized Agent

```bash
sudo systemctl stop uptime-agent
sudo docker compose -f /opt/uptime-agent/docker-compose.yml --env-file /opt/uptime-agent/.env down
```

Optional cleanup if you want to remove the local container image too:

```bash
sudo docker image rm uptime-agent:local
```

### Step 2: Restore The Native Env And systemd Unit

Example:

```bash
sudo cp /etc/uptime-agent.env.YYYYMMDDTHHMMSSZ.bak /etc/uptime-agent.env
sudo cp /etc/systemd/system/uptime-agent.service.YYYYMMDDTHHMMSSZ.bak /etc/systemd/system/uptime-agent.service
sudo systemctl daemon-reload
```

Verify the restored unit points back to the native Node.js command and not to `/opt/uptime-agent/docker-compose.yml`.

### Step 3: Restore The Old Working Tree

If the pre-migration checkout was archived:

```bash
sudo rm -rf /home/skris/uptime-agent
sudo mkdir -p /home/skris/uptime-agent
sudo tar xzf /home/skris/uptime-agent-backup-YYYYMMDDTHHMMSSZ.tgz -C /home/skris
```

If the old working tree is still present and intact, verify:
- expected files exist under `/home/skris/uptime-agent`
- `apps/agent/dist/index.js` exists, or can be rebuilt before restart

### Step 4: Rebuild The Native Agent If Needed

Use this only if the restored checkout does not already include the built runtime:

```bash
cd /home/skris/uptime-agent
npm ci --workspace apps/agent --workspace packages/checker --workspace packages/shared --include-workspace-root=false
npm --prefix packages/shared run build
npm --prefix packages/checker run build
npm --prefix apps/agent run build
```

### Step 5: Start The Native Service

```bash
sudo systemctl enable uptime-agent
sudo systemctl restart uptime-agent
```

### Step 6: Verify The Rollback

On the host:

```bash
systemctl status uptime-agent
journalctl -u uptime-agent -n 100 --no-pager
```

Confirm:
- the service is the restored native unit
- logs no longer mention docker compose
- the process is running the native agent entrypoint

On the control plane, verify:
- the agent becomes `ONLINE`
- `lastSeen` advances
- `/api/agent/heartbeat` and `/api/agent/results` return `200`

### Failure Cases

If the native service does not start:
- confirm `/etc/uptime-agent.env` was restored from the correct backup
- confirm the working tree matches the restored unit paths
- confirm `apps/agent/dist/index.js` exists
- rebuild the native checkout before retrying

If the agent starts but stays `OFFLINE`:
- verify `MAIN_SERVER_URL`
- verify `AGENT_TOKEN`
- inspect control-plane logs for `301`, `401`, `403`, `502`, or TLS errors

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
sudo docker compose -f /opt/uptime-agent/docker-compose.yml --env-file /opt/uptime-agent/.env ps
sudo docker logs --tail=100 uptime-agent
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
- do not assume a live agent host uses registry-image mode; production currently uses `local-build`
- do not assume port `22`; use `2332`
