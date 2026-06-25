# Security Audit And Patch Pass - 2026-06-24

Date: 2026-06-24 UTC

Scope:
- `onedashmsk` / `144.31.61.49` - live control plane
- `cloudruvm1` / `82.202.137.51` - live remote agent
- `ruvdskzn` / `193.124.118.92` - retained only as historical/revoked agent host
- `vultr` - operator/control workspace host

## Summary

The live `uptime-monitor-v2` hosts were patched successfully.

Confirmed after remediation:
- `onedashmsk`: pending apt upgrades `0`, reboot required `no`, kernel `6.8.0-124-generic`
- `cloudruvm1`: pending apt upgrades `0`, reboot required `no`, kernel `6.8.0-124-generic`
- `vultr`: pending apt upgrades `0`, reboot required `yes`
- public `https://ping-agent.ru/status` returned `200`
- public `https://ping-agent.ru/api/public/status` returned `200`
- external `https://ping-agent.ru/health/runtime` returned `403`
- `ruvdskzn` initially did not respond, then came back on SSH port `2332` after an apparent hard power-on; it was patched and rebooted, but remained revoked/not trusted and its local `uptime-agent.service` failed to start after reboot

## Changes Applied

### `onedashmsk`

Actions:
- ran `apt-get update`
- ran noninteractive `apt-get full-upgrade`
- ran `apt-get autoremove`
- ran `apt-get autoclean`
- installed phased `kpartx` and `multipath-tools` updates by rerunning `full-upgrade` with `APT::Get::Always-Include-Phased-Updates=true`

Notable upgraded packages included:
- `containerd.io`
- `docker-ce`
- `docker-ce-cli`
- `docker-buildx-plugin`
- `docker-ce-rootless-extras`
- `docker-compose-plugin`
- `docker-model-plugin`
- `kpartx`
- `multipath-tools`

Security baseline after remediation:
- UFW `active`
- UFW `enabled`
- default incoming policy `deny`
- allowed ingress: `80/tcp`, `443/tcp`, `2332/tcp`
- `fail2ban` `active`
- SSH port `2332`
- `PermitRootLogin no`
- `PasswordAuthentication no`
- `AllowTcpForwarding no`
- `AllowAgentForwarding no`
- listening public ports: `80`, `443`, `2332`

Runtime verification:
- `uptime-server-api`: up and healthy
- `uptime-server-worker`: up
- `uptime-server-retention`: up
- `uptime-server-agent-offline`: up
- `uptime-client`: up on `80/443`
- `certbot`: up
- `/health/runtime` reported all split-runtime roles present and fresh
- worker reported `scheduledMonitors=2`, `syncLoopActive=true`, and a recent successful check
- agent-offline monitor reported `lastMarkedOfflineCount=0`

### `cloudruvm1`

Actions:
- ran `apt-get update`
- ran noninteractive `apt-get full-upgrade`
- ran `apt-get autoremove`
- ran `apt-get autoclean`

Notable upgraded packages included:
- `containerd.io`
- `docker-ce`
- `docker-ce-cli`
- `docker-buildx-plugin`
- `docker-ce-rootless-extras`
- `docker-compose-plugin`
- `kpartx`
- `multipath-tools`
- `osconfig`
- `qemu-guest-agent`
- `qemu-utils`
- `qemu-block-extra`

Security baseline after remediation:
- UFW `active`
- `fail2ban` `active`
- SSH port `2332`
- `PermitRootLogin no`
- `PasswordAuthentication no`
- `AllowTcpForwarding no`
- `AllowAgentForwarding no`
- listening public port: `2332`

Runtime verification:
- `uptime-agent.service` enabled and active
- `uptime-agent` container up
- transient reconnect errors appeared while the control plane restarted after Docker package updates
- after waiting for the retry backoff, the final `docker logs --since=90s uptime-agent` check had no new entries

### `vultr`

Actions:
- ran `apt-get update`
- ran noninteractive `apt-get full-upgrade`
- ran `apt-get autoremove`
- ran `apt-get autoclean`

Notable upgraded packages included:
- `google-chrome-stable`
- `nodejs`
- `kpartx`
- `multipath-tools`

Post-check:
- pending apt upgrades `0`
- UFW `active`
- `fail2ban` `active`
- reboot required `yes`

Not remediated in this pass:
- `vultr` was not rebooted because it is the current operator/Codex runtime host
- SSH forwarding drift remains:
  - `AllowTcpForwarding yes`
  - `AllowAgentForwarding yes`

This host is not the live `uptime-monitor-v2` runtime host, but it remains relevant as the operator workspace and still needs a separate controlled reboot and SSH forwarding hardening pass.

### `ruvdskzn`

Initial state:
- first checks to `193.124.118.92:2332` timed out
- after the operator reported that the provider panel showed the host online, the host became reachable:
  - hostname: `ruvdskzn`
  - user: `skris`
  - sudo: passwordless sudo worked
  - uptime at first successful check: about 5 minutes
  - kernel: `6.17.0-1018-azure`
  - pending apt upgrades: `17`

Security baseline before patching:
- UFW `active`
- default incoming policy `deny`
- allowed ingress: `2332/tcp`
- `fail2ban` `active`
- SSH port `2332`
- `PermitRootLogin no`
- `PasswordAuthentication no`
- `AllowTcpForwarding no`
- `AllowAgentForwarding no`
- listening public port: `2332`

Control-plane state:
- `ruvdskzn` remained revoked in the control plane:
  - `status=OFFLINE`
  - `lastSeen=2026-06-11T06:54:26.231Z`
  - `lastSeenIp=193.124.118.92`
  - `revokedAt=2026-06-11T14:26:07.360Z`
  - assigned monitors: `1`
- agent logs on the host repeatedly showed:
  - `GET /api/agent/jobs failed (403): {"error":"Agent token revoked"}`

Actions:
- ran `apt-get update`
- ran noninteractive `apt-get full-upgrade`
- recovered from very slow package configuration stages without leaving `dpkg` broken
- installed phased `kpartx` and `multipath-tools` updates with `APT::Get::Always-Include-Phased-Updates=true`
- ran `apt-get autoremove`
- ran `apt-get autoclean`
- attempted a controlled reboot because `/var/run/reboot-required` remained present

Notable upgraded packages included:
- `containerd.io`
- `docker-ce`
- `docker-ce-cli`
- `docker-buildx-plugin`
- `docker-ce-rootless-extras`
- `docker-compose-plugin`
- `openssl`
- `ca-certificates`
- `cloud-init`
- `apparmor`
- `snapd`
- `iproute2`
- `kpartx`
- `multipath-tools`

Patch verification before reboot:
- pending apt upgrades: `0`
- `dpkg --audit`: no broken package state
- UFW remained `active`
- `fail2ban` remained `active`
- listening public port remained `2332`
- `uptime-agent.service` was enabled and `active (exited)`
- `uptime-agent` container was running but could not join the control plane because the token remained revoked

Post-reboot state:
- `systemctl reboot` disconnected the host after a short delay
- the host booted slowly; `2332/tcp` opened before SSH sessions were usable
- final SSH check succeeded after the slow boot:
  - uptime: about 7 minutes at first successful post-reboot SSH check
  - boot id: `5ee39e22-c344-44f0-8708-093d2b690ede`
  - reboot required: `no`
  - pending apt upgrades: `0`
  - `dpkg --audit`: no broken package state
- UFW remained `active`
- `fail2ban` remained `active`
- SSH hardening remained intact
- listening public port remained `2332`
- `systemctl is-system-running` reported `degraded` because `uptime-agent.service` failed
- Docker service was `active`
- Docker version: server/client `29.6.0`
- disk usage was healthy: root filesystem `6.2G / 20G` used, `34%`
- `uptime-agent.service` failed with `Result: timeout`
- no `uptime-agent` container was running after reboot

Slow-boot evidence:
- `systemd-analyze` reported:
  - `Startup finished in 1min 46.879s (kernel) + 11min 55.289s (userspace) = 13min 42.169s`
  - `graphical.target reached after 11min 53.616s`
- slow units included:
  - `apt-daily-upgrade.service`: `4min 34.271s`
  - `docker.service`: `4min 9.137s`
  - `apt-daily.service`: `2min 29.219s`
  - `uptime-agent.service`: `2min 192ms`
  - `apparmor.service`: `1min 18.300s`
  - `dev-sda1.device`: `52.803s`
  - `containerd.service`: `42.396s`
- Docker/containerd logs showed the first `containerd` start timed out while opening its BoltDB metadata store, then Docker spent several more minutes restoring/loading containers and initializing BuildKit
- the kernel logged `Found PM-Timer Bug... this clock source is slow. Consider trying other clock sources`
- later diagnostic SSH attempts still intermittently failed with `Connection timed out during banner exchange`

Assessment:
- `ruvdskzn` was patched to `0` pending apt upgrades before the reboot attempt
- it came back after a slow boot and no longer requires reboot
- it must still be treated as not trusted and not live
- the observed slowness is host/platform/runtime level, not just an `uptime-agent` application issue
- local agent service recovery is a separate decision because the control-plane token is still revoked
- do not un-revoke or reuse the existing agent token; if the host is recovered again, rotate/provision a fresh agent token and deliberately reassign monitors only after a new trust decision

## Findings

### Low - `onedashmsk` had two phased Ubuntu updates after the first pass

Facts:
- first `full-upgrade` installed Docker stack updates
- `apt` deferred `kpartx` and `multipath-tools` due to phasing

Remediation:
- reran `full-upgrade` with `APT::Get::Always-Include-Phased-Updates=true`

Verification:
- final pending apt upgrades count was `0`

### Low - `cloudruvm1` agent logged expected reconnect errors during control-plane Docker restart

Facts:
- while `onedashmsk` restarted containers after Docker package updates, `uptime-agent` logged transient SSE/heartbeat errors including `502`
- after waiting for retry backoff, the final 90-second log check had no new entries

Assessment:
- this matched expected temporary control-plane unavailability during Docker package restarts
- no agent-side remediation was needed

### Open - `vultr` still needs a separate reboot and SSH forwarding hardening

Facts:
- patching completed and pending apt upgrades are `0`
- `/var/run/reboot-required` still exists
- SSH forwarding remains enabled

Assessment:
- this is outside the live uptime runtime hosts but still matters for the broader operator host posture

### Open - `ruvdskzn` agent service failed after controlled reboot

Facts:
- the host came back after the provider panel showed it online
- package updates completed to `0` pending apt upgrades
- `dpkg --audit` was empty before reboot
- agent token remained revoked and the control plane kept the agent record offline
- after `systemctl reboot`, the host booted very slowly but eventually returned on SSH port `2332`
- post-reboot package state remained clean:
  - pending apt upgrades `0`
  - reboot required `no`
  - `dpkg --audit` empty
- `uptime-agent.service` failed with timeout during Docker Compose startup
- no `uptime-agent` container was running after reboot
- `systemd-analyze` measured a `13min 42.169s` boot, mostly userspace
- Docker/containerd startup was slow and included a first `containerd` timeout while opening the metadata store
- follow-up SSH diagnostics intermittently timed out during banner exchange even after the host had been up for hours

Assessment:
- this is not currently an application availability issue because the host is still revoked and not part of live monitoring
- recovering the local agent service should be tied to a deliberate trust/token rotation decision
- the current control-plane revoke is still the correct safety boundary
- do not return this host to live use until provider/storage health is confirmed, boot/SSH behavior stabilizes, and a newly provisioned agent token proves heartbeats and result delivery under observation

## Final State

Live uptime runtime hosts:
- `onedashmsk`: patched, no reboot pending, UFW active/persistent, runtime healthy
- `cloudruvm1`: patched, no reboot pending, agent running

Historical host:
- `ruvdskzn`: patched, rebooted, still revoked/not trusted, slow/unstable SSH behavior observed, local `uptime-agent.service` failed timeout

Operator host:
- `vultr`: patched, not rebooted, follow-up required
