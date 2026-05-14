import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Skill } from "../skills/load.js";
import { formatSkillsForPrompt } from "../skills/load.js";

export interface SystemPromptInput {
  personaText: string;
  tools: AgentTool[];
  skills: Skill[];
  cwd: string;
  hasMemory: boolean;
  hasGraph: boolean;
  autonomous: boolean;
  channelKey?: string | null;
  extras?: string[];
}

function toolOverview(tools: AgentTool[]): string {
  if (tools.length === 0) return "(no tools available)";
  return tools.map((t) => `- \`${t.name}\` — ${t.description.split("\n")[0]}`).join("\n");
}

export function composeSystemPrompt(input: SystemPromptInput): string {
  const date = new Date().toISOString().slice(0, 10);
  const parts: string[] = [];

  parts.push(
    "You are Enter, an autonomous coding agent. The current date is " +
      date +
      ". Working directory: " +
      input.cwd +
      ".",
  );

  if (input.channelKey) {
    parts.push(
      "You are running inside a Microsoft Teams channel (" +
        input.channelKey +
        "). Everything you say is public. Make your reasoning legible — others learn by watching.",
    );
  }

  parts.push("<persona>");
  parts.push(input.personaText.trim());
  parts.push("</persona>");

  parts.push("<tools_overview>");
  parts.push(toolOverview(input.tools));
  parts.push("</tools_overview>");

  if (input.hasMemory) {
    parts.push(
      "<memory_protocol>\n" +
        "- Before acting on assumptions about the user, project, or recurring patterns, call `recall`.\n" +
        "- After learning something durable, call `remember` with the right type (user/feedback/project/reference/channel).\n" +
        (input.hasGraph
          ? "- When you notice a relationship between entities, call `link`. Query the graph with `neighbors`, `path`, or `entity_facts`.\n"
          : "") +
        "</memory_protocol>",
    );
  }

  if (input.autonomous) {
    parts.push(
      "<autonomy_protocol>\n" +
        "- Plan briefly, then act. Use tools freely.\n" +
        "- When the goal is fully achieved, call the `done` tool with a one-paragraph summary and any artifact list.\n" +
        "- If you stall for two consecutive turns with no progress, summarize the blocker and call `done` to stop.\n" +
        "</autonomy_protocol>",
    );
  }

  const skillsBlock = formatSkillsForPrompt(input.skills);
  if (skillsBlock) parts.push(skillsBlock);

  if (input.extras) {
    for (const extra of input.extras) {
      if (extra.trim().length > 0) parts.push(extra);
    }
  }

  return parts.join("\n\n");
}
