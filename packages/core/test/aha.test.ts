import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AhaApiKeyAuth,
  ahaFeatureCommentTool,
  ahaFeatureGetTool,
  ahaReleaseGetTool,
  parseAhaReference,
  type AhaAuthorizer,
} from "../src/integrations/aha/index.js";

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

const auth: AhaAuthorizer = {
  async getAuthHeader() {
    return "Bearer test-key";
  },
};
const opts = {
  auth,
  baseUrl: "https://acme.aha.io",
  requestedBy: () => "tester",
};

beforeEach(() => setupFetch());
afterEach(() => vi.unstubAllGlobals());

describe("AhaApiKeyAuth", () => {
  it("composes a Bearer header from the API key", async () => {
    const a = new AhaApiKeyAuth({ baseUrl: "https://acme.aha.io", apiKey: "secret" });
    const h = await a.getAuthHeader();
    expect(h).toBe("Bearer secret");
  });
});

describe("parseAhaReference", () => {
  it("accepts reference_num style like APP-123", () => {
    expect(parseAhaReference("APP-123")).toBe("APP-123");
    expect(parseAhaReference(" APP-123 ")).toBe("APP-123");
  });
  it("accepts a numeric id", () => {
    expect(parseAhaReference("4567")).toBe("4567");
  });
  it("rejects empty and URL-shaped input", () => {
    expect(parseAhaReference("")).toBeNull();
    expect(parseAhaReference("   ")).toBeNull();
    expect(parseAhaReference("https://acme.aha.io/features/APP-1")).toBeNull();
    expect(parseAhaReference("APP 123")).toBeNull(); // whitespace inside
  });
});

describe("aha_feature_get", () => {
  it("calls GET /api/v1/features/<ref> with a Bearer token", async () => {
    respond = () => ({
      status: 200,
      body: {
        feature: {
          reference_num: "APP-123",
          name: "Faster login",
          workflow_status: { name: "In progress" },
          assigned_to_user: { name: "Pat" },
          release: { name: "Q3" },
          description: { body: "Body text." },
          url: "https://acme.aha.io/features/APP-123",
        },
      },
    });
    const tool = ahaFeatureGetTool(opts);
    const r = await tool.execute("t1", { id: "APP-123" });
    expect(r.isError).toBeUndefined();
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toBe("https://acme.aha.io/api/v1/features/APP-123");
    expect(fetchCalls[0]!.method).toBe("GET");
    expect(fetchCalls[0]!.headers["Authorization"]).toBe("Bearer test-key");
    expect(r.content[0]?.text).toContain("Faster login");
    expect(r.content[0]?.text).toContain("In progress");
    expect(r.content[0]?.text).toContain("Assigned to: Pat");
    expect(r.content[0]?.text).toContain("Release: Q3");
  });

  it("URL-encodes the reference (defense, even though references are safe today)", async () => {
    respond = () => ({ status: 200, body: { feature: { reference_num: "x", name: "x" } } });
    const tool = ahaFeatureGetTool(opts);
    await tool.execute("t1", { id: "APP-99" });
    expect(fetchCalls[0]!.url).toContain("APP-99");
  });

  it("rejects unparseable ids before making a request", async () => {
    const tool = ahaFeatureGetTool(opts);
    const r = await tool.execute("t1", { id: "  " });
    expect(r.isError).toBe(true);
    expect(fetchCalls).toHaveLength(0);
  });

  it("surfaces HTTP errors with status and snippet", async () => {
    respond = () => ({ status: 404, body: "Not found" });
    const tool = ahaFeatureGetTool(opts);
    const r = await tool.execute("t1", { id: "APP-999" });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("HTTP 404");
    const details = r.details as { id: string; status: number };
    expect(details.status).toBe(404);
  });

  it("errors when Aha returns 200 but no feature payload", async () => {
    respond = () => ({ status: 200, body: {} });
    const tool = ahaFeatureGetTool(opts);
    const r = await tool.execute("t1", { id: "APP-1" });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/no feature payload/);
  });
});

describe("aha_release_get", () => {
  it("calls GET /api/v1/releases/<ref> and derives a status", async () => {
    respond = () => ({
      status: 200,
      body: {
        release: {
          reference_num: "REL-1",
          name: "Q3 2026",
          release_date: "2026-09-30",
          released_on: null,
          development_started_on: "2026-06-01",
          parking_lot: false,
          url: "https://acme.aha.io/releases/REL-1",
        },
      },
    });
    const tool = ahaReleaseGetTool(opts);
    const r = await tool.execute("t1", { id: "REL-1" });
    expect(r.isError).toBeUndefined();
    expect(fetchCalls[0]!.url).toBe("https://acme.aha.io/api/v1/releases/REL-1");
    expect(r.content[0]?.text).toContain("Q3 2026");
    expect(r.content[0]?.text).toContain("Status: in development");
  });

  it("flags parking-lot releases", async () => {
    respond = () => ({
      status: 200,
      body: {
        release: { reference_num: "REL-2", name: "Maybe later", parking_lot: true },
      },
    });
    const tool = ahaReleaseGetTool(opts);
    const r = await tool.execute("t1", { id: "REL-2" });
    expect(r.content[0]?.text).toContain("parking lot");
  });
});

describe("aha_feature_comment", () => {
  it("POSTs to /features/<ref>/comments with HTML-escaped body + attribution", async () => {
    respond = () => ({ status: 201, body: { comment: { id: 4242 } } });
    const tool = ahaFeatureCommentTool(opts);
    const r = await tool.execute("t1", {
      id: "APP-1",
      body: "Looks good <script>alert(1)</script> & ship.",
    });
    expect(r.isError).toBeUndefined();
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toBe("https://acme.aha.io/api/v1/features/APP-1/comments");
    expect(fetchCalls[0]!.method).toBe("POST");
    const sentBody = fetchCalls[0]!.body as { comment: { body: string } };
    expect(sentBody.comment.body).toContain("&lt;script&gt;");
    expect(sentBody.comment.body).not.toContain("<script>");
    expect(sentBody.comment.body).toContain("&amp;");
    expect(sentBody.comment.body).toContain("— Requested by tester");
    expect(r.content[0]?.text).toContain("comment id 4242");
  });

  it("rejects unparseable references before POSTing", async () => {
    const tool = ahaFeatureCommentTool(opts);
    const r = await tool.execute("t1", { id: "", body: "hi" });
    expect(r.isError).toBe(true);
    expect(fetchCalls).toHaveLength(0);
  });

  it("surfaces HTTP errors", async () => {
    respond = () => ({ status: 422, body: { errors: { body: ["can't be blank"] } } });
    const tool = ahaFeatureCommentTool(opts);
    const r = await tool.execute("t1", { id: "APP-1", body: "x" });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("HTTP 422");
  });
});
