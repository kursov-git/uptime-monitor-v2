#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
SERVER_SERVICE="${SERVER_SERVICE:-server}"

echo "== API health =="
docker compose -f "${COMPOSE_FILE}" exec -T "${SERVER_SERVICE}" \
  node -e "fetch('http://127.0.0.1:3000/health').then(r=>r.text()).then(t=>process.stdout.write(t)).catch(err=>{console.error(err);process.exit(1)})" \
  | sed 's/^/  /'
echo
echo "== Runtime health =="
docker compose -f "${COMPOSE_FILE}" exec -T "${SERVER_SERVICE}" \
  node -e "fetch('http://127.0.0.1:3000/health/runtime').then(r=>r.text()).then(t=>process.stdout.write(t)).catch(err=>{console.error(err);process.exit(1)})" \
  | sed 's/^/  /'
echo
echo "== Compose services =="
docker compose -f "${COMPOSE_FILE}" ps
