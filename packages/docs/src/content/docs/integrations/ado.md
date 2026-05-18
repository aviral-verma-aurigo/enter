---
title: Azure DevOps
description: Read and write work items, run WIQL queries, and link PRs back to ADO from the CLI and the Teams bot.
---

ADO is Enter's primary work-tracking integration. With it wired up, the agent can pull a work item's acceptance criteria into a planning turn, comment back with progress, link a PR to the work item, and run WIQL queries that span an iteration or area path.

## What it lets the agent do

- Read a single work item by ID (title, type, state, assignee, description, acceptance criteria).
- Run a WIQL query and fan out to `ado_work_item_get` for full details.
- Create work items (Bug, Task, User Story, etc.) with arbitrary field overrides.
- Update state, assignee, title, or arbitrary fields. Some transitions (e.g. closing a Bug) require additional fields — ADO's error is surfaced verbatim.
- Comment on a work item — visible in the Discussion tab.
- Add typed relations between work items (Parent / Child / Related / Successor / Predecessor / Tests / Tested By / Duplicate).
- Attach a PR URL as a Hyperlink relation on a work item (auto-invoked from `github_pr_open` when it detects `AB#NNNN` references in the title or body).

## Auth setup

Two modes — pick one. The CLI prefers PAT when both are configured.

### Option A — PAT (fastest, recommended for CLI)

| Variable | Notes |
|---|---|
| `ADO_ORG_URL` | `https://dev.azure.com/<your-org>` |
| `ADO_PAT` | Generated at `https://dev.azure.com/<your-org>/_usersSettings/tokens`. Scope: **Work Items (Read & write)**. |

### Option B — Entra service principal (recommended for the Teams bot)

| Variable | Notes |
|---|---|
| `ADO_ORG_URL` | `https://dev.azure.com/<your-org>` |
| `ADO_TENANT_ID` | Entra ID tenant. |
| `ADO_CLIENT_ID` | App registration (service-principal) client ID. |
| `ADO_CLIENT_SECRET` | Client secret for the app registration. |

The service principal needs **Reader/Contributor** access on the ADO organization (Organization settings → Users → add the SP as a member).

If neither mode is fully configured, ADO tools are not registered and the bot's `/healthz` reports `"ado": "missing"`.

## Tools exposed

See [`reference/tools` → Azure DevOps](/reference/tools/#azure-devops) for the full parameter list. Quick summary:

**Read:** `ado_work_item_get`, `ado_query`
**Write:** `ado_work_item_create`, `ado_work_item_update`, `ado_work_item_comment`, `ado_work_item_link`, `ado_work_item_link_pr`

## Attribution

Every write tool appends `— Requested by <name>` to its `System.History` entry. The line is visible in the work item's Discussion tab, so the chain of custody is auditable inside ADO without needing the bot's own logs. The agent identity is whichever PAT or SP authenticated; the requester is whoever @mentioned the bot in Teams (or the CLI user).

## Gotchas

- **PR back-linking** — `ado_work_item_link_pr` adds a Hyperlink relation. It's invoked automatically by `github_pr_open` when it detects `AB#NNNN` references in the PR title or body; you can also call it explicitly after the fact.
- **State transitions** — ADO process templates can require fields when transitioning state (e.g. a Bug closing needs a Resolution). The tool doesn't try to be clever; ADO's error message is returned as-is so the agent can retry with the missing field.
- **WIQL is project-scoped** — `ado_query` accepts an optional `project` to scope the query. Without it, the query runs at the organization level, which only works for org-wide queries.
