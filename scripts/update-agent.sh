#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/uptime-agent"
ENV_FILE="${INSTALL_DIR}/.env"
COMPOSE_FILE="${INSTALL_DIR}/docker-compose.yml"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root"
  exit 1
fi

if [[ ! -f "${ENV_FILE}" || ! -f "${COMPOSE_FILE}" ]]; then
  echo "Agent is not installed in ${INSTALL_DIR}"
  exit 1
fi

if [[ -n "${UPTIME_AGENT_IMAGE:-}" ]]; then
  if grep -q '^UPTIME_AGENT_IMAGE=' "${ENV_FILE}"; then
    sed -i "s|^UPTIME_AGENT_IMAGE=.*$|UPTIME_AGENT_IMAGE=${UPTIME_AGENT_IMAGE}|" "${ENV_FILE}"
  else
    echo "UPTIME_AGENT_IMAGE=${UPTIME_AGENT_IMAGE}" >> "${ENV_FILE}"
  fi
fi

docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" pull
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --force-recreate

docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps
