#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
DB_SERVICE="${DB_SERVICE:-server}"
BACKUP_DIR_IN_CONTAINER="${BACKUP_DIR_IN_CONTAINER:-/data/backups}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_NAME="${BACKUP_NAME:-uptime-${TIMESTAMP}.db}"
BACKUP_PATH="${BACKUP_DIR_IN_CONTAINER}/${BACKUP_NAME}"

echo "Creating SQLite backup via ${COMPOSE_FILE} (${DB_SERVICE})..."

docker compose -f "${COMPOSE_FILE}" run --rm --no-deps --entrypoint sh "${DB_SERVICE}" -lc "
  set -e
  mkdir -p '${BACKUP_DIR_IN_CONTAINER}'
  : \"\${DATABASE_URL:?DATABASE_URL is required inside container}\"
  case \"\${DATABASE_URL}\" in
    file:*)
      ;;
    *)
      echo 'This backup script currently supports SQLite DATABASE_URL only.' >&2
      exit 2
      ;;
  esac
  printf \"%s\" \"VACUUM INTO '${BACKUP_PATH}';\" | npx prisma db execute --url \"\${DATABASE_URL}\" --stdin
"

echo "Backup created: ${BACKUP_PATH}"
echo "List backups:"
docker compose -f "${COMPOSE_FILE}" run --rm --no-deps --entrypoint sh "${DB_SERVICE}" -lc "ls -lh '${BACKUP_DIR_IN_CONTAINER}'"
