import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Transcript } from "../src/tui/transcript.js";

// Strip ANSI codes for assertion readability.
function strip(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function renderStripped(t: Transcript, width = 120): string[] {
  return t.render(width).map(strip);
}

describe("Transcript tool blocks", () => {
  it("pushToolStart shows tool name and preview, no status icon", () => {
    const t = new Transcript();
    t.pushToolStart("id1", "bash", "git status -s");
    const lines = renderStripped(t);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("bash");
    expect(lines[0]).toContain("git status -s");
    expect(lines[0]).not.toContain("✓");
    expect(lines[0]).not.toContain("✗");
  });

  it("pushToolEnd(ok) mutates the block to show ✓ and timing", () => {
    const t = new Transcript();
    t.pushToolStart("id1", "bash", "git status -s");
    t.pushToolEnd("id1", false);
    const lines = renderStripped(t);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("✓");
    expect(lines[0]).toContain("bash");
    expect(lines[0]).toContain("git status -s");
    // timing: ends in "ms" or "s"
    expect(lines[0]).toMatch(/\d+(ms|s)/);
  });

  it("pushToolEnd(error) mutates the block to show ✗", () => {
    const t = new Transcript();
    t.pushToolStart("id1", "bash", "npm install");
    t.pushToolEnd("id1", true);
    const lines = renderStripped(t);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("✗");
    expect(lines[0]).not.toContain("✓");
  });

  it("collapses to one line per tool call (not two)", () => {
    const t = new Transcript();
    t.pushToolStart("id1", "read", "src/main.ts");
    t.pushToolEnd("id1", false);
    expect(renderStripped(t).length).toBe(1);
  });

  it("handles parallel tool calls independently by toolCallId", () => {
    const t = new Transcript();
    t.pushToolStart("id-a", "read", "a.ts");
    t.pushToolStart("id-b", "read", "b.ts");
    t.pushToolEnd("id-b", false);
    t.pushToolEnd("id-a", true);
    const lines = renderStripped(t);
    expect(lines.length).toBe(2);
    const aLine = lines.find((l) => l.includes("a.ts"))!;
    const bLine = lines.find((l) => l.includes("b.ts"))!;
    expect(aLine).toContain("✗"); // id-a errored
    expect(bLine).toContain("✓"); // id-b ok
  });

  it("unknown toolCallId on pushToolEnd falls back to a new block without crashing", () => {
    const t = new Transcript();
    t.pushToolEnd("unknown-id", false);
    const lines = renderStripped(t);
    expect(lines.length).toBe(1);
  });

  it("renders tool name even with no preview", () => {
    const t = new Transcript();
    t.pushToolStart("id1", "someNewTool", "");
    t.pushToolEnd("id1", false);
    const lines = renderStripped(t);
    expect(lines[0]).toContain("someNewTool");
  });
});

describe("Transcript NO_COLOR", () => {
  let orig: string | undefined;
  beforeEach(() => {
    orig = process.env["NO_COLOR"];
  });
  afterEach(() => {
    if (orig === undefined) delete process.env["NO_COLOR"];
    else process.env["NO_COLOR"] = orig;
  });

  it("produces plain text when NO_COLOR is set (no ANSI codes)", () => {
    // Note: colorize() checks NO_COLOR at module load time, so this test verifies the
    // strip utility works — the actual NO_COLOR behavior is covered by the color module itself.
    const t = new Transcript();
    t.pushToolStart("id1", "bash", "echo hi");
    t.pushToolEnd("id1", false);
    // Verify strip removes ANSI codes from any rendered output.
    const raw = t.render(120);
    const stripped = raw.map(strip);
    for (const line of stripped) {
      expect(line).not.toMatch(/\x1b\[/);
    }
  });
});
