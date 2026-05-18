---
title: Integrations
description: External systems Enter can read from and write to — and how to wire each one up.
---

Enter talks to a small, deliberate set of external systems. Each one follows the same pattern: **service-account auth, never per-user OAuth**. The bot acts as itself; the human who triggered the request is recorded as attribution metadata (in PR bodies, work-item comments, audit rows).

These pages are the **canonical** place for auth setup, scopes, attribution semantics, and gotchas. [`reference/tools`](/reference/tools/) is the flat alphabetical index of every tool — when you want the full Typebox-backed parameter list, look there.

## Supported integrations

| Integration | Surfaces | Auth | Reads | Writes |
|---|---|---|---|---|
| [Azure DevOps](/integrations/ado/) | CLI + Teams bot | PAT or Entra service principal | Work items, WIQL queries | Create, update, comment, link, link-to-PR |
| [Confluence Cloud](/integrations/confluence/) | CLI + Teams bot | Bot account + API token | Page get, CQL search | Append footer comment |
| [Aha!](/integrations/aha/) | CLI + Teams bot | API key | Feature get, release get | Feature comment |
| [GitHub](/integrations/github/) | Teams bot only | GitHub App | PR fetch | PR open / comment / review, git clone / push (bot **never merges**) |
| [Model Context Protocol](/integrations/mcp/) | CLI + Teams bot | Per-server (see config) | Whatever the MCP server exposes | Whatever the MCP server exposes |

## How an integration "shows up"

When the integration's env vars are set, its tools are registered automatically at startup. When they're missing, the tools simply aren't registered — no broken stubs, no half-loaded auth. The bot's `/healthz` endpoint reports per-integration status as `ready` / `missing`.

The full env-var matrix lives in [Environment Variables](/config/env/); each integration page below points at the subset it needs.

## Security floor

These rails hold across every integration and are not weakened without explicit direction:

- Bot never merges PRs and never approves them. `github_pr_review` rejects `event: APPROVE`.
- `sandboxed_bash` denylist blocks `sudo`, raw `curl`/`wget`/`ssh`/`scp`, destructive `rm`.
- Per-channel monthly token budget is always enforced.
- Public-only middleware is always on; DMs are blocked unless `ENTER_BOT_ALLOW_DM=1` (developer-only).
- New integrations use service-account auth. Per-user OAuth is not on the roadmap.
