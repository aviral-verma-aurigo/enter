import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adoPatAuth,
  adoQueryTool,
  adoWorkItemCommentTool,
  adoWorkItemCreateTool,
  adoWorkItemGetTool,
  adoWorkItemLinkPrTool,
  adoWorkItemLinkTool,
  adoWorkItemUpdateTool,
} from "@enter/core";

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

let fetchCalls: FetchCall[];
let respond: (call: FetchCall) => { status: number; body: unknown };

function setupFetch() {
  fetchCalls = [];
  respond = () => ({ status: 200, body: {} });
  vi.stubGlobal(
    "fetch",
    async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string }) => {
      const call: FetchCall = {
        url,
        method: init.method ?? "GET",
        headers: init.headers ?? {},
        body: init.body !== undefined ? JSON.parse(init.body) : undefined,
      };
      fetchCalls.push(call);
      const { status, body } = respond(call);
      const text = typeof body === "string" ? body : JSON.stringify(body);
      return {
        ok: status >= 200 && status < 300,
        status,
        async text() {
          return text;
        },
      } as unknown as Response;
    },
  );
}

const opts = {
  auth: adoPatAuth("test-pat"),
  orgUrl: "https://dev.azure.com/acme",
  requestedBy: () => "tester",
};

beforeEach(() => setupFetch());
afterEach(() => vi.unstubAllGlobals());

describe("ado_work_item_get", () => {
  it("calls the org-scoped REST URL with the right api-version", async () => {
    respond = () => ({
      status: 200,
      body: {
        id: 1234,
        fields: { "System.Title": "x", "System.WorkItemType": "Bug", "System.State": "Active" },
        _links: { html: { href: "https://dev.azure.com/acme/_workitems/edit/1234" } },
      },
    });
    const tool = adoWorkItemGetTool(opts);
    const r = await tool.execute("t1", { id: 1234 });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toMatch(/_apis\/wit\/workitems\/1234/);
    expect(fetchCalls[0]!.url).toContain("api-version=7.1");
    expect(fetchCalls[0]!.url).toContain("$expand=fields");
    expect(fetchCalls[0]!.headers["Authorization"]).toMatch(/^Basic /);
    expect(r.isError).toBeUndefined();
    expect(r.content[0]?.text).toContain("AB#1234");
  });

  it("returns isError on 404", async () => {
    respond = () => ({ status: 404, body: { message: "Not found" } });
    const tool = adoWorkItemGetTool(opts);
    const r = await tool.execute("t1", { id: 9999 });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("HTTP 404");
  });
});

describe("ado_work_item_create", () => {
  it("POSTs with $type in the path and JSON-Patch body including the title", async () => {
    respond = () => ({
      status: 200,
      body: { id: 42, fields: {}, _links: { html: { href: "url" } } },
    });
    const tool = adoWorkItemCreateTool(opts);
    await tool.execute("t1", {
      project: "Foo",
      type: "Bug",
      title: "Sample",
      description: "desc",
      assigned_to: "alice@x",
      tags: ["a", "b"],
    });
    const call = fetchCalls[0]!;
    expect(call.method).toBe("POST");
    expect(call.url).toContain("/Foo/_apis/wit/workitems/$Bug");
    expect(call.headers["Content-Type"]).toBe("application/json");
    const patch = call.body as Array<{ op: string; path: string; value: unknown }>;
    expect(patch[0]).toEqual({ op: "add", path: "/fields/System.Title", value: "Sample" });
    expect(patch.some((p) => p.path === "/fields/System.Description" && p.value === "desc")).toBe(true);
    expect(patch.some((p) => p.path === "/fields/System.AssignedTo" && p.value === "alice@x")).toBe(true);
    expect(patch.some((p) => p.path === "/fields/System.Tags" && p.value === "a; b")).toBe(true);
    expect(patch.some((p) => p.path === "/fields/System.History")).toBe(true);
  });

  it("translates field aliases like 'priority' to canonical names", async () => {
    respond = () => ({ status: 200, body: { id: 1, fields: {}, _links: {} } });
    const tool = adoWorkItemCreateTool(opts);
    await tool.execute("t1", {
      project: "P",
      type: "Task",
      title: "T",
      fields: { priority: 2, severity: "3 - Medium" },
    });
    const patch = fetchCalls[0]!.body as Array<{ path: string; value: unknown }>;
    expect(patch.some((p) => p.path === "/fields/Microsoft.VSTS.Common.Priority" && p.value === 2)).toBe(true);
    expect(patch.some((p) => p.path === "/fields/Microsoft.VSTS.Common.Severity" && p.value === "3 - Medium")).toBe(true);
  });
});

describe("ado_work_item_update", () => {
  it("PATCHes with json-patch+json content-type and replace-or-add ops", async () => {
    respond = () => ({ status: 200, body: { id: 1234 } });
    const tool = adoWorkItemUpdateTool(opts);
    await tool.execute("t1", { id: 1234, state: "Resolved", assigned_to: "bob@x" });
    const call = fetchCalls[0]!;
    expect(call.method).toBe("PATCH");
    expect(call.url).toMatch(/_apis\/wit\/workitems\/1234/);
    expect(call.headers["Content-Type"]).toBe("application/json-patch+json");
    const patch = call.body as Array<{ op: string; path: string; value: unknown }>;
    expect(patch.some((p) => p.path === "/fields/System.State" && p.value === "Resolved")).toBe(true);
    expect(patch.some((p) => p.path === "/fields/System.AssignedTo" && p.value === "bob@x")).toBe(true);
  });

  it("refuses an empty update", async () => {
    const tool = adoWorkItemUpdateTool(opts);
    const r = await tool.execute("t1", { id: 1234 });
    expect(r.isError).toBe(true);
    expect(fetchCalls).toHaveLength(0);
  });
});

describe("ado_work_item_comment", () => {
  it("project-scopes the comment endpoint and appends requester", async () => {
    respond = () => ({ status: 200, body: { id: 99 } });
    const tool = adoWorkItemCommentTool(opts);
    await tool.execute("t1", { id: 1234, project: "Foo", body: "hello" });
    const call = fetchCalls[0]!;
    expect(call.method).toBe("POST");
    expect(call.url).toContain("/Foo/_apis/wit/workItems/1234/comments");
    expect(call.url).toContain("api-version=7.1-preview.4");
    expect((call.body as { text: string }).text).toContain("hello");
    expect((call.body as { text: string }).text).toContain("— tester");
  });
});

describe("ado_work_item_link", () => {
  it("resolves friendly aliases to ADO link types", async () => {
    respond = () => ({ status: 200, body: {} });
    const tool = adoWorkItemLinkTool(opts);
    await tool.execute("t1", { id: 1, rel: "Parent", target_id: 2 });
    const patch = fetchCalls[0]!.body as Array<{ value: { rel: string; url: string } }>;
    expect(patch[0]!.value.rel).toBe("System.LinkTypes.Hierarchy-Reverse");
    expect(patch[0]!.value.url).toBe("https://dev.azure.com/acme/_apis/wit/workitems/2");
  });

  it("accepts literal ADO link types", async () => {
    respond = () => ({ status: 200, body: {} });
    const tool = adoWorkItemLinkTool(opts);
    await tool.execute("t1", { id: 1, rel: "System.LinkTypes.Related", target_id: 2 });
    const patch = fetchCalls[0]!.body as Array<{ value: { rel: string } }>;
    expect(patch[0]!.value.rel).toBe("System.LinkTypes.Related");
  });

  it("rejects unknown relation names without hitting the API", async () => {
    const tool = adoWorkItemLinkTool(opts);
    const r = await tool.execute("t1", { id: 1, rel: "Bogus", target_id: 2 });
    expect(r.isError).toBe(true);
    expect(fetchCalls).toHaveLength(0);
  });
});

describe("ado_work_item_link_pr", () => {
  it("adds a Hyperlink relation with the PR URL", async () => {
    respond = () => ({ status: 200, body: {} });
    const tool = adoWorkItemLinkPrTool(opts);
    await tool.execute("t1", { id: 1234, pr_url: "https://github.com/x/y/pull/1" });
    const patch = fetchCalls[0]!.body as Array<{ value: { rel: string; url: string } }>;
    expect(patch[0]!.value.rel).toBe("Hyperlink");
    expect(patch[0]!.value.url).toBe("https://github.com/x/y/pull/1");
  });
});

describe("ado_query (WIQL)", () => {
  it("two-step: WIQL then batch-fetch titles", async () => {
    let callIdx = 0;
    respond = (call) => {
      if (callIdx++ === 0) {
        return { status: 200, body: { workItems: [{ id: 1, url: "u1" }, { id: 2, url: "u2" }] } };
      }
      return {
        status: 200,
        body: {
          value: [
            { id: 1, fields: { "System.Title": "T1", "System.WorkItemType": "Bug", "System.State": "Active" } },
            { id: 2, fields: { "System.Title": "T2", "System.WorkItemType": "Task", "System.State": "Closed" } },
          ],
        },
      };
    };
    const tool = adoQueryTool(opts);
    const r = await tool.execute("t1", {
      wiql: "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Bug'",
      limit: 10,
    });
    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0]!.url).toContain("/_apis/wit/wiql");
    expect(fetchCalls[1]!.url).toContain("/_apis/wit/workitemsbatch");
    expect(r.content[0]?.text).toContain("AB#1");
    expect(r.content[0]?.text).toContain("AB#2");
  });

  it("returns 'No matching work items.' on empty result", async () => {
    respond = () => ({ status: 200, body: { workItems: [] } });
    const tool = adoQueryTool(opts);
    const r = await tool.execute("t1", {
      wiql: "SELECT [System.Id] FROM WorkItems WHERE [System.Id] = -1",
    });
    expect(r.content[0]?.text).toMatch(/no matching/i);
    expect(fetchCalls).toHaveLength(1); // no batch call
  });
});

describe("adoPatAuth", () => {
  it("produces a Basic header with empty username and the PAT", async () => {
    const a = adoPatAuth("mypat");
    const h = await a.getAuthHeader();
    expect(h).toMatch(/^Basic /);
    const decoded = Buffer.from(h.replace(/^Basic /, ""), "base64").toString("utf8");
    expect(decoded).toBe(":mypat");
  });
});
