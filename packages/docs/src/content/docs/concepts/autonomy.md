---
title: Autonomous Loop
description: How runAutonomous drives the agent, the stop conditions, and the done tool.
---

Autonomous mode is `runAutonomous(agent, goal, options)` in `@enter/core`. The CLI exposes it via `--autonomous "<goal>"`.

## What it does

The loop seeds the agent with the goal, then re-prompts with a `[autonomous-mode] Continue...` message after every turn until one of the stop conditions fires. Each iteration calls `agent.prompt(...)` — the continuation message exists because the runtime's `Agent.continue()` requires the last message to be user-role or a tool result.

## Stop conditions

| Reason | Trigger |
|---|---|
| `done` | The model calls the `done` tool (which fires `terminate: true`). |
| `max_turns` | The configured turn cap is reached. CLI flag: `--max-turns N`. |
| `idle_stall` | The agent goes `idleStallTurns` consecutive turns without a tool call (default 2). |
| `timeout` | Wall clock exceeded `wallClockMinutes` (default 30). |
| `aborted` | External abort (e.g. SIGINT). |
| `error` | An exception escaped the loop. |

Defaults come from `config.autonomy`:

```json
{ "maxTurns": 50, "idleStallTurns": 2, "wallClockMinutes": 30 }
```

## The `done` tool

```text
done(summary: string, artifacts?: string[])
```

`summary` is a one-paragraph description of what was accomplished. `artifacts` is an optional list of files or URLs produced. The tool returns `terminate: true`, which causes the agent's turn loop to end immediately and the autonomous wrapper to record `stop.reason = "done"`.

:::tip
If the agent gets stuck, the SOUL.md guidance says to summarize the blocker in `done` and stop. Treat `done` as "stop running" — not "I succeeded".
:::

## Result shape

`runAutonomous` returns:

```ts
interface AutonomousResult {
  payload: DonePayload | null;   // The done args, or null if stopped some other way.
  stop: { reason: StopReason; turns: number; details?: unknown };
  finalText: string;              // Last assistant text block emitted.
  toolCalls: number;
}
```
