import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/memory/memory-store.js";

function open(): MemoryStore {
  return MemoryStore.open(":memory:");
}

describe("MemoryStore", () => {
  it("opens an in-memory database with schema applied", () => {
    const m = open();
    expect(m.db.pragma("journal_mode")).toBeDefined();
    m.close();
  });

  it("upserts a memory and reads it back", () => {
    const m = open();
    const rec = m.upsert({
      type: "user",
      name: "terse-comments",
      summary: "User prefers terse code comments.",
      body: "Don't write multi-line docstrings.",
      path: "/tmp/terse-comments.md",
      tags: ["style"],
    });
    expect(rec.id).toMatch(/^[A-Z0-9]{26}$/);
    expect(rec.type).toBe("user");
    expect(rec.name).toBe("terse-comments");
    expect(rec.tags).toEqual(["style"]);

    const fetched = m.getById(rec.id);
    expect(fetched?.summary).toBe("User prefers terse code comments.");
    m.close();
  });

  it("upsert is idempotent on (type, name, project, channel)", () => {
    const m = open();
    const a = m.upsert({ type: "user", name: "foo", summary: "v1", body: "first", path: "/p" });
    const b = m.upsert({ type: "user", name: "foo", summary: "v2", body: "second", path: "/p" });
    expect(a.id).toBe(b.id);
    expect(m.list({ type: "user" })).toHaveLength(1);
    expect(m.getById(a.id)?.summary).toBe("v2");
    m.close();
  });

  it("scopes channel-type memories by channelKey", () => {
    const m = open();
    m.upsert({ type: "channel", name: "n", summary: "A", body: "a", path: "/a", channelKey: "tenant:teamA:chA" });
    m.upsert({ type: "channel", name: "n", summary: "B", body: "b", path: "/b", channelKey: "tenant:teamB:chB" });
    expect(m.list({ type: "channel" })).toHaveLength(2);
    expect(m.list({ channelKey: "tenant:teamA:chA" })).toHaveLength(1);
    m.close();
  });

  it("recall returns FTS5 hits ranked by relevance", () => {
    const m = open();
    m.upsert({ type: "user", name: "a", summary: "hates emojis in code", body: "no emojis", path: "/a" });
    m.upsert({ type: "user", name: "b", summary: "loves cookies", body: "cookies are great", path: "/b" });
    const hits = m.recall("emojis");
    expect(hits.length).toBe(1);
    expect(hits[0]!.name).toBe("a");
    m.close();
  });

  it("recall sanitizes FTS-special characters in the query", () => {
    const m = open();
    m.upsert({ type: "user", name: "x", summary: "needs colons:and *stars*", body: "asterisks", path: "/x" });
    // The raw query has FTS5-special chars that would normally crash MATCH.
    const hits = m.recall("colons: *stars*");
    expect(hits.length).toBe(1);
    expect(hits[0]!.name).toBe("x");
    m.close();
  });

  it("recall increments hits on returned rows", () => {
    const m = open();
    const rec = m.upsert({ type: "user", name: "h", summary: "hello", body: "world", path: "/h" });
    expect(m.getById(rec.id)?.hits).toBe(0);
    m.recall("hello");
    expect(m.getById(rec.id)?.hits).toBe(1);
    m.recall("hello");
    expect(m.getById(rec.id)?.hits).toBe(2);
    m.close();
  });

  it("recall filters by type", () => {
    const m = open();
    m.upsert({ type: "user", name: "u", summary: "shared term", body: "x", path: "/u" });
    m.upsert({ type: "feedback", name: "f", summary: "shared term", body: "x", path: "/f" });
    expect(m.recall("shared", { type: "user" })).toHaveLength(1);
    expect(m.recall("shared", { type: "feedback" })).toHaveLength(1);
    expect(m.recall("shared")).toHaveLength(2);
    m.close();
  });

  it("delete removes the row and FTS entry", () => {
    const m = open();
    const r = m.upsert({ type: "user", name: "z", summary: "removable", body: "x", path: "/z" });
    expect(m.recall("removable")).toHaveLength(1);
    expect(m.delete(r.id)).toBe(true);
    expect(m.recall("removable")).toHaveLength(0);
    expect(m.getById(r.id)).toBeNull();
    m.close();
  });

  it("isolates user-keyed memories of the same name", () => {
    const m = open();
    const alice = m.upsert({
      type: "user",
      name: "terse-replies",
      summary: "Alice likes terse",
      body: "a",
      path: "/a",
      channelKey: "ch1",
      userKey: "alice-aad",
    });
    const bob = m.upsert({
      type: "user",
      name: "terse-replies",
      summary: "Bob likes verbose",
      body: "b",
      path: "/b",
      channelKey: "ch1",
      userKey: "bob-aad",
    });
    // Two separate rows despite identical (type, name, channel) — user_key differentiates.
    expect(alice.id).not.toBe(bob.id);
    expect(m.list({ type: "user" })).toHaveLength(2);
    expect(m.list({ userKey: "alice-aad" })).toHaveLength(1);
    expect(m.list({ userKey: "bob-aad" })).toHaveLength(1);
    m.close();
  });

  it("recall scope='user' restricts to the current user's memories", () => {
    const m = open();
    m.upsert({
      type: "user",
      name: "a",
      summary: "alice secret sauce",
      body: "a",
      path: "/a",
      userKey: "alice-aad",
    });
    m.upsert({
      type: "user",
      name: "b",
      summary: "bob secret sauce",
      body: "b",
      path: "/b",
      userKey: "bob-aad",
    });
    const aliceHits = m.recall("secret", { scope: "user", userKey: "alice-aad" });
    expect(aliceHits).toHaveLength(1);
    expect(aliceHits[0]!.name).toBe("a");
    const bobHits = m.recall("secret", { scope: "user", userKey: "bob-aad" });
    expect(bobHits).toHaveLength(1);
    expect(bobHits[0]!.name).toBe("b");
    // default scope='all' still sees both
    expect(m.recall("secret")).toHaveLength(2);
    m.close();
  });

  it("migrates a pre-user_key database additively", () => {
    // Build a real pre-user_key fixture on disk: create the memories table
    // without user_key, insert a row, close, then open via MemoryStore.open
    // and verify it doesn't crash on the user_key index creation.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "enter-mem-migrate-"));
    const dbPath = path.join(tmp, "memories.db");
    try {
      const seed = new Database(dbPath);
      seed.exec(`
        CREATE TABLE memories (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          summary TEXT NOT NULL,
          body TEXT NOT NULL,
          path TEXT NOT NULL,
          project_hash TEXT,
          channel_key TEXT,
          tags TEXT NOT NULL DEFAULT '[]',
          created TEXT NOT NULL,
          updated TEXT NOT NULL,
          hits INTEGER NOT NULL DEFAULT 0
        );
      `);
      seed
        .prepare(
          `INSERT INTO memories (id, type, name, summary, body, path, created, updated)
           VALUES ('OLD01', 'user', 'pre', 'from before', 'legacy body', '/p', '2024-01-01', '2024-01-01')`,
        )
        .run();
      seed.close();

      // The buggy ordering would throw here with "no such column: user_key".
      const m = MemoryStore.open(dbPath);

      // Column was added; existing row is preserved with userKey=null.
      const list = m.list({ type: "user" });
      expect(list).toHaveLength(1);
      expect(list[0]!.userKey).toBeNull();
      expect(list[0]!.name).toBe("pre");

      // New rows scoped by userKey work alongside the migrated legacy row.
      m.upsert({
        type: "user",
        name: "post",
        summary: "after migration",
        body: "y",
        path: "/q",
        userKey: "alice",
      });
      expect(m.list({ userKey: "alice" })).toHaveLength(1);
      m.close();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("list orders by updated DESC", async () => {
    const m = open();
    const first = m.upsert({ type: "user", name: "older", summary: "x", body: "x", path: "/1" });
    await new Promise((r) => setTimeout(r, 10));
    const second = m.upsert({ type: "user", name: "newer", summary: "x", body: "x", path: "/2" });
    const list = m.list({ type: "user" });
    expect(list[0]!.id).toBe(second.id);
    expect(list[1]!.id).toBe(first.id);
    m.close();
  });
});
