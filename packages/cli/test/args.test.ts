import { describe, expect, it } from "vitest";
import { parseArgs, helpText } from "../src/args.js";

describe("parseArgs", () => {
  it("defaults to 'run' command with no flags", () => {
    const a = parseArgs([]);
    expect(a.command).toBe("run");
    expect(a.print).toBe(false);
    expect(a.simple).toBe(false);
    expect(a.positional).toEqual([]);
  });

  it("recognizes help / version / export subcommands", () => {
    expect(parseArgs(["help"]).command).toBe("help");
    expect(parseArgs(["--help"]).command).toBe("help");
    expect(parseArgs(["-h"]).command).toBe("help");
    expect(parseArgs(["version"]).command).toBe("version");
    expect(parseArgs(["--version"]).command).toBe("version");
    expect(parseArgs(["-v"]).command).toBe("version");

    const e = parseArgs(["export", "01ABC"]);
    expect(e.command).toBe("export");
    expect(e.exportSessionId).toBe("01ABC");
  });

  it("parses --print and -p", () => {
    expect(parseArgs(["--print", "hello"]).print).toBe(true);
    expect(parseArgs(["-p", "hello"]).print).toBe(true);
  });

  it("parses --autonomous with goal", () => {
    const a = parseArgs(["--autonomous", "build a website"]);
    expect(a.autonomous).toBe("build a website");
  });

  it("throws when --autonomous has no value", () => {
    expect(() => parseArgs(["--autonomous"])).toThrow();
  });

  it("parses --plan with goal", () => {
    const a = parseArgs(["--plan", "refactor auth layer"]);
    expect(a.plan).toBe("refactor auth layer");
  });

  it("throws when --plan has no value", () => {
    expect(() => parseArgs(["--plan"])).toThrow();
  });

  it("parses --execute-plan with path", () => {
    const a = parseArgs(["--execute-plan", "/tmp/plans/foo.md"]);
    expect(a.executePlan).toBe("/tmp/plans/foo.md");
  });

  it("throws when --execute-plan has no value", () => {
    expect(() => parseArgs(["--execute-plan"])).toThrow();
  });

  it("parses --model and --provider", () => {
    const a = parseArgs(["--model", "claude-haiku-4-5", "--provider", "anthropic"]);
    expect(a.model).toBe("claude-haiku-4-5");
    expect(a.provider).toBe("anthropic");
  });

  it("parses --max-turns as number", () => {
    expect(parseArgs(["--max-turns", "7"]).maxTurns).toBe(7);
  });

  it("throws on --max-turns without a value", () => {
    expect(() => parseArgs(["--max-turns"])).toThrow();
  });

  it("parses --soul, --session, --no-color, --simple", () => {
    const a = parseArgs([
      "--soul", "C:/SOUL.md",
      "--session", "01XYZ",
      "--no-color",
      "--simple",
    ]);
    expect(a.soul).toBe("C:/SOUL.md");
    expect(a.session).toBe("01XYZ");
    expect(a.noColor).toBe(true);
    expect(a.simple).toBe(true);
  });

  it("accumulates positional args (the initial prompt)", () => {
    const a = parseArgs(["what's", "in", "this", "repo?"]);
    expect(a.positional).toEqual(["what's", "in", "this", "repo?"]);
  });

  it("throws on unknown flags", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown flag/);
  });

  it("recognizes 'login' with no flags", () => {
    const a = parseArgs(["login"]);
    expect(a.command).toBe("login");
    expect(a.provider).toBeUndefined();
  });

  it("recognizes 'login --provider <name>'", () => {
    const a = parseArgs(["login", "--provider", "openai"]);
    expect(a.command).toBe("login");
    expect(a.provider).toBe("openai");
  });

  it("recognizes 'logout' with and without --provider", () => {
    expect(parseArgs(["logout"]).command).toBe("logout");
    const a = parseArgs(["logout", "--provider", "anthropic"]);
    expect(a.command).toBe("logout");
    expect(a.provider).toBe("anthropic");
  });

  it("throws when 'login --provider' is missing a value", () => {
    expect(() => parseArgs(["login", "--provider"])).toThrow(/--provider requires/);
  });

  it("throws on unknown flag after 'login'", () => {
    expect(() => parseArgs(["login", "--nope"])).toThrow(/Unknown flag for 'login'/);
  });
});

describe("helpText", () => {
  it("starts with the canonical tagline", () => {
    expect(helpText().split("\n")[0]).toBe(
      "enter — an autonomous teammate that ships pull requests",
    );
  });
  it("documents every supported flag", () => {
    const t = helpText();
    expect(t).toContain("--print");
    expect(t).toContain("--autonomous");
    expect(t).toContain("--model");
    expect(t).toContain("--provider");
    expect(t).toContain("--soul");
    expect(t).toContain("--session");
    expect(t).toContain("--max-turns");
    expect(t).toContain("--no-color");
    expect(t).toContain("--simple");
    expect(t).toContain("--plan");
    expect(t).toContain("--execute-plan");
    expect(t).toContain("enter login");
    expect(t).toContain("enter logout");
  });
});
