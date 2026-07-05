---
title: Teams Bot
description: Standing up the enter-bot webhook in Azure / Container Apps / on-prem.
---

`enter-bot` is a Bot Framework webhook. Deployment is the standard Bot Framework story — register an Azure Bot resource, set credentials, expose an HTTPS endpoint, and the bot listens on `/api/messages`.

If hosting is not decided yet, start with the [IT Approval Checklist](/deploy/it-checklist/). The bot is portable: it only needs a container runtime, HTTPS ingress, secrets, persistent storage, and outbound internet.

## Required environment

Copy `.env.example` at the repo root to `.env` and fill it in — it lists every variable with inline guidance. Minimum to start:

```text
MicrosoftAppId          = <Azure Bot App ID>
MicrosoftAppPassword    = <Azure Bot client secret>
MicrosoftAppTenantId    = <tenant id, for single-tenant bots>
ANTHROPIC_API_KEY       = sk-ant-...
GITHUB_APP_ID           = <GitHub App ID>
GITHUB_APP_PRIVATE_KEY_PATH = /etc/secrets/github-app.pem
ENTER_BOT_WORKTREES     = /var/lib/enter-bot/worktrees
ENTER_BOT_AUDIT_DB      = /var/lib/enter-bot/audit.db
```

Optional but recommended in production:

```text
ENTER_BOT_CHANNEL_ALLOWLIST  = <comma-separated channel IDs>
ENTER_BOT_ALLOWED_REPOS      = acme/foo,acme/bar
ENTER_BOT_MONTHLY_TOKEN_BUDGET = 1000000
```

See [Environment Variables](/config/env/) for the full inventory.

## Azure Bot resource

1. Create an **Azure Bot** resource (Bot Service / Multi-Tenant or Single-Tenant).
2. Capture the **Microsoft App ID** and generate a **client secret**.
3. Set the messaging endpoint to `https://<your-host>/api/messages`.
4. Enable the **Microsoft Teams** channel on the resource.
5. Side-load the bot into a test team using the manifest under `packages/teams-bot/teams-manifest/` (see its `README.md` — fill in the App ID, add icons, zip, upload).

## Hosting

The webhook is plain Node. A portable multi-stage `Dockerfile` lives at the repo root:

```sh
docker build -t enter-bot .
docker run -p 3978:3978 --env-file .env -v enter-bot-data:/var/lib/enter-bot enter-bot
```

It runs `node packages/teams-bot/dist/server.js` and exposes `$PORT` (default `3978`).

Building behind a corporate TLS-inspecting proxy (Netskope, Zscaler, …)? `npm ci` inside the build will fail TLS (often surfacing as npm's cryptic `Exit handler never called!`). Pass your corporate CA as a build secret — the Dockerfile trusts it for the install steps:

```sh
docker build --secret id=enter_ca,src=/path/to/corp-ca.pem -t enter-bot .
# or, via the all-in-one check:
ENTER_DOCKER_CA_CERT=/path/to/corp-ca.pem npm run verify:deploy
```

Pick any host:

- **Azure Container Apps** — push the image to Azure Container Registry, enable HTTPS ingress on port `3978`, configure secrets/env vars, and mount Azure Files at `/var/lib/enter-bot`.
- **Azure App Service for Containers** — deploy the image, set App Settings from `.env.example`, and attach persistent storage for `/var/lib/enter-bot`.
- **AWS ECS Fargate** — push the image to ECR, expose it through an HTTPS ALB, configure Secrets Manager/SSM env vars, and mount EFS at `/var/lib/enter-bot`.
- **Cloud Run / on-prem** — acceptable if the platform provides HTTPS ingress, secret storage, outbound internet, and persistent storage for `/var/lib/enter-bot`.

For the first pilot, set `ENTER_BOT_CHANNEL_ALLOWLIST` to one Teams channel and `ENTER_BOT_ALLOWED_REPOS` to the specific repos installed on the GitHub App.

## Preflight verification

Before handing the image to IT or deploying it yourself, run:

```sh
npm run verify:deploy
```

This validates required deployment files, checks that the Teams manifest omits personal scope, runs tests, builds core/bot/docs, and builds the Docker image. Use `npm run verify:deploy -- --skip-docker` if Docker is unavailable on the machine running the checks.

If your network intercepts TLS with an enterprise CA, pass the CA certificate for Docker build-time package installs:

```sh
ENTER_DOCKER_CA_CERT=/path/to/corporate-root-ca.pem npm run verify:deploy
```

The certificate is supplied as a BuildKit secret and is not copied into the repo.
- **On-prem** — anywhere with a reverse proxy that terminates TLS and forwards `/api/messages` is fine.

## Local development

Two routes:

### ngrok against a real Azure Bot

1. `node packages/teams-bot/dist/server.js`
2. `ngrok http 3978`
3. Update the Azure Bot messaging endpoint to the ngrok HTTPS URL.
4. Message the bot from Teams.

### Bot Framework Emulator

The Emulator is a desktop app that pretends to be Teams. To make it work, set the dev-only escape hatch:

```text
ENTER_BOT_ALLOW_DM=1
```

:::danger[Emulator only]
`ENTER_BOT_ALLOW_DM=1` disables the public-only constraint. Never set it in a deployed environment.
:::

## Worktrees + audit DB

The bot needs writable directories for `ENTER_BOT_WORKTREES` and `ENTER_BOT_AUDIT_DB`. In container deployments, mount a persistent volume — losing the audit DB means losing per-channel token-budget bookkeeping. Losing the worktrees just means the next message re-clones.
