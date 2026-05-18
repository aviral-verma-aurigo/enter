import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { logger } from "../util/logger.js";
import { adaptMcpTool } from "./adapter.js";
import type { McpServerConfig, McpServersConfig } from "./config.js";

export interface McpClientHandle {
  serverName: string;
  client: Client;
  transport: StdioClientTransport;
  tools: AgentTool[];
}

/**
 * Bring up an MCP server, list its tools, return adapted tools.
 *
 * Each MCP server is spawned as a child process over stdio. Failures during
 * connect or listTools are logged and produce an empty tools array — one
 * misconfigured server doesn't block the others from registering.
 */
export async function connectMcpServer(
  serverName: string,
  config: McpServerConfig,
): Promise<McpClientHandle | null> {
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args ?? [],
    ...(config.env ? { env: config.env } : {}),
    stderr: "pipe",
  });
  const client = new Client({ name: "enter", version: "0.1.0" });

  try {
    await client.connect(transport);
  } catch (err) {
    logger.warn("MCP server failed to connect", {
      serverName,
      command: config.command,
      error: (err as Error).message,
    });
    return null;
  }

  let mcpTools: AgentTool[] = [];
  try {
    const listed = await client.listTools();
    mcpTools = (listed.tools ?? []).map((t) => adaptMcpTool(serverName, t, client));
    logger.info("Registered MCP tools", {
      serverName,
      count: mcpTools.length,
      names: mcpTools.map((t) => t.name),
    });
  } catch (err) {
    logger.warn("MCP listTools failed", {
      serverName,
      error: (err as Error).message,
    });
  }

  return { serverName, client, transport, tools: mcpTools };
}

export class McpClientManager {
  private readonly handles: McpClientHandle[] = [];

  /**
   * Connect every configured server in parallel. Returns the flat list of
   * adapted AgentTools across all servers.
   */
  async start(servers: McpServersConfig): Promise<AgentTool[]> {
    const entries = Object.entries(servers ?? {});
    if (entries.length === 0) return [];

    const results = await Promise.all(
      entries.map(([name, cfg]) => connectMcpServer(name, cfg)),
    );
    for (const handle of results) {
      if (handle) this.handles.push(handle);
    }
    return this.handles.flatMap((h) => h.tools);
  }

  /** Shut down every connected server. Safe to call multiple times. */
  async stop(): Promise<void> {
    await Promise.all(
      this.handles.map(async (h) => {
        try {
          await h.client.close();
        } catch (err) {
          logger.debug("MCP client.close threw (ignored)", {
            serverName: h.serverName,
            error: (err as Error).message,
          });
        }
      }),
    );
    this.handles.length = 0;
  }

  get connected(): readonly McpClientHandle[] {
    return this.handles;
  }
}
