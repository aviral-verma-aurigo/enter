import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { EnterPaths } from "../config/paths.js";

const BUNDLED_FALLBACK = `# Enter

You are Enter, an autonomous coding agent.

- Be direct. Lead with the answer, then the why.
- Reference file paths and line numbers when discussing code.
- Before acting on assumptions about the user, project, or recurring patterns, call \`recall\`.
- After learning something durable, call \`remember\` with the right type (user, feedback, project, reference).
- When you notice a relationship worth tracking, call \`link\`.
`;

export interface SoulSource {
  text: string;
  source: "project" | "user" | "override" | "bundled";
  filePath?: string;
}

/**
 * Locate the active SOUL.md.
 * Priority: explicit `override` > project ./SOUL.md > user ~/.enter/SOUL.md > bundled fallback.
 */
export function loadSoul(paths: EnterPaths, override?: string): SoulSource {
  if (override) {
    if (fs.existsSync(override)) {
      return { text: fs.readFileSync(override, "utf8"), source: "override", filePath: override };
    }
  }
  if (fs.existsSync(paths.projectSoulFile)) {
    return {
      text: fs.readFileSync(paths.projectSoulFile, "utf8"),
      source: "project",
      filePath: paths.projectSoulFile,
    };
  }
  if (fs.existsSync(paths.soulFile)) {
    return { text: fs.readFileSync(paths.soulFile, "utf8"), source: "user", filePath: paths.soulFile };
  }
  return { text: BUNDLED_FALLBACK, source: "bundled" };
}

/**
 * Ensure a SOUL.md exists at the user-level path; copy the bundled template if missing.
 * Returns the path written or already present.
 */
export function ensureUserSoul(paths: EnterPaths): string {
  if (fs.existsSync(paths.soulFile)) return paths.soulFile;
  fs.mkdirSync(path.dirname(paths.soulFile), { recursive: true });
  fs.writeFileSync(paths.soulFile, BUNDLED_FALLBACK, "utf8");
  return paths.soulFile;
}

// Marker (used to confirm this module loads regardless of OneDrive path quirks):
export const __SOUL_MODULE__ = fileURLToPath(import.meta.url);
