import type { Agent, AgentEvent } from "@earendil-works/pi-agent-core";
import type { DonePayload, DoneSignal } from "./done-signal.js";
import type { StopBundle } from "./stop-conditions.js";

export interface AutonomousOptions {
  doneSignal: DoneSignal;
  maxTurns?: number;
  idleStallTurns?: number;
  wallClockMinutes?: number;
}

export interface AutonomousResult {
  payload: DonePayload | null;
  stop: StopBundle;
  finalText: string;
  toolCalls: number;
}

const SEED_PREAMBLE =
  "[autonomous-mode] Goal: ";
const SEED_SUFFIX =
  "\n\nWork toward this goal. Use tools freely. When the goal is fully achieved, call the `done` tool with a final summary.";
const CONTINUE_MESSAGE =
  "[autonomous-mode] Continue working toward the goal. If you've stalled, summarize the blocker and call `done` to stop. If the goal is achieved, call `done` now.";

/**
 * Drive an Agent in a loop until the `done` tool fires, max turns, idle stall, timeout, or abort.
 * Inject a fresh user "continue" message each iteration because pi-agent-core's `Agent.continue()`
 * requires the last message to be a user or tool-result message.
 */
export async function runAutonomous(agent: Agent, goal: string, opts: AutonomousOptions): Promise<AutonomousResult> {
  const { doneSignal } = opts;
  const maxTurns = Math.min(Math.max(opts.maxTurns ?? 50, 1), 1000);
  const idleStallTurns = Math.max(opts.idleStallTurns ?? 2, 1);
  const wallClockMs = Math.max(opts.wallClockMinutes ?? 30, 1) * 60 * 1000;

  let turns = 0;
  let toolCalls = 0;
  let idleStreak = 0;
  let finalText = "";

  const unsubscribe = agent.subscribe(async (event: AgentEvent) => {
    if (event.type === "tool_execution_end") toolCalls += 1;
    if (event.type === "turn_end") {
      const msg = event.message;
      const hadToolCalls = Array.isArray(msg.content)
        ? msg.content.some((b) => b && (b as { type?: string }).type === "toolCall")
        : false;
      if (hadToolCalls) {
        idleStreak = 0;
      } else {
        idleStreak += 1;
      }
      // Capture latest assistant text for the final result.
      if (Array.isArray(msg.content)) {
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

  const deadline = Date.now() + wallClockMs;
  let stop: StopBundle = { reason: "max_turns", turns: 0 };

  try {
    await agent.prompt(SEED_PREAMBLE + goal + SEED_SUFFIX);
    turns += 1;

    while (turns < maxTurns) {
      if (doneSignal.fired) {
        stop = { reason: "done", turns };
        break;
      }
      if (idleStreak >= idleStallTurns) {
        stop = { reason: "idle_stall", turns };
        break;
      }
      if (Date.now() > deadline) {
        agent.abort();
        await agent.waitForIdle();
        stop = { reason: "timeout", turns };
        break;
      }
      await agent.prompt(CONTINUE_MESSAGE);
      turns += 1;
    }
    if (turns >= maxTurns && !doneSignal.fired) {
      stop = { reason: "max_turns", turns };
    }
    if (doneSignal.fired && stop.reason !== "done") {
      stop = { reason: "done", turns };
    }
  } catch (err) {
    stop = { reason: "error", turns, details: (err as Error).message };
  } finally {
    unsubscribe();
  }

  return {
    payload: doneSignal.payload,
    stop,
    finalText,
    toolCalls,
  };
}
