import type { AgentTool } from "@earendil-works/pi-agent-core";
import { spawn } from "node:child_process";
import {
  buildAdoTools,
  buildConfluenceTools,
  buildAhaTools,
  type EntraServicePrincipalAuth,
  type AtlassianAuthorizer,
  type AhaAuthorizer,
} from "@enter/core";
import type { GitHubAppAuth } from "../auth/github-app.js";
import type { WorktreeManager } from "../channels/worktree-mgr.js";
import { gitCloneTool } from "./git-clone.js";
import { gitPushTool } from "./git-push.js";
import { githubPrOpenTool } from "./github-pr-open.js";
import { githubPrCommentTool } from "./github-pr-comment.js";
import { githubPrFetchTool } from "./github-pr-fetch.js";
import { githubPrReviewTool } from "./github-pr-review.js";
import { sandboxedBashTool } from "./sandboxed-bash.js";
import { runTestsTool } from "./run-tests.js";

export interface BuildBotToolsOptions {
  channelKey: string;
  worktrees: WorktreeManager;
  auth: GitHubAppAuth | null;
  adoAuth: EntraServicePrincipalAuth | null;
  adoOrgUrl: string | null;
  confluenceAuth: AtlassianAuthorizer | null;
  confluenceBaseUrl: string | null;
  ahaAuth: AhaAuthorizer | null;
  ahaBaseUrl: string | null;
  requestedBy: () => string;
  allowedRepos: string[];
  /** Called when a clone completes so the bot can mutate ctx.cwd. */
  onCloned: (worktreePath: string) => void;
}

export function buildBotTools(options: BuildBotToolsOptions): AgentTool[] {
  const cwdProvider = () => options.worktrees.get(options.channelKey)?.path ?? null;
  const tools: AgentTool[] = [];

  const bash = sandboxedBashTool({ cwdProvider });
  tools.push(bash);

  // run_tests delegates to a thin bash runner so we don't duplicate spawn logic.
  tools.push(
    runTestsTool({
      channelKey: options.channelKey,
      worktrees: options.worktrees,
      bashRunner: async (command, timeoutMs) => runShell(command, cwdProvider() ?? process.cwd(), timeoutMs),
    }),
  );

  if (options.auth) {
    tools.push(
      gitCloneTool({
        channelKey: options.channelKey,
        worktrees: options.worktrees,
        auth: options.auth,
        ...(options.onCloned ? { onCloned: options.onCloned } : {}),
        ...(options.allowedRepos.length > 0 ? { allowedRepos: options.allowedRepos } : {}),
      }),
      gitPushTool({
        channelKey: options.channelKey,
        worktrees: options.worktrees,
        auth: options.auth,
      }),
      githubPrOpenTool({
        channelKey: options.channelKey,
        worktrees: options.worktrees,
        auth: options.auth,
        requestedBy: options.requestedBy,
        // Auto-link ADO work items when both an ADO authorizer and org URL are configured.
        ...(options.adoAuth ? { adoAuth: options.adoAuth } : {}),
        ...(options.adoOrgUrl ? { adoOrgUrl: options.adoOrgUrl } : {}),
      }),
      githubPrCommentTool({
        channelKey: options.channelKey,
        worktrees: options.worktrees,
        auth: options.auth,
      }),
      githubPrFetchTool({
        channelKey: options.channelKey,
        worktrees: options.worktrees,
        auth: options.auth,
      }),
      githubPrReviewTool({
        channelKey: options.channelKey,
        worktrees: options.worktrees,
        auth: options.auth,
        requestedBy: options.requestedBy,
      }),
    );
  }

  if (options.confluenceAuth && options.confluenceBaseUrl) {
    tools.push(
      ...buildConfluenceTools({
        auth: options.confluenceAuth,
        baseUrl: options.confluenceBaseUrl,
        requestedBy: options.requestedBy,
      }),
    );
  }

  if (options.adoAuth && options.adoOrgUrl) {
    tools.push(
      ...buildAdoTools({
        auth: options.adoAuth,
        orgUrl: options.adoOrgUrl,
        requestedBy: options.requestedBy,
      }),
    );
  }

  if (options.ahaAuth && options.ahaBaseUrl) {
    tools.push(
      ...buildAhaTools({
        auth: options.ahaAuth,
        baseUrl: options.ahaBaseUrl,
        requestedBy: options.requestedBy,
      }),
    );
  }

  return tools;
}

async function runShell(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
  const isWindows = process.platform === "win32";
  const shellCmd = isWindows ? "powershell.exe" : "sh";
  const shellArgs = isWindows
    ? ["-NoProfile", "-NonInteractive", "-Command", command]
    : ["-lc", command];

  let stdout = "";
  let stderr = "";
  let timedOut = false;
  const child = spawn(shellCmd, shellArgs, {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    windowsHide: true,
  });
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }, timeoutMs);
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (c: string) => (stdout += c));
  child.stderr.on("data", (c: string) => (stderr += c));
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? -1));
  }).finally(() => clearTimeout(timer));
  return { exitCode, stdout, stderr, timedOut };
}
