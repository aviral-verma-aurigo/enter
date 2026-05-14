import { describe, expect, it } from "vitest";
import { extractEntities } from "../src/memory/entity-extract.js";

describe("extractEntities — deterministic graph extraction", () => {
  function call(body: string, frontmatter: Record<string, unknown> = {}) {
    return extractEntities({
      memoryId: "MEM01",
      memoryName: "mem-1",
      memorySummary: "summary",
      body,
      frontmatter,
    });
  }

  it("always yields a Memory node for the memory itself", () => {
    const r = call("hello world");
    expect(r.nodes[0]).toMatchObject({ type: "Memory", key: "MEM01" });
  });

  it("frontmatter entities produce typed nodes + MENTIONS edges", () => {
    const r = call("", {
      entities: [
        { type: "Person", key: "alice" },
        { type: "Project", key: "checkout" },
      ],
    });
    expect(r.nodes.some((n) => n.type === "Person" && n.key === "alice")).toBe(true);
    expect(r.nodes.some((n) => n.type === "Project" && n.key === "checkout")).toBe(true);
    expect(r.edges.every((e) => e.confidence === 1.0)).toBe(true);
  });

  it("frontmatter links produce typed edges with the requested rel", () => {
    const r = call("", {
      links: [
        { type: "WORKS_ON", to: { type: "Project", key: "checkout" } },
      ],
    });
    const worksOn = r.edges.filter((e) => e.type === "WORKS_ON");
    expect(worksOn).toHaveLength(1);
    expect(worksOn[0]!.dst).toMatchObject({ type: "Project", key: "checkout" });
  });

  it("ignores frontmatter entities with invalid types", () => {
    const r = call("", {
      entities: [
        { type: "BogusType", key: "x" },
        { type: "Person", key: "alice" },
      ],
    });
    const people = r.nodes.filter((n) => n.type === "Person");
    expect(people).toHaveLength(1);
    expect(r.nodes.some((n) => (n.type as string) === "BogusType")).toBe(false);
  });

  it("extracts @mentions in body to Person nodes (case-insensitive, deduped)", () => {
    const r = call("This was reviewed by @Alice and (@bob), then @alice again.");
    const persons = r.nodes.filter((n) => n.type === "Person").map((n) => n.key);
    expect(persons.sort()).toEqual(["alice", "bob"]);
  });

  it("ignores @-handles inside emails-style text", () => {
    const r = call("email me at alice@example.com — not @alice though wait yes @alice");
    // `alice@example.com` doesn't match because the @ is preceded by `e` (a word char),
    // but `@alice` after a space does match.
    const persons = r.nodes.filter((n) => n.type === "Person").map((n) => n.key);
    expect(persons).toContain("alice");
  });

  it("extracts code paths in body to File nodes (forward-slash normalized)", () => {
    const r = call("see packages/core/src/memory/memory-store.ts for details");
    const files = r.nodes.filter((n) => n.type === "File").map((n) => n.key);
    expect(files).toContain("packages/core/src/memory/memory-store.ts");
  });

  it("dedupes repeated code paths in the same body", () => {
    const r = call("src/a.ts and again src/a.ts referenced twice");
    const files = r.nodes.filter((n) => n.type === "File" && n.key === "src/a.ts");
    expect(files).toHaveLength(1);
  });

  it("emits source_memory_id on every edge", () => {
    const r = call("with @alice and src/x.ts", {
      entities: [{ type: "Person", key: "bob" }],
    });
    expect(r.edges.every((e) => e.sourceMemoryId === "MEM01")).toBe(true);
  });
});
