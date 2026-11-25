import { describe, it, expect } from "vitest";
import {
  formatToolHeader,
  formatResultPreview,
  headerText,
  extractResultText,
} from "../src/tui/tool-format.js";

function result(text: string) {
  return { content: [{ type: "text", text }], details: {} };
}

describe("formatToolHeader", () => {
  it("humanizes known tool names", () => {
    expect(formatToolHeader("bash", { command: "git status" })).toEqual({
      label: "Bash",
      detail: "git status",
    });
    expect(formatToolHeader("entity_facts", {}).label).toBe("EntityFacts");
    expect(formatToolHeader("sandboxed_bash", { command: "ls" }).label).toBe("Bash");
    expect(formatToolHeader("web_fetch", {}).label).toBe("Fetch");
  });

  it("PascalCases unknown snake_case tool names", () => {
    expect(formatToolHeader("ado_query_wiql", {}).label).toBe("AdoQueryWiql");
  });

  it("headerText wraps detail in parens, omits them when empty", () => {
    expect(headerText({ label: "Bash", detail: "git log" })).toBe("Bash(git log)");
    expect(headerText({ label: "Recall", detail: "" })).toBe("Recall");
  });
});

describe("extractResultText", () => {
  it("joins text blocks from an AgentToolResult", () => {
    expect(extractResultText(result("hello\nworld"))).toBe("hello\nworld");
  });
  it("passes through bare strings and tolerates junk", () => {
    expect(extractResultText("plain")).toBe("plain");
    expect(extractResultText(null)).toBe("");
    expect(extractResultText(42)).toBe("");
    expect(extractResultText({ content: "not-an-array" })).toBe("");
  });
});

describe("formatResultPreview", () => {
  it("shows first lines and a +N tail for generic tools", () => {
    const text = ["l1", "l2", "l3", "l4", "l5", "l6"].join("\n");
    const lines = formatResultPreview("bash", {}, result(text), false);
    expect(lines).toEqual(["l1", "l2", "l3", "l4", "… +2 lines"]);
  });

  it("singular tail for exactly one extra line", () => {
    const text = ["l1", "l2", "l3", "l4", "l5"].join("\n");
    const lines = formatResultPreview("bash", {}, result(text), false);
    expect(lines[4]).toBe("… +1 line");
  });

  it("collapses read to a line-count summary", () => {
    const lines = formatResultPreview("read", {}, result("a\nb\nc"), false);
    expect(lines).toEqual(["Read 3 lines"]);
  });

  it("collapses glob/grep to counts and handles no-match text", () => {
    expect(formatResultPreview("glob", {}, result("a.ts\nb.ts"), false)).toEqual(["2 files"]);
    expect(formatResultPreview("grep", {}, result("x.ts:1:foo"), false)).toEqual([
      "1 matching line",
    ]);
    expect(formatResultPreview("glob", {}, result("No matches for *.xyz"), false)).toEqual([
      "no files matched",
    ]);
    expect(formatResultPreview("grep", {}, result("No matches found"), false)).toEqual([
      "no matches",
    ]);
  });

  it("renders a mini diff for edit", () => {
    const lines = formatResultPreview(
      "edit",
      { file_path: "a.ts", old_string: "const x = 1;", new_string: "const x = 2;" },
      result("ok"),
      false,
    );
    expect(lines).toEqual(["- const x = 1;", "+ const x = 2;"]);
  });

  it("truncates long diff sides with removed/added tails", () => {
    const oldStr = ["o1", "o2", "o3", "o4", "o5"].join("\n");
    const newStr = ["n1"].join("\n");
    const lines = formatResultPreview(
      "edit",
      { old_string: oldStr, new_string: newStr },
      result("ok"),
      false,
    );
    expect(lines).toContain("… +2 removed");
    expect(lines).toContain("+ n1");
  });

  it("renders write content as additions", () => {
    const lines = formatResultPreview(
      "write",
      { file_path: "a.ts", content: "line1\nline2\nline3\nline4" },
      result("ok"),
      false,
    );
    expect(lines).toEqual(["+ line1", "+ line2", "+ line3", "… +1 lines"]);
  });

  it("shows error text on failure regardless of tool", () => {
    const lines = formatResultPreview("read", {}, result("ENOENT: no such file"), true);
    expect(lines).toEqual(["ENOENT: no such file"]);
  });

  it("falls back to 'failed' when the error has no text", () => {
    expect(formatResultPreview("bash", {}, result(""), true)).toEqual(["failed"]);
  });

  it("returns [] when there is nothing to show", () => {
    expect(formatResultPreview("bash", {}, result(""), false)).toEqual([]);
    expect(formatResultPreview("read", {}, result(""), false)).toEqual([]);
  });

  it("truncates very long lines", () => {
    const long = "x".repeat(300);
    const lines = formatResultPreview("bash", {}, result(long), false);
    expect(lines[0]!.length).toBeLessThanOrEqual(120);
    expect(lines[0]!.endsWith("…")).toBe(true);
  });
});
