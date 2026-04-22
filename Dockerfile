# syntax=docker/dockerfile:1.7
# Build the Axum API for deployment (Railway, Fly, Render, etc.).
# Railway auto-detects this Dockerfile at the repo root.

# ---------- build stage ----------
FROM rust:1.84-slim-bookworm AS builder

ENV CARGO_TERM_COLOR=always
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      pkg-config libssl-dev ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Workspace manifests + pinned toolchain first so layers cache on unrelated edits.
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY apps/api/Cargo.toml apps/api/Cargo.toml

# Pre-fetch dependencies with an empty main to populate Cargo's registry cache.
RUN mkdir -p apps/api/src \
 && echo 'fn main() {}' > apps/api/src/main.rs \
 && cargo build --release --bin sui-sports-api \
 && rm -rf apps/api/src

# Real sources (including compile-time embedded migrations).
COPY apps/api apps/api

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --release --bin sui-sports-api \
 && cp target/release/sui-sports-api /app/sui-sports-api

# ---------- runtime stage ----------
FROM debian:bookworm-slim AS runtime

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates libssl3 tini \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --no-create-home app

WORKDIR /app
COPY --from=builder /app/sui-sports-api ./sui-sports-api
RUN chown -R app:app /app

USER app

# Railway/Fly/Render inject PORT at runtime. The binary also respects BIND_ADDR
# directly. When PORT is set, config.rs will bind 0.0.0.0:$PORT.
ENV RUST_LOG=info
EXPOSE 8080

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/sui-sports-api"]
