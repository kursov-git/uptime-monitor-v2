#!/usr/bin/env bash
set -euo pipefail

# Install and run uptime agent as a hardened docker-compose workload.
# Works on Debian/Ubuntu hosts.

INSTALL_DIR="/opt/uptime-agent"
SERVICE_PATH="/etc/systemd/system/uptime-agent.service"
COMPOSE_SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/deployment/agent"

: "${MAIN_SERVER_URL:?MAIN_SERVER_URL is required}"
: "${AGENT_TOKEN:?AGENT_TOKEN is required}"
: "${ENCRYPTION_KEY_1:?ENCRYPTION_KEY_1 is required}"

UPTIME_AGENT_IMAGE="${UPTIME_AGENT_IMAGE:-ghcr.io/kursov-git/uptime-agent:v2-latest}"
AGENT_HTTP_TIMEOUT_MS="${AGENT_HTTP_TIMEOUT_MS:-10000}"
AGENT_BUFFER_MAX="${AGENT_BUFFER_MAX:-1000}"
AGENT_RESULT_MAX_BATCH="${AGENT_RESULT_MAX_BATCH:-500}"
HARDEN_HOST="${HARDEN_HOST:-true}"

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Run as root: sudo MAIN_SERVER_URL=... AGENT_TOKEN=... ENCRYPTION_KEY_1=... $0"
    exit 1
  fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    return
  fi

  apt-get update
  apt-get install -y ca-certificates curl gnupg lsb-release ufw

  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
  fi

  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list

  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  systemctl enable docker
  systemctl start docker
}

write_config() {
  install -d -m 0755 "${INSTALL_DIR}"
  cp "${COMPOSE_SRC_DIR}/docker-compose.agent.yml" "${INSTALL_DIR}/docker-compose.yml"

  cat > "${INSTALL_DIR}/.env" <<EOF
MAIN_SERVER_URL=${MAIN_SERVER_URL}
AGENT_TOKEN=${AGENT_TOKEN}
ENCRYPTION_KEY_1=${ENCRYPTION_KEY_1}
UPTIME_AGENT_IMAGE=${UPTIME_AGENT_IMAGE}
AGENT_HTTP_TIMEOUT_MS=${AGENT_HTTP_TIMEOUT_MS}
AGENT_BUFFER_MAX=${AGENT_BUFFER_MAX}
AGENT_RESULT_MAX_BATCH=${AGENT_RESULT_MAX_BATCH}
EOF

  chmod 600 "${INSTALL_DIR}/.env"
}

write_service() {
  cp "${COMPOSE_SRC_DIR}/uptime-agent.service" "${SERVICE_PATH}"
  systemctl daemon-reload
  systemctl enable uptime-agent
}

harden_host() {
  if [[ "${HARDEN_HOST}" != "true" ]]; then
    echo "Skipping host firewall hardening (HARDEN_HOST=${HARDEN_HOST})"
    return
  fi

  # Agent nodes should not expose inbound services.
  ufw --force default deny incoming
  ufw --force default allow outgoing
  ufw allow OpenSSH
  ufw --force enable
}

start_agent() {
  systemctl restart uptime-agent
  sleep 2
  systemctl --no-pager --full status uptime-agent || true
  docker compose -f "${INSTALL_DIR}/docker-compose.yml" --env-file "${INSTALL_DIR}/.env" ps
}

main() {
  require_root
  install_docker
  write_config
  write_service
  harden_host
  start_agent

  echo ""
  echo "Agent installed."
  echo "Config: ${INSTALL_DIR}/.env"
  echo "Service: uptime-agent"
  echo "Logs: docker logs -f uptime-agent"
}

main "$@"
