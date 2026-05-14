import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AdoAuthorizer } from "./auth.js";

const API_VERSION = "7.1";

export interface AdoToolsOptions {
  /** Anything implementing `getAuthHeader(): Promise<string>` — service principal in prod, PAT shim for CLI/local use. */
  auth: AdoAuthorizer;
  /** e.g. "https://dev.azure.com/your-org" — no trailing slash, no project. */
  orgUrl: string;
  /** Called for each tool with the human requester for attribution. */
  requestedBy: () => string;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

async function adoFetch(
  options: AdoToolsOptions,
  path: string,
  init: { method?: string; body?: unknown; project?: string } = {},
): Promise<{ ok: boolean; status: number; data: unknown; text: string }> {
  const authHeader = await options.auth.getAuthHeader();
  const base = init.project
    ? joinUrl(options.orgUrl, encodeURIComponent(init.project))
    : options.orgUrl;
  const url = joinUrl(base, path);
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init.body !== undefined
        ? {
            "Content-Type":
              init.method === "PATCH" ? "application/json-patch+json" : "application/json",
          }
        : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    // non-JSON response (e.g., HTML error page) — keep `text` for diagnostics
  }
  return { ok: res.ok, status: res.status, data, text };
}

const WorkItemGetParams = Type.Object({
  id: Type.Integer({ minimum: 1, description: "Work item ID (e.g. 1234 from AB#1234)." }),
  expand: Type.Optional(
    Type.Union(
      [Type.Literal("none"), Type.Literal("relations"), Type.Literal("fields"), Type.Literal("all")],
      { description: "Expand relations/fields. Default 'fields'." },
    ),
  ),
});
type WorkItemGetP = Static<typeof WorkItemGetParams>;

export function adoWorkItemGetTool(opts: AdoToolsOptions): AgentTool<typeof WorkItemGetParams> {
  return {
    name: "ado_work_item_get",
    label: "ADO: get work item",
    description:
      "Fetch an Azure DevOps work item by ID. Returns title, type, state, assigned to, description, acceptance criteria, and (optionally) relations.",
    parameters: WorkItemGetParams,
    executionMode: "sequential",
    execute: async (_id, params: WorkItemGetP) => {
      const expand = params.expand ?? "fields";
      const res = await adoFetch(
        opts,
        `_apis/wit/workitems/${params.id}?$expand=${expand}&api-version=${API_VERSION}`,
      );
      if (!res.ok) {
        return {
          content: [{ type: "text", text: `ADO work item ${params.id} fetch failed: HTTP ${res.status}\n${res.text.slice(0, 1500)}` }],
          details: { id: params.id, status: res.status },
          isError: true,
        };
      }
      const wi = (res.data ?? {}) as Record<string, unknown>;
      const fields = (wi["fields"] as Record<string, unknown>) ?? {};
      const summary = [
        `AB#${params.id} — ${fields["System.WorkItemType"] ?? "?"} — ${fields["System.Title"] ?? "(no title)"}`,
        `State: ${fields["System.State"] ?? "?"}`,
        `Assigned to: ${(fields["System.AssignedTo"] as { displayName?: string })?.displayName ?? "unassigned"}`,
        `URL: ${(wi["_links"] as { html?: { href?: string } })?.html?.href ?? "(no link)"}`,
      ];
      const desc = String(fields["System.Description"] ?? "").replace(/<[^>]+>/g, " ").trim();
      if (desc) summary.push("", "Description:", desc.slice(0, 2000));
      const ac = String(fields["Microsoft.VSTS.Common.AcceptanceCriteria"] ?? "")
        .replace(/<[^>]+>/g, " ")
        .trim();
      if (ac) summary.push("", "Acceptance criteria:", ac.slice(0, 1500));
      return {
        content: [{ type: "text", text: summary.join("\n") }],
        details: { id: params.id, fields, url: (wi["_links"] as { html?: { href?: string } })?.html?.href ?? null },
      };
    },
  };
}

const WorkItemCommentParams = Type.Object({
  id: Type.Integer({ minimum: 1 }),
  project: Type.String({ minLength: 1, description: "ADO project name (comments are project-scoped)." }),
  body: Type.String({ minLength: 1, description: "Comment body. Plain text or limited HTML." }),
});
type WorkItemCommentP = Static<typeof WorkItemCommentParams>;

export function adoWorkItemCommentTool(opts: AdoToolsOptions): AgentTool<typeof WorkItemCommentParams> {
  return {
    name: "ado_work_item_comment",
    label: "ADO: comment on work item",
    description:
      "Add a comment to an ADO work item. The bot/CLI identity authors the comment; the human requester is appended as attribution.",
    parameters: WorkItemCommentParams,
    executionMode: "sequential",
    execute: async (_id, params: WorkItemCommentP) => {
      const body = `${params.body}\n\n— ${opts.requestedBy()}`;
      const res = await adoFetch(
        opts,
        `_apis/wit/workItems/${params.id}/comments?api-version=${API_VERSION}-preview.4`,
        { method: "POST", body: { text: body }, project: params.project },
      );
      if (!res.ok) {
        return {
          content: [{ type: "text", text: `ADO comment failed (HTTP ${res.status}):\n${res.text.slice(0, 1500)}` }],
          details: { id: params.id, status: res.status },
          isError: true,
        };
      }
      const c = (res.data ?? {}) as Record<string, unknown>;
      return {
        content: [{ type: "text", text: `Commented on AB#${params.id} (id=${c["id"] ?? "?"})` }],
        details: { id: params.id, commentId: c["id"] },
      };
    },
  };
}

const WorkItemLinkPrParams = Type.Object({
  id: Type.Integer({ minimum: 1 }),
  pr_url: Type.String({ description: "Pull request URL. Any GitHub/ADO/Bitbucket PR URL is fine." }),
  comment: Type.Optional(Type.String({ description: "Optional note recorded with the link." })),
});
type WorkItemLinkPrP = Static<typeof WorkItemLinkPrParams>;

export function adoWorkItemLinkPrTool(opts: AdoToolsOptions): AgentTool<typeof WorkItemLinkPrParams> {
  return {
    name: "ado_work_item_link_pr",
    label: "ADO: link PR to work item",
    description:
      "Attach a pull-request URL as a Hyperlink relation on an ADO work item. Use after `github_pr_open` to back-link the PR into the work item it implements.",
    parameters: WorkItemLinkPrParams,
    executionMode: "sequential",
    execute: async (_id, params: WorkItemLinkPrP) => {
      const patch = [
        {
          op: "add",
          path: "/relations/-",
          value: {
            rel: "Hyperlink",
            url: params.pr_url,
            attributes: { comment: params.comment ?? `PR opened — ${opts.requestedBy()}` },
          },
        },
      ];
      const res = await adoFetch(opts, `_apis/wit/workitems/${params.id}?api-version=${API_VERSION}`, {
        method: "PATCH",
        body: patch,
      });
      if (!res.ok) {
        return {
          content: [{ type: "text", text: `ADO link-PR failed (HTTP ${res.status}):\n${res.text.slice(0, 1500)}` }],
          details: { id: params.id, status: res.status },
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: `Linked ${params.pr_url} to AB#${params.id}.` }],
        details: { id: params.id, prUrl: params.pr_url },
      };
    },
  };
}

const QueryParams = Type.Object({
  wiql: Type.String({
    minLength: 10,
    description: "WIQL query, e.g. \"SELECT [System.Id], [System.Title] FROM WorkItems WHERE [System.State] = 'Active'\".",
  }),
  project: Type.Optional(Type.String({ description: "Optional project scope; project-level WIQL." })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
});
type QueryP = Static<typeof QueryParams>;

export function adoQueryTool(opts: AdoToolsOptions): AgentTool<typeof QueryParams> {
  return {
    name: "ado_query",
    label: "ADO: WIQL query",
    description:
      "Run a Work Item Query Language (WIQL) query against ADO. Returns matching work-item IDs and titles. Use `ado_work_item_get` to fetch full details.",
    parameters: QueryParams,
    executionMode: "sequential",
    execute: async (_id, params: QueryP) => {
      const limit = params.limit ?? 50;
      const path = params.project
        ? `${encodeURIComponent(params.project)}/_apis/wit/wiql?api-version=${API_VERSION}&$top=${limit}`
        : `_apis/wit/wiql?api-version=${API_VERSION}&$top=${limit}`;
      const res = await adoFetch(opts, path, { method: "POST", body: { query: params.wiql } });
      if (!res.ok) {
        return {
          content: [{ type: "text", text: `WIQL query failed (HTTP ${res.status}):\n${res.text.slice(0, 1500)}` }],
          details: { status: res.status },
          isError: true,
        };
      }
      const data = (res.data ?? {}) as { workItems?: Array<{ id: number; url: string }> };
      const items = data.workItems ?? [];
      if (items.length === 0) {
        return {
          content: [{ type: "text", text: "No matching work items." }],
          details: { count: 0 },
        };
      }
      const ids = items.slice(0, limit).map((i) => i.id);
      const batchPath = `_apis/wit/workitemsbatch?api-version=${API_VERSION}`;
      const batchRes = await adoFetch(opts, batchPath, {
        method: "POST",
        body: { ids, fields: ["System.Id", "System.Title", "System.WorkItemType", "System.State"] },
      });
      const fetched =
        (batchRes.data as { value?: Array<{ id: number; fields: Record<string, unknown> }> })?.value ?? [];
      const lines = fetched.map(
        (w) =>
          `AB#${w.id} [${String(w.fields["System.WorkItemType"] ?? "?")}/${String(
            w.fields["System.State"] ?? "?",
          )}] ${String(w.fields["System.Title"] ?? "")}`,
      );
      return {
        content: [{ type: "text", text: `${items.length} match(es):\n${lines.join("\n")}` }],
        details: { count: items.length, ids },
      };
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Field & relation aliases (user-friendly → canonical ADO names)
// ──────────────────────────────────────────────────────────────────────────────

const FIELD_ALIASES: Record<string, string> = {
  title: "System.Title",
  description: "System.Description",
  state: "System.State",
  reason: "System.Reason",
  assigned_to: "System.AssignedTo",
  area_path: "System.AreaPath",
  iteration_path: "System.IterationPath",
  priority: "Microsoft.VSTS.Common.Priority",
  severity: "Microsoft.VSTS.Common.Severity",
  tags: "System.Tags",
  acceptance_criteria: "Microsoft.VSTS.Common.AcceptanceCriteria",
};

function resolveFieldName(key: string): string {
  return FIELD_ALIASES[key.toLowerCase().replace(/\s+/g, "_")] ?? key;
}

const LINK_TYPE_ALIASES: Record<string, string> = {
  parent: "System.LinkTypes.Hierarchy-Reverse",
  child: "System.LinkTypes.Hierarchy-Forward",
  related: "System.LinkTypes.Related",
  successor: "System.LinkTypes.Dependency-Forward",
  predecessor: "System.LinkTypes.Dependency-Reverse",
  tests: "Microsoft.VSTS.Common.TestedBy-Reverse",
  tested_by: "Microsoft.VSTS.Common.TestedBy-Forward",
  duplicate_of: "System.LinkTypes.Duplicate-Forward",
  duplicate: "System.LinkTypes.Duplicate-Reverse",
};

function resolveLinkType(rel: string): string | null {
  const norm = rel.trim().toLowerCase().replace(/\s+/g, "_");
  if (LINK_TYPE_ALIASES[norm]) return LINK_TYPE_ALIASES[norm];
  if (rel.startsWith("System.") || rel.startsWith("Microsoft.")) return rel;
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// ado_work_item_create
// ──────────────────────────────────────────────────────────────────────────────

const WorkItemCreateParams = Type.Object({
  project: Type.String({ minLength: 1, description: "ADO project name." }),
  type: Type.String({
    minLength: 1,
    description: "Work item type, e.g. 'Bug', 'Task', 'User Story', 'Epic', 'Feature'.",
  }),
  title: Type.String({ minLength: 1, maxLength: 256 }),
  description: Type.Optional(Type.String()),
  assigned_to: Type.Optional(Type.String({ description: "User email or display name." })),
  area_path: Type.Optional(Type.String()),
  iteration_path: Type.Optional(Type.String()),
  tags: Type.Optional(Type.Array(Type.String())),
  fields: Type.Optional(
    Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()]), {
      description:
        "Additional fields by canonical name (e.g. 'Microsoft.VSTS.Common.Priority'). Aliases like 'priority', 'severity', 'acceptance_criteria' are also accepted.",
    }),
  ),
});

type WorkItemCreateP = Static<typeof WorkItemCreateParams>;

export function adoWorkItemCreateTool(opts: AdoToolsOptions): AgentTool<typeof WorkItemCreateParams> {
  return {
    name: "ado_work_item_create",
    label: "ADO: create work item",
    description:
      "Create a new ADO work item. Specify project, type (Bug/Task/User Story/Epic/Feature/etc.), and at minimum a title. Optional convenience: description, assigned_to, area_path, iteration_path, tags. For other fields use the `fields` map (aliases like 'priority' accepted).",
    parameters: WorkItemCreateParams,
    executionMode: "sequential",
    execute: async (_id, params: WorkItemCreateP) => {
      const patch: Array<{ op: "add"; path: string; value: unknown }> = [
        { op: "add", path: "/fields/System.Title", value: params.title },
      ];
      if (params.description) patch.push({ op: "add", path: "/fields/System.Description", value: params.description });
      if (params.assigned_to) patch.push({ op: "add", path: "/fields/System.AssignedTo", value: params.assigned_to });
      if (params.area_path) patch.push({ op: "add", path: "/fields/System.AreaPath", value: params.area_path });
      if (params.iteration_path) patch.push({ op: "add", path: "/fields/System.IterationPath", value: params.iteration_path });
      if (params.tags && params.tags.length > 0) {
        patch.push({ op: "add", path: "/fields/System.Tags", value: params.tags.join("; ") });
      }
      patch.push({
        op: "add",
        path: "/fields/System.History",
        value: `<i>Created by ${opts.requestedBy()}</i>`,
      });
      if (params.fields) {
        for (const [k, v] of Object.entries(params.fields)) {
          patch.push({ op: "add", path: `/fields/${resolveFieldName(k)}`, value: v });
        }
      }
      const path = `${encodeURIComponent(params.project)}/_apis/wit/workitems/$${encodeURIComponent(
        params.type,
      )}?api-version=${API_VERSION}`;
      const res = await adoFetch(opts, path, { method: "POST", body: patch });
      if (!res.ok) {
        return {
          content: [{ type: "text", text: `ADO create failed (HTTP ${res.status}):\n${res.text.slice(0, 1500)}` }],
          details: { status: res.status },
          isError: true,
        };
      }
      const wi = (res.data ?? {}) as Record<string, unknown>;
      const newId = Number(wi["id"] ?? 0);
      const url = (wi["_links"] as { html?: { href?: string } })?.html?.href ?? null;
      return {
        content: [{ type: "text", text: `Created AB#${newId} (${params.type}) — ${url ?? "no link"}` }],
        details: { id: newId, url, type: params.type, project: params.project },
      };
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// ado_work_item_update
// ──────────────────────────────────────────────────────────────────────────────

const WorkItemUpdateParams = Type.Object({
  id: Type.Integer({ minimum: 1 }),
  state: Type.Optional(
    Type.String({ description: "Convenience: sets System.State. E.g., 'Active', 'Resolved', 'Closed'." }),
  ),
  assigned_to: Type.Optional(
    Type.String({ description: "Convenience: sets System.AssignedTo (email or display name)." }),
  ),
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 256, description: "Convenience: sets System.Title." })),
  fields: Type.Optional(
    Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()]), {
      description: "Additional fields to set by canonical name. Aliases like 'priority' are accepted.",
    }),
  ),
  comment: Type.Optional(
    Type.String({ description: "Optional history/discussion entry recorded with the update." }),
  ),
});

type WorkItemUpdateP = Static<typeof WorkItemUpdateParams>;

export function adoWorkItemUpdateTool(opts: AdoToolsOptions): AgentTool<typeof WorkItemUpdateParams> {
  return {
    name: "ado_work_item_update",
    label: "ADO: update work item",
    description:
      "Patch fields on an existing ADO work item. Convenience args: state, assigned_to, title. For arbitrary fields use the `fields` map. Some state transitions require additional fields (e.g. closing a Bug may require a Resolution) — the tool surfaces ADO's error verbatim if so.",
    parameters: WorkItemUpdateParams,
    executionMode: "sequential",
    execute: async (_id, params: WorkItemUpdateP) => {
      const replacements: Record<string, string | number> = {};
      if (params.state !== undefined) replacements["System.State"] = params.state;
      if (params.assigned_to !== undefined) replacements["System.AssignedTo"] = params.assigned_to;
      if (params.title !== undefined) replacements["System.Title"] = params.title;
      if (params.fields) {
        for (const [k, v] of Object.entries(params.fields)) {
          replacements[resolveFieldName(k)] = v;
        }
      }
      if (Object.keys(replacements).length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "Nothing to update — supply at least one of state/assigned_to/title/fields.",
            },
          ],
          details: { error: "no_fields" },
          isError: true,
        };
      }
      const patch: Array<{ op: "add"; path: string; value: unknown }> = Object.entries(replacements).map(
        ([k, v]) => ({ op: "add" as const, path: `/fields/${k}`, value: v }),
      );
      const note = params.comment
        ? `${params.comment}\n\n— ${opts.requestedBy()}`
        : `Updated by ${opts.requestedBy()}`;
      patch.push({ op: "add", path: "/fields/System.History", value: note });

      const res = await adoFetch(opts, `_apis/wit/workitems/${params.id}?api-version=${API_VERSION}`, {
        method: "PATCH",
        body: patch,
      });
      if (!res.ok) {
        return {
          content: [{ type: "text", text: `ADO update failed (HTTP ${res.status}):\n${res.text.slice(0, 1500)}` }],
          details: { id: params.id, status: res.status },
          isError: true,
        };
      }
      const summary = Object.entries(replacements)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      return {
        content: [{ type: "text", text: `Updated AB#${params.id}: ${summary}` }],
        details: { id: params.id, changes: replacements },
      };
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// ado_work_item_link (typed work-item ↔ work-item relation)
// ──────────────────────────────────────────────────────────────────────────────

const WorkItemLinkParams = Type.Object({
  id: Type.Integer({ minimum: 1, description: "Source work item ID." }),
  rel: Type.String({
    description:
      "Relation type. Friendly: 'Parent', 'Child', 'Related', 'Successor', 'Predecessor', 'Tests', 'Tested By', 'Duplicate Of', 'Duplicate'. Or literal ADO link type, e.g. 'System.LinkTypes.Hierarchy-Forward'.",
  }),
  target_id: Type.Integer({ minimum: 1, description: "Target work item ID." }),
  comment: Type.Optional(Type.String({ description: "Optional note recorded with the link." })),
});

type WorkItemLinkP = Static<typeof WorkItemLinkParams>;

export function adoWorkItemLinkTool(opts: AdoToolsOptions): AgentTool<typeof WorkItemLinkParams> {
  return {
    name: "ado_work_item_link",
    label: "ADO: link work items",
    description:
      "Add a typed relation between two ADO work items. Use 'Parent'/'Child' for hierarchy, 'Related', 'Successor'/'Predecessor' for dependency, 'Tests'/'Tested By' for test traceability, 'Duplicate Of'/'Duplicate'. Distinct from `ado_work_item_link_pr` (which links a PR URL).",
    parameters: WorkItemLinkParams,
    executionMode: "sequential",
    execute: async (_id, params: WorkItemLinkP) => {
      const linkType = resolveLinkType(params.rel);
      if (!linkType) {
        return {
          content: [
            {
              type: "text",
              text: `Unknown relation '${params.rel}'. Use Parent/Child/Related/Successor/Predecessor/Tests/Tested By/Duplicate Of/Duplicate, or a literal ADO link type.`,
            },
          ],
          details: { error: "unknown_relation", rel: params.rel },
          isError: true,
        };
      }
      const targetUrl = `${opts.orgUrl.replace(/\/$/, "")}/_apis/wit/workitems/${params.target_id}`;
      const patch = [
        {
          op: "add",
          path: "/relations/-",
          value: {
            rel: linkType,
            url: targetUrl,
            attributes: { comment: params.comment ?? `Linked by ${opts.requestedBy()}` },
          },
        },
      ];
      const res = await adoFetch(opts, `_apis/wit/workitems/${params.id}?api-version=${API_VERSION}`, {
        method: "PATCH",
        body: patch,
      });
      if (!res.ok) {
        return {
          content: [{ type: "text", text: `ADO link failed (HTTP ${res.status}):\n${res.text.slice(0, 1500)}` }],
          details: { status: res.status },
          isError: true,
        };
      }
      return {
        content: [
          { type: "text", text: `Linked AB#${params.id} -[${params.rel}]-> AB#${params.target_id}.` },
        ],
        details: { from: params.id, to: params.target_id, rel: linkType },
      };
    },
  };
}

export function buildAdoTools(opts: AdoToolsOptions): AgentTool[] {
  return [
    adoWorkItemGetTool(opts),
    adoQueryTool(opts),
    adoWorkItemCreateTool(opts),
    adoWorkItemUpdateTool(opts),
    adoWorkItemCommentTool(opts),
    adoWorkItemLinkTool(opts),
    adoWorkItemLinkPrTool(opts),
  ];
}
