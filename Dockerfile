# ─── BUILD STAGE ────────────────────────────────────────────────
FROM rust:1.88-slim as builder

# Add required system dependencies for building Rust app
RUN apt-get update && apt-get install -y \
    libpq-dev \
    pkg-config \
    build-essential \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Optimize build cache by prefetching dependencies
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo fetch

# Now copy full source and build it
COPY . .
RUN cargo build --release --bin gemini_crm



# ─── RUNTIME STAGE ──────────────────────────────────────────────
FROM debian:bookworm-slim

# Add only the runtime dependencies
RUN apt-get update && apt-get install -y \
    libssl3 \
    libpq5 \
    ca-certificates \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy compiled Rust binary
COPY --from=builder /app/target/release/gemini_crm ./gemini_crm

# Copy static assets and runtime config
COPY admin admin
COPY config config
COPY preferences preferences

# Copy the wait-for-it script into container
COPY wait-for-it.sh ./wait-for-it.sh
RUN chmod +x ./wait-for-it.sh

# Expose app port
EXPOSE 8081

# Entrypoint waits for DB to be ready, then runs server
ENTRYPOINT ["./wait-for-it.sh", "db", "5432", "--", "./gemini_crm", "serve"]
