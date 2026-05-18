import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { GitHubAppAuth } from "../auth/github-app.js";
import { parseRepoRef } from "../auth/github-app.js";
import type { WorktreeManager } from "../channels/worktree-mgr.js";

const InlineComment = Type.Object({
  path: Type.String({ minLength: 1, description: "Repo-relative file path the comment targets." }),
  line: Type.Integer({
    minimum: 1,
    description: "1-indexed line in the file (the RIGHT side of the diff by default).",
  }),
  side: Type.Optional(
    Type.Union([Type.Literal("LEFT"), Type.Literal("RIGHT")], {
      description: "Which side of the diff. Defaults to RIGHT (the new file).",
    }),
  ),
  body: Type.String({ minLength: 1 }),
});

const PrReviewParams = Type.Object({
  pr_number: Type.Integer({ minimum: 1 }),
  body: Type.String({
    minLength: 1,
    description: "Overall review body (markdown). Summarises findings.",
  }),
  event: Type.Optional(
    Type.Union([Type.Literal("COMMENT"), Type.Literal("REQUEST_CHANGES")], {
      description:
        "COMMENT (default, no approval signal) or REQUEST_CHANGES. APPROVE is disallowed — humans approve and merge.",
    }),
  ),
  comments: Type.Optional(
    Type.Array(InlineComment, {
      description: "Optional inline comments anchored to specific lines.",
    }),
  ),
});

type Params = Static<typeof PrReviewParams>;

export interface PrReviewOptions {
  channelKey: string;
  worktrees: WorktreeManager;
  auth: GitHubAppAuth;
  /** Optional: append a "Review by Enter — requested by …" footer to the review body. */
  requestedBy?: () => string;
}

export function githubPrReviewTool(options: PrReviewOptions): AgentTool<typeof PrReviewParams> {
  return {
    name: "github_pr_review",
    label: "Submit PR review",
    description:
      "Submit a pull-request review on the channel's currently-cloned repo. Use after `github_pr_fetch`. `event` is COMMENT (default) or REQUEST_CHANGES — APPROVE is disallowed because the bot never merges; humans approve. Inline comments anchor to (file, line) pairs.",
    parameters: PrReviewParams,
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

      const event = params.event ?? "COMMENT";

      const sections: string[] = [params.body];
      if (options.requestedBy) {
        sections.push("---", options.requestedBy());
      }
      const body = sections.join("\n\n");

      const inlineComments = (params.comments ?? []).map((c) => ({
        path: c.path,
        line: c.line,
        side: c.side ?? "RIGHT",
        body: c.body,
      }));

      const review = await octokit.pulls.createReview({
        owner: ref.owner,
        repo: ref.repo,
        pull_number: params.pr_number,
        body,
        event,
        ...(inlineComments.length > 0 ? { comments: inlineComments } : {}),
      });

      return {
        content: [
          {
            type: "text",
            text: `Submitted ${event} review on PR #${params.pr_number}: ${review.data.html_url} (${inlineComments.length} inline comment${inlineComments.length === 1 ? "" : "s"})`,
          },
        ],
        details: {
          id: review.data.id,
          url: review.data.html_url,
          state: review.data.state,
          event,
          pr_number: params.pr_number,
          inline_comments: inlineComments.length,
        },
      };
    },
  };
}
