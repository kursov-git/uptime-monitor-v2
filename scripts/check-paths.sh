#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-staged}"

if [[ "$MODE" == "staged" ]]; then
  CMD=(git diff --cached --name-only --diff-filter=ACMR -z)
elif [[ "$MODE" == "all" ]]; then
  CMD=(git ls-files -z --cached --others --exclude-standard)
else
  echo "Usage: $0 [staged|all]" >&2
  exit 2
fi

bad=0

while IFS= read -r -d '' path; do
  [[ -z "$path" ]] && continue
  if [[ "$MODE" == "all" && ! -e "$path" ]]; then
    continue
  fi

  if [[ "$path" == *:* || "$path" == *\\* ]]; then
    echo "Invalid path (contains ':' or '\\'): $path" >&2
    bad=1
    continue
  fi

  # Reject non-ASCII/control characters in path names.
  if printf '%s' "$path" | LC_ALL=C grep -q '[^ -~]'; then
    echo "Invalid path (non-ASCII/control chars): $path" >&2
    bad=1
  fi
done < <("${CMD[@]}")

if [[ "$bad" -ne 0 ]]; then
  echo "Path validation failed." >&2
  exit 1
fi

echo "Path validation passed."
