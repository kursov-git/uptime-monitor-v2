#!/usr/bin/env bash
set -euo pipefail

paths=(
  server/src
  client/src
  apps/agent/src
  packages/checker/src
  packages/shared/src
)

patterns=(
  'as any'
  'Record<string, any>'
  'z\.any\('
  'catch \(err: any\)'
  ': any'
  '<T = any>'
  'data\?: any'
  'config\?: any'
)

rg_args=(-n --glob '*.ts' --glob '*.tsx')
for pattern in "${patterns[@]}"; do
  rg_args+=(-e "$pattern")
done

if rg "${rg_args[@]}" "${paths[@]}"; then
  echo "Unsafe TypeScript contract patterns found." >&2
  exit 1
fi

echo "TypeScript contract scan passed."
