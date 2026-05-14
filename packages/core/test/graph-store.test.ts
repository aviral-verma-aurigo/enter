import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/memory/memory-store.js";
import { GraphStore } from "../src/memory/graph-store.js";

function open(): { memory: MemoryStore; graph: GraphStore } {
  const memory = MemoryStore.open(":memory:");
  const graph = GraphStore.attach(memory);
  return { memory, graph };
}

describe("GraphStore", () => {
  it("upserts a node and finds it by (type, key)", () => {
    const { memory, graph } = open();
    const n = graph.upsertNode({ type: "Person", key: "alice", label: "Alice" });
    expect(n.id).toMatch(/^[A-Z0-9]{26}$/);
    expect(n.type).toBe("Person");
    const found = graph.findNode("Person", "alice");
    expect(found?.id).toBe(n.id);
    expect(found?.label).toBe("Alice");
    memory.close();
  });

  it("upsertNode is idempotent and merges attrs", () => {
    const { memory, graph } = open();
    const a = graph.upsertNode({ type: "File", key: "src/a.ts", attrs: { lines: 100 } });
    const b = graph.upsertNode({ type: "File", key: "src/a.ts", attrs: { owner: "alice" } });
    expect(a.id).toBe(b.id);
    expect(b.attrs).toMatchObject({ lines: 100, owner: "alice" });
    memory.close();
  });

  it("upsertEdge creates both endpoints automatically", () => {
    const { memory, graph } = open();
    graph.upsertEdge({
      src: { type: "Person", key: "alice" },
      dst: { type: "Project", key: "checkout" },
      type: "WORKS_ON",
    });
    expect(graph.findNode("Person", "alice")).not.toBeNull();
    expect(graph.findNode("Project", "checkout")).not.toBeNull();
    memory.close();
  });

  it("upsertEdge dedups on (src, dst, type, source_memory_id)", () => {
    const { memory, graph } = open();
    const a = graph.upsertEdge({
      src: { type: "Person", key: "alice" },
      dst: { type: "Project", key: "x" },
      type: "WORKS_ON",
      sourceMemoryId: "mem1",
    });
    const b = graph.upsertEdge({
      src: { type: "Person", key: "alice" },
      dst: { type: "Project", key: "x" },
      type: "WORKS_ON",
      sourceMemoryId: "mem1",
      confidence: 0.5,
    });
    expect(a.id).toBe(b.id);
    expect(b.confidence).toBe(0.5);
    memory.close();
  });

  it("neighbors returns 1-hop nodes by default", () => {
    const { memory, graph } = open();
    graph.upsertEdge({
      src: { type: "Person", key: "alice" },
      dst: { type: "Project", key: "checkout" },
      type: "WORKS_ON",
    });
    const r = graph.neighbors({ type: "Person", key: "alice" });
    expect(r.nodes.map((n) => n.key)).toContain("checkout");
    expect(r.edges).toHaveLength(1);
    memory.close();
  });

  it("neighbors traverses k_hops", () => {
    const { memory, graph } = open();
    // alice → checkout → cart-module
    graph.upsertEdge({
      src: { type: "Person", key: "alice" },
      dst: { type: "Project", key: "checkout" },
      type: "WORKS_ON",
    });
    graph.upsertEdge({
      src: { type: "Project", key: "checkout" },
      dst: { type: "Module", key: "cart-module" },
      type: "PART_OF",
    });
    const hop1 = graph.neighbors({ type: "Person", key: "alice" }, { kHops: 1 });
    expect(hop1.nodes.map((n) => n.key)).not.toContain("cart-module");
    const hop2 = graph.neighbors({ type: "Person", key: "alice" }, { kHops: 2 });
    expect(hop2.nodes.map((n) => n.key)).toContain("cart-module");
    memory.close();
  });

  it("neighbors filters by edgeType", () => {
    const { memory, graph } = open();
    graph.upsertEdge({
      src: { type: "Person", key: "alice" },
      dst: { type: "Project", key: "x" },
      type: "WORKS_ON",
    });
    graph.upsertEdge({
      src: { type: "Person", key: "alice" },
      dst: { type: "Project", key: "y" },
      type: "MENTIONS",
    });
    const worksOn = graph.neighbors({ type: "Person", key: "alice" }, { edgeType: "WORKS_ON" });
    expect(worksOn.nodes.map((n) => n.key)).toEqual(["x"]);
    memory.close();
  });

  it("shortestPath finds connections", () => {
    const { memory, graph } = open();
    graph.upsertEdge({ src: { type: "Person", key: "a" }, dst: { type: "Project", key: "p" }, type: "WORKS_ON" });
    graph.upsertEdge({ src: { type: "Project", key: "p" }, dst: { type: "Module", key: "m" }, type: "PART_OF" });
    const path = graph.shortestPath({ type: "Person", key: "a" }, { type: "Module", key: "m" });
    expect(path).not.toBeNull();
    expect(path!.length).toBe(2);
    memory.close();
  });

  it("shortestPath returns null when unreachable", () => {
    const { memory, graph } = open();
    graph.upsertNode({ type: "Person", key: "a" });
    graph.upsertNode({ type: "Person", key: "b" });
    const path = graph.shortestPath({ type: "Person", key: "a" }, { type: "Person", key: "b" });
    expect(path).toBeNull();
    memory.close();
  });

  it("entityFacts returns adjacent edges + linked memory ids", () => {
    const { memory, graph } = open();
    graph.upsertEdge({
      src: { type: "Memory", key: "mem-1" },
      dst: { type: "Person", key: "alice" },
      type: "MENTIONS",
      sourceMemoryId: "mem-1",
    });
    graph.upsertEdge({
      src: { type: "Memory", key: "mem-2" },
      dst: { type: "Person", key: "alice" },
      type: "MENTIONS",
      sourceMemoryId: "mem-2",
    });
    const facts = graph.entityFacts({ type: "Person", key: "alice" });
    expect(facts).not.toBeNull();
    expect(facts!.edges).toHaveLength(2);
    expect(facts!.linkedMemoryIds.sort()).toEqual(["mem-1", "mem-2"]);
    memory.close();
  });
});
