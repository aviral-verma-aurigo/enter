import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../src/memory/memory-store.js";
import { GraphStore } from "../src/memory/graph-store.js";
import { resolvePaths, ensureDirs, type EnterPaths } from "../src/config/paths.js";
import { rememberTool } from "../src/tools/remember.js";
import { recallTool } from "../src/tools/recall.js";
import { linkTool } from "../src/tools/link.js";
import { neighborsTool } from "../src/tools/neighbors.js";
import { entityFactsTool } from "../src/tools/entity-facts.js";
import type { ToolContext } from "../src/tools/context.js";

let tmpHome: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "enter-e2e-"));
});
afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

function bootstrap(): {
  ctx: ToolContext;
  paths: EnterPaths;
  memory: MemoryStore;
  graph: GraphStore;
} {
  const paths = resolvePaths({ homeOverride: tmpHome });
  ensureDirs(paths);
  const memory = MemoryStore.open(paths.memoryDbFile);
  const graph = GraphStore.attach(memory);
  const ctx: ToolContext = {
    memory,
    graph,
    paths,
    cwd: tmpHome,
    projectHash: null,
    channelKey: null,
    userKey: null,
  };
  return { ctx, paths, memory, graph };
}

describe("end-to-end — memory + graph tools wired together", () => {
  it("remember writes a file, indexes in SQLite, populates MEMORY.md, and extracts entities into the graph", async () => {
    const { ctx, paths, memory, graph } = bootstrap();
    const remember = rememberTool(ctx);

    const result = await remember.execute("call-1", {
      type: "project",
      name: "checkout-rewrite",
      summary: "rewriting the checkout module",
      body:
        "we discussed this with @alice and @bob. " +
        "the relevant code is in packages/core/src/memory/memory-store.ts and src/checkout/cart.ts.",
    });
    expect(result.isError).toBeUndefined();

    // 1. Physical file written
    const details = result.details as { id: string; path: string };
    expect(fs.existsSync(details.path)).toBe(true);
    const fileContent = fs.readFileSync(details.path, "utf8");
    expect(fileContent).toMatch(/^---/); // has frontmatter
    expect(fileContent).toContain("type: project");

    // 2. SQLite row exists
    const row = memory.getById(details.id);
    expect(row).not.toBeNull();
    expect(row!.summary).toBe("rewriting the checkout module");

    // 3. MEMORY.md index updated
    expect(fs.existsSync(paths.memoryIndexFile)).toBe(true);
    expect(fs.readFileSync(paths.memoryIndexFile, "utf8")).toContain("[checkout-rewrite]");

    // 4. Entity graph populated — 1 Memory + 2 People + 2 Files = 5 nodes,
    //    each Person/File linked back to the Memory via MENTIONS.
    const aliceFacts = graph.entityFacts({ type: "Person", key: "alice" });
    expect(aliceFacts).not.toBeNull();
    expect(aliceFacts!.edges.length).toBeGreaterThan(0);
    expect(aliceFacts!.edges[0]!.type).toBe("MENTIONS");

    const fileFacts = graph.entityFacts({
      type: "File",
      key: "packages/core/src/memory/memory-store.ts",
    });
    expect(fileFacts).not.toBeNull();

    memory.close();
  });

  it("recall finds what remember wrote (cross-tool round-trip)", async () => {
    const { ctx, memory } = bootstrap();
    const remember = rememberTool(ctx);
    const recall = recallTool(ctx);

    await remember.execute("call-1", {
      type: "user",
      name: "no-emojis",
      summary: "user hates emojis in code comments",
      body: "always omit emojis in comments and PR descriptions",
    });

    const hit = await recall.execute("call-2", { query: "emojis" });
    expect(hit.isError).toBeUndefined();
    const details = hit.details as { hits: Array<{ name: string }> };
    expect(details.hits).toHaveLength(1);
    expect(details.hits[0]!.name).toBe("no-emojis");
    expect(hit.content[0]?.text).toContain("emojis");
    memory.close();
  });

  it("link tool creates an edge that neighbors can find", async () => {
    const { ctx, memory } = bootstrap();
    const link = linkTool(ctx);
    const neighbors = neighborsTool(ctx);

    await link.execute("call-1", {
      src: { type: "Person", key: "alice" },
      type: "WORKS_ON",
      dst: { type: "Project", key: "checkout" },
    });

    const r = await neighbors.execute("call-2", {
      entity: { type: "Person", key: "alice" },
    });
    expect(r.isError).toBeUndefined();
    expect(r.content[0]?.text).toContain("checkout");
    memory.close();
  });

  it("entity_facts surfaces edges + linked memory ids end-to-end from a remember call", async () => {
    const { ctx, memory } = bootstrap();
    const remember = rememberTool(ctx);
    const entityFacts = entityFactsTool(ctx);

    await remember.execute("call-1", {
      type: "project",
      name: "ms-1",
      summary: "first",
      body: "@alice and @bob worked on this together",
    });
    await remember.execute("call-2", {
      type: "project",
      name: "ms-2",
      summary: "second",
      body: "@alice owned this one",
    });

    const r = await entityFacts.execute("call-3", { entity: { type: "Person", key: "alice" } });
    const details = r.details as { found: boolean; linkedMemoryIds: string[] };
    expect(details.found).toBe(true);
    // Alice was mentioned in two memories → at least two linked memory ids.
    expect(details.linkedMemoryIds.length).toBeGreaterThanOrEqual(2);
    memory.close();
  });
});
