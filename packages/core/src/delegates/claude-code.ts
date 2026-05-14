import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { DelegateError } from "../util/errors.js";

export interface DelegateClaudeCodeOptions {
  task: string;
  allowedTools?: string[];
  cwd?: string;
  maxTurns?: number;
  systemPrompt?: string;
  permissionMode?: Options["permissionMode"];
  /** Streaming callback for live UI rendering (TUI or Adaptive Card). */
  onEvent?: (event: ClaudeDelegateEvent) => void;
}

export type ClaudeDelegateEvent =
  | { kind: "assistant_text"; text: string }
  | { kind: "tool_use"; name: string; input: unknown; toolUseId: string }
  | { kind: "tool_result"; toolUseId: string; ok: boolean }
  | { kind: "error"; message: string };

export interface DelegateClaudeCodeResult {
  text: string;
  sessionId: string;
  turns: number;
  totalCostUsd: number;
  isError: boolean;
  toolCalls: { name: string; ok: boolean }[];
  stopReason: string | null;
}

const DEFAULT_ALLOWED_TOOLS = ["Read", "Edit", "Write", "Bash", "Glob", "Grep"];

/**
 * Invoke Claude Code as a junior agent via the Claude Agent SDK.
 * Uses `ANTHROPIC_API_KEY` from process env — no Claude.ai subscription required.
 *
 * Streams SDK messages and surfaces them as `ClaudeDelegateEvent`s for live rendering.
 * Returns the final `result` text plus a trace summary.
 */
export async function delegateToClaudeCode(
  opts: DelegateClaudeCodeOptions,
): Promise<DelegateClaudeCodeResult> {
  if (!process.env["ANTHROPIC_API_KEY"]) {
    throw new DelegateError(
      "ANTHROPIC_API_KEY is not set. The Claude Agent SDK requires an Anthropic API key.",
    );
  }

  const sdkOptions: Options = {
    allowedTools: opts.allowedTools ?? DEFAULT_ALLOWED_TOOLS,
    permissionMode: opts.permissionMode ?? "acceptEdits",
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
    ...(opts.maxTurns ? { maxTurns: opts.maxTurns } : {}),
    ...(opts.systemPrompt ? { systemPrompt: opts.systemPrompt } : {}),
  };

  const toolCalls: { name: string; ok: boolean }[] = [];
  const okByToolId = new Map<string, boolean>();
  let assistantText = "";
  let resultText = "";
  let sessionId = "";
  let turns = 0;
  let totalCostUsd = 0;
  let isError = false;
  let stopReason: string | null = null;

  try {
    const stream = query({ prompt: opts.task, options: sdkOptions });
    for await (const msg of stream) {
      if (!msg || typeof msg !== "object") continue;
      const type = (msg as { type?: string }).type;

      if (type === "assistant") {
        const m = msg as { session_id?: string; message?: { content?: unknown[] } };
        if (m.session_id) sessionId = m.session_id;
        const content = m.message?.content ?? [];
        for (const block of content) {
          if (!block || typeof block !== "object") continue;
          const bt = (block as { type?: string }).type;
          if (bt === "text") {
            const text = String((block as { text?: string }).text ?? "");
            assistantText += text;
            opts.onEvent?.({ kind: "assistant_text", text });
          } else if (bt === "tool_use") {
            const toolUseId = String((block as { id?: string }).id ?? "");
            const name = String((block as { name?: string }).name ?? "");
            const input = (block as { input?: unknown }).input;
            okByToolId.set(toolUseId, true);
            opts.onEvent?.({ kind: "tool_use", name, input, toolUseId });
            toolCalls.push({ name, ok: true });
          }
        }
      } else if (type === "user") {
        // tool_result blocks arrive as user-role messages
        const content = (msg as { message?: { content?: unknown[] } }).message?.content ?? [];
        for (const block of content) {
          if (!block || typeof block !== "object") continue;
          if ((block as { type?: string }).type === "tool_result") {
            const toolUseId = String((block as { tool_use_id?: string }).tool_use_id ?? "");
            const ok = !((block as { is_error?: boolean }).is_error);
            okByToolId.set(toolUseId, ok);
            const last = toolCalls[toolCalls.length - 1];
            if (last) last.ok = ok;
            opts.onEvent?.({ kind: "tool_result", toolUseId, ok });
          }
        }
      } else if (type === "result") {
        const r = msg as {
          subtype?: string;
          is_error?: boolean;
          num_turns?: number;
          total_cost_usd?: number;
          result?: string;
          errors?: string[];
          stop_reason?: string | null;
          session_id?: string;
        };
        turns = Number(r.num_turns ?? 0);
        totalCostUsd = Number(r.total_cost_usd ?? 0);
        isError = Boolean(r.is_error);
        stopReason = r.stop_reason ?? null;
        if (r.session_id) sessionId = r.session_id;
        if (r.subtype === "success" && typeof r.result === "string") {
          resultText = r.result;
        } else {
          resultText = (r.errors ?? []).join("\n") || assistantText;
          if (isError) {
            opts.onEvent?.({ kind: "error", message: resultText });
          }
        }
      }
    }
  } catch (err) {
    throw new DelegateError(`Claude Code delegate failed: ${(err as Error).message}`, err);
  }

  return {
    text: (resultText || assistantText).trim() || "(no output)",
    sessionId: sessionId || "(unknown)",
    turns,
    totalCostUsd,
    isError,
    toolCalls,
    stopReason,
  };
}
