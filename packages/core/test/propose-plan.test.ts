import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { proposePlanTool } from "../src/tools/propose-plan.js";
import { DoneSignal } from "../src/autonomous/done-signal.js";
import type { ToolContext } from "../src/tools/context.js";
import { MemoryStore } from "../src/memory/memory-store.js";
import { GraphStore } from "../src/memory/graph-store.js";
import { resolvePaths, ensureDirs } from "../src/config/paths.js";

let tmpHome: string;
let ctx: ToolContext;
let signal: DoneSignal;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "enter-plan-"));
  const paths = resolvePaths({ homeOverride: tmpHome });
  ensureDirs(paths);
  const memory = MemoryStore.open(paths.memoryDbFile);
  const graph = GraphStore.attach(memory);
  ctx = {
    memory,
    graph,
    paths,
    cwd: tmpHome,
    projectHash: null,
    channelKey: null,
    userKey: null,
  };
  signal = new DoneSignal();
});

afterEach(() => {
  ctx.memory.close();
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe("propose_plan", () => {
  it("writes a markdown plan to ~/.enter/plans/ and fires DoneSignal", async () => {
    const tool = proposePlanTool(ctx, signal);
    const r = await tool.execute("t1", {
      goal: "Add a /healthz endpoint",
      steps: ["Add the route", "Wire it into the server", "Add a test"],
      critical_files: ["packages/teams-bot/src/server.ts"],
      verification: "curl localhost:3978/healthz",
    });
    expect(r.isError).toBeUndefined();
    expect(r.terminate).toBe(true);
    expect(signal.fired).toBe(true);
    expect(signal.payload?.summary).toContain("Plan proposed");

    const details = r.details as { path: string; steps: number };
    expect(details.steps).toBe(3);
    expect(fs.existsSync(details.path)).toBe(true);

    const body = fs.readFileSync(details.path, "utf8");
    expect(body).toContain("# Plan: Add a /healthz endpoint");
    expect(body).toContain("1. Add the route");
    expect(body).toContain("2. Wire it into the server");
    expect(body).toContain("3. Add a test");
    expect(body).toContain("## Critical files");
    expect(body).toContain("packages/teams-bot/src/server.ts");
    expect(body).toContain("## Verification");
    expect(body).toContain("curl localhost:3978/healthz");
  });

  it("works with the minimum (goal + at least one step)", async () => {
    const tool = proposePlanTool(ctx, signal);
    const r = await tool.execute("t1", {
      goal: "Fix typo",
      steps: ["Edit README"],
    });
    expect(r.isError).toBeUndefined();
    const body = fs.readFileSync((r.details as { path: string }).path, "utf8");
    expect(body).not.toContain("## Critical files");
    expect(body).not.toContain("## Verification");
  });

  it("slugifies the goal into the filename", async () => {
    const tool = proposePlanTool(ctx, signal);
    const r = await tool.execute("t1", {
      goal: "Refactor 'foo' & bar / baz!",
      steps: ["x"],
    });
    const filename = path.basename((r.details as { path: string }).path);
    expect(filename).toMatch(/refactor-foo-bar-baz/);
    expect(filename.endsWith(".md")).toBe(true);
  });
});
