import fg from "fast-glob";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ToolContext } from "./context.js";

const GlobParams = Type.Object({
  pattern: Type.String({ description: "Glob pattern (fast-glob syntax)." }),
  cwd: Type.Optional(Type.String()),
  ignore: Type.Optional(Type.Array(Type.String())),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 5000 })),
});

type Params = Static<typeof GlobParams>;

const DEFAULT_IGNORE = ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/*.tsbuildinfo"];

export function globTool(ctx: ToolContext): AgentTool<typeof GlobParams> {
  return {
    name: "glob",
    label: "Glob files",
    description:
      "Find files matching a glob pattern (fast-glob). Anchored to the tool context's cwd unless overridden. Skips node_modules/dist/.git by default.",
    parameters: GlobParams,
    execute: async (_id, params: Params) => {
      const cwd = params.cwd ?? ctx.cwd;
      const limit = params.limit ?? 500;
      const ignore = params.ignore ?? DEFAULT_IGNORE;
      const matches = await fg(params.pattern, { cwd, ignore, dot: true });
      const truncated = matches.length > limit;
      const shown = matches.slice(0, limit);
      const text =
        shown.length === 0
          ? `No matches for ${params.pattern} in ${cwd}.`
          : shown.join("\n") + (truncated ? `\n[... ${matches.length - limit} more truncated ...]` : "");
      return {
        content: [{ type: "text", text }],
        details: { count: matches.length, returned: shown.length, truncated, cwd },
      };
    },
  };
}
