import { spawn } from "node:child_process";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";

const SandboxedBashParams = Type.Object({
  command: Type.String({ description: "Shell command to run inside the channel's git worktree." }),
  timeout_ms: Type.Optional(Type.Integer({ minimum: 1000, maximum: 300_000 })),
});

type Params = Static<typeof SandboxedBashParams>;

const DEFAULT_DENYLIST = [
  "sudo",
  "rm -rf /",
  "shutdown",
  "reboot",
  "mkfs",
  "dd if=",
  "chmod 777 /",
  ":(){:|:&};:",
  "wget",
  "curl ", // we allow github.com via dedicated tools; raw curl is too easy to abuse
  "nc ",
  "ncat",
  "scp ",
  "ssh ",
];

export interface SandboxedBashOptions {
  cwdProvider: () => string | null;
  denylist?: string[];
  defaultTimeoutMs?: number;
}

export function sandboxedBashTool(options: SandboxedBashOptions): AgentTool<typeof SandboxedBashParams> {
  const deny = (options.denylist ?? DEFAULT_DENYLIST).map((d) => d.toLowerCase());
  const defaultTimeout = options.defaultTimeoutMs ?? 120_000;
  return {
    name: "sandboxed_bash",
    label: "Sandboxed shell",
    description:
      "Run a shell command inside the channel's per-channel git worktree. Working directory is pinned, network access is unrestricted but a denylist blocks sudo, raw curl/wget/ssh/scp, destructive rm, and similar. Use this for git operations (add, commit, branch), test runners, build tools.",
    parameters: SandboxedBashParams,
    executionMode: "sequential",
    execute: async (_id, params: Params, signal) => {
      const cwd = options.cwdProvider();
      if (!cwd) {
        return {
          content: [
            {
              type: "text",
              text: "No worktree for this channel yet. Use `git_clone` first.",
            },
          ],
          details: { error: "no_worktree" },
          isError: true,
        } as unknown as Awaited<ReturnType<NonNullable<AgentTool["execute"]>>>;
      }
      const cmdLower = params.command.toLowerCase();
      for (const banned of deny) {
        if (cmdLower.includes(banned)) {
          return {
            content: [{ type: "text", text: `Command refused: contains denied pattern "${banned}".` }],
            details: { error: "denylisted", pattern: banned },
            isError: true,
          };
        }
      }

      const isWindows = process.platform === "win32";
      const shellCmd = isWindows ? "powershell.exe" : "sh";
      const shellArgs = isWindows
        ? ["-NoProfile", "-NonInteractive", "-Command", params.command]
        : ["-lc", params.command];

      const timeoutMs = params.timeout_ms ?? defaultTimeout;
      let stdout = "";
      let stderr = "";

      const child = spawn(shellCmd, shellArgs, {
        cwd,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        windowsHide: true,
      });

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, timeoutMs);

      const onAbort = () => {
        try {
          child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (c: string) => (stdout += c));
      child.stderr.on("data", (c: string) => (stderr += c));

      const exitCode = await new Promise<number>((resolve, reject) => {
        child.on("error", reject);
        child.on("close", (code) => resolve(code ?? -1));
      }).finally(() => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      });

      const text =
        `exit ${exitCode}${timedOut ? " (timed out)" : ""} cwd=${cwd}\n` +
        (stdout ? `--- stdout ---\n${stdout}` : "") +
        (stderr ? `--- stderr ---\n${stderr}` : "");

      return {
        content: [{ type: "text", text }],
        details: { exitCode, timedOut, cwd, stdoutBytes: stdout.length, stderrBytes: stderr.length },
        isError: exitCode !== 0,
      };
    },
  };
}
