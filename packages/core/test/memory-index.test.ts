import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeIndex, readIndex } from "../src/memory/memory-index.js";
import type { MemoryRecord } from "../src/memory/memory-types.js";

let tmpDir: string;
let indexFile: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "enter-memidx-"));
  indexFile = path.join(tmpDir, "MEMORY.md");
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function record(overrides: Partial<MemoryRecord>): MemoryRecord {
  return {
    id: "01ABC",
    type: "user",
    name: "name",
    summary: "summary",
    body: "body",
    path: path.join(tmpDir, "name.md"),
    projectHash: null,
    channelKey: null,
    userKey: null,
    tags: [],
    created: "2026-05-14T00:00:00Z",
    updated: "2026-05-14T00:00:00Z",
    hits: 0,
    ...overrides,
  };
}

describe("MEMORY.md index", () => {
  it("writeIndex produces a header and groups entries by type", () => {
    writeIndex(indexFile, [
      record({ id: "1", type: "user", name: "a", summary: "user mem" }),
      record({ id: "2", type: "feedback", name: "b", summary: "feedback mem" }),
    ]);
    const content = fs.readFileSync(indexFile, "utf8");
    expect(content).toMatch(/^# Enter memory index/);
    expect(content).toContain("## user");
    expect(content).toContain("## feedback");
    expect(content).toContain("[a] (2026-05-14) — user mem");
    expect(content).toContain("[b] (2026-05-14) — feedback mem");
  });

  it("omits sections with no entries", () => {
    writeIndex(indexFile, [record({ type: "user" })]);
    const content = fs.readFileSync(indexFile, "utf8");
    expect(content).toContain("## user");
    expect(content).not.toContain("## feedback");
    expect(content).not.toContain("## channel");
  });

  it("within a section, entries are sorted by updated DESC", () => {
    writeIndex(indexFile, [
      record({ name: "older", updated: "2026-05-01T00:00:00Z" }),
      record({ name: "newer", updated: "2026-06-01T00:00:00Z" }),
    ]);
    const content = fs.readFileSync(indexFile, "utf8");
    const olderPos = content.indexOf("[older]");
    const newerPos = content.indexOf("[newer]");
    expect(newerPos).toBeLessThan(olderPos);
    expect(newerPos).toBeGreaterThan(-1);
  });

  it("round-trips: readIndex parses what writeIndex wrote", () => {
    writeIndex(indexFile, [
      record({ id: "1", type: "user", name: "tip", summary: "a useful tip" }),
      record({ id: "2", type: "project", name: "rfc", summary: "design note" }),
    ]);
    const entries = readIndex(indexFile);
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.name === "tip")?.summary).toBe("a useful tip");
    expect(entries.find((e) => e.name === "rfc")?.type).toBe("project");
  });

  it("readIndex on missing file returns an empty list (no throw)", () => {
    expect(readIndex(indexFile)).toEqual([]);
  });

  it("readIndex tolerates extra prose lines between entries", () => {
    writeIndex(indexFile, [record({ name: "a", summary: "first" })]);
    // Append some prose
    fs.appendFileSync(indexFile, "\nSome free-form prose nobody can parse.\n", "utf8");
    const entries = readIndex(indexFile);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe("a");
  });
});
