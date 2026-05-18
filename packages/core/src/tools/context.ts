import type { MemoryStore } from "../memory/memory-store.js";
import type { GraphStore } from "../memory/graph-store.js";
import type { EnterPaths } from "../config/paths.js";

/**
 * Shared services every tool needs at construction time.
 *
 * The bot may override `channelKey` and `userKey` per-turn; the CLI leaves both null.
 * `projectHash` lets us scope `project`-type memories to a working directory.
 * `userKey` (e.g. Teams aadObjectId) keeps `type=user` memories isolated between
 * teammates sharing a channel.
 */
export interface ToolContext {
  memory: MemoryStore;
  graph: GraphStore;
  paths: EnterPaths;
  cwd: string;
  projectHash: string | null;
  channelKey: string | null;
  userKey: string | null;
}
