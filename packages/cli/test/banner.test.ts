import os from "node:os";
import { describe, expect, it, afterEach, vi } from "vitest";

describe("renderBanner", () => {
  const origCols = process.stdout.columns;
  const origNoColor = process.env["NO_COLOR"];
  const origEnterNoColor = process.env["ENTER_NO_COLOR"];
  const origColorterm = process.env["COLORTERM"];

  afterEach(() => {
    process.stdout.columns = origCols;
    if (origNoColor === undefined) delete process.env["NO_COLOR"];
    else process.env["NO_COLOR"] = origNoColor;
    if (origEnterNoColor === undefined) delete process.env["ENTER_NO_COLOR"];
    else process.env["ENTER_NO_COLOR"] = origEnterNoColor;
    if (origColorterm === undefined) delete process.env["COLORTERM"];
    else process.env["COLORTERM"] = origColorterm;
    vi.resetModules();
  });

  async function loadFresh(): Promise<(o: { version: string; modelLabel: string; cwd: string }) => string> {
    vi.resetModules();
    const mod = await import("../src/tui/banner.js");
    return mod.renderBanner;
  }

  it("wide terminal renders hero with art + metadata + tip", async () => {
    process.stdout.columns = 100;
    process.env["COLORTERM"] = "truecolor";
    const renderBanner = await loadFresh();
    const out = renderBanner({ version: "1.2.3", modelLabel: "anthropic/claude-opus-4-7", cwd: "/tmp/x" });
    const lines = out.split("\n");
    expect(lines).toHaveLength(11);
    expect(out).toContain("█");
    expect(out).toContain("v1.2.3");
    expect(out).toContain("anthropic/claude-opus-4-7");
    expect(out).toContain("/help");
    expect(out).toContain("an autonomous teammate");
  });

  it("narrow terminal falls back to one-liner", async () => {
    process.stdout.columns = 40;
    const renderBanner = await loadFresh();
    const out = renderBanner({ version: "1.2.3", modelLabel: "m", cwd: "/tmp/x" });
    expect(out.split("\n")).toHaveLength(1);
    expect(out).toContain("Enter");
    expect(out).not.toContain("█");
    expect(out).toContain("v1.2.3");
  });

  it("NO_COLOR strips all ANSI escapes", async () => {
    process.stdout.columns = 100;
    process.env["NO_COLOR"] = "1";
    process.env["COLORTERM"] = "truecolor";
    const renderBanner = await loadFresh();
    const out = renderBanner({ version: "1.2.3", modelLabel: "m", cwd: "/tmp/x" });
    expect(out).not.toMatch(/\x1b\[/);
    expect(out).toContain("███████");
  });

  it("non-truecolor terminal falls back to ANSI white", async () => {
    process.stdout.columns = 100;
    delete process.env["COLORTERM"];
    delete process.env["NO_COLOR"];
    delete process.env["ENTER_NO_COLOR"];
    const renderBanner = await loadFresh();
    const out = renderBanner({ version: "1.2.3", modelLabel: "m", cwd: "/tmp/x" });
    expect(out).toMatch(/\x1b\[37m/);
    expect(out).not.toMatch(/\x1b\[38;2;148;163;184m/);
  });

  it("collapses $HOME to ~ for short paths", async () => {
    process.stdout.columns = 100;
    const renderBanner = await loadFresh();
    const home = os.homedir();
    const out = renderBanner({ version: "1.2.3", modelLabel: "m", cwd: `${home}/proj/enter` });
    expect(out).toContain("~/proj/enter");
    expect(out).not.toContain(home);
  });

  it("truncates long Windows-style paths to ~/…/last-two", async () => {
    process.stdout.columns = 100;
    const renderBanner = await loadFresh();
    const home = os.homedir();
    const longCwd = `${home}/OneDrive - Aurigo Software Technologies Inc/Desktop/enter`;
    const out = renderBanner({ version: "1.2.3", modelLabel: "m", cwd: longCwd });
    expect(out).toContain("~/…/Desktop/enter");
    expect(out).not.toContain("OneDrive - Aurigo");
  });
});
