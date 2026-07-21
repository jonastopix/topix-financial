import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SERVER_NAME, SERVER_VERSION } from "../version";
import { isAccessContext, type AccessContext } from "../access/accessContext";

export const PING_TOOL_NAME = "ping";

// Input schema as a Zod raw shape — the convention every future data tool will
// follow (RECON.md §5: explicit, validated inputs; never trust raw args).
export const pingInputSchema = {
  echo: z.string().optional().describe("Optional text echoed back in the reply"),
};

export interface PingResult {
  // Index signature makes this structurally assignable to the SDK's
  // CallToolResult (which carries `[x: string]: unknown`) while keeping
  // `content` strongly typed for the tests.
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
}

/**
 * Pure handler. Throws if invoked without a valid AccessContext, so ping can
 * never run outside the context layer. Exercised directly in tests.
 */
export function runPing(ctx: AccessContext, args: { echo?: string } = {}): PingResult {
  if (!isAccessContext(ctx)) {
    throw new Error("ping requires a valid AccessContext");
  }

  const payload = {
    server: SERVER_NAME,
    version: SERVER_VERSION,
    actor: ctx.actor,
    mode: ctx.mode,
    ...(args.echo !== undefined ? { echo: args.echo } : {}),
  };

  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

export function registerPing(server: McpServer, ctx: AccessContext): void {
  server.registerTool(
    PING_TOOL_NAME,
    {
      title: "Ping",
      description:
        "Health check: returns the server version and the calling actor from AccessContext.",
      inputSchema: pingInputSchema,
    },
    async (args) => runPing(ctx, args),
  );
}
