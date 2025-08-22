#!/bin/sh
set -eu

export SERVER_HOST="${SERVER_HOST:-0.0.0.0}"
export SERVER_PORT="${SERVER_PORT:-${PORT:-8080}}"

echo "[start.sh] PORT=${PORT:-unset} SERVER_HOST=$SERVER_HOST SERVER_PORT=$SERVER_PORT"
echo "[start.sh] ls -la /app && tree -L 2 /app 2>/dev/null || true"
ls -la /app || true

exec /app/partner_tools serve
