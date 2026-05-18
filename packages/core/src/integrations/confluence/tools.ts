import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AtlassianAuthorizer } from "./auth.js";

export interface ConfluenceToolsOptions {
  auth: AtlassianAuthorizer;
  /** Confluence Cloud base URL including `/wiki`, e.g. `"https://acme.atlassian.net/wiki"`. */
  baseUrl: string;
  /** Attribution string appended to write actions. */
  requestedBy: () => string;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

async function confluenceFetch(
  opts: ConfluenceToolsOptions,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: unknown; text: string }> {
  const auth = await opts.auth.getAuthHeader();
  const url = joinUrl(opts.baseUrl, path);
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    // non-JSON (e.g., HTML error page) — keep `text` for diagnostics
  }
  return { ok: res.ok, status: res.status, data, text };
}

/**
 * Extract a numeric Confluence page id from either a raw id (passed as a string of digits)
 * or a Confluence URL like `https://acme.atlassian.net/wiki/spaces/X/pages/12345/Title-Slug`.
 */
export function parseConfluencePageId(input: string): string | null {
  if (/^\d+$/.test(input.trim())) return input.trim();
  const m = input.match(/\/pages\/(\d+)(?:[\/?#]|$)/);
  return m ? (m[1] ?? null) : null;
}

/** Minimal HTML escape for storage-format content. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// ──────────────────────────────────────────────────────────────────────────────
// confluence_page_get
// ──────────────────────────────────────────────────────────────────────────────

const PageGetParams = Type.Object({
  id_or_url: Type.String({
    minLength: 1,
    description: "Confluence page id (digits) or a page URL.",
  }),
  format: Type.Optional(
    Type.Union(
      [Type.Literal("text"), Type.Literal("storage")],
      { description: "text strips HTML for readability (default); storage returns raw Confluence markup." },
    ),
  ),
});
type PageGetP = Static<typeof PageGetParams>;

export function confluencePageGetTool(opts: ConfluenceToolsOptions): AgentTool<typeof PageGetParams> {
  return {
    name: "confluence_page_get",
    label: "Confluence: get page",
    description:
      "Fetch a Confluence page by id or URL. Returns title, plain-text body (default) or raw storage markup, version, and the webui link. Use to pull PRD context, runbooks, ADRs, etc.",
    parameters: PageGetParams,
    executionMode: "sequential",
    execute: async (_id, params: PageGetP) => {
      const pageId = parseConfluencePageId(params.id_or_url);
      if (!pageId) {
        return {
          content: [{ type: "text", text: `Could not parse a page id from "${params.id_or_url}".` }],
          details: { error: "unparseable_id" },
          isError: true,
        };
      }
      const res = await confluenceFetch(opts, `/api/v2/pages/${pageId}?body-format=storage`);
      if (!res.ok) {
        return {
          content: [{ type: "text", text: `Confluence page ${pageId} fetch failed: HTTP ${res.status}\n${res.text.slice(0, 1500)}` }],
          details: { id: pageId, status: res.status },
          isError: true,
        };
      }
      const page = (res.data ?? {}) as Record<string, unknown>;
      const title = String(page["title"] ?? "(no title)");
      const rawBody = String(((page["body"] as Record<string, unknown>)?.["storage"] as Record<string, unknown>)?.["value"] ?? "");
      const body = params.format === "storage" ? rawBody : stripHtml(rawBody);
      const versionNumber = ((page["version"] as Record<string, unknown>)?.["number"]) ?? "?";
      const webui = ((page["_links"] as Record<string, unknown>)?.["webui"]) ?? null;
      const summary = [
        `Confluence page ${pageId} — ${title} (v${versionNumber})`,
        webui ? `URL: ${joinUrl(opts.baseUrl, String(webui))}` : "",
        "",
        body.slice(0, 8000),
      ]
        .filter((line) => line !== "")
        .join("\n");
      return {
        content: [{ type: "text", text: summary }],
        details: { id: pageId, title, version: versionNumber, bodyChars: body.length, webui },
      };
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// confluence_search (CQL)
// ──────────────────────────────────────────────────────────────────────────────

const SearchParams = Type.Object({
  cql: Type.String({
    minLength: 3,
    description:
      "Confluence Query Language. Examples: `text ~ \"checkout flow\"`, `type=page AND space=PROD AND title=\"PRD: checkout\"`, `lastmodified > now('-30d')`.",
  }),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
});
type SearchP = Static<typeof SearchParams>;

export function confluenceSearchTool(opts: ConfluenceToolsOptions): AgentTool<typeof SearchParams> {
  return {
    name: "confluence_search",
    label: "Confluence: search (CQL)",
    description:
      "Run a Confluence Query Language search. Returns matching page titles, ids, and space keys. Pair with `confluence_page_get` to fetch full bodies.",
    parameters: SearchParams,
    executionMode: "sequential",
    execute: async (_id, params: SearchP) => {
      const limit = params.limit ?? 10;
      const path = `/rest/api/content/search?cql=${encodeURIComponent(params.cql)}&limit=${limit}&expand=space,version`;
      const res = await confluenceFetch(opts, path);
      if (!res.ok) {
        return {
          content: [{ type: "text", text: `Confluence search failed (HTTP ${res.status}):\n${res.text.slice(0, 1500)}` }],
          details: { status: res.status },
          isError: true,
        };
      }
      const data = (res.data ?? {}) as { results?: Array<Record<string, unknown>>; size?: number; totalSize?: number };
      const results = data.results ?? [];
      if (results.length === 0) {
        return {
          content: [{ type: "text", text: "No matching Confluence pages." }],
          details: { count: 0 },
        };
      }
      const lines = results.map((r) => {
        const id = String(r["id"] ?? "?");
        const title = String(r["title"] ?? "?");
        const type = String(r["type"] ?? "?");
        const spaceKey = (((r["space"] as Record<string, unknown>) ?? {})["key"]) ?? "?";
        return `[${type}] ${spaceKey} · #${id} — ${title}`;
      });
      return {
        content: [{ type: "text", text: `${results.length} match(es):\n${lines.join("\n")}` }],
        details: { count: results.length, results: results.map((r) => ({ id: r["id"], title: r["title"] })) },
      };
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// confluence_page_append_comment
// ──────────────────────────────────────────────────────────────────────────────

const AppendCommentParams = Type.Object({
  page_id_or_url: Type.String({ minLength: 1 }),
  body: Type.String({ minLength: 1, description: "Plain text comment body." }),
});
type AppendCommentP = Static<typeof AppendCommentParams>;

export function confluencePageAppendCommentTool(
  opts: ConfluenceToolsOptions,
): AgentTool<typeof AppendCommentParams> {
  return {
    name: "confluence_page_append_comment",
    label: "Confluence: add footer comment",
    description:
      "Add a footer comment to a Confluence page. The identity authors the comment; human requester appended as attribution.",
    parameters: AppendCommentParams,
    executionMode: "sequential",
    execute: async (_id, params: AppendCommentP) => {
      const pageId = parseConfluencePageId(params.page_id_or_url);
      if (!pageId) {
        return {
          content: [{ type: "text", text: `Could not parse a page id from "${params.page_id_or_url}".` }],
          details: { error: "unparseable_id" },
          isError: true,
        };
      }
      const html = `<p>${escapeHtml(params.body)}</p><p><em>— Requested by ${escapeHtml(opts.requestedBy())}</em></p>`;
      const res = await confluenceFetch(opts, `/api/v2/footer-comments`, {
        method: "POST",
        body: {
          pageId,
          body: { representation: "storage", value: html },
        },
      });
      if (!res.ok) {
        return {
          content: [{ type: "text", text: `Confluence comment failed (HTTP ${res.status}):\n${res.text.slice(0, 1500)}` }],
          details: { pageId, status: res.status },
          isError: true,
        };
      }
      const c = (res.data ?? {}) as Record<string, unknown>;
      return {
        content: [{ type: "text", text: `Added comment to Confluence page ${pageId} (comment id ${c["id"] ?? "?"}).` }],
        details: { pageId, commentId: c["id"] ?? null },
      };
    },
  };
}

export function buildConfluenceTools(opts: ConfluenceToolsOptions): AgentTool[] {
  return [
    confluencePageGetTool(opts),
    confluenceSearchTool(opts),
    confluencePageAppendCommentTool(opts),
  ];
}
