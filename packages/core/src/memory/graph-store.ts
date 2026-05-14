import type { Database as DB } from "better-sqlite3";
import { ulid } from "ulid";
import type { MemoryStore } from "./memory-store.js";
import { MemoryError } from "../util/errors.js";

export const NODE_TYPES = [
  "Person",
  "Customer",
  "Product",
  "Project",
  "Module",
  "File",
  "Symbol",
  "Memory",
  "Topic",
  "PR",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const EDGE_TYPES = [
  "WORKS_ON",
  "OWNS",
  "PART_OF",
  "DEPENDS_ON",
  "MENTIONS",
  "AUTHORED",
  "AFFECTS",
  "SUPERSEDES",
  "RELATES_TO",
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  key  TEXT NOT NULL,
  label TEXT NOT NULL,
  attrs TEXT,
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_type_key ON nodes(type, key);

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  src TEXT NOT NULL REFERENCES nodes(id),
  dst TEXT NOT NULL REFERENCES nodes(id),
  type TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  source_memory_id TEXT,
  attrs TEXT,
  created TEXT NOT NULL,
  valid_until TEXT
);
CREATE INDEX IF NOT EXISTS idx_edges_src_type ON edges(src, type);
CREATE INDEX IF NOT EXISTS idx_edges_dst_type ON edges(dst, type);
CREATE INDEX IF NOT EXISTS idx_edges_source_mem ON edges(source_memory_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_unique
  ON edges(src, dst, type, COALESCE(source_memory_id, ''));
`;

export interface NodeRef {
  type: NodeType;
  key: string;
  label?: string;
  attrs?: Record<string, unknown>;
}

export interface NodeRow {
  id: string;
  type: NodeType;
  key: string;
  label: string;
  attrs: Record<string, unknown>;
  created: string;
  updated: string;
}

export interface EdgeRow {
  id: string;
  src: string;
  dst: string;
  type: EdgeType;
  confidence: number;
  sourceMemoryId: string | null;
  attrs: Record<string, unknown>;
  created: string;
  validUntil: string | null;
}

export interface UpsertEdgeInput {
  src: NodeRef;
  dst: NodeRef;
  type: EdgeType;
  confidence?: number;
  sourceMemoryId?: string | null;
  attrs?: Record<string, unknown>;
  validUntil?: string | null;
}

function isNodeType(value: unknown): value is NodeType {
  return typeof value === "string" && (NODE_TYPES as readonly string[]).includes(value);
}
function isEdgeType(value: unknown): value is EdgeType {
  return typeof value === "string" && (EDGE_TYPES as readonly string[]).includes(value);
}

function parseAttrs(value: unknown): Record<string, unknown> {
  if (!value) return {};
  try {
    return JSON.parse(String(value)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function rowToNode(row: Record<string, unknown>): NodeRow {
  const type = row["type"];
  if (!isNodeType(type)) throw new MemoryError(`Invalid node type: ${String(type)}`);
  return {
    id: String(row["id"]),
    type,
    key: String(row["key"]),
    label: String(row["label"]),
    attrs: parseAttrs(row["attrs"]),
    created: String(row["created"]),
    updated: String(row["updated"]),
  };
}

function rowToEdge(row: Record<string, unknown>): EdgeRow {
  const type = row["type"];
  if (!isEdgeType(type)) throw new MemoryError(`Invalid edge type: ${String(type)}`);
  return {
    id: String(row["id"]),
    src: String(row["src"]),
    dst: String(row["dst"]),
    type,
    confidence: Number(row["confidence"] ?? 1),
    sourceMemoryId: (row["source_memory_id"] as string | null) ?? null,
    attrs: parseAttrs(row["attrs"]),
    created: String(row["created"]),
    validUntil: (row["valid_until"] as string | null) ?? null,
  };
}

export class GraphStore {
  private constructor(private readonly db: DB) {}

  static attach(memory: MemoryStore): GraphStore {
    const gs = new GraphStore(memory.db);
    memory.db.exec(SCHEMA);
    return gs;
  }

  upsertNode(ref: NodeRef): NodeRow {
    const now = new Date().toISOString();
    const existing = this.db
      .prepare<[string, string], Record<string, unknown>>(
        `SELECT * FROM nodes WHERE type = ? AND key = ?`,
      )
      .get(ref.type, ref.key);
    if (existing) {
      const label = ref.label ?? String(existing["label"]);
      const attrs = { ...parseAttrs(existing["attrs"]), ...(ref.attrs ?? {}) };
      this.db
        .prepare(
          `UPDATE nodes SET label = ?, attrs = ?, updated = ? WHERE id = ?`,
        )
        .run(label, JSON.stringify(attrs), now, existing["id"]);
      const refreshed = this.db
        .prepare<[string], Record<string, unknown>>(`SELECT * FROM nodes WHERE id = ?`)
        .get(String(existing["id"]));
      return rowToNode(refreshed!);
    }
    const id = ulid();
    const label = ref.label ?? ref.key;
    const attrs = ref.attrs ?? {};
    this.db
      .prepare(
        `INSERT INTO nodes (id, type, key, label, attrs, created, updated)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, ref.type, ref.key, label, JSON.stringify(attrs), now, now);
    return { id, type: ref.type, key: ref.key, label, attrs, created: now, updated: now };
  }

  upsertEdge(input: UpsertEdgeInput): EdgeRow {
    const now = new Date().toISOString();
    const src = this.upsertNode(input.src);
    const dst = this.upsertNode(input.dst);
    const confidence = input.confidence ?? 1.0;
    const sourceMemoryId = input.sourceMemoryId ?? null;
    const attrsJson = JSON.stringify(input.attrs ?? {});

    const existing = this.db
      .prepare<[string, string, string, string], Record<string, unknown>>(
        `SELECT * FROM edges
         WHERE src = ? AND dst = ? AND type = ?
           AND COALESCE(source_memory_id,'') = ?`,
      )
      .get(src.id, dst.id, input.type, sourceMemoryId ?? "");
    if (existing) {
      this.db
        .prepare(
          `UPDATE edges SET confidence = ?, attrs = ?, valid_until = ? WHERE id = ?`,
        )
        .run(confidence, attrsJson, input.validUntil ?? null, existing["id"]);
      const refreshed = this.db
        .prepare<[string], Record<string, unknown>>(`SELECT * FROM edges WHERE id = ?`)
        .get(String(existing["id"]));
      return rowToEdge(refreshed!);
    }

    const id = ulid();
    this.db
      .prepare(
        `INSERT INTO edges (id, src, dst, type, confidence, source_memory_id, attrs, created, valid_until)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        src.id,
        dst.id,
        input.type,
        confidence,
        sourceMemoryId,
        attrsJson,
        now,
        input.validUntil ?? null,
      );

    return {
      id,
      src: src.id,
      dst: dst.id,
      type: input.type,
      confidence,
      sourceMemoryId,
      attrs: input.attrs ?? {},
      created: now,
      validUntil: input.validUntil ?? null,
    };
  }

  findNode(type: NodeType, key: string): NodeRow | null {
    const row = this.db
      .prepare<[string, string], Record<string, unknown>>(
        `SELECT * FROM nodes WHERE type = ? AND key = ?`,
      )
      .get(type, key);
    return row ? rowToNode(row) : null;
  }

  getNode(id: string): NodeRow | null {
    const row = this.db
      .prepare<[string], Record<string, unknown>>(`SELECT * FROM nodes WHERE id = ?`)
      .get(id);
    return row ? rowToNode(row) : null;
  }

  /**
   * k-hop traversal from a starting node (undirected — follows both `src` and `dst`).
   * Returns the set of reachable nodes (excluding the starting node) and the edges visited.
   */
  neighbors(
    start: NodeRef,
    options: { edgeType?: EdgeType; kHops?: number; limit?: number } = {},
  ): { nodes: NodeRow[]; edges: EdgeRow[] } {
    const node = this.findNode(start.type, start.key);
    if (!node) return { nodes: [], edges: [] };

    const maxHops = Math.min(Math.max(options.kHops ?? 1, 1), 6);
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 200);
    const edgeFilter = options.edgeType ? `AND e.type = '${options.edgeType.replace(/'/g, "")}'` : "";

    const sql = `
      WITH RECURSIVE walk(node_id, edge_id, depth) AS (
        SELECT ?, NULL, 0
        UNION
        SELECT
          CASE WHEN e.src = w.node_id THEN e.dst ELSE e.src END,
          e.id,
          w.depth + 1
        FROM walk w
        JOIN edges e ON (e.src = w.node_id OR e.dst = w.node_id) ${edgeFilter}
        WHERE w.depth < ?
      )
      SELECT DISTINCT walk.node_id, walk.edge_id, walk.depth FROM walk
      ORDER BY walk.depth
      LIMIT ?
    `;
    const rows = this.db.prepare(sql).all(node.id, maxHops, limit) as Record<string, unknown>[];

    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();
    for (const r of rows) {
      const nid = String(r["node_id"]);
      const eid = r["edge_id"];
      if (nid !== node.id) nodeIds.add(nid);
      if (eid) edgeIds.add(String(eid));
    }

    const nodes: NodeRow[] = [];
    for (const id of nodeIds) {
      const n = this.getNode(id);
      if (n) nodes.push(n);
    }
    const edges: EdgeRow[] = [];
    if (edgeIds.size > 0) {
      const placeholders = Array.from(edgeIds).map(() => "?").join(",");
      const rows = this.db
        .prepare(`SELECT * FROM edges WHERE id IN (${placeholders})`)
        .all(...Array.from(edgeIds)) as Record<string, unknown>[];
      edges.push(...rows.map(rowToEdge));
    }
    return { nodes, edges };
  }

  /**
   * Shortest path between two nodes (undirected). Returns the chain of edges or `null` if unreachable.
   */
  shortestPath(from: NodeRef, to: NodeRef, maxHops = 4): EdgeRow[] | null {
    const a = this.findNode(from.type, from.key);
    const b = this.findNode(to.type, to.key);
    if (!a || !b) return null;
    if (a.id === b.id) return [];

    const cap = Math.min(Math.max(maxHops, 1), 6);
    const sql = `
      WITH RECURSIVE bfs(node_id, depth, path_json) AS (
        SELECT ?, 0, '[]'
        UNION ALL
        SELECT
          CASE WHEN e.src = bfs.node_id THEN e.dst ELSE e.src END,
          bfs.depth + 1,
          json_insert(bfs.path_json, '$[#]', e.id)
        FROM bfs
        JOIN edges e ON (e.src = bfs.node_id OR e.dst = bfs.node_id)
        WHERE bfs.depth < ?
      )
      SELECT path_json FROM bfs WHERE node_id = ? ORDER BY depth LIMIT 1
    `;
    const row = this.db.prepare(sql).get(a.id, cap, b.id) as Record<string, unknown> | undefined;
    if (!row) return null;
    const ids = JSON.parse(String(row["path_json"] ?? "[]")) as string[];
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const rows = this.db
      .prepare(`SELECT * FROM edges WHERE id IN (${placeholders})`)
      .all(...ids) as Record<string, unknown>[];
    const byId = new Map(rows.map((r) => [String(r["id"]), r] as const));
    return ids.map((id) => rowToEdge(byId.get(id) ?? {}));
  }

  /**
   * All adjacent edges + linked memory IDs for an entity.
   */
  entityFacts(ref: NodeRef): { node: NodeRow; edges: EdgeRow[]; linkedMemoryIds: string[] } | null {
    const node = this.findNode(ref.type, ref.key);
    if (!node) return null;
    const edgeRows = this.db
      .prepare(`SELECT * FROM edges WHERE src = ? OR dst = ?`)
      .all(node.id, node.id) as Record<string, unknown>[];
    const edges = edgeRows.map(rowToEdge);
    const linkedMemoryIds = new Set<string>();
    for (const e of edges) {
      if (e.sourceMemoryId) linkedMemoryIds.add(e.sourceMemoryId);
    }
    if (node.type === "Memory") linkedMemoryIds.add(node.key);
    return { node, edges, linkedMemoryIds: Array.from(linkedMemoryIds) };
  }
}
