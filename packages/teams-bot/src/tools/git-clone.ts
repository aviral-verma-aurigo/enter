import fs from "node:fs/promises";
import { simpleGit } from "simple-git";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { GitHubAppAuth } from "../auth/github-app.js";
import { parseRepoRef } from "../auth/github-app.js";
import type { WorktreeManager } from "../channels/worktree-mgr.js";

const GitCloneParams = Type.Object({
  repo: Type.String({ description: "Repo reference like 'owner/name' or a full GitHub URL." }),
  ref: Type.Optional(Type.String({ description: "Branch, tag, or commit. Defaults to the default branch." })),
});

type Params = Static<typeof GitCloneParams>;

export interface GitCloneOptions {
  channelKey: string;
  worktrees: WorktreeManager;
  auth: GitHubAppAuth;
  onCloned?: (worktreePath: string) => void;
  /** Optional allowlist of `owner/name` strings. Empty means open. */
  allowedRepos?: string[];
}

export function gitCloneTool(options: GitCloneOptions): AgentTool<typeof GitCloneParams> {
  return {
    name: "git_clone",
    label: "Clone repo",
    description:
      "Clone a GitHub repo into this channel's ephemeral worktree using the bot's GitHub App credentials. Sets the working directory for subsequent read/edit/sandboxed_bash calls. Only repos with the App installed are reachable.",
    parameters: GitCloneParams,
    executionMode: "sequential",
    execute: async (_id, params: Params) => {
      const ref = parseRepoRef(params.repo);
      if (options.allowedRepos && options.allowedRepos.length > 0) {
        const key = `${ref.owner}/${ref.repo}`;
        if (!options.allowedRepos.includes(key)) {
          return {
            content: [{ type: "text", text: `Repo '${key}' is not in the bot's allowlist.` }],
            details: { error: "repo_not_allowed", repo: key },
            isError: true,
          };
        }
      }
      const targetPath = options.worktrees.pathFor(options.channelKey, params.ref ?? "main");
      // Wipe any prior worktree for the same path to keep it deterministic.
      await fs.rm(targetPath, { recursive: true, force: true });
      await fs.mkdir(targetPath, { recursive: true });

      const token = await options.auth.tokenForRepo(ref);
      const cloneUrl = `https://x-access-token:${token}@github.com/${ref.owner}/${ref.repo}.git`;

      const git = simpleGit({ baseDir: targetPath });
      const cloneArgs: string[] = [];
      if (params.ref) cloneArgs.push("--branch", params.ref);
      await git.clone(cloneUrl, targetPath, ["--depth", "1", ...cloneArgs]);

      options.worktrees.register(options.channelKey, {
        path: targetPath,
        repo: `${ref.owner}/${ref.repo}`,
        ref: params.ref ?? "main",
      });
      options.onCloned?.(targetPath);

      return {
        content: [
          {
            type: "text",
            text: `Cloned ${ref.owner}/${ref.repo}@${params.ref ?? "default"} into ${targetPath}.`,
          },
        ],
        details: { path: targetPath, repo: `${ref.owner}/${ref.repo}`, ref: params.ref ?? "default" },
      };
    },
  };
}
