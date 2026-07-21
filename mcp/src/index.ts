import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServiceRoleContext } from "./access/accessContext";
import { buildServer } from "./server";

/**
 * Phase 1 entrypoint: stdio transport for local Claude Code / Desktop. Phase 3
 * swaps StdioServerTransport for StreamableHTTPServerTransport + OAuth HERE —
 * buildServer() and every tool stay unchanged.
 */
async function main(): Promise<void> {
  const ctx = createServiceRoleContext(); // throws clearly if env is missing
  const server = buildServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the protocol channel on stdio — log only to stderr, and never
  // the service-role key (we log the actor label, not any secret).
  console.error(`[boardroom-mcp] connected via stdio as ${ctx.actor}`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[boardroom-mcp] fatal: ${message}`);
  process.exit(1);
});
