import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import { authorSkill } from "../skills/author-skill.js";
import type { ToolContext } from "./context.js";

const AuthorSkillParams = Type.Object({
  name: Type.String({
    pattern: "^[a-z0-9][a-z0-9-]{0,47}$",
    maxLength: 48,
    description: "kebab-case slug for the skill folder name.",
  }),
  trigger: Type.String({ minLength: 1, maxLength: 280, description: "When should this skill fire?" }),
  procedure: Type.String({ minLength: 1, description: "Numbered or bulleted steps to follow." }),
  rationale: Type.Optional(Type.String({ description: "Why this is worth authoring." })),
});

type Params = Static<typeof AuthorSkillParams>;

export interface AuthorSkillToolOptions {
  model: Model<any>;
  apiKey: string;
  skipCritique?: boolean;
}

export function authorSkillTool(
  ctx: ToolContext,
  options: AuthorSkillToolOptions,
): AgentTool<typeof AuthorSkillParams> {
  return {
    name: "author_skill",
    label: "Author skill",
    description:
      "Write a new SKILL.md for a recurring procedure the agent has noticed. The skill will be available to the agent (and others) in future sessions. The tool runs a one-shot critique before writing.",
    parameters: AuthorSkillParams,
    execute: async (_id, params: Params) => {
      const result = await authorSkill(ctx.paths.skillsDir, params, options);
      if (!result.written) {
        return {
          content: [{ type: "text", text: `Skill refused: ${result.refusalReason}` }],
          details: result,
        };
      }
      return {
        content: [{ type: "text", text: `Authored skill '${params.name}' at ${result.filePath}` }],
        details: result,
      };
    },
  };
}
