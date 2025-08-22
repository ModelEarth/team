#!/usr/bin/env bash
set -euo pipefail

# Loads .env into current shell (dotenv style).
# - Ignores comments and blank lines
# - Allows quoted or unquoted values
# - Does NOT export values already set in the environment (those win)

ENV_FILE="${1:-.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Create it or pass a path: scripts/load_env.sh path/to/.env" >&2
  exit 1
fi

# shellcheck disable=SC2163
while IFS='=' read -r key value; do
  # strip whitespace
  key="$(echo "$key" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  value="$(echo "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

  # skip comments/blank
  [[ -z "$key" ]] && continue
  [[ "$key" =~ ^# ]] && continue

  # drop inline comments (KEY=val # comment)
  value="${value%%#*}"

  # strip surrounding quotes if any
  if [[ "${value}" =~ ^\".*\"$ || "${value}" =~ ^\'.*\'$ ]]; then
    value="${value:1:-1}"
  fi

  # only set if not already in env
  if [[ -z "${!key:-}" ]]; then
    export "$key=$value"
  fi
done < "$ENV_FILE"
