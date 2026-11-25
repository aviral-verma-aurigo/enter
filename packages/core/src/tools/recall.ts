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
      [
        Type.Literal("channel"),
        Type.Literal("project"),
        Type.Literal("user"),
        Type.Literal("global"),
        Type.Literal("all"),
      ],
      {
        description:
          "Where to search. 'all' (default) ignores scope filtering. 'user' restricts to memories the current user saved (Teams aadObjectId / CLI session).",
      },
    ),
  ),
});

type Params = Static<typeof RecallParams>;

/** Hits older than this many days get an age marker so the agent re-verifies before citing. */
export const STALE_AFTER_DAYS = 30;

/**
 * Render an age marker for a recall hit. Empty string when the memory is fresh
 * (updated within `STALE_AFTER_DAYS`) or when the timestamp is unparsable.
 */
export function staleness(updatedIso: string, now: Date = new Date()): string {
  const updated = Date.parse(updatedIso);
  if (Number.isNaN(updated)) return "";
  const days = Math.floor((now.getTime() - updated) / 86_400_000);
  if (days < STALE_AFTER_DAYS) return "";
  return ` (aged: ${days}d old — re-verify before citing)`;
}

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
        userKey: ctx.userKey,
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
        const age = staleness(h.updated);
        lines.push(`${i + 1}. [${h.type}] ${h.name}${age} — ${h.summary}`);
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
