import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "../memory/memory-frontmatter.js";

export interface Skill {
  name: string;
  description: string;
  content: string;
  filePath: string;
  disableModelInvocation?: boolean;
}

export interface LoadSkillsResult {
  skills: Skill[];
  diagnostics: { filePath: string; message: string }[];
}

const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Walk each directory looking for `SKILL.md` files (max depth 4) and return parsed skills.
 * Conventions follow the agentskills.io spec: a directory containing `SKILL.md` is a skill;
 * the skill's `name` and `description` are read from YAML frontmatter.
 */
export function loadSkills(dirs: string[]): LoadSkillsResult {
  const skills: Skill[] = [];
  const diagnostics: LoadSkillsResult["diagnostics"] = [];
  const seen = new Set<string>();

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    walk(dir, 0, 4, (filePath) => {
      if (path.basename(filePath) !== "SKILL.md") return;
      try {
        const text = fs.readFileSync(filePath, "utf8");
        const { frontmatter, body } = parseFrontmatter<{
          name?: string;
          description?: string;
          "disable-model-invocation"?: boolean;
        }>(text);
        const name = String(frontmatter.name ?? "");
        const description = String(frontmatter.description ?? "");
        if (!SKILL_NAME_RE.test(name)) {
          diagnostics.push({ filePath, message: `Invalid or missing 'name' in frontmatter.` });
          return;
        }
        if (description.trim().length === 0) {
          diagnostics.push({ filePath, message: `Missing 'description' in frontmatter.` });
          return;
        }
        if (seen.has(name)) {
          diagnostics.push({ filePath, message: `Duplicate skill name '${name}' (first definition wins).` });
          return;
        }
        seen.add(name);
        skills.push({
          name,
          description,
          content: body,
          filePath,
          disableModelInvocation: frontmatter["disable-model-invocation"] === true,
        });
      } catch (err) {
        diagnostics.push({ filePath, message: `Parse error: ${(err as Error).message}` });
      }
    });
  }

  return { skills, diagnostics };
}

function walk(root: string, depth: number, maxDepth: number, visit: (filePath: string) => void) {
  if (depth > maxDepth) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walk(full, depth + 1, maxDepth, visit);
    } else if (entry.isFile()) {
      visit(full);
    }
  }
}

/**
 * Compose a system-prompt fragment that exposes the loaded skills to the model.
 * Skills with `disableModelInvocation` are still listed but flagged unavailable.
 */
export function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) return "";
  const lines = ["<skills>", "Skills available — invoke by referencing their name in your reasoning."];
  for (const s of skills) {
    const flag = s.disableModelInvocation ? " (disabled)" : "";
    lines.push(`- **${s.name}**${flag}: ${s.description}`);
  }
  lines.push("Full skill bodies follow each name's first invocation.</skills>");
  return lines.join("\n");
}
