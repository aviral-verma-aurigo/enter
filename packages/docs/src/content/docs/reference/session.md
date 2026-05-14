---
title: Session Format
description: The JSONL session log under ~/.enter/sessions/.
---

Each session is a single JSONL file at `~/.enter/sessions/<sessionId>.jsonl`. Sessions are append-only — every model turn becomes a new record at the end of the file.

## Records

Three record shapes share a `type` discriminator.

### `SessionHeaderRecord` (line 1)

```ts
interface SessionHeaderRecord {
  type: "session";
  version: 1;
  sessionId: string;
  createdAt: string;     // ISO 8601
  cwd: string;           // process.cwd() at session creation
  parentSessionId?: string;
}
```

Written by `JsonlSessionRepo.create()`. Every session file starts with exactly one of these.

### `MessageRecord`

```ts
interface MessageRecord {
  type: "message";
  timestamp: string;     // ISO 8601
  message: AgentMessage; // from the agent runtime
}
```

One per agent turn. The `message` is the runtime's `AgentMessage` shape — system / user / assistant / tool, with content blocks for text, tool calls, and tool results.

Sessions are written by the `attachToAgent(sessionId, subscribe)` helper, which appends a `MessageRecord` on every `message_end` event from the agent.

### `CustomRecord`

```ts
interface CustomRecord {
  type: "custom";
  timestamp: string;
  customType: string;
  data: unknown;
}
```

Catch-all for anything the runtime wants to log alongside messages — for example, autonomous-mode stop reasons or audit metadata from the Teams bot.

## Loading

`JsonlSessionRepo.load(sessionId)` returns `{ metadata, records }`. It tolerates malformed lines (skipped silently) and rejects files that lack a `session` header.

## Listing

`JsonlSessionRepo.list()` reads only the first line of each `.jsonl` and returns metadata sorted by `createdAt` descending.

## Resuming

`enter --session <id>` opens the existing JSONL without rewriting the header. New `MessageRecord` lines are appended after the existing ones.

## Exporting

`enter export <session-id>` (or `/export` in-session) produces two files under `~/.enter/exports/`:

- `<sessionId>.md` — human-readable markdown of the full transcript.
- `<sessionId>.jsonl` — verbatim copy of the source JSONL.

:::tip
The JSONL is the canonical record. The markdown export is a convenience for sharing — render it as a code review artifact when you want a teammate to see exactly what the agent did.
:::
