import type { EdgeType, NodeRef, NodeType, UpsertEdgeInput } from "./graph-store.js";
import { EDGE_TYPES, NODE_TYPES } from "./graph-store.js";

export interface ExtractInput {
  memoryId: string;
  memoryName: string;
  memorySummary: string;
  body: string;
  frontmatter: Record<string, unknown>;
  /** Optional default node type for free-text mention extraction; defaults to "Person". */
}

export interface ExtractResult {
  nodes: NodeRef[];
  edges: UpsertEdgeInput[];
}

interface FrontmatterEntity {
  type: NodeType;
  key: string;
  label?: string;
}

interface FrontmatterLink {
  type: EdgeType;
  to: { type: NodeType; key: string };
  attrs?: Record<string, unknown>;
}

function isNodeType(value: unknown): value is NodeType {
  return typeof value === "string" && (NODE_TYPES as readonly string[]).includes(value);
}
function isEdgeType(value: unknown): value is EdgeType {
  return typeof value === "string" && (EDGE_TYPES as readonly string[]).includes(value);
}

function parseEntities(value: unknown): FrontmatterEntity[] {
  if (!Array.isArray(value)) return [];
  const out: FrontmatterEntity[] = [];
  for (const v of value as unknown[]) {
    if (!v || typeof v !== "object") continue;
    const rec = v as Record<string, unknown>;
    const t = rec["type"];
    const k = rec["key"];
    if (!isNodeType(t) || typeof k !== "string" || k.length === 0) continue;
    out.push({ type: t, key: k, label: typeof rec["label"] === "string" ? rec["label"] : undefined });
  }
  return out;
}

function parseLinks(value: unknown): FrontmatterLink[] {
  if (!Array.isArray(value)) return [];
  const out: FrontmatterLink[] = [];
  for (const v of value as unknown[]) {
    if (!v || typeof v !== "object") continue;
    const rec = v as Record<string, unknown>;
    const t = rec["type"];
    if (!isEdgeType(t)) continue;
    const to = rec["to"];
    if (!to || typeof to !== "object") continue;
    const toRec = to as Record<string, unknown>;
    if (!isNodeType(toRec["type"]) || typeof toRec["key"] !== "string") continue;
    out.push({
      type: t,
      to: { type: toRec["type"] as NodeType, key: String(toRec["key"]) },
      attrs: typeof rec["attrs"] === "object" && rec["attrs"] ? (rec["attrs"] as Record<string, unknown>) : undefined,
    });
  }
  return out;
}

const MENTION_RE = /(?:^|[\s(\[])@([A-Za-z0-9_.-]{2,40})\b/g;
const PATH_RE = /\b((?:[a-zA-Z]:\\|\/|\.\/|[\w-]+\/)[\w./\\-]*\.[a-zA-Z0-9]{1,8})\b/g;

/**
 * Deterministic entity extraction — no LLM. Pulls:
 *   1. Frontmatter `entities:` / `links:`
 *   2. `@mentions` in body  →  Person + MENTIONS
 *   3. Code paths in body   →  File   + MENTIONS
 * The result is keyed off the memory's `Memory` node so callers can upsert in a single transaction.
 */
export function extractEntities(input: ExtractInput): ExtractResult {
  const memoryNode: NodeRef = {
    type: "Memory",
    key: input.memoryId,
    label: input.memoryName,
    attrs: { summary: input.memorySummary },
  };

  const nodes: NodeRef[] = [memoryNode];
  const edges: UpsertEdgeInput[] = [];

  // Frontmatter entities + links
  const fmEntities = parseEntities(input.frontmatter["entities"]);
  for (const e of fmEntities) {
    nodes.push({ type: e.type, key: e.key, label: e.label });
    edges.push({
      src: memoryNode,
      dst: { type: e.type, key: e.key, label: e.label },
      type: "MENTIONS",
      confidence: 1.0,
      sourceMemoryId: input.memoryId,
    });
  }

  const fmLinks = parseLinks(input.frontmatter["links"]);
  for (const link of fmLinks) {
    nodes.push(link.to);
    edges.push({
      src: memoryNode,
      dst: link.to,
      type: link.type,
      confidence: 1.0,
      sourceMemoryId: input.memoryId,
      attrs: link.attrs,
    });
  }

  // @mentions in body → Person
  const seenMentions = new Set<string>();
  for (const match of input.body.matchAll(MENTION_RE)) {
    const handle = match[1];
    if (!handle) continue;
    const norm = handle.toLowerCase();
    if (seenMentions.has(norm)) continue;
    seenMentions.add(norm);
    const personRef: NodeRef = { type: "Person", key: norm, label: handle };
    nodes.push(personRef);
    edges.push({
      src: memoryNode,
      dst: personRef,
      type: "MENTIONS",
      confidence: 1.0,
      sourceMemoryId: input.memoryId,
    });
  }

  // Code paths → File
  const seenPaths = new Set<string>();
  for (const match of input.body.matchAll(PATH_RE)) {
    const filePath = match[1];
    if (!filePath) continue;
    const norm = filePath.replace(/\\/g, "/");
    if (seenPaths.has(norm)) continue;
    if (norm.length < 4 || !/\.[a-zA-Z0-9]{1,8}$/.test(norm)) continue;
    seenPaths.add(norm);
    const fileRef: NodeRef = { type: "File", key: norm, label: norm.split("/").slice(-1)[0] ?? norm };
    nodes.push(fileRef);
    edges.push({
      src: memoryNode,
      dst: fileRef,
      type: "MENTIONS",
      confidence: 1.0,
      sourceMemoryId: input.memoryId,
    });
  }

  return { nodes, edges };
}
