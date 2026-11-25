import readline from "node:readline";
import type { Agent } from "@earendil-works/pi-agent-core";
import { dispatchSlash, type SlashContext } from "../slash/index.js";
import { MarkdownStreamer } from "../tui/markdown.js";
import { colorEnabled } from "../tui/color.js";

export interface InteractiveOptions {
  agent: Agent;
  slashContext: SlashContext;
}

/**
 * Fallback interactive mode — readline-based REPL for non-TTY contexts or `--simple`.
 *
 * Streams assistant text deltas to stdout, prints `[tool] name` lines, and accepts slash commands.
 * On a terminal, assistant text is rendered as markdown one block at a time; when stdout is
 * piped, raw deltas are written unchanged.
 */
export async function runInteractiveMode(opts: InteractiveOptions): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "» " });

  const streamer =
    process.stdout.isTTY === true
      ? new MarkdownStreamer(
          (s) => process.stdout.write(s),
          () => process.stdout.columns ?? 80,
        )
      : null;

  const unsubscribe = opts.agent.subscribe((event) => {
    switch (event.type) {
      case "message_update": {
        const ev = event.assistantMessageEvent;
        if (ev && (ev as { type?: string }).type === "text_delta") {
          const delta = String((ev as { delta?: string }).delta ?? "");
          if (streamer) streamer.push(delta);
          else process.stdout.write(delta);
        }
        break;
      }
      case "turn_end":
        if (streamer) streamer.flush();
        else process.stdout.write("\n");
        break;
      case "tool_execution_start":
        streamer?.flush();
        process.stdout.write(`\n[tool] ${event.toolName} starting…\n`);
        break;
      case "tool_execution_end":
        process.stdout.write(`[tool] ${event.toolName} ${event.isError ? "ERROR" : "ok"}\n`);
        break;
      default:
        break;
    }
  });

  const wantColor = process.stdout.isTTY === true && colorEnabled();
  const truecolor =
    process.env["COLORTERM"] === "truecolor" || process.env["COLORTERM"] === "24bit";
  const wordmark = wantColor
    ? truecolor
      ? "\x1b[1;38;2;148;163;184mEnter\x1b[0m"
      : "\x1b[1;37mEnter\x1b[0m"
    : "Enter";
  process.stdout.write(`${wordmark} — interactive mode. Type a message, or /help. /exit to quit.\n`);
  rl.prompt();

  let busy = false;
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      continue;
    }
    if (trimmed.startsWith("/")) {
      const res = await dispatchSlash(trimmed, opts.slashContext);
      if (res.exit) {
        rl.close();
        break;
      }
      rl.prompt();
      continue;
    }
    if (busy) {
      process.stdout.write("[busy, please wait]\n");
      rl.prompt();
      continue;
    }
    busy = true;
    try {
      await opts.agent.prompt(trimmed);
      await opts.agent.waitForIdle();
    } catch (err) {
      process.stderr.write(`[error] ${(err as Error).message}\n`);
    } finally {
      busy = false;
      rl.prompt();
    }
  }

  unsubscribe();
}
