import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
  adoWorkItemUrl,
  extractAdoWorkItemIds,
  linkPrToWorkItem,
  type AdoAuthorizer,
} from "@enter/core";
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
  /**
   * Enables ADO auto-linking. When both are provided, the tool:
   *   1. scans the PR title + body for `AB#NNNN` references,
   *   2. injects an ADO link section into the PR body, and
   *   3. (best-effort) creates a Hyperlink relation on each work item
   *      pointing at the new PR.
   */
  adoOrgUrl?: string;
  adoAuth?: AdoAuthorizer;
}

export function githubPrOpenTool(options: PrOpenOptions): AgentTool<typeof PrOpenParams> {
  return {
    name: "github_pr_open",
    label: "Open PR",
    description:
      "Open a pull request on the channel's currently-cloned repo using the bot's GitHub App identity. The branch must already be pushed (use git_push first). Auto-detects `AB#NNNN` references in the title/body and links the PR back to the matching ADO work items. Bot never merges; humans review and merge.",
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

      // 1. Detect ADO work-item references in title + body.
      const adoIds =
        options.adoOrgUrl !== undefined
          ? extractAdoWorkItemIds(`${params.title}\n${params.body}`)
          : [];

      // 2. Assemble the PR body — original + ADO link section + requestedBy footer.
      const sections: string[] = [params.body];
      if (adoIds.length > 0 && options.adoOrgUrl) {
        const links = adoIds.map((id) => `- [AB#${id}](${adoWorkItemUrl(options.adoOrgUrl!, id)})`);
        sections.push("### Linked ADO work items", links.join("\n"));
      }
      if (options.requestedBy) {
        sections.push("---", options.requestedBy());
      }
      const body = sections.join("\n\n");

      // 3. Open the PR.
      const octokit = await options.auth.octokitForRepo(ref);
      const pr = await octokit.pulls.create({
        owner: ref.owner,
        repo: ref.repo,
        title: params.title,
        body,
        head: params.head,
        base: params.base ?? "main",
        ...(params.draft ? { draft: true } : {}),
      });

      // 4. Back-link to each ADO work item (best-effort — PR open is the authoritative action).
      const adoLinkResults: Array<{ id: number; ok: boolean; status?: number; error?: string }> = [];
      if (adoIds.length > 0 && options.adoAuth && options.adoOrgUrl) {
        for (const id of adoIds) {
          try {
            const r = await linkPrToWorkItem(
              { auth: options.adoAuth, orgUrl: options.adoOrgUrl, requestedBy: options.requestedBy ?? (() => "the bot") },
              id,
              pr.data.html_url,
              `PR opened by ${options.requestedBy ? options.requestedBy() : "the bot"}`,
            );
            adoLinkResults.push({ id, ...r });
          } catch (err) {
            adoLinkResults.push({ id, ok: false, error: (err as Error).message });
          }
        }
      }

      const linkSummary =
        adoIds.length > 0
          ? `\nADO links: ${adoLinkResults
              .map((r) => `AB#${r.id}=${r.ok ? "ok" : `err(${r.status ?? "n/a"})`}`)
              .join(", ")}`
          : "";

      return {
        content: [
          {
            type: "text",
            text: `Opened PR #${pr.data.number}: ${pr.data.html_url}${linkSummary}`,
          },
        ],
        details: {
          number: pr.data.number,
          url: pr.data.html_url,
          repo: state.repo,
          head: params.head,
          base: params.base ?? "main",
          adoWorkItems: adoIds,
          adoLinkResults,
        },
      };
    },
  };
}
