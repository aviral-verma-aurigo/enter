# Backlog

Feature work tracked but not in progress. Top of list = next likely pickup. When you pull from here, move the item out and into the active task list.

## Operational readiness — before wider rollout

- **Per-user rate limits in bot**
  Currently only per-channel monthly token budget is enforced. Add per-user mentions/hour and per-user PRs/day caps. Useful before broad org rollout.

- **Branch protection on `main`** *(GitHub UI)*
  Document at `packages/docs/src/content/docs/deploy/repo-settings.md` is shipped; the actual toggle is a one-time admin action in the GitHub repo settings or via the `gh` snippet documented there.

## UX polish

- **Bot render pipeline / Adaptive Cards** *(was task #23)*
  Replace plain-text bot replies with Adaptive Cards for tool-call status, diffs, PR links. Stream a single Adaptive Card per turn via `context.updateActivity` with debounce 250-500 ms. Card schemas under `packages/teams-bot/src/render/adaptive-cards/`. Effort: ~1 day.

## Surfaces beyond Teams + CLI *(discussed 2026-11-25)*

- **Enter as an MCP server**
  Expose Enter's org memory (memories + graph) and its configured integrations (ADO, Confluence, Aha!, GitHub) as an MCP server, so engineers can query Enter's shared context from the coding tools they already use ("why was this built this way?", "context for this PBI"). Read-mostly to start; writes still go through the bot's PR flow. Needs service-account auth plus per-requester access filtering (restricted-at-source content stays hidden), the same secret filter as memory writes, and per-user rate limits. Highest leverage of the two: spreads Enter's core asset without a new app.

- **Web console**
  Small web UI for what Teams handles poorly: review a plan or diff before Enter opens a PR, browse and correct memory, see the audit log, per-channel token budgets and usage/pilot metrics. Linked from Teams replies (pairs with the Adaptive Cards item under UX polish). Also gives admins and security the visibility they'll ask for in production.

- **Standalone desktop/coding app — deferred, not planned**
  Decided against for now: it reintroduces per-person install and setup (the adoption problem Enter is pitched against), competes with personal coding agents Enter already delegates to, and doesn't reach non-engineering roles. Revisit only if the pilot shows long build sessions outgrowing Teams *and* the web console isn't enough. Even then, prefer a web app linked from Teams over a desktop client.

## Capability expansion

- **Per-channel MCP opt-in**
  MCP client ships in `@enter/core` and registers globally per process. To stop one team's Notion creds leaking into another channel, add a per-channel allowlist of which MCP servers the channel can call (e.g. via `ENTER_BOT_CHANNEL_MCP_ALLOWLIST` or a channel-config field). The tool catalog already supports filtering, so this is plumbing rather than design.

- **LLM-based entity extraction**
  Today's graph extraction is deterministic-only (frontmatter, `@mentions`, code paths). Add an optional second pass that runs an LLM over free-text memory bodies and emits edges with `confidence < 1.0` and `source_memory_id`. Enables a `/graph forget` slash command to prune low-confidence edges later.

- **More delegate tools — Aider, OpenCode, Cursor CLI, Codex CLI**
  Mirror of `delegate_to_claude_code` for each. Useful for cross-model comparison and for tasks where one delegate is meaningfully better.

- **Autonomous mode in the Teams bot**
  Currently CLI-only. Bot version needs careful UX around long-running async posts (the agent may take minutes to call `done`; the channel needs progress updates without spamming).

## Stretch / long-tail

- **Streaming trajectory broadcast** — share an in-progress session live (for RL training or pairing).
- **Voice mode**.
- **Docker / SSH / Modal sandboxes for `bash`** — currently host-pinned.
- **Subagent recursion with depth cap** — subagents can't currently spawn subagents.
- **Memory eviction / archival policy** — `hits` column already tracked; needs a policy that retires low-hit memories.
- **RPC mode** — non-interactive line protocol for IDE integrations.
- **Per-user OAuth (on-behalf-of)** — if security needs the human, not the service account, to be the commit/PR author.

## Notes

- The CLAUDE.md docs-update rule applies whenever an item moves out of this file into active work — the corresponding doc page needs to land in the same change.
- Tests for everything shipped to date are an explicit prerequisite before the next round of feature work (in progress at the time this file was written — see active tasks).
