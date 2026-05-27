import type { Agent } from "@earendil-works/pi-agent-core";
import { toolPreview } from "../tui/tool-preview.js";

export interface PrintModeOptions {
  prompt: string;
  agent: Agent;
}

/**
 * Headless mode: send a single prompt, wait for the agent to settle,
 * print final assistant text to stdout, return final text length.
 */
export async function runPrintMode(opts: PrintModeOptions): Promise<{ finalText: string; turns: number }> {
  let finalText = "";
  let turns = 0;
  let pendingToolName = "";

  const unsubscribe = opts.agent.subscribe((event) => {
    switch (event.type) {
      case "turn_end": {
        turns += 1;
        const msg = event.message;
        if (Array.isArray(msg.content)) {
          const parts: string[] = [];
          for (const block of msg.content) {
            if (block && (block as { type?: string }).type === "text") {
              parts.push(String((block as { text?: string }).text ?? ""));
            }
          }
          if (parts.length > 0) finalText = parts.join("");
        }
        break;
      }
      case "tool_execution_start": {
        pendingToolName = event.toolName;
        const preview = toolPreview(event.toolName, event.args);
        const detail = preview ? `  ${preview}` : "";
        process.stderr.write(`[tool] ${pendingToolName}${detail}\n`);
        break;
      }
      case "tool_execution_end":
        process.stderr.write(`[tool] ${event.toolName} ${event.isError ? "✗" : "✓"}\n`);
        break;
      default:
        break;
    }
  });

  try {
    await opts.agent.prompt(opts.prompt);
    await opts.agent.waitForIdle();
  } finally {
    unsubscribe();
  }

  if (finalText) {
    process.stdout.write(finalText + "\n");
  } else {
    process.stdout.write("(no assistant text produced)\n");
  }
  return { finalText, turns };
}
