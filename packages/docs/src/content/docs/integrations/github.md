---
title: GitHub
description: Clone, push, open PRs, and submit PR reviews from the Teams bot — backed by a GitHub App.
---

GitHub is the bot's PR-production surface and the only integration that's **Teams-bot-only**. The CLI doesn't need it — engineers already have `git` on their machine and use raw shell. The bot, on the other hand, acts as a GitHub App for stable identity, scoped permissions, and per-installation isolation.

This page covers what the integration does and the security rails. For step-by-step setup of the App itself (permissions, install, key rotation), see [Deploy → GitHub App Setup](/deploy/github-app/).

## What it lets the agent do

The bot runs through a typical contribution loop end-to-end:

1. `git_clone` — clone a repo into the channel's ephemeral worktree.
2. `sandboxed_bash` — run shell commands inside the worktree (denylist enforced).
3. `run_tests` — auto-detect and run the project's test suite (npm / pytest / cargo / go / maven / gradle / bundler).
4. `git_push` — push the branch back using the App's credentials.
5. `github_pr_open` — open the PR. Auto-detects `AB#NNNN` references and injects a "Linked ADO work items" section into the body, then (best-effort) adds a Hyperlink relation on each referenced work item.
6. `github_pr_comment` — follow up on the PR with status, questions, or test results.
7. `github_pr_fetch` + `github_pr_review` — review someone else's PR (the bot can `COMMENT` or `REQUEST_CHANGES`; **`APPROVE` is disallowed**).

The bot **never merges**. There's no merge tool, the App is not granted merge permission, and reviews can't approve.

## Auth setup

The bot authenticates as a GitHub App. Full walkthrough in [Deploy → GitHub App Setup](/deploy/github-app/). The env vars it reads:

| Variable | Notes |
|---|---|
| `GITHUB_APP_ID` | App ID from the GitHub App's settings page. |
| `GITHUB_APP_PRIVATE_KEY_PATH` | Path to the App's `.pem` private key. |
| `GITHUB_APP_PRIVATE_KEY` | Alternative: PEM contents inline (supports `\n` escape) for hosts that can't mount files. |
| `GITHUB_APP_INSTALLATION_ID` | Optional. Auto-discovered per call if omitted; pin it for multi-org hosting. |

If `GITHUB_APP_ID` is unset, all GitHub-backed tools refuse with a configuration error.

### Repository allowlist

By default `git_clone` accepts any repo the App has access to. Lock it down per-bot with:

```text
ENTER_BOT_ALLOWED_REPOS=acme/foo,acme/bar
```

When set, `git_clone` refuses any repo outside the list — even if the App's installation technically grants access.

## Tools exposed

See [`reference/tools` → Teams bot only](/reference/tools/#teams-bot-only) for the full parameter list. Quick summary:

**Repo / shell:** `git_clone`, `git_push`, `sandboxed_bash`, `run_tests`
**Pull requests:** `github_pr_open`, `github_pr_comment`, `github_pr_fetch`, `github_pr_review`

## Attribution

PRs the bot opens include `— Requested by <name>` in the body (Teams `activity.from.name`). The Author field on the commit is the bot's GitHub App identity. Reviewers see both: who pushed the code (the bot) and who asked for it (the requester).

When the PR body contains `AB#NNNN` work-item references, `github_pr_open` injects a `Linked ADO work items` section into the body and calls `ado_work_item_link_pr` (best-effort) to back-link each referenced work item to the PR.

## Security rails

- **No merge, no approve.** The App is not granted merge permission. `github_pr_review` rejects `event: APPROVE`.
- **`sandboxed_bash` denylist.** Blocks `sudo`, raw `curl`/`wget`/`ssh`/`scp`, destructive `rm`, and similar. The bot is not a free-form shell.
- **Ephemeral worktrees.** Each channel gets its own worktree under `ENTER_BOT_WORTREES` (default `/var/lib/enter-bot/worktrees`). No cross-channel filesystem reuse.
- **Repo allowlist.** `ENTER_BOT_ALLOWED_REPOS` is the operator's primary lever for scoping blast radius.
- **No webhook surface.** Enter doesn't consume GitHub webhooks — the bot pushes work into GitHub, GitHub never pushes events at the bot.
