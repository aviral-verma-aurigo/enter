import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export interface WorktreeState {
  channelKey: string;
  path: string;
  repo: string;
  ref: string;
  createdAt: number;
  lastUsedAt: number;
}

function safeKey(k: string): string {
  return k.replace(/[\\/:*?"<>|]/g, "_");
}

/**
 * Per-channel ephemeral git worktree manager.
 *
 * - One active worktree per channel at a time (v0.1).
 * - `register()` records a fresh clone; `get()` returns the active path; `discard()` removes the worktree.
 * - `sweep()` removes worktrees idle longer than `ttlMs` (defaults to 24h).
 */
export class WorktreeManager {
  private readonly active = new Map<string, WorktreeState>();
  constructor(
    public readonly root: string,
    private readonly ttlMs: number = 24 * 60 * 60 * 1000,
  ) {
    fs.mkdirSync(root, { recursive: true });
  }

  pathFor(channelKey: string, branch = "main"): string {
    return path.join(this.root, safeKey(channelKey), safeKey(branch));
  }

  get(channelKey: string): WorktreeState | null {
    const s = this.active.get(channelKey);
    if (s) {
      s.lastUsedAt = Date.now();
      return s;
    }
    return null;
  }

  register(channelKey: string, state: Omit<WorktreeState, "channelKey" | "createdAt" | "lastUsedAt">): WorktreeState {
    const now = Date.now();
    const full: WorktreeState = { channelKey, createdAt: now, lastUsedAt: now, ...state };
    this.active.set(channelKey, full);
    return full;
  }

  async discard(channelKey: string): Promise<void> {
    const s = this.active.get(channelKey);
    if (!s) return;
    this.active.delete(channelKey);
    await fsp.rm(s.path, { recursive: true, force: true });
  }

  /** Remove worktrees that have been idle past `ttlMs`. Returns the channelKeys evicted. */
  async sweep(now = Date.now()): Promise<string[]> {
    const evicted: string[] = [];
    for (const [k, v] of this.active) {
      if (now - v.lastUsedAt > this.ttlMs) {
        await this.discard(k);
        evicted.push(k);
      }
    }
    return evicted;
  }
}
