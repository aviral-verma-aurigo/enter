---
title: Teams Bot
description: Standing up the enter-bot webhook in Azure / Container Apps / on-prem.
---

`enter-bot` is a Bot Framework webhook. Deployment is the standard Bot Framework story — register an Azure Bot resource, set credentials, expose an HTTPS endpoint, and the bot listens on `/api/messages`.

## Required environment

Minimum to start:

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
5. Side-load the bot into a test team using a Teams manifest that references the App ID.

## Hosting

The webhook is plain Node — pick any host:

- **Azure App Service** — push the built `packages/teams-bot/dist/` plus `package.json`, set env vars in the App Settings blade.
- **Azure Container Apps / AWS Fargate / Cloud Run** — wrap in a Dockerfile that runs `node packages/teams-bot/dist/server.js` and exposes `$PORT` (default `3978`).
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
