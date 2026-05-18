import type { TSchema } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool as McpTool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Sanitize the tool name MCP servers return so it fits the `^[a-z][a-z0-9_]*$`
 * shape Anthropic's API expects. Namespaced as `mcp_<server>_<tool>` so calls
 * from two MCP servers never collide.
 */
export function mcpToolName(serverName: string, mcpName: string): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);
  return `mcp_${slug(serverName)}_${slug(mcpName)}`;
}

/**
 * Adapt a single MCP tool descriptor into the AgentTool shape the Enter
 * runtime understands. `client` is the connected MCP client; calling the
 * returned tool dispatches over the existing JSON-RPC connection.
 */
export function adaptMcpTool(
  serverName: string,
  mcpTool: McpTool,
  client: Client,
): AgentTool {
  // MCP returns `inputSchema` as JSON Schema. Typebox's TSchema is structurally
  // a JSON Schema with a phantom Static<T> type tag — the agent runtime uses
  // it for validation, not for type inference here, so casting is safe.
  const parameters = (mcpTool.inputSchema ?? { type: "object", properties: {} }) as unknown as TSchema;

  return {
    name: mcpToolName(serverName, mcpTool.name),
    label: `MCP ${serverName}: ${mcpTool.name}`,
    description:
      (mcpTool.description ?? `Tool '${mcpTool.name}' from MCP server '${serverName}'.`) +
      `\n\n(Routed via MCP server '${serverName}'.)`,
    parameters,
    executionMode: "sequential",
    execute: async (_id, params) => {
      try {
        const result = (await client.callTool({
          name: mcpTool.name,
          arguments: (params ?? {}) as Record<string, unknown>,
        })) as CallToolResult;
        // CallToolResult.content is already in the (TextContent | ImageContent)[] shape
        // the agent runtime expects.
        const out: {
          content: { type: "text"; text: string }[];
          details: unknown;
          isError?: boolean;
        } = {
          content: (result.content ?? []) as { type: "text"; text: string }[],
          details: { server: serverName, mcpName: mcpTool.name, raw: result },
        };
        if (result.isError) out.isError = true;
        return out;
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `MCP call ${serverName}/${mcpTool.name} failed: ${(err as Error).message}`,
            },
          ],
          details: { server: serverName, mcpName: mcpTool.name, error: (err as Error).message },
          isError: true,
        };
      }
    },
  };
}
