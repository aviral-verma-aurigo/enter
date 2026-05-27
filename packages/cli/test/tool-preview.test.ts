import { describe, it, expect } from "vitest";
import { toolPreview } from "../src/tui/tool-preview.js";

describe("toolPreview", () => {
  it("returns the command for bash", () => {
    expect(toolPreview("bash", { command: "git status -s" })).toBe("git status -s");
  });

  it("returns the command for sandboxed_bash", () => {
    expect(toolPreview("sandboxed_bash", { command: "npm test" })).toBe("npm test");
  });

  it("truncates long bash commands to 60 chars", () => {
    const long = "a".repeat(70);
    const result = toolPreview("bash", { command: long });
    expect(result.length).toBe(60);
    expect(result.endsWith("…")).toBe(true);
  });

  it("returns file_path for read", () => {
    expect(toolPreview("read", { file_path: "src/main.ts" })).toBe("src/main.ts");
  });

  it("returns file_path for write", () => {
    expect(toolPreview("write", { file_path: "out/bundle.js", content: "..." })).toBe("out/bundle.js");
  });

  it("returns file_path for edit", () => {
    expect(toolPreview("edit", { file_path: "src/foo.ts", old_string: "x", new_string: "y" })).toBe("src/foo.ts");
  });

  it("returns pattern for glob", () => {
    expect(toolPreview("glob", { pattern: "**/*.ts" })).toBe("**/*.ts");
  });

  it("returns pattern for grep", () => {
    expect(toolPreview("grep", { pattern: "pushToolStart" })).toBe("pushToolStart");
  });

  it("returns query for recall", () => {
    expect(toolPreview("recall", { query: "per-user memory scope" })).toBe("per-user memory scope");
  });

  it("returns query for memorize", () => {
    expect(toolPreview("memorize", { query: "user prefers short replies" })).toBe("user prefers short replies");
  });

  it("returns empty string for unknown tool", () => {
    expect(toolPreview("unknown_tool", { foo: "bar" })).toBe("");
  });

  it("returns empty string when args is null", () => {
    expect(toolPreview("bash", null)).toBe("");
  });

  it("returns empty string when args is undefined", () => {
    expect(toolPreview("bash", undefined)).toBe("");
  });

  it("returns empty string when args is a number", () => {
    expect(toolPreview("bash", 42)).toBe("");
  });

  it("returns empty string when the key field is the wrong type", () => {
    expect(toolPreview("bash", { command: 123 })).toBe("");
    expect(toolPreview("read", { file_path: true })).toBe("");
  });

  it("collapses multiline commands to one line", () => {
    const result = toolPreview("bash", { command: "echo hello\necho world" });
    expect(result).toBe("echo hello echo world");
    expect(result).not.toContain("\n");
  });
});
