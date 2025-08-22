# -----------------------------
# BUILD STAGE
# -----------------------------
    FROM rust:1.88-slim AS builder
    RUN apt-get update && apt-get install -y \
        pkg-config libssl-dev libpq-dev ca-certificates \
     && rm -rf /var/lib/apt/lists/*
    WORKDIR /usr/src/app
    COPY . .
    RUN cargo build --release

# -----------------------------
# RUNTIME STAGE
# -----------------------------
    FROM debian:bookworm-slim

    RUN apt-get update && apt-get install -y \
        ca-certificates \
        libssl3 \
        libpq5 \
     && rm -rf /var/lib/apt/lists/*

    WORKDIR /app

    # Binary
    COPY --from=builder /usr/src/app/target/release/partner_tools /app/

    # 🔹 Copy runtime assets your app uses
    COPY admin /app/admin
    COPY config /app/config
    COPY preferences /app/preferences

    # 🔹 Startup wrapper (from docker/start.sh)
    COPY docker/start.sh /app/start.sh
    RUN chmod +x /app/start.sh

    ENV RUST_LOG=info

    # Cloud Run port
    EXPOSE 8080

    ENTRYPOINT ["/app/start.sh"]
