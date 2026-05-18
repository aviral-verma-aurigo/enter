---
title: Environment Variables
description: Every env var Enter reads — CLI, Teams bot, GitHub App, operational.
---

Variables grouped by what reads them.

## Anthropic / model providers

| Variable | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | Required for the default `anthropic` provider. Also used by `delegate_to_claude_code` and the `author_skill` critique. |

Additional provider keys depend on which model provider you're using (e.g. `OPENAI_API_KEY` for `provider: "openai"`).

## CLI overrides

| Variable | Effect |
|---|---|
| `ENTER_HOME` | Override `~/.enter` (state root). |
| `ENTER_MODEL` | Default model id. Equivalent to `--model`. |
| `ENTER_PROVIDER` | Default provider. Equivalent to `--provider`. |
| `ENTER_LOG` | `debug` / `info` / `warn` / `error`. Default `info`. |
| `NO_COLOR` | Standard NO_COLOR; disables ANSI in the TUI and the simple fallback. |

## Teams Bot — Bot Framework

| Variable | Effect |
|---|---|
| `PORT` | Bot webhook port. Default `3978`. |
| `MicrosoftAppId` | Azure Bot resource App ID. |
| `MicrosoftAppPassword` | Azure Bot resource client secret. |
| `MicrosoftAppTenantId` | Tenant ID (single-tenant bots). |
| `ENTER_BOT_HOME` | Override `~/.enter` for the bot process (alias for `ENTER_HOME`). |

## Teams Bot — GitHub App

| Variable | Effect |
|---|---|
| `GITHUB_APP_ID` | App ID from the GitHub App's settings page. |
| `GITHUB_APP_PRIVATE_KEY_PATH` | Path to the App's `.pem` private key. |
| `GITHUB_APP_PRIVATE_KEY` | Alternative: PEM contents inline (supports `\n` escape). |
| `GITHUB_APP_INSTALLATION_ID` | Installation ID. Optional — auto-discovered if omitted. |

If `GITHUB_APP_ID` is unset, GitHub-backed tools (`git_clone`, `git_push`, `github_pr_open`, `github_pr_comment`) refuse with a configuration error.

## Azure DevOps (read by CLI and Teams bot)

ADO tools (`ado_work_item_get`, `ado_work_item_comment`, `ado_work_item_link_pr`, `ado_query`) register in both `enter` and `enter-bot` when these are set. Two auth modes — pick one.

**PAT (fastest; recommended for CLI use):**

| Variable | Effect |
|---|---|
| `ADO_ORG_URL` | ADO organization URL, e.g. `https://dev.azure.com/your-org`. |
| `ADO_PAT` | Personal Access Token from `https://dev.azure.com/<org>/_usersSettings/tokens`. Scopes needed: Work Items (Read & write). |

**Service principal (recommended for the Teams bot):**

| Variable | Effect |
|---|---|
| `ADO_ORG_URL` | ADO organization URL. |
| `ADO_TENANT_ID` | Entra ID tenant ID. |
| `ADO_CLIENT_ID` | Entra ID app registration (service-principal) client ID. |
| `ADO_CLIENT_SECRET` | Entra ID app registration client secret. |

The service principal needs Reader/Contributor access on the ADO organization (added under Organization settings → Users). The CLI prefers `ADO_PAT` if both modes' vars are set. If neither is set, ADO tools are not registered and `/healthz` (bot only) reports `"ado": "missing"`.

## Confluence Cloud (read by CLI and Teams bot)

Confluence tools (`confluence_page_get`, `confluence_search`, `confluence_page_append_comment`) register in both `enter` and `enter-bot` when these are set.

| Variable | Effect |
|---|---|
| `CONFLUENCE_BASE_URL` | Confluence Cloud base URL including `/wiki`, e.g. `https://your.atlassian.net/wiki`. |
| `CONFLUENCE_USER` | Bot account email. |
| `CONFLUENCE_API_TOKEN` | API token from id.atlassian.com → Manage account → Security → API tokens. |

All three must be set together. If any are missing, Confluence tools are not registered. The bot account needs read access to the spaces you want the bot to query and write access if you want it to append comments. The CLI and the bot share the same shared-credential pattern — no per-user OAuth.

## Teams Bot — Aha! (service-account API key)

| Variable | Effect |
|---|---|
| `AHA_BASE_URL` | Aha! instance URL, e.g. `https://your.aha.io`. |
| `AHA_API_KEY` | API key from Aha! → Settings → Account → API. |

Both must be set together. If either is missing, Aha! tools are disabled.

## Teams Bot — operational

| Variable | Effect |
|---|---|
| `ENTER_BOT_WORKTREES` | Root directory for per-channel git worktrees. Default `/var/lib/enter-bot/worktrees`. |
| `ENTER_BOT_AUDIT_DB` | SQLite path for the audit log. Default `/var/lib/enter-bot/audit.db`. |
| `ENTER_BOT_CHANNEL_ALLOWLIST` | Comma-separated channel IDs. If unset, every public channel is allowed. |
| `ENTER_BOT_MONTHLY_TOKEN_BUDGET` | Per-channel token cap per calendar month. Default `1000000`. |
| `ENTER_BOT_ALLOWED_REPOS` | Comma-separated `owner/name` allowlist for `git_clone`. If unset, every repo the GitHub App is installed on is allowed. |
| `ENTER_BOT_ALLOW_DM` | Set `1` to permit DMs. Developer-only escape hatch for the Bot Framework Emulator. Leave unset in production. |
