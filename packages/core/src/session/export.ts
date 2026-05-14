import fs from "node:fs";
import path from "node:path";
import type { JsonlSessionRepo } from "./repo.js";

export interface ExportResult {
  markdownPath: string;
  jsonlPath: string;
}

/**
 * Render a session as a single Markdown document and copy the raw JSONL alongside it.
 * Outputs go under `exportsDir/<sessionId>/` so multiple exports of the same session don't collide.
 */
export function exportSession(repo: JsonlSessionRepo, sessionId: string, exportsDir: string): ExportResult {
  const loaded = repo.load(sessionId);
  if (!loaded) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  const outDir = path.join(exportsDir, sessionId);
  fs.mkdirSync(outDir, { recursive: true });

  const markdownPath = path.join(outDir, "transcript.md");
  const jsonlPath = path.join(outDir, "session.jsonl");

  fs.copyFileSync(repo.pathOf(sessionId), jsonlPath);

  const md: string[] = [];
  md.push(`# Session ${loaded.metadata.sessionId}`);
  md.push("");
  md.push(`- created: \`${loaded.metadata.createdAt}\``);
  md.push(`- cwd: \`${loaded.metadata.cwd}\``);
  if (loaded.metadata.parentSessionId) md.push(`- parent: \`${loaded.metadata.parentSessionId}\``);
  md.push("");

  for (const rec of loaded.records) {
    if (rec.type !== "message") continue;
    const m = rec.message as { role?: string; content?: unknown };
    const role = String(m.role ?? "unknown");
    md.push(`## ${role}`);
    md.push(`*${rec.timestamp}*`);
    md.push("");
    if (typeof m.content === "string") {
      md.push(m.content);
    } else if (Array.isArray(m.content)) {
      for (const block of m.content as unknown[]) {
        if (!block || typeof block !== "object") continue;
        const t = (block as { type?: string }).type;
        if (t === "text") {
          md.push(String((block as { text?: string }).text ?? ""));
        } else if (t === "toolCall") {
          const name = String((block as { name?: string }).name ?? "");
          const args = (block as { arguments?: unknown }).arguments;
          md.push(`\n\`tool_use\` → **${name}**`);
          md.push("```json");
          md.push(JSON.stringify(args, null, 2));
          md.push("```");
        } else if (t === "image") {
          md.push("*(image content omitted)*");
        }
      }
    }
    md.push("");
  }

  fs.writeFileSync(markdownPath, md.join("\n"), "utf8");
  return { markdownPath, jsonlPath };
}
