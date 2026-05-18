import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { githubPrOpenTool } from "../src/tools/github-pr-open.js";
import { githubPrCommentTool } from "../src/tools/github-pr-comment.js";
import { WorktreeManager } from "../src/channels/worktree-mgr.js";
import type { GitHubAppAuth } from "../src/auth/github-app.js";

let tmpDir: string;
let worktrees: WorktreeManager;
let pullsCreate: ReturnType<typeof vi.fn>;
let issuesCreateComment: ReturnType<typeof vi.fn>;
let fakeAuth: GitHubAppAuth;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "enter-ghpr-"));
  worktrees = new WorktreeManager(tmpDir);

  pullsCreate = vi.fn(async (args: Record<string, unknown>) => ({
    data: {
      number: 42,
      html_url: `https://github.com/${args["owner"]}/${args["repo"]}/pull/42`,
    },
  }));
  issuesCreateComment = vi.fn(async () => ({
    data: { html_url: "https://github.com/acme/foo/issues/42#issuecomment-1" },
  }));

  fakeAuth = {
    async octokitForRepo() {
      return {
        pulls: { create: pullsCreate },
        issues: { createComment: issuesCreateComment },
      } as never;
    },
    async tokenForRepo() {
      return "fake-installation-token";
    },
  } as unknown as GitHubAppAuth;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("github_pr_open", () => {
  it("refuses cleanly when the channel has no worktree", async () => {
    const tool = githubPrOpenTool({ channelKey: "ch1", worktrees, auth: fakeAuth });
    const r = await tool.execute("t1", {
      title: "Fix the thing",
      body: "Body.",
      head: "enter/fix",
    });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/no worktree/i);
    expect(pullsCreate).not.toHaveBeenCalled();
  });

  it("opens a PR with the right owner/repo/head/base", async () => {
    worktrees.register("ch1", {
      path: path.join(tmpDir, "ch1", "main"),
      repo: "acme/foo",
      ref: "main",
    });
    const tool = githubPrOpenTool({ channelKey: "ch1", worktrees, auth: fakeAuth });
    const r = await tool.execute("t1", {
      title: "Fix",
      body: "Fixes a bug.",
      head: "enter/fix-1",
    });
    expect(r.isError).toBeUndefined();
    expect(pullsCreate).toHaveBeenCalledOnce();
    const args = pullsCreate.mock.calls[0]![0] as {
      owner: string;
      repo: string;
      head: string;
      base: string;
      title: string;
      body: string;
    };
    expect(args.owner).toBe("acme");
    expect(args.repo).toBe("foo");
    expect(args.head).toBe("enter/fix-1");
    expect(args.base).toBe("main"); // default
    expect(args.title).toBe("Fix");
    expect(args.body).toBe("Fixes a bug.");
    expect(r.content[0]?.text).toContain("PR #42");
    expect(r.content[0]?.text).toContain("https://github.com/acme/foo/pull/42");
  });

  it("appends a requestedBy footer to the PR body when provided", async () => {
    worktrees.register("ch1", {
      path: path.join(tmpDir, "ch1", "main"),
      repo: "acme/foo",
      ref: "main",
    });
    const tool = githubPrOpenTool({
      channelKey: "ch1",
      worktrees,
      auth: fakeAuth,
      requestedBy: () => "Requested by Aviral in #engineering",
    });
    await tool.execute("t1", {
      title: "T",
      body: "Original body.",
      head: "enter/x",
    });
    const args = pullsCreate.mock.calls[0]![0] as { body: string };
    expect(args.body).toContain("Original body.");
    expect(args.body).toContain("---");
    expect(args.body).toContain("Requested by Aviral in #engineering");
  });

  it("honors the draft flag and custom base", async () => {
    worktrees.register("ch1", {
      path: path.join(tmpDir, "ch1", "main"),
      repo: "acme/foo",
      ref: "main",
    });
    const tool = githubPrOpenTool({ channelKey: "ch1", worktrees, auth: fakeAuth });
    await tool.execute("t1", {
      title: "T",
      body: "B",
      head: "enter/draft",
      base: "develop",
      draft: true,
    });
    const args = pullsCreate.mock.calls[0]![0] as { base: string; draft?: boolean };
    expect(args.base).toBe("develop");
    expect(args.draft).toBe(true);
  });

  it("auto-detects AB#NNNN references in title+body and injects ADO URLs (no adoAuth = body only, no API call)", async () => {
    worktrees.register("ch1", {
      path: path.join(tmpDir, "ch1", "main"),
      repo: "acme/foo",
      ref: "main",
    });
    const tool = githubPrOpenTool({
      channelKey: "ch1",
      worktrees,
      auth: fakeAuth,
      adoOrgUrl: "https://dev.azure.com/acme-org",
    });
    const r = await tool.execute("t1", {
      title: "Fix login (AB#1234)",
      body: "Closes AB#1234. Related to AB#5678.",
      head: "enter/fix-login",
    });
    expect(r.isError).toBeUndefined();
    const args = pullsCreate.mock.calls[0]![0] as { body: string };
    expect(args.body).toContain("### Linked ADO work items");
    expect(args.body).toContain("[AB#1234](https://dev.azure.com/acme-org/_workitems/edit/1234)");
    expect(args.body).toContain("[AB#5678](https://dev.azure.com/acme-org/_workitems/edit/5678)");
    const details = r.details as { adoWorkItems: number[]; adoLinkResults: unknown[] };
    expect(details.adoWorkItems).toEqual([1234, 5678]);
    expect(details.adoLinkResults).toEqual([]); // no adoAuth → no PATCH attempted
  });

  it("posts Hyperlink relations back to each ADO work item when adoAuth is provided", async () => {
    worktrees.register("ch1", {
      path: path.join(tmpDir, "ch1", "main"),
      repo: "acme/foo",
      ref: "main",
    });
    // Stub fetch for the ADO PATCH calls
    const fetchCalls: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      async (url: string, init: { method?: string; body?: string }) => {
        fetchCalls.push({
          url,
          method: init.method ?? "GET",
          body: init.body !== undefined ? JSON.parse(init.body) : undefined,
        });
        return {
          ok: true,
          status: 200,
          async text() {
            return "{}";
          },
        } as unknown as Response;
      },
    );

    const adoAuth = {
      async getAuthHeader() {
        return "Basic fake";
      },
    };
    const tool = githubPrOpenTool({
      channelKey: "ch1",
      worktrees,
      auth: fakeAuth,
      adoOrgUrl: "https://dev.azure.com/acme-org",
      adoAuth,
    });
    const r = await tool.execute("t1", {
      title: "Implement AB#1234",
      body: "Done.",
      head: "enter/x",
    });
    expect(r.isError).toBeUndefined();
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.method).toBe("PATCH");
    expect(fetchCalls[0]!.url).toMatch(/_apis\/wit\/workitems\/1234/);
    const patch = fetchCalls[0]!.body as Array<{ op: string; value: { rel: string; url: string } }>;
    expect(patch[0]!.value.rel).toBe("Hyperlink");
    expect(patch[0]!.value.url).toBe("https://github.com/acme/foo/pull/42");
    const details = r.details as { adoLinkResults: Array<{ id: number; ok: boolean }> };
    expect(details.adoLinkResults).toEqual([{ id: 1234, ok: true }]);
    vi.unstubAllGlobals();
  });

  it("PR open succeeds even when ADO link calls fail (best-effort)", async () => {
    worktrees.register("ch1", {
      path: path.join(tmpDir, "ch1", "main"),
      repo: "acme/foo",
      ref: "main",
    });
    vi.stubGlobal(
      "fetch",
      async () =>
        ({
          ok: false,
          status: 403,
          async text() {
            return "Forbidden";
          },
        }) as unknown as Response,
    );
    const adoAuth = {
      async getAuthHeader() {
        return "Basic fake";
      },
    };
    const tool = githubPrOpenTool({
      channelKey: "ch1",
      worktrees,
      auth: fakeAuth,
      adoOrgUrl: "https://dev.azure.com/acme-org",
      adoAuth,
    });
    const r = await tool.execute("t1", {
      title: "AB#999",
      body: "x",
      head: "h",
    });
    expect(r.isError).toBeUndefined(); // PR open is what matters
    const details = r.details as { adoLinkResults: Array<{ id: number; ok: boolean; status?: number }> };
    expect(details.adoLinkResults).toEqual([{ id: 999, ok: false, status: 403, error: "Forbidden" }]);
    vi.unstubAllGlobals();
  });

  it("no auto-link when adoOrgUrl is not configured (backward compat)", async () => {
    worktrees.register("ch1", {
      path: path.join(tmpDir, "ch1", "main"),
      repo: "acme/foo",
      ref: "main",
    });
    const tool = githubPrOpenTool({ channelKey: "ch1", worktrees, auth: fakeAuth }); // no adoOrgUrl
    await tool.execute("t1", {
      title: "AB#1234 fix",
      body: "Closes AB#1234.",
      head: "h",
    });
    const args = pullsCreate.mock.calls[0]![0] as { body: string };
    expect(args.body).not.toContain("Linked ADO work items");
    expect(args.body).not.toContain("_workitems/edit");
  });
});

describe("github_pr_comment", () => {
  it("refuses when the channel has no worktree", async () => {
    const tool = githubPrCommentTool({ channelKey: "ch1", worktrees, auth: fakeAuth });
    const r = await tool.execute("t1", { pr_number: 42, body: "Looks good." });
    expect(r.isError).toBe(true);
    expect(issuesCreateComment).not.toHaveBeenCalled();
  });

  it("comments on the PR via the issues endpoint (PRs are issues in GitHub)", async () => {
    worktrees.register("ch1", {
      path: path.join(tmpDir, "ch1", "main"),
      repo: "acme/foo",
      ref: "main",
    });
    const tool = githubPrCommentTool({ channelKey: "ch1", worktrees, auth: fakeAuth });
    const r = await tool.execute("t1", { pr_number: 99, body: "Ship it." });
    expect(r.isError).toBeUndefined();
    expect(issuesCreateComment).toHaveBeenCalledOnce();
    const args = issuesCreateComment.mock.calls[0]![0] as {
      owner: string;
      repo: string;
      issue_number: number;
      body: string;
    };
    expect(args.owner).toBe("acme");
    expect(args.repo).toBe("foo");
    expect(args.issue_number).toBe(99);
    expect(args.body).toBe("Ship it.");
  });
});
