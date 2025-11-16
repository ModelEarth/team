# Development Dockerfile for Rust API
FROM rust:1.91-slim-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    libpq-dev \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app/team

# Copy actual source code
COPY . .

# Build the application
RUN cargo build --release

# Expose API port
EXPOSE 8081

# Run the API server
CMD ["cargo", "run", "--release", "--bin", "partner_tools", "--", "serve"]