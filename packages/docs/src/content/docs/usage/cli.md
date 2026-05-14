---
title: CLI
description: The `enter` binary — modes, flags, and environment variables.
---

`enter` is the CLI binary. It runs in three modes: print (headless one-shot), interactive (rich TUI or readline), or autonomous loop.

## Synopsis

```text
enter [prompt...]
enter --print "<prompt>"
enter --autonomous "<goal>" [--max-turns N]
enter export <session-id>
enter version
enter help
```

If `[prompt...]` is given without `--print`, the prompt is fed in and then the interactive UI takes over. With `--print`, the agent runs to completion and exits.

## Flags

| Flag | Meaning |
|---|---|
| `--print`, `-p` | Headless one-shot. Streams the final assistant message to stdout, then exits. |
| `--autonomous <goal>` | Run the autonomous loop until `done` / max-turns / idle-stall / timeout. |
| `--max-turns <n>` | Cap the autonomous loop. Overrides `config.autonomy.maxTurns`. |
| `--model <id>` | Provider-specific model ID. Overrides `config.model` and `ENTER_MODEL`. |
| `--provider <name>` | Provider key (e.g. `anthropic`, `openai`). Overrides `config.provider` and `ENTER_PROVIDER`. |
| `--soul <path>` | Use a specific SOUL.md instead of project/user/bundled discovery. |
| `--session <id>` | Resume a session by ID. Without this flag, a new ULID is allocated. |
| `--no-color` | Disable ANSI. Same as `NO_COLOR=1`. |
| `--simple` | Use plain readline REPL instead of the rich interactive UI. Useful in CI, tmux nests, or any terminal where the rich renderer misbehaves. |
| `--version`, `-v` | Print version and exit. |
| `--help`, `-h` | Print help and exit. |

## Subcommands

- `enter export <session-id>` — dumps the session as markdown + JSONL to `~/.enter/exports/`. Equivalent to running `/export` inside a live session.
- `enter version` — prints the CLI version.
- `enter help` — prints the help block.

## Environment variables

| Variable | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | Required for the default Anthropic provider. |
| `ENTER_HOME` | Override `~/.enter` (state root). |
| `ENTER_MODEL` | Default model id (overridden by `--model`). |
| `ENTER_PROVIDER` | Default provider (overridden by `--provider`). |
| `ENTER_LOG` | `debug` / `info` / `warn` / `error` — default `info`. |
| `NO_COLOR` | Standard NO_COLOR; disables ANSI. |

See [Environment Variables](/config/env/) for the full inventory including the bot-only set.

## Examples

One-shot:

```powershell
enter --print "what does packages/core/src/memory/memory-store.ts do?"
```

Autonomous with a turn cap:

```powershell
enter --autonomous "add a CHANGELOG with a v0.1 stub" --max-turns 10
```

Resume a session:

```powershell
enter --session 01HXY...ULID
```
