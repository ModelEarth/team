#!/usr/bin/env bash
# wait-for-it.sh: Wait until a host:port becomes available
# NOTE: may not be used in db yet
# Usage:
#   ./wait-for-it.sh host port [-- command args...]

HOST="$1"
shift
PORT="$1"
shift

# Default timeout (override with WAITFORIT_TIMEOUT)
TIMEOUT="${WAITFORIT_TIMEOUT:-15}"

echo "Waiting for $HOST:$PORT to become available..."

for i in $(seq $TIMEOUT); do
  if nc -z "$HOST" "$PORT"; then
    echo "$HOST:$PORT is available."
    exec "$@"  # Run the remaining command
    exit
  fi
  echo "Still waiting ($i/$TIMEOUT)..."
  sleep 1
done

echo "Error: Timeout while waiting for $HOST:$PORT"
exit 1
