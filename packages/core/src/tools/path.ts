import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { NODE_TYPES } from "../memory/graph-store.js";
import type { ToolContext } from "./context.js";

const PathParams = Type.Object({
  from: Type.Object({
    type: Type.Union(NODE_TYPES.map((t) => Type.Literal(t))),
    key: Type.String({ minLength: 1 }),
  }),
  to: Type.Object({
    type: Type.Union(NODE_TYPES.map((t) => Type.Literal(t))),
    key: Type.String({ minLength: 1 }),
  }),
  max_hops: Type.Optional(Type.Integer({ minimum: 1, maximum: 6 })),
});

type Params = Static<typeof PathParams>;

export function pathTool(ctx: ToolContext): AgentTool<typeof PathParams> {
  return {
    name: "path",
    label: "Graph path",
    description:
      "Find the shortest connection between two entities in the graph. Returns the chain of edges or null if unreachable within max_hops.",
    parameters: PathParams,
    execute: async (_toolCallId, params: Params) => {
      const edges = ctx.graph.shortestPath(params.from, params.to, params.max_hops ?? 4);
      if (edges === null) {
        return {
          content: [
            {
              type: "text",
              text: `No path found between ${params.from.type}:${params.from.key} and ${params.to.type}:${params.to.key} within ${params.max_hops ?? 4} hops.`,
            },
          ],
          details: { path: null },
        };
      }
      if (edges.length === 0) {
        return {
          content: [{ type: "text", text: "Same node — distance 0." }],
          details: { path: [], length: 0 },
        };
      }
      const lines = [`Path (${edges.length} edge(s)):`];
      for (const e of edges) lines.push(`  ${e.src} -[${e.type}]-> ${e.dst}`);
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { path: edges, length: edges.length },
      };
    },
  };
}
