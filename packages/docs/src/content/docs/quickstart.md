---
title: Quickstart
description: Install Enter, run a print-mode prompt, exercise the memory roundtrip.
---

You'll need Node.js >= 20 and an Anthropic API key.

## 1. Install

Clone the repo, then install workspace dependencies from the root:

```powershell
git clone https://github.com/your-org/enter.git
cd enter
npm install
npm run build
```

:::caution[OneDrive caveat]
If your working copy lives under OneDrive (a common Windows default), `npm install` may stall on first run while OneDrive replicates `node_modules`. If installs flake, move the checkout out of OneDrive (e.g., `C:\dev\enter`) and re-run.
:::

## 2. Set your API key

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
```

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

## 3. Run a one-shot prompt

```powershell
node packages/cli/dist/cli.js --print "what is 7 * 8?"
```

The first run creates `~/.enter/` with `config.json`, an empty `memory/`, `sessions/`, and a bundled `SOUL.md`.

## 4. Memory roundtrip

Start an interactive session and teach Enter something durable:

```powershell
node packages/cli/dist/cli.js
> Remember that I prefer terse, code-first answers, and that this project's test runner is vitest.
```

The agent should call `remember` with `type=user` (and possibly `type=project`). Exit, then start a fresh session:

```powershell
node packages/cli/dist/cli.js
> What do you know about my preferences?
```

The agent should call `recall`, find the saved memory, and answer in your preferred style.

## 5. Autonomous mode

```powershell
node packages/cli/dist/cli.js --autonomous "add a CHANGELOG.md with a v0.1 stub" --max-turns 10
```

Enter plans, calls tools, and stops when it invokes `done` — or when it hits `--max-turns`, idle-stalls for two consecutive turns, or wall-clock expires. See [Autonomous Loop](/concepts/autonomy/) for the full stop matrix.

## 6. Slash commands

Inside the interactive session, try `/help`. See [Slash Commands](/usage/slash/) for the full list — memory inspection, graph traversal, session export.

## Next

- [How Enter Differs](/differs/) — what makes Enter not-just-another-coding-agent.
- [Memory & Entity Graph](/concepts/memory/) — what `recall` / `remember` / `link` are actually doing.
- [Teams Bot deployment](/deploy/teams-bot/) — bring Enter into your team's public channels.
