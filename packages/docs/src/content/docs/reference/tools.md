---
title: Tool Reference
description: Every tool the agent can call — name, scope, description, parameters.
---

All tools are `AgentTool` factories. The `parameters` column lists parameter names only; see the source in `packages/core/src/tools/` or `packages/teams-bot/src/tools/` for full Typebox schemas.

## Memory + graph (core)

| Name | Description | Parameters |
|---|---|---|
| `recall` | Search the agent's long-term memory (FTS5 over markdown notes). | `query`, `k?`, `type?`, `scope?` |
| `remember` | Save a memory the agent should keep across sessions. Auto-extracts graph edges from frontmatter, @mentions, and code paths. | `type`, `name`, `summary`, `body`, `tags?`, `entities?`, `links?` |
| `link` | Create a typed edge between two entities in the memory graph. | `src`, `type`, `dst`, `attrs?` |
| `neighbors` | Traverse the entity graph k hops out from a node, optionally filtered to one edge type. | `entity`, `edge_type?`, `k_hops?`, `limit?` |
| `path` | Find the shortest connection between two entities. | `from`, `to`, `max_hops?` |
| `entity_facts` | Return everything the agent knows about a single entity: node, adjacent edges, linked memory IDs. | `entity` |

## Files + shell (core)

| Name | Description | Parameters |
|---|---|---|
| `read` | Read a text file. Returns 1-indexed lines (cat -n style). | `file_path`, `offset?`, `limit?` |
| `write` | Create or overwrite a file with the given content. | `file_path`, `content` |
| `edit` | Exact-match string replacement in a file. Errors if `old_string` is not unique unless `replace_all=true`. | `file_path`, `old_string`, `new_string`, `replace_all?` |
| `bash` | Execute a shell command and return stdout/stderr. | `command`, `timeout_ms?` |
| `glob` | Find files matching a glob pattern (fast-glob). Skips node_modules/dist/.git. | `pattern`, `cwd?` |
| `grep` | Search file contents with a regex. Pure JS — no `rg` required. | `pattern`, `glob?`, `cwd?` |
| `web_fetch` | Fetch a URL and return its content. HTML is converted to markdown by default. | `url`, `format?` |

## Delegation + control (core)

| Name | Description | Parameters |
|---|---|---|
| `spawn_subagent` | Delegate a narrowly scoped task to a fresh agent with a restricted tool whitelist. | `task`, `allowed_tools?` |
| `delegate_to_claude_code` | Hand off a self-contained task to Claude Code via the Claude Agent SDK. | `task`, `allowed_tools?`, `cwd?`, `max_turns?`, `system_prompt?` |
| `author_skill` | Write a new SKILL.md for a recurring procedure the agent has noticed. Includes a one-shot critique pass. | `name`, `trigger`, `procedure`, `rationale?` |
| `done` | Mark the autonomous goal complete. Terminates the loop. | `summary`, `artifacts?` |
| `propose_plan` | Plan-first mode: save a markdown plan to `~/.enter/plans/` and stop. Available only when the autonomous loop is active (`--autonomous` / `--plan`). | `goal`, `steps`, `critical_files?`, `verification?` |

## Integrations (CLI + Teams bot)

These tools are registered in **both surfaces** when the integration's env vars are set. See [Environment Variables](/config/env/) for setup.

### Azure DevOps

Read:

| Name | Description | Parameters |
|---|---|---|
| `ado_work_item_get` | Fetch a work item by ID. Returns title, type, state, assigned to, description, acceptance criteria. | `id`, `expand?` |
| `ado_query` | Run a WIQL query. Returns matching work-item IDs and titles. Pair with `ado_work_item_get` for full details. | `wiql`, `project?`, `limit?` |

Write:

| Name | Description | Parameters |
|---|---|---|
| `ado_work_item_create` | Create a new work item. Convenience args for title/description/assigned_to/area/iteration/tags; arbitrary fields via the `fields` map. | `project`, `type`, `title`, `description?`, `assigned_to?`, `area_path?`, `iteration_path?`, `tags?`, `fields?` |
| `ado_work_item_update` | Patch fields on an existing work item. Convenience args for state/assigned_to/title; arbitrary fields via `fields`. Some state transitions require additional fields (e.g. closing a Bug may need a Resolution); ADO's error is surfaced verbatim. | `id`, `state?`, `assigned_to?`, `title?`, `fields?`, `comment?` |
| `ado_work_item_comment` | Add a comment to a work item. The identity authors; human requester appended as attribution. | `id`, `project`, `body` |
| `ado_work_item_link` | Add a typed relation between two work items (Parent/Child/Related/Successor/Predecessor/Tests/Tested By/Duplicate). Friendly names or literal ADO link types accepted. | `id`, `rel`, `target_id`, `comment?` |
| `ado_work_item_link_pr` | Attach a pull-request URL as a Hyperlink relation on a work item. Use after `github_pr_open` to back-link. | `id`, `pr_url`, `comment?` |

Auth: `ADO_PAT` (fastest, CLI-friendly) or `ADO_TENANT_ID` + `ADO_CLIENT_ID` + `ADO_CLIENT_SECRET` (service principal, recommended for the bot).

:::tip[Attribution]
Every write tool appends `— Requested by <name>` as a System.History entry (visible in the work item's Discussion tab). Auditable in ADO without needing the bot's own logs.
:::

### Confluence Cloud

| Name | Description | Parameters |
|---|---|---|
| `confluence_page_get` | Fetch a page by numeric id or URL. Returns title, body (plain text by default; raw storage markup with `format: "storage"`), version, and the webui link. Use to pull PRD context, runbooks, ADRs. | `id_or_url`, `format?` |
| `confluence_search` | Run a CQL (Confluence Query Language) search. Returns matching page titles, ids, and space keys. Pair with `confluence_page_get` for full bodies. | `cql`, `limit?` |
| `confluence_page_append_comment` | Add a footer comment to a Confluence page. Identity authors; human requester appended as attribution. Body is HTML-escaped before posting. | `page_id_or_url`, `body` |

Auth: bot account email + API token (`CONFLUENCE_BASE_URL` + `CONFLUENCE_USER` + `CONFLUENCE_API_TOKEN`). Same shared-credential pattern used for ADO writes — works org-wide with no per-user OAuth.

### Aha!

| Name | Description | Parameters |
|---|---|---|
| `aha_feature_get` | Fetch a feature by `reference_num` (e.g. `APP-123`) or numeric id. Returns name, status, assigned_to, release, description, and the Aha! web URL. | `id` |
| `aha_release_get` | Fetch a release by reference_num or numeric id. Returns name, release_date, derived status (in development / released / scheduled), parking_lot flag. | `id` |
| `aha_feature_comment` | Add a comment to a feature. Identity authors; human requester appended as an HTML-escaped attribution footer. | `id`, `body` |

Auth: service-account API key (`AHA_BASE_URL` + `AHA_API_KEY`). Get the key from Aha! → Settings → Account → API. Same shared-credential pattern — no per-user OAuth.

### MCP (Model Context Protocol)

Configure external MCP servers under `mcpServers` in `~/.enter/config.json` (see [Config File](/config/file/)). Each tool the server exposes is registered with a namespaced name `mcp_<server-key>_<tool-name>` and otherwise behaves exactly like a native Enter tool. The Anthropic-recommended servers (Sentry, Linear, Notion, Figma, Slack) all ship as stdio MCP servers and slot in without any per-vendor adapter code. A failed connect is logged; one bad server doesn't block the rest.

## Teams bot only

These tools are registered only in `@enter/teams-bot`. They never run in the CLI. They require a GitHub App.

### Repository and shell

| Name | Description | Parameters |
|---|---|---|
| `sandboxed_bash` | Run a shell command inside the channel's git worktree. Working directory pinned; denylist blocks `sudo`, raw `curl`/`wget`/`ssh`/`scp`, destructive `rm`. | `command`, `timeout_ms?` |
| `git_clone` | Clone a GitHub repo into the channel's ephemeral worktree using the bot's GitHub App credentials. | `repo`, `ref?` |
| `git_push` | Push a branch to the remote using the bot's GitHub App credentials. | `branch`, `set_upstream?` |
| `run_tests` | Detect and run the project's test suite. Auto-detects npm/pytest/cargo/go/maven/gradle/bundler. | `command?`, `timeout_ms?` |
| `github_pr_open` | Open a PR on the channel's currently-cloned repo. Auto-detects `AB#NNNN` work-item references in the title and body, injects a "Linked ADO work items" section into the PR body, and (best-effort) adds a Hyperlink relation on each referenced work item pointing back at the new PR. Bot never merges. | `title`, `body`, `head`, `base?`, `draft?` |
| `github_pr_comment` | Add a comment to an existing PR on the channel's currently-cloned repo. | `pr_number`, `body` |
| `github_pr_fetch` | Fetch a PR's metadata and changed files (with patches) so the agent can review it. Pair with `github_pr_review` to submit findings. | `pr_number`, `per_page?` |
| `github_pr_review` | Submit a PR review. `event` is `COMMENT` (default) or `REQUEST_CHANGES` — `APPROVE` is disallowed because the bot never approves or merges. Optional inline `comments` anchor to `(path, line, side)` tuples. | `pr_number`, `body`, `event?`, `comments?` |

:::caution[Denylist]
`sandboxed_bash` blocks a curated denylist (`sudo`, raw network fetchers, destructive deletes, etc). The bot is not a free-form shell — when the denylist refuses something, that's the system working as designed.
:::
