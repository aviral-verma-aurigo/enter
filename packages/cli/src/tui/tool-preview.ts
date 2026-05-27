const MAX = 60;

/**
 * Returns the single most useful argument for a tool call, truncated to MAX chars.
 * Used to annotate tool status lines with context ("bash  git status -s").
 * Returns "" when args are absent or the tool has no meaningful single-arg summary.
 */
export function toolPreview(toolName: string, args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  let raw = "";
  switch (toolName) {
    case "bash":
    case "sandboxed_bash":
      raw = typeof a["command"] === "string" ? a["command"] : "";
      break;
    case "read":
    case "write":
    case "edit":
      raw = typeof a["file_path"] === "string" ? a["file_path"] : "";
      break;
    case "glob":
    case "grep":
      raw = typeof a["pattern"] === "string" ? a["pattern"] : "";
      break;
    case "recall":
    case "memorize":
      raw = typeof a["query"] === "string" ? a["query"] : "";
      break;
  }
  if (!raw) return "";
  // Collapse internal newlines/whitespace so the preview stays on one line.
  const flat = raw.replace(/\s+/g, " ").trim();
  return flat.length > MAX ? flat.slice(0, MAX - 1) + "…" : flat;
}
