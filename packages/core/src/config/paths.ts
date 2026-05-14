import path from "node:path";
import fs from "node:fs";
import { homeDir } from "../util/platform.js";

export interface EnterPaths {
  home: string;
  configFile: string;
  keysFile: string;
  soulFile: string;
  memoryDir: string;
  memoryIndexFile: string;
  memoryDbFile: string;
  skillsDir: string;
  sessionsDir: string;
  exportsDir: string;
  projectSkillsDir: string;
  projectSoulFile: string;
}

export interface ResolvePathsOptions {
  /** Override the ~/.enter root (e.g. for tests or the bot's /var/lib/enter-bot). */
  homeOverride?: string;
  /** Project root (cwd) used for project-level overrides. */
  cwd?: string;
}

export function resolvePaths(opts: ResolvePathsOptions = {}): EnterPaths {
  const home = opts.homeOverride ?? process.env["ENTER_HOME"] ?? path.join(homeDir(), ".enter");
  const cwd = opts.cwd ?? process.cwd();
  const memoryDir = path.join(home, "memory");
  return {
    home,
    configFile: path.join(home, "config.json"),
    keysFile: path.join(home, "keys.json"),
    soulFile: path.join(home, "SOUL.md"),
    memoryDir,
    memoryIndexFile: path.join(memoryDir, "MEMORY.md"),
    memoryDbFile: path.join(memoryDir, "memories.db"),
    skillsDir: path.join(home, "skills"),
    sessionsDir: path.join(home, "sessions"),
    exportsDir: path.join(home, "exports"),
    projectSkillsDir: path.join(cwd, ".enter", "skills"),
    projectSoulFile: path.join(cwd, "SOUL.md"),
  };
}

export function ensureDirs(paths: EnterPaths): void {
  for (const dir of [paths.home, paths.memoryDir, paths.skillsDir, paths.sessionsDir, paths.exportsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
