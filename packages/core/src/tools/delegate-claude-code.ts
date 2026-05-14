import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { delegateToClaudeCode } from "../delegates/claude-code.js";
import type { ToolContext } from "./context.js";

const DelegateParams = Type.Object({
  task: Type.String({ minLength: 1, description: "Self-contained task description for Claude Code." }),
  allowed_tools: Type.Optional(
    Type.Array(Type.String(), {
      description: "Claude Code tool whitelist. Defaults to Read/Edit/Write/Bash/Glob/Grep.",
    }),
  ),
  cwd: Type.Optional(Type.String({ description: "Working directory for the delegate. Defaults to parent's cwd." })),
  max_turns: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  system_prompt: Type.Optional(Type.String({ description: "Override Claude Code's system prompt." })),
});

type Params = Static<typeof DelegateParams>;

export function delegateClaudeCodeTool(ctx: ToolContext): AgentTool<typeof DelegateParams> {
  return {
    name: "delegate_to_claude_code",
    label: "Delegate to Claude Code",
    description:
      "Hand off a self-contained coding task to Claude Code via the Claude Agent SDK. Use when the task benefits from Claude Code's full toolset (Read/Edit/Write/Bash/Glob/Grep) running independently. Returns Claude Code's final summary plus a trace of tool calls and cost.",
    parameters: DelegateParams,
    execute: async (_id, params: Params) => {
      const result = await delegateToClaudeCode({
        task: params.task,
        ...(params.allowed_tools ? { allowedTools: params.allowed_tools } : {}),
        cwd: params.cwd ?? ctx.cwd,
        ...(params.max_turns ? { maxTurns: params.max_turns } : {}),
        ...(params.system_prompt ? { systemPrompt: params.system_prompt } : {}),
      });

      const header =
        `Claude Code (session ${result.sessionId}) — ${result.turns} turn(s), ` +
        `${result.toolCalls.length} tool call(s), ` +
        `$${result.totalCostUsd.toFixed(4)}${result.isError ? " — ERROR" : ""}.`;
      return {
        content: [{ type: "text", text: `${header}\n\n${result.text}` }],
        details: result,
      };
    },
  };
}
