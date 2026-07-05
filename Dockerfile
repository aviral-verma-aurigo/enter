# syntax=docker/dockerfile:1.7
# enter-bot — Microsoft Teams webhook. Portable; runs on Azure App Service /
# Container Apps / Fargate / Cloud Run / on-prem behind a TLS proxy.
# Build from the repo root:  docker build -t enter-bot .
# Run:  docker run -p 3978:3978 --env-file .env -v enter-bot-data:/var/lib/enter-bot enter-bot

# ─── Build stage: compile all workspaces ────────────────────────────────────
# better-sqlite3 (in @enter/core) is a native module — needs python3 + a C++
# toolchain to build its prebuild on Node 22.
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install with full workspace context so npm resolves the local packages.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json packages/cli/
COPY packages/teams-bot/package.json packages/teams-bot/
COPY packages/docs/package.json packages/docs/
RUN --mount=type=secret,id=enter_ca,target=/usr/local/share/ca-certificates/enter-extra-ca.crt,required=false \
    if [ -s /usr/local/share/ca-certificates/enter-extra-ca.crt ]; then \
      update-ca-certificates; \
      export NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/enter-extra-ca.crt; \
    fi \
    && npm ci

COPY . .
RUN npm run build:core && npm run build:bot

# ─── Runtime stage: prod deps only ──────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Reinstall without dev deps; native module rebuilds against the runtime image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates python3 make g++ git \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json packages/cli/
COPY packages/teams-bot/package.json packages/teams-bot/
COPY packages/docs/package.json packages/docs/
RUN --mount=type=secret,id=enter_ca,target=/usr/local/share/ca-certificates/enter-extra-ca.crt,required=false \
    if [ -s /usr/local/share/ca-certificates/enter-extra-ca.crt ]; then \
      update-ca-certificates; \
      export NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/enter-extra-ca.crt; \
    fi \
    && npm ci --omit=dev

# Built JS only — no sources.
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/teams-bot/dist packages/teams-bot/dist

# Default writable locations; override via env / mount a volume here.
ENV ENTER_BOT_WORKTREES=/var/lib/enter-bot/worktrees \
    ENTER_BOT_AUDIT_DB=/var/lib/enter-bot/audit.db \
    PORT=3978
RUN mkdir -p /var/lib/enter-bot/worktrees
VOLUME ["/var/lib/enter-bot"]

EXPOSE 3978
CMD ["node", "packages/teams-bot/dist/server.js"]
