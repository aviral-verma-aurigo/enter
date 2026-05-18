import type { Component } from "@earendil-works/pi-tui";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const INTERVAL_MS = 80;

/**
 * Loader that renders zero lines when idle (empty message).
 * pi-tui's stock Loader always emits at least a blank line + its message,
 * which leaves a stray "· idle" row visible during the empty-transcript state.
 */
export class MinimalLoader implements Component {
  private message = "";
  private currentFrame = 0;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    private readonly spinnerColor: (s: string) => string,
    private readonly messageColor: (s: string) => string,
    private readonly onTick: () => void,
  ) {}

  setMessage(message: string): void {
    const wasIdle = this.message === "";
    this.message = message;
    if (message === "") {
      this.stopAnimation();
    } else if (wasIdle) {
      this.startAnimation();
    }
    this.onTick();
  }

  stop(): void {
    this.stopAnimation();
    this.message = "";
  }

  invalidate(): void {}

  render(_width: number): string[] {
    if (this.message === "") return [];
    const frame = FRAMES[this.currentFrame] ?? "";
    return [`  ${this.spinnerColor(frame)} ${this.messageColor(this.message)}`];
  }

  private startAnimation(): void {
    this.stopAnimation();
    this.intervalId = setInterval(() => {
      this.currentFrame = (this.currentFrame + 1) % FRAMES.length;
      this.onTick();
    }, INTERVAL_MS);
  }

  private stopAnimation(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
