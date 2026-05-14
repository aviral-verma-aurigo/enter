---
title: CLI on Your Machine
description: Installing the enter binary and persisting your API key.
---

You have two ways to invoke `enter` after `npm run build`: link the binary or run the JS directly.

## Option A — `npm link`

From the repo root, after `npm install && npm run build`:

```powershell
cd packages/cli
npm link
```

`enter` is now on your `PATH`. Verify:

```powershell
enter --version
```

To uninstall: `npm unlink -g @enter/cli`.

## Option B — Absolute path

If you don't want a global symlink, invoke `node` against the built CLI:

```powershell
node "C:/path/to/enter/packages/cli/dist/cli.js" --print "hello"
```

This is the only mode that works cleanly in CI runners — no globals, no PATH munging.

## Persisting `ANTHROPIC_API_KEY`

### Windows (PowerShell user-scope)

```powershell
[Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "sk-ant-...", "User")
```

Open a new PowerShell session for the change to take effect.

### macOS / Linux (bash / zsh)

Append to your `~/.bashrc` or `~/.zshrc`:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Then `source ~/.bashrc` or open a new terminal.

:::caution[Don't commit your key]
`~/.enter/keys.json` is reserved for runtime key state; never commit it. If you've leaked a key, rotate it at the Anthropic console immediately — the leaked key is what matters, not what file it ended up in.
:::

## Where Enter keeps state

- `~/.enter/config.json` — your overrides (see [Config File](/config/file/)).
- `~/.enter/SOUL.md` — your custom persona (or absent → bundled fallback).
- `~/.enter/memory/` — `MEMORY.md` index, `memories.db`, and per-type markdown files.
- `~/.enter/skills/` — user-level skills.
- `~/.enter/sessions/` — JSONL session log per session.
- `~/.enter/exports/` — markdown + JSONL exports.

Set `ENTER_HOME` to relocate the whole tree. Useful for sandboxed CI runs.
