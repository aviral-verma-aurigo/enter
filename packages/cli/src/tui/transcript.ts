import type { Component } from "@earendil-works/pi-tui";
import { color, colorize } from "./color.js";

const C_USER = colorize(color.cyan);
const C_ASSISTANT_LABEL = colorize(color.green);
const C_TOOL = colorize(color.magenta);
const C_DIM = colorize(color.dim);
const C_ERROR = colorize(color.red);

interface Block {
  kind: "user" | "assistant" | "tool" | "system" | "error";
  toolName?: string;
  toolOk?: boolean;
  text: string;
}

/**
 * Scrolling conversation view. Appends blocks; renders them word-wrapped to the
 * current width with subtle ANSI coloring per block kind.
 *
 * Designed so the active assistant block can be streamed token-by-token via
 * `appendToAssistant()` without re-pushing blocks.
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

  pushToolStart(toolName: string): void {
    // We don't end the assistant block on tool-start because the model often
    // emits text → tool → more text in the same turn; keep the in-progress
    // assistant block live but flush a tool status line in between.
    this.blocks.push({ kind: "tool", toolName, text: `${toolName} starting…` });
    this.trim();
  }

  pushToolEnd(toolName: string, isError: boolean): void {
    this.blocks.push({
      kind: "tool",
      toolName,
      toolOk: !isError,
      text: `${toolName} ${isError ? "error" : "ok"}`,
    });
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
          out.push(C_TOOL("· ") + C_DIM(block.text));
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

const ANSI_RE = /\[[0-9;]*m/g;

function visibleWidth(s: string): number {
  return s.replace(ANSI_RE, "").length;
}

function sliceVisible(s: string, width: number): string {
  let visible = 0;
  let i = 0;
  while (i < s.length && visible < width) {
    if (s[i] === "" && s[i + 1] === "[") {
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
