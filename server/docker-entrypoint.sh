#!/bin/sh
set -e

# Fix ownership of data volume (may have been created by root)
chown -R node:node /data

ROLE="${SERVER_ROLE:-all}"
DB_INIT_ON_START="${DB_INIT_ON_START:-auto}"

if [ "$DB_INIT_ON_START" = "auto" ]; then
  case "$ROLE" in
    api|all|"")
      DB_INIT_ON_START="true"
      ;;
    *)
      DB_INIT_ON_START="false"
      ;;
  esac
fi

if [ "$DB_INIT_ON_START" = "true" ]; then
  echo "Running database migrations for SERVER_ROLE=$ROLE..."
  gosu node npx prisma@5.22.0 migrate deploy

  echo "Seeding database for SERVER_ROLE=$ROLE..."
  gosu node node prisma/seed.js
else
  echo "Skipping database init for SERVER_ROLE=$ROLE"
fi

# Start application as non-root user
exec gosu node "$@"
