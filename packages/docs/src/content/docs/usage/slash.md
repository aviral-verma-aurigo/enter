---
title: Slash Commands
description: Commands you can type inside the interactive TUI.
---

Inside the interactive session, lines starting with `/` are slash commands, not prompts. They operate directly on the runtime (memory, graph, skills, session) without going through the model.

## Commands

| Command | Description |
|---|---|
| `/help` | List slash commands. |
| `/exit` | Exit the agent. |
| `/memory list` | List every memory: `[type] name — summary`. |
| `/memory show <name>` | Print the full body of a memory by name. |
| `/memory edit <name>` | Print the file path so you can open it in `$EDITOR`. |
| `/memory forget <name>` | Delete the memory and its backing file. |
| `/soul show` | Print the active SOUL.md (with source: project / user / bundled). |
| `/soul edit` | Print the user-level SOUL.md path, creating it from the bundled template if needed. |
| `/skills` | List loaded skills from `~/.enter/skills/`. |
| `/recall <query>` | Run an FTS5 recall directly — no model in the loop. Returns the top 5 hits with snippets. |
| `/graph neighbors <type>:<key>` | Print 2-hop neighbors of an entity (up to 20). |
| `/graph path <type>:<key> <type>:<key>` | Print the shortest path between two entities. |
| `/graph facts <type>:<key>` | Print the node + adjacent edge count for an entity. |
| `/export` | Export the current session to `~/.enter/exports/` (markdown + JSONL). |

## Entity references

`<type>:<key>` uses the node type names from the graph schema:

```text
Person, Customer, Product, Project, Module, File, Symbol, Memory, Topic, PR
```

Examples:

```text
/graph neighbors Person:aviral
/graph path Person:aviral Module:packages/teams-bot
/graph facts File:packages/core/src/memory/memory-store.ts
```

:::tip
Slash commands are the fastest way to sanity-check what the agent has actually remembered. If `recall` produces nothing for a query you expect to hit, run `/recall <query>` to see the raw FTS5 results.
:::
