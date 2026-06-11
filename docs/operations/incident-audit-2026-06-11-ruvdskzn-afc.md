# Incident Audit: `ruvdskzn` AFC

Audit date:
- `2026-06-11`

Scope:
- production control plane on `onedashmsk`
- remote agent identity `ruvdskzn`
- current agent inventory, monitor secret exposure, public edge controls, and live runtime health

Interpretation:
- `AFC` is treated here as after-forfeiture/compromise review for the physically lost `ruvdskzn` agent host.

Secrets policy:
- raw tokens, passwords, cookies, private keys, and decrypted payload values were not written into this report.

## Executive Summary

The immediate control-plane containment action is complete: `ruvdskzn` is revoked and offline in production.

Confirmed remaining actions:
- rotate the external Dealer Portal credential used by the `Портал дилера` monitor
- remove `Портал дилера` from the public status page unless there is a deliberate reason to expose it
- decide whether active checks assigned to `cloudruvm1` should be moved to builtin worker or a reachable replacement agent, because `cloudruvm1` is also offline
- enable `AGENT_ALLOWLIST` and `ADMIN_ALLOWLIST` or move those surfaces behind a private access path

## Live Evidence Snapshot

Control plane:
- host: `onedashmsk`
- compose services: `uptime-server-api`, `uptime-server-worker`, `uptime-server-retention`, `uptime-server-agent-offline`, `uptime-client`, and `certbot` were running
- `uptime-server-api` status: `healthy`
- split runtime cluster: `api`, `worker`, `retention`, and `agentOfflineMonitor` all present and fresh

External edge:
- `GET https://ping-agent.ru/health` returned `403`
- `GET https://ping-agent.ru/health/runtime` returned `403`
- `GET https://ping-agent.ru/api/agent/jobs` without token returned `401`
- `GET https://ping-agent.ru/api/public/status` returned `200`
- `GET https://ping-agent.ru/status` returned `200`

Current edge env:
- `ADMIN_ALLOWLIST=unset`
- `AGENT_ALLOWLIST=unset`
- `RUNTIME_HEALTH_ALLOWLIST=unset`
- `SSL_DOMAINS=ping-agent.ru,www.ping-agent.ru`
- `SSL_CERT_NAME=ping-agent.ru`

Agent SSH reachability from the operator host:
- `ssh cloudruvm1` timed out on port `2332`
- `ssh ruvdskzn` timed out on port `2332`

## Agent Inventory

### `ruvdskzn`

Production state:
- id: `aeddef30-9d3e-4340-a36c-9183aa13f34f`
- status: `OFFLINE`
- revoked: yes
- `revokedAt`: `2026-06-11T14:26:07.360Z`
- last seen: `2026-06-11T06:54:26.231Z`
- last seen IP: `193.124.118.92`
- result count: `0`
- assigned monitor count: `1`

Containment evidence:
- a SQLite backup was created before revoke:
  - `/data/backups/uptime-20260611T142517Z.db`
- an `AGENT_REVOKED` audit entry was created with `manual-incident-response`
- no `CheckResult` rows existed for this agent at review time

### `cloudruvm1`

Production state:
- id: `33d6cc0d-b223-4a25-a430-171b46d46c78`
- status: `OFFLINE`
- revoked: no
- last seen: `2026-05-28T21:08:10.762Z`
- last seen IP: `82.202.137.51`
- result count: `0`
- assigned monitor count: `3`

Operational note:
- two active monitors are still assigned to `cloudruvm1`, but SSH to the host timed out on port `2332`.

## Monitor Inventory

Active builtin-worker monitors:
- `auth.alutech24.by`
- `auth.alutech24.com`

Active monitors assigned to offline `cloudruvm1`:
- `alutech-group.com`
- `auth.alutech24.eu`

Inactive monitor assigned to `cloudruvm1` with request headers/body:
- `stat.alutech24.com`

Inactive monitor assigned to revoked `ruvdskzn` with stored auth payload:
- `Портал дилера`
- URL: `https://dealer.alutech24.com/ru/orders`
- auth method: `CSRF_FORM_LOGIN`
- stored auth payload includes `username` and `password` fields
- public status exposure: enabled

Public status payload currently includes:
- `Портал дилера`
- URL: `https://dealer.alutech24.com/ru/orders`
- status: `paused`

## Cross-Node Access Material Review

Confirmed from repository docs and deployment scripts:
- the dedicated Claude Code private key is documented as Pi-side material:
  - `/home/skris/.ssh/claude_uptime_ops_ed25519`
- VPS-side `claudeops` state is documented as:
  - `/home/claudeops/.ssh/authorized_keys`
  - `/etc/sudoers.d/90-claudeops`
  - `/etc/ssh/sshd_config.d/98-claudeops-allowusers.conf`
- the agent deployment scripts write only:
  - `/opt/uptime-agent/.env`
  - `/opt/uptime-agent/docker-compose.yml`
  - `/opt/uptime-agent/src` in `local-build` mode
  - `/etc/systemd/system/uptime-agent.service`
- the agent `.env` carries agent runtime material such as `MAIN_SERVER_URL`, `AGENT_TOKEN`, optional `ENCRYPTION_KEY_1`, and tuning flags
- the repository deployment kit does not copy SSH private keys, control-plane TLS private keys, or cross-node access certificates to agent hosts

Assessment:
- no project evidence indicates that `ruvdskzn` intentionally contained a private SSH key or certificate that grants access to `onedashmsk`, `cloudruvm1`, or other nodes
- because the physical disk is unavailable, this cannot prove that no operator ever placed ad hoc keys on the host outside the documented deployment path
- the documented blast radius remains the `ruvdskzn` agent identity, its local agent `.env`, its local repo/runtime files, and any monitor payloads it fetched or could decrypt while active

## Findings

### F1 - High - Dealer Portal credential must be treated as compromised

Evidence:
- `ruvdskzn` was physically lost and had one assigned monitor with `CSRF_FORM_LOGIN` auth payload.
- `server/src/routes/agent.ts` returns active assigned jobs with `authPayloadEncrypted`, headers, request body, and auth settings to the authenticated agent (`/api/agent/jobs`).
- The affected monitor is inactive now, but the host should be assumed to have had historical access to its local environment and any job payloads fetched while it was alive.

Impact:
- the external Dealer Portal account used by the monitor may be known to whoever has the host or its disk.

Fix:
- rotate the Dealer Portal password or disable that external account
- clear or replace the stored monitor auth payload before re-enabling this monitor

### F2 - High - Agent API is still public by source network

Evidence:
- live `AGENT_ALLOWLIST=unset`
- `client/scripts/render-nginx-config.sh` defaults empty agent allowlist to `allow-all`
- `/api/agent/jobs` correctly rejects missing tokens with `401`, but source IP is not restricted

Impact:
- any future leaked non-revoked agent token can be used from any internet source, not only from the intended agent host or network.

Fix:
- set `AGENT_ALLOWLIST` to current trusted agent egress IPs after inventory is repaired
- longer term, move agents to a private path if feasible

### F3 - Medium - Admin UI/API remains public by source network

Evidence:
- live `ADMIN_ALLOWLIST=unset`
- `client/scripts/render-nginx-config.sh` defaults empty admin allowlist to `allow-all`
- roadmap already tracks this as `T048`

Impact:
- auth still protects admin APIs, but the login/admin surface remains reachable from the public internet.

Fix:
- put admin access behind Tailscale/private access or set `ADMIN_ALLOWLIST`

### F4 - Medium - Public status exposes the Dealer Portal monitor name and URL

Evidence:
- `/api/public/status` currently returns `Портал дилера` with `https://dealer.alutech24.com/ru/orders`
- `server/src/services/publicStatus.ts` selects monitors with `isPublic=true` and returns `url`
- the public toggle endpoint only changes `isPublic`

Impact:
- no password is exposed, but a sensitive business endpoint remains publicly visible during an incident.

Fix:
- unpublish this monitor immediately unless public exposure is intentional
- consider blocking public exposure for monitors with auth payloads by validation or warning

### F5 - Medium - Active monitor coverage is stale because `cloudruvm1` is offline

Evidence:
- `cloudruvm1` status is `OFFLINE`
- last seen was `2026-05-28T21:08:10.762Z`
- two active monitors remain assigned to `cloudruvm1`
- SSH to `cloudruvm1:2332` timed out during audit

Impact:
- checks assigned to `cloudruvm1` are not currently executing through the intended remote agent path.

Fix:
- reassign those active monitors to builtin worker or a reachable replacement agent
- investigate `cloudruvm1` separately before trusting it again

### F6 - Low - Agent tokens have no expiry field

Evidence:
- `server/prisma/schema.prisma` stores `tokenHash` and `revokedAt` for agents, but no `expiresAt`
- `server/src/services/agentAuth.ts` authenticates by token hash and only rejects missing, invalid, or revoked tokens

Impact:
- leaked agent tokens remain valid until manual revoke or rotation.

Fix:
- add optional `expiresAt` to `Agent`
- reject expired tokens in `authenticateAgent`
- surface token age/expiry in the agents UI

## Things That Look Correct

- `ruvdskzn` is revoked in production.
- `/health` and `/health/runtime` are externally restricted.
- `/api/agent/jobs` rejects unauthenticated requests.
- revoked agent tokens are rejected by code path via `revokedAt`.
- no stored check results were present for `ruvdskzn` at review time.
- public and API responses include useful security headers and HSTS.

## Recommended Order

1. Rotate the Dealer Portal credential.
2. Unpublish `Портал дилера` from `/status`.
3. Move active `cloudruvm1` monitors to builtin worker or a replacement agent.
4. Set `AGENT_ALLOWLIST` after the remaining agent inventory is known.
5. Set `ADMIN_ALLOWLIST` or move admin access behind Tailscale.
6. Add agent token expiry as a code hardening task.
