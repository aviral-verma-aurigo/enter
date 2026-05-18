import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { GitHubAppAuth } from "../auth/github-app.js";
import { parseRepoRef } from "../auth/github-app.js";
import type { WorktreeManager } from "../channels/worktree-mgr.js";

const PrFetchParams = Type.Object({
  pr_number: Type.Integer({ minimum: 1 }),
  per_page: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 100,
      description: "Max files to return (GitHub caps at 100/page). Defaults to 30.",
    }),
  ),
});

type Params = Static<typeof PrFetchParams>;

export interface PrFetchOptions {
  channelKey: string;
  worktrees: WorktreeManager;
  auth: GitHubAppAuth;
}

export function githubPrFetchTool(options: PrFetchOptions): AgentTool<typeof PrFetchParams> {
  return {
    name: "github_pr_fetch",
    label: "Fetch PR for review",
    description:
      "Fetch a pull request's metadata and changed files (with patches) so the agent can review it. Returns title, body, state, base/head refs, and per-file diffs. Pair with `github_pr_review` to submit the review.",
    parameters: PrFetchParams,
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

      const pr = await octokit.pulls.get({
        owner: ref.owner,
        repo: ref.repo,
        pull_number: params.pr_number,
      });

      const files = await octokit.pulls.listFiles({
        owner: ref.owner,
        repo: ref.repo,
        pull_number: params.pr_number,
        per_page: params.per_page ?? 30,
      });

      const fileSummaries = files.data.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: f.patch ?? null,
        previous_filename: f.previous_filename ?? null,
      }));

      const text = [
        `PR #${pr.data.number}: ${pr.data.title}`,
        `State: ${pr.data.state}${pr.data.draft ? " (draft)" : ""}`,
        `Base: ${pr.data.base.ref} (${pr.data.base.sha.slice(0, 7)}) ← Head: ${pr.data.head.ref} (${pr.data.head.sha.slice(0, 7)})`,
        `Files: ${files.data.length} changed, +${pr.data.additions} -${pr.data.deletions}`,
        `URL: ${pr.data.html_url}`,
        "",
        "--- Description ---",
        pr.data.body ?? "(no description)",
      ].join("\n");

      return {
        content: [{ type: "text", text }],
        details: {
          number: pr.data.number,
          url: pr.data.html_url,
          state: pr.data.state,
          draft: pr.data.draft,
          title: pr.data.title,
          body: pr.data.body,
          base: { ref: pr.data.base.ref, sha: pr.data.base.sha },
          head: { ref: pr.data.head.ref, sha: pr.data.head.sha },
          additions: pr.data.additions,
          deletions: pr.data.deletions,
          changed_files: pr.data.changed_files,
          files: fileSummaries,
        },
      };
    },
  };
}
