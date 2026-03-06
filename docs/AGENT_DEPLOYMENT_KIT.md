# Agent Deployment Kit

This kit is for deploying uptime-monitor v2 agents to low-cost VPS hosts safely and repeatably.

## Files

- `deployment/agent/docker-compose.agent.yml`
- `deployment/agent/uptime-agent.service`
- `deployment/agent/cloud-init-agent.yaml`
- `scripts/install-agent.sh`
- `scripts/update-agent.sh`
- `scripts/uninstall-agent.sh`

## Recommended Pattern

- One agent per host.
- No inbound app ports on agent hosts.
- Agent talks outbound HTTPS to control plane only.
- Unique token per agent, rotate regularly.

## Quick Install (manual host)

Run on target host as root:

```bash
curl -fsSL https://raw.githubusercontent.com/kursov-git/uptime-monitor/main/scripts/install-agent.sh -o /tmp/install-agent.sh
chmod +x /tmp/install-agent.sh
MAIN_SERVER_URL="https://your-control-plane" \
AGENT_TOKEN="<one-time-token>" \
ENCRYPTION_KEY_1="<hex-32-byte-key>" \
UPTIME_AGENT_IMAGE="ghcr.io/kursov-git/uptime-agent:v2-latest" \
bash /tmp/install-agent.sh
```

Notes:
- If you install from repository checkout directly, run `scripts/install-agent.sh` from repo root.
- `HARDEN_HOST=true` by default. It sets `ufw deny incoming` and keeps only SSH inbound.

## Update Agent

```bash
sudo UPTIME_AGENT_IMAGE="ghcr.io/kursov-git/uptime-agent:v2.0.1" bash scripts/update-agent.sh
```

If `UPTIME_AGENT_IMAGE` is omitted, the current image tag from `/opt/uptime-agent/.env` is used.

## Uninstall Agent

```bash
sudo bash scripts/uninstall-agent.sh
```

Keep config for diagnostics:

```bash
sudo KEEP_CONFIG=true bash scripts/uninstall-agent.sh
```

## cloud-init Bootstrap

Use `deployment/agent/cloud-init-agent.yaml` as user-data.
Before use, replace placeholders:

- `__MAIN_SERVER_URL__`
- `__AGENT_TOKEN__`
- `__ENCRYPTION_KEY_1__`

## Hardening Checklist

- SSH key auth only; disable root login/password auth.
- UFW deny incoming by default; allow SSH only.
- Agent token is unique per host.
- Rotate/revoke token from control-plane UI.
- Monitor `OFFLINE`, dropped results, heartbeat lag.

## Runtime Checks

```bash
systemctl status uptime-agent
sudo docker logs --tail=100 uptime-agent
sudo docker compose -f /opt/uptime-agent/docker-compose.yml --env-file /opt/uptime-agent/.env ps
```

## Operational Notes

- Compromised host flow: revoke token -> terminate node -> redeploy with new token.
- Treat low-cost hosts as disposable workers.
