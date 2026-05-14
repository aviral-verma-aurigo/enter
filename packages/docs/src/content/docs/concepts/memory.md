---
title: Memory & Entity Graph
description: Memory types, the MEMORY.md index, FTS5 recall, the memory nudge, and the deterministic entity graph.
---

Enter's memory is two layers in one SQLite file: an FTS5-indexed table of typed markdown notes, and a graph of typed nodes and edges layered on top.

## Memory types

Every memory has one of five types:

| Type | What it's for |
|---|---|
| `user` | User preferences, habits, working style. |
| `feedback` | Corrections — what the user pushed back on and why. |
| `project` | Facts about the current project (scoped to its `projectHash`). |
| `reference` | External references (docs, links, API contracts). |
| `channel` | Per-Teams-channel context (scoped to a `channelKey`). |

Scoping rules: `project` memories are filtered by `projectHash`; `channel` memories by `channelKey`. Recall can be restricted to `channel` / `project` / `global` / `all`.

## The MEMORY.md index

`~/.enter/memory/MEMORY.md` is a human-readable index of every memory, regenerated on each `remember` call. The actual storage is `memories.db` (SQLite) plus a markdown file per memory under `~/.enter/memory/<type>/<name>.md`.

## FTS5 recall

`recall("...")` runs an FTS5 `MATCH` query over `name + summary + body + tags`, ordered by `bm25`, returning ranked snippets. Free-text is sanitized (special chars stripped) and turned into an OR'd phrase query.

```text
recall(query="vitest config", k=5, scope="project")
→ 3 hits, each with a path, a snippet, and a hit-count bump.
```

## The memory nudge

Every N agent turns (default 6, configurable as `memory.nudgeEveryNTurns`), a `[memory-nudge]` user message is injected before the next model call, reminding the agent to call `recall` / `remember` / `link`. Above `compactionThresholdTokens` (default 80k), the hook also drops the oldest messages and inserts a `[context-summary]` placeholder.

:::tip
The nudge is not a system-prompt suffix — it's a real user-role message in the transcript. The agent treats it the way it treats any other prompt.
:::

## The entity graph

`remember` doesn't only write a note. It calls `extractEntities` on the body + frontmatter to produce typed nodes and edges, then upserts them in the same transaction.

Node types:

```text
Person, Customer, Product, Project, Module, File, Symbol, Memory, Topic, PR
```

Edge types:

```text
WORKS_ON, OWNS, PART_OF, DEPENDS_ON, MENTIONS, AUTHORED, AFFECTS, SUPERSEDES, RELATES_TO
```

Extraction is deterministic — no LLM in the loop:

- `frontmatter.entities` / `frontmatter.links` arrays become nodes and edges directly.
- `@aviral` style mentions in the body become `Person` nodes plus a `MENTIONS` edge.
- `packages/core/src/tools/recall.ts`-style paths become `File` nodes plus a `MENTIONS` edge.

You can also call `link` directly to record a relationship without writing a new memory.

## Querying the graph

Three tools traverse it:

- `neighbors` — k-hop expansion from an entity, optionally filtered to one edge type.
- `path` — shortest connecting chain between two entities (BFS, max 6 hops).
- `entity_facts` — everything about one entity: adjacent edges plus IDs of memories that mention it.

See [Memory & Graph Schema](/reference/schema/) for the actual `CREATE TABLE` statements.
