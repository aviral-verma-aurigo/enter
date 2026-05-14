import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ToolContext } from "./context.js";

const GrepParams = Type.Object({
  pattern: Type.String({ description: "Regular expression to search for." }),
  glob: Type.Optional(Type.String({ description: "Restrict search to files matching this glob." })),
  cwd: Type.Optional(Type.String()),
  case_insensitive: Type.Optional(Type.Boolean()),
  max_files: Type.Optional(Type.Integer({ minimum: 1, maximum: 5000 })),
  max_matches: Type.Optional(Type.Integer({ minimum: 1, maximum: 5000 })),
});

type Params = Static<typeof GrepParams>;

const DEFAULT_IGNORE = ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/*.tsbuildinfo"];

export function grepTool(ctx: ToolContext): AgentTool<typeof GrepParams> {
  return {
    name: "grep",
    label: "Grep files",
    description: "Search file contents with a regex. Results are line-numbered. Pure JS — no rg required.",
    parameters: GrepParams,
    execute: async (_id, params: Params, signal) => {
      const cwd = params.cwd ?? ctx.cwd;
      const maxFiles = params.max_files ?? 200;
      const maxMatches = params.max_matches ?? 500;
      const flags = params.case_insensitive ? "i" : "";
      let re: RegExp;
      try {
        re = new RegExp(params.pattern, flags);
      } catch (err) {
        return {
          content: [{ type: "text", text: `Invalid regex: ${(err as Error).message}` }],
          details: { error: "invalid_regex" },
        };
      }
      const pattern = params.glob ?? "**/*";
      const files = await fg(pattern, { cwd, ignore: DEFAULT_IGNORE, dot: true });
      const scanFiles = files.slice(0, maxFiles);
      const out: { file: string; line: number; text: string }[] = [];
      for (const rel of scanFiles) {
        if (signal?.aborted) break;
        const full = path.join(cwd, rel);
        let buf: string;
        try {
          buf = await fs.readFile(full, "utf8");
        } catch {
          continue;
        }
        const lines = buf.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i]!)) {
            out.push({ file: rel, line: i + 1, text: lines[i]! });
            if (out.length >= maxMatches) break;
          }
        }
        if (out.length >= maxMatches) break;
      }
      if (out.length === 0) {
        return {
          content: [{ type: "text", text: `No matches in ${scanFiles.length} file(s).` }],
          details: { matches: 0, filesScanned: scanFiles.length },
        };
      }
      const lines = out.map((m) => `${m.file}:${m.line}: ${m.text}`);
      const truncated = out.length >= maxMatches;
      return {
        content: [
          {
            type: "text",
            text: lines.join("\n") + (truncated ? `\n[... truncated at ${maxMatches} matches ...]` : ""),
          },
        ],
        details: { matches: out.length, filesScanned: scanFiles.length, truncated },
      };
    },
  };
}
