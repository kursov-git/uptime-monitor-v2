#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/uptime-agent"
SERVICE_PATH="/etc/systemd/system/uptime-agent.service"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root"
  exit 1
fi

systemctl stop uptime-agent 2>/dev/null || true
systemctl disable uptime-agent 2>/dev/null || true

if [[ -f "${INSTALL_DIR}/docker-compose.yml" && -f "${INSTALL_DIR}/.env" ]]; then
  docker compose -f "${INSTALL_DIR}/docker-compose.yml" --env-file "${INSTALL_DIR}/.env" down || true
fi

rm -f "${SERVICE_PATH}"
systemctl daemon-reload

if [[ "${KEEP_CONFIG:-false}" != "true" ]]; then
  rm -rf "${INSTALL_DIR}"
fi

echo "Agent uninstalled."
