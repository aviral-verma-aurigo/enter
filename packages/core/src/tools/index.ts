import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type { ToolContext } from "./context.js";
import type { DoneSignal } from "../autonomous/done-signal.js";

import { recallTool } from "./recall.js";
import { rememberTool } from "./remember.js";
import { linkTool } from "./link.js";
import { neighborsTool } from "./neighbors.js";
import { pathTool } from "./path.js";
import { entityFactsTool } from "./entity-facts.js";
import { readTool } from "./read.js";
import { writeTool } from "./write.js";
import { editTool } from "./edit.js";
import { bashTool, type BashToolOptions } from "./bash.js";
import { globTool } from "./glob.js";
import { grepTool } from "./grep.js";
import { webFetchTool } from "./web-fetch.js";
import { spawnSubagentTool } from "./spawn-subagent.js";
import { delegateClaudeCodeTool } from "./delegate-claude-code.js";
import { authorSkillTool } from "./author-skill-tool.js";
import { doneTool } from "./done.js";

export * from "./context.js";

export interface BuildToolsOptions {
  ctx: ToolContext;
  model: Model<any>;
  apiKey: string;
  /** When set, include the `done` tool wired to this signal (autonomous mode). */
  doneSignal?: DoneSignal;
  /** Allow-list of tool names. If omitted, all tools are included. */
  allowed?: string[];
  /** Additional tools (e.g., the Teams bot's git/PR/sandboxed_bash tools). */
  extra?: AgentTool[];
  /** Per-tool options. */
  bash?: BashToolOptions;
  /** Whether to include the `bash` tool. The bot replaces it with `sandboxed_bash`. */
  includeBash?: boolean;
}

/**
 * Build the full Enter tool catalog.
 *
 * The CLI calls this with `allowed` undefined (everything enabled).
 * The Teams bot calls this with `allowed` restricted to safe tools + its own `extra` set.
 */
export function registerBuiltinTools(options: BuildToolsOptions): AgentTool[] {
  const { ctx, model, apiKey } = options;

  // We need a self-reference for spawn_subagent's parent tool catalog.
  // Build the list first, then patch in the spawn tool which closes over `tools`.
  let tools: AgentTool[] = [];

  const core: AgentTool[] = [
    recallTool(ctx),
    rememberTool(ctx),
    linkTool(ctx),
    neighborsTool(ctx),
    pathTool(ctx),
    entityFactsTool(ctx),
    readTool(ctx),
    writeTool(ctx),
    editTool(ctx),
    globTool(ctx),
    grepTool(ctx),
    webFetchTool(ctx),
    delegateClaudeCodeTool(ctx),
    authorSkillTool(ctx, { model, apiKey }),
  ];
  if (options.includeBash !== false) {
    core.push(bashTool(ctx, options.bash ?? {}));
  }

  const spawn = spawnSubagentTool(ctx, {
    model,
    apiKey,
    getParentTools: () => tools,
  });
  core.push(spawn);

  if (options.doneSignal) {
    core.push(doneTool(options.doneSignal));
  }

  if (options.extra) {
    core.push(...options.extra);
  }

  tools = core;

  if (options.allowed) {
    const allow = new Set(options.allowed);
    tools = tools.filter((t) => allow.has(t.name));
  }
  return tools;
}
