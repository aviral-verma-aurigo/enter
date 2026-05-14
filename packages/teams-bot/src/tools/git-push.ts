import { simpleGit, type RemoteWithRefs } from "simple-git";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { GitHubAppAuth } from "../auth/github-app.js";
import { parseRepoRef } from "../auth/github-app.js";
import type { WorktreeManager } from "../channels/worktree-mgr.js";

const GitPushParams = Type.Object({
  branch: Type.String({ minLength: 1, description: "Branch name to push (e.g. 'enter/health-endpoint')." }),
  set_upstream: Type.Optional(Type.Boolean({ description: "Push with --set-upstream (default true on first push)." })),
});

type Params = Static<typeof GitPushParams>;

export interface GitPushOptions {
  channelKey: string;
  worktrees: WorktreeManager;
  auth: GitHubAppAuth;
}

export function gitPushTool(options: GitPushOptions): AgentTool<typeof GitPushParams> {
  return {
    name: "git_push",
    label: "Push branch",
    description:
      "Push a branch to the remote using the bot's GitHub App credentials. The branch must already exist locally (use sandboxed_bash with `git checkout -b` and `git commit` first).",
    parameters: GitPushParams,
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
      const ref = parseRepoRef(state.repo);
      const token = await options.auth.tokenForRepo(ref);
      const remoteUrl = `https://x-access-token:${token}@github.com/${ref.owner}/${ref.repo}.git`;

      const git = simpleGit({ baseDir: state.path });
      // Re-write origin to embed the token for this push only, then restore.
      const currentRemote = (await git.getRemotes(true)).find((r: RemoteWithRefs) => r.name === "origin");
      const originalUrl = currentRemote?.refs.push ?? currentRemote?.refs.fetch ?? "";
      try {
        await git.remote(["set-url", "origin", remoteUrl]);
        const pushArgs = [params.set_upstream !== false ? "--set-upstream" : "", "origin", params.branch].filter(Boolean);
        const result = await git.raw(["push", ...pushArgs]);
        return {
          content: [{ type: "text", text: `Pushed ${params.branch} to ${ref.owner}/${ref.repo}.\n${result}` }],
          details: { branch: params.branch, repo: state.repo },
        };
      } finally {
        if (originalUrl) {
          await git.remote(["set-url", "origin", originalUrl]).catch(() => undefined);
        }
      }
    },
  };
}
