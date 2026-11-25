import { toolPreview } from "./tool-preview.js";

/**
 * Premium tool-call formatting shared by the TUI transcript and the simple/print modes.
 *
 * A tool call renders as a header — `Bash(git status -s)` — followed by an
 * indented result preview under a `⎿` elbow. Formatting here returns plain
 * (uncolored) strings; callers apply ANSI styling.
 */

export interface ToolHeader {
  /** Humanized tool label, e.g. "Bash", "Read", "EntityFacts". */
  label: string;
  /** One-line argument summary, "" when the tool has none. */
  detail: string;
}

const LABELS: Record<string, string> = {
  bash: "Bash",
  sandboxed_bash: "Bash",
  read: "Read",
  write: "Write",
  edit: "Edit",
  glob: "Glob",
  grep: "Grep",
  recall: "Recall",
  remember: "Remember",
  memorize: "Remember",
  link: "Link",
  neighbors: "Neighbors",
  path: "Path",
  entity_facts: "EntityFacts",
  web_fetch: "Fetch",
  delegate_to_claude_code: "Delegate",
  spawn_subagent: "Subagent",
  author_skill: "AuthorSkill",
  propose_plan: "ProposePlan",
};

/** `bash` → "Bash", `entity_facts` → "EntityFacts", unknown names PascalCased. */
export function formatToolHeader(toolName: string, args: unknown): ToolHeader {
  const label =
    LABELS[toolName] ??
    toolName
      .split("_")
      .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
      .join("");
  return { label, detail: toolPreview(toolName, args) };
}

/** Render a header as a single plain string: `Bash(git status -s)` or bare `Recall`. */
export function headerText(h: ToolHeader): string {
  return h.detail ? `${h.label}(${h.detail})` : h.label;
}

const MAX_PREVIEW_LINES = 4;
const MAX_LINE_CHARS = 120;
const MAX_DIFF_SIDE = 3;

/**
 * Build the indented preview lines shown under a finished tool call.
 *
 * - `edit` renders a mini unified diff from `old_string`/`new_string` (`- `/`+ ` prefixes).
 * - `write` renders the first lines of the new content as `+ ` additions.
 * - `read` collapses to a one-line summary ("Read N lines").
 * - `glob` collapses to "N files"; `grep` to "N matching lines".
 * - Everything else shows the first few lines of result text with an
 *   "… +N lines" tail when truncated.
 * - Errors show the first lines of the error text (callers style them red).
 *
 * Returns [] when there is nothing useful to show.
 */
export function formatResultPreview(
  toolName: string,
  args: unknown,
  result: unknown,
  isError: boolean,
  maxLines = MAX_PREVIEW_LINES,
): string[] {
  const text = extractResultText(result);

  if (isError) {
    return clampLines(splitClean(text.length > 0 ? text : "failed"), maxLines);
  }

  const a = (args ?? {}) as Record<string, unknown>;

  switch (toolName) {
    case "edit": {
      const oldStr = typeof a["old_string"] === "string" ? (a["old_string"] as string) : "";
      const newStr = typeof a["new_string"] === "string" ? (a["new_string"] as string) : "";
      const diff = formatDiff(oldStr, newStr);
      if (diff.length > 0) return diff;
      break;
    }
    case "write": {
      const content = typeof a["content"] === "string" ? (a["content"] as string) : "";
      if (content.length > 0) {
        const lines = splitClean(content);
        const shown = lines.slice(0, MAX_DIFF_SIDE).map((l) => "+ " + truncate(l));
        const rest = lines.length - MAX_DIFF_SIDE;
        if (rest > 0) shown.push(`… +${rest} lines`);
        return shown;
      }
      break;
    }
    case "read": {
      const n = countLines(text);
      return n > 0 ? [`Read ${n} line${n === 1 ? "" : "s"}`] : [];
    }
    case "glob": {
      const n = countLines(text);
      if (looksLikeNoMatch(text)) return ["no files matched"];
      return n > 0 ? [`${n} file${n === 1 ? "" : "s"}`] : [];
    }
    case "grep": {
      const n = countLines(text);
      if (looksLikeNoMatch(text)) return ["no matches"];
      return n > 0 ? [`${n} matching line${n === 1 ? "" : "s"}`] : [];
    }
  }

  return clampLines(splitClean(text), maxLines);
}

/** Mini diff for `edit`: up to MAX_DIFF_SIDE removed lines then added lines. */
function formatDiff(oldStr: string, newStr: string): string[] {
  const out: string[] = [];
  const oldLines = oldStr.length > 0 ? oldStr.split("\n") : [];
  const newLines = newStr.length > 0 ? newStr.split("\n") : [];
  for (const l of oldLines.slice(0, MAX_DIFF_SIDE)) out.push("- " + truncate(l));
  if (oldLines.length > MAX_DIFF_SIDE) out.push(`… +${oldLines.length - MAX_DIFF_SIDE} removed`);
  for (const l of newLines.slice(0, MAX_DIFF_SIDE)) out.push("+ " + truncate(l));
  if (newLines.length > MAX_DIFF_SIDE) out.push(`… +${newLines.length - MAX_DIFF_SIDE} added`);
  return out;
}

/** Pull text content out of an AgentToolResult-shaped value (or a bare string). */
export function extractResultText(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
      parts.push(String((block as { text?: string }).text ?? ""));
    }
  }
  return parts.join("\n").trim();
}

function splitClean(text: string): string[] {
  if (text.length === 0) return [];
  return text
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l, i, arr) => !(l === "" && (i === 0 || arr[i - 1] === "")));
}

function clampLines(lines: string[], maxLines: number): string[] {
  const shown = lines.slice(0, maxLines).map((l) => truncate(l));
  const rest = lines.length - maxLines;
  if (rest > 0) shown.push(`… +${rest} line${rest === 1 ? "" : "s"}`);
  return shown;
}

function truncate(s: string, max = MAX_LINE_CHARS): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  return text.split("\n").filter((l) => l.trim().length > 0).length;
}

function looksLikeNoMatch(text: string): boolean {
  return /^no match/i.test(text.trim());
}
