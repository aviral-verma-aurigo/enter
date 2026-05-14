import {
  Container,
  Editor,
  Loader,
  ProcessTerminal,
  Text,
  TUI,
} from "@earendil-works/pi-tui";
import type { Agent } from "@earendil-works/pi-agent-core";
import { color, colorize } from "../tui/color.js";
import { editorTheme } from "../tui/theme.js";
import { Transcript } from "../tui/transcript.js";
import { Rule } from "../tui/rule.js";
import { dispatchSlash, type SlashContext } from "../slash/index.js";

export interface TuiOptions {
  agent: Agent;
  slashContext: SlashContext;
  modelLabel: string;
  cwd: string;
}

const C_HEADER = colorize(color.bold);
const C_DIM = colorize(color.dim);
const C_SPINNER = colorize(color.cyan);

/**
 * Rich interactive mode. Layout (top to bottom):
 *
 *   Enter · anthropic/claude-opus-4-7 · session 01KR…  (header)
 *   ──────────────────────────────────────────────────
 *   ◆ Hello from Enter.                                  (transcript)
 *   » what time is it?
 *   ◆ It's 2026-05-13 …                                  (assistant streaming)
 *   · read ok                                            (tool events)
 *   ──────────────────────────────────────────────────
 *   ⠋ thinking…                                          (loader; hidden when idle)
 *   » █ _input editor_
 */
export async function runTuiMode(opts: TuiOptions): Promise<void> {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal, /* showHardwareCursor */ true);

  const headerLine = C_HEADER("Enter") + C_DIM(` · ${opts.modelLabel} · session ${opts.slashContext.sessionId}`);
  const header = new Text(headerLine, 1, 0);

  const transcript = new Transcript();

  const loader = new Loader(tui, C_SPINNER, C_DIM, "idle", { frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], intervalMs: 80 });
  loader.start(); // we'll toggle by message

  const editor = new Editor(tui, editorTheme(), { paddingX: 1 });

  const container = new Container();
  container.addChild(header);
  container.addChild(new Rule());
  container.addChild(transcript);
  container.addChild(new Rule());
  container.addChild(loader);
  container.addChild(new Rule());
  container.addChild(editor);
  tui.addChild(container);
  tui.setFocus(editor);

  let busy = false;
  let pendingPromise: Promise<void> | null = null;
  let shouldExit = false;
  let exitResolver: (() => void) | null = null;

  const setBusy = (b: boolean, message?: string) => {
    busy = b;
    loader.setMessage(b ? (message ?? "thinking…") : C_DIM("idle"));
    tui.requestRender();
  };

  const writeAndRender = (fn: () => void) => {
    fn();
    tui.requestRender();
  };

  const unsubscribe = opts.agent.subscribe((event) => {
    switch (event.type) {
      case "message_update": {
        const ev = event.assistantMessageEvent as unknown as { type?: string; delta?: string };
        if (ev?.type === "text_delta" && typeof ev.delta === "string") {
          writeAndRender(() => transcript.appendToAssistant(ev.delta as string));
        }
        break;
      }
      case "turn_end":
        writeAndRender(() => transcript.endAssistant());
        break;
      case "tool_execution_start":
        writeAndRender(() => {
          transcript.endAssistant();
          transcript.pushToolStart(event.toolName);
        });
        setBusy(true, `running ${event.toolName}…`);
        break;
      case "tool_execution_end":
        writeAndRender(() => transcript.pushToolEnd(event.toolName, event.isError));
        setBusy(true, "thinking…");
        break;
      default:
        break;
    }
  });

  // Bootstrap a friendly opener and instructions in the transcript.
  transcript.pushSystem("Welcome to Enter. Type a message — or /help for slash commands. Ctrl+C twice to quit.");
  setBusy(false);

  editor.onSubmit = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    editor.setText("");
    editor.addToHistory(trimmed);

    if (trimmed.startsWith("/")) {
      transcript.pushUser(trimmed);
      void dispatchSlash(trimmed, {
        ...opts.slashContext,
        out: makeBufferedWriter((line) => transcript.pushSystem(line)),
      }).then((res) => {
        tui.requestRender();
        if (res.exit) shutdown();
      });
      return;
    }

    if (busy) {
      transcript.pushSystem("(agent is busy — please wait)");
      tui.requestRender();
      return;
    }

    transcript.pushUser(trimmed);
    setBusy(true, "thinking…");
    pendingPromise = (async () => {
      try {
        await opts.agent.prompt(trimmed);
        await opts.agent.waitForIdle();
      } catch (err) {
        transcript.pushError((err as Error).message);
      } finally {
        setBusy(false);
        pendingPromise = null;
      }
    })();
  };

  // Double Ctrl+C to exit. First Ctrl+C aborts a running turn; second exits.
  let ctrlCArmed = false;
  let armTimer: NodeJS.Timeout | null = null;
  const removeInput = tui.addInputListener((data) => {
    if (data === "") {
      if (busy) {
        opts.agent.abort();
        transcript.pushSystem("Aborted current turn.");
        setBusy(false);
        return { consume: true };
      }
      if (ctrlCArmed) {
        shutdown();
        return { consume: true };
      }
      ctrlCArmed = true;
      transcript.pushSystem("Press Ctrl+C again to exit.");
      tui.requestRender();
      if (armTimer) clearTimeout(armTimer);
      armTimer = setTimeout(() => {
        ctrlCArmed = false;
        tui.requestRender();
      }, 2000);
      return { consume: true };
    }
    return undefined;
  });

  const shutdown = () => {
    shouldExit = true;
    if (armTimer) clearTimeout(armTimer);
    removeInput();
    unsubscribe();
    loader.stop();
    tui.stop();
    if (exitResolver) exitResolver();
  };

  tui.start();

  // Wait until shutdown() runs.
  await new Promise<void>((resolve) => {
    exitResolver = resolve;
    if (shouldExit) resolve();
  });

  // If a turn is still running, give it a beat to settle (we already aborted on ctrlC).
  if (pendingPromise) {
    try {
      await Promise.race([pendingPromise, sleep(500)]);
    } catch {
      /* ignore */
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * SlashContext expects a NodeJS.WritableStream for output, but in TUI mode we want
 * each `write()` line to flow into the transcript. This wrapper buffers writes
 * and emits whole lines via the callback.
 */
function makeBufferedWriter(emit: (line: string) => void): NodeJS.WritableStream {
  let buf = "";
  const writable = {
    write(chunk: string | Uint8Array, _encoding?: unknown, cb?: (err?: Error | null) => void): boolean {
      buf += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      let nl = buf.indexOf("\n");
      while (nl !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.length > 0) emit(line);
        nl = buf.indexOf("\n");
      }
      cb?.();
      return true;
    },
    end(chunk?: string | Uint8Array): boolean {
      if (chunk) writable.write(chunk);
      if (buf.length > 0) {
        emit(buf);
        buf = "";
      }
      return true;
    },
  };
  // Make TypeScript happy — we don't need the full WritableStream surface for slash output.
  return writable as unknown as NodeJS.WritableStream;
}
