#!/usr/bin/env bash
set -euo pipefail

# Install and run uptime agent as a hardened docker-compose workload.
# Works on Debian/Ubuntu hosts.

INSTALL_DIR="/opt/uptime-agent"
SERVICE_PATH="/etc/systemd/system/uptime-agent.service"
COMPOSE_SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/deployment/agent"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_BUILD_COMPOSE_SRC="${COMPOSE_SRC_DIR}/docker-compose.agent.yml"
IMAGE_COMPOSE_SRC="${COMPOSE_SRC_DIR}/docker-compose.agent.image.yml"

: "${MAIN_SERVER_URL:?MAIN_SERVER_URL is required}"
: "${AGENT_TOKEN:?AGENT_TOKEN is required}"

REGISTRY_DEFAULT_IMAGE="ghcr.io/kursov-git/uptime-agent:v2-latest"
LOCAL_BUILD_DEFAULT_IMAGE="uptime-agent:local"

UPTIME_AGENT_IMAGE="${UPTIME_AGENT_IMAGE:-}"
ENCRYPTION_KEY_1="${ENCRYPTION_KEY_1:-}"
AGENT_HTTP_TIMEOUT_MS="${AGENT_HTTP_TIMEOUT_MS:-10000}"
AGENT_BUFFER_MAX="${AGENT_BUFFER_MAX:-1000}"
AGENT_RESULT_MAX_BATCH="${AGENT_RESULT_MAX_BATCH:-500}"
AGENT_MAX_CONCURRENCY="${AGENT_MAX_CONCURRENCY:-6}"
ALLOW_PRIVATE_MONITOR_TARGETS="${ALLOW_PRIVATE_MONITOR_TARGETS:-false}"
HARDEN_HOST="${HARDEN_HOST:-true}"
AGENT_DEPLOYMENT_MODE="${AGENT_DEPLOYMENT_MODE:-auto}"

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

detect_mode() {
  case "${AGENT_DEPLOYMENT_MODE}" in
    local-build|image)
      printf '%s\n' "${AGENT_DEPLOYMENT_MODE}"
      ;;
    auto)
      if [[ -f "${REPO_ROOT}/apps/agent/Dockerfile" && -f "${REPO_ROOT}/package-lock.json" ]]; then
        printf '%s\n' "local-build"
      else
        printf '%s\n' "image"
      fi
      ;;
    *)
      echo "Unsupported AGENT_DEPLOYMENT_MODE=${AGENT_DEPLOYMENT_MODE}" >&2
      exit 1
      ;;
  esac
}

resolve_image_name() {
  local mode="$1"
  if [[ -n "${UPTIME_AGENT_IMAGE}" ]]; then
    printf '%s\n' "${UPTIME_AGENT_IMAGE}"
    return
  fi

  if [[ "${mode}" == "local-build" ]]; then
    printf '%s\n' "${LOCAL_BUILD_DEFAULT_IMAGE}"
    return
  fi

  printf '%s\n' "${REGISTRY_DEFAULT_IMAGE}"
}

copy_source_tree() {
  rm -rf "${INSTALL_DIR}/src"
  install -d -m 0755 "${INSTALL_DIR}/src"
  cp "${REPO_ROOT}/package.json" "${INSTALL_DIR}/src/package.json"
  cp "${REPO_ROOT}/package-lock.json" "${INSTALL_DIR}/src/package-lock.json"
  cp -R "${REPO_ROOT}/apps" "${INSTALL_DIR}/src/apps"
  cp -R "${REPO_ROOT}/packages" "${INSTALL_DIR}/src/packages"
}

write_config() {
  local mode="$1"
  local image_name
  image_name="$(resolve_image_name "${mode}")"
  install -d -m 0755 "${INSTALL_DIR}"
  if [[ "${mode}" == "local-build" ]]; then
    cp "${LOCAL_BUILD_COMPOSE_SRC}" "${INSTALL_DIR}/docker-compose.yml"
    copy_source_tree
  else
    cp "${IMAGE_COMPOSE_SRC}" "${INSTALL_DIR}/docker-compose.yml"
    rm -rf "${INSTALL_DIR}/src"
  fi

  cat > "${INSTALL_DIR}/.env" <<EOF
MAIN_SERVER_URL=${MAIN_SERVER_URL}
AGENT_TOKEN=${AGENT_TOKEN}
ENCRYPTION_KEY_1=${ENCRYPTION_KEY_1}
UPTIME_AGENT_IMAGE=${image_name}
AGENT_HTTP_TIMEOUT_MS=${AGENT_HTTP_TIMEOUT_MS}
AGENT_BUFFER_MAX=${AGENT_BUFFER_MAX}
AGENT_RESULT_MAX_BATCH=${AGENT_RESULT_MAX_BATCH}
AGENT_MAX_CONCURRENCY=${AGENT_MAX_CONCURRENCY}
ALLOW_PRIVATE_MONITOR_TARGETS=${ALLOW_PRIVATE_MONITOR_TARGETS}
AGENT_DEPLOYMENT_MODE=${mode}
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
  local mode="$1"
  if [[ "${mode}" == "image" ]]; then
    docker compose -f "${INSTALL_DIR}/docker-compose.yml" --env-file "${INSTALL_DIR}/.env" pull
  fi

  systemctl restart uptime-agent
  sleep 2
  systemctl --no-pager --full status uptime-agent || true
  docker compose -f "${INSTALL_DIR}/docker-compose.yml" --env-file "${INSTALL_DIR}/.env" ps
}

main() {
  require_root
  install_docker
  local mode
  mode="$(detect_mode)"
  write_config "${mode}"
  write_service
  harden_host
  start_agent "${mode}"

  echo ""
  echo "Agent installed."
  echo "Config: ${INSTALL_DIR}/.env"
  echo "Service: uptime-agent"
  echo "Mode: ${mode}"
  echo "Logs: docker logs -f uptime-agent"
}

main "$@"
