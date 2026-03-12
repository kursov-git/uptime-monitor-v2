#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/uptime-agent"
ENV_FILE="${INSTALL_DIR}/.env"
COMPOSE_FILE="${INSTALL_DIR}/docker-compose.yml"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGISTRY_DEFAULT_IMAGE="ghcr.io/kursov-git/uptime-agent:v2-latest"
LOCAL_BUILD_DEFAULT_IMAGE="uptime-agent:local"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root"
  exit 1
fi

if [[ ! -f "${ENV_FILE}" || ! -f "${COMPOSE_FILE}" ]]; then
  echo "Agent is not installed in ${INSTALL_DIR}"
  exit 1
fi

DEPLOYMENT_MODE="$(grep '^AGENT_DEPLOYMENT_MODE=' "${ENV_FILE}" | cut -d= -f2- || true)"
if [[ -z "${DEPLOYMENT_MODE}" ]]; then
  if [[ -d "${INSTALL_DIR}/src" ]]; then
    DEPLOYMENT_MODE="local-build"
  else
    DEPLOYMENT_MODE="image"
  fi
fi

if [[ -n "${UPTIME_AGENT_IMAGE:-}" ]]; then
  if grep -q '^UPTIME_AGENT_IMAGE=' "${ENV_FILE}"; then
    sed -i "s|^UPTIME_AGENT_IMAGE=.*$|UPTIME_AGENT_IMAGE=${UPTIME_AGENT_IMAGE}|" "${ENV_FILE}"
  else
    echo "UPTIME_AGENT_IMAGE=${UPTIME_AGENT_IMAGE}" >> "${ENV_FILE}"
  fi
fi

if ! grep -q '^UPTIME_AGENT_IMAGE=' "${ENV_FILE}"; then
  if [[ "${DEPLOYMENT_MODE}" == "local-build" ]]; then
    echo "UPTIME_AGENT_IMAGE=${LOCAL_BUILD_DEFAULT_IMAGE}" >> "${ENV_FILE}"
  else
    echo "UPTIME_AGENT_IMAGE=${REGISTRY_DEFAULT_IMAGE}" >> "${ENV_FILE}"
  fi
fi

if [[ "${DEPLOYMENT_MODE}" == "local-build" ]]; then
  if [[ ! -f "${REPO_ROOT}/apps/agent/Dockerfile" || ! -f "${REPO_ROOT}/package-lock.json" ]]; then
    echo "Local-build deployment mode requires running update-agent.sh from a full repo checkout" >&2
    exit 1
  fi

  rm -rf "${INSTALL_DIR}/src"
  install -d -m 0755 "${INSTALL_DIR}/src"
  cp "${REPO_ROOT}/package.json" "${INSTALL_DIR}/src/package.json"
  cp "${REPO_ROOT}/package-lock.json" "${INSTALL_DIR}/src/package-lock.json"
  cp -R "${REPO_ROOT}/apps" "${INSTALL_DIR}/src/apps"
  cp -R "${REPO_ROOT}/packages" "${INSTALL_DIR}/src/packages"

  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --build --force-recreate
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps
  exit 0
fi

docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" pull
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --force-recreate

docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps
