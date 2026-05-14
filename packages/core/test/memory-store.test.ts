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
