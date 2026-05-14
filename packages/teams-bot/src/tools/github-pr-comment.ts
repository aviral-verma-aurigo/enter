import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { GitHubAppAuth } from "../auth/github-app.js";
import { parseRepoRef } from "../auth/github-app.js";
import type { WorktreeManager } from "../channels/worktree-mgr.js";

const PrCommentParams = Type.Object({
  pr_number: Type.Integer({ minimum: 1 }),
  body: Type.String({ minLength: 1 }),
});

type Params = Static<typeof PrCommentParams>;

export interface PrCommentOptions {
  channelKey: string;
  worktrees: WorktreeManager;
  auth: GitHubAppAuth;
}

export function githubPrCommentTool(options: PrCommentOptions): AgentTool<typeof PrCommentParams> {
  return {
    name: "github_pr_comment",
    label: "Comment on PR",
    description: "Add a comment to an existing pull request on the channel's currently-cloned repo.",
    parameters: PrCommentParams,
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
      const comment = await octokit.issues.createComment({
        owner: ref.owner,
        repo: ref.repo,
        issue_number: params.pr_number,
        body: params.body,
      });
      return {
        content: [{ type: "text", text: `Commented on PR #${params.pr_number}: ${comment.data.html_url}` }],
        details: { url: comment.data.html_url, pr_number: params.pr_number },
      };
    },
  };
}
