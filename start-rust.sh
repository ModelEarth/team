#!/bin/bash
# Start the Rust API server on port 8081 if not already running

if lsof -ti:8081 > /dev/null 2>&1; then
    echo "Rust API server already running on port 8081"
    exit 0
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
echo "Started Rust API server on port 8081"
