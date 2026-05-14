import fs from "node:fs";
import { DEFAULT_CONFIG, type EnterConfig } from "./config-schema.js";
import type { EnterPaths } from "./paths.js";
import { ConfigError } from "../util/errors.js";

export interface CliOverrides {
  provider?: string;
  model?: string;
  maxTurns?: number;
}

function deepMerge<T>(base: T, patch: Partial<T> | undefined): T {
  if (patch === undefined) return base;
  if (Array.isArray(base) || Array.isArray(patch)) {
    return (patch as T) ?? base;
  }
  if (typeof base !== "object" || base === null || typeof patch !== "object" || patch === null) {
    return (patch as T) ?? base;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const k of Object.keys(patch as Record<string, unknown>)) {
    const baseVal = (base as Record<string, unknown>)[k];
    const patchVal = (patch as Record<string, unknown>)[k];
    if (
      baseVal !== null &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal) &&
      patchVal !== null &&
      typeof patchVal === "object" &&
      !Array.isArray(patchVal)
    ) {
      out[k] = deepMerge(baseVal, patchVal as Record<string, unknown>);
    } else if (patchVal !== undefined) {
      out[k] = patchVal;
    }
  }
  return out as T;
}

export function loadConfig(paths: EnterPaths, cliOverrides: CliOverrides = {}): EnterConfig {
  let cfg: EnterConfig = DEFAULT_CONFIG;

  if (fs.existsSync(paths.configFile)) {
    try {
      const raw = fs.readFileSync(paths.configFile, "utf8");
      const parsed = JSON.parse(raw) as Partial<EnterConfig>;
      cfg = deepMerge(cfg, parsed);
    } catch (err) {
      throw new ConfigError(`Failed to parse ${paths.configFile}`, err);
    }
  }

  const envProvider = process.env["ENTER_PROVIDER"];
  const envModel = process.env["ENTER_MODEL"];
  if (envProvider) cfg = { ...cfg, provider: envProvider };
  if (envModel) cfg = { ...cfg, model: envModel };

  if (cliOverrides.provider) cfg = { ...cfg, provider: cliOverrides.provider };
  if (cliOverrides.model) cfg = { ...cfg, model: cliOverrides.model };
  if (cliOverrides.maxTurns !== undefined) {
    cfg = { ...cfg, autonomy: { ...cfg.autonomy, maxTurns: cliOverrides.maxTurns } };
  }

  return cfg;
}
