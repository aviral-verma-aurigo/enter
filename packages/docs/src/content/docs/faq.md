---
title: FAQ
description: Common questions about Enter — bot constraints, providers, budgets, OneDrive, PR policy.
---

## Why does the bot refuse DMs?

Public-only is the design, not a bug. Every interaction happens where teammates can see it. That makes the bot's reasoning legible, supports apprenticeship learning, and prevents quiet abuse. The only override is `ENTER_BOT_ALLOW_DM=1`, intended exclusively for the Bot Framework Emulator during local development.

## Why isn't bash available in the bot?

The bot has `sandboxed_bash` instead of the CLI's free-form `bash`. The sandboxed version pins the working directory to the channel's git worktree and refuses a denylist of dangerous commands (`sudo`, raw `curl`/`wget`/`ssh`/`scp`, destructive `rm`, etc). The bot is acting in a shared GitHub identity — unconstrained shell would be a security gap.

## What happens if I lose the Anthropic API key?

You re-issue one at the Anthropic console and update `ANTHROPIC_API_KEY`. Enter doesn't store the key anywhere durable; it reads the env var on startup. No data loss — your `~/.enter/memory/` is independent of the key.

## Can I use OpenAI / Bedrock instead of Anthropic?

Yes, via Enter's provider abstraction. Set:

```text
ENTER_PROVIDER=openai
ENTER_MODEL=gpt-4o-mini      # or whatever
OPENAI_API_KEY=sk-...
```

`delegate_to_claude_code` still requires `ANTHROPIC_API_KEY` because the delegate runs against the Claude Agent SDK directly — there's no provider switch for that tool. If you don't have an Anthropic key, the delegate tool errors when invoked; everything else works fine.

## How do I bump the per-channel monthly token budget?

Two paths:

- **Env var (operational override).** `ENTER_BOT_MONTHLY_TOKEN_BUDGET=5000000`.
- **Config (persistent).** There is no per-channel budget key in `config.json` today — the env var is the source of truth for the bot. The CLI doesn't enforce a budget.

The counter resets on the first call of each calendar month.

## Why is `npm install` slow?

If your checkout is under OneDrive on Windows, OneDrive will try to replicate every file in `node_modules` to the cloud. That can take many minutes on first install and stall the dev loop. Two fixes:

- **Move the checkout** to a non-OneDrive path (e.g. `C:\dev\enter`). This is the recommended fix.
- **Exclude `node_modules` from OneDrive sync** via the OneDrive client → Settings → "Choose folders". Less reliable.

Either way, don't immediately retry on first slowness — let the initial install finish.

## Does the bot merge PRs?

**No.** Never. The GitHub App permissions don't include merge, and the bot's tools don't expose a merge action. Humans review and merge. This is a hard guarantee.

## How do I see what the agent actually did?

Three options, in order of fidelity:

- **`/export` (in-session)** or **`enter export <session-id>`** — produces a markdown + JSONL pair in `~/.enter/exports/`.
- **Read the JSONL directly** — `~/.enter/sessions/<id>.jsonl`. One record per turn. See [Session Format](/reference/session/).
- **For bot sessions** — the audit DB at `${ENTER_BOT_AUDIT_DB}` carries per-channel tool-call metadata and token counts.
