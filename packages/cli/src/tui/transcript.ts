import type { Component } from "@earendil-works/pi-tui";
import { color, colorize } from "./color.js";

const C_USER = colorize(color.cyan);
const C_ASSISTANT_LABEL = colorize(color.green);
const C_TOOL = colorize(color.magenta);
const C_BOLD = colorize(color.bold);
const C_DIM = colorize(color.dim);
const C_GREEN = colorize(color.green);
const C_RED = colorize(color.red);
const C_ERROR = colorize(color.red);

interface Block {
  kind: "user" | "assistant" | "tool" | "system" | "error";
  /** Unique tool call ID — used to match start→end for in-place update. */
  toolCallId?: string;
  toolName?: string;
  toolPreview?: string;
  /** undefined = in-progress, true = ok, false = error */
  toolOk?: boolean;
  toolElapsedMs?: number;
  toolStartedAt?: number;
  text: string;
}

/**
 * Scrolling conversation view. Appends blocks; renders them word-wrapped to the
 * current width with subtle ANSI coloring per block kind.
 *
 * Tool blocks are pushed once on start and mutated in-place on end, giving a
 * single status line per tool call (Claude Code–style) rather than two lines.
 */
export class Transcript implements Component {
  private blocks: Block[] = [];
  private currentAssistant: Block | null = null;

  constructor(private readonly maxBlocks = 500) {}

  pushUser(text: string): void {
    this.endAssistant();
    this.blocks.push({ kind: "user", text });
    this.trim();
  }

  pushSystem(text: string): void {
    this.endAssistant();
    this.blocks.push({ kind: "system", text });
    this.trim();
  }

  pushError(text: string): void {
    this.endAssistant();
    this.blocks.push({ kind: "error", text });
    this.trim();
  }

  pushToolStart(toolCallId: string, toolName: string, preview: string): void {
    // Don't end the assistant block — the model often emits text → tool → more text
    // in the same turn. Keep the in-progress assistant block live.
    this.blocks.push({
      kind: "tool",
      toolCallId,
      toolName,
      toolPreview: preview,
      toolStartedAt: Date.now(),
      toolOk: undefined,
      text: "",
    });
    this.trim();
  }

  pushToolEnd(toolCallId: string, isError: boolean): void {
    // Find the matching in-progress block and update it in place.
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      if (b && b.kind === "tool" && b.toolCallId === toolCallId && b.toolOk === undefined) {
        b.toolOk = !isError;
        b.toolElapsedMs = b.toolStartedAt !== undefined ? Date.now() - b.toolStartedAt : undefined;
        return;
      }
    }
    // Fallback: no matching block found — push a minimal end-only entry.
    this.blocks.push({ kind: "tool", toolCallId, toolOk: !isError, text: toolCallId });
    this.trim();
  }

  /** Append a streamed text delta to the active assistant block, creating one if absent. */
  appendToAssistant(delta: string): void {
    if (!this.currentAssistant) {
      this.currentAssistant = { kind: "assistant", text: "" };
      this.blocks.push(this.currentAssistant);
    }
    this.currentAssistant.text += delta;
  }

  /** Finalize the current assistant block (called on turn_end). */
  endAssistant(): void {
    this.currentAssistant = null;
  }

  invalidate(): void {
    // Stateless re-render; no cached state to bust.
  }

  render(width: number): string[] {
    const out: string[] = [];
    for (const block of this.blocks) {
      switch (block.kind) {
        case "user":
          out.push(C_USER("» ") + block.text);
          out.push("");
          break;
        case "assistant":
          out.push(C_ASSISTANT_LABEL("◆ ") + block.text);
          out.push("");
          break;
        case "tool":
          out.push(renderTool(block));
          break;
        case "system":
          out.push(C_DIM("· " + block.text));
          break;
        case "error":
          out.push(C_ERROR("✗ " + block.text));
          break;
      }
    }
    return wrapLines(out, width);
  }

  private trim(): void {
    if (this.blocks.length > this.maxBlocks) {
      this.blocks.splice(0, this.blocks.length - this.maxBlocks);
    }
  }
}

function renderTool(block: Block): string {
  const name = block.toolName ?? block.text;
  const preview = block.toolPreview ?? "";

  if (block.toolOk === undefined) {
    // In-progress: magenta bullet + bold tool name + dim preview
    return C_TOOL("· ") + C_BOLD(name) + (preview ? C_DIM("  " + preview) : "");
  }

  const detail = name + (preview ? "  " + preview : "");
  if (block.toolOk) {
    const timing = block.toolElapsedMs !== undefined ? "  " + fmtMs(block.toolElapsedMs) : "";
    return C_GREEN("✓ ") + C_DIM(detail + timing);
  }
  return C_RED("✗ ") + C_DIM(detail);
}

function fmtMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** ANSI-aware soft wrap. We avoid splitting escape sequences. */
function wrapLines(lines: string[], width: number): string[] {
  if (width <= 4) return lines;
  const out: string[] = [];
  for (const line of lines) {
    if (line.length === 0) {
      out.push("");
      continue;
    }
    if (visibleWidth(line) <= width) {
      out.push(line);
      continue;
    }
    let remaining = line;
    while (visibleWidth(remaining) > width) {
      const chunk = sliceVisible(remaining, width);
      out.push(chunk);
      remaining = remaining.slice(chunk.length);
    }
    if (remaining.length > 0) out.push(remaining);
  }
  return out;
}

const ANSI_RE = /\[[0-9;]*m/g;

function visibleWidth(s: string): number {
  return s.replace(ANSI_RE, "").length;
}

function sliceVisible(s: string, width: number): string {
  let visible = 0;
  let i = 0;
  while (i < s.length && visible < width) {
    if (s[i] === "" && s[i + 1] === "[") {
      const end = s.indexOf("m", i + 2);
      if (end !== -1) {
        i = end + 1;
        continue;
      }
    }
    i++;
    visible++;
  }
  return s.slice(0, i);
}
