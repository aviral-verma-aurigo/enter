import fs from "node:fs";
import type { EnterPaths } from "@enter/core";

const CTRL_C = "";
const CTRL_D = "";
const BACKSPACE = "";
const DEL = "";

/**
 * Read a line from stdin without echoing keystrokes — used for API key entry.
 * Falls back to a plain line read if raw mode isn't available (non-TTY); the
 * caller is expected to gate on `isTTY` first, this just degrades safely.
 */
function readSecret(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  return new Promise<string>((resolve, reject) => {
    const stdin = process.stdin;
    const rawSupported = Boolean(stdin.isTTY && typeof stdin.setRawMode === "function");

    if (!rawSupported) {
      stdin.setEncoding("utf8");
      let line = "";
      const onData = (chunk: string) => {
        line += chunk;
        const nl = line.indexOf("\n");
        if (nl >= 0) {
          stdin.removeListener("data", onData);
          resolve(line.slice(0, nl).replace(/\r$/, ""));
        }
      };
      stdin.on("data", onData);
      return;
    }

    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();

    let buffer = "";
    const finish = (value: string | null, err?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
      if (err) reject(err);
      else resolve(value ?? "");
    };

    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\n" || ch === "\r") return finish(buffer);
        if (ch === CTRL_C) return finish(null, new Error("Cancelled by user"));
        if (ch === CTRL_D) return finish(buffer);
        if (ch === DEL || ch === BACKSPACE) {
          buffer = buffer.slice(0, -1);
          continue;
        }
        // Drop other control chars; only accept printable input.
        if (ch.charCodeAt(0) < 0x20) continue;
        buffer += ch;
      }
    };

    stdin.on("data", onData);
  });
}

function readKeysFile(keysFile: string): Record<string, string> {
  if (!fs.existsSync(keysFile)) return {};
  try {
    const raw = fs.readFileSync(keysFile, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return {};
  } catch {
    return {};
  }
}

function writeKeysFile(keysFile: string, keys: Record<string, string>): void {
  // mode 0o600: owner read/write only. Honored on POSIX; on Windows the per-user
  // profile ACL already restricts access, but pass it anyway for consistency.
  fs.writeFileSync(keysFile, `${JSON.stringify(keys, null, 2)}\n`, { mode: 0o600 });
}

/**
 * Prompt for an API key, persist it to `~/.enter/keys.json`, return it. Throws
 * if the user enters nothing or cancels. Caller must ensure the process is
 * attached to an interactive TTY.
 */
export async function promptApiKey(provider: string, paths: EnterPaths): Promise<string> {
  process.stdout.write(`\nEnter needs an API key for provider "${provider}".\n`);
  process.stdout.write(`It will be stored at ${paths.keysFile} (mode 0600).\n\n`);
  const key = (await readSecret(`${provider} API key: `)).trim();
  if (!key) {
    throw new Error("No key entered. Run `enter login` to try again.");
  }
  const keys = readKeysFile(paths.keysFile);
  keys[provider] = key;
  writeKeysFile(paths.keysFile, keys);
  process.stdout.write(`Saved.\n\n`);
  return key;
}

/**
 * Remove a provider's key from `~/.enter/keys.json`. If the file ends up empty,
 * delete it entirely. Idempotent — never throws on missing entries.
 */
export function removeApiKey(provider: string, paths: EnterPaths): { removed: boolean } {
  const keys = readKeysFile(paths.keysFile);
  if (!(provider in keys)) return { removed: false };
  delete keys[provider];
  if (Object.keys(keys).length === 0) {
    if (fs.existsSync(paths.keysFile)) fs.unlinkSync(paths.keysFile);
  } else {
    writeKeysFile(paths.keysFile, keys);
  }
  return { removed: true };
}

/**
 * Expose readKeysFile for read-only inspection (used by login/logout summaries).
 */
export function listConfiguredProviders(paths: EnterPaths): string[] {
  return Object.keys(readKeysFile(paths.keysFile));
}
