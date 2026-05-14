import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ToolContext } from "./context.js";
import { MEMORY_TYPES, type MemoryType } from "../memory/memory-types.js";

const RecallParams = Type.Object({
  query: Type.String({ description: "Free-text search query." }),
  k: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 20, description: "Max number of memories to return (default 5)." }),
  ),
  type: Type.Optional(
    Type.Union(MEMORY_TYPES.map((t) => Type.Literal(t)), {
      description: "Restrict to a single memory type.",
    }),
  ),
  scope: Type.Optional(
    Type.Union(
      [Type.Literal("channel"), Type.Literal("project"), Type.Literal("global"), Type.Literal("all")],
      { description: "Where to search. 'all' (default) ignores scope filtering." },
    ),
  ),
});

type Params = Static<typeof RecallParams>;

export function recallTool(ctx: ToolContext): AgentTool<typeof RecallParams> {
  return {
    name: "recall",
    label: "Recall memory",
    description:
      "Search the agent's long-term memory (FTS5 over markdown notes). Returns ranked snippets. Use BEFORE acting on assumptions about the user, project, or recurring patterns.",
    parameters: RecallParams,
    execute: async (_toolCallId, params: Params) => {
      const hits = ctx.memory.recall(params.query, {
        k: params.k ?? 5,
        type: params.type as MemoryType | undefined,
        scope: params.scope,
        projectHash: ctx.projectHash,
        channelKey: ctx.channelKey,
      });

      if (hits.length === 0) {
        return {
          content: [{ type: "text", text: `No memories matched "${params.query}".` }],
          details: { hits: [] },
        };
      }

      const lines: string[] = [];
      lines.push(`Recall — ${hits.length} hit(s) for "${params.query}":`);
      hits.forEach((h, i) => {
        lines.push(`${i + 1}. [${h.type}] ${h.name} — ${h.summary}`);
        if (h.snippet) lines.push(`   ${h.snippet.replace(/\s+/g, " ").trim()}`);
        lines.push(`   path: ${h.path}`);
      });

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { hits },
      };
    },
  };
}
