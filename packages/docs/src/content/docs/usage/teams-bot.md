---
title: Teams Bot
description: Talking to Enter inside a Microsoft Teams channel — the public-only constraint and a worked example.
---

`enter-bot` (`@enter/teams-bot`) is a Bot Framework webhook that runs Enter in Microsoft Teams. It's the second of Enter's two surfaces.

## The public-only constraint

The bot only operates inside public Teams channels, and only when explicitly @-mentioned. 1:1 chats are refused. Group chats without channels are refused.

:::danger[No DMs]
This is intentional. Every interaction happens where teammates can see it, which makes the bot's reasoning legible and acts as an apprenticeship channel. The check is enforced in middleware — there is no per-user override.
:::

The only way to bypass the public-only check is the developer-mode env var `ENTER_BOT_ALLOW_DM=1`, intended exclusively for the Bot Framework Emulator while developing locally.

## How to talk to it

Mention the bot at the start of the message:

```text
@Enter clone acme/checkout, add a /health endpoint that returns {"ok": true}, run the tests, open a PR
```

The bot:

1. Acks in-thread.
2. Calls `git_clone` to pull `acme/checkout` into the channel's ephemeral worktree.
3. Calls `read` / `grep` / `edit` to locate the right module and add the route.
4. Calls `run_tests` — auto-detects npm/pytest/cargo/go/maven/gradle/bundler.
5. Calls `sandboxed_bash` to create a branch and commit.
6. Calls `git_push` to push the branch using the bot's GitHub App credentials.
7. Calls `github_pr_open` to open the PR. The PR body includes who in Teams asked for it.
8. Posts the PR link back to the channel.

## What the bot will not do

- **Merge PRs.** Ever. Humans review and merge.
- **Run a free-form shell.** Tool access is `sandboxed_bash` only — denylist blocks `sudo`, raw `curl`/`wget`/`ssh`/`scp`, destructive `rm`, and similar.
- **Touch repos outside its allowlist.** `ENTER_BOT_ALLOWED_REPOS` (env var) gates which `owner/name` references resolve. If the env var is empty, every repo the GitHub App is installed on is allowed.
- **Cross channel boundaries.** Each Teams channel has its own worktree and its own memory scope (`channelKey`). Memories saved with `type=channel` don't leak across channels.

## Per-channel state

- **Worktree.** A git checkout lives at `${ENTER_BOT_WORKTREES}/<channel>/<repo>`. The bot reuses it across messages in the same channel until the channel idles out.
- **Memory.** Channel-scoped memories are tagged with the channel key. `recall` defaults to `scope=channel` for bot interactions; pass `scope=all` to reach across.
- **Budget.** Each channel has a monthly token ceiling (`ENTER_BOT_MONTHLY_TOKEN_BUDGET`, default 1,000,000). Exceeding it makes the bot refuse with a budget-exhausted message until the calendar month rolls.

## Roadmap

Streaming progress via Adaptive Cards and `UpdateActivity` is **v0.1** — currently the bot posts a final card per turn, not a live one.
