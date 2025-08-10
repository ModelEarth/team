# ─────────────────────────────
# BUILD STAGE
# ─────────────────────────────
FROM rust:1.88-slim AS builder

# System deps needed to compile with sqlx/postgres + openssl
RUN apt-get update && apt-get install -y \
    libpq-dev \
    libssl-dev \
    pkg-config \
    build-essential \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache deps first
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo fetch

# Now bring in the real sources and build release binary
COPY . .
RUN cargo build --release --bin gemini_crm

# ─────────────────────────────
# RUNTIME STAGE
# ─────────────────────────────
FROM debian:bookworm-slim

# Only runtime libs required by the compiled binary
RUN apt-get update && apt-get install -y \
    libssl3 \
    libpq5 \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the compiled binary
COPY --from=builder /app/target/release/gemini_crm ./gemini_crm

# Copy static/runtime assets your app expects at runtime
COPY admin admin
COPY config config
COPY preferences preferences

EXPOSE 8081

# Keep startup simple & reproducible; health/waits handled by Compose/Fly
ENTRYPOINT ["./gemini_crm", "serve"]
