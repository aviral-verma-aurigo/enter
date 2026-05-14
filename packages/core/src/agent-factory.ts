import { Agent, type AgentMessage, type AgentTool, type AgentOptions } from "@earendil-works/pi-agent-core";
import type { Message, Model, ThinkingBudgets } from "@earendil-works/pi-ai";
import type { ThinkingLevel } from "./config/config-schema.js";
import { createMemoryNudgeHook } from "./memory/memory-nudge.js";
import { loadSkills } from "./skills/load.js";
import { composeSystemPrompt } from "./persona/system-prompt.js";
import { loadSoul } from "./persona/soul-loader.js";
import { registerBuiltinTools } from "./tools/index.js";
import type { ToolContext } from "./tools/context.js";
import type { EnterPaths } from "./config/paths.js";
import type { DoneSignal } from "./autonomous/done-signal.js";

export interface BuildAgentOptions {
  ctx: ToolContext;
  paths: EnterPaths;
  model: Model<any>;
  apiKey: string;
  thinkingLevel: ThinkingLevel;
  thinkingBudgets?: ThinkingBudgets;
  /** Autonomous mode: pass the DoneSignal to enable the `done` tool. */
  doneSignal?: DoneSignal;
  /** Optional explicit SOUL.md path override. */
  soulPath?: string;
  /** Channel context (used by the Teams bot). */
  channelKey?: string | null;
  /** Allow-list of tool names (CLI leaves undefined; bot restricts). */
  allowedTools?: string[];
  /** Extra tools to register (bot injects git/PR/sandboxed_bash here). */
  extraTools?: AgentTool[];
  /** Replace `bash` with the bot's `sandboxed_bash` — pass `false` to skip core `bash`. */
  includeBash?: boolean;
  /** Pre-existing session id (resumption). */
  sessionId?: string;
  /** Memory nudge cadence overrides. */
  memoryNudge?: { nudgeEveryNTurns?: number; compactionThresholdTokens?: number };
}

const convertToLlm = (messages: AgentMessage[]): Message[] => {
  const out: Message[] = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    const role = (m as { role?: string }).role;
    if (role === "user" || role === "assistant" || role === "toolResult") {
      out.push(m as Message);
    }
  }
  return out;
};

export function buildAgent(opts: BuildAgentOptions): { agent: Agent; tools: AgentTool[]; systemPrompt: string } {
  const soul = loadSoul(opts.paths, opts.soulPath);
  const { skills } = loadSkills([opts.paths.skillsDir, opts.paths.projectSkillsDir]);

  const tools = registerBuiltinTools({
    ctx: opts.ctx,
    model: opts.model,
    apiKey: opts.apiKey,
    ...(opts.doneSignal ? { doneSignal: opts.doneSignal } : {}),
    ...(opts.allowedTools ? { allowed: opts.allowedTools } : {}),
    ...(opts.extraTools ? { extra: opts.extraTools } : {}),
    includeBash: opts.includeBash !== false,
  });

  const systemPrompt = composeSystemPrompt({
    personaText: soul.text,
    tools,
    skills,
    cwd: opts.ctx.cwd,
    hasMemory: true,
    hasGraph: true,
    autonomous: Boolean(opts.doneSignal),
    channelKey: opts.channelKey ?? null,
  });

  const transformContext = createMemoryNudgeHook(opts.memoryNudge);

  const agentOptions: AgentOptions = {
    initialState: {
      systemPrompt,
      model: opts.model,
      thinkingLevel: opts.thinkingLevel,
      tools,
      messages: [],
    },
    convertToLlm,
    transformContext,
    getApiKey: () => opts.apiKey,
    ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
    ...(opts.thinkingBudgets ? { thinkingBudgets: opts.thinkingBudgets } : {}),
  };

  const agent = new Agent(agentOptions);
  return { agent, tools, systemPrompt };
}
