import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SERVER_NAME, SERVER_VERSION } from "./version";
import { registerPing } from "./tools/ping";
import type { AccessContext } from "./access/accessContext";

/**
 * Builds the MCP server and registers all tools against the given context.
 * Transport is intentionally NOT chosen here (see index.ts): swapping stdio for
 * Streamable HTTP in phase 3 does not touch this function or any tool.
 */
export function buildServer(ctx: AccessContext): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerPing(server, ctx);
  return server;
}
