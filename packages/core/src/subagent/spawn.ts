import { Agent, type AgentEvent, type AgentTool } from "@earendil-works/pi-agent-core";
import type { Message, Model } from "@earendil-works/pi-ai";
import { ulid } from "ulid";

export interface SpawnSubagentOptions {
  task: string;
  allowedTools: string[];
  parentToolCatalog: AgentTool[];
  model: Model<any>;
  apiKey: string;
  /** Hard cap on turns. */
  maxTurns?: number;
  /** Wall-clock cap in ms (default 5 min). */
  timeoutMs?: number;
  /** Optional system-prompt prefix; the task is appended. */
  systemPromptPrefix?: string;
  /** Optional callback for streaming events (e.g., piping to a TUI/Adaptive Card). */
  onEvent?: (event: AgentEvent) => void;
}

export interface SubagentSummary {
  sessionId: string;
  text: string;
  turns: number;
  toolCalls: { name: string; ok: boolean }[];
  timedOut: boolean;
  stoppedReason: "end_turn" | "max_turns" | "timeout" | "error";
}

const DEFAULT_SYSTEM =
  "You are a subagent of Enter. Stay narrowly focused on the task. Use tools freely within your whitelist. " +
  "When you have the answer, reply with a concise final summary — no preamble.";

const DEFAULT_CONVERT_TO_LLM = (messages: import("@earendil-works/pi-agent-core").AgentMessage[]): Message[] => {
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

export async function spawnSubagent(opts: SpawnSubagentOptions): Promise<SubagentSummary> {
  const sessionId = ulid();
  const allowedSet = new Set(opts.allowedTools);
  const tools = opts.parentToolCatalog.filter((t) => allowedSet.has(t.name));
  const maxTurns = Math.min(Math.max(opts.maxTurns ?? 20, 1), 100);
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;

  const systemPrompt = `${opts.systemPromptPrefix ?? DEFAULT_SYSTEM}\n\nTask:\n${opts.task}`;

  const toolCalls: SubagentSummary["toolCalls"] = [];
  let finalText = "";
  let turns = 0;
  let stopped: SubagentSummary["stoppedReason"] = "end_turn";

  const agent = new Agent({
    initialState: { systemPrompt, model: opts.model, tools, messages: [] },
    convertToLlm: DEFAULT_CONVERT_TO_LLM,
    getApiKey: () => opts.apiKey,
    sessionId,
  });

  const unsubscribe = agent.subscribe(async (event) => {
    if (opts.onEvent) opts.onEvent(event);
    if (event.type === "tool_execution_end") {
      toolCalls.push({ name: event.toolName, ok: !event.isError });
    }
    if (event.type === "turn_end") {
      turns += 1;
      const msg = event.message;
      if (msg && Array.isArray(msg.content)) {
        const texts: string[] = [];
        for (const block of msg.content) {
          if (block && (block as { type?: string }).type === "text") {
            texts.push(String((block as { text?: string }).text ?? ""));
          }
        }
        if (texts.length > 0) finalText = texts.join("");
      }
    }
  });

  const deadline = Date.now() + timeoutMs;
  let timedOut = false;

  try {
    await agent.prompt(opts.task);
    while (turns < maxTurns) {
      if (Date.now() > deadline) {
        timedOut = true;
        stopped = "timeout";
        agent.abort();
        break;
      }
      // If the agent has nothing queued and the loop wants to continue, give it one more turn.
      // The Agent class signals idle when the run completes; a separate call to continue() restarts.
      // We don't `continue()` automatically here — `prompt` and the inner agent loop already handle multi-turn tool flow.
      // Break when the agent has settled.
      break;
    }
    await agent.waitForIdle();
    if (!timedOut && turns >= maxTurns) {
      stopped = "max_turns";
    }
  } catch (err) {
    stopped = "error";
    finalText = `Subagent error: ${(err as Error).message}`;
  } finally {
    unsubscribe();
  }

  return {
    sessionId,
    text: finalText.trim() || "(no output)",
    turns,
    toolCalls,
    timedOut,
    stoppedReason: stopped,
  };
}
