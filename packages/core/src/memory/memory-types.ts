export const MEMORY_TYPES = ["user", "feedback", "project", "reference", "channel"] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export interface MemoryRecord {
  id: string;
  type: MemoryType;
  name: string;
  summary: string;
  body: string;
  path: string;
  projectHash: string | null;
  channelKey: string | null;
  /**
   * Optional identifier for the human who saved the memory (e.g. Teams aadObjectId).
   * NULL on rows saved before per-user keying or by the CLI without a user identity.
   * Lets `type=user` memories stay isolated between teammates sharing a channel.
   */
  userKey: string | null;
  tags: string[];
  created: string;
  updated: string;
  hits: number;
}

export interface RecallHit {
  id: string;
  type: MemoryType;
  name: string;
  summary: string;
  snippet: string;
  path: string;
  channelKey: string | null;
  projectHash: string | null;
  userKey: string | null;
}

/**
 * `user` scope: restrict to memories saved by the current user (matches `userKey`).
 * Combined with channel/project at the call site if both are set.
 */
export type RecallScope = "channel" | "project" | "user" | "global" | "all";
