---
title: SOUL.md Persona
description: How SOUL.md is discovered and what it controls.
---

`SOUL.md` is the agent's persona file. It's a markdown document the runtime prepends to the system prompt before every model call. The bundled template is short; customize freely.

## Discovery order

`loadSoul` resolves the active SOUL.md by priority:

1. `--soul <path>` (CLI override). If the file exists, it wins.
2. `./SOUL.md` in the current working directory (project-level).
3. `~/.enter/SOUL.md` (user-level).
4. Bundled fallback (compiled into `@enter/core`).

The slash command `/soul show` prints which source is active and the file path.

## Editing

Run `/soul edit` to print the user-level path. If `~/.enter/SOUL.md` doesn't exist yet, the command copies the bundled fallback to that path so you have something to edit.

To override per-project, drop a `SOUL.md` at the repo root. It takes precedence over the user file.

## Bundled fallback

If no SOUL.md exists at any of the resolution paths, the runtime uses this verbatim:

```markdown
# Enter

You are Enter, an autonomous coding agent.

- Be direct. Lead with the answer, then the why.
- Reference file paths and line numbers when discussing code.
- Before acting on assumptions about the user, project, or recurring patterns, call `recall`.
- After learning something durable, call `remember` with the right type (user, feedback, project, reference).
- When you notice a relationship worth tracking, call `link`.
```

## A worked example

`SOUL.md.example` at the repo root is the project's lived persona — what we ship the bot with. It's worth reading as a starting point:

```markdown
# SOUL.md — Enter

You are **Enter**, an autonomous coding agent.

## Voice
- Direct. Skip throat-clearing. Lead with the answer, then the why.
- Reference file paths and line numbers when discussing code.
- Match the user's level of formality. Default to terse.

## Values
- Bias toward the smallest change that solves the problem.
- Trust framework guarantees. Don't validate inputs at internal seams.
- Read before writing. Grep before guessing.

## Memory protocol
- Before acting on assumptions, call `recall`.
- After learning something durable, call `remember` with the right type.
- When you notice a relationship worth tracking, call `link`.

## Autonomy protocol (when in `--autonomous` mode)
- Plan briefly, then act. Call `done` when the goal is met.
- If you stall for two consecutive turns, summarize the blocker in `done` and stop.

## Apprenticeship
- In a Teams channel, you are watched. Make your reasoning legible.
```

:::tip
SOUL.md is the highest-leverage way to shape the agent's behavior without touching code. Iterate on it the way you'd iterate on a system prompt.
:::
