---
title: Distinctive Features
description: What makes Enter distinctive — the PR as universal contribution, organizational memory, public-channel apprenticeship, and autonomy on demand.
---

Enter is not a chat shell over an LLM. Four design choices distinguish it:

1. **The PR is the universal contribution surface.** Anyone on the team — PM, designer, engineer, QA — contributes through the same pull request flow. PRDs, design tokens, test plans, and code all merge through the review process engineers already trust. Generic coding agents talk to one engineer at a time; Enter ships work from the whole team into one shared review queue.

2. **Organizational memory, not just code memory.** `remember` extracts a typed entity graph from every memory: `Person`, `Module`, `File`, `PR`, work-item references. Edges (`WORKS_ON`, `MENTIONS`, `DEPENDS_ON`) connect them. You can ask "who works on `packages/teams-bot`?" or "what Confluence pages reference Project X?" without re-prompting an LLM to summarize history. The graph spans roles, not just files.

3. **Public-channel apprenticeship.** The Teams bot refuses 1:1 DMs. Every interaction happens where the team can see it, so the reasoning is legible and the next person who asks the same question can scroll back and learn how. The constraint is the feature. Set `ENTER_BOT_ALLOW_DM=1` only for local Bot Framework Emulator testing.

4. **Autonomy on demand, not by default.** `--autonomous "<goal>"` runs the loop until the model calls `done`, `--max-turns` is reached, the model goes two consecutive turns without a tool call (idle stall), or wall-clock expires. For everyday work it's a conversational agent; flip the switch when you want it to drive itself toward a goal.

## What Enter is not

Not an IDE plug-in. Not a chat UI shell. Not a vector-DB RAG product. The memory is structured (FTS5 + graph, both SQLite), not embedded — recall is a typed query, not a similarity search.
