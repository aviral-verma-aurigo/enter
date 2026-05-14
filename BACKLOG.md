# Backlog

Feature work tracked but not in progress. Top of list = next likely pickup. When you pull from here, move the item out and into the active task list.

## Close the cross-functional loop

- **Auto-link ADO work items in `github_pr_open`** *(was task #34)*
  Detect `AB#NNNN` and bare `#NNNN` patterns in the agent's prompt context; inject ADO work-item URLs into the PR body footer. Best-effort post a comment back to the linked work item with the PR URL ("PR opened: ..."). Zero extra LLM cost — pattern-detect in the tool wrapper. Effort: ~30-60 min.

- **Confluence native tools** *(was task #35)*
  `confluence_page_get` (by URL or space/title), `confluence_search` (CQL), `confluence_page_append_comment` (with requester attribution). Bot account + API token via `AtlassianTokenAuth`. Env: `CONFLUENCE_BASE_URL`, `CONFLUENCE_USER`, `CONFLUENCE_API_TOKEN`. Lift `AtlassianTokenAuth` from teams-bot to `@enter/core/integrations/confluence/` so the CLI registers too. Update `reference/tools.md`, `config/env.md`. Effort: 2-3 hrs.

- **Aha! native tools** *(was task #36)*
  `aha_feature_get`, `aha_release_get`, `aha_feature_comment` (with requester attribution). `AhaApiKeyAuth` lifted to `@enter/core/integrations/aha/`. Env: `AHA_BASE_URL`, `AHA_API_KEY`. Effort: 1-2 hrs.

## Operational readiness — before wider rollout

- **Audit + budget extensions for integrations** *(was task #37)*
  `audit.db` columns for integration (`ado`/`confluence`/`aha`/`github`), action count per integration per channel per month, surface in `/healthz`. Capture `argsHash` + `durationMs` (currently empty). Optional configurable per-integration rate limits. Effort: 1-2 hrs.

- **Per-user rate limits in bot**
  Currently only per-channel monthly token budget is enforced. Add per-user mentions/hour and per-user PRs/day caps. Useful before broad org rollout.

- **CI workflow** *(GitHub Actions or ADO Pipelines)*
  On push: `npm run build` + `npm test` + `npm run build:docs`. Block merges on failure. Catches the kinds of drift that the docs-update rule in CLAUDE.md can't enforce on its own.

## UX polish

- **Bot render pipeline / Adaptive Cards** *(was task #23)*
  Replace plain-text bot replies with Adaptive Cards for tool-call status, diffs, PR links. Stream a single Adaptive Card per turn via `context.updateActivity` with debounce 250-500 ms. Card schemas under `packages/teams-bot/src/render/adaptive-cards/`. Effort: ~1 day.

## Capability expansion

- **MCP (Model Context Protocol) client**
  One client in `@enter/core`, then any MCP server (Sentry, Datadog, Linear, Notion, Figma, etc.) is reachable without writing native tools. Per-channel opt-in of which MCP servers a channel can use (stops one team's Notion creds from leaking to another). Reframes Enter as MCP-native, useful marketing point.

- **LLM-based entity extraction**
  Today's graph extraction is deterministic-only (frontmatter, `@mentions`, code paths). Add an optional second pass that runs an LLM over free-text memory bodies and emits edges with `confidence < 1.0` and `source_memory_id`. Enables a `/graph forget` slash command to prune low-confidence edges later.

- **More delegate tools — Aider, OpenCode, Cursor CLI, Codex CLI**
  Mirror of `delegate_to_claude_code` for each. Useful for cross-model comparison and for tasks where one delegate is meaningfully better.

- **Autonomous mode in the Teams bot**
  Currently CLI-only. Bot version needs careful UX around long-running async posts (the agent may take minutes to call `done`; the channel needs progress updates without spamming).

## Lift remaining integrations to `@enter/core`

- **Confluence + Aha! to core** — same pattern we used for ADO (task #38). Once those native tools exist, lift `AtlassianTokenAuth` and `AhaApiKeyAuth` so the CLI registers them too. Both surfaces share the same code.

## Stretch / long-tail

- **Streaming trajectory broadcast** — share an in-progress session live (for RL training or pairing).
- **Voice mode, cron-scheduled automations**.
- **Docker / SSH / Modal sandboxes for `bash`** — currently host-pinned.
- **Subagent recursion with depth cap** — subagents can't currently spawn subagents.
- **Memory eviction / archival policy** — `hits` column already tracked; needs a policy that retires low-hit memories.
- **RPC mode** — non-interactive line protocol for IDE integrations.
- **Per-user OAuth (on-behalf-of)** — if security needs the human, not the service account, to be the commit/PR author.

## Notes

- The CLAUDE.md docs-update rule applies whenever an item moves out of this file into active work — the corresponding doc page needs to land in the same change.
- Tests for everything shipped to date are an explicit prerequisite before the next round of feature work (in progress at the time this file was written — see active tasks).
