import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { NODE_TYPES } from "../memory/graph-store.js";
import type { ToolContext } from "./context.js";

const EntityFactsParams = Type.Object({
  entity: Type.Object({
    type: Type.Union(NODE_TYPES.map((t) => Type.Literal(t))),
    key: Type.String({ minLength: 1, maxLength: 200 }),
  }),
});

type Params = Static<typeof EntityFactsParams>;

export function entityFactsTool(ctx: ToolContext): AgentTool<typeof EntityFactsParams> {
  return {
    name: "entity_facts",
    label: "Entity facts",
    description:
      "Return everything the agent knows about a single entity: the node itself, all adjacent edges (incoming + outgoing), and IDs of memories that referenced it.",
    parameters: EntityFactsParams,
    execute: async (_toolCallId, params: Params) => {
      const facts = ctx.graph.entityFacts(params.entity);
      if (!facts) {
        return {
          content: [
            {
              type: "text",
              text: `No entity found for ${params.entity.type}:${params.entity.key}.`,
            },
          ],
          details: { found: false },
        };
      }
      const lines: string[] = [];
      lines.push(`Entity: ${facts.node.type}:${facts.node.key} (${facts.node.label})`);
      if (Object.keys(facts.node.attrs).length > 0) {
        lines.push(`Attributes: ${JSON.stringify(facts.node.attrs)}`);
      }
      lines.push(`Edges (${facts.edges.length}):`);
      for (const e of facts.edges) {
        const direction = e.src === facts.node.id ? "->" : "<-";
        const other = e.src === facts.node.id ? e.dst : e.src;
        lines.push(`  ${direction} [${e.type}] ${other}${e.confidence < 1 ? ` (conf=${e.confidence})` : ""}`);
      }
      if (facts.linkedMemoryIds.length > 0) {
        lines.push(`Linked memories: ${facts.linkedMemoryIds.length}`);
      }
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { found: true, ...facts },
      };
    },
  };
}
