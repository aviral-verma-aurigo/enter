import fs from "node:fs";
import path from "node:path";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ToolContext } from "./context.js";
import type { DoneSignal } from "../autonomous/done-signal.js";

const ProposePlanParams = Type.Object({
  goal: Type.String({
    minLength: 1,
    description: "One-sentence restatement of what the user asked for.",
  }),
  steps: Type.Array(
    Type.String({ minLength: 1 }),
    {
      minItems: 1,
      maxItems: 50,
      description: "Ordered implementation steps. Each step is a single concrete action.",
    },
  ),
  critical_files: Type.Optional(
    Type.Array(Type.String(), {
      description: "Files the agent expects to read or modify, with repo-relative paths.",
    }),
  ),
  verification: Type.Optional(
    Type.String({
      description: "How the user can verify the change end-to-end (test commands, smoke steps).",
    }),
  ),
});

type Params = Static<typeof ProposePlanParams>;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function renderPlan(params: Params): string {
  const lines: string[] = [];
  lines.push(`# Plan: ${params.goal}`);
  lines.push("");
  lines.push("## Steps");
  params.steps.forEach((step, i) => {
    lines.push(`${i + 1}. ${step}`);
  });
  if (params.critical_files && params.critical_files.length > 0) {
    lines.push("");
    lines.push("## Critical files");
    for (const f of params.critical_files) lines.push(`- \`${f}\``);
  }
  if (params.verification) {
    lines.push("");
    lines.push("## Verification");
    lines.push(params.verification);
  }
  return lines.join("\n") + "\n";
}

/**
 * Interactive plan mode tool. The agent proposes a plan before touching the
 * file system; the autonomous loop terminates after this fires so the user
 * can review the plan file and decide whether to execute.
 *
 * Pair with `--plan` in the CLI; execute later via `--execute-plan <path>`.
 */
export function proposePlanTool(
  ctx: ToolContext,
  signal: DoneSignal,
): AgentTool<typeof ProposePlanParams> {
  return {
    name: "propose_plan",
    label: "Propose plan",
    description:
      "Save a plan for review without executing it. Use in plan-first mode (CLI `--plan`). The autonomous loop terminates after this fires; the user reviews the saved plan file and either revises or executes.",
    parameters: ProposePlanParams,
    execute: async (_id, params: Params) => {
      const plansDir = path.join(ctx.paths.home, "plans");
      fs.mkdirSync(plansDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `${stamp}-${slugify(params.goal) || "plan"}.md`;
      const planPath = path.join(plansDir, filename);
      fs.writeFileSync(planPath, renderPlan(params), "utf8");

      signal.fire({
        summary: `Plan proposed: ${params.goal}`,
        artifacts: [planPath],
      });

      return {
        content: [
          {
            type: "text",
            text:
              `Plan saved to ${planPath}.\n` +
              `Review it, then run \`enter --execute-plan ${planPath}\` to execute, ` +
              `or re-run \`enter --plan "<revised goal>"\` to iterate.`,
          },
        ],
        details: { path: planPath, steps: params.steps.length },
        terminate: true,
      };
    },
  };
}
