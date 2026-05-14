import { describe, expect, it } from "vitest";
import { parseFrontmatter, stringifyFrontmatter } from "../src/memory/memory-frontmatter.js";

describe("frontmatter", () => {
  it("parses standard YAML frontmatter", () => {
    const src = `---\nname: foo\ntype: user\n---\nBody here.`;
    const { frontmatter, body } = parseFrontmatter(src);
    expect(frontmatter).toMatchObject({ name: "foo", type: "user" });
    expect(body).toBe("Body here.");
  });

  it("returns empty frontmatter when no leading delimiter", () => {
    const src = `Just a body, no frontmatter.`;
    const { frontmatter, body } = parseFrontmatter(src);
    expect(frontmatter).toEqual({});
    expect(body).toBe(src);
  });

  it("returns empty frontmatter when closing delimiter is missing", () => {
    const src = `---\nname: foo\nbody continues...`;
    const { frontmatter, body } = parseFrontmatter(src);
    expect(frontmatter).toEqual({});
    expect(body).toBe(src);
  });

  it("handles empty frontmatter block (no keys between delimiters)", () => {
    const src = `---\n---\nBody.`;
    const { frontmatter, body } = parseFrontmatter(src);
    expect(frontmatter).toEqual({});
    expect(body).toBe("Body.");
  });

  it("round-trips: stringify(parse(x)) preserves the structured fields and body", () => {
    const original = `---\nname: terse-comments\ntype: feedback\ntags:\n  - style\n  - code\n---\nUser dislikes emojis.`;
    const parsed = parseFrontmatter(original);
    const reserialized = stringifyFrontmatter(parsed);
    const reparsed = parseFrontmatter(reserialized);
    expect(reparsed.frontmatter).toEqual(parsed.frontmatter);
    expect(reparsed.body.trim()).toBe(parsed.body.trim());
  });

  it("stringifies arrays as YAML lists", () => {
    const out = stringifyFrontmatter({
      frontmatter: { name: "x", tags: ["a", "b"] },
      body: "body",
    });
    expect(out).toContain("name: x");
    expect(out).toContain("tags:");
    expect(out).toContain("- a");
    expect(out).toContain("- b");
  });
});
