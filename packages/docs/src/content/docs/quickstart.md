---
title: Quickstart
description: Install Enter, sign in once, run a print-mode prompt, exercise the memory roundtrip.
---

You'll need Node.js >= 20 and an Anthropic API key.

## 1. Install

Clone the repo, install workspace dependencies, then put `enter` on your `PATH`:

```powershell
git clone https://github.com/your-org/enter.git
cd enter
npm install
npm run install:local
```

`npm run install:local` builds `@enter/core` + `@enter/cli` and runs `npm link` for both packages, so `enter` resolves on `PATH`. To reverse it later: `npm run uninstall:local`.

Verify:

```powershell
enter version
```

:::caution[OneDrive caveat]
If your working copy lives under OneDrive (a common Windows default), `npm install` may stall on first run while OneDrive replicates `node_modules`. If installs flake, move the checkout out of OneDrive (e.g., `C:\dev\enter`) and re-run.
:::

## 2. First run — sign in

```powershell
enter
```

On first run, Enter notices there's no saved key and prompts you for one:

```text
Welcome to Enter — let's get you set up.

Enter needs an API key for provider "anthropic".
It will be stored at C:\Users\<you>\.enter\keys.json (mode 0600).

anthropic API key:
```

Paste your `sk-ant-...` value (it won't echo) and press Enter. The key is written to `~/.enter/keys.json` with owner-only permissions; subsequent runs read it from there silently. To rotate it later, run `enter login`. To remove it, run `enter logout`.

## 3. One-shot prompt

```powershell
enter --print "what is 7 * 8?"
```

You should see `56` and the process exits.

## 4. Memory roundtrip

Start an interactive session and teach Enter something durable:

```powershell
enter
> Remember that I prefer terse, code-first answers, and that this project's test runner is vitest.
```

The agent should call `remember` with `type=user` (and possibly `type=project`). Exit, then start a fresh session:

```powershell
enter
> What do you know about my preferences?
```

The agent should call `recall`, find the saved memory, and answer in your preferred style.

## 5. Autonomous mode

```powershell
enter --autonomous "add a CHANGELOG.md with a v0.1 stub" --max-turns 10
```

Enter plans, calls tools, and stops when it invokes `done` — or when it hits `--max-turns`, idle-stalls for two consecutive turns, or wall-clock expires. See [Autonomous Loop](/concepts/autonomy/) for the full stop matrix.

## 6. Slash commands

Inside the interactive session, try `/help`. See [Slash Commands](/usage/slash/) for the full list — memory inspection, graph traversal, session export.

## Next

- [How Enter Differs](/differs/) — what makes Enter not-just-another-coding-agent.
- [Memory & Entity Graph](/concepts/memory/) — what `recall` / `remember` / `link` are actually doing.
- [Integrations](/integrations/) — wire up Azure DevOps, Confluence, Aha!, and MCP servers.
- [Teams Bot deployment](/deploy/teams-bot/) — bring Enter into your team's public channels.
