---
title: Confluence Cloud
description: Pull PRDs, runbooks, and ADRs into the agent's context; append footer comments back to pages.
---

Confluence is Enter's primary doc-context integration. With it wired up, the agent can pull a PRD into a planning turn, search a space with CQL for the right design doc, and leave a footer comment when it's referenced a page during a task.

## What it lets the agent do

- Fetch a page by numeric ID or full URL — title, version, web link, body (plain text by default; raw storage markup if you ask for it).
- Run a CQL (Confluence Query Language) search — returns matching page titles, IDs, space keys. Pair with `confluence_page_get` for full bodies.
- Append a footer comment to a page. Body is HTML-escaped before posting.

## Auth setup

| Variable | Notes |
|---|---|
| `CONFLUENCE_BASE_URL` | Base URL including `/wiki`, e.g. `https://your.atlassian.net/wiki`. |
| `CONFLUENCE_USER` | Bot account email. |
| `CONFLUENCE_API_TOKEN` | Generate at `id.atlassian.com → Manage account → Security → API tokens`. |

All three must be set together. If any are missing, Confluence tools are not registered.

The bot account needs:

- **Read** access on the spaces you want Enter to query.
- **Write** access on the spaces you want it to comment on.

Same shared-credential pattern as ADO writes — works org-wide with no per-user OAuth.

## Tools exposed

See [`reference/tools` → Confluence](/reference/tools/#confluence-cloud) for the full parameter list. Quick summary:

**Read:** `confluence_page_get`, `confluence_search`
**Write:** `confluence_page_append_comment`

## Attribution

Comments are authored by the bot account but include an HTML-escaped attribution footer naming the human who triggered the request (Teams `activity.from.name`, or the CLI user). Anyone reading the comment in Confluence sees both: bot identity in the author field, requester in the body.

## Gotchas

- **`/wiki` in the base URL** — Confluence Cloud's REST API lives under `/wiki/rest/api`. The base URL must include `/wiki`, otherwise requests 404.
- **Storage format vs plain** — `confluence_page_get` returns plain text by default (extracted from the storage XHTML). Pass `format: "storage"` if the agent needs the raw markup — useful for understanding macros, panels, and embedded content the plain extractor drops.
- **CQL space scoping** — `confluence_search` accepts arbitrary CQL. If you want results inside one space, include `space = "KEY"` in the query — the tool doesn't auto-scope.
