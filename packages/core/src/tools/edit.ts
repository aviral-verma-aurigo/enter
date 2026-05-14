import fs from "node:fs/promises";
import path from "node:path";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { ToolError } from "../util/errors.js";
import type { ToolContext } from "./context.js";

const EditParams = Type.Object({
  file_path: Type.String(),
  old_string: Type.String({ description: "Exact text to replace. Must match the file content verbatim, including whitespace." }),
  new_string: Type.String({ description: "Replacement text." }),
  replace_all: Type.Optional(Type.Boolean({ description: "Replace every occurrence. Default false; defaults require a unique match." })),
});

type Params = Static<typeof EditParams>;

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
  }
  return count;
}

export function editTool(ctx: ToolContext): AgentTool<typeof EditParams> {
  return {
    name: "edit",
    label: "Edit file",
    description:
      "Exact-match string replacement in a file. Errors out if `old_string` is not unique unless `replace_all=true`.",
    parameters: EditParams,
    execute: async (_id, params: Params, signal) => {
      const target = path.isAbsolute(params.file_path) ? params.file_path : path.join(ctx.cwd, params.file_path);
      let raw: string;
      try {
        raw = await fs.readFile(target, { encoding: "utf8", signal });
      } catch (err) {
        throw new ToolError(`Could not read ${target}`, err);
      }
      const occurrences = countOccurrences(raw, params.old_string);
      if (occurrences === 0) {
        throw new ToolError(`old_string not found in ${target}.`);
      }
      if (occurrences > 1 && !params.replace_all) {
        throw new ToolError(
          `old_string matches ${occurrences} times in ${target}. Provide more context or set replace_all=true.`,
        );
      }
      let updated: string;
      if (params.replace_all) {
        updated = raw.split(params.old_string).join(params.new_string);
      } else {
        const idx = raw.indexOf(params.old_string);
        updated = raw.slice(0, idx) + params.new_string + raw.slice(idx + params.old_string.length);
      }
      await fs.writeFile(target, updated, { encoding: "utf8", signal });
      return {
        content: [
          {
            type: "text",
            text: `Replaced ${occurrences} occurrence(s) in ${target}.`,
          },
        ],
        details: { path: target, replacements: occurrences, replaceAll: params.replace_all ?? false },
      };
    },
  };
}
