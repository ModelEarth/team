#!/bin/bash
# Start the Rust API server on port 8081 and wait until it responds.

PORT=8081
HEALTH_URL="http://localhost:${PORT}/api/health"
STARTUP_TIMEOUT=120

if lsof -ti:${PORT} > /dev/null 2>&1; then
    if curl -fsS --max-time 5 "${HEALTH_URL}" > /dev/null 2>&1; then
        echo "Rust API server already running and healthy on port ${PORT}"
        exit 0
    fi

    echo "Port ${PORT} is already in use, but the Rust API health check failed: ${HEALTH_URL}"
    exit 1
fi

cd "$(dirname "$0")"

source ~/.cargo/env 2>/dev/null
if ! command -v cargo > /dev/null 2>&1; then
    echo "Rust/Cargo not found. Install with: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi

if [ ! -f ../docker/.env ]; then
    cp ../docker/.env.example ../docker/.env
fi

nohup cargo run --bin partner_tools -- serve > server.log 2>&1 &
SERVER_PID=$!

SECONDS_WAITED=0
while [ "${SECONDS_WAITED}" -lt "${STARTUP_TIMEOUT}" ]; do
    if curl -fsS --max-time 5 "${HEALTH_URL}" > /dev/null 2>&1; then
        echo "Started Rust API server on port ${PORT} (pid ${SERVER_PID})"
        exit 0
    fi

    if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
        echo "Rust API server failed to start. See team/server.log for details."
        exit 1
    fi

    sleep 2
    SECONDS_WAITED=$((SECONDS_WAITED + 2))
done

echo "Rust API server did not become healthy within ${STARTUP_TIMEOUT} seconds. See team/server.log for details."
exit 1
