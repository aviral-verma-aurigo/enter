import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AtlassianTokenAuth,
  confluencePageAppendCommentTool,
  confluencePageGetTool,
  confluenceSearchTool,
  parseConfluencePageId,
  type AtlassianAuthorizer,
} from "../src/integrations/confluence/index.js";

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

const auth: AtlassianAuthorizer = {
  async getAuthHeader() {
    return "Basic dGVzdDp0b2tlbg=="; // base64("test:token")
  },
};
const opts = {
  auth,
  baseUrl: "https://acme.atlassian.net/wiki",
  requestedBy: () => "tester",
};

beforeEach(() => setupFetch());
afterEach(() => vi.unstubAllGlobals());

describe("AtlassianTokenAuth", () => {
  it("composes a Basic header from email + API token", async () => {
    const a = new AtlassianTokenAuth({
      baseUrl: "https://acme.atlassian.net/wiki",
      user: "bot@acme.com",
      token: "atoken",
    });
    const h = await a.getAuthHeader();
    expect(h.startsWith("Basic ")).toBe(true);
    const decoded = Buffer.from(h.replace(/^Basic /, ""), "base64").toString("utf8");
    expect(decoded).toBe("bot@acme.com:atoken");
  });
});

describe("parseConfluencePageId", () => {
  it("returns digits when given a numeric id", () => {
    expect(parseConfluencePageId("12345")).toBe("12345");
    expect(parseConfluencePageId(" 678 ")).toBe("678");
  });
  it("extracts id from a Confluence URL", () => {
    expect(
      parseConfluencePageId("https://acme.atlassian.net/wiki/spaces/X/pages/12345/Title-Slug"),
    ).toBe("12345");
  });
  it("returns null for unrecognized input", () => {
    expect(parseConfluencePageId("not-a-page")).toBeNull();
    expect(parseConfluencePageId("")).toBeNull();
  });
});

describe("confluence_page_get", () => {
  it("calls v2 pages endpoint with body-format=storage", async () => {
    respond = () => ({
      status: 200,
      body: {
        id: "1234",
        title: "Checkout PRD",
        body: { storage: { value: "<p>Hello <strong>world</strong></p>", representation: "storage" } },
        version: { number: 3 },
        _links: { webui: "/spaces/X/pages/1234/Checkout-PRD" },
      },
    });
    const tool = confluencePageGetTool(opts);
    const r = await tool.execute("t1", { id_or_url: "1234" });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toBe("https://acme.atlassian.net/wiki/api/v2/pages/1234?body-format=storage");
    expect(fetchCalls[0]!.headers["Authorization"]).toMatch(/^Basic /);
    expect(r.isError).toBeUndefined();
    expect(r.content[0]?.text).toContain("Checkout PRD");
    // Default format=text strips the <strong> tag
    expect(r.content[0]?.text).toContain("Hello world");
    expect(r.content[0]?.text).not.toContain("<strong>");
  });

  it("accepts a Confluence URL and parses the page id from it", async () => {
    respond = () => ({ status: 200, body: { id: "999", title: "x", body: { storage: { value: "" } }, version: { number: 1 } } });
    const tool = confluencePageGetTool(opts);
    await tool.execute("t1", {
      id_or_url: "https://acme.atlassian.net/wiki/spaces/A/pages/999/Some-Title",
    });
    expect(fetchCalls[0]!.url).toContain("/api/v2/pages/999");
  });

  it("format=storage returns raw markup", async () => {
    respond = () => ({
      status: 200,
      body: { id: "1", title: "t", body: { storage: { value: "<p>raw</p>" } }, version: { number: 1 } },
    });
    const tool = confluencePageGetTool(opts);
    const r = await tool.execute("t1", { id_or_url: "1", format: "storage" });
    expect(r.content[0]?.text).toContain("<p>raw</p>");
  });

  it("returns isError when the page id can't be parsed", async () => {
    const tool = confluencePageGetTool(opts);
    const r = await tool.execute("t1", { id_or_url: "https://wrong/url/with-no-page-id" });
    expect(r.isError).toBe(true);
    expect(fetchCalls).toHaveLength(0);
  });

  it("returns isError on 404", async () => {
    respond = () => ({ status: 404, body: { message: "Not Found" } });
    const tool = confluencePageGetTool(opts);
    const r = await tool.execute("t1", { id_or_url: "999" });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("HTTP 404");
  });
});

describe("confluence_search (CQL)", () => {
  it("calls v1 content/search with URL-encoded CQL and limit", async () => {
    respond = () => ({
      status: 200,
      body: {
        results: [
          { id: "1", title: "P1", type: "page", space: { key: "PROD" } },
          { id: "2", title: "P2", type: "page", space: { key: "PROD" } },
        ],
        size: 2,
      },
    });
    const tool = confluenceSearchTool(opts);
    const r = await tool.execute("t1", { cql: "title ~ \"checkout\"", limit: 5 });
    expect(fetchCalls[0]!.url).toContain("/rest/api/content/search?cql=");
    expect(fetchCalls[0]!.url).toContain("limit=5");
    // Encoded query must contain the encoded title and operator
    expect(fetchCalls[0]!.url).toMatch(/cql=title%20~/);
    expect(r.content[0]?.text).toContain("PROD · #1 — P1");
    expect(r.content[0]?.text).toContain("PROD · #2 — P2");
  });

  it("returns 'No matching' when results are empty", async () => {
    respond = () => ({ status: 200, body: { results: [], size: 0 } });
    const tool = confluenceSearchTool(opts);
    const r = await tool.execute("t1", { cql: "title=\"nope\"" });
    expect(r.content[0]?.text).toMatch(/no matching/i);
  });
});

describe("confluence_page_append_comment", () => {
  it("POSTs to v2 footer-comments with storage representation and attribution footer", async () => {
    respond = () => ({ status: 200, body: { id: 42 } });
    const tool = confluencePageAppendCommentTool(opts);
    const r = await tool.execute("t1", {
      page_id_or_url: "1234",
      body: "Looks good to me.",
    });
    expect(fetchCalls[0]!.method).toBe("POST");
    expect(fetchCalls[0]!.url).toContain("/api/v2/footer-comments");
    const sent = fetchCalls[0]!.body as { pageId: string; body: { representation: string; value: string } };
    expect(sent.pageId).toBe("1234");
    expect(sent.body.representation).toBe("storage");
    expect(sent.body.value).toContain("Looks good to me.");
    expect(sent.body.value).toContain("— Requested by tester");
    expect(r.isError).toBeUndefined();
  });

  it("HTML-escapes the comment body", async () => {
    respond = () => ({ status: 200, body: { id: 1 } });
    const tool = confluencePageAppendCommentTool(opts);
    await tool.execute("t1", {
      page_id_or_url: "1234",
      body: "Beware <script>alert('xss')</script>",
    });
    const sent = fetchCalls[0]!.body as { body: { value: string } };
    expect(sent.body.value).not.toContain("<script>");
    expect(sent.body.value).toContain("&lt;script&gt;");
  });

  it("rejects unparseable page ids", async () => {
    const tool = confluencePageAppendCommentTool(opts);
    const r = await tool.execute("t1", { page_id_or_url: "not-a-page", body: "x" });
    expect(r.isError).toBe(true);
    expect(fetchCalls).toHaveLength(0);
  });
});
