// @enter/core — public exports.
// Filled in as modules land. See plan: packages/core/src/index.ts.

export * from "./config/paths.js";
export * from "./config/config-schema.js";
export * from "./config/config-loader.js";
export * from "./config/api-keys.js";
export * from "./config/model.js";

export * from "./memory/memory-types.js";
export * from "./memory/memory-store.js";
export * from "./memory/memory-index.js";
export * from "./memory/memory-frontmatter.js";
export * from "./memory/graph-store.js";
export * from "./memory/entity-extract.js";
export * from "./memory/memory-nudge.js";

export * from "./skills/load.js";
export * from "./skills/author-skill.js";

export * from "./autonomous/auto-loop.js";
export * from "./autonomous/done-signal.js";
export * from "./autonomous/stop-conditions.js";

export * from "./subagent/spawn.js";

export * from "./delegates/claude-code.js";

export * from "./tools/index.js";

export * from "./persona/soul-loader.js";
export * from "./persona/system-prompt.js";

export * from "./agent-factory.js";

export * from "./session/repo.js";
export * from "./session/export.js";

export * from "./util/logger.js";
export * from "./util/platform.js";
export * from "./util/errors.js";

// Integrations (CLI + bot can both register these)
export * from "./integrations/ado/index.js";
export * from "./integrations/confluence/index.js";
export * from "./integrations/aha/index.js";

// MCP (Model Context Protocol) — connects to external tool servers via stdio.
export * from "./mcp/index.js";
