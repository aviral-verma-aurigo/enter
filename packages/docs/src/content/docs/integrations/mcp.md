---
title: Model Context Protocol
description: Pull in external MCP servers — Sentry, Linear, Notion, Figma, Slack — without writing a per-vendor adapter.
---

[MCP](https://modelcontextprotocol.io) is the escape hatch for everything Enter doesn't have a native integration for. Configure a stdio MCP server in `~/.enter/config.json` and every tool that server exposes becomes a regular Enter tool — namespaced, schema-checked, and available in both the CLI and the Teams bot.

## What it lets the agent do

Whatever the MCP server lets it do. The Anthropic-recommended servers all ship as stdio MCP and slot in without per-vendor adapter code:

- **Sentry** — `@sentry/mcp-server` — issues, events, performance.
- **Linear** — `@modelcontextprotocol/server-linear` — issues, projects, comments.
- **Notion** — `@modelcontextprotocol/server-notion` — pages, databases.
- **Figma** — `@figma/mcp-server` — files, components, comments.
- **Slack** — `@modelcontextprotocol/server-slack` — channels, messages, search.

There's no per-vendor code in Enter for any of these — they're MCP all the way down.

## Setup

Add an `mcpServers` block to `~/.enter/config.json`. Each key is the **server-key** that namespaces the tools at registration.

```json
{
  "mcpServers": {
    "sentry": {
      "command": "npx",
      "args": ["-y", "@sentry/mcp-server"],
      "env": { "SENTRY_AUTH_TOKEN": "..." },
      "description": "Sentry issues + events"
    },
    "linear": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-linear"],
      "env": { "LINEAR_API_KEY": "..." }
    }
  }
}
```

See [Config File](/config/file/) for the full schema. Each server is spawned at startup; per-server env is merged onto the spawned process's environment so credentials never appear in the parent shell.

## Tool naming

Every tool the server registers shows up as:

```
mcp_<server-key>_<tool-name>
```

So Sentry's `get_issue` becomes `mcp_sentry_get_issue`. Namespacing keeps tool collisions impossible across servers and makes audit logs readable at a glance.

## Failure semantics

- A failed connect at startup is logged and the server is skipped. **One bad server doesn't block the rest** — Enter starts with whatever connected successfully.
- Tool-call failures surface to the agent as regular tool errors. The agent can retry or give up.
- Servers are spawned per Enter process. The Teams bot's per-channel runtime means MCP servers run **per bot process**, not per channel — credentials in `mcpServers.*.env` are visible to every channel the bot serves.

## Roadmap — per-channel allowlist

The current model is "every MCP server registered in the bot's config is available in every channel." That's fine for an org-wide Sentry/Linear setup, but it doesn't fit servers carrying channel-scoped credentials. A per-channel allowlist is in `BACKLOG.md` — once landed, you'll be able to scope a server to specific channel IDs in the config.

Until then, **don't put per-team credentials into bot-wide `mcpServers`**. Use it for org-wide read access only. The CLI is unaffected — each user has their own `~/.enter/config.json`.

## Gotchas

- **`command` is the executable.** Use `npx -y <package>` for npm-hosted servers, `python -m <module>` for Python servers. Don't put the package name in `command` directly — it has to be a real binary on `PATH`.
- **Stdio only.** HTTP/SSE MCP transports aren't wired up yet.
- **Schemas come from the server.** MCP servers advertise tool schemas at handshake time. If the server changes its schema, restart Enter to pick up the new shape.
