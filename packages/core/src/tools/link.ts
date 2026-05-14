import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { NODE_TYPES, EDGE_TYPES } from "../memory/graph-store.js";
import type { ToolContext } from "./context.js";

const NodeRefSchema = Type.Object({
  type: Type.Union(NODE_TYPES.map((t) => Type.Literal(t))),
  key: Type.String({ minLength: 1, maxLength: 200 }),
  label: Type.Optional(Type.String()),
});

const LinkParams = Type.Object({
  src: NodeRefSchema,
  type: Type.Union(EDGE_TYPES.map((t) => Type.Literal(t))),
  dst: NodeRefSchema,
  attrs: Type.Optional(Type.Record(Type.String(), Type.Any())),
});

type Params = Static<typeof LinkParams>;

export function linkTool(ctx: ToolContext): AgentTool<typeof LinkParams> {
  return {
    name: "link",
    label: "Link entities",
    description:
      "Create a typed edge between two entities in the memory graph. Use to record relationships you've noticed (e.g., a Person WORKS_ON a Project, a File DEPENDS_ON another File). Edges are confidence=1.0 (deterministic, agent-authored).",
    parameters: LinkParams,
    execute: async (_toolCallId, params: Params) => {
      const edge = ctx.graph.upsertEdge({
        src: params.src,
        dst: params.dst,
        type: params.type,
        attrs: params.attrs,
        confidence: 1.0,
      });
      return {
        content: [
          {
            type: "text",
            text: `Linked ${params.src.type}:${params.src.key} -[${params.type}]-> ${params.dst.type}:${params.dst.key}.`,
          },
        ],
        details: edge,
      };
    },
  };
}
