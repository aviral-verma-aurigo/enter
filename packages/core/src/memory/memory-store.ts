import Database from "better-sqlite3";
import type { Database as DB } from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { ulid } from "ulid";
import { MEMORY_TYPES, type MemoryRecord, type MemoryType, type RecallHit, type RecallScope } from "./memory-types.js";
import { MemoryError } from "../util/errors.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  path TEXT NOT NULL,
  project_hash TEXT,
  channel_key TEXT,
  user_key TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  created TEXT NOT NULL,
  updated TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_channel ON memories(channel_key);
CREATE INDEX IF NOT EXISTS idx_user ON memories(user_key);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  name, summary, body, tags,
  content='memories', content_rowid='rowid',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, name, summary, body, tags)
  VALUES (new.rowid, new.name, new.summary, new.body, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, name, summary, body, tags)
  VALUES ('delete', old.rowid, old.name, old.summary, old.body, old.tags);
END;
CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, name, summary, body, tags)
  VALUES ('delete', old.rowid, old.name, old.summary, old.body, old.tags);
  INSERT INTO memories_fts(rowid, name, summary, body, tags)
  VALUES (new.rowid, new.name, new.summary, new.body, new.tags);
END;
`;

export interface UpsertMemoryInput {
  type: MemoryType;
  name: string;
  summary: string;
  body: string;
  path: string;
  projectHash?: string | null;
  channelKey?: string | null;
  userKey?: string | null;
  tags?: string[];
}

export interface RecallOptions {
  k?: number;
  type?: MemoryType;
  scope?: RecallScope;
  projectHash?: string | null;
  channelKey?: string | null;
  userKey?: string | null;
}

function isMemoryType(value: unknown): value is MemoryType {
  return typeof value === "string" && (MEMORY_TYPES as readonly string[]).includes(value);
}

function rowToRecord(row: Record<string, unknown>): MemoryRecord {
  const type = row["type"];
  if (!isMemoryType(type)) {
    throw new MemoryError(`Invalid memory type in row: ${String(type)}`);
  }
  return {
    id: String(row["id"]),
    type,
    name: String(row["name"]),
    summary: String(row["summary"]),
    body: String(row["body"]),
    path: String(row["path"]),
    projectHash: (row["project_hash"] as string | null) ?? null,
    channelKey: (row["channel_key"] as string | null) ?? null,
    userKey: (row["user_key"] as string | null) ?? null,
    tags: JSON.parse(String(row["tags"] ?? "[]")) as string[],
    created: String(row["created"]),
    updated: String(row["updated"]),
    hits: Number(row["hits"] ?? 0),
  };
}

export class MemoryStore {
  readonly db: DB;
  private readonly dbPath: string;

  private constructor(db: DB, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  static open(dbPath: string): MemoryStore {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
    // Migrate pre-user_key databases: add column + rebuild the unique index so
    // identical-named user memories from different teammates can coexist.
    const cols = db.prepare(`PRAGMA table_info(memories)`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "user_key")) {
      db.exec(`ALTER TABLE memories ADD COLUMN user_key TEXT`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_user ON memories(user_key)`);
    }
    db.exec(`DROP INDEX IF EXISTS idx_type_name_scope`);
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_type_name_scope
         ON memories(type, name, COALESCE(project_hash,''), COALESCE(channel_key,''), COALESCE(user_key,''))`,
    );
    return new MemoryStore(db, dbPath);
  }

  close(): void {
    this.db.close();
  }

  upsert(input: UpsertMemoryInput): MemoryRecord {
    const now = new Date().toISOString();
    const existing = this.db
      .prepare<[string, string, string, string, string], Record<string, unknown>>(
        `SELECT * FROM memories
         WHERE type = ? AND name = ?
           AND COALESCE(project_hash,'') = ?
           AND COALESCE(channel_key,'') = ?
           AND COALESCE(user_key,'') = ?`,
      )
      .get(
        input.type,
        input.name,
        input.projectHash ?? "",
        input.channelKey ?? "",
        input.userKey ?? "",
      );

    const id = existing ? String(existing["id"]) : ulid();
    const created = existing ? String(existing["created"]) : now;
    const tagsJson = JSON.stringify(input.tags ?? []);

    this.db
      .prepare(
        `INSERT INTO memories (id, type, name, summary, body, path, project_hash, channel_key, user_key, tags, created, updated, hits)
         VALUES (@id, @type, @name, @summary, @body, @path, @projectHash, @channelKey, @userKey, @tags, @created, @updated, COALESCE((SELECT hits FROM memories WHERE id = @id), 0))
         ON CONFLICT(id) DO UPDATE SET
           summary = excluded.summary,
           body = excluded.body,
           path = excluded.path,
           tags = excluded.tags,
           updated = excluded.updated`,
      )
      .run({
        id,
        type: input.type,
        name: input.name,
        summary: input.summary,
        body: input.body,
        path: input.path,
        projectHash: input.projectHash ?? null,
        channelKey: input.channelKey ?? null,
        userKey: input.userKey ?? null,
        tags: tagsJson,
        created,
        updated: now,
      });

    const row = this.db
      .prepare<[string], Record<string, unknown>>(`SELECT * FROM memories WHERE id = ?`)
      .get(id);
    if (!row) throw new MemoryError(`Failed to read back memory ${id}`);
    return rowToRecord(row);
  }

  getById(id: string): MemoryRecord | null {
    const row = this.db
      .prepare<[string], Record<string, unknown>>(`SELECT * FROM memories WHERE id = ?`)
      .get(id);
    return row ? rowToRecord(row) : null;
  }

  getByName(
    type: MemoryType,
    name: string,
    projectHash: string | null = null,
    channelKey: string | null = null,
    userKey: string | null = null,
  ): MemoryRecord | null {
    const row = this.db
      .prepare<[string, string, string, string, string], Record<string, unknown>>(
        `SELECT * FROM memories
         WHERE type = ? AND name = ?
           AND COALESCE(project_hash,'') = ?
           AND COALESCE(channel_key,'') = ?
           AND COALESCE(user_key,'') = ?`,
      )
      .get(type, name, projectHash ?? "", channelKey ?? "", userKey ?? "");
    return row ? rowToRecord(row) : null;
  }

  delete(id: string): boolean {
    const res = this.db.prepare(`DELETE FROM memories WHERE id = ?`).run(id);
    return res.changes > 0;
  }

  list(filter: { type?: MemoryType; channelKey?: string | null; userKey?: string | null } = {}): MemoryRecord[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.type) {
      where.push("type = ?");
      params.push(filter.type);
    }
    if (filter.channelKey !== undefined) {
      if (filter.channelKey === null) {
        where.push("channel_key IS NULL");
      } else {
        where.push("channel_key = ?");
        params.push(filter.channelKey);
      }
    }
    if (filter.userKey !== undefined) {
      if (filter.userKey === null) {
        where.push("user_key IS NULL");
      } else {
        where.push("user_key = ?");
        params.push(filter.userKey);
      }
    }
    const sql = `SELECT * FROM memories${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY updated DESC`;
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(rowToRecord);
  }

  recall(query: string, options: RecallOptions = {}): RecallHit[] {
    const k = Math.min(Math.max(options.k ?? 5, 1), 20);
    const where: string[] = ["memories_fts MATCH ?"];
    const params: unknown[] = [sanitizeFtsQuery(query)];

    if (options.type) {
      where.push("m.type = ?");
      params.push(options.type);
    }

    const scope = options.scope ?? "all";
    if (scope === "channel" && options.channelKey) {
      where.push("m.channel_key = ?");
      params.push(options.channelKey);
    } else if (scope === "project" && options.projectHash) {
      where.push("(m.project_hash = ? OR m.project_hash IS NULL)");
      params.push(options.projectHash);
    } else if (scope === "user" && options.userKey) {
      where.push("m.user_key = ?");
      params.push(options.userKey);
    } else if (scope === "global") {
      where.push("m.channel_key IS NULL AND m.project_hash IS NULL AND m.user_key IS NULL");
    }

    const sql = `
      SELECT m.id, m.type, m.name, m.summary, m.path, m.channel_key, m.project_hash, m.user_key,
             snippet(memories_fts, 2, '<<', '>>', '…', 12) AS snippet
      FROM memories m
      JOIN memories_fts ON memories_fts.rowid = m.rowid
      WHERE ${where.join(" AND ")}
      ORDER BY bm25(memories_fts)
      LIMIT ?
    `;
    params.push(k);
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];

    const hits: RecallHit[] = rows.map((row) => {
      const type = row["type"];
      if (!isMemoryType(type)) {
        throw new MemoryError(`Invalid memory type in recall result: ${String(type)}`);
      }
      return {
        id: String(row["id"]),
        type,
        name: String(row["name"]),
        summary: String(row["summary"]),
        snippet: String(row["snippet"] ?? ""),
        path: String(row["path"]),
        channelKey: (row["channel_key"] as string | null) ?? null,
        projectHash: (row["project_hash"] as string | null) ?? null,
        userKey: (row["user_key"] as string | null) ?? null,
      };
    });

    if (hits.length > 0) {
      const updateHits = this.db.prepare(`UPDATE memories SET hits = hits + 1 WHERE id = ?`);
      const tx = this.db.transaction((ids: string[]) => {
        for (const id of ids) updateHits.run(id);
      });
      tx(hits.map((h) => h.id));
    }

    return hits;
  }

  /** Run a function inside a single SQLite transaction. */
  transaction<T>(fn: (store: MemoryStore) => T): T {
    return this.db.transaction(() => fn(this))();
  }

  get path(): string {
    return this.dbPath;
  }
}

/**
 * Sanitize free-form text into a safe FTS5 MATCH query.
 * Strips characters that have special meaning in FTS5 expressions and falls back to a phrase if empty.
 */
function sanitizeFtsQuery(input: string): string {
  const cleaned = input.replace(/["*:()]/g, " ").trim();
  if (cleaned.length === 0) return '""';
  const tokens = cleaned.split(/\s+/).filter((t) => t.length > 0);
  return tokens.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ");
}
