import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { githubPrOpenTool } from "../src/tools/github-pr-open.js";
import { githubPrCommentTool } from "../src/tools/github-pr-comment.js";
import { githubPrFetchTool } from "../src/tools/github-pr-fetch.js";
import { githubPrReviewTool } from "../src/tools/github-pr-review.js";
import { WorktreeManager } from "../src/channels/worktree-mgr.js";
import type { GitHubAppAuth } from "../src/auth/github-app.js";

let tmpDir: string;
let worktrees: WorktreeManager;
let pullsCreate: ReturnType<typeof vi.fn>;
let issuesCreateComment: ReturnType<typeof vi.fn>;
let pullsGet: ReturnType<typeof vi.fn>;
let pullsListFiles: ReturnType<typeof vi.fn>;
let pullsCreateReview: ReturnType<typeof vi.fn>;
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
  pullsGet = vi.fn(async (args: Record<string, unknown>) => ({
    data: {
      number: args["pull_number"],
      title: "Fix retry state machine",
      body: "Closes AB#1234.",
      state: "open",
      draft: false,
      html_url: `https://github.com/${args["owner"]}/${args["repo"]}/pull/${args["pull_number"]}`,
      base: { ref: "main", sha: "abcdef0123456789" },
      head: { ref: "fix/retry", sha: "fedcba9876543210" },
      additions: 12,
      deletions: 3,
      changed_files: 2,
    },
  }));
  pullsListFiles = vi.fn(async () => ({
    data: [
      {
        filename: "src/retry.ts",
        status: "modified",
        additions: 10,
        deletions: 3,
        changes: 13,
        patch: "@@ -1,3 +1,10 @@\n-old\n+new",
      },
      {
        filename: "test/retry.test.ts",
        status: "added",
        additions: 2,
        deletions: 0,
        changes: 2,
        patch: "@@ -0,0 +1,2 @@\n+it('works')",
      },
    ],
  }));
  pullsCreateReview = vi.fn(async (args: Record<string, unknown>) => ({
    data: {
      id: 7777,
      html_url: `https://github.com/${args["owner"]}/${args["repo"]}/pull/${args["pull_number"]}#pullrequestreview-7777`,
      state: args["event"] === "REQUEST_CHANGES" ? "CHANGES_REQUESTED" : "COMMENTED",
    },
  }));

  fakeAuth = {
    async octokitForRepo() {
      return {
        pulls: {
          create: pullsCreate,
          get: pullsGet,
          listFiles: pullsListFiles,
          createReview: pullsCreateReview,
        },
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

describe("github_pr_fetch", () => {
  it("refuses when the channel has no worktree", async () => {
    const tool = githubPrFetchTool({ channelKey: "ch1", worktrees, auth: fakeAuth });
    const r = await tool.execute("t1", { pr_number: 42 });
    expect(r.isError).toBe(true);
    expect(pullsGet).not.toHaveBeenCalled();
    expect(pullsListFiles).not.toHaveBeenCalled();
  });

  it("returns PR metadata and per-file patches", async () => {
    worktrees.register("ch1", {
      path: path.join(tmpDir, "ch1", "main"),
      repo: "acme/foo",
      ref: "main",
    });
    const tool = githubPrFetchTool({ channelKey: "ch1", worktrees, auth: fakeAuth });
    const r = await tool.execute("t1", { pr_number: 99 });
    expect(r.isError).toBeUndefined();
    expect(pullsGet).toHaveBeenCalledOnce();
    expect(pullsListFiles).toHaveBeenCalledOnce();
    const listArgs = pullsListFiles.mock.calls[0]![0] as { per_page: number };
    expect(listArgs.per_page).toBe(30); // default

    const details = r.details as {
      number: number;
      base: { ref: string; sha: string };
      head: { ref: string };
      files: Array<{ filename: string; patch: string | null }>;
    };
    expect(details.number).toBe(99);
    expect(details.base.ref).toBe("main");
    expect(details.head.ref).toBe("fix/retry");
    expect(details.files).toHaveLength(2);
    expect(details.files[0]!.filename).toBe("src/retry.ts");
    expect(details.files[0]!.patch).toContain("@@");

    const text = r.content[0]?.text ?? "";
    expect(text).toContain("PR #99");
    expect(text).toContain("Fix retry state machine");
    expect(text).toContain("Base: main");
    expect(text).toContain("Closes AB#1234.");
  });

  it("honours per_page when provided", async () => {
    worktrees.register("ch1", {
      path: path.join(tmpDir, "ch1", "main"),
      repo: "acme/foo",
      ref: "main",
    });
    const tool = githubPrFetchTool({ channelKey: "ch1", worktrees, auth: fakeAuth });
    await tool.execute("t1", { pr_number: 1, per_page: 100 });
    const listArgs = pullsListFiles.mock.calls[0]![0] as { per_page: number };
    expect(listArgs.per_page).toBe(100);
  });
});

describe("github_pr_review", () => {
  it("refuses when the channel has no worktree", async () => {
    const tool = githubPrReviewTool({ channelKey: "ch1", worktrees, auth: fakeAuth });
    const r = await tool.execute("t1", { pr_number: 1, body: "looks good" });
    expect(r.isError).toBe(true);
    expect(pullsCreateReview).not.toHaveBeenCalled();
  });

  it("submits a COMMENT review by default with no inline comments", async () => {
    worktrees.register("ch1", {
      path: path.join(tmpDir, "ch1", "main"),
      repo: "acme/foo",
      ref: "main",
    });
    const tool = githubPrReviewTool({ channelKey: "ch1", worktrees, auth: fakeAuth });
    const r = await tool.execute("t1", { pr_number: 42, body: "Three small nits below." });
    expect(r.isError).toBeUndefined();
    expect(pullsCreateReview).toHaveBeenCalledOnce();
    const args = pullsCreateReview.mock.calls[0]![0] as {
      owner: string;
      repo: string;
      pull_number: number;
      body: string;
      event: string;
      comments?: unknown[];
    };
    expect(args.owner).toBe("acme");
    expect(args.repo).toBe("foo");
    expect(args.pull_number).toBe(42);
    expect(args.event).toBe("COMMENT");
    expect(args.body).toBe("Three small nits below.");
    expect(args.comments).toBeUndefined();
    expect(r.content[0]?.text).toContain("Submitted COMMENT review on PR #42");
    expect(r.content[0]?.text).toContain("0 inline comments");
  });

  it("passes inline comments with default RIGHT side", async () => {
    worktrees.register("ch1", {
      path: path.join(tmpDir, "ch1", "main"),
      repo: "acme/foo",
      ref: "main",
    });
    const tool = githubPrReviewTool({ channelKey: "ch1", worktrees, auth: fakeAuth });
    const r = await tool.execute("t1", {
      pr_number: 42,
      body: "See comments.",
      event: "REQUEST_CHANGES",
      comments: [
        { path: "src/retry.ts", line: 12, body: "Off-by-one here." },
        { path: "src/retry.ts", line: 8, side: "LEFT", body: "Why was this removed?" },
      ],
    });
    expect(r.isError).toBeUndefined();
    const args = pullsCreateReview.mock.calls[0]![0] as {
      event: string;
      comments: Array<{ path: string; line: number; side: string; body: string }>;
    };
    expect(args.event).toBe("REQUEST_CHANGES");
    expect(args.comments).toHaveLength(2);
    expect(args.comments[0]!.side).toBe("RIGHT"); // default
    expect(args.comments[1]!.side).toBe("LEFT");
    expect(r.content[0]?.text).toContain("2 inline comments");
  });

  it("appends requestedBy footer to the review body when provided", async () => {
    worktrees.register("ch1", {
      path: path.join(tmpDir, "ch1", "main"),
      repo: "acme/foo",
      ref: "main",
    });
    const tool = githubPrReviewTool({
      channelKey: "ch1",
      worktrees,
      auth: fakeAuth,
      requestedBy: () => "Review requested by Aviral in #engineering",
    });
    await tool.execute("t1", { pr_number: 42, body: "LGTM with notes." });
    const args = pullsCreateReview.mock.calls[0]![0] as { body: string };
    expect(args.body).toContain("LGTM with notes.");
    expect(args.body).toContain("---");
    expect(args.body).toContain("Review requested by Aviral in #engineering");
  });

  it("schema restricts event to COMMENT or REQUEST_CHANGES (bot never approves/merges)", () => {
    const tool = githubPrReviewTool({ channelKey: "ch1", worktrees, auth: fakeAuth });
    const eventProp = (
      tool.parameters as unknown as {
        properties: { event: { anyOf: Array<{ const: string }> } };
      }
    ).properties.event;
    const literals = eventProp.anyOf.map((s) => s.const).sort();
    expect(literals).toEqual(["COMMENT", "REQUEST_CHANGES"]);
    expect(literals).not.toContain("APPROVE");
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
