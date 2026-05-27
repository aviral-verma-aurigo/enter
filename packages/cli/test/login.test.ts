import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EnterPaths } from "@enter/core";
import { removeApiKey, listConfiguredProviders } from "../src/login.js";

function fakePaths(home: string): EnterPaths {
  return {
    home,
    configFile: path.join(home, "config.json"),
    keysFile: path.join(home, "keys.json"),
    soulFile: path.join(home, "SOUL.md"),
    memoryDir: path.join(home, "memory"),
    memoryIndexFile: path.join(home, "memory", "MEMORY.md"),
    memoryDbFile: path.join(home, "memory", "memories.db"),
    skillsDir: path.join(home, "skills"),
    sessionsDir: path.join(home, "sessions"),
    exportsDir: path.join(home, "exports"),
    projectSkillsDir: path.join(home, "project-skills"),
    projectSoulFile: path.join(home, "project-soul"),
  };
}

describe("login — keys.json helpers", () => {
  let home: string;
  let paths: EnterPaths;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "enter-login-"));
    paths = fakePaths(home);
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  describe("listConfiguredProviders", () => {
    it("returns empty array when keys.json is absent", () => {
      expect(listConfiguredProviders(paths)).toEqual([]);
    });

    it("returns provider names from a populated keys.json", () => {
      fs.writeFileSync(paths.keysFile, JSON.stringify({ anthropic: "sk-1", openai: "sk-2" }));
      expect(listConfiguredProviders(paths).sort()).toEqual(["anthropic", "openai"]);
    });

    it("tolerates a corrupted keys.json by returning empty", () => {
      fs.writeFileSync(paths.keysFile, "not json {");
      expect(listConfiguredProviders(paths)).toEqual([]);
    });

    it("ignores a non-object JSON payload", () => {
      fs.writeFileSync(paths.keysFile, JSON.stringify(["sk-1", "sk-2"]));
      expect(listConfiguredProviders(paths)).toEqual([]);
    });
  });

  describe("removeApiKey", () => {
    it("returns { removed: false } when keys.json is absent", () => {
      expect(removeApiKey("anthropic", paths)).toEqual({ removed: false });
    });

    it("returns { removed: false } when provider is not present", () => {
      fs.writeFileSync(paths.keysFile, JSON.stringify({ openai: "sk-x" }));
      expect(removeApiKey("anthropic", paths)).toEqual({ removed: false });
      const after = JSON.parse(fs.readFileSync(paths.keysFile, "utf8"));
      expect(after).toEqual({ openai: "sk-x" });
    });

    it("removes a single existing entry and deletes the file when empty", () => {
      fs.writeFileSync(paths.keysFile, JSON.stringify({ anthropic: "sk-1" }));
      expect(removeApiKey("anthropic", paths)).toEqual({ removed: true });
      expect(fs.existsSync(paths.keysFile)).toBe(false);
    });

    it("removes one provider but leaves others intact", () => {
      fs.writeFileSync(
        paths.keysFile,
        JSON.stringify({ anthropic: "sk-1", openai: "sk-2" }),
      );
      expect(removeApiKey("anthropic", paths)).toEqual({ removed: true });
      const after = JSON.parse(fs.readFileSync(paths.keysFile, "utf8"));
      expect(after).toEqual({ openai: "sk-2" });
    });

    it("is idempotent — second call on the same provider is a no-op", () => {
      fs.writeFileSync(paths.keysFile, JSON.stringify({ anthropic: "sk-1" }));
      expect(removeApiKey("anthropic", paths).removed).toBe(true);
      expect(removeApiKey("anthropic", paths).removed).toBe(false);
    });
  });
});
