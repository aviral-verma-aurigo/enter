import fs from "node:fs";
import { getEnvApiKey } from "@earendil-works/pi-ai";
import type { EnterPaths } from "./paths.js";
import { AuthError } from "../util/errors.js";

/**
 * Resolve an API key for the given provider. Tries (in order):
 *   1. pi-ai's `getEnvApiKey(provider)` — reads the standard env var (e.g. ANTHROPIC_API_KEY).
 *   2. `~/.enter/keys.json` fallback — `{ "<provider>": "<key>" }`.
 * Throws `AuthError` if neither is available.
 */
export function resolveApiKey(provider: string, paths: EnterPaths): string {
  const envKey = getEnvApiKey(provider);
  if (envKey) return envKey;

  if (fs.existsSync(paths.keysFile)) {
    try {
      const raw = fs.readFileSync(paths.keysFile, "utf8");
      const parsed = JSON.parse(raw) as Record<string, string>;
      const k = parsed[provider];
      if (k && k.length > 0) return k;
    } catch (err) {
      throw new AuthError(`Failed to read ${paths.keysFile}`, err);
    }
  }

  throw new AuthError(
    `No API key found for provider '${provider}'. Set the provider's env var (e.g. ANTHROPIC_API_KEY) or add a key to ${paths.keysFile}.`,
  );
}
