import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import { spawnSubagent } from "../subagent/spawn.js";
import type { ToolContext } from "./context.js";

const SpawnSubagentParams = Type.Object({
  task: Type.String({ minLength: 1, description: "Self-contained instruction for the subagent." }),
  allowed_tools: Type.Optional(
    Type.Array(Type.String(), {
      description: "Optional override for the subagent's tool whitelist. Defaults to a read-only set.",
    }),
  ),
  max_turns: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  timeout_minutes: Type.Optional(Type.Integer({ minimum: 1, maximum: 30 })),
});

type Params = Static<typeof SpawnSubagentParams>;

const DEFAULT_ALLOWED = ["read", "glob", "grep", "bash", "web_fetch", "recall", "neighbors", "path", "entity_facts"];
/** Subagents must never recurse or write durable state in v0. */
const ALWAYS_EXCLUDE = new Set(["spawn_subagent", "remember", "link", "done", "author_skill", "delegate_to_claude_code"]);

export interface SpawnSubagentToolOptions {
  model: Model<any>;
  apiKey: string;
  /** Function that returns the parent's full tool catalog at call time. */
  getParentTools: () => AgentTool[];
}

export function spawnSubagentTool(
  _ctx: ToolContext,
  options: SpawnSubagentToolOptions,
): AgentTool<typeof SpawnSubagentParams> {
  return {
    name: "spawn_subagent",
    label: "Spawn subagent",
    description:
      "Delegate a narrowly scoped task to a fresh agent instance with a restricted tool whitelist. Use when you want a focused investigation that shouldn't pollute the parent context.",
    parameters: SpawnSubagentParams,
    execute: async (_id, params: Params) => {
      const requested = params.allowed_tools ?? DEFAULT_ALLOWED;
      const allowed = requested.filter((n) => !ALWAYS_EXCLUDE.has(n));
      const summary = await spawnSubagent({
        task: params.task,
        allowedTools: allowed,
        parentToolCatalog: options.getParentTools(),
        model: options.model,
        apiKey: options.apiKey,
        maxTurns: params.max_turns ?? 20,
        timeoutMs: (params.timeout_minutes ?? 5) * 60 * 1000,
      });
      const text =
        `Subagent (session ${summary.sessionId}) — ${summary.stoppedReason} after ${summary.turns} turn(s), ${summary.toolCalls.length} tool call(s):\n` +
        summary.text;
      return {
        content: [{ type: "text", text }],
        details: summary,
      };
    },
  };
}
