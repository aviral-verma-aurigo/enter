import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolvePaths } from "../src/config/paths.js";
import { loadConfig } from "../src/config/config-loader.js";

let tmpHome: string;
const ORIG_ENV = { ...process.env };

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "enter-cfg-"));
  // Strip ENTER_* overrides from the test env so we control the inputs.
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("ENTER_")) delete process.env[k];
  }
});

afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
  process.env = { ...ORIG_ENV };
});

describe("loadConfig precedence", () => {
  it("returns DEFAULT_CONFIG with no overrides", () => {
    const paths = resolvePaths({ homeOverride: tmpHome });
    const cfg = loadConfig(paths);
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.model).toBe("claude-opus-4-7");
    expect(cfg.autonomy.maxTurns).toBe(50);
  });

  it("config.json overrides defaults", () => {
    const paths = resolvePaths({ homeOverride: tmpHome });
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.writeFileSync(
      paths.configFile,
      JSON.stringify({ provider: "openai", model: "gpt-4o" }),
      "utf8",
    );
    const cfg = loadConfig(paths);
    expect(cfg.provider).toBe("openai");
    expect(cfg.model).toBe("gpt-4o");
    // Untouched keys stay at defaults
    expect(cfg.autonomy.maxTurns).toBe(50);
  });

  it("env vars override config.json", () => {
    const paths = resolvePaths({ homeOverride: tmpHome });
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.writeFileSync(
      paths.configFile,
      JSON.stringify({ provider: "openai", model: "gpt-4o" }),
      "utf8",
    );
    process.env["ENTER_PROVIDER"] = "anthropic";
    process.env["ENTER_MODEL"] = "claude-haiku-4-5";
    const cfg = loadConfig(paths);
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.model).toBe("claude-haiku-4-5");
  });

  it("CLI overrides win over env", () => {
    const paths = resolvePaths({ homeOverride: tmpHome });
    process.env["ENTER_MODEL"] = "claude-haiku-4-5";
    const cfg = loadConfig(paths, { model: "claude-sonnet-4-6", maxTurns: 7 });
    expect(cfg.model).toBe("claude-sonnet-4-6");
    expect(cfg.autonomy.maxTurns).toBe(7);
  });

  it("deep-merges nested config blocks (config.json sets thinkingBudgets.medium, defaults keep low/high)", () => {
    const paths = resolvePaths({ homeOverride: tmpHome });
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.writeFileSync(
      paths.configFile,
      JSON.stringify({ thinkingBudgets: { medium: 9999 } }),
      "utf8",
    );
    const cfg = loadConfig(paths);
    expect(cfg.thinkingBudgets.medium).toBe(9999);
    expect(cfg.thinkingBudgets.low).toBe(1024); // default preserved
    expect(cfg.thinkingBudgets.high).toBe(16384);
  });
});
