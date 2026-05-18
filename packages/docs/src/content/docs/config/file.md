---
title: Config File
description: Schema for ~/.enter/config.json with defaults.
---

Enter reads `~/.enter/config.json` on startup. Override the root with `ENTER_HOME`. The file is optional — missing keys fall back to `DEFAULT_CONFIG`.

## Schema

```ts
interface EnterConfig {
  provider: string;          // e.g. "anthropic"
  model: string;             // provider-specific model id
  thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  thinkingBudgets: { low: number; medium: number; high: number };
  autonomy: {
    maxTurns: number;        // 1..1000
    idleStallTurns: number;  // 1..20
    wallClockMinutes: number;// 1..600
  };
  memory: {
    nudgeEveryNTurns: number;          // 1..50
    recallDefaultK: number;            // 1..20
    compactionThresholdTokens: number; // >= 1000
  };
  subagent: {
    defaultTools: string[];   // tool names exposed to a spawned subagent
    maxTurns: number;         // 1..200
    timeoutMinutes: number;   // 1..120
  };
  tools: {
    bash: {
      timeoutMs: number;                                       // >= 1000
      shell: "auto" | "powershell" | "cmd" | "bash";
    };
    webFetch: { timeoutMs: number; maxBytes: number };
  };
  ui: {
    color: boolean;
    renderer: "rich" | "plain";
  };
  mcpServers?: Record<string, {
    command: string;            // executable to spawn (`npx`, `python`, etc.)
    args?: string[];
    env?: Record<string, string>;
    description?: string;
  }>;
}
```

The schema is enforced with [Typebox](https://github.com/sinclairzx81/typebox); see `packages/core/src/config/config-schema.ts` for the canonical source.

## Defaults

`DEFAULT_CONFIG` is shipped as:

```json
{
  "provider": "anthropic",
  "model": "claude-opus-4-7",
  "thinkingLevel": "medium",
  "thinkingBudgets": { "low": 1024, "medium": 4096, "high": 16384 },
  "autonomy": { "maxTurns": 50, "idleStallTurns": 2, "wallClockMinutes": 30 },
  "memory": {
    "nudgeEveryNTurns": 6,
    "recallDefaultK": 5,
    "compactionThresholdTokens": 80000
  },
  "subagent": {
    "defaultTools": ["read", "glob", "grep", "bash", "web_fetch"],
    "maxTurns": 20,
    "timeoutMinutes": 5
  },
  "tools": {
    "bash": { "timeoutMs": 120000, "shell": "auto" },
    "webFetch": { "timeoutMs": 30000, "maxBytes": 1048576 }
  },
  "ui": { "color": true, "renderer": "rich" }
}
```

## What each block controls

- **provider / model** — the chat model. Override per-invocation with `--provider` / `--model` or env vars `ENTER_PROVIDER` / `ENTER_MODEL`.
- **thinkingLevel / thinkingBudgets** — extended thinking budget. `off` disables; `xhigh` is the model's maximum. Token amounts for `low/medium/high` are taken from `thinkingBudgets`.
- **autonomy** — defaults for `runAutonomous`. CLI `--max-turns` overrides `maxTurns`.
- **memory.nudgeEveryNTurns** — how often the `[memory-nudge]` user message is injected.
- **memory.compactionThresholdTokens** — once the rough token estimate exceeds this, the oldest messages get trimmed.
- **subagent.defaultTools** — the read-only-ish whitelist a spawned subagent gets when the caller doesn't override.
- **tools.bash.shell** — `auto` picks `powershell` on Windows, `bash` elsewhere. Pin it if your terminal misdetects.
- **ui.renderer** — `rich` for the full TUI, `plain` for the readline fallback (equivalent to `--simple`).
- **mcpServers** — optional map of external [Model Context Protocol](https://modelcontextprotocol.io) servers spawned at startup. Each tool the server exposes is registered as `mcp_<server-key>_<tool-name>` in both the CLI and the Teams bot. Example: `{ "sentry": { "command": "npx", "args": ["-y", "@sentry/mcp-server"], "env": { "SENTRY_AUTH_TOKEN": "..." } } }`. A failed connect is logged but doesn't block other servers from registering.

:::tip
You don't need to write the whole config. Drop the keys you want to override; everything else inherits from `DEFAULT_CONFIG` at runtime.
:::
