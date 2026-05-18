import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AhaAuthorizer } from "./auth.js";

export interface AhaToolsOptions {
  auth: AhaAuthorizer;
  /** Aha! instance URL, e.g. `"https://acme.aha.io"`. */
  baseUrl: string;
  /** Attribution string appended to write actions. */
  requestedBy: () => string;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

async function ahaFetch(
  opts: AhaToolsOptions,
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
    // non-JSON response (Aha HTML error page, etc) — keep `text` for diagnostics
  }
  return { ok: res.ok, status: res.status, data, text };
}

/**
 * Aha! identifies features and releases by `reference_num` like `"APP-123"` or
 * by numeric id. Both are accepted directly in the URL path; we just strip
 * whitespace and reject the empty case.
 */
export function parseAhaReference(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  // Allow `APP-123`, `123`, but reject anything URL-looking — Aha web URLs don't
  // contain the reference_num in a stable position, so we keep this strict.
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ──────────────────────────────────────────────────────────────────────────────
// aha_feature_get
// ──────────────────────────────────────────────────────────────────────────────

const FeatureGetParams = Type.Object({
  id: Type.String({
    minLength: 1,
    description: "Aha! feature reference_num (e.g. `APP-123`) or numeric id.",
  }),
});
type FeatureGetP = Static<typeof FeatureGetParams>;

export function ahaFeatureGetTool(opts: AhaToolsOptions): AgentTool<typeof FeatureGetParams> {
  return {
    name: "aha_feature_get",
    label: "Aha!: get feature",
    description:
      "Fetch an Aha! feature by reference_num (e.g. APP-123) or numeric id. Returns name, description, status, assigned_to_user, release, and the web URL.",
    parameters: FeatureGetParams,
    executionMode: "sequential",
    execute: async (_id, params: FeatureGetP) => {
      const ref = parseAhaReference(params.id);
      if (!ref) {
        return {
          content: [{ type: "text", text: `Could not parse an Aha! reference from "${params.id}".` }],
          details: { error: "unparseable_id" },
          isError: true,
        };
      }
      const res = await ahaFetch(opts, `/api/v1/features/${encodeURIComponent(ref)}`);
      if (!res.ok) {
        return {
          content: [{ type: "text", text: `Aha! feature ${ref} fetch failed: HTTP ${res.status}\n${res.text.slice(0, 1500)}` }],
          details: { id: ref, status: res.status },
          isError: true,
        };
      }
      const feature = ((res.data as Record<string, unknown>) ?? {})["feature"] as
        | Record<string, unknown>
        | undefined;
      if (!feature) {
        return {
          content: [{ type: "text", text: `Aha! returned no feature payload for ${ref}.` }],
          details: { id: ref, status: res.status },
          isError: true,
        };
      }
      const name = String(feature["name"] ?? "(no name)");
      const refNum = String(feature["reference_num"] ?? ref);
      const status = ((feature["workflow_status"] as Record<string, unknown>) ?? {})["name"] ?? "?";
      const assignedTo =
        ((feature["assigned_to_user"] as Record<string, unknown>) ?? {})["name"] ?? null;
      const releaseName =
        ((feature["release"] as Record<string, unknown>) ?? {})["name"] ?? null;
      const descriptionBody =
        ((feature["description"] as Record<string, unknown>) ?? {})["body"] ?? "";
      const webUrl = feature["url"] ?? null;
      const summary = [
        `Aha! feature ${refNum} — ${name}`,
        `Status: ${status}`,
        assignedTo ? `Assigned to: ${assignedTo}` : "",
        releaseName ? `Release: ${releaseName}` : "",
        webUrl ? `URL: ${webUrl}` : "",
        "",
        String(descriptionBody).slice(0, 8000),
      ]
        .filter((line) => line !== "")
        .join("\n");
      return {
        content: [{ type: "text", text: summary }],
        details: {
          reference_num: refNum,
          name,
          status,
          assigned_to: assignedTo,
          release: releaseName,
          url: webUrl,
        },
      };
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// aha_release_get
// ──────────────────────────────────────────────────────────────────────────────

const ReleaseGetParams = Type.Object({
  id: Type.String({
    minLength: 1,
    description: "Aha! release reference_num (e.g. `REL-1`) or numeric id.",
  }),
});
type ReleaseGetP = Static<typeof ReleaseGetParams>;

export function ahaReleaseGetTool(opts: AhaToolsOptions): AgentTool<typeof ReleaseGetParams> {
  return {
    name: "aha_release_get",
    label: "Aha!: get release",
    description:
      "Fetch an Aha! release by reference_num or numeric id. Returns name, release_date, status, parking_lot flag, and web URL.",
    parameters: ReleaseGetParams,
    executionMode: "sequential",
    execute: async (_id, params: ReleaseGetP) => {
      const ref = parseAhaReference(params.id);
      if (!ref) {
        return {
          content: [{ type: "text", text: `Could not parse an Aha! reference from "${params.id}".` }],
          details: { error: "unparseable_id" },
          isError: true,
        };
      }
      const res = await ahaFetch(opts, `/api/v1/releases/${encodeURIComponent(ref)}`);
      if (!res.ok) {
        return {
          content: [{ type: "text", text: `Aha! release ${ref} fetch failed: HTTP ${res.status}\n${res.text.slice(0, 1500)}` }],
          details: { id: ref, status: res.status },
          isError: true,
        };
      }
      const release = ((res.data as Record<string, unknown>) ?? {})["release"] as
        | Record<string, unknown>
        | undefined;
      if (!release) {
        return {
          content: [{ type: "text", text: `Aha! returned no release payload for ${ref}.` }],
          details: { id: ref, status: res.status },
          isError: true,
        };
      }
      const name = String(release["name"] ?? "(no name)");
      const refNum = String(release["reference_num"] ?? ref);
      const releaseDate = release["release_date"] ?? null;
      const status = release["development_started_on"]
        ? "in development"
        : release["released_on"]
          ? "released"
          : "scheduled";
      const parkingLot = Boolean(release["parking_lot"]);
      const webUrl = release["url"] ?? null;
      const summary = [
        `Aha! release ${refNum} — ${name}`,
        releaseDate ? `Release date: ${releaseDate}` : "",
        `Status: ${status}${parkingLot ? " (parking lot)" : ""}`,
        webUrl ? `URL: ${webUrl}` : "",
      ]
        .filter((line) => line !== "")
        .join("\n");
      return {
        content: [{ type: "text", text: summary }],
        details: {
          reference_num: refNum,
          name,
          release_date: releaseDate,
          status,
          parking_lot: parkingLot,
          url: webUrl,
        },
      };
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// aha_feature_comment
// ──────────────────────────────────────────────────────────────────────────────

const FeatureCommentParams = Type.Object({
  id: Type.String({ minLength: 1, description: "Aha! feature reference_num or numeric id." }),
  body: Type.String({ minLength: 1, description: "Plain text comment body." }),
});
type FeatureCommentP = Static<typeof FeatureCommentParams>;

export function ahaFeatureCommentTool(
  opts: AhaToolsOptions,
): AgentTool<typeof FeatureCommentParams> {
  return {
    name: "aha_feature_comment",
    label: "Aha!: comment on feature",
    description:
      "Add a comment to an Aha! feature. The service-account identity authors the comment; the human requester is appended as an attribution footer.",
    parameters: FeatureCommentParams,
    executionMode: "sequential",
    execute: async (_id, params: FeatureCommentP) => {
      const ref = parseAhaReference(params.id);
      if (!ref) {
        return {
          content: [{ type: "text", text: `Could not parse an Aha! reference from "${params.id}".` }],
          details: { error: "unparseable_id" },
          isError: true,
        };
      }
      const html = `<p>${escapeHtml(params.body)}</p><p><em>— Requested by ${escapeHtml(opts.requestedBy())}</em></p>`;
      const res = await ahaFetch(opts, `/api/v1/features/${encodeURIComponent(ref)}/comments`, {
        method: "POST",
        body: { comment: { body: html } },
      });
      if (!res.ok) {
        return {
          content: [{ type: "text", text: `Aha! comment on ${ref} failed (HTTP ${res.status}):\n${res.text.slice(0, 1500)}` }],
          details: { id: ref, status: res.status },
          isError: true,
        };
      }
      const c = ((res.data as Record<string, unknown>) ?? {})["comment"] as
        | Record<string, unknown>
        | undefined;
      const commentId = c?.["id"] ?? null;
      return {
        content: [{ type: "text", text: `Added comment to Aha! feature ${ref} (comment id ${commentId ?? "?"}).` }],
        details: { id: ref, commentId },
      };
    },
  };
}

export function buildAhaTools(opts: AhaToolsOptions): AgentTool[] {
  return [
    ahaFeatureGetTool(opts),
    ahaReleaseGetTool(opts),
    ahaFeatureCommentTool(opts),
  ];
}
