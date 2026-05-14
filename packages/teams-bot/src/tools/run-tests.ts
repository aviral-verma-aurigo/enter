import fs from "node:fs/promises";
import path from "node:path";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { WorktreeManager } from "../channels/worktree-mgr.js";

const RunTestsParams = Type.Object({
  command: Type.Optional(Type.String({ description: "Override the auto-detected test command." })),
  timeout_ms: Type.Optional(Type.Integer({ minimum: 1000, maximum: 600_000 })),
});

type Params = Static<typeof RunTestsParams>;

export interface RunTestsOptions {
  channelKey: string;
  worktrees: WorktreeManager;
  bashRunner: (command: string, timeoutMs: number) => Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }>;
}

async function detectCommand(cwd: string): Promise<string | null> {
  const checks = [
    { file: "package.json", cmd: "npm test --silent" },
    { file: "pyproject.toml", cmd: "pytest -q" },
    { file: "Cargo.toml", cmd: "cargo test" },
    { file: "go.mod", cmd: "go test ./..." },
    { file: "pom.xml", cmd: "mvn -q test" },
    { file: "build.gradle", cmd: "gradle test --quiet" },
    { file: "Gemfile", cmd: "bundle exec rspec" },
  ];
  for (const { file, cmd } of checks) {
    try {
      await fs.access(path.join(cwd, file));
      return cmd;
    } catch {
      // not present
    }
  }
  return null;
}

export function runTestsTool(options: RunTestsOptions): AgentTool<typeof RunTestsParams> {
  return {
    name: "run_tests",
    label: "Run tests",
    description:
      "Detect and run the project's test suite inside the channel worktree. Auto-detects npm/pytest/cargo/go/maven/gradle/bundler. Pass `command` to override.",
    parameters: RunTestsParams,
    executionMode: "sequential",
    execute: async (_id, params: Params) => {
      const state = options.worktrees.get(options.channelKey);
      if (!state) {
        return {
          content: [{ type: "text", text: "No worktree for this channel — clone first." }],
          details: { error: "no_worktree" },
          isError: true,
        };
      }
      const cmd = params.command ?? (await detectCommand(state.path));
      if (!cmd) {
        return {
          content: [
            {
              type: "text",
              text: "Could not detect a test runner from the worktree. Pass `command` explicitly.",
            },
          ],
          details: { error: "no_test_runner_detected" },
          isError: true,
        };
      }
      const result = await options.bashRunner(cmd, params.timeout_ms ?? 300_000);
      const text =
        `command: ${cmd}\nexit ${result.exitCode}${result.timedOut ? " (timed out)" : ""}\n` +
        (result.stdout ? `--- stdout ---\n${result.stdout}` : "") +
        (result.stderr ? `--- stderr ---\n${result.stderr}` : "");
      return {
        content: [{ type: "text", text }],
        details: { command: cmd, exitCode: result.exitCode, timedOut: result.timedOut },
        isError: result.exitCode !== 0,
      };
    },
  };
}
