import fs from "node:fs";
import path from "node:path";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { stringifyFrontmatter } from "../memory/memory-frontmatter.js";
import { extractEntities } from "../memory/entity-extract.js";
import { writeIndex } from "../memory/memory-index.js";
import { MEMORY_TYPES, type MemoryType } from "../memory/memory-types.js";
import { NODE_TYPES, EDGE_TYPES } from "../memory/graph-store.js";
import type { ToolContext } from "./context.js";

const EntitySchema = Type.Object({
  type: Type.Union(NODE_TYPES.map((t) => Type.Literal(t))),
  key: Type.String({ minLength: 1, maxLength: 200 }),
  label: Type.Optional(Type.String()),
});

const LinkSchema = Type.Object({
  type: Type.Union(EDGE_TYPES.map((t) => Type.Literal(t))),
  to: Type.Object({
    type: Type.Union(NODE_TYPES.map((t) => Type.Literal(t))),
    key: Type.String({ minLength: 1, maxLength: 200 }),
  }),
  attrs: Type.Optional(Type.Record(Type.String(), Type.Any())),
});

const RememberParams = Type.Object({
  type: Type.Union(MEMORY_TYPES.map((t) => Type.Literal(t))),
  name: Type.String({
    minLength: 1,
    maxLength: 64,
    pattern: "^[a-z0-9][a-z0-9-]*$",
    description: "kebab-case slug, unique per (type, scope).",
  }),
  summary: Type.String({ minLength: 1, maxLength: 280 }),
  body: Type.String({ minLength: 1 }),
  tags: Type.Optional(Type.Array(Type.String())),
  entities: Type.Optional(Type.Array(EntitySchema)),
  links: Type.Optional(Type.Array(LinkSchema)),
});

type Params = Static<typeof RememberParams>;

function memoryFilePath(ctx: ToolContext, type: MemoryType, name: string): string {
  const base = ctx.paths.memoryDir;
  if (type === "channel") {
    const channel = ctx.channelKey ?? "unscoped";
    return path.join(base, "channel", safeKey(channel), `${name}.md`);
  }
  if (type === "project") {
    const proj = ctx.projectHash ?? "unscoped";
    return path.join(base, "project", proj, `${name}.md`);
  }
  return path.join(base, type, `${name}.md`);
}

function safeKey(k: string): string {
  return k.replace(/[\\/:*?"<>|]/g, "_");
}

export function rememberTool(ctx: ToolContext): AgentTool<typeof RememberParams> {
  return {
    name: "remember",
    label: "Remember",
    description:
      "Save a memory the agent should keep across sessions. Use for user preferences (type=user), corrections (type=feedback), project facts (type=project), external references (type=reference), or per-channel context (type=channel). Automatically extracts entity graph edges from frontmatter, @mentions, and code paths in the body.",
    parameters: RememberParams,
    execute: async (_toolCallId, params: Params) => {
      const filePath = memoryFilePath(ctx, params.type, params.name);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });

      const created = new Date().toISOString();

      const record = ctx.memory.upsert({
        type: params.type,
        name: params.name,
        summary: params.summary,
        body: params.body,
        path: filePath,
        tags: params.tags ?? [],
        projectHash: params.type === "project" ? ctx.projectHash : null,
        channelKey: params.type === "channel" ? ctx.channelKey : null,
      });

      const frontmatter: Record<string, unknown> = {
        id: record.id,
        type: record.type,
        name: record.name,
        summary: record.summary,
        created: record.created,
        updated: record.updated,
        tags: record.tags,
      };
      if (record.projectHash) frontmatter["project"] = record.projectHash;
      if (record.channelKey) frontmatter["channel"] = record.channelKey;
      if (params.entities) frontmatter["entities"] = params.entities;
      if (params.links) frontmatter["links"] = params.links;

      const fileContent = stringifyFrontmatter({ frontmatter, body: params.body });
      fs.writeFileSync(filePath, fileContent, "utf8");

      // Extract & upsert graph nodes/edges in a single transaction.
      const { nodes, edges } = extractEntities({
        memoryId: record.id,
        memoryName: record.name,
        memorySummary: record.summary,
        body: params.body,
        frontmatter,
      });

      ctx.memory.transaction(() => {
        for (const n of nodes) ctx.graph.upsertNode(n);
        for (const e of edges) ctx.graph.upsertEdge(e);
        return null;
      });

      const all = ctx.memory.list();
      writeIndex(ctx.paths.memoryIndexFile, all);

      return {
        content: [
          {
            type: "text",
            text: `Saved ${record.type} memory '${record.name}'. ${edges.length} graph edge(s) extracted.`,
          },
        ],
        details: { id: record.id, path: filePath, edges: edges.length, nodes: nodes.length, created },
      };
    },
  };
}
