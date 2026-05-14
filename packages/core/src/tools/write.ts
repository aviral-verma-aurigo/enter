import fs from "node:fs/promises";
import path from "node:path";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { ToolError } from "../util/errors.js";
import type { ToolContext } from "./context.js";

const WriteParams = Type.Object({
  file_path: Type.String({ description: "Absolute or cwd-relative path to write." }),
  content: Type.String({ description: "Full file content. The existing file is overwritten." }),
});

type Params = Static<typeof WriteParams>;

export function writeTool(ctx: ToolContext): AgentTool<typeof WriteParams> {
  return {
    name: "write",
    label: "Write file",
    description: "Create a file or overwrite an existing file with the given content. Parent directories are created if missing.",
    parameters: WriteParams,
    execute: async (_id, params: Params, signal) => {
      const target = path.isAbsolute(params.file_path) ? params.file_path : path.join(ctx.cwd, params.file_path);
      try {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, params.content, { encoding: "utf8", signal });
      } catch (err) {
        throw new ToolError(`Could not write ${target}`, err);
      }
      return {
        content: [{ type: "text", text: `Wrote ${params.content.length} byte(s) to ${target}.` }],
        details: { path: target, bytes: params.content.length },
      };
    },
  };
}
