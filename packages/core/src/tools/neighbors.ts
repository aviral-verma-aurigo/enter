import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { NODE_TYPES, EDGE_TYPES } from "../memory/graph-store.js";
import type { ToolContext } from "./context.js";

const NeighborsParams = Type.Object({
  entity: Type.Object({
    type: Type.Union(NODE_TYPES.map((t) => Type.Literal(t))),
    key: Type.String({ minLength: 1, maxLength: 200 }),
  }),
  edge_type: Type.Optional(Type.Union(EDGE_TYPES.map((t) => Type.Literal(t)))),
  k_hops: Type.Optional(Type.Integer({ minimum: 1, maximum: 6 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
});

type Params = Static<typeof NeighborsParams>;

export function neighborsTool(ctx: ToolContext): AgentTool<typeof NeighborsParams> {
  return {
    name: "neighbors",
    label: "Graph neighbors",
    description:
      "Traverse the entity graph k hops out from a node, optionally filtered to one edge type. Returns connected nodes and edges. Use to answer 'who works on X' or 'what's connected to Y'.",
    parameters: NeighborsParams,
    execute: async (_toolCallId, params: Params) => {
      const result = ctx.graph.neighbors(params.entity, {
        edgeType: params.edge_type,
        kHops: params.k_hops ?? 1,
        limit: params.limit ?? 20,
      });

      if (result.nodes.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No neighbors found for ${params.entity.type}:${params.entity.key}.`,
            },
          ],
          details: result,
        };
      }

      const lines: string[] = [
        `Neighbors of ${params.entity.type}:${params.entity.key} (k=${params.k_hops ?? 1}):`,
      ];
      for (const n of result.nodes) {
        lines.push(`  - ${n.type}:${n.key} (${n.label})`);
      }
      lines.push(`Edges (${result.edges.length}):`);
      for (const e of result.edges) {
        lines.push(`  - ${e.src} -[${e.type}]-> ${e.dst}`);
      }
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: result,
      };
    },
  };
}
