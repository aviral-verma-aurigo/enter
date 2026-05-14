import fs from "node:fs/promises";
import path from "node:path";
import { complete, type Model } from "@earendil-works/pi-ai";
import { stringifyFrontmatter } from "../memory/memory-frontmatter.js";

export interface AuthorSkillInput {
  name: string;
  trigger: string;
  procedure: string;
  rationale?: string;
}

export interface AuthorSkillCritiqueOptions {
  /** Model to use for the one-shot critique. */
  model: Model<any>;
  apiKey: string;
  /** Skip the LLM critique entirely (writes immediately). */
  skipCritique?: boolean;
}

export interface AuthorSkillResult {
  written: boolean;
  filePath?: string;
  refusalReason?: string;
}

const CRITIQUE_SYSTEM =
  "You are reviewing a candidate SKILL.md the agent wants to author. Critique it for: " +
  "(1) is the trigger specific enough to avoid false-fires? " +
  "(2) is the procedure idempotent? " +
  "(3) does it duplicate an existing skill (you don't have that context — assume not)? " +
  "Output either a polished SKILL.md body (no frontmatter) on success, OR a single line starting with 'REFUSE:' " +
  "followed by a one-sentence reason if the skill should not be authored.";

function buildCandidate(input: AuthorSkillInput): string {
  const lines: string[] = [];
  lines.push(`# ${input.name}`, "");
  lines.push("## Trigger");
  lines.push(input.trigger, "");
  lines.push("## Procedure");
  lines.push(input.procedure, "");
  if (input.rationale) {
    lines.push("## Why");
    lines.push(input.rationale, "");
  }
  return lines.join("\n");
}

/**
 * Author a new skill at `<skillsDir>/<name>/SKILL.md`. Runs a one-shot LLM critique by default;
 * if the critique returns a line starting with `REFUSE:`, no file is written.
 */
export async function authorSkill(
  skillsDir: string,
  input: AuthorSkillInput,
  options: AuthorSkillCritiqueOptions,
): Promise<AuthorSkillResult> {
  const candidate = buildCandidate(input);
  let body = candidate;

  if (!options.skipCritique) {
    const result = await complete(
      options.model,
      {
        systemPrompt: CRITIQUE_SYSTEM,
        messages: [
          {
            role: "user",
            content: `Candidate skill body:\n\n${candidate}`,
            timestamp: Date.now(),
          },
        ],
      },
      { apiKey: options.apiKey },
    );
    const text = extractAssistantText(result);
    if (text.trim().startsWith("REFUSE:")) {
      return { written: false, refusalReason: text.trim() };
    }
    if (text.trim().length > 0) {
      body = text.trim();
    }
  }

  const dir = path.join(skillsDir, input.name);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, "SKILL.md");
  const fileContent = stringifyFrontmatter({
    frontmatter: { name: input.name, description: input.trigger },
    body,
  });
  await fs.writeFile(filePath, fileContent, "utf8");
  return { written: true, filePath };
}

function extractAssistantText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content as unknown[]) {
    if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
      parts.push(String((block as { text?: string }).text ?? ""));
    }
  }
  return parts.join("");
}
