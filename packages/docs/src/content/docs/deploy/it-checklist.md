---
title: IT Approval Checklist
description: Information to request before hosting enter-bot in Azure or AWS.
---

Use this checklist when the hosting environment is not decided yet. The bot is a containerized HTTPS webhook, so either Azure or AWS is acceptable as long as the platform provides ingress, secrets, persistent storage, and outbound internet.

## Request

Ask IT to approve one hosting path for a pilot deployment:

| Area | Azure option | AWS option |
|---|---|---|
| Container runtime | Azure Container Apps or App Service for Containers | ECS Fargate |
| Registry | Azure Container Registry | ECR |
| HTTPS ingress | Container Apps ingress or App Service TLS endpoint | ALB with ACM certificate |
| Persistent storage | Azure Files mounted at `/var/lib/enter-bot` | EFS mounted at `/var/lib/enter-bot` |
| Secrets | Container App secrets / App Service settings / Key Vault | ECS task secrets / Secrets Manager |
| Logs | Azure Monitor / Log Analytics | CloudWatch Logs |

The first pilot should be limited to one test Teams channel and an explicit GitHub repo allowlist.

## Required approvals

- Public HTTPS endpoint that can receive Bot Framework POSTs at `/api/messages`.
- Outbound internet from the container to Microsoft Bot Framework, GitHub, the model provider, and any enabled integrations.
- Secret storage for the model API key, Azure Bot secret, and GitHub App private key.
- Persistent writable volume at `/var/lib/enter-bot`.
- Teams custom app upload or admin-managed app deployment for the pilot team.
- GitHub organization approval to create and install the Enter GitHub App on selected repos.
- DNS name and TLS certificate owner for the final webhook URL.

## Required secrets

Minimum production secrets:

```text
ANTHROPIC_API_KEY
MicrosoftAppId
MicrosoftAppPassword
MicrosoftAppTenantId
GITHUB_APP_ID
GITHUB_APP_PRIVATE_KEY_PATH or GITHUB_APP_PRIVATE_KEY
```

Minimum operational settings:

```text
ENTER_BOT_WORKTREES=/var/lib/enter-bot/worktrees
ENTER_BOT_AUDIT_DB=/var/lib/enter-bot/audit.db
ENTER_BOT_CHANNEL_ALLOWLIST=<test channel id>
ENTER_BOT_ALLOWED_REPOS=<owner/repo>
ENTER_BOT_MONTHLY_TOKEN_BUDGET=1000000
```

Optional integrations such as Azure DevOps, Confluence, Aha!, and MCP servers should stay disabled for the first pilot unless each credential and data boundary is approved.

## Acceptance

The pilot is ready when:

- `/healthz` returns `status: ok` from the approved HTTPS host.
- The Azure Bot messaging endpoint is `https://<host>/api/messages`.
- The Teams manifest is installed in the test team and has no `personal` scope.
- `@Enter hello` gets a response in the allowlisted public channel.
- A request against a non-allowlisted channel is refused.
- Enter can clone an allowlisted GitHub repo, push a branch, and open a draft PR.
