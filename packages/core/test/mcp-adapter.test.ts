import { describe, expect, it, vi } from "vitest";
import { adaptMcpTool, mcpToolName } from "../src/mcp/adapter.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

describe("mcpToolName", () => {
  it("namespaces and slugifies", () => {
    expect(mcpToolName("sentry", "get-issue")).toBe("mcp_sentry_get_issue");
    expect(mcpToolName("Linear", "Create Ticket")).toBe("mcp_linear_create_ticket");
    expect(mcpToolName("notion", "search.docs")).toBe("mcp_notion_search_docs");
  });
  it("strips characters outside [a-z0-9_]", () => {
    expect(mcpToolName("my-server!", "foo@bar")).toBe("mcp_my_server_foo_bar");
  });
});

describe("adaptMcpTool", () => {
  function makeClient(callToolImpl: (...args: unknown[]) => Promise<unknown>): Client {
    return {
      callTool: vi.fn(callToolImpl),
    } as unknown as Client;
  }

  it("dispatches calls via client.callTool with the original MCP name", async () => {
    const callTool = vi.fn(async () => ({
      content: [{ type: "text", text: "ok" }],
    }));
    const client = { callTool } as unknown as Client;
    const tool = adaptMcpTool(
      "sentry",
      {
        name: "get_issue",
        description: "Fetch a Sentry issue.",
        inputSchema: { type: "object", properties: { id: { type: "string" } } },
      },
      client,
    );
    expect(tool.name).toBe("mcp_sentry_get_issue");
    expect(tool.label).toContain("sentry");
    expect(tool.description).toContain("Fetch a Sentry issue.");

    const result = await tool.execute("t1", { id: "ABC-1" });
    expect(callTool).toHaveBeenCalledWith({
      name: "get_issue",
      arguments: { id: "ABC-1" },
    });
    expect(result.content[0]).toEqual({ type: "text", text: "ok" });
    expect(result.isError).toBeUndefined();
  });

  it("propagates isError=true from the MCP result", async () => {
    const client = makeClient(async () => ({
      content: [{ type: "text", text: "boom" }],
      isError: true,
    }));
    const tool = adaptMcpTool(
      "sentry",
      { name: "broken", inputSchema: { type: "object" } },
      client,
    );
    const result = await tool.execute("t1", {});
    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({ type: "text", text: "boom" });
  });

  it("surfaces thrown errors as isError=true with a text message", async () => {
    const client = makeClient(async () => {
      throw new Error("network down");
    });
    const tool = adaptMcpTool(
      "sentry",
      { name: "get_issue", inputSchema: { type: "object" } },
      client,
    );
    const result = await tool.execute("t1", {});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("network down");
    expect(result.content[0]?.text).toContain("sentry/get_issue");
  });

  it("falls back to a generic description if MCP didn't provide one", async () => {
    const client = makeClient(async () => ({ content: [] }));
    const tool = adaptMcpTool(
      "unknown",
      { name: "thing", inputSchema: { type: "object" } },
      client,
    );
    expect(tool.description).toContain("Tool 'thing' from MCP server 'unknown'");
  });
});
