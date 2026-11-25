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
enter --plan "<goal>"
enter --execute-plan <path-to-saved-plan>
enter export <session-id>
enter schedule add <name> "<goal>" (--every <minutes> | --at <HH:MM>) [--max-turns N]
enter schedule list
enter schedule remove <name>
enter schedule run-due
enter version
enter help
```

If `[prompt...]` is given without `--print`, the prompt is fed in and then the interactive UI takes over. With `--print`, the agent runs to completion and exits.

## Startup banner

In TTY mode, `enter` opens with a slate-gray ANSI-Shadow `ENTER` wordmark, the tagline "an autonomous teammate", and a metadata row showing the version, the active provider/model, and the current working directory (with `$HOME` collapsed to `~` and long paths truncated to `~/…/last-two-segments`). A tip line below the metadata reminds you that `/help` lists slash commands and that Ctrl+C twice exits.

The rest of the chrome is intentionally minimal: no horizontal rules, just whitespace. The status spinner is invisible while the agent is idle and only appears when the agent is thinking or running a tool. The input editor sits at the bottom with a slate-colored border that matches the wordmark.

Terminals narrower than 47 columns collapse the banner to a single compact header so nothing wraps. Truecolor terminals (Windows Terminal, iTerm2, VS Code, recent gnome-terminal — anything that sets `COLORTERM=truecolor` or `COLORTERM=24bit`) render the wordmark in soft slate gray; older terminals fall back to plain ANSI white. Set `NO_COLOR=1`, `ENTER_NO_COLOR=1`, or pass `--no-color` to strip all color.

## Flags

| Flag | Meaning |
|---|---|
| `--print`, `-p` | Headless one-shot. Streams the final assistant message to stdout, then exits. |
| `--autonomous <goal>` | Run the autonomous loop until `done` / max-turns / idle-stall / timeout. |
| `--plan <goal>` | Plan-first mode. Investigate read-only, then call `propose_plan` and exit. Plan saved to `~/.enter/plans/<timestamp>-<slug>.md`. |
| `--execute-plan <path>` | Execute a plan saved earlier. The plan body is injected as the autonomous goal. |
| `--max-turns <n>` | Cap the autonomous loop. Overrides `config.autonomy.maxTurns`. |
| `--model <id>` | Main model for thinking/planning (the interactive agent, `--print`, `--plan`, `--autonomous`). Overrides `config.model` and `ENTER_MODEL`. |
| `--execution-model <id>` | Model for execution work: subagents, skill authoring, and `--execute-plan` runs. Overrides `config.executionModel` and `ENTER_EXECUTION_MODEL`. |
| `--provider <name>` | Provider key (e.g. `anthropic`, `openai`). Overrides `config.provider` and `ENTER_PROVIDER`. |
| `--soul <path>` | Use a specific SOUL.md instead of project/user/bundled discovery. |
| `--session <id>` | Resume a session by ID. Without this flag, a new ULID is allocated. |
| `--no-color` | Disable ANSI. Same as `NO_COLOR=1`. |
| `--simple` | Use plain readline REPL instead of the rich interactive UI. Useful in CI, tmux nests, or any terminal where the rich renderer misbehaves. |
| `--version`, `-v` | Print version and exit. |
| `--help`, `-h` | Print help and exit. |

## Subcommands

- `enter export <session-id>` — dumps the session as markdown + JSONL to `~/.enter/exports/`. Equivalent to running `/export` inside a live session.
- `enter schedule <add|list|remove|run-due>` — manage scheduled autonomous goals (see below).
- `enter version` — prints the CLI version.
- `enter help` — prints the help block.

## Scheduled autonomous goals

`enter schedule` stores recurring autonomous goals in `~/.enter/schedules.json`. There is no daemon: point your OS scheduler (cron, launchd, Task Scheduler) at `enter schedule run-due`, which runs every due schedule as its own autonomous session and exits.

```sh
# Every weekday at 09:00, snapshot the team's board and update memory.
enter schedule add team-standup-brief \
  "Pull active ADO work items for the Plan 2.0 team, compare against memory, and remember what changed" \
  --at 09:00 --max-turns 20

enter schedule list
enter schedule run-due         # run everything currently due
enter schedule remove team-standup-brief
```

Cadences: `--every <minutes>` (interval) or `--at <HH:MM>` (daily, local time). A schedule's `lastRun` is only advanced when its run exits cleanly, so a failed run is retried on the next `run-due`. Each run gets a fresh session with the standard integrations and memory; per-run turn caps come from `--max-turns` at `add` time.

Example crontab line:

```text
*/15 * * * * /usr/local/bin/enter schedule run-due >> ~/.enter/schedule.log 2>&1
```

## Environment variables

| Variable | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | Required for the default Anthropic provider. |
| `ENTER_HOME` | Override `~/.enter` (state root). |
| `ENTER_MODEL` | Default main (thinking/planning) model id (overridden by `--model`). |
| `ENTER_EXECUTION_MODEL` | Default execution model id (overridden by `--execution-model`). |
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

Plan-first, then execute:

```powershell
enter --plan "wire up the github_pr_review tool to trigger on PR open"
# review the saved plan under ~/.enter/plans/, then:
enter --execute-plan "$env:USERPROFILE/.enter/plans/2026-05-18T16-30-00-wire-up-the-github-pr-review-tool.md"
```

Plan-mode is read-only by directive: the agent has access to investigation tools (`read`, `grep`, `glob`, `recall`) but the persona prompt tells it to call `propose_plan` rather than `write` / `edit` / `bash`. The autonomous loop terminates after `propose_plan` fires.
