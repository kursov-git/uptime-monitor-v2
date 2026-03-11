#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVER_DIR="$ROOT_DIR/server"

cd "$SERVER_DIR"

export DATABASE_URL="file:./e2e.db"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
export JWT_SECRET="${JWT_SECRET:-e2e-jwt-secret}"
export ENABLE_BUILTIN_WORKER="false"

rm -f e2e.db e2e.db-journal
npx prisma db push
node prisma/seed.js

npm run dev
