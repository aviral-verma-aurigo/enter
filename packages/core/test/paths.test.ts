import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolvePaths, ensureDirs } from "../src/config/paths.js";

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  delete process.env["ENTER_HOME"];
});
afterEach(() => {
  process.env = { ...ORIG_ENV };
});

describe("resolvePaths", () => {
  it("defaults home to ~/.enter when nothing is set", () => {
    const p = resolvePaths();
    expect(p.home).toBe(path.join(os.homedir(), ".enter"));
  });

  it("honors ENTER_HOME env var", () => {
    process.env["ENTER_HOME"] = "C:/custom/enter";
    const p = resolvePaths();
    expect(p.home).toBe("C:/custom/enter");
  });

  it("homeOverride option wins over ENTER_HOME", () => {
    process.env["ENTER_HOME"] = "/env/path";
    const p = resolvePaths({ homeOverride: "/override/path" });
    expect(p.home).toBe("/override/path");
  });

  it("computes every subpath from home", () => {
    const p = resolvePaths({ homeOverride: "/root" });
    expect(p.configFile).toBe(path.join("/root", "config.json"));
    expect(p.keysFile).toBe(path.join("/root", "keys.json"));
    expect(p.soulFile).toBe(path.join("/root", "SOUL.md"));
    expect(p.memoryDir).toBe(path.join("/root", "memory"));
    expect(p.memoryIndexFile).toBe(path.join("/root", "memory", "MEMORY.md"));
    expect(p.memoryDbFile).toBe(path.join("/root", "memory", "memories.db"));
    expect(p.skillsDir).toBe(path.join("/root", "skills"));
    expect(p.sessionsDir).toBe(path.join("/root", "sessions"));
    expect(p.exportsDir).toBe(path.join("/root", "exports"));
  });

  it("computes project-relative paths from cwd option", () => {
    const p = resolvePaths({ homeOverride: "/root", cwd: "/work/repo" });
    expect(p.projectSkillsDir).toBe(path.join("/work/repo", ".enter", "skills"));
    expect(p.projectSoulFile).toBe(path.join("/work/repo", "SOUL.md"));
  });
});

describe("ensureDirs", () => {
  it("creates all runtime directories under home", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "enter-paths-"));
    try {
      const p = resolvePaths({ homeOverride: tmp });
      ensureDirs(p);
      expect(fs.existsSync(p.home)).toBe(true);
      expect(fs.existsSync(p.memoryDir)).toBe(true);
      expect(fs.existsSync(p.skillsDir)).toBe(true);
      expect(fs.existsSync(p.sessionsDir)).toBe(true);
      expect(fs.existsSync(p.exportsDir)).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("is idempotent — second call doesn't throw", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "enter-paths-"));
    try {
      const p = resolvePaths({ homeOverride: tmp });
      ensureDirs(p);
      expect(() => ensureDirs(p)).not.toThrow();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
