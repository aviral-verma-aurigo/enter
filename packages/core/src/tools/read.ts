import fs from "node:fs/promises";
import path from "node:path";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { ToolError } from "../util/errors.js";
import type { ToolContext } from "./context.js";

const ReadParams = Type.Object({
  file_path: Type.String({ description: "Absolute or cwd-relative path to read." }),
  offset: Type.Optional(Type.Integer({ minimum: 0, description: "0-indexed line offset to start reading from." })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 5000, description: "Max number of lines to return (default 2000)." })),
});

type Params = Static<typeof ReadParams>;

function resolveCwdPath(p: string, cwd: string): string {
  return path.isAbsolute(p) ? p : path.join(cwd, p);
}

export function readTool(ctx: ToolContext): AgentTool<typeof ReadParams> {
  return {
    name: "read",
    label: "Read file",
    description:
      "Read a text file. Returns lines with 1-indexed numbers (cat -n style). For large files use offset/limit.",
    parameters: ReadParams,
    execute: async (_id, params: Params, signal) => {
      const target = resolveCwdPath(params.file_path, ctx.cwd);
      let raw: string;
      try {
        raw = await fs.readFile(target, { encoding: "utf8", signal });
      } catch (err) {
        throw new ToolError(`Could not read ${target}`, err);
      }
      const lines = raw.split(/\r?\n/);
      const start = params.offset ?? 0;
      const limit = params.limit ?? 2000;
      const slice = lines.slice(start, start + limit);
      const rendered = slice
        .map((line, i) => `${String(start + i + 1).padStart(5, " ")}\t${line}`)
        .join("\n");
      const truncated = start + slice.length < lines.length;
      const footer = truncated
        ? `\n[... ${lines.length - (start + slice.length)} more line(s); pass offset=${start + slice.length} to continue ...]`
        : "";
      return {
        content: [{ type: "text", text: rendered + footer }],
        details: { path: target, totalLines: lines.length, returnedLines: slice.length, truncated },
      };
    },
  };
}
