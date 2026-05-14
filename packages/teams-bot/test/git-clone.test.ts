import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock simple-git before importing the tool under test.
const cloneMock = vi.fn(async () => "ok");
vi.mock("simple-git", () => ({
  simpleGit: () => ({
    clone: cloneMock,
  }),
}));

import { gitCloneTool } from "../src/tools/git-clone.js";
import { WorktreeManager } from "../src/channels/worktree-mgr.js";
import type { GitHubAppAuth } from "../src/auth/github-app.js";

let tmpDir: string;
let worktrees: WorktreeManager;
const fakeAuth = {
  async tokenForRepo() {
    return "fake-token";
  },
  async octokitForRepo() {
    return {} as never;
  },
} as unknown as GitHubAppAuth;

beforeEach(() => {
  cloneMock.mockClear();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "enter-clone-"));
  worktrees = new WorktreeManager(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("git_clone", () => {
  it("clones with --depth 1 and embeds the installation token in the URL", async () => {
    const tool = gitCloneTool({ channelKey: "ch1", worktrees, auth: fakeAuth });
    const r = await tool.execute("t1", { repo: "acme/foo" });
    expect(r.isError).toBeUndefined();
    expect(cloneMock).toHaveBeenCalledOnce();
    const [url, target, args] = cloneMock.mock.calls[0]! as [string, string, string[]];
    expect(url).toContain("https://x-access-token:fake-token@github.com/acme/foo.git");
    expect(target).toContain("ch1");
    expect(args.slice(0, 2)).toEqual(["--depth", "1"]);
  });

  it("adds --branch when ref is specified", async () => {
    const tool = gitCloneTool({ channelKey: "ch1", worktrees, auth: fakeAuth });
    await tool.execute("t1", { repo: "acme/foo", ref: "develop" });
    const [, , args] = cloneMock.mock.calls[0]! as [string, string, string[]];
    expect(args).toContain("--branch");
    expect(args).toContain("develop");
  });

  it("accepts full GitHub URLs and parses them to owner/name", async () => {
    const tool = gitCloneTool({ channelKey: "ch1", worktrees, auth: fakeAuth });
    await tool.execute("t1", { repo: "https://github.com/acme/foo.git" });
    const [url] = cloneMock.mock.calls[0]! as [string, string, string[]];
    expect(url).toContain("github.com/acme/foo.git");
  });

  it("registers the worktree in the manager", async () => {
    const tool = gitCloneTool({ channelKey: "ch1", worktrees, auth: fakeAuth });
    await tool.execute("t1", { repo: "acme/foo", ref: "main" });
    const state = worktrees.get("ch1");
    expect(state).not.toBeNull();
    expect(state!.repo).toBe("acme/foo");
    expect(state!.ref).toBe("main");
  });

  it("fires the onCloned callback with the worktree path", async () => {
    let cloned: string | null = null;
    const tool = gitCloneTool({
      channelKey: "ch1",
      worktrees,
      auth: fakeAuth,
      onCloned: (p) => {
        cloned = p;
      },
    });
    await tool.execute("t1", { repo: "acme/foo" });
    expect(cloned).not.toBeNull();
    expect(cloned!).toContain("ch1");
  });

  it("rejects repos not in the allowlist without calling clone", async () => {
    const tool = gitCloneTool({
      channelKey: "ch1",
      worktrees,
      auth: fakeAuth,
      allowedRepos: ["acme/payments"],
    });
    const r = await tool.execute("t1", { repo: "acme/forbidden" });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("not in the bot's allowlist");
    expect(cloneMock).not.toHaveBeenCalled();
  });

  it("allows repos that ARE in the allowlist", async () => {
    const tool = gitCloneTool({
      channelKey: "ch1",
      worktrees,
      auth: fakeAuth,
      allowedRepos: ["acme/payments", "acme/foo"],
    });
    const r = await tool.execute("t1", { repo: "acme/foo" });
    expect(r.isError).toBeUndefined();
    expect(cloneMock).toHaveBeenCalledOnce();
  });
});
