import { spawn } from "node:child_process";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { getShell } from "../util/platform.js";
import { ToolError } from "../util/errors.js";
import type { ToolContext } from "./context.js";

const BashParams = Type.Object({
  command: Type.String({ description: "Shell command to run. Use full quoting; the command runs via the OS-native shell." }),
  timeout_ms: Type.Optional(Type.Integer({ minimum: 1000, maximum: 600_000 })),
  cwd: Type.Optional(Type.String()),
});

type Params = Static<typeof BashParams>;

export interface BashToolOptions {
  defaultTimeoutMs?: number;
  shellPreference?: "auto" | "powershell" | "cmd" | "bash";
  /** Restrict the working directory to a single root. Used by the bot's sandboxed_bash. */
  cwdRoot?: string;
  /** Optional command denylist (substring match, case-insensitive). */
  denylist?: string[];
}

export function bashTool(
  ctx: ToolContext,
  options: BashToolOptions = {},
): AgentTool<typeof BashParams> {
  const defaultTimeout = options.defaultTimeoutMs ?? 120_000;
  const shellChoice = getShell(options.shellPreference);
  const deny = (options.denylist ?? []).map((d) => d.toLowerCase());

  return {
    name: "bash",
    label: "Run shell command",
    description: "Execute a shell command and return stdout/stderr.",
    parameters: BashParams,
    execute: async (_id, params: Params, signal) => {
      const cmdLower = params.command.toLowerCase();
      for (const banned of deny) {
        if (cmdLower.includes(banned)) {
          throw new ToolError(`Command refused: contains denied pattern "${banned}".`);
        }
      }

      const requestedCwd = params.cwd ?? ctx.cwd;
      if (options.cwdRoot) {
        // Pin: requestedCwd must be within cwdRoot.
        const root = options.cwdRoot.replace(/\\/g, "/");
        const norm = requestedCwd.replace(/\\/g, "/");
        if (!norm.startsWith(root)) {
          throw new ToolError(`Refused cwd ${requestedCwd}: must be within ${options.cwdRoot}.`);
        }
      }

      const timeoutMs = params.timeout_ms ?? defaultTimeout;
      let stdout = "";
      let stderr = "";

      const child = spawn(shellChoice.cmd, shellChoice.args(params.command), {
        cwd: requestedCwd,
        env: process.env,
        windowsHide: true,
      });

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }, timeoutMs);

      const onAbort = () => {
        try {
          child.kill("SIGTERM");
        } catch {
          // ignore
        }
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });

      const exitCode = await new Promise<number>((resolve, reject) => {
        child.on("error", (err) => reject(err));
        child.on("close", (code) => resolve(code ?? -1));
      })
        .finally(() => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
        })
        .catch((err: unknown) => {
          throw new ToolError(`Failed to spawn shell`, err);
        });

      const text =
        `exit ${exitCode}${timedOut ? " (timed out)" : ""}\n` +
        (stdout ? `--- stdout ---\n${stdout}` : "") +
        (stderr ? `--- stderr ---\n${stderr}` : "");

      return {
        content: [{ type: "text", text }],
        details: { exitCode, timedOut, stdoutBytes: stdout.length, stderrBytes: stderr.length, cwd: requestedCwd },
      };
    },
  };
}
