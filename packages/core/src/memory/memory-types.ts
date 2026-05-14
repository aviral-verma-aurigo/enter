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
}

export type RecallScope = "channel" | "project" | "global" | "all";
