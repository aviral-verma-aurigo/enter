---
title: Introduction
description: What Enter is, who uses it, and the two surfaces.
---

Enter is an autonomous teammate that turns conversations into pull requests. It works in two places — your terminal, where it runs as a CLI; and your Microsoft Teams channels, where the whole team talks to it the same way they talk to each other.

The PR is the universal contribution surface. Code, PRDs, designs, test plans, schemas — anything that belongs in your repo flows through the same review process engineers already trust. That means **everyone on the team can contribute through Enter, not just engineers.**

## Who contributes

- **Engineers** — ship code changes, refactors, bug fixes. Run tests in a sandboxed worktree before opening the PR.
- **Product Managers** — draft PRDs, ADRs, and decision records straight into `docs/`. Reference ADO work items; Enter auto-links them into the PR body.
- **Designers** — commit design tokens, component specs, and exported SVGs. Keep design and code in version control together.
- **QA Engineers** — open test plans, test case files, and bug reproductions as PRs. Each one reviewable, versioned, and linked back to the ADO work item it traces.

See [Who contributes](/contributors/) for concrete prompts and workflows per role.

## Two surfaces

- **`enter`** — terminal CLI. Print mode, interactive rich UI, autonomous loop.
- **`enter-bot`** — Microsoft Teams bot. Lives in public channels. Refuses DMs.

Both share `@enter/core`: closed-loop memory (SQLite + FTS5), a deterministic entity graph spanning people / modules / files / PRs / work items, autonomous mode with a `done` tool, subagent spawning, and a `delegate_to_claude_code` tool that hands work off to Claude Code via the Claude Agent SDK.

## Two ways to talk to Enter

Headless from your shell:

```powershell
enter --print "summarize the changes on this branch"
```

In a Teams channel — mention the bot in a public channel:

```text
@Enter clone acme/checkout, add a /health endpoint, run the tests, open a PR
```

## What makes Enter different

- **Closed-loop memory.** Every session starts with the option to `recall` what the agent already knows about you and your codebase. Anything worth keeping gets written back with `remember`.
- **Deterministic entity graph.** Memory isn't just notes — `Person`, `Module`, `File`, and `PR` nodes are extracted from frontmatter, `@mentions`, and code-path tokens, linked by typed edges (`WORKS_ON`, `MENTIONS`, `DEPENDS_ON`). Queries are typed, not similarity searches.
- **Autonomous mode in the CLI.** `--autonomous "<goal>"` runs the loop until the agent calls `done`.
- **Teams bot constrained to public channels.** Every interaction is watched. The bot refuses 1:1 DMs — the constraint is the feature.
