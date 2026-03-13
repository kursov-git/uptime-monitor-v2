#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.split.yml}"
SERVER_SERVICE="${SERVER_SERVICE:-server}"
BASE_URL="${BASE_URL:-https://ping-agent.ru}"

cd "${ROOT_DIR}"

echo "== Git state =="
git status --short || true
echo "HEAD=$(git rev-parse HEAD)"
echo

echo "== Compose services =="
docker compose -f "${COMPOSE_FILE}" ps
echo

echo "== API health =="
docker compose -f "${COMPOSE_FILE}" exec -T "${SERVER_SERVICE}" \
  node -e "fetch('http://127.0.0.1:3000/health').then(async r=>{process.stdout.write(String(r.status)+' '+await r.text())}).catch(err=>{console.error(err);process.exit(1)})"
echo
echo

echo "== Runtime health =="
docker compose -f "${COMPOSE_FILE}" exec -T "${SERVER_SERVICE}" \
  node -e "fetch('http://127.0.0.1:3000/health/runtime').then(async r=>{process.stdout.write(String(r.status)+' '+await r.text())}).catch(err=>{console.error(err);process.exit(1)})"
echo
echo

echo "== External public status =="
curl -fsS -o /dev/null -w "status page: %{http_code}\n" "${BASE_URL}/status"
curl -fsS -o /dev/null -w "public api: %{http_code}\n" "${BASE_URL}/api/public/status"
echo

echo "== External restricted surfaces =="
curl -sS -o /dev/null -w "health: %{http_code}\n" "${BASE_URL}/health"
curl -sS -o /dev/null -w "runtime: %{http_code}\n" "${BASE_URL}/health/runtime"
echo

echo "Resume smoke-check completed."
