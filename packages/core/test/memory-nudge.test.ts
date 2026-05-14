import { describe, expect, it } from "vitest";
import { createMemoryNudgeHook, estimateTokens } from "../src/memory/memory-nudge.js";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

function user(content: string): AgentMessage {
  return { role: "user", content, timestamp: Date.now() } as AgentMessage;
}

describe("memory-nudge transformContext hook", () => {
  it("injects a nudge on the Nth call, not before", async () => {
    const hook = createMemoryNudgeHook({ nudgeEveryNTurns: 3 });
    const seed = [user("hello")];

    const r1 = await hook(seed);
    expect(r1).toHaveLength(1); // no nudge yet
    const r2 = await hook(seed);
    expect(r2).toHaveLength(1);
    const r3 = await hook(seed);
    expect(r3).toHaveLength(2);
    const last = r3[r3.length - 1] as { role: string; content: string };
    expect(last.role).toBe("user");
    expect(last.content).toContain("memory-nudge");
  });

  it("re-injects every N calls", async () => {
    const hook = createMemoryNudgeHook({ nudgeEveryNTurns: 2 });
    const seed = [user("hi")];
    await hook(seed); // 1 — no
    const a = await hook(seed); // 2 — nudge
    expect(a).toHaveLength(2);
    await hook(seed); // 3 — no
    const b = await hook(seed); // 4 — nudge
    expect(b).toHaveLength(2);
  });

  it("compacts when token estimate exceeds threshold", async () => {
    const hook = createMemoryNudgeHook({
      nudgeEveryNTurns: 999,
      compactionThresholdTokens: 50,
      compactionDropCount: 3,
    });
    // 8 user messages, each ~80 chars → ~160 tokens — above threshold.
    const long = Array.from({ length: 8 }, (_, i) =>
      user(`message ${i} ${"x".repeat(80)}`),
    );
    const out = await hook(long);
    // Expect 8 - 3 + 1 (summary placeholder) = 6 messages
    expect(out).toHaveLength(6);
    const first = out[0] as { role: string; content: string };
    expect(first.content).toContain("context-summary");
  });

  it("does not compact below threshold", async () => {
    const hook = createMemoryNudgeHook({ compactionThresholdTokens: 50_000 });
    const msgs = [user("hi"), user("there")];
    const out = await hook(msgs);
    expect(out).toHaveLength(2);
  });
});

describe("estimateTokens", () => {
  it("returns 0 for empty input", () => {
    expect(estimateTokens([])).toBe(0);
  });

  it("approximates chars/4 for string content", () => {
    expect(estimateTokens([user("a".repeat(40))])).toBe(10);
  });

  it("handles array-of-blocks content", () => {
    const m: AgentMessage = {
      role: "assistant",
      content: [{ type: "text", text: "x".repeat(80) }],
      timestamp: Date.now(),
    } as AgentMessage;
    expect(estimateTokens([m])).toBe(20);
  });
});
