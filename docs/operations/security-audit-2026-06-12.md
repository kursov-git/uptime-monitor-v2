# Security Audit And Patch Pass - 2026-06-12

Date: 2026-06-12 UTC

Scope:
- `onedashmsk` / `144.31.61.49` - live control plane
- `cloudruvm1` / `82.202.137.51` - live remote agent
- `ruvdsekb` / `170.168.1.74` - retained only as historical/revoked agent host
- `vultr` - operator/control workspace host, checked because previous multi-host audits included it

## Summary

The live `uptime-monitor-v2` hosts were patched and rebooted successfully.

Confirmed after remediation:
- `onedashmsk`: pending apt upgrades `0`, reboot required `no`, kernel `6.8.0-124-generic`
- `cloudruvm1`: pending apt upgrades `0`, reboot required `no`, kernel `6.8.0-124-generic`
- public `https://ping-agent.ru/status` returned `200`
- public `https://ping-agent.ru/api/public/status` returned `200`
- external `https://ping-agent.ru/health/runtime` returned `403`
- `ruvdsekb` did not respond on SSH port `2332`; this matches the current revoked/lost host boundary and it was not returned to service

## Changes Applied

### `onedashmsk`

Actions:
- ran `apt-get update`
- ran noninteractive `apt-get full-upgrade`
- ran `apt-get autoremove`
- ran `apt-get autoclean`
- rebooted the host
- restored UFW persistence by unmasking and enabling `ufw.service`
- rebooted again to prove UFW survives boot

Notable upgraded packages included:
- Docker stack packages
- `apparmor`
- `cloud-init`
- `iproute2`
- `open-vm-tools`
- `snapd`
- `firmware-sof-signed`

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
- rebooted the host

Notable upgraded packages included:
- Linux kernel `6.8.0-124`
- systemd packages
- OpenSSL packages
- Docker stack packages
- `apparmor`
- `cloud-init`
- `osconfig`
- `open-vm-tools`
- `snapd`

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
- no new agent log entries appeared in the final 90-second check window after the control-plane reboot backoff cleared

### `vultr`

Actions:
- ran `apt-get update`
- ran noninteractive `apt-get full-upgrade`
- ran `apt-get autoremove`
- ran `apt-get autoclean`

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

This host is not the live `uptime-monitor-v2` runtime host, but it remains relevant as the operator workspace and should receive a separate controlled reboot and SSH hardening pass.

## Findings

### Medium - `onedashmsk` UFW was masked

Facts:
- after the first `onedashmsk` reboot, `ufw status` returned `inactive`
- `/etc/ufw/ufw.conf` already had `ENABLED=yes`
- `ufw.service` was `masked`
- old cloud-init user-data contained commands that disabled and masked UFW:
  - `ufw disable`
  - `systemctl disable ufw.service`
  - `systemctl mask ufw.service`

Remediation:
- `systemctl unmask ufw`
- `systemctl enable ufw`
- `ufw --force enable`
- `systemctl start ufw`
- second reboot

Verification:
- after the second reboot, `ufw status verbose` returned `active`
- `systemctl is-enabled ufw` returned `enabled`
- `systemctl is-active ufw` returned `active`

### Low - `cloudruvm1` agent logged expected reconnect errors during control-plane reboot

Facts:
- while `onedashmsk` was rebooting, `uptime-agent` logged transient `ECONNREFUSED 144.31.61.49:443` and SSE retry messages
- after waiting for the retry backoff, the final `docker logs --since=90s uptime-agent` check had no new entries

Assessment:
- this matched expected temporary control-plane downtime during reboot
- no agent-side remediation was needed

### Open - `vultr` still needs a separate reboot and SSH forwarding hardening

Facts:
- patching completed and pending apt upgrades are `0`
- `/var/run/reboot-required` still exists
- SSH forwarding remains enabled

Assessment:
- this is outside the live uptime runtime hosts but still matters for the broader operator host posture

## Final State

Live uptime runtime hosts:
- `onedashmsk`: patched, rebooted, UFW active/persistent, runtime healthy
- `cloudruvm1`: patched, rebooted, agent running, no reboot pending

Historical host:
- `ruvdsekb`: unreachable on SSH port `2332`, retained as revoked/lost, not trusted

Operator host:
- `vultr`: patched, not rebooted, follow-up required
