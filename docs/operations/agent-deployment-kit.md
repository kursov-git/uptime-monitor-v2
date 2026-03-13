# Agent Deployment Kit

This document describes the repository-shipped deployment kit for remote agents.
It is the canonical path for new agent hosts.

Important distinction:
- this kit is the recommended greenfield deployment method
- current production hosts now use this same docker/systemd kit in `local-build` mode
- for the current live topology, also read `docs/operations/production-topology.md`

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
- local image build from a repository checkout is the preferred path
- registry image mode is optional

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
- `AGENT_MAX_CONCURRENCY`
- `AGENT_DEPLOYMENT_MODE` (`auto`, `local-build`, `image`)

## Install

Preferred: run from a full repository checkout on the target host as root:

```bash
git clone https://github.com/kursov-git/uptime-monitor-v2.git
cd uptime-monitor-v2
MAIN_SERVER_URL="https://your-control-plane" \
AGENT_TOKEN="<one-time-token>" \
ENCRYPTION_KEY_1="<64-hex-chars-if-needed>" \
AGENT_DEPLOYMENT_MODE="local-build" \
sudo bash scripts/install-agent.sh
```

Why this is preferred:
- it does not depend on a remote registry image
- the installed image matches the checked-out code exactly
- it is the current production pattern and the most reliable path for migrating older native agent hosts

Optional: registry image mode

```bash
MAIN_SERVER_URL="https://your-control-plane" \
AGENT_TOKEN="<one-time-token>" \
UPTIME_AGENT_IMAGE="registry.example.com/uptime-agent:tag" \
AGENT_DEPLOYMENT_MODE="image" \
sudo bash scripts/install-agent.sh
```

## What The Installer Does

`scripts/install-agent.sh`:
- requires root
- installs Docker and compose plugin if missing
- writes `/opt/uptime-agent/.env`
- writes `/opt/uptime-agent/docker-compose.yml`
- copies `/opt/uptime-agent/src` in `local-build` mode
- installs `uptime-agent.service`
- optionally hardens the host with UFW
- starts the service

## Resulting Layout

Expected files after install:
- `/opt/uptime-agent/.env`
- `/opt/uptime-agent/docker-compose.yml`
- `/opt/uptime-agent/src` in `local-build` mode
- `/etc/systemd/system/uptime-agent.service`

## Update

Local-build mode:

```bash
sudo bash scripts/update-agent.sh
```

Image mode:

```bash
sudo UPTIME_AGENT_IMAGE="registry.example.com/uptime-agent:tag" bash scripts/update-agent.sh
```

If `UPTIME_AGENT_IMAGE` is omitted, the existing value from `.env` is used.

What `scripts/update-agent.sh` does:
- in `local-build` mode refreshes `/opt/uptime-agent/src` from the local repo checkout and rebuilds
- in `image` mode optionally rewrites `UPTIME_AGENT_IMAGE`, pulls the image, and recreates the container

## Uninstall

```bash
sudo bash scripts/uninstall-agent.sh
```

Keep config for diagnostics:

```bash
sudo KEEP_CONFIG=true bash scripts/uninstall-agent.sh
```

## cloud-init Bootstrap

Use `deployment/agent/cloud-init-agent.yaml` as user-data only when you deliberately want registry image mode and the image is reachable from that host.
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

## Migrating An Older Native Agent Host

If you still have an older host that runs the agent directly under Node.js, migrate it in this order:

1. back up:
   - `/etc/uptime-agent.env`
   - `/etc/systemd/system/uptime-agent.service`
   - the existing repo checkout such as `/home/skris/uptime-agent`
2. sync a current full repo checkout to the host
3. source the existing env values and run:

```bash
sudo -n bash -lc '
  set -a
  . /etc/uptime-agent.env
  set +a
  cd /path/to/uptime-monitor-v2
  AGENT_DEPLOYMENT_MODE=local-build HARDEN_HOST=false bash scripts/install-agent.sh
'
```

4. verify:
   - `systemctl status uptime-agent`
   - `sudo docker ps`
   - `sudo docker logs --tail=100 uptime-agent`
   - control plane shows the agent `ONLINE`

This replaces the old native systemd unit with the docker/systemd unit while preserving the existing token and server URL.

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

Production currently uses `local-build` mode, not registry-image mode.
If you touch a live host, confirm whether it should keep using `local-build` or explicitly switch to `image`.

Use `docs/operations/production-topology.md` to confirm the current host role and deployment mode before changing it.
