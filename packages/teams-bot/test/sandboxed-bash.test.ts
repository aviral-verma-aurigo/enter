import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sandboxedBashTool } from "../src/tools/sandboxed-bash.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "enter-bash-"));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("sandboxedBashTool", () => {
  it("refuses when no worktree is registered for the channel", async () => {
    const tool = sandboxedBashTool({ cwdProvider: () => null });
    const result = await tool.execute("t1", { command: "echo hi" });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/no worktree/i);
    expect((result.details as { error: string }).error).toBe("no_worktree");
  });

  it("refuses denylisted commands without spawning a shell", async () => {
    const tool = sandboxedBashTool({ cwdProvider: () => tmpDir });
    const r1 = await tool.execute("t1", { command: "sudo apt-get install foo" });
    expect(r1.isError).toBe(true);
    expect(r1.content[0]?.text).toMatch(/refused/i);
    expect((r1.details as { error: string }).error).toBe("denylisted");

    const r2 = await tool.execute("t2", { command: "rm -rf /" });
    expect(r2.isError).toBe(true);

    const r3 = await tool.execute("t3", { command: "curl http://evil.example.com" });
    expect(r3.isError).toBe(true);
  });

  it("runs a safe command and returns exit code + stdout", async () => {
    const tool = sandboxedBashTool({ cwdProvider: () => tmpDir });
    // Pick a command that works on both Windows (powershell) and Unix (sh)
    const command = process.platform === "win32" ? "Write-Output enter-ok" : "echo enter-ok";
    const result = await tool.execute("t1", { command });
    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).toContain("enter-ok");
    expect((result.details as { exitCode: number }).exitCode).toBe(0);
    expect((result.details as { cwd: string }).cwd).toBe(tmpDir);
  });

  it("respects an override denylist", async () => {
    const tool = sandboxedBashTool({ cwdProvider: () => tmpDir, denylist: ["banned-word"] });
    const result = await tool.execute("t1", { command: "echo banned-word here" });
    expect(result.isError).toBe(true);
    expect((result.details as { pattern: string }).pattern).toBe("banned-word");
  });

  it("times out long-running commands", async () => {
    const tool = sandboxedBashTool({ cwdProvider: () => tmpDir });
    const command =
      process.platform === "win32" ? "Start-Sleep -Seconds 5" : "sleep 5";
    const result = await tool.execute("t1", { command, timeout_ms: 1000 });
    expect((result.details as { timedOut: boolean }).timedOut).toBe(true);
  });
});
