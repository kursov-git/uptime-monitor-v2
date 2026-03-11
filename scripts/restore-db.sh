#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /data/backups/uptime-YYYYMMDDTHHMMSSZ.db" >&2
  exit 1
fi

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
DB_SERVICE="${DB_SERVICE:-server}"
BACKUP_PATH="$1"

echo "Restoring SQLite backup ${BACKUP_PATH} via ${COMPOSE_FILE} (${DB_SERVICE})..."
echo "Stopping compose stack to avoid concurrent writes..."
docker compose -f "${COMPOSE_FILE}" down

docker compose -f "${COMPOSE_FILE}" run --rm --no-deps --entrypoint sh "${DB_SERVICE}" -lc "
  set -e
  if [ ! -f '${BACKUP_PATH}' ]; then
    echo 'Backup file not found: ${BACKUP_PATH}' >&2
    exit 2
  fi
  cp '${BACKUP_PATH}' /data/uptime.db
"

echo "Starting compose stack again..."
docker compose -f "${COMPOSE_FILE}" up -d
echo "Restore completed."
