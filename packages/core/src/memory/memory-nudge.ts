import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { UserMessage } from "@earendil-works/pi-ai";

export interface MemoryNudgeOptions {
  /** Inject the nudge every N turns (default 6). */
  nudgeEveryNTurns?: number;
  /** Token estimate at which we start trimming old turns (default 80k). */
  compactionThresholdTokens?: number;
  /** When compacting, how many of the oldest message slots to drop (default 6). */
  compactionDropCount?: number;
}

const DEFAULTS: Required<MemoryNudgeOptions> = {
  nudgeEveryNTurns: 6,
  compactionThresholdTokens: 80_000,
  compactionDropCount: 6,
};

const NUDGE_TEXT =
  "[memory-nudge] Quick reminder: before continuing, call `recall` for relevant memory and " +
  "`remember` anything durable (user preferences, project facts, recurring failures). " +
  "Use `link` to record relationships between people, projects, modules, and files when you notice them.";

/**
 * Build the `transformContext` hook that injects a memory nudge every N turns
 * and drops the oldest messages once the token estimate exceeds the threshold.
 *
 * The hook is stateless across agents — each `Agent` gets its own counter via the returned
 * closure. Reuse the same hook instance per Agent (e.g. construct in `buildAgent`).
 */
export function createMemoryNudgeHook(
  options: MemoryNudgeOptions = {},
): (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]> {
  const cfg = { ...DEFAULTS, ...options };
  let callCount = 0;

  return async (messages) => {
    callCount += 1;
    let working = messages;

    // Cheap compaction: drop oldest messages once token budget exceeded.
    if (estimateTokens(working) > cfg.compactionThresholdTokens && working.length > cfg.compactionDropCount + 2) {
      const dropped = working.slice(0, cfg.compactionDropCount);
      const remaining = working.slice(cfg.compactionDropCount);
      const summary: UserMessage = {
        role: "user",
        content: `[context-summary] ${dropped.length} earlier message(s) trimmed for length. ` +
          `If you need that detail, call \`recall\` or \`read\` to retrieve it.`,
        timestamp: Date.now(),
      };
      working = [summary, ...remaining];
    }

    if (callCount % cfg.nudgeEveryNTurns !== 0) return working;

    const nudge: UserMessage = {
      role: "user",
      content: NUDGE_TEXT,
      timestamp: Date.now(),
    };
    return [...working, nudge];
  };
}

/**
 * Rough char-based token estimate (chars/4). Good enough for nudge/compaction gating.
 */
export function estimateTokens(messages: AgentMessage[]): number {
  let total = 0;
  for (const m of messages) {
    if (!("content" in m)) continue;
    const c = m.content;
    if (typeof c === "string") {
      total += c.length;
    } else if (Array.isArray(c)) {
      for (const block of c) {
        if (block && typeof block === "object" && "text" in block && typeof (block as { text?: unknown }).text === "string") {
          total += ((block as { text: string }).text ?? "").length;
        }
      }
    }
  }
  return Math.ceil(total / 4);
}
