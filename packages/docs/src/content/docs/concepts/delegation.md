---
title: Delegation to Claude Code
description: What delegate_to_claude_code does and when to use it.
---

`delegate_to_claude_code` is a tool that hands a self-contained task to Claude Code, running it via Anthropic's `@anthropic-ai/claude-agent-sdk`. The parent agent gets back Claude Code's final summary, the trace of tool calls it made, the number of turns, and the cost.

## When to use it

When the task wants Claude Code's exact toolset (Read / Edit / Write / Bash / Glob / Grep) running in a fresh context, and you don't want to pollute the parent transcript with the intermediate work.

Good fits:

- "Refactor `packages/core/src/memory/*.ts` to extract the `rowToRecord` helpers into a shared module."
- "Find every callsite of `recallTool` and add a unit test that exercises an empty result."

Not a fit:

- Anything that needs Enter's own tools (memory, graph, skill authoring). Claude Code can't see them.

## Tool signature

```text
delegate_to_claude_code(
  task: string,
  allowed_tools?: string[],   // default: Read, Edit, Write, Bash, Glob, Grep
  cwd?: string,               // default: parent's cwd
  max_turns?: number,
  system_prompt?: string,
)
```

## Auth

`ANTHROPIC_API_KEY` is the only credential the delegate needs. There is no separate Claude Code installation step — the SDK runs in-process.

## Result

The tool returns text shaped like:

```text
Claude Code (session <id>) — 7 turn(s), 12 tool call(s), $0.0143.

<summary text>
```

Plus a `details` object with the full tool-call trace, total tokens in/out, and the model session ID. The parent agent can `recall` or `remember` based on the summary just like any other tool output.
