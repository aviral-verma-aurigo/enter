import type { MemoryStore, GraphStore, EnterPaths } from "@enter/core";
import { exportSession, JsonlSessionRepo, loadSoul, ensureUserSoul } from "@enter/core";
import fs from "node:fs";
import path from "node:path";

export interface SlashContext {
  memory: MemoryStore;
  graph: GraphStore;
  paths: EnterPaths;
  sessionId: string;
  out: NodeJS.WritableStream;
}

export interface SlashCommand {
  name: string;
  description: string;
  handler: (args: string[], ctx: SlashContext) => Promise<{ exit?: boolean }>;
}

export interface DispatchResult {
  matched: boolean;
  exit?: boolean;
}

const COMMANDS: SlashCommand[] = [
  {
    name: "help",
    description: "List slash commands.",
    handler: async (_args, ctx) => {
      const w = ctx.out;
      w.write("Slash commands:\n");
      for (const c of COMMANDS) w.write(`  /${c.name.padEnd(12)} ${c.description}\n`);
      return {};
    },
  },
  {
    name: "exit",
    description: "Exit the agent.",
    handler: async (_args, _ctx) => ({ exit: true }),
  },
  {
    name: "memory",
    description: "list | show <name> | edit <name> | forget <name>",
    handler: async (args, ctx) => {
      const sub = args[0] ?? "list";
      if (sub === "list") {
        const all = ctx.memory.list();
        if (all.length === 0) {
          ctx.out.write("(no memories yet)\n");
          return {};
        }
        for (const m of all) {
          ctx.out.write(`[${m.type}] ${m.name} — ${m.summary}\n`);
        }
        return {};
      }
      if (sub === "show") {
        const name = args[1];
        if (!name) {
          ctx.out.write("Usage: /memory show <name>\n");
          return {};
        }
        const all = ctx.memory.list().filter((m) => m.name === name);
        if (all.length === 0) {
          ctx.out.write(`No memory named '${name}'.\n`);
          return {};
        }
        for (const m of all) {
          ctx.out.write(`--- [${m.type}] ${m.name} ---\n${m.body}\n`);
        }
        return {};
      }
      if (sub === "edit") {
        ctx.out.write("Use your $EDITOR to edit the .md file directly. Path:\n");
        const name = args[1];
        for (const m of ctx.memory.list()) {
          if (!name || m.name === name) ctx.out.write(`  ${m.path}\n`);
        }
        return {};
      }
      if (sub === "forget") {
        const name = args[1];
        if (!name) {
          ctx.out.write("Usage: /memory forget <name>\n");
          return {};
        }
        const all = ctx.memory.list().filter((m) => m.name === name);
        if (all.length === 0) {
          ctx.out.write(`No memory named '${name}'.\n`);
          return {};
        }
        for (const m of all) {
          ctx.memory.delete(m.id);
          if (fs.existsSync(m.path)) fs.rmSync(m.path);
          ctx.out.write(`Deleted ${m.type}:${m.name}\n`);
        }
        return {};
      }
      ctx.out.write("Usage: /memory list|show|edit|forget\n");
      return {};
    },
  },
  {
    name: "soul",
    description: "show | edit (prints SOUL.md path)",
    handler: async (args, ctx) => {
      const sub = args[0] ?? "show";
      if (sub === "show") {
        const soul = loadSoul(ctx.paths);
        ctx.out.write(`SOUL.md source: ${soul.source}${soul.filePath ? ` (${soul.filePath})` : ""}\n\n${soul.text}\n`);
        return {};
      }
      if (sub === "edit") {
        const p = ensureUserSoul(ctx.paths);
        ctx.out.write(`Edit: ${p}\n`);
        return {};
      }
      ctx.out.write("Usage: /soul show|edit\n");
      return {};
    },
  },
  {
    name: "skills",
    description: "List loaded skills.",
    handler: async (_args, ctx) => {
      const dir = ctx.paths.skillsDir;
      if (!fs.existsSync(dir)) {
        ctx.out.write("(skills directory empty)\n");
        return {};
      }
      const subs = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
      if (subs.length === 0) {
        ctx.out.write("(no skills authored yet)\n");
        return {};
      }
      for (const s of subs) {
        const skillFile = path.join(dir, s.name, "SKILL.md");
        ctx.out.write(`- ${s.name}${fs.existsSync(skillFile) ? "" : " (no SKILL.md)"}\n`);
      }
      return {};
    },
  },
  {
    name: "recall",
    description: "Search memory directly (FTS5).",
    handler: async (args, ctx) => {
      const query = args.join(" ").trim();
      if (!query) {
        ctx.out.write("Usage: /recall <query>\n");
        return {};
      }
      const hits = ctx.memory.recall(query, { k: 5 });
      if (hits.length === 0) {
        ctx.out.write(`No hits for "${query}".\n`);
        return {};
      }
      for (const h of hits) {
        ctx.out.write(`[${h.type}] ${h.name} — ${h.summary}\n  ${h.snippet}\n`);
      }
      return {};
    },
  },
  {
    name: "graph",
    description: "neighbors <type:key> | path <type:key> <type:key> | facts <type:key>",
    handler: async (args, ctx) => {
      const sub = args[0];
      if (sub === "neighbors") {
        const target = parseEntity(args[1]);
        if (!target) {
          ctx.out.write("Usage: /graph neighbors <type>:<key>\n");
          return {};
        }
        const result = ctx.graph.neighbors(target, { kHops: 2, limit: 20 });
        ctx.out.write(`${result.nodes.length} node(s), ${result.edges.length} edge(s):\n`);
        for (const n of result.nodes) ctx.out.write(`  - ${n.type}:${n.key}\n`);
        return {};
      }
      if (sub === "path") {
        const a = parseEntity(args[1]);
        const b = parseEntity(args[2]);
        if (!a || !b) {
          ctx.out.write("Usage: /graph path <type>:<key> <type>:<key>\n");
          return {};
        }
        const edges = ctx.graph.shortestPath(a, b);
        if (!edges) {
          ctx.out.write("No path.\n");
          return {};
        }
        for (const e of edges) ctx.out.write(`  ${e.src} -[${e.type}]-> ${e.dst}\n`);
        return {};
      }
      if (sub === "facts") {
        const t = parseEntity(args[1]);
        if (!t) {
          ctx.out.write("Usage: /graph facts <type>:<key>\n");
          return {};
        }
        const f = ctx.graph.entityFacts(t);
        if (!f) {
          ctx.out.write(`No such entity.\n`);
          return {};
        }
        ctx.out.write(`${f.node.type}:${f.node.key} (${f.node.label}) — ${f.edges.length} edge(s)\n`);
        return {};
      }
      ctx.out.write("Usage: /graph neighbors|path|facts\n");
      return {};
    },
  },
  {
    name: "export",
    description: "Export current session to ~/.enter/exports/",
    handler: async (_args, ctx) => {
      const repo = new JsonlSessionRepo(ctx.paths.sessionsDir);
      const r = exportSession(repo, ctx.sessionId, ctx.paths.exportsDir);
      ctx.out.write(`Exported:\n  ${r.markdownPath}\n  ${r.jsonlPath}\n`);
      return {};
    },
  },
];

function parseEntity(arg: string | undefined): { type: any; key: string } | null {
  if (!arg) return null;
  const idx = arg.indexOf(":");
  if (idx < 1) return null;
  return { type: arg.slice(0, idx) as any, key: arg.slice(idx + 1) };
}

export async function dispatchSlash(line: string, ctx: SlashContext): Promise<DispatchResult> {
  if (!line.startsWith("/")) return { matched: false };
  const parts = line.slice(1).trim().split(/\s+/);
  const name = parts[0] ?? "";
  const args = parts.slice(1);
  const cmd = COMMANDS.find((c) => c.name === name);
  if (!cmd) {
    ctx.out.write(`Unknown slash command: /${name}. Try /help.\n`);
    return { matched: true };
  }
  const res = await cmd.handler(args, ctx);
  return { matched: true, ...(res.exit ? { exit: true } : {}) };
}
