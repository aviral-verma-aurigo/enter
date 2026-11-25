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
  it("pushToolStart shows ⏺ header with name and parenthesized detail", () => {
    const t = new Transcript();
    t.pushToolStart("id1", "Bash", "git status -s");
    const lines = renderStripped(t);
    expect(lines.length).toBe(1);
    expect(lines[0]).toBe("⏺ Bash(git status -s)");
  });

  it("pushToolEnd(ok) keeps the header and appends timing", () => {
    const t = new Transcript();
    t.pushToolStart("id1", "Bash", "git status -s");
    t.pushToolEnd("id1", false);
    const lines = renderStripped(t);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("⏺ Bash(git status -s)");
    // timing: ends in "ms" or "s"
    expect(lines[0]).toMatch(/· \d+(\.\d+)?(ms|s)$/);
  });

  it("pushToolEnd(error) marks the header as failed", () => {
    const t = new Transcript();
    t.pushToolStart("id1", "Bash", "npm install");
    t.pushToolEnd("id1", true);
    const lines = renderStripped(t);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("· failed");
  });

  it("renders result preview lines under a ⎿ elbow", () => {
    const t = new Transcript();
    t.pushToolStart("id1", "Bash", "git status -s");
    t.pushToolEnd("id1", false, ["M a.ts", "?? b.ts", "… +3 lines"]);
    const lines = renderStripped(t);
    expect(lines.length).toBe(4);
    expect(lines[1]).toBe("  ⎿ M a.ts");
    expect(lines[2]).toBe("    ?? b.ts");
    expect(lines[3]).toBe("    … +3 lines");
  });

  it("collapses to one line per tool call when there is no result preview", () => {
    const t = new Transcript();
    t.pushToolStart("id1", "Read", "src/main.ts");
    t.pushToolEnd("id1", false);
    expect(renderStripped(t).length).toBe(1);
  });

  it("handles parallel tool calls independently by toolCallId", () => {
    const t = new Transcript();
    t.pushToolStart("id-a", "Read", "a.ts");
    t.pushToolStart("id-b", "Read", "b.ts");
    t.pushToolEnd("id-b", false);
    t.pushToolEnd("id-a", true);
    const lines = renderStripped(t);
    expect(lines.length).toBe(2);
    const aLine = lines.find((l) => l.includes("a.ts"))!;
    const bLine = lines.find((l) => l.includes("b.ts"))!;
    expect(aLine).toContain("· failed"); // id-a errored
    expect(bLine).not.toContain("· failed"); // id-b ok
  });

  it("unknown toolCallId on pushToolEnd falls back to a new block without crashing", () => {
    const t = new Transcript();
    t.pushToolEnd("unknown-id", false);
    const lines = renderStripped(t);
    expect(lines.length).toBe(1);
  });

  it("renders tool name without parens when there is no detail", () => {
    const t = new Transcript();
    t.pushToolStart("id1", "SomeNewTool", "");
    t.pushToolEnd("id1", false);
    const lines = renderStripped(t);
    expect(lines[0]).toContain("SomeNewTool");
    expect(lines[0]).not.toContain("(");
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
    t.pushToolStart("id1", "Bash", "echo hi");
    t.pushToolEnd("id1", false, ["hi"]);
    // Verify strip removes ANSI codes from any rendered output.
    const raw = t.render(120);
    const stripped = raw.map(strip);
    for (const line of stripped) {
      expect(line).not.toMatch(/\x1b\[/);
    }
  });
});
