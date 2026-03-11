# Agent Deployment Kit

This document describes the repository-shipped deployment kit for remote agents.
It is the canonical path for new agent hosts.

Important distinction:
- this kit is the recommended greenfield deployment method
- current existing production hosts are not using this exact method yet
- for the current live topology, also read `docs/PRODUCTION_TOPOLOGY.md`

## Goal

Deploy one lightweight remote agent per host with:
- no inbound app ports
- outbound-only connection to the control plane
- explicit resource limits
- one token per host
- systemd-managed lifecycle

## Files

Repository assets:
- `deployment/agent/docker-compose.agent.yml`
- `deployment/agent/uptime-agent.service`
- `deployment/agent/cloud-init-agent.yaml`
- `scripts/install-agent.sh`
- `scripts/update-agent.sh`
- `scripts/uninstall-agent.sh`

## Recommended Pattern

Use this kit when provisioning a fresh VPS for agent-only work.

Characteristics:
- one agent per host
- no exposed inbound application ports
- docker compose under `/opt/uptime-agent`
- systemd unit `uptime-agent.service`
- unique token per agent

## Required Inputs

You need:
- `MAIN_SERVER_URL`
- `AGENT_TOKEN`
- `ENCRYPTION_KEY_1` if encrypted monitor auth payloads are used

Optional tuning:
- `UPTIME_AGENT_IMAGE`
- `AGENT_HTTP_TIMEOUT_MS`
- `AGENT_BUFFER_MAX`
- `AGENT_RESULT_MAX_BATCH`

## Install

Run on the target host as root:

```bash
curl -fsSL https://raw.githubusercontent.com/kursov-git/uptime-monitor-v2/main/scripts/install-agent.sh -o /tmp/install-agent.sh
chmod +x /tmp/install-agent.sh
MAIN_SERVER_URL="https://your-control-plane" \
AGENT_TOKEN="<one-time-token>" \
ENCRYPTION_KEY_1="<64-hex-chars>" \
UPTIME_AGENT_IMAGE="ghcr.io/kursov-git/uptime-agent:v2-latest" \
bash /tmp/install-agent.sh
```

If installing from a local checkout, run the same script from the repo root.

## What The Installer Does

`scripts/install-agent.sh`:
- requires root
- installs Docker and compose plugin if missing
- writes `/opt/uptime-agent/.env`
- writes `/opt/uptime-agent/docker-compose.yml`
- installs `uptime-agent.service`
- optionally hardens the host with UFW
- starts the service

## Resulting Layout

Expected files after install:
- `/opt/uptime-agent/.env`
- `/opt/uptime-agent/docker-compose.yml`
- `/etc/systemd/system/uptime-agent.service`

## Update

```bash
sudo UPTIME_AGENT_IMAGE="ghcr.io/kursov-git/uptime-agent:v2.0.1" bash scripts/update-agent.sh
```

If `UPTIME_AGENT_IMAGE` is omitted, the existing value from `.env` is used.

What `scripts/update-agent.sh` does:
- optionally rewrites `UPTIME_AGENT_IMAGE`
- pulls the image
- recreates the container with compose

## Uninstall

```bash
sudo bash scripts/uninstall-agent.sh
```

Keep config for diagnostics:

```bash
sudo KEEP_CONFIG=true bash scripts/uninstall-agent.sh
```

## cloud-init Bootstrap

Use `deployment/agent/cloud-init-agent.yaml` as user-data.
Replace placeholders before provisioning:
- `__MAIN_SERVER_URL__`
- `__AGENT_TOKEN__`
- `__ENCRYPTION_KEY_1__`

## Runtime Checks

```bash
systemctl status uptime-agent
sudo docker logs --tail=100 uptime-agent
sudo docker compose -f /opt/uptime-agent/docker-compose.yml --env-file /opt/uptime-agent/.env ps
```

## Security And Hardening

Expected agent-host posture:
- SSH key auth only
- no password-based SSH
- default deny inbound in UFW
- outbound access to control plane only
- unique token per host
- no extra exposed containers

The installer defaults to `HARDEN_HOST=true`.
That means:
- `ufw default deny incoming`
- `ufw default allow outgoing`
- `ufw allow OpenSSH`

Before enabling it on a nonstandard host, verify SSH access and SSH port expectations.

## Resource Model

The shipped docker compose file constrains the agent to a lightweight profile:
- read-only filesystem
- dropped Linux capabilities
- `pids_limit`
- memory limit
- CPU cap
- tmpfs for `/tmp`

Tune only if you have a measured reason.

## Token Lifecycle

Control-plane operations:
- register agent
- rotate token
- revoke access
- delete agent when unassigned

Host-side implications:
- after register or rotate, update `.env`
- after revoke, the current token should stop working
- after delete, the host runtime should be treated as orphaned and cleaned up or re-registered

## Important Reality Check

Current existing production agent hosts may use native Node.js + systemd instead of this docker kit.
Do not run these kit scripts on those hosts unless you explicitly intend to migrate them.

Use `docs/PRODUCTION_TOPOLOGY.md` to decide which procedure matches the host you are touching.
