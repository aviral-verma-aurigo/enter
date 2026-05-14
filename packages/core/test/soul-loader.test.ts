import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSoul, ensureUserSoul } from "../src/persona/soul-loader.js";
import { resolvePaths } from "../src/config/paths.js";

let tmpHome: string;
let tmpCwd: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "enter-soul-home-"));
  tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), "enter-soul-cwd-"));
});
afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
  fs.rmSync(tmpCwd, { recursive: true, force: true });
});

describe("loadSoul priority chain", () => {
  it("falls back to bundled when no SOUL.md exists anywhere", () => {
    const paths = resolvePaths({ homeOverride: tmpHome, cwd: tmpCwd });
    const soul = loadSoul(paths);
    expect(soul.source).toBe("bundled");
    expect(soul.text).toContain("You are Enter");
    expect(soul.filePath).toBeUndefined();
  });

  it("prefers user-level when only user file exists", () => {
    const paths = resolvePaths({ homeOverride: tmpHome, cwd: tmpCwd });
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.writeFileSync(paths.soulFile, "user-soul content", "utf8");
    const soul = loadSoul(paths);
    expect(soul.source).toBe("user");
    expect(soul.text).toBe("user-soul content");
    expect(soul.filePath).toBe(paths.soulFile);
  });

  it("prefers project-level over user-level", () => {
    const paths = resolvePaths({ homeOverride: tmpHome, cwd: tmpCwd });
    fs.writeFileSync(paths.soulFile, "user", "utf8");
    fs.writeFileSync(paths.projectSoulFile, "project", "utf8");
    const soul = loadSoul(paths);
    expect(soul.source).toBe("project");
    expect(soul.text).toBe("project");
  });

  it("override beats project-level when override path exists", () => {
    const paths = resolvePaths({ homeOverride: tmpHome, cwd: tmpCwd });
    fs.writeFileSync(paths.projectSoulFile, "project", "utf8");
    const overridePath = path.join(tmpCwd, "custom-soul.md");
    fs.writeFileSync(overridePath, "override", "utf8");
    const soul = loadSoul(paths, overridePath);
    expect(soul.source).toBe("override");
    expect(soul.text).toBe("override");
  });

  it("ignores non-existent override and falls through priority chain", () => {
    const paths = resolvePaths({ homeOverride: tmpHome, cwd: tmpCwd });
    fs.writeFileSync(paths.projectSoulFile, "project", "utf8");
    const soul = loadSoul(paths, "/path/that/does/not/exist");
    expect(soul.source).toBe("project");
  });
});

describe("ensureUserSoul", () => {
  it("creates the user file with the bundled template when missing", () => {
    const paths = resolvePaths({ homeOverride: tmpHome, cwd: tmpCwd });
    expect(fs.existsSync(paths.soulFile)).toBe(false);
    const written = ensureUserSoul(paths);
    expect(written).toBe(paths.soulFile);
    expect(fs.existsSync(paths.soulFile)).toBe(true);
    expect(fs.readFileSync(paths.soulFile, "utf8")).toContain("You are Enter");
  });

  it("leaves an existing user file untouched", () => {
    const paths = resolvePaths({ homeOverride: tmpHome, cwd: tmpCwd });
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.writeFileSync(paths.soulFile, "my custom soul", "utf8");
    ensureUserSoul(paths);
    expect(fs.readFileSync(paths.soulFile, "utf8")).toBe("my custom soul");
  });
});
