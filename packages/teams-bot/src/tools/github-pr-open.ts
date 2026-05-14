import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { GitHubAppAuth } from "../auth/github-app.js";
import { parseRepoRef } from "../auth/github-app.js";
import type { WorktreeManager } from "../channels/worktree-mgr.js";

const PrOpenParams = Type.Object({
  title: Type.String({ minLength: 3, maxLength: 256 }),
  body: Type.String({ minLength: 1, description: "PR description. Include who in Teams requested this." }),
  head: Type.String({ description: "Branch to merge from (already pushed)." }),
  base: Type.Optional(Type.String({ description: "Branch to merge into. Defaults to 'main'." })),
  draft: Type.Optional(Type.Boolean()),
});

type Params = Static<typeof PrOpenParams>;

export interface PrOpenOptions {
  channelKey: string;
  worktrees: WorktreeManager;
  auth: GitHubAppAuth;
  /** Optional: prepend a "Requested by …" footer to every PR body. */
  requestedBy?: () => string;
}

export function githubPrOpenTool(options: PrOpenOptions): AgentTool<typeof PrOpenParams> {
  return {
    name: "github_pr_open",
    label: "Open PR",
    description:
      "Open a pull request on the channel's currently-cloned repo using the bot's GitHub App identity. The branch must already be pushed (use git_push first). Bot never merges; humans review and merge.",
    parameters: PrOpenParams,
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
      const octokit = await options.auth.octokitForRepo(ref);
      const body = options.requestedBy ? `${params.body}\n\n---\n${options.requestedBy()}` : params.body;
      const pr = await octokit.pulls.create({
        owner: ref.owner,
        repo: ref.repo,
        title: params.title,
        body,
        head: params.head,
        base: params.base ?? "main",
        ...(params.draft ? { draft: true } : {}),
      });
      return {
        content: [{ type: "text", text: `Opened PR #${pr.data.number}: ${pr.data.html_url}` }],
        details: {
          number: pr.data.number,
          url: pr.data.html_url,
          repo: state.repo,
          head: params.head,
          base: params.base ?? "main",
        },
      };
    },
  };
}
