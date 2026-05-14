import type { Component } from "@earendil-works/pi-tui";
import { color, colorize } from "./color.js";

const C_DIM = colorize(color.dim);

/**
 * Horizontal rule that always spans the full viewport width.
 * Unlike `Text`, this re-computes at every render so it adapts to terminal resize.
 */
export class Rule implements Component {
  invalidate(): void {
    // No cached state.
  }
  render(width: number): string[] {
    if (width <= 0) return [""];
    return [C_DIM("─".repeat(width))];
  }
}
