import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSkills, formatSkillsForPrompt } from "../src/skills/load.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "enter-skills-"));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeSkill(relDir: string, frontmatter: string, body = "skill body"): string {
  const dir = path.join(tmpDir, relDir);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, "SKILL.md");
  fs.writeFileSync(filePath, `---\n${frontmatter}\n---\n${body}\n`, "utf8");
  return filePath;
}

describe("loadSkills", () => {
  it("walks SKILL.md files and parses frontmatter", () => {
    writeSkill("a", "name: a-skill\ndescription: First skill");
    writeSkill("b", "name: b-skill\ndescription: Second skill");
    const { skills, diagnostics } = loadSkills([tmpDir]);
    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.name).sort()).toEqual(["a-skill", "b-skill"]);
    expect(diagnostics).toHaveLength(0);
  });

  it("respects disable-model-invocation", () => {
    writeSkill(
      "a",
      "name: opt-out\ndescription: disabled\ndisable-model-invocation: true",
    );
    const { skills } = loadSkills([tmpDir]);
    expect(skills[0]!.disableModelInvocation).toBe(true);
  });

  it("reports diagnostics for skills with invalid names", () => {
    writeSkill("bad", "name: BadName\ndescription: invalid uppercase");
    const { skills, diagnostics } = loadSkills([tmpDir]);
    expect(skills).toHaveLength(0);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toMatch(/Invalid or missing 'name'/);
  });

  it("reports diagnostics for missing description", () => {
    writeSkill("nodesc", "name: no-desc");
    const { skills, diagnostics } = loadSkills([tmpDir]);
    expect(skills).toHaveLength(0);
    expect(diagnostics[0]!.message).toMatch(/Missing 'description'/);
  });

  it("dedupes by name (first definition wins) and reports a diagnostic", () => {
    writeSkill("a/v1", "name: shared\ndescription: First");
    writeSkill("b/v2", "name: shared\ndescription: Second");
    const { skills, diagnostics } = loadSkills([tmpDir]);
    expect(skills).toHaveLength(1);
    expect(diagnostics.some((d) => /Duplicate/.test(d.message))).toBe(true);
  });

  it("returns empty when no SKILL.md files exist", () => {
    const { skills, diagnostics } = loadSkills([tmpDir]);
    expect(skills).toHaveLength(0);
    expect(diagnostics).toHaveLength(0);
  });

  it("silently skips non-existent dirs", () => {
    const { skills, diagnostics } = loadSkills([path.join(tmpDir, "does-not-exist")]);
    expect(skills).toHaveLength(0);
    expect(diagnostics).toHaveLength(0);
  });

  it("recurses up to depth 4", () => {
    writeSkill("a/b/c/d", "name: deep\ndescription: nested deep");
    const { skills } = loadSkills([tmpDir]);
    expect(skills.map((s) => s.name)).toContain("deep");
  });
});

describe("formatSkillsForPrompt", () => {
  it("returns empty string for empty input", () => {
    expect(formatSkillsForPrompt([])).toBe("");
  });

  it("renders a block with skill names + descriptions", () => {
    const block = formatSkillsForPrompt([
      { name: "a", description: "first", content: "", filePath: "/a/SKILL.md" },
      { name: "b", description: "second", content: "", filePath: "/b/SKILL.md" },
    ]);
    expect(block).toContain("<skills>");
    expect(block).toContain("**a**: first");
    expect(block).toContain("**b**: second");
    expect(block).toContain("</skills>");
  });

  it("flags disabled skills", () => {
    const block = formatSkillsForPrompt([
      {
        name: "x",
        description: "disabled one",
        content: "",
        filePath: "/x/SKILL.md",
        disableModelInvocation: true,
      },
    ]);
    expect(block).toContain("(disabled)");
  });
});
