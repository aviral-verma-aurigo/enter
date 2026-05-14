import fs from "node:fs";
import path from "node:path";
import type { MemoryRecord, MemoryType } from "./memory-types.js";
import { MEMORY_TYPES } from "./memory-types.js";

const HEADER = "# Enter memory index\n";

interface IndexEntry {
  type: MemoryType;
  name: string;
  summary: string;
  path: string;
  updated: string;
}

function entriesByType(entries: IndexEntry[]): Record<MemoryType, IndexEntry[]> {
  const out: Record<MemoryType, IndexEntry[]> = {
    user: [],
    feedback: [],
    project: [],
    reference: [],
    channel: [],
  };
  for (const e of entries) out[e.type].push(e);
  for (const t of MEMORY_TYPES) {
    out[t].sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : a.name.localeCompare(b.name)));
  }
  return out;
}

function renderIndex(entries: IndexEntry[]): string {
  const grouped = entriesByType(entries);
  const lines: string[] = [HEADER];
  for (const t of MEMORY_TYPES) {
    const rows = grouped[t];
    if (rows.length === 0) continue;
    lines.push(`\n## ${t}`);
    for (const r of rows) {
      const date = r.updated.slice(0, 10);
      lines.push(`- [${r.name}] (${date}) — ${r.summary} → ${path.basename(r.path)}`);
    }
  }
  return lines.join("\n") + "\n";
}

/** Read every memory file path referenced by the index. Returns an empty list if the file doesn't exist. */
export function readIndex(indexPath: string): IndexEntry[] {
  if (!fs.existsSync(indexPath)) return [];
  const text = fs.readFileSync(indexPath, "utf8");
  const out: IndexEntry[] = [];
  let currentType: MemoryType | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const heading = /^##\s+([a-z]+)$/.exec(line);
    if (heading?.[1] && (MEMORY_TYPES as readonly string[]).includes(heading[1])) {
      currentType = heading[1] as MemoryType;
      continue;
    }
    const entry = /^- \[(.+?)\] \((\d{4}-\d{2}-\d{2})\) — (.*?) → (.+)$/.exec(line);
    if (entry && currentType) {
      out.push({
        type: currentType,
        name: entry[1]!,
        updated: entry[2]! + "T00:00:00Z",
        summary: entry[3]!,
        path: entry[4]!,
      });
    }
  }
  return out;
}

/** Rewrite the MEMORY.md index from a fresh list of records. */
export function writeIndex(indexPath: string, records: MemoryRecord[]): void {
  const entries: IndexEntry[] = records.map((r) => ({
    type: r.type,
    name: r.name,
    summary: r.summary,
    path: r.path,
    updated: r.updated,
  }));
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, renderIndex(entries), "utf8");
}
