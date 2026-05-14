---
title: Memory & Graph Schema
description: SQLite tables backing the memory store and the entity graph.
---

Both memory and graph live in a single SQLite database at `~/.enter/memory/memories.db`. Journal mode is WAL; foreign keys are on.

## `memories` + `memories_fts`

The note table and its FTS5 mirror.

```sql
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  path TEXT NOT NULL,
  project_hash TEXT,
  channel_key TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  created TEXT NOT NULL,
  updated TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_type_name_scope
  ON memories(type, name, COALESCE(project_hash,''), COALESCE(channel_key,''));
CREATE INDEX IF NOT EXISTS idx_channel ON memories(channel_key);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  name, summary, body, tags,
  content='memories', content_rowid='rowid',
  tokenize='porter unicode61'
);
```

Triggers `memories_ai`, `memories_ad`, `memories_au` keep `memories_fts` in sync on insert, delete, and update.

Notes:

- `type` is one of `user | feedback | project | reference | channel`.
- Uniqueness is per (type, name, project, channel) — same `name` is allowed across different scopes.
- `path` is the filesystem path of the markdown file backing the row.
- `hits` increments on each `recall` match.

## `nodes` + `edges`

The deterministic entity graph.

```sql
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  key  TEXT NOT NULL,
  label TEXT NOT NULL,
  attrs TEXT,
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_type_key ON nodes(type, key);

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  src TEXT NOT NULL REFERENCES nodes(id),
  dst TEXT NOT NULL REFERENCES nodes(id),
  type TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  source_memory_id TEXT,
  attrs TEXT,
  created TEXT NOT NULL,
  valid_until TEXT
);
CREATE INDEX IF NOT EXISTS idx_edges_src_type ON edges(src, type);
CREATE INDEX IF NOT EXISTS idx_edges_dst_type ON edges(dst, type);
CREATE INDEX IF NOT EXISTS idx_edges_source_mem ON edges(source_memory_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_unique
  ON edges(src, dst, type, COALESCE(source_memory_id, ''));
```

### Node types

```text
Person, Customer, Product, Project, Module, File, Symbol, Memory, Topic, PR
```

### Edge types

```text
WORKS_ON, OWNS, PART_OF, DEPENDS_ON, MENTIONS, AUTHORED, AFFECTS, SUPERSEDES, RELATES_TO
```

### Traversal

- `neighbors(start, { edgeType?, kHops, limit })` — undirected recursive walk up to 6 hops.
- `shortestPath(from, to, maxHops)` — BFS up to 6 hops.
- `entityFacts(ref)` — node + all adjacent edges + IDs of memories that referenced it.

:::tip
The graph is queryable from the CLI without going through the model: `/graph neighbors`, `/graph path`, `/graph facts`. Useful for verifying what the agent has actually recorded.
:::
